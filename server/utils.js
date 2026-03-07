const MAX_FILE_NAME_LENGTH = 255;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 3600 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

function parseTtl(ttl) {
  if (!ttl) return ONE_HOUR_MS; // Default: 1 hour
  const unit = ttl.slice(-1).toLowerCase();
  const value = parseInt(ttl.slice(0, -1), 10);
  if (isNaN(value)) return ONE_HOUR_MS;

  switch (unit) {
    case 'm': return value * ONE_MINUTE_MS;
    case 'h': return value * ONE_HOUR_MS;
    case 'd': return value * ONE_DAY_MS;
    case 'w': return value * ONE_WEEK_MS;
    case 'M': return value * THIRTY_DAYS_MS; // Approx. 30 days
    default: return ONE_HOUR_MS;
  }
}

function sanitizeBaseName(name) {
  // Ensure name is a string, truncate to a reasonable length (e.g., 255)
  name = typeof name === 'string' ? name : String(name);
  if (!Number.isSafeInteger(name.length) || name.length > MAX_FILE_NAME_LENGTH) {
    name = name.slice(0, MAX_FILE_NAME_LENGTH);
  }
  // Replace any disallowed character with underscore without regex backtracking
  let out = '';
  const max = Math.min(name.length, MAX_FILE_NAME_LENGTH);
  for (let i = 0; i < max; i++) {
    const ch = name[i];
    const isAllowed =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '.' || ch === '_' || ch === '-';
    out += isAllowed ? ch : '_';
  }
  return out;
}

function stripTrailingDelimiters(name) {
  name = typeof name === 'string' ? name : String(name);
  if (!Number.isSafeInteger(name.length) || name.length > MAX_FILE_NAME_LENGTH) {
    name = name.slice(0, MAX_FILE_NAME_LENGTH);
  }
  // Remove trailing underscores, dots, or hyphens from a base filename
  let end = Math.min(name.length, MAX_FILE_NAME_LENGTH);
  while (end > 0) {
    const ch = name.charAt(end - 1);
    if (ch === '_' || ch === '-' || ch === '.') {
      end--;
    } else {
      break;
    }
  }
  return name.slice(0, end);
}

function collapseUnderscores(name) {
  // Ensure string input and cap effective length
  name = typeof name === 'string' ? name : String(name);
  if (!Number.isSafeInteger(name.length) || name.length > MAX_FILE_NAME_LENGTH) {
    name = name.slice(0, MAX_FILE_NAME_LENGTH);
  }
  // Collapse multiple underscores into a single underscore without regex
  let out = '';
  let prevUnderscore = false;
  const max = Math.min(name.length, MAX_FILE_NAME_LENGTH);
  for (let i = 0; i < max; i++) {
    const ch = name[i];
    if (ch === '_') {
      if (!prevUnderscore) out += '_';
      prevUnderscore = true;
    } else {
      out += ch;
      prevUnderscore = false;
    }
  }
  return out;
}

module.exports = {
  MAX_FILE_NAME_LENGTH,
  parseTtl,
  sanitizeBaseName,
  stripTrailingDelimiters,
  collapseUnderscores
};
