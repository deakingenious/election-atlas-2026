import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('Federal photo enrichment is optional and never hides House/Senate inventories',async()=>{
 const port=36000+process.pid%10000;
 const child=spawn(process.execPath,['--import','./test/mock-portrait-provider.mjs','server.mjs'],{
  cwd:new URL('..',import.meta.url),
  env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},
  stdio:['ignore','pipe','pipe']
 });
 let logs='';child.stdout.on('data',x=>logs+=String(x));child.stderr.on('data',x=>logs+=String(x));
 const base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;
  for(let i=0;i<50;i++){
   try{ready=(await fetch(base+'/api/health')).ok;if(ready)break}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'server never started: '+logs);
  const lookups=[{name:'Candidate One',state:'CA',office:'house',district:'31'},{name:'Candidate Two',state:'CA',office:'house',district:'31'}];
  const response=await fetch(base+'/api/portrait-enrichment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.requested,2);
  assert.equal(body.matched,1);
  assert.equal(Object.keys(body.portraits).length,1);
  assert.equal(body.portraits['house|CA|31|CANDIDATEONE'].credit,'House photography');
  assert.equal(body.portraits['house|CA|31|CANDIDATETWO'],undefined);
  const again=await fetch(base+'/api/portrait-enrichment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups})});
  assert.equal((await again.json()).matched,1);
  const bad=await fetch(base+'/api/portrait-enrichment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups:[{name:'Unvalid Candidate',office:'house',state:'CA'}]})});
  assert.equal(bad.status,400);
  for(const [office,expected] of [['senate',35],['house',435]]){
   const result=await fetch(base+'/api/national?office='+office);
   assert.equal(result.status,200,'national API failed for '+office+' '+logs);
   const json=await result.json();
   assert.equal(json.races.length,expected);
   assert.equal(json.reported,0);
  }
 }finally{child.kill('SIGTERM')}
});
