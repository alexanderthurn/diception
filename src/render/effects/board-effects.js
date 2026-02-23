import { Graphics, Container, Ticker } from 'pixi.js';

const RING_POOL_SIZE = 20;

/**
 * BoardEffects — pool-based manager for board-space visual ring effects.
 *
 * All Graphics objects are pre-allocated in the constructor and recycled via
 * a simple array pool — zero heap allocations per frame during gameplay.
 *
 * Effects:
 *   conquestRipple(tileX, tileY, color, scale) — attacker-coloured ring on capture
 *   mergeRing(tileX, tileY)                    — gold ring when capture bridges two regions
 *   lastStandFlash(tileX, tileY)               — pulsing ring when defender holds
 *   eliminationWave(tileX, tileY, color)       — 3 staggered rings on player elimination
 *   closeCallTremor(tileX, tileY)              — double ring on razor-thin margin (≤1)
 */
export class BoardEffects {
    constructor(parentContainer, tileSize, gap) {
        this.tileSize = tileSize;
        this.gap      = gap;

        this.container       = new Container();
        this.container.label = 'board-effects';
        parentContainer.addChild(this.container);

        // Graphics ring pool
        this._ringPool    = [];
        this._activeRings = [];
        this._ringDataPool = [];

        for (let i = 0; i < RING_POOL_SIZE; i++) {
            const g = new Graphics();
            g.blendMode = 'add';
            g.visible   = false;
            this.container.addChild(g);
            this._ringPool.push(g);
        }

        for (let i = 0; i < RING_POOL_SIZE * 2; i++) {
            this._ringDataPool.push({
                g: null, x: 0, y: 0, color: 0,
                life: 0, maxLife: 0, delay: 0, type: 'conquest', scale: 1.0,
            });
        }

        this._tickerCb = this._update.bind(this);
        Ticker.shared.add(this._tickerCb);
    }

    // ── Coordinate helper ──────────────────────────────────────────────────────

    _tileToWorld(tileX, tileY) {
        return {
            x: tileX * (this.tileSize + this.gap) + this.tileSize / 2,
            y: tileY * (this.tileSize + this.gap) + this.tileSize / 2,
        };
    }

    // ── Pool helpers ───────────────────────────────────────────────────────────

    _acquireRing() { return this._ringPool.pop() || null; }

    _releaseRing(g) {
        g.clear();
        g.visible = false;
        this._ringPool.push(g);
    }

    _acquireRingData() {
        return this._ringDataPool.pop() || {
            g: null, x: 0, y: 0, color: 0,
            life: 0, maxLife: 0, delay: 0, type: 'conquest', scale: 1.0,
        };
    }

    _releaseRingData(d) { this._ringDataPool.push(d); }

    // ── Effect triggers ────────────────────────────────────────────────────────

    /** Attacker-coloured expanding ring on a successful capture. */
    conquestRipple(tileX, tileY, color, scale = 1.0) {
        const pos = this._tileToWorld(tileX, tileY);
        const g   = this._acquireRing();
        if (!g) return;

        const d   = this._acquireRingData();
        d.g       = g;
        d.x       = pos.x;
        d.y       = pos.y;
        d.color   = color;
        d.maxLife = 48;
        d.life    = 48;
        d.delay   = 0;
        d.type    = 'conquest';
        d.scale   = scale;
        g.visible = true;
        this._activeRings.push(d);
    }

    /** Gold expanding ring when capture bridges two previously separate regions. */
    mergeRing(tileX, tileY) {
        const pos = this._tileToWorld(tileX, tileY);
        const g   = this._acquireRing();
        if (!g) return;

        const d   = this._acquireRingData();
        d.g       = g;
        d.x       = pos.x;
        d.y       = pos.y;
        d.color   = 0xffdd00;
        d.maxLife = 52;
        d.life    = 52;
        d.delay   = 8;
        d.type    = 'merge';
        d.scale   = 1.0;
        g.visible = false;
        this._activeRings.push(d);
    }

    /** Pulsing ring at the defending tile when an attack fails. */
    lastStandFlash(tileX, tileY) {
        const pos = this._tileToWorld(tileX, tileY);
        const g   = this._acquireRing();
        if (!g) return;

        const d   = this._acquireRingData();
        d.g       = g;
        d.x       = pos.x;
        d.y       = pos.y;
        d.color   = 0xffd700;
        d.maxLife = 38;
        d.life    = 38;
        d.delay   = 0;
        d.type    = 'lastStand';
        d.scale   = 1.0;
        g.visible = true;
        this._activeRings.push(d);
    }

    /** 3 staggered rings radiating from the point of a player's elimination. */
    eliminationWave(tileX, tileY, color) {
        const pos = this._tileToWorld(tileX, tileY);
        for (let i = 0; i < 3; i++) {
            const g = this._acquireRing();
            if (!g) break;

            const delay = i * 18;
            const d     = this._acquireRingData();
            d.g       = g;
            d.x       = pos.x;
            d.y       = pos.y;
            d.color   = color;
            d.maxLife = 55;
            d.life    = 55 + delay;
            d.delay   = delay;
            d.type    = 'elimination';
            d.scale   = 1.0;
            g.visible = false;
            this._activeRings.push(d);
        }
    }

    /** 3 staggered rings from the attacker tile on a brave attack (fewer dice than defender). */
    braveCharge(tileX, tileY, color) {
        const pos = this._tileToWorld(tileX, tileY);
        for (let i = 0; i < 3; i++) {
            const g = this._acquireRing();
            if (!g) break;

            const d   = this._acquireRingData();
            d.g       = g;
            d.x       = pos.x;
            d.y       = pos.y;
            d.color   = i === 1 ? 0xffffff : color; // middle ring white for contrast
            d.maxLife = 44;
            d.life    = 44;
            d.delay   = i * 9;
            d.type    = 'brave';
            d.scale   = 1.0;
            g.visible = i === 0;
            this._activeRings.push(d);
        }
    }

    /** Two concentric rings when the attack margin is ≤ 1. */
    closeCallTremor(tileX, tileY) {
        const pos = this._tileToWorld(tileX, tileY);
        for (let i = 0; i < 2; i++) {
            const g = this._acquireRing();
            if (!g) break;

            const d   = this._acquireRingData();
            d.g       = g;
            d.x       = pos.x;
            d.y       = pos.y;
            d.color   = 0xffffff;
            d.maxLife = 22;
            d.life    = 22;
            d.delay   = i * 8;
            d.type    = 'closecall';
            d.scale   = 1.0;
            g.visible = false;
            this._activeRings.push(d);
        }
    }

    // ── Update loop ────────────────────────────────────────────────────────────

    _update() {
        for (let i = this._activeRings.length - 1; i >= 0; i--) {
            const r = this._activeRings[i];

            if (r.delay > 0) { r.delay--; continue; }
            if (!r.g.visible) r.g.visible = true;

            r.life--;
            const progress = 1 - r.life / r.maxLife;
            const alpha    = r.life / r.maxLife;
            const sc       = r.scale;

            let radius, lineWidth;
            switch (r.type) {
                case 'lastStand':
                    radius    = this.tileSize * (0.58 + Math.sin(progress * Math.PI * 4) * 0.12);
                    lineWidth = 3.5 * alpha;
                    break;
                case 'brave':
                    radius    = progress * this.tileSize * 3.8;
                    lineWidth = Math.max(0.5, 7 * (1 - progress));
                    break;
                case 'closecall':
                    radius    = this.tileSize * (0.5 + progress * 0.6);
                    lineWidth = Math.max(1, 2.5 * (1 - progress));
                    break;
                case 'elimination':
                    radius    = progress * this.tileSize * 4.0;
                    lineWidth = Math.max(0.5, 5 * (1 - progress));
                    break;
                case 'merge':
                    radius    = progress * this.tileSize * 3.2;
                    lineWidth = Math.max(0.5, 5 * (1 - progress));
                    break;
                default: // conquest
                    radius    = progress * this.tileSize * 2.8 * sc;
                    lineWidth = Math.max(0.5, 4 * (1 - progress));
                    break;
            }

            r.g.clear();
            r.g.rect(r.x - radius, r.y - radius, radius * 2, radius * 2);
            r.g.stroke({ color: r.color, width: lineWidth, alpha });

            if (r.life <= 0) {
                this._releaseRing(r.g);
                this._releaseRingData(r);
                this._activeRings.splice(i, 1);
            }
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    destroy() {
        Ticker.shared.remove(this._tickerCb);
        this.container.destroy({ children: true });
        this._ringPool.length     = 0;
        this._activeRings.length  = 0;
        this._ringDataPool.length = 0;
    }
}
