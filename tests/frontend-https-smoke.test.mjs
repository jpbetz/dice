/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {freePort,startServer} from './e2e/harness.mjs';
import {findChrome} from './e2e/cdp.mjs';
import {validateOptions,validateStatus,verifyFrontend} from '../tools/frontend-https-smoke.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('../tools/frontend-https-smoke.mjs',import.meta.url));

test('frontend smoke refuses unsafe targets and validates the actual status array',()=>{
  const options={origin:'https://dice-fixture.example',sha:'b'.repeat(40),journal:'/tmp/private-fixture/guard.json'};
  validateOptions(options);
  for(const origin of ['http://dice-fixture.example',options.origin+'/',options.origin+':8123','https://localhost:1234','https://user:pass@dice-fixture.example'])
    assert.throws(()=>validateOptions({...options,origin}));
  assert.throws(()=>validateOptions({...options,allowLocal:true}));
  assert.throws(()=>validateOptions({...options,journal:path.join(root,'fixture.json')}));
  assert.throws(()=>validateOptions({...options,sha:'short'}));
  validateOptions({...options,origin:'https://127.0.0.1:44333',allowLocal:true});
  assert.throws(()=>validateOptions({...options,origin:'http://127.0.0.1:8123',allowLocal:true}));
  const status={enabled:true,available:true,capabilities:['library','homes','people','presence']};
  validateStatus(status,200);
  for(const value of [{...status,available:false},{...status,capabilities:{library:true}},{...status,capabilities:['library']}])
    assert.throws(()=>validateStatus(value,200));
  assert.throws(()=>validateStatus(status,503));
  const checked=execFileSync(process.execPath,[script,'--origin',options.origin,'--sha',options.sha,'--journal',options.journal,'--check'],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(checked),{ok:true,networkRequests:0,runExecuted:false});
});

test('frontend smoke retains a private failure and refuses journal replay',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-frontend-guard-')),journal=path.join(dir,'proof.json');
  const options={origin:'https://dice-fixture.example',sha:'b'.repeat(40),journal};
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('fixture diagnostic');};
  try{
    await assert.rejects(verifyFrontend(options),error=>error.message==='Frontend HTTPS smoke failed'&&error.stage==='health');
    const bytes=await fs.readFile(journal),state=JSON.parse(bytes);
    assert.equal(state.ok,false);assert.equal(state.sourceSha,options.sha);assert.equal(state.origin,options.origin);
    assert.equal(state.lastFailure.cause.message,'fixture diagnostic');assert.equal(state.cleanup.ownedBrowsersClosed,true);
    assert.equal((await fs.stat(journal)).mode&0o077,0);
    await assert.rejects(verifyFrontend(options),{code:'EEXIST'});
    assert.deepEqual(await fs.readFile(journal),bytes);assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});

test('frontend smoke proves the candidate over owned HTTPS without account writes',{timeout:180000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-frontend-https-'));
  console.log('  Retained local frontend proof directory: '+dir);
  const cert=path.join(dir,'cert.pem'),key=path.join(dir,'key.pem');
  let backend,proxy,child;
  t.after(async()=>{
    if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('close',r));child.kill('SIGTERM');await done;}
    if(backend&&backend.exitCode===null){const done=new Promise(r=>backend.once('exit',r));backend.kill('SIGTERM');await done;}
    if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  });
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
  const publicKey=execFileSync('openssl',['x509','-pubkey','-noout','-in',cert]);
  const der=execFileSync('openssl',['pkey','-pubin','-outform','DER'],{input:publicKey});
  const spki=crypto.createHash('sha256').update(der).digest('base64');
  const wrapper=path.join(dir,'chrome'),quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  await fs.writeFile(wrapper,'#!/bin/sh\nexec '+quote(findChrome())+' '+quote('--ignore-certificate-errors-spki-list='+spki)+' "$@"\n',{mode:0o700});
  const port=await freePort(),backPort=await freePort();assert.notEqual(port,8123);assert.notEqual(backPort,8123);
  const origin='https://127.0.0.1:'+port,appRoot=process.env.DICE_FRONTEND_APP_ROOT||root;
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:appRoot,encoding:'utf8'}).trim();
  const store=path.join(dir,'store'),journal=path.join(dir,'proof.json'),accountWrites=[];
  proxy=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(req,res)=>{
    if(req.url.startsWith('/api/account/')&&!['GET','HEAD'].includes(req.method)){
      accountWrites.push({method:req.method,path:req.url});res.writeHead(405);res.end();return;
    }
    const upstream=http.request({hostname:'127.0.0.1',port:backPort,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);res.on('close',()=>upstream.destroy());
  });await new Promise(r=>proxy.listen(port,'127.0.0.1',r));
  backend=await startServer(backPort,{root:appRoot,env:{K_SERVICE:'',DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:store,DICE_ACCOUNT_ORIGIN:origin,GIT_SHA:sha,DICE_DEV_WRITE:'0'}});
  child=spawn(process.execPath,[script,'--origin',origin,'--sha',sha,'--journal',journal,'--local','--run'],
    {env:{...process.env,NODE_EXTRA_CA_CERTS:cert,CHROME_BIN:wrapper},stdio:['ignore','pipe','pipe']});
  let output='',errors='';
  child.stdout.on('data',chunk=>{output+=chunk;for(const line of String(chunk).trim().split('\n'))if(line)console.log('  '+line);});
  child.stderr.on('data',chunk=>{errors+=chunk;});
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  await fs.writeFile(path.join(dir,'stdout.txt'),output,{flag:'wx',mode:0o600});await fs.writeFile(path.join(dir,'stderr.txt'),errors,{flag:'wx',mode:0o600});
  assert.deepEqual(result,{code:0,signal:null},'private proof.json retains any diagnostic failure');
  const proof=JSON.parse(await fs.readFile(journal,'utf8'));
  assert.equal(proof.ok,true);assert.equal(proof.phase,'complete');assert.equal(proof.sourceSha,sha);assert.equal(proof.origin,origin);
  assert.equal(proof.checks.length,5);assert.equal(proof.images.length,5);assert.equal(proof.cleanup.ownedBrowsersClosed,true);
  assert.deepEqual(proof.accountMutations,[]);assert.deepEqual(accountWrites,[]);
  const files=await fs.readdir(store);assert.deepEqual(files.filter(name=>name.endsWith('.json')),[],'read-only account checks created no stored account data');
  for(const image of proof.images)assert.equal((await fs.stat(path.join(dir,image.file))).mode&0o077,0);
});
