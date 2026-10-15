"""Forward-only diary of actual daily scanner signals; no retrospective winner picking.

The snapshot date may be unchanged across two intraday GitHub Actions runs.
Signals are inserted once per trading date; outcomes are computed only when a
subsequent valid day K has appeared in the locally saved historical series.
"""
MODEL_ROUNDTRIP_COST_PCT=2*0.1425+0.3+2*0.10  # full standard stock fees and illustrative slippage; can vary

def update_diary(existing_events, allstocks, candidates, date):
    # Saved inside storage/history.json so existing GitHub Actions commit it atomically.
    events=list(existing_events)
    seen={(e['date'],e['market'],e['code']) for e in events}
    for c in candidates:
        if not c.get('priceConfirmed') or c['date']!=date:continue
        key=(date,c['market'],c['code'])
        if key in seen:continue
        events.append({'date':date,'market':c['market'],'code':c['code'],'name':c['name'],
                       'signalClose':c['close'],'neck':c['neck'],'onePriceLimit':c.get('onePriceLimit',False),
                       'nextOpen':None,'return5Pct':None,'return10Pct':None,
                       'return20Pct':None,'netReturn5Pct':None,'netReturn10Pct':None,'netReturn20Pct':None,
                       'maxDrawdown10Pct':None,'maxDrawdown20Pct':None})
        seen.add(key)
    for e in events:
        bars=(allstocks.get(e['market']+e['code']) or {}).get('bars',[])
        indexes={r[0]:i for i,r in enumerate(bars)}
        idx=indexes.get(e['date'])
        if idx is None or idx+1>=len(bars):continue
        nextbar=bars[idx+1]
        nex=float(nextbar[1]); e['nextOpen']=nex
        # Explicitly do NOT count locked limit-up as a reliably filled next-day opening trade.
        firstday_locked=abs(float(nextbar[2])-float(nextbar[3]))<.001 and abs(float(nextbar[4])-float(nextbar[1]))<.001
        e['fillableModel']=not firstday_locked
        if not e['fillableModel'] or nex<=0:continue
        for horizon in (5,10,20):
            if idx+horizon>=len(bars):continue
            # Event date is day 0; strategy assumes next opening, never the previous close.
            end_close=float(bars[idx+horizon][4])
            e[f'return{horizon}Pct']=round(100*(end_close/nex-1),2)
            e[f'netReturn{horizon}Pct']=round(e[f'return{horizon}Pct']-MODEL_ROUNDTRIP_COST_PCT,2)
        for horizon in (10,20):
            if idx+horizon<len(bars):
                low=min(float(bars[j][3]) for j in range(idx+1,idx+horizon+1))
                e[f'maxDrawdown{horizon}Pct']=round(min(0,100*(low/nex-1)),2)
    events=events[-2500:]
    summary={'recorded':len(events),'notYetEvaluable':sum(e['nextOpen'] is None for e in events),
             'method':'僅自啟用後累積訊號；次一交易日開盤示意，不保證成交。淨報酬扣一般股常見手續費兩次0.1425%、賣出證交稅0.3%、雙向假設滑價0.1%；未含除權息及實際券商折扣。'}
    for horizon in (5,10,20):
        evaluated=[e[f'return{horizon}Pct'] for e in events if e.get(f'fillableModel') and e.get(f'return{horizon}Pct') is not None]
        summary[f'sample{horizon}']=len(evaluated)
        summary[f'winRate{horizon}']=round(100*sum(x>0 for x in evaluated)/len(evaluated),1) if len(evaluated)>=30 else None
        summary[f'avgReturn{horizon}']=round(sum(evaluated)/len(evaluated),2) if len(evaluated)>=30 else None
        nets=[e[f'netReturn{horizon}Pct'] for e in events if e.get('fillableModel') and e.get(f'netReturn{horizon}Pct') is not None]
        summary[f'avgNetReturn{horizon}']=round(sum(nets)/len(nets),2) if len(nets)>=30 else None
        summary[f'netWinRate{horizon}']=round(100*sum(x>0 for x in nets)/len(nets),1) if len(nets)>=30 else None
    summary['warning']='僅前瞻追蹤、樣本不足30不顯示統計；交易成本僅使用假設值，未處理除權息、真實撮合及下市偏差，不能視為實際勝率保證。'
    return summary,events
