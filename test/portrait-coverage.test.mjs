import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sosPartyName,parseSOS} from '../lib/adapters.mjs';

const files=JSON.parse(await readFile(new URL('../public/portrait-pages.json',import.meta.url),'utf8'));
const normalize=name=>String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const catalog=Object.fromEntries(Object.entries(files).map(([name,info])=>[normalize(name),info]));

test('Governor candidates have intentionally identified portraits',()=>{
 for(const name of ['Xavier Becerra','Steve Hilton']){
  const v=catalog[normalize(name)];
  assert.ok(v,'missing portrait mapping for '+name);
  assert.match(v.image,/^https:/);
  assert.match(v.source,/^https:/);
  assert.ok(v.credit);
 }
});
test('Statewide race photo expansion includes attorney general and insurance candidates',()=>{
 for(const name of ['Rob Bonta','Michael E Gates','Ben Allen','Jane Kim','Fiona Ma','Gloria Romero']){
  assert.ok(catalog[normalize(name)],'missing verified portrait for '+name);
 }
});
test('California SOS party codes are translated from the state codebook',()=>{
 assert.equal(sosPartyName('01'),'Democratic');
 assert.equal(sosPartyName('02'),'Republican');
 assert.equal(sosPartyName('03'),'American Independent');
 assert.equal(sosPartyName('04'),'Green');
 assert.equal(sosPartyName('05'),'Libertarian');
 assert.equal(sosPartyName('08'),'Peace and Freedom');
 assert.equal(sosPartyName('13'),'Nonpartisan');
 assert.equal(sosPartyName('14'),'No Party Preference');
 assert.equal(sosPartyName('99'),'99');
});
test('Candidate party codes are decoded before the pre-vote roster is displayed',()=>{
 const contest='[R|CAS|1|020000000000|Governor|GG]';
 const candidate=[
  '[C|CAS|1|020000000000|10||Becerra|Xavier||01|Xavier Becerra]',
  '[C|CAS|2|020000000000|11||Hilton|Steve||02|Steve Hilton]'
 ].join(String.fromCharCode(10));
 const races=parseSOS(contest,candidate,'').races;
 assert.equal(races.length,1);
 assert.deepEqual(races[0].candidates.map(c=>c.party).sort(),['Democratic','Republican']);
 assert.equal(races[0].reported,false);
});
test('Race summaries show available photo previews and coverage diagnostic',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(app,/race-preview-portraits/);
 assert.match(app,/candidatePortraitCoverage/);
 assert.match(css,/race-preview-portraits/);
 assert.match(app,/Portrait unavailable for candidate/);
});
