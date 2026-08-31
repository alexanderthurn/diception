import { isAndroid, activateFullVersion, revokeFullVersion } from '../scenarios/user-identity.js';

// A hung Invoke on the Kotlin side would otherwise leave a dialog button disabled forever.
const QUERY_TIMEOUT_MS = 30_000;      // price / restore — fast, no user interaction
const INTERACTIVE_TIMEOUT_MS = 600_000; // purchase / ad — the user is in a Google UI

class AndroidStore {
    async getStoreInfo()        { return { provider: 'unknown', adsAvailable: false }; }
    async purchaseFullVersion() { return { success: false, error: 'Not implemented' }; }
    async showRewardedAd()      { return { success: false, error: 'Not implemented' }; }
    async restorePurchases()    { return { ok: false, restored: false }; }
    async getProductPrice()     { return { price: '' }; }
    async showPrivacyOptions()  { return { shown: false }; }
}

const _MOCK_PRICES = ['€2,99', '$2.99', '£2.49', '¥480', 'A$4.99', 'CHF 3.00', 'kr 29'];

/** Browser simulation only (`?android=true`) — never selected on a real device. */
class MockStore extends AndroidStore {
    async getStoreInfo()        { return { provider: 'mock', adsAvailable: true }; }
    async purchaseFullVersion() { return { success: true }; }
    async showRewardedAd()      { return { success: true }; }
    async restorePurchases()    { return { ok: true, restored: false }; }
    async getProductPrice()     { return { price: _MOCK_PRICES[Math.floor(Math.random() * _MOCK_PRICES.length)] }; }
}

/** Real device where the Kotlin plugin never registered — fail visibly, never grant anything. */
class UnavailableStore extends AndroidStore {
    async getStoreInfo()        { return { provider: 'none', adsAvailable: false }; }
    async purchaseFullVersion() { return { success: false, error: 'Store unavailable' }; }
    async showRewardedAd()      { return { success: false, error: 'Store unavailable' }; }
}

// Calls the Kotlin StorePlugin @Commands via Tauri's IPC.
class TauriStore extends AndroidStore {
    _invoke(cmd, timeoutMs) {
        const call = window.__TAURI_INTERNALS__.invoke(`plugin:store|${cmd}`);
        return Promise.race([
            call,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${cmd} timed out`)), timeoutMs)),
        ]);
    }
    async getStoreInfo()        { return this._invoke('getStoreInfo', QUERY_TIMEOUT_MS); }
    async purchaseFullVersion() { return this._invoke('purchaseFullVersion', INTERACTIVE_TIMEOUT_MS); }
    async showRewardedAd()      { return this._invoke('showRewardedAd', INTERACTIVE_TIMEOUT_MS); }
    async restorePurchases()    { return this._invoke('restorePurchases', QUERY_TIMEOUT_MS); }
    async getProductPrice()     { return this._invoke('getProductPrice', QUERY_TIMEOUT_MS); }
    async showPrivacyOptions()  { return this._invoke('showPrivacyOptions', INTERACTIVE_TIMEOUT_MS); }
}

function createStore() {
    if (!isAndroid()) return new MockStore();
    if (window.__TAURI_INTERNALS__) return new TauriStore();
    if (localStorage.getItem('sim_android')) return new MockStore();
    return new UnavailableStore();
}

export const androidStore = createStore();

/**
 * Reconcile the stored entitlement with Google Play on startup: re-grants a purchase made on
 * an earlier run, and drops it again after a refund. A failed query (offline, Play updating)
 * never revokes — only a query that actually succeeded and reported no purchase does.
 * @returns {Promise<boolean>} whether the full version is owned
 */
export async function syncEntitlement() {
    if (!isAndroid()) return false;
    try {
        const { ok, restored } = await androidStore.restorePurchases();
        if (!ok) return false;
        if (restored) {
            activateFullVersion();
            return true;
        }
        revokeFullVersion();
        return false;
    } catch (e) {
        console.warn('[store] entitlement sync failed:', e);
        return false;
    }
}
