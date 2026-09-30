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
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#0a1020',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 24px rgba(37, 99, 235, 0.15)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <NazarEyeIcon size={24} state="active" />
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Privacy Engine Diagnostics
              </h2>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Local intelligence verification & fail-closed security
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
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

        {/* Status Guarantee Banner */}
        <div
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '12px',
            padding: '12px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            fontSize: '11.5px',
            color: '#cbd5e1',
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: '#22d3ee', marginTop: '2px', flexShrink: 0 }}>
            <CloudOffIcon size={18} />
          </div>
          <div>
            <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '2px' }}>
              Zero Cloud Transmission Guarantee
            </strong>
            All privacy engines execute purely on your local machine. If any engine is offline, outgoing AI agent transmission is immediately locked.
          </div>
        </div>

        {/* Engine Capabilities List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {capabilitiesList.map(({ key, name, desc }) => {
            const item: ModelCapabilityStatus = health.capabilities[key];
            const isReady = item?.status === 'ready' && item.verified;

            return (
              <div
                key={key}
                style={{
                  background: 'rgba(13, 20, 36, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
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
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      {name}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                    {desc}
                  </p>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {isReady ? (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#34d399',
                        fontWeight: 600,
                        background: 'rgba(16, 185, 129, 0.12)',
                        padding: '3px 8px',
                        borderRadius: '6px',
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
                        padding: '4px 10px',
                        fontSize: '11px',
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
        <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)', paddingTop: '10px' }}>
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '11px',
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
                marginTop: '8px',
                padding: '8px 10px',
                background: '#050914',
                border: '1px solid rgba(148, 163, 184, 0.12)',
                borderRadius: '8px',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#94a3b8',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div>Overall Status: {health.overallStatus.toUpperCase()}</div>
              <div>Offline Operation: {health.isOfflineReady ? 'VERIFIED (100% LOCAL)' : 'PENDING'}</div>
              <div>Fail-Closed Policy: STRICT_ENFORCE</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          {!health.allVerified && (
            <button
              onClick={handleInstallAll}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#fff',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
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
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
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
