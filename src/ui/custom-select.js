/**
 * Custom Select Dropdown
 * 
 * Replaces native <select> dropdowns with a styled HTML dropdown that:
 * - Scales properly at high resolutions (rendered in the scaled UI)
 * - Works with gamepad D-pad navigation (full option list, not ±1 cycling)
 * - Works with mouse/touch (click to open, click option to select)
 * 
 * Approach: Intercept clicks on <select> elements, prevent native dropdown,
 * show a custom dropdown panel. The <select> remains the source of truth.
 */

let activeDropdown = null;

/**
 * Open a custom dropdown for the given <select> element.
 * @param {HTMLSelectElement} selectEl
 */
export function openCustomSelect(selectEl) {
    // Close any existing dropdown first
    closeCustomSelect();

    // Create overlay (captures clicks outside)
    const overlay = document.createElement('div');
    overlay.className = 'custom-select-overlay';

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    dropdown.setAttribute('role', 'listbox');

    // Get the label text for the header
    const label = selectEl.closest('.control-group')?.querySelector('label')?.textContent
        || selectEl.closest('.probability-controls')?.querySelector('label')?.textContent
        || '';
    if (label) {
        const header = document.createElement('div');
        header.className = 'custom-select-header';
        header.textContent = label;
        dropdown.appendChild(header);
    }

    // Create option buttons
    const options = selectEl.options;
    let firstFocusTarget = null;

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.disabled) continue;

        const btn = document.createElement('button');
        btn.className = 'custom-select-option';
        btn.setAttribute('role', 'option');
        btn.setAttribute('data-index', i);
        btn.textContent = opt.textContent;

        if (i === selectEl.selectedIndex) {
            btn.classList.add('selected');
            btn.setAttribute('aria-selected', 'true');
            firstFocusTarget = btn;
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectEl.selectedIndex = i;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            closeCustomSelect();
        });

        dropdown.appendChild(btn);
    }

    // Position dropdown near the select element
    overlay.appendChild(dropdown);
    document.body.appendChild(overlay);
    activeDropdown = { overlay, dropdown, selectEl };

    // Position the dropdown
    positionDropdown(selectEl, dropdown);

    // Focus the currently selected option (or first option)
    const focusTarget = firstFocusTarget || dropdown.querySelector('.custom-select-option');
    if (focusTarget) {
        requestAnimationFrame(() => {
            focusTarget.focus({ preventScroll: false });
            // Scroll selected option into view
            focusTarget.scrollIntoView({ block: 'nearest' });
        });
    }

    // Close on overlay click (outside dropdown)
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) {
            e.preventDefault();
            e.stopPropagation();
            closeCustomSelect();
        }
    });

    // Close on Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeCustomSelect();
            document.removeEventListener('keydown', escHandler, true);
        }
    };
    document.addEventListener('keydown', escHandler, true);

    // Store escape handler for cleanup
    activeDropdown.escHandler = escHandler;
}

/**
 * Close the currently open custom select dropdown.
 */
export function closeCustomSelect() {
    if (!activeDropdown) return;
    const { overlay, escHandler } = activeDropdown;
    if (escHandler) {
        document.removeEventListener('keydown', escHandler, true);
    }
    overlay.classList.add('custom-select-fade-out');
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 150);
    activeDropdown = null;
}

/**
 * Check if a custom select dropdown is currently open.
 * @returns {boolean}
 */
export function isCustomSelectOpen() {
    return activeDropdown !== null;
}

/**
 * Position the dropdown near the select element.
 */
function positionDropdown(selectEl, dropdown) {
    const rect = selectEl.getBoundingClientRect();
    const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

    // Convert viewport coords to scaled coords
    const scaledTop = rect.bottom / uiScale;
    const scaledLeft = rect.left / uiScale;
    const scaledWidth = rect.width / uiScale;

    dropdown.style.position = 'absolute';
    dropdown.style.left = `${scaledLeft}px`;
    dropdown.style.top = `${scaledTop + 2}px`;
    dropdown.style.minWidth = `${scaledWidth}px`;

    // After rendering, check if it goes off-screen and flip above if needed
    requestAnimationFrame(() => {
        const dropRect = dropdown.getBoundingClientRect();
        const viewH = window.innerHeight;
        if (dropRect.bottom > viewH - 10) {
            // Position above the select instead
            const scaledBottom = rect.top / uiScale;
            dropdown.style.top = '';
            dropdown.style.bottom = `calc(100% - ${scaledBottom - 2}px)`;
        }
    });
}

/**
 * Initialize the custom select system.
 * Call once during app startup. Uses event delegation — no per-element setup needed.
 */
export function initCustomSelects() {
    // Intercept mousedown on <select> elements to prevent native dropdown
    document.addEventListener('mousedown', (e) => {
        const select = e.target.closest('select');
        if (!select) return;

        // Prevent native dropdown from opening
        e.preventDefault();
        e.stopPropagation();

        // If clicking the same select that's already open, just close it
        if (activeDropdown && activeDropdown.selectEl === select) {
            closeCustomSelect();
            return;
        }

        openCustomSelect(select);
    }, true); // Use capture to intercept before the native behavior

    // Also intercept click to prevent any lingering native behavior
    document.addEventListener('click', (e) => {
        const select = e.target.closest('select');
        if (!select) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // Intercept focus on selects to prevent keyboard-triggered native dropdown
    document.addEventListener('focus', (e) => {
        if (e.target.tagName === 'SELECT') {
            // Allow focus for accessibility but prevent native interaction
            e.target.addEventListener('keydown', preventSelectKeydown);
        }
    }, true);

    document.addEventListener('blur', (e) => {
        if (e.target.tagName === 'SELECT') {
            e.target.removeEventListener('keydown', preventSelectKeydown);
        }
    }, true);
}

/**
 * Prevent native select keyboard interaction, open custom dropdown instead.
 */
function preventSelectKeydown(e) {
    if (['ArrowDown', 'ArrowUp', 'Space', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Space') {
            openCustomSelect(e.target);
        }
    }
}
