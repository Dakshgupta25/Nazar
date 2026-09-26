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
import { NazarEyeIcon, SettingsIcon, CheckIcon } from './NazarIcons';
import { SensitiveBadge } from './SensitiveBadge';
import { EngineStatusModal } from './EngineStatusModal';

export const App: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<CapturedContextPayload | null>(null);
  const [privacyResult, setPrivacyResult] = useState<PrivacyScanResult | null>(null);
  const [mainTab, setMainTab] = useState<'browser-agent' | 'image-filter'>('browser-agent');
  const [approvedArtifact, setApprovedArtifact] = useState<SanitizedArtifact | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [isEngineModalOpen, setIsEngineModalOpen] = useState<boolean>(false);

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

  // FLOW: Prompt → Capture Context → Local Privacy Scan → Interactive Preview
  const handleProceed = () => {
    setLoading(true);
    setError(null);
    setPrivacyResult(null);
    setApprovedArtifact(null);

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Fallback: Create mock context and scan locally
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
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Privacy scan failed');
        }
        setLoading(false);
      }, 400);
      return;
    }

    // REAL FLOW: Capture from active browser tab
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
          
          try {
            const result = await runPrivacyScan(response.data);
            setPrivacyResult(result);
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
  };

  const handleReset = () => {
    setCapturedContext(null);
    setPrivacyResult(null);
    setApprovedArtifact(null);
    setUserPrompt('');
    setError(null);
  };

  const eyeState = loading ? 'scanning' : privacyResult ? 'active' : 'idle';

  return (
    <div className="container" style={{ maxWidth: privacyResult ? '800px' : '460px' }}>
      {/* 1. Header & Live Privacy Status */}
      <header className="header">
        <div className="logo-group">
          <div className="brand-icon-wrapper">
            <NazarEyeIcon size={26} state={eyeState} />
          </div>
          <div className="title-wrap">
            <h1>NAZAR</h1>
            <span>Local Privacy Firewall</span>
          </div>
        </div>

        {/* Demoted Status / Diagnostics Trigger */}
        <button
          className="status-pill-button"
          onClick={() => setIsEngineModalOpen(true)}
          title="Click to view Local Engine Diagnostics"
        >
          <span className="status-dot-pulse"></span>
          <span>100% On-Device</span>
          <SettingsIcon size={12} color="#64748b" />
        </button>
      </header>

      {/* 2. Main Task Segmented Control (Two Core Tasks) */}
      <div className="segmented-tabs">
        <button
          id="tab-browser-agent"
          className={`tab-btn ${mainTab === 'browser-agent' ? 'active' : ''}`}
          onClick={() => setMainTab('browser-agent')}
        >
          <span>🌐</span> Browser Agent
        </button>
        <button
          id="tab-image-filter"
          className={`tab-btn ${mainTab === 'image-filter' ? 'active' : ''}`}
          onClick={() => setMainTab('image-filter')}
        >
          <span>🖼️</span> Image Sanitizer
        </button>
      </div>

      {/* 3. Image Privacy Filter Tab */}
      {mainTab === 'image-filter' && (
        <div style={{ marginTop: '4px' }}>
          <ImagePrivacyFilter />
        </div>
      )}

      {/* 4. Browser Agent Tab */}
      {mainTab === 'browser-agent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Prompt Input + Action Button */}
          {!privacyResult && !approvedArtifact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  What would you like the AI agent to do?
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="e.g., 'Fill out this application' or 'Extract the order details from this page'..."
                  className="agent-prompt-textarea"
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
                    <NazarEyeIcon size={18} state="scanning" />
                    <span>Sanitizing Browser Context...</span>
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <NazarEyeIcon size={18} state="active" />
                    <span>Sanitize & Preview Context</span>
                    <span style={{ fontSize: '14px' }}>→</span>
                  </span>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: Privacy Scan + Interactive Preview Editor */}
          {privacyResult && !approvedArtifact && capturedContext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Scan Status Row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Page Context:
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      maxWidth: '180px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={capturedContext.dom.title}
                  >
                    {capturedContext.dom.title || capturedContext.dom.url}
                  </span>
                </div>

                <SensitiveBadge count={privacyResult.regions.length} size="sm" />
              </div>

              {/* Interactive Preview Editor */}
              <div
                style={{
                  height: '480px',
                  borderRadius: '10px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s ease' }}>
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '16px',
                  borderRadius: '10px',
                  color: '#34d399',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ background: '#10b981', color: '#090d16', borderRadius: '50%', padding: '4px', display: 'flex' }}>
                  <CheckIcon size={16} />
                </div>
                <div>
                  <strong style={{ display: 'block', color: '#f8fafc', marginBottom: '2px' }}>
                    Privacy Firewall Locked
                  </strong>
                  <span>Sanitized context is approved and ready for the AI browser agent.</span>
                </div>
              </div>

              <button
                onClick={handleReset}
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: '#38bdf8',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                ← Start New Task
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demoted Model Engine Diagnostics Modal */}
      <EngineStatusModal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
      />
    </div>
  );
};
