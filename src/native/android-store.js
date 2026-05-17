import { isAndroid } from '../scenarios/user-identity.js';

class AndroidStore {
    async purchaseFullVersion() { return { success: false, error: 'Not implemented' }; }
    async showRewardedAd()      { return { success: false, error: 'Not implemented' }; }
    async restorePurchases()    { return { restored: false }; }
    async getProductPrice()     { return { price: '' }; }
    getProvider()               { return 'unknown'; }
}

const _MOCK_PRICES = ['€2,99', '$2.99', '£2.49', '¥480', 'A$4.99', 'CHF 3.00', 'kr 29'];

class MockStore extends AndroidStore {
    async purchaseFullVersion() { return { success: true }; }
    async showRewardedAd()      { return { success: true }; }
    async restorePurchases()    { return { restored: false }; }
    async getProductPrice()     { return { price: _MOCK_PRICES[Math.floor(Math.random() * _MOCK_PRICES.length)] }; }
    getProvider()               { return 'mock'; }
}

// Calls the Kotlin StorePlugin @Commands via Tauri's IPC.
// Handles both Google Play and Amazon — the Kotlin side routes internally.
class TauriStore extends AndroidStore {
    _invoke(cmd) { return window.__TAURI_INTERNALS__.invoke(`plugin:store|${cmd}`); }
    async purchaseFullVersion() { return this._invoke('purchaseFullVersion'); }
    async showRewardedAd()      { return this._invoke('showRewardedAd'); }
    async restorePurchases()    { return this._invoke('restorePurchases'); }
    async getProductPrice()     { return this._invoke('getProductPrice'); }
    getProvider()               { return 'tauri'; }
}

function createStore() {
    if (isAndroid() && window.__TAURI_INTERNALS__) return new TauriStore();
    return new MockStore();
}

export const androidStore = createStore();
