/**
 * NAZAR Image Privacy Filter Component
 *
 * Standalone privacy workflow for user-uploaded images:
 * Upload image -> Local OCR + Local Face + Local PII/Secret -> Fusion -> Redaction -> Preview -> Copy / Save
 *
 * Guarantees:
 * - Operates 100% locally on device.
 * - Zero network uploads or cloud APIs.
 * - Standalone operation without DOM context.
 */

import React, { useState, useRef } from 'react';
import { LocalImageScanResult, ImageFilterOptions } from '../types/imageFilter';
import { scanLocalImage } from './imagePrivacyEngine';
import { copyImageToClipboard, saveImageToFile } from './imageExport';
import { PreviewEditor, SanitizedArtifact } from '../preview';
import { SensitiveBadge } from '../popup/SensitiveBadge';
import { NazarEyeIcon, CheckIcon } from '../popup/NazarIcons';

export const ImagePrivacyFilter: React.FC = () => {
  const [scanResult, setScanResult] = useState<LocalImageScanResult | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [sanitizedDataUrl, setSanitizedDataUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const processImage = async (dataUrl: string, filename: string, options: ImageFilterOptions = {}) => {
    setScanning(true);
    setError(null);
    setActionNotice(null);
    setSanitizedDataUrl(null);

    try {
      const result = await scanLocalImage(dataUrl, options, filename);
      setScanResult(result);
      if (result.sanitizedImage?.dataUrl) {
        setSanitizedDataUrl(result.sanitizedImage.dataUrl);
      } else {
        setSanitizedDataUrl(dataUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Privacy scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, SVG, WEBP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        processImage(dataUrl, file.name);
      }
    };
    reader.onerror = () => {
      setError('Failed to read image file locally');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          processImage(dataUrl, file.name);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please drop a valid image file');
    }
  };

  const handleCopyImage = async () => {
    const currentUrl = sanitizedDataUrl || scanResult?.sanitizedImage?.dataUrl || scanResult?.dataUrl;
    if (!currentUrl) {
      setError('No sanitized image available to copy');
      return;
    }

    try {
      await copyImageToClipboard(currentUrl);
      showNotification('✓ Sanitized image copied to clipboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy image to clipboard');
    }
  };

  const handleSaveImage = () => {
    const currentUrl = sanitizedDataUrl || scanResult?.sanitizedImage?.dataUrl || scanResult?.dataUrl;
    if (!currentUrl) {
      setError('No sanitized image available to save');
      return;
    }

    const filename = scanResult?.filename
      ? `sanitized-${scanResult.filename.replace(/\.[^/.]+$/, '')}.png`
      : 'nazar-sanitized.png';

    saveImageToFile(currentUrl, filename);
    showNotification(`✓ Saved ${filename} to Downloads`);
  };

  const handleApproved = (artifact: SanitizedArtifact) => {
    if (artifact.sanitizedImage?.dataUrl) {
      setSanitizedDataUrl(artifact.sanitizedImage.dataUrl);
    }
    showNotification('✓ Redactions approved. Safe to copy or download.');
  };

  return (
    <div className="image-filter-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Toast Notice */}
      {actionNotice && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <CheckIcon size={14} color="#10b981" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div
          style={{
            padding: '10px 12px',
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {/* Upload Zone (Clean drag and drop without QA synthetic buttons) */}
      {!scanResult && !scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '40px 20px',
              border: isDragOver
                ? '2px dashed #22d3ee'
                : '2px dashed rgba(148, 163, 184, 0.2)',
              borderRadius: '14px',
              background: isDragOver
                ? 'rgba(37, 99, 235, 0.12)'
                : 'rgba(13, 20, 36, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'center',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div style={{ marginBottom: '12px', color: '#22d3ee' }}>
              <NazarEyeIcon size={36} state="idle" />
            </div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc', marginBottom: '4px' }}>
              Drop an image to sanitize, or browse
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              PNG, JPG, SVG, WebP • Auto-detects text, PII, and faces
            </div>
          </div>
        </div>
      )}

      {/* Scanning State */}
      {scanning && (
        <div
          style={{
            padding: '36px 20px',
            borderRadius: '14px',
            background: 'rgba(13, 20, 36, 0.85)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <NazarEyeIcon size={40} state="scanning" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
              Sanitizing image locally...
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Running on-device OCR, face detection, and pattern firewalls
            </div>
          </div>
        </div>
      )}

      {/* Interactive Editor & Privacy Results */}
      {scanResult && !scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Metadata & Actions Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'rgba(13, 20, 36, 0.85)',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#f8fafc',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={scanResult.filename}
              >
                {scanResult.filename}
              </span>
              <SensitiveBadge count={scanResult.stats.totalDetected} size="sm" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setScanResult(null)}
                style={{
                  background: 'rgba(148, 163, 184, 0.08)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  color: '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Upload New
              </button>
              <button
                onClick={handleCopyImage}
                style={{
                  background: 'rgba(34, 211, 238, 0.1)',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  color: '#22d3ee',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Copy Image
              </button>
              <button
                onClick={handleSaveImage}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: '1px solid rgba(59, 130, 246, 0.45)',
                  color: '#ffffff',
                  padding: '5px 14px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.15s ease',
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Interactive Preview Editor */}
          <div style={{ width: '100%' }}>
            <PreviewEditor
              originalImageUrl={scanResult.dataUrl}
              initialRedactions={scanResult.redactionItems}
              onApprove={handleApproved}
              onCancel={() => setScanResult(null)}
            />
          </div>

          {/* Proceed button below the redacted image preview */}
          <button
            id="btn-image-filter-proceed"
            className="btn-proceed"
            onClick={() => {
              console.info('[NAZAR] Proceed clicked from image filter preview');
            }}
            style={{
              width: '100%',
              padding: '11px 18px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Proceed</span>
            <span style={{ fontSize: '14px' }}>→</span>
          </button>
        </div>
      )}
    </div>
  );
};
