/**
 * AchievementsPanel — populates the #achievements-modal with live achievement data.
 * The modal shell (header, close button) lives in index.html and uses the same
 * CSS classes as all other modals (howto, about, etc.).
 */

import { ACHIEVEMENTS } from '../core/achievements.js';
import { unlockAchievement, removeAchievement, setStatValue } from '../core/achievement-manager.js';
import { registerCheatContext } from '../cheat.js';

const STATS_KEY    = 'dicy_ach_stats';
const UNLOCKED_KEY = 'dicy_ach_unlocked';

function getDescription(ach) {
    if (ach.type === 'campaign') {
        return `Complete the ${ach.campaign.charAt(0).toUpperCase() + ach.campaign.slice(1)} chapter`;
    }
    if (ach.type === 'stat') {
        if (ach.stat === 'gamesPlayed')  return `Play ${ach.threshold.toLocaleString()} games`;
        if (ach.stat === 'gamesWon')     return 'Win your first game';
        if (ach.stat === 'underdogWins') return `Win ${ach.threshold.toLocaleString()} attacks with less than 33% odds`;
    }
    if (ach.type === 'event') {
        if (ach.event === 'won4vs6')        return 'Win an attack with 4 dice against 6 dice';
        if (ach.event === 'attackStreak3')  return 'Win 3 consecutive attacks in one turn';
        if (ach.event === 'attackStreak4')  return 'Win 4 consecutive attacks in one turn';
        if (ach.event === 'attackStreak5')  return 'Win 5 consecutive attacks in one turn';
        if (ach.event === 'attackStreak6')  return 'Win 6 consecutive attacks in one turn';
        if (ach.event === 'attackStreak7')  return 'Win 7 consecutive attacks in one turn';
        if (ach.event === 'won8PlayerGame') return 'Win a game against 7 opponents';
        if (ach.event === 'pureBots')       return 'Let a bots-only game run to completion';
        if (ach.event === 'pureHumans')     return 'Play a game with 2+ humans and no bots';
    }
    return '';
}

function loadStats()    { try { return JSON.parse(localStorage.getItem(STATS_KEY))    || {}; } catch { return {}; } }
function loadUnlocked() { try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY)) || []; } catch { return []; } }

export class AchievementsPanel {
    constructor(modalEl) {
        this._modal    = modalEl;
        this._subtitle = modalEl?.querySelector('#ach-subtitle');
        this._grid     = modalEl?.querySelector('#ach-grid');
        this._hoveredId = null;

        if (window.location.hostname === 'localhost') {
            registerCheatContext({
                isActive: () => !this._modal?.classList.contains('hidden'),
                onCCC: () => {
                    if (!this._hoveredId) return;
                    const ach = ACHIEVEMENTS.find(a => a.id === this._hoveredId);
                    if (ach?.type === 'stat') {
                        const stats = loadStats();
                        const delta = Math.ceil(ach.threshold * 0.5);
                        const next  = (stats[ach.stat] || 0) + delta;
                        setStatValue(ach.stat, next);
                        console.log(`🎮 CHEAT: ${ach.stat} +${delta} → ${next}`);
                    } else {
                        unlockAchievement(this._hoveredId);
                        console.log(`🎮 CHEAT: unlocked ${this._hoveredId}`);
                    }
                    this._refresh();
                },
                onVVV: () => {
                    if (!this._hoveredId) return;
                    const ach = ACHIEVEMENTS.find(a => a.id === this._hoveredId);
                    if (ach?.type === 'stat') {
                        const stats = loadStats();
                        const delta = Math.ceil(ach.threshold * 0.5);
                        const next  = Math.max(0, (stats[ach.stat] || 0) - delta);
                        setStatValue(ach.stat, next);
                        console.log(`🎮 CHEAT: ${ach.stat} -${delta} → ${next}`);
                    } else {
                        removeAchievement(this._hoveredId);
                        console.log(`🎮 CHEAT: removed ${this._hoveredId}`);
                    }
                    this._refresh();
                },
            });
        }
    }

    open() {
        this._refresh();
        this._modal?.classList.remove('hidden');
    }

    close() {
        this._modal?.classList.add('hidden');
    }

    _refresh() {
        if (!this._grid) return;
        const stats    = loadStats();
        const unlocked = loadUnlocked();

        if (this._subtitle) {
            this._subtitle.textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
        }

        this._grid.innerHTML = '';

        ACHIEVEMENTS.forEach(ach => {
            const isUnlocked = unlocked.includes(ach.id);

            // Progress bar for stat achievements
            let progressHTML = '';
            if (ach.type === 'stat' && !isUnlocked) {
                const current = Math.min(stats[ach.stat] || 0, ach.threshold);
                const pct = Math.round((current / ach.threshold) * 100);
                progressHTML = `
                    <div style="margin-top:8px;">
                        <div style="background:#1a1a1a;height:4px;border-radius:2px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:var(--border-color);transition:width 0.3s;"></div>
                        </div>
                        <div style="color:#666;font-size:11px;margin-top:3px;font-family:Rajdhani,sans-serif;letter-spacing:1px;">
                            ${(stats[ach.stat]||0).toLocaleString()} / ${ach.threshold.toLocaleString()}
                        </div>
                    </div>`;
            }

            // Class matches spritesheet: ACH_TUTORIAL.png → ACH-TUTORIAL (or ACH-TUTORIAL-locked)
            const iconClass = isUnlocked
                ? ach.id.replace(/_/g, '-')
                : ach.id.replace(/_/g, '-') + '-locked';

            const card = document.createElement('div');
            card.style.cssText = `
                display:flex; gap:12px; align-items:flex-start;
                padding:12px;
                background:rgba(255,255,255,0.02);
                border:1px solid ${isUnlocked ? 'var(--border-color)' : '#222'};
            `;
            card.innerHTML = `
                <span class="sprite-icon ${iconClass}" style="
                    width:64px; height:64px; flex-shrink:0; display:block;
                    image-rendering:pixelated;
                "></span>
                <div style="flex:1; min-width:0;">
                    <div style="
                        font-family:Rajdhani,sans-serif; font-weight:700; font-size:14px;
                        color:#fff;
                        letter-spacing:1px; text-transform:uppercase; margin-bottom:3px;
                    ">${ach.id.replace('ACH_','').replace(/_/g,' ')}</div>
                    <div style="
                        font-family:Rajdhani,sans-serif; font-size:13px;
                        color:#ccc; line-height:1.4;
                    ">${getDescription(ach)}</div>
                    ${progressHTML}
                </div>
            `;
            card.addEventListener('mouseenter', () => { this._hoveredId = ach.id; });
            card.addEventListener('mouseleave', () => { this._hoveredId = null; });
            this._grid.appendChild(card);
        });
    }
}
