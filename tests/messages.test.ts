import { describe, it, expect } from 'vitest';
import {
  createMessageId,
  isValidNazarMessage,
  NazarMessage,
} from '../src/types/messages';

describe('Message Protocol Validation', () => {
  it('generates unique message IDs', () => {
    const id1 = createMessageId();
    const id2 = createMessageId();
    expect(id1).toMatch(/^msg_[a-z0-9]+_\d+$/);
    expect(id1).not.toBe(id2);
  });

  it('validates legitimate Nazar messages', () => {
    const pingMsg: NazarMessage = {
      id: createMessageId(),
      type: 'PING',
      timestamp: Date.now(),
    };
    expect(isValidNazarMessage(pingMsg)).toBe(true);

    const captureMsg: NazarMessage = {
      id: createMessageId(),
      type: 'CAPTURE_CONTEXT',
      timestamp: Date.now(),
      userInstruction: 'Fill the form',
    };
    expect(isValidNazarMessage(captureMsg)).toBe(true);

    const extractMsg: NazarMessage = {
      id: createMessageId(),
      type: 'EXTRACT_DOM',
      timestamp: Date.now(),
    };
    expect(isValidNazarMessage(extractMsg)).toBe(true);
  });

  it('rejects malformed or forged messages (fail-closed)', () => {
    expect(isValidNazarMessage(null)).toBe(false);
    expect(isValidNazarMessage(undefined)).toBe(false);
    expect(isValidNazarMessage({})).toBe(false);
    expect(isValidNazarMessage({ type: 'PING' })).toBe(false); // missing id and timestamp
    expect(isValidNazarMessage({ id: '', type: 'PING', timestamp: Date.now() })).toBe(false);
    expect(
      isValidNazarMessage({
        id: 'msg_1',
        type: 'UNAUTHORIZED_INJECTION_TYPE',
        timestamp: Date.now(),
      })
    ).toBe(false);
    expect(
      isValidNazarMessage({
        id: 'msg_1',
        type: 'PING',
        timestamp: 'invalid_timestamp', // string instead of number
      })
    ).toBe(false);
  });
});
