/* HiFi Planner v2 — admin: product Editor, Shortcuts, publishing to GitHub. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat, ports: P, icon, LS } = HP;
  const E = (HP.editor = {});
  const DATA = window.HP_DATA;

  const TYPE_CATS = HP.site.TYPE_CATS, TYPE_CABLE = HP.site.TYPE_CABLE;

  /* Floating image window: stays open beside the editor so the rear panel can be checked while the ports are edited.
     Wheel = zoom at the pointer, drag = pan, double-click = fit. The window can be moved by its title bar and resized at its corner. */
  let peekEl = null;
  E.closePeek = () => { if (peekEl) { peekEl.remove(); peekEl = null; } };
  E.peek = (faces, start, title) => { // faces: [{ label, src }]
    faces = faces.filter((f) => f.src); if (!faces.length) return;
    let face = Math.max(0, Math.min(start || 0, faces.length - 1)), z = 1, x = 0, y = 0, base = 1;
    const img = h('img', { draggable: false, alt: '', onerror: HP.site.onerr, onload: () => fit() });
    const stage = h('.peek-stage', null, img), zl = h('span.peek-z');
    const apply = () => { img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + base * z + ')'; zl.textContent = Math.round(z * 100) + '%'; };
    const fit = () => { const r = stage.getBoundingClientRect(), w = img.naturalWidth || 1, hh = img.naturalHeight || 1; base = Math.min(r.width / w, r.height / hh); z = 1; x = (r.width - w * base) / 2; y = (r.height - hh * base) / 2; apply(); };
    const zoomAt = (cx, cy, nz) => { nz = Math.max(1, Math.min(12, nz)); const r = stage.getBoundingClientRect(), px = cx - r.left, py = cy - r.top; x = px - (px - x) * nz / z; y = py - (py - y) * nz / z; z = nz; apply(); };
    const show = (i) => { face = i; img.classList.remove('broken'); img.dataset.fb = HP.site.fallback(faces[i].src, 'hd'); img.src = HP.site.src(faces[i].src, 'hd'); tabs.forEach((b, j) => b.classList.toggle('on', j === i)); };
    stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, z * Math.exp(-e.deltaY * 0.0018)); }, { passive: false });
    stage.addEventListener('dblclick', fit);
    stage.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; stage.setPointerCapture(e.pointerId); stage.classList.add('drag'); const sx = e.clientX - x, sy = e.clientY - y;
      const mv = (ev) => { x = ev.clientX - sx; y = ev.clientY - sy; apply(); }, up = () => { stage.removeEventListener('pointermove', mv); stage.classList.remove('drag'); };
      stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up, { once: true }); });
    const tabs = faces.length > 1 ? faces.map((f, i) => h('button', { onclick: () => show(i) }, f.label)) : [];
    const head = h('.peek-head', null, h('b', null, title || ''), h('.peek-tabs', null, tabs), zl,
      h('button.icon-btn', { title: t('Fit', 'Tilpas'), onclick: fit }, icon('fit', 14)), h('button.icon-btn', { title: t('Close', 'Luk'), onclick: E.closePeek }, icon('x', 14)));
    head.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; head.setPointerCapture(e.pointerId);
      const mv = (ev) => { el.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px'; };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', () => head.removeEventListener('pointermove', mv), { once: true }); });
    const prev = peekEl && peekEl.getBoundingClientRect();
    E.closePeek();
    const el = (peekEl = h('#peek', null, head, stage, h('.peek-hint', null, t('Scroll to zoom · drag to move · double-click to fit', 'Scroll for at zoome · træk for at flytte · dobbeltklik for at tilpasse'))));
    Object.assign(el.style, prev ? { left: prev.left + 'px', top: prev.top + 'px', width: prev.width + 'px', height: prev.height + 'px' }
      : { width: Math.min(760, innerWidth * 0.5) + 'px', height: Math.min(560, innerHeight * 0.6) + 'px', left: Math.max(8, innerWidth - Math.min(760, innerWidth * 0.5) - 24) + 'px', top: '72px' });
    document.body.append(el);
    new ResizeObserver(() => fit()).observe(stage);
    show(face);
  };
  E.TYPE_CATS = TYPE_CATS;

  /* ================= product editor ================= */
  E.open = (startId) => {
    let cur = null, isNew = false, mode = 'all', showAcc = false;
    const siteNew = () => { const have = new Set(cat.list.flatMap((p) => [p.sku, p.site]).filter(Boolean).map((s) => s.toUpperCase())); return (window.HP_DATA.siteNew || []).filter((s) => !have.has(s.sku.toUpperCase())); };
    const relevant = (s) => TYPE_CATS[s.type] || TYPE_CABLE[s.type];
    const modes = h('.ed-modes');
    const q = h('input', { type: 'search', placeholder: t('Search catalogue…', 'Søg i kataloget…'), oninput: drawList });
    const list = h('.plist.tall'), form = h('.ed-form');
    const blankProduct = (cable) => Object.assign({ id: '', brand: '', name: '', sku: '', price: 0, cats: cable ? ['Cable'] : [], img: [] }, cable ? { cable: [] } : { in: [], out: [] });

    function drawModes() {
      const goneN = cat.list.filter((p) => p.gone).length, reviewN = cat.list.filter((p) => p.review).length, newN = siteNew().length;
      modes.textContent = '';
      [['all', t('Catalogue', 'Katalog'), cat.list.length, ''], ['review', t('Review', 'Tjek'), reviewN, t('Added automatically from hifiklubben.dk: check inputs/outputs and images, then Save', 'Tilføjet automatisk fra hifiklubben.dk: tjek ind-/udgange og billeder, og tryk Gem')], ['gone', t('Discontinued', 'Udgået'), goneN, t('Products no longer on hifiklubben.dk', 'Produkter, der ikke længere er på hifiklubben.dk')], ['new', t('Website', 'Website'), newN, t('Other hifiklubben.dk products that are not in HiFi Planner (mostly accessories). Relevant products are added automatically and appear under Review.', 'Andre produkter på hifiklubben.dk, som ikke er i HiFi Planner (mest tilbehør). Relevante produkter tilføjes automatisk og vises under Tjek.')]].forEach(([m, label, n, tip]) =>
        modes.append(h('button' + (mode === m ? '.on' : ''), { title: tip, onclick: () => { mode = m; drawModes(); drawList(); } }, label, h('span.n', null, n))));
    }
    function drawList() {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list.textContent = '';
      if (mode === 'new') {
        const rows = siteNew().filter((s) => words.every((w) => (s.brand + ' ' + s.model + ' ' + s.sku + ' ' + s.type).toLowerCase().includes(w)));
        list.append(h('.pad.muted.small', null, t('Not added automatically. Click one to make a card for it anyway.', 'Tilføjes ikke automatisk. Klik på et for alligevel at lave et kort.')));
        if (!window.HP_DATA.siteNew) list.append(h('.empty', null, t('No website data yet. The hourly catalogue sync writes it.', 'Ingen data fra hjemmesiden endnu. Den timelige katalogsynkronisering skriver dem.')));
        rows.slice(0, 400).forEach((s) => list.append(h('.prow', { onclick: () => fromSite(s) },
          h('.thumb', null, HP.imgEl(s.image || '', 'thumb', { loading: 'lazy' })),
          h('.pinfo', null, h('.pname', null, s.model), h('.psub', null, s.brand + ' · ' + (s.type || '?') + ' · ' + HP.money(s.price))))));
        return;
      }
      cat.list.filter((p) => (mode !== 'gone' || p.gone) && (mode !== 'review' || p.review) && words.every((w) => p._hay.includes(w))).slice(0, 300).forEach((p) => {
        const r = h('.prow' + (cur && cur.id === p.id && !isNew ? '.on' : ''), { onclick: () => edit(p) },
          h('.thumb', null, HP.imgEl((p.img || [])[0] || '', 'thumb', { loading: 'lazy' })),
          h('.pinfo', null, h('.pname', null, p.name), h('.psub', null, p.brand + (p.cable ? ' · ' + t('cable', 'kabel') : '') + (p.gone ? ' · ' + t('gone since ', 'udgået siden ') + p.gone : '') + (p.review ? ' · ' + t('to review', 'skal tjekkes') : ''))),
          cat.draft.products[p.id] && h('span.badge', null, t('draft', 'kladde')), p.gone && h('span.badge.gone', null, t('discontinued', 'udgået')));
        list.append(r);
      });
    }
    // Start a new card from a hifiklubben.dk product: everything except I/O is filled in.
    function fromSite(s) {
      const cable = TYPE_CABLE[s.type];
      const p = Object.assign(blankProduct(!!cable), { brand: s.brand, name: s.model, sku: s.sku, site: s.sku, price: s.price, img: [s.image || '', ''], _url: s.url, _type: s.type });
      if (s.was) p.was = s.was;
      if (cable) p.cable = cable.slice(); else p.cats = (TYPE_CATS[s.type] || []).slice();
      edit(p, true);
    }
    function edit(p, asNew) { cur = JSON.parse(JSON.stringify(cat.clean(p))); isNew = !!asNew; if (asNew) cur.id = ''; drawList(); drawForm(); }
    // the product page when the sync knows it, otherwise the website's search
    const siteLink = (p) => { const u = p._url || p.url; if (u) return /^https?:/.test(u) ? u : 'https://www.hifiklubben.dk' + u;
      return p.site || p.sku ? 'https://www.hifiklubben.dk/sog/?q=' + encodeURIComponent(p.site || p.sku) : ''; };

    const imgSetters = [];
    const peekCur = (i) => E.peek([{ label: t('Front', 'Forside'), src: cur.img[0] }, { label: t('Back', 'Bagside'), src: cur.img[1] }].filter((f) => f.src), cur.img[0] ? i : 0, cur.brand + ' ' + cur.name);
    function imageField(i, label) {
      const url = h('input', { value: /^data:/.test(cur.img[i] || '') ? '' : cur.img[i] || '', placeholder: t('Image URL, or upload →', 'Billed-URL, eller upload →'), onchange: () => { set(url.value.trim()); } });
      const prev = h('.imgprev', { title: t('Click to enlarge', 'Klik for at forstørre'), onclick: () => cur.img[i] && peekCur(cur.img[0] ? i : 0) }, cur.img[i] ? HP.imgEl(cur.img[i], 'thumb') : t('none', 'ingen'));
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); set(cv.toDataURL('image/webp', 0.78)); url.value = ''; }; im.src = fr.result; }; fr.readAsDataURL(file.files[0]); } });
      imgSetters[i] = (v) => { url.value = HP.site.isHK(v) ? v : ''; set(v); };
      function set(v) { cur.img[i] = v; cur.img = [cur.img[0] || '', cur.img[1] || '']; prev.textContent = ''; prev.append(v ? HP.imgEl(v, 'thumb') : t('none', 'ingen')); preview(); }
      return h('.imgfield', null, h('span.lab', null, label), prev, url, h('button.btn.sm', { onclick: () => file.click() }, icon('upload', 14), 'Upload'), cur.img[i] && h('button.icon-btn', { title: t('Remove', 'Fjern'), onclick: () => { set(''); url.value = ''; } }, icon('x', 14)), file);
    }
    // a port: the label as written on the product (free text), what it carries (signal, suggested from the label) and the
    // physical connector (strict list). Ports added in this session follow the label until a signal or connector is picked.
    const fresh = new WeakSet(), autoSig = new WeakSet(), autoConn = new WeakSet(); // new ports: key follows the label; suggestions until picked by hand
    function portList(side) {
      const box = h('.ports');
      const draw = () => {
        box.textContent = '';
        cur[side].forEach((p, i) => {
          const upd = () => {
            const np = P.makePort(sig.value, side, '', { label: label.value || P.SIG[sig.value].label, conn: conn.value });
            if (fresh.has(p)) fresh.add(np); else if (p.key) np.key = p.key; // an existing port keeps its key, so wires in saved drawings stay connected
            if (plugSel.value && P.AUDIO.has(np.conn)) { np.ch = +plugSel.value[0]; np.g = plugSel.value[1]; } // male/female, mono/stereo set by hand
            plugSel.classList.toggle('na', !P.AUDIO.has(np.conn)); plugSel.options[0].textContent = autoTxt(np);
            if (autoSig.has(p)) autoSig.add(np); if (autoConn.has(p)) autoConn.add(np);
            cur[side][i] = np; p = np; preview();
          };
          const label = h('input.plabel-in', { value: p.label || '', placeholder: t('as written on the product, e.g. AUX IN', 'som på produktet, fx AUX IN'), spellcheck: false,
            oninput: () => {
              const g = (autoSig.has(p) || autoConn.has(p)) && P.parseLegacy(label.value, side);
              if (g && g.sig && P.SIG[g.sig]) { if (autoSig.has(p)) sig.value = g.sig; if (autoConn.has(p)) conn.value = P.conn(autoSig.has(p) ? g.conn : P.SIG[sig.value].conn, { label: label.value, sig: sig.value }, side); }
              upd();
            } });
          const sig = h('select.sig', { title: t('What the port carries', 'Hvad porten fører'), onchange: () => { autoSig.delete(p); if (autoConn.has(p)) conn.value = P.conn(P.SIG[sig.value].conn, { label: label.value, sig: sig.value }, side); upd(); } },
            P.SIGNALS.map((s) => h('option', { value: s.id, selected: s.id === p.sig }, s.label)));
          const conn = h('select.conn', { title: t('Connector', 'Stik'), onchange: () => { autoConn.delete(p); upd(); } },
            Object.entries(P.CONNECTORS).map(([k, v]) => h('option', { value: k, selected: k === P.conn(p.conn, p, side) }, v)));
          // the plug: Auto (the rules in js/ports.js) or set by hand, for a product with a fixed cable ending in plugs, say
          const short = (x) => (x ? x.ch + '× ' + x.g.toUpperCase() : '');
          const autoTxt = (q) => short(P.plug(Object.assign({}, q, { g: null, ch: null }), side)) + ' auto';
          const plugSel = h('select.plug', { title: t('Plug: 2× = stereo (an RCA pair, a TRS jack), 1× = mono; F = female (socket), M = male (plug). Auto = worked out from the signal and label.', 'Stik: 2× = stereo (et RCA-par, et TRS-jackstik), 1× = mono; F = hun (bøsning), M = han (stik). Auto = udledt af signal og navn.'), onchange: () => upd() },
            [['', autoTxt(p)], ['2f', '2× F stereo'], ['1f', '1× F mono'], ['2m', '2× M stereo'], ['1m', '1× M mono']].map(([v, l]) => h('option', { value: v, selected: v ? (p.g && p.ch && v === p.ch + p.g) : !(p.g && p.ch) }, l)));
          plugSel.classList.toggle('na', !P.AUDIO.has(P.conn(p.conn, p, side)));
          const mv = (d) => () => { const j = i + d; if (j < 0 || j >= cur[side].length) return; [cur[side][i], cur[side][j]] = [cur[side][j], cur[side][i]]; draw(); preview(); };
          box.append(h('.portrow', null, label, sig, conn, plugSel, h('button.icon-btn', { onclick: mv(-1), title: t('Up', 'Op') }, icon('up', 13)), h('button.icon-btn', { onclick: mv(1), title: t('Down', 'Ned') }, icon('down', 13)),
            h('button.icon-btn', { onclick: () => { cur[side].splice(i, 1); draw(); preview(); }, title: t('Remove', 'Fjern') }, icon('x', 13))));
        });
        box.append(h('button.btn.sm', { onclick: () => {
          const last = cur[side][cur[side].length - 1], sig = last ? last.sig : side === 'in' ? 'line' : 'speaker';
          const n = last && last.n ? String(last.n + 1) : ''; const np = P.makePort(sig, side, P.SIG[sig].custom ? '' : n, last ? { conn: last.conn } : {});
          fresh.add(np); autoSig.add(np); autoConn.add(np); cur[side].push(np); draw(); preview(); } }, icon('plus', 13), side === 'in' ? t('Add input', 'Tilføj indgang') : t('Add output', 'Tilføj udgang')));
      };
      draw();
      return box;
    }
    let prevBox;
    function preview() {
      if (!prevBox || cur.cable) return;
      const p = Object.assign({}, cur, { img: cur.img.filter(Boolean), in: P.uniqueKeys(cur.in.map((x) => Object.assign({}, x, { key: P.slug(x.label) }))), out: P.uniqueKeys(cur.out.map((x) => Object.assign({}, x, { key: P.slug(x.label) }))) });
      prevBox.textContent = ''; prevBox.append(HP.canvas.buildCard(p, { face: 0 }, false, 90));
    }
    function drawForm() {
      form.textContent = '';
      if (!cur) return form.append(h('.empty', null, t('Pick a product on the left, or create a new one.', 'Vælg et produkt til venstre, eller opret et nyt.')));
      cur.img = [cur.img[0] || '', cur.img[1] || ''];
      const inp = (key, attrs) => h('input', Object.assign({ value: cur[key] == null ? '' : cur[key], oninput(e) { cur[key] = attrs && attrs.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value; preview(); } }, attrs));
      const f = (label, el) => h('label.field', null, h('span', null, label), el);
      const allCats = [...new Set([...HP.CAT_TREE.flatMap((g) => g[1]), ...cat.products().flatMap((p) => p.cats || [])])].sort();
      const catBox = h('.catchips');
      const drawCats = HP.NEXT ? () => { // the website's category tree: one category per product; the website's own unless chosen here
        catBox.textContent = '';
        const deep = HP.catDeepest(cur.cats);
        if (deep) catBox.append(h('span.chipx', null, HP.catChain(deep).map(HP.catLabel).join(' › '), h('button', { onclick: () => { cur.cats = []; drawCats(); } }, '×')));
        catBox.append(h('select', { onchange(e) { if (e.target.value) cur.cats = HP.catChain(e.target.value); drawCats(); } }, h('option', { value: '' }, deep ? t('Change category…', 'Skift kategori…') : t('+ choose category', '+ vælg kategori')),
          HP.CAT_TREE.map(([g, subs]) => h('optgroup', { label: HP.catLabel(g) }, subs.map((c) => h('option', { value: c }, HP.catChain(c).slice(1).map(HP.catLabel).join(' › ')))))));
        if (cur.wc && deep && deep !== cur.wc) catBox.append(h('small.muted', null, t('The website files it under ', 'Hjemmesiden har den under ') + HP.catChain(cur.wc).map(HP.catLabel).join(' › ')));
      } : () => { catBox.textContent = ''; cur.cats.forEach((c) => catBox.append(h('span.chipx', null, c, h('button', { onclick: () => { cur.cats = cur.cats.filter((x) => x !== c); drawCats(); } }, '×'))));
        catBox.append(h('select', { onchange(e) { const v = e.target.value === '+' ? (prompt(t('New category name', 'Navn på ny kategori')) || '').trim() : e.target.value; if (v && !cur.cats.includes(v)) cur.cats.push(v); drawCats(); } },
          h('option', { value: '' }, t('+ add category', '+ tilføj kategori')), allCats.filter((c) => !cur.cats.includes(c)).map((c) => h('option', { value: c }, c)), h('option', { value: '+' }, t('New category…', 'Ny kategori…')))); };
      // with the new catalogue, products that follow the website get price, discount and colours from it every hour: not editable here
      const fromSite = HP.NEXT && !!cur.site && !cur.gone && !isNew, ro = fromSite ? { readOnly: true, title: t('From hifiklubben.dk, updated every hour', 'Fra hifiklubben.dk, opdateres hver time') } : {};
      form.append(
        cur.gone ? h('.note-box', null, icon('warn', 15), t('Not on hifiklubben.dk since ' + cur.gone + ' (discontinued, or the SKU is wrong). Staff see it marked as discontinued.', 'Ikke på hifiklubben.dk siden ' + cur.gone + ' (udgået, eller SKU’en er forkert). Personalet ser det markeret som udgået.'), h('button.link', { onclick: () => { delete cur.gone; HP.toast(t('Mark removed. Save to keep it.', 'Markering fjernet. Gem for at beholde det.')); drawForm(); } }, t('Clear mark', 'Fjern markering'))) : '',
        cur._url ? h('.note-box.info', null, icon('cloud', 15), t('Filled in from hifiklubben.dk (' + cur._type + '). Add the inputs and outputs, and pick a back-panel image from the product page if you want one.', 'Udfyldt fra hifiklubben.dk (' + cur._type + '). Tilføj ind- og udgange, og vælg et bagsidebillede fra produktsiden, hvis du vil have et.')) : '',
        h('.ed-head', null, h('h3', null, isNew ? (cur.cable ? t('New cable', 'Nyt kabel') : t('New product', 'Nyt produkt')) : cur.brand + ' ' + cur.name),
          siteLink(cur) && h('a.link', { href: siteLink(cur), target: '_blank', rel: 'noopener' }, t('Open on hifiklubben.dk ↗', 'Åbn på hifiklubben.dk ↗')), !isNew && h('code', null, cur.id)),
        h('.grid2', null, f('Brand', inp('brand', { list: 'ed-brands' })), f(t('Model name', 'Modelnavn'), inp('name')), f('SKU', inp('sku')), f(t('Price (DKK)', 'Pris (DKK)'), inp('price', Object.assign({ type: 'number', min: 0, step: 1 }, ro))),
          h('span'), f(t('Price before discount (empty if none)', 'Førpris ved rabat (tom hvis ingen)'), inp('was', Object.assign({ type: 'number', min: 0, step: 1 }, ro)))),
        h('small.muted', null, fromSite ? t('Price, discount and colours come from hifiklubben.dk (' + cur.site + ') and are updated every hour.', 'Pris, rabat og farver kommer fra hifiklubben.dk (' + cur.site + ') og opdateres hver time.')
          : t('Price, discount and colours are updated every hour from hifiklubben.dk when the SKU matches.', 'Pris, rabat og farver opdateres hver time fra hifiklubben.dk, når SKU’en matcher.')),
        h('datalist#ed-brands', null, [...new Set(cat.list.map((p) => p.brand))].sort().map((b) => h('option', { value: b }))),
        h('.lab', null, t('Images', 'Billeder')), imageField(0, t('Front', 'Forside')), !cur.cable && imageField(1, t('Back', 'Bagside')), sitePanel());
      if (cur.cable) {
        // the plug at each end: the cable is suggested for a connection whose two ports have these connectors (either way round)
        const ends = (cur.ends && cur.ends.length === 2 ? cur.ends : P.cableEnds(cur) || ['rca', 'rca']).slice();
        const setEnds = () => { cur.ends = ends.slice(); cur.cable = [...new Set(ends)]; delete cur.endsAuto; };
        if (!P.cableEnds(cur)) setEnds(); // a new cable starts as RCA ↔ RCA
        // male/female and mono/stereo at each end (RCA, jack, XLR): worked out by the build until set here
        const pl = (P.cablePlugs(cur) || [{ g: 'm', ch: 2 }, { g: 'm', ch: 2 }]).map((x) => ({ g: x.g, ch: x.ch }));
        const plugSels = [];
        const setPlugs = () => { cur.eg = pl.map((x) => x.g); cur.ech = pl.map((x) => x.ch); delete cur.plugsAuto; };
        const plugSel = (i) => { const el = h('select.plug', { title: t('Male/female, mono/stereo', 'Han/hun, mono/stereo'), onchange(ev) { pl[i] = { ch: +ev.target.value[0], g: ev.target.value[1] }; setPlugs(); } },
          [['2m', 'Stereo · M'], ['1m', 'Mono · M'], ['2f', 'Stereo · F'], ['1f', 'Mono · F']].map(([v, l]) => h('option', { value: v, selected: v === pl[i].ch + pl[i].g }, l)));
          plugSels[i] = el; el.hidden = !P.AUDIO.has(ends[i]); return el; };
        const endSel = (i) => h('select.conn', { onchange(ev) { ends[i] = ev.target.value; setEnds(); if (plugSels[i]) plugSels[i].hidden = !P.AUDIO.has(ends[i]); } }, Object.entries(P.CONNECTORS).filter(([k]) => k !== 'wireless').map(([k, v]) => h('option', { value: k, selected: k === ends[i] }, v)));
        form.append(h('.lab', null, t('Connectors at each end (used to suggest this cable for matching ports)', 'Stik i hver ende (bruges til at foreslå kablet til matchende porte)')),
          h('.cable-ends', null, h('label.field', null, h('span', null, t('End A', 'Ende A')), endSel(0), plugSel(0)), h('span.arrow', null, '↔'), h('label.field', null, h('span', null, t('End B', 'Ende B')), endSel(1), plugSel(1))),
          cur.endsAuto || cur.plugsAuto ? h('small.muted', null, t('Worked out from the website (type, name, connector list). Change it here if it is wrong.', 'Udledt fra hjemmesiden (type, navn, stikliste). Ret det her, hvis det er forkert.')) : '');
      } else {
        drawCats();
        form.append(h('.lab', null, t('Categories', 'Kategorier')), catBox,
          h('.lab', null, t('Wireless (shown as badges on the card)', 'Trådløst (vises som mærker på kortet)')),
          h('.checks', null, h('label.check', null, h('input', { type: 'checkbox', checked: !!cur.bt, onchange(e) { cur.bt = e.target.checked; cur.manualWireless = true; preview(); } }), icon('bt', 14), 'Bluetooth'),
            h('label.check', null, h('input', { type: 'checkbox', checked: !!cur.wifi, onchange(e) { cur.wifi = e.target.checked; cur.manualWireless = true; preview(); } }), icon('wifi', 14), 'WiFi'),
            cur.manualWireless ? h('small.muted', null, t('Set by hand: the sync will not change it.', 'Sat manuelt: synkroniseringen ændrer det ikke.')) : h('small.muted', null, t('The sync switches these on when the website lists Bluetooth/WiFi.', 'Synkroniseringen slår dem til, når hjemmesiden angiver Bluetooth/WiFi.'))),
          h('.lab', null, t('Inputs & outputs', 'Ind- og udgange'), cur.img[1] || cur.img[0] ? h('button.btn.sm.lab-btn', { onclick: () => peekCur(cur.img[1] ? 1 : 0) }, icon('search', 13), cur.img[1] ? t('Show rear panel', 'Vis bagpanel') : t('Show image', 'Vis billede')) : '', h('small', null, t('Pick a standard signal; the label is generated so names stay consistent across products.', 'Vælg et standardsignal; navnet genereres, så navne er ens på tværs af produkter.'))),
          h('.io2', null, h('div', null, h('.sublab', null, t('Inputs (left side)', 'Indgange (venstre side)')), portList('in')), h('div', null, h('.sublab', null, t('Outputs (right side)', 'Udgange (højre side)')), portList('out'))),
          h('.lab', null, t('Card preview', 'Forhåndsvisning')), (prevBox = h('.ed-preview')));
        preview();
      }
      form.append(h('.ed-actions', null,
        h('button.btn.primary', { onclick: save }, icon('check', 14), t('Save', 'Gem')),
        !isNew && h('button.btn', { onclick: () => edit(Object.assign({}, cur, { name: cur.name + ' (copy)', sku: '' }), true) }, icon('copy', 14), t('Duplicate as new', 'Dublér som ny')),
        !isNew && h('button.btn.danger', { onclick: () => HP.confirm(t('Delete ' + cur.name + ' from the catalogue?', 'Slet ' + cur.name + ' fra kataloget?'), t('Delete', 'Slet'), () => { cat.removeProduct(cur.id); cur = null; drawList(); drawForm(); }) }, icon('trash', 14), t('Delete', 'Slet')),
        h('span.muted', null, t('Saved changes are drafts on this PC until you Publish.', 'Gemte ændringer er kladder på denne PC, indtil du udgiver.'))));
    }
    // hifiklubben.dk: gallery to pick front/back from, the connection specs, and suggested ports
    function sitePanel() {
      const d = cur.site && (window.HP_DATA.siteDetails || {})[cur.site];
      if (!cur.site) return '';
      if (!d) return h('.sitepanel', null, h('.muted', null, window.HP_DATA.siteDetails ? t('No product page read for ' + cur.site + ' yet. The hourly sync reads it soon.', 'Produktsiden for ' + cur.site + ' er ikke læst endnu. Den timelige synkronisering læser den snart.') : t('Loading website data…', 'Henter data fra hjemmesiden…')));
      const gal = (d.g || []).map((u) => { const hk = HP.site.hk(u), on = cur.img[0] === hk ? 'front' : cur.img[1] === hk ? 'back' : '';
        return h('.gal' + (on ? '.on' : ''), null, HP.imgEl(hk, 'thumb', { title: t('Click to enlarge', 'Klik for at forstørre'), onclick: () => E.peek((d.g || []).map((x, j) => ({ label: String(j + 1), src: HP.site.hk(x) })), (d.g || []).indexOf(u), cur.brand + ' ' + cur.name) }), h('.galbtns', null,
          h('button' + (on === 'front' ? '.on' : ''), { onclick: () => { imgSetters[0](hk); drawForm(); } }, t('Front', 'For')),
          !cur.cable && h('button' + (on === 'back' ? '.on' : ''), { onclick: () => { imgSetters[1](hk); drawForm(); } }, t('Back', 'Bag')))); });
      const specRows = Object.entries(d.spec || {}).map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)));
      const apply = () => {
        const sug = HP.site.suggestPorts(d.spec, cur.lcats || cur.cats);
        const go = () => { cur.in = sug.in; cur.out = sug.out; drawForm(); HP.toast(t('Suggested ports filled in. Check them against the rear panel, then Save.', 'Foreslåede porte er udfyldt. Tjek dem mod bagpanelet, og tryk Gem.')); };
        if ((cur.in || []).length || (cur.out || []).length) HP.confirm(t('Replace the current inputs/outputs with the suggestion?', 'Erstat de nuværende ind-/udgange med forslaget?'), t('Replace', 'Erstat'), go); else go();
      };
      return h('.sitepanel', null,
        h('.sp-head', null, icon('cloud', 14), h('b', null, t('From hifiklubben.dk', 'Fra hifiklubben.dk')), h('span.muted', null, ' · ' + cur.site + ' · ' + t('read ', 'læst ') + d.t + (d.avail ? ' · ' + d.avail : ''))),
        gal.length ? [h('.sublab', null, t('Gallery: pick the front and the back-panel image', 'Galleri: vælg forside- og bagpanelbillede')), h('.gallery', null, gal)] : h('.muted', null, t('No gallery images on the product page.', 'Ingen galleribilleder på produktsiden.')),
        !cur.cable && specRows.length ? [h('.sublab', null, t('Connections listed on the website', 'Tilslutninger angivet på hjemmesiden')), h('table.spec', null, specRows),
          h('button.btn.sm', { onclick: apply }, icon('bolt', 13), t('Use suggested ports', 'Brug foreslåede porte'))] : '');
    }
    function save() {
      cur.brand = cur.brand.trim(); cur.name = cur.name.trim();
      if (!cur.brand || !cur.name) return HP.toast(t('Brand and model name are required.', 'Brand og modelnavn skal udfyldes.'), { kind: 'err' });
      // every product needs a SKU (it ties the planner to HiFi Klubben's other systems); only stand-ins (generic devices) have none
      cur.sku = String(cur.sku || '').trim().toUpperCase();
      const standIn = (cur.cats || []).some((c) => /stand-in/i.test(c) || c === '/tilbehor/pladsholdere/');
      if (!cur.sku && !standIn) return HP.toast(t('A SKU is required: the item number on hifiklubben.dk. Products without one are discontinued.', 'SKU skal udfyldes: varenummeret på hifiklubben.dk. Produkter uden SKU er udgået.'), { kind: 'err' });
      if (isNew) { const base = P.slug(cur.brand + ' ' + cur.name); let id = base, i = 1; while (cat.get(id)) id = base + '-' + ++i; cur.id = id; }
      const out = Object.assign({}, cur, { img: cur.img.filter(Boolean), price: +cur.price || 0 });
      if (out._url && !out.url) out.url = out._url.replace(/^https?:\/\/www\.hifiklubben\.dk/, '');
      delete out._url; delete out._type; delete out.review; // saved by an admin = checked
      if (!(+out.was > out.price)) delete out.was; else out.was = +out.was;
      if (HP.NEXT && !out.cable) { const deep = HP.catDeepest(out.cats); out.cats = deep ? HP.catChain(deep) : []; }
      if (!out.cable) { ['in', 'out'].forEach((s) => { out[s] = P.uniqueKeys(out[s].map((x) => Object.assign({}, x, { key: x.key || P.slug(x.label) }))); }); if (!out.bt) delete out.bt; if (!out.wifi) delete out.wifi; } // keys are kept: saved drawings stay wired
      cat.putProduct(out); isNew = false; cur = JSON.parse(JSON.stringify(out)); drawModes(); drawList(); drawForm();
      HP.toast(t('Saved as draft. Publish to send it to all shops.', 'Gemt som kladde. Udgiv for at sende det til alle butikker.'), { kind: 'ok' });
    }
    HP.modal({ title: t('Product Editor', 'Produkt-editor'), size: 'xl', flush: true, onClose: E.closePeek,
      body: h('.editor', null, h('.ed-side', null, modes, h('.searchbox.pad', null, icon('search', 15), q),
        h('.row.pad', null, h('button.btn.sm', { onclick: () => edit(blankProduct(false), true) }, icon('plus', 13), t('New product', 'Nyt produkt')), h('button.btn.sm', { onclick: () => edit(blankProduct(true), true) }, icon('plus', 13), t('New cable', 'Nyt kabel'))), list), form) });
    // website data is admin-only and loaded on demand
    [['siteNew', 'data/site-new.js'], ['siteDetails', 'data/site-details.js']].forEach(([key, file]) => {
      if (window.HP_DATA[key]) return;
      const sc = document.createElement('script'); sc.src = file + '?t=' + Date.now();
      sc.onload = () => { drawModes(); if (mode === 'new') drawList(); if (cur) drawForm(); }; document.head.append(sc);
    });
    drawModes();
    if (startId && cat.get(startId)) edit(cat.get(startId)); else { drawList(); drawForm(); }
  };

  /* ================= Shortcuts ================= */
  E.saveShortcut = (existing) => {
    const snap = existing ? null : HP.canvas.capture();
    if (!existing && !snap) return HP.toast(t('Put some products on the canvas first.', 'Læg nogle produkter på lærredet først.'), { kind: 'warn' });
    const name = h('input', { value: existing ? existing.name : store.doc.name || '', placeholder: t('e.g. Stereo starter with turntable', 'fx Stereo-startpakke med pladespiller'), autofocus: true });
    const desc = h('input', { value: existing ? existing.desc || '' : '', placeholder: t('Short description (optional)', 'Kort beskrivelse (valgfri)') });
    const close = HP.modal({ title: existing ? t('Edit Shortcut', 'Redigér genvej') : t('Save as Shortcut', 'Gem som genvej'), size: 'sm',
      body: [h('label.field', null, h('span', null, t('Name', 'Navn')), name), h('label.field', null, h('span', null, t('Description', 'Beskrivelse')), desc),
        !existing && h('p.muted', null, (store.sel.size ? t('Uses the selected items: ', 'Bruger de markerede elementer: ') : t('Uses the whole canvas: ', 'Bruger hele lærredet: ')) + snap.items.length + ' ' + t('items', 'elementer') + ', ' + snap.conns.length + ' ' + t('connections', 'forbindelser') + '. ' + t('Card size, CI mode, mark size, scale and A4 layout are saved too; the floor plan image is not', 'Kortstørrelse, CI-tilstand, mærkestørrelse, målestok og A4-opsætning gemmes også; selve plantegningen gemmes ikke') + '.')],
      foot: [h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), h('button.btn.primary', { onclick: () => {
        if (!name.value.trim()) return name.focus();
        cat.putTemplate(Object.assign({}, existing || { id: 'sc-' + HP.uid() }, snap || {}, { name: name.value.trim(), desc: desc.value.trim() }));
        close(); HP.panels.showTab('shortcuts'); HP.toast(t('Shortcut saved as draft. Publish to share it with all shops.', 'Genvej gemt som kladde. Udgiv for at dele den med alle butikker.'), { kind: 'ok' });
      } }, t('Save', 'Gem'))] });
  };

  /* ================= data files ================= */
  const fileText = (key, arr) => '/* HiFi Planner ' + key + '. Edit through the app (Admin), not by hand. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.' + key + ' = ' + JSON.stringify(arr).replace(/\},\{"id"/g, '},\n{"id"') + ';\n';
  const parseFile = (text) => { const a = text.indexOf('['), b = text.lastIndexOf(']'); return JSON.parse(text.slice(a, b + 1)); };
  function merged(baseProducts, baseTemplates) {
    const d = cat.draft, prods = baseProducts.filter((p) => !d.delProducts.includes(p.id)).map((p) => d.products[p.id] || p);
    Object.values(d.products).forEach((p) => { if (!prods.some((x) => x.id === p.id)) prods.unshift(p); });
    const tpls = baseTemplates.filter((x) => !d.delTemplates.includes(x.id)).map((x) => d.templates[x.id] || x);
    Object.values(d.templates).forEach((x) => { if (!tpls.some((y) => y.id === x.id)) tpls.push(x); });
    return { prods: prods.map(cat.clean), tpls };
  }
  E.exportData = () => {
    const m = merged(DATA.products || [], DATA.templates || []);
    HP.download('products.js', fileText('products', m.prods), 'text/javascript'); HP.download('templates.js', fileText('templates', m.tpls), 'text/javascript');
    HP.toast(t('Downloaded products.js and templates.js. Upload them to the data folder in the repository.', 'Hentede products.js og templates.js. Upload dem til data-mappen i repository’et.'), { ms: 8000 });
  };

  /* ================= GitHub ================= */
  const cfg = () => Object.assign({ branch: 'main', path: '' }, HP.config.github, LS.get('gh', {}), { token: LS.get('ghToken', '') });
  const api = (c, path, opts) => fetch('https://api.github.com/repos/' + c.owner + '/' + c.repo + path, Object.assign({}, opts, { headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'X-GitHub-Api-Version': '2022-11-28' }, opts && opts.headers) }));
  const full = (c, p) => (c.path ? c.path + '/' : '') + p;
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  async function getFile(c, p) {
    const r = await api(c, '/contents/' + full(c, p) + '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now());
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + p);
    const j = await r.json();
    let text;
    if (j.content) text = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, '')), (ch) => ch.charCodeAt(0)));
    else { const raw = await api(c, '/contents/' + full(c, p) + '?ref=' + encodeURIComponent(c.branch), { headers: { Accept: 'application/vnd.github.raw+json' } }); text = await raw.text(); }
    return { sha: j.sha, text };
  }
  async function putFile(c, p, contentB64, sha, message) {
    const r = await api(c, '/contents/' + full(c, p), { method: 'PUT', body: JSON.stringify({ message, content: contentB64, branch: c.branch, sha: sha || undefined }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(r.status === 409 || r.status === 422 ? t('The data changed on GitHub while publishing. Try again.', 'Data blev ændret på GitHub under udgivelsen. Prøv igen.') : 'GitHub ' + r.status + ': ' + (j.message || p)); }
  }
  const shrink = (src, max) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/webp', 0.8).split(',')[1]); }; im.onerror = bad; im.src = src; });
  E.testGitHub = async () => {
    const c = cfg();
    if (!c.owner || !c.repo || !c.token) return t('Fill in owner, repository and token.', 'Udfyld owner, repository og token.');
    try {
      const r = await api(c, '');
      if (r.status === 401) return t('GitHub rejected the token.', 'GitHub afviste tokenet.');
      if (r.status === 404) return t('Repository not found, or the token cannot see it.', 'Repository ikke fundet, eller tokenet kan ikke se det.');
      const j = await r.json();
      if (!(j.permissions && j.permissions.push)) return t('Connected, but the token cannot write. It needs "Contents: Read and write".', 'Forbundet, men tokenet kan ikke skrive. Det kræver "Contents: Read and write".');
      const f = await getFile(c, 'data/products.js');
      return f ? t('Connected. Ready to publish.', 'Forbundet. Klar til at udgive.') : t('Connected, but data/products.js was not found in that folder. Check "Folder in repo".', 'Forbundet, men data/products.js blev ikke fundet i mappen. Tjek "Mappe i repo".');
    } catch (e) { return t('Could not reach GitHub: ', 'Kunne ikke nå GitHub: ') + e.message; }
  };
  E.runPriceSync = async () => {
    const c = cfg();
    if (!c.token) return t('Add a GitHub token first.', 'Tilføj et GitHub-token først.');
    try {
      const r = await api(c, '/actions/workflows/price-sync.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: c.branch }) });
      if (r.status === 204) return t('Started. New prices are live in a few minutes; the result is under Actions on GitHub.', 'Startet. Nye priser er live om få minutter; resultatet ses under Actions på GitHub.');
      if (r.status === 404) return t('GitHub could not find the Catalogue sync workflow. Add .github/workflows/price-sync.yml to the repository first.', 'GitHub kunne ikke finde Catalogue sync-workflowet. Tilføj .github/workflows/price-sync.yml til repository’et først.');
      if (r.status === 403) return t('The token may not start workflows. Give it "Actions: Read and write".', 'Tokenet må ikke starte workflows. Giv det "Actions: Read and write".');
      return 'GitHub ' + r.status;
    } catch (e) { return t('Could not reach GitHub: ', 'Kunne ikke nå GitHub: ') + e.message; }
  };
  // the new catalogue: edits go to data/own.js (the master), and into build/app-products.js too, so shops see them at once.
  // The hourly build regenerates build/app-products.js from data/own.js and the website mirror.
  async function publishOwn(c, status, close) {
    const d = cat.draft;
    const [of, af, tf] = await Promise.all([getFile(c, 'data/own.js'), getFile(c, 'build/app-products.js'), getFile(c, 'data/templates.js')]);
    if (!of || !af) throw new Error(t('data/own.js or build/app-products.js is missing on GitHub', 'data/own.js eller build/app-products.js mangler på GitHub'));
    const own = parseFile(of.text), app = parseFile(af.text), byId = new Map(own.map((o) => [o.id, o]));
    const dels = new Set(d.delProducts), edits = Object.values(d.products).map(cat.clean);
    const ownOut = own.filter((o) => !dels.has(o.id)).map((o) => (d.products[o.id] ? HP.toOwn(cat.clean(d.products[o.id]), o) : o));
    edits.forEach((p) => { if (!byId.has(p.id)) ownOut.unshift(HP.toOwn(p, null)); });
    // an edited product takes the Editor's fields, but its price, discount, variants and SKU stay as in the newest catalogue on
    // GitHub when the website owns them (live): a draft may be days old, and Publish must never bring an old price back
    const WEB = ['price', 'was', 'vars', 'lens', 'url', 'sku', 'gone', 'goneWhy', 'live'];
    const sameSite = (a, b) => !a.site || String(a.site).toUpperCase() === String(b.site || '').toUpperCase();
    const appOut = app.filter((p) => !dels.has(p.id)).map((p) => {
      if (!d.products[p.id]) return p;
      const o = Object.assign(cat.clean(d.products[p.id]), { wc: p.wc });
      if (p.live && sameSite(o, p)) WEB.forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; else delete o[k]; });
      return o;
    });
    edits.forEach((p) => { if (!app.some((x) => x.id === p.id)) appOut.unshift(p); });
    const enc = (s) => b64(new TextEncoder().encode(s)), who = 'HiFi Planner (shop ' + HP.shop() + ')';
    const lines = (arr) => '[\n' + arr.map((x) => JSON.stringify(x)).join(',\n') + '\n]';
    const head = (key, a) => a.text.slice(0, a.text.indexOf('window.HP_DATA.' + key));
    if (Object.keys(d.products).length || dels.size) {
      status.textContent = t('Writing catalogue…', 'Skriver katalog…');
      await putFile(c, 'data/own.js', enc(head('own', of) + 'window.HP_DATA.own = ' + lines(ownOut) + ';\n'), of.sha, 'Catalogue update via ' + who);
      await putFile(c, 'build/app-products.js', enc(head('products', af) + 'window.HP_DATA.products = ' + lines(appOut) + ';\n'), af.sha, 'Catalogue update via ' + who + ' (until the next build)');
    }
    if ((d.ignore || []).length) {
      const xf = await getFile(c, 'data/site-ignore.js'), cur0 = xf ? parseFile(xf.text) : [];
      await putFile(c, 'data/site-ignore.js', enc('/* Website SKUs the catalogue sync must not add. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.siteIgnore = ' + JSON.stringify([...new Set(cur0.concat(d.ignore))]) + ';\n'), xf && xf.sha, 'Ignore list via ' + who);
    }
    const m = merged([], tf ? parseFile(tf.text) : DATA.templates || []);
    if (Object.keys(d.templates).length || d.delTemplates.length || !tf) await putFile(c, 'data/templates.js', enc(fileText('templates', m.tpls)), tf && tf.sha, 'Shortcuts update via ' + who);
    DATA.products = appOut; DATA.own = ownOut; DATA.templates = m.tpls; cat.clearDraft(); close();
    HP.toast(t('Published. Shops get the update a few minutes from now when they reload.', 'Udgivet. Butikkerne får opdateringen om få minutter, når de genindlæser.'), { kind: 'ok', ms: 8000 });
  }

  E.publish = () => {
    if (window.HP_NEXT) return HP.toast(t('This is the test page for the new catalogue: publishing is switched off here. Drafts made here stay on this page.', 'Dette er testsiden for det nye katalog: udgivelse er slået fra her. Kladder lavet her bliver på denne side.'), { kind: 'warn', ms: 7000 });
    const c = cfg(), d = cat.draft;
    if (!c.token) { HP.toast(t('Add a GitHub token under Settings → Admin to publish.', 'Tilføj et GitHub-token under Indstillinger → Admin for at udgive.'), { kind: 'warn' }); return HP.panels.settings(); }
    const names = (ids, src) => ids.map((id) => { const x = src(id); return x ? (x.brand ? x.brand + ' ' : '') + x.name : id; });
    const lines = [
      ...names(Object.keys(d.products), (id) => d.products[id]).map((n) => h('li', null, t('Add/update: ', 'Tilføj/opdatér: ') + n)),
      ...names(d.delProducts, (id) => (DATA.products || []).find((p) => p.id === id)).map((n) => h('li', null, t('Delete: ', 'Slet: ') + n)),
      ...names(Object.keys(d.templates), (id) => d.templates[id]).map((n) => h('li', null, t('Shortcut: ', 'Genvej: ') + n)),
      ...names(d.delTemplates, (id) => (DATA.templates || []).find((x) => x.id === id)).map((n) => h('li', null, t('Delete Shortcut: ', 'Slet genvej: ') + n)),
      ...(d.ignore || []).map((sku) => h('li', null, t('Do not re-add from website: ', 'Tilføj ikke igen fra hjemmesiden: ') + sku))];
    const status = h('.muted');
    const go = h('button.btn.primary', { onclick: run }, icon('cloud', 14), t('Publish to all shops', 'Udgiv til alle butikker'));
    const close = HP.modal({ title: t('Publish changes', 'Udgiv ændringer'), size: 'sm', body: [h('p', null, t('This commits to ', 'Dette committer til ') + c.owner + '/' + c.repo + ' (' + c.branch + (c.path ? ', /' + c.path : '') + '):'), h('ul.changes', null, lines), status],
      foot: [h('button.btn', { onclick: () => HP.confirm(t('Throw away all unpublished changes on this PC?', 'Kassér alle ikke-udgivne ændringer på denne PC?'), t('Discard', 'Kassér'), () => { cat.clearDraft(); close(); }) }, t('Discard drafts', 'Kassér kladder')), h('.spacer'), h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), go] });
    async function run() {
      go.disabled = true;
      try {
        status.textContent = t('Reading current data from GitHub…', 'Læser nuværende data fra GitHub…');
        const [pf, tf] = await Promise.all([getFile(c, 'data/products.js'), getFile(c, 'data/templates.js')]);
        const stamp = Date.now().toString(36);
        for (const p of Object.values(d.products)) for (let i = 0; i < (p.img || []).length; i++) {
          const m = /^data:image\/(\w+);base64,(.+)$/.exec(p.img[i]); if (!m) continue;
          const name = p.id + '-' + (i ? 'back' : 'front') + '-' + stamp + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
          status.textContent = t('Uploading image ', 'Uploader billede ') + name;
          await putFile(c, 'img/hd/' + name, m[2], null, 'Add image for ' + p.name);
          await putFile(c, 'img/' + name, await shrink(p.img[i], 640), null, 'Add image for ' + p.name); p.img[i] = 'img/' + name;
        }
        LS.set(HP.DRAFT_KEY, d);
        if (DATA.categories) return await publishOwn(c, status, close);
        const m = merged(pf ? parseFile(pf.text) : DATA.products || [], tf ? parseFile(tf.text) : DATA.templates || []);
        const enc = (s) => b64(new TextEncoder().encode(s)), who = 'HiFi Planner (shop ' + HP.shop() + ')';
        status.textContent = t('Writing catalogue…', 'Skriver katalog…');
        if (Object.keys(d.products).length || d.delProducts.length || !pf) await putFile(c, 'data/products.js', enc(fileText('products', m.prods)), pf && pf.sha, 'Catalogue update via ' + who);
        if ((d.ignore || []).length) {
          const xf = await getFile(c, 'data/site-ignore.js'), cur0 = xf ? parseFile(xf.text) : [];
          await putFile(c, 'data/site-ignore.js', enc('/* Website SKUs the catalogue sync must not add. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.siteIgnore = ' + JSON.stringify([...new Set(cur0.concat(d.ignore))]) + ';\n'), xf && xf.sha, 'Ignore list via ' + who);
        }
        if (Object.keys(d.templates).length || d.delTemplates.length || !tf) await putFile(c, 'data/templates.js', enc(fileText('templates', m.tpls)), tf && tf.sha, 'Shortcuts update via ' + who);
        DATA.products = m.prods; DATA.templates = m.tpls; cat.clearDraft(); close();
        HP.toast(t('Published. Shops get the update a few minutes from now when they reload.', 'Udgivet. Butikkerne får opdateringen om få minutter, når de genindlæser.'), { kind: 'ok', ms: 8000 });
      } catch (e) { status.textContent = ''; go.disabled = false; HP.toast(t('Publish failed: ', 'Udgivelse fejlede: ') + e.message, { kind: 'err', ms: 9000 }); }
    }
  };
})();
