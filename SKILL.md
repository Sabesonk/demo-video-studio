---
name: demo-video-studio
description: >-
  Make narrated product demo videos, walkthroughs and feature tours of a web app from its REAL screens, never mockups:
  Playwright captures the running app (including MFA sign-in, injected theme and brand), a player adds camera moves, focus
  rings, clicks, typing, chapters and captions, ElevenLabs voices the script, licensed music is ducked under it, frames
  render to MP4 with motion blur, and a QA oracle checks framing, captions, pacing and loudness. Use it whenever someone
  wants a demo video, product walkthrough, platform or feature overview, onboarding or launch video, "capture our app and
  make a presentation video", a voiceover, captions or background music for a product video, or wants a screen-based
  video fixed (bad transitions, too fast, captions covering the UI), even if they never say "skill", "Playwright" or
  "ElevenLabs". From 30-second teasers to ten-minute tours.
---

# Demo video studio

Turns a running web app into a polished, narrated video made only of its real screens: captured with
Playwright, staged by a player where every frame is a pure function of time, voiced, scored, rendered
and checked by an oracle before anyone watches it.

```
brief + feature inventory -> beat sheet (tour.js) -> seed data + capture (img/) -> preview + stills
   -> narration (vo/) -> music -> mix -> render -> verify -> deliver (mp4, srt, chapters, script, credits)
```

Scripts live in `scripts/` next to this file (`SKILL=~/.claude/skills/demo-video-studio`). They need
Node 18+, ffmpeg and Playwright. Playwright comes from the project (`npm i -D playwright`) or
`PLAYWRIGHT_MODULE=/path/to/node_modules/playwright`; the browser is found automatically (or `CHROME_PATH`).

## Ground rules, and why

- **Real screens only.** Every picture is a screenshot of the actual app in a real state. Never draw,
  mock or "rebuild" UI, and never fake a result a feature cannot produce: viewers and the user's
  customers will check. If something cannot be shown (needs infrastructure that is not running, is
  broken, or only shows hardcoded demo data), leave it out and tell the user what was cut and why.
- **Cover what exists.** Build the feature list from the codebase (routes, navigation, pages), not from a
  marketing template or a pasted brief's generic items. When a brief and the code disagree, the code wins;
  say so.
- **Fictional data.** Seed believable sample data ("Acme", invented people) through the app's own UI or
  API. Before using a screenshot, look at it: no real customer names, emails, tokens, keys or internal URLs.
- **Leave the app alone.** Theme, brand file and CSS tweaks are injected into the capture browser only
  (`capture.config.cjs`). Don't edit the app's code, settings or other people's uncommitted work for a video.
- **Secrets stay secret.** API keys live in an env file that git ignores, passed with `node --env-file`.
  Never print, cat or echo them, never ask for them in chat, never write them into code or configs.
  Passwords for capture come from environment variables.
- **Licences are part of the deliverable.** Every track and voice has a licence and a credit line; they go
  in `CREDITS.md` and on the end card. Never rip audio from YouTube, Spotify or commercial releases.
- **Spending and publishing are the user's call.** Voicing a long script uses ElevenLabs credits; say how
  many lines and characters before a full run, and audition first. Don't upload or publish the video
  anywhere unless asked.

## Workflow

### 1. Brief and inventory

Settle, in one short exchange (only ask what you cannot infer): what the video is for and who watches it,
length, which features, light or dark look, brand, narration or captions only. Then inventory the
features from the code and propose an outline: chapters, one line per beat, what is cut and why.
Typical shapes: a **walkthrough** of one task (60-90 s, one chapter, many clicks), a **platform tour**
(3-6 min, 6-10 chapters, 3-6 beats each), a **teaser** (20-40 s, few beats, no chapters).
Read `references/story.md` for structures, writing the script, pacing and rhythm.

### 2. Beat sheet first

Scaffold the video folder and write the beats before capturing anything: the captions *are* the script.

```
node $SKILL/scripts/new-tour.cjs video/tour          # player + starter tour.js + img/ + vo/ + CREDITS.md
```

One beat = one real screen + one idea + one line (8-16 words). `cap` is the caption, `say` the spoken
form (pacing commas, acronyms spelled out: cap "LLM", say "L L M"). Plan the state changes too: `join`
(same page, new state), `through` (what was clicked opens into the next screen), `voSpan` (a click whose
line carries into the joined result). Schema: `references/player.md`; a complete 41-beat example:
`assets/examples/agent-hive-tour.js`.

### 3. Seed data and capture

Copy `assets/capture.config.example.cjs` to `capture.config.cjs` and write one step file per flow
(`assets/step.example.cjs`). Each `h.shot(page, name, { save: locator, ... })` writes `img/<name>.png`
and records the boxes of the controls the beat will point at, so rings and clicks are referenced by name.

```
node $SKILL/scripts/capture/run.cjs --config capture.config.cjs steps/*.cjs            # no second factor
node $SKILL/scripts/capture/driver.cjs --config capture.config.cjs --user <name>       # MFA: a visible window
node $SKILL/scripts/capture/send.cjs cmd-<name> READY                                  #   ...the person types the code
node $SKILL/scripts/capture/send.cjs cmd-<name> steps/04-models.cjs 300                #   ...then steps run in it
```

Then look at every capture (Read the PNGs): right state, no stray toasts, spinners, errors or real data.
Read `references/capture.md` for sign-in modes, in-memory tokens, flaky AI-backed flows and typing.

### 4. Preview and stills

Open `video/tour/index.html` in a browser to play and scrub. For review, render contact sheets and read them:

```
node $SKILL/scripts/render.cjs video/tour stills       # mid-beat and mid-transition stills + labelled sheets
node $SKILL/scripts/verify.cjs video/tour               # plan, captions, framing, legibility, motion
```

Fix what the sheets and the oracle show before spending anything on voice.

### 5. Narration

```
node $SKILL/scripts/lines.cjs video/tour                                      # tour.js -> vo/lines.json
node --env-file=<env> $SKILL/scripts/voiceover.mjs --audition "<a typical line>" --voices <id>,<id>,<id> --out video/tour/vo/audition
node --env-file=<env> $SKILL/scripts/voiceover.mjs --lines video/tour/vo/lines.json --out video/tour/vo [--voice <id>]
```

Let the user pick the voice by ear from 3-6 auditions. Each beat then lasts as long as its line plus a
pause, so the cut retimes itself; nothing is timed by hand. Without a key, `--engine say` (macOS) gives a
free draft voice for timing. Re-running voices only lines whose text changed. See `references/audio.md`.

### 6. Music

```
python3 -I $SKILL/scripts/find-music.py --length <seconds>    # CC BY shortlist from incompetech, with credit lines
```

Or a track the user supplies with its licence, or `music-compose.mjs` (ElevenLabs Music, paid plans only:
a 402 means use an open track). Download into its own folder; listen to the choice.

### 7. Mix, render, verify

```
node $SKILL/scripts/render.cjs video/tour video                      # parallel workers, motion blur, resumable
node $SKILL/scripts/mix.cjs video/tour --music music/track.mp3 --video video/tour/tour-silent.mp4 --out video/tour/tour-final.mp4
node $SKILL/scripts/export-text.cjs video/tour                       # captions.srt, chapters.txt, voiceover-script.md
node $SKILL/scripts/verify.cjs video/tour --video video/tour/tour-final.mp4
```

Every FAIL gets fixed and the affected part re-rendered (delete `.frames-30/` after changing tour.js).
WARNs are judgement calls: fix them or tell the user why they stand. Read `references/render-and-qa.md`.

### 8. Deliver

Hand over the MP4 path(s) and say what is next to them: `captions.srt`, `chapters.txt`,
`voiceover-script.md`, `CREDITS.md`, the interactive `index.html`. State plainly: length, chapters, what was
left out and why, the oracle's verdict, and licence limits (a free ElevenLabs plan is non-commercial and
needs attribution; CC BY music needs its credit line wherever the video is shown).

## Look and motion, in brief

The defaults encode what worked; `references/player.md` explains each and how to change it.

- The screenshot sits in a framed browser window on a branded backdrop. Each beat zooms in fast and
  eases out, holds almost still while the line is spoken, and zooms back out. Between beats in a chapter
  the windows push sideways; between chapters a numbered bumper names the chapter.
- Transitions are motion with a reason: zoom out, move, zoom in, cutting at peak speed; sine easing; a
  0.3 shutter of motion blur. Heavier blur reads as smear, none reads as strobing.
- **Carry across boundaries.** A slideshow is screens replacing screens. Prefer one thing continuing: the
  cursor that clicked stays while the page changes (`join`), the pressed card grows into its page
  (`through`), the camera keeps travelling in the same direction.
- **Rhythm, not a metronome.** Vary hold lengths (the oracle wants variation >= 0.2); quick joined
  states, a longer hold for the moment that matters, chapter bumpers as rests.
- The subject stays readable and uncovered: zoom 1.2-1.7 on details, rings around the exact control, the
  caption moved to the top (`capTop`) when the subject is low. At most two caption lines.
- Restraint: no confetti, sparkles, stock whooshes or effects the product doesn't have. Match the video's
  theme to the screenshots' theme.

## Scripts

| script | does |
|---|---|
| `new-tour.cjs <dir>` | scaffolds a video folder from `assets/player/` |
| `capture/run.cjs`, `capture/driver.cjs` + `send.cjs` | headless capture / visible signed-in window for MFA |
| `capture/measure-text.cjs` | measures typed text in screenshots so beats can "type" it |
| `lines.cjs <dir>` | narration script from tour.js |
| `voiceover.mjs` | ElevenLabs (or macOS draft) voice per line, durations, `vo-data.js`; auditions; voice list |
| `find-music.py` | CC BY music shortlist with credit lines |
| `music-compose.mjs` | chapter-timed ElevenLabs Music score (paid plans) |
| `mix.cjs <dir>` | narration placed on the timeline, music fitted and ducked, -16 LUFS master, mux |
| `render.cjs <dir> stills\|frame\|video` | contact sheets, single frames, the MP4 |
| `export-text.cjs <dir>` | captions.srt, chapters.txt, voiceover-script.md |
| `verify.cjs <dir> [--video f.mp4]` | the QA oracle; exit 1 on any FAIL |

## References

- `references/story.md`: video shapes, feature inventory, writing beats and narration, rhythm and carry, what to cut.
- `references/capture.md`: config, sign-in and MFA, step files, named boxes, typing, seeding data, troubleshooting.
- `references/player.md`: the tour.js schema, timing model, transitions, camera, theming, extending the player.
- `references/audio.md`: ElevenLabs voices and settings, pronunciation, music sources and licences, mixing levels.
- `references/render-and-qa.md`: rendering, every verify leg and how to fix it, the delivery checklist.
