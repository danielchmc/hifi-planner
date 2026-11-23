/* HiFi Planner v2 — app shell: top bar, sidebar (products + Shortcuts), pickers, projects, help, settings, login. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, icon, LS } = HP;
  const Pn = (HP.panels = {});
  const C = () => HP.canvas;

  /* ---------- shared: product row + drag from a list onto the canvas ---------- */
  // v: a colour variant to show (picture, colour name and price of that colour)
  function productRow(p, extra, v) {
    const price = v ? v.price : p.price, was = v ? v.was || 0 : p.was || 0;
    return h('.prow' + (v ? '.isvar' : ''), { data: { id: p.id } },
      h('.thumb', null, HP.imgEl((v && v.img) || (p.img || [])[0] || ((p.vars || [])[0] || {}).img || '', 'thumb', { loading: 'lazy' })),
      h('.pinfo', null, h('.pname', null, p.name, v && h('span.vlabel', null, ' · ' + v.label)), h('.psub', null, v ? v.sku : p.brand, price ? ' · ' : '', !v && (p.vars || []).length > 1 && new Set(p.vars.map((x) => x.price)).size > 1 ? t('from ', 'fra ') : '', was > price ? h('s', null, HP.money(was)) : null, was > price ? ' ' : '', price ? h('span' + (was > price ? '.sale' : ''), null, HP.money(price)) : null)),
      h('.pmeta', null, (p.vars || []).length > 1 && h('span.nvar', { title: p.vars.map((x) => x.label).join(', ') }, p.vars.slice(0, 4).map((x) => h('i' + (v && x.sku === v.sku ? '.on' : ''), { style: { background: HP.site.swatch(x) } }))), p.gone && h('span.gone-ic', { title: t('Discontinued: no longer on hifiklubben.dk', 'Udgået: ikke længere på hifiklubben.dk') }, icon('warn', 13)), p.bt && icon('bt', 13), p.wifi && icon('wifi', 13), extra));
  }
  // a system (website bundle): its picture, name, the parts, the bundle price and what it saves against the parts one by one
  const sysParts = (b) => b.parts.reduce((a, x) => a + (HP.priceOf(cat.get(x.id), x.v ? { v: x.v } : null).price || 0) * x.qty, 0);
  function systemRow(b) {
    const parts = sysParts(b), was = Math.max(parts, b.was || 0);
    return h('.prow.sysrow', { data: { sku: b.sku } },
      h('.thumb', null, HP.imgEl(b.img || '', 'thumb', { loading: 'lazy' })),
      h('.pinfo', null, h('.pname', null, cat.systemName(b)),
        h('.psub', null, b.type, ' · ', was > b.price ? h('s', null, HP.money(was)) : null, HP.money(b.price), was > b.price ? h('span.sale', null, ' ' + t('save ', 'spar ') + HP.money(was - b.price)) : null),
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
    const katBtn = h('button.kat-open', { title: t('Open the Katalog (Alt+K, or Shift+Enter in the search)', 'Åbn Katalog (Alt+K, eller Shift+Enter i søgningen)'), onclick: () => HP.katalog.open(search.value) }, icon('grid', 14), h('span', null, 'Katalog'));
    const brandSel = h('select', { onchange: () => { filter(); }, title: 'Brand' });
    const sortSel = h('select', { onchange: () => { filter(); }, title: t('Sort', 'Sortér') },
      [['rel', t('Best match', 'Bedste match')], ['pa', t('Price, low to high', 'Pris, lav til høj')], ['pd', t('Price, high to low', 'Pris, høj til lav')], ['name', t('Name A–Z', 'Navn A–Å')], ['brand', t('Brand A–Z', 'Brand A–Å')]].map(([v, l]) => h('option', { value: v }, l)));
    // one compact row: section, its types/categories, sort. The brand filter and the Sale/Bluetooth/WiFi toggles live in the Katalog,
    // which has room for them; the sidebar is for finding a product quickly and dragging it onto the canvas.
    const grpSel = h('select.grp', { title: t('Section', 'Sektion'), onchange: () => { group = grpSel.value; sub = ''; filter(); } });
    const subSel = h('select.sub', { title: t('Type', 'Type'), onchange: () => { sub = subSel.value; filter(); } });
    const count = h('span.count');
    const list = h('.plist#sb-list');
    const more = h('.more'); // sentinel at the end of the list: when it scrolls into view the next rows are added
    const scList = h('.sclist');
    const tabs = h('.tabs', null,
      h('button', { data: { tab: 'products' }, onclick: () => setTab('products') }, t('Products', 'Produkter')),
      h('button#tab-shortcuts', { data: { tab: 'shortcuts' }, onclick: () => setTab('shortcuts') }, icon('bolt', 14), t('Shortcuts', 'Genveje')));
    const prodPane = h('.pane', null, h('.filters', null, h('.searchbox', null, icon('search', 15), search, katBtn), h('.selrow.slim', null, grpSel, subSel)),
      h('.listhead', null, count, sortSel), list);
    list.title = matchMedia('(pointer: coarse)').matches ? t('Tap to add · hold to drag', 'Tryk for at tilføje · hold for at trække') : t('Drag onto canvas, or click', 'Træk ind på lærredet, eller klik');
    const scPane = h('.pane', null, scList);
    const el = h('aside#sidebar', null, h('button.icon-btn.drawer-x', { title: t('Close', 'Luk'), onclick: () => Pn.drawer(false) }, icon('x')), tabs, prodPane, scPane);

    function setTab(x) { tab = x; LS.set('tab', x); tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === x)); prodPane.hidden = x !== 'products'; scPane.hidden = x !== 'shortcuts'; }
    function fillSelects() {
      const keepBrand = brandSel.value;
      brandSel.textContent = ''; brandSel.append(h('option', { value: '' }, t('All brands', 'Alle brands')));
      [...new Set(cat.products().map((p) => p.brand))].sort((a, b) => a.localeCompare(b)).forEach((b) => brandSel.append(h('option', { value: b }, b)));
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
      const base = cat.products().filter((p) => words.every((w) => p._hay.includes(w)) && (!bv || p.brand === bv));
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
      const so = sortSel.value, loc = (a, b) => a.localeCompare(b, 'da');
      hits.sort(so === 'pa' ? (a, b) => !!a.p.gone - !!b.p.gone || a.price - b.price : so === 'pd' ? (a, b) => !!a.p.gone - !!b.p.gone || b.price - a.price
        : so === 'name' ? (a, b) => loc(a.p.name, b.p.name) : so === 'brand' ? (a, b) => loc(a.p.brand, b.p.brand) || loc(a.p.name, b.p.name) : (a, b) => a.s - b.s || a.i - b.i);
      shown = 0; rows = [];
      list.textContent = ''; list.scrollTop = 0;
      if (!hits.length) list.append(h('.empty', null, t('No products match.', 'Ingen produkter passer.')));
      addRows();
    }
    // append the next PER rows; the sentinel goes after them, and the observer adds more when it comes into view
    function addRows() {
      more.remove();
      const first = !shown;
      hits.slice(shown, shown + PER).forEach(({ p, v, sys }, i) => {
        const anim = (r) => { if (first && i < 12) { r.classList.add('in'); r.style.animationDelay = i * 12 + 'ms'; } };
        if (sys) {
          const r = systemRow(sys);
          r._add = () => C().addSystem(sys.sku); anim(r);
          r.addEventListener('pointerdown', (e) => listDrag(e, cat.systemName(sys), (x, y) => C().addSystem(sys.sku, x, y), () => { C().addSystem(sys.sku); if (narrow()) Pn.drawer(false); }));
          list.append(r);
          return;
        }
        const r = productRow(p, null, v); anim(r);
        // a search that points at one colour (part of its SKU, or its colour name) shows and adds that colour
        const vsku = v && v.sku;
        r._add = () => { C().addProductCenter(p.id, vsku); HP.toast(p.brand + ' ' + p.name + t(' added', ' tilføjet'), { kind: 'ok', ms: 1800 }); };
        r.addEventListener('pointerdown', (e) => listDrag(e, p.name, (x, y) => C().dropProduct(p.id, x, y, vsku), () => { C().addProductCenter(p.id, vsku); if (narrow()) Pn.drawer(false); }, (x, y) => C().dragHover(x, y)));
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

  /* everything in the top bar, as one menu, for screens where it does not fit */
  function moreMenu(btn) {
    const r = btn.getBoundingClientRect(), d = store.doc, admin = HP.isAdmin(), s = HP.seller();
    const rename = () => { const v = prompt(t('Proposal name (shown on the printout)', 'Tilbuddets navn (vises på printet)'), d.name || ''); if (v !== null) { d.name = v.trim(); store.commit(); } };
    HP.menu(r.right - 260, r.bottom + 4, [
      { head: d.name || t('Untitled proposal', 'Unavngivet tilbud') },
      { label: t('Rename proposal…', 'Omdøb tilbud…'), icon: 'edit', fn: rename },
      { label: t('Clear canvas', 'Ryd lærredet'), icon: 'eraser', fn: () => C().clearCanvas() },
      'sep',
      { label: t('Text', 'Tekst'), icon: 'text', fn: () => C().addText() },
      { label: t('Price list', 'Prisliste'), icon: 'tag', on: C().hasPrices(), fn: () => C().togglePrices() },
      { label: t('CI mode', 'CI-tilstand'), icon: 'plan', on: !!d.ci, fn: () => C().setCI(!d.ci) },
      { el: Pn.scaleStepper() },
      { label: 'A4 ' + (d.orient === 'portrait' ? t('landscape', 'liggende') : t('portrait', 'stående')), icon: 'rotate', fn: () => { d.orient = d.orient === 'portrait' ? 'landscape' : 'portrait'; store.commit(); C().fit(); } },
      'sep',
      { label: t('Share link', 'Del link'), icon: 'link', fn: Pn.share },
      { label: t('Projects', 'Projekter'), icon: 'folder', fn: Pn.projects },
      { label: t('Help', 'Hjælp'), icon: 'help', fn: Pn.help },
      'sep',
      admin && { label: t('Product Editor', 'Produkt-editor'), icon: 'edit', fn: () => HP.editor.open() },
      admin && cat.dirtyCount() && { label: t('Publish', 'Udgiv') + ' (' + cat.dirtyCount() + ')', icon: 'cloud', fn: () => HP.editor.publish() },
      admin && 'sep',
      { label: HP.lang() === 'da' ? 'English' : 'Dansk', icon: 'globe', fn: () => { HP.setLang(HP.lang() === 'da' ? 'en' : 'da'); location.reload(); } },
      { label: t('Light / dark', 'Lys / mørk'), icon: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', fn: () => document.getElementById('tb-theme').click() },
      { label: t('Settings', 'Indstillinger'), icon: 'gear', fn: Pn.settings },
      { label: (s ? s.name + ' · ' : '') + t('switch seller', 'skift sælger'), icon: 'user', fn: () => Pn.switchSeller() },
    ].filter(Boolean));
  }

  function buildTopbar() {
    let sellerBtn;
    const tb = (id, ic, label, fn, opts) => h('button.tbtn' + ((opts && opts.cls) || ''), { id, title: label + ((opts && opts.key) ? ' (' + opts.key + ')' : ''), onclick: fn }, icon(ic), opts && opts.text && h('span', null, label));
    const name = h('input.docname', { placeholder: t('Untitled proposal', 'Unavngivet tilbud'), value: store.doc.name || '', title: t('Proposal name (shown on the printout)', 'Tilbuddets navn (vises på printet)'),
      onchange: () => { store.doc.name = name.value.trim(); store.commit(); } });
    const scale = Pn.scaleStepper();
    const undo = tb('tb-undo', 'undo', t('Undo', 'Fortryd'), store.undo, { key: 'Ctrl+Z' }), redo = tb('tb-redo', 'redo', t('Redo', 'Annuller fortryd'), store.redo, { key: 'Ctrl+Y' });
    const prices = tb('tb-prices', 'tag', t('Price list', 'Prisliste'), () => C().togglePrices(), { text: 1 });
    const ci = tb('tb-ci', 'plan', t('CI mode', 'CI-tilstand'), () => C().setCI(!store.doc.ci), { text: 1 });
    // "Relaterede produkter": cables for the connections without one and the website's accessories; the badge counts the connections without a cable
    const done = tb('tb-complete', 'plus', t('Related products', 'Relaterede produkter'), () => HP.complete.open(), { text: 1, cls: '.primary' }), doneN = h('span.badge');
    done.append(doneN);
    const doneUpd = () => { const n = HP.complete.missing(); doneN.textContent = n || ''; doneN.hidden = !n; done.title = n ? n + t(' connections without a cable: related products', ' forbindelser uden kabel: relaterede produkter') : t('Related products: cables and accessories', 'Relaterede produkter: kabler og tilbehør'); };
    HP.on('doc', doneUpd); setTimeout(doneUpd);
    const orient = h('button.tbtn#tb-orient', { title: t('Switch A4 portrait / landscape', 'Skift A4 stående / liggende'), onclick: () => { store.doc.orient = store.doc.orient === 'portrait' ? 'landscape' : 'portrait'; store.commit(); C().fit(); } }, icon('rotate'), h('span'));
    const publish = h('button.tbtn.publish#tb-publish', { onclick: () => HP.editor.publish() }, icon('cloud'), h('span'));
    const adminBox = h('.tgroup.admin', null, tb('tb-editor', 'edit', t('Product Editor', 'Produkt-editor'), () => HP.editor.open(), { text: 1 }), tb('tb-stats', 'chart', t('Statistics', 'Statistik'), () => Pn.stats()), publish);
    const bar = h('header#topbar', null,
      h('button.tbtn#tb-drawer', { title: t('Products and Shortcuts', 'Produkter og genveje'), onclick: () => Pn.drawer() }, icon('plus'), h('span', null, t('Products', 'Produkter'))),
      h('.brandmark', { title: 'HiFi Planner' }, h('img', { src: 'assets/hifi-planner-logo.png', alt: 'HiFi Planner' })),
      name,
      h('.tgroup#tb-edit', null, tb('tb-new', 'eraser', t('Clear canvas', 'Ryd lærredet'), () => C().clearCanvas()), undo, redo),
      h('.tgroup#tb-insert', null, tb('tb-text', 'text', t('Text', 'Tekst'), () => C().addText(), { text: 1 }), prices, done, ci),
      h('.tgroup#tb-scale', null, scale),
      h('.tgroup#tb-printgrp', null, orient, tb('tb-print', 'print', t('Print / PDF', 'Print / PDF'), () => HP.cover.dialog(), { text: 1, key: 'Ctrl+P', cls: '.primary' })),
      h('.spacer'),
      adminBox,
      h('.tgroup#tb-sharegrp', null, tb('tb-share', 'link', t('Share link', 'Del link'), Pn.share, { text: 1, key: 'Ctrl+Shift+S' }), tb('tb-projects', 'folder', t('Projects', 'Projekter'), Pn.projects, { text: 1 }), tb('tb-help', 'help', t('Help', 'Hjælp'), Pn.help, { text: 1 })),
      h('.tgroup#tb-prefs', null,
        h('button.tbtn.lang', { title: t('Language', 'Sprog'), onclick: () => { HP.setLang(HP.lang() === 'da' ? 'en' : 'da'); location.reload(); } }, HP.lang() === 'da' ? 'DA' : 'EN'),
        tb('tb-theme', document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', t('Light / dark', 'Lys / mørk'), () => { const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = d; LS.set('theme', d); const b = document.getElementById('tb-theme'); b.replaceChild(icon(d === 'dark' ? 'sun' : 'moon'), b.firstChild); }),
        tb('tb-settings', 'gear', t('Settings', 'Indstillinger'), Pn.settings)),
      h('button.tbtn#tb-more', { title: t('More', 'Mere'), onclick: (e) => moreMenu(e.currentTarget) }, icon('more')),
      h('.tgroup#tb-sellergrp', null, (sellerBtn = h('button.tbtn#tb-seller', { title: t('Signed-in seller. Click to switch seller', 'Logget ind som sælger. Klik for at skifte sælger'), onclick: () => Pn.switchSeller() }, icon('user'), h('span')))));
    const drawSeller = () => { const s = HP.seller(); sellerBtn.lastChild.textContent = s ? s.name.split(' ')[0] : t('Seller', 'Sælger'); sellerBtn.title = (s ? s.name + ' · ' + s.no + '. ' : '') + t('Click to switch seller', 'Klik for at skifte sælger'); };
    drawSeller(); HP.on('seller', drawSeller);
    const sync = () => {
      undo.disabled = !store.canUndo(); redo.disabled = !store.canRedo();
      prices.classList.toggle('on', C().hasPrices()); ci.classList.toggle('on', !!store.doc.ci);
      if (document.activeElement !== name) name.value = store.doc.name || '';
      orient.lastChild.textContent = 'A4 ' + (store.doc.orient === 'portrait' ? t('portrait', 'stående') : t('landscape', 'liggende'));
      adminBox.hidden = !HP.isAdmin();
      const n = cat.dirtyCount(); publish.hidden = !n; publish.lastChild.textContent = t('Publish', 'Udgiv') + ' (' + n + ')';
      publish.title = t(n + ' unpublished change(s). Click to publish to all shops.', n + ' ikke-udgivne ændring(er). Klik for at udgive til alle butikker.');
    };
    HP.on('doc', sync); HP.on('catalog', sync); HP.on('admin', sync);
    setTimeout(sync);
    return bar;
  }

  /* ---------- card size relative to the A4 page ---------- */
  Pn.scaleStepper = () => {
    const STEPS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
    const cur = () => store.doc.cardScale || 1;
    const step = (d) => { const i = STEPS.findIndex((s) => s >= cur() - 0.001), j = HP.clamp((STEPS[i] > cur() + 0.001 && d < 0 ? i : i + d), 0, STEPS.length - 1); C().setCardScale(STEPS[j], true); };
    const val = h('button.sval', { title: t('Card size relative to the A4 page. Click to reset to 100%.', 'Kortstørrelse i forhold til A4-siden. Klik for at nulstille til 100%.'), onclick: () => C().setCardScale(1, true) });
    const el = h('.stepper', { title: t('Card size', 'Kortstørrelse') }, icon('scale', 15), h('span.slab', null, t('Cards', 'Kort')),
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
      tb('', 'scale', t('Scale', 'Målestok'), t('Tell HiFi Planner the real size of the plan', 'Fortæl HiFi Planner planens rigtige størrelse'), () => C().startTool('scale'), { tool: 'scale' })];
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
      const rows = cat.cables().filter((p) => perMetre(p) && words.every((w) => p._hay.includes(w))).sort((a, b) => a.price - b.price);
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
    const pick = (id, o) => { c.cable = id; delete c.lv; delete c.m; if (o && o.lv) c.lv = o.lv; if (o && o.m) c.m = o.m; if (o && o.len) LS.set('cableLen', o.len); store.commit(); close(); };
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
      summary.append(h('b', null, s.name), ' · ' + HP.money(s.price));
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
      const sub = r.querySelector('.psub'); if (sub) sub.textContent = rep.brand + ' · ' + (G.metre ? HP.money(rep.price) + ' / m' : (G.opts.length > 1 ? t('from ', 'fra ') : '') + HP.money(G.min));
      if (mine) r.classList.add('on');
      const box = h('.lens');
      let choose;
      if (G.metre) {
        const last = +LS.get('cableLen', 0);
        const metres = () => Math.max(1, Math.round(+inp.value || 0)); // whole metres, as cable is cut in the shop
        choose = () => { const m = metres(); select({ group: gk, key: 'm', id: rep.id, o: { m, len: m }, name: base + ' ' + fmtM(m), price: Math.ceil(m) * rep.price }); };
        const inp = h('input', { type: 'number', min: 1, step: 1, value: Math.max(1, Math.round(mine && c.m ? c.m : last || 2)), onclick: (ev) => { ev.stopPropagation(); choose(); },
          oninput: () => { tot.textContent = '= ' + HP.money(metres() * rep.price); choose(); } });
        const tot = h('span.muted', null, '= ' + HP.money(metres() * rep.price));
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); choose(); commit(); } });
        box.append(h('span.lab', null, t('Metres', 'Meter')), inp, tot);
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
      const hits = cat.cables().filter((p) => words.every((w) => p._hay.includes(w) || (p.cable || []).some((x) => x.includes(w))));
      const all = groupsOf(hits).map((G) => { const fit = P.cableFit(G.rep, a, b); return Object.assign(G, { fit, issues: fit ? P.plugIssues(G.rep, a, b) : [] }); }); // by the cable's two ends, then its plugs
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
        info.warn && h('.warnline', null, icon('warn', 14), t('These connector types do not normally fit together.', 'Disse stiktyper passer normalt ikke sammen.'))),
        h('.searchbox.pad', null, icon('search', 15), q), list],
      foot: [h('button.btn.danger', { onclick: () => { store.selConn = c.id; C().deleteSelection(); close(); } }, icon('trash', 14), t('Delete connection', 'Slet forbindelse')), h('.spacer'),
        c.cable && h('button.btn', { onclick: () => pick(null) }, t('Remove cable', 'Fjern kabel')), h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), useBtn] });
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
    const same = h('input', { type: 'checkbox', checked: (old.cats || []).length > 0, onchange: draw });
    const list = h('.plist.tall');
    function draw() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list.textContent = '';
      const rows = cat.products().filter((p) => p.id !== old.id && words.every((w) => p._hay.includes(w)) && (!same.checked || (p.cats || []).some((x) => (old.cats || []).includes(x)))).map((p) => {
        const kept = total ? used.out.filter((k) => P.mapPorts(old.out || [], p.out || [], used.out)[k]).length + used.in.filter((k) => P.mapPorts(old.in || [], p.in || [], used.in)[k]).length : 0;
        return { p, kept };
      }).sort((x, y) => y.kept - x.kept);
      rows.slice(0, 200).forEach(({ p, kept }) => { const r = productRow(p, total ? h('span.keep' + (kept === total ? '.all' : kept ? '' : '.none'), null, kept + '/' + total) : null); r.onclick = () => { close(); C().replaceItem(itemId, p.id); }; list.append(r); });
      if (!rows.length) list.append(h('.empty', null, t('No products match.', 'Ingen produkter matcher.')));
    }
    const close = HP.modal({ title: t('Replace ', 'Udskift ') + old.name, size: 'md', flush: true,
      body: [h('.conn-head', null, h('span.muted', null, total ? t('Connections are carried over by matching port names. The badge shows how many of the ' + total + ' survive.', 'Forbindelser føres med via matchende portnavne. Mærket viser, hvor mange af de ' + total + ' der bevares.') : t('This card has no connections yet.', 'Dette kort har ingen forbindelser endnu.'))),
        h('.searchbox.pad', null, icon('search', 15), q, h('label.check', null, same, t('Same category', 'Samme kategori'))), list] });
    draw();
  };

  /* ---------- projects ---------- */
  const download = (name, text, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  HP.download = download;
  Pn.projects = () => {
    const list = h('.projlist');
    const nameIn = h('input', { placeholder: t('Project name', 'Projektnavn'), value: store.doc.name || '' });
    const all = () => LS.get('projects', []);
    const hasPlan = () => store.doc.items.some((i) => i.kind === 'plan') && store.planSrc;
    function draw() {
      list.textContent = '';
      const ps = all();
      if (!ps.length) list.append(h('.empty', null, t('No saved projects in this browser yet.', 'Ingen gemte projekter i denne browser endnu.')));
      ps.sort((a, b) => b.date - a.date).forEach((p) => list.append(h('.proj', null,
        h('.pinfo', null, h('.pname', null, p.name), h('.psub', null, new Date(p.date).toLocaleString(HP.lang() === 'da' ? 'da-DK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + p.doc.items.filter((i) => i.kind === 'product').length + ' ' + t('products', 'produkter'))),
        h('button.btn.sm', { onclick: () => { store.load(p.doc, p.plan); close(); HP.toast(t('Opened "' + p.name + '"', 'Åbnede "' + p.name + '"'), { action: { label: t('Undo', 'Fortryd'), fn: store.undo } }); } }, t('Open', 'Åbn')),
        h('button.icon-btn', { title: t('Delete', 'Slet'), onclick: () => { LS.set('projects', all().filter((x) => x.id !== p.id)); draw(); } }, icon('trash', 14)))));
    }
    const save = () => {
      const name = nameIn.value.trim(); if (!name) return nameIn.focus();
      store.doc.name = name; store.commit();
      const ps = all().filter((x) => x.name !== name), entry = { id: HP.uid(), name, date: Date.now(), doc: store.doc, plan: hasPlan() ? store.planSrc : null };
      ps.push(entry);
      if (!LS.set('projects', ps)) { entry.plan = null; if (!LS.set('projects', ps)) return HP.toast(t('Browser storage is full. Export the project as a file instead.', 'Browserens lager er fuldt. Eksportér projektet som fil i stedet.'), { kind: 'err' }); HP.toast(t('Saved without the floor plan image (too large). Export as file to keep it.', 'Gemt uden plantegning (for stor). Eksportér som fil for at beholde den.'), { kind: 'warn' }); }
      else HP.toast(t('Project saved', 'Projekt gemt'), { kind: 'ok' });
      draw();
    };
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => { const fr = new FileReader(); fr.onload = () => { try { const j = JSON.parse(fr.result); if (!j.doc || !Array.isArray(j.doc.items)) throw 0; store.load(j.doc, j.plan); close(); } catch (e) { HP.toast(t('That file is not a HiFi Planner project.', 'Filen er ikke et HiFi Planner-projekt.'), { kind: 'err' }); } }; fr.readAsText(file.files[0]); } });
    const close = HP.modal({ title: t('Projects', 'Projekter'), size: 'md',
      body: [h('.row', null, nameIn, h('button.btn.primary', { onclick: save }, t('Save current', 'Gem nuværende'))),
        h('p.muted', null, t('Projects are stored in this browser on this PC. Use Export to move a proposal to another PC or keep a backup. Your work is also autosaved continuously.', 'Projekter gemmes i denne browser på denne PC. Brug Eksportér for at flytte et tilbud til en anden PC eller tage backup. Dit arbejde autosaves også løbende.')),
        list, file],
      foot: [h('button.btn', { onclick: () => HP.confirm(t('Clear the canvas and start a new proposal? (You can undo.)', 'Ryd lærredet og start et nyt tilbud? (Kan fortrydes.)'), t('New', 'Nyt'), () => { store.load(store.blank()); close(); }) }, icon('page', 14), t('New empty canvas', 'Nyt tomt lærred')), h('.spacer'),
        h('button.btn', { onclick: () => file.click() }, icon('upload', 14), t('Import file', 'Importér fil')),
        h('button.btn', { onclick: () => download((store.doc.name || 'hifi-planner') + '.hifiplan.json', JSON.stringify({ app: 'hifi-planner', v: 2, doc: store.doc, plan: hasPlan() ? store.planSrc : null })) }, icon('download', 14), t('Export file', 'Eksportér fil'))] });
    draw();
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
            li(t('The round badges on a card show Bluetooth and WiFi. The small colour dots on the image pick the colour/finish (also with C); the price list follows the chosen colour.', 'De runde mærker på et kort viser Bluetooth og WiFi. De små farveprikker på billedet vælger farve/finish (også med C); prislisten følger den valgte farve.')))),
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
        h('.keys', null, [[['Del'], t('Delete selection', 'Slet markering')], [['Ctrl', 'Z'], t('Undo', 'Fortryd')], [['Ctrl', 'Y'], t('Redo', 'Annuller fortryd')], [['Ctrl', 'C'], t('Copy', 'Kopiér')], [['Ctrl', 'V'], t('Paste', 'Indsæt')], [['Ctrl', 'D'], t('Duplicate', 'Dublér')], [['Ctrl', 'A'], t('Select all', 'Markér alt')],
          [[t('Type', 'Skriv')], t('Search products (anywhere on the canvas)', 'Søg produkter (hvor som helst på lærredet)')], [['Enter'], t('In the search: add the highlighted result (the first one, or pick with ↓/↑)', 'I søgningen: tilføj det markerede resultat (det første, eller vælg med ↓/↑)')], [['Shift', 'Enter'], t('In the search: open the Katalog with it', 'I søgningen: åbn Katalog med den')], [['Alt', 'K'], t('Open the Katalog', 'Åbn Katalog')],
          [['Alt', 'T'], t('Add text', 'Tilføj tekst')], [['Alt', 'R'], t('Replace selected card', 'Udskift markeret kort')], [['Alt', 'B'], t('Flip front/back', 'Vend for/bag')], [['Alt', 'C'], t('Variant', 'Variant')], [['Alt', 'I'], t('Inspect image', 'Se billedet nærmere')], [['Alt', 'L'], t('Lock floor plan', 'Lås plantegning')], [[']'], t('Bring to front', 'Placér forrest')], [['['], t('Send to back', 'Placér bagerst')],
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
