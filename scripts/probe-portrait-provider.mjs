// Optional CI diagnostic. Checks public API contract; no personal information.
const lookup={name:'Gil Cisneros',office:'house',state:'CA',district:'31'};
const endpoints=[
 {label:'single',url:'https://watch.vote/api/elections/2026/portrait?'+new URLSearchParams(lookup),method:'GET'},
 {label:'batch',url:'https://watch.vote/api/elections/2026/portraits',method:'POST',body:JSON.stringify({lookups:[lookup]})}
];
for(const item of endpoints){
 try{
  const r=await fetch(item.url,{method:item.method,headers:{'accept':'application/json','content-type':'application/json','user-agent':'ElectionAtlas2026-CI/1.0'},...(item.body?{body:item.body}:{}),signal:AbortSignal.timeout(7500)});
  const sample=(await r.text()).slice(0,900).replace(/https?:\/\/[^"\s]+/g,'[URL]');
  console.log(item.label,'status:',r.status,'content type:',r.headers.get('content-type'),'response sample:',sample);
 }catch(error){console.log(item.label,'unavailable:',error.message)}
}
