import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLookup,lookupKey,portraitGetUrl,safeHttpsUrl,normalizePortrait,parseBatchPortraits} from '../lib/portrait-enrichment.mjs';

test('Portrait lookup identity uses verified office, state, district and name',()=>{
 const ca={name:'Gil Cisneros',state:'CA',office:'house',district:'31'};
 const ny={name:'Gil Cisneros',state:'NY',office:'house',district:'31'};
 const caAnother={name:'Gil Cisneros',state:'CA',office:'house',district:'32'};
 assert.equal(normalizeLookup(ca).district,'31');
 assert.notEqual(lookupKey(ca),lookupKey(ny));
 assert.notEqual(lookupKey(ca),lookupKey(caAnother));
 assert.equal(normalizeLookup({name:'Some Candidate',state:'GA',office:'senate'}).office,'senate');
 assert.equal(normalizeLookup({name:'Candidate #5',state:'CA',office:'house',district:31}),null);
 assert.equal(normalizeLookup({name:'Unknown',state:'CA',office:'house'}),null);
 assert.match(portraitGetUrl(ca),/watch\.vote\/api\/elections\/2026\/portrait/);
});
test('Invalid, insecure and internal image URLs are rejected',()=>{
 assert.equal(safeHttpsUrl('http://example.com/a.jpg'),null);
 assert.equal(safeHttpsUrl('https://localhost/test.jpg'),null);
 assert.equal(safeHttpsUrl('https://127.0.0.1/image.jpg'),null);
 assert.equal(normalizePortrait({portrait:{url:'javascript:alert(1)'}}),null);
 assert.equal(normalizePortrait(null),null);
});
test('Provider photo metadata is retained with attribution',()=>{
 const photo=normalizePortrait({portrait:{imageUrl:'https://images.congress.gov/member.jpg',credit:'U.S. House',license:'Public domain',sourceUrl:'https://www.congress.gov/member'}});
 assert.equal(photo.image,'https://images.congress.gov/member.jpg');
 assert.equal(photo.credit,'U.S. House');
 assert.equal(photo.license,'Public domain');
 assert.equal(photo.source,'https://www.congress.gov/member');
});
test('Batch lookup only assigns photos to exact known candidate identities',()=>{
 const a={name:'Gil Cisneros',state:'CA',office:'house',district:'31'};
 const b={name:'Gil Cisneros',state:'NY',office:'house',district:'31'};
 const source={results:[
  {lookup:a,portrait:{imageUrl:'https://example.org/ca.jpg',credit:'Campaign'}},
  {lookup:{...b,district:'42'},portrait:{imageUrl:'https://example.org/wrong.jpg'}},
  {lookup:b,portrait:null}
 ]};
 const found=parseBatchPortraits(source,[a,b]);
 assert.equal(found.requested,2);
 assert.equal(found.recognized,2);
 assert.equal(found.portraits.get(lookupKey(a)).image,'https://example.org/ca.jpg');
 assert.equal(found.portraits.has(lookupKey(b)),false);
});
test('Anonymous response array is never silently assigned by position',()=>{
 const query=[{name:'Alice Example',state:'GA',office:'senate'},{name:'Bob Example',state:'CA',office:'senate'}];
 const matched=parseBatchPortraits({results:[{portrait:{imageUrl:'https://example.org/a.jpg'}},{portrait:{imageUrl:'https://example.org/b.jpg'}}]},query);
 assert.equal(matched.recognized,0);
 assert.equal(matched.portraits.size,0);
});

test('Live watch.vote batch contract supports named portraits plus unavailable entries',()=>{
 const a={name:'Gil Cisneros',state:'CA',office:'house',district:'31'};
 const b={name:'Another Candidate',state:'GA',office:'house',district:'04'};
 const payload={portraits:[{name:'Gil Cisneros',imageUrl:'https://images.congress.gov/gil.jpg',sourceUrl:'https://www.congress.gov/',attribution:'Biographical Directory',license:'Source-provided official portrait'}],unavailable:[{name:'Another Candidate'}]};
 const found=parseBatchPortraits(payload,[a,b]);
 assert.equal(found.recognized,2);
 assert.equal(found.portraits.size,1);
 assert.equal(found.portraits.get(lookupKey(a)).credit,'Biographical Directory');
 assert.equal(found.portraits.has(lookupKey(b)),false);
});
