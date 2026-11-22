'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
function load(heroes) {
  const context = vm.createContext({window:{}});
  if (heroes) {
    context.window.HERO_DATA = {meta:{statAliases:{}}, heroes:heroes.map(hero => ({
      name:hero.id, milestones:[], synergies:[], ...hero
    }))};
  } else {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8'), context);
  }
  vm.runInContext(engineSource, context);
  return context.window.HeroEngine;
}
const milestone = (value, global, level = 1, type = 'Skill Power') => ({type,value,global,level});
const synergy = (value, global, requires, tier = 1) => ({type:'Skill Power',value,global,requires,tier});
const slot = (id, level = 25, tile = 'normal', locked = false) => ({id,level,tile,locked});
const neutral = {milestoneScale:1,synergyScale:1,grandMaster:false,snowFort:true,accountSynergyBoosts:false};
const tags = {archerExperienceTag:'archer',hunterGoldTag:'hunter'};

test('real Archer and Hunter personal milestones raise Tag scores at their exact unlock levels', () => {
  const engine = load();
  const settings = {...neutral, snowFort:false, maxTier:0};
  const checkpoints = {
    archer: [[499,0], [500,3], [999,3], [1000,7], [4999,7], [5000,22], [15000,22]],
    hunter: [[249,0], [250,2], [2499,2], [2500,10], [4999,10], [5000,25], [15000,25]]
  };
  for (const [focus,id] of Object.entries(tags)) {
    const searchScore = engine.makeScorer(settings, focus, [slot(id)]);
    for (const [level,expected] of checkpoints[id]) {
      const team = [slot(id,level)];
      const result = engine.evaluate(team, settings);
      const label = id + ' at level ' + level;
      assert.equal(result.heroes[0].local.milestone['Skill Power'] ?? 0, expected, label);
      assert.equal(result.metrics[focus], expected, label);
      assert.equal(searchScore(team), expected, label);
    }
  }
});

test('each tag uses its strongest caster’s unlocked personal and shared power, then applies GM and the caster tile once', () => {
  const E = load([
    {id:'archer',milestones:[milestone(14,false,25)],synergies:[synergy(5,false,['support'])]},
    {id:'hunter',milestones:[milestone(3,false)]},
    {id:'support',milestones:[milestone(10,true),milestone(9000,false),milestone(7000,true,1,'Mastery Power')],
      synergies:[synergy(8,true,['archer','archer'],7)]}
  ]);
  const team = [slot('archer',1,'skill'),slot('hunter',5,'skill'),slot('archer',25),slot('support',25,'milestone')];
  const s = {...neutral,grandMaster:true,archerTagBasePower:20,hunterTagBasePower:7,mapT7:77,damageSkillTileBoost:123};
  const r = E.evaluate(team,s);
  const strength = 1.1**4, powerFactor = 1.05**4;
  const globalPower = 10*(strength+0.2) + Math.round(8*strength*1.77);
  const archerPower = 14*strength + Math.round(5*strength);
  const archerScore = Math.round((20+globalPower+archerPower)*powerFactor);
  const hunterScore = Math.round((7+globalPower+3*strength)*(powerFactor*1.2));
  assert.equal(r.tagCasters.archerExperienceTag.index,2);
  assert.equal(r.tagCasters.archerExperienceTag.globalPower,globalPower);
  assert.equal(r.tagCasters.archerExperienceTag.personalPower,archerPower);
  assert.equal(r.metrics.archerExperienceTag,archerScore);
  assert.equal(r.tagCasters.hunterGoldTag.index,1);
  assert.equal(r.tagCasters.hunterGoldTag.basePower,7);
  assert.equal(r.tagCasters.hunterGoldTag.grandMasterFactor,powerFactor);
  assert.equal(r.tagCasters.hunterGoldTag.tileFactor,1.2);
  assert.equal(r.tagCasters.hunterGoldTag.score,hunterScore);
  assert.equal(r.metrics.hunterGoldTag,hunterScore);
  for (const focus of Object.keys(tags)) {
    assert.equal(E.makeScorer(s,focus,team)(team),r.metrics[focus]);
  }
  const withoutPartner = team.slice(1);
  const off = {...neutral,snowFort:false,maxTier:0};
  assert.equal(E.evaluate(withoutPartner,off).metrics.archerExperienceTag,24);
  assert.equal(E.evaluate(withoutPartner,off).metrics.hunterGoldTag,13);
  assert.equal(E.evaluate(team,off).metrics.hunterGoldTag,13);
  assert.equal(E.evaluate(withoutPartner,neutral).tagCasters.hunterGoldTag.globalPower,12);
});

test('missing tag heroes score zero even with base power, and inactive payout profiles can still be used for tagging', () => {
  const E = load([{id:'archer'}, {id:'hunter'}, {id:'support',milestones:[milestone(30,true)]}]);
  const s = {...neutral,snowFort:false,archerTagBasePower:50,hunterTagBasePower:62,experienceSkills:false,goldSkills:false};
  for (const [focus,id] of Object.entries(tags)) {
    const absent = [slot('support')], present = [slot('support'),slot(id,1,'skill')];
    const r = E.evaluate(absent,s);
    assert.equal(r.tagCasters[focus],null);
    assert.equal(r.metrics[focus],0);
    assert.equal(E.makeScorer(s,focus,absent)(absent),0);
    assert.throws(() => E.optimizePlacements(absent,s,focus),new RegExp(id,'i'));
    assert.equal(E.evaluate(present,s).metrics[focus],30+s[id+'TagBasePower']);
    assert.equal(E.makeScorer(s,focus,present)(present),30+s[id+'TagBasePower']);
  }
});

// Enumerate every relevant placement for this fixture independently of the
// search. Both copies unlock the synergy, but only the high-level copy has
// the personal milestone. Skill tiles on a support affect neither caster.
function bruteForceTagPower(team,basePower) {
  const choices = ['normal','skill','milestone','synergy'];
  let best = 0;
  for (let assignment = 0; assignment < 4**team.length; assignment++) {
    const tiles = team.map((_,i) => choices[Math.floor(assignment/4**i)%4]);
    if (choices.slice(1).some(type => tiles.filter(tile => tile===type).length>3)) continue;
    const globalPower = 12*(tiles[2]==='milestone'?1.2:1) + Math.round(15*(tiles[3]==='synergy'?1.1:1));
    for (const i of [0,1]) {
      const personal = (team[i].level>=25 ? 10*(tiles[i]==='milestone'?1.2:1) : 0)
        + Math.round(3*(tiles[i]==='synergy'?1.1:1));
      const power = Math.round((basePower+globalPower+personal)*(tiles[i]==='skill'?1.2:1));
      best = Math.max(best,power);
    }
  }
  return best;
}

for (const [focus,id] of Object.entries(tags)) {
  test(focus+' placements match independent enumeration with duplicate casters', () => {
    const E = load([
      {id,milestones:[milestone(10,false,25)],synergies:[synergy(3,false,['linked'])]},
      {id:'flat',milestones:[milestone(12,true)]},
      {id:'linked',synergies:[synergy(15,true,[id,id])]}
    ]);
    const team = [slot(id,1,'skill'),slot(id,25,'normal',true),slot('flat'),slot('linked')];
    const s = {...neutral,[id+'TagBasePower']:15};
    const before = JSON.stringify(team);
    const suggestion = E.optimizePlacements(team,s,focus);
    assert.equal(suggestion.score,bruteForceTagPower(team,15));
    assert.equal(suggestion.score,E.evaluate(suggestion.team,s).metrics[focus]);
    assert.equal(E.makeScorer(s,focus,team)(suggestion.team),suggestion.score);
    assert.equal(suggestion.team[1].tile,'skill');
    suggestion.team.forEach((member,i) => {
      for (const key of ['id','level','locked']) assert.equal(member[key],team[i][key]);
    });
    assert.equal(JSON.stringify(team),before);
  });

  test(focus+' suggests the caster outside the candidate roster while protecting locks', () => {
    const E = load([{id,milestones:[milestone(9,false,25)]},{id:'support',milestones:[milestone(4,true)]},{id:'filler'}]);
    const team = [slot('filler',1,'normal',true),slot('filler',10),slot('filler',100)];
    const s = {...neutral,snowFort:false};
    const suggestion = E.optimizeTeam(team,s,focus,['support']);
    assert.deepEqual(Array.from(suggestion.team,member => member.id),['filler','support',id]);
    assert.equal(suggestion.score,13);
    assert.equal(suggestion.score,E.evaluate(suggestion.team,s).metrics[focus]);
    assert.throws(() => E.optimizeTeam([slot('filler',1,'normal',true)],s,focus,['support']),new RegExp(id,'i'));
  });
}

test('a personal synergy placement can beat a skill tile when the active link rounds up', () => {
  const E = load([{id:'archer',synergies:[synergy(0.48,false,['support'])]},{id:'support'}]);
  const team = [slot('archer',1,'skill'),slot('support')];
  const result = E.optimizePlacements(team,neutral,'archerExperienceTag');
  assert.equal(E.evaluate(team,neutral).metrics.archerExperienceTag,0);
  assert.equal(result.score,1);
  assert.equal(result.team[0].tile,'synergy');
});
