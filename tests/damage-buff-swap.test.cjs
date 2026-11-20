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
const slot = (id, tile = 'normal', level = 25, locked = false) => ({id, tile, level, locked});
const milestone = (type, value, global = true) => ({type, value, global, level: 25});
const supportIds = ['apprentice', 'druid', 'witch', 'wizard', 'battlemage', 'spelldancer', 'skymage', 'templar', 'necromancer', 'titan'];
const E = load([...supportIds, 'praetorian', 'warden', 'other'].map(id => ({id})));
const plain = {milestoneScale: 1, synergyScale: 1, synergyEvent: false, grandMaster: false, accountSynergyBoosts: false,
  snowFort: true, mapAttackSpeed: 0, mapMastery: 0, damageHero: 0,
  goldSkills: false, damageSkills: false, damageSupportSkills: true, damageSupportMode: 'debuffs'};
const f = value => 1 + value / 100;
const tests = [];
function test(name, run) { tests.push({name, run}); }
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
function parity(engine, team, settings, expected) {
  const result = engine.evaluate(team, settings);
  near(result.metrics.damage, expected, 'evaluated damage');
  near(engine.makeScorer(settings, 'damage', team)(team), expected, 'compiled damage');
  return result;
}

test('support mode defaults to all and normalizes only the explicit debuffs mode', () => {
  assert.equal(E.defaults.damageSupportMode, 'all');
  assert.equal(E.settingsFor().damageSupportMode, 'all');
  assert.equal(E.settingsFor({damageSupportMode: 'debuffs'}).damageSupportMode, 'debuffs');
  for (const value of [null, '', 'wrong', false, [], {}]) assert.equal(E.settingsFor({damageSupportMode: value}).damageSupportMode, 'all');
});

test('buff swap counts only deployed Witch and Apprentice while ordinary Damage keeps every unique support', () => {
  const team = supportIds.map(id => slot(id));
  const expected = f(41.2 * 20) * f(7180) * f(82.4 * 20);
  const result = parity(E, team, plain, expected);
  assert.equal(result.damageSupportSkills.mode, 'debuffs');
  assert.deepEqual(Array.from(result.damageSupportSkills.skills, skill => skill.id), ['apprentice', 'witch']);
  assert.equal(result.effects.filter(effect => effect.kind === 'skill' && effect.global).length, 3);
  const regular = E.evaluate(team, {...plain, damageSupportMode: 'all'});
  assert.equal(regular.damageSupportSkills.skills.length, 10);
  assert.ok(regular.metrics.damage > result.metrics.damage);
  parity(E, team, {...plain, damageSupportSkills: false}, 1);
});

test('excluded supports cannot add active or mastery bonuses even with skill tiles, kills or teleports', () => {
  for (const id of supportIds.filter(id => !['witch', 'apprentice'].includes(id))) {
    const team = [slot('other'), slot(id, 'skill')];
    parity(E, team, {...plain, damageSupportStacks: 200, damageSupportSeconds: 150, damageSupportTeleports: 100,
      damageNecromancerRoll: 'maximum'}, 1);
  }
  parity(E, [slot('other')], plain, 1);
});

test('excluded support heroes still contribute global milestones and active synergies, never their personal damage', () => {
  const S = load([
    {id: 'other', milestones: [milestone('Damage', 200, false)]},
    {id: 'titan', milestones: [milestone('Damage', 100), milestone('Damage', 1000000, false)],
      synergies: [{type: 'Attack Speed', value: 50, global: true, tier: 1, requires: ['other']}]}
  ]);
  const team = [slot('other'), slot('titan')];
  const result = parity(S, team, plain, 3 * 2 * 1.5);
  assert.equal(result.attackerIndex, 0);
  assert.equal(result.damageSupportSkills.skills.length, 0);
  assert.ok(result.heroes[1].metrics.damage > result.metrics.damage * 1000);
  near(result.metrics.damage, result.heroes[0].metrics.damage);
  assert.ok(result.effects.some(effect => effect.kind === 'milestone' && effect.ownerIndex === 1));
  assert.ok(result.effects.some(effect => effect.kind === 'synergy' && effect.ownerIndex === 1));
});

test('first-copy debuffs and their skill tiles apply once; timed mastery remains independent of zero kills', () => {
  const team = [slot('other'), slot('witch'), slot('witch', 'skill'), slot('apprentice', 'skill'), slot('apprentice', 'skill')];
  const expected = f(7180) * f(82.4 * 20) * f(41.2 * 20 * 1.2);
  const result = parity(E, team, plain, expected);
  assert.deepEqual(Array.from(result.damageSupportSkills.skills, skill => skill.ownerIndex), [1, 3]);
  parity(E, team, {...plain, damageSupportStacks: 100}, expected);
  parity(E, team, {...plain, damageSupportSeconds: 0}, f(7180));
  parity(E, team, {...plain, snowFort: false}, f(7180) * f(82.4 * 20) * f(41.2 * 20));
});

test('the selected attacker retains its personal active skill, mastery and placement with debuffs', () => {
  const team = [slot('praetorian', 'damage'), slot('warden', 'skill'), slot('witch', 'skill'), slot('titan', 'skill')];
  const witch = f(7180 * 1.2) * f(82.4 * 20 * 1.2);
  const attacker = f(7180) * f(6179) * (1 + .05 * (1436 + 124));
  const result = parity(E, team, {...plain, damageSkills: true}, attacker * f(2475) * witch);
  near(result.heroes[0].damageSkill.activeScore, result.metrics.damage);
  assert.ok(result.heroes[1].damageSkill.known);
  parity(E, team, {...plain, damageHero: 3, damageSkills: true}, witch);
  parity(E, team, {...plain, damageSkills: false}, f(2475) * witch);
});

test('damage support filtering does not change Gold, Energy, Power Mage Energy or Experience metrics', () => {
  const R = load();
  const team = ['warden', 'witch', 'apprentice', 'titan', 'necromancer', 'druid', 'rogue', 'sovereign', 'hunter', 'captain']
    .map((id, i) => slot(id, i < 3 ? 'skill' : 'normal', 15000));
  const config = {damageHero: 0, damageSupportMode: 'debuffs', synergyEvent: true};
  const swap = R.evaluate(team, config), regular = R.evaluate(team, {...config, damageSupportMode: 'all'});
  for (const focus of ['gold', 'energy', 'powerMageEnergy', 'experience']) {
    near(swap.metrics[focus], regular.metrics[focus], focus);
    near(R.makeScorer(config, focus, team)(team), regular.metrics[focus], `${focus} compiled`);
  }
});

test('real-team evaluated and compiled scores agree for fixed, best and legacy-average attackers in both modes', () => {
  const R = load();
  const team = ['warden', 'praetorian', 'witch', 'apprentice', 'witch', 'titan', 'wizard', 'druid', 'necromancer', 'spelldancer']
    .map((id, i) => slot(id, ['damage', 'skill', 'normal', 'skill', 'skill', 'milestone', 'synergy', 'milestone', 'synergy', 'milestone'][i], 15000));
  for (const damageSupportMode of ['all', 'debuffs']) for (const damageHero of [0, 1, 2, 5, 'best', null]) {
    for (const damageSkills of [true, false]) for (const snowFort of [true, false]) {
      const config = {damageSupportMode, damageHero, damageSkills, snowFort, synergyEvent: true,
        damageSupportSeconds: 12.5, damageSupportStacks: 0, damageSupportTeleports: 3, baseOverflow: 19};
      const result = R.evaluate(team, config);
      near(R.makeScorer(config, 'damage', team)(team), result.metrics.damage, JSON.stringify(config));
      if (damageHero === 'best') near(result.metrics.damage, Math.max(...result.heroes.map(hero => hero.metrics.damage)));
      else if (Number.isInteger(damageHero)) near(result.metrics.damage, result.heroes[damageHero].metrics.damage);
    }
  }
});

test('tile optimization gives skill tiles only to useful debuffs and respects the selected attacker', () => {
  const team = [slot('other', 'milestone', 15000, true), slot('witch'), slot('witch', 'skill'), slot('apprentice'), slot('titan')];
  const result = E.optimizePlacements(team, plain, 'damage');
  assert.equal(result.team[0].tile, 'damage');
  assert.equal(result.team[1].tile, 'skill');
  assert.equal(result.team[3].tile, 'skill');
  assert.notEqual(result.team[2].tile, 'skill');
  assert.notEqual(result.team[4].tile, 'skill');
  result.team.forEach((member, i) => {
    assert.equal(member.id, team[i].id);
    assert.equal(member.level, team[i].level);
    assert.equal(member.locked, team[i].locked);
  });
  parity(E, result.team, plain, f(2475) * f(7180 * 1.2) * f(82.4 * 20 * 1.2) * f(41.2 * 20 * 1.2));
});

test('buff-swap placement search matches exhaustive legal assignments with attacker, debuffs and passive support competition', () => {
  const S = load([
    {id: 'praetorian', milestones: [milestone('Damage', 80, false)]},
    {id: 'witch', milestones: [milestone('Crit Damage', 90)]},
    {id: 'apprentice', synergies: [{type: 'Attack Speed', value: 120, global: true, tier: 1, requires: ['titan']}]},
    {id: 'titan', milestones: [milestone('Damage', 7000)]}
  ]);
  const team = ['praetorian', 'witch', 'apprentice', 'titan'].map(id => slot(id));
  for (const damageHero of [0, 'best']) {
    const config = {...plain, damageHero, damageSkills: true};
    let optimum = 0;
    function enumerate(index, trial, counts) {
      if (index === team.length) { optimum = Math.max(optimum, S.evaluate(trial, config).metrics.damage); return; }
      for (const tile of ['normal', 'milestone', 'synergy', 'skill', 'damage']) {
        const limit = tile === 'normal' ? 10 : tile === 'damage' ? 1 : 3;
        if ((counts[tile] || 0) < limit) enumerate(index + 1, [...trial, {...team[index], tile}], {...counts, [tile]: (counts[tile] || 0) + 1});
      }
    }
    enumerate(0, [], {});
    const result = S.optimizePlacements(team, config, 'damage');
    near(result.score, optimum);
    parity(S, result.team, config, optimum);
  }
});

test('team suggestions seek Witch and Apprentice debuffs rather than excluded support skills, and preserve a fixed attacker', () => {
  const team = [slot('praetorian'), slot('other'), slot('other')];
  const config = {...plain, damageSkills: true, snowFort: false};
  const result = E.optimizeTeam(team, config, 'damage', ['witch', 'apprentice', 'titan', 'necromancer', 'other']);
  assert.equal(result.team[0].id, 'praetorian');
  assert.deepEqual(result.team.slice(1).map(s => s.id).sort(), ['apprentice', 'witch']);
  parity(E, result.team, config, result.score);
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} Damage buff-swap tests passed.\n`);
if (failures) process.exitCode = 1;
