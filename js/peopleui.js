/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {createSocialSession} from './social-session.js';
import {generateContactCode} from './account.js';
import {homeCover} from './home-covers.js';
export function createPeopleWorkspace(actions){
  const el=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const button=(label,id,fn)=>{
    const b=el('button','btn',label);
    b.type='button';
    if(id)b.id=id;
    b.addEventListener('click',fn);
    return b;
  };
  const row=()=>el('div','social-actions');
  const root=el('section','people-workspace');
  root.id='people-workspace';
  const top=row(),refresh=button('↻','people-refresh',()=>run(()=>reload())),download=button('Download People data','people-export',()=>saveFile(session.export(),'people.json'));
  refresh.setAttribute('aria-label','Refresh People');refresh.title='Refresh';
  const options=el('details','social-options'),optionsTitle=el('summary','','⋯');
  optionsTitle.id='people-options';optionsTitle.setAttribute('aria-label','People options');optionsTitle.title='People options';
  const optionsBody=el('div','social-options-body');options.append(optionsTitle,optionsBody);
  top.append(refresh,options);
  const account=button('Sign in or recover an account','people-account',actions.account),status=el('p','hint');
  status.id='people-status';
  status.setAttribute('role','status');
  const nav=row(),sections={},tabs={};
  nav.classList.add('social-nav');
  for(const [key,label] of [['table','At table'],['friends','Friends'],['invitations','Invitations']]){
    tabs[key]=button(label,'people-tab-'+key,()=>open(key));
    nav.append(tabs[key]);
    sections[key]=el('section','social-section');
    sections[key].id='people-'+key;
  }
  sections.presence=el('section','social-section');sections.presence.id='people-presence';
  tabs.presence=button('Presence & privacy','people-tab-presence',()=>{options.open=false;open('presence');});
  optionsBody.append(tabs.presence,download);
  const navigation=el('div','social-navigation');navigation.append(nav,top);
  root.append(account,navigation,status,...Object.values(sections));
  const friendsHead=row(),add=button('Add a friend','people-add',()=>{
    requestForm.hidden=false;
    if(!requestForm.hidden)requestCode.focus();
  }),codeNew=button('New contact code','people-code-new',()=>run(()=>session.act('contact-code',{code:generateContactCode()})));
  friendsHead.classList.add('social-list-head');friendsHead.append(el('h3','','Friends'),add);
  const codePanel=el('details','social-code'),codeSummary=el('summary','','Contact code'),codeLabel=el('label','','Your contact code'),ownCode=el('textarea');
  ownCode.id='people-own-code';
  ownCode.readOnly=true;
  ownCode.rows=2;
  codeLabel.append(ownCode);
  const codeActions=row(),copyCode=button('Copy code','people-code-copy',async()=>{
    try{
      await navigator.clipboard.writeText(ownCode.value);
      message='Contact code copied.';
    } catch{
      ownCode.focus();
      ownCode.select();
      message='Select and copy the contact code.';
    }
    paint();
  }),revokeCode=button('Revoke code','people-code-revoke',()=>run(()=>session.act('contact-code',{code:null})));
  codeActions.append(copyCode,revokeCode);
  const codeNote=el('p','hint','A new code replaces the previous code. Sharing it allows a friend request.');
  codePanel.append(codeSummary,codeLabel,codeActions,codeNote);
  const requestForm=el('form','social-form');
  requestForm.id='people-request-form';
  requestForm.hidden=true;
  const requestLabel=el('label','','Contact code'),requestCode=el('textarea');
  requestCode.id='people-contact-code';
  requestCode.rows=2;
  requestCode.maxLength=47;
  requestCode.autocomplete='off';
  requestCode.spellcheck=false;
  requestLabel.append(requestCode);
  const requestSubmit=el('button','btn','Send friend request');
  requestSubmit.id='people-request-send';
  requestSubmit.type='submit';
  const requestHead=row(),requestTitle=el('h4','','Add a friend'),requestClose=button('×','people-request-close',()=>{requestForm.hidden=true;add.focus();});
  requestClose.setAttribute('aria-label','Close add friend');requestHead.classList.add('social-form-head');requestHead.append(requestTitle,requestClose);
  requestForm.append(requestHead,requestLabel,requestSubmit,codeNew,codePanel);
  requestForm.addEventListener('submit',event=>{
    event.preventDefault();
    run(async()=>{
      const owner=session.info.owner,result=await session.act('friend-request',{code:requestCode.value.trim()});
      if(result.ok&&owner===session.info.owner){
        requestCode.value='';
        requestForm.hidden=true;
        message='Friend request sent.';
      }
      return result;
    });
  });
  const friendList=el('div','social-list');
  friendList.id='people-friend-list';
  const blocked=el('section','social-blocked'),blockedSummary=el('h3','','Blocked accounts'),blockedList=el('div','social-list');
  blockedList.id='people-blocked-list';
  const blockedMore=button('More blocked accounts','people-blocked-more',()=>run(()=>session.page('blocked')));
  blocked.append(blockedSummary,blockedList,blockedMore);
  sections.blocked=blocked;
  tabs.blocked=button('Blocked accounts','people-tab-blocked',()=>{options.open=false;open('blocked');});
  optionsBody.insertBefore(tabs.blocked,download);root.append(blocked);
  const inviteForm=el('form','social-form');
  inviteForm.id='people-invite-form';
  inviteForm.hidden=true;
  const inviteTitle=el('h4'),homeLabel=el('label','','Table'),homeSelect=el('select');
  homeSelect.id='people-invite-home';
  homeLabel.append(homeSelect);
  const inviteSubmit=el('button','btn','Send invitation');
  inviteSubmit.type='submit';
  inviteSubmit.id='people-invite-send';
  const saveHome=button('Save this table…','people-save-home',()=>{
    const target=inviteTarget;
    if(!target||target.owner!==session.info.owner)return;
    void run(()=>actions.saveTable?.(target.name,home=>{
      if(target.owner!==session.info.owner)return;
      target.homeId=home.id;inviteTarget=target;inviteForm.hidden=false;
      tab='friends';homeSignature='';paint();
    }));
  });
  const inviteNote=el('p','hint');inviteNote.id='people-invite-note';
  const inviteHead=row(),inviteClose=button('×','people-invite-close',()=>{
    const target=inviteTarget;inviteForm.hidden=true;inviteTarget=null;paint();
    if(target)friendList.querySelector(`[data-social-focus="invite:${CSS.escape(target.id)}"]`)?.focus({preventScroll:true});
  });
  inviteHead.classList.add('social-form-head');inviteClose.setAttribute('aria-label','Close invitation');inviteHead.append(inviteTitle,inviteClose);
  inviteForm.append(inviteHead,homeLabel,inviteNote,inviteSubmit,saveHome);
  homeSelect.addEventListener('change',()=>{if(inviteTarget)inviteTarget.homeId=homeSelect.value;paint();});
  inviteForm.addEventListener('submit',event=>{
    event.preventDefault();
    if(!inviteTarget||inviteTarget.owner!==session.info.owner||!homeSelect.value)return;
    const selected=inviteTarget;
    run(async()=>{
      const result=await session.act('invite-home',{toPersonId:selected.id,homeId:homeSelect.value});
      if(result.ok&&selected.owner===session.info.owner){
        inviteForm.hidden=true;
        inviteTarget=null;
        message='Invitation sent to '+selected.name+'.';
      }
      return result;
    });
  });
  const confirmation=el('section','social-form');
  confirmation.id='people-confirmation';
  confirmation.hidden=true;
  const confirmationText=el('p'),confirmAckLabel=el('label','social-check'),confirmAck=el('input');
  confirmAck.type='checkbox';
  confirmAck.id='people-confirm-ack';
  confirmAckLabel.append(confirmAck,document.createTextNode('Confirm this change.'));
  const confirmButton=button('Confirm','people-confirm',()=>{
    if(!confirmAck.checked||confirmIntent?.owner!==session.info.owner)return;
    const intent=confirmIntent;
    run(async()=>{
      const result=await session.act(intent.kind,intent.input,intent.id);
      if(result.ok&&intent.owner===session.info.owner){
        confirmation.hidden=true;
        confirmIntent=null;
        message='Connection updated.';
      }
      return result;
    });
  });
  confirmButton.disabled=true;
  confirmAck.addEventListener('change',()=>{
    confirmButton.disabled=busy||!confirmAck.checked;
  });
  confirmation.append(confirmationText,confirmAckLabel,confirmButton);
  sections.friends.append(friendsHead,requestForm,inviteForm,confirmation,friendList);
  const inboxNav=row(),incomingTab=button('Incoming','people-incoming',()=>{
    if(direction!=='incoming')visit++;
    direction='incoming';
    paint();
  }),outgoingTab=button('Sent','people-outgoing',()=>{
    if(direction!=='outgoing')visit++;
    direction='outgoing';
    paint();
  });
  inboxNav.append(incomingTab,outgoingTab);
  const inbox=el('div','social-list');
  inbox.id='people-inbox';
  const more=button('More invitations','people-inbox-more',()=>run(()=>session.page(direction)));
  sections.invitations.append(inboxNav,inbox,more);
  const onlineLabel=el('label','social-check'),online=el('input');
  online.type='checkbox';
  online.id='people-share-online';
  onlineLabel.append(online,document.createTextNode('Share my online status with friends'));
  const locationLabel=el('label','social-check'),location=el('input');
  location.type='checkbox';
  location.id='people-share-home';
  const locationText=document.createTextNode('Share my saved-home location');
  locationLabel.append(location,locationText);
  online.addEventListener('change',()=>{
    const choice={online:online.checked,location:online.checked&&location.checked};
    void run(()=>session.setSharing(choice));
  });
  location.addEventListener('change',()=>{
    const choice={online:online.checked,location:location.checked};
    void run(()=>session.setSharing(choice));
  });
  const presenceStatus=el('p','hint');
  presenceStatus.id='people-presence-status';
  const signals=el('div','social-list');
  signals.id='people-presence-list';
  const homePresenceTitle=el('h4','','Members sharing this home'),homeSignals=el('div','social-list');
  homeSignals.id='people-home-presence';
  sections.presence.append(onlineLabel,locationLabel,presenceStatus,signals,homePresenceTitle,homeSignals);
  const kept=el('section','social-kept');
  kept.id='people-kept';
  root.append(kept);
  let tab='friends',direction='incoming',identity=null,busy=false,mounted=false,queued=false,timer=null,expiryTimer=null,message='',inviteTarget=null,confirmIntent=null,visit=0;
  let friendSignature='',blockedSignature='',inboxSignature='',keptSignature='',homeSignature='';
  const session=createSocialSession({...actions,changed:paint});
  function saveFile(value,name){
    actions.download(JSON.stringify(value,null,2),name);
  }
  function keyed(node,key){
    node.dataset.socialFocus=key;
    return node;
  }
  function replace(host,build){
    const key=host.contains(document.activeElement)?document.activeElement.dataset.socialFocus:null;
    host.replaceChildren();
    build();
    if(key)host.querySelector(`[data-social-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  }
  function cover(host,value){
    const box=el('div','social-home-cover');
    box.append(el('span','',value.name));
    host.append(box);
    homeCover(value.cover).then(url=>{
      if(!url||!box.isConnected)return;
      const img=el('img');
      img.alt='';
      img.src=url;
      box.replaceChildren(img);
      box.classList.add('has-image');
    });
  }
  async function reload(){
    const result=await session.load();
    if(result.ok)await session.readPresence();
    return result;
  }
  async function run(fn){
    if(busy)return;
    const owner=session.info.owner;
    busy=true;
    paint();
    try{
      const result=await fn();
      if(result&&!result.ok&&owner===session.info.owner)message=result.message||'Request unconfirmed. Retry the kept action.';
      return result;
    } catch{
      if(owner===session.info.owner)message='Request unconfirmed. Retry the kept action.';
      return {ok:false};
    } finally{
      busy=false;
      paint();
      actions.inboxChanged?.(session.info);
      if(queued&&mounted){
        queued=false;
        void run(reload);
      }
      schedule();
    }
  }
  function schedule(){
    clearTimeout(timer);
    timer=null;
    if(!mounted)return;
    timer=setTimeout(()=>{
      timer=null;
      if(document.hidden||busy){
        schedule();
        return;
      }
      void reload().finally(schedule);
    },30000);
  }
  function open(key){
    if(tab!==key)visit++;
    tab=key;
    confirmation.hidden=true;
    confirmIntent=null;
    paint();
  }
  function confirm(kind,person,input={}){
    for(const menu of root.querySelectorAll('.social-friend-options'))menu.open=false;
    open('friends');
    confirmIntent={owner:session.info.owner,kind,id:person.id,input};
    confirmation.hidden=false;
    confirmAck.checked=false;
    confirmationText.textContent=`${kind==='remove-friend'?'Remove':'Block'} ${person.displayName}? Invitations and presence will stop. Saved-home membership stays unchanged.`;
    confirmButton.disabled=true;
    confirmation.scrollIntoView({block:'nearest'});
  }
  function invite(person){
    const home=session.info.homes.find(h=>h.roomKey===actions.seat()?.room);
    inviteTarget={owner:session.info.owner,id:person.id,name:person.displayName,homeId:home?.id||''};
    inviteTitle.textContent='Invite '+person.displayName;
    inviteForm.hidden=false;
    paint();
    inviteForm.scrollIntoView({block:'nearest'});
    homeSelect.focus();
  }
  function renderFriends(info,enabled){
    const fs=JSON.stringify([info.friends,info.outgoing,actions.seat()?.room]);
    if(fs!==friendSignature){
      friendSignature=fs;
      replace(friendList,()=>{
        if(!info.friends.length)friendList.append(el('p','hint','No friends.'));
        for(const person of info.friends){
          const card=el('article','social-card social-friend');
          card.dataset.personId=person.id;
          card.append(el('h4','',person.displayName));
          const controls=row();
          const send=keyed(button('Invite',null,()=>invite(person)),'invite:'+person.id);
          const remove=keyed(button('Remove friend',null,()=>confirm('remove-friend',person)),'remove:'+person.id);
          const block=keyed(button('Block',null,()=>confirm('block-person',person,{blocked:true})),'block:'+person.id);
          for(const b of [send,remove,block])b.disabled=!enabled;
          const menu=el('details','social-friend-options'),summary=el('summary','','⋯'),choices=row();
          summary.setAttribute('aria-label','Options for '+person.displayName);choices.append(remove,block);menu.append(summary,choices);
          controls.append(send,menu);
          card.append(controls);
          friendList.append(card);
        }
      });
    }
    const bs=JSON.stringify(info.blockedPeople);
    if(bs!==blockedSignature){
      blockedSignature=bs;
      replace(blockedList,()=>{
        if(!info.blockedPeople.length)blockedList.append(el('p','hint','No blocked accounts.'));
        for(const person of info.blockedPeople){
          const card=el('article','social-card');
          card.append(el('h4','',person.displayName));
          const unblock=keyed(button('Unblock',null,()=>run(()=>session.act('block-person',{blocked:false},person.id))),'unblock:'+person.id);
          unblock.disabled=!enabled;
          card.append(unblock);
          blockedList.append(card);
        }
      });
    }
    blockedMore.hidden=!info.blockedNext;
    blockedMore.disabled=!enabled;
  }

  function renderInbox(info,enabled){
    incomingTab.setAttribute('aria-pressed',String(direction==='incoming'));
    outgoingTab.setAttribute('aria-pressed',String(direction==='outgoing'));
    const pending=item=>item.state==='pending'&&item.expiresAt>Date.now();
    const invitations=[...info[direction]].sort((a,b)=>Number(pending(b))-Number(pending(a))
      ||(b.createdAt||0)-(a.createdAt||0));
    const is=JSON.stringify([direction,invitations.map(item=>({...item,state:item.state==='pending'&&item.expiresAt<=Date.now()?'expired':item.state})),info.homes]);
    if(is!==inboxSignature){
      inboxSignature=is;
      replace(inbox,()=>{
        if(!invitations.length)inbox.append(el('p','hint','No invitations.'));
        for(const item of invitations){
          const card=el('article','social-card');
          card.dataset.invitationId=item.id;
          const state=item.state==='pending'&&item.expiresAt<=Date.now()?'expired':item.state;
          if(item.home)cover(card,item.home);
          card.append(el('h4','',item.home?item.home.name:item.otherPerson.displayName),el('p','hint',`${direction==='incoming'?'From':'To'} ${item.otherPerson.displayName} · ${state}`));
          const controls=row();
          const action=(label,kind,input={})=>{
            const b=keyed(button(label,null,()=>run(()=>session.act(kind,input,item.id))),kind+':'+item.id+(input.choice?':'+input.choice:''));
            b.disabled=!enabled;
            controls.append(b);
          };
          if(state==='pending'){
            if(direction==='incoming'){
              if(item.home){
                const join=keyed(button('Accept and join',null,()=>{
                  const owner=session.info.owner,opened=visit;
                  run(async()=>{
                    const result=await session.act('respond-invitation',{choice:'accept'},item.id);
                    // Acceptance is durable; navigation belongs only to the
                    // visit that requested it, never a later reopened task.
                    if(result.ok&&owner===session.info.owner&&mounted&&opened===visit){
                      if(!session.joinHome(item.home.id))message='Invitation accepted. Refresh to join the table.';
                    }
                    return result;
                  });
                }),'accept-join:'+item.id);
                join.classList.add('social-primary');controls.append(join);
              }
              action(item.home?'Accept for later':'Accept','respond-invitation',{choice:'accept'});
              action('Decline','respond-invitation',{choice:'decline'});
              const menu=el('details','social-friend-options'),summary=el('summary','','⋯'),choices=row();
              summary.setAttribute('aria-label','Invitation options');
              const block=button('Block account',null,()=>confirm('block-person',item.otherPerson,{blocked:true}));
              block.disabled=!enabled;
              choices.append(block);menu.append(summary,choices);controls.append(menu);
            } else action('Cancel','cancel-invitation');
          }
          else{
            if(state==='accepted'&&item.home&&info.homes.some(h=>h.id===item.home.id))controls.append(keyed(button('Join now',null,()=>session.joinHome(item.home.id)),'join:'+item.id));
            action('Archive','archive-invitation');
          }
          card.append(controls);
          inbox.append(card);
        }
      });
    }
    for(const host of [friendList,blockedList,inbox])for(const control of host.querySelectorAll('button'))control.disabled=!enabled;
    more.hidden=!info.next[direction];
    more.disabled=!enabled;
  }

  function renderPresence(info){
    online.checked=info.sharing.online;
    location.checked=info.sharing.location;
    online.disabled=busy||(!info.sharing.online&&(!info.available||!info.capabilities.includes('presence')));
    const home=info.homes.find(h=>h.roomKey===actions.seat()?.room);
    locationText.textContent=home?'Share that I am at '+home.name:'Share my saved-home location';
    location.disabled=busy||!info.sharing.online||(!info.sharing.location&&(!info.fresh||!home));
    if(info.presence.state==='unknown')presenceStatus.textContent='Presence status unknown.';
    else if(!info.sharing.online)presenceStatus.textContent='Online sharing off.';
    else presenceStatus.textContent=info.presence.state==='sharing'&&info.presence.expiresAt>Date.now()
      ?'Sharing online status.':'Online sharing is awaiting confirmation.';
    signals.replaceChildren();
    for(const person of info.friends){
      const signal=info.signals.find(s=>s.person.id===person.id),online=signal?.state==='online'&&signal.expiresAt>Date.now();
      signals.append(el('p','',person.displayName+' · '+(online?'Online':'Unknown')));
    }
    homePresenceTitle.hidden=!home;
    homeSignals.hidden=!home;
    homeSignals.replaceChildren();
    for(const signal of info.homeSignals)if(signal.state==='online'&&signal.expiresAt>Date.now())homeSignals.append(el('p','',signal.person.displayName));
    if(home&&!homeSignals.children.length){
      const known=info.homePresence.state==='known'&&info.homePresence.homeId===home.id&&info.homePresence.checkedAt+90000>Date.now()&&!info.homeSignals.some(s=>s.expiresAt<=Date.now());
      homeSignals.append(el('p','hint',known?'No members sharing this home.':'Unknown.'));
    }
  }

  function renderKept(info){
    const ks=JSON.stringify([info.records,info.generation]);
    if(ks!==keptSignature){
      keptSignature=ks;
      kept.replaceChildren();
      if(info.records.length){
        const details=el('details');
        details.open=info.records.some(r=>r.status!=='saved');
        details.append(el('summary','',`Kept device requests (${info.records.length})`),el('p','hint','Downloads include any contact codes in kept requests.'));
        kept.append(details);
        for(const record of info.records){
          const card=el('div','social-kept-row');
          card.dataset.operation=record.id;
          card.append(el('span','',record.request.kind.replaceAll('-',' ')+' · '+(record.volatile?'device save unconfirmed':record.status==='saved'?'confirmed':record.status==='refused'?'refused':'confirmation needed')));
          let proposal=null;
          const abandon=el('div','social-abandon'),label=el('label','social-check'),ack=el('input');
          ack.type='checkbox';
          label.append(ack,document.createTextNode('I downloaded this refused request and no longer need its device retry.'));
          const remove=button('Abandon refused device copy',null,()=>{
            if(ack.checked&&proposal)run(()=>session.forget(proposal,{downloaded:true,acknowledged:true}));
          });
          remove.disabled=true;
          ack.addEventListener('change',()=>{
            remove.disabled=!ack.checked;
          });
          abandon.hidden=true;
          abandon.append(label,remove);
          card.append(button('Download',null,()=>{
            proposal=session.cleanup([record.id]);
            if(proposal){
              saveFile(proposal.data,'people-request.json');
              if(record.status==='refused')abandon.hidden=false;
            }
          }));
          if(record.status!=='saved')card.append(button('Retry exact request',null,()=>run(()=>session.retry(record.id))));
          if(record.status==='refused')card.append(abandon);
          details.append(card);
        }
        const confirmed=info.records.filter(r=>r.status==='saved');
        if(confirmed.length){
          const label=el('label','social-check'),ack=el('input');
          ack.type='checkbox';
          label.append(ack,document.createTextNode('Remove confirmed device receipts. Invitations in the service stay unchanged.'));
          const clear=button('Remove confirmed device receipts','people-clear-confirmed',()=>{
            const proposal=session.cleanup(confirmed.map(r=>r.id));
            if(ack.checked&&proposal)run(()=>session.forget(proposal,{acknowledged:true}));
          });
          clear.disabled=true;
          ack.addEventListener('change',()=>{
            clear.disabled=!ack.checked;
          });
          details.append(label,clear);
        }
      }
    }
  }

  function paint(info=session.info){
    clearTimeout(expiryTimer);
    expiryTimer=null;
    if(mounted){
      const now=Date.now();
      const expiries=[
        info.presence.expiresAt,
        ...info.signals.map(s=>s.expiresAt),
        ...info.homeSignals.map(s=>s.expiresAt),
        ...info.incoming.filter(i=>i.state==='pending').map(i=>i.expiresAt),
        ...info.outgoing.filter(i=>i.state==='pending').map(i=>i.expiresAt),
        info.homePresence.checkedAt?info.homePresence.checkedAt+90000:null,
      ].filter(at=>Number.isFinite(at)&&at>now);
      if(expiries.length)expiryTimer=setTimeout(()=>paint(),Math.min(...expiries)-now+1);
    }
    if(identity!==info.owner){
      identity=info.owner;
      message='';
      requestCode.value='';
      ownCode.value='';
      codePanel.open=false;
      requestForm.hidden=true;
      inviteForm.hidden=true;
      confirmation.hidden=true;
      inviteTarget=confirmIntent=null;
      friendSignature=blockedSignature=inboxSignature=keptSignature=homeSignature='';
    }
    const signed=!!info.owner,enabled=signed&&info.available&&info.fresh&&!busy;
    account.hidden=signed;
    navigation.hidden=!signed;
    actions.layout?.(tab,signed);
    status.textContent=info.error?.message||message||(info.loading?'Loading People…':'');
    status.hidden=!status.textContent;
    for(const [key,section] of Object.entries(sections)){
      section.hidden=!signed||key!==tab;
      tabs[key].setAttribute('aria-pressed',String(key===tab));
    }
    refresh.disabled=busy;
    download.disabled=busy;
    for(const b of [add,codeNew,revokeCode,requestSubmit,inviteSubmit])b.disabled=!enabled;
    homeSelect.disabled=busy;
    requestCode.disabled=busy;
    const pending=info.incoming.filter(i=>i.state==='pending'&&i.expiresAt>Date.now()).length;
    tabs.invitations.textContent='Invitations';
    if(pending){const badge=el('span','workspace-badge',pending>9?'9+':String(pending));badge.setAttribute('aria-hidden','true');tabs.invitations.append(badge);}
    tabs.invitations.setAttribute('aria-label',pending?`Invitations, ${pending}${info.next.incoming?' or more':''} pending`:'Invitations');
    codePanel.hidden=!info.contactCode?.enabled&&!info.ownCode;
    codeLabel.hidden=!info.ownCode;
    copyCode.hidden=!info.ownCode;
    if(ownCode.value!==(info.ownCode?.code||''))codePanel.open=!!info.ownCode;
    ownCode.value=info.ownCode?.code||'';
    copyCode.disabled=busy;
    const room=actions.seat()?.room,current=info.homes.find(h=>h.roomKey===room),guestHome=!current&&actions.tableSaved?.();
    const hs=JSON.stringify([info.homes,room,inviteTarget?.homeId,guestHome]);
    if(hs!==homeSignature){
      homeSignature=hs;
      homeSelect.replaceChildren();
      if(!current){
        const option=el('option','',room?`${actions.tableName?.()||'Current table'} · ${guestHome?'guest':'not saved'}`:'Choose a saved table');
        option.value='';homeSelect.append(option);
      }
      for(const h of [...info.homes].sort((a,b)=>Number(b.id===current?.id)-Number(a.id===current?.id))){
        const option=el('option','',h.name+(h.id===current?.id?' · current table':''));
        option.value=h.id;
        homeSelect.append(option);
      }
      homeSelect.value=inviteTarget?.homeId||current?.id||'';
    }
    homeLabel.hidden=false;
    inviteSubmit.hidden=!homeSelect.value;
    saveHome.hidden=!!homeSelect.value||!room||guestHome;
    saveHome.disabled=!enabled;
    inviteNote.hidden=!!homeSelect.value;
    inviteNote.textContent=guestHome?'Only members of this saved table can send invitations. Use Invite by link under At table.'
      :room?'Save this table before inviting a friend. They can return to it from Tables.':'Choose a saved table to send an invitation.';
    confirmButton.disabled=busy||!info.fresh||!confirmAck.checked;
    friendsHead.hidden=friendList.hidden=!inviteForm.hidden;
    if(!inviteForm.hidden)requestForm.hidden=true;
    renderFriends(info,enabled);
    renderInbox(info,enabled);
    renderPresence(info);
    renderKept(info);
  }
  document.addEventListener('visibilitychange',()=>{
    if(mounted)paint();
  });
  return {session,get info(){
    return session.info;
  },mount(host){
    mounted=true;
    const opened=++visit;
    host.append(root);
    session.identity();
    paint();
    if(busy){
      queued=true;
      return;
    }
    return run(reload).then(()=>{
      if(!mounted||opened!==visit)return;
      if(inviteTarget){tab='friends';inviteForm.hidden=false;}
      else if(session.info.incoming.some(i=>i.state==='pending'&&i.expiresAt>Date.now())){tab='invitations';direction='incoming';}
      paint();
    });
  },identityChanged(){
    const previous=session.info.owner;
    session.identity();
    paint();
    if(mounted&&session.info.owner!==previous&&session.info.owner){
      if(busy)queued=true;
      else void run(reload);
    }
  },close(){
    mounted=false;
    visit++;
    queued=false;
    clearTimeout(timer);
    clearTimeout(expiryTimer);
    timer=expiryTimer=null;
    session.close();
  },open};
}
