/* HiFi Planner raw mirror of hifiklubben.dk. Runs every hour on GitHub after the catalogue sync (workflow "Catalogue sync").
   No dependencies, Node 18+. Separate from price-sync.js on purpose: if the website changes, the mirror can fail without
   touching prices or the catalogue.

   node tools/mirror.js <mirror dir> [--pages N] [--listing-fixture <file>] [--pages-fixture <dir>] [--dry]
     --pages N            product pages to (re)read this run, default 120 (never-read pages first, then the oldest)
     --listing-fixture    read the listing from a file (one JSON product per line, as the website returns it)
     --pages-fixture      read product pages from <dir>/<SKU>.html instead of the website
     --dry                report only, write nothing

   The mirror is the website's own data, stored as it comes and never edited by hand (see mirror/README.md):
     listing.jsonl     every product in the website's product listing, one raw record per line, sorted by SKU
     pages/<SKU>.json  the product record from each product page (window.initialState) and its category breadcrumb.
                       Only the marketing prose listed in DROP is left out, to keep the files small.
     index.json        per product: type, type key, category path, first/last seen in the listing, last page read, gone
     types.json        every website product type: count, type key, category paths, bundles/outlet, and whether HiFi Planner
                       maps it (js/site.js TYPE_CATS / TYPE_CABLE) and how many of its products are in the catalogue
   Products that leave the website are kept and marked "gone" in index.json; nothing is ever deleted. */
const fs = require('fs'), path = require('path');
global.window = global.window || {};
require('../js/ports.js'); require('../js/site.js');
const S = window.HP.site;

const args = process.argv.slice(2), DIR = args[0] || 'mirror', DRY = args.includes('--dry');
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const LISTING_FIXTURE = opt('--listing-fixture'), PAGES_FIXTURE = opt('--pages-fixture'), PAGES = +(opt('--pages') || 120);
const BASE = 'https://www.hifiklubben.dk', MIN_SITE_PRODUCTS = 800;
const TODAY = new Date().toISOString().slice(0, 10);
const UA = { 'User-Agent': 'Mozilla/5.0 (HiFi Planner catalogue mirror; +https://hifiplanner.dk)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// presentational text and tracking: large, changes often, carries no product facts
const DROP = ['bodyText', 'highlights', 'highlightsHeader', 'highlightsBullets', 'uniqueSellingPoints', 'expertOpinion', 'videos', 'heroQuote',
  'teaser', 'smallTeaser', 'additionalTrackingData', 'lowestShippingPrice', 'sellableOnWebText', 'sellableOnWebTextHeader'];

/* ---------- files ---------- */
const file = (...p) => path.join(DIR, ...p);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const write = (f, text) => { if (DRY) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const writeIfChanged = (f, text) => { let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) { /* new */ } if (old === text) return false; write(f, text); return true; };
const safe = (sku) => String(sku).toUpperCase().replace(/[^A-Z0-9._-]/g, '_');
const pretty = (o) => JSON.stringify(o, null, 1) + '\n';
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip);
  if (!o || typeof o !== 'object') return o;
  const out = {}; for (const [k, v] of Object.entries(o)) if (!DROP.includes(k)) out[k] = strip(v);
  return out;
};

/* ---------- website ---------- */
async function fetchListing() {
  const body = { facets: {}, constraints: {}, pageSize: 50, sortBy: 'MostPopular', outlet: 'false', source: 'Product Listing Page', query: '', page: 0, type: 'category', currency: 'DKK', locale: 'da-DK', user: { classifications: { country: 'dk' } } };
  const out = [];
  for (let page = 0; page < 200; page++) {
    body.page = page;
    const r = await fetch(BASE + '/_search', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, UA), body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('hifiklubben.dk answered ' + r.status + ' on listing page ' + page);
    const results = ((await r.json()).products || {}).results || [];
    out.push(...results);
    if (results.length < 50) break;
  }
  return out;
}
// the product page carries its whole app state as a JSON string: window.initialState="{...}"
function extract(html) {
  const m = /window\.initialState=("(?:[^"\\]|\\.)*")/.exec(html);
  if (!m) throw new Error('no initialState on the page');
  const st = JSON.parse(JSON.parse(m[1])), pg = st && st.page;
  const product = pg && pg.payload && pg.payload.product;
  if (!product || !product.skuCode) throw new Error('no product record in initialState');
  return { breadcrumb: (pg.breadcrumb || []).filter((b) => b.url && b.url !== '/').map((b) => ({ title: b.title, key: String(b.subtitle || '').trim(), url: b.url })), product: strip(product) };
}
async function fetchPage(rec) {
  if (PAGES_FIXTURE) return extract(fs.readFileSync(path.join(PAGES_FIXTURE, safe(rec.skuCode) + '.html'), 'utf8'));
  const r = await fetch(BASE + rec.url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return extract(await r.text());
}

/* ---------- run ---------- */
(async () => {
  const R = { listing: 0, bundles: 0, outlet: 0, newProducts: [], gone: [], back: [], pages: 0, pageErrors: [], pagesChanged: 0, newTypes: [], unmapped: [] };
  const listing = LISTING_FIXTURE ? fs.readFileSync(LISTING_FIXTURE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l.replace(/^﻿/, ''))) : await fetchListing();
  if (!LISTING_FIXTURE && listing.length < MIN_SITE_PRODUCTS) throw new Error('Only ' + listing.length + ' products came back from hifiklubben.dk. Refusing to touch the mirror.');
  listing.sort((a, b) => String(a.skuCode).localeCompare(String(b.skuCode)));
  R.listing = listing.length;
  writeIfChanged(file('listing.jsonl'), listing.map((p) => JSON.stringify(p)).join('\n') + '\n');

  const isOutlet = (p) => !!(p.outletOnly || p.isOutletItem || (p.variants || []).length && p.variants.every((v) => (v.ribbons || []).some((r) => r.ribbonType === 'outlet')));
  const index = readJson(file('index.json'), { products: {} }), prods = index.products;
  const prevTypes = new Set((readJson(file('types.json'), { types: [] }).types || []).map((t) => t.type));
  const live = new Set();
  for (const p of listing) {
    const sku = String(p.skuCode).toUpperCase(); live.add(sku);
    const e = prods[sku] || (R.newProducts.push(p.brandName + ' ' + p.modelName + ' [' + sku + ']'), (prods[sku] = { first: TODAY }));
    if (e.gone) { R.back.push(p.brandName + ' ' + p.modelName + ' [' + sku + ']'); delete e.gone; }
    Object.assign(e, { brand: p.brandName, model: p.modelName, type: p.modelType || '', url: p.url, last: TODAY });
    if (p.isBundle) e.bundle = true; else delete e.bundle;
    if (isOutlet(p)) e.outlet = true; else delete e.outlet;
    if (p.isBundle) R.bundles++; if (e.outlet) R.outlet++;
  }
  for (const [sku, e] of Object.entries(prods)) if (!live.has(sku) && !e.gone) { e.gone = TODAY; R.gone.push(e.brand + ' ' + e.model + ' [' + sku + ']'); }

  // the index is derived data: fill it in again from page files already in the mirror (e.g. after two runs overlapped)
  for (const [sku, e] of Object.entries(prods)) {
    if (e.page && e.typeKey !== undefined) continue;
    const d = readJson(file('pages', safe(sku) + '.json'), null);
    if (!d || !d.product) continue;
    e.typeKey = d.product.modelTypeKey || ''; e.cat = (d.breadcrumb || []).map((b) => b.title).join(' > ');
    if (!e.page) e.page = TODAY;
    R.restored = (R.restored || 0) + 1;
  }
  // product pages: never read first, then the oldest; outlet units are skipped (their page is the normal product's)
  const queue = listing.filter((p) => !isOutlet(p) && p.url).sort((a, b) => ((prods[String(a.skuCode).toUpperCase()].page || '') < (prods[String(b.skuCode).toUpperCase()].page || '') ? -1 : 1)).slice(0, PAGES);
  for (const p of queue) {
    const sku = String(p.skuCode).toUpperCase(), e = prods[sku];
    try {
      if (!PAGES_FIXTURE) await sleep(300);
      const d = await fetchPage(p);
      if (writeIfChanged(file('pages', safe(sku) + '.json'), pretty({ sku, url: p.url, breadcrumb: d.breadcrumb, product: d.product }))) R.pagesChanged++;
      e.page = TODAY; e.typeKey = d.product.modelTypeKey || ''; e.cat = d.breadcrumb.map((b) => b.title).join(' > ');
      R.pages++;
    } catch (err) { R.pageErrors.push(sku + ': ' + err.message); }
  }

  // types: the website's own classification, side by side with what HiFi Planner does with it
  const catalogue = (() => { try { global.window.HP_DATA = {}; new Function('window', fs.readFileSync(path.join(DIR, '..', 'data', 'products.js'), 'utf8'))(global.window); return global.window.HP_DATA.products || []; } catch (e) { return []; } })();
  const ours = new Set(); catalogue.forEach((c) => [c.sku, c.site, ...(c.vars || []).map((v) => v.sku)].filter(Boolean).forEach((s) => ours.add(String(s).toUpperCase())));
  const inOurs = (p) => ours.has(String(p.skuCode).toUpperCase()) || (p.variants || []).some((v) => ours.has(String(v.sku).toUpperCase()));
  const T = {};
  for (const p of listing) {
    const type = p.modelType || '', e = prods[String(p.skuCode).toUpperCase()];
    const t = T[type] || (T[type] = { type, keys: {}, cats: {}, count: 0, bundles: 0, outlet: 0, products: 0, inCatalogue: 0, variantAxes: {}, mapped: S.TYPE_CABLE[type] ? 'cable' : S.TYPE_CATS[type] ? 'cats' : null, hifiPlanner: S.TYPE_CABLE[type] ? ['Cable: ' + S.TYPE_CABLE[type].join(', ')] : S.TYPE_CATS[type] || [] });
    t.count++;
    if (p.isBundle) t.bundles++; else if (e.outlet) t.outlet++; else { t.products++; if (inOurs(p)) t.inCatalogue++; }
    if (e.typeKey) t.keys[e.typeKey] = (t.keys[e.typeKey] || 0) + 1;
    if (e.cat) t.cats[e.cat] = (t.cats[e.cat] || 0) + 1;
    if (p.variantNavigationType) t.variantAxes[p.variantNavigationType] = (t.variantAxes[p.variantNavigationType] || 0) + 1;
  }
  const types = Object.values(T).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  types.forEach((t) => { if (prevTypes.size && !prevTypes.has(t.type)) R.newTypes.push(t.type + ' (' + t.count + ')'); if (!t.mapped && t.products) R.unmapped.push(t); });
  index.updated = TODAY; index.listing = { products: R.listing, bundles: R.bundles, outlet: R.outlet };
  const sortedProds = {}; Object.keys(prods).sort().forEach((k) => (sortedProds[k] = prods[k])); index.products = sortedProds;
  write(file('index.json'), pretty(index));
  writeIfChanged(file('types.json'), pretty({ types }));

  /* ---------- report ---------- */
  const read = Object.values(prods).filter((e) => e.page && !e.gone).length, readable = listing.filter((p) => !isOutlet(p)).length;
  const L = [];
  L.push('## Website mirror ' + TODAY, '',
    '- Listing: **' + R.listing + '** products (' + R.bundles + ' bundles, ' + R.outlet + ' outlet units), ' + types.length + ' product types',
    '- Product pages read this run: ' + R.pages + ' (' + R.pagesChanged + ' changed), ' + R.pageErrors.length + ' errors. Pages in the mirror: ' + read + ' of ' + readable,
    (R.restored ? '- Index entries filled in again from page files: ' + R.restored + '\n' : '') + '- New on the website: ' + R.newProducts.length + ' · gone: ' + R.gone.length + ' · back: ' + R.back.length);
  if (R.newTypes.length) L.push('', '### New product types on the website', '', ...R.newTypes.map((x) => '- ' + x));
  L.push('', '### Website types HiFi Planner does not map (' + R.unmapped.length + ')', '', 'The catalogue sync skips these. Bundles and outlet units are not counted.', '',
    '| Type | Products | Type key | Website category |', '|---|---:|---|---|',
    ...R.unmapped.sort((a, b) => b.products - a.products).map((t) => '| ' + (t.type || '(no type)') + ' | ' + t.products + ' | ' + Object.keys(t.keys).join(', ') + ' | ' + Object.keys(t.cats).slice(0, 2).join('; ') + ' |'));
  const show = (title, list) => { if (list.length) L.push('', '### ' + title + ' (' + list.length + ')', '', ...list.slice(0, 40).map((x) => '- ' + x), list.length > 40 ? '- …' : ''); };
  show('New products', R.newProducts.length > 200 ? [] : R.newProducts); show('Gone', R.gone); show('Back', R.back); show('Page errors', R.pageErrors);
  const md = L.join('\n') + '\n';
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY && !DRY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (R.pageErrors.length > Math.max(10, R.pages)) process.exitCode = 1; // most pages failing: the page format probably changed
})().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
