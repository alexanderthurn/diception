import { Container, Graphics, Text, Sprite, RenderTexture } from 'pixi.js';

/**
 * TileRenderer - Optimized tile rendering using pre-rendered sprites
 * 
 * This is the SINGLE SOURCE OF TRUTH for tile rendering.
 * Uses RenderTexture to pre-render dice patterns once, then fast sprite rendering.
 */
export class TileRenderer {
    // Texture cache
    static textureCache = new Map();
    static app = null;
    static initialized = false;
    static tileSize = 60;
    static masterDiceTexture = null;
    static diceDataURL = null;

    // Supported dice sides
    static diceSidesOptions = [2, 4, 6, 8, 10, 12, 20];
    static maxDiceCount = 25;

    /**
     * Initialize textures - call once at startup
     * @param {Application} app - PixiJS Application instance
     */
    static async initTextures(app) {
        if (TileRenderer.initialized) return;

        TileRenderer.app = app;
        const size = TileRenderer.tileSize;

        console.log('TileRenderer: Creating master dice texture...');
        TileRenderer.masterDiceTexture = TileRenderer.createMasterDiceTexture(app);

        // Extract as DataURL for DOM HUD
        try {
            const tempSprite = new Sprite(TileRenderer.masterDiceTexture);
            TileRenderer.diceDataURL = await app.renderer.extract.base64(tempSprite);
            tempSprite.destroy();
        } catch (e) {
            console.warn('Failed to extract dice DataURL', e);
        }

        console.log('TileRenderer: Pre-rendering dice patterns...');

        // Pre-render tile background (white, will be tinted)
        TileRenderer.textureCache.set('bg', TileRenderer.createBgTexture(app, size));
        TileRenderer.textureCache.set('bg_border', TileRenderer.createBgTexture(app, size, true));

        // Pre-render D6 emoji dice patterns (1-25 dice)
        for (let count = 1; count <= TileRenderer.maxDiceCount; count++) {
            const key = `dice_6_${count}`;
            const texture = TileRenderer.createDicePatternTexture(app, size, count, 6);
            TileRenderer.textureCache.set(key, texture);
        }

        // Pre-render other dice sides patterns (1-25 dice for each sides value)
        for (const sides of TileRenderer.diceSidesOptions) {
            if (sides === 6) continue; // Already done with emoji

            for (let count = 1; count <= TileRenderer.maxDiceCount; count++) {
                const key = `dice_${sides}_${count}`;
                const texture = TileRenderer.createDicePatternTexture(app, size, count, sides);
                TileRenderer.textureCache.set(key, texture);
            }
        }

        TileRenderer.initialized = true;
        console.log(`TileRenderer: Pre-rendered ${TileRenderer.textureCache.size} textures`);
    }

    /**
     * Create background texture (white, for tinting)
     */
    static createBgTexture(app, size, withBorder = false) {
        const g = new Graphics();
        const scale = size / 60;

        g.rect(0, 0, size, size);
        g.fill({ color: 0xffffff, alpha: 1 });

        if (withBorder) {
            // Manual inset for perfect 1px inner border
            g.rect(0.5 * scale, 0.5 * scale, size - 1 * scale, size - 1 * scale);
            g.stroke({ width: 1 * scale, color: 0xffffff, alpha: 0.4, alignment: 0.5, join: 'miter', cap: 'square' });
        }

        const texture = app.renderer.generateTexture({
            target: g,
            resolution: 4, // 4x resolution for crisp rendering when zoomed
            antialias: false
        });
        g.destroy();
        return texture;
    }

    /**
     * Create dice pattern texture (white dice on transparent bg)
     */
    static createDicePatternTexture(app, size, count, sides) {
        const container = new Container();

        // Add invisible bounds to ensure texture is exactly size x size
        // Without this, generateTexture only captures the visible dice area
        const bounds = new Graphics();
        bounds.rect(0, 0, size, size);
        bounds.fill({ color: 0x000000, alpha: 0 });
        container.addChild(bounds);

        // Render dice pattern in white (will be tinted later)
        TileRenderer.renderDiceToContainer(container, {
            size,
            diceCount: count,
            diceSides: sides,
            color: 0xffffff
        });

        const texture = app.renderer.generateTexture({
            target: container,
            resolution: 4, // 4x resolution for crisp rendering when zoomed
            antialias: false
        });

        container.destroy({ children: true });
        return texture;
    }

    /**
     * Create a single high-resolution dice face texture
     */
    static createMasterDiceTexture(app) {
        const size = 256; // High resolution base
        const text = new Text({
            text: '🎲',
            style: {
                fontSize: size * 0.8,
                fill: 0xffffff,
                fontFamily: 'Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"',
                fontWeight: 'bold',
                align: 'center'
            }
        });

        // Use a container to center it perfectly
        const container = new Container();
        container.addChild(text);
        text.anchor.set(0.5);
        text.x = size / 2;
        text.y = size / 2;

        const texture = app.renderer.generateTexture({
            target: container,
            resolution: 1,
            antialias: true
        });

        container.destroy({ children: true });
        return texture;
    }

    /**
     * Create a tile using sprites (FAST - use this in game)
     * Falls back to createTile() if textures not initialized
     */
    static createTileSprite(options = {}) {
        if (!TileRenderer.initialized) {
            // Fallback to slow method if not initialized
            return TileRenderer.createTile(options);
        }

        const {
            size = 60,
            diceCount = 1,
            diceSides = 6,
            color = 0x00ffff,
            fillAlpha = 0.4,
            showBorder = true
        } = options;

        const container = new Container();

        // Background sprite
        const bgKey = showBorder ? 'bg_border' : 'bg';
        const bgTexture = TileRenderer.textureCache.get(bgKey);

        if (bgTexture) {
            const bgSprite = new Sprite(bgTexture);
            bgSprite.tint = color;
            bgSprite.alpha = fillAlpha;

            // Scale to desired size
            const scale = size / TileRenderer.tileSize;
            bgSprite.scale.set(scale, scale);

            container.addChild(bgSprite);
        }

        // Dice pattern sprite
        // Find closest supported dice sides
        let actualSides = 6;
        if (TileRenderer.diceSidesOptions.includes(diceSides)) {
            actualSides = diceSides;
        }

        const diceKey = `dice_${actualSides}_${Math.min(diceCount, TileRenderer.maxDiceCount)}`;
        const diceTexture = TileRenderer.textureCache.get(diceKey);

        if (diceTexture) {
            const diceSprite = new Sprite(diceTexture);
            diceSprite.tint = diceSides === 6 ? 0xffffff : color; // D6 emoji stays white, others get tinted

            // Scale to desired size
            const scale = size / TileRenderer.tileSize;
            diceSprite.scale.set(scale, scale);

            container.addChild(diceSprite);
        }

        return container;
    }

    /**
     * Create a tile graphic with dice (SLOW - use for fallback/intro only)
     */
    static createTile(options = {}) {
        const {
            size = 60,
            diceCount = 1,
            diceSides = 6,
            color = 0x00ffff,
            fillAlpha = 0.4,
            showBorder = true
        } = options;

        const container = new Container();

        // Background
        const bg = new Graphics();
        const scale = size / 60;
        bg.rect(0, 0, size, size);
        bg.fill({ color: color, alpha: fillAlpha });

        if (showBorder) {
            // Manual inset for perfect 1px inner border
            bg.rect(0.5 * scale, 0.5 * scale, size - 1 * scale, size - 1 * scale);
            bg.stroke({ width: 1 * scale, color: 0xffffff, alpha: 0.4, alignment: 0.5, join: 'miter', cap: 'square' });
        }
        container.addChild(bg);

        // Add dice
        TileRenderer.renderDiceToContainer(container, {
            size,
            diceCount,
            diceSides,
            color: null // Force white text/pips for better visibility (icon style)
        });

        return container;
    }

    /**
     * Render dice patterns onto a container (internal helper)
     */
    static renderDiceToContainer(container, options = {}) {
        const {
            size = 60,
            diceCount = 1,
            diceSides = 6,
            color = null
        } = options;

        const centerX = size / 2;
        const centerY = size / 2;

        // Determine grid size and spacing based on count
        const scaleFactor = size / 60; // Base size is 60
        let gridSize, fontSize, spacing;

        if (diceCount <= 9) {
            gridSize = 3;
            fontSize = 12 * scaleFactor;
            spacing = 13 * scaleFactor;
        } else if (diceCount <= 16) {
            gridSize = 4;
            fontSize = 10 * scaleFactor;
            spacing = 11 * scaleFactor;
        } else {
            gridSize = 5;
            fontSize = 8 * scaleFactor;
            spacing = 9 * scaleFactor;
        }

        // Predefined patterns for 1-9 (classic dice layouts)
        const classicPatterns = {
            1: [[0, 0]],
            2: [[-0.8, -0.8], [0.8, 0.8]],
            3: [[-1, -1], [0, 0], [1, 1]],
            4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
            5: [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]],
            6: [[-0.8, -1], [0.8, -1], [-0.8, 0], [0.8, 0], [-0.8, 1], [0.8, 1]],
            7: [[-0.8, -1], [0.8, -1], [-0.8, 0], [0.8, 0], [-0.8, 1], [0.8, 1], [0, 0]],
            8: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
            9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
        };

        let positions;

        if (diceCount <= 9 && classicPatterns[diceCount]) {
            positions = classicPatterns[diceCount];
        } else {
            // Generate dynamic grid positions for 10+ dice
            positions = [];
            const half = (gridSize - 1) / 2;

            for (let row = 0; row < gridSize && positions.length < diceCount; row++) {
                for (let col = 0; col < gridSize && positions.length < diceCount; col++) {
                    positions.push([col - half, row - half]);
                }
            }
        }

        // Render each die
        for (const pos of positions) {
            const dx = centerX + (pos[0] * spacing);
            const dy = centerY + (pos[1] * spacing);

            if (diceSides !== 6) {
                // Non-standard dice: show dice sides number
                TileRenderer.renderDieSides(container, dx, dy, diceSides, fontSize, color);
            } else {
                // Standard 6-sided dice: use emoji
                TileRenderer.renderDieEmoji(container, dx, dy, fontSize, color);
            }
        }
    }

    /**
     * Render a single die with sides label
     */
    static renderDieSides(container, x, y, sides, fontSize, color) {
        const labelFontSize = Math.max(6, fontSize * 0.75);

        const labelText = new Text({
            text: sides.toString(),
            style: {
                fontFamily: 'Arial',
                fontSize: labelFontSize,
                fontWeight: 'bold',
                fill: 0xffffff,
                align: 'center',
                stroke: { color: 0x000000, width: Math.max(2, labelFontSize * 0.1) }
            }
        });

        if (color) {
            labelText.tint = color;
        }

        labelText.anchor.set(0.5);
        labelText.x = x;
        labelText.y = y;
        container.addChild(labelText);
    }

    /**
     * Render a single die with master sprite (6-sided)
     */
    static renderDieEmoji(container, x, y, fontSize, color) {
        if (!TileRenderer.masterDiceTexture) return;

        const sprite = new Sprite(TileRenderer.masterDiceTexture);

        // Scale sprite to match desired fontSize
        // The master texture is 256px, fontSize is typically 8-12
        const scale = (fontSize * 1.2) / 256;
        sprite.scale.set(scale, scale);

        sprite.anchor.set(0.5);
        sprite.x = x;
        sprite.y = y;

        if (color) {
            sprite.tint = color;
        }

        container.addChild(sprite);
    }

    /**
     * Check if textures are initialized
     */
    static isReady() {
        return TileRenderer.initialized;
    }

    /**
     * Get a cached dice texture directly (for advanced use)
     */
    static getDiceTexture(diceSides, diceCount) {
        const key = `dice_${diceSides}_${Math.min(diceCount, TileRenderer.maxDiceCount)}`;
        return TileRenderer.textureCache.get(key);
    }
}
