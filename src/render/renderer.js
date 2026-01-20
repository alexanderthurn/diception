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
    }

    async init() {
        this.app = new Application();
        await this.app.init({
            background: '#050510',
            resizeTo: window,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        });

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
            // Trigger reinforcement animation (Beginner mode only)
            this.grid.animateReinforcements(data);
            // Redraw numbers
            this.draw();
        });
        this.game.on('turnStart', () => this.draw()); // update highlights
    }

    autoFitCamera() {
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
        const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x to avoid being too zoomed

        // Apply scale
        this.rootContainer.scale.set(Math.max(0.3, scale));

        // Center the map with offset for left sidebar on desktop
        const scaledWidth = mapPixelWidth * this.rootContainer.scale.x;
        const scaledHeight = mapPixelHeight * this.rootContainer.scale.y;

        // On desktop (>768px), offset to the right to account for the 280px sidebar
        const isMobile = window.innerWidth <= 768;
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
}
