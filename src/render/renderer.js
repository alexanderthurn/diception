import { Application, Container } from 'pixi.js';
import { GridRenderer } from './grid-renderer.js';
import { AnimationManager } from './animation-manager.js';
import { TileRenderer } from './tile-renderer.js';

export class Renderer {
    constructor(containerElement, game) {
        this.container = containerElement;
        this.game = game;
        this.app = null;
        this.grid = null;
        this.rootContainer = null;
        this.animator = null;
        this.gameSpeed = 'beginner';
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.originalX = 0;
        this.originalY = 0;
    }


    async init() {
        const realRes = window.devicePixelRatio || 1;
        this.app = new Application();
        await this.app.init({
            background: '#050510',
            resizeTo: window,
            antialias: true,
            resolution: realRes,
            autoDensity: true,
            roundPixels: true,
            preference: 'high-performance'
        });

        this.app.ticker.maxFPS = 120;

        this.container.appendChild(this.app.canvas);

        // Pre-render tile textures for fast sprite rendering
        await TileRenderer.initTextures(this.app);

        // Create a root container for the game world
        this.rootContainer = new Container();
        this.app.stage.addChild(this.rootContainer);

        // Initialize Animation Manager
        this.animator = new AnimationManager(this);

        // Initialize sub-renderers
        this.grid = new GridRenderer(this.rootContainer, this.game, this.animator);

        // Center the grid initially
        this.centerGrid();

        // Listen to game events to trigger redraws
        this.game.on('gameStart', () => {
            this.draw();
            this.autoFitCamera();
        });

        this.game.on('attackResult', (result) => {
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

        // Get screen dimensions with some padding
        const padding = 120; // Leave room for UI elements
        const screenWidth = window.innerWidth - padding;
        const screenHeight = window.innerHeight - padding;

        // Calculate scale to fit
        const scaleX = screenWidth / mapPixelWidth;
        const scaleY = screenHeight / mapPixelHeight;
        const scale = Math.min(scaleX, scaleY, 1.5) * fitRatio; // Apply fitRatio

        // Apply scale
        this.rootContainer.scale.set(Math.max(0.2, scale)); // Allow slightly smaller scale

        // Center the map with offset for left sidebar on desktop
        const scaledWidth = mapPixelWidth * this.rootContainer.scale.x;
        const scaledHeight = mapPixelHeight * this.rootContainer.scale.y;

        // On desktop (>768px wide AND >720px high), offset to the right to account for the 280px sidebar
        const isMobile = window.innerWidth <= 768 || window.innerHeight <= 720;
        const sidebarOffset = isMobile ? 0 : 140; // Half of sidebar width to shift center

        this.rootContainer.x = (window.innerWidth - scaledWidth) / 2 + sidebarOffset;
        this.rootContainer.y = (window.innerHeight - scaledHeight) / 2;
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

        this.rootContainer.scale.set(newScale);

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
