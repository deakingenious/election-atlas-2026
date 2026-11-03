const nativeFetch=globalThis.fetch;
globalThis.fetch=async (resource,options={})=>{
 const url=String(resource);
 if(url==='https://watch.vote/api/elections/2026/portraits'&&options.method==='POST'){
  const body=JSON.parse(options.body||'{}');
  const results=(body.lookups||[]).map(lookup=>({
   lookup,
   portrait:lookup.name==='Candidate One'?{imageUrl:'https://images.congress.gov/official-one.jpg',credit:'House photography',license:'Public domain',sourceUrl:'https://www.congress.gov/'}:null
  }));
  return new Response(JSON.stringify({results}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.startsWith('https://watch.vote/api/elections/2026/portrait?')){
  return new Response(JSON.stringify({portrait:null}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('Provider unavailable',{status:503});
};
