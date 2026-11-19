/* HiFi Planner catalogue build (stage 2, first slice): a normalized catalogue generated from the website mirror.
   No dependencies, Node 18+. Reads mirror/ and data/products.js, writes build/ only. Nothing in the app uses build/ yet.

   node tools/catalog-build.js [app dir]        (app dir = the folder with mirror/, data/ and tools/; default: this tool's parent)

   In:   mirror/listing.jsonl, mirror/pages/*.json   the website, as mirrored (never changed)
         tools/taxonomy.js                          the rules: what each website type is for HiFi Planner, corrections
         data/products.js                           today's catalogue, only for the comparison report
         data/own.js                                HiFi Planner's own layer (tools/own-split.js), if it exists
   Out:  build/catalog.json   categories (the website's tree + ours), products, bundles as parts lists
         build/products.js    own layer + website, in the app's current format (stage 3; not used by the app yet)
         build/report.md      what the new structure would change compared with today's catalogue, and the round-trip check */
const fs = require('fs'), path = require('path');
global.window = global.window || {};
require('../js/ports.js'); require('../js/site.js');
const S = window.HP.site;
const { KIND_SCOPE, CATEGORIES, TYPES } = require('./taxonomy.js');
const SM = require('./site-match.js');

const APP = process.argv[2] || path.join(__dirname, '..');
const M = path.join(APP, 'mirror'), OUT = path.join(APP, 'build');
const TODAY = new Date().toISOString().slice(0, 10);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const safe = (sku) => String(sku).toUpperCase().replace(/[^A-Z0-9._-]/g, '_');
const U = (s) => String(s || '').toUpperCase();
const uuid = (u) => { const m = /image\/([0-9a-f-]{36})/.exec(u || ''); return m ? 'hk:' + m[1] : ''; };
const AXIS = { colorOptions: 'colour', sizeSelector: 'size', meterQuantitySelector: 'metre', dropDown: 'option', none: null };
const isOutlet = (p) => !!(p.outletOnly || p.isOutletItem || (p.variants || []).length && p.variants.every((v) => (v.ribbons || []).some((r) => r.ribbonType === 'outlet')));

/* ---------- read ---------- */
const listing = fs.readFileSync(path.join(M, 'listing.jsonl'), 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const index = readJson(path.join(M, 'index.json'), { products: {} }).products;
const catalogue = (() => { global.window.HP_DATA = {}; new Function('window', fs.readFileSync(path.join(APP, 'data', 'products.js'), 'utf8'))(global.window); return global.window.HP_DATA.products || []; })();

/* ---------- categories: the website's tree from the breadcrumbs, plus ours ---------- */
const cats = new Map(); // id (URL path) -> { id, title, parent, website: true|false }
const addCat = (c) => { if (!cats.has(c.id)) cats.set(c.id, Object.assign({ products: 0, bundles: 0 }, c)); return cats.get(c.id); };
const pages = new Map();
for (const p of listing) {
  const sku = U(p.skuCode), d = readJson(path.join(M, 'pages', safe(sku) + '.json'), null);
  if (!d || !d.product) continue;
  pages.set(sku, d);
  let parent = null;
  for (const b of d.breadcrumb || []) { addCat({ id: b.url, title: b.title, key: b.key || '', parent, website: true }); parent = b.url; }
}
for (const c of CATEGORIES) addCat(Object.assign({ website: false }, c));

/* ---------- products ---------- */
const R = { unknownTypes: {}, noPage: [], corrected: {}, products: 0, bundles: 0, outlet: 0 };
const products = [], bundles = [];
const flatSpecs = (groups) => { const o = {}; for (const g of groups || []) for (const c of g.content || []) { if (!c.term) continue; const v = String(c.value == null ? '' : c.value).trim(); if (v && !/^0([,.]0+)?$/.test(v) && !/^0 x 0 x 0/.test(v) && !(c.term in o)) o[c.term] = v; } return o; };
for (const p of listing) {
  if (isOutlet(p)) { R.outlet++; continue; }
  const sku = U(p.skuCode), d = pages.get(sku), pr = (d && d.product) || {};
  const key = pr.modelTypeKey || '', rule = TYPES[key];
  if (!d) R.noPage.push(p.brandName + ' ' + p.modelName + ' [' + sku + ']');
  if (key && !rule) R.unknownTypes[key] = (R.unknownTypes[key] || 0) + 1;
  const webCat = d && d.breadcrumb.length ? d.breadcrumb[d.breadcrumb.length - 1].url : '';
  const cat = (rule && rule.cat) || webCat;
  if (rule && rule.cat && rule.cat !== webCat) R.corrected[key] = { from: webCat, to: rule.cat, n: (R.corrected[key] || { n: 0 }).n + 1 };
  const kind = p.isBundle ? 'bundle' : rule ? rule.kind : 'other';
  const base = { sku, brand: p.brandName, model: p.modelName, type: { key, da: p.modelType || '' }, cat, url: p.url };
  if (cats.has(cat)) cats.get(cat)[kind === 'bundle' ? 'bundles' : 'products']++;
  if (kind === 'bundle') {
    R.bundles++;
    const b = pr.bundle || {};
    bundles.push(Object.assign(base, { price: (b.priceDetails || {}).price || 0, was: (b.priceDetails || {}).priceBefore || 0, img: uuid(((b.images || [])[0] || {}).url),
      parts: (b.bundleProducts || []).map((x) => ({ sku: U(x.parentProductCode), name: x.name, qty: Math.max(1, ...(x.bundleVariants || []).map((v) => +v.quantity || 1)), variants: (x.bundleVariants || []).map((v) => U(v.productCode)) })) }));
    continue;
  }
  R.products++;
  const specs = flatSpecs(pr.techSpecs), facets = Object.assign({}, rule ? rule.facets : {});
  const axis = AXIS[p.variantNavigationType] !== undefined ? AXIS[p.variantNavigationType] : null;
  if (axis) facets.axis = axis;
  if (axis === 'metre') facets.perMetre = true;
  const w = S.wireless(specs); if (w) { facets.bt = w.bt; facets.wifi = w.wifi; }
  const pageVars = new Map((pr.variants || []).map((v) => [U(v.productCode), v]));
  const variants = (p.variants || []).filter((v) => !(v.ribbons || []).some((r) => r.ribbonType === 'outlet')).map((v) => {
    const pv = pageVars.get(U(v.sku)) || {}, pd = v.priceDetails || {};
    const o = { sku: U(v.sku), label: v.label || v.color || '', price: pd.price || 0 };
    if (pd.priceBefore > pd.price) o.was = pd.priceBefore;
    if (v.colorKey) o.colorKey = v.colorKey; if (v.colorCode) o.hex = v.colorCode;
    if (pv.ean) o.ean = pv.ean; if (v.url) o.url = v.url; const im = uuid(v.image); if (im) o.img = im;
    if (pv.inventoryStatus && pv.inventoryStatus.inventoryStatusType) o.stock = pv.inventoryStatus.inventoryStatusType;
    const vs = flatSpecs(pv.techSpecs); delete vs.Farve; delete vs['Model / Variant']; if (Object.keys(vs).length) o.specs = vs;
    return o;
  });
  const rel = {}; for (const [k, f] of [['acc', 'recommendedAccessories'], ['alt', 'recommendedAlternatives'], ['rec', 'recommendedProducts']]) { const l = ((pr[f] || {}).productCodes || []).map(U); if (l.length) rel[k] = l; }
  products.push(Object.assign(base, { kind, scope: (rule && rule.scope) || KIND_SCOPE[kind] || 'skip', facets, variants, specs, rel, read: (index[sku] || {}).page || '' }));
}

/* ---------- category tree with counts (rolled up) ---------- */
const kids = (id) => [...cats.values()].filter((c) => c.parent === id);
const total = (c) => { const k = kids(c.id); c.all = c.products + k.reduce((a, x) => a + total(x), 0); return c.all; };
const roots = [...cats.values()].filter((c) => !c.parent || !cats.has(c.parent));
roots.forEach(total);

/* ---------- compare with today's catalogue ---------- */
const parentOf = new Map(); // any website SKU (product or variant) -> product SKU
products.forEach((p) => { parentOf.set(p.sku, p.sku); p.variants.forEach((v) => parentOf.set(v.sku, p.sku)); });
const bySku = new Map(products.map((p) => [p.sku, p]));
const ours = catalogue.map((c) => {
  const hit = [c.site, c.sku, ...(c.vars || []).map((v) => v.sku)].map(U).filter(Boolean).map((s) => parentOf.get(s)).find(Boolean);
  return { c, w: hit ? bySku.get(hit) : null };
});
const catTitle = (id) => { const c = cats.get(id); if (!c) return id || '(no category)'; const p = c.parent && cats.get(c.parent); return (p ? p.title + ' > ' : '') + c.title; };

/* ---------- write ---------- */
fs.mkdirSync(OUT, { recursive: true });
const catalog = {
  built: TODAY, source: 'mirror/ (hifiklubben.dk) + tools/taxonomy.js',
  categories: [...cats.values()].map((c) => ({ id: c.id, title: c.title, en: c.en, parent: c.parent || null, website: c.website, products: c.products, all: c.all, bundles: c.bundles })),
  products, bundles,
};
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');

const L = [], P = (...x) => L.push(...x);
P('# Catalogue build report ' + TODAY, '',
  'Generated by `tools/catalog-build.js` from the website mirror and `tools/taxonomy.js`. Nothing in the app uses this yet; it shows what the new structure would do.', '',
  '## Summary', '',
  '- Website: **' + R.products + '** products, ' + R.bundles + ' bundles (now parts lists), ' + R.outlet + ' outlet units left out' + (R.noPage.length ? ', ' + R.noPage.length + ' products without a mirrored page yet' : ''),
  '- Scope: ' + ['diagram', 'pricelist', 'skip'].map((s) => s + ' **' + products.filter((p) => p.scope === s).length + '**').join(' · ') + ' (diagram = drawn and wired, pricelist = on proposals without ports)',
  '- Today\'s catalogue: ' + catalogue.length + ' products, of which **' + ours.filter((o) => o.w).length + '** match a website product and ' + ours.filter((o) => !o.w).length + ' do not (stand-ins, discontinued, own entries)',
  '- Website products HiFi Planner does not have: ' + ['diagram', 'pricelist'].map((s) => s + ' **' + products.filter((p) => p.scope === s && !ours.some((o) => o.w === p)).length + '**').join(' · '), '');
if (Object.keys(R.unknownTypes).length) P('**Type keys without a rule in tools/taxonomy.js:** ' + Object.entries(R.unknownTypes).map(([k, n]) => k + ' (' + n + ')').join(', '), '');

P('## Category tree', '', 'Website categories as they are, plus HiFi Planner\'s own (marked ★). Counts: products (bundles in brackets) · of these in today\'s catalogue.', '');
const inOurs = new Set(ours.filter((o) => o.w).map((o) => o.w.sku));
const countOurs = (id) => products.filter((p) => p.cat === id && inOurs.has(p.sku)).length + kids(id).reduce((a, k) => a + countOurs(k.id), 0);
const walk = (c, d) => { P('  '.repeat(d) + '- ' + (c.website ? '' : '★ ') + c.title + ' — ' + c.all + (c.bundles ? ' (' + c.bundles + ' bundles)' : '') + ' · ' + countOurs(c.id) + ' in catalogue'); kids(c.id).sort((a, b) => b.all - a.all).forEach((k) => walk(k, d + 1)); };
roots.sort((a, b) => b.all - a.all).forEach((c) => walk(c, 0));

P('', '## Corrections applied (tools/taxonomy.js)', '', '| Type key | Products | Website category | Moved to |', '|---|---:|---|---|',
  ...Object.entries(R.corrected).map(([k, v]) => '| ' + k + ' | ' + v.n + ' | ' + catTitle(v.from) + ' | ' + catTitle(v.to) + ' |'));

P('', '## Today\'s categories → new categories', '', 'Where the products of each of today\'s categories end up. More than one target means today\'s category is split.', '',
  '| Today | Products | New category (count) |', '|---|---:|---|');
const byOld = {};
ours.filter((o) => o.w).forEach(({ c, w }) => { const k = (c.cats || []).join(' + ') || '(none)'; const o = byOld[k] || (byOld[k] = { n: 0, to: {} }); o.n++; const t = catTitle(w.cat); o.to[t] = (o.to[t] || 0) + 1; });
Object.entries(byOld).sort((a, b) => b[1].n - a[1].n).forEach(([k, o]) => P('| ' + k + ' | ' + o.n + ' | ' + Object.entries(o.to).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' (' + n + ')').join(', ') + ' |'));

// facts the website states that today's catalogue has differently
const diff = { bt: [], wifi: [], perMetre: [], scope: [] };
const perMetreToday = (c) => (c.cable || []).includes('speaker') && /(^|[^0-9.,])1 ?m$|slip/i.test(c.name.trim());
ours.filter((o) => o.w).forEach(({ c, w }) => {
  const n = c.brand + ' ' + c.name;
  if (w.facets.bt !== undefined && !!c.bt !== w.facets.bt) diff.bt.push(n + ': today ' + (c.bt ? 'yes' : 'no') + ', website ' + (w.facets.bt ? 'yes' : 'no'));
  if (w.facets.wifi !== undefined && !!c.wifi !== w.facets.wifi) diff.wifi.push(n + ': today ' + (c.wifi ? 'yes' : 'no') + ', website ' + (w.facets.wifi ? 'yes' : 'no'));
  if (w.kind === 'cable' && perMetreToday(c) !== !!w.facets.perMetre) diff.perMetre.push(n + ': today ' + (perMetreToday(c) ? 'per metre' : 'fixed length') + ', website ' + (w.facets.perMetre ? 'per metre' : 'fixed length'));
  if (w.scope === 'skip') diff.scope.push(n + ' (' + w.type.da + ')');
});
const list = (title, note, l) => { P('', '### ' + title + ' (' + l.length + ')', '', note, ''); l.slice(0, 60).forEach((x) => P('- ' + x)); if (l.length > 60) P('- … ' + (l.length - 60) + ' more'); };
P('', '## Differences in facts');
list('Bluetooth', 'Today\'s catalogue vs the website\'s specs. The sync never switches Bluetooth off, so "today yes, website no" is expected for some.', diff.bt);
list('WiFi', 'As above.', diff.wifi);
list('Sold per metre', 'Today this is guessed from the cable name; the website says it with its variant kind.', diff.perMetre);
list('In the catalogue but "skip" in the new scope', 'Check whether these should be kept.', diff.scope);

P('', '## Not on the website (' + ours.filter((o) => !o.w).length + ')', '', 'Today\'s products with no website match: kept as HiFi Planner\'s own products in the new structure.', '');
const nm = {}; ours.filter((o) => !o.w).forEach(({ c }) => { const k = c.gone ? 'discontinued (gone)' : (c.cats || []).includes('Stand-in Products') ? 'stand-in products' : c.sku ? 'has a SKU the website does not list' : 'no SKU'; (nm[k] = nm[k] || []).push(c.brand + ' ' + c.name); });
Object.entries(nm).forEach(([k, l]) => P('- **' + k + '** (' + l.length + '): ' + l.slice(0, 25).join(', ') + (l.length > 25 ? ', …' : '')));

P('', '## New to HiFi Planner, by category', '', 'Website products in scope that today\'s catalogue does not have.', '', '| Category | Diagram | Price list | Examples |', '|---|---:|---:|---|');
const nw = {}; products.filter((p) => p.scope !== 'skip' && !inOurs.has(p.sku)).forEach((p) => { const k = catTitle(p.cat); const o = nw[k] || (nw[k] = { d: 0, p: 0, ex: [] }); o[p.scope === 'diagram' ? 'd' : 'p']++; if (o.ex.length < 3) o.ex.push(p.brand + ' ' + p.model); });
Object.entries(nw).sort((a, b) => b[1].d + b[1].p - a[1].d - a[1].p).forEach(([k, o]) => P('| ' + k + ' | ' + o.d + ' | ' + o.p + ' | ' + o.ex.join(', ') + ' |'));
if (R.noPage.length) list('Products without a mirrored page yet', 'Read by the next mirror runs.', R.noPage);
/* ---------- stage 3: own layer + website = the app's catalogue ---------- */
const ownFile = path.join(APP, 'data', 'own.js');
if (fs.existsSync(ownFile)) {
  global.window.HP_DATA = {}; new Function('window', fs.readFileSync(ownFile, 'utf8'))(global.window);
  const own = global.window.HP_DATA.own || [];
  const match = SM.matcher(SM.sellable(listing));
  const facetsBySku = new Map(products.map((p) => [p.sku, p.facets]));
  const hk = (u) => S.hk(u);
  const RT = { lost: [], frozen: 0, held: [] };
  // the previous catalogue, for the sync's plausibility check (today's data/products.js until the switch, then the previous build)
  const prevById = new Map(catalogue.map((c) => [c.id, c]));
  const skuCount = {}; own.forEach((o) => { if (o.sku) skuCount[U(o.sku)] = (skuCount[U(o.sku)] || 0) + 1; });
  const generated = own.map((o) => {
    const p = {};
    for (const k of ['id', 'brand', 'name', 'sku']) if (o[k] !== undefined) p[k] = o[k];
    const m = o.link ? match.byLink(o.link) : null;
    if (o.link && !m) RT.lost.push(o.brand + ' ' + o.name + ' [' + o.link.site + ']');
    if (m) {
      const w = SM.webFacts(m, { single: !!o.link.single, cable: !!o.cable, hk });
      if (w.vars) p.vars = w.vars; if (w.url) p.url = w.url; p.site = w.site;
      // as the sync: a price is held (old price and discount kept, listed for a human to check) when it is implausible
      const prev = prevById.get(o.id) || {};
      const why = o.sku && skuCount[U(o.sku)] > 1 && SM.norm(m.s.brand + m.s.model) !== SM.norm(o.brand + o.name) ? 'SKU is used by several catalogue products'
        : prev.price > 0 && (w.price < prev.price * 0.65 || w.price > prev.price * 1.6) ? 'large change (over -35% / +60%)' : '';
      if (why) { p.price = prev.price; if (prev.was) p.was = prev.was; if (w.price !== prev.price) RT.held.push(o.brand + ' ' + o.name + ': ' + prev.price + ' kept, website ' + w.price + ' (' + why + ')'); }
      else { p.price = w.price; if (w.was) p.was = w.was; }
    } else if (o.frozen) { Object.assign(p, o.frozen); RT.frozen++; }
    else if (o.link) { p.gone = TODAY; } // the website product left since the last split: price etc. kept from the last build at the switch (stage 4)
    for (const k of ['cats', 'img', 'in', 'out', 'cable', 'auto', 'review', 'manualWireless']) if (o[k] !== undefined) p[k] = o[k];
    // Bluetooth/WiFi: the website can add them, never remove them, unless set by hand (as the sync does)
    const f = m ? facetsBySku.get(U(m.s.sku)) : null;
    const bt = o.bt || (!o.manualWireless && !o.cable && f && f.bt), wifi = o.wifi || (!o.manualWireless && !o.cable && f && f.wifi);
    if (bt) p.bt = true; if (wifi) p.wifi = true;
    return p;
  });
  fs.writeFileSync(path.join(OUT, 'products.js'), '/* Written by tools/catalog-build.js from data/own.js and mirror/. Not used by the app yet. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = [\n' + generated.map((p) => JSON.stringify(p)).join(',\n') + '\n];\n');

  // round trip: the generated catalogue against today's data/products.js, field by field
  const today = new Map(catalogue.map((c) => [c.id, c]));
  const fields = {}, ex = {}, keys = new Set();
  catalogue.forEach((c) => Object.keys(c).forEach((k) => keys.add(k))); generated.forEach((g) => Object.keys(g).forEach((k) => keys.add(k)));
  let same = 0;
  for (const g of generated) {
    const c = today.get(g.id); if (!c) continue;
    let ok = true;
    for (const k of keys) {
      const a = JSON.stringify(c[k] === undefined ? null : c[k]), b = JSON.stringify(g[k] === undefined ? null : g[k]);
      if (a === b) continue;
      ok = false; fields[k] = (fields[k] || 0) + 1;
      (ex[k] = ex[k] || []).push(c.brand + ' ' + c.name + ': today ' + a.slice(0, 90) + ' → built ' + b.slice(0, 90));
    }
    if (ok) same++;
  }
  P('', '## Round trip (stage 3): own layer + website → catalogue', '',
    '`build/products.js` is generated from `data/own.js` and the mirror, in the app\'s current format. Compared with today\'s `data/products.js`:', '',
    '- **' + same + '** of ' + catalogue.length + ' products identical in every field' + (generated.length !== catalogue.length ? ' (own layer has ' + generated.length + ')' : ''),
    '- ' + (own.length - RT.frozen) + ' follow the website through their link, ' + RT.frozen + ' are frozen (not on the website)',
    '- Prices held by the plausibility check (as the sync does): ' + RT.held.length,
    RT.lost.length ? '- Link no longer on the website: ' + RT.lost.join(', ') : '- Every link points at a product the website lists', '');
  if (RT.held.length) { P('**Held prices** (check by hand; the website price is used once the old one is corrected in the Editor)', ''); RT.held.forEach((x) => P('- ' + x)); P(''); }
  if (Object.keys(fields).length) {
    P('| Field | Products that differ |', '|---|---:|', ...Object.entries(fields).sort((a, b) => b[1] - a[1]).map(([k, n]) => '| ' + k + ' | ' + n + ' |'), '');
    Object.entries(ex).forEach(([k, l]) => { P('**' + k + '**', ''); l.slice(0, 12).forEach((x) => P('- ' + x)); if (l.length > 12) P('- … ' + (l.length - 12) + ' more'); P(''); });
  }
}
fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n') + '\n');
console.log('build/catalog.json: ' + products.length + ' products, ' + bundles.length + ' bundles, ' + cats.size + ' categories · build/report.md written' + (Object.keys(R.unknownTypes).length ? ' · unknown types: ' + Object.keys(R.unknownTypes).join(', ') : ''));
