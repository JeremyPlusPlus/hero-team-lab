"""Audit separate deployed-team captures against active inferred milestone bases.

Only writes evidence artifacts under source/milestone-review. It never normalizes
new bases, modifies data.js, or counts these repeated hero captures as new heroes.
"""
import csv
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent


def capture_image_digest(capture, archived):
    """Check the image when available, or reuse its recorded archival digest."""
    original = PROJECT / capture['sourceImage']
    recorded = capture.get('imageSha256')
    available = archived if archived.is_file() else original
    if available.is_file():
        content = available.read_bytes()
        if original.is_file() and original.resolve() != available.resolve():
            assert original.read_bytes() == content, f'Capture differs from archive: {archived.name}'
        digest = hashlib.sha256(content).hexdigest()
        assert recorded is None or recorded == digest, f'Capture hash changed: {archived.name}'
        if available != archived:
            archived.parent.mkdir(exist_ok=True, parents=True)
            shutil.copyfile(available, archived)
        return digest
    if recorded and re.fullmatch(r'[0-9a-f]{64}', recorded):
        return recorded
    raise ValueError(f'Provide the capture or its archived SHA-256: {archived.name}')


def rounded_signed(value):
    return (-1 if value < 0 else 1) * math.floor(abs(value) + .5)


def build_capture_review():
    active_text = (PROJECT / 'data.js').read_text(encoding='utf-8')
    active = json.loads(active_text.split('window.HERO_DATA = ', 1)[1].rstrip().removesuffix(';'))
    heroes = {h['id']: h for h in active['heroes']}
    captures = []
    for source in sorted(ROOT.glob('calibration-capture-*.json')):
        capture = json.loads(source.read_text(encoding='utf-8'))
        archived = (PROJECT / capture['archivedImage']).resolve()
        assert archived.is_relative_to(ROOT.resolve()), 'Evidence archive must remain in milestone-review'
        image_digest = capture_image_digest(capture, archived)
        context = capture['context']
        count = context['grandMasterCount']
        bonus = context['grandMasterBonusPercent'] / 100
        baseline = context['accountMilestoneScale']
        compounded = baseline * (1 + bonus) ** count
        additive = baseline * (1 + bonus * count)
        extra_synergy = math.prod(1 + n / 100 for n in context['globalSynergyOnlyBonusesPercent'])
        scales = {'compoundedGrandMasters': compounded, 'additiveGrandMasters': additive,
                  'compoundedPlusSynergyOnlyBonuses': compounded * extra_synergy}
        bases = {m['level']: m for m in heroes[capture['heroId']]['milestones']}
        records = []
        low, high = 0, math.inf
        levels = set()
        for observed in capture['milestones']:
            assert observed['level'] not in levels, 'Duplicate capture level'
            levels.add(observed['level'])
            base = bases[observed['level']]
            assert observed['signedValue'] == (-1 if observed['type'] == 'Skill Cooldown' else 1) * observed['displayedValue']
            bounds = [(observed['displayedValue'] - .5) / abs(base['value']),
                      (observed['displayedValue'] + .5) / abs(base['value'])]
            low, high = max(low, bounds[0]), min(high, bounds[1])
            predictions = {}
            for model, scale in scales.items():
                raw = base['value'] * scale
                signed = rounded_signed(raw)
                predictions[model] = {'scale': scale, 'rawSignedValue': raw,
                                      'displayedSignedValue': signed, 'matches': signed == observed['signedValue']}
            records.append({'level': observed['level'], 'observed': observed,
                            'activeInferredBase': base,
                            'fieldsMatch': all(observed[k] == base[k] for k in ('type', 'global', 'unit')),
                            'commonScaleInterval': bounds, 'predictions': predictions})
        captures.append({
            'id': capture['id'], 'heroId': capture['heroId'], 'heroName': capture['heroName'],
            'sourceCapture': source.relative_to(PROJECT).as_posix(),
            'archivedImage': capture['archivedImage'], 'imageSha256': image_digest,
            'context': context, 'comparisonBasis': 'Active screenshot-inferred bases read from data.js; no base modifications.',
            'observedMilestones': len(records), 'matchingFields': sum(r['fieldsMatch'] for r in records),
            'models': {name: {'scale': scale, 'matchingMilestones': sum(r['predictions'][name]['matches'] for r in records)}
                       for name, scale in scales.items()},
            'commonScaleInterval': [low, high] if low < high else None, 'intervalUpperExclusive': True,
            'compoundedScaleInsideInterval': low <= compounded < high,
            'tileInteractionValidated': False, 'records': records,
        })
    result = {'captureCount': len(captures), 'captures': captures,
              'note': 'Separate calibration captures do not change zero-deployment baseline context or hero coverage. Compounded stacking is inferred; tile state and interaction remain unverified.'}
    (ROOT / 'calibration-captures-review.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    with (ROOT / 'calibration-captures-comparison.csv').open('w', encoding='utf-8-sig', newline='') as out:
        writer = csv.writer(out)
        writer.writerow(['Capture', 'Hero', 'Level', 'Type', 'Scope', 'Unit', 'Active inferred base', 'Observed signed display',
                         'Compounded raw', 'Compounded display', 'Compounded matches', 'Additive display', 'Additive matches',
                         'Compounded plus synergy-only bonuses display', 'Extra synergy bonuses matches', 'Fields match'])
        for capture in captures:
            for r in capture['records']:
                o, p = r['observed'], r['predictions']
                writer.writerow([capture['id'], capture['heroName'], r['level'], o['type'], 'Global' if o['global'] else 'Personal',
                                 o['unit'], r['activeInferredBase']['value'], o['signedValue'],
                                 p['compoundedGrandMasters']['rawSignedValue'], p['compoundedGrandMasters']['displayedSignedValue'],
                                 p['compoundedGrandMasters']['matches'], p['additiveGrandMasters']['displayedSignedValue'],
                                 p['additiveGrandMasters']['matches'], p['compoundedPlusSynergyOnlyBonuses']['displayedSignedValue'],
                                 p['compoundedPlusSynergyOnlyBonuses']['matches'], r['fieldsMatch']])
    return result


if __name__ == '__main__':
    result = build_capture_review()
    for capture in result['captures']:
        print(f'{capture["id"]}: {capture["observedMilestones"]} milestones, interval {capture["commonScaleInterval"]}')
        for name, model in capture['models'].items():
            print(f'  {name}: scale {model["scale"]:.15f}, {model["matchingMilestones"]}/{capture["observedMilestones"]} matches')
