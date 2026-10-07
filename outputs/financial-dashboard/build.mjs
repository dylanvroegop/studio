import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const out = new URL('.', import.meta.url).pathname;
const wb = Workbook.create();
const names = ['Dashboard','Bank Transactions','Business Overview','Business Revenue','Business Expenses','Project Profitability','Private Overview','Private Expenses','Recurring Expenses','Dutch Taxes','Van Purchase','Van Conversion','Financial Goals','Financial Freedom','Work & Travel Planning','Cash Flow Forecast','Net Worth','Monthly Reports','Financial Insights','Settings & Assumptions','Data Quality & Reconciliation'];
const sheets = Object.fromEntries(names.map(name => [name, wb.worksheets.add(name)]));
const c = {bg:'#101827',panel:'#1B2940',text:'#F3F6FC',muted:'#B6C5DA',green:'#41DBA3',blue:'#6BADFF',purple:'#BAA0FF',cyan:'#56D9ED',amber:'#FFD078',red:'#FF8B88',gold:'#E8C369'};
const money = '"€" #,##0;[Red]("€" #,##0);"€" 0';
const S = "'Settings & Assumptions'!";
const ref = (s,a) => `'${s}'!${a}`;
const col = n => { let s=''; for(n++;n;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; };
function value(s,a,v){sheets[s].getRange(a).values=[[v]];}
function formula(s,a,f){sheets[s].getRange(a).formulas=[[f.startsWith('=')?f:'='+f]];}
function note(s,row,text){const r=sheets[s].getRange(`A${row}:L${row}`);r.merge();r.values=[[text]];r.format.font.color=c.muted;r.format.wrapText=true;r.format.rowHeight=32;}
function title(s,text,sub){value(s,'A2',text);sheets[s].getRange('A2:L2').merge();sheets[s].getRange('A2').format.font.size=20;if(sub)note(s,3,sub);}
function table(s,name,headers,rows=[],start=5){
 const end=start+Math.max(rows.length,1); const range=`A${start}:${col(headers.length-1)}${end}`;
 sheets[s].getRange(`A${start}:${col(headers.length-1)}${start}`).values=[headers];
 if(rows.length)sheets[s].getRange(`A${start+1}:${col(headers.length-1)}${end}`).values=rows;
 const t=sheets[s].tables.add(range,true,name);t.showBandedRows=false;
 sheets[s].getRange(`A${start}:${col(headers.length-1)}${start}`).format={fill:c.panel,font:{bold:true,color:c.text},rowHeight:40,wrapText:true};
 return t;
}
function pairs(s,rows,start=6){rows.forEach(([label,f,fmt],i)=>{let r=start+i;value(s,`A${r}`,label);sheets[s].getRange(`A${r}:D${r}`).merge();if(typeof f==='string'&&f.startsWith('='))formula(s,`E${r}`,f);else value(s,`E${r}`,f);sheets[s].getRange(`E${r}:G${r}`).merge();sheets[s].getRange(`E${r}`).setNumberFormat(fmt||money);sheets[s].getRange(`E${r}`).format.font.color=c.green;});}
function chart(s,type,range,titleText,from,to){const ch=sheets[s].charts.add(type,sheets[s].getRange(range));ch.title=titleText;ch.setPosition(from,to);ch.titleTextStyle.fontSize=14;ch.titleTextStyle.typeface='Arial';ch.xAxis={axisType:'textAxis',textStyle:{fontSize:10,typeface:'Arial'}};ch.yAxis={numberFormatCode:'€#,##0',numberFormatSourceLinked:false};ch.series.items.forEach((series,i)=>{series.fill=[c.blue,c.green,c.purple,c.cyan][i%4];if(type==='line')series.line={fill:[c.blue,c.green,c.purple][i%3],width:2,style:'solid'};});return ch;}
for(const name of names){const sh=sheets[name];sh.showGridLines=false;sh.getRange('A1:AB90').format={fill:c.bg,font:{name:'Arial',size:11,color:c.text},rowHeight:24,columnWidth:17};sh.getRange('A1:A90').format.columnWidth=25;sh.freezePanes.freezeRows(5);title(name,name);}

// Eén expliciet controlepaneel. Lege waarden zijn ontbrekende invoer.
title('Settings & Assumptions','Instellingen en aannames','Blauw = bewerkbaar. “n.b.” = niet beschikbaar. Bevestig volledigheid pas na controle van de bronadministratie.');
const inputs=[
 ['Peildatum',new Date('2026-10-07T00:00:00Z'),'Datum van het rapport'],
 ['Belastingjaar',2026,'Tarieven hieronder gelden uitsluitend voor 2026, vóór AOW'],
 ['Scenario',2,'1 Conservatief / 2 Basis / 3 Optimistisch'],
 ['Bankgegevens gecontroleerd',0,'1 alleen bij complete rekeningen, EUR, bekende saldi en afstemming'],
 ['Facturen volledig',0,'1 na controle uitgereikte facturen inclusief creditnota’s'],
 ['Kosten volledig',0,'1 na controle kosten, betaalstatus en aftrekbaarheid'],
 ['Verplichtingen volledig',0,'1 na controle belasting, schulden en overige verplichtingen'],
 ['Historie volledig vanaf',null,'Eerste volledige transactiedatum'],
 ['Historie volledig tot',null,'Laatste volledige transactiedatum'],
 ['Laatste export',null,'Wordt bij import bijgewerkt; is geen banksynchronisatiedatum'],
 ['Omzet per werkdag excl. btw',650,'Gebruikersscenario; geen winst'],
 ['Variabele zakelijke kosten',null,'Fractie van omzet; vul 0 in als werkelijk nihil'],
 ['Vaste zakelijke kosten / maand',null,'Ook tijdens reismaanden'],
 ['Reserveringspercentage IB + Zvw',null,'Planningsaanname op positieve winst; geen berekende aanslag'],
 ['Werkdagen per werkmaand',20,'Bewerkbare scenarioaanname'],
 ['Uren per werkdag',8,'Bewerkbare scenarioaanname'],
 ['Privébudget minimaal / maand',1000,'Scenario, geen gemeten uitgaven'],
 ['Privébudget comfortabel / maand',2000,'Scenario, geen gemeten uitgaven'],
 ['Reisbudget / maand',2500,'Totale privé-uitgaven in reismaand'],
 ['Noodbufferdoel',20000,'Doel; aftrek van cash gebeurt via unieke doelreserveringen'],
 ['Overige harde reserves',null,'Geen belasting, schulden of doelen die al elders staan'],
 ['Belastingpot huidig',null,'Onderdeel banksaldo; niet nogmaals aftrekken'],
 ['Netto maandinleg doelen',null,'Totaal beschikbaar voor alle unieke spaardoelen'],
 ['Investeringsrendement / jaar',null,'Scenario, geen garantie'],
 ['Maandelijkse passieve inkomsten',null,'Netto besteedbaar; niet automatisch uit vermogen afgeleid'],
 ['Grote transactie drempel',1000,'Signaaldrempel in euro'],
 ['Stijging uitgaven drempel',0.25,'Vergelijkbare volledige maanden'],
 ['Bankdata verouderd na dagen',3,'Bewerkbare signaleringsdrempel'],
 ['Netto winst per extra werkdag',null,'Formule uit omzet, kosten en reservering'],
 ['Forecast startmaand',new Date('2026-11-01T00:00:00Z'),'Start met een volledige toekomstige maand'],
 ['Overige fiscale winstcorrecties',null,'Jaarbedrag; positief verhoogt winst'],
 ['Jaarafschrijving',null,'Niet tevens als kosten boeken'],
 ['Bevestigde jaarwinstverwachting',null,'Exclusief btw, vóór afschrijving en fiscale correcties'],
 ['Ander belastbaar box 1 inkomen',null,'Voor vereenvoudigde raming; loonheffing apart invullen'],
 ['Zelfstandigenaftrek van toepassing',0,'Alleen 1 na toets urencriterium en voorwaarden'],
 ['Startersaftrek van toepassing',0,'Alleen 1 na toets voorwaarden'],
 ['MKB-vrijstelling van toepassing',0,'Alleen 1 bij winst uit onderneming'],
 ['Bevestigde KIA',null,'Handmatig fiscaal vastgesteld bedrag'],
 ['Heffingskortingen totaal',null,'Handmatig op totale persoonlijke situatie vaststellen'],
 ['IB + Zvw reeds betaald / ingehouden',null,'Voorkomt dubbele verplichting'],
 ['Btw oudere jaren nog verschuldigd',null,'Saldo van eerdere jaren, niet opnieuw kwartaal 2026'],
 ['Overige bevestigde belasting',null,'Bijv. box 3, niet inbegrepen in IB-raming'],
 ['Broncontrole tax scope',0,'1 als 2026, vóór AOW, geen bijzondere fiscale situaties'],
];
table('Settings & Assumptions','Assumptions',['Instelling','Waarde','Toelichting'],inputs);
sheets['Settings & Assumptions'].getRange('A5:A48').format.columnWidth=42;sheets['Settings & Assumptions'].getRange('B6:B48').format.font.color=c.blue;sheets['Settings & Assumptions'].getRange('C5:C48').format.columnWidth=95;
const I=Object.fromEntries(inputs.map((x,i)=>[x[0],i+6]));
const setting=n=>`${S}$B$${I[n]}`;
const G=`${S}$G$13`,R=`${S}$G$14`,E=`${S}$G$15`,O=setting('Verplichtingen volledig');
formula('Settings & Assumptions','B34',`=IF(COUNT(B16:B19)<4,"n.b.",MAX(0,B16*(1-B17)-B18/B20)*(1-B19))`);
for(const r of [6,13,14,15,35])sheets['Settings & Assumptions'].getRange(`B${r}`).setNumberFormat('dd-mm-yyyy');
for(const r of [17,19,29,32])sheets['Settings & Assumptions'].getRange(`B${r}`).setNumberFormat('0.0%');
sheets['Settings & Assumptions'].getRange('B8').dataValidation={rule:{type:'list',values:['1','2','3']}};
for(const r of [9,10,11,12,40,41,42,48])sheets['Settings & Assumptions'].getRange(`B${r}`).dataValidation={rule:{type:'list',values:['0','1']}};
note('Settings & Assumptions',51,'Import: gebruik de ZIP-export uit Studio. De import bewaart correcties op stabiele transactie-ID en laat controlevelden uit totdat je opnieuw afstemt.');
note('Settings & Assumptions',53,'Classificeer per rekening expliciet private/business. Verschillende koppelingen van dezelfde IBAN tellen slechts één keer mee in Accounts.');
// Rekeningbron met echte openings- en eindsaldi, geen afgeleid historisch banksaldo.
table('Settings & Assumptions','Accounts',['id','name','type','currency','closing','closing_date','opening','opening_date','coverage','last_sync','include','balance_type','valid'],Array.from({length:12},()=>Array(13).fill(null)),57);
for(let r=58;r<=69;r++)formula('Settings & Assumptions',`M${r}`,`IF(A${r}="",0,IF(AND(K${r}=1,OR(C${r}="business",C${r}="private"),D${r}="EUR",COUNT(E${r}:H${r})=4,I${r}=1,ISNUMBER(J${r}),F${r}>=H${r},ABS(E${r}-G${r}-SUMIFS(Transactions[amount],Transactions[include_in_totals],1,Transactions[account_id],A${r},Transactions[booking_date],">"&H${r},Transactions[booking_date],"<="&F${r},Transactions[duplicate_status],""))<=0.01),1,0))`);
for(const cl of ['E','G'])sheets['Settings & Assumptions'].getRange(`${cl}58:${cl}69`).setNumberFormat(money);
for(const cl of ['F','H','J'])sheets['Settings & Assumptions'].getRange(`${cl}58:${cl}69`).setNumberFormat('dd-mm-yyyy');
table('Settings & Assumptions','Rules',['counterparty','category','classification','recurring','subcategory'],[['Bouwmaat','Materialen','business','unknown',''],['Albert Heijn','Boodschappen','private','unknown',''],['Lidl','Boodschappen','private','unknown','']],73);
note('Settings & Assumptions',79,'Regels: exacte tegenpartij, alleen toegepast op nieuwe transacties bij import. Correcties in Bank Transactions blijven bij volgende import behouden.');

title('Bank Transactions','Banktransacties','Originele export blijft in snapshot.json. Corrigeer category, classification, recurring en notes. Bankontvangsten zijn geen factuuromzet.');
const txHeaders=['id','stable_key','transaction_date','booking_date','amount','currency','account_id','account_name','account_type','counterparty','description','source_category','category','subcategory','vat_treatment','classification','recurring','direction','internal_transfer','reconciliation','notes','duplicate_status','source_hash','source_updated_at','include_in_totals','valid'];
table('Bank Transactions','Transactions',txHeaders,[Array(txHeaders.length).fill(null)]);
formula('Bank Transactions','Y6','=IF(A6="",0,IF(COUNTIFS(Accounts[id],G6,Accounts[include],1)=1,1,0))');
formula('Bank Transactions','Z6','=IF(A6="",0,IF(AND(ISNUMBER(D6),ISNUMBER(E6),F6="EUR",X6<>"",OR(P6="business",P6="private",P6="internal",P6="owner_transfer")),1,0))');
formula('Bank Transactions','I6','=IF(A6="","",IF(COUNTIFS(Accounts[id],G6)=1,INDEX(Accounts[type],MATCH(G6,Accounts[id],0)),"unknown"))');
sheets['Bank Transactions'].getRange('E6:E90').setNumberFormat(money);sheets['Bank Transactions'].getRange('C6:D90').setNumberFormat('dd-mm-yyyy');sheets['Bank Transactions'].getRange('K5:K90').format.columnWidth=50;
sheets['Bank Transactions'].getRange('P6:P90').dataValidation={rule:{type:'list',values:['business','private','internal','owner_transfer','unknown']}};
sheets['Bank Transactions'].getRange('M6:Q90').format.font.color=c.blue;

title('Business Revenue','Uitgereikte facturen','Exclusief concepten en geannuleerde facturen. Voorschotten en eindfacturen: importeer uitsluitend de werkelijk uitgereikte bedragen na voorschotaftrek.');
table('Business Revenue','Invoices',['id','date','due_date','number','status','project_id','customer','amount_excl','vat','amount_incl','paid','open','vat_treatment','valid'],[Array(14).fill(null)]);
formula('Business Revenue','N6','=IF(A6="",0,IF(OR(E6="concept",E6="geannuleerd"),1,IF(AND(COUNT(B6:C6)=2,COUNT(H6:L6)=5,M6<>"unknown",M6<>"",ABS(H6+I6-J6)<=0.02,ABS(J6-K6-L6)<=0.02),1,0)))');
sheets['Business Revenue'].getRange('B6:C90').setNumberFormat('dd-mm-yyyy');sheets['Business Revenue'].getRange('H6:L90').setNumberFormat(money);
title('Business Expenses','Zakelijke kosten','Kosten uit facturen/bonnen, geen extra optelling van bijbehorende bankbetalingen. Investeringen activeren; btw-aftrek expliciet bevestigen.');
table('Business Expenses','Expenses',['id','date','supplier','project_id','category','amount_excl','vat_deductible','amount_incl','paid','due_date','deductible','capital_asset','vat_treatment','open','valid'],[Array(15).fill(null)]);
formula('Business Expenses','N6','=IF(A6="","",IF(COUNT(H6:I6)<2,"n.b.",MAX(0,H6-I6)))');
formula('Business Expenses','O6','=IF(A6="",0,IF(AND(ISNUMBER(B6),COUNT(F6:I6)=4,OR(K6="yes",K6="no"),OR(L6="yes",L6="no"),M6<>"unknown",M6<>""),1,0))');
sheets['Settings & Assumptions'].getRange('F13:F15').values=[['Bankbron bruikbaar'],['Factuurbron bruikbaar'],['Kostenbron bruikbaar']];
formula('Settings & Assumptions','G13','=IF(AND(B9=1,COUNTIFS(Accounts[include],1)>0,SUM(Accounts[valid])=COUNTIFS(Accounts[include],1),COUNTIFS(Transactions[duplicate_status],"conflict")=0,COUNTIFS(Transactions[include_in_totals],1,Transactions[valid],0)=0),1,0)');
formula('Settings & Assumptions','G14','=IF(AND(B10=1,SUM(Invoices[valid])=COUNTA(Invoices[id])),1,0)');
formula('Settings & Assumptions','G15','=IF(AND(B11=1,SUM(Expenses[valid])=COUNTA(Expenses[id])),1,0)');
sheets['Business Expenses'].getRange('F6:I90').setNumberFormat(money);sheets['Business Expenses'].getRange('B6:B90').setNumberFormat('dd-mm-yyyy');

title('Monthly Reports','Maandrapporten','Alleen complete bronperioden tonen cijfers. Winst is factuuromzet minus geboekte kosten; cashflow volgt bankmutaties.');
const mh=['Maand','Omzet excl. btw','Kosten excl. btw','Operationele winst','Privé-uitgaven','Netto bankmutaties','Marge','Beginsaldo','Eindsaldo','Nettovermogen','Werkdagen','Uren','Omzet / dag','Omzet / uur','Maandlabel'];
table('Monthly Reports','Months',mh,Array.from({length:24},(_,i)=>[new Date(Date.UTC(2025,10+i,1)),...Array(14).fill(null)]));
for(let r=6;r<=29;r++){
 const bounds=(t,d)=>`,${t}[${d}],">="&A${r},${t}[${d}],"<"&MIN(EDATE(A${r},1),${S}$B$6+1)`;
 formula('Monthly Reports',`B${r}`,`IF(OR(${R}<>1,A${r}>${S}$B$6),"n.b.",SUMIFS(Invoices[amount_excl]${bounds('Invoices','date')},Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`);
 formula('Monthly Reports',`C${r}`,`IF(OR(${E}<>1,A${r}>${S}$B$6),"n.b.",SUMIFS(Expenses[amount_excl]${bounds('Expenses','date')},Expenses[capital_asset],"no"))`);
 formula('Monthly Reports',`D${r}`,`IF(COUNT(B${r}:C${r})<2,"n.b.",B${r}-C${r})`);
 const guard=`OR(${G}<>1,A${r}>${S}$B$6,${S}$B$13>A${r},${S}$B$14<MIN(EDATE(A${r},1)-1,${S}$B$6),NOT(ISNUMBER(${S}$B$13)),NOT(ISNUMBER(${S}$B$14)))`;
 formula('Monthly Reports',`E${r}`,`IF(${guard},"n.b.",-SUMIFS(Transactions[amount],Transactions[include_in_totals],1${bounds('Transactions','booking_date')},Transactions[classification],"private",Transactions[amount],"<0",Transactions[currency],"EUR",Transactions[duplicate_status],""))`);
 formula('Monthly Reports',`F${r}`,`IF(${guard},"n.b.",SUMIFS(Transactions[amount],Transactions[include_in_totals],1${bounds('Transactions','booking_date')},Transactions[currency],"EUR",Transactions[duplicate_status],""))`);
 formula('Monthly Reports',`G${r}`,`IF(COUNT(B${r},D${r})<2,"n.b.",IF(B${r}=0,"n.b.",D${r}/B${r}))`);
 for(const [cl,den] of [['M','K'],['N','L']])formula('Monthly Reports',`${cl}${r}`,`IF(OR(NOT(ISNUMBER(B${r})),${den}${r}="",${den}${r}<=0),"n.b.",B${r}/${den}${r})`);
 formula('Monthly Reports',`O${r}`,`TEXT(A${r},"mmm yy")`);
}
sheets['Monthly Reports'].getRange('A6:A29').setNumberFormat('mmm yyyy');sheets['Monthly Reports'].getRange('B6:F29').setNumberFormat(money);sheets['Monthly Reports'].getRange('G6:G29').setNumberFormat('0.0%');
note('Monthly Reports',32,'Vul historische begin-/eindsaldi en nettovermogen uitsluitend uit bewaarde maandafsluitingen in. Deze standen kunnen niet betrouwbaar uit onvolledige transacties worden gereconstrueerd.');
sheets['Monthly Reports'].getRange('P5:S5').values=[['Privé cashsparen','Privé beschikbaar','Spaarquote','Opbouw cashsparen']];
for(let r=6;r<=29;r++){
 formula('Monthly Reports',`P${r}`,`IF(NOT(ISNUMBER(E${r})),"n.b.",SUMIFS(Transactions[amount],Transactions[include_in_totals],1,Transactions[account_type],"private",Transactions[booking_date],">="&A${r},Transactions[booking_date],"<"&EDATE(A${r},1),Transactions[currency],"EUR",Transactions[duplicate_status],""))`);
 formula('Monthly Reports',`Q${r}`,`IF(COUNT(P${r},E${r})<2,"n.b.",P${r}+E${r})`);
 formula('Monthly Reports',`R${r}`,`IF(OR(NOT(ISNUMBER(Q${r})),Q${r}<=0),"n.b.",P${r}/Q${r})`);
 formula('Monthly Reports',`S${r}`,r===6?`IF(ISNUMBER(P${r}),P${r},"n.b.")`:`IF(ISNUMBER(P${r}),IF(ISNUMBER(S${r-1}),S${r-1}+P${r},P${r}),"n.b.")`);
}
sheets['Monthly Reports'].getRange('R6:R29').setNumberFormat('0.0%');

const cur=`DATE(YEAR(${S}$B$6),MONTH(${S}$B$6),1)`;
function monthLookup(column,offset=0){return `INDEX('Monthly Reports'!${column}6:${column}29,MATCH(EDATE(${cur},${offset}),'Monthly Reports'!A6:A29,0))`;}
title('Business Overview','Zakelijk overzicht','Bedragen excl. btw. Historische cijfers blijven niet beschikbaar totdat facturen en kosten gecontroleerd zijn.');
pairs('Business Overview',[
 ['Omzet deze maand',`=${monthLookup('B')}`],['Omzet vorige maand',`=${monthLookup('B',-1)}`],
 ['Omzet dit jaar',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[date],">="&DATE(YEAR(${S}$B$6),1,1),Invoices[date],"<="&${S}$B$6,Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Kosten deze maand',`=${monthLookup('C')}`],['Kosten vorige maand',`=${monthLookup('C',-1)}`],['Operationele winst deze maand',`=${monthLookup('D')}`],['Winstmarge',`=${monthLookup('G')}`,'0.0%'],
 ['Openstaande klantfacturen',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[open],Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Vervallen klantfacturen',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[open],Invoices[due_date],"<"&${S}$B$6,Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Omzet per gewerkte dag',`=${monthLookup('M')}`],['Omzet per gewerkt uur',`=${monthLookup('N')}`],
 ['Omzetgroei t.o.v. vorige maand','=IF(COUNT(E6:E7)<2,"n.b.",IF(E7=0,"n.b.",E6/E7-1))','0.0%'],
 ['Openstaande leveranciers',`=IF(${E}<>1,"n.b.",SUM(Expenses[open]))`],
 ['Gemiddelde factuurwaarde',`=IF(${R}<>1,"n.b.",IF(COUNTIFS(Invoices[status],"<>concept",Invoices[status],"<>geannuleerd",Invoices[id],"<>")=0,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[status],"<>concept",Invoices[status],"<>geannuleerd")/COUNTIFS(Invoices[status],"<>concept",Invoices[status],"<>geannuleerd",Invoices[id],"<>")))`],
 ['Kosten dit jaar',`=IF(${E}<>1,"n.b.",SUMIFS(Expenses[amount_excl],Expenses[date],">="&DATE(YEAR(${S}$B$6),1,1),Expenses[date],"<="&${S}$B$6,Expenses[capital_asset],"no"))`],
 ['Winst dit jaar','=IF(COUNT(E8,E20)<2,"n.b.",E8-E20)'],
 ['Gemiddelde kosten laatste 3 maanden',`=IF(COUNT(${monthLookup('C',-1)},${monthLookup('C',-2)},${monthLookup('C',-3)})<3,"n.b.",AVERAGE(${monthLookup('C',-1)},${monthLookup('C',-2)},${monthLookup('C',-3)}))`],
 ['Kosten op jaarbasis','=IF(ISNUMBER(E22),E22*12,"n.b.")'],
]);
pairs('Business Overview',[
 ['Omzet peildatum',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[date],${S}$B$6,Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Omzet huidige week',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[date],">="&(${S}$B$6-WEEKDAY(${S}$B$6,2)+1),Invoices[date],"<="&${S}$B$6,Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Omzet huidige kwartaal',`=IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[date],">="&DATE(YEAR(${S}$B$6),INT((MONTH(${S}$B$6)-1)/3)*3+1,1),Invoices[date],"<="&${S}$B$6,Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`],
 ['Winst per werkdag',`=IF(OR(NOT(ISNUMBER(E11)),NOT(ISNUMBER(${monthLookup('K')})),${monthLookup('K')}<=0),"n.b.",E11/${monthLookup('K')})`],
 ['Winst per gewerkt uur',`=IF(OR(NOT(ISNUMBER(E11)),NOT(ISNUMBER(${monthLookup('L')})),${monthLookup('L')}<=0),"n.b.",E11/${monthLookup('L')})`],
 ['Zakelijke kostenratio','=IF(OR(COUNT(E6,E9)<2,E6=0),"n.b.",E9/E6)','0.0%'],
 ],26);
table('Project Profitability','Projects',['project_id','Klant','Omschrijving','Offerte excl.','Begrote uren','Werkelijke uren','Omzet excl.','Materiaalkosten','Overige kosten','Brutowinst','Marge','Winst per uur'],Array.from({length:20},()=>Array(12).fill(null)));
title('Project Profitability','Projectresultaat','Vul project-ID en werkelijke uren in. Gedeelde kosten worden alleen op expliciete projecttoewijzing meegenomen.');
for(let r=6;r<=25;r++){
 formula('Project Profitability',`G${r}`,`IF(A${r}="","",IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[project_id],A${r},Invoices[status],"<>concept",Invoices[status],"<>geannuleerd")))`);
 for(const [cl,op] of [['H','materiaal'],['I','<>materiaal']])formula('Project Profitability',`${cl}${r}`,`IF(A${r}="","",IF(${E}<>1,"n.b.",SUMIFS(Expenses[amount_excl],Expenses[project_id],A${r},Expenses[category],"${op}",Expenses[capital_asset],"no")))`);
 formula('Project Profitability',`J${r}`,`IF(A${r}="","",IF(COUNT(G${r}:I${r})<3,"n.b.",G${r}-H${r}-I${r}))`);
 formula('Project Profitability',`K${r}`,`IF(A${r}="","",IF(OR(NOT(ISNUMBER(J${r})),G${r}=0),"n.b.",J${r}/G${r}))`);
 formula('Project Profitability',`L${r}`,`IF(A${r}="","",IF(OR(NOT(ISNUMBER(J${r})),F${r}<=0),"n.b.",J${r}/F${r}))`);
}
sheets['Project Profitability'].getRange('K6:K25').setNumberFormat('0.0%');

const privCats=['Boodschappen','Restaurants','Wonen','Zorgverzekering','Telefoon','Internet','Opslag','Verzekeringen','Abonnementen','Reizen','Entertainment','Kleding','Vervoer','Persoonlijke aankopen','Overig'];
title('Private Expenses','Privé-uitgaven','Alleen externe privé-uitgaven. Overboekingen en privéonttrekkingen zijn geen consumptie.');
table('Private Expenses','PrivateCategories',['Categorie','Type','Essentieel','Deze maand','Vorige maand','Verschil','3-maandgemiddelde','Minimaal budget','Comfortabel budget','Reisbudget'],privCats.map((x,i)=>[x,i>1&&i<9?'Vast':'Variabel',i===0||i>1&&i<8?'Ja':'Nee',null,null,null,null,null,null,null]));
for(let r=6;r<=20;r++){
 const sum=(start)=>`-SUMIFS(Transactions[amount],Transactions[include_in_totals],1,Transactions[category],A${r},Transactions[classification],"private",Transactions[amount],"<0",Transactions[booking_date],">="&${start},Transactions[booking_date],"<"&EDATE(${start},1),Transactions[currency],"EUR",Transactions[duplicate_status],"")`;
 for(const [cl,off] of [['D',0],['E',-1]])formula('Private Expenses',`${cl}${r}`,`IF(OR(${G}<>1,NOT(ISNUMBER(${S}$B$13)),NOT(ISNUMBER(${S}$B$14)),${S}$B$13>EDATE(${cur},${off}),${S}$B$14<EDATE(${cur},${off+1})-1),"n.b.",${sum(`EDATE(${cur},${off})`)})`);
 formula('Private Expenses',`F${r}`,`IF(COUNT(D${r}:E${r})<2,"n.b.",D${r}-E${r})`);
 formula('Private Expenses',`G${r}`,`IF(OR(${G}<>1,NOT(ISNUMBER(${S}$B$13)),${S}$B$13>EDATE(${cur},-3),${S}$B$14<${cur}-1),"n.b.",(${sum(`EDATE(${cur},-1)`)}+${sum(`EDATE(${cur},-2)`)}+${sum(`EDATE(${cur},-3)` )})/3)`);
}
sheets['Private Expenses'].getRange('D6:J20').setNumberFormat(money);
title('Recurring Expenses','Terugkerende verplichtingen','Registreer bevestigde abonnementen en vaste lasten. Gelijke leveranciers zijn een controlesignaal, geen bewezen dubbel abonnement.');
table('Recurring Expenses','Recurring',['id','Leverancier','Classificatie','Categorie','Bedrag','Maanden per betaling','Maandbedrag','Volgende betaling','Actief','Opzegdatum','Controle'],Array.from({length:20},()=>Array(11).fill(null)));
for(let r=6;r<=25;r++){formula('Recurring Expenses',`G${r}`,`IF(A${r}="","",IF(OR(E${r}="",F${r}<=0),"n.b.",E${r}/F${r}))`);formula('Recurring Expenses',`K${r}`,`IF(A${r}="","",IF(COUNTIFS(Recurring[Leverancier],B${r},Recurring[Actief],"Ja")>1,"Controleer overlap",""))`);}
title('Private Overview','Privéoverzicht','Runway gebruikt vrij besteedbare cash en een expliciet leefbudget. Onvolledige maanden tellen niet als nul mee.');
pairs('Private Overview',[
 ['Privé-uitgaven deze maand',`=${monthLookup('E')}`],['Gemiddelde laatste 3 volle maanden',`=IF(COUNT(${monthLookup('E',-1)},${monthLookup('E',-2)},${monthLookup('E',-3)})<3,"n.b.",AVERAGE(${monthLookup('E',-1)},${monthLookup('E',-2)},${monthLookup('E',-3)}))`],
 ['Vast deze maand',`=IF(ISNUMBER(E6),SUMIFS(PrivateCategories[Deze maand],PrivateCategories[Type],"Vast"),"n.b.")`],
 ['Variabel deze maand',`=IF(ISNUMBER(E6),SUMIFS(PrivateCategories[Deze maand],PrivateCategories[Type],"Variabel"),"n.b.")`],
 ['Reiskosten deze maand',"='Private Expenses'!D15"],['Runway comfortabel (maanden)',`=IF(ISNUMBER('Net Worth'!E15),MAX(0,'Net Worth'!E15)/${S}$B$23,"n.b.")`,'0.0'],
 ['Vrije cash',"='Net Worth'!E15"],['Maandelijks leefbudget',`=${S}$B$23`],
 ['Spaarcapaciteit / werkmaand',`=IF(ISNUMBER(${S}$B$34),${S}$B$34*${S}$B$20-${S}$B$23,"n.b.")`],
 ['Spaarquote / werkmaand',`=IF(OR(NOT(ISNUMBER(E14)),${S}$B$34<=0),"n.b.",E14/(${S}$B$34*${S}$B$20))`,'0.0%']]);
pairs('Private Overview',[
 ['Werkelijk cashsparen maand',`=${monthLookup('P')}`],['Werkelijk privé beschikbaar maand',`=${monthLookup('Q')}`],['Werkelijke spaarquote maand',`=${monthLookup('R')}`,'0.0%'],
 ],18);

// Fiscale planning met bronjaar, expliciete aftrekkeuzes en reeds betaalde bedragen.
title('Dutch Taxes','Nederlandse belastingen','Raming 2026 vóór AOW. Heffingskortingen, KIA en overige inkomsten zijn expliciete persoonlijke invoer. Prognosejaren gebruiken een aparte reserveaanname.');
const taxParams=[['Schijf 1 grens',38883],['Schijf 2 grens',78426],['Tarief 1',.3575],['Tarief 2',.3756],['Tarief 3',.495],['Zelfstandigenaftrek',1200],['Startersaftrek',2123],['MKB-vrijstelling',.127],['Zvw tarief',.0485],['Zvw maximum',79409]];
sheets['Dutch Taxes'].getRange('J5:K15').values=[['Parameter 2026','Waarde'],...taxParams];
sheets['Dutch Taxes'].getRange('J5:J15').format.columnWidth=28;sheets['Dutch Taxes'].getRange('K6:K15').format.font.color=c.blue;
for(const r of [8,9,10,13,14])sheets['Dutch Taxes'].getRange(`K${r}`).setNumberFormat('0.00%');
pairs('Dutch Taxes',[
 ['Jaarwinst vóór aftrek',`=IF(OR(${S}$B$48<>1,${S}$B$7<>2026,COUNT(${S}$B$36:${S}$B$39)<4),"n.b.",${S}$B$38-${S}$B$37+${S}$B$36)`],
 ['Ondernemersaftrek',`=IF(AND(ISNUMBER(E6),ISNUMBER(${S}$B$43)),IF(AND(${S}$B$40=1,${S}$B$41=1),K11+K12,MIN(MAX(0,E6-${S}$B$43),${S}$B$40*K11)),"n.b.")`],
 ['Na ondernemersaftrek en KIA',`=IF(OR(NOT(ISNUMBER(E7)),NOT(ISNUMBER(${S}$B$43))),"n.b.",E6-E7-${S}$B$43)`],
 ['MKB-winstvrijstelling',`=IF(ISNUMBER(E8),E8*K13*${S}$B$42,"n.b.")`],
 ['Belastbare ondernemingswinst','=IF(COUNT(E8:E9)<2,"n.b.",E8-E9)'],
 ['Totaal box 1',`=IF(ISNUMBER(E10),MAX(0,E10+${S}$B$39),"n.b.")`],
 ['IB vóór heffingskortingen','=IF(ISNUMBER(E11),MIN(E11,K6)*K8+MAX(0,MIN(E11,K7)-K6)*K9+MAX(0,E11-K7)*K10,"n.b.")'],
 ['Tariefcorrectie aftrek',`=IF(ISNUMBER(E11),MIN(MAX(0,E6+${S}$B$39-${S}$B$43-K7),MAX(0,E7+E9))*(K10-K9),"n.b.")`],
 ['IB na heffingskortingen',`=IF(OR(NOT(ISNUMBER(E12)),NOT(ISNUMBER(${S}$B$44))),"n.b.",MAX(0,E12+E13-${S}$B$44))`],
 ['Zvw raming','=IF(ISNUMBER(E10),MAX(0,MIN(E10,K15))*K14,"n.b.")'],
 ['Resterende IB + Zvw',`=IF(OR(COUNT(E14:E15)<2,NOT(ISNUMBER(${S}$B$45))),"n.b.",MAX(0,E14+E15-${S}$B$45))`],
 ['Resterende btw',`=IF(OR(${R}<>1,${E}<>1,COUNT(H26:H29)<4,NOT(ISNUMBER(${S}$B$46))),"n.b.",MAX(0,SUM(H26:H29)+${S}$B$46))`],
 ['Totale belastingverplichting',`=IF(OR(COUNT(E16:E17)<2,NOT(ISNUMBER(${S}$B$47))),"n.b.",SUM(E16:E17)+${S}$B$47)`],
 ['Tekort belastingpot',`=IF(OR(NOT(ISNUMBER(E18)),NOT(ISNUMBER(${S}$B$27))),"n.b.",MAX(0,E18-${S}$B$27))`],
]);
table('Dutch Taxes','VAT',['Kwartaal','Omzet 21%','Omzet 9%','Omzet 0%','Omzet verlegd','Btw saldo','Btw betaald','Resterend'],Array.from({length:4},(_,i)=>[new Date(Date.UTC(2026,i*3,1)),...Array(7).fill(null)]),25);
for(let r=26;r<=29;r++){
 for(const [cl,vat] of [['B','21%'],['C','9%'],['D','0%'],['E','reverse']])formula('Dutch Taxes',`${cl}${r}`,`IF(${R}<>1,"n.b.",SUMIFS(Invoices[amount_excl],Invoices[date],">="&A${r},Invoices[date],"<"&EDATE(A${r},3),Invoices[vat_treatment],"${vat}",Invoices[status],"<>concept",Invoices[status],"<>geannuleerd"))`);
 formula('Dutch Taxes',`F${r}`,`IF(OR(${R}<>1,${E}<>1),"n.b.",SUMIFS(Invoices[vat],Invoices[date],">="&A${r},Invoices[date],"<"&EDATE(A${r},3),Invoices[status],"<>concept",Invoices[status],"<>geannuleerd")-SUMIFS(Expenses[vat_deductible],Expenses[date],">="&A${r},Expenses[date],"<"&EDATE(A${r},3)))`);
 formula('Dutch Taxes',`H${r}`,`IF(COUNT(F${r}:G${r})<2,"n.b.",F${r}-G${r})`);
}
sheets['Dutch Taxes'].getRange('A26:A29').setNumberFormat('mmm yyyy');
note('Dutch Taxes',32,'Btw “verlegd” vereist controle van verschuldigde én aftrekbare btw. Bij buitenlandse btw, gemengde prestaties of gedeeltelijke aftrek eerst fiscale bedragen aanvullen.');
note('Dutch Taxes',34,'De Zvw-raming veronderstelt geen ander reeds benutte Zvw-grondslag. Zet tax scope pas op 1 als deze vereenvoudiging past. Een fiscale aanslag blijft apart bevestigd.');
note('Dutch Taxes',36,'Bron tarieven 2026: https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen');
note('Dutch Taxes',38,'Bron aftrek 2026: https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/ondernemersaftrek_en_investeringsaftrek');
note('Dutch Taxes',40,'Bron Zvw 2026: https://open.overheid.nl/documenten/916b30f3-eafd-4acf-bd5a-f58319dae544/file');

const items=['Isolatie','Vloer','Wandpanelen','Plafond','Elektrische installatie','LiFePO4 accu’s','DC-DC lader','Zonnepanelen','Omvormer','Bekabeling','Zekeringkasten','Verlichting','Bedlift','Matras','Zithoek','Keuken','Koelkast','Oven','Watertanks','Waterpomp','Douche','Verwarming','Ventilatie','Ramen','Meubels','Hang- en sluitwerk','Onvoorzien'];
title('Van Conversion','Camperombouw','Begroot alle onderdelen inclusief btw. Leeg betekent nog niet begroot; vul bewust 0 in voor onderdelen die je overslaat.');
table('Van Conversion','Conversion',['Onderdeel','Begroot incl.','Werkelijk incl.','Betaald','Resterend','Prioriteit','Status','Leverancier','Notities','Vanaf scenario'],items.map(x=>[x,null,null,null,null,'Normaal','Nog plannen','','',3]));
for(let r=6;r<=32;r++)formula('Van Conversion',`E${r}`,`IF(OR(NOT(ISNUMBER(B${r})),NOT(ISNUMBER(D${r}))),"n.b.",MAX(0,IF(NOT(ISNUMBER(C${r})),B${r},C${r})-D${r}))`);
sheets['Van Conversion'].getRange('F6:F32').dataValidation={rule:{type:'list',values:['Essentieel','Normaal','Later']}};sheets['Van Conversion'].getRange('J6:J32').dataValidation={rule:{type:'list',values:['1','2','3']}};
pairs('Van Conversion',[['Totaal begroot','=IF(COUNT(B6:B32)<27,"n.b.",SUM(B6:B32))'],['Nog te betalen','=IF(COUNT(E6:E32)<27,"n.b.",SUM(E6:E32))']],35);
title('Van Purchase','Mercedes Sprinter L2H2','Prijzen zijn scenario’s exclusief btw. Terugvorderbare btw is pas beschikbaar wanneer die daadwerkelijk terugontvangen is.');
pairs('Van Purchase',[
 ['Koopsom excl. btw',30000],['Btw aankoop',.21,'0.0%'],['Koopsom incl. btw','=E6*(1+E7)'],['Registratiekosten',null],['Keuring',null],['Eerste onderhoud',null],['Verzekering eerste periode',null],['Motorrijtuigenbelasting eerste periode',null],['Onvoorzien',null],
 ['Totaal voertuig','=IF(COUNT(E8:E14)<7,"n.b.",SUM(E8:E14))'],['Totaal ombouw',"='Van Conversion'!E35"],['Totaal project','=IF(COUNT(E15:E16)<2,"n.b.",SUM(E15:E16))'],['Gereserveerd voor bus en ombouw',"=IF(COUNT('Financial Goals'!C6:C7)<2,\"n.b.\",SUM('Financial Goals'!C6:C7))"],['Nog nodig','=IF(COUNT(E17:E18)<2,"n.b.",MAX(0,E17-E18))'],
 ['Extra werkdagen',`=IF(OR(NOT(ISNUMBER(E19)),NOT(ISNUMBER(${S}$B$34)),${S}$B$34<=0),"n.b.",ROUNDUP(E19/${S}$B$34,0))`,'0'],
 ['Cash na volledige aankoop',`=IF(COUNT(E17,'Net Worth'!E6)<2,"n.b.",'Net Worth'!E6-E17)`],
 ['Geschatte datum',`=IF(OR(NOT(ISNUMBER(E19)),${S}$B$28<=0),"n.b.",EDATE(${S}$B$6,ROUNDUP(E19/${S}$B$28,0)))`,'dd-mm-yyyy'],
]);
table('Van Purchase','VanPrices',['Koop excl. btw','Koop incl. btw','Extra werkdagen'],[25000,30000,35000,40000].map(p=>[p,null,null]),26);
for(let r=27;r<=30;r++){formula('Van Purchase',`B${r}`,`A${r}*(1+$E$7)`);formula('Van Purchase',`C${r}`,`IF(OR(NOT(ISNUMBER(${S}$B$34)),${S}$B$34<=0),"n.b.",ROUNDUP(B${r}/${S}$B$34,0))`);}
table('Van Purchase','VanCases',['Scenario','Ombouwbudget','Totale cashbehoefte'],[['Basis',null,null],['Comfortabel',null,null],['Compleet',null,null]],34);
for(let r=35;r<=37;r++){formula('Van Purchase',`B${r}`,`IF(COUNT('Van Conversion'!B6:B32)<27,"n.b.",SUMIFS(Conversion[Begroot incl.],Conversion[Vanaf scenario],"<=${r-34}"))`);formula('Van Purchase',`C${r}`,`IF(COUNT(B${r},$E$15)<2,"n.b.",B${r}+$E$15)`);}

title('Financial Goals','Financiële doelen','Reserveringen mogen samen nooit hetzelfde geld bevatten. Vermogensmijlpalen zijn meetdoelen en worden niet nogmaals als cashreserve afgetrokken.');
const goals=[['Sprinter',null,null,'Cashreserve'],['Ombouw',null,null,'Cashreserve'],['Noodbuffer',20000,null,'Cashreserve'],['Reisfonds',null,null,'Cashreserve'],['Investeringsinleg',null,null,'Cashreserve'],['€50.000 liquide',50000,null,'Mijlpaal'],['€100.000 liquide',100000,null,'Mijlpaal'],['€200.000 beleggingen',200000,null,'Mijlpaal'],['€1.000 passief / maand',1000,null,'Inkomen'],['€2.000 passief / maand',2000,null,'Inkomen'],['Financiële onafhankelijkheid',null,null,'Mijlpaal']];
table('Financial Goals','Goals',['Doel','Doelbedrag','Huidig','Type','Resterend','Voortgang','Maandinleg','Gewenste datum','Nodig / maand','Werkdagen','Geschatte datum'],goals.map(x=>[...x,...Array(7).fill(null)]));
formula('Financial Goals','B6',"'Van Purchase'!E15");formula('Financial Goals','B7',"'Van Conversion'!E35");
for(let r=6;r<=16;r++){
 formula('Financial Goals',`E${r}`,`IF(COUNT(B${r}:C${r})<2,"n.b.",MAX(0,B${r}-C${r}))`);
 formula('Financial Goals',`F${r}`,`IF(OR(COUNT(B${r}:C${r})<2,B${r}<=0),"n.b.",MIN(1,C${r}/B${r}))`);
 formula('Financial Goals',`I${r}`,`IF(OR(NOT(ISNUMBER(E${r})),NOT(ISNUMBER(H${r})),H${r}<=${S}$B$6,D${r}="Inkomen"),"n.b.",E${r}/MAX(1,(H${r}-${S}$B$6)/30.4375))`);
 formula('Financial Goals',`J${r}`,`IF(OR(D${r}="Inkomen",NOT(ISNUMBER(E${r})),NOT(ISNUMBER(${S}$B$34)),${S}$B$34<=0),"n.b.",ROUNDUP(E${r}/${S}$B$34,0))`);
 formula('Financial Goals',`K${r}`,`IF(OR(D${r}="Inkomen",NOT(ISNUMBER(E${r})),G${r}<=0),"n.b.",EDATE(${S}$B$6,ROUNDUP(E${r}/G${r},0)))`);
}
sheets['Financial Goals'].getRange('F6:F16').setNumberFormat('0%');sheets['Financial Goals'].getRange('F6:F16').conditionalFormats.add('dataBar',{color:c.blue});sheets['Financial Goals'].getRange('H6:H16').setNumberFormat('dd-mm-yyyy');sheets['Financial Goals'].getRange('K6:K16').setNumberFormat('dd-mm-yyyy');
note('Financial Goals',19,'Geen kanspercentages: onvoldoende historische gegevens voor een verdedigbaar kansmodel. Vergelijk de cashprognose onder de drie scenario’s.');

title('Net Worth','Vermogen en besteedbare cash','Spaargeld staat in Accounts. Voeg hier uitsluitend niet-contante activa en nog niet elders opgenomen schulden toe.');
pairs('Net Worth',[
 ['Bank- en spaarsaldi totaal',`=IF(OR(${G}<>1,COUNTIFS(Accounts[include],1)=0),"n.b.",SUMIFS(Accounts[closing],Accounts[include],1,Accounts[currency],"EUR"))`],
 ['Privérekeningen',`=IF(${G}<>1,"n.b.",SUMIFS(Accounts[closing],Accounts[type],"private",Accounts[include],1,Accounts[currency],"EUR"))`],
 ['Zakelijke rekeningen',`=IF(${G}<>1,"n.b.",SUMIFS(Accounts[closing],Accounts[type],"business",Accounts[include],1,Accounts[currency],"EUR"))`],
 ['Niet-contante activa',`=IF(COUNT(C26:C31)<6,"n.b.",SUM(C26:C31))`],
 ['Overige schulden',`=IF(COUNT(C35:C38)<4,"n.b.",SUM(C35:C38))`],
 ['Openstaande klanten',"='Business Overview'!E13"],['Openstaande leveranciers',"='Business Overview'!E18"],['Belastingverplichtingen',"='Dutch Taxes'!E18"],
 ['Unieke cashreserveringen',`=IF(OR(COUNT('Financial Goals'!C6:C10)<5,NOT(ISNUMBER(${S}$B$26))),"n.b.",SUM('Financial Goals'!C6:C10)+${S}$B$26)`],
 ['Vrij besteedbare cash',`=IF(OR(${O}<>1,COUNT(E6,E10,E12:E14)<5),"n.b.",E6-E10-E12-E13-E14)`],
 ['Nettovermogen',`=IF(COUNT(E6,E9:E13)<6,"n.b.",E6+E9+E11-E10-E12-E13)`],
 ]);
table('Net Worth','Assets',['Soort','Omschrijving','Waarde','Waarderingsdatum'],['Beleggingen','Voertuig','Gereedschap','Vastgoed','Overige activa','Overige vorderingen'].map(x=>[x,'',null,null]),25);
table('Net Worth','Debts',['Soort','Omschrijving','Openstaand','Peildatum'],['Leningen','Krediet','Voertuigfinanciering','Overige schulden'].map(x=>[x,'',null,null]),34);
note('Net Worth',41,'Vrije cash trekt conservatief alle openstaande schulden af. Nettovermogen trekt spaardoelen niet af: gereserveerd geld blijft bezit.');

title('Financial Freedom','Werken en reizen','Scenario’s op basis van omzet, kosten en de instelbare belastingreserve. Reisbudget vervangt het gewone leefbudget tijdens reizen.');
table('Financial Freedom','Freedom',['Werkmaanden','Omzet / dag','Werkdagen','Jaaromzet','Zakelijke kosten','Winst','Belastingreserve','Privé beschikbaar','Leefkosten werkmaanden','Reiskosten','Jaarsparen','Cash eindjaar'],[2,3,4,5,6].flatMap(m=>[500,650,800].map(d=>[m,d,...Array(10).fill(null)])));
for(let r=6;r<=20;r++){
 formula('Financial Freedom',`C${r}`,`A${r}*${S}$B$20`);formula('Financial Freedom',`D${r}`,`B${r}*C${r}`);
 formula('Financial Freedom',`E${r}`,`IF(COUNT(${S}$B$17:${S}$B$18)<2,"n.b.",D${r}*${S}$B$17+12*${S}$B$18)`);
 formula('Financial Freedom',`F${r}`,`IF(ISNUMBER(E${r}),D${r}-E${r},"n.b.")`);
 formula('Financial Freedom',`G${r}`,`IF(OR(NOT(ISNUMBER(F${r})),NOT(ISNUMBER(${S}$B$19))),"n.b.",MAX(0,F${r})*${S}$B$19)`);
 formula('Financial Freedom',`H${r}`,`IF(COUNT(F${r}:G${r})<2,"n.b.",F${r}-G${r})`);
 formula('Financial Freedom',`I${r}`,`A${r}*${S}$B$23`);formula('Financial Freedom',`J${r}`,`(12-A${r})*${S}$B$24`);
 formula('Financial Freedom',`K${r}`,`IF(ISNUMBER(H${r}),H${r}-I${r}-J${r},"n.b.")`);
 formula('Financial Freedom',`L${r}`,`IF(COUNT(K${r},'Net Worth'!E15)<2,"n.b.",K${r}+'Net Worth'!E15)`);
}
table('Financial Freedom','Runway',['Maandbudget','Maanden zonder inkomen'],[1000,1500,2000,2500,3000].map(x=>[x,null]),24);
for(let r=25;r<=29;r++)formula('Financial Freedom',`B${r}`,`IF(ISNUMBER('Net Worth'!E15),MAX(0,'Net Worth'!E15)/A${r},"n.b.")`);
pairs('Financial Freedom',[
 ['Minimale jaarlijkse privébehoefte',`=${S}$B$22*12`],['Werkdagen voor minimumleven',`=IF(OR(NOT(ISNUMBER(${S}$B$34)),${S}$B$34<=0),"n.b.",ROUNDUP(E33/${S}$B$34,0))`,'0'],
 ['Werkmaanden voor minimumleven',`=IF(ISNUMBER(E34),E34/${S}$B$20,"n.b.")`,'0.0'],
 ['Reismaanden met vrije cash',`=IF(ISNUMBER('Net Worth'!E15),MAX(0,'Net Worth'!E15)/${S}$B$24,"n.b.")`,'0.0'],
 ['Passief gedekt comfortabel',`=IF(NOT(ISNUMBER(${S}$B$30)),"n.b.",${S}$B$30/${S}$B$23)`,'0.0%'],
 ],33);

title('Work & Travel Planning','Werk- en reisplanning','Vul alle 36 maanden expliciet in. Geen veronderstelde gelijke omzetverdeling. Een leeg werk-/reisveld blokkeert de prognose.');
table('Work & Travel Planning','Plan',['Maand','Werkdagen','Reismaand 0/1','Ontvangsten extra incl. btw','Busbetaling','Ombouwbetaling','Beleggingsinleg','Btw cashbetaling','IB cashbetaling','Overige cashbetaling','Opmerking'],Array.from({length:36},()=>Array(11).fill(null)));
for(let r=6;r<=41;r++)formula('Work & Travel Planning',`A${r}`,`EDATE(${S}$B$35,${r-6})`);
sheets['Work & Travel Planning'].getRange('A6:A41').setNumberFormat('mmm yyyy');sheets['Work & Travel Planning'].getRange('B6:K41').format.font.color=c.blue;
sheets['Work & Travel Planning'].getRange('C6:C41').dataValidation={rule:{type:'list',values:['0','1']}};
note('Work & Travel Planning',44,'Omzet in de prognose veronderstelt ontvangst in dezelfde maand. Verschuif vertraagde ontvangsten met positieve/negatieve extra cashflow. Btw wordt afzonderlijk ingevoerd.');

title('Cash Flow Forecast','Cashprognose 36 maanden','Model in euro, exclusief btw op omzet/kosten. Vul netto btw-cashmutaties expliciet in; spaarpot-overboekingen zijn geen cashuitgaven.');
table('Cash Flow Forecast','Forecast',['Maand','Omzetfactor','Kostenfactor','Begincash','Omzet / ontvangst excl.','Zakelijke cashkosten excl.','Privé / reizen','Belastingbetaling','Bus / ombouw','Investeringen','Extra ontvangsten','Overige uitgaven','Eindcash','Buffertekort'],Array.from({length:36},()=>Array(14).fill(null)));
// Eén actief model; scenariofactoren leven op deze invoerrijen in Settings.
sheets['Settings & Assumptions'].getRange('F6:I10').values=[['Driver','Conservatief','Basis','Optimistisch'],['Omzetfactor',.8,1,1.2],['Kostenfactor',1.15,1,.95],['Actief omzet',null,null,null],['Actief kosten',null,null,null]];
formula('Settings & Assumptions','G9',`CHOOSE(B8,G7,H7,I7)`);formula('Settings & Assumptions','G10',`CHOOSE(B8,G8,H8,I8)`);
for(let r=6;r<=41;r++){
 const p=`'Work & Travel Planning'!`;
 formula('Cash Flow Forecast',`A${r}`,`${p}A${r}`);formula('Cash Flow Forecast',`B${r}`,`${S}$G$9`);formula('Cash Flow Forecast',`C${r}`,`${S}$G$10`);
 formula('Cash Flow Forecast',`D${r}`,r===6?"'Net Worth'!E6":`M${r-1}`);
 formula('Cash Flow Forecast',`E${r}`,`IF(NOT(ISNUMBER(${p}B${r})),"n.b.",${p}B${r}*${S}$B$16*B${r})`);
 formula('Cash Flow Forecast',`F${r}`,`IF(OR(NOT(ISNUMBER(E${r})),COUNT(${S}$B$17:${S}$B$18)<2),"n.b.",(E${r}*${S}$B$17+${S}$B$18)*C${r})`);
 formula('Cash Flow Forecast',`G${r}`,`IF(NOT(ISNUMBER(${p}C${r})),"n.b.",IF(${p}C${r}=1,${S}$B$24,${S}$B$23))`);
 formula('Cash Flow Forecast',`H${r}`,`IF(COUNT(${p}H${r}:I${r})<2,"n.b.",SUM(${p}H${r}:I${r}))`);
 formula('Cash Flow Forecast',`I${r}`,`IF(COUNT(${p}E${r}:F${r})<2,"n.b.",SUM(${p}E${r}:F${r}))`);
 for(const [cl,src] of [['J','G'],['K','D'],['L','J']])formula('Cash Flow Forecast',`${cl}${r}`,`IF(NOT(ISNUMBER(${p}${src}${r})),"n.b.",${p}${src}${r})`);
 formula('Cash Flow Forecast',`M${r}`,`IF(COUNT(D${r}:L${r})<9,"n.b.",D${r}+E${r}-SUM(F${r}:J${r})+K${r}-L${r})`);
 formula('Cash Flow Forecast',`N${r}`,`IF(ISNUMBER(M${r}),MAX(0,${S}$B$25-M${r}),"n.b.")`);
}
sheets['Cash Flow Forecast'].getRange('A6:A41').setNumberFormat('mmm yyyy');sheets['Cash Flow Forecast'].getRange('D6:N41').setNumberFormat(money);sheets['Cash Flow Forecast'].getRange('N6:N41').conditionalFormats.add('cellIs',{operator:'greaterThan',formula:0,format:{fill:'#663B33',font:{color:c.amber}}});
pairs('Cash Flow Forecast',[['Cash na 12 maanden','=M17'],['Cash na 24 maanden','=M29'],['Cash na 36 maanden','=M41']],45);
note('Cash Flow Forecast',50,'Vergelijk scenario’s met de centrale selector in Instellingen. Alle 12-, 24- en 36-maandsuitkomsten en de grafiek rekenen live opnieuw. Geen fictieve kansen of statische scenario-uitkomsten.');

title('Data Quality & Reconciliation','Datakwaliteit en afstemming','Controleblad. Geen groen resultaat zonder bevestigde brondekking en onafhankelijke bankstanden.');
table('Data Quality & Reconciliation','Reconciliation',['Rekening-ID','Naam','Openingssaldo','Openingsdatum','Eindsaldo','Einddatum','Mutaties','Verwacht saldo','Verschil','Dekking','Controle'],Array.from({length:12},()=>Array(11).fill(null)));
for(let r=6;r<=17;r++){
 const a=r+52;
 for(const [cl,src] of [['A','A'],['B','B'],['C','G'],['D','H'],['E','E'],['F','F'],['J','I']])formula('Data Quality & Reconciliation',`${cl}${r}`,['A','B'].includes(src)?`IF(${S}${src}${a}="","",${S}${src}${a})`:`IF(ISNUMBER(${S}${src}${a}),${S}${src}${a},"")`);
 formula('Data Quality & Reconciliation',`G${r}`,`IF(OR(A${r}="",NOT(ISNUMBER(D${r})),NOT(ISNUMBER(F${r}))),"n.b.",SUMIFS(Transactions[amount],Transactions[include_in_totals],1,Transactions[account_id],A${r},Transactions[booking_date],">"&D${r},Transactions[booking_date],"<="&F${r},Transactions[duplicate_status],""))`);
 formula('Data Quality & Reconciliation',`H${r}`,`IF(COUNT(C${r},G${r})<2,"n.b.",C${r}+G${r})`);
 formula('Data Quality & Reconciliation',`I${r}`,`IF(COUNT(E${r},H${r})<2,"n.b.",H${r}-E${r})`);
 formula('Data Quality & Reconciliation',`K${r}`,`IF(A${r}="","",IF(OR(J${r}<>1,NOT(ISNUMBER(I${r}))),"Onvolledig",IF(ABS(I${r})>0.01,"Verschil","Afgestemd")))`);
}
sheets['Data Quality & Reconciliation'].getRange('I6:I17').setNumberFormat('0.00');
note('Data Quality & Reconciliation',20,'Openingssaldo = geboekt saldo aan het einde van openingsdatum. Mutaties tellen vanaf de volgende dag t/m einddatum. Valuta per rekening moet gelijk zijn.');
pairs('Data Quality & Reconciliation',[
 ['Onbekende classificatie','=COUNTIFS(Transactions[classification],"unknown")'],['Dubbele importregels','=COUNTIFS(Transactions[duplicate_status],"duplicate")'],['Conflicterende importregels','=COUNTIFS(Transactions[duplicate_status],"conflict")'],
 ['Reserve versus banksaldo',`=IF(COUNT('Net Worth'!E6,'Net Worth'!E14)<2,"n.b.",'Net Worth'!E6-'Net Worth'!E14)`],
 ['Doelinleg versus maandbudget',`=IF(NOT(ISNUMBER(${S}$B$28)),"n.b.",${S}$B$28-SUM('Financial Goals'!G6:G10))`],
 ],23);
note('Data Quality & Reconciliation',30,'Audit: omzet = uitgereikte facturen excl. btw; kosten = geboekte niet-geactiveerde kosten; vrije cash = bank − schulden − leveranciers − belasting − unieke reserves.');
note('Data Quality & Reconciliation',32,'Banktransacties worden niet opnieuw bij facturen of kosten opgeteld. Privéonttrekkingen en interne transfers zijn geen omzet of consumptie.');

title('Financial Insights','Financiële signalen','Signalen volgen uit brondata en instellingen. Ontbrekende gegevens blijven zichtbaar.');
table('Financial Insights','Insights',['Signaal','Status / waarde','Vervolg'],[
 ['Cash onder nul',null,'Verplichtingen en reserves controleren'],['Belastingpot tekort',null,'Verschil reserveren'],['Toename zakelijke kosten',null,'Vergelijk deze en vorige maand'],['Grote externe transacties',null,'Filter Bank Transactions op bedrag'],['Mogelijk dubbele abonnementen',null,'Controleer contracten en overlap'],['Onbekende transacties',null,'Classificatie invullen'],['Spaardoelen overgealloceerd',null,'Dezelfde euro slechts één keer reserveren'],['Komende vaste lasten 30 dagen',null,'Controleer betaaldata'],['Daling winst',null,'Bekijk omzet en kosten vorige maand'],['Bankdata verouderd',null,'Synchroniseer de bank in Studio'],
 ]);
formula('Financial Insights','B6',`IF(ISNUMBER('Net Worth'!E15),IF('Net Worth'!E15<0,"Tekort","Geen tekort"),"Gegevens ontbreken")`);
formula('Financial Insights','B7',"'Dutch Taxes'!E19");
formula('Financial Insights','B8',`IF(COUNT('Business Overview'!E9:E10)<2,"n.b.",IF('Business Overview'!E10<=0,"n.b.",'Business Overview'!E9/'Business Overview'!E10-1))`);
formula('Financial Insights','B9',`IF(${G}<>1,"n.b.",COUNTIFS(Transactions[amount],"<"&-${S}$B$31,Transactions[classification],"<>internal",Transactions[classification],"<>owner_transfer",Transactions[duplicate_status],""))`);
formula('Financial Insights','B10','=COUNTIFS(Recurring[Controle],"Controleer overlap")');
formula('Financial Insights','B11','=COUNTIFS(Transactions[classification],"unknown")');
formula('Financial Insights','B12',`IF(COUNT('Net Worth'!E6,'Net Worth'!E14)<2,"n.b.",MAX(0,'Net Worth'!E14-'Net Worth'!E6))`);
formula('Financial Insights','B13',`SUMIFS(Recurring[Bedrag],Recurring[Volgende betaling],">="&${S}$B$6,Recurring[Volgende betaling],"<="&${S}$B$6+30,Recurring[Actief],"Ja")`);
formula('Financial Insights','B14',`IF(COUNT(${monthLookup('D')},${monthLookup('D',-1)})<2,"n.b.",${monthLookup('D')}-${monthLookup('D',-1)})`);
formula('Financial Insights','B15',`IF(COUNT(Accounts[last_sync])=0,"Geen synchronisatiedatum",IF(MIN(Accounts[last_sync])<${S}$B$6-${S}$B$33,"Verouderd","Recent"))`);
sheets['Financial Insights'].getRange('B8').setNumberFormat('0.0%');sheets['Financial Insights'].getRange('C5:C15').format.columnWidth=55;

// Hoofdscherm met tien duidelijk gescheiden KPI’s en brongebonden grafieken.
const d=sheets.Dashboard;d.freezePanes.unfreeze();d.getRange('A1:P95').format.columnWidth=13;d.getRange('A1:P95').format.fill=c.bg;
title('Dashboard','Financieel overzicht','Actuele bedragen, schattingen en planning blijven gescheiden. Start bij Instellingen en importeer de Studio-export.');
formula('Dashboard','A4',`IF(AND(${G}=1,${R}=1,${E}=1,${O}=1),"Broncontroles bevestigd — controleer synchronisatiedatum","ONVOLLEDIG — importeer gegevens en bevestig broncontroles")`);d.getRange('A4:P4').merge();d.getRange('A4').format.font.color=c.amber;
const cards=[['Banksaldi',"'Net Worth'!E6",c.cyan],['Privébank',"'Net Worth'!E7",c.cyan],['Zakelijke bank',"'Net Worth'!E8",c.purple],['Overige schulden',"'Net Worth'!E10",c.red],['Klantfacturen open',"'Net Worth'!E11",c.blue],['Leveranciers open',"'Net Worth'!E12",c.amber],['Belastingraming',"'Net Worth'!E13",c.amber],['Vrij besteedbaar',"'Net Worth'!E15",c.green],['Nettovermogen',"'Net Worth'!E16",c.gold],['Cashflow 3m gemiddeld',`IF(COUNT(${monthLookup('F',-1)},${monthLookup('F',-2)},${monthLookup('F',-3)})<3,"n.b.",AVERAGE(${monthLookup('F',-1)},${monthLookup('F',-2)},${monthLookup('F',-3)}))`,c.green]];
cards.forEach(([label,f,color],i)=>{const r=6+Math.floor(i/5)*5,k=(i%5)*3;const area=`${col(k)}${r}:${col(k+2)}${r+3}`;d.getRange(area).format.fill=c.panel;d.getRange(`${col(k)}${r}:${col(k+2)}${r}`).merge();value('Dashboard',`${col(k)}${r}`,label);d.getRange(`${col(k)}${r}`).format.font.color=c.muted;d.getRange(`${col(k)}${r+1}:${col(k+2)}${r+3}`).merge();formula('Dashboard',`${col(k)}${r+1}`,f);d.getRange(`${col(k)}${r+1}`).format.font={size:23,bold:true,color};d.getRange(`${col(k)}${r+1}`).setNumberFormat(money);});
value('Dashboard','A17','Zakelijk');value('Dashboard','F17','Privé');value('Dashboard','K17','Bus en vrijheid');
for(const [cell,label,target] of [['A18','Omzet maand',"'Business Overview'!E6"],['A20','Winst maand',"'Business Overview'!E11"],['F18','Uitgaven maand',"'Private Overview'!E6"],['F20','Runway maanden',"'Private Overview'!E11"],['K18','Bus nog nodig',"'Van Purchase'!E19"],['K20','Extra werkdagen',"'Van Purchase'!E20"]]){value('Dashboard',cell,label);const r=+cell.slice(1)+1;formula('Dashboard',cell[0]+r,target);d.getRange(cell[0]+r).setNumberFormat(label.includes('maanden')||label.includes('werkdagen')?'0.0':money);d.getRange(cell[0]+r).format.font.color=c.green;}
// Grafiekbronnen bevatten bewust lege waarden wanneer historie ontbreekt.
const chartHeaders=['Maand','Vermogen','Omzet','Zakelijk','Privé','Cashflow','Winst','Spaarsaldo','Forecast'];
d.getRange('R5:Z5').values=[chartHeaders];
for(let i=0;i<12;i++){let r=6+i,m=6+i;formula('Dashboard',`R${r}`,`'Monthly Reports'!O${m}`);for(const [cl,src] of [['S','J'],['T','B'],['U','C'],['V','E'],['W','F'],['X','D'],['Y','S']])formula('Dashboard',`${cl}${r}`,`IF(ISNUMBER('Monthly Reports'!${src}${m}),'Monthly Reports'!${src}${m},"")`);formula('Dashboard',`Z${r}`,`IF(ISNUMBER('Cash Flow Forecast'!M${m}),'Cash Flow Forecast'!M${m},"")`);}
const chartRanges=[['line',['R','S'],'Nettovermogen','A24','H38'],['bar',['R','T','U'],'Omzet en zakelijke kosten','I24','P38'],['bar',['R','U','V'],'Zakelijke en privé-uitgaven','A40','H54'],['line',['R','W'],'Netto cashflow','I40','P54'],['line',['R','X'],'Operationele winst','A56','H70'],['line',['R','Y'],'Opbouw privé cashsparen','I56','P70']];
for(const [type,cols,t,from,to] of chartRanges){const ch=d.charts.add(type,cols.map(x=>d.getRange(`${x}5:${x}17`)));ch.title=t;ch.setPosition(from,to);ch.yAxis={numberFormatCode:'€#,##0',numberFormatSourceLinked:false};ch.series.items.forEach((s,i)=>{s.fill=[c.blue,c.purple,c.cyan][i];if(type==='line')s.line={fill:c.blue,width:2,style:'solid'};});}
d.getRange('R20:T25').values=[['Doel','Gespaard','Nog nodig'],...Array.from({length:5},()=>[null,null,null])];
for(let i=0;i<5;i++){for(const [cl,src] of [['R','A'],['S','C'],['T','E']])formula('Dashboard',`${cl}${21+i}`,`IF('Financial Goals'!${src}${6+i}="","",'Financial Goals'!${src}${6+i})`);}
chart('Dashboard','bar','R20:T25','Spaardoelen','A72','H86');
d.getRange('R29:S41').values=[['Maand','Eindcash'],...Array.from({length:12},()=>[null,null])];for(let i=0;i<12;i++){formula('Dashboard',`R${30+i}`,`TEXT('Cash Flow Forecast'!A${6+i},"mmm yy")`);formula('Dashboard',`S${30+i}`,`IF(ISNUMBER('Cash Flow Forecast'!M${6+i}),'Cash Flow Forecast'!M${6+i},"")`);}
chart('Dashboard','line','R29:S41','Cashprognose 12 maanden','I72','P86');
note('Dashboard',88,'Grafieken tonen pas een lijn of balk wanneer de benodigde werkelijke gegevens of planningsinvoer beschikbaar zijn.');

for(const name of names){if(name!=='Dashboard'){formula(name,'N2',`CHOOSE(${S}$B$8,"Conservatief","Basis","Optimistisch")`);sheets[name].getRange('N2:P2').merge();sheets[name].getRange('N2').format.font.color=c.green;}sheets[name].tabColor=name==='Dashboard'?c.blue:name.includes('Private')?c.cyan:name.includes('Business')?c.purple:name.includes('Van')?c.blue:c.panel;}
// Instructies op het controlepaneel, zonder API-tokens of cloud-afhankelijkheid.
note('Settings & Assumptions',82,'Bewaar de werkmap lokaal. Na import werken berekeningen en grafieken offline. Gebruik Excel 365 voor de volledige tabellen-, validatie- en grafiekfunctionaliteit.');
note('Settings & Assumptions',84,'Bewaar iedere export-ZIP als origineel bewijs. Exportdate en bank last_sync zijn verschillend. De import geeft geen bewijs van volledige bankhistorie.');
wb.recalculate();
const check=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:30},summary:'Formula errors'});
await fs.writeFile(out+'formula-check.ndjson',check.ndjson);
console.log(check.ndjson.slice(0,3500));
await (await SpreadsheetFile.exportXlsx(wb)).save(out+'Financieel-dashboard.xlsx');
for(const name of names){try{const preview=await wb.render({sheetName:name,range:name==='Dashboard'?'A1:P22':'A1:L18',scale:1});await fs.writeFile(out+name.replaceAll(' ','-')+'.png',new Uint8Array(await preview.arrayBuffer()));}catch(e){console.log('Render',name,e.message);}}
console.log('Saved',out+'Financieel-dashboard.xlsx');
