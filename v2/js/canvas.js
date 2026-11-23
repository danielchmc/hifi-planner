/* HiFi Planner v2 — canvas: pan/zoom world, A4 pages, cards, wires, selection, print. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, snap, clamp, icon } = HP;
  const C = (HP.canvas = {});
  // A4 in world units. 1400 × 1000 (A4 is 1 : 1.414) so every page edge falls on the 20-unit grid and on the 100-unit grid
  // shown when zoomed out; pages are 100 apart for the same reason. Printing scales the page to fit A4 (1.5 mm side margins).
  const LONG = 1400, SHORT = 1000, GAP = 100, GRID = 20;
  const snapGrid = (v) => Math.round(v / GRID) * GRID;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  let vp, world, pagesEl, planEl, wiresSvg, itemsEl, chipsEl, tempSvg, overlay, selbar, marqueeEl, zoomLbl;
  const view = { x: 40, y: 40, z: 0.6 };
  const els = new Map(), geom = new Map(), routes = new Map();
  let stamp = null, ghost = null, tool = null, toolSvg, lastCable = null;
  const snap5 = (v) => Math.round(v / 5) * 5;
  let wiring = null, spaceDown = false, order = '', lastPtr = null, lastImgClick = { id: null, t: 0 };
  C.hd = false;

  const pageSize = () => (store.doc.orient === 'portrait' ? { w: SHORT, h: LONG } : { w: LONG, h: SHORT });
  const pageRect = (i) => { const s = pageSize(); return { x: i * (s.w + GAP), y: 0, w: s.w, h: s.h }; };
  C.pageSize = pageSize; C.pageRect = pageRect;

  /* ================= CI marks =================
     A mark is a small lettered symbol on the floor plan. One letter per product (doc.mk keeps the order), the shape shows the
     kind of product, the colour the product. Keys starting with "@" are generic symbols (rack, router, TV…), not products. */
  const MARK_COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#bc4c00', '#8250df', '#0a7ea4', '#bf3989', '#57606a', '#9a6700', '#0f5132'];
  const SHAPES = { circle: '<circle cx="20" cy="20" r="18.5"/>', square: '<rect x="2.5" y="2.5" width="35" height="35"/>', triangle: '<path d="M20 1.5 39.5 37.5H.5z"/>', diamond: '<path d="M20 .5 39.5 20 20 39.5 .5 20z"/>', hex: '<path d="M10.5 3h19L39.5 20l-10 17h-19L.5 20z"/>' };
  const INK = '#141518';
  const GENERIC = {
    rack: ['Amplifier / rack', 'Forstærker / rack', '<rect x="10" y="10" width="20" height="20"/><path d="M10 16.7h20M10 23.3h20"/>'],
    router: ['Router / network', 'Router / netværk', '<path d="M10.5 17.5a13.5 13.5 0 0 1 19 0M15 22.5a7 7 0 0 1 10 0"/><circle cx="20" cy="28" r="1.6" fill="' + INK + '"/>'],
    tv: ['TV', 'TV', '<rect x="8.5" y="11" width="23" height="14.5"/><path d="M15 30.5h10"/>'],
    listen: ['Listening position', 'Lytteposition', '<circle cx="20" cy="14.5" r="4.5"/><path d="M11 31c0-5 4-8 9-8s9 3 9 8"/>'],
    vol: ['Volume control / keypad', 'Volumenkontrol / betjening', '<circle cx="20" cy="20" r="9.5"/><path d="M20 20l5.5-6.5"/>'],
    outlet: ['Cable outlet', 'Kabeludtag', '<circle cx="20" cy="20" r="10.5"/><circle cx="16" cy="20" r="1.4" fill="' + INK + '"/><circle cx="24" cy="20" r="1.4" fill="' + INK + '"/>'],
  };
  C.GENERIC = GENERIC;
  const SPEAKER_CATS = (HP.CAT_TREE.find((g) => g[0] === 'Speakers') || [0, []])[1];
  function shapeOf(p) {
    const cats = p.cats || [], name = p.name.toLowerCase(), hay = (p.url || '').toLowerCase() + ' ' + name;
    if (p.kind) { // generated catalogue: the website's own type says what it is
      const fx = p.fx || {};
      if (p.kind === 'subwoofer') return 'triangle';
      if (p.kind !== 'speaker') return 'diamond';
      if (fx.mount === 'ceiling' || fx.mount === 'inwall') return /^ccm/.test(name) ? 'circle' : /^cwm/.test(name) ? 'square' : fx.mount === 'ceiling' ? 'circle' : 'square';
      return fx.mount === 'wall' ? 'square' : 'hex';
    }
    if (cats.includes('Subwoofers')) return 'triangle';
    if (cats.includes('CI & Outdoor Speakers')) return /^ccm|ceiling/.test(name) ? 'circle' : /^cwm|in-?wall/.test(name) ? 'square' // the model name beats the website's category
      : /vaeg|væg|\bwall/.test(hay) ? 'square' : /udendoer|udendørs|outdoor/.test(hay) ? 'hex' : 'circle';
    if (cats.includes('On-Wall Speakers')) return 'square';
    if (cats.some((c) => SPEAKER_CATS.includes(c))) return 'hex';
    return 'diamond';
  }
  const SHAPE_NAMES = { circle: ['ceiling speaker', 'loftshøjtaler'], square: ['wall speaker', 'væghøjtaler'], triangle: ['subwoofer', 'subwoofer'], hex: ['speaker', 'højtaler'], diamond: ['electronics', 'elektronik'] };
  const letter = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26));
  let MK = []; // product keys that have marks, in letter order (recomputed on every render)
  function markKeys() {
    const d = store.doc, present = [];
    d.items.forEach((i) => { if (i.kind === 'mark' && i.k[0] !== '@' && !present.includes(i.k)) present.push(i.k); });
    const keep = (d.mk || []).filter((k) => present.includes(k));
    return keep.concat(present.filter((k) => !keep.includes(k)));
  }
  const normMarks = () => { store.doc.mk = MK = markKeys(); };
  const markIndex = (key) => { const i = MK.indexOf(key); return i < 0 ? MK.length : i; };
  function markHtml(key) {
    const open = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">';
    if (key[0] === '@') {
      const g = GENERIC[key.slice(1)] || GENERIC.outlet;
      return open + '<rect x="1.5" y="1.5" width="37" height="37" rx="8" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/><g fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + g[2] + '</g></svg>';
    }
    const p = cat.get(key), i = markIndex(key), L = p ? letter(i) : '?', shape = p ? shapeOf(p) : 'circle';
    return open + '<g fill="' + (p ? MARK_COLORS[i % MARK_COLORS.length] : '#8b949e') + '">' + SHAPES[shape] + '</g><text x="20" y="' + (shape === 'triangle' ? 32 : 26.6) + '" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="' +
      (shape === 'triangle' ? (L.length > 1 ? 11 : 15) : L.length > 1 ? 14 : 19) + '" fill="#fff">' + L + '</text></svg>';
  }
  const markTitle = (key) => { if (key[0] === '@') { const g = GENERIC[key.slice(1)]; return g ? t(g[0], g[1]) : ''; } const p = cat.get(key); return p ? letter(markIndex(key)) + ' · ' + p.brand + ' ' + p.name : t('Unknown product', 'Ukendt produkt'); };
  C.markHtml = markHtml; C.markTitle = markTitle;
  /* zones (rooms), scale and cable runs */
  const ZONE_COLORS = ['#0a7ea4', '#8250df', '#1a7f37', '#bc4c00', '#bf3989', '#57606a'];
  const fmtM = (m) => (Math.round(m * 10) / 10).toLocaleString('da-DK', { minimumFractionDigits: 1 }) + ' m';
  const runPx = (it) => it.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - it.pts[i - 1][0], p[1] - it.pts[i - 1][1]) : 0), 0);
  // cable per product: metres over all runs, sold in whole metres
  function cableRows() {
    const d = store.doc, m = new Map();
    d.items.forEach((i) => { if (i.kind !== 'run') return; const k = i.cable || '', r = m.get(k) || { k, runs: 0, px: 0 }; r.runs++; r.px += runPx(i); m.set(k, r); });
    return [...m.values()].map((r) => { const p = r.k && cat.get(r.k), len = d.sc ? r.px / d.sc : 0, qty = Math.ceil(len - 1e-6);
      return { k: r.k, name: p ? p.brand + ' ' + p.name : '', runs: r.runs, m: Math.round(len * 10) / 10, qty, price: p && d.sc ? qty * (p.price || 0) : 0 }; });
  }
  function legendRows() {
    const d = store.doc, n = {}, S = (d.ms || 34) / 2;
    d.items.forEach((i) => { if (i.kind === 'mark') n[i.k] = (n[i.k] || 0) + 1; });
    const products = MK.map((k) => { const p = cat.get(k); return { k, p, qty: n[k] || 0, price: p ? p.price || 0 : 0, was: p && p.was > p.price ? p.was : 0 }; });
    // a mark, or a product card, belongs to the first room (zone) that contains its centre. Marks outside every room are listed as
    // "Outside the rooms"; cards outside are not (they are usually a wiring diagram on another page). Within a room a product that is
    // both marked and drawn as cards counts once (the larger number), as in the price list.
    const zs = d.items.filter((i) => i.kind === 'zone'), zr = zs.map((z) => ({ name: z.name || '', m: {}, c: {} })), other = { name: null, m: {}, c: {} };
    const zoneAt = (cx, cy) => zs.findIndex((z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h);
    if (zs.length) d.items.forEach((i) => {
      if (i.np) return;
      if (i.kind === 'mark' && i.k[0] !== '@') { const zi = zoneAt(i.x + S, i.y + S), r = zi < 0 ? other : zr[zi]; (r.m[i.k] = r.m[i.k] || []).push(null); }
      else if (i.kind === 'product' && cat.get(i.pid)) { const g = measure(i) || { w: 0, h: 0 }, zi = zoneAt(i.x + g.w / 2, i.y + g.h / 2); if (zi >= 0) (zr[zi].c[i.pid] = zr[zi].c[i.pid] || []).push(i); }
    });
    const zones = zr.concat(Object.keys(other.m).length ? [other] : []).map((r) => {
      const ids = [...new Set(MK.filter((k) => r.m[k] || r.c[k]).concat(Object.keys(r.c).filter((k) => !MK.includes(k))))];
      let total = 0;
      const parts = ids.map((k) => {
        const p = cat.get(k), cards = r.c[k] || [], qty = Math.max((r.m[k] || []).length, cards.length);
        // cards carry their colour's price; extra marks beyond the cards are priced as the product
        for (let j = 0; j < qty; j++) total += cards[j] ? HP.priceOf(p, cards[j]).price : p ? p.price || 0 : 0;
        return qty + '× ' + (MK.includes(k) ? letter(MK.indexOf(k)) : p ? p.name : k);
      });
      return { name: r.name, parts: parts.join('   '), total };
    });
    const cables = cableRows();
    return { products, generic: Object.keys(GENERIC).map((g) => '@' + g).filter((k) => n[k]).map((k) => ({ k, qty: n[k] })), zones, cables, sc: d.sc || 0,
      total: products.reduce((s, r) => s + r.price * r.qty, 0) + cables.reduce((s, r) => s + r.price, 0) };
  }

  /* ================= cards ================= */
  // product names are links to hifiklubben.dk. On screen they do nothing (cards are dragged and clicked); the printed PDF keeps them clickable.
  const plink = (url, cls, kids) => (url ? h('a.plink' + (cls ? '.' + cls : ''), { href: url, target: '_blank', rel: 'noopener', tabIndex: -1, draggable: false }, kids) : h('span' + (cls ? '.' + cls : ''), null, kids));
  function cardW(p) {
    const len = (a) => Math.max(0, ...(a || []).map((x) => x.label.length));
    return Math.ceil(Math.max(210, (len(p.in) + len(p.out)) * 6.4 + 54) / 10) * 10;
  }
  function buildCard(p, item) {
    const imgs = HP.imagesOf(p, item), face = clamp(item.face || 0, 0, Math.max(0, imgs.length - 1)), v = HP.variantOf(p, item);
    const img = HP.imgEl(imgs[face] || '', C.hd ? 'hd' : 'card', { alt: p.name });
    const port = (x, side) => h('.port.' + side, { data: { key: x.key, side, conn: P.conn(x.conn, x, side), color: P.colorOf(x) }, title: P.CONNECTORS[P.conn(x.conn, x, side)] || '' }, h('i.dot.c-' + P.colorOf(x)), h('span.lbl', null, x.label));
    const hasIO = (p.in || []).length || (p.out || []).length;
    return h('.card', { style: { width: cardW(p) + 'px' } },
      MK.includes(p.id) && h('span.card-mark', { title: t('Marked on the floor plan as ', 'Markeret på plantegningen som ') + letter(MK.indexOf(p.id)), html: markHtml(p.id) }),
      (p.bt || p.wifi) && h('.fabs', null, p.bt && h('span.fab', { title: 'Bluetooth' }, icon('bt')), p.wifi && h('span.fab', { title: 'WiFi' }, icon('wifi'))),
      h('.card-head', null, h('span.brand', null, p.brand, v && !item.len && h('span.vlabel', null, ' · ' + v.label),
          p.gone && h('span.gone-tag.no-print', { title: p.goneWhy === 'outlet' ? t('No longer sold new: hifiklubben.dk only has outlet units', 'Sælges ikke længere som ny: hifiklubben.dk har kun outlet-eksemplarer') : p.goneWhy === 'nosku' ? t('No SKU: not a product HiFi Klubben sells', 'Intet varenummer (SKU): ikke et produkt HiFi Klubben sælger') : t('No longer on hifiklubben.dk', 'Ikke længere på hifiklubben.dk') }, t('DISCONTINUED', 'UDGÅET')),
          p.review && h('span.gone-tag.auto.no-print', { title: t('Added automatically from hifiklubben.dk. Inputs/outputs are suggested from the website and not checked yet.', 'Tilføjet automatisk fra hifiklubben.dk. Ind-/udgange er foreslået ud fra hjemmesiden og ikke kontrolleret endnu.') }, 'AUTO')),
        plink(HP.productUrl(p, item), 'name', [C.cardName(p, item), h('span.plink-ic.print-only', null, ' ↗')])),
      h('.card-img', { title: imgs.length > 1 ? t('Click to flip front/back. Double-click to inspect.', 'Klik for at vende for/bag. Dobbeltklik for at se nærmere.') : t('Double-click to inspect', 'Dobbeltklik for at se nærmere') }, img,
        imgs.length > 1 && h('span.face', null, face ? t('BACK', 'BAG') : t('FRONT', 'FRONT')),
        imgs.length > 0 && h('button.inspect.no-print', { title: t('Inspect image (Alt+I)', 'Se billedet nærmere (Alt+I)'), data: { inspect: '1' } }, icon('search', 13)),
        cat.hasLengths(p) && (() => { // a cable's length, like a variant: a click lists the lengths. By the metre: − 3 m +
          const G = cat.cableGroup(p), o = cat.cableOpt(G, p.id, item.len);
          if (G.metre) return C.metreStepper(item);
          return h('button.vpill.no-print', { data: { lmenu: '1' }, title: G.metre ? t('Sold by the metre', 'Sælges i metermål') : t('Length: ', 'Længde: ') + G.opts.map((x) => x.label).join(', ') },
            h('span.vl', null, G.metre ? lenM(item.m || 1) : o ? o.label : t('Length', 'Længde')), G.metre ? null : h('span.vn', null, G.opts.length), icon('chevron-down', 10));
        })(),
        (p.vars || []).length > 1 && (C.varStyle(p) === 'dots'
          // variants that are distinct colours: a dot each, one click to switch
          ? h('.swatches.no-print', null, p.vars.slice(0, 8).map((x) => h('button.sw' + ((v ? v.sku : '') === x.sku ? '.on' : ''), { title: x.label + ' · ' + HP.money(x.price), data: { var: x.sku }, style: { background: HP.site.swatch(x) } })),
            p.vars.length > 8 && h('span.more', null, '+' + (p.vars.length - 8)))
          // anything else (TV sizes, models, lengths, colours that look alike): the chosen one by name; a click lists them all
          : h('button.vpill.no-print', { data: { vmenu: '1' }, title: t('Variant: ', 'Variant: ') + p.vars.map((x) => x.label).join(', ') },
            C.varStyle(p) === 'pill-colour' && v ? h('i.vsw', { style: { background: HP.site.swatch(v) } }) : null,
            h('span.vl', null, v ? v.label : t('Choose', 'Vælg')), h('span.vn', null, p.vars.length), icon('chevron-down', 10)))),
      hasIO ? h('.card-io', null, h('.col.in', null, (p.in || []).map((x) => port(x, 'in'))), h('.col.out', null, (p.out || []).map((x) => port(x, 'out')))) : null);
  }
  C.buildCard = buildCard; C.cardW = cardW;
  const cardScale = () => store.doc.cardScale || 1;
  C.cardScale = cardScale;

  // a wire's cable as shown on the wire and in its tooltip: the name with the chosen length or metres
  const stripLen = (s) => String(s || '').replace(/[\s,-]*\d+(?:[.,]\d+)?\s?m$/i, '').trim();
  const lenM = (m) => String(m).replace('.', ',') + ' m';
  const nMissing = () => (HP.complete ? HP.complete.missing() : 0);
  C.cableName = (c, p) => {
    if (!p) return '';
    const l = c && c.lv && (p.lens || []).find((x) => x.sku === c.lv);
    if (l) return stripLen(p.name) + ' ' + l.label;
    if (c && c.m) return stripLen(p.name) + ' ' + String(c.m).replace('.', ',') + ' m';
    // a card whose own length the website stopped selling (lenGone) is priced at the cable's cheapest length: name that length
    const d = !(c && (c.lv || c.m)) && p.lenGone && (p.lens || []).find((x) => x.price === p.price);
    if (d) return stripLen(p.name) + ' ' + d.label;
    return p.name;
  };
  C.cablePrice = (c, p) => (c && c.m ? Math.ceil(c.m) * (p.price || 0) : HP.priceOf(p, c && c.lv ? { len: c.lv } : null).price);
  C.stripLen = stripLen;
  C.lenLabel = (p) => { const m = cat.lenOf(p); return m ? lenM(m) : ''; };
  // a card's name: a cable that comes in several lengths is named with the card's length (Black Lab - Sub 3 m, Rocket 33 4 m)
  C.cardName = (p, it) => {
    if (!cat.hasLengths(p)) return p.name;
    const G = cat.cableGroup(p), o = cat.cableOpt(G, p.id, it && it.len), base = stripLen(p.name) || p.name;
    return G.metre ? base + ' ' + lenM((it && it.m) || 1) : o ? base + ' ' + o.label : p.name;
  };
  /* Metres for cable sold by the metre: − N m + (like the Kort − % + stepper). The number can be typed (digits only; Enter or
     leaving the field saves, Esc cancels, ↑/↓ step by 1). Whole metres 1–99, as cable is cut in the shop. One step for Undo each. */
  const M_MIN = 1, M_MAX = 99;
  C.setMetres = (id, m) => {
    const it = store.item(id); if (!it) return;
    m = Math.max(M_MIN, Math.min(M_MAX, Math.round(+m || 0))); if (!m || m === (it.m || 1)) return render();
    it.m = m; HP.LS.set('cableLen', m); store.commit();
  };
  // item: a card ({ id, m }) or, with onSet, any { m } (the cable picker: onSet(m) on every change, nothing is saved here)
  C.metreStepper = (item, onSet) => {
    const clampM = (m) => Math.max(M_MIN, Math.min(M_MAX, Math.round(+m || 0) || M_MIN)), cur = () => item.m || 1;
    const set = onSet ? (m) => { item.m = clampM(m); inp.value = String(item.m); sync(); onSet(item.m); } : (m) => C.setMetres(item.id, m);
    const inp = h('input.mval', { type: 'text', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 2, value: String(cur()), title: t('Metres: type a number, or use − / +', 'Meter: skriv et tal, eller brug − / +'),
      oninput: (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); if (v !== e.target.value) e.target.value = v; if (onSet && +v >= M_MIN) { item.m = clampM(v); sync(); onSet(item.m); } },
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); if (onSet) { set(e.target.value || cur()); onSet(item.m, true); } else e.target.blur(); }
        else if (e.key === 'Escape') { if (!onSet) { e.preventDefault(); e.target.value = String(cur()); e.target.blur(); } }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const m = clampM((+e.target.value || cur()) + (e.key === 'ArrowUp' ? 1 : -1)); e.target.value = String(m); if (onSet) set(m); }
      },
      onfocus: (e) => e.target.select(),
      onblur: (e) => { if (e.target.value !== String(cur()) || !e.target.value) set(e.target.value || cur()); } });
    const step = (d) => h('button.mbtn', { type: 'button', data: onSet ? {} : { mstep: String(d) }, title: d < 0 ? t('1 m less', '1 m mindre') : t('1 m more', '1 m mere'),
      onclick: onSet ? (e) => { e.stopPropagation(); set(cur() + d); } : null }, d < 0 ? '−' : '+');
    const minus = step(-1), plus = step(1);
    const sync = () => { minus.disabled = cur() <= M_MIN; plus.disabled = cur() >= M_MAX; };
    sync();
    return h('.mstep' + (onSet ? '' : '.no-print'), { title: t('Sold by the metre', 'Sælges i metermål'), onclick: onSet ? (e) => e.stopPropagation() : null }, minus, inp, h('span.munit', null, 'm'), plus);
  };
  // a cable card's lengths (or metres): picking one changes the card's product and/or its website length
  const METRES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30];
  C.lengthMenu = (id, anchor, x, y) => {
    const it = store.item(id), p = it && cat.get(it.pid), G = cat.cableGroup(p); if (!G || !cat.hasLengths(p)) return;
    const r = anchor ? anchor.getBoundingClientRect() : null, at = [r ? r.left : x, r ? r.bottom + 4 : y];
    if (G.metre) { // the card's own − N m + field
      const f = document.querySelector('.item[data-id="' + id + '"] .mval'); if (f) return f.focus();
      const ms = [...new Set(METRES.concat(it.m ? [it.m] : []))].sort((a, b) => a - b);
      return HP.menu(at[0], at[1], [{ head: t('Metres', 'Meter') + ' · ' + HP.money(p.price) + ' / m' }].concat(ms.map((m) => ({ label: lenM(m) + '  ·  ' + HP.money(m * (p.price || 0)), on: (it.m || 1) === m,
        fn: () => { it.m = m; HP.LS.set('cableLen', m); store.commit(); } }))));
    }
    const cur = cat.cableOpt(G, it.pid, it.len);
    HP.menu(at[0], at[1], [{ head: t('Length', 'Længde') }].concat(G.opts.map((o) => ({ label: o.label + '  ·  ' + HP.money(o.price) + (o.was > o.price ? '  (' + t('was ', 'før ') + HP.money(o.was) + ')' : ''), on: o === cur,
      fn: () => {
        if (o === cur) return;
        HP.LS.set('cableLen', o.m);
        if (o.id !== it.pid && store.doc.conns.some((c) => c.a.item === id || c.b.item === id)) { C.replaceItem(id, o.id); } // ports to carry over
        else if (o.id !== it.pid) { it.pid = o.id; it.face = 0; delete it.v; }
        const now = store.item(id); if (!now) return;
        if (o.lv) now.len = o.lv; else delete now.len;
        store.commit();
      } }))));
  };

  function priceRows() {
    const d = store.doc, rows = new Map();
    const add = (p, cable, it, perM) => {
      if (!p) return;
      const pr = HP.priceOf(p, it), key = p.id + '|' + (pr.label || ''), vv = HP.variantOf(p, it);
      const r = rows.get(key) || { name: p.brand + ' ' + (it && it.len && pr.label ? stripLen(p.name) + ' ' + pr.label : p.name + (pr.label ? ' (' + pr.label + ')' : '')), url: HP.productUrl(p, it), img: (HP.imagesOf(p, it) || [])[0] || (p.img || [])[0] || '', sku: (vv && vv.sku) || p.sku || '', price: pr.price, was: pr.was, qty: 0, cable };
      if (perM) { r.cableM = true; r.name = p.brand + ' ' + (stripLen(p.name) || p.name); } // sold by the metre: qty is metres
      r.qty++; rows.set(key, r);
    };
    // systems: every complete set of cards placed from one bundle (sy) is one line at the bundle price, its parts listed under it;
    // "was" is what the parts cost one by one (or the website's own before-price, if higher). Cards left over (a part deleted, an
    // extra card) are priced on their own below.
    const used = new Set(), sysHave = {};
    const bySy = {}; d.items.forEach((it) => { if (it.kind === 'product' && !it.np && it.sy && cat.get(it.pid)) (bySy[it.sy] = bySy[it.sy] || []).push(it); });
    Object.keys(bySy).forEach((sku) => {
      const b = cat.system(sku); if (!b) return;
      const pool = bySy[sku];
      const n = Math.min(...b.parts.map((x) => Math.floor(pool.filter((it) => it.pid === x.id).length / x.qty)));
      if (!(n >= 1)) return;
      let parts = 0;
      b.parts.forEach((x) => { const its = pool.filter((it) => it.pid === x.id && !used.has(it.id)).slice(0, x.qty * n); its.forEach((it) => { used.add(it.id); parts += HP.priceOf(cat.get(it.pid), it).price; }); sysHave[x.id] = (sysHave[x.id] || 0) + its.length; });
      const each = parts / n, was = Math.max(each, b.was || 0);
      rows.set('sys|' + sku, { name: cat.systemName(b), url: b.url ? 'https://www.hifiklubben.dk' + b.url : '', sku, price: b.price, was: was > b.price ? Math.round(was) : 0, qty: n, cable: false, sys: true,
        parts: b.parts.map((x) => (x.qty > 1 ? x.qty + '× ' : '') + cat.get(x.id).name).join(' · ') });
    });
    // items with np ("not priced") are left out, e.g. a diagram card that only explains the wiring
    d.items.forEach((it) => {
      if (it.kind !== 'product' || it.np || used.has(it.id)) return;
      const p = cat.get(it.pid);
      if (it.m && cat.isPerMetre(p)) { for (let i = 0; i < Math.ceil(it.m); i++) add(p, true, null, true); return; } // a cable card by the metre: per started metre
      add(p, false, it);
    });
    const mc = {};
    d.items.forEach((it) => { if (it.kind === 'mark' && !it.np && it.k[0] !== '@') mc[it.k] = (mc[it.k] || 0) + 1; });
    for (const pid in mc) { // a product placed as marks and also drawn as cards is the same hardware: count the larger number once
      const p = cat.get(pid); let have = 0;
      rows.forEach((r, key) => { if (key.startsWith(pid + '|')) have += r.qty; });
      have += sysHave[pid] || 0; // cards inside a system count too
      for (let i = have; i < mc[pid]; i++) add(p, false, null);
    }
    // a wire's cable: in the chosen length (lv), or by the metre (m metres, counted per started metre like cable runs)
    d.conns.forEach((c) => {
      const ad = c.ad && cat.get(c.ad); if (ad) add(ad, true); // the adapter in the chain (a Y-splitter…)
      const p = c.cable && cat.get(c.cable); if (!p) return; if (c.m) { for (let i = 0; i < Math.ceil(c.m); i++) add(p, true, null, true); } else add(p, true, c.lv ? { len: c.lv } : null);
    });
    cableRows().forEach((r) => { if (r.k && d.sc) for (let i = 0; i < r.qty; i++) add(cat.get(r.k), true); });
    const list = [...rows.values()].sort((a, b) => a.cable - b.cable);
    return { list, total: list.reduce((s, r) => s + r.price * r.qty, 0), saving: list.reduce((s, r) => s + (r.was ? (r.was - r.price) * r.qty : 0), 0) };
  }
  C.priceRows = priceRows;

  function buildItem(it) {
    const d = store.doc;
    if (it.kind === 'product') {
      const p = cat.get(it.pid);
      if (!p) return h('.card.missing', { style: { width: '210px' } }, h('.card-head', null, h('span.brand', null, t('Unknown product', 'Ukendt produkt')), h('span.name', null, it.pid)));
      const card = buildCard(p, it);
      const sb = it.sy && cat.system(it.sy);
      if (sb) card.querySelector('.card-head').append(h('span.sys-tag.no-print', { title: t('Part of the system ', 'Del af systemet ') + cat.systemName(sb) + t(' (priced as the system while all its parts are on the canvas)', ' (prissat som systemet, så længe alle dele er på lærredet)') }, 'System'));
      if (it.np) card.querySelector('.card-head').append(h('span.np-tag.no-print', { title: t('Not counted in the price list', 'Tælles ikke med i prislisten') }, t('Not priced', 'Ikke i pris')));
      return card;
    }
    if (it.kind === 'text') {
      // Tab / Enter in the title jumps to the paragraph, Shift+Tab jumps back
      const jump = (from, e) => {
        e.preventDefault();
        const sel = from.classList.contains('note-title') ? '.note-body' : '.note-title';
        from.blur(); // saves the field; the text box is redrawn, so find the other field again afterwards
        const box = els.get(it.id), to = box && box.querySelector(sel); if (!to) return;
        to.focus(); const r = document.createRange(); r.selectNodeContents(to); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      };
      const edit = (cls, key, ph) => {
        const el = h(cls, { contentEditable: 'true', data: { ph }, textContent: it[key] || '',
          onkeydown(e) {
            if (e.key === 'Tab') jump(el, e);
            else if (e.key === 'Enter' && key === 'title' && !e.shiftKey) jump(el, e);
          },
          onblur(e) { const v = e.target.innerText.replace(/\n+$/, ''); if (v !== (it[key] || '')) { it[key] = v; store.commit(); } } });
        el.setAttribute('spellcheck', 'false'); el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off'); // no red underlines
        return el;
      };
      return h('.note', { style: { width: it.w + 'px', minHeight: it.h + 'px' } }, h('.note-grip', { title: t('Drag to move', 'Træk for at flytte') }),
        !it.noTitle && edit('.note-title' + (it.noBody ? '.solo' : ''), 'title', t('Title', 'Titel')),
        !it.noBody && edit('.note-body', 'body', t('Write something…', 'Skriv noget…')), h('i.resize.no-print'));
    }
    if (it.kind === 'prices') {
      const { list, total, saving } = priceRows();
      const pct = (r) => Math.round((1 - r.price / r.was) * 100);
      // rooms drawn in CI mode: what each room gets (marks and product cards inside it), with a subtotal (cables are not tied to a room)
      const roomRows = () => { const z = legendRows().zones; return z.length ? [h('.lsec', null, t('Per room (floor plan)', 'Pr. rum (plantegning)')), h('table.rooms', null, z.map((r) => h('tr', null,
        h('td.zn', null, r.name === null ? t('Outside the rooms', 'Uden for rum') : r.name || t('Room', 'Rum')), h('td.zp', null, r.parts || '–'), h('td.p', null, r.total ? HP.money(r.total) : ''))))] : null; };
      return h('.prices', null, h('.prices-head', null, t('Items & prices', 'Varer & priser')),
        list.length ? h('table', null, list.map((r) => h('tr', null, h('td.q', null, r.cableM ? r.qty + ' m' : r.qty > 1 ? r.qty + '×' : ''),
          h('td', null, r.sys ? h('span.systag', null, 'System') : null, plink(r.url, '', r.name), r.was ? h('span.save', null, t('Save ', 'Spar ') + pct(r) + '%') : null, r.sys ? h('.sysparts', null, r.parts) : null),
          h('td.p', null, r.was ? h('s', null, HP.money(r.was * r.qty)) : null, HP.money(r.price * r.qty))))) : h('.muted', null, t('No products yet', 'Ingen produkter endnu')),
        roomRows(),
        h('.prices-total', null, h('span', null, 'Total'), h('span', null, HP.money(total))),
        saving > 0 && h('.prices-saving', null, h('span', null, t('You save', 'Du sparer')), h('span', null, HP.money(saving))),
        h('.prices-note', null, t('Prices valid on ', 'Priser gælder d. ') + HP.today()),
        // on screen only: connections still without a cable, and the way to complete the proposal
        nMissing() ? h('button.pl-nudge.no-print', { onpointerdown: (e) => e.stopPropagation(), onclick: () => HP.complete.open() }, icon('cable', 13),
          nMissing() + ' ' + t(nMissing() === 1 ? 'connection without a cable' : 'connections without a cable', nMissing() === 1 ? 'forbindelse uden kabel' : 'forbindelser uden kabel'), h('b', null, t('Related products →', 'Relaterede produkter →'))) : null);
    }
    if (it.kind === 'zone') {
      const col = ZONE_COLORS[d.items.filter((i) => i.kind === 'zone').indexOf(it) % ZONE_COLORS.length];
      const nm = h('.zone-name', { contentEditable: 'true', data: { ph: t('Room name', 'Rumnavn') }, textContent: it.name || '', style: { background: col },
        onkeydown(e) { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); nm.blur(); } },
        onblur() { const v = nm.innerText.trim(); if (v !== (it.name || '')) { it.name = v; store.commit(); } } });
      nm.setAttribute('spellcheck', 'false');
      return h('.zone', { style: { width: it.w + 'px', height: it.h + 'px', borderColor: col } },
        h('.zone-tab', null, h('i.zgrip.no-print', { style: { background: col }, title: t('Drag to move the room', 'Træk for at flytte rummet') }), nm), h('i.resize.no-print', { style: { background: col } }));
    }
    if (it.kind === 'run') {
      const w = Math.max(1, ...it.pts.map((p) => p[0])), hh = Math.max(1, ...it.pts.map((p) => p[1])), dd = 'M' + it.pts.map((p) => p.join(',')).join(' L');
      let half = runPx(it) / 2, mid = it.pts[0];
      for (let i = 1; i < it.pts.length; i++) { const a = it.pts[i - 1], b = it.pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (half <= seg) { const f = seg ? half / seg : 0; mid = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; break; } half -= seg; }
      const a = it.pts[0], b = it.pts[it.pts.length - 1], cp = it.cable && cat.get(it.cable);
      return h('.run' + (cp ? '.has' : ''), { style: { width: w + 'px', height: hh + 'px' }, title: cp ? cp.brand + ' ' + cp.name : t('Cable run: no cable chosen', 'Kabeltræk: intet kabel valgt'),
        html: '<svg width="' + w + '" height="' + hh + '"><path class="hit" d="' + dd + '"/><path class="line" d="' + dd + '"/><circle cx="' + a[0] + '" cy="' + a[1] + '" r="3.5"/><circle cx="' + b[0] + '" cy="' + b[1] + '" r="3.5"/></svg>' },
        h('span.rl', { style: { left: mid[0] + 'px', top: mid[1] + 'px' } }, d.sc ? fmtM(runPx(it) / d.sc) : '? m'));
    }
    if (it.kind === 'mark') { const S = d.ms || 34; return h('.mark' + (it.np ? '.np' : ''), { style: { width: S + 'px', height: S + 'px' }, title: markTitle(it.k), html: markHtml(it.k) }); }
    if (it.kind === 'legend') {
      const { products, generic, cables, sc } = legendRows();
      const bar = sc ? [5, 2, 1, 0.5].find((m) => m * sc <= 150) || 0.25 : 0;
      return h('.prices.legend', null, h('.prices-head', null, t('On the floor plan', 'På plantegningen')),
        products.length || generic.length ? h('table', null,
          products.map((r) => h('tr', null, h('td.lm', null, h('span', { html: markHtml(r.k) })),
            h('td.li', null, r.p && (r.p.img || [])[0] ? HP.imgEl(r.p.img[0], 'thumb') : null),
            h('td', null, r.p ? [h('span.lb', null, r.p.brand), plink(HP.productUrl(r.p), '', r.p.name), h('span.ls', null, shapeOf(r.p) === 'hex' && ((r.p.cats || []).includes('CI & Outdoor Speakers') || (r.p.fx || {}).mount === 'outdoor') ? t('outdoor speaker', 'udendørshøjtaler') : t(SHAPE_NAMES[shapeOf(r.p)][0], SHAPE_NAMES[shapeOf(r.p)][1]))] : t('Unknown product', 'Ukendt produkt')),
            h('td.q', null, r.qty + ' ' + t(r.qty === 1 ? 'pc' : 'pcs', 'stk')))),
          generic.map((r) => h('tr.lg', null, h('td.lm', null, h('span', { html: markHtml(r.k) })), h('td', { colSpan: 2 }, markTitle(r.k)), h('td.q', null, r.qty > 1 ? r.qty + ' ' + t('pcs', 'stk') : ''))))
          : h('.muted', null, t('No marks yet. Switch on CI mode and click a product to place marks.', 'Ingen mærker endnu. Slå CI-tilstand til, og klik på et produkt for at placere mærker.')),
        cables.length ? [h('.lsec', null, t('Installation cable', 'Installationskabel')), h('table', null, cables.map((c) => h('tr', null,
          h('td.zn', null, c.name || h('span.muted2', null, t('Cable not chosen', 'Kabel ikke valgt'))),
          h('td.zp', null, c.runs + ' ' + t(c.runs === 1 ? 'run' : 'runs', 'træk') + (sc ? ' · ' + fmtM(c.m) : '')))))] : null,
        cables.length && !sc ? h('.lnote', null, t('Set the scale to get cable lengths.', 'Sæt målestokken for at få kabellængder.')) : null,
        bar ? h('.lscale', null, h('i', { style: { width: bar * sc + 'px' } }), (bar + ' m').replace('.', ',')) : null);
    }
    if (it.kind === 'plan') return h('.plan' + (it.lock ? '.locked' : ''), { style: { width: it.w + 'px', height: it.h + 'px' } }, h('img', { src: store.planSrc || '', draggable: false }), h('i.resize.no-print'));
    return h('div');
  }
  function itemSig(it) {
    const d = store.doc, L = HP.lang();
    if (it.kind === 'product') return ['p', it.pid, it.face, it.v, it.len, it.m, it.np, MK.indexOf(it.pid), cardScale(), C.hd, cat.version, L].join('|');
    if (it.kind === 'mark') return ['m', it.k, it.np, MK.indexOf(it.k), d.ms, cat.version, L].join('|');
    if (it.kind === 'zone') return ['z', it.w, it.h, it.name, d.items.filter((i) => i.kind === 'zone').indexOf(it), L].join('|');
    if (it.kind === 'run') return ['c', JSON.stringify(it.pts), it.cable, d.sc, cat.version, L].join('|');
    if (it.kind === 'legend') { const r = legendRows(); return 'l' + JSON.stringify([r.products.map((x) => [x.k, x.qty]), r.generic, r.cables.map((c) => [c.k, c.runs, c.m]), r.sc]) + cat.version + L; }
    if (it.kind === 'text') return ['t', it.w, it.h, it.title, it.body, it.noTitle ? 1 : 0, it.noBody ? 1 : 0, L].join('|');
    if (it.kind === 'prices') return 'r' + JSON.stringify(priceRows()) + JSON.stringify(legendRows().zones) + L + HP.today() + '|' + nMissing();
    if (it.kind === 'plan') return ['f', it.w, it.h, it.lock, (store.planSrc || '').length].join('|');
    return '';
  }

  let rendered = false; // after the first drawing is on screen, new cards animate in
  function renderItems() {
    const seen = new Set(), fresh = [];
    MK = markKeys();
    store.doc.items.forEach((it) => {
      seen.add(it.id);
      const sig = itemSig(it);
      let el = els.get(it.id);
      if (!el || el._sig !== sig) {
        const ne = buildItem(it); ne._sig = sig; ne.dataset.id = it.id; ne.classList.add('item', 'k-' + it.kind);
        if (el) el.replaceWith(ne); else if (it.kind === 'plan') planEl.prepend(ne); else (it.kind === 'zone' ? planEl : itemsEl).append(ne); // plan and rooms sit under everything else
        if (!el && rendered) fresh.push(ne);
        els.set(it.id, ne); el = ne; geom.delete(it.id);
      }
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      if (it.kind === 'product') { const s = cardScale(); el.style.transform = s !== 1 ? 'scale(' + s + ')' : ''; }
      el.classList.toggle('sel', store.sel.has(it.id));
    });
    for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); geom.delete(id); }
    // cards that are new on the canvas fade in: a few at a time (added, pasted, a system), not a whole drawing being opened
    if (fresh.length && fresh.length <= 12 && !HP.reducedMotion()) fresh.forEach((ne) => { ne.classList.add('enter'); setTimeout(() => ne.classList.remove('enter'), 260); });
    rendered = true;
    const ord = store.doc.items.map((i) => i.id).join(',');
    if (ord !== order) { order = ord; store.doc.items.forEach((it) => { const el = els.get(it.id); if (el && it.kind !== 'plan' && it.kind !== 'zone') itemsEl.append(el); }); }
  }
  function measure(it) {
    let g = geom.get(it.id);
    const el = els.get(it.id);
    if (!g && el) {
      const s = it.kind === 'product' ? cardScale() : 1;
      g = { w: el.offsetWidth * s, h: el.offsetHeight * s, p: {}, x: {} };
      // each port: the centre of its dot, measured on screen relative to the card and divided by the zoom, so borders, fractions of a
      // pixel and the card scale are all included (offsetTop counted from inside the card's border and rounded: wires sat about 1 unit
      // too high). Relative to the card, so an animation moving the whole card does not matter.
      const er = el.getBoundingClientRect(), onScreen = er.width > 0 && el.offsetWidth > 0;
      // the zoom actually on screen, read off the card itself (its laid-out width against its width on screen) rather than taken
      // from view.z: the two can differ on a phone (the customer view's wires were drawn several times too long)
      const z = onScreen ? er.width / (el.offsetWidth * s) : 1;
      el.querySelectorAll('.port').forEach((pe) => {
        const k = pe.dataset.side + ':' + pe.dataset.key, d = pe.querySelector('.dot');
        if (onScreen && d) { const r = d.getBoundingClientRect(); g.p[k] = (r.top + r.height / 2 - er.top) / z; g.x[k] = (r.left + r.width / 2 - er.left) / z; }
        else g.p[k] = (pe.offsetTop + pe.offsetHeight / 2) * s;
      });
      geom.set(it.id, g);
    }
    return g || { w: 0, h: 0, p: {} };
  }
  function portPos(itemId, side, key) {
    const it = store.item(itemId); if (!it) return null;
    const g = measure(it), k = side + ':' + key, y = g.p[k];
    return y == null ? null : { x: it.x + (g.x && g.x[k] != null ? g.x[k] : side === 'in' ? 0 : g.w), y: it.y + y };
  }
  const portDef = (itemId, side, key) => { const it = store.item(itemId), p = it && cat.get(it.pid); return p && (p[side] || []).find((x) => x.key === key); };
  function connInfo(c) {
    const a = portDef(c.a.item, 'out', c.a.key), b = portDef(c.b.item, 'in', c.b.key);
    const cable = c.cable ? cat.get(c.cable) : null, ad = c.ad ? cat.get(c.ad) : null;
    return { a, b, conn: a ? P.conn(a.conn, a) : 'other', color: a ? P.colorOf(a) : 'other', warn: !!(a && b && !P.compatible(a.conn, b.conn) && !ad), cable, ad,
      plugs: (cable || ad) && a && b ? P.chainIssues(cable, ad, a, b) : [] }; // male/female or mono/stereo that does not fit (through the adapter, if any)
  }
  C.connInfo = connInfo;

  /* ================= wires ================= */
  function route(c, lane) {
    const a = portPos(c.a.item, 'out', c.a.key), b = portPos(c.b.item, 'in', c.b.key);
    if (!a || !b) return null;
    const S = 20, sh = c.shift || 0;
    if (b.x - a.x >= 2 * S) {
      const mx = clamp((a.x + b.x) / 2 + sh + lane, a.x + S, b.x - S);
      return { pts: [[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]], axis: 'x', mid: [mx, (a.y + b.y) / 2] };
    }
    const ia = store.item(c.a.item), ib = store.item(c.b.item), ga = measure(ia), gb = measure(ib);
    const botA = ia.y + ga.h, botB = ib.y + gb.h;
    let my = botA + 20 <= ib.y ? (botA + ib.y) / 2 : botB + 20 <= ia.y ? (botB + ia.y) / 2 : Math.max(botA, botB) + 24;
    my += sh + lane;
    const x1 = a.x + S + Math.abs(lane), x2 = b.x - S - Math.abs(lane);
    return { pts: [[a.x, a.y], [x1, a.y], [x1, my], [x2, my], [x2, b.y], [b.x, b.y]], axis: 'y', mid: [(x1 + x2) / 2, my] };
  }
  function pathD(pts, r) {
    let d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1), rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 0.5) { d += ' L' + x1 + ',' + y1; continue; }
      d += ' L' + (x1 - ((x1 - x0) / d1) * rr) + ',' + (y1 - ((y1 - y0) / d1) * rr) + ' Q' + x1 + ',' + y1 + ' ' + (x1 + ((x2 - x1) / d2) * rr) + ',' + (y1 + ((y2 - y1) / d2) * rr);
    }
    const l = pts[pts.length - 1];
    return d + ' L' + l[0] + ',' + l[1];
  }
  function renderWires() {
    const d = store.doc;
    wiresSvg.textContent = ''; chipsEl.textContent = ''; routes.clear();
    world.querySelectorAll('.port.on').forEach((e) => e.classList.remove('on'));
    const bySrc = {};
    d.conns.forEach((c) => (bySrc[c.a.item] = bySrc[c.a.item] || []).push(c));
    const lanes = new Map();
    Object.values(bySrc).forEach((list) => list.map((c) => [c, (portPos(c.a.item, 'out', c.a.key) || { y: 0 }).y]).sort((p, q) => p[1] - q[1])
      .forEach(([c], i, arr) => lanes.set(c.id, (i - (arr.length - 1) / 2) * 8)));
    d.conns.forEach((c) => {
      const r = route(c, lanes.get(c.id) || 0); if (!r) return;
      routes.set(c.id, r);
      const info = connInfo(c), dd = pathD(r.pts, 7), sel = store.selConn === c.id;
      const g = svg('g', { class: 'wire c-' + info.color + (sel ? ' sel' : '') + (info.warn ? ' warn' : ''), 'data-id': c.id });
      g.append(svg('path', { class: 'hit', d: dd }), svg('path', { class: 'line', d: dd }));
      wiresSvg.append(g);
      [[c.a, 'out'], [c.b, 'in']].forEach(([e, side]) => { const el = els.get(e.item), pe = el && el.querySelector('.port.' + side + '[data-key="' + e.key + '"]'); if (pe) pe.classList.add('on'); });
      if (info.cable || info.ad || info.warn) {
        const pw = info.plugs.length, bad = info.warn || pw;
        const adTxt = info.ad ? ' + ' + C.stripLen(info.ad.name).replace(/\s+-\s+/g, ' ') : '';
        chipsEl.append(h('.chip.c-' + info.color + (bad ? '.warn' : '') + (sel ? '.sel' : ''), { data: { id: c.id }, style: { left: r.mid[0] + 'px', top: r.mid[1] + 'px' },
          title: (info.cable ? info.cable.brand + ' ' + C.cableName(c, info.cable) + ' · ' + HP.money(C.cablePrice(c, info.cable)) : info.ad ? '' : t('Connector types do not match', 'Stiktyperne passer ikke sammen'))
            + (info.ad ? (info.cable ? '\n+ ' : '') + info.ad.brand + ' ' + info.ad.name + ' · ' + HP.money(HP.priceOf(info.ad).price) : '')
            + (pw ? '\n⚠ ' + info.plugs.map((x) => t(x.en, x.da)).join('\n⚠ ') : '') },
          bad ? h('span.no-print', null, icon('warn', 11)) : null, (info.cable ? C.cableName(c, info.cable).replace(/\s+-\s+/g, ' ') : info.ad ? '' : t('Mismatch', 'Passer ikke')) + (info.cable ? adTxt : adTxt.slice(3))));
      }
    });
  }

  /* ================= pages ================= */
  function renderPages() {
    const d = store.doc, s = pageSize();
    pagesEl.textContent = '';
    for (let i = 0; i < d.pages; i++) {
      const r = pageRect(i);
      pagesEl.append(h('.page', { style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } },
        h('.page-label.no-print', null, 'A4 · ' + (d.orient === 'portrait' ? t('portrait', 'stående') : t('landscape', 'liggende')) + ' · ' + (i + 1) + '/' + d.pages),
        i === d.pages - 1 && d.pages > 1 && h('button.page-x.no-print', { title: t('Remove page', 'Fjern side'), onclick: () => { d.pages--; store.commit(); } }, icon('x', 14)),
        h('.page-foot', null, h('span', { html: HP.klubbenSvg() }),
          h('.page-meta', null, h('div.shopline', null, [HP.shopProfile().name, HP.shopProfile().phone && t('Tel. ', 'Tlf. ') + HP.shopProfile().phone, HP.shopProfile().email].filter(Boolean).join('  ·  ')),
            h('div', null, [HP.seller() && t('Your adviser: ', 'Din rådgiver: ') + HP.seller().name, d.name, HP.today(), d.pages > 1 && (i + 1) + '/' + d.pages].filter(Boolean).join('  ·  '))))));
    }
    const r = pageRect(d.pages);
    pagesEl.append(h('button.page-add.no-print', { style: { left: r.x + 'px', top: '0px', height: s.h + 'px' }, title: t('Add an A4 page', 'Tilføj en A4-side'), onclick: () => { d.pages++; store.commit(); } }, icon('plus'), h('span', null, t('Add page', 'Tilføj side'))));
  }

  /* ================= view ================= */
  function applyView() {
    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')';
    const g = GRID * view.z * (view.z < 0.5 ? 5 : 1);
    vp.style.backgroundSize = g + 'px ' + g + 'px';
    vp.style.backgroundPosition = view.x - g / 2 + 'px ' + (view.y - g / 2) + 'px'; // a dot exactly on every grid point, page corners included
    moveGhost();
    if (zoomLbl) zoomLbl.textContent = Math.round(view.z * 100) + '%';
    const hd = view.z * cardScale() >= 1.3;
    if (hd !== C.hd) { C.hd = hd; renderItems(); }
    placeBar();
    if (!store.view) HP.LS.set('view', view); // a customer link never touches the planner's own view
  }
  // the customer view: the canvas unzoomed, every card rebuilt and measured afresh
  C.resetView = () => { view.x = 0; view.y = 0; view.z = 1; applyView(); };
  function zoomAt(cx, cy, z) {
    z = clamp(z, 0.15, 8);
    const r = vp.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    view.x = px - ((px - view.x) * z) / view.z; view.y = py - ((py - view.y) * z) / view.z; view.z = z;
    applyView();
  }
  const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
  C.toWorld = toWorld;
  C.zoomBy = (f) => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.z * f); };
  C.fit = () => {
    const d = store.doc, s = pageSize(), r = vp.getBoundingClientRect();
    let x0 = 0, y0 = 0, x1 = d.pages * (s.w + GAP) - GAP, y1 = s.h;
    d.items.forEach((it) => { const g = measure(it); x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + g.w); y1 = Math.max(y1, it.y + g.h); });
    const pad = 48, z = clamp(Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0)), 0.15, 1.5);
    view.z = z; view.x = (r.width - (x1 - x0) * z) / 2 - x0 * z; view.y = (r.height - (y1 - y0) * z) / 2 - y0 * z;
    applyView();
  };
  const centerWorld = () => { const r = vp.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  /* ================= selection bar ================= */
  // the item number of a card: the chosen colour's own SKU, else the product's
  C.skuOf = (it) => { const p = it && it.kind === 'product' && cat.get(it.pid); return p ? ((HP.variantOf(p, it) || {}).sku || p.sku || '') : ''; };
  function placeBar() {
    if (!selbar) return;
    const d = store.doc, ids = [...store.sel].filter((id) => store.item(id));
    selbar.textContent = '';
    let anchor = null;
    // icons only (the name is the tooltip); the SKU is the one button with text
    const btn = (ic, label, fn, cls) => h('button' + (cls || ''), { title: label, 'aria-label': label, onclick: fn }, icon(ic));
    if (store.selConn && routes.get(store.selConn)) {
      const r = routes.get(store.selConn);
      anchor = { x: r.mid[0], y: Math.min(...r.pts.map((p) => p[1])) };
      selbar.append(btn('cable', t('Cable', 'Kabel'), () => HP.panels.cablePicker(store.selConn)), btn('trash', t('Delete', 'Slet'), C.deleteSelection, '.danger'));
    } else if (ids.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity;
      ids.forEach((id) => { const it = store.item(id), g = measure(it); x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + g.w); y0 = Math.min(y0, it.y); });
      anchor = { x: (x0 + x1) / 2, y: y0 };
      const one = ids.length === 1 && store.item(ids[0]);
      if (one && one.kind === 'product') {
        const p = cat.get(one.pid), sku = C.skuOf(one);
        if (sku) selbar.append(h('button.sku', { title: t('Copy item number', 'Kopiér varenummer'), onclick: () => HP.copyText(sku, t('Item number copied: ', 'Varenr. kopieret: ') + sku) }, h('span', null, sku), icon('copy')));
        selbar.append(btn('swap', t('Replace', 'Udskift'), () => HP.panels.replacePicker(one.id)));
        if (p && HP.imagesOf(p, one).length > 1) selbar.append(btn('flip', t('Flip', 'Vend'), () => C.flip(one.id)));
        if (p && (p.vars || []).length > 1) selbar.append(btn('layers', t('Variant', 'Variant'), (e) => C.colourMenu(one.id, e.currentTarget)));
        else if (p && cat.hasLengths(p)) selbar.append(btn('layers', t('Length', 'Længde'), (e) => C.lengthMenu(one.id, e.currentTarget)));
      }
      if (one && one.kind === 'text') selbar.append(
        btn('text', t('Title', 'Titel'), () => C.toggleNotePart(one.id, 'title'), (one.noTitle ? '' : '.on') + (one.noBody ? '.locked' : '')),
        btn('text', t('Paragraph', 'Afsnit'), () => C.toggleNotePart(one.id, 'body'), (one.noBody ? '' : '.on') + (one.noTitle ? '.locked' : '')));
      if (one && one.kind === 'mark' && one.k[0] !== '@') selbar.append(btn('swap', t('Replace all ', 'Udskift alle ') + letter(markIndex(one.k)), () => HP.panels.replacePicker(one.id)),
        btn('layers', t('Select all ', 'Markér alle ') + letter(markIndex(one.k)), () => C.selectMarks(one.k)));
      if (one && one.kind === 'run') selbar.append(btn('cable', t('Cable', 'Kabel'), () => HP.panels.runCablePicker(one.id)));
      if (one && one.kind === 'plan') selbar.append(btn(one.lock ? 'move' : 'lock', one.lock ? t('Unlock to move', 'Lås op for at flytte') : t('Lock', 'Lås'), () => { one.lock = !one.lock; store.commit(); }), btn('trash', t('Remove floor plan', 'Fjern plantegning'), C.removePlan, '.danger'));
      const pr = ids.map((id) => store.item(id)).filter(priceable);
      if (pr.length) selbar.append(btn('tag', pr[0].np ? t('Not priced', 'Ikke i pris') : t('In price list', 'I prislisten'), C.togglePriced, pr[0].np ? '.off' : '.on'));
      if (!(one && (one.kind === 'prices' || one.kind === 'plan' || one.kind === 'legend'))) selbar.append(btn('copy', t('Duplicate', 'Dublér'), C.duplicateSelection));
      if (HP.isAdmin() && ids.some((id) => store.item(id).kind === 'product')) selbar.append(btn('bolt', t('Save as Shortcut', 'Gem som genvej'), () => HP.editor.saveShortcut()));
      if (!(one && one.kind === 'plan')) selbar.append(btn('trash', t('Delete', 'Slet'), C.deleteSelection, '.danger'));
    }
    selbar.hidden = !anchor;
    if (anchor) { // keep the bar inside the visible canvas (matters on phones)
      const W = vp.clientWidth, sw = selbar.offsetWidth, sh = selbar.offsetHeight;
      selbar.style.left = clamp(anchor.x * view.z + view.x, Math.min(W / 2, sw / 2 + 6), Math.max(W / 2, W - sw / 2 - 6)) + 'px';
      selbar.style.top = Math.max(sh + 6, anchor.y * view.z + view.y - 12) + 'px';
    }
  }
  function refreshSel() {
    els.forEach((el, id) => el.classList.toggle('sel', store.sel.has(id)));
    renderWires(); placeBar(); HP.emit('sel');
  }
  C.select = (ids) => { store.sel = new Set(ids); store.selConn = null; refreshSel(); };

  /* ================= pointer interactions ================= */
  /* One pointer drag. Touch: a larger dead zone, an optional long-press (onLong, fired after ~0.5 s without moving),
     and a second finger aborts it (pinch-zoom takes over; onEnd gets aborted = true). */
  let curDrag = null, lastTouch = 0, lastRight = 0;
  function drag(e, onMove, onEnd, onLong) {
    const sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch' || e.pointerType === 'pen', thr = touch ? 9 : 4;
    let moved = false, last = e, timer = 0;
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const stop = () => { clearTimeout(timer); vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); vp.removeEventListener('pointercancel', up); if (curDrag === ctl) curDrag = null; };
    const mv = (ev) => { if (ev.pointerId !== e.pointerId) return; last = ev; if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < thr) return; moved = true; clearTimeout(timer); onMove(ev, ev.clientX - sx, ev.clientY - sy); };
    const up = (ev) => { if (ev.pointerId !== e.pointerId) return; stop(); onEnd(ev, moved, false); };
    const ctl = { abort: () => { stop(); onEnd(last, true, true); } };
    curDrag = ctl;
    vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
    if (touch && onLong) timer = setTimeout(() => { if (!moved && curDrag === ctl) { stop(); if (navigator.vibrate) navigator.vibrate(12); onLong(last); } }, 480);
  }
  // long-press on touch = right-click
  // the finger lifting after a long-press sends a click to whatever is under it (the menu that just opened): swallow that one click
  const eatClick = (liftEv) => {
    let lift = liftEv ? { x: liftEv.clientX, y: liftEv.clientY, t: Date.now() } : null;
    const eat = (ev) => { if (lift && (Date.now() - lift.t > 350 || Math.hypot(ev.clientX - lift.x, ev.clientY - lift.y) > 24)) return done(); ev.preventDefault(); ev.stopPropagation(); done(); };
    const up = (ev) => { if (!lift) lift = { x: ev.clientX, y: ev.clientY, t: Date.now() }; }; // only the lift that ends the long-press
    const done = () => { window.removeEventListener('click', eat, true); window.removeEventListener('pointerup', up, true); clearTimeout(tm); };
    window.addEventListener('click', eat, true); window.addEventListener('pointerup', up, true);
    const tm = setTimeout(done, 3000);
  };
  const longMenu = (ev, lifted) => eatClick(lifted) || onContext({ clientX: ev.clientX, clientY: ev.clientY, target: document.elementFromPoint(ev.clientX, ev.clientY) || vp, preventDefault() {}, fromTouch: true });
  const blurActive = () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); };

  function startPan(e, clickClears) {
    const x0 = view.x, y0 = view.y; vp.classList.add('panning');
    drag(e, (ev, dx, dy) => { view.x = x0 + dx; view.y = y0 + dy; applyView(); },
      (ev, moved) => { vp.classList.remove('panning'); if (!moved && clickClears && (store.sel.size || store.selConn)) { store.sel.clear(); store.selConn = null; refreshSel(); } },
      clickClears ? (ev) => { vp.classList.remove('panning'); store.sel.clear(); store.selConn = null; refreshSel(); startMarquee(ev, (up) => longMenu(ev, up)); } : null);
  }
  function startMarquee(e, onTap, fresh) { // fresh: replace the selection (plain drag); otherwise add to it (Shift/Ctrl)
    const r = vp.getBoundingClientRect(), a = toWorld(e.clientX, e.clientY), base = fresh ? new Set() : new Set(store.sel);
    if (onTap) vp.classList.add('selecting');
    drag(e, (ev) => {
      const b = toWorld(ev.clientX, ev.clientY), x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      Object.assign(marqueeEl.style, { display: 'block', left: Math.min(e.clientX, ev.clientX) - r.left + 'px', top: Math.min(e.clientY, ev.clientY) - r.top + 'px', width: Math.abs(ev.clientX - e.clientX) + 'px', height: Math.abs(ev.clientY - e.clientY) + 'px' });
      store.sel = new Set(base);
      store.doc.items.forEach((it) => { if (it.kind === 'plan' || it.kind === 'zone') return; const g = measure(it); if (it.x < x1 && it.x + g.w > x0 && it.y < y1 && it.y + g.h > y0) store.sel.add(it.id); });
      store.selConn = null; refreshSel();
    }, (ev, moved, aborted) => {
      marqueeEl.style.display = 'none'; vp.classList.remove('selecting');
      if (!moved && !aborted && onTap) onTap(ev);
      else if (!moved && !aborted && fresh && (store.sel.size || store.selConn)) { store.sel.clear(); store.selConn = null; refreshSel(); } // a click on empty canvas deselects
    });
  }
  function startItemDrag(e, it) {
    const add = e.shiftKey || e.ctrlKey || e.metaKey, was = store.sel.has(it.id), onImg = !!e.target.closest('.card-img');
    if (!was) { if (!add) store.sel.clear(); store.sel.add(it.id); store.selConn = null; refreshSel(); }
    const group = [...store.sel].map(store.item).filter((i) => i && !(i.kind === 'plan' && i.lock)), start = group.map((i) => [i.x, i.y]);
    // while dragging, the cards follow the pointer exactly (no jumping from grid point to grid point); on release they settle
    // onto the grid with a short ease, the wires following frame by frame
    const snapOf = (i) => (i.kind === 'mark' || i.kind === 'run' ? snap5 : i.kind === 'plan' ? snapGrid : snap);
    const place = (i) => { const el = els.get(i.id); if (el) { el.style.left = i.x + 'px'; el.style.top = i.y + 'px'; } };
    // the cards being moved go on top of all others (the last moved is the topmost); the floor plan and rooms stay underneath
    let raised = false, before = null;
    const raise = () => {
      raised = true; before = store.doc.items.slice();
      const up = group.filter((i) => i.kind !== 'plan' && i.kind !== 'zone'), d = store.doc;
      if (!up.length || d.items.slice(-up.length).every((i, k) => i === up[k])) return;
      d.items = d.items.filter((i) => !up.includes(i)).concat(d.items.filter((i) => up.includes(i)));
      up.forEach((i) => { const el = els.get(i.id); if (el) itemsEl.append(el); });
    };
    // one cable card dragged onto a wire goes on that connection (and the card goes away), as from the product list
    const cablePid = group.length === 1 && it.kind === 'product' && (cat.get(it.pid) || {}).cable ? it.pid : null;
    const lit = () => wiresSvg && wiresSvg.querySelectorAll('.wire.drop-cable').forEach((x) => x.classList.remove('drop-cable'));
    drag(e, (ev, dx, dy) => {
      if (!raised) raise();
      group.forEach((i, k) => { i.x = start[k][0] + dx / view.z; i.y = start[k][1] + dy / view.z; place(i); const el = els.get(i.id); if (el) el.classList.add('lifting'); });
      renderWires(); placeBar();
      if (cablePid) { lit(); const c = wireAt(ev.clientX, ev.clientY), g = c && wiresSvg.querySelector('.wire[data-id="' + c.id + '"]'); if (g) g.classList.add('drop-cable'); }
    }, (ev, moved, aborted) => {
      const onWire = cablePid && moved && !aborted ? wireAt(ev.clientX, ev.clientY) : null;
      if (cablePid) lit();
      group.forEach((i) => { const el = els.get(i.id); if (el) el.classList.remove('lifting'); });
      if (onWire) {
        if (before) store.doc.items = before; // the order before raising, so Undo gives the card back where it was
        store.doc.items = store.doc.items.filter((i) => i.id !== it.id); store.sel = new Set();
        return C.setConnCable(onWire.id, cablePid, it.len, it.m);
      }
      if (aborted) { group.forEach((i, k) => { i.x = start[k][0]; i.y = start[k][1]; }); if (before) store.doc.items = before; return render(); } // second finger: put things back, pinch instead
      if (moved) {
        const from = group.map((i) => [i.x, i.y]), to = group.map((i) => [snapOf(i)(i.x), snapOf(i)(i.y)]);
        const T = HP.reducedMotion() ? 0 : 110, t0 = performance.now();
        const step = (now) => {
          const k = T ? Math.min(1, (now - t0) / T) : 1, e2 = 1 - Math.pow(1 - k, 3);
          group.forEach((i, j) => { i.x = from[j][0] + (to[j][0] - from[j][0]) * e2; i.y = from[j][1] + (to[j][1] - from[j][1]) * e2; place(i); });
          renderWires(); placeBar();
          if (k < 1) requestAnimationFrame(step); else { group.forEach((i, j) => { i.x = to[j][0]; i.y = to[j][1]; }); store.commit(); }
        };
        return requestAnimationFrame(step);
      }
      if (add && was) store.sel.delete(it.id); else if (!add) { store.sel.clear(); store.sel.add(it.id); }
      const p = it.kind === 'product' && cat.get(it.pid);
      if (p && onImg && !add) {
        const now = Date.now(), dbl = lastImgClick.id === it.id && now - lastImgClick.t < 350, flipped = lastImgClick.flipped;
        lastImgClick = { id: it.id, t: dbl ? 0 : now };
        if (dbl) { if (flipped) store.undo(); return C.inspect(it.id); }
        const n = HP.imagesOf(p, it).length;
        if (n > 1) { it.face = ((it.face || 0) + 1) % n; lastImgClick.flipped = true; return store.commit(); }
      }
      refreshSel();
    }, longMenu);
  }
  function startResize(e, it) {
    const w0 = it.w, h0 = it.h, el = els.get(it.id);
    drag(e, (ev, dx, dy) => {
      if (it.kind === 'plan') { it.w = Math.max(100, snapGrid(w0 + dx / view.z)); it.h = Math.max(100, snapGrid((it.w * h0) / w0)); } // frame on the grid, image keeps its proportions
      else { it.w = Math.max(140, snap(w0 + dx / view.z)); it.h = Math.max(60, snap(h0 + dy / view.z)); }
      el.style.width = it.w + 'px'; el.style[it.kind === 'plan' || it.kind === 'zone' ? 'height' : 'minHeight'] = it.h + 'px';
    }, (ev, moved, aborted) => { if (aborted) { it.w = w0; it.h = h0; return render(); } if (moved) { geom.delete(it.id); store.commit(); } });
  }
  function startWireDrag(e, id) {
    const c = store.doc.conns.find((x) => x.id === id); if (!c) return;
    const r = routes.get(id), s0 = c.shift || 0;
    drag(e, (ev, dx, dy) => { c.shift = Math.round((s0 + (r.axis === 'x' ? dx : dy) / view.z) / 5) * 5; renderWires(); },
      (ev, moved, aborted) => { if (aborted) { c.shift = s0; return renderWires(); } store.sel.clear(); store.selConn = id; if (moved) store.commit(); else { refreshSel(); HP.panels.cablePicker(id); } }, longMenu);
  }

  /* ---- wiring ---- */
  function tempPath(ev) {
    const f = wiring.from, a = portPos(f.item, f.side, f.key), b = toWorld(ev.clientX, ev.clientY);
    if (!a) return;
    const out = f.side === 'out', mx = out ? Math.max(a.x + 20, (a.x + b.x) / 2) : Math.min(a.x - 20, (a.x + b.x) / 2);
    tempSvg.firstChild.setAttribute('d', pathD([[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]], 7));
  }
  function startWire(e, portEl) {
    const itemEl = portEl.closest('.item'), from = { item: itemEl.dataset.id, key: portEl.dataset.key, side: portEl.dataset.side, conn: portEl.dataset.conn, color: portEl.dataset.color };
    if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); }
    wiring = { from, sticky: false };
    world.classList.add('wiring');
    world.querySelectorAll('.port').forEach((pe) => {
      const other = pe.closest('.item').dataset.id !== from.item && pe.dataset.side !== from.side;
      pe.classList.toggle('cand', other && P.compatible(from.conn, pe.dataset.conn));
      pe.classList.toggle('cand-warn', other && !P.compatible(from.conn, pe.dataset.conn));
    });
    portEl.classList.add('from');
    tempSvg.textContent = ''; tempSvg.append(svg('path', { class: 'line c-' + (from.color || from.conn) }));
    tempPath(e);
    drag(e, tempPath, (ev, moved, aborted) => {
      if (aborted) return cancelWire();
      const hit = document.elementFromPoint(ev.clientX, ev.clientY), target = hit && hit.closest('.port');
      if (target && target !== portEl) finishWire(target);
      else if (!moved) { wiring.sticky = true; vp.addEventListener('pointermove', tempPath); }
      else cancelWire();
    });
  }
  function cancelWire() {
    if (!wiring) return;
    wiring = null; vp.removeEventListener('pointermove', tempPath);
    world.classList.remove('wiring'); tempSvg.textContent = '';
    world.querySelectorAll('.port.cand,.port.cand-warn,.port.from').forEach((pe) => pe.classList.remove('cand', 'cand-warn', 'from'));
  }
  function finishWire(target) {
    const f = wiring.from, to = { item: target.closest('.item').dataset.id, key: target.dataset.key, side: target.dataset.side, conn: target.dataset.conn };
    cancelWire();
    if (to.item === f.item) return HP.toast(t('Connect to a port on another product.', 'Forbind til en port på et andet produkt.'), { kind: 'warn' });
    if (to.side === f.side) return HP.toast(t('Connect an output (right side) to an input (left side).', 'Forbind en udgang (højre side) til en indgang (venstre side).'), { kind: 'warn' });
    const a = f.side === 'out' ? f : to, b = f.side === 'out' ? to : f, d = store.doc;
    if (d.conns.some((c) => c.a.item === a.item && c.a.key === a.key && c.b.item === b.item && c.b.key === b.key)) return;
    const c = { id: HP.uid(), a: { item: a.item, key: a.key }, b: { item: b.item, key: b.key }, cable: null, shift: 0 };
    d.conns.push(c);
    if (!P.compatible(a.conn, b.conn)) HP.toast(P.CONNECTORS[P.conn(a.conn, a)] + ' → ' + P.CONNECTORS[P.conn(b.conn, b)] + ': ' + t('these connectors do not match. Check the connection.', 'disse stik passer ikke sammen. Tjek forbindelsen.'), { kind: 'warn', ms: 6000 });
    store.sel.clear(); store.selConn = null; store.commit();
  }
  C.connect = (aItem, aKey, bItem, bKey) => { store.doc.conns.push({ id: HP.uid(), a: { item: aItem, key: aKey }, b: { item: bItem, key: bKey }, cable: null, shift: 0 }); };

  /* Mouse: left-drag on empty canvas = selection box (Shift/Ctrl adds), middle- or right-drag = pan,
     right-click without moving = menu, Space + left-drag = pan. Touch: one finger pans, long-press selects (see drag()). */
  function onDown(e) {
    const mouse = e.pointerType === 'mouse';
    if (e.button === 2 && mouse) {
      if (e.target.closest('input, textarea, [contenteditable="true"]:focus')) return; // the browser's own menu (spelling, paste)
      e.preventDefault(); lastRight = Date.now(); return startRightPan(e);
    }
    if (e.button === 1 || (e.button === 0 && spaceDown)) { e.preventDefault(); return startPan(e, false); }
    if (e.button !== 0) return;
    if (mouse && e.ctrlKey && /Mac/.test(navigator.platform)) return; // Ctrl-click on a Mac is a right-click: the contextmenu event opens the menu
    const portEl = e.target.closest('.port');
    if (wiring && wiring.sticky) { e.preventDefault(); return portEl ? finishWire(portEl) : cancelWire(); }
    const ms = e.target.closest('[data-mstep]');
    if (ms) { e.preventDefault(); e.stopPropagation(); if (ms.disabled) return; const id = ms.closest('.item').dataset.id, it = store.item(id); return C.setMetres(id, ((it && it.m) || 1) + +ms.dataset.mstep); }
    const lm = e.target.closest('[data-lmenu]');
    if (lm) { e.preventDefault(); e.stopPropagation(); return C.lengthMenu(lm.closest('.item').dataset.id, lm); }
    const vm = e.target.closest('[data-vmenu]');
    if (vm) { e.preventDefault(); e.stopPropagation(); return C.colourMenu(vm.closest('.item').dataset.id, vm); }
    const sw = e.target.closest('[data-var]');
    if (sw) { e.preventDefault(); e.stopPropagation(); return C.setVariant(sw.closest('.item').dataset.id, sw.dataset.var); }
    const insp = e.target.closest('[data-inspect]');
    if (insp) { e.preventDefault(); e.stopPropagation(); return C.inspect(insp.closest('.item').dataset.id); }
    if (e.target.closest('[contenteditable="true"], button, input, #selbar, .zoomer, .cibar')) return;
    e.preventDefault(); blurActive();
    if (tool && tool.type === 'zone') { // drag a rectangle around the room
      const a = toWorld(e.clientX, e.clientY), r = vp.getBoundingClientRect();
      return drag(e, (ev) => Object.assign(marqueeEl.style, { display: 'block', left: Math.min(e.clientX, ev.clientX) - r.left + 'px', top: Math.min(e.clientY, ev.clientY) - r.top + 'px', width: Math.abs(ev.clientX - e.clientX) + 'px', height: Math.abs(ev.clientY - e.clientY) + 'px' }),
        (ev, moved, aborted) => {
          marqueeEl.style.display = 'none'; if (!tool || aborted) return;
          const b = toWorld(ev.clientX, ev.clientY); let x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), hh = Math.abs(b.y - a.y);
          if (!moved || w < 60 || hh < 40) { w = 280; hh = 180; x = a.x - 140; y = a.y - 90; }
          C.addZone(snap(x), snap(y), snap(w), snap(hh));
        });
    }
    if (tool) { // cable run / scale: click = next point, drag = pan
      const x0 = view.x, y0 = view.y;
      return drag(e, (ev, dx, dy) => { view.x = x0 + dx; view.y = y0 + dy; applyView(); }, (ev, moved) => {
        if (moved || !tool) return;
        const p = toolPoint(ev), last = tool.pts[tool.pts.length - 1];
        if (tool.type === 'run' && last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 8 / view.z) return finishRun(); // second click on the same spot = done
        tool.pts.push(p);
        if (tool.type === 'scale' && tool.pts.length === 2) return askScale();
        toolPreview(); HP.emit('stamp');
      });
    }
    if (stamp) { // click = place a mark, drag = pan
      const x0 = view.x, y0 = view.y;
      return drag(e, (ev, dx, dy) => { view.x = x0 + dx; view.y = y0 + dy; applyView(); moveGhost(); }, (ev, moved) => { if (!moved && stamp) { const w = toWorld(ev.clientX, ev.clientY); C.placeMark(stamp.key, w.x, w.y); } });
    }
    if (portEl && portEl.closest('.item')) return startWire(e, portEl);
    const w = e.target.closest('.wire, .chip'); if (w) return startWireDrag(e, w.dataset.id);
    const itemEl = e.target.closest('.item');
    if (itemEl) {
      const it = store.item(itemEl.dataset.id);
      if (it && e.target.closest('.resize') && !(it.kind === 'plan' && it.lock)) return startResize(e, it);
      if (it && !(it.kind === 'plan' && it.lock)) return startItemDrag(e, it);
      if (it && it.kind === 'plan' && e.altKey) return C.select([it.id]);
    }
    if (mouse || e.pointerType === 'pen') return startMarquee(e, null, !(e.shiftKey || e.ctrlKey || e.metaKey));
    startPan(e, true);
  }
  // right button: drag = pan, release without moving = the menu
  function startRightPan(e) {
    const x0 = view.x, y0 = view.y;
    drag(e, (ev, dx, dy) => { vp.classList.add('panning'); view.x = x0 + dx; view.y = y0 + dy; applyView(); },
      (ev, moved) => { vp.classList.remove('panning'); lastRight = Date.now(); if (!moved) onContext({ clientX: ev.clientX, clientY: ev.clientY, target: e.target, preventDefault() {}, fromPointer: true }); });
  }

  /* ================= operations ================= */
  // a product sold in several variants (colours, finishes) never goes on the canvas as the bare product: it gets the variant
  // asked for (a colour's SKU searched for, the colour picked in the Katalog, a bundle's colour), else the one whose SKU is the
  // product's own (the website's default), else the first
  const variantFor = (p, want) => {
    const vs = (p && p.vars) || [];
    if (!vs.length) return null;
    return (want && vs.find((x) => x.sku === want)) || vs.find((x) => x.sku === p.sku) || vs[0];
  };
  C.variantFor = variantFor;
  // a new card's variant: a cable length without a card of its own (item.len), else the colour searched for or picked, else the
  // default variant; cable sold by the metre gets the metres last used, else 3
  function choose(it, p, vsku) {
    if (vsku && (p.lens || []).some((l) => l.sku === vsku)) it.len = vsku;
    else { const v = variantFor(p, vsku); if (v) it.v = v.sku; }
    if (cat.isPerMetre(p)) it.m = Math.max(1, Math.round(+HP.LS.get('cableLen', 0) || 3));
  }
  C.addProduct = (pid, wx, wy, vsku) => {
    const p = cat.get(pid), d = store.doc; if (!p) return null;
    const s = cardScale(), w = cardW(p) * s, hh = (170 + Math.max((p.in || []).length, (p.out || []).length) * 17) * s;
    const it = { id: HP.uid(), kind: 'product', pid, x: snap(wx - w / 2), y: snap(wy - hh / 2), face: 0 };
    choose(it, p, vsku);
    d.items.push(it); store.sel = new Set([it.id]); store.selConn = null; store.commit();
    return it;
  };
  // several products at once (from the Katalog): side by side in the middle of the view, five to a row, one step for Undo
  C.addProducts = (list) => {
    const d = store.doc, s = cardScale(), ps = list.map((x) => ({ p: cat.get(x.id), v: x.v })).filter((x) => x.p);
    if (!ps.length) return [];
    const W = (x) => cardW(x.p) * s, H = (x) => (170 + Math.max((x.p.in || []).length, (x.p.out || []).length) * 17) * s, G = 60 * s, rows = [];
    for (let i = 0; i < ps.length; i += 5) rows.push(ps.slice(i, i + 5));
    const rw = rows.map((r) => r.reduce((a, x) => a + W(x), 0) + G * (r.length - 1)), rh = rows.map((r) => Math.max(...r.map(H)));
    const c = centerWorld(), totH = rh.reduce((a, b) => a + b, 0) + G * (rows.length - 1);
    let y = c.y - totH / 2; const ids = [];
    rows.forEach((r, ri) => { let x = c.x - rw[ri] / 2; r.forEach((e) => { const it = { id: HP.uid(), kind: 'product', pid: e.p.id, x: snap(x), y: snap(y), face: 0 }; choose(it, e.p, e.v); d.items.push(it); ids.push(it.id); x += W(e) + G; }); y += rh[ri] + G; });
    store.sel = new Set(ids); store.selConn = null; store.commit();
    return ids;
  };
  C.addProductCenter = (pid, vsku) => { if (store.doc.ci) return C.startStamp(pid); const c = centerWorld(), n = store.doc.items.length % 6; return C.addProduct(pid, c.x + n * 20, c.y + n * 20, vsku); };
  const cardAt = (cx, cy) => {
    const hit = document.elementFromPoint(cx, cy), el = hit && hit.closest('.item.k-product');
    if (!el) return null;
    const r = el.getBoundingClientRect(), ix = r.width * 0.2, iy = r.height * 0.2;
    return cx > r.left + ix && cx < r.right - ix && cy > r.top + iy && cy < r.bottom - iy ? el : null;
  };
  // a cable dragged from the product list onto a wire goes on that connection (an adapter such as a Y-splitter goes in its chain)
  // the wire under the pointer, or within about 10 px of it (a wire is thin when zoomed out); a card on top of the wire hides it,
  // except the card being dragged
  const wireAt = (cx, cy) => {
    if (cx == null) return null;
    const look = (x, y) => {
      for (const el of document.elementsFromPoint(x, y)) {
        if (el.closest('.lifting, .drag-ghost')) continue;
        const w = el.closest('.wire') || el.closest('.chip[data-id]');
        if (w) return store.doc.conns.find((c) => c.id === (w.dataset.id || w.getAttribute('data-id'))) || null;
        if (el.closest('.item')) return null;
        if (el === vp || el.closest('#viewport') !== vp) return null;
      }
      return null;
    };
    const R = [[0, 0]]; [5, 10].forEach((d) => [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]].forEach((o) => R.push(o)));
    for (const [dx, dy] of R) { const c = look(cx + dx, cy + dy); if (c) return c; }
    return null;
  };
  C.dragHover = (cx, cy, pid) => {
    const p = pid && cat.get(pid), conn = p && p.cable ? wireAt(cx, cy) : null;
    const el = cx == null || store.doc.ci || conn ? null : cardAt(cx, cy);
    world.querySelectorAll('.drop-replace').forEach((x) => x !== el && x.classList.remove('drop-replace')); if (el) el.classList.add('drop-replace');
    wiresSvg && wiresSvg.querySelectorAll('.wire.drop-cable').forEach((x) => x.classList.remove('drop-cable'));
    if (conn) { const g = wiresSvg.querySelector('.wire[data-id="' + conn.id + '"]'); if (g) g.classList.add('drop-cable'); }
  };
  // lv: a website length without a card of its own; m: metres (cable sold by the metre; else the metres last used, else 3)
  C.setConnCable = (connId, pid, lv, m) => {
    const c = store.doc.conns.find((x) => x.id === connId), p = cat.get(pid); if (!c || !p) return;
    if (P.isAdapter(p)) c.ad = pid;
    else {
      c.cable = pid; delete c.lv; delete c.m;
      if (lv && (p.lens || []).some((l) => l.sku === lv)) c.lv = lv;
      if (cat.isPerMetre(p)) c.m = m || Math.max(1, Math.round(+HP.LS.get('cableLen', 0) || 3));
    }
    store.selConn = c.id; store.sel = new Set(); store.commit();
    const is = P.chainIssues(c.cable ? cat.get(c.cable) : null, c.ad ? cat.get(c.ad) : null, connInfo(c).a, connInfo(c).b);
    HP.toast((P.isAdapter(p) ? t('Adapter added to the connection', 'Adapter sat på forbindelsen') : t('Cable put on the connection', 'Kablet er sat på forbindelsen')) + (is.length ? ' · ⚠ ' + t(is[0].en, is[0].da) : ''),
      { action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  C.dropProduct = (pid, cx, cy, vsku) => {
    const r = vp.getBoundingClientRect(), conn = (cat.get(pid) || {}).cable ? wireAt(cx, cy) : null, el = conn ? null : cardAt(cx, cy);
    C.dragHover(null);
    if (conn) return C.setConnCable(conn.id, pid, vsku);
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
    if (store.doc.ci) { const w = toWorld(cx, cy); return C.placeMark(pid, w.x, w.y); }
    if (el) return C.replaceItem(el.dataset.id, pid);
    const w = toWorld(cx, cy); C.addProduct(pid, w.x, w.y, vsku);
  };
  /* a system (website bundle) from the sidebar: one card per part, in columns from the sources to the speakers, wired by
     P.autoWire (no cables: the seller picks them). Every card carries sy = the bundle's SKU, so the price list can price it as
     the bundle. Parts that are not drawn and wired (stands, a backbox) go in a row underneath. */
  C.addSystem = (sku, cx, cy) => {
    HP.stat('System tilføjet');
    const b = cat.system(sku), d = store.doc; if (!b) return null;
    const r = vp.getBoundingClientRect();
    if (cx != null && (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom)) return null;
    const devs = [];
    b.parts.forEach((x) => { const p = cat.get(x.id); if (p) for (let i = 0; i < x.qty; i++) devs.push({ uid: HP.uid(), p, v: x.v }); });
    if (!devs.length) return null;
    const wires = HP.ports.autoWire(devs.filter((x) => x.p.scope !== 'pricelist'));
    // column = longest chain of wires leading into the card (sources 0, amplifier 1, speakers 2…)
    const lvl = new Map(devs.map((x) => [x.uid, 0])), wired = new Set();
    wires.forEach((w) => { wired.add(w.a.uid); wired.add(w.b.uid); });
    for (let k = 0; k < devs.length; k++) wires.forEach((w) => lvl.set(w.b.uid, Math.max(lvl.get(w.b.uid), lvl.get(w.a.uid) + 1)));
    const sc = cardScale(), W = (x) => cardW(x.p) * sc, H = (x) => (170 + Math.max((x.p.in || []).length, (x.p.out || []).length) * 17) * sc, GX = 130 * sc, GY = 50 * sc;
    const cols = [];
    devs.filter((x) => wired.has(x.uid)).forEach((x) => (cols[lvl.get(x.uid)] = cols[lvl.get(x.uid)] || []).push(x));
    // within a column, the order of the ports they are wired to (SUB, FRONT, CENTER, SURROUND as on the receiver), so wires do not cross
    const byUid = new Map(devs.map((x) => [x.uid, x]));
    const portIdx = (uid, key, side) => { const l = (byUid.get(uid).p[side] || []); const i = l.findIndex((pt) => pt.key === key); return i < 0 ? 99 : i; };
    const rank = (x) => { const inc = wires.filter((w) => w.b.uid === x.uid), outg = wires.filter((w) => w.a.uid === x.uid);
      return inc.length ? Math.min(...inc.map((w) => portIdx(w.a.uid, w.a.key, 'out'))) : outg.length ? Math.min(...outg.map((w) => portIdx(w.b.uid, w.b.key, 'in'))) : 99; };
    cols.forEach((col) => col.sort((a, b) => rank(a) - rank(b)));
    const rest = devs.filter((x) => !wired.has(x.uid));
    const place = new Map();
    let x0 = 0, maxH = 0;
    cols.forEach((col) => { const cw = Math.max(...col.map(W)), ch = col.reduce((a, x) => a + H(x), 0) + GY * (col.length - 1); maxH = Math.max(maxH, ch); col.forEach((x) => place.set(x.uid, { x: x0 + (cw - W(x)) / 2 })); x0 += cw + GX; });
    cols.forEach((col) => { const ch = col.reduce((a, x) => a + H(x), 0) + GY * (col.length - 1); let y = (maxH - ch) / 2; col.forEach((x) => { place.get(x.uid).y = y; y += H(x) + GY; }); });
    const totW = Math.max(x0 - GX, 0);
    let rx = 0; const ry = cols.length ? maxH + GY * 2 : 0, rowH = Math.max(0, ...rest.map(H));
    rest.forEach((x) => { place.set(x.uid, { x: rx, y: ry }); rx += W(x) + GY; });
    const fullW = Math.max(totW, rx - GY), fullH = (cols.length ? maxH : 0) + (rest.length ? (cols.length ? GY * 2 : 0) + rowH : 0);
    const at = cx == null ? centerWorld() : toWorld(cx, cy), ox = at.x - fullW / 2, oy = at.y - fullH / 2;
    const ids = new Map();
    devs.forEach((x) => {
      const pl = place.get(x.uid), it = { id: HP.uid(), kind: 'product', pid: x.p.id, x: snap(ox + pl.x), y: snap(oy + pl.y), face: 0, sy: b.sku };
      { const v = variantFor(x.p, x.v); if (v) it.v = v.sku; }
      ids.set(x.uid, it.id); d.items.push(it);
    });
    wires.forEach((w) => d.conns.push({ id: HP.uid(), a: { item: ids.get(w.a.uid), key: w.a.key }, b: { item: ids.get(w.b.uid), key: w.b.key }, cable: null, shift: 0 }));
    store.sel = new Set(ids.values()); store.selConn = null; store.commit();
    const dia = devs.filter((x) => x.p.scope !== 'pricelist'), lone = dia.filter((x) => !wired.has(x.uid)).length;
    HP.toast(cat.systemName(b) + ': ' + devs.length + ' ' + t('products', 'produkter') + ', ' + wires.length + ' ' + t(wires.length === 1 ? 'connection' : 'connections', wires.length === 1 ? 'forbindelse' : 'forbindelser')
      + (dia.length > 1 && lone ? ' · ' + (wires.length ? t(lone + ' not wired (wireless, or no matching port)', lone + ' uden ledning (trådløs eller ingen passende port)') : t('wireless or not wired', 'trådløst eller uden ledninger')) : '')
      + '. ' + t('Pick cables on the wires.', 'Vælg kabler på forbindelserne.'), { kind: 'ok', ms: 6000 });
    return ids;
  };
  C.addText = (cx, cy) => {
    const c = cx != null ? toWorld(cx, cy) : C.pointerWorld() || centerWorld(), it = { id: HP.uid(), kind: 'text', x: snap(c.x - 120), y: snap(c.y - 50), w: 240, h: 90, title: '', body: '' };
    store.doc.items.push(it); store.sel = new Set([it.id]); store.commit();
    const el = els.get(it.id); if (el) el.querySelector('.note-title').focus();
  };
  // show/hide the title or the paragraph of a text box (never both); hidden text is kept and comes back when switched on
  C.toggleNotePart = (id, part) => {
    const it = store.item(id); if (!it || it.kind !== 'text') return;
    const key = part === 'title' ? 'noTitle' : 'noBody', other = part === 'title' ? 'noBody' : 'noTitle';
    if (!it[key] && it[other]) return;
    if (it[key]) delete it[key]; else it[key] = true;
    store.commit();
    const el = els.get(id), f = el && el.querySelector(part === 'title' ? '.note-title' : '.note-body'); if (f) f.focus();
  };
  C.hasPrices = () => store.doc.items.some((i) => i.kind === 'prices');
  C.togglePrices = () => {
    const d = store.doc;
    if (C.hasPrices()) d.items = d.items.filter((i) => i.kind !== 'prices');
    else d.items.push({ id: HP.uid(), kind: 'prices', x: snap(pageSize().w - 330), y: snap(below('legend', pageSize().w - 330, 300)) });
    store.commit();
  };
  C.deleteSelection = () => {
    const d = store.doc;
    if (store.selConn) { d.conns = d.conns.filter((c) => c.id !== store.selConn); store.selConn = null; return store.commit(); }
    if (!store.sel.size) return;
    d.items = d.items.filter((i) => !store.sel.has(i.id));
    d.conns = d.conns.filter((c) => !store.sel.has(c.a.item) && !store.sel.has(c.b.item));
    normMarks(); store.sel.clear(); store.commit();
  };
  C.duplicateSelection = () => {
    const d = store.doc, map = {}, src = d.items.filter((i) => store.sel.has(i.id) && i.kind !== 'prices' && i.kind !== 'plan' && i.kind !== 'legend');
    if (!src.length) return;
    src.forEach((i) => { const n = JSON.parse(JSON.stringify(i)); n.id = map[i.id] = HP.uid(); n.x += 30; n.y += 30; d.items.push(n); });
    d.conns.slice().forEach((c) => { if (map[c.a.item] && map[c.b.item]) d.conns.push(Object.assign({}, c, { id: HP.uid(), a: { item: map[c.a.item], key: c.a.key }, b: { item: map[c.b.item], key: c.b.key } })); });
    store.sel = new Set(Object.values(map)); store.commit();
  };
  C.replaceItem = (id, pid) => {
    const d = store.doc, it = store.item(id);
    if (it.kind === 'mark') return C.replaceMarks(it.k, pid);
    const oldP = cat.get(it.pid) || {}, newP = cat.get(pid);
    if (!newP || it.pid === pid) return;
    const used = { in: [], out: [] };
    d.conns.forEach((c) => { if (c.a.item === id) used.out.push(c.a.key); if (c.b.item === id) used.in.push(c.b.key); });
    const mo = P.mapPorts(oldP.out || [], newP.out || [], used.out), mi = P.mapPorts(oldP.in || [], newP.in || [], used.in);
    let kept = 0, lost = 0;
    d.conns = d.conns.filter((c) => {
      if (c.a.item === id) { if (!mo[c.a.key]) { lost++; return false; } c.a.key = mo[c.a.key]; kept++; }
      if (c.b.item === id) { if (!mi[c.b.key]) { lost++; return false; } c.b.key = mi[c.b.key]; kept++; }
      return true;
    });
    it.x = snap(it.x + (measure(it).w - cardW(newP) * cardScale()) / 2);
    it.pid = pid; it.face = 0; delete it.v; delete it.len; { const v = variantFor(cat.get(pid)); if (v) it.v = v.sku; }
    if (cat.isPerMetre(newP)) it.m = it.m || Math.max(1, Math.round(+HP.LS.get('cableLen', 0) || 3)); else delete it.m; store.sel = new Set([id]); store.selConn = null; store.commit();
    const msg = (oldP.name || '?') + ' → ' + newP.name + '. ' + (kept + lost === 0 ? '' : lost
      ? t(kept + ' connection(s) kept, ' + lost + ' removed (no matching port).', kept + ' forbindelse(r) bevaret, ' + lost + ' fjernet (ingen matchende port).')
      : t('All ' + kept + ' connection(s) kept.', 'Alle ' + kept + ' forbindelse(r) bevaret.'));
    HP.toast(msg, { kind: lost ? 'warn' : 'ok', ms: 7000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  /* ---- marks ---- */
  const LEGEND_W = 340;
  // beside the floor plan when there is room (new plans leave a column free on landscape pages), otherwise top-left
  const below = (kind, x, w) => { const o = store.doc.items.find((i) => i.kind === kind); return o && o.x < x + w && o.x + measure(o).w > x && o.y < 400 ? o.y + measure(o).h + 20 : 30; }; // do not land on the other list
  const legendSpot = () => { const s = pageSize(), plan = store.doc.items.find((i) => i.kind === 'plan'), x = !plan || plan.x + plan.w <= s.w - LEGEND_W - 40 ? s.w - LEGEND_W - 30 : 30; return { x, y: snap(below('prices', x, LEGEND_W)) }; };
  C.placeMark = (key, wx, wy) => {
    const d = store.doc, S = d.ms || 34, first = !d.items.some((i) => i.kind === 'mark');
    if (key[0] !== '@' && !cat.get(key)) return null;
    const it = { id: HP.uid(), kind: 'mark', k: key, x: snap5(wx - S / 2), y: snap5(wy - S / 2) };
    d.items.push(it);
    if (first && !C.hasLegend()) d.items.push(Object.assign({ id: HP.uid(), kind: 'legend' }, legendSpot())); // the first mark brings the legend along
    normMarks(); store.sel.clear(); store.selConn = null; store.commit();
    return it;
  };
  // every mark of one product changes to another product and keeps its letter
  C.replaceMarks = (key, pid) => {
    const d = store.doc, newP = cat.get(pid), oldP = cat.get(key);
    if (!newP || key === pid) return;
    d.mk = markKeys().map((k) => (k === key ? pid : k)).filter((k, i, a) => a.indexOf(k) === i);
    let n = 0; d.items.forEach((i) => { if (i.kind === 'mark' && i.k === key) { i.k = pid; n++; } });
    normMarks(); store.commit();
    HP.toast((oldP ? oldP.name : '?') + ' → ' + newP.name + ' (' + n + ' ' + t('marks', 'mærker') + ')', { kind: 'ok', ms: 7000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  C.selectMarks = (key) => C.select(store.doc.items.filter((i) => i.kind === 'mark' && i.k === key).map((i) => i.id));
  C.hasLegend = () => store.doc.items.some((i) => i.kind === 'legend');
  C.toggleLegend = () => {
    const d = store.doc;
    if (C.hasLegend()) d.items = d.items.filter((i) => i.kind !== 'legend'); else d.items.push(Object.assign({ id: HP.uid(), kind: 'legend' }, legendSpot()));
    store.commit();
  };
  C.setMarkSize = (px, commit) => { store.doc.ms = clamp(px, 18, 70); geom.clear(); commit ? store.commit() : render(); moveGhost(); };
  // stamp mode: the chosen product or symbol follows the pointer; every click on the canvas places one
  function moveGhost() {
    if (!ghost) return;
    const r = vp.getBoundingClientRect(), inside = lastPtr && lastPtr.x > r.left && lastPtr.x < r.right && lastPtr.y > r.top && lastPtr.y < r.bottom;
    ghost.hidden = !inside || lastPtr.touch; if (ghost.hidden) return;
    const S = (store.doc.ms || 34) * view.z;
    Object.assign(ghost.style, { width: S + 'px', height: S + 'px', left: lastPtr.x - r.left + 'px', top: lastPtr.y - r.top + 'px' });
  }
  /* ---- tools: room, cable run, scale ---- */
  C.tool = () => tool;
  C.startTool = (type) => {
    const same = tool && tool.type === type;
    C.stopTool(true); C.stopStamp(true);
    if (same) return HP.emit('stamp');
    if (wiring) cancelWire();
    tool = { type, pts: [] }; vp.classList.add('stamping');
    if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); }
    HP.emit('stamp');
  };
  C.stopTool = (quiet) => { if (!tool) return; tool = null; toolSvg.textContent = ''; marqueeEl.style.display = 'none'; vp.classList.remove('stamping'); if (!quiet) HP.emit('stamp'); };
  // points snap to the centre of a mark, so a run starts and ends exactly on a speaker or the rack
  function toolPoint(ev) {
    const w = toWorld(ev.clientX, ev.clientY), S = (store.doc.ms || 34) / 2;
    const m = store.doc.items.find((i) => i.kind === 'mark' && Math.hypot(i.x + S - w.x, i.y + S - w.y) <= S);
    return m ? [m.x + S, m.y + S] : [Math.round(w.x), Math.round(w.y)];
  }
  function toolPreview() {
    if (!toolSvg) return;
    toolSvg.textContent = '';
    if (!tool || !tool.pts.length) return;
    const pts = tool.pts.slice(), r = vp.getBoundingClientRect();
    if (lastPtr && lastPtr.x > r.left && lastPtr.x < r.right && lastPtr.y > r.top && lastPtr.y < r.bottom) { const w = toWorld(lastPtr.x, lastPtr.y); pts.push([w.x, w.y]); }
    toolSvg.append(svg('path', { class: 'tline', d: 'M' + pts.map((p) => p.join(',')).join(' L') }));
    tool.pts.forEach((p) => toolSvg.append(svg('circle', { class: 'tdot', cx: p[0], cy: p[1], r: 4 })));
    if (tool.type === 'run' && store.doc.sc && pts.length > 1) {
      const len = runPx({ pts }) / store.doc.sc, l = pts[pts.length - 1], tx = svg('text', { class: 'ttext', x: l[0] + 12, y: l[1] - 10 }); tx.textContent = fmtM(len); toolSvg.append(tx);
    }
  }
  function finishRun() {
    if (!tool || tool.type !== 'run') return;
    const pts = tool.pts; tool.pts = []; toolPreview(); HP.emit('stamp');
    if (pts.length < 2) return;
    const x = Math.min(...pts.map((p) => p[0])), y = Math.min(...pts.map((p) => p[1]));
    const it = { id: HP.uid(), kind: 'run', x, y, cable: lastCable && cat.get(lastCable) ? lastCable : null, pts: pts.map((p) => [p[0] - x, p[1] - y]) };
    store.doc.items.push(it);
    if (!C.hasLegend() && store.doc.items.some((i) => i.kind === 'mark')) store.doc.items.push(Object.assign({ id: HP.uid(), kind: 'legend' }, legendSpot()));
    store.commit(); // the tool stays on for the next run
  }
  function askScale() {
    const px = Math.hypot(tool.pts[1][0] - tool.pts[0][0], tool.pts[1][1] - tool.pts[0][1]);
    toolPreview();
    const inp = h('input', { type: 'text', inputMode: 'decimal', placeholder: t('e.g. 4,2', 'f.eks. 4,2'), autofocus: true, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(); } } });
    const ok = () => {
      const m = parseFloat(inp.value.replace(',', '.'));
      if (!(m > 0) || px < 5) return inp.select();
      store.doc.sc = Math.round((px / m) * 1000) / 1000; close(); store.commit();
      HP.toast(t('Scale set. Cable runs now show their length.', 'Målestokken er sat. Kabeltræk viser nu deres længde.'), { kind: 'ok' });
    };
    const close = HP.modal({ title: t('How long is that line?', 'Hvor lang er den linje?'), onClose: () => C.stopTool(),
      body: [h('p.muted', null, t('Type the real length of the line you just marked, in metres.', 'Skriv den rigtige længde af den linje, du lige har markeret, i meter.')), h('label.field', null, h('span', null, t('Length in metres', 'Længde i meter')), inp)],
      foot: [h('button.btn.primary', { onclick: ok }, t('Set scale', 'Sæt målestok'))] });
  }
  C.finishRun = () => finishRun();
  C.addZone = (x, y, w, hh) => {
    const it = { id: HP.uid(), kind: 'zone', x, y, w, h: hh, name: '' };
    store.doc.items.push(it); C.stopTool(); store.sel = new Set([it.id]); store.selConn = null; store.commit();
    const el = els.get(it.id), nm = el && el.querySelector('.zone-name'); if (nm) nm.focus();
    return it;
  };
  C.setRunCable = (id, pid) => { const it = store.item(id); if (!it) return; it.cable = pid || null; lastCable = pid || null; store.commit(); };
  C.stamp = () => stamp;
  C.startStamp = (key) => {
    const same = stamp && stamp.key === key;
    C.stopStamp(true); C.stopTool(true);
    if (same || (key[0] !== '@' && !cat.get(key))) return HP.emit('stamp');
    if (wiring) cancelWire();
    stamp = { key }; ghost = h('.mark.ghost', { html: markHtml(key) }); overlay.append(ghost); vp.classList.add('stamping');
    if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); }
    moveGhost(); HP.emit('stamp');
  };
  C.stopStamp = (quiet) => { if (!stamp) return; stamp = null; ghost.remove(); ghost = null; vp.classList.remove('stamping'); if (!quiet) HP.emit('stamp'); };

  // leave products or marks out of the price list (they stay on the drawing); acts on the whole selection
  const priceable = (i) => i.kind === 'product' || (i.kind === 'mark' && i.k[0] !== '@');
  C.togglePriced = () => {
    const its = [...store.sel].map((id) => store.item(id)).filter((i) => i && priceable(i));
    if (!its.length) return;
    const leaveOut = !its[0].np;
    its.forEach((i) => { if (leaveOut) i.np = 1; else delete i.np; });
    store.commit();
    HP.toast(leaveOut ? t('Left out of the price list', 'Udeladt af prislisten') + (its.length > 1 ? ' (' + its.length + ')' : '') : t('Counted in the price list again', 'Tælles med i prislisten igen'), { kind: 'ok', action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  C.selectAll = () => C.select(store.doc.items.filter((i) => i.kind !== 'plan').map((i) => i.id));
  C.nudge = (dx, dy) => { const g = [...store.sel].map(store.item).filter(Boolean); if (!g.length) return; g.forEach((i) => { i.x += dx; i.y += dy; }); store.commit(); };

  /* ---- clipboard, layers, reset, floor plan ---- */
  C.pointerWorld = () => { if (!lastPtr) return null; const r = vp.getBoundingClientRect(); return lastPtr.x > r.left && lastPtr.x < r.right && lastPtr.y > r.top && lastPtr.y < r.bottom ? toWorld(lastPtr.x, lastPtr.y) : null; };
  C.copy = () => {
    if (!store.sel.size) return false;
    const snapC = C.capture(); if (!snapC) return false;
    HP.LS.set('clip', snapC); HP.toast(t('Copied. Paste with Ctrl+V, also in another proposal.', 'Kopieret. Indsæt med Ctrl+V, også i et andet tilbud.'), { ms: 2500 }); HP.emit('clip');
    return true;
  };
  C.canPaste = () => !!HP.LS.get('clip', null);
  C.paste = (cx, cy) => {
    const clip = HP.LS.get('clip', null); if (!clip) return;
    if (cx == null && lastPtr) { cx = lastPtr.x; cy = lastPtr.y; }
    const r = vp.getBoundingClientRect();
    if (cx == null || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) { cx = r.left + r.width / 2 + 30; cy = r.top + r.height / 2 + 30; }
    C.insertTemplate(Object.assign(clip, { paste: true }), cx, cy); // paste: under the pointer, no settings
  };
  C.order = (front) => {
    const d = store.doc, sel = d.items.filter((i) => store.sel.has(i.id) && i.kind !== 'plan'); if (!sel.length) return;
    const rest = d.items.filter((i) => !sel.includes(i));
    d.items = front ? rest.concat(sel) : rest.filter((i) => i.kind === 'plan').concat(sel, rest.filter((i) => i.kind !== 'plan'));
    store.commit();
  };
  C.clearCanvas = () => {
    const d = store.doc;
    if (!d.items.length && !d.name) return;
    store.load(Object.assign(store.blank(), { orient: d.orient, cardScale: d.cardScale }));
    HP.toast(t('Canvas cleared.', 'Lærredet er ryddet.'), { ms: 8000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  C.hasPlan = () => store.doc.items.some((i) => i.kind === 'plan');
  C.removePlan = () => {
    if (!C.hasPlan()) return;
    store.doc.items = store.doc.items.filter((i) => i.kind !== 'plan'); store.sel.clear(); store.commit();
    HP.toast(t('Floor plan removed.', 'Plantegningen er fjernet.'), { action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  C.setCardScale = (s, commit) => { store.doc.cardScale = Math.round(clamp(s, 0.4, 1.6) * 100) / 100; geom.clear(); if (commit) store.commit(); else render(); };
  C.flip = (id) => { const it = store.item(id), p = it && cat.get(it.pid), n = HP.imagesOf(p, it).length; if (p && n > 1) { it.face = ((it.face || 0) + 1) % n; store.commit(); } };
  C.setVariant = (id, sku) => { const it = store.item(id); if (!it) return; if (sku) it.v = sku; else delete it.v; it.face = 0; store.commit(); };
  // how a card shows its variants: 'dots' when every variant is its own colour; 'pill-colour' when they are colours but some look
  // alike (Ask and Valnød are both wood); 'pill' when they are not colours at all (TV sizes, amplifier models, cable lengths)
  C.varStyle = (p) => {
    const vs = (p && p.vars) || [], cols = new Set(vs.map((x) => HP.site.swatch(x)));
    if (cols.size <= 1 || vs.some((x) => /\d/.test(x.label))) return 'pill';
    return cols.size === vs.length ? 'dots' : 'pill-colour';
  };
  C.colourMenu = (id, anchor, x, y) => {
    const it = store.item(id), p = it && cat.get(it.pid); if (!p || !(p.vars || []).length) return;
    const r = anchor ? anchor.getBoundingClientRect() : null;
    HP.menu(r ? r.left : x, r ? r.bottom + 4 : y, [{ head: t('Variant', 'Variant') }].concat(p.vars.map((v) => ({ label: v.label + '  ·  ' + HP.money(v.price) + (v.was ? '  (' + t('was ', 'før ') + HP.money(v.was) + ')' : ''), swatch: C.varStyle(p) === 'pill' ? null : HP.site.swatch(v), on: it.v === v.sku, fn: () => C.setVariant(id, v.sku) }))));
  };
  C.inspect = (id) => { const it = store.item(id); if (it && it.kind === 'product') HP.panels.viewer(it.pid, it.face || 0, (face) => { if ((it.face || 0) !== face) { it.face = face; store.commit(); } }, it); };

  /* ---- right-click menu ---- */
  function onContext(e) {
    e.preventDefault();
    if (!e.fromPointer && !e.fromTouch && Date.now() - lastRight < 1500) return; // the browser's contextmenu after a right press: already handled on release
    if (!e.fromTouch && Date.now() - lastTouch < 1200) return; // Android fires its own contextmenu on long-press: the touch handler already opened ours
    if (tool) { if (tool.type === 'run' && tool.pts.length > 1) finishRun(); return C.stopTool(); } // right-click ends the tool (and finishes the run being drawn)
    if (stamp) return C.stopStamp(); // right-click ends placing
    if (wiring) cancelWire();
    const itemEl = e.target.closest('.item'), wireEl = e.target.closest('.wire, .chip'), d = store.doc, admin = HP.isAdmin();
    if (wireEl) { store.sel.clear(); store.selConn = wireEl.dataset.id; refreshSel(); }
    else if (itemEl && !store.sel.has(itemEl.dataset.id)) { store.sel = new Set([itemEl.dataset.id]); store.selConn = null; refreshSel(); }
    else if (!itemEl && !e.target.closest('.overlay')) { if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); } }
    menuAt(e.clientX, e.clientY, false);
  }
  // compact = what the selection needs; "Flere…" (or right-clicking empty canvas) shows everything
  function menuAt(x, y, full) {
    const d = store.doc, admin = HP.isAdmin();
    const ids = [...store.sel], one = ids.length === 1 && store.item(ids[0]), p = one && one.kind === 'product' && cat.get(one.pid);
    const M = [], sku = p ? C.skuOf(one) : '';
    full = full || !(ids.length || store.selConn);
    const add = (label, key, ic, fn, opts) => M.push(Object.assign({ label, key, icon: ic, fn }, opts));
    if (store.selConn) {
      const c = d.conns.find((q) => q.id === store.selConn);
      M.push({ head: t('Connection', 'Forbindelse') });
      add(t('Choose cable…', 'Vælg kabel…'), 'Enter', 'cable', () => HP.panels.cablePicker(store.selConn));
      if (c && (c.cable || c.ad)) add(t('Remove cable', 'Fjern kabel'), '', 'x', () => { c.cable = null; delete c.lv; delete c.m; delete c.ad; store.commit(); });
      add(t('Straighten wire', 'Ret ledningen ud'), '', 'fit', () => { c.shift = 0; store.commit(); }, { disabled: !c || !c.shift });
      add(t('Delete connection', 'Slet forbindelse'), 'Del', 'trash', C.deleteSelection, { danger: true });
      M.push('sep');
    } else if (ids.length) {
      M.push({ head: one ? (p ? p.brand + ' ' + p.name : one.kind === 'plan' ? t('Floor plan', 'Plantegning') : one.kind === 'prices' ? t('Price list', 'Prisliste') : one.kind === 'mark' ? markTitle(one.k) : one.kind === 'legend' ? t('Legend', 'Signaturforklaring') : one.kind === 'zone' ? t('Room', 'Rum') + (one.name ? ': ' + one.name : '') : one.kind === 'run' ? t('Cable run', 'Kabeltræk') + (d.sc ? ' · ' + fmtM(runPx(one) / d.sc) : '') : t('Text', 'Tekst')) : ids.length + ' ' + t('items selected', 'elementer markeret') });
      if (p) {
        add(t('Replace…', 'Udskift…'), 'Alt+R', 'swap', () => HP.panels.replacePicker(one.id));
        if ((p.vars || []).length > 1) add(t('Variant…', 'Variant…') + (HP.variantOf(p, one) ? ' (' + HP.variantOf(p, one).label + ')' : ''), 'Alt+C', 'layers', () => C.colourMenu(one.id, null, x, y));
        if (full && HP.imagesOf(p, one).length > 1) add(t('Flip front/back', 'Vend for/bag'), 'Alt+B', 'flip', () => C.flip(one.id));
        if (full && HP.imagesOf(p, one).length) add(t('Inspect image', 'Se billedet nærmere'), 'Alt+I', 'search', () => C.inspect(one.id));
        add(t('Related products…', 'Relaterede produkter…'), '', 'plus', () => HP.complete.open({ pid: p.id }), { accent: true });
        if (sku) add(t('Copy item no.', 'Kopiér varenr.'), '', 'copy', () => HP.copyText(sku, t('Item number copied: ', 'Varenr. kopieret: ') + sku), { note: sku });
        if (full && admin) add(t('Edit product…', 'Redigér produkt…'), '', 'edit', () => HP.editor.open(p.id));
      }
      if (one && one.kind === 'mark' && one.k[0] !== '@') {
        add(t('Replace all ', 'Udskift alle ') + letter(markIndex(one.k)) + '…', 'R', 'swap', () => HP.panels.replacePicker(one.id));
        add(t('Select all ', 'Markér alle ') + letter(markIndex(one.k)), '', 'layers', () => C.selectMarks(one.k));
        add(t('Place more of these', 'Placér flere af disse'), '', 'plus', () => C.startStamp(one.k));
      }
      if (one && one.kind === 'run') add(t('Choose cable…', 'Vælg kabel…'), '', 'cable', () => HP.panels.runCablePicker(one.id));
      if (one && one.kind === 'text') {
        add(t('Show title', 'Vis titel'), '', 'text', () => C.toggleNotePart(one.id, 'title'), { on: !one.noTitle, disabled: !!one.noBody });
        add(t('Show paragraph', 'Vis afsnit'), '', 'text', () => C.toggleNotePart(one.id, 'body'), { on: !one.noBody, disabled: !!one.noTitle });
      }
      if (one && one.kind === 'plan') {
        add(one.lock ? t('Unlock to move/resize', 'Lås op for at flytte/skalere') : t('Lock', 'Lås'), 'L', one.lock ? 'move' : 'lock', () => { one.lock = !one.lock; store.commit(); });
        add(t('Remove floor plan', 'Fjern plantegning'), '', 'trash', C.removePlan, { danger: true });
      } else {
        M.push('sep');
        if (full) add(t('Copy', 'Kopiér'), 'Ctrl+C', 'copy', C.copy);
        { const pr = [...store.sel].map((id) => store.item(id)).filter((x) => x && priceable(x));
          if (full && pr.length) add(t('Count in price list', 'Tæl med i prislisten'), '', 'tag', C.togglePriced, { on: !pr[0].np }); }
        add(t('Duplicate', 'Dublér'), 'Ctrl+D', 'copy', C.duplicateSelection, { disabled: one && (one.kind === 'prices' || one.kind === 'legend') });
        if (full) add(t('Bring to front', 'Placér forrest'), ']', 'up', () => C.order(true));
        if (full) add(t('Send to back', 'Placér bagerst'), '[', 'down', () => C.order(false));
        if (full && admin && ids.some((id) => store.item(id).kind === 'product')) add(t('Save as Shortcut…', 'Gem som genvej…'), '', 'bolt', () => HP.editor.saveShortcut());
        add(t('Delete', 'Slet'), 'Del', 'trash', C.deleteSelection, { danger: true });
      }
      M.push('sep');
    }
    if (!full) { add(t('More…', 'Flere…'), '', 'more', () => menuAt(x, y, true)); return HP.menu(x, y, M); }
    add(t('Undo', 'Fortryd'), 'Ctrl+Z', 'undo', store.undo, { disabled: !store.canUndo() });
    add(t('Redo', 'Annuller fortryd'), 'Ctrl+Y', 'redo', store.redo, { disabled: !store.canRedo() });
    add(t('Paste', 'Indsæt'), 'Ctrl+V', 'page', () => C.paste(x, y), { disabled: !C.canPaste() });
    M.push('sep');
    add(t('Add text here', 'Tilføj tekst her'), 'Alt+T', 'text', () => C.addText(x, y));
    add(C.hasPrices() ? t('Hide price list', 'Skjul prisliste') : t('Show price list', 'Vis prisliste'), 'F3', 'tag', C.togglePrices);
    if (C.hasPlan()) add(t('Remove floor plan', 'Fjern plantegning'), '', 'plan', C.removePlan);
    if (!p && store.doc.items.some((x) => x.kind === 'product')) add(t('Related products…', 'Relaterede produkter…'), '', 'plus', () => HP.complete.open(), { accent: true });
    add(t('Select all', 'Markér alt'), 'Ctrl+A', 'layers', C.selectAll);
    add(t('Fit to window', 'Tilpas til vindue'), 'Shift+1', 'fit', C.fit);
    M.push({ el: HP.panels.scaleStepper() });
    M.push('sep');
    add(t('Save project…', 'Gem projekt…'), 'Ctrl+S', 'folder', HP.panels.projects);
    add(t('Share link…', 'Del link…'), 'Ctrl+Shift+S', 'link', HP.panels.share);
    add(t('Print / PDF', 'Print / PDF'), 'Ctrl+P', 'print', () => HP.cover.dialog());
    add(t('Clear canvas', 'Ryd lærredet'), '', 'trash', C.clearCanvas, { danger: true, disabled: !d.items.length });
    HP.menu(x, y, M);
  }

  /* ---- templates (Shortcuts) ---- */
  // everything on the canvas except the floor plan image (customer-specific and large), plus the drawing's settings
  const SHORTCUT_KINDS = ['product', 'text', 'mark', 'zone', 'run', 'legend', 'prices'];
  const extent = (i) => [i.x + (i.w || (i.kind === 'run' ? Math.max(0, ...i.pts.map((p) => p[0])) : i.kind === 'mark' ? store.doc.ms || 34 : 220)),
    i.y + (i.h || (i.kind === 'run' ? Math.max(0, ...i.pts.map((p) => p[1])) : i.kind === 'mark' ? store.doc.ms || 34 : 200))];
  C.capture = () => {
    const d = store.doc, pick = store.sel.size ? d.items.filter((i) => store.sel.has(i.id)) : d.items;
    const items = pick.filter((i) => SHORTCUT_KINDS.includes(i.kind)).map((i) => JSON.parse(JSON.stringify(i)));
    if (!items.length) return null;
    const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y)), ids = new Set(items.map((i) => i.id));
    items.forEach((i) => { i.x -= x0; i.y -= y0; });
    const keys = new Set(items.filter((i) => i.kind === 'mark').map((i) => i.k));
    const s = { x0, y0, cardScale: d.cardScale || 1, ci: !!d.ci, ms: d.ms || 34, sc: d.sc || 0, orient: d.orient || 'landscape', pages: d.pages || 1, mk: (d.mk || []).filter((k) => keys.has(k)) };
    return { items, conns: d.conns.filter((c) => ids.has(c.a.item) && ids.has(c.b.item)).map((c) => JSON.parse(JSON.stringify(c))), s };
  };
  C.insertTemplate = (tpl, cx, cy) => {
    const d = store.doc, map = {}, S = tpl.s || {};
    // "empty" = nothing drawn yet; a floor plan, legend or price list on its own does not count
    const hasPlan = d.items.some((i) => i.kind === 'plan'), empty = !d.items.some((i) => !['plan', 'legend', 'prices'].includes(i.kind));
    // an empty canvas takes the Shortcut's settings; a drawing in progress keeps its own
    if (empty && tpl.s && !tpl.paste) {
      d.cardScale = S.cardScale || 1; d.ms = S.ms || 34; d.ci = !!S.ci || hasPlan;
      if (!d.sc && S.sc) d.sc = S.sc;                                   // the scale belongs to the floor plan: never overwrite one already set
      if (!hasPlan) { d.orient = S.orient || d.orient; d.pages = Math.max(d.pages || 1, S.pages || 1); }
      geom.clear();
    }
    const gone = (i) => (i.kind === 'product' && !cat.get(i.pid)) || (i.kind === 'mark' && i.k[0] !== '@' && !cat.get(i.k))
      || ((i.kind === 'legend' || i.kind === 'prices') && d.items.some((x) => x.kind === i.kind)); // only one legend and one price list
    const missing = tpl.items.filter((i) => (i.kind === 'product' && !cat.get(i.pid)) || (i.kind === 'mark' && i.k[0] !== '@' && !cat.get(i.k))).length;
    const ext = tpl.items.map(extent), w = Math.max(...ext.map((e) => e[0])), hh = Math.max(...ext.map((e) => e[1]));
    // on an empty canvas a Shortcut goes back exactly where it was on the page (click or drop); otherwise under the pointer / in the middle
    const exact = empty && S.x0 != null && !tpl.paste, at = cx == null ? centerWorld() : toWorld(cx, cy);
    const ox = exact ? S.x0 : at.x - w / 2, oy = exact ? S.y0 : at.y - hh / 2;
    tpl.items.forEach((i) => {
      if (gone(i)) return;
      const n = JSON.parse(JSON.stringify(i)); n.id = map[i.id] = HP.uid();
      const sn = exact ? (v) => Math.round(v * 10) / 10 : n.kind === 'mark' || n.kind === 'run' ? snap5 : snap; n.x = sn(ox + i.x); n.y = sn(oy + i.y); // exact: back where it was
      if (n.kind === 'run' && n.cable && !cat.get(n.cable)) n.cable = null;
      d.items.push(n);
    });
    (tpl.conns || []).forEach((c) => { if (map[c.a.item] && map[c.b.item]) d.conns.push({ id: HP.uid(), a: { item: map[c.a.item], key: c.a.key }, b: { item: map[c.b.item], key: c.b.key }, cable: c.cable && cat.get(c.cable) ? c.cable : null, shift: c.shift || 0, ...(c.cable && c.lv ? { lv: c.lv } : {}), ...(c.cable && c.m ? { m: c.m } : {}), ...(c.ad && cat.get(c.ad) ? { ad: c.ad } : {}) }); });
    d.mk = (d.mk || []).concat((S.mk || []).filter((k) => !(d.mk || []).includes(k))); // keep the Shortcut's letters (A, B, C…) where possible
    normMarks(); store.sel = new Set(Object.values(map).filter((id) => store.item(id))); store.selConn = null; store.commit();
    if (exact) C.fit();
    if (missing) HP.toast(t(missing + ' product(s) in this Shortcut no longer exist and were skipped.', missing + ' produkt(er) i genvejen findes ikke længere og blev sprunget over.'), { kind: 'warn' });
  };

  /* ---- CI mode + floor plan ---- */
  C.setCI = (on) => { store.doc.ci = on; if (!on) { C.stopStamp(); C.stopTool(); } store.commit(); };
  /* floor plan from an image (JPG/PNG) or a PDF (one page, rendered to an image with the bundled pdf.js) */
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  C.loadPlan = (file) => {
    if (!file) return;
    if (isPdf(file)) return loadPdfPlan(file);
    if (!/^image\//.test(file.type)) return HP.toast(t('Pick a JPG, PNG or PDF file.', 'Vælg en JPG-, PNG- eller PDF-fil.'), { kind: 'warn' });
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => {
      const k = Math.min(1, 2200 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      usePlan(cv);
    }; im.src = fr.result; };
    fr.readAsDataURL(file);
  };
  function usePlan(cv) {
    store.planSrc = cv.toDataURL('image/jpeg', 0.85); store.savePlan();
    const d = store.doc, s = pageSize(), m = 40, col = s.w > s.h ? 370 : 0; // landscape: keep a column free on the right for the legend
    const f = Math.min((s.w - m * 2 - col) / cv.width, (s.h - m * 2 - 40) / cv.height);
    // the plan's frame is placed on the grid and sized in whole grid steps (rounded down, so it never grows past the margins);
    // the image keeps its proportions inside the frame (object-fit: contain), so a measured scale stays true
    const w = Math.max(GRID * 5, Math.floor((cv.width * f) / GRID) * GRID), hh = Math.max(GRID * 5, Math.floor((cv.height * f) / GRID) * GRID);
    d.items = d.items.filter((i) => i.kind !== 'plan');
    d.items.unshift({ id: HP.uid(), kind: 'plan', x: snapGrid((s.w - col - w) / 2), y: snapGrid((s.h - 40 - hh) / 2), w, h: hh, lock: true });
    if (!d.ci) d.ci = true;
    geom.clear(); store.commit(); C.fit();
    HP.toast(t('Floor plan added and CI mode switched on. Click a product to place marks. Alt-click the plan to move or resize it.', 'Plantegning tilføjet, og CI-tilstand er slået til. Klik på et produkt for at placere mærker. Alt-klik på planen for at flytte eller skalere den.'), { ms: 8000 });
  }
  let pdfLib = null;
  async function pdfjs() { // loaded the first time a PDF is opened (about 1.8 MB), never on normal page loads
    if (!pdfLib) {
      const base = new URL('vendor/pdfjs/', location.href).href;
      pdfLib = await import(base + 'pdf.min.mjs');
      pdfLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    }
    return pdfLib;
  }
  const renderPage = async (page, longest) => {
    const v1 = page.getViewport({ scale: 1 }), vp1 = page.getViewport({ scale: Math.min(6, longest / Math.max(v1.width, v1.height)) });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp1.width); cv.height = Math.round(vp1.height);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp1 }).promise;
    return cv;
  };
  // a PDF with several pages: show the pages and let the seller pick the floor plan
  const pickPage = (pdf) => new Promise((resolve) => {
    const n = Math.min(pdf.numPages, 24), grid = h('.pdf-pages');
    const close = HP.modal({ title: t('Which page is the floor plan?', 'Hvilken side er plantegningen?'), size: 'lg', onClose: () => resolve(0),
      body: [h('p.muted', null, t('The PDF has ' + pdf.numPages + ' pages. Click the floor plan.', 'PDF-filen har ' + pdf.numPages + ' sider. Klik på plantegningen.') + (pdf.numPages > n ? t(' The first ' + n + ' are shown.', ' De første ' + n + ' vises.') : '')), grid] });
    for (let i = 1; i <= n; i++) {
      const cell = h('button.pdf-page', { onclick: () => { resolve(i); close(); } }, h('span.muted', null, t('Page ', 'Side ') + i));
      grid.append(cell);
      pdf.getPage(i).then((pg) => renderPage(pg, 220)).then((cv) => cell.prepend(cv)).catch(() => {});
    }
  });
  async function loadPdfPlan(file) {
    if (location.protocol === 'file:') return HP.toast(t('PDF floor plans work in the online version (hifiplanner.dk), not when the planner is opened as a local file. Use a JPG or PNG here.', 'PDF-plantegninger virker i onlineversionen (hifiplanner.dk), ikke når planneren åbnes som en lokal fil. Brug JPG eller PNG her.'), { kind: 'warn', ms: 9000 });
    const busy = HP.toast(t('Reading the PDF…', 'Læser PDF-filen…'), { ms: 60000 });
    const done = () => { if (typeof busy === 'function') busy(); };
    let pdf;
    try { const lib = await pdfjs(); pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
    catch (err) { done(); console.error(err); return HP.toast(err && err.name === 'PasswordException' ? t('This PDF is password protected.', 'Denne PDF er beskyttet med adgangskode.') : t('Could not read this PDF.', 'Kunne ikke læse denne PDF.'), { kind: 'warn' }); }
    try {
      let no = 1;
      if (pdf.numPages > 1) { done(); no = await pickPage(pdf); if (!no) return; }
      const cv = await renderPage(await pdf.getPage(no), 2600); // sharp enough for thin plan lines when zoomed in
      done(); usePlan(cv);
    } catch (err) { done(); console.error(err); HP.toast(t('Could not draw this PDF page.', 'Kunne ikke tegne denne PDF-side.'), { kind: 'warn' }); }
    finally { try { (pdf.loadingTask || pdf).destroy(); } catch (e) { /* already closed */ } }
  }


  /* ================= print ================= */
  // the A4 pages as sheets (clones of the canvas, fitted to A4), for printing and for the customer view (js/cover.js)
  C.sheets = () => {
    const d = store.doc, s = pageSize(), mm = d.orient === 'portrait' ? [210, 297] : [297, 210], px = (m) => (m * 96) / 25.4;
    const k = Math.min(px(mm[0]) / s.w, px(mm[1]) / s.h), ox = (px(mm[0]) - s.w * k) / 2, oy = (px(mm[1]) - s.h * k) / 2; // fit A4, centred
    store.sel.clear(); store.selConn = null; refreshSel();
    const out = [];
    for (let i = 0; i < d.pages; i++) {
      const r = pageRect(i), clone = world.cloneNode(true);
      clone.removeAttribute('id'); clone.classList.remove('wiring');
      clone.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + k + ') translate(' + -r.x + 'px,' + -r.y + 'px)';
      // screen-only marks inside a card (SYSTEM, UDGÅET, AUTO, not priced) are hidden, not removed: the card keeps its exact size,
      // so its ports stay where the wires (drawn on screen) end. Everything else that is screen-only is removed.
      clone.querySelectorAll('.no-print').forEach((e) => { if (e.closest('.item.k-product, .item.k-mark')) e.style.visibility = 'hidden'; else e.remove(); });
      out.push(h('.sheet', { style: { width: mm[0] + 'mm', height: mm[1] + 'mm' } }, clone));
    }
    return { sheets: out, mm };
  };
  C.print = (opts) => {
    const d = store.doc, s = pageSize();
    const total = d.pages * (s.w + GAP) - GAP;
    const outside = d.items.filter((it) => { const g = measure(it), cx = it.x + g.w / 2, cy = it.y + g.h / 2; return cx < 0 || cx > total || cy < 0 || cy > s.h; }).length;
    if (outside) HP.toast(t(outside + ' item(s) are outside the A4 pages and will not be printed.', outside + ' element(er) ligger uden for A4-siderne og bliver ikke printet.'), { kind: 'warn', ms: 7000 });
    const { sheets, mm } = C.sheets();
    const root = h('#print-root');
    if (opts && opts.cover) root.append(h('.sheet.cover-sheet', { style: { width: mm[0] + 'mm', height: mm[1] + 'mm' } }, opts.cover));
    sheets.forEach((sh) => root.append(sh));
    const st = h('style', { textContent: '@page{size:A4 ' + (d.orient === 'portrait' ? 'portrait' : 'landscape') + ';margin:0}' });
    document.head.append(st); document.body.append(root); document.body.classList.add('printing');
    if (opts && opts.cover && HP.cover) HP.cover.paginate(root); // a long price list continues on more cover sheets
    const done = () => { root.remove(); st.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    if (C.printHook) return C.printHook(done);
    setTimeout(() => window.print(), 150);
  };

  /* ================= render + init ================= */
  function render() { renderPages(); renderItems(); world.classList.toggle('ci', !!store.doc.ci); renderWires(); placeBar(); }
  C.render = render;
  C.invalidate = () => { els.forEach((el) => (el._sig = null)); geom.clear(); render(); };

  C.init = (mount) => {
    vp = h('#viewport', null,
      (world = h('#world.world', null, (pagesEl = h('.layer.pages')), (planEl = h('.layer.plans')), (wiresSvg = svg('svg', { class: 'layer wires' })), (itemsEl = h('.layer.items')), (chipsEl = h('.layer.chips')), (tempSvg = svg('svg', { class: 'layer wires temp' })), (toolSvg = svg('svg', { class: 'layer wires temp tool' })))),
      (overlay = h('.overlay', null, (selbar = h('#selbar', { hidden: true })), (marqueeEl = h('.marquee')))),
      h('.zoomer', null,
        h('button', { title: t('Zoom out', 'Zoom ud'), onclick: () => C.zoomBy(1 / 1.25) }, icon('minus')),
        (zoomLbl = h('button.zl', { title: t('Reset to 100%', 'Nulstil til 100%'), onclick: () => C.zoomBy(1 / view.z) }, '100%')),
        h('button', { title: t('Zoom in', 'Zoom ind'), onclick: () => C.zoomBy(1.25) }, icon('plus')),
        h('button', { title: t('Fit to window (Shift+1)', 'Tilpas til vindue (Shift+1)'), onclick: C.fit }, icon('fit'))));
    mount.append(vp);
    // two fingers: pinch to zoom and pan together. Runs in the capture phase so a second finger never reaches onDown.
    const fingers = new Map(); let pinch = null;
    const mid = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      lastTouch = Date.now(); fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        if (curDrag) curDrag.abort();
        const m = mid(); pinch = { x: m.x, y: m.y, d: m.d, z: view.z };
        try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      if (fingers.size >= 2) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    vp.addEventListener('pointermove', (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || fingers.size !== 2) return;
      const m = mid();
      zoomAt(pinch.x, pinch.y, pinch.z * (m.d / pinch.d));
      view.x += m.x - pinch.x; view.y += m.y - pinch.y; applyView();
      pinch.x = m.x; pinch.y = m.y; pinch.z = view.z; pinch.d = m.d;
    }, true);
    const lift = (e) => { if (!fingers.delete(e.pointerId)) return; lastTouch = Date.now(); if (fingers.size < 2) pinch = null; };
    window.addEventListener('pointerup', lift, true); window.addEventListener('pointercancel', lift, true);
    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('contextmenu', onContext);
    window.addEventListener('pointermove', (e) => { lastPtr = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }; moveGhost(); if (tool && tool.pts.length) toolPreview(); }, { passive: true });
    vp.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
    vp.addEventListener('dragover', (e) => e.preventDefault());
    vp.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) C.loadPlan(f); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable) { spaceDown = true; vp.classList.add('space'); e.preventDefault(); } if (e.key === 'Escape') { cancelWire(); C.stopStamp(); C.stopTool(); } if (e.key === 'Enter' && tool && tool.type === 'run' && tool.pts.length > 1) { e.preventDefault(); finishRun(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; vp.classList.remove('space'); } });
    HP.on('doc', render); HP.on('catalog', render);
    // card headings change height when a web font arrives: measure the ports again and redraw the wires (the cards themselves are not
    // rebuilt, so a text being typed keeps its focus)
    const remeasure = () => { geom.clear(); renderWires(); placeBar(); };
    if (document.fonts) { document.fonts.ready.then(remeasure); if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', remeasure); }
    const saved = HP.LS.get('view', null);
    render();
    if (saved && isFinite(saved.z)) { Object.assign(view, saved); applyView(); } else C.fit();
    HP.on('loaded', () => C.fit());
  };
})();
