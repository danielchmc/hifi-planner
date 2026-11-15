/* HiFi Planner v2 — core: storage, i18n, DOM helpers, icons, document store (undo/redo), catalogue. */
(function () {
  const HP = (window.HP = window.HP || {});
  const DATA = (window.HP_DATA = window.HP_DATA || {});
  HP.config = Object.assign({ shops: [], adminCode: 'hifi-admin', github: {}, supportPhone: '', feedbackUrl: '' }, DATA.config || {});

  /* ---------- storage ---------- */
  const LS = (HP.LS = {
    get(k, d) { try { const v = localStorage.getItem('hp2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hp2.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('hp2.' + k); } catch (e) { /* ignore */ } },
  });

  /* ---------- events ---------- */
  const listeners = {};
  HP.on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
  HP.emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));

  /* ---------- i18n: t('English', 'Dansk') ---------- */
  let lang = LS.get('lang', /^da/i.test(navigator.language || '') ? 'da' : 'en');
  HP.t = (en, da) => (lang === 'da' && da != null ? da : en);
  HP.lang = () => lang;
  HP.setLang = (l) => { lang = l; LS.set('lang', l); document.documentElement.lang = l; HP.emit('lang'); };
  HP.money = (n) => Math.round(n).toLocaleString('da-DK') + ',-';
  HP.today = () => { const d = new Date(); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

  /* ---------- DOM ---------- */
  const h = (HP.h = function (tag, props, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
    const el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach((s) => (s[0] === '#' ? (el.id = s.slice(1)) : el.classList.add(s.slice(1))));
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'data') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => { if (Array.isArray(c)) c.forEach(add); else if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); };
    kids.forEach(add);
    return el;
  });
  HP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  HP.uid = () => Math.random().toString(36).slice(2, 9);
  HP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  HP.snap = (v) => Math.round(v / 10) * 10;

  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a5 5 0 0 1 5 5v1"/>',
    redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a5 5 0 0 0-5 5v1"/>',
    text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 8.5h.01"/>',
    print: '<path d="M7 8V3h10v5M7 17H4V9h16v8h-3"/><path d="M7 14h10v7H7z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    moon: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
    plan: '<path d="M3 3h18v18H3z"/><path d="M3 10h7V3M10 14v7M14 21v-6h7"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
    flip: '<path d="M12 3v18M8 7H4v10h4M16 7h4v10h-4"/>', copy: '<path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/>',
    bt: '<path d="M7 7l10 10-5 5V2l5 5L7 17"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    folder: '<path d="M3 6h7l2 2h9v12H3z"/>', bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>', fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    page: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>', rotate: '<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 20v-5h5"/>',
    cable: '<path d="M4 8V4M8 8V4M3 8h6v3a3 3 0 0 1-6 0zM6 14v2a4 4 0 0 0 8 0v-4a4 4 0 0 1 6 -3"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', check: '<path d="M4 12l5 5L20 6"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>', upload: '<path d="M12 16V4M7 8l5-5 5 5M4 21h16"/>',
    lock: '<path d="M6 11h12v10H6z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>', move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10a4 4 0 0 1 0 8z"/><path d="M12 16v-5M9.5 13l2.5-2.5 2.5 2.5"/>',
    up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', play: '<path d="M7 4l13 8-13 8z"/>', layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  };
  HP.icon = (name, size) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); if (size) { s.style.width = s.style.height = size + 'px'; }
    s.innerHTML = ICONS[name] || '';
    return s;
  };
  HP.KLUBBEN_PATH = 'M0 0v32.6h52.2V0zm41.3 9.7c.8 0 1.5.7 1.5 1.5v.1c0 .8-.7 1.5-1.5 1.4-.8 0-1.5-.7-1.5-1.5.1-.8.7-1.5 1.5-1.5m-16 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.6-1.5 1.5-1.5m-4 2.1h-1.5v9h1.5v1.9H16v-1.9h1.5v-3.5h-5.4v3.5h1.5v1.9H8.3v-1.9h1.5v-9H8.3V9.9h5.3v1.9h-1.5v3.5h5.4v-3.5H16V9.9h5.3zm6.4 10.9h-4.9v-1.9h1.3V16h-1.3v-2h3.6v6.8h1.3zm10.6-9.3h-2.2v-1.6h-3.3v3.5h4v1.9h-4v3.5h1.7v1.9h-5.4v-1.9h1.3v-9H29V9.9h9.3zm5.5 9.3h-4.9v-1.9h1.3V16h-1.3v-2h3.6v6.8h1.3zm25.1-1.9h1.2v1.9H65v-1.9h1.2l-2.6-4-1.5 1.4v2.6h1.5v1.9h-5.3v-1.9h1.5v-9h-1.5V9.9h5.3v1.9h-1.5v4l4.1-4H65V9.9h5.1v1.9h-1.3l-3.6 3.4zm5.9 0H76v1.9h-4.6v-1.9h1.2v-9h-1.2V9.9h3.4zm10.6 0h1.3v1.9h-3.2v-.8c-.8.7-1.8 1-2.8 1-1.8 0-3.1-1-3.1-3.3v-3.7h-1.2V14h3.4v5.4c0 1.1.6 1.5 1.4 1.5.7 0 1.3-.3 1.8-.8V16h-1v-2h3.4zm4.9 1.1v.8h-2.2V11.8H87V9.9h3.4v4.9c.7-.6 1.6-.9 2.5-.9 2 0 3.6 1.7 3.6 4.3 0 2.9-1.6 4.6-3.8 4.6-.8.1-1.7-.3-2.4-.9m4-3.5c0-1.5-.7-2.6-2-2.6s-2 1.1-2 2.5.7 2.6 2.1 2.6 1.9-1 1.9-2.5m5.8 3.5v.8H98V11.8h-1.1V9.9h3.4v4.9c.7-.6 1.6-.9 2.5-.9 2 0 3.6 1.7 3.6 4.3 0 2.9-1.6 4.6-3.8 4.6-1 .1-1.9-.2-2.5-.9m3.9-3.5c0-1.5-.7-2.6-1.9-2.6s-2 1.1-2 2.5.8 2.6 2.1 2.6 1.8-1 1.8-2.5m11.5 0v.6h-5.8c-.1 1 .7 1.9 1.8 2h.2c.7.1 1.4-.3 1.7-.8h2c-.4 1.7-2 2.8-3.7 2.8-2.7 0-4.2-1.7-4.2-4.5s1.6-4.5 4.1-4.5 3.9 1.5 3.9 4.4m-2.3-1c0-.9-.7-1.7-1.6-1.7h-.2c-.9 0-1.7.8-1.8 1.7zm13.4 3.4v1.9h-3.4v-5.4c0-1.1-.6-1.5-1.4-1.5-.7 0-1.3.3-1.8.8v4.1h1.2v1.9h-4.6v-1.9h1.2v-4.8h-1.2V14h3v.8c.7-.7 1.7-1 2.7-1 1.7-.1 3.1 1.2 3.2 2.8v4.1z';
  HP.klubbenSvg = () => '<svg class="klubben" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 126.6 32.6"><path fill="currentColor" d="' + HP.KLUBBEN_PATH + '"/></svg>';

  /* ---------- toasts ---------- */
  HP.toast = (msg, opts) => {
    opts = opts || {};
    let box = document.getElementById('toasts');
    if (!box) document.body.append((box = h('#toasts')));
    const el = h('.toast' + (opts.kind ? '.' + opts.kind : ''), null, h('span', null, msg),
      opts.action && h('button.link', { onclick: () => { opts.action.fn(); el.remove(); } }, opts.action.label));
    box.append(el);
    setTimeout(() => el.remove(), opts.ms || 4200);
  };

  /* ---------- modal ---------- */
  HP.modal = (o) => {
    const close = () => { back.remove(); document.removeEventListener('keydown', key, true); o.onClose && o.onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const back = h('.modal-back', { onpointerdown: (e) => { if (e.target === back) close(); } },
      h('.modal' + (o.size ? '.' + o.size : ''), { role: 'dialog' },
        h('.modal-head', null, h('h2', null, o.title), o.headExtra, h('button.icon-btn', { title: HP.t('Close', 'Luk'), onclick: close }, HP.icon('x'))),
        h('.modal-body' + (o.flush ? '.flush' : ''), null, o.body),
        o.foot && h('.modal-foot', null, o.foot)));
    document.body.append(back);
    document.addEventListener('keydown', key, true);
    const f = back.querySelector('[autofocus], input, select, textarea');
    if (f) setTimeout(() => f.focus(), 30);
    return close;
  };
  HP.confirm = (msg, yesLabel, fn) => {
    const close = HP.modal({ title: HP.t('Are you sure?', 'Er du sikker?'), size: 'sm', body: h('p', null, msg),
      foot: [h('button.btn', { onclick: () => close() }, HP.t('Cancel', 'Annuller')), h('button.btn.primary', { onclick: () => { close(); fn(); } }, yesLabel)] });
  };

  /* ---------- catalogue (published data + local admin drafts) ---------- */
  const emptyDraft = () => ({ products: {}, delProducts: [], templates: {}, delTemplates: [] });
  const cat = (HP.catalog = { list: [], byId: {}, templates: [], draft: Object.assign(emptyDraft(), LS.get('draft', {})), version: 0 });
  cat.rebuild = () => {
    const d = cat.draft, base = DATA.products || [];
    const seen = new Set();
    cat.list = [];
    base.forEach((p) => { if (d.delProducts.includes(p.id)) return; seen.add(p.id); cat.list.push(d.products[p.id] || p); });
    Object.values(d.products).forEach((p) => { if (!seen.has(p.id)) cat.list.unshift(p); });
    cat.byId = {};
    cat.list.forEach((p) => {
      cat.byId[p.id] = p;
      p._hay = [p.brand, p.name, p.sku, ...(p.cats || []), ...(p.in || []).map((x) => x.label), ...(p.out || []).map((x) => x.label),
        p.bt ? 'bluetooth bt' : '', p.wifi ? 'wifi wi-fi' : '', (p.cats || []).join(' ').replace(/Receivers/g, 'Recievers')].join(' ').toLowerCase();
    });
    const tb = (DATA.templates || []).filter((t) => !d.delTemplates.includes(t.id)).map((t) => d.templates[t.id] || t);
    Object.values(d.templates).forEach((t) => { if (!tb.some((x) => x.id === t.id)) tb.push(t); });
    cat.templates = tb;
    cat.version++;
  };
  cat.get = (id) => cat.byId[id];
  cat.products = () => cat.list.filter((p) => !p.cable);
  cat.cables = () => cat.list.filter((p) => p.cable);
  cat.dirtyCount = () => { const d = cat.draft; return Object.keys(d.products).length + d.delProducts.length + Object.keys(d.templates).length + d.delTemplates.length; };
  cat.saveDraft = () => {
    if (!LS.set('draft', cat.draft)) HP.toast(HP.t('Browser storage is full. Publish or use smaller images.', 'Browserens lager er fuldt. Udgiv eller brug mindre billeder.'), { kind: 'err' });
    cat.rebuild(); HP.emit('catalog');
  };
  cat.putProduct = (p) => { const c = Object.assign({}, p); delete c._hay; cat.draft.products[p.id] = c; cat.draft.delProducts = cat.draft.delProducts.filter((x) => x !== p.id); cat.saveDraft(); };
  cat.removeProduct = (id) => { delete cat.draft.products[id]; if ((DATA.products || []).some((p) => p.id === id)) cat.draft.delProducts.push(id); cat.saveDraft(); };
  cat.putTemplate = (t) => { cat.draft.templates[t.id] = t; cat.draft.delTemplates = cat.draft.delTemplates.filter((x) => x !== t.id); cat.saveDraft(); };
  cat.removeTemplate = (id) => { delete cat.draft.templates[id]; if ((DATA.templates || []).some((t) => t.id === id)) cat.draft.delTemplates.push(id); cat.saveDraft(); };
  cat.clearDraft = () => { cat.draft = emptyDraft(); cat.saveDraft(); };
  cat.clean = (p) => { const c = Object.assign({}, p); delete c._hay; return c; };
  cat.rebuild();

  HP.CAT_TREE = [
    ['Amplifiers', ['Integrated Amplifiers', 'Amplifiers with Streaming', 'Amplifiers with CD', 'Compact Amplifiers', 'Compact Amplifiers with Streaming', 'Pre Amplifiers', 'Power Amplifiers', 'Power Amplifiers CI', 'Multi-Channel Amplifiers', 'Multiroom Amplifiers', 'Receivers', 'Home Cinema Receivers', 'Surround-Processors']],
    ['Speakers', ['Active Speakers', 'Passive Speakers', 'Floorstanding Speakers', 'Compact Speakers', 'On-Wall Speakers', 'Center Speakers', 'Subwoofers', 'Wireless/Bluetooth Speakers', 'Soundbar/TV Audio', 'CI & Outdoor Speakers']],
    ['Sources', ['Streamers', 'Streamers with Radio', 'CD Players', 'Turntables', 'RIAA Amplifiers', 'Radios', 'Radios with DAB', 'Radios with FM', 'Internet Radios']],
    ['TV', ['TV', 'OLED', 'QLED']],
    ['Utilities', ['D/A Converters', 'A/D Converters', 'Headphone Amplifiers', 'Wireless Adapters', 'Bluetooth Receivers', 'Peripherals', 'Stand-in Products']],
  ];

  /* ---------- document store ---------- */
  const blank = () => ({ v: 2, name: '', pages: 1, orient: 'landscape', ci: false, ciSize: 90, items: [], conns: [], plan: null });
  const store = (HP.store = { doc: Object.assign(blank(), LS.get('doc', {})), planSrc: LS.get('plan', null), sel: new Set(), selConn: null });
  let hist = [], fut = [], last = JSON.stringify(store.doc);
  store.commit = () => {
    const s = JSON.stringify(store.doc);
    if (s === last) { HP.emit('doc'); return; }
    hist.push(last); if (hist.length > 120) hist.shift();
    fut = []; last = s; LS.set('doc', store.doc); HP.emit('doc');
  };
  const restore = (s) => {
    last = s; store.doc = JSON.parse(s); LS.set('doc', store.doc);
    const ids = new Set(store.doc.items.map((i) => i.id));
    store.sel = new Set([...store.sel].filter((id) => ids.has(id))); store.selConn = null; HP.emit('doc');
  };
  store.undo = () => { if (hist.length) { fut.push(last); restore(hist.pop()); } };
  store.redo = () => { if (fut.length) { hist.push(last); restore(fut.pop()); } };
  store.canUndo = () => hist.length > 0; store.canRedo = () => fut.length > 0;
  store.load = (doc, planSrc) => {
    hist.push(last); fut = [];
    store.doc = Object.assign(blank(), doc); store.planSrc = planSrc || null; store.sel.clear(); store.selConn = null;
    last = JSON.stringify(store.doc); LS.set('doc', store.doc); store.savePlan(); HP.emit('doc'); HP.emit('loaded');
  };
  store.savePlan = () => { if (store.planSrc) { if (!LS.set('plan', store.planSrc)) HP.toast(HP.t('Floor plan is too large to autosave. Export the project to keep it.', 'Plantegningen er for stor til autosave. Eksportér projektet for at gemme den.'), { kind: 'warn' }); } else LS.del('plan'); };
  store.blank = blank;
  store.item = (id) => store.doc.items.find((i) => i.id === id);

  /* ---------- roles ---------- */
  HP.isAdmin = () => !!LS.get('admin', false);
  HP.shop = () => LS.get('shop', '');
})();
