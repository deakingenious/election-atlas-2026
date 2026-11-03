import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('Wikidata FEC-based Commons photo survives election-provider outages',async()=>{
 const port=37000+(process.pid%10000);
 const child=spawn(process.execPath,['--import','./test/mock-wikidata-provider.mjs','server.mjs'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']
 });
 let logs='';child.stdout.on('data',x=>logs+=String(x));child.stderr.on('data',x=>logs+=String(x));
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<50;i++){
   try{ready=(await fetch(base+'/api/health')).ok;if(ready)break}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'server failed to start: '+logs);
  const lookups=[{name:'Test Candidate',office:'house',state:'CA',district:'31',candidateId:'H4CA00999'}];
  const response=await fetch(base+'/api/portrait-enrichment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.matched,1,'Expected Wikidata fallback to work: '+JSON.stringify(body));
  assert.equal(body.wikidata,1);
  assert.equal(body.portraits['house|CA|31|TESTCANDIDATE'].credit,'Sample Wikimedia author');
  assert.equal(body.portraits['house|CA|31|TESTCANDIDATE'].license,'CC BY 4.0');
  const photo=await fetch(base+body.portraits['house|CA|31|TESTCANDIDATE'].proxyUrl);
  assert.equal(photo.status,200);
  assert.match(photo.headers.get('content-type'),/image\/jpeg/);
  const invalid=await fetch(base+'/api/wikidata-candidate-photo?fec=H4AL00999');
  assert.equal(invalid.status,404);
  for(const [office,count] of [['senate',35],['house',435]]){
   const r=await fetch(base+'/api/national?office='+office);
   assert.equal(r.status,200);
   assert.equal((await r.json()).races.length,count);
  }
 }finally{child.kill('SIGTERM')}
});
