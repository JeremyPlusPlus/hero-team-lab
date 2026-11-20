'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load(heroes) {
  const context = vm.createContext({window: {}});
  if (heroes) context.window.HERO_DATA = {meta: {statAliases: {}}, heroes: heroes.map(h => ({name: h.id, milestones: [], synergies: [], ...h}))};
  else vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine.js'), 'utf8'), context);
  return context.window.HeroEngine;
}
const milestone = (type, value, global = true, level = 25) => ({type, value, global, level});
const supportIds = ['apprentice', 'druid', 'witch', 'wizard', 'battlemage', 'spelldancer', 'skymage', 'templar', 'necromancer', 'titan'];
const originalColumns = ['damage', 'gold', 'experience', 'energy', 'powerMageEnergy'];
const plain = {milestoneScale: 1, baseOverflow: 0, overflowRate: 5, synergyEvent: false, damageSupportSkills: true};
const context = {level: 15000, grandMasterCount: 0, tile: 'normal',
  damageReference: {critChance: 100, superChance: 100, ultraChance: 100}};
const f = percent => 1 + percent / 100;
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
function hero(result, id) { return result.heroes.find(h => h.id === id); }
function unchangedColumns(a, b) {
  for (const column of originalColumns) {
    assert.equal(a.baseline[column], b.baseline[column], `${column} baseline changed`);
    for (const h of a.heroes) for (const field of ['metrics', 'multipliers', 'ranks']) {
      assert.equal(h[field][column], hero(b, h.id)[field][column], `${h.id} ${field}.${column} changed`);
    }
  }
}
const tests = [];
function test(name, run) { tests.push({name, run}); }

test('all ten captured global support profiles have independently calculated ranking outcomes', () => {
  const E = load(supportIds.map(id => ({id})));
  const result = E.rankMilestoneSupport(plain, context);
  // Screenshot values at 20 seconds, zero kill stacks and three teleports. Each
  // active/mastery percentage is a separate multiplier; chance is one pool.
  const expected = {
    apprentice: f(41.2 * 20),
    druid: f(7180) * f(82.4 * 20),
    witch: f(7180) * f(82.4 * 20),
    wizard: f(7180) * 3,
    battlemage: 1 + 1619 * .05,
    spelldancer: f(8070),
    skymage: f(1236 * 3),
    templar: f(1436) * f(41.2 * 20),
    necromancer: f(4047.5) ** 2 * f(517.5) * f(310.5) * f(103.5),
    titan: f(1451) * f(2060) * (1 + (290.2 + 82) * .05)
  };
  near(result.baseline.damageWithSupport, 1);
  assert.equal(result.damageSupportContext.seconds, 20);
  assert.equal(result.damageSupportContext.stacks, 0);
  assert.equal(result.damageSupportContext.teleports, 3);
  assert.equal(result.damageSupportContext.necromancerRoll, 'midpoint');
  for (const h of result.heroes) {
    near(h.metrics.damageWithSupport, expected[h.id], h.id);
    near(h.multipliers.damageWithSupport, expected[h.id], `${h.id} ratio`);
    near(h.metrics.damage, 1, `${h.id} milestone-only damage`);
    assert.equal(h.effects.length, 0, 'skill effects must not masquerade as milestones');
    assert.equal(Object.keys(h.bonuses).length, 0);
    assert.equal(h.damageSupportSkill.id, h.id);
    assert.ok([...h.damageSupportSkill.activeEffects, ...h.damageSupportSkill.masteryEffects].every(e => e.global));
  }
});

test('Druid global milestones and both skill stages multiply without counting skill power or baseline twice', () => {
  const E = load([{id: 'druid', milestones: [milestone('Damage', 50), milestone('Skill Power', 9000),
    milestone('Damage', 1000000, false)], synergies: [{type: 'Damage', value: 1000000, global: true, tier: 1, index: 1, requires: []}]}]);
  const reference = {critChance: 120, superChance: 100, ultraChance: 100};
  const result = E.rankMilestoneSupport(plain, {...context, damageReference: reference}), h = result.heroes[0];
  const factor = 1.5 * 72.8 * 17.48;
  near(result.baseline.damageWithSupport, 2);
  near(h.metrics.damageWithSupport, factor * 2);
  near(h.multipliers.damageWithSupport, factor);
  near(h.damageWithSupportBonuses.Damage, factor);
  near(h.metrics.damage, 3);
  assert.equal(h.effects.length, 2);
  assert.equal(h.effects[0].focuses.join(','), 'damage', 'original milestone attribution remains unchanged');
  const below = E.rankMilestoneSupport(plain, {...context, damageReference: reference, level: 24}).heroes[0];
  near(below.multipliers.damageWithSupport, 72.8 * 17.48, 'captured skill remains available before milestone unlock');
});

test('zero-kill support rankings match team and compiled scoring and still allow positive kill stacks', () => {
  const E = load([{id: 'battlemage'}, {id: 'spelldancer'}, {id: 'druid'}, {id: 'skymage'}]);
  const settings = {...plain, damageHero: 0, grandMaster: false, snowFort: false,
    accountSynergyBoosts: false, damageSkills: false, goldSkills: false};
  const zero = E.rankMilestoneSupport(settings, context);
  const stacked = E.rankMilestoneSupport({...settings, damageSupportStacks: 100}, context);
  for (const h of zero.heroes) {
    const team = [{id: h.id, level: 25, tile: 'normal'}];
    near(h.metrics.damageWithSupport, E.evaluate(team, settings).metrics.damage, h.id);
    near(h.metrics.damageWithSupport, E.makeScorer(settings, 'damage', team)(team), `${h.id} compiled`);
    const withKills = hero(stacked, h.id);
    if (['battlemage', 'spelldancer'].includes(h.id)) {
      assert.equal(h.damageSupportSkill.masteryEffects.length, 0);
      assert.ok(withKills.metrics.damageWithSupport > h.metrics.damageWithSupport);
    } else {
      near(withKills.metrics.damageWithSupport, h.metrics.damageWithSupport, `${h.id} unaffected by kills`);
    }
  }
  near(hero(stacked, 'battlemage').metrics.damageWithSupport, 1 + (1619 + 820) * .05);
  near(hero(stacked, 'spelldancer').metrics.damageWithSupport, f(8070) * f(12360));
});

test('Battlemage skill chances and global milestone chances share a single normalized overflow pool', () => {
  const E = load([{id: 'battlemage', milestones: [milestone('Crit Chance', 20),
    milestone('Super Crit Chance', 30), milestone('Ultra Crit Chance', 50), milestone('Damage', 50)]}]);
  const reference = {critChance: 120, superChance: 100, ultraChance: 100};
  const result = E.rankMilestoneSupport(plain, {...context, damageReference: reference}), h = result.heroes[0];
  const overflow = 1 + (100 + 5 * (20 + 30 + 50 + 1619)) / 100;
  near(h.damageWithSupportOverflow.damage, overflow);
  near(h.metrics.damageWithSupport, 1.5 * overflow);
  near(h.multipliers.damageWithSupport, 1.5 * overflow / 2);
  near(h.metrics.damage, 1.5 * 7);
  assert.notEqual(h.metrics.damageWithSupport, h.metrics.damage * (1 + 1619 * .05));
});

test('both Damage columns use one captured chance pool for milestones and Titan or Battlemage buffs', () => {
  const globals = [milestone('Damage', 50), milestone('Crit Chance', 20),
    milestone('Super Crit Chance', 7), milestone('Ultra Crit Chance', 3)];
  const E = load([{id: 'titan', milestones: globals}, {id: 'battlemage', milestones: globals}]);
  for (const overflowRate of [0, 5, 10]) for (const baseOverflow of [0, 10000]) {
    const r = E.rankMilestoneSupport({...plain, overflowRate, baseOverflow}, {grandMasterCount: 0});
    assert.equal(r.damageReference.critChance, 241);
    assert.equal(r.damageReference.superChance, 258);
    assert.equal(r.damageReference.ultraChance, 120);
    assert.equal(r.damageReference.excessPoints, (241 - 100) + (258 - 100) + (120 - 100));
    const before = 1 + 319 * overflowRate / 100;
    const milestoneOverflow = 1 + (319 + 30) * overflowRate / 100;
    near(r.damageReference.spilloverFactor, before);
    near(r.baseline.damage, before);
    near(r.baseline.damageWithSupport, before);
    for (const [id, skillChance, skillAmount] of [['titan', 290.2 + 82, f(1451) * f(2060)],
      ['battlemage', 1619, 1]]) {
      const h = hero(r, id);
      const combinedOverflow = 1 + (319 + 30 + skillChance) * overflowRate / 100;
      near(h.overflow.damage, milestoneOverflow, `${id} milestone pool`);
      near(h.damageSpilloverGain, milestoneOverflow / before);
      near(h.damageWithSupportOverflow.damage, combinedOverflow, `${id} combined pool`);
      near(h.damageWithSupportSpilloverGain, combinedOverflow / before);
      near(h.metrics.damage, 1.5 * milestoneOverflow);
      near(h.multipliers.damage, 1.5 * milestoneOverflow / before);
      near(h.metrics.damageWithSupport, 1.5 * skillAmount * combinedOverflow);
      near(h.multipliers.damageWithSupport, 1.5 * skillAmount * combinedOverflow / before);
    }
  }
});

test('editing any of the three Damage chances changes the relative value of added chance against amount bonuses', () => {
  const E = load([{id: 'chance', milestones: [milestone('Ultra Crit Chance', 40)]},
    {id: 'amount', milestones: [milestone('Damage', 50), milestone('Rank Exp', 30)]}]);
  const settings = {...plain, baseOverflow: 2400};
  const emptyPool = E.rankMilestoneSupport(settings, context);
  for (const key of ['critChance', 'superChance', 'ultraChance']) {
    const options = {...context, damageReference: {...context.damageReference, [key]: 500}};
    const largePool = E.rankMilestoneSupport(settings, options);
    near(largePool.baseline.damage, 21);
    for (const column of ['damage', 'damageWithSupport']) {
      near(hero(emptyPool, 'chance').multipliers[column], 3);
      near(hero(largePool, 'chance').multipliers[column], 23 / 21);
      near(hero(largePool, 'amount').multipliers[column], 1.5);
      assert.equal(hero(emptyPool, 'chance').ranks[column], 1);
      assert.equal(hero(largePool, 'amount').ranks[column], 1);
    }
    for (const column of ['experience', 'energy', 'powerMageEnergy', 'gold']) {
      assert.equal(largePool.baseline[column], emptyPool.baseline[column]);
      for (const h of largePool.heroes) for (const field of ['metrics', 'multipliers', 'ranks']) {
        assert.equal(h[field][column], hero(emptyPool, h.id)[field][column]);
      }
    }
  }
  const members = [{id: 'chance', level: 25, tile: 'normal'}];
  const teamSettings = {...settings, damageHero: 0, snowFort: false, grandMaster: false};
  near(E.evaluate(members, teamSettings).metrics.damage, 27, 'generic baseOverflow still drives team damage');
  near(E.makeScorer(teamSettings, 'damage', members)(members), 27);
});

test('Damage reference inputs clamp each supported tier independently and preserve partial edits', () => {
  const E = load([{id: 'mentor', milestones: [milestone('Crit Chance', 20)]}]);
  const run = damageReference => E.rankMilestoneSupport(plain, {...context, damageReference});
  const partial = run({critChance: 25, superChance: '120.5'});
  assert.equal(partial.damageReference.critChance, 100);
  assert.equal(partial.damageReference.superChance, 120.5);
  assert.equal(partial.damageReference.ultraChance, 120);
  near(partial.damageReference.excessPoints, 40.5);
  near(partial.heroes[0].multipliers.damage, (1 + 60.5 * .05) / (1 + 40.5 * .05));
  const invalid = run({critChance: Infinity, superChance: ' ', ultraChance: null}).damageReference;
  assert.equal(invalid.critChance, 241);
  assert.equal(invalid.superChance, 258);
  assert.equal(invalid.ultraChance, 120);
  const bounded = run({critChance: 1e20, superChance: 0, ultraChance: NaN}).damageReference;
  assert.equal(bounded.critChance, 1e9);
  assert.equal(bounded.superChance, 100);
  assert.equal(bounded.ultraChance, 120);
});

test('Wizard triple shot caps at three shots and never enters critical chance overflow', () => {
  const E = load([{id: 'wizard', milestones: [milestone('Crit Chance', 10)]}]);
  const settings = {...plain, damageSupportWizardAttackSpeed: 0};
  for (const [chance, tile, factor] of [[206, 'normal', 3], [206, 'skill', 3],
    [50, 'normal', 2], [50, 'skill', 2.2], [0, 'skill', 1]]) {
    const h = E.rankMilestoneSupport({...settings, damageSupportWizardTripleShotChance: chance}, {...context, tile}).heroes[0];
    near(h.metrics.damageWithSupport, factor * 1.5, `${chance} ${tile}`);
    near(h.damageWithSupportOverflow.damage, 1.5);
    near(h.damageSupportSkill.tripleShotChance, Math.min(100, chance * (tile === 'skill' ? 1.2 : 1)));
  }
});

test('Necromancer midpoint and maximum scenarios honor independently edited active and mastery ranges', () => {
  const E = load([{id: 'necromancer'}]);
  for (const tile of ['normal', 'skill']) for (const roll of ['midpoint', 'maximum']) {
    const boost = tile === 'skill' ? 1.2 : 1;
    const values = roll === 'maximum' ? [8070, 1030, 618, 206] : [4047.5, 517.5, 310.5, 103.5];
    const expected = f(values[0] * boost) ** 2 * f(values[1] * boost) * f(values[2] * boost) * f(values[3] * boost);
    const h = E.rankMilestoneSupport({...plain, damageNecromancerRoll: roll}, {...context, tile}).heroes[0];
    near(h.metrics.damageWithSupport, expected, `${tile} ${roll}`);
    assert.equal(h.damageSupportSkill.roll, roll);
  }
  const edited = {...plain, damageSupportNecromancerDamageMin: 0, damageSupportNecromancerDamageMax: 200,
    damageSupportNecromancerAttackSpeedMin: 100, damageSupportNecromancerAttackSpeedMax: 0,
    damageSupportNecromancerCritDamageMin: 0, damageSupportNecromancerCritDamageMax: 0,
    damageSupportNecromancerSuperCritDamageMin: 0, damageSupportNecromancerSuperCritDamageMax: 0,
    damageSupportNecromancerUltraCritDamageMin: 0, damageSupportNecromancerUltraCritDamageMax: 0};
  near(E.rankMilestoneSupport(edited, context).heroes[0].metrics.damageWithSupport, 2 * 1.5);
  near(E.rankMilestoneSupport({...edited, damageNecromancerRoll: 'maximum'}, context).heroes[0].metrics.damageWithSupport, 3 * 2);
});

test('support ranking uses configured time, capped stack and teleport scenarios', () => {
  const E = load([{id: 'druid'}, {id: 'spelldancer'}, {id: 'battlemage'}, {id: 'skymage'}]);
  for (const [seconds, stacksInput, stacks, teleportsInput, teleports] of [[0, 0, 0, 0, 0],
    [7.5, 25.9, 25, 2.9, 2], [35, 250, 200, 7, 7]]) {
    const result = E.rankMilestoneSupport({...plain, damageSupportSeconds: seconds,
      damageSupportStacks: stacksInput, damageSupportTeleports: teleportsInput}, context);
    near(hero(result, 'druid').metrics.damageWithSupport, f(7180) * f(82.4 * seconds));
    near(hero(result, 'spelldancer').metrics.damageWithSupport, f(8070) * f(123.6 * stacks));
    near(hero(result, 'battlemage').metrics.damageWithSupport, 1 + (1619 + 8.2 * stacks) * .05);
    near(hero(result, 'skymage').metrics.damageWithSupport, f(1236 * teleports));
    assert.equal(result.damageSupportContext.stacks, stacks);
    assert.equal(result.damageSupportContext.teleports, teleports);
  }
});

test('explicit ranking skill tiles work with Snow Fort off and boost active and mastery exactly once', () => {
  const E = load([{id: 'druid', milestones: [milestone('Damage', 10), milestone('Skill Power', 9000),
    milestone('Mastery Skill Power', 9000)]}]);
  const settings = {...plain, milestoneScale: 2, synergyEvent: true, grandMaster: false,
    snowFort: false, mapMastery: 9999, mapAttackSpeed: -99,
    damageSkillTileBoost: 30, damageMasteryTileBoost: 50};
  for (const tile of ['normal', 'milestone', 'skill']) {
    const options = {...context, grandMasterCount: 9, tile};
    const result = E.rankMilestoneSupport(settings, options), h = result.heroes[0];
    const scale = 2 * 1.25 * (1.1 ** 9 + (tile === 'milestone' ? .2 : 0));
    const active = tile === 'skill' ? 1.3 : 1, mastery = tile === 'skill' ? 1.5 : 1;
    near(result.milestoneScale, scale);
    near(h.metrics.damage, f(10 * scale));
    near(h.metrics.damageWithSupport, f(10 * scale) * f(7180 * active) * f(82.4 * 20 * mastery));
    near(h.damageSupportSkill.tileBoost, active);
    near(h.damageSupportSkill.masteryTileBoost, mastery);
    near(result.damageSupportContext.tileBoost, active);
    near(result.damageSupportContext.masteryTileBoost, mastery);
    assert.equal(JSON.stringify(result), JSON.stringify(E.rankMilestoneSupport({...settings, snowFort: true, grandMaster: true}, options)));
  }
});

test('personal attacker abilities, personal milestones and synergies never enter support rankings', () => {
  const ids = ['praetorian', 'deadeye', 'dicemaster', 'warden', 'warlord', 'unmodeled'];
  const E = load(ids.map(id => ({id, milestones: [milestone('Damage', 10), milestone('Damage', 1000000, false)],
    synergies: [{type: 'Damage', value: 1000000, global: true, tier: 1, index: 1, requires: []}]})));
  for (const damageSkills of [false, true]) {
    const result = E.rankMilestoneSupport({...plain, damageSkills, damageHero: 'best'}, {...context, tile: 'skill'});
    for (const h of result.heroes) {
      assert.equal(h.damageSupportSkill, null);
      near(h.metrics.damageWithSupport, 1.1);
      near(h.metrics.damageWithSupport, h.metrics.damage);
      assert.equal(h.effects.length, 1);
    }
  }
});

test('the real roster retains all five original columns and disabling support makes the new column match damage', () => {
  const E = load();
  for (const tile of ['normal', 'milestone', 'skill']) {
    const settings = {...plain, milestoneScale: 2.8125, baseOverflow: 100, synergyEvent: true};
    const options = {...context, grandMasterCount: 9, tile};
    const on = E.rankMilestoneSupport(settings, options);
    const off = E.rankMilestoneSupport({...settings, damageSupportSkills: false}, options);
    unchangedColumns(on, off);
    assert.equal(on.heroes.length, 42);
    near(on.baseline.damageWithSupport, on.baseline.damage);
    assert.equal(off.damageSupportContext.enabled, false);
    for (const h of off.heroes) {
      assert.equal(h.damageSupportSkill, null);
      for (const field of ['metrics', 'multipliers', 'ranks']) assert.equal(h[field].damageWithSupport, h[field].damage);
    }
    for (const h of on.heroes) {
      assert.equal(JSON.stringify(h.effects), JSON.stringify(hero(off, h.id).effects));
      assert.equal(JSON.stringify(h.bonuses), JSON.stringify(hero(off, h.id).bonuses));
      if (!supportIds.includes(h.id)) {
        assert.equal(h.damageSupportSkill, null);
        near(h.metrics.damageWithSupport, h.metrics.damage);
      }
    }
  }
  assert.equal(E.evaluate([{id: 'druid', level: 15000}], {}).metrics.damageWithSupport, undefined, 'ranking column must not become a team focus');
});

test('combined support ranks use competition ties while preserving independent milestone-only ranks', () => {
  const E = load([{id: 'wizard'}, {id: 'single', milestones: [milestone('Damage', 200)]},
    {id: 'product', milestones: [milestone('Damage', 50), milestone('Damage', 100)]},
    {id: 'lower', milestones: [milestone('Damage', 190)]}]);
  const result = E.rankMilestoneSupport({...plain, damageSupportWizardAttackSpeed: 0}, context);
  assert.equal(result.heroes.map(h => h.id).join(','), 'wizard,single,product,lower');
  for (const id of ['wizard', 'single', 'product']) {
    near(hero(result, id).multipliers.damageWithSupport, 3);
    assert.equal(hero(result, id).ranks.damageWithSupport, 1);
  }
  assert.equal(hero(result, 'lower').ranks.damageWithSupport, 4);
  assert.equal(hero(result, 'wizard').ranks.damage, 4);
  assert.equal(hero(result, 'single').ranks.damage, 1);
});

test('ranking leaves input data and settings untouched and returns independent skill details each time', () => {
  const fixture = [{id: 'druid', milestones: [milestone('Damage', 10)]}, {id: 'wizard'}];
  const E = load(fixture), settings = Object.freeze({...plain, damageSupportSeconds: 8});
  const options = Object.freeze({...context, tile: 'skill'});
  const before = JSON.stringify({fixture, settings, options});
  const result = E.rankMilestoneSupport(settings, options), reference = JSON.stringify(result);
  result.heroes[0].damageSupportSkill.activeEffects[0].value = -999;
  result.heroes[0].damageWithSupportBonuses.Damage = -999;
  result.heroes.reverse();
  assert.equal(JSON.stringify(E.rankMilestoneSupport(settings, options)), reference);
  assert.equal(JSON.stringify({fixture, settings, options}), before);
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`\n${tests.length - failures}/${tests.length} damage-support ranking tests passed.`);
process.exitCode = failures ? 1 : 0;
