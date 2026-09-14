import { describe, it, expect } from 'vitest';
import { reconcile } from './diff.js';
import { SyncPayload } from './types.js';

describe('SynapseTab Reconcile & Diff Engine (reconcile)', () => {
  const baseRemoteState: SyncPayload = {
    client_id: 'laptop-linux-01',
    updated_at: 1773329000,
    active_workspace_id: 'hacking-p1',
    workspaces: [
      {
        id: 'uni',
        name: 'University',
        tabs: [
          {
            uuid: '550e8400-e29b-41d4-a716-446655440000',
            url: 'https://portal.university.edu',
            title: 'Student Portal',
            favIconUrl: 'https://portal.university.edu/favicon.ico',
            pinned: false,
            index: 0,
          },
        ],
      },
      {
        id: 'hacking-p1',
        name: 'Hacking Project 1',
        tabs: [
          {
            uuid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            url: 'https://target.local/admin',
            title: 'Admin Dashboard',
            favIconUrl: 'https://target.local/favicon.ico',
            pinned: false,
            index: 0,
          },
        ],
      },
    ],
  };

  it('Scenario 1: Cold boot on second machine (empty local state receiving full remote tree)', () => {
    const emptyLocalState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 0,
      active_workspace_id: 'default',
      workspaces: [],
    };

    const plan = reconcile(emptyLocalState, baseRemoteState);

    // Should plan creating both workspaces
    expect(plan.workspacesToCreate).toEqual([
      { id: 'uni', name: 'University' },
      { id: 'hacking-p1', name: 'Hacking Project 1' },
    ]);
    expect(plan.workspacesToRemove).toHaveLength(0);

    // Should plan creating all remote tabs with lazy materialization
    expect(plan.tabsToCreate).toHaveLength(2);
    expect(plan.tabsToCreate[0]).toEqual({
      tab: baseRemoteState.workspaces[0].tabs[0],
      workspaceId: 'uni',
    });
    expect(plan.tabsToCreate[1]).toEqual({
      tab: baseRemoteState.workspaces[1].tabs[0],
      workspaceId: 'hacking-p1',
    });

    // No tabs to close, update, or move
    expect(plan.tabsToClose).toHaveLength(0);
    expect(plan.tabsToUpdate).toHaveLength(0);
    expect(plan.tabsToMove).toHaveLength(0);

    // Active workspace aligns with remote
    expect(plan.activeWorkspaceId).toBe('hacking-p1');
  });

  it('Scenario 2: Tabs removed remotely must plan removals for local machine', () => {
    const localStateWithExtraTab: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773328000,
      active_workspace_id: 'hacking-p1',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: '550e8400-e29b-41d4-a716-446655440000',
              url: 'https://portal.university.edu',
              title: 'Student Portal',
              favIconUrl: 'https://portal.university.edu/favicon.ico',
              pinned: false,
              index: 0,
              localTabId: 101,
            },
            {
              uuid: 'old-deleted-tab-uuid-1234',
              url: 'https://reddit.com',
              title: 'Reddit',
              pinned: false,
              index: 1,
              localTabId: 102,
            },
          ],
        },
        {
          id: 'hacking-p1',
          name: 'Hacking Project 1',
          tabs: [
            {
              uuid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
              url: 'https://target.local/admin',
              title: 'Admin Dashboard',
              favIconUrl: 'https://target.local/favicon.ico',
              pinned: false,
              index: 0,
              localTabId: 103,
            },
          ],
        },
      ],
    };

    const plan = reconcile(localStateWithExtraTab, baseRemoteState);

    // The tab deleted on remote machine A must be planned for closure on machine B
    expect(plan.tabsToClose).toHaveLength(1);
    expect(plan.tabsToClose[0]).toEqual({
      uuid: 'old-deleted-tab-uuid-1234',
      localTabId: 102,
    });

    // No creations
    expect(plan.tabsToCreate).toHaveLength(0);
  });

  it('Scenario 3: Preserving tabs with matching UUIDs and matching URLs intact', () => {
    const identicalLocalState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773329000,
      active_workspace_id: 'hacking-p1',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: '550e8400-e29b-41d4-a716-446655440000',
              url: 'https://portal.university.edu',
              title: 'Student Portal',
              favIconUrl: 'https://portal.university.edu/favicon.ico',
              pinned: false,
              index: 0,
              localTabId: 201,
            },
          ],
        },
        {
          id: 'hacking-p1',
          name: 'Hacking Project 1',
          tabs: [
            {
              uuid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
              url: 'https://target.local/admin',
              title: 'Admin Dashboard',
              favIconUrl: 'https://target.local/favicon.ico',
              pinned: false,
              index: 0,
              localTabId: 202,
            },
          ],
        },
      ],
    };

    const plan = reconcile(identicalLocalState, baseRemoteState);

    // Pure no-op execution plan: nothing created, closed, updated, or moved
    expect(plan.tabsToCreate).toHaveLength(0);
    expect(plan.tabsToClose).toHaveLength(0);
    expect(plan.tabsToUpdate).toHaveLength(0);
    expect(plan.tabsToMove).toHaveLength(0);
    expect(plan.workspacesToCreate).toHaveLength(0);
    expect(plan.workspacesToRemove).toHaveLength(0);
  });

  it('Scenario 4: Reordered tabs within workspaces generate tabsToMove actions', () => {
    const localReorderedState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773328000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: 'tab-alpha',
              url: 'https://alpha.edu',
              title: 'Alpha',
              pinned: false,
              index: 0,
              localTabId: 301,
            },
            {
              uuid: 'tab-beta',
              url: 'https://beta.edu',
              title: 'Beta',
              pinned: false,
              index: 1,
              localTabId: 302,
            },
          ],
        },
      ],
    };

    const remoteReorderedState: SyncPayload = {
      client_id: 'laptop-linux-01',
      updated_at: 1773329000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: 'tab-beta',
              url: 'https://beta.edu',
              title: 'Beta',
              pinned: false,
              index: 0,
            },
            {
              uuid: 'tab-alpha',
              url: 'https://alpha.edu',
              title: 'Alpha',
              pinned: false,
              index: 1,
            },
          ],
        },
      ],
    };

    const plan = reconcile(localReorderedState, remoteReorderedState);

    expect(plan.tabsToMove).toEqual([
      { uuid: 'tab-beta', localTabId: 302, targetIndex: 0 },
      { uuid: 'tab-alpha', localTabId: 301, targetIndex: 1 },
    ]);
    expect(plan.tabsToCreate).toHaveLength(0);
    expect(plan.tabsToClose).toHaveLength(0);
  });

  it('Scenario 5: Tab URL navigation or pin state changes produce tabsToUpdate', () => {
    const localState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773328000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: '550e8400-e29b-41d4-a716-446655440000',
              url: 'https://portal.university.edu/login',
              title: 'Portal Login',
              pinned: false,
              index: 0,
              localTabId: 401,
            },
          ],
        },
      ],
    };

    const remoteStateWithChanges: SyncPayload = {
      client_id: 'laptop-linux-01',
      updated_at: 1773329000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: '550e8400-e29b-41d4-a716-446655440000',
              url: 'https://portal.university.edu/dashboard',
              title: 'Portal Dashboard',
              pinned: true,
              index: 0,
            },
          ],
        },
      ],
    };

    const plan = reconcile(localState, remoteStateWithChanges);

    expect(plan.tabsToUpdate).toEqual([
      {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        localTabId: 401,
        url: 'https://portal.university.edu/dashboard',
        title: 'Portal Dashboard',
        pinned: true,
        workspaceId: undefined,
      },
    ]);
  });

  it('Scenario 6: Tab moved between workspaces', () => {
    const localState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773328000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: 'tab-shared-01',
              url: 'https://github.com',
              title: 'GitHub',
              pinned: false,
              index: 0,
              localTabId: 501,
            },
          ],
        },
        {
          id: 'work',
          name: 'Work',
          tabs: [],
        },
      ],
    };

    const remoteMovedState: SyncPayload = {
      client_id: 'laptop-linux-01',
      updated_at: 1773329000,
      active_workspace_id: 'work',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [],
        },
        {
          id: 'work',
          name: 'Work',
          tabs: [
            {
              uuid: 'tab-shared-01',
              url: 'https://github.com',
              title: 'GitHub',
              pinned: false,
              index: 0,
            },
          ],
        },
      ],
    };

    const plan = reconcile(localState, remoteMovedState);

    expect(plan.tabsToUpdate).toEqual([
      {
        uuid: 'tab-shared-01',
        localTabId: 501,
        url: undefined,
        title: undefined,
        pinned: undefined,
        workspaceId: 'work',
      },
    ]);
    expect(plan.tabsToCreate).toHaveLength(0);
    expect(plan.tabsToClose).toHaveLength(0);
  });

  it('Scenario 7: Concurrent workspace additions without data corruption', () => {
    const localWithDevWorkspace: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773329000,
      active_workspace_id: 'dev',
      workspaces: [
        {
          id: 'dev',
          name: 'Development',
          tabs: [
            {
              uuid: 'dev-tab-01',
              url: 'https://localhost:3000',
              title: 'Local Dev',
              pinned: false,
              index: 0,
              localTabId: 601,
            },
          ],
        },
      ],
    };

    const plan = reconcile(localWithDevWorkspace, baseRemoteState);

    // Both remote workspaces should be planned for creation
    expect(plan.workspacesToCreate).toEqual([
      { id: 'uni', name: 'University' },
      { id: 'hacking-p1', name: 'Hacking Project 1' },
    ]);
    // Local dev workspace not in remote is planned for removal
    expect(plan.workspacesToRemove).toEqual([{ id: 'dev' }]);
    // Remote tabs planned for creation
    expect(plan.tabsToCreate).toHaveLength(2);
    // Local tab planned for removal
    expect(plan.tabsToClose).toHaveLength(1);
    expect(plan.tabsToClose[0].uuid).toBe('dev-tab-01');
  });

  it('Scenario 8: Preserves local state when remote is completely uninitialized', () => {
    const localState: SyncPayload = {
      client_id: 'desktop-fedora-02',
      updated_at: 1773328000,
      active_workspace_id: 'uni',
      workspaces: [
        {
          id: 'uni',
          name: 'University',
          tabs: [
            {
              uuid: 'tab-1',
              url: 'https://example.com',
              title: 'Example',
              pinned: false,
              index: 0,
              localTabId: 701,
            },
          ],
        },
      ],
    };

    const uninitializedRemote: SyncPayload = {
      client_id: '',
      updated_at: 0,
      active_workspace_id: '',
      workspaces: [],
    };

    const plan = reconcile(localState, uninitializedRemote);
    expect(plan.tabsToCreate).toHaveLength(0);
    expect(plan.tabsToClose).toHaveLength(0);
    expect(plan.tabsToUpdate).toHaveLength(0);
  });
});
