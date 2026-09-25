import React, { useState, useEffect } from 'react';
import {
  createMessageId,
  CapturedContextPayload,
  ExtensionStatusPayload,
  MessageResponse,
  NazarMessage,
} from '../types/messages';
import { PrivacyScanResult } from '../types/privacy';
import { runPrivacyScan } from '../privacy/privacyEngine';
import { PreviewEditor, SanitizedArtifact } from '../preview';
import { createRedactionItems } from '../redaction';
import { ImagePrivacyFilter } from '../imageFilter/ImagePrivacyFilter';
import { ModelStatusCard } from '../modelManager/ModelStatusCard';

export const App: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<CapturedContextPayload | null>(null);
  const [privacyResult, setPrivacyResult] = useState<PrivacyScanResult | null>(null);
  const [mainTab, setMainTab] = useState<'browser-agent' | 'image-filter' | 'model-engine'>('browser-agent');
  const [approvedArtifact, setApprovedArtifact] = useState<SanitizedArtifact | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = () => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }

    const message: NazarMessage = {
      id: createMessageId(),
      type: 'GET_STATUS',
      timestamp: Date.now(),
    };

    try {
      chrome.runtime.sendMessage(message, (response: MessageResponse<ExtensionStatusPayload>) => {
        if (chrome.runtime.lastError) {
          console.error('[NAZAR] fetchStatus error:', chrome.runtime.lastError);
          setError(chrome.runtime.lastError.message || 'Failed to connect to extension service worker');
          return;
        }
        if (response && response.success && response.data) {
          setError(null);
        } else {
          setError(response?.error?.message || 'Failed to get status');
        }
      });
    } catch (err: unknown) {
      console.error('[NAZAR] fetchStatus exception:', err);
      setError(err instanceof Error ? err.message : 'Service worker error');
    }
  };

  // SIMPLIFIED FLOW: Prompt → Capture → Scan → Preview
  const handleProceed = () => {
    setLoading(true);
    setError(null);
    setPrivacyResult(null);
    setApprovedArtifact(null);

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Fallback: Create dummy context and scan
      setTimeout(async () => {
        const dummyContext: CapturedContextPayload = {
          tabId: 1,
          url: 'https://example.com/test-form',
          title: 'NAZAR Test Form',
          timestamp: Date.now(),
          screenshotDataUrl:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%230f172a"/><text x="50" y="50" fill="%2338bdf8" font-family="sans-serif" font-size="16" font-weight="bold">User Information Form</text><rect x="50" y="100" width="500" height="40" rx="4" fill="%231e293b" stroke="%23334155"/><text x="60" y="130" fill="%23f8fafc" font-family="sans-serif" font-size="14">Name: John Doe</text><rect x="50" y="160" width="500" height="40" rx="4" fill="%231e293b" stroke="%23334155"/><text x="60" y="190" fill="%2338bdf8" font-family="sans-serif" font-size="14">Email: john@example.com</text><rect x="50" y="220" width="500" height="40" rx="4" fill="%231e293b" stroke="%23334155"/><text x="60" y="250" fill="%2338bdf8" font-family="sans-serif" font-size="14">Phone: +1-555-0123</text><rect x="50" y="280" width="500" height="40" rx="4" fill="%231e293b" stroke="%23334155"/><text x="60" y="310" fill="%2338bdf8" font-family="sans-serif" font-size="14">Card: 4111 1111 1111 1111</text></svg>',
          dom: {
            url: 'https://example.com/test-form',
            title: 'NAZAR Test Form',
            timestamp: Date.now(),
            viewport: {
              width: 600,
              height: 400,
              scrollX: 0,
              scrollY: 0,
              devicePixelRatio: 1,
            },
            elements: [
              {
                id: 'name',
                tagName: 'input',
                elementType: 'input',
                selector: '#name',
                boundingBox: { x: 50, y: 100, width: 500, height: 40, top: 100, left: 50, bottom: 140, right: 550 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'text', placeholder: 'Name' },
                isSensitiveCandidate: true,
              },
              {
                id: 'email',
                tagName: 'input',
                elementType: 'input',
                selector: '#email',
                boundingBox: { x: 50, y: 160, width: 500, height: 40, top: 160, left: 50, bottom: 200, right: 550 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'email', placeholder: 'Email' },
                isSensitiveCandidate: true,
              },
              {
                id: 'phone',
                tagName: 'input',
                elementType: 'input',
                selector: '#phone',
                boundingBox: { x: 50, y: 220, width: 500, height: 40, top: 220, left: 50, bottom: 260, right: 550 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'tel', placeholder: 'Phone' },
                isSensitiveCandidate: true,
              },
              {
                id: 'card',
                tagName: 'input',
                elementType: 'input',
                selector: '#card',
                boundingBox: { x: 50, y: 280, width: 500, height: 40, top: 280, left: 50, bottom: 320, right: 550 },
                isVisible: true,
                isInteractive: true,
                attributes: { type: 'text', placeholder: 'Card' },
                isSensitiveCandidate: true,
              },
            ],
            stats: {
              totalElements: 4,
              interactiveCount: 4,
              sensitiveCandidateCount: 4,
              formsCount: 1,
            },
          },
        };
        setCapturedContext(dummyContext);
        
        try {
          const result = await runPrivacyScan(dummyContext);
          setPrivacyResult(result);
          console.log('[NAZAR] Privacy scan complete, regions:', result.regions);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Privacy scan failed');
        }
        setLoading(false);
      }, 500);
      return;
    }

    // REAL FLOW: Capture from browser
    const message: NazarMessage = {
      id: createMessageId(),
      type: 'CAPTURE_CONTEXT',
      timestamp: Date.now(),
    };

    try {
      chrome.runtime.sendMessage(message, async (response: MessageResponse<CapturedContextPayload>) => {
        if (chrome.runtime.lastError) {
          console.error('[NAZAR] Capture error:', chrome.runtime.lastError);
          setError(chrome.runtime.lastError.message || 'Capture failed');
          setLoading(false);
          return;
        }
        
        if (response && response.success && response.data) {
          setCapturedContext(response.data);
          setError(null);
          
          // Immediately run privacy scan
          try {
            const result = await runPrivacyScan(response.data);
            setPrivacyResult(result);
            console.log('[NAZAR] Privacy scan complete, regions:', result.regions);
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Privacy scan failed');
          }
        } else {
          setError(response?.error?.message || 'Context capture failed');
        }
        setLoading(false);
      });
    } catch (err: unknown) {
      setLoading(false);
      console.error('[NAZAR] Capture exception:', err);
      setError(err instanceof Error ? err.message : 'Capture error');
    }
  };

  const handleApproveRedactions = (artifact: SanitizedArtifact) => {
    setApprovedArtifact(artifact);
    console.log('[NAZAR] Redactions approved, ready for agent:', artifact);
  };

  const handleReset = () => {
    setCapturedContext(null);
    setPrivacyResult(null);
    setApprovedArtifact(null);
    setUserPrompt('');
    setError(null);
  };

  return (
    <div className="container" style={{ maxWidth: privacyResult ? '800px' : '500px' }}>
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

      {/* Browser Agent Feature */}
      {mainTab === 'browser-agent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <strong>Error:</strong> {error}
              </div>
            </div>
          )}

          {/* STEP 1: Prompt Input + Proceed */}
          {!privacyResult && !approvedArtifact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  What would you like the AI to do?
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="e.g., 'Fill out this form automatically' or 'Extract information from this page'"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    color: '#f8fafc',
                    fontFamily: 'system-ui',
                    fontSize: '13px',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                />
              </div>
              <button
                id="btn-proceed-agent"
                className="btn-proceed"
                onClick={handleProceed}
                disabled={loading || !userPrompt.trim()}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                    <span>Processing Privacy Firewall...</span>
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🛡️ Run Local Privacy Firewall & Preview</span>
                    <span style={{ fontSize: '14px' }}>→</span>
                  </span>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: Privacy Scan + Preview */}
          {privacyResult && !approvedArtifact && capturedContext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Image Info */}
              <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Captured Viewport:</span>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    {Math.round(capturedContext.dom.viewport.width)} × {Math.round(capturedContext.dom.viewport.height)} px
                    {capturedContext.dom.viewport.devicePixelRatio > 1 && ` (${capturedContext.dom.viewport.devicePixelRatio}x DPR)`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Sensitive Elements Found:</span>
                  <span style={{ color: privacyResult.regions.length > 0 ? '#f87171' : '#10b981', fontWeight: 600 }}>
                    {privacyResult.regions.length} items
                  </span>
                </div>
              </div>

              {/* Preview Editor (With full auto-fit viewport) */}
              <div
                style={{
                  height: '500px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                }}
              >
                <PreviewEditor
                  originalImageUrl={capturedContext.screenshotDataUrl}
                  initialRedactions={createRedactionItems(privacyResult.regions, { paddingPx: 4 })}
                  domContext={{
                    url: capturedContext.dom.url,
                    title: capturedContext.dom.title,
                    timestamp: capturedContext.dom.timestamp,
                    elements: capturedContext.dom.elements,
                    redactedCount: privacyResult.regions.length,
                    appliedRedactions: createRedactionItems(privacyResult.regions, { paddingPx: 4 }),
                  }}
                  onApprove={handleApproveRedactions}
                  onCancel={handleReset}
                />
              </div>
            </div>
          )}

          {/* STEP 3: Ready to Send to Agent */}
          {approvedArtifact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px', borderRadius: '6px', color: '#10b981', fontSize: '13px' }}>
                ✓ Privacy approval locked. Ready to proceed with sanitized context.
              </div>
              <button
                onClick={handleReset}
                style={{
                  padding: '10px 16px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  color: '#38bdf8',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                ← Start Over
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
