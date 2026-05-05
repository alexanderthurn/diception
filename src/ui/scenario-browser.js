import { Dialog } from './dialog.js';
import { CampaignManager } from '../scenarios/campaign-manager.js';
import { getGridDimensions } from '../scenarios/campaign-data.js';
import { getSolvedLevels, markLevelSolved } from '../scenarios/campaign-progress.js';
import { getCachedIdentity, isFullVersion } from '../scenarios/user-identity.js';
import { getActiveModsSummary } from './mods-panel-helpers.js';
import { GAME } from '../core/constants.js';

/** Dev-only campaign tools (import/export JSON, etc.): ?dev=true or ?dev=1 */
function isCampaignDevToolsEnabled() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('dev')) return false;
    const v = (params.get('dev') ?? '').toLowerCase();
    return v === '' || v === '1' || v === 'true' || v === 'yes';
}

/**
 * ScenarioBrowser - Campaign-based map/level selection
 * Shows campaign list, then level grid. Supports play and edit (for own campaign).
 */
export class ScenarioBrowser {
    constructor(configManager, mapEditor) {
        this.configManager = configManager;
        this.mapEditor = mapEditor;
        this.campaignManager = new CampaignManager();

        this.pendingLevel = null;
        this.pendingCampaign = null;
        this.selectedCampaign = null;
        this.selectedLevelIndex = null;
        this.isOwner = false;
        this.customSetupLevelActive = false;
        this.customSetupLevel = null;

        this.scenarioBrowserModal = document.getElementById('scenario-browser-modal');
        this.scenarioBrowserCloseBtn = document.getElementById('scenario-browser-close-btn');
        this.campaignSelectView = document.getElementById('campaign-select-view');
        this.campaignDetailView = document.getElementById('campaign-detail-view');
        this.campaignDetailTitle = document.getElementById('campaign-detail-title');
        this.campaignButtonList = document.getElementById('campaign-button-list');
        // Legacy refs (hidden, kept for compat)
        this.campaignList = document.getElementById('campaign-list');
        this.campaignSelect = document.getElementById('campaign-select');
        this.levelGridContainer = document.getElementById('level-grid-container');
        this.levelGrid = document.getElementById('level-grid');
        this.campaignUserActions = document.getElementById('campaign-user-actions');
        this.levelGridHeader = document.getElementById('level-grid-header');
        this.previewContent = document.getElementById('scenario-preview-content');
        this.setupModal = document.getElementById('setup-modal');

        this.onScenarioLoaded = null;
        this.onStartGame = null;
        this.onOpenCustomFromLevel = null;
        this.effectsManager = null;

        this.BACKEND_URL = '';
        this.hoverPreviewEl = null;
        this.justSavedLevelIndex = null;
        this._configPreviewCache = new Map();
        this._gridResizeObserver = null;
        this._gridResizeDebounce = null;
    }

    async determineBackendURL() {
        this.BACKEND_URL = window.location.hostname === 'localhost'
            ? 'https://feuerware.com/2025/diception/dev/backend'
            : window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') + '/backend';
        if (window.steam) {
            const isSteamDev = await window.steam.isDev();
            this.BACKEND_URL = isSteamDev
                ? 'https://feuerware.com/2025/diception/dev/backend'
                : 'https://diception.feuerware.com/backend';
        }
    }

    async init() {
        await this.determineBackendURL();
        this.setupEventListeners();
        await this.tryLoadSavedLevel();
    }

    setEffectsManager(effectsManager) {
        this.effectsManager = effectsManager;
    }

    setOnStartGame(fn) {
        this.onStartGame = fn;
    }

    setOnOpenCustomFromLevel(fn) {
        this.onOpenCustomFromLevel = fn;
    }

    async open() {
        this.scenarioBrowserModal.classList.remove('hidden');
        this.pendingLevel = null;
        await this.showCampaignView();
    }

    async openUserCampaign() {
        this.scenarioBrowserModal.classList.remove('hidden');
        this.pendingLevel = null;
        const campaigns = this.campaignManager.listCampaigns();
        let userCampaign = campaigns.find(c => c.isUserCampaign);
        if (!userCampaign) {
            userCampaign = { id: '_user_empty', owner: 'Your Campaign', levels: [], isUserCampaign: true, isEmpty: true };
        }
        await this.showLevelGridView(userCampaign);
    }

    hasHoverCapability() {
        return window.matchMedia('(hover: hover)').matches;
    }

    setupEventListeners() {
        const scenariosBtn = document.getElementById('scenarios-btn');
        if (scenariosBtn) {
            scenariosBtn.addEventListener('click', () => this.open());
        }

        if (this.scenarioBrowserCloseBtn) {
            this.scenarioBrowserCloseBtn.addEventListener('click', () => this.handleBack());
        }

        // Show hover preview when a level tile receives keyboard/gamepad focus
        if (this.levelGrid) {
            this.levelGrid.addEventListener('focusin', (e) => {
                const tile = e.target.closest('.level-grid-tile:not(.add-tile)');
                if (!tile) return;
                const idx = parseInt(tile.dataset.index, 10);
                if (isNaN(idx)) return;
                const level = this.selectedCampaign?.levels?.[idx];
                if (!level) return;
                this._hoveredLevelIndex = idx;
                this.showHoverPreview(level, tile);
            });
            this.levelGrid.addEventListener('focusout', (e) => {
                if (!e.relatedTarget?.closest?.('.level-grid-tile')) {
                    this._hoveredLevelIndex = null;
                    this.hideHoverPreview();
                }
            });
        }
    }

    _disconnectGridResizeObserver() {
        if (this._gridResizeObserver && this.levelGridContainer?.parentElement) {
            this._gridResizeObserver.disconnect();
            this._gridResizeObserver = null;
        }
        if (this._gridResizeDebounce) {
            clearTimeout(this._gridResizeDebounce);
            this._gridResizeDebounce = null;
        }
    }

    _connectGridResizeObserver() {
        this._disconnectGridResizeObserver();
        const parent = this.levelGridContainer?.parentElement;
        if (!parent) return;
        this._gridResizeObserver = new ResizeObserver(() => {
            if (this._gridResizeDebounce) clearTimeout(this._gridResizeDebounce);
            this._gridResizeDebounce = setTimeout(() => {
                this._gridResizeDebounce = null;
                if (this.selectedCampaign && !this.levelGridContainer.classList.contains('hidden')) {
                    this.renderLevelGrid(this.selectedCampaign);
                }
            }, 100);
        });
        this._gridResizeObserver.observe(parent);
    }

    async showCampaignView() {
        this.selectedCampaign = null;
        this._disconnectGridResizeObserver();
        if (this.campaignSelectView) this.campaignSelectView.classList.remove('hidden');
        if (this.campaignDetailView) this.campaignDetailView.classList.add('hidden');
        await this.renderCampaignList();
    }

    restoreLastSelectedCampaign() {
        const last = localStorage.getItem('dicy_lastCampaign');
        const lastIsUser = localStorage.getItem('dicy_lastCampaignIsUser') === '1';
        const campaigns = this.campaignManager.listCampaigns();
        let campaign = null;

        if (lastIsUser) {
            // Came from "Your Campaign" — restore directly, never fall through to a builtin
            const uc = this.campaignManager.userCampaign;
            if (uc) {
                campaign = { ...uc, isUserCampaign: true };
            } else {
                campaign = { owner: 'Your Campaign', levels: [], isEmpty: true, isUserCampaign: true };
            }
        } else if (last) {
            campaign = this.campaignManager.getCampaign(last);
        }

        if (!campaign && campaigns.length > 0) {
            const first = campaigns[0];
            campaign = (first.isEmpty || (first.levels?.length === 0 && first.isUserCampaign))
                ? { ...first, isEmpty: true } : first;
        }

        if (campaign) {
            this.selectedCampaign = campaign;
            this.showLevelGridView(campaign);
        }
    }

    showLevelGridView(campaign) {
        this.selectedCampaign = campaign;
        if (campaign?.owner) localStorage.setItem('dicy_lastCampaign', campaign.owner);
        if (campaign?.isUserCampaign) {
            localStorage.setItem('dicy_lastCampaignIsUser', '1');
        } else {
            localStorage.removeItem('dicy_lastCampaignIsUser');
        }
        if (this.campaignSelectView) this.campaignSelectView.classList.add('hidden');
        if (this.campaignDetailView) this.campaignDetailView.classList.remove('hidden');
        this._connectGridResizeObserver();
        this.renderLevelGrid(campaign);
    }

    getCampaignDisplayName(c) {
        const nameMap = {
            'Tutorial': 'Tutorial',
            'chapter1': 'Chapter 1',
            'chapter2': 'Chapter 2',
            'chapter3': 'Chapter 3',
            'chapter4': 'Chapter 4',
        };
        if (c.isUserCampaign) return 'Your Campaign';
        return nameMap[c.owner] ?? c.owner;
    }

    async renderCampaignList() {
        // User campaign is accessed via the Map Editor icon — exclude from the campaign list
        const campaigns = this.campaignManager.listCampaigns().filter(c => !c.isUserCampaign);

        getCachedIdentity();

        if (!this.campaignButtonList) return;
        this.campaignButtonList.innerHTML = '';

        const tutorials = campaigns.filter(c => c.id === 'tutorial' || c.owner === 'Tutorial');
        const chapters = campaigns.filter(c => c.id !== 'tutorial' && c.owner !== 'Tutorial' && !(c.isBuiltIn && (c.levels?.length ?? 0) === 0));

        // Find first unsolved across all campaigns for gamepad autofocus
        const firstUnsolvedCampaignIdx = campaigns.findIndex(c => {
            const levelCount = c.levels?.length ?? 0;
            const solvedCount = getSolvedLevels(c.owner).length;
            return levelCount > 0 && solvedCount < levelCount;
        });

        const fullVersion = isFullVersion();

        const makeCampaignBtn = (c, isAutofocus, chapterColorIndex = -1) => {
            const levelCount = c.levels?.length ?? 0;
            const solvedCount = getSolvedLevels(c.owner).length;
            const allComplete = levelCount > 0 && solvedCount >= levelCount;
            const isTutorial = c.id === 'tutorial' || c.owner === 'Tutorial';
            const locked = !fullVersion && !isTutorial;
            const displayName = this.getCampaignDisplayName(c);

            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'campaign-list-node';

            const comingSoon = c.isBuiltIn && levelCount === 0;

            const btn = document.createElement('button');
            btn.className = 'tron-btn large campaign-select-btn' + (locked ? ' btn-locked' : '') + (comingSoon ? ' btn-coming-soon' : '');
            if (!locked && isAutofocus) btn.dataset.gamepadAutofocus = '';
            if (chapterColorIndex >= 0) {
                const hex = '#' + GAME.HUMAN_COLORS[chapterColorIndex % GAME.HUMAN_COLORS.length].toString(16).padStart(6, '0');
                btn.style.setProperty('--chapter-color', hex);
            }

            const nameSpan = document.createElement('span');
            if (locked) {
                nameSpan.innerHTML = '<span class="sprite-icon icon-lock"></span> ';
                nameSpan.appendChild(document.createTextNode(displayName));
            } else if (allComplete) {
                nameSpan.innerHTML = '<span class="sprite-icon icon-check"></span> ';
                nameSpan.appendChild(document.createTextNode(displayName));
            } else {
                nameSpan.textContent = displayName;
            }

            const subSpan = document.createElement('span');
            subSpan.className = 'campaign-btn-sub';
            if (locked) {
                subSpan.textContent = 'Full version only';
            } else if (comingSoon) {
                subSpan.textContent = 'Coming soon';
            } else if (levelCount === 0) {
                subSpan.textContent = '—';
            } else {
                const pct = Math.round(solvedCount / levelCount * 100);
                subSpan.textContent = allComplete ? '100%' : `${pct}%`;
            }

            btn.appendChild(nameSpan);
            btn.appendChild(subSpan);

            btn.addEventListener('click', () => {
                if (locked) { Dialog.showFullVersion(); return; }
                if (comingSoon) return;
                const target = (c.isEmpty || (c.levels && c.levels.length === 0 && c.isUserCampaign))
                    ? { ...c, isEmpty: true } : c;
                this.showLevelGridView(target);
            });

            nodeDiv.appendChild(btn);
            return nodeDiv;
        };

        // Tutorial: standalone at top
        tutorials.forEach(c => {
            const isAutofocus = campaigns.indexOf(c) === firstUnsolvedCampaignIdx;
            this.campaignButtonList.appendChild(makeCampaignBtn(c, isAutofocus));
        });

        // Separator + chapters grid below
        if (tutorials.length > 0 && chapters.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'campaign-tutorial-separator';
            this.campaignButtonList.appendChild(sep);
        }

        if (chapters.length > 0) {
            const chaptersGrid = document.createElement('div');
            chaptersGrid.className = 'campaign-chapters-grid';
            chapters.forEach((c, i) => {
                const isAutofocus = campaigns.indexOf(c) === firstUnsolvedCampaignIdx;
                chaptersGrid.appendChild(makeCampaignBtn(c, isAutofocus, i));
            });
            this.campaignButtonList.appendChild(chaptersGrid);
        }
    }

    exportUserCampaignJson() {
        const payload = this.campaignManager.getExportPayload();
        const text = JSON.stringify(payload, null, 2);
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const base = String(payload.id || 'campaign').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'campaign';
        a.download = `${base}.json`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    renderCampaignDevToolbar() {
        if (!this.campaignUserActions) return;
        this.campaignUserActions.innerHTML = '';

        this._devImportableCampaigns = [
            ...this.campaignManager.builtinCampaigns,
            ...(this.campaignManager.onlineCampaigns || [])
        ];

        const copyRow = document.createElement('div');
        copyRow.className = 'campaign-dev-import-row';

        const sourceSelect = document.createElement('select');
        sourceSelect.className = 'campaign-dev-import-select';
        sourceSelect.setAttribute('aria-label', 'Built-in or online campaign to copy into yours');

        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = 'Copy from campaign…';
        placeholderOpt.disabled = true;
        placeholderOpt.selected = true;
        sourceSelect.appendChild(placeholderOpt);

        this._devImportableCampaigns.forEach((c, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            const label = this.getCampaignDisplayName(c);
            const count = c.levels?.length ?? 0;
            opt.textContent = `${label} (${count})`;
            sourceSelect.appendChild(opt);
        });

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'tron-btn small campaign-dev-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', 'Copy the selected campaign into your campaign');
        copyBtn.addEventListener('click', () => this.importUserCampaignFromExisting(sourceSelect));

        copyRow.appendChild(sourceSelect);
        copyRow.appendChild(copyBtn);

        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'tron-btn small campaign-dev-btn';
        importBtn.textContent = 'Import JSON';
        importBtn.setAttribute('aria-label', 'Import campaign from a JSON file');
        importBtn.addEventListener('click', () => this.importUserCampaignJson());

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'tron-btn small campaign-dev-btn';
        exportBtn.textContent = 'Export JSON';
        exportBtn.setAttribute('aria-label', 'Download your campaign as JSON');
        exportBtn.addEventListener('click', () => this.exportUserCampaignJson());

        this.campaignUserActions.appendChild(copyRow);
        this.campaignUserActions.appendChild(importBtn);
        this.campaignUserActions.appendChild(exportBtn);
    }

    async importUserCampaignFromExisting(sourceSelect) {
        if (!isCampaignDevToolsEnabled()) return;
        const idx = parseInt(sourceSelect.value, 10);
        if (Number.isNaN(idx) || idx < 0) {
            await Dialog.alert('Choose a campaign from the list first.', 'Copy campaign');
            return;
        }
        const source = this._devImportableCampaigns?.[idx];
        if (!source?.levels?.length) {
            await Dialog.alert('That campaign has no levels.', 'Copy campaign');
            return;
        }

        const displayName = this.getCampaignDisplayName(source);
        const proceed = await Dialog.confirm(
            `Replace your entire saved campaign with "${displayName}" (${source.levels.length} levels)?`,
            'Copy campaign'
        );
        if (!proceed) return;

        const imp = await this.campaignManager.importFromExistingCampaign(source);
        if (!imp.ok) {
            await Dialog.alert(imp.errors.join('\n'), 'Copy failed');
            return;
        }
        this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
        await this.renderLevelGrid(this.selectedCampaign);
    }

    async importUserCampaignJson() {
        if (!isCampaignDevToolsEnabled()) return;
        const proceed = await Dialog.confirm(
            'Replace your entire saved campaign with the imported JSON file?',
            'Import campaign'
        );
        if (!proceed) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const imp = await this.campaignManager.importFromPortableJson(data);
                if (!imp.ok) {
                    await Dialog.alert(imp.errors.join('\n'), 'Import failed');
                    return;
                }
                this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                await this.renderLevelGrid(this.selectedCampaign);
            } catch (e) {
                await Dialog.alert(e?.message || String(e), 'Import failed');
            }
        });
        input.click();
    }

    handleBack() {
        if (this.campaignDetailView && !this.campaignDetailView.classList.contains('hidden')) {
            // Detail view → go back to campaign selection
            this.showCampaignView();
        } else {
            // Selection view → close browser, go to main menu
            this._disconnectGridResizeObserver();
            localStorage.removeItem('dicy_campaignMode');
            this.scenarioBrowserModal.classList.add('hidden');
            document.getElementById('main-menu')?.classList.remove('hidden');
            if (this.effectsManager) this.effectsManager.startIntroMode();
        }
    }

    async renderLevelGrid(campaign) {
        if (!campaign) return;

        const identity = await getCachedIdentity();
        const isUserCampaign = campaign.isUserCampaign ||
            campaign.owner === 'Your Campaign' ||
            (campaign.ownerId && campaign.ownerId === identity.ownerId);

        this.isOwner = isUserCampaign;
        const levels = campaign.levels || [];

        const ownerLabel = isUserCampaign ? 'Your Campaign' : (campaign.owner || 'Unnamed Campaign');
        if (this.campaignDetailTitle) this.campaignDetailTitle.textContent = ownerLabel;
        const totalSlots = this.isOwner ? levels.length + 1 : levels.length;
        const containerWidth = this.levelGridContainer.offsetWidth
            || this.levelGridContainer.parentElement?.offsetWidth
            || 400;
        const { cols, rows } = getGridDimensions(totalSlots, containerWidth);

        const loadedOwner = localStorage.getItem('dicy_loadedCampaign');
        const loadedIdx = localStorage.getItem('dicy_loadedLevelIndex');
        const lastOwner = localStorage.getItem('dicy_lastCampaign');
        const solvedLevels = getSolvedLevels(campaign.owner);

        // Find first level not yet solved to highlight it
        let firstUnsolvedIndex = -1;
        for (let i = 0; i < levels.length; i++) {
            if (!solvedLevels.includes(i)) {
                firstUnsolvedIndex = i;
                break;
            }
        }

        // Synchronize pending selection with UI for the main menu START button
        if (firstUnsolvedIndex === -1) {
            this.clearPendingScenario();
        } else {
            const level = levels[firstUnsolvedIndex];
            this.pendingLevel = level;
            this.pendingCampaign = campaign;
            this.selectedLevelIndex = firstUnsolvedIndex;

            localStorage.setItem('dicy_loadedCampaign', campaign.owner);
            localStorage.setItem('dicy_loadedLevelIndex', String(firstUnsolvedIndex));
            if (campaign.ownerId) {
                localStorage.setItem('dicy_loadedCampaignId', campaign.ownerId);
            } else {
                localStorage.removeItem('dicy_loadedCampaignId');
            }
        }

        if (this.campaignUserActions) {
            if (isUserCampaign && isCampaignDevToolsEnabled()) {
                this.campaignUserActions.classList.remove('hidden');
                this.renderCampaignDevToolbar();
            } else {
                this.campaignUserActions.classList.add('hidden');
                this.campaignUserActions.innerHTML = '';
            }
        }

        this.levelGridHeader.innerHTML = `<span>${ownerLabel}</span><span>${levels.length} levels</span>`;

        // Derive chapter color index (non-tutorial chapters get color by their index in the chapters list)
        const allCampaigns = this.campaignManager.listCampaigns().filter(c => !c.isUserCampaign);
        const chapters = allCampaigns.filter(c => c.id !== 'tutorial' && c.owner !== 'Tutorial');
        const chapterColorIndex = chapters.findIndex(c => c.owner === campaign.owner);
        if (chapterColorIndex >= 0) {
            const hex = '#' + GAME.HUMAN_COLORS[chapterColorIndex % GAME.HUMAN_COLORS.length].toString(16).padStart(6, '0');
            this.levelGrid.style.setProperty('--chapter-color', hex);
        } else {
            this.levelGrid.style.removeProperty('--chapter-color');
        }

        // Use 6 flexible columns
        const COLS = 6;
        this.levelGrid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
        this.levelGrid.style.gridTemplateRows = '';
        this.levelGrid.innerHTML = '';

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const tile = document.createElement('div');
            tile.className = 'level-grid-tile';
            tile.tabIndex = 0;
            if (firstUnsolvedIndex === i) {
                tile.classList.add('selected');
                tile.dataset.gamepadAutofocus = '';
            }
            if (this.justSavedLevelIndex === i) tile.classList.add('just-saved');
            if (solvedLevels.includes(i)) tile.classList.add('solved');
            tile.dataset.index = i;

            const idxSpan = document.createElement('span');
            idxSpan.className = 'tile-index';
            idxSpan.textContent = i + 1;
            tile.appendChild(idxSpan);

            if (this.hasHoverCapability()) {
                tile.addEventListener('mouseenter', () => { this._hoveredLevelIndex = i; this.showHoverPreview(level, tile); });
                tile.addEventListener('mouseleave', () => { this._hoveredLevelIndex = null; this.hideHoverPreview(); });
            }
            tile.addEventListener('click', () => this.showLevelPreviewDialog(level, i));
            this.levelGrid.appendChild(tile);
        }

        if (this.isOwner) {
            const addTile = document.createElement('div');
            addTile.className = 'level-grid-tile add-tile';
            addTile.tabIndex = 0;
            addTile.innerHTML = '<span class="sprite-icon icon-zoom-in"></span>';
            addTile.addEventListener('click', () => this.openEditorForNewLevel(levels.length));
            this.levelGrid.appendChild(addTile);
        }
    }

    /**
     * Build level info string for preview (maxDice, diceSides, bots, botAI, mapStyle)
     */
    getLevelInfoLines(level) {
        const lines = [];
        const maxDice = level.maxDice ?? 9;
        const diceSides = level.diceSides ?? 6;
        lines.push(`Max ${maxDice} · ${diceSides}‑sided`);
        const bots = (level.players || []).filter(p => p.isBot).length;
        const aiIds = [...new Set((level.players || []).filter(p => p.isBot).map(p => p.aiId || 'easy'))];
        const botAIStr = aiIds.length ? aiIds.join(', ') : (bots ? 'easy' : '—');
        lines.push(`${level.width || '?'}×${level.height || '?'}`);
        if (bots > 0) lines.push(`${bots} bot${bots !== 1 ? 's' : ''} · ${botAIStr}`);
        return lines;
    }

    async showHoverPreview(level, tile) {
        this.hideHoverPreview();
        const index = tile?.dataset?.index != null ? parseInt(tile.dataset.index, 10) : -1;
        const previewLevel = level;
        const el = document.createElement('div');
        el.className = 'level-hover-preview';
        const isSolved = index >= 0 && this.selectedCampaign?.owner && getSolvedLevels(this.selectedCampaign.owner).includes(index);
        if (isSolved) {
            el.classList.add('level-hover-preview-solved');
            const solvedIcon = document.createElement('span');
            solvedIcon.className = 'sprite-icon icon-check level-solved-icon level-solved-icon-hover';
            el.appendChild(solvedIcon);
        }
        const size = Math.min(80, Math.floor(window.innerWidth * 0.3), 128);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.style.setProperty('--preview-size', size + 'px');
        this.renderMinimap(canvas, previewLevel);
        el.appendChild(canvas);
        const info = document.createElement('div');
        info.className = 'level-hover-preview-info';
        info.textContent = this.getLevelInfoLines(level).join(' · ');
        el.appendChild(info);
        document.body.appendChild(el);
        const rect = tile.getBoundingClientRect();
        const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
        const localLeft = rect.left / uiScale;
        const localTop = rect.top / uiScale;
        const localViewW = window.innerWidth / uiScale;
        const previewW = el.offsetWidth;
        const previewH = el.offsetHeight;
        el.style.left = Math.min(localLeft, localViewW - previewW - 8) + 'px';
        el.style.top = Math.max(4, localTop - previewH - 20) + 'px';
        this.hoverPreviewEl = el;
    }

    hideHoverPreview() {
        if (this.hoverPreviewInterval) {
            clearInterval(this.hoverPreviewInterval);
            this.hoverPreviewInterval = null;
        }
        if (this.hoverPreviewEl?.parentNode) {
            this.hoverPreviewEl.parentNode.removeChild(this.hoverPreviewEl);
        }
        this.hoverPreviewEl = null;
    }

    async showLevelPreviewDialog(level, index) {
        const campaign = this.selectedCampaign;
        const levels = campaign?.levels ?? [];
        const totalLevels = levels.length;

        const buildContent = async (idx) => {
            const lvl = this.campaignManager.getLevel(campaign, idx);
            if (!lvl) return null;
            const previewLevel = lvl;
            const content = document.createElement('div');
            content.className = 'level-preview-dialog-content';
            const isSolved = campaign?.owner && getSolvedLevels(campaign.owner).includes(idx);
            if (isSolved) {
                content.classList.add('level-preview-solved');
                const solvedIcon = document.createElement('span');
                solvedIcon.className = 'sprite-icon icon-check level-solved-icon level-solved-icon-dialog';
                content.appendChild(solvedIcon);
            }
            const size = Math.min(160, Math.floor(window.innerWidth * 0.5), 256);

            const navRow = document.createElement('div');
            navRow.className = 'level-preview-nav-row';
            const prevBtn = document.createElement('button');
            prevBtn.className = 'level-preview-nav level-preview-nav-left tron-btn small' + (idx <= 0 ? ' hidden' : '');
            prevBtn.innerHTML = '‹';
            prevBtn.disabled = idx <= 0;
            const nextBtn = document.createElement('button');
            nextBtn.className = 'level-preview-nav level-preview-nav-right tron-btn small' + (idx >= totalLevels - 1 ? ' hidden' : '');
            nextBtn.innerHTML = '›';
            nextBtn.disabled = idx >= totalLevels - 1;

            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'level-preview-canvas-wrap';
            const canvas = document.createElement('canvas');
            canvas.className = 'level-preview-canvas';
            canvas.width = size;
            canvas.height = size;
            canvas.style.setProperty('--preview-size', size + 'px');
            this.renderMinimap(canvas, previewLevel);
            canvasWrap.appendChild(prevBtn);
            canvasWrap.appendChild(canvas);
            canvasWrap.appendChild(nextBtn);
            navRow.appendChild(canvasWrap);
            content.appendChild(navRow);

            const p = document.createElement('p');
            p.className = 'level-preview-type';
            const typeLabel = lvl.type === 'map' ? 'Map' : 'Scenario';
            p.textContent = `${typeLabel} · Level ${idx + 1}`;
            content.appendChild(p);

            const modSummary = getActiveModsSummary(lvl);
            if (modSummary) {
                const modP = document.createElement('p');
                modP.className = 'level-preview-mods';
                modP.textContent = modSummary;
                content.appendChild(modP);
            }
            return { content, prevBtn, nextBtn };
        };

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay level-preview-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'modal dialog-box level-preview-dialog';

        const header = document.createElement('div');
        header.className = 'dialog-header dialog-header-with-close dialog-header-close-left';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'dialog-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Close');
        header.appendChild(closeBtn);

        const titleEl = document.createElement('h1');
        titleEl.className = 'tron-title small';
        titleEl.textContent = `#${index + 1}`;
        header.appendChild(titleEl);
        dialog.appendChild(header);

        const body = document.createElement('div');
        body.className = 'dialog-body';

        const startDynamicUpdate = (_lvl, _canvas) => {};

        let currentIndex = index;
        const updateContent = async (idx) => {
            currentIndex = idx;
            titleEl.textContent = `#${idx + 1}`;
            const built = await buildContent(idx);
            if (!built) return;
            body.innerHTML = '';
            body.appendChild(built.content);
            built.prevBtn.addEventListener('click', () => { if (currentIndex > 0) updateContent(currentIndex - 1); });
            built.nextBtn.addEventListener('click', () => { if (currentIndex < totalLevels - 1) updateContent(currentIndex + 1); });

            // Re-render actions to update move button states
            updateActions(idx);

            // Handle dynamic procedural update
            const canvas = built.content.querySelector('.level-preview-canvas');
            const lvl = this.campaignManager.getLevel(campaign, idx);
            startDynamicUpdate(lvl, canvas);
        };

        const actions = document.createElement('div');
        actions.className = 'dialog-actions level-preview-actions';

        const updateActions = (idx) => {
            actions.innerHTML = '';
            const primaryRow = document.createElement('div');
            primaryRow.className = 'dialog-actions-row';
            const secondaryRow = document.createElement('div');
            secondaryRow.className = 'dialog-actions-row dialog-actions-row-secondary';

            const playBtn = document.createElement('button');
            playBtn.className = 'tron-btn primary';
            playBtn.dataset.noSfx = '';
            playBtn.dataset.gamepadAutofocus = '';
            playBtn.textContent = 'Play';
            playBtn.onclick = () => finish('play');
            primaryRow.appendChild(playBtn);

            const solved = campaign?.owner && getSolvedLevels(campaign.owner).includes(idx);
            if (solved) {
                const customBtn = document.createElement('button');
                customBtn.className = 'tron-btn';
                customBtn.textContent = 'Custom';
                customBtn.onclick = () => finish('custom');
                primaryRow.appendChild(customBtn);
            }


            if (this.isOwner) {
                const editBtn = document.createElement('button');
                editBtn.className = 'tron-btn small';
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => finish('edit');
                secondaryRow.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'tron-btn small danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => finish('delete');
                secondaryRow.appendChild(deleteBtn);

                const moveLeftBtn = document.createElement('button');
                moveLeftBtn.className = 'tron-btn small move-btn';
                moveLeftBtn.textContent = '← Move';
                moveLeftBtn.disabled = idx <= 0;
                moveLeftBtn.onclick = async () => {
                    this.campaignManager.moveUserLevel(idx, idx - 1);
                    if (this.selectedCampaign.isUserCampaign) {
                        this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                    }
                    this.renderLevelGrid(this.selectedCampaign);
                    await updateContent(idx - 1);
                };
                secondaryRow.appendChild(moveLeftBtn);

                const moveRightBtn = document.createElement('button');
                moveRightBtn.className = 'tron-btn small move-btn';
                moveRightBtn.textContent = 'Move →';
                moveRightBtn.disabled = idx >= totalLevels - 1;
                moveRightBtn.onclick = async () => {
                    this.campaignManager.moveUserLevel(idx, idx + 1);
                    if (this.selectedCampaign.isUserCampaign) {
                        this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                    }
                    this.renderLevelGrid(this.selectedCampaign);
                    await updateContent(idx + 1);
                };
                secondaryRow.appendChild(moveRightBtn);
            }

            actions.appendChild(primaryRow);
            if (secondaryRow.children.length) actions.appendChild(secondaryRow);
        };

        let finish;
        // Initial setup
        await updateContent(index);

        dialog.appendChild(body);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        if (Dialog.activeOverlay) Dialog.close(Dialog.activeOverlay);
        Dialog.activeOverlay = overlay;

        new Promise((resolve) => {
            finish = (value) => {
                if (this.dialogPreviewInterval) {
                    clearInterval(this.dialogPreviewInterval);
                    this.dialogPreviewInterval = null;
                }
                overlay.classList.add('fade-out');
                setTimeout(() => {
                    overlay.parentNode?.removeChild(overlay);
                    Dialog.activeOverlay = null;
                }, 300);
                resolve(value);
            };
            closeBtn.addEventListener('click', () => finish('close'));
        }).then(result => {
            const idx = currentIndex;
            if (result === 'play') this.selectAndPlayLevel(idx, { immediateStart: true });
            else if (result === 'custom') this.selectLevelForCustomGame(idx);
            else if (result === 'edit') this.openEditorForLevel(idx);
            else if (result === 'delete') this.deleteLevel(idx);
        });
    }

    async deleteLevel(index) {
        if (!this.isOwner || !this.selectedCampaign) return;
        if (!(await Dialog.confirm('Delete this level?'))) return;
        this.campaignManager.removeUserLevel(index);
        if (this.selectedCampaign.isUserCampaign) {
            this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
        }
        this.renderLevelGrid(this.selectedCampaign);
    }

    renderMinimap(canvas, level) {
        const ctx = canvas.getContext('2d');
        const w = level.width || 5;
        const h = level.height || 5;
        const gap = 1;
        const cellSize = Math.min((canvas.width - (w - 1) * gap) / w, (canvas.height - (h - 1) * gap) / h);
        const totalW = w * cellSize + (w - 1) * gap;
        const totalH = h * cellSize + (h - 1) * gap;
        const ox = (canvas.width - totalW) / 2;
        const oy = (canvas.height - totalH) / 2;

        const grd = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.5);
        grd.addColorStop(0, '#0a1a2a');
        grd.addColorStop(1, '#050510');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        for (let ix = 0; ix <= w; ix++) {
            const x = ox + ix * (cellSize + gap) - gap / 2;
            ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + totalH); ctx.stroke();
        }
        for (let iy = 0; iy <= h; iy++) {
            const y = oy + iy * (cellSize + gap) - gap / 2;
            ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + totalW, y); ctx.stroke();
        }

        const tiles = level.tiles || [];
        const playerColors = {};
        if (level.players) {
            level.players.forEach(p => { playerColors[p.id] = p.color; });
        }

        tiles.forEach(t => {
            const x = ox + t.x * (cellSize + gap);
            const y = oy + t.y * (cellSize + gap);
            let colorStr = '#223344';
            if (t.owner !== undefined && t.owner !== -1 && playerColors[t.owner]) {
                colorStr = '#' + playerColors[t.owner].toString(16).padStart(6, '0');
            }

            ctx.fillStyle = colorStr;
            ctx.fillRect(x, y, cellSize, cellSize);

            // Subtle highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(x, y, cellSize, cellSize / 2);
        });
    }

    mapEditorCallbacksForCampaignLevel(levelIndex) {
        return {
            onSave: (data) => {
                this.campaignManager.setUserLevel(levelIndex, data);
                if (this.selectedCampaign.isUserCampaign) {
                    this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                }
                this.justSavedLevelIndex = levelIndex;
                this.scenarioBrowserModal.classList.remove('hidden');
                this.showLevelGridView(this.selectedCampaign);
                setTimeout(() => {
                    this.justSavedLevelIndex = null;
                    this.renderLevelGrid(this.selectedCampaign);
                }, 2000);
            },
            onClose: () => {
                if (this.effectsManager) this.effectsManager.startIntroMode();
                this.scenarioBrowserModal.classList.remove('hidden');
                this.showLevelGridView(this.selectedCampaign);
            }
        };
    }

    selectAndPlayLevel(index, opts = {}) {
        const level = this.campaignManager.getLevel(this.selectedCampaign, index);
        if (!level) return;

        this.pendingLevel = level;
        this.pendingCampaign = this.selectedCampaign;
        this.selectedLevelIndex = index;
        this.customSetupLevelActive = false;
        this.customSetupLevel = null;

        localStorage.setItem('dicy_loadedCampaign', this.selectedCampaign.owner);
        localStorage.setItem('dicy_loadedLevelIndex', String(index));
        if (this.selectedCampaign.ownerId) {
            localStorage.setItem('dicy_loadedCampaignId', this.selectedCampaign.ownerId);
        } else {
            localStorage.removeItem('dicy_loadedCampaignId');
        }

        if (opts.immediateStart) {
            localStorage.setItem('dicy_campaignMode', '1');
            this._disconnectGridResizeObserver();
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.add('hidden');
            if (this.effectsManager) this.effectsManager.stopIntroMode();
            if (this.onStartGame) this.onStartGame();
        } else {
            localStorage.removeItem('dicy_campaignMode');
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.remove('hidden');
            if (this.effectsManager) this.effectsManager.startIntroMode();
        }
    }

    selectLevelForCustomGame(index) {
        const level = this.campaignManager.getLevel(this.selectedCampaign, index);
        if (!level) return;
        this.pendingLevel = level;
        this.pendingCampaign = this.selectedCampaign;
        this.selectedLevelIndex = index;
        this.customSetupLevelActive = true;
        this.customSetupLevel = level;
        localStorage.removeItem('dicy_campaignMode');
        this.scenarioBrowserModal.classList.add('hidden');
        this.setupModal.classList.remove('hidden');
        if (this.effectsManager) this.effectsManager.startIntroMode();
        if (this.onOpenCustomFromLevel) {
            const campaignName = this.getCampaignDisplayName(this.selectedCampaign);
            const label = `${campaignName} - Level ${index + 1}`;
            this.onOpenCustomFromLevel(level, label);
        }
    }

    openEditorForLevel(index) {
        const level = this.campaignManager.getLevel(this.selectedCampaign, index);
        if (!level) return;

        this.campaignDetailView?.classList.add('hidden');
        this.campaignSelectView?.classList.add('hidden');
        this.scenarioBrowserModal.classList.add('hidden');
        if (this.effectsManager) this.effectsManager.stopIntroMode();
        const { onSave, onClose } = this.mapEditorCallbacksForCampaignLevel(index);
        this.mapEditor.open(level, {
            campaign: this.selectedCampaign,
            levelIndex: index,
            onSave,
            onClose
        });
    }

    async openEditorForNewLevel(index) {
        let campaign = this.selectedCampaign;
        if (!campaign || campaign.isEmpty) {
            campaign = await this.campaignManager.ensureUserCampaign();
            this.selectedCampaign = campaign;
        }

        const actualIndex = index === null || index < 0 ? campaign.levels.length : index;
        this.campaignDetailView?.classList.add('hidden');
        this.campaignSelectView?.classList.add('hidden');
        this.scenarioBrowserModal.classList.add('hidden');

        const template = {
            width: 20,
            height: 20,
            type: 'map',
            tiles: []
        };

        if (this.effectsManager) this.effectsManager.stopIntroMode();
        this.mapEditor.open(template, {
            campaign,
            levelIndex: actualIndex,
            isNew: true,
            onSave: (data) => {
                this.campaignManager.setUserLevel(actualIndex, data);
                this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                this.justSavedLevelIndex = actualIndex;
                this.scenarioBrowserModal.classList.remove('hidden');
                this.showLevelGridView(this.selectedCampaign);
                setTimeout(() => { this.justSavedLevelIndex = null; this.renderLevelGrid(this.selectedCampaign); }, 2000);
            },
            onClose: () => {
                if (this.effectsManager) this.effectsManager.startIntroMode();
                this.scenarioBrowserModal.classList.remove('hidden');
                if (this.selectedCampaign?.levels?.length) {
                    this.showLevelGridView(this.selectedCampaign);
                } else {
                    this.showCampaignView();
                }
            }
        });
    }

    async tryLoadSavedLevel() {
        const owner = localStorage.getItem('dicy_loadedCampaign');
        const indexStr = localStorage.getItem('dicy_loadedLevelIndex');
        if (!owner || indexStr == null) return;

        const index = parseInt(indexStr, 10);
        const campaign = this.campaignManager.getCampaign(owner);
        if (!campaign) return;

        const level = this.campaignManager.getLevel(campaign, index);
        if (level) {
            this.pendingLevel = level;
            this.pendingCampaign = campaign;
            this.selectedLevelIndex = index;
            // Do not call updateConfigFromLevel here: loadSavedSettings() already applied
            // persisted setup prefs. Pushing the campaign level into the form would clobber
            // them in the UI and the next START would saveCurrentSettings() onto localStorage.
        }
    }

    getPendingScenario() {
        return this.pendingLevel;
    }

    clearPendingScenario() {
        this.pendingLevel = null;
        this.pendingCampaign = null;
        this.selectedLevelIndex = null;
        this.customSetupLevelActive = false;
        this.customSetupLevel = null;
        localStorage.removeItem('dicy_loadedCampaign');
        localStorage.removeItem('dicy_loadedLevelIndex');
        localStorage.removeItem('dicy_loadedCampaignId');
    }

    setCustomSetupLevelActive(active) {
        this.customSetupLevelActive = !!active;
        if (!this.customSetupLevelActive) {
            this.customSetupLevel = null;
            localStorage.removeItem('dicy_campaignMode');
        }
    }

    getCustomSetupLevel() {
        return this.customSetupLevel;
    }

    loadPendingScenarioIfNeeded() {
        if (!this.pendingLevel) {
            const owner = localStorage.getItem('dicy_loadedCampaign');
            const indexStr = localStorage.getItem('dicy_loadedLevelIndex');
            if (owner && indexStr != null) {
                const campaign = this.campaignManager.getCampaign(owner);
                const index = parseInt(indexStr, 10);
                const level = campaign && this.campaignManager.getLevel(campaign, index);
                if (level) {
                    this.pendingLevel = level;
                    this.pendingCampaign = campaign;
                    this.selectedLevelIndex = index;
                }
            }
        }
    }
}
