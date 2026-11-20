'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const slot = id => ({id,level:25,tile:'normal',locked:false});
const base = {snowFort:false,grandMaster:false,milestoneScale:1,accountSynergyBoosts:false,
  goldSkills:false,damageSkills:false,damageSupportSkills:false,goldHero:0};
function load(heroes) {
  const context=vm.createContext({window:{HERO_DATA:{meta:{statAliases:{}},heroes:heroes.map(hero=>({
    name:hero.id,synergies:[],milestones:[],observedBaseStats:{damage:100,attackSpeed:20},...hero
  }))}}});
  for (const file of ['engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  }
  return context.window.HeroEngine;
}

test('partner reduction follows the owner and keeps duplicate partner requirements distinct', () => {
  const link = {type:'Kill Gold',tier:1,global:true,value:100,requires:['rogue','rogue']};
  const E=load([{id:'hunter',synergies:[link]},{id:'rogue'},
    {id:'champion',synergies:[{...link,value:200}]}]);
  const team=['hunter','rogue','champion'].map(slot);
  for (const [requirementReduction,grades,expected] of [
    [1,{},6], [0,{},1], [1,{hunter:{synergyReductionLevel:0}},3],
    [0,{hunter:{synergyReductionLevel:1}},2]
  ]) {
    const settings={...base,requirementReduction,heroAscensions:grades};
    assert.equal(E.evaluate(team,settings).metrics.gold,expected);
    assert.equal(E.makeScorer(settings,'gold',team)(team),expected);
    const pair=[...team,slot('rogue')], result=E.evaluate(pair,settings);
    assert.equal(result.metrics.gold,6);
    const link=result.effects.find(effect=>effect.kind==='synergy'&&effect.ownerId==='hunter');
    assert.equal(link.partnersNeeded,(grades.hunter?.synergyReductionLevel??requirementReduction)?1:2);
  }
  const missing=E.settingsFor({...base,requirementReduction:1,heroAscensions:{hunter:{synergyReductionLevel:1}}});
  assert.equal(E.synergyActive('hunter',{requires:['hunter']},{hunter:1},missing),false);
});

test('Immortal enforces each owner’s attack cap and cooldown floor while preserving a slower measured cooldown', () => {
  const E=load([{id:'champion'},{id:'hunter'}]), team=['champion','hunter'].map(slot);
  const settings={...base,heroAscensions:{champion:{maxAttackSpeedLevel:3,minSkillCooldownLevel:2}}};
  const config={mode:'skill',buffTeam:'warlock',championCooldown:.25,fightSeconds:60};
  const result=E.immortal.evaluate(team,settings,config);
  assert.equal(result.heroes[0].aps,13);
  assert.equal(result.heroes[1].aps,10);
  assert.equal(result.heroes[0].skillCooldown,.5);
  assert.equal(result.heroes[0].castRate,2);
  const legacy=E.immortal.evaluate(team,base,config);
  assert.equal(legacy.heroes[0].skillCooldown,1);
  const measured=E.immortal.evaluate(team,settings,{...config,championCooldown:2});
  assert.equal(measured.heroes[0].skillCooldown,2);
  assert.equal(measured.heroes[0].castRate,.5);
  const listed=E.immortal.evaluate(team,settings,{...config,buffTeam:'deploy'});
  assert.equal(listed.heroes[0].skillCooldown,24);
  assert.ok(Math.abs(E.immortal.makeScorer(settings,config)(team)/result.score-1)<1e-12);
});

test('free run levels preserve fixed-level payouts and Rank XP scores', () => {
  const E=load([{id:'hunter'}]), team=[slot('hunter')];
  const free={...base,heroAscensions:{hunter:{freeHeroLevelChanceLevel:5}}};
  assert.equal(E.settingsFor(free).heroAscensions.hunter.freeHeroLevelChanceLevel,5);
  assert.deepEqual(E.evaluate(team,free).metrics,E.evaluate(team,base).metrics);
});
