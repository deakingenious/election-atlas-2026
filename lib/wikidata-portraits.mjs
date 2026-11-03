// Optional FEC-ID -> Wikidata P1839 -> Commons freely licensed image pipeline.
// Never image-search by name. Identifiers must agree on office and state.
const asText=v=>String(v??'').trim();
const safeUrl=value=>{
 try{
  if(!value||typeof value!=='string')return null;
  const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.toString():null;
 }catch{return null}
};
export function validFecId(candidate){
 const id=asText(candidate?.candidateId).toUpperCase();
 const office=asText(candidate?.office).toLowerCase(),state=asText(candidate?.state).toUpperCase();
 if(!/^[HS][A-Z0-9][A-Z]{2}[A-Z0-9]{5}$/.test(id))return null;
 if(id[0]!==({house:'H',senate:'S'})[office]||id.slice(2,4)!==state)return null;
 return id;
}
export function makeWikidataQuery(ids){
 const accepted=[...new Set(ids)].filter(x=>/^[HS][A-Z0-9][A-Z]{2}[A-Z0-9]{5}$/.test(x));
 if(!accepted.length||accepted.length>100)throw Error('Need 1 to 100 validated FEC candidate IDs');
 return 'SELECT ?fec ?person ?image WHERE { VALUES ?fec { '+accepted.map(id=>'"'+id+'"').join(' ')+' } ?person wdt:P1839 ?fec ; wdt:P18 ?image . } LIMIT 250';
}
export function wikidataImageFile(value){
 if(typeof value!=='string')return null;
 try{
  const u=new URL(value);
  if(!['commons.wikimedia.org'].includes(u.hostname)||!u.pathname.startsWith('/wiki/Special:FilePath/'))return null;
  const file=decodeURIComponent(u.pathname.split('/wiki/Special:FilePath/')[1]).replace(/_/g,' ');
  if(!/\.(jpe?g|png|webp)$/i.test(file)||file.length>240||file.includes('/')||file.includes('..'))return null;
  return file;
 }catch{return null}
}
export function parseWikidataMatches(payload,ids){
 const allowed=new Set(ids),groups=new Map();
 for(const row of payload?.results?.bindings||[]){
  const fec=row?.fec?.value,person=row?.person?.value,file=wikidataImageFile(row?.image?.value);
  if(!allowed.has(fec)||!/^https?:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(person||'')||!file)continue;
  const previous=groups.get(fec)||[];
  previous.push({person:person.replace(/^http:/,'https:'),file});
  groups.set(fec,previous);
 }
 const found=new Map();
 for(const [fec,entries] of groups){
  const unique=[...new Map(entries.map(e=>[e.person+'|'+e.file,e])).values()];
  if(unique.length===1)found.set(fec,unique[0]);
 }
 return found;
}
export function makeCommonsMetadataUrl(files){
 const unique=[...new Set(files)].filter(x=>typeof x==='string'&&x.length<250);
 if(!unique.length||unique.length>50)throw Error('Invalid Wikimedia Commons metadata batch');
 const u=new URL('https://commons.wikimedia.org/w/api.php');
 for(const [k,v] of Object.entries({
  action:'query',format:'json',prop:'imageinfo',iiprop:'url|extmetadata',
  iiurlwidth:'330',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Attribution|Copyrighted|NonFree',
  titles:unique.map(file=>'File:'+file).join('|')
 }))u.searchParams.set(k,v);
 return u.toString();
}
function plainText(html){
 return asText(html).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#\d+;/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
}
export function parseCommonsPhotos(json){
 const found=new Map();
 for(const page of Object.values(json?.query?.pages||{})){
  if(!page?.title?.startsWith('File:'))continue;
  const file=page.title.slice(5).replace(/_/g,' ');
  const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
  const rawLicense=plainText(meta.LicenseShortName?.value);
  const licenseUrl=safeUrl(meta.LicenseUrl?.value);
  const copyrighted=asText(meta.Copyrighted?.value).toLowerCase();
  const nonFree=asText(meta.NonFree?.value).toLowerCase();
  if(nonFree==='true')continue;
  const cc=/^CC (?:BY(?:-SA)?(?:-NC)?|0)(?:\s|$)/i.test(rawLicense);
  // NC/ND and unrecognized licenses are not acceptable for this dashboard.
  const freeCC=cc&&!/-NC|-ND/i.test(rawLicense)&&licenseUrl?.startsWith('https://creativecommons.org/');
  const publicDomain=/(?:public domain|^PD(?:-|\b)|CC0)/i.test(rawLicense)&&
     (copyrighted==='false'||licenseUrl?.includes('/publicdomain/'));
  if(!freeCC&&!publicDomain)continue;
  const image=safeUrl(info.thumburl||info.url),source=safeUrl(info.descriptionurl);
  if(!image||!['thumb.wikimedia.org','upload.wikimedia.org'].includes(new URL(image).hostname))continue;
  if(!source||new URL(source).hostname!=='commons.wikimedia.org')continue;
  const credit=plainText(meta.Attribution?.value||meta.Artist?.value)||'Wikimedia Commons contributor (see source)';
  found.set(file,{
   image,source,credit,license:rawLicense,licenseUrl:licenseUrl||source,
   provider:'Wikidata FEC ID / Wikimedia Commons',caption:'Sourced Commons photo; cropped for display'
  });
 }
 return found;
}
export async function lookupWikidataCommonsPortraits(lookups,{fetcher=fetch,timeout=9000}={}){
 const idMap=new Map();
 for(const item of lookups){
  const id=validFecId(item);
  if(id&&!idMap.has(id))idMap.set(id,[]);
  if(id)idMap.get(id).push(item);
 }
 const ids=[...idMap.keys()];
 if(!ids.length)return {photos:new Map(),queried:0,misses:[]};
 const photos=new Map(),allMisses=new Set(ids);
 for(let i=0;i<ids.length;i+=45){
  const group=ids.slice(i,i+45);
  const wdqs=new URL('https://query.wikidata.org/sparql');
  wdqs.searchParams.set('format','json');wdqs.searchParams.set('query',makeWikidataQuery(group));
  const response=await fetcher(wdqs,{headers:{accept:'application/sparql-results+json','user-agent':'ElectionAtlas2026/1.0 (FEC ID photo verification)'},signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw Error('Wikidata FEC lookup HTTP '+response.status);
  const matched=parseWikidataMatches(await response.json(),group);
  const filenames=[...new Set([...matched.values()].map(x=>x.file))];
  const images=new Map();
  for(let n=0;n<filenames.length;n+=45){
   const slice=filenames.slice(n,n+45);
   const commons=await fetcher(makeCommonsMetadataUrl(slice),{headers:{accept:'application/json','user-agent':'ElectionAtlas2026/1.0 (Commons license verification)'},signal:AbortSignal.timeout(timeout)});
   if(!commons.ok)throw Error('Wikimedia Commons photo metadata HTTP '+commons.status);
   for(const [file,photo] of parseCommonsPhotos(await commons.json()))images.set(file,photo);
  }
  for(const [fec,hit] of matched){
   const photo=images.get(hit.file);
   if(photo){photos.set(fec,{...photo,identitySource:hit.person});allMisses.delete(fec)}
  }
 }
 return {photos,queried:ids.length,misses:[...allMisses]};
}
