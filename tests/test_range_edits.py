import unittest
from scripts.video import import_cut, map_annotations

class RangeEditsTests(unittest.TestCase):
    def test_explicit_ranges_preserve_source_mapping(self):
        t=import_cut({'version':2,'retainedRanges':[{'source_start':4,'source_end':6},{'source_start':8,'source_end':9}]},10)
        self.assertEqual(t['duration'],3)
        self.assertEqual(t['words'],[])
        note={'id':'across','source_start':5,'source_end':8.5}
        self.assertEqual(map_annotations({'version':1,'notes':[note]},t)['notes'][0]['windows'],[{'start':1,'end':2},{'start':2,'end':2.5}])
    def test_invalid_ranges_and_mixed_decisions_rejected(self):
        for ranges in [[],[{'source_start':0,'source_end':float('nan')}],[{'source_start':0,'source_end':11}],[{'source_start':3,'source_end':5},{'source_start':4,'source_end':7}]]:
            with self.assertRaises(ValueError):import_cut({'version':2,'retainedRanges':ranges},10)
        with self.assertRaises(ValueError):import_cut({'version':2,'words':[],'retainedRanges':[{'source_start':1,'source_end':2}]},10)
