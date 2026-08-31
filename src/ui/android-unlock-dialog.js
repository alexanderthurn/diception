import { Dialog } from './dialog.js';
import { androidStore } from '../native/android-store.js';
import { activateFullVersion } from '../scenarios/user-identity.js';
import { setTimedUnlock, TIMED_UNLOCK_MINUTES } from '../core/timed-unlock.js';
import { t } from '../core/i18n.js';

// Native error codes mapped to their message keys
const AD_ERRORS = {
    'Ad not ready': 'unlock.err_ad_not_ready',
    'consent-declined': 'unlock.err_consent',
    'Ad skipped': 'unlock.err_ad_skipped',
    'Store unavailable': 'unlock.err_store_unavailable',
    'Google Play Services not available': 'unlock.err_no_play_services',
};

const PURCHASE_ERRORS = {
    pending: 'unlock.err_pending',
    'Billing not ready': 'unlock.err_billing_not_ready',
    'Product not found': 'unlock.err_product_not_found',
    'Store unavailable': 'unlock.err_store_unavailable',
};

function durationLabel(minutes) {
    if (minutes >= 60 && minutes % 60 === 0) {
        const h = minutes / 60;
        return t(h > 1 ? 'unlock.hours' : 'unlock.hour', { h });
    }
    return t('unlock.minutes', { m: minutes });
}


const SUCCESS = {
    ad: {
        title: () => t('unlock.success_ad_title'),
        headline: () => t('unlock.success_ad_headline',
            { duration: durationLabel(TIMED_UNLOCK_MINUTES).toLowerCase() }),
        body: () => t('unlock.success_ad_body'),
    },
    iap: {
        title: () => t('unlock.success_iap_title'),
        headline: () => t('unlock.success_iap_headline'),
        body: () => t('unlock.success_iap_body'),
    },
    restore: {
        title: () => t('unlock.success_restore_title'),
        headline: () => t('unlock.success_restore_headline'),
        body: () => t('unlock.success_restore_body'),
    },
};

/** Confirmation after a successful unlock, framed like the offer dialog. */
function showUnlockSuccess(kind) {
    const info = SUCCESS[kind];
    const content = document.createElement('div');
    content.className = 'android-unlock-body android-unlock-success';
    content.innerHTML = `
        <p class="android-unlock-success-headline">${info.headline()}</p>
        <p class="android-unlock-success-body">${info.body()}</p>
    `;
    return Dialog.show({
        title: info.title(),
        content,
        buttons: [{ text: t('unlock.success_ok'), value: true, className: 'tron-btn menu-btn-primary' }],
    });
}

export class AndroidUnlockDialog {
    static show() {
        return new Promise(resolve => {
            const content = document.createElement('div');
            content.className = 'android-unlock-body';
            content.innerHTML = `
                <ul class="full-version-features android-unlock-features">
                    <li><span class="sprite-icon icon-skull"></span>${t('unlock.feature_bots_maps')}</li>
                    <li><span class="sprite-icon icon-campaigns"></span>${t('unlock.feature_campaign')}</li>
                    <li><span class="sprite-icon icon-gamepad"></span>${t('unlock.feature_multiplayer')}</li>
                    <li><span class="sprite-icon icon-achievements"></span>${t('unlock.feature_editor')}</li>
                </ul>
                <div class="android-unlock-options">
                    <div class="android-unlock-option android-unlock-ad-option">
                        <button class="android-unlock-btn android-unlock-ad tron-btn menu-btn-primary">${t('unlock.watch_ad')}<span class="android-unlock-sub">${t('unlock.free_suffix', { duration: durationLabel(TIMED_UNLOCK_MINUTES) })}</span></button>
                    </div>
                    <div class="android-unlock-option">
                        <button class="android-unlock-iap">${t('unlock.buy')}<span class="android-unlock-sub">${t('unlock.permanent')}</span></button>
                    </div>
                </div>
                <button class="android-unlock-restore">${t('unlock.restore')}</button>
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
                        await showUnlockSuccess('iap');
                        resolve('iap');
                        return;
                    }
                    btn.disabled = false;
                    if (result.error === 'canceled' || result.error === 'superseded') return;
                    Dialog.alert(PURCHASE_ERRORS[result.error] ? t(PURCHASE_ERRORS[result.error]) : (result.error || t('unlock.err_purchase_generic')));
                } catch (err) {
                    btn.disabled = false;
                    Dialog.alert(t('unlock.err_purchase_retry'));
                    console.warn('[store] purchase failed:', err);
                }
            });

            content.querySelector('.android-unlock-ad').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const label = btn.innerHTML;
                btn.disabled = true;
                // Consent form and ad load both happen now, so say so rather than looking stuck
                btn.innerHTML = `${t('unlock.please_wait')}<span class="android-unlock-sub">${t('unlock.loading_ad')}</span>`;
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
                        await showUnlockSuccess('ad');
                        resolve('ad');
                        return;
                    }
                    btn.innerHTML = label;
                    btn.disabled = false;
                    if (result.error === 'superseded') return;
                    Dialog.alert(t(AD_ERRORS[result.error] || 'unlock.err_ad_generic'));
                } catch (err) {
                    window.dispatchEvent(new Event('adOverlayEnd'));
                    btn.innerHTML = label;
                    btn.disabled = false;
                    Dialog.alert(t('unlock.err_ad_generic'));
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
                        await showUnlockSuccess('restore');
                        resolve('iap');
                        return;
                    }
                    btn.disabled = false;
                    Dialog.alert(t(result.ok ? 'unlock.restore_none' : 'unlock.restore_offline'));
                } catch (err) {
                    btn.disabled = false;
                    Dialog.alert(t('unlock.restore_failed'));
                    console.warn('[store] restore failed:', err);
                }
            });

            Dialog.show({ title: t('unlock.title'), content, buttons: [], closeButton: true })
                .then(() => resolve('close'));
            overlayRef = Dialog.activeOverlay;

            androidStore.getProductPrice().then(({ price }) => {
                if (price) {
                    const sub = content.querySelector('.android-unlock-iap .android-unlock-sub');
                    if (sub) sub.textContent = t('unlock.price_permanent', { price });
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
