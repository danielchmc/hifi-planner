/* HiFi Planner v2 — usage statistics (Umami, cookieless).
   Off until a website id is set in data/config.js (analytics.umami). Only on the live site: never from a local copy opened as a
   file, localhost or a test address. Counts per shop number, and with the seller's name once the seller has been told (login
   screen, or a one-time dialog). Never customer data or drawings.
   The customer view counts as its own page ("/kunde"); the link's drawing (after #) is never sent.
   Events: HP.stat('name', { …extra }) — queued until the script has loaded. */
(function () {
  'use strict';
  const cfg = (window.HP_DATA && window.HP_DATA.config && window.HP_DATA.config.analytics) || {};
  const LIVE = /(^|\.)danielchmc\.github\.io$|(^|\.)hifiplanner\.dk$/i.test(location.hostname) && location.protocol === 'https:';
  const on = !!(cfg.umami && LIVE);
  const queue = [];
  const shop = () => { try { return (window.HP && HP.LS && HP.LS.get('shop')) || ''; } catch (e) { return ''; } };

  /* Sellers are told, on the login screen and once in a dialog, that their use is recorded with their name, only to improve the
     program. Until a seller has seen it (HP.LS 'statsAck': seller numbers), their activity counts per shop only, without a name. */
  const NOTE_DA = 'Din aktivitet i HiFi Planner registreres med dit navn. Det bruges udelukkende til at finde ud af, hvordan programmet kan forbedres. Kunder registreres ikke med navn.';
  const NOTE_EN = 'Your activity in HiFi Planner is recorded with your name. It is used only to find out how the program can be improved. Customers are not recorded by name.';
  HP.statsNotice = () => HP.t(NOTE_EN, NOTE_DA);
  const acked = () => { try { return HP.LS.get('statsAck', []) || []; } catch (e) { return []; } };
  const seller = () => { try { const x = HP.seller && HP.seller(); return x && acked().includes(x.no) ? x : null; } catch (e) { return null; } };
  HP.statsAck = (no) => { const a = acked(); if (no && !a.includes(no)) { a.push(no); HP.LS.set('statsAck', a); } };
  // after login: tell a seller who has not seen it yet (only when statistics are on)
  HP.statsNoticeOnce = () => {
    const x = HP.seller && HP.seller();
    if (!on || !x || acked().includes(x.no)) return identify();
    const close = HP.modal({ title: HP.t('About statistics', 'Om statistik'), size: 'sm', body: HP.h('p', null, HP.statsNotice()),
      foot: [HP.h('.spacer'), HP.h('button.btn.primary', { onclick: () => { HP.statsAck(x.no); close(); identify(); } }, HP.t('Understood', 'Forstået'))] });
  };
  // the seller's name on this visit, so Umami's Sessions and Realtime show who it is (planner only, never the customer page)
  function identify() {
    const x = seller();
    if (!on || !x || viewing() || !(window.umami && window.umami.identify)) return;
    try { window.umami.identify(x.name, { navn: x.name, butik: shop() }); } catch (e) { /* ignore */ } // the name only, never the seller number
  }
  const viewing = () => /^#t=/.test(location.hash);
  const page = () => (viewing() ? '/kunde' : '/planner');

  // send now if Umami is there, else keep it for when it is
  function send(name, data) {
    if (!on) return;
    const payload = (p) => Object.assign({}, p, { url: page(), title: viewing() ? 'Kundeside' : 'Planner', referrer: '' }, name ? { name, data } : {});
    // the function form keeps Umami's own fields (website id, hostname, screen, language) and replaces only the address
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(payload);
    else queue.push([name, data]);
  }
  HP.stat = (name, data) => {
    try { const x = viewing() ? null : seller(); send(name, Object.assign(viewing() ? {} : { shop: shop() }, x ? { saelger: x.name } : {}, data || {})); } catch (e) { /* statistics must never break the app */ }
  };

  if (!on) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = cfg.umamiScript || 'https://cloud.umami.is/script.js';
  s.setAttribute('data-website-id', cfg.umami);
  s.setAttribute('data-auto-track', 'false');   // the page view below sends a clean address, without the drawing after #
  s.setAttribute('data-exclude-hash', 'true');
  s.setAttribute('data-exclude-search', 'true');
  s.setAttribute('data-do-not-track', 'true');  // a browser asking not to be tracked is not counted
  s.onload = () => { identify(); send(null); queue.splice(0).forEach(([n, d]) => send(n, d)); };
  document.head.append(s);

  // the planner: a login or a change of seller counts (shop number only)
  // the planner: a login or a change of seller counts. Logging in from the login screen, which shows the notice, counts as seen.
  if (window.HP && HP.on) HP.on('seller', () => { const x = HP.seller && HP.seller(); if (x && HP.loginNoticeShown) HP.statsAck(x.no); identify(); HP.stat('Login'); });
})();
