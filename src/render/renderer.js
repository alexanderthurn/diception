import { Application, Container } from 'pixi.js';
import { GridRenderer } from './grid-renderer.js';
import { AnimationManager } from './animation-manager.js';
import { TileRenderer } from './tile-renderer.js';

export class Renderer {
    constructor(containerElement, game, inputManager = null) {
        this.container = containerElement;
        this.game = game;
        this.inputManager = inputManager;
        this.app = null;
        this.grid = null;
        this.rootContainer = null;
        this.animator = null;
        this.gameSpeed = 'beginner';
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.originalX = 0;
        this.originalY = 0;
        this.editorActive = false;
    }


    async init() {
        // Cap resolution to 1.5 to avoid extreme overhead on Retina/4K displays while keeping it crisp
        const realRes = Math.min(window.devicePixelRatio || 1, 1.5);
        this.app = new Application();
        await this.app.init({
            background: '#050510',
            resizeTo: this.container,
            antialias: true,
            resolution: realRes,
            autoDensity: true,
            roundPixels: true,
            preference: 'webgl',
            hello: false // Minor performance boost by skipping splash
        });

        this.app.canvas.style.display = 'block';
        // Remove object-fit or fixed percentages that might fight with Pixi's resizeTo/autoDensity
        // display: block is enough to ensure it behaves correctly in the container.

        // Ensure smooth rendering but don't overwork the CPU/GPU
        this.app.ticker.maxFPS = Math.min(window.screen.refreshRate || 60, 120);

        this.container.appendChild(this.app.canvas);

        // Pre-render tile textures for fast sprite rendering
        await TileRenderer.initTextures(this.app);

        // Create a root container for the game world
        this.rootContainer = new Container();
        this.app.stage.addChild(this.rootContainer);

        // Initialize Animation Manager
        this.animator = new AnimationManager(this);

        // Initialize sub-renderers
        this.grid = new GridRenderer(this.rootContainer, this.game, this.animator, this.inputManager);

        // Center the grid initially
        this.centerGrid();

        // Listen to game events to trigger redraws
        this.game.on('gameStart', () => {
            this.grid.invalidateRegions();
            this.draw();
            this.autoFitCamera();
        });

        this.game.on('attackResult', (result) => {
            if (result.won) {
                this.grid.invalidateRegions();
            }
            // Trigger animation
            this.grid.animateAttack(result, () => {
                // Callback when animation finishes (optional if we draw immediately)
            });
            // Update board state immediately (animations will overlay)
            this.draw();
        });

        this.game.on('reinforcements', (data) => {
            // Trigger reinforcement animation removed as per user request
            // Redraw numbers
            this.draw();
        });
        this.game.on('turnStart', () => this.draw()); // update highlights

        // Add shake update to ticker
        this.app.ticker.add(this.updateShake.bind(this));
    }

    autoFitCamera(fitRatio = 1.0) {
        if (!this.game.map || !this.rootContainer) return;

        const map = this.game.map;
        const tileSize = this.grid.tileSize;
        const gap = this.grid.gap;

        // Calculate map pixel dimensions
        const mapPixelWidth = map.width * (tileSize + gap);
        const mapPixelHeight = map.height * (tileSize + gap);

        let screenWidth, screenHeight, padding;
        if (this.editorActive) {
            // Editor: right panel ~290px, top bar ~70px, bottom bar ~80px
            screenWidth = this.app.screen.width - 310;
            screenHeight = this.app.screen.height - 160;
            padding = 0;
        } else {
            padding = 120;
            screenWidth = this.app.screen.width - padding;
            screenHeight = this.app.screen.height - padding;
        }

        // Calculate scale to fit
        const scaleX = screenWidth / mapPixelWidth;
        const scaleY = screenHeight / mapPixelHeight;
        const scale = Math.min(scaleX, scaleY, 1.5) * fitRatio; // Apply fitRatio

        const safeScale = Math.max(0.2, scale);
        this.rootContainer.scale.set(safeScale, safeScale);

        const scaledWidth = mapPixelWidth * this.rootContainer.scale.x;
        const scaledHeight = mapPixelHeight * this.rootContainer.scale.y;

        if (this.editorActive) {
            // Position in lower-left: ~25% inset from left, bottom-aligned above bottom bar
            const leftInset = this.app.screen.width * 0.25;
            const bottomInset = 100; // Space for bottom bar and padding
            this.rootContainer.x = leftInset;
            this.rootContainer.y = this.app.screen.height - scaledHeight - bottomInset;
        } else {
            // Center the map with offset for left sidebar on desktop
            const isMobile = this.app.screen.width <= 768 || this.app.screen.height <= 720;
            const sidebarOffset = isMobile ? 0 : 140;
            this.rootContainer.x = (this.app.screen.width - scaledWidth) / 2 + sidebarOffset;
            this.rootContainer.y = (this.app.screen.height - scaledHeight) / 2;
        }
    }

    centerGrid() {
        // Simple centering logic
        // Ideally we want to scale based on map size vs screen size
        // We will do this properly in GridRenderer
    }

    draw() {
        this.grid.draw();
    }

    forceUpdate() {
        // Force complete redraw - used when loading scenarios
        this.grid.invalidate(); // Clear tile cache for full redraw
        this.draw();
        this.autoFitCamera();
    }

    setSelection(x, y) {
        this.grid.setSelection(x, y);
        this.draw(); // Trigger redraw to show highlight
    }

    setHover(x, y) {
        this.grid.setHover(x, y);
    }

    setCursor(x, y) {
        this.grid.setCursor(x, y);
    }

    setGameSpeed(speed) {
        console.log('renderer.setGameSpeed called with:', speed);
        this.gameSpeed = speed;
        if (this.animator) {
            this.animator.setGameSpeed(speed);
        }
        if (this.grid) {
            this.grid.setGameSpeed(speed);
        }
    }

    setDiceSides(sides) {
        if (this.grid) {
            this.grid.setDiceSides(sides);
        }
    }

    setEffectsQuality(quality) {
        if (this.grid) {
            this.grid.setEffectsQuality(quality);
        }
    }

    pan(dx, dy) {
        if (!this.rootContainer) return;
        this.rootContainer.x += dx;
        this.rootContainer.y += dy;
    }

    /**
     * Center and scale the view for the 4x4 config preview (setup menu only).
     * The preview in effects is at (width/2, height*0.75); we center it on screen.
     */
    centerConfigPreview() {
        if (!this.rootContainer || !this.grid) return;
        const size = 4;
        const tileSize = this.grid.tileSize;
        const gap = this.grid.gap;
        const mapPixelSize = size * (tileSize + gap);

        const padding = 120;
        const screenWidth = this.app.screen.width - padding;
        const screenHeight = this.app.screen.height - padding;
        const scale = Math.min(screenWidth / mapPixelSize, screenHeight / mapPixelSize, 1.5);

        const safeScale = Math.max(0.2, scale);
        this.rootContainer.scale.set(safeScale, safeScale);

        const centerX = this.app.screen.width * 0.5;
        const centerY = this.app.screen.height * 0.75;
        const isMobile = this.app.screen.width <= 768 || this.app.screen.height <= 720;
        const sidebarOffset = isMobile ? 0 : 140;
        this.rootContainer.x = this.app.screen.width / 2 + sidebarOffset - centerX * scale;
        this.rootContainer.y = this.app.screen.height / 2 - centerY * scale;
    }

    zoom(delta, x, y) {
        if (!this.rootContainer) return;

        const scaleFactor = 1.1;
        const newScale = delta > 0 ? this.rootContainer.scale.x / scaleFactor : this.rootContainer.scale.x * scaleFactor;

        // Clamp scale
        if (newScale < 0.2 || newScale > 5.0) return;

        // Zoom towards mouse point
        const worldPos = {
            x: (x - this.rootContainer.x) / this.rootContainer.scale.x,
            y: (y - this.rootContainer.y) / this.rootContainer.scale.y
        };

        this.rootContainer.scale.set(newScale, newScale);

        this.rootContainer.x = x - worldPos.x * newScale;
        this.rootContainer.y = y - worldPos.y * newScale;
    }

    /**
     * Get screen coordinates for a tile's center.
     */
    getTileScreenPosition(x, y) {
        if (!this.rootContainer || !this.grid) return null;

        const localX = x * (this.grid.tileSize + this.grid.gap) + this.grid.tileSize / 2;
        const localY = y * (this.grid.tileSize + this.grid.gap) + this.grid.tileSize / 2;

        return {
            x: this.rootContainer.x + localX * this.rootContainer.scale.x,
            y: this.rootContainer.y + localY * this.rootContainer.scale.y
        };
    }

    screenShake(intensity, duration = 300) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
    }

    updateShake(ticker) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= ticker.deltaMS;

            if (this.shakeDuration <= 0) {
                this.shakeDuration = 0;
                this.shakeIntensity = 0;
                this.rootContainer.pivot.set(0, 0);
            } else {
                const currentIntensity = this.shakeIntensity * (this.shakeDuration / 500);
                this.rootContainer.pivot.x = (Math.random() - 0.5) * currentIntensity;
                this.rootContainer.pivot.y = (Math.random() - 0.5) * currentIntensity;
            }
        }
    }
}
