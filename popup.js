document.addEventListener("DOMContentLoaded", async () => {
  const organizeBtn    = document.getElementById("organizeBtn");
  const btnText        = document.getElementById("btnText");
  const btnIcon        = document.getElementById("btnIcon");
  const resultMsg      = document.getElementById("resultMsg");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel  = document.getElementById("settingsPanel");

  const apiKeyInput       = document.getElementById("apiKey");
  const modelSelect       = document.getElementById("model");
  const autoOrganizeCheck = document.getElementById("autoOrganize");
  const notifyCheck       = document.getElementById("notify");

  const destCard      = document.getElementById("destCard");
  const destFolder    = document.getElementById("destFolder");
  const destSubfolder = document.getElementById("destSubfolder");
  const destTime      = document.getElementById("destTime");
  const statCount     = document.getElementById("statCount");
  const statTime      = document.getElementById("statTime");

  // Load saved settings
  const settings = await chrome.storage.local.get({
    apiKey: "",
    model: "z-ai/glm-5.2:free",
    autoOrganize: true,
    notify: true,
    lastOrganizedCount: 0,
    lastRun: null,
    lastFolder: "",
    lastSubfolder: ""
  });

  apiKeyInput.value         = settings.apiKey || "";
  modelSelect.value         = settings.model  || "z-ai/glm-5.2:free";
  autoOrganizeCheck.checked = settings.autoOrganize !== false;
  notifyCheck.checked       = settings.notify       !== false;

  // Populate stats
  if (settings.lastOrganizedCount > 0) {
    statCount.textContent = settings.lastOrganizedCount;
  }
  if (settings.lastRun) {
    statTime.textContent = settings.lastRun;
  }

  // Restore last destination card
  if (settings.lastFolder && settings.lastSubfolder) {
    showDestination(settings.lastFolder, settings.lastSubfolder, settings.lastRun);
  }

  // Toggle settings panel
  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
    settingsToggle.textContent = settingsPanel.classList.contains("open") ? "✕" : "⚙️";
  });

  // Auto-save any settings change
  const saveSettings = () => {
    chrome.storage.local.set({
      apiKey:       apiKeyInput.value.trim(),
      model:        modelSelect.value,
      autoOrganize: autoOrganizeCheck.checked,
      notify:       notifyCheck.checked
    });
  };
  apiKeyInput.addEventListener("change", saveSettings);
  modelSelect.addEventListener("change", saveSettings);
  autoOrganizeCheck.addEventListener("change", saveSettings);
  notifyCheck.addEventListener("change", saveSettings);

  // Show destination card
  function showDestination(folder, subfolder, time) {
    if (folder && subfolder) {
      destFolder.textContent    = folder;
      destSubfolder.textContent = subfolder;
      destTime.textContent      = time || "";
      destCard.style.display    = "block";
    }
  }

  // Main sync handler
  const performSync = (isAuto = false) => {
    organizeBtn.disabled  = true;
    btnText.textContent   = "Organizing…";
    btnIcon.textContent   = "⏳";
    resultMsg.textContent = "";

    chrome.runtime.sendMessage({ action: "organize_now" }, (response) => {
      organizeBtn.disabled = false;
      btnText.textContent  = "Organize Now";
      btnIcon.textContent  = "⚡";

      if (response && response.success) {
        resultMsg.style.color = "var(--success)";
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (response.lastFolder && response.lastSubfolder) {
          showDestination(response.lastFolder, response.lastSubfolder, now);
          resultMsg.textContent = `✓ Saved to ${response.lastFolder} › ${response.lastSubfolder}`;
          statCount.textContent = response.count || settings.lastOrganizedCount || 0;
          statTime.textContent  = now;
        } else if (response.count > 0) {
          resultMsg.textContent = `✓ Organized ${response.count} bookmark${response.count > 1 ? 's' : ''}!`;
          statCount.textContent = response.count;
          statTime.textContent  = now;
        } else {
          resultMsg.textContent = `✓ All bookmarks already organized!`;
          statTime.textContent  = now;
        }
      } else {
        resultMsg.style.color = "#ef4444";
        resultMsg.textContent = `Notice: ${response?.error || "Up to date"}` ;
      }

      // Clear message after 4s
      setTimeout(() => { resultMsg.textContent = ""; }, 4000);
    });
  };

  organizeBtn.addEventListener("click", () => performSync(false));

  // Auto-sync on popup open
  setTimeout(() => { performSync(true); }, 120);
});
