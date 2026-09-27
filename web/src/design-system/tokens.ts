import type { LabelColor, Priority } from '@taskloom/contracts';

/**
 * Design tokens. Every color, spacing, radius, type, layer, and motion value used by the app
 * comes from here, through the MUI theme. Contrast ratios are against the scheme's paper color
 * and meet WCAG AA (4.5:1 for text, 3:1 for large text and UI).
 */

/** Teal primary, deep orange accent (Material palette), blue-grey neutrals. */
export const palette = {
  light: {
    primary: { main: '#00796B', light: '#4DB6AC', dark: '#004D40', contrastText: '#FFFFFF' },
    // Accent: sparse highlights only (badges, counts). Never a priority or status color.
    secondary: { main: '#C43E0F', light: '#FF8A65', dark: '#8C2A08', contrastText: '#FFFFFF' },
    error: { main: '#C62828' },
    warning: { main: '#B45309' },
    success: { main: '#2E7D32' },
    info: { main: '#1565C0' },
    background: { default: '#F5F7F8', paper: '#FFFFFF' },
    text: { primary: '#1F2A30', secondary: '#546E7A' },
    divider: '#DDE3E6',
  },
  dark: {
    primary: { main: '#4DB6AC', light: '#80CBC4', dark: '#00897B', contrastText: '#0B1F1C' },
    secondary: { main: '#FF8A65', light: '#FFAB91', dark: '#E64A19', contrastText: '#1F0D06' },
    error: { main: '#EF9A9A' },
    warning: { main: '#FBBF24' },
    success: { main: '#81C784' },
    info: { main: '#90CAF9' },
    background: { default: '#12171A', paper: '#1B2226' },
    text: { primary: '#E6EAEC', secondary: '#A7B4BA' },
    divider: '#2C363B',
  },
} as const;

/**
 * Priority colors: red, amber, blue, grey. Each chip also carries an icon and its name, so
 * color is never the only signal.
 */
export const priorityColor: Record<'light' | 'dark', Record<Priority, string>> = {
  light: { URGENT: '#C62828', HIGH: '#B45309', MEDIUM: '#1565C0', LOW: '#546E7A', NONE: '#5F7481' },
  dark: { URGENT: '#EF9A9A', HIGH: '#FBBF24', MEDIUM: '#90CAF9', LOW: '#B0BEC5', NONE: '#90A4AE' },
};

/** Label colors: readable text (over a faint tint of itself) for each scheme. */
export const labelColor: Record<LabelColor, { light: string; dark: string }> = {
  slate: { light: '#455A64', dark: '#B0BEC5' },
  red: { light: '#C62828', dark: '#EF9A9A' },
  orange: { light: '#BF360C', dark: '#FFAB91' },
  amber: { light: '#8A5A00', dark: '#FFD54F' },
  green: { light: '#1B5E20', dark: '#A5D6A7' },
  teal: { light: '#00695C', dark: '#80CBC4' },
  blue: { light: '#1565C0', dark: '#90CAF9' },
  indigo: { light: '#3949AB', dark: '#9FA8DA' },
  purple: { light: '#6A1B9A', dark: '#CE93D8' },
  pink: { light: '#AD1457', dark: '#F48FB1' },
};

/** 4 px base: theme.spacing(n) is n * 4 px. */
export const spacingUnit = 4;

export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;

export const fontFamily =
  '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Type scale in rem (16 px root). */
export const typeScale = {
  h1: { fontSize: '2rem', lineHeight: 1.25, fontWeight: 700 },
  h2: { fontSize: '1.5rem', lineHeight: 1.3, fontWeight: 700 },
  h3: { fontSize: '1.25rem', lineHeight: 1.35, fontWeight: 600 },
  h4: { fontSize: '1.125rem', lineHeight: 1.4, fontWeight: 600 },
  body1: { fontSize: '0.9375rem', lineHeight: 1.5 },
  body2: { fontSize: '0.875rem', lineHeight: 1.45 },
  caption: { fontSize: '0.75rem', lineHeight: 1.4 },
  button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' as const },
} as const;

/** Layers, lowest to highest. Matches MUI's own ordering so its components stack the same way. */
export const zIndex = { appBar: 1100, drawer: 1200, modal: 1300, snackbar: 1400, tooltip: 1500 };

/** Durations in ms. Components also honor prefers-reduced-motion (see theme). */
export const motion = {
  duration: { short: 120, standard: 200, complex: 300 },
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const breakpoints = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } as const;
