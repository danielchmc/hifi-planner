/* HiFi Planner v2 — canvas: pan/zoom world, A4 pages, cards, wires, selection, print. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, snap, clamp, icon } = HP;
  const C = (HP.canvas = {});
  const LONG = 1414, SHORT = 1000, GAP = 60; // A4 in world units (1 : sqrt 2)
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  let vp, world, pagesEl, planEl, wiresSvg, itemsEl, chipsEl, tempSvg, overlay, selbar, marqueeEl, zoomLbl;
  const view = { x: 40, y: 40, z: 0.6 };
  const els = new Map(), geom = new Map(), routes = new Map();
  let wiring = null, spaceDown = false, order = '', lastPtr = null, lastImgClick = { id: null, t: 0 };
  C.hd = false;

  const pageSize = () => (store.doc.orient === 'portrait' ? { w: SHORT, h: LONG } : { w: LONG, h: SHORT });
  const pageRect = (i) => { const s = pageSize(); return { x: i * (s.w + GAP), y: 0, w: s.w, h: s.h }; };
  C.pageSize = pageSize; C.pageRect = pageRect;

  /* ================= cards ================= */
  function cardW(p) {
    const len = (a) => Math.max(0, ...(a || []).map((x) => x.label.length));
    return Math.ceil(Math.max(210, (len(p.in) + len(p.out)) * 6.4 + 54) / 10) * 10;
  }
  function buildCard(p, item, ci, ciSize) {
    const imgs = HP.imagesOf(p, item), face = clamp(item.face || 0, 0, Math.max(0, imgs.length - 1)), v = HP.variantOf(p, item);
    const img = HP.imgEl(imgs[face] || '', C.hd ? 'hd' : 'card', { alt: p.name });
    if (ci) return h('.card.ci', { style: { width: ciSize + 'px' }, title: p.brand + ' ' + p.name }, h('.card-img', { style: { height: ciSize + 'px' } }, img), h('.ci-name', null, p.name));
    const port = (x, side) => h('.port.' + side, { data: { key: x.key, side, conn: x.conn }, title: P.CONNECTORS[x.conn] || '' }, h('i.dot.c-' + x.conn), h('span.lbl', null, x.label));
    const hasIO = (p.in || []).length || (p.out || []).length;
    return h('.card', { style: { width: cardW(p) + 'px' } },
      (p.bt || p.wifi) && h('.fabs', null, p.bt && h('span.fab', { title: 'Bluetooth' }, icon('bt')), p.wifi && h('span.fab', { title: 'WiFi' }, icon('wifi'))),
      h('.card-head', null, h('span.brand', null, p.brand, v && h('span.vlabel', null, ' · ' + v.label),
          p.gone && h('span.gone-tag.no-print', { title: t('No longer on hifiklubben.dk', 'Ikke længere på hifiklubben.dk') }, t('DISCONTINUED', 'UDGÅET')),
          p.review && h('span.gone-tag.auto.no-print', { title: t('Added automatically from hifiklubben.dk. Inputs/outputs are suggested from the website and not checked yet.', 'Tilføjet automatisk fra hifiklubben.dk. Ind-/udgange er foreslået ud fra hjemmesiden og ikke kontrolleret endnu.') }, 'AUTO')),
        h('span.name', null, p.name)),
      h('.card-img', { title: imgs.length > 1 ? t('Click to flip front/back. Double-click to inspect.', 'Klik for at vende for/bag. Dobbeltklik for at se nærmere.') : t('Double-click to inspect', 'Dobbeltklik for at se nærmere') }, img,
        imgs.length > 1 && h('span.face', null, face ? t('BACK', 'BAG') : t('FRONT', 'FRONT')),
        imgs.length > 0 && h('button.inspect.no-print', { title: t('Inspect image (I)', 'Se billedet nærmere (I)'), data: { inspect: '1' } }, icon('search', 13)),
        (p.vars || []).length > 1 && h('.swatches.no-print', null, p.vars.slice(0, 8).map((x) => h('button.sw' + ((v ? v.sku : '') === x.sku ? '.on' : ''), { title: x.label + ' · ' + HP.money(x.price), data: { var: x.sku }, style: { background: HP.site.swatch(x) } })),
          p.vars.length > 8 && h('span.more', null, '+' + (p.vars.length - 8)))),
      hasIO ? h('.card-io', null, h('.col.in', null, (p.in || []).map((x) => port(x, 'in'))), h('.col.out', null, (p.out || []).map((x) => port(x, 'out')))) : null);
  }
  C.buildCard = buildCard; C.cardW = cardW;
  const cardScale = () => (store.doc.ci ? 1 : store.doc.cardScale || 1);
  C.cardScale = cardScale;

  function priceRows() {
    const d = store.doc, rows = new Map();
    const add = (p, cable, it) => {
      if (!p) return;
      const pr = HP.priceOf(p, it), key = p.id + '|' + (pr.label || '');
      const r = rows.get(key) || { name: p.brand + ' ' + p.name + (pr.label ? ' (' + pr.label + ')' : ''), price: pr.price, was: pr.was, qty: 0, cable };
      r.qty++; rows.set(key, r);
    };
    d.items.forEach((it) => it.kind === 'product' && add(cat.get(it.pid), false, it));
    d.conns.forEach((c) => c.cable && add(cat.get(c.cable), true));
    const list = [...rows.values()].sort((a, b) => a.cable - b.cable);
    return { list, total: list.reduce((s, r) => s + r.price * r.qty, 0), saving: list.reduce((s, r) => s + (r.was ? (r.was - r.price) * r.qty : 0), 0) };
  }
  C.priceRows = priceRows;

  function buildItem(it) {
    const d = store.doc;
    if (it.kind === 'product') {
      const p = cat.get(it.pid);
      if (!p) return h('.card.missing', { style: { width: '210px' } }, h('.card-head', null, h('span.brand', null, t('Unknown product', 'Ukendt produkt')), h('span.name', null, it.pid)));
      return buildCard(p, it, d.ci, d.ciSize);
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
      return h('.prices', null, h('.prices-head', null, t('Items & prices', 'Varer & priser')),
        list.length ? h('table', null, list.map((r) => h('tr', null, h('td.q', null, r.qty > 1 ? r.qty + '×' : ''),
          h('td', null, r.name, r.was ? h('span.save', null, t('Save ', 'Spar ') + pct(r) + '%') : null),
          h('td.p', null, r.was ? h('s', null, HP.money(r.was * r.qty)) : null, HP.money(r.price * r.qty))))) : h('.muted', null, t('No products yet', 'Ingen produkter endnu')),
        h('.prices-total', null, h('span', null, 'Total'), h('span', null, HP.money(total))),
        saving > 0 && h('.prices-saving', null, h('span', null, t('You save', 'Du sparer')), h('span', null, HP.money(saving))),
        h('.prices-note', null, t('Prices valid on ', 'Priser gælder d. ') + HP.today()));
    }
    if (it.kind === 'plan') return h('.plan' + (it.lock ? '.locked' : ''), { style: { width: it.w + 'px', height: it.h + 'px' } }, h('img', { src: store.planSrc || '', draggable: false }), h('i.resize.no-print'));
    return h('div');
  }
  function itemSig(it) {
    const d = store.doc, L = HP.lang();
    if (it.kind === 'product') return ['p', it.pid, it.face, it.v, d.ci, d.ciSize, cardScale(), C.hd, cat.version, L].join('|');
    if (it.kind === 'text') return ['t', it.w, it.h, it.title, it.body, it.noTitle ? 1 : 0, it.noBody ? 1 : 0, L].join('|');
    if (it.kind === 'prices') return 'r' + JSON.stringify(priceRows()) + L + HP.today();
    if (it.kind === 'plan') return ['f', it.w, it.h, it.lock, (store.planSrc || '').length].join('|');
    return '';
  }

  function renderItems() {
    const seen = new Set();
    store.doc.items.forEach((it) => {
      seen.add(it.id);
      const sig = itemSig(it);
      let el = els.get(it.id);
      if (!el || el._sig !== sig) {
        const ne = buildItem(it); ne._sig = sig; ne.dataset.id = it.id; ne.classList.add('item', 'k-' + it.kind);
        if (el) el.replaceWith(ne); else (it.kind === 'plan' ? planEl : itemsEl).append(ne);
        els.set(it.id, ne); el = ne; geom.delete(it.id);
      }
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      if (it.kind === 'product') { const s = cardScale(); el.style.transform = s !== 1 ? 'scale(' + s + ')' : ''; }
      el.classList.toggle('sel', store.sel.has(it.id));
    });
    for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); geom.delete(id); }
    const ord = store.doc.items.map((i) => i.id).join(',');
    if (ord !== order) { order = ord; store.doc.items.forEach((it) => { const el = els.get(it.id); if (el && it.kind !== 'plan') itemsEl.append(el); }); }
  }
  function measure(it) {
    let g = geom.get(it.id);
    const el = els.get(it.id);
    if (!g && el) {
      const s = it.kind === 'product' ? cardScale() : 1;
      g = { w: el.offsetWidth * s, h: el.offsetHeight * s, p: {} };
      el.querySelectorAll('.port').forEach((pe) => { g.p[pe.dataset.side + ':' + pe.dataset.key] = (pe.offsetTop + pe.offsetHeight / 2) * s; });
      geom.set(it.id, g);
    }
    return g || { w: 0, h: 0, p: {} };
  }
  function portPos(itemId, side, key) {
    const it = store.item(itemId); if (!it) return null;
    const g = measure(it), y = g.p[side + ':' + key];
    return y == null ? null : { x: it.x + (side === 'in' ? 0 : g.w), y: it.y + y };
  }
  const portDef = (itemId, side, key) => { const it = store.item(itemId), p = it && cat.get(it.pid); return p && (p[side] || []).find((x) => x.key === key); };
  function connInfo(c) {
    const a = portDef(c.a.item, 'out', c.a.key), b = portDef(c.b.item, 'in', c.b.key);
    return { a, b, conn: a ? a.conn : 'other', warn: !!(a && b && !P.compatible(a.conn, b.conn)), cable: c.cable ? cat.get(c.cable) : null };
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
    if (d.ci) return;
    const bySrc = {};
    d.conns.forEach((c) => (bySrc[c.a.item] = bySrc[c.a.item] || []).push(c));
    const lanes = new Map();
    Object.values(bySrc).forEach((list) => list.map((c) => [c, (portPos(c.a.item, 'out', c.a.key) || { y: 0 }).y]).sort((p, q) => p[1] - q[1])
      .forEach(([c], i, arr) => lanes.set(c.id, (i - (arr.length - 1) / 2) * 8)));
    d.conns.forEach((c) => {
      const r = route(c, lanes.get(c.id) || 0); if (!r) return;
      routes.set(c.id, r);
      const info = connInfo(c), dd = pathD(r.pts, 7), sel = store.selConn === c.id;
      const g = svg('g', { class: 'wire c-' + info.conn + (sel ? ' sel' : '') + (info.warn ? ' warn' : ''), 'data-id': c.id });
      g.append(svg('path', { class: 'hit', d: dd }), svg('path', { class: 'line', d: dd }));
      wiresSvg.append(g);
      [[c.a, 'out'], [c.b, 'in']].forEach(([e, side]) => { const el = els.get(e.item), pe = el && el.querySelector('.port.' + side + '[data-key="' + e.key + '"]'); if (pe) pe.classList.add('on'); });
      if (info.cable || info.warn) {
        chipsEl.append(h('.chip.c-' + info.conn + (info.warn ? '.warn' : '') + (sel ? '.sel' : ''), { data: { id: c.id }, style: { left: r.mid[0] + 'px', top: r.mid[1] + 'px' },
          title: info.cable ? info.cable.brand + ' ' + info.cable.name + ' · ' + HP.money(info.cable.price) : t('Connector types do not match', 'Stiktyperne passer ikke sammen') },
          info.warn && icon('warn', 11), info.cable ? info.cable.name.replace(/\s+-\s+/g, ' ') : t('Mismatch', 'Passer ikke')));
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
          h('.page-meta', null,
            HP.seller() && h('.adviser', null, h('.adv-label', null, t('Your adviser', 'Din rådgiver')), h('.adv-name', null, HP.seller().name)),
            h('.meta-lines', null, h('div.shopline', null, [HP.shopProfile().name, HP.shopProfile().phone && t('Tel. ', 'Tlf. ') + HP.shopProfile().phone, HP.shopProfile().email].filter(Boolean).join('  ·  ')),
              h('div', null, [d.name, HP.today(), d.pages > 1 && (i + 1) + '/' + d.pages].filter(Boolean).join('  ·  ')))))));
    }
    const r = pageRect(d.pages);
    pagesEl.append(h('button.page-add.no-print', { style: { left: r.x + 'px', top: '0px', height: s.h + 'px' }, title: t('Add an A4 page', 'Tilføj en A4-side'), onclick: () => { d.pages++; store.commit(); } }, icon('plus'), h('span', null, t('Add page', 'Tilføj side'))));
  }

  /* ================= view ================= */
  function applyView() {
    world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')';
    const g = 20 * view.z * (view.z < 0.5 ? 5 : 1);
    vp.style.backgroundSize = g + 'px ' + g + 'px';
    vp.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
    if (zoomLbl) zoomLbl.textContent = Math.round(view.z * 100) + '%';
    const hd = view.z * cardScale() >= 1.3;
    if (hd !== C.hd) { C.hd = hd; renderItems(); }
    placeBar();
    HP.LS.set('view', view);
  }
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
  function placeBar() {
    if (!selbar) return;
    const d = store.doc, ids = [...store.sel].filter((id) => store.item(id));
    selbar.textContent = '';
    let anchor = null;
    const btn = (ic, label, fn, cls) => h('button' + (cls || ''), { title: label, onclick: fn }, icon(ic), h('span', null, label));
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
        selbar.append(btn('swap', t('Replace', 'Udskift'), () => HP.panels.replacePicker(one.id)));
        const p = cat.get(one.pid);
        if (p && HP.imagesOf(p, one).length > 1 && !d.ci) selbar.append(btn('flip', t('Flip', 'Vend'), () => C.flip(one.id)));
        if (p && (p.vars || []).length > 1) selbar.append(btn('layers', t('Colour', 'Farve'), (e) => C.colourMenu(one.id, e.currentTarget)));
      }
      if (one && one.kind === 'text') selbar.append(
        btn('text', t('Title', 'Titel'), () => C.toggleNotePart(one.id, 'title'), (one.noTitle ? '' : '.on') + (one.noBody ? '.locked' : '')),
        btn('text', t('Paragraph', 'Afsnit'), () => C.toggleNotePart(one.id, 'body'), (one.noBody ? '' : '.on') + (one.noTitle ? '.locked' : '')));
      if (one && one.kind === 'plan') selbar.append(btn(one.lock ? 'move' : 'lock', one.lock ? t('Unlock to move', 'Lås op for at flytte') : t('Lock', 'Lås'), () => { one.lock = !one.lock; store.commit(); }), btn('trash', t('Remove floor plan', 'Fjern plantegning'), C.removePlan, '.danger'));
      if (!(one && (one.kind === 'prices' || one.kind === 'plan'))) selbar.append(btn('copy', t('Duplicate', 'Dublér'), C.duplicateSelection));
      if (HP.isAdmin() && ids.some((id) => store.item(id).kind === 'product')) selbar.append(btn('bolt', t('Save as Shortcut', 'Gem som genvej'), () => HP.editor.saveShortcut()));
      if (!(one && one.kind === 'plan')) selbar.append(btn('trash', t('Delete', 'Slet'), C.deleteSelection, '.danger'));
    }
    selbar.hidden = !anchor;
    if (anchor) { selbar.style.left = anchor.x * view.z + view.x + 'px'; selbar.style.top = anchor.y * view.z + view.y - 12 + 'px'; }
  }
  function refreshSel() {
    els.forEach((el, id) => el.classList.toggle('sel', store.sel.has(id)));
    renderWires(); placeBar(); HP.emit('sel');
  }
  C.select = (ids) => { store.sel = new Set(ids); store.selConn = null; refreshSel(); };

  /* ================= pointer interactions ================= */
  function drag(e, onMove, onEnd) {
    const sx = e.clientX, sy = e.clientY; let moved = false;
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const mv = (ev) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; moved = true; onMove(ev, ev.clientX - sx, ev.clientY - sy); };
    const up = (ev) => { vp.removeEventListener('pointermove', mv); vp.removeEventListener('pointerup', up); vp.removeEventListener('pointercancel', up); onEnd(ev, moved); };
    vp.addEventListener('pointermove', mv); vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  }
  const blurActive = () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); };

  function startPan(e, clickClears) {
    const x0 = view.x, y0 = view.y; vp.classList.add('panning');
    drag(e, (ev, dx, dy) => { view.x = x0 + dx; view.y = y0 + dy; applyView(); },
      (ev, moved) => { vp.classList.remove('panning'); if (!moved && clickClears && (store.sel.size || store.selConn)) { store.sel.clear(); store.selConn = null; refreshSel(); } });
  }
  function startMarquee(e) {
    const r = vp.getBoundingClientRect(), a = toWorld(e.clientX, e.clientY), base = new Set(store.sel);
    drag(e, (ev) => {
      const b = toWorld(ev.clientX, ev.clientY), x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      Object.assign(marqueeEl.style, { display: 'block', left: Math.min(e.clientX, ev.clientX) - r.left + 'px', top: Math.min(e.clientY, ev.clientY) - r.top + 'px', width: Math.abs(ev.clientX - e.clientX) + 'px', height: Math.abs(ev.clientY - e.clientY) + 'px' });
      store.sel = new Set(base);
      store.doc.items.forEach((it) => { if (it.kind === 'plan') return; const g = measure(it); if (it.x < x1 && it.x + g.w > x0 && it.y < y1 && it.y + g.h > y0) store.sel.add(it.id); });
      store.selConn = null; refreshSel();
    }, () => { marqueeEl.style.display = 'none'; });
  }
  function startItemDrag(e, it) {
    const add = e.shiftKey || e.ctrlKey || e.metaKey, was = store.sel.has(it.id), onImg = !!e.target.closest('.card-img');
    if (!was) { if (!add) store.sel.clear(); store.sel.add(it.id); store.selConn = null; refreshSel(); }
    const group = [...store.sel].map(store.item).filter((i) => i && !(i.kind === 'plan' && i.lock)), start = group.map((i) => [i.x, i.y]);
    drag(e, (ev, dx, dy) => {
      group.forEach((i, k) => { i.x = snap(start[k][0] + dx / view.z); i.y = snap(start[k][1] + dy / view.z); const el = els.get(i.id); el.style.left = i.x + 'px'; el.style.top = i.y + 'px'; });
      renderWires(); placeBar();
    }, (ev, moved) => {
      if (moved) return store.commit();
      if (add && was) store.sel.delete(it.id); else if (!add) { store.sel.clear(); store.sel.add(it.id); }
      const p = it.kind === 'product' && cat.get(it.pid);
      if (p && onImg && !add) {
        const now = Date.now(), dbl = lastImgClick.id === it.id && now - lastImgClick.t < 350, flipped = lastImgClick.flipped;
        lastImgClick = { id: it.id, t: dbl ? 0 : now };
        if (dbl) { if (flipped) store.undo(); return C.inspect(it.id); }
        const n = HP.imagesOf(p, it).length;
        if (!store.doc.ci && n > 1) { it.face = ((it.face || 0) + 1) % n; lastImgClick.flipped = true; return store.commit(); }
      }
      refreshSel();
    });
  }
  function startResize(e, it) {
    const w0 = it.w, h0 = it.h, el = els.get(it.id);
    drag(e, (ev, dx, dy) => {
      if (it.kind === 'plan') { it.w = Math.max(100, snap(w0 + dx / view.z)); it.h = Math.round((it.w * h0) / w0); }
      else { it.w = Math.max(140, snap(w0 + dx / view.z)); it.h = Math.max(60, snap(h0 + dy / view.z)); }
      el.style.width = it.w + 'px'; el.style[it.kind === 'plan' ? 'height' : 'minHeight'] = it.h + 'px';
    }, (ev, moved) => { if (moved) { geom.delete(it.id); store.commit(); } });
  }
  function startWireDrag(e, id) {
    const c = store.doc.conns.find((x) => x.id === id); if (!c) return;
    const r = routes.get(id), s0 = c.shift || 0;
    drag(e, (ev, dx, dy) => { c.shift = Math.round((s0 + (r.axis === 'x' ? dx : dy) / view.z) / 5) * 5; renderWires(); },
      (ev, moved) => { store.sel.clear(); store.selConn = id; if (moved) store.commit(); else { refreshSel(); HP.panels.cablePicker(id); } });
  }

  /* ---- wiring ---- */
  function tempPath(ev) {
    const f = wiring.from, a = portPos(f.item, f.side, f.key), b = toWorld(ev.clientX, ev.clientY);
    if (!a) return;
    const out = f.side === 'out', mx = out ? Math.max(a.x + 20, (a.x + b.x) / 2) : Math.min(a.x - 20, (a.x + b.x) / 2);
    tempSvg.firstChild.setAttribute('d', pathD([[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]], 7));
  }
  function startWire(e, portEl) {
    const itemEl = portEl.closest('.item'), from = { item: itemEl.dataset.id, key: portEl.dataset.key, side: portEl.dataset.side, conn: portEl.dataset.conn };
    if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); }
    wiring = { from, sticky: false };
    world.classList.add('wiring');
    world.querySelectorAll('.port').forEach((pe) => {
      const other = pe.closest('.item').dataset.id !== from.item && pe.dataset.side !== from.side;
      pe.classList.toggle('cand', other && P.compatible(from.conn, pe.dataset.conn));
      pe.classList.toggle('cand-warn', other && !P.compatible(from.conn, pe.dataset.conn));
    });
    portEl.classList.add('from');
    tempSvg.textContent = ''; tempSvg.append(svg('path', { class: 'line c-' + from.conn }));
    tempPath(e);
    drag(e, tempPath, (ev, moved) => {
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
    if (!P.compatible(a.conn, b.conn)) HP.toast(P.CONNECTORS[a.conn] + ' → ' + P.CONNECTORS[b.conn] + ': ' + t('these connectors do not match. Check the connection.', 'disse stik passer ikke sammen. Tjek forbindelsen.'), { kind: 'warn', ms: 6000 });
    store.sel.clear(); store.selConn = null; store.commit();
  }
  C.connect = (aItem, aKey, bItem, bKey) => { store.doc.conns.push({ id: HP.uid(), a: { item: aItem, key: aKey }, b: { item: bItem, key: bKey }, cable: null, shift: 0 }); };

  function onDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) { e.preventDefault(); return startPan(e, false); }
    if (e.button !== 0) return;
    const portEl = e.target.closest('.port');
    if (wiring && wiring.sticky) { e.preventDefault(); return portEl ? finishWire(portEl) : cancelWire(); }
    const sw = e.target.closest('[data-var]');
    if (sw) { e.preventDefault(); e.stopPropagation(); return C.setVariant(sw.closest('.item').dataset.id, sw.dataset.var); }
    const insp = e.target.closest('[data-inspect]');
    if (insp) { e.preventDefault(); e.stopPropagation(); return C.inspect(insp.closest('.item').dataset.id); }
    if (e.target.closest('[contenteditable="true"], button, input, #selbar, .zoomer, .cibar')) return;
    e.preventDefault(); blurActive();
    if (portEl && portEl.closest('.item')) return startWire(e, portEl);
    const w = e.target.closest('.wire, .chip'); if (w) return startWireDrag(e, w.dataset.id);
    const itemEl = e.target.closest('.item');
    if (itemEl) {
      const it = store.item(itemEl.dataset.id);
      if (it && e.target.closest('.resize') && !(it.kind === 'plan' && it.lock)) return startResize(e, it);
      if (it && !(it.kind === 'plan' && it.lock)) return startItemDrag(e, it);
      if (it && it.kind === 'plan' && e.altKey) return C.select([it.id]);
    }
    if (e.shiftKey) return startMarquee(e);
    startPan(e, true);
  }

  /* ================= operations ================= */
  C.addProduct = (pid, wx, wy) => {
    const p = cat.get(pid), d = store.doc; if (!p) return null;
    const s = cardScale(), w = d.ci ? d.ciSize : cardW(p) * s, hh = d.ci ? d.ciSize : (170 + Math.max((p.in || []).length, (p.out || []).length) * 17) * s;
    const it = { id: HP.uid(), kind: 'product', pid, x: snap(wx - w / 2), y: snap(wy - hh / 2), face: 0 };
    d.items.push(it); store.sel = new Set([it.id]); store.selConn = null; store.commit();
    return it;
  };
  C.addProductCenter = (pid) => { const c = centerWorld(), n = store.doc.items.length % 6; return C.addProduct(pid, c.x + n * 20, c.y + n * 20); };
  const cardAt = (cx, cy) => {
    const hit = document.elementFromPoint(cx, cy), el = hit && hit.closest('.item.k-product');
    if (!el) return null;
    const r = el.getBoundingClientRect(), ix = r.width * 0.2, iy = r.height * 0.2;
    return cx > r.left + ix && cx < r.right - ix && cy > r.top + iy && cy < r.bottom - iy ? el : null;
  };
  C.dragHover = (cx, cy) => { const el = cx == null ? null : cardAt(cx, cy); world.querySelectorAll('.drop-replace').forEach((x) => x !== el && x.classList.remove('drop-replace')); if (el) el.classList.add('drop-replace'); };
  C.dropProduct = (pid, cx, cy) => {
    const r = vp.getBoundingClientRect(), el = cardAt(cx, cy);
    C.dragHover(null);
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
    if (el) return C.replaceItem(el.dataset.id, pid);
    const w = toWorld(cx, cy); C.addProduct(pid, w.x, w.y);
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
    else d.items.push({ id: HP.uid(), kind: 'prices', x: snap(pageSize().w - 330), y: 30 });
    store.commit();
  };
  C.deleteSelection = () => {
    const d = store.doc;
    if (store.selConn) { d.conns = d.conns.filter((c) => c.id !== store.selConn); store.selConn = null; return store.commit(); }
    if (!store.sel.size) return;
    d.items = d.items.filter((i) => !store.sel.has(i.id));
    d.conns = d.conns.filter((c) => !store.sel.has(c.a.item) && !store.sel.has(c.b.item));
    store.sel.clear(); store.commit();
  };
  C.duplicateSelection = () => {
    const d = store.doc, map = {}, src = d.items.filter((i) => store.sel.has(i.id) && i.kind !== 'prices' && i.kind !== 'plan');
    if (!src.length) return;
    src.forEach((i) => { const n = JSON.parse(JSON.stringify(i)); n.id = map[i.id] = HP.uid(); n.x += 30; n.y += 30; d.items.push(n); });
    d.conns.slice().forEach((c) => { if (map[c.a.item] && map[c.b.item]) d.conns.push(Object.assign({}, c, { id: HP.uid(), a: { item: map[c.a.item], key: c.a.key }, b: { item: map[c.b.item], key: c.b.key } })); });
    store.sel = new Set(Object.values(map)); store.commit();
  };
  C.replaceItem = (id, pid) => {
    const d = store.doc, it = store.item(id), oldP = cat.get(it.pid) || {}, newP = cat.get(pid);
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
    if (!d.ci) it.x = snap(it.x + (measure(it).w - cardW(newP) * cardScale()) / 2);
    it.pid = pid; it.face = 0; delete it.v; store.sel = new Set([id]); store.selConn = null; store.commit();
    const msg = (oldP.name || '?') + ' → ' + newP.name + '. ' + (kept + lost === 0 ? '' : lost
      ? t(kept + ' connection(s) kept, ' + lost + ' removed (no matching port).', kept + ' forbindelse(r) bevaret, ' + lost + ' fjernet (ingen matchende port).')
      : t('All ' + kept + ' connection(s) kept.', 'Alle ' + kept + ' forbindelse(r) bevaret.'));
    HP.toast(msg, { kind: lost ? 'warn' : 'ok', ms: 7000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
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
    C.insertTemplate(clip, cx, cy);
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
  C.colourMenu = (id, anchor, x, y) => {
    const it = store.item(id), p = it && cat.get(it.pid); if (!p || !(p.vars || []).length) return;
    const r = anchor ? anchor.getBoundingClientRect() : null;
    HP.menu(r ? r.left : x, r ? r.bottom + 4 : y, [{ head: t('Colour / finish', 'Farve / finish') }].concat(p.vars.map((v) => ({ label: v.label + '  ·  ' + HP.money(v.price) + (v.was ? '  (' + t('was ', 'før ') + HP.money(v.was) + ')' : ''), swatch: HP.site.swatch(v), on: it.v === v.sku, fn: () => C.setVariant(id, v.sku) }))));
  };
  C.inspect = (id) => { const it = store.item(id); if (it && it.kind === 'product') HP.panels.viewer(it.pid, it.face || 0, (face) => { if ((it.face || 0) !== face) { it.face = face; store.commit(); } }, it); };

  /* ---- right-click menu ---- */
  function onContext(e) {
    e.preventDefault();
    if (wiring) cancelWire();
    const itemEl = e.target.closest('.item'), wireEl = e.target.closest('.wire, .chip'), d = store.doc, admin = HP.isAdmin();
    if (wireEl) { store.sel.clear(); store.selConn = wireEl.dataset.id; refreshSel(); }
    else if (itemEl && !store.sel.has(itemEl.dataset.id)) { store.sel = new Set([itemEl.dataset.id]); store.selConn = null; refreshSel(); }
    else if (!itemEl && !e.target.closest('.overlay')) { if (store.sel.size || store.selConn) { store.sel.clear(); store.selConn = null; refreshSel(); } }
    const ids = [...store.sel], one = ids.length === 1 && store.item(ids[0]), p = one && one.kind === 'product' && cat.get(one.pid);
    const M = [], x = e.clientX, y = e.clientY;
    const add = (label, key, ic, fn, opts) => M.push(Object.assign({ label, key, icon: ic, fn }, opts));
    if (store.selConn) {
      const c = d.conns.find((q) => q.id === store.selConn);
      M.push({ head: t('Connection', 'Forbindelse') });
      add(t('Choose cable…', 'Vælg kabel…'), 'Enter', 'cable', () => HP.panels.cablePicker(store.selConn));
      if (c && c.cable) add(t('Remove cable', 'Fjern kabel'), '', 'x', () => { c.cable = null; store.commit(); });
      add(t('Straighten wire', 'Ret ledningen ud'), '', 'fit', () => { c.shift = 0; store.commit(); }, { disabled: !c || !c.shift });
      add(t('Delete connection', 'Slet forbindelse'), 'Del', 'trash', C.deleteSelection, { danger: true });
      M.push('sep');
    } else if (ids.length) {
      M.push({ head: one ? (p ? p.brand + ' ' + p.name : one.kind === 'plan' ? t('Floor plan', 'Plantegning') : one.kind === 'prices' ? t('Price list', 'Prisliste') : t('Text', 'Tekst')) : ids.length + ' ' + t('items selected', 'elementer markeret') });
      if (p) {
        add(t('Replace…', 'Udskift…'), 'R', 'swap', () => HP.panels.replacePicker(one.id));
        if (HP.imagesOf(p, one).length > 1 && !d.ci) add(t('Flip front/back', 'Vend for/bag'), 'B', 'flip', () => C.flip(one.id));
        if (HP.imagesOf(p, one).length) add(t('Inspect image', 'Se billedet nærmere'), 'I', 'search', () => C.inspect(one.id));
        if ((p.vars || []).length > 1) add(t('Colour / finish…', 'Farve / finish…') + (HP.variantOf(p, one) ? ' (' + HP.variantOf(p, one).label + ')' : ''), 'C', 'layers', () => C.colourMenu(one.id, null, x, y));
        if (admin) add(t('Edit product…', 'Redigér produkt…'), '', 'edit', () => HP.editor.open(p.id));
      }
      if (one && one.kind === 'text') {
        add(t('Show title', 'Vis titel'), '', 'text', () => C.toggleNotePart(one.id, 'title'), { on: !one.noTitle, disabled: !!one.noBody });
        add(t('Show paragraph', 'Vis afsnit'), '', 'text', () => C.toggleNotePart(one.id, 'body'), { on: !one.noBody, disabled: !!one.noTitle });
      }
      if (one && one.kind === 'plan') {
        add(one.lock ? t('Unlock to move/resize', 'Lås op for at flytte/skalere') : t('Lock', 'Lås'), 'L', one.lock ? 'move' : 'lock', () => { one.lock = !one.lock; store.commit(); });
        add(t('Remove floor plan', 'Fjern plantegning'), '', 'trash', C.removePlan, { danger: true });
      } else {
        add(t('Copy', 'Kopiér'), 'Ctrl+C', 'copy', C.copy);
        add(t('Duplicate', 'Dublér'), 'Ctrl+D', 'copy', C.duplicateSelection, { disabled: one && one.kind === 'prices' });
        add(t('Bring to front', 'Placér forrest'), ']', 'up', () => C.order(true));
        add(t('Send to back', 'Placér bagerst'), '[', 'down', () => C.order(false));
        if (admin && ids.some((id) => store.item(id).kind === 'product')) add(t('Save as Shortcut…', 'Gem som genvej…'), '', 'bolt', () => HP.editor.saveShortcut());
        add(t('Delete', 'Slet'), 'Del', 'trash', C.deleteSelection, { danger: true });
      }
      M.push('sep');
    }
    add(t('Undo', 'Fortryd'), 'Ctrl+Z', 'undo', store.undo, { disabled: !store.canUndo() });
    add(t('Redo', 'Annuller fortryd'), 'Ctrl+Y', 'redo', store.redo, { disabled: !store.canRedo() });
    add(t('Paste', 'Indsæt'), 'Ctrl+V', 'page', () => C.paste(x, y), { disabled: !C.canPaste() });
    M.push('sep');
    add(t('Add text here', 'Tilføj tekst her'), 'T', 'text', () => C.addText(x, y));
    add(C.hasPrices() ? t('Hide price list', 'Skjul prisliste') : t('Show price list', 'Vis prisliste'), 'F3', 'tag', C.togglePrices);
    if (C.hasPlan()) add(t('Remove floor plan', 'Fjern plantegning'), '', 'plan', C.removePlan);
    add(t('Select all', 'Markér alt'), 'Ctrl+A', 'layers', C.selectAll);
    add(t('Fit to window', 'Tilpas til vindue'), 'F', 'fit', C.fit);
    if (!d.ci) M.push({ el: HP.panels.scaleStepper() });
    M.push('sep');
    add(t('Save project…', 'Gem projekt…'), 'Ctrl+S', 'folder', HP.panels.projects);
    add(t('Share link…', 'Del link…'), 'Ctrl+Shift+S', 'link', HP.panels.share);
    add(t('Print / PDF', 'Print / PDF'), 'Ctrl+P', 'print', C.print);
    add(t('Clear canvas', 'Ryd lærredet'), '', 'trash', C.clearCanvas, { danger: true, disabled: !d.items.length });
    HP.menu(x, y, M);
  }

  /* ---- templates (Shortcuts) ---- */
  C.capture = () => {
    const d = store.doc, pick = store.sel.size ? d.items.filter((i) => store.sel.has(i.id)) : d.items;
    const items = pick.filter((i) => i.kind === 'product' || i.kind === 'text').map((i) => JSON.parse(JSON.stringify(i)));
    if (!items.length) return null;
    const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y)), ids = new Set(items.map((i) => i.id));
    items.forEach((i) => { i.x -= x0; i.y -= y0; });
    return { items, conns: d.conns.filter((c) => ids.has(c.a.item) && ids.has(c.b.item)).map((c) => JSON.parse(JSON.stringify(c))) };
  };
  C.insertTemplate = (tpl, cx, cy) => {
    const d = store.doc, map = {}, at = cx == null ? centerWorld() : toWorld(cx, cy);
    const w = Math.max(...tpl.items.map((i) => i.x)) + 220, hh = Math.max(...tpl.items.map((i) => i.y)) + 200;
    const missing = tpl.items.filter((i) => i.kind === 'product' && !cat.get(i.pid)).length;
    tpl.items.forEach((i) => { if (i.kind === 'product' && !cat.get(i.pid)) return; const n = JSON.parse(JSON.stringify(i)); n.id = map[i.id] = HP.uid(); n.x = snap(at.x - w / 2 + i.x); n.y = snap(at.y - hh / 2 + i.y); d.items.push(n); });
    (tpl.conns || []).forEach((c) => { if (map[c.a.item] && map[c.b.item]) d.conns.push({ id: HP.uid(), a: { item: map[c.a.item], key: c.a.key }, b: { item: map[c.b.item], key: c.b.key }, cable: c.cable && cat.get(c.cable) ? c.cable : null, shift: c.shift || 0 }); });
    store.sel = new Set(Object.values(map)); store.selConn = null; store.commit();
    if (missing) HP.toast(t(missing + ' product(s) in this Shortcut no longer exist and were skipped.', missing + ' produkt(er) i genvejen findes ikke længere og blev sprunget over.'), { kind: 'warn' });
  };

  /* ---- CI mode + floor plan ---- */
  C.setCI = (on) => { store.doc.ci = on; geom.clear(); store.commit(); };
  C.setCISize = (px, commit) => { store.doc.ciSize = clamp(px, 20, 180); geom.clear(); commit ? store.commit() : render(); };
  C.loadPlan = (file) => {
    if (!file || !/^image\//.test(file.type)) return HP.toast(t('Pick a JPG or PNG image.', 'Vælg et JPG- eller PNG-billede.'), { kind: 'warn' });
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => {
      const k = Math.min(1, 2200 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      store.planSrc = cv.toDataURL('image/jpeg', 0.85); store.savePlan();
      const d = store.doc, s = pageSize(), m = 60, f = Math.min((s.w - m * 2) / cv.width, (s.h - m * 2 - 40) / cv.height);
      d.items = d.items.filter((i) => i.kind !== 'plan');
      d.items.unshift({ id: HP.uid(), kind: 'plan', x: snap((s.w - cv.width * f) / 2), y: snap((s.h - 40 - cv.height * f) / 2), w: Math.round(cv.width * f), h: Math.round(cv.height * f), lock: true });
      if (!d.ci) d.ci = true;
      geom.clear(); store.commit(); C.fit();
      HP.toast(t('Floor plan added and CI mode switched on. Alt-click the plan to move or resize it.', 'Plantegning tilføjet, og CI-tilstand er slået til. Alt-klik på planen for at flytte eller skalere den.'), { ms: 7000 });
    }; im.src = fr.result; };
    fr.readAsDataURL(file);
  };

  /* ================= print ================= */
  C.print = () => {
    const d = store.doc, s = pageSize(), mm = d.orient === 'portrait' ? [210, 297] : [297, 210], k = ((mm[0] * 96) / 25.4) / s.w;
    const total = d.pages * (s.w + GAP) - GAP;
    const outside = d.items.filter((it) => { const g = measure(it), cx = it.x + g.w / 2, cy = it.y + g.h / 2; return cx < 0 || cx > total || cy < 0 || cy > s.h; }).length;
    if (outside) HP.toast(t(outside + ' item(s) are outside the A4 pages and will not be printed.', outside + ' element(er) ligger uden for A4-siderne og bliver ikke printet.'), { kind: 'warn', ms: 7000 });
    store.sel.clear(); store.selConn = null; refreshSel();
    const root = h('#print-root');
    for (let i = 0; i < d.pages; i++) {
      const r = pageRect(i), clone = world.cloneNode(true);
      clone.removeAttribute('id'); clone.classList.remove('wiring');
      clone.style.transform = 'scale(' + k + ') translate(' + -r.x + 'px,' + -r.y + 'px)';
      clone.querySelectorAll('.no-print').forEach((e) => e.remove());
      root.append(h('.sheet', { style: { width: mm[0] + 'mm', height: mm[1] + 'mm' } }, clone));
    }
    const st = h('style', { textContent: '@page{size:A4 ' + (d.orient === 'portrait' ? 'portrait' : 'landscape') + ';margin:0}' });
    document.head.append(st); document.body.append(root); document.body.classList.add('printing');
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
      (world = h('#world.world', null, (pagesEl = h('.layer.pages')), (planEl = h('.layer.plans')), (wiresSvg = svg('svg', { class: 'layer wires' })), (itemsEl = h('.layer.items')), (chipsEl = h('.layer.chips')), (tempSvg = svg('svg', { class: 'layer wires temp' })))),
      (overlay = h('.overlay', null, (selbar = h('#selbar', { hidden: true })), (marqueeEl = h('.marquee')))),
      h('.zoomer', null,
        h('button', { title: t('Zoom out', 'Zoom ud'), onclick: () => C.zoomBy(1 / 1.25) }, icon('minus')),
        (zoomLbl = h('button.zl', { title: t('Reset to 100%', 'Nulstil til 100%'), onclick: () => C.zoomBy(1 / view.z) }, '100%')),
        h('button', { title: t('Zoom in', 'Zoom ind'), onclick: () => C.zoomBy(1.25) }, icon('plus')),
        h('button', { title: t('Fit to window (F)', 'Tilpas til vindue (F)'), onclick: C.fit }, icon('fit'))));
    mount.append(vp);
    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('contextmenu', onContext);
    window.addEventListener('pointermove', (e) => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true });
    vp.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
    vp.addEventListener('dragover', (e) => e.preventDefault());
    vp.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) C.loadPlan(f); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable) { spaceDown = true; vp.classList.add('space'); e.preventDefault(); } if (e.key === 'Escape') cancelWire(); });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; vp.classList.remove('space'); } });
    HP.on('doc', render); HP.on('catalog', render);
    const saved = HP.LS.get('view', null);
    render();
    if (saved && isFinite(saved.z)) { Object.assign(view, saved); applyView(); } else C.fit();
    HP.on('loaded', () => C.fit());
  };
})();
