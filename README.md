# ⚡ sunyai extension manager (Unified Workspace & Bookmark Engine)

**Version 2.0.0** — An all-in-one browser power suite merging **TabFlow** (intelligent domain tab grouping & vim-style navigation) and **Sunyai Autonomous Bookmark Organizer** (sub-millisecond local taxonomy & Nepali intelligence). Built for maximum battery efficiency, 0% background idle CPU, and deep workflow speed.

---

## 🌟 Key Features

### 🗂️ 1. Smart TabFlow Workspace Manager
- **Domain-Based Auto Grouping**: Automatically organize tabs into color-coded, labeled browser tab groups by domain rules or on-demand.
- **🇳🇵 Built-In Nepal & Global Domain Ecosystem**:
  - **Nepal News**: *Setopati*, *Onlinekhabar*, *eKantipur*, *Ratopati*, *Annapurna Post*, *Hamro Patro*, *Nagarik News*.
  - **NEPSE & Finance**: *MeroShare*, *NepalStock*, *Sharesansar*, *NepseAlpha*, *Merolagani*.
  - **Nepal Shopping**: *Daraz*, *Sastodeal*, *Hamrobazar*, *Gyapu*.
  - **AI & Dev**: *GitHub*, *GitLab*, *OpenAI*, *Anthropic*, *HuggingFace*, *Perplexity*, *Vercel*, *StackOverflow*, *AWS*, *Google Cloud*.
  - **Social, Media & Productivity**: *Twitter / X*, *YouTube*, *Reddit*, *LinkedIn*, *Gmail*, *Notion*, *Figma*.
- **Duplicate Tab Prevention**: Automatically focuses an existing tab rather than opening duplicate URLs.
- **Side Panel & Popup Dual Mode**: Seamlessly toggle between Chrome/Brave side panel (`sidepanel`) and quick action popup (`popup`).
- **Keyboard Navigation (Vim Mode)**:
  - `j` / `k` or `↓` / `↑`: Navigate tabs and groups.
  - `l` or `Enter`: Activate / switch to tab.
  - `h` or `Esc`: Exit search or focus mode.
  - `/` or `i`: Instant tab search.
  - `1`, `2`, `3`: Quick jump between **Tabs**, **Bookmarks**, and **Settings**.
- **Display Modes & Auto-Collapse**: Custom group title formatting (Icon, Count, Name) and auto-collapse for inactive groups.

---

### ⚡ 2. Autonomous Bookmark Organizer
- **Sub-Millisecond Speed (<1ms)**: Local genre and taxonomy matching executes in ~0.007 ms with zero remote API dependencies.
- **🇳🇵 Deep Nepali Intelligence**:
  - Native Devanagari script detection (`[\u0900-\u097F]`).
  - 35+ Nepali musical artists recognized (Sujan Chapagain, Bartika Rai, Yama Buddha, 1974 AD, Cobweb, Albatross, Bipul Chettri, Sushant KC, Prakash Saput, etc.).
  - Automatic portal categorization for Nepal universities (*TU*, *KU*, *PU*, *Moodle*), government, and e-commerce.
- **📺 YouTube Smart 17-Subfolder Matrix**:
  - Distinguishes **Nepali Music**, **Bollywood & Hindi**, and **English Music**.
  - Separate splits for **Nepali Vlogs**, **Documentaries**, **Cinema**, **NEPSE & Share Market**, **Courses & Tutorials**, **Gadget Reviews**, and **Podcasts**.
- **15 Top-Level Categories**: Preserves a clutter-free bookmark bar:
  - `🤖 AI & Machine Learning`, `💻 Developer Tools`, `📈 Finance & Investing`, `🎓 Education`, `💼 Career & Jobs`, `🛒 Shopping`, `🍜 Food & Recipes`, `💪 Health & Fitness`, `✈️ Travel & Places`, `🎨 Design & Creative`, `🎬 Entertainment`, `Social Media`, `Nepal News`, `World News`, `🛠️ Web Tools`.
- **In-Page Floating Toast Pill**: Sleek, non-intrusive HUD pill injected on save: `⚡ Saved to Category › Subfolder`.
- **Zero Battery Drain**: Event-driven architecture wakes only on bookmark modifications and returns immediately to 0% CPU sleep.

---

### 🦀 3. Standalone Compiled Rust Engine (`brave-bookmark-engine`)
A compiled native binary located in `native-engine/` that executes sub-millisecond full bookmark sweeps and inotify file monitoring outside the browser runtime:

```bash
# 1. Full sweep across all browser bookmarks
./brave-bookmark-engine organize

# 2. Category telemetry and distribution stats
./brave-bookmark-engine stats

# 3. Background inotify watcher (0% CPU, wakes only on change)
./brave-bookmark-engine watch
```

---

## 🚀 Installation (Brave / Google Chrome / Chromium)

1. Open Brave or Chrome and go to `brave://extensions` (or `chrome://extensions`).
2. Enable **"Developer mode"** (toggle in the top-right corner).
3. Click **"Load unpacked"** in the top-left corner.
4. Select the directory:
   ```
   /home/basant/.config/BraveSoftware/Brave-Browser/extensions/bookmark-organizer
   ```
5. Pin the extension to your toolbar or open the side panel for instant tab and bookmark management!

---

## ⌨️ Shortcuts Reference

| Key | Action |
| --- | --- |
| `1` | Jump to **Tabs** view |
| `2` | Jump to **Bookmarks** view |
| `3` | Jump to **Settings** view |
| `j` / `↓` | Next tab / group |
| `k` / `↑` | Previous tab / group |
| `l` / `Enter` | Focus / activate selected tab |
| `/` or `i` | Search open tabs |
| `Esc` | Clear search / close modal / exit focus mode |
| `Ctrl+D` | Save bookmark (instantly auto-categorized) |
