/**
 * GilrsInputAdapter — Native gamepad access via gilrs (Rust/Tauri).
 *
 * When running inside a Tauri desktop build, window.gilrs is injected by
 * the Rust backend.  This adapter polls all connected gamepads through gilrs,
 * bypassing the browser's navigator.getGamepads() 4-slot limit.
 *
 * The data format from Rust is already in W3C Standard Gamepad layout:
 *   { id, name, buttons: [16 bools], axes: [LX, LY, RX, RY] }
 *
 * Usage:
 *   - Call gilrsAdapter.isAvailable to check if gilrs is ready.
 *   - In the InputManager polling loop, call gilrsAdapter.poll() to get
 *     gamepad snapshots, then process them the same way as navigator gamepads.
 */

export class GilrsInputAdapter {
    /** True when running inside a Tauri desktop build with gilrs enabled. */
    get isAvailable() {
        return typeof window !== 'undefined' && !!window.gilrs?.poll;
    }

    /**
     * Poll all connected gamepads via gilrs.
     * Returns an array of objects matching W3C Gamepad-like shape:
     *   { id, name, buttons: bool[16], axes: number[4] }
     *
     * Returns empty array if gilrs is unavailable or poll fails.
     */
    async poll() {
        if (!this.isAvailable) return [];
        try {
            return await window.gilrs.poll();
        } catch {
            return [];
        }
    }
}

/** Singleton — import this everywhere instead of constructing new instances. */
export const gilrsAdapter = new GilrsInputAdapter();
