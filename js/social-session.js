/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {openSocialJournal,validSocialRequest} from './social-journal.js';
import {createPresenceHeartbeat} from './presence.js';

// Private People state never enters a room, publishes a library, or grants a
// seat. Server receipts acknowledge actions; fresh directories decide access.
export function createSocialSession(actions,{journalFactory=openSocialJournal,heartbeatFactory=createPresenceHeartbeat}={}){
  let owner=null,access=null,journal=null,opening=null,readEpoch=0,loading=false,available=false,paused=false,capabilities=[];
  let friends=[],blockedPeople=[],blockedNext=null,homes=[],fresh=false,contactCode=null,ownCode=null;
  let incoming=[],outgoing=[],next={incoming:null,outgoing:null},records=[],generation=1,error=null;
  let heartbeat=null,sharing={online:false,location:false},presence={state:'off'},signals=[],homeSignals=[];
  const volatile=new Map();
  const info=()=>({owner,person:access?.person||null,loading,available,paused,capabilities,friends,blockedPeople,blockedNext,homes,fresh,contactCode,ownCode,incoming,outgoing,next,records,generation,error,sharing,presence,signals,homeSignals});
  const emit=()=>actions.changed?.(info());
  const changed=()=>({ok:false,code:'identity_changed',message:'The account changed. Reopen People for the current account.'});
  const notReady=()=>({ok:false,code:'social_unavailable',message:paused?'People service is paused.':'People service is unavailable.'});
  function identity(){const latest=actions.access(),key=latest?`${latest.personId}:${latest.epoch}`:null;
    if(key!==owner){void heartbeat?.close({withdraw:false});heartbeat=null;readEpoch++;owner=key;access=latest;loading=false;available=false;paused=false;capabilities=[];
      friends=[];blockedPeople=[];blockedNext=null;homes=[];fresh=false;contactCode=null;ownCode=null;incoming=[];outgoing=[];next={incoming:null,outgoing:null};records=volatile.get(latest?.personId)?[volatile.get(latest.personId)]:[];generation=1;error=null;sharing={online:false,location:false};presence={state:'off'};signals=[];homeSignals=[];emit();
    }else access=latest;return access;
  }
  const same=(token,opened)=>{identity();return owner===token&&access===opened;};
  async function storage(){if(journal)return journal;if(!opening)opening=journalFactory().then(result=>{if(result.ok)journal=result;opening=null;return result;});return opening;}
  const visibleRecords=(result,person)=>{const unkept=volatile.get(person);records=[...(unkept?[unkept]:[]),...result.state.records.filter(r=>r.id!==unkept?.id)];generation=result.state.generation;};
  function makeSignalsUnknown(){signals=signals.map(row=>({...row,state:'unknown',expiresAt:null}));homeSignals=[];}
  async function load(){identity();if(!access)return changed();const token=owner,opened=access,request=++readEpoch;loading=true;fresh=false;makeSignalsUnknown();emit();
    const [status,store]=await Promise.all([opened.status(),storage()]);if(!same(token,opened)||request!==readEpoch)return changed();
    available=status.enabled===true&&status.available!==false&&Array.isArray(status.capabilities)&&status.capabilities.includes('people');paused=!!status.paused;capabilities=status.capabilities||[];
    const local=store.ok?await store.read(opened.personId):store;if(!same(token,opened)||request!==readEpoch)return changed();if(local.ok)visibleRecords(local,opened.personId);
    if(!available){loading=false;error=notReady();makeSignalsUnknown();emit();return error;}
    const [people,received,sent,saved,blocked]=await Promise.all([opened.people(),opened.invitations({direction:'incoming'}),opened.invitations({direction:'outgoing'}),opened.homes(),opened.blockedPeople()]);
    if(!same(token,opened)||request!==readEpoch)return changed();loading=false;
    const failed=[people,received,sent,saved,blocked].find(result=>!result.ok);
    if(!failed){friends=people.friends;contactCode=people.contactCode;incoming=received.invitations;outgoing=sent.invitations;next={incoming:received.next,outgoing:sent.next};homes=saved.homes;blockedPeople=blocked.blockedPeople;blockedNext=blocked.next;fresh=true;
      if(ownCode&&(ownCode.issuedAt!==contactCode.issuedAt||!contactCode.enabled))ownCode=null;
    }else makeSignalsUnknown();
    error=failed||(!local.ok?local:null);emit();return failed||{ok:true};
  }
  async function page(direction){identity();if(!access||!fresh)return notReady();const token=owner,opened=access,request=readEpoch,after=direction==='blocked'?blockedNext:next[direction];if(!after)return {ok:true};
    const result=direction==='blocked'?await opened.blockedPeople({after}):await opened.invitations({direction,after});if(!same(token,opened)||request!==readEpoch)return changed();
    if(result.ok){if(direction==='blocked'){blockedPeople=[...blockedPeople,...result.blockedPeople.filter(row=>!blockedPeople.some(old=>old.id===row.id))];blockedNext=result.next;}
      else{const previous=direction==='incoming'?incoming:outgoing,rows=[...previous,...result.invitations.filter(row=>!previous.some(old=>old.id===row.id))];if(direction==='incoming')incoming=rows;else outgoing=rows;next={...next,[direction]:result.next};}}
    else error=result;emit();return result;
  }
  async function send(opened,request){const {kind,target,input}=request;
    return kind==='contact-code'?opened.setContactCode(input):kind==='friend-request'?opened.requestFriend(input):kind==='remove-friend'?opened.removeFriend(target,input)
      :kind==='block-person'?opened.blockPerson(target,input):kind==='invite-home'?opened.inviteHome(input):kind==='respond-invitation'?opened.respondInvitation(target,input)
      :kind==='cancel-invitation'?opened.cancelInvitation(target,input):opened.archiveInvitation(target,input);
  }
  async function execute(request){identity();if(!access)return changed();const token=owner,opened=access,previous=volatile.get(opened.personId);
    if(previous&&previous.id!==request.input.operationId)return {ok:false,code:'social_journal_unavailable',message:'Retry the unconfirmed device request before sending another.'};
    const retain=failure=>{const record={id:request.input.operationId,request,at:Date.now(),attempt:1,status:'pending',volatile:true};volatile.set(opened.personId,record);if(same(token,opened)){records=[record,...records.filter(r=>r.id!==record.id)];error=failure;emit();}return failure;};
    const store=await storage();if(!store.ok)return retain(store);if(!same(token,opened))return changed();
    const begun=await store.begin(opened.personId,request);if(!begun.ok)return retain(begun);volatile.delete(opened.personId);if(!same(token,opened))return changed();
    visibleRecords(begun,opened.personId);fresh=false;readEpoch++;emit();let result;
    try{result=await send(opened,request);}catch{result={ok:false,code:'account_unavailable',message:'This request has not been confirmed. Retry its kept action.'};}
    if(result.code==='identity_changed')return changed();
    const completed=await store.complete(opened.personId,begun.record.id,begun.record.attempt,result);
    if(!same(token,opened))return changed();if(completed.ok)visibleRecords(completed,opened.personId);else{error=completed;emit();return completed;}
    if(result.ok&&request.kind==='contact-code')ownCode=request.input.code?{code:request.input.code,...result.contactCode}:null;
    error=result.ok?null:result;emit();
    // Even an accepted retry may be a historical receipt after removal/leave.
    // Refresh both directories before enabling friendship/home actions.
    await load();if(!same(token,opened))return changed();if(!result.ok){error=result;emit();}return result;
  }
  async function act(kind,input={},target=null){identity();if(!access||!available||!fresh)return notReady();
    const body=JSON.stringify(input),old=records.find(r=>r.status==='pending'&&r.request.kind===kind&&(r.request.target||null)===target&&JSON.stringify(Object.fromEntries(Object.entries(r.request.input).filter(([key])=>key!=='operationId')))===body);
    const request=old?.request||{kind,...(target?{target}:{}),input:{...input,operationId:crypto.randomUUID()}};
    if(!validSocialRequest(request))return {ok:false,code:'invalid_social',message:'Check this People action.'};return execute(request);
  }
  async function retry(id){identity();const record=records.find(r=>r.id===id);return record?execute(record.request):changed();}
  function cleanup(ids){identity();const selected=records.filter(r=>ids.includes(r.id));return access&&selected.length===ids.length?{owner,generation,ids:[...ids],data:{schema:1,requests:selected.map(r=>({at:r.at,request:r.request,status:r.status,result:r.result}))}}:null;}
  async function forget(proposal,options){identity();if(!access||proposal?.owner!==owner)return changed();const token=owner,opened=access,store=await storage();if(!same(token,opened))return changed();if(!store.ok)return store;
    const result=await store.forget(opened.personId,proposal.generation,proposal.ids,options);if(!same(token,opened))return changed();if(result.ok)visibleRecords(result,opened.personId);else error=result;emit();return result;
  }
  async function readPresence(){identity();if(!access||!available||!capabilities.includes('presence'))return notReady();const token=owner,opened=access,seat=actions.seat(),home=homes.find(h=>h.roomKey===seat?.room);
    const [people,table]=await Promise.all([opened.presence(),home?opened.homePresence(home.id):Promise.resolve({ok:true,signals:[]})]);if(!same(token,opened))return changed();
    signals=people.ok?people.signals:friends.map(person=>({person,state:'unknown',expiresAt:null}));homeSignals=table.ok?table.signals:[];if(!people.ok||!table.ok)error=!people.ok?people:table;emit();return people.ok&&table.ok?{ok:true}:!people.ok?people:table;
  }
  async function setSharing({online=false,location=false}={}){identity();
    if(!online){sharing={online:false,location:false};emit();return heartbeat?heartbeat.setSharing({online:false}):{ok:true};}
    if(!access||(!available||!capabilities.includes('presence'))&&!(heartbeat&&sharing.online&&!location))return notReady();const token=owner,opened=access,seat=actions.seat(),home=homes.find(h=>h.roomKey===seat?.room);
    if(location&&(!online||!fresh||!home))return {ok:false,code:'live_home_required',message:'Join a saved home before sharing its location.'};
    sharing={online,location:online&&location};
    if(!heartbeat){heartbeat=heartbeatFactory({personId:opened.personId,account:{setPresence:(id,input)=>{
      if(!same(token,opened)||id!==opened.personId)return Promise.resolve(changed());
      const current=actions.seat();if(input.online&&input.homeId&&!homes.some(h=>h.id===input.homeId&&h.roomKey===current?.room)){sharing={...sharing,location:false};return opened.setPresence({online:true});}
      return opened.setPresence(input.online&&input.homeId?{...input,room:current?.room,playerId:current?.playerId}:input);
    }},onStatus:status=>{if(same(token,opened)){presence=status;emit();}}});}
    emit();return heartbeat.setSharing({online,...(location&&home?{homeId:home.id,room:seat.room,playerId:seat.playerId}:{})});
  }
  return {get info(){return info();},identity,load,page,act,retry,cleanup,forget,readPresence,setSharing,
    joinHome(id){identity();const home=fresh&&homes.find(h=>h.id===id);if(home)actions.join(home.roomKey);return !!home;},
    export:()=>({schema:1,friends,blockedPeople,incoming,outgoing,requests:records.map(r=>({at:r.at,request:r.request,status:r.status,result:r.result}))}),
    close(){readEpoch++;loading=false;emit();},
  };
}
