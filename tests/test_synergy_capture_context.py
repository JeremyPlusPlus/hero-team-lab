"""Regression checks for historical and event screenshot calibration."""
import copy
import json
import math
import sys
import unittest
from pathlib import Path

REVIEW = Path(__file__).resolve().parents[1] / 'source' / 'synergy-review'
sys.path.insert(0, str(REVIEW))
from apply_verified import capture_factors, infer_base, observation_conflicts


def read(name):
    return json.loads((REVIEW / name).read_text(encoding='utf-8'))


class CaptureContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calibration = read('calibration.json')
        cls.historical = read('batch-10.json')['meta']['context']
        cls.hunter = read('batch-12.json')

    def factors(self, owner, tier, context=None):
        return capture_factors(self.hunter['meta']['context'] if context is None else context,
                               self.calibration, owner, tier)

    def test_historical_calibration_keeps_nine_gm_and_crusader_fifteen(self):
        rogue = self.factors('rogue', 8, self.historical)
        crusader = self.factors('crusader', 9, self.historical)
        self.assertEqual(rogue['grandMasterCount'], 9)
        self.assertEqual(rogue['eventFactor'], 1)
        self.assertAlmostEqual(rogue['combinedFactor'], 3.412023994742347)
        self.assertAlmostEqual(crusader['ownerFactor'], 1.15)
        self.assertEqual(math.floor(crusader['combinedFactor'] * 200 + .5), 628)

    def test_new_gold_screenshots_use_ten_gm_and_one_event_factor(self):
        expected = [('rogue', 8, 800, 3303), ('hunter', 7, 2000, 14615),
                    ('paladin', 8, 3000, 12386), ('crusader', 9, 200, 826)]
        for owner, tier, base, display in expected:
            with self.subTest(owner=owner, tier=tier):
                factors = self.factors(owner, tier)
                self.assertEqual(factors['grandMasterCount'], 10)
                self.assertEqual(factors['eventFactor'], 1.1)
                self.assertEqual(math.floor(base * factors['combinedFactor'] + .5), display)
        self.assertAlmostEqual(self.factors('crusader', 9)['ownerFactor'], 1.25)

    def test_event_can_be_disabled_without_changing_permanent_context(self):
        disabled = copy.deepcopy(self.hunter['meta']['context'])
        disabled['synergyEvent']['enabled'] = False
        baseline = self.factors('hunter', 7, disabled)
        active = self.factors('hunter', 7)
        self.assertAlmostEqual(active['combinedFactor'], baseline['combinedFactor'] * 1.1)
        for field in ('grandMasterFactor', 'ownerFactor', 'globalFactor', 'tierFactor'):
            self.assertEqual(active[field], baseline[field])

    def test_tier_and_map_modifiers_belong_to_each_capture(self):
        alternate = copy.deepcopy(self.hunter['meta']['context'])
        alternate['otherSynergyModifiers']['tier1And2BonusesPercent'] = [50]
        alternate['map']['tier5And6SynergyBonusPercent'] = 50
        self.assertEqual(self.factors('hunter', 1, alternate)['tierFactor'], 1.5)
        self.assertEqual(self.factors('hunter', 6, alternate)['tierFactor'], 1.5)
        alternate['map']['enabled'] = False
        self.assertEqual(self.factors('hunter', 6, alternate)['tierFactor'], 1)
        self.assertEqual(self.factors('hunter', 7, alternate)['tierFactor'], 1)

    def test_event_capture_infers_new_bases_and_rejects_wrong_value(self):
        for override in read('hunter-event-proposed-overrides.json')['overrides']:
            if 'inferredBaseValue' not in override:
                continue
            group = next(g for g in self.hunter['groups'] if g['id'] == override['evidence']['groupId'])
            effect = next(e for e in group['effects'] if e['ownerId'] == override['ownerId'])
            with self.subTest(owner=override['ownerId'], index=override['index']):
                result = infer_base(override, effect, self.hunter, self.calibration)
                self.assertEqual(result['predictedDisplayedValue'], effect['displayedValue'])
                self.assertEqual(result['eventFactor'], 1.1)
                invalid = {**override, 'inferredBaseValue': override['inferredBaseValue'] + 1}
                with self.assertRaises(ValueError):
                    infer_base(invalid, effect, self.hunter, self.calibration)

    def test_overlap_comparison_removes_boosts_but_keeps_real_conflicts(self):
        old_factor = self.factors('rogue', 8, self.historical)['combinedFactor']
        new_factor = self.factors('rogue', 8)['combinedFactor']
        old = {'displayedValue': 2730, 'signedValue': 2730, 'type': 'Boss Gold', 'global': True, 'unit': 'percent'}
        new = {**old, 'displayedValue': 3303, 'signedValue': 3303}
        self.assertEqual(observation_conflicts(old, old_factor, new, new_factor), [])
        changed_base = {**new, 'displayedValue': 3307, 'signedValue': 3307}
        self.assertEqual(observation_conflicts(old, old_factor, changed_base, new_factor), ['normalizedMagnitude'])
        changed_scope = {**new, 'global': False}
        self.assertEqual(observation_conflicts(old, old_factor, changed_scope, new_factor), ['global'])
        changed_sign = {**new, 'signedValue': -3303}
        self.assertEqual(observation_conflicts(old, old_factor, changed_sign, new_factor), ['sign'])

    def test_malformed_context_and_synergy_tile_cannot_infer_base(self):
        for field, value in [('grandMasterCount', True), ('synergyEvent', True),
                             ('ownerTiles', {'hunter': 'synergy'})]:
            context = copy.deepcopy(self.hunter['meta']['context'])
            context[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.factors('hunter', 7, context)


if __name__ == '__main__':
    unittest.main()
