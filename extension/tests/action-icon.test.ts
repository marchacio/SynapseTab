import { describe, it, expect } from 'vitest';
import {
  getPerceivedBrightness,
  getContrastingTextColor,
  hslToRgb,
  renderWorkspaceIcon,
} from '../src/action-icon.js';
import { StoredWorkspace } from '../src/workspaces.js';

describe('Action Icon Unit Tests', () => {
  describe('hslToRgb', () => {
    it('converts pure red, green, blue correctly', () => {
      expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
      expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]);
      expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]);
    });
  });

  describe('getPerceivedBrightness', () => {
    it('computes high brightness for white, yellow, and light pastels', () => {
      expect(getPerceivedBrightness('#ffffff')).toBeGreaterThan(200);
      expect(getPerceivedBrightness('white')).toBe(255);
      expect(getPerceivedBrightness('hsla(50, 100%, 50%, 1)')).toBeGreaterThan(140);
      expect(getPerceivedBrightness('#ffff00')).toBeGreaterThan(140);
    });

    it('computes low brightness for black and dark colors', () => {
      expect(getPerceivedBrightness('#000000')).toBe(0);
      expect(getPerceivedBrightness('black')).toBe(0);
      expect(getPerceivedBrightness('#0000ff')).toBeLessThan(100);
      expect(getPerceivedBrightness('hsla(0, 100%, 20%, 1)')).toBeLessThan(100);
    });
  });

  describe('getContrastingTextColor', () => {
    it('returns dark text for bright backgrounds', () => {
      expect(getContrastingTextColor('#ffffff')).toBe('#131318');
      expect(getContrastingTextColor('hsla(50, 100%, 50%, 1)')).toBe('#131318');
      expect(getContrastingTextColor('#ffff00')).toBe('#131318');
    });

    it('returns white text for dark backgrounds', () => {
      expect(getContrastingTextColor('#000000')).toBe('#ffffff');
      expect(getContrastingTextColor('#0000ff')).toBe('#ffffff');
      expect(getContrastingTextColor('black')).toBe('#ffffff');
    });
  });

  describe('renderWorkspaceIcon', () => {
    it('returns null safely in environments without OffscreenCanvas (Node.js)', () => {
      const ws: StoredWorkspace = {
        id: 'ws-1',
        name: 'Spots',
        customType: 'color',
        color: '#0000ff',
      };
      // In node test environment without OffscreenCanvas polyfill, it gracefully returns null
      expect(renderWorkspaceIcon(ws, 16)).toBeNull();
    });
  });
});
