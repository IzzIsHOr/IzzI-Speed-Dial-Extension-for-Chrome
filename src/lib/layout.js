// Grid geometry, ported 1:1 from Infinity New Tab (11.0.41, minified bundle).
// The names are rewritten; the magic constants are theirs exactly, so sizes and
// spacing land identically at any resolution.

/**
 * Search bar size plus the page's usable area.
 * Originally the `i`/`o` function in their layout chunk.
 */
export function computeSearchBox({
  searchScale,
  innerWidth,
  innerHeight,
  miniMode = false,
  topBarHeight = 0,
  mainRatio = 1
}) {
  const contentH = innerHeight - topBarHeight;
  const contentW = innerWidth - 0.2 * innerWidth; // 80% of the width

  // the 16:9 "stage" inscribed in the window
  let stageW = innerWidth;
  let stageH = (9 * stageW) / 16;
  if (stageH > contentH) {
    stageH = contentH;
    stageW = (16 * stageH) / 9;
  }

  // reference width for the search bar: tapers between 1200px and 1920px
  const refW = stageW * (0.575 - (0.1818 * Math.max(Math.min(720, stageW - 1200), 0)) / 720);

  const raw = {
    width: refW * searchScale,
    height:
      stageH *
      (0.0963 - (0.0296 * Math.max(Math.min(405, stageH - 675), 0)) / 405) *
      searchScale
  };

  // do not spill outside the usable area
  if (raw.width > contentW) {
    raw.height = (contentW / raw.width) * raw.height;
    raw.width = contentW;
  }

  const scaled = { width: raw.width * mainRatio, height: raw.height * mainRatio };

  const topFactor = miniMode ? -0.3 : -0.06;
  const ratio = (raw.width / refW) * mainRatio;

  return {
    width: Math.floor(scaled.width) + "px",
    height: Math.floor(scaled.height) + "px",
    searchRatio: Number((scaled.width / 625).toFixed(2)),
    marginTop: Math.floor(topFactor * contentH * ratio) + "px",
    marginBottom: Math.floor(0.775 * scaled.height) + "px",
    contentWidth: contentW,
    contentHeight: contentH,
    raw
  };
}

/**
 * Icon size and the box that holds them.
 * Originally the `o` function in the same chunk.
 */
export function computeIconBox(
  { row, col, rowGap, colGap, iconScale, innerWidth, mainRatio = 1, fontSize },
  searchBox
) {
  // the narrow/wide screen compensation is clamped to 1200..1920
  let clampedW = innerWidth;
  if (clampedW < 1200) clampedW = 1200;
  else if (clampedW > 1920) clampedW = 1920;

  const availW = searchBox.contentWidth;
  const availH = 0.8 * searchBox.contentHeight - 2.451 * searchBox.raw.height;
  const comp = 1 + (0.5 * (1920 - clampedW)) / 720;

  const cellW = availW / col;
  const cellH = availH / row;
  const cell = Math.min(Math.min(cellW, cellH) * iconScale * comp, cellW, cellH);

  const rowGapHalf = (((availH - row * cell) / row) * rowGap) / 2;
  const totalW = col * (cell + 2 * (((availW - col * cell) / col) * colGap) / 2);

  let boxW = Math.min(Math.ceil(totalW * mainRatio), innerWidth);
  let boxH = row * (cell + 2 * rowGapHalf) * mainRatio;

  const cellScaled = cell * mainRatio;
  const nameH = 1.3 * Math.max(fontSize * mainRatio, 12) + 0.9 * cellScaled * 0.08;
  const minCell = 1.2 * (25 + nameH);

  if (boxW < col * minCell) boxW = col * minCell;
  if (boxH < row * minCell) boxH = row * minCell;

  let iconW = 0.9 * cellScaled - nameH - 1;
  if (iconW < 25) iconW = 25;

  return {
    width: Math.floor(iconW) + "px",
    miniIconPadding: Math.floor(iconW / 7 + 4) + "px",
    boxWidth: Math.ceil(boxW) + "px",
    boxHeight: Math.floor(boxH) + "px",
    iconOneHeight: Math.floor(boxH / row) + "px",
    iconRatio: Number((iconW / 106).toFixed(2)),
    iconsMargin: Math.floor(0.1 * innerWidth * mainRatio) + "px",
    iconWidthPx: Math.floor(iconW)
  };
}

/**
 * Applies the results as CSS custom properties on <html>.
 * Same variable names as Infinity uses, so the styles stay interchangeable.
 */
export function applyLayout(settings, win = window) {
  const { layout, icon, search, behavior, wallpaper } = settings;

  const searchBox = computeSearchBox({
    searchScale: search.scale,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    miniMode: !search.show,
    topBarHeight: 0,
    mainRatio: behavior.mainRatio
  });

  const iconBox = computeIconBox(
    {
      row: layout.row,
      col: layout.col,
      rowGap: layout.rowGap,
      colGap: layout.colGap,
      iconScale: icon.scale,
      innerWidth: win.innerWidth,
      mainRatio: behavior.mainRatio,
      fontSize: icon.fontSize
    },
    searchBox
  );

  const vars = {
    "--search-width": searchBox.width,
    "--search-height": searchBox.height,
    "--search-ratio": String(searchBox.searchRatio),
    "--search-margin-top": searchBox.marginTop,
    "--search-margin-bottom": searchBox.marginBottom,
    "--search-radius": String(search.radius),
    "--search-opacity": String(search.opacity),
    "--search-btn-bgcolor": search.btnColor,

    "--icon-box-width": iconBox.boxWidth,
    "--icon-box-height": iconBox.boxHeight,
    "--icon-one-height": iconBox.iconOneHeight,
    "--icon-width": iconBox.width,
    "--mini-icon-padding": iconBox.miniIconPadding,
    "--icon-ratio": String(iconBox.iconRatio),
    "--icons-margin": iconBox.iconsMargin,
    "--icon-row": String(layout.row),
    "--icon-col": String(layout.col),
    "--icon-radius": `calc(var(--icon-width) * ${icon.radius})`,
    "--icon-opacity": String(icon.opacity),
    "--icon-font-size": Math.max(icon.fontSize * behavior.mainRatio, 10) + "px",
    "--icon-font-color": icon.fontColor,
    "--icon-visible": icon.hideName ? "hidden" : "visible",
    "--icon-padding-top": "0px",

    "--wallpaper-filter": (wallpaper.blur || 0) + "px",
    "--wallpaper-alpha": String(wallpaper.mask),
    "--top-bar-height": "0px"
  };

  const root = win.document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

  return { searchBox, iconBox };
}
