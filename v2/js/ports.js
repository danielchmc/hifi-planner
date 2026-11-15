/* HiFi Planner v2 — I/O standard.
   One vocabulary of signals and connector types used by every product card, so that
   ports can be matched when a card is replaced and cables can be suggested per wire.
   A port is { key, label, sig, conn }:
     label  "SIGNAL DIR DETAIL"   e.g. "HDMI IN 1", "SPEAKER OUT SURROUND BACK", "SUB OUT 2"
     key    slug of the label, unique per side of a product
     sig    signal id from SIGNALS      conn  connector id from CONNECTORS */
(function () {
  const HP = (window.HP = window.HP || {});

  const CONNECTORS = {
    hdmi: 'HDMI', optical: 'Optical', coax: 'Coaxial', rca: 'RCA', sub: 'Subwoofer', xlr: 'XLR',
    speaker: 'Speaker cable', speakon: 'Speakon', minijack: 'Minijack', jack: 'Jack 6.3', usb: 'USB',
    ethernet: 'Ethernet', trigger: 'Trigger', bnc: 'BNC', din: 'DIN', wireless: 'Wireless', other: 'Other',
  };

  // label = text on the card, conn = default connector, nodir = no IN/OUT word in the label
  const SIGNALS = [
    { id: 'hdmi', label: 'HDMI', conn: 'hdmi' },
    { id: 'hdmi-arc', label: 'HDMI ARC', conn: 'hdmi', nodir: true, fam: 'hdmi' },
    { id: 'hdmi-earc', label: 'HDMI eARC', conn: 'hdmi', nodir: true, fam: 'hdmi' },
    { id: 'optical', label: 'OPTICAL', conn: 'optical' },
    { id: 'coax', label: 'COAXIAL', conn: 'coax' },
    { id: 'digital', label: 'DIGITAL', conn: 'coax' },
    { id: 'aes', label: 'AES/EBU', conn: 'xlr' },
    { id: 'bnc', label: 'BNC', conn: 'bnc' },
    { id: 'usb', label: 'USB', conn: 'usb' },
    { id: 'usbc', label: 'USB-C', conn: 'usb', fam: 'usb' },
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
    { id: 'sub', label: 'SUB', conn: 'sub' },
    { id: 'speaker', label: 'SPEAKER', conn: 'speaker' },
    { id: 'speakon', label: 'SPEAKON', conn: 'speakon' },
    { id: 'trigger', label: 'TRIGGER', conn: 'trigger' },
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
    const m = /(\d+)/.exec(detail);
    return { key: slug(label), label, sig: def.id, conn: opts.conn || def.conn, n: m ? +m[1] : 0, detail };
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
    [/LINE|ANALOG|AUDIO|RCA|^CD\b|TUNER|RECORDER|STREAMING|^TV$/, 'line', /LINE|ANALOG|AUDIO|RCA/g],
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
  // which cable connector tags physically fit a port of a given connector type
  const ACCEPT = {
    hdmi: ['hdmi'], optical: ['optical'], coax: ['coax', 'rca'], rca: ['rca'], sub: ['sub', 'rca'],
    speaker: ['speaker'], speakon: ['speaker'], minijack: ['minijack'], trigger: ['minijack'],
    usb: ['usb'], ethernet: ['ethernet'], din: ['din'],
  };
  const accept = (conn) => ACCEPT[conn] || null; // null = unknown, anything goes
  function compatible(a, b) {
    const A = accept(a), B = accept(b);
    if (a === b || !A || !B) return true;
    if (A.some((x) => B.includes(x))) return true;
    const pair = [a, b].sort().join('|');
    return ['minijack|rca', 'minijack|sub', 'jack|minijack', 'jack|rca'].includes(pair);
  }
  // 2 = made for this wire, 1 = fits one end / unknown, 0 = wrong connector
  function cableFit(cableConns, a, b) {
    const A = accept(a), B = accept(b), C = cableConns || [];
    if (!A && !B) return 1;
    const fa = !A || C.some((c) => A.includes(c)), fb = !B || C.some((c) => B.includes(c));
    if (fa && fb) return A && B ? 2 : 1;
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

  HP.ports = { CONNECTORS, SIGNALS, SIG, slug, makePort, parseLegacy, uniqueKeys, compatible, cableFit, mapPorts, family };
})();
