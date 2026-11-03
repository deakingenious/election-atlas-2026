import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCSV,normalizeFederalRoster} from '../lib/candidate-rosters.mjs';
import {parseSOS,resolveBallot,mergeNational,ballotChoice} from '../lib/adapters.mjs';
const ballot=JSON.parse(await readFile(new URL('../public/ballot.json',import.meta.url),'utf8'));
test('CSV handles quoted fields and embedded commas',()=>{
 const rows=parseCSV('state,office,district,candidate,party\nCA,House,31,"Cisneros, Gil",Democratic\n');
 assert.equal(rows.length,1);assert.equal(rows[0].CANDIDATE,'Cisneros, Gil');
});
test('Federal metadata populates candidates without creating vote totals',()=>{
 const csv=['state,office,district,candidate,party',...Array.from({length:55},(_,i)=>`CA,House,${i%52+1},Candidate ${i+1},Democratic`)].join('\n');
 const roster=normalizeFederalRoster(csv);
 assert.ok(roster.contests>=50);
 const national=mergeNational([],[],[],roster.races);
 const selected=national.find(r=>r.id==='CA-31');
 assert.equal(selected.candidates[0].party,'Democratic');assert.equal(selected.reported,false);assert.equal(selected.votes,0);
});
test('An unrecognized roster schema fails visibly',()=>{
 assert.throws(()=>normalizeFederalRoster('name,state\nDemo,CA'),/unrecognized or incomplete/);
});
test('California SOS candidate metadata exists before V results',()=>{
 const r='[R|CAS|1|020000000000|Governor|GG]\n[R|CAS|2|110000310000|United States Representative District 31|GG]';
 const c='[C|CAS|1|020000000000|3654|N|Becerra|Xavier||DEM|Xavier Becerra]\n[C|CAS|2|020000000000|3631|N|Hilton|Steve||REP|Steve Hilton]\n[C|CAS|3|110000310000|111|N|Cisneros|Gil||DEM|Gil Cisneros]';
 const parsed=parseSOS(r,c,'');
 assert.equal(parsed.races.length,2);assert.equal(parsed.races[0].reported,false);assert.equal(parsed.races[0].candidates.length,2);
 assert.ok(parsed.races[0].candidates.some(c=>c.party==='DEM'));assert.equal(parsed.races[1].candidates[0].name,'Gil Cisneros');
});
test('Ballot choices retain party without reported votes',()=>{
 assert.deepEqual(ballotChoice('Susan Rubio (Democrat, incumbent)'),{name:'Susan Rubio',party:'Democratic',votes:0});
 const resolved=resolveBallot(ballot,[],[]);
 assert.equal(resolved[0].candidates.find(x=>x.name==='Susan Rubio').party,'Democratic');assert.equal(resolved[0].reported,false);
});
