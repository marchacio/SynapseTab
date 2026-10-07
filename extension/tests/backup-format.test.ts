import { describe, it, expect } from 'vitest';
import {
  exportToSynapseFormat,
  importFromSynapseFormat,
  detectBackupFormat,
  SynapseTabBackupData,
} from '../src/backup-format.js';
import { Workspace, TabItem } from '../src/types.js';

describe('SynapseTab Native Backup Format Tests', () => {
  const sampleWorkspaces: Workspace[] = [
    {
      id: 'ws-nav',
      name: 'Navigation',
      order: 0,
      isDivider: false,
      isArchived: false,
      customType: 'color',
      color: '#0000ff',
      tabs: [
        {
          uuid: 'tab-1',
          url: 'https://developer.mozilla.org',
          title: 'MDN Web Docs',
          favIconUrl: 'https://developer.mozilla.org/favicon.ico',
          pinned: false,
          index: 0,
        },
        {
          uuid: 'tab-2',
          url: 'https://github.com',
          title: 'GitHub',
          pinned: false,
          index: 1,
        },
      ],
    },
    {
      id: 'ws-div-1',
      name: 'PROJECTS',
      order: 1,
      isDivider: true,
      isArchived: false,
      tabs: [],
    },
    {
      id: 'ws-archived-1',
      name: 'Old Research',
      order: 2,
      isDivider: false,
      isArchived: true,
      customType: 'text',
      customValue: 'RES',
      color: '#ffba28',
      tabs: [
        {
          uuid: 'tab-3',
          url: 'https://arxiv.org/abs/1234',
          title: 'Paper Title',
          pinned: false,
          index: 0,
        },
      ],
    },
  ];

  const samplePinnedTabs: TabItem[] = [
    {
      uuid: 'pinned-1',
      url: 'https://mail.example.com',
      title: 'Mail',
      favIconUrl: 'https://mail.example.com/icon.png',
      pinned: true,
      index: 0,
    },
  ];

  it('correctly exports workspaces with full fidelity including dividers and archived status', () => {
    const exported: SynapseTabBackupData = exportToSynapseFormat(sampleWorkspaces, samplePinnedTabs, '1.4.5');

    expect(exported.format).toBe('synapsetab-backup');
    expect(exported.version).toBe('1.4.5');
    expect(typeof exported.timestamp).toBe('number');
    expect(typeof exported.exportedAt).toBe('string');
    expect(exported.workspaces.length).toBe(3);
    expect(exported.pinnedTabs?.length).toBe(1);

    // Active workspace
    expect(exported.workspaces[0].id).toBe('ws-nav');
    expect(exported.workspaces[0].isDivider).toBe(false);
    expect(exported.workspaces[0].isArchived).toBe(false);
    expect(exported.workspaces[0].customType).toBe('color');
    expect(exported.workspaces[0].color).toBe('#0000ff');
    expect(exported.workspaces[0].tabs.length).toBe(2);

    // Divider
    expect(exported.workspaces[1].id).toBe('ws-div-1');
    expect(exported.workspaces[1].isDivider).toBe(true);
    expect(exported.workspaces[1].name).toBe('PROJECTS');

    // Archived workspace
    expect(exported.workspaces[2].id).toBe('ws-archived-1');
    expect(exported.workspaces[2].isArchived).toBe(true);
    expect(exported.workspaces[2].customType).toBe('text');
    expect(exported.workspaces[2].customValue).toBe('RES');
    expect(exported.workspaces[2].tabs.length).toBe(1);
  });

  it('correctly imports native SynapseTab backup with round-trip fidelity', () => {
    const exported = exportToSynapseFormat(sampleWorkspaces, samplePinnedTabs, '1.4.5');
    const result = importFromSynapseFormat(exported);

    expect(result.format).toBe('synapsetab');
    expect(result.version).toBe('1.4.5');
    expect(result.workspaceCount).toBe(3);
    expect(result.activeCount).toBe(1);
    expect(result.dividerCount).toBe(1);
    expect(result.archivedCount).toBe(1);
    expect(result.tabCount).toBe(3);
    expect(result.pinnedCount).toBe(1);

    // Workspace round-trip checks
    const ws1 = result.workspaces[0];
    expect(ws1.id).toBe('ws-nav');
    expect(ws1.name).toBe('Navigation');
    expect(ws1.color).toBe('#0000ff');
    expect(ws1.tabs[0].url).toBe('https://developer.mozilla.org');
    expect(ws1.tabs[0].title).toBe('MDN Web Docs');

    const div = result.workspaces[1];
    expect(div.isDivider).toBe(true);
    expect(div.name).toBe('PROJECTS');

    const arch = result.workspaces[2];
    expect(arch.isArchived).toBe(true);
    expect(arch.customType).toBe('text');
    expect(arch.customValue).toBe('RES');

    const pin = result.pinnedTabs[0];
    expect(pin.url).toBe('https://mail.example.com');
    expect(pin.pinned).toBe(true);
  });

  it('detects backup format accurately', () => {
    const synapseBackup = exportToSynapseFormat(sampleWorkspaces, samplePinnedTabs);
    expect(detectBackupFormat(synapseBackup)).toBe('synapsetab');

    const stgBackup = {
      version: '5.3.2',
      groups: [
        { id: 1, title: 'Group 1', tabs: [] },
      ],
    };
    expect(detectBackupFormat(stgBackup)).toBe('stg');

    expect(detectBackupFormat({})).toBe('unknown');
    expect(detectBackupFormat(null)).toBe('unknown');
    expect(detectBackupFormat({ invalid: true })).toBe('unknown');
  });

  it('sanitizes tab URLs and provides safe fallbacks on malformed import', () => {
    const malformed = {
      format: 'synapsetab-backup',
      version: '1.4.5',
      workspaces: [
        {
          id: 'test-ws',
          name: '',
          tabs: [
            { url: 'javascript:alert(1)', title: 'XSS Attempt' },
            { url: '', title: 'Empty URL' },
          ],
        },
      ],
    };

    const result = importFromSynapseFormat(malformed);
    expect(result.workspaces.length).toBe(1);
    expect(result.workspaces[0].name).toBe('Workspace 1');
    expect(result.workspaces[0].tabs[0].url).toBe('about:blank');
    expect(result.workspaces[0].tabs[1].url).toBe('about:blank');
  });

  it('throws descriptive error on invalid or empty backup object', () => {
    expect(() => importFromSynapseFormat(null)).toThrow('expected a JSON object');
    expect(() => importFromSynapseFormat({ workspaces: [] })).toThrow('no workspaces or pinned tabs found');
  });

  it('preserves both customized uppercase and uncustomized empty divider names with full round-trip fidelity', () => {
    const workspacesWithDividers: Workspace[] = [
      { id: 'ws-1', name: 'Work', order: 0, isDivider: false, tabs: [] },
      { id: 'div-custom', name: 'DEVELOPMENT', order: 1, isDivider: true, tabs: [] },
      { id: 'ws-2', name: 'Personal', order: 2, isDivider: false, tabs: [] },
      { id: 'div-empty', name: '', order: 3, isDivider: true, tabs: [] },
    ];

    const backup = exportToSynapseFormat(workspacesWithDividers, [], '1.4.5');
    expect(backup.workspaces[1].name).toBe('DEVELOPMENT');
    expect(backup.workspaces[1].isDivider).toBe(true);
    expect(backup.workspaces[3].name).toBe('');
    expect(backup.workspaces[3].isDivider).toBe(true);

    const imported = importFromSynapseFormat(backup);
    expect(imported.dividerCount).toBe(2);
    expect(imported.workspaces[1].name).toBe('DEVELOPMENT');
    expect(imported.workspaces[1].isDivider).toBe(true);
    expect(imported.workspaces[3].name).toBe('');
    expect(imported.workspaces[3].isDivider).toBe(true);
  });
});
