import { Dialog } from './dialog.js';
import { AndroidUnlockDialog } from './android-unlock-dialog.js';
import { isAndroid } from '../scenarios/user-identity.js';

export function showUnlockDialog() {
    if (isAndroid()) return AndroidUnlockDialog.show();
    return Dialog.showFullVersion();
}
