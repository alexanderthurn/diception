/**
 * Legacy map.js - Re-exports from modular map/ directory
 * This file is kept for backward compatibility.
 * 
 * All functionality has been refactored to:
 * - ./map/index.js (MapManager class)
 * - ./map/map-generators.js (generation algorithms)
 * - ./map/map-queries.js (query utilities)
 */
export { MapManager, generators, queries } from './map/index.js';
