import { toBase64, fromBase64 } from "../api/codec";

const SALT_KEY = "umbrachat:vaultSalt";
const ENABLED_KEY = "umbrachat:vaultEnabled";
const PBKDF2_ITERATIONS = 600_000;

interface EncryptedBlob {
  __encrypted: true;
  iv: string;
  data: string;
}

function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  return typeof value === "object" && value !== null && (value as { __encrypted?: unknown }).__encrypted === true;
}

/** Recursively replaces every Uint8Array with a base64 marker, so the result
 * is JSON-serializable - IndexedDB stores structured objects directly, but
 * once we're encrypting we need one flat plaintext buffer to hand to AES-GCM. */
function replaceBytes(value: unknown): unknown {
  if (value instanceof Uint8Array) return { __bytes: toBase64(value) };
  if (Array.isArray(value)) return value.map(replaceBytes);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceBytes(v);
    return out;
  }
  return value;
}

function restoreBytes(value: unknown): unknown {
  if (value && typeof value === "object" && "__bytes" in value) return fromBase64((value as { __bytes: string }).__bytes);
  if (Array.isArray(value)) return value.map(restoreBytes);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = restoreBytes(v);
    return out;
  }
  return value;
}

/** Held only here, only in memory - never written to localStorage/IndexedDB.
 * A fresh page load always starts with this unset (see screens/Unlock.tsx). */
let activeKey: CryptoKey | null = null;

export function isVaultActive(): boolean {
  return activeKey !== null;
}

/** Whether the feature is turned on at all - a plain, non-secret flag, safe
 * to read before anything is unlocked (unlike activeKey, this survives reload). */
export function isEncryptionEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "1";
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    // Not extractable - the raw key bytes can never be read back out, even by this app's own code.
    false,
    ["encrypt", "decrypt"],
  );
}

/** Passthrough when the vault is off/locked, so every store's save/load
 * keeps working completely unchanged for the (default) encryption-off case. */
export async function encryptForStorage<T>(value: T): Promise<T | EncryptedBlob> {
  if (!activeKey) return value;
  const plaintext = new TextEncoder().encode(JSON.stringify(replaceBytes(value)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, activeKey, plaintext);
  return { __encrypted: true, iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptFromStorage<T>(stored: unknown): Promise<T | undefined> {
  if (stored === undefined) return undefined;
  if (!isEncryptedBlob(stored)) return stored as T; // plaintext - encryption off, or a legacy pre-migration record
  if (!activeKey) throw new Error("vault is locked");
  const iv = fromBase64(stored.iv);
  const ciphertext = fromBase64(stored.data);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, activeKey, ciphertext as BufferSource);
  return restoreBytes(JSON.parse(new TextDecoder().decode(plaintext))) as T;
}

/**
 * Derives the key from a passphrase and verifies it's correct by calling
 * `verify` (the caller passes something like `loadAccount`, which will now
 * transparently decrypt through the tentatively-active key) - AES-GCM's own
 * auth tag failing on a wrong key IS the password check, no separate stored
 * verifier needed. Takes `verify` as a parameter instead of importing
 * keyStore directly, so this module doesn't depend on any specific store.
 */
export async function unlock(passphrase: string, verify: () => Promise<unknown>): Promise<boolean> {
  const saltB64 = localStorage.getItem(SALT_KEY);
  if (!saltB64) return false;
  const key = await deriveKey(passphrase, fromBase64(saltB64));
  activeKey = key;
  try {
    const result = await verify();
    if (result === undefined) {
      activeKey = null;
      return false;
    }
    return true;
  } catch {
    activeKey = null; // wrong passphrase - GCM auth tag check failed
    return false;
  }
}
