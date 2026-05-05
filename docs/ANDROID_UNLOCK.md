# Android Unlock System

Handles two unlock paths on Android: permanent via in-app purchase and timed via rewarded ad.
Desktop/web use the existing unlock flow and are unaffected.

---

## Dialog

**`src/ui/android-unlock-dialog.js`** — new component, separate from the existing upgrade prompt.

Shown when `isAndroid() && !isFullVersion() && !isTimedUnlockActive()`.

Two buttons:
- **Unlock Full Game** — triggers IAP purchase flow
- **Watch Ad (30 min)** — triggers rewarded ad, then starts timed unlock

Stub behaviour (now): both buttons call `activateTimedUnlock()` immediately with a long duration so the full version activates without a real purchase or ad.

---

## Timed Unlock

**`src/core/timed-unlock.js`**

```
setTimedUnlock(minutes)       — writes expiry timestamp to localStorage
isTimedUnlockActive()         — true if expiry is in the future
getTimedUnlockRemainingMs()   — ms until expiry, 0 if expired
clearTimedUnlock()
```

`user-identity.js` `isFullVersion()` calls `isTimedUnlockActive()` as one of its conditions.

Duration is a named constant `TIMED_UNLOCK_MINUTES = 30` in `timed-unlock.js`.

---

## Store Abstraction

**`src/native/android-store.js`** — provider-agnostic interface.

```js
class AndroidStore {
  purchaseFullVersion()   → Promise<{ success: boolean, error?: string }>
  showRewardedAd()        → Promise<{ success: boolean, error?: string }>
  restorePurchases()      → Promise<{ restored: boolean }>
  getProvider()           → string   // "google_play" | "amazon" | "mock"
}
```

Three implementations, all extending `AndroidStore`:

| Class | Used when |
|---|---|
| `MockStore` | Now — both methods resolve immediately with `{ success: true }` |
| `GooglePlayStore` | `window.android.storeProvider === 'google_play'` |
| `AmazonStore` | `window.android.storeProvider === 'amazon'` |

Active instance exported as `androidStore` singleton, selected at module load time based on `window.android.storeProvider`.

---

## Tauri Bridge (Rust — Android only)

New commands in `lib.rs` under `#[cfg(target_os = "android")]`:

```rust
android_purchase_full_version()   → Result<bool, String>
android_show_rewarded_ad()        → Result<bool, String>
android_restore_purchases()       → Result<bool, String>
android_get_store_provider()      → String   // "google_play" | "amazon" | "mock"
```

`ANDROID_INIT_SCRIPT` gains a `store` sub-object on `window.android`:

```js
window.android.store = {
  purchaseFullVersion: () => ipc.invoke('android_purchase_full_version'),
  showRewardedAd:      () => ipc.invoke('android_show_rewarded_ad'),
  restorePurchases:    () => ipc.invoke('android_restore_purchases'),
  getProvider:         () => ipc.invoke('android_get_store_provider'),
};
window.android.storeProvider = 'mock'; // overridden per build variant
```

---

## Kotlin Layer (future)

When real IAP/ads are implemented, these wrap the native SDKs and are called by the Tauri commands above.

**`GooglePlayBillingWrapper.kt`**
- Uses `com.android.billingclient:billing-ktx`
- SKU: `full_version` (one-time product)
- Handles purchase acknowledgement and consumption

**`AdMobRewardedAdWrapper.kt`**
- Uses `com.google.android.gms:play-services-ads`
- Loads a rewarded ad on startup, reloads after each show
- `showRewardedAd()` returns success only after the reward callback fires

**`AmazonIAPWrapper.kt`**
- Uses Amazon Appstore SDK
- Same interface, different billing backend

Provider is selected at Kotlin build time via a build flavor or `BuildConfig` flag, which sets `storeProvider` in the init script.

---

## Integration Points

- `user-identity.js` — `isFullVersion()` adds `|| isTimedUnlockActive()`
- `main.js` — after init, if `isAndroid() && !isFullVersion()`, show the android unlock dialog instead of the standard upgrade prompt
- Timer expiry: check `isTimedUnlockActive()` on each game start (existing `initFullVersionCheck` call is the right hook)

---

## What to build first

1. `src/core/timed-unlock.js`
2. `src/native/android-store.js` with `MockStore`
3. `src/ui/android-unlock-dialog.js` wired to mock store
4. Update `user-identity.js` to check timed unlock
5. Rust commands + init script (when ready for real store/ad integration)
6. Kotlin wrappers per store target
