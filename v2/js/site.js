/* HiFi Planner — everything that knows about hifiklubben.dk: image URLs, product-page parsing, category mapping,
   port suggestions from the website's specs, Bluetooth/WiFi. Runs in the browser and in Node (tools/price-sync.js). */
(function () {
  const HP = (window.HP = window.HP || {});
  const S = (HP.site = {});

  /* ---------- images: "hk:<uuid>" = a hifiklubben.com image, mirrored to img/hk/ by the GitHub job ---------- */
  const HK = /^hk:([0-9a-f-]{36})$/;
  const PRESET = { thumb: 'pcs', card: 'pdp_d', hd: 'yuge' }; // 170 / 620 / 1500 px
  S.isHK = (u) => HK.test(u || '');
  S.hk = (uuid) => 'hk:' + uuid;
  // local copy first, the website as fallback (until the job has mirrored it, or if a download failed)
  S.src = (u, size) => {
    const m = HK.exec(u || '');
    if (m) return size === 'hd' ? 'img/hd/hk/' + m[1] + '.webp' : 'img/hk/' + m[1] + '.webp';
    if (size === 'hd' && /^img\/[^/]+$/.test(u || '')) return 'img/hd/' + u.slice(4);
    return u || '';
  };
  // what to try when the local copy is missing, in order, separated by spaces: the website's picture in that size, then its
  // small one (the one the product list shows, usually already in the browser's cache)
  S.fallback = (u, size) => {
    const m = HK.exec(u || '');
    if (m) { const at = (p) => 'https://images.hifiklubben.com/image/' + m[1] + '/' + p + '/x.jpg', own = PRESET[size] || 'pdp_d'; return own === 'pcs' ? at('pcs') : at(own) + ' ' + at('pcs'); }
    return size === 'hd' ? u : '';
  };
  // onerror handler for <img>: try the next fallback, then hide. images.hifiklubben.com sometimes neither sends a large size
  // nor fails (the request hangs); a picture that has not come in 4 s moves on to the next fallback too.
  S.onerr = function () {
    const rest = (this.dataset.fb || '').split(' ').filter((x) => x && x !== this.src);
    if (!rest.length) { this.dataset.fb = ''; return this.classList.add('broken'); }
    const next = rest.shift(); this.dataset.fb = rest.join(' '); this.src = next;
    if (rest.length) setTimeout(() => { if (this.src === next && !(this.complete && this.naturalWidth)) S.onerr.call(this); }, 4000);
  };

  /* ---------- website product types (modelType, Danish) -> HiFi Planner ---------- */
  S.TYPE_CATS = {
    'Integreret forstærker': ['Integrated Amplifiers'], 'Stereoforstærker med streaming': ['Amplifiers with Streaming'], 'Forforstærker': ['Pre Amplifiers'], 'Effektforstærker': ['Power Amplifiers'],
    'Effektforstærker til installation': ['Power Amplifiers CI'], 'Multikanaleffektforstærker': ['Multi-Channel Amplifiers'], 'Multirumsforstærker': ['Multiroom Amplifiers'], 'Receiver': ['Receivers'],
    'Hjemmebio-receiver': ['Home Cinema Receivers'], 'Surround-processor': ['Surround-Processors'], 'Kompaktanlæg': ['Compact Amplifiers'], 'Kompaktanlæg med Streaming': ['Compact Amplifiers with Streaming'],
    'Gulvhøjtaler': ['Passive Speakers', 'Floorstanding Speakers'], 'Kompakt højtaler': ['Passive Speakers', 'Compact Speakers'], 'Kompakt højtaler – Aktive': ['Active Speakers', 'Compact Speakers'],
    'Centerhøjtaler': ['Passive Speakers', 'Center Speakers'], 'Væghøjtaler': ['Passive Speakers', 'On-Wall Speakers'], 'Subwoofer': ['Subwoofers'], 'Passiv subwoofer': ['Subwoofers'], 'Trådløs subwoofer': ['Subwoofers'],
    'Indbygningshøjtaler til loft': ['CI & Outdoor Speakers'], 'Indbygningshøjtaler til væg': ['CI & Outdoor Speakers'], 'Udendørshøjtaler': ['CI & Outdoor Speakers'],
    'Trådløs højtaler': ['Wireless/Bluetooth Speakers'], 'Trådløs højtaler med batteri': ['Wireless/Bluetooth Speakers'], 'Soundbar': ['Soundbar/TV Audio'],
    'Musikstreamer': ['Streamers'], 'Musikstreamer med Radio': ['Streamers with Radio'], 'CD-afspiller': ['CD Players'], 'Pladespiller': ['Turntables'], 'RIAA-forstærker': ['RIAA Amplifiers'],
    'Radio': ['Radios'], 'D/A-konverter': ['D/A Converters'], 'Høretelefon-forstærker': ['Headphone Amplifiers'], 'Bluetooth receiver': ['Bluetooth Receivers'], 'Trådløs adapter': ['Wireless Adapters'],
    'OLED TV': ['TV', 'OLED'], 'QD-OLED TV': ['TV', 'OLED'], 'QLED TV': ['TV', 'QLED'], 'Neo QLED TV': ['TV', 'QLED'], 'Mini-LED TV': ['TV'], 'LED TV': ['TV'], 'True RGB TV': ['TV'], 'Micro RGB TV': ['TV'],
    'Videoprojektor': ['TV'], 'Blu-ray afspiller': ['Peripherals'], 'Switch box': ['Peripherals'],
  };
  S.TYPE_CABLE = { 'Højtalerkabel': ['speaker'], 'Signalkabel': ['rca'], 'HDMI-kabel': ['hdmi'], 'Optisk kabel': ['optical'], 'Coaxial-kabel': ['coax'], 'Minijack-kabel': ['minijack'],
    'Subwoofer-kabel': ['sub'], 'USB-kabel': ['usb'], 'Netværkskabel': ['ethernet'], 'Digitalkabel': ['coax'], 'AES/EBU-kabel': ['xlr'], 'Y-splitter/Y-adapter': ['rca'] };
  S.relevant = (type) => !!(S.TYPE_CATS[type] || S.TYPE_CABLE[type]);

  /* ---------- colour swatches for variants ---------- */
  const KEY_HEX = { Black: '#1b1b1d', White: '#f4f4f2', Wood: '#8a5a3b', Grey: '#8a8d93', Blue: '#2f4b7c', Green: '#3f6650', Yellow: '#e9b949', Red: '#b3352f', Silver: '#c9c9c9',
    Brown: '#6b4a2f', Gold: '#c9a54a', Beige: '#d8c7a6', Pink: '#e3b1bd', Orange: '#e07a2f', Brass: '#b5a642', Purple: '#6d4b8d', Multi: '#999' };
  S.swatch = (v) => (/^#[0-9a-f]{3,8}$/i.test(v.hex || '') ? v.hex : KEY_HEX[v.key] || '#999');

  /* ---------- product page parsing (raw HTML, as served) ---------- */
  const KEEP = /indgang|udgang|HDMI|Trådløs|Tilslutning|Bluetooth|Wi-?Fi|Zoner|Forstærker kanaler|Kanaler|RIAA|Indgange|Udgange|Højtaler type|Streaming$/i;
  S.DESC = 'Fra beskrivelsen';
  const DESC_IO = /indgang|udgang|input|output|tilslutning|-ud\b|-ind\b|\bud\b|hdmi|optisk|toslink|coax|koaksial|xlr|euroblock|trigger|ethernet|lan-port|subwoofer-?ud|pre-?out|line-?out|højtalerudgang|højttalerudgang/i;
  const DESC_SKIP = /^(ikke|kun|obs: dobbelt)|udgangseffekt|effekt:|watt|impedans|vælger|standby|medfølger|ladekabel|kabel med|opløsning|thd|støj|firmware/i;
  S.parsePage = (html) => {
    const dec = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const spec = {};
    for (const m of html.matchAll(/<tr><th>([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/g)) { const k = dec(m[1]), v = dec(m[2]); if (k && KEEP.test(k) && !(k in spec)) spec[k] = v.slice(0, 240); }
    // many pages list the connections only in the description ("Indgange: USB-B, optisk…", "4 x balanceret analog indgang")
    const desc = [];
    for (const m of html.matchAll(/<tr><td>([\s\S]*?)<\/td><\/tr>/g)) { const v = dec(m[1]); if (v.length < 220 && DESC_IO.test(v) && !DESC_SKIP.test(v) && !desc.includes(v)) desc.push(v); }
    if (desc.length) spec[S.DESC] = desc.slice(0, 14).join(' · ');
    let prod = null;
    for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try { const j = JSON.parse(m[1]); for (const x of j['@graph'] || [j]) if (x && x['@type'] === 'Product') prod = prod || x; } catch (e) { /* not JSON */ }
    }
    const gallery = [];
    for (const im of (prod && [].concat(prod.image || [])) || []) { const u = typeof im === 'string' ? im : im && im.url; const mm = /image\/([0-9a-f-]{36})/.exec(u || ''); if (mm && !gallery.includes(mm[1])) gallery.push(mm[1]); }
    const offers = prod ? [].concat(prod.offers || []) : [];
    const web = offers.find((o) => o.name === 'Webshop') || offers[0];
    return { spec, gallery, avail: web ? String(web.availability || '').replace(/^https?:\/\/schema\.org\//, '') : '' };
  };

  /* ---------- Bluetooth / WiFi from the specs (null = the website does not say) ---------- */
  S.wireless = (spec) => {
    if (!spec) return null;
    const w = spec['Trådløs overførsel'] || '', bt0 = spec.Bluetooth, stream = spec.Streaming || '';
    const known = w || bt0 || spec['Bluetooth version'] || spec['Bluetooth type'] || spec['Wi-Fi version'] || stream;
    if (!known) return null;
    return {
      bt: /bluetooth/i.test(w + ' ' + stream) || /^ja$/i.test(bt0 || '') || !!spec['Bluetooth version'] || !!spec['Bluetooth type'],
      wifi: /wi-?fi|airplay|sonos|bluos|heos|roon|chromecast|spotify connect|tidal connect/i.test(w + ' ' + stream) || !!spec['Wi-Fi version'],
    };
  };

  /* ---------- port suggestions from specs + category (a starting point; an admin checks them) ---------- */
  /* Ports from the description lines. Rough by nature: the admin checks them against the rear photo. */
  S.descPorts = (text, cats) => {
    const hpAmp = (cats || []).includes('Headphone Amplifiers');
    const IN = [], OUT = [];
    const T = [ // [regex, signal] in priority order
      [/\bhdmi\b/i, 'hdmi'], [/optisk|optical|toslink/i, 'optical'], [/coax|koaksial|s\/pdif/i, 'coax'],
      [/euroblock|\bxlr\b|(?<!u)balanceret analog/i, 'bal'], [/phono/i, 'phono'], [/usb-?c\b/i, 'usbc'], [/\busb\b|usb-?b\b|usb-?a\b/i, 'usb'],
      [/minijack|3,5 ?mm/i, 'minijack'], [/subwoofer/i, 'sub'], [/pre-?out|forforstærker-?ud/i, 'pre'], [/ethernet|lan-port|\blan\b/i, 'lan'],
      [/trigger/i, 'trigger'], [/højt?talerudgang|højt?talerterminal|lo-z|hi-z|speaker/i, 'speaker'], [/\brca\b|line|linje|analog/i, 'line'],
    ];
    const PH = [[/4-pin xlr|xlr.*høretelefon/i, 'XLR'], [/4,4 ?mm/i, '4.4'], [/6,3?5? ?mm|6,3\b/i, '6.35'], [/3,5 ?mm|minijack/i, '3.5']];
    for (const line of String(text || '').split(' · ')) {
      const c = line.indexOf(':'), pre = c > 0 && c < 45 ? line.slice(0, c) : '', body = pre ? line.slice(c + 1) : line;
      const phones = /høretelefon|hovedtelefon|headphone/i.test(pre) || (/høretelefon/i.test(line) && /udgang|-ud\b|\bud\b/i.test(line)) || (hpAmp && /jack|\d ?mm/i.test(line));
      const dirOf = (s) => { const i = /indgang|input|-ind\b|\bind\b|\bin\b/i.test(s), o = /udgang|output|-ud\b|\bud\b|\bout\b|-out\b/i.test(s); return i && o ? 'both' : i ? 'in' : o ? 'out' : ''; };
      const dir0 = dirOf(pre);
      // "1 HDMI-indgang og 1 HDMI-udgang", "Indgange: A, B, C"
      for (const seg of body.split(/,(?=\s)|;| og | \/ | \+ /)) {
        const hits = T.filter(([r]) => r.test(seg)).map(([, sig]) => sig);
        const dir = dirOf(seg) || dir0 || (phones ? 'out' : '') || (hits[0] === 'lan' ? 'in' : '');
        if (!dir) continue;
        const n = Math.min(8, +((/(\d+)\s*x\b/i.exec(seg) || /^\s*(\d+)\s/.exec(seg) || [])[1] || 1));
        if (phones && dir === 'out') { const ph = PH.find(([r]) => r.test(seg)); if (ph) { OUT.push(['phones', ph[1]]); continue; } }
        // "line-out (RCA/optisk)" and "phono- eller linjeniveau" = both; otherwise the first match wins ("ubalanceret analog indgang (RCA)" = line)
        const sigs = /\(.*\/.*\)| eller /.test(seg) ? [...new Set(hits)] : hits.slice(0, 1);
        for (const sig of sigs) {
          const s = sig === 'hdmi' && /earc/i.test(seg) ? 'hdmi-earc' : sig === 'hdmi' && /\barc/i.test(seg) ? 'hdmi-arc' : sig === 'minijack' && dir === 'in' ? 'aux' : sig;
          const hz = /hi-z/i.test(seg) ? 'HI-Z ' : '';
          for (let i = 1; i <= n; i++) {
            const detail = n > 1 ? hz + i : hz.trim();
            if (dir === 'in' || dir === 'both') IN.push([s, detail]);
            if (dir === 'out' || dir === 'both') OUT.push([s === 'aux' ? 'minijack' : s, detail]);
          }
        }
      }
    }
    return { in: IN, out: OUT };
  };

  S.suggestPorts = (spec, cats) => {
    const P = HP.ports; spec = spec || {}; cats = cats || [];
    const has = (c) => cats.includes(c);
    const list = (s) => String(s || '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
    const IN = [], OUT = [];
    const add = (arr, side, sig, detail, opts) => { const p = P.makePort(sig, side, detail || '', opts); if (!arr.some((q) => q.label === p.label)) arr.push(p); };
    const num = (s) => { const m = /(\d+)/.exec(String(s || '')); return m ? +m[1] : 0; };
    const amp = cats.some((c) => /Amplifiers|Receivers|Surround-Processors/.test(c)) && !has('Pre Amplifiers') && !has('Headphone Amplifiers') && !has('RIAA Amplifiers') && !has('Surround-Processors');
    const tv = has('TV'), source = has('CD Players') || has('Turntables') || has('Streamers') || has('Streamers with Radio');
    // inputs
    const hdmiIn = num(spec['HDMI indgange'] || spec['Total HDMI Inputs']);
    const audioIn = list(spec.Lydindgang).concat(list(spec.Indgange));
    const otherIn = list(spec['Indgang (andet)']), wired = list(spec['Tilslutninger (kablet)']);
    const arc = /^ja/i.test(spec['HDMI ARC/CEC'] || '') || /arc/i.test(spec['HDMI ARC/eARC'] || '');
    if (tv) { for (let i = 1; i <= (hdmiIn || 3); i++) add(IN, 'in', 'hdmi', String(i)); }
    else if (hdmiIn > 1) { for (let i = 1; i <= hdmiIn; i++) add(IN, 'in', 'hdmi', String(i)); }
    else if (hdmiIn === 1 || audioIn.includes('HDMI') || wired.includes('HDMI')) add(IN, 'in', arc || has('Soundbar/TV Audio') || has('Active Speakers') ? 'hdmi-earc' : 'hdmi', '');
    const map = { Coaxial: 'coax', Optisk: 'optical', 'Analog RCA': 'line', 'Analog XLR': 'bal', Pladespiller: 'phono', 'Pladespiller/Phono': 'phono', 'Minijack/AUX': 'aux', 'USB A': 'usb', 'USB C': 'usbc' };
    const cdAnalogOut = has('CD Players') && audioIn.includes('Analog RCA'); // the website lists a CD player's analog output as an input
    audioIn.concat(wired.filter((w) => /Pladespiller|Analog XLR|Minijack/.test(w))).forEach((x) => { if (map[x] && !(cdAnalogOut && x === 'Analog RCA')) add(IN, 'in', map[x], '', x === 'Minijack/AUX' ? { conn: 'minijack' } : undefined); });
    if (otherIn.includes('12V trigger')) add(IN, 'in', 'trigger', '');
    // the description is only used when the spec table lists no connections (otherwise ports would be counted twice)
    const tableIO = ['Lydindgang', 'Indgange', 'Indgang (andet)', 'Tilslutninger (kablet)', 'HDMI indgange', 'Total HDMI Inputs', 'Lydudgang', 'Udgange', 'Udgang (andet)', 'HDMI udgange'].some((k) => spec[k]);
    const dp = tableIO ? { in: [], out: [] } : S.descPorts(spec[S.DESC], cats);
    dp.in.forEach(([sig, d]) => add(IN, 'in', sig, d, sig === 'aux' ? { conn: 'minijack' } : undefined));
    if (otherIn.includes('Ethernet') || wired.includes('Ethernet')) add(IN, 'in', 'lan', '');
    if (has('Passive Speakers') || has('CI & Outdoor Speakers') || (has('Subwoofers') && !audioIn.length && !otherIn.length && !has('Wireless/Bluetooth Speakers') && /Passiv/.test(spec['Højtaler type'] || ''))) add(IN, 'in', 'speaker', '');
    if (has('Subwoofers') && !IN.length && !otherIn.includes('Ethernet')) add(IN, 'in', 'line', '');
    if ((has('Power Amplifiers') || has('Power Amplifiers CI')) && !IN.length) add(IN, 'in', 'line', '');
    // outputs
    const audioOut = list(spec.Lydudgang).concat(list(spec.Udgange)), otherOut = list(spec['Udgang (andet)']);
    const hdmiOut = num(spec['HDMI udgange']);
    if (tv) { add(OUT, 'out', 'hdmi-earc', ''); add(OUT, 'out', 'optical', ''); }
    for (let i = 1; i <= hdmiOut; i++) add(OUT, 'out', 'hdmi', hdmiOut > 1 ? String(i) : '');
    if (cdAnalogOut) add(OUT, 'out', 'line', '');
    const omap = { 'Subwoofer-out': 'sub', LFE: 'sub', 'Pre-out': 'pre', 'Analog RCA': 'line', 'Analog XLR': 'bal', Coaxial: 'coax', Optisk: 'optical', 'S/PDIF': 'optical', Hovedtelefon: 'phones', 'Minijack/AUX': 'minijack' };
    audioOut.forEach((x) => omap[x] && add(OUT, 'out', omap[x], ''));
    if (wired.includes('Subwoofer') && !OUT.some((p) => p.sig === 'sub')) add(OUT, 'out', 'sub', '');
    if (wired.includes('Pre-out') && !OUT.some((p) => p.sig === 'pre')) add(OUT, 'out', 'pre', '');
    if (otherOut.includes('12V trigger')) add(OUT, 'out', 'trigger', '');
    dp.out.forEach(([sig, d]) => add(OUT, 'out', sig, d));
    if (has('Turntables')) { add(OUT, 'out', 'phono', ''); if (/^ja/i.test(spec['RIAA-forstærker'] || '')) add(OUT, 'out', 'line', ''); }
    if (has('RIAA Amplifiers') && !IN.some((p) => p.sig === 'phono')) { IN.length = 0; add(IN, 'in', 'phono', ''); }
    if (amp || has('Compact Amplifiers') || has('Compact Amplifiers with Streaming')) {
      const ch = num(spec['Forstærker kanaler']);
      if (has('Home Cinema Receivers') || ch >= 5) {
        ['FRONT', 'CENTER', 'SURROUND'].concat(ch >= 7 ? ['SURROUND BACK'] : []).forEach((d) => add(OUT, 'out', 'speaker', d));
        for (let i = 1; i <= Math.max(0, Math.floor((ch - 7) / 2)); i++) add(OUT, 'out', 'speaker', 'HEIGHT ' + i);
      } else if (!OUT.some((p) => p.sig === 'speaker')) add(OUT, 'out', 'speaker', '');
    }
    return { in: P.uniqueKeys(IN), out: P.uniqueKeys(OUT) };
  };
})();
