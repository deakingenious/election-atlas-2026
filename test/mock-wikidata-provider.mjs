globalThis.fetch=async(resource,options={})=>{
 const url=new URL(String(resource));
 if(url.hostname==='watch.vote' && url.pathname==='/api/elections/2026/portraits'){
  const request=JSON.parse(options.body||'{}');
  return new Response(JSON.stringify({portraits:[],unavailable:(request.lookups||[]).map(x=>({name:x.name}))}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.hostname==='query.wikidata.org'){
  return new Response(JSON.stringify({results:{bindings:[{
   fec:{value:'H4CA00999'},person:{value:'http://www.wikidata.org/entity/Q12345'},
   image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Verified%20test%20candidate.jpg'}
  }]}}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.hostname==='commons.wikimedia.org'&&url.pathname==='/w/api.php'){
  return new Response(JSON.stringify({query:{pages:{4:{
   title:'File:Verified test candidate.jpg',imageinfo:[{
    thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Verified_test_candidate.jpg/330px-Verified_test_candidate.jpg',
    descriptionurl:'https://commons.wikimedia.org/wiki/File:Verified_test_candidate.jpg',
    extmetadata:{LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'},Artist:{value:'Sample Wikimedia author'}}
   }]
  }}}}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(url.hostname==='thumb.wikimedia.org')return new Response(Uint8Array.from([255,216,255,217]),{status:200,headers:{'content-type':'image/jpeg'}});
 return new Response('Provider unavailable',{status:503});
};
