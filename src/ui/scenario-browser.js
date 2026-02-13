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

    hasHoverCapability() {
        return window.matchMedia('(hover: hover)').matches;
    }

    setupEventListeners() {
        const scenariosBtn = document.getElementById('scenarios-btn');
        if (scenariosBtn) {
            scenariosBtn.addEventListener('click', async () => {
                this.scenarioBrowserModal.classList.remove('hidden');
                this.pendingLevel = null;
                await this.showCampaignView();
                this.restoreLastSelectedCampaign();
                if (this.effectsManager) this.effectsManager.stopIntroMode();
            });
        }

        if (this.scenarioBrowserCloseBtn) {
            this.scenarioBrowserCloseBtn.addEventListener('click', () => {
                localStorage.removeItem('dicy_campaignMode');
                this.scenarioBrowserModal.classList.add('hidden');
                this.setupModal.classList.remove('hidden');
                if (this.effectsManager) this.effectsManager.startIntroMode();
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
        const isEmptyUserCampaign = campaign && (campaign.isEmpty || (campaign.levels?.length === 0 && campaign.isUserCampaign));
        if (isEmptyUserCampaign) {
            // Empty user campaign - one add tile in grid
            this.isOwner = true;
            const ownerLabel = campaign.owner || 'Your Campaign';
            this.levelGridHeader.innerHTML = `<span>${ownerLabel}</span><span>0 levels</span>`;
            this.levelGrid.style.gridTemplateColumns = '36px';
            this.levelGrid.style.gridTemplateRows = '36px';
            this.levelGrid.innerHTML = '';
            const addTile = document.createElement('div');
            addTile.className = 'level-grid-tile add-tile';
            addTile.innerHTML = '<span class="tile-add">+</span>';
            addTile.addEventListener('click', () => this.openEditorForNewLevel(0));
            this.levelGrid.appendChild(addTile);
            return;
        }

        this.isOwner = await this.campaignManager.isOwner(campaign);
        const levels = campaign.levels || [];
        const ownerLabel = campaign.owner || 'Your Campaign';
        const totalSlots = this.isOwner ? levels.length + 1 : levels.length;
        const { cols, rows } = getGridDimensions(totalSlots);
        const gridSize = Math.max(cols, rows, 1);

        const loadedOwner = localStorage.getItem('dicy_loadedCampaign');
        const loadedIdx = localStorage.getItem('dicy_loadedLevelIndex');
        const lastOwner = localStorage.getItem('dicy_lastCampaign');
        const lastIdx = localStorage.getItem('dicy_lastLevelIndex');
        let savedLevelIndex = null;
        if (loadedOwner === campaign.owner && loadedIdx != null) {
            savedLevelIndex = parseInt(loadedIdx, 10);
        } else if (lastOwner === campaign.owner && lastIdx != null) {
            const idx = parseInt(lastIdx, 10);
            if (idx >= 0 && idx < (campaign.levels?.length ?? 0)) savedLevelIndex = idx;
        }
        const solvedLevels = getSolvedLevels(campaign.owner);

        this.levelGridHeader.innerHTML = `<span>${ownerLabel}</span><span>${levels.length} levels</span>`;
        this.levelGrid.style.gridTemplateColumns = `repeat(${gridSize}, 36px)`;
        this.levelGrid.style.gridTemplateRows = `repeat(${gridSize}, 36px)`;
        this.levelGrid.innerHTML = '';

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const tile = document.createElement('div');
            tile.className = 'level-grid-tile';
            if (savedLevelIndex === i) tile.classList.add('selected');
            if (this.justSavedLevelIndex === i) tile.classList.add('just-saved');
            if (solvedLevels.includes(i)) tile.classList.add('solved');
            tile.dataset.index = i;

            const idxSpan = document.createElement('span');
            idxSpan.className = 'tile-index';
            idxSpan.textContent = i + 1;
            tile.appendChild(idxSpan);

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
            addTile.innerHTML = '<span class="tile-add">+</span>';
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
    }

    hideHoverPreview() {
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

        let currentIndex = index;
        const updateContent = async (idx) => {
            currentIndex = idx;
            titleEl.textContent = `#${idx + 1}`;
            const built = await buildContent(idx);
            if (!built) return;
            body.innerHTML = '';
            body.appendChild(built.content);
            built.prevBtn.addEventListener('click', () => { if (idx > 0) updateContent(idx - 1); });
            built.nextBtn.addEventListener('click', () => { if (idx < totalLevels - 1) updateContent(idx + 1); });
        };

        const built = await buildContent(index);
        body.appendChild(built.content);
        built.prevBtn.addEventListener('click', () => { if (index > 0) updateContent(index - 1); });
        built.nextBtn.addEventListener('click', () => { if (index < totalLevels - 1) updateContent(index + 1); });

        dialog.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'dialog-actions level-preview-actions';
        const actionButtons = [
            { text: 'Play', value: 'play', className: 'tron-btn primary' },
            { text: 'Custom Game', value: 'custom', className: 'tron-btn' }
        ];
        if (this.isOwner) {
            actionButtons.push({ text: 'Edit', value: 'edit', className: 'tron-btn', row: 2 });
            actionButtons.push({ text: 'Delete', value: 'delete', className: 'tron-btn danger', row: 2 });
        }
        const primaryRow = document.createElement('div');
        primaryRow.className = 'dialog-actions-row';
        const secondaryRow = document.createElement('div');
        secondaryRow.className = 'dialog-actions-row dialog-actions-row-secondary';
        actionButtons.forEach(btnConfig => {
            const btn = document.createElement('button');
            btn.className = btnConfig.className || 'tron-btn';
            btn.textContent = btnConfig.text;
            btn.dataset.value = btnConfig.value;
            (btnConfig.row === 2 ? secondaryRow : primaryRow).appendChild(btn);
        });
        actions.appendChild(primaryRow);
        if (secondaryRow.children.length) actions.appendChild(secondaryRow);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        if (Dialog.activeOverlay) Dialog.close(Dialog.activeOverlay);
        Dialog.activeOverlay = overlay;

        new Promise((resolve) => {
            const finish = (value) => {
                overlay.classList.add('fade-out');
                setTimeout(() => {
                    overlay.parentNode?.removeChild(overlay);
                    Dialog.activeOverlay = null;
                }, 300);
                resolve(value);
            };
            closeBtn.addEventListener('click', () => finish('close'));
            actions.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', () => finish(btn.dataset.value));
            });
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

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const tiles = level.tiles || [];
        const playerColors = {};
        if (level.players) {
            level.players.forEach(p => { playerColors[p.id] = p.color; });
        }

        tiles.forEach(t => {
            const x = ox + t.x * (cellSize + gap);
            const y = oy + t.y * (cellSize + gap);
            let color = '#444';
            if (t.owner !== undefined && t.owner !== -1 && playerColors[t.owner]) {
                color = '#' + playerColors[t.owner].toString(16).padStart(6, '0');
            }
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellSize, cellSize);
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
                this.selectedCampaign = this.campaignManager.userCampaign;
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
