// Capture config: copy next to your video folder as capture.config.cjs and edit.
// Paths are relative to this file. Secrets come from the environment, never from this file.
module.exports = {
  baseUrl: 'http://localhost:5175',
  startPath: '/',
  viewport: { width: 1920, height: 1080 },   // the video frame; keep 1920x1080
  shotsDir: './tour/img',                    // straight into the player's img/ folder

  // Apps that keep the sign-in token in memory lose it on a full page load: navigate inside the
  // app instead (history.pushState). Leave false for apps with cookie sessions.
  spaNavigation: true,

  // The app's own sign-in form. For a one-time code, run driver.cjs (a visible window) and type it.
  login: {
    user: 'demo-builder',
    username: '#username', password: '#password', submit: '#kc-login',   // Keycloak's form
    passwordEnv: 'DEMO_PASSWORD',            // export DEMO_PASSWORD=... before running
    loginPath: '/auth',                      // app paths that are still part of sign-in
    ready: 'nav',                            // a selector that means "the app has loaded"
  },
  // Or a function for anything unusual: login: async (page, { user, cfg }) => { ... },

  // Injected into the capture browser only, so the app's code and the user's settings stay as they are.
  routes: { '/brand.json': './brand.light.json' },                       // serve a local file at an app path
  localStorage: { 'app-ui': { state: { theme: 'light' }, version: 0 } }, // theme and other persisted UI state
  css: `[data-sonner-toaster], .dev-banner { display: none !important; }`,
  dismiss: [{ role: 'button', name: 'Dismiss notification' }],           // closed before every shot

  textSample: 'main td, main p',             // where to read the base text size for the legibility check
  settle: 2500,                              // ms to wait after navigating
};
