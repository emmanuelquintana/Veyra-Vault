import type { VaultRecord } from '../domain/vault-record';

type PaginationMetadata = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ApiResponse<TData> = {
  code: string;
  message: string;
  traceId: string;
  data: TData;
  metadata: PaginationMetadata;
};

export type VaultDto = {
  vaultId: string;
  record: VaultRecord;
  recoveryRecord: VaultRecord | null;
  settings: VaultSettings;
  recovery: VaultRecovery;
  accountId: string | null;
};

export type VaultSettings = {
  themeMode: 'light' | 'dark';
  accentId: 'forest' | 'cobalt' | 'rose' | 'amber';
  backgroundId: 'grid' | 'linen' | 'signal' | 'topography';
};

export type VaultRecovery = {
  recoveryEmail: string;
  recoveryHint: string;
  recoveryEnabled: boolean;
};

export type AccountPayload = {
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
};

export type AccountDto = AccountPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

async function readApi<TData>(response: Response): Promise<TData> {
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok) {
    throw new Error(payload.message || 'La API no pudo completar la operación.');
  }

  return payload.data;
}

export async function createRemoteVault(record: VaultRecord, settings?: VaultSettings) {
  const response = await fetch('/api/v1/vaults', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record, settings }),
  });

  return readApi<VaultDto>(response);
}

export async function getRemoteVault(vaultId: string) {
  const response = await fetch(`/api/v1/vaults/${vaultId}`);
  return readApi<VaultDto>(response);
}

export async function findRecoveryVault(identifier: string) {
  const response = await fetch('/api/v1/vaults/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });

  return readApi<VaultDto>(response);
}

export async function findAccountVault(identifier: string) {
  const response = await fetch('/api/v1/vaults/account/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });

  return readApi<VaultDto>(response);
}

export async function updateRemoteVault(vaultId: string, record: VaultRecord) {
  const response = await fetch(`/api/v1/vaults/${vaultId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record }),
  });

  return readApi<VaultDto>(response);
}

export async function updateRemoteVaultSettings(vaultId: string, settings: VaultSettings) {
  const response = await fetch(`/api/v1/vaults/${vaultId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });

  return readApi<VaultDto>(response);
}

export async function updateRemoteVaultRecovery(
  vaultId: string,
  recoveryRecord: VaultRecord,
  metadata: Pick<VaultRecovery, 'recoveryEmail' | 'recoveryHint'>,
) {
  const response = await fetch(`/api/v1/vaults/${vaultId}/recovery`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryRecord, metadata }),
  });

  return readApi<VaultDto>(response);
}

export async function attachAccountToVault(vaultId: string, accountId: string) {
  const response = await fetch(`/api/v1/vaults/${vaultId}/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });

  return readApi<VaultDto>(response);
}

export async function createAccount(account: AccountPayload) {
  const response = await fetch('/api/v1/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });

  return readApi<AccountDto>(response);
}

export async function getAccount(accountId: string) {
  const response = await fetch(`/api/v1/accounts/${accountId}`);
  return readApi<AccountDto>(response);
}

export async function updateAccount(accountId: string, account: AccountPayload) {
  const response = await fetch(`/api/v1/accounts/${accountId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });

  return readApi<AccountDto>(response);
}

export async function deleteAccount(accountId: string) {
  const response = await fetch(`/api/v1/accounts/${accountId}`, {
    method: 'DELETE',
  });

  return readApi<AccountDto>(response);
}
