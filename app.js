'use strict';
const $ = s => document.querySelector(s);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
}
const money = n => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

let state = { items: [], shopee: [], prep: {}, people: ['Amiel', 'JD'] };
let me = ls.get('pl_me') || '';
let listCode = ls.get('pl_code') || '';
let store;
let editingId = null;

/* ---------- storage: Firebase (shared) or localStorage (this device) ---------- */
function localStore() {
  const key = 'pl_state_' + (listCode || 'local');
  const load = () => { try { return JSON.parse(ls.get(key)) || null; } catch { return null; } };
  return {
    shared: false,
    start(cb) { const s = load(); if (s) cb(s); else cb(null); },
    async mutate(fn) { const s = load() || { items: [], people: state.people }; fn(s); ls.set(key, JSON.stringify(s)); onData(s); }
  };
}
function firebaseStore() {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.firestore();
  const ref = db.collection('lists').doc(listCode);
  return {
    shared: true,
    start(cb) { ref.onSnapshot(snap => cb(snap.exists ? snap.data() : null), e => { toast('Sync error: ' + e.message); setSync('error'); }); },
    async mutate(fn) {
      await db.runTransaction(async t => {
        const snap = await t.get(ref);
        const s = snap.exists ? snap.data() : { items: [], people: state.people };
        fn(s); t.set(ref, s);
      });
    }
  };
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

const cleanCode = v => (v || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

function askCode(current, firstTime) {
  return new Promise(resolve => {
    const dlg = $('#codeDlg');
    $('#codeInput').value = current || '';
    $('#codeHelp').textContent = firstTime
      ? 'Type the list code you and your family share. Everyone with the same code sees the same list.'
      : 'Changing this switches to a different list. Use the same code on every phone.';
    dlg.addEventListener('cancel', e => { if (firstTime) e.preventDefault(); }, { once: true });
    dlg.addEventListener('close', () => resolve(cleanCode($('#codeInput').value)), { once: true });
    dlg.showModal();
  });
}

async function init() {
  const urlCode = cleanCode(new URLSearchParams(location.search).get('list'));
  if (urlCode) { listCode = urlCode; ls.set('pl_code', listCode); }
  while (!listCode) {
    listCode = await askCode('', true);
    if (listCode) ls.set('pl_code', listCode);
  }
  // keep the code in the address so "Add to Home Screen" and bookmarks remember it
  try { history.replaceState(null, '', '?list=' + encodeURIComponent(listCode)); } catch {}
  $('#listCode').textContent = 'List: ' + listCode;
  if (window.FIREBASE_CONFIG) {
    try {
      const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
      await loadScript(base + 'firebase-app-compat.js');
      await loadScript(base + 'firebase-firestore-compat.js');
      store = firebaseStore(); setSync('on');
    } catch { toast('Could not load sync - using this device only'); store = localStore(); setSync('local'); }
  } else { store = localStore(); setSync('local'); }
  store.start(onData);
}
function setSync(m) {
  const el = $('#sync');
  el.textContent = m === 'on' ? 'Synced' : m === 'error' ? 'Offline' : 'This device only';
  el.className = 'pill' + (m === 'on' ? ' on' : '');
}
// one-time rename: the default person "Me" is now "Amiel" (people list + who added/bought items)
let renaming = false;
function renameMe(s) {
  const fix = n => n === 'Me' ? 'Amiel' : n;
  s.people = [...new Set((s.people || []).map(fix))];
  [...(s.items || []), ...(s.shopee || [])].forEach(i => { if (i.addedBy === 'Me') i.addedBy = 'Amiel'; if (i.boughtBy === 'Me') i.boughtBy = 'Amiel'; });
}
function onData(s) {
  if (s && (s.people || []).includes('Me') && !renaming) {
    renaming = true;
    if (ls.get('pl_me') === 'Me') { me = 'Amiel'; ls.set('pl_me', me); }
    store.mutate(renameMe).catch(() => {}).finally(() => { renaming = false; });
    renameMe(s); // show the new name straight away
  }
  if (s) state = { items: s.items || [], shopee: s.shopee || [], prep: s.prep || {}, people: s.people && s.people.length ? s.people : state.people };
  render();
}
async function mutate(fn) {
  try { await store.mutate(fn); } catch (e) { toast('Could not save: ' + e.message); }
}

/* ---------- actions ---------- */
function addItem(top) {
  const name = $('#name').value.trim();
  if (!name) return;
  const it = {
    id: uid(), name,
    qty: +$('#qty').value || 0,
    price: +$('#price').value || 0,
    note: $('#note').value.trim(),
    addedBy: me, addedAt: new Date().toISOString()
  };
  const dup = state.items.find(i => !i.boughtAt && i.name.toLowerCase() === name.toLowerCase());
  if (dup && !confirm(`"${dup.name}" is already on the list. Add it again?`)) return;
  mutate(s => {
    if (top) {
      const first = s.items.findIndex(i => !i.boughtAt);
      s.items.splice(first < 0 ? s.items.length : first, 0, it);
    } else s.items.push(it);
  });
  $('#addForm').reset(); $('#name').focus();
}
function activeIdx(s, id) {
  const act = s.items.filter(i => !i.boughtAt);
  return { act, pos: act.findIndex(i => i.id === id) };
}
function move(id, dir) {
  mutate(s => {
    const { act, pos } = activeIdx(s, id);
    const tgt = dir === 'top' ? 0 : pos + dir;
    if (pos < 0 || tgt < 0 || tgt >= act.length || tgt === pos) return;
    const it = act[pos];
    s.items.splice(s.items.indexOf(it), 1);
    const before = act[tgt]; // still in array unless it is `it`
    s.items.splice(s.items.indexOf(before) + (dir === 1 ? 1 : 0), 0, it);
  });
}
function buy(id) {
  const act = state.items.filter(i => !i.boughtAt);
  const it = act.find(i => i.id === id);
  if (!it) return;
  if (act[0].id !== id && !confirm(`Heads up: "${act[0].name}" is higher priority.\nMark "${it.name}" as bought anyway?`)) return;
  mutate(s => { const x = s.items.find(i => i.id === id); if (x) { x.boughtAt = new Date().toISOString(); x.boughtBy = me; } });
  toast(`Bought: ${it.name}`);
}
function restore(id) {
  mutate(s => {
    const i = s.items.findIndex(x => x.id === id); if (i < 0) return;
    const [it] = s.items.splice(i, 1); delete it.boughtAt; delete it.boughtBy; s.items.push(it);
  });
}
function remove(id) {
  const it = state.items.find(i => i.id === id);
  if (it && confirm(`Delete "${it.name}"?`)) mutate(s => { s.items = s.items.filter(i => i.id !== id); });
}
function openEdit(id) {
  const it = state.items.find(i => i.id === id); if (!it) return;
  editingId = id;
  $('#eName').value = it.name; $('#eQty').value = it.qty || ''; $('#ePrice').value = it.price || ''; $('#eNote').value = it.note || '';
  $('#editDlg').showModal();
}

/* ---------- render ---------- */
const ICONS = {
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  top: '<path d="M5 4h14M6 17l6-6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>'
};
const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const hue = name => { let h = 0; for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const avatar = name => name ? `<span class="av" style="--h:${hue(name)}" title="${esc(name)}">${esc(name[0].toUpperCase())}</span>${esc(name)}` : '';
const iconBtn = (a, label, n, dis) => `<button class="icon" data-a="${a}" aria-label="${label}" title="${label}"${dis ? ' disabled' : ''}>${svg(n)}</button>`;

function render() {
  const act = state.items.filter(i => !i.boughtAt);
  const done = state.items.filter(i => i.boughtAt).sort((a, b) => b.boughtAt.localeCompare(a.boughtAt));
  const total = act.reduce((t, i) => t + (i.price || 0) * (i.qty || 1), 0);
  $('#summary').innerHTML = act.length
    ? `<span class="stat">${act.length} to buy</span>` + (total ? `<span class="stat">≈ ${money(total)}</span>` : '')
    : '<span class="stat">All caught up</span>';
  $('#empty').hidden = act.length > 0;
  $('#list').innerHTML = act.map((it, n) => `
    <li class="item${n === 0 ? ' next' : ''}" data-id="${it.id}">
      <div class="rank">${n + 1}</div>
      <div>
        <div class="title">${esc(it.name)}${it.qty > 1 ? ` <span class="qty">×${it.qty}</span>` : ''}${n === 0 ? '<span class="badge">Buy next</span>' : ''}</div>
        ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
        <div class="meta">${avatar(it.addedBy)}<span>· Added ${fmtDate(it.addedAt)} (${ago(it.addedAt)})</span>${it.price ? `<span>· ${money(it.price)}</span>` : ''}</div>
      </div>
      <div class="move">${iconBtn('up', 'Move up', 'up', n === 0)}${iconBtn('down', 'Move down', 'down', n === act.length - 1)}</div>
      <div class="actions">
        <button class="buy" data-a="buy">${svg('check')} Bought</button>
        ${iconBtn('top', 'Move to top', 'top', n === 0)}${iconBtn('edit', 'Edit', 'edit')}${iconBtn('del', 'Delete', 'trash')}
      </div>
    </li>`).join('');
  $('#boughtCount').textContent = done.length ? `(${done.length})` : '';
  $('#clearHistory').hidden = !done.length;
  $('#history').innerHTML = done.map(it => `
    <li class="item done" data-id="${it.id}">
      <div class="rank">${svg('check').replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"')}</div>
      <div>
        <div class="title">${esc(it.name)}${it.qty > 1 ? ` <span class="qty">×${it.qty}</span>` : ''}</div>
        <div class="meta">Added ${fmtDate(it.addedAt)} · Bought ${fmtDate(it.boughtAt)}${it.boughtBy ? ' · ' + avatar(it.boughtBy) : ''}</div>
      </div>
      <div class="actions"><button class="restore" data-a="restore">↩ Back to list</button>${iconBtn('del', 'Delete', 'trash')}</div>
    </li>`).join('');
  const w = $('#who');
  w.innerHTML = state.people.map(p => `<option${p === me ? ' selected' : ''}>${esc(p)}</option>`).join('') + '<option value="__add">+ Add person…</option>';
  if (!me || !state.people.includes(me)) { me = state.people[0]; ls.set('pl_me', me); w.value = me; }
  if (window.renderShopee) window.renderShopee();
  if (window.renderPrep) window.renderPrep();
}

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }

/* ---------- events ---------- */
$('#addForm').addEventListener('submit', e => { e.preventDefault(); addItem(false); });
$('#addTop').addEventListener('click', () => { if ($('#addForm').reportValidity()) addItem(true); });
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const id = b.closest('li').dataset.id;
  ({ top: () => move(id, 'top'), up: () => move(id, -1), down: () => move(id, 1), buy: () => buy(id), edit: () => openEdit(id), del: () => remove(id), restore: () => restore(id) })[b.dataset.a]();
});
$('#who').addEventListener('change', e => {
  if (e.target.value === '__add') {
    const n = (prompt('Name of the new person:') || '').trim();
    if (n && !state.people.includes(n)) { me = n; ls.set('pl_me', n); mutate(s => { s.people = [...(s.people || []), n]; }); }
    else render();
  } else { me = e.target.value; ls.set('pl_me', me); }
});
$('#editForm').addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'save') {
    mutate(s => {
      const it = s.items.find(i => i.id === editingId); if (!it) return;
      it.name = $('#eName').value.trim() || it.name; it.qty = +$('#eQty').value || 0; it.price = +$('#ePrice').value || 0; it.note = $('#eNote').value.trim();
    });
  }
});
$('#eCancel').addEventListener('click', () => $('#editDlg').close());
$('#clearHistory').addEventListener('click', () => { if (confirm('Remove all bought items from history?')) mutate(s => { s.items = s.items.filter(i => !i.boughtAt); }); });
$('#switchList').addEventListener('click', async () => {
  const c = await askCode(listCode, false);
  if (c && c !== listCode) { ls.set('pl_code', c); location.href = location.pathname + '?list=' + encodeURIComponent(c); }
});
$('#invite').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '?list=' + encodeURIComponent(listCode);
  try {
    if (navigator.share) await navigator.share({ title: 'Priority List', text: 'Join our shopping list', url });
    else { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  } catch {}
});
$('#codeForm').addEventListener('submit', () => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
init();
