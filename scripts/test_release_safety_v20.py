"""Release-only invariants (no unverified provider, unchanged EOD schedule)."""
import unittest
from unittest.mock import patch
import collector
from rules import build_snapshot
from test_rules import make_series

class V20ReleaseSafety(unittest.TestCase):
    def test_unverified_institutional_fetch_is_not_imported(self):
        self.assertFalse(hasattr(collector, 'fetch_daily'))
    def test_release_has_explicit_version(self):
        self.assertEqual(build_snapshot({'上市2492':make_series()})['rulesVersion'],'eod-v2.1-core')
    def test_incomplete_universe_not_live(self):
        self.assertNotEqual(build_snapshot({'上市2492':make_series()})['mode'],'live')

if __name__=='__main__': unittest.main()
