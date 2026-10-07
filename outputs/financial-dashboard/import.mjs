import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';
import { mergeTransactions, findPossibleDuplicates } from './import-core.mjs';

// Gebruik: node import.mjs /pad/naar/snapshot.json [/pad/naar/werkmap.xlsx]
const source=process.argv[2];
if(!source)throw new Error('Geef het pad naar snapshot.json uit de Studio-export.');
const dest=process.argv[3]||new URL('./Financieel-dashboard.xlsx',import.meta.url).pathname;
const snapshot=JSON.parse(await fs.readFile(source,'utf8'));
if(snapshot.version!==1||!Array.isArray(snapshot.transactions)||!snapshot.exportedAt)throw new Error('Onbekend of onvolledig exportformaat.');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(dest));
function getTable(sheet,name){const t=wb.worksheets.getItem(sheet).tables.items.find(t=>t.name===name);if(!t)throw new Error(`Tabel ${name} ontbreekt`);return t;}
function records(sheet,name){const t=getTable(sheet,name),heads=t.getHeaderRowRange().values[0];return t.getDataRows().map(row=>Object.fromEntries(heads.map((h,i)=>[h,row[i]])));}
function update(sheet,name,rows,dateFields=[]){
 const t=getTable(sheet,name),heads=t.getHeaderRowRange().values[0];const oldLength=t.getDataRows().length;
 const values=rows.length?rows.map(row=>heads.map(h=>{const v=row[h];if(v===null||v===undefined||v==='')return null;if(dateFields.includes(h)&&typeof v==='string'){const d=new Date(v);return Number.isNaN(d.getTime())?null:d;}return v;})):[heads.map(()=>null)];
 if(values.length>oldLength)t.rows.add(null,Array.from({length:values.length-oldLength},()=>heads.map(()=>null)));
 const startRow=name==='Accounts'?57:5;
 const start=wb.worksheets.getItem(sheet).getRangeByIndexes(startRow,0,Math.max(oldLength,values.length),heads.length);
 start.clear({applyTo:'contents'});
 start.getCell(0,0).write(values);
}
const previous=records('Bank Transactions','Transactions');
const merged=mergeTransactions(previous,snapshot.transactions,records('Settings & Assumptions','Rules'));
const possibleDuplicates=findPossibleDuplicates(merged);
update('Bank Transactions','Transactions',merged,['transaction_date','booking_date']);
for(let i=0;i<Math.max(merged.length,1);i++){const r=i+6;const sh=wb.worksheets.getItem('Bank Transactions');
 sh.getRange(`I${r}`).formulas=[[`=IF(A${r}="","",IF(COUNTIFS(Accounts[id],G${r})=1,INDEX(Accounts[type],MATCH(G${r},Accounts[id],0)),"unknown"))`]];
 sh.getRange(`Y${r}`).formulas=[[`=IF(A${r}="",0,IF(COUNTIFS(Accounts[id],G${r},Accounts[include],1)=1,1,0))`]];
 sh.getRange(`Z${r}`).formulas=[[`=IF(A${r}="",0,IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r}),F${r}="EUR",X${r}<>"",OR(P${r}="business",P${r}="private",P${r}="internal",P${r}="owner_transfer")),1,0))`]];
}
// Bewaar fiscale handmatige btw-behandeling bij factuur-ID.
const oldInvoices=new Map(records('Business Revenue','Invoices').filter(x=>x.id).map(x=>[x.id,x]));
const invoices=snapshot.invoices.map(row=>({...row,amount_excl:row.amount_excl??oldInvoices.get(row.id)?.amount_excl??null,
 vat:row.vat??oldInvoices.get(row.id)?.vat??null,vat_treatment:oldInvoices.get(row.id)?.vat_treatment||'unknown'}));
update('Business Revenue','Invoices',invoices,['date','due_date']);
for(let i=0;i<Math.max(invoices.length,1);i++){const r=i+6;wb.worksheets.getItem('Business Revenue').getRange(`N${r}`).formulas=[[`=IF(A${r}="",0,IF(OR(E${r}="concept",E${r}="geannuleerd"),1,IF(AND(COUNT(B${r}:C${r})=2,COUNT(H${r}:L${r})=5,M${r}<>"unknown",M${r}<>"",ABS(H${r}+I${r}-J${r})<=0.02,ABS(J${r}-K${r}-L${r})<=0.02),1,0)))`]];}
const oldCosts=new Map(records('Business Expenses','Expenses').filter(x=>x.id).map(x=>[x.id,x]));
const costs=(snapshot.costs||[]).map(row=>{
 const old=oldCosts.get(row.id);
 return {id:row.id,date:row.date,supplier:row.supplier_name,project_id:row.offerte_id,category:row.category,amount_excl:row.amount_excl_btw,
  vat_deductible:old?.vat_deductible??null,amount_incl:row.amount_incl_btw,paid:row.payment_status==='paid'?row.amount_incl_btw:row.payment_status==='openstaand'?0:old?.paid??null,
  due_date:row.due_date,deductible:old?.deductible||'unknown',capital_asset:old?.capital_asset||'unknown',vat_treatment:old?.vat_treatment||'unknown'};
});
update('Business Expenses','Expenses',costs,['date','due_date']);
for(let i=0;i<Math.max(costs.length,1);i++){const r=6+i;const sh=wb.worksheets.getItem('Business Expenses');sh.getRange(`N${r}`).formulas=[[`=IF(A${r}="","",IF(COUNT(H${r}:I${r})<2,"n.b.",MAX(0,H${r}-I${r})))`]];
 sh.getRange(`O${r}`).formulas=[[`=IF(A${r}="",0,IF(AND(ISNUMBER(B${r}),COUNT(F${r}:I${r})=4,OR(K${r}="yes",K${r}="no"),OR(L${r}="yes",L${r}="no"),M${r}<>"unknown",M${r}<>""),1,0))`]];}
const oldAccounts=new Map(records('Settings & Assumptions','Accounts').filter(x=>x.id).map(x=>[x.id,x]));
if(snapshot.accounts.length>12)throw new Error('Meer dan 12 bronrekeningen: vergroot eerst Accounts en het afstemmingsblad; import is niet opgeslagen.');
const accounts=snapshot.accounts.map(row=>{
 const old=oldAccounts.get(row.id);
 const balances=(snapshot.balances||[]).filter(b=>b.bank_account_id===row.id&&b.amount!==null);
 const booked=balances.filter(b=>['closingBooked','interimBooked','CLBD','ITBD'].includes(b.balance_type)).sort((a,b)=>String(b.reference_date||b.created_at).localeCompare(String(a.reference_date||a.created_at)))[0];
 return {id:row.id,name:row.name,type:old?.type||row.account_type,currency:row.currency,
 closing:booked?Number(booked.amount):null,closing_date:booked?.reference_date||null,
 opening:old?.opening??null,opening_date:old?.opening_date??null,coverage:0,last_sync:row.last_synced_at,
 include:old?.include??0,balance_type:booked?.balance_type||'Kies geboekt saldo uit balances.csv'};
});
update('Settings & Assumptions','Accounts',accounts,['closing_date','opening_date','last_sync']);
for(let r=58;r<=69;r++)wb.worksheets.getItem('Settings & Assumptions').getRange(`M${r}`).formulas=[[`=IF(A${r}="",0,IF(AND(K${r}=1,OR(C${r}="business",C${r}="private"),D${r}="EUR",COUNT(E${r}:H${r})=4,I${r}=1,ISNUMBER(J${r}),F${r}>=H${r},ABS(E${r}-G${r}-SUMIFS(Transactions[amount],Transactions[account_id],A${r},Transactions[booking_date],">"&H${r},Transactions[booking_date],"<="&F${r},Transactions[duplicate_status],""))<=0.01),1,0))`]];
const settings=wb.worksheets.getItem('Settings & Assumptions');
settings.getRange('B9:B12').values=[[0],[0],[0],[0]];
settings.getRange('B15').values=[[new Date(snapshot.exportedAt)]];
wb.worksheets.getItem('Bank Transactions').getRange('A4:X4').merge();
wb.worksheets.getItem('Bank Transactions').getRange('A4').values=[[`${merged.length} unieke transacties. ${possibleDuplicates.length} mogelijke dubbelen met afwijkend ID; controleer snapshot en omschrijvingen.`]];
wb.recalculate();
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:20}});
if(/"address"/.test(errors.ndjson))throw new Error(`Formulecontrole mislukt; werkmap niet overschreven: ${errors.ndjson}`);
const timestamp=new Date().toISOString().replaceAll(':','-');
await fs.copyFile(dest,dest+`.backup-${timestamp}`);
await fs.mkdir(path.join(path.dirname(dest),'imports'),{recursive:true});
await fs.copyFile(source,path.join(path.dirname(dest),'imports',`${timestamp}.json`));
const temp=dest+'.tmp';await(await SpreadsheetFile.exportXlsx(wb)).save(temp);await fs.rename(temp,dest);
console.log(`Bijgewerkt: ${dest}\n${merged.length} unieke transacties; ${possibleDuplicates.length} mogelijke dubbelen. Controleer Accounts, btw/kosten en brondekking voordat je controles bevestigt.`);
