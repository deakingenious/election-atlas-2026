const nativeFetch=globalThis.fetch;
globalThis.fetch=async (resource,options={})=>{
 const url=String(resource);
 if(url==='https://watch.vote/api/elections/2026/portraits'&&options.method==='POST'){
  const body=JSON.parse(options.body||'{}');
  // Mirror the live watch.vote response sampled by the GitHub Actions probe:
  // portraits contain name/imageUrl but not echoed office/district.
  const portraits=(body.lookups||[]).filter(x=>x.name==='Candidate One')
   .map(x=>({name:x.name,imageUrl:'https://images.congress.gov/official-one.jpg',attribution:'House photography',license:'Public domain',sourceUrl:'https://www.congress.gov/'}));
  const unavailable=(body.lookups||[]).filter(x=>x.name!=='Candidate One').map(x=>({name:x.name}));
  return new Response(JSON.stringify({portraits,unavailable}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.startsWith('https://watch.vote/api/elections/2026/portrait?')){
  return new Response(JSON.stringify({portrait:null}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('Provider unavailable',{status:503});
};
