import React, { useState, useEffect } from 'react';
import {
  createMessageId,
  CapturedContextPayload,
  ExtensionStatusPayload,
  MessageResponse,
  NazarMessage,
  RunPrivacyScanMessage,
} from '../types/messages';
import { PrivacyScanResult } from '../types/privacy';
import { runPrivacyScan } from '../privacy/privacyEngine';
import { PreviewEditor, SanitizedArtifact } from '../preview';
import { createRedactionItems } from '../redaction';
import { ImagePrivacyFilter } from '../imageFilter/ImagePrivacyFilter';
import { ModelStatusCard } from '../modelManager/ModelStatusCard';

export const App: React.FC = () => {
  const [status, setStatus] = useState<ExtensionStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<CapturedContextPayload | null>(null);
  const [privacyResult, setPrivacyResult] = useState<PrivacyScanResult | null>(null);
  const [activeTabName, setActiveTabName] = useState<'overview' | 'dom' | 'privacy' | 'editor'>('overview');
  const [mainTab, setMainTab] = useState<'browser-agent' | 'image-filter' | 'model-engine'>('browser-agent');
  const [approvedArtifact, setApprovedArtifact] = useState<SanitizedArtifact | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = () => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      setStatus({
        ready: true,
        version: '0.1.0 (dev-preview)',
        activeTabAccessible: true,
        url: 'http://localhost/test-page.html',
      });
      return;
    }

    const message: NazarMessage = {
      id: createMessageId(),
      type: 'GET_STATUS',
      timestamp: Date.now(),
    };

    chrome.runtime.sendMessage(message, (response: MessageResponse<ExtensionStatusPayload>) => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || 'Failed to connect to extension service worker');
        return;
      }
      if (response && response.success && response.data) {
        setStatus(response.data);
      } else {
        setError(response?.error?.message || 'Failed to get status');
      }
    });
  };

  const handleCapture = () => {
    setLoading(true);
    setError(null);
    setPrivacyResult(null);
    setApprovedArtifact(null);

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      setTimeout(async () => {
        const dummyContext: CapturedContextPayload = {
          tabId: 1,
          url: 'https://example.com/test-form',
          title: 'NAZAR Test Form',
          timestamp: Date.now(),
          screenshotDataUrl:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" fill="%2338bdf8" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif">Sample Viewport</text></svg>',
          dom: {
            url: 'https://example.com/test-form',
            title: 'NAZAR Test Form',
            timestamp: Date.now(),
            viewport: {
              width: 1280,
              height: 800,
              scrollX: 0,
              scrollY: 0,
              devicePixelRatio: 1,
            },
            elements: [
              {
                id: 'email',
                tagName: 'input',
                elementType: 'input',
                selector: '#email',
                boundingBox: { x: 50, y: 100, width: 220, height: 36, top: 100, left: 50, bottom: 136, right: 270 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'email', placeholder: 'Enter email' },
                isSensitiveCandidate: true,
              },
              {
                id: 'pwd',
                tagName: 'input',
                elementType: 'input',
                selector: '#pwd',
                boundingBox: { x: 50, y: 150, width: 220, height: 36, top: 150, left: 50, bottom: 186, right: 270 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'password' },
                isSensitiveCandidate: true,
              },
            ],
            stats: {
              totalElements: 2,
              interactiveCount: 2,
              sensitiveCandidateCount: 2,
              formsCount: 1,
            },
          },
        };
        setCapturedContext(dummyContext);
        setLoading(false);
      }, 400);
      return;
    }

    const message: NazarMessage = {
      id: createMessageId(),
      type: 'CAPTURE_CONTEXT',
      timestamp: Date.now(),
    };

    chrome.runtime.sendMessage(message, (response: MessageResponse<CapturedContextPayload>) => {
      setLoading(false);
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || 'Capture failed');
        return;
      }
      if (response && response.success && response.data) {
        setCapturedContext(response.data);
      } else {
        setError(response?.error?.message || 'Context capture failed');
      }
    });
  };

  const handleRunPrivacyScan = async () => {
    if (!capturedContext) return;
    setScanning(true);
    setError(null);

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Local fallback
      try {
        const res = await runPrivacyScan(capturedContext);
        setPrivacyResult(res);
        setActiveTabName('editor');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Privacy scan failed');
      } finally {
        setScanning(false);
      }
      return;
    }

    const scanMsg: RunPrivacyScanMessage = {
      id: createMessageId(),
      type: 'RUN_PRIVACY_SCAN',
      timestamp: Date.now(),
      context: capturedContext,
    };

    chrome.runtime.sendMessage(scanMsg, (response: MessageResponse<PrivacyScanResult>) => {
      setScanning(false);
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || 'Privacy scan failed');
        return;
      }
      if (response && response.success && response.data) {
        setPrivacyResult(response.data);
        setActiveTabName('editor');
      } else {
        setError(response?.error?.message || 'Privacy scan failed');
      }
    });
  };

  return (
    <div className="container" style={{ maxWidth: (activeTabName === 'editor' || mainTab === 'image-filter') ? '680px' : '440px' }}>
      {/* Header */}
      <header className="header">
        <div className="logo-group">
          <div className="shield-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="title-wrap">
            <h1>NAZAR</h1>
            <span>Privacy Firewall • Phase 8</span>
          </div>
        </div>
        <div className="status-pill">
          <span className="status-dot"></span>
          <span>Local Engine Active</span>
        </div>
      </header>

      {/* Main Feature Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--card-bg)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-color)' }}>
        <button
          id="tab-browser-agent"
          onClick={() => setMainTab('browser-agent')}
          style={{
            flex: 1, padding: '7px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: mainTab === 'browser-agent' ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))' : 'transparent',
            color: mainTab === 'browser-agent' ? '#fff' : 'var(--text-muted)',
            fontWeight: 600, fontSize: '11px', transition: 'all 0.2s',
          }}
        >
          🌐 Browser Agent
        </button>
        <button
          id="tab-image-filter"
          onClick={() => setMainTab('image-filter')}
          style={{
            flex: 1, padding: '7px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: mainTab === 'image-filter' ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'transparent',
            color: mainTab === 'image-filter' ? '#fff' : 'var(--text-muted)',
            fontWeight: 600, fontSize: '11px', transition: 'all 0.2s',
          }}
        >
          🛡️ Image Filter
        </button>
        <button
          id="tab-model-engine"
          onClick={() => setMainTab('model-engine')}
          style={{
            flex: 1, padding: '7px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: mainTab === 'model-engine' ? 'linear-gradient(135deg, #059669, #0d9488)' : 'transparent',
            color: mainTab === 'model-engine' ? '#fff' : 'var(--text-muted)',
            fontWeight: 600, fontSize: '11px', transition: 'all 0.2s',
          }}
        >
          ⚙️ Model Engine
        </button>
      </div>

      {/* Model Engine Status Feature (Phase 8) */}
      {mainTab === 'model-engine' && (
        <ModelStatusCard />
      )}

      {/* Image Privacy Filter Feature */}
      {mainTab === 'image-filter' && (
        <ImagePrivacyFilter />
      )}

      {mainTab === 'browser-agent' && <React.Fragment>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong>Scan Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          id="btn-capture-context"
          className="btn-primary"
          onClick={handleCapture}
          disabled={loading || (status !== null && !status.activeTabAccessible)}
        >
          {loading ? <span>Capturing...</span> : <span>1. Capture Tab</span>}
        </button>

        {capturedContext && (
          <button
            id="btn-run-privacy-scan"
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #059669, #0d9488)' }}
            onClick={handleRunPrivacyScan}
            disabled={scanning}
          >
            {scanning ? <span>Scanning PII/OCR...</span> : <span>2. Run Privacy Scan</span>}
          </button>
        )}

        {capturedContext && (
          <button
            id="btn-open-editor"
            className="btn-primary"
            style={{
              background: activeTabName === 'editor' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#1e293b',
              border: '1px solid #38bdf8',
            }}
            onClick={() => setActiveTabName('editor')}
          >
            <span>3. Review & Edit Redactions</span>
          </button>
        )}
      </div>

      {/* Approved Sanitized Artifact Banner */}
      {approvedArtifact && (
        <div
          style={{
            backgroundColor: 'rgba(5, 150, 105, 0.15)',
            border: '1px solid #10b981',
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '11px',
            color: '#a7f3d0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✓ SANITIZED ARTIFACT APPROVED
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6ee7b7' }}>
              {approvedArtifact.artifactId}
            </span>
          </div>
          <div>
            {approvedArtifact.redactionsCount} redaction(s) locked with checksum{' '}
            <code style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
              {approvedArtifact.securityChecksum.substring(0, 14)}...
            </code>
          </div>
          <div style={{ fontSize: '10px', color: '#6ee7b7', marginTop: '4px' }}>
            Ready for Phase 5 Secure Egress Gate. Raw user data remains 100% sealed on device.
          </div>
        </div>
      )}

      {/* Restricted Tab Notice */}
      {status && !status.activeTabAccessible && (
        <div style={{ fontSize: '11px', color: 'var(--accent-amber)', textAlign: 'center' }}>
          Restricted internal page. Navigate to any standard website or test page.
        </div>
      )}

      {/* Captured Context Details */}
      {capturedContext && (
        <>
          {/* Stats Bar */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{capturedContext.dom.stats.totalElements}</div>
              <div className="stat-label">DOM Nodes</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{capturedContext.dom.stats.interactiveCount}</div>
              <div className="stat-label">Interactive</div>
            </div>
            <div
              className="stat-card"
              style={{
                borderColor: privacyResult && privacyResult.stats.totalDetected > 0 ? 'rgba(244, 63, 94, 0.4)' : undefined,
              }}
            >
              <div
                className="stat-number"
                style={{
                  color: privacyResult && privacyResult.stats.totalDetected > 0 ? 'var(--accent-rose)' : undefined,
                }}
              >
                {privacyResult ? privacyResult.stats.totalDetected : capturedContext.dom.stats.sensitiveCandidateCount}
              </div>
              <div className="stat-label">{privacyResult ? 'Detected PII' : 'Candidates'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">
                {privacyResult ? `${privacyResult.latency.totalMs}ms` : `${capturedContext.dom.stats.formsCount}`}
              </div>
              <div className="stat-label">{privacyResult ? 'Scan Latency' : 'Forms'}</div>
            </div>
          </div>

          {/* Tab selector for View */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '4px',
            }}
          >
            <button
              onClick={() => setActiveTabName('editor')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTabName === 'editor' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                paddingBottom: '2px',
                borderBottom: activeTabName === 'editor' ? '2px solid var(--accent-cyan)' : 'none',
              }}
            >
              Preview Editor {privacyResult ? `(${privacyResult.regions.length})` : ''}
            </button>
            <button
              onClick={() => setActiveTabName('overview')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTabName === 'overview' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                paddingBottom: '2px',
                borderBottom: activeTabName === 'overview' ? '2px solid var(--accent-cyan)' : 'none',
              }}
            >
              Screenshot
            </button>
            <button
              onClick={() => setActiveTabName('dom')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTabName === 'dom' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                paddingBottom: '2px',
                borderBottom: activeTabName === 'dom' ? '2px solid var(--accent-cyan)' : 'none',
              }}
            >
              DOM ({capturedContext.dom.elements.length})
            </button>
            {privacyResult && (
              <button
                onClick={() => setActiveTabName('privacy')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeTabName === 'privacy' ? 'var(--accent-rose)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  paddingBottom: '2px',
                  borderBottom: activeTabName === 'privacy' ? '2px solid var(--accent-rose)' : 'none',
                }}
              >
                Scan List ({privacyResult.regions.length})
              </button>
            )}
          </div>

          {/* Tab 1: Interactive Preview Editor */}
          {activeTabName === 'editor' && (
            <div style={{ height: '380px', width: '100%' }}>
              <PreviewEditor
                originalImageUrl={capturedContext.screenshotDataUrl}
                initialRedactions={createRedactionItems(privacyResult ? privacyResult.regions : [])}
                onApprove={(artifact) => {
                  setApprovedArtifact(artifact);
                }}
                onCancel={() => {
                  setApprovedArtifact(null);
                  setActiveTabName('overview');
                }}
              />
            </div>
          )}

          {/* Tab 2: Overview Screenshot */}
          {activeTabName === 'overview' && (
            <div className="card">
              <div className="card-title">
                <span>
                  Viewport ({capturedContext.dom.viewport.width}x{capturedContext.dom.viewport.height})
                </span>
                <span style={{ fontSize: '10px', color: 'var(--accent-teal)' }}>In-Memory Only</span>
              </div>
              <div className="preview-container">
                <img
                  src={capturedContext.screenshotDataUrl}
                  alt="Captured Viewport"
                  className="preview-img"
                />
              </div>
            </div>
          )}

          {/* Tab 3: DOM List */}
          {activeTabName === 'dom' && (
            <div className="card">
              <div className="card-title">
                <span>Discovered Interactive & Semantic Elements</span>
              </div>
              <div className="elements-list">
                {capturedContext.dom.elements.map((el) => (
                  <div key={el.id} className="element-item">
                    <div>
                      <span className="element-tag">&lt;{el.tagName}&gt;</span>{' '}
                      <span className="element-selector" title={el.selector}>
                        {el.selector}
                      </span>
                    </div>
                    {el.isSensitiveCandidate && <span className="badge-sensitive">Candidate</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Privacy Scan Fused Detections */}
          {activeTabName === 'privacy' && privacyResult && (
            <div className="card">
              <div className="card-title">
                <span>Fused Sensitive Regions ({privacyResult.regions.length})</span>
                <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  DOM: {privacyResult.latency.domMs}ms | OCR: {privacyResult.latency.ocrMs}ms | PII:{' '}
                  {privacyResult.latency.piiMs}ms | Fusion: {privacyResult.latency.fusionMs}ms
                </span>
              </div>
              <div className="elements-list">
                {privacyResult.regions.map((region) => (
                  <div key={region.id} className="element-item" style={{ borderColor: 'rgba(244, 63, 94, 0.3)' }}>
                    <div>
                      <span style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>{region.label}</span>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {region.source.toUpperCase()} • Conf: {Math.round(region.confidence * 100)}% • Box: (
                        {region.boundingBox.x}, {region.boundingBox.y}, {region.boundingBox.width}x
                        {region.boundingBox.height})
                      </div>
                    </div>
                    <span className="badge-sensitive" style={{ textTransform: 'capitalize' }}>
                      {region.recommendedRedaction.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      </React.Fragment>}

      {/* Footer */}
      <footer className="footer-info">
        NAZAR v0.1.0 • Phase 8 Model Manager & Offline Operation • Zero external network egress
      </footer>
    </div>
  );
};
