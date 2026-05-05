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

class GooglePlayStore extends AndroidStore {
    async purchaseFullVersion() { return window.android.store.purchaseFullVersion(); }
    async showRewardedAd()      { return window.android.store.showRewardedAd(); }
    async restorePurchases()    { return window.android.store.restorePurchases(); }
    getProvider()               { return 'google_play'; }
}

class AmazonStore extends AndroidStore {
    async purchaseFullVersion() { return window.android.store.purchaseFullVersion(); }
    async showRewardedAd()      { return window.android.store.showRewardedAd(); }
    async restorePurchases()    { return window.android.store.restorePurchases(); }
    getProvider()               { return 'amazon'; }
}

function createStore() {
    const provider = window.android?.storeProvider ?? 'mock';
    if (provider === 'google_play') return new GooglePlayStore();
    if (provider === 'amazon')      return new AmazonStore();
    return new MockStore();
}

export const androidStore = createStore();
