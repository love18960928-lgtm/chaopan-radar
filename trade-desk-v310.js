/* 超盤手 V3.1.0 | 盤後起漲／飆股作戰室。觀察工具，非即時成交或獲利模型。 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanDeskV310=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const round=v=>Math.round(v*10)/10;
const mean=a=>a.length?a.reduce((p,q)=>p+q,0)/a.length:null;
function tick(p){return p<10?.01:p<50?.05:p<100?.1:p<500?.5:p<1000?1:5;}
function floorTick(p){if(num(p)===null||p<=0)return null;const t=tick(p);return Math.round(Math.floor((p+1e-9)/t)*t*100)/100;}
function above(p){if(num(p)===null||p<=0)return null;let q=p+tick(p);for(let i=0;i<6;i++){let t=tick(q),n=Math.ceil((q-1e-10)/t)*t;if(n>p)return Math.round(n*100)/100;q+=t;}return null;}
function barsValid(b,date,asOf){if(!Array.isArray(b)||b.length<61||date!==asOf||b.at(-1)?.[0]!==date)return false;
 let prior='';for(const x of b){if(!Array.isArray(x)||x.length<6||typeof x[0]!=='string'||x[0]<=prior)return false;prior=x[0];
 const [o,h,l,c,v]=x.slice(1,6).map(num);if([o,h,l,c,v].some(z=>z===null)||Math.min(o,h,l,c)<=0||v<0||h<Math.max(o,c)||l>Math.min(o,c)||h<l)return false;
 }return true;}
function stageOf(row,phase,b){const kind=String(phase?.phase||'');if(['ready','first','second'].includes(kind))return kind;
 const cy=row.cycle||{},event=phase?.initialDate||cy.initialDate;
 const neck=num(phase?.level)??num(cy.level);
 // Third session must be exactly T+2 since a recorded first breakout,
 // with closes > same event level on all 3 sessions and previous close <= level.
 if(!event||neck===null||neck<=0)return null;
 const i=b.findIndex(x=>x[0]===event),last=b.length-1;
 if(i>=1&&last-i===2&&b[i-1][4]<=neck&&b.slice(i,i+3).every(x=>x[4]>neck))return 'third';
 return null;
}
function evaluate(row,ctx={}){
 const b=row.bars||[],date=String(row.date||''),asOf=String(ctx.asOf||'');
 const output={status:'資料待核對',qualified:false,priority:false,stage:null,momentumStage:null,score: {potential:null,entry:null},flags:[],trigger:null,chase:null,defense:null,riskBudget:null,knownTarget:null,rr:null,atr:null,ma5:null,ma10:null,ma20:null,date,asOf};
 if(!barsValid(b,date,asOf)){output.flags.push('至少61根有效日K、日期一致且無未來K棒才能評估');return output;}
 if(row.possiblePriceAdjustment){output.flags.push('疑似除權息或價格斷層，暫停判斷');return output;}
 const closes=b.map(x=>Number(x[4])),last=b.at(-1),prev=b.at(-2),close=last[4],prior=b.slice(-21,-1);
 const ma5=mean(closes.slice(-5)),ma10=mean(closes.slice(-10)),ma20=mean(closes.slice(-20));
 const v20=mean(prior.map(x=>x[5])),amt20=mean(prior.map(x=>x[4]*x[5]*1000));
 const tr=b.slice(-15).map((x,i)=>{const p=b[b.length-15+i-1]?.[4]??x[4];return Math.max(x[2]-x[3],Math.abs(x[2]-p),Math.abs(x[3]-p));});
 const atr=mean(tr),atrPct=atr/close*100;
 const r5=100*(close/closes.at(-6)-1),r10=100*(close/closes.at(-11)-1),r20=100*(close/closes.at(-21)-1);
 const location=last[2]>last[3]?(close-last[3])/(last[2]-last[3]):.5;
 const phase=ctx.phase||{},stage=stageOf(row,phase,b);
 const neck=num(phase.level)??num(row.intradayPlan?.neckline)??num(row.neck);
 const relevantDate=String(row.neckDate||row.structureV23?.necklineDate||'');
 const historical=Boolean(neck&&neck>0&&(relevantDate&&relevantDate<date||stage&&stage!=='ready'&&(phase.initialDate||row.cycle?.initialDate)));
 // V3.1.1: A ¥? no: all amounts here are TWD; equity volume is board lots.
 // Low-price stock must have actual turnover, rather than a flattering 300-lot screen.
 const liquid=Boolean(close<30 ? v20>=1000&&amt20>=25e6&&last[5]>=500 :
   close<200 ? v20>=500&&amt20>=20e6&&last[5]>=200 :
               v20>=80&&amt20>=30e6&&last[5]>=50);
 const breakoutVolNeed=close<30?Math.max(5000,v20*1.8):close<200?v20*1.8:v20*1.5;
 const isBreakoutDay=stage==='first'||stage==='second'||stage==='third';
 const certifiedVolume=!isBreakoutDay||last[5]>=breakoutVolNeed;
 const risky=row.riskFirst||row.riskLevel==='high';
 const candleWeak=last[4]<last[1]&&location<.35;
 const extended=r5>16||r20>35||close>ma5*1.10;
 const gap=neck?100*(close/neck-1):null;
 const mom=(r5>=5||r20>=15)&&close>ma5&&ma5>ma10&&ma10>ma20;
 const reset=mom&&(last[3]<=ma5*1.025||last[3]<=ma10*1.02)&&close>=ma5&&location>=.55&&last[4]>=prev[4];
 const momType=!mom?null:extended||risky||atrPct>8?'caution':reset?'reentry':'surge';
 const next=stage==='ready'&&historical?above(neck):historical&&(stage||momType==='reentry')?Math.max(above(neck)||0,above(last[2])||0):null;
 const candleRange=last[2]-last[3];
 const dist=stage==='ready'&&neck?Math.abs(close/neck-1):neck?Math.abs(close/neck-1):null;
 const volumeRatio=v20?last[5]/v20:0;
 const strongTrend=close>ma5&&ma5>ma10&&ma10>ma20;
 const phasePoints={ready:1,first:.88,second:.65,third:.47};
 const startScore=100*(.25*(phasePoints[stage]||0)+.23*(dist===null?0:clamp(1-dist/.065))+.20*clamp((volumeRatio-.65)/1.75)+.17*(strongTrend?1:close>ma20?.55:0)+.15*location);
 const boost=100*(.28*clamp(r5/20)+.24*clamp(r10/32)+.19*clamp(r20/55)+.12*clamp((2*r5-r10+4)/24)+.10*clamp((volumeRatio-.5)/2)+.07*location);
 const potential=round(stage?startScore:boost);
 let q=100*(.22*(stage?(phasePoints[stage]||0):reset?.75:.28)+.21*(dist===null?0:clamp(1-dist/.075))+.15*(strongTrend?1:close>ma20?.5:0)+.14*location+.14*clamp(volumeRatio/1.7)+.14*(atrPct<=5?1:clamp((9-atrPct)/4)));
 if(risky){q-=38;output.flags.push('原系統高風險／不得當成可追價');}
 else if(row.riskLevel==='medium'){q-=12;output.flags.push('原系統中度風險');}
 if(!liquid){q-=40;output.flags.push('成交活躍度不足，低價股需20日均量1000張與日均成交值2500萬元');}
 if(!certifiedVolume){q-=22;output.flags.push('突破量不足：需約'+Math.ceil(breakoutVolNeed)+'張；放量亦非保證突破');}
 if(extended){q-=25;output.flags.push('漲幅或MA5乖離過大，不宜追價');}
 if(atrPct>8){q-=15;output.flags.push('ATR波動偏大');}
 if(candleWeak){q-=14;output.flags.push('收低賣壓');}
 if(stage==='third'&&last[4]<prev[4]){q-=12;output.flags.push('第三根未續創強勢收盤');}
 if(!historical){q-=12;output.flags.push('缺少可核對的歷史頸線形成資料');}
 if(stage&&!['ready','first','second','third'].includes(stage))output.flags.push('突破階段待確認');
 if(row.disposition||row.underDisposition||row.disposal) {q-=25;output.flags.push('交易處置狀態請向證交所核對');}
 const chase=next?floorTick(next+Math.min(atr*.6,next*.018)):null;
 const defense=historical?Math.round(neck*100)/100:null;
 // A one-tick move under a neckline is not a credible loss budget. ATR-based
 // conservative invalidation is distinct from the neckline's warning level.
 const riskBudget=historical?floorTick(Math.max(.01, neck-Math.max(atr*1.1,close*.025))):null;
 const risks=next&&riskBudget?100*(next-riskBudget)/next:null;
 if(risks!==null&&risks>6){q-=15;output.flags.push('觸發價與保守風險參考距離過大');}
 const pressure=b.slice(0,-1).map(x=>x[2]).filter(x=>x>(next??Infinity));
 // A rolling average can act as nearby overhead even when there is no old swing.
 const overhead=[20,60,120,240].filter(n=>closes.length>=n).map(n=>mean(closes.slice(-n))).filter(v=>v>next);
 pressure.push(...overhead);
 const knownTarget=pressure.length?Math.min(...pressure):null;
 const rr=knownTarget!==null&&next>riskBudget?(knownTarget-next)/(next-riskBudget):null;
 if(rr!==null&&rr<2){q-=30;output.flags.push('上方已知壓力與風險距離比不足2倍');}
 if(!knownTarget&&next){q=Math.min(q,58);output.flags.push('上方沒有可確認壓力／潛在獲利空間，不能給高進場品質分');}
 if(!stage&&!mom)output.flags.push('尚未形成起漲／飆股訊號');
 const entry=round(clamp(q,0,100));
 const qualified=Boolean(liquid&&certifiedVolume&&!risky&&atrPct<=8&&(stage||mom)&&!row.possiblePriceAdjustment);
 const priority=Boolean(qualified&&historical&&next&&risks!==null&&risks<=6&&entry>=63&&knownTarget!==null&&rr!==null&&rr>=2&&!extended&&!candleWeak&&
                   (stage==='ready'||stage==='first'||stage==='second'||stage==='third'||momType==='reentry')&&
                   true);
 return {...output,qualified,priority,stage,momentumStage:momType,score:{potential,entry},flags: [...new Set(output.flags)],
         trigger:next,chase,defense,riskBudget,knownTarget,rr:rr===null?null:round(rr),atr:round(atr),atrPct:round(atrPct),
         ma5:round(ma5),ma10:round(ma10),ma20:round(ma20),r5:round(r5),r10:round(r10),r20:round(r20),
         gap:gap===null?null:round(gap),close,volumeRatio:round(volumeRatio),avg20:round(v20),breakoutVolNeed:Math.ceil(breakoutVolNeed),liquid,certifiedVolume,
         status:priority?'盤中優先觀察（非買進訊號）':qualified?'列入觀察／尚不適合追價':'暫不列入優先名單'};
}
function shortlist(entries,limit=5){return entries.filter(x=>x.plan?.priority).sort((a,b)=>
 (.60*b.plan.score.entry+.40*b.plan.score.potential)-(.60*a.plan.score.entry+.40*a.plan.score.potential)||
 String(a.row.code).localeCompare(String(b.row.code))).slice(0,limit);}
return {evaluate,shortlist,stageOf,barsValid,above,floorTick};
});
