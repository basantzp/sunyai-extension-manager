function initBookmarksView() {
  const organizeBtn           = document.getElementById("organizeBtn");
  const btnText               = document.getElementById("btnText");
  const btnIcon               = document.getElementById("btnIcon");
  const resultMsg             = document.getElementById("resultMsg");
  const bookmarkSettingsToggle = document.getElementById("bookmarkSettingsToggle");
  const bookmarkSettingsPanel  = document.getElementById("bookmarkSettingsPanel");

  const apiKeyInput           = document.getElementById("apiKey");
  const modelSelect           = document.getElementById("model");
  const autoOrganizeCheck     = document.getElementById("autoOrganize");
  const notifyCheck           = document.getElementById("notify");

  const destCard              = document.getElementById("destCard");
  const destFolder            = document.getElementById("destFolder");
  const destSubfolder         = document.getElementById("destSubfolder");
  const destTime              = document.getElementById("destTime");
  const statCount             = document.getElementById("statCount");
  const statTime              = document.getElementById("statTime");

  if (!organizeBtn) return;

  // Load saved settings
  chrome.storage.local.get({
    apiKey: "",
    model: "z-ai/glm-5.2:free",
    autoOrganize: true,
    notify: true,
    lastOrganizedCount: 0,
    lastRun: null,
    lastFolder: "",
    lastSubfolder: ""
  }).then(settings => {
    if (apiKeyInput)       apiKeyInput.value         = settings.apiKey || "";
    if (modelSelect)       modelSelect.value         = settings.model  || "z-ai/glm-5.2:free";
    if (autoOrganizeCheck) autoOrganizeCheck.checked = settings.autoOrganize !== false;
    if (notifyCheck)       notifyCheck.checked       = settings.notify       !== false;

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

  // Toggle settings drawer
  if (bookmarkSettingsToggle && bookmarkSettingsPanel) {
    bookmarkSettingsToggle.addEventListener("click", () => {
      bookmarkSettingsPanel.classList.toggle("open");
      bookmarkSettingsToggle.textContent = bookmarkSettingsPanel.classList.contains("open") ? "✕" : "⚙️";
    });
  }

  // Auto-save setting changes
  const saveSettings = () => {
    chrome.storage.local.set({
      apiKey:       apiKeyInput?.value.trim() || "",
      model:        modelSelect?.value || "z-ai/glm-5.2:free",
      autoOrganize: autoOrganizeCheck ? autoOrganizeCheck.checked : true,
      notify:       notifyCheck ? notifyCheck.checked : true
    });
  };

  if (apiKeyInput)       apiKeyInput.addEventListener("change", saveSettings);
  if (modelSelect)       modelSelect.addEventListener("change", saveSettings);
  if (autoOrganizeCheck) autoOrganizeCheck.addEventListener("change", saveSettings);
  if (notifyCheck)       notifyCheck.addEventListener("change", saveSettings);

  function showDestination(folder, subfolder, time) {
    if (destFolder && destSubfolder && destCard) {
      destFolder.textContent    = folder;
      destSubfolder.textContent = subfolder;
      if (destTime) destTime.textContent = time || "";
      destCard.style.display    = "block";
    }
  }

  window.performBookmarkSync = (isAuto = false) => {
    if (organizeBtn.disabled) return;
    organizeBtn.disabled  = true;
    if (btnText) btnText.textContent = "Organizing…";
    if (btnIcon) btnIcon.textContent = "⏳";
    if (resultMsg) resultMsg.textContent = "";

    chrome.runtime.sendMessage({ action: "organize_now" }, (response) => {
      organizeBtn.disabled = false;
      if (btnText) btnText.textContent = "Organize Now";
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
          if (resultMsg) resultMsg.textContent = `✓ All bookmarks organized!`;
          if (statTime)  statTime.textContent  = now;
        }
      } else {
        if (resultMsg) {
          resultMsg.style.color = "#ef4444";
          resultMsg.textContent = `Notice: ${response?.error || "Up to date"}`;
        }
      }

      setTimeout(() => { if (resultMsg) resultMsg.textContent = ""; }, 4000);
    });
  };

  organizeBtn.addEventListener("click", () => window.performBookmarkSync(false));
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
