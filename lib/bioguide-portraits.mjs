// Official public-domain congressional headshots indexed by Bioguide ID.
// Source: https://github.com/unitedstates/images (GPO congressional portraits).
const ID=/^[A-Z][0-9]{6}$/;
export function validBioguideId(candidate){
 const id=String(candidate?.bioguideId||'').trim().toUpperCase();
 return ID.test(id)&&['house','senate'].includes(String(candidate?.office||'').toLowerCase())&&/^[A-Z]{2}$/.test(String(candidate?.state||''))?id:null;
}
export function officialPhotoUrl(id){
 if(typeof id!=='string'||!ID.test(id))return null;
 return 'https://unitedstates.github.io/images/congress/225x275/'+id+'.jpg';
}
export const bioguideCredit='U.S. Government Printing Office / @unitedstates';
export const bioguideLicense='Public domain (U.S. government photo)';
export const bioguideLicenseUrl='https://github.com/unitedstates/images#public-domain';
export async function lookupBioguidePhotos(lookups,{fetcher=fetch,timeout=5500,concurrency=8}={}){
 const ids=[...new Set(lookups.map(validBioguideId).filter(Boolean))];
 const verified=new Map(),missing=[],errors=[];
 let offset=0;
 async function worker(){
  while(offset<ids.length){
   const id=ids[offset++],url=officialPhotoUrl(id);
   try{
    const response=await fetcher(url,{method:'HEAD',headers:{'User-Agent':'ElectionAtlas2026/1.0 (congressional public-domain portraits)'},signal:AbortSignal.timeout(timeout)});
    const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(response.ok&&type==='image/jpeg'){
     verified.set(id,{image:url,source:'https://github.com/unitedstates/images',credit:bioguideCredit,
      license:bioguideLicense,licenseUrl:bioguideLicenseUrl,
      caption:'Congressional member portrait',provider:'Public-domain Bioguide photo'});
    }else if(response.status===404)missing.push(id);
    else errors.push(id+': HTTP '+response.status+' '+type);
   }catch(e){errors.push(id+': '+e.message)}
  }
 }
 await Promise.all(Array.from({length:Math.min(ids.length,Math.max(1,Math.min(12,concurrency)))},()=>worker()));
 return {photos:verified,missing,errors,queried:ids.length};
}
