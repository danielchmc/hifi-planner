/* One-off, 2026-11-23. Run once from the repository: node v2/tools/fix-2026-11-23-line-in.js  (safe to run again).
   Sonos Line-In Adapter (sonos-line-in-adapter): its plugs were worked out as a plug at both ends. It is a USB-C plug with a
   minijack socket, so it can sit in a cable chain like a Y-splitter: source → minijack cable → Line-In Adapter → the Sonos
   speaker's USB-C port. Sets the plugs by hand in data/own.js (eg/ech, as the Editor does), as for the Combo Adapter.
   It also gets its SKU, SONLINEINADAPT (the website's product SKU): it came from the old planner without one. */
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'own.js');
const text = fs.readFileSync(file, 'utf8'), nl = text.includes('\r\n') ? '\r\n' : '\n';
let done = false, found = false;
const out = text.split(/\r?\n/).map((line) => {
  if (!line.startsWith('{"id":"sonos-line-in-adapter"')) return line;
  found = true;
  const comma = /,\s*$/.test(line), o = JSON.parse(line.replace(/,\s*$/, ''));
  if (JSON.stringify(o.ends) === '["usbc","minijack"]' && JSON.stringify(o.eg) === '["m","f"]' && o.sku) return line;
  if (!o.sku) o.sku = 'SONLINEINADAPT';
  // key order as the Editor writes it: … cable, ends, eg, ech, …
  const e = {};
  Object.keys(o).forEach((k) => { if (k === 'eg' || k === 'ech') return; e[k] = o[k]; if (k === 'ends') { e.eg = ['m', 'f']; e.ech = [2, 2]; } });
  e.ends = ['usbc', 'minijack']; if (!e.eg) { e.eg = ['m', 'f']; e.ech = [2, 2]; }
  done = true;
  return JSON.stringify(e) + (comma ? ',' : '');
});
if (!found) { console.log('sonos-line-in-adapter is not in data/own.js: nothing written'); process.exit(1); }
if (!done) { console.log('Nothing to change: already done.'); process.exit(0); }
fs.writeFileSync(file, out.join(nl));
console.log('Sonos Line-In Adapter: SKU SONLINEINADAPT, USB-C plug ↔ minijack socket\nWritten: ' + file);
