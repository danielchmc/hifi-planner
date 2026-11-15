/* One-off migration: old scripts/data.js -> v2 data/products.js (standard I/O, wireless flags, webp images).
   Usage: node tools/migrate.js <old data.js> <img dir> <out dir> */
const fs = require('fs'), vm = require('vm'), path = require('path');
const [, , SRC, IMG, OUT] = process.argv;
global.window = {}; require('../js/ports.js'); const P = window.HP.ports;
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(SRC, 'utf8') + ';this.products=products;', ctx);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const CATFIX = { 'Recievers': 'Receivers', 'Home Cinema Recievers': 'Home Cinema Receivers', 'Bluetooth Recievers': 'Bluetooth Receivers' };
const TAG = { RCA: 'rca', Minijack: 'minijack', 'Speaker Cable': 'speaker', HDMI: 'hdmi', Subwoofer: 'sub', Optical: 'optical', Ethernet: 'ethernet', USB: 'usb', COAXIAL: 'coax', Wireless: 'wireless', DIN: 'din' };
const WIFI_CATS = ['Streamers', 'Streamers with Radio', 'Amplifiers with Streaming', 'Compact Amplifiers with Streaming', 'Internet Radios', 'Multiroom Amplifiers', 'Home Cinema Receivers', 'Surround-Processors', 'TV', 'OLED', 'QLED'];
const WIFI_BRANDS = ['Sonos', 'Bluesound', 'HEOS By Denon'];
const imgs = new Set(fs.readdirSync(IMG));
const ids = {}, report = {}, out = [];
let droppedImg = 0;
for (const p of ctx.products) {
  let id = P.slug(p.brand + ' ' + p.name), i = 1; const base = id;
  while (ids[id]) id = base + '-' + ++i; ids[id] = 1;
  const cats = arr(p.category).map((c) => CATFIX[c] || c);
  const img = arr(p.image).map((u) => {
    if (/^https?:/.test(u)) return u;
    const f = path.basename(u).replace(/\.[a-z]+$/i, '.webp');
    if (!imgs.has(f)) { droppedImg++; return null; }
    return 'img/' + f;
  }).filter(Boolean);
  const q = { id, brand: p.brand, name: p.name, sku: p.sku || '', price: parseFloat(p.price) || 0, cats, img };
  if (cats.includes('Cable')) { q.cable = arr(p.tags).map((t) => TAG[t] || 'other'); out.push(q); continue; }
  let bt = false;
  const conv = (list, side) => P.uniqueKeys(arr(list).map((l) => {
    const r = P.parseLegacy(l, side);
    if (r && r.wireless) { bt = true; return null; }
    if (r) (report[l + ' | ' + side] = report[l + ' | ' + side] || { to: r.label, conn: r.conn, n: 0 }).n++;
    return r;
  }).filter(Boolean)).map(({ key, label, sig, conn, n, detail }) => ({ key, label, sig, conn, n, detail }));
  q.in = conv(p.inputs, 'in'); q.out = conv(p.outputs, 'out');
  const text = (p.name + ' ' + cats.join(' ')).toLowerCase();
  const wifi = /wi-?fi/.test(text) || cats.some((c) => WIFI_CATS.includes(c)) || WIFI_BRANDS.includes(p.brand);
  bt = bt || /bluetooth|\bbt\d?\b/.test(text) || wifi && !['Sonos'].includes(p.brand) && !cats.some((c) => ['TV', 'OLED', 'QLED'].includes(c));
  if (bt) q.bt = true; if (wifi) q.wifi = true;
  out.push(q);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'products.js'), '/* HiFi Planner catalogue. Edit through the in-app Editor (Admin). */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = ' + JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + ';\n');
const rows = Object.entries(report).sort().map(([k, v]) => `| ${k.split(' | ')[0]} | ${k.split(' | ')[1]} | ${v.to} | ${v.conn} | ${v.n} |`);
fs.writeFileSync(path.join(OUT, '..', 'tools', 'io-migration-report.md'), '# I/O name migration (old label -> standard)\n\n| Old label | Side | Standard label | Connector | Uses |\n|---|---|---|---|---|\n' + rows.join('\n') + '\n');
console.log('products', out.length, 'cables', out.filter((x) => x.cable).length, 'bt', out.filter((x) => x.bt).length, 'wifi', out.filter((x) => x.wifi).length, 'dropped images', droppedImg, 'distinct legacy labels', rows.length, 'distinct standard labels', new Set(Object.values(report).map((v) => v.to)).size);
