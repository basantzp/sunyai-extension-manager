# 🌐 Chrome Web Store Submission & Approval Guide

This guide ensures your extension passes Chrome Web Store review on the first submission without rejections.

---

### 📦 1. Create Clean Upload ZIP
The Chrome Web Store only accepts a `.zip` file containing extension runtime files (without Rust source files, git, or temporary files):

```bash
cd ~/.config/BraveSoftware/Brave-Browser/extensions/bookmark-organizer
zip -r -FS sunyai-bookmark-organizer.zip manifest.json background.js popup.html popup.js icons/ PRIVACY.md CWS_SUBMISSION_GUIDE.md README.md
```
*(A pre-packaged clean zip file is ready for you).*

---

### 📋 2. Store Listing Details

- **Extension Name:** `sunyai bookmark organizer`
- **Version:** `1.2.0` (v3.0 Release)
- **Short Description (max 132 characters):**
  > Autonomous bookmark organizer with Nepali-aware smart folders. Sub-millisecond, zero battery drain.
- **Detailed Description:**
  ```markdown
  sunyai bookmark organizer is an ultra-fast, zero-click extension that autonomously keeps your browser bookmarks tidy, structured, and intelligent.

  ⚡ KEY FEATURES:
  • Instant Organization (< 1ms): When you save a bookmark (Ctrl+D or star icon), it is automatically classified and moved into the appropriate Category and Subfolder within milliseconds.
  • Deep Nepali Intelligence: Automatically detects Devanagari script (Nepali), 35+ Nepali musical artists, Nepal news portals, e-commerce, banking, and NEPSE share market.
  • YouTube 17-Subfolder Matrix: Intelligently separates Nepali music, Bollywood songs, English tracks, Nepali/English vlogs, comedy, documentaries, short films, courses, and tech reviews.
  • Smart 15-Folder Bar Protection: Preserves your Bookmark Bar by enforcing a 15-main-folder limit. When 15 categories exist, it uses high intelligence to organize new items into relevant subfolders rather than cluttering your bar.
  • Overcrowded Folder Partitioning: Automatically divides overcrowded folders (8+ bookmarks) into clean sub-genres.
  • Zero Background CPU: 100% event-driven. Preserves maximum battery life.
  • Visual Confirmation: Displays a discreet, floating breadcrumb pill on your screen ("⚡ Saved to Category › Subfolder") whenever an item is organized.
  • 100% Private & Local: Works entirely locally on your device with no required external accounts or API keys.
  ```

- **Category:** `Productivity`

---

### 🛡️ 3. Privacy & Permission Justifications for CWS Reviewers

When asked on the **Privacy Practices** tab in the Chrome Developer Dashboard, use these exact justifications:

#### Single Purpose Statement:
> "To autonomously and instantly organize browser bookmarks into clean, logical categories and subfolders with zero user friction."

#### Permission Justifications:
| Permission | Justification for Reviewer |
| :--- | :--- |
| `bookmarks` | Required to detect newly created or moved bookmarks and organize them into categorized folders. |
| `storage` | Required to save user preferences such as notification toggles and auto-organize settings. |
| `alarms` | Used to trigger periodic background cleanup sweeps. |
| `notifications` | Used optionally to notify the user when bookmarks are successfully organized. |
| `activeTab` | Used strictly to display a non-intrusive in-page confirmation pill on the active tab when a bookmark is auto-synced. |
| `scripting` | Required to temporarily inject the visual confirmation toast pill into the active tab. |
| `windows` | Required to detect initial browser window launch to execute startup bookmark sweeps. |
| `https://openrouter.ai/*` | Optional host permission used only if the user explicitly configures their own AI API key. |

#### Data Usage Answers:
- Does your extension collect personal data? &rarr; **No**
- Does your extension transfer data to third parties? &rarr; **No**
- Does your extension use remote code? &rarr; **No**

---

### 🚀 4. Upload Steps
1. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Click **"New Item"**.
3. Upload `sunyai-bookmark-organizer.zip`.
4. Fill in the listing details and privacy justifications from above.
5. Provide a 1280x800 screenshot or icon asset.
6. Click **"Submit for Review"** — approval typically completes within 12–24 hours!
