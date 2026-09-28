import { StoredWorkspace, WorkspaceManager } from './workspaces.js';

/**
 * Computes perceived luminance for a given CSS color string (0 = darkest, 255 = brightest).
 */
export function getPerceivedBrightness(colorStr?: string): number {
  if (!colorStr) return 128;
  const c = colorStr.toLowerCase().trim();

  // 1. HSL / HSLA
  const hslMatch = c.match(/hsla?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)%\s*,\s*([+-]?\d+(?:\.\d+)?)%/);
  if (hslMatch) {
    let h = parseFloat(hslMatch[1]) % 360;
    if (h < 0) h += 360;
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    const [r, g, b] = hslToRgb(h, s, l);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2. RGB / RGBA
  const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 3. Hex
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
        return 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }
  }

  if (c === 'black') return 0;
  if (c === 'white') return 255;
  if (c === 'yellow' || c === 'gold') return 220;
  return 128;
}

/**
 * Converts HSL values to RGB tuple in 0-255 range.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Determines whether text on a background color should be dark or white for optimal contrast.
 */
export function getContrastingTextColor(bgColor?: string): string {
  return getPerceivedBrightness(bgColor) > 140 ? '#131318' : '#ffffff';
}

function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders a crisp workspace icon as ImageData for a given pixel dimension.
 */
export function renderWorkspaceIcon(ws: StoredWorkspace, size: number): ImageData | null {
  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  const customType = ws.customType || (ws.icon ? 'emoji' : ws.color ? 'color' : 'default');
  const color = ws.color || '#d0bcff';

  if (customType === 'emoji') {
    const emoji = ws.customValue || ws.icon || '🚀';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(size * 0.82)}px sans-serif`;
    ctx.fillText(emoji, size / 2, size / 2 + Math.floor(size * 0.05));
  } else if (customType === 'text') {
    const tag = (ws.customValue || ws.name.slice(0, 3) || 'WS').slice(0, 3).toUpperCase();
    ctx.fillStyle = color;
    const radius = Math.floor(size * 0.25);
    drawRoundedRect(ctx, 1, 1, size - 2, size - 2, radius);
    ctx.fill();

    ctx.fillStyle = getContrastingTextColor(color);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = tag.length > 2 ? Math.floor(size * 0.42) : Math.floor(size * 0.52);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(tag, size / 2, size / 2 + Math.floor(size * 0.04));
  } else if (customType === 'color') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    if (ws.icon) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(size * 0.55)}px sans-serif`;
      ctx.fillText(ws.icon, size / 2, size / 2 + Math.floor(size * 0.05));
    }
  } else {
    // Default
    if (ws.icon) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(size * 0.82)}px sans-serif`;
      ctx.fillText(ws.icon, size / 2, size / 2 + Math.floor(size * 0.05));
    } else if (ws.color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Updates the extension toolbar action icon and title to reflect the active workspace.
 */
export async function updateActionIcon(targetWorkspace?: StoredWorkspace): Promise<void> {
  try {
    let ws = targetWorkspace;
    if (!ws) {
      const activeWsId = await WorkspaceManager.getActiveWorkspaceId();
      const storedWorkspaces = await WorkspaceManager.getStoredWorkspaces();
      ws = storedWorkspaces.find((w) => w.id === activeWsId) || storedWorkspaces[0];
    }

    if (!ws) {
      await browser.action.setIcon({
        path: {
          '16': 'icons/icon-16.png',
          '32': 'icons/icon-32.png',
        },
      });
      await browser.action.setTitle({ title: 'SynapseTab Workspaces' });
      return;
    }

    await browser.action.setTitle({ title: `SynapseTab - ${ws.name}` });

    const customType = ws.customType || (ws.icon ? 'emoji' : ws.color ? 'color' : 'default');

    if (customType === 'default' && !ws.icon && !ws.color) {
      await browser.action.setIcon({
        path: {
          '16': 'icons/icon-16.png',
          '32': 'icons/icon-32.png',
        },
      });
      return;
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      const img16 = renderWorkspaceIcon(ws, 16);
      const img32 = renderWorkspaceIcon(ws, 32);

      if (img16 && img32) {
        await browser.action.setIcon({
          imageData: {
            16: img16,
            32: img32,
          },
        });
      }
    }
  } catch (err) {
    console.warn('[SynapseTab] Failed to update action icon:', err);
  }
}
