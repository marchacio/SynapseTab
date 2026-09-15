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
