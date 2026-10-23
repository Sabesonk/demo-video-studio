# Render and QA

## Contents
1. Rendering
2. Review stills before the full render
3. The oracle: every leg and its fix
4. Delivery checklist

## 1. Rendering

```
node render.cjs tour video [--out tour/tour-silent.mp4] [--workers 6] [--fps 30] [--from s --to s] [--no-blur]
```

- Each frame is `renderAt(t)` in a headless page, screenshotted at 1920x1080. Workers are separate pages
  taking every n-th frame; on a laptop six workers render about 60-70 frames a second, so a 5-minute tour
  takes a few minutes.
- Frames are kept in `tour/.frames-30/`; a stopped render resumes. **Delete the folder after changing
  tour.js, images or narration**, or old frames are reused.
- `--from/--to` renders a section (for a quick look at one chapter); the MP4 then covers only that range.
- Motion blur is on by default: where the picture moves more than a few pixels in a frame, sub-frames
  across the shutter are averaged. Holds cost a single draw.
- The output is H.264, CRF 18, yuv420p, faststart (plays everywhere, streams well). `render.json` beside
  it records fps, blur, frames and render time for the oracle.
- Then mux the soundtrack: `mix.cjs tour --music … --video tour/tour-silent.mp4 --out tour/tour-final.mp4`.

## 2. Review stills before the full render

`render.cjs tour stills` writes a still from the middle of every hold and every transition, plus contact
sheets of 24 labelled stills (`stills/sheet-01.png` …). Read the sheets: they show in a few images what a
person would notice watching: a caption over the subject, a ring on the wrong row, a blank or wrong
screenshot, a chapter with one beat. Fix, re-run, then render the video.

## 3. The oracle: every leg and its fix

```
node verify.cjs tour [--video tour/tour-final.mp4] [--min-text 18]
```

| leg | checks | usual fix |
|---|---|---|
| plan | the tour loads; named boxes resolve; screenshots are 1920x1080 | fix the name in tour.js or re-capture at the right size |
| narration | every line has audio; no overlaps; no line runs past its beat; pace; edited lines re-voiced; no draft voice left | re-run voiceover.mjs; raise `d`; remove `voSpan` where the line is long |
| cadence | variation of hold lengths >= 0.2; chapter lengths | split long beats, join quick states, vary line lengths |
| captions | <= 2 lines; <= 20 characters a second | shorten the line or split the beat |
| framing | rings inside the frame and not under the caption; clicks visible; rings not larger than the frame | move `cam`, lower zoom, `capTop: true`, ring a smaller box |
| legibility | app text >= 18 px on screen in beats that point at details | zoom in (1.3-1.7) or point at something larger |
| motion | fastest on-screen move per frame; FAIL above 80 px/frame rendered without blur | render with blur (the default) |
| film | 1920x1080, length matches the tour, no black frames | re-render (stale frames, missing images) |
| audio | -16 +-2 LUFS, true peak <= -1 dBTP, voice >= 8 dB over the music | re-run mix.cjs; `--bed -30` for quieter music |
| credits | CREDITS.md filled, end card credits present when music or ElevenLabs voice is used | fill both |

The oracle catches what can be measured. It can't tell whether the story is right, a screen is the
best one, or the voice suits the brand: that is what the contact sheets and the user's viewing are for.

## 4. Delivery checklist

- [ ] `verify.cjs --video` passes; remaining WARNs explained to the user
- [ ] Watched at least the opening, one chapter change, one click-to-result pair and the ending, with sound
- [ ] `tour-final.mp4` plus `captions.srt`, `chapters.txt`, `voiceover-script.md`, `CREDITS.md`
- [ ] The message to the user states: file paths, length, chapters, what was left out and why, licence
      limits (free-plan voice is non-commercial; CC BY music needs its credit line), and how to change a
      line (edit tour.js -> lines.cjs -> voiceover.mjs -> mix.cjs -> render.cjs)
- [ ] Scratch files (frames, stills, auditions) are where the user can find or delete them; nothing was
      published or uploaded without being asked
