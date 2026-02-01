import { Dialog } from './dialog.js';

/**
 * ScenarioBrowser - Handles scenario/map browsing UI
 */
export class ScenarioBrowser {
    constructor(scenarioManager, configManager, mapEditor) {
        this.scenarioManager = scenarioManager;
        this.configManager = configManager;
        this.mapEditor = mapEditor;

        // State
        this.pendingScenario = null;
        this.currentScenarioTab = 'maps';
        this.selectedScenarioName = null;
        this.selectedScenarioData = null;
        this.currentSort = { field: 'date', direction: 'desc' };
        this.onlineMaps = [];
        this.BACKEND_URL = '';

        // DOM elements
        this.scenarioBrowserModal = document.getElementById('scenario-browser-modal');
        this.scenarioBrowserCloseBtn = document.getElementById('scenario-browser-close-btn');
        this.scenarioList = document.getElementById('scenario-list');
        this.scenariosBtn = document.getElementById('scenarios-btn');
        this.scenarioTabs = document.querySelectorAll('.scenario-tab');
        this.newScenarioBtn = document.getElementById('new-scenario-btn');
        this.scenarioImportBtn = document.getElementById('scenario-import-btn');
        this.scenarioExportBtn = document.getElementById('scenario-export-btn');
        this.scenarioEditorBtn = document.getElementById('scenario-editor-btn');
        this.setupModal = document.getElementById('setup-modal');

        // Callbacks
        this.onScenarioLoaded = null;
        this.effectsManager = null;
    }

    /**
     * Initialize the scenario browser
     */
    async init() {
        await this.determineBackendURL();
        this.setupEventListeners();
        await this.tryLoadSavedScenario();
    }

    async determineBackendURL() {
        // Dynamically determine backend URL
        this.BACKEND_URL = window.location.hostname === 'localhost'
            ? 'https://feuerware.com/2025/diception/dev/backend'
            : window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/backend';

        // Override for Steam version
        if (window.steam) {
            const isSteamDev = await window.steam.isDev();
            if (isSteamDev) {
                this.BACKEND_URL = 'https://feuerware.com/2025/diception/dev/backend';
            } else {
                this.BACKEND_URL = 'https://diception.feuerware.com/backend';
            }
        }
    }

    setEffectsManager(effectsManager) {
        this.effectsManager = effectsManager;
    }

    setupEventListeners() {
        // Open scenario browser
        if (this.scenariosBtn) {
            this.scenariosBtn.addEventListener('click', () => {
                this.pendingScenario = null;
                this.selectedScenarioName = null;
                this.selectedScenarioData = null;
                this.renderScenarioList();
                this.scenarioBrowserModal.classList.remove('hidden');
            });
        }

        // Close scenario browser
        if (this.scenarioBrowserCloseBtn) {
            this.scenarioBrowserCloseBtn.addEventListener('click', () => {
                this.scenarioBrowserModal.classList.add('hidden');
                this.setupModal.classList.remove('hidden');
                if (this.effectsManager) this.effectsManager.startIntroMode();
            });
        }

        // Tab switching
        this.scenarioTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.scenarioTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentScenarioTab = tab.dataset.tab;
                this.selectedScenarioName = null;
                this.selectedScenarioData = null;

                if (this.currentScenarioTab === 'online') {
                    this.fetchOnlineMaps();
                } else {
                    this.renderScenarioList();
                }
            });
        });

        // New Map/Scenario Button
        if (this.newScenarioBtn) {
            this.newScenarioBtn.addEventListener('click', () => {
                if (this.currentScenarioTab === 'online') return;

                this.scenarioBrowserModal.classList.add('hidden');

                const template = {
                    width: 10,
                    height: 10,
                    name: '',
                    isBuiltIn: false,
                    type: this.currentScenarioTab === 'scenarios' ? 'scenario' : 'map'
                };

                this.mapEditor.open(template);

                setTimeout(() => {
                    if (this.mapEditor.elements.nameInput) {
                        this.mapEditor.elements.nameInput.focus();
                        this.mapEditor.elements.nameInput.select();
                    }
                }, 100);

                this.mapEditor.onClose = () => {
                    this.renderScenarioList();
                    this.scenarioBrowserModal.classList.remove('hidden');
                };
            });
        }

        // Import scenario
        if (this.scenarioImportBtn) {
            this.scenarioImportBtn.addEventListener('click', () => this.importScenario());
        }

        // Export scenario
        if (this.scenarioExportBtn) {
            this.scenarioExportBtn.addEventListener('click', () => this.exportSelectedScenario());
        }

        // Editor button
        if (this.scenarioEditorBtn) {
            this.scenarioEditorBtn.addEventListener('click', () => {
                this.scenarioBrowserModal.classList.add('hidden');
                this.mapEditor.open(this.selectedScenarioData);
                this.mapEditor.onClose = () => {
                    this.renderScenarioList();
                    this.scenarioBrowserModal.classList.remove('hidden');
                };
            });
        }
    }

    async tryLoadSavedScenario(attempts = 0) {
        const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
        if (!savedScenarioName) return;

        const scenario = this.scenarioManager.loadScenario(savedScenarioName);
        if (scenario || attempts >= 10) {
            this.loadSavedScenario();
        } else {
            setTimeout(() => this.tryLoadSavedScenario(attempts + 1), 50);
        }
    }

    loadSavedScenario() {
        const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
        if (savedScenarioName) {
            try {
                console.log('Loading saved scenario:', savedScenarioName);

                // Check online cache first
                const onlineCache = localStorage.getItem('dicy_onlineMapCache');
                if (onlineCache) {
                    try {
                        const scenario = JSON.parse(onlineCache);
                        if (scenario && scenario.name === savedScenarioName) {
                            this.pendingScenario = scenario;
                            this.configManager.updateConfigFromScenario(scenario);
                            this.configManager.updateLoadedScenarioDisplay(scenario.name);
                            console.log('Scenario loaded from online cache:', scenario.name);
                            return;
                        }
                    } catch (e) {
                        console.error('Failed to parse online map cache', e);
                    }
                }

                const scenario = this.scenarioManager.loadScenario(savedScenarioName);
                if (scenario) {
                    this.pendingScenario = scenario;
                    this.configManager.updateConfigFromScenario(scenario);
                    this.configManager.updateLoadedScenarioDisplay(scenario.name);
                    console.log('Scenario loaded successfully:', scenario.name);
                } else {
                    console.warn('Scenario not found, removing from localStorage:', savedScenarioName);
                    localStorage.removeItem('dicy_loadedScenario');
                }
            } catch (error) {
                console.warn('Failed to load saved scenario:', error);
                localStorage.removeItem('dicy_loadedScenario');
            }
        }
    }

    async fetchOnlineMaps() {
        try {
            this.scenarioList.innerHTML = '<div class="loading-message">Loading online maps...</div>';
            const response = await fetch(`${this.BACKEND_URL}/list.php`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            this.onlineMaps = data.map(m => ({
                ...m,
                isOnline: true,
                createdAt: (m.filemtime || m.created) * 1000
            }));
            this.renderScenarioList();
        } catch (error) {
            console.error('Error fetching online maps:', error);
            this.scenarioList.innerHTML = '<div class="error-message">Failed to load online maps.<br>Ensure PHP backend is running.</div>';
        }
    }

    async loadSelectedScenario() {
        if (!this.selectedScenarioName) return;

        if (this.selectedScenarioData && this.selectedScenarioData.isOnline) {
            const scenario = this.selectedScenarioData;
            scenario.type = scenario.type || 'map';

            this.pendingScenario = scenario;
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.remove('hidden');
            this.configManager.updateConfigFromScenario(scenario);

            localStorage.setItem('dicy_loadedScenario', scenario.name);
            localStorage.setItem('dicy_onlineMapCache', JSON.stringify(scenario));

            this.configManager.updateLoadedScenarioDisplay(scenario.name);
            return;
        }

        const scenario = this.scenarioManager.loadScenario(this.selectedScenarioName);
        if (scenario) {
            this.pendingScenario = scenario;
            this.scenarioBrowserModal.classList.add('hidden');
            this.setupModal.classList.remove('hidden');
            this.configManager.updateConfigFromScenario(scenario);

            localStorage.setItem('dicy_loadedScenario', this.selectedScenarioName);
            localStorage.removeItem('dicy_onlineMapCache');
            this.configManager.updateLoadedScenarioDisplay(scenario.name);
        }
    }

    renderMapPreview(canvas, scenario) {
        const ctx = canvas.getContext('2d');
        const maxCanvasSize = 200;
        const mapWidth = scenario.width || 10;
        const mapHeight = scenario.height || 10;

        const maxDimension = Math.max(mapWidth, mapHeight);
        const baseTileSize = 20;
        const baseGap = 2;

        let tileSize = baseTileSize;
        let gap = baseGap;
        const fullSize = maxDimension * (baseTileSize + baseGap) + baseGap;
        if (fullSize > maxCanvasSize) {
            const scale = maxCanvasSize / fullSize;
            tileSize = Math.max(2, Math.floor(baseTileSize * scale));
            gap = Math.max(1, Math.floor(baseGap * scale));
        }

        canvas.width = mapWidth * (tileSize + gap) + gap;
        canvas.height = mapHeight * (tileSize + gap) + gap;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const playerColors = {};
        if (scenario.players) {
            scenario.players.forEach(p => playerColors[p.id] = p.color);
        }

        if (scenario.tiles && Array.isArray(scenario.tiles)) {
            scenario.tiles.forEach(tile => {
                const x = tile.x * (tileSize + gap) + gap;
                const y = tile.y * (tileSize + gap) + gap;

                let color = '#444';
                if (tile.owner !== undefined && tile.owner !== -1) {
                    const c = playerColors[tile.owner];
                    if (c !== undefined) {
                        color = '#' + c.toString(16).padStart(6, '0');
                    }
                }

                ctx.fillStyle = color;
                ctx.fillRect(x, y, tileSize, tileSize);

                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, tileSize, tileSize);

                if (tile.dice && tileSize >= 10) {
                    ctx.fillStyle = '#fff';
                    const fontSize = Math.max(6, Math.floor(tileSize * 0.5));
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tile.dice, x + tileSize / 2, y + tileSize / 2 + 1);
                }
            });
        }
    }

    async uploadMap(mapData) {
        if (!mapData || !mapData.tiles) {
            Dialog.alert('Invalid map data.');
            return;
        }

        if (!(await Dialog.confirm(`Upload "${mapData.name || 'Untitled'}" to the server?`))) return;

        try {
            const response = await fetch(`${this.BACKEND_URL}/upload.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapData)
            });
            const result = await response.json();
            if (result.success) {
                Dialog.alert(result.message || 'Map uploaded successfully!');
                if (this.currentScenarioTab === 'online') {
                    this.fetchOnlineMaps();
                } else {
                    const onlineTab = document.querySelector('.scenario-tab[data-tab="online"]');
                    if (onlineTab) onlineTab.click();
                }
            } else {
                Dialog.alert('Upload failed: ' + (result.error || 'Unknown error'));
            }
        } catch (e) {
            Dialog.alert('Upload error: ' + e.message);
        }
    }

    showScenarioPreview(scenario) {
        const container = document.getElementById('scenario-preview-content');
        if (!container) return;

        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'preview-header';
        header.innerHTML = `<h3 class="preview-title">${scenario.name}</h3>`;
        container.appendChild(header);

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'preview-header-actions';

        // Play Button
        const playBtn = document.createElement('button');
        playBtn.className = 'tron-btn small';
        playBtn.innerHTML = '▶ <span class="btn-text">Play</span>';
        playBtn.onclick = (e) => {
            e.stopPropagation();
            this.loadSelectedScenario();
        };
        actionsDiv.appendChild(playBtn);

        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.className = 'tron-btn small edit-scenario-btn';
        editBtn.innerHTML = '✏️ <span class="btn-text">Edit</span>';
        editBtn.title = 'Edit in Map Editor';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            this.scenarioBrowserModal.classList.add('hidden');
            this.mapEditor.open(scenario);
            this.mapEditor.onClose = () => {
                this.renderScenarioList();
                this.scenarioBrowserModal.classList.remove('hidden');
            };
        };
        actionsDiv.appendChild(editBtn);

        // Export Button
        const exportBtn = document.createElement('button');
        exportBtn.className = 'tron-btn small';
        exportBtn.innerHTML = '💾 <span class="btn-text">Export as file</span>';
        exportBtn.title = 'Export as file';
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            const json = scenario.isOnline ? JSON.stringify(scenario, null, 2) : this.scenarioManager.exportScenario(scenario.name);
            if (json) {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${scenario.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        };
        actionsDiv.appendChild(exportBtn);

        // Delete/Upload buttons for local maps
        if (!scenario.isBuiltIn && !scenario.isOnline) {
            if (scenario.type === 'map') {
                const uploadBtn = document.createElement('button');
                uploadBtn.className = 'tron-btn small';
                uploadBtn.innerHTML = '☁️ <span class="btn-text">Upload</span>';
                uploadBtn.title = 'Upload to Server';
                uploadBtn.style.marginRight = '5px';
                uploadBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.uploadMap(scenario);
                };
                actionsDiv.appendChild(uploadBtn);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'tron-btn small danger';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete Scenario';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (await Dialog.confirm(`Delete "${scenario.name}"?`)) {
                    this.scenarioManager.deleteScenario(scenario.name);
                    this.renderScenarioList();
                }
            };
            actionsDiv.appendChild(deleteBtn);
        }

        header.appendChild(actionsDiv);

        // Content Wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'preview-container';

        // Map Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'preview-map';
        contentWrapper.appendChild(canvas);

        // Details Panel
        const details = document.createElement('div');
        details.className = 'preview-details';

        const addDetail = (label, value, className = '') => {
            const div = document.createElement('div');
            div.className = 'preview-detail-item';
            let html = '';
            if (label) html += `<span class="preview-label">${label}</span>`;
            html += `<span class="preview-value ${className}">${value}</span>`;
            div.innerHTML = html;
            details.appendChild(div);
        };

        if (scenario.author) {
            addDetail(null, scenario.author, 'author');
        }

        if (scenario.description) {
            const desc = document.createElement('div');
            desc.className = 'preview-description';
            desc.textContent = scenario.description;
            details.appendChild(desc);
        }

        const typeName = scenario.type === 'map' ? 'Map' : (scenario.type === 'replay' ? 'Replay' : 'Scenario');
        if (scenario.isBuiltIn) {
            addDetail('Type', `Built-in ${typeName}`);
        } else {
            addDetail('Type', `Custom ${typeName}`);
            addDetail('Created', scenario.createdAt ? new Date(scenario.createdAt).toLocaleString() : 'Unknown');
        }

        if (scenario.tiles) {
            addDetail('Tiles', scenario.tiles.length + ' / ' + (scenario.width * scenario.height));
        }

        contentWrapper.appendChild(canvas);
        contentWrapper.appendChild(details);
        container.appendChild(contentWrapper);

        this.renderMapPreview(canvas, scenario);
    }

    renderScenarioList() {
        let scenarios = [];

        if (this.currentScenarioTab === 'online') {
            scenarios = this.onlineMaps;
        } else {
            scenarios = this.scenarioManager.listScenarios();
        }

        const filtered = scenarios.filter(s => {
            if (this.currentScenarioTab === 'online') return true;

            const type = s.type || 'scenario';
            if (this.currentScenarioTab === 'scenarios') return (type === 'scenario' || type === 'replay' || s.isBuiltIn) && type !== 'map';
            if (this.currentScenarioTab === 'maps') return type === 'map';
            return false;
        });

        filtered.sort((a, b) => a.name.localeCompare(b.name));

        this.scenarioList.innerHTML = '';

        const emptyMessages = {
            scenarios: 'No scenarios found.',
            maps: 'No maps found.',
            online: 'No online maps found.'
        };

        if (filtered.length === 0) {
            this.scenarioList.innerHTML = `<div class="empty-message">${emptyMessages[this.currentScenarioTab]}</div>`;
            document.getElementById('scenario-preview-content').innerHTML = '<div class="empty-message-large">Select a scenario to view details</div>';
            this.selectedScenarioName = null;
            this.selectedScenarioData = null;
            if (this.scenarioExportBtn) this.scenarioExportBtn.disabled = true;
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'scenario-list-item';
            if (this.selectedScenarioName === s.name) {
                item.classList.add('selected');
            }

            const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
            const builtInLabel = s.isBuiltIn ? ' <span class="builtin-label">(built-in)</span>' : '';

            item.innerHTML = `
                <span class="list-item-name">${s.name}${builtInLabel}</span>
                <span class="list-item-date">${dateStr}</span>
            `;

            let lastClickTime = 0;
            item.addEventListener('click', () => {
                const currentTime = new Date().getTime();
                const isDouble = currentTime - lastClickTime < 400;
                lastClickTime = currentTime;

                document.querySelectorAll('.scenario-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedScenarioName = s.name;
                this.selectedScenarioData = s;
                if (this.scenarioExportBtn) this.scenarioExportBtn.disabled = false;
                this.showScenarioPreview(s);

                if (isDouble) {
                    this.loadSelectedScenario();
                    lastClickTime = 0;
                }
            });

            this.scenarioList.appendChild(item);
        });

        // Update New Button state
        if (this.currentScenarioTab === 'online') {
            this.newScenarioBtn.style.display = 'none';
        } else {
            this.newScenarioBtn.style.display = 'block';
            this.newScenarioBtn.textContent = this.currentScenarioTab === 'maps' ? '+ New Map' : '+ New Scenario';
        }

        // Auto-select first item
        if (filtered.length > 0) {
            if (!this.selectedScenarioName || !filtered.find(s => s.name === this.selectedScenarioName)) {
                const first = filtered[0];
                this.selectedScenarioName = first.name;
                this.selectedScenarioData = first;
                this.scenarioList.firstElementChild.classList.add('selected');
                this.showScenarioPreview(first);
            } else {
                this.showScenarioPreview(this.selectedScenarioData);
            }
        }
    }

    async importScenario() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const scenario = this.scenarioManager.parseImport(text);

                const existing = this.scenarioManager.getScenario(scenario.name);
                if (existing) {
                    const choice = await Dialog.confirm(
                        `A scenario with name "${scenario.name}" already exists.\n\n` +
                        `Click OK to REPLACE the existing scenario.\n` +
                        `Click Cancel to import as a NEW scenario.`
                    );

                    if (choice) {
                        scenario.isBuiltIn = false;
                        scenario.createdAt = Date.now();
                    } else {
                        scenario.name = this.scenarioManager.generateUniqueName(scenario.name);
                        scenario.isBuiltIn = false;
                        scenario.createdAt = Date.now();
                    }
                } else {
                    scenario.isBuiltIn = false;
                    if (!scenario.createdAt) scenario.createdAt = Date.now();
                }

                this.scenarioManager.saveEditorScenario(scenario);
                Dialog.alert(`Imported: ${scenario.name}`);
                this.renderScenarioList();
            } catch (e) {
                Dialog.alert('Import failed: ' + e.message);
            }
        };

        input.click();
    }

    exportSelectedScenario() {
        if (!this.selectedScenarioName) return;

        const json = this.scenarioManager.exportScenario(this.selectedScenarioName);
        if (json) {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.selectedScenarioData.name.replace(/[^a-z0-9]/gi, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Get pending scenario for game start
     */
    getPendingScenario() {
        return this.pendingScenario;
    }

    /**
     * Clear pending scenario
     */
    clearPendingScenario() {
        this.pendingScenario = null;
    }

    /**
     * Load pending scenario from localStorage if needed
     */
    loadPendingScenarioIfNeeded() {
        if (!this.pendingScenario) {
            const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
            if (savedScenarioName) {
                const onlineCache = localStorage.getItem('dicy_onlineMapCache');
                if (onlineCache) {
                    try {
                        const scenario = JSON.parse(onlineCache);
                        if (scenario && scenario.name === savedScenarioName) {
                            this.pendingScenario = scenario;
                            return;
                        }
                    } catch (e) {
                        console.error('Failed to parse online map cache', e);
                    }
                }

                const scenario = this.scenarioManager.loadScenario(savedScenarioName);
                if (scenario) {
                    this.pendingScenario = scenario;
                }
            }
        }
    }
}
