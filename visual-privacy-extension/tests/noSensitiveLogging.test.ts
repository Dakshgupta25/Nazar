import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { PrivacyPipeline } from '../src/core/pipeline/privacyPipeline';

describe('Sensitive Data Logging Security Audit (Phase 9)', () => {
  const srcDirectory = path.resolve(__dirname, '../src');

  function getAllSourceFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllSourceFiles(fullPath));
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
        results.push(fullPath);
      }
    });
    return results;
  }

  it('1. performs automated static code scan for raw console logging in src/', () => {
    const files = getAllSourceFiles(srcDirectory);
    expect(files.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /console\.log\(.*(text|pii|email|phone|aadhaar|pan|creditCard|originalText|rawBytes|imageData|buffer|canvas)/i,
      /console\.info\(.*(text|pii|email|phone|aadhaar|pan|creditCard|originalText|rawBytes|imageData|buffer|canvas)/i,
      /console\.warn\(.*(text|pii|email|phone|aadhaar|pan|creditCard|originalText|rawBytes|imageData|buffer|canvas)/i,
      /console\.error\(.*(text|pii|email|phone|aadhaar|pan|creditCard|originalText|rawBytes|imageData|buffer|canvas)/i,
      /eval\(/,
      /new Function\(/,
      /document\.write\(/,
      /dangerouslySetInnerHTML/
    ];

    const violations: string[] = [];

    files.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(srcDirectory, filePath);

      forbiddenPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          violations.push(`File [${relativePath}] matches forbidden pattern: ${pattern.toString()}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('2. guarantees zero raw PII text is output to console during PII classification', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const classifier = new PiiClassifier();
    const sensitiveStrings = [
      'user.secret@bankdomain.com',
      'Call +91 9876543210 immediately',
      'PAN: ABCPE1234F',
      'Aadhaar: 4279 9999 9999',
      'Card: 4532 0151 1283 0366',
      'Account: SBIN0001234'
    ];

    const ocrItems = sensitiveStrings.map((text, idx) => ({
      id: `ocr-${idx}`,
      text,
      confidence: 0.95,
      box: { x: 10, y: 10, width: 100, height: 20 }
    }));

    const result = classifier.classify(ocrItems);
    expect(result.piiFindings.length).toBeGreaterThan(0);

    // Verify console spies received ZERO sensitive string occurrences
    const allLoggedArgs = [
      ...consoleLogSpy.mock.calls.flat(),
      ...consoleErrorSpy.mock.calls.flat()
    ].map(String);

    sensitiveStrings.forEach((secret) => {
      const leaked = allLoggedArgs.some((logStr) => logStr.includes(secret));
      expect(leaked).toBe(false);
    });

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('3. guarantees zero raw PII or image buffer data is logged during PrivacyPipeline execution', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockFaceDetector = {
      getStatus: () => 'READY',
      detectFaces: async () => [{ id: 'f1', box: { x: 10, y: 10, width: 30, height: 30 }, confidence: 0.9 }]
    };
    const mockOcrEngine = {
      getStatus: () => 'READY',
      recognizeText: async () => [
        { id: 'o1', text: 'confidential.email@secret.org', box: { x: 50, y: 10, width: 100, height: 20 }, confidence: 0.96 }
      ]
    };

    const pipeline = new PrivacyPipeline(
      mockFaceDetector as any,
      mockOcrEngine as any,
      new PiiClassifier(),
      undefined,
      undefined,
      undefined
    );

    const inputImage = {
      width: 150,
      height: 150,
      metadata: { width: 150, height: 150, name: 'sensitive_test_image.png', size: 5000 }
    };

    const res = await pipeline.protectImage(inputImage);
    expect(res.status).toBeDefined();

    const loggedOutput = [
      ...consoleLogSpy.mock.calls.flat(),
      ...consoleErrorSpy.mock.calls.flat()
    ].map(String);

    expect(loggedOutput.some((s) => s.includes('confidential.email@secret.org'))).toBe(false);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
