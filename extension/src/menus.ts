import { WorkspaceManager, StoredWorkspace } from './workspaces.js';

export const ROOT_MENU_ID = 'synapse-tab-move-root';
export const WORKSPACE_MENU_PREFIX = 'synapse-move-to-';

/**
 * Maps any CSS color representation (HSL, HSLA, RGB, RGBA, Hex, named) to a vibrant circle emoji.
 */
export function getColorBullet(colorStr?: string): string {
  if (!colorStr) return '📁';
  const c = colorStr.toLowerCase().trim();

  // 1. HSL / HSLA parsing
  const hslMatch = c.match(/hsla?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)%\s*,\s*([+-]?\d+(?:\.\d+)?)%/);
  if (hslMatch) {
    let h = parseFloat(hslMatch[1]) % 360;
    if (h < 0) h += 360;
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);

    if (l < 15) return '⚫';
    if (l > 88) return '⚪';
    if (s < 15) {
      if (l < 40) return '⚫';
      return '⚪';
    }

    if (h >= 345 || h < 15) return '🔴';
    if (h >= 15 && h < 40) return '🟠';
    if (h >= 40 && h < 70) return '🟡';
    if (h >= 70 && h < 165) return '🟢';
    if (h >= 165 && h < 195) return '🟢';
    if (h >= 195 && h < 255) return '🔵';
    if (h >= 255 && h <= 315) return '🟣';
    if (h > 315 && h < 345) return '🌸';
    return '🔴';
  }

  // 2. RGB / RGBA parsing
  const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return rgbToBullet(r, g, b);
  }

  // 3. Hex parsing (#rgb, #rgba, #rrggbb, #rrggbbaa)
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return rgbToBullet(r, g, b);
      }
    }
  }

  // 4. Named colors
  if (c.includes('black')) return '⚫';
  if (c.includes('white')) return '⚪';
  if (c.includes('purple') || c.includes('violet') || c.includes('indigo')) return '🟣';
  if (c.includes('blue') || c.includes('cyan') || c.includes('teal')) return '🔵';
  if (c.includes('green') || c.includes('lime')) return '🟢';
  if (c.includes('yellow') || c.includes('gold')) return '🟡';
  if (c.includes('orange')) return '🟠';
  if (c.includes('red') || c.includes('crimson')) return '🔴';
  if (c.includes('pink') || c.includes('magenta')) return '🌸';
  if (c.includes('gray') || c.includes('grey') || c.includes('silver')) return '⚪';
  if (c.includes('brown')) return '🟤';

  return '🟣';
}

function rgbToBullet(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (l < 0.12) return '⚫';
  if (l > 0.88) return '⚪';

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  if (d === 0 || s < 0.18 || (s < 0.35 && l > 0.65)) {
    if (l < 0.35) return '⚫';
    return '⚪';
  }

  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }

  if (h >= 345 || h < 15) return '🔴';
  if (h >= 15 && h < 40) return '🟠';
  if (h >= 40 && h < 70) return '🟡';
  if (h >= 70 && h < 165) return '🟢';
  if (h >= 165 && h < 195) return '🟢';
  if (h >= 195 && h < 255) return '🔵';
  if (h >= 255 && h <= 315) return '🟣';
  if (h > 315 && h < 345) return '🌸';
  return '🔴';
}

/**
 * Formats the menu item title for a workspace matching the design aesthetic.
 */
export function formatWorkspaceMenuTitle(ws: StoredWorkspace, isCurrent: boolean = false): string {
  let prefix = '';
  const customType = ws.customType || (ws.icon ? 'emoji' : ws.color ? 'color' : 'default');

  if (customType === 'emoji') {
    prefix = `${ws.customValue || ws.icon || '🚀'} `;
  } else if (customType === 'text') {
    const tag = (ws.customValue || ws.name.slice(0, 3) || 'WS').slice(0, 3).toUpperCase();
    prefix = ws.color ? `${getColorBullet(ws.color)} [${tag}] ` : `[${tag}] `;
  } else if (customType === 'color') {
    prefix = ws.icon ? `${getColorBullet(ws.color)} ${ws.icon} ` : `${getColorBullet(ws.color)} `;
  } else {
    if (ws.icon) {
      prefix = ws.color ? `${getColorBullet(ws.color)} ${ws.icon} ` : `${ws.icon} `;
    } else if (ws.color) {
      prefix = `${getColorBullet(ws.color)} `;
    } else {
      prefix = '📁 ';
    }
  }

  const baseTitle = `${prefix}${ws.name}`;
  return isCurrent ? `${baseTitle} (current)` : baseTitle;
}

/**
 * Checks whether a tab is eligible to be moved to a workspace.
 * Pinned tabs reside in global browser context and cannot be assigned/moved to workspaces.
 */
export function isTabMovableToWorkspace(tab?: { pinned?: boolean } | null): boolean {
  if (!tab) return false;
  return !tab.pinned;
}

let isUpdatingMenus = false;
let pendingUpdate = false;

/**
 * Rebuilds context menu items for moving tabs to workspaces.
 */
export async function setupContextMenus(): Promise<void> {
  if (isUpdatingMenus) {
    pendingUpdate = true;
    return;
  }
  isUpdatingMenus = true;
  try {
    await browser.menus.removeAll();
    const storedWorkspaces = await WorkspaceManager.getStoredWorkspaces();

    browser.menus.create({
      id: ROOT_MENU_ID,
      title: 'Move tab to another workspace',
      contexts: ['tab'],
    });

    for (const ws of storedWorkspaces) {
      browser.menus.create({
        id: `${WORKSPACE_MENU_PREFIX}${ws.id}`,
        parentId: ROOT_MENU_ID,
        title: formatWorkspaceMenuTitle(ws),
        contexts: ['tab'],
      });
    }
  } catch (err) {
    console.warn('[SynapseTab Menus] Failed to setup context menus:', err);
  } finally {
    isUpdatingMenus = false;
    if (pendingUpdate) {
      pendingUpdate = false;
      await setupContextMenus();
    }
  }
}

/**
 * Registers listeners for context menu events (click, shown, storage changes).
 */
export function initContextMenus(onTabMoved?: () => void): void {
  // 1. Menu item click
  browser.menus.onClicked.addListener(async (info, tab) => {
    if (typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith(WORKSPACE_MENU_PREFIX)) {
      return;
    }

    if (tab && tab.pinned) {
      return;
    }

    const targetWsId = info.menuItemId.slice(WORKSPACE_MENU_PREFIX.length);
    let tabsToMove: number[] = [];

    if (tab && tab.id !== undefined) {
      if (tab.highlighted) {
        const highlightedTabs = await browser.tabs.query({ highlighted: true, currentWindow: true });
        if (highlightedTabs.some((t) => t.id === tab.id)) {
          tabsToMove = highlightedTabs
            .filter((t) => !t.pinned && t.id !== undefined)
            .map((t) => t.id as number);
        } else {
          tabsToMove = [tab.id];
        }
      } else {
        tabsToMove = [tab.id];
      }
    } else {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].id !== undefined && !activeTabs[0].pinned) {
        tabsToMove = [activeTabs[0].id];
      }
    }

    if (tabsToMove.length > 0) {
      const allTabs = await browser.tabs.query({ currentWindow: true });
      const validTabs = tabsToMove.filter((id) => {
        const t = allTabs.find((tab) => tab.id === id);
        return t && !t.pinned;
      });

      if (validTabs.length > 0) {
        await WorkspaceManager.moveTabsToWorkspace(validTabs, targetWsId);
        if (onTabMoved) {
          onTabMoved();
        }
      }
    }
  });

  // 2. Menu shown - dynamically update label, indicate current workspace, or hide if tab is pinned
  browser.menus.onShown.addListener(async (info, tab) => {
    if (!info.contexts || !info.contexts.includes('tab')) {
      return;
    }

    const targetTab = tab || (info as any).tab;
    if (!targetTab || targetTab.id === undefined) {
      return;
    }

    // Pinned tabs must not show the "Move tab to another workspace" menu option
    if (targetTab.pinned) {
      try {
        await browser.menus.update(ROOT_MENU_ID, { visible: false });
        browser.menus.refresh();
      } catch {
        // Ignored
      }
      return;
    }

    try {
      let isMulti = false;
      let count = 1;
      if (targetTab.highlighted) {
        const highlighted = await browser.tabs.query({ highlighted: true, currentWindow: true });
        if (highlighted.length > 1 && highlighted.some((t) => t.id === targetTab.id)) {
          const unpinnedMovable = highlighted.filter((t) => !t.pinned);
          if (unpinnedMovable.length === 0) {
            await browser.menus.update(ROOT_MENU_ID, { visible: false });
            browser.menus.refresh();
            return;
          }
          isMulti = unpinnedMovable.length > 1;
          count = unpinnedMovable.length;
        }
      }

      const activeWsId = await WorkspaceManager.getActiveWorkspaceId();
      const currentWsId = await WorkspaceManager.getTabWorkspaceId(targetTab.id, activeWsId);

      const rootTitle = isMulti
        ? `Move ${count} tabs to another workspace`
        : 'Move tab to another workspace';

      await browser.menus.update(ROOT_MENU_ID, {
        visible: true,
        title: rootTitle,
      });

      const storedWorkspaces = await WorkspaceManager.getStoredWorkspaces();
      for (const ws of storedWorkspaces) {
        const wsMenuId = `${WORKSPACE_MENU_PREFIX}${ws.id}`;
        const isCurrent = ws.id === currentWsId;
        await browser.menus.update(wsMenuId, {
          title: formatWorkspaceMenuTitle(ws, isCurrent),
        });
      }

      browser.menus.refresh();
    } catch {
      // Menu might have closed before async operations finished
    }
  });

  // 3. Menu hidden - reset visibility state for next menu presentation
  browser.menus.onHidden?.addListener(async () => {
    try {
      await browser.menus.update(ROOT_MENU_ID, { visible: true });
    } catch {
      // Ignored
    }
  });

  // 4. Rebuild context menus when stored workspaces change
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.workspaces) {
      setupContextMenus();
    }
  });

  // 5. Initial setup
  setupContextMenus();
}
