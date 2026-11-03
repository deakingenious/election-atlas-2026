const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const fmt=n=>Number(n||0).toLocaleString('en-US');
const cap=s=>String(s||'').replace(/\b\w/g,c=>c.toUpperCase());
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reportStart=Date.parse('2026-11-04T04:00:00Z');
const serverURLs={la:'https://results.lavote.gov/electionresults/json?electionid=4348',sos:'https://electionresults.sos.ca.gov/',national:'https://openamerica.io/elections/api/',watch:'https://watch.vote/docs/api-reference/elections'};
const ui={view:'overview',query:'',ballotTab:'all',caTab:'all',nationalTab:'house',nationalState:'all',onlyReporting:false,expanded:new Set(),page:1,selectedState:'CA',theme:'dark',demo:false,loading:true,updated:null,sourceStatus:[],portraits:{},imageLoaded:new Set(),imageFailed:new Set(),federalPortraits:{},federalPhotoRequested:new Set(),federalPhotoBusy:false,federalPhotoRescan:false,federalPhotoStats:{requested:0,matched:0,unavailable:0,lastError:null,cooldown:false}};
const state={ballot:[],mayor:null,ca:[],house:[],senate:[],tiles:{},states:{},mapShapes:[],mapGeoError:null,nationalMeta:{},sources:[],errors:[]};
let refreshPromise=null;
const byId=id=>document.getElementById(id);
function isLivePeriod(){return Date.now()>=reportStart}
function relTime(iso){if(!iso)return 'No source timestamp';const d=new Date(iso);return isNaN(d)?String(iso):d.toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function partyClass(c){const p=String(c.party||'').toLowerCase();const n=String(c.name||'').toUpperCase();return n==='YES'?'yes':p.startsWith('d')||p.includes('democrat')?'dem':p.startsWith('r')||p.includes('republican')?'rep':'other'}
function candidatePortrait(c,large=false){
 const key=String(c.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const photo=c.enrichedPortrait?.image?c.enrichedPortrait:ui.portraits[key];
 const initials=String(c.name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 const fallback=`<span class="candidate-avatar-initials" aria-hidden="true">${html(initials)}</span>`;
 return `<span class="candidate-avatar ${large?'candidate-avatar-large':''} ${partyClass(c)}">${fallback}${photo?.image?`<img alt="Portrait of ${html(c.name)}" loading="${large?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer" data-photo-key="${html(key)}" title="${html([photo.credit,photo.license].filter(Boolean).join(' · '))}" data-proxy-src="${html(photo.proxyUrl||'')}" src="${html(photo.image)}"/>`:''}</span>`;
}
function candidateShort(c){const p=partyClass(c);return c.name==='YES'||c.name==='NO'?c.name:(p==='dem'?'D':p==='rep'?'R':'•')}
function sourceTag(r){const label=r.scope?.includes('Los Angeles')?'LA COUNTY':r.scope?.includes('California')?'STATEWIDE / DISTRICT':'SOURCE LIMITED';return `<span class="data-tag ${label==='LA COUNTY'?'source-la':'source-ca'}">${label}</span>`;}
function demoRace(r,index){const copy={...r,candidates:(r.candidates||[]).map(c=>({...c}))};if(copy.candidates.length<2)copy.candidates=[{name:'Illustrative candidate A',party:'Democratic',votes:0},{name:'Illustrative candidate B',party:'Republican',votes:0}];copy.candidates.forEach((c,i)=>{c.votes=Math.round(9500 + (index*1723)%40000 + (i===0?21000:9500)+(index%5)*7100 + i*7900)});copy.votes=copy.candidates.reduce((s,c)=>s+c.votes,0);copy.candidates.sort((a,b)=>b.votes-a.votes);copy.candidates.forEach(c=>c.percent=100*c.votes/copy.votes);copy.reported=true;copy.demo=true;copy.pctIn=45+(index*13)%55;copy.source='Illustrative demo values — not real returns';copy.scope='DEMO • SIMULATED';copy.updatedAt=new Date().toISOString();return copy;}
function getBallot(){return ui.demo?state.ballot.map((r,i)=>demoRace(r,i)):state.ballot}
function getMayor(){return ui.demo&&state.mayor?demoRace(state.mayor,11):state.mayor}
function getCA(){return ui.demo?state.ca.map((r,i)=>demoRace(r,i)):state.ca}
function getNational(office){const source=office==='house'?state.house:state.senate;return ui.demo?source.map((r,i)=>demoRace(r,i)):source}
// Federal images are keyed by office, state, district AND exact normalized name.
// This prevents assigning a similarly named candidate's image to the wrong seat.
function federalPhotoLookup(r,c){
 if(!r||!c?.name||!['house','senate'].includes(r.office)||!/^[A-Z]{2}$/.test(r.state||''))return null;
 if(/^(?:YES|NO|CANDIDATE\s*#)/i.test(c.name))return null;
 const lookup={name:c.name,state:r.state,office:r.office};
 if(r.office==='house'){
  const district=String(r.id||'').match(/-(\d{1,2})$/);
  if(!district)return null;
  lookup.district=String(Number(district[1])).padStart(2,'0');
 }
 if(c.candidateId)lookup.candidateId=c.candidateId;
 return lookup;
}
function federalPhotoKey(lookup){
 if(!lookup)return null;
 return lookup.office+'|'+lookup.state+'|'+(lookup.district||'S')+'|'+String(lookup.name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function applyFederalPhotos(){
 for(const race of [...state.house,...state.senate])for(const candidate of race.candidates||[]){
  const key=federalPhotoKey(federalPhotoLookup(race,candidate));
  if(key&&ui.federalPortraits[key])candidate.enrichedPortrait=ui.federalPortraits[key];
 }
}
async function enrichFederalPortraits(){
 if(ui.federalPhotoBusy){ui.federalPhotoRescan=true;return}
 if(ui.view!=='national'||document.hidden)return;
 const office=ui.nationalTab;
 const rows=(office==='senate'?state.senate:state.house).filter(r=>ui.nationalState==='all'||r.state===ui.nationalState);
 const lookups=[];
 for(const race of rows)for(const candidate of race.candidates||[]){
  const lookup=federalPhotoLookup(race,candidate),key=federalPhotoKey(lookup);
  if(!lookup||!key||ui.federalPhotoRequested.has(key))continue;
  if(ui.portraits[String(candidate.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')]?.image)continue;
  lookups.push(lookup);
 }
 if(!lookups.length)return;
 ui.federalPhotoBusy=true;
 try{
  for(let i=0;i<lookups.length;i+=100){
   if(document.hidden)break;
   const batch=lookups.slice(i,i+100);
   for(const item of batch)ui.federalPhotoRequested.add(federalPhotoKey(item));
   try{
    const response=await fetch('/api/portrait-enrichment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lookups:batch})});
    if(!response.ok)throw Error('Portrait enrichment: HTTP '+response.status);
    const data=await response.json();
    Object.assign(ui.federalPortraits,data.portraits||{});
    ui.federalPhotoStats.requested+=batch.length;
    ui.federalPhotoStats.matched=Object.keys(ui.federalPortraits).length;
    ui.federalPhotoStats.unavailable+=data.pending||0;
    ui.federalPhotoStats.lastError=data.providerError||null;
    ui.federalPhotoStats.cooldown=Boolean(data.cooldown);
    applyFederalPhotos();
    if(ui.view==='national'||ui.view==='sources')render();
    // Rate-limit and upstream errors are surfaced without stopping races.
    if(data.cooldown){
     for(const item of batch)if(!ui.federalPortraits[federalPhotoKey(item)])ui.federalPhotoRequested.delete(federalPhotoKey(item));
     break;
    }
   }catch(error){
    for(const item of batch)ui.federalPhotoRequested.delete(federalPhotoKey(item));
    ui.federalPhotoStats.lastError=error.message;
    console.warn('Federal photos unavailable:',error.message);
    break;
   }
  }
 }finally{
  ui.federalPhotoBusy=false;
  if(ui.federalPhotoRescan){ui.federalPhotoRescan=false;setTimeout(()=>enrichFederalPortraits(),0)}
 }
}
function rowHas(r){return !!r?.reported && Number(r.votes)>0}
function reportingCount(rows){return rows.filter(rowHas).length}
function latestStamp(){return ui.updated?`Refreshed ${relTime(ui.updated)}`:'No successful refresh'}
function updateTopChrome(){
 const name={overview:'OVERVIEW',ballot:'MY BALLOT',mayor:'LOS ANGELES MAYOR',california:'CALIFORNIA',national:'FEDERAL RACES',map:'U.S. MAP',sources:'DATA SOURCES'};
 byId('view-breadcrumb').textContent=name[ui.view];
 $$('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view===ui.view));
 const reporting=[...state.ballot,...state.house,...state.senate].some(rowHas);const pre=!isLivePeriod();
 byId('top-status').innerHTML=`<span class="pulse-dot"></span> ${ui.demo?'DEMO DATA':pre?'BEFORE FIRST RETURNS':reporting?'COUNTING IN PROGRESS':'AWAITING REPORTS'}`;
 byId('top-status').classList.toggle('live',reporting&&!ui.demo);
 byId('sidebar-feed-status').textContent=ui.demo?'Demo preview enabled':reporting?'Reported votes available':pre?'Polls close 8 PM PST':'Waiting for reporting';
 byId('side-pulse').classList.toggle('on',reporting&&!ui.demo);
 byId('ticker-copy').textContent=ui.demo?'DEMO PREVIEW ACTIVE: values shown are fictional. Switch Demo off for real reported returns.':pre?'California publishes first returns after polls close at 8:00 p.m. Pacific. Live counts may begin earlier elsewhere.':'Results are unofficial and can change for days or weeks. A candidate leading is not a declared winner.';
 byId('ticker-time').textContent=new Date().toLocaleString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 byId('footer-updated').textContent=latestStamp();
}
function elHead(eyebrow,title,description,actions=''){return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-description">${description}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`}
function badgeStatus(r){return rowHas(r)?`<span class="reported">${r.demo?'DEMO · ':''}${fmt(r.votes)} votes</span>`:`<span class="waiting">Awaiting results</span>`;}
function miniBar(r){
 if(!rowHas(r))return '<div class="under-note">The source has not reported counted votes for this contest.</div>';
 const c=r.candidates||[];return `<div class="progress-track">${c.map(x=>`<span class="progress-segment ${partyClass(x)}" style="width:${x.percent||0}%"></span>`).join('')}</div>`;
}
function miniRace(r,idx){if(!r)return '';
 const c=(r.candidates||[]).slice(0,2);
 return `<div class="race-mini"><div class="race-mini-top"><div class="race-mini-title">${html(r.title)}</div><div class="race-mini-meta">${rowHas(r)?`${fmt(r.votes)} votes`:'NO REPORT'}</div></div>${c.map(x=>`<div class="winner-row"><span class="candidate-name">${html(x.name)}</span><span class="vote-total">${rowHas(r)?`${(x.percent||0).toFixed(1)}% · ${fmt(x.votes)}`:'Awaiting'}</span></div>`).join('')}${miniBar(r)}${!c.length?'<div class="under-note">Waiting for the official candidate roster or first returns.</div>':''}</div>`;
}
function tabButtons(tabs,selected,action){return `<div class="tab-switch">${tabs.map(t=>`<button type="button" class="tab ${selected===t[0]?'active':''}" data-action="${action}" data-value="${t[0]}">${t[1]}</button>`).join('')}</div>`;}
function demoButton(){return `<label class="toggle-line"><input type="checkbox" id="demo-switch" ${ui.demo?'checked':''}/> Demo preview</label>`}
function demoNotice(){return ui.demo?'<div class="notice-band demo-warning"><strong>DEMONSTRATION MODE — FICTIONAL DATA.</strong> Every count displayed here is synthetic and is not an election result. Toggle Demo preview off to view live sources.</div>':''}
function preNotice(){return !ui.demo&&!isLivePeriod()?'<div class="notice-band">California election officials do not release results until polls close at <strong>8 p.m. Pacific on November 3.</strong> All 54 contests are listed now; their totals will populate as providers report. National feeds may begin reporting in earlier time zones.</div>':''}
function metric(label,value,note,icon='◇'){return `<article class="metric-card"><div class="metric-top"><div class="metric-label">${label}</div><div class="metric-icon">${icon}</div></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`}
function onDeck(items){return items.filter(x=>!ui.query||matches(x,ui.query))}
function matches(r,q){const text=[r.title,r.id,r.category,...(r.candidates||[]).map(c=>c.name)].join(' ').toLowerCase();return text.includes(String(q||'').toLowerCase())}
function overview(){const ballot=getBallot(),house=getNational('house'),senate=getNational('senate'),ca=getCA(),mayor=getMayor();
 const total=reportingCount(ballot),houseCount=reportingCount(house),senateCount=reportingCount(senate),caCount=reportingCount(ca);
 return `<div class="hero"><div><div class="eyebrow">TUESDAY, NOVEMBER 3, 2026</div><h1>Election night, all in one place.</h1><p>Follow your exact 54 ballot contests alongside LA, California and federal races — with clear vote totals, reporting scope and trusted sources.</p><button class="refresh-button" type="button" data-view="ballot" style="margin-top:9px">Explore my ballot <span>→</span></button></div><div class="hero-right"><div class="hero-num">54</div><div class="hero-label">PERSONAL BALLOT ITEMS</div><div class="hero-small">${total} reporting · ${54-total} awaiting</div></div></div>
 <div class="metric-grid">
 ${metric('Your ballot',`${total} / 54`,'Contests with real reported votes','☷')}
 ${metric('California Legislature',`${caCount} / 101`,'Governor + 20 Senate + 80 Assembly','◈')}
 ${metric('U.S. House',`${houseCount} / 435`,'Districts with reported votes','▦')}
 ${metric('U.S. Senate',`${senateCount} / 35`,'Scheduled races with reported votes','▤')}
 </div>${demoNotice()}${preNotice()}
 <div class="columns"><section class="panel panel-pad"><div class="panel-header"><div><div class="panel-title">Los Angeles Mayor</div><div class="panel-caption">2026 general election · City of Los Angeles</div></div><button class="panel-link" data-view="mayor">VIEW RACE ↗</button></div>${miniRace(mayor)}</section>
 <section class="panel panel-pad"><div class="panel-header"><div><div class="panel-title">Propositions to watch</div><div class="panel-caption">California · Statewide (or clearly labeled county-only fallback)</div></div><button class="panel-link" data-view="ballot">SEE ALL 14 ↗</button></div>${[29,30,31].map(i=>miniRace(ballot.find(r=>r.id===i),i)).join('')}</section></div>
 <div class="columns columns-equal"><section class="panel panel-pad"><div class="panel-header"><div><div class="panel-title">My ballot tracker</div><div class="panel-caption">Your personal districts and local measures</div></div><button class="panel-link" data-view="ballot">OPEN BALLOT ↗</button></div>${ballot.slice(0,5).map(x=>`<div class="race-mini" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="race-mini-title">${html(x.title)}</div><div class="panel-caption">${html(x.category)}</div></div>${badgeStatus(x)}</div>`).join('')}</section>
 <section class="panel panel-pad"><div class="panel-header"><div><div class="panel-title">Coverage and transparency</div><div class="panel-caption">What the dashboard can substantiate</div></div><button class="panel-link" data-view="sources">ALL SOURCES ↗</button></div><p class="page-description" style="font-size:12px">Official California and LA County results are displayed by jurisdiction. Nationwide data depends on third-party aggregation of state-office feeds and may have missing states or districts.</p><div class="stats-line"><span class="data-tag source-ca">STATEWIDE</span><span>California SOS totals</span></div><div class="stats-line"><span class="data-tag source-la">LA COUNTY</span><span>Local election results</span></div><div class="stats-line"><span class="data-tag">PARTIAL NATIONAL COVERAGE</span></div><div class="under-note">No winners or forecasts are inferred from a vote lead.</div></section></div>`;
}
function raceRow(r,key,number){const expanded=ui.expanded.has(key),list=r.candidates||[];
 const portraits=list.filter(c=>!!(c.enrichedPortrait?.image||ui.portraits[String(c.name||'').toUpperCase().replace(/[^A-Z0-9]/g,'')]?.image)).slice(0,2);
 return `<div class="race-row ${expanded?'expanded':''}" data-race="${html(key)}"><div class="race-summary" data-action="expand" data-value="${html(key)}" role="button" tabindex="0" aria-expanded="${expanded}"><div class="race-id">${number||'◈'}</div><div class="race-main"><div class="race-title">${html(r.title)}</div><div class="race-sub">${r.scope?html(r.scope)+' · ':''}${list.length?html(list.map(x=>`${x.name}${x.party?' ('+x.party+')':''}`).join(' / ')):'Candidate roster not yet available'}</div></div><div class="race-right">${portraits.length?`<div class="race-preview-portraits" aria-label="Available candidate portraits">${portraits.map(c=>candidatePortrait(c)).join('')}</div>`:''}<span class="race-meta">${badgeStatus(r)}</span><span class="race-chevron">›</span></div></div><div class="race-detail"><div class="candidate-list">${list.length?list.map(c=>`<div class="candidate-item"><div class="candidate-caption"><div class="candidate-left">${candidatePortrait(c)}<span class="party-chip ${partyClass(c)}">${html(candidateShort(c))}</span><span class="candidate-identity"><strong class="candidate-name">${html(c.name)}</strong>${r.id==='LA-MAYOR'?`<small class="candidate-party">Nonpartisan ballot · Democratic affiliation</small>`:c.party?`<small class="candidate-party">${html(c.party)}</small>`:''}</span></div><span class="candidate-votes">${rowHas(r)?`${fmt(c.votes)} · ${(c.percent||0).toFixed(1)}%`:'Not reported'}</span></div><div class="bar"><span class="${partyClass(c)}" style="width:${rowHas(r)?(c.percent||0):0}%"></span></div></div>`).join(''):'<p class="detail-empty">Candidate and vote details have not been published in the accessible feed. No figures are inferred.</p>'}</div><div class="detail-meta"><span>${r.pctIn?`${r.pctIn.toFixed(1)}% reporting (provider units)`:'Precinct reporting not available'}</span><span>Source: ${html(r.source||'Not connected')}</span>${r.candidateSource?`<span>Names: ${html(r.candidateSource)}</span>`:''}${r.updatedAt?`<span>As of ${html(relTime(r.updatedAt))}</span>`:''}${r.sourceUrl?`<a target="_blank" rel="noopener noreferrer" href="${html(r.sourceUrl)}">Verify official/source results ↗</a>`:''}</div></div></div>`;
}
function groupLabel(title){return `<div class="section-group"><strong>${html(title)}</strong></div>`}
function ballotView(){let rows=onDeck(getBallot());if(ui.ballotTab!=='all')rows=rows.filter(r=>r.category===ui.ballotTab);
 const groups=[...new Set(rows.map(r=>r.category))];return elHead('MY ELECTION · AZUSA, CA','My 54-item ballot','The exact set of offices, propositions and judicial retention questions from your sample ballot. Each result includes its geographic reporting scope.',`<button type="button" class="small-button" data-action="export">↓ Export CSV</button>${demoButton()}`)+demoNotice()+preNotice()+`<div class="toolbar">${tabButtons([['all','All 54'],['Local & judicial contests','Local & county'],['Statewide offices','Statewide offices'],['California propositions','Propositions'],['Judicial retention','Retention judges']],ui.ballotTab,'ballot-tab')}<div class="count-label">Showing ${rows.length} of 54</div></div>`+(rows.length?groups.map(g=>`${groupLabel(g)}<div class="race-list">${rows.filter(x=>x.category===g).map(x=>raceRow(x,'b'+x.id,String(x.id).padStart(2,'0'))).join('')}</div>`).join(''):`<div class="panel empty-state"><div class="empty-symbol">⌕</div><div class="empty-title">No matching ballot items</div>Try a broader search or a different tab.</div>`);
}
function mayorView(){const r=getMayor();const list=r?.candidates||[];
 return elHead('LOS ANGELES · CITY ELECTION','The race for Mayor','City of Los Angeles mayoral election — not part of your Azusa ballot. Results provided by the LA County Registrar; this view is for tracking the additional contest.',`${demoButton()}`)+demoNotice()+preNotice()+`<div class="mayor-hero"><div class="eyebrow">CITY OF LOS ANGELES · NOV 3, 2026</div><div class="mayor-headline">The mayoral contest</div><div class="mayor-banner">${badgeStatus(r)} · ${r?.updatedAt?`Source updated ${html(relTime(r.updatedAt))}`:'Awaiting official data'}<br/>The first official vote totals begin after California polls close.</div></div><div class="mayor-race-note">The mayoral election is nonpartisan: party labels are not printed on the ballot. Both 2026 finalists are affiliated with the Democratic Party.</div><div class="mayor-comparison">${list.slice(0,2).map((c,i)=>`<article class="candidate-feature">${candidatePortrait(c,true)}<h3>${html(c.name)}</h3><div class="mayor-affiliation"><span class="data-tag">NONPARTISAN ELECTION</span><span class="affiliation-label">Democratic affiliation</span></div><div class="feature-votes">${rowHas(r)?fmt(c.votes):'—'}</div><div class="feature-pct">${rowHas(r)?`${(c.percent||0).toFixed(1)}% of reported vote`:'Awaiting first published count'}</div><div class="bar"><span class="${partyClass(c)}" style="width:${rowHas(r)?c.percent:0}%"></span></div></article>`).join('')}</div><div class="panel panel-pad" style="margin-top:18px"><div class="panel-header"><div class="panel-title">Official result details</div><a class="panel-link" target="_blank" rel="noopener noreferrer" href="${serverURLs.la}">LA COUNTY SOURCE ↗</a></div>${r?raceRow(r,'mayor-card','LA'):'<p class="detail-empty">Awaiting data.</p>'}<div class="under-note">Leading in a partial tally does not mean a candidate has been elected.</div></div>`;
}
function paginate(rows,count=28){const p=Math.max(1,Math.min(ui.page,Math.ceil(rows.length/count)||1));ui.page=p;return {rows:rows.slice((p-1)*count,p*count),page:p,pages:Math.ceil(rows.length/count)||1};}
function paginator(pages,page,total){return `<div class="pagination"><span>Showing page ${page} of ${pages} · ${total} contests</span><div><button type="button" data-action="page-prev" ${page<=1?'disabled':''}>← Previous</button><button type="button" data-action="page-next" ${page>=pages?'disabled':''}>Next →</button></div></div>`}
function californiaView(){let rows=onDeck(getCA());if(ui.caTab!=='all')rows=rows.filter(r=>r.kind===ui.caTab);if(ui.onlyReporting)rows=rows.filter(rowHas);
 const {rows:pageRows,page,pages}=paginate(rows);return elHead('CALIFORNIA · STATE GOVERNMENT','California results','All 80 State Assembly contests, 20 scheduled State Senate races, and the Governor election. Prefer statewide California SOS returns over LA County subtotals.',demoButton())+demoNotice()+preNotice()+`<div class="toolbar">${tabButtons([['all','All 101'],['governor','Governor'],['senate','State Senate (20)'],['assembly','State Assembly (80)']],ui.caTab,'ca-tab')}<div class="toolbar-right"><label class="toggle-line"><input id="only-reporting" type="checkbox" ${ui.onlyReporting?'checked':''}/> Reporting only</label><span class="count-label">${rows.length} races</span></div></div><div class="notice-band">Statewide/districtwide results are taken from the California Secretary of State when available. A Los Angeles County fallback is labeled as a county-only subtotal, <strong>not</strong> a statewide result.</div><div class="race-list">${pageRows.map((r,i)=>raceRow(r,'ca'+(r.id||r.title),String((page-1)*28+i+1).padStart(2,'0'))).join('')||'<div class="empty-state">No races match the current filters.</div>'}</div>${paginator(pages,page,rows.length)}`;
}
function nationalView(){const office=ui.nationalTab;let rows=getNational(office);if(ui.nationalState!=='all')rows=rows.filter(r=>r.state===ui.nationalState);rows=onDeck(rows);if(ui.onlyReporting)rows=rows.filter(rowHas);const {rows:pageRows,page,pages}=paginate(rows,28);const states=[...new Set(getNational(office).map(r=>r.state))].sort();const coverage=state.nationalMeta[office]?.coverage||0;
 const feedError=!getNational(office).length?'<div class="callout" role="alert"><strong>Race inventory unavailable.</strong> This is a data-service error, not a zero-vote result. Check <a href="/api/national?office='+office+'" target="_blank" rel="noopener noreferrer">the '+office+' API</a> or refresh after the server recovers.</div>':'';
 return elHead('UNITED STATES · FEDERAL ELECTIONS','House & Senate results','Search every scheduled federal contest. Reported votes are drawn from available public election feeds; unavailable states and districts are clearly identified.',demoButton())+demoNotice()+feedError+`<div class="metric-grid">${metric('Scheduled contests',office==='house'?'435':'35','All seats/races on the 2026 ballot','▤')}${metric('With reported votes',reportingCount(getNational(office)),'No missing result is treated as zero','◈')}${metric('Feed coverage',ui.demo?'DEMO':coverage,'Source records available · may be partial','◉')}${metric('Source refresh','60 sec','Backend cache; automatic updates','↻')}</div><div class="notice-band">The nationwide feeds are <strong>partial</strong>: some states provide no accessible automated live feed. A seat with no results means <strong>source coverage unavailable or not yet reporting</strong>, not a zero-vote outcome. The dashboard never infers a winner from a lead.</div><div class="toolbar">${tabButtons([['house','U.S. House · 435'],['senate','U.S. Senate · 35']],office,'national-tab')}<div class="toolbar-right"><select class="control-select" id="national-state" aria-label="Filter by state"><option value="all">All states</option>${states.map(s=>`<option ${ui.nationalState===s?'selected':''} value="${s}">${html(state.states[s]||s)}</option>`).join('')}</select><label class="toggle-line"><input id="only-reporting" type="checkbox" ${ui.onlyReporting?'checked':''}/> Reporting only</label></div></div><div class="race-list">${pageRows.map((r,i)=>raceRow(r,'n'+r.id,String((page-1)*28+i+1).padStart(2,'0'))).join('')||'<div class="empty-state">No races found for this filter.</div>'}</div>${paginator(pages,page,rows.length)}`;
}
function stateVoteStats(code){const races=getNational('house').filter(r=>r.state===code);let d=0,r=0,other=0;const reporting=races.filter(rowHas);for(const race of reporting){const leader=race.candidates[0];if(!leader)continue;const cls=partyClass(leader);if(cls==='dem')d++;else if(cls==='rep')r++;else other++;}return {d,r,other,all:races.length,reporting:reporting.length,party:reporting.length?(d>r?'dem':r>d?'rep':'tie'):'none'};}
// Convert pre-projected us-atlas TopoJSON arcs into interactive SVG state polygons.
// Alaska and Hawaii are already inset by the Albers USA composite projection.
function parseMapTopology(topology,names){
 if(topology?.type!=='Topology'||!Array.isArray(topology.arcs)||!Array.isArray(topology.objects?.states?.geometries))throw Error('Invalid U.S. map topology');
 const {scale=[1,1],translate=[0,0]}=topology.transform||{};
 const arcs=topology.arcs.map(steps=>{let x=0,y=0;return steps.map(([dx,dy])=>{x+=dx;y+=dy;return [x*scale[0]+translate[0],y*scale[1]+translate[1]]})});
 const codeFor=Object.fromEntries(Object.entries(names).map(([code,name])=>[name.toUpperCase(),code]));
 function arcCoords(index){const points=arcs[index<0?~index:index];return index<0?[...points].reverse():points;}
 function ringPath(indices){let pts=[];for(const index of indices){const arc=arcCoords(index);pts.push(...(pts.length?arc.slice(1):arc));}return pts.length?`M${pts.map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`:'';}
 function polyPaths(rings){return rings.map(ringPath).join('');}
 const shapes=[];
 for(const geometry of topology.objects.states.geometries){
  const code=codeFor[String(geometry.properties?.name||'').toUpperCase()];
  if(!code || !('arcs' in geometry))continue;
  const d=geometry.type==='Polygon'?polyPaths(geometry.arcs):geometry.type==='MultiPolygon'?geometry.arcs.map(polyPaths).join(''):'';
  if(d)shapes.push({code,d});
 }
 if(shapes.length<50)throw Error(`Only ${shapes.length} states in geography data`);
 return shapes;
}
function mapSvg(){
 if(!state.mapShapes.length)return `<div class="map-loading"><span aria-hidden="true">◈</span>${state.mapGeoError?'Geographic boundaries unavailable. Reload the page to retry.':'Loading U.S. state outlines…'}</div>`;
 return `<svg class="map-svg geographic-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 975 610" role="group" aria-label="Geographic map of the United States with Alaska and Hawaii insets. Select a state for reported House election results">${state.mapShapes.map(({code:s,d})=>{const st=stateVoteStats(s);const name=state.states[s]||s;return `<g class="state-group ${st.party}" data-action="map-state" data-value="${s}" tabindex="0" role="button" aria-label="${html(name)}, ${st.reporting} of ${st.all} House districts reporting"><title>${html(name)}: ${st.reporting}/${st.all} House districts reporting</title><path class="state-shape ${st.party} ${ui.selectedState===s?'selected':''}" d="${d}" fill-rule="evenodd"/></g>`}).join('')}</svg>`;
}
function mapView(){const rows=getNational('house').filter(x=>x.state===ui.selectedState);const st=stateVoteStats(ui.selectedState);const name=state.states[ui.selectedState]||ui.selectedState;
 return elHead('UNITED STATES · GEOGRAPHIC VIEW','U.S. election map','A geographic map of the 50 states with Alaska and Hawaii insets. Colors indicate which party leads in more of the state’s reporting U.S. House districts — not race calls or final statewide results.',demoButton())+demoNotice()+`<div class="map-shell"><div class="panel map-panel"><div class="panel-header"><div><h3>House district reporting by state</h3><div class="map-subtitle">Select a state to explore available vote counts.</div></div><span class="data-tag">2026 LIVE FEEDS</span></div><div class="map-area">${mapSvg()}</div><div class="map-legend"><span><i class="legend-dot dem"></i>More D district leads</span><span><i class="legend-dot rep"></i>More R district leads</span><span><i class="legend-dot tie"></i>Tied</span><span><i class="legend-dot"></i>No reported results</span></div><div class="under-note">Geographic boundaries: U.S. Census Bureau (via us-atlas); Alaska and Hawaii shown as insets. Colors reflect reported House-district leads, not statewide popular vote or race calls. Missing data is not counted as votes.</div></div><aside class="panel map-detail"><div class="eyebrow">SELECTED STATE</div><div class="state-big">${html(name)}</div><div class="panel-caption">${ui.selectedState} · Congressional House races</div><div class="state-detail-counter"><div class="state-count"><b>${st.reporting}/${st.all}</b><span>Districts reporting</span></div><div class="state-count"><b>${st.d} / ${st.r}</b><span>D / R leading districts</span></div></div><div class="panel-caption">${st.reporting?'Based on incomplete reported returns.':'No reported district votes in connected feeds.'}</div><div class="small-progress"><span style="width:${st.all?st.reporting/st.all*100:0}%"></span></div><button type="button" class="small-button" data-action="state-drill" style="width:100%;margin-top:18px">Explore ${html(name)} races ↗</button><div class="section-group"><strong>District snapshot</strong></div>${rows.slice(0,7).map(r=>`<div class="race-mini" style="display:flex;justify-content:space-between;gap:10px"><div class="race-mini-title">${html(r.title.split('·').at(-1)?.trim()||r.id)}</div>${rowHas(r)?`<span class="reported">${fmt(r.votes)}</span>`:`<span class="race-mini-meta">Pending</span>`}</div>`).join('')}</aside></div>`;
}
function candidatePortraitCoverage(){
 const listed=new Map();
 for(const r of [...state.ballot,...state.ca,...state.house,...state.senate,...(state.mayor?[state.mayor]:[])]){
  for(const c of r?.candidates||[]){
   const name=String(c.name||'').trim();
   if(!name||/^(?:YES|NO|Candidate #)/i.test(name))continue;
   const key=name.toUpperCase().replace(/[^A-Z0-9]/g,'');listed.set(key,(listed.get(key)||false)||Boolean(c.enrichedPortrait?.image||ui.portraits[key]?.image));
  }
 }
 const linked=[...listed.values()].filter(Boolean).length;
 return {listed:listed.size,linked,missing:Math.max(0,listed.size-linked)};
}
function sourcesView(){const sources=[{name:'Los Angeles County Registrar',description:'November 3 official county feed: the 54-item local contests, city of Los Angeles mayor, all LA County judge races and county measures.',url:serverURLs.la,group:'Official',status:state.sources.find(x=>x.name==='Los Angeles County')},{name:'California Secretary of State',description:'Official statewide/districtwide returns from 2026 C/R/V election-night files, covering the 80 Assembly, 20 Senate, statewide candidates and 14 propositions.',url:'https://media.sos.ca.gov/',group:'Official',status:state.sources.find(x=>x.name==='California SOS')},{name:'Open America',description:'Public national feed of reported U.S. House and Senate results from 22 state election-office adapters. It provides reported counts but does not call winners.',url:serverURLs.national,group:'National',status:state.nationalMeta.house?.sources?.[0]},{name:'watch.vote',description:'Additional national public API with reported vote data and attributable source references. Data may change and coverage is not guaranteed.',url:serverURLs.watch,group:'National',status:state.nationalMeta.house?.sources?.[1]}];
 const pc=candidatePortraitCoverage();
 return elHead('DATA PROVENANCE','Source transparency','Where every number comes from, how often data is refreshed, and what cannot be inferred from unofficial election-night returns.',demoButton())+demoNotice()+`<div class="panel panel-pad" style="margin-bottom:20px"><div class="panel-title">Candidate portrait coverage</div><div class="page-description">${pc.linked} candidates with verified photo links / ${pc.listed} distinct candidates currently in the loaded lists. ${pc.missing} do not have an identified photo yet.</div><div class="under-note">Images observed loading this browser session: ${ui.imageLoaded.size} successful, ${ui.imageFailed.size} failed. Federal provider lookup attempted: ${ui.federalPhotoStats.requested}, returned verified photo links: ${ui.federalPhotoStats.matched}. ${ui.federalPhotoStats.lastError?'Latest enrichment error: '+html(ui.federalPhotoStats.lastError):''} Unvisited/lazy-loaded portraits have not been tested.</div><div class="under-note">Candidate portraits are independently sourced from official government publications or credited Commons files. A linked image may still fail to load if its source restricts access, in which case initials remain visible. This count is metadata coverage, not a guarantee that every photo URL responds.</div></div><div class="notice-band">This viewer does <strong>not</strong> conduct projections or independently call elections. Even if a candidate has 100% of currently reported votes, that does not establish an official victory. California certifies results after the canvass.</div>${sources.map(s=>`<article class="source-card"><div><div class="eyebrow">${s.group.toUpperCase()} SOURCE</div><h3>${html(s.name)}</h3><p>${html(s.description)}</p><a class="source-anchor" href="${s.url}" target="_blank" rel="noopener noreferrer">Open provider documentation/results ↗</a></div><span class="source-pill ${s.status?.ok?'up':'down'}">${s.status? (s.status.ok?'● FEED REACHABLE':'● UNAVAILABLE'):'● NOT CHECKED'}</span></article>`).join('')}<div class="panel panel-pad" style="margin-top:20px"><div class="panel-title">Live diagnostics</div><div class="page-description">Last refresh: ${html(latestStamp())}</div><div class="under-note">Each provider is independently fetched and cached on the Node server for 60 seconds. An unavailable feed does not affect your ability to browse the lists of scheduled contests.</div><div class="under-note">LA County results may be shown for statewide contests only as a prominently labeled county subtotal if California's statewide feed is inaccessible.</div><div class="under-note">National results data cannot currently guarantee a complete election-night feed for all 435 districts. Missing source coverage is explicitly labeled in the national explorer.</div></div>`;
}
function render(){updateTopChrome();const root=byId('page-content');root.innerHTML=({overview,ballot:ballotView,mayor:mayorView,california:californiaView,national:nationalView,map:mapView,sources:sourcesView}[ui.view]||overview)();document.title=`${({overview:'Overview',ballot:'My Ballot',mayor:'LA Mayor',california:'California',national:'Federal Results',map:'U.S. Map',sources:'Sources'})[ui.view]} · Election Atlas ’26`;}
function downloadCSV(){const data=getBallot();const columns=['Ballot #','Contest','Scope','Candidate or selection','Votes','Percent','Reporting','Source','Updated'];const rows=[columns];for(const r of data){for(const c of r.candidates?.length?r.candidates:[{name:'Unavailable',votes:0,percent:null}])rows.push([r.id,r.title,r.scope,c.name,rowHas(r)?c.votes:'',rowHas(r)?(c.percent||0).toFixed(2):'',r.reported?'Reported':'Awaiting',r.source,r.updatedAt||''])}const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download=`azusa-54-results-${new Date().toISOString().slice(0,10)}${ui.demo?'-DEMO':''}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500)}
function setView(view){ui.view=view;ui.page=1;ui.expanded.clear();byId('side-nav').closest('.sidebar').classList.remove('open');render();if(view==='national')enrichFederalPortraits();window.scrollTo({top:0,behavior:'instant'});}
function handleAction(action,value){if(action==='expand'){ui.expanded.has(value)?ui.expanded.delete(value):ui.expanded.add(value);render()}else if(action==='ballot-tab'){ui.ballotTab=value;render()}else if(action==='ca-tab'){ui.caTab=value;ui.page=1;render()}else if(action==='national-tab'){ui.nationalTab=value;ui.nationalState='all';ui.page=1;render();enrichFederalPortraits()}else if(action==='map-state'){ui.selectedState=value;render()}else if(action==='state-drill'){ui.nationalState=ui.selectedState;ui.nationalTab='house';setView('national')}else if(action==='page-prev'){ui.page--;render()}else if(action==='page-next'){ui.page++;render()}else if(action==='export'){downloadCSV()}}
function enableEvents(){
 document.body.addEventListener('click',e=>{const view=e.target.closest('[data-view]');if(view){setView(view.dataset.view);return}const action=e.target.closest('[data-action]');if(action){handleAction(action.dataset.action,action.dataset.value);return}});
 document.body.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const el=e.target.closest('[data-action="map-state"],[data-action="expand"]');if(el){e.preventDefault();handleAction(el.dataset.action,el.dataset.value)}}});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();byId('search-input').focus()}if(e.key==='Escape'&&document.activeElement===byId('search-input')){byId('search-input').value='';ui.query='';render()}});
 byId('search-input').addEventListener('input',e=>{ui.query=e.target.value;ui.page=1;render()});
 byId('refresh-button').addEventListener('click',()=>loadAll(true));
 byId('theme-button').addEventListener('click',()=>{ui.theme=ui.theme==='dark'?'light':'dark';document.body.dataset.theme=ui.theme;localStorage.setItem('atlasThemeV2',ui.theme)});
 byId('mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
 document.body.addEventListener('change',e=>{if(e.target.id==='national-state'){ui.nationalState=e.target.value;ui.page=1;render();enrichFederalPortraits()}if(e.target.id==='only-reporting'){ui.onlyReporting=e.target.checked;ui.page=1;render()}if(e.target.id==='demo-switch'){ui.demo=e.target.checked;ui.page=1;ui.expanded.clear();render()}});
}
// If an external photo host blocks hotlinking, retry via our same-origin image route.
// Keep the initials visible if neither source can serve the verified headshot.
document.addEventListener('load',event=>{
 const target=event.target;
 if(!(target instanceof HTMLImageElement)||!target.closest('.candidate-avatar'))return;
 const key=target.dataset.photoKey;
 if(key){ui.imageLoaded.add(key);ui.imageFailed.delete(key);}
},true);
document.addEventListener('error',event=>{
 const target=event.target;
 if(!(target instanceof HTMLImageElement)||!target.closest('.candidate-avatar'))return;
 const proxy=target.dataset.proxySrc;
 if(proxy&&!target.dataset.retried){target.dataset.retried='1';target.src=proxy;return}
 if(target.dataset.photoKey)ui.imageFailed.add(target.dataset.photoKey);
 console.warn('Portrait unavailable for candidate:',target.alt||'Unknown','(official source and proxy failed)');target.remove();
},true);
async function asJson(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`${url}: HTTP ${response.status}`);return response.json()}
async function loadAll(force=false){if(refreshPromise)return refreshPromise;byId('refresh-button').disabled=true;byId('refresh-icon').classList.add('refreshing');
 refreshPromise=(async()=>{const urls=['/api/ballot','/api/california','/api/national?office=house','/api/national?office=senate'];const results=await Promise.allSettled(urls.map(asJson));const errors=[];
 if(results[0].status==='fulfilled'){const r=results[0].value;state.ballot=r.items||state.ballot;state.mayor=r.mayor||state.mayor;state.sources=r.sources||[];}else errors.push(results[0].reason?.message||'Personal ballot unavailable');
 if(results[1].status==='fulfilled')state.ca=results[1].value.races||state.ca;else errors.push(results[1].reason?.message||'CA data unavailable');
 for(let i=2;i<=3;i++){const office=i===2?'house':'senate';if(results[i].status==='fulfilled'){const r=results[i].value;state[office]=r.races||state[office];state.nationalMeta[office]={coverage:r.coverage,sources:r.sources||[]}}else errors.push(results[i].reason?.message||`National ${office} unavailable`)}
 if(state.ballot.length===0){try{state.ballot=await asJson('/ballot.json')}catch(e){errors.push(e.message)}}
 state.errors=errors;ui.updated=new Date().toISOString();ui.loading=false;applyFederalPhotos();render();if(ui.view==='national')enrichFederalPortraits();
 })().finally(()=>{refreshPromise=null;byId('refresh-button').disabled=false;byId('refresh-icon').classList.remove('refreshing')});return refreshPromise;}
async function init(){try{const map=await asJson('/states.json');state.tiles=map.tiles;state.states=map.names;}catch{state.tiles={};state.states={};}try{state.ballot=await asJson('/ballot.json')}catch{}try{ui.theme=localStorage.getItem('atlasThemeV2')||'light'}catch{}document.body.dataset.theme=ui.theme;enableEvents();render();loadAll();asJson('/api/portraits').then(p=>{ui.portraits=p.portraits||{};render();}).catch(()=>{});asJson('/api/map-topology').then(topology=>{state.mapShapes=parseMapTopology(topology,state.states);if(ui.view==='map')render();}).catch(error=>{state.mapGeoError=error.message;if(ui.view==='map')render();console.warn('Map outlines unavailable:',error);});setInterval(()=>{if(!document.hidden)loadAll()},60000);setInterval(updateTopChrome,30000);}
init();
