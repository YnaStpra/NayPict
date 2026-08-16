// This module handles client device info, browser detection, IP extraction, and geolocation resolution.

export interface ClientInfo {
  ip: string;
  device: string;
  browser: string;
  os: string;
  location: string;
  userAgent: string;
}

// Extract clean client IP address from HTTP headers.
export function extractClientIp(headers: Record<string, string | undefined>): string {
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }

  const realIp = headers['x-real-ip'] || headers['X-Real-IP'] || headers['cf-connecting-ip'];
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}

// Parse User-Agent string to get device type, OS, and browser name.
export function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  if (!ua) {
    return { device: 'Unknown Device', browser: 'Unknown Browser', os: 'Unknown OS' };
  }

  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';

  let device = 'Desktop PC';
  if (/iPhone|Android.*Mobile/i.test(ua)) device = 'Mobile Phone';
  else if (/iPad|Android(?!.*Mobile)/i.test(ua)) device = 'Tablet';

  return { device, browser, os };
}

// Resolve IP geolocation (Country, City) using headers or IP API.
export async function resolveLocation(ip: string, headers: Record<string, string | undefined>): Promise<string> {
  const cityHeader = headers['x-vercel-ip-city'] || headers['cf-ipcity'];
  const countryHeader = headers['x-vercel-ip-country'] || headers['cf-ipcountry'];

  if (cityHeader || countryHeader) {
    const city = cityHeader ? decodeURIComponent(cityHeader) : '';
    const country = countryHeader || '';
    return [city, country].filter(Boolean).join(', ') || 'Indonesia';
  }

  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return 'Localhost / Network Lokal';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        return [data.city, data.country].filter(Boolean).join(', ') || 'Indonesia';
      }
    }
  } catch {
    // Fallback if IP lookup fails or times out
  }

  return 'Indonesia';
}

// Inspect HTTP headers and resolve full ClientInfo metadata.
export async function getClientInfo(headers: Record<string, string | undefined>): Promise<ClientInfo> {
  const userAgent = headers['user-agent'] || headers['User-Agent'] || '';
  const ip = extractClientIp(headers);
  const { device, browser, os } = parseUserAgent(userAgent);
  const location = await resolveLocation(ip, headers);

  return {
    ip,
    device,
    browser,
    os,
    location,
    userAgent,
  };
}
