/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {createHomeSession} from './home-session.js';
import {homeCover} from './home-covers.js';

export function createHomesWorkspace(actions){
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,id,fn)=>{const b=el('button','btn',text);b.type='button';if(id)b.id=id;b.addEventListener('click',fn);return b;};
  const root=el('section','homes-workspace');root.id='homes-workspace';
  const head=el('div','workspace-list-head'),title=el('h3','','Saved table homes');
  const refresh=button('Refresh','homes-refresh',()=>run(()=>session.load()));head.append(title,refresh);
  const status=el('p','hint');status.id='homes-status';status.setAttribute('role','status');
  const account=button('Open account to save table homes','homes-account',actions.account);
  const choices=el('div','home-actions');
  const capture=button('Save this table as a home','homes-capture',()=>run(()=>captureCurrent()));
  const fresh=button('New saved home','homes-new',()=>{newForm.hidden=false;newName.focus();});choices.append(capture,fresh);
  const newForm=el('form','home-new-form');newForm.id='homes-new-form';newForm.hidden=true;
  const newLabel=el('label','','Home name'),newName=el('input');newName.id='homes-new-name';newName.maxLength=28;newLabel.append(newName);
  const newSubmit=el('button','btn','Preview new home');newSubmit.type='submit';newForm.append(newLabel,newSubmit);
  newForm.addEventListener('submit',event=>{event.preventDefault();run(async()=>{const r=session.newHome(newName.value);if(r.ok)newForm.hidden=true;return r;});});
  const cards=el('div','home-cards');cards.id='homes-cards';
  const detail=el('section','home-detail');detail.id='home-detail';detail.hidden=true;
  const back=button('← All saved homes','home-detail-back',()=>{session.closeView();});
  const detailTitle=el('h3');detailTitle.id='home-detail-title';
  const detailNote=el('p','hint','Saving changes the setup for future returns. People already playing keep the live table they have.');
  const columns=el('div','home-comparison');
  const current=el('article','home-version'),candidate=el('article','home-version');current.id='home-current';candidate.id='home-candidate';columns.append(current,candidate);
  const detailActions=el('div','home-actions');
  const save=button('Save home','home-save',()=>run(async()=>{const r=await session.save();if(r.ok&&!r.viewChanged){message='Saved home confirmed. Join when you are ready.';if(r.home)await session.manage(r.home.id);}return r;}));
  const recapture=button('Capture current setup','home-recapture',()=>run(()=>session.capture(session.info.selected?.home.id||null)));
  const exportPreview=button('Download this preview','home-export-preview',()=>download(session.exportPreview(),'table-home-preview.json'));
  const join=button('Join now','home-join',()=>{const h=session.info.selected?.home;if(h)actions.join(h.roomKey);});detailActions.append(save,recapture,exportPreview,join);
  const versionLabel=el('label','','Compare a retained version'),versions=el('select');versions.id='home-versions';versionLabel.append(versions);
  versions.addEventListener('change',()=>{if(versions.value)run(()=>session.version(versions.value));});
  const leaveBox=el('div','home-leave');const leaveLabel=el('label','home-check'),leaveAck=el('input');leaveAck.type='checkbox';leaveAck.id='home-leave-ack';leaveLabel.append(leaveAck,document.createTextNode('Remove this home from my account. Keep my current live seat.'));
  const leave=button('Leave saved-home membership','home-leave',()=>run(async()=>{if(!leaveAck.checked)return {ok:false,message:'Confirm which membership you want to leave.'};const r=await session.leave();if(r.ok)message='Membership removed. Your current table and seat are unchanged.';return r;}));leave.disabled=true;leaveAck.addEventListener('change',()=>{leave.disabled=busy||!leaveAck.checked;});leaveBox.append(leaveLabel,leave);
  detail.append(back,detailTitle,detailNote,columns,detailActions,versionLabel,leaveBox);
  const kept=el('section','home-kept');kept.id='home-kept';
  root.append(head,status,account,choices,newForm,cards,detail,kept);
  let busy=false,message='',cardsSignature='',detailSignature='',keptSignature='',identity=null;
  const session=createHomeSession({...actions,changed:paint});
  function download(value,name){if(value)actions.download(JSON.stringify(value,null,2),name);}
  async function run(fn){if(busy)return;busy=true;paint();try{const r=await fn();if(r&&!r.ok)message=r.message||'The request could not finish. Kept previews and retries remain on this device.';return r;}catch{message='The request could not finish. Keep or download the current preview.';return {ok:false};}finally{busy=false;paint();}}
  async function captureCurrent(){const here=actions.seat();const existing=session.info.cards.find(h=>h.roomKey===here?.room);return session.capture(existing?.id||null);}
  function cover(host,cover,name){const appearance=actions.appearance(cover);const box=el('div','home-cover');box.dataset.cover=cover?.venue||'table';box.style.setProperty('--home-color',appearance.color||'#343330');
    box.append(el('span','home-cover-mark',(name||'T').trim().slice(0,1).toUpperCase()),el('span','home-cover-label',appearance.label));host.append(box);
    homeCover(cover).then(url=>{if(!url||!box.isConnected)return;const image=el('img');image.src=url;image.alt='';image.loading='lazy';box.prepend(image);box.classList.add('has-image');});
  }
  function summary(host,caption,document){host.replaceChildren(el('h4','',caption));
    if(!document){host.append(el('p','hint','A new named home with the default table and no prepared profiles. Customize it after choosing Join now.'));return;}
    const settings=document.settings,profiles=document.setup?.profiles||[];cover(host,{venue:settings.venue,felt:settings.felt},settings.tableName);
    host.append(el('h4','',settings.tableName||'Unnamed table'),el('p','hint',`${actions.systemName(settings.system)} · ${profiles.length} prepared profiles · ${profiles.reduce((n,p)=>n+p.pools.length,0)} saved rolls`));
    if(profiles.length){const list=el('ul');for(const p of profiles){const row=el('li','',`${p.name} · ${p.pools.length} rolls`);if(p.pools.length)row.append(el('p','hint',p.pools.slice(0,3).map(p=>p.name||p.notation).join(' · ')));list.append(row);}host.append(list);}
  }
  function paint(info=session.info){
    if(identity!==info.owner){identity=info.owner;message='';newForm.hidden=true;newName.value='';leaveAck.checked=false;cardsSignature=detailSignature=keptSignature='';}
    const signed=!!info.owner;account.hidden=signed;choices.hidden=!signed;refresh.hidden=!signed;
    const showing=!!(info.selected||info.preview);detail.hidden=!showing;cards.hidden=showing;choices.hidden=choices.hidden||showing;head.hidden=showing;actions.layout?.(showing);
    status.textContent=info.error?.message||message||(showing?'':info.loading?'Loading saved tables…':signed?'Saved homes are private to your account. Anyone with a table link can join its live game.':'Play as a guest, or use an optional account to keep named table homes across devices.');
    status.hidden=!status.textContent;
    capture.textContent=info.cards.some(h=>h.roomKey===actions.seat()?.room)?'Capture changes to this home':'Save this table as a home';
    for(const b of [refresh,capture,fresh,newSubmit,save,recapture,exportPreview,join,versions])b.disabled=busy||info.loading;
    capture.disabled=capture.disabled||!actions.seat();recapture.disabled=recapture.disabled||!actions.seat()||!!(info.selected&&info.selected.home.roomKey!==actions.seat()?.room);recapture.title=recapture.disabled?'Join this home to capture its live setup':'';leave.disabled=busy||info.loading||!leaveAck.checked;
    const cs=JSON.stringify(info.cards);if(cs!==cardsSignature){const focused=document.activeElement?.dataset.homeFocus;cardsSignature=cs;cards.replaceChildren();
      if(!info.cards.length&&signed)cards.append(el('p','hint','No saved homes yet. Save this named table, or make a new one.'));
      for(const h of info.cards){const card=el('article','home-card');card.dataset.homeId=h.id;cover(card,h.cover,h.name);card.append(el('h4','',h.name),el('p','hint',`${h.memberCount} ${h.memberCount===1?'member':'members'} · saved ${new Date(h.updatedAt).toLocaleDateString()}`));
        const controls=el('div','home-actions'),manage=button('Manage',null,()=>run(()=>session.manage(h.id))),go=button('Join now',null,()=>actions.join(h.roomKey));manage.dataset.homeFocus='manage:'+h.id;go.dataset.homeFocus='join:'+h.id;controls.append(manage,go);card.append(controls);cards.append(card);}
      if(focused)cards.querySelector(`[data-home-focus="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
    }
    const ds=JSON.stringify([info.selected,info.preview]);if(ds!==detailSignature){detailSignature=ds;leaveAck.checked=false;
      const selected=info.selected,p=info.preview;detailTitle.textContent=p?.kind==='new'?p.input.name:selected?.home.name||'Save the current table';
      current.hidden=!selected;candidate.hidden=!p;if(selected)summary(current,'Saved for future returns',selected.document);else current.replaceChildren();
      if(p)summary(candidate,p.kind==='reconcile'?'Chosen retained version':'Preview to save',p.document);else candidate.replaceChildren();
      save.hidden=!p;save.textContent=p?.kind==='reconcile'?'Use this saved version':p?.kind==='new'?'Create saved home':'Save captured setup';
      exportPreview.hidden=!p;join.hidden=!selected;versionLabel.hidden=!selected;leaveBox.hidden=!selected;recapture.hidden=(!selected&&!p)||p?.kind==='new';
      versions.replaceChildren();const placeholder=el('option','','Choose a version to compare');placeholder.value='';versions.append(placeholder);
      for(const v of selected?.versions||[]){const o=el('option','',`${v.id===selected.home.headRevision?'Current saved version':v.kind==='conflict'?'Kept conflict':'Earlier saved version'} · ${new Date(v.createdAt).toLocaleString()}`);o.value=v.id;versions.append(o);}if(p?.kind==='reconcile')versions.value=p.input.sourceVersionId;
    }
    const ks=JSON.stringify(info.records);if(ks!==keptSignature){keptSignature=ks;kept.replaceChildren();
      if(info.records.length){const disclosure=el('details');disclosure.open=info.records.some(r=>r.status!=='saved');disclosure.append(el('summary','',`Kept actions on this device (${info.records.length})`),el('p','hint','Failed or uncertain saves keep their exact retry and public preview. These records are separate from the live table.'));kept.append(disclosure);
        for(const record of info.records){const row=el('div','home-kept-row');row.dataset.operation=record.id;const title=record.document?.settings?.tableName||record.input.name||'Saved home';row.append(el('span','',`${title} · ${record.status==='saved'?'confirmed':record.status==='conflict'?'conflict kept':record.status==='pending'?'confirmation needed':'not saved'}`));
          row.append(button('Download',null,()=>download(session.exportAction(record.id),'table-home-kept-action.json')));
          if(record.status!=='saved')row.append(button('Retry exact request',null,()=>run(()=>session.retry(record.id))));
          if(record.homeId)row.append(button('Review saved versions',null,()=>run(()=>session.manage(record.homeId))));disclosure.append(row);}
        if(info.records.some(r=>r.status==='saved')){const label=el('label','home-check'),ack=el('input');ack.type='checkbox';label.append(ack,document.createTextNode('Remove confirmed device retry records. Saved homes and their server versions stay available.'));
          const clear=button('Remove confirmed device records','home-clear-confirmed',()=>{if(ack.checked)run(()=>session.forgetConfirmed());});clear.disabled=true;ack.addEventListener('change',()=>{clear.disabled=!ack.checked;});disclosure.append(label,clear);}
      }
    }
  }
  return {session,mount(host){host.append(root);session.identity();paint();return run(()=>session.load());},identityChanged(){session.identity();paint();},close(){actions.layout?.(false);},get info(){return session.info;}};
}
