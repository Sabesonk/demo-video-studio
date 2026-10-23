# Story: from a running app to a beat sheet

## Contents
1. Pick the shape
2. Inventory the features from the code
3. Write the beat sheet
4. Narration that sounds human
5. Rhythm and carry
6. Legibility arithmetic
7. Cutting things, and telling the user

## 1. Pick the shape

| shape | length | structure | narration |
|---|---|---|---|
| Walkthrough ("create your first X") | 60-90 s | one chapter or none, 8-14 beats, many clicks and typed fields | one line per step, imperative ("Name the agent…") |
| Platform or feature tour | 3-6 min | title, 6-10 chapters of 3-6 beats, "and more" wall, end card | one line per screen, what it does for the viewer |
| Teaser / launch clip | 20-40 s | title, 5-8 beats, no bumpers, end card | few words, or none with captions |

When the request is open ("make a video of the platform"), propose the shape and an outline instead of
asking open questions. When a pasted brief lists generic items (a template's "voice agents", "lending"),
check them against the code: cover what this product actually has, and say which brief items don't exist.

## 2. Inventory the features from the code

The feature list comes from the product, so nothing is invented and nothing big is missed:

1. Routes and navigation: the router config, the sidebar/nav component, page folders. Each top-level area
   is a candidate chapter; each page or dialog a candidate beat.
2. For each area, what a viewer can *see happen*: create, configure, test, approve, publish, inspect.
   A list page alone is weak; a dialog filled in, a result appearing, a status turning green is strong.
3. Mark what cannot be shown honestly, with the reason: needs infrastructure that isn't running, errors,
   only renders hardcoded demo data, needs a live external system. Those are cut (section 7).
4. Group into chapters in the order a customer meets them (build, then run, then govern), not the order
   of the menu.

Present the outline (chapters, one line per beat, cuts) and adjust it with the user before capturing.

## 3. Write the beat sheet

Write `tour.js` before capturing: it is the shot list for capture and the script for narration.

- **One beat, one screen, one idea.** If a line has "and" joining two features, it is two beats.
- **Show the result, not only the form.** Pair a filled dialog with the state after saving (`join`).
- **Point at it.** Each beat that names a control gets a ring (`focus`) or a click; the camera frames it.
- **Name screens by order and state**: `05-compose-named`, `06-compose-saved`. The id carries into the
  narration files, so keep names stable once voiced.
- **Plan state changes as carries** (section 5): `join` for a new state of the same page, `through` for
  a click that opens a new page, `voSpan` when a short click beat's line should run on over its result.
- **Chapters** get a one-line subtitle that says what the area is for, not what it is called.
- **Title and end card**: the product's own claim, in its own words. The end card recaps the chapters
  and carries the music and voice credits.
- **No invented facts.** No metrics, customer names, benchmarks or "used by" claims unless the user gives
  them. Describe what the screen shows.

## 4. Narration that sounds human

- **8-16 words per line**, one sentence, sometimes two short ones. Lead with the verb or the benefit:
  "Add a model to the gateway in one dialog", not "This is the models page".
- **Slow is professional.** Aim for 130-145 words per minute (the voiceover tool reports it). Commas in
  `say` slow the read and add breaths: "Every run, and every model call, shows up live, on one dashboard."
  The caption (`cap`) keeps normal punctuation.
- **Spell what a voice would misread**, in `say` only: "L L M", "M C P", "S Q L", "Kubernetes" not "k8s",
  version numbers as words when they matter. Keep product names exactly as the product writes them.
- **Connect the lines.** "Then…", "Now…", "And…", "So you can…" make 40 lines one story. Neighbouring
  lines are sent as context to the voice, so tone carries across cuts.
- **Chapter names are spoken short**: "Business rules." The bumper shows the subtitle.
- **Captions match speech word for word** (the player shows the voiced line's caption), which is what
  makes the SRT usable as closed captions.

## 5. Rhythm and carry

Two failure modes make a product video feel like a slideshow, and they are different problems:

**No rhythm.** Every beat the same length and the same shape (cut, zoom, caption, cut) reads as a
metronome even when each beat moves. Narration-driven timing already varies holds; push it further:

- Quick joined states (1-2 s) next to the long hold that explains the key idea (5-8 s).
- Bumpers between chapters are rests: the picture settles, the voice names the chapter.
- One burst per tour is enough: several fast states of one flow (attach, plan, approve, result).
- Don't end consecutive beats the same way: a push, then a join, then a `through`.
- The oracle's cadence leg fails a variation of hold lengths below 0.2.

**No carry.** Each beat replaces the last; nothing survives the boundary. Make something continue:

| boundary | what carries |
|---|---|
| same page, new state | the window stays put and the cursor that caused it stays where it clicked (`join` after a `click` beat) |
| a click opens a page | the pressed element grows into the next screen (`through`) |
| next screen in the same area | the window travels sideways with the backdrop (`push`) |
| new chapter | the bumper names it; the next window rises into place |
| the "and more" round-up | the wall gathers several real screens into one frame |

A fade between unrelated screens is not a carry. When nothing can carry, make the boundary a chapter.

## 6. Legibility arithmetic

A 1920 x 1080 capture shows the app's ~14 px text at 14 px at zoom 1. On a laptop playing the video
full-screen that is small; in a 640 px wide embed it is unreadable. So:

- Details the line talks about must be **at least 18 px on screen**: zoom 1.3-1.7 for 14 px text. The
  oracle's legibility leg uses the text size recorded at capture.
- Whole-page beats can stay near zoom 1.1-1.25: the caption carries the meaning, the screen is context.
- Rings go around one control or one row, never half the page. A ring wider than the frame is a framing
  failure (the camera is too close for it).
- Captions are 38 px, at most two lines, and never cover the subject (`capTop` for low subjects).

## 7. Cutting things, and telling the user

Cut a feature when showing it would be dishonest or broken: it errors, needs infrastructure that isn't
there, or only displays canned demo data. Don't paper over it with a mockup or a still from elsewhere.
Tell the user in the delivery message, one line each: "Left out: Agent Brain (403 for every namespace:
a product bug), Runtime topology (hardcoded sample data)." They may fix the product and ask for a re-cut;
because everything is data, adding a chapter later is cheap.
