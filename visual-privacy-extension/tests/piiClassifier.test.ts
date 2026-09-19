import { describe, it, expect, beforeEach } from 'vitest';
import { PiiClassifier, maskText } from '../src/core/pipeline/piiClassifier';
import { OcrResult } from '../src/core/types/pipeline';

describe('PiiClassifier Unit Tests', () => {
  let classifier: PiiClassifier;

  beforeEach(() => {
    classifier = new PiiClassifier();
  });

  const createOcrItem = (id: string, text: string, confidence = 0.9, box = { x: 10, y: 20, width: 100, height: 30 }): OcrResult => ({
    id,
    text,
    confidence,
    box
  });

  describe('Email Classification & Masking', () => {
    it('detects valid email addresses and returns PiiFinding with masked text', () => {
      const items: OcrResult[] = [createOcrItem('ocr-1', 'Contact us at test.user@example.com for help.')];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('EMAIL');
      expect(finding.originalText).toBe('test.user@example.com');
      expect(finding.maskedText).toContain('t***r@example.com');
      expect(finding.confidence).toBeGreaterThanOrEqual(0.95);
      expect(finding.ocrId).toBe('ocr-1');
      expect(finding.ocrConfidence).toBe(0.9);
      expect(finding.box).toEqual({ x: 10, y: 20, width: 100, height: 30 });
    });
  });

  describe('Indian Phone Classification & Rejection', () => {
    it('detects valid Indian phone numbers with +91 prefix', () => {
      const items: OcrResult[] = [createOcrItem('ocr-phone1', 'Call +91 9876543210 immediately')];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('PHONE');
      expect(finding.originalText).toContain('9876543210');
      expect(finding.maskedText).toBe('98******10');
    });

    it('rejects dummy phone numbers like 1234567890 or 0000000000', () => {
      const items: OcrResult[] = [
        createOcrItem('dummy-1', 'Phone: 1234567890'),
        createOcrItem('dummy-2', 'Call 0000000000')
      ];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(0);
      expect(result.nonSensitiveResults).toHaveLength(2);
    });
  });

  describe('Indian PAN Card Classification', () => {
    it('detects valid Indian PAN numbers (5 letters, 4 digits, 1 letter with entity character)', () => {
      const items: OcrResult[] = [createOcrItem('ocr-pan', 'PAN: ABCPE1234F')];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('PAN');
      expect(finding.originalText).toBe('ABCPE1234F');
      expect(finding.maskedText).toBe('AB***1234F');
      expect(finding.reason).toContain('Individual');
    });

    it('rejects invalid PAN strings with bad entity characters or structure', () => {
      const items: OcrResult[] = [createOcrItem('ocr-pan-bad', 'PAN: ABCDZ1234F')]; // 'Z' is not valid entity
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(0);
    });
  });

  describe('Indian Aadhaar Card Classification & Verhoeff Checksum', () => {
    it('detects valid 12-digit Aadhaar number passing Verhoeff checksum', () => {
      const validAadhaar = '4279 9999 9999';
      const items: OcrResult[] = [createOcrItem('ocr-aadhaar', `Aadhaar: ${validAadhaar}`)];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('AADHAAR');
      expect(finding.maskedText).toBe('4279 **** 9999');
    });

    it('rejects 12-digit repetitive dummy numbers like 1111 1111 1111', () => {
      const invalidAadhaar = '1111 1111 1111'; // repetitive dummy sequence
      const items: OcrResult[] = [createOcrItem('ocr-aadhaar-invalid', invalidAadhaar)];
      const result = classifier.classify(items);

      const aadhaarFinding = result.piiFindings.find((f) => f.piiType === 'AADHAAR');
      expect(aadhaarFinding).toBeUndefined();
    });
  });

  describe('Credit Card Classification & Luhn Checksum', () => {
    it('detects valid credit card number passing Luhn algorithm', () => {
      // Visa test card: 4532 0151 1283 0366 (valid Luhn)
      const validCard = '4532 0151 1283 0366';
      const items: OcrResult[] = [createOcrItem('ocr-card', `Card Number: ${validCard}`)];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('CREDIT_CARD');
      expect(finding.maskedText).toBe('4532 **** **** 0366');
    });

    it('rejects 16-digit numbers failing Luhn algorithm', () => {
      const invalidCard = '4532 0151 1283 0367'; // fails Luhn (sum = 65)
      const items: OcrResult[] = [createOcrItem('ocr-card-invalid', invalidCard)];
      const result = classifier.classify(items);

      const cardFinding = result.piiFindings.find((f) => f.piiType === 'CREDIT_CARD');
      expect(cardFinding).toBeUndefined();
    });
  });

  describe('Bank Account & IFSC Classification', () => {
    it('detects IFSC code and Bank Account number', () => {
      const items: OcrResult[] = [
        createOcrItem('ocr-ifsc', 'IFSC Code: SBIN0001234'),
        createOcrItem('ocr-acc', 'Account No: 123456789012')
      ];
      const result = classifier.classify(items);

      expect(result.piiFindings.length).toBeGreaterThanOrEqual(1);
      const ifscFinding = result.piiFindings.find((f) => f.piiType === 'BANK_ACCOUNT');
      expect(ifscFinding).toBeDefined();
    });
  });

  describe('URL Classification', () => {
    it('detects sensitive URLs containing login or auth endpoints', () => {
      const items: OcrResult[] = [createOcrItem('ocr-url', 'https://auth.example.com/login?token=xyz')];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(1);
      const finding = result.piiFindings[0];
      expect(finding.piiType).toBe('URL');
      expect(finding.maskedText).toBe('auth.example.com/***');
    });
  });

  describe('Non-PII & False Positive Rejection', () => {
    it('rejects general text, headers, and capitalized words without falsely flagging as PII', () => {
      const items: OcrResult[] = [
        createOcrItem('1', 'TAX INVOICE'),
        createOcrItem('2', 'Total Amount Due: $150.00'),
        createOcrItem('3', 'Thank you for your business!'),
        createOcrItem('4', 'Item Description: Widget A')
      ];
      const result = classifier.classify(items);

      expect(result.piiFindings).toHaveLength(0);
      expect(result.nonSensitiveResults).toHaveLength(4);
    });
  });

  describe('Mask Text Helper Verification', () => {
    it('masks emails properly', () => {
      expect(maskText('admin@company.org', 'EMAIL')).toBe('a***n@company.org');
    });

    it('masks phone numbers properly', () => {
      expect(maskText('9876543210', 'PHONE')).toBe('98******10');
    });

    it('masks credit cards properly', () => {
      expect(maskText('4532015112830366', 'CREDIT_CARD')).toBe('4532 **** **** 0366');
    });
  });
});
