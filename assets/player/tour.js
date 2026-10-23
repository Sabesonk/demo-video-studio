// The video, as data. The player (index.html) turns this into a timeline; nothing here is timed by
// hand except optional minimums. Field reference: references/player.md in the skill.
//
// Images are real screenshots in img/<name>.png (1920x1080). Named boxes ('save', 'dialog') come
// from img/manifest.js, which the capture kit writes; a box can also be given as [x, y, w, h].
window.TOUR = {
  title: 'Acme Console tour',

  brand: {
    name: 'Acme Console',               // product name: title card, chapter rail, fallback window label
    windowLabel: 'Acme Console',        // text in the framed window's address pill
    logo: 'img/logo.png',               // optional; remove the line if there is no logo file
    theme: 'light',                     // 'light' | 'dark': the video's own look (match the screenshots)
    font: 'Inter',                      // a Google Font, or 'system-ui'
    colors: { accent: '#2563EB', accentStrong: '#1D4ED8', primary: '#0F172A', secondary: '#7C3AED' },
  },

  titleCard: { name: 'Acme Console', line: 'Everything your team ships, in one place.', say: 'Meet Acme Console. Everything your team ships, in one place.' },
  endCard: {
    tag: 'One console.', tagEm: 'Every release.',
    say: 'Acme Console. One console, for every release.',
    link: '',                            // e.g. 'Book a demo · acme.example'
    credits: '',                         // music and voice credits, from CREDITS.md
  },

  // Chapter subtitles (shown on the bumper) and how the chapter name is spoken.
  chapters: {
    'Build': { sub: 'Create, test and publish.', say: 'Build.' },
    'Operate': { sub: 'Runs, approvals and audit.', say: 'Operate.' },
  },

  // One beat = one real screen and one idea. `cap` is the caption; `say` is how it is spoken
  // (spell out acronyms: cap 'LLM', say 'L L M'). With narration, the beat lasts as long as its line.
  beats: [
    { ch: 'Overview', img: '01-dashboard', cap: 'Every release and every run, live on one dashboard.' },
    { ch: 'Build', img: '02-new-project', cap: 'Create a project from a template in one dialog.', focus: [['dialog', .5, 99]] },
    { ch: 'Build', img: '03-project-saved', join: true, cap: 'It is ready straight away.', focus: ['status'] },
    { ch: 'Build', img: '04-project-list', cap: 'Open it from the list…', click: { to: 'row' }, voSpan: true, d: 1.6 },
    { ch: 'Build', img: '05-project-detail', through: true, cap: '…and everything about it is one click away.' },
    { ch: 'Operate', img: '06-runs', cap: 'Every run is recorded, with a trace you can open.' },
  ],

  // Optional "and more" wall: add { ch: 'And more', img: 'WALL', cap: '…' } as a beat to show it.
  tiles: [],

  // timing: { pad: .9 },  // seconds of air after each line; see references/player.md for the rest
  // audio: 'vo/mix.m4a',  // soundtrack the interactive player plays (render ignores it)
};
