/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {createLibrarySession} from './library-session.js';
import {generateRecoveryKey} from './account.js';

export function createAccountWorkspace(actions){
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,id,fn)=>{const b=el('button','btn',text);b.type='button';if(id)b.id=id;b.addEventListener('click',fn);return b;};
  const root=el('div','account-content');root.id='account-content';
  const headline=el('h3','','Your library, wherever you play');
  const intro=el('p','hint','Keep playing as a guest. An optional account can recover your identity and privately sync the library you choose.');
  const status=el('p','account-status');status.id='account-sync-status';status.setAttribute('role','status');
  const notice=el('p','account-notice');notice.id='account-notice';notice.setAttribute('role','status');
  const identity=el('p','account-identity');identity.id='account-identity';
  const accountActions=el('div','account-actions');
  const create=button('Create recoverable account','account-create',()=>openCreate());
  const recover=button('Use a recovery key','account-recover',()=>openRecover());
  const refresh=button('Refresh account','account-refresh',()=>run(()=>refreshAccount()));
  const logout=button('Sign out · use guest library','account-logout',()=>run(async()=>{const r=await session.logout();clearSecrets();mode='home';paintMode();return r;}));
  const deviceCopy=button('Open last library saved on this device','account-device-copy',()=>run(()=>session.openDeviceCopy(actions.deviceNamespace)));
  deviceCopy.hidden=true;accountActions.append(create,recover,refresh,logout,deviceCopy);
  const form=el('form','account-form');form.id='account-form';form.hidden=true;
  const formTitle=el('h4');
  const nameLabel=el('label','','Private account name');const name=el('input');name.id='account-name';name.maxLength=23;name.autocomplete='nickname';nameLabel.append(name);
  const keyLabel=el('label','','Recovery key');const key=el('textarea');key.id='account-key';key.rows=3;key.autocomplete='off';key.spellcheck=false;keyLabel.append(key);
  const copyKey=button('Copy my recovery key','account-copy-key',async()=>{try{await navigator.clipboard.writeText(key.value);notice.textContent='Recovery key copied. Keep it somewhere you can find on another device.';}catch{key.focus();key.select();notice.textContent='Select and copy your recovery key.';}});
  const acknowledgment=el('label','account-check');const ack=el('input');ack.type='checkbox';ack.id='account-key-kept';acknowledgment.append(ack,document.createTextNode('I have kept this recovery key somewhere safe.'));
  const keyHelp=el('p','hint','This key opens your account. It is shown here for you to copy; the app will not put it in a room link or saved library.');
  const submit=el('button','btn','Create account');submit.id='account-submit';submit.type='submit';
  const cancel=button('Cancel','account-cancel',()=>{clearSecrets();mode='home';paintMode();});
  form.append(formTitle,nameLabel,keyLabel,copyKey,keyHelp,acknowledgment,submit,cancel);
  ack.addEventListener('change',()=>{submit.disabled=mode==='create'&&!ack.checked;});
  form.addEventListener('submit',event=>{event.preventDefault();const value=key.value.trim();run(async()=>{
    const r=mode==='create'?await session.register({displayName:name.value.trim(),recoveryKey:value,recoveryAcknowledged:ack.checked}):await session.recover(value);
    if(r.ok){clearSecrets();mode='home';paintMode();notice.textContent='Account opened. Compare libraries before enabling private sync.';}
    return r;
  });});
  const libraryActions=el('div','account-actions');
  const compare=button('Compare & enable private sync','account-compare',()=>run(preview));
  const retry=button('Save / retry sync','account-sync-retry',()=>run(()=>session.flush()));
  const edit=button('Edit my saved rolls','account-edit',actions.openLibrary);
  libraryActions.append(compare,retry,edit);
  const comparePanel=el('section','account-comparison');comparePanel.id='account-comparison';comparePanel.hidden=true;
  const comparisonTitle=el('h4','','Choose the library you want to use');
  const localPick=el('select');localPick.id='account-local-version';localPick.setAttribute('aria-label','Device version to compare');
  const columns=el('div','account-columns');
  const local=el('article','account-version'),remote=el('article','account-version');local.id='account-local-preview';remote.id='account-remote-preview';columns.append(local,remote);
  const choices=el('fieldset','account-choices');choices.append(el('legend','','Use after this comparison'));
  for(const [value,label] of [['local','This device’s version'],['remote','The account version'],['merge','Merge both libraries']]){
    const labelEl=el('label','account-check');const radio=el('input');radio.type='radio';radio.name='account-choice';radio.value=value;radio.id='account-choice-'+value;
    labelEl.append(radio,document.createTextNode(label));choices.append(labelEl);radio.addEventListener('change',paintDiceChoice);
  }
  const diceLabel=el('label','','Default dice after merging');const diceChoice=el('select');diceChoice.id='account-dice-choice';diceLabel.append(diceChoice);diceChoice.addEventListener('change',paintDiceChoice);
  const originals=el('p','hint','Compared originals stay available for export. Merging adds changed profiles with distinct names and combines favorites; it does not replace a kept original.');
  const apply=button('Enable private sync','account-enable-sync',()=>run(async()=>{
    if(previewOwner!==owner()||!previewState)return staleView();
    const selected=choices.querySelector('input:checked')?.value;
    const r=await session.choose(previewState.generation,{choice:selected,diceChoice:diceChoice.value||undefined,localEntryId:localPick.value||undefined});
    if(r.ok){comparePanel.hidden=true;notice.textContent=session.info.namespace==='guest'?'Chosen guest library opened on this device. Other originals remain available for export.':'Chosen library opened. Private sync is enabled; table sharing stays off until you choose it.';}
    return r;
  }));
  comparePanel.append(comparisonTitle,localPick,columns,choices,diceLabel,originals,apply);
  localPick.addEventListener('change',paintComparison);
  const historyActions=el('div','account-actions');
  const exportCurrent=button('Download current library','account-export-current',actions.portable);
  const exportAll=button('Download local originals','account-export-originals',()=>run(async()=>{const r=await session.exportOriginals();if(r.ok)actions.download(JSON.stringify(r.data,null,2),'private-library-originals.json');return r;}));
  const showHistory=button('Saved versions & cleanup','account-history',()=>run(history));
  historyActions.append(exportCurrent,exportAll,showHistory);
  const historyPanel=el('section','account-history');historyPanel.id='account-history-panel';historyPanel.hidden=true;
  const historyList=el('div');historyList.id='account-history-list';
  const archiveAckLabel=el('label','account-check');const archiveAck=el('input');archiveAck.type='checkbox';archiveAck.id='account-archive-ack';archiveAckLabel.append(archiveAck,document.createTextNode('Remove the selected older saved versions. I have exported anything I want to keep.'));
  const archive=button('Remove selected saved versions','account-archive',()=>run(async()=>{
    if(!archiveAck.checked)return {ok:false,message:'Acknowledge the selected history removal first.'};
    const ids=[...historyList.querySelectorAll('input:checked')].map(input=>input.value);
    if(historyOwner!==owner())return staleView();
    const r=await session.archive(historyGeneration,ids);if(r.ok){notice.textContent='Selected eligible older versions removed.';await history();}return r;
  }));archive.disabled=true;
  const archiveEnabled=()=>{archive.disabled=!archiveAck.checked||!historyList.querySelector('input:checked');};archiveAck.addEventListener('change',archiveEnabled);historyList.addEventListener('change',archiveEnabled);
  historyPanel.append(el('h4','','Saved originals & history'),historyList,archiveAckLabel,archive);
  root.append(headline,intro,identity,status,notice,accountActions,form,libraryActions,comparePanel,historyActions,historyPanel);
  let mode='home',available=null,busy=false,previewState=null,previewOwner=null,historyGeneration=null,historyOwner=null,shownOwner=null;
  const session=createLibrarySession({...actions,changed:info=>{paint(info);actions.changed?.(info);}});
  function statusText(info=session.info){
    if(!info.ready)return 'Opening private library…';
    if(info.pending)return 'Saving on this device…';
    if(info.blocked)return info.error?.code==='device_copy'?'Saved on this device · account connection needed':'Account changed · private sync paused';
    if(info.error?.retained||info.state?.localConflictIds?.length)return 'Both tab versions kept · compare before syncing';
    if(info.error&&['cache_unavailable','cache_corrupt','cache_full','invalid_library'].includes(info.error.code))return 'Device save failed · export your changes';
    if(!info.syncEnabled)return info.namespace==='guest'?'Guest library · saved in this browser':'Saved on this device · private sync is off';
    if(info.error)return 'Saved on this device · sync needs retry';
    const last=info.state?.outbox?.at(-1);
    return last?.status==='saved'&&last.entryId===info.state.workingId?'Saved privately · up to date':'Saved on this device · waiting to sync';
  }
  const owner=()=>`${session.info.namespace}:${session.info.boundaryEpoch}`;
  const staleView=()=>({ok:false,code:'identity_changed',message:'The open library changed. Review its saved versions again.'});
  function invalidateViews(){previewState=null;previewOwner=null;comparePanel.hidden=true;local.replaceChildren();remote.replaceChildren();localPick.replaceChildren();historyPanel.hidden=true;historyList.replaceChildren();historyGeneration=null;historyOwner=null;archiveAck.checked=false;archive.disabled=true;notice.textContent='';clearSecrets();mode='home';paintMode();}
  function paint(info=session.info){
    const currentOwner=`${info.namespace}:${info.boundaryEpoch}`;if(shownOwner!==null&&shownOwner!==currentOwner)invalidateViews();shownOwner=currentOwner;
    status.textContent=statusText(info);
    deviceCopy.hidden=available!==false||!actions.deviceNamespace||actions.deviceNamespace==='guest'||info.namespace===actions.deviceNamespace;
    identity.textContent=info.person?`Private account: ${info.person.displayName||'Returning player'}. Your table name and seat stay the same.`:info.namespace==='guest'?'You are using the guest library on this browser.':'The last private library saved on this device is open. Account identity has not been confirmed online.';
    logout.hidden=info.namespace==='guest';create.hidden=!!info.person;recover.textContent=info.person?'Use another recovery key':'Use a recovery key';
    create.disabled=busy||info.transitioning||available!==true;recover.disabled=busy||info.transitioning||available!==true;
    compare.hidden=info.namespace==='guest'&&!info.state?.localConflictIds?.length;retry.hidden=info.namespace==='guest'||!info.syncEnabled;showHistory.hidden=info.namespace==='guest';
    compare.textContent=info.namespace==='guest'?'Review kept device versions':info.syncEnabled?'Compare saved versions':'Compare & enable private sync';
    for(const b of [refresh,logout,compare,retry,apply,exportAll,showHistory,deviceCopy])b.disabled=busy||info.transitioning;
    if(info.error?.message)notice.textContent=info.error.message;
    if(available===false&&!info.person&&info.namespace==='guest'&&!info.error)notice.textContent='Accounts are unavailable here. Your saved rolls and downloads still work.';
    submit.disabled=busy||info.transitioning||(mode==='create'&&!ack.checked);
    if(!comparePanel.hidden)paintDiceChoice();
  }
  function paintMode(){form.hidden=mode==='home';nameLabel.hidden=mode!=='create';copyKey.hidden=mode!=='create';acknowledgment.hidden=mode!=='create';key.readOnly=mode==='create';formTitle.textContent=mode==='create'?'Create your recovery key':'Open your account';submit.textContent=mode==='create'?'Create account':'Recover account';submit.disabled=mode==='create'&&!ack.checked;}
  function clearSecrets(){key.value='';ack.checked=false;}
  function openCreate(){clearSecrets();mode='create';name.value='';key.value=generateRecoveryKey();paintMode();name.focus();}
  function openRecover(){clearSecrets();mode='recover';paintMode();key.focus();}
  async function run(fn){if(busy)return;busy=true;paint();try{const r=await fn();if(r&&!r.ok&&r.message)notice.textContent=r.message;return r;}catch{notice.textContent='The request could not finish. Your current library remains available for export.';return {ok:false};}finally{busy=false;paint();}}
  async function initialize(){const r=await session.initialize();const service=await session.status();available=service.available===true;if(r.ok&&available)await session.refreshAccount();paint();return r;}
  async function refreshAccount(){const result=await session.refreshAccount();const service=await session.status();available=service.available===true;paint();return result;}
  function summarize(host,title,document){host.replaceChildren(el('h4','',title));if(!document){host.append(el('p','hint','No library has been saved to this account.'));return;}
    const profiles=document.profiles.profiles,pools=profiles.reduce((sum,p)=>sum+p.pools.length,0);
    host.append(el('p','',`${profiles.length} profiles · ${pools} saved rolls`),el('p','hint',`Default dice: ${actions.diceName(document.dice.defaultSet)} · ${document.dice.favorites.length} favorites`));
    const list=el('ul');for(const p of profiles){const li=el('li','',`${p.name} · ${p.pools.length} rolls`);if(p.pools.length)li.append(el('p','hint',p.pools.slice(0,3).map(pool=>pool.name||pool.notation).join(' · ')));list.append(li);}host.append(list);
  }
  function documents(){const localEntry=previewState?.entries.find(e=>e.id===(localPick.value||previewState.workingId));const remoteEntry=previewState?.entries.find(e=>e.id===previewState.remote?.entryId);return {local:localEntry?.document,remote:remoteEntry?.document||null};}
  function paintComparison(){const docs=documents();summarize(local,'On this device',docs.local);summarize(remote,'Saved privately to the account',docs.remote);
    diceChoice.replaceChildren();for(const [value,label] of [['','Choose default dice'],['local',`Device: ${actions.diceName(docs.local?.dice.defaultSet)}`],['remote',`Account: ${actions.diceName(docs.remote?.dice.defaultSet)}`]]){const option=el('option','',label);option.value=value;diceChoice.append(option);}paintDiceChoice();}
  function paintDiceChoice(){const docs=documents(),selected=choices.querySelector('input:checked')?.value;const need=selected==='merge'&&!!docs.remote&&docs.local?.dice.defaultSet!==docs.remote.dice.defaultSet;diceLabel.hidden=!need;apply.disabled=busy||!selected||(need&&!diceChoice.value);}
  async function preview(){const requestedOwner=owner(),r=await session.preview();if(requestedOwner!==owner())return staleView();if(!r.ok)return r;previewOwner=requestedOwner;previewState=r.state;localPick.replaceChildren();
    for(const id of [...new Set([r.state.workingId,...r.state.localConflictIds])]){const entry=r.state.entries.find(e=>e.id===id);const option=el('option','',`${id===r.state.workingId?'Saved device version':'Kept tab alternative'} · ${entry.document.profiles.profiles.map(p=>p.name).join(', ')||'Empty library'}`);option.value=id;localPick.append(option);}localPick.value=session.info.retainedId||r.state.workingId;
    comparePanel.hidden=false;const guest=session.info.namespace==='guest';remote.hidden=guest;choices.hidden=guest;const remoteExists=!!r.state.remote?.entryId;choices.querySelector('[value="remote"]').disabled=!remoteExists;choices.querySelector('[value="merge"]').disabled=!remoteExists;choices.querySelector(`[value="${remoteExists?'merge':'local'}"]`).checked=true;
    apply.textContent=guest?'Use this device version':r.state.syncEnabled?'Use chosen library':'Enable private sync';paintComparison();return r;}
  async function history(){const requestedOwner=owner(),p=await session.preview();if(requestedOwner!==owner())return staleView();if(!p.ok)return p;const r=await session.history();if(requestedOwner!==owner())return staleView();if(!r.ok)return r;historyOwner=requestedOwner;historyGeneration=session.info.state.generation;historyList.replaceChildren();
    historyList.append(el('p','hint',`${r.versions.length} retained versions · ${Math.ceil(r.historyBytes/1024)} KB. Current work, conflicts, and reconciliation originals are protected.`));
    for(const version of r.versions){const row=el('div','account-history-row');const label=el('label','account-check');const check=el('input');check.type='checkbox';check.value=version.id;check.disabled=!version.canArchive;label.append(check,document.createTextNode(`${version.kind==='conflict'?'Conflict original':version.kind==='retained-original'?'Compared original':'Saved version'} · ${new Date(version.createdAt).toLocaleString()}`));
      row.append(label,button('Download',null,()=>run(async()=>{const requestedOwner=owner(),original=await session.version(version.id);if(requestedOwner!==owner())return staleView();if(original.ok)actions.download(JSON.stringify(original.document,null,2),'private-library-version.json');return original;})));historyList.append(row);}
    archiveAck.checked=false;archiveEnabled();historyPanel.hidden=false;return r;}
  return {session,statusText,initialize,refreshAccount,mount(host){host.append(root);paint();},clearSecrets,
    close(){clearSecrets();mode='home';paintMode();},get state(){return {mode,available,comparison:!comparePanel.hidden,history:!historyPanel.hidden};}};
}
