/**
 * Campaign Manager - Load/save campaigns (built-in + user)
 * One campaign per user. Built-ins are read-only.
 */

import { validateCampaign, validateLevel, getGridDimensions } from './campaign-data.js';
import { getCachedIdentity } from './user-identity.js';
import builtinCampaign from './builtin-campaign.json';
import builtinMaps from './builtin-maps.json';
import builtinScenarios from './builtin-scenarios.json';

const STORAGE_KEY = 'dicy_userCampaign';

export class CampaignManager {
    constructor() {
        this.builtinCampaigns = [
            { ...builtinCampaign, isBuiltIn: true },
            { ...builtinMaps, isBuiltIn: true },
            { ...builtinScenarios, isBuiltIn: true }
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
            console.error('Failed to save user campaign:', e);
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
     * Get grid dimensions for level count
     */
    static getGridDimensions(levelCount) {
        return getGridDimensions(levelCount);
    }
}
