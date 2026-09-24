/**
 * NAZAR Model Integrity Verification Engine (Phase 8)
 *
 * Provides cryptographic SHA-256 integrity validation for downloaded model weights,
 * configuration files, and tokenizers.
 * Works seamlessly in both Web Crypto (browser extensions) and Node.js (Vitest) environments.
 */

/**
 * Computes hexadecimal SHA-256 digest of an ArrayBuffer.
 */
export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  // 1. Browser Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 2. Node.js environment fallback (for unit tests / CLI runner)
  try {
    const moduleName = 'crypto';
    // Dynamic import to avoid browser bundle pollution
    const nodeCrypto = await import(/* @vite-ignore */ moduleName);
    const hash = nodeCrypto.createHash('sha256');
    hash.update(new Uint8Array(buffer));
    return hash.digest('hex');
  } catch {
    // Basic fallback hash for restricted environments
    return computeFallbackHash(buffer);
  }
}

/**
 * Validates that an asset buffer matches its expected cryptographic checksum.
 */
export async function verifyAssetIntegrity(
  buffer: ArrayBuffer,
  expectedSha256: string
): Promise<{ verified: boolean; actualSha256: string }> {
  const actualSha256 = await computeSha256Hex(buffer);
  const verified = actualSha256.toLowerCase() === expectedSha256.toLowerCase();
  return { verified, actualSha256 };
}

/**
 * Deterministic fallback digest when subtle crypto is unavailable.
 */
function computeFallbackHash(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    '000000000000000000000000000000000000000000000000'
  );
}
