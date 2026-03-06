const MAX_FILE_NAME_LENGTH = 255;

function parseTtl(ttl) {
  if (!ttl) return 3600 * 1000; // Default: 1 hour
  const unit = ttl.slice(-1).toLowerCase();
  const value = parseInt(ttl.slice(0, -1), 10);
  if (isNaN(value)) return 3600 * 1000;

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'd': return value * 24 * 3600 * 1000;
    case 'w': return value * 7 * 24 * 3600 * 1000;
    case 'M': return value * 30 * 24 * 3600 * 1000; // Approx. 30 days
    default: return 3600 * 1000;
  }
}

function sanitizeBaseName(name) {
  // Ensure name is a string, truncate to a reasonable length (e.g., 255)
  name = typeof name === 'string' ? name : String(name);
  if (name.length > 255) {
    name = name.slice(0, 255);
  }
  // Replace any disallowed character with underscore without regex backtracking
  let out = '';
  for (let i = 0; i < name.length; i++) {
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
  // Remove trailing underscores, dots, or hyphens from a base filename
  let end = name.length;
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
