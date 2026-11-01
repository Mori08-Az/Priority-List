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

let state = { items: [], people: ['Me', 'JD'] };
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

async function init() {
  if (!listCode) {
    const hasFb = !!window.FIREBASE_CONFIG;
    const v = prompt(hasFb
      ? 'Enter your family list code (everyone who uses the same code sees the same list). Example: ourhome-2026'
      : 'Name this list (stays on this device until you set up sync - see README):', 'family');
    listCode = (v || 'family').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'family';
    ls.set('pl_code', listCode);
  }
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
  el.textContent = m === 'on' ? '● Synced' : m === 'error' ? '! Offline' : 'This device only';
  el.className = 'pill' + (m === 'on' ? ' on' : '');
}
function onData(s) {
  if (s) state = { items: s.items || [], people: s.people && s.people.length ? s.people : state.people };
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
function render() {
  const act = state.items.filter(i => !i.boughtAt);
  const done = state.items.filter(i => i.boughtAt).sort((a, b) => b.boughtAt.localeCompare(a.boughtAt));
  const total = act.reduce((t, i) => t + (i.price || 0) * (i.qty || 1), 0);
  $('#summary').textContent = act.length ? `${act.length} to buy` + (total ? ` · est. ${money(total)}` : '') : '';
  $('#empty').hidden = act.length > 0;
  $('#list').innerHTML = act.map((it, n) => `
    <li class="item${n === 0 ? ' next' : ''}" data-id="${it.id}">
      <div class="rank">${n + 1}</div>
      <div>
        <div class="title">${esc(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}${n === 0 ? '<span class="badge">Buy next</span>' : ''}</div>
        ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
        <div class="meta">Added ${fmtDate(it.addedAt)} (${ago(it.addedAt)})${it.addedBy ? ' by ' + esc(it.addedBy) : ''}${it.price ? ' · ' + money(it.price) : ''}</div>
      </div>
      <div class="actions">
        <button data-a="top" title="Move to top" ${n === 0 ? 'disabled' : ''}>⤒</button>
        <button data-a="up" title="Move up" ${n === 0 ? 'disabled' : ''}>▲</button>
        <button data-a="down" title="Move down" ${n === act.length - 1 ? 'disabled' : ''}>▼</button>
        <button data-a="buy" class="buy">✓ Bought</button>
        <button data-a="edit" title="Edit">✎</button>
        <button data-a="del" title="Delete" class="danger">✕</button>
      </div>
    </li>`).join('');
  $('#boughtCount').textContent = done.length ? `(${done.length})` : '';
  $('#clearHistory').hidden = !done.length;
  $('#history').innerHTML = done.map(it => `
    <li class="item done" data-id="${it.id}">
      <div class="rank">✓</div>
      <div>
        <div class="title">${esc(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</div>
        <div class="meta">Added ${fmtDate(it.addedAt)} · Bought ${fmtDate(it.boughtAt)}${it.boughtBy ? ' by ' + esc(it.boughtBy) : ''}</div>
      </div>
      <div class="actions"><button data-a="restore">↩ Back to list</button><button data-a="del" class="danger">✕</button></div>
    </li>`).join('');
  const w = $('#who');
  w.innerHTML = state.people.map(p => `<option${p === me ? ' selected' : ''}>${esc(p)}</option>`).join('') + '<option value="__add">+ Add person…</option>';
  if (!me || !state.people.includes(me)) { me = state.people[0]; ls.set('pl_me', me); w.value = me; }
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
$('#switchList').addEventListener('click', () => { ls.set('pl_code', ''); location.reload(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
init();
