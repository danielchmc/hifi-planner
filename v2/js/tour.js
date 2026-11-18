/* HiFi Planner v2 — guided walkthrough. */
(function () {
  const HP = window.HP, { h, t, store, catalog: cat } = HP;
  const T = (HP.tour = {});

  function demo() { // put a small real system on an empty canvas so every step has something to point at
    if (store.doc.items.some((i) => i.kind === 'product')) return;
    const C = HP.canvas, amp = cat.products().find((p) => (p.out || []).some((x) => x.sig === 'speaker') && (p.in || []).length > 2 && (p.img || []).length > 1);
    const spk = cat.products().find((p) => (p.cats || []).includes('Passive Speakers') && (p.in || []).some((x) => x.sig === 'speaker'));
    if (!amp || !spk) return;
    const a = C.addProduct(amp.id, 420, 420), b = C.addProduct(spk.id, 980, 420);
    C.connect(a.id, amp.out.find((x) => x.sig === 'speaker').key, b.id, spk.in.find((x) => x.sig === 'speaker').key);
    store.sel = new Set([a.id]); store.commit(); C.fit();
  }
  const steps = () => [
    { title: t('Welcome to HiFi Planner', 'Velkommen til HiFi Planner'), text: t('This short tour shows how to build a system and turn it into an A4 proposal. It takes about a minute.', 'Denne korte rundvisning viser, hvordan du bygger et system og laver det til et A4-tilbud. Det tager cirka et minut.') },
    { sel: '#sidebar .filters', before: () => HP.panels.showTab('products'), title: t('Find products', 'Find produkter'), text: t('Search by model, brand, SKU, category or even a port name such as "HDMI eARC". The buttons and dropdowns narrow the list.', 'Søg på model, brand, SKU, kategori eller endda et portnavn som "HDMI eARC". Knapper og dropdowns indsnævrer listen.') },
    { sel: '#sb-list', title: t('Add to the canvas', 'Læg på lærredet'), text: t('Drag a product onto the canvas, or click it to drop it in the middle.', 'Træk et produkt ind på lærredet, eller klik for at lægge det i midten.') },
    { sel: '.item.k-product', title: t('Product cards', 'Produktkort'), text: t('Inputs are on the left, outputs on the right. Round badges in the corner show Bluetooth and WiFi. Click the image to see the back panel.', 'Indgange er til venstre, udgange til højre. Runde mærker i hjørnet viser Bluetooth og WiFi. Klik på billedet for at se bagsiden.') },
    { sel: '.item.k-product .col.out .port', title: t('Connect', 'Forbind'), text: t('Drag from an output dot to an input dot on another card. Colours show the connector type, and you get a warning if two connectors do not match.', 'Træk fra en udgangsprik til en indgangsprik på et andet kort. Farverne viser stiktypen, og du får en advarsel, hvis to stik ikke passer sammen.') },
    { sel: '.wire', title: t('Choose a cable', 'Vælg et kabel'), text: t('Click a wire to pick a cable. Cables that fit both ends are listed first, and the cable is added to the price list.', 'Klik på en ledning for at vælge kabel. Kabler, der passer i begge ender, vises først, og kablet kommer med på prislisten.') },
    { sel: '#selbar', title: t('Replace without rewiring', 'Udskift uden at trække kabler igen'), text: t('Select a card and press Replace, or drop another product on top of it. Cables stay connected to the matching ports.', 'Markér et kort og tryk Udskift, eller slip et andet produkt oven på det. Kablerne bliver siddende på de matchende porte.') },
    { sel: '.item.k-product', title: t('Right-click for everything', 'Højreklik for det hele'), text: t('Right-click a card, a wire or the empty canvas to see every action with its keyboard shortcut. Double-click a product image to show it full screen, for example the rear panel.', 'Højreklik på et kort, en ledning eller det tomme lærred for at se alle handlinger med tastaturgenveje. Dobbeltklik på et produktbillede for at vise det i fuld skærm, fx bagpanelet.') },
    { sel: '#tb-scale', title: t('Card size', 'Kortstørrelse'), text: t('Not enough room on one A4 page? Make all cards smaller here. The eraser on the left clears the canvas (and can be undone).', 'Ikke plads nok på én A4-side? Gør alle kort mindre her. Viskelæderet til venstre rydder lærredet (og kan fortrydes).') },
    { sel: '#tab-shortcuts', title: t('Shortcuts', 'Genveje'), text: t('Ready-made systems. Click or drag one onto the canvas and adjust from there.', 'Færdige systemer. Klik eller træk en ind på lærredet og tilpas derfra.') },
    { sel: '.page', title: t('The A4 page', 'A4-siden'), text: t('This frame is the printed page. Keep the system inside it. Add more pages with the + on the right, and switch portrait/landscape in the top bar.', 'Denne ramme er den printede side. Hold systemet inden for den. Tilføj flere sider med + til højre, og skift stående/liggende i topbjælken.') },
    { sel: '#tb-insert', title: t('Text, prices and CI mode', 'Tekst, priser og CI-tilstand'), text: t('Add notes, show a price list with total, or switch to CI mode to place lettered marks (A, B, C…) for products on an uploaded floor plan.', 'Tilføj noter, vis en prisliste med total, eller skift til CI-tilstand for at placere mærker med bogstaver (A, B, C…) for produkter på en uploadet plantegning.') },
    { sel: '#tb-print', title: t('Print or save as PDF', 'Print eller gem som PDF'), text: t('Prints exactly what is inside the A4 frames. Choose "Save as PDF" in the dialog to email it to the customer.', 'Printer præcis det, der er inden for A4-rammerne. Vælg "Gem som PDF" i dialogen for at maile det til kunden.') },
    { sel: '#tb-projects', title: t('Projects', 'Projekter'), text: t('Your work is autosaved. Save named proposals here, or export them as files.', 'Dit arbejde autosaves. Gem navngivne tilbud her, eller eksportér dem som filer.') },
    { sel: '#tb-help', title: t('That is it', 'Det var det'), text: t('Help has the full guide and keyboard shortcuts, and you can restart this tour from there.', 'Hjælp har hele guiden og tastaturgenveje, og du kan starte rundvisningen igen derfra.') },
  ];

  T.start = () => {
    demo();
    const list = steps();
    let i = 0;
    const spot = h('.tour-spot'), tip = h('.tour-tip'), layer = h('.tour', null, spot, tip);
    document.body.append(layer);
    const end = () => { if (HP.panels.drawer && matchMedia('(max-width: 1024px)').matches) HP.panels.drawer(false); layer.remove(); window.removeEventListener('resize', show); document.removeEventListener('keydown', key, true); HP.LS.set('toured', true); };
    const key = (e) => { if (e.key === 'Escape') end(); else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1); else if (e.key === 'ArrowLeft') go(-1); else return; e.stopPropagation(); e.preventDefault(); };
    const go = (d) => { i += d; if (i >= list.length) return end(); i = Math.max(0, i); show(); };
    function show() {
      const s = list[i];
      // small screens: open the product drawer for the sidebar steps, and point at "More" for top-bar buttons that are tucked away there
      const narrow = matchMedia('(max-width: 1024px)').matches, inSide = !!(s.sel && /^#(sb-|sidebar|tab-shortcuts)/.test(s.sel));
      if (narrow && HP.panels.drawer && document.body.classList.contains('drawer-open') !== inSide) { HP.panels.drawer(inSide); return setTimeout(show, 260); } // wait for the slide
      s.before && s.before();
      const visible = (e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.right > 0 && b.left < innerWidth; };
      let target = s.sel && [...document.querySelectorAll(s.sel)].find(visible);
      if (!target && narrow && s.sel && s.sel.startsWith('#tb-')) target = document.getElementById('tb-more');
      const r = target ? target.getBoundingClientRect() : null, pad = 6;
      if (r) Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      else Object.assign(spot.style, { display: 'block', left: '50%', top: '50%', width: '0px', height: '0px' });
      tip.textContent = '';
      tip.append(h('.tour-step', null, i + 1 + ' / ' + list.length), h('h3', null, s.title), h('p', null, s.text),
        h('.row', null, h('button.link', { onclick: end }, t('Skip', 'Spring over')), h('.spacer'), i > 0 && h('button.btn', { onclick: () => go(-1) }, t('Back', 'Tilbage')), h('button.btn.primary', { onclick: () => go(1) }, i === list.length - 1 ? t('Done', 'Færdig') : t('Next', 'Næste'))));
      const tw = 340, th = tip.offsetHeight || 180, W = innerWidth, H = innerHeight;
      let x, y;
      if (!r) { x = (W - tw) / 2; y = (H - th) / 2; }
      else if (r.right + tw + 24 < W) { x = r.right + 18; y = r.top; }
      else if (r.left - tw - 24 > 0) { x = r.left - tw - 18; y = r.top; }
      else if (r.bottom + th + 24 < H) { x = r.left; y = r.bottom + 18; }
      else { x = r.left; y = r.top - th - 18; }
      tip.style.left = HP.clamp(x, 12, W - tw - 12) + 'px'; tip.style.top = HP.clamp(y, 12, H - th - 12) + 'px';
    }
    window.addEventListener('resize', show); document.addEventListener('keydown', key, true);
    show();
  };
})();
