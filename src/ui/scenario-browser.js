import { Dialog } from './dialog.js';
import { CampaignManager } from '../scenarios/campaign-manager.js';
import { getGridDimensions } from '../scenarios/campaign-data.js';
import { getSolvedLevels, markLevelSolved } from '../scenarios/campaign-progress.js';
import { getCachedIdentity } from '../scenarios/user-identity.js';
import { MapManager } from '../core/map.js';

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

        this.scenarioBrowserModal = document.getElementById('scenario-browser-modal');
        this.scenarioBrowserCloseBtn = document.getElementById('scenario-browser-close-btn');
        this.campaignList = document.getElementById('campaign-list');
        this.campaignSelect = document.getElementById('campaign-select');
        this.levelGridContainer = document.getElementById('level-grid-container');
        this.levelGrid = document.getElementById('level-grid');
        this.levelGridHeader = document.getElementById('level-grid-header');
        this.previewContent = document.getElementById('scenario-preview-content');
        this.setupModal = document.getElementById('setup-modal');

        this.onScenarioLoaded = null;
        this.onStartGame = null;
        this.effectsManager = null;

        this.BACKEND_URL = '';
        this.hoverPreviewEl = null;
        this.justSavedLevelIndex = null;
        this._configPreviewCache = new Map();
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

    async open() {
        this.scenarioBrowserModal.classList.remove('hidden');
        this.pendingLevel = null;
        await this.showCampaignView();
        this.restoreLastSelectedCampaign();
        if (this.effectsManager) this.effectsManager.stopIntroMode();

        // Hide zoom buttons in campaign view
        const zoomBtns = document.querySelectorAll('.zoom-control');
        zoomBtns.forEach(btn => btn.classList.add('hidden'));
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
            this.scenarioBrowserCloseBtn.addEventListener('click', () => {
                localStorage.removeItem('dicy_campaignMode');
                this.scenarioBrowserModal.classList.add('hidden');
                this.setupModal.classList.remove('hidden');
                if (this.effectsManager) this.effectsManager.startIntroMode();

                // Show zoom buttons again
                const zoomBtns = document.querySelectorAll('.zoom-control');
                zoomBtns.forEach(btn => btn.classList.remove('hidden'));
            });
        }

    }

    async showCampaignView() {
        this.selectedCampaign = null;
        this.levelGridContainer.classList.add('hidden');
        this.previewContent.classList.remove('hidden');
        this.previewContent.innerHTML = '<div class="empty-message-large">Select a campaign</div>';
        await this.renderCampaignList();
    }

    restoreLastSelectedCampaign() {
        const last = localStorage.getItem('dicy_lastCampaign');
        let campaign = null;
        let owner = last;

        if (last) {
            const item = this.campaignList.querySelector(`[data-owner="${CSS.escape(last)}"]`);
            if (item) {
                document.querySelectorAll('#campaign-list .scenario-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                if (this.campaignSelect) this.campaignSelect.value = last;
                campaign = this.campaignManager.getCampaign(last);
                if (!campaign && last === 'Your Campaign') {
                    campaign = { owner: 'Your Campaign', levels: [], isEmpty: true, isUserCampaign: true };
                }
            }
        }

        if (!campaign) {
            const campaigns = this.campaignManager.listCampaigns();
            const first = campaigns[0];
            if (first) {
                owner = first.owner;
                const item = this.campaignList.querySelector(`[data-owner="${CSS.escape(owner)}"]`);
                if (item) {
                    document.querySelectorAll('#campaign-list .scenario-list-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    if (this.campaignSelect) this.campaignSelect.value = owner;
                }
                campaign = first.isEmpty || (first.levels?.length === 0 && first.isUserCampaign)
                    ? { ...first, isEmpty: true } : first;
            }
        }

        if (campaign) {
            this.selectedCampaign = campaign;
            this.showLevelGridView(campaign);
        }
    }

    showLevelGridView(campaign) {
        this.selectedCampaign = campaign;
        if (campaign?.owner) localStorage.setItem('dicy_lastCampaign', campaign.owner);
        this.levelGridContainer.classList.remove('hidden');
        this.previewContent.classList.add('hidden');
        this.renderLevelGrid(campaign);
    }

    async renderCampaignList() {
        const campaigns = this.campaignManager.listCampaigns();

        // Ensure user has a campaign slot (empty if none)
        getCachedIdentity();
        const hasUserCampaign = campaigns.some(c => c.isUserCampaign);
        if (!hasUserCampaign) {
            campaigns.push({
                id: '_user_empty',
                owner: 'Your Campaign',
                levels: [],
                isUserCampaign: true,
                isEmpty: true
            });
        }

        this.campaignList.innerHTML = '';
        if (this.campaignSelect) {
            this.campaignSelect.innerHTML = '';
            campaigns.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.owner;
                const levelCount = c.levels?.length ?? 0;
                const solvedCount = getSolvedLevels(c.owner).length;
                const allComplete = levelCount > 0 && solvedCount >= levelCount;
                const displayName = c.isUserCampaign ? 'Your Campaign' : c.owner;
                opt.textContent = allComplete ? `✓ ${displayName} (${levelCount} levels)` : `${displayName} (${levelCount} levels)`;
                this.campaignSelect.appendChild(opt);
            }
            );
            this.campaignSelect.value = this.selectedCampaign?.owner || (campaigns[0]?.owner ?? '');
            this.campaignSelect.onchange = () => {
                const c = campaigns.find(x => x.owner === this.campaignSelect.value);
                if (c) {
                    localStorage.setItem('dicy_lastCampaign', c.owner);
                    document.querySelectorAll('#campaign-list .scenario-list-item').forEach(i => i.classList.remove('selected'));
                    const item = this.campaignList.querySelector(`[data-owner="${CSS.escape(c.owner)}"]`);
                    if (item) item.classList.add('selected');
                    this.showLevelGridView(c.isEmpty || (c.levels && c.levels.length === 0 && c.isUserCampaign) ? { ...c, isEmpty: true } : c);
                }
            };
        }
        campaigns.forEach(c => {
            const item = document.createElement('div');
            item.className = 'scenario-list-item' + (this.selectedCampaign?.owner === c.owner ? ' selected' : '');
            item.dataset.owner = c.owner;
            const levelCount = c.levels?.length ?? 0;
            const solvedCount = getSolvedLevels(c.owner).length;
            const allComplete = levelCount > 0 && solvedCount >= levelCount;
            const displayName = c.isUserCampaign ? 'Your Campaign' : c.owner;
            item.innerHTML = `
                <span class="list-item-campaign-check">${allComplete ? '✓' : ''}</span>
                <span class="list-item-name">${displayName}</span>
                <span class="list-item-date">${levelCount} levels</span>
            `;
            item.addEventListener('click', () => {
                localStorage.setItem('dicy_lastCampaign', c.owner);
                document.querySelectorAll('#campaign-list .scenario-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                if (this.campaignSelect) this.campaignSelect.value = c.owner;
                this.showLevelGridView(c.isEmpty || (c.levels && c.levels.length === 0 && c.isUserCampaign) ? { ...c, isEmpty: true } : c);
            });
            this.campaignList.appendChild(item);
        });
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
        const totalSlots = this.isOwner ? levels.length + 1 : levels.length;
        const { cols, rows } = getGridDimensions(totalSlots);
        const gridSize = Math.max(cols, rows, 1);

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

            if (this.configManager) {
                this.configManager.updateConfigFromLevel(level);
                this.configManager.updateLoadedLevelDisplay(campaign.owner, firstUnsolvedIndex + 1);
            }

            localStorage.setItem('dicy_loadedCampaign', campaign.owner);
            localStorage.setItem('dicy_loadedLevelIndex', String(firstUnsolvedIndex));
            if (campaign.ownerId) {
                localStorage.setItem('dicy_loadedCampaignId', campaign.ownerId);
            } else {
                localStorage.removeItem('dicy_loadedCampaignId');
            }
        }

        this.levelGridHeader.innerHTML = `<span>${ownerLabel}</span><span>${levels.length} levels</span>`;
        this.levelGrid.style.gridTemplateColumns = `repeat(${gridSize}, 36px)`;
        this.levelGrid.style.gridTemplateRows = `repeat(${gridSize}, 36px)`;
        this.levelGrid.innerHTML = '';

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const tile = document.createElement('div');
            tile.className = 'level-grid-tile';
            if (firstUnsolvedIndex === i) tile.classList.add('selected');
            if (this.justSavedLevelIndex === i) tile.classList.add('just-saved');
            if (solvedLevels.includes(i)) tile.classList.add('solved');
            tile.dataset.index = i;

            const idxSpan = document.createElement('span');
            idxSpan.className = 'tile-index';
            idxSpan.textContent = i + 1;
            tile.appendChild(idxSpan);

            // Add type icon
            const typeIcon = document.createElement('span');
            const type = level.type || 'map';
            if (type === 'config') {
                typeIcon.className = 'sprite-icon icon-defend tile-type-sprite';
            } else if (type === 'scenario') {
                typeIcon.className = 'sprite-icon icon-campaigns tile-type-sprite';
            } else {
                typeIcon.className = 'sprite-icon icon-map tile-type-sprite';
            }
            tile.appendChild(typeIcon);

            if (this.hasHoverCapability()) {
                tile.addEventListener('mouseenter', () => this.showHoverPreview(level, tile));
                tile.addEventListener('mouseleave', () => this.hideHoverPreview());
            }
            tile.addEventListener('click', () => this.showLevelPreviewDialog(level, i));
            this.levelGrid.appendChild(tile);
        }

        if (this.isOwner) {
            const addTile = document.createElement('div');
            addTile.className = 'level-grid-tile add-tile';
            addTile.innerHTML = ''; // No icon at all
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
        if (level.type === 'config') {
            const bots = level.bots ?? 1;
            const botAI = level.botAI || 'easy';
            const mapStyle = level.mapStyle || 'full';
            const mapSize = level.mapSize || '6x6';
            lines.push(`${mapSize} · ${mapStyle}`);
            lines.push(`${bots} bot${bots !== 1 ? 's' : ''} · ${botAI}`);
        } else {
            const bots = (level.players || []).filter(p => p.isBot).length;
            const aiIds = [...new Set((level.players || []).filter(p => p.isBot).map(p => p.aiId || 'easy'))];
            const botAIStr = aiIds.length ? aiIds.join(', ') : (bots ? 'easy' : '—');
            lines.push(`${level.width || '?'}×${level.height || '?'}`);
            if (bots > 0) lines.push(`${bots} bot${bots !== 1 ? 's' : ''} · ${botAIStr}`);
        }
        return lines;
    }

    async showHoverPreview(level, tile) {
        this.hideHoverPreview();
        const index = tile?.dataset?.index != null ? parseInt(tile.dataset.index, 10) : -1;
        const previewLevel = await this.getLevelForPreview(level);
        const el = document.createElement('div');
        el.className = 'level-hover-preview';
        const isSolved = index >= 0 && this.selectedCampaign?.owner && getSolvedLevels(this.selectedCampaign.owner).includes(index);
        if (isSolved) el.classList.add('level-hover-preview-solved');
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
        el.style.left = Math.min(rect.left, window.innerWidth - size - 16) + 'px';
        el.style.top = (rect.top - size - 12) + 'px';
        this.hoverPreviewEl = el;

        if (level.type === 'config') {
            this.hoverPreviewInterval = setInterval(async () => {
                const updatedLevel = await this.generateConfigPreview(level);
                this.renderMinimap(canvas, updatedLevel);
            }, 1000);
        }
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
            const previewLevel = await this.getLevelForPreview(lvl);
            const content = document.createElement('div');
            content.className = 'level-preview-dialog-content';
            const isSolved = campaign?.owner && getSolvedLevels(campaign.owner).includes(idx);
            if (isSolved) content.classList.add('level-preview-solved');
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
            const typeLabel = lvl.type === 'config' ? 'Procedural' : (lvl.type === 'map' ? 'Map' : 'Scenario');
            p.textContent = `${typeLabel} · Level ${idx + 1}`;
            content.appendChild(p);
            const infoBlock = document.createElement('div');
            infoBlock.className = 'level-preview-info';
            this.getLevelInfoLines(lvl).forEach(line => {
                const span = document.createElement('span');
                span.className = 'level-preview-info-line';
                span.textContent = line;
                infoBlock.appendChild(span);
            });
            content.appendChild(infoBlock);
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

        // Start dynamic update if procedural
        const startDynamicUpdate = (lvl, canvas) => {
            if (this.dialogPreviewInterval) clearInterval(this.dialogPreviewInterval);
            if (lvl.type === 'config') {
                this.dialogPreviewInterval = setInterval(async () => {
                    const updatedLevel = await this.generateConfigPreview(lvl);
                    this.renderMinimap(canvas, updatedLevel);
                }, 1000);
            }
        };

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
            playBtn.textContent = 'Play';
            playBtn.onclick = () => finish('play');
            primaryRow.appendChild(playBtn);

            const customBtn = document.createElement('button');
            customBtn.className = 'tron-btn';
            customBtn.textContent = 'Custom Game';
            customBtn.onclick = () => finish('custom');
            primaryRow.appendChild(customBtn);

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
            else if (result === 'custom') this.selectAndPlayLevel(idx, { customMode: true });
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

    async getLevelForPreview(level) {
        if (level.type !== 'config') return level;
        const cacheKey = JSON.stringify({ mapSize: level.mapSize, mapStyle: level.mapStyle });
        if (this._configPreviewCache.has(cacheKey)) {
            return this._configPreviewCache.get(cacheKey);
        }
        const generated = await this.generateConfigPreview(level);
        this._configPreviewCache.set(cacheKey, generated);
        return generated;
    }

    async generateConfigPreview(config) {
        const [w, h] = (config.mapSize || '6x6').split('x').map(Number);
        const botCount = config.bots ?? 1;
        const players = [{ id: 0, isBot: false, color: 0xaa00ff }, ...Array.from({ length: botCount }, (_, i) => ({ id: i + 1, isBot: true, color: [0xff0055, 0x55ff00, 0x5555ff, 0xffaa00][i % 4] }))];
        const map = new MapManager();
        map.generateMap(w, h, players, config.maxDice ?? 8, config.mapStyle || 'full');
        const tiles = [];
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const t = map.tiles[y * map.width + x];
                if (t && !t.blocked) {
                    tiles.push({ x, y });
                }
            }
        }
        return { width: map.width, height: map.height, tiles };
    }

    renderMinimap(canvas, level) {
        const ctx = canvas.getContext('2d');
        let w = level.width, h = level.height;
        if ((!w || !h) && level.mapSize) {
            const [mw, mh] = level.mapSize.split('x').map(Number);
            w = mw || 5;
            h = mh || 5;
        }
        w = w || 5;
        h = h || 5;
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

    selectAndPlayLevel(index, opts = {}) {
        const level = this.campaignManager.getLevel(this.selectedCampaign, index);
        if (!level) return;

        this.pendingLevel = level;
        this.pendingCampaign = this.selectedCampaign;
        this.selectedLevelIndex = index;

        this.configManager.updateConfigFromLevel(level);
        this.configManager.updateLoadedLevelDisplay(this.selectedCampaign.owner, index + 1);

        localStorage.setItem('dicy_loadedCampaign', this.selectedCampaign.owner);
        localStorage.setItem('dicy_loadedLevelIndex', String(index));
        if (this.selectedCampaign.ownerId) {
            localStorage.setItem('dicy_loadedCampaignId', this.selectedCampaign.ownerId);
        } else {
            localStorage.removeItem('dicy_loadedCampaignId');
        }

        if (opts.immediateStart) {
            localStorage.setItem('dicy_campaignMode', '1');
            localStorage.removeItem('dicy_customLevelMode');
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.add('hidden');
            if (this.effectsManager) this.effectsManager.stopIntroMode();
            if (this.onStartGame) this.onStartGame();
        } else if (opts.customMode) {
            localStorage.removeItem('dicy_campaignMode');
            localStorage.setItem('dicy_customLevelMode', '1');
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.remove('hidden');
            if (this.effectsManager) this.effectsManager.startIntroMode();
        } else {
            localStorage.removeItem('dicy_campaignMode');
            localStorage.removeItem('dicy_customLevelMode');
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.remove('hidden');
            if (this.effectsManager) this.effectsManager.startIntroMode();
        }
    }

    openEditorForLevel(index) {
        const level = this.campaignManager.getLevel(this.selectedCampaign, index);
        if (!level) return;

        this.scenarioBrowserModal.classList.add('hidden');
        this.mapEditor.open(level, {
            campaign: this.selectedCampaign,
            levelIndex: index,
            onSave: (data) => {
                this.campaignManager.setUserLevel(index, data);
                if (this.selectedCampaign.isUserCampaign) {
                    this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                }
                this.justSavedLevelIndex = index;
                this.scenarioBrowserModal.classList.remove('hidden');
                this.renderLevelGrid(this.selectedCampaign);
                setTimeout(() => { this.justSavedLevelIndex = null; this.renderLevelGrid(this.selectedCampaign); }, 2000);
            },
            onClose: () => {
                this.scenarioBrowserModal.classList.remove('hidden');
                this.renderLevelGrid(this.selectedCampaign);
            }
        });
    }

    async openEditorForNewLevel(index) {
        let campaign = this.selectedCampaign;
        if (!campaign || campaign.isEmpty) {
            campaign = await this.campaignManager.ensureUserCampaign();
            this.selectedCampaign = campaign;
        }

        const actualIndex = index === null || index < 0 ? campaign.levels.length : index;
        this.scenarioBrowserModal.classList.add('hidden');

        const template = {
            width: 20,
            height: 20,
            type: 'map',
            tiles: []
        };

        this.mapEditor.open(template, {
            campaign,
            levelIndex: actualIndex,
            isNew: true,
            onSave: (data) => {
                this.campaignManager.setUserLevel(actualIndex, data);
                this.selectedCampaign = { ...this.campaignManager.userCampaign, isUserCampaign: true };
                this.justSavedLevelIndex = actualIndex;
                this.scenarioBrowserModal.classList.remove('hidden');
                this.renderLevelGrid(this.selectedCampaign);
                setTimeout(() => { this.justSavedLevelIndex = null; this.renderLevelGrid(this.selectedCampaign); }, 2000);
            },
            onClose: () => {
                this.scenarioBrowserModal.classList.remove('hidden');
                if (this.selectedCampaign?.levels?.length) {
                    this.renderLevelGrid(this.selectedCampaign);
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
            this.configManager.updateConfigFromLevel(level);
            this.configManager.updateLoadedLevelDisplay(campaign.owner, index + 1);
        }
    }

    getPendingScenario() {
        return this.pendingLevel;
    }

    clearPendingScenario() {
        this.pendingLevel = null;
        this.pendingCampaign = null;
        this.selectedLevelIndex = null;
        if (this.configManager) {
            this.configManager.updateLoadedLevelDisplay(null);
        }
        localStorage.removeItem('dicy_loadedCampaign');
        localStorage.removeItem('dicy_loadedLevelIndex');
        localStorage.removeItem('dicy_loadedCampaignId');
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
