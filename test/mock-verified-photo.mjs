// Mimic blocked external feeds while serving deterministic Commons image bytes.
globalThis.fetch=async (url)=>{
 const target=String(url);
 if(target.startsWith('https://thumb.wikimedia.org/')){
  return new Response(Uint8Array.from([255,216,255,217]),{status:200,headers:{'content-type':'image/jpeg'}});
 }
 return new Response('Provider unavailable',{status:503});
};
