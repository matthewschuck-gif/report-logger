// Offline checks for the Report Logger Apps Script version.   node tests/rl.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
let passed = 0;
const test = (n, f) => { f(); passed++; console.log('ok - ' + n); };

function world(headers, props = {}) {
  const fetched = [];
  const tab = { rows: headers ? [headers] : [], getName: () => 'Log 26-27',
    getLastRow() { return this.rows.length; }, getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); },
    getRange(r, c, nr, nc) { const t = this; let p; const api = {
      getValues: () => [Array.from({ length: nc }, (_, j) => (t.rows[r - 1] || [])[c - 1 + j] || '')],
      setValues(v) { v.forEach((row, i) => { t.rows[r - 1 + i] = t.rows[r - 1 + i] || []; row.forEach((x, j) => { t.rows[r - 1 + i][c - 1 + j] = x; }); }); return p; } };
      p = new Proxy(api, { get: (o, k) => k in o ? o[k] : () => p }); return p; } };
  const user = { email: 'owner@easdpa.org' };
  const ctx = { console, JSON, Math, Date, Object, Array, String, Number,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null, getSheets: () => [tab], insertSheet: () => tab }) },
    Session: { getActiveUser: () => ({ getEmail: () => user.email }), getEffectiveUser: () => ({ getEmail: () => 'owner@easdpa.org' }), getScriptTimeZone: () => 'America/New_York' },
    Utilities: { formatDate: () => '2026-11-01 08:00' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch: (url, o) => { fetched.push({ url, body: JSON.parse(o.payload) }); const g = url.includes('generativelanguage'); const b = g ? { candidates: [{ content: { parts: [{ text: '[{"student":"A"}]' }] }, finishReason: 'STOP' }] } : { content: [{ type: 'text', text: '[]' }] }; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(b) }; } } };
  ctx.SpreadsheetApp.openById = () => { throw new Error('no master in tests'); };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/AiSwitch.gs'), 'utf8'), ctx);
  return { ctx, tab, user, fetched };
}
const entry = { student: 'Ann Lee', date: '2026-10-31', description: 'Hallway', type: 'Information', parentContact: 'Call', consequenceType: 'Warning', notes: 'n', powerschool: 'Y' };

test('logs into an existing tab by its header names, in its own column order', () => {
  const w = world(['Timestamp', 'Date', 'Student Name', 'Type', 'Description', 'Consequence', 'Parent Contact', 'Notes', 'PowerSchool', 'Other']);
  assert.deepStrictEqual(JSON.parse(w.ctx.rlLog(JSON.stringify([entry, { student: ' ' }]))), { success: true, count: 1 });
  assert.deepStrictEqual(w.tab.rows[1], ['2026-11-01 08:00', '2026-10-31', 'Ann Lee', 'Information', 'Hallway', 'Warning', 'Call', 'n', 'Y', '']);
});

test('an empty tab gets headers', () => {
  const w = world(null);
  w.ctx.rlLog(JSON.stringify([entry]));
  assert.deepStrictEqual(w.tab.rows[0], ['Logged', 'Student', 'Date', 'Description', 'Type', 'Parent Contact', 'Consequence', 'Notes', 'PowerSchool']);
});

test('private: only the owner (or ALLOWED_EMAILS); no key = clear message', () => {
  const w = world(null);
  w.user.email = 'someone@easdpa.org';
  assert.throws(() => w.ctx.rlLog(JSON.stringify([entry])), /private/);
  w.user.email = 'owner@easdpa.org';
  assert.throws(() => w.ctx.rlExtract(JSON.stringify([{ base64: 'x' }]), 'sys'), /No Claude key/);
});

test('AI switch: Gemini reads the photos when it is on; Claude otherwise', () => {
  let w = world(null, { AI_PROVIDER_HERE: 'GEMINI', GEMINI_API_KEY: 'g' });
  assert.strictEqual(JSON.parse(w.ctx.rlExtract(JSON.stringify([{ base64: 'AAA', mediaType: 'image/png' }]), 'sys')).text, '[{"student":"A"}]');
  assert.ok(w.fetched[0].url.includes('generativelanguage') && w.fetched[0].body.contents[0].parts[0].inlineData.mimeType === 'image/png');
  assert.throws(() => world(null, { AI_PROVIDER_HERE: 'GEMINI', ANTHROPIC_API_KEY: 'a' }).ctx.rlExtract(JSON.stringify([{ base64: 'x' }]), 'sys'), /No Gemini key/);
  w = world(null, { ANTHROPIC_API_KEY: 'a' });
  w.ctx.rlExtract(JSON.stringify([{ base64: 'x' }]), 'sys');
  assert.ok(w.fetched[0].url.includes('anthropic.com'));
});

test('page copy: no Supabase key, no PIN, scripts parse', () => {
  const h = fs.readFileSync(path.join(__dirname, '../apps-script/Index.html'), 'utf8');
  assert.ok(!/eyJhbGci|supabase\.co|'5064'/.test(h));
  [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].forEach(m => new vm.Script(m[1]));
});

console.log('\n' + passed + ' tests passed');
