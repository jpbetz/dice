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
import {verifyStaging} from '../tools/staging-account-verify.mjs';

test('staging failure keeps bounded diagnostic detail only in the private journal',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-staging-private-error-')),journal=path.join(dir,'fixture.json');
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));const originalFetch=globalThis.fetch;
  const diagnostic='fixture-only diagnostic '+ 'x'.repeat(5000);
  globalThis.fetch=async()=>{throw new Error(diagnostic);};
  try{await assert.rejects(verifyStaging({phase:'prepare',origin:'https://127.0.0.1:44333',sha:'b'.repeat(40),journal,revision:'fixture-before',allowLoopback:true}),error=>error.message==='Staging fixture verification failed'&&error.stage==='health');}
  finally{globalThis.fetch=originalFetch;}
  const state=JSON.parse(await fs.readFile(journal,'utf8'));
  assert.equal(state.lastFailure.stage,'health');assert.equal(state.lastFailure.cause.name,'Error');assert.equal(state.lastFailure.cause.message,diagnostic.slice(0,4000));assert.ok(state.lastFailure.cause.stack.length<=8000);assert.match(state.lastFailure.cause.stack,/fixture-only diagnostic/);
  assert.equal((await fs.stat(journal)).mode&0o077,0);assert.equal(state.phase,'preparing');
});

test('staging verifier refuses unsafe targets and implicit source retargeting before any network request',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-staging-verifier-guards-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const journal=path.join(dir,'fixture.json'),origin='https://dice-accounts-stage-fixture.run.app',sha='b'.repeat(40);
  const options={phase:'prepare',origin,sha,journal,revision:'fixture-before'};
  for(const bad of ['http://dice-accounts-stage-fixture.run.app','https://dice-production-fixture.run.app',origin+'/',origin+':8123','https://localhost:1234','https://user:pass@dice-accounts-stage-fixture.run.app'])await assert.rejects(verifyStaging({...options,origin:bad}));
  await assert.rejects(verifyStaging({...options,sha:'not-a-reviewed-sha'}));
  await assert.rejects(fs.stat(journal),{code:'ENOENT'});
  const prepared={schema:1,fixture:true,origin,sha,nonce:'a'.repeat(12),phase:'prepared',beforeRevision:'fixture-before',identities:{}};
  await fs.writeFile(journal,JSON.stringify(prepared),{mode:0o600});
  const other='https://dice-accounts-stage-restored.run.app';
  await assert.rejects(verifyStaging({...options,phase:'verify',origin:other,revision:'fixture-after'}));
  await assert.rejects(verifyStaging({...options,phase:'verify',origin:other,restoredFrom:other,revision:'fixture-after'}));
  await assert.rejects(verifyStaging({...options,phase:'verify',origin:other,restoredFrom:'https://dice-accounts-stage-unrelated.run.app',revision:'fixture-after'}));
  assert.deepEqual(JSON.parse(await fs.readFile(journal,'utf8')),prepared,'refusal preserves original source binding');
  await fs.chmod(journal,0o400);await assert.rejects(verifyStaging({...options,phase:'verify',revision:'fixture-after'}),/read-only prepared snapshot/);
});

test('staging verifier uses real HTTPS, private fresh profiles and durable state across an owned restart',{timeout:420000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-staging-verifier-')),cert=path.join(dir,'cert.pem'),key=path.join(dir,'key.pem');
  let backend,proxy;const owned=[];
  async function stop(){if(backend&&backend.exitCode===null){const done=new Promise(r=>backend.once('exit',r));backend.kill('SIGTERM');await done;}}
  t.after(async()=>{for(const child of owned)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await stop();if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}await fs.rm(dir,{recursive:true,force:true});});
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
  const publicKey=execFileSync('openssl',['x509','-pubkey','-noout','-in',cert]);
  const der=execFileSync('openssl',['pkey','-pubin','-outform','DER'],{input:publicKey});
  const spki=crypto.createHash('sha256').update(der).digest('base64');
  const wrapper=path.join(dir,'chrome'),quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  await fs.writeFile(wrapper,'#!/bin/sh\nexec '+quote(findChrome())+' '+quote('--ignore-certificate-errors-spki-list='+spki)+' "$@"\n',{mode:0o700});
  const port=await freePort(),backPort=await freePort();assert.notEqual(port,8123);assert.notEqual(backPort,8123);
  const origin='https://127.0.0.1:'+port,sha='b'.repeat(40),store=path.join(dir,'store'),journal=path.join(dir,'journal','fixture.json');
  proxy=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(req,res)=>{
    const upstream=http.request({hostname:'127.0.0.1',port:backPort,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);res.on('close',()=>upstream.destroy());
  });await new Promise(r=>proxy.listen(port,'127.0.0.1',r));
  const env={K_SERVICE:'',DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:store,DICE_ACCOUNT_ORIGIN:origin,GIT_SHA:sha,DICE_DEV_WRITE:'0'};
  backend=await startServer(backPort,{env});
  const run=async phase=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/staging-verifier-worker.mjs',import.meta.url)),phase,origin,sha,journal,'fixture-revision-'+phase],
      {env:{...process.env,NODE_EXTRA_CA_CERTS:cert,CHROME_BIN:wrapper},stdio:['ignore','pipe','pipe']});owned.push(child);
    let output='',errors='';child.stdout.on('data',chunk=>{output+=chunk;for(const line of String(chunk).trim().split('\n'))if(line)console.log('  '+line);});child.stderr.on('data',chunk=>{errors+=chunk;});
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
    if(result.code!==0)console.log(errors.split('\n').filter(line=>/^\s+at /.test(line)).join('\n'));
    assert.deepEqual(result,{code:0,signal:null},'fixture verifier exits cleanly; only sanitized checks are printed');
    assert.ok(output.includes('"ok":true'));return JSON.parse(await fs.readFile(journal,'utf8'));
  };
  const prepared=await run('prepare');assert.equal(prepared.phase,'prepared');await stop();backend=await startServer(backPort,{env});
  const verified=await run('verify');assert.equal(verified.phase,'verified');assert.equal(verified.afterRevision,'fixture-revision-verify');
  assert.equal((await fs.stat(journal)).mode&0o077,0);assert.equal((await fs.stat(path.dirname(journal))).mode&0o077,0);
  assert.equal(verified.images.length,5);
  for(const image of verified.images)assert.equal((await fs.stat(path.join(path.dirname(journal),image.file))).mode&0o077,0);
  if(process.env.DICE_STAGING_PROOF_DIR){
    const target=path.resolve(process.env.DICE_STAGING_PROOF_DIR);assert.ok(target.startsWith(os.tmpdir()+'/'));
    await fs.mkdir(target,{mode:0o700,recursive:true});assert.equal((await fs.lstat(target)).mode&0o077,0);
    for(const image of verified.images)await fs.copyFile(path.join(path.dirname(journal),image.file),path.join(target,path.basename(image.file)),fs.constants.COPYFILE_EXCL);
  }
});
