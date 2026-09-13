/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// A standing read, not an inbox: one stable result seat per present player.
// The adapter supplies only locally revealed/redacted display data. No roll
// payload, random seed, or future value is read by this presentation module.
export function createPlayerResults(actions) {
  const el = (tag, cls, text) => {
    const node=document.createElement(tag); if(cls) node.className=cls;
    if(text!==undefined) node.textContent=text; return node;
  };
  const root=el('section','table-results'); root.id='table-results';
  root.setAttribute('aria-label','Latest rolls at the table'); document.body.append(root);
  const seats=new Map();
  let lastRows=[], detailId=null, detailOpener=null, turnId=null;
  const turn=el("section","table-turn-bar"); turn.id="table-turn-bar"; turn.hidden=true;
  turn.setAttribute("aria-label","Your unfinished turn");
  const turnRead=el("button","btn ghost"); turnRead.id="table-turn-read"; turnRead.type="button";
  const turnState=el("span","table-turn-state");
  const again=el("button","btn","Throw again"); again.id="table-turn-again"; again.type="button";
  const bank=el("button","btn ghost","Bank"); bank.id="table-turn-bank"; bank.type="button";
  turnRead.addEventListener("click",()=>open(turnId,turnRead));
  again.addEventListener("click",()=>actions.throwAgain(turnId));
  bank.addEventListener("click",()=>actions.bank(turnId));
  turn.append(turnRead,turnState,again,bank); document.body.append(turn);
  const detail=el('section','player-result-detail hidden'); detail.id='player-result-detail';
  detail.setAttribute('aria-labelledby','player-result-title');
  const back=el('button','btn ghost','← Back to table'); back.type='button'; back.id='player-result-close';
  const title=el('h2','',''); title.id='player-result-title';
  const read=el('div','player-result-read'); read.id='player-result-read';
  const controls=el('div','player-result-actions'); controls.id='player-result-actions';
  detail.append(back,title,read,controls); document.body.append(detail);
  back.addEventListener('click',close);
  detail.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close();}
    if(event.key!=='Tab') event.stopPropagation();
  });

  function createSeat(row) {
    const button=el('button','result-seat'); button.type='button'; button.dataset.player=row.id;
    const crest=el('span','result-seat-crest'); crest.setAttribute('aria-hidden','true');
    const name=el('span','result-seat-name');
    const value=el('span','result-seat-value');
    const faces=el('span','result-seat-faces');
    const state=el('span','result-seat-state');
    button.append(crest,name,value,faces,state);
    const seat={button,crest,name,value,faces,state,row:null,signature:null};
    button.addEventListener('click',()=>{if(seat.row?.result?.id&&!seat.row.rolling) open(seat.row.result.id,button);});
    return seat;
  }
  function paint(seat,row) {
    const signature=JSON.stringify(row); seat.row=row;
    if(signature===seat.signature) return;
    seat.signature=signature;
    seat.button.style.setProperty('--seat-color',row.color||'#9c8f77');
    seat.crest.textContent=row.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
    seat.name.textContent=row.name; seat.name.title=row.name;
    seat.button.classList.toggle('is-mine',row.mine);
    seat.button.classList.toggle('is-rolling',row.rolling);
    seat.button.dataset.rollId=row.result?.id||'';
    const result=row.rolling ? null : row.result;
    seat.value.textContent=row.rolling?'Rolling…':result?.headline||'—';
    seat.value.classList.toggle('is-word',row.rolling||!!result?.worded);
    seat.faces.replaceChildren();
    if(result&&!result.hidden) {
      for(const face of result.faces.slice(0,6)) {
        const chip=el('span','result-face');
        chip.classList.toggle('is-discarded',!face.counts); chip.classList.toggle('is-scored',face.scored); chip.classList.toggle('is-blank',face.symbol==='blank');
        chip.dataset.face=face.symbol||face.label;
        chip.setAttribute('aria-label',`${face.type} ${face.symbol||face.label}${face.counts?' counted':' not counted'}${face.scored?' scores':''}`);
        if(face.symbol) chip.append(actions.symbol(face.symbol)); else chip.textContent=face.label;
        seat.faces.append(chip);
      }
      if(result.faces.length>6) seat.faces.append(el('span','result-face-more',`+${result.faces.length-6}`));
      if(result.modifier) seat.faces.append(el('span','result-modifier',`${result.modifier>0?'+':''}${result.modifier}`));
    }
    seat.state.textContent=row.rolling?'':result?.state||'Ready to roll';
    seat.button.setAttribute('aria-label',`${row.name}${row.mine?', you':''}: ${row.rolling?'Rolling':result?.spoken||'Ready to roll'}${result&&!row.rolling?'. Open complete result':''}`);
    seat.button.setAttribute('aria-disabled',String(!result));
  }
  function refresh() {
    const rows=actions.rows(); lastRows=rows;
    const live=new Set(rows.map(r=>r.id));
    for(const [id,seat] of seats) if(!live.has(id)) {
      if(document.activeElement===seat.button) document.getElementById('workspace-nav')?.querySelector('[data-workspace="people"]')?.focus();
      seat.button.remove(); seats.delete(id);
    }
    rows.forEach((row,index)=>{
      let seat=seats.get(row.id);
      if(!seat){seat=createSeat(row);seats.set(row.id,seat);}
      if(root.children[index]!==seat.button) root.insertBefore(seat.button,root.children[index]||null);
      paint(seat,row);
    });
    root.hidden=!rows.length;
    // The detailed reader stays pinned to its chosen roll while fresh results
    // arrive elsewhere. Shared renderers update revealed values and turn acts.
    if(detailId) actions.renderDetail(read,controls,detailId);
    // Preserve the chosen turn through its playback, when its log payload
    // already holds the next throw but that throw has not landed locally.
    const next=actions.turn(turnId); turnId=next?.id||null;
    turn.hidden=!next; document.body.classList.toggle("has-table-turn",!!next);
    if(next) {
      turnRead.textContent=next.label; turnState.textContent=next.state;
      actions.paintTurn(again,bank,turnId,next.busy);
    }
    const latest=actions.currentResult();
    const represented=!!latest&&rows.some(r=>!r.rolling&&r.result?.id===latest.id);
    document.body.classList.toggle('has-table-result',represented&&!latest.ceremony);
  }
  function open(id,anchor) {
    const row=lastRows.find(r=>r.result?.id===id&&!r.rolling) || actions.owner(id); if(!row) return false;
    actions.beforeDetail(); detailId=id; detailOpener=anchor||seats.get(row.id)?.button;
    title.textContent=`${row.name}’s roll`;
    actions.renderDetail(read,controls,id); detail.classList.remove('hidden');
    actions.openDetail(detail); back.focus({preventScroll:true}); return true;
  }
  function close() {
    if(!detailId) return;
    detailId=null; detail.classList.add('hidden'); actions.closeDetail(detail);
    detailOpener?.focus({preventScroll:true});
  }
  const resize=new ResizeObserver(()=>{
    document.documentElement.style.setProperty('--table-results-height',`${Math.ceil(root.getBoundingClientRect().height)}px`);
    document.documentElement.style.setProperty('--table-turn-height',`${Math.ceil(turn.getBoundingClientRect().height)}px`);
    actions.layoutChanged();
  }); resize.observe(root); resize.observe(turn);
  const observer=new MutationObserver(refresh);
  for(const id of ['rail-roster','log-list','result-banner','result-push']) {
    const node=document.getElementById(id); if(node) observer.observe(node,{subtree:true,childList:true,characterData:true,...(id==='result-banner'?{attributes:true,attributeFilter:['class']}:{})});
  }
  window.matchMedia('(max-width:640px)').addEventListener('change',()=>{if(detailId) actions.openDetail(detail);});
  refresh();
  return {refresh,open,close,get detailId(){return detailId;},get rows(){return lastRows;}};
}
