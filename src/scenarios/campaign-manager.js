/**
 * Campaign Manager - Load/save campaigns (built-in + user)
 * One campaign per user. Built-ins are read-only.
 */

import { validateCampaign, validateLevel, getGridDimensions, sanitizeLevel } from './campaign-data.js';
import { getCachedIdentity } from './user-identity.js';
import builtinChapter1 from './builtin-chapter1.json';
import builtinChapter2 from './builtin-chapter2.json';
import builtinChapter3 from './builtin-chapter3.json';
import builtinChapter4 from './builtin-chapter4.json';
import builtinTutorial from './builtin-tutorial.json';

const STORAGE_KEY = 'dicy_userCampaign';

export class CampaignManager {
    constructor() {
        this.builtinCampaigns = [
            { ...builtinTutorial, isBuiltIn: true },
            { ...builtinChapter1, isBuiltIn: true },
            { ...builtinChapter2, isBuiltIn: true },
            { ...builtinChapter3, isBuiltIn: true },
            { ...builtinChapter4, isBuiltIn: true }
        ];
        this.userCampaign = null;
        this.onlineCampaigns = []; // Fetched from backend
        this.loadUserCampaign();
    }

    /**
     * Load user campaign from localStorage
     */
    loadUserCampaign() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                const result = validateCampaign(data, { requireAuthFields: true });
                if (result.valid) {
                    this.userCampaign = data;
                } else {
                    console.warn('Invalid user campaign in localStorage:', result.errors);
                }
            }
        } catch (e) {
            console.error('Failed to load user campaign:', e);
        }
    }

    /**
     * List all campaigns (built-in + user + online)
     */
    listCampaigns() {
        const campaigns = [...this.builtinCampaigns];
        if (this.userCampaign) {
            campaigns.push({ ...this.userCampaign, isUserCampaign: true });
        }
        campaigns.push(...this.onlineCampaigns);
        return campaigns;
    }

    /**
     * Get campaign by id or owner
     * @param {string} idOrOwner - Campaign id or owner name
     */
    getCampaign(idOrOwner) {
        const all = this.listCampaigns();
        return all.find(c => c.id === idOrOwner || c.owner === idOrOwner) || null;
    }

    /**
     * Get level by index from a campaign
     * @param {Object} campaign
     * @param {number} index
     * @returns {Object|null} Level data (config, scenario, or map)
     */
    getLevel(campaign, index) {
        if (!campaign?.levels || index < 0 || index >= campaign.levels.length) {
            return null;
        }
        return campaign.levels[index];
    }

    /**
     * Check if current user owns this campaign
     */
    async isOwner(campaign) {
        if (campaign.isBuiltIn) return false;
        if (campaign.isUserCampaign) return true;
        const identity = await getCachedIdentity();
        return campaign.ownerId === identity.ownerId;
    }

    /**
     * Create empty user campaign (when user has none)
     */
    async createEmptyUserCampaign() {
        const identity = await getCachedIdentity();
        this.userCampaign = {
            id: identity.ownerId.slice(0, 16),
            ownerId: identity.ownerId,
            ownerIdType: identity.ownerIdType,
            owner: identity.owner,
            levels: []
        };
        this.saveUserCampaign();
        return this.userCampaign;
    }

    /**
     * Save user campaign to localStorage
     */
    saveUserCampaign() {
        if (!this.userCampaign) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.userCampaign));
        } catch (e) {
            console.error('Failed to save user campaign to localStorage:', e?.name, e?.message, e);
            if (e.name === 'QuotaExceededError') {
                throw new Error('Storage full. Try removing some levels.');
            }
        }
    }

    /**
     * Add or update level in user campaign
     * @param {number} index - Level index (-1 to append)
     * @param {Object} levelData - Level object
     */
    setUserLevel(index, levelData) {
        if (!this.userCampaign) throw new Error('No user campaign');
        const result = validateLevel(levelData);
        if (!result.valid) {
            throw new Error('Invalid level: ' + result.errors.join(', '));
        }
        if (index < 0) {
            this.userCampaign.levels.push(levelData);
        } else if (index < this.userCampaign.levels.length) {
            this.userCampaign.levels[index] = levelData;
        } else {
            // Pad with nulls if needed, then set
            while (this.userCampaign.levels.length < index) {
                this.userCampaign.levels.push(null);
            }
            this.userCampaign.levels[index] = levelData;
        }
        this.saveUserCampaign();
    }

    /**
     * Remove level from user campaign
     */
    removeUserLevel(index) {
        if (!this.userCampaign) return false;
        if (index < 0 || index >= this.userCampaign.levels.length) return false;
        this.userCampaign.levels.splice(index, 1);
        this.saveUserCampaign();
        return true;
    }

    /**
     * Move level in user campaign
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    moveUserLevel(fromIndex, toIndex) {
        if (!this.userCampaign) return false;
        if (fromIndex < 0 || fromIndex >= this.userCampaign.levels.length) return false;
        if (toIndex < 0 || toIndex >= this.userCampaign.levels.length) return false;
        if (fromIndex === toIndex) return true;

        const [level] = this.userCampaign.levels.splice(fromIndex, 1);
        this.userCampaign.levels.splice(toIndex, 0, level);
        this.saveUserCampaign();
        return true;
    }

    /**
     * Ensure user has a campaign (create if empty)
     */
    async ensureUserCampaign() {
        if (!this.userCampaign) {
            await this.createEmptyUserCampaign();
        }
        return this.userCampaign;
    }

    /**
     * Set campaigns fetched from backend
     */
    setOnlineCampaigns(campaigns) {
        this.onlineCampaigns = campaigns;
    }

    /**
     * Portable campaign JSON (same shape as src/scenarios/builtin-*.json): id, owner, levels only.
     * Omits ownerId / ownerIdType. Levels are deep-cloned with name/description stripped.
     */
    getExportPayload() {
        if (!this.userCampaign) {
            return { id: 'my-campaign', owner: 'Your Campaign', levels: [] };
        }
        const levels = this.userCampaign.levels
            .filter(l => l != null)
            .map(l => JSON.parse(JSON.stringify(sanitizeLevel(l))));
        return {
            id: this.userCampaign.id,
            owner: this.userCampaign.owner,
            levels
        };
    }

    /**
     * Replace user campaign levels (and optional id/owner) from builtin-style JSON.
     * Preserves ownerId / ownerIdType. Ensures a user campaign exists.
     * @returns {Promise<{ok: true, levelCount: number}|{ok: false, errors: string[]}>}
     */
    async importFromPortableJson(portable) {
        const result = validateCampaign(portable, { requireAuthFields: false });
        if (!result.valid) {
            return { ok: false, errors: result.errors };
        }
        await this.ensureUserCampaign();
        const levels = portable.levels.map(l => JSON.parse(JSON.stringify(sanitizeLevel(l))));
        this.userCampaign.levels = levels;
        if (typeof portable.id === 'string' && portable.id.trim()) {
            this.userCampaign.id = portable.id.trim().slice(0, 128);
        }
        if (typeof portable.owner === 'string' && portable.owner.trim()) {
            this.userCampaign.owner = portable.owner.trim().slice(0, 128);
        }
        this.saveUserCampaign();
        return { ok: true, levelCount: levels.length };
    }

    /**
     * Copy id, owner, and levels from a built-in or online campaign into the user campaign.
     * @param {Object} source - Campaign object with levels (e.g. from builtinCampaigns / onlineCampaigns)
     */
    async importFromExistingCampaign(source) {
        if (!source?.levels || !Array.isArray(source.levels)) {
            return { ok: false, errors: ['Campaign has no levels'] };
        }
        const levels = source.levels
            .filter(l => l != null)
            .map(l => JSON.parse(JSON.stringify(sanitizeLevel(l))));
        const portable = { levels };
        if (typeof source.id === 'string' && source.id.trim()) {
            portable.id = source.id.trim().slice(0, 128);
        }
        if (typeof source.owner === 'string' && source.owner.trim()) {
            portable.owner = source.owner.trim().slice(0, 128);
        }
        return this.importFromPortableJson(portable);
    }

    /**
     * Get grid dimensions for level count
     */
    static getGridDimensions(levelCount) {
        return getGridDimensions(levelCount);
    }
}
