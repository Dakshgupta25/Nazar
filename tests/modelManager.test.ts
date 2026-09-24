/**
 * NAZAR Phase 8 — Model Manager & Offline Operation Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelManager } from '../src/modelManager/modelManager';
import { computeSha256Hex, verifyAssetIntegrity } from '../src/modelManager/modelVerifier';
import { NAZAR_MODEL_REGISTRY, getModelManifestList } from '../src/modelManager/modelManifest';
import { saveModelAsset, loadModelAsset, clearAllModelAssets } from '../src/modelManager/modelStorage';
import { runPrivacyScan } from '../src/privacy/privacyEngine';
import { scanLocalImage } from '../src/imageFilter/imagePrivacyEngine';
import { CapturedContextPayload } from '../src/types/messages';

describe('NAZAR Phase 8 — Model Manager & Offline Operation', () => {
  let manager: ModelManager;

  beforeEach(async () => {
    ModelManager.resetInstance();
    await clearAllModelAssets();
    manager = ModelManager.getInstance();
  });

  describe('Model Manifest & Registry', () => {
    it('defines official models for OCR, Face Detection, and PII Detection', () => {
      const models = getModelManifestList();
      expect(models.length).toBe(3);

      const ocr = NAZAR_MODEL_REGISTRY.ocr;
      expect(ocr.name).toContain('OCR');
      expect(ocr.sha256).toHaveLength(64);
      expect(ocr.license).toBe('Apache-2.0');

      const face = NAZAR_MODEL_REGISTRY.face_detection;
      expect(face.name).toContain('Face');
      expect(face.sha256).toHaveLength(64);

      const pii = NAZAR_MODEL_REGISTRY.pii_detection;
      expect(pii.name).toContain('PII');
      expect(pii.sha256).toHaveLength(64);
    });
  });

  describe('Cryptographic Integrity Verification', () => {
    it('computes 64-character hexadecimal SHA-256 hash', async () => {
      const data = new TextEncoder().encode('NAZAR_INTEGRITY_TEST_PAYLOAD').buffer;
      const hash = await computeSha256Hex(data);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('verifies valid asset integrity against matching hash', async () => {
      const data = new TextEncoder().encode('MATCHING_DATA').buffer;
      const expectedHash = await computeSha256Hex(data);

      const result = await verifyAssetIntegrity(data, expectedHash);
      expect(result.verified).toBe(true);
      expect(result.actualSha256).toBe(expectedHash);
    });

    it('rejects corrupted asset with checksum mismatch', async () => {
      const data = new TextEncoder().encode('GENUINE_DATA').buffer;
      const corruptedData = new TextEncoder().encode('TAMPERED_DATA').buffer;
      const genuineHash = await computeSha256Hex(data);

      const result = await verifyAssetIntegrity(corruptedData, genuineHash);
      expect(result.verified).toBe(false);
      expect(result.actualSha256).not.toBe(genuineHash);
    });
  });

  describe('Asset Detection & Local Storage', () => {
    it('detects missing model assets on clean initialization', async () => {
      const health = await manager.detectInstalledModels();
      expect(health.overallStatus).toBe('blocked');
      expect(health.isOfflineReady).toBe(false);
      expect(health.missingCapabilities).toContain('ocr');
      expect(health.missingCapabilities).toContain('face_detection');
      expect(health.missingCapabilities).toContain('pii_detection');
    });

    it('detects installed model and transitions capability to ready', async () => {
      const ocrMeta = NAZAR_MODEL_REGISTRY.ocr;
      const validPayload = new TextEncoder().encode('OCR_MODEL_DATA').buffer;
      const validHash = await computeSha256Hex(validPayload);

      // Temporarily set expected hash to test payload
      ocrMeta.sha256 = validHash;

      await saveModelAsset({
        id: ocrMeta.id,
        version: ocrMeta.version,
        data: validPayload,
        sha256: validHash,
        installedAt: Date.now(),
        sizeBytes: validPayload.byteLength,
      });

      const health = await manager.detectInstalledModels();
      expect(health.capabilities.ocr.status).toBe('ready');
      expect(health.capabilities.ocr.verified).toBe(true);
    });

    it('detects corrupted stored asset, purges it, and sets status to corrupted', async () => {
      const piiMeta = NAZAR_MODEL_REGISTRY.pii_detection;
      const corruptedPayload = new TextEncoder().encode('CORRUPTED_PII_DATA').buffer;

      await saveModelAsset({
        id: piiMeta.id,
        version: piiMeta.version,
        data: corruptedPayload,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        installedAt: Date.now(),
        sizeBytes: corruptedPayload.byteLength,
      });

      const health = await manager.detectInstalledModels();
      expect(health.capabilities.pii_detection.status).toBe('corrupted');
      expect(health.capabilities.pii_detection.verified).toBe(false);
      expect(health.capabilities.pii_detection.errorMessage).toContain('Integrity check failed');

      // Stored corrupted asset should have been purged
      const stored = await loadModelAsset(piiMeta.id);
      expect(stored).toBeNull();
    });
  });

  describe('Download Lifecycle & Resiliency', () => {
    it('downloads model and verifies integrity via registered payload', async () => {
      const faceMeta = NAZAR_MODEL_REGISTRY.face_detection;
      const payload = new TextEncoder().encode('FACE_MODEL_PAYLOAD').buffer;
      const hash = await computeSha256Hex(payload);
      faceMeta.sha256 = hash;

      manager.registerSyntheticPayload(faceMeta.id, payload);

      let reportedProgress = 0;
      const downloaded = await manager.downloadModel('face_detection', (p) => {
        reportedProgress = p.percentage;
      });

      expect(downloaded).toBeDefined();
      expect(downloaded.sha256).toBe(hash);
      expect(reportedProgress).toBe(100);

      const health = manager.getPrivacyEngineHealth();
      expect(health.capabilities.face_detection.status).toBe('ready');
      expect(health.capabilities.face_detection.verified).toBe(true);
    });

    it('avoids repeated downloads when model is already installed and verified', async () => {
      const faceMeta = NAZAR_MODEL_REGISTRY.face_detection;
      const payload = new TextEncoder().encode('CACHED_FACE_PAYLOAD').buffer;
      const hash = await computeSha256Hex(payload);
      faceMeta.sha256 = hash;

      manager.registerSyntheticPayload(faceMeta.id, payload);
      const first = await manager.downloadModel('face_detection');

      // Download again — should return existing asset
      const second = await manager.downloadModel('face_detection');
      expect(second.installedAt).toBe(first.installedAt);
    });

    it('handles interrupted downloads and marks status interrupted', async () => {
      const controller = new AbortController();

      // Trigger abort immediately
      controller.abort();

      await expect(
        manager.downloadModel('ocr', undefined, controller.signal)
      ).rejects.toThrow();

      const health = manager.getPrivacyEngineHealth();
      expect(health.capabilities.ocr.status).toBe('interrupted');
    });

    it('handles download corruption and marks status corrupted', async () => {
      const ocrMeta = NAZAR_MODEL_REGISTRY.ocr;
      const badPayload = new TextEncoder().encode('BAD_PAYLOAD').buffer;
      // Set expected hash to something completely different
      ocrMeta.sha256 = '1111111111111111111111111111111111111111111111111111111111111111';
      manager.registerSyntheticPayload(ocrMeta.id, badPayload);

      await expect(manager.downloadModel('ocr')).rejects.toThrow(/corrupted/i);

      const health = manager.getPrivacyEngineHealth();
      expect(health.capabilities.ocr.status).toBe('corrupted');
      expect(health.capabilities.ocr.verified).toBe(false);
    });
  });

  describe('Fail-Closed Capability Enforcement', () => {
    it('blocks processing when required capabilities are missing', () => {
      const check = manager.verifyCapabilitiesOrBlock(['ocr', 'pii_detection']);
      expect(check.allowed).toBe(false);
      expect(check.missingCapabilities).toEqual(['ocr', 'pii_detection']);
      expect(check.reason).toContain('FAIL-CLOSED PRIVACY BLOCK');
      expect(check.reason).toContain('Raw data transmission is blocked');
    });

    it('allows processing only when all required capabilities are ready', async () => {
      // Seed all 3 models as ready
      for (const cap of ['ocr', 'face_detection', 'pii_detection'] as const) {
        const meta = NAZAR_MODEL_REGISTRY[cap];
        const payload = new TextEncoder().encode(`PAYLOAD_${cap}`).buffer;
        const hash = await computeSha256Hex(payload);
        meta.sha256 = hash;
        manager.registerSyntheticPayload(meta.id, payload);
        await manager.downloadModel(cap);
      }

      const check = manager.verifyCapabilitiesOrBlock(['ocr', 'face_detection', 'pii_detection']);
      expect(check.allowed).toBe(true);
      expect(check.missingCapabilities).toHaveLength(0);
    });

    it('integrates with runPrivacyScan and fails closed when enforceModelCapabilities is true', async () => {
      const mockCaptured: CapturedContextPayload = {
        tabId: 1,
        url: 'https://test.local',
        title: 'Test',
        timestamp: Date.now(),
        screenshotDataUrl: 'data:image/png;base64,mock',
        dom: {
          url: 'https://test.local',
          title: 'Test',
          timestamp: Date.now(),
          viewport: { width: 100, height: 100, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
          elements: [],
          stats: {
            totalElements: 0,
            interactiveCount: 0,
            sensitiveCandidateCount: 0,
            formsCount: 0,
          },
        },
      };

      // When models are missing, runPrivacyScan must fail closed and throw
      await expect(
        runPrivacyScan(mockCaptured, { enforceModelCapabilities: true })
      ).rejects.toThrow(/FAIL-CLOSED PRIVACY BLOCK/);
    });

    it('integrates with scanLocalImage and fails closed when enforceModelCapabilities is true', async () => {
      const mockSvg = `data:image/svg+xml;utf8,<svg><text>test</text></svg>`;

      // When models are missing, scanLocalImage must fail closed and throw
      await expect(
        scanLocalImage(mockSvg, { enforceModelCapabilities: true })
      ).rejects.toThrow(/FAIL-CLOSED PRIVACY BLOCK/);
    });
  });

  describe('Offline Operation Readiness', () => {
    it('reports offline ready false when any model is missing', () => {
      expect(manager.isOfflineReady()).toBe(false);
    });

    it('reports offline ready true when all models are verified in local storage', async () => {
      for (const cap of ['ocr', 'face_detection', 'pii_detection'] as const) {
        const meta = NAZAR_MODEL_REGISTRY[cap];
        const payload = new TextEncoder().encode(`OFFLINE_PAYLOAD_${cap}`).buffer;
        const hash = await computeSha256Hex(payload);
        meta.sha256 = hash;
        manager.registerSyntheticPayload(meta.id, payload);
        await manager.downloadModel(cap);
      }

      expect(manager.isOfflineReady()).toBe(true);

      const health = manager.getPrivacyEngineHealth();
      expect(health.overallStatus).toBe('ready');
      expect(health.isOfflineReady).toBe(true);
      expect(health.allVerified).toBe(true);
      expect(health.missingCapabilities).toHaveLength(0);
    });
  });
});
