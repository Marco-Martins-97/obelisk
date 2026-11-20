import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  TIME_SCALE,
} from '../index.js';

describe('@obelisk/shared Stage 0 smoke tests', () => {
  it('exports valid default world and time constants', () => {
    expect(DEFAULT_CONTINENT_SIZE).toBe(100);
    expect(DEFAULT_TERRITORY_SIZE).toBe(25);
    expect(TIME_SCALE).toBe(6);
  });
});
