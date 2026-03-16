// Gemini Chat Folders - background service worker
// Uses launchWebAuthFlow (works in Brave, Edge, and any Chromium browser)

const CLIENT_ID = '1053097274875-sm6vkuiemk98nq3akuhqleiioi0imm6o.apps.googleusercontent.com';
const SCOPES    = 'https://www.googleapis.com/auth/drive.appdata';

function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['gcf_drive_token', 'gcf_drive_token_expiry'], result => {
      const valid = result.gcf_drive_token &&
                    result.gcf_drive_token_expiry > Date.now() + 60_000;
      resolve(valid ? result.gcf_drive_token : null);
    });
  });
}

function launchAuthFlow() {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = 'https://accounts.google.com/o/oauth2/auth?' + new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'token',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
  });

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, responseUrl => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!responseUrl) {
        reject(new Error('No token'));
        return;
      }
      const params    = new URLSearchParams(new URL(responseUrl).hash.slice(1));
      const token     = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600');
      if (token) {
        chrome.storage.local.set({
          gcf_drive_token:        token,
          gcf_drive_token_expiry: Date.now() + expiresIn * 1000,
        });
        resolve(token);
      } else {
        reject(new Error('No access_token in response'));
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getAuthToken') {
    (async () => {
      try {
        const stored = await getStoredToken();
        if (stored) {
          sendResponse({ token: stored });
          return;
        }
        if (!msg.interactive) {
          sendResponse({ error: 'No token' });
          return;
        }
        const token = await launchAuthFlow();
        sendResponse({ token });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true; // keep message channel open for async response
  }
});

// ─── AUTO SYNC ────────────────────────────────────────────────────────────────
// Every 5 minutes, write a timestamp to storage. Content scripts on Gemini tabs
// listen for this change and trigger a pull+merge automatically.

const SYNC_INTERVAL_MINUTES = 5;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('gcf-auto-sync', { periodInMinutes: SYNC_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('gcf-auto-sync', { periodInMinutes: SYNC_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'gcf-auto-sync') {
    chrome.storage.local.set({ gcf_sync_requested: Date.now() });
  }
});
