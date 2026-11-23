/* HiFi Planner v2 — usage statistics (Umami, cookieless).
   Off until a website id is set in data/config.js (analytics.umami). Only on the live site: never from a local copy opened as a
   file, localhost or a test address. Counts per shop number, never per seller: no names, no customer data, no drawings.
   The customer view counts as its own page ("/kunde"); the link's drawing (after #) is never sent.
   Events: HP.stat('name', { …extra }) — queued until the script has loaded. */
(function () {
  'use strict';
  const cfg = (window.HP_DATA && window.HP_DATA.config && window.HP_DATA.config.analytics) || {};
  const LIVE = /(^|\.)danielchmc\.github\.io$|(^|\.)hifiplanner\.dk$/i.test(location.hostname) && location.protocol === 'https:';
  const on = !!(cfg.umami && LIVE);
  const queue = [];
  const shop = () => { try { return (window.HP && HP.LS && HP.LS.get('shop')) || ''; } catch (e) { return ''; } };
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
  HP.stat = (name, data) => { try { send(name, Object.assign(viewing() ? {} : { shop: shop() }, data || {})); } catch (e) { /* statistics must never break the app */ } };

  if (!on) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = cfg.umamiScript || 'https://cloud.umami.is/script.js';
  s.setAttribute('data-website-id', cfg.umami);
  s.setAttribute('data-auto-track', 'false');   // the page view below sends a clean address, without the drawing after #
  s.setAttribute('data-exclude-hash', 'true');
  s.setAttribute('data-exclude-search', 'true');
  s.setAttribute('data-do-not-track', 'true');  // a browser asking not to be tracked is not counted
  s.onload = () => { send(null); queue.splice(0).forEach(([n, d]) => send(n, d)); };
  document.head.append(s);

  // the planner: a login or a change of seller counts (shop number only)
  if (window.HP && HP.on) HP.on('seller', () => HP.stat('Login'));
})();
