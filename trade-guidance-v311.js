/* 超盤手 V3.1.1：白話買入／持有／減碼警戒。純盤後證據，不推估勝率。 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanGuidance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
function evaluate(row,plan,supports=[]){
 const bars=row?.bars||[];
 const result={level:'unknown',title:'資料尚不足',buy:'等待完整日K與有效頸線，不用猜買點。',hold:'持有者先核對價格及支撐。',sell:'賣點待資料',sellLevel:null,support:null,volume:null};
 if(bars.length<21||!plan||num(plan.trigger)===null||row?.date!==bars.at(-1)?.[0])return result;
 const last=bars.at(-1),prev=bars.at(-2),c=num(last[4]),p=num(prev[4]);if(c===null||p===null)return result;
 const lows=[];
 for(const s of supports){const low=num(s?.lower);if(low!==null&&low>0&&low<=c*1.25)lows.push(low);}
 const defenseObj=row?.structureV23?.mainDefense;
 const mainDefense=num(defenseObj?.lower??defenseObj?.price);
 if(mainDefense!==null&&mainDefense>0&&mainDefense<=c*1.25)lows.push(mainDefense);
 const support=lows.filter(x=>x<=c*1.025).sort((a,b)=>b-a)[0]??null;
 const historicallyBroken=lows.filter(x=>x>c*1.015).sort((a,b)=>a-b)[0]??null;
 const ma5=num(plan.ma5),ma10=num(plan.ma10),ma20=num(plan.ma20);
 const closingLocation=last[2]>last[3]?(c-last[3])/(last[2]-last[3]):.5;
 const prev20=bars.slice(-21,-1);const avgV=prev20.reduce((a,x)=>a+Number(x[5]),0)/prev20.length;
 const volume=num(last[5])??0;
 const heavy=volume>=1.8*avgV;
 const twoUnder20=ma20!==null&&c<ma20&&p<ma20;
 const twoUnder10=ma10!==null&&c<ma10&&p<ma10;
 const red=historicallyBroken!==null||twoUnder20&&(heavy||c<p);
 const warn=heavy&&c<last[1]&&closingLocation<.35||twoUnder10||ma5!==null&&c<ma5;
 result.volume=num(plan.breakoutVolNeed);
 result.support=support;
 result.sellLevel=support??ma10??ma20;
 const hasNeck=num(plan.defense)!==null;
 result.buy=plan.priority?`要先站穩 ${plan.trigger} 元，且當天成交量達約 ${Math.ceil(plan.breakoutVolNeed||0).toLocaleString('zh-TW')} 張；漲過 ${plan.chase} 元先不追。`:hasNeck?`未站穩 ${plan.trigger??'觀察價'} 元、量未達 ${Math.ceil(plan.breakoutVolNeed||0).toLocaleString('zh-TW')} 張就先等；不因分數高直接買。`:'找不到足夠的歷史頸線證據，暫不判定買點。';
 if(red){result.level='danger';result.title='跌破重要防守，優先檢查是否退出';result.hold='昨天收盤已出現跌破／連續轉弱，不要只等反彈。';result.sell='已持有：優先核對減碼或退出，不保證隔日能賣在原價。';}
 else if(warn){result.level='warn';result.title='走勢降溫，注意賣壓';result.hold='已持有：留意跌破支撐、反彈站不回短均線，準備檢查減碼。';result.sell='已持有：若跌破下方警戒價或再放量收低，重新評估退出。';}
 else{result.level='good';result.title='原有趨勢尚未明顯破壞';result.hold='已持有：觀察能否續守支撐，不能保證繼續上漲。';result.sell='已持有：若有效跌破支撐，優先重估續抱理由。';}
 if(result.sellLevel===null)result.sell+=' 目前沒有可靠結構支撐，不自行編造價格。';
 return result;
}
return {evaluate};
});
