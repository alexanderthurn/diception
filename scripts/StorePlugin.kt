package com.feuerware.diception

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability

private const val TAG = "StorePlugin"
private const val PRODUCT_ID = "full_version"
private const val AD_UNIT_TEST = "ca-app-pub-3940256099942544/5224354917"
private const val AD_UNIT_PROD = "ca-app-pub-1776202225804421/5831073456"

private const val BILLING_RETRY_MIN_MS = 1_000L
private const val BILLING_RETRY_MAX_MS = 60_000L
private const val AD_RETRY_MIN_MS = 5_000L
private const val AD_RETRY_MAX_MS = 120_000L
private const val BILLING_WAIT_MS = 500L
private const val BILLING_WAIT_RETRIES = 20 // ~10s of waiting for the billing connection

/**
 * Google Play billing + AdMob rewarded ads, exposed to the web layer as Tauri commands.
 *
 * Every command resolves its Invoke on every path — an unresolved Invoke leaves the JS
 * promise pending forever and the calling button disabled until the app restarts.
 */
@TauriPlugin
class StorePlugin(activity: Activity) : Plugin(activity) {

    private val act = activity
    private val mainHandler = Handler(Looper.getMainLooper())

    private var billingClient: BillingClient? = null
    private var billingReady = false
    private var billingRetryMs = BILLING_RETRY_MIN_MS
    private var pendingPurchaseInvoke: Invoke? = null

    private var gmsAvailable = false
    private var rewardedAd: RewardedAd? = null
    private var adLoading = false
    private var adRetryMs = AD_RETRY_MIN_MS
    private var pendingAdInvoke: Invoke? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun load(webView: WebView) {
        super.load(webView)
        gmsAvailable = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(act) == ConnectionResult.SUCCESS
        Log.d(TAG, "load() gmsAvailable=$gmsAvailable")

        billingClient = BillingClient.newBuilder(act)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .setListener(purchasesListener)
            .build()
        connectBilling()

        if (gmsAvailable) {
            // initialize() does disk and network I/O — keep it off the UI thread.
            Thread { MobileAds.initialize(act) { mainHandler.post { loadRewardedAd() } } }.start()
        }
    }

    // ── Billing connection ────────────────────────────────────────────────────

    private fun connectBilling() {
        val client = billingClient ?: return
        if (client.isReady) return
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(r: BillingResult) {
                billingReady = r.responseCode == BillingClient.BillingResponseCode.OK
                Log.d(TAG, "billing setup: code=${r.responseCode} ready=$billingReady")
                if (billingReady) {
                    billingRetryMs = BILLING_RETRY_MIN_MS
                    acknowledgeOwnedPurchases()
                } else {
                    scheduleBillingRetry()
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.d(TAG, "billing disconnected")
                billingReady = false
                scheduleBillingRetry()
            }
        })
    }

    private fun scheduleBillingRetry() {
        val delay = billingRetryMs
        billingRetryMs = (billingRetryMs * 2).coerceAtMost(BILLING_RETRY_MAX_MS)
        mainHandler.postDelayed({ connectBilling() }, delay)
    }

    /**
     * Runs [action] as soon as billing is connected, or with `false` after ~10s of waiting.
     * The startup entitlement sync and the price lookup both fire while the connection is still
     * coming up, and answering them immediately would make both useless.
     */
    private fun withBilling(attempt: Int = 0, action: (Boolean) -> Unit) {
        val client = billingClient
        if (client != null && client.isReady) { action(true); return }
        if (attempt >= BILLING_WAIT_RETRIES) { action(false); return }
        connectBilling()
        mainHandler.postDelayed({ withBilling(attempt + 1, action) }, BILLING_WAIT_MS)
    }

    // ── Purchases ─────────────────────────────────────────────────────────────

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        Log.d(TAG, "purchasesUpdated: code=${result.responseCode} count=${purchases?.size}")
        when {
            result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null ->
                purchases.forEach { handlePurchase(it) }
            result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED ->
                resolvePurchase(false, "canceled")
            else ->
                resolvePurchase(false, result.debugMessage.ifBlank { "Billing error ${result.responseCode}" })
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (!purchase.products.contains(PRODUCT_ID)) return
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> acknowledge(purchase) { resolvePurchase(true, null) }
            Purchase.PurchaseState.PENDING   -> resolvePurchase(false, "pending")
            else                             -> resolvePurchase(false, "unavailable")
        }
    }

    /**
     * Play reverses purchases that are not acknowledged within three days, so this runs on
     * every billing connection — not only when the web layer asks to restore.
     */
    private fun acknowledgeOwnedPurchases() {
        queryOwnedPurchases { ok, purchases ->
            if (!ok) return@queryOwnedPurchases
            purchases.forEach { acknowledge(it, null) }
        }
    }

    private fun acknowledge(purchase: Purchase, onDone: (() -> Unit)?) {
        val client = billingClient
        if (client == null || purchase.isAcknowledged) { onDone?.invoke(); return }
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken).build()
        client.acknowledgePurchase(params) { r ->
            Log.d(TAG, "acknowledge: code=${r.responseCode}")
            onDone?.invoke()
        }
    }

    /** Owned, acknowledged-or-not INAPP purchases of PRODUCT_ID. `ok` is false if the query failed. */
    private fun queryOwnedPurchases(cb: (Boolean, List<Purchase>) -> Unit) {
        val client = billingClient
        if (client == null || !client.isReady) {
            connectBilling()
            cb(false, emptyList())
            return
        }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            val owned = purchases.filter {
                it.products.contains(PRODUCT_ID) && it.purchaseState == Purchase.PurchaseState.PURCHASED
            }
            cb(result.responseCode == BillingClient.BillingResponseCode.OK, owned)
        }
    }

    private fun resolvePurchase(success: Boolean, error: String?) {
        val invoke = pendingPurchaseInvoke ?: return
        pendingPurchaseInvoke = null
        val res = JSObject().put("success", success)
        if (error != null) res.put("error", error)
        invoke.resolve(res)
    }

    private fun productQueryParams() = QueryProductDetailsParams.newBuilder()
        .setProductList(listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )).build()

    // ── Ads ───────────────────────────────────────────────────────────────────

    private fun adUnitId() = if (BuildConfig.DEBUG) AD_UNIT_TEST else AD_UNIT_PROD

    private fun loadRewardedAd() {
        if (!gmsAvailable || adLoading || rewardedAd != null) return
        adLoading = true
        RewardedAd.load(
            act, adUnitId(), AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    adLoading = false
                    adRetryMs = AD_RETRY_MIN_MS
                    rewardedAd = ad
                }

                override fun onAdFailedToLoad(e: LoadAdError) {
                    // Without this retry a single failed load (no network at launch) disables
                    // the free-unlock path for the whole session.
                    adLoading = false
                    rewardedAd = null
                    Log.d(TAG, "ad load failed: ${e.message}")
                    val delay = adRetryMs
                    adRetryMs = (adRetryMs * 2).coerceAtMost(AD_RETRY_MAX_MS)
                    mainHandler.postDelayed({ loadRewardedAd() }, delay)
                }
            }
        )
    }

    private fun resolveAd(success: Boolean, error: String?) {
        val invoke = pendingAdInvoke ?: return
        pendingAdInvoke = null
        val res = JSObject().put("success", success)
        if (error != null) res.put("error", error)
        invoke.resolve(res)
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    @Command
    fun getStoreInfo(invoke: Invoke) {
        invoke.resolve(JSObject()
            .put("provider", "google_play")
            .put("adsAvailable", gmsAvailable)
            .put("billingReady", billingReady))
    }

    @Command
    fun purchaseFullVersion(invoke: Invoke) {
        Log.d(TAG, "purchaseFullVersion() ready=$billingReady")
        val client = billingClient
        if (client == null || !client.isReady) {
            connectBilling()
            invoke.resolve(JSObject().put("success", false).put("error", "Billing not ready"))
            return
        }
        resolvePurchase(false, "superseded") // a second tap must not strand the first Invoke
        pendingPurchaseInvoke = invoke
        client.queryProductDetailsAsync(productQueryParams()) { result, queryResult ->
            val products = queryResult.productDetailsList
            Log.d(TAG, "queryProductDetails: code=${result.responseCode} products=${products.size}")
            if (result.responseCode != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                resolvePurchase(false, "Product not found")
                return@queryProductDetailsAsync
            }
            // Play's purchase-options model exposes offers in a list; the legacy singular
            // accessor only answers when an option is flagged backwards-compatible, so
            // prefer the list and pass its offer token when there is one.
            val details = products[0]
            val paramsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
            details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
                ?.let { paramsBuilder.setOfferToken(it) }
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(paramsBuilder.build())).build()
            mainHandler.post {
                val launch = client.launchBillingFlow(act, flowParams)
                if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "launchBillingFlow failed: code=${launch.responseCode}")
                    resolvePurchase(false, launch.debugMessage.ifBlank { "Could not open checkout" })
                }
            }
        }
    }

    @Command
    fun showRewardedAd(invoke: Invoke) {
        Log.d(TAG, "showRewardedAd() gms=$gmsAvailable adReady=${rewardedAd != null}")
        if (!gmsAvailable) {
            invoke.resolve(JSObject().put("success", false).put("error", "Google Play Services not available"))
            return
        }
        val ad = rewardedAd
        if (ad == null) {
            adRetryMs = AD_RETRY_MIN_MS
            loadRewardedAd()
            invoke.resolve(JSObject().put("success", false).put("error", "Ad not ready"))
            return
        }
        resolveAd(false, "superseded")
        pendingAdInvoke = invoke
        var rewarded = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                if (!rewarded) resolveAd(false, "Ad skipped")
                rewardedAd = null
                mainHandler.post { loadRewardedAd() }
            }

            override fun onAdFailedToShowFullScreenContent(e: AdError) {
                resolveAd(false, e.message)
                rewardedAd = null
                mainHandler.post { loadRewardedAd() }
            }
        }
        mainHandler.post {
            ad.show(act) { _ ->
                rewarded = true
                resolveAd(true, null)
            }
        }
    }

    @Command
    fun getProductPrice(invoke: Invoke) {
        withBilling { ready ->
            val client = billingClient
            if (!ready || client == null) {
                invoke.resolve(JSObject().put("price", ""))
                return@withBilling
            }
            client.queryProductDetailsAsync(productQueryParams()) { result, queryResult ->
                val products = queryResult.productDetailsList
                val price = if (result.responseCode == BillingClient.BillingResponseCode.OK && products.isNotEmpty()) {
                    val d = products[0]
                    d.oneTimePurchaseOfferDetailsList?.firstOrNull()?.formattedPrice
                        ?: d.oneTimePurchaseOfferDetails?.formattedPrice ?: ""
                } else ""
                invoke.resolve(JSObject().put("price", price))
            }
        }
    }

    /**
     * `ok` reports whether Play actually answered. The web layer may only revoke a stored
     * entitlement when `ok` is true — a failed query must never look like a refund.
     */
    @Command
    fun restorePurchases(invoke: Invoke) {
        withBilling { ready ->
            if (!ready) {
                Log.d(TAG, "restorePurchases: billing unavailable")
                invoke.resolve(JSObject().put("ok", false).put("restored", false))
                return@withBilling
            }
            queryOwnedPurchases { ok, purchases ->
                Log.d(TAG, "restorePurchases: ok=$ok owned=${purchases.size}")
                purchases.forEach { acknowledge(it, null) }
                invoke.resolve(JSObject()
                    .put("ok", ok)
                    .put("restored", purchases.isNotEmpty()))
            }
        }
    }
}
