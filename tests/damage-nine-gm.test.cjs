'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({window:{}});
for (const file of ['data.js','engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
}
const E = context.window.HeroEngine;
const profiles = Object.fromEntries(E.damageSkillDefinitions.flatMap(def => def.fields.map(field => [field.key,field.nineGmValue])));
const supports = ['wizard','titan','battlemage','templar','druid','witch','apprentice','warlock'];
const expectedPercent = {
  warden:[1979.42,8302.73], deadeye:[100,100], warlord:[25.1083,25.9928],
  praetorian:[2.79582,2.85340], gladiator:[1.97658,2.00501], dicemaster:[1.43658,1.94668],
  champion:[.202317,.205449], militia:[.0158641,.0157927], assassin:[.00000203347,.00000155276]
};
for (const snowFort of [false,true]) {
  test('nine-GM ordinary boss ranking with additive splash and Snow Fort '+(snowFort?'on':'off'), () => {
    const settings = {...profiles,grandMaster:true,synergyEvent:false,snowFort,mapMastery:33,
      damageHero:0,damageWardenDistance:10.7,damageAttackerKills:20,damageAssassinExecutions:0,
      damageSupportSeconds:20,chanceReferences:E.defaultChanceReferences()};
    const scores = {};
    for (const id of Object.keys(expectedPercent)) {
      const team = [id,...supports].map((id,i) => ({id,level:5000,tile:i===0?'damage':'normal'}));
      const hero = E.evaluate(team,settings).heroes[0];
      scores[id] = hero.metrics.damage;
      assert.ok(Math.abs(E.makeScorer(settings,'damage',team)(team)/scores[id]-1)<1e-10,id+' search parity');
      assert.equal(hero.bonuses['Splash Damage'],id==='warlord'?2726:2260);
      if (id==='champion') {
        const skill = hero.damageSkill;
        assert.equal(skill.strikes/skill.castInterval,236);
        const expectedStorm = snowFort?8912487.13575:6701685.8;
        assert.ok(Math.abs(skill.castFactor/skill.castInterval-expectedStorm)<.01);
      }
    }
    for (const [id,comparison] of Object.entries(expectedPercent)) {
      const actual = scores[id]/scores.deadeye*100, expected = comparison[Number(snowFort)];
      assert.ok(Math.abs(actual/expected-1)<.00001,id+' expected '+expected+'% of Deadeye, got '+actual+'%');
    }
  });
}

test('an edited Snow-powered mastery keeps its entered value and switching maps preserves capture inputs', () => {
  const settings = {...profiles,snowFort:true,mapMastery:33};
  const champion = {id:'champion',tile:'normal'};
  const skill = changes => E.damageSkillFor(champion,E.settingsFor({...settings,...changes}));
  assert.equal(skill({damageChampionRepeatDamage:1030}).repeatDamage,1030);
  assert.equal(skill({snowFort:false}).repeatDamage,774);
  assert.equal(skill({mapMastery:0}).repeatDamage,774);
  assert.equal(settings.damageChampionRepeatDamage,774);
  const extreme = E.damageSkillFor({id:'warden',tile:'normal'},E.settingsFor({...settings,mapMastery:100}));
  assert.equal(extreme.distanceMasteryUnavailable,true);
  assert.ok(Number.isFinite(extreme.factor));
});
