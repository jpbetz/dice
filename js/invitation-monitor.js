/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// A small inbox check for signed-in, visible tabs. It carries only a count to
// navigation; account names, invitations and journals stay in People.
export function createInvitationMonitor({access,changed,visible=()=>!document.hidden},
  {now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,interval=30000}={}){
  let owner=null,opened=null,revision=0,poll=null,expiry=null,items=[],count=0;
  function paint(){
    clearTimer(expiry);expiry=null;
    const pending=items.filter(item=>item.state==='pending'&&item.expiresAt>now());
    const next=pending.length;
    if(next!==count){count=next;changed(count);}
    if(pending.length)expiry=setTimer(paint,Math.min(...pending.map(i=>i.expiresAt))-now()+1);
  }
  function schedule(){
    clearTimer(poll);poll=null;
    if(opened&&visible())poll=setTimer(()=>{void refresh();},interval);
  }
  function identity(start=true){
    const current=access(),key=current?`${current.personId}:${current.epoch}`:null;
    if(key===owner){opened=current;return;}
    owner=key;opened=current;revision++;items=[];paint();
    clearTimer(poll);poll=null;
    if(start&&opened&&visible())void refresh();
  }
  async function refresh(){
    identity(false);clearTimer(poll);poll=null;
    if(!opened||!visible())return;
    const fixed=opened,token=owner,read=++revision,all=[],cursors=new Set();
    const same=()=>{identity(false);return read===revision&&token===owner&&fixed===opened;};
    try{
      let after;
      do{
        const result=await fixed.invitations({direction:'incoming',...(after?{after}:{})});
        if(!same())return;
        if(!result.ok)throw new Error('Inbox unavailable');
        all.push(...result.invitations);
        after=result.next;
        if(after&&cursors.has(after))throw new Error('Repeated inbox page');
        if(after)cursors.add(after);
      }while(after);
      items=all;paint();
    }catch{
      if(same()){items=[];paint();}
    }finally{if(same())schedule();}
  }
  return {identity,refresh,
    update(info){
      identity(false);
      if(!opened||info.owner!==owner||!info.fresh)return;
      // A full People read supersedes a pre-action background response.
      revision++;
      if(info.next.incoming){void refresh();return;}
      items=info.incoming;paint();schedule();
    },
    visibilityChanged(){revision++;clearTimer(poll);poll=null;paint();if(visible())void refresh();},
    close(){revision++;clearTimer(poll);clearTimer(expiry);poll=expiry=null;items=[];opened=null;owner=null;paint();},
    get count(){return count;},
  };
}
