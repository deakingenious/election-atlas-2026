import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
test('Bioguide official photo is returned without affecting election-result inventories',async()=>{
 const port=41000+process.pid%9000,base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','./test/mock-bioguide.mjs','server.mjs'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']
 });
 let logs='';child.stdout.on('data',x=>logs+=String(x));child.stderr.on('data',x=>logs+=String(x));
 try{
  let ready=false;
  for(let i=0;i<50;i++){
   try{ready=(await fetch(base+'/api/health')).ok;if(ready)break}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Local server did not start: '+logs);
  const names=[{name:'Official Example',state:'GA',office:'senate',bioguideId:'O000174'}];
  const response=await fetch(base+'/api/portrait-enrichment',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups:names})
  });
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.bioguide,1);
  assert.equal(json.bioguideQueried,1);
  assert.equal(json.matched,1);
  const photo=json.portraits['senate|GA|S|OFFICIALEXAMPLE'];
  assert.ok(photo);
  assert.match(photo.image,/O000174\.jpg/);
  assert.match(photo.license,/Public domain/);
  const binary=await fetch(base+photo.proxyUrl);
  assert.equal(binary.status,200);
  assert.match(binary.headers.get('content-type'),/image\/jpeg/);
  const nonCached=await fetch(base+'/api/bioguide-candidate-photo?bioguide=O000175');
  assert.equal(nonCached.status,404);
  for(const [office,size] of [['senate',35],['house',435]]){
   const result=await fetch(base+'/api/national?office='+office);
   assert.equal(result.status,200);
   assert.equal((await result.json()).races.length,size);
  }
 }finally{child.kill('SIGTERM')}
});
