'use strict';
// Reproducible workbook input. Values come from the production engine rather
// than a second implementation of the synergy formula.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const reviewDir = path.join(__dirname, 'synergy-review');
const outputDir = path.join(root, 'outputs', 'synergy-audit-2026-11-04');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const calibration = readJson(path.join(reviewDir, 'calibration.json'));
const context = vm.createContext({window: {}});
for (const file of ['data.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const E = context.window.HeroEngine, D = context.window.HERO_DATA;
const heroMap = new Map(D.heroes.map(hero => [hero.id, hero]));
const batches = fs.readdirSync(reviewDir).filter(name => /^batch-\d+\.json$/.test(name)).sort()
  .map(name => ({name, data: readJson(path.join(reviewDir, name))}));
const keyFor = (id, index) => `${id}:${index}`;
const groupKey = (tier, ids) => `${tier}:${[...ids].sort().join('|')}`;
const sourceGroups = new Map();
for (const hero of D.heroes) for (const synergy of hero.synergies) {
  const key = `${hero.id}:${groupKey(synergy.tier, [hero.id, ...synergy.requires])}`;
  assert.ok(!sourceGroups.has(key), `Duplicate owner synergy group: ${key}`);
  sourceGroups.set(key, synergy);
}

// Complete each group so the displayed effect is active. Preserve repeated
// prerequisite portraits; fillers never raise an existing hero's copy count.
function teamFor(required, count, ownerTiles = null) {
  assert.ok(required.length <= count, 'Capture group exceeds deployed count');
  const ids = [...required];
  for (const hero of D.heroes) {
    if (ids.length === count) break;
    if (!ids.includes(hero.id)) ids.push(hero.id);
  }
  assert.equal(ids.length, count);
  const team = ids.map(id => ({id, level: 0, locked: false, tile: ownerTiles?.[id] || 'normal'}));
  E.cleanTeam(team); // Validates ten-slot, duplicate and tile capacities.
  return team;
}

function captureSettings(capture) {
  const c = capture.meta.context, m = c.otherSynergyModifiers || calibration;
  const owners = m.ownerSynergyBonusPercent, globals = m.globalSynergyBonusesPercent;
  return {requirementReduction: 0, maxTier: 9, synergyScale: 1,
    synergyEvent: c.synergyEvent?.enabled === true, grandMaster: true,
    synergyGrandMasterStacking: c.grandMasterStacking || calibration.grandMasterStacking,
    snowFort: c.map.name === 'Snow Fort', mapT56: c.map.tier5And6SynergyBonusPercent,
    mapT7: c.map.tier7SynergyBonusPercent, accountSynergyBoosts: true,
    heroSynergyDefault: owners.default, heroSynergyCrusader: owners.crusader, heroSynergyWarden: owners.warden,
    synergyGlobalBonus1: globals[0], synergyGlobalBonus2: globals[1], synergyGlobalBonus3: globals[2],
    tier12Scale: m.tier1And2BonusesPercent.reduce((scale, bonus) => scale * (1 + bonus / 100), 1),
    tier34Scale: 1 + m.tier3And4BonusPercent / 100};
}

const evidenceByEffect = new Map(), unitsByType = new Map(), rankByTier = new Map();
let captureObservations = 0, captureMatches = 0;
for (const {name, data: capture} of batches) {
  const c = capture.meta.context, settings = captureSettings(capture);
  const count = c.grandMasterCount ?? calibration.grandMasterCount;
  for (const group of capture.groups) {
    const required = group.requiredHeroes.map(hero => hero.id);
    if (rankByTier.has(group.tier)) assert.equal(rankByTier.get(group.tier), group.rankRequirement);
    rankByTier.set(group.tier, group.rankRequirement);
    const team = teamFor(required, count, c.ownerTiles);
    const evaluated = E.evaluate(team, settings);
    const image = capture.meta.sourceImages.find(image => image.id === group.sourceImageId);
    assert.ok(image, `${name} ${group.id}: missing source image`);
    group.effects.forEach((observed, occurrence) => {
      const record = sourceGroups.get(`${observed.ownerId}:${groupKey(group.tier, required)}`);
      assert.ok(record, `${name} ${group.id}: missing owner record ${observed.ownerId}`);
      const emitted = evaluated.effects.filter(effect => effect.kind === 'synergy' &&
        effect.ownerId === observed.ownerId && effect.index === record.index);
      assert.equal(emitted.length, required.filter(id => id === observed.ownerId).length);
      assert.ok(emitted.every(effect => effect.value === emitted[0].value));
      const actual = emitted[0], differences = [];
      if (actual.type !== observed.type) differences.push(`type: ${actual.type} vs ${observed.type}`);
      if (actual.global !== observed.global) differences.push(`scope: ${actual.global ? 'Global' : 'Personal'} vs ${observed.global ? 'Global' : 'Personal'}`);
      if (actual.value !== observed.signedValue) differences.push(`value: ${actual.value} vs ${observed.signedValue}`);
      if (actual.unit !== undefined && actual.unit !== observed.unit) differences.push(`unit: ${actual.unit} vs ${observed.unit}`);
      const match = differences.length === 0;
      captureObservations++;
      if (match) captureMatches++;
      const evidence = {batch: name, groupId: group.id, occurrence,
        source: `source/synergy-review/${name}`, image: `source/synergy-review/${image.archivePath}`,
        observedSignedValue: observed.signedValue, predictedInCaptureContext: actual.value,
        observedType: observed.type, observedScope: observed.global ? 'Global' : 'Personal', unit: observed.unit,
        match, differences, grandMasterCount: count, synergyEvent: settings.synergyEvent,
        captureSettings: settings, captureContextNotes: capture.meta.contextNotes};
      const key = keyFor(observed.ownerId, record.index);
      if (!evidenceByEffect.has(key)) evidenceByEffect.set(key, []);
      evidenceByEffect.get(key).push(evidence);
      if (!unitsByType.has(observed.type)) unitsByType.set(observed.type, new Set());
      unitsByType.get(observed.type).add(observed.unit);
    });
  }
}

function unitFor(record, evidence) {
  if (record.unit) return {unit: record.unit, unitInferred: false, unitBasis: 'Explicit active data unit'};
  const direct = [...new Set(evidence.map(item => item.unit))];
  if (direct.length === 1) return {unit: direct[0], unitInferred: false, unitBasis: 'Screenshot label for this owner effect'};
  const sameType = [...(unitsByType.get(record.type) || [])];
  if (sameType.length === 1) return {unit: sameType[0], unitInferred: true,
    unitBasis: 'Inferred from screenshot labels for the same stat; this owner effect has not been checked'};
  return {unit: 'Unverified', unitInferred: true,
    unitBasis: direct.length > 1 || sameType.length > 1 ? 'Screenshot units conflict; verify in game' : 'No explicit or matching screenshot unit'};
}

const auditSettings = E.settingsFor({...E.defaults, maxTier: 9, requirementReduction: 0,
  synergyEvent: true, grandMaster: true, grandMasterStacking: 'multiply', synergyGrandMasterStacking: 'multiply',
  synergyScale: 1, milestoneScale: 2.8125, accountSynergyBoosts: true,
  tier12Scale: 6.25, tier34Scale: 2.5, heroSynergyDefault: 25, heroSynergyCrusader: 25, heroSynergyWarden: 0,
  synergyGlobalBonus1: 5, synergyGlobalBonus2: 5, synergyGlobalBonus3: 5,
  snowFort: true, mapT56: 115, mapT7: 77});
const rows = [];
for (const hero of D.heroes) {
  assert.equal(hero.synergies.length, 16, `${hero.name} synergy count`);
  const indexes = new Set();
  for (const record of hero.synergies) {
    assert.ok(!indexes.has(record.index), `${hero.name} duplicate synergy index`);
    indexes.add(record.index);
    const team = teamFor([hero.id, ...record.requires], 10);
    const result = E.evaluate(team, auditSettings);
    const effect = result.effects.find(effect => effect.kind === 'synergy' && effect.ownerIndex === 0 && effect.index === record.index);
    assert.ok(effect, `${hero.name} #${record.index}: complete prerequisite group did not activate`);
    assert.ok(Number.isFinite(effect.value), `${hero.name} nonfinite expected value`);
    const evidence = evidenceByEffect.get(keyFor(hero.id, record.index)) || [];
    const reviewStatus = !evidence.length ? 'Unreviewed' : evidence.some(item => !item.match) ? 'Unresolved mismatch' : 'Screenshot-consistent';
    const unit = unitFor(record, evidence), signed = `${effect.value >= 0 ? '+' : ''}${effect.value.toLocaleString('en-US')}`;
    const sourcePaths = [...new Set([record.source, record.verification?.source, ...evidence.map(item => item.source)].filter(Boolean))];
    const baseInferred = record.verification?.inferredFields?.includes('value') === true;
    rows.push({recordId: `${hero.id}-${record.index}`, hero: hero.name, heroId: hero.id, index: record.index, tier: record.tier,
      rankRequirement: rankByTier.get(record.tier) ?? null,
      partners: record.requires.map(id => heroMap.get(id).name).join(' + '), partnerIds: [...record.requires],
      requiredHeroNames: [hero.name, ...record.requires.map(id => heroMap.get(id).name)],
      type: effect.type, scope: effect.global ? 'Global' : 'Personal', ...unit,
      base: record.value, expectedSignedValue: effect.value,
      valueLabel: `${signed}${unit.unit === 'percent' ? '%' : ''} ${effect.type}${unit.unit === 'Unverified' ? ' [unit unverified]' : ''}`,
      reviewStatus, baseInferred, baseStatus: baseInferred ? 'Inferred from rounded capture' : 'Retained spreadsheet base',
      sourceRange: record.source, provenanceSources: sourcePaths.join('; '), sourceImages: [...new Set(evidence.map(item => item.image))],
      evidenceNote: reviewStatus === 'Unreviewed' ? 'No archived screenshot for this effect; compare with the game.'
        : reviewStatus === 'Unresolved mismatch' ? evidence.filter(item => !item.match).map(item => `${item.batch} ${item.groupId}: ${item.differences.join(', ')}`).join('; ')
        : `Matches ${evidence.length} archived observations under their capture contexts; base and context assumptions still apply.`,
      evidenceCount: evidence.length, evidence,
      effectiveSynergyScale: result.heroes[0].effectiveScales.synergy,
      effectiveTierScale: record.tier <= 2 ? result.heroes[0].effectiveScales.tier12
        : record.tier <= 4 ? result.heroes[0].effectiveScales.tier34
        : record.tier <= 6 ? result.heroes[0].effectiveScales.tier56
        : record.tier === 7 ? result.heroes[0].effectiveScales.tier7 : result.heroes[0].effectiveScales.synergy});
  }
}

assert.equal(D.heroes.length, 42);
assert.equal(rows.length, 672);
assert.equal(captureObservations, D.meta.synergyReview.observedEffects, 'Source metadata covers every archived observation');
assert.equal(evidenceByEffect.size, D.meta.synergyReview.uniqueEffects, 'Source metadata deduplicates every captured owner effect');
assert.equal(batches.length, D.meta.synergyReview.observedBatches, 'Source metadata includes all numbered batches');
const unresolved = rows.filter(row => row.reviewStatus === 'Unresolved mismatch');
// Mismatches are derived from the active data and every archived observation;
// no historical exception stays unresolved merely because it once differed.
for (const [id, index, expected] of [['hunter', 14, 14615], ['rogue', 15, 3303],
  ['hunter', 16, 13418], ['rogue', 16, 13418], ['crusader', 16, 826]]) {
  assert.equal(rows.find(row => row.heroId === id && row.index === index).expectedSignedValue, expected);
}
const statusCounts = Object.fromEntries(['Screenshot-consistent', 'Unreviewed', 'Unresolved mismatch']
  .map(status => [status, rows.filter(row => row.reviewStatus === status).length]));
const output = {
  metadata: {title: 'Expected Synergy Values — 10 Grand Masters + Synergy Event', asOf: '2026-11-04',
    generatedAt: new Date().toISOString(), generator: 'source/export_synergy_audit.cjs',
    heroCount: 42, expectedRosterHeroes: 60, missingRosterHeroes: 18, rows: rows.length, effectsPerHero: 16,
    captureBatches: batches.length, captureObservations, captureMatches, capturedUniqueEffects: evidenceByEffect.size,
    statusCounts, inferredBaseRows: rows.filter(row => row.baseInferred).length,
    inferredUnitRows: rows.filter(row => row.unitInferred).length,
    assumptions: {grandMasterCount: 10, synergyEvent: true, eventMilestoneBonusPercent: 25, eventSynergyBonusPercent: 10,
      tiles: 'All owners on normal tiles; no synergy tile bonus', map: 'Snow Fort',
      snowFortTier5And6BonusPercent: 115, snowFortTier7BonusPercent: 77,
      globalSynergyBonusesPercent: [5, 5, 5], ownerSynergyBonusPercent: {default: 25, crusader: 25, warden: 0},
      tier1And2Scale: 6.25, tier3And4Scale: 2.5, permanentMilestoneScale: 2.8125,
      activation: 'Each row assumes its full owner + prerequisite group is present, preserving repeated hero copies. Filler heroes bring the team to ten Grand Masters.',
      heroLevel: 'Level 0 is used for export evaluation so milestones do not contribute. The listed rank gate describes synergy unlocks, not run level.'},
    formula: 'Expected = Math.round(base × 1.1^10 × 1.10 event × 1.05^3 × owner factor × tier factor). Owner factor: 1.25 normally and Crusader, 1.00 Warden. Tier factor: I/II 6.25; III/IV 2.5; V/VI 2.15; VII 1.77; VIII/IX 1.',
    milestoneEventNote: 'The event also boosts milestones by ×1.25 in team scoring; that factor does not multiply synergy values in this audit.',
    statusDefinitions: {
      'Screenshot-consistent': 'The active effect matches all archived observations for this owner/group under each capture’s recorded or inferred modifiers; this does not directly verify its unboosted base or every current account assumption.',
      'Unreviewed': 'No screenshot of this owner/group is archived. This is a prediction from the current spreadsheet-derived record.',
      'Unresolved mismatch': 'At least one archived observation still differs under its capture context. The existing record is retained and should be checked.'},
    caveats: ['Coverage is the 42 heroes available in the app. Eighteen of the stated 60-hero roster are not yet included.',
      'Each row shows one owner’s emitted synergy value, not the combined team bonus. Personal effects affect that owner only.',
      'Source captures with unspecified owner tiles use the documented off-synergy-tile assumption.',
      'Inferred bases and inferred units are separately flagged. Matching recorded captures does not independently verify unboosted bases or predictions under other modifiers.',
      'Arbalest Power Mage Energy uses conditional base 12 under the common owner multiplier. Base 15 exempt from that owner multiplier gives the same displays; the captures do not distinguish those mechanisms. The effect contributes to the user-defined Energy + Power Mages objective without resolving the base interpretation.'],
    engineSettings: auditSettings},
  heroes: D.heroes.map(hero => ({id: hero.id, name: hero.name})),
  unresolvedEffects: unresolved.map(row => ({hero: row.hero, heroId: row.heroId, index: row.index, tier: row.tier,
    type: row.type, expectedSignedValue: row.expectedSignedValue, evidence: row.evidence.filter(item => !item.match)})),
  rows
};
fs.mkdirSync(outputDir, {recursive: true});
const outputPath = path.join(outputDir, 'audit-data.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({outputPath, rows: rows.length, heroes: D.heroes.length, statusCounts,
  captureObservations, captureMatches, unresolved: unresolved.map(row => `${row.hero} #${row.index}: ${row.type}`)}, null, 2));
