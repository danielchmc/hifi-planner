/* HiFi Planner v2 — the customer's proposal.
   - Print dialog (the Print button, Ctrl+P, F4): the customer's name, and whether to print a cover page first.
   - Cover page: HiFi Klubben, the proposal's name, "Til <customer>", every line with its price, total and saving, the adviser and
     the shop, and a QR code to the customer view. The customer's name, adviser and shop go into the proposal (doc.cv) so the
     customer view can show them.
   - Customer view (#t=… links, opened from the QR code): the cover and the drawing pages, read only, sized for a phone, no login.
     It never saves anything in the browser that opens it.
   - Order lines (CSV): SKU, description, quantity, unit price, before price, discount and amount per line, in the format Danish
     Excel opens directly: a first step toward a sales quote in Business Central. */
(function () {
  const HP = window.HP, { h, t, store, LS } = HP;
  const C = () => HP.canvas, icon = (n, s) => HP.icon(n, s);
  const MAX_QR_VERSION = 25; // denser codes are hard to scan from paper: then the cover says to ask for the link instead

  // the cover itself: also used, without the QR code, at the top of the customer view
  function build(o) {
    const d = store.doc, cv = d.cv || {}, sh = cv.sh || [], { list, total, saving } = C().priceRows();
    const pct = (r) => Math.round((1 - r.price / r.was) * 100);
    return h('.cover', null,
      h('.cv-head', null, h('span.cv-logo', { html: HP.klubbenSvg() }), h('.cv-meta', null, h('b', null, t('Proposal', 'Tilbud')), h('span', null, cv.d || HP.today()))),
      h('.cv-title', null, h('h1', null, d.name || t('Your proposal', 'Dit tilbud')), cv.c ? h('p', null, t('For ', 'Til ') + cv.c) : null),
      h('table.cv-lines', null, list.map((r) => h('tr', null,
        h('td.q', null, r.qty + (r.cableM ? ' m' : '×')),
        h('td', null, h('span.nm', null, r.name), r.sys ? h('small', null, r.parts) : null, r.was ? h('em', null, t('Save ', 'Spar ') + pct(r) + '%') : null),
        h('td.p', null, r.was ? h('s', null, HP.money(r.was * r.qty)) : null, h('span', null, HP.money(r.price * r.qty)))))),
      h('.cv-total', null, h('span', null, 'Total'), h('b', null, HP.money(total))),
      saving > 0 ? h('.cv-saving', null, h('span', null, t('You save', 'Du sparer')), h('b', null, HP.money(saving))) : null,
      h('.cv-foot', null,
        h('.cv-contact', null, h('small', null, t('Your adviser', 'Din rådgiver')), h('b', null, cv.s || ''), h('span', null, sh[0] || ''),
          sh[1] ? h('span', null, t('Tel. ', 'Tlf. ') + sh[1]) : null, sh[2] ? h('span', null, sh[2]) : null),
        o && o.qr ? h('.cv-qr', null, h('span', { html: o.qr }), h('span.cv-qrtext', null, h('b', null, t('Scan to see your proposal on your phone', 'Scan og se dit tilbud på mobilen')),
          h('small', null, t('Drawing, products and prices, with links to hifiklubben.dk', 'Tegning, produkter og priser, med links til hifiklubben.dk'))))
          : o && o.qrTooBig ? h('.cv-qr.none', null, h('small', null, t('Ask your adviser for a link to this proposal.', 'Bed din rådgiver om et link til tilbuddet.'))) : null),
      h('.cv-note', null, t('Prices valid on ', 'Priser gælder d. ') + (cv.d || HP.today()) + t('. Subject to misprints and stock.', '. Med forbehold for trykfejl og udsolgte varer.')));
  }

  // what the cover needs to know, kept in the proposal (and in its links)
  function stamp(customer) {
    const sp = HP.shopProfile ? HP.shopProfile() : {}, seller = HP.seller ? HP.seller() : null;
    store.doc.cv = { c: customer || '', s: (seller && seller.name) || '', sh: [sp.name || '', sp.phone || '', sp.email || ''], d: HP.today() };
    store.commit();
  }
  async function qrFor() {
    const url = await HP.share.customerUrl();
    try { const m = HP.qr.matrix(url, 'M'); if (m.version > MAX_QR_VERSION) return { qrTooBig: true, url }; return { qr: HP.qr.svg(url, { ecc: 'M', cls: 'qr' }), url }; }
    catch (e) { return { qrTooBig: true, url }; }
  }

  /* ---------- print dialog ---------- */
  function dialog() {
    const d = store.doc;
    const name = h('input', { placeholder: t('e.g. Mette and Lars Jensen', 'f.eks. Mette og Lars Jensen'), value: (d.cv && d.cv.c) || '', autofocus: true,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } } });
    const withCover = h('input', { type: 'checkbox', checked: LS.get('cover', true) });
    const go = async () => {
      LS.set('cover', withCover.checked); stamp(name.value.trim()); close();
      if (!withCover.checked) return C().print();
      C().print({ cover: build(await qrFor()) });
    };
    const close = HP.modal({ title: t('Print proposal', 'Print tilbud'), size: 'sm', body: h('.form', null,
      h('label', null, t('Customer', 'Kunde'), name),
      h('label.check', null, withCover, h('span', null, t('Cover page with the total and a QR code for the customer', 'Forside med total og QR-kode til kunden'))),
      h('p.muted', null, t('The QR code opens the proposal on the customer’s phone: read only, no login.', 'QR-koden åbner tilbuddet på kundens mobil: kun til visning, uden login.'))),
      foot: [h('button.btn', { onclick: () => { stamp(name.value.trim()); csv(); } }, icon('download', 14), t('Order lines (CSV)', 'Ordrelinjer (CSV)')), h('.spacer'),
        h('button.btn', { onclick: () => close() }, t('Cancel', 'Annuller')), h('button.btn.primary', { onclick: go }, icon('print', 14), t('Print', 'Print'))] });
  }

  /* ---------- order lines ---------- */
  function csv() {
    const { list, total } = C().priceRows(), d = store.doc, cv = d.cv || {};
    const num = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
    const cell = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['Varenr', 'Beskrivelse', 'Antal', 'Enhed', 'Enhedspris', 'Førpris', 'Rabat %', 'Beløb']];
    list.forEach((r) => rows.push([r.sku || '', r.name, r.qty, r.cableM ? 'm' : (r.sys ? 'system' : 'stk'), num(r.price), r.was ? num(r.was) : '', r.was ? Math.round((1 - r.price / r.was) * 100) : '', num(r.price * r.qty)]));
    rows.push(['', 'Total', '', '', '', '', '', num(total)]);
    const head = ['# ' + (d.name || 'Tilbud') + (cv.c ? ' · ' + cv.c : '') + ' · ' + (cv.s || '') + ' · ' + (cv.d || HP.today())];
    const text = '﻿' + head.concat(rows.map((r) => r.map(cell).join(';'))).join('\r\n') + '\r\n';
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: ((d.name || 'tilbud') + ' ' + HP.today()).replace(/[^\wæøåÆØÅ .-]+/g, '').trim() + '.csv' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    HP.toast(list.length + t(' order lines exported', ' ordrelinjer eksporteret'), { kind: 'ok' });
  }

  /* ---------- customer view (#t=) ---------- */
  async function viewer(payload) {
    document.body.classList.add('viewing');
    const host = h('#viewhost'); document.body.append(host); // the canvas is drawn off screen, only its pages are shown
    C().init(host);
    let doc;
    try { doc = await HP.share.unpack(payload); } catch (e) { document.body.append(h('.view-err', null, t('This link could not be opened.', 'Linket kunne ikke åbnes.'))); return; }
    store.show(doc); C().render();
    const cv = doc.cv || {};
    const page = h('#view', null,
      h('header.view-bar', null, h('span.cv-logo', { html: HP.klubbenSvg() }), h('span', null, (cv.sh && cv.sh[0]) || 'HiFi Klubben')),
      h('.view-cover', null, build(null)),
      h('h2.view-h', null, t('The drawing', 'Tegningen')));
    const pages = h('.view-pages'); page.append(pages);
    document.body.append(page);
    // the A4 sheets, scaled to the width of the screen
    await new Promise((r) => setTimeout(r, 60));
    const { sheets } = C().sheets();
    const fit = () => pages.querySelectorAll('.view-sheet').forEach((w) => { const sh = w.firstChild, k = Math.min(1, w.clientWidth / sh.offsetWidth); sh.style.transform = 'scale(' + k + ')'; w.style.height = sh.offsetHeight * k + 'px'; });
    sheets.forEach((sh) => pages.append(h('.view-sheet', null, sh)));
    fit(); window.addEventListener('resize', fit);
    document.title = (doc.name || t('Proposal', 'Tilbud')) + ' · HiFi Klubben';
  }

  HP.cover = { build, dialog, csv, viewer, stamp };
})();
