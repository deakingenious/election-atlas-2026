import {nationalSkeleton, STATE_NAMES} from './states.mjs';
export const LINKS = {
 la: 'https://results.lavote.gov/electionresults/json?electionid=4348',
 sos: 'https://media.sos.ca.gov/',
 sosFiles: 'https://media.sos.ca.gov/media/',
 national: 'https://openamerica.io/elections/api/',
 watch: 'https://watch.vote/docs/api-reference/elections',
 laMayor: 'https://results.lavote.gov/',
};
export const ELECTION_RESULTS_BEGIN = new Date('2026-11-04T04:00:00.000Z'); // Nov 3, 8 PM PST
export const num = value => Number(String(value ?? '0').replace(/[^0-9.-]/g,'')) || 0;
export const norm = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const cleanName = value => String(value||'').replace(/\s+/g, ' ').trim();
const lower = value => String(value||'').toLowerCase();
export function pctCandidates(cands) {
 const clean = (Array.isArray(cands)?cands:[]).map(c=>({name:cleanName(c.name||c.Name||c.n||'Unnamed candidate'), party:c.party||c.Party||c.p||'', votes:num(c.votes??c.Votes??c.v), percent:null}));
 const total=clean.reduce((sum,c)=>sum+c.votes,0);
 clean.forEach(c=>{ c.percent=total?100*c.votes/total:null; });
 return clean.sort((a,b)=>b.votes-a.votes || a.name.localeCompare(b.name));
}
function anyVotes(r) {return !!r?.candidates?.some(c=>c.votes>0)}
function isoFromMedia(header) {
 const m=header?.match?.(/\[B\|CAS\|\d+\|(\d{8})\|(\d{6})/);
 if(!m)return null;
 const d=m[1],t=m[2];return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}-08:00`;
}
function pipeRecords(txt) {
 return String(txt||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('[')&&s.endsWith(']')).map(s=>s.slice(1,-1).split('|'));
}
// Direct implementation of California SOS's published C/R/V ASCII election-night feed.
// R = contest metadata; C = candidates; V = votes; county code 59 is the statewide/districtwide total.
export function parseSOS(rText,cText,vText) {
 const contests = new Map();const names=new Map();
 for(const rec of pipeRecords(rText))if(rec[0]==='R')contests.set(rec[3],{id:rec[3],title:cleanName(rec[4]),type:'state'});
 for(const rec of pipeRecords(cText))if(rec[0]==='C'){
   const id=rec[3];const name=cleanName(rec[10]||[rec[7],rec[8],rec[6]].filter(Boolean).join(' '));
   const cand={name:name||cleanName(rec[6]),party:rec[9]||'',votes:0};
   names.set(`${id}:${rec[4]}`,cand);
 }
 const results=[];
 const reportingAt=isoFromMedia(vText);
 for(const rec of pipeRecords(vText)) {
   if(rec[0]!=='V'||rec[4]!=='59')continue;
   const contest=contests.get(rec[3]);if(!contest)continue;
   const candidates=[];
   // State measures encode the number in the contest ID, not in R.title.
   // Judicial retention records put the justice's candidate ID at field 8,
   // then YES/votes/percent and NO/votes/percent in fields 9–14.
   const isMeasure=rec[3].startsWith('19');
   const isJudicial=rec[3].startsWith('14')||rec[3].startsWith('15');
   const startAt=isJudicial?9:8;
   const groupSize=isMeasure||isJudicial?3:4;
   for(let i=startAt;i+1<rec.length;i+=groupSize) {
     const id=rec[i];if(!id)continue;
     const votes=num(rec[i+1]);
     const meta=names.get(`${rec[3]}:${id}`);
     candidates.push({name:meta?.name||((id.toUpperCase()==='YES'||id.toUpperCase()==='NO')?id:`Candidate #${id}`),party:meta?.party||'',votes});
   }
   const parsed=pctCandidates(candidates);
   results.push({id:rec[3],title:contest.title,candidates:parsed,votes:parsed.reduce((s,x)=>s+x.votes,0),pctIn:num(rec[5]) && num(rec[6])?100*num(rec[5])/num(rec[6]):0,source:'California Secretary of State',sourceUrl:'https://electionresults.sos.ca.gov/',scope:'California / full district',reported:anyVotes({candidates:parsed}),updatedAt:reportingAt});
 }
 return {races:results,updatedAt:reportingAt};
}
export function parseLA(raw){
 const groups=raw?.Election?.ContestGroups||[];
 const races=groups.flatMap(g=>(g.Contests||[]).map(c=>{
   const candidates=pctCandidates(c.Candidates||[]);
   return {title:cleanName(c.Title),group:g.Name,kind:c.Type,candidates,votes:candidates.reduce((s,x)=>s+x.votes,0),scope:'Los Angeles County results',source:'LA County Registrar',sourceUrl:LINKS.la,reported:anyVotes({candidates}),updatedAt:raw.Timestamp||null,passRate:c.MeasurePassRate||null};
 }));
 return {races,updatedAt:raw?.Timestamp||null};
}
function countyMatch(item,race) {
 const t=norm(race.title),title=norm(item.title),id=item.id;
 const name = words=>words.every(word=>t.includes(word));
 if(id===1)return name(['STATE SENATOR','22']);
 if(id===2)return name(['ASSEMBLY','48']);
 if(id===3)return name(['UNITED STATES REPRESENTATIVE','31']);
 if(id===4)return name(['SAN GABRIEL VALLEY MUNICIPAL WATER','5']);
 if(id===5)return t==='SHERIFF'||t.includes('COUNTY SHERIFF');
 if(id>=6&&id<=9)return t.includes('JUDGE OF THE SUPERIOR COURT')&&new RegExp(`\\b${({6:'64',7:'65',8:'87',9:'131'})[id]}\\b`).test(t);
 if(id===10||id===11)return t.includes(`COUNTY MEASURE ${id===10?'A':'E'}`);
 const titles={12:'GOVERNOR',13:'LIEUTENANT GOVERNOR',14:'SECRETARY OF STATE',15:'CONTROLLER',16:'TREASURER',17:'ATTORNEY GENERAL',18:'INSURANCE COMMISSIONER',19:'MEMBER STATE BOARD OF EQUALIZATION 3',20:'SUPERINTENDENT OF PUBLIC INSTRUCTION'};
 if(id>=12&&id<=20)return id===12?t==='GOVERNOR':(id===15?t==='CONTROLLER':id===16?t==='TREASURER':t.includes(titles[id]));
 if(id>=21&&id<=34){const p=title.match(/PROPOSITION\s+(\d+)/)?.[1];return p&&new RegExp(`(?:STATE MEASURE|PROPOSITION|PROP) ${p}(?:\\b|$)`).test(t);}
 if(id>=35) {
  const surname=norm(item.title.split(' - ').at(-1)).split(' ').at(-1);
  return /JUSTICE|SUPREME COURT/i.test(t)&&t.includes(surname);
 }
 return false;
}
function sosMatch(item,race) {
 const t=norm(race.title),id=item.id;
 if(id===1)return t==='STATE SENATE DISTRICT 22';
 if(id===2)return t==='STATE ASSEMBLY MEMBER DISTRICT 48';
 if(id===3)return t==='UNITED STATES REPRESENTATIVE DISTRICT 31';
 if([4,5,6,7,8,9,10,11].includes(id))return false;
 const titles={12:'GOVERNOR',13:'LIEUTENANT GOVERNOR',14:'SECRETARY OF STATE',15:'CONTROLLER',16:'TREASURER',17:'ATTORNEY GENERAL',18:'INSURANCE COMMISSIONER',19:'BOARD OF EQUALIZATION MEMBER DISTRICT 3',20:'SUPERINTENDENT OF PUBLIC INSTRUCTION'};
 if(id>=12&&id<=20) return t===titles[id] || (id===20 && t.includes('SUPERINTENDENT OF PUBLIC INSTRUCTION'));
 if(id>=21&&id<=34){
   const p=Number(item.title.match(/Proposition (\d+)/)?.[1]);
   return Boolean(p && /^1900000000\d{2}$/.test(race.id) && Number(race.id.slice(-2))===p);
 }
 if(id>=35){
   const ids={35:'140000000004',36:'140000000006',37:'150000020300',38:'150000020400',39:'150000020500',40:'150000020600',41:'150000020700',42:'150000020101',43:'150000020102',44:'150000020201',45:'150000020203',46:'150000020301',47:'150000020401',48:'150000020402',49:'150000020403',50:'150000020601',51:'150000020701',52:'150000020801',53:'150000020802',54:'150000020803'};
   return race.id===ids[id];
 }
 return false;
}
function prefer(a,b) {return (a?.reported&&!b?.reported)?a:(b?.reported&&!a?.reported)?b:(a?.scope==='California / full district'?a:b);}
export function resolveBallot(items,laRaces=[],sosRaces=[]) {
 return items.map(item=>{
  const l=laRaces.find(r=>countyMatch(item,r));const s=sosRaces.find(r=>sosMatch(item,r));
  const match=(s && l)?prefer(s,l):(s||l);
  const fallback=item.kind==='measure'?['YES','NO']:item.choices.map(c=>String(c).replace(/ \(.*/,''));
  return {...item, candidates:match?.candidates?.length?match.candidates:pctCandidates(fallback.map(name=>({name,votes:0}))),votes:match?.votes||0,reported:!!match?.reported,pctIn:match?.pctIn??null,scope:match?.scope||'Awaiting source data',source:match?.source||'Ballot list',sourceUrl:match?.sourceUrl||'https://www.lavote.gov/',updatedAt:match?.updatedAt||null,matched:!!match};
 });
}
export function resolveMayor(laRaces=[]) {
 const match=laRaces.find(r=>/(?:LOS ANGELES CITY|CITY OF LOS ANGELES)/.test(norm(r.title))&&/MAYOR/.test(norm(r.title)))||null;
 return {id:'LA-MAYOR',title:'Los Angeles Mayor',kind:'candidate',category:'Los Angeles',candidates:match?.candidates?.length?match.candidates:pctCandidates([{name:'Karen Bass',votes:0},{name:'Nithya Raman',votes:0}]),votes:match?.votes||0,reported:!!match?.reported,pctIn:null,scope:'City of Los Angeles — county-reported',source:match?.source||'LA County Registrar',sourceUrl:LINKS.la,updatedAt:match?.updatedAt||null,matched:!!match};
}
export function normalizeOpenAmerica(raw,office) {
 const races=[];
 for(const [key,r] of Object.entries(raw?.races||{})){
  const state=key.slice(0,2).toUpperCase();
  races.push({id:office==='house'?key.toUpperCase():`${key.toUpperCase()}-S`,state,office,title:office==='house'?`${STATE_NAMES[state]||state} · ${key.slice(3)==='00'?'At-large':`District ${Number(key.slice(3))}`}`:`${STATE_NAMES[state]||state} · U.S. ${office==='senate'?'Senate':'Governor'}`,candidates:pctCandidates((r.cands||[]).map(c=>({name:c.n,party:c.p,votes:c.v}))),votes:num(r.total),pctIn:typeof r.pct_in==='number'?r.pct_in:null,reported:num(r.total)>0,called:false,source:'Official state election offices via Open America',sourceUrl:`https://openamerica.io/elections/api/`,updatedAt:raw.as_of||null});
 }
 return races;
}
function identifyWatchKey(row,office) {
 const r=String(row.raceId||row.id||row.race?.id||row.race?.raceId||row.slug||'').toUpperCase().replace(/_/g,'-');
 const state=(r.match(/(?:^|-)([A-Z]{2})(?:-|$)/)||[])[1]||String(row.state||row.race?.state||'').toUpperCase();
 if(!/^[A-Z]{2}$/.test(state))return null;
 if(office==='house'){
  const numMatch=r.match(/(?:HOUSE|CD|DISTRICT)[-\s]*(\d{1,2})$/)||r.match(/(?:^|-)(\d{1,2})$/);
  if(!numMatch)return null;
  return `${state}-${numMatch[1].padStart(2,'0')}`;
 }
 return `${state}${/SPECIAL/.test(r)?'-special':''}-S`;
}
export function normalizeWatch(raw,office) {
 const rows=Array.isArray(raw)?raw:(raw?.rows||raw?.races||raw?.results||raw?.data||[]);
 if(!Array.isArray(rows))return [];
 return rows.map(row=>{
  const id=identifyWatchKey(row,office);if(!id)return null;
  const r=row.result||row;
  const items=r.candidates||r.leaders||r.topTwo||r.top_two||r.cands||[];
  const candidates=pctCandidates(Array.isArray(items)?items.map(c=>({name:c.name||c.n||c.candidate||'',party:c.party||c.p,votes:c.votes??c.v??0})):[]);
  const votes=candidates.reduce((s,c)=>s+c.votes,0);
  return {id,state:id.slice(0,2),office,title:row.title||row.race?.title||id,candidates,votes,reported:votes>0,pctIn:typeof r.pctIn==='number'?r.pctIn:typeof r.reporting==='number'?r.reporting:null,called:Boolean(r.called||r.call?.called),source:'watch.vote',sourceUrl:'https://watch.vote/docs/api-reference/elections',updatedAt:r.updatedAt||r.asOf||null};
 }).filter(Boolean);
}
export function mergeNational(openAmerica=[],watch=[],caRaces=[]) {
 const all=nationalSkeleton();const byId=new Map(all.map(r=>[r.id,r]));
 for(const r of [...openAmerica,...watch]){
   if(!byId.has(r.id))continue;
   const old=byId.get(r.id);if(r.reported||!old.reported)byId.set(r.id,{...old,...r,title:old.title});
 }
 for(const r of caRaces){
  const m=r.title.match(/^United States Representative District (\d+)$/i);if(!m)continue;
  const id=`CA-${String(Number(m[1])).padStart(2,'0')}`;const old=byId.get(id);if(old&&r.candidates.length&&(!old.reported||r.reported))byId.set(id,{...old,...r,id,state:'CA',office:'house',title:old.title});
 }
 return Array.from(byId.values());
}
export function californiaRaces(sosRaces=[],laRaces=[]) {
 const out=[];
 const official=sosRaces.filter(r=>/^State Senate District \d+$/i.test(r.title)||/^State Assembly Member District \d+$/i.test(r.title)||/^Governor$/i.test(r.title));
 for(const r of official){
  let kind='assembly';if(/^State Senate/.test(r.title))kind='senate';if(r.title==='Governor')kind='governor';out.push({...r,kind});
 }
 if(!out.length){for(const r of laRaces){
  const t=norm(r.title);const kind=t==='GOVERNOR'?'governor':/STATE SENATOR.*DISTRICT/.test(t)?'senate':/MEMBER OF THE STATE ASSEMBLY.*DISTRICT/.test(t)?'assembly':null;
  if(kind)out.push({...r,kind});
 }}
 // Explicitly list every scheduled Assembly (80) / Senate (20) / Governor race, even if a source fails.
 const keys=new Set(out.map(r=>norm(r.title).match(/(?:DISTRICT|DIST) (\d+)/)?.[1]+'-'+r.kind));
 for(let i=1;i<=80;i++)if(!keys.has(i+'-assembly'))out.push({id:`CA-AD-${i}`,title:`State Assembly Member District ${i}`,kind:'assembly',candidates:[],votes:0,reported:false,source:'Awaiting California SOS source',scope:'California districtwide',matched:false});
 for(let i=2;i<=40;i+=2)if(!keys.has(i+'-senate'))out.push({id:`CA-SD-${i}`,title:`State Senate District ${i}`,kind:'senate',candidates:[],votes:0,reported:false,source:'Awaiting California SOS source',scope:'California districtwide',matched:false});
 if(!out.some(x=>x.kind==='governor'))out.push({id:'CA-GOV',title:'Governor',kind:'governor',candidates:[],votes:0,reported:false,source:'Awaiting California SOS source',scope:'California statewide',matched:false});
 const rank={governor:0,senate:1,assembly:2};return out.sort((a,b)=>(rank[a.kind]-rank[b.kind])||num(a.title.match(/\d+/)?.[0])-num(b.title.match(/\d+/)?.[0]));
}
