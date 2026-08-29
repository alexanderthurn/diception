# Android Unlock System

Two unlock paths on Android: a permanent in-app purchase, and a timed unlock earned by watching
a rewarded ad. Desktop/web use the Steam app-ID check and are unaffected.

---

## Dialog

**`src/ui/android-unlock-dialog.js`** — shown by `showUnlockDialog()` whenever a locked feature is
tapped and `isAndroid() && !isFullVersion()`.

- **WATCH AD** — rewarded ad, then `setTimedUnlock(TIMED_UNLOCK_MINUTES)`. Hidden entirely when
  `getStoreInfo()` reports `adsAvailable: false` (no Play Services on the device).
- **BUY** — one-time IAP. Shows the localised price once `getProductPrice()` returns.
- **Restore Purchases** — re-checks Google Play for an existing purchase.

Error strings from the Kotlin layer are mapped to user-facing text in `PURCHASE_ERRORS` /
`AD_ERRORS`. `canceled` and `superseded` are silent — the user already knows what they did.

---

## Entitlement

**`src/scenarios/user-identity.js`**

```
isFullVersion()        — true if Steam full app, a stored Android purchase, or a live timed unlock
activateFullVersion()  — grants; on Android persists localStorage 'full_version_owned'
revokeFullVersion()    — clears that flag (refund); no-op off Android
```

The purchase **must** be persisted — without it a paying customer drops back to the demo on the
next launch.

`initFullVersionCheck()` seeds `_resolvedFull` from the stored flag on Android, so the full version
is available offline and before the store answers.

**`syncEntitlement()`** (`src/native/android-store.js`) runs once per launch from `main.js` and
reconciles that flag with Google Play:

| Store result | Effect |
|---|---|
| `{ ok: true, restored: true }` | `activateFullVersion()` — purchase from an earlier run is back |
| `{ ok: true, restored: false }` | `revokeFullVersion()` — refunded or never owned |
| `{ ok: false, … }` | nothing — a failed query (offline, Play updating) must never revoke |

The same startup query also **acknowledges** owned purchases on the Kotlin side. Play reverses any
purchase left unacknowledged for three days, so this is not optional.

---

## Timed Unlock

**`src/core/timed-unlock.js`** — `TIMED_UNLOCK_MINUTES = 60`.

```
setTimedUnlock(minutes)       — writes expiry timestamp to localStorage
isTimedUnlockActive()         — true if expiry is in the future
getTimedUnlockRemainingMs()   — ms until expiry, 0 if expired
clearTimedUnlock()
```

The countdown is rendered into the main-menu credits label by `refreshCreditsLabel()` in `main.js`,
which also fires `_onTimerExpiry` when it runs out — so expiry is noticed on the menu, never
mid-match. Tapping the label five times shortens the remaining time to 3 seconds (test hook for the
expiry path).

---

## Store Bridge

**`src/native/android-store.js`** — `androidStore` singleton, chosen at module load:

| Wrapper | Selected when |
|---|---|
| `TauriStore` | Android + `window.__TAURI_INTERNALS__` — invokes `plugin:store\|<command>` |
| `MockStore` | Browser, or `?android=true` simulation |
| `UnavailableStore` | Android device without the plugin — fails visibly, never grants anything |

Every invoke is wrapped in a timeout (30 s for queries, 10 min for the interactive purchase/ad
flows) so a stalled native call can never leave a dialog button permanently disabled.

```js
getStoreInfo()        → { provider, adsAvailable, billingReady }
purchaseFullVersion() → { success, error? }   // error: 'canceled' | 'pending' | 'Billing not ready' | …
showRewardedAd()      → { success, error? }   // error: 'Ad not ready' | 'Ad skipped' | …
restorePurchases()    → { ok, restored }
getProductPrice()     → { price }             // formatted, localised; '' if unavailable
```

---

## Kotlin Layer

**`scripts/StorePlugin.kt`** — copied into the generated project by `npm run android:init`,
registered from Rust in `src-tauri/src/lib.rs`:

```rust
tauri::plugin::Builder::<tauri::Wry, ()>::new("store")
    .setup(|_app, api| { api.register_android_plugin("com.feuerware.diception", "StorePlugin")?; Ok(()) })
```

Product ID `full_version` (INAPP). Behaviour worth knowing:

- **Every command resolves its `Invoke` on every path.** An unresolved Invoke leaves the JS promise
  pending and the button disabled until the app restarts — including the `PENDING` purchase state
  and a failed `launchBillingFlow`.
- **Billing reconnects** with exponential backoff (1 s → 60 s) on `onBillingServiceDisconnected`,
  and acknowledges owned purchases on every successful connection.
- **Ad loads retry** with backoff (5 s → 2 min). Without this, one failed load at launch (no
  network) disables the free-unlock path for the whole session.
- **`getProductPrice` waits** up to ~10 s for the billing connection rather than returning an empty
  price when the dialog is opened right after launch.
- Ads use the AdMob test unit when `BuildConfig.DEBUG`, the production unit otherwise.

---

## Not implemented

- **No consent flow for ads (Google UMP).** Serving AdMob to EEA users without one violates
  Google's EU User Consent Policy — needed before a public release.
- **No hardware back-button handling.** Back exits the app from anywhere, including mid-match.
