const path=require('node:path');const fs=require('node:fs');
require('dotenv').config({path:'.env.local',quiet:true});
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const Module=require('node:module');const resolve=Module._resolveFilename;Module._resolveFilename=function(request,...args){return resolve.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,...args);};
const {supabaseAdmin:db}=require('../../src/lib/supabase-admin');
const {deriveBankUserId}=require('../../src/lib/bank-user-id');
const {buildFinanceBankLedger,loadKnabTransactionHistory,isInternalOwnAccountTransfer}=require('../../src/lib/finance-bank-ledger');
const {mapProjectCostRow}=require('../../src/lib/project-costs');const {buildKnabCostList}=require('../../src/lib/knab-cost-list');
(async()=>{
const uid='C29EkAPLJzQSQgv7nwm6Uwj6agv2';
const [history,overrides]=await Promise.all([loadKnabTransactionHistory(deriveBankUserId(uid)),db.from('bank_transaction_category_overrides').select('*').eq('user_id',uid)]);if(overrides.error)throw overrides.error;
const raw=[];for(let i=0;;i+=500){const r=await db.from('project_costs').select('*').eq('user_id',uid).order('id').range(i,i+499);if(r.error)throw r.error;raw.push(...r.data);if(r.data.length<500)break;}
const costs=raw.map(r=>({...mapProjectCostRow(r),document_type:r.document_type||null}));const categoryOverrides=new Map(overrides.data.map(r=>[r.bank_transaction_id,r.category]));
const transactions=history.transactions;const ledgerRows=buildFinanceBankLedger({userId:uid,transactions,costs,categoryOverrides});
const result=buildKnabCostList({userId:uid,transactions,costs,ledgerRows,categoryOverrides,internalTransferIds:new Set(transactions.filter(isInternalOwnAccountTransfer).map(r=>r.id))});
fs.writeFileSync(path.join(__dirname,'snapshot.json'),JSON.stringify({overrides:overrides.data,...result},null,2));
console.log(JSON.stringify(result.data.filter(r=>r.category==='overig'||r.category_allocations?.some(p=>p.category==='overig')).map(r=>({id:r.paid_bank_transaction_id,name:r.supplier_name,desc:r.description,amount:r.amount_incl_btw,split:r.category_allocations,private:r.payment_type,override:r.category_override})),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
