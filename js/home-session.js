/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {openHomeJournal,exportHomeAction} from './home-journal.js';

// A management session never enters a room or applies a saved setup to live
// play. Each request belongs to the exact person/identity boundary it opened.
export function createHomeSession(actions,{journalFactory=openHomeJournal}={}){
  let owner=null,access=null,journal=null,cards=[],records=[],selected=null,preview=null,error=null,loading=false,view=0;
  const info=()=>({owner,cards,records,selected,preview,error,loading,view});
  const emit=()=>actions.changed?.(info());
  const changed=()=>({ok:false,code:'identity_changed',message:'The account changed. Reopen saved tables for the current account.'});
  function identity(){const next=actions.access();const key=next?`${next.personId}:${next.epoch}`:null;
    if(key!==owner){owner=key;access=next;cards=[];records=[];selected=null;preview=null;error=null;loading=false;view++;emit();}else access=next;
    return access;
  }
  const same=(token,opened)=>{identity();return token===owner&&opened===access;};
  // Access adapters are memoized for their namespace/epoch by the app.
  async function ready(){if(journal)return journal;const r=await journalFactory();if(r.ok)journal=r;else{error=r;emit();}return r;}
  async function load(){identity();if(!access)return {ok:false,code:'login_required'};const token=owner,opened=access;loading=true;emit();
    const storage=await ready();if(!same(token,opened))return changed();
    const [remote,local]=await Promise.all([opened.homes(),storage.ok?storage.read(opened.personId):Promise.resolve(storage)]);
    if(!same(token,opened))return changed();loading=false;
    if(remote.ok)cards=remote.homes;if(local.ok)records=local.records;
    error=!remote.ok?remote:!local.ok?local:null;emit();return remote;
  }
  async function manage(id){identity();if(!access)return changed();const token=owner,opened=access,request=++view;loading=true;emit();
    const result=await opened.home(id);if(!same(token,opened)||request!==view)return changed();loading=false;
    if(result.ok){selected=result;preview=null;error=null;}else error=result;emit();return result;
  }
  async function capture(id=null){identity();if(!access)return changed();const token=owner,opened=access,request=++view;
    const seat=actions.seat();if(!seat)return {ok:false,code:'live_seat_required',message:'Join the current table before capturing its setup.'};
    loading=true;emit();const [captured,target]=await Promise.all([opened.captureHome(seat),id?opened.home(id):Promise.resolve(null)]);
    if(!same(token,opened)||request!==view)return changed();loading=false;
    if(!captured.ok||target&&!target.ok){error=!captured.ok?captured:target;emit();return error;}
    if(target&&target.home.roomKey!==seat.room){error={ok:false,code:'live_seat_required',message:'Join this saved home before capturing its live setup.'};emit();return error;}
    selected=target;preview={owner,kind:id?'save':'convert',homeId:id,document:captured.document,
      input:{...seat,expectedCapture:captured.captureRevision,...(id?{baseRevision:target.home.headRevision}:{})}};error=null;emit();return {ok:true,preview};
  }
  function newHome(name){identity();if(!access)return changed();const cleaned=String(name||'').trim();if(!cleaned||cleaned.length>28)return {ok:false,code:'home_name_required',message:'Give this home a name of up to 28 characters.'};
    view++;loading=false;selected=null;preview={owner,kind:'new',homeId:null,document:null,input:{name:cleaned}};error=null;emit();return {ok:true};
  }
  async function version(id){identity();if(!access||!selected)return changed();const token=owner,opened=access,request=++view,home=selected.home;
    const result=await opened.home(home.id,id);if(!same(token,opened)||request!==view)return changed();
    if(!result.ok){error=result;emit();return result;}
    preview={owner,kind:'reconcile',homeId:home.id,document:result.document,input:{baseRevision:home.headRevision,sourceVersionId:id}};error=null;emit();return {ok:true,preview};
  }
  async function execute(record){const token=owner,opened=access,request=view;if(!opened||record.personId!==opened.personId)return changed();
    const storage=await ready();if(!same(token,opened))return changed();if(!storage.ok)return storage;
    const captured=await storage.save(record);if(!same(token,opened))return changed();if(!captured.ok){error=captured;emit();return captured;}
    records=[record,...records.filter(r=>r.id!==record.id)];loading=true;emit();
    let result;try{result=record.kind==='new'||record.kind==='convert'?await opened.createHome(record.input)
      :record.kind==='leave'?await opened.leaveHome(record.homeId,record.input)
      :await opened.saveHome(record.homeId,record.input,{reconcile:record.kind==='reconcile'});}catch{result={ok:false,code:'account_unavailable',message:'The save could not be confirmed. Its exact retry and preview are kept on this device.'};}
    // Record a verified receipt only in its original journal namespace. The
    // scoped transport returns identity_changed after any account replacement.
    if(result.code!=='identity_changed'){
      const completed={...record,status:result.ok?'saved':result.code==='home_conflict'?'conflict':result.code==='account_unavailable'?'pending':'refused',result};
      const saved=await storage.save(completed);if(saved.ok)record=completed;else result={...saved,receipt:result};
    }
    if(!same(token,opened))return changed();records=[record,...records.filter(r=>r.id!==record.id)];
    if(result.ok){if(record.kind==='leave')cards=cards.filter(h=>h.id!==record.homeId);else if(result.home)cards=[result.home,...cards.filter(h=>h.id!==result.home.id)];}
    // A confirmed action still updates its journal/card, but never replaces a
    // newer comparison or reopens management after the player has returned.
    if(request!==view){emit();return {...result,viewChanged:true};}
    loading=false;error=result.ok?null:result;
    if(result.ok){preview=null;if(record.kind==='leave')selected=null;}
    emit();return result;
  }
  async function submit(){identity();if(!access||!preview||preview.owner!==owner)return changed();const id=crypto.randomUUID(),p=preview;
    return execute({schema:1,personId:access.personId,id,at:Date.now(),kind:p.kind,homeId:p.homeId,input:{...p.input,operationId:id},document:p.document,status:'pending'});
  }
  async function retry(id){identity();const record=records.find(r=>r.id===id);if(!record)return changed();return execute(record);}
  async function leave(){identity();if(!access||!selected)return changed();const id=crypto.randomUUID();return execute({schema:1,personId:access.personId,id,at:Date.now(),kind:'leave',homeId:selected.home.id,input:{operationId:id},document:selected.document,status:'pending'});}
  return {get info(){return info();},identity,load,manage,capture,newHome,version,save:submit,retry,leave,
    async forgetConfirmed(){identity();if(!access)return changed();const token=owner,opened=access,ids=records.filter(r=>r.status==='saved').map(r=>r.id);if(!ids.length)return {ok:true};
      const storage=await ready();if(!same(token,opened))return changed();if(!storage.ok)return storage;
      const result=await storage.forgetConfirmed(opened.personId,ids);if(!same(token,opened))return changed();if(result.ok)records=records.filter(r=>!ids.includes(r.id));else error=result;emit();return result;},
    exportPreview:()=>preview?.document?{schema:1,document:preview.document}:preview?{schema:1,name:preview.input.name}:null,
    exportAction:id=>{const r=records.find(r=>r.id===id);return r?exportHomeAction(r):null;},
    closeView(){view++;selected=null;preview=null;loading=false;emit();},
  };
}
