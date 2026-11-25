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

  // "23/11/2026" → "23. november 2026" (in the page's language)
  const longDate = (d) => { const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(d || HP.today()); return m ? new Date(+m[3], +m[2] - 1, +m[1]).toLocaleDateString(HP.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : d; };
  const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

  // when the prices were read from the website (not today's date: the prices may be older than the printout)
  const priceNote = () => t('Prices from hifiklubben.dk on ', 'Priser fra hifiklubben.dk pr. ') + HP.pricesStamp() + t('. Subject to misprints and stock.', '. Med forbehold for trykfejl og udsolgte varer.')
    + (HP.pricesGuarded() ? t(' Campaign prices are not shown.', ' Kampagnepriser er ikke vist.') : '');
  // the cover itself: also used, without the QR code, at the top of the customer view ({ view: true })
  function build(o) {
    const d = store.doc, cv = d.cv || {}, sh = cv.sh || [], { list, total, saving, sub, tdisc, tpct } = C().priceRows();
    const pct = (r) => Math.round((1 - r.amount / (r.was * r.qty)) * 100);
    return h('.cover', null,
      h('.cv-head', null, h('span.cv-logo', { html: HP.klubbenSvg() }), h('.cv-meta', null, h('b', null, t('Proposal', 'Tilbud')), h('span', null, o && o.view ? longDate(cv.d) : cv.d || HP.today()))),
      h('.cv-title', null, h('h1', null, d.name || t('Your proposal', 'Dit tilbud')), cv.c ? h('p', null, t('For ', 'Til ') + cv.c) : null),
      h('table.cv-lines', null, list.map((r) => h('tr', null,
        o && o.view ? h('td.th', null, r.img ? HP.imgEl(r.img, 'thumb', { loading: 'lazy' }) : null) : null,
        h('td.q', null, r.qty + (r.cableM ? ' m' : '×')),
        h('td', null, r.url ? h('a.nm', { href: r.url, target: '_blank', rel: 'noopener' }, r.name, h('span.cv-go', null, ' ↗')) : h('span.nm', null, r.name), r.sys ? h('small', null, r.parts) : null, r.was ? h('em', null, t('Save ', 'Spar ') + pct(r) + '%') : null),
        h('td.p', null, r.noPrice ? h('span', null, t('Price on request', 'Pris oplyses i butikken')) : [r.was ? h('s', null, HP.money(r.was * r.qty)) : null, h('span', null, HP.money(r.amount))])))),
      tdisc ? h('.cv-total.cv-sub', null, h('span', null, t('Subtotal', 'Subtotal')), h('b', null, HP.money(sub))) : null,
      tdisc ? h('.cv-total.cv-disc', null, h('span', null, t('Discount', 'Rabat') + (tpct ? ' ' + String(tpct).replace('.', ',') + ' %' : '')), h('b', null, '−' + HP.money(tdisc))) : null,
      h('.cv-total', null, h('span', null, t('Total', 'Total')), h('b', null, HP.money(total))),
      saving > 0 ? h('.cv-saving', null, h('span', null, t('You save', 'Du sparer')), h('b', null, HP.money(saving))) : null,
      h('.cv-foot', null,
        h('.cv-contact', null, h('small', null, t('Your adviser', 'Din rådgiver')), h('b', null, cv.s || ''), h('span', null, sh[0] || ''),
          sh[1] ? h('span', null, t('Tel. ', 'Tlf. ') + sh[1]) : null, sh[2] ? h('span', null, sh[2]) : null),
        o && o.qr ? h('.cv-qr', null, h('span', { html: o.qr }), h('span.cv-qrtext', null, h('b', null, t('Scan to see your proposal on your phone', 'Scan og se dit tilbud på mobilen')),
          h('small', null, o.lite ? t('Products and prices, with links to hifiklubben.dk', 'Produkter og priser, med links til hifiklubben.dk') : t('Drawing, products and prices, with links to hifiklubben.dk', 'Tegning, produkter og priser, med links til hifiklubben.dk')),
          // the same page as a link, for a customer reading the PDF on a screen (clickable in the PDF)
          o.link ? h('a.cv-link', { href: o.link, target: '_blank', rel: 'noopener' }, t('Or open it here: see the proposal online ↗', 'Eller åbn det her: se tilbuddet online ↗')) : null))
          : o && o.qrTooBig ? h('.cv-qr.none', null, h('small', null, t('Ask your adviser for a link to this proposal.', 'Bed din rådgiver om et link til tilbuddet.')),
            o.link ? h('a.cv-link', { href: o.link, target: '_blank', rel: 'noopener' }, t('In the PDF: see the proposal online ↗', 'I PDF\'en: se tilbuddet online ↗')) : null) : null),
      h('.cv-note', null, priceNote()));
  }

  // what the cover needs to know, kept in the proposal (and in its links)
  function stamp(customer, related) {
    const sp = HP.shopProfile ? HP.shopProfile() : {}, seller = HP.seller ? HP.seller() : null;
    store.doc.cv = { c: customer || '', s: (seller && seller.name) || '', sh: [sp.name || '', sp.phone || '', sp.email || ''], d: HP.today(), r: related === false ? 0 : 1 };
    store.commit();
  }
  /* The cover always gets a QR code. The whole proposal travels inside the link, so a big one makes a dense code; tried in turn:
       1. the whole proposal (drawing included), error correction M, up to version 25 (38 mm on paper)
       2. the same with error correction L (7 % instead of 15 % repair: fine on a clean printout), up to version 30, printed larger
       3. products and prices only (HP.share.lite: no drawing), M up to version 25, then L up to version 40, printed larger
     The printed size keeps every module at least 0.3 mm, which phones read from paper. Only a proposal far beyond any real one
     (some hundred different products) gets no code, and then the cover says to ask for the link. */
  async function qrFor() {
    // QR: #q=. The clickable link in the PDF: #t=, with ?pdf before it. Without it, the link is the page being printed plus a
    // different #…, which Chrome/Edge treat as a jump inside the document and leave out of the PDF.
    const link = await HP.share.customerUrl(null, false, true), full = await HP.share.customerUrl(null, true);
    const lite = await HP.share.customerUrl(HP.share.lite(store.doc), true);
    const tries = [[full, 'M', MAX_QR_VERSION, false], [full, 'L', 30, false], [lite, 'M', MAX_QR_VERSION, true], [lite, 'L', 40, true]];
    // the link's payload (after #q=) is written in QR alphanumeric characters (HP.share.pack with qr): encoded as its own segment
    const segs = (url) => { const i = url.indexOf('#q=') + 3, tail = url.slice(i); return /^[0-9A-Z$*+\-./:]+$/.test(tail) ? [{ text: url.slice(0, i) }, { text: tail, alnum: true }] : url; };
    for (const [url, ecc, max, isLite] of tries) {
      try {
        const m = HP.qr.matrix(segs(url), ecc); if (m.version > max) continue;
        const mm = Math.max(38, Math.ceil((m.size + 8) * 0.31)); // at least 0.31 mm per module (with the quiet zone)
        return { qr: HP.qr.svg(segs(url), { ecc, cls: 'qr', mm }), url, link, lite: isLite };
      } catch (e) { /* too long for this setting: try the next */ }
    }
    return { qrTooBig: true, url: full, link };
  }

  /* ---------- Send til kunden (2026-11-25) ----------
     The one place for everything that goes to the customer: the top bar's orange "Send til kunden" button (also Ctrl+P and F4).
     The customer's name and what to include, then print / save as PDF (with the cover and its QR code), or the customer's link to
     copy into an email or a text message, or to look at first. Order lines (CSV) for the till sit in the foot. */
  function dialog() {
    const d = store.doc;
    if (!d.items.length) return HP.toast(t('The canvas is empty. Add something first.', 'Lærredet er tomt. Tilføj noget først.'), { kind: 'warn' });
    const name = h('input', { placeholder: t('e.g. Mette and Lars Jensen', 'f.eks. Mette og Lars Jensen'), value: (d.cv && d.cv.c) || '', autofocus: true,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } } });
    const withCover = h('input', { type: 'checkbox', checked: LS.get('cover', true) });
    const withRel = h('input', { type: 'checkbox', checked: LS.get('coverRel', true) });
    const st = () => { LS.set('coverRel', withRel.checked); stamp(name.value.trim(), withRel.checked); };
    const go = async () => {
      LS.set('cover', withCover.checked); close();
      await HP.checkCatalogue(true); // the newest prices, if a newer catalogue is out since the page was opened
      st();
      { // what the proposal is worth: its total, how many products, and whether it has a system or a floor plan
        const pr = C().priceRows(), d = store.doc, prods = d.items.filter((i) => i.kind === 'product');
        HP.stat('Print', { forside: withCover.checked ? 'ja' : 'nej', relaterede: withRel.checked ? 'ja' : 'nej',
          vaerdi: Math.round(pr.total), produkter: prods.length, system: prods.some((i) => i.sy) ? 'ja' : 'nej', plantegning: d.items.some((i) => i.kind === 'plan') || d.ci ? 'ja' : 'nej' });
      }
      if (!withCover.checked) return C().print();
      C().print({ cover: build(await qrFor()) });
    };
    // the customer's link: with the name and choices above in it
    const copyLink = async () => {
      st(); await HP.checkCatalogue(true);
      const url = await HP.share.customerUrl();
      try { await navigator.clipboard.writeText(url); } catch (e) { prompt(t('Copy the link:', 'Kopiér linket:'), url); }
      HP.stat('Kundelink kopieret'); HP.toast(t('Customer link copied: paste it into an email or a text message', 'Kundelink kopieret: sæt det ind i en mail eller en sms'), { kind: 'ok' });
    };
    const preview = async () => { const w = window.open('', '_blank'); st(); const url = await HP.share.customerUrl(); if (w) w.location.href = url; else location.href = url; };
    const drafts = d.items.some((i) => i.kind === 'product' && HP.catalog.draft.products[i.pid]);
    const close = HP.modal({ title: t('Send to the customer', 'Send til kunden'), size: 'md', body: h('.form.send', null,
      h('.share-who.customer', null, icon('user', 15), h('b', null, t('For the customer', 'Til kunden')), h('span', null, t('read only, on any phone, no login', 'kun visning, på enhver mobil, uden login'))),
      h('label', null, t('Customer', 'Kunde'), name),
      h('label.check', null, withCover, h('span', null, t('Cover page with the total and a QR code for the customer', 'Forside med total og QR-kode til kunden'))),
      h('label.check', null, withRel, h('span', null, t('Show related products on the customer’s page', 'Vis relaterede produkter på kundens side'))),
      // old prices: campaign prices are off, and the seller should check the till
      HP.pricesGuarded() ? h('.note-box.warn', null, icon('warn', 15), h('span', null, t('The prices are {} old (read {}), so campaign prices are not shown. Check the prices in the till before you promise them.', 'Priserne er {} gamle (hentet {}), så kampagnepriser vises ikke. Tjek priserne i kassen, før du lover dem.').replace('{}', HP.pricesAgeText()).replace('{}', HP.pricesStamp()))) : null,
      // a reminder: the proposal has price adjustments (e.g. a colleague's link or an older proposal)
      (() => { const ps = HP.panels.priceState(); return ps && ps.active ? h('.pp-note', null, icon('tag', 14), h('span', null, t('This proposal has price adjustments: ', 'Tilbuddet har prisjusteringer: '), h('b', null, ps.text), t(' in all', ' i alt')),
        h('button.linkbtn', { onclick: () => { close(); HP.panels.projectPrices(); } }, t('Edit', 'Rediger'))) : null; })(),
      drafts ? h('.note-box', null, icon('warn', 15), t('This canvas uses products you have not published yet. They will show as unknown for others until you publish.', 'Lærredet bruger produkter, du ikke har udgivet endnu. De vises som ukendte for andre, indtil du udgiver.')) : null,
      h('.send-ways', null,
        h('.send-way', null, h('b', null, icon('print', 15), t('Print or PDF', 'Print eller PDF')),
          h('p.muted', null, t('Prints what is inside the A4 frames, with the cover first. Choose "Save as PDF" in the print dialog to email it.', 'Printer det, der ligger inden for A4-rammerne, med forsiden først. Vælg "Gem som PDF" i printdialogen for at maile den.')),
          h('button.btn.primary', { onclick: go }, icon('print', 14), t('Print / PDF', 'Print / PDF'))),
        h('.send-way', null, h('b', null, icon('link', 15), t('Link for the customer', 'Link til kunden')),
          h('p.muted', null, t('The proposal on the customer’s phone: the drawing, products and prices, and how to reach you. The same page as the QR code.', 'Tilbuddet på kundens mobil: tegningen, varerne og priserne, og hvordan du kontaktes. Den samme side som QR-koden.')),
          h('.row', null, h('button.btn.primary', { onclick: copyLink }, icon('copy', 14), t('Copy customer link', 'Kopiér kundelink')),
            h('button.btn', { onclick: preview }, icon('eye', 14), t('See it', 'Se den')))))),
      foot: [h('button.btn', { onclick: () => { st(); csv(); HP.stat('Ordrelinjer (CSV)'); } }, icon('download', 14), t('Order lines (CSV)', 'Ordrelinjer (CSV)')), h('.spacer'),
        h('button.btn', { onclick: () => close() }, t('Close', 'Luk'))] });
  }

  /* ---------- order lines ---------- */
  function csv() {
    const { list, total, tdisc } = C().priceRows(), d = store.doc, cv = d.cv || {};
    const num = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
    const cell = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    // as a Business Central sales line: unit price (the website's, or the one set in Prisjusteringer) and a line discount amount, which
    // includes the line's share of a total discount, so the lines add up to the total
    const rows = [['Varenr', 'Beskrivelse', 'Antal', 'Enhed', 'Førpris', 'Enhedspris', 'Linjerabat beløb', 'Linjerabat %', 'Beløb']];
    list.forEach((r) => { const ld = r.ldisc + r.tshare, gross = r.price * r.qty;
      rows.push([r.sku || '', r.name, r.qty, r.cableM ? 'm' : (r.sys ? 'system' : 'stk'), r.was ? num(r.was) : '', num(r.price), ld ? num(ld) : '', ld && gross ? num(ld / gross * 100) : '', num(gross - ld)]); });
    rows.push(['', 'Total', '', '', '', '', '', '', num(total)]);
    if (tdisc) rows.push(['', '# Heraf totalrabat ' + num(tdisc) + ' kr., fordelt på linjerne efter beløb', '', '', '', '', '', '', '']);
    const head = ['# ' + (d.name || 'Tilbud') + (cv.c ? ' · ' + cv.c : '') + ' · ' + (cv.s || '') + ' · ' + (cv.d || HP.today())];
    const text = '﻿' + head.concat(rows.map((r) => r.map(cell).join(';'))).join('\r\n') + '\r\n';
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: ((d.name || 'tilbud') + ' ' + HP.today()).replace(/[^\wæøåÆØÅ .-]+/g, '').trim() + '.csv' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    HP.toast(list.length + t(' order lines exported', ' ordrelinjer eksporteret'), { kind: 'ok' });
  }

  /* ---------- customer view (#t=) ---------- */
  async function viewer(payload) {
    document.documentElement.dataset.theme = 'light'; // the customer always sees the light version, whatever the browser last used (not saved)
    document.body.classList.add('viewing');
    HP.useLang(new URLSearchParams(location.search).get('l') || 'da'); // the seller's language when the link was made (?l=), else Danish; never the phone's
    const host = h('#viewhost'); document.body.append(host); // the canvas is drawn off screen, only its pages are shown
    C().init(host);
    let doc;
    try { doc = await HP.share.unpack(payload); } catch (e) { document.body.append(h('.view-err', null, t('This link could not be opened.', 'Linket kunne ikke åbnes.'))); return; }
    store.show(doc); C().render();
    const cv = doc.cv || {}, sh = cv.sh || [], shop = sh[0] || 'HiFi Klubben', who = firstName(cv.s);
    // ways to reach the adviser: tap to call or write
    const tel = (sh[1] || '').replace(/[^\d+]/g, ''), subj = t('My proposal', 'Mit tilbud') + (doc.name ? ': ' + doc.name : '');
    const reach = () => h('.view-reach', null,
      tel ? h('a.view-btn', { href: 'tel:' + tel }, HP.icon('phone', 16), t('Call ', 'Ring til ') + (who || t('us', 'os'))) : null,
      sh[2] ? h('a.view-btn', { href: 'mailto:' + sh[2] + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(t('Hi', 'Hej') + (who ? ' ' + who : '') + ',\n\n') }, HP.icon('mail', 16), t('Write an email', 'Skriv en mail')) : null);
    const page = h('#view', null,
      h('header.view-bar', null, h('span.cv-logo', { html: HP.klubbenSvg() }), h('span', null, shop)),
      h('section.view-hello', null,
        h('h1', null, t('Hi', 'Hej') + (cv.c ? ' ' + cv.c : '') + '!'),
        h('p', null, t('Thank you for visiting ', 'Tak for besøget i ') + shop + t('. Here is the proposal we talked about, with a drawing of how it all fits together. If you have any questions, you are always welcome to call or write.', '. Her er tilbuddet, vi talte om, med tegningen af, hvordan det hele hænger sammen. Har du spørgsmål, er du altid velkommen til at ringe eller skrive.')),
        who ? h('p.view-sign', null, t('Kind regards ', 'Venlig hilsen '), h('b', null, cv.s)) : null,
        reach()),
      h('.view-cover', null, build({ view: true })),
      // a QR code that could only hold the products and prices (a very big proposal): no drawing on this page
      doc.lite ? h('p.view-sub', null, t('The drawing was too big for the QR code. Ask your adviser for the full proposal with the drawing.', 'Tegningen var for stor til QR-koden. Bed din rådgiver om hele tilbuddet med tegningen.')) : [
        h('h2.view-h', null, t('How it all fits together', 'Sådan hænger det sammen')),
        h('p.view-sub', null, t('Pinch with two fingers to zoom in. Tap a product name to see it on hifiklubben.dk.', 'Knib med to fingre for at zoome ind. Tryk på et produktnavn for at se det på hifiklubben.dk.'))]);
    const pages = h('.view-pages'); page.append(pages);
    document.body.append(page);
    // the A4 sheets, scaled to the width of the screen. The wires are worked out from the cards' layout at zoom 1, after the fonts
    // have arrived (a phone on a slow line gets them late), and drawn again if a font or picture arrives later still
    const fit = () => pages.querySelectorAll('.view-sheet').forEach((w) => { const sh = w.firstChild, k = Math.min(1, w.clientWidth / sh.offsetWidth); sh.style.transform = 'scale(' + k + ')'; w.style.height = sh.offsetHeight * k + 'px'; });
    const draw = () => {
      C().resetView(); C().invalidate();
      const { sheets } = C().sheets();
      pages.textContent = '';
      sheets.forEach((sh) => pages.append(h('.view-sheet', null, sh)));
      fit();
    };
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => setTimeout(r, 60));
    if (!doc.lite) { draw(); window.addEventListener('resize', fit); }
    if (cv.r !== 0) { const rel = related(who); if (rel) page.append(rel); }
    // statistics: the customer opened the page, and which links they follow (to hifiklubben.dk, to call or write the adviser)
    // one event per kind of click, so Umami's Events view counts them apart; the product's name and SKU go with it
    // where the customer came from (the QR code on paper, or a link sent to them) and which proposal it is: a short fingerprint of
    // the link, so opening the same proposal again counts on the same one (nothing in it identifies the customer)
    const kilde = /^#q=/.test(location.hash) ? 'QR-kode' : /(^|[?&])pdf\b/.test(location.search.slice(1)) ? 'PDF-link' : 'Link';
    const tilbud = (() => { let x = 5381; for (const ch of String(payload || '')) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0; return x.toString(36).slice(0, 6); })();
    HP.stat('Kundeside åbnet', { butik: shop, kilde, tilbud, relaterede: page.querySelectorAll('.rel-tile').length });
    page.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]'); if (!a) return;
      const prod = () => { const el = a.closest('.rel-tile, tr, .item'); const n = el && el.querySelector('b, .nm, .pname'); return ((a.dataset.name || (n && n.textContent) || a.textContent || '').replace(/\s*↗\s*$/, '').trim()).slice(0, 80); };
      if (a.closest('.rel-tile')) HP.stat('Kunde: relateret produkt', { produkt: prod(), sku: a.dataset.sku || '', butik: shop });
      else if (/^tel:/.test(a.href)) HP.stat('Kunde: ring', { butik: shop });
      else if (/^mailto:/.test(a.href)) HP.stat('Kunde: mail', { butik: shop });
      else HP.stat('Kunde: produkt i tilbuddet', { produkt: prod(), butik: shop });
    });
    page.append(h('footer.view-foot', null,
      h('small', null, t('Your adviser', 'Din rådgiver')), h('b', null, cv.s || shop), h('span', null, shop),
      sh[1] ? h('span', null, t('Tel. ', 'Tlf. ') + sh[1]) : null, sh[2] ? h('span', null, sh[2]) : null, reach(),
      h('p', null, priceNote())));
    let again = 0;
    const later = () => { clearTimeout(again); again = setTimeout(draw, 250); };
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', later);
    window.addEventListener('load', later);
    document.title = t('Your proposal', 'Dit tilbud') + (doc.name ? ' · ' + doc.name : '') + ' · HiFi Klubben';
  }

  /* "Relaterede produkter" for the customer: what hifiklubben.dk sells with the products in the proposal (the same list as the
     planner's dialog, without what is already in it), to look at and buy on the website. Nothing is saved or sent. */
  function related(who) {
    const list = HP.complete ? HP.complete.related() : [];
    if (!list.length) return null;
    const tile = (x) => {
      const p = x.p, pr = HP.priceOf(p), url = HP.productUrl(p);
      return h('a.rel-tile', { href: url || undefined, target: '_blank', rel: 'noopener', data: { sku: p.sku || '', name: (p.brand ? p.brand + ' ' : '') + p.name } },
        h('.rel-pic', null, p.img && p.img[0] ? HP.imgEl(p.img[0], 'thumb', { loading: 'lazy' }) : null),
        h('small', null, p.brand), h('b', null, p.name),
        h('span.rel-for', null, t('Fits ', 'Passer til ') + x.for.name),
        h('span.rel-pr', null, pr.was ? h('s', null, HP.money(pr.was)) : null, h('span', null, HP.money(pr.price))));
    };
    return h('section.view-rel', null, h('h2.view-h', null, t('You may also need', 'Måske har du også brug for')),
      h('p.view-sub', null, t('Chosen for the products in your proposal. Tap one to see more on hifiklubben.dk, or ask ', 'Udvalgt til produkterne i dit tilbud. Tryk på et for at se mere på hifiklubben.dk – eller spørg ') + (who || t('us', 'os')) + t(' next time you come by.', ', næste gang du kommer forbi.')),
      h('.rel-grid', null, list.slice(0, 24).map(tile)));
  }

  /* A long price list does not fit one A4 page (above all a landscape one, ~12 lines): the lines then continue on further
     cover sheets, and the total, the adviser and the QR code go on the last one, never cut off. Called by C.print once
     the sheets are in the page; measures them with #print-root briefly laid out off-screen. */
  function paginate(root) {
    const first = root.querySelector('.cover-sheet');
    if (!first) return;
    const prev = root.getAttribute('style') || '';
    root.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;visibility:hidden';
    try {
      const fits = (cv) => cv.scrollHeight <= cv.clientHeight + 1;
      const cv0 = first.querySelector('.cover');
      if (fits(cv0)) return;
      const table = cv0.querySelector('.cv-lines'), rows = [...table.rows];
      const tail = [...cv0.children].filter((el) => el.matches('.cv-total, .cv-saving, .cv-foot, .cv-note'));
      tail.forEach((el) => el.remove());
      const sheets = [first];
      const newSheet = () => {
        const sh = first.cloneNode(false), cv = h('.cover.cv-cont', null, cv0.querySelector('.cv-head').cloneNode(true), h('table.cv-lines'));
        sh.append(cv); sheets[sheets.length - 1].after(sh); sheets.push(sh); return cv;
      };
      // the lines: as many per sheet as fit (at least one, so a sheet always moves on)
      table.textContent = '';
      let cv = cv0, tb = table;
      rows.forEach((r) => {
        tb.append(r);
        if (!fits(cv) && tb.rows.length > 1) { r.remove(); cv = newSheet(); tb = cv.querySelector('.cv-lines'); tb.append(r); }
      });
      // the total and the foot: under the last lines if there is room, else on a sheet of their own
      tail.forEach((el) => cv.append(el));
      if (!fits(cv)) {
        // a total alone on a page reads oddly: the last two lines go along with it (one stays behind at least)
        tail.forEach((el) => el.remove());
        const carry = [...tb.rows].slice(Math.max(1, tb.rows.length - 2));
        cv = newSheet(); const t2 = cv.querySelector('.cv-lines');
        if (carry.length) carry.forEach((r) => t2.append(r)); else t2.remove();
        tail.forEach((el) => cv.append(el));
      }
      // "Side 1 af 3" under the date in the header
      sheets.forEach((sh, i) => sh.querySelector('.cv-meta').append(h('span.cv-page', null, t('Page ', 'Side ') + (i + 1) + t(' of ', ' af ') + sheets.length)));
    } finally { root.setAttribute('style', prev); if (!prev) root.removeAttribute('style'); }
  }

  HP.cover = { build, dialog, csv, viewer, stamp, paginate, qrFor };
})();
