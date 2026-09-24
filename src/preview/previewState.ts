/**
 * NAZAR Editable Preview State Manager:
 * Pure state reducer and history tracker for Phase 4 Preview Editor.
 *
 * Implements:
 * - Adding, removing, moving, resizing redactions
 * - Redaction mode mutations (solid_rectangle, blur, pixelate, semantic_label)
 * - Multi-level Undo / Redo
 * - Zoom & Pan viewport transformations
 * - Comparison modes ('sanitized', 'original', 'split', 'side_by_side')
 * - Secure approval (creating immutable SanitizedArtifact)
 * - Cancellation (destroying in-memory temporary items)
 */

import { BoundingBox } from '../types/dom';
import { RedactionItem, RedactionMode, SanitizedImageData, SanitizedStructuredContext } from '../types/redaction';
import { ComparisonMode, PreviewState, SanitizedArtifact } from '../types/preview';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const MAX_HISTORY = 50;

/**
 * Creates a simple deterministic hash for artifact security verification.
 */
export function generateLocalChecksum(dataString: string): string {
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `chk_${Math.abs(hash).toString(16)}`;
}

/**
 * Initializes the preview editor state with initial detected redactions.
 * Sets initial zoom to fit image in container.
 */
export function createInitialPreviewState(initialItems: RedactionItem[] = []): PreviewState {
  const cloned = JSON.parse(JSON.stringify(initialItems)) as RedactionItem[];
  return {
    items: cloned,
    history: [cloned],
    historyIndex: 0,
    selectedItemId: cloned.length > 0 ? cloned[0].id : null,
    comparisonMode: 'sanitized',
    zoom: 0.5, // Start at 50% zoom to fit image better in small container
    pan: { x: 0, y: 0 },
    splitPosition: 50,
    workflowState: 'editing',
    approvedArtifact: null,
  };
}

/**
 * Helper to push a new item list into the history stack, truncating any future redo states.
 */
function pushHistory(state: PreviewState, newItems: RedactionItem[]): PreviewState {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  const clonedItems = JSON.parse(JSON.stringify(newItems)) as RedactionItem[];

  if (newHistory.length >= MAX_HISTORY) {
    newHistory.shift();
  }
  newHistory.push(clonedItems);

  return {
    ...state,
    items: clonedItems,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

/**
 * Adds a new redaction item and records in history.
 */
export function addRedaction(state: PreviewState, item: RedactionItem): PreviewState {
  const updated = [...state.items, JSON.parse(JSON.stringify(item))];
  const nextState = pushHistory(state, updated);
  return {
    ...nextState,
    selectedItemId: item.id,
  };
}

/**
 * Removes a redaction item by ID and records in history.
 */
export function removeRedaction(state: PreviewState, id: string): PreviewState {
  const updated = state.items.filter((item) => item.id !== id);
  const nextState = pushHistory(state, updated);
  return {
    ...nextState,
    selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
  };
}

/**
 * Moves or resizes a redaction's bounding box and records in history.
 */
export function updateRedactionGeometry(
  state: PreviewState,
  id: string,
  geometry: Partial<BoundingBox>
): PreviewState {
  let changed = false;
  const updated = state.items.map((item) => {
    if (item.id !== id) return item;

    changed = true;
    const nx = Math.max(0, geometry.x !== undefined ? Math.round(geometry.x) : item.boundingBox.x);
    const ny = Math.max(0, geometry.y !== undefined ? Math.round(geometry.y) : item.boundingBox.y);
    const nw = Math.max(10, geometry.width !== undefined ? Math.round(geometry.width) : item.boundingBox.width);
    const nh = Math.max(10, geometry.height !== undefined ? Math.round(geometry.height) : item.boundingBox.height);

    const newBox: BoundingBox = {
      x: nx,
      y: ny,
      width: nw,
      height: nh,
      left: nx,
      top: ny,
      right: nx + nw,
      bottom: ny + nh,
    };

    return {
      ...item,
      boundingBox: newBox,
    };
  });

  if (!changed) return state;
  return pushHistory(state, updated);
}

/**
 * Changes a redaction's visual mode and records in history.
 */
export function changeRedactionMode(
  state: PreviewState,
  id: string,
  mode: RedactionMode
): PreviewState {
  let changed = false;
  const updated = state.items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return {
      ...item,
      mode,
    };
  });

  if (!changed) return state;
  return pushHistory(state, updated);
}

/**
 * Undoes the last redaction edit.
 */
export function undo(state: PreviewState): PreviewState {
  if (state.historyIndex <= 0) {
    return state;
  }
  const nextIndex = state.historyIndex - 1;
  const restored = JSON.parse(JSON.stringify(state.history[nextIndex])) as RedactionItem[];
  return {
    ...state,
    items: restored,
    historyIndex: nextIndex,
    selectedItemId: restored.length > 0 ? restored[0].id : null,
  };
}

/**
 * Redoes the previously undone edit.
 */
export function redo(state: PreviewState): PreviewState {
  if (state.historyIndex >= state.history.length - 1) {
    return state;
  }
  const nextIndex = state.historyIndex + 1;
  const restored = JSON.parse(JSON.stringify(state.history[nextIndex])) as RedactionItem[];
  return {
    ...state,
    items: restored,
    historyIndex: nextIndex,
    selectedItemId: restored.length > 0 ? restored[0].id : null,
  };
}

/**
 * Adjusts the zoom scale, clamped between MIN_ZOOM and MAX_ZOOM.
 */
export function setZoom(state: PreviewState, zoom: number): PreviewState {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat(zoom.toFixed(2))));
  return {
    ...state,
    zoom: clamped,
  };
}

/**
 * Adjusts the pan coordinates.
 */
export function setPan(state: PreviewState, pan: { x: number; y: number }): PreviewState {
  return {
    ...state,
    pan: {
      x: Math.round(pan.x),
      y: Math.round(pan.y),
    },
  };
}

/**
 * Sets the visual comparison mode.
 */
export function setComparisonMode(state: PreviewState, mode: ComparisonMode): PreviewState {
  return {
    ...state,
    comparisonMode: mode,
  };
}

/**
 * Sets split position percentage (0 to 100) for split comparison mode.
 */
export function setSplitPosition(state: PreviewState, position: number): PreviewState {
  const clamped = Math.min(100, Math.max(0, Math.round(position)));
  return {
    ...state,
    splitPosition: clamped,
  };
}

/**
 * Sets the active selected item.
 */
export function selectItem(state: PreviewState, id: string | null): PreviewState {
  return {
    ...state,
    selectedItemId: id,
  };
}

/**
 * Approves the redaction workflow and creates an immutable SanitizedArtifact.
 * No online AI request is triggered.
 */
export function approveWorkflow(
  state: PreviewState,
  options: {
    contextUrl?: string;
    contextTitle?: string;
    sanitizedImage?: SanitizedImageData;
    sanitizedDom?: SanitizedStructuredContext;
    residualScanPassed?: boolean;
  } = {}
): PreviewState {
  const timestamp = Date.now();
  const artifactId = `art_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
  const checksum = generateLocalChecksum(
    `${artifactId}:${options.contextUrl || ''}:${state.items.length}:${timestamp}`
  );

  const artifact: SanitizedArtifact = {
    artifactId,
    approvalTimestamp: timestamp,
    isUserApproved: true,
    contextUrl: options.contextUrl || 'local://unspecified',
    contextTitle: options.contextTitle || 'Sanitized Viewport',
    redactionsCount: state.items.length,
    redactionsApplied: JSON.parse(JSON.stringify(state.items)),
    sanitizedImage: options.sanitizedImage,
    sanitizedDom: options.sanitizedDom,
    residualScanPassed: options.residualScanPassed !== false,
    securityChecksum: checksum,
  };

  return {
    ...state,
    workflowState: 'approved',
    approvedArtifact: artifact,
  };
}

/**
 * Cancels the workflow and destroys temporary sanitized workflow state from memory.
 */
export function cancelWorkflow(state: PreviewState): PreviewState {
  return {
    ...state,
    items: [],
    history: [[]],
    historyIndex: 0,
    selectedItemId: null,
    workflowState: 'cancelled',
    approvedArtifact: null,
  };
}
