/**
 * NAZAR Feature 2: Local Image Privacy Filter Component (Phase 7)
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

// Pre-packaged synthetic image samples for instant testing/demonstration
const SAMPLE_ID_CARD_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="100%" height="100%" rx="16" fill="%230f172a" stroke="%2338bdf8" stroke-width="2"/>
  <rect x="30" y="30" width="540" height="60" rx="8" fill="%231e293b"/>
  <text x="50" y="70" fill="%23f8fafc" font-family="sans-serif" font-size="20" font-weight="bold">GOVERNMENT IDENTITY CARD</text>
  <!-- Synthetic Photo Area (Simulating Face) -->
  <rect x="40" y="110" width="130" height="160" rx="8" fill="%23334155" stroke="%2364748b"/>
  <circle cx="105" cy="165" r="35" fill="%23f8fafc"/>
  <path d="M 65 240 Q 105 195 145 240 Z" fill="%23f8fafc"/>
  <!-- PII Text fields -->
  <text x="200" y="135" fill="%2394a3b8" font-family="sans-serif" font-size="12">FULL NAME</text>
  <text x="200" y="155" fill="%23f8fafc" font-family="sans-serif" font-size="16" font-weight="bold">Mr. Alexander Hamilton</text>
  <text x="200" y="190" fill="%2394a3b8" font-family="sans-serif" font-size="12">EMAIL ADDRESS</text>
  <text x="200" y="210" fill="%2338bdf8" font-family="sans-serif" font-size="15">alexander.hamilton@treasury.gov</text>
  <text x="200" y="245" fill="%2394a3b8" font-family="sans-serif" font-size="12">GOVERNMENT IDENTIFIER</text>
  <text x="200" y="265" fill="%23f43f5e" font-family="sans-serif" font-size="16" font-weight="bold">9842 1094 5821</text>
  <text x="40" y="320" fill="%2394a3b8" font-family="sans-serif" font-size="12">API ACCESS TOKEN</text>
  <text x="40" y="342" fill="%23f59e0b" font-family="sans-serif" font-size="13">ghp_aB3dE5gH7jK9mN1pQ3sU5wY7zB9dE1fG3hI5</text>
</svg>`;

const SAMPLE_INVOICE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <rect width="100%" height="100%" fill="%230f172a" stroke="%23334155" stroke-width="2"/>
  <text x="40" y="50" fill="%2338bdf8" font-family="sans-serif" font-size="20" font-weight="bold">CONFIDENTIAL BILLING INVOICE</text>
  <text x="40" y="100" fill="%2394a3b8" font-family="sans-serif" font-size="13">CUSTOMER CONTACT</text>
  <text x="40" y="125" fill="%23f8fafc" font-family="sans-serif" font-size="15">support-lead@internalcorp.com</text>
  <text x="40" y="160" fill="%2394a3b8" font-family="sans-serif" font-size="13">DIRECT PHONE</text>
  <text x="40" y="185" fill="%23f8fafc" font-family="sans-serif" font-size="15">+1 (415) 555-0199</text>
  <text x="40" y="220" fill="%2394a3b8" font-family="sans-serif" font-size="13">CLOUD CREDENTIAL</text>
  <text x="40" y="245" fill="%23fbbf24" font-family="sans-serif" font-size="14">AKIAIOSFODNN7EXAMPLE</text>
  <text x="40" y="280" fill="%2394a3b8" font-family="sans-serif" font-size="13">DELIVERY ADDRESS</text>
  <text x="40" y="305" fill="%23f8fafc" font-family="sans-serif" font-size="15">742 Evergreen Terrace, Springfield</text>
</svg>`;

export const ImagePrivacyFilter: React.FC = () => {
  const [scanResult, setScanResult] = useState<LocalImageScanResult | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [sanitizedDataUrl, setSanitizedDataUrl] = useState<string | null>(null);
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
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
      showNotification('✓ Sanitized image copied to clipboard! (100% local)');
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
    showNotification(`✓ Saved ${filename} to downloads! (100% local)`);
  };

  const handleApproved = (artifact: SanitizedArtifact) => {
    if (artifact.sanitizedImage?.dataUrl) {
      setSanitizedDataUrl(artifact.sanitizedImage.dataUrl);
    }
    showNotification('✓ Redactions approved! Ready to Copy or Save.');
  };

  return (
    <div className="image-filter-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-cyan)' }}>🛡️</span> Local Image Privacy Filter
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            100% Local OCR & Face Sanitizer • Zero DOM Required • Zero Cloud Transmission
          </div>
        </div>

        {scanResult && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCopyImage}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📋 Copy Image
            </button>
            <button
              onClick={handleSaveImage}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              💾 Save Image
            </button>
          </div>
        )}
      </div>

      {actionNotice && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {actionNotice}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            color: 'var(--accent-rose)',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Upload Zone & Samples */}
      {!scanResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '36px 20px',
              border: '2px dashed var(--border-color)',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-color)' }}>
              Click to upload or drag & drop an image
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              PNG, JPG, SVG, WEBP (Processed completely on your device)
            </div>
          </div>

          {/* Synthetic Demo Presets */}
          <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              OR TEST WITH A SYNTHETIC SAMPLE:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => processImage(SAMPLE_ID_CARD_SVG, 'synthetic-id-card.svg')}
                disabled={scanning}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: 'var(--accent-cyan)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                🪪 Synthetic ID Card (Face, Email, ID, Token)
              </button>
              <button
                onClick={() => processImage(SAMPLE_INVOICE_SVG, 'synthetic-invoice.svg')}
                disabled={scanning}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: 'var(--accent-rose)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                📄 Synthetic Invoice (Email, Phone, AWS Key, Address)
              </button>
            </div>
          </div>
        </div>
      )}

      {scanning && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--accent-cyan)' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>⚙️ Scanning image locally...</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Running Local OCR + Face Detection + PII Pattern Scanning...
          </div>
        </div>
      )}

      {/* Interactive Editor & Privacy Results */}
      {scanResult && !scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Scan summary badges */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{scanResult.filename}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {scanResult.width}×{scanResult.height}px
              </span>
              <span
                style={{
                  background: scanResult.stats.totalDetected > 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: scanResult.stats.totalDetected > 0 ? 'var(--accent-rose)' : '#10b981',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 600,
                }}
              >
                {scanResult.stats.totalDetected} Sensitive Elements Found
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Scan time: {scanResult.latency.totalMs}ms</span>
              <button
                onClick={() => setScanResult(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '11px',
                }}
              >
                Scan another image
              </button>
            </div>
          </div>

          {/* Embedded Full Interactive Preview Editor */}
          <div
            style={{
              height: '520px',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
            }}
          >
            <PreviewEditor
              originalImageUrl={scanResult.dataUrl}
              initialRedactions={scanResult.redactionItems}
              onApprove={handleApproved}
              onCancel={() => setScanResult(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
