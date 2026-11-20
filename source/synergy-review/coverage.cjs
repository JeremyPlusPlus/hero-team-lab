'use strict';
// Rank future screenshot pages by the additional owner effects they expose.
// A page contains the selected hero's groups plus every partner portrait's
// effect. Duplicate portraits and previously captured overlaps count once.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const directory = __dirname, root = path.resolve(directory, '../..');
const context = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'engine.js'), 'utf8'), context);
const data = context.window.HERO_DATA;
const engine = context.window.HeroEngine;
const heroNames = new Map(data.heroes.map(hero => [hero.id, hero.name]));
const calibration = JSON.parse(fs.readFileSync(path.join(directory, 'calibration.json'), 'utf8'));
const groupKey = (tier, ids) => `${tier}:${[...ids].sort().join('|')}`;
const recordKey = (id, index) => `${id}:${index}`;
const groups = new Map(), records = new Map(), byOwnerGroup = new Map();
for (const hero of data.heroes) for (const synergy of hero.synergies) {
  const group = groupKey(synergy.tier, [hero.id, ...synergy.requires]);
  const key = recordKey(hero.id, synergy.index);
  if (!groups.has(group)) groups.set(group, new Set());
  groups.get(group).add(key);
  assert.ok(!records.has(key), `Duplicate source record: ${key}`);
  records.set(key, {heroId: hero.id, hero: hero.name, index: synergy.index, tier: synergy.tier, type: synergy.type, group});
  assert.ok(!byOwnerGroup.has(`${hero.id}|${group}`), `Ambiguous owner group: ${hero.id} ${group}`);
  byOwnerGroup.set(`${hero.id}|${group}`, key);
}
const files = fs.readdirSync(directory).filter(name => /^batch-\d+\.json$/.test(name)).sort();
const observed = new Set(), observedGroups = new Set(), selectedGroups = new Map(), mismatches = new Map();
let observations = 0;
for (const filename of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
  const selectedId = batch.meta.selectedHero.id;
  if (!selectedGroups.has(selectedId)) selectedGroups.set(selectedId, new Set());
  const capture = batch.meta.context, modifiers = capture.otherSynergyModifiers || calibration;
  const owner = modifiers.ownerSynergyBonusPercent, global = modifiers.globalSynergyBonusesPercent;
  const settings = {requirementReduction: 0, maxTier: 9, synergyScale: 1,
    synergyEvent: capture.synergyEvent?.enabled === true, grandMaster: true,
    synergyGrandMasterStacking: capture.grandMasterStacking || calibration.grandMasterStacking,
    snowFort: capture.map.name === 'Snow Fort', mapT56: capture.map.tier5And6SynergyBonusPercent,
    mapT7: capture.map.tier7SynergyBonusPercent, accountSynergyBoosts: true,
    heroSynergyDefault: owner.default, heroSynergyCrusader: owner.crusader, heroSynergyWarden: owner.warden,
    synergyGlobalBonus1: global[0], synergyGlobalBonus2: global[1], synergyGlobalBonus3: global[2],
    tier12Scale: modifiers.tier1And2BonusesPercent.reduce((factor, bonus) => factor * (1 + bonus / 100), 1),
    tier34Scale: 1 + modifiers.tier3And4BonusPercent / 100};
  for (const group of batch.groups) {
    const required = group.requiredHeroes.map(hero => hero.id);
    const key = groupKey(group.tier, required);
    assert.ok(byOwnerGroup.has(`${selectedId}|${key}`), `${filename}: captured group belongs to selected hero`);
    selectedGroups.get(selectedId).add(key);
    observedGroups.add(key);
    const ids = [...required, ...data.heroes.map(hero => hero.id).filter(id => !required.includes(id))]
      .slice(0, capture.grandMasterCount ?? calibration.grandMasterCount);
    const members = ids.map(id => ({id, level: 0, tile: capture.ownerTiles?.[id] || 'normal'}));
    const result = engine.evaluate(members, settings);
    for (const effect of group.effects) {
      const record = byOwnerGroup.get(`${effect.ownerId}|${key}`);
      assert.ok(record, `${filename} ${group.id}: missing ${effect.ownerId} source record`);
      observed.add(record);
      observations++;
      const expected = records.get(record);
      const emissions = result.effects.filter(item => item.kind === 'synergy' && item.ownerId === expected.heroId && item.index === expected.index);
      assert.equal(emissions.length, required.filter(id => id === effect.ownerId).length);
      const actual = emissions[0], fields = [];
      if (actual.type !== effect.type) fields.push('type');
      if (actual.global !== effect.global) fields.push('scope');
      if (actual.value !== effect.signedValue) fields.push('value');
      if (actual.unit !== undefined && actual.unit !== effect.unit) fields.push('unit');
      if (fields.length) {
        if (!mismatches.has(record)) mismatches.set(record, []);
        mismatches.get(record).push({batch: filename, groupId: group.id, fields,
          observedValue: effect.signedValue, predictedValue: actual.value});
      }
    }
  }
}
const difference = (left, right) => [...left].filter(key => !right.has(key));
const unresolvedRecords = [...mismatches.keys()];
const candidates = data.heroes.map(hero => {
  const ownEffects = new Set(hero.synergies.map(synergy => recordKey(hero.id, synergy.index)));
  const pageGroups = new Set(hero.synergies.map(synergy => groupKey(synergy.tier, [hero.id, ...synergy.requires])));
  const pageEffects = new Set([...pageGroups].flatMap(key => [...groups.get(key)]));
  const captured = selectedGroups.get(hero.id) || new Set();
  const missingSelectedGroups = hero.synergies.filter(synergy => !captured.has(groupKey(synergy.tier, [hero.id, ...synergy.requires])));
  return {id: hero.id, name: hero.name, selectedHeroObserved: selectedGroups.has(hero.id),
    selectedHeroAlreadyCaptured: missingSelectedGroups.length === 0,
    selectedGroupsCaptured: captured.size, missingSelectedGroups: missingSelectedGroups.map(({index, tier}) => ({index, tier})),
    ownEffects, pageGroups, pageEffects,
    missingOwnerEffects: difference(ownEffects, observed),
    newEffects: difference(pageEffects, observed),
    newGroups: difference(pageGroups, observedGroups),
    unresolvedEffectsInPage: unresolvedRecords.filter(key => pageEffects.has(key)).map(key => records.get(key))};
});
const ordered = [...candidates].sort((a, b) => b.newEffects.length - a.newEffects.length
  || b.missingOwnerEffects.length - a.missingOwnerEffects.length || a.name.localeCompare(b.name));
const cumulative = new Set(observed), remaining = [...candidates], greedy = [];
while (remaining.length) {
  remaining.sort((a, b) => difference(b.pageEffects, cumulative).length - difference(a.pageEffects, cumulative).length
    || b.missingOwnerEffects.length - a.missingOwnerEffects.length || a.name.localeCompare(b.name));
  const next = remaining.shift(), added = difference(next.pageEffects, cumulative);
  if (!added.length) break;
  added.forEach(key => cumulative.add(key));
  greedy.push({heroId: next.id, hero: next.name, additionalUniqueEffects: added.length,
    missingOwnerEffectsBeforeAnyNewCapture: next.missingOwnerEffects.length,
    additionalEffects: added.map(key => records.get(key)), cumulativeObservedEffects: cumulative.size,
    remainingUnobservedEffects: records.size - cumulative.size,
    unresolvedEffectsInPage: next.unresolvedEffectsInPage});
}
assert.equal(cumulative.size, records.size, 'The source pages can expose every source owner effect');
assert.equal(candidates.reduce((count, candidate) => count + candidate.missingOwnerEffects.length, 0), records.size - observed.size);
const unobservedGroups = [...groups].map(([key, effects]) => {
  const missing = difference(effects, observed);
  const tier = Number(key.slice(0, key.indexOf(':'))), memberIds = key.slice(key.indexOf(':') + 1).split('|');
  return {group: key, tier, members: memberIds.map(id => heroNames.get(id)),
    availableHeroPages: [...new Set(memberIds)].map(id => heroNames.get(id)),
    unobservedEffectCount: missing.length, effects: missing.map(id => records.get(id))};
}).filter(group => group.unobservedEffectCount > 0).sort((a, b) => a.tier - b.tier || a.group.localeCompare(b.group));
assert.equal(unobservedGroups.reduce((count, group) => count + group.unobservedEffectCount, 0), records.size - observed.size);

// The supplied screenshots usually show three adjacent tiers. Rank those
// smaller captures as well as full pages, avoiding already observed groups.
const windows = candidates.flatMap(candidate => [[1,3], [4,6], [7,9]].map(([first, last]) => {
  const windowGroups = [...candidate.pageGroups].filter(key => {
    const tier = Number(key.slice(0, key.indexOf(':')));
    return tier >= first && tier <= last;
  });
  return {hero: candidate.name, heroId: candidate.id, firstTier: first, lastTier: last,
    groups: windowGroups, effects: new Set(windowGroups.flatMap(key => [...groups.get(key)]))};
}));
const screenshotCumulative = new Set(observed), screenshotPlan = [];
while (windows.length) {
  windows.sort((a, b) => difference(b.effects, screenshotCumulative).length - difference(a.effects, screenshotCumulative).length
    || a.hero.localeCompare(b.hero) || a.firstTier - b.firstTier);
  const next = windows.shift(), added = difference(next.effects, screenshotCumulative);
  if (!added.length) break;
  const targetGroups = next.groups.filter(key => difference(groups.get(key), screenshotCumulative).length)
    .map(key => unobservedGroups.find(group => group.group === key));
  assert.ok(targetGroups.every(Boolean));
  added.forEach(key => screenshotCumulative.add(key));
  screenshotPlan.push({hero: next.hero, heroId: next.heroId, tierRange: [next.firstTier, next.lastTier],
    neededTiers: [...new Set(targetGroups.map(group => group.tier))].sort((a, b) => a - b),
    additionalUniqueEffects: added.length, remainingUnobservedEffects: records.size - screenshotCumulative.size,
    targetGroups});
}
assert.equal(screenshotCumulative.size, records.size, 'Three-tier screenshot windows cover every missing source effect');
const output = {
  summary: {availableHeroes: data.heroes.length, sourceEffects: records.size, captureBatches: files.length,
    observedEffects: observations, observedUniqueEffects: observed.size, unobservedEffects: records.size - observed.size,
    observedUniqueGroups: observedGroups.size, selectedHeroesObserved: selectedGroups.size,
    selectedHeroPagesCaptured: candidates.filter(candidate => candidate.selectedHeroAlreadyCaptured).length,
    partialSelectedHeroPages: candidates.filter(candidate => candidate.selectedHeroObserved && !candidate.selectedHeroAlreadyCaptured).length,
    unresolvedUniqueEffects: unresolvedRecords.length,
    captureBasis: 'A full selected-hero page requires all sixteen source groups, tiers I through IX. Partial batches contribute only their actual groups; partner effects count as observations.'},
  rankingMethod: 'Greedy coverage of previously unobserved owner effects. After each proposed hero, remove the effects its full page would cover before choosing the next hero. Repeated partner portraits and overlaps count once. This is a practical priority list, not a proof of the minimum possible number of captures.',
  heroes: ordered.map(candidate => ({heroId: candidate.id, hero: candidate.name,
    selectedHeroAlreadyCaptured: candidate.selectedHeroAlreadyCaptured,
    selectedHeroObserved: candidate.selectedHeroObserved,
    selectedGroupsCaptured: candidate.selectedGroupsCaptured,
    missingSelectedGroups: candidate.missingSelectedGroups,
    unobservedOwnerEffects: candidate.missingOwnerEffects.length,
    newUniqueEffectsInFullPage: candidate.newEffects.length,
    newUniqueGroupsInFullPage: candidate.newGroups.length,
    unresolvedEffectsInPage: candidate.unresolvedEffectsInPage})),
  suggestedNextFive: greedy.slice(0, 5),
  greedyFullCoverageOrder: greedy,
  unobservedGroups,
  greedyScreenshotPlan: screenshotPlan,
  screenshotPlanMethod: 'Greedy coverage using the usual I–III, IV–VI and VII–IX screenshot windows. Needed tiers and exact groups identify the useful part of each suggested capture. This reduces repeated screenshots but is not guaranteed to minimize captures.',
  unresolvedEffects: unresolvedRecords.map(key => ({...records.get(key), evidence: mismatches.get(key),
    fullPagesContainingEffect: candidates.filter(candidate => candidate.pageEffects.has(key)).map(candidate => candidate.name)})),
  notes: ['Coverage counts observations rather than declaring every captured value verified.',
    'Current mismatches are recomputed from every archived observation, so resolved earlier discrepancies do not remain hardcoded as unresolved.',
    'Arbalest Power Mage Energy base 12 under the common owner multiplier is observationally equivalent to base 15 without that multiplier. Matching captures do not identify the mechanic; the effect contributes to the user-defined Energy + Power Mages objective without resolving the base interpretation.',
    'Heroes outside the 42-record source roster cannot be prioritized by missing synergy effects yet.']
};
fs.writeFileSync(path.join(directory, 'coverage.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({summary: output.summary,
  nextFive: output.suggestedNextFive.map(({hero, additionalUniqueEffects}) => ({hero, additionalUniqueEffects})),
  unobservedOwnerCounts: output.heroes.filter(hero => !hero.selectedHeroAlreadyCaptured).map(({hero, unobservedOwnerEffects}) => ({hero, unobservedOwnerEffects})),
  partialSelectedPages: output.heroes.filter(hero => hero.selectedHeroObserved && !hero.selectedHeroAlreadyCaptured),
  screenshotPlan: output.greedyScreenshotPlan.map(({hero, tierRange, neededTiers, additionalUniqueEffects}) => ({hero, tierRange, neededTiers, additionalUniqueEffects})),
  unresolvedEffects: output.unresolvedEffects}, null, 2));
