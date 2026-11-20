"""Compare screenshot observations with frozen sheet records; do not edit active data.

The common-scale hypothesis assumes unchanged sheet magnitudes, nearest-integer
display rounding, and a shared account scale after the confirmed owner modifiers.
Also test the supplied global/owner bonus components with independently compounded
Grand Master synergy strength, versus additive Grand Masters. Compounding is an
inference from the observations; the milestone rule and tile evidence are separate.
Agreement tests consistency, not uniqueness or proof of an unchanged base.
"""
import csv
import json
import math
from pathlib import Path
from apply_verified import capture_factors, observation_conflicts, validate_group_effects

ROOT = Path(__file__).resolve().parent
reference = json.loads((ROOT / 'spreadsheet-reference.json').read_text(encoding='utf-8'))
heroes = {h['id']: h for h in reference['heroes']}
context = json.loads((ROOT / 'calibration.json').read_text(encoding='utf-8'))
early = math.prod(1 + bonus / 100 for bonus in context['tier1And2BonusesPercent'])
mid = 1 + context['tier3And4BonusPercent'] / 100
map56 = 1 + context['snowFortTier5And6BonusPercent'] / 100
map7 = 1 + context['snowFortTier7BonusPercent'] / 100
factors = {1: early, 2: early, 3: mid, 4: mid, 5: map56, 6: map56, 7: map7, 8: 1, 9: 1}
owner_bonuses = context['ownerSynergyBonusPercent']
default_owner_factor = 1 + owner_bonuses['default'] / 100
global_factor = math.prod(1 + bonus / 100 for bonus in context['globalSynergyBonusesPercent'])
gm_count = context['grandMasterCount']
gm_bonus = context['grandMasterSynergyBonusPercent'] / 100
compounded_gm_factor = (1 + gm_bonus) ** gm_count
additive_gm_factor = 1 + gm_bonus * gm_count
component_scale = global_factor * default_owner_factor * compounded_gm_factor
additive_scale = global_factor * default_owner_factor * additive_gm_factor
records = []
seen = {}
for file in sorted(ROOT.glob('batch-*.json')):
    batch = json.loads(file.read_text(encoding='utf-8'))
    capture_context = batch['meta'].get('context', {})
    for group in batch['groups']:
        validate_group_effects(group)
        members = sorted(h['id'] for h in group['requiredHeroes'])
        occurrences = {}
        for position, observed in enumerate(group['effects']):
            owner = observed['ownerId']
            occurrences[owner] = occurrences.get(owner, 0) + 1
            matches = [s for s in heroes[owner]['synergies']
                       if s['tier'] == group['tier'] and sorted([owner] + s['requires']) == members]
            if len(matches) != 1:
                raise ValueError(f'Ambiguous/missing sheet match: {owner} {group["id"]}')
            old = matches[0]
            key = (file.name, owner, old['index'])
            if key in seen and seen[key] != group['id']:
                raise ValueError(f'Duplicate observation: {key}')
            seen[key] = group['id']
            magnitude = abs(old['value'])
            shown = abs(observed['signedValue'])
            components = capture_factors(capture_context, context, owner, group['tier'])
            additive_components = capture_factors(capture_context, context, owner, group['tier'], 'add')
            tier_factor = components['tierFactor']
            owner_factor = components['ownerFactor'] / default_owner_factor
            # Normalize captures to the original nine-GM calibration for the
            # shared empirical fit; each row retains its actual absolute scale.
            factor = components['combinedFactor'] / component_scale
            interval = [(shown - .5) / (magnitude * factor), (shown + .5) / (magnitude * factor)]
            records.append({
                'ownerId': owner, 'ownerName': observed['ownerName'], 'index': old['index'],
                'tier': group['tier'], 'rankRequirement': group['rankRequirement'],
                'requires': old['requires'], 'observed': observed, 'sheet': old,
                'sourceBatch': file.name, 'sourceImageId': group['sourceImageId'],
                'sourceGroupId': group['id'], 'selectedHeroId': batch['meta']['selectedHero']['id'],
                'effectPosition': position, 'ownerOccurrence': occurrences[owner],
                'batchContextNotes': batch['meta'].get('contextNotes', []),
                'captureContext': capture_context, 'captureFactors': components,
                'additiveGrandMasterCaptureFactor': additive_components['combinedFactor'],
                'tierFactor': tier_factor, 'relativeOwnerFactor': owner_factor,
                'combinedRelativeFactor': factor, 'commonScaleInterval': interval,
            })

# Find the interval supported by the largest number of observations, rather than
# choosing the exceptions manually. Boundaries use [low, high).
boundaries = sorted(set(x for r in records for x in r['commonScaleInterval']))
best_point, best_matches = None, []
for lo, hi in zip(boundaries, boundaries[1:]):
    midpoint = (lo + hi) / 2
    matches = [r for r in records if r['commonScaleInterval'][0] <= midpoint < r['commonScaleInterval'][1]]
    if len(matches) > len(best_matches):
        best_point, best_matches = midpoint, matches
low = max(r['commonScaleInterval'][0] for r in best_matches)
high = min(r['commonScaleInterval'][1] for r in best_matches)
chosen = (low + high) / 2
for r in records:
    scale = r['captureFactors']['combinedFactor']
    r['fitsCommonScale'] = r in best_matches
    r['empiricalPredictedMagnitude'] = math.floor(abs(r['sheet']['value']) * chosen * r['combinedRelativeFactor'] + .5)
    r['componentRawMagnitude'] = abs(r['sheet']['value']) * scale
    r['predictedMagnitude'] = math.floor(r['componentRawMagnitude'] + .5)
    r['additiveGrandMasterRawMagnitude'] = abs(r['sheet']['value']) * r['additiveGrandMasterCaptureFactor']
    r['additiveGrandMasterPredictedMagnitude'] = math.floor(r['additiveGrandMasterRawMagnitude'] + .5)
    shown = abs(r['observed']['signedValue'])
    r['fitsSuppliedComponentsModel'] = r['predictedMagnitude'] == shown
    r['fitsAdditiveGrandMastersModel'] = r['additiveGrandMasterPredictedMagnitude'] == shown
    base_low, base_high = (shown - .5) / scale, (shown + .5) / scale
    r['conditionalBaseInterval'] = [base_low, base_high]
    r['conditionalIntegerBaseCandidates'] = list(range(max(0, math.ceil(base_low)), math.ceil(base_high)))
    r['scopeMatchesSheet'] = r['observed']['global'] == r['sheet']['global']
    r['typeMatchesSheet'] = r['observed']['type'] == r['sheet']['type']
    r['signMatchesSheet'] = (r['observed']['signedValue'] < 0) == (r['sheet']['value'] < 0)
    assert (r['empiricalPredictedMagnitude'] == shown) == r['fitsCommonScale']

component_matches = sum(r['fitsSuppliedComponentsModel'] for r in records)
additive_matches = sum(r['fitsAdditiveGrandMastersModel'] for r in records)
unique_records = {}
prior_observations = {}
overlap_conflicts = []
for r in records:
    key = (r['ownerId'], r['index'])
    for prior in prior_observations.get(key, []):
        conflicts = observation_conflicts(prior['observed'], prior['captureFactors']['combinedFactor'],
                                          r['observed'], r['captureFactors']['combinedFactor'])
        if conflicts:
            overlap_conflicts.append({'ownerId': key[0], 'index': key[1],
                                     'batches': [prior['sourceBatch'], r['sourceBatch']],
                                     'fields': conflicts})
    prior_observations.setdefault(key, []).append(r)
    unique_records.setdefault(key, r)
batch_summaries = []
for filename in sorted(set(r['sourceBatch'] for r in records)):
    rows = [r for r in records if r['sourceBatch'] == filename]
    selected = rows[0]['selectedHeroId']
    batch_summaries.append({'sourceBatch': filename, 'selectedHeroId': selected,
                           'observedEffects': len(rows),
                           'observedGroups': len(set(r['sourceGroupId'] for r in rows)),
                           'matchingEffects': sum(r['fitsSuppliedComponentsModel'] for r in rows),
                           'selectedHeroEffects': sum(r['ownerId'] == selected for r in rows),
                           'matchingSelectedHeroEffects': sum(r['ownerId'] == selected and r['fitsSuppliedComponentsModel'] for r in rows)})

payload = {
    'status': 'component-calibration-supported-frozen-reference-comparison',
    'observedEffects': len(records), 'matchingEffects': len(best_matches),
    'uniqueEffects': len(unique_records), 'repeatedEffects': len(records) - len(unique_records),
    'uniqueMatchingEffects': sum(r['fitsSuppliedComponentsModel'] for r in unique_records.values()),
    'overlapConflicts': overlap_conflicts, 'batches': batch_summaries,
    'captureNormalization': 'Each capture uses its recorded Grand Master count, event, owner, global, tier and map modifiers. Common-scale intervals are normalized to the original calibration; overlap conflicts compare unboosted rounding intervals and effect fields, not raw displayed amounts.',
    'tierFactors': factors,
    'factorEvidence': {'1-2': 'user confirmed +25% and +400%; multiplication fits observations', '3-4': 'user confirmed +150%',
                       '5-6': 'user supplied Snow Fort +115%', '7': 'user supplied Snow Fort +77%',
                       '8-9': 'reference tiers, no stated map boost'},
    'commonScaleInterval': [low, high], 'upperExclusive': True, 'exampleCommonScale': chosen,
    'captureContext': context,
    'suppliedComponentsModel': {
        'formula': 'PRODUCT(1 + globalBonus / 100) * (1 + defaultOwnerBonus / 100) * (1 + grandMasterSynergyBonus / 100)^grandMasterCount',
        'globalFactor': global_factor, 'defaultOwnerFactor': default_owner_factor,
        'grandMasterFactor': compounded_gm_factor, 'commonScale': component_scale,
        'matchingEffects': component_matches,
        'matchingMilitiaEffects': sum(r['fitsSuppliedComponentsModel'] and r['ownerId'] == 'militia' for r in records),
        'scaleInsideEmpiricalInterval': low <= component_scale < high,
        'stackingStatus': 'Strongly supported synergy-only inference from user-confirmed components and screenshots.',
        'milestoneGrandMasterStacking': context['grandMasterMilestoneStacking'],
        'tileInteractionValidated': False,
    },
    'additiveGrandMasterComparison': {
        'formula': 'PRODUCT(1 + globalBonus / 100) * (1 + defaultOwnerBonus / 100) * (1 + grandMasterSynergyBonus / 100 * grandMasterCount)',
        'grandMasterFactor': additive_gm_factor, 'commonScale': additive_scale,
        'matchingEffects': additive_matches,
        'remainingScaleAfterAdditiveGrandMastersAndDefaultOwnerBonus': [low / (additive_gm_factor * default_owner_factor), high / (additive_gm_factor * default_owner_factor)],
    },
    'remainingScaleAfterCompoundedGrandMastersAndDefaultOwnerBonus': [low / (compounded_gm_factor * default_owner_factor), high / (compounded_gm_factor * default_owner_factor)],
    'remainingScaleAfterAllSuppliedComponents': [low / component_scale, high / component_scale],
    'limitations': [
        'Old sheet base magnitudes and the rounding model are assumptions for this fit.',
        'Global +5%, +5%, +5%, owner bonuses, and nine Grand Masters form the original calibration. Per-batch context can override these; batches 11 and 12 use ten Grand Masters, the active +10% synergy event, and the user-confirmed Crusader +25% owner bonus. Compounded Grand Master synergy stacking is inferred from the fit.',
        'Milestone Grand Master compounding is independently supported by the later Militia milestone capture; synergy-only modifiers do not apply to milestones.',
        'Militia is confirmed off a synergy tile. Later batches record which components are confirmed versus inferred. Other owners\' tiles are unspecified; interaction between the additive tile bonus and compounded Grand Master strength is unverified.',
        'A changed base and a changed multiplier can produce the same displayed amount.',
        'Do not use the fitted total scale as the permanent synergy setting: it already includes deployed/map context.',
        'This report compares against the frozen spreadsheet, not corrected active data. Selected integer bases are applied with conditional inference provenance in confirmed-overrides.json; current-data consistency is reported by coverage.cjs and the production-engine capture tests. Arbalest Power Mage Energy base 12 with the ordinary owner multiplier remains equivalent to base 15 without that multiplier.',
    ],
    'records': records,
}
(ROOT / 'review.json').write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (ROOT / 'comparison.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['owner', 'index', 'tier', 'rank minimum', 'partners', 'observed type', 'scope',
                     'displayed signed value', 'unit', 'sheet type', 'sheet base', 'tier factor', 'relative owner factor',
                     'component raw magnitude', 'component predicted magnitude', 'fits supplied components',
                     'empirical predicted magnitude', 'fits empirical common scale',
                     'additive GM predicted magnitude', 'fits additive GM model', 'conditional integer candidates'])
    for r in records:
        o = r['observed']
        writer.writerow([r['ownerName'], r['index'], r['tier'], r['rankRequirement'], ', '.join(r['requires']),
                         o['type'], 'global' if o['global'] else 'personal', o['signedValue'], o['unit'],
                         r['sheet']['type'], r['sheet']['value'], r['tierFactor'], r['relativeOwnerFactor'],
                         r['componentRawMagnitude'], r['predictedMagnitude'], r['fitsSuppliedComponentsModel'],
                         r['empiricalPredictedMagnitude'], r['fitsCommonScale'],
                         r['additiveGrandMasterPredictedMagnitude'], r['fitsAdditiveGrandMastersModel'],
                         ', '.join(map(str, r['conditionalIntegerBaseCandidates']))])
print(f'{len(records)} effects compared; {len(best_matches)} fit S in [{low:.12f}, {high:.12f}).')
print(f'Supplied components: S={component_scale:.15f}, {component_matches}/{len(records)} matches; '
      f'additive Grand Masters: S={additive_scale:.15f}, {additive_matches}/{len(records)} matches.')
for r in records:
    if not r['fitsCommonScale']:
        print(f'Exception: {r["ownerName"]} T{r["tier"]} {r["observed"]["type"]}, '
              f'sheet {r["sheet"]["value"]}, display {r["observed"]["signedValue"]}, '
              f'conditional integers {r["conditionalIntegerBaseCandidates"]}')
