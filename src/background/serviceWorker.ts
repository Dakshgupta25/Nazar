/**
 * NAZAR Background Service Worker:
 * Acts as the coordination hub between Extension UI, Content Script, and Browser APIs.
 * Enforces security boundaries, tab permissions, and in-memory capture lifecycles.
 */

import {
  createMessageId,
  isValidNazarMessage,
  MessageResponse,
  NazarMessage,
  CapturedContextPayload,
  ExtensionStatusPayload,
  RunPrivacyScanMessage,
} from '../types/messages';
import { ExtractedDomContext } from '../types/dom';
import { runPrivacyScan } from '../privacy/privacyEngine';
import { PrivacyScanResult } from '../types/privacy';

console.info('[NAZAR] Background service worker initialized.');

/**
 * Gets the currently active tab in the current window.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

/**
 * Validates whether a tab is permissible to capture.
 * Rejects restricted chrome:// and internal schemes to prevent privilege escalation.
 */
function isTabPermissible(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) return false;
  const restrictedProtocols = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'devtools:',
    'view-source:',
  ];
  return !restrictedProtocols.some((proto) => tab.url?.startsWith(proto));
}

/**
 * Safely requests DOM extraction from the content script in the given tab.
 * Injects content script dynamically if not yet active (e.g. opened before extension installed).
 */
async function requestDomExtraction(tabId: number): Promise<ExtractedDomContext> {
  const message: NazarMessage = {
    id: createMessageId(),
    type: 'EXTRACT_DOM',
    timestamp: Date.now(),
  };

  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<ExtractedDomContext>;
    if (response && response.success && response.data) {
      return response.data;
    }
    throw new Error(response?.error?.message || 'Empty DOM response from tab');
  } catch (err: unknown) {
    // If sending fails, try injecting contentScript and retry once
    console.warn('[NAZAR] Content script not reachable, injecting dynamically...', err);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js'],
    });

    // Small delay to allow listener registration
    await new Promise((resolve) => setTimeout(resolve, 100));

    const retryResponse = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<ExtractedDomContext>;
    if (retryResponse && retryResponse.success && retryResponse.data) {
      return retryResponse.data;
    }
    throw new Error(
      retryResponse?.error?.message || 'Failed to communicate with tab content script after injection'
    );
  }
}

/**
 * Captures screenshot of visible area in the active window.
 * Returns base64 data URL kept strictly in memory.
 */
async function captureVisibleTab(windowId?: number): Promise<string> {
  return await chrome.tabs.captureVisibleTab(windowId ?? chrome.windows.WINDOW_ID_CURRENT, {
    format: 'png',
  });
}

/**
 * Primary message listener for background worker.
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.info('[NAZAR] Message received:', { type: (message as any)?.type, id: (message as any)?.id });
    
    // Fail closed: reject invalid message schemas
    if (!isValidNazarMessage(message)) {
      console.warn('[NAZAR] Invalid message schema received');
      sendResponse({
        success: false,
        requestId: 'unknown',
        error: {
          code: 'INVALID_MESSAGE_SCHEMA',
          message: 'Received invalid message format in service worker.',
        },
      });
      return false;
    }

    const msg = message as NazarMessage;

    // Wrap sendResponse to ensure it's only called once and logs errors
    let responseSent = false;
    const wrappedSendResponse = (response: MessageResponse) => {
      if (responseSent) {
        console.warn('[NAZAR] Attempted to send response twice for message:', msg.id);
        return;
      }
      responseSent = true;
      console.info('[NAZAR] Sending response for message:', msg.id);
      try {
        sendResponse(response);
      } catch (err) {
        console.error('[NAZAR] Failed to send response:', err);
      }
    };

    // Handle asynchronous tasks with explicit error handling
    (async () => {
      try {
        console.info('[NAZAR] Processing message type:', msg.type);
        
        switch (msg.type) {
          case 'GET_STATUS': {
            console.info('[NAZAR] Handling GET_STATUS');
            const tab = await getActiveTab();
            const isAccessible = tab ? isTabPermissible(tab) : false;
            const status: ExtensionStatusPayload = {
              ready: true,
              version: '0.1.0',
              activeTabAccessible: isAccessible,
              tabId: tab?.id,
              url: isAccessible && tab?.url ? tab.url : undefined,
            };
            wrappedSendResponse({
              success: true,
              requestId: msg.id,
              data: status,
            });
            break;
          }

          case 'CAPTURE_VISIBLE_TAB': {
            console.info('[NAZAR] Handling CAPTURE_VISIBLE_TAB');
            try {
              const dataUrl = await captureVisibleTab();
              wrappedSendResponse({
                success: true,
                requestId: msg.id,
                data: { screenshotDataUrl: dataUrl },
              });
            } catch (err: unknown) {
              wrappedSendResponse({
                success: false,
                requestId: msg.id,
                error: {
                  code: 'CAPTURE_FAILED',
                  message: err instanceof Error ? err.message : 'Screenshot capture failed',
                },
              });
            }
            break;
          }

          case 'CAPTURE_CONTEXT': {
            console.info('[NAZAR] Handling CAPTURE_CONTEXT');
            try {
              const tab = await getActiveTab();
              if (!tab || !tab.id) {
                throw new Error('No active browser tab found.');
              }
              if (!isTabPermissible(tab)) {
                throw new Error(
                  `Tab with URL "${tab.url || 'unknown'}" is restricted and cannot be captured for privacy & security reasons.`
                );
              }

              // Parallel capture of screenshot & DOM
              const [screenshotDataUrl, domContext] = await Promise.all([
                captureVisibleTab(tab.windowId),
                requestDomExtraction(tab.id),
              ]);

              const payload: CapturedContextPayload = {
                tabId: tab.id,
                url: tab.url || '',
                title: tab.title || '',
                timestamp: Date.now(),
                screenshotDataUrl,
                dom: domContext,
              };

              wrappedSendResponse({
                success: true,
                requestId: msg.id,
                data: payload,
              });
            } catch (err: unknown) {
              console.error('[NAZAR] Context capture failed:', err instanceof Error ? err.message : String(err));
              wrappedSendResponse({
                success: false,
                requestId: msg.id,
                error: {
                  code: 'CONTEXT_CAPTURE_FAILED',
                  message: err instanceof Error ? err.message : 'Context capture failed',
                },
              });
            }
            break;
          }

          case 'RUN_PRIVACY_SCAN': {
            console.info('[NAZAR] Handling RUN_PRIVACY_SCAN');
            try {
              const scanMsg = msg as RunPrivacyScanMessage;
              if (!scanMsg.context) {
                throw new Error('No captured context provided for privacy scan.');
              }
              const scanResult: PrivacyScanResult = await runPrivacyScan(scanMsg.context);
              wrappedSendResponse({
                success: true,
                requestId: msg.id,
                data: scanResult,
              });
            } catch (err: unknown) {
              console.error('[NAZAR] Privacy scan failed:', err instanceof Error ? err.message : String(err));
              wrappedSendResponse({
                success: false,
                requestId: msg.id,
                error: {
                  code: 'PRIVACY_SCAN_FAILED',
                  message: err instanceof Error ? err.message : 'Privacy scan failed',
                },
              });
            }
            break;
          }

          default: {
            console.warn('[NAZAR] Unknown message type:', msg.type);
            wrappedSendResponse({
              success: false,
              requestId: msg.id,
              error: {
                code: 'UNHANDLED_BACKGROUND_MESSAGE',
                message: `Unknown or unhandled message type "${msg.type}".`,
              },
            });
            break;
          }
        }
      } catch (err: unknown) {
        console.error('[NAZAR] Unexpected error in message handler:', err);
        wrappedSendResponse({
          success: false,
          requestId: msg.id,
          error: {
            code: 'UNEXPECTED_WORKER_ERROR',
            message: err instanceof Error ? err.message : 'Unexpected background error',
          },
        });
      }
    })();

    return true; // Indicates asynchronous response
  }
);
