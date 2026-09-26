/**
 * NAZAR Editable Preview Editor Component
 *
 * Interactive local canvas and UI allowing the user to review, modify,
 * add, remove, resize, zoom, pan, and compare redactions before approval.
 *
 * UI/UX Redesign:
 * - Clear visual hierarchy: Prominent Approve action, subtle utility icon controls.
 * - Auto-fit viewport fills canvas container smoothly without excessive margins.
 * - Streamlined per-redaction item cards without technical coordinate clutter.
 * - 100% local rendering. Never transmits raw content.
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
import {
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  FitIcon,
  TrashIcon,
  CheckIcon,
} from '../popup/NazarIcons';

export const PreviewEditor: React.FC<PreviewEditorProps> = ({
  originalImageUrl,
  initialRedactions,
  domContext,
  onApprove,
  onCancel,
}) => {
  const [state, setState] = useState(() => createInitialPreviewState(initialRedactions));
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const hasAutoFittedRef = useRef(false);

  // Auto-fit image to container viewport
  const handleAutoFit = useCallback((imgW?: number, imgH?: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cW = rect.width > 40 ? rect.width : 540;
    const cH = rect.height > 40 ? rect.height : 360;
    const iW = imgW || imageDimensions.width || 600;
    const iH = imgH || imageDimensions.height || 400;

    if (iW <= 0 || iH <= 0) return;

    // Calculate scale factor so full image fits in view with slight padding
    const scaleX = (cW - 12) / iW;
    const scaleY = (cH - 12) / iH;
    const fitZoom = Math.max(0.2, Math.min(scaleX, scaleY, 1.2));
    const roundedZoom = parseFloat(fitZoom.toFixed(2));

    const panX = Math.max(0, Math.round((cW - iW * roundedZoom) / 2));
    const panY = Math.max(0, Math.round((cH - iH * roundedZoom) / 2));

    setState((prev) => ({
      ...prev,
      zoom: roundedZoom,
      pan: { x: panX, y: panY },
    }));
  }, [imageDimensions]);

  // Handle image load to capture actual dimensions and auto-fit
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalW = img.naturalWidth || 600;
    const naturalH = img.naturalHeight || 400;
    setImageDimensions({ width: naturalW, height: naturalH });

    if (!hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      handleAutoFit(naturalW, naturalH);
    }
  };

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (imageDimensions.width > 0) {
        handleAutoFit(imageDimensions.width, imageDimensions.height);
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [imageDimensions, handleAutoFit]);

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
        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
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

  // Handle Canvas Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - state.pan.x, y: e.clientY - state.pan.y });
      return;
    }

    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'IMG') {
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

  // Render Redaction Box with clean visual style
  const renderRedactionBox = (item: RedactionItem) => {
    const isSelected = item.id === state.selectedItemId;
    const { x, y, width, height } = item.boundingBox;

    let bgStyle: React.CSSProperties = {
      backgroundColor: '#090d16',
      color: '#38bdf8',
    };

    if (item.mode === 'blur') {
      bgStyle = {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(9, 13, 22, 0.7)',
        color: '#a5f3fc',
      };
    } else if (item.mode === 'pixelate') {
      bgStyle = {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)',
        backgroundSize: '6px 6px',
        color: '#f8fafc',
      };
    } else if (item.mode === 'semantic_label') {
      bgStyle = {
        backgroundColor: '#0f172a',
        border: '1.5px solid #2563eb',
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
          fontSize: Math.max(9, Math.min(12, height * 0.45)),
          fontWeight: 600,
          fontFamily: 'var(--font-mono, monospace)',
          borderRadius: item.mode === 'semantic_label' ? '4px' : '2px',
          outline: isSelected ? '2px solid #38bdf8' : '1px dashed rgba(56, 189, 248, 0.6)',
          outlineOffset: isSelected ? '2px' : '0px',
          boxShadow: isSelected ? '0 0 12px rgba(56, 189, 248, 0.5)' : 'none',
          zIndex: isSelected ? 100 : 10,
          overflow: 'hidden',
          padding: '2px 4px',
          ...bgStyle,
        }}
        title={`${item.label} (${item.mode}) - Click & drag to move`}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
        </span>

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
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* 1. Streamlined Modern Toolbar with Clear Visual Hierarchy */}
      <div
        className="editor-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          gap: '8px',
          flexWrap: 'nowrap',
        }}
      >
        {/* Left: Compact Icon-Only Utility Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* History Undo / Redo */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(255, 255, 255, 0.04)', padding: '2px', borderRadius: '6px' }}>
            <button
              id="btn-undo"
              onClick={() => setState((prev) => undo(prev))}
              disabled={state.historyIndex <= 0}
              className="toolbar-btn-icon"
              title="Undo (Ctrl+Z)"
            >
              <UndoIcon size={13} />
            </button>
            <button
              id="btn-redo"
              onClick={() => setState((prev) => redo(prev))}
              disabled={state.historyIndex >= state.history.length - 1}
              className="toolbar-btn-icon"
              title="Redo (Ctrl+Y)"
            >
              <RedoIcon size={13} />
            </button>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />

          {/* Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255, 255, 255, 0.04)', padding: '2px', borderRadius: '6px' }}>
            <button
              id="btn-zoom-out"
              onClick={() => setState((prev) => setZoom(prev, prev.zoom - 0.15))}
              className="toolbar-btn-icon"
              title="Zoom Out"
            >
              <ZoomOutIcon size={13} />
            </button>
            <span style={{ fontSize: '11px', minWidth: '38px', textAlign: 'center', fontFamily: 'monospace', color: '#94a3b8' }}>
              {Math.round(state.zoom * 100)}%
            </span>
            <button
              id="btn-zoom-in"
              onClick={() => setState((prev) => setZoom(prev, prev.zoom + 0.15))}
              className="toolbar-btn-icon"
              title="Zoom In"
            >
              <ZoomInIcon size={13} />
            </button>
            <button
              id="btn-zoom-fit"
              onClick={() => handleAutoFit()}
              className="toolbar-btn-icon"
              title="Auto-Fit"
              style={{ color: '#38bdf8' }}
            >
              <FitIcon size={13} />
            </button>
          </div>
        </div>

        {/* Center: View Mode Segmented Pill */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '2px',
            borderRadius: '6px',
          }}
        >
          {(['sanitized', 'original', 'split'] as ComparisonMode[]).map((mode) => (
            <button
              key={mode}
              id={`btn-mode-${mode}`}
              onClick={() => setState((prev) => setComparisonMode(prev, mode))}
              style={{
                background: state.comparisonMode === mode ? '#2563eb' : 'transparent',
                border: 'none',
                color: state.comparisonMode === mode ? '#ffffff' : '#94a3b8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Right: Primary Action (Approve) & Secondary (Cancel) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            id="btn-cancel"
            onClick={handleCancel}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            id="btn-approve"
            onClick={handleApprove}
            className="btn-approve-primary"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: '1px solid rgba(16, 185, 129, 0.5)',
              color: '#ffffff',
              padding: '5px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.15s',
            }}
          >
            <CheckIcon size={14} />
            <span>Approve</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Canvas Viewport (Auto-fits nicely) */}
      <div
        ref={containerRef}
        className="preview-viewport-container"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: '280px',
          overflow: 'hidden',
          backgroundColor: '#050811',
          cursor: isPanning ? 'grabbing' : isCreatingBox ? 'crosshair' : 'default',
        }}
      >
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
          {originalImageUrl ? (
            <img
              src={originalImageUrl}
              alt="Context Preview"
              onLoad={handleImageLoad}
              draggable={false}
              style={{
                display: 'block',
                maxWidth: 'none',
                pointerEvents: 'none',
                userSelect: 'none',
                borderRadius: '4px',
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

          {/* Redactions Overlay */}
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

          {/* Dragging New Redaction Box */}
          {currentDragBox && (
            <div
              style={{
                position: 'absolute',
                left: `${currentDragBox.x}px`,
                top: `${currentDragBox.y}px`,
                width: `${currentDragBox.width}px`,
                height: `${currentDragBox.height}px`,
                border: '2px dashed #38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                pointerEvents: 'none',
                zIndex: 200,
              }}
            />
          )}
        </div>

        {/* Split Divider Handle */}
        {state.comparisonMode === 'split' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${state.splitPosition}%`,
              width: '3px',
              backgroundColor: '#38bdf8',
              cursor: 'ew-resize',
              zIndex: 300,
              boxShadow: '0 0 8px rgba(56, 189, 248, 0.8)',
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

      {/* 3. Redaction Inspector & Clean Details List */}
      {selectedItem ? (
        <div
          className="redaction-inspector"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedItem.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <label style={{ color: '#94a3b8', fontSize: '11px' }}>Mask Style:</label>
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
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <option value="solid_rectangle">Solid Box</option>
              <option value="semantic_label">Semantic Label</option>
              <option value="blur">Blur</option>
              <option value="pixelate">Pixelate</option>
            </select>

            <button
              id="btn-remove-redaction"
              onClick={() => setState((prev) => removeRedaction(prev, selectedItem.id))}
              style={{
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Remove this redaction"
            >
              <TrashIcon size={12} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <span>Tip: Click & drag on image to redact any custom region</span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>
            {state.items.length} Redaction{state.items.length === 1 ? '' : 's'} Active
          </span>
        </div>
      )}
    </div>
  );
};
