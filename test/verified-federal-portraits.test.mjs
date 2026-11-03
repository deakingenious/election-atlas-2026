import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVerifiedPortraitIndex,curatedPortraitsFor} from '../lib/verified-portraits.mjs';
import {lookupKey} from '../lib/portrait-enrichment.mjs';

const records=JSON.parse(await readFile(new URL('../public/federal-portrait-overrides.json',import.meta.url),'utf8'));
const index=createVerifiedPortraitIndex(records);
const one=(name,state='MI',office='senate')=>({name,state,office});

test('Michigan Senate photographs are matched to exact election identities',()=>{
 const abdul=curatedPortraitsFor([one('Abdul El-Sayed')],index)[lookupKey(one('Abdul El-Sayed'))];
 const mike=curatedPortraitsFor([one('Mike Rogers')],index)[lookupKey(one('Mike Rogers'))];
 assert.match(abdul.image,/Abdul_El-Sayed\.jpg/);
 assert.equal(abdul.license,'CC BY-SA 4.0');
 assert.equal(abdul.credit,'Kenneth C. Zirkel');
 assert.match(mike.image,/Mike-Rogers-Head-Shot-2\.jpg/);
 assert.match(mike.source,/Mike-Rogers-Head-Shot-2/);
 assert.match(mike.credit,/United States Congress/);
});

test('A Michigan portrait cannot leak to an Alabama Mike Rogers or a House candidate',()=>{
 const unrelated=[one('Mike Rogers','AL'),one('Mike Rogers','MI','house'),one('Abdul El-Sayed','WA')];
 assert.deepEqual(curatedPortraitsFor(unrelated,index),{});
});

test('Candidate alias matches only the same state and seat',()=>{
 const alias=one('Michael J. Rogers');
 assert.equal(index.get(lookupKey(alias)).image,index.get(lookupKey(one('Mike Rogers'))).image);
 assert.equal(index.get(lookupKey(one('Michael J. Rogers','AL'))),undefined);
});

test('Reviewed catalog rejects untrusted photo hosts and conflicting identities',()=>{
 const bad=[{...records[0],image:'https://example.org/arbitrary.jpg'}];
 assert.throws(()=>createVerifiedPortraitIndex(bad),/Only reviewed Commons-hosted/);
 const conflicting=[records[0],{...records[0],image:records[1].image}];
 assert.throws(()=>createVerifiedPortraitIndex(conflicting),/Conflicting reviewed portraits/);
});

test('Reviewed photograph sources include license links and source citations',()=>{
 for(const record of records){
  assert.ok(record.names.length);
  assert.ok(record.image.startsWith('https://thumb.wikimedia.org/'));
  assert.ok(record.source.startsWith('https://commons.wikimedia.org/wiki/File:'));
  assert.ok(record.licenseUrl.startsWith('https://'));
 }
});
