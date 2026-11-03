globalThis.fetch=async(url,opts={})=>{
 const target=String(url);
 if(target==='https://watch.vote/api/elections/2026/portraits'){
  const request=JSON.parse(opts.body||'{}');
  return new Response(JSON.stringify({portraits:[],unavailable:(request.lookups||[]).map(item=>({name:item.name}))}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(target.endsWith('/O000174.jpg')&&target.includes('unitedstates.github.io')){
  if(opts.method==='HEAD')return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
  return new Response(Uint8Array.from([255,216,255,217]),{status:200,headers:{'content-type':'image/jpeg'}});
 }
 if(target.includes('unitedstates.github.io')&&opts.method==='HEAD')
  return new Response(null,{status:404,headers:{'content-type':'text/plain'}});
 return new Response('Provider unavailable',{status:503});
};
