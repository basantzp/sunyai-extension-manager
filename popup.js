document.addEventListener("DOMContentLoaded", async () => {
  const organizeBtn = document.getElementById("organizeBtn");
  const btnText = document.getElementById("btnText");
  const btnIcon = document.getElementById("btnIcon");
  const resultMsg = document.getElementById("resultMsg");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel = document.getElementById("settingsPanel");

  const apiKeyInput = document.getElementById("apiKey");
  const modelSelect = document.getElementById("model");
  const autoOrganizeCheck = document.getElementById("autoOrganize");
  const notifyCheck = document.getElementById("notify");

  // Load saved settings
  const settings = await chrome.storage.local.get({
    apiKey: "",
    model: "z-ai/glm-5.2:free",
    autoOrganize: true,
    notify: true
  });

  apiKeyInput.value = settings.apiKey || "";
  modelSelect.value = settings.model || "z-ai/glm-5.2:free";
  autoOrganizeCheck.checked = settings.autoOrganize !== false;
  notifyCheck.checked = settings.notify !== false;

  // Toggle settings panel visibility
  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("open");
  });

  // Auto-save setting changes
  const saveSettings = () => {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      autoOrganize: autoOrganizeCheck.checked,
      notify: notifyCheck.checked
    });
  };

  apiKeyInput.addEventListener("change", saveSettings);
  modelSelect.addEventListener("change", saveSettings);
  autoOrganizeCheck.addEventListener("change", saveSettings);
  notifyCheck.addEventListener("change", saveSettings);

  // Sync Manually & Autonomous Auto-Click Handler
  const performSync = (isAuto = false) => {
    organizeBtn.disabled = true;
    btnText.textContent = "Syncing...";
    btnIcon.textContent = "⏳";
    resultMsg.textContent = "";

    chrome.runtime.sendMessage({ action: "organize_now" }, (response) => {
      organizeBtn.disabled = false;
      btnText.textContent = "Sync Manually";
      btnIcon.textContent = "⚡";

      if (response && response.success) {
        resultMsg.style.color = "var(--success)";
        if (response.lastDestination) {
          resultMsg.textContent = `✔ Pushed to ${response.lastDestination}`;
        } else if (response.count > 0) {
          resultMsg.textContent = `✔ Pushed ${response.count} bookmarks to subfolders!`;
        } else {
          resultMsg.textContent = `✔ Pushed to clean folders!`;
        }
      } else {
        resultMsg.style.color = "#ef4444";
        resultMsg.textContent = `Notice: ${response?.error || "Up to date"}`;
      }

      setTimeout(() => {
        resultMsg.textContent = "";
      }, 4000);
    });
  };

  organizeBtn.addEventListener("click", () => performSync(false));

  // Autonomous Auto-Click on open: immediately execute sync manually!
  setTimeout(() => {
    performSync(true);
  }, 120);
});
