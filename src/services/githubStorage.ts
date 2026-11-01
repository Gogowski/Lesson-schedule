import { Lesson } from '../types';
import { isLessons } from '../utils/scheduleValidation';

export const GITHUB_REPO = (import.meta.env.VITE_GITHUB_REPO?.trim() || 'Gogowski/Lesson-schedule');
export const SCHEDULE_FILE_PATH = 'data/encrypted-schedule.json';

const ACCESS_CODE_STORAGE_KEY = 'schedule_access_code_v1';
const GITHUB_TOKEN_STORAGE_KEY = 'schedule_github_token_v1';
const PBKDF2_ITERATIONS = 100_000;

export interface EncryptedScheduleEnvelope {
  format: 'aes-256-gcm-pbkdf2';
  version: number;
  updatedAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface DecryptedSchedulePayload {
  version: number;
  updatedAt: string;
  lessons: Lesson[];
}

interface GitHubFileResponse {
  sha: string;
  content: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}

async function deriveAesKey(accessCode: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(accessCode.trim()),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

export async function encryptSchedulePayload(
  payload: DecryptedSchedulePayload,
  accessCode: string
): Promise<EncryptedScheduleEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(accessCode, salt, ['encrypt']);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  );
  return {
    format: 'aes-256-gcm-pbkdf2',
    version: payload.version,
    updatedAt: payload.updatedAt,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptScheduleEnvelope(
  envelope: EncryptedScheduleEnvelope,
  accessCode: string
): Promise<DecryptedSchedulePayload> {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesKey(accessCode, salt, ['decrypt']);
  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
  } catch {
    throw new Error('INVALID_ACCESS_CODE');
  }
  const parsed = JSON.parse(new TextDecoder().decode(decryptedBuffer)) as unknown;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !isLessons((parsed as { lessons?: unknown }).lessons)
  ) {
    throw new Error('Сохранённые данные расписания повреждены.');
  }
  const record = parsed as { version?: unknown; updatedAt?: unknown; lessons: Lesson[] };
  return {
    version: typeof record.version === 'number' ? record.version : envelope.version,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : envelope.updatedAt,
    lessons: record.lessons,
  };
}

export function getSavedAccessCode(): string {
  return localStorage.getItem(ACCESS_CODE_STORAGE_KEY)?.trim() ?? '';
}

export function setSavedAccessCode(code: string | null): void {
  if (code && code.trim()) {
    localStorage.setItem(ACCESS_CODE_STORAGE_KEY, code.trim());
  } else {
    localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
  }
}

export function getSavedGitHubToken(): string {
  return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)?.trim() ?? '';
}

export function setSavedGitHubToken(token: string | null): void {
  if (token && token.trim()) {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token.trim());
  } else {
    localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
  }
}

export function consumeUrlHashCredentials(): { accessCode: string; githubToken: string } {
  if (typeof window === 'undefined') {
    return { accessCode: '', githubToken: '' };
  }
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!rawHash) {
    return {
      accessCode: getSavedAccessCode(),
      githubToken: getSavedGitHubToken(),
    };
  }
  const params = new URLSearchParams(rawHash);
  const accessFromUrl = params.get('access')?.trim() ?? '';
  const tokenFromUrl = params.get('token')?.trim() ?? '';
  if (accessFromUrl) {
    setSavedAccessCode(accessFromUrl);
  }
  if (tokenFromUrl) {
    setSavedGitHubToken(tokenFromUrl);
  }
  if (accessFromUrl || tokenFromUrl) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return {
    accessCode: getSavedAccessCode(),
    githubToken: getSavedGitHubToken(),
  };
}

export function buildViewerShareUrl(accessCode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const trimmed = accessCode.trim();
  if (!trimmed) return base;
  return `${base}#access=${encodeURIComponent(trimmed)}`;
}

export async function verifyGitHubToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${trimmed}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { permissions?: { push?: boolean } };
    return Boolean(data.permissions?.push);
  } catch {
    return false;
  }
}

export async function fetchEncryptedSchedule(
  signal?: AbortSignal
): Promise<{ envelope: EncryptedScheduleEnvelope; sha: string }> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${SCHEDULE_FILE_PATH}?t=${Date.now()}`;
  const token = getSavedGitHubToken();

  const doFetch = async (useAuth: boolean) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
    };
    if (useAuth && token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, { headers, cache: 'no-store', signal });
  };

  let res = await doFetch(Boolean(token));
  if ((res.status === 401 || res.status === 403) && token) {
    res = await doFetch(false);
  }

  if (!res.ok) {
    throw new Error(`Не удалось загрузить расписание с GitHub (код ${res.status}).`);
  }

  const fileData = (await res.json()) as GitHubFileResponse;
  const decodedJson = base64ToUtf8(fileData.content);
  const envelope = JSON.parse(decodedJson) as EncryptedScheduleEnvelope;
  return { envelope, sha: fileData.sha };
}

export async function saveEncryptedSchedule(
  lessons: Lesson[],
  accessCode: string,
  token: string,
  currentVersion: number,
  knownSha?: string
): Promise<{ version: number; sha: string }> {
  const trimmedToken = token.trim();
  const trimmedCode = accessCode.trim();
  if (!trimmedToken) {
    throw new Error('Токен GitHub не настроен. Войдите как администратор.');
  }
  if (!trimmedCode) {
    throw new Error('Код доступа к расписанию не задан.');
  }

  let targetSha = knownSha;
  let baseVersion = currentVersion;

  if (!targetSha) {
    const latest = await fetchEncryptedSchedule();
    targetSha = latest.sha;
    baseVersion = Math.max(baseVersion, latest.envelope.version || 0);
  }

  const nextVersion = baseVersion + 1;
  const updatedAt = new Date().toISOString();
  const envelope = await encryptSchedulePayload(
    { version: nextVersion, updatedAt, lessons },
    trimmedCode
  );
  const contentBase64 = utf8ToBase64(JSON.stringify(envelope, null, 2));

  const putFile = async (shaToUse: string) =>
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${SCHEDULE_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${trimmedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'chore(schedule): update encrypted schedule [skip ci]',
        content: contentBase64,
        sha: shaToUse,
      }),
    });

  let res = await putFile(targetSha);
  if (res.status === 409 || res.status === 422) {
    const latest = await fetchEncryptedSchedule();
    res = await putFile(latest.sha);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Токен GitHub недействителен или не имеет прав на запись в репозиторий.');
    }
    throw new Error(`Ошибка сохранения в GitHub (код ${res.status}).`);
  }

  const result = (await res.json()) as { content?: { sha?: string } };
  return {
    version: nextVersion,
    sha: result.content?.sha ?? targetSha,
  };
}
