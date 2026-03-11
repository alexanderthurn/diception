/**
 * Achievement definitions — single source of truth.
 * type 'stat'  : unlocks when stat >= threshold (cumulative, persisted)
 * type 'event' : unlocks on a one-off moment
 * type 'campaign' : unlocks when all levels of a chapter are solved
 */
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
    { id: 'ACH_FIRST_WIN',     type: 'stat', stat: 'gamesWon',     threshold: 1   },
    { id: 'ACH_UNDERDOG_5',     type: 'stat', stat: 'underdogWins', threshold: 5     },
    { id: 'ACH_UNDERDOG_10',    type: 'stat', stat: 'underdogWins', threshold: 10    },
    { id: 'ACH_UNDERDOG_50',    type: 'stat', stat: 'underdogWins', threshold: 50    },
    { id: 'ACH_UNDERDOG_100',   type: 'stat', stat: 'underdogWins', threshold: 100   },
    { id: 'ACH_UNDERDOG_500',   type: 'stat', stat: 'underdogWins', threshold: 500   },
    { id: 'ACH_UNDERDOG_1000',  type: 'stat', stat: 'underdogWins', threshold: 1000  },
    { id: 'ACH_UNDERDOG_10000', type: 'stat', stat: 'underdogWins', threshold: 10000 },
    { id: 'ACH_DAVID',         type: 'event', event: 'won4vs6'                    },
    { id: 'ACH_STREAK_3',      type: 'event', event: 'attackStreak3'              },
    { id: 'ACH_STREAK_4',      type: 'event', event: 'attackStreak4'              },
    { id: 'ACH_STREAK_5',      type: 'event', event: 'attackStreak5'              },
    { id: 'ACH_STREAK_6',      type: 'event', event: 'attackStreak6'              },
    { id: 'ACH_STREAK_7',      type: 'event', event: 'attackStreak7'              },
    { id: 'ACH_SURVIVOR',      type: 'event', event: 'won8PlayerGame'             },
];
