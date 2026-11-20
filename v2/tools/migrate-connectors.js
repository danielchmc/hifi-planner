/* Converts the connectors of the ports in data/own.js to the strict list in js/ports.js (CONNECTORS).
   No dependencies, Node 18+. Runs every hour before the catalogue build; it only changes ports whose connector is not on the list,
   so once everything is converted it does nothing (and writes nothing).

   node tools/migrate-connectors.js [app dir]

   Old values: 'coax' and 'sub' (a use of an RCA plug) → rca, 'trigger' → minijack, 'usb' → usba / usbb / usbc / microusb.
   USB without its type is decided from the label (USB-C, DAC, DRIVE…) and else from the product: inputs on sources and screens
   are USB-A (a stick or drive), on amplifiers, DACs and the rest USB-B (from a computer); outputs USB-A. These guesses are listed
   in build/connector-migration.md for checking in the Editor. */
const fs = require('fs'), path = require('path');
global.window = global.window || {};
require('../js/ports.js');
const P = window.HP.ports;

const APP = process.argv[2] || path.join(__dirname, '..');
const ownFile = path.join(APP, 'data', 'own.js');
const text = fs.readFileSync(ownFile, 'utf8');
const at = text.indexOf('window.HP_DATA.own');
global.window.HP_DATA = {}; new Function('window', text)(global.window);
const own = global.window.HP_DATA.own || [];
// the product kind from the last build (source, display, amplifier…)
const kindOf = (() => { try { global.window.HP_DATA = {}; new Function('window', fs.readFileSync(path.join(APP, 'build', 'app-products.js'), 'utf8'))(global.window); return new Map((global.window.HP_DATA.products || []).map((p) => [p.id, p.kind])); } catch (e) { return new Map(); } })();

const R = { ports: 0, products: 0, byOld: {}, usbGuess: [] };
for (const o of own) {
  let changed = false;
  for (const side of ['in', 'out']) {
    for (const p of o[side] || []) {
      if (P.CONNECTORS[p.conn]) continue;
      const old = p.conn;
      let c = P.conn(old, p, side);
      if (old === 'usb') {
        const l = String(p.label || '').toUpperCase(), told = p.sig === 'usbc' || /USB[- ]?[ABC]\b|TYPE[- ]?C|MICRO|\bPC\b|COMPUTER|DAC|AUDIO|DRIVE|STORAGE|HOST|MEDIA|SERVICE|POWER|CHARG/.test(l);
        if (!told) {
          const k = kindOf.get(o.id);
          c = side === 'out' ? 'usba' : ['source', 'display', 'projector'].includes(k) ? 'usba' : 'usbb';
          R.usbGuess.push(o.brand + ' ' + o.name + ': ' + p.label + ' → ' + P.CONNECTORS[c] + (k ? ' (' + k + ')' : ''));
        }
      }
      p.conn = c; changed = true; R.ports++;
      const k = old + ' → ' + c; R.byOld[k] = (R.byOld[k] || 0) + 1;
    }
  }
  if (changed) R.products++;
}
const L = ['# Connector migration ' + new Date().toISOString().slice(0, 10), ''];
if (!R.ports) L.push('Nothing to convert: every port in data/own.js uses a connector from the list in js/ports.js.');
else {
  fs.writeFileSync(ownFile, text.slice(0, at) + 'window.HP_DATA.own = [\n' + own.map((o) => JSON.stringify(o)).join(',\n') + '\n];\n');
  L.push('Converted ' + R.ports + ' ports on ' + R.products + ' products in data/own.js:', '', ...Object.entries(R.byOld).sort((a, b) => b[1] - a[1]).map(([k, n]) => '- ' + k + ': ' + n));
  if (R.usbGuess.length) L.push('', '## USB ports decided from the product (check in the Editor)', '', ...R.usbGuess.map((x) => '- ' + x));
}
fs.mkdirSync(path.join(APP, 'build'), { recursive: true });
if (R.ports || !fs.existsSync(path.join(APP, 'build', 'connector-migration.md'))) fs.writeFileSync(path.join(APP, 'build', 'connector-migration.md'), L.join('\n') + '\n');
console.log(R.ports ? 'Connectors: converted ' + R.ports + ' ports on ' + R.products + ' products (' + R.usbGuess.length + ' USB guesses, see build/connector-migration.md)' : 'Connectors: nothing to convert');
if (process.env.GITHUB_STEP_SUMMARY && R.ports) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n\n');
