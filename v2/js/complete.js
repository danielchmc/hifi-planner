/* HiFi Planner v2 — "Related products" (Relaterede produkter): the cables and accessories a proposal is still missing.
   1. Every connection without a cable gets a suggested cable that fits both plugs, with a length: a cable the website lists as an
      accessory of one of the two products first, then the cable last used for the same pair of plugs, then the cheapest. The seller
      can pick another cable or length per row. Ticked by default.
   2. Accessories: the website's own accessories of the products on the canvas (`acc`, from tools/catalog-build.js), without cables
      (those are chosen per connection) and without what is already on the canvas. Not ticked: they are chosen with the customer.
   "Add" puts the cables on their connections and the accessories on the canvas, as one step for Undo. */
(function () {
  const HP = window.HP, { h, t, store, LS, catalog: cat } = HP;
  const P = HP.ports, C = () => HP.canvas, icon = (n, s) => HP.icon(n, s);

  const isPerMetre = (p) => (p.cable || []).includes('speaker') && ((p.fx || {}).perMetre || /(^|[^0-9.,])1 ?m$|slip/i.test(p.name.trim()));
  const lenIn = (s) => { const m = /(\d+(?:[.,]\d+)?)\s?m$/i.exec(String(s || '').trim()); return m ? parseFloat(m[1].replace(',', '.')) : 0; };
  const fmtM = (m) => String(m).replace('.', ',') + ' m';
  const plugKey = (a, b) => [P.conn(a.conn, a), P.conn(b.conn, b)].sort().join('|');

  // the cables that fit a connection, one group per website cable, each with its lengths (as in the cable picker)
  function groups(c) {
    const info = C().connInfo(c); if (!info || !info.a || !info.b) return [];
    const fits = cat.cables().filter((p) => !p.gone && P.cableFit(p, info.a, info.b) === 2);
    const g = new Map();
    fits.forEach((p) => { const k = p.site ? 'S' + String(p.site).toUpperCase() : 'I' + p.id; (g.get(k) || g.set(k, []).get(k)).push(p); });
    return [...g.values()].map((members) => {
      const rep = members.find((p) => !p.web) || members[0], name = C().stripLen(rep.name) || rep.name;
      if (isPerMetre(rep)) return { key: rep.id, rep, members, name, metre: true, min: rep.price || 0 };
      const lens = (members.find((p) => p.lens) || {}).lens || [];
      let opts = lens.map((l) => ({ m: l.m, label: l.label, price: l.price, id: l.id || rep.id, lv: l.id ? null : l.sku }));
      members.forEach((p) => { const m = lenIn(p.name); if ((m || !opts.length) && !(m && opts.some((o) => o.m === m)) && !opts.some((o) => o.id === p.id && !o.lv)) opts.push({ m, label: m ? fmtM(m) : '', price: p.price || 0, id: p.id, lv: null }); });
      opts = opts.filter((o) => o.price > 0 || opts.length === 1).sort((x, y) => x.m - y.m || x.price - y.price);
      return { key: rep.id, rep, members, name, opts, min: Math.min(...opts.map((o) => o.price || Infinity)) };
    }).filter((G) => G.metre || G.opts.length);
  }
  // the suggestion for one connection: recommended by the website, else the last one used for these plugs, else the cheapest
  function suggest(c, gs) {
    const ia = store.item(c.a.item), ib = store.item(c.b.item), pa = ia && cat.get(ia.pid), pb = ib && cat.get(ib.pid);
    const rec = new Set([...((pa && pa.acc) || []), ...((pb && pb.acc) || [])]);
    const info = C().connInfo(c), last = (LS.get('cableFor', {}) || {})[plugKey(info.a, info.b)];
    const iss = (G) => (P.plugIssues(G.rep, info.a, info.b).length ? 10 : 0); // plugs that fit (male/female, mono/stereo) come first
    const rank = (G) => iss(G) + (G.members.some((p) => rec.has(p.id)) ? 0 : 2) - (G.key === last ? 1 : 0);
    return gs.slice().sort((x, y) => rank(x) - rank(y) || x.min - y.min)[0] || null;
  }
  // default length: speaker cable by the metre 3 m; otherwise the shortest of at least 1 m
  const defaultOpt = (G) => G.metre ? null : (G.opts.find((o) => o.m >= 1) || G.opts[0]);

  // the connections that still have no cable (and could have one)
  // Speaker wires between the same two cards (an amplifier's SPEAKER OUT L and R to one speaker-pair card) need one cable choice,
  // not one each: some speaker cables are sold as a pair, some as one, so the seller picks once. When one of them has a cable,
  // or is already asked about, the others are left out.
  const missing = () => {
    const ok = (c) => store.item(c.a.item) && store.item(c.b.item) && !store.item(c.a.item).hid && !store.item(c.b.item).hid; // hidden cards (Oversigt) left out
    const conns = (store.doc.conns || []).filter(ok), done = new Set(), out = [];
    const spk = (c) => { const i = C().connInfo(c); return !!(i.a && i.a.sig === 'speaker'); };
    const pair = (c) => [c.a.item, c.b.item].sort().join('|');
    conns.forEach((c) => { if (c.cable && spk(c)) done.add(pair(c)); });
    conns.forEach((c) => { if (c.cable) return; if (spk(c)) { const k = pair(c); if (done.has(k)) return; done.add(k); } out.push(c); });
    return out;
  };
  // a cable is suggested per connection, not as an accessory; adapters are both (Essentials Wireless Connect, Sonos Line-In Adapter),
  // and so is anything tools/overrides.js marks with facets { accessory: true }. Y-splitters stay cables.
  const isAdapter = (a) => { const s = (a.ty || '') + ' ' + a.name; return /adapter|wireless connect/i.test(s) && !/y-split/i.test(s); };
  const offerable = (a) => !(a.cable || []).length || isAdapter(a) || !!(a.fx && a.fx.accessory);
  const accFor = (onCanvas) => {
    const seen = new Set(onCanvas), out = [];
    onCanvas.forEach((pid) => { const p = cat.get(pid); ((p && p.acc) || []).forEach((id) => { const a = cat.get(id); if (!a || a.gone || !offerable(a) || seen.has(id)) return; seen.add(id); out.push({ for: p, p: a }); }); });
    return out;
  };

  function open(opt) {
    HP.stat('Relaterede produkter åbnet', { fra: opt && opt.pid ? 'kort' : 'tilbud' });
    const only = opt && opt.pid;
    const pids = [...new Set(store.doc.items.filter((i) => i.kind === 'product').map((i) => i.pid))];
    const conns = only ? missing().filter((c) => [c.a.item, c.b.item].some((id) => (store.item(id) || {}).pid === only)) : missing();
    const rows = conns.map((c) => { const gs = groups(c), G = suggest(c, gs); return { c, gs, G, o: G && defaultOpt(G), m: 3, on: !!G }; });
    const accs = accFor(only ? [only] : pids).map((x) => Object.assign(x, { on: false }));
    const body = h('.cmp');
    const total = h('b.cmp-total');
    const addBtn = h('button.btn.primary', { onclick: apply }, icon('plus', 14), t('Add to the proposal', 'Tilføj til tilbuddet'));
    const priceOf = (r) => !r.G ? 0 : r.G.metre ? Math.ceil(r.m) * (r.G.rep.price || 0) : (r.o ? r.o.price : 0);
    const sum = () => {
      const s = rows.filter((r) => r.on && r.G).reduce((a, r) => a + priceOf(r), 0) + accs.filter((x) => x.on).reduce((a, x) => a + (x.p.price || 0), 0);
      const n = rows.filter((r) => r.on && r.G).length + accs.filter((x) => x.on).length;
      total.textContent = n ? n + ' ' + t('lines', 'linjer') + ' · ' + HP.money(s) : t('Nothing chosen', 'Intet valgt');
      addBtn.disabled = !n;
    };
    const tick = (on, fn) => h('label.cmp-tick', null, h('input', { type: 'checkbox', checked: on, onchange: (e) => { fn(e.target.checked); sum(); } }), h('span.box'));

    // 1. cables
    if (rows.length) {
      body.append(h('.cmp-sec', null, h('h3', null, t('Connections without a cable', 'Forbindelser uden kabel'), h('span.n', null, rows.length)),
        h('p.muted', null, t('Suggested: a cable hifiklubben.dk recommends for one of the products, else the last one you used for these plugs, else the cheapest that fits.', 'Forslag: et kabel hifiklubben.dk anbefaler til et af produkterne, ellers det du sidst brugte til de stik, ellers det billigste, der passer.'))));
      rows.forEach((r) => {
        const info = C().connInfo(r.c), ia = store.item(r.c.a.item), ib = store.item(r.c.b.item), pa = cat.get(ia.pid), pb = cat.get(ib.pid);
        const what = h('.cmp-conn', null, h('span', null, pa.name + ' ', h('em', null, info.a.label)), h('span.arr', null, '→'), h('span', null, pb.name + ' ', h('em', null, info.b.label)));
        const price = h('span.cmp-price'), warn = h('.cmp-warn');
        const drawWarn = () => { warn.textContent = ''; const is = r.G ? P.plugIssues(r.G.rep, info.a, info.b) : []; if (is.length) warn.append(icon('warn', 12), is.map((x) => t(x.en, x.da)).join(' · ')); };
        const lenBox = h('span.cmp-len');
        const drawLen = () => {
          lenBox.textContent = '';
          if (!r.G) return;
          if (r.G.metre) lenBox.append(h('input', { type: 'number', min: 1, step: 1, value: r.m, oninput: (e) => { r.m = Math.max(1, Math.round(+e.target.value || 1)); price.textContent = HP.money(priceOf(r)); sum(); } }), h('span.muted', null, ' m'));
          else if (r.G.opts.length > 1) lenBox.append(h('select', { onchange: (e) => { r.o = r.G.opts[+e.target.value]; price.textContent = HP.money(priceOf(r)); sum(); } },
            r.G.opts.map((o, i) => h('option', { value: i, selected: o === r.o }, (o.label || '—') + ' · ' + HP.money(o.price)))));
          else lenBox.append(h('span.muted', null, (r.o && r.o.label) || ''));
          price.textContent = HP.money(priceOf(r));
        };
        const rec = (G) => { const ia2 = cat.get(ia.pid), ib2 = cat.get(ib.pid); return G.members.some((p) => ((ia2.acc || []).concat(ib2.acc || [])).includes(p.id)); };
        const cableSel = r.gs.length ? h('select.cmp-cable', { onchange: (e) => { r.G = r.gs.find((G) => G.key === e.target.value); r.o = defaultOpt(r.G); drawLen(); drawWarn(); sum(); } },
          r.gs.slice().sort((x, y) => (rec(y) - rec(x)) || x.min - y.min).map((G) => h('option', { value: G.key, selected: G === r.G }, G.rep.brand + ' ' + G.name + (rec(G) ? ' ★' : '') + ' · ' + (G.metre ? HP.money(G.rep.price) + '/m' : t('from ', 'fra ') + HP.money(G.min)))))
          : h('span.muted', null, t('No cable in the catalogue fits these plugs', 'Intet kabel i kataloget passer til disse stik'));
        drawLen(); drawWarn();
        body.append(h('.cmp-row' + (r.G ? '' : '.none'), null, r.G ? tick(r.on, (v) => { r.on = v; }) : h('span.cmp-tick'), what, cableSel, lenBox, price, warn));
      });
    }
    // 2. accessories, per product
    if (accs.length) {
      body.append(h('.cmp-sec', null, h('h3', null, t('Accessories', 'Tilbehør'), h('span.n', null, accs.length)),
        h('p.muted', null, t('What hifiklubben.dk sells with these products. Tick what the customer wants.', 'Det hifiklubben.dk sælger til disse produkter. Sæt flueben ved det, kunden vil have.'))));
      const byFor = new Map(); accs.forEach((x) => (byFor.get(x.for) || byFor.set(x.for, []).get(x.for)).push(x));
      byFor.forEach((list, p) => {
        body.append(h('.cmp-for', null, t('For ', 'Til ') + p.brand + ' ' + p.name));
        body.append(h('.cmp-accs', null, list.map((x) => h('label.cmp-acc', null,
          h('input', { type: 'checkbox', onchange: (e) => { x.on = e.target.checked; sum(); } }), h('span.box'),
          h('.th', null, x.p.img && x.p.img[0] ? HP.imgEl(x.p.img[0], 'thumb', { loading: 'lazy' }) : null),
          h('span.nm', null, h('small', null, x.p.brand), x.p.name), h('span.pr', null, HP.money(x.p.price || 0))))));
      });
    }
    if (!rows.length && !accs.length) body.append(h('.empty', null, only ? t('Nothing to add for this product.', 'Intet at tilføje til dette produkt.') : t('Every connection has a cable, and there are no accessories to suggest.', 'Alle forbindelser har kabel, og der er intet tilbehør at foreslå.')));
    sum();
    const close = HP.modal({ title: only ? t('Related products · ', 'Relaterede produkter · ') + cat.get(only).name : t('Related products', 'Relaterede produkter'), size: 'lg', body, foot: [total, h('.spacer'), h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), addBtn] });

    function apply() {
      const memo = LS.get('cableFor', {}) || {};
      let nc = 0;
      rows.forEach((r) => {
        if (!r.on || !r.G) return;
        const c = r.c; delete c.lv; delete c.m;
        if (r.G.metre) { c.cable = r.G.rep.id; c.m = r.m; } else { c.cable = r.o.id; if (r.o.lv) c.lv = r.o.lv; }
        const info = C().connInfo(c); memo[plugKey(info.a, info.b)] = r.G.key; nc++;
      });
      LS.set('cableFor', memo);
      const add = accs.filter((x) => x.on).map((x) => ({ id: x.p.id }));
      HP.stat('Relaterede produkter tilføjet', { kabler: nc, tilbehor: add.length });
      if (add.length) C().addProducts(add); else store.commit();
      close();
      HP.toast([nc ? nc + ' ' + t(nc === 1 ? 'cable' : 'cables', nc === 1 ? 'kabel' : 'kabler') : '', add.length ? add.length + ' ' + t('accessories', 'tilbehør') : ''].filter(Boolean).join(' + ') + t(' added', ' tilføjet'), { kind: 'ok' });
    }
  }

  // for the customer view: the accessories of the products in the proposal, without the clutter of near-identical choices.
  //  - one of each website type per product (one stand for the M6C, one wall bracket for the Pulse Flex, one stylus…);
  //  - generic types (plugs, feet, mains filters…) once for the whole proposal, and not at all if the proposal already has one;
  //  - types whose products do different jobs (adapters, "other") keep them all.
  // Of several, the one most products on the website list as an accessory (the usual choice) wins, then the cheapest.
  const KEEP_ALL = /^(adapter|andet|licens|møbeltilbehør|pladespillertilbehør|højtalertilbehør|trådløs adapter)$/i;
  const GENERIC = /^(bananstik|spadestik|dæmpningsfødder|strømfilter|kabel|kabelskjuler|rengøring.*|pladerens.*)$/i;
  let pop = null;
  const popularity = (id) => {
    if (!pop) { pop = new Map(); cat.list.forEach((p) => (p.acc || []).forEach((a) => pop.set(a, (pop.get(a) || 0) + 1))); }
    return pop.get(id) || 0;
  };
  const related = () => {
    const pids = [...new Set(store.doc.items.filter((i) => i.kind === 'product').map((i) => i.pid))];
    const have = new Set(pids.map((id) => (cat.get(id) || {}).ty).filter((ty) => ty && GENERIC.test(ty)));
    const best = new Map(), out = [];
    const better = (x, cur) => popularity(x.p.id) > popularity(cur.p.id) || (popularity(x.p.id) === popularity(cur.p.id) && (x.p.price || 0) < (cur.p.price || 0));
    accFor(pids).forEach((x) => {
      const ty = x.p.ty;
      if (!ty || KEEP_ALL.test(ty)) return out.push(x);
      if (have.has(ty)) return;
      const key = GENERIC.test(ty) ? ty : x.for.id + '|' + ty, cur = best.get(key);
      if (!cur) { out.push(x); best.set(key, x); } else if (better(x, cur)) { out[out.indexOf(cur)] = x; best.set(key, x); }
    });
    return out;
  };
  HP.complete = { open, missing: () => missing().length, related };
})();
