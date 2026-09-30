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
import { NazarEyeIcon, SettingsIcon, CheckIcon, CpuIcon } from './NazarIcons';
import { EngineStatusModal } from './EngineStatusModal';
import { ModelSetupWizard, ModelTier } from './components/ModelSetupWizard';

export type PopupSize = 'S' | 'M' | 'L';

export const POPUP_DIMENSIONS: Record<PopupSize, { width: number; height: number }> = {
  S: { width: 380, height: 400 },
  M: { width: 480, height: 460 },
  L: { width: 760, height: 550 },
};

export const App: React.FC = () => {
  const [popupSize, setPopupSize] = useState<PopupSize>('M');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedContext, setCapturedContext] = useState<CapturedContextPayload | null>(null);
  const [privacyResult, setPrivacyResult] = useState<PrivacyScanResult | null>(null);
  const [mainTab, setMainTab] = useState<'browser-agent' | 'image-filter'>('browser-agent');
  const [approvedArtifact, setApprovedArtifact] = useState<SanitizedArtifact | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [isEngineModalOpen, setIsEngineModalOpen] = useState<boolean>(false);

  // Model Onboarding & Hardware Setup State
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nazar_model_onboarding_completed') === 'true';
    } catch {
      return false;
    }
  });
  const [showModelWizard, setShowModelWizard] = useState<boolean>(!onboardingCompleted);
  const [installedModel, setInstalledModel] = useState<ModelTier>(() => {
    try {
      return (localStorage.getItem('nazar_installed_model') as ModelTier) || 'micro';
    } catch {
      return 'micro';
    }
  });

  const applyPopupSize = (size: PopupSize) => {
    setPopupSize(size);
    try {
      localStorage.setItem('nazar_popup_size', size);
    } catch {}
    const dim = POPUP_DIMENSIONS[size];
    if (typeof document !== 'undefined') {
      document.documentElement.style.width = `${dim.width}px`;
      document.body.style.width = `${dim.width}px`;
      document.documentElement.style.height = `${dim.height}px`;
      document.body.style.height = `${dim.height}px`;
      document.documentElement.style.minHeight = '0px';
      document.body.style.minHeight = '0px';
      document.body.setAttribute('data-popup-size', size);
    }
  };

  // Dynamically sync popup height to actual content so there is zero extra blank space below the inspector
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.querySelector('.container') as HTMLElement;
    if (!container) return;

    const syncHeight = () => {
      const scrollH = container.scrollHeight;
      if (scrollH > 150) {
        document.documentElement.style.height = `${scrollH}px`;
        document.body.style.height = `${scrollH}px`;
      }
    };

    const timer = setTimeout(syncHeight, 40);
    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(container);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [popupSize, privacyResult, mainTab, showModelWizard, approvedArtifact]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nazar_popup_size') as PopupSize;
      if (saved && (saved === 'S' || saved === 'M' || saved === 'L')) {
        applyPopupSize(saved);
        return;
      }
    } catch {}
    applyPopupSize('M');
  }, []);

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
    <div className={`container size-${popupSize.toLowerCase()}`}>
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

        {/* Popup Size Selector (S, M, L) + Model Setup + Engine Diagnostics */}
        <div className="header-controls">
          <div className="size-selector-pills">
            {(['S', 'M', 'L'] as const).map((sz) => (
              <button
                key={sz}
                id={`btn-size-${sz.toLowerCase()}`}
                className={`size-pill-btn ${popupSize === sz ? 'active' : ''}`}
                onClick={() => applyPopupSize(sz)}
                title={`Set popup size: ${sz === 'S' ? 'Small' : sz === 'M' ? 'Medium (Standard)' : 'Large'}`}
              >
                {sz}
              </button>
            ))}
          </div>

          <button
            id="btn-model-setup"
            className="icon-settings-btn model-setup-btn"
            onClick={() => setShowModelWizard(true)}
            title={`Active AI Model: ${installedModel.toUpperCase()} (Click to open Model Setup & Calibration)`}
          >
            <CpuIcon size={14} color="#22d3ee" />
            <span>
              {installedModel === 'micro' ? 'Micro' : installedModel === 'pro' ? 'Pro' : 'Balanced'}
            </span>
          </button>

          <button
            className="icon-settings-btn"
            onClick={() => setIsEngineModalOpen(true)}
            title="Local Engine Diagnostics"
          >
            <SettingsIcon size={14} color="#94a3b8" />
          </button>
        </div>
      </header>

      {/* 2. Model Onboarding Setup Wizard OR Main App Tasks */}
      {showModelWizard ? (
        <ModelSetupWizard
          initialTier={installedModel}
          allowCancel={onboardingCompleted}
          onClose={() => setShowModelWizard(false)}
          onComplete={(selectedTier) => {
            setInstalledModel(selectedTier);
            setOnboardingCompleted(true);
            setShowModelWizard(false);
          }}
        />
      ) : (
        <>
          {/* Main Task Segmented Control (Two Core Tasks) */}
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
                  {/* Interactive Preview Editor */}
                  <div style={{ width: '100%' }}>
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
                      popupSize={popupSize}
                    />
                  </div>

                  {/* Proceed button below the redacted image preview */}
                  <button
                    id="btn-preview-proceed"
                    className="btn-proceed"
                    onClick={() => {
                      console.info('[NAZAR] Proceed clicked from redacted preview');
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
        </>
      )}

      {/* Demoted Model Engine Diagnostics Modal */}
      <EngineStatusModal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
      />
    </div>
  );
};
