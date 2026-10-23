# Capture: real screens from the running app

## Contents
1. Before capturing
2. capture.config.cjs
3. Signing in (password, SSO, MFA)
4. Step files and the `h` kit
5. Named boxes and the manifest
6. Typing
7. Seeding fictional data
8. Reviewing captures
9. Troubleshooting

## 1. Before capturing

- The app runs locally (or on a staging URL the user names) with a user who can see every area.
- Decide the video's look: light or dark, which brand file. Both are injected in the capture browser only.
- Capture at **1920x1080, deviceScaleFactor 1**: the player's camera maths assumes it, and it keeps PNGs
  small. Detail comes from zooming the camera, so text must be crisp at 1x.
- Put screenshots straight into the video folder (`shotsDir: './tour/img'`).

## 2. capture.config.cjs

Start from `assets/capture.config.example.cjs`. Fields:

| field | meaning |
|---|---|
| `baseUrl`, `startPath` | where the app is |
| `viewport` | `{ width: 1920, height: 1080 }` |
| `shotsDir` | where PNGs and `manifest.(json\|js)` go, relative to the config |
| `spaNavigation` | `true` for apps that keep the sign-in token in memory: navigate with `history.pushState` + `popstate` instead of loading URLs, which would sign out |
| `login` | the sign-in form (below), or `async (page, { user, cfg }) => {}` |
| `routes` | `{ '/brand.json': './brand.light.json' }`: serve local files at app paths (brand, feature flags) |
| `localStorage` | items set before the app loads: theme, sidebar state, dismissed tours |
| `css` | extra CSS for this browser: hide dev banners, toasts, cookie bars |
| `dismiss` | buttons clicked away before every shot: `{ role: 'button', name: 'Dismiss notification' }` or a selector |
| `textSample` | selector whose font size is recorded for the legibility check |
| `settle` | ms to wait after navigating (default 2500) |
| `locale`, `timezoneId`, `colorScheme` | browser context options (fix dates and formats for the whole capture) |

Animations are reduced (`reducedMotion: 'reduce'`) so shots don't catch transitions halfway.

## 3. Signing in

- **Password form** (including Keycloak and most SSO login pages): `login: { user, username, password,
  submit, passwordEnv, loginPath, ready }`. The password comes from the environment variable named in
  `passwordEnv`. A dev password the repository already documents publicly may be set as `password`, but
  prefer the environment.
- **A second factor (one-time code)**: run `capture/driver.cjs`. It opens a visible window, fills the
  username and password, and waits up to ten minutes for the person to type their code. Then it keeps the
  window signed in and runs step files handed to it by `send.cjs`, one at a time, each with a time limit
  (`// @timeout 600` in the file). Tell the user plainly that a window is waiting for their code. Never
  reset, read or work around anyone's MFA.
- **Different roles**: one driver per user (`--user org-admin --cmd cmd-org-admin`); steps that need an
  admin approval go to the admin's window.
- `touch cmd-<user>/QUIT` closes a driver.

## 4. Step files and the `h` kit

A step file exports `async (page, h) => result`. Keep one flow per file so a failure costs one flow.

| helper | does |
|---|---|
| `h.go(page, path, waitMs)` | navigate (in-app with `spaNavigation`) and settle |
| `h.shot(page, name, { key: locator })` | dismiss toasts, park the mouse, screenshot `img/<name>.png`, record boxes |
| `h.box(locator)` | `[x, y, w, h]` of the first match, or null |
| `h.step(name, async () => {...})` | run a sub-step; on failure log it, save a screenshot to `capture-failures/`, carry on |
| `h.dismiss(page)` | close configured toasts now |
| `h.log` | the step's log, returned with the result |

Return facts the next decision needs (row counts, a status text), so you can check the result without
opening a screenshot. Prefer roles and labels (`getByRole('button', { name: 'Save' })`) over CSS; when a
name matches twice, use `.first()`/`.last()` or an element id.

## 5. Named boxes and the manifest

`h.shot` writes `img/manifest.json` and `img/manifest.js` (`window.SHOT_BOXES`), which the player loads:

```js
await h.shot(page, '21-add-model', { dialog: page.getByRole('dialog'), submit: page.getByRole('button', { name: 'Add model' }) });
// tour.js
{ ch: 'Models', img: '21-add-model', cap: '…', focus: ['dialog'], click: { to: 'submit' } }
```

Boxes are measured from the DOM at the moment of the shot, so rings sit exactly on the control and stay
right when the layout changes and you re-capture. A beat without `cam` frames its named boxes itself.

## 6. Typing

To show a field being typed, capture it **filled**, then measure the text so the player can hide what is
not typed yet:

```
node $SKILL/scripts/capture/measure-text.cjs tour/img spec.json
# spec.json: { "prompt": { "img": "07-orch-filled", "box": [263, 248, 770, 76] } }
```

The box is the input's inner area (from `h.box`, minus padding); its right edge must be plain field
background. The beat then uses `type: [{ text: 'prompt', at: .3 }]`; the duration follows the text length
(about 14 characters a second) unless `dur` is given.

## 7. Seeding fictional data

- Use the app's own UI or API with an invented organisation ("Acme"), people, amounts and documents.
- Create the data the story needs before the shots: a saved item for the list page, a finished run for
  the trace, a pending approval for the inbox. A list with one lonely row looks unfinished; three to six
  rows look real.
- Some states only exist live (an approval card while a run waits, a streaming answer). Capture them in
  the same step that causes them, and wait for the visible state (`getByText('Awaiting approval')`).
- AI-backed features (chat, generation) are slow and sometimes return nothing: retry up to three times,
  wait on what appears on screen rather than fixed sleeps, and give the step a generous `@timeout`.
- Note what you created so it can be cleaned up, and tell the user it exists.

## 8. Reviewing captures

Open each PNG (Read it) before it goes into the video. Check: the intended state is showing; no spinner,
skeleton, error toast, "not in any workspace" banner or dev overlay; no real personal data, tokens,
internal hostnames; the right theme and brand; the subject isn't hidden under a popover or hover card.
Re-capture rather than patching a screenshot by hand.

## 9. Troubleshooting

| symptom | cause and fix |
|---|---|
| signed out after `goto` | in-memory token: set `spaNavigation: true` and use `h.go` |
| sign-in "succeeds" but the app never shows | the URL matched too early (a redirect still on the login host): set `loginPath`, wait for `ready` |
| `strict mode violation: resolved to 2 elements` | name a unique role/label, `.first()`, or an element id |
| page opened by URL shows nothing | some pages only open from a click in a list: click the card instead |
| step hangs after the work is done | a wait for something that already happened: add `// @timeout`, wait on visible state |
| `Executable doesn't exist` | the project's Playwright wants a browser build that isn't downloaded: the kit falls back to the newest cached build; else `npx playwright install chromium` or `CHROME_PATH` |
| a feature returns 403 or errors | a product bug or missing setup: cut it from the video and report it (story.md section 7) |
| a native `<select>` list or date picker never appears in shots | the browser draws them outside the page, so screenshots can't show them open: capture before and after, and let a `join` show the value change |
| a control's role name isn't its visible text | icon buttons often carry an `aria-label` ("Test expense-helper" for a "Try" button): find it with `getByText(...).evaluate(e => e.closest('button').getAttribute('aria-label'))` |
