import test from 'node:test';
import assert from 'node:assert/strict';
import {validFecId,makeWikidataQuery,wikidataImageFile,parseWikidataMatches,makeCommonsMetadataUrl,parseCommonsPhotos,lookupWikidataCommonsPortraits} from '../lib/wikidata-portraits.mjs';

const a={name:'Abdul El-Sayed',office:'senate',state:'MI',candidateId:'S6MI00418'};
const b={name:'Mike Rogers',office:'senate',state:'MI',candidateId:'S4MI00595'};
const filename='Abdul El-Sayed meet-and-greet by Conlan Houston 5 (cropped).jpg';
const commonsImage='https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Abdul_El-Sayed_meet-and-greet.jpg/330px-Abdul.jpg';

test('Only office/state-aligned FEC candidate IDs qualify',()=>{
 assert.equal(validFecId(a),'S6MI00418');
 assert.equal(validFecId(b),'S4MI00595');
 assert.equal(validFecId({...a,state:'AL'}),null);
 assert.equal(validFecId({...a,office:'house'}),null);
 assert.equal(validFecId({...a,candidateId:'S4MI00595" } UNION { ?a ?b ?c'}),null);
 const q=makeWikidataQuery(['S6MI00418','S4MI00595']);
 assert.match(q,/wdt:P1839/);assert.match(q,/wdt:P18/);
 assert.throws(()=>makeWikidataQuery(['S6MI00418";drop']),/validated/);
});

test('SPARQL output must match exact expected FEC IDs and unambiguous persons',()=>{
 const payload={results:{bindings:[
  {fec:{value:'S6MI00418'},person:{value:'http://www.wikidata.org/entity/Q25752879'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Abdul%20El-Sayed%20meet-and-greet%20by%20Conlan%20Houston%205%20%28cropped%29.jpg'}},
  {fec:{value:'S4AL00001'},person:{value:'http://www.wikidata.org/entity/Q5'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/wrong.jpg'}}
 ]}};
 const result=parseWikidataMatches(payload,['S6MI00418']);
 assert.equal(result.get('S6MI00418').file,filename);
 assert.equal(result.has('S4AL00001'),false);
 assert.equal(wikidataImageFile('http://example.org/wiki/Special:FilePath/wrong.jpg'),null);
});

test('Commons license is verified and unsafe images are excluded',()=>{
 const meta=(license,url,copyrighted)=>({LicenseShortName:{value:license},LicenseUrl:{value:url},Copyrighted:{value:copyrighted},Artist:{value:'<a href="https://commons.wikimedia.org/">Conlan Houston</a>'}});
 const json={query:{pages:{
  1:{title:'File:'+filename,imageinfo:[{thumburl:commonsImage,descriptionurl:'https://commons.wikimedia.org/wiki/File:Abdul_El-Sayed',extmetadata:meta('CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0/','True')}]},
  2:{title:'File:nonfree.jpg',imageinfo:[{thumburl:'https://thumb.wikimedia.org/nonfree.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:nonfree.jpg',extmetadata:meta('CC BY-NC 4.0','https://creativecommons.org/licenses/by-nc/4.0/','True')}]}
 }}};
 const photos=parseCommonsPhotos(json);
 assert.equal(photos.size,1);
 assert.equal(photos.get(filename).credit,'Conlan Houston');
 assert.equal(photos.get(filename).license,'CC BY-SA 4.0');
 assert.match(makeCommonsMetadataUrl([filename]),/action=query/);
});

test('Complete lookup uses FEC IDs, not candidate names',async()=>{
 const fetcher=async url=>{
  const u=new URL(url);
  if(u.hostname==='query.wikidata.org')return new Response(JSON.stringify({results:{bindings:[{
   fec:{value:'S6MI00418'},person:{value:'http://www.wikidata.org/entity/Q25752879'},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(filename)}
  }]}}),{status:200});
  if(u.hostname==='commons.wikimedia.org')return new Response(JSON.stringify({query:{pages:{1:{
   title:'File:'+filename,imageinfo:[{
    thumburl:commonsImage,descriptionurl:'https://commons.wikimedia.org/wiki/File:Abdul_El-Sayed',
    extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},Artist:{value:'Conlan Houston'}}
   }]
  }}}}),{status:200});
  throw Error('Unexpected provider request '+u);
 };
 const result=await lookupWikidataCommonsPortraits([a,b],{fetcher,timeout:2000});
 assert.equal(result.queried,2);
 assert.equal(result.photos.size,1);
 assert.equal(result.photos.get('S6MI00418').credit,'Conlan Houston');
 assert.ok(result.misses.includes('S4MI00595'));
});
