/**
 * Structured Context Redactor & Residual Scan Safety Check:
 * Produces sanitized DOM context without mutating the original DOM structures.
 * Performs surgical semantic replacements (e.g. [EMAIL REDACTED])
 * while preserving the surrounding semantic layout and context.
 *
 * Runs an automated residual-scan safety check before allowing context egress.
 */

import { ExtractedDomContext, ExtractedDomElement } from '../types/dom';
import { SensitiveCategory } from '../types/privacy';
import { RedactionItem, RedactionOptions, SanitizedStructuredContext } from '../types/redaction';
import { scanTextForPii } from '../privacy/piiDetector';
import { calculateIoU } from '../privacy/fusionEngine';

/**
 * Returns standardized semantic replacement tokens.
 */
export function getSemanticReplacementToken(category: SensitiveCategory): string {
  switch (category) {
    case 'name':
      return '[NAME REDACTED]';
    case 'email':
      return '[EMAIL REDACTED]';
    case 'phone':
      return '[PHONE REDACTED]';
    case 'address':
      return '[ADDRESS REDACTED]';
    case 'postal_code':
      return '[POSTAL CODE REDACTED]';
    case 'credit_card':
      return '[CARD NUMBER REDACTED]';
    case 'bank_account':
      return '[BANK ACCOUNT REDACTED]';
    case 'aadhaar':
      return '[AADHAAR REDACTED]';
    case 'passport':
      return '[PASSPORT REDACTED]';
    case 'drivers_license':
      return '[DRIVERS LICENSE REDACTED]';
    case 'password':
      return '[PASSWORD REDACTED]';
    case 'api_key':
      return '[API KEY REDACTED]';
    case 'access_token':
      return '[ACCESS TOKEN REDACTED]';
    case 'secret_key':
      return '[SECRET KEY REDACTED]';
    case 'security_code':
      return '[SECURITY CODE REDACTED]';
    case 'session_url':
      return '[SESSION URL REDACTED]';
    case 'face':
      return '[FACE REDACTED]';
    default:
      return '[SENSITIVE DATA REDACTED]';
  }
}

/**
 * Replaces sensitive substrings in text with semantic tokens,
 * keeping all non-sensitive surrounding text intact.
 */
export function redactTextSurgically(rawText: string): {
  sanitizedText: string;
  redactedCategories: SensitiveCategory[];
} {
  if (!rawText || rawText.trim().length === 0) {
    return { sanitizedText: rawText, redactedCategories: [] };
  }

  const detections = scanTextForPii(rawText);
  if (detections.length === 0) {
    return { sanitizedText: rawText, redactedCategories: [] };
  }

  // Sort descending by position so replacements do not offset earlier indices
  const sorted = [...detections].sort((a, b) => b.startIndex - a.startIndex);
  let result = rawText;
  const categories: SensitiveCategory[] = [];

  for (const det of sorted) {
    const token = getSemanticReplacementToken(det.category);
    result =
      result.substring(0, det.startIndex) +
      token +
      result.substring(det.endIndex);
    categories.push(det.category);
  }

  return { sanitizedText: result, redactedCategories: categories };
}

/**
 * Redacts a single DOM element surgically without mutating the original.
 */
function redactElement(
  element: ExtractedDomElement,
  items: RedactionItem[]
): {
  sanitized: ExtractedDomElement;
  wasRedacted: boolean;
} {
  // Deep clone the element to guarantee immutability
  const el: ExtractedDomElement = JSON.parse(JSON.stringify(element));
  let wasRedacted = false;

  // 1. Check if any redaction item spatially covers or intersects this element
  const intersectingItems = items.filter((item) => {
    const iou = calculateIoU(el.boundingBox, item.boundingBox);
    const contains =
      el.boundingBox.x >= item.boundingBox.x - 4 &&
      el.boundingBox.y >= item.boundingBox.y - 4 &&
      el.boundingBox.x + el.boundingBox.width <= item.boundingBox.x + item.boundingBox.width + 4 &&
      el.boundingBox.y + el.boundingBox.height <= item.boundingBox.y + item.boundingBox.height + 4;
    return iou > 0.1 || contains;
  });

  // 2. Redact sensitive input fields (password, email, phone, credit card, etc.)
  if (el.isSensitiveCandidate || intersectingItems.length > 0) {
    const primaryCategory = intersectingItems[0]?.category || (el.inputType === 'password' ? 'password' : 'email');
    const token = getSemanticReplacementToken(primaryCategory);

    if (el.attributes.value) {
      el.attributes.value = token;
      wasRedacted = true;
    }
    if (el.textContent && el.textContent.trim().length > 0) {
      const surgical = redactTextSurgically(el.textContent);
      el.textContent = surgical.sanitizedText;
      wasRedacted = true;
    }
    if (el.placeholder && el.isSensitiveCandidate) {
      // Retain structure: e.g. "Enter your email" -> keep, but if it has a real value, redact
      const surgical = redactTextSurgically(el.placeholder);
      el.placeholder = surgical.sanitizedText;
    }
  } else if (el.textContent) {
    // 3. Check for inline PII in normal text elements (e.g. "Email: john@test.com")
    const surgical = redactTextSurgically(el.textContent);
    if (surgical.redactedCategories.length > 0) {
      el.textContent = surgical.sanitizedText;
      wasRedacted = true;
    }
  }

  // 4. Sanitize aria-label or accessible text if it contains sensitive info
  if (el.ariaLabel) {
    const surgical = redactTextSurgically(el.ariaLabel);
    if (surgical.redactedCategories.length > 0) {
      el.ariaLabel = surgical.sanitizedText;
      wasRedacted = true;
    }
  }

  return { sanitized: el, wasRedacted };
}

/**
 * Runs a residual safety check across all fields in the sanitized DOM context.
 * If any unredacted PII is discovered, records violations and flags failure.
 */
export function runResidualScan(elements: ExtractedDomElement[]): {
  passed: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const el of elements) {
    const textsToCheck = [
      el.textContent,
      el.attributes?.value,
      el.placeholder,
      el.ariaLabel,
    ].filter(Boolean) as string[];

    for (const text of textsToCheck) {
      // Scan for any raw PII that slipped through
      const detections = scanTextForPii(text);
      if (detections.length > 0) {
        for (const det of detections) {
          violations.push(
            `Residual PII detected: category=${det.category}, element=${el.selector || el.tagName}`
          );
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Sanitizes structured DOM context, guaranteeing immutability of the source.
 */
export function redactStructuredContext(
  domContext: ExtractedDomContext,
  items: RedactionItem[],
  options: RedactionOptions = {}
): {
  sanitizedDom: SanitizedStructuredContext;
  residualScanPassed: boolean;
  residualViolations: string[];
} {
  let redactedCount = 0;
  const sanitizedElements: ExtractedDomElement[] = [];

  for (const element of domContext.elements) {
    const { sanitized, wasRedacted } = redactElement(element, items);
    if (wasRedacted) {
      redactedCount++;
    }
    sanitizedElements.push(sanitized);
  }

  // Perform automated residual-scan safety check
  let residualScanPassed = true;
  let residualViolations: string[] = [];

  if (options.enableResidualScan !== false) {
    const residualResult = runResidualScan(sanitizedElements);
    residualScanPassed = residualResult.passed;
    residualViolations = residualResult.violations;
  }

  const sanitizedDom: SanitizedStructuredContext = {
    url: domContext.url,
    title: domContext.title,
    timestamp: Date.now(),
    elements: sanitizedElements,
    redactedCount,
    appliedRedactions: items,
  };

  return {
    sanitizedDom,
    residualScanPassed,
    residualViolations,
  };
}
