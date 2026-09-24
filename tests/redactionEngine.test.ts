import { describe, it, expect } from 'vitest';
import {
  expandBoundingBox,
  doBoxesIntersect,
  resolveRedactionOverlaps,
} from '../src/redaction/geometry';
import {
  redactPixelBuffer,
  PixelBuffer,
} from '../src/redaction/pixelRedactor';
import {
  getSemanticReplacementToken,
  redactTextSurgically,
  redactStructuredContext,
  runResidualScan,
} from '../src/redaction/structuredRedactor';
import {
  createRedactionItems,
  executeRedaction,
} from '../src/redaction/redactionEngine';
import { BoundingBox, ExtractedDomContext, ExtractedDomElement } from '../src/types/dom';
import { DetectedRegion } from '../src/types/privacy';
import { RedactionItem } from '../src/types/redaction';

function createMockBox(x: number, y: number, width: number, height: number): BoundingBox {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

describe('NAZAR Phase 3 — Redaction Engine', () => {
  // -------------------------------------------------------------
  // 1. Geometry & Bounding Box Operations
  // -------------------------------------------------------------
  describe('Geometry & Bounding Box Operations', () => {
    it('expands bounding box by safety padding without overflowing bounds', () => {
      const box = createMockBox(10, 10, 50, 20);
      const expanded = expandBoundingBox(box, 5, { width: 100, height: 100 });

      expect(expanded.x).toBe(5);
      expect(expanded.y).toBe(5);
      expect(expanded.width).toBe(60);
      expect(expanded.height).toBe(30);
    });

    it('clamps expanded bounding box to canvas limits (0, maxBounds)', () => {
      const box = createMockBox(2, 2, 20, 20);
      const expanded = expandBoundingBox(box, 10, { width: 50, height: 50 });

      expect(expanded.x).toBe(0);
      expect(expanded.y).toBe(0);
      expect(expanded.left).toBe(0);
      expect(expanded.top).toBe(0);
      expect(expanded.right).toBe(32);
      expect(expanded.bottom).toBe(32);
    });

    it('detects intersecting vs non-intersecting boxes', () => {
      const b1 = createMockBox(0, 0, 50, 50);
      const b2 = createMockBox(30, 30, 50, 50);
      const b3 = createMockBox(100, 100, 20, 20);

      expect(doBoxesIntersect(b1, b2)).toBe(true);
      expect(doBoxesIntersect(b1, b3)).toBe(false);
    });

    it('resolves overlapping redactions and preserves the higher-protection mode', () => {
      const item1: RedactionItem = {
        id: 'r1',
        detectionId: 'd1',
        category: 'face',
        mode: 'blur',
        label: '[FACE REDACTED]',
        boundingBox: createMockBox(10, 10, 40, 40),
        originalBoundingBox: createMockBox(10, 10, 40, 40),
        appliedPadding: 4,
        timestamp: 1000,
      };

      const item2: RedactionItem = {
        id: 'r2',
        detectionId: 'd2',
        category: 'password',
        mode: 'solid_rectangle',
        label: '[PASSWORD REDACTED]',
        boundingBox: createMockBox(20, 20, 40, 40), // Overlaps r1
        originalBoundingBox: createMockBox(20, 20, 40, 40),
        appliedPadding: 4,
        timestamp: 1001,
      };

      const resolved = resolveRedactionOverlaps([item1, item2]);
      expect(resolved.length).toBe(1);
      // solid_rectangle takes precedence over blur
      expect(resolved[0].mode).toBe('solid_rectangle');
      // Bounding box is unioned
      expect(resolved[0].boundingBox.x).toBeLessThanOrEqual(10);
      expect(resolved[0].boundingBox.right).toBeGreaterThanOrEqual(60);
    });

    it('creates redaction items from detected regions with custom padding and labels', () => {
      const detections: DetectedRegion[] = [
        {
          id: 'det_1',
          category: 'email',
          confidence: 0.95,
          boundingBox: createMockBox(10, 10, 50, 20),
          source: 'regex_pattern',
          recommendedRedaction: 'semantic_label',
          label: '[EMAIL REDACTED]',
        },
      ];
      const items = createRedactionItems(detections, { paddingPx: 6 });
      expect(items.length).toBe(1);
      expect(items[0].appliedPadding).toBe(6);
      expect(items[0].boundingBox.x).toBe(4);
      expect(items[0].boundingBox.width).toBe(62);
    });
  });

  // -------------------------------------------------------------
  // 2. Semantic Text Redaction & Context Preservation
  // -------------------------------------------------------------
  describe('Semantic Redaction & Context Preservation', () => {
    it('redacts single PII while preserving surrounding text', () => {
      const text = 'Please reach out to support@test-domain.org for queries.';
      const res = redactTextSurgically(text);

      expect(res.sanitizedText).toBe('Please reach out to [EMAIL REDACTED] for queries.');
      expect(res.redactedCategories).toContain('email');
    });

    it('redacts multiple different PII items in one paragraph surgical replacement', () => {
      const text = 'User John at alice.sandbox@test-domain.org with phone (555) 019-2834.';
      const res = redactTextSurgically(text);

      expect(res.sanitizedText).toContain('[EMAIL REDACTED]');
      expect(res.sanitizedText).toContain('[PHONE REDACTED]');
      expect(res.sanitizedText).not.toContain('alice.sandbox@test-domain.org');
      expect(res.sanitizedText).not.toContain('(555) 019-2834');
      // Preserves non-sensitive prefix and suffix
      expect(res.sanitizedText.startsWith('User John at ')).toBe(true);
    });

    it('returns standardized tokens for all required sensitive categories', () => {
      expect(getSemanticReplacementToken('name')).toBe('[NAME REDACTED]');
      expect(getSemanticReplacementToken('email')).toBe('[EMAIL REDACTED]');
      expect(getSemanticReplacementToken('phone')).toBe('[PHONE REDACTED]');
      expect(getSemanticReplacementToken('address')).toBe('[ADDRESS REDACTED]');
      expect(getSemanticReplacementToken('credit_card')).toBe('[CARD NUMBER REDACTED]');
      expect(getSemanticReplacementToken('password')).toBe('[PASSWORD REDACTED]');
      expect(getSemanticReplacementToken('face')).toBe('[FACE REDACTED]');
      expect(getSemanticReplacementToken('api_key')).toBe('[API KEY REDACTED]');
    });
  });

  // -------------------------------------------------------------
  // 3. Structured Context (DOM) Redaction & Safety Scan
  // -------------------------------------------------------------
  describe('Structured Context & Residual-Scan Safety', () => {
    function createMockDom(): ExtractedDomContext {
      return {
        url: 'https://example.com/checkout',
        title: 'Checkout Form',
        timestamp: Date.now(),
        viewport: { width: 1024, height: 768, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
        elements: [
          {
            id: 'el-heading',
            tagName: 'h1',
            elementType: 'heading',
            selector: 'h1.title',
            boundingBox: createMockBox(50, 20, 300, 40),
            isVisible: true,
            isInteractive: false,
            attributes: {},
            textContent: 'Payment Information',
            isSensitiveCandidate: false,
          },
          {
            id: 'el-email',
            tagName: 'input',
            elementType: 'input',
            selector: 'input#email',
            boundingBox: createMockBox(50, 80, 200, 30),
            isVisible: true,
            isInteractive: true,
            attributes: { value: 'alice.sandbox@test-domain.org' },
            placeholder: 'alice.sandbox@test-domain.org',
            inputType: 'email',
            isSensitiveCandidate: true,
          },
          {
            id: 'el-notes',
            tagName: 'p',
            elementType: 'paragraph',
            selector: 'p.notes',
            boundingBox: createMockBox(50, 130, 400, 30),
            isVisible: true,
            isInteractive: false,
            attributes: {},
            textContent: 'Receipt will be sent to alice.sandbox@test-domain.org immediately.',
            isSensitiveCandidate: false,
          },
          {
            id: 'el-button',
            tagName: 'button',
            elementType: 'button',
            selector: 'button#submit',
            boundingBox: createMockBox(50, 180, 100, 35),
            isVisible: true,
            isInteractive: true,
            attributes: {},
            textContent: 'Submit Order',
            isSensitiveCandidate: false,
          },
        ],
        stats: { totalElements: 4, interactiveCount: 2, sensitiveCandidateCount: 1, formsCount: 1 },
      };
    }

    it('sanitizes DOM elements without mutating the original source object', () => {
      const original = createMockDom();
      const originalValue = original.elements[1].attributes.value;

      const items: RedactionItem[] = [
        {
          id: 'r_email',
          detectionId: 'd_email',
          category: 'email',
          mode: 'semantic_label',
          label: '[EMAIL REDACTED]',
          boundingBox: createMockBox(50, 80, 200, 30),
          originalBoundingBox: createMockBox(50, 80, 200, 30),
          appliedPadding: 4,
          timestamp: Date.now(),
        },
      ];

      const { sanitizedDom, residualScanPassed, residualViolations } = redactStructuredContext(
        original,
        items
      );

      // Verify original object is 100% untouched
      expect(original.elements[1].attributes.value).toBe(originalValue);

      // Verify sanitized DOM is sanitized
      expect(sanitizedDom.elements[1].attributes.value).toBe('[EMAIL REDACTED]');
      expect(sanitizedDom.elements[2].textContent).toBe(
        'Receipt will be sent to [EMAIL REDACTED] immediately.'
      );

      // Verify unrelated button and heading are untouched
      expect(sanitizedDom.elements[0].textContent).toBe('Payment Information');
      expect(sanitizedDom.elements[3].textContent).toBe('Submit Order');

      // Residual scan passed
      expect(residualScanPassed).toBe(true);
      expect(residualViolations.length).toBe(0);
    });

    it('catches residual unredacted PII and flags failure if sensitive text slips through', () => {
      const contaminatedElements: ExtractedDomElement[] = [
        {
          id: 'el-leak',
          tagName: 'span',
          elementType: 'other',
          selector: 'span.leak',
          boundingBox: createMockBox(0, 0, 100, 20),
          isVisible: true,
          isInteractive: false,
          attributes: { value: 'alice.sandbox@test-domain.org' },
          textContent: 'Secret key leaked',
          isSensitiveCandidate: false,
        },
      ];

      const res = runResidualScan(contaminatedElements);
      expect(res.passed).toBe(false);
      expect(res.violations.length).toBeGreaterThan(0);
      expect(res.violations[0]).toContain('Residual PII detected');
    });
  });

  // -------------------------------------------------------------
  // 4. Pixel Redaction: Solid, Blur, Pixelate, Semantic
  // -------------------------------------------------------------
  describe('Pixel Redaction Modes & Unrelated Region Protection', () => {
    function createMockImage(width = 100, height = 100, fillValue = 200): PixelBuffer {
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(fillValue);
      // Ensure alpha is 255
      for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
      }
      return { width, height, data };
    }

    it('does NOT mutate the input source image buffer', () => {
      const input = createMockImage(50, 50, 120);
      const originalSnapshot = new Uint8ClampedArray(input.data);

      const items: RedactionItem[] = [
        {
          id: 'r1',
          detectionId: 'd1',
          category: 'credit_card',
          mode: 'solid_rectangle',
          label: '[CARD NUMBER REDACTED]',
          boundingBox: createMockBox(10, 10, 20, 20),
          originalBoundingBox: createMockBox(10, 10, 20, 20),
          appliedPadding: 0,
          timestamp: Date.now(),
        },
      ];

      const sanitized = redactPixelBuffer(input, items);

      // Input buffer must remain identical to original snapshot
      expect(input.data).toEqual(originalSnapshot);
      // Sanitized buffer must differ
      expect(sanitized.data).not.toEqual(originalSnapshot);
    });

    it('preserves unrelated pixels outside the bounding box exactly', () => {
      const input = createMockImage(100, 100, 180);
      const items: RedactionItem[] = [
        {
          id: 'r1',
          detectionId: 'd1',
          category: 'password',
          mode: 'solid_rectangle',
          label: '[PASSWORD REDACTED]',
          boundingBox: createMockBox(20, 20, 30, 30),
          originalBoundingBox: createMockBox(20, 20, 30, 30),
          appliedPadding: 0,
          timestamp: Date.now(),
        },
      ];

      const sanitized = redactPixelBuffer(input, items);

      // Check pixel outside the box (e.g. at (5, 5))
      const idxUnrelated = (5 * 100 + 5) * 4;
      expect(sanitized.data[idxUnrelated]).toBe(180);
      expect(sanitized.data[idxUnrelated + 1]).toBe(180);
      expect(sanitized.data[idxUnrelated + 2]).toBe(180);

      // Check pixel inside the box (e.g. at (25, 25)) - slate fill
      const idxInside = (25 * 100 + 25) * 4;
      expect(sanitized.data[idxInside]).toBe(15); // slate-900 red
      expect(sanitized.data[idxInside + 1]).toBe(23); // slate-900 green
      expect(sanitized.data[idxInside + 2]).toBe(42); // slate-900 blue
    });

    it('applies pixelation / mosaic effect within bounding box', () => {
      const input = createMockImage(60, 60, 0);
      // Add gradient pattern inside target box
      for (let y = 10; y < 30; y++) {
        for (let x = 10; x < 30; x++) {
          const idx = (y * 60 + x) * 4;
          input.data[idx] = (x + y) * 3;
        }
      }

      const items: RedactionItem[] = [
        {
          id: 'r_pix',
          detectionId: 'd_pix',
          category: 'face',
          mode: 'pixelate',
          label: '[FACE REDACTED]',
          boundingBox: createMockBox(10, 10, 20, 20),
          originalBoundingBox: createMockBox(10, 10, 20, 20),
          appliedPadding: 0,
          timestamp: Date.now(),
        },
      ];

      const sanitized = redactPixelBuffer(input, items, { pixelateBlockSize: 8 });

      // Inside block [10..17, 10..17], pixels must have uniform average value
      const p1 = (11 * 60 + 11) * 4;
      const p2 = (14 * 60 + 14) * 4;
      expect(sanitized.data[p1]).toBe(sanitized.data[p2]);
    });

    it('applies local blur without modifying pixels outside box', () => {
      const input = createMockImage(50, 50, 50);
      // Sharp white line at y=20 inside box [10..30, 10..30]
      for (let x = 10; x < 30; x++) {
        const idx = (20 * 50 + x) * 4;
        input.data[idx] = 255;
      }

      const items: RedactionItem[] = [
        {
          id: 'r_blur',
          detectionId: 'd_blur',
          category: 'face',
          mode: 'blur',
          label: '[FACE REDACTED]',
          boundingBox: createMockBox(10, 10, 20, 20),
          originalBoundingBox: createMockBox(10, 10, 20, 20),
          appliedPadding: 0,
          timestamp: Date.now(),
        },
      ];

      const sanitized = redactPixelBuffer(input, items, { blurRadius: 4 });

      // Pixel at line center was 255, blurred should be smoothed downwards
      const idxCenter = (20 * 50 + 20) * 4;
      expect(sanitized.data[idxCenter]).toBeLessThan(255);
      expect(sanitized.data[idxCenter]).toBeGreaterThan(50);

      // Pixel outside box (0, 0) remains unchanged
      expect(sanitized.data[0]).toBe(50);
    });
  });

  // -------------------------------------------------------------
  // 5. Complex Scenarios: Face + Text, Multiple Faces, Full Pipeline
  // -------------------------------------------------------------
  describe('Full Pipeline: Face + Text, Multiple Faces & Audit', () => {
    it('redacts both face and text in a combined visual + structured pipeline', async () => {
      const imageBuffer: PixelBuffer = {
        width: 200,
        height: 200,
        data: new Uint8ClampedArray(200 * 200 * 4).fill(220),
      };

      const detections: DetectedRegion[] = [
        {
          id: 'det_face',
          category: 'face',
          confidence: 0.95,
          boundingBox: createMockBox(20, 20, 50, 50),
          source: 'face',
          recommendedRedaction: 'blur',
          label: '[FACE REDACTED]',
        },
        {
          id: 'det_email',
          category: 'email',
          confidence: 0.99,
          boundingBox: createMockBox(100, 150, 80, 25),
          source: 'regex_pattern',
          recommendedRedaction: 'semantic_label',
          label: '[EMAIL REDACTED]',
        },
      ];

      const result = await executeRedaction({
        image: imageBuffer,
        detections,
      });

      expect(result.items.length).toBe(2);
      expect(result.sanitizedImage).toBeDefined();
      expect(result.metadata.totalRedactions).toBe(2);
      expect(result.metadata.byCategory.face).toBe(1);
      expect(result.metadata.byCategory.email).toBe(1);
      expect(result.metadata.byMode.blur).toBe(1);
      expect(result.metadata.byMode.semantic_label).toBe(1);
      expect(result.residualScanPassed).toBe(true);
    });

    it('redacts multiple separate faces without leaking between them', async () => {
      const imageBuffer: PixelBuffer = {
        width: 300,
        height: 200,
        data: new Uint8ClampedArray(300 * 200 * 4).fill(150),
      };

      const detections: DetectedRegion[] = [
        {
          id: 'face_1',
          category: 'face',
          confidence: 0.92,
          boundingBox: createMockBox(20, 30, 40, 40),
          source: 'face',
          recommendedRedaction: 'blur',
          label: '[FACE REDACTED]',
        },
        {
          id: 'face_2',
          category: 'face',
          confidence: 0.94,
          boundingBox: createMockBox(120, 30, 40, 40),
          source: 'face',
          recommendedRedaction: 'blur',
          label: '[FACE REDACTED]',
        },
        {
          id: 'face_3',
          category: 'face',
          confidence: 0.88,
          boundingBox: createMockBox(220, 30, 40, 40),
          source: 'face',
          recommendedRedaction: 'blur',
          label: '[FACE REDACTED]',
        },
      ];

      const result = await executeRedaction({
        image: imageBuffer,
        detections,
      });

      expect(result.items.length).toBe(3);
      expect(result.metadata.byCategory.face).toBe(3);

      // Verify spacer region between face 1 and face 2 (e.g. x=80, y=50) was untouched
      const spacerIdx = (50 * 300 + 80) * 4;
      expect(result.sanitizedImage?.data[spacerIdx]).toBe(150);
    });
  });
});
