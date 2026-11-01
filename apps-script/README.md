# Report Logger: Apps Script version (not live yet)

The GitHub page read report photos through a Supabase proxy that no longer exists, so photo
reading is broken. Its PIN (5064) is also in the public page code.

This version:
- runs from Apps Script, bound to the **Personal Notes - Tracker 26-27** Sheet
- uses Google sign-in: only the Sheet owner, plus anyone in Settings › `ALLOWED_EMAILS`
- reads photos with Claude, using a key saved from the menu
- logs to the first tab, matching your existing column headers by name

**Files:**
- `Code.gs`
- `Index.html`, made from `index.html` by `tools/split-for-apps-script.js`

**Setup:**
1. Open the Sheet › **Extensions › Apps Script**.
2. Replace the old script's code with `Code.gs`. The old deployment keeps running its old
   version until you switch.
3. **+ › HTML**, name it `Index`, and paste `Index.html`.
4. **Report Logger › Run setup**, then **Save Claude API key…**
5. **Deploy › New deployment › Web app** (Execute as Me; Anyone within EASD). Use that link
   (bit.ly/ems-reportlogger).

**Tests:**
```bash
node tests/rl.test.js
```
