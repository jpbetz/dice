/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Exact private social intents, separate from room state, recovery credentials,
// dice libraries and server invitation history. Nothing retries automatically.
const DB='dice.social-actions.v1',STORE='people',MAX_ACTIONS=32,MAX_BYTES=256*1024;
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>({ok:false,code,message});
const unavailable=()=>fail('social_journal_unavailable','This device has not confirmed the request. Download it before leaving.');
const ownerValid=id=>typeof id==='string'&&/^p_[A-Za-z0-9_-]{43}$/.test(id);
const opValid=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(id);
const inviteValid=id=>typeof id==='string'&&/^i_[A-Za-z0-9_-]{8,80}$/.test(id);
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export const definitiveSocialRefusal=result=>result?.ok===false&&['invalid_social','social_not_found','contact_unavailable','social_limit','request_pending','social_send_limit','invitation_pending','operation_reused'].includes(result.code);
export function validSocialRequest(request){
  if(!fields(request,['kind','target','input'])||!opValid(request.input?.operationId))return false;
  const {kind,target=null,input}=request;
  const extra={'contact-code':['code'],'friend-request':['code'],'remove-friend':[],'block-person':['blocked'],'invite-home':['homeId','toPersonId'],'respond-invitation':['choice'],'cancel-invitation':[],'archive-invitation':[]}[kind];
  if(!extra||!fields(input,['operationId',...extra]))return false;
  if(['remove-friend','block-person'].includes(kind)){if(!ownerValid(target))return false;}
  else if(['respond-invitation','cancel-invitation','archive-invitation'].includes(kind)){if(!inviteValid(target))return false;}
  else if(target!==null)return false;
  if(kind==='contact-code'||kind==='friend-request')return kind==='contact-code'&&input.code===null||typeof input.code==='string'&&/^dc1_[A-Za-z0-9_-]{43}$/.test(input.code);
  if(kind==='block-person')return typeof input.blocked==='boolean';
  if(kind==='invite-home')return ownerValid(input.toPersonId)&&typeof input.homeId==='string'&&/^h_[A-Za-z0-9_-]{43}$/.test(input.homeId);
  if(kind==='respond-invitation')return ['accept','decline'].includes(input.choice);
  return true;
}
function validResult(result,personId){return result&&typeof result.ok==='boolean'&&(!result.personId||result.personId===personId)&&(result.ok?result.personId===personId:typeof result.code==='string');}
function validState(state,personId){
  try{return state&&state.schema===1&&state.personId===personId&&Number.isSafeInteger(state.generation)&&state.generation>=1&&Array.isArray(state.records)&&state.records.length<=MAX_ACTIONS
    &&new Set(state.records.map(r=>r?.id)).size===state.records.length&&state.records.every(r=>r&&r.id===r.request?.input?.operationId&&validSocialRequest(r.request)&&Number.isFinite(r.at)&&Number.isSafeInteger(r.attempt)&&r.attempt>=1
      &&['pending','saved','refused'].includes(r.status)&&(r.result===undefined?r.status==='pending':validResult(r.result,personId)&&(!r.result.ok||r.status==='saved')&&(r.status!=='refused'||definitiveSocialRefusal(r.result))))
    &&new TextEncoder().encode(JSON.stringify(state)).byteLength<=MAX_BYTES;}catch{return false;}
}
export function transitionSocialJournal(raw,personId,action=null){
  if(!ownerValid(personId))return unavailable();
  if(raw!==undefined&&!validState(raw,personId))return fail('social_journal_corrupt','Saved requests need recovery. No original was replaced.');
  let state=raw?copy(raw):{schema:1,personId,generation:1,records:[]};
  if(!action)return {ok:true,state};
  let record;
  if(action.kind==='begin'){
    if(!validSocialRequest(action.request)||!Number.isFinite(action.at))return fail('invalid_social','Check this People action.');
    const previous=state.records.find(r=>r.id===action.request.input.operationId);
    if(previous&&JSON.stringify(previous.request)!==JSON.stringify(action.request))return fail('operation_changed','This request ID belongs to different changes.');
    record={id:action.request.input.operationId,request:copy(action.request),at:previous?.at??action.at,attempt:(previous?.attempt||0)+1,status:'pending'};
    state.records=[record,...state.records.filter(r=>r.id!==record.id)];
  }else if(action.kind==='complete'){
    const previous=state.records.find(r=>r.id===action.id);
    if(!previous||previous.attempt!==action.attempt||previous.status!=='pending')return fail('social_attempt_changed','Another tab changed this request. Refresh its kept action.');
    if(!validResult(action.result,personId))return fail('identity_changed','The account changed. The original request remains kept.');
    record={...previous,status:action.result.ok?'saved':definitiveSocialRefusal(action.result)?'refused':'pending',result:copy(action.result)};
    state.records=state.records.map(r=>r.id===record.id?record:r);
  }else if(action.kind==='forget'){
    if(action.generation!==state.generation)return fail('social_attempt_changed','Kept requests changed. Review the current actions before removing any.');
    const selected=state.records.filter(r=>action.ids?.includes(r.id));
    if(!Array.isArray(action.ids)||!action.ids.length||selected.length!==new Set(action.ids).size||action.acknowledged!==true||selected.some(r=>r.status!=='saved'&&!(action.downloaded===true&&r.status==='refused'&&definitiveSocialRefusal(r.result))))return fail('social_action_protected','Uncertain requests must remain available for an exact retry.');
    state.records=state.records.filter(r=>!action.ids.includes(r.id));
  }else return unavailable();
  state.generation++;
  if(state.records.length>MAX_ACTIONS||new TextEncoder().encode(JSON.stringify(state)).byteLength>MAX_BYTES)return fail('social_journal_full','Kept requests are full. Remove confirmed device receipts, or download and acknowledge a refused request.');
  return {ok:true,state,changed:true,...(record?{record}:{})};
}
export async function openSocialJournal({indexedDB=globalThis.indexedDB,timeoutMs=6000}={}){
  let db;try{db=await new Promise((resolve,reject)=>{if(!indexedDB){reject();return;}const request=indexedDB.open(DB,1);let done=false;
    const timer=setTimeout(()=>{done=true;reject();},timeoutMs);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>{clearTimeout(timer);if(done)request.result.close();else{done=true;resolve(request.result);}};
    request.onerror=request.onblocked=()=>{done=true;clearTimeout(timer);reject();};});}catch{return unavailable();}
  db.onversionchange=()=>db.close();
  const run=(personId,action=null)=>new Promise(resolve=>{let done=false,timer,result,tx;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    try{tx=db.transaction(STORE,action?'readwrite':'readonly',{durability:'strict'});const store=tx.objectStore(STORE),request=store.get(personId);
      request.onsuccess=()=>{if(done)return;try{result=transitionSocialJournal(request.result,personId,action);if(result.changed)store.put(result.state,personId);}catch{tx.abort();}};
      timer=setTimeout(()=>{try{tx.abort();}catch{}finish(unavailable());},timeoutMs);tx.oncomplete=()=>finish(result||unavailable());tx.onabort=tx.onerror=()=>finish(unavailable());
    }catch{finish(unavailable());}
  });
  return {ok:true,read:id=>run(id),begin:(id,request)=>run(id,{kind:'begin',request,at:Date.now()}),complete:(id,operation,attempt,result)=>run(id,{kind:'complete',id:operation,attempt,result}),
    forget:(id,generation,ids,{acknowledged=false,downloaded=false}={})=>run(id,{kind:'forget',generation,ids,acknowledged,downloaded}),close:()=>db.close()};
}
