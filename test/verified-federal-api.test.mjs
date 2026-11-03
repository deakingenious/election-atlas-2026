import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('Reviewed Michigan portraits work while every external results provider is offline',async()=>{
 const port=32000+(process.pid%10000);
 const child=spawn(process.execPath,['--import','./test/mock-verified-photo.mjs','server.mjs'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']
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
  const lookups=[{name:'Mike Rogers',state:'MI',office:'senate'},{name:'Abdul El-Sayed',state:'MI',office:'senate'}];
  const r=await fetch(base+'/api/portrait-enrichment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lookups})});
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.matched,2);
  assert.equal(data.curated,2);
  assert.equal(data.attempted,0);
  const key='senate|MI|S|MIKEROGERS';
  const picture=data.portraits[key];
  assert.ok(picture);
  assert.equal(picture.license,'Public domain (U.S. federal government)');
  assert.ok(picture.proxyUrl.startsWith('/api/reviewed-candidate-photo?key='));
  const img=await fetch(base+picture.proxyUrl);
  assert.equal(img.status,200);
  assert.match(img.headers.get('content-type'),/image\/jpeg/);
  const unknown=await fetch(base+'/api/reviewed-candidate-photo?key=senate%7CAL%7CS%7CMIKEROGERS');
  assert.equal(unknown.status,404);
  for(const [office,size] of [['house',435],['senate',35]]){
   const count=await fetch(base+'/api/national?office='+office);
   assert.equal(count.status,200);
   assert.equal((await count.json()).races.length,size);
  }
 }finally{child.kill('SIGTERM')}
});
