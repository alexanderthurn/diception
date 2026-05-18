/**
 * AchievementsPanel — populates the #achievements-modal with live achievement data.
 * The modal shell (header, close button) lives in index.html and uses the same
 * CSS classes as all other modals (howto, about, etc.).
 */

import { ACHIEVEMENTS } from '../core/achievements.js';
import { unlockAchievement, removeAchievement } from '../core/achievement-manager.js';
import { registerCheatContext } from '../cheat.js';

const DIFFS = ['easy', 'medium', 'hard'];
const SIZES = [
    { key: 'small',  label: 'Small',    hint: '≤4'  },
    { key: 'medium', label: 'Mid',      hint: '5–7' },
    { key: 'big',    label: 'Big',      hint: '8+'  },
];

const UNLOCKED_KEY = 'ach_unlocked';

export const TITLES = {
    ACH_TUTORIAL:      'First Steps',
    ACH_CHAPTER1:      'Chapter 1 Complete',
    ACH_CHAPTER2:      'Chapter 2 Complete',
    ACH_CHAPTER3:      'Chapter 3 Complete',
    ACH_CHAPTER4:      'Chapter 4 Complete',
    ACH_GAMES_10:      'Warming Up',
    ACH_GAMES_50:      'Getting Serious',
    ACH_GAMES_100:     'Centurion',
    ACH_GAMES_150:     'Dedicated',
    ACH_GAMES_200:     'Veteran',
    ACH_GAMES_300:     'Battle-Hardened',
    ACH_GAMES_400:     'Tactician',
    ACH_GAMES_500:     'Commander',
    ACH_GAMES_1000:    'Warlord',
    ACH_GAMES_10000:   'Legend',
    ACH_FIRST_WIN:     'Victor',
    ACH_UNDERDOG_5:    'Lucky Shot',
    ACH_UNDERDOG_10:   'Against the Odds',
    ACH_UNDERDOG_50:   'Unlikely Hero',
    ACH_UNDERDOG_100:  'Miracle Worker',
    ACH_UNDERDOG_500:  "Fortune's Favorite",
    ACH_DAVID:         'David vs. Goliath',
    ACH_PURE_BOTS:     'Bot Tournament',
    ACH_PURE_HUMANS:   'Human Only',
    ACH_STREAK_3:          'On a Roll',
    ACH_STREAK_3_3000:     'Chain Master',
    ACH_STREAK_4:          'Hot Streak',
    ACH_STREAK_4_1500:     'Unbroken Line',
    ACH_STREAK_5:          'Unstoppable',
    ACH_STREAK_5_500:      'Chain Tyrant',
    ACH_STREAK_6:          'Relentless',
    ACH_STREAK_6_200:      'Perfect Storm',
    ACH_STREAK_7:          'Dominator',
    ACH_STREAK_7_100:      'Chain Legend',
    ACH_SURVIVOR:          'Last Standing',
};

const SECTIONS = [
    {
        label: 'Campaign',
        filter: a => a.type === 'campaign',
    },
    {
        label: 'Games Played',
        filter: a => a.type === 'stat' && a.stat === 'gamesPlayed',
    },
    {
        label: 'Special Combat',
        filter: a => a.type === 'event' || (a.type === 'stat' && a.stat !== 'gamesPlayed'),
    },
];

function getDescription(ach) {
    if (ach.type === 'campaign') {
        const name = ach.campaign.charAt(0).toUpperCase() + ach.campaign.slice(1);
        return `Complete the ${name} chapter`;
    }
    if (ach.type === 'stat') {
        if (ach.stat === 'gamesPlayed')  return `Play ${ach.threshold.toLocaleString()} games`;
        if (ach.stat === 'gamesWon')     return `Win ${ach.threshold.toLocaleString()} games`;
        if (ach.stat === 'underdogWins') return `Win ${ach.threshold.toLocaleString()} attacks with less than 33% odds`;
        if (ach.stat?.startsWith('streak')) {
            const n = ach.stat.replace('streak', '');
            return `Chain ${n}+ attacks from the same tile — ${ach.threshold.toLocaleString()} times (lifetime)`;
        }
    }
    if (ach.type === 'event') {
        if (ach.event === 'won4vs6')        return 'Win an attack with 4 dice against 6 dice';
        if (ach.event === 'won8PlayerGame') return 'Win a game against 7 opponents';
        if (ach.event === 'pureBots')       return 'Let a bots-only game run to completion';
        if (ach.event === 'pureHumans')     return 'Play a game with 2+ humans and no bots';
    }
    return '';
}

function loadUnlocked() { try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY)) || []; } catch { return []; } }

export class AchievementsPanel {
    constructor(modalEl, highscoreManager) {
        this._modal = modalEl;
        this._highscoreManager = highscoreManager;
        this._subtitle    = modalEl?.querySelector('#ach-subtitle');
        this._grid        = modalEl?.querySelector('#ach-grid');
        this._bucketStats = modalEl?.querySelector('#ach-bucket-stats');
        this._hoveredId = null;

        if (window.location.hostname === 'localhost' && this._highscoreManager) {
            registerCheatContext({
                isActive: () => !this._modal?.classList.contains('hidden'),
                onCCC: () => {
                    if (!this._hoveredId) return;
                    const ach = ACHIEVEMENTS.find(a => a.id === this._hoveredId);
                    if (ach?.type === 'stat') {
                        const stats = this._highscoreManager.getLifetimeStats();
                        const delta = Math.ceil(ach.threshold * 0.5);
                        const next  = (stats[ach.stat] || 0) + delta;
                        this._highscoreManager.setLifetimeStat(ach.stat, next);
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
                        const stats = this._highscoreManager.getLifetimeStats();
                        const delta = Math.ceil(ach.threshold * 0.5);
                        const next  = Math.max(0, (stats[ach.stat] || 0) - delta);
                        this._highscoreManager.setLifetimeStat(ach.stat, next);
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
        const stats    = this._highscoreManager ? this._highscoreManager.getLifetimeStats() : {};
        const unlocked = loadUnlocked();

        if (this._subtitle) {
            this._subtitle.textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
        }

        // Also refresh the stat cells in the modal header table
        const played = stats.gamesPlayed || 0;
        const won    = stats.gamesWon    || 0;
        const pct    = played > 0 ? Math.round((won / played) * 100) : 0;
        const statPlayed   = this._modal?.querySelector('#ach-stat-played');
        const statWon      = this._modal?.querySelector('#ach-stat-won');
        const statWinrate  = this._modal?.querySelector('#ach-stat-winrate');
        if (statPlayed)  statPlayed.textContent  = played.toLocaleString();
        if (statWon)     statWon.textContent      = won.toLocaleString();
        if (statWinrate) statWinrate.textContent  = played > 0 ? `${pct}%` : '—';

        if (this._bucketStats && this._highscoreManager) {
            const b = this._highscoreManager.getSoloHumanStatsBlob().buckets;
            const winPct = (p, w) => p > 0 ? `${Math.round(w / p * 100)}%` : '—';
            const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

            const boxes = DIFFS.map(diff => {
                const diffRow = b[`d:${diff}`] ?? [0, 0, null, null];
                const rows = [['All sizes', diffRow]];
                for (const { key, label, hint } of SIZES) {
                    const r = b[`d:${diff}|s:${key}`] ?? [0, 0, null, null];
                    rows.push([`+ ${label} (${hint})`, r]);
                }
                return { diff, rows };
            });

            this._bucketStats.innerHTML = boxes.map(({ diff, rows }) => `
                <div class="ach-diff-box">
                    <div class="ach-diff-box-title">${cap(diff)}</div>
                    <table class="solo-stats-table">
                        <thead><tr><th></th><th>Games</th><th>Wins</th><th>Win%</th></tr></thead>
                        <tbody>${rows.map(([label, r]) => `
                            <tr><td class="sst-label">${label}</td><td>${r[0]}</td><td>${r[1]}</td><td>${winPct(r[0], r[1])}</td></tr>
                        `).join('')}</tbody>
                    </table>
                </div>
            `).join('');
        }

        this._grid.innerHTML = '';

        SECTIONS.forEach(section => {
            const group = ACHIEVEMENTS.filter(section.filter);
            if (!group.length) return;

            const heading = document.createElement('div');
            heading.className = 'ach-section-header';
            heading.textContent = section.label;
            this._grid.appendChild(heading);

            group.forEach(ach => {
                const isUnlocked = unlocked.includes(ach.id);
                const iconClass = isUnlocked
                    ? ach.id.replace(/_/g, '-')
                    : ach.id.replace(/_/g, '-') + '-locked';
                const title = TITLES[ach.id] || ach.id.replace('ACH_', '').replace(/_/g, ' ');

                let progressHTML = '';
                if (ach.type === 'stat' && !isUnlocked) {
                    const current = Math.min(stats[ach.stat] || 0, ach.threshold);
                    const pct = Math.round((current / ach.threshold) * 100);
                    progressHTML = `
                        <div class="ach-progress">
                            <div class="ach-progress-bar">
                                <div class="ach-progress-fill" style="width:${pct}%"></div>
                            </div>
                            <div class="ach-progress-label">
                                ${(stats[ach.stat]||0).toLocaleString()} / ${ach.threshold.toLocaleString()}
                            </div>
                        </div>`;
                }

                const isPreviousTierUnlocked = ach.type !== 'stat' || ACHIEVEMENTS
                    .filter(a => a.stat === ach.stat && a.threshold < ach.threshold)
                    .every(a => unlocked.includes(a.id));
                const isInProgress = !isUnlocked && ach.type === 'stat' && (stats[ach.stat] || 0) > 0 && isPreviousTierUnlocked;
                const card = document.createElement('div');
                card.className = 'ach-card' + (isUnlocked ? ' unlocked' : isInProgress ? ' in-progress' : '');
                card.tabIndex = 0;
                card.innerHTML = `
                    <span class="sprite-icon ach-icon ${iconClass}"></span>
                    <div class="ach-card-body">
                        <div class="ach-card-title">${title}</div>
                        <div class="ach-card-desc">${getDescription(ach)}</div>
                        ${progressHTML}
                    </div>
                `;
                card.addEventListener('mouseenter', () => { this._hoveredId = ach.id; });
                card.addEventListener('mouseleave', () => { this._hoveredId = null; });
                this._grid.appendChild(card);
            });
        });
    }
}
