import { describe, it, expect } from 'vitest';

/**
 * Tab URL accessibility policy test:
 * Verifies that internal browser schemes and sensitive protocols are blocked
 * to prevent privilege escalation.
 */
function isTabPermissible(url?: string): boolean {
  if (!url) return false;
  const restrictedProtocols = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'devtools:',
    'view-source:',
  ];
  return !restrictedProtocols.some((proto) => url.startsWith(proto));
}

describe('Service Worker Security & Tab Permissions', () => {
  it('permits standard web domains (http, https)', () => {
    expect(isTabPermissible('https://example.com')).toBe(true);
    expect(isTabPermissible('http://localhost:3000/form')).toBe(true);
    expect(isTabPermissible('https://bank.example.org/account')).toBe(true);
  });

  it('strictly blocks privileged internal schemes (fail-closed)', () => {
    expect(isTabPermissible('chrome://settings')).toBe(false);
    expect(isTabPermissible('chrome://extensions')).toBe(false);
    expect(isTabPermissible('chrome-extension://abcdefg/popup.html')).toBe(false);
    expect(isTabPermissible('edge://flags')).toBe(false);
    expect(isTabPermissible('about:blank')).toBe(false);
    expect(isTabPermissible('devtools://devtools/bundled/inspector.html')).toBe(false);
    expect(isTabPermissible('view-source:https://example.com')).toBe(false);
    expect(isTabPermissible('')).toBe(false);
    expect(isTabPermissible(undefined)).toBe(false);
  });
});
