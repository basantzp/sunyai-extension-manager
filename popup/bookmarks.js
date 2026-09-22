function initBookmarksView() {
  const organizeBtn     = document.getElementById("organizeBtn");
  const bookmarkTabsBtn = document.getElementById("bookmarkTabsBtn");
  const btnText         = document.getElementById("btnText");
  const btnIcon         = document.getElementById("btnIcon");
  const resultMsg       = document.getElementById("resultMsg");

  const destCard        = document.getElementById("destCard");
  const destFolder      = document.getElementById("destFolder");
  const destSubfolder   = document.getElementById("destSubfolder");
  const destTime        = document.getElementById("destTime");
  const statCount       = document.getElementById("statCount");
  const statTime        = document.getElementById("statTime");

  function showDestination(folder, subfolder, time) {
    if (destFolder && destSubfolder && destCard) {
      destFolder.textContent    = folder;
      destSubfolder.textContent = subfolder;
      if (destTime) destTime.textContent = time || "";
      destCard.style.display    = "block";
    }
  }

  // Load telemetry stats
  chrome.storage.local.get({
    lastOrganizedCount: 0,
    lastRun: null,
    lastFolder: "",
    lastSubfolder: ""
  }).then(settings => {
    if (statCount && settings.lastOrganizedCount > 0) {
      statCount.textContent = settings.lastOrganizedCount;
    }
    if (statTime && settings.lastRun) {
      statTime.textContent = settings.lastRun;
    }
    if (settings.lastFolder && settings.lastSubfolder) {
      showDestination(settings.lastFolder, settings.lastSubfolder, settings.lastRun);
    }
  });

  // Organize loose bookmarks
  window.performBookmarkSync = (isAuto = false) => {
    if (!organizeBtn || organizeBtn.disabled) return;
    organizeBtn.disabled  = true;
    if (btnText) btnText.textContent = "Organizing…";
    if (btnIcon) btnIcon.textContent = "⏳";
    if (resultMsg) resultMsg.textContent = "";

    chrome.runtime.sendMessage({ action: "organize_now" }, (response) => {
      organizeBtn.disabled = false;
      if (btnText) btnText.textContent = "Organize Bookmarks";
      if (btnIcon) btnIcon.textContent = "⚡";

      if (response && response.success) {
        if (resultMsg) resultMsg.style.color = "var(--success)";
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (response.lastFolder && response.lastSubfolder) {
          showDestination(response.lastFolder, response.lastSubfolder, now);
          if (resultMsg) resultMsg.textContent = `✓ Saved to ${response.lastFolder} › ${response.lastSubfolder}`;
          if (statCount) statCount.textContent = response.count || 0;
          if (statTime)  statTime.textContent  = now;
        } else if (response.count > 0) {
          if (resultMsg) resultMsg.textContent = `✓ Organized ${response.count} bookmark${response.count > 1 ? 's' : ''}!`;
          if (statCount) statCount.textContent = response.count;
          if (statTime)  statTime.textContent  = now;
        } else {
          if (resultMsg && !isAuto) resultMsg.textContent = `✓ All bookmarks up to date!`;
          if (statTime)  statTime.textContent  = now;
        }
      } else {
        if (resultMsg && !isAuto) {
          resultMsg.style.color = "#ef4444";
          resultMsg.textContent = `Notice: ${response?.error || "Up to date"}`;
        }
      }

      if (resultMsg) {
        setTimeout(() => { if (resultMsg) resultMsg.textContent = ""; }, 4000);
      }
    });
  };

  if (organizeBtn) {
    organizeBtn.addEventListener("click", () => window.performBookmarkSync(false));
  }

  // Save all open tabs into bookmarks & organize
  if (bookmarkTabsBtn) {
    bookmarkTabsBtn.addEventListener("click", () => {
      if (bookmarkTabsBtn.disabled) return;
      bookmarkTabsBtn.disabled = true;
      const originalText = bookmarkTabsBtn.innerHTML;
      bookmarkTabsBtn.innerHTML = `<span>⏳</span><span>Saving &amp; Organizing Tabs…</span>`;
      if (resultMsg) resultMsg.textContent = "";

      chrome.runtime.sendMessage({ action: "bookmark_open_tabs" }, (res) => {
        bookmarkTabsBtn.disabled = false;
        bookmarkTabsBtn.innerHTML = originalText;

        if (res && res.success) {
          if (resultMsg) {
            resultMsg.style.color = "var(--success)";
            resultMsg.textContent = `✓ Saved ${res.savedCount || 0} tabs & organized ${res.count || 0} bookmarks!`;
          }
          if (res.lastFolder && res.lastSubfolder) {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            showDestination(res.lastFolder, res.lastSubfolder, now);
          }
          window.refreshBookmarkStatus();
        } else {
          if (resultMsg) {
            resultMsg.style.color = "#ef4444";
            resultMsg.textContent = `Notice: ${res?.error || "Tabs already saved"}`;
          }
        }
        if (resultMsg) {
          setTimeout(() => { if (resultMsg) resultMsg.textContent = ""; }, 4000);
        }
      });
    });
  }
}

window.refreshBookmarkStatus = function() {
  chrome.storage.local.get(["lastFolder", "lastSubfolder", "lastRun", "lastOrganizedCount"]).then(data => {
    const destCard      = document.getElementById("destCard");
    const destFolder    = document.getElementById("destFolder");
    const destSubfolder = document.getElementById("destSubfolder");
    const destTime      = document.getElementById("destTime");
    const statCount     = document.getElementById("statCount");
    const statTime      = document.getElementById("statTime");

    if (destCard && destFolder && destSubfolder && data.lastFolder && data.lastSubfolder) {
      destFolder.textContent    = data.lastFolder;
      destSubfolder.textContent = data.lastSubfolder;
      if (destTime) destTime.textContent = data.lastRun || "";
      destCard.style.display    = "block";
    }
    if (statCount && data.lastOrganizedCount) statCount.textContent = data.lastOrganizedCount;
    if (statTime && data.lastRun) statTime.textContent = data.lastRun;
  });
};
