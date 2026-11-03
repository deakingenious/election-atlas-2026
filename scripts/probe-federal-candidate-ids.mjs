import {CANDIDATES_CSV,parseCSV,normalizeFederalRoster} from '../lib/candidate-rosters.mjs';
try{
 const r=await fetch(CANDIDATES_CSV,{signal:AbortSignal.timeout(10000)});
 console.log('Federal roster status:',r.status);
 if(!r.ok)process.exit(0);
 const csv=await r.text(),rows=parseCSV(csv);
 console.log('Header fields:',Object.keys(rows[0]||{}).join(', '));
 const ids=rows.filter(row=>row.FECCANDIDATEID||row.FECID||row.CANDIDATEID);
 console.log('Records with potential FEC IDs:',ids.length,'of',rows.length);
 const mi=rows.filter(row=>['MI','MICHIGAN'].includes(row.STATE||row.STATEABBR||row.STATECODE)&&/SENATE/i.test(row.OFFICE||row.CHAMBER||''));
 console.log('Michigan Senate roster entries:',mi.slice(0,12).map(row=>({name:row.CANDIDATENAME||row.NAME||row.CANDIDATE,party:row.PARTY,fec:row.FECCANDIDATEID||row.FECID||row.CANDIDATEID||null})));
}catch(error){console.log('Roster probe unavailable:',error.message)}
