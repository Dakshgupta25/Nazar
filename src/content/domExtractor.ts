/**
 * DOM Extractor: Traverses the active document and extracts structured semantic elements,
 * interactive targets, and bounding geometry for privacy analysis.
 */

import {
  BoundingBox,
  DomElementType,
  ExtractedDomContext,
  ExtractedDomElement,
  ViewportMetrics,
} from '../types/dom';

const SENSITIVE_KEYWORDS = [
  'password',
  'passwd',
  'pwd',
  'email',
  'mail',
  'phone',
  'tel',
  'mobile',
  'card',
  'credit',
  'debit',
  'cvv',
  'cvc',
  'ssn',
  'aadhaar',
  'pan',
  'token',
  'secret',
  'auth',
  'apikey',
  'api-key',
  'pin',
  'otp',
];

/**
 * Checks whether an element is potentially sensitive based on attributes.
 */
export function checkSensitiveCandidate(el: HTMLElement): boolean {
  const inputType = el instanceof HTMLInputElement ? el.type.toLowerCase() : '';

  if (inputType === 'password') {
    return true;
  }
  if (inputType === 'email' || inputType === 'tel') {
    return true;
  }

  const attributesToCheck = [
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('autocomplete'),
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('type'),
  ];

  for (const attr of attributesToCheck) {
    if (!attr) continue;
    const lower = attr.toLowerCase();
    for (const kw of SENSITIVE_KEYWORDS) {
      if (lower.includes(kw)) {
        return true;
      }
    }
  }

  // Also check associated label if any
  if (el.id && el.ownerDocument) {
    const label = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (label && label.textContent) {
      const labelText = label.textContent.toLowerCase();
      for (const kw of SENSITIVE_KEYWORDS) {
        if (labelText.includes(kw)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Determines whether an element is visible in the viewport.
 */
export function isElementVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Classifies an HTMLElement into a high-level DomElementType.
 */
export function classifyElementType(el: HTMLElement): DomElementType {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'input':
      return 'input';
    case 'textarea':
      return 'textarea';
    case 'select':
      return 'select';
    case 'button':
      return 'button';
    case 'a':
      return 'a';
    case 'form':
      return 'form';
    case 'label':
      return 'label';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'p':
      return 'paragraph';
    case 'img':
      return 'image';
    default:
      return 'other';
  }
}

/**
 * Safe CSS escape helper that works across browsers and headless/Node environments
 */
function safeEscapeCss(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Generates a clean CSS selector for an element.
 */
export function generateSelector(el: HTMLElement): string {
  if (el.id) {
    return `#${safeEscapeCss(el.id)}`;
  }

  const tag = el.tagName.toLowerCase();
  if (el.getAttribute('name')) {
    const name = el.getAttribute('name')!;
    return `${tag}[name="${safeEscapeCss(name)}"]`;
  }

  const parent = el.parentElement;
  if (!parent) {
    return tag;
  }

  const siblings = Array.from(parent.children).filter(
    (c) => c.tagName.toLowerCase() === tag
  );
  if (siblings.length === 1) {
    return `${generateSelector(parent)} > ${tag}`;
  }

  const index = siblings.indexOf(el) + 1;
  return `${generateSelector(parent)} > ${tag}:nth-of-type(${index})`;
}

/**
 * Computes bounding box relative to viewport.
 */
export function extractBoundingBox(rect: DOMRect): BoundingBox {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    bottom: Math.round(rect.bottom),
    right: Math.round(rect.right),
  };
}

/**
 * Extracts all relevant DOM elements from the specified document.
 */
export function extractDomContext(doc: Document): ExtractedDomContext {
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const scrollX = win ? win.scrollX || win.pageXOffset || 0 : 0;
  const scrollY = win ? win.scrollY || win.pageYOffset || 0 : 0;
  const width = win ? win.innerWidth : 1280;
  const height = win ? win.innerHeight : 800;
  const devicePixelRatio = win ? win.devicePixelRatio || 1 : 1;

  const viewport: ViewportMetrics = {
    width,
    height,
    scrollX,
    scrollY,
    devicePixelRatio,
  };

  const selectorQuery = [
    'input',
    'textarea',
    'select',
    'button',
    'a[href]',
    'form',
    'label',
    '[role="button"]',
    '[role="link"]',
    'h1, h2, h3, h4, h5, h6',
    'p',
  ].join(', ');

  const elements = Array.from(doc.querySelectorAll<HTMLElement>(selectorQuery));
  const extractedElements: ExtractedDomElement[] = [];

  let interactiveCount = 0;
  let sensitiveCandidateCount = 0;
  let formsCount = 0;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rect = el.getBoundingClientRect();
    const visible = isElementVisible(el, rect);

    // Skip completely invisible or 0-size elements
    if (!visible) continue;

    const elementType = classifyElementType(el);
    const isSensitive = checkSensitiveCandidate(el);
    const isInteractive = [
      'input',
      'textarea',
      'select',
      'button',
      'a',
    ].includes(elementType) || el.hasAttribute('role');

    if (isInteractive) interactiveCount++;
    if (isSensitive) sensitiveCandidateCount++;
    if (elementType === 'form') formsCount++;

    // Collect relevant attributes
    const attributes: Record<string, string> = {};
    for (let a = 0; a < el.attributes.length; a++) {
      const attr = el.attributes[a];
      if (
        ['id', 'name', 'type', 'autocomplete', 'role', 'aria-label', 'placeholder', 'action'].includes(
          attr.name.toLowerCase()
        )
      ) {
        attributes[attr.name] = attr.value;
      }
    }

    const item: ExtractedDomElement = {
      id: el.id || `nazar_el_${i}`,
      tagName: el.tagName.toLowerCase(),
      elementType,
      selector: generateSelector(el),
      boundingBox: extractBoundingBox(rect),
      isVisible: visible,
      isInteractive,
      attributes,
      textContent: el.textContent ? el.textContent.trim().slice(0, 200) : undefined,
      placeholder: el instanceof HTMLInputElement ? el.placeholder : undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      inputType: el instanceof HTMLInputElement ? el.type : undefined,
      isSensitiveCandidate: isSensitive,
    };

    extractedElements.push(item);
  }

  return {
    url: doc.location ? doc.location.href : '',
    title: doc.title || '',
    timestamp: Date.now(),
    viewport,
    elements: extractedElements,
    stats: {
      totalElements: extractedElements.length,
      interactiveCount,
      sensitiveCandidateCount,
      formsCount,
    },
  };
}
