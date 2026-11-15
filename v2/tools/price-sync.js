/* HiFi Planner price sync. Fetches current prices from hifiklubben.dk and updates data/products.js.
   Runs daily on GitHub (see .github/workflows/price-sync.yml). No dependencies, Node 18+.

   node tools/price-sync.js <data dir> [--fixture <file>] [--dry]
     --fixture  read products from a file instead of the website (one JSON object per line, as written by the old fetch-data.ps1)
     --dry      report only, write nothing

   Rules: a catalogue product is matched to a website product by SKU (exact, then unambiguous prefix), then by brand + model name.
   A price is left alone and reported as suspicious when: the new price is outside 40%-250% of the old one, the SKU is shared by
   several catalogue products, or the website variants cost different amounts and the catalogue SKU does not name one variant. */
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), DIR = args[0] || 'data', DRY = args.includes('--dry');
const FIXTURE = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null;
const URL_ = 'https://www.hifiklubben.dk/_search', MIN_SITE_PRODUCTS = 300;
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function fetchSite() {
  const body = { facets: { modelTypeName: [], brand: [], amplifierStreamingFeature: [], ampMultiroomPlatform: [], ampConnectionsWired: [], ampStreamingServices: [], color: [], amplifierTechnology: [], ampFeatures: [] },
    constraints: {}, pageSize: 50, sortBy: 'MostPopular', outlet: 'false', source: 'Product Listing Page', query: '', page: 0, type: 'category', currency: 'DKK', locale: 'da-DK', user: { classifications: { country: 'dk' } } };
  const out = [];
  for (let page = 0; page < 200; page++) {
    body.page = page;
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (HiFi Planner price sync)' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('hifiklubben.dk answered ' + r.status + ' on page ' + page);
    const results = ((await r.json()).products || {}).results || [];
    for (const p of results) {
      if (p.outletOnly === true || p.outletOnly === 'True') continue;
      out.push({ brand: p.brandName, model: p.modelName, sku: p.skuCode, variants: (p.variants || []).map((v) => ({ sku: v.sku, price: v.priceDetails && v.priceDetails.price, unit: v.priceDetails && v.priceDetails.rawSalesUnit })) });
    }
    if (results.length < 50) break;
  }
  return out;
}
const readFixture = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { const j = JSON.parse(l.replace(/^﻿/, '')); return { brand: j.brand, model: j.model, sku: j.sku, variants: j.variants.map((v) => ({ sku: v.sku, price: v.price.price, unit: v.price.unit })) }; });

function matcher(site) {
  const exact = new Map(), byName = new Map();
  site.forEach((s) => {
    s.variants = s.variants.filter((v) => v.sku && v.price > 0);
    if (!s.variants.length) return;
    if (s.sku) exact.set(s.sku.toUpperCase(), { s });
    s.variants.forEach((v) => exact.set(v.sku.toUpperCase(), { s, v }));
    byName.set(norm(s.brand + s.model), s);
  });
  const lowest = (s) => s.variants.reduce((a, b) => (b.price < a.price ? b : a));
  return (p) => {
    const sku = (p.sku || '').toUpperCase();
    if (sku && exact.has(sku)) { const h = exact.get(sku); return { how: h.v ? 'variant-sku' : 'sku', s: h.s, v: h.v || lowest(h.s), exactVariant: !!h.v }; }
    if (sku.length >= 5) { // catalogue SKU without the colour suffix
      const hits = new Set(); for (const [k, h] of exact) if (k.startsWith(sku)) hits.add(h.s);
      let list = [...hits];
      if (list.length > 1) list = list.filter((s) => norm(s.brand + s.model) === norm(p.brand + p.name));
      if (list.length === 1) return { how: 'sku-prefix', s: list[0], v: lowest(list[0]) };
    }
    const n = byName.get(norm(p.brand + p.name));
    return n ? { how: 'name', s: n, v: lowest(n) } : null;
  };
}

(async () => {
  const file = path.join(DIR, 'products.js'), text = fs.readFileSync(file, 'utf8');
  const products = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  const site = FIXTURE ? readFixture(FIXTURE) : await fetchSite();
  if (site.length < MIN_SITE_PRODUCTS) throw new Error('Only ' + site.length + ' products came back from hifiklubben.dk. Refusing to touch prices.');
  const match = matcher(site), changed = [], suspicious = [], unmatched = [];
  const skuCount = {}; products.forEach((p) => { if (p.sku) skuCount[p.sku.toUpperCase()] = (skuCount[p.sku.toUpperCase()] || 0) + 1; });
  const dupSku = new Set(Object.keys(skuCount).filter((k) => skuCount[k] > 1));
  let matched = 0;
  for (const p of products) {
    const m = match(p);
    if (!m) { unmatched.push(p.brand + ' ' + p.name + (p.sku ? ' [' + p.sku + ']' : '')); continue; }
    matched++;
    const np = Math.round(m.v.price);
    if (np === p.price) continue;
    const row = { name: p.brand + ' ' + p.name, old: p.price, new: np, how: m.how, site: m.s.brand + ' ' + m.s.model + ' / ' + m.v.sku };
    const sameModel = norm(m.s.brand + m.s.model) === norm(p.brand + p.name);
    const mixed = new Set(m.s.variants.map((v) => v.price)).size > 1;
    row.why = p.sku && dupSku.has(p.sku.toUpperCase()) && !sameModel ? 'SKU is used by several catalogue products'
      : mixed && !m.exactVariant ? 'website variants have different prices; give the catalogue product the exact variant SKU'
      : p.price > 0 && (np < p.price * 0.4 || np > p.price * 2.5) ? 'price jump too large' : '';
    if (row.why) { suspicious.push(row); continue; }
    changed.push(row); p.price = np;
  }
  const md = ['## HiFi Planner price sync', '', `Website products: **${site.length}** · catalogue: **${products.length}** · matched: **${matched}** · prices changed: **${changed.length}** · suspicious (not changed): **${suspicious.length}** · not found: **${unmatched.length}**`, ''];
  const table = (title, rows) => rows.length && md.push('### ' + title, '', '| Product | Old | New | Matched by | Website product | Note |', '|---|---:|---:|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.old} | ${r.new} | ${r.how} | ${r.site} | ${r.why || ''} |`), '');
  table('Changed', changed); table('Suspicious, left unchanged (check these by hand)', suspicious);
  if (unmatched.length) md.push('<details><summary>Not found on the website (' + unmatched.length + ')</summary>', '', unmatched.map((u) => '- ' + u).join('\n'), '', '</details>');
  const report = md.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  if (DRY) return;
  if (changed.length) fs.writeFileSync(file, '/* HiFi Planner products. Edit through the app (Admin), not by hand. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = ' + JSON.stringify(products).replace(/\},\{"id"/g, '},\n{"id"') + ';\n');
  fs.writeFileSync(path.join(DIR, 'price-sync.js'), '/* Written by tools/price-sync.js. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.priceSync = ' + JSON.stringify({ date: new Date().toISOString(), matched, changed: changed.length, suspicious: suspicious.length, unmatched: unmatched.length }) + ';\n');
})().catch((e) => { console.error('Price sync failed: ' + e.message); process.exit(1); });
