"""Derived *stock breadth* from same-date saved official OHLCV bars, not an index quote."""
from statistics import median

def breadth(stocks,date):
    groups={}
    for market in ('上市','上櫃'):
        rows=[s for s in stocks.values() if s.get('market')==market and len(s.get('bars',[]))>=21 and s['bars'][-1][0]==date and s['bars'][-2][0]<date]
        up=down=unchanged=above_ma20=high20=0; returns=[]
        for s in rows:
            bars=s['bars']; last=float(bars[-1][4]); before=float(bars[-2][4]); past20=[float(x[4]) for x in bars[-20:]]
            if before<=0:continue
            r=100*(last/before-1);returns.append(r)
            if r>0.0001:up+=1
            elif r<-.0001:down+=1
            else:unchanged+=1
            if last>=sum(past20)/20:above_ma20+=1
            if last>max(float(x[2]) for x in bars[-21:-1]):high20+=1
        count=len(returns)
        groups[market]={'date':date,'count':count,'up':up,'down':down,'unchanged':unchanged,
                        'advDeclRatio':round(up/max(down,1),2) if count else None,
                        'aboveMa20Pct':round(above_ma20/count*100,1) if count else None,
                        'breakoutHigh20Count':high20,'medianDailyReturnPct':round(median(returns),2) if count else None}
    return {'source':'台股個股盤後開高低收計算；非加權／櫃買指數行情','markets':groups}
