const ids=['S4MI00595','S6MI00418','H2MD05155'];
const q=`SELECT ?fec ?person ?image WHERE { VALUES ?fec { ${ids.map(x=>'"'+x+'"').join(' ')} } ?person wdt:P1839 ?fec . OPTIONAL { ?person wdt:P18 ?image } } LIMIT 10`;
const tests=[
 {name:'Wikidata SPARQL by FEC ID',url:'https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q),headers:{accept:'application/sparql-results+json'}},
 {name:'Wikidata API search by FEC ID',url:'https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'query',list:'search',srsearch:'haswbstatement:P1839=S4MI00595',format:'json'}),headers:{accept:'application/json'}}
];
for(const t of tests){
 try{
  const r=await fetch(t.url,{headers:{...t.headers,'user-agent':'ElectionAtlas2026/1.0 (open source election dashboard)'},signal:AbortSignal.timeout(9000)});
  const raw=(await r.text()).slice(0,1200);
  console.log(t.name,': status',r.status,'type',r.headers.get('content-type'),'sample:',raw);
 }catch(e){console.log(t.name,'unavailable:',e.message)}
}
