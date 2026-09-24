import { describe, it, expect } from 'vitest';
import {
  createInitialPreviewState,
  addRedaction,
  removeRedaction,
  updateRedactionGeometry,
  changeRedactionMode,
  undo,
  redo,
  setZoom,
  setPan,
  setComparisonMode,
  setSplitPosition,
  approveWorkflow,
  cancelWorkflow,
} from '../src/preview/previewState';
import { RedactionItem } from '../src/types/redaction';
import { BoundingBox } from '../src/types/dom';

function createMockItem(id: string, x = 10, y = 10, w = 100, h = 30): RedactionItem {
  const box: BoundingBox = {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
  };
  return {
    id,
    detectionId: `det_${id}`,
    category: 'email',
    mode: 'semantic_label',
    label: '[EMAIL REDACTED]',
    boundingBox: box,
    originalBoundingBox: box,
    appliedPadding: 4,
    timestamp: Date.now(),
  };
}

describe('NAZAR Phase 4 — Editable Preview State Engine', () => {
  // -------------------------------------------------------------
  // 1. Initial State & Adding Redactions
  // -------------------------------------------------------------
  describe('Adding Redactions', () => {
    it('initializes with provided items and defaults to sanitized mode', () => {
      const initial = [createMockItem('item-1')];
      const state = createInitialPreviewState(initial);

      expect(state.items.length).toBe(1);
      expect(state.comparisonMode).toBe('sanitized');
      expect(state.zoom).toBe(1.0);
      expect(state.workflowState).toBe('editing');
      expect(state.selectedItemId).toBe('item-1');
    });

    it('adds a new redaction and updates selection and history', () => {
      const state = createInitialPreviewState([]);
      const newItem = createMockItem('item-add', 50, 60, 120, 40);

      const next = addRedaction(state, newItem);

      expect(next.items.length).toBe(1);
      expect(next.items[0].id).toBe('item-add');
      expect(next.selectedItemId).toBe('item-add');
      expect(next.history.length).toBe(2);
      expect(next.historyIndex).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 2. Editing Geometry (Move & Resize)
  // -------------------------------------------------------------
  describe('Editing Geometry (Move & Resize)', () => {
    it('moves a redaction to new coordinates', () => {
      const state = createInitialPreviewState([createMockItem('item-1', 10, 10, 50, 30)]);
      const moved = updateRedactionGeometry(state, 'item-1', { x: 75, y: 80 });

      expect(moved.items[0].boundingBox.x).toBe(75);
      expect(moved.items[0].boundingBox.y).toBe(80);
      expect(moved.items[0].boundingBox.left).toBe(75);
      expect(moved.items[0].boundingBox.top).toBe(80);
      expect(moved.items[0].boundingBox.right).toBe(125);
      expect(moved.items[0].boundingBox.bottom).toBe(110);
      expect(moved.historyIndex).toBe(1);
    });

    it('resizes a redaction width and height', () => {
      const state = createInitialPreviewState([createMockItem('item-1', 20, 20, 50, 30)]);
      const resized = updateRedactionGeometry(state, 'item-1', { width: 140, height: 60 });

      expect(resized.items[0].boundingBox.width).toBe(140);
      expect(resized.items[0].boundingBox.height).toBe(60);
      expect(resized.items[0].boundingBox.right).toBe(160);
      expect(resized.items[0].boundingBox.bottom).toBe(80);
    });

    it('changes redaction mode', () => {
      const state = createInitialPreviewState([createMockItem('item-1')]);
      expect(state.items[0].mode).toBe('semantic_label');

      const next = changeRedactionMode(state, 'item-1', 'blur');
      expect(next.items[0].mode).toBe('blur');
      expect(next.historyIndex).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 3. Removing Redactions
  // -------------------------------------------------------------
  describe('Removing Redactions', () => {
    it('removes an item by id and clears selection if selected', () => {
      const item1 = createMockItem('item-1');
      const item2 = createMockItem('item-2');
      const state = createInitialPreviewState([item1, item2]);

      const next = removeRedaction(state, 'item-1');
      expect(next.items.length).toBe(1);
      expect(next.items[0].id).toBe('item-2');
      expect(next.selectedItemId).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 4. Undo and Redo
  // -------------------------------------------------------------
  describe('Undo / Redo Stack', () => {
    it('supports undoing and redoing multiple operations', () => {
      let state = createInitialPreviewState([]);

      // Action 1: Add item 1
      state = addRedaction(state, createMockItem('item-1'));
      expect(state.items.length).toBe(1);

      // Action 2: Add item 2
      state = addRedaction(state, createMockItem('item-2'));
      expect(state.items.length).toBe(2);

      // Action 3: Move item 2
      state = updateRedactionGeometry(state, 'item-2', { x: 200 });
      expect(state.items[1].boundingBox.x).toBe(200);

      // Undo 1: Reverts move
      state = undo(state);
      expect(state.items[1].boundingBox.x).toBe(10);

      // Undo 2: Reverts addition of item 2
      state = undo(state);
      expect(state.items.length).toBe(1);
      expect(state.items[0].id).toBe('item-1');

      // Redo 1: Re-applies item 2
      state = redo(state);
      expect(state.items.length).toBe(2);

      // Redo 2: Re-applies move of item 2
      state = redo(state);
      expect(state.items[1].boundingBox.x).toBe(200);
    });

    it('truncates redo history when new edit is performed after undo', () => {
      let state = createInitialPreviewState([]);
      state = addRedaction(state, createMockItem('item-1'));
      state = addRedaction(state, createMockItem('item-2'));

      // Undo back to only item 1
      state = undo(state);
      expect(state.items.length).toBe(1);

      // Perform a new edit: add item 3
      state = addRedaction(state, createMockItem('item-3'));
      expect(state.items.length).toBe(2);
      expect(state.items.map((i) => i.id)).toEqual(['item-1', 'item-3']);

      // Attempting redo should do nothing as redo stack was truncated
      const stateAfterRedo = redo(state);
      expect(stateAfterRedo.historyIndex).toBe(state.historyIndex);
    });
  });

  // -------------------------------------------------------------
  // 5. Zoom & Pan
  // -------------------------------------------------------------
  describe('Zoom & Pan Transformations', () => {
    it('adjusts zoom level within min and max boundaries', () => {
      let state = createInitialPreviewState([]);

      state = setZoom(state, 1.5);
      expect(state.zoom).toBe(1.5);

      // Test upper clamp (max 4.0)
      state = setZoom(state, 10.0);
      expect(state.zoom).toBe(4.0);

      // Test lower clamp (min 0.25)
      state = setZoom(state, 0.05);
      expect(state.zoom).toBe(0.25);
    });

    it('adjusts pan coordinates accurately', () => {
      let state = createInitialPreviewState([]);

      state = setPan(state, { x: -45, y: 120 });
      expect(state.pan.x).toBe(-45);
      expect(state.pan.y).toBe(120);
    });
  });

  // -------------------------------------------------------------
  // 6. Comparison Modes & Split View
  // -------------------------------------------------------------
  describe('Comparison Modes', () => {
    it('sets comparison mode to original, split, side_by_side, and sanitized', () => {
      let state = createInitialPreviewState([]);

      state = setComparisonMode(state, 'original');
      expect(state.comparisonMode).toBe('original');

      state = setComparisonMode(state, 'split');
      expect(state.comparisonMode).toBe('split');

      state = setComparisonMode(state, 'side_by_side');
      expect(state.comparisonMode).toBe('side_by_side');

      state = setComparisonMode(state, 'sanitized');
      expect(state.comparisonMode).toBe('sanitized');
    });

    it('updates split position percentage clamped to [0, 100]', () => {
      let state = createInitialPreviewState([]);

      state = setSplitPosition(state, 72);
      expect(state.splitPosition).toBe(72);

      state = setSplitPosition(state, 150);
      expect(state.splitPosition).toBe(100);

      state = setSplitPosition(state, -10);
      expect(state.splitPosition).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // 7. Workflow Approval & Cancellation Security
  // -------------------------------------------------------------
  describe('Approval & Cancellation Security Gates', () => {
    it('creates an explicit immutable SanitizedArtifact upon approval', () => {
      const items = [createMockItem('item-1'), createMockItem('item-2')];
      const state = createInitialPreviewState(items);

      const approved = approveWorkflow(state, {
        contextUrl: 'https://example.com/checkout',
        contextTitle: 'Checkout Page',
        residualScanPassed: true,
      });

      expect(approved.workflowState).toBe('approved');
      expect(approved.approvedArtifact).toBeDefined();
      expect(approved.approvedArtifact?.isUserApproved).toBe(true);
      expect(approved.approvedArtifact?.artifactId).toMatch(/^art_\d+_[a-z0-9]+/);
      expect(approved.approvedArtifact?.securityChecksum).toMatch(/^chk_/);
      expect(approved.approvedArtifact?.redactionsCount).toBe(2);
      expect(approved.approvedArtifact?.contextUrl).toBe('https://example.com/checkout');
    });

    it('destroys temporary sanitized workflow state on cancellation', () => {
      const items = [createMockItem('item-1'), createMockItem('item-2')];
      const state = createInitialPreviewState(items);

      const cancelled = cancelWorkflow(state);

      expect(cancelled.workflowState).toBe('cancelled');
      expect(cancelled.items).toEqual([]);
      expect(cancelled.historyIndex).toBe(0);
      expect(cancelled.selectedItemId).toBeNull();
      expect(cancelled.approvedArtifact).toBeNull();
    });
  });
});
