/* One-off, 2026-11-23. Run once from the repository: node v2/tools/fix-2026-11-23-combo-sinox.js  (safe to run again: it only
   changes what is still to change). Edits data/own.js:
   1. "Sonos Combo Adapter - USB C - Eth./Minijack" (our own card, generic RCA photo, no SKU) was a duplicate of the website's
      Sonos Combo Adapter (SONCOMBOADAPT, in the catalogue as w-soncomboadapt). It becomes that product: linked to the website
      (price, colours Sort/Hvid, photo), keeping what our card had that the website does not: cable ends USB-C ↔ minijack, now with
      the plugs as they are (USB-C plug, minijack socket), so it can sit in a cable chain like a Y-splitter. Drawings with the old
      id open it as the new one (HP.MOVED in js/core.js).
   2. "Sinox SXA 1800 - DIN Female - 4xRCA" (our own card, no SKU, not sold by hifiklubben.dk) is marked discontinued: hidden
      from the search and the Katalog, kept (as UDGÅET) in drawings that have it. */
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'own.js');
const text = fs.readFileSync(file, 'utf8'), nl = text.includes('\r\n') ? '\r\n' : '\n';
const done = [];
const out = text.split(/\r?\n/).map((line) => {
  if (!line.startsWith('{"id":')) return line;
  const comma = /,\s*$/.test(line), o = JSON.parse(line.replace(/,\s*$/, ''));
  if (o.id === 'sonos-combo-adapter-usb-c-eth-minijack') {
    done.push('Combo Adapter merged into w-soncomboadapt');
    const e = { id: 'w-soncomboadapt', brand: 'Sonos', name: 'Combo Adapter', sku: 'SONCOMBOADAPT', img: ['hk:7c3e616c-77e0-4a6d-80ba-7866a0385798'],
      cable: ['usb', 'minijack', 'ethernet'], ends: ['usbc', 'minijack'], eg: ['m', 'f'], ech: [2, 2], cats: ['Cable'], link: { site: 'SONCOMBOADAPT' } };
    return JSON.stringify(e) + (comma ? ',' : '');
  }
  if (o.id === 'sinox-sxa-1800-din-female-4xrca' && !(o.frozen || {}).gone) {
    done.push('Sinox SXA 1800 marked discontinued');
    o.frozen = Object.assign({}, o.frozen, { gone: '2026-11-23' });
    return JSON.stringify(o) + (comma ? ',' : '');
  }
  return line;
});
if (out.filter((l) => l.startsWith('{"id":"w-soncomboadapt"')).length > 1) throw new Error('w-soncomboadapt would be in data/own.js twice: nothing written');
if (!done.length) { console.log('Nothing to change: already done.'); process.exit(0); }
fs.writeFileSync(file, out.join(nl));
console.log(done.join('\n') + '\nWritten: ' + file);
