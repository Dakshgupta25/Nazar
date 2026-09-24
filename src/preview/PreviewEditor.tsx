/**
 * NAZAR Editable Preview Editor Component (Phase 4):
 * Interactive local canvas and UI allowing the user to review, modify,
 * add, remove, resize, zoom, pan, and compare redactions before approval.
 *
 * Guarantees:
 * - 100% local rendering. Never transmits raw content.
 * - Approval produces an explicit immutable SanitizedArtifact.
 * - Cancellation destroys temporary sanitized state.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RedactionItem, RedactionMode } from '../types/redaction';
import { ComparisonMode, PreviewEditorProps } from '../types/preview';
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
  selectItem,
  approveWorkflow,
  cancelWorkflow,
} from './previewState';

export const PreviewEditor: React.FC<PreviewEditorProps> = ({
  originalImageUrl,
  initialRedactions,
  domContext,
  onApprove,
  onCancel,
}) => {
  const [state, setState] = useState(() => createInitialPreviewState(initialRedactions));
  const containerRef = useRef<HTMLDivElement>(null);

  // Interaction dragging states
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isCreatingBox, setIsCreatingBox] = useState(false);
  const [createStart, setCreateStart] = useState({ x: 0, y: 0 });
  const [currentDragBox, setCurrentDragBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [isMovingBox, setIsMovingBox] = useState(false);
  const [moveStart, setMoveStart] = useState({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0 });

  const [isResizingBox, setIsResizingBox] = useState(false);
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, boxW: 0, boxH: 0 });

  const selectedItem = state.items.find((i) => i.id === state.selectedItemId);

  // Keyboard shortcut listener for Undo / Redo / Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          setState((prev) => redo(prev));
        } else {
          setState((prev) => undo(prev));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setState((prev) => redo(prev));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedItemId) {
        // Only if not focused on an input element
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault();
          setState((prev) => removeRedaction(prev, prev.selectedItemId!));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedItemId]);

  // Convert client mouse coordinates to canvas-space coordinates taking zoom and pan into account
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const localX = (clientX - rect.left - state.pan.x) / state.zoom;
      const localY = (clientY - rect.top - state.pan.y) / state.zoom;
      return { x: Math.round(localX), y: Math.round(localY) };
    },
    [state.pan, state.zoom]
  );

  // Handle Canvas Mouse Down (Create new box, or start panning if space/middle-click)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      // Middle click or Alt+drag -> Pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - state.pan.x, y: e.clientY - state.pan.y });
      return;
    }

    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'IMG') {
      // Clicked on blank area -> deselect & start drawing new redaction box
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setState((prev) => selectItem(prev, null));
      setIsCreatingBox(true);
      setCreateStart(coords);
      setCurrentDragBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setState((prev) =>
        setPan(prev, { x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      );
      return;
    }

    if (isCreatingBox) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const minX = Math.min(createStart.x, coords.x);
      const minY = Math.min(createStart.y, coords.y);
      const w = Math.abs(coords.x - createStart.x);
      const h = Math.abs(coords.y - createStart.y);
      setCurrentDragBox({ x: minX, y: minY, width: w, height: h });
      return;
    }

    if (isMovingBox && state.selectedItemId) {
      const dx = (e.clientX - moveStart.mouseX) / state.zoom;
      const dy = (e.clientY - moveStart.mouseY) / state.zoom;
      const newX = Math.max(0, moveStart.boxX + dx);
      const newY = Math.max(0, moveStart.boxY + dy);
      setState((prev) => updateRedactionGeometry(prev, prev.selectedItemId!, { x: newX, y: newY }));
      return;
    }

    if (isResizingBox && state.selectedItemId) {
      const dx = (e.clientX - resizeStart.mouseX) / state.zoom;
      const dy = (e.clientY - resizeStart.mouseY) / state.zoom;
      const newW = Math.max(15, resizeStart.boxW + dx);
      const newH = Math.max(15, resizeStart.boxH + dy);
      setState((prev) =>
        updateRedactionGeometry(prev, prev.selectedItemId!, { width: newW, height: newH })
      );
      return;
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (isCreatingBox && currentDragBox) {
      setIsCreatingBox(false);
      if (currentDragBox.width > 15 && currentDragBox.height > 10) {
        const newItem: RedactionItem = {
          id: `manual_${Date.now()}`,
          detectionId: `manual_det_${Date.now()}`,
          category: 'password',
          mode: 'solid_rectangle',
          label: '[CUSTOM REDACTION]',
          boundingBox: {
            x: currentDragBox.x,
            y: currentDragBox.y,
            width: currentDragBox.width,
            height: currentDragBox.height,
            left: currentDragBox.x,
            top: currentDragBox.y,
            right: currentDragBox.x + currentDragBox.width,
            bottom: currentDragBox.y + currentDragBox.height,
          },
          originalBoundingBox: {
            x: currentDragBox.x,
            y: currentDragBox.y,
            width: currentDragBox.width,
            height: currentDragBox.height,
            left: currentDragBox.x,
            top: currentDragBox.y,
            right: currentDragBox.x + currentDragBox.width,
            bottom: currentDragBox.y + currentDragBox.height,
          },
          appliedPadding: 0,
          timestamp: Date.now(),
        };
        setState((prev) => addRedaction(prev, newItem));
      }
      setCurrentDragBox(null);
    }

    if (isMovingBox) setIsMovingBox(false);
    if (isResizingBox) setIsResizingBox(false);
  };

  // Start dragging an existing box to move it
  const handleBoxMouseDown = (e: React.MouseEvent, item: RedactionItem) => {
    e.stopPropagation();
    setState((prev) => selectItem(prev, item.id));
    setIsMovingBox(true);
    setMoveStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: item.boundingBox.x,
      boxY: item.boundingBox.y,
    });
  };

  // Start dragging corner handle to resize
  const handleResizeMouseDown = (e: React.MouseEvent, item: RedactionItem) => {
    e.stopPropagation();
    setIsResizingBox(true);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxW: item.boundingBox.width,
      boxH: item.boundingBox.height,
    });
  };

  // Handlers for Toolbar Actions
  const handleApprove = () => {
    const nextState = approveWorkflow(state, {
      contextUrl: domContext?.url,
      contextTitle: domContext?.title,
      sanitizedDom: domContext,
    });
    setState(nextState);
    if (nextState.approvedArtifact && onApprove) {
      onApprove(nextState.approvedArtifact);
    }
  };

  const handleCancel = () => {
    const nextState = cancelWorkflow(state);
    setState(nextState);
    if (onCancel) {
      onCancel();
    }
  };

  // Render Redaction Box with chosen visual style
  const renderRedactionBox = (item: RedactionItem) => {
    const isSelected = item.id === state.selectedItemId;
    const { x, y, width, height } = item.boundingBox;

    let bgStyle: React.CSSProperties = {
      backgroundColor: '#0f172a',
      color: '#38bdf8',
    };

    if (item.mode === 'blur') {
      bgStyle = {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        color: '#a5f3fc',
      };
    } else if (item.mode === 'pixelate') {
      bgStyle = {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
        backgroundSize: '8px 8px',
        color: '#f8fafc',
      };
    } else if (item.mode === 'semantic_label') {
      bgStyle = {
        backgroundColor: '#1e293b',
        border: '1.5px solid #0284c7',
        color: '#38bdf8',
      };
    }

    return (
      <div
        key={item.id}
        id={`redaction-box-${item.id}`}
        onMouseDown={(e) => handleBoxMouseDown(e, item)}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          boxSizing: 'border-box',
          cursor: isMovingBox ? 'grabbing' : 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(9, Math.min(13, height * 0.45)),
          fontWeight: 600,
          fontFamily: 'var(--font-mono, monospace)',
          borderRadius: item.mode === 'semantic_label' ? '4px' : '2px',
          outline: isSelected ? '2px solid #38bdf8' : '1px dashed rgba(56, 189, 248, 0.6)',
          outlineOffset: isSelected ? '2px' : '0px',
          boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
          zIndex: isSelected ? 100 : 10,
          overflow: 'hidden',
          padding: '2px',
          ...bgStyle,
        }}
        title={`${item.label} (${item.mode}) - Click & drag to move`}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
        </span>

        {/* Resize Handle on bottom-right corner when selected */}
        {isSelected && (
          <div
            id={`resize-handle-${item.id}`}
            onMouseDown={(e) => handleResizeMouseDown(e, item)}
            style={{
              position: 'absolute',
              right: '0',
              bottom: '0',
              width: '10px',
              height: '10px',
              backgroundColor: '#38bdf8',
              cursor: 'se-resize',
              borderTopLeftRadius: '3px',
              zIndex: 101,
            }}
            title="Drag to resize"
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="preview-editor-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(56, 189, 248, 0.2)',
      }}
    >
      {/* 1. Header & Controls Toolbar */}
      <div
        className="editor-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '8px',
        }}
      >
        {/* Undo / Redo */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            id="btn-undo"
            onClick={() => setState((prev) => undo(prev))}
            disabled={state.historyIndex <= 0}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: state.historyIndex <= 0 ? '#475569' : '#f8fafc',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: state.historyIndex <= 0 ? 'not-allowed' : 'pointer',
            }}
            title="Undo (Ctrl+Z)"
          >
            ↺ Undo
          </button>
          <button
            id="btn-redo"
            onClick={() => setState((prev) => redo(prev))}
            disabled={state.historyIndex >= state.history.length - 1}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: state.historyIndex >= state.history.length - 1 ? '#475569' : '#f8fafc',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: state.historyIndex >= state.history.length - 1 ? 'not-allowed' : 'pointer',
            }}
            title="Redo (Ctrl+Y)"
          >
            ↻ Redo
          </button>
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            id="btn-zoom-out"
            onClick={() => setState((prev) => setZoom(prev, prev.zoom - 0.25))}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            -
          </button>
          <span style={{ fontSize: '11px', minWidth: '42px', textAlign: 'center', fontFamily: 'monospace' }}>
            {Math.round(state.zoom * 100)}%
          </span>
          <button
            id="btn-zoom-in"
            onClick={() => setState((prev) => setZoom(prev, prev.zoom + 0.25))}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            id="btn-zoom-reset"
            onClick={() => setState((prev) => setZoom(setPan(prev, { x: 0, y: 0 }), 1.0))}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              padding: '4px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        {/* Comparison Modes */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1e293b', padding: '2px', borderRadius: '4px' }}>
          {(['sanitized', 'original', 'split'] as ComparisonMode[]).map((mode) => (
            <button
              key={mode}
              id={`btn-mode-${mode}`}
              onClick={() => setState((prev) => setComparisonMode(prev, mode))}
              style={{
                background: state.comparisonMode === mode ? '#0284c7' : 'transparent',
                border: 'none',
                color: state.comparisonMode === mode ? '#ffffff' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Workflow Approval / Cancel */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            id="btn-approve"
            onClick={handleApprove}
            style={{
              background: 'linear-gradient(135deg, #059669, #0d9488)',
              border: 'none',
              color: '#ffffff',
              padding: '5px 12px',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>✓</span> Approve
          </button>
          <button
            id="btn-cancel"
            onClick={handleCancel}
            style={{
              background: '#334155',
              border: 'none',
              color: '#cbd5e1',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* 2. Main Viewport & Interactive Canvas */}
      <div
        ref={containerRef}
        className="preview-viewport-container"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: '260px',
          overflow: 'hidden',
          backgroundColor: '#020617',
          cursor: isPanning ? 'grabbing' : isCreatingBox ? 'crosshair' : 'default',
        }}
      >
        {/* Scaled and panned viewport content */}
        <div
          style={{
            position: 'absolute',
            left: `${state.pan.x}px`,
            top: `${state.pan.y}px`,
            transform: `scale(${state.zoom})`,
            transformOrigin: '0 0',
            transition: isPanning || isMovingBox || isResizingBox ? 'none' : 'transform 0.05s ease-out',
          }}
        >
          {/* Base Image */}
          {originalImageUrl ? (
            <img
              src={originalImageUrl}
              alt="Viewport"
              draggable={false}
              style={{
                display: 'block',
                maxWidth: 'none',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          ) : (
            <div
              style={{
                width: '600px',
                height: '400px',
                backgroundColor: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontFamily: 'sans-serif',
              }}
            >
              Interactive Preview Canvas
            </div>
          )}

          {/* Redactions Overlay (Rendered in 'sanitized' or 'split' modes) */}
          {(state.comparisonMode === 'sanitized' || state.comparisonMode === 'split') && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                clipPath:
                  state.comparisonMode === 'split'
                    ? `polygon(0 0, ${state.splitPosition}% 0, ${state.splitPosition}% 100%, 0 100%)`
                    : 'none',
              }}
            >
              {state.items.map(renderRedactionBox)}
            </div>
          )}

          {/* Currently drawing box */}
          {currentDragBox && (
            <div
              style={{
                position: 'absolute',
                left: `${currentDragBox.x}px`,
                top: `${currentDragBox.y}px`,
                width: `${currentDragBox.width}px`,
                height: `${currentDragBox.height}px`,
                border: '2px dashed #38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.25)',
                pointerEvents: 'none',
                zIndex: 200,
              }}
            />
          )}
        </div>

        {/* Split comparison divider handle */}
        {state.comparisonMode === 'split' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${state.splitPosition}%`,
              width: '4px',
              backgroundColor: '#38bdf8',
              cursor: 'ew-resize',
              zIndex: 300,
            }}
          >
            <input
              type="range"
              min="0"
              max="100"
              value={state.splitPosition}
              onChange={(e) => setState((prev) => setSplitPosition(prev, Number(e.target.value)))}
              style={{
                position: 'absolute',
                top: '50%',
                left: '-50px',
                width: '100px',
                transform: 'translateY(-50%)',
                opacity: 0,
                cursor: 'ew-resize',
              }}
            />
          </div>
        )}
      </div>

      {/* 3. Selected Redaction Inspector / Property Panel */}
      {selectedItem && (
        <div
          className="redaction-inspector"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{selectedItem.label}</span>
            <span style={{ color: '#64748b' }}>
              ({selectedItem.boundingBox.x}, {selectedItem.boundingBox.y}) -{' '}
              {selectedItem.boundingBox.width}x{selectedItem.boundingBox.height}px
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ color: '#94a3b8' }}>Type:</label>
            <select
              id="select-redaction-mode"
              value={selectedItem.mode}
              onChange={(e) =>
                setState((prev) =>
                  changeRedactionMode(prev, selectedItem.id, e.target.value as RedactionMode)
                )
              }
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <option value="semantic_label">Semantic Label</option>
              <option value="solid_rectangle">Solid Box</option>
              <option value="blur">Blur</option>
              <option value="pixelate">Pixelate</option>
            </select>

            <button
              id="btn-remove-redaction"
              onClick={() => setState((prev) => removeRedaction(prev, selectedItem.id))}
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                color: '#fb7185',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* 4. Bottom Audit / Instructions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4px 12px',
          fontSize: '10px',
          color: '#64748b',
          backgroundColor: '#090d16',
        }}
      >
        <span>
          Click & drag on blank area to add redaction • Drag box to move • Drag corner to resize
        </span>
        <span style={{ color: '#38bdf8' }}>{state.items.length} Redaction(s) Active</span>
      </div>
    </div>
  );
};
