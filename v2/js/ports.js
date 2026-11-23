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

  /* ---- plugs: male/female and mono/stereo (RCA, minijack, jack, XLR) ----
     Worked out by rules, never stored unless set by hand: a device's sockets are female (XLR outputs male); a port carries two
     channels (a stereo RCA pair, a TRS jack) unless what it carries is mono by nature (sub, coaxial, digital, video, trigger, AES,
     mic) or its label names one channel (…L, …R, LFE, MONO). A port can override with g ('m'/'f') and ch (1/2), e.g. a product
     with a fixed cable ending in plugs. A cable's ends: eg (genders) and ech (channels) from the catalogue build or the Editor;
     without them a cable is male at both ends, mono if it is a sub or coaxial cable, else stereo. */
  const AUDIO = new Set(['rca', 'minijack', 'jack', 'jack25', 'jack44', 'xlr']);
  const MONO_SIG = new Set(['sub', 'coax', 'digital', 'video', 'trigger', 'aes', 'mic', 'bnc']);
  const ONE_CH = (label) => !!LR(label) || (/\b(LFE|MONO)\b/i.test(String(label || '')) && !/STEREO/i.test(String(label || '')));
  function plug(port, side) {
    if (!port) return null;
    const c = conn(port.conn, port, side);
    if (!AUDIO.has(c)) return null;
    const g = port.g === 'm' || port.g === 'f' ? port.g : c === 'xlr' && side === 'out' ? 'm' : 'f';
    const ch = port.ch === 1 || port.ch === 2 ? port.ch : MONO_SIG.has(port.sig) || ONE_CH(port.label) ? 1 : 2;
    return { conn: c, g, ch, auto: !(port.g || port.ch) };
  }
  function cablePlugs(cable) {
    const E = cableEnds(cable); if (!E) return null;
    const name = String((cable && cable.name) || '') + ' ' + String((cable && cable.ty) || '');
    const monoGuess = /\bsub(woofer)?\b|coax|digital|mono|\blfe\b/i.test(name) ? 1 : 2;
    return E.map((c, i) => ({ conn: c, g: (cable.eg && cable.eg[i]) || 'm', ch: (cable.ech && cable.ech[i]) || monoGuess }));
  }
  // as text: "RCA ×2 M", "Minijack 3.5 mm stereo F" (M = male, a plug; F = female, a socket). The app shows it as a chip
  // (Pn.plugChip in panels.js); the text is for tooltips and build/plugs.md.
  const plugCore = (x) => (x.conn === 'rca' || x.conn === 'xlr' ? (CONNECTORS[x.conn] || x.conn) + ' ×' + (x.ch === 2 ? 2 : 1) : (CONNECTORS[x.conn] || x.conn) + (x.ch === 2 ? ' stereo' : ' mono'));
  const plugText = (x) => (!x ? '' : !AUDIO.has(x.conn) ? CONNECTORS[x.conn] || x.conn : plugCore(x) + ' ' + x.g.toUpperCase());
  // what does not fit when this cable joins these two ports (out port a, in port b): [{ code, en, da }], empty when all is well.
  // The cable is turned the way its connectors fit; if both ways fit, the way with fewer problems.
  function plugIssues(cable, a, b) {
    const E = cablePlugs(cable), pa = plug(a, 'out'), pb = plug(b, 'in');
    if (!E || (!pa && !pb)) return [];
    const A = conn(a && a.conn, a, 'out'), B = conn(b && b.conn, b, 'in');
    const ways = [[E[0], E[1]], [E[1], E[0]]].filter(([x, y]) => (!pa || x.conn === A) && (!pb || y.conn === B));
    if (!ways.length) return []; // the connectors themselves do not fit: cableFit and the connector warning cover that
    // a connection is as mono as its mono side: a SUB OUT (one RCA) into a subwoofer's stereo LINE IN takes a mono cable (into L/LFE)
    const eff = pa && pb ? Math.min(pa.ch, pb.ch) : (pa || pb).ch;
    const check = (p, e) => {
      const out = [];
      if (!p || !e) return out;
      const ech = e.ch === p.ch || e.ch === eff ? p.ch : e.ch; // the end fits this port, or the connection as a whole
      if (p.g === e.g) out.push(p.g === 'f' ? { code: 'ff', en: 'F to F: a cable with male plugs (or an adapter) is needed', da: 'F mod F: der skal bruges et kabel med hanstik (eller en adapter)' }
        : { code: 'mm', en: 'M to M: a female socket (or an adapter) is needed', da: 'M mod M: der skal bruges et hunstik (eller en adapter)' });
      if (p.ch === 2 && ech === 1) out.push({ code: 'mono', en: 'Mono cable on a stereo connection: only one channel gets through', da: 'Monokabel på en stereoforbindelse: kun den ene kanal kommer igennem' });
      if (p.ch === 1 && ech === 2) out.push({ code: 'stereo', en: 'Stereo cable on a mono connection: one plug is left over', da: 'Stereokabel på en monoforbindelse: et stik er i overskud' });
      return out;
    };
    const res = ways.map(([x, y]) => check(pa, x).concat(check(pb, y)));
    const best = res.sort((u, v) => u.length - v.length)[0];
    return best.filter((x, i) => best.findIndex((y) => y.code === x.code) === i);
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

  /* ---------- automatic wiring of a system (a website bundle dropped from the sidebar) ----------
     devs: [{ uid, p }] one entry per card. Returns [{ a: { uid, key }, b: { uid, key } }], output → input.
     Every possible output → input pair gets a score; the best are taken first, one at a time, as long as
       - each input takes one wire (a speaker pair card takes two: L and R from a stereo amp with separate L/R outputs),
       - each output gives one wire (a stereo speaker output gives two when it feeds two single speakers),
       - two cards are joined once (again except L+R into one speaker pair), and no loop is made,
       - a source (anything but an amplifier's speaker or sub outputs) feeds one card only.
     Scores: same signal 10, same group 7 (line/aux/pre/main/zone, HDMI, USB, coaxial digital), line-level into a sub input 5;
     a speaker output's FRONT/CENTER/SURROUND must agree with the speaker (center needs a centre speaker; front goes to the
     dearest pair); a dedicated box (fewer inputs, e.g. a phono stage) wins over an amplifier's own input; digital (optical)
     loses to analogue between the same two cards only by the order of the ports. Ties: the first port in the list wins. */
  const WGROUP = { line: 'an', aux: 'an', pre: 'an', main: 'an', zone: 'an', minijack: 'an', jack: 'an', bal: 'an',
    hdmi: 'hdmi', 'hdmi-arc': 'hdmi', 'hdmi-earc': 'hdmi', usb: 'usb', usbc: 'usb', coax: 'dig', digital: 'dig', speakon: 'speaker' };
  const wgroup = (sig) => WGROUP[sig] || sig;
  const SKIPSIG = new Set(['lan', 'trigger', 'control', 'other', 'video', 'phones', 'mic']);
  const LR = (label) => { const m = /(?:^|[\s_-])(L|R|LEFT|RIGHT|VENSTRE|HØJRE)$/i.exec(String(label || '').trim()); return m ? m[1][0].toUpperCase() : ''; };
  function autoWire(devs) {
    const role = (p) => { const r = String((p.fx || {}).role || '').toLowerCase(), n = String(p.name || '');
      return /center|centre/.test(r) || /center|centre/i.test(n) ? 'center' : /sub/.test(r) || p.kind === 'subwoofer' || /\bsub\b/i.test(n) ? 'sub' : /surround|rear|atmos|height/.test(r) ? 'surround' : 'main'; };
    const cand = [];
    devs.forEach((A, ai) => (A.p.out || []).forEach((o, oi) => {
      if (SKIPSIG.has(o.sig)) return;
      devs.forEach((B, bi) => { if (bi === ai) return; const ins = (B.p.in || []).filter((x) => !SKIPSIG.has(x.sig));
        ins.forEach((i) => {
          const ii = (B.p.in || []).indexOf(i);
          let s = o.sig === i.sig ? 10 : wgroup(o.sig) === wgroup(i.sig) ? 7 : (wgroup(o.sig) === 'an' && i.sig === 'sub') || (o.sig === 'sub' && wgroup(i.sig) === 'an') ? 5 : 0;
          if (!s) return;
          if (o.sig === 'sub' && role(B.p) !== 'sub') return; // a sub output only feeds a subwoofer
          if (o.sig === 'speaker' || o.sig === 'speakon') {
            const L = String(o.label).toUpperCase(), r = role(B.p);
            if (/CENTER|CENTRE/.test(L)) { if (r !== 'center') return; s += 3; } else if (r === 'center') s -= 4;
            if (/SURR|REAR|BACK/.test(L)) s += r === 'surround' ? 3 : 0;
            if (/HEIGHT|ATMOS|TOP/.test(L)) s += r === 'surround' ? 1 : -2;
            if (/FRONT/.test(L) && r === 'main') s += 2 + Math.min(1, (B.p.price || 0) / 1e6); // the dearest pair goes in front
            if (r === 'sub') s -= 3; // a passive sub on a speaker output only when nothing else fits
          }
          if (o.sig === 'sub' || i.sig === 'sub') s += role(B.p) === 'sub' ? 2 : -2;
          if (o.sig === 'sub' && role(B.p) === 'sub') s += 8; // an amplifier's sub output before its line or pre output
          // an input named for this kind of source (LINE IN CD for a CD player, TUNER, NETWORK/STREAMER, TV, GAME)
          const IL = String(i.label).toUpperCase(), what = (A.p.kind + ' ' + A.p.name + ' ' + (A.p.cats || []).join(' ')).toLowerCase();
          if ((/\bCD\b/.test(IL) && /\bcd\b|cd-?afspill|cd-?spiller|\/cd/.test(what)) || (/TUNER|DAB|FM/.test(IL) && /tuner|dab|radio/.test(what))
            || (/NET|STREAM/.test(IL) && /stream|node|network/.test(what)) || (/\bTV\b/.test(IL) && /\btv\b|fjernsyn/.test(what)) || (/GAME/.test(IL) && /game|konsol/.test(what))) s += 0.5;
          if (conn(o.conn, o, 'out') === conn(i.conn, i, 'in')) s += 1; // same plug at both ends: no adapter (RCA sub out to the RCA input, not XLR)
          s += 1 / Math.max(1, ins.length); // a dedicated box (phono stage, DAC) before the amplifier's own input
          cand.push({ s, ai, oi, bi, ii, o, i });
        });
      });
    }));
    cand.sort((x, y) => y.s - x.s || x.oi - y.oi || x.ii - y.ii || x.ai - y.ai || x.bi - y.bi);
    const unit = (p) => !!(p.single || /\(1 unit\)/i.test(p.name || '') || /^(left|right)$|\b(left|right)$/i.test(String(p.name || '').trim()));
    const usedOut = new Map(), inUse = new Map(), pairs = new Map(), fed = new Map(), edges = devs.map(() => new Set()), out = [];
    const reach = (from, to) => { const seen = new Set([from]), st = [from]; while (st.length) { const n = st.pop(); if (n === to) return true; edges[n].forEach((m) => { if (!seen.has(m)) { seen.add(m); st.push(m); } }); } return false; };
    for (const c of cand) {
      const ok = c.ai + ':' + c.oi, ik = c.bi + ':' + c.ii, pk = c.ai + '>' + c.bi, side = LR(c.o.label);
      // a stereo speaker output (no L/R of its own) feeds two single speakers (cards of one unit, e.g. Phantom K-60 (1 Unit) x2)
      const first = usedOut.get(ok);
      if (first && !(first.n === 1 && !side && (c.o.sig === 'speaker' || c.o.sig === 'speakon') && unit(devs[c.bi].p) && unit(devs[first.bi].p) && first.bi !== c.bi)) continue;
      const prevIn = inUse.get(ik), prevPair = pairs.get(pk);
      // L and R outputs may both go to one input (a speaker pair card); nothing else shares an input or a pair of cards
      if (prevIn && !(side && prevIn.side && prevIn.side !== side && prevIn.ai === c.ai)) continue;
      if (prevPair && !(side && prevPair.side && prevPair.side !== side && prevPair.ik === ik)) continue;
      if (!prevPair && (pairs.has(c.bi + '>' + c.ai) || reach(c.bi, c.ai))) continue;
      const amp = c.o.sig === 'speaker' || c.o.sig === 'speakon' || c.o.sig === 'sub';
      if (!amp && fed.has(c.ai) && fed.get(c.ai) !== c.bi) continue;
      usedOut.set(ok, first ? { n: 2, bi: c.bi } : { n: 1, bi: c.bi }); inUse.set(ik, { side, ai: c.ai }); if (!prevPair) pairs.set(pk, { side, ik }); if (!amp) fed.set(c.ai, c.bi); edges[c.ai].add(c.bi);
      out.push({ a: { uid: devs[c.ai].uid, key: c.o.key }, b: { uid: devs[c.bi].uid, key: c.i.key } });
    }
    return out;
  }

  HP.ports = { CONNECTORS, SIGNALS, SIG, slug, makePort, parseLegacy, uniqueKeys, compatible, cableFit, cableEnds, mapPorts, family, conn, colorOf, autoWire, AUDIO, plug, cablePlugs, plugText, plugCore, plugIssues };
})();
