const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseTtl } = require('../utils');

describe('parseTtl', () => {
  test('returns default (1 hour) for empty input', () => {
    assert.strictEqual(parseTtl(''), 3600 * 1000);
    assert.strictEqual(parseTtl(null), 3600 * 1000);
    assert.strictEqual(parseTtl(undefined), 3600 * 1000);
  });

  test('parses minutes (m)', () => {
    assert.strictEqual(parseTtl('30m'), 30 * 60 * 1000);
    assert.strictEqual(parseTtl('5m'), 5 * 60 * 1000);
  });

  test('parses hours (h/H)', () => {
    assert.strictEqual(parseTtl('1h'), 1 * 3600 * 1000);
    assert.strictEqual(parseTtl('24h'), 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('1H'), 1 * 3600 * 1000);
  });

  test('parses days (d/D)', () => {
    assert.strictEqual(parseTtl('1d'), 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('7d'), 7 * 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('1D'), 24 * 3600 * 1000);
  });

  test('parses weeks (w/W)', () => {
    assert.strictEqual(parseTtl('1w'), 7 * 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('2w'), 14 * 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('1W'), 7 * 24 * 3600 * 1000);
  });

  test('parses months (M)', () => {
    assert.strictEqual(parseTtl('1M'), 30 * 24 * 3600 * 1000);
    assert.strictEqual(parseTtl('3M'), 90 * 24 * 3600 * 1000);
  });

  test('handles case sensitivity correctly', () => {
    // 'm' is minute, 'M' is month. They should be different.
    assert.strictEqual(parseTtl('1m'), 60 * 1000);
    assert.strictEqual(parseTtl('1M'), 30 * 24 * 3600 * 1000);
  });

  test('returns default for invalid unit', () => {
    assert.strictEqual(parseTtl('1z'), 3600 * 1000);
  });

  test('returns default for invalid value', () => {
    assert.strictEqual(parseTtl('abch'), 3600 * 1000);
    assert.strictEqual(parseTtl('h'), 3600 * 1000);
  });
});
