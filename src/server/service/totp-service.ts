import { eq } from 'drizzle-orm';
import { settingTab } from '@/server/entity/setting';
import { orm } from '@/server/infra/db';
import BizError from '@/server/error/biz-error';
import { generateOtpAuthUrl, generateTotpSecret, getQrCodeImageUrl, verifyTotpCode } from '@/server/lib/totp';
import { type TotpSetupVo, type TotpStatusVo } from '@/server/entity/vo/totp';

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
    let existingData = await this.getTotpData(userId);
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
  async verifyAndEnableTotp(code: string, secretInput: string | undefined, userId: string): Promise<boolean> {
    const existingData = await this.getTotpData(userId);
    const secret = secretInput || existingData?.secret;

    if (!secret) {
      throw new BizError('totp.notConfigured');
    }

    const isValid = verifyTotpCode(secret, code);
    if (!isValid) {
      throw new BizError('totp.invalidCode');
    }

    const key = this.getSettingKey(userId);
    const updatedData: TotpUserData = {
      secret,
      enabled: true,
      createTime: existingData?.createTime || new Date().toISOString(),
    };

    await orm
      .insert(settingTab)
      .values({
        key,
        value: JSON.stringify(updatedData),
      })
      .onConflictDoUpdate({
        target: settingTab.key,
        set: { value: JSON.stringify(updatedData) },
      });

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

    await orm
      .insert(settingTab)
      .values({
        key,
        value: JSON.stringify(updatedData),
      })
      .onConflictDoUpdate({
        target: settingTab.key,
        set: { value: JSON.stringify(updatedData) },
      });
  },

  // Verify 6-digit TOTP code during login.
  async verifyLoginTotp(userId: string, code: string): Promise<boolean> {
    const data = await this.getTotpData(userId);

    if (!data || !data.secret) {
      throw new BizError('totp.notConfigured');
    }

    if (!data.enabled) {
      return true; // 2FA is not enabled for this user
    }

    const isValid = verifyTotpCode(data.secret, code);
    if (!isValid) {
      throw new BizError('totp.invalidCode');
    }

    return true;
  }
};

export { totpService };
