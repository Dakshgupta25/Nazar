// Background service worker for Nazar
console.log("Nazar Edge: Background service worker initialized.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "DOM_EXTRACTED") {
    console.log("Received DOM extraction data from content script:", request.payload);
    // Future: Route this to Layer B (Local Privacy Vision)
    sendResponse({ status: "success" });
  }
  return true;
});
