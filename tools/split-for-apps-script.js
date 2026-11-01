// One-time copy: index.html (GitHub) → apps-script/Index.html, served by Code.gs.
//   node tools/split-for-apps-script.js   (add --force to overwrite an existing copy)
// Changes: photo reading goes to rlExtract (the Supabase proxy is gone), logging goes to rlLog,
// the PIN gate is removed (Google sign-in in Code.gs), and the Supabase key is dropped.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dest = path.join(root, 'apps-script', 'Index.html');
if (fs.existsSync(dest) && !process.argv.includes('--force')) { console.error('apps-script/Index.html exists (may have edits). Use --force.'); process.exit(1); }
let s = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const must = (from, to) => { if (!s.includes(from)) throw new Error('not found: ' + from.slice(0, 70)); s = s.split(from).join(to); };

const RUN = `// Server calls (Code.gs) through google.script.run. Replies are JSON text.
function rlRun(fn, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run.withSuccessHandler(t => resolve(JSON.parse(t)))
      .withFailureHandler(e => reject(new Error(String(e && e.message || e).replace(/^Exception:\\s*/, ''))))[fn](...args);
  });
}
`;
// Constants: no Apps Script URL, Sheet ID or Supabase proxy/key in the page any more.
s = s.replace(/const APPS_SCRIPT_URL = "[^"]*";\n/, '');
s = s.replace(/const SPREADSHEET_ID\s*= "[^"]*";\n/, '');
s = s.replace(/const PROXY_URL\s*= "[^"]*";\n/, '');
s = s.replace(/const SUPABASE_ANON\s*= "[^"]*";\n/, RUN);
// Photo reading.
must(`    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${SUPABASE_ANON}\` },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    const raw = data.content?.find(b => b.type === "text")?.text || "[]";`,
`    // Claude reads the photos on the server (Code.gs rlExtract; key in Script Properties).
    const imgs = content.filter(b => b.type === "image").map(b => ({ base64: b.source.data, mediaType: b.source.media_type }));
    const data = await rlRun('rlExtract', JSON.stringify(imgs), SYSTEM_PROMPT);
    const raw = data.text || "[]";`);
// Logging.
s = s.replace(/    const res = await fetch\(APPS_SCRIPT_URL, \{[\s\S]*?\n    \}\);\n    const data = await res\.json\(\);/,
  "    const data = await rlRun('rlLog', JSON.stringify(valid)); // Code.gs rlLog");
s = s.replace(/  \} catch\(err\) \{\n    \/\/ CORS fallback \(fire-and-forget\)[\s\S]*?\n    \}\n  \}\n\}/,
  "  } catch(err) {\n    document.getElementById('error-body').textContent = 'Could not log the entries: ' + err.message;\n    showScreen('error');\n  }\n}");
// PIN gate: signed in with Google instead (Code.gs only serves the page to allowed accounts).
must("if (sessionStorage.getItem(KEY) === '1') { unlock(); return; }", 'unlock(); return; // signed in with Google (Code.gs)');
must("if (val === '5064') {", 'if (false) { // the PIN is gone: Google sign-in (Code.gs)');
if (/supabase|5064|fetch\(/i.test(s.replace(/\/\/.*$/mg, ''))) console.warn('check: supabase/PIN/fetch still mentioned');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, s);
console.log('apps-script/Index.html', fs.statSync(dest).size, 'bytes');
