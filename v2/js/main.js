/* HiFi Planner v2 — boot + keyboard. */
(function () {
  const HP = window.HP, { t, store, LS } = HP;
  document.documentElement.dataset.theme = LS.get('theme', 'light');
  document.documentElement.lang = HP.lang();

  function keys(e) {
    const tag = e.target.tagName, typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable;
    if (document.querySelector('.modal-back, .tour, #login, .viewer, #ctxmenu') || (HP.katalog && HP.katalog.isOpen())) return;
    const C = HP.canvas, mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !typing) { e.preventDefault(); return e.shiftKey ? store.redo() : store.undo(); }
    if (mod && k === 'y' && !typing) { e.preventDefault(); return store.redo(); }
    if (e.key === 'F1') { e.preventDefault(); return document.getElementById('tb-theme').click(); } // same hotkeys as the old planner
    if (e.key === 'F3') { e.preventDefault(); return C.togglePrices(); }
    if (e.key === 'F4') { e.preventDefault(); return HP.cover.dialog(); }
    if (mod && e.shiftKey && k === 's') { e.preventDefault(); return HP.panels.share(); }
    if (mod && k === 's') { e.preventDefault(); return HP.panels.projects(); }
    if (mod && k === 'p') { e.preventDefault(); return HP.cover.dialog(); }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (mod && k === 'd') { e.preventDefault(); return C.duplicateSelection(); }
    if (mod && k === 'a') { e.preventDefault(); return C.selectAll(); }
    if (mod && k === 'c' && !window.getSelection().toString()) { if (C.copy()) e.preventDefault(); return; }
    if (mod && k === 'v') { e.preventDefault(); return C.paste(); }
    if (e.key === ']' || e.key === '[') { e.preventDefault(); return C.order(e.key === ']'); } // AltGr+8/9 on Danish keyboards arrives with Ctrl+Alt
    const one = store.sel.size === 1 && store.item([...store.sel][0]);
    // item shortcuts are Alt + a letter (by key position, so they also work on Mac, where Option+letter types a symbol);
    // plain letters and numbers are for searching
    if (e.altKey && !mod) {
      const c = e.code, act = {
        KeyT: () => C.addText(),
        KeyB: () => one && C.flip(one.id),
        KeyC: () => { if (one && one.kind === 'product') { const el = document.querySelector('.item[data-id="' + one.id + '"]'), r = el && el.getBoundingClientRect(); C.colourMenu(one.id, null, r ? r.left : 200, r ? r.top + 40 : 200); } },
        KeyI: () => one && C.inspect(one.id),
        KeyL: () => { if (one && one.kind === 'plan') { one.lock = !one.lock; store.commit(); } },
        KeyR: () => { const it = store.sel.size === 1 && store.item([...store.sel][0]); if (it && (it.kind === 'product' || (it.kind === 'mark' && it.k[0] !== '@'))) HP.panels.replacePicker(it.id); } }[c];
      if (act) { e.preventDefault(); act(); }
      return;
    }
    if (mod) return;
    if (e.code === 'Digit1' && e.shiftKey) { e.preventDefault(); return C.fit(); } // Shift+1: fit to window, as in Figma and Miro
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return C.deleteSelection(); }
    if (e.key === 'Escape') return C.select([]);
    if (k === '/') { e.preventDefault(); return HP.panels.focusSearch(); }
    // typing on the canvas types into the product search: a fresh search, without reaching for the mouse
    if (e.key.length === 1 && e.key !== ' ' && /[\p{L}\p{N}]/u.test(e.key)) { e.preventDefault(); return HP.panels.typeSearch(e.key); }
    if (e.key === 'Enter' && store.selConn) return HP.panels.cablePicker(store.selConn);
    // Enter anywhere else opens the Katalog (a cable run being drawn is finished by Enter in canvas.js instead)
    if (e.key === 'Enter' && !(C.tool && C.tool())) { e.preventDefault(); return HP.katalog.open(); }
    const step = e.shiftKey ? 50 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && store.sel.size) { e.preventDefault(); C.nudge(mv[0], mv[1]); }
  }

  window.addEventListener('DOMContentLoaded', () => {
    // a customer's link (#t=…, from the QR code on a printed proposal): the proposal read only, without logging in
    const tv = /^#t=(.+)$/.exec(location.hash); if (tv) return HP.cover.viewer(tv[1]);
    HP.panels.login(() => {
      HP.panels.build(document.getElementById('app'));
      HP.share.openFromHash();
      window.addEventListener('hashchange', () => HP.share.openFromHash());
      document.addEventListener('keydown', keys);
      if (!LS.get('toured', false)) {
        LS.set('toured', true);
        HP.toast(t('New here? Take the one-minute guided tour.', 'Ny her? Tag den guidede rundvisning på et minut.'), { ms: 12000, action: { label: t('Start tour', 'Start rundvisning'), fn: HP.tour.start } });
      }
    });
  });
})();
