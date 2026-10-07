/**
 * Google Apps Script Web App bound to:
 *   https://docs.google.com/spreadsheets/d/1S_ZvTwemGZl8l_969bPAYfpqD8ZcB4ksfeniG9CmCNE/edit
 *
 * Usage (one-time setup inside the sheet):
 *  1. Open the sheet → Extensions → Apps Script.
 *  2. Replace default "Code.gs" with this entire file.
 *  3. Open Project Settings (gear icon) → enable "Show appsscript.json manifest file".
 *  4. Click "appsscript.json" in the left sidebar → replace with the contents
 *     of the adjacent `appsscript.json` file we shipped (runtime V8 +
 *     `spreadsheets.currentonly` scope).
 *  5. Click "Deploy" → "New deployment".
 *     - Type = Web app
 *     - Execute as = Me (your Google account)
 *     - Who has access = Anyone (so the website can POST anonymously)
 *     - Authorize when prompted. If you see "Google hasn’t verified this app",
 *       click "Advanced" → "Go to <Project Name> (unsafe)" — this is expected
 *       because the script is custom and you're running it on your own sheet.
 *  6. Copy the Web app URL ending in `/exec` and paste it into js/main.js:
 *       const ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/XXXX/exec';
 *  7. Create Row 1 headers on the first sheet tab (gid=0). You only need to set
 *     these once. Missing or extra columns are ignored by the header-keyed write:
 *       Timestamp (IST) | Source | Name | Email | Phone (raw) |
 *       Phone (normalized E.164) | Sector | Message | Page URL
 */

const HEADER_ORDER = [
  'Timestamp (IST)',
  'Source',
  'Name',
  'Email',
  'Phone (raw)',
  'Phone (normalized E.164)',
  'Sector',
  'Message',
  'Page URL',
];

const REQUIRED_FIELDS = ['name', 'email', 'phoneRaw'];
const TIMEZONE = 'Asia/Kolkata';

function getTargetSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  ensureHeaderRow_(sheet);
  return sheet;
}

function ensureHeaderRow_(sheet) {
  const range = sheet.getRange(1, 1, 1, HEADER_ORDER.length);
  const values = range.getValues()[0];
  const needsInit = HEADER_ORDER.some((h, i) => String(values[i] || '').trim() !== h);
  if (needsInit) {
    range.setValues([HEADER_ORDER]);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
}

function headerIndex_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || HEADER_ORDER.length)
    .getValues()[0]
    .map(h => String(h || '').trim());
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i + 1; });
  return idx;
}

function istTimestamp_() {
  const fmt = 'yyyy-MM-dd HH:mm:ss';
  try {
    return Utilities.formatDate(new Date(), TIMEZONE, fmt);
  } catch (_) {
    return new Date().toISOString().replace('T', ' ').substring(0, fmt.length);
  }
}

function validate_(body) {
  const errors = [];
  REQUIRED_FIELDS.forEach(k => {
    const v = body[k];
    if (typeof v !== 'string' || !v.trim()) errors.push(`Missing field: ${k}`);
  });
  if (typeof body.email === 'string' && body.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push('Invalid email');
  }
  if (typeof body.phoneRaw === 'string' && body.phoneRaw) {
    const digits = body.phoneRaw.replace(/\D/g, '');
    if (digits.length < 9) errors.push('Phone too short');
  }
  return errors;
}

function doPost(e) {
  const result = { ok: true, receivedAt: istTimestamp_() };
  try {
    let body = {};
    try {
      body = JSON.parse(e.postData.contents || '{}');
    } catch (parseErr) {
      return jsonOut_({ ok: false, error: 'Invalid JSON payload' }, 400);
    }

    const errors = validate_(body);
    if (errors.length) return jsonOut_({ ok: false, error: errors.join('; ') }, 400);

    const honeypot = String(body.website || '').trim();
    if (honeypot !== '') {
      console.warn('[enquiry] honeypot filled — skipping write. token=' + (body.token || '?'));
      return jsonOut_({ ok: true, spam: true });
    }

    const sheet = getTargetSheet_();
    const idx = headerIndex_(sheet);

    const rowObj = {
      'Timestamp (IST)': istTimestamp_(),
      'Source': String(body.source || 'unknown'),
      'Name': trunc_(body.name, 160),
      'Email': trunc_(body.email, 200).toLowerCase(),
      'Phone (raw)': trunc_(body.phoneRaw, 50),
      'Phone (normalized E.164)': trunc_(body.phoneE164 || '', 30),
      'Sector': trunc_(body.sector || '', 80),
      'Message': trunc_(body.message || '', 5000),
      'Page URL': trunc_(body.pageUrl || '', 500),
    };

    const lastCol = Math.max(...Object.values(idx), HEADER_ORDER.length);
    const row = new Array(lastCol).fill('');
    Object.keys(rowObj).forEach(colName => {
      const c = idx[colName];
      if (c) row[c - 1] = rowObj[colName];
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    result.row = rowObj;
    return jsonOut_(result);
  } catch (err) {
    console.error('[enquiry] doPost error:', err, err && err.stack);
    return jsonOut_({ ok: false, error: (err && err.message) || 'Server error' }, 500);
  }
}

// Health check — open the /exec URL directly in a browser to validate install.
function doGet(_e) {
  try {
    const sheet = getTargetSheet_();
    return jsonOut_({
      ok: true,
      service: 'InterCube enquiry intake',
      sheet: sheet.getName(),
      spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
      headersOk: true,
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: (err && err.message) || 'Setup error' }, 500);
  }
}

function jsonOut_(obj, statusCode) {
  const code = typeof statusCode === 'number' ? statusCode : 200;
  const body = JSON.stringify(Object.assign({}, obj, { status: code }));
  const out = ContentService.createTextOutput(body).setMimeType(MimeType.JSON);
  try {
    out.setHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  } catch (_) {
    // Older Apps Script runtimes don't support setHeaders here; fall through.
  }
  return out;
}

function trunc_(v, max) {
  const s = v == null ? '' : String(v);
  return s.length > max ? s.substring(0, max) : s;
}
