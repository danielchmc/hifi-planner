/* HiFi Planner v2 — boot + keyboard. */
(function () {
  const HP = window.HP, { t, store, LS } = HP;
  document.documentElement.dataset.theme = LS.get('theme', 'light');
  document.documentElement.lang = HP.lang();

  function keys(e) {
    const tag = e.target.tagName, typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable;
    if (document.querySelector('.modal-back, .tour, #login')) return;
    const C = HP.canvas, mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !typing) { e.preventDefault(); return e.shiftKey ? store.redo() : store.undo(); }
    if (mod && k === 'y' && !typing) { e.preventDefault(); return store.redo(); }
    if (e.key === 'F1') { e.preventDefault(); return document.getElementById('tb-theme').click(); } // same hotkeys as the old planner
    if (e.key === 'F3') { e.preventDefault(); return C.togglePrices(); }
    if (e.key === 'F4') { e.preventDefault(); return C.print(); }
    if (mod && k === 's') { e.preventDefault(); return HP.panels.projects(); }
    if (mod && k === 'p') { e.preventDefault(); return C.print(); }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (mod && k === 'd') { e.preventDefault(); return C.duplicateSelection(); }
    if (mod && k === 'a') { e.preventDefault(); return C.selectAll(); }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return C.deleteSelection(); }
    if (e.key === 'Escape') return C.select([]);
    if (k === 'f') return C.fit();
    if (k === '/') { e.preventDefault(); return HP.panels.focusSearch(); }
    if (k === 'r' && store.sel.size === 1) { const it = store.item([...store.sel][0]); if (it && it.kind === 'product') HP.panels.replacePicker(it.id); return; }
    const step = e.shiftKey ? 50 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && store.sel.size) { e.preventDefault(); C.nudge(mv[0], mv[1]); }
  }

  window.addEventListener('DOMContentLoaded', () => {
    HP.panels.login(() => {
      HP.panels.build(document.getElementById('app'));
      document.addEventListener('keydown', keys);
      if (!LS.get('toured', false)) {
        LS.set('toured', true);
        HP.toast(t('New here? Take the one-minute guided tour.', 'Ny her? Tag den guidede rundvisning på et minut.'), { ms: 12000, action: { label: t('Start tour', 'Start rundvisning'), fn: HP.tour.start } });
      }
    });
  });
})();
