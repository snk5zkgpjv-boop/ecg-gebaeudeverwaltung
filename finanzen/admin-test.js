// Rein lokaler Oberflächentest: keine Netzwerkaufrufe und keinerlei produktive Finanzdaten.
const money = cents => (cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const examples=()=>[
 {id:'DEMO-001',applicant_name:'Musterperson A',applicant_id:'demo-member-a',status:'submitted',
  created_at:new Date().toISOString(),items:[{date:'2026-11-12',description:'Reinigungsmittel',project:'Gebäudepflege',cents:1850}],total_cents:1850,reimbursement_type:'refund',bank_owner:'Musterperson A',bank_iban:'DE00000000000000000000',receipts:[]},
 {id:'DEMO-002',applicant_name:'Musterperson B',applicant_id:'demo-member-b',status:'approved',
  created_at:new Date().toISOString(),items:[{date:'2026-11-13',description:'Bastelpapier',project:'Kinderstunde',cents:2490}],total_cents:2490,reimbursement_type:'waiver',receipts:[]}
];
export function initAdminTest(container,print) {
 const claims=examples();
 const note=document.createElement('p');note.textContent='ADMIN-TESTMODUS · ausschließlich fiktive Daten im Arbeitsspeicher dieses Browsers. Es werden keine Anträge gespeichert und keine Auszahlungen ausgelöst.';
 note.style.fontWeight='bold';container.before(note);
 const render=()=>{
  container.replaceChildren();
  for(const c of claims){
   const section=document.createElement('article');section.className='claim-card';
   const heading=document.createElement('strong');heading.textContent=c.applicant_name+' · '+money(c.total_cents)+' · '+c.status;section.append(heading);
   const list=document.createElement('p');list.textContent=c.items.map(x=>x.description+' – '+x.project).join(', ');section.append(list);
   const b=document.createElement('button');b.textContent='Antrag drucken (Demo)';b.onclick=()=>print(c,true);section.append(b);
   const actions={submitted:[['question','Rückfrage stellen'],['approved','Freigeben'],['rejected','Ablehnen']],question:[['submitted','Erneut vorlegen']],approved:[['paid','Auszahlung dokumentieren']]};
   for(const [to,label] of actions[c.status]||[]){
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>{c.status=to;render();};
    section.append(button);
   }
   container.append(section);
  }
 };
 render();
}