// Service worker for Scholar Lens for arXiv
// Handles install events; API calls are made directly from the content script.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('Scholar Lens for arXiv installed.');
  }
});
