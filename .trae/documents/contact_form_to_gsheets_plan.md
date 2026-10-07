# Contact Form → Google Sheets Integration Plan

## Repository Research
- **Architecture**: Pure static site (HTML + CSS + vanilla JS in `js/main.js`). No package.json, no serverless framework (no Netlify/Vercel/Next/Cloudflare Worker), no Supabase config. Deployment likely via static hosting (manual upload / GitHub Pages / any static CDN).
- **Two active forms** submit locally today with no backend call:
  1. Contact page form `#contactForm` — [contact.html#L193-L214](file:///Users/googerit/Desktop/intercube.com/intercube-website/contact.html#L193-L214), handled at [main.js#L77-L87](file:///Users/googerit/Desktop/intercube.com/intercube-website/js/main.js#L77-L87).
  2. Project enquiry modal form `.project-enquiry-modal__form` — injected dynamically in [main.js#L205-L275](file:///Users/googerit/Desktop/intercube.com/intercube-website/js/main.js#L205-L275), submit handler at line 270-274.
- **Contact form fields**: `name`, `email`, `phone`, `sector`, `message`.
- **User requirement (phone)**: Accept and store both formats `908059435` (local) and `+91 3438492374` (international). We will save BOTH a normalized E.164 column + the raw user-entered column in the sheet.
- **Target sheet** (user provided): `https://docs.google.com/spreadsheets/d/1S_ZvTwemGZl8l_969bPAYfpqD8ZcB4ksfeniG9CmCNE/edit` — spreadsheetId = `1S_ZvTwemGZl8l_969bPAYfpqD8ZcB4ksfeniG9CmCNE`.

## Architecture Recommendation
- **Approach: Google Apps Script Web App (no-cost, no-server, works with pure static hosting)**.
  - Reason: The project has no server. GAS is Google-native, lives inside the sheet itself, exposes an HTTPS endpoint, requires zero infra, zero secrets in the repo, and is 100% free for typical site volumes.
  - Create a GAS Web App `doPost(e)` → parses JSON body → validates required fields → prepends a new row to the sheet's first tab (gid=0) with timestamp → returns `{ok:true}`.
  - CORS: deploy as "Execute as: Me, Who has access: Anyone" — this allows anonymous POSTs from the live site without OAuth.
  - Spam defense: Apps Script endpoint has a rate-limit-style built-in; on the client we add basic honeypot field + submission throttle to avoid re-posts.
- **Alternative (NOT chosen)**: Service account + Sheets API v4 through a Vercel/Netlify/Cloudflare function. Would require a backend scaffold + secrets management that doesn't exist today and adds infra cost/complexity.

## Files and Modules
- `js/main.js` (modify): Replace the two local-only submit handlers with `fetch()` to the Apps Script URL, add honeypot + throttle, show inline errors/success states, and implement phone normalization.
- `contact.html` (modify): Contact page form — add a honeypot input and an error state element; fix form-note email (currently stale `kushal@infinitybiz.co.in` in the HTML — should match earlier site convention `enquiry@intercube.in`).
- `js/main.js` — modal form injection (modify): Add the same honeypot input + error element inside the innerHTML.
- **NOT in repo (must be configured by user in the Google sheet once)**:
  - A Google Apps Script bound to the sheet at `1S_ZvTwemGZl8l_969bPAYfpqD8ZcB4ksfeniG9CmCNE` with one `Code.gs` file + one `appsscript.json` (for explicit scopes `spreadsheets.currentonly`).
  - Deployment as Web App. The resulting `/exec` URL gets pasted into `js/main.js` as the single endpoint constant.

## Sheets Columns (Header Row — first tab, Row 1)
The Apps Script writes to columns in this order. If the sheet has no headers yet, we will tell the user to create Row 1 with exactly these values:
1. `Timestamp (IST)` — new Date() formatted Asia/Kolkata
2. `Source` — `contact-page` or `project-enquiry-modal`
3. `Name`
4. `Email`
5. `Phone (raw)` — exactly what the user typed (preserves both formats)
6. `Phone (normalized E.164)` — e.g. `+919844100700` or `+91908059435`; empty string if unparseable
7. `Sector`
8. `Message`
9. `Page URL` — which page the user submitted from

If the sheet already has a different header structure on gid=0, the Apps Script will use a header-name→column-index lookup (by reading row 1) instead of positional, so adding/removing columns later won't break writes.

## Implementation Steps

### Step 1 — Create Apps Script (doc-internal, outside repo, must be done by sheet owner once)
1. Open the target sheet → Extensions → Apps Script.
2. Replace default `Code.gs` with the following (template provided by us as part of implementation):
   - `doPost(e)` — parses `e.postData.contents` JSON, validates required keys.
   - `getHeaderIndex(sheet, headers)` helper, returns `{colName: colNumber}`.
   - Writes a new row via `sheet.appendRow(...)` OR header-keyed column write.
   - Returns `ContentService.createTextOutput(JSON.stringify({ok:true,...})).setMimeType(MimeType.JSON)`.
   - Sets CORS-ish headers through `ContentService` (Apps Script web app allows cross-origin POST when deployed publicly; the client will use `mode:'cors'`).
3. Set `appsscript.json` runtime V8 + explicit scope `https://www.googleapis.com/auth/spreadsheets.currentonly` (so deployment asks for narrowest permission).
4. Deploy → New deployment → Type=Web app → Execute as=Me → Who has access=Anyone → Deploy → Authorize → Copy the `/exec` URL.
5. Create Row 1 headers if missing (list above).

### Step 2 — `js/main.js`: add phone normalization helper + shared submit function
- Add `normalizePhoneIN(raw, defaultCountry='IN')` function. Accepts:
  - Plain digits 9–12 chars: if 10 digits → `+91` prefix; if starts with 91 or 0 → strip then prefix `+91`.
  - Already starts with `+` → keep E.164-ish as-is (strip spaces).
  - Saves raw AND normalized versions in sheet (per requirement).
- Add shared async `submitEnquiry(payload, {source})` function:
  - Basic client validation (name/email/phone non-empty; email regex; phone length ≥9 digits).
  - Honeypot check — reject if a hidden `website` field was filled.
  - Throttle per page load via `sessionStorage` / simple flag (min 5 s between submits, max 3 per session).
  - `fetch(APPS_SCRIPT_URL, { method:'POST', body: JSON.stringify({...payload, source, pageUrl: location.href, ua: navigator.userAgent.substring(0,180)}), headers: {'Content-Type':'text/plain;charset=utf-8'} })`.
  - Note: Apps Script Web Apps occasionally misbehave with `application/json` when preflighted — send as `text/plain` to avoid CORS preflight issues. Still valid JSON in the body.

### Step 3 — `js/main.js`: wire contact-page handler
- Replace the current handler at lines 77-87:
  - Show "Sending…" state on button (disabled + label swap).
  - Call `submitEnquiry(formData, {source:'contact-page'})`.
  - Success: hide form, show existing `#formSuccess` (unchanged UX).
  - Failure: show inline error element (new div in DOM — "Something went wrong. Please email enquiry@intercube.in or call +91 9844100700.").
  - Clear "Sending…" regardless.

### Step 4 — `js/main.js`: wire modal enquiry handler
- Lines 270-274 currently just hide form/show success.
- Inject a honeypot `website` input (display:none) + a small error-message div in the modal innerHTML (line 212-227 region).
- On submit, call `submitEnquiry(formData, {source:'project-enquiry-modal'})`.
- Success path unchanged; on failure: show error div inside modal, allow retry.

### Step 5 — `contact.html`: honeypot + error element + update stale form-note email
- Add `<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0">` inside `.contact-form`.
- Add `<div class="form-error" role="alert" hidden></div>` between `.form-submit` and `.form-note`.
- In the static `contact.html` form-note `<a href="mailto:...">`, if still set to `kushal@infinitybiz.co.in` (need to verify and fix per earlier convention), change to `enquiry@intercube.in`. (Note: the dynamic modal form at main.js line 226 also still has the old email — fix there too.)

### Step 6 — Optional client safety
- Basic CSRF-ish: since Apps Script POST is cookie-less and cross-origin from a static site, preflight is not issued (if we use text/plain). To reduce junk, add a lightweight client token: `Math.random().toString(36)` stored in `payload.token` — Apps Script ignores it for now but keeps the option of server-side uniqueness later.

## Dependencies and Considerations
- **No new NPM or server code** is added to the repo. Implementation stays within `js/main.js` + `contact.html`.
- **APPS_SCRIPT_URL** is the ONLY value the user needs to paste into `js/main.js` after deployment. Store it as a single constant at top of main.js, e.g. `const ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/XXX/exec';`.
- **Phone formats requirement fully preserved in-sheet**: two phone columns always written (`Phone (raw)` + `Phone (normalized E.164)`). Example:
  - User types `908059435`  → raw=`908059435`, normalized=`+91908059435`
  - User types `+91 3438492374` → raw=`+91 3438492374`, normalized=`+913438492374`
  - Non-parseable (e.g. "call me after 6") → raw kept, normalized empty, write still succeeds.
- **CORS**: Apps Script deployed with "Anyone" access accepts cross-origin POST from any domain. `fetch` uses `mode:'cors'`, `redirect:'follow'` (Apps Script may return a 302 redirect to a similar /exec URL with trailing auth token — follow is required).
- **Race-safe writes**: Apps Script `appendRow` is atomic per execution; concurrent submits serialize naturally due to Apps Script execution model — no column misalignment.
- **GDPR / PII note**: `userAgent` + `pageUrl` + form data are customer PII. They stay in the private GSheet (shared only with owner). No change needed.

## Validation
1. **Local test**: open `contact.html` in browser (file:// works because Apps Script allows cross-origin). Fill and submit.
2. **Verify sheet**: row appears within ~2s in the correct columns, phone raw and normalized both populated correctly for each format case.
3. **Modal form test**: click any "Start a Project" nav CTA on home → submit → verify a row with `Source=project-enquiry-modal` in sheet.
4. **Failure tests**:
   - Turn off internet: shows inline error, allows retry, doesn't show fake success.
   - Fill honeypot (via devtools): silently rejects (no error banner shown to user — pretend success? or return error; our plan: console.warn + don't hit endpoint, keep success banner since it's almost always a bot).
   - Submit twice quickly within 5s: throttle prevents duplicate posts.
5. **DevTools Network**: confirm POST to `/exec` returns `{"ok":true}`.

## Risks
- **Risk: Apps Script preflight / CORS confusion.** → Mitigation: send body as `Content-Type: text/plain` (avoids preflight); deploy with "Who has access: Anyone" + authorize.
- **Risk: Wrong sheet tab.** → Mitigation: Apps Script helper reads header names, so it only writes to columns whose header is known; unknown headers are skipped. Also, the sheet URL user gave is gid=0 first tab — bind the script to the same spreadsheet and default to `SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]` for robustness.
- **Risk: Stale /exec URL after re-deployment.** → Mitigation: Keep URL as a single constant at the top of `js/main.js`; update only that line when re-deploying a new version in GAS.
- **Risk: Spam volume.** → Mitigation: honeypot + client throttle + (optional future) Apps Script-side rate-limit by email/phone per day. Not in scope for now; add only if spam appears.
- **Risk: Email/contact form-note values are inconsistent after today's earlier "replace everywhere with enquiry@intercube.in" task.** → Mitigation: During Step 5, explicitly grep contact.html and main.js modal template for any remaining `kushal@infinitybiz.co.in` and replace with `enquiry@intercube.in` as a hygiene pass.
