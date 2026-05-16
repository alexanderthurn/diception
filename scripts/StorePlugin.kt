package com.feuerware.diception

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

// Google Play
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

// Amazon IAP — SDK JAR must be placed in app/libs/
// Download from: https://developer.amazon.com/apps-and-games/sdk-download
// If JAR is absent, stubs from src/amazon-stubs/ are compiled instead.
import com.amazon.device.iap.PurchasingListener
import com.amazon.device.iap.PurchasingService
import com.amazon.device.iap.model.FulfillmentResult
import com.amazon.device.iap.model.ProductDataResponse
import com.amazon.device.iap.model.PurchaseResponse
import com.amazon.device.iap.model.PurchaseUpdatesResponse
import com.amazon.device.iap.model.UserDataResponse

private const val PRODUCT_ID = "full_version"
private const val AD_UNIT_TEST = "ca-app-pub-3940256099942544/5224354917"
private const val AD_UNIT_PROD = "ca-app-pub-1776202225804421/5831073456"

@TauriPlugin
class StorePlugin(activity: Activity) : Plugin(activity) {

    private val act = activity

    // ── Amazon static registration ────────────────────────────────────────────
    // Amazon's PurchasingService.registerListener() must be called before
    // super.onCreate() in MainActivity. Use registerAmazonIap() from there.

    companion object {
        val isAmazon: Boolean = Build.MANUFACTURER.equals("Amazon", ignoreCase = true)

        var pendingAmazonPurchaseInvoke: Invoke? = null
        var pendingAmazonRestoreInvoke: Invoke? = null

        val amazonListener = object : PurchasingListener {
            override fun onUserDataResponse(r: UserDataResponse) {}
            override fun onProductDataResponse(r: ProductDataResponse) {}

            override fun onPurchaseResponse(r: PurchaseResponse) {
                when (r.requestStatus) {
                    PurchaseResponse.RequestStatus.SUCCESSFUL -> {
                        PurchasingService.notifyFulfillment(
                            r.receipt.receiptId, FulfillmentResult.FULFILLED
                        )
                        pendingAmazonPurchaseInvoke?.resolve(JSObject().put("success", true))
                    }
                    PurchaseResponse.RequestStatus.ALREADY_PURCHASED -> {
                        pendingAmazonPurchaseInvoke?.resolve(JSObject().put("success", true))
                    }
                    else -> {
                        pendingAmazonPurchaseInvoke?.resolve(
                            JSObject().put("success", false)
                                .put("error", r.requestStatus.toString())
                        )
                    }
                }
                pendingAmazonPurchaseInvoke = null
            }

            override fun onPurchaseUpdatesResponse(r: PurchaseUpdatesResponse) {
                val restored = r.receipts.any { it.sku == PRODUCT_ID }
                if (restored || !r.hasMore()) {
                    pendingAmazonRestoreInvoke?.resolve(JSObject().put("restored", restored))
                    pendingAmazonRestoreInvoke = null
                }
            }
        }

        fun registerAmazonIap(context: Context) {
            if (isAmazon) PurchasingService.registerListener(context, amazonListener)
        }
    }

    // ── Google Play fields ────────────────────────────────────────────────────

    private val mainHandler = Handler(Looper.getMainLooper())
    private var billingClient: BillingClient? = null
    private var pendingGooglePurchaseInvoke: Invoke? = null
    private var rewardedAd: RewardedAd? = null
    private var pendingAdInvoke: Invoke? = null
    private var gmsAvailable = false

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun load(webView: WebView) {
        super.load(webView)
        if (isAmazon) {
            mainHandler.post {
                webView.evaluateJavascript(
                    "window.android && (window.android.storeProvider = 'amazon')", null
                )
            }
        } else {
            setupGoogle()
        }
    }

    // ── Google Play ───────────────────────────────────────────────────────────

    private val googlePurchasesListener = PurchasesUpdatedListener { result, purchases ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handleGooglePurchase(it) }
        } else {
            pendingGooglePurchaseInvoke?.resolve(
                JSObject().put("success", false).put("error", result.debugMessage)
            )
            pendingGooglePurchaseInvoke = null
        }
    }

    private fun setupGoogle() {
        gmsAvailable = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(act) == ConnectionResult.SUCCESS
        billingClient = BillingClient.newBuilder(act)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .setListener(googlePurchasesListener)
            .build()
        billingClient?.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(r: BillingResult) {}
            override fun onBillingServiceDisconnected() {}
        })
        if (gmsAvailable) {
            mainHandler.post {
                MobileAds.initialize(act) {}
                loadRewardedAd()
            }
        }
    }

    private fun handleGooglePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        if (purchase.isAcknowledged) {
            pendingGooglePurchaseInvoke?.resolve(JSObject().put("success", true))
            pendingGooglePurchaseInvoke = null
            return
        }
        val ackParams = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken).build()
        billingClient?.acknowledgePurchase(ackParams) {
            pendingGooglePurchaseInvoke?.resolve(JSObject().put("success", true))
            pendingGooglePurchaseInvoke = null
        }
    }

    // ── Ads ───────────────────────────────────────────────────────────────────

    private fun adUnitId() = if (BuildConfig.DEBUG) AD_UNIT_TEST else AD_UNIT_PROD

    private fun loadRewardedAd() {
        if (!gmsAvailable) return
        RewardedAd.load(
            act, adUnitId(), AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
                override fun onAdFailedToLoad(e: LoadAdError) { rewardedAd = null }
            }
        )
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    @Command
    fun purchaseFullVersion(invoke: Invoke) {
        if (isAmazon) {
            pendingAmazonPurchaseInvoke = invoke
            PurchasingService.purchase(PRODUCT_ID)
            return
        }
        val client = billingClient
        if (client == null || !client.isReady) {
            invoke.resolve(JSObject().put("success", false).put("error", "Billing not ready"))
            return
        }
        pendingGooglePurchaseInvoke = invoke
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(PRODUCT_ID)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            )).build()
        client.queryProductDetailsAsync(params) { result, products ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                invoke.resolve(JSObject().put("success", false).put("error", "Product not found"))
                pendingGooglePurchaseInvoke = null
                return@queryProductDetailsAsync
            }
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(products[0]).build()
                )).build()
            mainHandler.post { client.launchBillingFlow(act, flowParams) }
        }
    }

    @Command
    fun showRewardedAd(invoke: Invoke) {
        if (isAmazon) {
            invoke.resolve(JSObject().put("success", false).put("error", "Ads not available on Amazon"))
            return
        }
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
            ad.show(act) { _ ->
                rewarded = true
                pendingAdInvoke?.resolve(JSObject().put("success", true))
                pendingAdInvoke = null
            }
        }
    }

    @Command
    fun restorePurchases(invoke: Invoke) {
        if (isAmazon) {
            pendingAmazonRestoreInvoke = invoke
            PurchasingService.getPurchaseUpdates(false)
            return
        }
        val client = billingClient
        if (client == null || !client.isReady) {
            invoke.resolve(JSObject().put("restored", false))
            return
        }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { _, purchases ->
            val restored = purchases.any {
                it.products.contains(PRODUCT_ID) &&
                    it.purchaseState == Purchase.PurchaseState.PURCHASED
            }
            invoke.resolve(JSObject().put("restored", restored))
        }
    }
}
