/* HiFi Planner v2 — app shell: top bar, sidebar (products + Shortcuts), pickers, projects, help, settings, login. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, icon, LS } = HP;
  const Pn = (HP.panels = {});
  const C = () => HP.canvas;

  /* ---------- shared: product row + drag from a list onto the canvas ---------- */
  // v: a colour variant to show (picture, colour name and price of that colour)
  /* A product row in a list: the picture, then two lines.
       name ……………………  price          (the price gets its own column, so it is never cut off; red when on sale)
       brand · size +3 ⓑ ⓦ          −48%   (the discount; the old price on hover, or struck if under 10 %)
     v: a colour variant to show (picture, colour name and price of that colour). grp/opt: a cable's lengths (see cableGroup). */
  const pct = (was, now) => Math.round((1 - now / was) * 100);
  function rowInfo(name, sub, meta, price, o) {
    o = o || {};
    const sale = o.was > price;
    return h('.pinfo.pgrid', null,
      h('.pname', null, name),
      price ? h('.pprice' + (sale ? '.sale' : ''), null, o.from ? h('small', null, t('from ', 'fra ')) : null, HP.money(price), o.unit ? h('small', null, ' ' + o.unit) : null) : h('span'),
      h('.psub', null, h('span.pbrand', null, sub), meta && meta.length ? h('span.pm', null, meta) : null),
      // a real discount shows as −48% (the old price on hover, to leave the brand room); a small one as the old price, struck
      sale ? h('.pwas', { title: t('Before ', 'Før ') + HP.money(o.was) }, pct(o.was, price) >= 10 ? h('span.poff', null, '−' + pct(o.was, price) + '%') : h('s', null, HP.money(o.was))) : h('span'));
  }
  function productRow(p, extra, v, grp, opt) {
    const price = v ? v.price : p.price, was = v ? v.was || 0 : p.was || 0;
    const icons = [p.gone && h('span.gone-ic', { title: t('Discontinued: no longer on hifiklubben.dk', 'Udgået: ikke længere på hifiklubben.dk') }, icon('warn', 13)), p.bt && icon('bt', 13), p.wifi && icon('wifi', 13)].filter(Boolean);
    if (grp) { // a cable's lengths: the cable's name, its price "fra" the cheapest length (or per metre), the length added as a label
      const base = C().stripLen(p.name) || p.name;
      const lab = grp.metre ? h('span.nvar-txt', null, t('per metre', 'pr. meter'))
        : h('span.nvar-txt', { title: grp.opts.map((o) => o.label + ' · ' + HP.money(o.price)).join('\n') }, (opt ? opt.label : '') + ' +' + (grp.opts.length - 1));
      return h('.prow', { data: { id: p.id } },
        h('.thumb', null, HP.imgEl((p.img || [])[0] || '', 'thumb', { loading: 'lazy' })),
        rowInfo(base, p.brand, [lab, ...icons], grp.metre ? p.price : grp.min, { from: !grp.metre && grp.opts.length > 1, unit: grp.metre ? '/ m' : '' }),
        extra ? h('.pmeta', null, extra) : null);
    }
    const vars = p.vars || [];
    const varEl = vars.length > 1 && (HP.canvas.varStyle(p) === 'pill'
      // not colours (TV sizes, models, lengths): the range as text instead of dots that all look alike
      ? h('span.nvar-txt', { title: vars.map((x) => x.label).join(', ') }, (v ? v.label : vars[0].label) + ' +' + (vars.length - 1))
      : h('span.nvar', { title: vars.map((x) => x.label).join(', ') }, vars.slice(0, 4).map((x) => h('i' + (v && x.sku === v.sku ? '.on' : ''), { style: { background: HP.site.swatch(x) } }))));
    return h('.prow' + (v ? '.isvar' : ''), { data: { id: p.id } },
      h('.thumb', null, HP.imgEl((v && v.img) || (p.img || [])[0] || (vars[0] || {}).img || '', 'thumb', { loading: 'lazy' })),
      rowInfo([p.name, v && h('span.vlabel', null, ' · ' + v.label)], v ? v.sku : p.brand, [varEl, ...icons].filter(Boolean), price,
        { was, from: !v && vars.length > 1 && new Set(vars.map((x) => x.price)).size > 1 }),
      extra ? h('.pmeta', null, extra) : null);
  }
  // a system (website bundle): its picture, name, the parts, the bundle price and what it saves against the parts one by one
  const sysParts = (b) => b.parts.reduce((a, x) => a + (HP.priceOf(cat.get(x.id), x.v ? { v: x.v } : null).price || 0) * x.qty, 0);
  function systemRow(b) {
    const parts = sysParts(b), was = Math.max(parts, b.was || 0);
    return h('.prow.sysrow', { data: { sku: b.sku } },
      h('.thumb', null, HP.imgEl(b.img || '', 'thumb', { loading: 'lazy' })),
      h('.pcol', null, rowInfo(cat.systemName(b), b.type, null, b.price, { was }),
        h('.sysparts', null, b.parts.map((x) => (x.qty > 1 ? x.qty + '× ' : '') + cat.get(x.id).name).join(' · '))));
  }
  /* Drag a product or Shortcut from the sidebar onto the canvas.
     Mouse: drag, or click to add. Touch: the list scrolls normally, a tap adds, a long-press picks it up for dragging. */
  const narrow = () => matchMedia('(max-width: 1024px)').matches;
  function listDrag(e, label, onDrop, onClick, hover) {
    if (e.button !== 0) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen', src = e.currentTarget;
    const sx = e.clientX, sy = e.clientY; let ghost = null, armed = !touch, cancelled = false, timer = 0;
    const startGhost = () => {
      ghost = h('.drag-ghost', null, label); document.body.append(ghost); document.body.classList.add('dragging');
      if (narrow()) Pn.drawer(false); // the drawer covers the canvas: slide it away so there is somewhere to drop
    };
    const block = (ev) => { if (armed) ev.preventDefault(); }; // once picked up, stop the list from scrolling
    const mv = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!armed) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { clearTimeout(timer); cancelled = true; } return; } // a scroll
      if (!ghost) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; startGhost(); }
      ghost.style.transform = 'translate(' + (ev.clientX + 14) + 'px,' + (ev.clientY + (touch ? -44 : 14)) + 'px)';
      hover && hover(ev.clientX, ev.clientY);
    };
    const end = (ev, cancel) => {
      if (ev.pointerId !== e.pointerId) return;
      clearTimeout(timer); src.classList.remove('lifted');
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', can); src.removeEventListener('touchmove', block);
      if (ghost) { ghost.remove(); document.body.classList.remove('dragging'); hover && hover(null); if (!cancel) onDrop(ev.clientX, ev.clientY); }
      else if (!cancel && !cancelled) { onClick(); if (touch && narrow()) Pn.drawer(false); }
    };
    const up = (ev) => end(ev, false), can = (ev) => end(ev, true);
    if (touch) {
      src.addEventListener('touchmove', block, { passive: false });
      timer = setTimeout(() => { if (cancelled) return; armed = true; src.classList.add('lifted'); if (navigator.vibrate) navigator.vibrate(12); }, 380);
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', can);
  }
  const inViewport = (cx, cy) => { const r = document.getElementById('viewport').getBoundingClientRect(); return cx > r.left && cx < r.right && cy > r.top && cy < r.bottom; };

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    let tab = LS.get('tab', 'products'), group = '', sub = '', shown = 0, rows = [], hits = [];
    const flags = { sale: false, bt: false, wifi: false };
    const PER = 30; // rows built per step: more are added as the list scrolls near its end, so only rows (and thumbnails) in reach load
    const search = h('input#sb-search', { type: 'search', placeholder: t('Search name, brand, SKU, colour, port…', 'Søg navn, brand, SKU, farve, port…'), oninput: () => { filter(); },
      onkeydown: (e) => searchKeys(e) });
    // While there is a search, the first result is highlighted, so a SKU + Enter adds that product at once; ↓/↑ move the highlight.
    // Enter adds the highlighted result to the canvas; the search stays as it is. Shift+Enter (or Enter with no
    // search or no results) opens the Katalog with the same search; Esc goes back to the canvas.
    let hl = -1;
    const rowEls = () => [...list.querySelectorAll('.prow')];
    const light = (i) => { const els = rowEls(); hl = Math.max(-1, Math.min(i, els.length - 1)); els.forEach((r, j) => r.classList.toggle('hl', j === hl)); if (hl >= 0) els[hl].scrollIntoView({ block: 'nearest' }); };
    function searchKeys(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.key === 'ArrowDown' && hl >= rowEls().length - 2 && shown < hits.length) addRows();
        light(e.key === 'ArrowDown' ? hl + 1 : hl - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) return HP.katalog.open(search.value); // Shift+Enter: the same search in the Katalog
        const r = hl >= 0 && rowEls()[hl];
        if (r && r._add) { r._add(); search.focus(); } // the search and its results stay, so Enter again adds another one
        else HP.katalog.open(search.value);
      }
    }
    const katBtn = h('button.kat-open', { title: t('Open the Katalog (Alt+K, or Shift+Enter in the search)', 'Åbn Katalog (Alt+K, eller Shift+Enter i søgningen)'), onclick: () => HP.katalog.open(search.value) }, icon('grid', 14), h('span', null, t('Katalog', 'Katalog')));
    const brandSel = h('select', { onchange: () => { filter(); }, title: 'Brand' });
    const sortSel = h('select', { onchange: () => { filter(); }, title: t('Sort', 'Sortér') },
      [['rel', t('Best match', 'Bedste match')], ['pa', t('Price, low to high', 'Pris, lav til høj')], ['pd', t('Price, high to low', 'Pris, høj til lav')], ['name', t('Name A–Z', 'Navn A–Å')], ['brand', t('Brand A–Z', 'Brand A–Å')]].map(([v, l]) => h('option', { value: v }, l)));
    // one compact row: section, its types/categories, sort. The brand filter and the Sale/Bluetooth/WiFi toggles live in the Katalog,
    // which has room for them; the sidebar is for finding a product quickly and dragging it onto the canvas.
    const grpSel = h('select.grp', { title: t('Section', 'Sektion'), onchange: () => { group = grpSel.value; sub = ''; filter(); } });
    const subSel = h('select.sub', { title: t('Type', 'Type'), onchange: () => { sub = subSel.value; filter(); } });
    // × next to the section and category: back to all sections in one press, keeping the search (and the focus in it)
    const resetGroup = () => { group = ''; sub = ''; filter(); search.focus(); };
    const selX = h('button.sel-x', { type: 'button', title: t('Show all sections', 'Vis alle sektioner'), 'aria-label': t('Show all sections', 'Vis alle sektioner'), onclick: resetGroup }, icon('x', 14));
    const count = h('span.count');
    const list = h('.plist#sb-list');
    const more = h('.more'); // sentinel at the end of the list: when it scrolls into view the next rows are added
    const scList = h('.sclist');
    const tabs = h('.tabs', null,
      h('button', { data: { tab: 'products' }, onclick: () => setTab('products') }, t('Products', 'Produkter')),
      h('button#tab-shortcuts', { data: { tab: 'shortcuts' }, onclick: () => setTab('shortcuts') }, icon('bolt', 14), t('Shortcuts', 'Genveje')));
    const prodPane = h('.pane', null, h('.filters', null, h('.searchbox', null, icon('search', 15), search, katBtn), h('.selrow.slim', null, grpSel, subSel, selX)),
      h('.listhead', null, count, sortSel), list);
    list.title = matchMedia('(pointer: coarse)').matches ? t('Tap to add · hold to drag', 'Tryk for at tilføje · hold for at trække') : t('Drag onto canvas, or click', 'Træk ind på lærredet, eller klik');
    const scPane = h('.pane', null, scList);
    const el = h('aside#sidebar', null, h('button.icon-btn.drawer-x', { title: t('Close', 'Luk'), onclick: () => Pn.drawer(false) }, icon('x')), tabs, prodPane, scPane);

    function setTab(x) { tab = x; LS.set('tab', x); tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === x)); prodPane.hidden = x !== 'products'; scPane.hidden = x !== 'shortcuts'; }
    function fillSelects() {
      const keepBrand = brandSel.value;
      brandSel.textContent = ''; brandSel.append(h('option', { value: '' }, t('All brands', 'Alle brands')));
      [...new Set(cat.list.map((p) => p.brand))].sort((a, b) => a.localeCompare(b)).forEach((b) => brandSel.append(h('option', { value: b }, b)));
      brandSel.value = keepBrand;
    }
    const groupOf = (g) => (HP.CAT_TREE.find((x) => x[0] === g) || [0, []])[1];
    const inGroup = (p, g) => !g || (p.cats || []).some((c) => groupOf(g).includes(c));
    const onSale = (p) => p.was > p.price || (p.vars || []).some((v) => v.was > v.price);
    // chips show how many products each choice would give with the other filters as they are
    function drawChips(base, sysBase) {
      const opt = (v, label, n, on) => h('option', { value: v, disabled: !on && !n }, label + (n != null ? '  (' + n + ')' : ''));
      grpSel.textContent = ''; subSel.textContent = '';
      grpSel.append(opt('', t('All sections', 'Alle sektioner'), base.length, !group));
      HP.CAT_TREE.forEach(([g]) => grpSel.append(opt(g, HP.catLabel(g), base.filter((p) => inGroup(p, g)).length, group === g)));
      // hifiklubben.dk's bundles: dropped as a whole system, wired
      if (sysBase) grpSel.append(opt(SYS, t('Systems', 'Systemer'), sysBase.length, group === SYS));
      grpSel.value = group;
      if (group === SYS) {
        subSel.append(opt('', t('All types', 'Alle typer'), sysBase.length, true));
        [...new Set(sysBase.map((b) => b.type))].sort((a, b) => sysBase.filter((x) => x.type === b).length - sysBase.filter((x) => x.type === a).length)
          .forEach((ty) => subSel.append(opt(ty, ty, sysBase.filter((b) => b.type === ty).length, sub === ty)));
      } else if (group) {
        const inG = base.filter((p) => inGroup(p, group));
        subSel.append(opt('', t('All categories', 'Alle kategorier'), inG.length, true));
        groupOf(group).forEach((c) => { const n = inG.filter((p) => (p.cats || []).includes(c)).length; if (n || sub === c) subSel.append(opt(c, HP.catLabel(c), n, sub === c)); });
      }
      subSel.value = sub;
      subSel.hidden = !group;
      selX.hidden = !group;
    }
    const flagFn = { sale: onSale, bt: (p) => p.bt, wifi: (p) => p.wifi };
    const arm = () => { const s = C().stamp && C().stamp(); rows.forEach(({ p, r }) => r.classList.toggle('armed', !!s && s.key === p.id)); };
    HP.on('stamp', arm);
    function buildList() { filter(); }
    // relevance: SKU or name starting with the search, then name/brand containing it, discontinued last
    const score = (p, words, v) => {
      if (!words.length) return p.gone ? 9 : 0;
      const w = words.join(' '), name = (p.brand + ' ' + p.name).toLowerCase(), skus = [p.sku, ...(p.vars || []).map((x) => x.sku)].map((x) => String(x || '').toLowerCase());
      let s = skus.some((x) => x === w) ? 0 : skus.some((x) => x.startsWith(w)) ? 1 : p.name.toLowerCase().startsWith(w) || name.startsWith(w) ? 2 : name.includes(w) ? 3 : 4;
      if (v) s -= 0.5;
      return s + (p.gone ? 9 : 0);
    };
    const SYS = '@systems', sysHay = new WeakMap();
    const hayOf = (b) => { if (!sysHay.has(b)) sysHay.set(b, [b.sku, b.brand, b.model, b.type, ...b.parts.map((x) => { const p = cat.get(x.id); return p.brand + ' ' + p.name + ' ' + (p.sku || ''); })].join(' ').toLowerCase()); return sysHay.get(b); };
    function filter() {
      hl = -1;
      const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean), bv = brandSel.value;
      // every product, cables included: a cable dropped on a wire (or added with a connection selected) goes on that connection
      const base = cat.list.filter((p) => cat.findable(p, words) && words.every((w) => cat.matchWord(p, w)) && (!bv || p.brand === bv));
      const sysAll = cat.systems();
      const sysBase = sysAll.length ? sysAll.filter((b) => words.every((w) => hayOf(b).includes(w)) && (!bv || b.brand === bv || b.parts.some((x) => cat.get(x.id).brand === bv))) : null;
      if (group === SYS && !sysBase) group = '';
      drawChips(base, sysBase);
      if (group === SYS) {
        const so = sortSel.value, loc = (a, b) => a.localeCompare(b, 'da');
        hits = sysBase.filter((b) => (!sub || b.type === sub) && (!flags.sale || b.was > b.price)).map((b, i) => ({ sys: b, i, price: b.price,
          s: !words.length ? 0 : b.sku.toLowerCase() === words.join(' ') ? 0 : cat.systemName(b).toLowerCase().includes(words.join(' ')) ? 1 : 2 }));
        hits.sort(so === 'pa' ? (a, b) => a.price - b.price : so === 'pd' ? (a, b) => b.price - a.price : so === 'name' || so === 'brand' ? (a, b) => loc(cat.systemName(a.sys), cat.systemName(b.sys)) : (a, b) => a.s - b.s || a.i - b.i);
        shown = 0; rows = [];
        list.textContent = ''; list.scrollTop = 0;
        if (!hits.length) list.append(h('.empty', null, t('No systems match.', 'Ingen systemer passer.')));
        addRows();
        return;
      }
      hits = base.filter((p) => inGroup(p, group) && (!sub || (p.cats || []).includes(sub)) && Object.keys(flags).every((f) => !flags[f] || flagFn[f](p)))
        .map((p, i) => { const v = HP.matchVariant(p, words); return { p, v, i, s: score(p, words, v), price: (v ? v.price : p.price) || 0 }; });
      // a cable's lengths are one row (like a product's variants), at the length searched for, else the length used last
      { const seen = new Set(), out = [];
        hits.forEach((x) => {
          const G = cat.hasLengths(x.p) && cat.cableGroup(x.p); if (!G) return x.p.lenGone && cat.cableGroup(x.p) && cat.cableGroup(x.p).rep !== x.p ? null : out.push(x);
          if (seen.has(G.key)) return; seen.add(G.key);
          if (G.metre) return out.push(Object.assign({}, x, { p: G.rep, grp: G, price: G.rep.price || 0 }));
          const o = cat.pickOpt(G, words), p = cat.get(o.id);
          out.push(Object.assign({}, x, { p, grp: G, opt: o, price: o.price || 0 }));
        });
        hits = out; }
      const so = sortSel.value, loc = (a, b) => a.localeCompare(b, 'da');
      hits.sort(so === 'pa' ? (a, b) => !!a.p.gone - !!b.p.gone || a.price - b.price : so === 'pd' ? (a, b) => !!a.p.gone - !!b.p.gone || b.price - a.price
        : so === 'name' ? (a, b) => loc(a.p.name, b.p.name) : so === 'brand' ? (a, b) => loc(a.p.brand, b.p.brand) || loc(a.p.name, b.p.name) : (a, b) => a.s - b.s || a.i - b.i);
      shown = 0; rows = [];
      list.textContent = ''; list.scrollTop = 0;
      if (!hits.length) {
        const elsewhere = group && words.length && base.length; // the search finds something outside the chosen section
        list.append(h('.empty', null, t('No products match.', 'Ingen produkter passer.'),
          elsewhere ? h('button.btn.sm.empty-all', { type: 'button', onclick: resetGroup }, t('Search all sections', 'Søg i alle sektioner')) : null));
      }
      addRows();
    }
    // append the next PER rows; the sentinel goes after them, and the observer adds more when it comes into view
    function addRows() {
      more.remove();
      const first = !shown;
      hits.slice(shown, shown + PER).forEach(({ p, v, sys, grp, opt }, i) => {
        const anim = (r) => { if (first && i < 12) { r.classList.add('in'); r.style.animationDelay = i * 12 + 'ms'; } };
        if (sys) {
          const r = systemRow(sys);
          r._add = () => C().addSystem(sys.sku); anim(r);
          r.addEventListener('pointerdown', (e) => listDrag(e, cat.systemName(sys), (x, y) => C().addSystem(sys.sku, x, y), () => { C().addSystem(sys.sku); if (narrow()) Pn.drawer(false); }));
          list.append(r);
          return;
        }
        const r = productRow(p, null, v, grp, opt); anim(r);
        // a search that points at one colour (part of its SKU, or its colour name) shows and adds that colour
        const vsku = (v && v.sku) || (opt && opt.lv) || undefined; // a colour, or a cable length without a card of its own
        // a cable with a connection selected goes on that connection; anything else is added as a card
        const onConn = () => p.cable && store.selConn && store.doc.conns.some((c) => c.id === store.selConn);
        const nm = grp && opt ? (C().stripLen(p.name) || p.name) + ' ' + opt.label : grp ? C().stripLen(p.name) || p.name : p.name;
        r._add = () => { if (onConn()) return C().setConnCable(store.selConn, p.id, vsku); C().addProductCenter(p.id, vsku); HP.toast(p.brand + ' ' + nm + t(' added', ' tilføjet'), { kind: 'ok', ms: 1800 }); };
        r.addEventListener('pointerdown', (e) => listDrag(e, nm, (x, y) => C().dropProduct(p.id, x, y, vsku), () => { if (onConn()) return C().setConnCable(store.selConn, p.id, vsku); C().addProductCenter(p.id, vsku); if (narrow()) Pn.drawer(false); }, (x, y) => C().dragHover(x, y, p.id)));
        list.append(r);
        rows.push({ p, r });
      });
      shown = Math.min(hits.length, shown + PER);
      const unit = group === SYS ? t('systems', 'systemer') : t('products', 'produkter');
      count.textContent = (hits.length && shown < hits.length ? t('Showing ', 'Viser ') + shown + ' ' + t('of', 'af') + ' ' : '') + hits.length + ' ' + unit;
      if (hl < 0 && search.value.trim() && hits.length) light(0);
      if (shown < hits.length) list.append(more);
      arm();
    }
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && shown < hits.length) addRows(); }, { root: list, rootMargin: '0px 0px 400px 0px' }) : null;
    if (io) io.observe(more);
    else list.addEventListener('scroll', () => { if (shown < hits.length && list.scrollTop + list.clientHeight > list.scrollHeight - 400) addRows(); });
    function buildShortcuts() {
      scList.textContent = '';
      if (HP.isAdmin()) scList.append(h('button.btn.block', { onclick: () => HP.editor.saveShortcut() }, icon('plus', 14), t('Save canvas / selection as Shortcut', 'Gem lærred / markering som genvej')));
      if (!cat.templates.length) scList.append(h('.empty', null, t('No Shortcuts yet. An admin can save a system from the canvas as a Shortcut.', 'Ingen genveje endnu. En admin kan gemme et system fra lærredet som genvej.')));
      cat.templates.forEach((tp) => {
        const ids = [...new Set(tp.items.map((i) => (i.kind === 'product' ? i.pid : i.kind === 'mark' && i.k[0] !== '@' ? i.k : null)).filter(Boolean))];
        const prods = ids.map((id) => cat.get(id)).filter(Boolean), nMarks = tp.items.filter((i) => i.kind === 'mark').length, nRooms = tp.items.filter((i) => i.kind === 'zone').length;
        const card = h('.sc', null,
          h('.sc-thumbs', null, prods.slice(0, 4).map((p) => HP.imgEl((p.img || [])[0] || '', 'thumb'))),
          h('.sc-name', null, tp.name), tp.desc && h('.sc-desc', null, tp.desc),
          h('.sc-meta', null, [prods.length + ' ' + t('products', 'produkter'), (tp.conns || []).length && (tp.conns || []).length + ' ' + t('connections', 'forbindelser'),
            nMarks && nMarks + ' ' + t('marks', 'mærker'), nRooms && nRooms + ' ' + t(nRooms === 1 ? 'room' : 'rooms', 'rum'), tp.s && tp.s.ci && 'CI'].filter(Boolean).join(' · ')),
          HP.isAdmin() && h('.sc-admin', null,
            h('button.icon-btn', { title: t('Rename', 'Omdøb'), onpointerdown: (e) => e.stopPropagation(), onclick: () => HP.editor.saveShortcut(tp) }, icon('edit', 14)),
            h('button.icon-btn', { title: t('Delete', 'Slet'), onpointerdown: (e) => e.stopPropagation(), onclick: () => HP.confirm(t('Delete Shortcut "' + tp.name + '"?', 'Slet genvejen "' + tp.name + '"?'), t('Delete', 'Slet'), () => cat.removeTemplate(tp.id)) }, icon('trash', 14))));
        card.addEventListener('pointerdown', (e) => listDrag(e, tp.name, (x, y) => inViewport(x, y) && C().insertTemplate(tp, x, y), () => { C().insertTemplate(tp); if (narrow()) Pn.drawer(false); }));
        scList.append(card);
      });
    }
    fillSelects(); buildList(); buildShortcuts(); setTab(tab);
    HP.on('catalog', () => { fillSelects(); buildList(); buildShortcuts(); });
    Pn.showTab = setTab;
    Pn.focusSearch = () => { setTab('products'); search.focus(); search.select(); };
    // a key typed on the canvas starts a new search with that character (on a narrow screen the product drawer opens)
    Pn.typeSearch = (ch) => { setTab('products'); if (narrow()) Pn.drawer(true); search.value = ch; search.focus(); search.setSelectionRange(1, 1); filter(); };
    return el;
  }

  /* ---------- top bar ---------- */
  /* on screens up to 1024 px the sidebar is a drawer over the canvas */
  Pn.drawer = (open) => {
    const on = open === undefined ? !document.body.classList.contains('drawer-open') : !!open;
    document.body.classList.toggle('drawer-open', on);
    if (on && !matchMedia('(pointer: coarse)').matches) setTimeout(() => { const s = document.getElementById('sb-search'); if (s) s.focus(); }, 200);
  };

  /* ---------- top bar ----------
     Fil ▾ (the proposal: new, rename, projects, share, page, print, price adjustments) · name · undo/redo · Tekst, Prisliste, Relaterede
     produkter, CI · card size · Lag · Print | Admin ▾ (admins) · the seller ▾ (help, language, theme, settings, switch seller).
     On phones everything is in ⋯ (moreMenu). */
  Pn.toggleTheme = () => {
    const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = d; LS.set('theme', d); HP.emit('theme');
  };
  const rename = () => { const d = store.doc, v = prompt(t('Proposal name (shown on the printout)', 'Tilbuddets navn (vises på printet)'), d.name || ''); if (v !== null) { d.name = v.trim(); store.commit(); } };
  const flipPage = () => { const d = store.doc; d.orient = d.orient === 'portrait' ? 'landscape' : 'portrait'; store.commit(); C().fit(); };
  const fileItems = () => {
    const d = store.doc;
    return [
      { label: t('New proposal (clear canvas)', 'Nyt tilbud (ryd lærredet)'), icon: 'eraser', fn: () => C().clearCanvas() }, // asks to save first (Pn.guard in C.clearCanvas)
      { label: t('Open…', 'Åbn…'), icon: 'folder', key: 'Ctrl+O', fn: Pn.projects },
      ...(() => { const r = Pn.recent(4).filter((p) => p.id !== d.prj); return r.length ? [{ head: t('Recent', 'Seneste') }, ...r.map((p) => ({ label: p.name, icon: 'page', note: new Date(p.date).toLocaleDateString(HP.locale(), { day: 'numeric', month: 'short' }), fn: () => Pn.openProject(p) })), 'sep'] : []; })(),
      { label: t('Save', 'Gem'), icon: 'download', key: 'Ctrl+S', note: Pn.unsaved() ? t('changes', 'ændringer') : '', fn: Pn.save },
      { label: t('Save as…', 'Gem som…'), icon: 'copy', key: 'Ctrl+Shift+S', fn: Pn.saveAs },
      { label: t('Version history…', 'Versionshistorik…'), icon: 'history', note: d.prj && projOf(d.prj) ? String(((projOf(d.prj).versions) || []).length + 1) : '', disabled: !(d.prj && projOf(d.prj)), fn: () => Pn.versions() },
      { label: t('Rename…', 'Omdøb…'), icon: 'edit', fn: rename },
      { label: t('Export file…', 'Eksportér fil…'), icon: 'download', fn: Pn.exportFile },
      { label: t('Import file…', 'Importér fil…'), icon: 'upload', fn: Pn.importFile },
      'sep',
      { label: t('Share link', 'Del link'), icon: 'link', key: 'Ctrl+Shift+L', fn: Pn.share },
      { label: t('Print / PDF…', 'Print / PDF…'), icon: 'print', key: 'Ctrl+P', fn: () => HP.cover.dialog() },
      { label: 'A4 ' + (d.orient === 'portrait' ? t('landscape', 'liggende') : t('portrait', 'stående')), icon: 'rotate', note: t('now ', 'nu ') + (d.orient === 'portrait' ? t('portrait', 'stående') : t('landscape', 'liggende')), fn: flipPage },
      'sep',
      { label: t('Price adjustments…', 'Prisjusteringer…'), icon: 'tag', note: Pn.priceSummary ? Pn.priceSummary() : '', fn: () => Pn.projectPrices() },
      { label: t('Overview', 'Oversigt'), icon: 'layers', on: Pn.layersOpen && Pn.layersOpen(), key: 'Alt+1', fn: () => Pn.layers() },
    ];
  };
  const adminItems = () => {
    const n = cat.dirtyCount();
    return [
      { label: t('Product Editor', 'Produkt-editor'), icon: 'edit', fn: () => HP.editor.open() },
      { label: t('Statistics', 'Statistik'), icon: 'chart', fn: () => Pn.stats() },
      n ? 'sep' : null,
      n ? { label: t('Publish', 'Udgiv') + ' (' + n + ')', icon: 'cloud', accent: true, note: t('to all shops', 'til alle butikker'), fn: () => HP.editor.publish() } : null,
    ].filter(Boolean);
  };
  const userItems = () => {
    const s = HP.seller(), dark = document.documentElement.dataset.theme === 'dark';
    return [
      s ? { head: s.name } : null,
      { label: t('Help', 'Hjælp'), icon: 'help', fn: Pn.help },
      { label: t('Language', 'Sprog'), icon: 'globe', note: (HP.LANGS.find((x) => x[0] === HP.lang()) || [])[1], fn: () => Pn.langMenu() },
      { label: dark ? t('Light theme', 'Lyst tema') : t('Dark theme', 'Mørkt tema'), icon: dark ? 'sun' : 'moon', key: 'F1', fn: Pn.toggleTheme },
      { label: t('Settings', 'Indstillinger'), icon: 'gear', fn: Pn.settings },
    ].filter(Boolean);
  };
  // the language list, opened from "Sprog" in the seller's menu (or ⋯ on tablets); each language in its own name. The page reloads
  // so the chosen language's dictionary (js/i18n/) is loaded before anything is drawn
  Pn.langMenu = () => {
    const b = [...document.querySelectorAll('#tb-seller, #tb-more')].find((e) => e.offsetParent), r = b ? b.getBoundingClientRect() : { right: innerWidth - 10, bottom: 48 };
    HP.menu(r.right - 250, r.bottom + 4, [{ head: t('Language', 'Sprog') }].concat(HP.LANGS.map(([code, name]) => ({ label: name, on: code === HP.lang(), fn: () => { if (code === HP.lang()) return; HP.setLang(code); location.reload(); } }))), b);
  };
  // the shop's sellers on this PC, for one-click switching from the avatar menu (and ⋯ on tablets)
  const initials = (nm) => (nm || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const sellerItems = () => {
    const cur = HP.seller(), sp = HP.shopProfile();
    return [
      { head: sp.name ? t('Sellers in ', 'Sælgere i ') + sp.name : t('Sellers', 'Sælgere') },
      ...HP.sellers(HP.shop()).map((x) => cur && x.no === cur.no
        ? { label: x.name, av: initials(x.name), on: true, fn: () => {} }
        : { label: x.name, av: initials(x.name), fn: () => Pn.useSeller(x) }),
      { label: t('Another seller…', 'Anden sælger…'), icon: 'user-plus', fn: () => Pn.switchSeller() },
      'sep',
    ];
  };
  // switch straight to a seller already on this PC. Their earlier consent to statistics stands; switching from the menu
  // never counts as having seen the notice (that is only shown on the login screen).
  Pn.useSeller = (x) => {
    const shown = HP.loginNoticeShown; HP.loginNoticeShown = false;
    LS.set('seller', x.no); HP.emit('seller'); HP.emit('doc');
    HP.loginNoticeShown = shown;
    HP.toast(t('Signed in as ', 'Logget ind som ') + x.name, { kind: 'ok' });
  };
  const dropAt = (btn, items, right) => { const r = btn.getBoundingClientRect(); HP.menu(right ? r.right - 250 : r.left, r.bottom + 4, items, btn); };

  /* everything in the top bar, as one menu, for phones */
  function moreMenu(btn) {
    const d = store.doc, admin = HP.isAdmin();
    const r = btn.getBoundingClientRect();
    HP.menu(r.right - 260, r.bottom + 4, [
      { head: d.name || t('Untitled proposal', 'Unavngivet tilbud') },
      ...fileItems(),
      'sep',
      { label: t('Text', 'Tekst'), icon: 'text', fn: () => C().addText() },
      { label: t('Price list', 'Prisliste'), icon: 'tag', on: C().hasPrices(), fn: () => C().togglePrices() },
      { label: t('CI mode', 'CI-tilstand'), icon: 'plan', on: !!d.ci, fn: () => C().setCI(!d.ci) },
      { el: Pn.scaleStepper() },
      admin ? 'sep' : null, ...(admin ? adminItems() : []),
      'sep', ...sellerItems(), ...userItems().filter((x) => !x.head),
    ].filter(Boolean), btn);
  }

  /* The top bar, laid out like Figma's or Canva's: flat icon buttons, no boxes.
     left:   logo · Filer ▾ | undo redo | Tekst Prisliste CI-tilstand (tools, icons with tooltips)
     centre: the shop / the proposal's name (edit in place) · the Prisjusteringer chip
     right:  Oversigt · Kort 100% ▾ · Admin ⚙ (admins) · the seller's avatar ▾ | Relaterede produkter · Print / PDF
     Up to 1024 px (iPad portrait, phones) the rest is in ⋯ (moreMenu). */
  function buildTopbar() {
    const ib = (id, ic, tip, fn, opts) => h('button.tb-i' + ((opts && opts.cls) || ''), { id, title: tip + ((opts && opts.key) ? ' (' + opts.key + ')' : ''), 'aria-label': tip, onclick: fn }, icon(ic, 17), opts && opts.text ? h('span', null, opts.text) : null);
    const sep = () => h('i.tb-sep');
    const dropBtn = (id, label, items, opts) => h('button.tb-i.tb-menu', { id, title: (opts && opts.tip) || label, 'aria-haspopup': 'menu', onclick: (e) => dropAt(e.currentTarget, items(), opts && opts.right) },
      opts && opts.icon ? icon(opts.icon, 16) : null, label ? h('span.ml', null, label) : null, icon('down', 11));
    const name = h('input.docname', { placeholder: t('Untitled proposal', 'Unavngivet tilbud'), value: store.doc.name || '', title: t('Proposal name (shown on the printout). Click to rename.', 'Tilbuddets navn (vises på printet). Klik for at omdøbe.'),
      onchange: () => { store.doc.name = name.value.trim(); store.commit(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') name.value = store.doc.name || ''; name.blur(); } } });
    // the proposal's name is always readable: the field is as wide as its text (60–340 px; ellipsis beyond that), so the saved status sits right after it
    const ruler = document.createElement('canvas').getContext('2d');
    const fitName = () => { const cs = getComputedStyle(name); ruler.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const w = ruler.measureText(name.value || name.placeholder).width + 22; name.style.width = Math.round(Math.max(60, Math.min(340, w))) + 'px'; };
    name.addEventListener('input', fitName);
    const shopCrumb = h('span.tb-crumb');
    const undo = ib('tb-undo', 'undo', t('Undo', 'Fortryd'), store.undo, { key: 'Ctrl+Z' }), redo = ib('tb-redo', 'redo', t('Redo', 'Annuller fortryd'), store.redo, { key: 'Ctrl+Y' });
    // the undo history as a list (like Photoshop's History panel): click a step to go back (or forward) to it
    const histBtn = h('button.tb-i#tb-hist', { 'aria-haspopup': 'menu', title: t('History: go back several steps', 'Historik: gå flere trin tilbage'), onclick: (e) => Pn.history(e.currentTarget) }, icon('history', 16));
    const text = ib('tb-text', 'text', t('Add text', 'Tilføj tekst'), () => C().addText(), { key: 'Alt+T' });
    const prices = ib('tb-prices', 'tag', t('Price list', 'Prisliste'), () => C().togglePrices(), { key: 'F3' });
    const ci = ib('tb-ci', 'plan', t('CI mode: marks on a floor plan', 'CI-tilstand: mærker på en plantegning'), () => C().setCI(!store.doc.ci));
    const layers = ib('tb-layers', 'layers', t('Overview: everything on the canvas', 'Oversigt: alt på lærredet'), () => Pn.layers(), { key: 'Alt+1' });
    // card size, like Figma's zoom menu: the percentage, and a menu with − / + and common sizes
    const scaleTxt = h('span.ml'), STEPS = [0.6, 0.8, 1, 1.25];
    const scaleBtn = h('button.tb-i.tb-menu#tb-scale', { title: t('Card size relative to the A4 page', 'Kortstørrelse i forhold til A4-siden'), onclick: (e) => dropAt(e.currentTarget, [
      { el: Pn.scaleStepper() }, 'sep',
      ...STEPS.map((v) => ({ label: Math.round(v * 100) + '%', on: Math.abs((store.doc.cardScale || 1) - v) < 0.001, fn: () => C().setCardScale(v, true) })),
      'sep', { label: t('Fit to window', 'Tilpas til vindue'), icon: 'fit', key: 'Shift+1', fn: () => C().fit() }], true) }, icon('scale', 16), scaleTxt, icon('down', 11));
    // "Relaterede produkter": cables for the connections without one and the website's accessories; the badge counts the connections without a cable
    const doneN = h('span.badge'), done = h('button.tb-btn#tb-complete', { onclick: () => HP.complete.open() }, icon('plus', 15), h('span.tl', null, t('Related products', 'Relaterede produkter')), doneN);
    const doneUpd = () => { const n = HP.complete.missing(); doneN.textContent = n || ''; doneN.hidden = !n; done.title = n ? n + t(' connections without a cable: related products', ' forbindelser uden kabel: relaterede produkter') : t('Related products: cables and accessories', 'Relaterede produkter: kabler og tilbehør'); };
    HP.on('doc', doneUpd); setTimeout(doneUpd);
    const print = h('button.tb-btn.primary#tb-print', { title: t('Print / PDF (Ctrl+P)', 'Print / PDF (Ctrl+P)'), onclick: () => HP.cover.dialog() }, icon('print', 15), h('span.tl', null, t('Print / PDF', 'Print / PDF')));
    const adminN = h('i.tb-dot'), admin = h('button.tb-i.tb-menu#tb-admin', { 'aria-haspopup': 'menu', title: t('Admin: product editor, statistics, publish', 'Admin: produkt-editor, statistik, udgiv'), onclick: (e) => dropAt(e.currentTarget, adminItems(), true) }, icon('shield', 17), h('span.tl', null, 'Admin'), adminN, icon('down', 11));
    const avIni = h('b'), avatar = h('span.tb-av', null, avIni), seller = h('button.tb-i.tb-menu#tb-seller', { 'aria-haspopup': 'menu', onclick: (e) => dropAt(e.currentTarget, [...sellerItems(), ...userItems().filter((x) => !x.head)], true) }, avatar, icon('down', 11));
    const file = dropBtn('tb-file', t('File', 'Filer'), fileItems, { tip: t('The proposal: new, projects, share, print, price adjustments', 'Tilbuddet: nyt, projekter, del, print, prisjusteringer') });
    // the Prisjusteringer chip: shown while the proposal has price adjustments; click edits them, × clears them (Undo in the toast)
    const ppTxt = h('span.ppc-t'), ppChip = h('.tb-pp#tb-pp', { hidden: true },
      h('button.ppc', { onclick: () => Pn.projectPrices() }, icon('tag', 13), h('span.ppc-l', null, t('Price adjustments', 'Prisjusteringer')), ppTxt),
      h('button.ppc-x', { title: t('Remove all price adjustments (Undo in the message)', 'Fjern alle prisjusteringer (Fortryd i beskeden)'), onclick: () => Pn.clearProjectPrices() }, icon('x', 12)));
    // a dot after the name while the open project has changes not saved in it (Ctrl+S saves); click it to save
    const unsavedDot = h('button.tb-unsaved', { type: 'button', hidden: true, title: t('Changes not saved in the project (Ctrl+S)', 'Ændringer ikke gemt i projektet (Ctrl+S)'), onclick: () => Pn.save() });
    // "Gemt for 2 minutter siden" after the name of a saved project; click for its version history
    const savedLbl = h('button.tb-saved', { type: 'button', hidden: true, title: t('Version history', 'Versionshistorik'), onclick: () => Pn.versions() });
    const drawSaved = () => { const at = Pn.savedAt(); savedLbl.hidden = !at; if (at) savedLbl.textContent = t('Saved', 'Gemt') + ' ' + Pn.ago(at); };
    setInterval(drawSaved, 30000);
    // old prices (more than HP.STALE_HOURS): a warning chip; campaign prices are off until a newer catalogue is loaded
    const staleTxt = h('span'), staleChip = h('button.tb-stale', { type: 'button', hidden: true, onclick: () => Pn.priceAge() }, icon('warn', 13), staleTxt);
    const drawStale = () => { const on = HP.pricesGuarded(); staleChip.hidden = !on; if (on) { staleTxt.textContent = t('Prices {} old', 'Priser {} gamle').replace('{}', HP.pricesAgeText()); staleChip.title = t('Read from hifiklubben.dk {}. Campaign prices are not shown until newer prices are loaded. Click for more.', 'Hentet fra hifiklubben.dk {}. Kampagnepriser vises ikke, før nyere priser er hentet. Klik for mere.').replace('{}', HP.pricesStamp()); } };
    HP.on('prices', drawStale);
    const bar = h('header#topbar', null,
      h('.tb-left', null,
        h('button.tb-btn.primary#tb-drawer', { title: t('Products and Shortcuts', 'Produkter og genveje'), onclick: () => Pn.drawer() }, icon('plus', 15), h('span', null, t('Products', 'Produkter'))),
        h('.brandmark', { title: 'HiFi Planner' }, h('img', { src: 'assets/hifi-planner-logo.png', alt: 'HiFi Planner' })),
        h('.tb-grp#tb-filegrp', null, file), sep(),
        h('.tb-grp#tb-edit', null, undo, redo, histBtn), sep(),
        h('.tb-grp#tb-insert', null, text, prices, ci)),
      h('.tb-mid', null, shopCrumb, name, unsavedDot, savedLbl, ppChip, staleChip),
      h('.tb-right', null,
        h('.tb-grp#tb-view', null, layers, scaleBtn), sep(),
        h('.tb-grp#tb-admingrp', null, admin),
        h('.tb-grp#tb-sellergrp', null, seller),
        h('.tb-grp#tb-actions', null, done, print),
        h('button.tb-i#tb-more', { title: t('More', 'Mere'), onclick: (e) => moreMenu(e.currentTarget) }, icon('more', 17))));
    const drawSeller = () => {
      const s = HP.seller(), ini = initials(s && s.name);
      avIni.textContent = ini; seller.title = (s ? s.name + ' · ' + s.no + '. ' : '') + t('Switch seller, help, language, theme, settings', 'Skift sælger, hjælp, sprog, tema, indstillinger');
      const sp = HP.shopProfile(); shopCrumb.textContent = sp.name ? sp.name : HP.shop() ? t('Shop ', 'Butik ') + HP.shop() : ''; shopCrumb.hidden = !shopCrumb.textContent;
    };
    drawSeller(); HP.on('seller', drawSeller);
    const sync = () => {
      undo.disabled = !store.canUndo(); redo.disabled = !store.canRedo(); histBtn.disabled = undo.disabled && redo.disabled;
      prices.classList.toggle('on', C().hasPrices()); ci.classList.toggle('on', !!store.doc.ci);
      layers.classList.toggle('on', !!(Pn.layersOpen && Pn.layersOpen()));
      scaleTxt.textContent = Math.round((store.doc.cardScale || 1) * 100) + '%';
      if (document.activeElement !== name) name.value = store.doc.name || '';
      fitName();
      unsavedDot.hidden = !Pn.unsaved(); drawSaved(); drawStale();
      bar.querySelector('#tb-admingrp').hidden = !HP.isAdmin();
      const n = cat.dirtyCount(); adminN.hidden = !n;
      admin.title = n ? t('Admin · ' + n + ' unpublished change(s)', 'Admin · ' + n + ' ikke-udgivne ændring(er)') : t('Admin: Product Editor, statistics, publish', 'Admin: produkt-editor, statistik, udgiv');
      { const ps = Pn.priceState(); ppChip.hidden = !ps; if (ps) { ppTxt.textContent = ps.text; ppChip.classList.toggle('away', !ps.active);
        ppChip.firstChild.title = ps.active ? t('This proposal has price adjustments: ', 'Tilbuddet har prisjusteringer: ') + ps.text + t(' against the website prices. Click to edit.', ' i forhold til hjemmesidens priser. Klik for at redigere.') + (ps.away ? ' ' + ps.away + t(' saved for products not in the price list.', ' gemt for varer, der ikke er i prislisten.') : '')
          : ps.away + t(' price adjustment(s) saved for products not in the price list now. Click to see them.', ' prisjustering(er) gemt for varer, der ikke er i prislisten nu. Klik for at se dem.'); } }
    };
    HP.on('doc', sync); HP.on('catalog', sync); HP.on('admin', sync); HP.on('layers', sync);
    setTimeout(sync);
    return bar;
  }

  /* ---------- card size relative to the A4 page ---------- */
  Pn.scaleStepper = () => {
    const STEPS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
    const cur = () => store.doc.cardScale || 1;
    const step = (d) => { const i = STEPS.findIndex((s) => s >= cur() - 0.001), j = HP.clamp((STEPS[i] > cur() + 0.001 && d < 0 ? i : i + d), 0, STEPS.length - 1); C().setCardScale(STEPS[j], true); };
    const val = h('button.sval', { title: t('Card size relative to the A4 page. Click to reset to 100%.', 'Kortstørrelse i forhold til A4-siden. Klik for at nulstille til 100%.'), onclick: () => C().setCardScale(1, true) });
    const el = h('.stepper', { title: t('Card size', 'Kortstørrelse') }, icon('scale', 15), h('span.slab', null, t('Card size', 'Kortstørrelse')),
      h('button', { title: t('Smaller cards', 'Mindre kort'), onclick: () => step(-1) }, icon('minus', 14)), val, h('button', { title: t('Larger cards', 'Større kort'), onclick: () => step(1) }, icon('plus', 14)));
    const sync = () => { val.textContent = Math.round(cur() * 100) + '%'; };
    sync(); HP.on('doc', sync);
    return el;
  };

  /* ---------- CI bar (inside the viewport) ---------- */
  /* CI mode: a second row of the top menu, shown while CI mode is on. Same buttons and groups as the top bar. */
  function buildCIBar() {
    const file = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', hidden: true, onchange: () => { C().loadPlan(file.files[0]); file.value = ''; } });
    const size = h('input', { type: 'range', min: 18, max: 70, step: 2, oninput: () => C().setMarkSize(+size.value, false), onchange: () => C().setMarkSize(+size.value, true) });
    const hint = h('span.ci-hint');
    const tb = (cls, ic, label, tip, fn, data) => h('button.tbtn' + (cls || ''), { title: tip || label, onclick: fn, data }, ic && icon(ic, 15), label && h('span', null, label));
    const syms = Object.keys(C().GENERIC).map((g) => h('button.tbtn.symbtn', { data: { k: '@' + g }, title: t(C().GENERIC[g][0], C().GENERIC[g][1]), html: C().markHtml('@' + g), onclick: () => C().startStamp('@' + g) }));
    const tools = [
      tb('', 'page', t('Room', 'Rum'), t('Draw a room: marks inside are grouped in the legend', 'Tegn et rum: mærker indeni grupperes i signaturforklaringen'), () => C().startTool('zone'), { tool: 'zone' }),
      tb('', 'cable', t('Cable', 'Kabel'), t('Draw a cable run and get its length', 'Tegn et kabeltræk og få længden'), () => C().startTool('run'), { tool: 'run' }),
      tb('', 'ruler', t('Scale', 'Målestok'), t('Tell HiFi Planner the real size of the plan', 'Fortæl HiFi Planner planens rigtige størrelse'), () => C().startTool('scale'), { tool: 'scale' })];
    const HINTS = { zone: ['Drag a rectangle around the room', 'Træk et rektangel rundt om rummet'], run: ['Click along the cable route · double-click or Enter to finish · Esc to stop', 'Klik langs kabelvejen · dobbeltklik eller Enter afslutter · Esc stopper'],
      scale: ['Click the two ends of a wall or door you know the length of', 'Klik på de to ender af en væg eller dør, du kender længden på'] };
    const finish = h('button.btn.sm.primary', { hidden: true, onclick: () => C().finishRun() }, icon('check', 14), t('Finish run', 'Afslut træk'));
    const legend = tb('', 'tag', t('Legend', 'Forklaring'), t('Show or hide the legend', 'Vis eller skjul signaturforklaringen'), () => C().toggleLegend());
    const plan = tb('', 'upload', t('Floor plan', 'Plantegning'), '', () => file.click());
    const rm = tb('.danger', 'trash', '', t('Remove floor plan', 'Fjern plantegning'), () => C().removePlan());
    const bar = h('#cibar.cibar', { hidden: true },
      h('.ci-tag', { title: t('CI mode: marks on a floor plan', 'CI-tilstand: mærker på en plantegning') }, icon('plan', 15), h('span', null, 'CI')),
      h('.tgroup.ci-syms', { title: t('Symbols', 'Symboler') }, syms),
      h('.tgroup', null, tools),
      h('label.tgroup.ci-size', { title: t('Mark size', 'Mærkestørrelse') }, h('span.ci-size-ic', { html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="15" r="3"/><circle cx="16" cy="11" r="6"/></svg>' }), size),
      h('.tgroup', null, legend, plan, rm),
      hint, finish,
      h('.tgroup', null, tb('', 'x', t('Exit', 'Afslut'), t('Leave CI mode', 'Forlad CI-tilstand'), () => C().setCI(false))), file);
    const sync = () => {
      const st = C().stamp(), tl = C().tool(), on = !!store.doc.ci;
      if (bar.hidden === on) { bar.hidden = !on; document.getElementById('main').classList.toggle('ci-on', on); }
      tools.forEach((b) => b.classList.toggle('on', !!tl && tl.type === b.dataset.tool));
      tools[2].lastChild.textContent = t('Scale', 'Målestok') + (store.doc.sc ? ' ✓' : '');
      tools[2].title = store.doc.sc ? t('Scale is set. Click to set it again.', 'Målestokken er sat. Klik for at sætte den igen.') : t('Tell HiFi Planner the real size of the plan', 'Fortæl HiFi Planner planens rigtige størrelse');
      finish.hidden = !(tl && tl.type === 'run' && tl.pts.length > 1);
      size.value = store.doc.ms || 34; rm.hidden = !C().hasPlan(); legend.classList.toggle('on', C().hasLegend());
      plan.lastChild.textContent = C().hasPlan() ? t('Replace plan', 'Udskift plan') : t('Floor plan', 'Plantegning');
      plan.title = plan.lastChild.textContent;
      hint.classList.toggle('active', !!st || !!tl);
      hint.textContent = tl ? t(HINTS[tl.type][0], HINTS[tl.type][1]) : st ? t('Placing ', 'Placerer ') + C().markTitle(st.key) + t(' · click on the plan · Esc to stop', ' · klik på planen · Esc stopper') : t('Click a product or a symbol, then click on the plan', 'Klik på et produkt eller et symbol, og klik så på planen');
      hint.title = hint.textContent;
      syms.forEach((b) => b.classList.toggle('on', !!st && st.key === b.dataset.k));
    };
    HP.on('doc', sync); HP.on('stamp', sync); setTimeout(sync);
    return bar;
  }

  Pn.build = (root) => {
    const main = h('#main');
    root.append(buildTopbar(), h('#body', null, buildSidebar(), main));
    HP.canvas.init(main);
    main.prepend(buildCIBar()); // docked above the canvas
    if (LS.get('layersShown', true) && !matchMedia('(max-width: 1024px)').matches) setTimeout(() => Pn.layers(true)); // Oversigt: open unless closed last time
  };

  /* ---------- cable picker ---------- */
  /* cable for a cable run on a floor plan: only cable sold by the metre */
  Pn.runCablePicker = (runId) => {
    const it = store.item(runId); if (!it) return;
    const q = h('input', { type: 'search', placeholder: t('Search cables…', 'Søg kabler…'), oninput: draw, autofocus: true });
    const list = h('.plist.tall');
    const perMetre = (p) => (p.cable || []).includes('speaker') && ((p.fx || {}).perMetre || /(^|[^0-9.,])1 ?m$|slip/i.test(p.name.trim())); // the website says so, or a speaker cable named "… - 1m" or SLiP installation cable
    function draw() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list.textContent = '';
      const rows = cat.cables().filter((p) => !p.gone && perMetre(p) && words.every((w) => p._hay.includes(w))).sort((a, b) => a.price - b.price);
      if (it.cable) { const none = h('button.link.pad', { onclick: () => { C().setRunCable(runId, null); close(); } }, t('No cable (length only)', 'Intet kabel (kun længde)')); list.append(none); }
      rows.forEach((p) => { const r = productRow(p, h('span.tagline', null, t('per metre', 'pr. meter'))); if (it.cable === p.id) r.classList.add('on'); r.onclick = () => { C().setRunCable(runId, p.id); close(); }; list.append(r); });
      if (!rows.length) list.append(h('.empty', null, t('No cable sold by the metre found.', 'Ingen kabler i metermål fundet.')));
    }
    const close = HP.modal({ title: t('Cable for this run', 'Kabel til dette træk'), size: 'md', flush: true,
      body: [h('.conn-head', null, h('span.muted', null, t('Speaker cable sold by the metre. The length is rounded up to whole metres per cable type; the next run you draw gets the same cable.', 'Højtalerkabel i metermål. Længden rundes op til hele meter pr. kabeltype; det næste træk, du tegner, får samme kabel.'))),
        h('.searchbox.pad', null, icon('search', 15), q), list] });
    draw();
  };

  /* a plug as a chip: [RCA ×2 | M] — M (a plug) solid, F (a socket) outlined; connectors without a gender just their name */
  Pn.plugChip = (x) => {
    if (!x) return null;
    if (!P.AUDIO.has(x.conn)) return h('span.pchip', null, h('span.pc-c', null, P.CONNECTORS[x.conn] || x.conn));
    return h('span.pchip', { title: P.plugText(x) + ' — ' + (x.g === 'm' ? t('male (plug)', 'han (stik)') : t('female (socket)', 'hun (bøsning)')) },
      h('span.pc-c', null, P.plugCore(x)), h('span.pc-g.' + x.g, null, x.g.toUpperCase()));
  };
  Pn.cablePicker = (connId) => {
    const c = store.doc.conns.find((x) => x.id === connId); if (!c) return;
    const info = C().connInfo(c), a = info.a || { label: '?', conn: 'other' }, b = info.b || { label: '?', conn: 'other' };
    const q = h('input', { type: 'search', placeholder: t('Search cables…', 'Søg kabler…'), oninput: draw, autofocus: true });
    const list = h('.plist.tall');
    let showAll = false;
    // the chosen cable, with its length: lv = the website length (a cable without its own card for that length), m = metres for
    // cable sold by the metre. The last length used is remembered and pre-selected next time.
    const pick = (id, o) => { c.cable = id; delete c.lv; delete c.m; if (o && o.lv) c.lv = o.lv; if (o && o.m) c.m = o.m; if (o && o.len) LS.set('cableLen', o.len);
      if (id && ad) c.ad = ad.id; else delete c.ad; store.commit(); close(); };
    // an adapter in the chain (a Y-splitter, an extender): offered when one fits the in port; the cables are then matched to the
    // adapter's socket instead of the port. E.g. SUB OUT → sub cable → Y-Split 1F/2M → the subwoofer's LINE IN L and R.
    // only adapters that some cable can reach cleanly from the out port (a DIN socket is no use after an RCA output)
    const plainCables = cat.cables().filter((p) => !p.gone && !P.isAdapter(p));
    const reachable = (ad) => { const x = P.adapterTarget(ad, b); return plainCables.some((p) => P.cableFit(p, a, x) === 2 && !P.plugIssues(p, a, x).length); };
    const adapters = cat.cables().filter((p) => !p.gone && P.isAdapter(p) && P.adapterFit(p, a, b) && reachable(p)).sort((x, y) => (x.price || 0) - (y.price || 0));
    let ad = c.ad ? adapters.find((p) => p.id === c.ad) || null : null;
    const target = () => (ad ? P.adapterTarget(ad, b) : b);
    const adSel = adapters.length ? h('select.adsel', { onchange: (e) => { ad = adapters.find((p) => p.id === e.target.value) || null; sel = null; useBtn.disabled = true; summary.textContent = t('Choose a cable and a length', 'Vælg et kabel og en længde'); summary.classList.add('muted'); draw(); } },
      h('option', { value: '' }, t('No adapter', 'Intet adapter')), adapters.map((p) => h('option', { value: p.id, selected: ad && ad.id === p.id }, p.brand + ' ' + p.name + ' · ' + HP.money(HP.priceOf(p).price)))) : null;
    // a click only selects: sel = { key, id, o, name, price }. The summary in the footer shows it, and "Use cable" (or Enter,
    // or a double-click) commits it, so a length can be compared with the others before it goes on the connection.
    let sel = null;
    const summary = h('span.selsum.muted', null, t('Choose a cable and a length', 'Vælg et kabel og en længde'));
    const useBtn = h('button.btn.primary', { disabled: true, onclick: () => commit() }, t('Use cable', 'Brug kabel'));
    const commit = () => { if (sel) pick(sel.id, sel.o); };
    const select = (s) => {
      sel = s;
      list.querySelectorAll('.cablegroup').forEach((g) => { const on = g.dataset.key === s.group; g.classList.toggle('picked', on); g.querySelectorAll('button.len').forEach((b) => b.classList.toggle('on', on && b.dataset.k === s.key)); });
      summary.textContent = ''; summary.classList.remove('muted');
      summary.append(h('b', null, s.name), ad ? ' + ' + ad.name : '', ' · ' + HP.money(s.price + (ad ? HP.priceOf(ad).price : 0)));
      useBtn.disabled = false;
    };
    const isPerMetre = (p) => (p.cable || []).includes('speaker') && ((p.fx || {}).perMetre || /(^|[^0-9.,])1 ?m$|slip/i.test(p.name.trim()));
    const lenIn = (s) => { const m = /(\d+(?:[.,]\d+)?)\s?m$/i.exec(String(s || '').trim()); return m ? parseFloat(m[1].replace(',', '.')) : 0; };
    const fmtM = (m) => String(m).replace('.', ',') + ' m';
    // one row per cable: the cards of one website cable (one per length) and its website lengths together
    const groupsOf = (cables) => {
      const g = new Map();
      cables.forEach((p) => { const k = p.site ? 'S' + String(p.site).toUpperCase() : 'I' + p.id; (g.get(k) || g.set(k, []).get(k)).push(p); });
      return [...g.values()].map((members) => {
        const rep = members.find((p) => !p.web && p.id === c.cable) || members.find((p) => !p.web) || members[0];
        if (isPerMetre(rep)) return { rep, members, metre: true, min: rep.price || 0 };
        const lens = (members.find((p) => p.lens) || {}).lens || [];
        let opts = lens.map((l) => ({ m: l.m, label: l.label, price: l.price, id: l.id || rep.id, lv: l.id ? null : l.sku }));
        members.forEach((p) => { const m = lenIn(p.name); if ((m || !opts.length) && !opts.some((o) => o.id === p.id && !o.lv) && !(m && opts.some((o) => o.m === m))) opts.push({ m, label: m ? fmtM(m) : '', price: p.price || 0, id: p.id, lv: null }); });
        opts = opts.sort((x, y) => x.m - y.m || x.price - y.price);
        return { rep, members, opts, min: Math.min(...opts.map((o) => o.price || Infinity)) };
      });
    };
    function groupRow(G) {
      const rep = G.rep, e = P.cableEnds(rep) || [], mine = G.members.some((p) => p.id === c.cable), gk = String(rep.site || rep.id);
      const pl = P.cablePlugs(rep);
      const r = productRow(rep, h('span.tagline', null, pl ? [Pn.plugChip(pl[0]), h('span.pc-arrow', null, '↔'), Pn.plugChip(pl[1])] : e.length ? (P.CONNECTORS[e[0]] || e[0]) + ' ↔ ' + (P.CONNECTORS[e[1]] || e[1]) : ''));
      const base = C().stripLen(rep.name) || rep.name;
      const nm = r.querySelector('.pname'); if (nm) nm.textContent = base;
      const pr = r.querySelector('.pprice'); if (pr) pr.replaceChildren(...[!G.metre && G.opts.length > 1 ? h('small', null, t('from ', 'fra ')) : null, HP.money(G.metre ? rep.price : G.min), G.metre ? h('small', null, ' / m') : null].filter(Boolean));
      if (mine) r.classList.add('on');
      const box = h('.lens');
      let choose;
      if (G.metre) {
        const last = +LS.get('cableLen', 0);
        const mm = { m: Math.max(1, Math.round(mine && c.m ? c.m : last || 2)) }; // whole metres, as cable is cut in the shop
        choose = () => { const m = mm.m; select({ group: gk, key: 'm', id: rep.id, o: { m, len: m }, name: base + ' ' + fmtM(m), price: Math.ceil(m) * rep.price }); };
        const tot = h('span.muted', null, '= ' + HP.money(mm.m * rep.price));
        const stepper = C().metreStepper(mm, (m, enter) => { tot.textContent = '= ' + HP.money(m * rep.price); choose(); if (enter) commit(); });
        box.append(h('span.lab', null, t('Metres', 'Meter')), stepper, tot);
      } else {
        const last = +LS.get('cableLen', 0);
        const cur = mine ? G.opts.find((o) => o.id === c.cable && (o.lv || null) === (c.lv || null)) : null;
        const pre = cur || (last && G.opts.find((o) => o.m >= last)) || G.opts.find((o) => o.m >= 1) || G.opts[0];
        const pickOpt = (o, i) => select({ group: gk, key: String(i), id: o.id, o: { lv: o.lv, len: o.m }, name: base + (o.label ? ' ' + o.label : ''), price: o.price || 0 });
        if (G.opts.length > 1 || (G.opts[0] && G.opts[0].m)) G.opts.forEach((o, i) => box.append(h('button.len', { data: { k: String(i) }, title: HP.money(o.price),
          onclick: (ev) => { ev.stopPropagation(); pickOpt(o, i); }, ondblclick: (ev) => { ev.stopPropagation(); pickOpt(o, i); commit(); } },
          h('b', null, o.label || '—'), h('span', null, HP.money(o.price)))));
        // the row itself selects the length that is on the connection now, else the last length used, else the first of 1 m or more
        choose = () => { if (sel && sel.group === gk) return; const i = G.opts.indexOf(pre); pickOpt(pre, i); };
        if (mine) setTimeout(() => { if (!sel) choose(); });
      }
      r.onclick = () => choose();
      r.ondblclick = () => { choose(); commit(); };
      const warn = G.issues && G.issues.length ? h('.plugwarn', null, icon('warn', 12), G.issues.map((x) => t(x.en, x.da)).join(' · ')) : null;
      return h('.cablegroup' + (warn ? '.issues' : ''), { data: { key: gk } }, r, warn, box.childNodes.length ? box : null);
    }
    function draw() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const hits = cat.cables().filter((p) => (cat.findable(p, words) || p.id === c.cable) && words.every((w) => p._hay.includes(w) || (p.cable || []).some((x) => x.includes(w))));
      const tb = target(); // the in port, or the adapter's socket
      const all = groupsOf(hits.filter((p) => !P.isAdapter(p) || !ad)).map((G) => { const fit = P.cableFit(G.rep, a, tb); return Object.assign(G, { fit, issues: fit ? P.plugIssues(G.rep, a, tb) : [] }); }); // by the cable's two ends, then its plugs
      list.textContent = '';
      const sec = (title, items) => { if (!items.length) return; list.append(h('.sec', null, title + ' (' + items.length + ')'));
        items.sort((x, y) => (x.issues.length - y.issues.length) || x.min - y.min).forEach((G) => list.append(groupRow(G))); }; // plugs that fit first
      const good = all.filter((x) => x.fit === 2), maybe = all.filter((x) => x.fit === 1), other = all.filter((x) => x.fit === 0);
      sec(t('Matching cables', 'Passende kabler'), good); sec(t('May fit', 'Passer muligvis'), maybe);
      if (showAll || words.length || !(good.length + maybe.length)) sec(t('Other cables', 'Andre kabler'), other);
      else if (other.length) list.append(h('button.link.pad', { onclick: () => { showAll = true; draw(); } }, t('Show ' + other.length + ' other cables', 'Vis ' + other.length + ' andre kabler')));
      if (!all.length) list.append(h('.empty', null, t('No cables found.', 'Ingen kabler fundet.')));
      if (sel) select(sel);
    }
    const close = HP.modal({ title: t('Cable for this connection', 'Kabel til denne forbindelse'), size: 'md', flush: true,
      body: [h('.conn-head', null, h('span.pill.c-' + P.colorOf(a), null, a.label), h('span.arrow', null, '→'), h('span.pill.c-' + P.colorOf(b), null, b.label),
        h('span.muted', null, P.plug(a, 'out') || P.plug(b, 'in') ? [Pn.plugChip(P.plug(a, 'out') || { conn: P.conn(a.conn, a) }), h('span.pc-arrow', null, '→'), Pn.plugChip(P.plug(b, 'in') || { conn: P.conn(b.conn, b) })]
          : P.CONNECTORS[P.conn(a.conn, a)] + (P.conn(a.conn, a) !== P.conn(b.conn, b) ? ' → ' + P.CONNECTORS[P.conn(b.conn, b)] : '')),
        info.warn && h('.warnline', null, icon('warn', 14), t('These connector types do not normally fit together.', 'Disse stiktyper passer normalt ikke sammen.')),
        adSel && h('label.adline', null, h('span.muted', null, t('With adapter', 'Med adapter')), adSel, h('small.muted', null, t('e.g. a Y-splitter to feed both inputs', 'fx et Y-stik til begge indgange')))),
        h('.searchbox.pad', null, icon('search', 15), q), list],
      foot: [h('button.btn.danger', { onclick: () => { store.selConn = c.id; C().deleteSelection(); close(); } }, icon('trash', 14), t('Delete connection', 'Slet forbindelse')), h('.spacer'),
        (c.cable || c.ad) && h('button.btn', { onclick: () => { ad = null; pick(null); } }, t('Remove cable', 'Fjern kabel')), h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), useBtn] });
    // the choice is shown in a bar above the buttons
    useBtn.closest('.modal-foot').before(h('.selbar', null, summary));
    q.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && sel) commit(); });
    draw();
  };

  /* ---------- replace picker ---------- */
  Pn.replacePicker = (itemId) => {
    const it = store.item(itemId), old = cat.get(it.pid || it.k) || { cats: [], in: [], out: [], name: '?' };
    const used = { in: [], out: [] };
    store.doc.conns.forEach((c) => { if (c.a.item === itemId) used.out.push(c.a.key); if (c.b.item === itemId) used.in.push(c.b.key); });
    const total = used.in.length + used.out.length;
    const q = h('input', { type: 'search', placeholder: t('Search products…', 'Søg produkter…'), oninput: draw, autofocus: true });
    // a cable is replaced by another cable (the same plugs at both ends when ticked), anything else by a product (the same category)
    const isCable = !!old.cable, plugs = (p) => (p.ends || []).map((e) => P.conn(e)).sort().join('|'), oldG = isCable ? cat.cableGroup(old) : null, oldFam = oldG ? oldG.members : [];
    const same = h('input', { type: 'checkbox', checked: isCable ? (old.ends || []).length > 0 : (old.cats || []).length > 0, onchange: draw });
    const list = h('.plist.tall');
    function draw() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list.textContent = '';
      const sameAs = (p) => isCable ? plugs(p) === plugs(old) : (p.cats || []).some((x) => (old.cats || []).includes(x));
      let rows = (isCable ? cat.list.filter((p) => p.cable && !p.gone && !oldFam.includes(p)) : cat.products().filter((p) => cat.findable(p, words))).filter((p) => p.id !== old.id && words.every((w) => cat.matchWord(p, w)) && (!same.checked || sameAs(p))).map((p) => {
        const kept = total ? used.out.filter((k) => P.mapPorts(old.out || [], p.out || [], used.out)[k]).length + used.in.filter((k) => P.mapPorts(old.in || [], p.in || [], used.in)[k]).length : 0;
        return { p, kept };
      }).sort((x, y) => y.kept - x.kept);
      if (isCable) { // one row per cable, at the card's length when that cable has it
        const seen = new Set(), cur = cat.cableOpt(cat.cableGroup(old), old.id, it.len), len = cur ? cur.m : cat.lenOf(old);
        rows = rows.filter(({ p }) => { const G = cat.cableGroup(p), k = G ? G.key : p.id; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((x) => { const G = cat.hasLengths(x.p) && cat.cableGroup(x.p); if (!G) return x; if (G.metre) return Object.assign({}, x, { p: G.rep, grp: G });
            const o = G.opts.find((y) => y.m === len) || cat.pickOpt(G); return Object.assign({}, x, { p: cat.get(o.id), grp: G, opt: o }); });
      }
      rows.slice(0, 200).forEach(({ p, kept, grp, opt }) => { const r = productRow(p, total ? h('span.keep' + (kept === total ? '.all' : kept ? '' : '.none'), null, kept + '/' + total) : null, null, grp, opt);
        r.onclick = () => { close(); C().replaceItem(itemId, p.id); const n = store.item(itemId); if (n && grp) { if (opt && opt.lv) n.len = opt.lv; else delete n.len; if (grp.metre) n.m = n.m || it.m || 3; else delete n.m; store.commit(); } }; list.append(r); });
      if (!rows.length) list.append(h('.empty', null, t('No products match.', 'Ingen produkter matcher.')));
    }
    const close = HP.modal({ title: t('Replace ', 'Udskift ') + old.name, size: 'md', flush: true,
      body: [h('.conn-head', null, h('span.muted', null, total ? t('Connections are carried over by matching port names. The badge shows how many of the ' + total + ' survive.', 'Forbindelser føres med via matchende portnavne. Mærket viser, hvor mange af de ' + total + ' der bevares.') : t('This card has no connections yet.', 'Dette kort har ingen forbindelser endnu.'))),
        h('.searchbox.pad', null, icon('search', 15), q, h('label.check', null, same, isCable ? t('Same plugs', 'Samme stik') : t('Same category', 'Samme kategori'))), list] });
    draw();
  };

  /* ---------- projects ---------- */
  const download = (name, text, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  HP.download = download;
  /* ---------- projects: Gem (Ctrl+S), Gem som… (Ctrl+Shift+S), Åbn… (Ctrl+O), Seneste ----------
     Projects live in this browser (LS 'projects'). A proposal opened from or saved as a project remembers it (doc.prj), so Gem
     saves over it without asking; until then Gem asks for a name, like Gem som. The work is autosaved all the time anyway;
     a project is a named copy to come back to. The top bar shows a dot while the open project has changes not saved in it. */
  const projAll = () => LS.get('projects', []);
  const projOf = (id) => id && projAll().find((x) => x.id === id);
  const hasPlanSrc = () => store.doc.items.some((i) => i.kind === 'plan') && store.planSrc;
  let savedJSON = null, savedFor, savedAt = 0; // the open project as last saved (and when), to tell whether there are changes
  const syncSaved = () => { const p = projOf(store.doc.prj); if (store.doc.prj && !p) delete store.doc.prj; savedFor = store.doc.prj; savedJSON = p ? JSON.stringify(Object.assign({}, p.doc, { prj: p.id })) : null; savedAt = p ? p.date : 0; };
  // worked out again whenever the drawing belongs to another project than last time (after Undo past opening one, or a reload)
  const fresh = () => { if (store.doc.prj !== savedFor) syncSaved(); };
  Pn.unsaved = () => { fresh(); return !!(store.doc.prj && savedJSON && JSON.stringify(store.doc) !== savedJSON); };
  Pn.savedAt = () => { fresh(); return store.doc.prj ? savedAt : 0; };
  /* Before the drawing is replaced (Nyt tilbud, Åbn, Importér, a version) while the open project has changes not saved in it:
     Gem / Gem ikke / Annuller, as in desktop programs. Nothing is asked otherwise (the work is autosaved, and those all have Undo). */
  Pn.guard = (fn) => {
    if (!Pn.unsaved()) return fn();
    const name = store.doc.name || (projOf(store.doc.prj) || {}).name || '';
    const close = HP.modal({ title: t('Save changes?', 'Gem ændringer?'), size: 'sm',
      body: h('p', null, t('"{}" has changes that are not saved in the project.', '"{}" har ændringer, der ikke er gemt i projektet.').replace('{}', name)),
      foot: [h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')),
        h('button.btn', { onclick: () => { close(); fn(); } }, t("Don't save", 'Gem ikke')),
        h('button.btn.primary', { autofocus: true, onclick: () => { close(); if (Pn.save()) fn(); } }, t('Save', 'Gem'))] });
  };
  // a time as "2 minutes ago" in the chosen language
  Pn.ago = (ms) => {
    const s = (Date.now() - ms) / 1000; if (s < 45) return t('just now', 'lige nu');
    let rtf; try { rtf = new Intl.RelativeTimeFormat(HP.locale(), { numeric: 'auto' }); } catch (e) { return new Date(ms).toLocaleString(HP.locale()); }
    return s < 3600 ? rtf.format(-Math.max(1, Math.round(s / 60)), 'minute') : s < 86400 ? rtf.format(-Math.round(s / 3600), 'hour') : rtf.format(-Math.round(s / 86400), 'day');
  };
  const when = (ms) => new Date(ms).toLocaleString(HP.locale(), { dateStyle: 'medium', timeStyle: 'short' });
  const nProducts = (doc) => doc.items.filter((i) => i.kind === 'product').length + doc.items.filter((i) => i.kind === 'mark').length;
  function writeProject(name, id) {
    id = id || HP.uid();
    savedFor = id; savedJSON = null; // so the commit below does not look the project up before it is stored
    store.doc.name = name; store.doc.prj = id; store.commit();
    const all = projAll(), old = all.find((x) => x.id === id), doc = JSON.parse(JSON.stringify(store.doc)), ps = all.filter((x) => x.id !== id && x.name !== name);
    // version history: the save before this one goes first in the list of the last 10 (drawings only; the floor plan image is the project's)
    const versions = old ? [{ date: old.date, doc: old.doc }, ...(old.versions || [])].filter((v) => JSON.stringify(Object.assign({}, v.doc, { prj: id })) !== JSON.stringify(doc)).slice(0, Pn.VERSIONS) : [];
    const entry = { id, name, date: Date.now(), doc, plan: hasPlanSrc() ? store.planSrc : null, versions };
    ps.push(entry);
    let ok = LS.set('projects', ps);
    while (!ok && entry.versions.length) { entry.versions.pop(); ok = LS.set('projects', ps); } // storage full: the oldest versions go first
    if (!ok) {
      entry.plan = null;
      if (!LS.set('projects', ps)) { HP.toast(t('Browser storage is full. Export the project as a file instead.', 'Browserens lager er fuldt. Eksportér projektet som fil i stedet.'), { kind: 'error' }); return false; }
      HP.toast(t('Saved without the floor plan (too large). Export as a file to keep it.', 'Gemt uden plantegningen (for stor). Eksportér som fil for at beholde den.'), { kind: 'warn' });
    } else HP.toast(t('Saved: ', 'Gemt: ') + name, { kind: 'ok', ms: 2200 });
    savedJSON = JSON.stringify(store.doc); savedFor = id; savedAt = entry.date; HP.emit('doc');
    return true;
  }
  Pn.VERSIONS = 10;
  Pn.openProject = (p) => Pn.guard(() => {
    store.load(Object.assign({}, p.doc, { prj: p.id }), p.plan); syncSaved(); HP.emit('doc');
    HP.toast(t('Opened "{}"', 'Åbnede "{}"').replace('{}', p.name), { action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  });
  // an older save of a project opens as that project with changes, so Gem makes it the current one (and Gem som a copy)
  const openVersion = (p, v) => Pn.guard(() => {
    store.load(Object.assign({}, v.doc, { prj: p.id, name: p.name }), p.plan); syncSaved(); HP.emit('doc');
    HP.toast(t('Opened the version from {}. Save to make it the current one.', 'Åbnede versionen fra {}. Gem for at gøre den til den aktuelle.').replace('{}', when(v.date)), { ms: 8000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  });
  // Versionshistorik: the project's saves, newest first; the latest is the project itself
  Pn.versions = (p) => {
    p = p || projOf(store.doc.prj); if (!p) return HP.toast(t('Save the proposal as a project first.', 'Gem tilbuddet som projekt først.'), { kind: 'warn' });
    const rows = [{ date: p.date, doc: p.doc, latest: true }, ...(p.versions || [])];
    const close = HP.modal({ title: t('Version history', 'Versionshistorik') + ': ' + p.name, size: 'md',
      body: [h('.projlist', null, rows.map((v) => h('.proj', null,
        h('.pinfo', null, h('.pname', null, when(v.date), v.latest && h('span.ptag', null, t('latest save', 'seneste gemning'))),
          h('.psub', null, Pn.ago(v.date) + ' · ' + nProducts(v.doc) + ' ' + t('products', 'produkter'))),
        h('button.btn.sm', { onclick: () => { close(); v.latest ? Pn.openProject(p) : openVersion(p, v); } }, t('Open', 'Åbn'))))),
      h('p.muted', null, t('The last {} saves are kept. Opening an older one does not change anything until you save.', 'De sidste {} gemninger gemmes. At åbne en ældre ændrer intet, før du gemmer.').replace('{}', Pn.VERSIONS + 1))] });
  };
  Pn.save = () => { const p = projOf(store.doc.prj); return p ? writeProject(store.doc.name || p.name, p.id) : Pn.saveAs(); };
  Pn.saveAs = () => {
    const nameIn = h('input', { placeholder: t('Project name', 'Projektnavn'), value: store.doc.name || '' });
    const go = () => {
      const name = nameIn.value.trim(); if (!name) return nameIn.focus();
      const same = projAll().find((x) => x.name === name);
      const done = () => { if (writeProject(name, same ? same.id : null)) close(); };
      if (same && same.id !== store.doc.prj) HP.confirm(t('A project called "{}" already exists. Replace it?', 'Der findes allerede et projekt med navnet "{}". Erstat det?').replace('{}', name), t('Replace', 'Erstat'), done);
      else done();
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const close = HP.modal({ title: store.doc.prj ? t('Save as', 'Gem som') : t('Save proposal', 'Gem tilbud'), size: 'sm',
      body: [h('label.field', null, h('span', null, t('Project name', 'Projektnavn')), nameIn),
        h('p.muted', null, t('Saved in this browser on this PC, under Filer → Open. Your work is also autosaved continuously.', 'Gemmes i denne browser på denne PC, under Filer → Åbn. Dit arbejde gemmes også løbende af sig selv.'))],
      foot: [h('button.btn.primary', { onclick: go }, t('Save', 'Gem'))] });
    setTimeout(() => { nameIn.focus(); nameIn.select(); }, 30);
  };
  Pn.exportFile = () => download((store.doc.name || 'hifi-planner') + '.hifiplan.json', JSON.stringify({ app: 'hifi-planner', v: 2, doc: store.doc, plan: hasPlanSrc() ? store.planSrc : null }));
  const importIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => {
    const f = importIn.files[0]; if (!f) return; const fr = new FileReader();
    fr.onload = () => { try { const j = JSON.parse(fr.result); if (!j.doc || !Array.isArray(j.doc.items)) throw 0; const d = Object.assign({}, j.doc); delete d.prj; store.load(d, j.plan || null); syncSaved(); HP.toast(t('Opened "{}"', 'Åbnede "{}"').replace('{}', d.name || f.name), { action: { label: t('Undo', 'Fortryd'), fn: store.undo } }); } catch (e) { HP.toast(t('That file is not a HiFi Planner project.', 'Filen er ikke et HiFi Planner-projekt.'), { kind: 'error' }); } };
    fr.readAsText(f); importIn.value = '';
  } });
  Pn.importFile = () => Pn.guard(() => { if (!importIn.isConnected) document.body.append(importIn); importIn.click(); });
  Pn.recent = (n) => projAll().sort((a, b) => b.date - a.date).slice(0, n || 5);
  HP.on('loaded', () => syncSaved());

  Pn.projects = () => {
    const list = h('.projlist');
    function draw() {
      list.textContent = '';
      const ps = projAll();
      if (!ps.length) list.append(h('.empty', null, t('No saved projects in this browser yet.', 'Ingen gemte projekter i denne browser endnu.')));
      ps.sort((a, b) => b.date - a.date).forEach((p) => list.append(h('.proj' + (p.id === store.doc.prj ? '.cur' : ''), null,
        h('.pinfo', null, h('.pname', null, p.name), h('.psub', null, when(p.date) + ' · ' + nProducts(p.doc) + ' ' + t('products', 'produkter') + (p.plan ? ' · ' + t('floor plan', 'plantegning') : ''))),
        (p.versions || []).length ? h('button.btn.sm', { title: t('Version history', 'Versionshistorik'), onclick: () => { close(); Pn.versions(p); } }, icon('history', 14), String(p.versions.length + 1)) : null,
        p.id === store.doc.prj ? h('span.muted', null, t('open now', 'åben nu')) : h('button.btn.sm', { onclick: () => { Pn.openProject(p); close(); } }, t('Open', 'Åbn')),
        h('button.icon-btn', { title: t('Delete', 'Slet'), onclick: () => HP.confirm(t('Delete the project "{}"?', 'Slet projektet "{}"?').replace('{}', p.name), t('Delete', 'Slet'), () => { LS.set('projects', projAll().filter((x) => x.id !== p.id)); if (p.id === store.doc.prj) { delete store.doc.prj; syncSaved(); store.commit(); } draw(); }) }, icon('trash', 14)))));
    }
    const close = HP.modal({ title: t('Open project', 'Åbn projekt'), size: 'md',
      body: [list, h('p.muted', null, t('Projects are stored in this browser on this PC. Use Export to move a proposal to another PC or keep a backup. Your work is also autosaved continuously.', 'Projekter gemmes i denne browser på denne PC. Brug Eksportér for at flytte et tilbud til en anden PC eller tage en sikkerhedskopi. Dit arbejde gemmes også løbende af sig selv.'))],
      foot: [h('button.btn', { onclick: () => { close(); Pn.saveAs(); } }, icon('download', 14), store.doc.prj ? t('Save as…', 'Gem som…') : t('Save current…', 'Gem nuværende…')),
        h('button.btn', { onclick: () => { close(); Pn.importFile(); } }, icon('upload', 14), t('Import file', 'Importér fil')),
        h('button.btn', { onclick: Pn.exportFile }, icon('download', 14), t('Export file', 'Eksportér fil'))] });
    draw();
  };

  /* ---------- how old the prices are (the warning chip in the top bar) ---------- */
  Pn.priceAge = () => {
    const status = h('p.muted');
    const close = HP.modal({ title: t('Prices are {} old', 'Priserne er {} gamle').replace('{}', HP.pricesAgeText()), size: 'sm',
      body: [h('p', null, t('HiFi Planner read the prices from hifiklubben.dk {}. They are normally read every hour.', 'HiFi Planner hentede priserne fra hifiklubben.dk {}. De hentes normalt hver time.').replace('{}', HP.pricesStamp())),
        h('p', null, t('Until newer prices are in, campaign prices are not shown: every product shows its normal price, so no ended campaign is promised to a customer. Always check the price in the till before you promise it.', 'Indtil nyere priser er hentet, vises kampagnepriser ikke: alle varer står til normalpris, så en udløbet kampagne aldrig bliver lovet til en kunde. Tjek altid prisen i kassen, før du lover den.')),
        status],
      foot: [HP.isAdmin() && HP.editor && HP.editor.runPriceSync ? h('button.btn', { onclick: async () => { status.textContent = '…'; status.textContent = await HP.editor.runPriceSync(); } }, icon('rotate', 14), t('Read the prices now', 'Hent priserne nu')) : null,
        h('button.btn', { onclick: async () => { status.textContent = '…'; const got = await HP.checkCatalogue(); status.textContent = got ? '' : t('No newer prices yet.', 'Ingen nyere priser endnu.'); if (got) close(); } }, t('Check again', 'Tjek igen')),
        h('button.btn.primary', { onclick: () => close() }, t('OK', 'OK'))] });
  };

  /* ---------- Historik: the undo steps as a list ----------
     Each step is named by comparing the drawing before and after it (added, deleted, moved, connected, cable, price…). */
  const KINDS = { text: ['text', 'tekst'], prices: ['price list', 'prisliste'], legend: ['legend', 'signaturforklaring'], plan: ['floor plan', 'plantegning'], zone: ['room', 'rum'], run: ['cable run', 'kabeltræk'], symbol: ['symbol', 'symbol'] };
  const itemName = (it) => {
    if (it.kind === 'product') { const p = cat.get(it.pid); return p ? C().cardName(p, it) : it.pid; }
    if (it.kind === 'mark') { try { return C().markTitle(it.k); } catch (e) { return t('mark', 'mærke'); } }
    const k = KINDS[it.kind]; return k ? t(k[0], k[1]) : t('item', 'element');
  };
  const namesOf = (xs) => xs.length === 1 ? itemName(xs[0]) : xs.length + ' ' + t('items', 'elementer');
  const strip = (o, keys) => { const c = Object.assign({}, o); keys.forEach((k) => delete c[k]); return JSON.stringify(c); };
  const POS = ['x', 'y'], SIZE = ['w', 'h'];
  Pn.stepLabel = (a, b) => {
    const A = new Map(a.items.map((i) => [i.id, i])), B = new Map(b.items.map((i) => [i.id, i]));
    const added = b.items.filter((i) => !A.has(i.id)), removed = a.items.filter((i) => !B.has(i.id));
    if (a.prj !== b.prj && b.prj) return [t('Opened "{}"', 'Åbnede "{}"').replace('{}', b.name || ''), 'folder'];
    if (removed.length && !b.items.length && a.items.length > 1) return [t('Cleared the canvas', 'Ryddede lærredet'), 'eraser'];
    if (added.length && removed.length && !b.items.some((i) => A.has(i.id))) return [t('Opened another proposal', 'Åbnede et andet tilbud'), 'folder'];
    if (added.length && !removed.length) return [t('Added', 'Tilføjede') + ' ' + namesOf(added), 'plus'];
    if (removed.length && !added.length) return [t('Deleted', 'Slettede') + ' ' + namesOf(removed), 'trash'];
    if (added.length) return [t('Changed', 'Ændrede') + ' ' + namesOf(added), 'edit'];
    const AC = new Map((a.conns || []).map((c) => [c.id, c])), BC = new Map((b.conns || []).map((c) => [c.id, c]));
    const cAdd = (b.conns || []).filter((c) => !AC.has(c.id)), cDel = (a.conns || []).filter((c) => !BC.has(c.id));
    const end = (doc, c) => { const i = doc.items.find((x) => x.id === c.a.item), j = doc.items.find((x) => x.id === c.b.item); return (i ? itemName(i) : '?') + ' → ' + (j ? itemName(j) : '?'); };
    if (cAdd.length === 1 && !cDel.length) return [t('Connected', 'Forbandt') + ' ' + end(b, cAdd[0]), 'cable'];
    if (cDel.length && !cAdd.length) return [cDel.length === 1 ? t('Removed the cable', 'Fjernede kablet') + ' ' + end(a, cDel[0]) : cDel.length + ' ' + t('connections removed', 'forbindelser fjernet'), 'cable'];
    if (cAdd.length || cDel.length) return [t('Changed connections', 'Ændrede forbindelser'), 'cable'];
    const changed = b.items.filter((i) => JSON.stringify(i) !== JSON.stringify(A.get(i.id)));
    if (changed.length) {
      const other = changed.filter((i) => strip(i, POS.concat(SIZE)) !== strip(A.get(i.id), POS.concat(SIZE)));
      if (!other.length) return changed.every((i) => strip(i, SIZE) !== strip(A.get(i.id), SIZE)) ? [t('Moved', 'Flyttede') + ' ' + namesOf(changed), 'move'] : [t('Resized', 'Ændrede størrelse på') + ' ' + namesOf(changed), 'fit'];
      if (other.length === 1 && other[0].kind === 'product' && other[0].pid !== A.get(other[0].id).pid) return [t('Replaced with', 'Udskiftede med') + ' ' + itemName(other[0]), 'swap'];
      if (other.length === 1 && other[0].kind === 'text') return [t('Edited the text', 'Redigerede teksten'), 'text'];
      return [t('Changed', 'Ændrede') + ' ' + namesOf(other), 'edit'];
    }
    const cc = (b.conns || []).filter((c) => JSON.stringify(c) !== JSON.stringify(AC.get(c.id)));
    if (cc.length === 1 && (cc[0].cable !== AC.get(cc[0].id).cable || cc[0].lv !== AC.get(cc[0].id).lv || cc[0].m !== AC.get(cc[0].id).m)) { const p = cc[0].cable && cat.get(cc[0].cable); return [t('Cable', 'Kabel') + ': ' + (p ? p.name : t('none', 'intet')), 'cable']; }
    if (cc.length) return [t('Moved a cable', 'Flyttede et kabel'), 'cable'];
    if (a.name !== b.name) return [t('Renamed to "{}"', 'Omdøbte til "{}"').replace('{}', b.name || ''), 'edit'];
    if (JSON.stringify(a.pr) !== JSON.stringify(b.pr)) return [t('Price adjustments', 'Prisjusteringer'), 'tag'];
    if (a.orient !== b.orient) return ['A4 ' + (b.orient === 'portrait' ? t('portrait', 'stående') : t('landscape', 'liggende')), 'rotate'];
    if (a.pages !== b.pages) return [t('Pages', 'Sider') + ': ' + b.pages, 'page'];
    if (a.ci !== b.ci) return [t('CI mode', 'CI-tilstand') + (b.ci ? t(' on', ' til') : t(' off', ' fra')), 'plan'];
    if (a.cardScale !== b.cardScale) return [t('Card size', 'Kortstørrelse') + ' ' + Math.round((b.cardScale || 1) * 100) + '%', 'scale'];
    if (a.prj !== b.prj) return [t('Saved as a project', 'Gemt som projekt'), 'download'];
    return [t('Change', 'Ændring'), 'edit'];
  };
  Pn.history = (anchor) => {
    const tl = store.timeline(), N = 30, lo = Math.max(0, tl.cur - N + 1), hi = Math.min(tl.states.length - 1, tl.cur + 8), docs = [];
    const doc = (j) => docs[j] || (docs[j] = JSON.parse(tl.states[j].s));
    const time = (ms) => new Date(ms).toLocaleTimeString(HP.locale(), { hour: '2-digit', minute: '2-digit' });
    const rows = [];
    for (let j = hi; j >= lo; j--) {
      const [label, ic] = j === 0 ? [t('Start', 'Start'), 'page'] : Pn.stepLabel(doc(j - 1), doc(j));
      rows.push({ label, icon: ic, on: j === tl.cur, note: j === tl.cur ? t('now', 'nu') : time(tl.states[j].t), dim: j > tl.cur, fn: () => store.goTo(j) });
    }
    const r = anchor.getBoundingClientRect();
    HP.menu(r.left, r.bottom + 6, [{ head: t('History', 'Historik') + (lo > 0 ? ' · ' + t('latest {}', 'seneste {}').replace('{}', N) : '') }, ...rows], anchor);
  };

  /* ---------- share link ---------- */
  Pn.share = async () => {
    if (!store.doc.items.length) return HP.toast(t('The canvas is empty. Add something first.', 'Lærredet er tomt. Tilføj noget først.'), { kind: 'warn' });
    const url = await HP.share.url();
    const input = h('input', { value: url, readOnly: true, onfocus: () => input.select() });
    const copy = async () => { try { await navigator.clipboard.writeText(url); } catch (e) { input.select(); document.execCommand('copy'); } HP.toast(t('Link copied', 'Link kopieret'), { kind: 'ok' }); };
    const drafts = store.doc.items.some((i) => i.kind === 'product' && cat.draft.products[i.pid]);
    HP.modal({ title: t('Share this proposal', 'Del dette tilbud'), size: 'md',
      body: [h('.row', null, input, h('button.btn.primary', { onclick: copy }, icon('copy', 14), t('Copy link', 'Kopiér link'))),
        // the customer's link: the same proposal read only on any phone, without logging in (also what the QR code on the cover opens)
        h('.row.custlink', null, h('span.muted', null, t('For the customer (read only, no login):', 'Til kunden (kun visning, uden login):')),
          h('button.btn', { onclick: async () => { HP.stat('Kundelink kopieret'); const u = await HP.share.customerUrl(); try { await navigator.clipboard.writeText(u); } catch (e) { /* ignore */ } HP.toast(t('Customer link copied', 'Kundelink kopieret'), { kind: 'ok' }); } }, icon('link', 14), t('Copy customer link', 'Kopiér kundelink'))),
        h('p.muted', null, t('Anyone who opens the link in HiFi Planner gets a copy of this canvas: products, cables, notes and page setup. The whole proposal is inside the link itself, so nothing is uploaded, and later changes need a new link.', 'Alle, der åbner linket i HiFi Planner, får en kopi af lærredet: produkter, kabler, noter og sideopsætning. Hele tilbuddet ligger i selve linket, så intet uploades, og senere ændringer kræver et nyt link.')),
        store.doc.items.some((i) => i.kind === 'plan') && h('.note-box', null, icon('warn', 15), t('The floor plan image is not included in links. Use Projects → Export file to send it.', 'Plantegningen er ikke med i links. Brug Projekter → Eksportér fil for at sende den.')),
        drafts && h('.note-box', null, icon('warn', 15), t('This canvas uses products you have not published yet. They will show as unknown for others until you publish.', 'Lærredet bruger produkter, du ikke har udgivet endnu. De vises som ukendte for andre, indtil du udgiver.')),
        location.protocol === 'file:' && h('.note-box', null, icon('warn', 15), t('You are running the planner from a local file, so this link only works on this PC. Links from the online version work everywhere.', 'Du kører planneren fra en lokal fil, så linket virker kun på denne PC. Links fra onlineversionen virker overalt.'))] });
    setTimeout(() => input.select(), 60);
  };

  /* ---------- help ---------- */
  Pn.help = () => {
    const k = (x) => h('kbd', null, x);
    const li = (...x) => h('li', null, ...x);
    const close = HP.modal({ title: t('Help', 'Hjælp'), size: 'lg',
      body: h('.help', null,
        h('.help-top', null, h('button.btn.primary', { onclick: () => { close(); HP.tour.start(); } }, icon('play', 14), t('Start guided tour', 'Start guidet rundvisning')),
          HP.config.feedbackUrl && h('a.btn', { href: HP.config.feedbackUrl, target: '_blank', rel: 'noopener' }, t('Send feedback', 'Send feedback')),
          HP.config.supportPhone && h('span.muted', null, t('Urgent support: ', 'Akut support: ') + 'Tlf. ' + HP.config.supportPhone)),
        h('.note-box', null, icon('warn', 15), (HP.priceSyncText() ? HP.priceSyncText() + '. ' : '') + t('Prices are not updated in real time. Never rely on the price list alone; check the till system.', 'Priser opdateres ikke i realtid. Stol aldrig kun på prislisten; tjek kassesystemet.')),
        matchMedia('(pointer: coarse)').matches && h('div', null, h('h3', null, t('Touch screen (phone and iPad)', 'Touchskærm (telefon og iPad)')), h('ul', null,
          li(t('Products button (top left) opens the product list. Tap a product to add it; hold it, then drag, to place it exactly.', 'Knappen Produkter (øverst til venstre) åbner produktlisten. Tryk på et produkt for at tilføje det; hold på det og træk for at placere det præcist.')),
          li(t('One finger on empty canvas moves around. Two fingers pinch to zoom and move.', 'Én finger på tomt lærred flytter rundt. To fingre knibes for at zoome og flytte.')),
          li(t('Hold a product, cable or empty spot to open the menu (the right-click menu on a computer). Hold on empty canvas and drag to select several things.', 'Hold på et produkt, et kabel eller et tomt sted for at åbne menuen (højrekliksmenuen på en computer). Hold på tomt lærred og træk for at markere flere ting.')),
          li(t('Cables: tap an output dot, then an input dot. Zoom in first so the dots are easy to hit.', 'Kabler: tryk på en udgangsprik og derefter en indgangsprik. Zoom ind først, så prikkerne er nemme at ramme.')),
          li(t('On a phone, the ⋯ button holds everything that does not fit in the top bar.', 'På en telefon findes alt det, der ikke er plads til i topbjælken, under knappen ⋯.')))),
        h('.cols', null,
          h('div', null, h('h3', null, t('Build a system', 'Byg et system')), h('ul', null,
            li(t('Drag a product from the list onto the canvas, or click it to add it in the middle.', 'Træk et produkt fra listen ind på lærredet, eller klik for at tilføje det i midten.')),
            li(t('Drag from an output dot (right side) to an input dot (left side) to draw a cable. You can also click one dot, then the other.', 'Træk fra en udgangsprik (højre side) til en indgangsprik (venstre side) for at trække et kabel. Du kan også klikke på én prik og derefter den anden.')),
            li(t('Dot and wire colours show the connector type. A dashed wire with a warning means the two connectors do not match.', 'Farven på prikker og ledninger viser stiktypen. En stiplet ledning med advarsel betyder, at de to stik ikke passer sammen.')),
            li(t('Click a wire to choose a cable. Matching cables are listed first. Drag a wire sideways to tidy its route.', 'Klik på en ledning for at vælge et kabel. Passende kabler vises først. Træk en ledning sidelæns for at rydde op i føringen.')),
            li(t('Click a card image to flip between front and back. Double-click it (or press Alt+I) to inspect it full screen, e.g. to show a customer the rear panel. Zooming in on the canvas also loads sharper images.', 'Klik på et kortbillede for at skifte mellem for- og bagside. Dobbeltklik på det (eller tryk Alt+I) for at se det i fuld skærm, fx for at vise en kunde bagpanelet. Når du zoomer ind på lærredet, hentes også skarpere billeder.')),
            li(t('Select a card and press Replace (or drop another product on top of it) to swap the product and keep its cables.', 'Markér et kort og tryk Udskift (eller slip et andet produkt oven på det) for at skifte produktet og beholde kablerne.')),
            li(t('The round badges on a card show Bluetooth and WiFi. Variants: colours are dots on the image (one click to switch); sizes, models and lengths are a label on the image that lists them all (also Alt+C). The price list follows the chosen variant.', 'De runde mærker på et kort viser Bluetooth og WiFi. Varianter: farver er prikker på billedet (ét klik for at skifte); størrelser, modeller og længder er en etiket på billedet, der viser dem alle (også Alt+C). Prislisten følger den valgte variant.')))),
          h('div', null, h('h3', null, t('Proposal & print', 'Tilbud & print')), h('ul', null,
            li(t('The frame on the canvas is an A4 page. What is inside the frame is what gets printed. Add pages with the + on the right.', 'Rammen på lærredet er en A4-side. Det, der ligger inden for rammen, bliver printet. Tilføj sider med + til højre.')),
            li(t('Print / PDF opens the print dialog. Choose "Save as PDF" to email the proposal.', 'Print / PDF åbner printdialogen. Vælg "Gem som PDF" for at maile tilbuddet.')),
            li(t('Price list adds a movable list with all products, cables and the total.', 'Prisliste tilføjer en flytbar liste med alle produkter, kabler og total.')),
            li(t('Text adds a note. Drag the top edge to move it, the corner to resize.', 'Tekst tilføjer en note. Træk i den øverste kant for at flytte, hjørnet for at ændre størrelse.')),
            li(t('Cards − / + makes all product cards smaller or larger relative to the A4 page, so bigger systems fit on one page.', 'Kort − / + gør alle produktkort mindre eller større i forhold til A4-siden, så større systemer kan være på én side.')),
            li(t('The eraser in the top bar clears the canvas. You can undo it.', 'Viskelæderet i topbjælken rydder lærredet. Det kan fortrydes.')),
            li(t('Shortcuts are ready-made systems. Click or drag one onto the canvas.', 'Genveje er færdige systemer. Klik eller træk en ind på lærredet.')),
            li(t('Select a card or mark and switch off "In price list" to leave it out of the prices, for example the cards of a wiring diagram when the floor plan already counts the products.', 'Markér et kort eller mærke og slå "I prislisten" fra for at udelade det af priserne, f.eks. kortene i et tilslutningsdiagram, når plantegningen allerede tæller produkterne.')),
            li(t('CI mode is for floor plans. Upload a plan (JPG, PNG or PDF), then click a product and click on the plan once per speaker: each product gets a lettered mark (A, B, C…). Esc or right-click stops placing. The legend lists every mark with its quantity.', 'CI-tilstand er til plantegninger. Upload en plan (JPG, PNG eller PDF), klik på et produkt, og klik på planen én gang pr. højtaler: hvert produkt får et mærke med bogstav (A, B, C…). Esc eller højreklik stopper placeringen. Signaturforklaringen viser alle mærker med antal.')),
            li(t('The bar in CI mode also has symbols for rack, router, TV, listening position, volume control and cable outlet. Switch CI mode off to add normal product cards, for example a wiring diagram on page 2; cards show the same letter as their marks. Room gives a subtotal per room in the price list; Scale and Cable give cable lengths in metres and add the cable to the prices.', 'Bjælken i CI-tilstand har også symboler for rack, router, TV, lytteposition, volumenkontrol og kabeludtag. Slå CI-tilstand fra for at tilføje almindelige produktkort, f.eks. et tilslutningsdiagram på side 2; kortene viser samme bogstav som deres mærker. Rum giver en subtotal pr. rum i prislisten; Målestok og Kabel giver kabellængder i meter og lægger kablet til priserne.')),
            li(t('Projects saves proposals in this browser and exports them as files.', 'Projekter gemmer tilbud i denne browser og eksporterer dem som filer.')),
            li(t('Share link copies a link that opens this exact canvas on any PC, handy for sending a proposal to a colleague.', 'Del link kopierer et link, der åbner netop dette lærred på en hvilken som helst PC; praktisk til at sende et tilbud til en kollega.'))))),
        h('h3', null, t('Search', 'Søgning')),
        h('p', null, t('Search by model, brand, SKU, category, port name (e.g. "HDMI eARC", "PHONO IN") or "bluetooth" / "wifi". Combine words with spaces. Use "Peripherals" or "Stand-in" for generic stand-in products.', 'Søg på model, brand, SKU, kategori, portnavn (fx "HDMI eARC", "PHONO IN") eller "bluetooth" / "wifi". Kombinér ord med mellemrum. Brug "Peripherals" eller "Stand-in" for generiske stand-in-produkter.')),
        h('h3', null, t('Keyboard', 'Tastatur')),
        h('p.muted', null, t('Right-click anywhere on the canvas for a menu with all actions and their shortcuts.', 'Højreklik hvor som helst på lærredet for en menu med alle handlinger og deres genveje.')),
        h('.keys', null, [[['Del'], t('Delete selection', 'Slet markering')], [['Ctrl', 'Z'], t('Undo', 'Fortryd')], [['Ctrl', 'Y'], t('Redo', 'Annuller fortryd')], [['Ctrl', 'C'], t('Copy', 'Kopiér')], [['Ctrl', 'V'], t('Paste', 'Indsæt')], [['Ctrl', 'D'], t('Duplicate', 'Dublér')], [['Ctrl', 'S'], t('Save', 'Gem')], [['Ctrl', 'Shift', 'S'], t('Save as', 'Gem som')], [['Ctrl', 'O'], t('Open project', 'Åbn projekt')], [['Ctrl', 'Shift', 'L'], t('Share link', 'Del link')], [['Ctrl', 'P'], t('Print / PDF', 'Print / PDF')], [['Ctrl', 'A'], t('Select all', 'Markér alt')],
          [[t('Type', 'Skriv')], t('Search products (anywhere on the canvas)', 'Søg produkter (hvor som helst på lærredet)')], [['Enter'], t('In the search: add the highlighted result (the first one, or pick with ↓/↑)', 'I søgningen: tilføj det markerede resultat (det første, eller vælg med ↓/↑)')], [['Shift', 'Enter'], t('In the search: open the Katalog with it', 'I søgningen: åbn Katalog med den')], [['Alt', 'K'], t('Open the Katalog', 'Åbn Katalog')],
          [['Alt', 'T'], t('Add text', 'Tilføj tekst')], [['Alt', '1'], t('Overview: everything on the canvas', 'Oversigt: alt på lærredet')], [['Alt', 'R'], t('Replace selected card', 'Udskift markeret kort')], [['Alt', 'B'], t('Flip front/back', 'Vend for/bag')], [['Alt', 'C'], t('Variant', 'Variant')], [['Alt', 'I'], t('Inspect image', 'Se billedet nærmere')], [['Alt', 'L'], t('Lock floor plan', 'Lås plantegning')], [[']'], t('Bring to front', 'Placér forrest')], [['['], t('Send to back', 'Placér bagerst')],
          [['Shift', '1'], t('Fit to window', 'Tilpas til vindue')], [['F3'], t('Price list', 'Prisliste')], [['/'], t('Search products', 'Søg produkter')], [[t('Drag', 'Træk')], t('Box select (Shift adds)', 'Markér med boks (Shift tilføjer)')], [[t('Right-drag', 'Højretræk')], t('Pan', 'Panorér')],
          [['←↑↓→'], t('Nudge selection', 'Flyt markering')], [[t('Scroll', 'Scroll')], 'Zoom'], [[t('Middle button', 'Midterknap'), t('drag', 'træk')], t('Pan', 'Panorér')], [['Space', t('drag', 'træk')], t('Pan', 'Panorér')], [['Ctrl', 'S'], t('Projects', 'Projekter')], [['Ctrl', 'Shift', 'S'], t('Share link', 'Del link')], [['Ctrl', 'P'], 'Print / PDF'], [['Esc'], t('Cancel', 'Annullér')]]
          .map(([keys, label]) => h('.key', null, h('span', null, keys.map(k)), label))),
        h('h3', null, t('Categories', 'Kategorier')),
        h('.cattree', null, HP.CAT_TREE.map(([g, subs]) => h('details', null, h('summary', null, HP.catLabel(g)), h('ul', null, subs.map((s) => h('li', null, HP.catLabel(s)))))))) });
  };

  /* ---------- statistics (admin): Umami's read-only share page, embedded ----------
     Umami Cloud's free plan has no API, so the modal shows the website's share URL (Umami → the website → Edit → Share URL, with
     Realtime and Events ticked). The link is kept in this browser only (anyone with it can read the statistics). If Umami does
     not allow being shown inside another page, the frame stays empty: "Åbn i ny fane" opens the same page. */
  /* ---------- Oversigt: what is on the canvas, like layers in Photoshop ----------
     Topmost first. Click selects (Ctrl/⌘ adds, Shift selects a range), double-click zooms to it, hovering outlines it on the canvas,
     right-click opens its menu, dragging a row up or down changes what lies on top. A CI mark letter is one row (all its marks).
     Each row: its price (click: Prisjusteringer), hide (not drawn, printed or priced while hidden), "in the price list", delete.
     Right-click a row that is part of the selection: the menu for the whole selection, as on the canvas. Alt+1 or Oversigt in the
     top bar; open by default. */
  let layersEl = null;
  Pn.layersOpen = () => !!(layersEl && !layersEl.hidden);
  Pn.layers = (on) => {
    if (!layersEl) buildLayers();
    layersEl.hidden = on == null ? !layersEl.hidden : !on;
    LS.set('layersShown', !layersEl.hidden);
    if (!layersEl.hidden) drawLayers();
    HP.emit('layers');
  };
  let drawLayers = () => {};
  function buildLayers() {
    const list = h('.ly-list'), count = h('span.ly-n');
    const onlyProducts = h('input', { type: 'checkbox', checked: LS.get('layersProducts', false), onchange: () => { LS.set('layersProducts', onlyProducts.checked); drawLayers(); } });
    layersEl = h('aside#layers', { hidden: true },
      h('.ly-head', null, icon('layers', 15), h('b', null, t('Overview', 'Oversigt')), count, h('label.check.ly-only', { title: t('Show products only', 'Vis kun produkter') }, onlyProducts, h('span', null, t('Products', 'Produkter'))),
        h('button.icon-btn.sm', { title: t('Close (Alt+1)', 'Luk (Alt+1)'), onclick: () => Pn.layers(false) }, icon('x', 14))),
      list);
    document.getElementById('main').append(layersEl);
    let anchorRow = null, hover = null;
    const KIND = { text: ['Text', 'Tekst', 'text'], prices: ['Price list', 'Prisliste', 'tag'], legend: ['Legend', 'Signaturforklaring', 'tag'], plan: ['Floor plan', 'Plantegning', 'plan'], zone: ['Room', 'Rum', 'page'], run: ['Cable run', 'Kabeltræk', 'cable'] };
    drawLayers = () => {
      if (!layersEl || layersEl.hidden) return;
      const d = store.doc, rows = [], seenMk = new Set(), prices = C().priceRows();
      const priceOfKey = new Map(prices.list.map((r) => [r.key, r]));
      d.items.slice().reverse().forEach((it) => {
        if (it.kind === 'mark') {
          if (seenMk.has(it.k)) return; seenMk.add(it.k);
          const all = d.items.filter((x) => x.kind === 'mark' && x.k === it.k), p = it.k[0] !== '@' && cat.get(it.k);
          if (onlyProducts.checked && !p) return;
          return rows.push({ ids: all.map((x) => x.id), it, mark: true, p, label: C().markTitle(it.k), qty: all.length, html: C().markHtml(it.k) });
        }
        if (it.kind === 'product') { const p = cat.get(it.pid); return rows.push({ ids: [it.id], it, p, label: p ? p.brand + ' ' + C().cardName(p, it) : it.pid }); }
        if (onlyProducts.checked) return;
        const k = KIND[it.kind] || ['Item', 'Element', 'page'];
        const sub = it.kind === 'text' ? (it.title || it.body || '').split('\n')[0] : it.kind === 'zone' ? it.name || '' : '';
        rows.push({ ids: [it.id], it, other: true, label: t(k[0], k[1]) + (sub ? ': ' + sub : ''), ic: k[2] });
      });
      const nProd = rows.filter((r) => r.p).reduce((n, r) => n + (r.mark ? r.qty : 1), 0);
      count.textContent = nProd ? nProd + ' ' + t(nProd === 1 ? 'product' : 'products', nProd === 1 ? 'produkt' : 'produkter') : '';
      list.textContent = '';
      if (!rows.length) list.append(h('.ly-empty.muted', null, t('Nothing on the canvas yet.', 'Intet på lærredet endnu.')));
      rows.forEach((r, i) => {
        const it = r.it, p = r.p, sel = r.ids.every((id) => store.sel.has(id));
        const v = p && !r.mark && HP.variantOf(p, it), key = p && !r.mark ? C().rowKeyOf(it) : p ? p.id + '|' : '', pr = key && priceOfKey.get(key);
        const thumb = r.html ? h('span.ly-mk', { html: r.html }) : p ? HP.imgEl((HP.imagesOf(p, it) || [])[0] || (p.img || [])[0] || '', 'thumb') : icon(r.ic, 15);
        const priced = p && !it.np;
        const row = h('.ly-row' + (sel ? '.sel' : '') + (r.other ? '.other' : '') + (p && p.gone ? '.gone' : '') + (it.np ? '.np' : '') + (r.ids.every((id) => store.item(id).hid) ? '.hid' : ''), { data: { i: String(i) }, draggable: false },
          h('span.ly-grip', { title: t('Drag to change what lies on top', 'Træk for at ændre, hvad der ligger øverst') }, '⋮⋮'),
          h('span.ly-th', null, thumb),
          h('span.ly-name', { title: r.label + (p && (p.sku || C().skuOf(it)) ? ' · ' + (C().skuOf(it) || p.sku) : '') },
            h('b', null, r.label), h('small', null, [r.mark ? r.qty + ' ' + t('marks', 'mærker') : null, v ? v.label : null, it.sy ? 'system' : null, p && p.gone ? t('discontinued', 'udgået') : null, it.hid ? t('hidden', 'skjult') : it.np ? t('not priced', 'ikke i pris') : null].filter(Boolean).join(' · '))),
          p && !r.mark ? h('button.ly-price' + (pr && pr.custom ? '.custom' : ''), { title: t('Edit prices for this line', 'Rediger priser for denne linje'), onclick: (e) => { e.stopPropagation(); Pn.projectPrices(key); } }, priced && pr && !pr.noPrice ? HP.money(pr.price) : '–') : h('span'),
          !['plan', 'prices', 'legend'].includes(it.kind) ? h('button.icon-btn.sm.ly-hide' + (r.ids.every((id) => store.item(id).hid) ? '.off' : ''), { title: r.ids.every((id) => store.item(id).hid) ? t('Hidden (not drawn, printed or priced): click to show', 'Skjult (tegnes, printes og prissættes ikke): klik for at vise') : t('Hide: not drawn, printed or priced while hidden', 'Skjul: tegnes, printes og prissættes ikke, mens den er skjult'),
            onclick: (e) => { e.stopPropagation(); C().setHidden(r.ids, !r.ids.every((id) => store.item(id).hid)); } }, icon(r.ids.every((id) => store.item(id).hid) ? 'eyeoff' : 'eye', 13)) : h('span'),
          p ? h('button.icon-btn.sm.ly-np' + (it.np ? '' : '.on'), { title: it.np ? t('Not in the price list: click to count it', 'Ikke i prislisten: klik for at tælle den med') : t('In the price list: click to leave it out', 'I prislisten: klik for at udelade den'),
            onclick: (e) => { e.stopPropagation(); const on = !r.ids.every((id) => store.item(id).np); r.ids.forEach((id) => { const x = store.item(id); if (on) x.np = 1; else delete x.np; }); store.commit(); } }, icon('tag', 13)) : h('span'),
          it.kind !== 'plan' ? h('button.icon-btn.sm.ly-del', { title: t('Delete', 'Slet'), onclick: (e) => { e.stopPropagation(); C().select(r.ids); C().deleteSelection(); } }, icon('trash', 13)) : h('span'));
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          let ids = r.ids;
          if (e.shiftKey && anchorRow != null) { const [a, b] = [Math.min(anchorRow, i), Math.max(anchorRow, i)]; ids = rows.slice(a, b + 1).flatMap((x) => x.ids); }
          else if (e.ctrlKey || e.metaKey) { const cur = new Set(store.sel); const all = r.ids.every((id) => cur.has(id)); r.ids.forEach((id) => (all ? cur.delete(id) : cur.add(id))); ids = [...cur]; anchorRow = i; }
          else anchorRow = i;
          C().select(ids);
        });
        row.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) C().zoomTo(r.ids); });
        // right-click: the canvas menu for the selection when this row is part of it (several products: what they share), else for this row
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); const inSel = r.ids.every((id) => store.sel.has(id)); C().itemMenu(inSel ? [...store.sel] : r.ids, e.clientX, e.clientY); });
        row.addEventListener('pointerenter', () => { hover = r.ids; C().highlight(r.ids, true); });
        row.addEventListener('pointerleave', () => { C().highlight(r.ids, false); hover = null; });
        // drag a row up or down: what lies on top changes (the floor plan stays at the bottom)
        row.querySelector('.ly-grip').addEventListener('pointerdown', (e) => {
          if (it.kind === 'plan') return;
          e.preventDefault(); const sy = e.clientY, rowsEl = [...list.querySelectorAll('.ly-row')], line = h('.ly-drop'); let to = null;
          row.classList.add('dragging'); list.append(line);
          const mv = (ev) => {
            const y = ev.clientY; to = rowsEl.length; for (let k = 0; k < rowsEl.length; k++) { const b = rowsEl[k].getBoundingClientRect(); if (y < b.top + b.height / 2) { to = k; break; } }
            const ref = rowsEl[Math.min(to, rowsEl.length - 1)].getBoundingClientRect(), lb = list.getBoundingClientRect();
            line.style.top = (to < rowsEl.length ? ref.top : ref.bottom) - lb.top + list.scrollTop - 1 + 'px'; line.hidden = Math.abs(y - sy) < 4;
          };
          const up = () => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); row.classList.remove('dragging'); line.remove();
            if (to == null || to === i || to === i + 1) return;
            // the list is topmost first: moving row i to position "to" (before row "to") = above rows[to] in the stack
            const movers = r.ids.map((id) => store.item(id)), items = store.doc.items.filter((x) => !movers.includes(x));
            const above = rows[to] && rows[to].ids[0] && store.item(rows[to].ids[0]); // goes just above this one (later in d.items)
            let at = above ? items.indexOf(above) + 1 : 0;
            const plan = items.findIndex((x) => x.kind === 'plan'); if (plan >= 0 && at <= plan) at = plan + 1;
            if (!above) at = Math.max(at, plan + 1);
            items.splice(at, 0, ...movers); store.doc.items = items; store.commit();
          };
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
        list.append(row);
      });
      if (hover) C().highlight(hover, true);
      const s = list.querySelector('.ly-row.sel'); if (s && !layersEl.contains(document.activeElement)) s.scrollIntoView({ block: 'nearest' });
    };
    HP.on('doc', drawLayers); HP.on('sel', drawLayers); HP.on('catalog', drawLayers);
  }

  /* ---------- price adjustments ----------
     Prices and discounts for this proposal only (d.pr; the catalogue is not touched), the way Business Central's POS works: the
     line discounts are the truth (d.pr.l[key].d, kr), everything else follows from them and responds at once:
       - a line: its unit price (Ændr pris; empty = the website's), its discount in kr or in %;
       - Ekstra rabat (kr or %) = the sum of the line discounts; typing a total spreads it over the lines in proportion to their
         amounts (whole kroner, the remainder on the largest line) and replaces their discounts;
       - the website's own discount (its FØR price) is a campaign discount: shown per line and in the totals, and the customer's
         saving is counted from the normal price. "Også på kampagnevarer" decides whether a total is spread over campaign lines too.
     Every change is one Undo step. The price list, the cover, the customer's page and the order lines follow (C.applyPr). */
  Pn.hasProjectPrices = () => HP.hasPr(store.doc.pr);
  // what the price adjustments come to: kroner off the website's prices (or "ændret" when prices were raised), else how many are only
  // saved for products not in the price list now
  Pn.priceState = () => {
    const d = store.doc; if (!HP.hasPr(d.pr)) return null;
    const R = C().priceRows(), keys = new Set(R.list.map((r) => r.key)), off = R.list.reduce((s, x) => s + x.list * x.qty, 0) - R.total;
    const away = Object.keys((d.pr && d.pr.l) || {}).filter((k) => !keys.has(k)).length, active = R.custom;
    return { active, off, away, text: active ? (off > 0 ? '−' + HP.money(off) : off < 0 ? '+' + HP.money(-off) : t('changed', 'ændret')) : away + ' ' + t('saved', 'gemt') };
  };
  Pn.priceSummary = () => { const s = Pn.priceState(); return s ? s.text : ''; };
  // clear every price adjustment at once, with Undo in the toast (no question first)
  Pn.clearProjectPrices = () => {
    if (!HP.hasPr(store.doc.pr)) return;
    delete store.doc.pr; store.commit();
    HP.toast(t('Price adjustments removed', 'Prisjusteringer fjernet'), { kind: 'ok', ms: 7000, action: { label: t('Undo', 'Fortryd'), fn: store.undo } });
  };
  // spread an amount over lines in proportion to their weight: whole kroner, the remainder on the largest, never more than a line's weight
  const spread = (total, weights) => {
    const W = weights.reduce((a, b) => a + b, 0); if (!W || total <= 0) return weights.map(() => 0);
    total = Math.min(Math.round(total), Math.floor(W));
    const out = weights.map((w) => Math.min(w, Math.floor(total * w / W)));
    let left = total - out.reduce((a, b) => a + b, 0);
    const order = weights.map((w, i) => i).sort((i, j) => weights[j] - weights[i]);
    for (let k = 0; left > 0 && k < order.length * 2; k++) { const i = order[k % order.length], room = Math.floor(weights[i] - out[i]); if (room > 0) { const add = Math.min(room, left); out[i] += add; left -= add; } }
    return out;
  };
  Pn.projectPrices = (focusKey) => {
    const d = store.doc;
    const pr = () => (d.pr = d.pr || { l: {} }, d.pr.l = d.pr.l || {}, d.pr);
    const num = (v) => { const s = String(v).trim().replace(/\s|kr\.?|,-|%/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'); return s === '' ? null : +s; };
    const fmt = (n, dec) => (n == null ? '' : String(Math.round(n * (dec ? 10 : 100)) / (dec ? 10 : 100)).replace('.', ','));
    const tidy = () => { const p = d.pr; if (!p) return; Object.keys(p.l || {}).forEach((k) => { const o = p.l[k]; if (!o || (o.p == null && !o.d && !o.r)) delete p.l[k]; }); if (!p.ta) delete p.ta; if (!p.tp) delete p.tp; if (!HP.hasPr(p)) delete d.pr; };
    const commit = () => { tidy(); store.commit(); draw(); };
    const stackOn = () => LS.get('ppStack', true); // a total discount is spread over campaign lines too
    const gross = (r) => r.price * r.qty, isCamp = (r) => r.base > r.list;
    // a line's discount is stored as a percentage (r) of its amount before discount, so it follows quantity and price (as in BC)
    const setLine = (key, patch) => { const l = pr().l; l[key] = Object.assign({}, l[key], patch); ['p', 'r', 'd'].forEach((k) => { if (l[key][k] == null || (k !== 'p' && !l[key][k])) delete l[key][k]; }); };
    const discKr = (key, kr, g) => setLine(key, { d: undefined, r: kr && g ? Math.round(kr / g * 1e8) / 1e6 : undefined }); // 6 decimals: the same kroner back, short links
    // a total discount (kr) → line discounts; the rows are read without any old-style total (ta/tp) so their amounts are the lines' own
    const spreadTotal = (kr, pct) => {
      const p = pr(); delete p.ta; delete p.tp;
      const R = C().priceRows().list, w = R.map((r) => (stackOn() || !isCamp(r) ? gross(r) : 0));
      if (pct != null) { R.forEach((r, i) => setLine(r.key, { d: undefined, r: w[i] && pct ? Math.min(pct, 100) : undefined })); return w.some(Boolean) || !pct; } // a percentage: each line's own share, rounded per line
      if (kr > 0 && !w.some(Boolean)) { HP.toast(t('Every line is on campaign: tick "also campaign items" to spread it over them', 'Alle linjer har kampagnepris: sæt flueben i "også kampagnevarer" for at fordele rabatten på dem'), { kind: 'warn' }); return false; }
      const sum = w.reduce((a, b) => a + b, 0);
      if (kr > sum) HP.toast(t('The discount is limited to the amount of the lines', 'Rabatten er begrænset til linjernes beløb'), { kind: 'warn' });
      spread(kr, w).forEach((v, i) => discKr(R[i].key, v, w[i]));
      return true;
    };
    // an old-style total discount (set before 2026-11-24) is turned into line discounts once
    if (d.pr && (d.pr.ta || d.pr.tp)) { const R0 = C().priceRows(); const kr = R0.tdisc; delete d.pr.ta; delete d.pr.tp; const sum0 = R0.list.reduce((a, r) => a + r.amount, 0);
      spread(kr, R0.list.map((r) => r.amount)).forEach((v, i) => { const r = R0.list[i]; discKr(r.key, (r.ldisc || 0) + v, gross(r)); }); if (sum0) { tidy(); store.commit(); } }
    let selKey = focusKey || null, refocus = null, lastTotal = null; // the total typed last ({ kr } or { pct }): kept when "også kampagnevarer" changes
    const table = h('.pp-lines'), sum = h('.pp-sum');
    const tile = (label, sub, fn, cls, ic) => h('button.pp-act' + (cls || ''), { onclick: fn }, icon(ic || 'tag', 15), h('b', null, label), h('span', null, sub));
    const focusIn = (sel) => { const el = body.querySelector(sel); if (el) { el.focus(); el.select && el.select(); } };
    const needLine = (what) => { if (!selKey) { HP.toast(t('Click a line first', 'Klik først på en linje'), { kind: 'warn' }); return false; } focusIn('.pp-row[data-key="' + CSS.escape(selKey) + '"] input.' + what); return true; };
    const acts = h('.pp-acts', null,
      tile(t('Line Discount Amount', 'Linjerabatbeløb'), t('kr or % off the selected line', 'kr. eller % af den valgte linje'), () => needLine('ld'), '', 'minus'),
      tile(t('Total Disc Amount', 'Total rabatbeløb'), t('kr, spread over the lines', 'kr., fordelt på linjerne'), () => focusIn('input.ta'), '', 'minus'),
      tile(t('Total Discount %', 'Total rabat %'), t('%, spread over the lines', '%, fordelt på linjerne'), () => focusIn('input.tp'), '', 'minus'),
      tile(t('Reset Discounts', 'Nulstil rabatter'), t('back to the website prices', 'tilbage til hjemmesidens priser'), () => {
        if (!Pn.hasProjectPrices()) return;
        if (!confirm(t('Remove all price adjustments and discounts from this proposal?', 'Fjern alle prisjusteringer og rabatter fra tilbuddet?'))) return;
        delete d.pr; commit(); HP.toast(t('Back to the website prices', 'Tilbage til hjemmesidens priser'), { kind: 'ok', action: { label: t('Undo', 'Fortryd'), fn: () => { store.undo(); draw(); } } });
      }, '.reset', 'undo'),
      tile(t('Change Price', 'Ændr pris'), t('unit price of the selected line', 'enhedspris på den valgte linje'), () => needLine('up'), '', 'edit'));
    const field = (cls, value, ph, onset, opts) => {
      const show = (v) => (v == null || v === 0 && opts && opts.blank0 ? '' : fmt(v, opts && opts.pct));
      const inp = h('input.' + cls, { type: 'text', inputMode: 'decimal', value: show(value), placeholder: ph, title: (opts && opts.title) || '',
        onfocus: (e) => { e.target.select(); if (opts && opts.key) selectRow(opts.key); },
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); refocus = opts && opts.next ? opts.next(e.shiftKey ? -1 : 1) : null; e.target.blur(); }
          else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = show(value); e.target.blur(); }
        },
        onblur: (e) => {
          const v = num(e.target.value), same = (v == null ? (opts && opts.blank0 ? 0 : null) : v) === (value == null ? (opts && opts.blank0 ? 0 : null) : value) || (v != null && value != null && Math.abs(v - value) < (opts && opts.pct ? 0.05 : 0.005));
          if (same) { e.target.value = show(value); if (refocus) { const r = refocus; refocus = null; focusIn(r); } return; }
          if (v != null && (isNaN(v) || v < 0)) { e.target.value = show(value); return HP.toast(t('Not a valid number', 'Ikke et gyldigt tal'), { kind: 'err' }); }
          onset(v);
          if (refocus) { const r = refocus; refocus = null; setTimeout(() => focusIn(r)); }
        } });
      return inp;
    };
    const selectRow = (k) => { selKey = k; table.querySelectorAll('.pp-row').forEach((r) => r.classList.toggle('sel', r.dataset.key === k)); };
    const pctOff = (part, whole) => (whole > 0 ? Math.round(part / whole * 1000) / 10 : 0);
    function draw() {
      const R = C().priceRows(), L = (d.pr && d.pr.l) || {}, keys = R.list.map((r) => r.key);
      if (selKey && !keys.includes(selKey)) selKey = null;
      const nextOf = (k, cls) => (dir) => { const i = keys.indexOf(k) + dir; return i >= 0 && i < keys.length ? '.pp-row[data-key="' + CSS.escape(keys[i]) + '"] input.' + cls : null; };
      const active = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
      const keep = active && active.closest('.pp-row') ? '.pp-row[data-key="' + CSS.escape(active.closest('.pp-row').dataset.key) + '"] input.' + active.className : active && active.matches('input.ta, input.tp') ? 'input.' + active.className : null;
      table.textContent = '';
      table.append(h('.pp-row.head', null, h('span'), h('span', null, t('Product', 'Produkt')), h('span.n', null, t('Qty', 'Antal')), h('span.n', null, t('Normal price', 'Normalpris')),
        h('span.n', null, t('Unit price', 'Enhedspris')), h('span.n', null, t('Discount kr', 'Rabat kr.')), h('span.n', null, t('Discount %', 'Rabat %')), h('span.n', null, t('Amount', 'Beløb')), h('span')));
      if (!R.list.length) table.append(h('.muted.pp-empty', null, t('No products in the price list yet.', 'Ingen produkter i prislisten endnu.')));
      R.list.forEach((r) => {
        const o = L[r.key] || {}, unit = r.cableM ? ' / m' : '', g = gross(r), camp = isCamp(r), off = pctOff(r.base * r.qty - r.amount, r.base * r.qty);
        const row = h('.pp-row' + (r.custom ? '.custom' : '') + (r.key === selKey ? '.sel' : ''), { data: { key: r.key }, onclick: (e) => { if (!e.target.closest('input, button')) selectRow(r.key); } },
          h('span.pp-img', null, r.img ? HP.imgEl(r.img, 'thumb') : null),
          h('span.pp-name', null, h('b', null, r.name), h('small', null, (r.sku || '') + (r.sys ? ' · system' : ''))),
          h('span.n', null, r.cableM ? r.qty + ' m' : r.qty),
          h('span.n.muted', null, HP.money(r.base) + unit, camp ? h('em.pp-camp', { title: t('The website\'s campaign price: ', 'Hjemmesidens kampagnepris: ') + HP.money(r.list) }, t('campaign ', 'kampagne ') + '−' + fmt(pctOff(r.base - r.list, r.base), 1) + ' %') : null),
          h('span.n', null, field('up', o.p != null ? o.p : null, fmt(r.list), (v) => { if (o.d && !o.r && g) setLine(r.key, { d: undefined, r: r.ldisc / g * 100 }); setLine(r.key, { p: v == null || v === r.list ? undefined : v }); commit(); },
            { key: r.key, next: nextOf(r.key, 'up'), title: t('Unit price for this proposal (empty: the website price, ', 'Enhedspris i dette tilbud (tom: hjemmesidens pris, ') + HP.money(r.list) + ')' })),
          h('span.n', null, field('ld', r.ldisc, '0', (v) => { if (v > g) { v = g; HP.toast(t('The discount is limited to the line amount', 'Rabatten er begrænset til linjens beløb'), { kind: 'warn' }); } discKr(r.key, v ? Math.round(v * 100) / 100 : 0, g); commit(); },
            { key: r.key, next: nextOf(r.key, 'ld'), blank0: true, title: t('Kroner off this line', 'Kroner af denne linje') })),
          h('span.n', null, field('lp', o.r != null ? o.r : g ? r.ldisc / g * 100 : 0, '0', (v) => { setLine(r.key, { d: undefined, r: v ? Math.min(v, 100) : undefined }); commit(); },
            { key: r.key, next: nextOf(r.key, 'lp'), blank0: true, pct: true, title: t('Percent off this line (of its unit price)', 'Procent af denne linje (af enhedsprisen)') })),
          h('span.n.amt', null, r.was ? h('s', null, HP.money(r.base * r.qty)) : null, HP.money(r.amount), off > 0 ? h('em.pp-off', { title: t('Off the normal price, all in', 'Af normalprisen i alt') }, '−' + fmt(off, 1) + ' %') : null),
          h('span', null, r.custom ? h('button.icon-btn.sm', { title: t('Back to the website price for this line', 'Tilbage til hjemmesidens pris for linjen'), onclick: () => { delete pr().l[r.key]; commit(); } }, icon('undo', 13)) : null));
        table.append(row);
      });
      // prices saved on the proposal for products that are not in the price list now (deleted, hidden, another variant): they come
      // back when the product does
      const away = Object.keys(L).filter((k) => !keys.includes(k));
      if (away.length) table.append(h('.pp-away', null, h('.pp-away-h', null, t('Saved for products not in the price list now (used again if they come back)', 'Gemt for varer, der ikke er i prislisten nu (bruges igen, hvis de kommer tilbage)')),
        away.map((k) => { const o = L[k], [id, lab] = k.split('|'), b = id === 'sys' && cat.system(lab), q = !b && cat.get(id);
          const nm = b ? cat.systemName(b) : q ? q.brand + ' ' + q.name + (lab ? ' (' + lab + ')' : '') : k;
          return h('.pp-away-r', null, h('span', null, nm), h('span.muted', null, [o.p != null ? t('price ', 'pris ') + HP.money(o.p) : null, o.r ? t('discount ', 'rabat ') + fmt(o.r, 1) + ' %' : o.d ? t('discount ', 'rabat ') + HP.money(o.d) : null].filter(Boolean).join(' · ')),
            h('button.icon-btn.sm', { title: t('Forget', 'Glem'), onclick: () => { delete pr().l[k]; commit(); } }, icon('x', 13))); })));
      // totals, all worked out from the lines
      const normal = R.list.reduce((a, r) => a + r.base * r.qty, 0), web = R.list.reduce((a, r) => a + r.list * r.qty, 0), grossAll = R.list.reduce((a, r) => a + gross(r), 0);
      const campKr = normal - web, changeKr = web - grossAll, extra = R.list.reduce((a, r) => a + r.ldisc, 0) + (R.tdisc || 0);
      const stack = h('input', { type: 'checkbox', checked: stackOn(), onchange: () => { LS.set('ppStack', stack.checked); if (extra > 0) { if (lastTotal && lastTotal.pct != null) spreadTotal(null, lastTotal.pct); else spreadTotal(extra); commit(); } } });
      sum.textContent = '';
      sum.append(...[
        h('.pp-srow', null, h('span', null, t('Normal price', 'Normalpris i alt')), h('b', null, HP.money(normal))),
        campKr > 0 ? h('.pp-srow.pp-campr', null, h('span', null, t('Campaign discount (hifiklubben.dk)', 'Kampagnerabat (hifiklubben.dk)')), h('span.muted', null, fmt(pctOff(campKr, normal), 1) + ' %'), h('b', null, '−' + HP.money(campKr))) : null,
        changeKr ? h('.pp-srow', null, h('span', null, changeKr > 0 ? t('Price changes', 'Prisændringer') : t('Price changes (added)', 'Prisændringer (tillæg)')), h('b', null, (changeKr > 0 ? '−' : '+') + HP.money(Math.abs(changeKr)))) : null,
        h('.pp-srow.pp-tot', null, h('span', null, t('Extra discount', 'Ekstra rabat')),
          h('label.check.pp-stack', { title: t('Spread a total discount over lines already on campaign too', 'Fordel også en total rabat på linjer, der allerede har kampagnepris') }, stack, h('span', null, t('also campaign items', 'også kampagnevarer'))),
          h('label', null, field('ta', extra, '0', (v) => { lastTotal = { kr: v || 0 }; if (spreadTotal(v || 0)) commit(); else draw(); }, { blank0: true, title: t('Kroner off, spread over the lines', 'Kroner, fordelt på linjerne') }), ' kr.'),
          h('label', null, field('tp', grossAll ? extra / grossAll * 100 : 0, '0', (v) => { lastTotal = { pct: v || 0 }; if (spreadTotal(null, v || 0)) commit(); else draw(); }, { blank0: true, pct: true, title: t('Percent off (of the unit prices), spread over the lines', 'Procent (af enhedspriserne), fordelt på linjerne') }), ' %'),
          h('b', null, extra ? '−' + HP.money(extra) : '')),
        h('.pp-srow.big', null, h('span', null, t('Total', 'Total')), h('b', null, HP.money(R.total))),
        R.saving > 0 ? h('.pp-srow.pp-save', null, h('span', null, t('The customer saves (of the normal price)', 'Kunden sparer (af normalprisen)')), h('span', null, fmt(pctOff(R.saving, normal), 1) + ' %'), h('b', null, HP.money(R.saving))) : null].filter(Boolean));
      if (keep) setTimeout(() => focusIn(keep));
    }
    const body = h('.pp', null, h('p.muted.pp-intro', null, t('For this proposal only: the catalogue prices are not changed. Change one field and the rest follows. The price list, the cover, the customer\'s page and the order lines follow too.', 'Kun for dette tilbud: katalogets priser ændres ikke. Ændr ét felt, så følger resten med. Prislisten, forsiden, kundens side og ordrelinjerne følger også med.')), acts, table, sum);
    draw();
    const close = HP.modal({ title: t('Price adjustments', 'Prisjusteringer'), size: 'lg.ppw', body, foot: [h('button.btn.primary', { onclick: () => close() }, t('Done', 'Færdig'))] });
    if (focusKey) setTimeout(() => focusIn('.pp-row[data-key="' + CSS.escape(focusKey) + '"] input.up'), 60);
  };

  Pn.stats = () => {
    const url = () => LS.get('umamiShare', '');
    const body = h('.stats-body'), input = h('input', { type: 'url', placeholder: 'https://cloud.umami.is/share/…', value: url() });
    const draw = () => {
      body.textContent = '';
      const u = url();
      if (!/^https:\/\/[^/]+\/share\//.test(u)) {
        body.append(h('p.muted', null, t('Paste the share link of the HiFi Planner website in Umami (Websites → Edit → Share URL; tick Realtime and Events). It is kept in this browser only.', 'Indsæt delingslinket til HiFi Planner-sitet i Umami (Websites → Edit → Share URL; sæt flueben ved Realtime og Events). Det gemmes kun i denne browser.')),
          h('.row', null, input, h('button.btn.primary', { onclick: () => { LS.set('umamiShare', input.value.trim()); draw(); } }, t('Save', 'Gem'))));
        return;
      }
      body.append(h('iframe.stats-frame', { src: u, title: 'Umami', referrerpolicy: 'no-referrer' }));
    };
    draw();
    HP.modal({ title: t('Statistics', 'Statistik'), size: 'xl', body,
      foot: [h('button.btn', { onclick: () => { LS.set('umamiShare', ''); input.value = ''; draw(); } }, t('Change link', 'Skift link')), h('.spacer'),
        h('button.btn', { onclick: () => { if (url()) window.open(url(), '_blank', 'noopener'); } }, icon('link', 14), t('Open in a new tab', 'Åbn i ny fane'))] });
  };

  /* ---------- settings (shop, admin, GitHub) ---------- */
  Pn.settings = () => {
    const gh = Object.assign({}, HP.config.github, LS.get('gh', {}));
    const f = (label, input, hint) => h('label.field', null, h('span', null, label), input, hint && h('small', null, hint));
    const shop = h('input', { value: HP.shop(), inputMode: 'numeric' });
    const code = h('input', { type: 'password', placeholder: t('Admin code', 'Admin-kode'), autocomplete: 'off' });
    const owner = h('input', { value: gh.owner || '' }), repo = h('input', { value: gh.repo || '' }), branch = h('input', { value: gh.branch || 'main' }), path = h('input', { value: gh.path || '' });
    const token = h('input', { type: 'password', value: LS.get('ghToken', ''), placeholder: 'github_pat_…', autocomplete: 'off' });
    const status = h('.muted');
    const saveGh = () => { LS.set('gh', { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', path: path.value.trim().replace(/^\/+|\/+$/g, '') }); LS.set('ghToken', token.value.trim()); };
    const adminPane = h('.admin-pane');
    function drawAdmin() {
      adminPane.textContent = '';
      if (!HP.isAdmin()) return adminPane.append(h('.row', null, code, h('button.btn', { onclick: () => { if (code.value === HP.config.adminCode) { LS.set('admin', true); HP.emit('admin'); HP.emit('catalog'); drawAdmin(); } else { code.value = ''; code.placeholder = t('Wrong code', 'Forkert kode'); } } }, t('Unlock admin', 'Lås admin op'))),
        h('small.muted', null, t('Admins can edit products, create Shortcuts and publish them to all shops.', 'Admins kan redigere produkter, oprette genveje og udgive dem til alle butikker.')));
      adminPane.append(
        h('p.muted', null, t('Publishing commits the catalogue and Shortcuts to the GitHub repository that hosts this site. Create a fine-grained personal access token with "Contents: Read and write" for that one repository. The token is stored only in this browser.', 'Udgivelse committer katalog og genveje til det GitHub-repository, der hoster siden. Opret et fine-grained personal access token med "Contents: Read and write" til netop det repository. Tokenet gemmes kun i denne browser.')),
        h('.grid2', null, f('Owner', owner), f('Repository', repo), f('Branch', branch), f(t('Folder in repo', 'Mappe i repo'), path, t('Empty if the app is in the repo root', 'Tom, hvis appen ligger i roden'))),
        f('GitHub token', token),
        h('.row', null, h('button.btn', { onclick: async () => { saveGh(); status.textContent = t('Testing…', 'Tester…'); status.textContent = await HP.editor.testGitHub(); } }, t('Save & test connection', 'Gem & test forbindelse')), status),
        h('h3', null, t('Catalogue sync', 'Katalogsynkronisering')),
        h('p.muted', null, (HP.priceSyncText() || t('The catalogue sync has not run yet.', 'Katalogsynkroniseringen har ikke kørt endnu.')) + ' ' + t('A GitHub Action mirrors hifiklubben.dk every hour: prices, discounts, colours, new and discontinued products, Bluetooth/WiFi and images. To start a run from here, the token also needs "Actions: Read and write".', 'En GitHub Action spejler hifiklubben.dk hver time: priser, rabatter, farver, nye og udgåede produkter, Bluetooth/WiFi og billeder. For at starte en kørsel herfra skal tokenet også have "Actions: Read and write".')),
        h('.row', null, h('button.btn', { onclick: async () => { saveGh(); status.textContent = t('Starting…', 'Starter…'); status.textContent = await HP.editor.runPriceSync(); } }, icon('rotate', 14), t('Run catalogue sync now', 'Kør katalogsynkronisering nu'))),
        h('.row', null, h('button.btn', { onclick: () => HP.editor.exportData() }, icon('download', 14), t('Export data files', 'Eksportér datafiler')),
          h('button.btn', { onclick: () => { LS.set('admin', false); HP.emit('admin'); HP.emit('catalog'); drawAdmin(); } }, t('Leave admin mode', 'Forlad admin-tilstand'))));
    }
    drawAdmin();
    const closeSettings = HP.modal({ title: t('Settings', 'Indstillinger'), size: 'md', onClose: () => { if (HP.isAdmin()) saveGh(); },
      body: [h('h3', null, t('Shop account', 'Butikskonto')), Pn.shopForm(HP.shop(), () => HP.toast(t('Shop details saved', 'Butiksoplysninger gemt'), { kind: 'ok' })),
        h('.row', null, h('span.muted', null, t('Signed in as shop ', 'Logget ind som butik ') + HP.shop() + '.'), h('button.link', { onclick: () => { LS.del('shop'); LS.del('seller'); location.reload(); } }, t('Switch shop', 'Skift butik'))),
        h('h3', null, t('Seller', 'Sælger')), HP.seller() ? Pn.sellerForm(HP.seller().no, () => HP.toast(t('Seller saved', 'Sælger gemt'), { kind: 'ok' })) : '',
        h('.row', null, h('button.link', { onclick: () => { closeSettings(); Pn.switchSeller(); } }, t('Switch seller', 'Skift sælger'))),
        HP.statsNotice && HP.config.analytics && HP.config.analytics.umami ? h('p.muted.stats-note', null, HP.statsNotice()) : null,
        h('h3', null, 'Admin'), adminPane] });
  };

  /* ---------- shop account (stored in this browser; printed in the A4 footer) ---------- */
  Pn.shopForm = (no, onSave, submitLabel) => {
    const p = HP.shopProfile(no);
    const name = h('input', { value: p.name || 'HiFi Klubben ', placeholder: 'HiFi Klubben Amager', autocomplete: 'organization' });
    const email = h('input', { type: 'email', value: p.email, placeholder: 'amager@hifiklubben.dk', autocomplete: 'email' });
    const phone = h('input', { type: 'tel', value: p.phone, placeholder: '12 34 56 78', autocomplete: 'tel' });
    const err = h('.err');
    const f = (label, el) => h('label.field', null, h('span', null, label), el);
    const save = () => {
      const v = { no, name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim() };
      if (v.name.length < 3 || /^hifi klubben$/i.test(v.name)) { err.textContent = t('Enter the shop name, e.g. "HiFi Klubben Amager".', 'Skriv butikkens navn, fx "HiFi Klubben Amager".'); return name.focus(); }
      if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { err.textContent = t('That email address does not look right.', 'E-mailadressen ser forkert ud.'); return email.focus(); }
      err.textContent = ''; HP.saveShop(v); onSave && onSave(v);
    };
    const form = h('.shopform', { onkeydown: (e) => e.key === 'Enter' && save() },
      h('.grid2', null, f(t('Shop number', 'Butiksnummer'), h('input', { value: no, readOnly: true, disabled: true })), f(t('Shop name', 'Butiksnavn'), name), f(t('Email', 'E-mail'), email), f(t('Phone', 'Telefon'), phone)),
      h('small.muted', null, t('Name, phone and email are printed at the bottom of every A4 page.', 'Navn, telefon og e-mail printes nederst på hver A4-side.')), err,
      h('.row', null, h('button.btn.primary', { onclick: save }, icon('check', 14), submitLabel || t('Save', 'Gem'))));
    setTimeout(() => { name.focus(); name.setSelectionRange(name.value.length, name.value.length); }, 60);
    return form;
  };

  /* ---------- seller (staff login, printed as "Your adviser" on proposals) ---------- */
  Pn.sellerForm = (no, onSave, submitLabel) => {
    const cur = LS.get('sellers', {})[no] || {};
    const name = h('input', { value: cur.name || '', placeholder: t('First and last name', 'For- og efternavn'), autocomplete: 'name' });
    const err = h('.err');
    const f = (label, el) => h('label.field', null, h('span', null, label), el);
    const save = () => {
      const v = { no, name: name.value.trim().replace(/\s+/g, ' '), shop: HP.shop() };
      if (v.name.length < 2) { err.textContent = t('Enter your name.', 'Skriv dit navn.'); return name.focus(); }
      err.textContent = ''; HP.saveSeller(v);
      if (!cur.name && HP.stat) HP.stat('Ny sælger oprettet', { navn: v.name }); // the login screen has told them their name is recorded
      onSave && onSave(v);
    };
    setTimeout(() => name.focus(), 60);
    return h('.shopform', { onkeydown: (e) => e.key === 'Enter' && save() },
      h('.grid2', null, f(t('Seller number', 'Sælgernummer'), h('input', { value: no, readOnly: true, disabled: true })), f(t('Name', 'Navn'), name)),
      h('small.muted', null, t('Your name is printed on proposals as the customer’s adviser.', 'Dit navn printes på tilbud som kundens rådgiver.')), err,
      h('.row', null, h('button.btn.primary', { onclick: save }, icon('check', 14), submitLabel || t('Save', 'Gem'))));
  };
  Pn.switchSeller = () => { LS.del('seller'); HP.emit('seller'); HP.emit('doc'); Pn.login(() => {}); };

  /* ---------- login: shop number -> (shop account) -> seller number -> (name) ---------- */
  Pn.login = (then) => {
    // a shop is known if it is on the list in data/config.js, or was created on this PC (it then has a profile)
    const hasAccount = (no) => !!(no && HP.shopProfile(no).name), known = (no) => HP.config.shops.includes(no) || hasAccount(no);
    if (known(HP.shop()) && hasAccount(HP.shop()) && HP.seller()) return then();
    const card = h('.login-card', null, h('img', { src: 'assets/hifi-planner-logo.png', alt: 'HiFi Planner' }));
    const ov = h('#login', null, card);
    const done = () => { ov.remove(); then(); };
    const step2 = (no, isNew) => {
      card.replaceChildren(card.firstChild, h('h2', null, isNew ? t('New shop', 'Ny butik') : t('Create shop account', 'Opret butikskonto')),
        h('p.muted', null, t('First time on this PC for shop ' + no + '. Add the shop details shown on proposals.', 'Første gang på denne PC for butik ' + no + '. Tilføj butikkens oplysninger, som vises på tilbud.')),
        Pn.shopForm(no, () => {
          LS.set('shop', no);
          // a shop not on the list: reported, so a real one can be added to data/config.js
          if (isNew && HP.stat) HP.stat('Ny butik oprettet', { nummer: no, navn: HP.shopProfile(no).name || '' });
          step3();
        }, t('Create account', 'Opret konto')),
        h('button.link', { onclick: step1 }, t('Back', 'Tilbage')));
    };
    const step3 = () => {
      const shop = HP.shopProfile(), err = h('.err');
      const input = h('input', { placeholder: t('Your seller number (5–7 digits)', 'Dit sælgernummer (5–7 cifre)'), inputMode: 'numeric', autocomplete: 'off', onkeydown: (e) => e.key === 'Enter' && go() });
      const pick = (s) => { LS.set('seller', s.no); HP.emit('seller'); HP.emit('doc'); done(); };
      const go = () => {
        const v = input.value.replace(/\s/g, '');
        if (!HP.sellerRe.test(v)) { err.textContent = t('A seller number has 5 to 7 digits.', 'Et sælgernummer har 5 til 7 cifre.'); return input.select(); }
        const s = LS.get('sellers', {})[v];
        if (s && s.name) { HP.saveSeller(Object.assign({}, s, { shop: shop.no })); return done(); }
        card.replaceChildren(card.firstChild, h('h2', null, t('New seller', 'Ny sælger')),
          h('p.muted', null, t('First time for ' + v + ' on this PC. Add your name.', 'Første gang for ' + v + ' på denne PC. Tilføj dit navn.')),
          Pn.sellerForm(v, done, t('Create seller', 'Opret sælger')), h('button.link', { onclick: step3 }, t('Back', 'Tilbage')));
      };
      const list = HP.sellers(shop.no).map((s) => h('.seller-row', null,
        h('button.seller-pick', { onclick: () => pick(s) }, icon('user', 14), h('b', null, s.name), h('span.muted', null, s.no)),
        h('button.icon-x', { title: t('Remove from this PC', 'Fjern fra denne PC'), onclick: () => HP.confirm(t('Remove ' + s.name + ' from this PC?', 'Fjern ' + s.name + ' fra denne PC?'), t('Remove', 'Fjern'), () => { HP.removeSeller(s.no); step3(); }) }, icon('x', 13))));
      card.replaceChildren(card.firstChild, h('h2', null, shop.name), h('p.muted', null, t('Shop ', 'Butik ') + shop.no + ' · ' + t('Who is using HiFi Planner?', 'Hvem bruger HiFi Planner?')),
        list.length ? h('.seller-list', null, list) : '',
        h('.row', null, input, h('button.btn.primary', { onclick: go }, t('Log in', 'Log ind'))), err,
        HP.statsNotice && HP.config.analytics && HP.config.analytics.umami ? h('p.stats-note', null, HP.statsNotice()) : null,
        h('button.link', { onclick: () => { LS.del('shop'); step1(); } }, t('Another shop', 'Anden butik')));
      HP.loginNoticeShown = !!(HP.config.analytics && HP.config.analytics.umami);
      setTimeout(() => input.focus(), 50);
    };
    function step1() {
      const err = h('.err');
      const input = h('input', { placeholder: t('Shop number', 'Butiksnummer'), inputMode: 'numeric', autofocus: true, onkeydown: (e) => e.key === 'Enter' && go() });
      // a number not on the list may be created, if it has the shape of a shop number; anything else gets the same plain
      // "unknown" as before, without saying what a shop number looks like
      const go = () => {
        const v = input.value.trim();
        if (known(v)) { if (hasAccount(v)) { LS.set('shop', v); step3(); } else step2(v); return; }
        if (!/^\d{3}$/.test(v)) { err.textContent = t('Unknown shop number.', 'Ukendt butiksnummer.'); return input.select(); }
        card.replaceChildren(card.firstChild, h('h2', null, t('Shop ', 'Butik ') + v),
          h('p.muted', null, t('This shop is not on the list yet. Check that ' + v + ' is your shop number, then create the shop.', 'Butikken er ikke på listen endnu. Tjek, at ' + v + ' er dit butiksnummer, og opret så butikken.')),
          h('.row', null, h('button.btn.primary', { onclick: () => step2(v, true) }, t('Create shop', 'Opret butik')), h('button.btn', { onclick: step1 }, t('Fix the number', 'Ret nummeret'))));
      };
      card.replaceChildren(card.firstChild, h('.row', null, input, h('button.btn.primary', { onclick: go }, t('Enter', 'Log ind'))), err);
      setTimeout(() => input.focus(), 50);
    }
    document.body.append(ov);
    if (known(HP.shop()) && hasAccount(HP.shop())) step3(); else if (known(HP.shop())) step2(HP.shop()); else step1();
  };

  /* ---------- full-screen image viewer (show a customer the rear panel) ---------- */
  Pn.viewer = (pid, face, onFace, item) => {
    const p = cat.get(pid), imgs = HP.imagesOf(p, item); if (!p || !imgs.length) return;
    let f = HP.clamp(face || 0, 0, imgs.length - 1), z = 1, x = 0, y = 0;
    const img = h('img', { draggable: false, alt: p.name, onerror: HP.site.onerr });
    const stage = h('.vstage', null, img), zl = h('span.mono');
    const apply = () => { img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; zl.textContent = Math.round(z * 100) + '%'; };
    const reset = () => { z = 1; x = 0; y = 0; apply(); };
    const show = (i) => { f = i; img.dataset.fb = HP.site.fallback(imgs[f], 'hd'); img.classList.remove('broken'); img.src = HP.site.src(imgs[f], 'hd'); tabs.forEach((b, j) => b.classList.toggle('on', j === f)); reset(); onFace && onFace(f); };
    const zoomAt = (cx, cy, nz) => { nz = HP.clamp(nz, 1, 8); const r = stage.getBoundingClientRect(), px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2; x = px - ((px - x) * nz) / z; y = py - ((py - y) * nz) / z; z = nz; if (z === 1) { x = 0; y = 0; } apply(); };
    stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, z * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
    stage.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, z > 1.5 ? 1 : 3));
    // one pointer drags, two fingers pinch; double-tap toggles zoom
    const pts = new Map(); let pinch = null, lastTap = 0;
    const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); stage.setPointerCapture(e.pointerId); stage.classList.add('grab');
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX - x, sy: e.clientY - y });
      if (pts.size === 2) { const m = mid(); pinch = { x: m.x, y: m.y, d: m.d }; }
      if (e.pointerType === 'touch' && pts.size === 1) { const now = Date.now(); if (now - lastTap < 300) zoomAt(e.clientX, e.clientY, z > 1.5 ? 1 : 3); lastTap = now; }
    });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pts.size === 2) { const m = mid(); zoomAt(pinch.x, pinch.y, z * (m.d / pinch.d)); x += m.x - pinch.x; y += m.y - pinch.y; apply(); pinch = { x: m.x, y: m.y, d: m.d }; }
      else if (!pinch && pts.size === 1) { x = e.clientX - p.sx; y = e.clientY - p.sy; apply(); }
    });
    const lift = (e) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size < 2) pinch = null;
      pts.forEach((p) => { p.sx = p.x - x; p.sy = p.y - y; }); // the finger left behind continues from here
      if (!pts.size) stage.classList.remove('grab');
    };
    stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
    const tabs = imgs.map((u, i) => h('button', { onclick: () => show(i) }, i ? t('Back', 'Bagside') : t('Front', 'Forside')));
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = (e) => {
      if (e.key === 'Escape') close(); else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (imgs.length > 1) show((f + 1) % imgs.length); }
      else if (e.key === '+' || e.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, z * 1.4); else if (e.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, z / 1.4); else if (e.key === '0') reset(); else return;
      e.preventDefault(); e.stopPropagation();
    };
    const ov = h('.viewer', null,
      h('.vbar', null, h('.vtitle', null, h('span.brand', null, p.brand + (HP.variantOf(p, item) ? ' · ' + HP.variantOf(p, item).label : '')), h('b', null, p.name)), imgs.length > 1 && h('.vtabs', null, tabs), h('.spacer'),
        h('button.icon-btn', { title: t('Zoom out (−)', 'Zoom ud (−)'), onclick: () => zoomAt(innerWidth / 2, innerHeight / 2, z / 1.4) }, icon('minus')), zl,
        h('button.icon-btn', { title: t('Zoom in (+)', 'Zoom ind (+)'), onclick: () => zoomAt(innerWidth / 2, innerHeight / 2, z * 1.4) }, icon('plus')),
        h('button.icon-btn', { title: t('Reset (0)', 'Nulstil (0)'), onclick: reset }, icon('fit')),
        h('button.icon-btn', { title: t('Close (Esc)', 'Luk (Esc)'), onclick: close }, icon('x'))),
      stage, h('.vhint', null, matchMedia('(pointer: coarse)').matches ? t('Pinch to zoom · double-tap · drag to move', 'Knib for at zoome · dobbelttryk · træk for at flytte') : t('Scroll or double-click to zoom · drag to move · B flips front/back · Esc closes', 'Scroll eller dobbeltklik for at zoome · træk for at flytte · B vender for/bag · Esc lukker')));
    document.body.append(ov); document.addEventListener('keydown', key, true);
    show(f);
  };
})();
