/**
 * DOM extraction data structures and geometry representations
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type DomElementType =
  | 'input'
  | 'textarea'
  | 'select'
  | 'button'
  | 'a'
  | 'form'
  | 'label'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'other';

export interface ExtractedDomElement {
  id: string;
  tagName: string;
  elementType: DomElementType;
  selector: string;
  boundingBox: BoundingBox;
  isVisible: boolean;
  isInteractive: boolean;
  attributes: Record<string, string>;
  textContent?: string;
  placeholder?: string;
  ariaLabel?: string;
  inputType?: string;
  isSensitiveCandidate: boolean;
}

export interface ViewportMetrics {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface ExtractedDomContext {
  url: string;
  title: string;
  timestamp: number;
  viewport: ViewportMetrics;
  elements: ExtractedDomElement[];
  stats: {
    totalElements: number;
    interactiveCount: number;
    sensitiveCandidateCount: number;
    formsCount: number;
  };
}
