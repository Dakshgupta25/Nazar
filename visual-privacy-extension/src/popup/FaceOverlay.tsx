import React, { useEffect, useRef } from 'react';
import { DetectedFace } from '../core/types/pipeline';

interface FaceOverlayProps {
  detections: DetectedFace[];
  sourceWidth: number;
  sourceHeight: number;
  containerWidth: number;
  containerHeight: number;
}

export const FaceOverlay: React.FC<FaceOverlayProps> = ({
  detections,
  sourceWidth,
  sourceHeight,
  containerWidth,
  containerHeight
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth === 0 || containerHeight === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions matching display container
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length === 0 || sourceWidth === 0 || sourceHeight === 0) return;

    // Calculate aspect-ratio fit scaling
    const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
    const displayedW = sourceWidth * scale;
    const displayedH = sourceHeight * scale;
    const offsetX = (containerWidth - displayedW) / 2;
    const offsetY = (containerHeight - displayedH) / 2;

    const scaleX = displayedW / sourceWidth;
    const scaleY = displayedH / sourceHeight;

    // Draw each detected face bounding box
    detections.forEach((detection, index) => {
      const box = detection.box;

      const drawX = offsetX + box.x * scaleX;
      const drawY = offsetY + box.y * scaleY;
      const drawW = box.width * scaleX;
      const drawH = box.height * scaleY;

      // Draw glassmorphism fill rectangle
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(drawX, drawY, drawW, drawH);

      // Draw crisp bounding border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]); // Dashed privacy bounding box style
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      ctx.setLineDash([]); // Reset dash

      // Corner accent markers
      const cornerLength = Math.min(10, Math.min(drawW, drawH) / 4);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3;

      // Top-Left corner
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + cornerLength);
      ctx.lineTo(drawX, drawY);
      ctx.lineTo(drawX + cornerLength, drawY);
      ctx.stroke();

      // Top-Right corner
      ctx.beginPath();
      ctx.moveTo(drawX + drawW - cornerLength, drawY);
      ctx.lineTo(drawX + drawW, drawY);
      ctx.lineTo(drawX + drawW, drawY + cornerLength);
      ctx.stroke();

      // Bottom-Left corner
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + drawH - cornerLength);
      ctx.lineTo(drawX, drawY + drawH);
      ctx.lineTo(drawX + drawW, drawY + drawH); // Fix line
      ctx.stroke();

      // Label background pill
      const labelText = `Face #${index + 1}: ${Math.round(detection.confidence * 100)}%`;
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const labelPadding = 6;
      const labelW = textMetrics.width + labelPadding * 2;
      const labelH = 18;

      const labelX = Math.max(0, drawX);
      const labelY = Math.max(labelH, drawY - 4);

      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(labelX, labelY - labelH, labelW, labelH, 4) : ctx.fillRect(labelX, labelY - labelH, labelW, labelH);
      ctx.fill();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, labelX + labelPadding, labelY - 4);
    });
  }, [detections, sourceWidth, sourceHeight, containerWidth, containerHeight]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10
      }}
      data-testid="face-overlay-canvas"
    />
  );
};
