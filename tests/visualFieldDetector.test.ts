import { describe, it, expect } from 'vitest';
import {
  detectVisualSensitiveFields,
  matchLabelToSensitiveCategory,
} from '../src/privacy/visualFieldDetector';
import { scanLocalImage } from '../src/imageFilter/imagePrivacyEngine';
import { PixelBuffer } from '../src/redaction/pixelRedactor';

describe('Visual Field Detector without DOM', () => {
  it('correctly maps label texts to sensitive categories', () => {
    expect(matchLabelToSensitiveCategory('Email Address')).toBe('email');
    expect(matchLabelToSensitiveCategory('Phone Number')).toBe('phone');
    expect(matchLabelToSensitiveCategory('Account Password')).toBe('password');
    expect(matchLabelToSensitiveCategory('Credit Card Number')).toBe('credit_card');
    expect(matchLabelToSensitiveCategory('CVV')).toBe('security_code');
    expect(matchLabelToSensitiveCategory('API Key / Auth Token')).toBe('api_key');
    expect(matchLabelToSensitiveCategory('Country')).toBeNull();
  });

  it('detects sensitive field regions from OCR label tokens', () => {
    const ocrWords = [
      { text: 'Email', confidence: 0.9, boundingBox: { x: 50, y: 50, width: 40, height: 18, left: 50, top: 50, right: 90, bottom: 68 } },
      { text: 'Address', confidence: 0.9, boundingBox: { x: 95, y: 50, width: 50, height: 18, left: 95, top: 50, right: 145, bottom: 68 } },
      { text: 'Password', confidence: 0.9, boundingBox: { x: 50, y: 120, width: 60, height: 18, left: 50, top: 120, right: 110, bottom: 138 } },
    ];

    const mockBuffer: PixelBuffer = {
      width: 600,
      height: 400,
      data: new Uint8ClampedArray(600 * 400 * 4).fill(0),
    };

    const regions = detectVisualSensitiveFields(mockBuffer, ocrWords, 600, 400);
    expect(regions.length).toBeGreaterThanOrEqual(2);

    const emailRegion = regions.find((r) => r.category === 'email');
    expect(emailRegion).toBeDefined();

    const passwordRegion = regions.find((r) => r.category === 'password');
    expect(passwordRegion).toBeDefined();
  });

  it('detects masked password bullet characters in OCR words', () => {
    const ocrWords = [
      { text: '••••••••', confidence: 0.95, boundingBox: { x: 50, y: 150, width: 80, height: 20, left: 50, top: 150, right: 130, bottom: 170 } },
    ];

    const mockBuffer: PixelBuffer = {
      width: 400,
      height: 300,
      data: new Uint8ClampedArray(400 * 300 * 4).fill(0),
    };

    const regions = detectVisualSensitiveFields(mockBuffer, ocrWords, 400, 300);
    expect(regions.length).toBe(1);
    expect(regions[0].category).toBe('password');
  });

  it('detects form fields in synthetic image scan without DOM context', async () => {
    const formSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500">
      <text x="30" y="50">Email Address [Sensitive Candidate]</text>
      <text x="30" y="80">test-privacy@example.org</text>
      <text x="30" y="130">Phone Number [Sensitive Candidate]</text>
      <text x="30" y="160">+1-555-0142</text>
      <text x="30" y="210">Account Password [Sensitive Candidate]</text>
      <text x="30" y="240">••••••••••••••••</text>
      <text x="30" y="290">Credit Card Number [Sensitive Candidate]</text>
      <text x="30" y="320">4000-0000-0000-0000</text>
      <text x="30" y="370">API Key / Auth Token [Sensitive Candidate]</text>
      <text x="30" y="400">naz_live_90a8b7c6d5e4f3a2b1</text>
    </svg>`;

    const scanResult = await scanLocalImage(formSvg, {}, 'form-screenshot.png');

    expect(scanResult.detections.length).toBeGreaterThanOrEqual(4);
    const categories = scanResult.detections.map((d) => d.category);
    expect(categories).toContain('email');
    expect(categories).toContain('phone');
    expect(categories).toContain('password');
    expect(categories).toContain('api_key');
  });
});
