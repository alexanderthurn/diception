/**
 * Pointer passthrough shield.
 *
 * Prevents touch/mouse events that started on the canvas from accidentally
 * triggering buttons in a modal or dialog that opened mid-gesture.
 *
 * Usage:
 *   shieldFromPassthrough(element)  — call when showing any modal/dialog
 *
 * The module also auto-shields HTML .modal elements via MutationObserver.
 */

// Track all currently held pointer IDs globally.
const _activePointers = new Set();
document.addEventListener('pointerdown',   e => _activePointers.add(e.pointerId),    { capture: true, passive: true });
document.addEventListener('pointerup',     e => _activePointers.delete(e.pointerId), { capture: true, passive: true });
document.addEventListener('pointercancel', e => _activePointers.delete(e.pointerId), { capture: true, passive: true });

// While > 0, swallow all clicks on the document (covers browsers that fire
// click after pointerup even when preventDefault() was called on pointerup).
let _swallowClicks = 0;
document.addEventListener('click', e => {
    if (_swallowClicks > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, { capture: true });

/**
 * Absorb the first pointerup/pointercancel for every pointer that was already
 * held when this element became visible. Also swallows any click that arrives
 * in the same event-dispatch cycle.
 */
export function shieldFromPassthrough(el) {
    const tainted = new Set(_activePointers);
    if (tainted.size === 0) return;

    const absorb = (e) => {
        if (!tainted.has(e.pointerId)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // Briefly swallow clicks in case the browser fires one after this pointerup
        _swallowClicks++;
        setTimeout(() => { _swallowClicks--; }, 300);
        tainted.delete(e.pointerId);
        if (tainted.size === 0) {
            el.removeEventListener('pointerup',     absorb, true);
            el.removeEventListener('pointercancel', absorb, true);
        }
    };

    el.addEventListener('pointerup',     absorb, { capture: true });
    el.addEventListener('pointercancel', absorb, { capture: true });
}

// Auto-shield every .modal element the moment it becomes visible.
const _observer = new MutationObserver(mutations => {
    for (const m of mutations) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        const el = m.target;
        if (!el.classList.contains('modal')) continue;
        const wasHidden = m.oldValue?.split(' ').includes('hidden') ?? true;
        const nowVisible = !el.classList.contains('hidden');
        if (wasHidden && nowVisible) shieldFromPassthrough(el);
    }
});

// Start observing once the DOM is ready.
function _startObserver() {
    _observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startObserver);
} else {
    _startObserver();
}
