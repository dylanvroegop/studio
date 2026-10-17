import json,re,uuid,collections
from pathlib import Path
D=Path(__file__).parent
s=json.loads((D/'sources.json').read_text());qs=json.loads((D/'quotes.json').read_text())
def norm(n):
 n=n.lower().replace('×','x');n=re.sub(r'(?<=\d),(?=\d)','. ',n).replace('. ','.')
 n=re.sub(r'\(artikelnr\.[^)]*\)','',n)
 n=n.replace('naturroll','naturoll').replace('m08x','m8x')
 n=re.sub(r'\b(?:voegenvuller|voegmiddel)\s*','',n)
 n=re.sub(r'\bfsc mix(?: 70%)?|\b70% pefc|\(?pefc\)?','',n)
 return re.sub(r'[^a-z0-9.]','',n)
def supplier(n):
 for pattern,label in [('bouwmaat|bouwmaten','Bouwmaat'),('gamma','GAMMA'),('toolstation','Toolstation'),('praxis','Praxis'),('xxl direct','XXL Direct')]:
  if re.search(pattern,n,re.I):return label
 return n.strip()
def taxonomy(n,cat='',sub=''):
 n=n.lower()
 rules=[
 ('Gipsplaten','Stucplaten',r'stucplaat'),('Gipsplaten','AK4',r'gipsplaat.*(?:4xak|horizonboard)'),('Gipsplaten','RK',r'gipsplaat.*\brk\b'),('Gipsplaten','AK2',r'gipsplaat.*\bak\b'),
 ('Plaatmateriaal','OSB',r'\bosb'),('Plaatmateriaal','Underlayment',r'underlayment'),('Aftimmering','Plinten',r'\bplint'),('Aftimmering','Glaslatten',r'glaslat|neuslat'),('Aftimmering','Koplatten en lijsten',r'koplat|afdeklijst|hoeklat|schaaflat'),('Plaatmateriaal','MDF',r'\bmdf'),('Plaatmateriaal','Multiplex',r'multiplex|multip\b'),
 ('Hout','Rachels',r'vuren ruw'),('Hout','Geïmpregneerd',r'(?:vuren|grenen).*ge[iï]mpregneerd'),('Gevelbekleding','Houten rabat',r'rabat'),('Hout','SLS',r'vuren sls'),('Hout','Vuren geschaafd',r'vuren.*geschaafd'),('Hout','Hardhout',r'hardhout|angelim'),('Hout','Tuinhout',r'tuinbalk'),
 ('Bevestiging','Gevelschroeven',r'keralit.*schroef|unipanel.*schroef'),('Gevelbekleding','Keralit profielen',r'keralit.*(?:profiel|hoekstuk)'),('Gevelbekleding','Keralit sponningdelen',r'keralit.*(?:sponning|spanning)deel'),('Gevelbekleding','Keralit dakranden',r'keralit.*dakrand'),('Gevelbekleding','HPL',r'\bhpl\b'),('Gevelbekleding','Unipanel',r'unipanel'),
 ('Isolatie','PIR',r'\bpir\b'),('Isolatie','Glaswol',r'glaswol|acoustifit|isover zolder iso'),('Folie en tape','Dampopen folie',r'miofol.*125g|dampopen'),('Folie en tape','Dampremmende folie',r'miofol.*125s|dampremmend|dampvariabel'),('Folie en tape','Bouwfolie',r'bouwfolie'),('Folie en tape','Aluminiumtape',r'isolatietape aluminium'),('Folie en tape','Tapes',r'tape|isolatieband'),
 ('Gipsafwerking','Voegband',r'gaasband|wapeningsband'),('Gipsafwerking','Vulmiddel en finish',r'jointfiller|fill.*finish|finishpasta|voegenvuller'),('Gipsafwerking','Voorstrijk',r'stuc.primer'),('Gipsafwerking','Hoekprofielen',r'(?:ripstaal|slimgrip).*hoekprofiel'),
 ('Lijm, kit en PUR','EPDM lijm en kit',r'epdm.*(?:lijm|kit)|(?:lijm|kit).*epdm'),('Dakbedekking','EPDM',r'epdm'),('Dakbedekking','Daktrim',r'daktrim'),('Dakbedekking','Loodvervanger',r'ubiflex|loodvervanger'),('Lijm, kit en PUR','High tack',r'high tack'),('Lijm, kit en PUR','Acrylaatkit',r'acrylaat\s?kit'),('Lijm, kit en PUR','Siliconenkit',r'siliconenkit'),('Lijm, kit en PUR','PUR',r'pu.?schuim|handschuim|perfect foam|isolatieschuim'),('Lijm, kit en PUR','Houtlijm',r'wood max|houtlijm'),('Lijm, kit en PUR','PVC lijm',r'pvc.lijm'),('Lijm, kit en PUR','Compressband',r'compressband'),('Lijm, kit en PUR','Kitafwerking',r'finisher spray'),
 ('Bevestiging','Gipsplaatschroeven',r'snelbouwschroef|gipsplaatschroef'),('Bevestiging','Schroeven',r'schroef|unischr'),('Bevestiging','Pluggen',r'plug'),('Bevestiging','Bouten',r'houtdraadbout'),('Bevestiging','Nagels en nieten',r'spijker|nagels|nieten'),('Bevestiging','Uitvulplaatjes',r'uitvulplaat'),
 ('Deuren en kozijnen','Kozijnonderdelen',r'stijlenset|dorpelset|binnendeurkozijn'),('Deuren en kozijnen','Binnendeuren',r'boarddeur|binnendeur|svedex sl1'),('Deuren en kozijnen','Buitendeuren',r'tuindeur'),('Deuren en kozijnen','Raamkozijnen',r'draaikiepraam'),('Hang- en sluitwerk','Deurdrangers',r'deurdranger'),('Hang- en sluitwerk','Sloten',r'nachtslot|profielcilinder'),('Hang- en sluitwerk','Scharnieren',r'kruisheng|paumelle'),('Hang- en sluitwerk','Grepen en knoppen',r'greep|knop juliette'),
 ('Aftimmering','Kunststof profielen',r'hoekprofiel kunststof|hoekprofiel.*wit'),('Elektra','Verlichting',r'led|inbouwspot|downlight'),('Elektra','Klemmen en dozen',r'wago|kroonstrip|lasdoos|inbouwdoos|kabeldoos|blinddeksel'),('Elektra','Buizen en bevestiging',r'installatiebuis|elektrabuis|pipelife sok'),('Elektra','Schakelmateriaal',r'berker|contactdoos'),('Elektra','Kabel en snoer',r'huishoudsnoer'),('Leidingwerk','Knelkoppelingen',r'\bknel\b'),('Leidingwerk','Koperbuis',r'buis roodkoper'),('Leidingwerk','PVC afvoer',r'(?:kap|sok) pvc'),('Leidingwerk','Slangklemmen',r'slangklem'),
 ('Bescherming en afdekken','Afdekmateriaal',r'afdekvlies|afdekzeil'),('Bescherming en afdekken','Afvalzakken',r'puinzak|afvalzak'),('Schildermateriaal','Lak',r'spuitlak'),('Schildermateriaal','Reiniger',r'verfontvetter'),('Tuin','Vlonderplanken',r'vlonderplank'),('Tuin','Poorten',r'tuinpoort'),('Glas','Enkelglas',r'enkelglas|enkel glas'),('Gereedschap','Zaagbladen en boren',r'zaagblad|cirkelblad|speedboor')]
 for c,u,p in rules:
  if re.search(p,n):return c,u
 return (cat,sub) if cat else ('Overig','')
active=[m for m in s['materials'] if m['is_active']];existing={norm(m['materiaalnaam']):m for m in active};groups={};excluded=[]
for c in s['costs']:
 for index,l in enumerate(c.get('line_items') or []):
  if not l or not l.get('description'):continue
  n=l['description'];ct,sub=taxonomy(n);q=l.get('quantity');p=l.get('unit_price');t=l.get('total_price');reason=None
  if (l.get('category') or c['category'])!='materiaal':continue
  if ct=='Overig' or ct=='Gereedschap' or re.search(r'spijkerbroek|sponningdeel 143mm wit|unipanel (?:sierlijst|bouwpaneel)|niet C24|59,19 Nerf|sanitair trijs|Acoustifit Glaswol 45mm$|Berker Contactdoos Opbouw 2-Voudig$|Eindprofiel Kunststof Classic Nerf Monumentengroen|uitw.rechthoekprofiel keralit',n,re.I):reason='Geen eenduidig bouwmateriaal'
  if re.search(r'toeslag|bezorg|verzend|transport|retour|credit|statiegeld|korting|factuur|algemene materialen|diverse materialen|papieren bon',n,re.I):reason='Toeslag, verzamelregel, korting of retour'
  if not isinstance(p,(int,float)) or not isinstance(q,(int,float)) or not isinstance(t,(int,float)) or p<=0 or q<=0 or t<=0:reason='Geen positieve expliciete stuksprijs'
  elif abs(p*q-t)>max(.03,q*.011):reason='Aantal x prijs wijkt af van regeltotaal (korting/eenheid controleren)'
  if not re.search(r'\d',n):reason='Specificatie of verpakkingsinhoud ontbreekt'
  if re.search(r'op maat|blank enkel|helder glas|\bP72\b|0,14 - 4mm|slagplugs|slagpluggen|tbv DCN692|kabel|woordzondermatch',n,re.I):reason='Maatwerk of verkoopeenheid controleren'
  if re.search(r'\d+x\d+.*\d+x\d+',n,re.I) and 'keralit dakrand' in n.lower():reason='Tegenstrijdige maten op factuurregel'
  unit={'st':'stuk','stuks':'stuk','stuk':'stuk','doos':'doos','m2':'p/m2','m²':'p/m2','m':'p/m1','m1':'p/m1'}.get(str(l.get('unit','')).lower())
  if not unit:reason='Verkoopeenheid onbekend'
  if reason:excluded.append({'name':n,'reason':reason,'cost_id':c['id']});continue
  aliases={
 'vuren geschaafd c24 44x69x3000mm fsc mix 70%',
 'vuren geschaafd geïmpregneerd 28x70x4500mm',
 'iko enertherm isolatie alu pir 100mm rd4,5 1200x600mm 0,72m2',
 'knauf gipsplaat a rk 360x60cm 9,5mm',
 'isover zolder isolatie 500x60x16cm','isover zolder iso 500x60x16cm',
 'spax universele schroef verzinkt vk 5x80mm t20 100st',
 }
  if n.lower() in aliases:
   excluded.append({'name':n,'reason':'Variant bestaat al met uitgebreidere of andere schrijfwijze','cost_id':c['id']});continue
  key=supplier(c['supplier_name'])+'|'+norm(n)
  e={'cost_id':c['id'],'invoice_number':c.get('supplier_invoice_number') or c.get('supplier_order_number'),'date':c.get('invoice_date') or c['date'],'supplier':c['supplier_name'],'description':n,'quantity':q,'unit_price_excl':p,'total_excl':t,'unit':l['unit'],'line_index':index,'quote_id':l.get('offerte_id') or c.get('offerte_id')}
  groups.setdefault(key,{'name':n,'category':ct,'sub':sub,'supplier':supplier(c['supplier_name']),'unit':unit,'evidence':[]})['evidence'].append(e)
updates=[];inserts=[]
for m in active:
 if m.get('leverancier') and re.search('bouwmaat|toolstation',m['leverancier'],re.I):updates.append({'row_id':m['row_id'],'leverancier':supplier(m['leverancier'])})
 c,sub=taxonomy(m['materiaalnaam'],m.get('categorie') or '',m.get('sub_categorie') or '')
 if m.get('categorie')=='Keralit' and c=='Keralit':c,sub='Gevelbekleding','Keralit sponningdelen'
 if c!=m.get('categorie') or sub!=(m.get('sub_categorie') or ''):updates.append({'row_id':m['row_id'],'categorie':c,'sub_categorie':sub or None})
for key,g in groups.items():
 evidence=sorted(g['evidence'],key=lambda e:e['date'],reverse=True);latest=evidence[0];m=existing.get(norm(g['name']))
 # Only attach a price source to existing rows when price and unit agree; don't replace existing prices.
 meta={'source':'purchase_invoice_research','price_date':latest['date'],'price_status':'historical_invoice','unit_price_excl':latest['unit_price_excl'],'source_unit':latest['unit'],'purchase_count':len(set((e['date'],e['invoice_number'] or e['cost_id']) for e in evidence)),'evidence':evidence,'researched_at':'2026-10-12'}
 if m:
  if abs(float(m.get('prijs_excl_btw') or -1)-latest['unit_price_excl'])<.011 and m['eenheid']==g['unit']:
   updates.append({'row_id':m['row_id'],'ai_extra_data':{**(m.get('ai_extra_data') or {}),'purchase_research':meta}})
  continue
 # Keep source selling unit. Packed screws explicitly get a packaging label, without dividing the price.
 unit=g['unit']
 if unit=='stuk' and re.search(r'(?:[2-9]|[1-9]\d+)\s*(?:st|stuk|stuks)\b',g['name'],re.I):unit='verpakking'
 inserts.append({'row_id':str(uuid.uuid5(uuid.NAMESPACE_URL,'studio-material-20261012/'+key)),'gebruikerid':'C29EkAPLJzQSQgv7nwm6Uwj6agv2','materiaalnaam':g['name'],'categorie':g['category'],'sub_categorie':g['sub'],'eenheid':unit,'leverancier':g['supplier'],'prijs_excl_btw':str(latest['unit_price_excl']),'prijs_incl_btw':None,'is_active':True,'verified':False,'ai_extra_data':{'purchase_research':meta}})
jobtypes=collections.Counter(); descriptions=[]
for q in qs:
 for j in (q.get('klussen') or {}).values():
  if not isinstance(j,dict):continue
  jobtypes[j.get('materialen',{}).get('jobKey') or j.get('type') or 'onbekend']+=1
  for k,v in j.items():
   if ('beschrijving' in k or 'omschrijving' in k) and v:descriptions.append(str(v)[:1000])
plan={'inserts':inserts,'updates':updates,'excluded':excluded,'job_types':jobtypes,'work_descriptions':descriptions[:30]}
(D/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2));print(json.dumps({'new':len(inserts),'updates':len(updates),'excluded':len(excluded),'categories':collections.Counter(m['categorie'] for m in inserts),'job_types':jobtypes},ensure_ascii=False,indent=2))
for i,m in enumerate(inserts):print(i,m['categorie'],m['sub_categorie'],m['prijs_excl_btw'],m['eenheid'],m['materiaalnaam'])
