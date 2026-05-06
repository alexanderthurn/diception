package com.feuerware.diception

import android.app.Activity
import android.os.Handler
import android.os.Looper
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

// Product ID as configured in Google Play Console
private const val PRODUCT_FULL_VERSION = "full_version"

// Replace AD_UNIT_PROD with your AdMob rewarded ad unit ID before publishing.
// AD_UNIT_TEST is Google's official test unit — safe to use during development.
private const val AD_UNIT_TEST = "ca-app-pub-3940256099942544/5224354917"
private const val AD_UNIT_PROD = "YOUR_ADMOB_REWARDED_AD_UNIT_ID"

@TauriPlugin
class StorePlugin(activity: Activity) : Plugin(activity) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var billingClient: BillingClient? = null
    private var pendingPurchaseInvoke: Invoke? = null
    private var rewardedAd: RewardedAd? = null
    private var pendingAdInvoke: Invoke? = null
    private var gmsAvailable = false

    override fun load(webView: WebView) {
        super.load(webView)
        setupBilling()
        gmsAvailable = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(activity) == ConnectionResult.SUCCESS
        if (gmsAvailable) {
            mainHandler.post {
                MobileAds.initialize(activity) {}
                loadRewardedAd()
            }
        }
    }

    // ── Billing ───────────────────────────────────────────────────────────────

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handlePurchase(it) }
        } else {
            pendingPurchaseInvoke?.resolve(JSObject().put("success", false).put("error", result.debugMessage))
            pendingPurchaseInvoke = null
        }
    }

    private fun setupBilling() {
        billingClient = BillingClient.newBuilder(activity)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .setListener(purchasesListener)
            .build()
        connectBilling()
    }

    private fun connectBilling() {
        billingClient?.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(r: BillingResult) {}
            override fun onBillingServiceDisconnected() {
                // Retry on next command
            }
        })
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        if (purchase.isAcknowledged) {
            pendingPurchaseInvoke?.resolve(JSObject().put("success", true))
            pendingPurchaseInvoke = null
            return
        }
        val ackParams = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        billingClient?.acknowledgePurchase(ackParams) {
            pendingPurchaseInvoke?.resolve(JSObject().put("success", true))
            pendingPurchaseInvoke = null
        }
    }

    @Command
    fun purchaseFullVersion(invoke: Invoke) {
        val client = billingClient
        if (client == null || !client.isReady) {
            invoke.resolve(JSObject().put("success", false).put("error", "Billing not ready"))
            return
        }
        pendingPurchaseInvoke = invoke
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(PRODUCT_FULL_VERSION)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            ))
            .build()
        client.queryProductDetailsAsync(params) { result, products ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                invoke.resolve(JSObject().put("success", false).put("error", "Product not found"))
                pendingPurchaseInvoke = null
                return@queryProductDetailsAsync
            }
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(products[0])
                        .build()
                ))
                .build()
            mainHandler.post { client.launchBillingFlow(activity, flowParams) }
        }
    }

    @Command
    fun restorePurchases(invoke: Invoke) {
        val client = billingClient
        if (client == null || !client.isReady) {
            invoke.resolve(JSObject().put("restored", false))
            return
        }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        client.queryPurchasesAsync(params) { _, purchases ->
            val restored = purchases.any {
                it.products.contains(PRODUCT_FULL_VERSION) &&
                it.purchaseState == Purchase.PurchaseState.PURCHASED
            }
            invoke.resolve(JSObject().put("restored", restored))
        }
    }

    // ── Ads ───────────────────────────────────────────────────────────────────

    private fun adUnitId() = if (BuildConfig.DEBUG) AD_UNIT_TEST else AD_UNIT_PROD

    private fun loadRewardedAd() {
        if (!gmsAvailable) return
        RewardedAd.load(
            activity, adUnitId(), AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
                override fun onAdFailedToLoad(e: LoadAdError) { rewardedAd = null }
            }
        )
    }

    @Command
    fun showRewardedAd(invoke: Invoke) {
        if (!gmsAvailable) {
            invoke.resolve(JSObject().put("success", false).put("error", "Google Play Services not available"))
            return
        }
        val ad = rewardedAd
        if (ad == null) {
            invoke.resolve(JSObject().put("success", false).put("error", "Ad not ready"))
            return
        }
        pendingAdInvoke = invoke
        var rewarded = false

        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                if (!rewarded) {
                    pendingAdInvoke?.resolve(JSObject().put("success", false).put("error", "Ad skipped"))
                    pendingAdInvoke = null
                }
                rewardedAd = null
                mainHandler.post { loadRewardedAd() }
            }
            override fun onAdFailedToShowFullScreenContent(e: AdError) {
                pendingAdInvoke?.resolve(JSObject().put("success", false).put("error", e.message))
                pendingAdInvoke = null
                rewardedAd = null
                mainHandler.post { loadRewardedAd() }
            }
        }

        mainHandler.post {
            ad.show(activity) { _ ->
                rewarded = true
                pendingAdInvoke?.resolve(JSObject().put("success", true))
                pendingAdInvoke = null
            }
        }
    }
}
