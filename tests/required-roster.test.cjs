'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
function load(heroes) {
  const context = vm.createContext({window: {}});
  if (heroes) context.window.HERO_DATA = {meta: {statAliases: {}}, heroes: heroes.map(h => ({name:h.id, milestones:[], synergies:[], ...h}))};
  else vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return context.window.HeroEngine;
}
const slot = (id, level=25, locked=false, tile='normal') => ({id, level, locked, tile});
const milestone = (type, value, global=true, level=25) => ({type,value,global,level});
const required = ['hunter','rogue','sovereign'];
const neutral = {milestoneScale:1, accountSynergyBoosts:false, grandMaster:false, snowFort:false, goldSkills:false};
const count = (team,id) => team.filter(s=>s.id===id).length;
function requiredPresent(result, ids=required) {
  for (const id of ids) assert.ok(count(result.team,id)>=1, `Missing required ${id}`);
  for (const id of new Set(result.team.map(s=>s.id))) assert.ok(count(result.team,id)<=3, `Too many ${id}`);
}
function near(actual,expected) { assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`); }
const tests=[];
const test=(name,run)=>tests.push({name,run});
const plain = () => load([
  {id:'hunter'}, {id:'rogue'}, {id:'sovereign'}, {id:'empty'}, {id:'locked'},
  {id:'rich', milestones:[milestone('Kill Gold',100)]}
]);

test('required Gold heroes enter a team even when excluded from the optional roster', () => {
  const E=plain(), team=[slot('empty',25),slot('empty',50),slot('locked',75,true),slot('hunter',100)];
  const before=JSON.stringify(team), settings={...neutral,goldHero:3,requiredHeroes:required};
  const result=E.optimizeTeam(team,settings,'gold',['rich']);
  requiredPresent(result);
  assert.equal(result.team[2].id,'locked');
  assert.equal(result.team[3].id,'hunter');
  result.team.forEach((s,i)=>{ assert.equal(s.level,team[i].level); assert.equal(s.locked,team[i].locked); });
  assert.equal(JSON.stringify(team),before);
  assert.deepEqual(required,['hunter','rogue','sovereign']);
  near(result.score,E.evaluate(result.team,settings).metrics.gold);
});

test('required minima do not freeze extra copies or require optional roster selections', () => {
  const E=plain();
  const duplicate=[slot('hunter'),slot('hunter'),slot('hunter'),slot('rogue'),slot('sovereign')];
  const result=E.optimizeTeam(duplicate,{...neutral,goldHero:0,requiredHeroes:required},'gold',['rich']);
  requiredPresent(result);
  assert.equal(count(result.team,'hunter'),1);
  assert.equal(count(result.team,'rich'),2);
  near(result.score,4);
  const exact=E.optimizeTeam([slot('empty'),slot('empty'),slot('empty')],
    {...neutral,goldHero:'best',requiredHeroes:[...required,'hunter']},'gold',[]);
  requiredPresent(exact);
  assert.equal(exact.team.length,3);
});

test('mandatory heroes can move between slot levels without removing a requirement', () => {
  const E=load([{id:'hunter',milestones:[milestone('Kill Gold',1000,false)]},{id:'rogue'},{id:'sovereign'}]);
  const team=[slot('hunter',0),slot('rogue',25),slot('sovereign',0)];
  const result=E.optimizeTeam(team,{...neutral,goldHero:'best',requiredHeroes:required},'gold',[]);
  requiredPresent(result);
  assert.equal(result.team[1].id,'hunter');
  near(result.score,11);
  assert.equal(result.team[0].level,0); assert.equal(result.team[1].level,25); assert.equal(result.team[2].level,0);
});

test('impossible requirements explain slots and preserve locks and the chosen attacker', () => {
  const E=plain();
  const cases=[
    [slot('empty'),slot('empty')],
    [slot('locked',25,true),slot('empty'),slot('empty')],
    [slot('locked'),slot('empty'),slot('empty')]
  ];
  for (const [i,team] of cases.entries()) {
    const before=JSON.stringify(team);
    assert.throws(()=>E.optimizeTeam(team,{...neutral,goldHero:i===2?0:'best',requiredHeroes:required},'gold'), /Required heroes.*need 3 available slots.*only 2 can change/);
    assert.equal(JSON.stringify(team),before);
  }
  const locked=[slot('hunter',25,true),slot('rogue',25,true),slot('locked',25,true)];
  assert.throws(()=>E.optimizeTeam(locked,{...neutral,goldHero:'best',requiredHeroes:required},'gold'),/sovereign.*only 0 can change/);
  assert.throws(()=>E.optimizeTeam([slot('hunter')],{...neutral,requiredHeroes:['not-a-hero']},'gold'),/Unknown required hero/);
});

test('a fully locked valid roster can optimize tiles without optional candidates', () => {
  const E=plain(), team=required.map((id,i)=>slot(id,25+i,true));
  const settings={...neutral,snowFort:true,goldHero:0,requiredHeroes:required};
  const result=E.optimizeTeam(team,settings,'gold',[]);
  requiredPresent(result);
  result.team.forEach((s,i)=>{assert.equal(s.id,team[i].id);assert.equal(s.level,team[i].level);assert.equal(s.locked,true);});
  near(result.score,E.evaluate(result.team,settings).metrics.gold);
});

test('synergy seeds satisfy mandatory heroes while preserving multi-partner links', () => {
  const E=load(required.map(id=>({id})).concat([
    {id:'combo', synergies:[{type:'Super Gold Amount',value:1000,global:true,tier:1,requires:['partner1','partner2']}]},
    {id:'partner1'}, {id:'partner2'}, {id:'modest', milestones:[milestone('Kill Gold',10)]}
  ]));
  const team=[...required.map(id=>slot(id)),slot('modest'),slot('modest'),slot('modest')];
  const settings={...neutral,goldHero:0,requiredHeroes:required,requirementReduction:0};
  const result=E.optimizeTeam(team,settings,'gold',['modest','combo','partner1','partner2']);
  requiredPresent(result);
  for(const id of ['combo','partner1','partner2']) assert.equal(count(result.team,id),1);
  near(result.score,11);
});

test('without an explicit requirement the engine keeps ordinary candidate behavior', () => {
  const E=plain();
  const result=E.optimizeTeam([slot('hunter'),slot('rogue')],{...neutral,goldHero:'best'},'gold',['rich']);
  assert.ok(result.team.every(s=>s.id==='rich'));
  assert.equal(E.defaults.requiredHeroes.length,0);
});

test('requirements work with an Experience target and keep its personal level unchanged', () => {
  const E=load([{id:'student',milestones:[milestone('Super Exp Amount',100,false)]},
    {id:'mentor',milestones:[milestone('Rank Exp',100)]},{id:'assistant'},{id:'empty'}]);
  const team=[slot('empty',100),slot('student',25),slot('empty',200)];
  const settings={...neutral,experienceHero:1,requiredHeroes:['mentor','assistant']};
  const result=E.optimizeTeam(team,settings,'experience',[]);
  requiredPresent(result,['mentor','assistant']);
  assert.equal(result.team[1].id,'student');assert.equal(result.team[1].level,25);
  near(result.score,4);
});

test('full real Gold teams retain all three required skills with fixed or automatic attackers', () => {
  const E=load(), team=['hunter','militia','apprentice','forester','scout','viking','druid','battlemage','captain','warlock']
    .map((id,i)=>slot(id,15000,i===1,['milestone','synergy','skill','normal'][i%4]));
  const before=JSON.stringify(team);
  for(const goldHero of [0,'best']) {
    const settings={goldHero,requiredHeroes:required};
    const result=E.optimizeTeam(team,settings,'gold',['militia','paladin']);
    requiredPresent(result);
    assert.equal(result.team[1].id,'militia');assert.equal(result.team[1].locked,true);
    if(goldHero===0) assert.equal(result.team[0].id,'hunter');
    for(const s of result.team) assert.ok([...required,'militia','paladin'].includes(s.id));
    result.team.forEach((s,i)=>assert.equal(s.level,team[i].level));
    near(result.score,E.evaluate(result.team,settings).metrics.gold);
  }
  assert.equal(JSON.stringify(team),before);
});

test('Power Mage suggestions require Captain outside the optional roster while preserving locks and levels', () => {
  const E=load([{id:'captain',milestones:[milestone('Power Mage Energy',100)]},
    {id:'wave',milestones:[milestone('Super Energy Amount',20)]},{id:'locked'},{id:'empty'}]);
  const team=[slot('locked',125,true),slot('empty',25),slot('empty',250)];
  const before=JSON.stringify(team), settings={...neutral,requiredHeroes:['captain']};
  for (const allowed of [['wave'],[]]) {
    const result=E.optimizeTeam(team,settings,'powerMageEnergy',allowed);
    requiredPresent(result,['captain']);
    assert.equal(result.team[0].id,'locked');
    result.team.forEach((s,i)=>{assert.equal(s.level,team[i].level);assert.equal(s.locked,team[i].locked);});
    near(result.score,E.evaluate(result.team,settings).metrics.powerMageEnergy);
    assert.ok(result.team.slice(1).every(s=>s.id==='captain'||allowed.includes(s.id)));
  }
  assert.equal(JSON.stringify(team),before);
});

test('Captain is a Power Mage minimum rather than an exact count or an additional required copy', () => {
  const E=load([{id:'captain',milestones:[milestone('Power Mage Energy',100)]},{id:'empty'}]);
  const settings={...neutral,requiredHeroes:['captain']};
  const one=[slot('captain',25,true)];
  const kept=E.optimizeTeam(one,settings,'powerMageEnergy',[]);
  assert.equal(count(kept.team,'captain'),1);
  assert.equal(kept.team[0].locked,true);
  near(kept.score,20000);
  const multiple=E.optimizeTeam([slot('captain'),slot('empty')],settings,'powerMageEnergy',[]);
  assert.equal(count(multiple.team,'captain'),2);
  near(multiple.score,40000);
});

test('locked teams missing Captain receive an error and ordinary Energy has no Captain requirement', () => {
  const E=load([{id:'captain',milestones:[milestone('Power Mage Energy',100)]},
    {id:'wave',milestones:[milestone('Super Energy Amount',20)]}]);
  const locked=[slot('wave',250,true)], before=JSON.stringify(locked);
  assert.throws(()=>E.optimizeTeam(locked,{...neutral,requiredHeroes:['captain']},'powerMageEnergy',[]),
    /Required heroes.*captain.*need 1 available slots.*only 0 can change/);
  assert.equal(JSON.stringify(locked),before);
  const ordinary=E.optimizeTeam([slot('captain'),slot('wave')],neutral,'energy',['wave']);
  assert.equal(count(ordinary.team,'captain'),0);
  assert.equal(count(ordinary.team,'wave'),2);
  near(ordinary.score,14400);
});

test('standard focus requirements reserve the XP trio only for Experience', () => {
  const E=load(), core=['archer','ballista','veteran'];
  const team=['militia','apprentice','forester','scout','viking','druid','battlemage','hunter','rogue','warlock']
    .map((id,index)=>slot(id,index===0?1500:15000,index===0));
  const cases=[
    {name:'Energy',focus:'energy',required:[]},
    {name:'Power Mage Energy',focus:'powerMageEnergy',required:['captain']},
    {name:'Gold',focus:'gold',required},
    {name:'Experience',focus:'experience',required:core,experienceLeveler:0,experienceStyle:'auto',experienceAttacker:'best'},
    {name:'Damage',focus:'damage',required:[]},
    {name:'Damage buff swap',focus:'damage',required:[],damageSupportMode:'debuffs'}
  ];
  const before=JSON.stringify(team),allowed=['paladin','scout','forester'];
  for(const scenario of cases) {
    const settings={...neutral,goldSkills:true,goldHero:0,damageHero:0,
      ...scenario,requiredHeroes:scenario.required};
    const result=E.optimizeTeam(team,settings,scenario.focus,allowed);
    requiredPresent(result,scenario.required);
    assert.equal(result.team.length,10,scenario.name);
    assert.equal(result.team[0].id,'militia',scenario.name+' protected attacker');
    assert.equal(result.team[0].locked,true);
    assert.equal(result.team[0].level,1500);
    result.team.forEach((hero,index)=>assert.equal(hero.level,team[index].level,scenario.name+' support level'));
    assert.ok(result.team.slice(1).every(hero=>[...scenario.required,...allowed].includes(hero.id)),scenario.name+' allowed roster');
    if(scenario.focus!=='experience') assert.ok(result.team.every(hero=>!core.includes(hero.id)),scenario.name+' does not force XP heroes');
    near(result.score,E.evaluate(result.team,settings).metrics[scenario.focus]);
  }
  assert.equal(JSON.stringify(team),before,'searches preserve the supplied lineup');
  assert.equal(E.defaults.requiredHeroes.length,0,'the application policy does not become an unconditional low-level engine requirement');
});

test('a limited real Gold roster needs only Hunter Rogue and Sovereign, without reserving XP slots',()=>{
  const E=load(),team=required.map(id=>slot(id,15000));
  const settings={...neutral,goldSkills:true,goldHero:'best',requiredHeroes:required};
  const result=E.optimizeTeam(team,settings,'gold',[]);
  assert.deepEqual(Array.from(result.team,hero=>hero.id).sort(),required.slice().sort());
  assert.ok(result.team.every(hero=>!['archer','ballista','veteran'].includes(hero.id)));
  near(result.score,E.evaluate(result.team,settings).metrics.gold);
});

test('a protected Archer leveler counts toward the core minimum while its copies share the target level', () => {
  const E=load(), core=['archer','ballista','veteran'];
  const team=[slot('archer',37,true),slot('archer',15000,true),slot('militia',15000),slot('paladin',15000)];
  const settings={...neutral,experienceLeveler:0,experienceStyle:'none',experienceAttacker:'self',requiredHeroes:core};
  const result=E.optimizeTeam(team,settings,'experience',[]);
  requiredPresent(result,core);
  assert.deepEqual(Array.from(result.team.slice(0,2),hero=>hero.id),['archer','archer']);
  assert.deepEqual(Array.from(result.team.slice(0,2),hero=>hero.level),[37,37]);
  assert.equal(result.team[0].locked,true);
  assert.equal(result.team[1].locked,true);
  assert.ok(result.team.slice(2).every(hero=>hero.level===15000));
  near(result.score,E.evaluate(result.team,settings).metrics.experience);
});

test('core requirements preserve a separately selected XP attacker and explain insufficient free slots', () => {
  const E=load(), core=['archer','ballista','veteran'];
  const enough=[slot('militia',37,true),slot('paladin',15000),slot('archer',15000,true),slot('scout',15000),slot('forester',15000)];
  const settings={...neutral,experienceLeveler:0,experienceStyle:'none',experienceAttacker:1,requiredHeroes:core};
  const result=E.optimizeTeam(enough,settings,'experience',[]);
  requiredPresent(result,core);
  assert.equal(result.team[0].id,'militia');assert.equal(result.team[0].level,37);
  assert.equal(result.team[1].id,'paladin');assert.equal(result.team[1].level,15000);
  assert.equal(result.team[2].id,'archer');assert.equal(result.team[2].locked,true);
  assert.equal(result.experiencePlan.attackerIndex,1);
  const insufficient=enough.slice(0,4),before=JSON.stringify(insufficient);
  assert.throws(()=>E.optimizeTeam(insufficient,settings,'experience',[]),/need 2 available slots.*only 1 can change/);
  assert.equal(JSON.stringify(insufficient),before);
});

test('explicit custom caller requirements report exact slot shortages without replacing locks', () => {
  // These extra caller-provided minima exercise the generic API, not focus defaults.
  const E=load(), core=['archer','ballista','veteran'];
  for(const [focus,ids] of [['gold',[...core,...required]],['powerMageEnergy',[...core,'captain']]]) {
    const team=[slot('militia',15000,true),...ids.slice(0,-1).map(()=>slot('paladin',15000))];
    // Use distinct fillers to respect the three-copy rule before validating the shortage.
    const fillers=['paladin','scout','forester','druid','viking'];
    team.forEach((hero,index)=>{if(index) hero.id=fillers[index-1];});
    const before=JSON.stringify(team),settings={...neutral,requiredHeroes:ids,goldHero:'best'};
    assert.throws(()=>E.optimizeTeam(team,settings,focus,[]),new RegExp(`need ${ids.length} available slots.*only ${ids.length-1} can change`));
    assert.equal(JSON.stringify(team),before);
  }
});

let failures=0;
for(const {name,run} of tests) {
  try {run();console.log(`PASS ${name}`);}
  catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);}
}
console.log(`\n${tests.length-failures}/${tests.length} required-roster tests passed.`);
process.exitCode=failures?1:0;
