/**
 * AchievementsPanel — populates the #achievements-modal with live achievement data.
 * The modal shell (header, close button) lives in index.html and uses the same
 * CSS classes as all other modals (howto, about, etc.).
 */

import { ACHIEVEMENTS } from '../core/achievements.js';
import { unlockAchievement, removeAchievement } from '../core/achievement-manager.js';
import { registerCheatContext } from '../cheat.js';
import { t } from '../core/i18n.js';

const DIFFS = ['easy', 'medium', 'hard'];
const SIZES = [
    { key: 'small',  labelKey: 'ach.size.small',    hint: '≤4'  },
    { key: 'medium', labelKey: 'ach.size.mid',      hint: '5–7' },
    { key: 'big',    labelKey: 'ach.size.big',      hint: '8+'  },
];

const UNLOCKED_KEY = 'ach_unlocked';

/** Achievement titles resolve through i18n; the panel and the progress toast both use this. */
export function achievementTitle(id) {
    return t(`ach.${id}.title`);
}

const SECTIONS = [
    {
        labelKey: 'ach.section.campaign',
        filter: a => a.type === 'campaign',
    },
    {
        labelKey: 'ach.section.games_played',
        filter: a => a.type === 'stat' && a.stat === 'gamesPlayed',
    },
    {
        labelKey: 'ach.section.special_combat',
        filter: a => a.type === 'event' || (a.type === 'stat' && a.stat !== 'gamesPlayed'),
    },
];

function getDescription(ach) {
    if (ach.type === 'campaign') {
        const name = ach.campaign.charAt(0).toUpperCase() + ach.campaign.slice(1);
        return t('ach.desc.campaign', { name });
    }
    if (ach.type === 'stat') {
        const count = ach.threshold.toLocaleString();
        if (ach.stat === 'gamesPlayed')  return t('ach.desc.games_played', { count });
        if (ach.stat === 'gamesWon')     return t('ach.desc.games_won', { count });
        if (ach.stat === 'underdogWins') return t('ach.desc.underdog', { count });
        if (ach.stat?.startsWith('streak')) {
            return t('ach.desc.streak', { n: ach.stat.replace('streak', ''), count });
        }
    }
    if (ach.type === 'event') {
        if (ach.event === 'won4vs6')        return t('ach.desc.won4vs6');
        if (ach.event === 'won8PlayerGame') return t('ach.desc.won8player');
        if (ach.event === 'pureBots')       return t('ach.desc.pure_bots');
        if (ach.event === 'pureHumans')     return t('ach.desc.pure_humans');
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
            heading.textContent = t(section.labelKey);
            this._grid.appendChild(heading);

            group.forEach(ach => {
                const isUnlocked = unlocked.includes(ach.id);
                const iconClass = isUnlocked
                    ? ach.id.replace(/_/g, '-')
                    : ach.id.replace(/_/g, '-') + '-locked';
                const title = achievementTitle(ach.id);

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
