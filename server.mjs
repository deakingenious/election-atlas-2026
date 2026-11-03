import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLA,parseSOS,resolveBallot,resolveMayor,californiaRaces,normalizeOpenAmerica,normalizeWatch,mergeNational,LINKS,ELECTION_RESULTS_BEGIN} from './lib/adapters.mjs';
import {CANDIDATES_CSV,normalizeFederalRoster} from './lib/candidate-rosters.mjs';
import {normalizeLookup,lookupKey,normalizePortrait,parseBatchPortraits,portraitGetUrl} from './lib/portrait-enrichment.mjs';
import {createVerifiedPortraitIndex,curatedPortraitsFor} from './lib/verified-portraits.mjs';
import {validFecId,lookupWikidataCommonsPortraits} from './lib/wikidata-portraits.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||8787);
const SOURCE_TIMEOUT=10000, TTL=60000;
const stored=new Map();
const ballot=JSON.parse(await readFile(path.join(root,'public','ballot.json'),'utf8'));
const stats={requests:0,sourceCalls:0,sourceFailures:0};
const portraitPages=JSON.parse(await readFile(path.join(root,'public','portrait-pages.json'),'utf8'));
const reviewedPhotos=createVerifiedPortraitIndex(JSON.parse(await readFile(path.join(root,'public','federal-portrait-overrides.json'),'utf8')));

async function upstream(url,{asText=false,windows1252=false,ttl=TTL}={}){
 const cached=stored.get(url);if(cached && Date.now()-cached.t<ttl)return cached.value;
 if(cached?.promise)return cached.promise;
 const pending=(async()=>{
   stats.sourceCalls++;
   const response=await fetch(url,{headers:{'User-Agent':'AzusaElectionAtlas/1.0 (+local personal dashboard)',Accept:'application/json, text/plain, */*'},signal:AbortSignal.timeout(SOURCE_TIMEOUT)});
   if(!response.ok)throw new Error(`HTTP ${response.status} for ${new URL(url).hostname}`);
   const value=asText ? (windows1252?new TextDecoder('windows-1252').decode(await response.arrayBuffer()):await response.text()) : await response.json();
   stored.set(url,{value,t:Date.now()});return value;
 })();stored.set(url,{...cached,promise:pending,t:cached?.t||0});
 try{return await pending}catch(e){stats.sourceFailures++;if(cached?.value)return cached.value;stored.delete(url);throw e;}
}
const success=(ok,data=null,error=null)=>({ok,data,error});
async function getLA(){
 try {const result=parseLA(await upstream(LINKS.la));return success(true,result)}
 catch(e){return success(false,{races:[],updatedAt:null},e.message)}
}
async function getFederalRoster(){
 try{
  const result=normalizeFederalRoster(await upstream(CANDIDATES_CSV,{asText:true,ttl:6*60*60*1000}));
  return success(true,result);
 }catch(e){return success(false,{races:[],contests:0},e.message)}
}
async function getCA(){
 const base=LINKS.sosFiles;
 try{
  // R and C hold candidate metadata and can arrive before V vote totals.
  const [r,c]=await Promise.all([
   upstream(base+'R26GG.txt',{asText:true}),
   upstream(base+'C26GG.txt',{asText:true,windows1252:true})
  ]);
  let v='',voteFileError=null;
  try{v=await upstream(base+'V26GG.txt',{asText:true})}catch(e){voteFileError=e.message}
  const parsed=parseSOS(r,c,v);
  if(parsed.races.length<50)throw new Error('California candidate feed returned too few contests');
  return success(true,{...parsed,voteFileError});
 }catch(e){return success(false,{races:[],updatedAt:null},e.message)}
}
function sourceHealth(la,ca){return [{name:'Los Angeles County',ok:la.ok,url:LINKS.la,error:la.error}, {name:'California SOS',ok:ca.ok,url:LINKS.sos,error:ca.error}];}
async function personal(){
 const [la,ca]=await Promise.all([getLA(),getCA()]);
 return {date:'2026-11-03',lastFetched:new Date().toISOString(),resultsBegin:ELECTION_RESULTS_BEGIN.toISOString(),items:resolveBallot(ballot,la.data.races,ca.data.races),mayor:resolveMayor(la.data.races),sources:sourceHealth(la,ca),sourceTimes:{la:la.data.updatedAt,ca:ca.data.updatedAt}};
}
async function california(){
 const [ca,la]=await Promise.all([getCA(),getLA()]);
 return {date:'2026-11-03',lastFetched:new Date().toISOString(),races:californiaRaces(ca.data.races,la.data.races),sources:sourceHealth(la,ca)};
}
async function national(office){
 const official=office==='house'?'House':'Senate';
 const fetches=[
  upstream(`https://openamerica.io/elections/results.json?year=2026&office=${official}`).then(r=>success(true,normalizeOpenAmerica(r,office))).catch(e=>success(false,[],e.message)),
  upstream(`https://watch.vote/api/elections/2026/results?office=${office}`).then(r=>success(true,normalizeWatch(r,office))).catch(e=>success(false,[],e.message)),
  getFederalRoster(),
  ...(office==='house'?[getCA()]:[])
 ];
 // Always keep the shared result providers in fixed positions. Senate does
 // not fetch CA House data, so conditional providers must come last.
 const [a,w,roster,ca]=await Promise.all(fetches);
 const races=mergeNational(a.data,w.data,ca?.data?.races||[],roster.data.races).filter(r=>r.office===office);
 return {date:'2026-11-03',office,lastFetched:new Date().toISOString(),races,reported:races.filter(r=>r.reported).length,coverage:races.filter(r=>r.source!=='Not yet covered').length,sources:[{name:'Open America — official state feeds (22 states)',ok:a.ok,url:LINKS.national,error:a.error},{name:'watch.vote election results',ok:w.ok,url:LINKS.watch,error:w.error},...(ca?[{name:'California Secretary of State',ok:ca.ok,url:LINKS.sos,error:ca.error}]:[]),{name:'Federal general-election candidate roster',ok:roster.ok,url:CANDIDATES_CSV,error:roster.error,contests:roster.data.contests}]};
}
// Portraits have an explicitly verified identity and source; do not guess photos
// from an ambiguous name-based Wikipedia lookup. The photo manifest is checked in.
const portraitKey=name=>String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const officialPortraits=Object.fromEntries(Object.entries(portraitPages).map(([name,data])=>[portraitKey(name),data]));
const imageCache=new Map();
// The externally verified portrait directory is optional. Failure never touches
// election-result records, their candidate names, or their vote totals.
const enrichmentCache=new Map();
const wikidataPhotoCache=new Map();
let wikidataCooldownUntil=0;
const providerCalls=[];
let portraitQueue=Promise.resolve();
let portraitCooldownUntil=0;
let portraitLastError=null;
const PHOTO_TTL=24*60*60*1000, MISS_TTL=6*60*60*1000;
const PROVIDER_WINDOW=10*60*1000, MAX_PROVIDER_CALLS=55;
function providerSlot(){
 const now=Date.now();while(providerCalls.length && now-providerCalls[0]>PROVIDER_WINDOW)providerCalls.shift();
 if(now<portraitCooldownUntil||providerCalls.length>=MAX_PROVIDER_CALLS)return false;
 providerCalls.push(now);return true;
}
function setPortraitCooldown(response){
 const retry=Number(response.headers.get('retry-after')||0);
 portraitCooldownUntil=Date.now()+Math.max(60,Math.min(600,Number.isFinite(retry)?retry:60))*1000;
}
async function receiveJson(req,limit=50000){
 let bytes=0,chunks=[];
 for await(const part of req){
  bytes+=part.length;
  if(bytes>limit){const error=new Error('Request body too large');error.status=413;throw error}
  chunks.push(part);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{const error=new Error('Invalid JSON');error.status=400;throw error}
}
async function requestPortraitBatch(lookups){
 if(!providerSlot())throw Error('Provider is rate limited or cooling down');
 const response=await fetch('https://watch.vote/api/elections/2026/portraits',{
  method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'ElectionAtlas2026/2.0'},
  body:JSON.stringify({lookups}),signal:AbortSignal.timeout(12500)
 });
 if(response.status===429)setPortraitCooldown(response);
 if(!response.ok)throw Error('watch.vote batch HTTP '+response.status);
 return parseBatchPortraits(await response.json(),lookups);
}
async function requestPortraitOne(lookup){
 if(!providerSlot())return {tried:false,photo:null};
 const response=await fetch(portraitGetUrl(lookup),{
  headers:{'Accept':'application/json','User-Agent':'ElectionAtlas2026/2.0'},signal:AbortSignal.timeout(7500)
 });
 if(response.status===429)setPortraitCooldown(response);
 if(!response.ok)throw Error('watch.vote individual HTTP '+response.status);
 const json=await response.json();
 return {tried:true,photo:normalizePortrait(json)};
}
function cachedPortraits(lookups){
 const now=Date.now(), portraits={};let missed=0;
 for(const item of lookups){
  const entry=enrichmentCache.get(lookupKey(item));
  if(!entry||now-entry.time>(entry.photo?PHOTO_TTL:MISS_TTL)){missed++;continue}
  if(entry.photo)portraits[lookupKey(item)]=entry.photo;
 }
 return {portraits,missed};
}
async function performPortraitEnrichment(lookups){
 const curated=curatedPortraitsFor(lookups,reviewedPhotos);
 const now=Date.now(),pending=lookups.filter(x=>{
  if(curated[lookupKey(x)])return false;
  const c=enrichmentCache.get(lookupKey(x));return !c||now-c.time>(c.photo?PHOTO_TTL:MISS_TTL);
 });
 let attempted=0,providerError=null;
 if(pending.length && Date.now()>=portraitCooldownUntil){
  let batch;
  try{
   batch=await requestPortraitBatch(pending);attempted+=pending.length;
   for(const item of pending){
    const key=lookupKey(item);
    if(batch.seen.has(key))enrichmentCache.set(key,{photo:batch.portraits.get(key)||null,time:Date.now()});
   }
  }catch(error){providerError=error.message;portraitLastError=providerError}
  // The documented batch route does not publish a complete example of its JSON
  // result structure. If fields can't be safely matched, fall back to the
  // documented GET contract for a bounded subset; never assign by array index.
  // If the documented batch response already identified candidates, do not
  // issue individual GETs: the provider can block them (403) even as POST works.
  const unresolved=(!batch||batch.recognized===0)?pending.filter(x=>!enrichmentCache.has(lookupKey(x))):[];
  const sample=unresolved.slice(0,10);
  for(let i=0;i<sample.length;i+=5){
   if(Date.now()<portraitCooldownUntil)break;
   await Promise.all(sample.slice(i,i+5).map(async item=>{
    try{
     const result=await requestPortraitOne(item);
     if(result.tried){
      enrichmentCache.set(lookupKey(item),{photo:result.photo,time:Date.now()});
      attempted++;
     }
    }catch(error){providerError=error.message;portraitLastError=providerError}
   }));
  }
 }
 const found=cachedPortraits(lookups);
 const wikidataPhotos={};let wikidataError=null, wikidataQueried=0;
 const due=[],nowAfter=Date.now();
 for(const lookup of lookups){
  const key=lookupKey(lookup),id=validFecId(lookup);
  if(!id||curated[key]||found.portraits[key])continue;
  const cached=wikidataPhotoCache.get(id);
  if(cached&&nowAfter-cached.time<(cached.photo?PHOTO_TTL:MISS_TTL)){
   if(cached.photo)wikidataPhotos[key]=cached.photo;
  }else due.push(lookup);
 }
 if(due.length && Date.now()>=wikidataCooldownUntil){
  try{
   const batch=await lookupWikidataCommonsPortraits(due.slice(0,100));
   wikidataQueried=batch.queried;
   for(const lookup of due.slice(0,100)){
    const id=validFecId(lookup);
    wikidataPhotoCache.set(id,{photo:batch.photos.get(id)||null,time:Date.now()});
   }
  }catch(error){
   wikidataError=error.message;wikidataCooldownUntil=Date.now()+60*1000;
   console.warn('Optional Wikimedia portrait lookup unavailable:',error.message);
  }
 }
 for(const lookup of lookups){
  const key=lookupKey(lookup),id=validFecId(lookup),cached=id&&wikidataPhotoCache.get(id);
  if(key && cached?.photo && !curated[key] && !found.portraits[key]){
   wikidataPhotos[key]={...cached.photo,proxyUrl:'/api/wikidata-candidate-photo?fec='+encodeURIComponent(id)};
  }
 }
 const portraits={...wikidataPhotos,...found.portraits,...curated};
 for(const [key,photo] of Object.entries(curated))
  portraits[key]={...photo,proxyUrl:'/api/reviewed-candidate-photo?key='+encodeURIComponent(key)};
 return {portraits,requested:lookups.length,matched:Object.keys(portraits).length,
  curated:Object.keys(curated).length,wikidata:Object.keys(wikidataPhotos).length,
  wikidataQueried,wikidataError,
  pending:Math.max(0,lookups.length-Object.keys(portraits).length),
  attempted,providerError,provider:'watch.vote + Wikidata FEC ID / Wikimedia Commons + reviewed photos',
  cooldown:Date.now()<portraitCooldownUntil,
  note:'Seat-verified and FEC-ID verified photos only. Sources and licenses attributed. No changes to vote data.'};

}
async function enrichPortraitRequest(req,res){
 let body;
 try{body=await receiveJson(req)}catch(error){return json(res,{error:error.message},error.status||400)}
 if(!Array.isArray(body?.lookups)||body.lookups.length<1||body.lookups.length>120)return json(res,{error:'Expected 1 to 120 candidate lookups'},400);
 const parsed=body.lookups.map(normalizeLookup);
 if(parsed.some(x=>!x))return json(res,{error:'Invalid candidate lookup'},400);
 const unique=[...new Map(parsed.map(x=>[lookupKey(x),x])).values()];
 const job=portraitQueue.then(()=>performPortraitEnrichment(unique));
 portraitQueue=job.catch(()=>{});
 try{return json(res,await job)}catch(error){
  console.warn('Portrait enrichment unavailable:',error.message);
  const reviewed=curatedPortraitsFor(unique,reviewedPhotos);
  const photos={...cachedPortraits(unique).portraits};
  for(const [key,photo] of Object.entries(reviewed))
   photos[key]={...photo,proxyUrl:'/api/reviewed-candidate-photo?key='+encodeURIComponent(key)};
  return json(res,{portraits:photos,requested:unique.length,matched:Object.keys(photos).length,
   curated:Object.keys(reviewed).length,pending:unique.length-Object.keys(photos).length,
   providerError:error.message,provider:'watch.vote + reviewed Wikimedia Commons'});
 }
}
async function getPortraits(){
 const portraits={};
 for(const [key,data] of Object.entries(officialPortraits)){
  portraits[key]={image:data.image,proxyUrl:'/api/candidate-photo?name='+encodeURIComponent(key),credit:data.credit,source:data.source};
 }
 return {portraits,availableCount:Object.keys(portraits).length,source:'Verified government-published photographs',note:'Curated verified matches only; the dashboard uses initials where an identifiable portrait is unavailable.'};
}
async function candidatePhoto(name,res){
 const info=officialPortraits[portraitKey(name)];
 if(!info)return json(res,{error:'No verified portrait for this candidate'},404);
 return serveKnownPhoto(info,res);
}
async function serveKnownPhoto(info,res){
 const cached=imageCache.get(info.image);
 try{
  let bytes,contentType;
  if(cached && Date.now()-cached.t<24*60*60*1000){bytes=cached.bytes;contentType=cached.contentType}
  else{
   const response=await fetch(info.image,{headers:{'User-Agent':'ElectionAtlas2026/2.0 (election results site; contact via GitHub project)'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Photo source returned HTTP '+response.status);
   contentType=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!['image/jpeg','image/png','image/webp'].includes(contentType))throw Error('Unexpected portrait content type');
   const size=Number(response.headers.get('content-length')||0);
   if(size>8*1024*1024)throw Error('Portrait too large');
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength>8*1024*1024)throw Error('Portrait too large');
   bytes=Buffer.from(buffer);
   imageCache.set(info.image,{bytes,contentType,t:Date.now()});
  }
  res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'public,max-age=21600','X-Content-Type-Options':'nosniff'});
  res.end(bytes);
 }catch(error){
  console.warn('Verified photo could not be served:',portraitKey(name),error.message);
  return json(res,{error:'Photo source temporarily unavailable'},502);
 }
}
function json(res,body,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(body));}
const mimes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
async function staticFile(url,res){
 let relative=decodeURIComponent(url.pathname);if(relative==='/')relative='/index.html';
 if(relative.includes('..')){res.writeHead(403);return res.end('Forbidden');}
 const full=path.resolve(root,'public','.'+relative);
 if(!full.startsWith(path.resolve(root,'public')+path.sep)){res.writeHead(403);return res.end('Forbidden');}
 try{const bytes=await readFile(full);res.writeHead(200,{'Content-Type':mimes[path.extname(full)]||'application/octet-stream','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'});res.end(bytes)}
 catch{res.writeHead(404);res.end('Not found')}
}
const server=http.createServer(async(req,res)=>{
 stats.requests++;
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 try {
  if(url.pathname==='/api/portraits')return json(res,await getPortraits());
  if(url.pathname==='/api/portrait-enrichment'){
   if(req.method!=='POST')return json(res,{error:'POST required'},405);
   return enrichPortraitRequest(req,res);
  }
  if(url.pathname==='/api/candidate-photo')return candidatePhoto(url.searchParams.get('name'),res);
  if(url.pathname==='/api/wikidata-candidate-photo'){
   const id=String(url.searchParams.get('fec')||'').toUpperCase();
   const cached=wikidataPhotoCache.get(id);
   return cached?.photo?serveKnownPhoto(cached.photo,res):json(res,{error:'No verified FEC-ID photo cached'},404);
  }
  if(url.pathname==='/api/reviewed-candidate-photo'){
   const photo=reviewedPhotos.get(url.searchParams.get('key')||'');
   return photo?serveKnownPhoto(photo,res):json(res,{error:'No reviewed portrait for this candidate and seat'},404);
  }
  if(url.pathname==='/api/health')return json(res,{ok:true,time:new Date().toISOString(),status:Date.now()<ELECTION_RESULTS_BEGIN.getTime()?'Pre-results — California polls open until 8 p.m. Pacific':'Results period',stats});
  if(url.pathname==='/api/map-topology'){
   // Census-derived boundaries bundled with the us-atlas npm package.
   const topology=JSON.parse(await readFile(path.join(root,'node_modules','us-atlas','states-albers-10m.json'),'utf8'));
   return json(res,topology);
  }
  if(url.pathname==='/api/ballot')return json(res,await personal());
  if(url.pathname==='/api/california')return json(res,await california());
  if(url.pathname==='/api/national'){
   const office=url.searchParams.get('office');if(!['house','senate'].includes(office))return json(res,{error:'office must be house or senate'},400);
   return json(res,await national(office));
  }
  if(url.pathname.startsWith('/api/'))return json(res,{error:'Unknown API endpoint'},404);
  if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
  return await staticFile(url,res);
 }catch(e){console.error('Request error:',e);return json(res,{error:e.message||'Unknown server error'},502)}
});
server.listen(PORT,HOST,()=>console.log(`\n2026 ELECTION ATLAS ready: http://${HOST}:${PORT}\nSource feeds refresh every 60 seconds. Do not expose this server directly to the Internet without a reverse proxy.\n`));
