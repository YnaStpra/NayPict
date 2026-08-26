// This module stores global constants.

// Cookie name with __Host- prefix in production HTTPS environments to prevent subdomain injection and cookie tossing attacks (RFC 6265bis)
const TOKEN_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-token' : 'token';
const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const AUTH_CACHE_TTL = 60 * 60 * 24 * 30;
const PHOTO_LIST_PAGE_SIZE = 100;
const SETTING_KEY = 'system-config';

export { TOKEN_COOKIE_NAME, TOKEN_COOKIE_MAX_AGE, AUTH_CACHE_TTL, PHOTO_LIST_PAGE_SIZE, SETTING_KEY };
