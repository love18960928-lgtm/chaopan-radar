import unittest
from unittest.mock import patch
import collector as c

class RefreshCoverage(unittest.TestCase):
    day='2026-11-27'; prior='2026-11-26'
    def counts(self, listed=1091, otc=880, new_l=700, new_o=450):
        return {('上市',self.prior):set(range(listed)),('上櫃',self.prior):set(range(otc)),('上市',self.day):set(range(new_l)),('上櫃',self.day):set(range(new_o))}
    def test_partial_above_floor_retried(self):
        self.assertEqual(c.markets_needing_refresh(self.counts(),self.day),['上市','上櫃'])
    def test_round_up(self):
        k=self.counts(); self.assertEqual(c.market_refresh_threshold(k,self.day,'上市'),982)
        self.assertEqual(c.market_refresh_threshold(k,self.day,'上櫃'),792)
    def test_exact_threshold(self):
        self.assertEqual(c.markets_needing_refresh(self.counts(new_l=982,new_o=792),self.day),[])
    def test_below_by_one(self):
        self.assertEqual(c.markets_needing_refresh(self.counts(new_l=981,new_o=791),self.day),['上市','上櫃'])
    def test_no_prior_floor(self):
        self.assertEqual(c.market_refresh_threshold({},self.day,'上市'),700)
    def test_future_not_used(self):
        k=self.counts();k['上市','2026-11-30']=set(range(2000));self.assertEqual(c.market_refresh_threshold(k,self.day,'上市'),982)
    def test_latest_prior_not_max(self):
        k=self.counts();k['上市','2026-11-25']=set(range(2000));self.assertEqual(c.market_refresh_threshold(k,self.day,'上市'),982)
    def test_previous_partial_floor(self):
        self.assertEqual(c.market_refresh_threshold(self.counts(listed=200),self.day,'上市'),700)
    def test_twse_partial_uses_fallback(self):
        with patch.object(c,'get_json',return_value={}),patch.object(c,'parse_twse_rwd',return_value=dict.fromkeys(range(800))),patch.object(c,'parse_latest_twse',return_value=dict.fromkeys(range(1091))) as f:
            self.assertEqual(len(c.fetch_market(self.day,'上市',True,982)),1091); f.assert_called_once()
    def test_tpex_partial_tries_other_official_route(self):
        with patch.object(c,'get_json',return_value={}),patch.object(c,'parse_otc_modern',return_value=dict.fromkeys(range(600))),patch.object(c,'parse_otc_historical',return_value=dict.fromkeys(range(880))) as f:
            self.assertEqual(len(c.fetch_market(self.day,'上櫃',True,792)),880); f.assert_called_once()
    def test_historical_no_latest(self):
        with patch.object(c,'get_json',return_value={}),patch.object(c,'parse_twse_rwd',return_value=dict.fromkeys(range(800))),patch.object(c,'parse_latest_twse') as f:
            self.assertEqual(len(c.fetch_market(self.day,'上市',False,982)),800); f.assert_not_called()
    def test_good_first_route_no_fallback(self):
        with patch.object(c,'get_json',return_value={}),patch.object(c,'parse_twse_rwd',return_value=dict.fromkeys(range(982))),patch.object(c,'parse_latest_twse') as f:
            self.assertEqual(len(c.fetch_market(self.day,'上市',True,982)),982); f.assert_not_called()
