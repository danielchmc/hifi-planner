/* HiFi Planner corrections of website facts, per website product SKU (the product SKU, not a colour or length variant).
   Hand-edited, like tools/taxonomy.js. The website's data in mirror/ is never changed; tools/catalog-build.js applies these on
   top of it (after the type rules in taxonomy.js) and lists them in build/report.md.

   Each entry may set
     kind, scope   as in tools/taxonomy.js (e.g. keep a product the website files as a package)
     facets        merged into the product's facts, e.g. { perMetre: true } for a cable the website sells by the metre but
                   marks as colours
     cat           a category id, e.g. '/hojtalere/vaeghojtaler/'
     note          why (shown in the report) */
module.exports = {
  // sold by the metre on the website, but its variants are marked as colours there
  'AQSLIPDB14-2SCX': { facets: { perMetre: true, axis: 'metre' }, note: 'sold per metre (website marks the variants as colours)' },
  'AQSLIPMAX14-2SCX': { facets: { perMetre: true, axis: 'metre' }, note: 'sold per metre (website marks the variants as colours)' },
  'AQSLIPMAX14-4SCX': { facets: { perMetre: true, axis: 'metre' }, note: 'sold per metre (website marks the variants as colours)' },
  // an in-wall centre speaker the website lists as a package: drawn and wired like any speaker
  LYNGLS1000C: { kind: 'speaker', scope: 'diagram', facets: { active: false, mount: 'inwall', role: 'center' }, note: 'in-wall centre speaker, kept in HiFi Planner' },
};
