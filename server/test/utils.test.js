const { test, describe } = require('node:test');
const assert = require('node:assert');
const { stripTrailingDelimiters } = require('../utils');

describe('stripTrailingDelimiters', () => {
  test('should return the same string if no trailing delimiters', () => {
    assert.strictEqual(stripTrailingDelimiters('filename'), 'filename');
    assert.strictEqual(stripTrailingDelimiters('file_name'), 'file_name');
    assert.strictEqual(stripTrailingDelimiters('my-file.name'), 'my-file.name');
  });

  test('should strip trailing underscore', () => {
    assert.strictEqual(stripTrailingDelimiters('filename_'), 'filename');
  });

  test('should strip trailing hyphen', () => {
    assert.strictEqual(stripTrailingDelimiters('filename-'), 'filename');
  });

  test('should strip trailing dot', () => {
    assert.strictEqual(stripTrailingDelimiters('filename.'), 'filename');
  });

  test('should strip multiple trailing delimiters', () => {
    assert.strictEqual(stripTrailingDelimiters('filename___'), 'filename');
    assert.strictEqual(stripTrailingDelimiters('filename._-'), 'filename');
    assert.strictEqual(stripTrailingDelimiters('filename---...___'), 'filename');
  });

  test('should preserve internal delimiters when stripping trailing ones', () => {
    assert.strictEqual(stripTrailingDelimiters('my_file-name.v1_'), 'my_file-name.v1');
    assert.strictEqual(stripTrailingDelimiters('my.file_name--'), 'my.file_name');
  });

  test('should return empty string if input is only delimiters', () => {
    assert.strictEqual(stripTrailingDelimiters('___'), '');
    assert.strictEqual(stripTrailingDelimiters('...'), '');
    assert.strictEqual(stripTrailingDelimiters('---'), '');
    assert.strictEqual(stripTrailingDelimiters('_.-'), '');
  });

  test('should return empty string for empty input', () => {
    assert.strictEqual(stripTrailingDelimiters(''), '');
  });

  test('should handle non-string inputs by converting to string', () => {
    assert.strictEqual(stripTrailingDelimiters(null), 'null');
    assert.strictEqual(stripTrailingDelimiters(undefined), 'undefined');
    assert.strictEqual(stripTrailingDelimiters(123), '123');
    assert.strictEqual(stripTrailingDelimiters(true), 'true');
  });

  test('should handle strings that become empty after stripping', () => {
    assert.strictEqual(stripTrailingDelimiters('_'), '');
    assert.strictEqual(stripTrailingDelimiters('.'), '');
    assert.strictEqual(stripTrailingDelimiters('-'), '');
  });
});
