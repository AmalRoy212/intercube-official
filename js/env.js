// Committed, deploy-time copy of js/env.sample.js. CI (GitHub Actions) replaces
// the `__ENQUIRY_ENDPOINT__` token here with the actual secret before deploy.
(function () {
  window.INTERCUBE = window.INTERCUBE || {};
  window.INTERCUBE.ENQUIRY_ENDPOINT = '__ENQUIRY_ENDPOINT__';
})();
