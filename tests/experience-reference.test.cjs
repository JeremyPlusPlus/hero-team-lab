'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(heroes) {
  const context = vm.createContext({window: {}});
  if (heroes) context.window.HERO_DATA = {meta: {statAliases: {}}, heroes: heroes.map(hero => ({name: hero.id, milestones: [], synergies: [], ...hero}))};
  else vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), context);
  return context.window.HeroEngine;
}
const slot = (id, level = 500, tile = 'normal') => ({id, level, tile});
const milestone = (type, value, global = true) => ({type, value, global, level: 1});
const legacyExperienceSkills = {experienceVeteranSuperChance:106.2,experienceVeteranShareChance:258,
  experienceVeteranSuperAmountPerStack:16.3,experienceArcherBonus:0,experienceBallistaBonus:0,experienceBallistaMasteryPerStack:0};
const neutral = {experienceLeveler: 0, experienceStyle: 'none', experienceAttacker: 'self',
  milestoneScale: 1, synergyScale: 1, accountSynergyBoosts: false, grandMaster: false, snowFort: false,
  damageSkills: false, damageSupportSkills: false, goldSkills: false, experienceVeteranStacks: 0,
  experienceBaseRankXp: 100, baseOverflow: 0, overflowRate: 5,...legacyExperienceSkills};
const observed = {rankBonus: 66000000, superChance: 300, ultraChance: 300};
function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: expected ${expected}, received ${actual}`);
}
function check(engine, team, settings, expected) {
  const result = engine.evaluate(team, settings);
  near(result.metrics.experience, expected, 'detailed reference XP');
  near(engine.makeScorer(settings, 'experience', team)(team), expected, 'search reference XP');
  const comparison = engine.compareExperienceAttackers(result);
  for (const row of comparison.rows) {
    near(row.killScore, row.beforeSpillover * row.overflowFactor, 'comparison breakdown reproduces payout');
    near(row.beforeSpillover, row.rankFactor * row.bossFactor * row.superAmountFactor * row.ultraAmountFactor * row.rewardFactor * row.attackerTileFactor, 'comparison factors');
  }
  near(comparison.rows[comparison.selectedIndex].score, expected, 'comparison selected payout');
  return result;
}
function fixture() {
  const E = load([
    {id: 'trainee', milestones: [milestone('Rank Exp', 50, false), milestone('Rank Exp Multiplier', 5, false),
      milestone('Super Exp Chance', 20, false), milestone('Ultra Exp Chance', 10, false)]},
    {id: 'reference', milestones: [milestone('Rank Exp', 200), milestone('Super Exp Chance', 30),
      milestone('Ultra Exp Chance', 40), milestone('Super Exp Amount', 25)]},
    {id: 'candidate', milestones: [milestone('Rank Exp', 500), milestone('Super Exp Chance', 45),
      milestone('Ultra Exp Chance', 69), milestone('Super Exp Amount', 25)]},
    {id: 'amount', milestones: [milestone('Super Exp Amount', 100)]},
    {id: 'percent', milestones: [milestone('Rank Exp Multiplier', 10)]}
  ]);
  const team = [slot('trainee'), slot('reference')];
  const reference = E.captureExperienceReference(team, neutral, observed, 'Observed team');
  return {E, team, reference, settings: {...neutral, experienceReference: reference}};
}

test('a captured team reproduces observed Rank XP and total chances without adding its contribution twice', () => {
  const {E, team, reference, settings} = fixture();
  assert.equal(reference.rankBonus, observed.rankBonus);
  assert.equal(reference.superChance, 300);
  assert.equal(reference.ultraChance, 300);
  near(reference.rankFlat, 250, 'captured flat contribution');
  near(reference.rankMultiplier, 1.05, 'captured percent contribution');
  near(reference.modeledSuperChance, 50, 'captured total Super chance contribution');
  near(reference.modeledUltraChance, 50, 'captured total Ultra chance contribution');
  assert.equal(reference.label, 'Observed team');
  const result = check(E, team, settings, 1.25 * 21);
  const row = E.compareExperienceAttackers(result).rows[0];
  near(row.rankFactor, 1, 'reference rank is normalized');
  near(row.totalSuperChance, 300, 'captured Super total');
  near(row.totalUltraChance, 300, 'captured Ultra total');
  near(result.heroes[0].overflow.experience, 21, 'only 200 + 200 excess points spill over');
  check(E, team, {...settings, experienceBaseRankXp: 5000}, 1.25 * 21);
});

test('300 flat Rank XP on 66 million and 44 extra chance points produce only incremental gains', () => {
  const {E, reference, settings} = fixture();
  const team = [slot('trainee'), slot('candidate')];
  const rankFactor = 1 + 300 * 1.05 / (100 + 66000000);
  const result = check(E, team, settings, rankFactor * 1.25 * (21 + 44 * .05));
  const comparison = E.compareExperienceAttackers(result);
  near(comparison.rows[0].rankFactor, rankFactor, 'small flat reward ratio');
  near(comparison.rows[0].totalSuperChance, 315, 'incremental Super total');
  near(comparison.rows[0].totalUltraChance, 329, 'incremental Ultra total');
  assert.ok(comparison.rows[0].rankFactor < 1.000005);
  near(result.metrics.experience / (1.25 * 21), rankFactor * 23.2 / 21, 'existing spillover pool retained');
  assert.equal(reference.rankFlat, 250, 'reference stays anchored to the observed lineup');
});

test('amount and percentage Rank XP bonuses keep multiplying the calibrated payout', () => {
  const {E, team, settings} = fixture();
  check(E, [...team, slot('amount')], settings, 1.25 * 2 * 21);
  check(E, [...team, slot('percent')], settings, 1.1 * 1.25 * 21);
  check(E, [...team, slot('amount'), slot('percent')], settings, 1.1 * 1.25 * 2 * 21);
  check(E, [slot('trainee'),slot('candidate'),slot('amount'),slot('percent')],settings,
    (1+300*1.05/66000100)*1.1*1.25*2*23.2);
});

test('Super and Ultra chances each reach their own cap before entering shared spillover', () => {
  const E = load([{id: 'trainee'}, {id: 'old', milestones: [milestone('Super Exp Chance', 50), milestone('Ultra Exp Chance', 50)]},
    {id: 'shift', milestones: [milestone('Super Exp Chance', 80), milestone('Ultra Exp Chance', 20)]},
    {id: 'cross', milestones: [milestone('Super Exp Chance', 120), milestone('Ultra Exp Chance', -20)]}]);
  const team = [slot('trainee'), slot('old')];
  const reference = E.captureExperienceReference(team, neutral, {...observed, superChance: 50, ultraChance: 300}, 'One uncapped tier');
  const settings = {...neutral, experienceReference: reference};
  check(E, team, settings, 11);
  check(E, [slot('trainee'), slot('shift')], settings, 1 + 170 * .05);
  check(E, [slot('trainee'), slot('cross')], settings, 1 + (20 + 130) * .05);
  check(E, [slot('trainee'), slot('cross')], {...settings, baseOverflow: 80, overflowRate: 2}, 1 + .8 + 150 * .02);
});

test('candidate evaluation and repeated searches never recapture or mutate the reference', () => {
  const {E, team, reference, settings} = fixture();
  const snapshot = JSON.stringify(reference);
  const candidates = [team, [slot('trainee'), slot('candidate')], [slot('trainee'), slot('reference'), slot('percent')]];
  const score = E.makeScorer(settings, 'experience', team);
  for (const candidate of [...candidates, ...candidates.slice().reverse()]) {
    near(score(candidate), E.evaluate(candidate, settings).metrics.experience, 'reused reference scorer');
    assert.equal(JSON.stringify(reference), snapshot);
  }
  const refrozen = E.captureExperienceReference(team, settings, observed, 'Observed team');
  assert.equal(JSON.stringify(refrozen), snapshot, 'recapture derives modeled contributions independently of the existing reference');
});

test('capturing a new reference follows the displayed automatic style and attacker', () => {
  const E = load([{id:'trainee'},{id:'carrier',milestones:[milestone('Boss Exp',100,false)]},{id:'veteran'}]);
  const team = [slot('trainee',1250),slot('carrier',1000),slot('veteran',500)];
  const config = {...neutral,experienceStyle:'auto',experienceAttacker:'best'};
  const legacy = E.evaluate(team,config);
  assert.equal(legacy.experiencePlan.styleId,'expFactory');
  assert.equal(legacy.experiencePlan.attackerIndex,0);
  const reference = E.captureExperienceReference(team,{...config,experienceStyle:'expFactory',experienceAttacker:'self'},observed,'Initial reference');
  const settings = {...config,experienceReference:reference};
  const current = E.evaluate(team,settings);
  assert.equal(current.experiencePlan.styleId,'tycoon');
  assert.equal(current.experiencePlan.attackerIndex,1);
  const captured = E.captureExperienceReference(team,settings,observed,'Updated reference');
  assert.equal(captured.styleId,'tycoon');
  assert.equal(captured.attackerIndex,1);
  near(captured.rankMultiplier,1.05,'currently displayed Tycoon global bonus');
  near(captured.modeledSuperChance,106,'captured carrier has only the rounded Veteran chance');
  near(captured.modeledUltraChance,0,'carrier does not receive Factory personal chance');
});

test('reference XP calibration leaves other metrics and ordinary team scoring unchanged', () => {
  const {E,team,settings} = fixture();
  const calibrated = E.evaluate(team,settings), legacy = E.evaluate(team,neutral);
  for (const focus of ['energy','powerMageEnergy','gold','damage']) {
    near(calibrated.metrics[focus],legacy.metrics[focus],`${focus} is independent of the XP reference`);
    near(E.makeScorer(settings,focus,team)(team),legacy.metrics[focus],`${focus} search scorer`);
  }
  const ordinary = E.evaluate(team,{...neutral,experienceLeveler:null});
  const ordinaryWithReference = E.evaluate(team,{...settings,experienceLeveler:null});
  for (const focus of ['energy','powerMageEnergy','gold','damage','experience']) {
    near(ordinaryWithReference.metrics[focus],ordinary.metrics[focus],`${focus} without a leveling target`);
  }
});

test('the optimizer prefers multiplicative XP rewards over a negligible flat Rank XP increase', () => {
  const E = load([{id: 'trainee'}, {id: 'flat', milestones: [milestone('Rank Exp', 300)]},
    {id: 'amount', milestones: [milestone('Super Exp Amount', 10)]}]);
  const team = [slot('trainee', 1), slot('flat', 15000)];
  const reference = E.captureExperienceReference(team, neutral, observed, 'Current flat support');
  const settings = {...neutral, experienceReference: reference};
  const result = E.optimizeTeam(team, settings, 'experience', ['flat', 'amount']);
  assert.deepEqual(Array.from(result.team, hero => hero.id), ['trainee', 'amount']);
  near(result.score, (1 - 300 / 66000100) * 1.1 * 21, 'winning calibrated score');
  check(E, result.team, settings, result.score);
});

test('invalid references fall back to legacy scoring and finite negative fields are bounded', () => {
  const {E, team, reference} = fixture();
  assert.equal(E.settingsFor({experienceReference: null}).experienceReference, null);
  assert.equal(E.settingsFor({experienceReference: {rankBonus: 66000000}}).experienceReference, null);
  for (const field of ['rankBonus', 'superChance', 'ultraChance', 'rankFlat', 'rankMultiplier', 'modeledSuperChance', 'modeledUltraChance']) {
    for (const value of [NaN, Infinity, -Infinity, 'not a number']) {
      const config = {...neutral, experienceReference: {...reference, [field]: value}};
      assert.equal(E.settingsFor(config).experienceReference, null, `${field} must be finite`);
      near(E.evaluate(team, config).metrics.experience, E.evaluate(team, neutral).metrics.experience, 'invalid reference uses legacy scoring');
    }
  }
  for (const rankMultiplier of [0, -1]) {
    assert.equal(E.settingsFor({experienceReference: {...reference, rankMultiplier}}).experienceReference, null);
  }
  const bounded = E.settingsFor({experienceReference: {...reference, rankBonus: -100, superChance: -1,
    ultraChance: -10, rankFlat: -1000, modeledSuperChance: -50, modeledUltraChance: -50}}).experienceReference;
  for (const field of ['rankBonus', 'superChance', 'ultraChance', 'rankFlat', 'modeledSuperChance', 'modeledUltraChance']) {
    assert.equal(bounded[field], 0, `${field} is nonnegative`);
  }
});

const archerTeams = () => ({
  previous: [slot('viking',15000),slot('archer',1500),slot('wizard',15000,'synergy'),slot('veteran',15000,'skill'),
    slot('ranger',15000,'milestone'),slot('ballista',15000,'milestone'),slot('ballista',15000,'milestone'),
    slot('veteran',15000,'synergy'),slot('templar',15000),slot('veteran',15000,'synergy')],
  suggested: [slot('veteran',15000,'skill'),slot('archer',1500,'synergy'),slot('ranger',15000,'milestone'),
    slot('forester',15000),slot('ballista',15000),slot('ballista',15000,'milestone'),slot('ballista',15000,'milestone'),
    slot('veteran',15000,'synergy'),slot('templar',15000),slot('veteran',15000,'synergy')]
});

test('the confirmed default XP reference captures Archer at 5000 with all ten Grand Masters and Veteran active',()=>{
  const E=load(),reference=E.defaultExperienceReference();
  assert.equal(reference.rankBonus,66000000);
  assert.equal(reference.superChance,260);
  assert.equal(reference.ultraChance,450);
  assert.equal(reference.styleId,'grandMaster');
  assert.equal(reference.grandMasterCount,10);
  assert.equal(reference.levelerIndex,1);
  assert.equal(reference.attackerIndex,1);
  assert.equal(reference.team[1].id,'archer');
  assert.equal(reference.team[1].level,5000);
  assert.ok(reference.team.every((hero,index)=>index===1||hero.level===15000));
  const normal=E.evaluate(reference.team,{synergyEvent:true,grandMaster:true});
  assert.equal(normal.style.count,10);
  const bonuses=normal.heroes[1].bonuses;
  near(reference.rankFlat,bonuses['Rank Exp']||0,'normal ten-GM flat Rank XP');
  near(reference.rankMultiplier,bonuses['Rank Exp Multiplier']??1,'normal ten-GM Rank XP multiplier');
  near(reference.modeledSuperChance,bonuses['Super Exp Chance']||0,'ordinary team XP includes the same Veteran skill once');
  const skillsOff=E.evaluate(reference.team,{synergyEvent:true,grandMaster:true,experienceSkills:false});
  near(reference.modeledSuperChance-(skillsOff.heroes[1].bonuses['Super Exp Chance']||0),178,
    'Veteran contributes the rounded chance from 865 Skill Power');
  near(reference.modeledUltraChance,bonuses['Ultra Exp Chance']||0,'GM reference has no Factory personal Ultra chance');
  const captured=E.captureExperienceReference(reference.team,
    {synergyEvent:true,experienceLeveler:1,experienceAttacker:'self',experienceCaptureGrandMaster:true},
    {rankBonus:66000000,superChance:260,ultraChance:450},reference.label);
  assert.equal(JSON.stringify(captured),JSON.stringify(reference));
  const current=E.evaluate(reference.team,{synergyEvent:true,experienceLeveler:1,experienceStyle:'expFactory',
    experienceAttacker:'self',experienceCaptureGrandMaster:true});
  assert.equal(current.style.count,9,'capture-only GM flag does not change ordinary leveling play');
  assert.equal(current.experiencePlan.styleId,'expFactory');
});

test('only the exact old built-in XP reference upgrades to the confirmed ten-GM context',()=>{
  const E=load(),{previous}=archerTeams();
  const oldLabel='Archer 1,500 + Wizard/Viking · supports 15,000 · Exp Factory · event on · Veteran 100 stacks';
  // Replay the stored measurement from the previous release.
  const old={...E.captureExperienceReference(previous,
    {...legacyExperienceSkills,experienceLeveler:1,experienceStyle:'expFactory',experienceAttacker:'self',synergyEvent:true},observed,oldLabel),
    modeledSuperChance:220.01931970234375};
  const upgraded=E.upgradeExperienceReference(old);
  assert.equal(JSON.stringify(upgraded),JSON.stringify(E.defaultExperienceReference()));
  for(const changed of [
    {...old,label:'My measured reference'},
    {...old,rankBonus:65000000},
    {...old,superChance:301},
    {...old,team:old.team.map((hero,index)=>index===1?{...hero,level:2000}:hero)}
  ]) {
    assert.equal(JSON.stringify(E.upgradeExperienceReference(changed)),JSON.stringify(E.normalizeExperienceReference(changed)),'custom reference preserved');
  }
});

test('the earlier ten-GM built-in reference upgrades Veteran contributions without replacing custom measurements',()=>{
  const E=load(),current=E.defaultExperienceReference();
  const prior={...current,rankFlat:168.35401505320328,rankMultiplier:1,
    modeledSuperChance:218.67725167257814,modeledUltraChance:487.46028596043004};
  const beforeTileCorrection={...prior,modeledSuperChance:270.27725167257813};
  near(beforeTileCorrection.modeledSuperChance-current.modeledSuperChance,1.04,'only the Veteran tile chance changed');
  for(const saved of [prior,beforeTileCorrection]) {
    assert.equal(JSON.stringify(E.upgradeExperienceReference(saved)),JSON.stringify(current));
    for(const changed of [{...saved,superChance:261},{...saved,label:'My ten-GM observation'},
      {...saved,modeledSuperChance:saved.modeledSuperChance+1},
      {...saved,team:saved.team.map((hero,i)=>i===1?{...hero,level:4999}:hero)}]) {
      assert.equal(JSON.stringify(E.upgradeExperienceReference(changed)),JSON.stringify(E.normalizeExperienceReference(changed)));
    }
  }
});

test('the earlier level-1500 Archer comparison remains reproducible with its explicitly captured reference', () => {
  const E = load(), {previous,suggested} = archerTeams();
  const config = {...legacyExperienceSkills,experienceLeveler:1,experienceStyle:'auto',experienceAttacker:'best',synergyEvent:true};
  const reference = E.captureExperienceReference(previous,config,observed,'Previous Archer team');
  const settings = {...config,experienceReference:reference};
  const before = E.evaluate(previous,settings), after = E.evaluate(suggested,settings);
  assert.equal(before.experiencePlan.styleId,'expFactory');
  assert.equal(before.experiencePlan.attackerIndex,1);
  assert.equal(after.experiencePlan.styleId,'expFactory');
  assert.equal(after.experiencePlan.attackerIndex,1);
  const ratio = before.metrics.experience/after.metrics.experience;
  assert.ok(ratio > 1.5 && ratio < 1.65, `the previous team should be about 57% stronger, received ${ratio}`);
  check(E,previous,settings,before.metrics.experience);
  check(E,suggested,settings,after.metrics.experience);
  near(before.heroes[1].overflow.experience,21,'300% + 300% are already the complete reference chances');
  near(E.compareExperienceAttackers(before).rows[1].rankFactor,1,'displayed Rank XP already includes the previous team');
});
