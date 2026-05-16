package com.amazon.device.iap

import android.content.Context
import com.amazon.device.iap.model.FulfillmentResult
import com.amazon.device.iap.model.ProductDataResponse
import com.amazon.device.iap.model.PurchaseResponse
import com.amazon.device.iap.model.PurchaseUpdatesResponse
import com.amazon.device.iap.model.UserDataResponse

interface PurchasingListener {
    fun onUserDataResponse(r: UserDataResponse)
    fun onProductDataResponse(r: ProductDataResponse)
    fun onPurchaseResponse(r: PurchaseResponse)
    fun onPurchaseUpdatesResponse(r: PurchaseUpdatesResponse)
}

object PurchasingService {
    @JvmStatic fun registerListener(context: Context, listener: PurchasingListener) {}
    @JvmStatic fun purchase(sku: String): String = ""
    @JvmStatic fun getPurchaseUpdates(reset: Boolean): String = ""
    @JvmStatic fun notifyFulfillment(receiptId: String, result: FulfillmentResult) {}
}
