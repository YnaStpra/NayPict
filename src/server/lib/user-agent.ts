// This module parses HTTP User-Agent headers into friendly device, OS, and browser labels for session management.

export interface ParsedDeviceInfo {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  label: string;
}

// Parse raw User-Agent string into human-readable device, browser, and operating system descriptor.
export function parseUserAgent(userAgent?: string | null): ParsedDeviceInfo {
  if (!userAgent || !userAgent.trim()) {
    return {
      browser: 'Browser',
      os: 'Unknown OS',
      deviceType: 'unknown',
      label: 'Unknown Device',
    };
  }

  const ua = userAgent.toLowerCase();

  // 1. Detect Operating System
  let os = 'Unknown OS';
  if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/windows nt/i.test(ua)) {
    os = 'Windows';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/cros/i.test(ua)) {
    os = 'ChromeOS';
  }

  // 2. Detect Device Type
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'desktop';
  if (os === 'macOS' || os === 'Windows' || os === 'ChromeOS') {
    deviceType = 'desktop';
  } else if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  }

  // 3. Detect Browser Name
  let browser = 'Other';
  if (/brave/i.test(ua)) {
    browser = 'Brave';
  } else if (
    os === 'Android' &&
    (/samsungbrowser|sbrowser/i.test(ua) ||
      (/sm-[a-z0-9]+/i.test(ua) && !/firefox|opr|edge/i.test(ua) && /version\/[0-9.]+/i.test(ua)))
  ) {
    browser = 'Samsung Internet';
  } else if (/edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/opr\/|opera\//i.test(ua)) {
    browser = 'Opera';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/chrome|crios/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  }

  const label = `${browser} on ${os}`;

  return {
    browser,
    os,
    deviceType,
    label,
  };
}
