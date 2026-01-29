/**
 * AIRegistry - Manages built-in and custom AIs
 * 
 * Features:
 * - Registers built-in AI presets (easy, medium, hard)
 * - Stores custom user-created AIs in localStorage
 * - Import/Export AIs as JSON for sharing
 */
import builtinAIs from '../scenarios/builtin-ais.json';

export class AIRegistry {
    constructor() {
        this.builtIn = new Map();
        this.custom = new Map();

        // Register built-in AIs
        this.registerBuiltInAIs();
    }

    /**
     * Register all built-in AI presets
     */
    registerBuiltInAIs() {
        for (const ai of builtinAIs) {
            const id = ai.id || ai.name.toLowerCase();
            const uuid = ai.uuid || `builtin-${id}-001`;
            this.builtIn.set(id, {
                ...ai,
                id,
                uuid
            });
        }
    }

    /**
     * Get an AI by ID (checks both built-in and custom)
     */
    getAI(id) {
        return this.builtIn.get(id) || this.custom.get(id) || null;
    }

    /**
     * Get all available AIs for UI dropdowns
     */
    getAllAIs() {
        const ais = [];

        // Built-in first
        for (const [id, ai] of this.builtIn) {
            ais.push({ ...ai, isBuiltIn: true });
        }

        // Then custom
        for (const [id, ai] of this.custom) {
            ais.push({ ...ai, isBuiltIn: false });
        }

        return ais;
    }

    /**
     * Register a custom AI
     */
    registerCustomAI(id, definition) {
        this.custom.set(id, {
            id,
            uuid: definition.uuid || this.generateUUID(),
            name: definition.name,
            description: definition.description || '',
            prompt: definition.prompt || '',
            code: definition.code
        });
        this.saveCustomAIs();
    }

    /**
     * Delete a custom AI
     */
    deleteCustomAI(id) {
        this.custom.delete(id);
        this.saveCustomAIs();
        // Also clear its storage
        localStorage.removeItem(`dicy_ai_storage_${id}`);
    }

    /**
     * Update a custom AI
     */
    updateCustomAI(id, definition) {
        if (this.custom.has(id)) {
            this.custom.set(id, {
                ...this.custom.get(id),
                ...definition,
                id
            });
            this.saveCustomAIs();
        }
    }

    /**
     * Save custom AIs to localStorage
     */
    saveCustomAIs() {
        const data = {};
        for (const [id, ai] of this.custom) {
            data[id] = ai;
        }
        localStorage.setItem('dicy_custom_ais', JSON.stringify(data));
    }

    /**
     * Load custom AIs from localStorage
     */
    loadCustomAIs() {
        try {
            const data = JSON.parse(localStorage.getItem('dicy_custom_ais') || '{}');
            this.custom.clear();
            for (const [id, ai] of Object.entries(data)) {
                this.custom.set(id, ai);
            }
        } catch (e) {
            console.warn('[AIRegistry] Failed to load custom AIs:', e.message);
            this.custom.clear();
        }
    }

    /**
     * Export an AI as JSON object (for file download)
     */
    exportAI(id) {
        const ai = this.getAI(id);
        if (!ai) return null;

        return {
            uuid: ai.uuid,
            name: ai.name,
            description: ai.description || '',
            prompt: ai.prompt || '',
            code: ai.code,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import an AI from JSON data
     * If uuid matches existing AI, it will be replaced
     */
    importAI(data) {
        try {
            if (!data.name || !data.code) {
                throw new Error('Invalid AI format: missing name or code');
            }

            const uuid = data.uuid || this.generateUUID();

            // Check if AI with same uuid exists
            let existingId = null;
            for (const [id, ai] of this.custom) {
                if (ai.uuid === uuid) {
                    existingId = id;
                    break;
                }
            }

            const id = existingId || 'custom_' + Date.now();

            if (existingId) {
                this.updateCustomAI(id, {
                    uuid,
                    name: data.name,
                    description: data.description || '',
                    prompt: data.prompt || '',
                    code: data.code
                });
            } else {
                this.registerCustomAI(id, {
                    uuid,
                    name: data.name,
                    description: data.description || '',
                    prompt: data.prompt || '',
                    code: data.code
                });
            }

            return { success: true, id, replaced: !!existingId };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Generate a unique ID for a new custom AI
     */
    generateId() {
        return 'custom_' + Date.now();
    }

    /**
     * Generate a UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
