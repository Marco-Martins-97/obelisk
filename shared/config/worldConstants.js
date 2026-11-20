/**
 * Core world and time constants shared across /client and /server.
 *
 * NOTE: Continent and territory sizes should be treated as immutable
 * once a world is generated so coordinates and tileSeeds stay consistent.
 */

/** Default width and height of the Continent grid (100x100 = 10,000 world tiles). */
export const DEFAULT_CONTINENT_SIZE = 100;

/** Default width and height of each Territory sub-grid (25x25 = 625 sub-tiles). */
export const DEFAULT_TERRITORY_SIZE = 25;

/** In-game time multiplier relative to real time (1 real day = 6 in-game days). */
export const TIME_SCALE = 6;
