/* HiFi Planner v2 — app shell: top bar, sidebar (products + Shortcuts), pickers, projects, help, settings, login. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, icon, LS } = HP;
  const Pn = (HP.panels = {});
  const C = () => HP.canvas;

  /* ---------- shared: product row + drag from a list onto the canvas ---------- */
  function productRow(p, extra) {
    return h('.prow', { data: { id: p.id } },
      h('.thumb', null, h('img', { src: (p.img || [])[0] || '', loading: 'lazy', draggable: false, alt: '', onerror() { this.style.visibility = 'hidden'; } })),
      h('.pinfo', null, h('.pname', null, p.name), h('.psub', null, p.brand + (p.price ? ' · ' + HP.money(p.price) : ''))),
      h('.pmeta', null, p.bt && icon('bt', 13), p.wifi && icon('wifi', 13), extra));
  }
  function listDrag(e, label, onDrop, onClick, hover) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null;
    const mv = (ev) => {
      if (!ghost) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; ghost = h('.drag-ghost', null, label); document.body.append(ghost); document.body.classList.add('dragging'); }
      ghost.style.transform = 'translate(' + (ev.clientX + 14) + 'px,' + (ev.clientY + 14) + 'px)';
      hover && hover(ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (ghost) { ghost.remove(); document.body.classList.remove('dragging'); onDrop(ev.clientX, ev.clientY); } else onClick();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  const inViewport = (cx, cy) => { const r = document.getElementById('viewport').getBoundingClientRect(); return cx > r.left && cx < r.right && cy > r.top && cy < r.bottom; };

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    let tab = LS.get('tab', 'products'), group = '', rows = [];
    const search = h('input#sb-search', { type: 'search', placeholder: t('Search name, brand, SKU, port…', 'Søg navn, brand, SKU, port…'), oninput: filter });
    const catSel = h('select', { onchange: filter, title: t('Category', 'Kategori') });
    const brandSel = h('select', { onchange: filter, title: 'Brand' });
    const chips = h('.chips');
    const count = h('span.count');
    const list = h('.plist#sb-list');
    const scList = h('.sclist');
    const tabs = h('.tabs', null,
      h('button', { data: { tab: 'products' }, onclick: () => setTab('products') }, t('Products', 'Produkter')),
      h('button#tab-shortcuts', { data: { tab: 'shortcuts' }, onclick: () => setTab('shortcuts') }, icon('bolt', 14), t('Shortcuts', 'Genveje')));
    const prodPane = h('.pane', null, h('.filters', null, h('.searchbox', null, icon('search', 15), search), chips, h('.selrow', null, catSel, brandSel)),
      h('.listhead', null, count, h('span.hint', null, t('Drag onto canvas, or click', 'Træk ind på lærredet, eller klik'))), list);
    const scPane = h('.pane', null, scList);
    const el = h('aside#sidebar', null, tabs, prodPane, scPane);

    function setTab(x) { tab = x; LS.set('tab', x); tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === x)); prodPane.hidden = x !== 'products'; scPane.hidden = x !== 'shortcuts'; }
    function fillSelects() {
      const present = new Set(cat.products().flatMap((p) => p.cats || []));
      const keepCat = catSel.value, keepBrand = brandSel.value;
      catSel.textContent = ''; catSel.append(h('option', { value: '' }, t('All categories', 'Alle kategorier')));
      const known = new Set();
      HP.CAT_TREE.filter((g) => !group || g[0] === group).forEach(([g, subs]) => {
        const og = h('optgroup', { label: g });
        subs.forEach((s) => { known.add(s); if (present.has(s)) og.append(h('option', { value: s }, s)); });
        if (og.children.length) catSel.append(og);
      });
      if (!group) { const rest = [...present].filter((c) => !HP.CAT_TREE.some((g) => g[1].includes(c))).sort(); if (rest.length) catSel.append(h('optgroup', { label: t('Other', 'Andet') }, rest.map((s) => h('option', { value: s }, s)))); }
      catSel.value = [...catSel.options].some((o) => o.value === keepCat) ? keepCat : '';
      brandSel.textContent = ''; brandSel.append(h('option', { value: '' }, t('All brands', 'Alle brands')));
      [...new Set(cat.products().map((p) => p.brand))].sort((a, b) => a.localeCompare(b)).forEach((b) => brandSel.append(h('option', { value: b }, b)));
      brandSel.value = keepBrand;
      chips.textContent = '';
      [['', t('All', 'Alle')], ...HP.CAT_TREE.map((g) => [g[0], g[0]])].forEach(([g, label]) => chips.append(h('button' + (group === g ? '.on' : ''), { onclick: () => { group = g; fillSelects(); filter(); } }, label)));
    }
    function buildList() {
      list.textContent = '';
      rows = cat.products().map((p) => {
        const r = productRow(p);
        r.addEventListener('pointerdown', (e) => listDrag(e, p.name, (x, y) => C().dropProduct(p.id, x, y), () => C().addProductCenter(p.id), (x, y) => C().dragHover(x, y)));
        list.append(r);
        return { p, r };
      });
      filter();
    }
    function filter() {
      const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean), cv = catSel.value, bv = brandSel.value;
      const gcats = group ? HP.CAT_TREE.find((g) => g[0] === group)[1] : null;
      let n = 0;
      rows.forEach(({ p, r }) => {
        const ok = words.every((w) => p._hay.includes(w)) && (!cv || (p.cats || []).includes(cv)) && (!bv || p.brand === bv) && (!gcats || (p.cats || []).some((c) => gcats.includes(c)));
        r.hidden = !ok; if (ok) n++;
      });
      count.textContent = n + ' ' + t('products', 'produkter');
    }
    function buildShortcuts() {
      scList.textContent = '';
      if (HP.isAdmin()) scList.append(h('button.btn.block', { onclick: () => HP.editor.saveShortcut() }, icon('plus', 14), t('Save canvas / selection as Shortcut', 'Gem lærred / markering som genvej')));
      if (!cat.templates.length) scList.append(h('.empty', null, t('No Shortcuts yet. An admin can save a system from the canvas as a Shortcut.', 'Ingen genveje endnu. En admin kan gemme et system fra lærredet som genvej.')));
      cat.templates.forEach((tp) => {
        const prods = tp.items.filter((i) => i.kind === 'product').map((i) => cat.get(i.pid)).filter(Boolean);
        const card = h('.sc', null,
          h('.sc-thumbs', null, prods.slice(0, 4).map((p) => h('img', { src: (p.img || [])[0] || '', draggable: false, alt: '' }))),
          h('.sc-name', null, tp.name), tp.desc && h('.sc-desc', null, tp.desc),
          h('.sc-meta', null, prods.length + ' ' + t('products', 'produkter') + ' · ' + (tp.conns || []).length + ' ' + t('connections', 'forbindelser')),
          HP.isAdmin() && h('.sc-admin', null,
            h('button.icon-btn', { title: t('Rename', 'Omdøb'), onpointerdown: (e) => e.stopPropagation(), onclick: () => HP.editor.saveShortcut(tp) }, icon('edit', 14)),
            h('button.icon-btn', { title: t('Delete', 'Slet'), onpointerdown: (e) => e.stopPropagation(), onclick: () => HP.confirm(t('Delete Shortcut "' + tp.name + '"?', 'Slet genvejen "' + tp.name + '"?'), t('Delete', 'Slet'), () => cat.removeTemplate(tp.id)) }, icon('trash', 14))));
        card.addEventListener('pointerdown', (e) => listDrag(e, tp.name, (x, y) => inViewport(x, y) && C().insertTemplate(tp, x, y), () => C().insertTemplate(tp)));
        scList.append(card);
      });
    }
    fillSelects(); buildList(); buildShortcuts(); setTab(tab);
    HP.on('catalog', () => { fillSelects(); buildList(); buildShortcuts(); });
    Pn.showTab = setTab;
    Pn.focusSearch = () => { setTab('products'); search.focus(); search.select(); };
    return el;
  }

  /* ---------- top bar ---------- */
  function buildTopbar() {
    const tb = (id, ic, label, fn, opts) => h('button.tbtn' + ((opts && opts.cls) || ''), { id, title: label + ((opts && opts.key) ? ' (' + opts.key + ')' : ''), onclick: fn }, icon(ic), opts && opts.text && h('span', null, label));
    const name = h('input.docname', { placeholder: t('Untitled proposal', 'Unavngivet tilbud'), value: store.doc.name || '', title: t('Proposal name (shown on the printout)', 'Tilbuddets navn (vises på printet)'),
      onchange: () => { store.doc.name = name.value.trim(); store.commit(); } });
    const undo = tb('tb-undo', 'undo', t('Undo', 'Fortryd'), store.undo, { key: 'Ctrl+Z' }), redo = tb('tb-redo', 'redo', t('Redo', 'Annuller fortryd'), store.redo, { key: 'Ctrl+Y' });
    const prices = tb('tb-prices', 'tag', t('Price list', 'Prisliste'), () => C().togglePrices(), { text: 1 });
    const ci = tb('tb-ci', 'plan', t('CI mode', 'CI-tilstand'), () => C().setCI(!store.doc.ci), { text: 1 });
    const orient = h('button.tbtn#tb-orient', { title: t('Switch A4 portrait / landscape', 'Skift A4 stående / liggende'), onclick: () => { store.doc.orient = store.doc.orient === 'portrait' ? 'landscape' : 'portrait'; store.commit(); C().fit(); } }, icon('rotate'), h('span'));
    const publish = h('button.tbtn.publish#tb-publish', { onclick: () => HP.editor.publish() }, icon('cloud'), h('span'));
    const adminBox = h('.tgroup.admin', null, tb('tb-editor', 'edit', t('Product Editor', 'Produkt-editor'), () => HP.editor.open(), { text: 1 }), publish);
    const bar = h('header#topbar', null,
      h('.brandmark', { title: 'HiFi Planner' }, h('img', { src: 'assets/hifi-planner-logo.png', alt: 'HiFi Planner' })),
      name,
      h('.tgroup', null, undo, redo),
      h('.tgroup#tb-insert', null, tb('tb-text', 'text', t('Text', 'Tekst'), () => C().addText(), { text: 1 }), prices, ci),
      h('.tgroup', null, orient, tb('tb-print', 'print', t('Print / PDF', 'Print / PDF'), () => C().print(), { text: 1, key: 'Ctrl+P', cls: '.primary' })),
      h('.spacer'),
      adminBox,
      h('.tgroup', null, tb('tb-projects', 'folder', t('Projects', 'Projekter'), Pn.projects, { text: 1 }), tb('tb-help', 'help', t('Help', 'Hjælp'), Pn.help, { text: 1 })),
      h('.tgroup', null,
        h('button.tbtn.lang', { title: t('Language', 'Sprog'), onclick: () => { HP.setLang(HP.lang() === 'da' ? 'en' : 'da'); location.reload(); } }, HP.lang() === 'da' ? 'DA' : 'EN'),
        tb('tb-theme', document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', t('Light / dark', 'Lys / mørk'), () => { const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = d; LS.set('theme', d); const b = document.getElementById('tb-theme'); b.replaceChild(icon(d === 'dark' ? 'sun' : 'moon'), b.firstChild); }),
        tb('tb-settings', 'gear', t('Settings', 'Indstillinger'), Pn.settings)));
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

  /* ---------- CI bar (inside the viewport) ---------- */
  function buildCIBar() {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { C().loadPlan(file.files[0]); file.value = ''; } });
    const size = h('input', { type: 'range', min: 20, max: 180, step: 5, oninput: () => { C().setCISize(+size.value, false); val.textContent = size.value + ' px'; }, onchange: () => C().setCISize(+size.value, true) });
    const val = h('span.mono');
    const bar = h('.cibar', { hidden: true }, h('b', null, t('CI mode', 'CI-tilstand')), h('span.muted', null, t('Product size', 'Produktstørrelse')), size, val,
      h('button.btn.sm', { onclick: () => file.click() }, icon('upload', 14), t('Floor plan', 'Plantegning')),
      h('button.btn.sm', { onclick: () => C().setCI(false) }, t('Exit', 'Afslut')), file);
    const sync = () => { bar.hidden = !store.doc.ci; size.value = store.doc.ciSize; val.textContent = store.doc.ciSize + ' px'; };
    HP.on('doc', sync); setTimeout(sync);
    return bar;
  }

  Pn.build = (root) => {
    const main = h('#main');
    root.append(buildTopbar(), h('#body', null, buildSidebar(), main));
    HP.canvas.init(main);
    document.getElementById('viewport').append(buildCIBar());
  };

  /* ---------- cable picker ---------- */
  Pn.cablePicker = (connId) => {
    const c = store.doc.conns.find((x) => x.id === connId); if (!c) return;
    const info = C().connInfo(c), a = info.a || { label: '?', conn: 'other' }, b = info.b || { label: '?', conn: 'other' };
    const q = h('input', { type: 'search', placeholder: t('Search cables…', 'Søg kabler…'), oninput: draw, autofocus: true });
    const list = h('.plist.tall');
    let showAll = false;
    const pick = (id) => { c.cable = id; store.commit(); close(); };
    function draw() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const all = cat.cables().filter((p) => words.every((w) => p._hay.includes(w) || (p.cable || []).some((x) => x.includes(w)))).map((p) => ({ p, fit: P.cableFit(p.cable, a.conn, b.conn) }));
      list.textContent = '';
      const sec = (title, items) => { if (!items.length) return; list.append(h('.sec', null, title + ' (' + items.length + ')'));
        items.sort((x, y) => x.p.price - y.p.price).forEach(({ p }) => { const r = productRow(p, h('span.tagline', null, (p.cable || []).map((x) => P.CONNECTORS[x] || x).join(' / '))); if (c.cable === p.id) r.classList.add('on'); r.onclick = () => pick(p.id); list.append(r); }); };
      const good = all.filter((x) => x.fit === 2), maybe = all.filter((x) => x.fit === 1), other = all.filter((x) => x.fit === 0);
      sec(t('Matching cables', 'Passende kabler'), good); sec(t('May fit', 'Passer muligvis'), maybe);
      if (showAll || words.length || !(good.length + maybe.length)) sec(t('Other cables', 'Andre kabler'), other);
      else if (other.length) list.append(h('button.link.pad', { onclick: () => { showAll = true; draw(); } }, t('Show ' + other.length + ' other cables', 'Vis ' + other.length + ' andre kabler')));
      if (!all.length) list.append(h('.empty', null, t('No cables found.', 'Ingen kabler fundet.')));
    }
    const close = HP.modal({ title: t('Cable for this connection', 'Kabel til denne forbindelse'), size: 'md', flush: true,
      body: [h('.conn-head', null, h('span.pill.c-' + a.conn, null, a.label), h('span.arrow', null, '→'), h('span.pill.c-' + b.conn, null, b.label),
        h('span.muted', null, P.CONNECTORS[a.conn] + (a.conn !== b.conn ? ' → ' + P.CONNECTORS[b.conn] : '')),
        info.warn && h('.warnline', null, icon('warn', 14), t('These connector types do not normally fit together.', 'Disse stiktyper passer normalt ikke sammen.'))),
        h('.searchbox.pad', null, icon('search', 15), q), list],
      foot: [h('button.btn.danger', { onclick: () => { store.selConn = c.id; C().deleteSelection(); close(); } }, icon('trash', 14), t('Delete connection', 'Slet forbindelse')), h('.spacer'),
        c.cable && h('button.btn', { onclick: () => pick(null) }, t('Remove cable', 'Fjern kabel')), h('button.btn', { onclick: () => close() }, t('Close', 'Luk'))] });
    draw();
  };

  /* ---------- replace picker ---------- */
  Pn.replacePicker = (itemId) => {
    const it = store.item(itemId), old = cat.get(it.pid) || { cats: [], in: [], out: [], name: '?' };
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

  /* ---------- help ---------- */
  Pn.help = () => {
    const k = (x) => h('kbd', null, x);
    const li = (...x) => h('li', null, ...x);
    const close = HP.modal({ title: t('Help', 'Hjælp'), size: 'lg',
      body: h('.help', null,
        h('.help-top', null, h('button.btn.primary', { onclick: () => { close(); HP.tour.start(); } }, icon('play', 14), t('Start guided tour', 'Start guidet rundvisning')),
          HP.config.feedbackUrl && h('a.btn', { href: HP.config.feedbackUrl, target: '_blank', rel: 'noopener' }, t('Send feedback', 'Send feedback')),
          HP.config.supportPhone && h('span.muted', null, t('Urgent support: ', 'Akut support: ') + 'Tlf. ' + HP.config.supportPhone)),
        h('.note-box', null, icon('warn', 15), t('Prices are not updated in real time. Never rely on the price list alone; check the till system.', 'Priser opdateres ikke i realtid. Stol aldrig kun på prislisten; tjek kassesystemet.')),
        h('.cols', null,
          h('div', null, h('h3', null, t('Build a system', 'Byg et system')), h('ul', null,
            li(t('Drag a product from the list onto the canvas, or click it to add it in the middle.', 'Træk et produkt fra listen ind på lærredet, eller klik for at tilføje det i midten.')),
            li(t('Drag from an output dot (right side) to an input dot (left side) to draw a cable. You can also click one dot, then the other.', 'Træk fra en udgangsprik (højre side) til en indgangsprik (venstre side) for at trække et kabel. Du kan også klikke på én prik og derefter den anden.')),
            li(t('Dot and wire colours show the connector type. A dashed wire with a warning means the two connectors do not match.', 'Farven på prikker og ledninger viser stiktypen. En stiplet ledning med advarsel betyder, at de to stik ikke passer sammen.')),
            li(t('Click a wire to choose a cable. Matching cables are listed first. Drag a wire sideways to tidy its route.', 'Klik på en ledning for at vælge et kabel. Passende kabler vises først. Træk en ledning sidelæns for at rydde op i føringen.')),
            li(t('Click a card image to flip between front and back.', 'Klik på et kortbillede for at skifte mellem for- og bagside.')),
            li(t('Select a card and press Replace (or drop another product on top of it) to swap the product and keep its cables.', 'Markér et kort og tryk Udskift (eller slip et andet produkt oven på det) for at skifte produktet og beholde kablerne.')),
            li(t('The round badges on a card show Bluetooth and WiFi.', 'De runde mærker på et kort viser Bluetooth og WiFi.')))),
          h('div', null, h('h3', null, t('Proposal & print', 'Tilbud & print')), h('ul', null,
            li(t('The frame on the canvas is an A4 page. What is inside the frame is what gets printed. Add pages with the + on the right.', 'Rammen på lærredet er en A4-side. Det, der ligger inden for rammen, bliver printet. Tilføj sider med + til højre.')),
            li(t('Print / PDF opens the print dialog. Choose "Save as PDF" to email the proposal.', 'Print / PDF åbner printdialogen. Vælg "Gem som PDF" for at maile tilbuddet.')),
            li(t('Price list adds a movable list with all products, cables and the total.', 'Prisliste tilføjer en flytbar liste med alle produkter, kabler og total.')),
            li(t('Text adds a note. Drag the top edge to move it, the corner to resize.', 'Tekst tilføjer en note. Træk i den øverste kant for at flytte, hjørnet for at ændre størrelse.')),
            li(t('Shortcuts are ready-made systems. Click or drag one onto the canvas.', 'Genveje er færdige systemer. Klik eller træk en ind på lærredet.')),
            li(t('CI mode shrinks products to icons for floor plans. Upload a plan (JPG/PNG) and set the product size. Cables are hidden, not deleted.', 'CI-tilstand gør produkter til ikoner til plantegninger. Upload en plan (JPG/PNG) og vælg produktstørrelse. Kabler skjules, de slettes ikke.')),
            li(t('Projects saves proposals in this browser and exports them as files.', 'Projekter gemmer tilbud i denne browser og eksporterer dem som filer.'))))),
        h('h3', null, t('Search', 'Søgning')),
        h('p', null, t('Search by model, brand, SKU, category, port name (e.g. "HDMI eARC", "PHONO IN") or "bluetooth" / "wifi". Combine words with spaces. Use "Peripherals" or "Stand-in" for generic stand-in products.', 'Søg på model, brand, SKU, kategori, portnavn (fx "HDMI eARC", "PHONO IN") eller "bluetooth" / "wifi". Kombinér ord med mellemrum. Brug "Peripherals" eller "Stand-in" for generiske stand-in-produkter.')),
        h('h3', null, t('Keyboard', 'Tastatur')),
        h('.keys', null, [[['Del'], t('Delete selection', 'Slet markering')], [['Ctrl', 'Z'], t('Undo', 'Fortryd')], [['Ctrl', 'Y'], t('Redo', 'Annuller fortryd')], [['Ctrl', 'D'], t('Duplicate', 'Dublér')], [['Ctrl', 'A'], t('Select all', 'Markér alt')],
          [['Shift', t('drag', 'træk')], t('Box select', 'Markér med boks')], [['R'], t('Replace selected card', 'Udskift markeret kort')], [['F'], t('Fit to window', 'Tilpas til vindue')], [['/'], t('Search products', 'Søg produkter')],
          [['←↑↓→'], t('Nudge selection', 'Flyt markering')], [[t('Scroll', 'Scroll')], 'Zoom'], [['Space', t('drag', 'træk')], t('Pan', 'Panorér')], [['Ctrl', 'S'], t('Projects', 'Projekter')], [['Ctrl', 'P'], 'Print / PDF'], [['Esc'], t('Cancel', 'Annullér')]]
          .map(([keys, label]) => h('.key', null, h('span', null, keys.map(k)), label))),
        h('h3', null, t('Categories', 'Kategorier')),
        h('.cattree', null, HP.CAT_TREE.map(([g, subs]) => h('details', null, h('summary', null, g), h('ul', null, subs.map((s) => h('li', null, s))))))) });
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
        h('.row', null, h('button.btn', { onclick: () => HP.editor.exportData() }, icon('download', 14), t('Export data files', 'Eksportér datafiler')),
          h('button.btn', { onclick: () => { LS.set('admin', false); HP.emit('admin'); HP.emit('catalog'); drawAdmin(); } }, t('Leave admin mode', 'Forlad admin-tilstand'))));
    }
    drawAdmin();
    HP.modal({ title: t('Settings', 'Indstillinger'), size: 'md', onClose: () => { if (HP.isAdmin()) saveGh(); },
      body: [h('h3', null, t('Shop', 'Butik')), h('.row', null, shop, h('button.btn', { onclick: () => { if (HP.config.shops.includes(shop.value.trim())) { LS.set('shop', shop.value.trim()); HP.emit('doc'); HP.toast(t('Shop number saved', 'Butiksnummer gemt'), { kind: 'ok' }); } else HP.toast(t('Unknown shop number', 'Ukendt butiksnummer'), { kind: 'err' }); } }, t('Change', 'Skift'))),
        h('h3', null, 'Admin'), adminPane] });
  };

  /* ---------- login ---------- */
  Pn.login = (then) => {
    if (HP.config.shops.includes(HP.shop())) return then();
    const err = h('.err');
    const input = h('input', { placeholder: t('Shop number', 'Butiksnummer'), inputMode: 'numeric', autofocus: true, onkeydown: (e) => e.key === 'Enter' && go() });
    const go = () => { const v = input.value.trim(); if (HP.config.shops.includes(v)) { LS.set('shop', v); ov.remove(); then(); } else { err.textContent = t('Unknown shop number.', 'Ukendt butiksnummer.'); input.select(); } };
    const ov = h('#login', null, h('.login-card', null, h('img', { src: 'assets/hifi-planner-logo.png', alt: 'HiFi Planner' }),
      h('.row', null, input, h('button.btn.primary', { onclick: go }, t('Enter', 'Log ind'))), err));
    document.body.append(ov); setTimeout(() => input.focus(), 50);
  };
})();
