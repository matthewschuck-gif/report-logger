/**
 * Report Logger -- Apps Script version (off Supabase).
 *
 * The page (Index.html, made from the GitHub page by tools/split-for-apps-script.js) is served
 * here. Bound to the "Personal Notes - Tracker 26-27" Sheet.
 *   - Reading report photos: rlExtract calls Claude with the key in Script Properties (saved
 *     from the menu). The old Supabase proxy it used is gone, so photo reading was broken.
 *   - Logging: rlLog appends rows to LOG_TAB, matching that tab's headers by name (Student,
 *     Date, Description, Type, Parent Contact, Consequence, Notes, PowerSchool). A tab with no
 *     headers gets these headers.
 *   - Access: only the Sheet owner and ALLOWED_EMAILS (these are personal notes). Google sign-in
 *     replaces the PIN that was in the public page code.
 */

const RL_DEFAULTS_ = [
  ['LOG_TAB', '', 'Tab the logged rows go to. Blank = the first tab.'],
  ['ALLOWED_EMAILS', '', 'Who else may use Report Logger (comma separated). The Sheet owner always can.'],
  ['AI', 'ON', 'ON = "Read images" uses Claude (key saved from the Report Logger menu). OFF = type entries by hand.'],
  ['CLAUDE_MODEL', 'claude-sonnet-5-5', 'Claude model that reads the report photos.'],
  ['AI_MAX_TOKENS', '4000', 'Longest answer Claude may write.'],
];
const RL_FIELDS_ = [
  ['student', 'Student', /student|name/i], ['date', 'Date', /^date|incident date/i], ['description', 'Description', /descr|what happened|summary/i],
  ['type', 'Type', /^type/i], ['parentContact', 'Parent Contact', /parent|contact/i], ['consequenceType', 'Consequence', /consequ/i],
  ['notes', 'Notes', /^notes?/i], ['powerschool', 'PowerSchool', /power\s*school|ps\b/i],
];

function doGet() {
  if (!allowed_()) {
    return HtmlService.createHtmlOutput('<p style="font:16px system-ui;padding:24px">Report Logger is private. Open it with an allowed school Google account.</p>');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Report Logger')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function rlSetting_(key) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (sh) {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]).trim() === key) return String(rows[i][1] == null ? '' : rows[i][1]).trim();
  }
  const d = RL_DEFAULTS_.filter(function (x) { return x[0] === key; })[0];
  return d ? d[1] : '';
}

function me_() { try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }

function allowed_() {
  const email = me_();
  if (!email) return false;
  let owner = '';
  try { owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { /* none */ }
  return email === owner || rlSetting_('ALLOWED_EMAILS').toLowerCase().split(',').map(function (s) { return s.trim(); }).indexOf(email) > -1;
}

function requireAllowed_() { if (!allowed_()) throw new Error('Report Logger is private to the Sheet owner and ALLOWED_EMAILS.'); }

/** Reads report photos with the AI that is on (Claude or Gemini, see AiSwitch.gs). images: [{ base64, mediaType }]; system: the page's prompt. */
function rlExtract(imagesJson, system) {
  requireAllowed_();
  if (String(rlSetting_('AI')).toUpperCase() === 'OFF') throw new Error('Reading images is turned off on the Settings tab. Type the entries instead.');
  if (!emsAiHasKey_()) throw new Error('No ' + (emsAiProvider_() === 'GEMINI' ? 'Gemini' : 'Claude') + ' key yet: Report Logger menu › AI: Claude or Gemini › Save the key.');
  const images = JSON.parse(imagesJson || '[]');
  if (!images.length) throw new Error('Add at least one image.');
  const content = images.slice(0, 10).map(function (img) {
    return { type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } };
  }).concat([{ type: 'text', text: 'Analyze these ' + images.length + ' image(s) and return the JSON array.' }]);
  const res = emsAiFetch_({
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: rlSetting_('CLAUDE_MODEL') || 'claude-sonnet-5-5', max_tokens: Number(rlSetting_('AI_MAX_TOKENS')) || 4000,
      system: String(system || ''), messages: [{ role: 'user', content: content }] }),
  });
  const data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200) throw new Error((data.error && data.error.message) || 'The AI returned ' + res.getResponseCode());
  const text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return JSON.stringify({ text: text });
}

/** Logs the reviewed entries. Returns { success, count }. */
function rlLog(rowsJson) {
  requireAllowed_();
  const rows = JSON.parse(rowsJson || '[]').filter(function (r) { return String(r.student || '').trim(); });
  if (!rows.length) throw new Error('Nothing to log: every entry needs a student.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = rlSetting_('LOG_TAB');
  const sh = name ? (ss.getSheetByName(name) || ss.insertSheet(name)) : ss.getSheets().filter(function (s) { return s.getName() !== 'Settings'; })[0];
  let headers = sh.getLastRow() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String) : [];
  if (!headers.filter(String).length) {
    headers = ['Logged'].concat(RL_FIELDS_.map(function (f) { return f[1]; }));
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  // Each header → the field it holds (first match wins; a header nothing matches stays blank).
  const used = {};
  const map = headers.map(function (h) {
    if (/^logged|timestamp/i.test(h)) return '__logged';
    const f = RL_FIELDS_.filter(function (x) { return !used[x[0]] && x[2].test(String(h).trim()); })[0];
    if (f) used[f[0]] = true;
    return f ? f[0] : '';
  });
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const out = rows.map(function (r) { return map.map(function (k) { return k === '__logged' ? stamp : k ? String(r[k] == null ? '' : r[k]) : ''; }); });
    sh.getRange(sh.getLastRow() + 1, 1, out.length, headers.length).setValues(out);
  } finally {
    lock.releaseLock();
  }
  return JSON.stringify({ success: true, count: rows.length });
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

// ── MENU ────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Report Logger')
    .addItem('Run setup (Settings tab)', 'rlSetup')
    .addSubMenu(emsAiMenu_(SpreadsheetApp.getUi()))
    .addToUi();
}

function rlSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Settings');
  if (!sh) { sh = ss.insertSheet('Settings'); sh.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Notes']]).setFontWeight('bold'); }
  const have = {};
  sh.getDataRange().getValues().slice(1).forEach(function (r) { have[String(r[0]).trim()] = true; });
  const missing = RL_DEFAULTS_.filter(function (d) { return !have[d[0]]; });
  if (missing.length) sh.getRange(sh.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  try { SpreadsheetApp.getUi().alert('Report Logger is set up. Next: Report Logger › AI: Claude or Gemini › Save the key, then Deploy › New deployment › Web app (Execute as Me, Anyone within EASD).'); } catch (e) { /* trigger */ }
}

