const { test, describe } = require('node:test');
const assert = require('node:assert');
const { collapseUnderscores, MAX_FILE_NAME_LENGTH } = require('./utils');

describe('collapseUnderscores', () => {
  test('returns an empty string if input is empty', () => {
    assert.strictEqual(collapseUnderscores(''), '');
  });

  test('collapses multiple underscores into a single underscore', () => {
    assert.strictEqual(collapseUnderscores('a__b'), 'a_b');
    assert.strictEqual(collapseUnderscores('a___b'), 'a_b');
    assert.strictEqual(collapseUnderscores('a____b'), 'a_b');
    assert.strictEqual(collapseUnderscores('__a__b__'), '_a_b_');
    assert.strictEqual(collapseUnderscores('______'), '_');
  });

  test('does not modify strings without underscores', () => {
    assert.strictEqual(collapseUnderscores('abc'), 'abc');
    assert.strictEqual(collapseUnderscores('a-b-c'), 'a-b-c');
    assert.strictEqual(collapseUnderscores('a.b.c'), 'a.b.c');
  });

  test('handles strings with single underscores', () => {
    assert.strictEqual(collapseUnderscores('a_b'), 'a_b');
    assert.strictEqual(collapseUnderscores('_a_b_'), '_a_b_');
  });

  test('converts non-string inputs to strings and processes them', () => {
    assert.strictEqual(collapseUnderscores(123), '123');
    assert.strictEqual(collapseUnderscores(null), 'null');
    assert.strictEqual(collapseUnderscores(undefined), 'undefined');
    assert.strictEqual(collapseUnderscores({}), '[object Object]');
  });

  test('truncates strings longer than MAX_FILE_NAME_LENGTH', () => {
    const longString = 'a'.repeat(300);
    const expected = 'a'.repeat(MAX_FILE_NAME_LENGTH);
    assert.strictEqual(collapseUnderscores(longString), expected);
  });

  test('truncates strings containing multiple underscores correctly when exceeding length', () => {
    const longString = 'a_'.repeat(200); // length 400
    // The input is first truncated to MAX_FILE_NAME_LENGTH (255)
    // 'a_' * 127 + 'a' = 255 chars
    // Then it's collapsed. Since there are no multiple contiguous underscores,
    // the output should be exactly the truncated input.
    const expected = ('a_'.repeat(127) + 'a');
    assert.strictEqual(collapseUnderscores(longString), expected);
  });

  test('handles case where string has multiple underscores at truncation point', () => {
    const prefix = 'a'.repeat(MAX_FILE_NAME_LENGTH - 2); // 253 chars
    // string length 253 + 4 = 257. Truncated to 255: 'a'*253 + '__'
    const input = prefix + '____';
    // collapsed: 'a'*253 + '_'
    const expected = prefix + '_';
    assert.strictEqual(collapseUnderscores(input), expected);
  });
});
