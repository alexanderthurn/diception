import { isAndroid } from '../scenarios/user-identity.js';

class AndroidStore {
    async purchaseFullVersion() { return { success: false, error: 'Not implemented' }; }
    async showRewardedAd()      { return { success: false, error: 'Not implemented' }; }
    async restorePurchases()    { return { restored: false }; }
    getProvider()               { return 'unknown'; }
}

class MockStore extends AndroidStore {
    async purchaseFullVersion() { return { success: true }; }
    async showRewardedAd()      { return { success: true }; }
    async restorePurchases()    { return { restored: false }; }
    getProvider()               { return 'mock'; }
}

// Calls the Kotlin StorePlugin @Commands via Tauri's IPC.
// Handles both Google Play and Amazon — the Kotlin side routes internally.
class TauriStore extends AndroidStore {
    _invoke(cmd) { return window.__TAURI_INTERNALS__.invoke(`plugin:store|${cmd}`); }
    async purchaseFullVersion() { return this._invoke('purchaseFullVersion'); }
    async showRewardedAd()      { return this._invoke('showRewardedAd'); }
    async restorePurchases()    { return this._invoke('restorePurchases'); }
    getProvider()               { return 'tauri'; }
}

function createStore() {
    if (isAndroid() && window.__TAURI_INTERNALS__) return new TauriStore();
    return new MockStore();
}

export const androidStore = createStore();
