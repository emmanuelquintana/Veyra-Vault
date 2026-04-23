import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import {
  Check,
  Copy,
  DiceFive,
  DownloadSimple,
  Eye,
  EyeSlash,
  Gauge,
  GearSix,
  Globe,
  Key,
  Lifebuoy,
  LockKey,
  MagnifyingGlass,
  MoonStars,
  Palette,
  PencilSimple,
  Plus,
  ShieldCheck,
  SignOut,
  Sun,
  Trash,
  UploadSimple,
  User,
  UserCircle,
  Vault,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  attachAccountToVault,
  createAccount,
  deleteAccount,
  findRecoveryVault,
  getAccount,
  createRemoteVault,
  getRemoteVault,
  updateAccount,
  updateRemoteVault,
  updateRemoteVaultRecovery,
  updateRemoteVaultSettings,
} from '../services/api';
import type { AccountDto, AccountPayload, VaultRecovery, VaultSettings } from '../services/api';
import { brand } from '../config/brand';
import type { VaultRecord } from '../domain/vault-record';

const STORAGE_KEY = `${brand.storagePrefix}.vault.v1`;
const VAULT_ID_KEY = `${brand.storagePrefix}.vault-id.v1`;
const THEME_MODE_KEY = `${brand.storagePrefix}.theme-mode.v1`;
const ACCENT_KEY = `${brand.storagePrefix}.accent.v1`;
const BACKGROUND_KEY = `${brand.storagePrefix}.background.v1`;
const LEGACY_STORAGE_KEY = `${brand.legacyStoragePrefix}.vault.v1`;
const LEGACY_VAULT_ID_KEY = `${brand.legacyStoragePrefix}.vault-id.v1`;
const LEGACY_THEME_MODE_KEY = `${brand.legacyStoragePrefix}.theme-mode.v1`;
const LEGACY_ACCENT_KEY = `${brand.legacyStoragePrefix}.accent.v1`;
const LEGACY_BACKGROUND_KEY = `${brand.legacyStoragePrefix}.background.v1`;
const KDF_ITERATIONS = 310_000;
const MAX_AVATAR_BYTES = 512 * 1024;
const categories = ['Personal', 'Trabajo', 'Finanzas', 'Social', 'Dev', 'Otro'] as const;

const accentOptions = [
  { id: 'forest', name: 'Bosque', swatch: '#064e3b' },
  { id: 'cobalt', name: 'Cobalto', swatch: '#24537a' },
  { id: 'rose', name: 'Rosa profundo', swatch: '#9f1239' },
  { id: 'amber', name: 'Ámbar seco', swatch: '#92400e' },
] as const;

const backgroundOptions = [
  { id: 'grid', name: 'Retícula' },
  { id: 'linen', name: 'Lino' },
  { id: 'signal', name: 'Señal' },
  { id: 'topography', name: 'Topografía' },
] as const;

type Category = (typeof categories)[number];
type ThemeMode = 'light' | 'dark';
type AccentId = (typeof accentOptions)[number]['id'];
type BackgroundId = (typeof backgroundOptions)[number]['id'];
type ActiveScreen = 'vault' | 'export' | 'settings';

type VaultEntry = {
  id: string;
  service: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  category: Category;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type VaultPayload = {
  entries: VaultEntry[];
};

type DraftEntry = {
  service: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  category: Category;
  tags: string;
};

type AuthMode = 'setup' | 'locked' | 'unlocked';
type Toast = { id: number; message: string; tone: 'success' | 'error' };
type ConfirmDialogState = {
  id: number;
  title: string;
  message: string;
  tone?: 'default' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  onResolve: (confirmed: boolean) => void;
};

const emptyDraft: DraftEntry = {
  service: '',
  url: '',
  username: '',
  password: '',
  notes: '',
  category: 'Personal',
  tags: '',
};

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function makeId() {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return bytesToBase64(randomBytes(16)).replace(/[+/=]/g, '');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}

function getStoredValue(key: string, legacyKey: string) {
  return localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
}

function imageFileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('No pude leer la imagen.'));
    });
    reader.addEventListener('error', () => reject(new Error('No pude leer la imagen.')));
    reader.readAsDataURL(file);
  });
}

function parseVaultRecord(raw: string | null): VaultRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isVaultRecord(parsed)) return parsed;
  } catch {
    return null;
  }

  return null;
}

function isVaultRecord(value: unknown): value is VaultRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.salt === 'string' &&
    typeof record.iv === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.iterations === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

function isVaultPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.entries);
}

async function deriveMasterKey(password: string, salt: Uint8Array, iterations: number) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealEntries(entries: VaultEntry[], key: CryptoKey, previous?: VaultRecord) {
  const encoder = new TextEncoder();
  const iv = randomBytes(12);
  const encoded = encoder.encode(JSON.stringify({ entries } satisfies VaultPayload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encoded));
  const now = new Date().toISOString();

  return {
    version: 1,
    salt: previous?.salt ?? bytesToBase64(randomBytes(16)),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iterations: previous?.iterations ?? KDF_ITERATIONS,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  } satisfies VaultRecord;
}

async function openEntries(record: VaultRecord, key: CryptoKey) {
  const decoder = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(record.iv)) },
    key,
    toArrayBuffer(base64ToBytes(record.ciphertext)),
  );
  const payload = JSON.parse(decoder.decode(plaintext)) as unknown;

  if (!isVaultPayload(payload)) {
    throw new Error('La bóveda tiene un formato inválido.');
  }

  return payload.entries;
}

async function createEmptyVault(masterPassword: string) {
  const salt = randomBytes(16);
  const key = await deriveMasterKey(masterPassword, salt, KDF_ITERATIONS);
  const now = new Date().toISOString();
  const record = await sealEntries([], key, {
    version: 1,
    salt: bytesToBase64(salt),
    iv: '',
    ciphertext: '',
    iterations: KDF_ITERATIONS,
    createdAt: now,
    updatedAt: now,
  });

  return { key, record };
}

async function createVaultRecordFromPassword(entries: VaultEntry[], password: string) {
  const salt = randomBytes(16);
  const key = await deriveMasterKey(password, salt, KDF_ITERATIONS);
  const now = new Date().toISOString();
  const record = await sealEntries(entries, key, {
    version: 1,
    salt: bytesToBase64(salt),
    iv: '',
    ciphertext: '',
    iterations: KDF_ITERATIONS,
    createdAt: now,
    updatedAt: now,
  });

  return { key, record };
}

function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(24);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return raw.match(/.{1,4}/g)?.join('-') ?? raw;
}

function normalizeRecoveryCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.match(/.{1,4}/g)?.join('-') ?? compact;
}

function normalizeDraft(draft: DraftEntry, existing?: VaultEntry): VaultEntry {
  const now = new Date().toISOString();
  const url = draft.url.trim();

  return {
    id: existing?.id ?? makeId(),
    service: draft.service.trim(),
    url: url && !/^https?:\/\//i.test(url) ? `https://${url}` : url,
    username: draft.username.trim(),
    password: draft.password,
    notes: draft.notes.trim(),
    category: draft.category,
    tags: draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function draftFromEntry(entry: VaultEntry | null): DraftEntry {
  if (!entry) return emptyDraft;

  return {
    service: entry.service,
    url: entry.url,
    username: entry.username,
    password: entry.password,
    notes: entry.notes,
    category: entry.category,
    tags: entry.tags.join(', '),
  };
}

function scorePassword(password: string) {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 18) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (new Set(password).size > Math.max(8, password.length * 0.55)) score += 1;

  return Math.min(score, 5);
}

function strengthLabel(score: number) {
  if (score <= 1) return 'Débil';
  if (score === 2) return 'Mejorable';
  if (score === 3) return 'Correcta';
  if (score === 4) return 'Fuerte';
  return 'Muy fuerte';
}

function generatePassword(length: number) {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%&*?-_=+';
  const groups = [lower, upper, numbers, symbols];
  const all = groups.join('');
  const pick = (source: string) => source[randomBytes(1)[0] % source.length];
  const password = groups.map(pick);

  while (password.length < length) {
    password.push(pick(all));
  }

  const shuffleBytes = randomBytes(password.length);
  return password
    .map((character, index) => ({ character, weight: shuffleBytes[index] }))
    .sort((left, right) => left.weight - right.weight)
    .map((item) => item.character)
    .join('');
}

function formatDate(value: string) {
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function getStoredThemeMode(): ThemeMode {
  const stored = getStoredValue(THEME_MODE_KEY, LEGACY_THEME_MODE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredAccent(): AccentId {
  const stored = getStoredValue(ACCENT_KEY, LEGACY_ACCENT_KEY);
  return accentOptions.some((accent) => accent.id === stored) ? (stored as AccentId) : 'forest';
}

function getStoredBackground(): BackgroundId {
  const stored = getStoredValue(BACKGROUND_KEY, LEGACY_BACKGROUND_KEY);
  return backgroundOptions.some((background) => background.id === stored) ? (stored as BackgroundId) : 'grid';
}

function supportsViewTransition() {
  return 'startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runThemeTransition(action: () => void, event?: MouseEvent<HTMLElement>) {
  const x = event?.clientX ?? window.innerWidth - 48;
  const y = event?.clientY ?? 48;

  document.documentElement.style.setProperty('--theme-x', `${x}px`);
  document.documentElement.style.setProperty('--theme-y', `${y}px`);

  if (!supportsViewTransition()) {
    action();
    return;
  }

  (document as Document & { startViewTransition: (callback: () => void) => void }).startViewTransition(action);
}

function App() {
  const [vaultId, setVaultId] = useState(() => getStoredValue(VAULT_ID_KEY, LEGACY_VAULT_ID_KEY));
  const [record, setRecord] = useState(() => parseVaultRecord(getStoredValue(STORAGE_KEY, LEGACY_STORAGE_KEY)));
  const [mode, setMode] = useState<AuthMode>(() => (vaultId || record ? 'locked' : 'setup'));
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [accentId, setAccentId] = useState<AccentId>(getStoredAccent);
  const [backgroundId, setBackgroundId] = useState<BackgroundId>(getStoredBackground);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('vault');
  const [account, setAccount] = useState<AccountDto | null>(null);
  const [recovery, setRecovery] = useState<VaultRecovery>({ recoveryEmail: '', recoveryHint: '', recoveryEnabled: false });
  const [recoveryRecord, setRecoveryRecord] = useState<VaultRecord | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<CryptoKey | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState('');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryMasterPassword, setRecoveryMasterPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'Todas'>('Todas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorEntry, setEditorEntry] = useState<VaultEntry | null | undefined>(undefined);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
    root.dataset.accent = accentId;
    root.dataset.background = backgroundId;
    root.classList.toggle('dark', themeMode === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMode === 'dark' ? '#111312' : '#f5f7f4');
    localStorage.setItem(THEME_MODE_KEY, themeMode);
    localStorage.setItem(ACCENT_KEY, accentId);
    localStorage.setItem(BACKGROUND_KEY, backgroundId);
  }, [accentId, backgroundId, themeMode]);

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !entries.some((entry) => entry.id === selectedId)) {
      setSelectedId(entries[0].id);
    }
  }, [entries, selectedId]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesCategory = categoryFilter === 'Todas' || entry.category === categoryFilter;
      const searchable = [entry.service, entry.url, entry.username, entry.category, entry.tags.join(' ')]
        .join(' ')
        .toLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [categoryFilter, entries, query]);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  const health = useMemo(() => {
    const weak = entries.filter((entry) => scorePassword(entry.password) < 3).length;
    const repeated = entries.length - new Set(entries.map((entry) => entry.password)).size;
    const withoutUrl = entries.filter((entry) => !entry.url).length;
    const penalty = entries.length ? (weak * 18 + repeated * 20 + withoutUrl * 6) / entries.length : 0;

    return {
      weak,
      repeated,
      withoutUrl,
      score: entries.length ? Math.max(0, Math.round(100 - penalty)) : 0,
    };
  }, [entries]);

  function showToast(message: string, tone: Toast['tone'] = 'success') {
    setToast({ id: Date.now(), message, tone });
  }

  function requestConfirm(options: Omit<ConfirmDialogState, 'id' | 'onResolve'>) {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({
        id: Date.now(),
        ...options,
        onResolve: resolve,
      });
    });
  }

  function resolveConfirmDialog(confirmed: boolean) {
    setConfirmDialog((current) => {
      current?.onResolve(confirmed);
      return null;
    });
  }

  function currentSettings(): VaultSettings {
    return { themeMode, accentId, backgroundId };
  }

  function applyRemoteVault(remoteVault: {
    vaultId: string;
    record: VaultRecord;
    recoveryRecord: VaultRecord | null;
    settings: VaultSettings;
    recovery: VaultRecovery;
    accountId: string | null;
  }) {
    localStorage.setItem(VAULT_ID_KEY, remoteVault.vaultId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteVault.record));
    setVaultId(remoteVault.vaultId);
    setRecord(remoteVault.record);
    setRecovery(remoteVault.recovery);
    setRecoveryRecord(remoteVault.recoveryRecord);
    setThemeMode(remoteVault.settings.themeMode);
    setAccentId(remoteVault.settings.accentId);
    setBackgroundId(remoteVault.settings.backgroundId);
    if (remoteVault.accountId) {
      void getAccount(remoteVault.accountId).then(setAccount).catch(() => setAccount(null));
    } else {
      setAccount(null);
    }
  }

  function handleThemeToggle(event: MouseEvent<HTMLButtonElement>) {
    const nextThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    runThemeTransition(() => {
      setThemeMode(nextThemeMode);
    }, event);
    void persistSettings({ themeMode: nextThemeMode, accentId, backgroundId });
  }

  function handleAccentChange(nextAccent: AccentId, event: MouseEvent<HTMLButtonElement>) {
    if (nextAccent === accentId) return;

    runThemeTransition(() => {
      setAccentId(nextAccent);
    }, event);
    void persistSettings({ themeMode, accentId: nextAccent, backgroundId });
  }

  function handleBackgroundChange(nextBackground: BackgroundId, event: MouseEvent<HTMLButtonElement>) {
    if (nextBackground === backgroundId) return;

    runThemeTransition(() => {
      setBackgroundId(nextBackground);
    }, event);
    void persistSettings({ themeMode, accentId, backgroundId: nextBackground });
  }

  async function persistSettings(settings: VaultSettings) {
    if (!vaultId) return;

    try {
      const remoteVault = await updateRemoteVaultSettings(vaultId, settings);
      applyRemoteVault(remoteVault);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  }

  async function handleSaveAccount(payload: AccountPayload) {
    if (!vaultId) throw new Error('La bóveda todavía no está sincronizada.');

    const savedAccount = account ? await updateAccount(account.id, payload) : await createAccount(payload);
    const remoteVault = await attachAccountToVault(vaultId, savedAccount.id);
    setAccount(savedAccount);
    applyRemoteVault(remoteVault);
    showToast(account ? 'Usuario actualizado.' : 'Usuario creado.');
  }

  async function handleDeleteAccount() {
    if (!account) return;

    const confirmed = await requestConfirm({
      title: 'Eliminar usuario',
      message: `Se eliminará el perfil ${account.username}. La bóveda seguirá existiendo, pero quedará sin usuario asociado.`,
      tone: 'danger',
      confirmLabel: 'Eliminar usuario',
    });
    if (!confirmed) return;

    await deleteAccount(account.id);
    setAccount(null);
    showToast('Usuario eliminado.');
  }

  async function handleGenerateRecovery(metadata: Pick<VaultRecovery, 'recoveryEmail' | 'recoveryHint'>) {
    if (!vaultId) throw new Error('La bóveda todavía no está sincronizada.');

    const code = generateRecoveryCode();
    const nextRecovery = await createVaultRecordFromPassword(entries, code);
    const remoteVault = await updateRemoteVaultRecovery(vaultId, nextRecovery.record, metadata);
    setRecoveryKey(nextRecovery.key);
    setNewRecoveryCode(code);
    applyRemoteVault(remoteVault);
    showToast('Código de recuperación generado.');
  }

  async function handleCreateVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');

    if (masterPassword.length < 10) {
      setAuthError('Usa al menos 10 caracteres para la contraseña maestra.');
      return;
    }

    if (masterPassword !== confirmPassword) {
      setAuthError('Las contraseñas maestras no coinciden.');
      return;
    }

    setIsBusy(true);
    try {
      const nextVault = await createEmptyVault(masterPassword);
      const remoteVault = await createRemoteVault(nextVault.record, currentSettings());
      applyRemoteVault(remoteVault);
      setVaultKey(nextVault.key);
      setEntries([]);
      setMode('unlocked');
      setMasterPassword('');
      setConfirmPassword('');
      showToast('Bóveda creada en Supabase.');
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');

    setIsBusy(true);
    try {
      let savedRecord = parseVaultRecord(getStoredValue(STORAGE_KEY, LEGACY_STORAGE_KEY));

      if (vaultId) {
        const remoteVault = await getRemoteVault(vaultId);
        savedRecord = remoteVault.record;
        applyRemoteVault(remoteVault);
      }

      if (!savedRecord) {
        setMode('setup');
        setAuthError('No encontré una bóveda válida para este dispositivo.');
        return;
      }

      const key = await deriveMasterKey(masterPassword, base64ToBytes(savedRecord.salt), savedRecord.iterations);
      const openedEntries = await openEntries(savedRecord, key);
      setVaultKey(key);
      setRecord(savedRecord);
      setEntries(openedEntries);
      setMode('unlocked');
      setMasterPassword('');
      setSelectedId(openedEntries[0]?.id ?? null);
      showToast('Bóveda abierta.');
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message.includes('Vault') || message.includes('API') ? message : 'La contraseña maestra no abrió la bóveda.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRecoverVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');

    const normalizedCode = normalizeRecoveryCode(recoveryCode);

    if (!vaultId && !recoveryIdentifier.trim()) {
      setAuthError('Escribe el correo o usuario de recuperación para encontrar tu bóveda.');
      return;
    }

    if (normalizedCode.length < 10) {
      setAuthError('Escribe el código de recuperación que generaste en ajustes.');
      return;
    }

    if (recoveryMasterPassword.length < 10) {
      setAuthError('La nueva contraseña maestra necesita al menos 10 caracteres.');
      return;
    }

    if (recoveryMasterPassword !== recoveryConfirmPassword) {
      setAuthError('La confirmación de la nueva contraseña maestra no coincide.');
      return;
    }

    setIsBusy(true);
    try {
      const remoteVault = recoveryIdentifier.trim()
        ? await findRecoveryVault(recoveryIdentifier)
        : await getRemoteVault(vaultId ?? '');

      if (!remoteVault.recoveryRecord) {
        throw new Error('Esta bóveda no tiene recuperación activa.');
      }

      const emergencyKey = await deriveMasterKey(
        normalizedCode,
        base64ToBytes(remoteVault.recoveryRecord.salt),
        remoteVault.recoveryRecord.iterations,
      );
      const openedEntries = await openEntries(remoteVault.recoveryRecord, emergencyKey);
      const nextMasterVault = await createVaultRecordFromPassword(openedEntries, recoveryMasterPassword);
      const updatedMasterVault = await updateRemoteVault(remoteVault.vaultId, nextMasterVault.record);
      const refreshedRecoveryRecord = await sealEntries(openedEntries, emergencyKey, remoteVault.recoveryRecord);
      const refreshedVault = await updateRemoteVaultRecovery(
        remoteVault.vaultId,
        refreshedRecoveryRecord,
        updatedMasterVault.recovery,
      );

      applyRemoteVault(refreshedVault);
      setVaultKey(nextMasterVault.key);
      setRecoveryKey(emergencyKey);
      setEntries(openedEntries);
      setMode('unlocked');
      setSelectedId(openedEntries[0]?.id ?? null);
      setMasterPassword('');
      setRecoveryIdentifier('');
      setRecoveryCode('');
      setRecoveryMasterPassword('');
      setRecoveryConfirmPassword('');
      showToast('Bóveda recuperada y contraseña maestra renovada.');
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(
        message.includes('Recovery vault') || message.includes('Invalid recovery') || message.includes('API')
          ? message
          : 'El código de recuperación no abrió la bóveda.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function persistEntries(nextEntries: VaultEntry[]) {
    if (!vaultKey || !record) throw new Error('La bóveda está bloqueada.');

    const nextRecord = await sealEntries(nextEntries, vaultKey, record);
    const remoteVault = vaultId ? await updateRemoteVault(vaultId, nextRecord) : await createRemoteVault(nextRecord, currentSettings());
    applyRemoteVault(remoteVault);
    if (vaultId && recoveryKey) {
      const nextRecoveryRecord = await sealEntries(nextEntries, recoveryKey, recoveryRecord ?? undefined);
      const updatedRecovery = await updateRemoteVaultRecovery(vaultId, nextRecoveryRecord, recovery);
      applyRemoteVault(updatedRecovery);
    }
    setEntries(nextEntries);
  }

  async function handleSaveEntry(draft: DraftEntry, id?: string) {
    const existing = entries.find((entry) => entry.id === id);
    const normalized = normalizeDraft(draft, existing);
    const nextEntries = existing
      ? entries.map((entry) => (entry.id === existing.id ? normalized : entry))
      : [normalized, ...entries];

    setIsBusy(true);
    try {
      await persistEntries(nextEntries);
      setEditorEntry(undefined);
      setSelectedId(normalized.id);
      showToast(existing ? 'Clave actualizada.' : 'Clave guardada.');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;

    const confirmed = await requestConfirm({
      title: 'Eliminar clave',
      message: `La clave de ${entry.service} se quitará de la bóveda cifrada.`,
      tone: 'danger',
      confirmLabel: 'Eliminar clave',
    });
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const nextEntries = entries.filter((item) => item.id !== entryId);
      await persistEntries(nextEntries);
      setRevealedIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      showToast('Clave eliminada.');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsBusy(false);
    }
  }

  function handleLock() {
    setVaultKey(null);
    setEntries([]);
    setSelectedId(null);
    setRevealedIds(new Set());
    setMode(vaultId || record ? 'locked' : 'setup');
    setMasterPassword('');
    setRecoveryCode('');
    setRecoveryMasterPassword('');
    setRecoveryConfirmPassword('');
  }

  async function handleCopy(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
      showToast('Copiado al portapapeles.');
    } catch {
      showToast('No pude copiar desde este navegador.', 'error');
    }
  }

  function toggleReveal(entryId: string) {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function handleExportEncryptedVault() {
    if (!record) return;

    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${brand.exportSlug}-${new Date().toISOString().slice(0, 10)}.vault.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Bóveda cifrada exportada.');
  }

  async function handleExportExcel(selectedEntries: VaultEntry[]) {
    if (!selectedEntries.length) {
      showToast('Selecciona al menos una clave para exportar.', 'error');
      return;
    }

    const confirmed = await requestConfirm({
      title: 'Exportar Excel sin cifrado',
      message:
        'El archivo Excel tendrá contraseñas visibles. Guárdalo solo en un lugar seguro y elimínalo cuando ya no lo necesites.',
      tone: 'danger',
      confirmLabel: 'Descargar Excel',
    });
    if (!confirmed) return;

    try {
      const writeXlsxFile = (await import('write-excel-file/browser')).default;
      const rows = selectedEntries.map((entry) => ({
        Servicio: entry.service,
        Usuario: entry.username,
        Contraseña: entry.password,
        Sitio: entry.url,
        Categoría: entry.category,
        Etiquetas: entry.tags.join(', '),
        Notas: entry.notes,
        'Creada el': formatDate(entry.createdAt),
        'Actualizada el': formatDate(entry.updatedAt),
      }));
      const headers = [
        'Servicio',
        'Usuario',
        'Contraseña',
        'Sitio',
        'Categoría',
        'Etiquetas',
        'Notas',
        'Creada el',
        'Actualizada el',
      ];
      const data = [
        headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
        ...rows.map((row) => headers.map((header) => ({ value: String(row[header as keyof typeof row] ?? '') }))),
      ];

      await writeXlsxFile(data, {
        sheet: 'Claves',
        columns: [
          { width: 28 },
          { width: 30 },
          { width: 34 },
          { width: 36 },
          { width: 16 },
          { width: 28 },
          { width: 48 },
          { width: 22 },
          { width: 22 },
        ],
      }).toFile(`${brand.exportSlug}-claves-${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast(`Excel exportado con ${selectedEntries.length} claves.`);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isVaultRecord(parsed)) {
        throw new Error(`El archivo no parece una bóveda de ${brand.name}.`);
      }

      if (record) {
        const confirmed = await requestConfirm({
          title: 'Importar otra bóveda',
          message: 'Esto reemplazará la bóveda asociada a este dispositivo por el archivo cifrado que elegiste.',
          tone: 'danger',
          confirmLabel: 'Reemplazar bóveda',
        });
        if (!confirmed) return;
      }

      const remoteVault = await createRemoteVault(parsed, currentSettings());
      applyRemoteVault(remoteVault);
      setVaultKey(null);
      setEntries([]);
      setSelectedId(null);
      setRevealedIds(new Set());
      setMode('locked');
      showToast('Bóveda importada a Supabase.');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  }

  if (mode !== 'unlocked') {
    return (
      <>
        <AuthScreen
          mode={mode}
          masterPassword={masterPassword}
          confirmPassword={confirmPassword}
          recoveryIdentifier={recoveryIdentifier}
          recoveryCode={recoveryCode}
          recoveryMasterPassword={recoveryMasterPassword}
          recoveryConfirmPassword={recoveryConfirmPassword}
          authError={authError}
          isBusy={isBusy}
          hasVault={Boolean(vaultId || record)}
          themeMode={themeMode}
          accentId={accentId}
          onMasterPasswordChange={setMasterPassword}
          onConfirmPasswordChange={setConfirmPassword}
          onRecoveryIdentifierChange={setRecoveryIdentifier}
          onRecoveryCodeChange={setRecoveryCode}
          onRecoveryMasterPasswordChange={setRecoveryMasterPassword}
          onRecoveryConfirmPasswordChange={setRecoveryConfirmPassword}
          onCreateVault={handleCreateVault}
          onUnlock={handleUnlock}
          onRecoverVault={handleRecoverVault}
          onImport={() => importInputRef.current?.click()}
          onThemeToggle={handleThemeToggle}
          onAccentChange={handleAccentChange}
        />
        <input ref={importInputRef} className="hidden" type="file" accept="application/json" onChange={handleImport} />
        <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmDialog} />
        <ToastRack toast={toast} />
      </>
    );
  }

  return (
    <>
      <VaultScreen
        entries={entries}
        filteredEntries={filteredEntries}
        selectedEntry={selectedEntry}
        query={query}
        categoryFilter={categoryFilter}
        health={health}
        revealedIds={revealedIds}
        copiedId={copiedId}
        isBusy={isBusy}
        themeMode={themeMode}
        accentId={accentId}
        backgroundId={backgroundId}
        activeScreen={activeScreen}
        account={account}
        recovery={recovery}
        newRecoveryCode={newRecoveryCode}
        onQueryChange={setQuery}
        onCategoryChange={setCategoryFilter}
        onSelectEntry={setSelectedId}
        onNewEntry={() => setEditorEntry(null)}
        onEditEntry={setEditorEntry}
        onDeleteEntry={handleDeleteEntry}
        onToggleReveal={toggleReveal}
        onCopy={handleCopy}
        onExportExcel={handleExportExcel}
        onExportEncrypted={handleExportEncryptedVault}
        onImport={() => importInputRef.current?.click()}
        onLock={handleLock}
        onThemeToggle={handleThemeToggle}
        onAccentChange={handleAccentChange}
        onBackgroundChange={handleBackgroundChange}
        onActiveScreenChange={setActiveScreen}
        onSaveAccount={handleSaveAccount}
        onDeleteAccount={handleDeleteAccount}
        onGenerateRecovery={handleGenerateRecovery}
      />
      {editorEntry !== undefined && (
        <EntryEditor
          initial={editorEntry}
          isBusy={isBusy}
          onClose={() => setEditorEntry(undefined)}
          onSave={handleSaveEntry}
        />
      )}
      <input ref={importInputRef} className="hidden" type="file" accept="application/json" onChange={handleImport} />
      <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmDialog} />
      <ToastRack toast={toast} />
    </>
  );
}

type AuthScreenProps = {
  mode: AuthMode;
  masterPassword: string;
  confirmPassword: string;
  recoveryIdentifier: string;
  recoveryCode: string;
  recoveryMasterPassword: string;
  recoveryConfirmPassword: string;
  authError: string;
  isBusy: boolean;
  hasVault: boolean;
  themeMode: ThemeMode;
  accentId: AccentId;
  onMasterPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onRecoveryIdentifierChange: (value: string) => void;
  onRecoveryCodeChange: (value: string) => void;
  onRecoveryMasterPasswordChange: (value: string) => void;
  onRecoveryConfirmPasswordChange: (value: string) => void;
  onCreateVault: (event: FormEvent<HTMLFormElement>) => void;
  onUnlock: (event: FormEvent<HTMLFormElement>) => void;
  onRecoverVault: (event: FormEvent<HTMLFormElement>) => void;
  onImport: () => void;
  onThemeToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onAccentChange: (accentId: AccentId, event: MouseEvent<HTMLButtonElement>) => void;
};

function AuthScreen({
  mode,
  masterPassword,
  confirmPassword,
  recoveryIdentifier,
  recoveryCode,
  recoveryMasterPassword,
  recoveryConfirmPassword,
  authError,
  isBusy,
  hasVault,
  themeMode,
  accentId,
  onMasterPasswordChange,
  onConfirmPasswordChange,
  onRecoveryIdentifierChange,
  onRecoveryCodeChange,
  onRecoveryMasterPasswordChange,
  onRecoveryConfirmPasswordChange,
  onCreateVault,
  onUnlock,
  onRecoverVault,
  onImport,
  onThemeToggle,
  onAccentChange,
}: AuthScreenProps) {
  const isSetup = mode === 'setup';
  const strength = scorePassword(masterPassword);
  const recoveryStrength = scorePassword(recoveryMasterPassword);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  return (
    <main className="app-shell relative min-h-[100dvh] overflow-hidden text-zinc-950">
      <div className="grain-layer" />
      <div className="absolute left-[7vw] top-[9vh] hidden h-44 w-44 rounded-full border border-emerald-900/10 lg:block" />
      <div className="absolute bottom-10 right-[8vw] h-28 w-28 rounded-full border border-zinc-900/10" />

      <div className="relative mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="flex min-h-[48vh] flex-col justify-between py-4 lg:min-h-0 lg:py-9">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="brand-mark">
                <Vault size={20} weight="duotone" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">{brand.name}</p>
                <p className="text-xs text-zinc-500">{brand.tagline}</p>
              </div>
            </div>
            <ThemeControls
              accentId={accentId}
              themeMode={themeMode}
              compact
              onAccentChange={onAccentChange}
              onThemeToggle={onThemeToggle}
            />
          </div>

          <div className="max-w-[680px] py-12 lg:py-20">
            <p className="mb-5 w-fit rounded-md border border-emerald-900/15 bg-emerald-900/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950">
              AES-GCM + PBKDF2
            </p>
            <h1 className="max-w-[11ch] text-5xl font-semibold leading-none tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
              Una llave para todas tus claves.
            </h1>
            <p className="mt-6 max-w-[58ch] text-base leading-relaxed text-zinc-600">
              Guarda sitios, usuarios, notas y contraseñas dentro de una bóveda que solo se abre con tu contraseña maestra.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricLine label="Cifrado" value="AES-GCM 256" />
            <MetricLine label="Derivación" value={`${KDF_ITERATIONS.toLocaleString('es-MX')} rondas`} />
          </div>
        </section>

        <section className="flex items-center justify-center pb-8 lg:pb-0">
          <div className="auth-panel w-full max-w-[540px]">
            <form onSubmit={isSetup ? onCreateVault : onUnlock}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">{isSetup ? 'Crear bóveda' : 'Desbloquear'}</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                    {isSetup ? 'Define tu contraseña maestra' : 'Escribe tu contraseña maestra'}
                  </h2>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700">
                  <LockKey size={21} weight="duotone" />
                </span>
              </div>

              <div className="mt-8 space-y-5">
                <FieldBlock label="Contraseña maestra" helper="No se guarda en texto plano.">
                  <input
                    className="field-input"
                    type="password"
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    value={masterPassword}
                    onChange={(event) => onMasterPasswordChange(event.target.value)}
                    placeholder="Mínimo 10 caracteres"
                    required
                  />
                </FieldBlock>

                {isSetup && (
                  <>
                    <StrengthMeter score={strength} />
                    <FieldBlock label="Confirmar contraseña" helper="Debe coincidir exactamente.">
                      <input
                        className="field-input"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => onConfirmPasswordChange(event.target.value)}
                        placeholder="Repite la contraseña maestra"
                        required
                      />
                    </FieldBlock>
                  </>
                )}

                {authError && (
                  <div className="inline-flex w-full items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <WarningCircle size={18} weight="duotone" />
                    <span>{authError}</span>
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button className="primary-button flex-1" type="submit" disabled={isBusy}>
                  <ShieldCheck size={19} weight="duotone" />
                  <span>{isBusy ? 'Procesando' : isSetup ? 'Crear bóveda' : 'Abrir bóveda'}</span>
                </button>
                <button className="secondary-button" type="button" onClick={onImport}>
                  <UploadSimple size={18} />
                  <span>Importar</span>
                </button>
              </div>

              {!isSetup && !hasVault && (
                <p className="mt-5 text-sm text-zinc-500">
                  No hay una bóveda local. Puedes buscarla con tu usuario o correo si activaste recuperación.
                </p>
              )}
            </form>

            {!isSetup && (
              <div className="recovery-entry mt-6">
                <button
                  className="recovery-trigger"
                  type="button"
                  aria-expanded={isRecoveryOpen}
                  onClick={() => setIsRecoveryOpen((current) => !current)}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-900/[0.08] text-emerald-950">
                    <Lifebuoy size={18} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-zinc-900">Recuperar acceso</span>
                    <span className="block text-xs leading-relaxed text-zinc-500">
                      Usa tu correo o usuario y el código de emergencia.
                    </span>
                  </span>
                </button>

                {isRecoveryOpen && (
                  <form className="recovery-form" onSubmit={onRecoverVault}>
                    <FieldBlock label="Correo o usuario" helper={hasVault ? 'Opcional si esta bóveda ya está en este dispositivo.' : 'Necesario para buscar la bóveda en Supabase.'}>
                      <input
                        className="field-input"
                        value={recoveryIdentifier}
                        onChange={(event) => onRecoveryIdentifierChange(event.target.value)}
                        placeholder="usuario o correo@dominio.com"
                        autoComplete="username"
                      />
                    </FieldBlock>
                    <FieldBlock label="Código de recuperación" helper="El código se generó en Ajustes y nunca se muestra otra vez.">
                      <input
                        className="field-input font-mono"
                        value={recoveryCode}
                        onChange={(event) => onRecoveryCodeChange(event.target.value)}
                        placeholder="ABCD-EFGH-IJKL"
                        autoComplete="one-time-code"
                        required
                      />
                    </FieldBlock>
                    <FieldBlock label="Nueva contraseña maestra" helper="Esta reemplaza la anterior después de abrir la bóveda.">
                      <input
                        className="field-input"
                        type="password"
                        value={recoveryMasterPassword}
                        onChange={(event) => onRecoveryMasterPasswordChange(event.target.value)}
                        placeholder="Mínimo 10 caracteres"
                        autoComplete="new-password"
                        required
                      />
                    </FieldBlock>
                    <StrengthMeter score={recoveryStrength} compact />
                    <FieldBlock label="Confirmar nueva contraseña">
                      <input
                        className="field-input"
                        type="password"
                        value={recoveryConfirmPassword}
                        onChange={(event) => onRecoveryConfirmPasswordChange(event.target.value)}
                        placeholder="Repite la nueva maestra"
                        autoComplete="new-password"
                        required
                      />
                    </FieldBlock>
                    <button className="secondary-button w-full justify-center" type="submit" disabled={isBusy}>
                      <Key size={18} weight="duotone" />
                      <span>{isBusy ? 'Recuperando' : 'Renovar contraseña maestra'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type ThemeControlsProps = {
  themeMode: ThemeMode;
  accentId: AccentId;
  compact?: boolean;
  onThemeToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onAccentChange: (accentId: AccentId, event: MouseEvent<HTMLButtonElement>) => void;
};

function ThemeControls({ themeMode, accentId, compact = false, onThemeToggle, onAccentChange }: ThemeControlsProps) {
  return (
    <div className={`theme-controls ${compact ? 'is-compact' : ''}`}>
      <button
        className={`theme-toggle ${themeMode === 'dark' ? 'is-dark' : ''}`}
        type="button"
        aria-label={themeMode === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
        title={themeMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        onClick={onThemeToggle}
      >
        <span className="theme-toggle-track">
          <span className="theme-toggle-thumb">
            {themeMode === 'dark' ? <MoonStars size={16} weight="duotone" /> : <Sun size={16} weight="duotone" />}
          </span>
        </span>
      </button>

      <div className="accent-picker" aria-label="Color de acento">
        <Palette size={17} weight="duotone" />
        <div className="accent-swatches">
          {accentOptions.map((accent) => (
            <button
              key={accent.id}
              className={`accent-swatch ${accent.id === accentId ? 'is-active' : ''}`}
              type="button"
              title={accent.name}
              aria-label={accent.name}
              aria-pressed={accent.id === accentId}
              style={{ '--swatch': accent.swatch } as CSSProperties}
              onClick={(event) => onAccentChange(accent.id, event)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type ProfileAvatarProps = {
  profile: Pick<AccountPayload, 'username' | 'displayName' | 'avatarUrl'> | AccountDto | null;
  large?: boolean;
};

function getProfileInitials(profile: ProfileAvatarProps['profile']) {
  const source = profile?.displayName || profile?.username || brand.name;
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || 'LC';
}

function ProfileAvatar({ profile, large = false }: ProfileAvatarProps) {
  const avatarUrl = profile?.avatarUrl?.trim();

  return (
    <span className={`profile-avatar ${large ? 'is-large' : ''}`}>
      {avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" /> : <span>{getProfileInitials(profile)}</span>}
    </span>
  );
}

type VaultScreenProps = {
  entries: VaultEntry[];
  filteredEntries: VaultEntry[];
  selectedEntry: VaultEntry | null;
  query: string;
  categoryFilter: Category | 'Todas';
  health: { weak: number; repeated: number; withoutUrl: number; score: number };
  revealedIds: Set<string>;
  copiedId: string | null;
  isBusy: boolean;
  themeMode: ThemeMode;
  accentId: AccentId;
  backgroundId: BackgroundId;
  activeScreen: ActiveScreen;
  account: AccountDto | null;
  recovery: VaultRecovery;
  newRecoveryCode: string;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: Category | 'Todas') => void;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onEditEntry: (entry: VaultEntry) => void;
  onDeleteEntry: (id: string) => void;
  onToggleReveal: (id: string) => void;
  onCopy: (value: string, id: string) => void;
  onExportExcel: (entries: VaultEntry[]) => Promise<void>;
  onExportEncrypted: () => void;
  onImport: () => void;
  onLock: () => void;
  onThemeToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onAccentChange: (accentId: AccentId, event: MouseEvent<HTMLButtonElement>) => void;
  onBackgroundChange: (backgroundId: BackgroundId, event: MouseEvent<HTMLButtonElement>) => void;
  onActiveScreenChange: (screen: ActiveScreen) => void;
  onSaveAccount: (account: AccountPayload) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onGenerateRecovery: (metadata: Pick<VaultRecovery, 'recoveryEmail' | 'recoveryHint'>) => Promise<void>;
};

type VaultRailProps = {
  activeScreen: ActiveScreen;
  account: AccountDto | null;
  onActiveScreenChange: (screen: ActiveScreen) => void;
  onImport: () => void;
  onLock: () => void;
  onNewEntry: () => void;
};

function VaultRail({
  activeScreen,
  account,
  onActiveScreenChange,
  onImport,
  onLock,
  onNewEntry,
}: VaultRailProps) {
  const profileName = account?.displayName || account?.username || 'Perfil';

  return (
    <aside className="nav-rail surface-panel" aria-label="Menú lateral">
      <button className="rail-brand" type="button" title="Bóveda" onClick={() => onActiveScreenChange('vault')}>
        <span className="brand-mark">
          <Vault size={20} weight="duotone" />
        </span>
        <span>{brand.name}</span>
      </button>

      <nav className="rail-actions" aria-label="Acciones de bóveda">
        <button
          className={`rail-button ${activeScreen === 'vault' ? 'is-active' : ''}`}
          type="button"
          title="Bóveda"
          onClick={() => onActiveScreenChange('vault')}
        >
          <Vault size={20} weight="duotone" />
          <span>Bóveda</span>
        </button>
        <button className="rail-button" type="button" title="Nueva clave" onClick={onNewEntry}>
          <Plus size={20} weight="bold" />
          <span>Nueva</span>
        </button>
        <button className="rail-button" type="button" title="Importar" onClick={onImport}>
          <UploadSimple size={20} />
          <span>Importar</span>
        </button>
        <button
          className={`rail-button ${activeScreen === 'export' ? 'is-active' : ''}`}
          type="button"
          title="Exportar"
          onClick={() => onActiveScreenChange('export')}
        >
          <DownloadSimple size={20} />
          <span>Exportar</span>
        </button>
        <button className="rail-button" type="button" title="Bloquear" onClick={onLock}>
          <SignOut size={20} />
          <span>Salir</span>
        </button>
      </nav>

      <button
        className={`profile-button ${activeScreen === 'settings' ? 'is-active' : ''}`}
        type="button"
        title={`Ajustes de ${profileName}`}
        onClick={() => onActiveScreenChange('settings')}
      >
        <ProfileAvatar profile={account} />
        <span>Perfil</span>
      </button>
    </aside>
  );
}

type VaultFooterProps = {
  activeScreen: ActiveScreen;
  entriesCount: number;
  account: AccountDto | null;
  recoveryEnabled: boolean;
  onActiveScreenChange: (screen: ActiveScreen) => void;
};

function VaultFooter({
  activeScreen,
  entriesCount,
  account,
  recoveryEnabled,
  onActiveScreenChange,
}: VaultFooterProps) {
  const profileLabel = account?.displayName || account?.username || 'Perfil local';
  const footerLinks: Array<{ screen: ActiveScreen; label: string; icon: ReactNode }> = [
    { screen: 'vault', label: 'Bóveda', icon: <Vault size={16} weight="duotone" /> },
    { screen: 'export', label: 'Exportar', icon: <DownloadSimple size={16} weight="duotone" /> },
    { screen: 'settings', label: 'Ajustes', icon: <GearSix size={16} weight="duotone" /> },
  ];

  return (
    <footer className="vault-footer surface-panel" aria-label="Información de Veyra Vault">
      <div className="footer-brand">
        <span className="brand-mark footer-brand-mark">
          <Vault size={18} weight="duotone" />
        </span>
        <div className="min-w-0">
          <p className="section-label">{brand.product}</p>
          <p className="footer-copy">
            Cifrado en el navegador. La contraseña maestra nunca se envía al servidor.
          </p>
        </div>
      </div>

      <div className="footer-status" aria-label="Estado de bóveda">
        <span>
          <strong>{entriesCount}</strong>
          <small>claves</small>
        </span>
        <span>
          <strong>AES-GCM 256</strong>
          <small>cifrado</small>
        </span>
        <span>
          <strong>{recoveryEnabled ? 'Activa' : 'Opcional'}</strong>
          <small>recuperación</small>
        </span>
        <span>
          <strong>{profileLabel}</strong>
          <small>perfil</small>
        </span>
      </div>

      <nav className="footer-nav" aria-label="Navegación secundaria">
        {footerLinks.map((link) => (
          <button
            key={link.screen}
            className={`footer-nav-button ${activeScreen === link.screen ? 'is-active' : ''}`}
            type="button"
            aria-current={activeScreen === link.screen ? 'page' : undefined}
            onClick={() => onActiveScreenChange(link.screen)}
          >
            {link.icon}
            <span>{link.label}</span>
          </button>
        ))}
      </nav>
    </footer>
  );
}

function VaultScreen({
  entries,
  filteredEntries,
  selectedEntry,
  query,
  categoryFilter,
  health,
  revealedIds,
  copiedId,
  isBusy,
  themeMode,
  accentId,
  backgroundId,
  activeScreen,
  account,
  recovery,
  newRecoveryCode,
  onQueryChange,
  onCategoryChange,
  onSelectEntry,
  onNewEntry,
  onEditEntry,
  onDeleteEntry,
  onToggleReveal,
  onCopy,
  onExportExcel,
  onExportEncrypted,
  onImport,
  onLock,
  onThemeToggle,
  onAccentChange,
  onBackgroundChange,
  onActiveScreenChange,
  onSaveAccount,
  onDeleteAccount,
  onGenerateRecovery,
}: VaultScreenProps) {
  const visiblePassword = selectedEntry ? revealedIds.has(selectedEntry.id) : false;

  return (
    <main className="app-shell min-h-[100dvh] text-zinc-950">
      <div className="grain-layer" />
      <div className={`vault-layout ${activeScreen !== 'vault' ? 'is-settings' : ''}`}>
        <VaultRail
          activeScreen={activeScreen}
          account={account}
          onActiveScreenChange={onActiveScreenChange}
          onImport={onImport}
          onLock={onLock}
          onNewEntry={onNewEntry}
        />

        {activeScreen === 'vault' && (
          <aside className="vault-browser surface-panel">
            <div>
              <p className="section-label">Claves guardadas</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{entries.length} claves</h2>
            </div>

            <label className="search-shell mt-5">
              <MagnifyingGlass size={18} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar sitio, usuario o etiqueta"
              />
            </label>

            <div className="filter-grid mt-4">
              {(['Todas', ...categories] as const).map((category) => (
                <button
                  key={category}
                  className={`filter-pill ${categoryFilter === category ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onCategoryChange(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="entry-list-panel mt-4">
              <div className="entry-scroll-area">
                {filteredEntries.map((entry, index) => (
                  <button
                    key={entry.id}
                    className={`entry-row ${selectedEntry?.id === entry.id ? 'is-selected' : ''}`}
                    style={{ '--index': index } as CSSProperties}
                    type="button"
                    onClick={() => onSelectEntry(entry.id)}
                  >
                    <span className="entry-mark">{entry.service.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{entry.service}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {entry.username || entry.url || entry.category}
                      </span>
                    </span>
                  </button>
                ))}

                {!filteredEntries.length && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-zinc-800">
                      {entries.length ? 'Sin resultados' : 'Bóveda vacía'}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {entries.length ? 'Prueba con otra búsqueda.' : 'Agrega tu primera clave cifrada.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {activeScreen === 'vault' ? (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="surface-panel min-h-[calc(100dvh-2rem)] p-5 sm:p-7">
            {selectedEntry ? (
              <div className="animate-in">
                <div className="flex flex-col gap-5 border-b border-zinc-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-md border border-emerald-900/15 bg-emerald-900/[0.06] px-2.5 py-1 text-xs font-semibold text-emerald-950">
                      {selectedEntry.category}
                    </span>
                    <h1 className="mt-4 truncate text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                      {selectedEntry.service}
                    </h1>
                    <p className="mt-3 max-w-2xl truncate text-sm text-zinc-500">
                      Actualizada el {formatDate(selectedEntry.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="secondary-button" type="button" onClick={() => onEditEntry(selectedEntry)}>
                      <PencilSimple size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDeleteEntry(selectedEntry.id)}
                    >
                      <Trash size={17} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoBlock icon={<User size={19} />} label="Usuario" value={selectedEntry.username || 'Sin usuario'} />
                  <InfoBlock icon={<Globe size={19} />} label="Sitio" value={selectedEntry.url || 'Sin URL'} />
                </div>

                <div className="secret-panel mt-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-950 text-white">
                      <Key size={19} weight="duotone" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Contraseña</p>
                      <p className="mt-1 truncate font-mono text-lg text-zinc-950">
                        {visiblePassword ? selectedEntry.password : <PasswordMask length={selectedEntry.password.length} />}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="icon-button"
                      type="button"
                      title={visiblePassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => onToggleReveal(selectedEntry.id)}
                    >
                      {visiblePassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Copiar contraseña"
                      onClick={() => onCopy(selectedEntry.password, `password-${selectedEntry.id}`)}
                    >
                      {copiedId === `password-${selectedEntry.id}` ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="detail-section">
                    <p className="section-label">Notas</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {selectedEntry.notes || 'Sin notas guardadas.'}
                    </p>
                  </section>
                  <section className="detail-section">
                    <p className="section-label">Etiquetas</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedEntry.tags.length ? (
                        selectedEntry.tags.map((tag) => (
                          <span key={tag} className="tag-chip">
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">Sin etiquetas</span>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <EmptyState onNewEntry={onNewEntry} />
            )}
          </div>

          <aside className="grid gap-5 xl:grid-rows-[auto_1fr]">
            <section className="surface-panel p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="section-label">Salud de la bóveda</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">{health.score}</p>
                </div>
                <span className="status-orbit">
                  <Gauge size={24} weight="duotone" />
                </span>
              </div>
              <div className="mt-5 space-y-3">
                <HealthLine label="Débiles" value={health.weak} />
                <HealthLine label="Repetidas" value={health.repeated} />
                <HealthLine label="Sin URL" value={health.withoutUrl} />
              </div>
            </section>

            <section className="surface-panel overflow-hidden p-5">
              <p className="section-label">Actividad</p>
              <div className="mt-4 space-y-3">
                {entries.slice(0, 5).map((entry) => (
                  <button key={entry.id} className="activity-row" type="button" onClick={() => onSelectEntry(entry.id)}>
                    <span className="entry-mark small">{entry.service.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{entry.service}</span>
                      <span className="block truncate text-xs text-zinc-500">{formatDate(entry.updatedAt)}</span>
                    </span>
                  </button>
                ))}

                {!entries.length && (
                  <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
                    La actividad aparecerá al guardar claves.
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>
        ) : activeScreen === 'export' ? (
          <ExportScreen
            entries={entries}
            onExportEncrypted={onExportEncrypted}
            onExportExcel={onExportExcel}
          />
        ) : (
          <SettingsScreen
            account={account}
            recovery={recovery}
            newRecoveryCode={newRecoveryCode}
            themeMode={themeMode}
            accentId={accentId}
            backgroundId={backgroundId}
            isBusy={isBusy}
            onThemeToggle={onThemeToggle}
            onAccentChange={onAccentChange}
            onBackgroundChange={onBackgroundChange}
            onSaveAccount={onSaveAccount}
            onDeleteAccount={onDeleteAccount}
            onGenerateRecovery={onGenerateRecovery}
          />
        )}
        <VaultFooter
          activeScreen={activeScreen}
          entriesCount={entries.length}
          account={account}
          recoveryEnabled={recovery.recoveryEnabled}
          onActiveScreenChange={onActiveScreenChange}
        />
      </div>
    </main>
  );
}

type SettingsScreenProps = {
  account: AccountDto | null;
  recovery: VaultRecovery;
  newRecoveryCode: string;
  themeMode: ThemeMode;
  accentId: AccentId;
  backgroundId: BackgroundId;
  isBusy: boolean;
  onThemeToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onAccentChange: (accentId: AccentId, event: MouseEvent<HTMLButtonElement>) => void;
  onBackgroundChange: (backgroundId: BackgroundId, event: MouseEvent<HTMLButtonElement>) => void;
  onSaveAccount: (account: AccountPayload) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onGenerateRecovery: (metadata: Pick<VaultRecovery, 'recoveryEmail' | 'recoveryHint'>) => Promise<void>;
};

type ExportScreenProps = {
  entries: VaultEntry[];
  onExportEncrypted: () => void;
  onExportExcel: (entries: VaultEntry[]) => Promise<void>;
};

function ExportScreen({ entries, onExportEncrypted, onExportExcel }: ExportScreenProps) {
  const [exportQuery, setExportQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(entries.map((entry) => entry.id)));
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set(entries.map((entry) => entry.id)));
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = exportQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      if (!normalizedQuery) return true;
      return [entry.service, entry.username, entry.url, entry.category, entry.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [entries, exportQuery]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id)),
    [entries, selectedIds],
  );

  function toggleSelected(entryId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function selectVisibleEntries() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleEntries.forEach((entry) => next.add(entry.id));
      return next;
    });
  }

  async function handleExcelExport() {
    setIsExporting(true);
    try {
      await onExportExcel(selectedEntries);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="export-layout">
      <div className="surface-panel p-5 sm:p-7">
        <div className="settings-header">
          <div>
            <p className="section-label">Exportación</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Selecciona claves para Excel</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
              El archivo Excel sale descifrado para que puedas abrirlo en hojas de cálculo. Exporta solo lo necesario.
            </p>
          </div>
          <span className="status-orbit">
            <DownloadSimple size={24} weight="duotone" />
          </span>
        </div>

        <div className="export-grid mt-6">
          <section className="export-panel">
            <div className="export-toolbar">
              <label className="search-shell">
                <MagnifyingGlass size={18} />
                <input
                  value={exportQuery}
                  onChange={(event) => setExportQuery(event.target.value)}
                  placeholder="Filtrar por sitio, usuario o etiqueta"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="secondary-button" type="button" onClick={selectVisibleEntries}>
                  <Check size={17} weight="bold" />
                  <span>Marcar visibles</span>
                </button>
                <button className="secondary-button" type="button" onClick={() => setSelectedIds(new Set())}>
                  <X size={17} />
                  <span>Limpiar</span>
                </button>
              </div>
            </div>

            <div className="export-list mt-4">
              {visibleEntries.map((entry, index) => (
                <label
                  key={entry.id}
                  className={`export-row ${selectedIds.has(entry.id) ? 'is-selected' : ''}`}
                  style={{ '--index': index } as CSSProperties}
                >
                  <input
                    className="export-check"
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelected(entry.id)}
                  />
                  <span className="entry-mark">{entry.service.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900">{entry.service}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {entry.username || entry.url || 'Sin usuario'}
                    </span>
                  </span>
                  <span className="tag-chip">{entry.category}</span>
                </label>
              ))}

              {!visibleEntries.length && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-zinc-800">{entries.length ? 'Sin resultados' : 'No hay claves'}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {entries.length ? 'Prueba con otro filtro.' : 'Guarda una clave antes de exportar.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="export-summary">
            <p className="section-label">Archivo</p>
            <p className="export-count">{selectedEntries.length}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedEntries.length === 1 ? 'clave seleccionada' : 'claves seleccionadas'}
            </p>
            <div className="mt-5 grid gap-2">
              <button
                className="primary-button justify-center"
                type="button"
                disabled={!selectedEntries.length || isExporting}
                onClick={handleExcelExport}
              >
                <DownloadSimple size={18} weight="duotone" />
                <span>{isExporting ? 'Exportando' : 'Descargar Excel'}</span>
              </button>
              <button className="secondary-button justify-center" type="button" onClick={onExportEncrypted}>
                <ShieldCheck size={18} weight="duotone" />
                <span>Respaldo cifrado</span>
              </button>
            </div>
            <div className="export-warning mt-5">
              <p className="text-sm font-semibold text-zinc-900">Cuidado con el archivo</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                El Excel incluye contraseñas visibles. El respaldo cifrado, en cambio, solo se abre con la contraseña maestra.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SettingsScreen({
  account,
  recovery,
  newRecoveryCode,
  themeMode,
  accentId,
  backgroundId,
  isBusy,
  onThemeToggle,
  onAccentChange,
  onBackgroundChange,
  onSaveAccount,
  onDeleteAccount,
  onGenerateRecovery,
}: SettingsScreenProps) {
  const [accountDraft, setAccountDraft] = useState<AccountPayload>({
    username: account?.username ?? '',
    email: account?.email ?? '',
    displayName: account?.displayName ?? '',
    avatarUrl: account?.avatarUrl ?? '',
  });
  const [recoveryDraft, setRecoveryDraft] = useState({
    recoveryEmail: recovery.recoveryEmail,
    recoveryHint: recovery.recoveryHint,
  });
  const [settingsError, setSettingsError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAccountDraft({
      username: account?.username ?? '',
      email: account?.email ?? '',
      displayName: account?.displayName ?? '',
      avatarUrl: account?.avatarUrl ?? '',
    });
  }, [account]);

  useEffect(() => {
    setRecoveryDraft({
      recoveryEmail: recovery.recoveryEmail,
      recoveryHint: recovery.recoveryHint,
    });
  }, [recovery.recoveryEmail, recovery.recoveryHint]);

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError('');

    try {
      await onSaveAccount(accountDraft);
    } catch (error) {
      setSettingsError(getErrorMessage(error));
    }
  }

  async function handleRecoverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsError('');

    try {
      await onGenerateRecovery(recoveryDraft);
    } catch (error) {
      setSettingsError(getErrorMessage(error));
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setSettingsError('');

    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setSettingsError('Sube una imagen JPG o PNG.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setSettingsError('La imagen debe pesar 512 KB o menos.');
      return;
    }

    try {
      const avatarUrl = await imageFileToBase64(file);
      setAccountDraft((draft) => ({ ...draft, avatarUrl }));
    } catch (error) {
      setSettingsError(getErrorMessage(error));
    }
  }

  return (
    <section className="settings-layout">
      <div className="surface-panel p-5 sm:p-7">
        <div className="settings-header">
          <div>
            <p className="section-label">Configuración</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Apariencia y cuenta</h1>
          </div>
          <span className="status-orbit">
            <GearSix size={24} weight="duotone" />
          </span>
        </div>

        {settingsError && (
          <div className="mt-5 inline-flex w-full items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <WarningCircle size={18} weight="duotone" />
            <span>{settingsError}</span>
          </div>
        )}

        <div className="settings-grid mt-6">
          <section className="detail-section">
            <div className="settings-title">
              <Palette size={20} weight="duotone" />
              <div>
                <p className="section-label">Tema</p>
                <p className="mt-1 text-sm text-zinc-500">Modo, acento y fondo se guardan en Supabase.</p>
              </div>
            </div>
            <div className="mt-5">
              <ThemeControls
                accentId={accentId}
                themeMode={themeMode}
                onAccentChange={onAccentChange}
                onThemeToggle={onThemeToggle}
              />
            </div>
            <div className="background-grid mt-5">
              {backgroundOptions.map((background) => (
                <button
                  key={background.id}
                  className={`background-card ${backgroundId === background.id ? 'is-active' : ''}`}
                  type="button"
                  onClick={(event) => onBackgroundChange(background.id, event)}
                >
                  <span className={`background-preview is-${background.id}`} />
                  <span>{background.name}</span>
                </button>
              ))}
            </div>
          </section>

          <form className="detail-section" onSubmit={handleAccountSubmit}>
            <div className="settings-title">
              <UserCircle size={20} weight="duotone" />
              <div>
                <p className="section-label">Usuario</p>
                <p className="mt-1 text-sm text-zinc-500">Perfil, correo y foto del acceso inferior.</p>
              </div>
            </div>
            <div className="profile-editor mt-5">
              <ProfileAvatar profile={accountDraft} large />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{accountDraft.displayName || accountDraft.username || 'Perfil sin nombre'}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{accountDraft.email || 'correo pendiente'}</p>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleAvatarUpload}
            />
            <div className="mt-5 grid gap-4">
              <FieldBlock label="Usuario" helper="Mínimo 3 caracteres.">
                <input
                  className="field-input"
                  value={accountDraft.username}
                  onChange={(event) => setAccountDraft((draft) => ({ ...draft, username: event.target.value }))}
                  required
                />
              </FieldBlock>
              <FieldBlock label="Correo de cuenta" helper="También puede usarse como correo de recuperación.">
                <input
                  className="field-input"
                  type="email"
                  value={accountDraft.email}
                  onChange={(event) => setAccountDraft((draft) => ({ ...draft, email: event.target.value }))}
                  required
                />
              </FieldBlock>
              <FieldBlock label="Nombre visible">
                <input
                  className="field-input"
                  value={accountDraft.displayName}
                  onChange={(event) => setAccountDraft((draft) => ({ ...draft, displayName: event.target.value }))}
                />
              </FieldBlock>
              <div className="avatar-actions">
                <button className="secondary-button justify-center" type="button" onClick={() => avatarInputRef.current?.click()}>
                  <UploadSimple size={17} />
                  <span>Subir JPG/PNG</span>
                </button>
                <button
                  className="secondary-button justify-center"
                  type="button"
                  disabled={!accountDraft.avatarUrl}
                  onClick={() => setAccountDraft((draft) => ({ ...draft, avatarUrl: '' }))}
                >
                  <Trash size={17} />
                  <span>Quitar foto</span>
                </button>
                <p className="text-xs leading-relaxed text-zinc-500">
                  La imagen se convierte a Base64 y se guarda en Supabase junto al perfil.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="primary-button" type="submit" disabled={isBusy}>
                <ShieldCheck size={18} weight="duotone" />
                <span>{account ? 'Actualizar usuario' : 'Crear usuario'}</span>
              </button>
              {account && (
                <button className="danger-button" type="button" onClick={onDeleteAccount}>
                  <Trash size={17} />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </form>

          <form className="detail-section lg:col-span-2" onSubmit={handleRecoverySubmit}>
            <div className="settings-title">
              <Lifebuoy size={20} weight="duotone" />
              <div>
                <p className="section-label">Recuperación</p>
                <p className="mt-1 text-sm text-zinc-500">El correo no guarda tu contraseña; el código es la llave de emergencia.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <FieldBlock label="Correo de recuperación">
                <input className="field-input" type="email" value={recoveryDraft.recoveryEmail} onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, recoveryEmail: event.target.value }))} />
              </FieldBlock>
              <FieldBlock label="Pista privada">
                <input className="field-input" value={recoveryDraft.recoveryHint} onChange={(event) => setRecoveryDraft((draft) => ({ ...draft, recoveryHint: event.target.value }))} placeholder="Dónde guardaste el código" />
              </FieldBlock>
            </div>
            <button className="secondary-button mt-5" type="submit" disabled={isBusy}>
              <Key size={18} weight="duotone" />
              <span>{recovery.recoveryEnabled ? 'Regenerar código' : 'Generar código'}</span>
            </button>
            {newRecoveryCode && (
              <div className="recovery-code mt-5">
                <p className="section-label">Código nuevo</p>
                <p className="mt-2 font-mono text-lg text-zinc-950">{newRecoveryCode}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function InfoBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="info-block">
      <span className="text-zinc-500">{icon}</span>
      <div className="min-w-0">
        <p className="section-label">{label}</p>
        <p className="mt-2 truncate text-sm font-semibold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

function HealthLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <strong className="font-mono text-zinc-900">{value}</strong>
    </div>
  );
}

function PasswordMask({ length }: { length: number }) {
  return <span aria-label="Contraseña oculta">{'•'.repeat(Math.min(Math.max(length, 8), 24))}</span>;
}

function EmptyState({ onNewEntry }: { onNewEntry: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-zinc-200 bg-white text-emerald-950">
          <LockKey size={26} weight="duotone" />
        </span>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950">Tu bóveda está lista.</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Agrega un sitio, usuario y contraseña para guardarlos cifrados en Supabase.
        </p>
        <button className="primary-button mx-auto mt-6" type="button" onClick={onNewEntry}>
          <Plus size={19} weight="bold" />
          <span>Guardar primera clave</span>
        </button>
      </div>
    </div>
  );
}

type EntryEditorProps = {
  initial: VaultEntry | null;
  isBusy: boolean;
  onClose: () => void;
  onSave: (draft: DraftEntry, id?: string) => Promise<void>;
};

function EntryEditor({ initial, isBusy, onClose, onSave }: EntryEditorProps) {
  const [draft, setDraft] = useState(() => draftFromEntry(initial));
  const [length, setLength] = useState(18);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(draftFromEntry(initial));
  }, [initial]);

  function updateDraft<K extends keyof DraftEntry>(key: K, value: DraftEntry[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!draft.service.trim()) {
      setError('Escribe de dónde es esta clave.');
      return;
    }

    if (!draft.password) {
      setError('La contraseña no puede quedar vacía.');
      return;
    }

    try {
      await onSave(draft, initial?.id);
    } catch {
      setError('No pude guardar esta clave.');
    }
  }

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <button className="editor-scrim" type="button" aria-label="Cerrar editor" onClick={onClose} />
      <form className="editor-panel" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-950">{initial ? 'Editar clave' : 'Nueva clave'}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              {initial ? initial.service : 'Guardar acceso'}
            </h2>
          </div>
          <button className="icon-button" type="button" title="Cerrar" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-7 grid gap-5">
          <FieldBlock label="De dónde es" helper="Nombre de app, sitio o servicio.">
            <input
              className="field-input"
              value={draft.service}
              onChange={(event) => updateDraft('service', event.target.value)}
              placeholder="Banco, correo, hosting"
              required
            />
          </FieldBlock>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FieldBlock label="Usuario o correo" helper="Puede quedar vacío.">
              <input
                className="field-input"
                value={draft.username}
                onChange={(event) => updateDraft('username', event.target.value)}
                placeholder="tu@correo.com"
              />
            </FieldBlock>

            <FieldBlock label="Categoría" helper="Para filtrar rápido.">
              <select
                className="field-input"
                value={draft.category}
                onChange={(event) => updateDraft('category', event.target.value as Category)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FieldBlock>
          </div>

          <FieldBlock label="Sitio o URL" helper="Se guarda para recordar el origen.">
            <input
              className="field-input"
              value={draft.url}
              onChange={(event) => updateDraft('url', event.target.value)}
              placeholder="https://ejemplo.com"
            />
          </FieldBlock>

          <FieldBlock
            label="Contraseña"
            helper={`${strengthLabel(scorePassword(draft.password))} con ${draft.password.length} caracteres.`}
          >
            <div className="password-builder">
              <input
                className="field-input border-0 bg-transparent px-0 shadow-none focus:ring-0"
                type="text"
                value={draft.password}
                onChange={(event) => updateDraft('password', event.target.value)}
                placeholder="Pega o genera una contraseña"
                required
              />
              <button
                className="secondary-button shrink-0"
                type="button"
                onClick={() => updateDraft('password', generatePassword(length))}
              >
                <DiceFive size={17} />
                <span>Generar</span>
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                className="w-full accent-emerald-950"
                type="range"
                min="14"
                max="32"
                value={length}
                onChange={(event) => setLength(Number(event.target.value))}
              />
              <span className="w-10 text-right font-mono text-sm text-zinc-500">{length}</span>
            </div>
            <StrengthMeter score={scorePassword(draft.password)} compact />
          </FieldBlock>

          <FieldBlock label="Etiquetas" helper="Separadas por coma.">
            <input
              className="field-input"
              value={draft.tags}
              onChange={(event) => updateDraft('tags', event.target.value)}
              placeholder="personal, crítico, mensual"
            />
          </FieldBlock>

          <FieldBlock label="Notas" helper="Detalles que quieras conservar.">
            <textarea
              className="field-input min-h-28 resize-none"
              value={draft.notes}
              onChange={(event) => updateDraft('notes', event.target.value)}
              placeholder="Preguntas de seguridad, plan, referencia"
            />
          </FieldBlock>
        </div>

        {error && (
          <div className="mt-5 inline-flex w-full items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <WarningCircle size={18} weight="duotone" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="secondary-button justify-center" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button justify-center" type="submit" disabled={isBusy}>
            <ShieldCheck size={18} weight="duotone" />
            <span>{isBusy ? 'Guardando' : 'Guardar cifrado'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldBlock({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-zinc-900">{label}</span>
      {children}
      {helper && <span className="text-xs leading-relaxed text-zinc-500">{helper}</span>}
    </label>
  );
}

function StrengthMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <div className={compact ? 'mt-3' : ''}>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full ${index < score ? 'bg-emerald-900' : 'bg-zinc-200'}`}
          />
        ))}
      </div>
      {!compact && <p className="mt-2 text-xs font-medium text-zinc-500">{strengthLabel(score)}</p>}
    </div>
  );
}

function ToastRack({ toast }: { toast: Toast | null }) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.tone === 'error' ? 'is-error' : ''}`}>
      {toast.tone === 'error' ? <WarningCircle size={18} weight="duotone" /> : <Check size={18} weight="bold" />}
      <span>{toast.message}</span>
    </div>
  );
}

function ConfirmDialog({
  dialog,
  onResolve,
}: {
  dialog: ConfirmDialogState | null;
  onResolve: (confirmed: boolean) => void;
}) {
  if (!dialog) return null;

  return (
    <div className="alert-overlay" role="presentation">
      <button className="alert-scrim" type="button" aria-label="Cancelar" onClick={() => onResolve(false)} />
      <section className={`alert-dialog ${dialog.tone === 'danger' ? 'is-danger' : ''}`} role="dialog" aria-modal="true">
        <span className="alert-icon">
          {dialog.tone === 'danger' ? <WarningCircle size={23} weight="duotone" /> : <ShieldCheck size={23} weight="duotone" />}
        </span>
        <div className="min-w-0">
          <p className="section-label">{dialog.tone === 'danger' ? 'Confirmación sensible' : 'Confirmación'}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{dialog.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">{dialog.message}</p>
        </div>
        <div className="alert-actions">
          <button className="secondary-button justify-center" type="button" onClick={() => onResolve(false)}>
            {dialog.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            className={`${dialog.tone === 'danger' ? 'danger-button' : 'primary-button'} justify-center`}
            type="button"
            onClick={() => onResolve(true)}
          >
            {dialog.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default App;
