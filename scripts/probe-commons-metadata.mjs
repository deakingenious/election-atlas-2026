const filename='Abdul El-Sayed meet-and-greet by Conlan Houston 5 (cropped).jpg';
const url=new URL('https://commons.wikimedia.org/w/api.php');
for(const [k,v] of Object.entries({action:'query',format:'json',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'280',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Credit|Attribution|Copyrighted|NonFree',titles:'File:'+filename}))url.searchParams.set(k,v);
try{
 const r=await fetch(url,{headers:{'User-Agent':'ElectionAtlas2026/1.0 (source/license verification)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
 console.log('Commons metadata status',r.status);
 const data=await r.json();
 for(const page of Object.values(data?.query?.pages||{})){
  const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
  console.log('File:',page.title,'image',info?.thumburl||info?.url,'description:',info?.descriptionurl);
  for(const k of ['LicenseShortName','LicenseUrl','Artist','Credit','Attribution','Copyrighted','NonFree']) console.log(k,meta[k]?.value?.slice(0,240));
 }
}catch(e){console.log('Commons metadata probe failed:',e.message)}
