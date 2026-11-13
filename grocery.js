'use strict';
/* Grocery tab — a simple check-off reminder list.
   Stored in the same list document as everything else (field: grocery = [{id, name, done, addedBy, addedAt, doneAt, doneBy}]). */
(() => {
  const list = () => state.grocery || [];
  const mut = fn => mutate(s => { s.grocery = s.grocery || []; fn(s.grocery); });

  /* categories: [id, icon, title, keyword regex]. First rule that matches wins, so order matters. */
  const CATS = [
    ['produce', '🥬', 'Produce'], ['meat', '🥩', 'Meat & Fish'], ['dairy', '🥛', 'Dairy & Eggs'],
    ['pantry', '🍚', 'Pantry'], ['snacks', '🥤', 'Drinks & Snacks'], ['house', '🧼', 'Household'], ['other', '🛒', 'Other']
  ];
  const RULES = [
    ['house', /\b(soap|sabon|shampoo|conditioner|toothpaste|toothbrush|tissue|toilet|detergent|bleach|dishwash|diaper|napkin|wipes|trash bag|garbage|cleaner|fabcon|fabric|deodorant|lotion|alcohol|sponge|foil|cling|ziplock|battery|batteries|light ?bulb|napkin|sanitary|pads?|razor|cotton|mop|broom|walis|panlinis|sanitizer)/],
    ['snacks', /\b(water|tubig|juice|soda|softdrink|coke|sprite|royal|gatorade|beer|alak|wine|milk ?tea|energy drink|drinks?|tea|chips|chichirya|biscuits?|cookies?|crackers?|candy|candies|chocolate|snacks?|nuts|popcorn|ice cream|sorbetes|skyflakes|piattos|nova)\b/],
    ['pantry', /\b(canned|sardines|corned|tuna|spam|peanut butter|coconut milk|gata|noodles?|pancit|pasta|spaghetti|macaroni|rice|bigas|flour|sugar|asukal|salt|asin|oil|suka|vinegar|toyo|soy|sauce|ketchup|mayo|mayonnaise|bagoong|patis|pepper|spices?|seasoning|cereal|oat|bread|tinapay|pandesal|cooking|baking|beans|monggo|lentils|coffee|kape|creamer|3-in-1|cocoa|jam|honey|syrup|instant|lucky me|cup noodles|breadcrumbs|tomato paste|evap|condensed|all-purpose cream|nestle cream)/],
    ['produce', /\b(apples?|bananas?|mango(es)?|oranges?|grapes?|lemons?|calamansi|onions?|sibuyas|garlic|bawang|tomato(es)?|kamatis|potato(es)?|patatas|carrots?|cabbage|repolyo|lettuce|pechay|kangkong|eggplant|talong|ampalaya|sitaw|squash|kalabasa|corn|mais|ginger|luya|cucumber|pipino|broccoli|spinach|veggies?|vegetables?|gulay|fruits?|prutas|avocado|papaya|pineapple|pakwan|watermelon|melon|berries|strawberr\w*|mushrooms?|okra|malunggay|saging|mangga|ubas|sayote|labanos|radish|celery|leeks?|scallions?|herbs?|basil|parsley|chili|siling|camote|gabi|ube|singkamas|upo|patola|bell pepper)/],
    ['meat', /\b(chicken|manok|pork|baboy|beef|baka|liempo|bacon|ham|sausages?|hotdogs?|longganisa|tocino|fish|isda|bangus|tilapia|galunggong|shrimps?|hipon|squid|pusit|crab|alimango|meat|karne|ground|steak|tapa|chops?|salmon|dilis|tuyo|daing|tahong|clams?|oysters?|nuggets|tapsilog|wings|thighs|breast|bistek|sisig|adobo)/],
    ['dairy', /\b(milk|gatas|eggs?|itlog|cheese|keso|butter|margarine|yogh?urt|cream|whipping|evaporated)\b/]
  ];
  const guess = name => { const n = String(name || '').toLowerCase(); const r = RULES.find(x => x[1].test(n)); return r ? r[0] : 'other'; };
  const catOf = i => (CATS.some(c => c[0] === i.cat) ? i.cat : guess(i.name));
  const closed = new Set(JSON.parse(ls.get('pl_g_closed') || '[]'));
  window.groceryGuess = guess;

  function render() {
    const root = $('#gList'); if (!root) return;
    const all = list();
    const live = all.filter(i => !i.hist);
    const todo = live.filter(i => !i.done);
    const got = live.filter(i => i.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const hist = all.filter(i => i.hist).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const row = i => `<li class="gitem${i.done ? ' got' : ''}" data-gid="${i.id}">
      <label class="gcheck"><input type="checkbox" data-gcheck="${i.id}"${i.done ? ' checked' : ''}><span>${esc(i.name)}</span></label>
      ${i.done ? '' : `<span class="gcatwrap" title="Change category">${CATS.find(c => c[0] === catOf(i))[1]}<select class="gcatsel" data-gsel="${i.id}" aria-label="Category">${CATS.map(c => `<option value="${c[0]}"${c[0] === catOf(i) ? ' selected' : ''}>${c[1]} ${c[2]}</option>`).join('')}</select></span>`}
      <button class="icon" data-gdel="${i.id}" aria-label="Delete" title="Delete">${svg('trash')}</button>
    </li>`;
    $('#gSummary').innerHTML = todo.length
      ? `<span class="stat">${todo.length} to get</span>${got.length ? `<span class="stat">${got.length} done</span>` : ''}`
      : `<span class="stat">${all.length ? 'All done 🎉' : 'Nothing yet'}</span>`;
    $('#gEmpty').hidden = live.length > 0;
    $('#gHistCount').textContent = hist.length ? `(${hist.length})` : '';
    $('#gHistBox').hidden = !hist.length;
    let last = '';
    $('#gHist').innerHTML = hist.map(i => {
      const day = i.doneAt ? fmtDate(i.doneAt) : 'Earlier';
      const head = day !== last ? `<li class="gsep">${day}</li>` : ''; last = day;
      return head + `<li class="gitem got" data-gid="${i.id}">
        <div class="gcheck"><span>${esc(i.name)}</span>${i.doneBy ? `<small class="muted">${esc(i.doneBy)}</small>` : ''}</div>
        <button class="link" data-gagain="${i.id}" title="Buy again">＋ again</button>
        <button class="icon" data-gdel="${i.id}" aria-label="Delete" title="Delete">${svg('trash')}</button>
      </li>`;
    }).join('');
    const groups = CATS.map(c => [c, todo.filter(i => catOf(i) === c[0])]).filter(g => g[1].length).map(([c, items]) =>
      `<li class="ggroup"><details data-gcat="${c[0]}"${closed.has(c[0]) ? '' : ' open'}><summary><span>${c[1]}</span><b>${c[2]}</b><em>${items.length}</em></summary><ul class="glist">${items.map(row).join('')}</ul></details></li>`).join('');
    root.innerHTML = groups + (got.length ? `<li class="gsep">Done (${got.length}) <button class="link danger" id="gClear">Move to history</button></li>` + got.map(row).join('') : '');
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
      g.push({ id: uid(), name, cat: guess(name), done: false, addedBy: me, addedAt: now });
    }));
    input.value = ''; input.focus();
  });

  $('#paneGrocery').addEventListener('change', e => {
    const sel = e.target.dataset.gsel;
    if (sel) { const v = e.target.value; mut(g => { const it = g.find(x => x.id === sel); if (it) it.cat = v; }); return; }
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
    if (e.target.id === 'gClear') mut(g => g.forEach(x => { if (x.done && !x.hist) x.hist = true; }));
    const again = e.target.closest('[data-gagain]');
    if (again) {
      const src = list().find(x => x.id === again.dataset.gagain); if (!src) return;
      if (list().some(x => !x.hist && !x.done && x.name.toLowerCase() === src.name.toLowerCase())) return toast('Already on your list');
      mut(g => g.push({ id: uid(), name: src.name, cat: catOf(src), done: false, addedBy: me, addedAt: new Date().toISOString() }));
      toast('Added back to Grocery');
    }
    if (e.target.id === 'gHistClear' && confirm('Remove all purchase history?')) mut(g => { for (let i = g.length - 1; i >= 0; i--) if (g[i].hist) g.splice(i, 1); });
  });

  $('#paneGrocery').addEventListener('toggle', e => {
    const c = e.target.dataset && e.target.dataset.gcat; if (!c) return;
    e.target.open ? closed.delete(c) : closed.add(c);
    ls.set('pl_g_closed', JSON.stringify([...closed]));
  }, true);

  window.renderGrocery = render;
  render();
})();
