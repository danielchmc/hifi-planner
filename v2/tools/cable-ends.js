/* The connector at each end of a cable, worked out from what is known about it (used by tools/catalog-build.js).
   Connector ids are those of js/ports.js (CONNECTORS). A cable's ends chosen by hand in the Editor are kept in data/own.js
   and always win; these rules only fill in cables nobody has set.

   Evidence, strongest first:
     name      connectors named in the cable's name, in the order they appear ("Evergreen - Minijack - RCA", "USB B - USB A")
     spec      the website's connector field "Stik" (a list without ends, e.g. "RCA, 3.5mm stereo minijack")
     type      the usual plugs of the website's cable type (an HDMI cable has HDMI at both ends, a subwoofer cable RCA…)
     set       the connector list stored on HiFi Planner's own cable (data from before the ends existed)
     guess     nothing above settles it (a USB cable that does not say which USB, a "Kabel"): listed in the report for checking */

// each pattern is matched once; its text is blanked so that e.g. "Mini Jack" is not also read as "Jack"
const TOKENS = [
  [/mini[- ]?toslink|toslink[- ]?mini|mini[- ]?optical/i, 'minitoslink'],
  [/toslink|optical|optisk|\boptic\b/i, 'optical'],
  [/hdmi/i, 'hdmi'],
  [/micro[- ]?usb/i, 'microusb'],
  [/usb[- ]?c\b|type[- ]?c\b/i, 'usbc'], [/usb[- ]?b\b/i, 'usbb'], [/usb[- ]?a\b/i, 'usba'],
  [/\bxlr\b/i, 'xlr'], [/\bbnc\b/i, 'bnc'], [/\bdin\b/i, 'din'], [/speakon/i, 'speakon'],
  [/mini[- ]?jack|3[.,]5 ?mm|\bmj\b/i, 'minijack'], [/4[.,]4 ?mm/i, 'jack44'], [/2[.,]5 ?mm/i, 'jack25'], [/6[.,]35? ?mm|\bjack\b/i, 'jack'],
  [/(?:\dx|(?<![a-z]))rca(?![a-z])|\bphono\b|\bcinch\b/i, 'rca'], [/\bcoax(ial)?\b/i, 'rca'],
  [/ethernet|\blan\b|rj[- ]?45|\bcat ?[5-8]/i, 'ethernet'],
];
function tokens(text, skip) {
  let s = ' ' + String(text || '') + ' ';
  const hits = [];
  for (const [re, id] of TOKENS) {
    if (skip && skip.includes(id)) continue;
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m; while ((m = g.exec(s))) { hits.push([m.index, id]); s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length); g.lastIndex = m.index + m[0].length; }
  }
  return hits.sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((id, i, a) => a.indexOf(id) === i);
}

// type key → [the usual ends, certain?]
const BY_TYPE = {
  LoudSpeakerCable: [['speaker', 'speaker'], true], SignalCable: [['rca', 'rca'], true], HDMIcable: [['hdmi', 'hdmi'], true],
  Opticalcabel: [['optical', 'optical'], true], CoaxialCabel: [['rca', 'rca'], true], DigitalCable: [['rca', 'rca'], false],
  MiniJackCable: [['minijack', 'minijack'], true], SubwooferCable: [['rca', 'rca'], true], USBCabel: [['usba', 'usbb'], false],
  Networkcabel: [['ethernet', 'ethernet'], true], AesEbuCabel: [['xlr', 'xlr'], true], YSplitYAdapter: [['rca', 'rca'], false],
  AntennaCable: [['antenna', 'antenna'], true], PowerCable: [['power', 'power'], true],
};
const LEGACY = { coax: 'rca', sub: 'rca', trigger: 'minijack', usb: 'usbb' };
const pair = (l) => [l[0], l[1] || l[0]];

function deriveEnds({ name, model, typeKey, stik, set }) {
  const short = /\busb[- ]?([abc])([abc])\b/i.exec(name || '') || /\busb[- ]?([abc])([abc])\b/i.exec(model || ''); // "USB CC" = USB-C ↔ USB-C, "USB AB"…
  if (short) return { ends: ['usb' + short[1].toLowerCase(), 'usb' + short[2].toLowerCase()], how: 'name' };
  const skip = typeKey === 'AntennaCable' ? ['rca'] : null; // "coax" on an antenna cable is the TV plug
  const fromName = tokens(name, skip).length ? tokens(name, skip) : tokens(model, skip);
  const fromSpec = tokens(stik, skip), fromSet = (set || []).map((c) => LEGACY[c] || c).filter((c, i, a) => a.indexOf(c) === i && c !== 'wireless');
  const typ = BY_TYPE[typeKey];
  if (fromName.length >= 2) return { ends: pair(fromName), how: 'name' };
  if (fromName.length === 1) {
    const more = [fromSpec, fromSet].find((l) => l.length === 2 && l.includes(fromName[0]));
    if (more) return { ends: [fromName[0], more.find((c) => c !== fromName[0])], how: 'name+spec' };
    // USB named without its type ("USB") cannot be decided from the name alone
    return { ends: pair(fromName), how: 'name' };
  }
  if (fromSpec.length) return { ends: pair(fromSpec), how: 'spec' };
  if (typ) return { ends: typ[0].slice(), how: typ[1] ? 'type' : 'guess' };
  if (fromSet.length) return { ends: pair(fromSet), how: 'set' };
  return { ends: ['other', 'other'], how: 'guess' };
}

module.exports = { deriveEnds, tokens };
