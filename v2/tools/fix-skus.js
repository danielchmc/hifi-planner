/* One-off data fix (Nov 2026): give products with shared or missing SKUs their real hifiklubben.dk variant SKU.
   node tools/fix-skus.js <data dir> [website dump, one JSON product per line] */
const fs = require('fs'), path = require('path');
const [, , DIR, DUMP] = process.argv;
const file = path.join(DIR, 'products.js'), text = fs.readFileSync(file, 'utf8');
const products = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
const web = new Set();
if (DUMP) fs.readFileSync(DUMP, 'utf8').split(/\r?\n/).filter(Boolean).forEach((l) => { const j = JSON.parse(l.replace(/^﻿/, '')); web.add(j.sku.toUpperCase()); j.variants.forEach((v) => web.add(v.sku.toUpperCase())); });

// Shared SKUs (data errors). Values not found on the website are best guesses from the SKU naming pattern.
const FIXED = {
  'argon-audio-aurora': 'ARGTTAURORA',
  'audioquest-rocket-44-single-wire-1-5m': 'AQROCKET44SC1,5AA',
  'audioquest-rocket-44-bi-wire-1-5m': 'AQROCKET44SC1,5BA',
  'audioquest-rocket-33-single-wire-1-5m': 'AQROCKET33SC1,5AA',
  'audioquest-rocket-33-bi-wire-1-5m': 'AQROCKET33SC1,5BA',
  'bowers-and-wilkins-cwm8-5-d-1-unit': 'BWCWM8-5D',
  'denon-dcd-900ne': 'DENDCD900NE',
};
// Cable families: catalogue name (without length) -> website SKU. {aq} = metres as "12,0"/"0,75", {cm} = centimetres as "075"/"1000".
const FAMILIES = {
  'AudioQuest|Golden Gate': 'AQGOLDENGATEIN{aq}', 'AudioQuest|Golden Gate - Minijack': 'AQGOLDENGATEMJ{aq}',
  'AudioQuest|Forest, Optical': 'AQFORESTOPT{aq}', 'AudioQuest|Forest, Ethernet': 'AQFORESTRJE{aq}', 'AudioQuest|Forest, COAXIAL': 'AQFORESTCOX{aq}',
  'AudioQuest|Forest UHS - HDMI': 'AQFOREST48HDMI{aq}', 'AudioQuest|Pearl UHS - HDMI': 'AQPEARL48HDMI{aq}', 'AudioQuest|Pearl': 'AQPEARLRJE{aq}',
  'AudioQuest|Forest, USB A - USB C': 'AQFORESTUSBAC{aq}', 'AudioQuest|Forest, USB B - USB C': 'AQFORESTUSBBC{aq}',
  'AudioQuest|Evergreen - Minijack - RCA': 'AQEVERGREENMJIN{aq}', 'AudioQuest|Evergreen - Minijack': 'AQEVERGREENMJ{aq}', 'AudioQuest|Evergreen In': 'AQEVERGREENIN{aq}',
  'AudioQuest|Greyhound - Sub': 'AQGREYHOUNDSUB{aq}', 'AudioQuest|Black Lab - Sub': 'AQBLACKLABSUB{aq}',
  'AudioQuest|Rocket 44 -': 'AQROCKET44SC', 'AudioQuest|Rocket 33 -': 'AQROCKET33SC', 'AudioQuest|Rocket 22 -': 'AQROCKET22SCWH', 'AudioQuest|Rocket 11 -': 'AQROCKET11SCWH',
  'AudioQuest|Q2 -': 'AQQ2SC', 'AudioQuest|Slip XTRM 14/4 -': 'AQSLIPXTREM14-4SC', 'AudioQuest|Slip XTRM 14/2 -': 'AQSLIPXTREM14-2SC',
  'AudioQuest|Slip 14/4 dB -': 'AQSLIPDB14-4SC', 'AudioQuest|Slip 14/2 dB -': 'AQSLIPDB14-2SC',
  'Essentials|Classic HDMI': 'ESSCL1HDMI{cm}', 'Essentials|Classic RCA': 'ESSCL1IN{cm}', 'Essentials|Classic Optical': 'ESSCL1OPT{cm}', 'Essentials|Classic Sub': 'ESSCL1SUB{cm}',
  'Essentials|Classic Minijack1 - RCA': 'ESSCL1MJIN{cm}', 'Essentials|Classic Minijack1': 'ESSCL1MJ{cm}', 'Essentials|Prime RCA': 'ESSPR1IN{cm}',
  'Essentials|Basic HDMI': 'ESSBA1HDMI{cm}', 'Essentials|Basic Optical': 'ESSBA1OPT{cm}', 'Essentials|Basic Sub': 'ESSBA1SUB{cm}', 'Essentials|USB CC': 'ESSCL1USBCC{cm}',
  'Essentials|Excellence 1 Complete -': 'ESSEX1SCCOM{cm}', 'Essentials|Wireless Audio Adapter': 'ESSWIRCONNECTBK',
  'Essentials|Prime Speaker Cable 2 -': 'ESSPR2SC', 'Essentials|Prime Speaker Cable -': 'ESSPR1SC', 'Essentials|Classic Speaker Cable 2 -': 'ESSCL2SC',
  'Essentials|Classic Speaker Cable 1 -': 'ESSCL1SC', 'Essentials|CL1 SC Pro -': 'ESSCL1SCPRO', 'Essentials|Basic Speaker Cable 2 -': 'ESSBA2SC', 'Essentials|Basic Speaker Cable 1 -': 'ESSBA1SC',
};
const rows = [];
for (const p of products) {
  let sku = FIXED[p.id], why = 'shared SKU';
  const m = /^(.*?)\s*([\d.,]+)\s*m$/i.exec(p.name);
  const fam = FAMILIES[p.brand + '|' + (m ? m[1] : p.name)];
  if (!sku && fam && (!p.sku || p.sku === 'AQGOLDENGATEIN')) {
    const len = m ? parseFloat(m[2].replace(',', '.')) : 0;
    sku = fam.replace('{aq}', String(len.toFixed(len * 10 % 1 ? 2 : 1)).replace('.', ',')).replace('{cm}', String(Math.round(len * 100)).padStart(3, '0'));
    why = p.sku ? 'shared SKU' : 'missing SKU';
    if (!web.has(sku)) { rows.push(['skipped', p.brand + ' ' + p.name, p.sku || '', sku + ' (not on website)']); continue; }
  }
  if (!sku || sku === p.sku) continue;
  rows.push([why, p.brand + ' ' + p.name, p.sku || '', sku + (web.size && !web.has(sku) && !web.has(sku + 'X') && ![...web].some((w) => w.startsWith(sku)) ? ' (guess, not on website)' : '')]);
  p.sku = sku;
}
fs.writeFileSync(file, '/* HiFi Planner products. Edit through the app (Admin), not by hand. */\nwindow.HP_DATA = window.HP_DATA || {};\nwindow.HP_DATA.products = ' + JSON.stringify(products).replace(/\},\{"id"/g, '},\n{"id"') + ';\n');
const md = '# SKU fixes (Nov 2026)\n\n| Change | Product | Old SKU | New SKU |\n|---|---|---|---|\n' + rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
fs.writeFileSync(path.join(__dirname, 'sku-fixes.md'), md);
console.log(rows.filter((r) => r[0] !== 'skipped').length, 'changed,', rows.filter((r) => r[0] === 'skipped').length, 'skipped');
