import { eq, sql } from 'drizzle-orm';
import { settingTab } from '@/server/entity/setting';
import { userTab } from '@/server/entity/user';
import { orm } from '@/server/infra/db';
import BizError from '@/server/error/biz-error';
import { generateOtpAuthUrl, generateTotpSecret, getQrCodeImageUrl, verifyTotpCode } from '@/server/lib/totp';
import { type TotpSetupVo, type TotpStatusVo } from '@/server/entity/vo/totp';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';

// This module manages TOTP configuration, verification, and related session revocation.

interface TotpUserData {
  secret: string;
  enabled: boolean;
  createTime: string;
}

const totpService = {

  // Generate storage key for user TOTP config.
  getSettingKey(userId: string): string {
    return `totp_user_${userId}`;
  },

  // Get user's TOTP configuration status.
  async getTotpStatus(userId: string): Promise<TotpStatusVo> {
    const key = this.getSettingKey(userId);
    const [row] = await orm.select().from(settingTab).where(eq(settingTab.key, key)).limit(1);

    if (!row || !row.value) {
      return { enabled: false, configured: false };
    }

    try {
      const data: TotpUserData = JSON.parse(row.value);
      return { enabled: Boolean(data.enabled), configured: Boolean(data.secret) };
    } catch {
      return { enabled: false, configured: false };
    }
  },

  // Get user's TOTP configuration data.
  async getTotpData(userId: string): Promise<TotpUserData | null> {
    const key = this.getSettingKey(userId);
    const [row] = await orm.select().from(settingTab).where(eq(settingTab.key, key)).limit(1);

    if (!row || !row.value) {
      return null;
    }

    try {
      return JSON.parse(row.value) as TotpUserData;
    } catch {
      return null;
    }
  },

  // Initialize or setup Google Authenticator TOTP QR code for user.
  async setupTotp(username: string, userId: string): Promise<TotpSetupVo> {
    const existingData = await this.getTotpData(userId);
    let secret = existingData?.secret;

    if (!secret) {
      secret = generateTotpSecret(16);
      const key = this.getSettingKey(userId);
      const data: TotpUserData = {
        secret,
        enabled: false,
        createTime: new Date().toISOString(),
      };

      await orm
        .insert(settingTab)
        .values({
          key,
          value: JSON.stringify(data),
        })
        .onConflictDoUpdate({
          target: settingTab.key,
          set: { value: JSON.stringify(data) },
        });
    }

    const otpauthUrl = generateOtpAuthUrl(secret, username, 'NayPict');
    const qrCodeUrl = getQrCodeImageUrl(otpauthUrl);

    return {
      secret,
      otpauthUrl,
      qrCodeUrl,
      enabled: Boolean(existingData?.enabled),
    };
  },

  // Verify initial setup 6-digit OTP code and enable 2FA for user.
  // Always uses the server-stored secret — ignores any client-supplied secret (MED-05)
  async verifyAndEnableTotp(code: string, _secretInput: string | undefined, userId: string): Promise<boolean> {
    const existingData = await this.getTotpData(userId);
    // Always read secret from DB — never trust the client-supplied value
    const secret = existingData?.secret;

    if (!secret) {
      throw new BizError('totp.notConfigured');
    }

    // Reject replayed codes within the verification window (HIGH-03)
    const replayKey = `totp_used_${userId}_${code}`;
    if (await cache.get(replayKey)) {
      throw new BizError('totp.codeAlreadyUsed');
    }

    const isValid = verifyTotpCode(secret, code);
    if (isValid) {
      // Mark this code as used for 90s (covers ±1 step window)
      await cache.set(replayKey, true, { ttl: 90 });
    }
    if (!isValid) {
      throw new BizError('totp.invalidCode');
    }

    const key = this.getSettingKey(userId);
    const updatedData: TotpUserData = {
      secret,
      enabled: true,
      createTime: existingData?.createTime || new Date().toISOString(),
    };

    // Persist the stronger 2FA policy and revoke pre-2FA sessions atomically.
    await orm.batch([
      orm
        .insert(settingTab)
        .values({
          key,
          value: JSON.stringify(updatedData),
        })
        .onConflictDoUpdate({
          target: settingTab.key,
          set: { value: JSON.stringify(updatedData) },
        }),
      orm
        .update(userTab)
        .set({ tokenVersion: sql`${userTab.tokenVersion} + 1` })
        .where(eq(userTab.userId, userId)),
    ]);
    await cache.delete(AUTH_CACHE_KEY + userId);

    return true;
  },

  // Disable 2FA Google Authenticator for user.
  async disableTotp(userId: string): Promise<void> {
    const existingData = await this.getTotpData(userId);
    if (!existingData) return;

    const key = this.getSettingKey(userId);
    const updatedData: TotpUserData = {
      ...existingData,
      enabled: false,
    };

    // Persist the weaker 2FA policy and revoke every previously authenticated session atomically.
    await orm.batch([
      orm
        .insert(settingTab)
        .values({
          key,
          value: JSON.stringify(updatedData),
        })
        .onConflictDoUpdate({
          target: settingTab.key,
          set: { value: JSON.stringify(updatedData) },
        }),
      orm
        .update(userTab)
        .set({ tokenVersion: sql`${userTab.tokenVersion} + 1` })
        .where(eq(userTab.userId, userId)),
    ]);
    await cache.delete(AUTH_CACHE_KEY + userId);
  },

  // Verify 6-digit TOTP code during login with replay protection (HIGH-03).
  async verifyLoginTotp(userId: string, code: string): Promise<boolean> {
    const data = await this.getTotpData(userId);

    if (!data || !data.secret) {
      throw new BizError('totp.notConfigured');
    }

    if (!data.enabled) {
      return true; // 2FA is not enabled for this user
    }

    // Reject replayed codes within the verification window
    const replayKey = `totp_used_${userId}_${code}`;
    if (await cache.get(replayKey)) {
      throw new BizError('totp.codeAlreadyUsed');
    }

    const isValid = verifyTotpCode(data.secret, code);
    if (!isValid) {
      throw new BizError('totp.invalidCode');
    }

    // Mark this code as used for 90s to prevent replay
    await cache.set(replayKey, true, { ttl: 90 });

    return true;
  }
};

export { totpService };
