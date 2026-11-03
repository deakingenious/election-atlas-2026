import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const root=new URL('../',import.meta.url);
const portraits=JSON.parse(await readFile(new URL('../public/portrait-pages.json',import.meta.url),'utf8'));
const norm=name=>name.toUpperCase().replace(/[^A-Z0-9]/g,'');

test('Curated candidates have official, attributable HTTPS portrait sources',()=>{
 const byId=new Map(Object.entries(portraits).map(([name,p])=>[norm(name),p]));
 for(const name of ['Karen Ruth Bass','Nithya Raman','Blanca E Rubio','Fiona Ma','Gloria Romero','Shirley N Weber']){
  const item=byId.get(norm(name));
  assert.ok(item,'missing '+name);
  assert.ok(item.image.startsWith('https://'),'insecure photo for '+name);
  assert.ok(item.source.startsWith('https://'),'missing credited page for '+name);
  assert.ok(item.credit.length>8,'missing photo credit for '+name);
 }
 assert.ok(new Set(Object.values(portraits).map(p=>p.image)).size>=12);
});

test('New default presentation is light and keeps a dark-mode toggle',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const styles=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(html,/body data-theme="light"/);
 assert.match(app,/atlasThemeV2/);
 assert.match(styles,/balanced election newsroom layout/);
 assert.match(app,/data-proxy-src/);
 assert.match(app,/Both 2026 finalists/);
});

test('Live server returns verified portrait metadata without third-party lookup',async()=>{
 const port=34000+process.pid%10000;
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let errorOutput='';
 child.stderr.on('data',c=>errorOutput+=String(c));
 try{
  let result=null;
  for(let i=0;i<40;i++){
   try{const response=await fetch(`http://127.0.0.1:${port}/api/portraits`);if(response.ok){result=await response.json();break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(result,'server never returned portrait metadata: '+errorOutput);
  assert.ok(result.portraits.KARENRUTHBASS.image.includes('mayor.lacity.gov'));
  assert.ok(result.portraits.NITHYARAMAN.image.includes('cd4.lacity.gov'));
  assert.ok(result.portraits.BLANCARUBIO.image.includes('assembly.ca.gov'));
  const missing=await fetch(`http://127.0.0.1:${port}/api/candidate-photo?name=NOT_A_REAL_PERSON`);
  assert.equal(missing.status,404);
 }finally{child.kill('SIGTERM')}
});
