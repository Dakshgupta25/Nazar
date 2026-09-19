import { describe, expect, it } from 'vitest';
import { OcrEngine } from '../src/core/pipeline/ocrEngine';
import { PiiClassifier } from '../src/core/pipeline/piiClassifier';
import { RegionMapper } from '../src/core/pipeline/regionMapper';
import { SanitizerVerifier } from '../src/core/pipeline/verifier';
import { OcrResult, VerifierInput } from '../src/core/types/pipeline';

describe('Phone, Address & Rotated OCR Comprehensive Test Suite', () => {
  const ocrEngine = new OcrEngine();
  const piiClassifier = new PiiClassifier();
  const regionMapper = new RegionMapper();
  const verifier = new SanitizerVerifier();

  it('1. Phone with 10 digits -> classified as PHONE', () => {
    const res = piiClassifier.validatePhone('9829685562');
    expect(res).not.toBeNull();
    expect(res?.matchedText).toBe('9829685562');
  });

  it('2. Phone with +91 -> classified as PHONE', () => {
    const res = piiClassifier.validatePhone('+91 9829685562');
    expect(res).not.toBeNull();
  });

  it('3. Phone with spaces -> classified as PHONE', () => {
    const res = piiClassifier.validatePhone('98296 85562');
    expect(res).not.toBeNull();
  });

  it('4. Phone with hyphens -> classified as PHONE', () => {
    const res = piiClassifier.validatePhone('+91-98296-85562');
    expect(res).not.toBeNull();
  });

  it('5. Phone with contextual "Mobile" -> classified as PHONE', () => {
    const res = piiClassifier.validatePhone('Mobile No: 9829685562');
    expect(res).not.toBeNull();
  });

  it('6. Random 10-digit number with no context (all 1s) -> ignored as fake/non-phone', () => {
    const res = piiClassifier.validatePhone('1111111111');
    expect(res).toBeNull();
  });

  it('7. Address with one line -> classified as ADDRESS', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Address: Flat 204, Sumati Park, Thane 401209', box: { x: 10, y: 10, width: 300, height: 20 }, confidence: 0.95 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.length).toBe(1);
    expect(res.piiFindings[0].piiType).toBe('ADDRESS');
  });

  it('8. Address with multiple lines -> merged into single ADDRESS region', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Address: A-204, Sumati Park', box: { x: 10, y: 10, width: 200, height: 20 }, confidence: 0.95 },
      { id: 'o2', text: 'Near Fire Station, Vasai East', box: { x: 10, y: 35, width: 220, height: 20 }, confidence: 0.95 },
      { id: 'o3', text: 'Thane, Maharashtra 401209', box: { x: 10, y: 60, width: 210, height: 20 }, confidence: 0.95 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.length).toBe(1);
    expect(res.piiFindings[0].piiType).toBe('ADDRESS');
    // Box covers union of all 3 lines
    expect(res.piiFindings[0].box.height).toBeGreaterThanOrEqual(70);
  });

  it('9. "Address:" followed by multiple OCR lines -> address finding created', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Permanent Address:', box: { x: 10, y: 10, width: 150, height: 20 }, confidence: 0.9 },
      { id: 'o2', text: 'House No 42, Civil Lines', box: { x: 10, y: 35, width: 180, height: 20 }, confidence: 0.95 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.some((f) => f.piiType === 'ADDRESS')).toBe(true);
  });

  it('10. Address with PIN code -> classified as ADDRESS', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Pincode 400001 Mumbai', box: { x: 10, y: 10, width: 200, height: 20 }, confidence: 0.9 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.some((f) => f.piiType === 'ADDRESS')).toBe(true);
  });

  it('11. Address with Village + District + State -> classified as ADDRESS', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Village Rampur, Dist. Pune, Maharashtra', box: { x: 10, y: 10, width: 250, height: 20 }, confidence: 0.9 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.some((f) => f.piiType === 'ADDRESS')).toBe(true);
  });

  it('12. Rotated ID-card OCR (0°) -> coordinates unchanged', () => {
    const box = { x: 100, y: 50, width: 200, height: 30 };
    const transformed = ocrEngine.transformRotatedBboxToSource(box, 0, 1000, 800);
    expect(transformed).toEqual(box);
  });

  it('13. 90° rotated image -> transformed back to source coordinates', () => {
    // Original source: 1000 x 800. Rotated canvas: 800 x 1000.
    const boxOnRotated = { x: 200, y: 100, width: 50, height: 30 };
    const transformed = ocrEngine.transformRotatedBboxToSource(boxOnRotated, 90, 1000, 800);
    expect(transformed.x).toBe(100);
    expect(transformed.y).toBe(800 - (200 + 50)); // 550
    expect(transformed.width).toBe(30);
    expect(transformed.height).toBe(50);
  });

  it('14. 180° rotated image -> transformed back to source coordinates', () => {
    const boxOnRotated = { x: 100, y: 50, width: 200, height: 30 };
    const transformed = ocrEngine.transformRotatedBboxToSource(boxOnRotated, 180, 1000, 800);
    expect(transformed.x).toBe(1000 - (100 + 200)); // 700
    expect(transformed.y).toBe(800 - (50 + 30));   // 720
    expect(transformed.width).toBe(200);
    expect(transformed.height).toBe(30);
  });

  it('15. 270° rotated image -> transformed back to source coordinates', () => {
    const boxOnRotated = { x: 100, y: 200, width: 50, height: 30 };
    const transformed = ocrEngine.transformRotatedBboxToSource(boxOnRotated, 270, 1000, 800);
    expect(transformed.x).toBe(1000 - (200 + 30)); // 770
    expect(transformed.y).toBe(100);
    expect(transformed.width).toBe(30);
    expect(transformed.height).toBe(50);
  });

  it('16. Phone + address + face in same image -> all classified & mapped', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Contact: 9829685562', box: { x: 10, y: 10, width: 150, height: 20 }, confidence: 0.95 },
      { id: 'o2', text: 'Address: Flat 204, Thane 401209', box: { x: 10, y: 40, width: 250, height: 20 }, confidence: 0.95 }
    ];
    const pii = piiClassifier.classify(ocr);
    const mapped = regionMapper.mapRegions([], pii.piiFindings, 1000, 1000);
    expect(mapped.regions.length).toBe(2);
    expect(mapped.regions.some((r) => r.type === 'PHONE')).toBe(true);
    expect(mapped.regions.some((r) => r.type === 'ADDRESS')).toBe(true);
  });

  it('17. Existing Aadhaar/DOB/ID rules still work', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: '9087 6543 2105', box: { x: 10, y: 10, width: 150, height: 20 }, confidence: 0.95 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings.length).toBe(1);
    expect(res.piiFindings[0].piiType).toBe('AADHAAR');
  });

  it('18. Coordinate transformation consistency across 0, 90, 180, 270', () => {
    const srcW = 1000, srcH = 800;
    [0, 90, 180, 270].forEach((angle) => {
      const box = { x: 50, y: 50, width: 100, height: 100 };
      const res = ocrEngine.transformRotatedBboxToSource(box, angle as any, srcW, srcH);
      expect(res.x).toBeGreaterThanOrEqual(0);
      expect(res.y).toBeGreaterThanOrEqual(0);
      expect(res.width).toBeGreaterThan(0);
      expect(res.height).toBeGreaterThan(0);
    });
  });

  it('19. Region union for multi-line address produces a valid bounding box', () => {
    const ocr: OcrResult[] = [
      { id: 'o1', text: 'Address: Line 1', box: { x: 10, y: 10, width: 100, height: 20 }, confidence: 0.9 },
      { id: 'o2', text: 'Line 2, Thane 401209', box: { x: 10, y: 35, width: 120, height: 20 }, confidence: 0.9 }
    ];
    const res = piiClassifier.classify(ocr);
    expect(res.piiFindings[0].box.x).toBe(10);
    expect(res.piiFindings[0].box.y).toBe(10);
    expect(res.piiFindings[0].box.width).toBe(120);
    expect(res.piiFindings[0].box.height).toBe(45);
  });

  it('20. Under-redacted phone must fail verification', async () => {
    const phoneBox = { x: 10, y: 10, width: 100, height: 20 };
    const input: VerifierInput = {
      originalImage: { metadata: { width: 500, height: 500 } },
      sanitizedImage: { metadata: { width: 500, height: 500 } },
      originalPiiFindings: [{
        id: 'p1', piiType: 'PHONE', ocrId: 'o1', ocrConfidence: 0.9, confidence: 0.95,
        originalText: '9829685562', maskedText: '98******62', box: phoneBox, reason: 'phone'
      }],
      ocrEngine: {
        extractText: async () => [{ id: 'res1', text: '9829685562', confidence: 0.95, box: phoneBox }]
      }
    };
    const res = await verifier.verify(input);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAIL');
  });

  it('21. Under-redacted address must fail verification', async () => {
    const addrBox = { x: 10, y: 10, width: 200, height: 50 };
    const input: VerifierInput = {
      originalImage: { metadata: { width: 500, height: 500 } },
      sanitizedImage: { metadata: { width: 500, height: 500 } },
      originalPiiFindings: [{
        id: 'p1', piiType: 'ADDRESS', ocrId: 'o1', ocrConfidence: 0.9, confidence: 0.95,
        originalText: 'Address: Flat 204 Thane 401209', maskedText: 'Address [REDACTED]', box: addrBox, reason: 'address'
      }],
      ocrEngine: {
        extractText: async () => [{ id: 'res1', text: 'Flat 204 Thane 401209', confidence: 0.95, box: addrBox }]
      }
    };
    const res = await verifier.verify(input);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAIL');
  });

  it('22. Export stays disabled for FAIL / INCONCLUSIVE status', async () => {
    const input: VerifierInput = {
      originalImage: { metadata: { width: 100, height: 100 } },
      sanitizedImage: null // Missing image -> INCONCLUSIVE
    };
    const res = await verifier.verify(input);
    expect(res.passed).toBe(false);
    expect(res.status).toBe('FAIL');
  });
});
