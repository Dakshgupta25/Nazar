/**
 * NAZAR Content Script:
 * Injected into web pages to extract DOM structure and interact with page content safely.
 * Operates strictly locally within the active page boundary.
 *
 * NOTE: This file is intentionally written WITHOUT imports to avoid module loading issues.
 * All helper functions are inlined.
 */

// ============ INLINE MESSAGE SCHEMA VALIDATION ============
type NazarMessageType = 'PING' | 'PONG' | 'GET_STATUS' | 'CAPTURE_CONTEXT' | 'EXTRACT_DOM' | 'CAPTURE_VISIBLE_TAB' | 'RUN_PRIVACY_SCAN';

interface NazarMessage {
  id: string;
  type: NazarMessageType;
  timestamp: number;
}

interface MessageResponse<T = any> {
  success: boolean;
  requestId: string;
  data?: T;
  error?: { code: string; message: string };
}

function isValidNazarMessage(msg: unknown): msg is NazarMessage {
  if (!msg || typeof msg !== 'object') {
    return false;
  }

  const candidate = msg as any;

  if (
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    typeof candidate.timestamp !== 'number' ||
    typeof candidate.type !== 'string'
  ) {
    return false;
  }

  const validTypes = ['PING', 'PONG', 'GET_STATUS', 'CAPTURE_CONTEXT', 'EXTRACT_DOM', 'CAPTURE_VISIBLE_TAB', 'RUN_PRIVACY_SCAN'];
  return validTypes.includes(candidate.type);
}

// ============ INLINE DOM EXTRACTION ============
function extractDomContext(document: Document) {
  // Sensitive field detection patterns
  const sensitivePatterns = ['password', 'passwd', 'pwd', 'email', 'mail', 'phone', 'tel', 'mobile', 'card', 'credit', 'debit', 'cvv', 'cvc', 'ssn', 'aadhaar', 'pan', 'token', 'secret', 'auth', 'apikey', 'api-key', 'pin', 'otp'];

  function isSensitiveField(el: Element): boolean {
    const inputType = el instanceof HTMLInputElement ? el.type.toLowerCase() : '';
    if (inputType === 'password' || inputType === 'email' || inputType === 'tel') return true;

    const attrs = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('type')];

    for (const attr of attrs) {
      if (!attr) continue;
      const lower = attr.toLowerCase();
      for (const pattern of sensitivePatterns) {
        if (lower.includes(pattern)) return true;
      }
    }

    if (el.id) {
      const label = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
      if (label && label.textContent) {
        const lowerText = label.textContent.toLowerCase();
        for (const pattern of sensitivePatterns) {
          if (lowerText.includes(pattern)) return true;
        }
      }
    }

    return false;
  }

  function isVisible(el: Element, rect: DOMRect): boolean {
    if (rect.width <= 0 || rect.height <= 0) return false;

    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
    }

    return true;
  }

  function getElementType(el: Element): string {
    switch (el.tagName.toLowerCase()) {
      case 'input': return 'input';
      case 'textarea': return 'textarea';
      case 'select': return 'select';
      case 'button': return 'button';
      case 'a': return 'a';
      case 'form': return 'form';
      case 'label': return 'label';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'p': return 'paragraph';
      case 'img': return 'image';
      default: return 'other';
    }
  }

  function getCSSSelector(el: Element): string {
    if (el.id) return `#${el.id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1')}`;

    const tagName = el.tagName.toLowerCase();
    if (el.getAttribute('name')) {
      const name = el.getAttribute('name');
      return `${tagName}[name="${name}"]`;
    }

    const parent = el.parentElement;
    if (!parent) return tagName;

    const siblings = Array.from(parent.children).filter(child => child.tagName.toLowerCase() === tagName);
    if (siblings.length === 1) return `${getCSSSelector(parent)} > ${tagName}`;

    const index = siblings.indexOf(el) + 1;
    return `${getCSSSelector(parent)} > ${tagName}:nth-of-type(${index})`;
  }

  function getBoundingBox(rect: DOMRect) {
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

  // Main extraction logic
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX || window.pageXOffset || 0,
    scrollY: window.scrollY || window.pageYOffset || 0,
    devicePixelRatio: window.devicePixelRatio || 1,
  };

  const selectors = ['input', 'textarea', 'select', 'button', 'a[href]', 'form', 'label', '[role="button"]', '[role="link"]', 'h1, h2, h3, h4, h5, h6', 'p'].join(', ');
  const allElements = Array.from(document.querySelectorAll(selectors));

  const elements = [];
  let interactiveCount = 0;
  let sensitiveCandidateCount = 0;
  let formsCount = 0;

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const rect = el.getBoundingClientRect();
    const visible = isVisible(el, rect);

    if (!visible) continue;

    const elType = getElementType(el);
    const isSensitive = isSensitiveField(el);
    const isInteractive = ['input', 'textarea', 'select', 'button', 'a'].includes(elType) || el.hasAttribute('role');

    if (isInteractive) interactiveCount++;
    if (isSensitive) sensitiveCandidateCount++;
    if (elType === 'form') formsCount++;

    const attrs: any = {};
    for (let j = 0; j < el.attributes.length; j++) {
      const attr = el.attributes[j];
      if (['id', 'name', 'type', 'autocomplete', 'role', 'aria-label', 'placeholder', 'action'].includes(attr.name.toLowerCase())) {
        attrs[attr.name] = attr.value;
      }
    }

    const elData = {
      id: el.id || `nazar_el_${i}`,
      tagName: el.tagName.toLowerCase(),
      elementType: elType,
      selector: getCSSSelector(el),
      boundingBox: getBoundingBox(rect),
      isVisible: visible,
      isInteractive: isInteractive,
      attributes: attrs,
      isSensitiveCandidate: isSensitive,
    };

    elements.push(elData);
  }

  return {
    url: document.location ? document.location.href : '',
    title: document.title || '',
    timestamp: Date.now(),
    viewport,
    elements,
    stats: {
      totalElements: elements.length,
      interactiveCount,
      sensitiveCandidateCount,
      formsCount,
    },
  };
}

// ============ MESSAGE HANDLER ============
console.info('[NAZAR] Content script initialized on page.');

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('[NAZAR] Content script received message:', (message as any)?.type);

    // Fail closed: reject invalid message formats immediately
    if (!isValidNazarMessage(message)) {
      sendResponse({
        success: false,
        requestId: 'unknown',
        error: {
          code: 'INVALID_MESSAGE_FORMAT',
          message: 'The received message failed schema validation.',
        },
      });
      return false;
    }

    const msg = message as NazarMessage;

    switch (msg.type) {
      case 'PING': {
        sendResponse({
          success: true,
          requestId: msg.id,
          data: {
            pong: true,
            url: window.location.href,
            timestamp: Date.now(),
          },
        });
        return false;
      }

      case 'EXTRACT_DOM': {
        try {
          const domContext = extractDomContext(document);
          console.log('[NAZAR] DOM extracted successfully, sending response');
          sendResponse({
            success: true,
            requestId: msg.id,
            data: domContext,
          });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown DOM extraction error';
          console.error('[NAZAR] DOM extraction failed:', errorMessage);
          sendResponse({
            success: false,
            requestId: msg.id,
            error: {
              code: 'DOM_EXTRACTION_FAILED',
              message: errorMessage,
            },
          });
        }
        return false;
      }

      default: {
        console.warn('[NAZAR] Unknown message type:', msg.type);
        sendResponse({
          success: false,
          requestId: msg.id,
          error: {
            code: 'UNSUPPORTED_CONTENT_ACTION',
            message: `Message type "${msg.type}" is not supported by content script.`,
          },
        });
        return false;
      }
    }
  }
);
