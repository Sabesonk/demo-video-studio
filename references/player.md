# The player: tour.js reference

`index.html` (copied from `assets/player/`) is the engine; `tour.js` is the video. The page loads
`tour.js`, `img/manifest.js` (named boxes) and `vo/vo-data.js` (narration lengths), builds a timeline and
draws every frame as a pure function of time: `renderAt(t)`. The same page is the interactive preview
(play, scrub, chapters, `?t=42` to open at a moment) and the render target (`?render`).

## Contents
1. Top-level fields
2. Beats
3. Timing model
4. Transitions
5. Camera
6. Rings, clicks, typing
7. Theme and brand
8. Changing the engine

## 1. Top-level fields

| field | meaning |
|---|---|
| `title` | page title and accessible name |
| `brand.name` | product name: title card fallback, chapter rail, window label fallback |
| `brand.windowLabel` | the text in the framed window's address pill |
| `brand.logo`, `brand.logoAlt` | logo image on the title and end cards (omit for none) |
| `brand.theme` | `'light'` or `'dark'`: the backdrop, window chrome and cards. Match the screenshots |
| `brand.font` | a Google Font family (loaded at runtime) or `'system-ui'` |
| `brand.colors` | hex overrides: `accent`, `accentStrong`, `onAccent`, `primary`, `secondary`, `backdrop`, `ground`, `surface`, `line`, `ink`, `muted`, `bar` |
| `titleCard` | `{ name, line, say }` or omit for no title card |
| `endCard` | `{ tag, tagEm, recap: [...], link, credits, say }`; `recap` defaults to the chapter names |
| `chapters` | `{ 'Chapter name': { sub, say } }` (or just the subtitle string) |
| `beats` | the list below |
| `tiles` | up to 9 `{ img, label, crop }` for the "and more" wall (`crop`: px to skip at the top) |
| `timing` | overrides for section 3 |
| `captions` | `{ area: false }` hides the chapter label above each caption |
| `progress` | `false` hides the chapter progress rail at the bottom |
| `audio` | soundtrack for the interactive player (default `vo/mix.m4a`, then `vo/narration.m4a`) |

## 2. Beats

| field | meaning |
|---|---|
| `ch` | chapter name. A change of `ch` between beats inserts a chapter bumper |
| `img` | screenshot name in `img/` without `.png`, or `'WALL'` for the tiles wall |
| `id` | narration id; defaults to `img` (`wall` for the wall). Set it when one screenshot is used twice |
| `cap` | caption text (also the narration, unless `say`) |
| `say` | spoken form, used by `lines.cjs` |
| `cam` | `[[cx, cy, zoom], [cx, cy, zoom]]` at arrival and at the end of the hold, in screenshot pixels. Omit to frame the focus boxes automatically |
| `focus` | rings: `'name'`, `[x, y, w, h]`, or `[box, from, to]` with seconds from when the caption appears (`to` 99 = until the beat ends) |
| `click` | `{ to: 'name' \| [x, y], from: [x, y], move: [start, end], at }`: cursor travels on a slight arc and clicks with a ripple |
| `type` | `[{ text: 'name', at, dur }]`: reveal typed text measured by `measure-text.cjs` |
| `join` | same page, new state: cross-fade in place, the camera continues, no zoom out |
| `through` | the previous beat's click target (or last ring) grows into this screen |
| `voSpan` | keep this beat short (`d`, default 1.6 s) and let its line run on over the next (joined) beat |
| `capTop` | caption at the top of the frame (subject is low on the screen) |
| `d` | minimum hold in seconds (narration can make it longer) |

## 3. Timing model

Nothing is timed by hand; change a line and the cut retimes.

- Hold `d = max(d, caption words / wps + 0.5, voice length + 0.1 + pad, its own actions)`; with no
  voice, words alone. "Its own actions" means typing, the click and timed rings play out (+0.6 s) before
  the camera leaves.
- A beat with no line of its own (a joined result) waits for the previous line to finish, plus `pad`.
- A beat runs: zoom in (`zin`), caption appears at 60 % of it, hold `d`, zoom out (`zout`, 0 before a
  joined or through beat). The line starts 0.1 s after the caption.
- Chapter bumper: `max(chapter, 0.4 + spoken chapter name + 0.75)`. Push: `push`. Through: `through`.
- Title card: `max(3, 0.6 + title line + 0.7)`. End card: `max(4.2, 0.45 + end line + 1.4)`.

| `timing` key | default | |
|---|---|---|
| `pad` | 0.9 | air after each line (raise to slow the whole video) |
| `zin`, `zout` | 0.95, 0.5 | zoom in and out of a beat |
| `push`, `chapter`, `join`, `through` | 0.9, 1.55, 0.4, 0.85 | transition lengths |
| `shutter` | 0.3 | motion blur, as a fraction of a frame |
| `home` | 0.8 | zoom of the whole framed window between beats |
| `wps` | 3.8 | reading speed for captions without voice |

## 4. Transitions

| kind | when | what the viewer sees |
|---|---|---|
| push | next beat, same chapter | the window slides out as the next slides in, backdrop drifts (parallax) |
| chapter | `ch` changes | window drops away; number, title, subtitle rise in staggered; next window rises |
| join | `join: true` | same frame cross-fades to the new state; the cursor that clicked stays a moment |
| through | `through: true` | camera dives toward what was clicked while the new screen grows out of that point |
| wall | `img: 'WALL'` | up to nine real screens spring into a grid, slow drift |

Each follows one rule from motion design: something moves *for a reason*, eases in and out (sine), and
changes happen at peak speed, where the eye doesn't track detail. Motion blur hides the in-between.

## 5. Camera

- Coordinates are screenshot pixels: `[960, 540, 1]` is the whole screen filling the frame.
- Zoom above 1 always fills the frame (the camera is clamped to the image). Below 1 the window floats on
  the backdrop with its title bar; `home` (0.8) is the resting framing between beats.
- Interpolation is in log-zoom, so zooming feels even.
- Auto camera (no `cam`): frames the union of the focus boxes and click target at up to 1.7x, leaving
  room for the caption, with a 6 % push during the hold. When the subject is too low on the screenshot to
  clear a bottom caption, it moves the caption to the top (unless the beat sets `capTop` itself).
- Hand-set cameras: arrival and end usually differ by 5-10 % zoom and a few dozen pixels: a slow, steady
  push that keeps the hold alive without being motion to follow.

## 6. Rings, clicks, typing

- Rings fade and tighten in over 0.3 s around the box (+4 px), glow in the accent colour.
- Clicks: the cursor fades in at `from`, travels during `move` on an arc, presses at `at` with a ripple.
  Defaults: from 300 px right and 240 px below the target, move 0.25-1.15 s, click 0.12 s after arrival.
- A click beat followed by a `join` beat is the standard "do something, see the result" pair. Give the
  click beat `voSpan` and a short `d` when the line describes the result.
- Typing covers untyped text with the field's own colour and draws a caret; characters appear at about
  14 per second.

## 7. Theme and brand

The video has its own look, separate from the app's: backdrop, window chrome, captions and cards follow
`brand.theme` and `brand.colors`. Use the brand's accent for rings, ripples and highlights, its primary
for big type. Match the theme to the screenshots (light screens in a light video), and check contrast:
text on `accent` uses `onAccent`. Never put third-party brands (a partner's or another company's logo)
in a video without the user saying so.

## 8. Changing the engine

The engine is one readable file. Common changes:

- Different frame size: `W`, `H` and the capture viewport must match; keep 16:9.
- New transition: add a segment type in the timeline loop and draw it in `sceneAt`; keep everything a
  pure function of `t` (no `Date.now()`, no randomness without a fixed seed) so renders are exact.
- Expose anything new for scripts on `window.__tour`.
After changing it, render stills and run `verify.cjs`: it reads the same `__tour` the renderer does.
