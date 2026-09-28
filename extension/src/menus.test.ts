import { describe, it, expect } from 'vitest';
import {
  getColorBullet,
  formatWorkspaceMenuTitle,
  isTabMovableToWorkspace,
  ROOT_MENU_ID,
  WORKSPACE_MENU_PREFIX,
} from './menus.js';
import { StoredWorkspace } from './workspaces.js';

describe('Menus Module Unit Tests', () => {
  describe('Constants', () => {
    it('defines expected root and prefix IDs', () => {
      expect(ROOT_MENU_ID).toBe('synapse-tab-move-root');
      expect(WORKSPACE_MENU_PREFIX).toBe('synapse-move-to-');
    });
  });

  describe('getColorBullet', () => {
    it('maps hex color codes to correct circle emojis', () => {
      expect(getColorBullet('#000000')).toBe('⚫');
      expect(getColorBullet('#0000ff')).toBe('🔵');
      expect(getColorBullet('#d0bcff')).toBe('🟣');
      expect(getColorBullet('#a8c7fa')).toBe('🔵');
      expect(getColorBullet('#7cd1ff')).toBe('🔵');
      expect(getColorBullet('#7bd88f')).toBe('🟢');
      expect(getColorBullet('#ffba28')).toBe('🟡');
      expect(getColorBullet('#ffb4ab')).toBe('🔴');
      expect(getColorBullet('#efb8c8')).toBe('🌸');
      expect(getColorBullet('#bec6dc')).toBe('⚪');
    });

    it('maps HSL / HSLA colors correctly', () => {
      expect(getColorBullet('hsla(50, 100%, 50%, 1)')).toBe('🟡');
      expect(getColorBullet('hsla(350, 100%, 50%, 1)')).toBe('🔴');
      expect(getColorBullet('hsla(0, 100%, 50%, 1)')).toBe('🔴');
      expect(getColorBullet('hsla(240, 100%, 50%, 1)')).toBe('🔵');
      expect(getColorBullet('hsla(300, 100%, 50%, 1)')).toBe('🟣');
      expect(getColorBullet('hsla(210, 100%, 50%, 1)')).toBe('🔵');
      expect(getColorBullet('hsla(170, 100%, 50%, 1)')).toBe('🟢');
      expect(getColorBullet('hsla(270, 100%, 50%, 1)')).toBe('🟣');
      expect(getColorBullet('hsla(30, 100%, 50%, 1)')).toBe('🟠');
      expect(getColorBullet('hsla(360, 100%, 50%, 1)')).toBe('🔴');
    });

    it('handles named colors and fallbacks', () => {
      expect(getColorBullet('black')).toBe('⚫');
      expect(getColorBullet('purple')).toBe('🟣');
      expect(getColorBullet('blue')).toBe('🔵');
      expect(getColorBullet('green')).toBe('🟢');
      expect(getColorBullet('yellow')).toBe('🟡');
      expect(getColorBullet('red')).toBe('🔴');
      expect(getColorBullet('pink')).toBe('🌸');
      expect(getColorBullet('gray')).toBe('⚪');
      expect(getColorBullet(undefined)).toBe('📁');
    });
  });

  describe('formatWorkspaceMenuTitle', () => {
    it('formats emoji workspace correctly', () => {
      const ws: StoredWorkspace = {
        id: 'ws-1',
        name: 'Spots',
        customType: 'emoji',
        customValue: '🔵',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('🔵 Spots');
    });

    it('formats text tag workspace correctly', () => {
      const ws: StoredWorkspace = {
        id: 'ws-2',
        name: 'Medium Stories',
        customType: 'text',
        customValue: 'ME',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('[ME] Medium Stories');
    });

    it('auto-generates text tag if customValue is missing', () => {
      const ws: StoredWorkspace = {
        id: 'ws-3',
        name: 'Development',
        customType: 'text',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('[DEV] Development');
    });

    it('formats color workspace with matching bullet', () => {
      const ws: StoredWorkspace = {
        id: 'ws-4',
        name: 'Work',
        customType: 'color',
        color: '#7bd88f',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('🟢 Work');
    });

    it('formats default workspace with folder icon', () => {
      const ws: StoredWorkspace = {
        id: 'default',
        name: 'Main',
        customType: 'default',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('📁 Main');
    });

    it('formats default workspace with custom icon if present', () => {
      const ws: StoredWorkspace = {
        id: 'ws-5',
        name: 'Nav',
        icon: '📌',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('📌 Nav');
    });

    it('formats workspace with both color and icon', () => {
      const ws: StoredWorkspace = {
        id: 'ws-nav',
        name: 'Nav',
        customType: 'color',
        color: '#000000',
        icon: '📌',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('⚫ 📌 Nav');
    });

    it('appends (current) when isCurrent is true', () => {
      const ws: StoredWorkspace = {
        id: 'default',
        name: 'Main',
        customType: 'default',
      };
      expect(formatWorkspaceMenuTitle(ws, true)).toBe('📁 Main (current)');
    });
  });

  describe('isTabMovableToWorkspace', () => {
    it('returns false for pinned tabs', () => {
      expect(isTabMovableToWorkspace({ pinned: true })).toBe(false);
    });

    it('returns true for normal unpinned tabs', () => {
      expect(isTabMovableToWorkspace({ pinned: false })).toBe(true);
      expect(isTabMovableToWorkspace({})).toBe(true);
    });

    it('returns false for null or undefined tab', () => {
      expect(isTabMovableToWorkspace(null)).toBe(false);
      expect(isTabMovableToWorkspace(undefined)).toBe(false);
    });
  });
});

