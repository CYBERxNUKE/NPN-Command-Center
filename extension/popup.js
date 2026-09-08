const APP_URL = 'https://cyberxnuke.github.io/NPN-Command-Center/';
const status = document.getElementById('status');
document.getElementById('save').onclick = async function () {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) {
    status.textContent = 'Could not read the current page.';
    return;
  }
  const target = new URL(APP_URL);
  target.searchParams.set('submit_url', tab.url);
  target.searchParams.set('submit_title', tab.title || '');
  await chrome.tabs.create({ url: target.toString() });
  status.textContent = 'Opened the review intake page.';
};
