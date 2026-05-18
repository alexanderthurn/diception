/**
 * Achievement definitions — single source of truth.
 * type 'stat'  : unlocks when stat >= threshold (cumulative, persisted)
 * type 'event' : unlocks on a one-off moment
 * type 'campaign' : unlocks when all levels of a chapter are solved
 */

/** Steam INT stat ceiling — lifetime counters clamp to this in-game and on sync. */
export const LIFETIME_STAT_MAX = 10000;

/** Lifetime chain-length tiers per peak chain (3–7). First id keeps legacy ACH_STREAK_N. */
function streakStatAchievements(chainLen, thresholds) {
    return thresholds.map((threshold, i) => ({
        id: i === 0 ? `ACH_STREAK_${chainLen}` : `ACH_STREAK_${chainLen}_${threshold}`,
        type: 'stat',
        stat: `streak${chainLen}`,
        threshold,
    }));
}

/** Base tier + one 100× master tier per chain length. */
const STREAK_ACHIEVEMENTS = [
    ...streakStatAchievements(3, [30, 3000]),
    ...streakStatAchievements(4, [15, 1500]),
    ...streakStatAchievements(5, [5, 500]),
    ...streakStatAchievements(6, [2, 200]),
    ...streakStatAchievements(7, [1, 100]),
];

export const ACHIEVEMENTS = [
    // ── Campaign ──────────────────────────────────────────────────────────────
    { id: 'ACH_TUTORIAL',      type: 'campaign', campaign: 'tutorial'  },
    { id: 'ACH_CHAPTER1',      type: 'campaign', campaign: 'chapter1'  },
    { id: 'ACH_CHAPTER2',      type: 'campaign', campaign: 'chapter2'  },
    { id: 'ACH_CHAPTER3',      type: 'campaign', campaign: 'chapter3'  },
    { id: 'ACH_CHAPTER4',      type: 'campaign', campaign: 'chapter4'  },

    // ── Games Played ──────────────────────────────────────────────────────────
    { id: 'ACH_GAMES_10',      type: 'stat', stat: 'gamesPlayed', threshold: 10    },
    { id: 'ACH_GAMES_50',      type: 'stat', stat: 'gamesPlayed', threshold: 50    },
    { id: 'ACH_GAMES_100',     type: 'stat', stat: 'gamesPlayed', threshold: 100   },
    { id: 'ACH_GAMES_150',     type: 'stat', stat: 'gamesPlayed', threshold: 150   },
    { id: 'ACH_GAMES_200',     type: 'stat', stat: 'gamesPlayed', threshold: 200   },
    { id: 'ACH_GAMES_300',     type: 'stat', stat: 'gamesPlayed', threshold: 300   },
    { id: 'ACH_GAMES_400',     type: 'stat', stat: 'gamesPlayed', threshold: 400   },
    { id: 'ACH_GAMES_500',     type: 'stat', stat: 'gamesPlayed', threshold: 500   },
    { id: 'ACH_GAMES_1000',    type: 'stat', stat: 'gamesPlayed', threshold: 1000  },
    { id: 'ACH_GAMES_10000',   type: 'stat', stat: 'gamesPlayed', threshold: 10000 },

    // ── Special Combat ────────────────────────────────────────────────────────
    { id: 'ACH_FIRST_WIN',     type: 'stat', stat: 'gamesWon',     threshold: 100 },
    { id: 'ACH_UNDERDOG_5',     type: 'stat', stat: 'underdogWins', threshold: 5     },
    { id: 'ACH_UNDERDOG_10',    type: 'stat', stat: 'underdogWins', threshold: 10    },
    { id: 'ACH_UNDERDOG_50',    type: 'stat', stat: 'underdogWins', threshold: 50    },
    { id: 'ACH_UNDERDOG_100',   type: 'stat', stat: 'underdogWins', threshold: 100   },
    { id: 'ACH_UNDERDOG_500',   type: 'stat', stat: 'underdogWins', threshold: 500   },
    { id: 'ACH_DAVID',         type: 'event', event: 'won4vs6'                    },
    { id: 'ACH_PURE_BOTS',    type: 'event', event: 'pureBots'                   },
    { id: 'ACH_PURE_HUMANS',  type: 'event', event: 'pureHumans'                 },
    ...STREAK_ACHIEVEMENTS,
    { id: 'ACH_SURVIVOR',      type: 'event', event: 'won8PlayerGame'             },
];
