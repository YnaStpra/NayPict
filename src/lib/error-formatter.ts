// This module provides friendly, human-readable error messages and formatting for client-side notifications.

const ERROR_MESSAGE_MAP: Record<string, string> = {
  'auth.failed': 'Authentication failed. Please check your credentials.',
  'auth.unauthorized': 'You do not have permission to perform this action.',
  'auth.forbidden': 'Access denied. Administrator privileges required.',
  'auth.sessionExpired': 'Your session has expired. Please sign in again.',
  'auth.invalidTotp': 'Invalid two-factor authentication code. Please try again.',
  'photo.notFound': 'The requested media could not be found.',
  'photo.fileTooLarge': 'The uploaded file is too large. Please select a smaller file.',
  'photo.invalidFormat': 'Unsupported file format.',
  'photo.invalidCoordinates': 'Please enter valid GPS coordinates (e.g. -8.345, 116.533 or 8°20\'43"S 116°31\'59"E).',
  'storage.notFound': 'Storage provider is currently unavailable.',
  'storage.readOnly': 'The application is running in read-only mode.',
  'album.notFound': 'The requested album was not found.',
  'comment.empty': 'Please enter a comment before submitting.',
  'comment.nameRequired': 'Please enter your name to post a comment.',
  'network.connectionLost': 'Connection lost. Please check your internet connection.',
  'network.timeout': 'Network request timed out. Please try again.',
  'database.error': 'Unable to complete the request. Please try again later.',
};

/**
 * Transforms technical exceptions, raw error objects, and developer stack logs
 * into modern, clean, user-friendly error messages.
 */
export function humanizeError(err: unknown, fallback = 'An unexpected error occurred. Please try again.'): string {
  if (!err) return fallback;

  let raw = '';
  if (typeof err === 'string') {
    raw = err;
  } else if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    raw = String(record.message || record.error || record.msg || '');
  }

  raw = raw.trim();
  if (!raw) return fallback;

  // Direct lookup in known message dictionary
  if (ERROR_MESSAGE_MAP[raw]) {
    return ERROR_MESSAGE_MAP[raw];
  }

  // Strip common technical / developer prefixes
  let cleaned = raw
    .replace(/^Error:\s*/i, '')
    .replace(/^TypeError:\s*/i, '')
    .replace(/^BizError:\s*/i, '')
    .replace(/^AxiosError:\s*/i, '')
    .replace(/^Unhandled\s*Rejection:\s*/i, '')
    .replace(/^Uncaught\s*/i, '')
    .replace(/^\[\d+\]\s*/, '')
    .replace(/\\"/g, '"');

  // Check if cleaned string matches dictionary
  if (ERROR_MESSAGE_MAP[cleaned]) {
    return ERROR_MESSAGE_MAP[cleaned];
  }

  // Hide raw SQL queries or database constraint dumps
  if (
    /select\s+.*\s+from/i.test(cleaned) ||
    /insert\s+into/i.test(cleaned) ||
    /duplicate\s+key\s+value/i.test(cleaned) ||
    /violates\s+foreign\s+key/i.test(cleaned) ||
    /violates\s+not-null/i.test(cleaned) ||
    /syntax\s+error\s+at\s+or\s+near/i.test(cleaned) ||
    /neon/i.test(cleaned) ||
    /drizzle/i.test(cleaned) ||
    /pg_/i.test(cleaned)
  ) {
    return 'Database operation failed. Please try again later.';
  }

  // Hide raw code stack traces
  if ((cleaned.includes(' at ') && cleaned.includes('.ts:')) || cleaned.includes('.js:')) {
    cleaned = cleaned.split('\n')[0].trim();
  }

  // Hide raw fetch failure strings
  if (/Failed to fetch/i.test(cleaned) || /NetworkError/i.test(cleaned) || /Load failed/i.test(cleaned)) {
    return 'Network request failed. Please check your internet connection.';
  }

  // Clean up coordinate format errors
  if (/Invalid coordinates format/i.test(cleaned) || /coordinate/i.test(cleaned) && /invalid/i.test(cleaned)) {
    return 'Invalid location format. Please provide valid coordinates (e.g. -8.345, 116.533 or 8°20\'43"S 116°31\'59"E).';
  }

  // If message looks like developer jargon / dot-separated code
  if (/^[a-z]+(\.[a-z0-9_-]+)+$/i.test(cleaned)) {
    const key = cleaned.toLowerCase();
    if (ERROR_MESSAGE_MAP[key]) return ERROR_MESSAGE_MAP[key];
    const parts = key.split('.');
    return `${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)} request failed. Please try again.`;
  }

  // Ensure first character is uppercase and ends with proper punctuation
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }
  }

  return cleaned || fallback;
}
