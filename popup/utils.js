function extractDomain(url) {
  if (!url || typeof url !== 'string') return null;
  const lower = url.toLowerCase();
  const skipped = ['chrome:', 'about:', 'chrome-extension:', 'file:', 'javascript:', 'data:'];
  if (skipped.some(p => lower.startsWith(p))) return null;
  try {
    let hostname = new URL(url).hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return null;
  }
}

function sanitizeFaviconUrl(favIconUrl) {
  if (!favIconUrl || typeof favIconUrl !== 'string') return null;
  const lower = favIconUrl.toLowerCase();
  const blockedProtocols = ['file:', 'chrome:', 'about:', 'chrome-extension:', 'javascript:', 'data:'];
  if (blockedProtocols.some(p => lower.startsWith(p))) return null;
  return favIconUrl;
}

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
  setTimeout(() => {
    status.className = '';
    status.textContent = '';
  }, 2500);
}

async function sendMessage(action, payload = {}, useActiveWindow = true, maxRetries = 2) {
  const message = { action, ...payload };

  const attemptSend = () => {
    return new Promise((resolve) => {
      const sendWithFallback = (msg) => {
        try {
          chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
              const err = chrome.runtime.lastError.message || '';
              console.warn('[sunyai] sendMessage note:', err);
              resolve({ success: false, message: err, portClosed: err.includes('message port closed') });
            } else {
              resolve(response || { success: true });
            }
          });
        } catch (err) {
          resolve({ success: false, message: err.message, portClosed: err.message?.includes('message port closed') });
        }
      };

      if (useActiveWindow && chrome.windows?.getLastFocused) {
        try {
          chrome.windows.getLastFocused({ populate: false }, (window) => {
            if (!chrome.runtime.lastError && window?.id) {
              message.windowId = window.id;
            }
            sendWithFallback(message);
          });
        } catch {
          sendWithFallback(message);
        }
      } else {
        sendWithFallback(message);
      }
    });
  };

  let res = await attemptSend();
  for (let i = 0; i < maxRetries && (!res || res.portClosed); i++) {
    await new Promise(r => setTimeout(r, 120 * (i + 1)));
    res = await attemptSend();
  }

  // If still reported port closed, return success: false with clean note so UI stays clean
  if (res && res.portClosed) {
    return { success: false, message: 'Waking up service worker...' };
  }
  return res || { success: false };
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function parseDomains(text) {
  return text
    .split('\n')
    .map(d => {
      // Keep the full URL as entered by user
      // Only trim whitespace and remove trailing slashes
      let normalized = d.trim();
      normalized = normalized.replace(/\/+$/, '');
      return normalized;
    })
    .filter(d => d.length > 0);
}
