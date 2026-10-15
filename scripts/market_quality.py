"""Market breadth from validated OHLCV history (NOT exchange index prices)."""


def breadth(stocks,asof):
    markets={}
    for market in ('上市','上櫃'):
        rows=[st['bars'] for st in stocks.values() if st.get('market')==market and
              len(st.get('bars') or [])>=2 and st['bars'][-1][0]==asof]
        up=sum(b[-1][4]>b[-2][4] for b in rows)
        down=sum(b[-1][4]<b[-2][4] for b in rows)
        flat=len(rows)-up-down
        enough=[b for b in rows if len(b)>=20]
        above=sum(b[-1][4]>=sum(x[4] for x in b[-20:])/20 for b in enough)
        breakouts=sum(b[-1][4]>max(x[2] for x in b[-21:-1]) for b in rows if len(b)>=21)
        markets[market]={'count':len(rows),'up':up,'down':down,'flat':flat,
                         'aboveMa20Count':above,
                         'aboveMa20Pct':round(100*above/len(enough),2) if enough else None,
                         'breakoutHigh20Count':breakouts}
    return {'asOf':asof,'source':'所有可取得的個股日K推算市場廣度，非官方加權或櫃買指數價格', 'markets':markets}
