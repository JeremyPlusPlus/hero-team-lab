'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');

function load(customData) {
  const context = vm.createContext({window: {}});
  if (customData) context.window.HERO_DATA = customData;
  else vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(engineSource, context);
  return {engine: context.window.HeroEngine, data: context.window.HERO_DATA};
}
const {engine: E, data: D} = load();
// Raw hand calculations explicitly exclude account, style, map and active-skill boosts.
const baseline = (engine, members, settings = {}) => engine.evaluate(members, {milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', grandMaster: false, snowFort: false, goldSkills: false, damageSkills: false, damageSupportSkills: false, ...settings});
const slot = (id, level = 0, locked = false) => ({id, level, locked});
const tiled = (id, tile, level = 0, locked = false) => ({id, tile, level, locked});
const team = (...ids) => ids.map(id => slot(id));
const hero = id => D.heroes.find(h => h.id === id);
const synergy = (id, index) => hero(id).synergies.find(s => s.index === index);
const contains = (result, id, index) => result.effects.some(e => e.kind === 'synergy' && e.ownerId === id && e.index === index);
// Historical captures retain the account bonuses active at their capture date.
const captureDirectory = path.join(root, 'source/synergy-review');
const captureFiles = fs.readdirSync(captureDirectory).filter(name => /^batch-\d+\.json$/.test(name)).sort();
const captureCalibration = JSON.parse(fs.readFileSync(path.join(captureDirectory, 'calibration.json'), 'utf8'));
const captureSettings = capture => {
  const context = capture.meta.context, modifiers = context.otherSynergyModifiers || captureCalibration;
  const owners = modifiers.ownerSynergyBonusPercent, globals = modifiers.globalSynergyBonusesPercent;
  return {requirementReduction: 0, synergyEvent: context.synergyEvent?.enabled === true,
    grandMaster: true, synergyGrandMasterStacking: context.grandMasterStacking || 'multiply',
    snowFort: context.map.name === 'Snow Fort', mapT56: context.map.tier5And6SynergyBonusPercent,
    mapT7: context.map.tier7SynergyBonusPercent, accountSynergyBoosts: true,
    heroSynergyDefault: owners.default, heroSynergyCrusader: owners.crusader, heroSynergyWarden: owners.warden,
    synergyGlobalBonus1: globals[0], synergyGlobalBonus2: globals[1], synergyGlobalBonus3: globals[2],
    tier12Scale: modifiers.tier1And2BonusesPercent.reduce((scale, bonus) => scale * (1 + bonus / 100), 1),
    tier34Scale: 1 + modifiers.tier3And4BonusPercent / 100};
};
function near(actual, expected, label = '', tolerance = 1e-11) {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite value ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: expected ${expected}, received ${actual}`);
}
const tests = [];
function test(name, run) { tests.push({name, run}); }

test('source hand calculation: reciprocal tier-one effects multiply independently', () => {
  const result = baseline(E, team('militia', 'apprentice'), {maxTier: 1});
  near(result.metrics.damage, 1.133);
  near(result.heroes[0].metrics.damage, 1.133);
  near(result.heroes[1].metrics.damage, 1.133);
  assert.equal(result.counts.synergies, 2);
});

test('source hand calculation: personal milestones do not leak to teammates', () => {
  const result = baseline(E, [slot('militia', 25), slot('apprentice', 25)], {maxTier: 1});
  near(result.heroes[0].metrics.damage, 1.2463);
  near(result.heroes[1].metrics.damage, 1.18965);
  near(result.metrics.damage, 1.217975);
  near(result.global.total.Damage, 1.1);
  near(result.global.total['Attack Speed'], 1.03);
});

test('duplicate deployed Scouts contribute two multiplicative global milestones', () => {
  const result = baseline(E, [slot('scout', 25), slot('scout', 25)], {maxTier: 0});
  near(result.metrics.gold, 1.0609);
  assert.equal(result.counts.milestones, 2);
});

test('rank experience additions combine before forming one percentage factor', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Rank Exp', 5)]}]);
  const result = baseline(S, [slot('a', 25), slot('a', 25)]);
  near(result.metrics.experience, 1.1);
  assert.equal(result.global.total['Rank Exp'], 10);
});

test('milestone level thresholds are inclusive and respect individual hero levels', () => {
  const below = baseline(E, [slot('militia', 24)], {maxTier: 0});
  const equal = baseline(E, [slot('militia', 25)], {maxTier: 0});
  near(below.metrics.damage, 1);
  near(equal.metrics.damage, 1.1);
  const mixed = baseline(E, [slot('scout', 24), slot('scout', 25)], {maxTier: 0});
  near(mixed.metrics.gold, 1.03);
  assert.equal(mixed.counts.milestones, 1);
});

test('tier settings gate synergy unlocks independently from milestone levels', () => {
  const members = team('militia', 'druid');
  assert.equal(contains(baseline(E, members, {maxTier: 1}), 'militia', 4), false);
  assert.equal(contains(baseline(E, members, {maxTier: 2, requirementReduction: 1}), 'militia', 4), true);
  assert.equal(contains(baseline(E, members, {maxTier: 2, requirementReduction: 0}), 'militia', 4), false);
  assert.equal(contains(baseline(E, team('militia', 'druid', 'battlemage'),
    {maxTier: 2, requirementReduction: 0}), 'militia', 4), true);
});

test('requirement reduction does not waive the owner or a two-hero partner', () => {
  const s = synergy('militia', 1);
  assert.equal(E.synergyActive('militia', s, {apprentice: 1}, 1), false);
  assert.equal(E.synergyActive('militia', s, {militia: 1}, 1), false);
  assert.equal(E.synergyActive('militia', s, {militia: 1, apprentice: 1}, 1), true);
});

test('reduced four-hero synergy counts repeated partner copies separately', () => {
  const s = synergy('sovereign', 15);
  assert.equal(E.synergyActive('sovereign', s, {sovereign: 1, crusader: 1}, 1), false);
  assert.equal(E.synergyActive('sovereign', s, {sovereign: 1, crusader: 2}, 1), true);
  assert.equal(E.synergyActive('sovereign', s, {sovereign: 1, crusader: 2}, 0), false);
  assert.equal(E.synergyActive('sovereign', s, {sovereign: 1, crusader: 3}, 0), true);
  assert.equal(contains(baseline(E, team('sovereign', 'crusader', 'crusader'), {maxTier: 7, requirementReduction: 1}), 'sovereign', 15), false);
  assert.equal(contains(baseline(E, team('sovereign', 'crusader', 'crusader'), {maxTier: 8, requirementReduction: 1}), 'sovereign', 15), true);
});

test('owner copy cannot double as its own required partner', () => {
  const s = synergy('crusader', 15);
  assert.equal(E.synergyActive('crusader', s, {crusader: 1, sovereign: 1}, 1), false);
  assert.equal(E.synergyActive('crusader', s, {crusader: 2, sovereign: 1}, 1), true);
  assert.equal(E.synergyActive('crusader', s, {crusader: 2}, 1), false);
  assert.equal(E.synergyActive('crusader', s, {crusader: 3}, 1), true);
  assert.equal(E.synergyActive('crusader', s, {crusader: 2, sovereign: 1}, 0), false);
  assert.equal(E.synergyActive('crusader', s, {crusader: 3, sovereign: 1}, 0), true);
});

test('Titan tier-nine repeated Warlocks activate by multiset and emit once per deployed owner', () => {
  const S = synthetic(['titan', 'warlord', 'warlock'].map(id => ({id, synergies: [synergy(id, 16)]})));
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, damageSkills: false, damageSupportSkills: false};
  const cases = [
    {ids: ['titan', 'warlord', 'warlock'], reduction: 0, emitted: 0, income: 0, amount: 1, damage: 1},
    {ids: ['titan', 'warlord', 'warlock', 'warlock'], reduction: 0, emitted: 4, income: 30, amount: 1.75, damage: 33.5},
    // A third Warlock adds one income effect, not another combination of Titan's or Warlord's effect.
    {ids: ['titan', 'warlord', 'warlock', 'warlock', 'warlock'], reduction: 0, emitted: 5, income: 45, amount: 1.75, damage: 33.5},
    {ids: ['titan', 'warlord', 'warlock'], reduction: 1, emitted: 3, income: 15, amount: 1.75, damage: 33.5},
    {ids: ['titan', 'warlock', 'warlock'], reduction: 1, emitted: 3, income: 30, amount: 1, damage: 33.5},
    {ids: ['warlord', 'warlock', 'warlock'], reduction: 1, emitted: 3, income: 30, amount: 1.75, damage: 1},
    {ids: ['titan', 'warlock'], reduction: 1, emitted: 0, income: 0, amount: 1, damage: 1}
  ];
  for (const c of cases) {
    const members = team(...c.ids), config = {...settings, requirementReduction: c.reduction};
    const result = S.evaluate(members, config);
    assert.equal(result.counts.synergies, c.emitted, `${c.ids} emitted copies`);
    near(result.global.synergy['Energy Income'] || 0, c.income);
    near(result.global.synergy['Ultra Energy Amount'] || 1, c.amount);
    near(result.metrics.energy, (10000 + c.income) * c.amount);
    near(result.metrics.damage, c.damage);
    const activeWarlocks = result.effects.filter(e => e.kind === 'synergy' && e.ownerId === 'warlock');
    assert.equal(activeWarlocks.length, c.income / 15);
    assert.equal(new Set(activeWarlocks.map(e => e.ownerIndex)).size, activeWarlocks.length);
    assert.equal(contains(result, 'titan', 16), c.damage !== 1);
    for (const focus of ['energy', 'gold', 'experience', 'damage']) {
      near(S.makeScorer(config, focus, members)(members), result.metrics[focus], `${c.ids} ${focus}`);
    }
  }
  assert.equal(S.synergyActive('titan', synergy('titan', 16), {warlord: 1, warlock: 2}, 1), false);
});

test('Sovereign tier-eight three Crusaders emit three chance effects without combination duplication', () => {
  const S = synthetic(['sovereign', 'crusader'].map(id => ({id, synergies: [synergy(id, 15)]})));
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldSkills: false};
  const cases = [
    {ids: ['sovereign', 'crusader', 'crusader'], reduction: 0, emitted: 0, chance: 0, amount: 1},
    {ids: ['sovereign', 'crusader', 'crusader', 'crusader'], reduction: 0, emitted: 4, chance: 21, amount: 31},
    {ids: ['sovereign', 'sovereign', 'crusader', 'crusader', 'crusader'], reduction: 0, emitted: 5, chance: 21, amount: 31 * 31},
    {ids: ['sovereign', 'crusader', 'crusader'], reduction: 1, emitted: 3, chance: 14, amount: 31},
    {ids: ['sovereign', 'crusader'], reduction: 1, emitted: 0, chance: 0, amount: 1},
    {ids: ['crusader', 'crusader', 'crusader'], reduction: 1, emitted: 3, chance: 21, amount: 1}
  ];
  for (const c of cases) {
    const members = team(...c.ids), config = {...settings, requirementReduction: c.reduction};
    const result = S.evaluate(members, config);
    assert.equal(result.counts.synergies, c.emitted);
    near(result.global.synergy['Ultra Gold Chance'] || 0, c.chance);
    near(result.global.synergy['Ultra Gold Amount'] || 1, c.amount);
    near(result.metrics.gold, c.amount * (1 + c.chance * 0.05));
    const crusaders = result.effects.filter(e => e.kind === 'synergy' && e.ownerId === 'crusader');
    assert.equal(crusaders.length, c.chance / 7);
    assert.equal(new Set(crusaders.map(e => e.ownerIndex)).size, crusaders.length);
    for (const focus of ['energy', 'gold', 'experience', 'damage']) {
      near(S.makeScorer(config, focus, members)(members), result.metrics[focus], `${c.ids} ${focus}`);
    }
  }
  assert.equal(S.synergyActive('sovereign', synergy('sovereign', 15), {crusader: 3}, 1), false);
});

test('synergy scaling rounds each effect before stacking, but leaves milestones unchanged', () => {
  const result = baseline(E, [slot('militia', 25), slot('apprentice', 25)], {maxTier: 1, synergyScale: 1.15});
  near(result.global.synergy.Damage, 1.12);
  near(result.global.synergy['Attack Speed'], 1.03);
  near(result.heroes[0].metrics.damage, 1.12 * 1.03 * 1.1);
});

const milestone = (type, value, global = true, level = 25) => ({type, value, global, level});
function synthetic(heroes) {
  return load({meta: {statAliases: {}}, heroes: heroes.map(h => ({name: h.id, synergies: [], milestones: [], ...h}))}).engine;
}
test('separate damage bonuses multiply; critical chances share one additive spillover pool', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Damage', 20), milestone('Damage', 30),
    milestone('Crit Chance', 10), milestone('Super Crit Chance', 10)]}]);
  const result = baseline(S, [slot('a', 25)]);
  near(result.global.total.Damage, 1.56);
  near(result.overflow.damage, 2);
  near(result.metrics.damage, 3.12);
  near(baseline(S, [slot('a', 25)], {baseOverflow: 100}).metrics.damage, 4.68);
  near(baseline(S, [slot('a', 25)], {overflowRate: 0}).metrics.damage, 1.56);
});

test('personal critical overflow affects only the owner while global overflow affects both', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Crit Chance', 10, false)]},
    {id: 'b', milestones: [milestone('Super Crit Chance', 10)]}]);
  const result = baseline(S, [slot('a', 25), slot('b', 25)]);
  near(result.heroes[0].overflow.damage, 2);
  near(result.heroes[1].overflow.damage, 1.5);
  near(result.metrics.damage, 1.75);
  near(result.metrics.gold, 1);
});

test('energy income is additive while energy amount boosts multiply', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Energy Income', 2), milestone('Energy Income', 3),
    milestone('Super Energy Amount', 20), milestone('Ultra Energy Amount', 30)]}]);
  near(baseline(S, [slot('a', 25)], {baseEnergy: 1}).metrics.energy, 9.36);
  near(baseline(S, [slot('a', 25)], {baseEnergy: 0}).metrics.energy, 7.8);
});

test('confirmed capped resource chances use one spillover pool per focused stat', () => {
  const S = synthetic([{id: 'a', milestones: [
    milestone('Crit Chance', 10), milestone('Super Crit Chance', 10), milestone('Ultra Crit Chance', 10),
    milestone('Super Gold Chance', 10), milestone('Ultra Gold Chance', 20),
    milestone('Super Energy Chance', 4), milestone('Ultra Energy Chance', 6),
    milestone('Super Exp Chance', 8), milestone('Ultra Exp Chance', 2)
  ]}]);
  const result = baseline(S, [slot('a', 25)]);
  near(result.metrics.damage, 2.5);
  near(result.metrics.gold, 2.5);
  near(result.metrics.energy, 15000);
  near(result.metrics.experience, 1.5);
  const withExistingOverflow = baseline(S, [slot('a', 25)], {baseOverflow: 100});
  near(withExistingOverflow.metrics.gold, 3.5);
  near(withExistingOverflow.metrics.energy, 25000);
});

test('confirmed bare Super Energy alias contributes chance, not an independent amount factor', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Super Energy', 4)]}]);
  const result = baseline(S, [slot('a', 25)]);
  near(result.metrics.energy, 12000);
  assert.equal(result.global.total['Super Energy Chance'], 4);
  assert.equal(result.global.total['Super Energy Amount'], undefined);
  assert.equal(E.canonicalType('Ultra Crit Dmage'), 'Ultra Crit Damage');
  assert.equal(E.canonicalType('Ultra Energe Chance'), 'Ultra Energy Chance');
});

test('screenshot-resolved energy synergies increase amount without entering the spillover pool', () => {
  const crusader = synergy('crusader', 8), arbalest = synergy('arbalest', 10);
  assert.equal(crusader.type, 'Super Energy Amount');
  assert.equal(arbalest.type, 'Super Energy Amount');
  // Keep the uncalibrated sheet magnitudes; only the observed effect types change.
  assert.equal(crusader.value, 4);
  assert.equal(arbalest.value, 8);
  const isolated = structuredClone(D);
  for (const h of isolated.heroes) {
    h.milestones = [];
    h.synergies = h.id === 'crusader' ? [crusader] : h.id === 'arbalest' ? [arbalest] : [];
  }
  const {engine: S} = load(isolated);
  const members = team('militia', 'champion', 'crusader', 'necromancer', 'arbalest');
  const result = baseline(S, members, {requirementReduction: 0});
  near(result.metrics.energy, 10000 * 1.04 * 1.08);
  near(result.overflow.energy, 1);
  assert.equal(result.counts.synergies, 2);
  near(baseline(S, members.filter(s => s.id !== 'necromancer'), {requirementReduction: 0}).metrics.energy, 10400);
  assert.equal(synergy('militia', 2).value, -10);
  assert.equal(synergy('militia', 2).global, false);
});

test('unresolved Ultra Exp is visible but excluded unless explicitly mapped', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Ultra Exp', 10)]}]);
  const members = [slot('a', 25)];
  const result = baseline(S, members);
  assert.equal(result.effects[0].type, 'Ultra Exp');
  near(result.metrics.experience, 1);
  near(baseline(S, members, {ultraExpMode: 'amount'}).metrics.experience, 1.1);
  near(baseline(S, members, {ultraExpMode: 'chance'}).metrics.experience, 1.5);
});

test('focused damage can use a selected carry without changing other focus scores', () => {
  const members = [slot('militia', 25), slot('apprentice', 25)];
  const first = baseline(E, members, {maxTier: 1, damageHero: 0});
  const second = baseline(E, members, {maxTier: 1, damageHero: 1});
  near(first.metrics.damage, 1.2463);
  near(second.metrics.damage, 1.18965);
  near(first.metrics.gold, second.metrics.gold);
});

test('selected attacker combines its unlocked personal milestones with team globals only', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Damage', 100, false),
    milestone('Crit Damage', 200, false)]}, {id: 'support', milestones: [
    milestone('Damage', 50), milestone('Crit Chance', 10), milestone('Damage', 9000, false),
    milestone('Crit Chance', 100, false)]}]);
  const members = [slot('support', 25), slot('attacker', 25)];
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: false, damageHero: 1};
  const result = S.evaluate(members, settings);
  // The support's personal damage and chance cannot benefit the attacker.
  near(result.metrics.damage, 2 * 3 * 1.5 * 1.5);
  assert.ok(result.heroes[0].metrics.damage > result.metrics.damage);
  near(S.makeScorer(settings, 'damage', members)(members), result.metrics.damage);
  const below = [members[0], slot('attacker', 24)];
  near(S.evaluate(below, settings).metrics.damage, 1.5 * 1.5);
  near(S.makeScorer(settings, 'damage', below)(below), 1.5 * 1.5);
  const otherAttacker = S.evaluate(members, {...settings, damageHero: 0});
  near(otherAttacker.metrics.damage, result.heroes[0].metrics.damage);
  for (const focus of ['energy', 'gold', 'experience']) near(otherAttacker.metrics[focus], result.metrics[focus]);
});

test('default 10000 energy income balances flat income against amount bonuses in scoring and search', () => {
  const S = synthetic([{id: 'income', milestones: [milestone('Energy Income', 1000)]},
    {id: 'amount', milestones: [milestone('Super Energy Amount', 20)]}]);
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: false};
  assert.equal(S.defaults.baseEnergy, 10000);
  assert.equal(S.settingsFor({baseEnergy: 'invalid'}).baseEnergy, 10000);
  near(S.evaluate([slot('income', 25)], settings).metrics.energy, 11000);
  near(S.evaluate([slot('amount', 25)], settings).metrics.energy, 12000);
  near(S.makeScorer(settings, 'energy', [slot('income', 25)])([slot('income', 25)]), 11000);
  const ranks = S.rankMilestoneSupport(settings, {grandMasterCount: 0});
  near(ranks.heroes[0].multipliers.energy, 1.1);
  near(ranks.heroes[1].multipliers.energy, 1.2);
  const suggested = S.optimizeTeam([slot('income', 25)], settings, 'energy');
  assert.equal(suggested.team[0].id, 'amount');
  near(suggested.score, 12000);
  const smallBase = S.optimizeTeam([slot('amount', 25)], {...settings, baseEnergy: 1}, 'energy');
  assert.equal(smallBase.team[0].id, 'income');
  near(smallBase.score, 1001);
});

test('damage suggestions retain an unlocked attacker and optimize its support and milestone tile', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Damage', 100, false)]},
    {id: 'empty'}, {id: 'support', milestones: [milestone('Damage', 100)]},
    {id: 'selfish', milestones: [milestone('Damage', 100000, false)]}]);
  const members = [slot('empty', 25), slot('attacker', 25)];
  const before = JSON.stringify(members);
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: true, damageHero: 1, damageTile: 0};
  const suggested = S.optimizeTeam(members, settings, 'damage', ['support', 'selfish']);
  assert.equal(JSON.stringify(members), before);
  assert.equal(suggested.team[0].id, 'support');
  assert.equal(suggested.team[1].id, 'attacker');
  assert.equal(suggested.team[1].level, 25);
  assert.equal(suggested.team[1].locked, false);
  assert.equal(suggested.team[1].tile, 'milestone');
  near(suggested.score, 2.2 * 2.2 * 0.8);
  near(suggested.score, S.evaluate(suggested.team, settings).metrics.damage);
  const sole = S.optimizeTeam([slot('attacker', 25)], {...settings, damageHero: 0}, 'damage', []);
  assert.equal(sole.team[0].id, 'attacker');
  assert.equal(sole.team[0].locked, false);
  assert.equal(sole.team[0].tile, 'milestone');
  const resource = S.optimizeTeam(members, settings, 'energy', ['support']);
  assert.ok(resource.team.every(s => s.id === 'support'), 'resource searches do not reserve the damage attacker');
});

test('selected attacker counts toward duplicate capacity even without a user lock', () => {
  const S = synthetic([{id: 'attacker'}, {id: 'empty'}]);
  const members = [slot('attacker'), slot('empty'), slot('empty'), slot('empty')];
  assert.throws(() => S.optimizeTeam(members, {damageHero: 0}, 'damage', ['attacker']), /roster.*fill/i);
});

test('automatic attacker scoring selects the strongest combined personal and global result', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Damage', 100, false), milestone('Crit Chance', 20, false)]},
    {id: 'b', milestones: [milestone('Damage', 300, false)]},
    {id: 'support', milestones: [milestone('Damage', 50), milestone('Crit Damage', 100)]}]);
  const members = [slot('a', 25), slot('b', 25), slot('support', 25)];
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: false, damageHero: 'best'};
  const result = S.evaluate(members, settings);
  near(result.metrics.damage, 12);
  assert.equal(result.attackerIndex, 0, 'equal damage uses the first slot deterministically');
  assert.equal(result.experienceIndex, null);
  near(S.makeScorer(settings, 'damage', members)(members), 12);
  const lowerFirst = [slot('a', 24), members[1], members[2]];
  assert.equal(S.evaluate(lowerFirst, settings).attackerIndex, 1);
  near(S.makeScorer(settings, 'damage', lowerFirst)(lowerFirst), 12);
  const empty = S.evaluate([], settings);
  near(empty.metrics.damage, 0);
  assert.equal(empty.attackerIndex, null);
  near(S.makeScorer(settings, 'damage', [])([]), 0);
});

test('automatic damage search can replace the solo leader with a stronger attacker and synergy partner', () => {
  const S = synthetic([{id: 'solo', milestones: [milestone('Damage', 900, false)]},
    {id: 'combo', milestones: [milestone('Damage', 100, false)], synergies: [
      {type: 'Crit Damage', value: 900, global: false, tier: 1, requires: ['partner']}]},
    {id: 'partner', milestones: [milestone('Damage', 50)]}, {id: 'empty'}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, damageHero: 'best'};
  const original = [slot('solo', 25), slot('empty', 25)], before = JSON.stringify(original);
  const result = S.optimizeTeam(original, settings, 'damage');
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual([...result.team.map(s=>s.id)].sort(), ['combo', 'partner']);
  assert.equal(result.team[result.attackerIndex].id, 'combo');
  near(result.score, 30);
  near(result.score, S.evaluate(result.team, settings).metrics.damage);
  const fixed = S.optimizeTeam(original, {...settings, damageHero: 0}, 'damage');
  assert.equal(fixed.team[0].id, 'solo');
  near(fixed.score, 15);
  const excludedLock = [slot('solo', 25, true), slot('empty', 25)];
  const locked = S.optimizeTeam(excludedLock, settings, 'damage', ['partner']);
  assert.equal(locked.team[0].id, 'solo');
  assert.equal(locked.team[0].locked, true);
  assert.equal(locked.team[0].level, 25);
  assert.equal(locked.attackerIndex, 0);
  near(locked.score, 15);
});

test('experience target receives personal milestones plus globals without teammates personal XP', () => {
  const S = synthetic([{id: 'student', milestones: [milestone('Rank Exp', 50, false),
    milestone('Super Exp Amount', 100, false), milestone('Super Exp Chance', 10, false)]},
    {id: 'mentor', milestones: [milestone('Rank Exp', 100), milestone('Super Exp Amount', 50),
      milestone('Super Exp Amount', 100000, false)]}]);
  const members = [slot('mentor', 25), slot('student', 25)];
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: false, experienceHero: 1};
  const result = S.evaluate(members, settings);
  near(result.metrics.experience, 2.5 * 2 * 1.5 * 1.5);
  assert.equal(result.experienceIndex, 1);
  near(S.makeScorer(settings, 'experience', members)(members), result.metrics.experience);
  assert.ok(result.heroes[0].metrics.experience > result.metrics.experience);
  const below = [members[0], slot('student', 24)];
  near(S.evaluate(below, settings).metrics.experience, 3);
  near(S.makeScorer(settings, 'experience', below)(below), 3);
  const teamAverage = S.evaluate(members, {...settings, experienceHero: null});
  assert.equal(teamAverage.experienceIndex, null);
  for (const focus of ['damage', 'gold', 'energy']) near(teamAverage.metrics[focus], result.metrics[focus]);
});

test('experience suggestions retain the target level and optimize its support and tile', () => {
  const S = synthetic([{id: 'student', milestones: [milestone('Super Exp Amount', 100, false),
    milestone('Rank Exp', 10000, false, 50)]}, {id: 'empty'},
    {id: 'mentor', milestones: [milestone('Rank Exp', 100)]},
    {id: 'selfish', milestones: [milestone('Super Exp Amount', 100000, false)]}]);
  const members = [slot('empty', 25), slot('student', 25)];
  const before = JSON.stringify(members);
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: true, experienceHero: 1};
  const result = S.optimizeTeam(members, settings, 'experience', ['mentor', 'selfish']);
  assert.equal(JSON.stringify(members), before);
  assert.equal(result.experienceIndex, 1);
  assert.equal(result.team[0].id, 'mentor');
  assert.equal(result.team[1].id, 'student');
  assert.equal(result.team[1].level, 25);
  assert.equal(result.team[1].locked, false);
  assert.equal(result.team[0].tile, 'milestone');
  assert.equal(result.team[1].tile, 'experience');
  near(result.score, 2.2 * 2 * 1.2);
  near(S.makeScorer(settings, 'experience', result.team)(result.team), result.score);
  const sole = S.optimizeTeam([slot('student', 25)], {...settings, experienceHero: 0}, 'experience', []);
  assert.equal(sole.team[0].id, 'student');
  assert.equal(sole.experienceIndex, 0);
  near(sole.score, 2.4);
  const resource = S.optimizeTeam(members, settings, 'energy', ['mentor']);
  assert.ok(resource.team.every(s=>s.id==='mentor'));
  assert.throws(() => S.optimizeTeam([slot('student'), slot('empty'), slot('empty'), slot('empty')],
    {...settings, experienceHero: 0}, 'experience', ['student']), /roster.*fill/i);
});

test('targeted XP search considers multi-partner personal synergies together', () => {
  const S = synthetic([{id: 'student', synergies: [{type: 'Super Exp Amount', value: 1000,
    global: false, tier: 1, requires: ['mentor', 'assistant']}]},
    {id: 'mentor'}, {id: 'assistant'}, {id: 'modest', milestones: [milestone('Rank Exp', 10)]}, {id: 'empty'}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    experienceHero: 1, requirementReduction: 0};
  const result = S.optimizeTeam([slot('modest', 25), slot('student', 25), slot('empty', 25)], settings,
    'experience', ['modest', 'mentor', 'assistant']);
  assert.equal(result.team[1].id, 'student');
  assert.deepEqual([...result.team.map(s=>s.id)].sort(), ['assistant', 'mentor', 'student']);
  near(result.score, 11);
});

test('automatic damage and targeted XP compiled scores match detailed results across real teams and tiles', () => {
  const members = ['militia', 'apprentice', 'titan', 'warlock', 'ninja', 'ballista'].map((id,i)=>
    tiled(id, ['milestone','synergy','normal','skill'][i%4], [24,25,15000][i%3], i===0));
  for (const grandMaster of [false, true]) for (const snowFort of [false, true]) {
    const settings = {grandMaster, snowFort, damageHero: 'best', experienceHero: 2, baseOverflow: 125};
    const result = E.evaluate(members, settings);
    near(result.metrics.damage, Math.max(...result.heroes.map(h=>h.metrics.damage)));
    near(result.metrics.experience, result.heroes[2].metrics.experience);
    for (const focus of ['damage','experience','gold','energy']) {
      near(E.makeScorer(settings,focus,members)(members),result.metrics[focus],focus);
    }
    for (const focus of ['damage', 'experience']) {
      const placed = E.optimizePlacements(members,settings,focus);
      near(placed.score,E.evaluate(placed.team,settings).metrics[focus]);
      assert.ok(placed.score >= result.metrics[focus] * (1-1e-11));
      assert.equal(placed.experienceIndex,2);
      assert.ok(Number.isInteger(placed.attackerIndex));
      placed.team.forEach((s,i)=>{
        assert.equal(s.id,members[i].id); assert.equal(s.level,members[i].level); assert.equal(s.locked,members[i].locked);
      });
    }
  }
});

test('Gold attacker receives its own personal milestones and synergies plus global bonuses only', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Super Gold Amount', 100, false),
    milestone('Super Gold Chance', 10, false)], synergies: [
      {type: 'Kill Gold', value: 100, global: false, tier: 1, requires: ['support']}]},
    {id: 'support', milestones: [milestone('Kill Gold', 50), milestone('Ultra Gold Amount', 100),
      milestone('Ultra Gold Chance', 20), milestone('Kill Gold', 9000, false),
      milestone('Super Gold Amount', 9000, false), milestone('Super Gold Chance', 100, false)]}]);
  const members = [slot('support', 25), slot('attacker', 25)];
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldHero: 1};
  const result = S.evaluate(members, settings);
  near(result.metrics.gold, 1.5 * 2 * 2 * 2 * 2.5);
  assert.equal(result.goldIndex, 1);
  assert.ok(result.heroes[0].metrics.gold > result.metrics.gold, 'support has large personal gold that does not transfer');
  near(S.makeScorer(settings, 'gold', members)(members), result.metrics.gold);
  const below = [members[0], slot('attacker', 24)];
  near(S.evaluate(below, settings).metrics.gold, 1.5 * 2 * 2 * 2);
  near(S.makeScorer(settings, 'gold', below)(below), S.evaluate(below, settings).metrics.gold);
  const average = S.evaluate(members, {...settings, goldHero: null});
  near(average.metrics.gold, (result.heroes[0].metrics.gold + result.heroes[1].metrics.gold) / 2);
  assert.equal(average.goldIndex, null);
  for (const focus of ['damage', 'experience', 'energy']) near(average.metrics[focus], result.metrics[focus]);
  const automatic = S.evaluate(members, {...settings, goldHero: 'best'});
  assert.equal(automatic.goldIndex, 0);
  near(automatic.metrics.gold, result.heroes[0].metrics.gold);
  near(S.makeScorer({...settings, goldHero: 'best'}, 'gold', members)(members), automatic.metrics.gold);
  for (const invalid of [-1, 2, true, 'invalid']) {
    const fallback = S.evaluate(members, {...settings, goldHero: invalid});
    assert.equal(fallback.goldIndex, null);
    near(fallback.metrics.gold, average.metrics.gold);
    near(S.makeScorer({...settings, goldHero: invalid}, 'gold', members)(members), average.metrics.gold);
  }
  const empty = S.evaluate([], {...settings, goldHero: 'best'});
  assert.equal(empty.goldIndex, null);
  near(empty.metrics.gold, 0);
  near(S.makeScorer({...settings, goldHero: 'best'}, 'gold', [])([]), 0);
});

test('Hunter Gold score includes its level-6000 milestone and personal partner synergies without averaging', () => {
  const members = [slot('hunter', 6000), slot('captain'), slot('scout')];
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    goldHero: 0, requirementReduction: 1, maxTier: 5, goldSkills: false};
  const result = E.evaluate(members, settings);
  // Hunter + Scout and Captain + Hunter give global Kill Gold 1.1 * 2.5.
  // Captain satisfies Hunter's reduced T4 and T5 links: +15 personal chance and x5.5 Kill Gold.
  // Hunter's level-6000 milestone gives x3.5 personal Super Gold Amount; global chance adds 2pp.
  near(result.metrics.gold, 1.1 * 2.5 * 5.5 * 3.5 * (1 + (15 + 2) * 0.05));
  assert.equal(result.goldIndex, 0);
  near(result.heroes[1].metrics.gold, 1.1 * 2.5 * (1 + 2 * 0.05));
  near(E.makeScorer(settings, 'gold', members)(members), result.metrics.gold);
  const below = [slot('hunter', 5999), members[1], members[2]];
  near(result.metrics.gold / E.evaluate(below, settings).metrics.gold, 3.5);
  near(result.metrics.gold / E.evaluate(members, {...settings, maxTier: 4}).metrics.gold, 5.5);
  const average = E.evaluate(members, {...settings, goldHero: null});
  assert.ok(result.metrics.gold > average.metrics.gold, 'averaging dilutes Hunter personal gold bonuses');
  assert.ok(result.effects.some(e=>e.ownerId==='hunter' && e.kind==='milestone' && e.level===6000 && !e.global && e.type==='Super Gold Amount'));
  assert.ok(result.effects.some(e=>e.ownerId==='hunter' && e.kind==='synergy' && e.tier===5 && !e.global && e.type==='Kill Gold'));
});

test('fixed Gold attacker suggestions keep its hero and level while selecting useful support and tiles', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Super Gold Amount', 100, false)]},
    {id: 'empty'}, {id: 'support', milestones: [milestone('Kill Gold', 100)]},
    {id: 'selfish', milestones: [milestone('Super Gold Amount', 100000, false)]}]);
  const members = [slot('empty', 25), slot('attacker', 25)], before = JSON.stringify(members);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: true, goldHero: 1};
  const suggested = S.optimizeTeam(members, settings, 'gold', ['support', 'selfish']);
  assert.equal(JSON.stringify(members), before);
  assert.equal(suggested.team[0].id, 'support');
  assert.equal(suggested.team[1].id, 'attacker');
  assert.equal(suggested.team[1].level, 25);
  assert.equal(suggested.team[1].locked, false);
  assert.equal(suggested.team[1].tile, 'killGold');
  assert.equal(suggested.goldIndex, 1);
  // The support keeps its milestone tile; the killer gets the much larger personal Gold tile.
  assert.equal(suggested.team[0].tile, 'milestone');
  near(suggested.score, 2.2 * 2 * 25.75);
  near(suggested.score, S.evaluate(suggested.team, settings).metrics.gold);
  const sole = S.optimizeTeam([slot('attacker', 25)], {...settings, goldHero: 0}, 'gold', []);
  assert.equal(sole.team[0].id, 'attacker');
  assert.equal(sole.goldIndex, 0);
  near(sole.score, 2 * 25.75);
  assert.throws(() => S.optimizeTeam([slot('attacker'), slot('empty'), slot('empty'), slot('empty')],
    {...settings, goldHero: 0}, 'gold', ['attacker']), /roster.*fill/i);
  const resource = S.optimizeTeam(members, settings, 'energy', ['support']);
  assert.ok(resource.team.every(s=>s.id==='support'), 'other focus optimizers do not reserve the Gold attacker');
});

test('automatic Gold search jointly selects an attacker and its stronger personal synergy partner', () => {
  const S = synthetic([{id: 'solo', milestones: [milestone('Kill Gold', 900, false)]},
    {id: 'combo', milestones: [milestone('Kill Gold', 100, false)], synergies: [
      {type: 'Super Gold Amount', value: 900, global: false, tier: 1, requires: ['partner']}]},
    {id: 'partner', milestones: [milestone('Kill Gold', 50)]}, {id: 'empty'}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldHero: 'best'};
  const original = [slot('solo', 25), slot('empty', 25)], before = JSON.stringify(original);
  const result = S.optimizeTeam(original, settings, 'gold');
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual([...result.team.map(s=>s.id)].sort(), ['combo', 'partner']);
  assert.equal(result.team[result.goldIndex].id, 'combo');
  near(result.score, 30);
  near(result.score, S.evaluate(result.team, settings).metrics.gold);
  const fixed = S.optimizeTeam(original, {...settings, goldHero: 0}, 'gold');
  assert.equal(fixed.team[0].id, 'solo');
  near(fixed.score, 15);
  const locked = S.optimizeTeam([slot('solo', 25, true), slot('empty', 25)], settings, 'gold', ['partner']);
  assert.equal(locked.team[0].id, 'solo');
  assert.equal(locked.team[0].level, 25);
  assert.equal(locked.team[0].locked, true);
  assert.equal(locked.goldIndex, 0);
  near(locked.score, 15);
  const tie = S.evaluate([slot('solo', 25), slot('solo', 25)], settings);
  assert.equal(tie.goldIndex, 0, 'equal Gold outcomes choose the first slot deterministically');
});

test('fixed Gold search considers multi-partner personal synergies together', () => {
  const S = synthetic([{id: 'attacker', synergies: [{type: 'Super Gold Amount', value: 1000,
    global: false, tier: 1, requires: ['partner', 'assistant']}]},
    {id: 'partner'}, {id: 'assistant'}, {id: 'modest', milestones: [milestone('Kill Gold', 10)]}, {id: 'empty'}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    goldHero: 1, requirementReduction: 0};
  const result = S.optimizeTeam([slot('modest', 25), slot('attacker', 25), slot('empty', 25)], settings,
    'gold', ['modest', 'partner', 'assistant']);
  assert.equal(result.team[1].id, 'attacker');
  assert.deepEqual([...result.team.map(s=>s.id)].sort(), ['assistant', 'attacker', 'partner']);
  near(result.score, 11);
});

test('fixed and automatic Gold scorers match real heroes across tiles and independent damage and XP targets', () => {
  const members = ['hunter', 'captain', 'scout', 'assassin', 'paladin', 'rogue'].map((id,i)=>
    tiled(id, ['milestone','synergy','normal','skill'][i%4], [6000,25,15000][i%3], i===0));
  for (const grandMaster of [false,true]) for (const snowFort of [false,true]) for (const goldHero of [0,2,'best',null]) {
    const settings = {grandMaster, snowFort, goldHero, damageHero: 3, experienceHero: 1, baseOverflow: 125};
    const result = E.evaluate(members, settings);
    near(result.metrics.damage,result.heroes[3].metrics.damage);
    near(result.metrics.experience,result.heroes[1].metrics.experience);
    for (const focus of ['damage','gold','experience','energy']) near(E.makeScorer(settings,focus,members)(members),result.metrics[focus],focus);
    if (goldHero === 'best') near(result.metrics.gold,Math.max(...result.heroes.map(h=>h.metrics.gold)));
    const placed = E.optimizePlacements(members,settings,'gold');
    near(placed.score,E.evaluate(placed.team,settings).metrics.gold);
    assert.ok(placed.score >= result.metrics.gold * (1-1e-11));
    assert.equal(placed.attackerIndex,3);
    assert.equal(placed.experienceIndex,1);
    if (goldHero !== 'best') assert.equal(placed.goldIndex,goldHero);
    placed.team.forEach((s,i)=>{
      assert.equal(s.id,members[i].id); assert.equal(s.level,members[i].level); assert.equal(s.locked,members[i].locked);
    });
  }
});

test('Boss Gold multiplies the attacker payout and excludes supports personal boss bonuses', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Kill Gold', 100, false),
    milestone('Boss Gold', 100, false), milestone('Super Gold Amount', 100, false),
    milestone('Ultra Gold Amount', 100, false), milestone('Super Gold Chance', 10, false)]},
    {id: 'support', milestones: [milestone('Boss Gold', 50), milestone('Ultra Gold Chance', 20),
      milestone('Boss Gold', 9000, false)]}]);
  const members = [slot('support', 25), slot('attacker', 25)];
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldHero: 1};
  assert.equal(S.statMode('Boss Gold'), 'multiply');
  const result = S.evaluate(members, settings);
  near(result.heroes[1].bonuses['Boss Gold'], 3, 'global x1.5 times attacker personal x2');
  near(result.metrics.gold, 2 * 3 * 2 * 2 * 2.5, 'boss payout before shared chance overflow');
  near(S.makeScorer(settings, 'gold', members)(members), result.metrics.gold);
  near(result.heroes[0].bonuses['Boss Gold'], 1.5 * 91);
  const automatic = S.evaluate(members, {...settings, goldHero: 'best'});
  near(S.makeScorer({...settings, goldHero: 'best'}, 'gold', members)(members), automatic.metrics.gold);
  const noBoss = synthetic([{id: 'attacker', milestones: [milestone('Kill Gold', 100),
    milestone('Super Gold Amount', 100), milestone('Ultra Gold Amount', 100)]}]);
  near(noBoss.evaluate([slot('attacker', 25)], settings).metrics.gold, 8, 'missing Boss Gold remains x1');
  const supportRanking = S.rankMilestoneSupport(settings, {grandMasterCount: 0});
  near(supportRanking.heroes.find(h=>h.id==='support').multipliers.gold, 1.5 * 2);
  near(supportRanking.heroes.find(h=>h.id==='attacker').multipliers.gold, 1, 'personal boss gold is not a global support bonus');
});

test('Rogue global Boss Gold reaches Hunter while Ninja personal Boss Gold stays on Ninja', () => {
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    goldHero: 0, maxTier: 8, requirementReduction: 1};
  const rogueTeam = team('hunter', 'rogue', 'scout');
  const rogueResult = E.evaluate(rogueTeam, settings);
  const rogueEffect = rogueResult.effects.find(e=>e.ownerId==='rogue' && e.type==='Boss Gold');
  assert.ok(rogueEffect && rogueEffect.global);
  near(rogueEffect.value, 800);
  near(rogueResult.heroes[0].bonuses['Boss Gold'], 9);
  const withoutBossData = JSON.parse(JSON.stringify(D));
  for (const hero of withoutBossData.heroes) hero.synergies = hero.synergies.filter(effect=>effect.type!=='Boss Gold');
  const noBoss = load(withoutBossData).engine;
  near(rogueResult.metrics.gold / noBoss.evaluate(rogueTeam, settings).metrics.gold, 9);
  near(E.makeScorer(settings, 'gold', rogueTeam)(rogueTeam), rogueResult.metrics.gold);
  const ninjaTeam = team('hunter', 'ninja', 'assassin', 'elementalist');
  const ninjaResult = E.evaluate(ninjaTeam, settings);
  const ninjaEffect = ninjaResult.effects.find(e=>e.ownerId==='ninja' && e.type==='Boss Gold');
  assert.ok(ninjaEffect && !ninjaEffect.global);
  near(ninjaEffect.value, 2250);
  near(ninjaResult.metrics.gold, noBoss.evaluate(ninjaTeam, settings).metrics.gold, 'Ninja does not attack for Hunter');
  near(ninjaResult.heroes[1].metrics.gold / noBoss.evaluate(ninjaTeam, settings).heroes[1].metrics.gold, 23.5);
  for (const goldHero of [0, 1, 'best']) {
    const targeted = {...settings, goldHero};
    near(E.makeScorer(targeted, 'gold', ninjaTeam)(ninjaTeam), E.evaluate(ninjaTeam, targeted).metrics.gold);
  }
});

test('Gold search favors boss payout support and can choose a boss-specialist attacker', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Super Gold Amount', 100, false)]},
    {id: 'regular-support', milestones: [milestone('Kill Gold', 100)]},
    {id: 'boss-support', milestones: [milestone('Boss Gold', 500)]},
    {id: 'boss-specialist', synergies: [{type: 'Boss Gold', value: 2000, global: false,
      tier: 1, requires: ['regular-support']}]}, {id: 'empty'}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldHero: 0};
  const fixed = S.optimizeTeam([slot('attacker', 25), slot('empty', 25)], settings, 'gold',
    ['regular-support', 'boss-support']);
  assert.equal(fixed.team[0].id, 'attacker');
  assert.equal(fixed.team[1].id, 'boss-support');
  near(fixed.score, 12);
  const automatic = S.optimizeTeam([slot('attacker', 25), slot('empty', 25)], {...settings, goldHero: 'best'},
    'gold', ['attacker', 'regular-support', 'boss-specialist']);
  assert.deepEqual([...automatic.team.map(slot=>slot.id)].sort(), ['boss-specialist', 'regular-support']);
  assert.equal(automatic.team[automatic.goldIndex].id, 'boss-specialist');
  near(automatic.score, 42);
});

test('Boss Gold scoring matches placement and compiled objectives with mixed personal and global boss effects', () => {
  const members = ['hunter','rogue','scout','ninja','assassin','elementalist','ranger','samurai','berserker'].map((id,i)=>
    tiled(id, ['milestone','synergy','normal','skill'][i%4], 15000, i===0));
  for (const grandMaster of [false,true]) for (const snowFort of [false,true]) for (const goldHero of [0,3,'best']) {
    const settings = {requirementReduction: 1, grandMaster, snowFort, goldHero, baseOverflow: 225};
    const result = E.evaluate(members, settings);
    assert.ok(result.effects.some(effect=>effect.type==='Boss Gold' && effect.global));
    assert.ok(result.effects.some(effect=>effect.type==='Boss Gold' && !effect.global));
    near(E.makeScorer(settings,'gold',members)(members), result.metrics.gold);
    const placed = E.optimizePlacements(members, settings, 'gold');
    near(placed.score, E.evaluate(placed.team, settings).metrics.gold);
    assert.ok(placed.score >= result.metrics.gold * (1-1e-11));
    placed.team.forEach((slot,i)=>{ assert.equal(slot.id,members[i].id); assert.equal(slot.level,members[i].level); });
  }
});

test('Grand Master applies one global damage/gold multiplier per owner and one personal speed penalty', () => {
  const S = synthetic(Array.from({length: 10}, (_, i) => ({id: 'a' + i})));
  assert.equal(S.defaults.grandMaster, true);
  for (const count of [1, 2, 10]) {
    const members = Array.from({length: count}, (_, i) => slot('a' + i));
    const result = S.evaluate(members, {snowFort: false, grandMaster: true, grandMasterStacking: 'add'});
    near(result.global.total.Damage, 2.5 ** count);
    near(result.global.total['Kill Gold'], 2.5 ** count);
    near(result.metrics.damage, 0.1 * 2.5 ** count);
    near(result.metrics.gold, 2.5 ** count);
    near(result.global.total['Skill Power'], 5 * count);
    near(result.global.total['Mastery Power'], 5 * count);
    near(result.global.style.Damage, 2.5 ** count);
    near(result.style.bonusScale, 1 + 0.1 * count);
    near(result.global.style['Milestone Bonus'], 1 + 0.1 * count);
    near(result.style.synergyBonusScale, 1.1 ** count);
    near(result.global.style['Synergy Bonus'], 1.1 ** count);
    assert.equal(result.counts.styles, 7 * count);
    assert.equal(result.counts.milestones, 0);
    near(result.metrics.energy, 10000);
    near(result.metrics.experience, 1);
    result.heroes.forEach(h => {
      near(h.bonuses['Attack Speed'], 0.1);
      near(h.local.style['Attack Speed'], 0.1);
    });
  }
});

test('Grand Master milestone and synergy amplification adds across two heroes', () => {
  const result = E.evaluate([slot('militia', 25), slot('apprentice', 25)],
    {milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', snowFort: false, grandMaster: true, maxTier: 1, damageSupportSkills: false});
  // +20% to each raw bonus: synergy 10 -> 12; 3 -> ROUND(3.6)=4.
  // Personal milestone bonuses become 12% damage and 6% attack speed.
  near(result.global.synergy.Damage, 1.12);
  near(result.global.synergy['Attack Speed'], 1.04);
  near(result.heroes[0].metrics.damage, 0.81536);
  near(result.heroes[1].metrics.damage, 0.77168);
  near(result.metrics.damage, 0.79352);
  near(result.metrics.gold, 6.25);
});

test('explicit additive milestone mode doubles bonuses for ten Grand Masters', () => {
  const S = synthetic(Array.from({length: 10}, (_, i) => ({id: 'a' + i, milestones: [milestone('Rank Exp', 5)]})));
  const result = S.evaluate(Array.from({length: 10}, (_, i) => slot('a' + i, 25)), {milestoneScale: 1, snowFort: false, grandMaster: true, grandMasterStacking: 'add'});
  // Each of ten +5% rank-XP milestones doubles to +10%; total +100%.
  near(result.global.milestone['Rank Exp'], 100);
  near(result.metrics.experience, 2);
});

test('Grand Master preserves fractional milestone bonuses and does not amplify its own style effects', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Instant Trainee', 0.05), milestone('Skill Power', 7)]}]);
  const result = S.evaluate([slot('a', 25), slot('a', 0)], {milestoneScale: 1, snowFort: false, grandMaster: true, grandMasterStacking: 'add'});
  near(result.global.milestone['Instant Trainee'], 0.06);
  near(result.global.milestone['Skill Power'], 8.4);
  near(result.global.total['Skill Power'], 18.4);
  near(result.global.total['Mastery Power'], 10);
});

test('manual synergy scaling compounds with Grand Master but does not scale milestones', () => {
  const result = E.evaluate([slot('militia', 25), slot('apprentice', 25)],
    {milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', snowFort: false, grandMaster: true, maxTier: 1, synergyScale: 2, damageSupportSkills: false});
  near(result.global.synergy.Damage, 1.24);
  near(result.global.synergy['Attack Speed'], 1.07);
  near(result.heroes[0].metrics.damage, 0.625 * 1.24 * 1.07 * 1.12);
  near(result.heroes[1].metrics.damage, 0.625 * 1.24 * 1.07 * 1.06);
});

test('Snow Fort scales only synergy tiers five, six, and seven', () => {
  const S = synthetic([{id: 'a', synergies: [4, 5, 6, 7, 8, 9].map(tier =>
    ({index: tier, tier, requires: ['b'], type: 'Damage', value: 10, global: true}))}, {id: 'b'}]);
  const result = S.evaluate(team('a', 'b'), {accountSynergyBoosts: false, snowFort: true, grandMaster: false});
  const expected = {4: 10, 5: 22, 6: 22, 7: 18, 8: 10, 9: 10};
  for (const effect of result.effects.filter(e => e.kind === 'synergy')) near(effect.value, expected[effect.index]);
  const off = S.evaluate(team('a', 'b'), {accountSynergyBoosts: false, snowFort: false, grandMaster: false});
  off.effects.filter(e => e.kind === 'synergy').forEach(effect => near(effect.value, 10));
});

test('confirmed account tier boosts are independent of the map and disabling the profile restores raw scaling', () => {
  const S = synthetic([{id: 'militia', synergies: Array.from({length: 9}, (_, i) =>
    ({index: i + 1, tier: i + 1, requires: ['b'], type: 'Energy Income', value: 10, global: true}))}, {id: 'b'}]);
  near(S.defaults.tier12Scale, 1.25 * 5);
  near(S.defaults.tier34Scale, 2.5);
  near(S.defaults.synergyScale, 1);
  assert.equal(S.defaults.accountSynergyBoosts, true);
  const members = team('militia', 'b');
  const tierOnly = {heroSynergyDefault: 25, grandMaster: false, synergyGlobalBonus1: 0, synergyGlobalBonus2: 0, synergyGlobalBonus3: 0};
  const offMap = S.evaluate(members, {...tierOnly, snowFort: false});
  const onMap = S.evaluate(members, {...tierOnly, snowFort: true});
  const expectedOffMap = [78, 78, 31, 31, 13, 13, 13, 13, 13];
  const expectedOnMap = [78, 78, 31, 31, 27, 27, 22, 13, 13];
  for (const [result, expected] of [[offMap, expectedOffMap], [onMap, expectedOnMap]]) {
    result.effects.filter(e => e.kind === 'synergy').forEach(e => near(e.value, expected[e.tier - 1]));
    near(result.heroes[0].effectiveScales.ownerSynergy, 1.25);
    near(result.heroes[0].effectiveScales.tier12, 7.8125);
    near(result.heroes[0].effectiveScales.tier34, 3.125);
  }
  const disabled = S.evaluate(members, {accountSynergyBoosts: false, grandMaster: false, snowFort: false});
  disabled.effects.filter(e => e.kind === 'synergy').forEach(e => near(e.value, 10));
  near(disabled.heroes[0].effectiveScales.ownerSynergy, 1);
});

test('hero synergy boosts modify each emitter once and do not boost recipients or milestones', () => {
  const records = ['militia', 'crusader', 'warden'].map(id => ({id,
    milestones: [milestone('Skill Power', 4)],
    synergies: [
      {index: 1, tier: 8, requires: ['b'], type: 'Energy Income', value: 100, global: true},
      {index: 2, tier: 9, requires: ['b'], type: 'Damage', value: 100, global: false}
    ]}));
  const S = synthetic([...records, {id: 'b'}, {id: 'c'}]);
  const members = ['militia', 'crusader', 'warden', 'b'].map(id => slot(id, 25));
  const settings = {grandMaster: false, snowFort: false, damageSkills: false, heroSynergyDefault: 25, heroSynergyCrusader: 15, synergyGlobalBonus1: 0, synergyGlobalBonus2: 0, synergyGlobalBonus3: 0};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Energy Income'], 340); // 125 + 115 + 100, once per emitter.
  result.heroes.forEach(h => near(h.metrics.energy, 10340));
  for (const [i, factor] of [1.25, 1.15, 1].entries()) {
    near(result.heroes[i].effectiveScales.ownerSynergy, factor);
    near(result.heroes[i].metrics.damage, 1 + factor);
  }
  near(result.heroes[3].metrics.damage, 1);
  near(S.evaluate([...members, slot('c')], settings).global.synergy['Energy Income'], 340);
  const disabled = S.evaluate(members, {...settings, accountSynergyBoosts: false});
  near(disabled.global.synergy['Energy Income'], 300);
  near(result.global.milestone['Skill Power'], 22.5);
  near(result.global.milestone['Skill Power'], disabled.global.milestone['Skill Power']);
  near(S.makeScorer(settings, 'energy', members)(members), 10340);
});

test('explicit additive synergy GM mode combines owner and tier factors before one rounding', () => {
  const records = [{id: 'militia', synergies: [
    {index: 1, tier: 1, requires: ['b'], type: 'Energy Income', value: 3, global: true}
  ]}, {id: 'b'}, ...Array.from({length: 7}, (_, i) => ({id: 'c' + i}))];
  const S = synthetic(records);
  const members = records.map(h => tiled(h.id, 'normal'));
  const settings = {heroSynergyDefault: 25, grandMaster: true, snowFort: true, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add',
    synergyGlobalBonus1: 0, synergyGlobalBonus2: 0, synergyGlobalBonus3: 0};
  const result = S.evaluate(members, settings);
  near(result.style.bonusScale, 1.9);
  near(result.heroes[0].effectiveScales.tier12, 1.9 * 1.25 * 6.25);
  // 3 × 1.9 × 1.25 × 6.25 = 44.53125. No estimated residual multiplier is active.
  near(result.global.synergy['Energy Income'], 45);
  near(S.makeScorer(settings, 'energy', members)(members), 10045);
  const ownerTile = members.map((s, i) => ({...s, tile: i === 0 ? 'synergy' : 'normal'}));
  near(S.evaluate(ownerTile, settings).global.synergy['Energy Income'], 47);
  const receiverTile = members.map((s, i) => ({...s, tile: i === 1 ? 'synergy' : 'normal'}));
  near(S.evaluate(receiverTile, settings).global.synergy['Energy Income'], 45);
});

test('nine compounding Grand Masters plus confirmed account factors reproduce Militia capture values off bonus tiles', () => {
  const records = [{id: 'militia', synergies: hero('militia').synergies.map(e => ({...e, requires: ['b']}))},
    {id: 'b'}, ...Array.from({length: 7}, (_, i) => ({id: 'c' + i}))];
  const S = synthetic(records);
  const members = records.map(h => tiled(h.id, 'normal'));
  const settings = {heroAscensions: {militia: {synergyLevel: 5}}};
  const result = S.evaluate(members, settings);
  assert.equal(S.defaults.synergyGrandMasterStacking, 'multiply');
  near(result.style.bonusScale, 1.1 ** 9);
  near(result.style.synergyBonusScale, 1.1 ** 9);
  near(result.heroes[0].effectiveScales.accountGlobalSynergy, 1.157625);
  near(result.heroes[0].effectiveScales.synergy, 3.412023994742347);
  const captured = {1:213,2:-213,3:2133,4:1280,5:136,6:853,7:9,8:51,
    9:73,10:183,11:3668,12:4402,13:121,14:48,15:34,16:256};
  for (const effect of result.effects.filter(e => e.kind === 'synergy')) {
    near(effect.value, captured[effect.index], `Militia captured synergy ${effect.index}`);
  }
  for (const focus of ['energy', 'gold', 'experience', 'damage']) {
    near(S.makeScorer(settings, focus, members)(members), result.metrics[focus], `capture ${focus} scorer`);
  }
});

test('all forty-three Ninja capture effects match the active data under the continuing nine-GM profile', () => {
  const capture = JSON.parse(fs.readFileSync(path.join(root, 'source/synergy-review/batch-02.json'), 'utf8'));
  assert.equal(capture.groups.length, 16);
  let checked = 0;
  for (const group of capture.groups) {
    const required = group.requiredHeroes.map(h => h.id);
    const ids = [...required, ...D.heroes.map(h => h.id).filter(id => !required.includes(id))].slice(0, 9);
    const members = ids.map(id => tiled(id, 'normal', 0));
    const settings = captureSettings(capture);
    const result = E.evaluate(members, settings);
    assert.equal(new Set(ids).size, 9);
    assert.equal(result.style.count, 9);
    assert.equal(result.counts.milestones, 0);
    const groupKey = [...required].sort().join('|');
    for (const observed of group.effects) {
      const records = hero(observed.ownerId).synergies.filter(effect => effect.tier === group.tier &&
        [observed.ownerId, ...effect.requires].sort().join('|') === groupKey);
      assert.equal(records.length, 1, `${group.id}: unique source effect for ${observed.ownerId}`);
      const matches = result.effects.filter(effect => effect.kind === 'synergy' &&
        effect.ownerId === observed.ownerId && effect.index === records[0].index);
      assert.equal(matches.length, 1, `${group.id}: active effect for ${observed.ownerId}`);
      const actual = matches[0];
      const label = `${group.id} / ${observed.ownerId}`;
      assert.equal(actual.type, observed.type, `${label} type`);
      assert.equal(actual.value, observed.signedValue, `${label} signed displayed value`);
      assert.equal(actual.global, observed.global, `${label} scope`);
      if (actual.unit !== undefined) assert.equal(actual.unit, observed.unit, `${label} unit`);
      checked++;
    }
    for (const focus of ['energy', 'gold', 'experience', 'damage']) {
      near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `${group.id} ${focus} parity`);
    }
  }
  assert.equal(checked, 43);
});

test('all eighty-six Spelldancer and Gladiator effects match including the conditional Power Mage base', () => {
  let matched = 0;
  for (const batch of ['03', '04']) {
    const capture = JSON.parse(fs.readFileSync(path.join(root, `source/synergy-review/batch-${batch}.json`), 'utf8'));
    assert.equal(capture.groups.length, 16);
    assert.equal(capture.groups.reduce((sum, group) => sum + group.effects.length, 0), 43);
    for (const group of capture.groups) {
      const required = group.requiredHeroes.map(h => h.id);
      const ids = [...required, ...D.heroes.map(h => h.id).filter(id => !required.includes(id))].slice(0, 9);
      const members = ids.map(id => tiled(id, 'normal', 0));
      const settings = captureSettings(capture);
      const result = E.evaluate(members, settings);
      assert.equal(new Set(ids).size, 9);
      assert.equal(result.style.count, 9);
      assert.equal(result.counts.milestones, 0);
      const groupKey = [...required].sort().join('|');
      for (const observed of group.effects) {
        const records = hero(observed.ownerId).synergies.filter(effect => effect.tier === group.tier &&
          [observed.ownerId, ...effect.requires].sort().join('|') === groupKey);
        const label = `${group.id} / ${observed.ownerId}`;
        assert.equal(records.length, 1, `${label} unique source effect`);
        const effects = result.effects.filter(effect => effect.kind === 'synergy' &&
          effect.ownerId === observed.ownerId && effect.index === records[0].index);
        assert.equal(effects.length, 1, `${label} active effect`);
        const actual = effects[0];
        assert.equal(actual.type, observed.type, `${label} type`);
        assert.equal(actual.global, observed.global, `${label} scope`);
        if (actual.unit !== undefined) assert.equal(actual.unit, observed.unit, `${label} unit`);
        assert.equal(actual.value, observed.signedValue, `${label} signed displayed value`);
        matched++;
      }
      for (const focus of ['energy', 'gold', 'experience', 'damage']) {
        near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `${group.id} ${focus} parity`);
      }
    }
  }
  assert.equal(matched, 86);
});

test('all 129 Veteran, Praetorian and Battlemage capture effects match the continuing nine-GM profile', () => {
  let checked = 0;
  for (const batch of ['05', '06', '07']) {
    const capture = JSON.parse(fs.readFileSync(path.join(root, `source/synergy-review/batch-${batch}.json`), 'utf8'));
    assert.equal(capture.groups.length, 16);
    for (const group of capture.groups) {
      const required = group.requiredHeroes.map(h => h.id);
      const ids = [...required, ...D.heroes.map(h => h.id).filter(id => !required.includes(id))].slice(0, 9);
      const members = ids.map(id => tiled(id, 'normal', 0));
      const settings = captureSettings(capture);
      const result = E.evaluate(members, settings);
      assert.equal(new Set(ids).size, 9);
      assert.equal(result.style.count, 9);
      assert.equal(result.counts.milestones, 0);
      const groupKey = [...required].sort().join('|');
      for (const observed of group.effects) {
        const records = hero(observed.ownerId).synergies.filter(effect => effect.tier === group.tier &&
          [observed.ownerId, ...effect.requires].sort().join('|') === groupKey);
        const label = `${group.id} / ${observed.ownerId}`;
        assert.equal(records.length, 1, `${label} unique source effect`);
        const effects = result.effects.filter(effect => effect.kind === 'synergy' &&
          effect.ownerId === observed.ownerId && effect.index === records[0].index);
        assert.equal(effects.length, 1, `${label} active effect`);
        const actual = effects[0];
        assert.equal(actual.type, observed.type, `${label} type`);
        assert.equal(actual.global, observed.global, `${label} scope`);
        assert.equal(actual.value, observed.signedValue, `${label} signed displayed value`);
        if (actual.unit !== undefined) assert.equal(actual.unit, observed.unit, `${label} unit`);
        checked++;
      }
      for (const focus of ['energy', 'gold', 'experience', 'damage']) {
        near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `${group.id} ${focus} parity`);
      }
    }
  }
  assert.equal(checked, 129);
});

test('all 129 Titan, Sovereign and Warden effects match while preserving duplicate portraits', () => {
  let matched = 0, repeatedPortraits = 0;
  for (const batch of ['08', '09', '10']) {
    const capture = JSON.parse(fs.readFileSync(path.join(root, `source/synergy-review/batch-${batch}.json`), 'utf8'));
    assert.equal(capture.groups.length, 16);
    for (const group of capture.groups) {
      const required = group.requiredHeroes.map(h => h.id);
      const ids = [...required, ...D.heroes.map(h => h.id).filter(id => !required.includes(id))].slice(0, 9);
      const members = ids.map(id => tiled(id, 'normal', 0));
      const settings = captureSettings(capture), result = E.evaluate(members, settings);
      assert.equal(ids.length, 9);
      assert.equal(result.style.count, 9);
      assert.equal(result.counts.milestones, 0);
      const duplicateCount = required.length - new Set(required).size;
      assert.equal(new Set(ids).size, 9 - duplicateCount);
      repeatedPortraits += duplicateCount;
      const groupKey = [...required].sort().join('|'), usedByOwner = new Map();
      for (const observed of group.effects) {
        const records = hero(observed.ownerId).synergies.filter(effect => effect.tier === group.tier &&
          [observed.ownerId, ...effect.requires].sort().join('|') === groupKey);
        const label = `${group.id} / ${observed.ownerId}`;
        assert.equal(records.length, 1, `${label} one definition despite repeated portraits`);
        const effects = result.effects.filter(effect => effect.kind === 'synergy' &&
          effect.ownerId === observed.ownerId && effect.index === records[0].index);
        const requiredCopies = required.filter(id => id === observed.ownerId).length;
        assert.equal(effects.length, requiredCopies, `${label} one emission per deployed copy`);
        assert.equal(new Set(effects.map(e => e.ownerIndex)).size, requiredCopies);
        const occurrence = usedByOwner.get(observed.ownerId) || 0;
        const actual = effects[occurrence];
        assert.ok(actual, `${label} occurrence ${occurrence + 1}`);
        usedByOwner.set(observed.ownerId, occurrence + 1);
        assert.equal(actual.type, observed.type, `${label} type`);
        assert.equal(actual.global, observed.global, `${label} scope`);
        if (actual.unit !== undefined) assert.equal(actual.unit, observed.unit, `${label} unit`);
        assert.equal(actual.value, observed.signedValue, `${label} signed displayed value`);
        matched++;
      }
      for (const [id, count] of usedByOwner) assert.equal(count, required.filter(requiredId => requiredId === id).length);
      for (const focus of ['energy', 'gold', 'experience', 'damage']) {
        near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `${group.id} ${focus} parity`);
      }
    }
  }
  assert.equal(matched, 129);
  assert.equal(repeatedPortraits, 3);
});

test('corrected Veteran and Berserker effects combine experience amount with one chance overflow pool', () => {
  const S = synthetic([{id: 'veteran', synergies: [synergy('veteran', 3), synergy('veteran', 8)]},
    {id: 'berserker', synergies: [synergy('berserker', 3)]},
    {id: 'warlord'}, {id: 'skymage'}, {id: 'bystander'}]);
  const members = team('veteran', 'berserker', 'warlord', 'skymage', 'bystander');
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0,
    damageSkills: false, damageSupportSkills: false, experienceSkills: false};
  const result = S.evaluate(members, settings);
  assert.equal(result.counts.synergies, 3);
  // Berserker's +1 Super Exp Chance gives +5% overflow; Veteran's +7% amount
  // multiplies that once. Veteran's personal +5 Skill Power does not score as attack speed.
  near(result.global.synergy['Super Exp Chance'], 1);
  near(result.global.synergy['Super Exp Amount'], 1.07);
  near(result.heroes.find(h => h.id === 'veteran').local.synergy['Skill Power'], 5);
  assert.equal(result.heroes.find(h => h.id === 'bystander').bonuses['Skill Power'], undefined);
  assert.equal(result.global.synergy['Super Gold Chance'], undefined);
  assert.equal(result.global.synergy['Kill Gold'], undefined);
  result.heroes.forEach(h => {
    near(h.metrics.experience, 1.05 * 1.07);
    near(h.metrics.gold, 1);
    near(h.metrics.damage, 1);
    near(h.overflow.experience, 1.05);
  });
  near(S.makeScorer(settings, 'experience', members)(members), 1.1235);
  near(S.makeScorer(settings, 'gold', members)(members), 1);
  near(S.evaluate(members.filter(s => s.id !== 'warlord'), settings).metrics.experience, 1.05);
  near(S.evaluate(members.filter(s => s.id !== 'berserker'), settings).metrics.experience, 1.07);
});

test('corrected Wizard and Battlemage tier-four damage effects reach every recipient', () => {
  const S = synthetic([{id: 'wizard', synergies: [synergy('wizard', 8)]},
    {id: 'battlemage', synergies: [synergy('battlemage', 8)]}, {id: 'praetorian'}, {id: 'bystander'}]);
  const members = team('wizard', 'battlemage', 'praetorian', 'bystander');
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0, damageSkills: false, damageSupportSkills: false};
  const result = S.evaluate(members, settings);
  assert.equal(result.counts.synergies, 2);
  // Global +40% attack speed and +150% damage form two independent factors.
  near(result.global.synergy['Attack Speed'], 1.4);
  near(result.global.synergy.Damage, 2.5);
  assert.equal(result.global.synergy['Super Gold Amount'], undefined);
  result.heroes.forEach(h => {
    near(h.metrics.damage, 3.5);
    near(h.metrics.gold, 1);
  });
  near(S.makeScorer(settings, 'damage', members)(members), 3.5);
  near(S.makeScorer(settings, 'gold', members)(members), 1);
  near(S.evaluate(members.filter(s => s.id !== 'praetorian'), settings).metrics.damage, 1);
});

test('negative cooldowns preserve their scopes and personal flat Shadow Runes remain visible but unscored', () => {
  const runes = synergy('paladin', 16);
  const capture = JSON.parse(fs.readFileSync(path.join(root, 'source/synergy-review/batch-07.json'), 'utf8'));
  const observed = capture.groups.find(g => g.id === 'battlemage-s16').effects.find(e => e.ownerId === 'paladin');
  assert.equal(observed.type, 'Shadow Runes');
  assert.equal(observed.unit, 'flat');
  assert.equal(observed.global, false);
  assert.equal(runes.type, 'Shadow Runes');
  assert.equal(runes.value, 2);
  assert.equal(E.statMode(runes.type), 'add');
  assert.equal(runes.unit, 'flat');
  const S = synthetic([{id: 'veteran', synergies: [synergy('veteran', 6)]},
    {id: 'praetorian', synergies: [synergy('praetorian', 6)]}, {id: 'paladin', synergies: [runes]},
    {id: 'samurai'}, {id: 'champion'}, {id: 'battlemage'}, {id: 'bystander'}]);
  const members = team('veteran', 'praetorian', 'paladin', 'samurai', 'champion', 'battlemage', 'bystander');
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0,
    damageSkills: false, damageSupportSkills: false, experienceSkills: false};
  const result = S.evaluate(members, settings);
  const cooldowns = result.effects.filter(e => e.type === 'Skill Cooldown');
  assert.equal(cooldowns.length, 2);
  assert.ok(cooldowns.every(e => e.value < 0));
  near(result.global.synergy['Skill Cooldown'], -10);
  near(result.heroes.find(h => h.id === 'praetorian').local.synergy['Skill Cooldown'], -30);
  near(result.heroes.find(h => h.id === 'praetorian').bonuses['Skill Cooldown'], -40);
  near(result.heroes.find(h => h.id === 'bystander').bonuses['Skill Cooldown'], -10);
  near(result.heroes.find(h => h.id === 'paladin').local.synergy['Shadow Runes'], 2);
  assert.equal(result.heroes.find(h => h.id === 'bystander').bonuses['Shadow Runes'], undefined);
  assert.equal(result.effects.find(e => e.type === 'Shadow Runes').value, 2);
  for (const focus of ['energy', 'gold', 'experience', 'damage']) {
    near(result.metrics[focus], focus === 'energy' ? 10000 : 1);
    near(S.makeScorer(settings, focus, members)(members), focus === 'energy' ? 10000 : 1);
  }
});

test('newly clarified Apprentice and Skymage energy amounts multiply without entering the chance pool', () => {
  const apprentice = synergy('apprentice', 8), skymage = synergy('skymage', 10);
  for (const effect of [apprentice, skymage]) assert.equal(effect.type, 'Super Energy Amount');
  assert.equal(apprentice.value, 4);
  assert.equal(skymage.value, 8);
  const S = synthetic([{id: 'apprentice', synergies: [apprentice]}, {id: 'skymage', synergies: [skymage]},
    {id: 'gladiator'}, {id: 'archer'}, {id: 'deadeye'}, {id: 'bystander'}]);
  const members = team('apprentice', 'skymage', 'gladiator', 'archer', 'deadeye', 'bystander');
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0};
  const result = S.evaluate(members, settings);
  assert.equal(result.counts.synergies, 2);
  near(result.global.synergy['Super Energy Amount'], 1.04 * 1.08);
  assert.equal(result.global.synergy['Super Energy Chance'], undefined);
  result.heroes.forEach(h => {
    near(h.metrics.energy, 11232);
    near(h.overflow.energy, 1);
  });
  near(S.makeScorer(settings, 'energy', members)(members), 11232);
  near(S.evaluate(members.filter(s => s.id !== 'archer'), settings).metrics.energy, 10800);
  near(S.evaluate(members.filter(s => s.id !== 'deadeye'), settings).metrics.energy, 10400);
  // Record-specific clarifications do not change the compatibility alias for legacy inputs.
  assert.equal(E.canonicalType('Super Energy'), 'Super Energy Chance');
});

test('the conditionally inferred Arbalest Power Mage Energy value scores only the new energy focus', () => {
  const effect = synergy('arbalest', 14);
  assert.equal(effect.type, 'Power Mage Energy');
  assert.equal(effect.value, 12);
  // Twelve assumes the common owner multiplier; fifteen without it is equivalent.
  assert.equal(effect.verification.baseValueStatus, 'integer-base-inferred-from-calibrated-display');
  const S = synthetic([{id: 'arbalest', synergies: [effect]}, {id: 'militia'}, {id: 'spelldancer'}]);
  const members = team('arbalest', 'militia', 'spelldancer');
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0, damageSupportSkills: false};
  const result = S.evaluate(members, settings);
  assert.equal(result.counts.synergies, 1);
  assert.equal(result.effects[0].type, 'Power Mage Energy');
  assert.equal(result.effects[0].value, 12);
  assert.equal(E.statMode(effect.type), 'multiply');
  near(result.global.total['Power Mage Energy'], 1.12);
  near(result.metrics.powerMageEnergy, 11200);
  near(S.makeScorer(settings, 'powerMageEnergy', members)(members), 11200);
  for (const focus of ['energy', 'gold', 'experience', 'damage']) {
    near(result.metrics[focus], focus === 'energy' ? 10000 : 1);
    near(S.makeScorer(settings, focus, members)(members), focus === 'energy' ? 10000 : 1);
  }
});

test('Power Mage factors multiply independently after wave energy and its shared chance overflow', () => {
  const S = synthetic([{id: 'mage', milestones: [milestone('Power Mage Energy', 20)], synergies: [
    {index: 1, tier: 7, requires: ['wave'], type: 'Power Mage Energy', value: 50, global: true}]},
    {id: 'wave', milestones: [milestone('Energy Income', 10), milestone('Super Energy Amount', 50),
      milestone('Ultra Energy Amount', 25), milestone('Super Energy Chance', 10), milestone('Ultra Energy Chance', 20)]}]);
  const members = [slot('mage', 25), slot('mage', 25), slot('wave', 25)];
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    baseOverflow: 25, overflowRate: 5, requirementReduction: 0};
  const waveEnergy = 10010 * 1.5 * 1.25 * 2.75, mageFactor = 1.2 ** 2 * 1.5 ** 2;
  for (const attacker of [null, 0, 2, 'best']) {
    const input = {...settings, damageHero: attacker, goldHero: attacker, experienceHero: attacker};
    const result = S.evaluate(members, input);
    near(result.global.milestone['Power Mage Energy'], 1.2 ** 2);
    near(result.global.synergy['Power Mage Energy'], 1.5 ** 2);
    near(result.global.total['Power Mage Energy'], mageFactor);
    near(result.metrics.energy, waveEnergy);
    near(result.metrics.powerMageEnergy, waveEnergy * mageFactor);
    near(result.overflow.energy, 2.75, 'PM amount never enters the chance pool');
    result.heroes.forEach(h => near(h.metrics.powerMageEnergy, waveEnergy * mageFactor));
    near(S.makeScorer(input, 'powerMageEnergy', members)(members), waveEnergy * mageFactor);
    near(S.makeScorer(input, 'energy', members)(members), waveEnergy);
    for (const focus of ['gold', 'damage', 'experience']) near(result.metrics[focus], 1.25, 'only the existing base overflow applies');
  }
});

test('Captain milestone and Arbalest synergy independently gate global Power Mage energy', () => {
  const captain = hero('captain').milestones.find(m => m.type === 'Power Mage Energy');
  const arbalest = synergy('arbalest', 14);
  assert.equal(captain.level, 7500);
  assert.equal(captain.value, 10);
  assert.ok(captain.global && arbalest.global);
  const S = synthetic([{id: 'captain', milestones: [captain]}, {id: 'arbalest', synergies: [arbalest]},
    {id: 'militia'}, {id: 'spelldancer'}]);
  const members = [slot('captain', 7500), ...team('arbalest', 'militia', 'spelldancer')];
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0};
  near(S.evaluate(members, settings).metrics.powerMageEnergy, 10000 * 1.1 * 1.12);
  const below = members.map(s => s.id === 'captain' ? {...s, level: 7499} : s);
  near(S.evaluate(below, settings).metrics.powerMageEnergy, 11200);
  near(S.evaluate([...members, slot('captain', 7500)], settings).metrics.powerMageEnergy, 10000 * 1.1 ** 2 * 1.12);
  near(S.evaluate(members, {...settings, maxTier: 6}).metrics.powerMageEnergy, 11000);
  near(S.evaluate(members.filter(s => s.id !== 'militia'), settings).metrics.powerMageEnergy, 11000);
  const largerBase = S.evaluate(members, {...settings, baseEnergy: 20000});
  near(largerBase.metrics.energy, 20000);
  near(largerBase.metrics.powerMageEnergy, 20000 * 1.1 * 1.12);
  assert.equal(JSON.stringify(arbalest.verification), JSON.stringify(synergy('arbalest', 14).verification));
});

test('Power Mage energy respects nine-GM event and owner tiles in both scoring paths', () => {
  const captain = hero('captain').milestones.find(m => m.type === 'Power Mage Energy');
  const S = synthetic([{id: 'captain', milestones: [captain]}, {id: 'arbalest', synergies: [synergy('arbalest', 14)]},
    ...['militia', 'spelldancer', 'a', 'b', 'c', 'd', 'e'].map(id => ({id}))]);
  const members = [tiled('captain', 'milestone', 7500), tiled('arbalest', 'synergy'),
    ...team('militia', 'spelldancer', 'a', 'b', 'c', 'd', 'e')];
  for (const grandMasterStacking of ['add', 'multiply']) for (const synergyGrandMasterStacking of ['add', 'multiply']) {
    const settings = {defaultMilestoneLevel: 5, heroSynergyDefault: 25, synergyEvent: true, requirementReduction: 0, grandMasterStacking, synergyGrandMasterStacking};
    const milestonePool = grandMasterStacking === 'multiply' ? 1.1 ** 9 : 1.9;
    const synergyPool = synergyGrandMasterStacking === 'multiply' ? 1.1 ** 9 : 1.9;
    const milestoneValue = 10 * 2.8125 * (milestonePool + 0.2) * 1.25;
    const synergyValue = Math.round(12 * (synergyPool + 0.1) * 1.1 * 1.25 * 1.05 ** 3 * 1.77);
    const expected = 10000 * (1 + milestoneValue / 100) * (1 + synergyValue / 100);
    const result = S.evaluate(members, settings);
    near(result.metrics.energy, 10000);
    near(result.metrics.powerMageEnergy, expected);
    near(S.makeScorer(settings, 'powerMageEnergy', members)(members), expected);
  }
});

test('new energy focus selects Power Mage support and optimizes its milestone and synergy tiles', () => {
  const S = synthetic([{id: 'wave', milestones: [milestone('Super Energy Amount', 50)]},
    {id: 'mage', milestones: [milestone('Power Mage Energy', 100)]}]);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
    damageHero: 0, goldHero: 0, experienceHero: 0};
  const members = [slot('wave', 25)];
  assert.equal(S.optimizeTeam(members, settings, 'energy').team[0].id, 'wave');
  const suggested = S.optimizeTeam(members, settings, 'powerMageEnergy');
  assert.equal(suggested.team[0].id, 'mage', 'other focus attacker settings cannot lock the wave slot');
  near(suggested.score, 20000);
  const T = synthetic([{id: 'milestones', milestones: [milestone('Power Mage Energy', 20)]},
    {id: 'synergy', synergies: [{index: 1, tier: 7, requires: ['milestones'], type: 'Power Mage Energy', value: 40, global: true}]}]);
  const tiles = T.optimizePlacements([slot('milestones', 25), slot('synergy')], {...settings, snowFort: true, synergyEvent: true}, 'powerMageEnergy');
  assert.equal(tiles.team.find(s => s.id === 'milestones').tile, 'milestone');
  assert.equal(tiles.team.find(s => s.id === 'synergy').tile, 'synergy');
  const expected = 10000 * (1 + 20 * 1.2 * 1.25 / 100) * (1 + Math.round(40 * 1.1 * 1.1 * 1.77) / 100);
  near(tiles.score, expected);
  near(tiles.score, T.evaluate(tiles.team, {...settings, snowFort: true, synergyEvent: true}).metrics.powerMageEnergy);
});

test('Power Mage search seeds multi-partner links for its factor and every wave-energy stat', () => {
  for (const type of ['Power Mage Energy', 'Super Energy Amount', 'Ultra Energy Amount', 'Energy Income', 'Super Energy Chance', 'Ultra Energy Chance']) {
    const amount = type === 'Energy Income' ? 100000 : 1000;
    const decoys = Array.from({length: 7}, (_, i) => ({id: `decoy${i}`, milestones: [milestone('Energy Income', 100)]}));
    const S = synthetic([...decoys, {id: 'owner', synergies: [
      {index: 1, tier: 7, requires: ['partnerA', 'partnerB'], type, value: amount, global: true}]},
      {id: 'partnerA'}, {id: 'partnerB'}]);
    const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, requirementReduction: 0};
    const result = S.optimizeTeam([slot('decoy0', 25), slot('decoy0', 25), slot('decoy0', 25)], settings, 'powerMageEnergy');
    assert.equal(result.team.map(s => s.id).sort().join(','), 'owner,partnerA,partnerB', type);
    near(result.score, type.endsWith('Chance') ? 510000 : 110000, `${type} linked objective`);
    near(result.score, S.evaluate(result.team, settings).metrics.powerMageEnergy);
  }
});

test('all archived synergy captures preserve overlapping fields across their recorded bonus contexts', () => {
  const seen = new Map();
  let repeatedGroups = 0, repeatedEffects = 0;
  for (const name of captureFiles) {
    const capture = JSON.parse(fs.readFileSync(path.join(captureDirectory, name), 'utf8'));
    const profile = JSON.stringify([captureSettings(capture), capture.meta.context.grandMasterCount]);
    for (const group of capture.groups) {
      const multiplicities = ids => [...ids.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map())].sort();
      assert.deepEqual(multiplicities(group.effects.map(e => e.ownerId)), multiplicities(group.requiredHeroes.map(h => h.id)));
      const observedByOwner = new Map();
      for (const observed of group.effects) {
        const previous = observedByOwner.get(observed.ownerId);
        if (previous) for (const field of ['type', 'signedValue', 'displayedValue', 'global', 'unit']) {
          assert.equal(observed[field], previous[field], `${group.id} identical repeated portrait ${field}`);
        }
        observedByOwner.set(observed.ownerId, observed);
      }
      const key = `${group.tier}:${group.requiredHeroes.map(h => h.id).sort().join('|')}`;
      if (!seen.has(key)) { seen.set(key, {group, profile}); continue; }
      const priorCapture = seen.get(key), previous = priorCapture.group;
      assert.equal(group.rankRequirement, previous.rankRequirement, `${group.id} shared rank requirement`);
      assert.equal(group.effects.length, previous.effects.length, `${group.id} shared effect count`);
      for (const observed of group.effects) {
        const prior = previous.effects.find(effect => effect.ownerId === observed.ownerId);
        assert.ok(prior, `${group.id}: missing shared ${observed.ownerId} effect`);
        for (const field of ['type', 'global', 'unit']) {
          assert.equal(observed[field], prior[field], `${group.id} / ${observed.ownerId}: shared ${field}`);
        }
        assert.equal(Math.sign(observed.signedValue), Math.sign(prior.signedValue), `${group.id} shared effect sign`);
        if (profile === priorCapture.profile) for (const field of ['signedValue', 'displayedValue']) {
          assert.equal(observed[field], prior[field], `${group.id} / ${observed.ownerId}: same-context ${field}`);
        }
        repeatedEffects++;
      }
      repeatedGroups++;
    }
  }
  // These twelve original batches remain archived while new captures add overlap.
  assert.ok(repeatedGroups >= 43);
  assert.ok(repeatedEffects >= 127);
});

test('corrected Sorcerer, Witch and Warlock global synergies reach a hero outside their partner groups', () => {
  const S = synthetic([
    {id: 'sorcerer', synergies: [synergy('sorcerer', 2)]},
    {id: 'witch', synergies: [synergy('witch', 2)]},
    {id: 'warlock', synergies: [synergy('warlock', 12)]},
    {id: 'ninja'}, {id: 'gladiator'}, {id: 'bystander'}
  ]);
  const members = team('sorcerer', 'witch', 'warlock', 'ninja', 'gladiator', 'bystander');
  const result = baseline(S, members, {requirementReduction: 0});
  assert.equal(result.counts.synergies, 3);
  // Raw +4 Crit Chance contributes +20% overflow; +20% Crit Damage multiplies it.
  // Warlock's +275% Kill Gold applies to every recipient, including the bystander.
  const bystander = result.heroes.find(h => h.id === 'bystander');
  near(bystander.metrics.damage, 1.2 * 1.2);
  near(bystander.metrics.gold, 3.75);
  near(result.global.synergy['Crit Chance'], 4);
  near(result.global.synergy['Crit Damage'], 1.2);
  near(result.global.synergy['Kill Gold'], 3.75);
  result.heroes.forEach(h => {
    near(h.metrics.damage, 1.44);
    near(h.metrics.gold, 3.75);
  });
  const noWarlock = baseline(S, members.filter(s => s.id !== 'warlock'), {requirementReduction: 0});
  near(noWarlock.heroes.find(h => h.id === 'bystander').metrics.gold, 1);
});

test('corrected Peacekeeper synergy increases team experience without changing gold', () => {
  const S = synthetic([{id: 'peacekeeper', synergies: [synergy('peacekeeper', 8)]},
    {id: 'ninja'}, {id: 'spelldancer'}, {id: 'bystander'}]);
  const members = team('peacekeeper', 'ninja', 'spelldancer', 'bystander');
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false,
    snowFort: false, requirementReduction: 0};
  const result = S.evaluate(members, settings);
  assert.equal(result.counts.synergies, 1);
  // The corrected raw +7% Super Exp Amount is one global experience factor.
  near(result.global.synergy['Super Exp Amount'], 1.07);
  assert.equal(result.global.synergy['Super Gold Amount'], undefined);
  result.heroes.forEach(h => {
    near(h.metrics.experience, 1.07);
    near(h.metrics.gold, 1);
  });
  near(S.makeScorer(settings, 'experience', members)(members), 1.07);
  near(S.makeScorer(settings, 'gold', members)(members), 1);
  near(S.evaluate(members.filter(s => s.id !== 'spelldancer'), settings).metrics.experience, 1);
});

test('the four overlapping tier-nine effects agree between Militia and Ninja captures', () => {
  const captures = ['01', '02'].map(batch => JSON.parse(fs.readFileSync(
    path.join(root, `source/synergy-review/batch-${batch}.json`), 'utf8')));
  const shared = captures.map(capture => capture.groups.find(group => group.tier === 9));
  assert.deepEqual(shared[0].requiredHeroes.map(h => h.id).sort(), shared[1].requiredHeroes.map(h => h.id).sort());
  assert.equal(shared[0].effects.length, 4);
  for (const first of shared[0].effects) {
    const second = shared[1].effects.find(effect => effect.ownerId === first.ownerId);
    assert.ok(second, `missing shared ${first.ownerId} effect`);
    for (const key of ['type', 'signedValue', 'global', 'unit']) {
      assert.equal(second[key], first[key], `${first.ownerId}: shared ${key}`);
    }
  }
});

test('synergy GM compounding is independent of milestone stacking and the account profile toggle', () => {
  const records = Array.from({length: 10}, (_, i) => ({id: 'a' + i}));
  const S = synthetic(records);
  const members = records.map(h => slot(h.id));
  const result = S.evaluate(members, {snowFort: false, grandMasterStacking: 'add'});
  near(result.style.bonusScale, 2);
  near(result.style.synergyBonusScale, 2.5937424601);
  near(result.style.effectiveMilestoneScale, 3.75);
  near(result.global.style['Milestone Bonus'], 2);
  near(result.global.style['Synergy Bonus'], 2.5937424601);
  near(result.heroes[0].effectiveScales.synergy, 2.5937424601 * 1.157625);

  const withoutProfile = S.evaluate(members, {snowFort: false, accountSynergyBoosts: false, grandMasterStacking: 'add'});
  near(withoutProfile.style.synergyBonusScale, 2.5937424601);
  near(withoutProfile.heroes[0].effectiveScales.accountGlobalSynergy, 1);
  near(withoutProfile.heroes[0].effectiveScales.synergy, 2.5937424601);
  near(withoutProfile.style.effectiveMilestoneScale, result.style.effectiveMilestoneScale);
  const additive = S.evaluate(members, {snowFort: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add'});
  near(additive.style.synergyBonusScale, 2);
  near(additive.style.effectiveMilestoneScale, result.style.effectiveMilestoneScale);
  const milestoneMultiply = S.evaluate(members, {snowFort: false, grandMasterStacking: 'multiply'});
  near(milestoneMultiply.style.bonusScale, 2.5937424601);
  near(milestoneMultiply.heroes[0].effectiveScales.synergy, result.heroes[0].effectiveScales.synergy);

  const gmDisabled = S.evaluate(members, {snowFort: false, grandMaster: false});
  near(gmDisabled.style.count, 0);
  near(gmDisabled.style.bonusScale, 1);
  near(gmDisabled.style.synergyBonusScale, 1);
  near(gmDisabled.heroes[0].effectiveScales.synergy, 1.157625);
  const empty = S.evaluate([], {snowFort: false});
  near(empty.style.count, 0);
  near(empty.style.bonusScale, 1);
  near(empty.style.synergyBonusScale, 1);
});

test('the three global synergy bonuses multiply once and remain separate from manual scale and milestones', () => {
  const S = synthetic([{id: 'militia', milestones: [milestone('Energy Income', 2)], synergies: [
    {index: 1, tier: 8, requires: ['b'], type: 'Energy Income', value: 100, global: true}
  ]}, {id: 'b'}, {id: 'c'}]);
  const members = [slot('militia', 25), slot('b')];
  const settings = {heroSynergyDefault: 25, grandMaster: false, snowFort: false, milestoneScale: 1};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Energy Income'], 145); // ROUND(100 × 1.25 × 1.05³).
  near(result.global.milestone['Energy Income'], 2);
  result.heroes.forEach(h => near(h.metrics.energy, 10147));
  near(S.evaluate([...members, slot('c')], settings).global.synergy['Energy Income'], 145);
  near(S.evaluate(members, {...settings, synergyScale: 2}).global.synergy['Energy Income'], 289);
  near(S.evaluate(members, {...settings, synergyGlobalBonus1: 0}).global.synergy['Energy Income'], 138);
  const disabled = S.evaluate(members, {...settings, accountSynergyBoosts: false});
  near(disabled.global.synergy['Energy Income'], 100);
  near(disabled.global.milestone['Energy Income'], 2);
  near(S.makeScorer(settings, 'energy', members)(members), 10147);
});

test('Snow Fort attack-speed penalty applies once globally and mastery power remains unscored', () => {
  const S = synthetic(Array.from({length: 10}, (_, i) => ({id: 'a' + i})));
  for (const count of [1, 2, 10]) {
    const members = Array.from({length: count}, (_, i) => slot('a' + i));
    const result = S.evaluate(members, {snowFort: true, grandMaster: false});
    near(result.metrics.damage, 0.8);
    near(result.metrics.gold, 1);
    near(result.metrics.energy, 10000);
    near(result.metrics.experience, 1);
    near(result.global.total['Attack Speed'], 0.8);
    near(result.global.map['Mastery Skill Power'], 1.33);
  }
});

test('milestone tile amplifies bonuses emitted by its owner, including global bonuses for teammates', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Energy Income', 10)]}, {id: 'b'}]);
  const ownerBoost = S.evaluate([tiled('a', 'milestone', 25), tiled('b', 'normal')], {milestoneScale: 1, snowFort: true, grandMaster: false});
  const receiverBoost = S.evaluate([tiled('a', 'normal', 25), tiled('b', 'milestone')], {milestoneScale: 1, snowFort: true, grandMaster: false});
  ownerBoost.heroes.forEach(h => near(h.metrics.energy, 10012));
  receiverBoost.heroes.forEach(h => near(h.metrics.energy, 10010));
  near(ownerBoost.global.milestone['Energy Income'], 12);
  const disabled = S.evaluate([tiled('a', 'milestone', 25), tiled('b', 'normal')], {milestoneScale: 1, snowFort: false, grandMaster: false});
  near(disabled.metrics.energy, 10010);
});

test('synergy tile and map and Grand Master scales combine before a single rounding', () => {
  const S = synthetic([{id: 'a', synergies: [
    {index: 1, tier: 5, requires: ['b'], type: 'Energy Income', value: 13, global: true}
  ]}, {id: 'b'}]);
  const settings = {accountSynergyBoosts: false, synergyGrandMasterStacking: 'add', snowFort: true, grandMaster: true, synergyScale: 1.1};
  const result = S.evaluate([tiled('a', 'synergy'), tiled('b', 'normal')], settings);
  // 13 × 1.1 manual × (1.2 Grand Master + .1 tile) × 2.15 map = 39.9685 -> 40.
  near(result.global.synergy['Energy Income'], 40);
  near(result.metrics.energy, 10040);
  const receiver = S.evaluate([tiled('a', 'normal'), tiled('b', 'synergy')], settings);
  near(receiver.global.synergy['Energy Income'], 37);
});

test('ten Grand Masters and owner tiles share one additive milestone or synergy bonus pool', () => {
  const heroes = Array.from({length: 10}, (_, i) => ({id: 'a' + i}));
  heroes[0].milestones = [milestone('Energy Income', 10)];
  heroes[1].synergies = [{index: 1, tier: 5, requires: ['a2'], type: 'Energy Income', value: 10, global: true}];
  const S = synthetic(heroes);
  const members = heroes.map((h, i) => tiled(h.id, i === 0 ? 'milestone' : i === 1 ? 'synergy' : 'normal', 25));
  const result = S.evaluate(members, {milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', snowFort: true, grandMaster: true});
  near(result.heroes[0].effectiveScales.milestone, 2.2);
  near(result.heroes[1].effectiveScales.synergy, 2.1);
  near(result.heroes[1].effectiveScales.tier56, 4.515);
  near(result.global.milestone['Energy Income'], 22);
  near(result.global.synergy['Energy Income'], 45);
  near(result.metrics.energy, 10067);
  near(S.makeScorer({milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', snowFort: true, grandMaster: true}, 'energy', members)(members), 10067);
});

test('confirmed permanent account factors scale milestone values once without rounding or scaling synergies', () => {
  const records = [{id: 'a', milestones: [milestone('Damage', 10, false), milestone('Energy Income', 2),
    milestone('Skill Cooldown', -2, false)], synergies: [
    {index: 1, tier: 1, requires: ['b'], type: 'Damage', value: 10, global: true}
  ]}, {id: 'b'}];
  const originalRecords = JSON.stringify(records);
  const S = synthetic(records);
  const members = [slot('a', 25), slot('b')];
  const settings = {accountSynergyBoosts: false, grandMaster: false, snowFort: false};
  near(S.defaults.milestoneScale, 1.5 * 1.25);
  const result = S.evaluate(members, settings);
  near(result.style.milestoneScale, 1.875);
  near(result.style.effectiveMilestoneScale, 1.875);
  near(result.heroes[0].effectiveScales.milestone, 1.875);
  near(result.effects.find(e => e.kind === 'milestone' && e.type === 'Damage').value, 18.75);
  near(result.heroes[0].local.milestone['Skill Cooldown'], -3.75);
  near(result.global.milestone['Energy Income'], 3.75);
  near(result.metrics.energy, 10003.75);
  near(result.global.synergy.Damage, 1.1);
  near(result.heroes[0].metrics.damage, 1.1 * 1.1875);
  near(result.heroes[1].metrics.damage, 1.1);
  // Repeated evaluations and independent compiled scorers must not mutate/re-scale source data.
  for (let i = 0; i < 3; i++) {
    near(S.evaluate(members, settings).metrics.energy, 10003.75);
    near(S.makeScorer(settings, 'energy', members)(members), 10003.75);
  }
  assert.equal(JSON.stringify(records), originalRecords);
  const raw = S.evaluate(members, {...settings, milestoneScale: 1});
  near(raw.metrics.energy, 10002);
  near(raw.global.synergy.Damage, result.global.synergy.Damage);
});

test('default nine-GM milestone compounding reproduces all seventeen Militia screenshot values', () => {
  const members = D.heroes.slice(0, 9).map(h => tiled(h.id, 'normal', h.id === 'militia' ? 10000 : 0));
  const settings = {maxTier: 0, heroAscensions: {militia: {milestoneLevel: 5}}};
  const result = E.evaluate(members, settings);
  const scale = 6.631727880937506; // 2.8125 permanent × 1.1^9 Grand Masters.
  near(result.style.count, 9);
  near(result.style.bonusScale, 1.1 ** 9);
  near(result.style.effectiveMilestoneScale, scale / 1.5);
  near(result.heroes[0].effectiveScales.milestone, scale);
  const milestones = result.effects.filter(e => e.kind === 'milestone' && e.ownerId === 'militia');
  const displayed = [66, 7, 199, 66, 53, 20, -106, 106, 27, 199, 239, 99, 33, 13, 166, 1990, 2321];
  assert.equal(milestones.length, 17);
  milestones.forEach((effect, i) => {
    near(effect.value, hero('militia').milestones[i].value * scale, `fractional milestone ${effect.level}`);
    const shown = Math.sign(effect.value) * Math.round(Math.abs(effect.value));
    assert.equal(shown, displayed[i], `Militia screenshot milestone ${effect.level}`);
  });
  assert.notEqual(milestones[0].value, displayed[0], 'calculation must retain fractional precision');
  for (const focus of ['energy', 'gold', 'experience', 'damage']) {
    near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `milestone capture ${focus} scorer`);
  }
});

test('milestone GM defaults compound for ten owners, preserve explicit add mode, and handle no GM', () => {
  assert.equal(E.defaults.grandMasterStacking, 'multiply');
  for (const invalid of [undefined, null, 'invalid']) {
    assert.equal(E.settingsFor({grandMasterStacking: invalid}).grandMasterStacking, 'multiply');
  }
  assert.equal(E.settingsFor({}).grandMasterStacking, 'multiply');
  assert.equal(E.settingsFor({grandMasterStacking: 'add'}).grandMasterStacking, 'add');
  const members = D.heroes.slice(0, 10).map(h => tiled(h.id, 'normal', h.id === 'militia' ? 10000 : 0));
  const settings = {maxTier: 0};
  const compound = E.evaluate(members, settings);
  near(compound.style.bonusScale, 2.5937424601);
  near(compound.style.effectiveMilestoneScale, 1.875 * 1.1 ** 10);
  near(compound.heroes[0].effectiveScales.milestone, 1.875 * 1.1 ** 10);
  const additive = E.evaluate(members, {...settings, grandMasterStacking: 'add'});
  near(additive.style.bonusScale, 2);
  near(additive.style.effectiveMilestoneScale, 3.75);
  near(additive.style.synergyBonusScale, compound.style.synergyBonusScale);
  const disabled = E.evaluate(members, {...settings, grandMaster: false});
  near(disabled.style.count, 0);
  near(disabled.style.bonusScale, 1);
  near(disabled.style.effectiveMilestoneScale, 1.875);
  near(disabled.effects.find(e => e.kind === 'milestone' && e.level === 25).value, 18.75);
  const empty = E.evaluate([], settings);
  near(empty.style.count, 0);
  near(empty.style.effectiveMilestoneScale, 1.875);
  const noPermanent = E.evaluate(members, {...settings, milestoneScale: 1});
  near(noPermanent.style.effectiveMilestoneScale, 2.5937424601);
});

test('permanent boosts multiply an explicit additive ten-GM pool plus owner tile exactly once', () => {
  const records = Array.from({length: 10}, (_, i) => ({id: 'a' + i}));
  records[0].milestones = [milestone('Energy Income', 10)];
  const S = synthetic(records);
  const members = records.map((h, i) => tiled(h.id, i === 0 ? 'milestone' : 'normal', 25));
  const settings = {grandMaster: true, snowFort: true, grandMasterStacking: 'add'};
  const result = S.evaluate(members, settings);
  near(result.style.bonusScale, 2);
  near(result.style.effectiveMilestoneScale, 3.75);
  near(result.heroes[0].effectiveScales.milestone, 4.125);
  near(result.heroes[1].effectiveScales.milestone, 3.75);
  near(result.global.milestone['Energy Income'], 41.25);
  result.heroes.forEach(h => near(h.metrics.energy, 10041.25));
  near(result.global.style['Skill Power'], 50);
  near(result.global.style.Damage, 2.5 ** 10);
  near(S.makeScorer(settings, 'energy', members)(members), 10041.25);
  const receiverTile = members.map((s, i) => ({...s, tile: i === 1 ? 'milestone' : 'normal'}));
  near(S.evaluate(receiverTile, settings).global.milestone['Energy Income'], 37.5);
});

test('verified level-10000 milestones unlock inclusively and preserve personal versus global scope', () => {
  const settings = {milestoneScale: 1, maxTier: 0};
  const personalBefore = baseline(E, [slot('militia', 9999), slot('apprentice')], settings);
  const personalAfter = baseline(E, [slot('militia', 10000), slot('apprentice')], settings);
  const personal = personalAfter.effects.find(e => e.ownerId === 'militia' && e.level === 10000);
  assert.ok(personal, 'Militia level-10000 milestone missing');
  assert.equal(personal.type, 'Super Crit Damage');
  assert.equal(personal.global, false);
  near(personal.baseValue, 350);
  assert.equal(personalAfter.counts.milestones, personalBefore.counts.milestones + 1);
  near(personalAfter.heroes[0].metrics.damage / personalBefore.heroes[0].metrics.damage, 4.5);
  near(personalAfter.heroes[1].metrics.damage, personalBefore.heroes[1].metrics.damage);

  const globalBefore = baseline(E, [slot('apprentice', 9999), slot('militia')], settings);
  const globalAfter = baseline(E, [slot('apprentice', 10000), slot('militia')], settings);
  const global = globalAfter.effects.find(e => e.ownerId === 'apprentice' && e.level === 10000);
  assert.ok(global, 'Apprentice level-10000 milestone missing');
  assert.equal(global.type, 'Ultra Crit Damage');
  assert.equal(global.global, true);
  near(global.baseValue, 150);
  assert.equal(globalAfter.counts.milestones, globalBefore.counts.milestones + 1);
  globalAfter.heroes.forEach((h, i) => near(h.metrics.damage / globalBefore.heroes[i].metrics.damage, 2.5));
});

test('hero copies are capped at three, including copies in locked slots', () => {
  assert.equal(E.cleanTeam([slot('militia'), slot('militia'), slot('militia')]).length, 3);
  assert.throws(() => E.cleanTeam([slot('militia', 0, true), slot('militia'), slot('militia'), slot('militia')]), /three|3/i);
  assert.throws(() => E.evaluate([slot('militia'), slot('militia'), slot('militia'), slot('militia')]), /three|3/i);
});

test('distinct boosted tile types each have capacity three, with normal tiles unrestricted', () => {
  const ids = D.heroes.slice(0, 10).map(h => h.id);
  const members = ids.map((id, i) => tiled(id, i < 3 ? 'milestone' : i < 6 ? 'synergy' : i < 9 ? 'skill' : 'normal'));
  assert.equal(E.cleanTeam(members).length, 10);
  assert.throws(() => E.cleanTeam(ids.slice(0, 4).map(id => tiled(id, 'milestone'))), /three|3/i);
  assert.throws(() => E.cleanTeam(ids.slice(0, 4).map(id => tiled(id, 'synergy'))), /three|3/i);
  assert.throws(() => E.cleanTeam(ids.slice(0, 4).map(id => tiled(id, 'skill'))), /three|3/i);
  assert.equal(E.cleanTeam(ids.map(id => tiled(id, 'normal'))).length, 10);
});

test('skill tiles show a local power factor without silently treating it as basic-attack damage', () => {
  const S = synthetic([{id: 'a'}, {id: 'b'}]);
  const result = S.evaluate([tiled('a', 'skill'), tiled('b', 'normal')], {snowFort: true, grandMaster: false});
  near(result.heroes[0].local.placement['Skill Power (tile)'], 1.2);
  assert.equal(result.heroes[1].local.placement['Skill Power (tile)'], undefined);
  near(result.heroes[0].metrics.damage, result.heroes[1].metrics.damage);
});

test('placement optimization finds the hand-calculated owner assignment without moving heroes or levels', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Energy Income', 10)]},
    {id: 'b', synergies: [{index: 1, tier: 1, requires: ['c'], type: 'Energy Income', value: 10, global: true}]},
    {id: 'c'}, {id: 'd'}]);
  const members = [slot('a', 25, true), slot('b'), slot('c', 100), slot('d', 75)];
  const before = JSON.stringify(members);
  const settings = {milestoneScale: 1, accountSynergyBoosts: false, snowFort: true, grandMaster: false};
  near(S.evaluate(members, settings).metrics.energy, 10020);
  const result = S.optimizePlacements(members, settings, 'energy');
  near(result.score, 10023);
  assert.equal(result.team[0].tile, 'milestone');
  assert.equal(result.team[1].tile, 'synergy');
  assert.equal(JSON.stringify(members), before);
  result.team.forEach((s, i) => {
    assert.equal(s.id, members[i].id);
    assert.equal(s.level, members[i].level);
    assert.equal(s.locked, members[i].locked);
  });
});

test('Energy skill tiles preserve primary placements and favor unique XP abilities over proxy bonuses', () => {
  const anchors = [0, 1, 2].map(i => ({id: `m${i}`, milestones: [milestone('Energy Income', 1000)]}));
  const supports = [0, 1, 2].map(i => ({id: `s${i}`, synergies: [
    {index: 1, tier: 1, requires: ['m0'], type: 'Energy Income', value: 1000, global: true}]}));
  const S = synthetic([...anchors, ...supports, {id: 'archer'}, {id: 'ballista'}, {id: 'veteran'},
    {id: 'proxy', milestones: [milestone('Skill Power', 1e6, false)]}]);
  const settings = {milestoneScale: 1, synergyScale: 1, accountSynergyBoosts: false, snowFort: true,
    grandMaster: false, requirementReduction: 0, damageSkills: false, damageSupportSkills: false};
  for (const focus of ['energy', 'powerMageEnergy']) for (const extra of ['veteran', 'proxy']) {
    const members = [...anchors, ...supports, {id: 'archer'}, {id: 'ballista'}, {id: 'veteran'}, {id: extra}]
      .map(h => slot(h.id, 25));
    const before = JSON.stringify(members), result = S.optimizePlacements(members, settings, focus);
    assert.equal(JSON.stringify(members), before);
    assert.deepEqual(Array.from(result.team.slice(0, 3), s => s.tile), ['milestone', 'milestone', 'milestone']);
    assert.deepEqual(Array.from(result.team.slice(3, 6), s => s.tile), ['synergy', 'synergy', 'synergy']);
    assert.deepEqual(Array.from(result.team.filter(s => s.tile === 'skill'), s => s.id).sort(), ['archer', 'ballista', 'veteran']);
    assert.equal(result.team[9].tile, 'normal');
    near(result.score, S.evaluate(result.team, settings).metrics[focus]);
  }
});

test('joint roster and placement optimization satisfies full-team constraints and preserves an eligible incumbent', () => {
  const members = [slot('crusader', 7500, true), slot('militia', 7500), slot('militia', 5000), slot('militia', 3000),
    slot('apprentice', 7500), slot('apprentice', 5000), slot('apprentice', 3000),
    slot('scout', 7500), slot('scout', 5000), slot('scout', 3000)];
  const settings = {snowFort: true, grandMaster: true, damageSupportSkills: false};
  const allowed = ['militia', 'apprentice', 'scout', 'druid'];
  for (const focus of ['energy', 'gold', 'experience', 'damage']) {
    const result = E.optimizeTeam(members, settings, focus, allowed);
    assert.equal(result.team.length, 10);
    const copies = {}, tiles = {};
    result.team.forEach((s, i) => {
      copies[s.id] = (copies[s.id] || 0) + 1;
      tiles[s.tile] = (tiles[s.tile] || 0) + 1;
      assert.equal(s.level, members[i].level);
      if (i === 0) { assert.equal(s.id, 'crusader'); assert.equal(s.locked, true); }
      else assert.ok(allowed.includes(s.id));
    });
    assert.ok(Object.values(copies).every(count => count <= 3));
    assert.equal(tiles.milestone, 3);
    assert.equal(tiles.synergy, 3);
    if (focus === 'gold' || focus === 'damage') {
      assert.equal(tiles[focus === 'gold' ? 'killGold' : 'damage'], 1);
      assert.equal(tiles.normal, 3);
      assert.equal(tiles.skill || 0, 0, 'these heroes have no modeled active skill for this focus');
    } else if (focus === 'experience') {
      assert.equal(tiles.skill || 0, 0, 'unused XP skill tiles remain normal without a named XP skill provider');
      assert.equal(tiles.experience, 1);
      assert.equal(tiles.normal, 3);
    } else {
      const eligibleIds = new Set(result.team.filter(s => s.tile === 'normal' || s.tile === 'skill').map(s => s.id));
      assert.equal(tiles.skill, Math.min(3, eligibleIds.size));
      assert.equal(tiles.normal, 4 - tiles.skill);
      assert.equal(new Set(result.team.filter(s => s.tile === 'skill').map(s => s.id)).size, tiles.skill);
    }
    near(result.score, E.evaluate(result.team, settings).metrics[focus]);
    assert.ok(result.score >= E.evaluate(members, settings).metrics[focus] * (1 - 1e-11));
    const placement = E.optimizePlacements(result.team, settings, focus);
    if (!['gold', 'damage'].includes(focus)) assert.equal(placement.evaluated, 4201);
    else assert.ok(placement.evaluated > 0);
    near(placement.score, result.score, `${focus} final placement optimum`);
  }
  assert.throws(() => E.optimizeTeam(members, settings, 'energy', ['militia', 'apprentice']), /3|three|roster|fill/i);
});

test('compiled scoring matches detailed evaluation across teams, thresholds and settings', () => {
  const focuses = ['energy', 'powerMageEnergy', 'gold', 'experience', 'damage'];
  let seed = 91238;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const members = [[], [slot('sovereign', 3000)], [slot('militia', 25), slot('apprentice', 25)],
    [slot('sovereign', 7500), slot('crusader', 7500), slot('crusader', 7500)],
    [tiled('militia', 'synergy', 7500), tiled('militia', 'milestone', 5000), tiled('arbalest', 'skill', 7500)],
    D.heroes.slice(0, 10).map((h, i) => tiled(h.id, i < 3 ? 'milestone' : i < 6 ? 'synergy' : i < 9 ? 'skill' : 'normal', 7500))];
  members.push([tiled('militia', 'milestone', 10000), tiled('apprentice', 'synergy', 9999),
    tiled('arbalest', 'skill', 10000)]);
  members.push([tiled('warden', 'synergy', 10000), tiled('crusader', 'milestone', 10000),
    slot('militia', 10000), slot('champion', 7500)]);
  const levels = [0, 24, 25, 74, 75, 149, 150, 2500, 3000, 7499, 7500, 9999, 10000];
  for (let n = 0; n < 30; n++) members.push(Array.from({length: 1 + Math.floor(rand() * 10)}, () =>
    slot(D.heroes[Math.floor(rand() * D.heroes.length)].id, levels[Math.floor(rand() * levels.length)])));
  const settings = [{}, {goldSkills: true}, {maxTier: 0, baseEnergy: 0, overflowRate: 0},
    {accountSynergyBoosts: true, synergyGrandMasterStacking: 'multiply'}, {accountSynergyBoosts: false, synergyGrandMasterStacking: 'multiply'},
    {accountSynergyBoosts: true, synergyGrandMasterStacking: 'add', synergyGlobalBonus1: 10, synergyGlobalBonus2: 0, synergyGlobalBonus3: 3.5, grandMaster: true},
    {accountSynergyBoosts: true, synergyGrandMasterStacking: 'multiply', grandMasterStacking: 'multiply', grandMaster: true, synergyGlobalBonus1: 0, synergyGlobalBonus2: 20, synergyGlobalBonus3: 15},
    {accountSynergyBoosts: true, tier12Scale: 3.2, tier34Scale: 1.4, heroSynergyDefault: 70, heroSynergyCrusader: 0, heroSynergyWarden: 30, snowFort: true, grandMaster: true},
    {milestoneScale: E.defaults.milestoneScale}, {milestoneScale: 0},
    {milestoneScale: 1.375, grandMaster: true, snowFort: true},
    {maxTier: 4, synergyScale: 1.157, baseOverflow: 230, baseEnergy: 4, requirementReduction: 0},
    {damageHero: 0, ultraExpMode: 'amount'}, {damageHero: 2, ultraExpMode: 'chance', maxTier: 8},
    {snowFort: false, grandMaster: true}, {snowFort: false, grandMaster: true, maxTier: 7, synergyScale: 1.17, damageHero: 0, baseOverflow: 100},
    {snowFort: true, grandMaster: false}, {snowFort: true, grandMaster: true},
    {snowFort: true, grandMaster: true, mapT56: 75, mapT7: 30, mapAttackSpeed: -10, mapMastery: 40, damageHero: 2, ultraExpMode: 'chance'}];
  for (const t of members) for (const s of settings) for (const focus of focuses) {
    near(E.makeScorer({milestoneScale: 1, accountSynergyBoosts: false, grandMasterStacking: 'add', synergyGrandMasterStacking: 'add', grandMaster: false, snowFort: false, goldSkills: false, damageSkills: false, damageSupportSkills: false, ...s}, focus, t)(t), baseline(E, t, s).metrics[focus], `${focus} parity ${JSON.stringify(s)}`);
  }
});

test('optimizer respects locks, allowed candidates, slot levels and current eligible score', () => {
  const allowed = ['militia', 'apprentice', 'scout', 'druid', 'sovereign'];
  const members = [slot('crusader', 7500, true), slot('militia', 7500), slot('apprentice', 4000), slot('scout', 3000)];
  const before = JSON.stringify(members);
  for (const focus of ['energy', 'gold', 'experience', 'damage']) for (const grandMaster of [false, true]) {
    const settings = {snowFort: false, grandMaster, maxTier: 9, damageHero: 0, baseOverflow: 125};
    const result = E.optimizeTeam(members, settings, focus, allowed);
    assert.equal(JSON.stringify(members), before, 'optimizer mutated caller team');
    assert.equal(result.team[0].id, 'crusader');
    assert.equal(result.team[0].locked, true);
    assert.equal(result.team.length, members.length);
    result.team.forEach((s, i) => {
      assert.equal(s.level, members[i].level);
      if (!s.locked) assert.ok(allowed.includes(s.id));
    });
    near(result.score, E.evaluate(result.team, settings).metrics[focus], `${focus} returned score`);
    assert.ok(result.score >= E.evaluate(members, settings).metrics[focus] * (1 - 1e-11), `${focus} regressed`);
    assert.ok(result.evaluated > 0);
  }
});

test('milestone support includes every hero once and reproduces the captured rank-five global leaders', () => {
  const result = E.rankMilestoneSupport({defaultMilestoneLevel: 5});
  assert.equal(result.level, 15000);
  assert.equal(result.grandMasterCount, 10);
  assert.equal(result.tile, 'normal');
  near(result.milestoneScale, 2.8125 * 1.1 ** 10);
  assert.equal(result.heroes.length, 42);
  assert.equal(new Set(result.heroes.map(h => h.id)).size, D.heroes.length);
  assert.equal(result.warnings.length, 0);
  for (const h of result.heroes) {
    assert.equal(h.effects.length, hero(h.id).milestones.filter(m => m.global && m.level <= 15000).length);
    assert.ok(h.effects.every(e => e.global && e.kind === 'milestone' && e.ownerId === h.id));
  }
  const expected = {energy: ['ninja', 7.8918602268], damage: ['skymage', 1053.014957788],
    gold: ['paladin', 491.077372], experience: ['ranger', 9.9594917333]};
  for (const [focus, [id, value]] of Object.entries(expected)) {
    const leader = result.heroes.filter(h => h.ranks[focus] === 1);
    assert.equal(leader.length, 1);
    assert.equal(leader[0].id, id);
    near(leader[0].multipliers[focus], value, `${focus} independently calculated leader`, 2e-8);
  }
});

test('milestone support unlocks global effects inclusively and excludes personal, synergy and direct context effects', () => {
  const fixture = [{id: 'a', milestones: [milestone('Damage', 10, true, 25),
    milestone('Skill Power', 50, true, 25), milestone('Skill Cooldown', -10, true, 25),
    milestone('Range', 100, true, 25), milestone('Damage', 10000, false, 75),
    milestone('Energy Income', 3, true, 75)],
    synergies: [{index: 1, tier: 1, requires: [], type: 'Damage', value: 10000, global: true}]}];
  const before = JSON.stringify(fixture), S = synthetic(fixture);
  const settings = {milestoneScale: 1, grandMaster: true, snowFort: true,
    mapAttackSpeed: -99, mapMastery: 10000, synergyScale: 100};
  for (const [level, count, damage, energy] of [[24, 0, 1, 10000], [25, 4, 1.1, 10000], [74, 4, 1.1, 10000], [75, 5, 1.1, 10003]]) {
    const h = S.rankMilestoneSupport(settings, {level, grandMasterCount: 0}).heroes[0];
    assert.equal(h.effects.length, count);
    near(h.multipliers.damage, damage);
    near(h.metrics.energy, energy);
    near(h.metrics.gold, 1);
    near(h.multipliers.experience, 1);
    assert.ok(h.effects.every(e => e.global && e.kind === 'milestone'));
    if (count) {
      assert.equal(h.effects.filter(e => e.scored).length, level >= 75 ? 3 : 2);
      assert.equal(h.effects.find(e => e.type === 'Damage').focuses.join(','), 'damage');
      const power = h.effects.find(e => e.type === 'Skill Power');
      assert.equal(power.scored, true);
      assert.deepEqual(Array.from(power.focuses), ['archerExperienceTag', 'hunterGoldTag']);
      assert.equal(h.effects.find(e => e.type === 'Skill Cooldown').focuses.length, 0);
      near(h.bonuses['Skill Power'], 50);
      near(h.bonuses['Skill Cooldown'], -10);
      near(h.bonuses.Range, 2);
      assert.equal(h.bonuses['Attack Speed'], undefined);
      assert.equal(h.bonuses['Mastery Skill Power'], undefined);
    }
  }
  assert.equal(JSON.stringify(fixture), before, 'support ranking mutated source effects');
});

test('milestone support applies the same fixed Grand Master context once to every candidate', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Energy Income', 2)]},
    {id: 'b', milestones: [milestone('Energy Income', 2), milestone('Energy Income', 1000, false)]},
    {id: 'empty'}]);
  for (const stacking of ['multiply', 'add']) for (const count of [0, 3, 10]) {
    const result = S.rankMilestoneSupport({milestoneScale: 1.25, grandMasterStacking: stacking,
      grandMaster: false, snowFort: false}, {grandMasterCount: count, tile: 'milestone'});
    const scale = 1.25 * ((stacking === 'multiply' ? 1.1 ** count : 1 + 0.1 * count) + 0.2);
    near(result.milestoneScale, scale);
    assert.equal(result.grandMasterCount, count);
    assert.equal(result.tile, 'milestone');
    for (const h of result.heroes.slice(0, 2)) {
      near(h.metrics.energy, 10000 + 2 * scale, `${h.id} one amplified contribution`);
      near(h.effects[0].value, 2 * scale, 'fractional milestone is not rounded');
      near(h.effects[0].baseValue, 2);
      assert.equal(h.effects.length, 1);
      near(h.multipliers.damage, 1, 'Grand Master direct damage excluded');
      near(h.metrics.gold, 1, 'Grand Master direct gold excluded');
      assert.equal(h.ranks.energy, 1);
    }
    const empty = result.heroes[2];
    for (const focus of ['energy', 'gold', 'experience', 'damage']) near(empty.multipliers[focus], 1);
    assert.equal(empty.ranks.energy, 3);
  }
});

test('milestone support context is independent of team flags and irrelevant account or map bonuses', () => {
  const options = {level: 15000, grandMasterCount: 9, tile: 'milestone'};
  const neutral = E.rankMilestoneSupport({grandMaster: false, snowFort: false, maxTier: 0,
    accountSynergyBoosts: false, synergyScale: 0, damageHero: null}, options);
  const noisy = E.rankMilestoneSupport({grandMaster: true, snowFort: true, maxTier: 9,
    accountSynergyBoosts: true, synergyScale: 100, synergyGrandMasterStacking: 'add',
    synergyGlobalBonus1: 999, heroSynergyDefault: 999, mapT56: 999, mapT7: 999,
    mapAttackSpeed: 1000, mapMastery: 999, damageHero: 4, requirementReduction: 0}, options);
  assert.equal(JSON.stringify(neutral), JSON.stringify(noisy));
});

test('milestone support normalizes all five metrics against baseline and keeps chance spillover in one pool', () => {
  const S = synthetic([{id: 'a', milestones: [milestone('Damage', 50), milestone('Damage', 50),
    milestone('Crit Chance', 10), milestone('Super Crit Chance', 20), milestone('Ultra Crit Chance', 30),
    milestone('Kill Gold', 100), milestone('Super Gold Amount', 200),
    milestone('Super Gold Chance', 6), milestone('Ultra Gold Chance', 4),
    milestone('Rank Exp', 20), milestone('Rank Exp', 30), milestone('Super Exp Amount', 50),
    milestone('Super Exp Chance', 3), milestone('Ultra Exp Chance', 7),
    milestone('Energy Income', 4), milestone('Super Energy Amount', 50), milestone('Ultra Energy Amount', 100),
    milestone('Super Energy Chance', 10), milestone('Ultra Energy Chance', 10), milestone('Power Mage Energy', 50)]},
    {id: 'neutral'}]);
  const result = S.rankMilestoneSupport({milestoneScale: 1, baseEnergy: 2, baseOverflow: 100, overflowRate: 5},
    {grandMasterCount: 0, xpReference: {rankXp: 100, superChance: 110, ultraChance: 110},
      damageReference: {critChance: 110, superChance: 110, ultraChance: 100}});
  const h = result.heroes[0], neutral = result.heroes[1];
  const expected = {damage: [2, 11.25, 5.625], gold: [2, 15, 7.5],
    experience: [2, 5.625, 2.8125], energy: [4, 54, 13.5], powerMageEnergy: [4, 81, 20.25]};
  for (const [focus, [base, metric, ratio]] of Object.entries(expected)) {
    near(result.baseline[focus], base, `${focus} baseline`);
    near(h.metrics[focus], metric, `${focus} hand outcome`);
    near(h.multipliers[focus], ratio, `${focus} normalized support`);
    near(neutral.metrics[focus], base);
    near(neutral.multipliers[focus], 1);
  }
  near(h.bonuses.Damage, 2.25, 'independent damage factors multiply');
  near(h.overflow.damage, 5, 'all critical chances share the existing overflow pool');
  near(h.overflow.energy, 3, 'all energy chances share the existing overflow pool');
});

test('XP support ranks Apprentice and Necromancer against the captured Rank XP and chance totals', () => {
  const options = {level: 15000, grandMasterCount: 10, tile: 'normal'};
  for (const synergyEvent of [false, true]) {
    const r = E.rankMilestoneSupport({synergyEvent}, options);
    assert.equal(r.xpReference.rankXp, 6.98e12);
    assert.equal(r.xpReference.superChance, 359);
    assert.equal(r.xpReference.ultraChance, 536);
    // Subtract the first 100 points independently for each guaranteed tier.
    near(r.xpReference.excessPoints, (359 - 100) + (536 - 100));
    near(r.baseline.experience, 35.75);
    near(r.xpReference.spilloverFactor, 35.75);

    const scale = 1.875 * 1.1 ** 10 * (synergyEvent ? 1.25 : 1);
    const apprentice = r.heroes.find(h => h.id === 'apprentice');
    const necromancer = r.heroes.find(h => h.id === 'necromancer');
    // These are projected gains on the captured reference, not measured swaps.
    const apprenticeChance = (35.75 + .05 * 7 * scale) / 35.75;
    const necromancerChance = (35.75 + .05 * (7 + 5) * scale) / 35.75;
    near(apprentice.xpFactors.rankXp, 1);
    near(apprentice.xpFactors.superAmount, 1 + 10 * scale / 100);
    near(apprentice.xpFactors.ultraAmount, 1);
    near(apprentice.xpFactors.spillover, apprenticeChance);
    near(necromancer.xpFactors.rankXp, 1 + 12 * scale / 6.98e12);
    near(necromancer.xpFactors.spillover, necromancerChance);
    near(apprentice.multipliers.experience, (1 + 10 * scale / 100) * apprenticeChance);
    near(necromancer.multipliers.experience, (1 + 12 * scale / 6.98e12) * necromancerChance);
    near(apprentice.metrics.experience, 35.75 * apprentice.multipliers.experience);
    assert.ok(apprentice.ranks.experience < necromancer.ranks.experience);
  }
});

test('editing the XP reference dilutes flat Rank XP and chance while keeping independent amount bonuses', () => {
  const S = synthetic([{id: 'mentor', milestones: [milestone('Rank Exp', 50), milestone('Super Exp Chance', 6),
    milestone('Ultra Exp Chance', 14), milestone('Super Exp Amount', 50), milestone('Super Exp Amount', 20),
    milestone('Ultra Exp Amount', 100), milestone('Rank Exp', 99999, false)]}, {id: 'neutral'}]);
  const settings = {milestoneScale: 1, overflowRate: 5, baseOverflow: 2400};
  const score = xpReference => S.rankMilestoneSupport(settings, {grandMasterCount: 0, xpReference});
  const fresh = score({rankXp: 100, superChance: 100, ultraChance: 100});
  const current = score({rankXp: 10000, superChance: 359, ultraChance: 536});
  const emptyReference = fresh.heroes[0], largeReference = current.heroes[0];
  near(emptyReference.xpFactors.rankXp, 1.5);
  near(largeReference.xpFactors.rankXp, 1.005);
  near(emptyReference.xpFactors.spillover, 2);
  near(largeReference.xpFactors.spillover, 36.75 / 35.75);
  near(largeReference.overflow.experience, 36.75);
  for (const h of [emptyReference, largeReference]) {
    near(h.xpFactors.superAmount, 1.5 * 1.2);
    near(h.xpFactors.ultraAmount, 2);
  }
  near(emptyReference.multipliers.experience, 1.5 * 2 * 1.5 * 1.2 * 2);
  near(largeReference.multipliers.experience, 1.005 * (36.75 / 35.75) * 1.5 * 1.2 * 2);
  near(current.heroes[1].multipliers.experience, 1);
  assert.ok(largeReference.multipliers.experience < emptyReference.multipliers.experience);
  // The configured generic spillover still affects other outcomes and team
  // scoring. Editing a ranking reference never changes these values.
  for (const focus of ['damage', 'damageWithSupport', 'gold', 'energy', 'powerMageEnergy']) {
    assert.equal(current.baseline[focus], fresh.baseline[focus]);
    for (const key of ['metrics', 'multipliers', 'ranks']) assert.equal(largeReference[key][focus], emptyReference[key][focus]);
  }
  near(current.baseline.gold, 25);
  const members = [slot('mentor', 25)], teamSettings = {...settings, grandMaster: false, snowFort: false, experienceHero: 0};
  const team = S.evaluate(members, teamSettings);
  const expectedTeam = (1 + (50 + 99999) / 100) * 1.5 * 1.2 * 2 * 26;
  near(team.metrics.experience, expectedTeam, 'existing team XP formula');
  near(S.makeScorer(teamSettings, 'experience', members)(members), expectedTeam, 'team scorer');
});

test('XP ranking pools both chance tiers once using the selected rate and excludes the generic baseOverflow', () => {
  const S = synthetic([{id: 'split', milestones: [milestone('Super Exp Chance', 5), milestone('Ultra Exp Chance', 15)]},
    {id: 'combined', milestones: [milestone('Ultra Exp Chance', 20)]}, {id: 'amount', milestones: [milestone('Ultra Exp Amount', 10)]}]);
  for (const rate of [0, 5, 10]) for (const baseOverflow of [0, 50000]) {
    const r = S.rankMilestoneSupport({milestoneScale: 1, overflowRate: rate, baseOverflow}, {grandMasterCount: 0});
    const before = 1 + 695 * rate / 100, after = 1 + 715 * rate / 100;
    near(r.baseline.experience, before);
    for (const h of r.heroes.slice(0, 2)) {
      near(h.metrics.experience, after);
      near(h.multipliers.experience, after / before);
    }
    assert.equal(r.heroes[0].ranks.experience, r.heroes[1].ranks.experience);
    near(r.heroes[2].multipliers.experience, 1.1);
  }
});

test('the XP reference safely recovers invalid input and uses only chance above each tier cap', () => {
  const S = synthetic([{id: 'support', milestones: [milestone('Super Exp Chance', 20)]}]);
  const run = xpReference => S.rankMilestoneSupport({milestoneScale: 1, overflowRate: 5}, {grandMasterCount: 0, xpReference});
  const atCap = run({rankXp: 0, superChance: 10, ultraChance: '120.5'});
  near(atCap.xpReference.rankXp, 1);
  near(atCap.xpReference.superChance, 100);
  near(atCap.xpReference.ultraChance, 120.5);
  near(atCap.xpReference.excessPoints, 20.5);
  near(atCap.heroes[0].multipliers.experience, (1 + 40.5 * .05) / (1 + 20.5 * .05));
  const invalid = run({rankXp: Infinity, superChance: ' ', ultraChance: null}).xpReference;
  assert.equal(invalid.rankXp, 6.98e12);
  assert.equal(invalid.superChance, 359);
  assert.equal(invalid.ultraChance, 536);
  const bounded = run({rankXp: 1e200, superChance: 1e20, ultraChance: NaN}).xpReference;
  assert.equal(bounded.rankXp, 1e100);
  assert.equal(bounded.superChance, 1e9);
  assert.equal(bounded.ultraChance, 536);
});

test('splitting chance across tiers preserves support and overflow has a smaller marginal benefit on a larger baseline', () => {
  const S = synthetic([{id: 'split', milestones: [milestone('Crit Chance', 10), milestone('Super Crit Chance', 20),
    milestone('Ultra Crit Chance', 30)]}, {id: 'combined', milestones: [milestone('Crit Chance', 60)]}]);
  for (const [critChance, expected] of [[100, 4], [120, 2.5], [200, 1.5]]) {
    const result = S.rankMilestoneSupport({milestoneScale: 1, overflowRate: 5},
      {grandMasterCount: 0, damageReference: {critChance, superChance: 100, ultraChance: 100}});
    for (const h of result.heroes) {
      near(h.multipliers.damage, expected);
      assert.equal(h.ranks.damage, 1);
    }
  }
});

test('milestone support uses competition ranks and tolerates floating-point equivalent products', () => {
  const S = synthetic([{id: 'product', milestones: [milestone('Damage', 10), milestone('Damage', 20)]},
    {id: 'single', milestones: [milestone('Damage', 32)]},
    {id: 'noise', milestones: [milestone('Damage', 32 + 1e-8)]},
    {id: 'lower', milestones: [milestone('Damage', 31.9)]}]);
  const result = S.rankMilestoneSupport({milestoneScale: 1}, {grandMasterCount: 0});
  for (const h of result.heroes.slice(0, 3)) assert.equal(h.ranks.damage, 1);
  assert.equal(result.heroes[3].ranks.damage, 4);
  for (const h of result.heroes) for (const focus of ['gold', 'energy', 'experience']) {
    near(h.multipliers[focus], 1);
    assert.equal(h.ranks[focus], 1);
  }
});

test('zero baseline energy is explicitly unranked while raw energy outcomes remain available', () => {
  const S = synthetic([{id: 'income', milestones: [milestone('Energy Income', 5)]},
    {id: 'amount', milestones: [milestone('Super Energy Amount', 100)]}, {id: 'empty'}]);
  const result = S.rankMilestoneSupport({milestoneScale: 1, baseEnergy: 0, baseOverflow: 100}, {grandMasterCount: 0});
  near(result.baseline.energy, 0);
  near(result.heroes[0].metrics.energy, 10);
  near(result.heroes[1].metrics.energy, 0);
  for (const h of result.heroes) {
    assert.equal(h.multipliers.energy, null);
    assert.equal(h.ranks.energy, null);
    assert.equal(h.multipliers.powerMageEnergy, null);
    assert.equal(h.ranks.powerMageEnergy, null);
    near(h.multipliers.damage, 1);
    assert.equal(h.ranks.damage, 1);
  }
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /energy.*zero baseline.*undefined/i);
  assert.match(result.warnings[1], /Energy \+ Power Mages.*zero baseline.*undefined/);
});

test('Power Mage milestone support has its own ranking and includes wave energy support', () => {
  const S = synthetic([{id: 'mage', milestones: [milestone('Power Mage Energy', 100)]},
    {id: 'wave', milestones: [milestone('Super Energy Amount', 50)]}, {id: 'neutral'}]);
  const result = S.rankMilestoneSupport({milestoneScale: 1}, {grandMasterCount: 0});
  const mage = result.heroes.find(h => h.id === 'mage'), wave = result.heroes.find(h => h.id === 'wave');
  near(result.baseline.powerMageEnergy, 10000);
  near(mage.multipliers.powerMageEnergy, 2);
  near(mage.multipliers.energy, 1);
  near(wave.multipliers.powerMageEnergy, 1.5);
  assert.equal(mage.ranks.powerMageEnergy, 1);
  assert.equal(wave.ranks.energy, 1);
  assert.equal(mage.effects[0].focuses.join(','), 'powerMageEnergy');
  assert.equal(wave.effects[0].focuses.join(','), 'energy,powerMageEnergy');
  assert.ok(mage.effects[0].scored);
});

test('milestone support safely bounds independent controls and preserves source unit and review metadata', () => {
  const S = synthetic([{id: 'a', milestones: [{...milestone('Energy Income', 2), unit: 'flat',
    source: 'capture', confidence: 'inferred-calibrated'}]}]);
  const bounded = S.rankMilestoneSupport({milestoneScale: 1}, {level: -100, grandMasterCount: 99, tile: 'synergy'});
  assert.equal(bounded.level, 0);
  assert.equal(bounded.grandMasterCount, 10);
  assert.equal(bounded.tile, 'normal');
  assert.equal(bounded.heroes[0].effects.length, 0);
  const recovered = S.rankMilestoneSupport({milestoneScale: 1}, {level: 'invalid', grandMasterCount: -1, tile: 'invalid'});
  assert.equal(recovered.level, 15000);
  assert.equal(recovered.grandMasterCount, 0);
  const effect = recovered.heroes[0].effects[0];
  assert.equal(effect.unit, 'flat');
  assert.equal(effect.source, 'capture');
  assert.equal(effect.confidence, 'inferred-calibrated');
  assert.equal(effect.focuses.join(','), 'energy,powerMageEnergy');
  assert.equal(effect.scored, true);
  near(effect.value, 2);
});

test('optimizer replaces excluded unlocked heroes but preserves excluded locked heroes', () => {
  const members = [slot('sovereign', 7500, true), slot('titan', 5000)];
  const result = E.optimizeTeam(members, {snowFort: false, grandMaster: false}, 'energy', ['militia']);
  assert.equal(result.team[0].id, 'sovereign');
  assert.equal(result.team[1].id, 'militia');
  const locked = E.optimizeTeam([slot('titan', 7500, true)], {snowFort: false, grandMaster: false}, 'damage', []);
  assert.equal(locked.team[0].id, 'titan');
  assert.throws(() => E.optimizeTeam([slot('titan')], {snowFort: false, grandMaster: false}, 'damage', []), /candidate/);
  assert.throws(() => E.optimizeTeam([], {snowFort: false, grandMaster: false}, 'energy'), /at least one hero/);
});

test('synergy event is opt-in and requires an explicit boolean setting', () => {
  assert.equal(E.defaults.synergyEvent, false);
  assert.equal(E.settingsFor({synergyEvent: true}).synergyEvent, true);
  for (const value of [undefined, null, false, 0, 1, '', 'true', 'false']) {
    assert.equal(E.settingsFor({synergyEvent: value}).synergyEvent, false);
  }
  const members = [slot('hunter', 15000), slot('rogue', 15000), slot('crusader', 15000)];
  const baselineResult = E.evaluate(members, {goldHero: 0});
  const enabled = E.evaluate(members, {goldHero: 0, synergyEvent: true});
  const restored = E.evaluate(members, {goldHero: 0, synergyEvent: false});
  assert.ok(enabled.metrics.gold > baselineResult.metrics.gold);
  assert.equal(JSON.stringify(restored), JSON.stringify(baselineResult));
  near(enabled.style.eventMilestoneScale, 1.25);
  near(enabled.style.eventSynergyScale, 1.1);
  near(restored.style.eventMilestoneScale, 1);
  near(restored.style.eventSynergyScale, 1);
});

test('event factors multiply outside the Grand Master and owner tile pools once', () => {
  const records = Array.from({length: 10}, (_, i) => ({id: 'a' + i}));
  records[0].milestones = [milestone('Energy Income', 2.5)];
  records[1].synergies = [{index: 1, tier: 5, requires: ['a2'], type: 'Energy Income', value: 13, global: true}];
  const S = synthetic(records);
  const members = records.map((h, i) => tiled(h.id, i === 0 ? 'milestone' : i === 1 ? 'synergy' : 'normal', 25));
  for (const stacking of ['multiply', 'add']) {
    const settings = {synergyEvent: true, grandMasterStacking: stacking, synergyGrandMasterStacking: stacking};
    const result = S.evaluate(members, settings);
    const pool = stacking === 'multiply' ? Math.pow(1.1, 10) : 2;
    const milestoneScale = 1.875 * 1.25 * (pool + .2);
    const synergyScale = 1.1 * (pool + .1) * Math.pow(1.05, 3);
    near(result.style.milestoneScale, 1.875, 'permanent milestone scale is preserved');
    near(result.style.effectiveMilestoneScale, 1.875 * pool * 1.25);
    near(result.style.effectiveSynergyScale, pool * 1.1);
    near(result.heroes[0].effectiveScales.milestone, milestoneScale);
    near(result.heroes[1].effectiveScales.synergy, synergyScale);
    near(result.global.milestone['Energy Income'], 2.5 * milestoneScale);
    near(result.global.synergy['Energy Income'], Math.round(13 * synergyScale * 2.15));
    near(result.global.style['Kill Gold'], Math.pow(2.5, 10), 'direct style bonuses are not event amplified');
    near(result.global.map['Attack Speed'], .8, 'direct map effects are not event amplified');
    near(result.heroes[0].bonuses['Milestone Bonus'], pool + .2);
    near(S.makeScorer(settings, 'energy', members)(members), result.metrics.energy);
  }
});

test('event strength combines with owner and all tier factors before synergy rounding', () => {
  const records = ['crusader', 'warden', 'other'].map(id => ({id, synergies: Array.from({length: 9}, (_, i) =>
    ({index: i + 1, tier: i + 1, requires: ['partner'], type: 'Energy Income', value: 13, global: true}))}));
  const S = synthetic([...records, {id: 'partner'}]);
  const members = [...records.map(h => tiled(h.id, 'synergy')), slot('partner')];
  const settings = {synergyEvent: true, synergyScale: 1.17, heroSynergyDefault: 25, heroSynergyCrusader: 15};
  const result = S.evaluate(members, settings);
  for (const effect of result.effects.filter(e => e.kind === 'synergy')) {
    const owner = effect.ownerId === 'crusader' ? 1.15 : effect.ownerId === 'warden' ? 1 : 1.25;
    const tier = effect.tier <= 2 ? 6.25 : effect.tier <= 4 ? 2.5 : effect.tier <= 6 ? 2.15 : effect.tier === 7 ? 1.77 : 1;
    const expected = Math.round(13 * 1.17 * 1.1 * (Math.pow(1.1, 4) + .1) * owner * Math.pow(1.05, 3) * tier);
    near(effect.value, expected, `${effect.ownerId} tier ${effect.tier}`);
  }
  near(S.makeScorer(settings, 'energy', members)(members), result.metrics.energy);
});

test('event amplifies the selected gold attacker without leaking supports personal effects', () => {
  const S = synthetic([{id: 'attacker', milestones: [milestone('Kill Gold', 100, false)], synergies: [
    {index: 1, tier: 1, requires: ['support'], type: 'Super Gold Amount', value: 100, global: false}]},
  {id: 'support', milestones: [milestone('Kill Gold', 100000, false)], synergies: [
    {index: 1, tier: 1, requires: ['attacker'], type: 'Boss Gold', value: 100, global: true},
    {index: 2, tier: 1, requires: ['attacker'], type: 'Ultra Gold Amount', value: 1000, global: false}]}]);
  const members = [slot('attacker', 25), slot('support', 25)];
  const settings = {milestoneScale: 1, grandMaster: false, snowFort: false, accountSynergyBoosts: false,
    synergyEvent: true, goldHero: 0};
  const result = S.evaluate(members, settings);
  near(result.metrics.gold, 2.25 * 2.1 * 2.1);
  near(result.heroes[0].bonuses['Kill Gold'], 2.25);
  assert.equal(result.heroes[0].bonuses['Ultra Gold Amount'], undefined);
  assert.equal(result.goldIndex, 0);
  near(S.makeScorer(settings, 'gold', members)(members), result.metrics.gold);
  const normal = S.evaluate(members, {...settings, synergyEvent: false});
  near(normal.metrics.gold, 2 * 2 * 2);
});

test('support rankings include the event milestone factor and retain the base energy income', () => {
  const S = synthetic([{id: 'support', milestones: [milestone('Energy Income', 10), milestone('Kill Gold', 100),
    milestone('Kill Gold', 100000, false)]}]);
  for (const tile of ['normal', 'milestone']) {
    const options = {level: 25, grandMasterCount: 10, tile};
    const off = S.rankMilestoneSupport({synergyEvent: false}, options);
    const on = S.rankMilestoneSupport({synergyEvent: true}, options);
    near(on.milestoneScale, off.milestoneScale * 1.25);
    near(on.baseline.energy, 10000);
    near(on.heroes[0].metrics.energy, 10000 + 10 * on.milestoneScale);
    near(on.heroes[0].metrics.gold, 1 + on.milestoneScale);
    assert.equal(on.heroes[0].effects.length, 2, 'personal milestones remain excluded');
  }
});

test('event scorer matches evaluation for all focuses and attacker modes', () => {
  const members = [tiled('hunter', 'milestone', 15000), tiled('rogue', 'synergy', 7500),
    tiled('crusader', 'skill', 5000), tiled('sovereign', 'normal', 15000), tiled('scout', 'synergy', 10000)];
  for (const target of [0, 2, 'best']) for (const grandMaster of [false, true]) {
    const settings = {synergyEvent: true, grandMaster, damageHero: target, goldHero: target, experienceHero: 0};
    const result = E.evaluate(members, settings);
    for (const focus of ['gold', 'damage', 'experience', 'energy', 'powerMageEnergy']) {
      near(E.makeScorer(settings, focus, members)(members), result.metrics[focus], `${focus} ${target} ${grandMaster}`);
    }
  }
});

test('event team search can change the best gold attacker and returns the same evaluated score', () => {
  const S = synthetic([{id: 'milestones', milestones: [milestone('Kill Gold', 100, false), milestone('Super Gold Amount', 100, false)]},
    {id: 'synergies', synergies: [{index: 1, tier: 1, requires: ['partner'], type: 'Kill Gold', value: 320, global: false}]},
    {id: 'partner'}, {id: 'empty'}]);
  const members = [slot('synergies', 25), slot('empty', 25)];
  const config = {milestoneScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false, goldHero: 'best'};
  const normal = S.optimizeTeam(members, {...config, synergyEvent: false}, 'gold');
  const event = S.optimizeTeam(members, {...config, synergyEvent: true}, 'gold');
  assert.equal(normal.team[normal.goldIndex].id, 'synergies');
  assert.equal(event.team[event.goldIndex].id, 'milestones');
  near(normal.score, 4.2);
  near(event.score, 2.25 * 2.25);
  near(event.score, S.evaluate(event.team, {...config, synergyEvent: true}).metrics.gold);
  const tileSettings = {...config, snowFort: true, synergyEvent: true, goldHero: 0};
  const placements = S.optimizePlacements([slot('milestones', 25), slot('partner', 25)], tileSettings, 'gold');
  near(placements.score, S.evaluate(placements.team, tileSettings).metrics.gold);
  assert.equal(placements.team[0].tile, 'killGold');
  near(placements.score, 2.25 * 2.25 * 25.75);
});

test('Crusader and Hunter start at zero and honor explicit account bonus overrides', () => {
  const records = ['crusader', 'hunter'].map(id => ({id, synergies: [
    {index: 1, tier: 8, requires: ['partner'], type: 'Energy Income', value: 100, global: true}]}));
  const S = synthetic([...records, {id: 'partner'}]);
  const members = team('crusader', 'hunter', 'partner');
  const settings = {snowFort: false, grandMaster: false, synergyGlobalBonus1: 0, synergyGlobalBonus2: 0, synergyGlobalBonus3: 0};
  assert.equal(S.defaults.heroSynergyCrusader, 0);
  const current = S.evaluate(members, settings);
  near(current.heroes[0].effectiveScales.ownerSynergy, 1);
  near(current.heroes[1].effectiveScales.ownerSynergy, 1);
  near(current.global.synergy['Energy Income'], 200);
  const historical = S.evaluate(members, {...settings, heroSynergyCrusader: 15});
  near(historical.heroes[0].effectiveScales.ownerSynergy, 1.15);
  near(historical.global.synergy['Energy Income'], 215);
  const event = S.evaluate(members, {...settings, synergyEvent: true});
  near(event.heroes[0].effectiveScales.synergy, 1.1);
  near(event.global.synergy['Energy Income'], 220);
});

test('ten-GM event reproduces the new Hunter and Rogue gold screenshot values', () => {
  const members = team('hunter', 'rogue', 'praetorian', 'scout', 'paladin', 'sovereign', 'crusader', 'elementalist', 'militia', 'sniper');
  const result = E.evaluate(members, {heroSynergyDefault: 25, heroSynergyCrusader: 25, synergyEvent: true, requirementReduction: 0, goldHero: 0});
  for (const [id, index, value, global] of [
    ['hunter', 14, 14615, false], ['rogue', 15, 3303, true],
    ['hunter', 16, 13418, true], ['rogue', 16, 13418, true], ['crusader', 16, 826, false]
  ]) {
    const effect = result.effects.find(e => e.kind === 'synergy' && e.ownerId === id && e.index === index);
    assert.ok(effect, `${id} ${index} active`);
    assert.equal(effect.value, value, `${id} ${index} displayed magnitude`);
    assert.equal(effect.global, global, `${id} ${index} scope`);
  }
  near(E.makeScorer({heroSynergyDefault: 25, heroSynergyCrusader: 25, synergyEvent: true, requirementReduction: 0, goldHero: 0}, 'gold', members)(members), result.metrics.gold);
});

test('all archived capture effects match their recorded contexts including partial pages and repeated portraits', () => {
  let checked = 0, expected = 0;
  const captures = captureFiles.map(name => ({name, capture: JSON.parse(fs.readFileSync(path.join(captureDirectory, name), 'utf8'))}));
  for (const {name, capture} of captures) {
    const context = capture.meta.context, settings = captureSettings(capture);
    assert.equal(capture.groups.length, capture.meta.groupsCount);
    assert.ok(capture.groups.length > 0 && capture.groups.length <= 16);
    assert.ok(Number.isInteger(context.grandMasterCount) && context.grandMasterCount > 0 && context.grandMasterCount <= 10);
    const observedCount = capture.groups.reduce((count, group) => count + group.effects.length, 0);
    assert.equal(observedCount, capture.meta.effectsCount);
    expected += observedCount;
    if (settings.synergyEvent) {
      assert.equal(context.synergyEvent.milestoneBonusPercent, 25);
      assert.equal(context.synergyEvent.synergyBonusPercent, 10);
    }
    for (const group of capture.groups) {
      const required = group.requiredHeroes.map(h => h.id);
      const ids = [...required, ...D.heroes.map(h => h.id).filter(id => !required.includes(id))]
        .slice(0, context.grandMasterCount);
      // Unspecified placement is tested under the archived off-synergy-tile model.
      const members = ids.map(id => tiled(id, context.ownerTiles?.[id] || 'normal', 0));
      const targets = {damageHero: 0, goldHero: 0, experienceHero: 0};
      const result = E.evaluate(members, {...settings, ...targets});
      assert.equal(result.style.count, context.grandMasterCount);
      assert.equal(result.counts.milestones, 0, 'hero rank badges are not run levels');
      near(result.style.eventMilestoneScale, settings.synergyEvent ? 1.25 : 1);
      near(result.style.eventSynergyScale, settings.synergyEvent ? 1.1 : 1);
      const groupKey = [...required].sort().join('|');
      for (const observed of group.effects) {
        const records = hero(observed.ownerId).synergies.filter(effect => effect.tier === group.tier &&
          [observed.ownerId, ...effect.requires].sort().join('|') === groupKey);
        const label = `${name} ${group.id} / ${observed.ownerId}`;
        assert.equal(records.length, 1, `${label} unique source effect`);
        const emissions = result.effects.filter(effect => effect.kind === 'synergy' &&
          effect.ownerId === observed.ownerId && effect.index === records[0].index);
        assert.equal(emissions.length, required.filter(id => id === observed.ownerId).length, `${label} one emission per deployed owner copy`);
        assert.ok(emissions.every(effect => effect.value === emissions[0].value && effect.global === emissions[0].global), `${label} duplicate owners emit equal off-tile effects`);
        const actual = emissions[0];
        assert.equal(members[actual.ownerIndex].id, observed.ownerId, `${label} emitting hero`);
        assert.equal(actual.type, observed.type, `${label} effect type`);
        assert.equal(actual.global, observed.global, `${label} scope`);
        assert.equal(actual.value, observed.signedValue, `${label} signed value`);
        assert.equal(Math.abs(actual.value), observed.displayedValue, `${label} displayed magnitude`);
        assert.equal(Math.sign(actual.value), Math.sign(observed.signedValue), `${label} sign`);
        if (actual.unit !== undefined) assert.equal(actual.unit, observed.unit, `${label} unit`);
        checked++;
      }
      for (const focus of ['energy', 'powerMageEnergy', 'gold', 'experience', 'damage']) {
        near(E.makeScorer({...settings, ...targets}, focus, members)(members), result.metrics[focus], `${group.id} ${focus} parity`);
      }
    }
  }
  assert.ok(checked >= 688, 'retain all sixteen earlier capture batches');
  assert.equal(checked, expected);
});

test('new Apprentice Scout Viking and Druid captures retain their confirmed nine-GM event context', () => {
  const selected = new Set();
  let effects = 0;
  for (const number of ['13', '14', '15', '16']) {
    const capture = JSON.parse(fs.readFileSync(path.join(captureDirectory, `batch-${number}.json`), 'utf8'));
    selected.add(capture.meta.selectedHero.id);
    assert.equal(capture.meta.context.grandMasterCount, 9);
    assert.equal(capture.meta.context.synergyEvent.enabled, true);
    assert.equal(capture.meta.context.otherSynergyModifiers.ownerSynergyBonusPercent.crusader, 25);
    assert.equal(capture.groups.length, 16);
    effects += capture.groups.reduce((count, group) => count + group.effects.length, 0);
  }
  assert.deepEqual([...selected].sort(), ['apprentice', 'druid', 'scout', 'viking']);
  assert.equal(effects, 172);
});

test('corrected Skymage gold and Apprentice damage apply globally to the selected attacker', () => {
  const S = synthetic([{id: 'skymage', synergies: [synergy('skymage', 3)]},
    {id: 'apprentice', synergies: [synergy('apprentice', 4)]},
    {id: 'elementalist'}, {id: 'sniper'}, {id: 'attacker'}]);
  const members = team('attacker', 'skymage', 'apprentice', 'elementalist', 'sniper');
  const settings = {grandMaster: false, accountSynergyBoosts: false, snowFort: false,
    requirementReduction: 0, goldHero: 0, damageHero: 0, damageSupportSkills: false};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Kill Gold'], 1.4);
  near(result.global.synergy.Damage, 1.6);
  for (const recipient of result.heroes) {
    near(recipient.metrics.gold, 1.4, `${recipient.id} global gold`);
    near(recipient.metrics.damage, 1.6, `${recipient.id} global damage`);
  }
  near(result.metrics.gold, 1.4);
  near(S.makeScorer(settings, 'gold', members)(members), 1.4);
  near(S.makeScorer(settings, 'damage', members)(members), 1.6);
  near(S.evaluate(members.filter(member => member.id !== 'skymage'), settings).metrics.gold, 1);
});

test('corrected Arbalest income and Chieftain energy amount increase wave energy without chance spillover', () => {
  const S = synthetic([{id: 'arbalest', synergies: [synergy('arbalest', 4)]},
    {id: 'chieftain', synergies: [synergy('chieftain', 7)]},
    {id: 'viking'}, {id: 'assassin'}, {id: 'druid'}, {id: 'attacker'}]);
  const members = team('attacker', 'arbalest', 'chieftain', 'viking', 'assassin', 'druid');
  const settings = {grandMaster: false, accountSynergyBoosts: false, snowFort: false,
    requirementReduction: 0, damageHero: 0, goldHero: 0, baseEnergy: 10000, damageSupportSkills: false};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Energy Income'], 1);
  near(result.global.synergy['Super Energy Amount'], 1.02);
  assert.equal(result.global.synergy['Super Energy Chance'], undefined);
  for (const recipient of result.heroes) {
    near(recipient.metrics.energy, 10201.02);
    near(recipient.overflow.energy, 1);
    near(recipient.metrics.damage, 1, 'removed personal Crit Damage stays removed');
  }
  near(S.makeScorer(settings, 'energy', members)(members), 10201.02);
  near(S.evaluate(members.filter(member => member.id !== 'druid'), settings).metrics.energy, 10001);
});

test('new Peacekeeper and Forester experience effects reach the leveling attacker without the obsolete damage bonus', () => {
  const S = synthetic([{id: 'peacekeeper', synergies: [synergy('peacekeeper', 6)]},
    {id: 'forester', synergies: [synergy('forester', 6)]}, {id: 'berserker'}, {id: 'attacker'}]);
  const members = team('attacker', 'peacekeeper', 'forester', 'berserker');
  const settings = {grandMaster: false, accountSynergyBoosts: false, snowFort: false,
    requirementReduction: 0, experienceHero: 0, damageHero: 0};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Super Exp Chance'], 1);
  near(result.global.synergy['Super Exp Amount'], 1.03);
  assert.equal(result.global.synergy.Damage, undefined);
  assert.equal(result.heroes.find(hero => hero.id === 'peacekeeper').local.synergy['Skill Duration'], undefined);
  for (const recipient of result.heroes) {
    near(recipient.metrics.experience, 1.03 * 1.05);
    near(recipient.overflow.experience, 1.05);
    near(recipient.metrics.damage, 1);
  }
  near(S.makeScorer(settings, 'experience', members)(members), 1.03 * 1.05);
  near(S.evaluate(members.filter(member => member.id !== 'berserker'), settings).metrics.experience, 1);
});

test('full and partial event screenshots preserve their actual tier coverage and continuing nine-GM profile', () => {
  const expected = [
    ['17', 'sorcerer', 16, 43, [1,2,3,4,5,6,7,8,9]],
    ['18', 'ranger', 16, 43, [1,2,3,4,5,6,7,8,9]],
    ['19', 'warlord', 16, 43, [1,2,3,4,5,6,7,8,9]],
    ['20', 'samurai', 16, 43, [1,2,3,4,5,6,7,8,9]],
    ['21', 'peacekeeper', 6, 15, [1,2,3]],
    ['22', 'arbalest', 5, 14, [6,7,8]],
    ['27', 'archer', 6, 15, [4,5,6]],
    ['28', 'assassin', 6, 15, [4,5,6]],
    ['29', 'crusader', 6, 15, [1,2,3]],
    ['30', 'champion', 6, 15, [4,5,6]],
    ['31', 'wizard', 12, 30, [1,2,3,5,6,7]],
    ['32', 'berserker', 12, 30, [1,2,3,4,5,6]],
    ['33', 'necromancer', 11, 29, [1,2,3,6,7,8]],
    ['34', 'peacekeeper', 6, 15, [5,6,7]],
    ['35', 'skymage', 6, 15, [4,5,6]],
    ['36', 'witch', 6, 15, [1,2,3]]
  ];
  let observations = 0;
  for (const [batch, selected, groupCount, effectCount, tiers] of expected) {
    const capture = JSON.parse(fs.readFileSync(path.join(captureDirectory, `batch-${batch}.json`), 'utf8'));
    assert.equal(capture.meta.selectedHero.id, selected);
    assert.equal(capture.groups.length, groupCount);
    const count = capture.groups.reduce((total, group) => total + group.effects.length, 0);
    assert.equal(count, effectCount);
    observations += count;
    assert.deepEqual([...new Set(capture.groups.map(group => group.tier))], tiers);
    assert.equal(capture.meta.context.grandMasterCount, 9);
    assert.equal(capture.meta.context.synergyEvent.enabled, true);
    assert.equal(capture.meta.context.otherSynergyModifiers.ownerSynergyBonusPercent.crusader, 25);
  }
  assert.equal(observations, 395);
});

test('Paladin final bare energy label is an amount multiplier without chance spillover', () => {
  const effect = synergy('paladin', 8);
  assert.equal(effect.type, 'Super Energy Amount');
  assert.equal(effect.value, 4);
  assert.equal(effect.global, true);
  assert.equal(effect.unit, 'percent');
  assert.equal(D.heroes.flatMap(hero => hero.synergies).filter(synergy => synergy.type === 'Super Energy').length, 0,
    'all previously ambiguous source synergy labels now have screenshot-specific types');
  const S = synthetic([{id: 'paladin', synergies: [effect]}, {id: 'chieftain'}, {id: 'sniper'}, {id: 'attacker'}]);
  const members = team('attacker', 'paladin', 'chieftain', 'sniper');
  const settings = {grandMaster: false, accountSynergyBoosts: false, snowFort: false,
    requirementReduction: 0, baseEnergy: 10000};
  const result = S.evaluate(members, settings);
  near(result.global.synergy['Super Energy Amount'], 1.04);
  assert.equal(result.global.synergy['Super Energy Chance'], undefined);
  for (const recipient of result.heroes) {
    near(recipient.metrics.energy, 10400);
    near(recipient.overflow.energy, 1);
  }
  near(S.makeScorer(settings, 'energy', members)(members), 10400);
  near(S.evaluate(members.filter(member => member.id !== 'sniper'), settings).metrics.energy, 10000);
});

test('Deadeye damage reaches the attacker while Warlock personal cooldown gives no phantom energy bonus', () => {
  const S = synthetic([{id: 'deadeye', synergies: [synergy('deadeye', 7)]},
    {id: 'warlock', synergies: [synergy('warlock', 11)]}, {id: 'wizard'}, {id: 'forester'}, {id: 'attacker'}]);
  const members = team('attacker', 'deadeye', 'warlock', 'wizard', 'forester');
  const settings = {grandMaster: false, accountSynergyBoosts: false, snowFort: false,
    requirementReduction: 0, baseEnergy: 10000, damageHero: 0, damageSkills: false, damageSupportSkills: false};
  const result = S.evaluate(members, settings);
  near(result.global.synergy.Damage, 2.25);
  assert.equal(result.global.synergy['Energy Income'], undefined);
  assert.equal(result.global.synergy['Ultra Energy Chance'], undefined);
  assert.equal(result.global.synergy['Skill Cooldown'], undefined);
  for (const recipient of result.heroes) {
    near(recipient.metrics.damage, 2.25);
    near(recipient.metrics.energy, 10000);
    near(recipient.overflow.energy, 1);
    if (recipient.id === 'warlock') near(recipient.local.synergy['Skill Cooldown'], -30);
    else assert.equal(recipient.bonuses['Skill Cooldown'], undefined);
  }
  near(S.makeScorer(settings, 'damage', members)(members), 2.25);
  near(S.makeScorer(settings, 'energy', members)(members), 10000);
  near(S.evaluate(members.filter(member => member.id !== 'wizard'), settings).metrics.damage, 1);
});

test('Forester Templar Chieftain and Deadeye full pages retain all 172 observations in the continuing event profile', () => {
  const expected = [['23', 'forester'], ['24', 'templar'], ['25', 'chieftain'], ['26', 'deadeye']];
  let observations = 0;
  for (const [batch, selected] of expected) {
    const capture = JSON.parse(fs.readFileSync(path.join(captureDirectory, `batch-${batch}.json`), 'utf8'));
    assert.equal(capture.meta.selectedHero.id, selected);
    assert.equal(capture.groups.length, 16);
    assert.equal(new Set(capture.groups.map(group => group.index)).size, 16);
    const count = capture.groups.reduce((total, group) => total + group.effects.length, 0);
    assert.equal(count, 43);
    observations += count;
    assert.deepEqual([...new Set(capture.groups.map(group => group.tier))], [1,2,3,4,5,6,7,8,9]);
    assert.equal(capture.meta.context.grandMasterCount, 9);
    assert.equal(capture.meta.context.synergyEvent.enabled, true);
    assert.equal(capture.meta.context.otherSynergyModifiers.ownerSynergyBonusPercent.crusader, 25);
  }
  assert.equal(observations, 172);
});

test('archived screenshots cover every source synergy owner and prerequisite group', () => {
  const key = (owner, tier, members) => `${owner}:${tier}:${[...members].sort().join('|')}`;
  const source = new Set(D.heroes.flatMap(hero => hero.synergies.map(effect =>
    key(hero.id, effect.tier, [hero.id, ...effect.requires]))));
  const observed = new Set();
  for (const name of captureFiles) {
    const capture = JSON.parse(fs.readFileSync(path.join(captureDirectory, name), 'utf8'));
    for (const group of capture.groups) {
      const members = group.requiredHeroes.map(hero => hero.id);
      for (const effect of group.effects) observed.add(key(effect.ownerId, group.tier, members));
    }
  }
  assert.deepEqual([...observed].sort(), [...source].sort(),
    'completion requires each directional owner effect, not just each shared synergy group');
});

test('active synergy review metadata includes every archived capture without double-counting shared effects', () => {
  const batches = captureFiles;
  const groups = new Set(), effects = new Set();
  let observedGroups = 0, observedEffects = 0;
  for (const name of batches) {
    const capture = JSON.parse(fs.readFileSync(path.join(root, 'source/synergy-review', name), 'utf8'));
    for (const group of capture.groups) {
      const key = `${group.tier}:${group.requiredHeroes.map(h => h.id).sort().join('|')}`;
      groups.add(key);
      observedGroups++;
      for (const effect of group.effects) { effects.add(`${key}:${effect.ownerId}`); observedEffects++; }
    }
  }
  assert.ok(batches.length >= 12);
  assert.ok(observedEffects >= 516);
  assert.ok(effects.size >= 386);
  const meta = D.meta.synergyReview;
  assert.equal(meta.observedBatches, batches.length);
  assert.equal(meta.sources.length, batches.length);
  assert.equal(meta.observedGroups, observedGroups);
  assert.equal(meta.observedEffects, observedEffects);
  assert.equal(meta.uniqueGroups, groups.size);
  assert.equal(meta.uniqueEffects, effects.size);
  assert.equal(meta.repeatedGroups, observedGroups - groups.size);
  assert.equal(meta.repeatedEffects, observedEffects - effects.size);
});

test('active global ascensions stack per deployed copy and personal Damage stays with its owner', () => {
  const S = synthetic([
    {id:'carry', milestones:[milestone('Energy Income',20), milestone('Rank Exp',100), milestone('Power Mage Energy',100)]},
    {id:'aura'}, {id:'benched'}
  ]);
  const members = ['carry','aura','aura'].map(id => slot(id,25));
  const settings = {maxTier:0, milestoneScale:1, grandMaster:false, snowFort:false, goldSkills:false,
    damageSkills:false, damageSupportSkills:false, experienceSkills:false, baseEnergy:100,
    damageHero:0, goldHero:0, experienceHero:0,
    heroAscensions:{carry:{damageLevel:2,killGoldLevel:1},
      aura:{globalDamageLevel:2,globalKillGoldLevel:3,globalRankExpLevel:25,globalEnergyIncomeLevel:5},
      benched:{globalDamageLevel:99,globalKillGoldLevel:99,globalRankExpLevel:25,globalEnergyIncomeLevel:5}}};
  const expected = {damage:25*4*4, gold:5*7*7, experience:2*1.25**2,
    energy:120*1.05**2, powerMageEnergy:2*120*1.05**2};
  const result = S.evaluate(members,settings);
  for (const [focus, score] of Object.entries(expected)) {
    near(result.metrics[focus], score, focus);
    near(S.makeScorer(settings,focus,members)(members),score,'compiled '+focus);
  }
  near(result.heroes[1].metrics.damage,16,'support only gets global damage');
  near(result.heroes[1].metrics.gold,49,'support only gets global gold');
  const leveling = {...settings,experienceLeveler:0,experienceStyle:'none',experienceAttacker:'self'};
  near(S.evaluate(members,leveling).metrics.experience,expected.experience,'leveler');
  near(S.makeScorer(leveling,'experience',members)(members),expected.experience,'compiled leveler');
});

test('support rankings use one copy of the saved global ranks and can isolate milestones', () => {
  const S = synthetic([{id:'aura'}, {id:'neutral'}]);
  const settings = {heroAscensions:{aura:{damageLevel:7,killGoldLevel:9,globalDamageLevel:2,
    globalKillGoldLevel:3,globalRankExpLevel:25,globalEnergyIncomeLevel:5}}};
  const expected = {damage:4,gold:7,experience:1.25,energy:1.05,powerMageEnergy:1.05};
  const active = S.rankMilestoneSupport(settings).heroes.find(h => h.id === 'aura');
  const off = S.rankMilestoneSupport(settings,{includeGlobalAscensions:false}).heroes.find(h => h.id === 'aura');
  for (const [focus, factor] of Object.entries(expected)) {
    near(active.multipliers[focus],factor,focus);
    near(off.multipliers[focus],1,'milestones only '+focus);
  }
});

test('team search can replace a neutral support with a stronger ascension provider for each focus', () => {
  const S = synthetic([{id:'carry'}, {id:'aura'}, {id:'neutral'}]);
  const members = [slot('carry',25,true),slot('neutral',25)];
  const settings = {goldHero:0, damageHero:0, experienceHero:0, grandMaster:false, snowFort:false,
    goldSkills:false, experienceSkills:false, damageSkills:false, damageSupportSkills:false,
    heroAscensions:{aura:{globalDamageLevel:3,globalKillGoldLevel:3,globalRankExpLevel:12,globalEnergyIncomeLevel:3}}};
  for (const focus of ['damage','gold','experience','energy','powerMageEnergy']) {
    const suggestion = S.optimizeTeam(members, settings, focus, ['aura','neutral']);
    assert.equal(suggestion.team[1].id,'aura',focus);
    near(suggestion.score,S.evaluate(suggestion.team,settings).metrics[focus],focus);
    assert.ok(suggestion.score>S.evaluate(members,settings).metrics[focus],focus);
  }
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed.`);
process.exitCode = failures ? 1 : 0;
