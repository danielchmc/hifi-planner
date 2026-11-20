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
  /* images: hk:<uuid> (website, mirrored) or img/... (own); local copy first, website fallback */
  HP.imgEl = (u, size, props) => h('img', Object.assign({ src: HP.site.src(u, size), data: { fb: HP.site.fallback(u, size) }, onerror: HP.site.onerr, draggable: false, alt: '' }, props));
  // colour variant chosen on a canvas item (item.v = variant SKU)
  // the product's page on hifiklubben.dk (the chosen colour's page when it has one), else the website's search for the SKU
  HP.productUrl = (p, item) => {
    if (!p) return '';
    const v = HP.variantOf(p, item), u = (v && v.url) || p.url;
    if (u) return /^https?:/.test(u) ? u : 'https://www.hifiklubben.dk' + u;
    const q = (v && v.sku) || p.site || p.sku;
    return q ? 'https://www.hifiklubben.dk/sog/?q=' + encodeURIComponent(q) : '';
  };
  // the one colour a search points at: a word that is in this variant's SKU, colour name or colour key but not in every variant's
  // ("raclarity66b", "66bk", "sort", "black" → Clarity 66 Sort). null when the search fits all colours alike.
  HP.matchVariant = (p, words) => {
    const vs = (p && p.vars) || [];
    if (vs.length < 2 || !words || !words.length) return null;
    const hay = vs.map((v) => (v.sku + ' ' + v.label + ' ' + (v.key || '')).toLowerCase());
    let best = null, bs = 0;
    vs.forEach((v, i) => {
      const sc = words.filter((w) => hay[i].includes(w) && !hay.every((x) => x.includes(w))).length;
      if (sc > bs) { bs = sc; best = v; }
    });
    return best;
  };
  // a colour (item.v) or, for a cable on a wire, a length (item.len): price, label ('3 m') and page of that variant
  HP.variantOf = (p, item) => (item && item.v && p && (p.vars || []).find((x) => x.sku === item.v)) || (item && item.len && p && (p.lens || []).find((x) => x.sku === item.len)) || null;
  HP.imagesOf = (p, item) => { const imgs = ((p && p.img) || []).slice(), v = HP.variantOf(p, item); if (v && v.img) imgs[0] = v.img; return imgs.filter(Boolean); };
  HP.priceOf = (p, item) => { const v = HP.variantOf(p, item); return v ? { price: v.price, was: v.was || 0, label: v.label } : { price: p.price || 0, was: p.was > p.price ? p.was : 0, label: '' }; };
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
    gear: '<circle cx="12" cy="12" r="3"/><path d="M10.3 2.5h3.4l.5 2.6 1.6.9 2.5-.9 1.7 2.9-2 1.8v1.9l2 1.8-1.7 2.9-2.5-.9-1.6.9-.5 2.6h-3.4l-.5-2.6-1.6-.9-2.5.9-1.7-2.9 2-1.8V11l-2-1.8 1.7-2.9 2.5.9 1.6-.9z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    store: '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/>',
    eraser: '<path d="M8 20h12M5 14l8-8 6 6-6 6H9z"/><path d="M9 10l6 6"/>',
    scale: '<path d="M4 4h7v7H4zM14 14h6v6h-6zM11 7.5h3.5V14"/>',
    folder: '<path d="M3 6h7l2 2h9v12H3z"/>', bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>', fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    page: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>', rotate: '<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 20v-5h5"/>',
    cable: '<path d="M4 8V4M8 8V4M3 8h6v3a3 3 0 0 1-6 0zM6 14v2a4 4 0 0 0 8 0v-4a4 4 0 0 1 6 -3"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', check: '<path d="M4 12l5 5L20 6"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>', upload: '<path d="M12 16V4M7 8l5-5 5 5M4 21h16"/>',
    lock: '<path d="M6 11h12v10H6z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>', move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10a4 4 0 0 1 0 8z"/><path d="M12 16v-5M9.5 13l2.5-2.5 2.5 2.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3" stroke-linecap="round"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
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
    return () => el.remove(); // close early
  };

  /* ---------- context menu ---------- */
  HP.menu = (x, y, entries) => {
    const old = document.getElementById('ctxmenu'); if (old) old.remove();
    const close = () => { m.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); };
    const outside = (e) => { if (!m.contains(e.target)) close(); };
    const key = (e) => {
      const rows = [...m.querySelectorAll('button.mi:not(:disabled)')], i = rows.indexOf(document.activeElement);
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') rows[(i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length].focus();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const m = h('#ctxmenu', { role: 'menu', oncontextmenu: (e) => e.preventDefault() }, entries.filter((e, i, a) => !(e === 'sep' && (i === 0 || a[i - 1] === 'sep' || i === a.length - 1))).map((e) => {
      if (e === 'sep') return h('.msep');
      if (e.head) return h('.mhead', null, e.head);
      if (e.el) return h('.mcustom', null, e.el);
      return h('button.mi' + (e.danger ? '.danger' : '') + (e.on ? '.on' : ''), { role: 'menuitem', disabled: !!e.disabled, onclick: () => { close(); e.fn(); } },
        e.swatch ? h('span.sw', { style: { background: e.swatch } }) : e.icon ? HP.icon(e.icon, 15) : h('span.ic'), h('span.ml', null, e.label), e.key ? h('span.mk', null, e.key.split('+').map((k) => h('kbd', null, k))) : null);
    }));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
    m.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
    setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true); window.addEventListener('blur', close); window.addEventListener('resize', close); });
    return close;
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
  const emptyDraft = () => ({ products: {}, delProducts: [], templates: {}, delTemplates: [], ignore: [] });
  // the test page (next.html) keeps its own drafts, so trying it out never mixes with the real catalogue's drafts
  HP.NEXT = !!DATA.categories; // the generated catalogue (build/app-products.js + build/categories.js) is loaded
  HP.DRAFT_KEY = window.HP_NEXT ? 'draft-next' : 'draft';
  const cat = (HP.catalog = { list: [], byId: {}, templates: [], draft: Object.assign(emptyDraft(), LS.get(HP.DRAFT_KEY, {})), version: 0 });
  cat.rebuild = () => {
    const d = cat.draft, base = DATA.products || [];
    const seen = new Set();
    cat.list = [];
    base.forEach((p) => { if (d.delProducts.includes(p.id)) return; seen.add(p.id); cat.list.push(d.products[p.id] || p); });
    Object.values(d.products).forEach((p) => { if (!seen.has(p.id)) cat.list.unshift(p); });
    cat.byId = {};
    cat.list.forEach((p) => {
      cat.byId[p.id] = p;
      // connectors from the strict list (old values such as 'coax', 'sub' or plain 'usb' are mapped; see js/ports.js)
      if (HP.ports) ['in', 'out'].forEach((side) => (p[side] || []).forEach((x) => { x.conn = HP.ports.conn(x.conn, x, side); }));
      if (HP.ports && p.cable) { const e = HP.ports.cableEnds(p); if (e) p._ends = e; }
      p._hay = [p.brand, p.name, p.sku, ...(p._ends || []).map((c) => (HP.ports.CONNECTORS[c] || c) + ' ' + c), ...(p.vars || []).map((v) => v.sku + ' ' + v.label + ' ' + (v.key || '')), ...(p.cats || []), ...(p.in || []).map((x) => x.label), ...(p.out || []).map((x) => x.label),
        p.bt ? 'bluetooth bt' : '', p.wifi ? 'wifi wi-fi' : '', p.ct || '', (p.cats || []).join(' ').replace(/Receivers/g, 'Recievers')].join(' ').toLowerCase();
    });
    const tb = (DATA.templates || []).filter((t) => !d.delTemplates.includes(t.id)).map((t) => d.templates[t.id] || t);
    Object.values(d.templates).forEach((t) => { if (!tb.some((x) => x.id === t.id)) tb.push(t); });
    cat.templates = tb;
    cat.version++;
  };
  cat.get = (id) => cat.byId[id];
  cat.products = () => cat.list.filter((p) => !p.cable);
  cat.cables = () => cat.list.filter((p) => p.cable);
  cat.dirtyCount = () => { const d = cat.draft; return Object.keys(d.products).length + d.delProducts.length + Object.keys(d.templates).length + d.delTemplates.length + (d.ignore || []).length; };
  cat.saveDraft = () => {
    if (!LS.set(HP.DRAFT_KEY, cat.draft)) HP.toast(HP.t('Browser storage is full. Publish or use smaller images.', 'Browserens lager er fuldt. Udgiv eller brug mindre billeder.'), { kind: 'err' });
    cat.rebuild(); HP.emit('catalog');
  };
  cat.putProduct = (p) => { const c = Object.assign({}, p); delete c._hay; cat.draft.products[p.id] = c; cat.draft.delProducts = cat.draft.delProducts.filter((x) => x !== p.id); cat.saveDraft(); };
  cat.ignoreSite = (sku) => { if (!sku) return; cat.draft.ignore = cat.draft.ignore || []; if (!cat.draft.ignore.includes(sku)) cat.draft.ignore.push(sku); cat.saveDraft(); };
  cat.removeProduct = (id) => { const p = cat.get(id); if (p && p.site) cat.ignoreSite(p.site); delete cat.draft.products[id]; if ((DATA.products || []).some((p) => p.id === id)) cat.draft.delProducts.push(id); cat.saveDraft(); };
  cat.putTemplate = (t) => { cat.draft.templates[t.id] = t; cat.draft.delTemplates = cat.draft.delTemplates.filter((x) => x !== t.id); cat.saveDraft(); };
  cat.removeTemplate = (id) => { delete cat.draft.templates[id]; if ((DATA.templates || []).some((t) => t.id === id)) cat.draft.delTemplates.push(id); cat.saveDraft(); };
  cat.clearDraft = () => { cat.draft = emptyDraft(); cat.saveDraft(); };
  cat.clean = (p) => { const c = Object.assign({}, p); delete c._hay; delete c._ends; return c; };
  cat.rebuild();

  HP.CAT_TREE = [
    ['Amplifiers', ['Integrated Amplifiers', 'Amplifiers with Streaming', 'Amplifiers with CD', 'Compact Amplifiers', 'Compact Amplifiers with Streaming', 'Pre Amplifiers', 'Power Amplifiers', 'Power Amplifiers CI', 'Multi-Channel Amplifiers', 'Multiroom Amplifiers', 'Receivers', 'Home Cinema Receivers', 'Surround-Processors']],
    ['Speakers', ['Active Speakers', 'Passive Speakers', 'Floorstanding Speakers', 'Compact Speakers', 'On-Wall Speakers', 'Center Speakers', 'Subwoofers', 'Wireless/Bluetooth Speakers', 'Soundbar/TV Audio', 'CI & Outdoor Speakers']],
    ['Sources', ['Streamers', 'Streamers with Radio', 'CD Players', 'Turntables', 'RIAA Amplifiers', 'Radios', 'Radios with DAB', 'Radios with FM', 'Internet Radios']],
    ['TV', ['TV', 'OLED', 'QLED']],
    ['Utilities', ['D/A Converters', 'A/D Converters', 'Headphone Amplifiers', 'Wireless Adapters', 'Bluetooth Receivers', 'Peripherals', 'Stand-in Products']],
  ];

  // Danish names for the category chips (the catalogue's categories are in English)
  const CAT_DA = { Amplifiers: 'Forstærkere', Speakers: 'Højttalere', Sources: 'Kilder', TV: 'TV', Utilities: 'Tilbehør',
    'Integrated Amplifiers': 'Integrerede', 'Amplifiers with Streaming': 'Med streaming', 'Amplifiers with CD': 'Med CD', 'Compact Amplifiers': 'Kompakte', 'Compact Amplifiers with Streaming': 'Kompakte m. streaming',
    'Pre Amplifiers': 'Forforstærkere', 'Power Amplifiers': 'Effektforstærkere', 'Power Amplifiers CI': 'Effekt CI', 'Multi-Channel Amplifiers': 'Flerkanals', 'Multiroom Amplifiers': 'Multiroom',
    Receivers: 'Receivere', 'Home Cinema Receivers': 'Hjemmebio-receivere', 'Surround-Processors': 'Surround-processorer',
    'Active Speakers': 'Aktive', 'Passive Speakers': 'Passive', 'Floorstanding Speakers': 'Gulvhøjttalere', 'Compact Speakers': 'Kompakthøjttalere', 'On-Wall Speakers': 'Væghøjttalere', 'Center Speakers': 'Center',
    Subwoofers: 'Subwoofere', 'Wireless/Bluetooth Speakers': 'Trådløse / Bluetooth', 'Soundbar/TV Audio': 'Soundbars / TV-lyd', 'CI & Outdoor Speakers': 'Indbygning & udendørs',
    Streamers: 'Streamere', 'Streamers with Radio': 'Streamere m. radio', 'CD Players': 'CD-afspillere', Turntables: 'Pladespillere', 'RIAA Amplifiers': 'RIAA', Radios: 'Radioer', 'Radios with DAB': 'DAB-radioer',
    'Radios with FM': 'FM-radioer', 'Internet Radios': 'Internetradioer', OLED: 'OLED', QLED: 'QLED',
    'D/A Converters': 'DAC', 'A/D Converters': 'ADC', 'Headphone Amplifiers': 'Hovedtelefonforstærkere', 'Wireless Adapters': 'Trådløse adaptere', 'Bluetooth Receivers': 'Bluetooth-modtagere', Peripherals: 'Udstyr', 'Stand-in Products': 'Pladsholdere' };
  const CAT_EN = { 'Floorstanding Speakers': 'Floorstanding', 'Compact Speakers': 'Compact', 'On-Wall Speakers': 'On-wall', 'Center Speakers': 'Center', 'Active Speakers': 'Active', 'Passive Speakers': 'Passive', 'Wireless/Bluetooth Speakers': 'Wireless / Bluetooth', 'CI & Outdoor Speakers': 'CI & outdoor', Utilities: 'Accessories' };
  HP.catLabel = (c) => (HP.lang() === 'da' ? CAT_DA[c] : CAT_EN[c]) || c;
  // the generated catalogue (test page): the website's category tree replaces the list above. Products carry their category path
  // in cats (e.g. ['/tv/', '/tv/projektor/']), so everything that groups by category works unchanged.
  if (DATA.categories) {
    const C = new Map(DATA.categories.map((x) => [x.id, x]));
    const top = (id) => { let x = C.get(id), g = 0; while (x && x.parent && g++ < 6) x = C.get(x.parent); return x ? x.id : id; };
    HP.CAT_TREE = DATA.categories.filter((x) => !x.parent).map((s) => [s.id, DATA.categories.filter((x) => x.parent && top(x.id) === s.id).map((x) => x.id)]);
    const legacy = HP.catLabel;
    HP.catLabel = (id) => { const x = C.get(id); return x ? (HP.lang() === 'da' ? x.title : x.en || x.title) : legacy(id); };
    // a category id → its path from the section down, e.g. '/tv/projektor/' → ['/tv/', '/tv/projektor/']
    HP.catChain = (id) => { const out = []; let x = C.get(id), g = 0; while (x && g++ < 6) { out.unshift(x.id); x = C.get(x.parent); } return out; };
    HP.catDeepest = (ids) => (ids || []).filter((id) => C.has(id)).sort((a, b) => HP.catChain(b).length - HP.catChain(a).length)[0] || '';
  }

  /* ---------- own layer (data/own.js): what HiFi Planner adds to the website's data ----------
     A catalogue product as the app holds it → its own-layer entry. prev = the product's current entry in data/own.js.
     Website facts (price, discount, colours, URL) are not kept for products that follow the website (link); they come from
     the hourly build. Products without a link keep them in "frozen". Same format as tools/own-split.js writes. */
  HP.toOwn = (p, prev) => {
    const o = {};
    ['id', 'brand', 'name', 'sku', 'img', 'in', 'out', 'cable', 'ends', 'bt', 'wifi', 'manualWireless', 'review', 'auto'].forEach((k) => { if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; });
    o.cats = (prev && prev.cats) || p.lcats || (DATA.categories ? [] : p.cats) || []; // today's (legacy) categories: the build's fallback
    const deep = DATA.categories ? HP.catDeepest(p.cats) : '';
    if (deep && deep !== p.wc) o.cat = deep; // a category chosen by hand (differs from the website's)
    const up = (s) => String(s || '').toUpperCase();
    if (prev && prev.link && (!p.site || up(prev.link.site) === up(p.site))) o.link = prev.link;
    else if (p.site && !p.gone && !(prev && prev.frozen && up(prev.frozen.site) === up(p.site))) o.link = { site: p.site }; // a new link (a frozen product stays frozen)
    if (o.ends && p.endsAuto) delete o.ends; // worked out by the build, not chosen by hand: not stored
    if (!o.link) { const f = {}; ['price', 'was', 'vars', 'url', 'site', 'gone'].forEach((k) => { if (p[k] !== undefined && p[k] !== null) f[k] = p[k]; }); o.frozen = f; }
    return o;
  };

  /* ---------- document store ---------- */
  const blank = () => ({ v: 4, name: '', pages: 1, orient: 'landscape', ci: false, ciSize: 90, ms: 34, mk: [], sc: 0, items: [], conns: [], plan: null });
  // v2 -> v3: CI mode used to shrink every product to a thumbnail; it now places lettered marks. Old CI drawings become marks.
  const migrate = (doc) => {
    if ((doc.v || 2) < 3) migrate3(doc);
    if (doc.v < 4) { // v4: A4 became 1400 wide (was 1414) and pages 100 apart (was 60): items on page 2+ move with their page
      const port = doc.orient === 'portrait', oldPitch = (port ? 1000 : 1414) + 60, step = (port ? 1000 : 1400) + 100 - oldPitch;
      doc.items.forEach((i) => { const n = Math.max(0, Math.floor((i.x + 30) / oldPitch)); if (n) i.x += n * step; });
      doc.v = 4;
    }
    return doc;
  };
  const migrate3 = (doc) => {
    doc.ms = 34; doc.mk = [];
    if (doc.ci) {
      const gone = new Set(), half = (doc.ciSize || 90) / 2 - 17;
      doc.items = doc.items.map((i) => { if (i.kind !== 'product') return i; gone.add(i.id); if (!doc.mk.includes(i.pid)) doc.mk.push(i.pid); return { id: i.id, kind: 'mark', k: i.pid, x: Math.round(i.x + half), y: Math.round(i.y + half) }; });
      doc.conns = (doc.conns || []).filter((c) => !gone.has(c.a.item) && !gone.has(c.b.item));
      if (gone.size) doc.items.push({ id: HP.uid(), kind: 'legend', x: 30, y: 30 });
    }
    doc.v = 3;
  };
  const store = (HP.store = { doc: migrate(Object.assign(blank(), LS.get('doc', {}))), planSrc: LS.get('plan', null), sel: new Set(), selConn: null });
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
    store.doc = migrate(Object.assign(blank(), doc)); if (planSrc !== undefined) store.planSrc = planSrc || null; // keep the image when none is given, so Undo can bring a plan back store.sel.clear(); store.selConn = null;
    last = JSON.stringify(store.doc); LS.set('doc', store.doc); store.savePlan(); HP.emit('doc'); HP.emit('loaded');
  };
  store.savePlan = () => { if (store.planSrc) { if (!LS.set('plan', store.planSrc)) HP.toast(HP.t('Floor plan is too large to autosave. Export the project to keep it.', 'Plantegningen er for stor til autosave. Eksportér projektet for at gemme den.'), { kind: 'warn' }); } else LS.del('plan'); };
  store.blank = blank;
  store.item = (id) => store.doc.items.find((i) => i.id === id);

  /* ---------- shareable links: the proposal packed into the URL (#p=...) ---------- */
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  // Compact link format ("c"): arrays instead of objects, item ids replaced by their position, coordinates in 10 px grid steps.
  const R = (v) => Math.round((v || 0) / 10);
  function compact(doc) {
    const items = doc.items.filter((i) => i.kind !== 'plan'), idx = new Map(items.map((i, n) => [i.id, n]));
    return [3, doc.name || '', doc.pages, doc.orient === 'portrait' ? 1 : 0, doc.ci ? 1 : 0, doc.ciSize, Math.round((doc.cardScale || 1) * 100),
      items.map((i) => i.kind === 'product' ? (i.np ? [i.pid, R(i.x), R(i.y), i.face || 0, i.v || 0, 1] : i.v ? [i.pid, R(i.x), R(i.y), i.face || 0, i.v] : [i.pid, R(i.x), R(i.y), i.face || 0]) : i.kind === 'text' ? [1, R(i.x), R(i.y), R(i.w), R(i.h), i.title || '', i.body || ''].concat(i.noTitle || i.noBody ? [(i.noTitle ? 1 : 0) + (i.noBody ? 2 : 0)] : []) : i.kind === 'mark' ? [3, Math.round(i.x / 5), Math.round(i.y / 5), i.k].concat(i.np ? [1] : []) : i.kind === 'legend' ? [4, R(i.x), R(i.y)] : i.kind === 'zone' ? [5, R(i.x), R(i.y), R(i.w), R(i.h), i.name || '']
        : i.kind === 'run' ? [6, Math.round(i.x / 5), Math.round(i.y / 5), i.cable || 0, i.pts.flat().map((v) => Math.round(v / 5))] : [2, R(i.x), R(i.y)]),
      doc.conns.filter((c) => idx.has(c.a.item) && idx.has(c.b.item)).map((c) => { const r = [idx.get(c.a.item), c.a.key, idx.get(c.b.item), c.b.key]; if (c.cable || c.shift || c.lv || c.m) r.push(c.cable || 0); if (c.shift || c.lv || c.m) r.push(Math.round((c.shift || 0) / 5)); if (c.lv || c.m) r.push(c.lv || 0, c.m || 0); return r; }), // [.., cable, shift, length SKU, metres]
      [doc.ms || 34, doc.mk || [], doc.sc || 0, 4]];
  }
  function expand(a) {
    if (!Array.isArray(a) || a[0] !== 3) throw new Error('bad link');
    const ids = a[7].map(() => HP.uid());
    const items = a[7].map((r, n) => typeof r[0] === 'string' ? Object.assign({ id: ids[n], kind: 'product', pid: r[0], x: r[1] * 10, y: r[2] * 10, face: r[3] || 0 }, r[4] ? { v: r[4] } : {}, r[5] ? { np: 1 } : {})
      : r[0] === 1 ? { id: ids[n], kind: 'text', x: r[1] * 10, y: r[2] * 10, w: r[3] * 10, h: r[4] * 10, title: r[5], body: r[6], ...(r[7] & 1 ? { noTitle: true } : {}), ...(r[7] & 2 ? { noBody: true } : {}) } : r[0] === 3 ? Object.assign({ id: ids[n], kind: 'mark', k: r[3], x: r[1] * 5, y: r[2] * 5 }, r[4] ? { np: 1 } : {}) : r[0] === 4 ? { id: ids[n], kind: 'legend', x: r[1] * 10, y: r[2] * 10 }
      : r[0] === 5 ? { id: ids[n], kind: 'zone', x: r[1] * 10, y: r[2] * 10, w: r[3] * 10, h: r[4] * 10, name: r[5] }
      : r[0] === 6 ? { id: ids[n], kind: 'run', x: r[1] * 5, y: r[2] * 5, cable: r[3] || null, pts: r[4].reduce((a, v, i) => { if (i % 2) a[a.length - 1].push(v * 5); else a.push([v * 5]); return a; }, []) }
      : { id: ids[n], kind: 'prices', x: r[1] * 10, y: r[2] * 10 });
    const conns = a[8].map((r) => ({ id: HP.uid(), a: { item: ids[r[0]], key: r[1] }, b: { item: ids[r[2]], key: r[3] }, cable: r[4] || null, shift: (r[5] || 0) * 5, ...(r[6] ? { lv: r[6] } : {}), ...(r[7] ? { m: r[7] } : {}) }));
    return Object.assign({ v: a[9] ? a[9][3] || 3 : 2, name: a[1], pages: a[2], orient: a[3] ? 'portrait' : 'landscape', ci: !!a[4], ciSize: a[5], cardScale: a[6] / 100, items, conns, plan: null }, a[9] ? { ms: a[9][0], mk: a[9][1], sc: a[9][2] || 0 } : {});
  }
  HP.share = {
    async pack(doc) {
      const bytes = new TextEncoder().encode(JSON.stringify(compact(doc)));
      return window.CompressionStream ? 'c' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))) : 'k' + b64u(bytes);
    },
    async unpack(s) {
      const bytes = unb64u(s.slice(1)), kind = s[0];
      const raw = kind === 'z' || kind === 'c' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
      const data = JSON.parse(new TextDecoder().decode(raw));
      const doc = kind === 'c' || kind === 'k' ? expand(data) : data; // 'z' / 'j' = first version of links, still supported
      if (!doc || !Array.isArray(doc.items) || !Array.isArray(doc.conns)) throw new Error('bad link');
      return doc;
    },
    async url() { return location.href.split('#')[0] + '#p=' + (await HP.share.pack(store.doc)); },
    async openFromHash() {
      const m = /^#p=(.+)$/.exec(location.hash); if (!m) return false;
      history.replaceState(null, '', location.href.split('#')[0]);
      try { store.load(await HP.share.unpack(m[1])); HP.toast(HP.t('Opened the shared proposal.', 'Åbnede det delte tilbud.'), { kind: 'ok', ms: 7000, action: { label: HP.t('Undo', 'Fortryd'), fn: store.undo } }); return true; }
      catch (e) { HP.toast(HP.t('That link could not be opened.', 'Linket kunne ikke åbnes.'), { kind: 'err' }); return false; }
    },
  };
  HP.priceSyncText = () => { const ps = DATA.priceSync; if (!ps || !ps.date) return ''; const d = new Date(ps.date); return HP.t('Prices synced with hifiklubben.dk ', 'Priser synkroniseret med hifiklubben.dk ') + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- roles ---------- */
  HP.isAdmin = () => !!LS.get('admin', false);
  HP.shop = () => LS.get('shop', '');
  // Shop accounts are kept per browser: { "442": { no, name, email, phone } }
  HP.shops = () => LS.get('shops', {});
  HP.shopProfile = (no) => { no = no || HP.shop(); return Object.assign({ no, name: '', email: '', phone: '' }, HP.shops()[no]); };
  HP.saveShop = (p) => { const all = HP.shops(); all[p.no] = p; LS.set('shops', all); HP.emit('doc'); };
  // Sellers (staff logins, 5-7 digits) are kept per browser and belong to a shop: { "44240": { no, name, shop } }
  HP.sellerRe = /^\d{5,7}$/;
  HP.sellers = (shop) => Object.values(LS.get('sellers', {})).filter((s) => !shop || s.shop === shop).sort((a, b) => a.name.localeCompare(b.name));
  HP.seller = () => { const s = LS.get('sellers', {})[LS.get('seller', '')]; return s && s.shop === HP.shop() ? s : null; };
  HP.saveSeller = (s) => { const all = LS.get('sellers', {}); all[s.no] = s; LS.set('sellers', all); LS.set('seller', s.no); HP.emit('doc'); HP.emit('seller'); };
  HP.removeSeller = (no) => { const all = LS.get('sellers', {}); delete all[no]; LS.set('sellers', all); if (LS.get('seller', '') === no) LS.del('seller'); };
})();
