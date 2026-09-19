import { ExtensionMessage } from '../shared/messages';

console.log('[Visual Privacy Extension] Background Service Worker initialized.');

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      console.log('[ServiceWorker] Received message:', message.type);

      switch (message.type) {
        case 'PING':
          sendResponse({ type: 'PONG', timestamp: Date.now() });
          break;
        case 'GET_STATUS':
          sendResponse({
            type: 'STATUS_RESPONSE',
            version: '0.1.0',
            isReady: true
          });
          break;
        default:
          break;
      }

      return true;
    }
  );
}
