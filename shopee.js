'use strict';
/* Shopee tab — stored in the same list document as the Priority List (field: shopee). */
(() => {
  const peso = n => '₱' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const DEFAULT_NAME = 'Shopee item (tap Edit to name it)';
  const hasNum = v => v !== '' && v != null && !isNaN(v);
  const STAGES = { new: 'To check', checked: 'Checked', cart: 'In cart' };
  const NEXT = { new: 'Mark checked', checked: 'Put in cart', cart: 'Bought' };
  const NEXT_KEY = { new: 'checked', checked: 'cart' };
  const PREV_KEY = { checked: 'new', cart: 'checked' };
  let filter = 'all', editingId = null, pendingImg;
  const list = () => state.shopee || [];
  const mut = fn => mutate(s => { s.shopee = s.shopee || []; fn(s.shopee); });

  /* tabs */
  function showPane(p) {
    $('#paneList').hidden = p !== 'list'; $('#paneShopee').hidden = p !== 'shopee'; $('#paneGrocery').hidden = p !== 'grocery'; $('#panePrep').hidden = p !== 'prep';
    document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.pane === p));
    $('.hero-bottom').hidden = p !== 'list';
    ls.set('pl_tab', p);
  }
  $('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-pane]'); if (b) showPane(b.dataset.pane); });

  /* sale dates */
  function sales() {
    const now = new Date(), out = [];
    for (let y = now.getFullYear(); y <= now.getFullYear() + 1 && out.length < 4; y++)
      for (let m = 1; m <= 12; m++)
        if (new Date(y, m - 1, m, 23, 59, 59) >= now) out.push({ key: `${m}.${m}`, date: new Date(y, m - 1, m) });
    return out.slice(0, 4);
  }
  const o = sales().map(s => `<option value="${s.key}">${s.key} sale</option>`).join('');
  $('#sAddSale').innerHTML = '<option value="">Target sale: none</option>' + o;
  $('#seSale').innerHTML = '<option value="">None</option>' + o;

  /* links */
  const extract = t => [...new Set((t.match(/https?:\/\/(?:[\w-]+\.)?(?:shopee\.[a-z.]+|shope\.ee|shp\.ee)\/[^\s<>"')]+/gi) || []).map(u => u.replace(/[.,;]+$/, '')))];
  function parse(u) {
    let name = '', shopId = '', itemId = '';
    try {
      const p = decodeURIComponent(new URL(u).pathname); let m;
      if ((m = p.match(/\/(.+)-i\.(\d+)\.(\d+)/))) { name = m[1].replace(/-/g, ' '); shopId = m[2]; itemId = m[3]; }
      else if ((m = p.match(/\/product\/(\d+)\/(\d+)/))) { shopId = m[1]; itemId = m[2]; }
    } catch {}
    return { name: name.trim() || 'Shopee item (tap Edit to name it)', shopId, itemId };
  }
  const disc = i => (i.price && i.orig && i.orig > i.price) ? Math.round((1 - i.price / i.orig) * 100) : 0;
  const extraOff = i => Math.min(+i.extra || 0, +i.price || 0);
  const finalPrice = i => (+i.price || 0) - extraOff(i);
  // hide generic Shopee logos/placeholders: on Shopee hosts a product photo always lives under /file/<hash>
  const goodImg = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && (!/shopee|susercontent/i.test(x.hostname) || /\/file\/[\w-]+/.test(x.pathname)); } catch { return false; } };
  const picSrc = i => i.img || (goodImg(i.imgUrl || '') ? i.imgUrl : '');
  const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';
  const ib = (a, label, n, dis) => `<button class="icon" data-sa="${a}" aria-label="${label}" title="${label}"${dis ? ' disabled' : ''}>${svg(n)}</button>`;

  /* Shopee's "More → Copy" message: "Check out <name> at 68% off! ₱109 only. Get it on Shopee now! <link>" */
  const LINK_RE = /https?:\/\/(?:[\w-]+\.)?(?:shopee\.[a-z.]+|shope\.ee|shp\.ee)\/[^\s<>"')]+/gi;
  // drops leftovers of Shopee's message from a name (also repairs items saved earlier with them)
  const cleanName = n => String(n || '').replace(/\s+/g, ' ').replace(/\s+for\s+₱\s?[\d,]+(?:\.\d+)?\.?\s*Get it on Shopee now!?\s*$/i, '').replace(/[.\s]*Get it on Shopee now!?\s*$/i, '').trim();
  function parseShares(text) {
    const out = [], seen = new Set(); let prev = 0, m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
      const url = m[0].replace(/[.,;]+$/, ''), seg = text.slice(prev, m.index); prev = m.index + m[0].length;
      if (seen.has(url)) continue; seen.add(url);
      const info = { url };
      // shape A: "Check out <name> at 68% off! ₱109 only. …"   shape B: "Check out <name> for ₱2,283. Get it on Shopee now!"
      const A = seg.match(/Check out\s+([\s\S]+?)\s+at\s+(\d+)%\s*off/i), B = seg.match(/Check out\s+([\s\S]+?)\s+for\s+₱\s?[\d,]+/i);
      const C = seg.match(/Check out\s+([\s\S]+?)\s*!/i), hit = A || B || C;
      if (hit) info.name = cleanName(hit[1]);
      if (A) info.pct = +A[2];
      const pr = seg.match(/₱\s?([\d,]+(?:\.\d+)?)/); if (pr) info.price = +pr[1].replace(/,/g, '');
      if (info.price && info.pct > 0 && info.pct < 95) info.orig = Math.round(info.price / (1 - info.pct / 100));
      out.push(info);
    }
    return out;
  }

  /* actions */
  function add(top) {
    const shares = parseShares($('#sPaste').value);
    if (!shares.length) { toast('No Shopee links found'); return; }
    const sale = $('#sAddSale').value, fresh = [], updates = [];
    for (const sh of shares) {
      const p = parse(sh.url);
      const old = list().find(i => i.url === sh.url || (p.itemId && i.itemId === p.itemId && i.shopId === p.shopId));
      if (old) { if (sh.name || sh.price) updates.push({ id: old.id, sh }); continue; }
      fresh.push({ id: uid(), url: sh.url, ...p, name: sh.name || p.name, sale, stage: 'new', qty: 1, price: sh.price || 0, orig: sh.orig || 0, extra: 0, img: '', imgUrl: '', voucher: '', note: '', addedBy: me, addedAt: new Date().toISOString() });
    }
    if (updates.length) mut(arr => updates.forEach(({ id, sh }) => {
      const x = arr.find(i => i.id === id); if (!x) return;
      if (sh.name && (!x.name || x.name === DEFAULT_NAME)) x.name = sh.name;
      if (sh.price && !x.price) { x.price = sh.price; if (sh.orig && !x.orig) x.orig = sh.orig; }
    }));
    if (!fresh.length && !updates.length) { toast('Already on the list'); return; }
    const skipped = shares.length - fresh.length - updates.length;
    mut(arr => {
      if (top) { const f = arr.findIndex(i => !i.boughtAt); arr.splice(f < 0 ? arr.length : f, 0, ...fresh); }
      else arr.push(...fresh);
    });
    $('#sAddForm').reset();
    toast(`${fresh.length ? 'Added ' + fresh.length : ''}${fresh.length && updates.length ? ' · ' : ''}${updates.length ? 'Updated ' + updates.length : ''}${skipped ? ` · ${skipped} duplicate skipped` : ''}`);
  }
  function move(id, dir) {
    mut(arr => {
      const act = arr.filter(i => !i.boughtAt), pos = act.findIndex(i => i.id === id);
      const tgt = dir === 'top' ? 0 : pos + dir;
      if (pos < 0 || tgt < 0 || tgt >= act.length || tgt === pos) return;
      const it = act[pos]; arr.splice(arr.indexOf(it), 1);
      arr.splice(arr.indexOf(act[tgt]) + (dir === 1 ? 1 : 0), 0, it);
    });
  }
  function buy(id) {
    const act = list().filter(i => !i.boughtAt), it = act.find(i => i.id === id); if (!it) return;
    if (act[0].id !== id && !confirm(`Heads up: "${act[0].name}" is higher priority.\nMark "${it.name}" as bought anyway?`)) return;
    mut(arr => { const x = arr.find(i => i.id === id); if (x) { x.boughtAt = new Date().toISOString(); x.boughtBy = me; } });
    toast('Bought: ' + it.name);
  }
  function advance(id) {
    const it = list().find(i => i.id === id); if (!it) return;
    const st = it.stage || 'new';
    if (st === 'cart') return buy(id);
    mut(arr => { const x = arr.find(i => i.id === id); if (x) x.stage = NEXT_KEY[st]; });
  }
  function openEdit(id) {
    const it = list().find(i => i.id === id); if (!it) return;
    editingId = id;
    const set = (k, v) => { $('#se' + k).value = v ?? ''; };
    set('Name', it.name === DEFAULT_NAME ? '' : cleanName(it.name)); set('Url', it.url); set('Sale', it.sale); set('Stage', it.stage || 'new');
    set('Voucher', it.voucher); set('Note', it.note);
    set('Price', it.price || ''); set('Orig', it.orig || '');
    set('Qty', it.qty || 1);
    set('Extra', it.extra || ''); set('Img', it.imgUrl || ''); pendingImg = undefined; showPreview(it.img || '');
    $('#sEditDlg').showModal();
  }

  /* photo: resized to a small square thumbnail and stored inline (keeps the shared document small) */
  function showPreview(src) {
    const p = $('#sePreview'); p.hidden = !src; if (src) p.src = src; else p.removeAttribute('src');
    $('#sePhotoClear').hidden = !src;
  }
  function toThumb(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
        const m = Math.min(im.width, im.height), sx = (im.width - m) / 2, sy = (im.height - m) / 2;
        c.getContext('2d').drawImage(im, sx, sy, m, m, 0, 0, S, S);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.6));
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      im.src = url;
    });
  }
  $('#sePhoto').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { pendingImg = await toThumb(f); showPreview(pendingImg); } catch { toast('Could not read that image'); }
    e.target.value = '';
  });
  $('#sePhotoClear').addEventListener('click', () => { pendingImg = ''; showPreview(''); });
  const sizeKB = () => Math.round(JSON.stringify({ items: state.items, shopee: state.shopee, people: state.people }).length / 1024);

  /* render */
  function render() {
    const arr = list(), act = arr.filter(i => !i.boughtAt);
    const done = arr.filter(i => i.boughtAt).sort((a, b) => b.boughtAt.localeCompare(a.boughtAt));
    const sum = a => a.reduce((t, i) => t + finalPrice(i) * (i.qty || 1), 0);
    const cart = act.filter(i => i.stage === 'cart'), toCheck = act.filter(i => (i.stage || 'new') === 'new').length;
    const nx = sales()[0], days = nx ? Math.ceil((nx.date - new Date()) / 864e5) : 0;
    $('#sSale').textContent = nx ? (days <= 0 ? `🎉 ${nx.key} sale is today` : `🎯 ${nx.key} sale in ${days} day${days > 1 ? 's' : ''}`) : '';
    $('#sSummary').innerHTML = `<span>${act.length} to buy</span>` + (toCheck ? `<span>${toCheck} to check</span>` : '') + (cart.length ? `<span>Cart ≈ ${peso(sum(cart))}</span>` : '');

    const saleKeys = [...new Set(act.map(i => i.sale).filter(Boolean))];
    const chips = [['all', 'All ' + act.length], ...Object.entries(STAGES).map(([k, l]) => [k, `${l} ${act.filter(i => (i.stage || 'new') === k).length}`]),
      ...saleKeys.map(s => ['sale:' + s, `🎯 ${s} ${act.filter(i => i.sale === s).length}`])];
    if (!chips.some(c => c[0] === filter)) filter = 'all';
    $('#sChips').innerHTML = chips.map(([k, l]) => `<button class="chip${k === filter ? ' on' : ''}" data-sf="${k}">${l}</button>`).join('');

    const shown = act.map((it, n) => ({ it, n })).filter(({ it }) =>
      filter === 'all' || (filter.startsWith('sale:') ? it.sale === filter.slice(5) : (it.stage || 'new') === filter));
    $('#sEmpty').hidden = shown.length > 0;
    $('#sList').innerHTML = shown.map(({ it, n }) => {
      const d = disc(it), st = it.stage || 'new', pic = picSrc(it), ex = extraOff(it);
      return `<li class="item${n === 0 ? ' next' : ''}" data-id="${it.id}">
        <div class="rank">${n + 1}</div>
        <div>
          <a class="prod" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" title="Open on Shopee">
            ${pic ? `<img class="thumb" src="${esc(pic)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            <div>
              <div class="title">${esc(cleanName(it.name))}${it.qty > 1 ? ` <span class="qty">×${it.qty}</span>` : ''}${n === 0 ? '<span class="badge">Buy next</span>' : ''}</div>
              <div class="price">${it.price ? peso(it.price) : '<span class="muted">no price yet</span>'}${d ? `<s>${peso(it.orig)}</s><em>-${d}%</em>` : ''}${ex ? `<span class="final">→ ${peso(finalPrice(it))} after vouchers</span>` : ''}</div>
            </div>
          </a>
          ${it.sale ? `<div class="tags"><span class="tag2">🎯 ${esc(it.sale)}</span></div>` : ''}
          ${it.voucher ? `<div class="note">🎟 ${esc(it.voucher)}</div>` : ''}
          ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
          <div class="meta">${avatar(it.addedBy)}<span>· Added ${fmtDate(it.addedAt)} (${ago(it.addedAt)})</span></div>
        </div>
        <div class="move">${ib('up', 'Move up', 'up', n === 0)}${ib('down', 'Move down', 'down', n === act.length - 1)}</div>
        <div class="actions">
          ${PREV_KEY[st] ? `<button class="icon" data-sa="back" aria-label="Undo: back to ${STAGES[PREV_KEY[st]]}" title="Undo: back to ${STAGES[PREV_KEY[st]]}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg></button>` : ''}
          <button class="stage${st === 'cart' ? ' ok' : ''}" data-sa="next">${NEXT[st]}</button>
          <a class="open" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" title="Open on Shopee">↗</a>
          ${ib('top', 'Move to top', 'top', n === 0)}${ib('edit', 'Edit', 'edit')}${ib('del', 'Delete', 'trash')}
        </div></li>`;
    }).join('');

    $('#sBoughtCount').textContent = done.length ? `(${done.length})` : '';
    $('#sHistory').innerHTML = done.map(it => `<li class="item done" data-id="${it.id}">
      <div class="rank">${svg('check').replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"')}</div>
      <div><div class="title">${esc(it.name)}${it.qty > 1 ? ` <span class="qty">×${it.qty}</span>` : ''}</div>
        <div class="meta">${it.price ? peso(finalPrice(it)) + ' · ' : ''}Bought ${fmtDate(it.boughtAt)}${it.boughtBy ? ' · ' + avatar(it.boughtBy) : ''}</div></div>
      <div class="actions"><button class="restore" data-sa="restore">↩ Back to list</button>${ib('del', 'Delete', 'trash')}</div></li>`).join('');
  }
  window.renderShopee = render;

  /* events */
  $('#sAddForm').addEventListener('submit', e => { e.preventDefault(); add(false); });
  $('#sAddTop').addEventListener('click', () => { if ($('#sAddForm').reportValidity()) add(true); });
  $('#sChips').addEventListener('click', e => { const b = e.target.closest('[data-sf]'); if (b) { filter = b.dataset.sf; render(); } });
  $('#paneShopee').addEventListener('click', e => {
    const b = e.target.closest('button[data-sa]'); if (!b) return;
    const id = b.closest('li').dataset.id;
    ({
      top: () => move(id, 'top'), up: () => move(id, -1), down: () => move(id, 1), next: () => advance(id), back: () => mut(arr => { const x = arr.find(i => i.id === id); if (x && PREV_KEY[x.stage]) x.stage = PREV_KEY[x.stage]; }), edit: () => openEdit(id),
      del: () => { const it = list().find(i => i.id === id); if (it && confirm(`Delete "${it.name}"?`)) mut(arr => { const k = arr.findIndex(i => i.id === id); if (k >= 0) arr.splice(k, 1); }); },
      restore: () => mut(arr => { const k = arr.findIndex(i => i.id === id); if (k < 0) return; const [it] = arr.splice(k, 1); delete it.boughtAt; delete it.boughtBy; it.stage = 'cart'; arr.push(it); })
    })[b.dataset.sa]();
  });
  $('#sEditForm').addEventListener('submit', e => {
    if (!(e.submitter && e.submitter.value === 'save')) return;
    const num = id => $(id).value === '' ? '' : +$(id).value, v = id => $(id).value.trim();
    const vals = { name: v('#seName'), url: v('#seUrl'), price: +$('#sePrice').value || 0, orig: +$('#seOrig').value || 0, qty: +$('#seQty').value || 1, extra: +$('#seExtra').value || 0, imgUrl: v('#seImg'), sale: $('#seSale').value, stage: $('#seStage').value, voucher: v('#seVoucher'), note: v('#seNote') };
    const img = pendingImg;
    mut(arr => { const it = arr.find(i => i.id === editingId); if (!it) return; Object.assign(it, vals, { name: vals.name || it.name, url: vals.url || it.url }); if (img !== undefined) it.img = img; });
    if (img && sizeKB() > 700) toast('List is getting big — use image links instead of photos for new items');
  });
  $('#seCancel').addEventListener('click', () => $('#sEditDlg').close());
  $('#sCopyCart').addEventListener('click', () => {
    const text = list().filter(i => !i.boughtAt && i.stage === 'cart').map(i => `• ${i.name}${i.qty > 1 ? ' ×' + i.qty : ''} — ${i.price ? peso(finalPrice(i)) : '?'}\n  ${i.url}`).join('\n') || '(nothing in cart yet)';
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Cart list copied'), () => prompt('Copy this:', text));
  });

  showPane(['shopee', 'prep'].includes(ls.get('pl_tab')) ? ls.get('pl_tab') : 'list');
  render();
})();
