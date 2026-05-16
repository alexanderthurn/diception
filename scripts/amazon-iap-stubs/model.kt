package com.amazon.device.iap.model

enum class FulfillmentResult { FULFILLED, UNAVAILABLE }

class UserDataResponse
class ProductDataResponse

class PurchaseResponse {
    enum class RequestStatus {
        SUCCESSFUL, ALREADY_PURCHASED, FAILED, INVALID_SKU, NOT_SUPPORTED
    }
    val requestStatus: RequestStatus = RequestStatus.FAILED
    val receipt: Receipt = Receipt()
    class Receipt {
        val receiptId: String = ""
        val sku: String = ""
    }
}

class PurchaseUpdatesResponse {
    val receipts: List<PurchaseResponse.Receipt> = emptyList()
    fun hasMore(): Boolean = false
}
