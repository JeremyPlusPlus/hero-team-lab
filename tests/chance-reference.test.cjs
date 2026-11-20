'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
function load(heroes, immortal = false) {
  const context = vm.createContext({window:{}});
  if (heroes) context.window.HERO_DATA = {meta:{statAliases:{}},heroes:heroes.map(hero=>({
    name:hero.id,milestones:[],synergies:[],observedBaseStats:{damage:100,attackSpeed:1},...hero}))};
  else vm.runInContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),context);
  for (const file of ['engine.js',...(immortal?['immortal-data.js','immortal.js']:[])]) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  }
  return context.window.HeroEngine;
}
const slot = (id,tile='normal',level=25,locked=false)=>({id,tile,level,locked});
const milestone = (type,value,global=true)=>({type,value,global,level:1});
const plain = {milestoneScale:1,synergyScale:1,grandMaster:false,accountSynergyBoosts:false,snowFort:false,
  mapAttackSpeed:0,mapMastery:0,goldHero:0,damageHero:0,goldSkills:false,damageSkills:false,damageSupportSkills:false,
  baseOverflow:0,overflowRate:5};
const reference = (totals,contributions=totals.map(()=>0),mode='preTeam',extraOverflow=0)=>({
  mode,totals,contributions,extraOverflow,label:'Test chance context'});
function near(actual,expected,label='') {
  assert.ok(Number.isFinite(actual),`${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${label}: ${actual} vs ${expected}`);
}
function check(E,team,settings,focus,expected) {
  const result=E.evaluate(team,settings);
  near(result.metrics[focus],expected,`${focus} detailed`);
  near(E.makeScorer(settings,focus,team)(team),expected,`${focus} compiled`);
  return result;
}
function brutePlacements(E,team,settings,focus) {
  const tiles=['normal','milestone','synergy','skill',focus==='gold'?'killGold':'damage'];
  let best=-Infinity;
  function visit(index,trial,counts) {
    if(index===team.length) {best=Math.max(best,E.evaluate(trial,settings).metrics[focus]);return;}
    for(const tile of tiles) {
      const limit=tile==='normal'?10:tile==='killGold'||tile==='damage'?1:3;
      if((counts[tile]||0)>=limit) continue;
      visit(index+1,[...trial,{...team[index],tile}],{...counts,[tile]:(counts[tile]||0)+1});
    }
  }
  visit(0,[],{});
  return best;
}

test('Gold and Damage count only the excess above each separate tier cap',()=>{
  const E=load([{id:'a',milestones:[milestone('Super Gold Chance',30),milestone('Ultra Gold Chance',10),
    milestone('Crit Chance',30),milestone('Super Crit Chance',20),milestone('Ultra Crit Chance',15)]}]);
  const team=[slot('a')],settings={...plain,chanceReferences:{gold:reference([90,300]),damage:reference([50,150,90])}};
  check(E,team,settings,'gold',1+(20+210)*.05);
  check(E,team,settings,'damage',1+(0+70+5)*.05);
  const gold=E.chanceDetailsFor(E.evaluate(team,settings).heroes[0].bonuses,E.settingsFor(settings),'gold');
  assert.deepEqual(Array.from(gold.totals),[120,310]);
  assert.deepEqual(Array.from(gold.excess),[20,210]);
  const damage=E.chanceDetailsFor(E.evaluate(team,settings).heroes[0].bonuses,E.settingsFor(settings),'damage');
  assert.deepEqual(Array.from(damage.totals),[80,170,105]);
  assert.equal(damage.belowCap,true);
});

test('confirmed undeployed Gold and Damage totals retain their exact cap headroom',()=>{
  const E=load([{id:'empty'},
    {id:'cap',milestones:[milestone('Super Gold Chance',50),milestone('Ultra Gold Chance',50),milestone('Ultra Crit Chance',52)]},
    {id:'excess',milestones:[milestone('Super Gold Chance',51),milestone('Ultra Gold Chance',51),milestone('Ultra Crit Chance',53)]}]);
  const references=E.defaultChanceReferences();
  assert.deepEqual(Array.from(references.gold.totals),[50,50]);
  assert.deepEqual(Array.from(references.damage.totals),[135,109,48]);
  assert.deepEqual(Array.from(references.damageBuffSwap.totals),[135,109,48]);
  const settings={...plain,chanceReferences:references};
  check(E,[slot('empty')],settings,'gold',1);
  check(E,[slot('empty')],settings,'damage',3.2);
  check(E,[slot('cap')],settings,'gold',1);
  check(E,[slot('cap')],settings,'damage',3.2);
  check(E,[slot('excess')],settings,'gold',1.1);
  check(E,[slot('excess')],settings,'damage',3.25);
});

test('explicit chance contexts replace the legacy overflow pool and include only their own extra overflow',()=>{
  const E=load([{id:'a'}]),team=[slot('a')];
  for(const [focus,totals] of [['gold',[300,300]],['damage',[300,300,300]]]) {
    const excess=totals.length*200;
    const settings={...plain,baseOverflow:100000,overflowRate:2,chanceReferences:{[focus]:reference(totals)}};
    check(E,team,settings,focus,1+excess*.02);
    check(E,team,{...settings,chanceReferences:{[focus]:reference(totals,undefined,'preTeam',80)}},focus,1+.8+excess*.02);
  }
});

test('a recorded deployed lineup reproduces its displayed totals and candidate changes apply once',()=>{
  const E=load([{id:'a'},
    {id:'old',milestones:[milestone('Super Gold Chance',30),milestone('Ultra Gold Chance',40),milestone('Crit Chance',20),milestone('Super Crit Chance',30),milestone('Ultra Crit Chance',40)]},
    {id:'new',milestones:[milestone('Super Gold Chance',45),milestone('Ultra Gold Chance',69),milestone('Crit Chance',35),milestone('Super Crit Chance',59),milestone('Ultra Crit Chance',50)]}]);
  const team=[slot('a'),slot('old')],candidate=[slot('a'),slot('new')];
  for(const [focus,totals,oldAdded,newAdded] of [
    ['gold',[300,300],[30,40],[45,69]],['damage',[300,300,300],[20,30,40],[35,59,50]]]) {
    const captured=E.captureChanceReference(team,plain,focus,{totals,extraOverflow:0},'Observed team');
    assert.equal(captured.mode,'recorded');
    assert.deepEqual(Array.from(captured.contributions),oldAdded);
    const snapshot=JSON.stringify(captured),settings={...plain,chanceReferences:{[focus]:captured}};
    const baseline=1+totals.length*200*.05;
    check(E,team,settings,focus,baseline);
    check(E,candidate,settings,focus,baseline+newAdded.reduce((sum,value,index)=>sum+value-oldAdded[index],0)*.05);
    const score=E.makeScorer(settings,focus,team);
    for(const roster of [team,candidate,team,candidate]) near(score(roster),E.evaluate(roster,settings).metrics[focus],'reused frozen reference');
    assert.equal(JSON.stringify(captured),snapshot);
  }
});

test('personal and support damage skills retain their separate Crit, Super and Ultra channels',()=>{
  const E=load([{id:'dicemaster'},{id:'titan'},{id:'battlemage'}]);
  const team=[slot('dicemaster'),slot('titan'),slot('battlemage')];
  const settings={...plain,snowFort:true,damageSkills:true,damageSupportSkills:true,damageSupportStacks:1,
    damageDicemasterCritMin:3,damageDicemasterCritMax:3,damageDicemasterSuperCritMin:9,damageDicemasterSuperCritMax:9,
    damageDicemasterUltraCritMin:13,damageDicemasterUltraCritMax:13,damageDicemasterMaxRollChance:0,
    damageSupportTitanSuperCritChance:7,damageSupportTitanUltraCritChance:18,damageSupportTitanSuperCritDamage:0,damageSupportTitanUltraCritDamage:0,
    damageSupportBattlemageCritChance:6,damageSupportBattlemageUltraCritChancePerStack:5,
    chanceReferences:{damage:reference([90,80,70])}};
  const normal=check(E,team,settings,'damage',1.3);
  const stats=E.chanceDetailsFor(normal.heroes[0].bonuses,E.settingsFor(settings),'damage');
  assert.deepEqual(Array.from(stats.totals),[99,96,106]);
  const tiled=team.map(hero=>({...hero,tile:'skill'}));
  check(E,tiled,settings,'damage',1.7);
  // The first Titan supplies the support skill; another copy does not add it again.
  check(E,[...team,slot('titan','skill')],settings,'damage',1.3);
});

test('Dicemaster averages excess after each roll crosses the cap, including the maximum-roll probability',()=>{
  const E=load([{id:'dicemaster'}]),team=[slot('dicemaster')];
  const settings={...plain,snowFort:true,damageSkills:true,damageTile:10,
    damageDicemasterCritMin:0,damageDicemasterCritMax:0,damageDicemasterSuperCritMin:0,damageDicemasterSuperCritMax:0,
    damageDicemasterUltraCritMin:0,damageDicemasterUltraCritMax:104,damageDicemasterMaxRollChance:25,
    chanceReferences:{damage:reference([135,109,48])}};
  const expectedExcess=(high,p)=>p*Math.max(0,high-52)+(1-p)*Math.max(0,high-52)**2/(2*high);
  const normal=check(E,team,settings,'damage',1+(44+expectedExcess(104,.25))*.05);
  near(normal.metrics.damage,4.3375,'expected overflow differs from overflow of the average roll');
  const skillTeam=[slot('dicemaster','skill')];
  const skillExpected=1+(44+expectedExcess(124.8,.3))*.05;
  check(E,skillTeam,settings,'damage',skillExpected);
  const optimized=E.optimizePlacements(team,settings,'damage');
  assert.equal(optimized.team[0].tile,'skill');
  near(optimized.score,skillExpected,'skill tile changes the range and max-roll probability');
  near(optimized.score,brutePlacements(E,team,settings,'damage'),'Dice exact tile search');
});

test('Sovereign skill chance is capped separately and never enters Crusader generated gold',()=>{
  const E=load([{id:'crusader'},{id:'sovereign'}]),team=[slot('crusader'),slot('sovereign')];
  const settings={...plain,snowFort:true,goldSkills:true,goldSovereignChance:20,goldSovereignAmount:25,
    goldCrusaderBonus:200,goldCrusaderMastery:0,goldCrusaderAttacks:1,chanceReferences:{gold:reference([70,300])}};
  const normal=check(E,team,settings,'gold',1.25*11+1);
  near(normal.heroes[0].goldSkill.attackGold,1,'generated payout');
  const tiled=check(E,[team[0],{...team[1],tile:'skill'}],settings,'gold',1.3*11+1);
  near(tiled.heroes[0].goldSkill.attackGold,1,'generated payout unaffected by chance context');
  const other=check(E,team,{...settings,chanceReferences:{gold:reference([300,300])}},'gold',1.25*22+1);
  near(other.heroes[0].goldSkill.attackGold,1,'only kill payout uses Gold spillover');
});

test('Gold and Damage placement searches match exhaustive detailed scoring with calibrated caps',()=>{
  const E=load([{id:'praetorian',milestones:[milestone('Ultra Gold Chance',30,false),milestone('Crit Chance',30,false)]},
    {id:'sovereign',milestones:[milestone('Super Gold Chance',10),milestone('Super Crit Chance',10)]},
    {id:'titan',milestones:[milestone('Ultra Gold Chance',20),milestone('Ultra Crit Chance',20)]}]);
  const team=[slot('praetorian'),slot('sovereign'),slot('titan')];
  const settings={...plain,snowFort:true,goldSkills:true,damageSkills:true,damageSupportSkills:true,
    goldSovereignChance:10,goldSovereignAmount:10,goldKillGoldTile:30,damageTile:30,
    damagePraetorianSuperCritChance:10,damagePraetorianUltraCritChance:10,damagePraetorianSuperCritDamage:10,damagePraetorianUltraCritDamage:10,
    damageSupportTitanSuperCritChance:10,damageSupportTitanUltraCritChance:10,damageSupportTitanSuperCritDamage:10,damageSupportTitanUltraCritDamage:10,
    chanceReferences:{gold:reference([79,89]),damage:reference([69,79,69])}};
  for(const focus of ['gold','damage']) for(const selected of [0,'best',null]) {
    const config={...settings,[focus==='gold'?'goldHero':'damageHero']:selected};
    const optimized=E.optimizePlacements(team,config,focus);
    near(optimized.score,brutePlacements(E,team,config,focus),`${focus} exhaustive placements, attacker ${selected}`);
    check(E,optimized.team,config,focus,optimized.score);
    const comparison=focus==='gold'?E.compareGoldAttackerTiles(team,config):E.compareDamageAttackerTiles(team,config);
    if(comparison) {
      const options=focus==='gold'?comparison.availableOptions.map(key=>comparison[key]):Object.values(comparison.options);
      const fixed={...config,[focus==='gold'?'goldHero':'damageHero']:comparison.attackerIndex};
      for(const option of options) near(option.score,E.evaluate(option.team,fixed).metrics[focus],`${focus} tile comparison`);
    }
  }
});

test('team search prefers multiplicative rewards over chance already diluted by a large spillover pool',()=>{
  for(const [focus,amount,chance,totals] of [['gold','Kill Gold','Super Gold Chance',[300,300]],['damage','Damage','Crit Chance',[300,300,300]]]) {
    const E=load([{id:'attacker'},{id:'chance',milestones:[milestone(chance,30)]},{id:'amount',milestones:[milestone(amount,20)]}]);
    const team=[slot('attacker'),slot('chance')],settings={...plain,chanceReferences:{[focus]:reference(totals)}};
    const optimized=E.optimizeTeam(team,settings,focus,['chance','amount']);
    assert.deepEqual(Array.from(optimized.team,hero=>hero.id),['attacker','amount']);
    check(E,optimized.team,settings,focus,1.2*(1+totals.length*200*.05));
  }
});

test('capture uses the currently selected best attacker under the active chance reference',()=>{
  for(const [focus,amount,chance,totals] of [['gold','Kill Gold','Super Gold Chance',[300,300]],['damage','Damage','Crit Chance',[300,300,300]]]) {
    const E=load([{id:'chance',milestones:[milestone(chance,50,false)]},{id:'amount',milestones:[milestone(amount,100,false)]}]);
    const team=[slot('chance'),slot('amount')],key=focus==='gold'?'goldHero':'damageHero';
    const legacy={...plain,[key]:'best'};
    assert.equal(focus==='gold'?E.evaluate(team,legacy).goldIndex:E.evaluate(team,legacy).attackerIndex,0);
    const settings={...legacy,chanceReferences:{[focus]:reference(totals)}};
    const captured=E.captureChanceReference(team,settings,focus,totals,'Best current attacker');
    assert.equal(captured.attackerIndex,1);
    assert.deepEqual(Array.from(captured.contributions),totals.map(()=>0));
  }
});

test('regular Damage and buff-swap Damage keep independent chance contexts',()=>{
  const E=load([{id:'a'},{id:'titan'}]),team=[slot('a'),slot('titan')];
  const settings={...plain,damageSupportSkills:true,damageSupportTitanSuperCritChance:20,damageSupportTitanUltraCritChance:10,
    damageSupportTitanSuperCritDamage:0,damageSupportTitanUltraCritDamage:0,
    chanceReferences:{damage:reference([300,300,300]),damageBuffSwap:reference([90,90,90])}};
  check(E,team,settings,'damage',31+30*.05);
  check(E,team,{...settings,damageSupportMode:'debuffs'},'damage',1);
  const captured=E.captureChanceReference(team,settings,'damageBuffSwap',[90,90,90],'Buff swap');
  assert.deepEqual(Array.from(captured.contributions),[0,0,0],'capture excludes timed support skills removed in buff swap');
});

test('Gold and Damage references do not affect XP, Energy, rankings or Immortal scoring',()=>{
  const E=load(undefined,true),team=[slot('archer','normal',1500),slot('veteran','skill',15000),slot('titan','normal',15000)];
  const settings={...plain,snowFort:true,experienceLeveler:0,experienceAttacker:'self',experienceStyle:'expFactory'};
  const references={gold:reference([300,400]),damage:reference([500,600,700]),damageBuffSwap:reference([200,300,400])};
  const baseline=E.evaluate(team,settings),withReferences=E.evaluate(team,{...settings,chanceReferences:references});
  for(const focus of ['experience','energy','powerMageEnergy']) near(withReferences.metrics[focus],baseline.metrics[focus],`${focus} isolation`);
  const rankings=E.rankMilestoneSupport(settings,{level:15000,grandMasterCount:0});
  const calibratedRankings=E.rankMilestoneSupport({...settings,chanceReferences:references},{level:15000,grandMasterCount:0});
  assert.equal(JSON.stringify(calibratedRankings),JSON.stringify(rankings),'rankings retain their separate comparison references');
  const config={mode:'ranged',baseCritChance:50,baseSuperChance:70,baseUltraChance:90};
  const before=E.immortal.evaluate(team,plain,config),after=E.immortal.evaluate(team,{...plain,chanceReferences:references},config);
  near(after.score,before.score,'Immortal damage');
  near(E.immortal.makeScorer({...plain,chanceReferences:references},config)(team),before.score,'Immortal search');
});

test('invalid chance references fall back to legacy and pre-team contexts cannot subtract deployed contributions',()=>{
  const E=load([{id:'a',milestones:[milestone('Super Gold Chance',30),milestone('Crit Chance',30)]}]),team=[slot('a')];
  for(const [focus,totals] of [['gold',[300,300]],['damage',[300,300,300]]]) {
    const valid=reference(totals);
    for(const invalid of [{...valid,totals:[]},{...valid,totals:totals.map(()=>Infinity)},
      {...valid,mode:'recorded',contributions:totals.map(()=>NaN)},{...valid,extraOverflow:Infinity}]) {
      const settings={...plain,chanceReferences:{[focus]:invalid}};
      assert.equal(E.settingsFor(settings).chanceReferences[focus],null);
      check(E,team,settings,focus,2.5);
    }
    const normalized=E.normalizeChanceReference({...valid,contributions:totals.map(()=>999)},focus);
    assert.deepEqual(Array.from(normalized.contributions),totals.map(()=>0));
  }
});
