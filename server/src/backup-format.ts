import { Workspace, TabItem, WorkspaceCustomType } from './types.js';

export interface SynapseTabBackupWorkspace {
  id: string;
  name: string;
  order?: number;
  isDivider?: boolean;
  isArchived?: boolean;
  customType?: WorkspaceCustomType;
  customValue?: string;
  color?: string;
  icon?: string;
  tabs: Array<{
    uuid?: string;
    url: string;
    title: string;
    favIconUrl?: string;
    pinned?: boolean;
    index?: number;
  }>;
}

export interface SynapseTabBackupPinnedTab {
  uuid?: string;
  url: string;
  title: string;
  favIconUrl?: string;
  pinned?: boolean;
  index?: number;
}

export interface SynapseTabBackupData {
  format: 'synapsetab-backup';
  version: string;
  timestamp: number;
  exportedAt: string;
  workspaces: SynapseTabBackupWorkspace[];
  pinnedTabs?: SynapseTabBackupPinnedTab[];
}

export interface SynapseTabImportResult {
  format: 'synapsetab';
  version: string;
  workspaces: Workspace[];
  pinnedTabs: TabItem[];
  workspaceCount: number;
  activeCount: number;
  dividerCount: number;
  archivedCount: number;
  tabCount: number;
  pinnedCount: number;
}

export type BackupFormatType = 'synapsetab' | 'stg' | 'unknown';

/**
 * Sanitizes URLs to ensure compatibility, privacy, and safety.
 */
export function sanitizeTabUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return 'about:blank';
  const trimmed = rawUrl.trim();
  if (
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:text/html') ||
    trimmed.toLowerCase().startsWith('vbscript:')
  ) {
    return 'about:blank';
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed === 'about:blank' ||
    trimmed === 'about:newtab' ||
    trimmed.startsWith('moz-extension://')
  ) {
    return trimmed;
  }
  return trimmed || 'about:blank';
}

/**
 * Detects whether a parsed JSON object is in native SynapseTab format, STG format, or unknown.
 */
export function detectBackupFormat(raw: any): BackupFormatType {
  if (!raw || typeof raw !== 'object') return 'unknown';
  if (raw.format === 'synapsetab-backup' || (Array.isArray(raw.workspaces) && !raw.groups)) {
    return 'synapsetab';
  }
  if (Array.isArray(raw.groups)) {
    return 'stg';
  }
  return 'unknown';
}

/**
 * Converts SynapseTab workspaces and pinned tabs to a complete, full-fidelity SynapseTab JSON backup.
 */
export function exportToSynapseFormat(
  workspaces: Workspace[],
  pinnedTabs: TabItem[] = [],
  appVersion: string = '1.4.1'
): SynapseTabBackupData {
  const exportedWorkspaces: SynapseTabBackupWorkspace[] = workspaces.map((ws, wsIdx) => ({
    id: ws.id,
    name: ws.name,
    order: typeof ws.order === 'number' ? ws.order : wsIdx,
    isDivider: Boolean(ws.isDivider),
    isArchived: Boolean(ws.isArchived),
    customType: ws.customType,
    customValue: ws.customValue,
    color: ws.color,
    icon: ws.icon,
    tabs: (ws.tabs || []).map((t, tIdx) => ({
      uuid: t.uuid || crypto.randomUUID(),
      url: sanitizeTabUrl(t.url),
      title: t.title || t.url || 'Tab',
      favIconUrl: t.favIconUrl,
      pinned: Boolean(t.pinned),
      index: typeof t.index === 'number' ? t.index : tIdx,
    })),
  }));

  const exportedPinned: SynapseTabBackupPinnedTab[] = pinnedTabs.map((pt, ptIdx) => ({
    uuid: pt.uuid || crypto.randomUUID(),
    url: sanitizeTabUrl(pt.url),
    title: pt.title || pt.url || 'Pinned Tab',
    favIconUrl: pt.favIconUrl,
    pinned: true,
    index: typeof pt.index === 'number' ? pt.index : ptIdx,
  }));

  return {
    format: 'synapsetab-backup',
    version: appVersion,
    timestamp: Date.now(),
    exportedAt: new Date().toISOString(),
    workspaces: exportedWorkspaces,
    pinnedTabs: exportedPinned,
  };
}

/**
 * Parses and validates a SynapseTab JSON backup object into standard Workspace and TabItem arrays.
 */
export function importFromSynapseFormat(raw: any): SynapseTabImportResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid backup file: expected a JSON object.');
  }

  const rawWorkspaces: any[] = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  if (rawWorkspaces.length === 0 && (!raw.pinnedTabs || !Array.isArray(raw.pinnedTabs) || raw.pinnedTabs.length === 0)) {
    throw new Error('Invalid SynapseTab backup: no workspaces or pinned tabs found in file.');
  }

  let totalTabs = 0;
  let dividerCount = 0;
  let archivedCount = 0;
  let activeCount = 0;

  const workspaces: Workspace[] = rawWorkspaces.map((rw, rwIdx) => {
    const isDivider = Boolean(rw.isDivider);
    const isArchived = Boolean(rw.isArchived);

    if (isDivider) {
      dividerCount++;
    } else if (isArchived) {
      archivedCount++;
    } else {
      activeCount++;
    }

    const tabs: TabItem[] = (Array.isArray(rw.tabs) ? rw.tabs : []).map((rt: any, tIdx: number) => {
      totalTabs++;
      return {
        uuid: rt.uuid && typeof rt.uuid === 'string' ? rt.uuid : crypto.randomUUID(),
        url: sanitizeTabUrl(rt.url),
        title: rt.title || rt.url || 'Tab',
        favIconUrl: rt.favIconUrl,
        pinned: Boolean(rt.pinned),
        index: typeof rt.index === 'number' ? rt.index : tIdx,
      };
    });

    return {
      id: rw.id && typeof rw.id === 'string' ? rw.id : `ws-${rwIdx + 1}`,
      name: isDivider
        ? (typeof rw.name === 'string' ? rw.name : '')
        : (rw.name && typeof rw.name === 'string' ? rw.name : `Workspace ${rwIdx + 1}`),
      order: typeof rw.order === 'number' ? rw.order : rwIdx,
      isDivider,
      isArchived,
      customType: rw.customType,
      customValue: rw.customValue,
      color: rw.color,
      icon: rw.icon,
      tabs,
    };
  });

  const rawPinned: any[] = Array.isArray(raw.pinnedTabs) ? raw.pinnedTabs : [];
  const pinnedTabs: TabItem[] = rawPinned.map((rp: any, pIdx: number) => ({
    uuid: rp.uuid && typeof rp.uuid === 'string' ? rp.uuid : crypto.randomUUID(),
    url: sanitizeTabUrl(rp.url),
    title: rp.title || rp.url || 'Pinned Tab',
    favIconUrl: rp.favIconUrl,
    pinned: true,
    index: typeof rp.index === 'number' ? rp.index : pIdx,
  }));

  return {
    format: 'synapsetab',
    version: raw.version || '1.0.0',
    workspaces,
    pinnedTabs,
    workspaceCount: workspaces.length,
    activeCount,
    dividerCount,
    archivedCount,
    tabCount: totalTabs,
    pinnedCount: pinnedTabs.length,
  };
}
