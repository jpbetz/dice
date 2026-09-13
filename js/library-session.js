/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {createAccountClient} from './account.js';
import {openLibraryCache} from './library-cache.js';
import {createLibrarySync} from './library-sync.js';
import {canonicalLibraryValue,validateLibraryDocument} from './library-document.js';

// Owns one app mirror and one durable namespace. Network previews and IDB
// metadata never advance the generation of the document this tab is editing.
export function createLibrarySession(actions,{cacheFactory=openLibraryCache,accountFactory=createAccountClient}={}) {
  let cache=null,sync=null,namespace='guest',viewGeneration=null,snapshot=null,person=null;
  let queue=Promise.resolve(),pending=0,error=null,ready=false,blocked=!!actions.initiallyBlocked,transitioning=false;
  let retainedId=null,lastDocument=null,editFailure=false,transitionTicket=null,boundaryEpoch=0;
  const emit=()=>actions.changed?.(info());
  const info=()=>({ready,namespace,person,pending,blocked,transitioning,error,retainedId,boundaryEpoch,
    syncEnabled:!!snapshot?.state?.syncEnabled,state:snapshot?.state||null,
    document:lastDocument,workingGeneration:viewGeneration});
  function update(result,{adopt=false}={}) {
    if(result?.state)snapshot=result;
    if(adopt&&result?.ok){viewGeneration=result.workingGeneration;lastDocument=result.document;retainedId=null;}
    if(!result?.ok)error=result;else error=null;
    emit();return result;
  }
  async function ensureCache(){
    if(cache)return cache;
    const opened=await cacheFactory();if(!opened.ok){error=opened;emit();return null;}cache=opened;return cache;
  }
  function edit(document,{capture=false}={}){
    const checked=validateLibraryDocument(document);
    if(!checked.ok){error=checked;editFailure=true;emit();return false;}
    // Keep a concrete exportable candidate even if the browser later refuses
    // its IDB transaction. No account candidate is written to guest keys.
    lastDocument=checked.document;
    if(!ready){error={ok:false,code:'workspace_opening',message:'The private workspace is opening. Your current changes remain on screen.'};editFailure=true;emit();return false;}
    if(transitionTicket&&!capture)transitionTicket.dirty=true;
    const target=namespace,copy=checked.document;
    pending++;emit();
    queue=queue.then(async()=>{
      const result=await cache.edit(target,viewGeneration,copy);
      pending--;
      if(target!==namespace)return;
      if(result.state)snapshot=result;
      if(result.ok){viewGeneration=result.workingGeneration;error=null;editFailure=false;if(sync&&!blocked&&result.state.syncEnabled)sync.schedule();}
      else {error=result;editFailure=!result.retained;if(result.retained)retainedId=result.entryId;}
      emit();
      return result;
    }).catch(()=>{pending--;error={ok:false,code:'cache_unavailable',message:'This browser could not save your changes. Export the current library before leaving.'};editFailure=true;emit();});
    return true; // accepted for saving; only changed() reports durability
  }
  async function settled(){await queue;return !editFailure;}
  async function capture(){
    if(!ready)return false;
    const doc=actions.capture();if(!doc?.ok){error=doc;editFailure=true;emit();return false;}
    if(editFailure||canonicalLibraryValue(doc.document)!==canonicalLibraryValue(lastDocument))edit(doc.document,{capture:true});
    return settled();
  }
  function startTransition(){
    if(transitionTicket){transitionTicket.dirty=true;return null;}
    transitionTicket={dirty:false};boundaryEpoch++;transitioning=true;actions.blockSharing(true);emit();return transitionTicket;
  }
  function refuseTransition(ticket,result){
    if(transitionTicket===ticket)transitionTicket=null;
    transitioning=false;blocked=true;sync?.close();sync=null;
    error=result||{ok:false,code:'identity_transition_refused',message:'A new edit arrived while the library was changing. It is kept here. Review it before trying again.'};
    emit();return false;
  }
  function transitionUnchanged(ticket){
    const now=actions.capture();
    if(!now?.ok){error=now;return false;}
    if(canonicalLibraryValue(now.document)!==canonicalLibraryValue(lastDocument))edit(now.document);
    return ticket===transitionTicket&&!ticket.dirty&&!editFailure;
  }
  async function stableTransition(ticket){
    if(transitionUnchanged(ticket))return true;
    await settled();return false;
  }
  async function boundary(ticket){
    if(!await capture()||!await stableTransition(ticket))return false;
    const cleared=await actions.clearSharing();
    if(cleared===false){error={ok:false,code:'sharing_boundary',message:'Sharing could not be fully cleared. Your current library is still open; retry the sharing update before switching.'};return false;}
    return stableTransition(ticket);
  }
  async function adoptIdentity({personId,deviceOnly=false}) {
    const ticket=startTransition();
    if(!ticket)return refuseTransition(null);
    if(!await boundary(ticket))return refuseTransition(ticket,error?.ok===false?error:null);
    const next=personId||'guest';
    let result=await cache.read(next);
    if(!await stableTransition(ticket))return refuseTransition(ticket);
    if(result.code==='cache_missing'&&!deviceOnly)result=await cache.seed(next,lastDocument);
    if(!await stableTransition(ticket))return refuseTransition(ticket);
    if(!result.ok)return refuseTransition(ticket,result);
    // apply is a synchronous mirror swap: all required persistence and checks
    // finish first, with no await between swapping that mirror and its namespace.
    if(!transitionUnchanged(ticket))return refuseTransition(ticket);
    const sameNamespace=next===namespace;
    if(!sameNamespace&&actions.apply(result.document,next)===false)return refuseTransition(ticket,{ok:false,code:'adoption_refused',message:'The saved library could not be opened. Your previous library remains available for export.'});
    sync?.close();sync=null;namespace=next;blocked=false;transitioning=false;transitionTicket=null;editFailure=false;
    update(result,{adopt:!sameNamespace});
    if(personId&&!deviceOnly){const opened=createLibrarySync({account,cache,personId,onResult:result=>{if(namespace===personId&&sync===opened)receive(result,personId,opened);}});sync=opened;}
    actions.namespaceChanged?.(next);blocked=deviceOnly;
    if(deviceOnly)error={ok:false,code:'device_copy',message:'This device copy is open. Refresh your account when connected before syncing.'};
    actions.blockSharing(deviceOnly);emit();return true;
  }
  const account=accountFactory({onIdentityChange:adoptIdentity});
  async function receive(result,owner=namespace,opened=sync){
    let current=result?.state?result:null;
    if(!current&&cache)current=await cache.read(owner);
    if(namespace!==owner||sync!==opened)return {ok:false,code:'identity_changed'};
    if(current?.ok||current?.state)snapshot=current;
    if(!result?.ok){error=result;if(['identity_changed','person_mismatch','login_required'].includes(result?.code))suspend();}
    else error=null;
    emit();return result;
  }
  async function identityAction(action,{intent=false}={}){
    if(!ready)return {ok:false,code:'workspace_opening'};
    if(intent)actions.identityIntent?.();
    const result=await action();
    if(result.ok&&Object.hasOwn(result,'person')){
      if(blocked&&!await adoptIdentity({personId:result.person?.id||null}))return error;
      person=result.person;
    }
    else if(result.signedOutLocally&&namespace==='guest')person=null;
    if(!result.ok)error=result;else error=null;
    emit();return result;
  }
  async function initialize(){
    if(ready)return {ok:true};
    if(!await ensureCache())return error;
    const doc=actions.capture();if(!doc.ok)return update(doc);
    let result=await cache.seed('guest',doc.document);
    if(!result.ok)return update(result);
    // Guest localStorage remains the established capture path until this
    // controller opens. Retain an unequal starting copy as an alternative;
    // do not overwrite a newer IDB working document from another tab.
    viewGeneration=result.workingGeneration;lastDocument=doc.document;snapshot=result;ready=true;
    if(canonicalLibraryValue(doc.document)!==canonicalLibraryValue(result.document)){
      result=await cache.edit('guest',-1,doc.document);
      snapshot=result;retainedId=result.entryId||null;error=result;
      // This tab is editing the retained alternative, so future edits must
      // also compare stale until an explicit account comparison resolves it.
      viewGeneration=-1;
    }
    emit();return {ok:true};
  }
  function suspend(){boundaryEpoch++;blocked=true;sync?.close();sync=null;actions.blockSharing(true);error={ok:false,code:'identity_changed',message:'The account changed in another tab. This library is kept here. Refresh account before syncing.'};emit();}
  async function preview(){
    if(!await capture())return error;
    if(blocked||namespace!=='guest'&&!sync)return {ok:false,code:'login_required',message:'Open your account to compare libraries.'};
    const owner=namespace,opened=sync,result=await (owner==='guest'?cache.read('guest'):opened.preview());
    if(namespace!==owner||sync!==opened)return {ok:false,code:'identity_changed'};
    update(result);return result;
  }
  async function choose(generation,options){
    if(blocked||namespace!=='guest'&&!sync)return {ok:false,code:'login_required'};
    const ticket=startTransition();
    if(!ticket){refuseTransition(null);return error;}
    if(!await boundary(ticket)){refuseTransition(ticket,error?.ok===false?error:null);return error;}
    const opened=sync,result=await (namespace==='guest'?cache.chooseGuest(generation,options.localEntryId):opened.choose(generation,options));
    if(!await stableTransition(ticket)){refuseTransition(ticket);return error;}
    if(result.ok){
      if(!transitionUnchanged(ticket)){refuseTransition(ticket);return error;}
      if(actions.apply(result.document,namespace)===false){refuseTransition(ticket,{ok:false,code:'adoption_refused',message:'The chosen library is retained but could not be opened. Export it before retrying.'});return error;}
      update(result,{adopt:true});
    }else update(result);
    transitioning=false;transitionTicket=null;actions.blockSharing(false);emit();
    if(result.ok)opened?.schedule();return result;
  }
  async function flush(){
    if(!await capture())return error;
    if(!sync||blocked)return {ok:false,code:'login_required',message:'Open your account before retrying sync.'};
    const owner=namespace,opened=sync;
    const result=await opened.flush();
    if(namespace!==owner||sync!==opened)return {ok:false,code:'identity_changed'};
    return receive(result);
  }
  let homeAccessMemo=null;
  function homeAccess(){
    if(blocked||transitioning||!person||namespace!==person.id)return null;
    const key=`${namespace}:${boundaryEpoch}`;
    if(homeAccessMemo?.key===key)return homeAccessMemo;
    const owner=namespace,epoch=boundaryEpoch;
    const scoped=method=>async(...args)=>{
      if(blocked||transitioning||namespace!==owner||boundaryEpoch!==epoch)return {ok:false,code:'identity_changed'};
      const result=await account[method](owner,...args);
      if(blocked||transitioning||namespace!==owner||boundaryEpoch!==epoch)return {ok:false,code:'identity_changed'};
      return result;
    };
    homeAccessMemo=Object.freeze({key,personId:owner,epoch,homes:scoped('homes'),home:scoped('home'),
      captureHome:scoped('captureHome'),createHome:scoped('createHome'),saveHome:scoped('saveHome'),leaveHome:scoped('leaveHome')});
    return homeAccessMemo;
  }
  let socialAccessMemo=null;
  function socialAccess(){
    if(blocked||transitioning||!person||namespace!==person.id)return null;
    const key=`${namespace}:${boundaryEpoch}`;if(socialAccessMemo?.key===key)return socialAccessMemo;
    const owner=namespace,epoch=boundaryEpoch,active=()=>!blocked&&!transitioning&&namespace===owner&&boundaryEpoch===epoch;
    const scoped=method=>async(...args)=>{if(!active())return {ok:false,code:'identity_changed'};
      const result=await account[method](owner,...args);return active()?result:{ok:false,code:'identity_changed'};};
    const methods=['homes','people','setContactCode','requestFriend','removeFriend','blockPerson','invitations','inviteHome','respondInvitation','cancelInvitation','archiveInvitation','presence','homePresence','setPresence'];
    socialAccessMemo=Object.freeze({key,personId:owner,epoch,person:{id:person.id,displayName:person.displayName},
      status:async()=>{if(!active())return {ok:false,code:'identity_changed'};const result=await account.status();return active()?result:{ok:false,code:'identity_changed'};},
      ...Object.fromEntries(methods.map(method=>[method,scoped(method)]))});return socialAccessMemo;
  }
  return Object.freeze({initialize,edit,settled,capture,preview,choose,flush,suspend,homeAccess,socialAccess,get info(){return info();},
    status:()=>account.status(),
    refreshAccount:()=>identityAction(()=>account.session()),
    async openDeviceCopy(personId){
      if(!/^p_[A-Za-z0-9_-]{43}$/.test(personId))return {ok:false,code:'invalid_person'};
      const ok=await adoptIdentity({personId,deviceOnly:true});if(ok)person=null;emit();return ok?{ok:true}:error;
    },
    register:input=>identityAction(()=>account.register(input),{intent:true}),
    recover:key=>identityAction(()=>account.recover(key),{intent:true}),
    logout:()=>identityAction(()=>account.logout(),{intent:true}),
    exportCurrent:()=>({ok:true,document:JSON.parse(JSON.stringify(lastDocument||actions.capture().document))}),
    exportOriginals:()=>cache?cache.export(namespace):Promise.resolve({ok:false,code:'cache_unavailable'}),
    version:id=>account.library(namespace,id),
    history:()=>account.library(namespace),
    async archive(generation,ids){if(!sync||blocked)return {ok:false,code:'login_required'};const owner=namespace,opened=sync,result=await opened.archive(generation,ids);return receive(result,owner,opened);},
    async reopen(){if(!await capture())return error;return identityAction(()=>account.session());},
    close(){sync?.close();cache?.close();},
  });
}
