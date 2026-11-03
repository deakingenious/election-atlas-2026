import {lookupKey,normalizeLookup,safeHttpsUrl} from './portrait-enrichment.mjs';

// Only reviewed identities can get a Commons fallback. Never guess a photo by
// name alone. In particular, Mike Rogers of Michigan != Mike Rogers of Alabama.
export function createVerifiedPortraitIndex(entries){
 const photos=new Map();
 if(!Array.isArray(entries))throw Error('Verified portrait manifest must be an array');
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||!Array.isArray(entry.names)||!entry.names.length)throw Error('Invalid verified portrait entry');
  const image=safeHttpsUrl(entry.image),source=safeHttpsUrl(entry.source),credit=String(entry.credit||'').trim();
  const license=String(entry.license||'').trim(),licenseUrl=safeHttpsUrl(entry.licenseUrl);
  if(!image||!source||!credit||!license||!licenseUrl)throw Error('Verified portrait missing photo, source, author or license');
  if(!['thumb.wikimedia.org','upload.wikimedia.org'].includes(new URL(image).hostname))throw Error('Only reviewed Commons-hosted photos are accepted');
  if(new URL(source).hostname!=='commons.wikimedia.org')throw Error('Missing Commons evidence page');
  const photo={image,source,credit,license,licenseUrl,caption:String(entry.caption||'').slice(0,180),provider:'Reviewed Wikimedia Commons'};
  for(const name of entry.names){
   const lookup=normalizeLookup({name,state:entry.state,office:entry.office,district:entry.district});
   if(!lookup)throw Error('Invalid reviewed candidate identity: '+String(name));
   const key=lookupKey(lookup);
   if(photos.has(key)&&photos.get(key).image!==photo.image)throw Error('Conflicting reviewed portraits for '+key);
   photos.set(key,photo);
  }
 }
 return photos;
}
export function curatedPortraitsFor(lookups,index){
 const portraits={};
 for(const lookup of lookups){
  const key=lookupKey(lookup);
  if(key&&index.has(key))portraits[key]=index.get(key);
 }
 return portraits;
}
