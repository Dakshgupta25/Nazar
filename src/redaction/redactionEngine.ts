/**
 * NAZAR Redaction Engine (Phase 3 Core Pipeline):
 * Orchestrates precise local redaction across both visual context (images/pixel buffers)
 * and structured context (DOM trees and form models).
 *
 * Guarantees:
 * 1. Smallest practical redaction region with safety padding.
 * 2. Full context preservation around sensitive areas.
 * 3. Never mutates original source data (clean separation in memory).
 * 4. Zero sensitive values exposed in logs or errors.
 * 5. Automated residual-scan safety check prior to egress approval.
 */

import { ExtractedDomContext } from '../types/dom';
import { DetectedRegion, SensitiveCategory } from '../types/privacy';
import {
  RedactionAuditMetadata,
  RedactionItem,
  RedactionMode,
  RedactionOptions,
  SanitizedImageData,
  SanitizedResult,
  SanitizedStructuredContext,
} from '../types/redaction';
import { expandBoundingBox, resolveRedactionOverlaps } from './geometry';
import { PixelBuffer, redactPixelBuffer } from './pixelRedactor';
import { redactStructuredContext } from './structuredRedactor';
import { formatRedactionLabel } from '../privacy/fusionEngine';

export interface RedactionPipelineInput {
  image?: PixelBuffer;
  dom?: ExtractedDomContext;
  detections: DetectedRegion[];
}

/**
 * Transforms raw detected privacy regions into sanitized redaction instructions
 * with safety margin padding and overlap resolution.
 */
export function createRedactionItems(
  detections: DetectedRegion[],
  options: RedactionOptions = {},
  imageBounds?: { width: number; height: number }
): RedactionItem[] {
  const padding = options.paddingPx !== undefined ? options.paddingPx : 4;

  const rawItems: RedactionItem[] = detections.map((det, index) => {
    const mode: RedactionMode =
      options.defaultMode ||
      (det.recommendedRedaction as RedactionMode) ||
      'semantic_label';

    const paddedBox = expandBoundingBox(det.boundingBox, padding, imageBounds);

    return {
      id: `redact_${Date.now()}_${index}`,
      detectionId: det.id,
      category: det.category,
      mode,
      label: det.label || formatRedactionLabel(det.category),
      boundingBox: paddedBox,
      originalBoundingBox: { ...det.boundingBox },
      appliedPadding: padding,
      timestamp: Date.now(),
    };
  });

  // Resolve spatial overlaps to prevent double-redaction seams
  return resolveRedactionOverlaps(rawItems);
}

/**
 * Generates audit statistics for the applied redactions.
 */
function compileAuditMetadata(
  items: RedactionItem[],
  processingTimeMs: number
): RedactionAuditMetadata {
  const byCategory: Partial<Record<SensitiveCategory, number>> = {};
  const byMode: Partial<Record<RedactionMode, number>> = {};
  let totalPadding = 0;

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byMode[item.mode] = (byMode[item.mode] || 0) + 1;
    totalPadding += item.appliedPadding;
  }

  return {
    totalRedactions: items.length,
    byCategory,
    byMode,
    averagePadding: items.length > 0 ? Math.round(totalPadding / items.length) : 0,
    processingTimeMs,
  };
}

/**
 * Executes the complete NAZAR Phase 3 Redaction Pipeline.
 */
export async function executeRedaction(
  input: RedactionPipelineInput,
  options: RedactionOptions = {}
): Promise<SanitizedResult> {
  const startTime = performance.now();
  const sanitizationId = `sanitized_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const imageBounds = input.image
    ? { width: input.image.width, height: input.image.height }
    : undefined;

  // 1. Create expanded and overlap-resolved redaction items
  const items = createRedactionItems(input.detections, options, imageBounds);

  // 2. Redact pixel buffer / visual context if present
  let sanitizedImage: SanitizedImageData | undefined;
  if (input.image) {
    sanitizedImage = redactPixelBuffer(input.image, items, options);
  }

  // 3. Redact structured DOM context if present
  let sanitizedDom: SanitizedStructuredContext | undefined;
  let residualScanPassed = true;
  let residualViolations: string[] = [];

  if (input.dom) {
    const domResult = redactStructuredContext(input.dom, items, options);
    sanitizedDom = domResult.sanitizedDom;
    residualScanPassed = domResult.residualScanPassed;
    residualViolations = domResult.residualViolations;
  }

  const processingTimeMs = Math.round(performance.now() - startTime);
  const metadata = compileAuditMetadata(items, processingTimeMs);

  return {
    sanitizationId,
    timestamp: Date.now(),
    items,
    sanitizedImage,
    sanitizedDom,
    residualScanPassed,
    residualViolations,
    metadata,
  };
}
