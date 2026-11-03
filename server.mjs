import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLA,parseSOS,resolveBallot,resolveMayor,californiaRaces,normalizeOpenAmerica,normalizeWatch,mergeNational,LINKS,ELECTION_RESULTS_BEGIN} from './lib/adapters.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||8787);
const SOURCE_TIMEOUT=10000, TTL=60000;
const stored=new Map();
const ballot=JSON.parse(await readFile(path.join(root,'public','ballot.json'),'utf8'));
const stats={requests:0,sourceCalls:0,sourceFailures:0};
async function upstream(url,{asText=false,windows1252=false}={}){
 const cached=stored.get(url);if(cached && Date.now()-cached.t<TTL)return cached.value;
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
async function getCA(){
 const base=LINKS.sosFiles;
 try{
  const [r,c,v]=await Promise.all([
   upstream(base+'R26GG.txt',{asText:true}),
   upstream(base+'C26GG.txt',{asText:true,windows1252:true}),
   upstream(base+'V26GG.txt',{asText:true})
  ]);
  const parsed=parseSOS(r,c,v);
  if(parsed.races.length<50)throw new Error('California media feed returned too few contests');
  return success(true,parsed);
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
  ...(office==='house'?[getCA()]:[])
 ];
 const [a,w,ca]=await Promise.all(fetches);
 const races=mergeNational(a.data,w.data,ca?.data?.races||[]).filter(r=>r.office===office);
 return {date:'2026-11-03',office,lastFetched:new Date().toISOString(),races,reported:races.filter(r=>r.reported).length,coverage:races.filter(r=>r.source!=='Not yet covered').length,sources:[{name:'Open America — official state feeds (22 states)',ok:a.ok,url:LINKS.national,error:a.error},{name:'watch.vote election results',ok:w.ok,url:LINKS.watch,error:w.error},...(ca?[{name:'California Secretary of State',ok:ca.ok,url:LINKS.sos,error:ca.error}]:[])]};
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
