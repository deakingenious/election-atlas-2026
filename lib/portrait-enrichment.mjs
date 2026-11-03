// Strict candidate identities and defensive parsing for verified election portrait providers.
// Never associate a photograph with a candidate from a fuzzy name search alone.
const text=v=>String(v??'').trim();
const flat=v=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const safeString=(v,max=250)=>typeof v==='string'?v.trim().slice(0,max):'';
export function normalizeLookup(raw){
 if(!raw||typeof raw!=='object')return null;
 const name=text(raw.name).replace(/\s+/g,' ');
 const state=text(raw.state).toUpperCase();
 const office=text(raw.office).toLowerCase();
 if(!name||name.length<3||name.length>130||/^(YES|NO|CANDIDATE\s*#)/i.test(name))return null;
 if(!/^[A-Z]{2}$/.test(state)||!['house','senate'].includes(office))return null;
 let district='';
 if(office==='house'){
  const src=text(raw.district).toUpperCase();
  if(!/^(?:\d{1,2}|AT[- ]?LARGE)$/.test(src))return null;
  const n=src.includes('LARGE')?0:Number(src);
  if(!Number.isInteger(n)||n<0||n>99)return null;
  district=String(n).padStart(2,'0');
 }
 const candidateId=safeString(raw.candidateId,30);
 return {name,state,office,...(office==='house'?{district}:{}),...(candidateId?{candidateId}:{})};
}
export function lookupKey(input){
 const x=normalizeLookup(input);
 return x?`${x.office}|${x.state}|${x.district||'S'}|${flat(x.name)}`:null;
}
export function safeHttpsUrl(value){
 if(typeof value!=='string'||value.length>1800)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||url.hostname==='localhost')return null;
  if(/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname))return null;
  return url.toString();
 }catch{return null}
}
export function normalizePortrait(raw){
 if(!raw)return null;
 let obj=raw;
 if(typeof obj==='object')obj=obj.portrait??obj.photo??obj.headshot??obj.result?.portrait??obj.data?.portrait??obj;
 if(!obj)return null;
 const url=typeof obj==='string'?obj:safeString(obj.imageUrl||obj.image_url||obj.photoUrl||obj.photo_url||obj.thumbnailUrl||obj.thumbnail_url||obj.image||obj.src||obj.url,1800);
 const image=safeHttpsUrl(url);
 if(!image)return null;
 const detail=typeof obj==='object'?obj:{};
 const source=safeHttpsUrl(detail.sourceUrl||detail.source_url||detail.pageUrl||detail.page_url||detail.source?.url||raw.sourceUrl||raw.source_url)||'https://watch.vote/docs/api-reference/elections';
 return {image,source,credit:safeString(detail.credit||detail.attribution||detail.artist||detail.sourceName||raw.credit||'Verified portrait via watch.vote',160),license:safeString(detail.license||detail.licence||detail.licenseName||raw.license||raw.licence||'',120),provider:'watch.vote'};
}
function matchEntry(entry,wanted){
 if(!entry||typeof entry!=='object')return null;
 const identity=entry.lookup||entry.query||entry.request||entry.candidate||entry;
 const key=lookupKey(identity);
 if(key&&wanted.has(key))return key;
 // Exact name-only matches are allowed only when unique in the requested batch.
 const name=flat(identity.name||identity.candidateName||identity.fullName);
 if(!name)return null;
 const matching=[...wanted].filter(k=>k.endsWith('|'+name));
 return matching.length===1?matching[0]:null;
}
export function parseBatchPortraits(body,lookups){
 const expected=new Set(lookups.map(lookupKey).filter(Boolean)), portraits=new Map(), seen=new Set();
 const candidates=Array.isArray(body)?body:
  Array.isArray(body?.results)?body.results:
  Array.isArray(body?.portraits)?body.portraits:
  Array.isArray(body?.items)?body.items:
  Array.isArray(body?.data)?body.data:
  Array.isArray(body?.lookups)?body.lookups:[];
 for(const entry of candidates){
  const key=matchEntry(entry,expected);
  if(!key)continue;
  seen.add(key);
  const photo=normalizePortrait(entry);
  if(photo)portraits.set(key,photo);
 }
 // Named map responses (only accept keys which are exact candidate names).
 const keyed=body?.portraits&&!Array.isArray(body.portraits)&&typeof body.portraits==='object'?body.portraits:null;
 if(keyed)for(const [name,entry] of Object.entries(keyed)){
  const key=matchEntry({name},expected);
  if(!key)continue;
  seen.add(key);
  const photo=normalizePortrait(entry);if(photo)portraits.set(key,photo);
 }
 return {portraits,seen,recognized:seen.size,requested:expected.size};
}
export function portraitGetUrl(raw){
 const x=normalizeLookup(raw);
 if(!x)return null;
 const url=new URL('https://watch.vote/api/elections/2026/portrait');
 for(const [key,value] of Object.entries(x))url.searchParams.set(key,value);
 return url.toString();
}
