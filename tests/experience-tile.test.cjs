'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(heroes) {
  const context=vm.createContext({window:{}});
  if(heroes) context.window.HERO_DATA={meta:{statAliases:{}},heroes:heroes.map(hero=>({name:hero.id,milestones:[],synergies:[],...hero}))};
  else vm.runInContext(fs.readFileSync(path.join(__dirname,'..','data.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engine.js'),'utf8'),context);
  return context.window.HeroEngine;
}
const slot=(id,tile='normal',level=1,locked=false)=>({id,tile,level,locked});
const milestone=(type,value,global=false)=>({type,value,global,level:1});
const plain={experienceLeveler:0,experienceStyle:'none',experienceAttacker:'self',
  milestoneScale:1,synergyScale:1,grandMaster:false,accountSynergyBoosts:false,snowFort:true,
  damageSkills:false,damageSupportSkills:false,goldSkills:false,experienceSkills:true,
  experienceVeteranSuperChance:0,experienceVeteranSuperAmountPerStack:0,baseOverflow:0,overflowRate:5,
  mapAttackSpeed:0,mapMastery:0};
function near(actual,expected,label='') {
  assert.ok(Number.isFinite(actual),`${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${label}: ${actual} vs ${expected}`);
}
function check(E,team,settings,expected) {
  const result=E.evaluate(team,settings);
  near(result.metrics.experience,expected,'detailed XP');
  near(E.makeScorer(settings,'experience',team)(team),expected,'compiled XP');
  if(result.experiencePlan) {
    const comparison=E.compareExperienceAttackers(result);
    for(const row of comparison.rows) {
      near(row.killScore,row.beforeSpillover*row.overflowFactor,'complete kill payout');
      near(row.score,row.killScore*(row.shared?comparison.shareChance:1),'received payout');
      near(row.attackerTileFactor,result.heroes[row.index].experienceTileFactor,'tile belongs to attacker');
    }
    near(comparison.rows[comparison.selectedIndex].score,expected,'selected payout');
  }
  return result;
}
function brute(E,team,settings) {
  const tiles=['normal','milestone','synergy','skill','experience'];
  let best=-Infinity;
  function visit(index,trial,counts) {
    if(index===team.length) {best=Math.max(best,E.evaluate(trial,settings).metrics.experience);return;}
    for(const tile of tiles) {
      const limit=tile==='normal'?10:tile==='experience'?1:3;
      if((counts[tile]||0)>=limit) continue;
      visit(index+1,[...trial,{...team[index],tile}],{...counts,[tile]:(counts[tile]||0)+1});
    }
  }
  visit(0,[],{});
  return best;
}

test('only the killer’s XP tile boosts the kill, and Veteran shares the boosted reward to every recipient',()=>{
  const E=load([{id:'trainee'},{id:'carrier',milestones:[milestone('Super Exp Amount',10)]},{id:'veteran'}]);
  const team=[slot('trainee'),slot('carrier'),slot('veteran')];
  const direct=check(E,[slot('trainee','experience'),...team.slice(1)],plain,1.2);
  assert.equal(direct.experiencePlan.attackerTileFactor,1.2);
  near(direct.heroes[0].experienceKillScore,1.2,'own-kill payout');
  near(direct.heroes[0].metrics.experience,1.2,'occupant displayed payout');
  const shared={...plain,experienceAttacker:1,experienceVeteranShareChance:50};
  for(const tileIndex of [0,1,2]) {
    const candidate=team.map((hero,i)=>({...hero,tile:i===tileIndex?'experience':'normal'}));
    const tileFactor=tileIndex===1?1.2:1, kill=1.1*tileFactor;
    for(const experienceLeveler of [0,1,2]) {
      const result=check(E,candidate,{...shared,experienceLeveler},experienceLeveler===1?kill:kill*.5);
      assert.equal(result.experiencePlan.shared,experienceLeveler!==1);
      near(result.experiencePlan.attackerTileFactor,tileFactor);
      near(result.experiencePlan.killScore,kill,'share uses complete kill payout');
    }
  }
  const tiled=team.map((hero,i)=>({...hero,tile:i===1?'experience':'normal'}));
  check(E,tiled.slice(0,2),shared,0);
  check(E,tiled,{...shared,experienceSkills:false},0);
  check(E,tiled,{...shared,snowFort:false},1.1*.5);
});

test('automatic attacker selection can switch from shared kills to the tiled leveler own kills',()=>{
  const E=load([{id:'trainee'},{id:'carrier',milestones:[milestone('Super Exp Amount',10)]},{id:'veteran'}]);
  const settings={...plain,experienceAttacker:'best'},team=[slot('trainee'),slot('carrier'),slot('veteran')];
  assert.equal(check(E,team,settings,1.1).experiencePlan.attackerIndex,1);
  const tiled=[slot('trainee','experience'),...team.slice(1)];
  assert.equal(check(E,tiled,settings,1.2).experiencePlan.attackerIndex,0);
  const carryTile=team.map((hero,i)=>({...hero,tile:i===1?'experience':'normal'}));
  assert.equal(check(E,carryTile,settings,1.32).experiencePlan.attackerIndex,1);
  const score=E.makeScorer(settings,'experience',team);
  for(const candidate of [team,tiled,carryTile,team]) near(score(candidate),E.evaluate(candidate,settings).metrics.experience,'reused scorer after tile move');
  const comparison=E.compareExperienceAttackerTiles(team,settings);
  assert.equal(comparison.attackerIndex,1);
  near(comparison.options.normal.score,1.1,'normal comparison can use shared kills');
  near(comparison.options.experience.score,1.32,'XP comparison places tile on current killer');
});

test('duplicate leveling copies and max-level supports do not inherit the selected copy tile',()=>{
  const E=load([{id:'trainee'},{id:'veteran'},{id:'support'}]);
  const settings={...plain,experienceLeveler:1};
  const team=[slot('trainee','normal',15000),slot('trainee','normal',1),slot('veteran','normal',15000),slot('support','normal',15000)];
  for(const index of [0,2,3]) {
    const candidate=team.map((hero,i)=>({...hero,tile:i===index?'experience':'normal'}));
    check(E,candidate,settings,1);
  }
  check(E,team.map((hero,i)=>({...hero,tile:i===1?'experience':'normal'})),settings,1.2);
  const ownDuplicate=team.map((hero,i)=>({...hero,tile:i===0?'experience':'normal'}));
  check(E,ownDuplicate,{...settings,experienceAttacker:0},1.2);
});

test('the tile strength is configurable, map-dependent and isolated from other metrics',()=>{
  const E=load([{id:'trainee'}]),normal=[slot('trainee')],tiled=[slot('trainee','experience')];
  assert.equal(E.defaults.experienceTile,20);
  for(const experienceTile of [0,20,37.5,100]) check(E,tiled,{...plain,experienceTile},1+experienceTile/100);
  check(E,tiled,{...plain,snowFort:false},1);
  assert.equal(E.settingsFor({experienceTile:-10}).experienceTile,0);
  assert.equal(E.settingsFor({experienceTile:NaN}).experienceTile,20);
  assert.equal(E.settingsFor({experienceTile:Infinity}).experienceTile,20);
  const before=E.evaluate(normal,plain),after=E.evaluate(tiled,plain);
  for(const focus of ['gold','damage','energy','powerMageEnergy']) {
    near(after.metrics[focus],before.metrics[focus],focus+' unchanged');
    near(E.makeScorer(plain,focus,tiled)(tiled),before.metrics[focus],focus+' scorer');
  }
});

test('one Experience tile is legal and duplicate Experience tiles are rejected',()=>{
  const E=load([{id:'trainee'},{id:'support'}]);
  assert.equal(E.cleanTeam([slot('trainee','experience')])[0].tile,'experience');
  assert.throws(()=>E.cleanTeam([slot('trainee','experience'),slot('support','experience')]),/Only 1 experience bonus tile/);
  assert.throws(()=>E.evaluate([slot('trainee','experience'),slot('support','experience')],plain),/Only 1 experience bonus tile/);
});

test('a milestone tile can beat 20 percent XP by improving two separate amount multipliers',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Super Exp Amount',100,true),milestone('Ultra Exp Amount',100,true)]}]);
  const team=[slot('trainee')],comparison=E.compareExperienceAttackerTiles(team,plain);
  near(comparison.options.normal.score,4,'normal');
  near(comparison.options.experience.score,4.8,'Experience tile');
  near(comparison.options.milestone.score,4.84,'two 20 percent stronger milestones');
  assert.equal(comparison.preferred,'milestone');
  const best=E.optimizePlacements(team,plain,'experience');
  assert.equal(best.team[0].tile,'milestone');
  near(best.score,4.84,'placement winner');
});

test('attacker placement comparisons exchange occupied tiles and keep other slots intact',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Super Exp Amount',100,true),milestone('Ultra Exp Amount',100,true)]},{id:'support'}]);
  const team=[slot('trainee','experience'),slot('support','milestone'),slot('support','milestone'),slot('support','milestone')];
  const comparison=E.compareExperienceAttackerTiles(team,plain);
  assert.equal(comparison.levelerIndex,0);
  for(const [tile,option] of Object.entries(comparison.options)) {
    E.cleanTeam(option.team);
    assert.equal(option.team[0].tile,tile);
    near(option.score,E.evaluate(option.team,plain).metrics.experience,tile+' replay');
  }
  const milestoneOption=comparison.options.milestone;
  assert.ok(milestoneOption.swappedIndex>=1);
  assert.equal(milestoneOption.team[milestoneOption.swappedIndex].tile,'experience');
  const occupied=[slot('trainee','synergy'),slot('support','experience')];
  const moved=E.compareExperienceAttackerTiles(occupied,plain);
  assert.deepEqual(Array.from(moved.options.experience.team,hero=>hero.tile),['experience','synergy']);
  assert.deepEqual(Array.from(moved.options.normal.team,hero=>hero.tile),['normal','experience']);
  assert.deepEqual(occupied.map(hero=>hero.tile),['synergy','experience']);
});

test('joint placement search matches exhaustive scoring with the XP tile competing against skills and milestones',()=>{
  const E=load([{id:'archer'},{id:'trainee',milestones:[milestone('Super Exp Amount',10)]},{id:'ballista'},{id:'veteran'}]);
  const team=[slot('archer'),slot('trainee'),slot('ballista'),slot('veteran')];
  for(const experienceAttacker of ['self','best',0]) {
    const settings={...plain,experienceLeveler:1,experienceAttacker};
    const result=E.optimizePlacements(team,settings,'experience');
    near(result.score,brute(E,team,settings),'joint exhaustive result');
    check(E,result.team,settings,result.score);
    assert.ok(result.team.filter(hero=>hero.tile==='experience').length<=1);
  }
});

test('capturing XP references ignores the personal own-kill tile multiplier',()=>{
  const E=load([{id:'trainee',milestones:[milestone('Rank Exp',25),milestone('Super Exp Chance',30)]}]);
  const observed={rankBonus:66000000,superChance:260,ultraChance:450};
  const ordinary=E.captureExperienceReference([slot('trainee')],plain,observed,'Reference');
  const tiled=E.captureExperienceReference([slot('trainee','experience')],plain,observed,'Reference');
  for(const key of ['rankBonus','rankFlat','rankMultiplier','superChance','ultraChance','modeledSuperChance','modeledUltraChance']) {
    near(tiled[key],ordinary[key],key+' independent of personal XP tile');
  }
});

test('real Ranger tile comparisons replay across every XP range boundary from 1 to 4500',()=>{
  const E=load(),team=[slot('ranger'),slot('archer','skill',15000),slot('ballista','skill',15000),slot('veteran','skill',15000)];
  const settings={experienceLeveler:0,experienceStyle:'auto',experienceAttacker:'best',snowFort:true,synergyEvent:true,
    experienceReference:E.defaultExperienceReference()};
  const ranges=E.experienceRanges(team,settings),levels=new Set(ranges.flatMap(range=>[range.from,range.to]));
  assert.ok(levels.has(1));assert.ok(levels.has(4500));
  for(const level of levels) {
    const candidate=team.map((hero,index)=>index?hero:{...hero,level});
    const comparison=E.compareExperienceAttackerTiles(candidate,settings);
    assert.deepEqual(Object.keys(comparison.options).sort(),['experience','milestone','normal','skill','synergy']);
    for(const [tile,option] of Object.entries(comparison.options)) {
      assert.equal(option.team[0].level,level);
      assert.equal(option.team[comparison.attackerIndex].tile,tile);
      near(option.score,E.evaluate(option.team,settings).metrics.experience,`Ranger ${level} ${tile} replay`);
      near(E.makeScorer(settings,'experience',candidate)(option.team),option.score,`Ranger ${level} ${tile} compiled`);
    }
  }
  const at1500=team.map((hero,index)=>index?hero:{...hero,level:1500});
  const shared=E.compareExperienceAttackerTiles(at1500,{...settings,experienceAttacker:3});
  assert.equal(shared.attackerIndex,3);
  near(shared.options.experience.score,1.2*shared.options.normal.score,'Ranger receives the XP boost on Veteran kills');
  const self=E.compareExperienceAttackerTiles(at1500,{...settings,experienceAttacker:'self'});
  assert.ok(self.options.experience.score>self.options.milestone.score,'own-kill XP tile exceeds the single small milestone');
});
