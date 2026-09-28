/**
 * Android Material 3 (Material You) Design Tokens & Constants
 * SynapseTab
 */

export interface M3ColorScheme {
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;
}

export const M3DarkScheme: M3ColorScheme = {
  surface: '#131318',
  surfaceDim: '#131318',
  surfaceBright: '#39383f',
  surfaceContainerLowest: '#0e0e13',
  surfaceContainerLow: '#1b1b20',
  surfaceContainer: '#1f1f25',
  surfaceContainerHigh: '#2a292f',
  surfaceContainerHighest: '#35343a',
  onSurface: '#e4e1e9',
  onSurfaceVariant: '#c8c5d0',
  outline: '#918f9a',
  outlineVariant: '#47464f',
  primary: '#d0bcff',
  onPrimary: '#381e72',
  primaryContainer: '#4f378b',
  onPrimaryContainer: '#eaddff',
  secondary: '#cbc2db',
  onSecondary: '#332d41',
  secondaryContainer: '#4a4458',
  onSecondaryContainer: '#e8def8',
  tertiary: '#7cd1ff',
  onTertiary: '#003548',
  tertiaryContainer: '#004d67',
  onTertiaryContainer: '#c4e8ff',
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  success: '#7bd88f',
  onSuccess: '#003914',
  successContainer: '#005322',
  onSuccessContainer: '#97f5a9',
  warning: '#ffba28',
  onWarning: '#422c00',
  warningContainer: '#5f4100',
  onWarningContainer: '#ffdf9e',
};

export const M3ShapeTokens = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '28px',
  full: '9999px',
} as const;

export const M3ElevationTokens = {
  level0: 'none',
  level1: '0px 1px 3px 1px rgba(0, 0, 0, 0.25), 0px 1px 2px 0px rgba(0, 0, 0, 0.40)',
  level2: '0px 2px 6px 2px rgba(0, 0, 0, 0.25), 0px 1px 2px 0px rgba(0, 0, 0, 0.40)',
  level3: '0px 4px 8px 3px rgba(0, 0, 0, 0.25), 0px 1px 3px 0px rgba(0, 0, 0, 0.40)',
  level4: '0px 6px 10px 4px rgba(0, 0, 0, 0.25), 0px 2px 3px 0px rgba(0, 0, 0, 0.40)',
  level5: '0px 8px 12px 6px rgba(0, 0, 0, 0.25), 0px 4px 4px 0px rgba(0, 0, 0, 0.40)',
} as const;

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  gold: [255, 215, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  lime: [0, 255, 0],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  silver: [192, 192, 192],
  brown: [165, 42, 42],
  coral: [255, 127, 80],
  crimson: [220, 20, 60],
  indigo: [75, 0, 130],
  violet: [238, 130, 238],
  khaki: [240, 230, 140],
  salmon: [250, 128, 114],
  turquoise: [64, 224, 208],
};

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

  // 4. Named colors
  if (c in NAMED_COLORS) {
    const [r, g, b] = NAMED_COLORS[c];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return 128;
}

/**
 * Determines whether text on a background color should be dark or white for optimal contrast.
 */
export function getContrastingTextColor(bgColor?: string): string {
  return getPerceivedBrightness(bgColor) > 140 ? '#131318' : '#ffffff';
}


