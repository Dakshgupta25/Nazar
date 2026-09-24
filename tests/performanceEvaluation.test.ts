import { describe, it, expect } from 'vitest';
import {
  measurePipelineLatencies,
  evaluateAllScenarios,
  evaluateDetectionQuality,
  runFullPhase10Evaluation,
  captureSystemResourceMetrics,
} from '../src/evaluation/benchmarkSuite';
import { RealWorldScenarioType } from '../src/types/evaluation';

describe('Phase 10 — Performance & Real-World Evaluation Suite', () => {
  it('measures real pipeline latencies across all 11 stages', async () => {
    const latencies = await measurePipelineLatencies();

    // Verify all 11 stages have measurable, non-negative latencies
    expect(latencies.extensionStartupMs).toBeGreaterThan(0);
    expect(latencies.modelLoadingMs).toBeGreaterThan(0);
    expect(latencies.screenshotCaptureMs).toBeGreaterThan(0);
    expect(latencies.domExtractionMs).toBeGreaterThan(0);
    expect(latencies.ocrMs).toBeGreaterThan(0);
    expect(latencies.faceDetectionMs).toBeGreaterThan(0);
    expect(latencies.piiDetectionMs).toBeGreaterThan(0);
    expect(latencies.fusionMs).toBeGreaterThan(0);
    expect(latencies.redactionMs).toBeGreaterThan(0);
    expect(latencies.previewRenderingMs).toBeGreaterThan(0);
    expect(latencies.endToEndPrivacyScanMs).toBeGreaterThan(0);

    // Latency sanity bounds: end-to-end local scan should complete in under 1000ms
    expect(latencies.endToEndPrivacyScanMs).toBeLessThan(1000);
    expect(latencies.piiDetectionMs).toBeLessThan(200);
    expect(latencies.fusionMs).toBeLessThan(100);
    expect(latencies.redactionMs).toBeLessThan(200);
  });

  it('captures system resource metrics without fabrication', () => {
    const resources = captureSystemResourceMetrics();

    // In Node / Vitest test runner, memory metrics should be numeric
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      expect(typeof resources.heapUsedBytes).toBe('number');
      expect(typeof resources.heapTotalBytes).toBe('number');
      expect(typeof resources.rssBytes).toBe('number');
      expect((resources.heapUsedBytes as number)).toBeGreaterThan(0);
    } else {
      expect(resources.heapUsedBytes).toBe('unmeasured');
    }

    if (typeof process !== 'undefined' && typeof process.cpuUsage === 'function') {
      expect(typeof resources.cpuUserMicroseconds).toBe('number');
      expect(typeof resources.cpuSystemMicroseconds).toBe('number');
    } else {
      expect(resources.cpuUserMicroseconds).toBe('unmeasured');
    }
  });

  it('evaluates all 12 required real-world page scenarios', async () => {
    const scenarios = await evaluateAllScenarios();

    const expectedScenarios: RealWorldScenarioType[] = [
      'normal_html',
      'large_page',
      'dynamic_react',
      'form_heavy',
      'image_heavy',
      'canvas_content',
      'pdf_embedded',
      'dark_mode',
      'light_mode',
      'low_resolution_image',
      'multiple_faces',
      'multiple_pii_regions',
    ];

    for (const key of expectedScenarios) {
      const res = scenarios[key];
      expect(res).toBeDefined();
      expect(res.scenario).toBe(key);
      expect(res.status).toBe('passed');
      expect(res.latencyMs).toBeGreaterThan(0);
      expect(res.latencyMs).toBeLessThan(1500); // Each scenario runs under 1.5s
      // contextPreservationRatio is a measured metric in [0,1]. No hard minimum is enforced
      // because some scenarios (e.g. form_heavy) legitimately have very high redaction coverage —
      // that IS the correct behaviour. Verification is that the metric is computed and valid.
      expect(res.contextPreservationRatio).toBeGreaterThanOrEqual(0);
      expect(res.contextPreservationRatio).toBeLessThanOrEqual(1);
    }

    // Specific scenario assertions
    // Large page scenario (600 elements)
    expect(scenarios.large_page.elementsAnalyzed).toBe(600);
    expect(scenarios.large_page.sensitiveRegionsDetected).toBeGreaterThanOrEqual(10);
    // Large page is 590 benign + 10 sensitive; most context is preserved
    expect(scenarios.large_page.contextPreservationRatio).toBeGreaterThanOrEqual(0.95);

    // Form heavy scenario (multiple sensitive fields)
    expect(scenarios.form_heavy.sensitiveRegionsDetected).toBeGreaterThanOrEqual(4);

    // Multiple PII regions scenario
    expect(scenarios.multiple_pii_regions.sensitiveRegionsDetected).toBeGreaterThanOrEqual(4);

    // Image heavy has 12 images none of which are sensitive — all content preserved
    expect(scenarios.image_heavy.contextPreservationRatio).toBeGreaterThanOrEqual(0.95);
  });

  it('evaluates detection quality with synthetic test data tracking precision, recall, and localization', () => {
    const quality = evaluateDetectionQuality();

    expect(quality.totalTestCases).toBeGreaterThanOrEqual(10);
    expect(quality.truePositives).toBeGreaterThan(0);
    expect(quality.precision).toBeGreaterThanOrEqual(0.9);
    expect(quality.recall).toBeGreaterThanOrEqual(0.85);
    expect(quality.f1Score).toBeGreaterThanOrEqual(0.85);
    expect(quality.localizationQuality).toBeGreaterThanOrEqual(0.9);
    expect(quality.contextPreservation).toBeGreaterThanOrEqual(0.9);

    // Latency statistics
    expect(quality.latency.averageMs).toBeGreaterThanOrEqual(0);
    expect(quality.latency.minMs).toBeGreaterThanOrEqual(0);
    expect(quality.latency.maxMs).toBeGreaterThanOrEqual(quality.latency.minMs);
    expect(quality.latency.p95Ms).toBeGreaterThanOrEqual(quality.latency.minMs);
  });

  it('generates a full comprehensive Phase 10 evaluation report', async () => {
    const report = await runFullPhase10Evaluation();

    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.pipelineLatency).toBeDefined();
    expect(Object.keys(report.scenarios).length).toBe(12);
    expect(report.quality).toBeDefined();
    expect(report.optimizationsApplied.length).toBeGreaterThan(0);
  });
});
