/**
 * NAZAR Editable Preview Editor Component
 *
 * Interactive local canvas and UI allowing the user to review, modify,
 * add, remove, resize, zoom, pan, and slide redactions before approval.
 *
 * Features & Optimizations:
 * - Removed split view mode for simplified, clear comparison (Sanitized vs Original).
 * - Fully visible Cancel & Approve action buttons with no truncation or clipping.
 * - Pan tool (default hand mode) allowing click-and-drag sliding of the image.
 * - Interactive Zoom slider, Zoom in/out, and Auto-Fit buttons.
 * - Horizontal and vertical Slide sliders for easy viewport navigation.
 * - Dynamic aspect-ratio matching: canvas tightly frames the image with zero empty blank space.
 * - 100% local client-side rendering.
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
  changeAllRedactionsMode,
  undo,
  redo,
  setZoom,
  setPan,
  setComparisonMode,
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
  CloseIcon,
  HandIcon,
  PencilIcon,
} from '../popup/NazarIcons';

export const PreviewEditor: React.FC<PreviewEditorProps> = ({
  originalImageUrl,
  initialRedactions,
  domContext,
  onApprove,
  onCancel,
  popupSize,
}) => {
  const [state, setState] = useState(() => createInitialPreviewState(initialRedactions));
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeTool, setActiveTool] = useState<'pan' | 'redact'>('pan');
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const hasAutoFittedRef = useRef(false);
  const prevContainerWidthRef = useRef(0);

  // Auto-fit image to container width so the image completely fills the view with ZERO blank space
  const handleAutoFit = useCallback(
    (imgW?: number, _imgH?: number, containerW?: number) => {
      const currentContainerW = containerW || containerWidth || containerRef.current?.clientWidth || 460;
      const iW = imgW || imageDimensions.width || 600;

      if (iW <= 0) return;

      // Fill the viewport width edge-to-edge
      const fitZoom = parseFloat((currentContainerW / iW).toFixed(2));
      const safeZoom = Math.min(4.0, Math.max(0.25, fitZoom));

      setState((prev) => ({
        ...prev,
        zoom: safeZoom,
        pan: { x: 0, y: 0 },
      }));
    },
    [containerWidth, imageDimensions]
  );

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

  // Re-fit whenever popupSize changes (S / M / L switch)
  useEffect(() => {
    if (popupSize && imageDimensions.width > 0 && containerRef.current) {
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const w = containerRef.current.clientWidth;
          setContainerWidth(w);
          handleAutoFit(imageDimensions.width, imageDimensions.height, w);
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [popupSize, imageDimensions.width, imageDimensions.height, handleAutoFit]);

  // Trigger auto-fit when the container WIDTH actually changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    prevContainerWidthRef.current = el.clientWidth;
    setContainerWidth(el.clientWidth);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.round(entry.contentRect.width);
        if (newWidth > 40 && Math.abs(newWidth - prevContainerWidthRef.current) > 5) {
          prevContainerWidthRef.current = newWidth;
          setContainerWidth(newWidth);
          if (imageDimensions.width > 0) {
            handleAutoFit(imageDimensions.width, imageDimensions.height, newWidth);
          }
        }
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [imageDimensions, handleAutoFit]);

  // Calculate dimensions and pan clamping to eliminate any blank black void
  const cW = containerWidth || containerRef.current?.clientWidth || 460;
  const naturalW = imageDimensions.width || 600;
  const naturalH = imageDimensions.height || 400;
  const renderedW = naturalW * state.zoom;
  const renderedH = naturalH * state.zoom;

  // Viewport height fits the image height at the auto-fit scale (eliminates blank space above/below)
  const fitScale = naturalW > 0 ? cW / naturalW : 1;
  const fittedH = Math.round(naturalH * fitScale);
  const maxViewportHeight = popupSize === 'S' ? 240 : popupSize === 'M' ? 300 : 380;
  const minViewportHeight = popupSize === 'S' ? 140 : 160;
  const viewportHeight = Math.max(minViewportHeight, Math.min(maxViewportHeight, fittedH || (popupSize === 'S' ? 200 : 260)));

  // Bounds for pan so the image stays locked inside the viewport with zero empty margin
  const minPanX = renderedW > cW ? Math.round(cW - renderedW) : Math.round((cW - renderedW) / 2);
  const maxPanX = renderedW > cW ? 0 : Math.round((cW - renderedW) / 2);

  const minPanY = renderedH > viewportHeight ? Math.round(viewportHeight - renderedH) : Math.round((viewportHeight - renderedH) / 2);
  const maxPanY = renderedH > viewportHeight ? 0 : Math.round((viewportHeight - renderedH) / 2);

  const clampPan = (x: number, y: number) => ({
    x: Math.min(maxPanX, Math.max(minPanX, x)),
    y: Math.min(maxPanY, Math.max(minPanY, y)),
  });

  // Stable zoom handler that preserves center-point and applies pan clamping
  const handleZoomChange = useCallback(
    (nextZoom: number) => {
      const safeZoom = Math.min(4.0, Math.max(0.25, parseFloat(nextZoom.toFixed(2))));
      const zoomOld = state.zoom || 1.0;

      const nextRenderedW = naturalW * safeZoom;
      const nextRenderedH = naturalH * safeZoom;

      const nextMinPanX = nextRenderedW > cW ? Math.round(cW - nextRenderedW) : Math.round((cW - nextRenderedW) / 2);
      const nextMaxPanX = nextRenderedW > cW ? 0 : Math.round((cW - nextRenderedW) / 2);
      const nextMinPanY = nextRenderedH > viewportHeight ? Math.round(viewportHeight - nextRenderedH) : Math.round((viewportHeight - nextRenderedH) / 2);
      const nextMaxPanY = nextRenderedH > viewportHeight ? 0 : Math.round((viewportHeight - nextRenderedH) / 2);

      // Keep viewport center point invariant during zoom
      const centerX = (-state.pan.x + cW / 2) / zoomOld;
      const centerY = (-state.pan.y + viewportHeight / 2) / zoomOld;

      const rawNewPanX = -(centerX * safeZoom - cW / 2);
      const rawNewPanY = -(centerY * safeZoom - viewportHeight / 2);

      const clampedX = Math.min(nextMaxPanX, Math.max(nextMinPanX, Math.round(rawNewPanX)));
      const clampedY = Math.min(nextMaxPanY, Math.max(nextMinPanY, Math.round(rawNewPanY)));

      setState((prev) => ({
        ...setZoom(prev, safeZoom),
        pan: { x: clampedX, y: clampedY },
      }));
    },
    [state.zoom, state.pan, naturalW, naturalH, cW, viewportHeight]
  );

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

  const [defaultMaskMode, setDefaultMaskMode] = useState<RedactionMode>(() => {
    if (initialRedactions && initialRedactions.length > 0) {
      return initialRedactions[0].mode || 'solid_rectangle';
    }
    return 'solid_rectangle';
  });

  const handleModeChange = (newMode: RedactionMode) => {
    setDefaultMaskMode(newMode);
    if (selectedItem) {
      setState((prev) => changeRedactionMode(prev, selectedItem.id, newMode));
    } else {
      setState((prev) => changeAllRedactionsMode(prev, newMode));
    }
  };

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

  // Convert client mouse coordinates to canvas-space coordinates
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewportRef.current) return { x: 0, y: 0 };
      const rect = viewportRef.current.getBoundingClientRect();
      const localX = (clientX - rect.left - state.pan.x) / state.zoom;
      const localY = (clientY - rect.top - state.pan.y) / state.zoom;
      return { x: Math.round(localX), y: Math.round(localY) };
    },
    [state.pan, state.zoom]
  );

  // Handle Canvas Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If pan tool is active or middle-click/alt-click: Pan immediately
    if (activeTool === 'pan' || e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - state.pan.x, y: e.clientY - state.pan.y });
      return;
    }

    // In redact tool mode: start drawing a manual redaction box anywhere on canvas
    if (activeTool === 'redact') {
      if (state.comparisonMode !== 'sanitized') {
        setState((prev) => setComparisonMode(prev, 'sanitized'));
      }
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setState((prev) => selectItem(prev, null));
      setIsCreatingBox(true);
      setCreateStart(coords);
      setCurrentDragBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const rawX = e.clientX - panStart.x;
      const rawY = e.clientY - panStart.y;
      const clamped = clampPan(rawX, rawY);
      setState((prev) => setPan(prev, clamped));
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
      if (currentDragBox.width >= 8 && currentDragBox.height >= 8) {
        const newItem: RedactionItem = {
          id: `manual_${Date.now()}`,
          detectionId: `manual_det_${Date.now()}`,
          category: 'security_code',
          mode: defaultMaskMode,
          label: '[MANUAL REDACTION]',
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
        setState((prev) => {
          const withAdded = addRedaction(prev, newItem);
          return selectItem(withAdded, newItem.id);
        });
      }
      setCurrentDragBox(null);
    }

    if (isMovingBox) setIsMovingBox(false);
    if (isResizingBox) setIsResizingBox(false);
  };

  // Ensure browser doesn't natively zoom the UI when doing Ctrl+Wheel over the canvas
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Safely called in a { passive: false } context
      }
    };
    el.addEventListener('wheel', preventZoom, { passive: false });
    return () => el.removeEventListener('wheel', preventZoom);
  }, []);

  // Mouse wheel: zoom with Ctrl, slide horizontally and vertically with wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      handleZoomChange(state.zoom + delta);
    } else {
      const nextX = state.pan.x - e.deltaX;
      const nextY = state.pan.y - e.deltaY;
      const clamped = clampPan(nextX, nextY);
      setState((prev) => setPan(prev, clamped));
    }
  };

  // Touch event listeners for trackpads / touchscreen devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX - state.pan.x, y: e.touches[0].clientY - state.pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPanning && e.touches.length === 1) {
      const rawX = e.touches[0].clientX - panStart.x;
      const rawY = e.touches[0].clientY - panStart.y;
      const clamped = clampPan(rawX, rawY);
      setState((prev) => setPan(prev, clamped));
    }
  };

  const handleTouchEnd = () => {
    if (isPanning) setIsPanning(false);
  };

  const handleBoxMouseDown = (e: React.MouseEvent, item: RedactionItem) => {
    if (activeTool === 'pan') return; // In pan mode, pass through to panning
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

  // Render Redaction Box
  const renderRedactionBox = (item: RedactionItem) => {
    const isSelected = item.id === state.selectedItemId;
    const { x, y, width, height } = item.boundingBox;

    let bgStyle: React.CSSProperties = {
      backgroundColor: '#070b16',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      color: '#38bdf8',
    };

    if (item.mode === 'blur') {
      bgStyle = {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundColor: 'rgba(5, 9, 20, 0.5)',
        border: '1px solid rgba(34, 211, 238, 0.25)',
        color: '#22d3ee',
      };
    } else if (item.mode === 'pixelate') {
      bgStyle = {
        backgroundColor: 'rgba(10, 16, 32, 0.92)',
        backgroundImage: 'radial-gradient(#22d3ee 1px, transparent 1px)',
        backgroundSize: '6px 6px',
        color: '#f8fafc',
      };
    } else if (item.mode === 'semantic_label') {
      bgStyle = {
        backgroundColor: 'rgba(13, 20, 36, 0.92)',
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
          cursor: activeTool === 'pan' ? 'grab' : isMovingBox ? 'grabbing' : 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(9, Math.min(12, height * 0.42)),
          fontWeight: 600,
          fontFamily: 'var(--font-mono, monospace)',
          borderRadius: item.mode === 'semantic_label' ? '4px' : '3px',
          outline: isSelected ? '2px solid #22d3ee' : '1px dashed rgba(34, 211, 238, 0.5)',
          outlineOffset: isSelected ? '1px' : '0px',
          boxShadow: isSelected ? '0 0 16px rgba(34, 211, 238, 0.45)' : 'none',
          zIndex: isSelected ? 100 : 10,
          overflow: 'hidden',
          padding: '2px 4px',
          pointerEvents: activeTool === 'pan' ? 'none' : 'auto',
          ...bgStyle,
        }}
        title={`${item.label} (${item.mode}) - Click to select & edit`}
      >
        {/* Corner Reticle Brackets for Selected Box */}
        {isSelected && (
          <>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '7px', height: '7px', borderTop: '2px solid #22d3ee', borderLeft: '2px solid #22d3ee', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '7px', height: '7px', borderTop: '2px solid #22d3ee', borderRight: '2px solid #22d3ee', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '7px', height: '7px', borderBottom: '2px solid #22d3ee', borderLeft: '2px solid #22d3ee', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '7px', height: '7px', borderBottom: '2px solid #22d3ee', borderRight: '2px solid #22d3ee', pointerEvents: 'none' }} />
          </>
        )}

        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.4px',
            textShadow: '0 0 6px rgba(34, 211, 238, 0.5)',
          }}
        >
          {item.label}
        </span>

        {isSelected && activeTool !== 'pan' && (
          <div
            id={`resize-handle-${item.id}`}
            onMouseDown={(e) => handleResizeMouseDown(e, item)}
            style={{
              position: 'absolute',
              right: '0',
              bottom: '0',
              width: '10px',
              height: '10px',
              backgroundColor: '#22d3ee',
              cursor: 'se-resize',
              borderTopLeftRadius: '3px',
              zIndex: 101,
              boxShadow: '0 0 6px rgba(34, 211, 238, 0.8)',
            }}
            title="Drag to resize"
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="preview-editor-root"
    >
      {/* 1. Streamlined Modern Toolbar */}
      <div className="editor-toolbar">
        {/* Left: Tools, History & Zoom */}
        <div className="editor-toolbar-left">
          {/* Tool Mode: Pan vs Select/Draw */}
          <div className="toolbar-group">
            <button
              id="btn-tool-pan"
              onClick={() => setActiveTool('pan')}
              className={`toolbar-btn-icon ${activeTool === 'pan' ? 'active' : ''}`}
              title="Pan & Slide Tool (Drag image to slide)"
            >
              <HandIcon size={14} />
            </button>
            <button
              id="btn-tool-redact"
              data-testid="btn-tool-draw"
              onClick={() => {
                setActiveTool('redact');
                if (state.comparisonMode !== 'sanitized') {
                  setState((prev) => setComparisonMode(prev, 'sanitized'));
                }
              }}
              className={`toolbar-btn-icon ${activeTool === 'redact' ? 'active' : ''}`}
              title="Redact / Hide Area (Click & drag with pencil to hide sensitive content)"
              aria-label="Redact tool"
            >
              <PencilIcon size={14} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* History Undo / Redo */}
          <div className="toolbar-group">
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

          <div className="toolbar-divider" />

          {/* Zoom Controls + Slider */}
          <div className="toolbar-group zoom-group">
            <button
              type="button"
              id="btn-zoom-out"
              onClick={() => handleZoomChange(state.zoom - 0.15)}
              className="toolbar-btn-icon"
              title="Zoom Out (-15%)"
            >
              <ZoomOutIcon size={13} />
            </button>

            <input
              type="range"
              className="zoom-range-slider"
              min="25"
              max="350"
              value={Math.round(state.zoom * 100)}
              onChange={(e) => handleZoomChange(Number(e.target.value) / 100)}
              title={`Zoom: ${Math.round(state.zoom * 100)}%`}
            />

            <button
              type="button"
              id="btn-zoom-in"
              onClick={() => handleZoomChange(state.zoom + 0.15)}
              className="toolbar-btn-icon"
              title="Zoom In (+15%)"
            >
              <ZoomInIcon size={13} />
            </button>

            <button
              type="button"
              id="btn-zoom-fit"
              onClick={() => handleAutoFit()}
              className="toolbar-btn-icon toolbar-fit-btn"
              title="Fit View (Zero blank space)"
            >
              <FitIcon size={12} />
              <span className="fit-btn-label">Fit</span>
            </button>
          </div>
        </div>

        {/* Right: Mode & Actions pinned to the right corner */}
        <div className="editor-toolbar-right">
          {/* View Mode Segmented Pill (Sanitized & Original ONLY, No Split) */}
          <div className="mode-pill-container">
            {(['sanitized', 'original'] as ComparisonMode[]).map((mode) => (
              <button
                key={mode}
                id={`btn-mode-${mode}`}
                onClick={() => setState((prev) => setComparisonMode(prev, mode))}
                className={`mode-pill-btn ${state.comparisonMode === mode ? 'active' : ''}`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />

          {/* Primary Action (Approve - Tick) & Secondary (Cancel - Cross) - Icon Only */}
          <div className="toolbar-actions-group">
            <button
              id="btn-cancel"
              onClick={handleCancel}
              className="btn-cancel-icon"
              title="Cancel"
              aria-label="Cancel"
            >
              <CloseIcon size={13} color="#ef4444" />
            </button>
            <button
              id="btn-approve"
              onClick={handleApprove}
              className="btn-approve-primary btn-approve-icon"
              title="Approve"
              aria-label="Approve"
            >
              <CheckIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Canvas Viewport (Auto-fits tightly with NO blank space) */}
      <div
        ref={viewportRef}
        className="preview-viewport-card"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          height: `${viewportHeight}px`,
          cursor: activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair',
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
              }}
            />
          ) : (
            <div
              style={{
                width: '600px',
                height: '400px',
                backgroundColor: '#0a1020',
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

          {/* Redactions Overlay - Only shown in Sanitized mode */}
          {state.comparisonMode === 'sanitized' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
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
                border: '2px dashed #ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.28)',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.45)',
                pointerEvents: 'none',
                zIndex: 200,
                borderRadius: '3px',
              }}
            />
          )}
        </div>
      </div>

      {/* 3. Bottom Redaction Inspector Bar */}
      <div className="redaction-inspector">
        {/* Left: Mask Style label + dropdown + Selected Scope */}
        <div className="inspector-left">
          <label className="inspector-label">
            Mask Style :
          </label>
          <div className="custom-select-wrapper">
            <select
              id="select-redaction-mode"
              className="custom-select-control"
              value={selectedItem ? selectedItem.mode : defaultMaskMode}
              onChange={(e) => handleModeChange(e.target.value as RedactionMode)}
              title={selectedItem ? 'Change style for selected redaction' : 'Change style for all redactions'}
            >
              <option value="solid_rectangle">Solid Box</option>
              <option value="semantic_label">Semantic Label</option>
              <option value="blur">Blur</option>
              <option value="pixelate">Pixelate</option>
            </select>
            <div className="custom-select-chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          {selectedItem && (
            <button
              type="button"
              className="scope-pill-btn"
              title="Style applied to currently selected redaction"
            >
              Selected
            </button>
          )}
        </div>

        {/* Right: Remove button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="btn-remove-redaction"
            onClick={() => selectedItem && setState((prev) => removeRedaction(prev, selectedItem.id))}
            disabled={!selectedItem}
            className="btn-delete-icon"
            title={selectedItem ? 'Remove this redaction' : 'Select a redaction to delete'}
            aria-label="Remove this redaction"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

