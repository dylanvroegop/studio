require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.join(process.cwd(), 'src', request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require('ts-node/register/transpile-only');
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const { calculateQuoteTotals, normalizeDataJson } = require(process.cwd() + '/src/lib/quote-calculations.ts');
const { normalizeNacalculatieDoc } = require(process.cwd() + '/src/lib/nacalculatie.ts');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
const db = admin.firestore();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const uid = 'C29EkAPLJzQSQgv7nwm6Uwj6agv2';
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function r(v){ return Math.round(n(v)*100)/100; }
function s(v){ return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)); }
function d(v){ if (!v) return ''; if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0,10); const dt = new Date(v); return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0,10) : ''; }
function clientName(k={}){ return s(k.bedrijfsnaam) || [s(k.voornaam), s(k.achternaam)].filter(Boolean).join(' ') || s(k.contactpersoon); }
function address(parts){ return [s(parts?.straat), s(parts?.huisnummer), s(parts?.postcode), s(parts?.plaats)].filter(Boolean).join(' '); }
function mapSettings(dataJson, quote){
 const norm = normalizeDataJson(dataJson || {}); const rawInst = norm.instellingen || quote.instellingen || {}; const rawExtras = norm.extras || quote.extras || {};
 return { btwTarief: n(rawInst.btwTarief) || 21, uurTariefExclBtw: n(rawInst.uurTariefExclBtw ?? rawInst.uurTarief) || n(quote?.instellingen?.uurTariefExclBtw ?? quote?.instellingen?.uurTarief) || 50, schattingUren: !!rawInst.schattingUren, extras: { transport: { prijsPerKm: n(rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? quote?.extras?.transport?.prijsPerKm), vasteTransportkosten: n(rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten ?? quote?.extras?.transport?.vasteTransportkosten), tunnelkosten: n(rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten ?? quote?.extras?.transport?.tunnelkosten), mode: rawExtras?.transport?.mode ?? rawInst?.extras?.transport?.mode ?? quote?.extras?.transport?.mode ?? 'fixed' }, winstMarge: { percentage: n(rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? quote?.extras?.winstMarge?.percentage ?? 10), fixedAmount: n(rawExtras?.winstMarge?.fixedAmount ?? quote?.extras?.winstMarge?.fixedAmount), mode: rawExtras?.winstMarge?.mode ?? quote?.extras?.winstMarge?.mode ?? 'percentage', basis: rawExtras?.winstMarge?.basis ?? quote?.extras?.winstMarge?.basis ?? 'totaal' } } };
}
function fallbackDataJson(q){ return { grootmaterialen: [], verbruiksartikelen: [], klantinformatie: q.klantinformatie || null, instellingen: q.instellingen || {}, extras: q.extras || {}, totaal_uren: q.totaal_uren || 0 }; }
async function main(){
 const qs = await db.collection('quotes').where('userId','==',uid).get();
 const quoteDocs = qs.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b)=>(n(a.offerteNummer)-n(b.offerteNummer)) || s(a.createdAt).localeCompare(s(b.createdAt)));
 const quoteIds = quoteDocs.map(q=>q.id);
 const calcRows=[];
 for (let i=0;i<quoteIds.length;i+=100){ const chunk=quoteIds.slice(i,i+100); const {data,error}=await supabase.from('quotes_collection').select('quoteid,status,data_json,created_at').eq('gebruikerid',uid).in('quoteid',chunk).order('created_at',{ascending:false}); if(error) throw error; calcRows.push(...(data||[])); }
 const calcByQuote = new Map();
 for (const row of calcRows){ if(!row.quoteid) continue; const prev=calcByQuote.get(row.quoteid); if(!prev || (!prev.data_json && row.data_json) || (prev.status!=='completed' && row.status==='completed')) calcByQuote.set(row.quoteid,row); }
 const invoicesSnap = await db.collection('invoices').where('userId','==',uid).get();
 const invByQuote = new Map();
 invoicesSnap.forEach(doc=>{ const inv={id:doc.id,...doc.data()}; const ids = new Set([inv.quoteId, ...(Array.isArray(inv.combinedQuoteIds)?inv.combinedQuoteIds:[]), ...(Array.isArray(inv.combinedContext?.quoteIds)?inv.combinedContext.quoteIds:[])]); ids.forEach(qid=>{ if(!qid) return; const b=invByQuote.get(qid)||{count:0,totalIncl:0,totalExcl:0,paid:0,open:0,statuses:new Set(),numbers:[]}; b.count++; b.totalIncl+=n(inv.totalsSnapshot?.totaalInclBtw); b.totalExcl+=n(inv.totalsSnapshot?.totaalExclBtw); b.paid+=n(inv.paymentSummary?.paidAmount); b.open+=n(inv.paymentSummary?.openAmount); if(inv.status)b.statuses.add(inv.status); if(inv.invoiceNumberLabel)b.numbers.push(inv.invoiceNumberLabel); invByQuote.set(qid,b); }); });
 const costsByQuote = new Map();
 for (let i=0;i<quoteIds.length;i+=100){ const chunk=quoteIds.slice(i,i+100); const {data,error}=await supabase.from('project_costs').select('offerte_id,category,amount_excl_btw,amount_incl_btw').eq('user_id',uid).in('offerte_id',chunk); if(error && !String(error.message).includes('does not exist')) throw error; for(const c of data||[]){ const b=costsByQuote.get(c.offerte_id)||{excl:0,incl:0,materiaal:0,brandstof:0,gereedschap:0,overig:0}; b.excl+=n(c.amount_excl_btw); b.incl+=n(c.amount_incl_btw); const cat = ['materiaal','brandstof','gereedschap'].includes(c.category)?c.category:'overig'; b[cat]+=n(c.amount_excl_btw); costsByQuote.set(c.offerte_id,b); } }
 const timeByQuote = new Map();
 { const {data,error}=await supabase.from('time_entries').select('quote_id,worked_hours,worked_days').eq('user_id',uid).limit(5000); if(error && !String(error.message).includes('does not exist')) throw error; for(const t of data||[]){ if(!t.quote_id) continue; const b=timeByQuote.get(t.quote_id)||{hours:0,days:0}; b.hours+=n(t.worked_hours); b.days+=n(t.worked_days) || n(t.worked_hours)/8; timeByQuote.set(t.quote_id,b); } }
 const nacalcs = new Map();
 for (const q of quoteDocs){ const snap = await db.collection('quotes').doc(q.id).collection('nacalculatie').doc('main').get(); if(snap.exists) nacalcs.set(q.id, normalizeNacalculatieDoc({quoteId:q.id,userId:uid,source:snap.data(),defaultHourRateExcl:n(q.instellingen?.uurTariefExclBtw)||50})); }
 const headers = ['Offerte nr','Quote ID','Status','Gearchiveerd','Titel / werkomschrijving','Klant','Klanttype','Bedrijf','E-mail','Telefoon','Factuuradres','Projectadres','Aangemaakt','Bijgewerkt','Verzonden op','BTW %','Uurtarief excl','Geschatte uren','Arbeid excl','Arbeid hoog BTW uren','Arbeid laag BTW uren','Materiaal groot excl','Materiaal verbruik excl','Materiaal totaal excl','Transport excl','Transport per dag','Transport dagen','Transport km enkele reis','Transport retour kosten','Transport duur totaal','Subtotaal excl','Winst/marge excl','Winst marge % omzet','Totaal excl BTW','BTW bedrag','Totaal incl BTW','Opgeslagen totaal incl','Facturen aantal','Factuur nummers','Gefactureerd excl','Gefactureerd incl','Betaald incl','Open incl','Factuur status','Werkelijke uren','Werkelijke dagen','Nacalculatie status','Nacalculatie arbeid excl','Nacalculatie materiaal groot excl','Nacalculatie materiaal verbruik excl','Nacalculatie transport kosten excl','Nacalculatie transport opbrengst excl','Nacalculatie materieel excl','Nacalculatie overhead excl','Kosten tab totaal excl','Kosten materiaal excl','Kosten brandstof excl','Kosten gereedschap excl','Kosten overig excl','Werkelijke kosten excl','Geschatte winst excl','Werkelijke winst excl','Winst per geschatte dag','Winst per werkelijke dag','Uurwinst geschat','Uurwinst werkelijk','Calculatie status','Calculatie datum'];
 const rows=[headers];
 for(const q of quoteDocs){
  const calc=calcByQuote.get(q.id); const dataJson=calc?.data_json || fallbackDataJson(q); let norm={}, totals={}; let calcErr='';
  try { norm=normalizeDataJson(dataJson); totals=calculateQuoteTotals(dataJson, mapSettings(dataJson,q)); } catch(e){ calcErr=e.message; }
  const inv=invByQuote.get(q.id)||{count:0,totalIncl:0,totalExcl:0,paid:0,open:0,statuses:new Set(),numbers:[]}; const cost=costsByQuote.get(q.id)||{excl:0,incl:0,materiaal:0,brandstof:0,gereedschap:0,overig:0}; const time=timeByQuote.get(q.id)||{hours:0,days:0}; const na=nacalcs.get(q.id);
  const actualLabor = n(na?.labor?.actualCostExcl); const actualMatG=n(na?.materials?.groot?.actualCostExcl); const actualMatV=n(na?.materials?.verbruik?.actualCostExcl); const actualTransport=n(na?.transport?.actualCostExcl); const actualMat=n(na?.materieel?.actualCostExcl); const actualOver=n(na?.overhead?.actualCostExcl);
  const actualCosts = actualLabor+actualMatG+actualMatV+actualTransport+actualMat+actualOver+cost.excl;
  const revenueExcl = n(totals.totaalExclBtw) || (n(q.totaalbedrag||q.amount)/(1+((n(q.instellingen?.btwTarief)||21)/100)));
  const estimatedProfit = n(totals.winstMarge) || n(totals.winstProjectie?.winstExclBtw);
  const actualProfit = revenueExcl - actualCosts;
  const estDays = n(totals.transportAantalDagen) || (n(norm.totaal_uren)/8);
  const actualDays = n(na?.labor?.actualDays) || time.days;
  const k=q.klantinformatie||{};
  rows.push([n(q.offerteNummer)||'', q.id, s(q.status), q.archived===true?'ja':'nee', s(q.titel)||s(q.werkomschrijving), clientName(k), s(k.klanttype), s(k.bedrijfsnaam), s(k['e-mailadres']||k.emailadres), s(k.telefoonnummer), address(k.factuuradres||k), k.afwijkendProjectadres ? address(k.projectadres) : '', d(q.createdAt), d(q.updatedAt), d(q.sentAt), n(q.instellingen?.btwTarief)||n(norm?.instellingen?.btwTarief)||21, n(q.instellingen?.uurTariefExclBtw)||n(norm?.instellingen?.uurTariefExclBtw)||'', n(norm.totaal_uren), r(totals.arbeidTotaal), r(totals.arbeidHoogBtwUren), r(totals.arbeidLaagBtwUren), r(totals.materialenGroot), r(totals.materialenVerbruik), r(totals.materialenTotaal), r(totals.transportTotaal), r(totals.transportPerDag), r(totals.transportAantalDagen), r(totals.transportDistanceKmOneWay), r(totals.transportRoundTripCost), s(totals.transportDurationTotaalText), r(totals.subtotaalExclBtw), r(totals.winstMarge), r(totals.winstProjectie?.margePercentageOpOmzet), r(totals.totaalExclBtw), r(totals.btw), r(totals.totaalInclBtw), r(q.totaalbedrag||q.amount), inv.count, inv.numbers.join(', '), r(inv.totalExcl), r(inv.totalIncl), r(inv.paid), r(inv.open), Array.from(inv.statuses).join(', '), r(n(na?.labor?.actualHours)||time.hours), r(actualDays), s(na?.status), r(actualLabor), r(actualMatG), r(actualMatV), r(actualTransport), r(na?.transport?.actualRevenueExcl), r(actualMat), r(actualOver), r(cost.excl), r(cost.materiaal), r(cost.brandstof), r(cost.gereedschap), r(cost.overig), r(actualCosts), r(estimatedProfit), r(actualProfit), estDays>0?r(estimatedProfit/estDays):'', actualDays>0?r(actualProfit/actualDays):'', n(norm.totaal_uren)>0?r(estimatedProfit/n(norm.totaal_uren)):'', (n(na?.labor?.actualHours)||time.hours)>0?r(actualProfit/(n(na?.labor?.actualHours)||time.hours)):'', s(calc?.status)|| (calcErr?'error':''), s(calc?.created_at).slice(0,10)]);
 }
 function esc(v){ const text = v == null ? '' : String(v); return text.replace(/\t/g,' ').replace(/\r?\n/g,' '); }
 const tsv = rows.map(row=>row.map(esc).join('\t')).join('\n');
 fs.writeFileSync('/tmp/calvora_finance.tsv', tsv);
 fs.writeFileSync('/tmp/calvora_finance_rows.json', JSON.stringify({rowCount:rows.length,colCount:headers.length,headers,preview:rows.slice(0,4)}, null, 2));
 console.log(JSON.stringify({quotes:quoteDocs.length, rows:rows.length, cols:headers.length, tsvBytes:Buffer.byteLength(tsv), path:'/tmp/calvora_finance.tsv'}, null, 2));
}
main().catch(e=>{ console.error(e.stack||e); process.exit(1); });
