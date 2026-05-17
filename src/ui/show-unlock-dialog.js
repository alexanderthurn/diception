import { Dialog } from './dialog.js';
import { AndroidUnlockDialog } from './android-unlock-dialog.js';
import { isAndroid } from '../scenarios/user-identity.js';

export async function showUnlockDialog() {
    const result = isAndroid() ? await AndroidUnlockDialog.show() : await Dialog.showFullVersion();
    if (result !== 'close') window.dispatchEvent(new Event('versionUnlocked'));
    return result;
}
