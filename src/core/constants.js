/**
 * Game Constants
 * Centralized configuration values extracted from magic numbers throughout the codebase
 */

// === GAME DEFAULTS ===
export const GAME = {
    MAX_TURNS: 999,
    DEFAULT_MAX_DICE: 9,
    DEFAULT_DICE_SIDES: 6,
    MAX_DICE_SIDES: 16,          // Maximum dice sides for probability tables (1-16)
    MAX_DICE_PER_TERRITORY: 16,  // Maximum dice per territory for probability tables (1-16)
    MIN_PLAYERS: 2,
    MIN_TILES_PER_PLAYER: 4,
    INITIAL_DICE_MULTIPLIER: 2.5, // Average dice per tile at start
    HUMAN_COLORS: [
        0xAA00FF, // Purple (Human 1)
        0x0088FF, // Azure Blue (Human 2)
        0xFFCC00, // Gold/Dark Yellow (Human 3)
        0x00AA44  // Dark Green (Human 4)
    ],
    BOT_COLORS: [
        0xFF0055, // Red/Pink
        0x55FF00, // Lime
        0xFF00AA, // Pink (Bot 3)
        0xFF8800, // Orange
        0x00AAFF, // Light Blue (Bot 5)
        0xFFFF00, // Bright Yellow (Bot 6)
        0xFFFFFF  // White (Bot 7)
    ],
};

// === MAP GENERATION ===
export const MAP_GENERATION = {
    // Cellular automata (caves)
    CAVES_INITIAL_BLOCK_CHANCE: 0.45,
    CAVES_ITERATIONS: 5,
    CAVES_BLOCK_THRESHOLD: 5,  // Become blocked if >= this many neighbors blocked
    CAVES_UNBLOCK_THRESHOLD: 3, // Become unblocked if <= this many neighbors blocked

    // Swiss cheese
    SWISS_MIN_HOLE_PERCENTAGE: 0.3,
    SWISS_MAX_HOLE_PERCENTAGE: 0.4,
    SWISS_MAX_ATTEMPTS_MULTIPLIER: 20,

    // Tunnels
    TUNNELS_MIN_PATHS: 3,
    TUNNELS_MAX_ADDITIONAL_PATHS: 3,
    TUNNELS_PATH_LENGTH_FACTOR: 0.4,
    TUNNELS_DIRECTION_CHANGE_CHANCE: 0.3,
    TUNNELS_WIDEN_CHANCE: 0.2,

    // Continents
    CONTINENTS_MIN_DISTANCE_FACTOR: 0.4,
    CONTINENTS_MAX_RADIUS_FACTOR: 0.6,
    CONTINENTS_NOISE_FACTOR: 0.6,
    CONTINENTS_MAX_PLACEMENT_ATTEMPTS: 50,

    // Islands
    ISLANDS_MAIN_RADIUS_FACTOR: 1 / 3,
    ISLANDS_LAKE_RADIUS_FACTOR: 1 / 3,
    ISLANDS_MIN_SMALL_ISLANDS: 3,
    ISLANDS_MAX_ADDITIONAL_ISLANDS: 4,
    ISLANDS_SMALL_MIN_RADIUS: 2,
    ISLANDS_SMALL_MAX_ADDITIONAL_RADIUS: 2,

    // Maze
    MAZE_WIDEN_CHANCE: 0.3,

    // Simple fallback
    SIMPLE_HOLE_PERCENTAGE: 0.2,
    SIMPLE_MAX_ATTEMPTS_MULTIPLIER: 10,

    // Circle carving noise
    CIRCLE_NOISE_FACTOR: 0.3,
};

// === RENDERING ===
export const RENDER = {
    DEFAULT_TILE_SIZE: 60,
    DEFAULT_GAP: 0,

    // Shimmer animation
    SHIMMER_CYCLE_DURATION: 2.5, // seconds (slower, more elegant)
    SHIMMER_TRAIL_SEGMENTS: 1,   // Fewer segments = less clutter
    SHIMMER_SEGMENT_OFFSET: 0.12, // More spacing between segments

    // Attack animation
    ATTACK_FLASH_DURATION: 20, // frames
    ATTACK_FLASH_ALPHA: 0.8,

    // Reinforcement animation
    REINFORCE_FLASH_DURATION: 12, // frames
};

// === INPUT ===
export const INPUT = {
    // Keyboard
    KEYBOARD_REPEAT_DELAY: 250, // ms before repeat starts
    KEYBOARD_REPEAT_RATE: 120, // ms between repeats
    KEYBOARD_REPEAT_DELAY_STEAM: 300,
    KEYBOARD_REPEAT_RATE_STEAM: 160,

    // Gamepad
    GAMEPAD_DEAD_ZONE: 0.4,
    GAMEPAD_CURSOR_DEAD_ZONE: 0.15,
    GAMEPAD_CURSOR_SPEED: 20,
    GAMEPAD_CURSOR_SPEED_STEAM: 12,
    GAMEPAD_SCROLL_SPEED: 15,
    GAMEPAD_SPEED_BOOST_L1: 2.0,
    GAMEPAD_SPEED_BOOST_R1: 5.0,
};

// === AUDIO ===
export const AUDIO = {
    DEFAULT_VOLUME: 0.5,
    TONE_VOLUME_SCALE: 0.2, // Volume multiplier for generated tones

    // Frequencies (Hz)
    FREQ_TURN_START: [440, 550],
    FREQ_ATTACK: 220,
    FREQ_ATTACK_WIN_BASE: 440,
    FREQ_ATTACK_LOSE: [300, 200],
    FREQ_REINFORCE: [330, 392, 523],
    FREQ_ELIMINATED: [200, 150, 100],

    // Durations (seconds)
    TONE_DURATION_SHORT: 0.1,
    TONE_DURATION_MEDIUM: 0.15,
    TONE_DURATION_LONG: 0.2,
};

// === AI ===
export const AI = {
    DEFAULT_TIMEOUT: 5000, // ms
    DEFAULT_MAX_MOVES: 200,
    MAX_SIMULATION_TURNS: 1000,
};

// === GAME SPEEDS ===
export const GAME_SPEEDS = {
    BEGINNER: {
        BOT_DELAY: 800,
        HUMAN_DELAY: 1000,
        ATTACK_DELAY: 1200,
    },
    NORMAL: {
        BOT_DELAY: 300,
        HUMAN_DELAY: 500,
        ATTACK_DELAY: 200,
    },
    EXPERT: {
        DELAY: 10,
    },
};

// === UI ===
export const UI = {
    MOBILE_BREAKPOINT_WIDTH: 768,
    MOBILE_BREAKPOINT_HEIGHT: 720,
    SLIDER_AUTO_HIDE_DELAY: 3000, // ms
    DICE_HUD_HIDE_DELAY: 1500, // ms
    REINFORCE_HUD_HIDE_DELAY_HUMAN: 3000, // ms
    REINFORCE_HUD_HIDE_DELAY_BOT: 2000, // ms
    MAX_LOG_ENTRIES_PER_PLAYER: 3, // rounds
};
