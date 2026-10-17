import type { ProjectCostCategory } from './project-costs';
export interface ProductCategoryDecision { category: ProjectCostCategory; source: 'product_rule' | 'manual_memory' | 'ai_review' | 'needs_review'; reason: string }
export function productKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const rules: Array<[ProjectCostCategory, RegExp, string]> = [
  ['materiaal', /tijdelijke toeslag transportkosten|brandstof ?toeslag|grootgoed bezorging|bezorgkosten|transportkosten/, 'Levering van bouwmateriaal'],
  ['afval', /afvalverwerking|bouw.? en sloopafval|stortkosten|residu.*brandbaar|containerafvoer|puinafvoer/, 'Afvalverwerking'],
  ['boetes', /\bcjib\b|bekeuring|verkeersboete|naheffingsaanslag/, 'Boete'],
  ['brandstof', /\bdiesel\b|\bbenzine\b|fuelsave dsl|euro ?95|euro ?98|adblue/, 'Voertuigbrandstof'],
  ['overig', /\bbounty\b|\bkoffie\b|red bull|spa reine|toiletpapier|\bstatiegeld\b(?!.*pallet)/, 'Consumptie of huishoudelijk artikel; geen bouwmateriaal'],
  ['gereedschap', /reinigings ?doekjes|bostik maatemmer|vero bezemsteel|wall charger 20w usb c|moersleutel suki/, 'Bestaande productafspraak'],
  ['gereedschap', /oordoppen.*bluetooth|gehoorbeschermer|gereedschapswagen|gereedschapskist|blaas.*zuigmachine|schroefmachine|boormachine|boorhamer|cirkelzaag|decoupeerzaag|handzaag|multitool|waterpas|rolmaat|duimstok|moersleutel|schroevendraaier|hamer|beitel|lijmklem|kitpistool|schuimpistool|accu(?:pack)?\b|acculader|bitset|borenset|zaagblad|frees(?:set)?\b/, 'Herbruikbaar gereedschap of gereedschapsonderdeel'],
  ['materiaal', /uitvulpla(?:at|ten)|wago.*(?:klem|connector)|knel.*eindkap|\bbonfix\b|dorpelset|stijlenset|boarddeur|kozijn|dakrand|keralit|eindprofiel|hoekprofiel|glaslat|schaaflat|afdeklijst|\bplint\b|\bmdf\b|\bosb\b|gipsplaat|multiplex|vuren|grenen|hardhout|acoustifit|glaswol|steenwol|isolatieplaat|pir plaat|contactdoos|installatiebuis|klembeugel.*installatie|u profiel|c profiel/, 'Product wordt in het werk verwerkt'],
  ['materiaal', /(?:snelbouw|gevel|hout|spaanplaat|gips|montage|plaatschroef).*schroef|schroef.*(?:voldraad|deeldraad|ph2|torx|t20)|\bpluggen\b|\bplug\b|\bnieten\b|\bnietjes\b|doorslijpschijf|slijpschijf|schuurschijf|schuurpapier|voegmiddel|jointfiller|pistoolschuim|dichtingsband|compressband|isolatietape|bouwfolie|afvalzak|stofmasker|ffp[123]|verfontvetter|reiniger.*klaar|siliconenkit|acrylaatkit|montagekit|montagelijm|houtlijm|high tack|ms polymeer/, 'Verbruiksmateriaal'],
];
export function classifyProduct(description: string, fallback: ProjectCostCategory = 'overig', remembered?: ProjectCostCategory, aiReviewed = false): ProductCategoryDecision {
  if (remembered) return { category: remembered, source: 'manual_memory', reason: 'Eerdere handmatige correctie voor hetzelfde product' };
  const key = productKey(description);
  for (const [category, pattern, reason] of rules) if (pattern.test(key)) return { category, source: 'product_rule', reason };
  const codeOnly = !key.split(' ').some(word => /^[a-z]{4,}$/.test(word) && !['artikel', 'artikelnummer', 'art', 'nummer', 'product', 'stuks'].includes(word));
  const reviewed = aiReviewed && !codeOnly;
  return { category: fallback, source: reviewed ? 'ai_review' : 'needs_review', reason: reviewed ? 'Afzonderlijk gecontroleerd op het brondocument' : 'Product is niet eenduidig herkenbaar' };
}
