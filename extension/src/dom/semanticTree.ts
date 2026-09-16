import { piiVault } from '../privacy/vault';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UIElement {
  nodeId: string; // Unique identifier for the agent to reference
  tagName: string;
  role: string | null;
  text: string; // Sanitized text
  bbox: BoundingBox;
  attributes: Record<string, string>;
  isInteractive: boolean;
}

export interface SanitizedDOMContext {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: UIElement[];
  sanitized: boolean; // Flag for egressGate
}

/**
 * Checks if an element is likely to contain PII based on DOM properties.
 * Lane A Detector.
 */
function isDOMElementPII(node: Element): string | null {
  const tagName = node.tagName.toLowerCase();
  
  if (tagName === 'input') {
    const input = node as HTMLInputElement;
    const type = input.type.toLowerCase();
    const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();

    // Deterministic types
    if (type === 'password') return 'PASSWORD';
    if (type === 'email' || name.includes('email') || id.includes('email')) return 'EMAIL';
    if (type === 'tel' || name.includes('phone') || autocomplete.includes('tel')) return 'PHONE';
    
    // Autocomplete markers
    if (autocomplete.includes('cc-number')) return 'CREDIT_CARD';
    if (autocomplete.includes('cc-csc')) return 'CVV';
    if (autocomplete.includes('street-address')) return 'ADDRESS';
    if (autocomplete.includes('name')) return 'NAME';
  }

  return null;
}

/**
 * Extracts deterministic UI structure from the DOM and applies Lane A sanitization.
 */
export function extractDOMStructure(): SanitizedDOMContext {
  const elements: UIElement[] = [];
  const query = "button, a, input, select, textarea, [role='button'], [role='link']";
  
  const nodes = document.querySelectorAll(query);
  
  nodes.forEach((node, index) => {
    const rect = node.getBoundingClientRect();
    
    // Only process visible elements
    if (rect.width > 0 && rect.height > 0) {
      const isInteractive = true;
      const role = node.getAttribute('role');
      let rawText = (node as HTMLElement).innerText || (node as HTMLInputElement).value || node.getAttribute('aria-label') || '';
      
      const piiCategory = isDOMElementPII(node);
      
      // Apply Lane A Vault Tokenization if PII is detected
      if (piiCategory && rawText) {
        rawText = piiVault.tokenize(piiCategory, rawText);
      }

      const elementData: UIElement = {
        nodeId: `nazar_elem_${index}`,
        tagName: node.tagName.toLowerCase(),
        role,
        text: rawText,
        bbox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        attributes: {
          id: node.id,
          name: (node as HTMLInputElement).name,
          type: (node as HTMLInputElement).type,
          placeholder: node.getAttribute('placeholder') || ''
        },
        isInteractive
      };
      
      elements.push(elementData);
    }
  });
  
  return {
    url: window.location.href, // Note: Consider stripping query params for privacy later
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    elements: elements,
    sanitized: true // Marked true as it passed Lane A sanitization
  };
}

// Ensure the extraction runs when the content script is loaded
if (typeof window !== 'undefined') {
  console.log("[Nazar] Lane A DOM Intelligence initialized.");
  // Will be triggered by events rather than timeouts in the final build
}
