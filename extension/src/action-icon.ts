import { StoredWorkspace, WorkspaceManager } from './workspaces.js';
import {
  hslToRgb,
  getPerceivedBrightness,
  getContrastingTextColor,
} from './theme/tokens.js';

export { hslToRgb, getPerceivedBrightness, getContrastingTextColor };


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
