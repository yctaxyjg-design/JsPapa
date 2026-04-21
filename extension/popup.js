const openViewerBtn = document.getElementById("open-viewer");
const fileInput = document.getElementById("file-input");

const viewerUrl = chrome.runtime.getURL("viewer.html");

openViewerBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: viewerUrl });
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Stash file in chrome.storage.session and open viewer
  await chrome.storage.session.set({
    pendingDoc: {
      name: file.name,
      size: file.size,
      data: Array.from(bytes),
    },
  });
  chrome.tabs.create({ url: viewerUrl + "?source=storage" });
});
