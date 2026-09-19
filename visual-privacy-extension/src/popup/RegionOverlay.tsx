import React, { useEffect, useRef } from 'react';
import { SensitiveRegion } from '../core/types/pipeline';

interface RegionOverlayProps {
  regions: SensitiveRegion[];
  sourceWidth: number;
  sourceHeight: number;
  containerWidth: number;
  containerHeight: number;
  showPadding?: boolean;
}

export const RegionOverlay: React.FC<RegionOverlayProps> = ({
  regions,
  sourceWidth,
  sourceHeight,
  containerWidth,
  containerHeight,
  showPadding = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth === 0 || containerHeight === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (regions.length === 0 || sourceWidth === 0 || sourceHeight === 0) return;

    // Calculate aspect-ratio fit scaling
    const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
    const displayedW = sourceWidth * scale;
    const displayedH = sourceHeight * scale;
    const offsetX = (containerWidth - displayedW) / 2;
    const offsetY = (containerHeight - displayedH) / 2;

    const scaleX = displayedW / sourceWidth;
    const scaleY = displayedH / sourceHeight;

    regions.forEach((region) => {
      const isFace = region.type === 'FACE';
      const targetBox = showPadding ? region.paddedBox : region.box;

      const drawX = offsetX + targetBox.x * scaleX;
      const drawY = offsetY + targetBox.y * scaleY;
      const drawW = targetBox.width * scaleX;
      const drawH = targetBox.height * scaleY;

      const strokeColor = isFace ? '#38bdf8' : '#ef4444';
      const fillColor = isFace ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      const badgeBg = isFace ? '#0284c7' : '#dc2626';

      // 1. Fill region with soft glass tint
      ctx.fillStyle = fillColor;
      ctx.fillRect(drawX, drawY, drawW, drawH);

      // 2. If showing padded box, render unpadded box with subtle dashed line
      if (showPadding) {
        const rawX = offsetX + region.box.x * scaleX;
        const rawY = offsetY + region.box.y * scaleY;
        const rawW = region.box.width * scaleX;
        const rawH = region.box.height * scaleY;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(rawX, rawY, rawW, rawH);
        ctx.setLineDash([]);
      }

      // 3. Render main boundary border
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX, drawY, drawW, drawH);

      // 4. Corner accent markers
      const cornerLen = Math.min(10, Math.min(drawW, drawH) / 4);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + cornerLen);
      ctx.lineTo(drawX, drawY);
      ctx.lineTo(drawX + cornerLen, drawY);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(drawX + drawW - cornerLen, drawY);
      ctx.lineTo(drawX + drawW, drawY);
      ctx.lineTo(drawX + drawW, drawY + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + drawH - cornerLen);
      ctx.lineTo(drawX, drawY + drawH);
      ctx.lineTo(drawX + cornerLen, drawY + drawH);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(drawX + drawW - cornerLen, drawY + drawH);
      ctx.lineTo(drawX + drawW, drawY + drawH);
      ctx.lineTo(drawX + drawW, drawY + drawH - cornerLen);
      ctx.stroke();

      // 5. Safe label tag (NO raw PII value, only region ID / label / type)
      const labelText = region.label;
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const labelPadding = 6;
      const labelW = textMetrics.width + labelPadding * 2;
      const labelH = 16;

      const labelX = Math.max(0, drawX);
      const labelY = Math.max(labelH, drawY - 4);

      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(labelX, labelY - labelH, labelW, labelH, 3);
      } else {
        ctx.fillRect(labelX, labelY - labelH, labelW, labelH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, labelX + labelPadding, labelY - 4);
    });
  }, [regions, sourceWidth, sourceHeight, containerWidth, containerHeight, showPadding]);

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
        zIndex: 12
      }}
      data-testid="region-overlay-canvas"
    />
  );
};
