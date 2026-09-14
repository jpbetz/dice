/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {verifyStaging} from '../../tools/staging-account-verify.mjs';
const [phase,origin,sha,journal,revision]=process.argv.slice(2);
try{console.log(JSON.stringify(await verifyStaging({phase,origin,sha,journal,revision,allowLoopback:true,
  checkpoint:check=>console.log(JSON.stringify({check}))})));}
catch(error){console.log(JSON.stringify({ok:false,stage:error.stage||'configuration'}));console.error(error.cause?.stack?.split('\n').filter(line=>/^\s+at /.test(line)).join('\n')||'');process.exitCode=1;}
