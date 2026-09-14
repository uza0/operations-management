import { randomBytes, randomUUID } from 'node:crypto';

/** Primary keys: opaque, non-sequential, safe to expose in URLs. */
export function newId(): string {
  return randomUUID();
}

/**
 * Secure personal event token (spec §3.4 / §30).
 * 128 bits of CSPRNG entropy, hex encoded. It is NOT derived from any database
 * id, carries no member information, and cannot be guessed or enumerated.
 */
export function newMemberToken(): string {
  return randomBytes(16).toString('hex');
}

/** Short human-readable employee code fallback, e.g. "TZ-4821". */
export function newEmployeeCode(prefix = 'TZ'): string {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${prefix}-${n}`;
}
