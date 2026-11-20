"""Validate screenshot transcriptions, archive evidence, and build the review bundle.

Run with Python; no dependencies. Observations are never normalized or applied to
data.js here. Keeping them separate avoids mixing account values with sheet bases.
"""
import argparse
import collections
import csv
import json
import math
from pathlib import Path
from compare_calibration_captures import build_capture_review, capture_image_digest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--defer-capture-review', action='store_true',
                    help='Build baseline evidence before milestone activation; the extractor refreshes deployed-capture evidence afterward.')
args = parser.parse_args()

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
LEVELS = [25, 75, 150, 250, 500, 750, 1000, 1500, 2000, 2500,
          3000, 3500, 4000, 5000, 6000, 7500, 10000]
FLAT = {'Skill Power', 'Skill Duration', 'Rank Exp', 'Energy Income',
        'Battle Pass Exp', 'Battlepass Exp', 'Bp Exp'}
calibration = json.loads((ROOT / 'calibration.json').read_text(encoding='utf-8'))
scale = calibration['provisionalScale']
reference = ROOT / 'spreadsheet-reference.json'
if not reference.exists():
    data_text = (PROJECT / 'data.js').read_text(encoding='utf-8')
    original = json.loads(data_text.split('window.HERO_DATA = ', 1)[1].rstrip().removesuffix(';'))
    reference.write_text(json.dumps({
        'meta': original['meta'],
        'heroes': [{k: h[k] for k in ('id', 'name', 'milestones')} for h in original['heroes']],
    }, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
sheet = json.loads(reference.read_text(encoding='utf-8'))
sheet_heroes = {h['id']: h for h in sheet['heroes']}
aliases = {**sheet['meta'].get('statAliases', {}), 'Battlepass Exp': 'Battle Pass Exp'}
unit_corrections_path = ROOT / 'source-unit-corrections.json'
unit_corrections = {(c['heroId'], c['level']): c for c in
    json.loads(unit_corrections_path.read_text(encoding='utf-8'))['corrections']} if unit_corrections_path.exists() else {}

def canonical_type(label):
    return aliases.get(label, label)

images = ROOT / 'images'
heroes = []
seen = set()
interval = [0, math.inf]
matching_interval = [0, math.inf]
percentage_matches = 0
percentage_outliers = []

for batch in sorted(ROOT.glob('batch-*.json')):
    for source_hero in json.loads(batch.read_text(encoding='utf-8'))['heroes']:
        hero = dict(source_hero)
        assert hero['id'] not in seen, f'Duplicate hero: {hero["id"]}'
        seen.add(hero['id'])
        assert [m['level'] for m in hero['milestones']] == LEVELS, hero['name']
        archived = images / f'{hero["id"]}.png'
        image_digest = capture_image_digest(hero, archived)
        hero['sourceImage'] = archived.relative_to(PROJECT).as_posix()
        hero['originalSourceImage'] = hero['sourceImage']
        hero['imageSha256'] = image_digest
        hero['transcriptionFile'] = batch.relative_to(PROJECT).as_posix()
        existing = {m['level']: m for m in sheet_heroes.get(hero['id'], {}).get('milestones', [])}
        for m in hero['milestones']:
            assert type(m['global']) is bool
            assert m['unit'] == ('flat' if m['type'] in FLAT else 'percent'), (hero['name'], m)
            assert m['displayedValue'] >= 0 and math.isfinite(m['displayedValue'])
            sign = -1 if m['type'] == 'Skill Cooldown' else 1
            assert m['signedValue'] == sign * m['displayedValue'], (hero['name'], m)
            m['sheet'] = dict(existing[m['level']]) if m['level'] in existing else None
            correction = unit_corrections.get((hero['id'], m['level']))
            if correction and m['sheet']:
                assert m['sheet']['value'] == correction['storedValue']
                m['sheet'].update(value=correction['value'], storedValue=correction['storedValue'],
                                  unitCorrection=correction['note'])
            old = m['sheet']
            same_type = bool(old) and canonical_type(old['type']) == canonical_type(m['type'])
            m['changedFields'] = (['level'] if old is None else
                ([] if same_type else ['type']) +
                ([] if old['global'] == m['global'] else ['scope']) +
                (['value'] if same_type and math.floor(old['value'] * scale + 0.5) != m['displayedValue'] else []))
            m['comparison'] = 'new-level' if old is None else (
                'type-change' if not same_type else
                'scope-change' if old['global'] != m['global'] else
                'value-review' if math.floor(old['value'] * scale + 0.5) != m['displayedValue'] else
                'consistent')
            if same_type and m['unit'] == 'percent' and old['value'] > 0:
                bounds = [(m['displayedValue'] - 0.5) / old['value'],
                          (m['displayedValue'] + 0.5) / old['value']]
                interval[0] = max(interval[0], bounds[0])
                interval[1] = min(interval[1], bounds[1])
                percentage_matches += 1
                predicted = math.floor(old['value'] * scale + 0.5)
                if predicted == m['displayedValue']:
                    matching_interval[0] = max(matching_interval[0], bounds[0])
                    matching_interval[1] = min(matching_interval[1], bounds[1])
                else:
                    percentage_outliers.append({
                        'heroId': hero['id'], 'heroName': hero['name'], 'level': m['level'],
                        'type': m['type'], 'sheetBase': old['value'],
                        'displayedValue': m['displayedValue'], 'predictedDisplay': predicted,
                        'impliedScaleIntervalIfBaseUnchanged': bounds,
                    })
        heroes.append(hero)

counts = dict(collections.Counter(m['comparison'] for h in heroes for m in h['milestones']))
review = {
    **calibration,
    'capturedHeroes': len(heroes),
    'capturedMilestones': sum(len(h['milestones']) for h in heroes),
    'sheetHeroes': len(sheet['heroes']),
    'sheetHeroesNotCaptured': [h['name'] for h in sheet['heroes'] if h['id'] not in seen],
    'comparisonCounts': counts,
    'changedFieldCounts': dict(collections.Counter(
        field for h in heroes for m in h['milestones'] for field in m['changedFields'])),
    'valueReviewUnits': dict(collections.Counter(
        m['unit'] for h in heroes for m in h['milestones'] if 'value' in m['changedFields'])),
    'scaleAnalysis': {
        'assumption': 'Same original percentage values, common multiplier, nearest-integer display rounding',
        'comparedPercentageRows': percentage_matches,
        'possibleScaleInterval': interval if interval[0] < interval[1] else None,
        'intervalUpperExclusive': True,
        'provisionalMatchingPercentageRows': percentage_matches - len(percentage_outliers),
        'provisionalMatchingScaleInterval': matching_interval if matching_interval[0] < matching_interval[1] and math.isfinite(matching_interval[1]) else None,
        'percentageOutliers': percentage_outliers,
        'isConfirmedNormalization': calibration.get('provisionalScaleConfirmed', False),
        'note': 'Compatibility does not prove unchanged base values or identify the bonus sources. Discrepancies may be balance changes or other account effects. The interval over all comparable rows is null when no common scale fits; matching rows and exceptions are reported separately.'
    },
    'heroes': heroes,
    'additionalCalibrationEvidence': ({
        'status': 'deferred-until-milestones-active',
        'note': 'Deployed-team captures require the inferred milestone bases. Run this builder again after activation to restore their full audit.',
    } if args.defer_capture_review else build_capture_review()),
}
(ROOT / 'review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

with (ROOT / 'milestones.csv').open('w', newline='', encoding='utf-8-sig') as out:
    writer = csv.writer(out)
    writer.writerow(['Hero', 'Level', 'Displayed signed value', 'Unit', 'Stat', 'Scope',
                     'Sheet base value', 'Sheet stat', 'Sheet scope', 'Review status', 'Evidence image'])
    for h in heroes:
        for m in h['milestones']:
            old = m['sheet'] or {}
            writer.writerow([h['name'], m['level'], m['signedValue'], m['unit'], m['type'],
                             'Global' if m['global'] else 'Personal', old.get('value', ''),
                             old.get('type', ''), ('Global' if old['global'] else 'Personal') if old else '',
                             m['comparison'], h['sourceImage']])

print(f'Captured {review["capturedHeroes"]}/{review["expectedHeroes"]} heroes; {review["capturedMilestones"]} milestones.')
print(f'Review counts: {counts}')
print(f'{percentage_matches} comparable percentage rows; {len(percentage_outliers)} provisional-scale exceptions; all-row interval {review["scaleAnalysis"]["possibleScaleInterval"]}.')
print('Built review.json and milestones.csv from capture records.')
