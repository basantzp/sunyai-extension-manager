// TabFlow Group Toggle
if (groupToggle) {
  groupToggle.addEventListener('change', async () => {
    groupToggle.disabled = true;
    if (expandAllBtn) expandAllBtn.style.display = groupToggle.checked ? '' : 'none';

    try {
      if (groupToggle.checked) {
        const result = await sendMessage('groupTabs');
        if (result.success) {
          showStatus(`Grouped ${result.groupedCount} domain${result.groupedCount !== 1 ? 's' : ''}`, 'success');
          await loadActiveGroups();
        } else {
          showStatus(result.message || 'Failed', 'error');
          groupToggle.checked = false;
          if (expandAllBtn) expandAllBtn.style.display = 'none';
        }
      } else {
        const result = await sendMessage('ungroupAll');
        if (result.success) {
          showStatus(`Ungrouped ${result.ungroupedCount} tab${result.ungroupedCount !== 1 ? 's' : ''}`, 'success');
          await loadDomainGroups();
        } else {
          showStatus(result.message || 'Failed', 'error');
          groupToggle.checked = true;
          if (expandAllBtn) expandAllBtn.style.display = '';
        }
      }
    } catch (e) {
      showStatus('Error: ' + e.message, 'error');
      groupToggle.checked = !groupToggle.checked;
      if (expandAllBtn) expandAllBtn.style.display = groupToggle.checked ? '' : 'none';
    }

    groupToggle.disabled = false;
    if (searchInput) searchInput.focus();
  });
}

// Keyboard shortcuts (Vim navigation + numeric tab switching)
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.target === searchInput && e.key === 'Escape') {
      if (typeof exitSearch === 'function') exitSearch();
    }
    return;
  }

  if (e.key === 'Escape') {
    if (modalOverlay && modalOverlay.classList.contains('open')) {
      if (typeof closeModal === 'function') closeModal();
    } else if (conflictModalOverlay && conflictModalOverlay.classList.contains('open')) {
      if (typeof closeConflictModal === 'function') closeConflictModal();
    } else if (searchActive) {
      if (typeof exitSearch === 'function') exitSearch();
    } else if (settingsPanel && (settingsPanel.classList.contains('open') || settingsPanel.classList.contains('active'))) {
      const homeTabBtn = document.getElementById('tabNavTabs');
      if (homeTabBtn) homeTabBtn.click();
    } else if (focusedGroupId) {
      if (typeof exitFocusMode === 'function') exitFocusMode();
    }
    return;
  }

  // Quick tab navigation: 1 for Tabs, 2 for Bookmarks, 3 for Settings
  if (!modalOverlay?.classList.contains('open') && !conflictModalOverlay?.classList.contains('open')) {
    if (e.key === '1') {
      document.getElementById('tabNavTabs')?.click();
      return;
    } else if (e.key === '2') {
      document.getElementById('tabNavBookmarks')?.click();
      return;
    } else if (e.key === '3') {
      document.getElementById('tabNavSettings')?.click();
      return;
    }
  }

  // Only handle tab-list keyboard navigation when on the Tabs tab
  const homeTab = document.getElementById('homeTab');
  const isHomeTabActive = homeTab && homeTab.classList.contains('active');

  if (e.key === '/' || e.key === 'i' || e.key === 'I') {
    if (isHomeTabActive) {
      e.preventDefault();
      if (typeof enterSearch === 'function') enterSearch();
    }
  } else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (typeof getNavItems === 'function' && typeof selectItem === 'function') {
      const items = getNavItems();
      if (items.length === 0) return;
      if (navIndex < 0) {
        selectItem(0);
      } else {
        selectItem((navIndex + 1) % items.length);
      }
    }
  } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (typeof getNavItems === 'function' && typeof selectItem === 'function') {
      const items = getNavItems();
      if (items.length === 0) return;
      if (navIndex < 0) {
        selectItem(items.length - 1);
      } else {
        selectItem((navIndex - 1 + items.length) % items.length);
      }
    }
  } else if (e.key === 'l' || e.key === 'L' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (typeof activateItem === 'function') {
      activateItem().catch(console.error);
    }
  } else if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft') {
    e.preventDefault();
    if (settingsPanel && (settingsPanel.classList.contains('open') || settingsPanel.classList.contains('active'))) {
      const homeTabBtn = document.getElementById('tabNavTabs');
      if (homeTabBtn) homeTabBtn.click();
    } else if (modalOverlay && modalOverlay.classList.contains('open')) {
      if (typeof closeModal === 'function') closeModal();
    } else if (conflictModalOverlay && conflictModalOverlay.classList.contains('open')) {
      if (typeof closeConflictModal === 'function') closeConflictModal();
    } else if (searchActive) {
      if (typeof exitSearch === 'function') exitSearch();
    } else if (focusedGroupId) {
      if (typeof exitFocusMode === 'function') exitFocusMode();
    }
  }
});

// Bootstrap on DOM load
(async () => {
  const isSidePanel = new URLSearchParams(window.location.search).get('context') === 'sidepanel';
  if (isSidePanel) {
    document.body.classList.add('sidepanel-mode');
  } else {
    document.body.classList.add('popup-mode');
  }

  // Initialize Bookmarks View logic
  if (typeof initBookmarksView === 'function') {
    initBookmarksView();
  }

  try {
    const state = await sendMessage('getState');
    if (groupToggle) groupToggle.checked = Boolean(state.enabled);

    const autoCollapse = await sendMessage('getAutoCollapse');
    if (autoCollapseToggle) autoCollapseToggle.checked = Boolean(autoCollapse.autoCollapse);

    const duplicatePrevention = await sendMessage('getDuplicatePrevention');
    if (duplicatePreventionToggle) duplicatePreventionToggle.checked = Boolean(duplicatePrevention.enabled);

    const groupUnlisted = await sendMessage('getGroupUnlisted');
    if (groupUnlistedToggle) groupUnlistedToggle.checked = Boolean(groupUnlisted.enabled);

    const displayMode = await sendMessage('getDisplayMode');
    if (displayModeSelect && displayMode.mode) displayModeSelect.value = displayMode.mode;

    const uiMode = await sendMessage('getUiMode');
    if (uiModeToggle) uiModeToggle.checked = uiMode.mode === 'sidepanel';
  } catch (e) {
    console.error('Failed to get settings:', e);
  }

  if (expandAllBtn && groupToggle) {
    expandAllBtn.style.display = groupToggle.checked ? '' : 'none';
  }

  if (groupToggle && groupToggle.checked) {
    await loadActiveGroups();
  } else {
    await loadDomainGroups();
  }

  requestAnimationFrame(() => {
    if (searchInput) searchInput.focus();
    if (typeof selectItem === 'function') selectItem(0);
  });

  // Background bookmark silent sweep on startup
  setTimeout(() => {
    if (typeof window.performBookmarkSync === 'function') {
      window.performBookmarkSync(true);
    }
  }, 350);
})();

if (uiModeToggle) {
  uiModeToggle.addEventListener('change', async () => {
    const mode = uiModeToggle.checked ? 'sidepanel' : 'popup';
    await sendMessage('setUiMode', { mode });
    showStatus(`UI Mode switched to ${mode === 'sidepanel' ? 'Side Panel' : 'Popup'}. Click the extension icon to see changes.`, 'success');
  });
}
