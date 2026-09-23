function renderActiveGroups(data) {
  cachedGroupsData = data;

  if (searchActive) return;

  const { groups, activeTabId, activeGroupId } = data;

  const shortcutsHtml = `
    <div class="shortcuts-hint">
      <span><kbd>j</kbd><kbd>k</kbd> Nav</span>
      <span><kbd>↵</kbd> Select</span>
      <span><kbd>Esc</kbd> Close</span>
      <span><kbd>Alt+H/L</kbd> Group</span>
      <span><kbd>Alt+E</kbd> Toggle</span>
    </div>
  `;

  if (groups.length === 0) {
    groupsList.innerHTML = `
      <div class="empty-state">
        <p>No tab groups active</p>
        <button class="btn btn-primary btn-sm" id="emptySortBtn" style="margin-top:8px;">Sort Tabs into Groups</button>
      </div>
      ${shortcutsHtml}
    `;
    return;
  }

  const scrollTop = groupsList.scrollTop;

  groupsList.innerHTML = groups.map(group => {
    const isActiveGroup = group.id === activeGroupId;

    const tabsHtml = group.tabs.map(tab => {
      const isActiveTab = tab.id === activeTabId;
      const sanitizedFaviconUrl = sanitizeFaviconUrl(tab.favIconUrl);
      const favicon = sanitizedFaviconUrl ? `<img class="group-tab-favicon" src="${sanitizedFaviconUrl}" alt="">` : '';
      return `
        <div class="group-tab${isActiveTab ? ' active-tab' : ''}" data-action="focus-tab" data-tab-id="${tab.id}" draggable="true" data-drag-tab-id="${tab.id}" data-drag-group-id="${group.id}">
          ${favicon}
          <span class="group-tab-title">${escapeHtml(tab.title)}</span>
          <button class="group-tab-close" data-action="close-tab" data-tab-id="${tab.id}" title="Close tab">×</button>
        </div>
      `;
    }).join('');

    const colorHex = COLOR_MAP[group.color] || '#9ca3af';

    return `
      <div class="group-card${isActiveGroup ? ' active-group' : ''}" data-group-id="${group.id}">
        <div class="group-header" data-action="focus-group" data-group-id="${group.id}">
          <div class="group-name">
            <span class="group-color-dot" style="background:${colorHex}"></span>
            ${escapeHtml(group.title)}
            <span class="group-badge">${group.tabs.length}</span>
          </div>
          <div class="group-header-actions">
            <button class="group-bookmark" data-action="bookmark-group" data-group-id="${group.id}" title="Save & organize group into bookmarks">📥</button>
            <button class="group-close" data-action="close-group" data-group-id="${group.id}" title="Close group">×</button>
          </div>
        </div>
        <div class="group-tabs" data-drop-group-id="${group.id}">
          ${tabsHtml}
        </div>
      </div>
    `;
  }).join('') + shortcutsHtml;

  groupsList.scrollTop = scrollTop;
}
