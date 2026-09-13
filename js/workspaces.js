/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { renderQuickRolls } from './firstplay.js';

// Navigation owns presentation only. Existing DOM nodes are borrowed, never
// cloned: a draft, editor, or library transaction keeps its original handlers.
export function createWorkspaces(actions) {
  const $ = id => document.getElementById(id);
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const button = (text, fn, cls = 'btn') => {
    const el = node('button', cls, text); el.type = 'button';
    el.addEventListener('click', fn); return el;
  };
  const names = { tables: 'Tables', dice: 'My dice & rolls', people: 'People', account:'You & private library' };
  const nav = node('nav', 'workspace-nav'); nav.id = 'workspace-nav'; nav.setAttribute('aria-label', 'Workspaces');
  const root = node('section', 'hidden'); root.id = 'workspace';
  root.setAttribute('aria-labelledby', 'workspace-title');
  const head = node('header', 'workspace-head');
  const back = button('×', () => close(), 'btn ghost'); back.id = 'workspace-back';
  back.setAttribute('aria-label','Close workspace'); back.title='Close';
  const title = node('h2', '', ''); title.id = 'workspace-title';
  const tabs = node('nav', 'workspace-tabs'); tabs.setAttribute('aria-label', 'Workspaces');
  for (const [key, name] of Object.entries(names).filter(([key])=>key!=='account')) {
    for (const host of [nav, tabs]) {
      const b = button(name, e => open(key, e.currentTarget), 'btn ghost');
      b.dataset.workspace = key; host.append(b);
    }
  }
  const moreButton=button('More',()=>openMore(),'btn ghost'); moreButton.id='phone-more';
  moreButton.setAttribute('aria-haspopup','dialog'); moreButton.setAttribute('aria-expanded','false'); nav.append(moreButton);
  const more=node('section','phone-more-panel hidden'); more.id='phone-more-panel';
  const moreHead=node('header','phone-more-head');
  const moreTitle=node('h2','','Table tools'); moreTitle.id='phone-more-title';
  const moreClose=button('×',()=>closeMore(),'btn ghost'); moreClose.id='phone-more-close'; moreClose.setAttribute('aria-label','Close table tools');
  moreHead.append(moreTitle,moreClose);
  const moreTools=node('div','phone-more-tools');
  for(const [key,label] of [['preferences','Preferences'],['history','Roll history'],['notation','Roll notation'],['help','Help']]){
    const b=button(label,()=>{closeMore();actions.tool(key,moreButton);}); b.id=`phone-tool-${key}`;moreTools.append(b);
  }
  more.append(moreHead,moreTools);document.body.append(more);
  const clearHome=document.createComment('table clear return point'); $('corner-controls').before(clearHome);
  function positionPhoneTools(){
    nav.querySelector('[data-workspace="dice"]').textContent=window.innerWidth<=640?'Rolls':names.dice;
    if(window.innerWidth<=640) moreTools.append($('corner-controls'));
    else { closeMore();clearHome.after($('corner-controls')); }
  }
  function openMore(){
    close();actions.beforeOpen();more.classList.remove('hidden');moreButton.setAttribute('aria-expanded','true');actions.modalOpen(more);moreClose.focus({preventScroll:true});
  }
  function closeMore(){
    if(more.classList.contains('hidden'))return;
    actions.modalClose(more);more.classList.add('hidden');moreButton.setAttribute('aria-expanded','false');moreButton.focus({preventScroll:true});
  }
  more.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeMore();}if(e.key!=='Tab')e.stopPropagation();});
  const status=node('p','workspace-status');status.hidden=true;status.setAttribute('role','status');
  head.append(title, back, tabs, status);
  const content = node('div', 'workspace-content'); root.append(head, content);
  const tables = node('section', 'workspace-section'); tables.id = 'workspace-tables';
  const tableOverview=node('div'),tableRecents=node('div'),homeSlot=node('div');tableOverview.id='workspace-table-overview';tableRecents.id='workspace-table-recents';homeSlot.id='workspace-homes-slot';
  tables.append(tableOverview,homeSlot,tableRecents);
  const people = node('section', 'workspace-section'); people.id = 'workspace-people';
  const peopleOverview=node('div'),peopleSlot=node('div');peopleOverview.id='workspace-people-current';peopleSlot.id='workspace-people-slot';people.append(peopleOverview,peopleSlot);
  const dice = node('section', 'workspace-section'); dice.id = 'workspace-dice';
  const account=node('section','workspace-section');account.id='workspace-account';
  const tools = node('div', 'workspace-tools');
  const rollTab = button('Roll dice', () => diceView('rolls'));
  const libraryTab = button('Saved rolls & starter kits', e => library(e.currentTarget));
  const gallery = button('Explore my dice', e => actions.gallery(e.currentTarget)); gallery.id = 'workspace-gallery';
  tools.append(rollTab, libraryTab, gallery);
  const slot = node('div', 'workspace-dice-slot'); slot.id = 'workspace-dice-slot';
  dice.append(tools, slot); content.append(tables, dice, people, account);
  $('left-panel').insertBefore(nav, $('rail-foot'));
  document.body.append(root);

  // Phone tools use the same request guards as the workbench. Its draft Roll
  // forwards to the original button, including all privacy/offer validation.
  const tray = node('section', 'phone-roll-tray'); tray.id = 'phone-roll-tray'; tray.setAttribute('aria-label', 'Roll tray');
  const trayHead = node('div', 'phone-tray-head');
  const trayTitle=node('span','phone-tray-title','Quick dice');trayHead.append(trayTitle);
  const build = button('Build a roll', e => { open('dice', e.currentTarget); actions.build(); }, 'btn ghost');
  build.id = 'phone-build-roll'; trayHead.append(build);
  const draftRoll = button('Roll draft', () => { if (!$('tray-roll').disabled) $('tray-roll').click(); });
  draftRoll.id = 'phone-draft-roll';
  const saved=node('div','phone-saved-rolls');saved.id='phone-saved-rolls';
  const savedList=node('div','phone-pool-list');saved.append(savedList,draftRoll);
  const quick = node('div', ''); quick.id = 'phone-quick-dice';
  renderQuickRolls(quick, { roll: actions.quickRoll, build: e => open('dice', e.currentTarget) }); tray.append(trayHead, saved, quick);
  document.body.append(tray);
  // The saved list and empty-draft states change the usable table height
  // without a window resize. Keep the renderer fitted to that real rectangle.
  new ResizeObserver(()=>actions.layoutChanged()).observe(tray);

  let current = null, opener = null, borrowed = [], viewEpoch = 0;
  // One launcher follows the visible roll controls, including the borrowed
  // builder. Moving the node preserves its handlers and gallery return target.
  function positionDiceControl() {
    const launcher = $('my-dice');
    const atBuilder = current === 'dice';
    const host = window.innerWidth > 640 && !atBuilder && $('left-panel').classList.contains('collapsed') ? $('rail-roll-wrap') : $('draft-actions');
    if (launcher.parentElement === host) return;
    const focused = launcher === document.activeElement;
    host.insertBefore(launcher, host === $('draft-actions') ? $('offer-draft') : null);
    if (focused) launcher.focus({preventScroll:true});
  }
  const borrow = (el, host) => {
    const place = document.createComment('workspace return point'); el.before(place);
    borrowed.push({el, place, hidden: el.classList.contains('hidden')}); host.append(el); el.classList.remove('hidden');
  };
  const restore = () => {
    for (const {el, place, hidden} of borrowed) { place.replaceWith(el); el.classList.toggle('hidden', hidden); }
    borrowed = [];
  };
  function diceView() {
    slot.hidden = false;
    rollTab.setAttribute('aria-pressed', 'true');
  }
  function library(anchor) {
    // Saved rolls has its own generous browsing task. Restore the live draft
    // before entering it, and keep the task's existing focus/escape behavior.
    const returnTo = anchor || (current ? opener : document.activeElement);
    close(); actions.openLibrary(returnTo);
  }
  // Arrival repaints keep the control the keyboard user is operating. Stable
  // action/player keys survive a new result or roster update; draft controls
  // are the original borrowed nodes and never participate in these repaints.
  let tablesSignature='', peopleSignature='';
  const focusKey=host=>host.contains(document.activeElement)?document.activeElement.dataset.focusKey:null;
  const restoreFocus=(host,key)=>{if(key)host.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});};
  const keyed=(b,key)=>{b.dataset.focusKey=key;return b;};
  function renderTables() {
    const s = actions.snapshot(), signature=JSON.stringify([s.table,s.recent]);
    if(signature===tablesSignature)return; tablesSignature=signature;
    const focused=focusKey(tables); tableOverview.replaceChildren();tableRecents.replaceChildren();
    const active = node('article', 'workspace-active');
    active.append(node('span', 'workspace-eyebrow', 'Your active table'), node('h3', '', s.table.name), node('p', 'hint', s.table.connection));
    const row = node('div', 'workspace-actions');
    row.append(keyed(button('Return to table', close),'return'), keyed(button('Table setup', e => actions.setup(e.currentTarget)),'setup'));
    active.append(row); tableOverview.append(active);
    const h = node('div', 'workspace-list-head'); h.append(node('h3', '', 'Recent tables'), keyed(button('＋ New table', e => actions.create(e.currentTarget)),'create'));
    tableRecents.append(h);
    const recent = s.recent.filter(t => t.room !== s.table.room);
    if (!recent.length) tableRecents.append(node('p', 'hint', 'Tables you visit in this browser will appear here.'));
    for (const t of recent) {
      const row = node('div', 'workspace-row');
      row.append(node('span', 'workspace-row-name', t.name || t.room), keyed(button('Go to table', () => actions.go(t.room)),`go:${t.room}`), keyed(button('Forget', () => { actions.forget(t.room); renderTables(); }, 'btn ghost'),`forget:${t.room}`));
      tableRecents.append(row);
    }
    restoreFocus(tables,focused);
  }
  function renderPeople() {
    const s = actions.snapshot(), signature=JSON.stringify([s.table,s.people]);
    if(signature===peopleSignature)return; peopleSignature=signature;
    const focused=focusKey(people); peopleOverview.replaceChildren();
    const h = node('div', 'workspace-list-head'); h.append(node('h3', '', `At ${s.table.name}`));
    if (s.table.invitable) h.append(keyed(button('Invite to table', e => actions.invite(e.currentTarget)),'invite'));
    peopleOverview.append(h);
    peopleOverview.append(keyed(button('You · account & private library',()=>open('account'),'btn ghost'),'account'));
    for (const p of s.people) {
      const row = node('article', 'workspace-person'); row.dataset.player = p.id;
      const dot = node('span', 'workspace-person-dot'); dot.style.background = p.color || '#888';
      const detail = node('div', 'workspace-person-detail');
      detail.append(node('h4', '', `${p.name}${p.mine ? ' · you' : ''}`), node('p', 'hint', p.mine ? 'Your seat' : 'Here now'));
      row.append(dot, detail);
      if (p.latest) row.append(keyed(button(p.latest.text, () => { close(); actions.result(p.latest.id); }, 'btn workspace-latest'),`result:${p.id}`));
      const browse = button(p.mine ? 'My rolls' : 'Shared rolls', () => {
        if (actions.browse(p.mine ? null : p.id) !== false) { open('dice', null, true); diceView('rolls'); }
      }, 'btn ghost');
      browse.disabled = p.blocked; keyed(browse,`browse:${p.id}`); row.append(browse); peopleOverview.append(row);
    }
    if (!s.people.length) peopleOverview.append(node('p', 'hint', 'You’re playing solo. Start a table to invite people.'));
    restoreFocus(people,focused);
  }
  function open(key, anchor, browsing = false) {
    if (!names[key]) return;
    closeMore();
    status.hidden=true;status.textContent='';
    if (!current) {
      actions.beforeOpen(); opener = anchor || document.activeElement;
      borrow($('builder-panel'), slot);
      root.classList.remove('hidden'); actions.modalOpen(root);
    }
    if(current==='account'&&key!=='account')actions.accountClosed?.();
    if(current==='tables'&&key!=='tables')actions.homesClosed?.();
    if(current==='people'&&key!=='people')actions.peopleClosed?.();
    viewEpoch++; current = key; root.dataset.workspace = key; title.textContent = names[key];
    if (key === 'dice' && !browsing) actions.home();
    for (const [k, section] of Object.entries({ tables, dice, people, account })) section.hidden = k !== key;
    for (const b of [...nav.children, ...tabs.children]) b.setAttribute('aria-pressed', String(b.dataset.workspace === key));
    if (key === 'tables') {renderTables();actions.homes?.(homeSlot);}
    if (key === 'people') {renderPeople();actions.people?.(peopleSlot);}
    if(key==='account')actions.account(account);
    if (key === 'dice') diceView();
    positionDiceControl();
    document.body.classList.add('workspace-open'); document.body.dataset.workspace = key; actions.layoutChanged();
    back.focus({preventScroll:true});
  }
  function close() {
    closeMore();
    if (!current) return;
    actions.closeMenus();
    if(current==='account')actions.accountClosed?.();
    if(current==='tables')actions.homesClosed?.();
    if(current==='people')actions.peopleClosed?.();
    current = null; actions.modalClose(root); root.classList.add('hidden'); restore();
    positionDiceControl();
    document.body.classList.remove('workspace-open'); delete document.body.dataset.workspace; actions.layoutChanged();
    for (const b of [...nav.children, ...tabs.children]) b.setAttribute('aria-pressed', 'false');
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); }
    // Table shortcuts must not stage a second roll under a workspace. Keep
    // Tab available to the app's shared modal trap, and input-local keys local.
    if (e.key !== 'Tab') e.stopPropagation();
  });
  let poolSignature='';
  const update = () => {
    const source = $('tray-roll'); draftRoll.disabled = source.disabled;
    draftRoll.hidden = source.classList.contains('hidden');
    draftRoll.textContent = source.disabled ? 'Roll draft' : `Roll staged dice · ${actions.draft()}`;
    if(window.innerWidth<=640){
      const pools=actions.pools(), signature=JSON.stringify(pools);
      if(signature!==poolSignature){
        poolSignature=signature;savedList.replaceChildren();
        for(const p of pools){
          const b=button('',()=>actions.rollPool(p.id),'phone-pool');b.dataset.pool=p.id;
          b.setAttribute('aria-label',`Roll ${p.name||p.notation} · ${p.notation}`);
          const name=node('span','phone-pool-name',p.name||p.notation),notation=node('span','phone-pool-notation',p.name?p.notation:'');
          const cue=node('span','phone-pool-cue','Roll');cue.setAttribute('aria-hidden','true');b.append(name,notation,cue);savedList.append(b);
        }
      }
      const hasSaved=pools.length>0||!draftRoll.hidden;
      saved.hidden=!hasSaved;quick.hidden=hasSaved;
      trayTitle.textContent=pools.length?'Saved rolls':hasSaved?'Staged roll':'Quick dice';
    }
    if (current === 'people') renderPeople();
    if (current === 'tables') renderTables();
  };
  const observer = new MutationObserver(update);
  for (const el of [$('rail-roster'), $('table-name'), $('log-list'),$('groups-list')]) observer.observe(el, {childList:true, subtree:true, characterData:true});
  observer.observe($('tray-roll'), {attributes:true, attributeFilter:['disabled','class']});
  update();
  positionDiceControl();
  positionPhoneTools();
  window.matchMedia('(max-width:640px)').addEventListener('change', () => {
    positionDiceControl();
    positionPhoneTools();
    update();
    if (current) actions.modalOpen(root);
    actions.layoutChanged();
  });
  return { open, close, get current() { return current; }, get viewEpoch() { return viewEpoch; }, library, positionDiceControl,
    notice(message){if(current){status.textContent=message||'';status.hidden=!message;}} };
}
