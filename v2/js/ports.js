/* HiFi Planner v2 — I/O standard.
   One vocabulary of signals and connector types used by every product card, so that
   ports can be matched when a card is replaced and cables can be suggested per wire.
   A port is { key, label, sig, conn }:
     label  "SIGNAL DIR DETAIL"   e.g. "HDMI IN 1", "SPEAKER OUT SURROUND BACK", "SUB OUT 2"
     key    slug of the label, unique per side of a product
     sig    signal id from SIGNALS      conn  connector id from CONNECTORS */
(function () {
  const HP = (window.HP = window.HP || {});

  // The physical plug or socket, from one strict list (what is written on the product goes in the port's label instead).
  // Ordered as shown in the Editor. Speaker terminals are one type for now (no banana / spade / bare wire).
  const CONNECTORS = {
    rca: 'RCA', xlr: 'XLR', jack: 'Jack 6.35 mm', minijack: 'Minijack 3.5 mm', jack44: 'Jack 4.4 mm', jack25: 'Jack 2.5 mm', xlr4: 'XLR 4-pin', din: 'DIN',
    speaker: 'Speaker terminal', speakon: 'Speakon',
    optical: 'Toslink (optical)', minitoslink: 'Mini-Toslink', bnc: 'BNC', hdmi: 'HDMI',
    usba: 'USB-A', usbb: 'USB-B', usbc: 'USB-C', microusb: 'Micro-USB',
    ethernet: 'RJ45 (Ethernet)', rs232: 'RS-232', antenna: 'Antenna', power: 'Power (IEC)', wireless: 'Wireless', other: 'Other',
  };
  // connector values from before the strict list: a use of a plug, or USB without its type
  const LEGACY_CONN = { coax: 'rca', sub: 'rca', trigger: 'minijack', usb: 'usbb' };
  // a port's connector as one of CONNECTORS (old values are mapped; USB without a type is decided from the label and side)
  function conn(c, port, side) {
    if (CONNECTORS[c]) return c;
    if (c === 'usb') {
      const l = String((port && port.label) || '').toUpperCase(), sig = port && port.sig;
      if (sig === 'usbc' || /USB[- ]?C\b|TYPE[- ]?C/.test(l)) return 'usbc';
      if (/MICRO/.test(l)) return 'microusb';
      if (/USB[- ]?B\b|\bPC\b|COMPUTER|DAC|AUDIO|ASYNC/.test(l)) return 'usbb';
      if (/USB[- ]?A\b|DRIVE|STORAGE|HOST|MEDIA|SERVICE|POWER|5 ?V|CHARG/.test(l)) return 'usba';
      return (side || (port && / OUT\b/.test(l) ? 'out' : 'in')) === 'out' ? 'usba' : 'usbb';
    }
    return LEGACY_CONN[c] || (c ? 'other' : 'other');
  }
  // wire and dot colour: by what the plug carries where one plug serves several uses (RCA: line, coax, sub), else by the plug
  const COLOR_BY_SIG = { coax: 'coax', digital: 'coax', sub: 'sub', trigger: 'trigger', aes: 'xlr' };
  const COLOR_BY_CONN = { usba: 'usb', usbb: 'usb', usbc: 'usb', microusb: 'usb', minitoslink: 'optical', jack44: 'jack', jack25: 'jack', xlr4: 'xlr', rs232: 'other', antenna: 'other', power: 'other' };
  const colorOf = (p) => { const c = conn(p && p.conn, p); return (p && COLOR_BY_SIG[p.sig] && ['rca', 'bnc', 'xlr', 'minijack'].includes(c) ? COLOR_BY_SIG[p.sig] : COLOR_BY_CONN[c] || c); };

  // label = text on the card, conn = default connector, nodir = no IN/OUT word in the label
  const SIGNALS = [
    { id: 'hdmi', label: 'HDMI', conn: 'hdmi' },
    { id: 'hdmi-arc', label: 'HDMI ARC', conn: 'hdmi', nodir: true, fam: 'hdmi' },
    { id: 'hdmi-earc', label: 'HDMI eARC', conn: 'hdmi', nodir: true, fam: 'hdmi' },
    { id: 'optical', label: 'OPTICAL', conn: 'optical' },
    { id: 'coax', label: 'COAXIAL', conn: 'rca' },
    { id: 'digital', label: 'DIGITAL', conn: 'rca' },
    { id: 'aes', label: 'AES/EBU', conn: 'xlr' },
    { id: 'bnc', label: 'BNC', conn: 'bnc' },
    { id: 'usb', label: 'USB', conn: 'usbb' },
    { id: 'usbc', label: 'USB-C', conn: 'usbc', fam: 'usb' },
    { id: 'lan', label: 'LAN', conn: 'ethernet', nodir: true },
    { id: 'line', label: 'LINE', conn: 'rca' },
    { id: 'aux', label: 'AUX', conn: 'rca' },
    { id: 'phono', label: 'PHONO', conn: 'rca' },
    { id: 'bal', label: 'BALANCED', conn: 'xlr' },
    { id: 'mic', label: 'MIC', conn: 'xlr' },
    { id: 'minijack', label: 'MINIJACK', conn: 'minijack' },
    { id: 'jack', label: 'JACK', conn: 'jack' },
    { id: 'phones', label: 'PHONES', conn: 'jack' },
    { id: 'pre', label: 'PRE', conn: 'rca' },
    { id: 'main', label: 'MAIN', conn: 'rca' },
    { id: 'zone', label: 'ZONE', conn: 'rca' },
    { id: 'sub', label: 'SUB', conn: 'rca' },
    { id: 'speaker', label: 'SPEAKER', conn: 'speaker' },
    { id: 'speakon', label: 'SPEAKON', conn: 'speakon' },
    { id: 'trigger', label: 'TRIGGER', conn: 'minijack' },
    { id: 'video', label: 'VIDEO', conn: 'rca' },
    { id: 'control', label: 'CONTROL', conn: 'other', custom: true },
    { id: 'other', label: 'OTHER', conn: 'other', custom: true },
  ];
  const SIG = Object.fromEntries(SIGNALS.map((s) => [s.id, s]));
  const family = (sig) => (SIG[sig] && SIG[sig].fam) || sig;

  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, ' plus ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  /* Build a standard port from signal + free detail ("1", "SURROUND BACK", "FIXED" ...). */
  function makePort(sig, side, detail, opts) {
    opts = opts || {};
    const def = SIG[sig] || SIG.other;
    const dir = opts.dir || (side === 'in' ? 'IN' : 'OUT');
    detail = String(detail || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/\bEARC\b/g, 'eARC');
    let label;
    if (def.custom) label = detail || def.label;
    else if (def.nodir) label = (def.label + ' ' + detail).trim();
    else if (sig === 'zone') label = ('ZONE ' + detail + ' ' + dir).replace(/\s+/g, ' ').trim();
    else label = (def.label + ' ' + dir + ' ' + detail).trim();
    if (opts.label != null && String(opts.label).trim()) { label = String(opts.label).replace(/\s+/g, ' ').trim(); detail = ''; } // as written on the product
    const m = /(\d+)/.exec(opts.label != null && String(opts.label).trim() ? label : detail);
    return { key: slug(label), label, sig: def.id, conn: conn(opts.conn || def.conn, { label, sig: def.id }, side), n: m ? +m[1] : 0, detail };
  }

  /* Legacy label (free text from the old data.js) -> standard port. Returns null to drop,
     {wireless:'bt'} for pseudo-ports. */
  const RULES = [
    [/HDMI/, (s) => (!/\d/.test(s) && /ARC/.test(s) ? (/EARC/.test(s) ? 'hdmi-earc' : 'hdmi-arc') : 'hdmi'), (sig) => (sig === 'hdmi' ? /HDMI/g : /HDMI|-?CEC\/?|E?ARC/g)],
    [/SPEAKON/, 'speakon', /SPEAKON/g],
    [/\bSUB|LFE/, 'sub', /SUB ?WOOFER|SUBW|\bSUB\b|LFE|PRE-? ?OUT/g],
    [/SPEAKER/, 'speaker', /SPEAKERS?|L\/R/g],
    [/PRE-? ?OUT|PREAMP/, 'pre', /PRE-? ?OUT|PREAMP( OUT)?/g, 'OUT'],
    [/POWER AMP|MAIN IN|EXT\. ?PRE|HOME THEATRE|BYPASS|7\.1 CH|^SE IN/, 'main', /POWER AMP|MAIN/g, 'IN'],
    [/ZONE/, 'zone', /ZONE/g],
    [/TRIGGER/, 'trigger', /TRIGGER/g],
    [/AMP CONTROL|^IR\b|GPIO|GLOBAL/, 'control', null],
    [/PHONO/, 'phono', /PHONO/g],
    [/OPTICAL|TOSLINK/, 'optical', /OPTICAL|TOSLINK/g],
    [/COAX|SPDIF/, 'coax', /COAXIAL|COAX|SPDIF|DIGITAL/g],
    [/AES|DIGITAL.*XLR/, 'aes', /AES\/EBU|AES|DIGITAL|XLR/g],
    [/BNC/, 'bnc', /BNC/g],
    [/DIGITAL/, 'digital', /DIGITAL/g],
    [/USB/, (s) => (/USB[- ]?C\b/.test(s) ? 'usbc' : 'usb'), /USB([- ]?C\b)?/g],
    [/^LAN$|ETHERNET/, 'lan', /LAN|ETHERNET/g],
    [/\bMIC/, 'mic', /XLR|MICROPHONE|MIC/g],
    [/\bBAL|XLR/, 'bal', /BALANCED|\bBAL\b|XLR|LINE|L\/R/g],
    [/TRS/, 'jack', /$^/g],
    [/PHONES|HEADPHONE/, 'phones', /HEADPHONES?|PHONES/g, 'OUT'],
    [/MINIJACK|3\.5 ?MM/, 'minijack', /LINE|MINIJACK|3\.5 ?MM/g],
    [/JACK|6\.3/, 'jack', /LINE|6\.35? ?MM|JACK/g],
    [/VIDEO|COMPOSITE/, 'video', /VIDEO/g],
    [/AUX/, 'aux', /AUX/g],
    [/LINE|ANALOG|AUDIO|RCA|^CD\b|TUNER|RECORDER|STREAMING|^TV$|TAPE|\bREC\b|DVD|\bBD\b|\bSAT\b|GAME|MEDIA|\bVCR\b|\bDAT\b/, 'line', /LINE|ANALOG|AUDIO|RCA/g],
  ];

  function parseLegacy(raw, side) {
    let s = String(raw).toUpperCase().replace(/OPTIAL|OPTIXAL/g, 'OPTICAL').replace(/DITIGAL/g, 'DIGITAL')
      .replace(/\b(IN|OUT|SUBW)(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim();
    if (!s || s === 'NONE') return null;
    if (s === 'BT') return { wireless: 'bt' };
    let dir = /\b(IN|INPUT)\b/.test(s) ? 'IN' : /\bOUT(PUT)?\b/.test(s) ? 'OUT' : side === 'in' ? 'IN' : 'OUT';
    for (const [test, sigOrFn, strip, forceDir] of RULES) {
      if (!test.test(s)) continue;
      const sig = typeof sigOrFn === 'function' ? sigOrFn(s) : sigOrFn;
      if (SIG[sig].custom) return makePort(sig, side, s);
      if (forceDir) dir = forceDir;
      const pm = sig === 'speaker' && / [-+]$/.test(s) ? s.slice(-1) : '';
      let rest = s.replace(typeof strip === 'function' ? strip(sig) : strip, ' ').replace(/\b(INPUT|OUTPUT|IN|OUT)\b/g, ' ').replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ').trim().replace(/^[-+/\s]+|[-+/\s]+$/g, '').replace(/^BAL (.+)$/, '$1 BAL');
      rest = rest.replace(/\bSURR-B\b/g, 'SURROUND BACK').replace(/\bSURR\b/g, 'SURROUND').replace(/\bHT\b/g, 'HEIGHT');
      if (sig === 'speaker' || sig === 'pre') rest = rest.replace(/^C$/, 'CENTER');
      if (pm) rest = (rest + ' ' + pm).trim();
      let conn;
      if (/\bBAL(ANCED)?\b|XLR/.test(s) && ['sub', 'pre', 'line', 'zone'].includes(sig)) conn = 'xlr';
      return makePort(sig, side, rest, { dir, conn });
    }
    return makePort('other', side, s);
  }

  /* Give every port on one side a unique key. */
  function uniqueKeys(ports) {
    const seen = {};
    ports.forEach((p) => {
      let k = p.key || slug(p.label) || 'port', i = 1;
      while (seen[k]) k = (p.key || 'port') + '-' + ++i;
      seen[k] = 1; p.key = k;
    });
    return ports;
  }

  /* ---- smart cabling ---- */
  // two different plugs that are commonly joined by one cable (or a standard adapter): no warning when wiring them
  const CROSS = new Set(['minijack|rca', 'jack|minijack', 'jack|rca', 'din|rca', 'bnc|rca', 'minitoslink|optical', 'jack25|minijack', 'jack44|minijack',
    'usba|usbb', 'usba|usbc', 'usbb|usbc', 'microusb|usba', 'microusb|usbc', 'rca|xlr', 'jack|xlr']);
  const loose = (c) => !c || c === 'other' || c === 'wireless'; // unknown: anything goes
  function compatible(a, b) {
    const A = conn(a), B = conn(b);
    if (A === B || loose(A) || loose(B)) return true;
    return CROSS.has([A, B].sort().join('|'));
  }
  // a cable's two ends: set in the Editor or by the catalogue build (ends), or from its connector list (cable) of old data
  function cableEnds(p) {
    if (p && Array.isArray(p.ends) && p.ends.length === 2) return p.ends.map((c) => conn(c));
    const l = ((p && p.cable) || (Array.isArray(p) ? p : [])).map((c) => conn(c)).filter((c, i, a) => a.indexOf(c) === i);
    return l.length ? [l[0], l[1] || l[0]] : null;
  }
  // 2 = made for this connection (both ends fit, either way round), 1 = one end fits or a port is unknown, 0 = wrong plugs.
  // a, b: ports (or connector ids)
  function cableFit(cable, a, b) {
    const A = conn(a && a.conn !== undefined ? a.conn : a), B = conn(b && b.conn !== undefined ? b.conn : b), E = cableEnds(cable);
    if (!E) return 1;
    if ((E[0] === A && E[1] === B) || (E[0] === B && E[1] === A)) return 2;
    if (loose(A) || loose(B)) return E.includes(loose(A) ? B : A) || (loose(A) && loose(B)) ? 1 : 0;
    return 0;
  }

  /* ---- replacing a card: map each used port of the old product to the new one ---- */
  function mapPorts(oldPorts, newPorts, usedKeys) {
    const map = {}, taken = new Set();
    const used = oldPorts.filter((p) => usedKeys.includes(p.key));
    const pick = (p, pred) => {
      if (map[p.key]) return;
      const hit = newPorts.find((q) => !taken.has(q.key) && pred(q));
      if (hit) { map[p.key] = hit.key; taken.add(hit.key); }
    };
    used.forEach((p) => pick(p, (q) => q.key === p.key));
    used.forEach((p) => pick(p, (q) => family(q.sig) === family(p.sig) && q.n === p.n && q.detail === p.detail));
    used.forEach((p) => pick(p, (q) => family(q.sig) === family(p.sig) && q.n === p.n));
    used.forEach((p) => pick(p, (q) => family(q.sig) === family(p.sig)));
    used.forEach((p) => pick(p, (q) => q.conn === p.conn && q.conn !== 'other'));
    return map;
  }

  HP.ports = { CONNECTORS, SIGNALS, SIG, slug, makePort, parseLegacy, uniqueKeys, compatible, cableFit, cableEnds, mapPorts, family, conn, colorOf };
})();
