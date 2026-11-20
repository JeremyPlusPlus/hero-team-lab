'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(heroes) {
  const window={HERO_DATA:{meta:{statAliases:{}},heroes:heroes.map(hero=>({name:hero.id,milestones:[],synergies:[],...hero}))}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','engine.js'),'utf8'),{window});
  return window.HeroEngine;
}
const slot=(id,level=15000,combatStyle,tile='normal',locked=false)=>({id,level,tile,locked,...(combatStyle?{combatStyle}:{})});
const milestone=(type,value,global=true)=>({type,value,global,level:1});
const plain={experienceLeveler:0,experienceStyle:'none',experienceAttacker:'self',experienceSkills:false,
  milestoneScale:1,synergyScale:1,accountSynergyBoosts:false,grandMaster:true,snowFort:false,
  damageSkills:false,damageSupportSkills:false,goldSkills:false,baseOverflow:0,baseEnergy:1000,overflowRate:5,
  mapAttackSpeed:0,mapMastery:0};
function near(actual,expected,label='') {
  assert.ok(Number.isFinite(actual),`${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${label}: ${actual} vs ${expected}`);
}
function check(E,team,settings,expected) {
  const result=E.evaluate(team,settings);
  near(result.metrics.experience,expected,'detailed XP');
  near(E.makeScorer(settings,'experience',team)(team),expected,'compiled XP');
  return result;
}

test('Magnate unlocks at 4000 and keeps percent Energy distinct from Tycoon flat Energy',()=>{
  const E=load([{id:'trainee'}]);
  const before=check(E,[slot('trainee',3999)],{...plain,experienceStyle:'magnate'},2);
  assert.equal(before.experiencePlan.styleId,'none');
  const magnate=check(E,[slot('trainee',4000)],{...plain,experienceStyle:'magnate'},2*1.12);
  assert.equal(magnate.experiencePlan.styleId,'magnate');
  assert.equal(magnate.style.count,0);
  near(magnate.metrics.gold,1.75,'Magnate global Kill Gold');
  near(magnate.metrics.damage,.01,'Magnate personal Damage penalty');
  near(magnate.metrics.energy,1050,'Magnate gives five percent Energy');
  near(magnate.global.total['Instant Spell'],2,'Magnate Instant Spell chance');
  near(magnate.style.synergyBonusScale,1.08,'Magnate synergy bonus');
  const tycoon=check(E,[slot('trainee',1250)],{...plain,experienceStyle:'tycoon'},2*1.05);
  near(tycoon.metrics.gold,1.35,'Tycoon global Kill Gold');
  near(tycoon.metrics.damage,.05,'Tycoon personal Damage penalty');
  near(tycoon.metrics.energy,1005,'Tycoon gives five flat Energy');
  near(tycoon.global.total.Range,1.03,'Tycoon range');
  assert.ok(E.experienceRanges([slot('trainee',1)],plain).some(range=>range.from===4000));
});

test('mixed support styles compound their own rank and synergy boosts without retaining extra Grand Masters',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Rank Exp',100)],
    synergies:[{type:'Rank Exp',value:100,global:true,tier:1,requires:['merchant']}]},
    {id:'merchant'},{id:'noble'},{id:'soldier'}]);
  const team=[slot('trainee',1),slot('merchant',15000,'tycoon'),slot('merchant'),slot('noble',15000,'magnate'),slot('soldier',15000,'grandMaster')];
  const rank=1.05**2*1.12;
  for(const stacking of ['multiply','add']) {
    const synergy=stacking==='multiply'?1.1*1.05**2*1.08:1+.1+.05*2+.08;
    const settings={...plain,synergyGrandMasterStacking:stacking};
    const result=check(E,team,settings,(1+(110+Math.round(100*synergy))/100)*rank);
    assert.equal(result.style.count,1);
    assert.equal(result.experiencePlan.supportStyles.merchant,'tycoon');
    assert.equal(result.experiencePlan.supportStyles.noble,'magnate');
    assert.equal(result.experiencePlan.supportStyles.soldier,'grandMaster');
    near(result.style.bonusScale,1.1,'one milestone GM');
    near(result.style.synergyBonusScale,synergy,'distinct style synergy bonuses');
    near(result.global.total['Rank Exp Multiplier'],rank,'one Rank EXP bonus per styled copy');
    near(result.metrics.energy,(1000+5*2)*1.05,'flat Energy enters the percent Energy factor');
    near(result.metrics.gold,2.5*1.35**2*1.75,'global style Gold factors');
    near(result.heroes[1].metrics.damage,2.5*.05,'Tycoon copy personal penalty');
    near(result.heroes[2].metrics.damage,2.5*.05,'shared Tycoon style');
    near(result.heroes[3].metrics.damage,2.5*.01,'Magnate personal penalty');
    near(result.heroes[4].metrics.damage,2.5*.1,'Grand Master speed penalty');
    assert.equal(result.effects.filter(effect=>effect.styleName==='Grand Master'&&effect.type==='Damage').length,1);
  }
  const gmOff=check(E,team,{...plain,grandMaster:false},(1+(100+Math.round(100*1.05**2*1.08))/100)*rank);
  assert.equal(gmOff.style.count,0);
  near(gmOff.global.total['Rank Exp Multiplier'],rank,'explicit economic styles remain enabled');
});

test('all copies share the first explicit support style and use their lowest level for eligibility',()=>{
  const E=load([{id:'trainee'},{id:'support'}]);
  const team=[slot('trainee',1),slot('support',15000,'magnate'),slot('support',15000,'tycoon')];
  const magnate=check(E,team,plain,1.12**2);
  assert.equal(magnate.style.count,0,'both copies leave GM');
  assert.equal(magnate.effects.filter(effect=>effect.styleName==='Magnate'&&effect.type==='Rank Exp Multiplier').length,2);
  for(const [level,style,expected,gms] of [[3999,'magnate',1,2],[1249,'tycoon',1,2],[1250,'tycoon',1.05**2,0],[4000,'magnate',1.12**2,0]]) {
    const candidate=[slot('trainee',1),slot('support',15000,style),slot('support',level)];
    assert.equal(check(E,candidate,plain,expected).style.count,gms);
  }
});

test('the selected leveling hero style overrides stored support styles on every copy',()=>{
  const E=load([{id:'trainee'},{id:'support'}]);
  const team=[slot('trainee',500,'magnate'),slot('trainee',15000,'tycoon'),slot('support',15000,'magnate')];
  const result=check(E,team,{...plain,experienceStyle:'expFactory'},2*1.65*1.12);
  assert.equal(result.style.count,0);
  assert.equal(result.heroes[1].level,500);
  assert.equal(result.effects.filter(effect=>effect.ownerId==='trainee'&&effect.styleName==='Exp Factory'&&effect.type==='Boss Exp').length,2);
  assert.equal(result.effects.filter(effect=>effect.ownerId==='trainee'&&['Magnate','Tycoon'].includes(effect.styleName)).length,0);
});

test('mixed global Rank EXP factors apply equally before direct tile bonuses and Veteran sharing',()=>{
  const E=load([{id:'trainee'},{id:'carrier',milestones:[milestone('Super Exp Amount',10,false)]},{id:'veteran'}]);
  const team=[slot('trainee',1,undefined,'experience'),slot('carrier',1500,'tycoon'),slot('veteran',5000,'magnate')];
  const settings={...plain,snowFort:true,experienceSkills:true,experienceVeteranSuperChance:0,experienceVeteranSuperAmountPerStack:0};
  const rank=1.05*1.12;
  const self=check(E,team,settings,rank*1.2);
  const shared=check(E,team,{...settings,experienceAttacker:1},2*1.1*rank);
  assert.equal(shared.experiencePlan.attackerTileFactor,1);
  for(const result of [self,shared]) for(const row of E.compareExperienceAttackers(result).rows) near(row.rankFactor,rank,'global Rank EXP factor');
});

test('cached scoring tracks style changes even when hero IDs and GM counts remain unchanged',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Super Exp Amount',30)]},{id:'a'},{id:'b'},{id:'c'}]);
  const template=[slot('trainee',1),slot('a',15000,'tycoon'),slot('b',15000,'magnate'),slot('c',15000,'grandMaster')];
  const score=E.makeScorer(plain,'experience',template);
  for(const styles of [['tycoon','magnate','grandMaster'],['magnate','tycoon','grandMaster'],['magnate','magnate','grandMaster'],['tycoon','tycoon','grandMaster'],['grandMaster','grandMaster','grandMaster']]) {
    for(const level of [1249,1250,3999,4000,15000]) {
      const candidate=template.map((hero,index)=>index?{...hero,combatStyle:styles[index-1],level}:hero);
      near(score(candidate),E.evaluate(candidate,plain).metrics.experience,styles.join('/')+' at '+level);
    }
  }
});

test('XP teams show mixed percent Energy correctly and stored XP styles do not affect other focuses',()=>{
  const E=load([{id:'trainee'},{id:'a',milestones:[milestone('Energy Income',50),milestone('Power Mage Energy',100)]},{id:'b'},{id:'c'}]);
  const team=[slot('trainee',1),slot('a',15000,'tycoon'),slot('b',15000,'magnate'),slot('c',15000,'grandMaster')];
  const result=E.evaluate(team,plain);
  near(result.metrics.energy,(1000+5+50*1.1)*1.05,'flat milestones and Tycoon before Magnate percent');
  for(const focus of ['experience','energy','powerMageEnergy','gold','damage']) near(E.makeScorer(plain,focus,team)(team),result.metrics[focus],focus+' XP context');
  const settings={...plain,experienceLeveler:null},ordinary=E.evaluate(team,settings);
  const stripped=team.map(({combatStyle,...hero})=>hero),baseline=E.evaluate(stripped,settings);
  for(const focus of ['experience','energy','powerMageEnergy','gold','damage']) {
    near(ordinary.metrics[focus],baseline.metrics[focus],focus+' ignores stored XP support styles');
    near(E.makeScorer(settings,focus,team)(team),ordinary.metrics[focus],focus+' ordinary scorer');
  }
});

test('support style search matches independent exhaustive choices with duplicate groups and eligible levels',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Super Exp Amount',60)]},
    {id:'merchant',milestones:[milestone('Rank Exp',50)]},
    {id:'noble',synergies:[{type:'Super Exp Amount',value:15,global:true,tier:1,requires:['merchant','merchant']}]},
    {id:'soldier',milestones:[milestone('Ultra Exp Amount',40)]}]);
  const team=[slot('trainee',1),slot('merchant',2000,undefined,'milestone'),slot('merchant',2000),
    slot('noble',5000,undefined,'synergy'),slot('soldier',5000)];
  for(const grandMaster of [true,false]) for(const synergyGrandMasterStacking of ['multiply','add']) {
    const settings={...plain,grandMaster,synergyGrandMasterStacking,snowFort:true};
    let best=-Infinity;
    for(const merchant of ['grandMaster','tycoon']) for(const noble of ['grandMaster','tycoon','magnate']) for(const soldier of ['grandMaster','tycoon','magnate']) {
      const styles={merchant,noble,soldier};
      const candidate=team.map(hero=>styles[hero.id]?{...hero,combatStyle:styles[hero.id]}:hero);
      best=Math.max(best,E.evaluate(candidate,settings).metrics.experience);
    }
    const result=E.optimizeExperienceSupportStyles(team,settings);
    near(result.score,best,'independent fixed-roster enumeration');
    assert.equal(result.team[1].combatStyle,result.team[2].combatStyle,'duplicate copies keep one style');
    check(E,JSON.parse(JSON.stringify(result.team)),settings,result.score);
  }
});

test('normal reference capture retains support styles while explicit all-GM capture overrides them',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Rank Exp',100)]},{id:'merchant'},{id:'noble'}]);
  const team=[slot('trainee',1),slot('merchant',15000,'tycoon'),slot('noble',15000,'magnate')];
  const observed={rankBonus:66000000,superChance:260,ultraChance:450};
  const reference=E.captureExperienceReference(team,plain,observed,'Mixed styles');
  near(reference.rankMultiplier,1.05*1.12,'recorded rank percentage');
  assert.equal(reference.team[1].combatStyle,'tycoon');
  assert.equal(reference.team[2].combatStyle,'magnate');
  const gm=E.captureExperienceReference(team,{...plain,experienceCaptureGrandMaster:true},observed,'All GM');
  assert.equal(gm.grandMasterCount,3);
  assert.equal(gm.rankMultiplier,1);
  near(gm.rankFlat,100*1.1**3,'all three GM milestone boosts');
  assert.ok(gm.team.every(hero=>!hero.combatStyle||hero.combatStyle==='grandMaster'));
});

test('fixed-roster support style optimization can choose GM, Tycoon, Magnate or mixed eligible styles',()=>{
  const E=load([{id:'trainee'},{id:'strong',milestones:[milestone('Super Exp Amount',1000),milestone('Ultra Exp Amount',1000)]},
    {id:'junior'},{id:'merchant'},{id:'noble'}]);
  const cases=[
    {team:[slot('strong',1),slot('noble',5000)],styles:['grandMaster'],score:144},
    {team:[slot('trainee',1),slot('merchant',2000)],styles:['tycoon'],score:1.05},
    {team:[slot('trainee',1),slot('noble',5000)],styles:['magnate'],score:1.12},
    {team:[slot('trainee',1),slot('junior',500),slot('merchant',2000),slot('noble',5000)],styles:['grandMaster','tycoon','magnate'],score:1.05*1.12}
  ];
  for(const fixture of cases) {
    const before=JSON.stringify(fixture.team),result=E.optimizeExperienceSupportStyles(fixture.team,plain);
    assert.deepEqual(Array.from(result.team.slice(1),hero=>hero.combatStyle||'grandMaster'),fixture.styles);
    near(result.score,fixture.score,'optimal support styles');
    check(E,JSON.parse(JSON.stringify(result.team)),plain,result.score);
    assert.equal(JSON.stringify(fixture.team),before);
  }
});

test('opt-in team and tile suggestions can change locked support styles while preserving heroes and levels',()=>{
  const E=load([{id:'trainee'},{id:'merchant'},{id:'noble'}]);
  const team=[slot('trainee',1,undefined,'normal',true),slot('merchant',2000,undefined,'normal',true),slot('noble',5000,undefined,'normal',true)];
  const settings={...plain,experienceOptimizeSupportStyles:true};
  for(const result of [E.optimizeTeam(team,settings,'experience',[]),E.optimizePlacements(team,settings,'experience')]) {
    assert.deepEqual(Array.from(result.team,hero=>hero.id),team.map(hero=>hero.id));
    assert.deepEqual(Array.from(result.team,hero=>hero.level),team.map(hero=>hero.level));
    assert.ok(result.team.every(hero=>hero.locked));
    assert.equal(result.team[1].combatStyle,'tycoon');
    assert.equal(result.team[2].combatStyle,'magnate');
    near(result.score,1.05*1.12,'stored optimized styles replay');
    check(E,JSON.parse(JSON.stringify(result.team)),settings,result.score);
  }
  const unchanged=E.optimizePlacements(team,plain,'experience');
  assert.ok(unchanged.team.slice(1).every(hero=>!hero.combatStyle||hero.combatStyle==='grandMaster'),'optimization is opt-in');
});

test('with style optimization off, roster substitutions keep original hero styles instead of displaced slot styles',()=>{
  const E=load([{id:'trainee'},{id:'old'},{id:'existing'},{id:'new'}]);
  const team=[slot('trainee',1),slot('old',15000,'tycoon'),slot('existing',15000,'magnate','normal',true)];
  const settings={...plain,experienceOptimizeSupportStyles:false},before=JSON.stringify(team);
  const duplicate=E.optimizeTeam(team,settings,'experience',['existing']);
  assert.deepEqual(Array.from(duplicate.team,hero=>hero.id),['trainee','existing','existing']);
  assert.deepEqual(Array.from(duplicate.team.slice(1),hero=>hero.combatStyle),['magnate','magnate']);
  check(E,duplicate.team,settings,1.12**2);
  const introduced=E.optimizeTeam(team,settings,'experience',['new']);
  assert.equal(introduced.team[1].id,'new');
  assert.ok(!introduced.team[1].combatStyle||introduced.team[1].combatStyle==='grandMaster','new hero inherits GM');
  assert.equal(introduced.team[2].combatStyle,'magnate');
  assert.equal(E.evaluate(introduced.team,settings).style.count,1);
  check(E,introduced.team,settings,1.12);
  const lowerSlot=team.map((hero,index)=>index===1?{...hero,level:3999}:hero);
  const ineligible=E.optimizeTeam(lowerSlot,settings,'experience',['existing']);
  assert.ok(ineligible.team.slice(1).every(hero=>!hero.combatStyle||hero.combatStyle==='grandMaster'),'new low-level copy makes Magnate ineligible for both copies');
  assert.equal(E.evaluate(ineligible.team,settings).style.count,2);
  check(E,ineligible.team,settings,1);
  assert.equal(JSON.stringify(team),before);
});

test('a support combat style change prevents level-plan rows from merging',()=>{
  const E=load([{id:'trainee'},{id:'support'}]);
  const stage=(from,to,combatStyle)=>({from,to,team:[slot('trainee',from),slot('support',15000,combatStyle)],
    style:'none',attackerIndex:0,experiencePlan:{levelerIndex:0},score:1});
  assert.equal(E.groupExperienceRanges([stage(1,14,'tycoon'),stage(15,49,'magnate')]).length,2);
  assert.equal(E.groupExperienceRanges([stage(1,14,'magnate'),stage(15,49,'magnate')]).length,1);
});
