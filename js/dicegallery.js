/*
Copyright 2026 The Dice Table Authors
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
*/

// Loaded only when the collection is opened. Images are offline portraits,
// not live renderers. Browsing is separate from choosing dice for future rolls.
export function createDiceGallery({ entries, current, choose, suggested, favorites, saveFavorites,
  backToRolls, opened, closed }) {
  const root = document.createElement('aside');
  root.id = 'dice-gallery';
  root.hidden = true;
  root.dataset.view = 'browse';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'dg-title');
  root.innerHTML = `
    <header class="dg-header">
      <div><span class="dg-eyebrow">YOUR COLLECTION</span><h2 id="dg-title">My dice</h2></div>
      <p>Find a set that feels like yours.</p>
      <button class="dg-close" type="button" aria-label="Close My dice">✕</button>
    </header>
    <div class="dg-workspace">
      <section class="dg-catalogue" aria-label="Browse dice sets">
        <div class="dg-tools">
          <label class="dg-search-label" for="dg-search">Find your dice</label>
          <input id="dg-search" type="search" placeholder="Search by name or collection" autocomplete="off" spellcheck="false">
          <div class="dg-browse"><div class="dg-filters" role="group" aria-label="Show dice sets">
            <button type="button" data-filter="all" aria-pressed="true">All dice</button>
            <button type="button" data-filter="favorites" aria-pressed="false">Favorites</button>
          </div><span class="dg-count" role="status"></span></div>
        </div>
        <div class="dg-scroll" tabindex="0" aria-label="Dice catalogue">
          <button class="dg-suggestion" type="button" hidden></button>
          <div class="dg-grid" aria-label="Dice sets"></div>
          <div class="dg-empty" hidden><p></p><button class="dg-clear-filters" type="button">Show all dice</button></div>
        </div>
      </section>
      <section class="dg-feature" id="dg-feature" aria-label="Preview dice">
        <div class="dg-feature-scroll">
          <button class="dg-back" type="button">← Back to collection</button>
          <div class="dg-preview"><img alt="" width="560" height="280"><span class="dg-preview-fallback" hidden>Preview unavailable</span></div>
          <div class="dg-detail"><div><span class="dg-house"></span><h3 class="dg-name" tabindex="-1" aria-live="polite"></h3></div>
            <button class="dg-favorite" type="button" aria-label="Favorite this set" aria-pressed="false">☆</button></div>
          <p class="dg-description"></p>
        </div>
        <div class="dg-selection">
          <button class="dg-use" type="button">Use these dice</button>
          <p class="dg-status" role="status" aria-live="polite"></p>
        </div>
      </section>
    </div>
    <footer class="dg-footer"><button class="dg-current" type="button"></button><button type="button" class="dg-rolls">Back to my rolls →</button></footer>`;
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  const narrow = window.matchMedia('(max-width: 760px), (max-width: 1000px) and (max-height: 500px)');
  let selected = current();
  let filter = 'all';
  let query = '';
  let returnTo = null;
  let previewFrom = null;
  let cardFocus = null;
  let workspaceFocus = null;
  const stars = new Set(favorites());
  let catalogue = [];
  let cards = [];
  function refreshCatalogue() {
    catalogue = entries();
    const match = catalogue.find(e => e.id === suggested());
    $('.dg-suggestion').hidden = !match;
    $('.dg-suggestion').textContent = match ? `Suggested for this table: ${match.name} →` : '';
  }
  const src = id => `models/dice-gallery/${encodeURIComponent(id)}.webp`;
  function picture(img, id) {
    if (img.dataset.set === id) return;
    img.dataset.set = id;
    img.hidden = false;
    if (img === $('.dg-preview img')) $('.dg-preview-fallback').hidden = true;
    img.onerror = () => {
      img.hidden = true;
      if (img === $('.dg-preview img')) $('.dg-preview-fallback').hidden = false;
    };
    img.src = src(id);
  }
  function detail() {
    const entry = catalogue.find(e => e.id === selected) || catalogue[0];
    if (!entry) return;
    selected = entry.id;
    picture($('.dg-preview img'), entry.id);
    $('.dg-house').textContent = entry.house;
    $('.dg-name').textContent = entry.name;
    $('.dg-description').textContent = entry.description;
    const isFavorite = stars.has(selected);
    $('.dg-favorite').textContent = isFavorite ? '★' : '☆';
    $('.dg-favorite').setAttribute('aria-pressed', String(isFavorite));
    $('.dg-favorite').setAttribute('aria-label', `${isFavorite ? 'Unfavorite' : 'Favorite'} ${entry.name}`);
    const using = current() === selected;
    $('.dg-use').textContent = using ? '✓ Your current dice' : 'Use these dice';
    $('.dg-use').disabled = using;
    $('.dg-status').textContent = using
      ? 'Used for new rolls. Saved rolls can have their own set.'
      : 'Preview only. Your current dice haven’t changed.';
    const currentName = catalogue.find(e => e.id === current())?.name || 'Your set';
    $('.dg-current').textContent = `In use: ${currentName}`;
    $('.dg-current').setAttribute('aria-label', `Preview your current dice: ${currentName}`);
    const tabStop = cards.find(c => c.entry.id === cardFocus) || cards.find(c => c.entry.id === selected) || cards[0];
    cards.forEach(({button, badge, entry: e}) => {
      button.setAttribute('aria-pressed', String(e.id === selected));
      button.tabIndex = button === tabStop?.button ? 0 : -1;
      badge.textContent = e.id === current() ? 'In use' : stars.has(e.id) ? '★ Favorite' : '';
    });
  }
  function preview(id, anchor) {
    selected = id; previewFrom = anchor; detail();
    root.dataset.view = 'detail';
    $('.dg-feature-scroll').scrollTop = 0;
    // The catalogue keeps both its scroll and keyboard focus on a wide view.
    // On a narrow view the detail is a page, with an explicit route back.
    if (narrow.matches) $('.dg-back').focus({preventScroll:true});
  }
  function browse() {
    root.dataset.view = 'browse';
    const anchor = previewFrom?.isConnected ? previewFrom : cards.find(c => c.entry.id === selected)?.button;
    (anchor || $('#dg-search')).focus({preventScroll:true});
  }
  function grid() {
    // Sea-glass should also be found by "seaglass" or "sea glass".
    const searchable = text => text.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}|[^\p{L}\p{N}\s]/gu, '');
    const words = searchable(query).trim().split(/\s+/).filter(Boolean);
    const list = catalogue.filter(e => (filter !== 'favorites' || stars.has(e.id))
      && words.every(word => searchable(`${e.name} ${e.house}`).includes(word)));
    const grid = $('.dg-grid');
    // Rebuilding is reserved for an actual catalogue/filter change. Merely
    // choosing dice or receiving a table update must not drop focus or scroll.
    const focusedSet = document.activeElement?.closest('.dg-card')?.dataset.set;
    grid.replaceChildren(); cards = [];
    for (const entry of list) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'dg-card'; button.dataset.set = entry.id;
      button.setAttribute('aria-label', `Preview ${entry.name} — ${entry.house}`);
      button.setAttribute('aria-controls', 'dg-feature');
      const img = document.createElement('img');
      img.width = 560; img.height = 280; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      picture(img, entry.id);
      const house = document.createElement('span'); house.className = 'dg-card-house'; house.textContent = entry.house;
      const name = document.createElement('span'); name.className = 'dg-card-name'; name.textContent = entry.name;
      const badge = document.createElement('span'); badge.className = 'dg-card-badge';
      button.append(img, house, name, badge);
      button.addEventListener('focus', () => {
        cardFocus = entry.id;
        cards.forEach(c => { c.button.tabIndex = c.button === button ? 0 : -1; });
      });
      button.addEventListener('click', () => preview(entry.id, button));
      grid.append(button); cards.push({button,badge,entry});
    }
    $('.dg-count').textContent = `${list.length} ${list.length === 1 ? 'set' : 'sets'}`;
    $('.dg-empty').hidden = list.length > 0;
    $('.dg-empty p').textContent = query.trim() ? 'No dice match this search. Try another name or collection.'
      : 'No favorites yet. Preview a set and tap its star to keep it here.';
    if (focusedSet) {
      (cards.find(c => c.entry.id === focusedSet)?.button || $('#dg-search')).focus({preventScroll:true});
    }
    detail();
  }
  function resetFilters() {
    filter = 'all'; query = ''; $('#dg-search').value = '';
    root.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    grid(); $('.dg-scroll').scrollTop = 0;
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    closed(root);
    if (returnTo?.isConnected && !returnTo.closest('[hidden], .hidden')) returnTo.focus({preventScroll:true});
  }
  $('.dg-close').addEventListener('click', close);
  $('.dg-rolls').addEventListener('click', () => { close(); backToRolls(); });
  $('.dg-back').addEventListener('click', browse);
  $('.dg-grid').addEventListener('keydown', e => {
    const index = cards.findIndex(c => c.button === e.target);
    if (index < 0) return;
    const columns = getComputedStyle($('.dg-grid')).gridTemplateColumns.split(' ').length;
    const next = {ArrowLeft:index-1, ArrowRight:index+1, ArrowUp:index-columns,
      ArrowDown:index+columns, Home:0, End:cards.length-1}[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const card = cards[Math.max(0, Math.min(cards.length-1, next))];
    card.button.focus({preventScroll:true});
    card.button.scrollIntoView({block:'nearest'});
    if (!narrow.matches) preview(card.entry.id, card.button);
  });
  $('.dg-current').addEventListener('click', e => preview(current(), e.currentTarget));
  $('.dg-favorite').addEventListener('click', () => {
    if (stars.has(selected)) stars.delete(selected); else stars.add(selected);
    saveFavorites([...stars]);
    if (filter === 'favorites') grid(); else detail();
  });
  $('.dg-use').addEventListener('click', () => { choose(selected); detail(); });
  $('.dg-suggestion').addEventListener('click', e => preview(suggested(), e.currentTarget));
  $('#dg-search').addEventListener('input', e => { query = e.target.value; grid(); $('.dg-scroll').scrollTop = 0; });
  $('.dg-clear-filters').addEventListener('click', () => { resetFilters(); $('#dg-search').focus(); });
  root.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    grid(); $('.dg-scroll').scrollTop = 0;
  }));
  root.addEventListener('focusin', e => { workspaceFocus = e.target; });
  narrow.addEventListener('change', () => {
    if (root.hidden) return;
    // display:none can blur the old control before the media event arrives.
    const focus = root.contains(document.activeElement) ? document.activeElement : workspaceFocus;
    if (narrow.matches) {
      root.dataset.view = $('.dg-feature').contains(focus) ? 'detail' : 'browse';
      if (root.dataset.view === 'detail') $('.dg-back').focus({preventScroll:true});
    } else if (focus === $('.dg-back') || !root.contains(document.activeElement)) {
      (cards.find(c => c.entry.id === selected)?.button || $('.dg-name')).focus({preventScroll:true});
    }
  });
  root.addEventListener('keydown', e => {
    // A focused gallery never rolls or clears the shared table via shortcuts.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (narrow.matches && root.dataset.view === 'detail') browse(); else close();
    }
  });
  return {
    open(anchor) {
      returnTo = anchor || document.activeElement;
      refreshCatalogue();
      selected = current();
      // Include a selected venue-only set without advertising it to everyone.
      if (!catalogue.some(e => e.id === selected)) selected = catalogue[0]?.id;
      cardFocus = selected; previewFrom = null;
      root.dataset.view = 'browse'; root.hidden = false; resetFilters();
      $('.dg-feature-scroll').scrollTop = 0;
      opened(root);
      $('.dg-close').focus({preventScroll:true});
    },
    close,
    update() {
      if (root.hidden) return;
      const previous = JSON.stringify(catalogue);
      refreshCatalogue();
      if (previous !== JSON.stringify(catalogue)) grid(); else detail();
    },
    get isOpen() { return !root.hidden; },
    get state() { return {open:!root.hidden, selected, current:current(), favorites:[...stars], filter, query, view:root.dataset.view}; },
  };
}
