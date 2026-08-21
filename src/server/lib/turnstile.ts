// This module provides server-side verification for Cloudflare Turnstile captcha tokens.

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

// Verify a Cloudflare Turnstile token against the Cloudflare siteverify endpoint.
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();

  // If Turnstile secret key is not configured in the environment, bypass verification gracefully (dev/test mode)
  if (!secretKey) {
    return true;
  }

  // If secret key is set but no token was provided, reject
  if (!token?.trim()) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token.trim());
    if (remoteIp && remoteIp !== 'unknown') {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      console.warn('[TURNSTILE] Verification request failed with HTTP status:', response.status);
      return false;
    }

    const outcome = (await response.json()) as TurnstileVerifyResponse;
    if (!outcome.success) {
      console.warn('[TURNSTILE] Verification failed with error codes:', outcome['error-codes']);
    }

    return Boolean(outcome.success);
  } catch (err) {
    console.error('[TURNSTILE] Unexpected error during token verification:', err);
    return false;
  }
}
