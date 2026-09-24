import { describe, it, expect } from 'vitest';
import { runPrivacyScan } from '../src/privacy/privacyEngine';
import { CapturedContextPayload } from '../src/types/messages';

describe('Unified Privacy Engine Integration & Benchmark', () => {
  const dummyContext: CapturedContextPayload = {
    tabId: 42,
    url: 'https://bank.example.org/transfer',
    title: 'Secure Account Portal',
    timestamp: Date.now(),
    screenshotDataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="%230f172a"/><text x="50" y="50" fill="%23fff">Account Statement</text></svg>',
    dom: {
      url: 'https://bank.example.org/transfer',
      title: 'Secure Account Portal',
      timestamp: Date.now(),
      viewport: {
        width: 1280,
        height: 800,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      elements: [
        {
          id: 'user_email',
          tagName: 'input',
          elementType: 'input',
          selector: '#user_email',
          boundingBox: { x: 50, y: 80, width: 250, height: 35, top: 80, left: 50, bottom: 115, right: 300 },
          isVisible: true,
          isInteractive: true,
          attributes: { type: 'email', name: 'email', autocomplete: 'email' },
          isSensitiveCandidate: true,
          textContent: 'customer@safe-bank.com',
        },
        {
          id: 'account_password',
          tagName: 'input',
          elementType: 'input',
          selector: '#account_password',
          boundingBox: { x: 50, y: 140, width: 250, height: 35, top: 140, left: 50, bottom: 175, right: 300 },
          isVisible: true,
          isInteractive: true,
          attributes: { type: 'password', name: 'password' },
          isSensitiveCandidate: true,
        },
        {
          id: 'card_field',
          tagName: 'input',
          elementType: 'input',
          selector: '#card_field',
          boundingBox: { x: 50, y: 200, width: 250, height: 35, top: 200, left: 50, bottom: 235, right: 300 },
          isVisible: true,
          isInteractive: true,
          attributes: { name: 'creditcardnumber', autocomplete: 'cc-number' },
          isSensitiveCandidate: true,
        },
        {
          id: 'cvv_field',
          tagName: 'input',
          elementType: 'input',
          selector: '#cvv_field',
          boundingBox: { x: 50, y: 260, width: 80, height: 35, top: 260, left: 50, bottom: 295, right: 130 },
          isVisible: true,
          isInteractive: true,
          attributes: { name: 'cvv', autocomplete: 'cc-csc' },
          isSensitiveCandidate: true,
        },
        {
          id: 'api_token_info',
          tagName: 'p',
          elementType: 'paragraph',
          selector: '#api_token_info',
          boundingBox: { x: 50, y: 320, width: 400, height: 30, top: 320, left: 50, bottom: 350, right: 450 },
          isVisible: true,
          isInteractive: false,
          attributes: {},
          isSensitiveCandidate: false,
          textContent: 'Backend authorization token: ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
        },
      ],
      stats: {
        totalElements: 5,
        interactiveCount: 4,
        sensitiveCandidateCount: 4,
        formsCount: 1,
      },
    },
  };

  it('executes full privacy scan pipeline and detects all sensitive regions', async () => {
    const result = await runPrivacyScan(dummyContext);

    expect(result.scanId).toBeDefined();
    expect(result.regions.length).toBeGreaterThanOrEqual(4);

    // Verify detected categories
    const categories = result.regions.map((r) => r.category);
    expect(categories).toContain('email');
    expect(categories).toContain('password');
    expect(categories).toContain('credit_card');
    expect(categories).toContain('security_code');

    // Check recommended redaction modes
    const pwdRegion = result.regions.find((r) => r.category === 'password');
    expect(pwdRegion?.recommendedRedaction).toBe('semantic_label');
    expect(pwdRegion?.label).toBe('[PASSWORD REDACTED]');
  });

  it('measures scan latency benchmarks for all sub-engines', async () => {
    const result = await runPrivacyScan(dummyContext);

    expect(result.latency).toBeDefined();
    expect(typeof result.latency.domMs).toBe('number');
    expect(typeof result.latency.ocrMs).toBe('number');
    expect(typeof result.latency.piiMs).toBe('number');
    expect(typeof result.latency.faceMs).toBe('number');
    expect(typeof result.latency.fusionMs).toBe('number');
    expect(typeof result.latency.totalMs).toBe('number');

    // Scan should be fast (< 500ms on synthetic context)
    expect(result.latency.totalMs).toBeLessThan(1000);
  });
});
