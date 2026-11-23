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

/** Physical distance across one Territory sub-tile in km (500m). */
export const TERRITORY_TILE_DISTANCE_KM = 0.5;

/** Physical distance across one Continent world tile in km (25 sub-tiles * 0.5 km). */
export const CONTINENT_TILE_DISTANCE_KM = DEFAULT_TERRITORY_SIZE * TERRITORY_TILE_DISTANCE_KM;

/** Width/height of the centered starter explored box in a Territory (7x7 = 49 tiles). */
export const INITIAL_TERRITORY_EXPLORE_SIZE = 7;

/** Ambient climate Celsius scale mapped from normalized [0, 1] temperatures. */
export const MIN_TEMP_CELSIUS = -20;
export const MAX_TEMP_CELSIUS = 40;

/** Radius around an explored action tile revealed upon completion (1 => 3x3 box). */
export const EXPLORE_REVEAL_RADIUS = 1;

/** Number of consumable water bowls stored in one gathered water jar. */
export const WATER_BOWLS_PER_JAR = 10;

/** In-game time multiplier relative to real time (1 real day = 6 in-game days; 1 day = 4h). */
export const TIME_SCALE = 6;

/** Calendar structure constants (4 seasons * 3 months * 28 lunar days = 336 days/year). */
export const HOURS_PER_INGAME_DAY = 24;
export const DAYS_PER_MONTH = 28;
export const MONTHS_PER_SEASON = 3;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_SEASON = DAYS_PER_MONTH * MONTHS_PER_SEASON;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;
export const SEASON_NAMES = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

/** Real-time millisecond conversions derived from TIME_SCALE. */
export const MS_PER_REAL_DAY = 24 * 60 * 60 * 1000;
export const REAL_MS_PER_INGAME_DAY = MS_PER_REAL_DAY / TIME_SCALE;
export const REAL_MS_PER_INGAME_HOUR = REAL_MS_PER_INGAME_DAY / HOURS_PER_INGAME_DAY;
