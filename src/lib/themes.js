// Ready-made looks. A theme is a partial settings patch, nothing more, so
// picking one is the same as moving every slider yourself and you can keep
// tweaking afterwards.
//
// A theme never touches your wallpaper image. Its `background` only applies
// when the wallpaper is set to a plain colour, which the settings panel says
// on the card.

export const THEMES = [
  {
    id: "classic",
    name: "Classic",
    hint: "The familiar 6 x 3 arrangement",
    background: { color: "#1b2030", gradient: "linear-gradient(160deg,#232a3d 0%,#141824 100%)" },
    patch: {
      layout: { row: 3, col: 6, rowGap: 0.4, colGap: 0.3 },
      icon: { scale: 0.5, radius: 0.25, opacity: 1, shadow: false, hideName: false, fontSize: 15 },
      search: { show: true, scale: 0.82, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "compact",
    name: "Compact",
    hint: "8 x 4. More shortcuts on screen",
    background: { color: "#171a21", gradient: "linear-gradient(160deg,#20242e 0%,#101317 100%)" },
    patch: {
      layout: { row: 4, col: 8, rowGap: 0.35, colGap: 0.28 },
      icon: { scale: 0.46, radius: 0.22, opacity: 1, shadow: false, hideName: false, fontSize: 12 },
      search: { show: true, scale: 0.7, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "spotlight",
    name: "Spotlight",
    hint: "4 x 2. Large tiles for the few you really use",
    background: { color: "#20142b", gradient: "linear-gradient(160deg,#33204a 0%,#150d1f 100%)" },
    patch: {
      layout: { row: 2, col: 4, rowGap: 0.5, colGap: 0.4 },
      icon: { scale: 0.72, radius: 0.3, opacity: 1, shadow: true, hideName: false, fontSize: 17 },
      search: { show: true, scale: 0.9, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "minimal",
    name: "Minimal",
    hint: "Circles, no names, no search bar",
    background: { color: "#101215", gradient: "linear-gradient(180deg,#16191d 0%,#0b0d0f 100%)" },
    patch: {
      layout: { row: 2, col: 5, rowGap: 0.55, colGap: 0.45 },
      icon: { scale: 0.56, radius: 0.5, opacity: 0.94, shadow: false, hideName: true, fontSize: 13 },
      search: { show: false, scale: 0.82, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "dock",
    name: "Dock",
    hint: "A single row of 9, like a taskbar",
    background: { color: "#0f1b26", gradient: "linear-gradient(180deg,#15293a 0%,#0a1119 100%)" },
    patch: {
      layout: { row: 1, col: 9, rowGap: 0.3, colGap: 0.32 },
      icon: { scale: 0.62, radius: 0.28, opacity: 1, shadow: true, hideName: false, fontSize: 13 },
      search: { show: true, scale: 0.86, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "wall",
    name: "Wall",
    hint: "10 x 5. Everything at once, names off",
    background: { color: "#141414", gradient: "linear-gradient(160deg,#1e1e1e 0%,#0c0c0c 100%)" },
    patch: {
      layout: { row: 5, col: 10, rowGap: 0.3, colGap: 0.25 },
      icon: { scale: 0.44, radius: 0.18, opacity: 1, shadow: false, hideName: true, fontSize: 11 },
      search: { show: true, scale: 0.62, radius: 0.3, opacity: 0.9 },
      behavior: { mainRatio: 1 }
    }
  },
  {
    id: "paper",
    name: "Paper",
    hint: "Light background with dark labels",
    background: { color: "#eceef2", gradient: "linear-gradient(160deg,#f6f7f9 0%,#dfe3ea 100%)" },
    patch: {
      layout: { row: 3, col: 6, rowGap: 0.42, colGap: 0.32 },
      icon: {
        scale: 0.5,
        radius: 0.26,
        opacity: 1,
        shadow: true,
        hideName: false,
        fontSize: 14,
        fontColor: "#2b3038",
        fontShadow: false
      },
      search: { show: true, scale: 0.82, radius: 0.5, opacity: 1 },
      behavior: { mainRatio: 1 }
    }
  }
];

/**
 * Applies a theme onto a settings object, in place.
 * `background` only lands when the wallpaper is a plain colour, so nobody's
 * photo gets thrown away by picking a layout.
 */
export function applyTheme(settings, theme) {
  for (const [group, values] of Object.entries(theme.patch)) {
    Object.assign(settings[group], values);
  }
  // themes that do not say otherwise get the readable default label colour back
  if (!("fontColor" in theme.patch.icon)) settings.icon.fontColor = "#ffffff";
  if (!("fontShadow" in theme.patch.icon)) settings.icon.fontShadow = true;

  if (settings.wallpaper.kind === "color") {
    settings.wallpaper.color = theme.background.color;
    settings.wallpaper.gradient = theme.background.gradient || null;
  }
  settings.themeId = theme.id;
  return settings;
}

/** Which theme the current settings look like, if any. */
export function matchTheme(settings) {
  return (
    THEMES.find((t) => t.id === settings.themeId) ||
    THEMES.find(
      (t) =>
        t.patch.layout.row === settings.layout.row &&
        t.patch.layout.col === settings.layout.col &&
        t.patch.icon.hideName === settings.icon.hideName
    ) ||
    null
  );
}
