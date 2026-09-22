const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const tabName = btn.dataset.tab;

    // Update buttons
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update contents
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabName}Tab`) {
        content.classList.add('active');
      }
    });

    if (tabName === 'home') {
      if (typeof searchBar !== 'undefined' && searchBar) searchBar.style.display = '';
      if (!focusedGroupId) {
        if (groupToggle.checked) {
          await loadActiveGroups();
        } else {
          await loadDomainGroups();
        }
      }
      if (typeof searchInput !== 'undefined' && searchInput) searchInput.focus();
    } else if (tabName === 'bookmarks') {
      if (typeof searchBar !== 'undefined' && searchBar) searchBar.style.display = 'none';
      if (typeof exitSearch === 'function') exitSearch();
      if (typeof refreshBookmarkStatus === 'function') {
        refreshBookmarkStatus();
      }
    } else if (tabName === 'settings') {
      if (typeof searchBar !== 'undefined' && searchBar) searchBar.style.display = 'none';
      if (typeof exitSearch === 'function') exitSearch();
      loadConfigGroups();
    }
  });
});
