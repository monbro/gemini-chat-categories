# Gemini Chat Folders

A Chrome extension that adds folder organization to Google Gemini — with drag & drop, nested folders, color labels, search, and optional Google Drive sync.

---

## Features

- **Folder organization**: Create nested folders to organize your Gemini chats
- **Drag & drop**: Drag chats from Gemini's sidebar directly into folders
- **Color labels**: Choose from 10 colors to visually organize folders
- **Search**: Search across folders and chats, plus dedicated unassigned chat search
- **Cloud sync**: Sync folders across devices via Google Drive (optional)
- **Theme support**: Automatically matches Gemini's dark and light themes
- **Popup interface**: Clean, centered overlay that doesn't interfere with Gemini's UI

---

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the extension directory
5. Open [gemini.google.com](https://gemini.google.com) — a **Folders** icon button will appear next to the "Temporary Chat" button in the top sidebar

---

## Usage

1. Click the **Folders** icon button in Gemini's sidebar to open the panel
2. Click **+** to create your first folder
3. Drag chats from Gemini's sidebar into your folders
4. Click the **⋮** menu on any folder to rename, change color, or delete
5. Click **+** next to a folder to create a subfolder
6. Use the search bar to filter folders and chats
7. The panel closes automatically when you reload Gemini — just click the Folders button to open it again

---

## Google Drive Sync Setup

Sync requires a one-time Google Cloud Console setup to obtain an OAuth client ID.

### Step 1 – Get your extension ID

1. Go to `chrome://extensions`
2. Find **Gemini Chat Folders** and copy its **Extension ID** (a string like `abcdefghijklmnopqrstuvwxyzabcdef`)

### Step 2 – Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it (e.g. `Gemini Chat Folders`) and click **Create**

### Step 3 – Enable Google Drive API

1. In your new project, go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click it and press **Enable**

### Step 4 – Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. If prompted to configure a consent screen first:
   - Choose **External**, click **Create**
   - Fill in App name (e.g. `Gemini Chat Folders`) and your email
   - Skip the scopes step, save and continue through to the end
4. Back in **Create OAuth client ID**:
   - Application type: **Chrome App**
   - Name: anything (e.g. `Gemini Chat Folders`)
   - **Application ID**: paste your Extension ID from Step 1
   - Click **Create**
5. Copy the generated **Client ID** — it looks like `123456789-xxxx.apps.googleusercontent.com`

### Step 5 – Add the client ID to the extension

Open `manifest.json` and replace `YOUR_CLIENT_ID` on line 8:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/drive.appdata"]
}
```

Then **reload the extension** in `chrome://extensions`.

### Step 6 – Connect

1. Click the Folders button in Gemini to open the panel
2. Click the **cloud icon** in the panel header
3. A Google OAuth consent screen will appear — approve it
4. The icon will show a green checkmark — you're synced

---

## How sync works

- **On panel open**: Automatically pulls from Drive and merges (last-write-wins by timestamp)
- **On any change**: Pushes to Drive after a 2-second debounce
- **Merge strategy**: When conflicts occur, the most recently updated folder/chat wins
- **Deleted folders**: Tracked via tombstones to ensure deletions sync properly across devices

### Cloud icon states

- **Gray cloud**: Not connected (click to connect)
- **Blue spinner**: Syncing in progress
- **Green checkmark**: Successfully synced
- **Orange warning**: Error occurred (click to retry)

Data is stored in Google Drive's hidden **appDataFolder** — it does not appear in your Drive and is only accessible by this extension.

---

## File structure

```
gemini-chat-categories/
├── manifest.json   # MV3 manifest, permissions, OAuth config
├── background.js   # Service worker for OAuth token handling
├── content.js      # All extension logic (state, CRUD, render, sync)
├── styles.css      # All styles using --gcf-* CSS variables
├── README.md       # This file
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Data & privacy

- All folder and chat data is stored locally in `chrome.storage.local`
- If Drive sync is enabled, data is also stored in your own Google Drive `appDataFolder`
- **No data is sent to any third-party server** — only to your own Google Drive (if you enable sync)
- The `drive.appdata` scope grants access only to files created by this extension — **not your full Drive**
- Chat titles and URLs are stored, but chat content is never accessed

---

## Technical details

- **Architecture**: Single-file content script with overlay UI (no iframe)
- **State management**: Simple in-memory state object synced to chrome.storage
- **UI rendering**: Full re-render on state changes (simple and reliable)
- **Drag & drop**: Native HTML5 drag-and-drop with `dataTransfer`
- **Theme detection**: Probes Gemini's sidebar element background colors
- **Sync strategy**: 3-way merge with tombstone tracking for deletions

---

## License

MIT
