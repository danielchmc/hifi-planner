/* HiFi Planner catalogue build (stage 2, first slice): a normalized catalogue generated from the website mirror.
   No dependencies, Node 18+. Reads mirror/ and data/products.js, writes build/ only. Nothing in the app uses build/ yet.

   node tools/catalog-build.js [app dir]        (app dir = the folder with mirror/, data/ and tools/; default: this tool's parent)

   In:   mirror/listing.jsonl, mirror/pages/*.json   the website, as mirrored (never changed)
         tools/taxonomy.js                          the rules: what each website type is for HiFi Planner, corrections
         data/products.js                           today's catalogue, only for the comparison report
         data/own.js                                HiFi Planner's own layer (tools/own-split.js), if it exists
   Out:  build/catalog.json   categories (the website's tree + ours), products, bundles as parts lists
         build/products.js    own layer + website, in the app's current format (stage 3; not used by the app yet)
         build/next.js        the same products with the new structure (website category, kind, scope, facts), the website
                              products HiFi Planner does not have yet, and the category tree; loaded by the test page next.html
         build/report.md      what the new structure would change compared with today's catalogue, and the round-trip check */
const fs = require('fs'), path = require('path');
global.window = global.window || {};
require('../js/ports.js'); require('../js/site.js');
const S = window.HP.site;
const { KIND_SCOPE, CATEGORIES, TYPES, SECTION_ORDER, EN } = require('./taxonomy.js');
const SM = require('./site-match.js');
const CE = require('./cable-ends.js');
const OVERRIDES = (() => { try { return require('./overrides.js'); } catch (e) { return {}; } })();

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
// has the app switched to the generated catalogue? (index.html loads build/app-products.js). Then data/own.js is the master and
// data/products.js is no longer used; before, data/products.js is the master and data/own.js follows it.
const SWITCHED = (() => { try { return fs.readFileSync(path.join(APP, 'index.html'), 'utf8').includes('build/app-products.js'); } catch (e) { return false; } })();
const prevBuild = (() => { try { global.window.HP_DATA = {}; new Function('window', fs.readFileSync(path.join(APP, 'build', 'app-products.js'), 'utf8'))(global.window); return global.window.HP_DATA.products || null; } catch (e) { return null; } })();
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
const R = { unknownTypes: {}, noPage: [], corrected: {}, products: 0, bundles: 0, outlet: 0, overrides: [] };
const products = [], bundles = [];
const flatSpecs = (groups) => { const o = {}; for (const g of groups || []) for (const c of g.content || []) { if (!c.term) continue; const v = String(c.value == null ? '' : c.value).trim(); if (v && !/^0([,.]0+)?$/.test(v) && !/^0 x 0 x 0/.test(v) && !(c.term in o)) o[c.term] = v; } return o; };
for (const p of listing) {
  if (isOutlet(p)) { R.outlet++; continue; }
  const sku = U(p.skuCode), d = pages.get(sku), pr = (d && d.product) || {};
  const key = pr.modelTypeKey || '', rule = TYPES[key];
  const ov = OVERRIDES[sku] || null; // tools/overrides.js: corrections of website facts
  if (ov) R.overrides.push(p.brandName + ' ' + p.modelName + ' [' + sku + ']: ' + (ov.note || JSON.stringify(ov)));
  if (!d) R.noPage.push(p.brandName + ' ' + p.modelName + ' [' + sku + ']');
  if (key && !rule) R.unknownTypes[key] = (R.unknownTypes[key] || 0) + 1;
  const webCat = d && d.breadcrumb.length ? d.breadcrumb[d.breadcrumb.length - 1].url : '';
  const cat = (ov && ov.cat) || (rule && rule.cat) || webCat;
  if (rule && rule.cat && rule.cat !== webCat) R.corrected[key] = { from: webCat, to: rule.cat, n: (R.corrected[key] || { n: 0 }).n + 1 };
  const kind = ov && ov.kind ? ov.kind : p.isBundle ? 'bundle' : rule ? rule.kind : 'other';
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
  if (ov && ov.facets) Object.assign(facets, ov.facets);
  products.push(Object.assign(base, { kind, scope: (ov && ov.scope) || (rule && rule.scope) || KIND_SCOPE[kind] || 'skip', facets, variants, specs, rel, read: (index[sku] || {}).page || '' }));
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

if (R.overrides.length) P('## Corrections of website facts (tools/overrides.js)', '', ...R.overrides.map((x) => '- ' + x), '');
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
  const RT = { lost: [], frozen: 0, held: [], ends: {}, endsGuess: [] };
  const wBySku = new Map(products.map((w) => [w.sku, w]));
  // a cable's two ends: chosen by hand (data/own.js) or worked out (tools/cable-ends.js), marked endsAuto
  const setEnds = (p, handEnds, name, w, set) => {
    if (handEnds && handEnds.length === 2) { p.ends = handEnds; RT.ends.hand = (RT.ends.hand || 0) + 1; return; }
    const r = CE.deriveEnds({ name, model: w && w.model, typeKey: w && w.type.key, stik: w && w.specs && w.specs.Stik, set });
    p.ends = r.ends; p.endsAuto = 1; RT.ends[r.how] = (RT.ends[r.how] || 0) + 1;
    if (r.how === 'guess') RT.endsGuess.push((p.brand || '') + ' ' + p.name + ': ' + r.ends.join(' ↔ '));
  };
  // the previous catalogue, for the sync's plausibility check (today's data/products.js until the switch, then the previous build)
  const prevById = new Map((SWITCHED && prevBuild ? prevBuild : catalogue).map((c) => [c.id, c]));
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
    if (m) Object.defineProperty(p, '_web', { value: m.v.image || '', enumerable: false });
    if (o.cable) setEnds(p, o.ends, o.name, m ? wBySku.get(U(m.s.sku)) : null, o.cable);
    return p;
  });
  // stock pictures: one local image file used by cards of 3 or more different website products (e.g. a generic RCA plug photo on
  // speaker cables) is replaced by the website's own photo of each product. The own layer keeps its value; only the build swaps it.
  const crypto = require('crypto'), hashOf = new Map(), sitesOf = {};
  const fileHash = (rel) => { if (!/^img\//.test(rel || '')) return ''; if (!hashOf.has(rel)) { let h = ''; try { h = crypto.createHash('md5').update(fs.readFileSync(path.join(APP, rel))).digest('hex'); } catch (e) { /* missing */ } hashOf.set(rel, h); } return hashOf.get(rel); };
  generated.forEach((g) => { const h = fileHash((g.img || [])[0]); if (h && g.site) (sitesOf[h] = sitesOf[h] || new Set()).add(g.site); });
  RT.stock = [];
  generated.forEach((g) => { const h = fileHash((g.img || [])[0]), u = SM.uuidOf(g._web); if (h && sitesOf[h] && sitesOf[h].size >= 3 && u) { g.img = [S.hk(u)].concat((g.img || []).slice(1)); RT.stock.push(g.brand + ' ' + g.name); } });
  if (!SWITCHED) fs.writeFileSync(path.join(OUT, 'products.js'), '/* Written by tools/catalog-build.js from data/own.js and mirror/. Not used by the app yet. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = [\n' + generated.map((p) => JSON.stringify(p)).join(',\n') + '\n];\n');

  /* ---------- stage 4 test page: the new structure on top of the generated catalogue ---------- */
  const webBySku = new Map(products.map((w) => [w.sku, w]));
  const chain = (id) => { const out = []; let c = cats.get(id), guard = 0; while (c && guard++ < 6) { out.unshift(c.id); c = cats.get(c.parent); } return out; };
  const label = (id) => { const c = cats.get(id); return c ? c.title + ' ' + (EN[id] || c.en || '') : ''; };
  // today's categories → new category, learnt from the products that have both (for products the website does not list)
  const learn = {};
  own.forEach((o, i) => { const g = generated[i], w = g.site && webBySku.get(U(g.site)); if (!w || !w.cat) return; const k = (o.cats || []).join('+'); (learn[k] = learn[k] || {})[w.cat] = (learn[k][w.cat] || 0) + 1; });
  const FALLBACK = { 'A/D Converters': '/stereo/da-konverter/' }; // old categories no linked product has
  const learnt = (o) => {
    const oc = o.cats || [];
    if (oc.includes('Stand-in Products')) return '/tilbehor/pladsholdere/';
    let m = learn[oc.join('+')];
    if (!m) { m = {}; for (const [k, t] of Object.entries(learn)) if (k.split('+').some((x) => oc.includes(x))) for (const [c, n] of Object.entries(t)) m[c] = (m[c] || 0) + n; } // any of its old categories
    const best = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : oc.map((c) => FALLBACK[c]).find(Boolean) || '';
  };
  const enrich = (p, w, catId, o) => {
    const id = (o && o.cat && cats.has(o.cat) ? o.cat : '') || (w && w.cat) || catId;
    p.lcats = p.cats; p.cats = id ? chain(id) : []; p.ct = p.cats.map(label).join(' ');
    if (w && w.cat) p.wc = w.cat; // the website's category (the Editor shows it when another is chosen)
    if (w) { p.kind = w.kind; p.scope = w.scope; p.fx = w.facets; } else if (id === '/tilbehor/pladsholdere/') p.kind = 'standin';
    return p;
  };
  const next = generated.map((g, i) => enrich(Object.assign({}, g), g.site ? webBySku.get(U(g.site)) : null, learnt(own[i]), own[i]));
  const ignored = new Set((() => { try { global.window.HP_DATA = {}; new Function('window', fs.readFileSync(path.join(APP, 'data', 'site-ignore.js'), 'utf8'))(global.window); return global.window.HP_DATA.siteIgnore || []; } catch (e) { return []; } })().map(U));
  const linked = new Set(next.map((p) => p.site && U(p.site)).filter(Boolean));
  let added = 0;
  for (const w of products) {
    if (w.scope === 'skip' || linked.has(w.sku) || ignored.has(w.sku)) continue; // deleted in the Editor = on the ignore list
    const m = match.byLink({ site: w.sku }); if (!m) continue;
    const isCable = w.kind === 'cable' && w.facets.conn;
    const f = SM.webFacts(m, { single: false, cable: !!isCable, hk });
    const p = { id: 'w-' + w.sku.toLowerCase(), brand: w.brand, name: w.model, sku: w.sku, price: f.price, site: w.sku, web: 1 };
    p.cats = (S.TYPE_CABLE[w.type.da] ? ['Cable'] : S.TYPE_CATS[w.type.da]) || []; // the old categories (kept in lcats): the Editor's port suggestions use them
    if (f.was) p.was = f.was; if (f.vars) p.vars = f.vars; if (f.url) p.url = f.url;
    const im = (w.variants.find((v) => v.img) || {}).img; p.img = im ? [im] : [];
    if (isCable) { p.cable = [w.facets.conn]; setEnds(p, null, w.model, w, p.cable); } else if (w.scope === 'diagram') { p.in = []; p.out = []; p.review = true; } // diagram gear needs its ports checked: listed under Review
    if (w.facets.bt) p.bt = true; if (w.facets.wifi) p.wifi = true;
    next.push(enrich(p, w)); added++;
  }
  // cable lengths: a cable the website sells in fixed lengths gets them all (lens), so the cable picker can offer one row with a
  // length button per length. A length that has its own card in HiFi Planner (a per-length card, link.v) points at that card (id).
  const lenOf = (v) => { const t = (v.specs || {})['Kabellængde (m)'] || ((/([\d.,]+)\s*(m\b|meter)/i.exec(v.label || '') || [])[1]); const n = parseFloat(String(t || '').replace(',', '.')); return n > 0 ? n : 0; };
  const cardOfVariant = new Map(); own.forEach((o) => { if (o.link && o.link.v) cardOfVariant.set(U(o.link.site) + '|' + U(o.link.v), o.id); });
  RT.lens = 0;
  next.forEach((p) => {
    if (!p.cable || !p.site) return;
    const w = webBySku.get(U(p.site));
    if (!w || w.facets.perMetre) return;
    const lens = w.variants.map((v) => { const l = { sku: v.sku, m: lenOf(v), label: '', price: v.price }; l.label = String(l.m).replace('.', ',') + ' m'; if (v.was) l.was = v.was; if (v.url) l.url = v.url; const id = cardOfVariant.get(U(p.site) + '|' + v.sku); if (id) l.id = id; return l; })
      .filter((l) => l.m > 0 && l.price > 0).sort((a, b) => a.m - b.m);
    if (new Set(lens.map((l) => l.m)).size >= 2) { p.lens = lens; RT.lens++; }
  });
  const used = {}; next.forEach((p) => p.cats.forEach((c) => (used[c] = (used[c] || 0) + 1)));
  const secRank = (id) => { const i = SECTION_ORDER.indexOf(chain(id)[0]); return i < 0 ? 99 : i; };
  const tree = [...cats.values()].filter((c) => used[c.id]).map((c) => ({ id: c.id, title: c.title, en: EN[c.id] || c.en || c.title, parent: c.parent && cats.has(c.parent) ? c.parent : null, n: used[c.id] }))
    .sort((a, b) => secRank(a.id) - secRank(b.id) || b.n - a.n || a.title.localeCompare(b.title, 'da'));
  // the app's catalogue: products (one per line; the Editor's Publish rewrites this file too) and the category tree
  fs.writeFileSync(path.join(OUT, 'app-products.js'), '/* Written by tools/catalog-build.js from data/own.js and mirror/ (and by Publish in the Editor until the next build). The app\'s catalogue. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = [\n' + next.map((p) => JSON.stringify(p)).join(',\n') + '\n];\n');
  fs.writeFileSync(path.join(OUT, 'categories.js'), '/* Written by tools/catalog-build.js: the category tree (the website\'s, plus HiFi Planner\'s own from tools/taxonomy.js). */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.categories = ' + JSON.stringify(tree) + ';\n');
  try { fs.unlinkSync(path.join(OUT, 'next.js')); } catch (e) { /* gone already */ }
  // what changed since the previous build (prices and products), for the report
  if (prevBuild) {
    const before = new Map(prevBuild.map((p) => [p.id, p]));
    RT.changes = { prices: next.filter((p) => before.has(p.id) && before.get(p.id).price !== p.price).map((p) => p.brand + ' ' + p.name + ': ' + before.get(p.id).price + ' → ' + p.price),
      added: next.filter((p) => !before.has(p.id)).map((p) => p.brand + ' ' + p.name), removed: prevBuild.filter((p) => !next.some((x) => x.id === p.id)).map((p) => p.brand + ' ' + p.name) };
  }
  RT.next = { products: next.length, added, uncategorised: next.filter((p) => !p.cats.length).map((p) => p.brand + ' ' + p.name) };

  // round trip: the generated catalogue against today's data/products.js, field by field
  const today = new Map((SWITCHED ? [] : catalogue).map((c) => [c.id, c])); // after the switch data/products.js is no longer used: no round trip
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
  P('', SWITCHED ? '## Own layer + website → app catalogue' : '## Round trip (stage 3): own layer + website → catalogue', '',
    ...(SWITCHED ? ['`data/own.js` is the master for what HiFi Planner adds; `build/app-products.js` is rebuilt from it and the mirror every hour.', '']
      : ['`build/products.js` is generated from `data/own.js` and the mirror, in the app\'s current format. Compared with today\'s `data/products.js`:', '',
        '- **' + same + '** of ' + catalogue.length + ' products identical in every field' + (generated.length !== catalogue.length ? ' (own layer has ' + generated.length + ')' : '')]),
    '- ' + (own.length - RT.frozen) + ' follow the website through their link, ' + RT.frozen + ' are frozen (not on the website)',
    '- Prices held by the plausibility check (as the sync does): ' + RT.held.length,
    RT.lost.length ? '- Link no longer on the website: ' + RT.lost.join(', ') : '- Every link points at a product the website lists', '');
  P('', '**App catalogue** (`build/app-products.js`' + (SWITCHED ? ', used by the app' : ', not used by the app yet') + '): ' + RT.next.products + ' products (' + RT.next.added + ' from the website that HiFi Planner does not have yet, without ports), ' + (RT.next.uncategorised.length ? RT.next.uncategorised.length + ' without a category: ' + RT.next.uncategorised.slice(0, 20).join(', ') : 'every product has a category') + '.', '');
  P('**Cable ends**: ' + Object.entries(RT.ends).map(([k, n]) => n + ' ' + ({ hand: 'set by hand', name: 'from the name', 'name+spec': 'from the name and the website\'s connector list', spec: 'from the website\'s connector list', type: 'from the cable type', set: 'from the old connector list', guess: 'guessed' }[k] || k)).join(', ') + '.', '');
  if (RT.endsGuess.length) { P('Guessed cable ends (check in the Editor: open the cable and set End A / End B):', ''); RT.endsGuess.slice(0, 60).forEach((x) => P('- ' + x)); if (RT.endsGuess.length > 60) P('- … ' + (RT.endsGuess.length - 60) + ' more'); P(''); }
  P('**Cable lengths**: ' + RT.lens + ' cables offer their website lengths in the cable picker.', '');
  if (RT.stock && RT.stock.length) P('Stock pictures replaced by the website\'s photo (' + RT.stock.length + '): ' + RT.stock.join(', ') + '.', '');
  if (RT.changes) {
    P('Since the previous build: ' + RT.changes.prices.length + ' price changes, ' + RT.changes.added.length + ' products added, ' + RT.changes.removed.length + ' removed.', '');
    [['Price changes', RT.changes.prices], ['Added', RT.changes.added], ['Removed', RT.changes.removed]].forEach(([k, l]) => { if (l.length) { P('**' + k + '**', ''); l.slice(0, 30).forEach((x) => P('- ' + x)); if (l.length > 30) P('- … ' + (l.length - 30) + ' more'); P(''); } });
  }
  if (RT.held.length) { P('**Held prices** (check by hand; the website price is used once the old one is corrected in the Editor)', ''); RT.held.forEach((x) => P('- ' + x)); P(''); }
  if (Object.keys(fields).length) {
    P('| Field | Products that differ |', '|---|---:|', ...Object.entries(fields).sort((a, b) => b[1] - a[1]).map(([k, n]) => '| ' + k + ' | ' + n + ' |'), '');
    Object.entries(ex).forEach(([k, l]) => { P('**' + k + '**', ''); l.slice(0, 12).forEach((x) => P('- ' + x)); if (l.length > 12) P('- … ' + (l.length - 12) + ' more'); P(''); });
  }
}
fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n') + '\n');
console.log('build/catalog.json: ' + products.length + ' products, ' + bundles.length + ' bundles, ' + cats.size + ' categories · build/report.md written' + (Object.keys(R.unknownTypes).length ? ' · unknown types: ' + Object.keys(R.unknownTypes).join(', ') : ''));
