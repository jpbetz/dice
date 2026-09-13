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
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'dg-title');
  root.innerHTML = `
    <header class="dg-header">
      <div><span class="dg-eyebrow">YOUR COLLECTION</span><h2 id="dg-title">My dice</h2></div>
      <button class="dg-close" type="button" aria-label="Close My dice">✕</button>
    </header>
    <div class="dg-scroll">
      <section class="dg-feature" aria-label="Preview dice">
        <div class="dg-preview"><img alt="" width="560" height="280"><span class="dg-preview-fallback" hidden>Preview unavailable</span></div>
        <div class="dg-detail"><div><span class="dg-house"></span><h3 class="dg-name" tabindex="-1"></h3></div>
          <button class="dg-favorite" type="button" aria-label="Favorite this set" aria-pressed="false">☆</button></div>
        <p class="dg-description"></p>
        <button class="dg-use" type="button">Use these dice</button>
        <p class="dg-status" role="status" aria-live="polite"></p>
      </section>
      <button class="dg-suggestion" type="button" hidden></button>
      <div class="dg-browse"><div class="dg-filters" role="group" aria-label="Show dice sets">
        <button type="button" data-filter="all" aria-pressed="true">All dice</button>
        <button type="button" data-filter="favorites" aria-pressed="false">Favorites</button>
      </div><span class="dg-count"></span></div>
      <div class="dg-grid" aria-label="Dice sets"></div>
      <p class="dg-empty" hidden>No favorites yet. Pick a set and tap its star to keep it here.</p>
    </div>
    <footer class="dg-footer"><span>Your dice, at every table.</span><button type="button" class="dg-rolls">Back to my rolls →</button></footer>`;
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  let selected = current();
  let filter = 'all';
  let returnTo = null;
  const stars = new Set(favorites());
  let catalogue = [];
  let cards = [];
  function refreshCatalogue() {
    catalogue = entries();
    const match = catalogue.find(e => e.id === suggested());
    $('.dg-suggestion').hidden = !match;
    $('.dg-suggestion').textContent = match ? `Match this table: preview ${match.name} →` : '';
  }
  const src = id => `models/dice-gallery/${encodeURIComponent(id)}.webp`;
  function picture(img, id) {
    img.hidden = false;
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
    $('.dg-preview-fallback').hidden = true;
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
    cards.forEach(({button, badge, entry: e}) => {
      button.setAttribute('aria-pressed', String(e.id === selected));
      badge.textContent = e.id === current() ? 'In use' : stars.has(e.id) ? '★ Favorite' : '';
    });
  }
  function grid() {
    const list = catalogue.filter(e => filter !== 'favorites' || stars.has(e.id));
    const grid = $('.dg-grid');
    grid.replaceChildren(); cards = [];
    for (const entry of list) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'dg-card'; button.dataset.set = entry.id;
      button.setAttribute('aria-label', `Preview ${entry.name} — ${entry.house}`);
      const img = document.createElement('img');
      img.width = 560; img.height = 280; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      picture(img, entry.id);
      const name = document.createElement('span'); name.className = 'dg-card-name'; name.textContent = entry.name;
      const badge = document.createElement('span'); badge.className = 'dg-card-badge';
      button.append(img, name, badge);
      button.addEventListener('click', () => {
        selected = entry.id; detail(); $('.dg-scroll').scrollTo({top:0});
        $('.dg-name').focus({preventScroll:true});
      });
      grid.append(button); cards.push({button,badge,entry});
    }
    $('.dg-count').textContent = `${list.length} sets`;
    $('.dg-empty').hidden = list.length > 0;
    detail();
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    closed(root);
    if (returnTo?.isConnected && !returnTo.closest('[hidden], .hidden')) returnTo.focus({preventScroll:true});
  }
  $('.dg-close').addEventListener('click', close);
  $('.dg-rolls').addEventListener('click', () => { close(); backToRolls(); });
  $('.dg-favorite').addEventListener('click', () => {
    if (stars.has(selected)) stars.delete(selected); else stars.add(selected);
    saveFavorites([...stars]);
    grid();
  });
  $('.dg-use').addEventListener('click', () => { choose(selected); detail(); });
  $('.dg-suggestion').addEventListener('click', () => { selected = suggested(); detail(); $('.dg-scroll').scrollTop = 0; });
  root.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    grid();
  }));
  root.addEventListener('keydown', e => {
    // A focused gallery never rolls or clears the shared table via shortcuts.
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  return {
    open(anchor) {
      returnTo = anchor || document.activeElement;
      refreshCatalogue();
      selected = current();
      // Include a selected venue-only set without advertising it to everyone.
      if (!catalogue.some(e => e.id === selected)) selected = catalogue[0]?.id;
      root.hidden = false; grid(); $('.dg-scroll').scrollTop = 0;
      opened(root);
      $('.dg-close').focus({preventScroll:true});
    },
    close,
    update() { if (!root.hidden) { refreshCatalogue(); grid(); } },
    get isOpen() { return !root.hidden; },
    get state() { return {open:!root.hidden, selected, current:current(), favorites:[...stars], filter}; },
  };
}
