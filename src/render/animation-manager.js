import { Ticker } from 'pixi.js';

export class AnimationManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.tweens = [];
        this.fastMode = false;

        // Add update loop
        Ticker.shared.add(this.update, this);
    }

    setFastMode(enabled) {
        this.fastMode = enabled;
    }

    update(ticker) {
        const delta = ticker.deltaTime;

        for (let i = this.tweens.length - 1; i >= 0; i--) {
            const tween = this.tweens[i];
            tween.time += delta;

            const progress = Math.min(tween.time / tween.duration, 1);
            const ease = this.easeOutQuad(progress);

            tween.onUpdate(ease);

            if (progress >= 1) {
                if (tween.onComplete) tween.onComplete();
                this.tweens.splice(i, 1);
            }
        }
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    // Generic shake effect for a container/graphics object
    shake(object, intensity = 5, duration = 30) {
        const originalX = object.x;
        const originalY = object.y;

        this.addTween({
            duration: duration,
            onUpdate: (p) => {
                if (p >= 1) {
                    object.x = originalX;
                    object.y = originalY;
                } else {
                    object.x = originalX + (Math.random() * intensity - intensity / 2);
                    object.y = originalY + (Math.random() * intensity - intensity / 2);
                }
            }
        });
    }

    // Flash color effect
    flash(object, color, duration = 20) {
        // Assuming object has tint or we overlay something.
        // For Graphics, it's harder to just "tint" specific parts if not sprite.
        // We can add a temporary graphics object on top.
        // Or if it's a sprite, use tint.
        // For our tile graphics, we redraw every frame? No, we redraw on event.
        // Let's rely on GridRenderer to handle "flash" state if we want complex effects.
        // Or we can manipulate the alpha of existing objects if we hold references.
    }

    addTween(config) {
        // config: { duration (frames), onUpdate(progress), onComplete }
        this.tweens.push({
            time: 0,
            duration: config.duration || 60,
            onUpdate: config.onUpdate || (() => { }),
            onComplete: config.onComplete
        });
    }
}
