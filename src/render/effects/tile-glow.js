import { Container, Graphics, BlurFilter, Ticker } from 'pixi.js';

/**
 * TileGlow — blurred colour halos underneath territories.
 *
 * Behaviour:
 *   - Normally invisible (intensity = 0).
 *   - Call flash() on a human attack → intensity snaps to 1.0.
 *   - Decays quickly back to 0 when nothing happens (~1.5 s half-life).
 *   - Only active on "high" quality.
 *
 * Architecture: one Graphics object redrawn when tiles change, one BlurFilter pass.
 */
export class TileGlow {
    constructor(stage) {
        this.container = new Container();
        this.container.label  = 'tile-glow';

        this.gfx = new Graphics();
        this.container.addChild(this.gfx);

        this._blur = new BlurFilter({ strength: 28, quality: 3 });
        this.gfx.filters = [this._blur];

        stage.addChildAt(this.container, 0); // insert below tile container

        this._quality    = 'high';
        this._intensity  = 0;       // 0 = off, 1 = full glow
        this._peakAlpha  = 0.40;    // alpha when intensity = 1
        this._decay      = 0.990;   // multiplier per frame (~4 s to reach ~5%)
        this._tileSize   = 80;
        this._gap        = 4;
        this._lastTiles  = [];

        this.container.visible = false; // starts hidden

        this._tick = (ticker) => {
            if (this._intensity <= 0.005) {
                this._intensity = 0;
                this.container.visible = false;
                return;
            }
            this._intensity *= Math.pow(this._decay, ticker.deltaTime);
            this.gfx.alpha = this._peakAlpha * this._intensity;
        };

        Ticker.shared.add(this._tick);
    }

    /**
     * Boost glow intensity on a winning attack.
     * @param {number} strength  0..1 — fraction of max dice the defender had.
     *   strength=1.0 → full flash (defender had max dice).
     *   strength=0.2 → light flash (defender had 20% of max dice).
     */
    flash(strength = 1.0) {
        if (this._quality !== 'high') return;
        this._intensity = Math.min(1.0, this._intensity + strength);
        this.gfx.alpha  = this._peakAlpha * this._intensity;
        this.container.visible = true;
    }

    /**
     * Reduce glow intensity on a losing attack.
     * @param {number} fraction  0..1 — fraction of max dice the attacker threw.
     *   Scales how much the intensity drops.
     */
    dampen(fraction = 1.0) {
        if (this._quality !== 'high') return;
        this._intensity = Math.max(0, this._intensity - fraction * 0.4);
        this.gfx.alpha  = this._peakAlpha * this._intensity;
        if (this._intensity <= 0.005) {
            this._intensity = 0;
            this.container.visible = false;
        }
    }

    /** quality: 'off' | 'medium' | 'high' */
    setQuality(quality) {
        this._quality = quality;
        if (quality !== 'high') {
            this._intensity = 0;
            this.container.visible = false;
        }
    }

    /**
     * Redraw glow halos. Call whenever tiles are redrawn.
     * @param {Array} tiles  — [{ worldX, worldY, color }]
     * @param {number} tileSize
     */
    redraw(tiles, tileSize) {
        this._tileSize = tileSize;
        this._lastTiles = tiles;
        this.gfx.clear();

        const pad = tileSize * 0.30;

        for (const tile of tiles) {
            if (!tile.color) continue;
            this.gfx.rect(
                tile.worldX - pad,
                tile.worldY - pad,
                tileSize + pad * 2,
                tileSize + pad * 2,
            );
            this.gfx.fill({ color: tile.color, alpha: 1.0 });
        }
    }

    destroy() {
        Ticker.shared.remove(this._tick);
        this.container.destroy({ children: true });
    }
}
