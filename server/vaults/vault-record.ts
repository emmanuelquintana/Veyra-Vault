import type { Vault } from '@prisma/client';

export const themeModes = ['light', 'dark'] as const;
export const accentIds = ['forest', 'cobalt', 'rose', 'amber'] as const;
export const backgroundIds = ['grid', 'linen', 'signal', 'topography'] as const;

export type VaultRecordPayload = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
  createdAt: string;
  updatedAt: string;
};

export type VaultDto = {
  vaultId: string;
  record: VaultRecordPayload;
  recoveryRecord: VaultRecordPayload | null;
  settings: VaultSettingsPayload;
  recovery: VaultRecoveryPayload;
  accountId: string | null;
};

export type VaultSettingsPayload = {
  themeMode: (typeof themeModes)[number];
  accentId: (typeof accentIds)[number];
  backgroundId: (typeof backgroundIds)[number];
};

export type VaultRecoveryPayload = {
  recoveryEmail: string;
  recoveryHint: string;
  recoveryEnabled: boolean;
};

export function isVaultRecordPayload(value: unknown): value is VaultRecordPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;

  return (
    record.version === 1 &&
    typeof record.salt === 'string' &&
    typeof record.iv === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.iterations === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    record.salt.length > 0 &&
    record.iv.length > 0 &&
    record.ciphertext.length > 0 &&
    record.iterations > 0
  );
}

export function toVaultDto(row: Vault): VaultDto {
  return {
    vaultId: row.id,
    record: {
      version: 1,
      salt: row.salt,
      iv: row.iv,
      ciphertext: row.ciphertext,
      iterations: row.iterations,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    recoveryRecord:
      row.recoverySalt && row.recoveryIv && row.recoveryCiphertext
        ? {
            version: 1,
            salt: row.recoverySalt,
            iv: row.recoveryIv,
            ciphertext: row.recoveryCiphertext,
            iterations: row.iterations,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }
        : null,
    settings: {
      themeMode: isThemeMode(row.themeMode) ? row.themeMode : 'dark',
      accentId: isAccentId(row.accentId) ? row.accentId : 'forest',
      backgroundId: isBackgroundId(row.backgroundId) ? row.backgroundId : 'grid',
    },
    recovery: {
      recoveryEmail: row.recoveryEmail ?? '',
      recoveryHint: row.recoveryHint ?? '',
      recoveryEnabled: Boolean(row.recoverySalt && row.recoveryIv && row.recoveryCiphertext),
    },
    accountId: row.accountId,
  };
}

export function toVaultInsert(record: VaultRecordPayload) {
  return {
    version: record.version,
    salt: record.salt,
    iv: record.iv,
    ciphertext: record.ciphertext,
    iterations: record.iterations,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

export function toVaultUpdate(record: VaultRecordPayload) {
  return {
    version: record.version,
    salt: record.salt,
    iv: record.iv,
    ciphertext: record.ciphertext,
    iterations: record.iterations,
    updatedAt: new Date(record.updatedAt),
  };
}

export function isVaultSettingsPayload(value: unknown): value is VaultSettingsPayload {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    isThemeMode(settings.themeMode) &&
    isAccentId(settings.accentId) &&
    isBackgroundId(settings.backgroundId)
  );
}

export function isVaultRecoveryRecord(value: unknown): value is VaultRecordPayload {
  return isVaultRecordPayload(value);
}

export function isRecoveryMetadata(value: unknown): value is Pick<VaultRecoveryPayload, 'recoveryEmail' | 'recoveryHint'> {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.recoveryEmail === 'string' &&
    metadata.recoveryEmail.length <= 320 &&
    typeof metadata.recoveryHint === 'string' &&
    metadata.recoveryHint.length <= 180
  );
}

export function toVaultSettingsUpdate(settings: VaultSettingsPayload) {
  return {
    themeMode: settings.themeMode,
    accentId: settings.accentId,
    backgroundId: settings.backgroundId,
  };
}

export function toVaultRecoveryUpdate(record: VaultRecordPayload, metadata: Pick<VaultRecoveryPayload, 'recoveryEmail' | 'recoveryHint'>) {
  return {
    recoveryEmail: metadata.recoveryEmail.trim().toLowerCase() || null,
    recoveryHint: metadata.recoveryHint.trim() || null,
    recoverySalt: record.salt,
    recoveryIv: record.iv,
    recoveryCiphertext: record.ciphertext,
  };
}

function isThemeMode(value: unknown): value is VaultSettingsPayload['themeMode'] {
  return themeModes.includes(value as VaultSettingsPayload['themeMode']);
}

function isAccentId(value: unknown): value is VaultSettingsPayload['accentId'] {
  return accentIds.includes(value as VaultSettingsPayload['accentId']);
}

function isBackgroundId(value: unknown): value is VaultSettingsPayload['backgroundId'] {
  return backgroundIds.includes(value as VaultSettingsPayload['backgroundId']);
}
