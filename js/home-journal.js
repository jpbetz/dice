/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Retry envelopes are separate from saved homes and private dice libraries.
// Keep exact request bytes before HTTP; exports deliberately omit live seats.
const DATABASE='dice.home-actions.v1',STORE='actions',MAX_ACTIONS=32,MAX_BYTES=16*1024*1024;
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>({ok:false,code,message});
const unavailable=()=>fail('journal_unavailable','This browser could not keep a safe retry. Download the preview before leaving.');
const validOwner=id=>/^p_[A-Za-z0-9_-]{43}$/.test(id);
const valid=record=>record&&record.schema===1&&validOwner(record.personId)&&typeof record.id==='string'
  &&/^[A-Za-z0-9_-]{8,80}$/.test(record.id)&&['new','convert','save','reconcile','leave'].includes(record.kind)
  &&record.input?.operationId===record.id&&Number.isFinite(record.at)&&['pending','saved','refused','conflict'].includes(record.status)
  &&(record.attempt===undefined||Number.isSafeInteger(record.attempt)&&record.attempt>0);
const immutable=record=>JSON.stringify([record.personId,record.id,record.kind,record.homeId,record.input,record.document]);
// Only known refusals that happen before a home write can be abandoned as
// unsaved. Unknown responses and missing acknowledgements remain uncertain.
export const definitiveHomeRefusal=result=>result?.ok===false&&['invalid_home','home_limit','capture_changed','home_name_required','home_exists','operation_reused','live_seat_required','home_not_found'].includes(result.code);
export const canAbandonHomeAction=record=>record?.status==='refused'&&definitiveHomeRefusal(record.result);
export function exportHomeAction(record){return {schema:1,kind:record.kind,at:record.at,status:record.status,
  ...(record.homeId?{homeId:record.homeId}:{}),...(record.input.name?{name:record.input.name}:{}),
  ...(record.document?{document:copy(record.document)}:{}),...(record.result?.code?{result:record.result.code}:{})};}
export async function openHomeJournal({indexedDB=globalThis.indexedDB,timeoutMs=6000}={}){
  let db;try{db=await new Promise((resolve,reject)=>{if(!indexedDB){reject();return;}const r=indexedDB.open(DATABASE,1);
    let settled=false;const timer=setTimeout(()=>{settled=true;reject();},timeoutMs);
    r.onupgradeneeded=()=>{const s=r.result.createObjectStore(STORE,{keyPath:'key'});s.createIndex('personId','personId');};
    r.onsuccess=()=>{clearTimeout(timer);if(settled)r.result.close();else{settled=true;resolve(r.result);}};
    r.onerror=r.onblocked=()=>{settled=true;clearTimeout(timer);reject();};});}catch{return unavailable();}
  db.onversionchange=()=>db.close();
  const transact=(personId,record=null,remove=[],abandon=null)=>new Promise(resolve=>{
    if(!validOwner(personId)){resolve(unavailable());return;}
    let result=null,timer,settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};try{
      const tx=db.transaction(STORE,record||remove.length||abandon?'readwrite':'readonly',{durability:'strict'}),store=tx.objectStore(STORE);
      const request=store.index('personId').getAll(personId);
      request.onsuccess=()=>{if(settled)return;try{
        const rows=request.result;if(rows.some(row=>!valid(row))){result=fail('journal_corrupt','Saved retry data needs recovery. No retained action was replaced.');return;}
        if(abandon){
          const kept=rows.find(row=>row.id===abandon.id);
          if(!canAbandonHomeAction(kept)||immutable(kept)!==immutable(abandon)||kept.attempt!==abandon.attempt||JSON.stringify(kept.result)!==JSON.stringify(abandon.result)){
            result=fail('action_protected','This request changed or still needs confirmation. Its retry was kept.');return;
          }
          store.delete(kept.key);result={ok:true};return;
        }
        if(remove.length){
          const selected=rows.filter(row=>remove.includes(row.id));
          if(selected.length!==new Set(remove).size||selected.some(row=>row.status!=='saved'||!row.result?.ok)){result=fail('action_protected','Unconfirmed requests and their previews must be kept.');return;}
          for(const row of selected)store.delete(row.key);result={ok:true};return;
        }
        if(!record){result={ok:true,records:rows.map(({key,...row})=>row).sort((a,b)=>b.at-a.at)};return;}
        if(!valid(record)||record.personId!==personId){result=unavailable();return;}
        const previous=rows.find(row=>row.id===record.id);
        if(previous&&immutable(previous)!==immutable(record)){result=fail('operation_changed','The kept retry differs from this request. Review a new capture.');return;}
        if(record.status==='pending'&&!record.result)record={...record,attempt:(previous?.attempt||0)+1};
        else if(previous&&(previous.attempt!==record.attempt||previous.status!=='pending'&&JSON.stringify(previous.result)!==JSON.stringify(record.result))){
          result=fail('action_changed','Another tab retried this request. Refresh kept actions; its current retry remains safe.');return;
        }
        const next=rows.filter(row=>row.id!==record.id).concat(record);
        if(next.length>MAX_ACTIONS||new TextEncoder().encode(JSON.stringify(next)).byteLength>MAX_BYTES){result=fail('journal_full','Kept home actions are full. Remove confirmed device records, or download and acknowledge a refused preview before abandoning its retry. Uncertain requests stay kept.');return;}
        store.put({...copy(record),key:personId+':'+record.id});result={ok:true,record:copy(record)};
      }catch{result=unavailable();tx.abort();}};
      timer=setTimeout(()=>{try{tx.abort();}catch{}finish(unavailable());},timeoutMs);
      tx.oncomplete=()=>finish(result||unavailable());tx.onabort=tx.onerror=()=>finish(unavailable());
    }catch{finish(unavailable());}
  });
  return {ok:true,read:owner=>transact(owner),save:record=>transact(record.personId,record),forgetConfirmed:(owner,ids)=>transact(owner,null,ids),abandonRefused:(owner,record)=>transact(owner,null,[],record),close:()=>db.close()};
}
