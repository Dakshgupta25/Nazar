/**
 * DOM Sensitivity Analyzer:
 * Inspects DOM elements and their semantics to detect sensitive input fields,
 * authentication controls, financial forms, and embedded PII.
 */

import { ExtractedDomContext } from '../types/dom';
import {
  DetectedRegion,
  RecommendedRedactionMode,
  SensitiveCategory,
} from '../types/privacy';
import { scanTextForPii } from './piiDetector';

export function analyzeDomSensitivity(context: ExtractedDomContext): DetectedRegion[] {
  const regions: DetectedRegion[] = [];
  let counter = 0;

  for (const el of context.elements) {
    let category: SensitiveCategory | null = null;
    let confidence = 0.85;
    let recommendedRedaction: RecommendedRedactionMode = 'semantic_label';

    const inputType = el.inputType?.toLowerCase();
    const autocomplete = el.attributes['autocomplete']?.toLowerCase();
    const name = el.attributes['name']?.toLowerCase() || '';
    const id = el.id.toLowerCase();
    const placeholder = el.placeholder?.toLowerCase() || '';
    const ariaLabel = el.ariaLabel?.toLowerCase() || '';

    // 1. Password
    if (
      inputType === 'password' ||
      autocomplete?.includes('password') ||
      name.includes('password') ||
      id.includes('password') ||
      ariaLabel.includes('password')
    ) {
      category = 'password';
      confidence = 0.99;
      recommendedRedaction = 'semantic_label';
    }
    // 2. Credit Card Number
    else if (autocomplete === 'cc-number' || name.includes('cardnumber') || name.includes('creditcard') || id.includes('cardnumber')) {
      category = 'credit_card';
      confidence = 0.98;
    }
    // 3. CVV / CVC
    else if (autocomplete === 'cc-csc' || name.includes('cvv') || name.includes('cvc') || id.includes('cvv')) {
      category = 'security_code';
      confidence = 0.99;
    }
    // 4. Email
    else if (inputType === 'email' || autocomplete === 'email' || name.includes('email') || id.includes('email')) {
      category = 'email';
      confidence = 0.95;
    }
    // 5. Phone
    else if (inputType === 'tel' || autocomplete?.includes('tel') || name.includes('phone') || id.includes('phone')) {
      category = 'phone';
      confidence = 0.95;
    }
    // 6. Aadhaar / SSN
    else if (name.includes('aadhaar') || id.includes('aadhaar') || placeholder.includes('aadhaar')) {
      category = 'aadhaar';
      confidence = 0.95;
    } else if (name.includes('ssn') || id.includes('ssn') || autocomplete === 'ssn') {
      category = 'passport';
      confidence = 0.90;
    }
    // 7. API Key / Token / Secret
    else if (name.includes('api_key') || name.includes('apikey') || id.includes('apikey') || id.includes('api_key') || name.includes('token') || id.includes('token')) {
      category = 'api_key';
      confidence = 0.95;
    }
    // 8. Address
    else if (autocomplete?.includes('street-address') || autocomplete?.includes('address-line') || name.includes('address')) {
      category = 'address';
      confidence = 0.90;
    }

    if (category) {
      regions.push({
        id: `dom_sens_${++counter}`,
        category,
        confidence,
        boundingBox: el.boundingBox,
        source: 'dom',
        elementSelector: el.selector,
        recommendedRedaction,
        label: `[${category.toUpperCase().replace('_', ' ')} REDACTED]`,
        sanitizedHint: `DOM input (${el.tagName})`,
      });
    }

    // Also inspect any static text content (e.g. paragraphs or labels) for PII patterns
    if (el.textContent && el.textContent.length > 5 && !['input', 'textarea'].includes(el.elementType)) {
      const textMatches = scanTextForPii(el.textContent);
      for (const tm of textMatches) {
        regions.push({
          id: `dom_text_pii_${++counter}`,
          category: tm.category,
          confidence: tm.confidence,
          boundingBox: el.boundingBox,
          source: 'dom',
          elementSelector: el.selector,
          recommendedRedaction: 'semantic_label',
          label: `[${tm.category.toUpperCase().replace('_', ' ')} REDACTED]`,
          sanitizedHint: `Text node (${el.tagName})`,
        });
      }
    }
  }

  return regions;
}
