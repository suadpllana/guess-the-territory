# Map Pop — Guess the Country!

A Google-Maps-style geography game for [Poki](https://developers.poki.com). The map flies to a country, a little pin mascot drops on it, and you pick its name. It opens with your own country and Poki's biggest audiences, then adapts to what you know.

![Map Pop](store/logo-tagline.png)

- **One rule, five ways to play:** classic, pick the shape, find it on the map, silhouette, and a 20-second blitz bonus. After that it's an endless ladder of mixed and boss levels.
- **Built for playtime:** you're in the game from the first frame, with your home country as a guaranteed first win within seconds. A new mode arrives every level (~40 s). You get 3 hearts per level; losing all 3 is game over and the next run starts again at level 1 (a rewarded ad can continue the run in the ads build). There are run scores with a saved best, streak multipliers, an atlas of countries to collect, and map styles to unlock.
- **Worldwide:** country names appear in the player's own language through the browser (`Intl.DisplayNames`), and the UI is in 24 languages. Borders follow the player's own country's view where it is disputed (India, Pakistan, China, Morocco, Argentina, Turkey and others).
- **Poki-ready:** `index.html` + one JS + one CSS, about **250 KB zipped**. There are no external requests except the Poki SDK, and every item on the SDK checklist is covered (see below).

---

## Deploy to Poki (what you need to do)

Ready-made zips for this version are already in [`release/`](release/): `map-pop-1.0.0-679eb04.zip` (ads off, for the Player Fit Test) and `map-pop-1.0.0-679eb04-ads.zip` (ads on, for release). To rebuild after changes:

```bash
npm install
npm run poki        # Player Fit Test build: ads OFF  -> release/map-pop-1.0.0-<commit>.zip
npm run poki:ads    # Release build: ads ON         -> release/map-pop-1.0.0-<commit>-ads.zip
```

1. **Upload** the zip from `release/` in Poki for Developers. `index.html` is already at the zip root, and all paths are relative.
2. **Orientation:** the game supports **both portrait and landscape** on mobile, so select both.
3. **Thumbnail:** upload `store/thumbnail-1080.png`. It is square and has no text, as Poki recommends. `store/thumbnail-1080-correct.png` is an alternative, and 628/512 px versions are in `store/`.
4. **Animated thumbnail** (needed for global release): `store/thumbnail.mp4`, 1080×1080 H.264, 4 s.
5. **Logo** (if asked): `store/logo.png` or `store/logo-tagline.png` (transparent PNG).
6. Watch at least 10 playtest recordings, then request the **Player Fit Test** with no audience filter and all devices. Use the ads-off build (`npm run poki`) for fit tests.
7. **Tag every uploaded zip** so a test result maps to code. The zip script prints the command, for example `git tag poki-1.0.0-679eb04 && git push --tags`.
8. Before **global release**, switch to the ads build (`npm run poki:ads`). Nothing else changes: all ad call sites are already in place.

The build number (`v1.0.0-<commit>`) is shown small at the bottom of the pause menu.

### Suggested store text

> **Map Pop — Guess the Country!** The map flies somewhere on Earth, the pin drops… which country is it? Start with countries you know, then work your way up to the whole world: pick the shape, find countries on the map, beat the blitz and collect all 198 in your atlas. Fast, fun and a little bit educational.

---

## Poki checklist coverage

| Requirement | How Map Pop handles it |
|---|---|
| `index.html` at zip root, relative paths | Vite `base: './'`; `tools/zip.mjs` builds the zip and refuses sourcemaps/docs |
| No external requests except the SDK | Map data, audio (synthesised) and icons (inline SVG) are bundled; the zip script checks `index.html` |
| Small download | ~250 KB zipped in total (map data ~170 KB, flags ~32 KB) |
| `init` → `gameLoadingStart` → `gameLoadingFinished` | `src/poki.ts`; `init` has a 6 s timeout |
| `gameplayStart` on first input, never on load | Fired on the first pointer/key input, then kept in sync with pause, tab hidden, ads and overlays; guarded against double calls |
| `gameplayStop` before ads, on pause, menus, hidden tab | `Game.syncGameplay()` |
| Midrolls only at natural breaks, never before first fun | Between levels from level 4 on, and on game over once the run reached level 4; every ad has a timeout |
| Rewarded: video icon, not green, free option, no reward if blocked | 🎬 icon, orange button; "Try again" is always shown; hidden when the SDK is blocked or failed |
| Mute + block input during ads | `adStarted()` mutes the WebAudio master and shows an input blocker |
| Playable with SDK blocked | Every call no-ops; tested with the SDK unreachable |
| Game Events | `level NN start/complete/fail` (fail = died, so Poki's "left" means quit without dying), `game over level-NN`, `game restart level-NN`, `game input first`, `mode <id> first`, `hint token/rewarded used`, `reward continue granted`, `streak N reached`, `atlas N reached`, `unlock theme <id>`, `bonus blitz …`, `menu pause open` (no `/` or `^`, values ≤ 60 chars) |
| `captureError` | Global `error` / `unhandledrejection` handlers |
| Full screen, every aspect ratio | Canvas covers the screen; bottom sheet in portrait, side card in landscape; checked at 640×360, 836×470, 1031×580, 1280×720, 390×844, 844×390 |
| Poki pill (mobile, top-left) | HUD and prompt keep a 58 px gap on touch devices |
| Touch detection by primary pointer | touch AND NOT `(hover: hover) and (pointer: fine)`; switches on the first real touch |
| Block zoom / scroll / context menu | `touch-action: none`, `gesturestart`/`dblclick`/`contextmenu` prevented, Space/arrow scroll prevented |
| Pause (button + Esc/P) | Pause card with sound, music, map style, atlas, "Restart game" (asks to confirm; wipes progress but keeps sound settings) and build number |
| Tab hidden → pause, stop, mute | `visibilitychange` → pause card, `gameplayStop`, audio suspended |
| Audio after first gesture, toggles | WebAudio unlocked on first input; sound and music toggles are saved |
| `localStorage` in try/catch, stable key | `src/storage.ts`, key `mappop.v1` (keep it stable) |
| Performance on low-end phones | Canvas 2D with three levels of detail, per-country culling, the static layer redrawn only when the camera moves, DPR capped at 2 and stepped down on slow devices |

### Design rules from the playtime checklist

- **First 60 s:** the first frame is already moving (the world turns toward your home country). There is no title screen, and nothing can hurt you before your first input. The first question is your own country with obviously wrong options, answered with a big win moment: confetti, chime, "+150", "NEW".
- **Minutes 1–5:** each of the first four levels (~40 s each) introduces one new way to play with a one-second pictogram banner, and a blitz bonus follows level 3. Cards stay ≤ 1 s early on, the next level starts automatically, and progress dots always show what's left. Difficulty is capped per level, so the first real skill test comes around minute 3.
- **Tail:** endless mixed levels, boss levels every 5, blitz every 3, an atlas of 198 countries and five unlockable map styles. Adaptive difficulty targets roughly 80% success (checked with `npm run sim`: about 70% for novices, 80% for average players and 93% for experts), and missed countries come back a few rounds later.

### Question order

1. The **player's home country** first, detected offline from the time zone (then the browser language). No geo-IP request is made.
2. Then **Poki's largest audiences**, from 2026 traffic data: US, Brazil, Turkey, India, France, Vietnam, Germany, UK, Netherlands, Poland, Italy, Spain… (`src/game/countries.ts`).
3. Then adaptive questions around the player's skill, preferring countries not yet in their atlas.

---

## Development

```bash
npm run dev          # http://localhost:5173  (?home=BR&lang=pt to test a country/language, ?speed=3 to fast-forward in dev)
npm test             # SDK call order (mock SDK) + automated playthrough to level 5
npm run test:ads     # ads build: midroll timing, rewarded hint and continue
npm run shots        # screenshots at Poki's reference sizes -> tools/.cache/shots
npm run qa:countries # every quiz country as the game frames it -> tools/.cache/contact
npm run perf         # frame times under CPU throttling (RATE=6 by default)
npm run sim          # headless simulation of the adaptive difficulty (novice / average / expert players)
npm run thumbnail    # re-render store/ assets with the game's own renderer (needs ffmpeg with libx264 in PATH, or FFMPEG=/path/to/ffmpeg)
```

The browser tools use `playwright-core` with a local Chrome. Set `CHROME=/path/to/chrome` if it isn't found.

### Project layout

```
src/
  main.ts            boot, input, frame loop
  poki.ts            safe Poki SDK wrapper
  game/              game flow (levels, modes, scoring), question picker, country tiers, home detection
  map/               canvas renderer, camera flights, gestures, themes, mascot pin
  geo/world.ts       decodes the bundled geometry into Path2D, LODs, borders, hit testing
  ui/                DOM HUD, answer sheet, banners, cards, confetti, icons
  i18n.ts            UI strings (24 languages) + localized country names
  audio.ts           synthesised sound effects and music
  data/world.ts      generated map data (do not edit)
tools/
  geo/               map data pipeline (Natural Earth -> src/data/world.ts)
  test/              e2e, ads, screenshot and SDK tools
  thumbnail/         thumbnail, animated thumbnail and logo renderer
  zip.mjs            Poki zip packager
store/               thumbnails, animated thumbnail, logo
```

### Regenerating map data

Only needed if you change borders or detail. It needs Python 3 with `shapely`:

```bash
pip install shapely
npm run data        # downloads Natural Earth into tools/.cache, writes src/data/world.ts and src/data/tz.ts
```

`tools/geo/prepare.py` chooses borders (base edition, merged pieces, localized views). `tools/geo/build.mjs` builds a shared-border topology and keeps just enough detail for the closest zoom each area is shown at (`EPS_VIEW`), then packs it as varints.

### Tuning

- Level plan and modes: `planFor()` in `src/game/game.ts`
- Difficulty tiers and Poki audience order: `src/game/countries.ts`
- Map styles and unlock counts: `src/map/themes.ts`
- Ads switch: the `ads` build mode (`src/config.ts`)

---

## Credits and licences

- Map data: [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0 countries and point-of-view editions (public domain).
- Flags: [country-flag-icons](https://gitlab.com/catamphetamine/country-flag-icons) (MIT), inlined as SVG.
- Time zone table: [countries-and-timezones](https://github.com/manuelmhtr/countries-and-timezones) (MIT).
- Logo fonts (used only to render `store/` images, not shipped in the game): Lilita One and Fredoka (SIL Open Font License).
- Code, pin mascot, sounds and store images were made for this project with AI assistance (Claude Code). All art is drawn procedurally by the game's own renderer; nothing comes from third-party image or sound libraries.
