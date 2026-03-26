/**
 * Mounts the shared Custom Game "Mods" field block into a container.
 * Markup lives once in index.html (#shared-mods-fields-template); ids are assigned per instance.
 */

const TEMPLATE_ID = 'shared-mods-fields-template';

/**
 * @param {HTMLElement | null} container
 * @param {{ idPrefix?: string, hideTournamentRow?: boolean }} [options]
 */
export function mountSharedModsFields(container, { idPrefix = '', hideTournamentRow = false } = {}) {
    if (!container) return;
    const tpl = document.getElementById(TEMPLATE_ID);
    if (!tpl) {
        console.warn('[shared-mods-fields] missing #' + TEMPLATE_ID);
        return;
    }
    const root = tpl.content.cloneNode(true);
    const mountRoot = root.querySelector('.shared-mods-fields-root');
    if (!mountRoot) return;

    mountRoot.querySelectorAll('[data-mods-el]').forEach((el) => {
        el.id = idPrefix + el.dataset.modsEl;
    });
    mountRoot.querySelectorAll('[data-mods-group]').forEach((el) => {
        el.id = idPrefix + el.dataset.modsGroup;
    });
    mountRoot.querySelectorAll('[data-mods-val]').forEach((el) => {
        el.id = idPrefix + el.dataset.modsVal;
    });

    const tournamentRow = mountRoot.querySelector('[data-mods-tournament-row]');
    if (tournamentRow && hideTournamentRow) {
        tournamentRow.classList.add('hidden');
    }

    container.appendChild(mountRoot);
}
