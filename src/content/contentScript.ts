/**
 * NAZAR Content Script:
 * Injected into web pages to extract DOM structure and interact with page content safely.
 * Operates strictly locally within the active page boundary.
 */

import { extractDomContext } from './domExtractor';
import {
  isValidNazarMessage,
  MessageResponse,
  NazarMessage,
} from '../types/messages';

console.info('[NAZAR] Content script initialized on page.');

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // Fail closed: reject invalid message formats immediately
    if (!isValidNazarMessage(message)) {
      sendResponse({
        success: false,
        requestId: 'unknown',
        error: {
          code: 'INVALID_MESSAGE_FORMAT',
          message: 'The received message failed schema validation.',
        },
      });
      return false;
    }

    const msg = message as NazarMessage;

    switch (msg.type) {
      case 'PING': {
        sendResponse({
          success: true,
          requestId: msg.id,
          data: {
            pong: true,
            url: window.location.href,
            timestamp: Date.now(),
          },
        });
        return false;
      }

      case 'EXTRACT_DOM': {
        try {
          const domContext = extractDomContext(document);
          sendResponse({
            success: true,
            requestId: msg.id,
            data: domContext,
          });
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown DOM extraction error';
          sendResponse({
            success: false,
            requestId: msg.id,
            error: {
              code: 'DOM_EXTRACTION_FAILED',
              message: errorMessage,
            },
          });
        }
        return false;
      }

      default: {
        sendResponse({
          success: false,
          requestId: msg.id,
          error: {
            code: 'UNSUPPORTED_CONTENT_ACTION',
            message: `Message type "${msg.type}" is not supported by content script.`,
          },
        });
        return false;
      }
    }
  }
);
