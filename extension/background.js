// JsPapa background service worker.
// Adds a context-menu entry to open the current HWP/HWPX URL in the viewer
// and handles runtime messages from the popup/viewer.

const VIEWER_URL = chrome.runtime.getURL("viewer.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "jspapa-open-link",
    title: "JsPapa 뷰어로 열기",
    contexts: ["link"],
    targetUrlPatterns: ["*://*/*.hwp", "*://*/*.hwpx"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "jspapa-open-link") return;
  if (!info.linkUrl) return;
  const target = `${VIEWER_URL}?url=${encodeURIComponent(info.linkUrl)}`;
  chrome.tabs.create({ url: target });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "jspapa/open-url" && msg.url) {
    const target = `${VIEWER_URL}?url=${encodeURIComponent(msg.url)}`;
    chrome.tabs.create({ url: target });
    sendResponse({ ok: true });
  }
  return false;
});
