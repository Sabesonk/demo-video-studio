# Audio: voice, music, mix

## Contents
1. ElevenLabs setup and key handling
2. Choosing a voice
3. Voicing the script
4. Pronunciation and pace
5. Licences for generated voice
6. Music: sources and licences
7. Mixing levels

## 1. ElevenLabs setup and key handling

- The key lives in an env file that git ignores (for example the repo's `.env.local`, after checking it
  is ignored: `git check-ignore -v .env.local`; if it is not, add it to `.git/info/exclude` first).
- Scripts read `ELEVENLABS_API_KEY` from the environment; pass the file with `node --env-file=<file>`.
- Never open, print or echo the file or the key, never ask for it in chat, never accept one pasted
  there, never put it in code or on a command line. If the user wants to set it up, ElevenLabs' own
  onboarding (`npx -y @elevenlabs/cli@latest onboard init`) writes it, and `onboard check` verifies it.
- No key, or no budget yet: `voiceover.mjs --engine say` makes a free macOS draft voice, good enough to
  time the cut and review the script. Voices that ignore the speaking rate are slowed to about 140 wpm
  (pitch kept; `--wpm` changes the target). The oracle warns while a draft voice is in the video.
  Apple licenses the macOS voices for personal, non-commercial use: a draft cut is for internal review,
  so say so on the end card and in CREDITS.md, and re-voice before anything is published.

## 2. Choosing a voice

```
node --env-file=<env> voiceover.mjs --list-voices
node --env-file=<env> voiceover.mjs --audition "Add a model to the L L M gateway, in a single dialog." --voices <id>,<id>,<id>,<id> --out tour/vo/audition
```

Audition the same typical line in 3-6 voices and let the user choose by ear (send them the file paths).
For product narration, calm, mid-pitched, "trustworthy" or "news" voices work; avoid characterful ones.
The default is the premade voice Eric (`cjVigY5qzO86Huf0OWal`), model `eleven_v4`, stability 0.75,
similarity 0.6: a steady, professional read. Lower stability (0.4-0.5) is livelier but less consistent
across 40 separate lines.

## 3. Voicing the script

```
node lines.cjs tour                                       # tour.js -> vo/lines.json (id, spoken text, caption)
node --env-file=<env> voiceover.mjs --lines tour/vo/lines.json --out tour/vo
```

- One file per line (`vo/<id>.mp3`), `durations.json`, and `vo-data.js` (caption + length) for the player.
- Each request carries the previous and next line as context, so intonation flows across cuts.
- Only changed lines are re-voiced (`.voiced.json` remembers text, voice, model, settings); `--force`
  re-voices everything, `--only id,id` limits a run.
- Cost: ElevenLabs bills by characters. Before a full run, tell the user the line count and characters
  (`wc -c` of the texts is close enough). A 5-minute tour is about 2,500 characters.
- Listen to a few lines (chapter starts, the longest line, anything with names or acronyms) before mixing.

## 4. Pronunciation and pace

- Spell acronyms in `say`: "L L M", "M C P", "A P I", "S S O". Product names exactly as written.
- Slow, clear narration is 130-145 wpm; above 160 sounds rushed (the oracle warns). Commas add pauses;
  a full stop adds a longer one. Two short sentences read calmer than one long one.
- The player adds `pad` (0.9 s) of air after every line; raise it for an even slower video rather than
  stretching audio.
- Numbers: "4.2" reads as "four point two"; "$25" as "twenty-five dollars". Write dates as spoken.

## 5. Licences for generated voice

- ElevenLabs free plan output is **non-commercial and must be attributed** ("Voice: ElevenLabs,
  elevenlabs.io"). For a sales, marketing or public video, regenerate on a paid plan (same command,
  `--force`), which grants commercial use.
- Write the voice, model and plan status into `CREDITS.md`.

## 6. Music: sources and licences

Background music needs a licence that covers the use, and its credit wherever the video is shown.

| source | licence | notes |
|---|---|---|
| incompetech.com (Kevin MacLeod) | CC BY 4.0: commercial use allowed with credit | `find-music.py` searches the catalogue and prints the credit line; direct MP3 links |
| A track the user supplies | whatever they hold | ask for the licence or source; record it |
| YouTube Audio Library | per track ("no attribution" or CC BY) | the user downloads it in YouTube Studio with their account; take the attribution text it shows |
| Pixabay Music, Free Music Archive | per track | check each track's licence; downloads usually need a browser, so the user fetches the file |
| ElevenLabs Music (`music-compose.mjs`) | paid plans | composes to the chapter timing; 402 means the plan doesn't include it |

Never download audio from YouTube videos, Spotify, SoundCloud or commercial releases: it breaks their
terms and the music's copyright, whatever tool would make it easy. If asked why, say so in one line and
offer the sources above.

Choose: instrumental, no vocals, 75-125 bpm, "bright, calm, uplifting"; soft piano, pads, light pulse.
Prefer a track slightly longer than the video (`mix.cjs` nudges tempo by up to 3 % to land the ending on
the end card, trims and fades longer ones, loops shorter ones).

## 7. Mixing levels

`mix.cjs` does all of this from the tour's own schedule:

- Narration: every line placed at its start time, mixed, normalised.
- Music bed: set to `--bed` (-27 LUFS by default) before ducking, faded in over 1.5 s and out over the
  end card, fitted to the length.
- Ducking: a sidechain compressor keyed by the voice (threshold 0.04, ratio 4, attack 20 ms, release
  450 ms) dips the music under each line and lets it back up in the gaps.
- Master: two-pass loudness normalisation to **-16 LUFS integrated, -1.5 dBTP true peak** (web and
  streaming level). The oracle accepts -16 +-2 LUFS and true peak <= -1 dBTP, and compares the loudness
  of the spoken passages with the music-only gaps between lines: at least 8 dB apart passes, under 5 dB
  fails (the music would compete with the voice).
- If the music feels loud, `--bed -30`; if absent, `--bed -24`. Re-run; nothing else changes.
