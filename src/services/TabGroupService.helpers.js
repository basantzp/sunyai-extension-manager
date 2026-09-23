TabGroupService.prototype.buildCategoryMap = async function(tabs) {
  const categoryMap = new Map();
  
  // Get all groups for longest prefix matching
  const groups = await this.groupManager.getGroups();
  const unmappedTabs = [];

  for (const tab of tabs) {
    if (!tab.url) continue;
    const matchResult = await this.findBestMatchingGroup(tab.url, groups);
    if (matchResult && matchResult.groupName && matchResult.groupName !== this.config.fallbackCategory) {
      const { groupName } = matchResult;
      
      if (!categoryMap.has(groupName)) {
        categoryMap.set(groupName, []);
      }
      categoryMap.get(groupName).push(tab.id);
    } else {
      unmappedTabs.push(tab);
    }
  }

  // Automatic domain-level grouping for unmapped tabs:
  // If 2 or more tabs share the same domain (or groupUnlisted is enabled), group them by domain!
  const domainTabMap = new Map();
  for (const tab of unmappedTabs) {
    if (!tab.url) continue;
    const hostname = this.domainExtractor.extract(tab.url);
    if (!hostname) continue;
    let cleanDomain = hostname.toLowerCase().replace(/^www\./, '');
    const parts = cleanDomain.split('.');
    const brand = parts.length > 1 ? parts[parts.length - 2].toUpperCase() : cleanDomain.toUpperCase();
    if (!domainTabMap.has(brand)) {
      domainTabMap.set(brand, []);
    }
    domainTabMap.get(brand).push(tab.id);
  }

  const groupUnlisted = await this.stateManager.getGroupUnlisted();
  for (const [brand, tabIds] of domainTabMap) {
    if (tabIds.length >= 2 || groupUnlisted) {
      categoryMap.set(brand, tabIds);
    }
  }

  return categoryMap;
};

/**
 * Find the best matching group for a URL using longest prefix matching
 * 
 * @param {string} url - The tab URL
 * @param {Array<{id: string, name: string, emoji: string, domains: string[]}>} groups - All groups
 * @returns {{groupName: string, matchLength: number, pattern: string}|null}
 */
TabGroupService.prototype.findBestMatchingGroup = async function(url, groups) {
  if (!url || typeof url !== 'string') return null;
  
  // Skip special URLs for now (they'll use fallback)
  const hostname = this.domainExtractor.extract(url);
  if (!hostname && !this.isSpecialUrl(url)) return null;
  
  // First try exact match (full URL including path + query)
  const exactMatch = UrlPatternMatcher.findExactMatch(url, groups);
  if (exactMatch && exactMatch.groupId) {
    return {
      groupName: exactMatch.groupName,
      matchLength: exactMatch.pattern.length,
      pattern: exactMatch.pattern,
      isExact: true
    };
  }
  
  // Fall back to longest prefix matching
  const bestMatch = UrlPatternMatcher.findBestMatch(url, groups);
  
  if (!bestMatch.groupId) {
    // Fallback to domain-based matching for backward compatibility
    const category = this.config.findCategory(hostname);
    if (category) {
      // Check if this is the fallback category (OTHER) and respect groupUnlisted setting
      if (category === this.config.fallbackCategory) {
        const groupUnlisted = await this.stateManager.getGroupUnlisted();
        if (!groupUnlisted) {
          return null;
        }
      }
      return {
        groupName: category,
        matchLength: hostname?.length || 0,
        pattern: hostname
      };
    }
    return null;
  }
  
  return {
    groupName: bestMatch.groupName,
    matchLength: bestMatch.matchLength,
    pattern: bestMatch.pattern
  };
};

TabGroupService.prototype.buildExistingGroupMap = async function(groups) {
  const map = new Map();
  const knownCategories = this.config.getAllCategories();
  const groupUnlisted = await this.stateManager.getGroupUnlisted();
  
  for (const group of groups) {
    const categoryName = TitleParser.extractCategoryName(group.title, knownCategories);
    if (categoryName) {
      // Skip OTHER group if groupUnlisted is disabled
      if (categoryName === this.config.fallbackCategory && !groupUnlisted) {
        continue;
      }
      map.set(categoryName, group.id);
    }
  }
  return map;
};

TabGroupService.prototype.findGroupByCategory = function(groups, category) {
  if (!category) return null;
  
  const upperCategory = category.toUpperCase();
  const knownCategories = this.config.getAllCategories();
  
  for (const group of groups) {
    const extractedCategory = TitleParser.extractCategoryName(group.title, knownCategories);
    if (extractedCategory && extractedCategory === upperCategory) {
      return group.id;
    }
    if (group.title && group.title.toUpperCase().includes(upperCategory)) {
      return group.id;
    }
  }
  return null;
};

TabGroupService.prototype.createOrUpdateGroup = async function(category, tabIds, existingGroupMap, count, activeGroupId = null) {
  let groupId = existingGroupMap.get(category);

  if (groupId !== undefined && groupId !== null) {
    groupId = parseInt(groupId, 10);
  }

  if (!groupId) {
    groupId = await this.withRetry(() => chrome.tabs.group({ tabIds }));
  } else {
    await this.withRetry(() => chrome.tabs.group({ groupId, tabIds }));
  }

  const color = this.colorGenerator.generate(category);
  const title = await this.formatTitle(category, count);
  const isActive = activeGroupId && groupId === activeGroupId;

  await this.withRetry(() => chrome.tabGroups.update(groupId, {
    title: title,
    color: color,
    collapsed: !isActive
  }));

  return { category, groupId, color, count };
};

TabGroupService.prototype.collapseOtherGroups = async function(groups, excludeGroupId, activeGroupId) {
  for (const group of groups) {
    const isActiveGroup = activeGroupId && group.id === activeGroupId;
    const isTargetGroup = group.id === excludeGroupId;

    if (!isActiveGroup && !isTargetGroup && !group.collapsed) {
      await this.withRetry(() => chrome.tabGroups.update(group.id, { collapsed: true }));
    }
  }
};
