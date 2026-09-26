import { createContext, useContext, useEffect, useState } from 'react';
import { matchPath, useLocation } from 'react-router';
import { ARCHIVIUM_URL } from './App';

// Archivium's themes, applied here the same way: a user's preferred theme, overridden
// on a premium universe's pages by the universe's own. See archivium src/themes.ts,
// src/middleware/theme.ts, the universe override in src/views/index.ts, and
// templates/theme.pug (the CSS below).

export type Theme = {
  // Truthy when the page sits on a frosted-glass pane. Custom themes store the form's
  // checkbox value ("on"), so like Archivium this goes by truthiness.
  glass?: boolean | string,
  background?: string,
  backgroundImage?: string,
};

// ============================================================================
// TODO: fetch this list from Archivium's API as soon as it serves one, instead of
// hardcoding it. Until then it's a copy of archivium src/themes.ts, and any theme
// added there must be copied here by hand (unknown ones fall back like Archivium's
// do: a universe's to the user's theme, a user's to the default).
// ============================================================================
const THEMES: Record<string, Theme> = {
  default: {
    glass: false,
  },
  glass: {
    glass: true,
    background: 'radial-gradient(circle, light-dark(#d2dbe5, #484f57) 0%, light-dark(#718ea7, #23384b) 100%) 0 0',
  },
  space: {
    glass: true,
    backgroundImage: '/static/assets/themes/space.jpg',
  },
  custom: {
    glass: false,
  },
};

// Archivium's universe tier from which a universe's own theme applies (tiers.PREMIUM).
const PREMIUM_TIER = 1;

type ThemeUser = { preferred_theme?: string | null, custom_theme?: Theme | null } | null;
type ThemeUniverse = { tier?: number | null, obj_data?: unknown };

export function userTheme(user: ThemeUser): Theme {
  if (!user) return THEMES.default;
  const base = user.preferred_theme ? THEMES[user.preferred_theme] : null;
  return (user.preferred_theme === 'custom' ? user.custom_theme : base) ?? THEMES.default;
}

// Whether a campaign gets premium features, like its own theme.
export const isPremium = (universe: ThemeUniverse | null) => (universe?.tier ?? 0) >= PREMIUM_TIER;

export function campaignTheme(user: ThemeUser, universe: ThemeUniverse | null): Theme {
  const fallback = userTheme(user);
  if (!universe || !isPremium(universe)) return fallback;
  const objData = typeof universe.obj_data === 'string' ? JSON.parse(universe.obj_data) : universe.obj_data as Record<string, any> | undefined;
  const name = objData?.theme;
  if (name === 'custom') return objData?.customTheme ?? {};
  return THEMES[name] ?? fallback;
}

// Theme images given as paths are on Archivium's server.
const imageUrl = (url: string) => url.startsWith('/') ? `${ARCHIVIUM_URL}${url}` : url;

// The same rules as archivium templates/theme.pug.
function themeCss(theme: Theme): string {
  const rules: string[] = [];
  if (theme.glass) {
    rules.push('.error { margin-bottom: -1rem; }');
    if (theme.background || theme.backgroundImage) {
      rules.push('.card.item-type { backdrop-filter: blur(1rem); background-color: color-mix(in srgb, var(--page-color), transparent 38%); }');
    }
  }
  if (theme.background) rules.push(`header, body::before { background: ${theme.background}; }`);
  if (theme.backgroundImage) {
    rules.push(`header, body { background-image: url(${JSON.stringify(imageUrl(theme.backgroundImage))}); }`);
    if (!theme.glass) {
      rules.push('main { text-shadow: 0.0625rem 0.0625rem 0.125rem var(--sheet-color), 0 0 0.5rem var(--page-color), 0.0625rem 0 0.125rem var(--page-color); }');
      rules.push('.sheet { text-shadow: none; }');
    }
  }
  return rules.join('\n');
}

// Whether a theme puts anything behind the page, so it shows around the game room's map.
export const hasBackdrop = (theme: Theme) => Boolean(theme.background || theme.backgroundImage);

const ThemeContext = createContext<Theme>(THEMES.default);
export const useTheme = () => useContext(ThemeContext);

// A backdrop image a page puts in place of the theme's (the game room's map can have
// one), on a premium campaign's pages. It replaces the universe's and the user's
// theme alike, on glass like Archivium's image themes.
const BackdropContext = createContext<(url: string | null) => void>(() => {});
export function useBackdrop(url: string | null) {
  const setBackdrop = useContext(BackdropContext);
  useEffect(() => {
    setBackdrop(url);
    return () => setBackdrop(null);
  }, [setBackdrop, url]);
}

// Campaigns by shortname, fetched once for their themes (null if they can't be read).
const universes = new Map<string, Promise<ThemeUniverse | null>>();
function fetchUniverse(shortname: string): Promise<ThemeUniverse | null> {
  if (!universes.has(shortname)) {
    universes.set(shortname, fetch(`${ARCHIVIUM_URL}/api/universes/${shortname}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null));
  }
  return universes.get(shortname)!;
}

// Whether the campaign is premium; null until that's known.
export function usePremiumCampaign(shortname: string): boolean | null {
  const [premium, setPremium] = useState<{ shortname: string, premium: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchUniverse(shortname).then(universe => { if (!cancelled) setPremium({ shortname, premium: isPremium(universe) }); });
    return () => { cancelled = true; };
  }, [shortname]);
  return premium?.shortname === shortname ? premium.premium : null;
}

// Applies the theme for the current page: the campaign's, on a campaign's pages.
export function ThemeProvider({ user, children }: { user: ThemeUser, children: React.ReactNode }) {
  const { pathname } = useLocation();
  const campaign = matchPath('/campaigns/:campaignShortname/*', pathname)?.params.campaignShortname
    ?? matchPath('/campaigns/:campaignShortname', pathname)?.params.campaignShortname;
  const [universe, setUniverse] = useState<{ shortname: string, data: ThemeUniverse | null } | null>(null);
  const [backdrop, setBackdrop] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    fetchUniverse(campaign).then(data => { if (!cancelled) setUniverse({ shortname: campaign, data }); });
    return () => { cancelled = true; };
  }, [campaign]);

  const campaignData = campaign && universe?.shortname === campaign ? universe.data : null;
  const theme = !campaign ? userTheme(user)
    : backdrop && isPremium(campaignData) ? { glass: true, backgroundImage: backdrop }
      : campaignTheme(user, campaignData);

  return <ThemeContext.Provider value={theme}>
    <BackdropContext.Provider value={setBackdrop}>
      <style>{themeCss(theme)}</style>
      {children}
    </BackdropContext.Provider>
  </ThemeContext.Provider>;
}

// Archivium's .glass-pane look (40% see-through), with the see-through part and colour
// adjustable: the game room's map needs to be more solid to draw on, and its bars and
// drawers keep their own colours.
export function glass(color: string, transparency: number): React.CSSProperties {
  return {
    background: `color-mix(in srgb, ${color}, transparent ${transparency}%)`,
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  };
}

// How see-through the game room's glass is, in percent.
export const GLASS = {
  map: 15,
  bars: 25,
};
