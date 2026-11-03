import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('Senate and House APIs return scheduled race inventories when upstream providers fail',async()=>{
 const port=35000+(process.pid%10000);
 const server=spawn(process.execPath,['--import','./test/mock-upstream.mjs','server.mjs'],{
  cwd:new URL('..',import.meta.url),
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},
  stdio:['ignore','pipe','pipe']
 });
 let logs='';
 server.stderr.on('data',chunk=>{logs+=String(chunk)});
 server.stdout.on('data',chunk=>{logs+=String(chunk)});
 async function api(path){
  const response=await fetch(`http://127.0.0.1:${port}${path}`);
  assert.equal(response.status,200,`${path}: HTTP ${response.status}; ${logs}`);
  return response.json();
 }
 try {
  let started=false;
  for(let attempt=0;attempt<60;attempt++){
   if(server.exitCode!==null)throw Error('Server terminated: '+logs);
   try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);started=r.ok;if(started)break}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(started,'Local server did not start: '+logs);
  const senate=await api('/api/national?office=senate');
  assert.equal(senate.office,'senate');
  assert.equal(senate.races.length,35);
  assert.ok(senate.races.every(r=>r.office==='senate' && r.state && r.id));
  assert.ok(new Set(senate.races.map(r=>r.state)).size>=30);
  assert.equal(senate.reported,0);
  assert.ok(Array.isArray(senate.sources));
  const house=await api('/api/national?office=house');
  assert.equal(house.office,'house');
  assert.equal(house.races.length,435);
  assert.ok(house.races.every(r=>r.office==='house'));
 }finally{server.kill('SIGTERM')}
});
