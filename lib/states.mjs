// 2020 apportionment, House districts for the 2026 election; 435 total.
export const SEATS = {
 AL:7,AK:1,AZ:9,AR:4,CA:52,CO:8,CT:5,DE:1,FL:28,GA:14,HI:2,ID:2,IL:17,IN:9,IA:4,KS:4,KY:6,LA:6,ME:2,MD:8,MA:9,MI:13,MN:8,MS:4,MO:8,MT:2,NE:3,NV:4,NH:2,NJ:12,NM:3,NY:26,NC:14,ND:1,OH:15,OK:5,OR:6,PA:17,RI:2,SC:7,SD:1,TN:9,TX:38,UT:4,VT:1,VA:11,WA:10,WV:2,WI:8,WY:1
};
export const STATE_NAMES = {
 AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};
// 33 Class II Senate contests plus 2 known 2026 special elections.
export const SENATE_2026 = 'AL AK AR CO DE GA ID IL IA KS KY LA ME MA MI MN MS MT NE NH NJ NM NC OK OR RI SC SD TN TX VA WV WY'.split(' ').concat(['FL-special','OH-special']);
// A recognizable, geographically organized tile cartogram (not a geographic projection).
export const TILES = {
 AK:[0,7],HI:[1,8],WA:[1,0],OR:[1,1],CA:[0,3],NV:[1,3],ID:[2,1],MT:[3,0],WY:[3,2],UT:[2,3],AZ:[2,4],NM:[3,4],CO:[4,3],ND:[5,0],SD:[5,1],NE:[5,2],KS:[5,3],OK:[5,4],TX:[5,5],MN:[6,0],IA:[6,2],MO:[6,3],AR:[6,4],LA:[6,5],WI:[7,1],IL:[7,2],MS:[7,5],MI:[8,1],IN:[8,2],KY:[8,3],TN:[8,4],AL:[8,5],OH:[9,2],WV:[9,3],GA:[9,5],FL:[10,6],SC:[10,5],NC:[10,4],VA:[10,3],PA:[10,2],NY:[11,1],VT:[12,0],NH:[13,0],ME:[14,0],MA:[13,1],CT:[12,2],RI:[13,2],NJ:[11,2],DE:[12,3],MD:[11,3]
};
export const OFFICIAL_STATE_RESULTS = 'https://www.usa.gov/election-results';
export function nationalSkeleton() {
 const result = [];
 for (const [state,seats] of Object.entries(SEATS)) for(let d=1;d<=seats;d++) {
   result.push({id:`${state}-${String(seats===1?0:d).padStart(2,'0')}`,state,office:'house',title:`${STATE_NAMES[state]} · ${seats===1?'At-large':`District ${d}`}`,candidates:[],votes:0,pctIn:null,source:'Not yet covered',reported:false,called:false});
 }
 for(const item of SENATE_2026) {
   const [state,part] = item.split('-'); result.push({id:`${state}${part?'-special':''}-S`,state,office:'senate',title:`${STATE_NAMES[state]} · U.S. Senate${part?' (Special)':''}`,candidates:[],votes:0,pctIn:null,source:'Not yet covered',reported:false,called:false});
 }
 return result;
}
