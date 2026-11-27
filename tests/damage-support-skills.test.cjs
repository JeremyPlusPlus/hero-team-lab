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
const ids = ['apprentice', 'druid', 'witch', 'wizard', 'battlemage', 'spelldancer', 'skymage', 'templar', 'necromancer', 'titan'];
const allIds = [...ids, 'praetorian', 'deadeye', 'dicemaster', 'warden', 'warlord', 'other'];
const E = load(allIds.map(id => ({id})));
const plain = {milestoneScale: 1, synergyScale: 1, grandMaster: false, accountSynergyBoosts: false,
  snowFort: true, mapAttackSpeed: 0, mapMastery: 0, damageHero: 0,
  goldSkills: false, damageSkills: false, damageSupportSkills: true};
const f = value => 1 + value / 100;
const tests = [];
function test(name, run) { tests.push({name, run}); }
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
// Independent screenshot arithmetic: stack/time bonuses sum within their own
// mastery effect, then that effect multiplies the separate active effect.
function captured(id, active = 1, mastery = 1, seconds = 20, stacks = 0, teleports = 3, roll = 'midpoint') {
  let factor = 1, chance = 0;
  switch (id) {
    case 'apprentice': factor = f(41.2 * seconds * mastery); break;
    case 'druid': case 'witch': factor = f(7180 * active) * f(82.4 * seconds * mastery); break;
    case 'wizard': factor = f(7180 * active) * (1 + 2 * Math.min(1, 206 * mastery / 100)); break;
    case 'battlemage': chance = 1619 * active + 8.2 * stacks * mastery; break;
    case 'spelldancer': factor = f(8070 * active) * f(123.6 * stacks * mastery); break;
    case 'skymage': factor = f(1236 * teleports * mastery); break;
    case 'templar': factor = Math.max(1,(1436 * active + 41.2 * seconds * mastery)/100); break;
    case 'necromancer': {
      const values = roll === 'maximum' ? [8070, 1030, 618, 206] : [4047.5, 517.5, 310.5, 103.5];
      factor = f(values[0] * active) ** 2 * f(values[1] * mastery) * f(values[2] * mastery) * f(values[3] * mastery);
      break;
    }
    case 'titan': factor = f(1451 * active) * f(2060 * mastery); chance = 290.2 * active + 82 * mastery; break;
  }
  return {factor, chance};
}
function total(members, options = {}) {
  let factor = 1, chance = 0;
  const seen = new Set();
  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    const tiled = options.snowFort !== false && member.tile === 'skill';
    const active = tiled ? 1 + (options.damageSkillTileBoost ?? 20) / 100 : 1;
    const mastery = tiled ? 1 + (options.damageMasteryTileBoost ?? 20) / 100 : 1;
    const part = captured(member.id, active, mastery, options.damageSupportSeconds ?? 20,
      options.damageSupportStacks ?? 0, options.damageSupportTeleports ?? 3, options.damageNecromancerRoll ?? 'midpoint');
    factor *= part.factor; chance += part.chance;
  }
  return factor * (1 + ((options.baseOverflow ?? 0) + (options.overflowRate ?? 5) * chance) / 100);
}
function parity(engine, members, settings, expected, label = '') {
  const result = engine.evaluate(members, settings);
  near(result.metrics.damage, expected, label);
  near(engine.makeScorer(settings, 'damage', members)(members), expected, `${label} compiled`);
  return result;
}

test('all ten captured supports independently reproduce 20-second, zero-kill, 3-teleport damage', () => {
  assert.equal(E.defaults.damageSupportSeconds, 20);
  assert.equal(E.defaults.damageSupportStacks, 0);
  assert.equal(E.defaults.damageSupportTeleports, 3);
  assert.equal(E.defaults.damageNecromancerRoll, 'midpoint');
  for (const id of ids) {
    const members = [slot('other'), slot(id)];
    const result = parity(E, members, plain, total(members), id);
    result.heroes.forEach(hero => near(hero.metrics.damage, total(members), `${id} global recipient ${hero.id}`));
    const profile = result.damageSupportSkills.skills.find(s => s.id === id);
    assert.equal(profile.ownerIndex, 1);
    near(profile.factor, captured(id).factor);
    near(profile.chance, captured(id).chance);
  }
});

test('zero-kill pushing removes kill-earned mastery while retaining active, timed and teleport buffs', () => {
  for (const tile of ['normal', 'skill']) {
    const members = [slot('other'), slot('battlemage', tile), slot('spelldancer', tile), slot('druid'), slot('skymage')];
    const result = parity(E, members, plain, total(members), tile);
    const buffs = result.damageSupportSkills.skills;
    const battlemage = buffs.find(skill => skill.id === 'battlemage');
    const spelldancer = buffs.find(skill => skill.id === 'spelldancer');
    const boost = tile === 'skill' ? 1.2 : 1;
    assert.equal(result.damageSupportSkills.stacks, 0);
    assert.equal(battlemage.masteryEffects.length, 0);
    assert.equal(spelldancer.masteryEffects.length, 0);
    near(battlemage.chance, 1619 * boost, 'Battlemage active critical chance');
    near(spelldancer.factor, f(8070 * boost), 'Spelldancer active critical damage');
    near(buffs.find(skill => skill.id === 'druid').factor, f(7180) * f(82.4 * 20));
    near(buffs.find(skill => skill.id === 'skymage').factor, f(1236 * 3));
    const stackedSettings = {...plain, damageSupportStacks: 100};
    const stacked = parity(E, members, stackedSettings, total(members, stackedSettings), `${tile} explicit 100 kills`);
    assert.ok(stacked.metrics.damage > result.metrics.damage);
  }
});

test('all ten global support effects multiply together while chance bonuses share one overflow pool', () => {
  const members = ids.map(id => slot(id));
  const config = {...plain, baseOverflow: 125, overflowRate: 3};
  const result = parity(E, members, config, total(members, config));
  assert.equal(result.damageSupportSkills.skills.length, 10);
  result.heroes.forEach(h => near(h.metrics.damage, total(members, config), h.id));
  for (const damageHero of [0, 9, 'best', null]) parity(E, members, {...config, damageHero}, total(members, config));
});

test('only the first deployed copy supplies its support buff, even when a later duplicate has a skill tile', () => {
  for (const id of ids) {
    const later = [slot('other'), slot(id), slot(id, 'skill'), slot(id, 'skill')];
    const result = parity(E, later, plain, total(later), id);
    assert.equal(result.damageSupportSkills.skills.length, 1);
    assert.equal(result.damageSupportSkills.skills[0].ownerIndex, 1);
    near(result.damageSupportSkills.skills[0].tileBoost, 1);
    const first = [slot('other'), slot(id, 'skill'), slot(id), slot(id, 'skill')];
    parity(E, first, plain, total(first), `${id} first boosted`);
    assert.ok(total(first) > total(later), `${id} responds to first-copy tile`);
    const removed = later.filter((_, i) => i !== 1);
    parity(E, removed, plain, total(first), `${id} next copy becomes first`);
  }
});

test('support skill tiles boost active and mastery percentages once and map-off removes only placement gains', () => {
  for (const id of ids) {
    const members = [slot('other'), slot(id, 'skill')];
    parity(E, members, plain, total(members), id);
    parity(E, members, {...plain, snowFort: false}, total(members, {snowFort: false}), `${id} map off`);
    const activeOnly = {...plain, damageMasteryTileBoost: 0};
    parity(E, members, activeOnly, total(members, activeOnly), `${id} active tile boost only`);
    const masteryOnly = {...plain, damageSkillTileBoost: 0};
    parity(E, members, masteryOnly, total(members, masteryOnly), `${id} mastery tile boost only`);
  }
});

test('time, stack and teleport ramps remain separate additive mastery bonuses with zero-ramp active buffs intact', () => {
  for (const config of [{damageSupportSeconds: 0, damageSupportStacks: 0, damageSupportTeleports: 0},
    {damageSupportSeconds: 7.5, damageSupportStacks: 25, damageSupportTeleports: 2},
    {damageSupportSeconds: 35, damageSupportStacks: 200, damageSupportTeleports: 7}]) {
    for (const id of ids) {
      const members = [slot('other'), slot(id, 'skill')];
      parity(E, members, {...plain, ...config}, total(members, config), `${id} ${JSON.stringify(config)}`);
    }
  }
  const members = [slot('other'), slot('battlemage'), slot('spelldancer'), slot('skymage')];
  parity(E, members, {...plain, damageSupportStacks: 250, damageSupportTeleports: 2.9},
    total(members, {damageSupportStacks: 200, damageSupportTeleports: 2}));
  parity(E, members, {...plain, damageSupportStacks: 2.9, damageSupportTeleports: -1},
    total(members, {damageSupportStacks: 2, damageSupportTeleports: 0}));
  parity(E, members, {...plain, damageSupportStacks: -1}, total(members, {damageSupportStacks: 0}));
});

test('Wizard triple shot caps at three shots and does not become critical overflow or a 206-percent multiplier', () => {
  const members = [slot('other'), slot('wizard')];
  const isolated = {...plain, damageSupportWizardAttackSpeed: 0};
  parity(E, members, isolated, 3);
  parity(E, [slot('other'), slot('wizard', 'skill')], isolated, 3);
  parity(E, members, {...isolated, damageSupportWizardTripleShotChance: 50}, 2);
  parity(E, [slot('other'), slot('wizard', 'skill')], {...isolated, damageSupportWizardTripleShotChance: 50}, 2.2);
  parity(E, members, {...isolated, damageSupportWizardTripleShotChance: 0}, 1);
  parity(E, members, {...isolated, overflowRate: 0}, 3);
});

test('Necromancer uses the chosen midpoint or maximum scenario independently for each captured stat', () => {
  for (const tile of ['normal', 'skill']) for (const damageNecromancerRoll of ['midpoint', 'maximum']) {
    const members = [slot('other'), slot('necromancer', tile)], config = {...plain, damageNecromancerRoll};
    parity(E, members, config, total(members, config), `${tile} ${damageNecromancerRoll}`);
  }
  const edited = {...plain, damageSupportNecromancerDamageMin: 0, damageSupportNecromancerDamageMax: 200,
    damageSupportNecromancerAttackSpeedMin: 0, damageSupportNecromancerAttackSpeedMax: 100,
    damageSupportNecromancerCritDamageMin: 0, damageSupportNecromancerCritDamageMax: 0,
    damageSupportNecromancerSuperCritDamageMin: 0, damageSupportNecromancerSuperCritDamageMax: 0,
    damageSupportNecromancerUltraCritDamageMin: 0, damageSupportNecromancerUltraCritDamageMax: 0};
  parity(E, [slot('other'), slot('necromancer')], edited, 2 * 1.5);
  parity(E, [slot('other'), slot('necromancer')], {...edited, damageNecromancerRoll: 'maximum'}, 3 * 2);
});

test('attacker skills remain personal and combine with shared support chance exactly once', () => {
  const members = [slot('praetorian', 'damage'), slot('titan', 'skill'), slot('battlemage'), slot('other')];
  const titan = captured('titan', 1.2, 1.2), battlemage = captured('battlemage');
  const globalFactor = titan.factor;
  const chance = titan.chance + battlemage.chance;
  const attackerScore = globalFactor * f(7180) * f(6179) * 25.75 * (1 + (chance + 1436 + 124) * .05);
  const config = {...plain, damageSkills: true};
  const result = parity(E, members, config, attackerScore);
  for (const i of [1, 2, 3]) near(result.heroes[i].metrics.damage, globalFactor * (1 + chance * .05));
  parity(E, members, {...config, damageHero: 3}, globalFactor * (1 + chance * .05));
  parity(E, members, {...config, damageSupportSkills: false}, f(7180) * f(6179) * 25.75 * (1 + (1436 + 124) * .05));
});

test('Templar and Warlord pool splash on ordinary single-target attacks before applying the 100% floor', () => {
  assert.equal(E.statMode('Splash Damage'), 'add');
  const members = [slot('warlord'), slot('templar'), slot('other')];
  const config = {...plain, damageSkills:true};
  const warlord = f(4660) * f(2330) * f(3097) * (1 + 155 * .05);
  const result = parity(E, members, config, 27.26 * warlord);
  near(result.heroes[2].metrics.damage, 22.6);
  near(result.heroes[0].bonuses['Splash Damage'], 2726);
  near(result.heroes[2].bonuses['Splash Damage'], 2260);
  parity(E, members, {...config, damageWarlordSplashDamage:0}, 22.6 * warlord);
  const small = {...config,damageSupportTemplarSplashDamage:50,damageSupportTemplarSplashDamagePerSecond:1,damageWarlordSplashDamage:35};
  const crossing = parity(E,members,small,1.05*warlord);
  near(crossing.heroes[2].metrics.damage,1,'70% splash retains the full ordinary hit');
  const placement=E.optimizePlacements(members,config,'damage');
  near(placement.score,E.evaluate(placement.team,config).metrics.damage,'Warlord + Templar placement scorer');
});

test('Damage support toggles never alter Gold, XP, Energy or Power Mage Energy', () => {
  const R = load();
  const members = ids.map((id, i) => slot(id, i < 3 ? 'skill' : i < 6 ? 'milestone' : i < 9 ? 'synergy' : 'damage', 10000));
  const config = {damageHero: 0, goldHero: 0, experienceHero: 0, synergyEvent: true};
  const on = R.evaluate(members, config), off = R.evaluate(members, {...config, damageSupportSkills: false});
  for (const focus of ['gold', 'experience', 'energy', 'powerMageEnergy']) {
    near(on.metrics[focus], off.metrics[focus], focus);
    near(R.makeScorer(config, focus, members)(members), off.metrics[focus], `${focus} compiled`);
  }
});

test('captured support values are not amplified again by GM, event, map mastery or raw skill-power stats', () => {
  const S = load(['other', 'druid', 'witch', 'templar'].map(id => ({id,
    milestones: [milestone('Skill Power', 9000), milestone('Mastery Power', 9000)]})));
  const members = [slot('other'), slot('druid', 'skill'), slot('witch'), slot('templar')];
  for (const grandMaster of [false, true]) for (const synergyEvent of [false, true]) {
    const config = {...plain, grandMaster, synergyEvent, milestoneScale: 99, mapMastery: 9999};
    const on = S.evaluate(members, config), off = S.evaluate(members, {...config, damageSupportSkills: false});
    near(on.metrics.damage / off.metrics.damage, total(members));
  }
});

test('disabling support skills removes all support factors while preserving independent attacker skills and tiles', () => {
  const members = [slot('other', 'damage'), slot('druid', 'skill'), slot('titan', 'skill'), slot('wizard')];
  parity(E, members, {...plain, damageSupportSkills: false}, 25.75);
  parity(E, [slot('other')], plain, 1);
  assert.equal(E.evaluate(members, {...plain, damageSupportSkills: false}).damageSupportSkills.enabled, false);
});

test('placement optimization gives skill tiles to the first support owners and preserves identities, levels and locks', () => {
  const members = [slot('other', 'milestone', 100, true), slot('druid', 'normal', 200),
    slot('druid', 'skill', 300), slot('titan', 'normal', 400), slot('wizard', 'normal', 500)];
  const before = JSON.stringify(members), result = E.optimizePlacements(members, plain, 'damage');
  assert.equal(result.team[0].tile, 'damage');
  for (const i of [1, 3, 4]) assert.equal(result.team[i].tile, 'skill');
  assert.notEqual(result.team[2].tile, 'skill');
  result.team.forEach((s, i) => { assert.equal(s.id, members[i].id); assert.equal(s.level, members[i].level); assert.equal(s.locked, members[i].locked); });
  near(result.score, total(result.team) * 25.75);
  assert.equal(JSON.stringify(members), before);
});

test('fixed and best-attacker placement optimization match exhaustive legal tile assignments with competing support bonuses', () => {
  const S = load([
    {id: 'praetorian', milestones: [milestone('Damage', 100, false)]},
    {id: 'druid', milestones: [milestone('Damage', 300)], synergies: [{type: 'Crit Damage', value: 300, global: true, tier: 1, requires: ['spelldancer']}]},
    {id: 'spelldancer', milestones: [milestone('Attack Speed', 250)], synergies: [{type: 'Damage', value: 250, global: true, tier: 1, requires: ['skymage']}]},
    {id: 'skymage', milestones: [milestone('Super Crit Chance', 100)]}
  ]);
  const members = ['praetorian', 'druid', 'spelldancer', 'skymage'].map(id => slot(id));
  for (const damageHero of [0, 'best']) for (const damageTile of [0, 2475]) {
    const config = {...plain, damageHero, damageTile, damageSkills: true};
    let optimum = 0;
    function enumerate(at, trial, counts) {
      if (at === members.length) { optimum = Math.max(optimum, S.evaluate(trial, config).metrics.damage); return; }
      for (const tile of ['normal', 'milestone', 'synergy', 'skill', 'damage']) {
        const limit = tile === 'normal' ? 10 : tile === 'damage' ? 1 : 3;
        if ((counts[tile] || 0) >= limit) continue;
        enumerate(at + 1, [...trial, {...members[at], tile}], {...counts, [tile]: (counts[tile] || 0) + 1});
      }
    }
    enumerate(0, [], {});
    const result = S.optimizePlacements(members, config, 'damage');
    near(result.score, optimum, `${damageHero}, Damage tile ${damageTile}`);
    near(S.makeScorer(config, 'damage', result.team)(result.team), optimum);
  }
});

test('detailed and compiled real-team damage agree for fixed, best and legacy-average attackers', () => {
  const R = load();
  const members = ['praetorian', 'warlord', 'druid', 'druid', 'wizard', 'templar', 'necromancer', 'titan', 'battlemage', 'spelldancer']
    .map((id, i) => slot(id, ['damage', 'milestone', 'normal', 'skill', 'skill', 'synergy', 'skill', 'synergy', 'milestone', 'milestone'][i], 5000 + i * 500));
  for (const damageSupportSkills of [false, true]) for (const damageSkills of [false, true]) for (const snowFort of [false, true]) {
    for (const damageHero of [0, 1, 3, 7, 'best', null]) {
      const config = {damageSupportSkills, damageSkills, snowFort, damageHero, synergyEvent: true,
        damageSupportSeconds: 11.5, damageSupportStacks: 79, damageSupportTeleports: 2, baseOverflow: 125};
      const result = R.evaluate(members, config);
      near(R.makeScorer(config, 'damage', members)(members), result.metrics.damage, JSON.stringify(config));
    }
  }
});

test('team suggestions consider support skills while preserving a selected attacker and an eligible incumbent', () => {
  const members = [slot('praetorian'), slot('other'), slot('other')];
  const config = {...plain, damageSkills: true, snowFort: false};
  const result = E.optimizeTeam(members, config, 'damage', ['druid', 'titan', 'necromancer', 'other']);
  assert.equal(result.team[0].id, 'praetorian');
  assert.ok(result.team.slice(1).every(s => s.id !== 'other'));
  assert.equal(new Set(result.team.slice(1).map(s => s.id)).size, 2, 'unique active supports are stronger than a duplicate');
  near(result.score, E.evaluate(result.team, config).metrics.damage);
  const incumbent = result.score;
  const repeat = E.optimizeTeam(result.team, config, 'damage', ['druid', 'titan', 'necromancer', 'other']);
  assert.ok(repeat.score >= incumbent * (1 - 1e-10));
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} Damage support skill tests passed.\n`);
if (failures) process.exitCode = 1;
