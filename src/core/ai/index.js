/**
 * AI Module - Factory and exports for all AI implementations
 * 
 * To add a new AI:
 * 1. Create a new file (e.g., aggressive-ai.js) extending BaseAI
 * 2. Import and export it here
 * 3. Add a case to the createAI factory function
 * 4. Add the option to the HTML dropdown in index.html
 */
import { BaseAI } from './base-ai.js';
import { EasyAI } from './easy-ai.js';
import { MediumAI } from './medium-ai.js';
import { HardAI } from './hard-ai.js';
import { AutoplayAI } from './autoplay-ai.js';

/**
 * Factory function to create an AI instance by difficulty name
 * @param {string} difficulty - 'easy', 'medium', 'hard', or 'autoplay'
 * @param {Game} game - The game instance
 * @param {number} playerId - The player ID this AI controls
 * @returns {BaseAI} An AI instance
 */
export function createAI(difficulty, game, playerId) {
    switch (difficulty) {
        case 'medium':
            return new MediumAI(game, playerId);
        case 'hard':
            return new HardAI(game, playerId);
        case 'autoplay':
            return new AutoplayAI(game, playerId);
        case 'easy':
        default:
            return new EasyAI(game, playerId);
    }
}

export { BaseAI, EasyAI, MediumAI, HardAI, AutoplayAI };
