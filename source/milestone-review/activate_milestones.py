"""Apply screenshot-derived milestone bases while preserving original synergies.

Requires confirmed account context and complete screenshot rows. Every inferred
integer magnitude must round back to its screenshot. Evidence is never modified.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
review = json.loads((ROOT / 'review.json').read_text(encoding='utf-8'))
assert review['status'] == 'active-calibrated' and review['provisionalScaleConfirmed']
scale = review['confirmedAccountScale']
output = PROJECT / 'data.js'
data = json.loads(output.read_text(encoding='utf-8').split('window.HERO_DATA = ', 1)[1].strip().removesuffix(';'))
heroes = {h['id']: h for h in data['heroes']}
activated = []
missing = []
for observed in review['heroes']:
    hero = heroes.get(observed['id'])
    if hero is None:
        missing.append(observed['id'])
        continue  # Milestone screenshots do not establish a new hero's synergies.
    milestones = []
    for row in observed['milestones']:
        d = row['displayedValue']
        low, high = (d - 0.5) / scale, (d + 0.5) / scale
        candidates = [b for b in range(max(0, math.ceil(low)), math.ceil(high))
                      if math.floor(b * scale + 0.5) == d]
        assert len(candidates) == 1, (observed['name'], row['level'], candidates)
        magnitude = candidates[0]
        value = -magnitude if row['signedValue'] < 0 else magnitude
        record = {
            'level': row['level'], 'value': value,
            'type': 'Battle Pass Exp' if row['type'] == 'Battlepass Exp' else row['type'],
            'global': row['global'], 'unit': row['unit'],
            'source': observed['sourceImage'], 'displayedValue': d,
            'displayedSignedValue': row['signedValue'], 'referenceScale': scale,
            'normalization': 'inferred-integer-base',
        }
        if observed['id'] == 'captain' and row['level'] == 7500:
            record['reviewNote'] = 'Base 10 inferred under the common account scale; old sheet base 15. A stat-specific scaling exemption cannot be ruled out. This effect contributes to the user-defined Energy + Power Mages objective.'
        milestones.append(record)
    assert len(milestones) == 17 and milestones[-1]['level'] == 10000
    hero['milestones'] = milestones
    hero['observedBaseStats'] = observed['baseStats']
    hero['milestoneSource'] = 'account-screenshot'
    activated.append(hero['id'])

data['milestoneLevels'] = sorted({m['level'] for h in data['heroes'] for m in h['milestones']})
data['stats'] = sorted({e['type'] for h in data['heroes'] for k in ('milestones', 'synergies') for e in h[k]})
data['meta']['milestoneReview'] = {
    'capturedHeroes': review['capturedHeroes'], 'expectedHeroes': review['expectedHeroes'],
    'activeHeroes': len(activated), 'accountScale': scale,
    'source': 'User screenshots', 'normalizedAt': review['capturedAt'],
    'activeHeroIds': activated, 'pendingHeroIdsWithoutSynergies': missing,
    'normalizationNotes': review['normalizationNotes'],
}
output.write_text('// Spreadsheet synergies with screenshot-derived milestone bases. Rebuild via source/extract_data.py.\n'
                  + 'window.HERO_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                  + ';\n', encoding='utf-8')
print(f'Activated {len(activated)} heroes / {sum(len(heroes[i]["milestones"]) for i in activated)} milestones at account scale {scale}.')
if missing:
    print(f'Not activated: {len(missing)} heroes without source synergy data.')
