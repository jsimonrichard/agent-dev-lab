# Brand assets

| File | Use |
| --- | --- |
| `logo.svg` | Icon-only mark. Favicon, sidebar brand tile, small badges. |
| `logo-lockup.svg` | Icon + wordmark ("Agent Dev Lab"), horizontal. README hero, anywhere the name needs to read on its own. |

## Mark

Three staggered rounded bars, not a node/graph glyph. It echoes the inspection UI's own **waterfall** trace view (nested steps and agent episodes rendered as cascading bars) — an honest picture of the observability layer. A connected-nodes icon was considered and rejected: ADL's whole pitch is plain TypeScript orchestration with no workflow graph DSL, and a graph-styled mark would visually imply the opposite.

Palette: `#4F46E5` → `#6366F1` → `#A5B4FC` (indigo, darkest to lightest, top bar to bottom).

## Wordmark typeface

Set in **[Blue Highway](https://typodermicfonts.com/)** Bold by Ray Larabie — released [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain, no attribution required; credited here anyway). A humanist road-sign gothic: legible at small sizes by design, which is the same job a README badge or a browser tab icon has to do.

`logo-lockup.svg` has the wordmark already converted to vector outlines, so it renders correctly anywhere (GitHub, npm, browsers) without the font needing to be installed. If you need to re-set the text — a new tagline, a different weight — the font itself isn't vendored in this repo; re-download it from [typodermicfonts.com](https://typodermicfonts.com/) (search "Blue Highway"), set the text, then convert to outlines again (e.g. Inkscape: select all → Path → Object to Path) before committing the SVG.

## Embedding in a README

Reference these files by raw GitHub URL, not a relative path — npm's README renderer has no access to the repo tree, only the published package contents:

```md
<img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo-lockup.svg" alt="Agent Dev Lab" height="56" />
```

`logo.svg`'s three fills read fine on any background, light or dark, with no adaptation needed. `logo-lockup.svg` additionally carries a `prefers-color-scheme: dark` rule for the wordmark color (near-black by default, off-white in dark mode) — that still applies when embedded via `<img>`, since the browser evaluates the media query on the fetched SVG document itself.
