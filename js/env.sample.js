// InterCube environment placeholders.
//
// This file is intentionally safe to commit and contains NO SECRETS. It exposes
// a single placeholder `__ENQUIRY_ENDPOINT__` that GitHub Actions, Netlify,
// Cloudflare Pages, or your hosting platform can replace at deploy time with
// the value of a secret.
//
// - On GitHub Pages: the deploy workflow in `.github/workflows/deploy.yml`
//   replaces `__ENQUIRY_ENDPOINT__` with `${{ secrets.ENQUIRY_ENDPOINT }}`.
// - On Netlify / Cloudflare Pages / Vercel: many static hosts can replace
//   `__TOKEN__` strings automatically if you enable their env-injection feature,
//   or the same workflow sed step works on any deploy pipeline.
//
// For LOCAL TESTING, copy this file to `js/env.local.js` and replace the
// placeholder with your Apps Script /exec URL. `env.local.js` is git-ignored
// so it never gets committed.
(function () {
  window.INTERCUBE = window.INTERCUBE || {};
  window.INTERCUBE.ENQUIRY_ENDPOINT = '__ENQUIRY_ENDPOINT__';
})();
