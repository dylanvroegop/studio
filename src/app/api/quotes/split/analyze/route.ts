import { NextResponse } from 'next/server';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { resolveQuoteCalculationSettings } from '@/lib/quote-pdf-data';
import { normalizeDataJson } from '@/lib/quote-calculations';
import { analyzeQuoteSplit } from '@/lib/quote-split-ai';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const schema=z.object({quoteId:z.string().min(1),calculationId:z.string(),sourceDataJson:z.unknown(),drafts:z.array(z.object({id:z.string().min(1),title:z.string().max(250)})).min(2).max(20),notes:z.array(z.object({id:z.string(),title:z.string(),notes:z.string(),maatwerkLines:z.array(z.object({id:z.string()}).passthrough())})).max(100)});
export async function POST(req:Request){
    const bearer=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!bearer)return NextResponse.json({ok:false,message:'Niet ingelogd.'},{status:401});
    const {auth,firestore}=initFirebaseAdmin();
    let uid:string;
    try{uid=(await auth.verifyIdToken(bearer)).uid;}catch{return NextResponse.json({ok:false,message:'Log opnieuw in.'},{status:401});}
    let stage='invoer controleren';
    try{
        const blocked=await ensureDemoTrialActiveByUid(uid);if(blocked)return blocked;
        const body=schema.parse(await req.json());
        stage='offerte laden';
        const quote=(await firestore.collection('quotes').doc(body.quoteId).get()).data();
        if(!quote||quote.userId!==uid)return NextResponse.json({ok:false,message:'Geen toegang tot deze offerte.'},{status:403});
        if(quote.splitInProgress)return NextResponse.json({ok:false,message:'Deze offerte wordt al gesplitst.'},{status:409});
        stage='calculatie laden en controleren';
        const {data:rows,error}=await supabaseAdmin.from('quotes_collection').select('*').eq('quoteid',body.quoteId).eq('gebruikerid',uid).order('created_at',{ascending:false}).limit(1);
        if(error)throw Error(error.message);
        const row=rows?.[0];
        if(!row||row.id!==body.calculationId||row.status!=='completed'||!isDeepStrictEqual(row.data_json,body.sourceDataJson))return NextResponse.json({ok:false,message:'De calculatie is gewijzigd of nog bezig. Open splitsen opnieuw.'},{status:409});
        const profile=(await firestore.collection('users').doc(uid).get()).data();
        const source=normalizeDataJson(row.data_json);
        stage='AI-verdeling maken en controleren';
        const proposal=await analyzeQuoteSplit({source,settings:resolveQuoteCalculationSettings(source,quote),jobs:quote.klussen||{},drafts:body.drafts,notes:body.notes,hoursPerDay:Number(profile?.settings?.planningSettings?.defaultWorkdayHours)||8});
        // Alleen een voorstel: geen offertes, calculaties, nummers, status of historie schrijven.
        return NextResponse.json({ok:true,...proposal});
    }catch(error){
        const message=error instanceof z.ZodError
            ? `Ongeldige analyse-invoer: ${error.issues.map(issue=>`${issue.path.join('.') || 'invoer'}: ${issue.message}`).join('; ')}`
            : error instanceof Error && (error.name==='TimeoutError'||error.name==='AbortError')
                ? 'De AI-aanvraag duurde langer dan 90 seconden en is afgebroken. Probeer opnieuw.'
                : error instanceof Error ? error.message : 'AI-verdeling mislukt zonder verdere foutinformatie.';
        return NextResponse.json({ok:false,message,stage},{status:error instanceof z.ZodError?400:502});
    }
}
