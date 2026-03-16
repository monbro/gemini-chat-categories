// Gemini Chat Folders - background service worker
// Uses implicit flow with silent refresh so the user rarely needs to interact.
// A popup is only shown on first connect or if fully logged out of Google.

const CLIENT_ID = '1053097274875-sm6vkuiemk98nq3akuhqleiioi0imm6o.apps.googleusercontent.com';
const SCOPES    = 'https://www.googleapis.com/auth/drive.appdata';

// ─── TOKEN STORAGE ────────────────────────────────────────────────────────────

function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['gcf_drive_token', 'gcf_drive_token_expiry'], result => {
      const valid = result.gcf_drive_token &&
                    result.gcf_drive_token_expiry > Date.now() + 60_000;
      resolve(valid ? result.gcf_drive_token : null);
    });
  });
}

function saveToken(token, expiresIn) {
  return chrome.storage.local.set({
    gcf_drive_token:        token,
    gcf_drive_token_expiry: Date.now() + (expiresIn || 3600) * 1000,
  });
}

// ─── AUTH FLOW ────────────────────────────────────────────────────────────────

function runAuthFlow(interactive) {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = 'https://accounts.google.com/o/oauth2/auth?' + new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'token',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
  });

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, responseUrl => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'No response URL'));
        return;
      }
      const params    = new URLSearchParams(new URL(responseUrl).hash.slice(1));
      const token     = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600');
      if (token) {
        saveToken(token, expiresIn);
        resolve(token);
      } else {
        reject(new Error('No access_token in response'));
      }
    });
  });
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getAuthToken') {
    (async () => {
      try {
        // 1. Stored token still valid
        const stored = await getStoredToken();
        if (stored) {
          sendResponse({ token: stored });
          return;
        }

        // 2. Silent refresh — works as long as the browser has an active Google session
        try {
          const token = await runAuthFlow(false);
          sendResponse({ token });
          return;
        } catch (_) {
          // Silent attempt failed (e.g. fully logged out) — fall through
        }

        // 3. Interactive login required
        if (!msg.interactive) {
          sendResponse({ error: 'No token' });
          return;
        }

        const token = await runAuthFlow(true);
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
