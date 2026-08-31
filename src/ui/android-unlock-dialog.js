import { Dialog } from './dialog.js';
import { androidStore } from '../native/android-store.js';
import { activateFullVersion } from '../scenarios/user-identity.js';
import { setTimedUnlock, TIMED_UNLOCK_MINUTES } from '../core/timed-unlock.js';

const AD_ERRORS = {
    'Ad not ready': 'No ad available right now. Please try again in a moment.',
    'consent-declined': 'Without your consent no ad can be shown. You can change this any time under About → Ad privacy settings.',
    'Ad skipped': 'The ad has to run to the end to unlock the free play time.',
    'Store unavailable': 'The store is unavailable in this build.',
    'Google Play Services not available': 'Rewarded ads need Google Play Services on this device.',
};

const PURCHASE_ERRORS = {
    pending: 'Payment is still being processed. The full version unlocks as soon as it clears.',
    'Billing not ready': 'Google Play is not ready yet. Please try again in a moment.',
    'Product not found': 'This purchase is not available on your account right now.',
    'Store unavailable': 'The store is unavailable in this build.',
};

function durationLabel(minutes) {
    if (minutes >= 60 && minutes % 60 === 0) {
        const h = minutes / 60;
        return `${h} HOUR${h > 1 ? 'S' : ''}`;
    }
    return `${minutes} MIN`;
}

export class AndroidUnlockDialog {
    static show() {
        return new Promise(resolve => {
            const content = document.createElement('div');
            content.className = 'android-unlock-body';
            content.innerHTML = `
                <ul class="full-version-features">
                    <li>Full Campaign</li>
                    <li>Harder Bots &amp; Bigger Maps</li>
                    <li>Local Multiplayer up to 8 players</li>
                    <li>Map Editor, Achievements &amp; more</li>
                </ul>
                <div class="android-unlock-options">
                    <div class="android-unlock-option android-unlock-ad-option">
                        <button class="android-unlock-btn android-unlock-ad tron-btn">WATCH AD<span class="android-unlock-sub">${durationLabel(TIMED_UNLOCK_MINUTES)}</span></button>
                    </div>
                    <div class="android-unlock-option">
                        <button class="android-unlock-btn android-unlock-iap tron-btn">BUY<span class="android-unlock-sub">Permanent</span></button>
                    </div>
                </div>
                <button class="android-unlock-restore">Restore Purchases</button>
            `;

            let overlayRef = null;

            content.querySelector('.android-unlock-iap').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    const result = await androidStore.purchaseFullVersion();
                    if (result.success) {
                        activateFullVersion();
                        Dialog.close(overlayRef);
                        resolve('iap');
                        return;
                    }
                    btn.disabled = false;
                    if (result.error === 'canceled' || result.error === 'superseded') return;
                    Dialog.alert(PURCHASE_ERRORS[result.error] || result.error || 'Purchase failed.');
                } catch (err) {
                    btn.disabled = false;
                    Dialog.alert('Purchase failed. Please try again.');
                    console.warn('[store] purchase failed:', err);
                }
            });

            content.querySelector('.android-unlock-ad').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const label = btn.innerHTML;
                btn.disabled = true;
                // Consent form and ad load both happen now, so say so rather than looking stuck
                btn.innerHTML = 'PLEASE WAIT<span class="android-unlock-sub">loading ad…</span>';
                // The ad is a fullscreen Android activity; the WebView keeps playing audio
                window.dispatchEvent(new Event('adOverlayStart'));
                try {
                    const result = await androidStore.showRewardedAd();
                    window.dispatchEvent(new Event('adOverlayEnd'));
                    // A consent decision may have created the privacy options entry point
                    window.dispatchEvent(new Event('adConsentResolved'));
                    if (result.success) {
                        setTimedUnlock(TIMED_UNLOCK_MINUTES);
                        Dialog.close(overlayRef);
                        resolve('ad');
                        return;
                    }
                    btn.innerHTML = label;
                    btn.disabled = false;
                    if (result.error === 'superseded') return;
                    Dialog.alert(AD_ERRORS[result.error] || 'Ad unavailable. Please try again later.');
                } catch (err) {
                    window.dispatchEvent(new Event('adOverlayEnd'));
                    btn.innerHTML = label;
                    btn.disabled = false;
                    Dialog.alert('Ad unavailable. Please try again later.');
                    console.warn('[store] rewarded ad failed:', err);
                }
            });

            content.querySelector('.android-unlock-restore').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    const result = await androidStore.restorePurchases();
                    if (result.restored) {
                        activateFullVersion();
                        Dialog.close(overlayRef);
                        resolve('iap');
                        return;
                    }
                    btn.disabled = false;
                    Dialog.alert(result.ok
                        ? 'No previous purchase found.'
                        : 'Could not reach Google Play. Please check your connection and try again.');
                } catch (err) {
                    btn.disabled = false;
                    Dialog.alert('Restore failed. Please try again.');
                    console.warn('[store] restore failed:', err);
                }
            });

            Dialog.show({ title: 'Get Full Version', content, buttons: [], closeButton: true })
                .then(() => resolve('close'));
            overlayRef = Dialog.activeOverlay;

            androidStore.getProductPrice().then(({ price }) => {
                if (price) {
                    const sub = content.querySelector('.android-unlock-iap .android-unlock-sub');
                    if (sub) sub.textContent = `${price} · Permanent`;
                }
            }).catch(() => {});

            // No ads without Play Services — don't offer a button that can only fail
            androidStore.getStoreInfo().then(({ adsAvailable }) => {
                if (adsAvailable) return;
                content.querySelector('.android-unlock-ad-option').hidden = true;
                content.querySelector('.android-unlock-options').classList.add('single-option');
            }).catch(() => {});
        });
    }
}
