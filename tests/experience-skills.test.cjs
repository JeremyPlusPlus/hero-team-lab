'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(heroes=['trainee','archer','ballista','veteran','other'].map(id=>({id}))) {
  const window={HERO_DATA:{meta:{statAliases:{}},heroes:heroes.map(hero=>({name:hero.id,milestones:[],synergies:[],...hero}))}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','engine.js'),'utf8'),{window});
  return window.HeroEngine;
}
const slot=(id,tile='normal',level=1)=>({id,tile,level});
const plain={experienceLeveler:0,experienceStyle:'none',experienceAttacker:'self',experienceSkills:true,
  milestoneScale:1,synergyScale:1,grandMaster:false,accountSynergyBoosts:false,snowFort:false,
  goldSkills:false,damageSkills:false,damageSupportSkills:false,baseOverflow:0,overflowRate:5};
// +13,240% on the reference Archer corresponds to 652 Skill Power.
const archer=(wave=75000,skillPower=652,coverage=100)=>
  1+((3+.2*skillPower)*(1+wave*.65/100)-1)*coverage/100;
const ballista=(stacks=100,skillPower=763)=>(1+(50+5*skillPower)/100)*(1+6.5*stacks/100);
const veteran=(stacks=100,superChance=149)=>(1+16.26*stacks/100)*(1+superChance*.05);
function near(actual,expected,label='') {
  assert.ok(Number.isFinite(actual),`${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${label}: ${actual} vs ${expected}`);
}
function check(E,team,settings,expected) {
  const result=E.evaluate(team,settings);
  near(result.metrics.experience,expected,'detailed XP');
  near(E.makeScorer(settings,'experience',team)(team),expected,'compiled XP');
  if(result.experiencePlan) {
    const comparison=E.compareExperienceAttackers(result),row=comparison.rows[comparison.selectedIndex];
    near(row.beforeSpillover,row.rankFactor*row.bossFactor*row.superAmountFactor*row.ultraAmountFactor*row.rewardFactor*row.attackerTileFactor,'XP breakdown');
    near(row.killScore,row.beforeSpillover*row.overflowFactor,'complete kill');
    near(row.score,expected,'received XP');
  }
  return result;
}

test('Veteran rounds proc chances and keeps the captured global mastery amount on either tile',()=>{
  const E=load(),team=[slot('trainee'),slot('veteran')];
  const result=check(E,team,plain,veteran());
  const profile=result.experienceSkills.veteran;
  near(profile.superChance,149,'integer Super EXP roll threshold');
  near(profile.superAmount,1626,'100-stack captured total rather than rounded 16.3 times 100');
  assert.equal(profile.chance,1,'365.5 percent sharing caps at one award');
  assert.equal(profile.index,1);
  const tiled=check(E,[team[0],slot('veteran','skill')],{...plain,snowFort:true},veteran(100,178));
  near(tiled.experienceSkills.veteran.superChance,178,'rounded Super EXP threshold at 865 Skill Power');
  near(tiled.experienceSkills.veteran.superAmount,1626,'the tile scales the active only');
  check(E,[team[0],slot('veteran','skill')],plain,veteran());
});

test('Veteran stacks and configured share chance apply once to the selected attacker payout',()=>{
  const E=load(),team=[slot('trainee'),slot('veteran')];
  for(const [requested,stacks] of [[-1,0],[0,0],[3,3],[3.9,3],[100,100],[1000,100]]) {
    check(E,team,{...plain,experienceVeteranStacks:requested},veteran(stacks));
  }
  check(E,team,{...plain,experienceAttacker:1,experienceVeteranShareChance:50},veteran()*.5);
  check(E,[team[0],slot('veteran','skill')],{...plain,snowFort:true,experienceAttacker:1,experienceVeteranShareChance:50},veteran(100,178)*.59);
  check(E,team,{...plain,experienceAttacker:1,experienceSkills:false},0);
});

test('Archer mark uses integer Skill Power and wave mastery scales the full marked kill',()=>{
  const E=load(),team=[slot('trainee'),slot('archer')],tiled=[team[0],slot('archer','skill')];
  near(archer(0),133.4,'base mark plus scaled Skill Power');
  near(archer(0,782),159.4,'Skill tile rounds 782.4 Skill Power to 782');
  near(archer(),65165.9,'wave 75000 marked payout');
  for(const wave of [0,1,75000]) for(const coverage of [0,50,100]) {
    const s={...plain,snowFort:true,experienceWave:wave,experienceArcherCoverage:coverage};
    check(E,team,s,archer(wave,652,coverage));
    check(E,tiled,s,archer(wave,782,coverage));
  }
  for(const damageMasteryTileBoost of [0,20,100]) {
    check(E,tiled,{...plain,snowFort:true,damageMasteryTileBoost},archer(75000,782));
  }
  const custom={...plain,snowFort:true,experienceWave:0,experienceArcherBonus:12000};
  check(E,team,custom,121);
  check(E,tiled,custom,144.6);
  check(E,tiled,{...plain,snowFort:true,experienceArcherBonus:0},1);
  check(E,team,{...plain,experienceWave:-1,experienceArcherCoverage:200},archer(0));
});

test('Ballista active aura and capped mastery stacks multiply as separate XP reward factors',()=>{
  const E=load(),team=[slot('trainee'),slot('ballista')];
  for(const [requested,stacks] of [[-1,0],[0,0],[3,3],[3.9,3],[100,100],[1000,100]]) {
    check(E,team,{...plain,experienceBallistaStacks:requested},ballista(stacks));
  }
  near(ballista(),297.375,'full active and mastery factors');
  check(E,[team[0],slot('ballista','skill')],{...plain,snowFort:true},ballista(100,916));
});

test('Archer leveling keeps the mark separate from the killer tile and Veteran sharing',()=>{
  const E=load(),settings={...plain,snowFort:true,experienceVeteranSuperChance:0,experienceVeteranSuperAmountPerStack:0};
  const single=[slot('archer'),slot('veteran'),slot('other')];
  const evaluate=(team,extra={})=>E.evaluate(team,{...settings,...extra}).metrics.experience;
  const withTiles=(team,tiles)=>team.map((hero,index)=>({...hero,tile:tiles[index]??'normal'}));
  const normal=evaluate(single);
  const directSkill=evaluate(withTiles(single,['skill']));
  const directXp=evaluate(withTiles(single,['experience']));
  near(directXp,normal*1.2,'XP tile on the Archer making the kill');
  assert.ok(directSkill>normal && directSkill<directXp,'only the scalable part of the mark receives Skill Power');
  const own=E.compareExperienceAttackerTiles(single,settings);
  assert.equal(own.preferred,'experience');
  near(own.options.skill.score,directSkill,'attacker tile table matches the skill payout');
  near(own.options.experience.score,directXp,'attacker tile table matches the XP payout');
  const shared={...settings,experienceAttacker:2,experienceVeteranShareChance:50};
  const skillAndXp=withTiles(single,['skill','normal','experience']);
  check(E,skillAndXp,shared,directSkill*1.2*.5);
  check(E,withTiles(single,['experience','normal','normal']),shared,normal*.5);
  const twoArchers=[slot('archer','experience'),slot('veteran'),slot('archer','skill')];
  const duplicate=check(E,twoArchers,settings,directSkill*1.2);
  assert.equal(duplicate.experienceSkills.skills.find(skill=>skill.id==='archer').ownerIndex,2);
});

test('each named XP skill uses one provider and prefers a skill-tiled copy',()=>{
  const E=load(),team=[slot('trainee'),slot('archer'),slot('ballista'),slot('veteran'),
    slot('archer','skill'),slot('ballista','skill'),slot('veteran','skill')];
  const result=check(E,team,{...plain,snowFort:true},archer(75000,782)*ballista(100,916)*veteran(100,178));
  assert.deepEqual(Array.from(result.experienceSkills.skills,skill=>[skill.id,skill.ownerIndex]),[['archer',4],['ballista',5],['veteran',6]]);
  const reversed=[team[0],...team.slice(1).reverse()];
  check(E,reversed,{...plain,snowFort:true},result.metrics.experience);
  const disabled=check(E,team,{...plain,snowFort:true,experienceSkills:false},1);
  assert.equal(disabled.experienceSkills.skills.length,0);
  assert.equal(disabled.experienceSkills.rewardFactor,1);
  assert.equal(disabled.experienceSkills.veteran.index,null);
});

test('captured XP skills do not receive GM event or raw Skill Power a second time',()=>{
  const E=load(['trainee','archer','ballista','veteran'].map(id=>({id,milestones:[{type:'Skill Power',value:10000,global:true,level:1}]})));
  const team=[slot('trainee'),slot('archer'),slot('ballista'),slot('veteran')];
  for(const grandMaster of [false,true]) for(const synergyEvent of [false,true]) {
    check(E,team,{...plain,grandMaster,synergyEvent,milestoneScale:9},archer()*ballista()*veteran());
  }
  const tiled=team.map((hero,index)=>index?{...hero,tile:'skill'}:hero);
  for(const damageMasteryTileBoost of [0,100]) {
    check(E,tiled,{...plain,snowFort:true,damageSkillTileBoost:40,damageMasteryTileBoost},
      archer(75000,913)*ballista(100,1068)*veteran(100,207));
  }
});

test('XP reward skills stay separate from the displayed Rank EXP reference',()=>{
  const E=load(),team=[slot('trainee'),slot('archer'),slot('ballista'),slot('veteran')];
  const reference=E.captureExperienceReference(team,plain,{rankBonus:66000000,superChance:260,ultraChance:450},'Measured XP');
  assert.equal(reference.rankFlat,0);
  assert.equal(reference.rankMultiplier,1);
  near(reference.modeledSuperChance,149,'Veteran is part of the displayed total');
  const reward=archer()*ballista(),expected=reward*(1+1626/100)*(1+(160+350)*.05);
  const result=check(E,team,{...plain,experienceReference:reference},expected);
  near(result.experienceSkills.rewardFactor,reward,'combined named reward effects');
  const row=E.compareExperienceAttackers(result).rows[0];
  assert.equal(row.rankFactor,1);
  near(row.rewardFactor,reward,'reward factor is visible separately in comparison');
  near(row.totalSuperChance,260,'no duplicate chance contribution');
  near(row.totalUltraChance,450,'observed Ultra total');
});

test('every build receives XP skills without changing Gold Damage or Energy metrics',()=>{
  const E=load(),team=[slot('trainee'),slot('archer'),slot('ballista'),slot('veteran')];
  const settings={...plain,experienceLeveler:null},off=E.evaluate(team,{...settings,experienceSkills:false});
  const result=check(E,team,settings,archer()*ballista()*veteran());
  for(const focus of ['gold','damage','energy','powerMageEnergy']) {
    near(result.metrics[focus],off.metrics[focus],focus+' unchanged');
    near(E.makeScorer(settings,focus,team)(team),off.metrics[focus],focus+' compiled');
  }
});

test('XP placement search jointly chooses Archer Ballista and Veteran skill tiles',()=>{
  const E=load(),team=[slot('trainee'),slot('archer'),slot('ballista'),slot('veteran')];
  const settings={...plain,snowFort:true},result=E.optimizePlacements(team,settings,'experience');
  let best=0;
  const tiles=['normal','milestone','synergy','skill','experience'];
  for(const a of tiles) for(const b of tiles) for(const c of tiles) for(const d of tiles) {
    const selected=[a,b,c,d];
    if(selected.filter(tile=>tile==='experience').length>1) continue;
    if(tiles.slice(1).some(tile=>selected.filter(value=>value===tile).length>3)) continue;
    const candidate=team.map((hero,index)=>({...hero,tile:selected[index]}));
    best=Math.max(best,E.evaluate(candidate,settings).metrics.experience);
  }
  near(result.score,best,'exhaustive placement comparison');
  assert.equal(result.team[0].tile,'experience');
  assert.ok(result.team.slice(1).every(hero=>hero.tile==='skill'));
  check(E,result.team,settings,result.score);
});

test('team suggestions and cached scorers value distinct XP skills instead of duplicate providers',()=>{
  const E=load([{id:'trainee'},{id:'archer'},{id:'ballista'},{id:'veteran'},
    {id:'other',milestones:[{type:'Super Exp Amount',value:100,global:true,level:1}]}]);
  const team=[slot('trainee'),slot('other'),slot('other'),slot('other')];
  const result=E.optimizeTeam(team,plain,'experience',['archer','ballista','veteran','other']);
  assert.deepEqual(Array.from(result.team.slice(1),hero=>hero.id).sort(),['archer','ballista','veteran']);
  check(E,result.team,plain,archer()*ballista()*veteran());
  const score=E.makeScorer(plain,'experience',team);
  for(const ids of [['archer','ballista','veteran'],['archer','archer','veteran'],['ballista','ballista','other'],['other','other','other']]) {
    const candidate=[slot('trainee'),...ids.map(id=>slot(id))];
    near(score(candidate),E.evaluate(candidate,plain).metrics.experience,'changing candidate providers');
  }
});

test('XP skill numeric settings reject invalid inputs and retain explicit zero overrides',()=>{
  const E=load(),keys=['experienceArcherBonus','experienceArcherMasteryPerWave','experienceWave','experienceArcherCoverage',
    'experienceBallistaBonus','experienceBallistaMasteryPerStack','experienceBallistaStacks',
    'experienceVeteranSuperChance','experienceVeteranShareChance','experienceVeteranSuperAmountPerStack'];
  for(const key of keys) {
    assert.equal(E.settingsFor({[key]:NaN})[key],E.defaults[key],key+' invalid fallback');
    assert.equal(E.settingsFor({[key]:Infinity})[key],E.defaults[key],key+' infinite fallback');
    assert.equal(E.settingsFor({[key]:0})[key],0,key+' zero');
    assert.equal(E.settingsFor({[key]:-10})[key],0,key+' lower bound');
  }
});
