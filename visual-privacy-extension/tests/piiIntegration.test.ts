import { describe, it, expect } from 'vitest';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { OcrResult } from '../src/core/types/pipeline';

describe('Phase 4 PII Classification Pipeline Integration Tests', () => {
  it('processes raw OCR results array through PiiClassifier and produces structured PiiClassificationResult', () => {
    const mockOcrResults: OcrResult[] = [
      {
        id: 'ocr-box-1',
        text: 'User Profile - Confidential',
        confidence: 0.92,
        box: { x: 50, y: 30, width: 220, height: 25 }
      },
      {
        id: 'ocr-box-2',
        text: 'Email: alex.privacy@domain.com',
        confidence: 0.96,
        box: { x: 50, y: 70, width: 280, height: 25 }
      },
      {
        id: 'ocr-box-3',
        text: 'PAN: ABCPE1234F',
        confidence: 0.98,
        box: { x: 50, y: 110, width: 180, height: 25 }
      },
      {
        id: 'ocr-box-4',
        text: 'Phone: +91 9123456789',
        confidence: 0.94,
        box: { x: 50, y: 150, width: 200, height: 25 }
      },
      {
        id: 'ocr-box-5',
        text: 'Standard Heading Text',
        confidence: 0.89,
        box: { x: 50, y: 190, width: 150, height: 25 }
      }
    ];

    const classifier = new PiiClassifier();
    const startTime = performance.now();
    const result = classifier.classify(mockOcrResults);
    const endTime = performance.now();

    expect(result).toBeDefined();
    expect(result.classificationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.classificationTimeMs).toBeLessThanOrEqual(endTime - startTime + 50);

    // Should find Email, PAN, Phone (3 PII findings)
    expect(result.piiFindings).toHaveLength(3);

    const emailFinding = result.piiFindings.find((f) => f.piiType === 'EMAIL');
    expect(emailFinding).toBeDefined();
    expect(emailFinding?.ocrId).toBe('ocr-box-2');
    expect(emailFinding?.maskedText).toContain('a***y@domain.com');

    const panFinding = result.piiFindings.find((f) => f.piiType === 'PAN');
    expect(panFinding).toBeDefined();
    expect(panFinding?.ocrId).toBe('ocr-box-3');
    expect(panFinding?.originalText).toBe('ABCPE1234F');

    const phoneFinding = result.piiFindings.find((f) => f.piiType === 'PHONE');
    expect(phoneFinding).toBeDefined();
    expect(phoneFinding?.ocrId).toBe('ocr-box-4');

    // Should classify 2 items as non-sensitive
    expect(result.nonSensitiveResults).toHaveLength(2);
    expect(result.nonSensitiveResults.map((r) => r.id)).toEqual(['ocr-box-1', 'ocr-box-5']);
  });
});
