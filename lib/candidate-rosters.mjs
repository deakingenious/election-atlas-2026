// General-election candidate roster metadata. Do not treat these names as votes.
// DeepSyte compiles state-certified candidate lists where available and recorded
// nominees elsewhere; its coverage and status are separately attributed.
const clean=s=>String(s??'').trim();
const code=s=>clean(s).toUpperCase();
const tidy=s=>code(s).replace(/[^A-Z0-9]/g,'');
export const CANDIDATES_CSV='https://deepsyte.app/data/candidates-2026.csv';
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 const input=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(ch==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(ch===','&&!quoted){row.push(cell);cell=''}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
  else cell+=ch;
 }
 if(quoted)throw Error('Unterminated quoted CSV field');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(!rows.length)return [];
 const header=rows.shift().map(x=>tidy(x));
 return rows.map(columns=>Object.fromEntries(header.map((h,i)=>[h,clean(columns[i])])));
}
function value(row,...names){for(const n of names){const v=row[tidy(n)];if(v)return v}return ''}
function officeOf(row){const s=tidy(value(row,'office','chamber','office_sought','race_office','office_type'));
 if(s==='H'||s.includes('HOUSE')||s.includes('CONGRESS'))return 'house';
 if(s==='S'||s.includes('SENATE'))return 'senate';
 return '';
}
export function normalizeFederalRoster(csv){
 const rows=parseCSV(csv);const map=new Map();let recognized=0;
 for(const row of rows){
  const state=code(value(row,'state','state_code','state_abbr','state_abbreviation','office_state'));
  const office=officeOf(row);
  const name=clean(value(row,'candidate_name','candidate','name','full_name','ballot_name','person_name'));
  if(!/^[A-Z]{2}$/.test(state)||!office||name.length<3)continue;
  const districtRaw=value(row,'district','district_number','district_num','congressional_district','seat','office_district');
  const district=Number(districtRaw)||0;
  if(office==='house'&&(district<0||district>99))continue;
  const special=tidy(value(row,'election_type','seat_type','special','race_type')).includes('SPECIAL');
  const id=office==='house'?`${state}-${String(district).padStart(2,'0')}`:`${state}${special?'-special':''}-S`;
  const party=clean(value(row,'party','party_affiliation','party_name','political_party','party_label'));
  const profileUrl=clean(value(row,'race_page_url','race_url','source_url'));
  const candidateId=clean(value(row,'fec_candidate_id','fec_id','candidate_id','fecid'));
  const bioguideId=clean(value(row,'bioguide_id','bioguideid','bioguide'));
  const existing=map.get(id)||{id,office,state,candidates:[],candidateSource:'2026 general-election candidate roster: DeepSyte (state-certified where available; nominee records elsewhere)'};
  if(!existing.candidates.some(c=>tidy(c.name)===tidy(name)))existing.candidates.push({name,party,votes:0,percent:null,profileUrl,...(candidateId?{candidateId}:{}),...(bioguideId?{bioguideId}:{})});
  map.set(id,existing);recognized++;
 }
 if(!recognized||map.size<50)throw Error(`2026 federal roster unrecognized or incomplete: ${recognized} records / ${map.size} races`);
 return {races:[...map.values()],records:recognized,contests:map.size};
}
