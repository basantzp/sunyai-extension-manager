# Privacy Policy for sunyai bookmark organizer

**Effective Date:** September 16, 2026

## 1. Overview
sunyai bookmark organizer ("the Extension") is committed to protecting user privacy. The extension functions primarily as a 100% client-side, offline tool designed to organize browser bookmarks into clean, structured folders and subfolders.

## 2. Information Collection and Use
- **No Personal Data Collection:** The Extension does NOT collect, store, transmit, track, or sell any personal data, browsing history, user credentials, or IP addresses.
- **Bookmarks Processing:** Bookmark titles, URLs, and folder structures are processed exclusively within the local browser runtime memory (`chrome.bookmarks` API) to determine their genre and appropriate destination folder.
- **Zero Third-Party Tracking:** No analytics libraries, tracking pixels, or advertising SDKs are included.

## 3. Optional AI Features
- By default, the Extension runs entirely offline using local heuristic classifiers with zero network calls.
- If the user explicitly opts in by providing their own OpenRouter API key in the settings panel, bookmark titles and URLs may be transmitted directly to the chosen OpenRouter endpoint solely to receive category suggestions. No data is stored or logged by this extension.

## 4. Permissions Disclosure
- `bookmarks`: Required to detect newly created bookmarks and organize them into folders.
- `storage`: Used solely to save local extension preferences (e.g. notification toggles).
- `activeTab` & `scripting`: Used only to display a temporary, non-intrusive in-page confirmation pill ("Auto-synced to...") on the active tab.
- `notifications`: Used optionally to display desktop notifications upon organization.

## 5. Security
The Extension operates strictly under Google Chrome's Manifest V3 security standards. It does not execute remote scripts, use `eval()`, or modify webpage content outside of the temporary visual confirmation pill.

## 6. Contact
For any questions or feedback regarding this policy, please open an issue in the project repository.
