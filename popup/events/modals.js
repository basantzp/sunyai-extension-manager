if (addGroupBtn) addGroupBtn.addEventListener('click', () => openModal('create'));
if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalCancel) modalCancel.addEventListener('click', closeModal);
if (modalSave) modalSave.addEventListener('click', handleSave);

if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

if (groupNameInput) {
  groupNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
  });
}

if (conflictCancel) conflictCancel.addEventListener('click', closeConflictModal);
if (conflictConfirm) {
  conflictConfirm.addEventListener('click', async () => {
    if (!pendingSave) return;

    const { name, domains } = pendingSave;
    closeConflictModal();

    try {
      await sendMessage('moveDomainsToGroup', {
        groupName: name,
        domains
      });

      closeModal();
      if (typeof loadConfigGroups === 'function') await loadConfigGroups();
      showStatus('Domains moved and group saved', 'success');
    } catch (e) {
      closeModal();
      showStatus('Error: ' + e.message, 'error');
    }
  });
}

if (conflictModalOverlay) {
  conflictModalOverlay.addEventListener('click', (e) => {
    if (e.target === conflictModalOverlay) closeConflictModal();
  });
}
