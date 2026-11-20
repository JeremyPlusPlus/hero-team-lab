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
const synergy = (type, value, global, requires) => ({type, value, global, requires, tier: 1, index: 1});
const plain = {milestoneScale: 1, synergyScale: 1, grandMaster: false, accountSynergyBoosts: false,
  snowFort: true, mapAttackSpeed: 0, mapMastery: 0, goldHero: 0, goldSkills: true,
  damageSkills: false, damageSupportSkills: false, requirementReduction: 0};
const E = load(['crusader', 'other', 'rogue', 'hunter', 'sovereign'].map(id => ({id})));
const f = percent => 1 + percent / 100;
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
// Independent per-hit summation: the first hit has zero mastery stacks, and
// every hit after the 500-stack cap repeats the same capped reward.
function attacks(count = 1, boost = 1, bonus = 6420, mastery = 20.6) {
  let factor = 0;
  const initial = Math.min(count, 501);
  for (let hit = 0; hit < initial; hit++) factor += bonus * boost / 100 * .5 * (1 + hit * mastery * boost / 100);
  return factor + Math.max(0, count - initial) * bonus * boost / 100 * .5 * (1 + 500 * mastery * boost / 100);
}
function parity(engine, members, settings, expected, label = '') {
  const result = engine.evaluate(members, settings);
  near(result.metrics.gold, expected, label);
  near(engine.makeScorer(settings, 'gold', members)(members), expected, `${label} compiled`);
  return result;
}
const tests = [];
function test(name, run) { tests.push({name, run}); }

test('one Crusader attack adds exactly 32.1 passive Kill Gold units while preserving the separate kill reward', () => {
  assert.equal(E.defaults.goldCrusaderBonus, 6420);
  assert.equal(E.defaults.goldCrusaderMastery, 20.6);
  assert.equal(E.defaults.goldCrusaderAttacks, 1);
  const members = [slot('crusader'), slot('other')];
  const result = parity(E, members, plain, 33.1);
  const skill = result.heroes[0].goldSkill;
  assert.equal(skill.id, 'crusader');
  assert.equal(skill.enabled, true);
  assert.equal(skill.attacks, 1);
  near(skill.tileBoost, 1);
  near(skill.masteryPerStack, 20.6);
  assert.equal(skill.maxStacks, 500);
  near(skill.waveBossEfficiency, .5);
  near(skill.baseKillGold, 1);
  near(skill.attackMultiplier, 32.1);
  near(skill.attackGold, 32.1);
  near(skill.killScore, 1);
  near(skill.totalScore, 33.1);
  near(result.heroes[1].metrics.gold, 1, 'non-attacker does not receive the Crusader payout');
  parity(E, members, {...plain, goldCrusaderAttacks: 0}, 1);
  parity(E, members, {...plain, goldSkills: false}, 1);
  parity(E, [slot('other')], plain, 1);
});

test('consecutive attacks accumulate mastery from the second hit and stop growing at 500 stacks', () => {
  const members = [slot('crusader')];
  for (const count of [1, 2, 3, 499, 500, 501, 502, 503, 1000000]) {
    const result = parity(E, members, {...plain, goldCrusaderAttacks: count}, 1 + attacks(count), `${count} hits`);
    near(result.heroes[0].goldSkill.attackGold, attacks(count));
  }
  near(attacks(2), 32.1 * (2 + .206));
  near(attacks(502) - attacks(501), 32.1 * (1 + .206 * 500));
  near(attacks(503) - attacks(502), attacks(502) - attacks(501));
});

test('Crusader controls normalize counts and retain editable active and mastery values', () => {
  const members = [slot('crusader')];
  for (const [value, count] of [[2.9, 2], [-9, 0], ['3', 3], ['invalid', 1], [Infinity, 1], [1000001, 1000000]]) {
    const config = {...plain, goldCrusaderAttacks: value};
    assert.equal(E.settingsFor(config).goldCrusaderAttacks, count);
    parity(E, members, config, 1 + attacks(count), String(value));
  }
  const custom = {...plain, goldCrusaderAttacks: 3, goldCrusaderBonus: 100, goldCrusaderMastery: 50};
  parity(E, members, custom, 1 + .5 * (1 + 1.5 + 2));
  parity(E, members, {...custom, goldCrusaderBonus: 0}, 1);
  parity(E, members, {...custom, goldCrusaderMastery: 0}, 2.5);
  parity(E, members, {...custom, goldCrusaderBonus: -10}, 1);
});

test('instant payout uses only passive global and personal Kill Gold, excluding boss, reward tiers, chances and on-kill skills', () => {
  const S = load([
    {id: 'crusader', milestones: [milestone('Kill Gold', 100, false), milestone('Boss Gold', 900, false),
      milestone('Super Gold Amount', 400, false), milestone('Ultra Gold Amount', 600, false), milestone('Ultra Gold Chance', 1000, false)],
      synergies: [synergy('Kill Gold', 50, false, ['support'])]},
    {id: 'support', milestones: [milestone('Kill Gold', 200), milestone('Kill Gold', 99999, false)],
      synergies: [synergy('Kill Gold', 25, true, ['crusader'])]},
    ...['rogue', 'hunter', 'sovereign'].map(id => ({id}))
  ]);
  const members = ['crusader', 'support', 'rogue', 'hunter', 'sovereign'].map(id => slot(id));
  const base = 2 * 1.5 * 3 * 1.25;
  const kill = base * 10 * 5 * 7 * f(8070) * f(28720) * f(1629) * f(125 + 3 * (1000 + 325.8));
  const config = {...plain, baseOverflow: 125, overflowRate: 3};
  const result = parity(S, members, config, kill + base * 32.1);
  near(result.heroes[0].goldSkill.baseKillGold, base);
  near(result.heroes[0].goldSkill.killScore, kill);
  near(result.heroes[0].goldSkill.attackGold, base * 32.1);
  const noAttacks = parity(S, members, {...config, goldCrusaderAttacks: 0}, kill);
  near(result.heroes[0].goldSkill.killScore, noAttacks.heroes[0].metrics.gold);
  // Even maximal reward-tier effects and a skill-tiled support cannot amplify instant gold.
  const boostedSupport = members.map(s => ({...s, tile: s.id === 'rogue' ? 'skill' : 'normal'}));
  near(S.evaluate(boostedSupport, config).heroes[0].goldSkill.attackGold, base * 32.1);
});

test('Crusader skill tiles boost both captured percentages once and map-off removes the placement bonus', () => {
  const members = [slot('crusader', 'skill')];
  for (const count of [1, 3, 502]) {
    const config = {...plain, goldCrusaderAttacks: count};
    const result = parity(E, members, config, 1 + attacks(count, 1.2));
    near(result.heroes[0].goldSkill.tileBoost, 1.2);
    near(result.heroes[0].goldSkill.masteryPerStack, 20.6 * 1.2);
    parity(E, members, {...config, snowFort: false}, 1 + attacks(count));
  }
  parity(E, [slot('crusader', 'killGold')], plain, 25.75 * 33.1);
  parity(E, [slot('crusader', 'killGold')], {...plain, snowFort: false}, 33.1);
});

test('each selected Crusader uses its own payout and tile, without borrowing from a duplicate or buffing another killer', () => {
  const members = [slot('crusader'), slot('crusader', 'skill'), slot('other'), slot('crusader', 'killGold')];
  const scores = [33.1, 1 + attacks(1, 1.2), 1, 25.75 * 33.1];
  for (let index = 0; index < members.length; index++) {
    const result = parity(E, members, {...plain, goldHero: index}, scores[index]);
    result.heroes.forEach((hero, i) => near(hero.metrics.gold, scores[i], `recipient ${i}`));
  }
  const automatic = parity(E, members, {...plain, goldHero: 'best'}, Math.max(...scores));
  assert.equal(automatic.goldIndex, 3);
  parity(E, members, {...plain, goldHero: null}, scores.reduce((a, b) => a + b) / scores.length);
  const reversed = [...members].reverse();
  parity(E, reversed, {...plain, goldHero: 2}, scores[1], 'later duplicate still owns its personal skill tile');
});

test('captured Crusader bonuses are not amplified again by GM, the event, map mastery or raw skill-power stats', () => {
  const S = load([{id: 'crusader', milestones: [milestone('Kill Gold', 100, false), milestone('Skill Power', 9999), milestone('Mastery Power', 9999)]}, {id: 'other'}]);
  const members = [slot('crusader', 'milestone'), slot('other')];
  for (const grandMaster of [false, true]) for (const synergyEvent of [false, true]) {
    const config = {...plain, grandMaster, synergyEvent, milestoneScale: 9, mapMastery: 9000, goldCrusaderAttacks: 3};
    const result = S.evaluate(members, config), profile = result.heroes[0].goldSkill;
    const scale = 9 * (grandMaster ? 1.1 ** 2 + .2 : 1.2) * (synergyEvent ? 1.25 : 1);
    const base = f(100 * scale) * (grandMaster ? 2.5 ** 2 : 1);
    near(profile.baseKillGold, base);
    near(profile.attackGold, base * attacks(3));
    near(S.makeScorer(config, 'gold', members)(members), result.metrics.gold);
  }
});

test('Crusader instant gold cannot change another focus or the global-only milestone support ranking', () => {
  const R = load();
  const members = ['crusader', 'rogue', 'hunter', 'sovereign', 'druid', 'captain'].map(id => slot(id, 'normal', 10000));
  const config = {...plain, grandMaster: true, synergyEvent: true, damageSkills: true, damageSupportSkills: true};
  const one = R.evaluate(members, config), many = R.evaluate(members, {...config, goldCrusaderAttacks: 500});
  assert.ok(many.metrics.gold > one.metrics.gold);
  for (const focus of ['damage', 'experience', 'energy', 'powerMageEnergy']) {
    near(many.metrics[focus], one.metrics[focus], focus);
    near(R.makeScorer({...config, goldCrusaderAttacks: 500}, focus, members)(members), one.metrics[focus]);
  }
  assert.equal(JSON.stringify(R.rankMilestoneSupport(config)), JSON.stringify(R.rankMilestoneSupport({...config,
    goldSkills: false, goldCrusaderAttacks: 1000000, goldCrusaderBonus: 1e9, goldCrusaderMastery: 1e9})));
});

test('Gold tile comparison includes Crusader skill with runner-up gain and leaves other killers unchanged', () => {
  const members = [slot('crusader'), slot('other')], before = JSON.stringify(members);
  const config = {...plain, goldKillGoldTile: 0, goldCrusaderAttacks: 3};
  const comparison = E.compareGoldAttackerTiles(members, config);
  assert.ok(comparison.availableOptions.includes('skill'));
  assert.ok(comparison.skill);
  assert.equal(comparison.preferred, 'skill');
  for (const type of comparison.availableOptions) {
    near(comparison[type].score, E.evaluate(comparison[type].team, config).metrics.gold, type);
    assert.equal(comparison[type].team[0].tile, type);
  }
  near(comparison.gain, comparison.skill.score / comparison[comparison.runnerUp].score - 1);
  assert.equal(JSON.stringify(members), before);
  for (const config of [{...plain, goldHero: 1}, {...plain, goldSkills: false}]) {
    const ordinary = E.compareGoldAttackerTiles(members, config);
    assert.equal(ordinary.skill, null);
    assert.equal(ordinary.availableOptions.includes('skill'), false);
  }
});

test('skill comparison respects the three-tile capacity and chooses the least costly support displacement', () => {
  const members = ['crusader', 'rogue', 'hunter', 'sovereign'].map((id, i) => slot(id, i ? 'skill' : 'normal'));
  const config = {...plain, goldCrusaderAttacks: 1000000, goldKillGoldTile: 0};
  const comparison = E.compareGoldAttackerTiles(members, config);
  assert.equal(comparison.skill.team[0].tile, 'skill');
  assert.equal(comparison.skill.team.filter(s => s.tile === 'skill').length, 3);
  assert.equal(E.cleanTeam(comparison.skill.team).length, 4);
  let optimum = 0;
  for (let displaced = 1; displaced < 4; displaced++) {
    const trial = members.map((s, i) => ({...s, tile: i === 0 ? 'skill' : i === displaced ? 'normal' : s.tile}));
    optimum = Math.max(optimum, E.evaluate(trial, config).metrics.gold);
  }
  near(comparison.skill.score, optimum);
});

test('Crusader-aware placement matches independent exhaustive three- and four-hero arithmetic', () => {
  const S = load([
    {id: 'crusader', milestones: [milestone('Kill Gold', 100, false), milestone('Boss Gold', 400, false)],
      synergies: [synergy('Kill Gold', 100, false, ['rogue'])]},
    {id: 'rogue', milestones: [milestone('Kill Gold', 300)], synergies: [synergy('Super Gold Amount', 500, true, ['hunter'])]},
    {id: 'hunter', milestones: [milestone('Boss Gold', 2000)]},
    {id: 'sovereign', milestones: [milestone('Ultra Gold Amount', 1000)]}
  ]);
  function arithmetic(trial, config) {
    const byId = Object.fromEntries(trial.map(s => [s.id, s]));
    const ms = id => byId[id]?.tile === 'milestone' ? 1.2 : 1;
    const ys = id => byId[id]?.tile === 'synergy' ? 1.1 : 1;
    const boost = id => byId[id]?.tile === 'skill' ? 1.2 : 1;
    const hasSovereign = !!byId.sovereign;
    const globalKill = f(300 * ms('rogue'));
    const killSupport = f(8070 * boost('rogue')) * f(28720 * boost('hunter'));
    const tiers = f(Math.round(500 * ys('rogue'))) * (hasSovereign ? f(1629 * boost('sovereign')) * f(1000 * ms('sovereign')) : 1);
    const overflow = f(hasSovereign ? 5 * 325.8 * boost('sovereign') : 0);
    const values = trial.map(member => {
      const personal = member.id === 'crusader';
      const base = globalKill * (personal ? f(100 * ms('crusader')) * f(Math.round(100 * ys('crusader'))) : 1)
        * (member.tile === 'killGold' ? f(config.goldKillGoldTile) : 1);
      const boss = f(2000 * ms('hunter')) * (personal ? f(400 * ms('crusader')) : 1);
      return base * boss * killSupport * tiers * overflow + (personal ? base * attacks(config.goldCrusaderAttacks, boost('crusader')) : 0);
    });
    return config.goldHero === 'best' ? Math.max(...values) : values[config.goldHero];
  }
  for (const size of [3, 4]) for (const goldHero of [0, 'best']) for (const count of [1, 1000000]) {
    const members = ['crusader', 'rogue', 'hunter', 'sovereign'].slice(0, size).map(id => slot(id));
    const config = {...plain, goldHero, goldKillGoldTile: count === 1 ? 100 : 0, goldCrusaderAttacks: count};
    let optimum = 0;
    function enumerate(trial, counts) {
      if (trial.length === size) { optimum = Math.max(optimum, arithmetic(trial, config)); return; }
      for (const tile of ['normal', 'milestone', 'synergy', 'skill', 'killGold']) {
        if ((counts[tile] || 0) >= (tile === 'killGold' ? 1 : tile === 'normal' ? 10 : 3)) continue;
        enumerate([...trial, {...members[trial.length], tile}], {...counts, [tile]: (counts[tile] || 0) + 1});
      }
    }
    enumerate([], {});
    const result = S.optimizePlacements(members, config, 'gold');
    near(result.score, optimum, `${size} heroes, ${goldHero}, ${count} hits`);
    near(arithmetic(result.team, config), optimum);
    near(S.evaluate(result.team, config).metrics.gold, optimum);
    near(S.makeScorer(config, 'gold', result.team)(result.team), optimum);
    assert.ok(result.team.filter(s => s.tile === 'skill').length <= 3);
  }
});

test('real-team detailed, compiled and placement scores agree across duplicate Crusaders and attacker modes', () => {
  const R = load();
  const members = ['crusader', 'rogue', 'hunter', 'sovereign', 'crusader', 'paladin', 'scout', 'crusader', 'captain', 'elementalist']
    .map((id, i) => slot(id, ['skill', 'skill', 'normal', 'skill', 'killGold', 'milestone', 'milestone', 'synergy', 'synergy', 'synergy'][i], 5000 + i * 500));
  for (const goldSkills of [false, true]) for (const snowFort of [false, true]) for (const goldHero of [0, 1, 4, 7, 'best', null]) {
    const config = {goldSkills, snowFort, goldHero, synergyEvent: true, baseOverflow: 125, goldCrusaderAttacks: 502};
    const result = R.evaluate(members, config);
    near(R.makeScorer(config, 'gold', members)(members), result.metrics.gold, JSON.stringify(config));
  }
  for (const goldHero of [0, 'best']) {
    const config = {...plain, goldHero, goldCrusaderAttacks: 3, synergyEvent: true};
    const before = R.evaluate(members, config).metrics.gold;
    const result = R.optimizePlacements(members, config, 'gold');
    near(result.score, R.evaluate(result.team, config).metrics.gold);
    assert.ok(result.score >= before * (1 - 1e-10));
    result.team.forEach((s, i) => assert.equal(s.id, members[i].id));
  }
});

test('automatic Gold suggestions can select Crusader for attack income while fixed killers stay fixed', () => {
  const members = [slot('other'), slot('other')];
  const config = {...plain, snowFort: false, goldHero: 'best'};
  const result = E.optimizeTeam(members, config, 'gold', ['other', 'crusader']);
  assert.equal(result.team[result.goldIndex].id, 'crusader');
  near(result.score, 33.1);
  const fixed = E.optimizeTeam(members, {...config, goldHero: 0}, 'gold', ['other', 'crusader']);
  assert.equal(fixed.team[0].id, 'other');
  near(fixed.score, 1);
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} Crusader Gold tests passed.\n`);
if (failures) process.exitCode = 1;
