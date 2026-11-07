/** Theme preference shared by the server (root layout) and the client toggle. Owner: M1 + M10. */
export const THEME_COOKIE = 'sd_theme';
export const SIDEBAR_COOKIE = 'sd_sidebar';
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? '') ? (value as Theme) : 'system';
}

/** Client-only: persist a preference cookie for a year. */
export function writePreferenceCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Client-only: switch theme now and remember it. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  writePreferenceCookie(THEME_COOKIE, theme);
}
