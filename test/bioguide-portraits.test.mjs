import test from 'node:test';
import assert from 'node:assert/strict';
import {validBioguideId,officialPhotoUrl,lookupBioguidePhotos} from '../lib/bioguide-portraits.mjs';
import {normalizeFederalRoster} from '../lib/candidate-rosters.mjs';
import {mergeNational} from '../lib/adapters.mjs';

test('A Bioguide photo can only be indexed by a syntactically valid, office-scoped ID',()=>{
 const x={name:'Official Example',office:'senate',state:'GA',bioguideId:'O000174'};
 assert.equal(validBioguideId(x),'O000174');
 assert.equal(officialPhotoUrl('O000174'),'https://unitedstates.github.io/images/congress/225x275/O000174.jpg');
 assert.equal(validBioguideId({...x,office:'governor'}),null);
 assert.equal(validBioguideId({...x,state:'Georgia'}),null);
 assert.equal(validBioguideId({...x,bioguideId:'../../admin'}),null);
 assert.equal(officialPhotoUrl('../../admin'),null);
});
test('Federal CSV carries Bioguide identities through result enrichment',()=>{
 const header='state,office,district,candidate,party,bioguide_id,fec_candidate_id';
 const rows=Array.from({length:52},(_,i)=>`CA,House,${i%52+1},Candidate ${i+1},D,${i===0?'O000174':''},${i===0?'H4CA00001':''}`);
 const {races}=normalizeFederalRoster([header,...rows].join('\n'));
 const c=races.find(r=>r.id==='CA-01').candidates[0];
 assert.equal(c.bioguideId,'O000174');
 assert.equal(c.candidateId,'H4CA00001');
 const federal=mergeNational([],[],[],races);
 assert.equal(federal.find(r=>r.id==='CA-01').candidates[0].bioguideId,'O000174');
});
test('An official photo URL requires a real JPEG response and caches no invented matches',async()=>{
 const x={name:'Official Example',office:'senate',state:'GA',bioguideId:'O000174'};
 const y={name:'Another Example',office:'senate',state:'GA',bioguideId:'S001198'};
 const calls=[];
 const fetcher=async (url,request)=>{
  calls.push({url,method:request.method});
  return new Response('',{status:url.endsWith('O000174.jpg')?200:404,headers:{'content-type':url.endsWith('O000174.jpg')?'image/jpeg':'text/plain'}});
 };
 const data=await lookupBioguidePhotos([x,y,x],{fetcher,concurrency:2,timeout:1000});
 assert.equal(data.queried,2);
 assert.equal(data.photos.size,1);
 assert.equal(data.photos.get('O000174').license,'Public domain (U.S. government photo)');
 assert.deepEqual(data.missing,['S001198']);
 assert.ok(calls.every(x=>x.method==='HEAD'));
});
test('A successful status with HTML content does not count as a portrait',async()=>{
 const data=await lookupBioguidePhotos([{office:'senate',state:'GA',bioguideId:'O000174'}],{
  fetcher:async()=>new Response('<html>Challenge</html>',{status:200,headers:{'content-type':'text/html'}})
 });
 assert.equal(data.photos.size,0);
 assert.equal(data.errors.length,1);
});
