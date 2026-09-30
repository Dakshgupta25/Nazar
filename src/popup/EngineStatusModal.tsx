import React, { useState, useEffect } from 'react';
import { ModelCapability, ModelCapabilityStatus, PrivacyEngineHealth } from '../types/models';
import { ModelManager } from '../modelManager/modelManager';
import { NazarEyeIcon, CloseIcon, CloudOffIcon } from './NazarIcons';

export interface EngineStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EngineStatusModal: React.FC<EngineStatusModalProps> = ({ isOpen, onClose }) => {
  const [manager] = useState<ModelManager>(() => {
    const instance = ModelManager.getInstance();
    instance.setDevMode(true);
    return instance;
  });
  const [health, setHealth] = useState<PrivacyEngineHealth>(() => manager.getPrivacyEngineHealth());
  const [loading, setLoading] = useState<boolean>(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  const refreshStatus = async () => {
    setLoading(true);
    try {
      const updated = await manager.detectInstalledModels();
      setHealth(updated);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async (cap: ModelCapability) => {
    setLoading(true);
    try {
      await manager.downloadModel(cap);
      setHealth(manager.getPrivacyEngineHealth());
    } finally {
      setLoading(false);
    }
  };

  const handleInstallAll = async () => {
    setLoading(true);
    try {
      await manager.installAllMissingModels();
      setHealth(manager.getPrivacyEngineHealth());
    } finally {
      setLoading(false);
    }
  };

  const handleResetAll = async () => {
    setLoading(true);
    try {
      await manager.clearAllModels();
      try {
        localStorage.removeItem('nazar_model_onboarding_completed');
        localStorage.removeItem('nazar_installed_model');
      } catch {}
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  const capabilitiesList: { key: ModelCapability; name: string; desc: string }[] = [
    {
      key: 'ocr',
      name: 'Visual Text & OCR Engine',
      desc: 'Extracts and sanitizes text embedded in images, forms, and canvas captures.',
    },
    {
      key: 'face_detection',
      name: 'Neural Face Sanitizer',
      desc: 'Detects facial features to apply protective privacy blurring locally.',
    },
    {
      key: 'pii_detection',
      name: 'PII & Secret Firewall',
      desc: 'Pattern recognition for emails, API keys, cards, credentials, and passwords.',
    },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: 'calc(100vh - 16px)',
          backgroundColor: '#0a1020',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '14px',
          padding: '12px 14px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 24px rgba(37, 99, 235, 0.15)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Header - Fixed at Top */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NazarEyeIcon size={22} state="active" />
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Privacy Engine Diagnostics
              </h2>
              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                Local intelligence verification & fail-closed security
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Scrollable Body - Adapts to Popup Size */}
        <div
          className="modal-scroll-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingRight: '4px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(148, 163, 184, 0.3) transparent',
          }}
        >
          {/* Status Guarantee Banner */}
          <div
            style={{
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.22)',
              borderRadius: '10px',
              padding: '9px 11px',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              fontSize: '11px',
              color: '#cbd5e1',
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            <div style={{ color: '#22d3ee', marginTop: '1px', flexShrink: 0 }}>
              <CloudOffIcon size={16} />
            </div>
            <div>
              <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '2px', fontSize: '11px' }}>
                Zero Cloud Transmission Guarantee
              </strong>
              All privacy engines execute purely on your local machine. If any engine is offline, outgoing AI agent transmission is immediately locked.
            </div>
          </div>

          {/* Engine Capabilities List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {capabilitiesList.map(({ key, name, desc }) => {
              const item: ModelCapabilityStatus = health.capabilities[key];
              const isReady = item?.status === 'ready' && item.verified;

              return (
                <div
                  key={key}
                  style={{
                    background: 'rgba(13, 20, 36, 0.8)',
                    border: '1px solid rgba(148, 163, 184, 0.12)',
                    borderRadius: '9px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: isReady ? '#10b981' : '#f59e0b',
                          boxShadow: isReady ? '0 0 6px #10b981' : '0 0 6px #f59e0b',
                        }}
                      />
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#f8fafc' }}>
                        {name}
                      </span>
                    </div>
                    <p style={{ fontSize: '10.5px', color: '#64748b', margin: 0, lineHeight: 1.35 }}>
                      {desc}
                    </p>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {isReady ? (
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: '#34d399',
                          fontWeight: 600,
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownload(key)}
                        disabled={loading}
                        style={{
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          color: '#fff',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                        }}
                      >
                        Enable
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Technical Details */}
          <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)', paddingTop: '8px' }}>
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '10.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 0',
              }}
            >
              <span>{showTechnicalDetails ? '▾' : '▸'} Advanced Engine Verification</span>
            </button>

            {showTechnicalDetails && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '7px 9px',
                  background: '#050914',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  borderRadius: '7px',
                  fontSize: '9.5px',
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div>Overall Status: {health.overallStatus.toUpperCase()}</div>
                <div>Offline Operation: {health.isOfflineReady ? 'VERIFIED (100% LOCAL)' : 'PENDING'}</div>
                <div>Fail-Closed Policy: STRICT_ENFORCE</div>
                <button
                  onClick={handleResetAll}
                  disabled={loading}
                  style={{
                    marginTop: '5px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    borderRadius: '5px',
                    padding: '3px 7px',
                    fontSize: '9.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  🗑️ Clear Stored Models & Re-run Setup
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions - Fixed at Bottom */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
            flexShrink: 0,
          }}
        >
          {!health.allVerified && (
            <button
              onClick={handleInstallAll}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#fff',
                borderRadius: '7px',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              }}
            >
              {loading ? 'Verifying...' : 'Install All Engines'}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(13, 20, 36, 0.9)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
              color: '#f8fafc',
              borderRadius: '7px',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
