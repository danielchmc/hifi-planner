/* HiFi Planner v2 — Katalog: a large dialog for browsing the catalogue, laid out like hifiklubben.dk so staff know where things
   are, drawn in HiFi Planner's own style. Top: title, search, sort, close. Menu: the website's sections in its order (HI-FI, HØJTALER, PLADESPILLER, …,
   SYSTEMER, KABLER, TILBEHØR) and TILBUD in red. Under a section: its categories as round pictures. Left: TYPE (the website's
   product types) with counts, price, Vis kun (Tilbud, Bluetooth, WiFi), Tilslutninger (from the ports) and brands. Right:
   product tiles as on the website. Click a tile to select it, double-click to add it straight away; "Tilføj til lærredet"
   (or Enter) adds the selection. Opened with Alt+K, the Katalog button or Shift+Enter in the sidebar search; Esc
   closes. The filters are kept while the page is open, so the seller can go back and forth with a customer. */
(function () {
  const HP = window.HP, { h, t, catalog: cat } = HP;
  const icon = (n, s) => HP.icon(n, s);
  const C = () => HP.canvas;
  const PER = 36;

  // the website's menu order (by section title) and its labels
  const MENU = [['/stereo/', 'Hi-Fi'], ['/hojtalere/', 'Højtaler'], ['/pladespiller/', 'Pladespiller'], ['/horetelefoner/', 'Høretelefoner'],
    ['/surround/', 'Surround'], ['/tv/', 'TV'], ['@systems', 'Systemer'], ['/kabler/', 'Kabler'], ['/tilbehor/', 'Tilbehør']];
  // connections that can be filtered on, worked out from the ports
  const CONNS = [
    ['phono', 'Phono-indgang', (p) => (p.in || []).some((x) => x.sig === 'phono')],
    ['arc', 'HDMI ARC/eARC', (p) => (p.in || []).concat(p.out || []).some((x) => /hdmi-e?arc/.test(x.sig))],
    ['hdmi', 'HDMI-indgang', (p) => (p.in || []).some((x) => x.sig === 'hdmi')],
    ['opt', 'Optisk indgang', (p) => (p.in || []).some((x) => x.sig === 'optical')],
    ['coax', 'Koaksial indgang', (p) => (p.in || []).some((x) => x.sig === 'coax')],
    ['usb', 'USB-DAC', (p) => (p.in || []).some((x) => /^usb/.test(x.sig))],
    ['line', 'Analog indgang', (p) => (p.in || []).some((x) => /^(line|aux|bal)$/.test(x.sig))],
    ['xlr', 'XLR (balanceret)', (p) => (p.in || []).concat(p.out || []).some((x) => x.conn === 'xlr')],
    ['sub', 'Sub-udgang', (p) => (p.out || []).some((x) => x.sig === 'sub')],
    ['pre', 'Pre-out', (p) => (p.out || []).some((x) => x.sig === 'pre')],
    ['spk', 'Højtalerudgang', (p) => (p.out || []).some((x) => x.sig === 'speaker')],
    ['phones', 'Hovedtelefonudgang', (p) => (p.out || []).some((x) => x.sig === 'phones')]];
  const CONNFN = Object.fromEntries(CONNS.map(([k, , f]) => [k, f]));

  // what stays between openings
  const st = { sec: '', cat: '', types: new Set(), brands: new Set(), conns: new Set(), sale: false, bt: false, wifi: false, min: '', max: '', sort: 'rel', q: '', allBrands: false, sel: new Map(), colour: new Map() };
  let root = null, shown = 0, hits = [], io = null;

  const isSys = () => st.sec === '@systems';
  const onSale = (p) => p.was > p.price || (p.vars || []).some((v) => v.was > v.price);
  const words = () => st.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const section = (p) => (p.cats || [])[0] || '';
  const catOf = (p) => (p.cats || [])[1] || '';
  const typeOf = (p) => p.ty || HP.catLabel(HP.catDeepest ? HP.catDeepest(p.cats) : (p.cats || []).slice(-1)[0] || '') || '';
  const sysHay = new WeakMap();
  const sysText = (b) => { if (!sysHay.has(b)) sysHay.set(b, [b.sku, b.brand, b.model, b.type, ...b.parts.map((x) => { const p = cat.get(x.id); return p.brand + ' ' + p.name + ' ' + (p.sku || ''); })].join(' ').toLowerCase()); return sysHay.get(b); };
  const sysParts = (b) => b.parts.reduce((a, x) => a + (HP.priceOf(cat.get(x.id), x.v ? { v: x.v } : null).price || 0) * x.qty, 0);
  const pct = (was, price) => Math.round((1 - price / was) * 100);

  /* ---------- filtering ---------- */
  // every list of options is counted with all the other filters applied, as on the website
  function pool() {
    const w = words();
    if (isSys()) return cat.systems().filter((b) => w.every((x) => sysText(b).includes(x)));
    return cat.products().filter((p) => !p.gone && w.every((x) => p._hay.includes(x)));
  }
  function pass(p, skip) {
    if (isSys()) {
      const b = p;
      if (skip !== 'type' && st.types.size && !st.types.has(b.type)) return false;
      if (skip !== 'brand' && st.brands.size && !st.brands.has(b.brand)) return false;
      if (skip !== 'sale' && st.sale && !(b.was > b.price || sysParts(b) > b.price)) return false;
      if (skip !== 'price' && ((st.min !== '' && b.price < +st.min) || (st.max !== '' && b.price > +st.max))) return false;
      return true;
    }
    if (skip !== 'sec' && st.sec && section(p) !== st.sec) return false;
    if (skip !== 'cat' && st.cat && !(p.cats || []).includes(st.cat)) return false;
    if (skip !== 'type' && st.types.size && !st.types.has(typeOf(p))) return false;
    if (skip !== 'brand' && st.brands.size && !st.brands.has(p.brand)) return false;
    if (skip !== 'sale' && st.sale && !onSale(p)) return false;
    if (skip !== 'bt' && st.bt && !p.bt) return false;
    if (skip !== 'wifi' && st.wifi && !p.wifi) return false;
    if (skip !== 'conn' && [...st.conns].some((k) => !CONNFN[k](p))) return false;
    if (skip !== 'price' && ((st.min !== '' && p.price < +st.min) || (st.max !== '' && p.price > +st.max))) return false;
    return true;
  }
  const count = (list, by) => { const m = new Map(); list.forEach((x) => { const k = by(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };

  /* ---------- building the page ---------- */
  function open(q) {
    HP.stat('Katalog åbnet');
    // a search from the sidebar searches everything, like the website's search page; reopening without one keeps the filters
    if (q != null && q.trim() && q !== st.q) { st.sec = ''; st.cat = ''; st.types.clear(); }
    if (q != null) st.q = q;
    if (!root) build();
    root.hidden = false;
    root.querySelector('.kat-search input').value = st.q;
    render();
    setTimeout(() => { const i = root.querySelector('.kat-search input'); i.focus(); i.select(); }, 30);
  }
  function close() {
    if (!root || root.hidden || root.classList.contains('closing')) return;
    if (HP.reducedMotion()) { root.hidden = true; return; }
    root.classList.add('closing'); setTimeout(() => { root.hidden = true; root.classList.remove('closing'); }, 110);
  }

  function build() {
    const search = h('input', { type: 'search', placeholder: t('Search for products, brands, SKU…', 'Søg efter produkter, mærker, varenummer…'),
      oninput: () => { st.q = search.value; render(); },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (st.sel.size) addSelection(); else search.blur(); } } });
    // a dialog like the app's others: the canvas stays visible (dimmed) behind it; a click outside closes it
    const win = h('.kat-win', { role: 'dialog', 'aria-label': 'Katalog' },
      h('.kat-top', null,
        h('h2.kat-title', null, icon('grid', 16), 'Katalog'),
        h('label.kat-search', null, icon('search', 15), search),
        h('select.kat-sort', { title: t('Sort', 'Sortér'), onchange: (e) => { st.sort = e.target.value; render(); } },
          [['rel', t('Best match', 'Bedste match')], ['pa', t('Price, low to high', 'Pris, lav til høj')], ['pd', t('Price, high to low', 'Pris, høj til lav')], ['name', t('Name A–Z', 'Navn A–Å')], ['brand', t('Brand A–Z', 'Mærke A–Å')]].map(([v, l]) => h('option', { value: v }, l))),
        h('button.icon-btn.kat-close', { title: t('Close (Esc)', 'Luk (Esc)'), onclick: close }, icon('x'))),
      h('nav.kat-menu'), h('.kat-cats'),
      h('.kat-body', null,
        h('aside.kat-side'),
        h('main.kat-main', null, h('.kat-head'), h('.kat-grid'), h('.kat-more'))),
      h('.kat-bar'));
    root = h('.kat-back', { hidden: true, onpointerdown: (e) => { if (e.target === root) close(); } }, win);
    // keys are read on the whole page while the Katalog is open, so Esc works wherever the focus is (also after a filter redraws)
    document.addEventListener('keydown', (e) => { if (root && !root.hidden && !root.classList.contains('closing')) keys(e); }, true);
    document.body.append(root);
    const main = root.querySelector('.kat-main'), more = root.querySelector('.kat-more');
    io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && shown < hits.length) addTiles(); }, { root: main, rootMargin: '0px 0px 600px 0px' }) : null;
    if (io) io.observe(more); else main.addEventListener('scroll', () => { if (shown < hits.length && main.scrollTop + main.clientHeight > main.scrollHeight - 600) addTiles(); });
  }

  function keys(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (st.sel.size) { st.sel.clear(); render(true); } else close(); return; }
    if (e.key === 'Enter' && st.sel.size && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); addSelection(); }
    // the canvas's own shortcuts stay quiet while the Katalog is open (js/main.js checks HP.katalog.isOpen())
  }

  function render(keepScroll) {
    const all = pool();
    drawMenu(all); drawCats(all); drawSide(all);
    hits = all.filter((p) => pass(p));
    sortHits();
    const main = root.querySelector('.kat-main'), grid = root.querySelector('.kat-grid');
    const top = main.scrollTop;
    grid.textContent = ''; shown = 0;
    drawHead();
    if (!hits.length) grid.append(h('.kat-empty', null, t('No products match these filters.', 'Ingen produkter passer til filtrene.'), h('button', { onclick: reset }, t('Clear filters', 'Nulstil filtre'))));
    addTiles();
    while (keepScroll && shown < hits.length && grid.scrollHeight < top + main.clientHeight) addTiles();
    main.scrollTop = keepScroll ? top : 0;
    if (!keepScroll) root.querySelector('.kat-side').scrollTop = 0;
    drawBar();
  }
  function sortHits() {
    const w = words().join(' '), loc = (a, b) => a.localeCompare(b, 'da');
    const name = (x) => isSys() ? cat.systemName(x) : x.brand + ' ' + x.name;
    const rel = (x) => { if (!w) return 0; const n = name(x).toLowerCase(), sku = String(x.sku || '').toLowerCase(); return sku === w ? 0 : sku.startsWith(w) ? 1 : n.includes(w) ? 2 : 3; };
    const by = { pa: (a, b) => a.price - b.price, pd: (a, b) => b.price - a.price, name: (a, b) => loc(isSys() ? name(a) : a.name, isSys() ? name(b) : b.name), brand: (a, b) => loc(a.brand, b.brand) || loc(name(a), name(b)) }[st.sort];
    const idx = new Map(hits.map((x, i) => [x, i]));
    hits.sort(by || ((a, b) => rel(a) - rel(b) || idx.get(a) - idx.get(b)));
  }

  function drawMenu(all) {
    const nav = root.querySelector('.kat-menu'); nav.textContent = '';
    const prods = isSys() ? cat.products().filter((p) => !p.gone && words().every((x) => p._hay.includes(x))) : all;
    const nSys = isSys() ? all.length : cat.systems().filter((b) => words().every((x) => sysText(b).includes(x))).length;
    MENU.forEach(([id, label]) => {
      const n = id === '@systems' ? nSys : prods.filter((p) => section(p) === id).length;
      nav.append(h('button' + (st.sec === id ? '.on' : ''), { onclick: () => { const was = isSys(); st.sec = st.sec === id ? '' : id; st.cat = ''; st.types.clear(); if (was !== isSys()) { st.brands.clear(); st.conns.clear(); } render(); } },
        label, h('span.n', null, n)));
    });
    nav.append(h('span.sp'), h('button.sale' + (st.sale ? '.on' : ''), { onclick: () => { st.sale = !st.sale; render(); } }, t('Sale', 'Tilbud')));
  }

  // a section's categories as round pictures, as on the website: the picture is the category's best-known product
  const catPic = new Map();
  function drawCats(all) {
    const box = root.querySelector('.kat-cats'); box.textContent = '';
    box.hidden = !st.sec || isSys();
    if (box.hidden) return;
    const n = count(all.filter((p) => pass(p, 'cat')), catOf);
    HP.CAT_TREE.find((x) => x[0] === st.sec)?.[1].filter((c) => cat.products().some((p) => catOf(p) === c)).forEach((c) => {
      if (!catPic.has(c)) { const p = cat.products().find((x) => catOf(x) === c && !x.web && !x.gone && (x.img || [])[0]) || cat.products().find((x) => catOf(x) === c && (x.img || [])[0]); catPic.set(c, p ? p.img[0] : ''); }
      box.append(h('button.kat-cat' + (st.cat === c ? '.on' : ''), { disabled: !n.get(c) && st.cat !== c, onclick: () => { st.cat = st.cat === c ? '' : c; st.types.clear(); render(); } },
        h('span.pic', null, catPic.get(c) ? HP.imgEl(catPic.get(c), 'thumb', { loading: 'lazy' }) : null),
        h('span.klbl', null, HP.catLabel(c)), h('span.n', null, n.get(c) || 0)));
    });
  }

  // the left column: collapsible groups as on the website
  const openGroups = new Set(['type', 'price', 'only', 'conn', 'brand']);
  function group(key, title, body) {
    const on = openGroups.has(key);
    return h('section.kat-group' + (on ? '.open' : ''), null,
      h('button.kat-gh', { onclick: () => { on ? openGroups.delete(key) : openGroups.add(key); render(true); } }, title, icon(on ? 'chevron-up' : 'chevron-down', 18)),
      on ? body : null);
  }
  const check = (on, label, n, fn) => h('label.kat-check' + (on ? '.on' : '') + (!n && !on ? '.off' : ''), null,
    h('input', { type: 'checkbox', checked: on, disabled: !n && !on, onchange: fn }), h('span.box'), h('span.l', null, label), h('span.n', null, n));
  function drawSide(all) {
    const side = root.querySelector('.kat-side'); side.textContent = '';
    // TYPE: the website's product types
    const types = count(all.filter((p) => pass(p, 'type')), (x) => isSys() ? x.type : typeOf(x));
    const tl = [...types.keys()].concat([...st.types].filter((x) => !types.has(x))).sort((a, b) => a.localeCompare(b, 'da'));
    side.append(group('type', 'Type', h('.kat-list', null, tl.map((ty) => check(st.types.has(ty), ty, types.get(ty) || 0, () => { st.types.has(ty) ? st.types.delete(ty) : st.types.add(ty); render(true); })))));
    // price
    const num = (k, ph) => h('input', { type: 'number', min: 0, step: 100, placeholder: ph, value: st[k], onchange: (e) => { st[k] = e.target.value === '' ? '' : String(Math.max(0, +e.target.value)); render(true); } });
    side.append(group('price', t('Price', 'Pris'), h('.kat-price', null, num('min', t('From', 'Fra')), h('span', null, '–'), num('max', t('To', 'Til')), h('span.unit', null, 'kr.'))));
    // Vis kun
    const flag = (k, label, fn) => { const n = all.filter((p) => pass(p, k) && fn(p)).length; return check(st[k], label, n, () => { st[k] = !st[k]; render(true); }); };
    side.append(group('only', t('Show only', 'Vis kun'), h('.kat-list', null, flag('sale', t('Sale', 'Tilbud'), isSys() ? (b) => b.was > b.price || sysParts(b) > b.price : onSale),
      isSys() ? null : flag('bt', 'Bluetooth', (p) => p.bt), isSys() ? null : flag('wifi', 'WiFi', (p) => p.wifi))));
    // Tilslutninger
    if (!isSys()) {
      const base = all.filter((p) => pass(p, 'conn'));
      const items = CONNS.map(([k, label, fn]) => [k, label, base.filter((p) => fn(p) && [...st.conns].every((c) => CONNFN[c](p))).length]).filter(([k, , n]) => n || st.conns.has(k));
      if (items.length) side.append(group('conn', t('Connections', 'Tilslutninger'), h('.kat-list', null, items.map(([k, label, n]) => check(st.conns.has(k), label, n, () => { st.conns.has(k) ? st.conns.delete(k) : st.conns.add(k); render(true); })))));
    }
    // brands
    const br = count(all.filter((p) => pass(p, 'brand')), (x) => x.brand);
    const bl = [...br.keys()].concat([...st.brands].filter((x) => !br.has(x))).sort((a, b) => (br.get(b) || 0) - (br.get(a) || 0) || a.localeCompare(b));
    const showB = st.allBrands ? bl : bl.slice(0, 10).concat(bl.slice(10).filter((b) => st.brands.has(b)));
    side.append(group('brand', t('Brand', 'Mærke'), h('.kat-list', null, showB.map((b) => check(st.brands.has(b), b, br.get(b) || 0, () => { st.brands.has(b) ? st.brands.delete(b) : st.brands.add(b); render(true); })),
      bl.length > 10 ? h('button.kat-morelink', { onclick: () => { st.allBrands = !st.allBrands; render(true); } }, st.allBrands ? t('Show fewer', 'Vis færre') : t('Show all ', 'Vis alle ') + bl.length) : null)));
  }

  // number of hits and the active filters as pills that remove themselves
  function drawHead() {
    const head = root.querySelector('.kat-head'); head.textContent = '';
    const pill = (label, fn) => h('button.kat-pill', { onclick: fn }, label, icon('x', 12));
    const pills = [];
    if (st.sec) pills.push(pill((MENU.find((m) => m[0] === st.sec) || [0, st.sec])[1], () => { st.sec = ''; st.cat = ''; st.types.clear(); render(); }));
    if (st.cat) pills.push(pill(HP.catLabel(st.cat), () => { st.cat = ''; render(); }));
    st.types.forEach((x) => pills.push(pill(x, () => { st.types.delete(x); render(); })));
    if (st.sale) pills.push(pill(t('Sale', 'Tilbud'), () => { st.sale = false; render(); }));
    if (st.bt) pills.push(pill('Bluetooth', () => { st.bt = false; render(); }));
    if (st.wifi) pills.push(pill('WiFi', () => { st.wifi = false; render(); }));
    st.conns.forEach((k) => pills.push(pill(CONNS.find((c) => c[0] === k)[1], () => { st.conns.delete(k); render(); })));
    if (st.min !== '' || st.max !== '') pills.push(pill((st.min || '0') + '–' + (st.max || '∞') + ' kr.', () => { st.min = st.max = ''; render(); }));
    st.brands.forEach((b) => pills.push(pill(b, () => { st.brands.delete(b); render(); })));
    head.append(h('button.kat-filters', { onclick: () => root.classList.toggle('show-side') }, t('Filters', 'Filtre') + (pills.length ? ' (' + pills.length + ')' : '')), h('span.kat-count', null, hits.length + ' ' + (isSys() ? t('systems', 'systemer') : t('products', 'produkter'))), ...pills,
      ...(pills.length ? [h('button.kat-reset', { onclick: reset }, t('Clear all', 'Nulstil'))] : []));
  }
  function reset() { Object.assign(st, { sec: '', cat: '', sale: false, bt: false, wifi: false, min: '', max: '' }); st.types.clear(); st.brands.clear(); st.conns.clear(); render(); }

  /* ---------- tiles ---------- */
  const key = (x) => (isSys() ? 's:' + x.sku : 'p:' + x.id);
  function addTiles() {
    const grid = root.querySelector('.kat-grid'), more = root.querySelector('.kat-more');
    hits.slice(shown, shown + PER).forEach((x, i) => { const el = isSys() ? sysTile(x) : prodTile(x); if (!shown && i < 15) { el.classList.add('in'); el.style.animationDelay = i * 14 + 'ms'; } grid.append(el); });
    shown = Math.min(hits.length, shown + PER);
    more.hidden = shown >= hits.length;
  }
  function tileShell(k, kids, add) {
    const on = st.sel.has(k);
    const el = h('article.kat-tile' + (on ? '.sel' : ''), { data: { k }, tabIndex: 0,
      onclick: (e) => { if (e.target.closest('.sw')) return; toggle(k, el); },
      ondblclick: (e) => { if (e.target.closest('.sw')) return; st.sel.delete(k); add(); close(); },
      onkeydown: (e) => { if (e.key === ' ') { e.preventDefault(); toggle(k, el); } } }, kids,
      h('label.kat-pick', { onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: on, onchange: () => toggle(k, el) }), h('span.box'), t('Select', 'Vælg')));
    return el;
  }
  function toggle(k, el) {
    if (st.sel.has(k)) st.sel.delete(k); else st.sel.set(k, { k, v: el.dataset.v || undefined });
    el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 180);
    el.classList.toggle('sel', st.sel.has(k)); const c = el.querySelector('.kat-pick input'); if (c) c.checked = st.sel.has(k);
    drawBar();
  }
  function priceBlock(price, was) {
    return h('.kat-price-l', null, h('b' + (was ? '.red' : ''), null, HP.money(price)), was ? h('s', null, t('Before ', 'Før ') + HP.money(was)) : null);
  }
  function prodTile(p) {
    // colour: the one picked on this tile, else the one the search points at, else the first
    const k = key(p), vs = p.vars || [];
    const cur = vs.find((x) => x.sku === st.colour.get(p.id)) || HP.matchVariant(p, words()) || null;
    const pr = HP.priceOf(p, cur ? { v: cur.sku } : null), img = (cur && cur.img) || (p.img || [])[0] || '';
    const pic = h('.kat-pic', null, img ? HP.imgEl(img, 'card', { loading: 'lazy' }) : h('span.noimg', null, icon('page', 28)),
      pr.was > pr.price ? h('span.kat-save', null, t('Save ', 'Spar ') + pct(pr.was, pr.price) + '%') : null);
    const shown = cur || vs[0];
    const sw = vs.length > 1 ? h('.kat-sw', null, vs.slice(0, 5).map((x) => h('button.sw' + (shown && shown.sku === x.sku ? '.on' : ''), { title: x.label,
      onclick: (e) => { e.stopPropagation(); st.colour.set(p.id, x.sku); if (st.sel.has(k)) st.sel.get(k).v = x.sku; e.target.closest('.kat-tile').replaceWith(prodTile(p)); drawBar(); } },
      x.img ? HP.imgEl(x.img, 'thumb', { loading: 'lazy' }) : h('i', { style: { background: x.hex || 'var(--line)' } }))), vs.length > 5 ? h('span.more', null, '+' + (vs.length - 5)) : null) : null;
    const el = tileShell(k, [pic, sw,
      h('.kat-brand', null, p.brand), h('.kat-name', null, p.name), h('.kat-type', null, typeOf(p) + (cur && vs.length > 1 ? ' · ' + cur.label : '')),
      priceBlock(pr.price, pr.was > pr.price ? pr.was : 0),
      h('.kat-tags', null, p.bt ? h('span', null, 'BT') : null, p.wifi ? h('span', null, 'WiFi') : null, p.web ? h('span.warn', null, t('No ports yet', 'Ingen porte endnu')) : null)],
      () => { C().addProductCenter(p.id, el.dataset.v || undefined); HP.toast(p.brand + ' ' + p.name + t(' added', ' tilføjet'), { kind: 'ok' }); });
    if (cur) el.dataset.v = cur.sku;
    return el;
  }
  function sysTile(b) {
    const parts = sysParts(b), was = Math.max(parts, b.was || 0);
    const pic = h('.kat-pic', null, b.img ? HP.imgEl(b.img, 'card', { loading: 'lazy' }) : h('span.noimg', null, icon('page', 28)), was > b.price ? h('span.kat-save', null, t('Save ', 'Spar ') + HP.money(was - b.price)) : null);
    return tileShell(key(b), [pic, h('.kat-brand', null, b.brand), h('.kat-name', null, cat.systemName(b).replace(new RegExp('^' + b.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '')), h('.kat-type', null, b.type), priceBlock(b.price, was > b.price ? was : 0),
      h('.kat-parts', null, b.parts.map((x) => (x.qty > 1 ? x.qty + '× ' : '') + cat.get(x.id).name).join(' · '))],
    () => C().addSystem(b.sku));
  }

  /* ---------- adding ---------- */
  function drawBar() {
    const bar = root.querySelector('.kat-bar'); bar.textContent = '';
    bar.hidden = !st.sel.size;
    if (!st.sel.size) return;
    let sum = 0;
    st.sel.forEach(({ k, v }) => { if (k[0] === 's') { const b = cat.system(k.slice(2)); sum += b ? b.price : 0; } else { const p = cat.get(k.slice(2)); if (p) sum += HP.priceOf(p, v ? { v } : null).price; } });
    bar.append(h('span.kat-sel', null, st.sel.size + ' ' + t('selected', 'valgt') + ' · ' + HP.money(sum)),
      h('span.kat-hint', null, t('Click selects · double-click adds at once', 'Klik vælger · dobbeltklik tilføjer med det samme')),
      h('button.btn.kat-clear', { onclick: () => { st.sel.clear(); render(true); } }, t('Clear selection', 'Fravælg')),
      h('button.btn.primary.kat-add', { onclick: addSelection }, icon('plus', 14), t('Add ', 'Tilføj ') + st.sel.size + t(' to the canvas', ' til lærredet'), h('kbd', null, '⏎')));
  }
  function addSelection() {
    const prods = [], syss = [];
    st.sel.forEach(({ k, v }) => (k[0] === 's' ? syss.push(k.slice(2)) : prods.push({ id: k.slice(2), v })));
    if (!prods.length && !syss.length) return;
    st.sel.clear(); close();
    if (prods.length === 1 && !syss.length) C().addProductCenter(prods[0].id, prods[0].v);
    else if (prods.length) C().addProducts(prods);
    const r = document.getElementById('viewport')?.getBoundingClientRect();
    syss.forEach((sku, i) => C().addSystem(sku, r ? r.left + r.width / 2 + i * 60 : undefined, r ? r.top + r.height / 2 + i * 60 : undefined));
    if (prods.length > 1) HP.toast(prods.length + t(' products added', ' produkter tilføjet'), { kind: 'ok' });
  }

  HP.katalog = { open, close, isOpen: () => !!root && !root.hidden };
})();
