"""Apply screenshot-confirmed fields and explicitly authorized inferred bases.

Each override must match one frozen record and an effect in its evidence batch.
Magnitudes stay unchanged unless inferredBaseValue uniquely fits the calibrated
nearest-integer display model. Inference is not direct numeric verification.
"""
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def unique(items, label):
    if len(items) != 1:
        raise ValueError(f'{label}: expected one match, found {len(items)}')
    return items[0]


def sign(value):
    return 1 if value > 0 else -1 if value < 0 else 0


def validate_group_effects(group):
    """Preserve repeated portraits, requiring one identical effect per copy."""
    required = Counter(hero['id'] for hero in group['requiredHeroes'])
    observed = Counter(effect['ownerId'] for effect in group['effects'])
    if required != observed:
        raise ValueError(f'{group["id"]}: effect owners do not match required hero copies.')
    signatures = {}
    for effect in group['effects']:
        signature = tuple(effect[field] for field in ('type', 'global', 'unit', 'signedValue', 'displayedValue'))
        owner = effect['ownerId']
        if owner in signatures and signatures[owner] != signature:
            raise ValueError(f'{group["id"]}: repeated {owner} effects disagree.')
        signatures[owner] = signature


def find_record(data, override):
    hero = unique([h for h in data['heroes'] if h['id'] == override['ownerId']],
                  f'Owner {override["ownerId"]}')
    return unique([s for s in hero['synergies']
                   if s['index'] == override['index']
                   and s['tier'] == override['tier']
                   and sorted(s['requires']) == sorted(override['requires'])],
                  f'{override["ownerId"]} synergy {override["index"]}')


def observation_counts(batches):
    """Separate capture occurrences from identities shared across batches."""
    groups, effects = set(), set()
    observed_groups = observed_effects = 0
    for batch in batches.values():
        for group in batch['groups']:
            validate_group_effects(group)
            identity = (group['tier'], tuple(sorted(h['id'] for h in group['requiredHeroes'])))
            groups.add(identity)
            observed_groups += 1
            for effect in group['effects']:
                effects.add((*identity, effect['ownerId']))
                observed_effects += 1
    return {
        'observedEffects': observed_effects, 'observedGroups': observed_groups,
        'uniqueEffects': len(effects), 'uniqueGroups': len(groups),
        'repeatedEffects': observed_effects - len(effects),
        'repeatedGroups': observed_groups - len(groups),
        'countingNote': 'Observed counts include every screenshot occurrence, including repeated hero portraits within a group. Unique groups use tier plus the required-hero multiset; unique effects additionally use the owner. Repeated portraits and overlapping captures count once in unique effect totals.'
    }


def capture_factors(context, calibration, owner, tier, stacking_override=None):
    """Resolve one off-synergy-tile capture without changing historical defaults."""
    modifiers = context.get('otherSynergyModifiers') or {}
    map_context = context.get('map') or {}
    count = context.get('grandMasterCount')
    if count is None:
        count = calibration['grandMasterCount']
    if isinstance(count, bool) or not isinstance(count, (int, float)) or not math.isfinite(count) or count < 0 or count != int(count):
        raise ValueError('Capture Grand Master count must be a nonnegative integer.')
    stacking = stacking_override or context.get('grandMasterStacking', calibration['grandMasterStacking'])
    gm_bonus = calibration['grandMasterSynergyBonusPercent'] / 100
    if stacking not in ('multiply', 'add'):
        raise ValueError('Unsupported capture Grand Master stacking rule.')
    gm_factor = (1 + gm_bonus) ** count if stacking == 'multiply' else 1 + gm_bonus * count
    global_bonuses = modifiers.get('globalSynergyBonusesPercent', calibration['globalSynergyBonusesPercent'])
    global_factor = math.prod(1 + value / 100 for value in global_bonuses)
    owner_bonuses = modifiers.get('ownerSynergyBonusPercent', calibration['ownerSynergyBonusPercent'])
    owner_factor = 1 + owner_bonuses.get(owner, owner_bonuses['default']) / 100
    map_enabled = map_context.get('enabled', map_context.get('name') != 'None')
    if tier in (1, 2):
        tier_factor = math.prod(1 + value / 100 for value in modifiers.get('tier1And2BonusesPercent', calibration['tier1And2BonusesPercent']))
    elif tier in (3, 4):
        tier_factor = 1 + modifiers.get('tier3And4BonusPercent', calibration['tier3And4BonusPercent']) / 100
    elif tier in (5, 6):
        tier_factor = 1 + map_context.get('tier5And6SynergyBonusPercent', calibration['snowFortTier5And6BonusPercent']) / 100 if map_enabled else 1
    elif tier == 7:
        tier_factor = 1 + map_context.get('tier7SynergyBonusPercent', calibration['snowFortTier7BonusPercent']) / 100 if map_enabled else 1
    elif tier in (8, 9):
        tier_factor = 1
    else:
        raise ValueError('Unsupported synergy tier for capture calibration.')
    owner_tiles = context.get('ownerTiles')
    if isinstance(owner_tiles, dict) and owner_tiles.get(owner) not in (None, 'normal', 'milestone', 'skill'):
        raise ValueError('Capture calibration requires an off-synergy-tile owner.')
    if owner_tiles is not None and not isinstance(owner_tiles, dict):
        raise ValueError('Unsupported owner-tile capture context.')
    event = context.get('synergyEvent') or {}
    if not isinstance(event, dict):
        raise ValueError('Unsupported synergy-event capture context.')
    event_bonus = event.get('synergyBonusPercent', 10) if event.get('enabled') is True else 0
    if isinstance(event_bonus, bool) or not isinstance(event_bonus, (int, float)) or not math.isfinite(event_bonus) or event_bonus < 0:
        raise ValueError('Capture synergy-event bonus must be a finite nonnegative percent.')
    event_factor = 1 + event_bonus / 100
    factor = global_factor * owner_factor * gm_factor * tier_factor * event_factor
    if not math.isfinite(factor) or factor <= 0:
        raise ValueError('Calibration factor must be finite and positive.')
    return {
        'globalFactor': global_factor, 'ownerFactor': owner_factor,
        'grandMasterFactor': gm_factor, 'grandMasterCount': count,
        'grandMasterStacking': stacking, 'tierFactor': tier_factor,
        'eventFactor': event_factor, 'combinedFactor': factor,
    }


def observation_conflicts(left, left_factor, right, right_factor):
    """Compare fields and rounding intervals after removing capture boosts."""
    conflicts = [field for field in ('type', 'global', 'unit') if left[field] != right[field]]
    if sign(left['signedValue']) != sign(right['signedValue']):
        conflicts.append('sign')
    left_interval = [(left['displayedValue'] - .5) / left_factor, (left['displayedValue'] + .5) / left_factor]
    right_interval = [(right['displayedValue'] - .5) / right_factor, (right['displayedValue'] + .5) / right_factor]
    if max(left_interval[0], right_interval[0]) >= min(left_interval[1], right_interval[1]):
        conflicts.append('normalizedMagnitude')
    return conflicts


def infer_base(override, effect, batch, calibration):
    """Validate a positive integer base under this capture's off-tile model."""
    if calibration.get('status') != 'component-calibration-supported':
        raise ValueError('Base inference requires a supported component calibration.')
    proposed = override['inferredBaseValue']
    key = (override['ownerId'], override['index'])
    if isinstance(proposed, bool) or not isinstance(proposed, (int, float)) or not math.isfinite(proposed) or proposed <= 0 or proposed != int(proposed):
        raise ValueError(f'{key}: inferredBaseValue must be a positive integer magnitude.')
    context = batch['meta'].get('context', {})
    components = capture_factors(context, calibration, override['ownerId'], override['tier'])
    factor = components['combinedFactor']
    shown = effect['displayedValue']
    low, high = (shown - .5) / factor, (shown + .5) / factor
    first, last = max(1, math.ceil(low)), math.ceil(high) - 1
    predicted = math.floor(proposed * factor + .5)
    if first != last or proposed != first or predicted != shown:
        raise ValueError(f'{key}: inferred base {proposed} is not the unique positive integer matching screenshot {shown}; candidate interval [{low}, {high}).')
    return {
        'source': 'source/synergy-review/calibration.json',
        'formula': 'globalFactor * ownerFactor * grandMasterFactor * tierFactor * eventFactor',
        **components, 'integerBaseInterval': [low, high],
        'upperExclusive': True, 'predictedDisplayedValue': predicted,
        'offSynergyTileAssumed': True, 'captureContext': context,
        'captureContextNotes': batch['meta'].get('contextNotes', []),
        'recordNote': override.get('inferenceNote'),
        'note': 'This integer base is inferred, not directly read. It assumes the recorded account/map/deployed context, an off-synergy-tile owner, and nearest-integer display rounding; capture-context assumptions remain applicable.'
    }


def apply_verified(data):
    manifest = read_json(ROOT / 'confirmed-overrides.json')
    if manifest['status'] not in ('fields-confirmed-values-pending', 'fields-confirmed-bases-inferred'):
        raise ValueError('Synergy override status is not approved for screenshot corrections.')
    batches = {path.name: read_json(path) for path in sorted(ROOT.glob('batch-*.json'))}
    default_batch = manifest.get('evidenceBatch')
    if default_batch is not None and default_batch not in batches:
        raise ValueError(f'Unknown default evidence batch: {default_batch}')
    counts = observation_counts(batches)
    reference = read_json(ROOT / 'spreadsheet-reference.json')
    calibration = None
    changes, seen = [], set()
    for override in manifest['overrides']:
        key = (override['ownerId'], override['index'])
        if key in seen:
            raise ValueError(f'Duplicate synergy override: {key}')
        seen.add(key)
        batch_name = override.get('evidenceBatch', default_batch)
        if batch_name not in batches:
            raise ValueError(f'{key}: unknown evidence batch {batch_name!r}.')
        evidence = batches[batch_name]
        original, current = find_record(reference, override), find_record(data, override)
        expected_sign = override.get('confirmedSign', sign(original['value']))
        if 'confirmedSign' in override and (isinstance(expected_sign, bool) or expected_sign not in (-1, 1)):
            raise ValueError(f'{key}: confirmedSign must be -1 or 1.')
        if 'confirmedGlobal' in override and not isinstance(override['confirmedGlobal'], bool):
            raise ValueError(f'{key}: confirmedGlobal must be a boolean scope.')
        if 'inferredBaseValue' in override and manifest['status'] != 'fields-confirmed-bases-inferred':
            raise ValueError(f'{key}: manifest status does not authorize inferred bases.')
        expected_fields = dict(override['expectedOriginal'])
        for field in ('type', 'value', 'global'):
            expected_fields.setdefault(field, original[field])
        for field, expected in expected_fields.items():
            if original.get(field) != expected:
                raise ValueError(f'{key}: frozen source {field} differs from reviewed source.')
            allowed = (expected,)
            if field == 'type' and 'confirmedType' in override:
                allowed += (override['confirmedType'],)
            elif field == 'global' and 'confirmedGlobal' in override:
                allowed += (override['confirmedGlobal'],)
            elif field == 'value':
                if 'confirmedSign' in override:
                    allowed += (expected_sign * abs(expected),)
                if 'inferredBaseValue' in override:
                    allowed += (expected_sign * override['inferredBaseValue'],)
            if current.get(field) not in allowed:
                raise ValueError(f'{key}: current {field} differs; refusing to overwrite it.')

        observation = override['evidence']
        group = unique([g for g in evidence['groups'] if g['id'] == observation['groupId']],
                       f'{key} screenshot group in {batch_name}')
        if group['tier'] != override['tier'] or sorted(h['id'] for h in group['requiredHeroes']) != sorted([override['ownerId'], *override['requires']]):
            raise ValueError(f'{key}: screenshot group does not match the owner and partners.')
        if group['sourceImageId'] != observation['sourceImageId']:
            raise ValueError(f'{key}: screenshot image reference differs.')
        validate_group_effects(group)
        # Multiple portraits can legitimately show the same directional effect.
        # Validation above checks exact copy counts and agreement before selection.
        effects = [e for e in group['effects'] if e['ownerId'] == override['ownerId']]
        if not effects:
            raise ValueError(f'{key}: screenshot effect missing.')
        effect = effects[0]
        if effect['type'] != override.get('confirmedType', original['type']):
            raise ValueError(f'{key}: screenshot type differs from the confirmed override.')
        if effect['global'] != override.get('confirmedGlobal', original['global']):
            raise ValueError(f'{key}: screenshot scope differs from the confirmed override.')
        if sign(effect['signedValue']) != expected_sign:
            raise ValueError(f'{key}: screenshot sign differs from the confirmed override.')
        if abs(effect['signedValue']) != effect['displayedValue']:
            raise ValueError(f'{key}: screenshot signed and displayed magnitudes differ.')
        if override['confirmedUnit'] != effect['unit']:
            raise ValueError(f'{key}: screenshot unit differs from the confirmed override.')
        if current.get('unit', override['confirmedUnit']) != override['confirmedUnit']:
            raise ValueError(f'{key}: current unit differs; refusing to overwrite it.')
        for field in ('displayedValue', 'unit', 'global'):
            if effect[field] != observation[field]:
                raise ValueError(f'{key}: screenshot {field} differs from the reviewed evidence.')
        if 'signedValue' in observation and effect['signedValue'] != observation['signedValue']:
            raise ValueError(f'{key}: screenshot signed value differs from reviewed evidence.')
        image = unique([i for i in evidence['meta']['sourceImages'] if i['id'] == group['sourceImageId']],
                       f'{key} source image')
        inference = None
        if 'inferredBaseValue' in override:
            if calibration is None:
                calibration = read_json(ROOT / 'calibration.json')
            inference = infer_base(override, effect, evidence, calibration)
        changes.append((current, original, override, effect, image, batch_name, inference))

    # No records change until every override has passed source and evidence checks.
    corrections = []
    for current, original, override, effect, image, batch_name, inference in changes:
        fields, changed_fields = ['unit'], []
        if 'confirmedType' in override:
            current['type'] = override['confirmedType']
            fields.insert(0, 'type')
            if current['type'] != original['type']:
                changed_fields.append('type')
        if 'confirmedGlobal' in override:
            current['global'] = override['confirmedGlobal']
            fields.insert(0, 'global')
            if current['global'] != original['global']:
                changed_fields.append('global')
        if 'confirmedSign' in override:
            fields.insert(0, 'sign')
            if override['confirmedSign'] != sign(original['value']):
                changed_fields.append('sign')
        if 'confirmedSign' in override or inference:
            magnitude = override.get('inferredBaseValue', abs(original['value']))
            current['value'] = override.get('confirmedSign', sign(original['value'])) * magnitude
        if inference and abs(current['value']) != abs(original['value']):
            changed_fields.append('value')
        current['unit'] = override['confirmedUnit']
        current['verification'] = {
            'status': 'fields-confirmed-base-inferred' if inference else 'fields-confirmed-magnitude-pending',
            'confirmedFields': fields, 'inferredFields': ['value'] if inference else [],
            'source': f'source/synergy-review/{batch_name}',
            'groupId': override['evidence']['groupId'],
            'sourceImage': f'source/synergy-review/{image["archivePath"]}',
            'originalType': original['type'], 'originalGlobal': original['global'],
            'originalValue': original['value'],
            'displayedValue': effect['displayedValue'],
            'displayedSignedValue': effect['signedValue'],
            'displayedUnit': effect['unit'],
            'baseValueStatus': 'integer-base-inferred-from-calibrated-display' if inference else 'magnitude-unverified-spreadsheet',
            'note': 'Listed fields are screenshot-confirmed; the base magnitude is inferred under the recorded calibrated display model.' if inference else 'Only the listed fields are corrected. The spreadsheet base magnitude is retained pending synergy-scale calibration.'
        }
        if inference:
            current['verification']['baseInference'] = inference
        correction = {
            'ownerId': override['ownerId'], 'index': override['index'],
            'tier': override['tier'], 'type': current['type'], 'global': current['global'],
            'confirmedFields': fields, 'changedFields': changed_fields,
            'inferredFields': ['value'] if inference else [],
            'currentBaseValue': current['value'], 'evidenceBatch': batch_name,
        }
        if inference:
            correction['inferredBaseValue'] = abs(current['value'])
            correction['originalBaseMagnitude'] = abs(original['value'])
        else:
            correction['retainedBaseMagnitude'] = abs(current['value'])
        corrections.append(correction)
    data['stats'] = sorted({e['type'] for h in data['heroes']
                            for kind in ('milestones', 'synergies') for e in h[kind]})
    type_count = sum('type' in c['changedFields'] for c in corrections)
    scope_count = sum('global' in c['changedFields'] for c in corrections)
    sign_count = sum('sign' in c['changedFields'] for c in corrections)
    inferred_count = sum(bool(c['inferredFields']) for c in corrections)
    sources = [f'source/synergy-review/{name}' for name in batches]
    reviewed_names = list(dict.fromkeys(batch['meta']['selectedHero']['name']
                                       for batch in batches.values()
                                       if batch['meta'].get('selectedHero', {}).get('name')))
    data['meta']['synergyReview'] = {
        'status': 'fields-confirmed-bases-inferred' if inferred_count else 'values-pending',
        **counts,
        'typeCorrectedRecords': type_count, 'scopeCorrectedRecords': scope_count,
        'signCorrectedRecords': sign_count, 'unitConfirmedRecords': len(corrections),
        'inferredBaseRecords': inferred_count, 'corrections': corrections,
        'source': f'source/synergy-review/{default_batch}' if default_batch else (sources[0] if sources else None),
        'sources': sources, 'observedBatches': len(batches),
        'reviewedHeroNames': reviewed_names,
        'numericValuesVerified': 0,
        'note': f'Screenshot-confirmed corrections: {type_count} type, {scope_count} scope, {sign_count} sign. Integer bases inferred from calibrated rounded displays: {inferred_count}. All other base magnitudes remain from the spreadsheet; inferred bases and capture-context assumptions are not direct numeric verification.'
    }
    return data


if __name__ == '__main__':
    output = PROJECT / 'data.js'
    content = output.read_text(encoding='utf-8')
    data = json.loads(content.split('window.HERO_DATA = ', 1)[1].strip().removesuffix(';'))
    apply_verified(data)
    output.write_text('// Spreadsheet data with verified screenshot corrections. Rebuild via source/extract_data.py.\n'
                      + 'window.HERO_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                      + ';\n', encoding='utf-8')
    summary = data['meta']['synergyReview']
    print(f'Applied {summary["typeCorrectedRecords"]} type, {summary["scopeCorrectedRecords"]} scope and {summary["signCorrectedRecords"]} sign corrections; {summary["inferredBaseRecords"]} integer bases inferred. '
          f'{summary["observedEffects"]} observed effects / {summary["uniqueEffects"]} unique effects.')

