import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseSOS,parseLA,resolveBallot,resolveMayor,californiaRaces,normalizeOpenAmerica,mergeNational} from '../lib/adapters.mjs';
import {nationalSkeleton,SEATS,SENATE_2026} from '../lib/states.mjs';
const items=JSON.parse(await readFile(new URL('../public/ballot.json',import.meta.url),'utf8'));
const r=[
'[B|CAS|1|20261103|210001]',
'[R|CAS|2|020000000000|Governor|GG]',
'[R|CAS|3|110000310000|United States Representative District 31|GG]',
'[R|CAS|4|120000220000|State Senate District 22|GG]',
'[R|CAS|5|130000480000|State Assembly Member District 48|GG]',
'[R|CAS|6|140000000004|Supreme Court Associate Justice Seat 4|GG]',
'[R|CAS|7|150000020300|COA - PJ - District 2 Division 3|GG]',
'[R|CAS|8|190000000040|Imposes One-Time Tax On Certain Taxpayers. Initiative Constitutional Amendment And Statute.|GG]',
'[R|CAS|9|190000000041|Prohibits New State Taxes That Exclude Revenues From State Spending Limit.|GG]'
].join('\n');
const c=[
'[C|CAS|1|020000000000|3654|N|Becerra|Xavier||DEM|Xavier Becerra]',
'[C|CAS|2|020000000000|3631|N|Hilton|Steve||REP|Steve Hilton]',
'[C|CAS|3|110000310000|111|N|Cisneros|Gil||DEM|Gil Cisneros]',
'[C|CAS|4|110000310000|112|N|Ching|Eric||REP|Eric Ching]'
].join('\n');
const v=[
'[B|CAS|1|20261103|210002]',
'[V|CAS|2|020000000000|59|4|23860||3654|1000|0|60.0|3631|700|0|40.0]',
'[V|CAS|3|110000310000|59|4|708||111|800|0|58.0|112|580|0|42.0]',
'[V|CAS|4|120000220000|59|0|1000||11|0|0.0|0.0|12|0|0.0|0.0]',
'[V|CAS|5|130000480000|59|0|1000||11|0|0.0|0.0|12|0|0.0|0.0]',
'[V|CAS|6|140000000004|59|4|23860||4078|YES|1512|0.0|NO|188|0.0]',
'[V|CAS|7|150000020300|59|4|4674||4105|YES|800|0.0|NO|500|0.0]',
'[V|CAS|8|190000000040|59|4|23860||YES|1000|0.0|NO|700|0.0]',
'[V|CAS|9|190000000041|59|0|23860||YES|0|0.0|NO|0|0.0]'
].join('\n');

test('54 personalized ballot item roster is complete and ordered',()=>{assert.equal(items.length,54);assert.deepEqual(items.map(i=>i.id),Array.from({length:54},(_,i)=>i+1));});
test('published California SOS feed parses statewide vote groups and timestamps',()=>{
 const z=parseSOS(r,c,v);assert.equal(z.races.length,8);
 assert.equal(z.races[0].title,'Governor');assert.equal(z.races[0].votes,1700);
 assert.equal(z.races[0].candidates[0].name,'Xavier Becerra');assert.equal(z.races[0].candidates[1].name,'Steve Hilton');
 const prop=z.races.find(x=>x.id==='190000000040');assert.deepEqual(prop.candidates.map(x=>x.name),['YES','NO']);assert.equal(prop.votes,1700);
 const justice=z.races.find(x=>x.id==='140000000004');assert.equal(justice.candidates.length,2);assert.deepEqual(justice.candidates.map(x=>x.name),['YES','NO']);assert.equal(justice.votes,1700);
 assert.equal(z.races.find(x=>x.id==='190000000041').reported,false);
 });
test('All 54 ballot rows resolve official state ID-matched measures and justices',()=>{
 const matched=resolveBallot(items,[],parseSOS(r,c,v).races);
 assert.equal(matched.length,54);
 assert.equal(matched[11].reported,true);
 assert.equal(matched[28].reported,true);assert.equal(matched[28].candidates[0].name,'YES');
 assert.equal(matched[29].matched,true);
 assert.equal(matched[34].matched,true);
 assert.equal(matched[36].matched,true);
 assert.equal(matched[1].matched,true);
 });
test('Los Angeles county parser and mayor matching uses official title, not invented names',()=>{
 const json={Timestamp:'2026-11-03T20:15:00-08:00',Election:{ContestGroups:[{Name:'Cities',Contests:[{Title:'LOS ANGELES CITY GENERAL MUNICIPAL ELECTION Mayor',Candidates:[{Name:'KAREN RUTH BASS',Votes:100},{Name:'NITHYA RAMAN',Votes:101}]}]},{Name:'County Measures',Contests:[{Title:'COUNTY MEASURE A',Candidates:[{Name:'YES',Votes:9},{Name:'NO',Votes:3}]}]}]}};
 const la=parseLA(json);const mayor=resolveMayor(la.races);assert.equal(mayor.reported,true);assert.equal(mayor.candidates[0].name,'NITHYA RAMAN');
 const ballot=resolveBallot(items,la.races,[]);assert.equal(ballot[9].matched,true);assert.equal(ballot[9].votes,12);
 });
test('National skeleton lists exact House and Senate election inventories without fabricated results',()=>{
 const races=nationalSkeleton();assert.equal(Object.values(SEATS).reduce((a,b)=>a+b,0),435);assert.equal(SENATE_2026.length,35);
 assert.equal(races.filter(r=>r.office==='house').length,435);assert.equal(races.filter(r=>r.office==='senate').length,35);
 assert.equal(races.filter(r=>r.reported).length,0);
});
test('Federal feed values hydrate only reported races, retaining all noncovered races',()=>{
 const z=normalizeOpenAmerica({races:{'TX-23':{cands:[{n:'Example Candidate',p:'D',v:120}],total:120,pct_in:5},'AL-01':{cands:[{n:'Test',p:'R',v:0}],total:0,pct_in:0}}},'house');
 assert.equal(z.length,2);const merged=mergeNational(z,[],[]);assert.equal(merged.filter(r=>r.office==='house').length,435);assert.equal(merged.find(r=>r.id==='TX-23').reported,true);assert.equal(merged.find(r=>r.id==='AL-01').reported,false);
});
test('California races include complete official contest schedule',()=>{
 const all=californiaRaces(parseSOS(r,c,v).races,[]);
 assert.equal(all.length,101);assert.equal(all.filter(r=>r.kind==='assembly').length,80);assert.equal(all.filter(r=>r.kind==='senate').length,20);assert.equal(all.filter(r=>r.kind==='governor').length,1);
});
