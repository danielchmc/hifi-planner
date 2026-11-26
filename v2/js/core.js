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

  /* ---------- i18n: t('English', 'Dansk') ----------
     English and Danish are written in the code. Norwegian, Swedish, Dutch, German and Finnish are dictionaries keyed by the
     English text (js/i18n/<code>.js, only the chosen one is loaded, by index.html). A key with {} is a template for text built
     with +, e.g. 'Delete {} from the catalogue?'. Anything missing falls back to English. */
  HP.LANGS = [['da', 'Dansk'], ['en', 'English'], ['nb', 'Norsk'], ['sv', 'Svenska'], ['nl', 'Nederlands'], ['de', 'Deutsch'], ['fi', 'Suomi']];
  HP.LOCALE = { da: 'da-DK', en: 'en-GB', nb: 'nb-NO', sv: 'sv-SE', nl: 'nl-NL', de: 'de-DE', fi: 'fi-FI' };
  const known = (l) => HP.LANGS.some((x) => x[0] === l);
  const guess = () => { const n = (navigator.language || '').toLowerCase(); return /^(nb|nn|no)\b/.test(n) ? 'nb' : (HP.LANGS.find((x) => n.startsWith(x[0])) || ['en'])[0]; };
  let lang = (() => { const l = LS.get('lang', null); return known(l) ? l : guess(); })();
  const dicts = (window.HP_I18N = window.HP_I18N || {}), memo = {};
  const lookup = (en) => {
    const D = dicts[lang]; if (!D) return en;
    if (D[en] != null) return D[en];
    const M = memo[lang] || (memo[lang] = { hit: new Map(), tpl: Object.keys(D).filter((k) => k.includes('{}')).map((k) => [new RegExp('^' + k.split('{}').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'), D[k]]) });
    if (M.hit.has(en)) return M.hit.get(en);
    let out = en;
    for (const [re, tr] of M.tpl) { const m = re.exec(en); if (m) { let i = 1; out = tr.replace(/\{\}/g, () => m[i++]); break; } }
    M.hit.set(en, out); return out;
  };
  HP.t = (en, da) => (lang === 'da' ? (da != null ? da : en) : lang === 'en' ? en : lookup(en));
  HP.tr = (en) => (lang === 'en' || lang === 'da' ? en : lookup(en)); // an English text in the chosen language (Danish callers pass their own)
  HP.lang = () => lang;
  HP.locale = () => HP.LOCALE[lang] || 'da-DK';
  HP.useLang = (l) => { if (known(l)) lang = l; document.documentElement.lang = lang; }; // for this page only, not remembered (the customer view)
  HP.setLang = (l) => { if (!known(l)) return; lang = l; LS.set('lang', l); document.documentElement.lang = l; HP.emit('lang'); };
  HP.money = (n) => Math.round(n).toLocaleString('da-DK') + ',-';
  HP.today = () => { const d = new Date(); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

  /* ---------- DOM ---------- */
  const h = (HP.h = function (tag, props, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
    const el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach((s) => (s[0] === '#' ? (el.id = s.slice(1)) : el.classList.add(s.slice(1))));
    // no browser suggestions (earlier searches, autofill) under HiFi Planner's own fields; a field can still ask for them
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { el.setAttribute('autocomplete', 'off'); if (props && props.type === 'search') { el.spellcheck = false; el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off'); } }
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
  HP.reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  HP.uid = () => Math.random().toString(36).slice(2, 9);
  HP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  HP.snap = (v) => Math.round(v / 10) * 10;

  /* Icons: Lucide (https://lucide.dev), ISC licence, free for commercial use; the licence is in assets/LICENSE-lucide.txt.
     The SVG markup of each icon is copied in here (no download at run time); the name after // is the icon's Lucide name.
     To add one, find it on lucide.dev and paste the inside of its <svg>. Drawn with round caps and joins (.ic in css/app.css). */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', // search
    'chevron-down': '<path d="m6 9 6 6 6-6"/>', // chevron-down
    'chevron-up': '<path d="m18 15-6-6-6 6"/>', // chevron-up
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>', // layout-grid
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', // plus
    minus: '<path d="M5 12h14"/>', // minus
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', // x
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', // history
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>', // undo2
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>', // redo2
    text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>', // type
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>', // tag
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>', // eye
    eyeoff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>', // eye-off
    print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>', // printer
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', // circle-help
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', // sun
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', // moon
    plan: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>', // layout-dashboard
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>', // trash2
    swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>', // arrow-right-left
    flip: '<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>', // flip-horizontal2
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', // copy
    bt: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>', // bluetooth
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>', // wifi
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', // settings
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', // shield-check
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', // user
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>', // store
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>', // eraser
    scale: '<path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21m0 0h4.8M3 21l6-6"/><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"/><path d="M3 7.8V3m0 0h4.8M3 3l6 6"/>', // expand
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>', // folder
    bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>', // zap
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>', // pencil
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>', // maximize
    page: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', // file
    rotate: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>', // rotate-cw
    cable: '<path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1"/><path d="M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9"/><path d="M21 21v-2h-4"/><path d="M3 5h4V3"/><path d="M7 5a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1V3"/>', // cable
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', // triangle-alert
    check: '<path d="M20 6 9 17l-5-5"/>', // check
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>', // download
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>', // upload
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', // lock
    move: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>', // move
    cloud: '<path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/>', // cloud-upload
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', // link
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', // chart-column
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', // phone
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', // mail
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', // ellipsis
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>', // globe
    up: '<path d="m18 15-6-6-6 6"/>', // chevron-up
    down: '<path d="m6 9 6 6 6-6"/>', // chevron-down
    play: '<polygon points="6 3 20 12 6 21 6 3"/>', // play
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>', // layers
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>', // store
    'chevron-left': '<path d="m15 18-6-6 6-6"/>', // chevron-left
    'chevron-right': '<path d="m9 18 6-6-6-6"/>', // chevron-right
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>', // arrow-up
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', // file-text
    'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>', // folder-open
    qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>', // qr-code
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>', // package
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', // users
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>', // send
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>', // user-plus
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>', // ruler
  };
  /* <select>: in browsers with the customizable select (css: appearance: base-select), each select gets
     <button><selectedcontent></selectedcontent></button> as its first child, so the closed field can cut a long choice with …
     Kept in place when a select's options are rebuilt (they are often cleared with textContent = ''). */
  if (window.CSS && CSS.supports('appearance', 'base-select')) {
    const fix = (sel) => { if (!(sel.firstElementChild && sel.firstElementChild.tagName === 'BUTTON')) sel.prepend(Object.assign(document.createElement('button'), { innerHTML: '<selectedcontent></selectedcontent>' })); };
    const scan = (root) => { if (root.tagName === 'SELECT') fix(root); else if (root.querySelectorAll) root.querySelectorAll('select').forEach(fix); };
    new MutationObserver((ms) => ms.forEach((m) => { if (m.target.tagName === 'SELECT') fix(m.target); m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n)); }))
      .observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => scan(document.body));
  }
  HP.icon = (name, size) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); if (size) { s.style.width = s.style.height = size + 'px'; }
    s.innerHTML = ICONS[name] || '';
    return s;
  };
  HP.KLUBBEN_PATH = 'M0 0v32.6h52.2V0zm41.3 9.7c.8 0 1.5.7 1.5 1.5v.1c0 .8-.7 1.5-1.5 1.4-.8 0-1.5-.7-1.5-1.5.1-.8.7-1.5 1.5-1.5m-16 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.6-1.5 1.5-1.5m-4 2.1h-1.5v9h1.5v1.9H16v-1.9h1.5v-3.5h-5.4v3.5h1.5v1.9H8.3v-1.9h1.5v-9H8.3V9.9h5.3v1.9h-1.5v3.5h5.4v-3.5H16V9.9h5.3zm6.4 10.9h-4.9v-1.9h1.3V16h-1.3v-2h3.6v6.8h1.3zm10.6-9.3h-2.2v-1.6h-3.3v3.5h4v1.9h-4v3.5h1.7v1.9h-5.4v-1.9h1.3v-9H29V9.9h9.3zm5.5 9.3h-4.9v-1.9h1.3V16h-1.3v-2h3.6v6.8h1.3zm25.1-1.9h1.2v1.9H65v-1.9h1.2l-2.6-4-1.5 1.4v2.6h1.5v1.9h-5.3v-1.9h1.5v-9h-1.5V9.9h5.3v1.9h-1.5v4l4.1-4H65V9.9h5.1v1.9h-1.3l-3.6 3.4zm5.9 0H76v1.9h-4.6v-1.9h1.2v-9h-1.2V9.9h3.4zm10.6 0h1.3v1.9h-3.2v-.8c-.8.7-1.8 1-2.8 1-1.8 0-3.1-1-3.1-3.3v-3.7h-1.2V14h3.4v5.4c0 1.1.6 1.5 1.4 1.5.7 0 1.3-.3 1.8-.8V16h-1v-2h3.4zm4.9 1.1v.8h-2.2V11.8H87V9.9h3.4v4.9c.7-.6 1.6-.9 2.5-.9 2 0 3.6 1.7 3.6 4.3 0 2.9-1.6 4.6-3.8 4.6-.8.1-1.7-.3-2.4-.9m4-3.5c0-1.5-.7-2.6-2-2.6s-2 1.1-2 2.5.7 2.6 2.1 2.6 1.9-1 1.9-2.5m5.8 3.5v.8H98V11.8h-1.1V9.9h3.4v4.9c.7-.6 1.6-.9 2.5-.9 2 0 3.6 1.7 3.6 4.3 0 2.9-1.6 4.6-3.8 4.6-1 .1-1.9-.2-2.5-.9m3.9-3.5c0-1.5-.7-2.6-1.9-2.6s-2 1.1-2 2.5.8 2.6 2.1 2.6 1.8-1 1.8-2.5m11.5 0v.6h-5.8c-.1 1 .7 1.9 1.8 2h.2c.7.1 1.4-.3 1.7-.8h2c-.4 1.7-2 2.8-3.7 2.8-2.7 0-4.2-1.7-4.2-4.5s1.6-4.5 4.1-4.5 3.9 1.5 3.9 4.4m-2.3-1c0-.9-.7-1.7-1.6-1.7h-.2c-.9 0-1.7.8-1.8 1.7zm13.4 3.4v1.9h-3.4v-5.4c0-1.1-.6-1.5-1.4-1.5-.7 0-1.3.3-1.8.8v4.1h1.2v1.9h-4.6v-1.9h1.2v-4.8h-1.2V14h3v.8c.7-.7 1.7-1 2.7-1 1.7-.1 3.1 1.2 3.2 2.8v4.1z';
  HP.klubbenSvg = () => '<svg class="klubben" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 126.6 32.6"><path fill="currentColor" d="' + HP.KLUBBEN_PATH + '"/></svg>';

  /* ---------- toasts ---------- */
  // copy text to the clipboard (with the old fallback for file:// and older browsers) and say so
  HP.copyText = async (text, msg) => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove();
    }
    HP.toast(ok ? (msg || HP.t('Copied', 'Kopieret')) : HP.t('Could not copy', 'Kunne ikke kopiere'));
    return ok;
  };
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
  // anchor: the button that opened the menu. Pressing it again closes the menu (like any app's menus), and it shows as
  // pressed (aria-expanded) while the menu is open.
  HP.menu = (x, y, entries, anchor) => {
    const old = document.getElementById('ctxmenu');
    if (old) { const same = anchor && old._anchor === anchor; old._close ? old._close() : old.remove(); if (same) return; }
    const close = () => { m.remove(); if (anchor) anchor.removeAttribute('aria-expanded'); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); };
    const outside = (e) => { if (!m.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); };   // a press on the anchor is left to its click, which toggles
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
      return h('button.mi' + (e.danger ? '.danger' : '') + (e.on ? '.on' : '') + (e.accent ? '.accent' : '') + (e.dim ? '.dim' : ''), { role: 'menuitem', disabled: !!e.disabled, onclick: () => { close(); e.fn(); } },
        e.swatch ? h('span.sw', { style: { background: e.swatch } }) : e.av ? h('span.mav', null, h('b', null, e.av)) : e.icon ? HP.icon(e.icon, 15) : h('span.ic'), h('span.ml', null, e.label), e.note ? h('span.mn', null, e.note) : e.key ? h('span.mk', null, e.key.split('+').map((k) => h('kbd', null, k))) : null);
    }));
    m._anchor = anchor || null; m._close = close; if (anchor) anchor.setAttribute('aria-expanded', 'true');
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
  /* ---------- how old the prices are ----------
     pricesAt: when the website's prices were read (build/app-products.js, from the mirror's listing). When they are older than
     STALE_HOURS, campaign prices are not shown anywhere: every price that has a before-price (was) shows the before-price instead,
     with no discount. An ended campaign must never be promised to a customer from old data; a campaign that started since the last
     read only shows up later, and the till gives the customer the lower price anyway. Open tabs load a newer catalogue by
     themselves (HP.checkCatalogue, every 5 minutes). */
  HP.STALE_HOURS = 3;
  const WEB_KEYS = ['price', 'was', 'vars', 'lens', 'url', 'sku', 'gone', 'goneWhy', 'live'];
  HP.pricesAt = () => { const s = DATA.pricesAt || (DATA.priceSync && DATA.priceSync.date); const d = s ? new Date(s) : null; return d && !isNaN(d) ? d : null; };
  HP.pricesAgeH = () => { const d = HP.pricesAt(); return d ? (Date.now() - d) / 3600000 : Infinity; };
  HP.pricesStale = () => !!DATA.products && HP.pricesAgeH() > HP.STALE_HOURS;
  HP.pricesStamp = () => { const d = HP.pricesAt(); return d ? d.toLocaleString(HP.locale ? HP.locale() : 'da-DK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?'; };
  HP.pricesAgeText = () => { const a = HP.pricesAgeH(); return a === Infinity ? '?' : a < 48 ? Math.round(a) + ' ' + HP.t('hours', 'timer') : Math.round(a / 24) + ' ' + HP.t('days', 'dage'); };
  // campaign prices off: the before-price becomes the price (the campaign price is kept aside, not enumerable, so never saved)
  const unsale = (o) => { if (o && o.was > o.price && !o._sale) { Object.defineProperty(o, '_sale', { value: { price: o.price, was: o.was }, configurable: true }); o.price = o.was; delete o.was; } };
  let guarded = false;
  function guardPrices() {
    guarded = HP.pricesStale();
    if (!guarded) return;
    cat.list.forEach((p) => { unsale(p); (p.vars || []).forEach(unsale); (p.lens || []).forEach(unsale); });
    (DATA.bundles || []).forEach(unsale);
  }
  HP.pricesGuarded = () => guarded;
  const cat = (HP.catalog = { list: [], byId: {}, templates: [], draft: Object.assign(emptyDraft(), LS.get(HP.DRAFT_KEY, {})), version: 0 });
  cat.rebuild = () => {
    fam = null; grp = null; // cable families and length groups (cat.family, cat.cableGroup) are worked out again
    const d = cat.draft, base = DATA.products || [];
    const seen = new Set();
    cat.list = [];
    base.forEach((p) => {
      if (d.delProducts.includes(p.id)) return; seen.add(p.id);
      const dp = d.products[p.id];
      // an edited product (an admin's draft) still takes its price, discount and variants from the published catalogue when the
      // website owns them (live): a draft is a copy from the day it was edited, and must never bring back an old price
      if (dp && p.live && (!dp.site || String(dp.site).toUpperCase() === String(p.site || '').toUpperCase())) WEB_KEYS.forEach((k) => { if (p[k] !== undefined) dp[k] = p[k]; else delete dp[k]; });
      cat.list.push(dp || p);
    });
    Object.values(d.products).forEach((p) => { if (!seen.has(p.id)) cat.list.unshift(p); });
    cat.byId = {};
    cat.list.forEach((p) => {
      cat.byId[p.id] = p;
      // connectors from the strict list (old values such as 'coax', 'sub' or plain 'usb' are mapped; see js/ports.js)
      if (HP.ports) ['in', 'out'].forEach((side) => (p[side] || []).forEach((x) => { x.conn = HP.ports.conn(x.conn, x, side); }));
      if (HP.ports && p.cable) { const e = HP.ports.cableEnds(p); if (e) p._ends = e; }
      p._hay = [p.brand, p.name, p.sku, p.site || '', ...(p._ends || []).map((c) => (HP.ports.CONNECTORS[c] || c) + ' ' + c), ...(p.vars || []).map((v) => v.sku + ' ' + v.label + ' ' + (v.key || '')), ...(p.cats || []), ...(p.in || []).map((x) => x.label), ...(p.out || []).map((x) => x.label),
        p.bt ? 'bluetooth bt' : '', p.wifi ? 'wifi wi-fi' : '', p.ct || '', (p.cats || []).join(' ').replace(/Receivers/g, 'Recievers')].join(' ').toLowerCase();
    });
    const tb = (DATA.templates || []).filter((t) => !d.delTemplates.includes(t.id)).map((t) => d.templates[t.id] || t);
    Object.values(d.templates).forEach((t) => { if (!tb.some((x) => x.id === t.id)) tb.push(t); });
    cat.templates = tb;
    guardPrices();
    cat.version++;
  };
  // products merged into another one (old id → the product it became), so older drawings, links and Shortcuts still find them
  const MOVED = HP.MOVED = {
    'sonos-combo-adapter-usb-c-eth-minijack': 'w-soncomboadapt', // 2026-11-23: our own card was a duplicate of the website's Combo Adapter
  };
  // short product ids for QR codes: '~' + 6 base-36 characters of an FNV-1a hash of the id, only when no other product has the same
  let shortMap = null, shortVer = -1;
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36).padStart(7, '0').slice(-6); };
  const shorts = () => { if (shortVer !== cat.version) { shortMap = new Map(); cat.list.forEach((p) => { const k = fnv(p.id); shortMap.set(k, shortMap.has(k) ? null : p.id); }); shortVer = cat.version; } return shortMap; };
  cat.shortId = (id) => { if (!id || typeof id !== 'string') return id; const k = fnv(id); return shorts().get(k) === id ? '~' + k : id; };
  cat.fromShort = (s) => shorts().get(s.slice(1)) || null;
  cat.get = (id) => cat.byId[id] || (MOVED[id] && cat.byId[MOVED[id]]) || undefined;
  cat.products = () => cat.list.filter((p) => !p.cable);
  cat.cables = () => cat.list.filter((p) => p.cable);
  /* A cable's lengths are separate cards in the catalogue (Black Lab - Sub 2m, 3m … 20m). cat.family(p) gives all lengths of p's
     cable (the same website product `site`, else brand + name without the length), shortest first; cat.lenOf(p) its length in metres from the name. The product list
     shows a family as one row and a cable card offers the other lengths as variants. */
  let fam = null;
  cat.lenOf = (p) => { const m = /(\d+(?:[.,]\d+)?)\s?m$/i.exec(String((p && p.name) || '').trim()); return m ? parseFloat(m[1].replace(',', '.')) : 0; };
  // a cable's lengths: the cards with the same website product, else (own SKU per length, or none) the same brand + name without the length
  const baseName = (x) => (x.brand + ' ' + String(x.name).replace(/[\s,-]*\d+(?:[.,]\d+)?\s?m$/i, '')).toLowerCase().trim();
  cat.family = (p) => {
    if (!p || !p.cable || !cat.lenOf(p)) return p ? [p] : [];
    if (!fam) {
      fam = new Map(); const bySite = new Map(), byName = new Map(), put = (m, k, x) => (m.get(k) || m.set(k, []).get(k)).push(x);
      const ok = (x) => x.cable && !x.gone && cat.lenOf(x);
      cat.list.forEach((x) => { if (!ok(x)) return; if (x.site) put(bySite, String(x.site).toUpperCase(), x); put(byName, baseName(x), x); });
      cat.list.forEach((x) => {
        if (!ok(x)) return;
        let f = x.site && bySite.get(String(x.site).toUpperCase());
        if (!f || f.length < 2) f = byName.get(baseName(x));
        if (f.length > 1 && new Set(f.map(cat.lenOf)).size === f.length) fam.set(x, f); // two cards of one length: not a length choice
      });
      new Set(fam.values()).forEach((v) => v.sort((a, b) => cat.lenOf(a) - cat.lenOf(b)));
    }
    return fam.get(p) || [p];
  };
  // a card for a length the website no longer sells (lenGone; kept so older drawings open) is left out of the lists when its
  // cable's other lengths are a family there
  cat.lenGoneHidden = (p) => !!(p && p.lenGone && p.site && cat.list.some((x) => x !== p && x.site === p.site && cat.family(x).length > 1));
  cat.familyKey = (p) => { const f = cat.family(p); return f.length > 1 ? f[0].id : p.id; };
  // the length to show or add first: the length used last (remembered in the cable picker), else the shortest of at least 1 m
  /* A cable's lengths, one list for the search, the card and the price list (the cable picker builds the same list for a wire).
     cat.cableGroup(p) = { key, rep, members, metre, opts, min }: the cards of one cable (one website product, or one family of
     length cards) with the lengths it is sold in. opts: { m, label, price, was, id, lv } — id = the card to use, lv = the website
     length's SKU when that length has no card of its own (stored on a card as item.len, on a wire as lv). metre: speaker cable
     sold by the metre (no opts; the metres are item.m / conn.m). */
  let grp = null;
  cat.isPerMetre = (p) => !!p && (p.cable || []).includes('speaker') && !!((p.fx || {}).perMetre || /(^|[^0-9.,])1 ?m$|slip/i.test(String(p.name).trim()));
  const fmtM = (m) => String(m).replace('.', ',') + ' m';
  cat.cableGroup = (p) => {
    if (!p || !p.cable) return null;
    if (!grp) {
      grp = new Map();
      const live = cat.list.filter((x) => x.cable && !x.gone), siteKey = new Map(), by = new Map();
      live.forEach((x) => { const f = cat.family(x); if (f.length > 1) f.forEach((y) => y.site && siteKey.set(String(y.site).toUpperCase(), 'F' + f[0].id)); });
      live.forEach((x) => {
        const f = cat.family(x), site = x.site && String(x.site).toUpperCase();
        const k = f.length > 1 ? 'F' + f[0].id : (site && (siteKey.get(site) || 'S' + site)) || 'I' + x.id;
        (by.get(k) || by.set(k, []).get(k)).push(x);
      });
      by.forEach((members, key) => {
        const rep = members.find((x) => !x.web && !x.lenGone) || members.find((x) => !x.web) || members[0];
        const G = { key, rep, members, metre: cat.isPerMetre(rep), opts: [] };
        if (!G.metre) {
          const owner = members.find((x) => (x.lens || []).length && !x.lenGone) || members.find((x) => (x.lens || []).length);
          let opts = owner ? owner.lens.map((l) => ({ m: l.m, label: l.label, price: l.price, was: l.was || 0, id: l.id || owner.id, lv: l.id ? null : l.sku })) : [];
          members.forEach((x) => { const m = cat.lenOf(x); if ((m || !opts.length) && !x.lenGone && !opts.some((o) => o.id === x.id && !o.lv) && !(m && opts.some((o) => o.m === m))) opts.push({ m, label: m ? fmtM(m) : '', price: x.price || 0, was: x.was || 0, id: x.id, lv: null }); });
          G.opts = opts.filter((o) => cat.get(o.id)).sort((a, b) => a.m - b.m || a.price - b.price);
        }
        G.min = G.metre ? rep.price || 0 : Math.min(...G.opts.map((o) => o.price || Infinity));
        members.forEach((x) => grp.set(x, G));
      });
    }
    return grp.get(p) || null;
  };
  // a product that is no longer sold (gone: left the website, or only an outlet unit is left) is only found by its exact SKU
  // (product, colour or length SKU), so older drawings and a seller looking for that one item still find it
  cat.skuWord = (p, w) => { const W = String(w).toUpperCase(); return [p.sku, p.site].concat((p.vars || []).map((v) => v.sku), (p.lens || []).map((l) => l.sku)).some((x) => x && String(x).toUpperCase() === W); };
  cat.findable = (p, words) => !p.gone || (words || []).some((w) => cat.skuWord(p, w));
  // a search word: in the product's text, or a length the cable is sold in ("cl1 hdmi 5m" finds CL1 HDMI 8K, sold in 1–10 m)
  cat.matchWord = (p, w) => {
    if (p._hay.includes(w)) return true;
    const m = p.cable && /^(\d+(?:[.,]\d+)?)m$/.exec(w); if (!m) return false;
    const G = cat.cableGroup(p), n = parseFloat(m[1].replace(',', '.'));
    return !!G && (G.metre || G.opts.some((o) => o.m === n));
  };
  // a cable that comes in more than one length (or by the metre): the card gets a length pill, the search one row
  cat.hasLengths = (p) => { const G = cat.cableGroup(p); return !!G && (G.metre || G.opts.length > 1); };
  // the length a card (or a search row) has: its card and website length
  cat.cableOpt = (G, pid, len) => (G && (G.opts.find((o) => o.id === pid && (o.lv || null) === (len || null)) || (!len && G.opts.find((o) => o.id === pid && !o.lv)))) || null;
  // the length to add: the one searched for ("black lab sub 5m"), else the length used last, else the shortest of at least 1 m
  cat.pickOpt = (G, words) => {
    const want = (words || []).map((w) => /^(\d+(?:[.,]\d+)?)m?$/.exec(w)).filter(Boolean).map((m) => parseFloat(m[1].replace(',', '.')));
    const last = +HP.LS.get('cableLen', 0);
    return (want.length && G.opts.find((o) => want.includes(o.m))) || (last && G.opts.find((o) => o.m >= last)) || G.opts.find((o) => o.m >= 1) || G.opts[0];
  };
  cat.familyPick = (f) => { const last = +HP.LS.get('cableLen', 0); return (last && f.find((x) => cat.lenOf(x) >= last)) || f.find((x) => cat.lenOf(x) >= 1) || f[0]; };
  cat.dirtyCount = () => { const d = cat.draft; return Object.keys(d.products).length + d.delProducts.length + Object.keys(d.templates).length + d.delTemplates.length + (d.ignore || []).length; };
  cat.saveDraft = () => {
    if (!LS.set(HP.DRAFT_KEY, cat.draft)) HP.toast(HP.t('Browser storage is full. Publish or use smaller images.', 'Browserens lager er fuldt. Udgiv eller brug mindre billeder.'), { kind: 'err' });
    cat.rebuild(); HP.emit('catalog');
  };
  cat.putProduct = (p) => { const c = Object.assign({}, p); delete c._hay; cat.draft.products[p.id] = c; cat.draft.delProducts = cat.draft.delProducts.filter((x) => x !== p.id); cat.saveDraft(); };
  cat.ignoreSite = (sku) => { if (!sku) return; cat.draft.ignore = cat.draft.ignore || []; if (!cat.draft.ignore.includes(sku)) cat.draft.ignore.push(sku); cat.saveDraft(); };
  cat.removeProduct = (id) => { const p = cat.get(id); if (p && p.site) cat.ignoreSite(p.site); delete cat.draft.products[id]; if ((DATA.products || []).some((p) => p.id === id)) cat.draft.delProducts.push(id); cat.saveDraft(); };
  cat.putTemplate = (t) => { cat.draft.templates[t.id] = t; cat.draft.delTemplates = cat.draft.delTemplates.filter((x) => x !== t.id); cat.saveDraft(); };
  // systems: hifiklubben.dk's bundles (build/bundles.js), as parts lists of catalogue product ids. A card placed as part of a
  // system carries sy: <bundle SKU>; the price list prices every complete set of such cards at the bundle price.
  const sysBy = new Map();
  cat.systems = () => (DATA.bundles || []).filter((b) => b.parts.every((x) => cat.get(x.id)));
  cat.system = (sku) => { if (!sysBy.size) (DATA.bundles || []).forEach((b) => sysBy.set(b.sku, b)); return sysBy.get(sku) || null; };
  cat.systemName = (b) => (b.model.toLowerCase().startsWith(b.brand.toLowerCase()) ? b.model : b.brand + ' ' + b.model);
  cat.removeTemplate = (id) => { delete cat.draft.templates[id]; if ((DATA.templates || []).some((t) => t.id === id)) cat.draft.delTemplates.push(id); cat.saveDraft(); };
  cat.clearDraft = () => { cat.draft = emptyDraft(); cat.saveDraft(); };
  // a product as stored: without the search text, and with its campaign prices back if old prices switched them off (guardPrices)
  const unguard = (o) => (o && o._sale ? Object.assign({}, o, o._sale) : o);
  cat.clean = (p) => { const c = Object.assign({}, p, p._sale || {}); delete c._hay; delete c._ends; if (c.vars) c.vars = c.vars.map(unguard); if (c.lens) c.lens = c.lens.map(unguard); return c; };
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
  HP.catLabel = (c) => (HP.lang() === 'da' ? CAT_DA[c] || c : HP.tr(CAT_EN[c] || c));
  // the generated catalogue (test page): the website's category tree replaces the list above. Products carry their category path
  // in cats (e.g. ['/tv/', '/tv/projektor/']), so everything that groups by category works unchanged.
  if (DATA.categories) {
    const C = new Map(DATA.categories.map((x) => [x.id, x]));
    const top = (id) => { let x = C.get(id), g = 0; while (x && x.parent && g++ < 6) x = C.get(x.parent); return x ? x.id : id; };
    HP.CAT_TREE = DATA.categories.filter((x) => !x.parent).map((s) => [s.id, DATA.categories.filter((x) => x.parent && top(x.id) === s.id).map((x) => x.id)]);
    const legacy = HP.catLabel;
    HP.catLabel = (id) => { const x = C.get(id); return x ? (HP.lang() === 'da' ? x.title : x.en ? HP.tr(x.en) : x.title) : legacy(id); };
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
    ['id', 'brand', 'name', 'sku', 'img', 'in', 'out', 'cable', 'ends', 'eg', 'ech', 'bt', 'wifi', 'manualWireless', 'review', 'auto'].forEach((k) => { if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; });
    o.cats = (prev && prev.cats) || p.lcats || (DATA.categories ? [] : p.cats) || []; // today's (legacy) categories: the build's fallback
    const deep = DATA.categories ? HP.catDeepest(p.cats) : '';
    if (deep && deep !== p.wc) o.cat = deep; // a category chosen by hand (differs from the website's)
    const up = (s) => String(s || '').toUpperCase();
    if (prev && prev.link && (!p.site || up(prev.link.site) === up(p.site))) o.link = prev.link;
    else if (p.site && !p.gone && !(prev && prev.frozen && up(prev.frozen.site) === up(p.site))) o.link = { site: p.site }; // a new link (a frozen product stays frozen)
    if (o.ends && p.endsAuto) delete o.ends; // worked out by the build, not chosen by hand: not stored
    if (p.plugsAuto) { delete o.eg; delete o.ech; } // male/female and mono/stereo at the ends: the same
    if (!o.link) { const f = {}; ['price', 'was', 'vars', 'url', 'site', 'gone'].forEach((k) => { if (p[k] !== undefined && p[k] !== null) f[k] = p[k]; }); o.frozen = f; }
    return o;
  };

  /* ---------- document store ---------- */
  const blank = () => ({ v: 4, name: '', pages: 1, orient: 'landscape', ci: false, ciSize: 90, ms: 34, mk: [], sc: 0, items: [], conns: [], plan: null });
  // v2 -> v3: CI mode used to shrink every product to a thumbnail; it now places lettered marks. Old CI drawings become marks.
  const migrate = (doc) => {
    if ((doc.v || 2) < 3) migrate3(doc);
    { const mv = (id) => (id && HP.MOVED && HP.MOVED[id]) || id; // merged products (HP.MOVED): the drawing points at the product they became
      (doc.items || []).forEach((i) => { if (i.pid) i.pid = mv(i.pid); if (i.kind === 'mark' && i.k) i.k = mv(i.k); if (i.cable) i.cable = mv(i.cable); });
      (doc.conns || []).forEach((c) => { if (c.cable) c.cable = mv(c.cable); if (c.ad) c.ad = mv(c.ad); });
      if (Array.isArray(doc.mk)) doc.mk = doc.mk.map(mv); }
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
  // Undo history: each state is the drawing as JSON, with the time it was made (shown in the history list, Pn.history)
  let hist = [], fut = [], last = JSON.stringify(store.doc), lastT = Date.now();
  const push = () => { hist.push({ s: last, t: lastT }); if (hist.length > 120) hist.shift(); };
  store.commit = () => {
    const s = JSON.stringify(store.doc);
    if (s === last) { HP.emit('doc'); return; }
    push(); fut = []; last = s; lastT = Date.now(); if (!store.view) LS.set('doc', store.doc); HP.emit('doc');
  };
  const restore = (st) => {
    last = st.s; lastT = st.t; store.doc = JSON.parse(st.s); LS.set('doc', store.doc);
    const ids = new Set(store.doc.items.map((i) => i.id));
    store.sel = new Set([...store.sel].filter((id) => ids.has(id))); store.selConn = null; HP.emit('doc');
  };
  store.undo = () => { if (hist.length) { fut.push({ s: last, t: lastT }); restore(hist.pop()); } };
  store.redo = () => { if (fut.length) { hist.push({ s: last, t: lastT }); restore(fut.pop()); } };
  store.canUndo = () => hist.length > 0; store.canRedo = () => fut.length > 0;
  // all states oldest first (the undo steps, the current one, then the redo steps) and the index of the current one
  store.timeline = () => ({ states: [...hist, { s: last, t: lastT }, ...fut.slice().reverse()], cur: hist.length });
  // jump to a state of the timeline: several undos or redos in one go, emitting 'doc' once
  store.goTo = (j) => {
    let n = j - hist.length; if (!n) return;
    while (n < 0 && hist.length) { fut.push({ s: last, t: lastT }); const st = hist.pop(); last = st.s; lastT = st.t; n++; }
    while (n > 0 && fut.length) { hist.push({ s: last, t: lastT }); const st = fut.pop(); last = st.s; lastT = st.t; n--; }
    restore({ s: last, t: lastT });
  };
  store.load = (doc, planSrc) => {
    push(); fut = [];
    store.doc = migrate(Object.assign(blank(), doc)); if (planSrc !== undefined) store.planSrc = planSrc || null; // keep the image when none is given, so Undo can bring a plan back
    store.sel.clear(); store.selConn = null;
    last = JSON.stringify(store.doc); lastT = Date.now(); LS.set('doc', store.doc); store.savePlan(); HP.emit('doc'); HP.emit('loaded');
  };
  store.savePlan = () => { if (store.planSrc) { if (!LS.set('plan', store.planSrc)) HP.toast(HP.t('Floor plan is too large to autosave. Export the project to keep it.', 'Plantegningen er for stor til autosave. Eksportér projektet for at gemme den.'), { kind: 'warn' }); } else LS.del('plan'); };
  store.show = (doc) => { store.doc = migrate(Object.assign(blank(), doc)); store.view = true; HP.emit('doc'); }; // view only: never saved in this browser
  store.blank = blank;
  store.item = (id) => store.doc.items.find((i) => i.id === id);

  /* ---------- shareable links: the proposal packed into the URL (#p=...) ---------- */
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  // Compact link format ("c"): arrays instead of objects, item ids replaced by their position, coordinates in 10 px grid steps.
  const R = (v) => Math.round((v || 0) / 10);
  function compact(doc, S) {
    S = S || ((x) => x); // S: product ids written short for a QR code (cat.shortId), else as they are
    const items = doc.items.filter((i) => i.kind !== 'plan'), idx = new Map(items.map((i, n) => [i.id, n]));
    return [3, doc.name || '', doc.pages, doc.orient === 'portrait' ? 1 : 0, doc.ci ? 1 : 0, doc.ciSize, Math.round((doc.cardScale || 1) * 100),
      items.map((i) => i.kind === 'product' ? (() => { const r = [S(i.pid), R(i.x), R(i.y), i.face || 0, i.v || 0, (i.np ? 1 : 0) | (i.hid ? 2 : 0), i.sy || 0, i.len || 0, i.m || 0]; while (r.length > 4 && !r[r.length - 1]) r.pop(); return r; })() : i.kind === 'text' ? [1, R(i.x), R(i.y), R(i.w), R(i.h), i.title || '', i.body || ''].concat(i.noTitle || i.noBody || i.hid ? [(i.noTitle ? 1 : 0) + (i.noBody ? 2 : 0) + (i.hid ? 4 : 0)] : []) : i.kind === 'mark' ? [3, Math.round(i.x / 5), Math.round(i.y / 5), S(i.k)].concat(i.np || i.hid ? [(i.np ? 1 : 0) | (i.hid ? 2 : 0)] : []) : i.kind === 'legend' ? [4, R(i.x), R(i.y)] : i.kind === 'zone' ? [5, R(i.x), R(i.y), R(i.w), R(i.h), i.name || '']
        : i.kind === 'run' ? [6, Math.round(i.x / 5), Math.round(i.y / 5), S(i.cable) || 0, i.pts.flat().map((v) => Math.round(v / 5))] : [2, R(i.x), R(i.y)]),
      doc.conns.filter((c) => idx.has(c.a.item) && idx.has(c.b.item)).map((c) => { const r = [idx.get(c.a.item), c.a.key, idx.get(c.b.item), c.b.key], x = [S(c.cable) || 0, Math.round((c.shift || 0) / 5), c.lv || 0, c.m || 0, S(c.ad) || 0, c.lp != null ? Math.round(c.lp * 1000) + 1 : 0]; while (x.length && !x[x.length - 1]) x.pop(); return r.concat(x); }), // [.., cable, shift, length SKU, metres, adapter]
      [doc.ms || 34, (doc.mk || []).map(S), doc.sc || 0, 4].concat(doc.lite ? [1] : []), // 5th: a products-and-prices-only copy (HP.share.lite)
      doc.cv ? [doc.cv.c || '', doc.cv.s || '', doc.cv.sh || [], doc.cv.d || ''].concat(doc.cv.r === 0 ? [0] : []) : 0, // cover: customer, adviser, shop [name, phone, email], date
      doc.pr && HP.hasPr(doc.pr) ? doc.pr : 0, // price adjustments (prices and discounts for this proposal only)
      doc.po ? doc.po.map((o) => (o === 'portrait' ? 'P' : 'L')).join('') : 0]; // each page's orientation, when they differ
  }
  function expand(a) {
    if (!Array.isArray(a) || a[0] !== 3) throw new Error('bad link');
    const ids = a[7].map(() => HP.uid());
    const items = a[7].map((r, n) => typeof r[0] === 'string' ? Object.assign({ id: ids[n], kind: 'product', pid: r[0], x: r[1] * 10, y: r[2] * 10, face: r[3] || 0 }, r[4] ? { v: r[4] } : {}, r[5] & 1 ? { np: 1 } : {}, r[5] & 2 ? { hid: 1 } : {}, r[6] ? { sy: r[6] } : {}, r[7] ? { len: r[7] } : {}, r[8] ? { m: r[8] } : {})
      : r[0] === 1 ? { id: ids[n], kind: 'text', x: r[1] * 10, y: r[2] * 10, w: r[3] * 10, h: r[4] * 10, title: r[5], body: r[6], ...(r[7] & 1 ? { noTitle: true } : {}), ...(r[7] & 2 ? { noBody: true } : {}), ...(r[7] & 4 ? { hid: 1 } : {}) } : r[0] === 3 ? Object.assign({ id: ids[n], kind: 'mark', k: r[3], x: r[1] * 5, y: r[2] * 5 }, r[4] & 1 ? { np: 1 } : {}, r[4] & 2 ? { hid: 1 } : {}) : r[0] === 4 ? { id: ids[n], kind: 'legend', x: r[1] * 10, y: r[2] * 10 }
      : r[0] === 5 ? { id: ids[n], kind: 'zone', x: r[1] * 10, y: r[2] * 10, w: r[3] * 10, h: r[4] * 10, name: r[5] }
      : r[0] === 6 ? { id: ids[n], kind: 'run', x: r[1] * 5, y: r[2] * 5, cable: r[3] || null, pts: r[4].reduce((a, v, i) => { if (i % 2) a[a.length - 1].push(v * 5); else a.push([v * 5]); return a; }, []) }
      : { id: ids[n], kind: 'prices', x: r[1] * 10, y: r[2] * 10 });
    const conns = a[8].map((r) => ({ id: HP.uid(), a: { item: ids[r[0]], key: r[1] }, b: { item: ids[r[2]], key: r[3] }, cable: r[4] || null, shift: (r[5] || 0) * 5, ...(r[6] ? { lv: r[6] } : {}), ...(r[7] ? { m: r[7] } : {}), ...(r[8] ? { ad: r[8] } : {}), ...(r[9] ? { lp: (r[9] - 1) / 1000 } : {}) }));
    const cv = a[10] ? { c: a[10][0], s: a[10][1], sh: a[10][2], d: a[10][3], r: a[10][4] === 0 ? 0 : 1 } : null;
    return Object.assign(cv ? { cv } : {}, a[11] ? { pr: a[11] } : {}, a[9] && a[9][4] ? { lite: 1 } : {}, a[12] ? { po: [...a[12]].map((c) => (c === 'P' ? 'portrait' : 'landscape')) } : {}, { v: a[9] ? a[9][3] || 3 : 2, name: a[1], pages: a[2], orient: a[3] ? 'portrait' : 'landscape', ci: !!a[4], ciSize: a[5], cardScale: a[6] / 100, items, conns, plan: null }, a[9] ? { ms: a[9][0], mk: a[9][1], sc: a[9][2] || 0 } : {});
  }
  // price adjustments: does the proposal have any (a line's price or discount, or a total discount)?
  HP.hasPr = (pr) => !!pr && (!!(pr.ta || pr.tp) || Object.values(pr.l || {}).some((x) => x && (x.p != null || x.d || x.r)));
  /* QR format ("Q", 2026-11-25): the compact proposal with short product ids, deflated, written in base 43 (0-9 A-Z $ * + - . / :).
     Those are QR alphanumeric characters (5.5 bits each against 8 for base64 in byte mode) and all allowed in a URL's #fragment, so
     the same proposal makes a much smaller QR code. Short ids: '~' and 6 characters of a hash of the product id (cat.shortId), only
     for ids whose hash is unique in the catalogue; the customer's page loads the catalogue anyway and turns them back. */
  const B43 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:';
  const b43 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 2) { if (i + 1 < bytes.length) { const n = bytes[i] * 256 + bytes[i + 1]; s += B43[n % 43] + B43[Math.floor(n / 43) % 43] + B43[Math.floor(n / 1849)]; } else s += B43[bytes[i] % 43] + B43[Math.floor(bytes[i] / 43)]; } return s; };
  const unb43 = (s) => { const out = []; for (let i = 0; i < s.length; i += 3) { const c = s.slice(i, i + 3), v = [...c].map((x) => B43.indexOf(x)); if (v.some((x) => x < 0)) throw new Error('bad link'); if (c.length === 3) { const n = v[0] + v[1] * 43 + v[2] * 1849; out.push(n >> 8, n & 255); } else out.push(v[0] + v[1] * 43); } return new Uint8Array(out); };
  const unshort = (doc) => {
    const L = (x) => (typeof x === 'string' && x[0] === '~' ? cat.fromShort(x) || x : x);
    doc.items.forEach((i) => { if (i.pid) i.pid = L(i.pid); if (i.k) i.k = L(i.k); if (i.cable) i.cable = L(i.cable); });
    doc.conns.forEach((c) => { if (c.cable) c.cable = L(c.cable); if (c.ad) c.ad = L(c.ad); });
    if (Array.isArray(doc.mk)) doc.mk = doc.mk.map(L);
    return doc;
  };
  HP.share = {
    async pack(doc, qr) {
      const bytes = new TextEncoder().encode(JSON.stringify(compact(doc, qr ? cat.shortId : null)));
      if (qr && window.CompressionStream) return 'Q' + b43(await pipe(bytes, new CompressionStream('deflate-raw')));
      return window.CompressionStream ? 'c' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))) : 'k' + b64u(bytes);
    },
    async unpack(s) {
      const kind = s[0], bytes = kind === 'Q' ? unb43(decodeURIComponent(s.slice(1))) : unb64u(s.slice(1));
      const raw = kind === 'z' || kind === 'c' || kind === 'Q' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
      const data = JSON.parse(new TextDecoder().decode(raw));
      const doc = kind === 'Q' ? unshort(expand(data)) : kind === 'c' || kind === 'k' ? expand(data) : data; // 'z' / 'j' = first version of links, still supported
      if (!doc || !Array.isArray(doc.items) || !Array.isArray(doc.conns)) throw new Error('bad link');
      return doc;
    },
    async url() { return location.href.split('#')[0] + '#p=' + (await HP.share.pack(store.doc)); },
    // a much smaller copy for a QR code that cannot hold the whole drawing: only what the price list counts (product cards and
    // marks with their variant, length and flags, the cables and adapters on connections, cable runs), without positions, text,
    // rooms or the price-list box. The customer's page then shows the products and prices without the drawing.
    lite(doc) {
      const keep = new Set(['product', 'mark', 'run']), items = doc.items.filter((i) => keep.has(i.kind)).map((i) => i.kind === 'run' ? i : Object.assign({}, i, { x: 0, y: 0 }));
      const ids = new Set(items.map((i) => i.id));
      const conns = doc.conns.filter((c) => (c.cable || c.ad) && ids.has(c.a.item) && ids.has(c.b.item)).map((c) => Object.assign({}, c, { shift: 0, lp: null }));
      return Object.assign({}, doc, { items, conns, lite: 1, name: doc.name });
    },
    // the customer's link (#t=): the read-only proposal view, no login; on the public site even when printed from a local copy
    // the customer's link: #t= when copied and sent, #q= in the QR code on the printed cover (the same page; the letter only tells
    // the statistics how the customer got there)
    // ?l=<language> when the planner is not in Danish, so the customer's page opens in the seller's language; ?pdf for the
    // clickable link in the printed PDF (see js/cover.js)
    async customerUrl(doc, qr, pdf) {
      const base = (/^https?:/.test(location.protocol) ? location.href.split('#')[0] : ((DATA.config || {}).publicUrl || 'https://hifiplanner.dk/v2/')).split('?')[0];
      const q = [pdf ? 'pdf' : '', lang !== 'da' ? 'l=' + lang : ''].filter(Boolean).join('&');
      return base + (q ? '?' + q : '') + (qr ? '#q=' : '#t=') + (await HP.share.pack(doc || store.doc, qr));
    },
    async openFromHash() {
      const m = /^#p=(.+)$/.exec(location.hash); if (!m) return false;
      history.replaceState(null, '', location.href.split('#')[0]);
      try { store.load(await HP.share.unpack(m[1])); HP.toast(HP.t('Opened the shared proposal.', 'Åbnede det delte tilbud.'), { kind: 'ok', ms: 7000, action: { label: HP.t('Undo', 'Fortryd'), fn: store.undo } }); return true; }
      catch (e) { HP.toast(HP.t('That link could not be opened.', 'Linket kunne ikke åbnes.'), { kind: 'err' }); return false; }
    },
  };
  HP.priceSyncText = () => HP.pricesAt() ? HP.t('Prices read from hifiklubben.dk ', 'Priser hentet fra hifiklubben.dk ') + HP.pricesStamp() : '';
  /* Open tabs stay up to date: every 5 minutes (and when the tab comes back into view) build/stamp.json says when the newest
     catalogue's prices were read; when that is newer than the loaded one, the catalogue is loaded again in place (no reload, the
     drawing stays) and everything is redrawn. Once a minute the age is checked, so campaign prices go off when they get too old. */
  const loadScript = (src) => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now(); el.onload = () => { el.remove(); ok(); }; el.onerror = () => { el.remove(); no(new Error(src)); }; document.head.append(el); });
  let checking = false;
  HP.checkCatalogue = async (quiet) => {
    if (checking || !DATA.categories || location.protocol === 'file:') return false; // only the generated catalogue (build/) has a stamp
    checking = true;
    try {
      const r = await fetch('build/stamp.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return false;
      const st = await r.json(), now = HP.pricesAt(), at = st.pricesAt ? new Date(st.pricesAt) : null;
      if (!at || isNaN(at) || (now && at <= now)) return false;
      await loadScript('build/app-products.js'); await loadScript('build/bundles.js').catch(() => {});
      sysBy.clear(); cat.rebuild(); HP.emit('catalog'); HP.emit('prices');
      if (!quiet) HP.toast(HP.t('Prices updated from hifiklubben.dk (read ', 'Priserne er opdateret fra hifiklubben.dk (hentet ') + HP.pricesStamp() + ').', { kind: 'ok', ms: 5000 });
      return true;
    } catch (e) { return false; } finally { checking = false; }
  };
  setInterval(() => HP.checkCatalogue(), 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) HP.checkCatalogue(); });
  setInterval(() => { if (HP.pricesStale() !== guarded) { cat.rebuild(); HP.emit('catalog'); } HP.emit('prices'); }, 60000);

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
