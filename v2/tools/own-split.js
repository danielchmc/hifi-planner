/* HiFi Planner own layer (stage 3): splits today's catalogue (data/products.js) into what HiFi Planner itself adds.
   Writes data/own.js. No dependencies, Node 18+. Reads data/products.js and mirror/listing.jsonl, writes nothing else.

   node tools/own-split.js [app dir]

   Until the app switches to the generated catalogue, data/products.js is still the master (the Editor and the sync write it), so
   this runs every hour before the catalogue build and data/own.js always follows it. At the switch, data/own.js becomes the
   master and this tool is retired.

   One entry per catalogue product, in catalogue order:
     id, brand, name, sku       HiFi Planner's own (the id is what saved drawings and Shortcuts refer to)
     img, in, out, cable        picked images, ports, cable connectors
     cats                       today's categories (legacy, replaced by the website category at the switch)
     bt, wifi, manualWireless   Bluetooth/WiFi as set today (the website can only add them, unless manualWireless)
     review, auto               review status, date added by the sync
     link                       the website product it follows: { site: product SKU, v: variant SKU when the card is one variant
                                (a cable length), single: true when the card is one speaker of a pair sold as a pair }
     frozen                     for products the website no longer lists (or never did): the last website facts
                                (price, was, vars, url, site, gone), kept as they are */
const fs = require('fs'), path = require('path');
const { sellable, matcher, webFacts } = require('./site-match.js');

const APP = process.argv[2] || path.join(__dirname, '..');
const read = (f, key) => { global.window = { HP_DATA: {} }; new Function('window', fs.readFileSync(f, 'utf8'))(global.window); return global.window.HP_DATA[key]; };
const products = read(path.join(APP, 'data', 'products.js'), 'products') || [];
const listing = fs.readFileSync(path.join(APP, 'mirror', 'listing.jsonl'), 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const match = matcher(sellable(listing));

const OWN = ['id', 'brand', 'name', 'sku', 'img', 'in', 'out', 'cable', 'cats', 'bt', 'wifi', 'manualWireless', 'review', 'auto'];
const WEB = ['price', 'was', 'vars', 'url', 'site', 'gone'];
const R = { linked: 0, frozen: 0, how: {} };
const own = products.map((p) => {
  const o = {};
  for (const k of OWN) if (p[k] !== undefined) o[k] = p[k];
  const m = p.gone ? null : match(p); // a discontinued product stays frozen until the sync brings it back
  if (m) {
    const single = /\(1 unit\)/i.test(p.name);
    o.link = { site: m.s.sku };
    if (m.exactVariant) o.link.v = m.v.sku;
    if (single && webFacts(m, { single, cable: !!p.cable, hk: (u) => u }).half) o.link.single = true;
    R.linked++; R.how[m.how] = (R.how[m.how] || 0) + 1;
  } else {
    const f = {}; for (const k of WEB) if (p[k] !== undefined) f[k] = p[k];
    o.frozen = f; R.frozen++;
  }
  return o;
});
const json = '[\n' + own.map((o) => JSON.stringify(o)).join(',\n') + '\n]';
fs.writeFileSync(path.join(APP, 'data', 'own.js'), '/* Written by tools/own-split.js: what HiFi Planner adds to the website\'s product data (see the tool). Not loaded by the app yet. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.own = ' + json + ';\n');
console.log('data/own.js: ' + own.length + ' products, ' + R.linked + ' linked to the website (' + Object.entries(R.how).map(([k, n]) => k + ' ' + n).join(', ') + '), ' + R.frozen + ' frozen');
