import { describe, expect, it } from 'vitest';
import {
  isCoord,
  isGameMode,
  isRecord,
  isRoomCode,
  isShipPlacements,
  isToken,
} from './validate';

describe('isRecord', () => {
  it('accepts objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });
  it('rejects non-objects', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(5)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});

describe('isCoord', () => {
  it('accepts in-range integer coords', () => {
    expect(isCoord({ row: 0, col: 0 })).toBe(true);
    expect(isCoord({ row: 9, col: 9 })).toBe(true);
  });
  it('rejects malformed coords', () => {
    expect(isCoord(null)).toBe(false);
    expect(isCoord({ row: 1.5, col: 1 })).toBe(false);
    expect(isCoord({ row: NaN, col: 0 })).toBe(false);
    expect(isCoord({ row: -1, col: 0 })).toBe(false);
    expect(isCoord({ row: 10, col: 0 })).toBe(false);
    expect(isCoord({ row: 'a', col: 0 })).toBe(false);
    expect(isCoord({ row: 0 })).toBe(false);
  });
});

describe('isRoomCode', () => {
  it('accepts 4-char alphanumeric codes', () => {
    expect(isRoomCode('ABCD')).toBe(true);
    expect(isRoomCode('a1b2')).toBe(true);
    expect(isRoomCode(' abcd ')).toBe(true);
  });
  it('rejects bad codes', () => {
    expect(isRoomCode('ABC')).toBe(false);
    expect(isRoomCode('ABCDE')).toBe(false);
    expect(isRoomCode('AB-D')).toBe(false);
    expect(isRoomCode(5)).toBe(false);
    expect(isRoomCode(null)).toBe(false);
  });
});

describe('isToken', () => {
  it('accepts reasonable strings', () => {
    expect(isToken('abc')).toBe(true);
    expect(isToken('x'.repeat(64))).toBe(true);
  });
  it('rejects bad tokens', () => {
    expect(isToken('')).toBe(false);
    expect(isToken('x'.repeat(65))).toBe(false);
    expect(isToken(null)).toBe(false);
    expect(isToken(42)).toBe(false);
  });
});

describe('isGameMode', () => {
  it('accepts known modes', () => {
    expect(isGameMode('human')).toBe(true);
    expect(isGameMode('ai')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isGameMode('robot')).toBe(false);
    expect(isGameMode(null)).toBe(false);
    expect(isGameMode(undefined)).toBe(false);
  });
});

describe('isShipPlacements', () => {
  const good = { name: 'Carrier', row: 0, col: 0, orientation: 'h' };
  it('accepts well-formed placements', () => {
    expect(isShipPlacements([good])).toBe(true);
    expect(isShipPlacements([{ ...good, row: -3, orientation: 'v' }])).toBe(true); // bounds are validatePlacement's job
    expect(isShipPlacements([])).toBe(true); // count checked by validatePlacement
  });
  it('rejects malformed input', () => {
    expect(isShipPlacements(null)).toBe(false);
    expect(isShipPlacements('nope')).toBe(false);
    expect(isShipPlacements([{ ...good, name: 'Yacht' }])).toBe(false);
    expect(isShipPlacements([{ ...good, row: 1.5 }])).toBe(false);
    expect(isShipPlacements([{ name: 'Carrier', row: 0 }])).toBe(false);
    expect(isShipPlacements([{ ...good, orientation: 'x' }])).toBe(false);
  });
});
