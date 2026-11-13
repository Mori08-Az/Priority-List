'use strict';
/* Grocery tab — a simple check-off reminder list.
   Stored in the same list document as everything else (field: grocery = [{id, name, done, addedBy, addedAt, doneAt, doneBy}]). */
(() => {
  const list = () => state.grocery || [];
  const mut = fn => mutate(s => { s.grocery = s.grocery || []; fn(s.grocery); });

  function render() {
    const root = $('#gList'); if (!root) return;
    const all = list();
    const todo = all.filter(i => !i.done);
    const got = all.filter(i => i.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const row = i => `<li class="gitem${i.done ? ' got' : ''}" data-gid="${i.id}">
      <label class="gcheck"><input type="checkbox" data-gcheck="${i.id}"${i.done ? ' checked' : ''}><span>${esc(i.name)}</span></label>
      <button class="icon" data-gdel="${i.id}" aria-label="Delete" title="Delete">${svg('trash')}</button>
    </li>`;
    $('#gSummary').innerHTML = todo.length
      ? `<span class="stat">${todo.length} to get</span>${got.length ? `<span class="stat">${got.length} done</span>` : ''}`
      : `<span class="stat">${all.length ? 'All done 🎉' : 'Nothing yet'}</span>`;
    $('#gEmpty').hidden = all.length > 0;
    root.innerHTML = todo.map(row).join('') + (got.length ? `<li class="gsep">Done (${got.length}) <button class="link danger" id="gClear">Clear done</button></li>` + got.map(row).join('') : '');
  }

  $('#gAddForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#gName');
    // allow several items at once, separated by commas or new lines
    const names = input.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    const now = new Date().toISOString();
    mut(g => names.forEach(name => {
      if (g.some(x => !x.done && x.name.toLowerCase() === name.toLowerCase())) return;
      g.push({ id: uid(), name, done: false, addedBy: me, addedAt: now });
    }));
    input.value = ''; input.focus();
  });

  $('#paneGrocery').addEventListener('change', e => {
    const id = e.target.dataset.gcheck; if (!id) return;
    const v = e.target.checked;
    mut(g => {
      const it = g.find(x => x.id === id); if (!it) return;
      it.done = v;
      if (v) { it.doneAt = new Date().toISOString(); it.doneBy = me; } else { delete it.doneAt; delete it.doneBy; }
    });
  });

  $('#paneGrocery').addEventListener('click', e => {
    const del = e.target.closest('[data-gdel]');
    if (del) { const id = del.dataset.gdel; mut(g => { const i = g.findIndex(x => x.id === id); if (i >= 0) g.splice(i, 1); }); return; }
    if (e.target.id === 'gClear') mut(g => { for (let i = g.length - 1; i >= 0; i--) if (g[i].done) g.splice(i, 1); });
  });

  window.renderGrocery = render;
  render();
})();
