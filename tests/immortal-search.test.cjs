'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const modes = ['skill','melee','mage','ranged'];
const ids = ['champion','wizard','ranger','witch','other'];
const buffHeroes = ['warlock','wizard','titan','apprentice'];
// Used below only as an explicit custom requiredHeroes list, never an Immortal default.
const xpHeroes = ['archer','ballista','veteran'];
const damageConfig = mode => ({mode,buffTeam:'warlock',priority:'damage'});
const slot = (id, level=1000, locked=false, tile='normal') => ({id,level,locked,tile});

// A small additive damage model with an off-type multiplicative support
// makes the optimizer's expected global optimum independently enumerable.
function testScore(team, mode) {
  const damageHero = {skill:'champion',melee:'champion',mage:'wizard',ranged:'ranger'}[mode];
  const damage = team.filter(s=>s.id===damageHero).reduce((sum,s)=>sum+(1+s.level)*(s.tile==='damage'?2:1),0);
  const support = team.filter(s=>s.id==='witch').reduce((factor,s)=>factor*(s.tile==='skill'?5:4),1);
  return damage*support;
}
function load() {
  const window = {HERO_DATA:{meta:{statAliases:{}},heroes:[...new Set([...ids,...buffHeroes,...xpHeroes])].map(id=>({id,name:id,milestones:[],synergies:[]}))}};
  const context = vm.createContext({window});
  vm.runInContext(fs.readFileSync(path.join(root,'engine.js'),'utf8'),context);
  window.HeroEngine.immortal = {
    deployedBuffHeroes:buffHeroes,
    normalize:config=>config, makeScorer:(_,config)=>{
      const scorer=team=>testScore(team,config.mode);
      scorer.details=team=>({score:scorer(team),championHitsPerSecond:team.reduce((sum,s)=>sum+(s.id==='champion'?(s.tile==='skill'?3:1):0),0)});
      return scorer;
    },
    canDamage:(id,config)=>testScore([slot(id)],config.mode)>0
  };
  vm.runInContext(fs.readFileSync(path.join(root,'immortal-search.js'),'utf8'),context);
  return window.HeroEngine;
}

test('all four small-roster searches match exhaustive legal roster and tile combinations', () => {
  const E = load(), team = [slot('other',30),slot('other',3)], before = JSON.stringify(team);
  const tiles = ['normal','damage','skill','milestone','synergy'];
  for (const mode of modes) {
    let high = 0;
    for (const a of ids) for (const b of ids) for (const x of tiles) for (const y of tiles) {
      if (x==='damage' && y==='damage') continue;
      high = Math.max(high,testScore([slot(a,30,false,x),slot(b,3,false,y)],mode));
    }
    const result = E.optimizeImmortalTeam(team,{snowFort:true},damageConfig(mode),ids);
    assert.equal(result.score,high);
    assert.equal(result.score,testScore(result.team,mode));
    assert.equal(result.exact,true);
    assert.deepEqual(Array.from(result.team,s=>s.level),[30,3]);
    assert.equal(result.team[1].id,'witch');
    assert.equal(result.team[1].tile,'skill');
  }
  assert.equal(JSON.stringify(team),before);
});

test('a fully locked off-type support stays eligible and tiles may move even on locked heroes', () => {
  const E = load(), team = [slot('witch',120,true),slot('champion',9000,true,'synergy')];
  const optimized = E.optimizeImmortalTeam(team,{snowFort:true},{mode:'skill'},[]);
  const placed = E.optimizeImmortalPlacements(team,{snowFort:true},{mode:'skill'});
  assert.equal(optimized.score,9001*2*5);
  assert.equal(placed.score,optimized.score);
  assert.deepEqual(Array.from(optimized.team,s=>[s.id,s.level,s.locked,s.tile]),
    [['witch',120,true,'skill'],['champion',9000,true,'damage']]);
  const offMap = E.optimizeImmortalPlacements(team,{snowFort:false},{mode:'skill'});
  assert.deepEqual(JSON.parse(JSON.stringify(offMap.team)),team);
});

test('the large-roster search preserves slot constraints, optional exclusions and tile capacities', () => {
  const E = load(), team = ['ranger','other','wizard','champion','witch','other','other','champion','wizard','witch']
    .map((id,i)=>slot(id,500*(i+1),i===0,i<3?'milestone':i<6?'synergy':i<9?'skill':'normal'));
  const before = JSON.stringify(team), allowed=['champion','witch','other','wizard'];
  const result = E.optimizeImmortalTeam(team,{snowFort:true},{mode:'skill'},allowed);
  assert.ok(result.score>=testScore(team,'skill'));
  assert.equal(result.score,testScore(result.team,'skill'));
  result.team.forEach((s,i)=>{
    assert.equal(s.locked,team[i].locked);
    assert.equal(s.level,team[i].level);
    if (s.locked) assert.equal(s.id,team[i].id);
    else assert.ok(allowed.includes(s.id));
  });
  for (const id of ids) assert.ok(result.team.filter(s=>s.id===id).length<=3);
  for (const type of ['damage','milestone','synergy','skill']) {
    assert.ok(result.team.filter(s=>s.tile===type).length<=(type==='damage'?1:3));
  }
  assert.throws(()=>E.optimizeImmortalTeam(team,{}, {mode:'skill'},['champion','witch']),/at most 3 copies/);
  assert.equal(JSON.stringify(team),before);
});

test('unavailable damage sources are explained, and fixed teams and tile comparisons can still score zero', () => {
  const E = load(), team = [slot('witch',250,true),slot('ranger',300)];
  for (const mode of ['skill','melee','mage']) {
    assert.throws(()=>E.optimizeImmortalTeam(team,{}, {mode},['other','ranger']),mode==='skill'?/no modeled direct skill damage/:/Include a matching damage dealer/);
    assert.equal(E.optimizeImmortalPlacements(team,{}, {mode}).score,0);
    assert.equal(E.optimizeImmortalTeam(team.map(s=>({...s,locked:true})),{}, {mode},[]).score,0);
  }
});

test('suggestions for real heroes agree with the full Immortal evaluator in every boss mode', () => {
  const window = {}, context = vm.createContext({window});
  for (const file of ['data.js','engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  }
  const E = window.HeroEngine, settings = {synergyEvent:true};
  const team = ['wizard','champion','ranger','witch','champion','ranger','druid']
    .map((id,i)=>slot(id,10000+i*50,i===0,i<3?'milestone':i<6?'synergy':'skill'));
  const allowed = ['champion','wizard','witch','druid','ranger','deadeye'];
  for (const mode of modes) {
    const config = damageConfig(mode);
    const result = E.optimizeImmortalTeam(team,settings,config,allowed);
    const replay = E.immortal.evaluate(result.team,settings,config);
    const previous = E.immortal.evaluate(team,settings,config);
    assert.ok(Math.abs(result.score-replay.score)<=replay.score*1e-10,mode);
    assert.ok(result.score>=previous.score*(1-1e-10),mode);
    assert.ok(result.score>0);
    assert.ok(result.team.every(s=>allowed.includes(s.id)));
    assert.equal(result.team[0].id,'wizard');
    assert.equal(result.team.filter(s=>s.id==='warlock').length,0);
    if (mode==='skill') {
      const champions = replay.heroes.filter(h=>h.id==='champion');
      assert.equal(champions.length,3);
      assert.ok(champions.every(h=>h.skillDps>0 && h.skillCooldown===1));
    }
  }
});

test('the deployed buff team supplies all four required heroes even when excluded from the optional roster', () => {
  const E=load(), config={...damageConfig('skill'),buffTeam:'deploy'};
  const team=['other','other','wizard','wizard','witch','ranger','other','witch'].map((id,i)=>slot(id,1000+i,i===0));
  const result=E.optimizeImmortalTeam(team,{snowFort:true},config,['champion']);
  for (const id of buffHeroes) assert.ok(result.team.some(s=>s.id===id),id);
  assert.equal(result.team.filter(s=>s.id==='champion').length,3);
  assert.equal(result.team[0].id,'other');
  assert.throws(()=>E.optimizeImmortalTeam(team.slice(0,3),{},config,['champion']),/deployed buff team needs/);
  assert.throws(()=>E.optimizeImmortalTeam(team.map(s=>({...s,locked:true})),{},config,['champion']),/only 0 slots can change/);
  assert.throws(()=>E.optimizeImmortalTeam(buffHeroes.map(id=>slot(id)),{},config,['champion']),/no modeled direct skill damage/);
});

test('Immortal defaults allow removing all XP heroes when the optional roster excludes them',()=>{
  const E=load(),team=[...xpHeroes,'other'].map(id=>slot(id));
  assert.equal(E.defaults.requiredHeroes.length,0);
  for(const mode of modes) {
    const dealer={skill:'champion',melee:'champion',mage:'wizard',ranged:'ranger'}[mode];
    const result=E.optimizeImmortalTeam(team,{snowFort:false},damageConfig(mode),[dealer,'witch']);
    assert.ok(result.team.every(hero=>!xpHeroes.includes(hero.id)),mode+' has no implicit XP requirement');
    assert.ok(result.team.every(hero=>[dealer,'witch'].includes(hero.id)));
    assert.ok(result.score>0);
    assert.equal(result.score,testScore(result.team,mode));
  }
});

test('explicit custom requiredHeroes can include the XP trio in every Immortal mode', () => {
  const E=load(),team=[slot('other',4000),slot('other',3000),slot('other',2000),slot('witch',1000)];
  const before=JSON.stringify(team),settings={snowFort:false,requiredHeroes:xpHeroes};
  for (const mode of modes) {
    const dealer={skill:'champion',melee:'champion',mage:'wizard',ranged:'ranger'}[mode];
    const result=E.optimizeImmortalTeam(team,settings,damageConfig(mode),[dealer]);
    assert.equal(result.exact,true);
    for (const id of xpHeroes) assert.equal(result.team.filter(hero=>hero.id===id).length,1,mode+' requires '+id);
    assert.equal(result.team.filter(hero=>hero.id===dealer).length,1,mode+' keeps an eligible attacker');
    assert.equal(result.team[0].id,dealer,'the damage dealer uses the highest-level open slot');
    assert.equal(result.score,testScore(result.team,mode));
    assert.deepEqual(Array.from(result.team,hero=>hero.level),team.map(hero=>hero.level));
  }
  assert.equal(JSON.stringify(team),before);
});

test('explicit custom XP requirements combine with deployed buff minima in every Immortal mode', () => {
  const E=load(),team=['other','other','other','witch','witch','ranger','ranger','champion','champion','wizard']
    .map((id,i)=>slot(id,1000+i));
  const settings={snowFort:false,requiredHeroes:xpHeroes};
  for (const mode of modes) {
    const dealer={skill:'champion',melee:'champion',mage:'wizard',ranged:'ranger'}[mode];
    const config={...damageConfig(mode),buffTeam:'deploy'};
    const result=E.optimizeImmortalTeam(team,settings,config,[dealer]);
    for (const id of [...xpHeroes,...buffHeroes]) assert.ok(result.team.some(hero=>hero.id===id),mode+' requires '+id);
    assert.ok(result.team.some(hero=>hero.id===dealer),mode+' retains a matching damage dealer');
    assert.ok(result.score>0);
    assert.equal(result.score,testScore(result.team,mode));
    assert.ok(result.team.every(hero=>[...xpHeroes,...buffHeroes,dealer].includes(hero.id)));
    for (const id of [...xpHeroes,...buffHeroes,dealer]) assert.ok(result.team.filter(hero=>hero.id===id).length<=3);
  }
});

test('explicit custom required heroes respect locks, reject unknown IDs and leave room for a damage dealer', () => {
  const E=load(),settings={snowFort:false,requiredHeroes:xpHeroes},config=damageConfig('skill');
  const team=[slot('archer',500,true),slot('other',400),slot('other',300),slot('other',200)];
  const result=E.optimizeImmortalTeam(team,settings,config,['champion']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.team[0])),team[0]);
  for (const id of xpHeroes) assert.ok(result.team.some(hero=>hero.id===id));
  assert.throws(()=>E.optimizeImmortalTeam(team.map(hero=>({...hero,locked:true})),settings,config,['champion']),
    /Required heroes ballista, veteran need 2 slots, but only 0 slots can change/);
  assert.throws(()=>E.optimizeImmortalTeam(team.slice(0,3),settings,config,['champion']),/no modeled direct skill damage/);
  assert.throws(()=>E.optimizeImmortalTeam(team,{...settings,requiredHeroes:['missing-hero']},config,['champion']),
    /Unknown required hero: missing-hero/);
});

test('required IDs are minimums rather than duplicate limits and repeated requirements are deduplicated', () => {
  const E=load(),team=['other','other','other','ranger','ranger'].map(id=>slot(id));
  const result=E.optimizeImmortalTeam(team,{snowFort:false,requiredHeroes:['witch','witch']},damageConfig('skill'),['champion']);
  assert.equal(result.team.filter(hero=>hero.id==='witch').length,3,'three beneficial copies remain legal');
  assert.equal(result.team.filter(hero=>hero.id==='champion').length,2);
  assert.equal(result.score,testScore(result.team,'skill'));
});

test('real Immortal scorers honor an explicit custom XP trio and evaluator parity in all four modes', () => {
  const window={},context=vm.createContext({window});
  for (const file of ['data.js','engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  }
  const E=window.HeroEngine,team=['archer','wizard','ranger','champion'].map((id,i)=>slot(id,15000,i===0));
  const settings={snowFort:false,synergyEvent:true,requiredHeroes:xpHeroes};
  for (const mode of modes) {
    const config=damageConfig(mode),result=E.optimizeImmortalTeam(team,settings,config,['champion','wizard','ranger']);
    for (const id of xpHeroes) assert.ok(result.team.some(hero=>hero.id===id),mode+' requires '+id);
    assert.equal(result.team[0].id,'archer');
    assert.ok(result.score>0);
    const replay=E.immortal.evaluate(result.team,settings,config).score;
    assert.ok(Math.abs(result.score-replay)<=replay*1e-10,mode+' evaluator parity');
  }
});

test('melee strike priority maximizes aggregate Champion hit frequency and uses boss DPS only to break ties', () => {
  const E=load(), team=[slot('other',200),slot('other',20),slot('witch',10),slot('witch',1)];
  const config={mode:'melee',buffTeam:'swap',priority:'strikes'};
  const allowed=['champion','witch','other'];
  const strikes=E.optimizeImmortalTeam(team,{snowFort:true},config,allowed);
  const damage=E.optimizeImmortalTeam(team,{snowFort:true},{...config,priority:'damage'},allowed);
  assert.equal(strikes.championHitsPerSecond,9);
  assert.equal(strikes.priority,'strikes');
  assert.equal(strikes.team.filter(s=>s.id==='champion'&&s.tile==='skill').length,3);
  assert.equal(strikes.team.find(s=>s.id!=='champion').id,'witch','the remaining support wins the DPS tiebreak');
  assert.ok(strikes.score<damage.score);
  assert.ok(strikes.championHitsPerSecond>damage.championHitsPerSecond);
  assert.equal(strikes.score,testScore(strikes.team,'melee'));
  const fixed=[slot('champion',100,true),slot('witch',100,true)];
  const placement=E.optimizeImmortalPlacements(fixed,{snowFort:true},config);
  assert.deepEqual(Array.from(placement.team,s=>s.tile),['skill','skill']);
  assert.equal(placement.score,101*5);
  assert.equal(placement.championHitsPerSecond,3);
});

test('Ranged and Mage team and tile searches prefer attack frequency and use DPS to settle equal rates',()=>{
  const hero=(id,attackSpeed,damage,milestones=[])=>({id,name:id,synergies:[],milestones,observedBaseStats:{attackSpeed,damage}});
  const speedMilestone={type:'Attack Speed',value:100,global:false,level:1};
  const window={HERO_DATA:{meta:{statAliases:{}},heroes:[
    hero('hunter',1,1e12),hero('ballista',4,100,[speedMilestone]),hero('archer',4,200,[speedMilestone]),
    hero('witch',1,1e12),hero('apprentice',4,100,[speedMilestone]),hero('battlemage',4,200,[speedMilestone])
  ]}};
  const ctx=vm.createContext({window});
  for(const file of ['engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  }
  const E=window.HeroEngine, s={grandMaster:false,synergyEvent:false,mapAttackSpeed:0,snowFort:true,
    milestoneScale:1,damageTile:1e7,damageSkills:false,damageSupportSkills:false};
  for(const [mode,slow,fast,betterFast] of [['ranged','hunter','ballista','archer'],['mage','witch','apprentice','battlemage']]) {
    const cfg={mode,buffTeam:'warlock',priority:'attacks'},team=[slot(slow,1)],allowed=[slow,fast,betterFast];
    const attacks=E.optimizeImmortalTeam(team,s,cfg,allowed);
    const dps=E.optimizeImmortalTeam(team,s,{...cfg,priority:'damage'},allowed);
    assert.equal(attacks.priority,'attacks');
    assert.equal(attacks.team[0].id,betterFast,'equal-speed choice uses DPS');
    assert.equal(attacks.team[0].tile,'milestone');
    const raw=E.immortal.evaluate(attacks.team,s,cfg);
    assert.equal(attacks.attacksPerSecond,raw.attacksPerSecond);
    assert.equal(attacks.score,raw.score);
    assert.ok(dps.score>attacks.score);
    assert.ok(attacks.attacksPerSecond>dps.attacksPerSecond);
    const fixed=[slot(betterFast,1,true,'damage')];
    const tiles=E.optimizeImmortalPlacements(fixed,s,cfg);
    assert.equal(tiles.team[0].tile,'milestone');
    assert.equal(E.optimizeImmortalPlacements(fixed,s,{...cfg,priority:'damage'}).team[0].tile,'damage');
  }
});

test('a Wizard can win the Ranged hit-rate search even when its slot costs attacks per second',()=>{
  const window={HERO_DATA:{meta:{statAliases:{}},heroes:['hunter','wizard'].map(id=>({
    id,name:id,synergies:[],milestones:[],observedBaseStats:{damage:100,attackSpeed:20}
  }))}};
  const ctx=vm.createContext({window});
  for(const file of ['engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  }
  const E=window.HeroEngine, team=[slot('hunter',1,true),slot('hunter',1)];
  const s={grandMaster:false,snowFort:false,damageSupportSkills:true,heroAscensions:{hunter:{maxAttackSpeedLevel:5}}};
  const cfg={mode:'ranged',buffTeam:'warlock'};
  const attack=E.optimizeImmortalTeam(team,s,{...cfg,priority:'attacks'});
  const hits=E.optimizeImmortalTeam(team,s,cfg);
  assert.equal(attack.attacksPerSecond,30);
  assert.equal(attack.totalHitRate,30);
  assert.equal(hits.priority,'hits');
  assert.equal(hits.team[1].id,'wizard');
  assert.equal(hits.attacksPerSecond,15);
  assert.equal(hits.totalHitRate,45);
  assert.equal(E.immortal.evaluate(hits.team,s,cfg).totalHitRate,hits.totalHitRate);
});

test('the search prefers hits first, then the weakest attacker’s Ultra chance, then Ultra hits and DPS',()=>{
  const window={HERO_DATA:{meta:{statAliases:{}},heroes:[
    ['hunter',2,1,100],['archer',2,1e10,80],['ballista',3,100,0]
  ].map(([id,attackSpeed,damage,ultra])=>({id,name:id,synergies:[],
    milestones:[{level:1,type:'Ultra Crit Chance',value:ultra,global:false}],observedBaseStats:{attackSpeed,damage}}))}};
  const ctx=vm.createContext({window});
  for(const file of ['engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  }
  const E=window.HeroEngine, team=[slot('archer',1)], s={grandMaster:false,snowFort:false,
    synergyEvent:false,milestoneScale:1,damageSkills:false,damageSupportSkills:false};
  const cfg={mode:'ranged',buffTeam:'warlock',baseCritChance:100,baseSuperChance:100,baseUltraChance:0};
  const all=E.optimizeImmortalTeam(team,s,cfg);
  assert.equal(all.team[0].id,'ballista','extra hit wins despite zero Ultra chance');
  const tied=E.optimizeImmortalTeam(team,s,cfg,['hunter','archer']);
  assert.equal(tied.team[0].id,'hunter','guaranteed Ultra beats larger damage at equal hit rates');
  assert.equal(tied.lowestUltraProbability,1);
  assert.equal(tied.ultraHitsPerSecond,2);
  assert.equal(E.optimizeImmortalTeam(team,s,{...cfg,priority:'damage'},['hunter','archer']).team[0].id,'archer');
  const a={totalHitRate:20,lowestUltraProbability:.75,ultraHitsPerSecond:17,score:100};
  const compare=(b)=>E.immortal.compareResults(a,{...a,...b},'hits');
  assert.ok(compare({lowestUltraProbability:.5,ultraHitsPerSecond:19})>0);
  assert.ok(compare({ultraHitsPerSecond:18,score:1})<0);
  assert.ok(compare({score:101})<0);
});
