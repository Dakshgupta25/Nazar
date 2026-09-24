/**
 * NAZAR Privacy Engine Model Status Component (Phase 8)
 *
 * Renders the required Phase 8 status dashboard:
 *
 * NAZAR Privacy Engine
 * ✓ OCR
 * ✓ Face Detection
 * ✓ PII Detection
 * Status: Ready
 *
 * Provides download triggers, integrity indicators, offline status,
 * and fail-closed explanations for unavailable capabilities.
 */

import React, { useState, useEffect } from 'react';
import { ModelCapability, ModelCapabilityStatus, PrivacyEngineHealth } from '../types/models';
import { ModelManager } from './modelManager';

export const ModelStatusCard: React.FC = () => {
  const [manager] = useState<ModelManager>(() => {
    const instance = ModelManager.getInstance();
    // Enable dev mode for local testing (disable this in production)
    instance.setDevMode(true);
    return instance;
  });
  const [health, setHealth] = useState<PrivacyEngineHealth>(() => manager.getPrivacyEngineHealth());
  const [loading, setLoading] = useState<boolean>(false);
  const [activeDownloadCap, setActiveDownloadCap] = useState<ModelCapability | null>(null);

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
    // On first mount, bootstrap synthetic models for offline development
    (async () => {
      try {
        await manager.bootstrapSyntheticModels();
        console.info('[NAZAR] Models bootstrapped, detecting installed...');
      } catch (err) {
        console.warn('[NAZAR] Failed to bootstrap synthetic models:', err);
      }
      await refreshStatus();
    })();
  }, []);

  const handleDownload = async (cap: ModelCapability) => {
    setActiveDownloadCap(cap);
    try {
      await manager.downloadModel(cap);
      const updated = manager.getPrivacyEngineHealth();
      setHealth(updated);
    } catch (err: any) {
      const updated = manager.getPrivacyEngineHealth();
      setHealth(updated);
    } finally {
      setActiveDownloadCap(null);
    }
  };

  const handleInstallAll = async () => {
    setLoading(true);
    try {
      await manager.installAllMissingModels();
      const updated = manager.getPrivacyEngineHealth();
      setHealth(updated);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return '#10b981'; // Emerald
      case 'downloading':
        return '#0284c7'; // Sky
      case 'corrupted':
        return '#ef4444'; // Red
      case 'interrupted':
        return '#f59e0b'; // Amber
      default:
        return '#94a3b8'; // Slate
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return '✓ Ready';
      case 'downloading':
        return '⏳ Downloading...';
      case 'corrupted':
        return '✗ Corrupted (Integrity Error)';
      case 'interrupted':
        return '⚠ Interrupted';
      case 'missing':
        return '○ Not Downloaded';
      default:
        return 'Unavailable';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(1)} MB`;
    if (bytes >= 1000) return `${(bytes / 1000).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  return (
    <div
      id="nazar-model-status-card"
      style={{
        backgroundColor: 'var(--card-bg, #0f172a)',
        border: '1px solid var(--border-color, #1e293b)',
        borderRadius: '12px',
        padding: '16px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: '#f8fafc' }}>
            NAZAR Privacy Engine
          </h2>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Local Machine Intelligence & Pattern Firewalls
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor:
                health.overallStatus === 'ready'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : health.overallStatus === 'degraded'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              color:
                health.overallStatus === 'ready'
                  ? '#34d399'
                  : health.overallStatus === 'degraded'
                  ? '#fbbf24'
                  : '#f87171',
              border: `1px solid ${
                health.overallStatus === 'ready'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : health.overallStatus === 'degraded'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)'
              }`,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor:
                  health.overallStatus === 'ready'
                    ? '#10b981'
                    : health.overallStatus === 'degraded'
                    ? '#f59e0b'
                    : '#ef4444',
              }}
            />
            Status: {health.overallStatus === 'ready' ? 'Ready' : health.overallStatus === 'degraded' ? 'Degraded' : 'Blocked'}
          </span>
        </div>
      </div>

      {/* Required Checklist: ✓ OCR, ✓ Face Detection, ✓ PII Detection */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '8px',
          marginBottom: '16px',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid rgba(51, 65, 85, 0.5)',
        }}
      >
        {(['ocr', 'face_detection', 'pii_detection'] as ModelCapability[]).map((cap) => {
          const item: ModelCapabilityStatus = health.capabilities[cap];
          const isReady = item?.status === 'ready' && item.verified;
          const label =
            cap === 'ocr'
              ? 'OCR'
              : cap === 'face_detection'
              ? 'Face Detection'
              : 'PII Detection';

          return (
            <div
              key={cap}
              id={`model-status-item-${cap}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                padding: '4px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    color: isReady ? '#10b981' : item?.status === 'corrupted' ? '#ef4444' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {isReady ? '✓' : item?.status === 'corrupted' ? '✗' : '○'}
                </span>
                <span style={{ fontWeight: 600, color: isReady ? '#f8fafc' : '#cbd5e1' }}>
                  {label}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  ({formatBytes(item.sizeBytes)} • v{item.version})
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: getStatusColor(item.status),
                  }}
                >
                  {getStatusLabel(item.status)}
                </span>

                {!isReady && (
                  <button
                    onClick={() => handleDownload(cap)}
                    disabled={activeDownloadCap === cap || loading}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {item.status === 'corrupted' ? 'Re-verify' : 'Download'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fail-Closed Privacy Warning if any model unavailable */}
      {!health.allVerified && (
        <div
          id="fail-closed-alert"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '14px',
            fontSize: '11px',
            color: '#fca5a5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
            <span>🔒 FAIL-CLOSED PRIVACY ACTIVE</span>
          </div>
          <div>
            Missing capabilities: <strong>{health.missingCapabilities.join(', ')}</strong>.
            NAZAR will block outgoing AI requests for workflows requiring these features to prevent accidental exposure of raw private data.
          </div>
        </div>
      )}

      {/* Offline Status Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#94a3b8',
          borderTop: '1px solid rgba(51, 65, 85, 0.5)',
          paddingTop: '10px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{health.isOfflineReady ? '🛡️' : '🌐'}</span>
          <span>
            {health.isOfflineReady
              ? 'Offline Ready (100% On-Device, Zero Egress)'
              : 'Requires local assets for offline operation'}
          </span>
        </span>

        {!health.allVerified && (
          <button
            id="btn-install-all-models"
            onClick={handleInstallAll}
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #059669, #0d9488)',
              border: 'none',
              color: '#fff',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Install All Local Models'}
          </button>
        )}
      </div>
    </div>
  );
};
