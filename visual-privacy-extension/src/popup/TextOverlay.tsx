import React, { useEffect, useRef } from 'react';
import { OcrResult, PiiFinding } from '../core/types/pipeline';

interface TextOverlayProps {
  ocrResults: OcrResult[];
  piiFindings?: PiiFinding[] | null;
  sourceWidth: number;
  sourceHeight: number;
  containerWidth: number;
  containerHeight: number;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  ocrResults,
  piiFindings,
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

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (ocrResults.length === 0 || sourceWidth === 0 || sourceHeight === 0) return;

    const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
    const displayedW = sourceWidth * scale;
    const displayedH = sourceHeight * scale;
    const offsetX = (containerWidth - displayedW) / 2;
    const offsetY = (containerHeight - displayedH) / 2;

    const scaleX = displayedW / sourceWidth;
    const scaleY = displayedH / sourceHeight;

    const piiMap = new Map<string, PiiFinding>();
    if (piiFindings) {
      piiFindings.forEach((f) => piiMap.set(f.ocrId, f));
    }

    ocrResults.forEach((ocrItem) => {
      const box = ocrItem.box;

      const drawX = offsetX + box.x * scaleX;
      const drawY = offsetY + box.y * scaleY;
      const drawW = box.width * scaleX;
      const drawH = box.height * scaleY;

      const piiFinding = piiMap.get(ocrItem.id);
      const isPii = !!piiFinding;

      if (isPii) {
        // Warning crimson/amber fill & border for PII
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(drawX, drawY, drawW, drawH);

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        // Label background pill for PII
        const labelText = `⚠️ ${piiFinding.piiType}: ${piiFinding.maskedText}`;
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const labelPadding = 4;
        const labelW = textMetrics.width + labelPadding * 2;
        const labelH = 16;

        const labelX = Math.max(0, drawX);
        const labelY = Math.max(labelH, drawY - 2);

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(labelX, labelY - labelH, labelW, labelH, 3) : ctx.fillRect(labelX, labelY - labelH, labelW, labelH);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, labelX + labelPadding, labelY - 3);
      } else {
        // Glassmorphic emerald fill for non-PII text
        ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
        ctx.fillRect(drawX, drawY, drawW, drawH);

        // Emerald dashed bounding box border
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(drawX, drawY, drawW, drawH);
        ctx.setLineDash([]);

        // Label background pill
        const textSnippet = ocrItem.text.length > 18 ? ocrItem.text.substring(0, 15) + '...' : ocrItem.text;
        const labelText = `${textSnippet} (${Math.round(ocrItem.confidence * 100)}%)`;
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const labelPadding = 4;
        const labelW = textMetrics.width + labelPadding * 2;
        const labelH = 16;

        const labelX = Math.max(0, drawX);
        const labelY = Math.max(labelH, drawY - 2);

        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(labelX, labelY - labelH, labelW, labelH, 3) : ctx.fillRect(labelX, labelY - labelH, labelW, labelH);
        ctx.fill();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, labelX + labelPadding, labelY - 3);
      }
    });
  }, [ocrResults, piiFindings, sourceWidth, sourceHeight, containerWidth, containerHeight]);

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
        zIndex: 11
      }}
      data-testid="text-overlay-canvas"
    />
  );
};

