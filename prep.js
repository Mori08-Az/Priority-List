'use strict';
/* Prepared page — 72-hour emergency preparedness checklist (Philippines household).
   Stored in the same list document as everything else (field: prep = { done:{id:true}, people:n }). */
(() => {
  const $ = q => document.querySelector(q);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanCode = v => (v || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  let state = { items: [], prep: {} }, store, me = ls.get('pl_me') || '';
  const listCode = cleanCode(new URLSearchParams(location.search).get('list')) || ls.get('pl_code') || '';
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }
  function onData(s) { if (s) state = { items: s.items || [], prep: s.prep || {} }; render(); }
  async function mutate(fn) { try { await store.mutate(fn); } catch (e) { toast('Could not save: ' + e.message); } }
  function localStore() {
    const key = 'pl_state_' + listCode;
    const load = () => { try { return JSON.parse(ls.get(key)) || null; } catch { return null; } };
    return { start(cb) { cb(load()); }, async mutate(fn) { const s = load() || { items: [], people: ['Me', 'JD'] }; fn(s); ls.set(key, JSON.stringify(s)); onData(s); } };
  }
  function firebaseStore() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db = firebase.firestore(), ref = db.collection('lists').doc(listCode);
    return {
      start(cb) { ref.onSnapshot(snap => cb(snap.exists ? snap.data() : null), e => toast('Sync error: ' + e.message)); },
      async mutate(fn) { await db.runTransaction(async t => { const snap = await t.get(ref); const s = snap.exists ? snap.data() : { items: [], people: ['Me', 'JD'] }; fn(s); t.set(ref, s); }); }
    };
  }
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  async function init() {
    $('#backLink').href = 'index.html' + (listCode ? '?list=' + encodeURIComponent(listCode) : '');
    if (!listCode) { $('#prepBody').innerHTML = '<div class="card pcard"><p>Open the Priority List first to choose your list code, then come back here.</p></div>'; return; }
    if (window.FIREBASE_CONFIG) {
      try {
        const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
        await loadScript(base + 'firebase-app-compat.js'); await loadScript(base + 'firebase-firestore-compat.js');
        store = firebaseStore(); $('#sync').textContent = 'Synced'; $('#sync').className = 'pill on';
      } catch { toast('Could not load sync - using this device only'); store = localStore(); }
    } else store = localStore();
    store.start(onData);
  }
  // q: which of "The Three Questions" the section answers. wk: week of the gradual build plan.
  // items: [id, label, canBuy] — canBuy items get a "+ list" button that adds them to the Priority List.
  const SECTIONS = [
    { id: 'water', icon: '💧', title: 'Water', q: 'stay', wk: 1,
      tip: 'Highest priority. Count by the number of people in the household (see the calculator above).',
      items: [['w1', '3 days of drinking water per person', 1], ['w2', 'Extra water for basic sanitation', 1], ['w3', 'Water stored somewhere protected from flooding'], ['w4', 'Water purification option (tablets / filter)', 1]] },
    { id: 'food', icon: '🍚', title: 'Food', q: 'stay', wk: 3,
      tip: 'Stock what the household already eats and rotate it into normal meals. Favour ready-to-eat, minimal cooking, no refrigeration.',
      items: [['f1', 'Rice / staple food', 1], ['f2', 'Canned tuna', 1], ['f3', 'Sardines', 1], ['f4', 'Canned meat', 1], ['f5', 'Crackers / biscuits', 1], ['f6', 'Oatmeal', 1], ['f7', 'Peanut butter', 1], ['f8', 'Nuts', 1], ['f9', 'Shelf-stable milk', 1], ['f10', 'Ready-to-eat meals', 1], ['f11', 'Other foods the household already eats regularly']] },
    { id: 'light', icon: '🔦', title: 'Lighting', q: 'stay', wk: 1,
      tip: 'Keep at least one flashlight where you can reach it immediately in a blackout.',
      items: [['l1', '2–3 flashlights or emergency lamps', 1], ['l2', 'Spare batteries', 1], ['l3', 'Headlamp (if available)', 1], ['l4', 'Emergency light', 1], ['l5', 'One flashlight kept immediately accessible']] },
    { id: 'power', icon: '🔋', title: 'Power & communication', q: 'leave', wk: 2,
      tip: 'Before a major storm: charge phones and power banks, check flashlights and batteries, download important info for offline use.',
      items: [['p1', '2+ power banks', 1], ['p2', 'Phone charging cables', 1], ['p3', 'Wall chargers', 1], ['p4', 'Car charger (if available)', 1], ['p5', 'Battery-powered or USB radio', 1], ['p6', 'Backup way to receive official announcements'], ['p7', 'Power banks fully charged before major storms'], ['p8', 'Important info downloaded for offline access']] },
    { id: 'med', icon: '💊', title: 'Medicine & first aid', q: 'stay', wk: 4,
      tip: 'Never let essential medication run out during an emergency.',
      items: [['m1', 'Essential household medications', 1], ['m2', 'Reasonable medication buffer', 1], ['m3', 'First-aid kit', 1], ['m4', 'Bandages', 1], ['m5', 'Gauze', 1], ['m6', 'Medical tape', 1], ['m7', 'Antiseptic', 1], ['m8', 'Thermometer', 1], ['m9', 'Basic OTC medications the household normally uses', 1]] },
    { id: 'hyg', icon: '🧼', title: 'Hygiene', q: 'stay', wk: 4,
      items: [['h1', 'Toilet paper', 1], ['h2', 'Soap', 1], ['h3', 'Toothpaste', 1], ['h4', 'Toothbrushes', 1], ['h5', 'Wet wipes', 1], ['h6', 'Hand sanitizer / alcohol', 1], ['h7', 'Feminine hygiene products (if needed)', 1], ['h8', 'Garbage bags', 1], ['h9', 'Other personal hygiene items', 1]] },
    { id: 'cash', icon: '💵', title: 'Cash', q: 'leave', wk: 5,
      tip: 'ATMs, card terminals and e-payments may be down. Keep physical pesos in smaller denominations somewhere secure.',
      items: [['c1', 'Small emergency reserve of physical pesos'], ['c2', 'Mostly smaller denominations'], ['c3', 'Kept somewhere secure']] },
    { id: 'docs', icon: '📄', title: 'Important documents', q: 'leave', wk: 5,
      tip: 'Physical copies in a waterproof pouch, plus secure digital copies.',
      items: [['d1', 'IDs'], ['d2', 'Important household documents'], ['d3', 'Insurance information'], ['d4', 'Medical information'], ['d5', 'Emergency contact numbers'], ['d6', 'Important account / contact information'], ['d7', 'Physical copies in a waterproof pouch / container', 1], ['d8', 'Secure digital copies']] },
    { id: 'cloth', icon: '👕', title: 'Clothing & weather protection', q: 'stay', wk: 5,
      tip: 'Rain and flooding should be specifically considered.',
      items: [['k1', 'Change of clothes'], ['k2', 'Extra underwear'], ['k3', 'Extra socks'], ['k4', 'Sturdy footwear'], ['k5', 'Raincoat / poncho', 1], ['k6', 'Waterproof bags', 1], ['k7', 'Mosquito protection', 1]] },
    { id: 'safe', icon: '🧯', title: 'Safety equipment', q: 'stay', wk: 4,
      items: [['s1', 'Fire extinguisher', 1], ['s2', 'Whistle', 1], ['s3', 'Basic tools', 1], ['s4', 'Utility knife / multitool (if appropriate)', 1], ['s5', 'Work gloves', 1], ['s6', 'Masks', 1], ['s7', 'Waterproof matches / lighter (if appropriate)', 1]] },
    { id: 'bag', icon: '🎒', title: 'Go-bag', q: 'leave', wk: 5,
      tip: 'A bag you can grab quickly if you have to evacuate. Keep it where it can be reached fast.',
      items: [['b1', 'Bottled water'], ['b2', 'Ready-to-eat snacks / food'], ['b3', 'First aid + essential medication'], ['b4', 'Power bank, charging cable, flashlight'], ['b5', 'Copies of IDs / documents + emergency contacts'], ['b6', 'Shirt, underwear, socks, rain protection'], ['b7', 'Tissue, wet wipes, soap, toothbrush'], ['b8', 'Whistle, masks, small emergency cash'], ['b9', 'Go-bag stored where it can be reached quickly'], ['b0', 'The bag itself', 1]] },
    { id: 'typhoon', icon: '🌀', title: 'Typhoon plan', q: 'stay', wk: 0,
      items: [['t1', 'Secure outdoor items'], ['t2', 'Charge phones and power banks'], ['t3', 'Water stocked'], ['t4', 'Ready-to-eat food stocked'], ['t5', 'Emergency lighting checked'], ['t6', 'Know where to monitor official weather / disaster announcements']] },
    { id: 'flood', icon: '🌊', title: 'Flood plan', q: 'leave', wk: 0,
      items: [['o1', 'Emergency supplies kept elevated'], ['o2', 'Important documents waterproofed'], ['o3', 'Rain protection ready'], ['o4', 'Evacuation routes known'], ['o5', 'Nearest safe / elevated location known']] },
    { id: 'quake', icon: '🏚️', title: 'Earthquake plan', q: 'leave', wk: 0,
      items: [['e1', 'Everyone knows where to shelter'], ['e2', 'Safe areas identified'], ['e3', 'Heavy objects secured where practical'], ['e4', 'Shoes and flashlight kept accessible'], ['e5', 'Evacuation routes known']] },
    { id: 'outage', icon: '🔌', title: 'Long power outage plan', q: 'stay', wk: 0,
      items: [['u1', 'Power banks kept charged'], ['u2', 'Independent lighting'], ['u3', 'Food that needs no refrigeration'], ['u4', 'A way to receive information']] },
    { id: 'recover', icon: '💰', title: 'Recovery (financial)', q: 'recover', wk: 0,
      tip: 'The physical 72-hour stockpile does not replace the financial emergency fund.',
      items: [['r1', 'Emergency fund in place'], ['r2', 'Insurance in place and policy info saved'], ['r3', 'Financial records saved (digital + physical copy)']] }
  ];
  const QS = {
    stay: ['🏠', 'Can we stay?', 'Food + water + medicine + power + hygiene'],
    leave: ['🎒', 'Can we leave?', 'Go-bags + documents + cash + communication + evacuation plan'],
    recover: ['💰', 'Can we recover?', 'Emergency fund + insurance + financial records']
  };
  const WEEKS = [
    [1, 'Water, flashlights, batteries'], [2, 'Power banks, cables, emergency radio'], [3, 'Emergency food'],
    [4, 'Hygiene and first-aid supplies'], [5, 'Documents, emergency cash, go-bag']
  ];
  const LEVELS = [['Level 1 — 72 hours', 'Minimum household resilience. Start here.'], ['Level 2 — 7 days', 'Stronger preparedness, less reliance on outside help.'], ['Level 3 — 2 weeks', 'High resilience for prolonged disruptions.']];
  const GOOD = 'Flashlights, power banks, bottled water, canned food, first-aid supplies, batteries, hygiene products, rain gear, fire extinguisher';
  const AVOID = 'Expensive “survival” gadgets, tactical gear, specialised kit with little everyday use, huge amounts of food you will never eat';

  const prep = () => state.prep || {};
  const done = () => prep().done || {};
  const people = () => Math.max(1, Math.min(30, +prep().people || 4));
  const open = new Set(ls.get('pl_prep_open') ? JSON.parse(ls.get('pl_prep_open')) : []);
  const mut = fn => mutate(s => { s.prep = s.prep || {}; s.prep.done = s.prep.done || {}; fn(s.prep); });
  const stat = sec => { const d = done(); const n = sec.items.filter(i => d[i[0]]).length; return [n, sec.items.length]; };
  const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
  const bar = p => `<div class="pbar"><span style="width:${p}%"></span></div>`;

  function render() {
    const root = $('#prepBody'); if (!root) return;
    const d = done(), n = people();
    let all = 0, got = 0;
    SECTIONS.forEach(s => { const [a, t] = stat(s); got += a; all += t; });
    const L = 3 * n * 3, S = 1 * n * 3; // 3 L drinking + 1 L sanitation, per person per day, 3 days
    const qcards = Object.keys(QS).map(k => {
      const secs = SECTIONS.filter(s => s.q === k); let a = 0, t = 0; secs.forEach(s => { const r = stat(s); a += r[0]; t += r[1]; });
      const p = pct(a, t);
      return `<div class="qcard"><div class="qh">${QS[k][0]} ${QS[k][1]} <b>${p}%</b></div>${bar(p)}<small>${QS[k][2]}</small></div>`;
    }).join('');
    const weeks = WEEKS.map(([w, txt]) => {
      const secs = SECTIONS.filter(s => s.wk === w); let a = 0, t = 0; secs.forEach(s => { const r = stat(s); a += r[0]; t += r[1]; });
      return `<li class="${a === t ? 'wdone' : ''}"><b>Week ${w}</b> ${txt} <span>${a}/${t}</span></li>`;
    }).join('');
    const secs = SECTIONS.map(s => {
      const [a, t] = stat(s);
      return `<details class="psec" data-sec="${s.id}"${open.has(s.id) ? ' open' : ''}>
        <summary><span class="pi">${s.icon}</span><span class="pt">${esc(s.title)}</span><span class="pc${a === t ? ' ok' : ''}">${a}/${t}</span></summary>
        ${bar(pct(a, t))}
        ${s.tip ? `<p class="ptip">${esc(s.tip)}</p>` : ''}
        <ul class="plist">${s.items.map(([id, label, buy]) => `
          <li><label class="pcheck"><input type="checkbox" data-pid="${id}"${d[id] ? ' checked' : ''}><span>${esc(label)}</span></label>${buy && !d[id] ? `<button class="link" data-padd="${id}" title="Add to Priority List">＋ list</button>` : ''}</li>`).join('')}
        </ul></details>`;
    }).join('');
    const water = SECTIONS[0].id === 'water' ? `<div class="card pcard"><h3>💧 Water calculator</h3>
      <label class="plab">People in household <input id="prepPeople" type="number" min="1" max="30" value="${n}" inputmode="numeric"></label>
      <p class="pbig"><b>${L} L</b> drinking + <b>${S} L</b> sanitation = <b>${L + S} L</b> for 72 hours</p>
      <small class="muted">Guideline: about 3 L drinking + 1 L sanitation per person per day. Adjust for infants, illness, or hot weather.</small></div>` : '';
    root.innerHTML = `
      <div class="card pcard phero"><div class="pnum">${pct(got, all)}%</div><div><b>72-hour ready</b><br><small class="muted">${got} of ${all} items checked</small></div></div>
      <div class="pgoal">Goal: if something serious happens tonight, the household gets through the next three days calmly — no panic, no immediate outside help. Not a prepper; no excessive stockpiling.</div>
      <div class="qgrid">${qcards}</div>
      ${water}
      <h2>Checklist</h2>${secs}
      <h2>Build it gradually</h2><ol class="pweeks">${weeks}</ol>
      <h2>Buy practically</h2>
      <div class="card pcard"><p><b>👍 Good buys</b> (useful in normal life too)<br><small>${GOOD}</small></p><p><b>🚫 Avoid</b><br><small>${AVOID}</small></p></div>
      <h2>Targets</h2>
      <ul class="plevels">${LEVELS.map(l => `<li><b>${l[0]}</b><br><small>${l[1]}</small></li>`).join('')}</ul>
      <button id="prepReset" class="link danger">Reset checklist</button>`;
  }

  /* events */
  $('#prepBody').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pid) { const id = t.dataset.pid, v = t.checked; mut(p => { if (v) p.done[id] = new Date().toISOString(); else delete p.done[id]; }); }
    else if (t.id === 'prepPeople') { const v = Math.max(1, Math.min(30, +t.value || 1)); mut(p => { p.people = v; }); }
  });
  $('#prepBody').addEventListener('toggle', e => {
    const sec = e.target.dataset && e.target.dataset.sec; if (!sec) return;
    e.target.open ? open.add(sec) : open.delete(sec);
    ls.set('pl_prep_open', JSON.stringify([...open]));
  }, true);
  $('#prepBody').addEventListener('click', e => {
    const a = e.target.closest('[data-padd]');
    if (a) {
      const it = SECTIONS.flatMap(s => s.items).find(i => i[0] === a.dataset.padd); if (!it) return;
      const name = it[1];
      if (state.items.some(x => !x.boughtAt && x.name.toLowerCase() === name.toLowerCase())) return toast('Already on your list');
      mutate(s => { s.items.push({ id: uid(), name, qty: 0, price: 0, note: '72-hour prep', addedBy: me, addedAt: new Date().toISOString() }); });
      return toast('Added to Priority List');
    }
    if (e.target.id === 'prepReset' && confirm('Uncheck everything in the preparedness checklist?')) mut(p => { p.done = {}; });
  });

  render();
  init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
