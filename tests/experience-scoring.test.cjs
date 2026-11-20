'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
function load(heroes) {
  const data = {meta: {statAliases: {}}, heroes: heroes.map(h => ({name: h.id, milestones: [], synergies: [], ...h}))};
  const context = vm.createContext({window: {HERO_DATA: data}});
  vm.runInContext(engineSource, context);
  return context.window.HeroEngine;
}
const slot = (id, level, tile = 'normal') => ({id, level, tile});
const milestone = (type, value, global = false) => ({type, value, global, level: 1});
const synergy = (tier, requires, value = 1) => ({index: tier, tier, requires, value, type: 'Rank Exp', global: true});
const settings = {experienceLeveler: 0, experienceStyle: 'none', experienceAttacker: 'self',
  milestoneScale: 1, synergyScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
  damageSkills: false, damageSupportSkills: false, goldSkills: false, experienceVeteranStacks: 0,
  experienceVeteranSuperChance:106.2,experienceVeteranShareChance:258,experienceVeteranSuperAmountPerStack:16.3,
  experienceArcherBonus:0,experienceBallistaBonus:0,experienceBallistaMasteryPerStack:0};
function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: expected ${expected}, received ${actual}`);
}
function compare(engine, team, config, expected) {
  const result = engine.evaluate(team, config);
  near(result.metrics.experience, expected, 'detailed XP');
  near(engine.makeScorer(config, 'experience', team)(team), expected, 'search XP');
  return result;
}

test('each style unlocks at its listed level and keeps its personal and global effects', () => {
  const engine = load([{id: 'trainee', milestones: [milestone('Rank Exp', 100, true)]}]);
  const cases = [
    // The initial 100 Rank XP and the flat 100 milestone are affected equally by Rank XP percentages.
    {level: 1, style: 'auto', applied: 'none', xp: 2},
    {level: 249, style: 'expFactory', applied: 'none', xp: 2},
    {level: 250, style: 'expFactory', applied: 'none', xp: 2},
    {level: 299, style: 'commander', applied: 'none', xp: 2},
    {level: 300, style: 'commander', xp: 2, damage: 1.25 * .5, gold: 1.25},
    {level: 499, style: 'expFactory', applied: 'none', xp: 2},
    {level: 500, style: 'expFactory', xp: 2 * 2 * (1 + .05 * 13), damage: 1.15},
    {level: 999, style: 'none', xp: 2},
    {level: 1000, style: 'none', xp: 2 * 2},
    {level: 1249, style: 'tycoon', applied: 'none', xp: 2 * 2},
    {level: 1250, style: 'tycoon', xp: 2 * 2 * 1.05, damage: .05, gold: 1.35},
    {level: 2499, style: 'industrialist', applied: 'none', xp: 2 * 2},
    {level: 2500, style: 'industrialist', xp: 2 * 2 * 2 * 1.4 * 1.75 * (1 + .05 * 20), gold: .01}
  ];
  for (const c of cases) {
    const result = compare(engine, [slot('trainee', c.level)], {...settings, experienceStyle: c.style}, c.xp);
    assert.equal(result.experiencePlan.styleId, c.applied || c.style);
    near(result.metrics.damage, c.damage ?? 1, 'attacker damage');
    near(result.metrics.gold, c.gold ?? 1, 'attacker gold');
  }
});

test('the leveling Rank XP baseline weights flat rewards independently of style percentages', () => {
  const engine = load([{id:'trainee',milestones:[milestone('Rank Exp',50,true)]}]);
  const team = [slot('trainee',1250)];
  for (const base of [100,5000,6.98e12]) {
    compare(engine,team,{...settings,experienceStyle:'tycoon',experienceBaseRankXp:base},(1+50/base)*1.05*2);
  }
  near(engine.evaluate(team,{...settings,experienceLeveler:null,experienceBaseRankXp:5000}).metrics.experience,1.5,'ordinary XP card');
  assert.equal(engine.settingsFor({experienceBaseRankXp:0}).experienceBaseRankXp,1);
  assert.equal(engine.settingsFor({experienceBaseRankXp:Infinity}).experienceBaseRankXp,100);
});

test('Militia vs Veteran attributes each boss bonus and isolates the Factory chance difference at 500', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','data.js'),'utf8'),context);
  vm.runInContext(engineSource,context);
  const engine = context.window.HeroEngine;
  const config = {...settings,experienceStyle:'auto',experienceAttacker:'best',experienceVeteranStacks:100};
  const lineup = level => [slot('militia',level),{...slot('veteran',15000),locked:true}];
  const inspect = (level, options = {}) => {
    const result = engine.evaluate(lineup(level),{...config,...options});
    const comparison = engine.compareExperienceAttackers(result);
    near(comparison.rows[comparison.selectedIndex].score,result.metrics.experience,'selected boss-kill payout');
    for (const row of comparison.rows) {
      near(row.bossFactor,row.personalBossFactor*comparison.globalBossFactor,'boss factors');
      near(row.killScore,row.beforeSpillover*row.overflowFactor,'complete boss kill');
      near(row.score,row.killScore*(row.shared?comparison.shareChance:1),'received XP');
    }
    return comparison;
  };
  for (const level of [249,250,299,300,499]) {
    const early = inspect(level);
    assert.equal(early.selectedIndex,1);
    assert.equal(early.rows[0].bossSources.length,0);
    near(early.rows[1].beforeSpillover/early.rows[0].beforeSpillover,2,'Veteran has the level 1,000 bonus');
  }
  const factory = inspect(500), [militia,veteran] = factory.rows;
  assert.equal(factory.selectedIndex,0);
  assert.equal(factory.styleId,'expFactory');
  assert.equal(militia.bossSources[0].styleName,'Exp Factory');
  assert.equal(veteran.bossSources[0].level,1000);
  near(militia.personalBossFactor,2,'Factory boss bonus');
  near(veteran.personalBossFactor,2,'trained Veteran boss bonus');
  near(militia.beforeSpillover,veteran.beforeSpillover,'payout before chance spillover');
  near(militia.personalSuperChance,10,'Factory super chance');
  near(militia.personalUltraChance,3,'Factory ultra chance');
  assert.deepEqual(Array.from(militia.chanceSources,source=>source.value),[10,3]);
  near(militia.overflowFactor-veteran.overflowFactor,.65,'13 points at 5% per point');
  const tied = inspect(500,{experienceStyle:'expFactory',overflowRate:0});
  near(tied.rows[0].score,tied.rows[1].score,'same boss XP with chance spillover off');
  near(inspect(999).rows[0].personalBossFactor,2,'only Factory supplies Boss XP until level 1,000');
  const trained = inspect(1000);
  near(trained.rows[0].personalBossFactor,4,'level 1,000 stacks with Factory');
  assert.equal(trained.rows[0].bossSources.length,2);
  assert.equal(trained.rows[1].bossSources.length,1);
  const recommendation = engine.suggestExperienceRange(lineup(500),config,['militia','veteran'],500);
  const saved = JSON.parse(JSON.stringify(recommendation.attackerComparison));
  near(saved.rows[saved.selectedIndex].score,recommendation.score,'serialized range winner');
  assert.equal(saved.rows[1].bossSources[0].level,1000);
});

test('the leveling hero leaves Grand Master and its global style scales the whole team', () => {
  const engine = load([{id: 'trainee', synergies: [synergy(1, ['support'], 100)]},
    {id: 'support', milestones: [milestone('Rank Exp', 100, true)]}]);
  const team = [slot('trainee', 500), slot('support', 500), slot('support', 500)];
  const config = {...settings, grandMaster: true, experienceStyle: 'commander'};
  const styleScale = 1.1 ** 2;
  const flat = 2 * 100 * styleScale + Math.round(100 * styleScale * 1.04);
  const result = compare(engine, team, config, 1 + flat / 100);
  assert.equal(result.style.count, 2);
  near(result.heroes[0].metrics.damage, 2.5 ** 2 * 1.25 * .5, 'Commander speed penalty');
  near(result.heroes[1].metrics.damage, 2.5 ** 2 * 1.25 * .1, 'Grand Master speed penalty');
});

test('one, two and three leveling copies leave nine, eight and seven Grand Masters', () => {
  const supports = Array.from({length: 9}, (_, i) => ({id: `support${i}`,
    milestones: [milestone('Rank Exp', 10, true)]}));
  const engine = load([{id: 'trainee', milestones: [milestone('Rank Exp', 100, true),
    {...milestone('Rank Exp', 100000, true), level: 1000}]}, ...supports]);
  for (const copies of [1, 2, 3]) {
    const team = [slot('trainee', 1), ...Array.from({length: copies - 1}, () => ({...slot('trainee', 15000), locked: true})),
      ...supports.slice(0, 10 - copies).map(hero => slot(hero.id, 15000))];
    const before = JSON.stringify(team);
    const count = 10 - copies;
    const expected = 1 + (copies * 100 + count * 10) * 1.1 ** count / 100;
    const result = compare(engine, team, {...settings, grandMaster: true}, expected);
    assert.equal(result.style.count, count);
    assert.deepEqual(Array.from(result.heroes.slice(0, copies), hero => hero.level), Array(copies).fill(1));
    assert.equal(result.effects.filter(effect => effect.styleName === 'Grand Master' && effect.type === 'Damage').length, count);
    assert.equal(result.effects.filter(effect => effect.ownerId === 'trainee' && effect.type === 'Boss Exp').length, 0);
    assert.equal(JSON.stringify(team), before, 'evaluation preserves the saved input slots');
  }
});

test('every leveling copy supplies the selected global style and receives its personal style', () => {
  const engine = load([{id: 'trainee', synergies: [synergy(1, ['support'], 100)]},
    {id: 'support', milestones: [milestone('Rank Exp', 100, true)]}]);
  const styles = [
    {id: 'commander', level: 300, synergy: .04, xp: copies => 1, damage: copies => 1.25 ** copies * .5},
    {id: 'expFactory', level: 500, synergy: 0, xp: copies => 2 * 1.65, damage: copies => 1.15 ** copies},
    {id: 'tycoon', level: 1250, synergy: .05, xp: copies => 2 * 1.05 ** copies, damage: copies => .05},
    {id: 'industrialist', level: 2500, synergy: 0, xp: copies => 4 * 1.4 * 1.75 * 2, damage: copies => 1},
    {id: 'magnate', level: 4000, synergy: .08, xp: copies => 2 * 1.12 ** copies, damage: copies => .01}
  ];
  for (const copies of [2, 3]) for (const style of styles) for (const stacking of ['multiply', 'add']) {
    const team = [slot('trainee', style.level), ...Array.from({length: copies - 1}, () => slot('trainee', 15000)), slot('support', 500)];
    const synergyStrength = stacking === 'multiply' ? 1.1 * (1 + style.synergy) ** copies : 1.1 + style.synergy * copies;
    const flat = 110 + copies * Math.round(100 * synergyStrength);
    const config = {...settings, grandMaster: true, experienceStyle: style.id,
      grandMasterStacking: stacking, synergyGrandMasterStacking: stacking};
    const result = compare(engine, team, config, (1 + flat / 100) * style.xp(copies));
    assert.equal(result.style.count, 1);
    near(result.style.synergyBonusScale, synergyStrength, `${style.id} synergy scaling`);
    for (const hero of result.heroes.slice(0, copies)) {
      assert.equal(hero.level, style.level);
      near(hero.metrics.experience, result.heroes[0].metrics.experience, `${style.id} duplicate personal XP`);
      near(hero.metrics.damage, 2.5 * style.damage(copies), `${style.id} duplicate damage`);
    }
  }
});

test('progression gates both owners and partners at each tier and honors the account cap', () => {
  const minima = [1, 15, 50, 100, 150, 250, 500, 1000, 1500];
  const engine = load(['trainee', 'support'].map((id, index) => ({id,
    synergies: minima.map((_, t) => synergy(t + 1, [index ? 'trainee' : 'support']))})));
  for (const level of new Set(minima.flatMap(n => [Math.max(1, n - 1), n]))) {
    for (const maxTier of [0, 5, 9]) {
      const tiers = Math.min(maxTier, minima.filter(n => n <= level).length);
      const result = compare(engine, [slot('trainee', level), slot('support', 1)], {...settings, maxTier},
        (1 + 2 * tiers / 100) * (level >= 1000 ? 2 : 1));
      assert.equal(result.counts.synergies, 2 * tiers, `level ${level}, tier cap ${maxTier}`);
    }
  }
});

test('all underlevel copies are excluded from locked synergy tiers as owners and partners', () => {
  const engine = load([{id: 'trainee', synergies: [synergy(6, ['trainee'], 100)]},
    {id: 'support', synergies: [synergy(6, ['trainee', 'trainee', 'other'], 100)]}, {id: 'other'}]);
  const team = [slot('trainee', 249), slot('trainee', 5000), slot('support', 5000)];
  compare(engine, team, {...settings, requirementReduction: 1}, 1);
  // A stale support level cannot make another copy eligible for a higher tier.
  compare(engine, [...team, slot('other', 5000)], {...settings, requirementReduction: 1}, 1);
  const three = [...team, slot('trainee', 5000)];
  compare(engine, three, {...settings, requirementReduction: 1}, 1);
  // All copies unlock together and reserve a different copy for self requirements.
  three[0].level = 250;
  const result = compare(engine, three, {...settings, requirementReduction: 1}, 5);
  assert.deepEqual(Array.from(result.effects.filter(e => e.kind === 'synergy'), e => e.ownerIndex).sort(), [0, 1, 2, 3]);
  compare(engine, three, {...settings, requirementReduction: 0}, 4);
  compare(engine, [...three, slot('other', 5000)], {...settings, requirementReduction: 0}, 5);
});

test('a reused search scorer refreshes shared styles and progression when candidate duplicate counts change', () => {
  const engine = load([{id: 'trainee', milestones: [milestone('Rank Exp', 40, true),
    {...milestone('Super Exp Amount', 100, true), level: 1000}], synergies: [synergy(6, ['trainee'], 100)]},
    {id: 'support', milestones: [milestone('Rank Exp', 25, true)]}, {id: 'veteran'}]);
  const template = [slot('trainee', 1), slot('support', 15000), slot('support', 15000), slot('veteran', 15000)];
  for (const experienceStyle of ['none', 'commander', 'expFactory', 'tycoon', 'industrialist', 'magnate', 'auto']) {
    const config = {...settings, grandMaster: true, experienceStyle, experienceAttacker: 'best'};
    const score = engine.makeScorer(config, 'experience', template);
    for (const level of [1, 249, 250, 300, 500, 999, 1000, 1250, 2500, 3999, 4000]) {
      for (const copies of [1, 3, 2, 1, 2, 3]) {
        const team = template.map((hero, index) => index < copies ? {...hero, id: 'trainee', level: index ? 15000 : level} : {...hero});
        near(score(team), engine.evaluate(team, config).metrics.experience, `${experienceStyle}, level ${level}, ${copies} copies`);
        // The selected hero can change without changing the selected slot or team size.
        const switched = team.map((hero, index) => index === 0 ? {...hero, id: 'support'} : hero);
        near(score(switched), engine.evaluate(switched, config).metrics.experience, `${experienceStyle}, switched hero at ${level}`);
      }
    }
  }
});

test('Veteran shares one attacker payout and changing attackers changes the side metrics', () => {
  const engine = load([{id: 'trainee'}, {id: 'carrier', milestones: [
    milestone('Boss Exp', 50), milestone('Kill Gold', 100), milestone('Damage', 200)]}, {id: 'veteran'}]);
  const team = [slot('trainee', 500), slot('carrier', 1000)];
  const config = {...settings, experienceStyle: 'expFactory', experienceAttacker: 'best'};
  const own = 2 * (1 + .05 * 13);
  const direct = compare(engine, team, config, own);
  assert.equal(direct.experiencePlan.attackerIndex, 0);
  compare(engine, team, {...config, experienceAttacker: 1}, 0);
  const sharedTeam = [...team, slot('veteran', 500)];
  const shared = 2 * 1.5 * (1 + .05 * 106);
  const result = compare(engine, sharedTeam, {...config, experienceAttacker: 1}, shared);
  assert.equal(result.experiencePlan.shared, true);
  assert.equal(result.experiencePlan.attackerIndex, 1);
  near(result.metrics.damage, 3 * 1.15, 'carrier gets the global attack speed bonus');
  near(result.metrics.gold, 2, 'carrier gold');
  const self = 2 * (1 + .05 * (13 + 106));
  compare(engine, sharedTeam, {...config, experienceAttacker: 'self'}, self);
  assert.equal(compare(engine, sharedTeam, config, Math.max(shared, self)).experiencePlan.attackerIndex, 1);
});

test('duplicate Veterans supply one global capped mastery and one tiled active proc chance', () => {
  const engine = load([{id: 'trainee'}, {id: 'veteran'}]);
  const team = [slot('trainee', 1), slot('veteran', 1), slot('veteran', 1, 'skill')];
  for (const [inputStacks, stacks] of [[0, 0], [3, 3], [100, 100], [134, 100]]) {
    const amount = 1 + 16.3 * stacks / 100;
    const chance = 1 + .05 * 126;
    compare(engine, team, {...settings, snowFort: true, experienceVeteranStacks: inputStacks}, amount * chance);
  }
});

test('a Veteran leveler can receive shared XP, and equal payouts favor its own slot', () => {
  const engine = load([{id: 'carrier'}, {id: 'veteran'}]);
  const team = [slot('carrier', 1000), slot('veteran', 999)];
  const config = {...settings, experienceLeveler: 1, experienceAttacker: 'best'};
  const payout = 2 * (1 + .05 * 106);
  const shared = compare(engine, team, config, payout).experiencePlan;
  assert.equal(shared.levelerIndex, 1);
  assert.equal(shared.veteranIndex, 1);
  assert.equal(shared.attackerIndex, 0);
  team[1].level = 1000;
  const direct = compare(engine, team, config, payout).experiencePlan;
  assert.equal(direct.attackerIndex, 1);
  assert.equal(direct.shared, false);
});

test('auto evaluates styles with each attacker using the current candidate team', () => {
  const engine = load([{id: 'trainee'}, {id: 'carrier', milestones: [milestone('Boss Exp', 1000)]}, {id: 'veteran'}]);
  const template = [slot('trainee', 1), slot('carrier', 15000), slot('veteran', 15000)];
  const config = {...settings, experienceStyle: 'auto', experienceAttacker: 'best'};
  const score = engine.makeScorer(config, 'experience', template);
  for (const level of [1, 249, 250, 299, 300, 499, 500, 999, 1000, 1250, 2500, 3999, 4000, 4500]) {
    for (const veteran of [false, true]) {
      const team = [slot('trainee', level), template[1], veteran ? template[2] : template[1]];
      const styles = ['none', ...(level >= 300 ? ['commander'] : []), ...(level >= 500 ? ['expFactory'] : []),
        ...(level >= 1250 ? ['tycoon'] : []), ...(level >= 2500 ? ['industrialist'] : []), ...(level >= 4000 ? ['magnate'] : [])];
      const scores = styles.flatMap(experienceStyle => team.map((_, experienceAttacker) =>
        engine.evaluate(team, {...config, experienceStyle, experienceAttacker}).metrics.experience));
      const best = Math.max(...scores);
      near(score(team), best, `candidate at level ${level}`);
      const result = engine.evaluate(team, config);
      near(result.metrics.experience, best, 'best over fixed choices');
      if (veteran && level >= 1250) assert.equal(result.experiencePlan.styleId, level >= 4000 ? 'magnate' : 'tycoon');
    }
  }
});
