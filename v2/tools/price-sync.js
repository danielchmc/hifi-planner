/* HiFi Planner catalogue sync: mirrors hifiklubben.dk into data/. Runs every hour on GitHub (workflow "Catalogue sync").
   No dependencies, Node 18+.

   node tools/price-sync.js <data dir> [--fixture <listing file>] [--details-fixture <file>] [--pages N] [--dry]
     --fixture          read the product listing from a file (one JSON product per line) instead of the website
     --details-fixture  read product-page details from a JSON file { SITESKU: {spec, gallery, avail} } instead of the website
     --pages N          product pages to (re)read this run, default 60 (new products first, then the oldest)
     --dry              report only, write nothing

   What it does each run:
   1. Reads the whole listing (~1,400 products; outlet/demo units excluded).
   2. Matches every catalogue product (SKU exact, colour-suffix prefix, then unique brand+model name) and updates its price,
      discount ("was"), colour variants ("vars") and the discontinued mark ("gone"). Prices are left alone and reported when the
      change is implausible (outside -35%/+60%) or when one SKU is used by several catalogue products.
   3. Adds website products of a relevant type (amplifiers, speakers, TVs, sources, cables...) that are not in the catalogue,
      marked "review" with inputs/outputs suggested from the website's specs. Products listed in data/site-ignore.js are skipped.
   4. Reads a batch of product pages for the image gallery, connection specs, Bluetooth/WiFi and availability
      (data/site-details.js, admins only), and applies Bluetooth/WiFi unless an admin set it by hand.
   5. Writes data/site-new.js (remaining website products, mostly accessories) and data/price-sync.js (status). */
const fs = require('fs'), path = require('path');
global.window = global.window || {};
require('../js/ports.js'); require('../js/site.js');
const P = window.HP.ports, S = window.HP.site;

const args = process.argv.slice(2), DIR = args[0] || 'data', DRY = args.includes('--dry');
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const FIXTURE = opt('--fixture'), DETAILS_FIXTURE = opt('--details-fixture'), PAGES = +(opt('--pages') || 60);
const BASE = 'https://www.hifiklubben.dk', MIN_SITE_PRODUCTS = 800; // the listing is ~1,400 products; less means a partial answer
const TODAY = new Date().toISOString().slice(0, 10);
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const UA = { 'User-Agent': 'Mozilla/5.0 (HiFi Planner catalogue sync; +https://hifiplanner.dk)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- data files ---------- */
const readData = (name, key, dflt) => {
  const f = path.join(DIR, name); if (!fs.existsSync(f)) return dflt;
  global.window.HP_DATA = {}; new Function('window', fs.readFileSync(f, 'utf8'))(global.window);
  const v = global.window.HP_DATA[key]; return v == null ? dflt : v;
};
const writeData = (name, key, value, comment, splitOn) => {
  let json = JSON.stringify(value);
  if (splitOn) json = json.split(splitOn).join(splitOn.slice(0, 2) + '\n' + splitOn.slice(2)); // one product per line keeps git diffs readable
  fs.writeFileSync(path.join(DIR, name), '/* ' + comment + ' */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.' + key + ' = ' + json + ';\n');
};

/* ---------- website ---------- */
async function fetchSite() {
  const body = { facets: {}, constraints: {}, pageSize: 50, sortBy: 'MostPopular', outlet: 'false', source: 'Product Listing Page', query: '', page: 0, type: 'category', currency: 'DKK', locale: 'da-DK', user: { classifications: { country: 'dk' } } };
  const out = [];
  for (let page = 0; page < 200; page++) {
    body.page = page;
    const r = await fetch(BASE + '/_search', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, UA), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('hifiklubben.dk answered ' + r.status + ' on page ' + page);
    const results = ((await r.json()).products || {}).results || [];
    results.forEach((p) => out.push(fromApi(p)));
    if (results.length < 50) break;
  }
  return out;
}
const fromApi = (p) => ({ brand: p.brandName, model: p.modelName, sku: p.skuCode, type: p.modelType, url: p.url, bundle: !!p.isBundle,
  variants: (p.variants || []).map((v) => ({ sku: v.sku, price: v.priceDetails && v.priceDetails.price, before: v.priceDetails && v.priceDetails.priceBefore,
    unit: v.priceDetails && v.priceDetails.rawSalesUnit, image: v.image, label: v.label || v.color, key: v.colorKey, hex: v.colorCode, url: v.url })) });
const readFixture = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => {
  const j = JSON.parse(l.replace(/^﻿/, ''));
  if (j.brandName) return fromApi(j);
  return { brand: j.brand, model: j.model, sku: j.sku, type: j.type, url: j.url, bundle: !!j.bundle,
    variants: j.variants.map((v) => ({ sku: v.sku, price: v.price && typeof v.price === 'object' ? v.price.price : v.price, before: v.price && typeof v.price === 'object' ? v.price.priceBefore || v.price.before : v.before,
      unit: v.price && v.price.unit, image: v.image, label: v.label || v.color, key: v.key, hex: v.hex, url: v.url })) };
});
async function fetchDetails(s) {
  const r = await fetch(BASE + s.url, { headers: UA });
  if (!r.ok) throw new Error(r.status);
  return S.parsePage(await r.text());
}

/* ---------- matching ---------- */
function matcher(site) {
  const exact = new Map(), byName = new Map();
  site.forEach((s) => {
    s.variants = s.variants.filter((v) => v.sku && v.price > 0);
    if (!s.variants.length) return;
    if (s.sku) exact.set(s.sku.toUpperCase(), { s });
    s.variants.forEach((v) => exact.set(v.sku.toUpperCase(), { s, v }));
    const nk = norm(s.brand + s.model); byName.set(nk, byName.has(nk) ? 'ambiguous' : s); // e.g. one TV model in four sizes
  });
  const lowest = (s) => s.variants.reduce((a, b) => (b.price < a.price ? b : a));
  return (p) => {
    const sku = (p.sku || '').toUpperCase();
    if (sku && exact.has(sku)) { const h = exact.get(sku); return { how: h.v ? 'variant-sku' : 'sku', s: h.s, v: h.v || lowest(h.s), exactVariant: !!h.v }; }
    if (sku.length >= 5) { // catalogue SKU without the colour suffix; only colour/finish suffixes count: "NADM23" must not match "NADM23V2SI"
      const hits = new Set(); for (const [k, h] of exact) if (k.startsWith(sku) && /^[A-Z]{0,8}$/.test(k.slice(sku.length))) hits.add(h.s);
      let list = [...hits];
      if (list.length > 1) list = list.filter((s) => norm(s.brand + s.model) === norm(p.brand + p.name));
      if (list.length === 1) return { how: 'sku-prefix', s: list[0], v: lowest(list[0]) };
    }
    const n = byName.get(norm(p.brand + p.name));
    return n && n !== 'ambiguous' ? { how: 'name', s: n, v: lowest(n) } : null;
  };
}
const uuidOf = (u) => { const m = /image\/([0-9a-f-]{36})/.exec(u || ''); return m ? m[1] : null; };

(async () => {
  const products = readData('products.js', 'products', []);
  const details = readData('site-details.js', 'siteDetails', {});
  const ignore = new Set(readData('site-ignore.js', 'siteIgnore', []).map((s) => s.toUpperCase()));
  const site = FIXTURE ? readFixture(FIXTURE) : await fetchSite();
  if (site.length < MIN_SITE_PRODUCTS) throw new Error('Only ' + site.length + ' products came back from hifiklubben.dk. Refusing to touch the catalogue.');
  const bySku = new Map(site.map((s) => [String(s.sku).toUpperCase(), s]));
  const match = matcher(site);
  const skuCount = {}; products.forEach((p) => { if (p.sku) skuCount[p.sku.toUpperCase()] = (skuCount[p.sku.toUpperCase()] || 0) + 1; });
  const dupSku = new Set(Object.keys(skuCount).filter((k) => skuCount[k] > 1));
  const R = { changed: [], suspicious: [], discounts: [], unmatched: [], gone: [], back: [], added: [], details: 0, detailErrors: 0, wireless: 0, suggested: 0 };
  let dirty = false;
  const seen = new Set();

  /* 2. catalogue products */
  for (const p of products) {
    const m = match(p);
    if (!m) {
      R.unmatched.push(p.brand + ' ' + p.name + (p.sku ? ' [' + p.sku + ']' : ''));
      if (p.sku && !(p.cats || []).includes('Stand-in Products') && !p.gone) { p.gone = TODAY; dirty = true; R.gone.push(p.brand + ' ' + p.name + ' [' + p.sku + ']'); }
      continue;
    }
    seen.add(m.s);
    if (p.gone) { delete p.gone; dirty = true; R.back.push(p.brand + ' ' + p.name); }
    if (p.site !== m.s.sku) { p.site = m.s.sku; dirty = true; }
    const url = m.v.url || m.s.url; // product page path, e.g. /argon-audio-tt-mk2-pladespiller/argttmk2wa/
    if (url && p.url !== url) { p.url = url; dirty = true; }
    const half = /\(1 unit\)/i.test(p.name) && m.v.unit === 'pair' ? 0.5 : 1; // the card is one speaker, the website sells pairs
    // colour variants (not for cables: their website variants are lengths, and each length is its own catalogue card)
    const colours = !p.cable && !m.exactVariant && m.s.variants.length > 1 && new Set(m.s.variants.map((v) => v.label)).size > 1;
    const vars = colours ? m.s.variants.map((v) => { const o = { sku: v.sku, label: v.label || v.sku, price: Math.round(v.price * half) }; if (v.key) o.key = v.key; if (v.hex) o.hex = v.hex; if (v.before > v.price) o.was = Math.round(v.before * half); if (v.url) o.url = v.url; const u = uuidOf(v.image); if (u) o.img = S.hk(u); return o; }).sort((a, b) => a.price - b.price || a.label.localeCompare(b.label)) : null;
    if (JSON.stringify(vars || null) !== JSON.stringify(p.vars || null)) { if (vars) p.vars = vars; else delete p.vars; dirty = true; }
    const np = Math.round(m.v.price * half), before = m.v.before > m.v.price ? Math.round(m.v.before * half) : 0;
    const row = { name: p.brand + ' ' + p.name, old: p.price, new: np, how: m.how, site: m.s.brand + ' ' + m.s.model + ' / ' + m.v.sku };
    row.why = p.sku && dupSku.has(p.sku.toUpperCase()) && norm(m.s.brand + m.s.model) !== norm(p.brand + p.name) ? 'SKU is used by several catalogue products'
      : p.price > 0 && (np < p.price * 0.65 || np > p.price * 1.6) ? 'large change (over -35% / +60%), check by hand' : '';
    if (row.why) { if (np !== p.price) R.suspicious.push(row); continue; }
    if ((before || 0) !== (p.was || 0)) { if (before) p.was = before; else delete p.was; dirty = true; }
    if (before) R.discounts.push({ name: row.name, old: before, new: np, how: m.how, site: Math.round((1 - np / before) * 100) + '% off' });
    if (np !== p.price) { R.changed.push(row); p.price = np; dirty = true; }
  }

  /* 3. new website products of a relevant type */
  const ids = new Set(products.map((p) => p.id));
  for (const s of site) {
    if (seen.has(s) || s.bundle || !s.variants.length || /DummyVariant/i.test(s.variants[0].sku) || !S.relevant(s.type) || ignore.has(String(s.sku).toUpperCase())) continue;
    const v = s.variants.reduce((a, b) => (b.price < a.price ? b : a));
    let id = P.slug(s.brand + ' ' + s.model), i = 1; const base = id; while (ids.has(id)) id = base + '-' + ++i; ids.add(id);
    const p = { id, brand: s.brand, name: s.model, sku: s.sku, site: s.sku, url: v.url || s.url, price: Math.round(v.price), cats: [], img: [], auto: TODAY, review: true };
    if (v.before > v.price) p.was = Math.round(v.before);
    const u = uuidOf((s.variants[0] || {}).image) || uuidOf(v.image); if (u) p.img = [S.hk(u)];
    if (S.TYPE_CABLE[s.type]) { p.cats = ['Cable']; p.cable = S.TYPE_CABLE[s.type].slice(); }
    else { p.cats = S.TYPE_CATS[s.type].slice(); p.in = []; p.out = []; }
    if (new Set(s.variants.map((x) => x.label)).size > 1 && !p.cable) p.vars = s.variants.map((x) => { const o = { sku: x.sku, label: x.label || x.sku, price: Math.round(x.price) }; if (x.key) o.key = x.key; if (x.hex) o.hex = x.hex; if (x.before > x.price) o.was = Math.round(x.before); if (x.url) o.url = x.url; const uu = uuidOf(x.image); if (uu) o.img = S.hk(uu); return o; }).sort((a, b) => a.price - b.price || a.label.localeCompare(b.label));
    products.push(p); seen.add(s); dirty = true; R.added.push(p.brand + ' ' + p.name + ' [' + s.sku + '] · ' + s.type);
  }

  /* 4. product pages: gallery, specs, Bluetooth/WiFi, availability */
  const detailFixture = DETAILS_FIXTURE ? JSON.parse(fs.readFileSync(DETAILS_FIXTURE, 'utf8')) : null;
  const wanted = products.filter((p) => p.site && bySku.has(p.site.toUpperCase()));
  const queue = wanted.slice().sort((a, b) => ((details[a.site] || {}).t || '').localeCompare((details[b.site] || {}).t || '')).slice(0, detailFixture ? wanted.length : PAGES);
  for (const p of queue) {
    const s = bySku.get(p.site.toUpperCase());
    try {
      const d = detailFixture ? detailFixture[s.sku] : (await sleep(250), await fetchDetails(s));
      if (!d) continue;
      details[s.sku] = { g: d.gallery, spec: d.spec, avail: d.avail, t: TODAY };
      R.details++;
    } catch (e) { R.detailErrors++; }
  }
  for (const p of products) {
    const d = p.site && details[p.site]; if (!d) continue;
    const w = S.wireless(d.spec);
    // only ever switch ON: the website's lists are sometimes incomplete (e.g. a receiver with Bluetooth that only lists "Roon Tested")
    if (w && !p.manualWireless && !p.cable && ((w.bt && !p.bt) || (w.wifi && !p.wifi))) { if (w.bt) p.bt = true; if (w.wifi) p.wifi = true; R.wireless++; dirty = true; }
    if (p.review && !p.cable && !(p.in || []).length && !(p.out || []).length) {
      const sug = S.suggestPorts(d.spec, p.cats);
      if (sug.in.length || sug.out.length) { p.in = sug.in.map(({ key, label, sig, conn, n, detail }) => ({ key, label, sig, conn, n, detail })); p.out = sug.out.map(({ key, label, sig, conn, n, detail }) => ({ key, label, sig, conn, n, detail })); R.suggested++; dirty = true; }
    }
    if (d.avail === 'Discontinued' && !p.gone) { p.gone = TODAY; dirty = true; R.gone.push(p.brand + ' ' + p.name + ' [' + p.site + '] (marked discontinued on its page)'); }
  }

  /* 5. leftovers + report */
  const fresh = site.filter((s) => !seen.has(s) && !s.bundle && s.variants.length && !/DummyVariant/i.test(s.variants[0].sku) && !ignore.has(String(s.sku).toUpperCase())).map((s) => {
    const v = s.variants.reduce((a, b) => (b.price < a.price ? b : a)), u = uuidOf(v.image);
    return { sku: s.sku, brand: s.brand, model: s.model, type: s.type || '', price: Math.round(v.price), was: v.before > v.price ? Math.round(v.before) : undefined, url: s.url ? BASE + s.url : '', image: u ? S.hk(u) : '', variants: s.variants.length };
  });
  const similar = (p) => { const n = norm(p.name.replace(/\(1 unit\)/i, '')); return site.filter((s) => norm(s.brand) === norm(p.brand) && norm(s.model) !== n && norm(s.model).startsWith(n.replace(/(mk)?\d+$|ii+$/, '')) && Math.abs(norm(s.model).length - n.length) <= 5).slice(0, 3).map((s) => s.model + ' [' + s.sku + ']'); };
  const md = ['## HiFi Planner catalogue sync', '',
    `Website products: **${site.length}** · catalogue: **${products.length}** · prices changed: **${R.changed.length}** · on discount: **${R.discounts.length}** · check by hand: **${R.suspicious.length}**`, '',
    `Added from the website: **${R.added.length}** · discontinued today: **${R.gone.length}** · back again: **${R.back.length}** · product pages read: **${R.details}** (errors ${R.detailErrors}) · Bluetooth/WiFi added: **${R.wireless}** · port suggestions: **${R.suggested}** · other website products (mostly accessories): **${fresh.length}**`, ''];
  const table = (title, rows) => rows.length && md.push('### ' + title, '', '| Product | Old | New | Matched by | Website product | Note |', '|---|---:|---:|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.old} | ${r.new} | ${r.how} | ${r.site} | ${r.why || ''} |`), '');
  table('Price changes', R.changed); table('Check by hand (left unchanged)', R.suspicious); table('On discount (Old = price before discount)', R.discounts);
  const list = (title, rows) => rows.length && md.push('### ' + title + ' (' + rows.length + ')', '', rows.map((r) => '- ' + r).join('\n'), '');
  list('Added from the website (marked for review)', R.added); list('Newly discontinued', R.gone);
  list('All discontinued products still in HiFi Planner', products.filter((p) => p.gone).map((p) => { const sim = similar(p); return p.brand + ' ' + p.name + ' [' + p.sku + '] since ' + p.gone + (sim.length ? ' · maybe replaced by: ' + sim.join(', ') : ''); }));
  const report = md.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  if (DRY) return;
  if (dirty) writeData('products.js', 'products', products, 'HiFi Planner products. Edit through the app (Admin), not by hand.', '},{"id"');
  writeData('site-details.js', 'siteDetails', details, 'Written by tools/price-sync.js: hifiklubben.dk product pages (gallery, connection specs, availability). Admins only.', '},"');
  writeData('site-new.js', 'siteNew', fresh, 'Written by tools/price-sync.js: hifiklubben.dk products not in HiFi Planner (mostly accessories). Admins only.', '},{"sku"');
  writeData('price-sync.js', 'priceSync', { date: new Date().toISOString(), products: products.length, changed: R.changed.length, discounts: R.discounts.length, added: R.added.length, gone: products.filter((p) => p.gone).length, review: products.filter((p) => p.review).length }, 'Written by tools/price-sync.js.');
  if (!fs.existsSync(path.join(DIR, 'site-ignore.js'))) writeData('site-ignore.js', 'siteIgnore', [], 'Website SKUs the catalogue sync must not add (written when an admin deletes or ignores a website product).');
})().catch((e) => { console.error('Catalogue sync failed: ' + e.message); process.exit(1); });
