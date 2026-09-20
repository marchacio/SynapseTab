import { describe, it, expect } from 'vitest';
import { M3DarkScheme, M3ShapeTokens, M3ElevationTokens } from './tokens.js';

describe('Material 3 Design Tokens', () => {
  it('defines valid surface and tonal container colors', () => {
    expect(M3DarkScheme.surface).toBe('#131318');
    expect(M3DarkScheme.surfaceContainer).toBe('#1f1f25');
    expect(M3DarkScheme.surfaceContainerHigh).toBe('#2a292f');
    expect(M3DarkScheme.onSurface).toBe('#e4e1e9');
    expect(M3DarkScheme.onSurfaceVariant).toBe('#c8c5d0');
  });

  it('defines primary, secondary, and tertiary palettes', () => {
    expect(M3DarkScheme.primary).toBe('#d0bcff');
    expect(M3DarkScheme.onPrimary).toBe('#381e72');
    expect(M3DarkScheme.secondaryContainer).toBe('#4a4458');
    expect(M3DarkScheme.tertiary).toBe('#7cd1ff');
  });

  it('defines semantic status colors', () => {
    expect(M3DarkScheme.error).toBe('#ffb4ab');
    expect(M3DarkScheme.success).toBe('#7bd88f');
    expect(M3DarkScheme.warning).toBe('#ffba28');
  });

  it('defines standard M3 corner radii and shape tokens', () => {
    expect(M3ShapeTokens.sm).toBe('8px');
    expect(M3ShapeTokens.md).toBe('12px');
    expect(M3ShapeTokens.lg).toBe('16px');
    expect(M3ShapeTokens.xl).toBe('28px');
    expect(M3ShapeTokens.full).toBe('9999px');
  });

  it('defines elevation shadow levels', () => {
    expect(M3ElevationTokens.level0).toBe('none');
    expect(M3ElevationTokens.level1).toContain('rgba(0, 0, 0, 0.25)');
    expect(M3ElevationTokens.level3).toContain('rgba(0, 0, 0, 0.25)');
  });
});
