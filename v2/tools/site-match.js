/* Matching HiFi Planner products to hifiklubben.dk listing records, and the website facts derived from a match
   (price, discount, colour variants, URL). Shared by tools/own-split.js and tools/catalog-build.js.

   The functions are copied unchanged from tools/price-sync.js, so the new catalogue build computes exactly what the hourly sync
   writes today. When the app switches to the generated catalogue, price-sync.js will use this module instead of its own copy. */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const isOutletRibbon = (r) => r && r.ribbonType === 'outlet';
const uuidOf = (u) => { const m = /image\/([0-9a-f-]{36})/.exec(u || ''); return m ? m[1] : null; };
const fromApi = (p) => ({ brand: p.brandName, model: p.modelName, sku: p.skuCode, type: p.modelType, url: p.url, bundle: !!p.isBundle,
  outlet: !!(p.outletOnly || p.isOutletItem || (p.ribbons || []).some(isOutletRibbon) || /\/outlet\//.test(p.url || '')),
  variants: (p.variants || []).map((v) => ({ sku: v.sku, price: v.priceDetails && v.priceDetails.price, before: v.priceDetails && v.priceDetails.priceBefore,
    unit: v.priceDetails && v.priceDetails.rawSalesUnit, image: v.image, label: v.label || v.color, key: v.colorKey, hex: v.colorCode, url: v.url,
    outlet: (v.ribbons || []).some(isOutletRibbon) })) });
// the sellable website products: outlet units and outlet variants left out, as in the sync
const sellable = (listing) => listing.map((r) => (r.brandName ? fromApi(r) : r)).filter((s) => !s.outlet)
  .map((s) => (s.variants.some((v) => v.outlet) ? Object.assign({}, s, { variants: s.variants.filter((v) => !v.outlet) }) : s)).filter((s) => s.variants.length);

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
  const match = (p) => {
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
  // follow a stored link instead of matching again: website product SKU, and the variant SKU when the card is one variant
  match.byLink = (link) => {
    const h = exact.get(String(link.site || '').toUpperCase());
    if (!h) return null;
    const s = h.s, v = link.v ? s.variants.find((x) => x.sku.toUpperCase() === link.v.toUpperCase()) : lowest(s);
    return v ? { how: 'link', s, v, exactVariant: !!link.v } : null;
  };
  return match;
}

// the website facts the sync writes for a matched product (price-sync.js step 2), for a card that is (or is not) one of a pair
function webFacts(m, { single, cable, hk }) {
  const half = single && m.v.unit === 'pair' ? 0.5 : 1; // the card is one speaker, the website sells pairs
  const colours = !cable && !m.exactVariant && m.s.variants.length > 1 && new Set(m.s.variants.map((v) => v.label)).size > 1;
  const vars = colours ? m.s.variants.map((v) => { const o = { sku: v.sku, label: v.label || v.sku, price: Math.round(v.price * half) }; if (v.key) o.key = v.key; if (v.hex) o.hex = v.hex; if (v.before > v.price) o.was = Math.round(v.before * half); if (v.url) o.url = v.url; const u = uuidOf(v.image); if (u) o.img = hk(u); return o; }).sort((a, b) => a.price - b.price || a.label.localeCompare(b.label)) : null;
  const price = Math.round(m.v.price * half), was = m.v.before > m.v.price ? Math.round(m.v.before * half) : 0;
  return { site: m.s.sku, url: m.v.url || m.s.url, price, was, vars, half: half !== 1 };
}

module.exports = { norm, uuidOf, fromApi, sellable, matcher, webFacts };
