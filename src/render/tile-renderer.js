import { Container, Graphics, Sprite, Texture } from 'pixi.js';

/**
 * TileRenderer - Optimized tile rendering using spritesheet assets
 * 
 * This is the SINGLE SOURCE OF TRUTH for tile rendering.
 * Uses cached textures generated from the spritesheet frames.
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
    // Note: D6 is handled specially (emoji style), others use number sprites
    static diceSidesOptions = [2, 4, 6, 8, 10, 12, 20];
    static maxDiceCount = 25;

    /**
     * Initialize textures from spritesheet - call once at startup after Assets are loaded
     * @param {Application} app - PixiJS Application instance
     */
    static async initTextures(app) {
        if (TileRenderer.initialized) return;

        TileRenderer.app = app;
        const size = TileRenderer.tileSize;

        console.log('TileRenderer: Initializing spritesheet textures...');

        try {
            // Get base textures from loaded spritesheet
            // Note: 'bg.png' is white square for tinting
            // 'die_d6.png' is the emoji for standard dice
            // 'die_dX.png' are the number sprites for other dice
            const bgTexture = Texture.from('bg.png');

            // Cache backgrounds
            TileRenderer.textureCache.set('bg', bgTexture);
            TileRenderer.textureCache.set('bg_border', bgTexture); // Reusing bg for now (borders handled by GridRenderer)

            // Set Master Dice Texture (D6 emoji) for UI usage
            TileRenderer.masterDiceTexture = Texture.from('die_d6.png');

            // Extract DataURL for DOM HUD masking
            try {
                // Create a temporary sprite to extract
                const tempSprite = new Sprite(TileRenderer.masterDiceTexture);
                TileRenderer.diceDataURL = await app.renderer.extract.base64(tempSprite);
                tempSprite.destroy();
            } catch (e) {
                console.warn('Failed to extract dice DataURL', e);
            }

            console.log('TileRenderer: Generating dice pattern cache from sprites...');

            // Generate D6 emoji patterns (1-25 dice)
            for (let count = 1; count <= TileRenderer.maxDiceCount; count++) {
                const key = `dice_6_${count}`;
                const texture = TileRenderer.createDicePatternTexture(app, size, count, 6);
                TileRenderer.textureCache.set(key, texture);
            }

            // Generate other dice sides patterns (1-25 dice for each sides value)
            for (const sides of TileRenderer.diceSidesOptions) {
                if (sides === 6) continue; // Already done with emoji

                for (let count = 1; count <= TileRenderer.maxDiceCount; count++) {
                    const key = `dice_${sides}_${count}`;
                    const texture = TileRenderer.createDicePatternTexture(app, size, count, sides);
                    TileRenderer.textureCache.set(key, texture);
                }
            }

            TileRenderer.initialized = true;
            console.log(`TileRenderer: Cached ${TileRenderer.textureCache.size} textures from spritesheet`);

        } catch (e) {
            console.error('TileRenderer: Failed to initialize textures from spritesheet', e);
        }
    }

    /**
     * Create dice pattern texture by composing sprites
     */
    static createDicePatternTexture(app, size, count, sides) {
        const container = new Container();

        // Add invisible bounds to ensure texture is exactly size x size
        const bounds = new Graphics();
        bounds.rect(0, 0, size, size);
        bounds.fill({ color: 0x000000, alpha: 0 });
        container.addChild(bounds);

        // Render dice pattern using sprites
        TileRenderer.renderDiceToContainer(container, {
            size,
            diceCount: count,
            diceSides: sides,
            color: 0xffffff // White base for tinting
        });

        const texture = app.renderer.generateTexture({
            target: container,
            resolution: 4, // 4x resolution for crisp rendering
            antialias: true
        });

        container.destroy({ children: true });
        return texture;
    }

    /**
     * Create a tile using cached sprites (FAST - use this in game)
     * Falls back to dynamic creation if not initialized
     */
    static createTileSprite(options = {}) {
        if (!TileRenderer.initialized) {
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
        let actualSides = 6;
        if (TileRenderer.diceSidesOptions.includes(diceSides)) {
            actualSides = diceSides;
        }

        const diceKey = `dice_${actualSides}_${Math.min(diceCount, TileRenderer.maxDiceCount)}`;
        const diceTexture = TileRenderer.textureCache.get(diceKey);

        if (diceTexture) {
            const diceSprite = new Sprite(diceTexture);
            // D6 (emoji) stays white (tinted slightly by method caller if needed, but usually white)
            // Other dice (numbers) get tinted to player color
            diceSprite.tint = diceSides === 6 ? 0xffffff : color;

            // Scale to desired size
            const scale = size / TileRenderer.tileSize;
            diceSprite.scale.set(scale, scale);

            container.addChild(diceSprite);
        }

        return container;
    }

    /**
     * Create a tile graphic dynamically (Fallback / Slow)
     */
    static createTile(options = {}) {
        const {
            size = 60,
            diceCount = 1,
            diceSides = 6,
            color = 0x00ffff,
            fillAlpha = 0.4
        } = options;

        const container = new Container();

        // Background
        const bg = new Graphics();
        bg.rect(0, 0, size, size);
        bg.fill({ color: color, alpha: fillAlpha });
        container.addChild(bg);

        // Add dice sprites
        TileRenderer.renderDiceToContainer(container, {
            size,
            diceCount,
            diceSides,
            color: null // Force white for visibility
        });

        return container;
    }

    /**
     * Render dice pattern using sprites onto a container
     * Internal helper shared by cache generation and fallback rendering
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
        let gridSize, spriteScale, spacing;

        // Tuning parameters for sprite layout
        // Sprites are 256x256 base. We need to scale them down to fit the tile (60x60 base).
        // A single die might be ~30x30 or ~15x15 depending on count.

        if (diceCount <= 9) {
            gridSize = 3;
            spriteScale = 0.06 * scaleFactor; // 50% of previous (0.12)
            spacing = 13 * scaleFactor;
        } else if (diceCount <= 16) {
            gridSize = 4;
            spriteScale = 0.045 * scaleFactor; // 50% of previous (0.09)
            spacing = 11 * scaleFactor;
        } else {
            gridSize = 5;
            spriteScale = 0.035 * scaleFactor; // 50% of previous (0.07)
            spacing = 9 * scaleFactor;
        }

        // Classic patterns for 1-9 dice
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
            // Dynamic grid positions for 10+ dice
            positions = [];
            const half = (gridSize - 1) / 2;
            for (let row = 0; row < gridSize && positions.length < diceCount; row++) {
                for (let col = 0; col < gridSize && positions.length < diceCount; col++) {
                    positions.push([col - half, row - half]);
                }
            }
        }

        // Determine which sprite texture to use
        let textureName = 'die_d6.png'; // Default emoji
        if (diceSides !== 6) {
            // Handle various die sides (1-16)
            // Ensure we have a valid texture name, clamp to 16 just in case
            const sideIndex = Math.min(Math.max(1, diceSides), 16);
            textureName = `die_d${sideIndex}.png`;
        }

        // Texture lookup might fail if Assets not ready (in fallback mode), 
        // but typically this runs after Assets are loaded.
        let dieTexture;
        try {
            dieTexture = Texture.from(textureName);
        } catch (e) {
            // Fallback if texture missing
            dieTexture = Texture.EMPTY;
        }

        // Render each die sprite
        for (const pos of positions) {
            const dx = centerX + (pos[0] * spacing);
            const dy = centerY + (pos[1] * spacing);

            const sprite = new Sprite(dieTexture);
            sprite.anchor.set(0.5);
            sprite.x = dx;
            sprite.y = dy;
            sprite.scale.set(spriteScale, spriteScale);

            if (color) {
                sprite.tint = color;
            }

            container.addChild(sprite);
        }
    }

    /**
     * Check if textures are initialized
     */
    static isReady() {
        return TileRenderer.initialized;
    }

    /**
     * Get a cached dice texture directly
     */
    static getDiceTexture(diceSides, diceCount) {
        const key = `dice_${diceSides}_${Math.min(diceCount, TileRenderer.maxDiceCount)}`;
        return TileRenderer.textureCache.get(key);
    }
}
