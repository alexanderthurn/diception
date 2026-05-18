import { Dialog } from './dialog.js';
import { androidStore } from '../native/android-store.js';
import { activateFullVersion } from '../scenarios/user-identity.js';
import { setTimedUnlock, TIMED_UNLOCK_MINUTES } from '../core/timed-unlock.js';

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
                <button class="android-unlock-expander" aria-expanded="false">
                    Get the Pro Version <span class="android-unlock-expander-arrow">▶</span>
                </button>
                <ul class="full-version-features android-unlock-features-list" hidden>
                    <li>Full Campaign</li>
                    <li>Harder Bots &amp; Bigger Maps</li>
                    <li>Local Multiplayer up to 8 players</li>
                    <li>Map Editor, Achievements &amp; more</li>
                </ul>
                <div class="android-unlock-options">
                    <div class="android-unlock-option">
                        <button class="android-unlock-btn android-unlock-ad tron-btn">WATCH AD<br><span class="android-unlock-sub">${durationLabel(TIMED_UNLOCK_MINUTES)} FREE</span></button>
                        <p class="android-unlock-option-desc">Watch a short ad and play the full game free for ${durationLabel(TIMED_UNLOCK_MINUTES)}.</p>
                    </div>
                    <div class="android-unlock-option">
                        <button class="android-unlock-btn android-unlock-iap tron-btn">BUY<br><span class="android-unlock-sub">Permanent</span></button>
                        <p class="android-unlock-option-desc">One-time purchase. Unlock everything forever.</p>
                    </div>
                </div>
                <button class="android-unlock-restore">Restore Purchases</button>
            `;

            const expander = content.querySelector('.android-unlock-expander');
            const featureList = content.querySelector('.android-unlock-features-list');
            expander.addEventListener('click', () => {
                const open = featureList.hidden;
                featureList.hidden = !open;
                expander.setAttribute('aria-expanded', String(open));
                expander.querySelector('.android-unlock-expander-arrow').textContent = open ? '▼' : '▶';
            });

            let overlayRef = null;

            content.querySelector('.android-unlock-iap').addEventListener('click', async (e) => {
                e.currentTarget.disabled = true;
                Dialog.alert(`DBG: store=${androidStore.getProvider()} ipc=${!!window.__TAURI_INTERNALS__}`);
                try {
                    const result = await androidStore.purchaseFullVersion();
                    if (result.success) {
                        activateFullVersion();
                        Dialog.close(overlayRef);
                        resolve('iap');
                    } else {
                        e.currentTarget.disabled = false;
                        Dialog.alert(result.error || 'Purchase failed (no error)');
                    }
                } catch (err) {
                    e.currentTarget.disabled = false;
                    Dialog.alert('Purchase exception: ' + (err?.message || String(err)));
                }
            });

            content.querySelector('.android-unlock-ad').addEventListener('click', async (e) => {
                e.currentTarget.disabled = true;
                try {
                    const result = await androidStore.showRewardedAd();
                    if (result.success) {
                        setTimedUnlock(TIMED_UNLOCK_MINUTES);
                        Dialog.close(overlayRef);
                        resolve('ad');
                    } else {
                        e.currentTarget.disabled = false;
                        const msg = result.error === 'Ad not ready'
                            ? 'Ad not ready yet. Please try again in a moment.'
                            : (result.error || 'Ad unavailable. Please try again later.');
                        Dialog.alert(msg);
                    }
                } catch (err) {
                    e.currentTarget.disabled = false;
                    Dialog.alert('Ad exception: ' + (err?.message || String(err)));
                }
            });

            content.querySelector('.android-unlock-restore').addEventListener('click', async (e) => {
                e.currentTarget.disabled = true;
                try {
                    const result = await androidStore.restorePurchases();
                    if (result.restored) {
                        activateFullVersion();
                        Dialog.close(overlayRef);
                        resolve('iap');
                    } else {
                        e.currentTarget.disabled = false;
                        Dialog.alert('No previous purchase found.');
                    }
                } catch (err) {
                    e.currentTarget.disabled = false;
                    Dialog.alert('Restore failed. Please try again.');
                }
            });

            Dialog.show({ title: 'WANT MORE?', content, buttons: [], closeButton: true })
                .then(() => resolve('close'));
            overlayRef = Dialog.activeOverlay;

            androidStore.getProductPrice().then(({ price }) => {
                if (price) {
                    const sub = content.querySelector('.android-unlock-iap .android-unlock-sub');
                    if (sub) sub.textContent = `${price} · Permanent`;
                }
            }).catch(() => {});
        });
    }
}
