import { describe, expect, it } from 'vitest';
import { computeSha256Hex } from '../src/core/crypto/hashUtils';

describe('hashUtils SHA-256 Browser implementation', () => {
  it('computes correct SHA-256 for empty input', async () => {
    const input = new Uint8Array(0);
    const hash = await computeSha256Hex(input);
    // Known SHA-256 for empty byte array
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('computes correct SHA-256 for string "abc"', async () => {
    const encoder = new TextEncoder();
    const input = encoder.encode('abc');
    const hash = await computeSha256Hex(input);
    // Known SHA-256 for "abc"
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('computes correct SHA-256 when passed ArrayBuffer', async () => {
    const encoder = new TextEncoder();
    const input = encoder.encode('abc').buffer;
    const hash = await computeSha256Hex(input);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
