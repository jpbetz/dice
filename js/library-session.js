/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {createAccountClient} from './account.js';
import {openLibraryCache} from './library-cache.js';
import {createLibrarySync} from './library-sync.js';
import {canonicalLibraryValue,validateLibraryDocument} from './library-document.js';

// Owns one app mirror and one durable namespace. Network previews and IDB
// metadata never advance the generation of the document this tab is editing.
export function createLibrarySession(actions,{cacheFactory=openLibraryCache,accountFactory=createAccountClient}={}) {
  let cache=null,sync=null,namespace='guest',viewGeneration=null,snapshot=null,person=null;
  let queue=Promise.resolve(),pending=0,error=null,ready=false,blocked=false,transitioning=false;
  let retainedId=null,lastDocument=null,editFailure=false;
  const emit=()=>actions.changed?.(info());
  const info=()=>({ready,namespace,person,pending,blocked,transitioning,error,retainedId,
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
  function edit(document){
    const checked=validateLibraryDocument(document);
    if(!checked.ok){error=checked;editFailure=true;emit();return false;}
    // Keep a concrete exportable candidate even if the browser later refuses
    // its IDB transaction. No account candidate is written to guest keys.
    lastDocument=checked.document;
    if(!ready||transitioning){error={ok:false,code:'workspace_opening',message:'The private workspace is opening. Your current changes remain on screen.'};editFailure=true;emit();return false;}
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
    if(canonicalLibraryValue(doc.document)!==canonicalLibraryValue(lastDocument))edit(doc.document);
    return settled();
  }
  async function boundary(){
    if(!await capture())return false;
    actions.blockSharing(true);
    const cleared=await actions.clearSharing();
    if(cleared===false){error={ok:false,code:'sharing_boundary',message:'Sharing choices could not be cleared. Your current library is still open.'};emit();return false;}
    return true;
  }
  async function adoptIdentity({personId}) {
    if(!await boundary())return false;
    transitioning=true;emit();
    const previous=sync;sync=null;previous?.close();
    const next=personId||'guest';
    let result=await cache.read(next);
    if(result.code==='cache_missing')result=await cache.seed(next,lastDocument);
    if(!result.ok){error=result;blocked=true;transitioning=false;emit();return false;}
    // Seed never replaces a retained namespace. Apply only a verified local
    // working document; remote adoption is the later explicit choose action.
    if(await actions.apply(result.document,next)===false){error={ok:false,code:'adoption_refused',message:'The saved library could not be opened. Your previous library remains available for export.'};blocked=true;transitioning=false;emit();return false;}
    namespace=next;blocked=false;transitioning=false;editFailure=false;
    update(result,{adopt:true});
    if(personId){const opened=createLibrarySync({account,cache,personId,onResult:result=>{if(namespace===personId&&sync===opened)receive(result);}});sync=opened;}
    actions.namespaceChanged?.(next);actions.blockSharing(false);emit();return true;
  }
  const account=accountFactory({onIdentityChange:adoptIdentity});
  async function receive(result){
    if(result?.state)snapshot=result;
    else if(cache){const current=await cache.read(namespace);if(current.ok)snapshot=current;}
    if(!result?.ok){error=result;if(['identity_changed','person_mismatch','login_required'].includes(result?.code))suspend();}
    else error=null;
    emit();return result;
  }
  async function identityAction(action){
    if(!ready)return {ok:false,code:'workspace_opening'};
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
  function suspend(){blocked=true;sync?.close();sync=null;actions.blockSharing(true);error={ok:false,code:'identity_changed',message:'The account changed in another tab. This library is kept here. Refresh account before syncing.'};emit();}
  async function preview(){
    if(!await capture())return error;
    if(!sync||blocked)return {ok:false,code:'login_required',message:'Open your account to compare libraries.'};
    const result=await sync.preview();update(result);return result;
  }
  async function choose(generation,options){
    if(!sync||blocked)return {ok:false,code:'login_required'};
    if(!await boundary())return error;
    transitioning=true;emit();
    const result=await sync.choose(generation,options);
    if(result.ok){
      if(await actions.apply(result.document,namespace)===false){transitioning=false;blocked=true;return update({ok:false,code:'adoption_refused',message:'The chosen library is retained but could not be opened. Export it before retrying.'});}
      update(result,{adopt:true});
    }else update(result);
    transitioning=false;actions.blockSharing(false);emit();
    if(result.ok)sync.schedule();return result;
  }
  async function flush(){
    if(!await settled())return error;
    if(!sync||blocked)return {ok:false,code:'login_required',message:'Open your account before retrying sync.'};
    const owner=namespace,opened=sync;
    const result=await opened.flush();
    if(namespace!==owner||sync!==opened)return {ok:false,code:'identity_changed'};
    return receive(result);
  }
  return Object.freeze({initialize,edit,settled,capture,preview,choose,flush,suspend,get info(){return info();},
    status:()=>account.status(),
    refreshAccount:()=>identityAction(()=>account.session()),
    register:input=>identityAction(()=>account.register(input)),
    recover:key=>identityAction(()=>account.recover(key)),
    logout:()=>identityAction(()=>account.logout()),
    exportCurrent:()=>({ok:true,document:JSON.parse(JSON.stringify(lastDocument||actions.capture().document))}),
    exportOriginals:()=>cache?cache.export(namespace):Promise.resolve({ok:false,code:'cache_unavailable'}),
    version:id=>account.library(namespace,id),
    history:()=>account.library(namespace),
    async archive(generation,ids){if(!sync||blocked)return {ok:false,code:'login_required'};const result=await sync.archive(generation,ids);return receive(result);},
    async reopen(){if(!await capture())return error;return identityAction(()=>account.session());},
    close(){sync?.close();cache?.close();},
  });
}
