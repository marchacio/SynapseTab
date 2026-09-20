import { Workspace, TabItem } from './types.js';

export interface StgTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface StgGroup {
  id: number | string;
  title: string;
  iconColor: string;
  iconUrl: string | null;
  iconViewType: 'circle' | 'title' | 'icon';
  tabs: StgTab[];
  isArchive?: boolean;
  discardTabsAfterHide?: boolean;
  discardExcludeAudioTabs?: boolean;
  prependTitleToWindow?: boolean;
  exportToBookmarksWhenAutoBackup?: boolean;
  leaveBookmarksOfClosedTabs?: boolean;
  newTabContainer?: string;
  ifDifferentContainerReOpen?: boolean;
  excludeContainersForReOpen?: string[];
  isSticky?: boolean;
  catchTabContainers?: string[];
  catchTabRules?: string;
  moveToGroupIfNoneCatchTabRules?: string | null;
  muteTabsWhenGroupCloseAndRestoreWhenOpen?: boolean;
  showTabAfterMovingItIntoThisGroup?: boolean;
  showOnlyActiveTabAfterMovingItIntoThisGroup?: boolean;
  showNotificationAfterMovingTabIntoThisGroup?: boolean;
  bookmarkId?: string | null;
}

export interface StgHotkey {
  value: string;
  action: string;
  groupId: number;
}

export interface StgBackupData {
  version: string;
  groups: StgGroup[];
  lastCreatedGroupPosition?: number;
  defaultGroupProps?: {
    iconViewType?: string;
  };
  closePopupAfterChangeGroup?: boolean;
  closePopupAfterSelectTab?: boolean;
  openGroupAfterChange?: boolean;
  alwaysAskNewGroupName?: boolean;
  createNewGroupWhenOpenNewWindow?: boolean;
  openManageGroupsInTab?: boolean;
  showConfirmDialogBeforeGroupArchiving?: boolean;
  showConfirmDialogBeforeGroupDelete?: boolean;
  showNotificationAfterGroupDelete?: boolean;
  showContextMenuOnTabs?: boolean;
  showContextMenuOnLinks?: boolean;
  defaultBookmarksParent?: string;
  showExtendGroupsPopupWithActiveTabs?: boolean;
  showTabsWithThumbnailsInManageGroups?: boolean;
  fullPopupWidth?: boolean;
  temporaryContainerTitle?: string;
  contextMenuTab?: string[];
  contextMenuGroup?: string[];
  autoBackupEnable?: boolean;
  autoBackupLastBackupTimeStamp?: number;
  autoBackupIntervalKey?: string;
  autoBackupIntervalValue?: number;
  autoBackupIncludeTabThumbnails?: boolean;
  autoBackupIncludeTabFavIcons?: boolean;
  autoBackupFolderName?: string;
  autoBackupByDayIndex?: boolean;
  theme?: string;
  hotkeys?: StgHotkey[];
  pinnedTabs?: StgTab[];
}

export interface StgImportResult {
  workspaces: Workspace[];
  pinnedTabs: TabItem[];
  version: string;
  groupCount: number;
  tabCount: number;
  pinnedCount: number;
}

const DEFAULT_GROUP_COLORS = [
  '#000000',
  '#0000ff',
  'hsla(50, 100%, 50%, 1)',
  'hsla(350, 100%, 50%, 1)',
  'hsla(0, 100%, 50%, 1)',
  'hsla(240, 100%, 50%, 1)',
  'hsla(300, 100%, 50%, 1)',
  'hsla(210, 100%, 50%, 1)',
  'hsla(120, 100%, 40%, 1)',
  'hsla(180, 100%, 40%, 1)',
];

/**
 * Sanitizes URLs to ensure compatibility and safety.
 */
export function sanitizeTabUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return 'about:blank';
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed === 'about:blank' ||
    trimmed === 'about:newtab'
  ) {
    return trimmed;
  }
  // Convert moz-extension URLs or others to safe url if needed
  if (trimmed.startsWith('moz-extension://')) {
    return trimmed;
  }
  return trimmed || 'about:blank';
}

/**
 * Converts SynapseTab workspaces and pinned tabs to a Drive4ik Simple Tab Groups (STG) 5.3.2 compatible JSON object.
 */
export function exportToStgFormat(
  workspaces: Workspace[],
  pinnedTabs: TabItem[] = []
): StgBackupData {
  let tabIdCounter = 1;

  const groups: StgGroup[] = workspaces.map((ws, wsIdx) => {
    // Determine numeric ID or fallback
    let numericId: number;
    const matchedNum = ws.id.replace(/\D/g, '');
    if (matchedNum && !isNaN(parseInt(matchedNum, 10))) {
      numericId = parseInt(matchedNum, 10);
    } else {
      numericId = wsIdx + 1;
    }

    const color = DEFAULT_GROUP_COLORS[wsIdx % DEFAULT_GROUP_COLORS.length];

    // Filter out pinned tabs if any are in the workspace tab list
    const unpinnedTabs = (ws.tabs || []).filter((t) => !t.pinned);

    const stgTabs: StgTab[] = unpinnedTabs.map((tab) => {
      const tabId = tabIdCounter++;
      const stgTab: StgTab = {
        id: tabId,
        url: tab.url,
        title: tab.title || tab.url || 'Tab',
      };
      if (tab.favIconUrl) {
        stgTab.favIconUrl = tab.favIconUrl;
      }
      return stgTab;
    });

    return {
      id: numericId,
      title: ws.name || `Workspace ${wsIdx + 1}`,
      iconColor: color,
      iconUrl: null,
      iconViewType: 'title',
      tabs: stgTabs,
      isArchive: false,
      discardTabsAfterHide: false,
      discardExcludeAudioTabs: false,
      prependTitleToWindow: false,
      exportToBookmarksWhenAutoBackup: false,
      leaveBookmarksOfClosedTabs: false,
      newTabContainer: 'firefox-default',
      ifDifferentContainerReOpen: false,
      excludeContainersForReOpen: [],
      isSticky: false,
      catchTabContainers: [],
      catchTabRules: '',
      moveToGroupIfNoneCatchTabRules: null,
      muteTabsWhenGroupCloseAndRestoreWhenOpen: false,
      showTabAfterMovingItIntoThisGroup: false,
      showOnlyActiveTabAfterMovingItIntoThisGroup: false,
      showNotificationAfterMovingTabIntoThisGroup: true,
      bookmarkId: null,
    };
  });

  const stgPinnedTabs: StgTab[] = pinnedTabs.map((pt) => {
    const tabId = tabIdCounter++;
    const stgTab: StgTab = {
      id: tabId,
      url: pt.url,
      title: pt.title || pt.url || 'Pinned Tab',
    };
    if (pt.favIconUrl) {
      stgTab.favIconUrl = pt.favIconUrl;
    }
    return stgTab;
  });

  return {
    version: '5.3.2',
    groups,
    lastCreatedGroupPosition: groups.length,
    defaultGroupProps: {
      iconViewType: 'title',
    },
    closePopupAfterChangeGroup: true,
    closePopupAfterSelectTab: false,
    openGroupAfterChange: false,
    alwaysAskNewGroupName: true,
    createNewGroupWhenOpenNewWindow: false,
    openManageGroupsInTab: true,
    showConfirmDialogBeforeGroupArchiving: true,
    showConfirmDialogBeforeGroupDelete: true,
    showNotificationAfterGroupDelete: true,
    showContextMenuOnTabs: true,
    showContextMenuOnLinks: true,
    defaultBookmarksParent: 'menu________',
    showExtendGroupsPopupWithActiveTabs: false,
    showTabsWithThumbnailsInManageGroups: false,
    fullPopupWidth: false,
    temporaryContainerTitle: '⌚ Contenitore temporaneo',
    contextMenuTab: [
      'open-in-new-window',
      'reload',
      'discard',
      'remove',
      'update-thumbnail',
      'set-group-icon',
      'move-tab-to-group',
    ],
    contextMenuGroup: [
      'open-in-new-window',
      'sort-asc',
      'sort-desc',
      'discard',
      'discard-other',
      'export-to-bookmarks',
      'unload',
      'archive',
      'rename',
      'reload-all-tabs',
    ],
    autoBackupEnable: true,
    autoBackupLastBackupTimeStamp: Math.floor(Date.now() / 1000),
    autoBackupIntervalKey: 'days',
    autoBackupIntervalValue: 1,
    autoBackupIncludeTabThumbnails: false,
    autoBackupIncludeTabFavIcons: true,
    autoBackupFolderName: 'SynapseTab-STG-backups',
    autoBackupByDayIndex: true,
    theme: 'dark',
    hotkeys: [
      {
        value: 'Ctrl+Backquote',
        action: 'load-next-group',
        groupId: 0,
      },
      {
        value: 'Ctrl+Shift+Backquote',
        action: 'load-prev-group',
        groupId: 0,
      },
    ],
    pinnedTabs: stgPinnedTabs,
  };
}

/**
 * Parses and validates an STG or SynapseTab JSON backup file.
 */
export function importFromStgFormat(rawData: any): StgImportResult {
  let parsed: any = rawData;
  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData);
    } catch (e: any) {
      throw new Error(`Invalid JSON file: ${e.message}`);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Imported JSON is not a valid object');
  }

  const workspaces: Workspace[] = [];
  const pinnedTabs: TabItem[] = [];

  // 1. Support raw SynapseTab format if workspaces exists at top level
  if (Array.isArray(parsed.workspaces) && !Array.isArray(parsed.groups)) {
    let totalTabs = 0;
    for (const ws of parsed.workspaces) {
      const tabs: TabItem[] = [];
      for (const t of ws.tabs || []) {
        totalTabs++;
        const tabItem: TabItem = {
          uuid: t.uuid || crypto.randomUUID(),
          url: sanitizeTabUrl(t.url),
          title: t.title || t.url || 'Tab',
          favIconUrl: t.favIconUrl,
          pinned: Boolean(t.pinned),
          index: typeof t.index === 'number' ? t.index : tabs.length,
        };
        if (tabItem.pinned) {
          pinnedTabs.push(tabItem);
        } else {
          tabs.push(tabItem);
        }
      }
      workspaces.push({
        id: ws.id || `ws-${crypto.randomUUID().slice(0, 6)}`,
        name: ws.name || 'Workspace',
        customType: ws.customType,
        customValue: ws.customValue,
        color: ws.color,
        icon: ws.icon,
        tabs,
      });
    }

    return {
      workspaces,
      pinnedTabs,
      version: parsed.version || '1.0.0',
      groupCount: workspaces.length,
      tabCount: totalTabs,
      pinnedCount: pinnedTabs.length,
    };
  }

  // 2. STG Format (groups + pinnedTabs)
  if (!Array.isArray(parsed.groups)) {
    throw new Error('Invalid Simple Tab Groups format: missing "groups" array');
  }

  let totalTabCount = 0;

  for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
    const group = parsed.groups[gIdx];
    if (!group || typeof group !== 'object') continue;

    const groupTitle = (group.title || `Group ${gIdx + 1}`).trim();
    const wsId = group.id !== undefined && group.id !== null ? `stg-${group.id}` : `ws-${crypto.randomUUID().slice(0, 6)}`;
    const groupColor = typeof group.iconColor === 'string' ? group.iconColor : undefined;

    const groupTabs: TabItem[] = [];
    if (Array.isArray(group.tabs)) {
      for (let tIdx = 0; tIdx < group.tabs.length; tIdx++) {
        const tab = group.tabs[tIdx];
        if (!tab || typeof tab !== 'object') continue;

        const url = sanitizeTabUrl(tab.url);
        const title = tab.title || url || 'Tab';
        const favIconUrl = tab.favIconUrl || tab.favIcconUrl; // Support typo in some STG exports (favIcconUrl)

        groupTabs.push({
          uuid: crypto.randomUUID(),
          url,
          title,
          favIconUrl: typeof favIconUrl === 'string' && favIconUrl.length > 0 ? favIconUrl : undefined,
          pinned: false,
          index: tIdx,
        });
        totalTabCount++;
      }
    }

    workspaces.push({
      id: wsId,
      name: groupTitle,
      color: groupColor,
      customType: groupColor ? 'color' : 'default',
      tabs: groupTabs,
    });
  }

  // Parse pinned tabs
  if (Array.isArray(parsed.pinnedTabs)) {
    for (let pIdx = 0; pIdx < parsed.pinnedTabs.length; pIdx++) {
      const pTab = parsed.pinnedTabs[pIdx];
      if (!pTab || typeof pTab !== 'object') continue;

      const url = sanitizeTabUrl(pTab.url);
      const title = pTab.title || url || 'Pinned Tab';
      const favIconUrl = pTab.favIconUrl || pTab.favIcconUrl;

      pinnedTabs.push({
        uuid: crypto.randomUUID(),
        url,
        title,
        favIconUrl: typeof favIconUrl === 'string' && favIconUrl.length > 0 ? favIconUrl : undefined,
        pinned: true,
        index: pIdx,
      });
      totalTabCount++;
    }
  }

  return {
    workspaces,
    pinnedTabs,
    version: parsed.version || '5.3.2',
    groupCount: workspaces.length,
    tabCount: totalTabCount,
    pinnedCount: pinnedTabs.length,
  };
}
