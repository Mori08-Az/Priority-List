'use strict';
/* Drag-to-reorder for the lists. Press and hold the grip (⠿) on an item and drag it up or down;
   swiping anywhere else still scrolls the page. Dragging stays inside the item's own parent list,
   so Grocery items only move within their category. */
(() => {
  window.GRIP = '<button type="button" class="grip" aria-label="Drag to reorder" title="Drag to reorder"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg></button>';

  // Puts the items named in `ids` into that order, using only the array slots those items already occupy
  // (so items that are not shown, e.g. other categories or bought items, keep their place). Edits arr in place.
  window.reorderSlots = (arr, ids) => {
    const byId = new Map(arr.map(x => [x.id, x]));
    const list = ids.filter(id => byId.has(id)), set = new Set(list);
    const slots = []; arr.forEach((x, i) => { if (set.has(x.id)) slots.push(i); });
    slots.forEach((p, n) => { arr[p] = byId.get(list[n]); });
  };

  // o: { item: selector of a row, handle: selector of its grip, id: row => id, onDrop: orderedIds => void }
  window.makeSortable = (container, o) => {
    container.addEventListener('pointerdown', e => {
      if (e.button) return;
      const handle = e.target.closest(o.handle); if (!handle) return;
      const el = handle.closest(o.item); if (!el) return;
      const sibs = [...el.parentElement.children].filter(c => c.matches(o.item));
      if (sibs.length < 2) return;
      e.preventDefault();
      const i0 = sibs.indexOf(el), sy = window.scrollY, startY = e.clientY;
      const rects = sibs.map(s => { const r = s.getBoundingClientRect(); return { top: r.top + sy, h: r.height }; });
      const gap = Math.max(0, rects[1].top - (rects[0].top + rects[0].h));
      const dh = rects[i0].h + gap;
      let cy = e.clientY, t = i0, active = true, raf = 0;
      el.classList.add('dragging'); document.body.classList.add('sorting');
      sibs.forEach(s => { if (s !== el) s.style.transition = 'transform .15s'; });

      const update = () => {
        if (!el.isConnected) return stop(true);
        const dy = cy - startY + (window.scrollY - sy);
        el.style.transform = `translateY(${dy}px)`;
        const center = rects[i0].top + rects[i0].h / 2 + dy;
        t = 0; sibs.forEach((s, j) => { if (j !== i0 && rects[j].top + rects[j].h / 2 < center) t++; });
        sibs.forEach((s, j) => {
          if (j === i0) return;
          const sh = (j > i0 && j <= t) ? -dh : (j < i0 && j >= t) ? dh : 0;
          s.style.transform = sh ? `translateY(${sh}px)` : '';
        });
      };
      const tick = () => {
        if (!active) return;
        const m = 70;
        if (cy < m) window.scrollBy(0, -Math.ceil((m - cy) / 5));
        else if (cy > innerHeight - m) window.scrollBy(0, Math.ceil((cy - (innerHeight - m)) / 5));
        update(); raf = requestAnimationFrame(tick);
      };
      const move = ev => { cy = ev.clientY; ev.preventDefault(); };
      const up = () => stop(false);
      const cancel = () => stop(true);
      function stop(abort) {
        if (!active) return; active = false; cancelAnimationFrame(raf);
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
        el.classList.remove('dragging'); document.body.classList.remove('sorting');
        sibs.forEach(s => { s.style.transform = ''; s.style.transition = ''; });
        if (!abort && t !== i0) { const order = sibs.filter((s, j) => j !== i0); order.splice(t, 0, el); o.onDrop(order.map(o.id)); }
      }
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel);
      raf = requestAnimationFrame(tick);
    });
  };
})();
