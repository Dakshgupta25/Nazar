import {
  BoundingBox,
  DetectedFace,
  PiiFinding,
  PiiType,
  PipelineStage,
  RegionMappingOptions,
  RegionMappingResult,
  SensitiveRegion,
  SensitiveRegionType
} from '../types/pipeline';
import { GeometryUtils, ImageDimensions } from '../geometry/geometryUtils';

export class RegionMapper implements PipelineStage<{
  faces: DetectedFace[];
  piiFindings: PiiFinding[];
  imageBounds: ImageDimensions;
  options?: RegionMappingOptions;
}, RegionMappingResult> {
  readonly name = 'RegionMapper';
  public static readonly DEFAULT_PADDING = 8;

  public async process(input: {
    faces: DetectedFace[];
    piiFindings: PiiFinding[];
    imageBounds: ImageDimensions;
    options?: RegionMappingOptions;
  }): Promise<RegionMappingResult> {
    return this.mapRegions(input.faces, input.piiFindings, input.imageBounds, undefined, input.options);
  }

  /**
   * Deterministically converts face detections and PII findings into canonical SensitiveRegion objects.
   * Supports both overload patterns:
   *  - mapRegions(faces, piiFindings, imageWidth, imageHeight, options)
   *  - mapRegions(faces, piiFindings, { width, height }, options)
   */
  public mapRegions(
    faces?: DetectedFace[] | null,
    piiFindings?: PiiFinding[] | null,
    imageWidthOrBounds?: number | ImageDimensions,
    imageHeightOrOptions?: number | RegionMappingOptions,
    optionsArg?: RegionMappingOptions
  ): RegionMappingResult {
    const startTime = performance.now();
    const safeFaces = faces || [];
    const safePiiFindings = piiFindings || [];

    let imageBounds: ImageDimensions;
    let options: RegionMappingOptions | undefined;

    if (typeof imageWidthOrBounds === 'number') {
      imageBounds = {
        width: imageWidthOrBounds,
        height: typeof imageHeightOrOptions === 'number' ? imageHeightOrOptions : 0
      };
      options = optionsArg;
    } else if (imageWidthOrBounds) {
      imageBounds = imageWidthOrBounds;
      options = imageHeightOrOptions as RegionMappingOptions | undefined;
    } else {
      imageBounds = { width: 0, height: 0 };
      options = imageHeightOrOptions as RegionMappingOptions | undefined;
    }

    const padding = options?.paddingPx !== undefined
      ? options.paddingPx
      : options?.padding !== undefined
      ? options.padding
      : RegionMapper.DEFAULT_PADDING;

    const validPadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
    const regions: SensitiveRegion[] = [];

    // 1. Process Face Detections
    let faceCounter = 1;
    for (const face of safeFaces) {
      if (!face || !face.box) continue;

      const clampedBox = GeometryUtils.clampBox(face.box, imageBounds);
      if (!clampedBox) continue;

      const paddedBox = GeometryUtils.applyPadding(clampedBox, validPadding, imageBounds);
      const regionId = `face-${String(faceCounter++).padStart(3, '0')}`;
      const label = `FACE #${faceCounter - 1}`;

      regions.push({
        id: regionId,
        source: 'FACE_DETECTOR',
        sourceId: face.id,
        type: 'FACE',
        label,
        boundingBox: paddedBox,
        unpaddedBox: clampedBox,
        box: clampedBox,
        paddedBox,
        confidence: face.confidence,
        reason: 'Detected human face region',
        padding: validPadding,
        paddingPx: validPadding
      });
    }

    // 2. Process PII Findings
    const typeCounters: Record<string, number> = {};

    for (const pii of safePiiFindings) {
      if (!pii || !pii.box) continue;

      const clampedBox = GeometryUtils.clampBox(pii.box, imageBounds);
      if (!clampedBox) continue;

      const paddedBox = GeometryUtils.applyPadding(clampedBox, validPadding, imageBounds);
      const piiTypeKey = pii.piiType ? pii.piiType.toLowerCase() : 'other';

      typeCounters[piiTypeKey] = (typeCounters[piiTypeKey] || 0) + 1;
      const regionId = `pii-${piiTypeKey}-${String(typeCounters[piiTypeKey]).padStart(3, '0')}`;
      const label = `PII: ${pii.piiType}`;

      regions.push({
        id: regionId,
        source: 'OCR_PII',
        sourceId: pii.id,
        type: this.mapPiiTypeToRegionType(pii.piiType),
        piiType: pii.piiType,
        label,
        boundingBox: paddedBox,
        unpaddedBox: clampedBox,
        box: clampedBox,
        paddedBox,
        confidence: pii.confidence,
        reason: pii.reason || 'PII pattern matched',
        padding: validPadding,
        paddingPx: validPadding
      });
    }

    const durationMs = Math.round(performance.now() - startTime);
    const faceCount = regions.filter((r) => r.type === 'FACE').length;
    const piiCount = regions.length - faceCount;

    return {
      regions,
      mappingTimeMs: durationMs,
      inputFaceCount: safeFaces.length,
      inputPiiCount: safePiiFindings.length,
      outputRegionCount: regions.length,
      summary: {
        totalCount: regions.length,
        faceCount,
        piiCount
      },
      imageDimensions: {
        width: imageBounds.width,
        height: imageBounds.height
      }
    };
  }

  /**
   * Helper utility for calculating combined redaction area clusters by merging overlapping boxes.
   * Does not mutate original SensitiveRegion semantic objects.
   */
  public combineRedactionAreas(regions: SensitiveRegion[]): BoundingBox[] {
    if (!regions || regions.length === 0) return [];

    const boxes: BoundingBox[] = regions.map((r) => ({ ...r.boundingBox }));

    // Iterative box clustering merge
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (GeometryUtils.intersection(boxes[i], boxes[j]) !== null) {
            boxes[i] = GeometryUtils.union(boxes[i], boxes[j]);
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    return boxes;
  }

  private mapPiiTypeToRegionType(piiType: PiiType): SensitiveRegionType {
    const validTypes: Set<SensitiveRegionType> = new Set([
      'FACE',
      'EMAIL',
      'PHONE',
      'PAN',
      'AADHAAR',
      'CREDIT_CARD',
      'BANK_ACCOUNT',
      'URL',
      'ADDRESS',
      'OTHER'
    ]);

    if (validTypes.has(piiType as SensitiveRegionType)) {
      return piiType as SensitiveRegionType;
    }

    return 'OTHER';
  }
}
