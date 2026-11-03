import {CANDIDATES_CSV,parseCSV} from '../lib/candidate-rosters.mjs';
try{
 const response=await fetch(CANDIDATES_CSV,{signal:AbortSignal.timeout(9500)});
 if(!response.ok)throw Error('Roster HTTP '+response.status);
 const rows=parseCSV(await response.text()),senate=rows.filter(r=>r.OFFICE==='Senate'||r.OFFICE==='S'),house=rows.filter(r=>r.OFFICE==='House'||r.OFFICE==='H');
 const withBioguide=arr=>arr.filter(x=>/^[A-Z][0-9]{6}$/.test(x.BIOGUIDEID||''));
 const s=withBioguide(senate),h=withBioguide(house);
 console.log('Senate records:',senate.length,'with Bioguide ID:',s.length);
 console.log('House records:',house.length,'with Bioguide ID:',h.length);
 console.log('Sample Senate IDs:',s.slice(0,25).map(x=>({state:x.STATE,name:x.CANDIDATE,bioguide:x.BIOGUIDEID,party:x.PARTY})));
 for(const x of s.slice(0,3)){
  const url='https://unitedstates.github.io/images/congress/225x275/'+x.BIOGUIDEID+'.jpg';
  try{
   const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(6000)});
   console.log('Official member portrait',x.CANDIDATE,x.BIOGUIDEID,':',r.status,r.headers.get('content-type'));
  }catch(e){console.log('Official member portrait',x.CANDIDATE,'unavailable',e.message)}
 }
}catch(error){console.log('Bioguide probe unavailable:',error.message)}
