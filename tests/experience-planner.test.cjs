'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','engine.js'),'utf8');
function load(heroes) {
  const window = {HERO_DATA:{meta:{statAliases:{}},heroes:heroes.map(h=>({name:h.id,milestones:[],synergies:[],...h}))}};
  vm.runInNewContext(source,{window});
  return window.HeroEngine;
}
const slot = (id,level,locked=false,tile='normal') => ({id,level,locked,tile});
const neutral = {experienceLeveler:0,grandMaster:false,snowFort:false,accountSynergyBoosts:false,milestoneScale:1};
const milestone = (type,value,level,global=false) => ({type,value,level,global});

test('the climb covers every level once and splits on XP milestones, tiers and style unlocks', () => {
  const E=load([{id:'a',milestones:[milestone('Super Exp Amount',20,3000),milestone('Kill Gold',20,3500)]}]);
  const team=[slot('a',32)];
  const ranges=E.experienceRanges(team,neutral);
  assert.deepEqual(Array.from(ranges,r=>r.from),[1,15,50,100,150,250,300,500,1000,1250,1500,2500,3000,4000]);
  for(let i=1;i<ranges.length;i++) assert.equal(ranges[i-1].to+1,ranges[i].from);
  assert.equal(ranges.at(-1).to,4500);
  assert.deepEqual(Array.from(E.experienceRanges(team,{...neutral,maxTier:2}),r=>r.from),[1,15,300,500,1000,1250,2500,3000,4000]);
  assert.throws(()=>E.experienceRanges(team,{}),/Choose a hero/);
});

test('a range recommendation reconsiders style and attacker, retaining locks and support levels', () => {
  const E=load([{id:'target'},{id:'veteran'},{id:'fixed'},{id:'carry',milestones:[milestone('Boss Exp',300,200)]}]);
  const team=[slot('target',50),slot('fixed',350,true),slot('veteran',250),slot('carry',1000)];
  const before=JSON.stringify(team);
  const settings={...neutral,snowFort:true,experienceAttacker:'self',experienceStyle:'none'};
  const result=E.suggestExperienceRange(team,settings,['veteran','carry'],450);
  assert.equal(result.from,300); assert.equal(result.to,499);
  assert.equal(result.experiencePlan.shared,true);
  assert.equal(result.team[result.attackerIndex].id,'carry');
  assert.equal(result.team[result.attackerIndex].tile,'experience');
  assert.equal(result.team[0].id,'target'); assert.equal(result.team[0].level,300);
  assert.equal(result.team[1].id,'fixed'); assert.equal(result.team[1].locked,true);
  assert.deepEqual(Array.from(result.team.slice(1),s=>s.level),[350,250,1000]);
  assert.ok(result.team.some(s=>s.id==='veteran'));
  assert.equal(JSON.stringify(team),before);
  const replay=E.evaluate(result.team,{...settings,experienceStyle:result.style,experienceAttacker:result.attackerIndex});
  assert.equal(replay.metrics.experience,result.score);
  const solo=E.suggestExperienceRange([slot('target',1)],settings,[],4500);
  assert.equal(solo.style,'industrialist'); assert.equal(solo.attackerIndex,0);
});

test('a selected separate attacker stays in its slot and can only share through a legal Veteran', () => {
  const E=load([{id:'target'},{id:'fixed'},{id:'carry'},{id:'veteran'}]);
  const team=[slot('fixed',1000),slot('target',37),slot('carry',5000)];
  const settings={...neutral,experienceLeveler:1,experienceAttacker:2};
  const result=E.optimizeTeam(team,settings,'experience',['veteran']);
  assert.equal(result.team[0].id,'veteran');
  assert.equal(result.team[1].id,'target'); assert.equal(result.team[1].level,37);
  assert.equal(result.team[2].id,'carry'); assert.equal(result.team[2].level,5000);
  assert.equal(result.experiencePlan.shared,true);
  assert.throws(()=>E.optimizeTeam(team,settings,'experience',['fixed']),/needs Veteran/);
  assert.throws(()=>E.optimizeTeam(team.map(s=>({...s,locked:true})),settings,'experience',['veteran']),/need 1 available slots/);
});

test('leveling copies share the protected target level while unlocked copies still follow the roster', () => {
  const E=load([{id:'target'},{id:'veteran'},{id:'other'}]);
  const team=[slot('target',4500),slot('target',1),slot('target',15000,true),slot('other',10000),slot('other',3000)];
  const settings={...neutral,experienceLeveler:1};
  const result=E.suggestExperienceRange(team,settings,['veteran'],500);
  assert.deepEqual(Array.from(result.team,s=>s.id),['veteran','target','target','veteran','veteran']);
  assert.deepEqual(Array.from(result.team,s=>s.level),[15000,500,500,10000,3000]);
  assert.equal(result.experiencePlan.levelerIndex,1);
  const customSupports=E.suggestExperienceRange(team,{...settings,experienceSupportLevel:6000},['veteran'],500);
  assert.deepEqual(Array.from(customSupports.team,s=>s.level),[6000,500,500,10000,3000]);
  assert.throws(()=>E.suggestExperienceRange([...team,slot('other',200)],settings,['veteran'],500),/at most 3 copies/);
  const allLocked=team.map(s=>({...s,locked:true}));
  const fixed=E.suggestExperienceRange(allLocked,settings,[],2500);
  assert.deepEqual(Array.from(fixed.team,s=>s.id),allLocked.map(s=>s.id));
  assert.deepEqual(Array.from(fixed.team.slice(0,3),s=>s.level),[2500,2500,2500]);
  assert.equal(fixed.experiencePlan.shared,false);
});

test('team suggestions cannot borrow high-level milestones from an extra copy of the leveling hero', () => {
  const E=load([{id:'target',milestones:[milestone('Rank Exp',100000,1000,true)]},
    {id:'support',milestones:[milestone('Rank Exp',100,1,true)]}]);
  const team=[slot('target',1),slot('target',15000),slot('support',15000)];
  for(const snowFort of [false,true]) {
    const settings={...neutral,grandMaster:true,snowFort,experienceStyle:'none',experienceAttacker:'self'};
    const result=E.optimizeTeam(team,settings,'experience',['target','support']);
    assert.deepEqual(Array.from(result.team,s=>s.id),['target','support','support']);
    assert.deepEqual(Array.from(result.team,s=>s.level),[1,15000,15000]);
    assert.ok(Math.abs(result.score-(1+2*(1.1**2+(snowFort ? .2 : 0)))*(snowFort ? 1.2 : 1))<1e-10);
    if(snowFort) assert.equal(result.team[0].tile,'experience');
    const replay=E.evaluate(result.team,settings);
    assert.equal(replay.style.count,2);
    assert.equal(result.score,replay.metrics.experience);
  }
});

test('tile suggestions return every locked leveling copy at the current level', () => {
  const E=load([{id:'target',milestones:[milestone('Rank Exp',100,25,true)]},{id:'veteran'}]);
  const team=[slot('target',25,true),slot('target',15000,true),slot('veteran',15000,true)];
  const settings={...neutral,grandMaster:true,snowFort:true,experienceStyle:'none',experienceAttacker:'self'};
  const result=E.optimizePlacements(team,settings,'experience');
  assert.deepEqual(Array.from(result.team,s=>s.level),[25,25,15000]);
  assert.ok(result.team.every(s=>s.locked));
  assert.equal(E.evaluate(result.team,settings).style.count,1);
  assert.equal(result.score,E.evaluate(result.team,settings).metrics.experience);
});

test('XP placement searches the Veteran skill tile together with the leveler and attacker tiles', () => {
  const E=load([
    {id:'target',milestones:[milestone('Rank Exp',30,25,true)]},
    {id:'veteran',milestones:[milestone('Rank Exp',5,25,true)]},
    {id:'carry',milestones:[milestone('Boss Exp',250,100)]}
  ]);
  const team=[slot('target',250,true),slot('veteran',1000,true),slot('carry',1000,true)];
  const settings={...neutral,snowFort:true};
  const result=E.optimizePlacements(team,settings,'experience');
  const tiles=['normal','milestone','synergy','skill','experience'];
  let best=0;
  for(const a of tiles) for(const b of tiles) for(const c of tiles) {
    if([a,b,c].filter(tile=>tile==='experience').length>1) continue;
    const candidate=team.map((s,i)=>({...s,tile:[a,b,c][i]}));
    best=Math.max(best,E.evaluate(candidate,settings).metrics.experience);
  }
  assert.ok(Math.abs(result.score-best)<1e-9);
  assert.equal(result.team[1].tile,'skill');
  assert.equal(result.experiencePlan.attackerIndex,2);
  assert.equal(result.team[2].tile,'experience');
});

function stage(from,to) {
  return {from,to,team:[slot('a',from),slot('veteran',1000,false,'skill'),slot('b',1000),slot('b',1000)],
    style:'none',attackerIndex:1,experiencePlan:{levelerIndex:0},score:from};
}

test('consecutive unlocks share a recommendation while retaining the exact payout and slots at each level', () => {
  const E=load([]), first=stage(1,14), second=stage(15,49), third=stage(50,99);
  // Move Veteran and its attack role together among the unlocked slots.
  [second.team[1],second.team[2]]=[second.team[2],second.team[1]];
  second.attackerIndex=2;
  const stages=[first,second,third], before=JSON.stringify(stages);
  const groups=E.groupExperienceRanges(stages);
  assert.equal(groups.length,1);
  assert.deepEqual([groups[0].from,groups[0].to],[1,99]);
  assert.deepEqual(Array.from(groups[0].changes),[]);
  assert.equal(groups[0].stages.length,3);
  groups[0].stages.forEach((entry,i)=>assert.equal(entry,stages[i]));
  assert.equal(groups[0].stages.find(entry=>entry.from<=20 && entry.to>=20).score,15);
  assert.equal(JSON.stringify(stages),before);
});

test('shared progression on duplicate leveling copies does not split otherwise identical ranges', () => {
  const E=load([]), first=stage(1,14), second=stage(15,49);
  for(const row of [first,second]) {
    row.team[2]={...row.team[2],id:'a',level:row.from};
    row.team[3]={...row.team[3],id:'a',level:row.from,locked:true};
  }
  const groups=E.groupExperienceRanges([first,second]);
  assert.equal(groups.length,1);
  assert.deepEqual([groups[0].from,groups[0].to],[1,49]);
});

test('switching styles, heroes, levels, roles, placements or locked positions starts a new recommendation', () => {
  const E=load([]);
  const changes={
    style:row=>{row.style='commander';},
    leveler:row=>{row.team[0].id='b';},
    attacker:row=>{row.attackerIndex=2;},
    self:row=>{row.attackerIndex=0;},
    support:row=>{row.team[2].id='c';},
    level:row=>{row.team[3].level=1200;},
    tile:row=>{row.team[1].tile='milestone';},
    copies:row=>{row.team.pop();},
    lock:row=>{row.team[1].locked=true;}
  };
  for(const [reason,change] of Object.entries(changes)) {
    const a=stage(1,14), b=stage(15,49);
    change(b);
    const groups=E.groupExperienceRanges([a,b]);
    assert.equal(groups.length,2,reason);
    const expected={style:'style',attacker:'attacker',self:'attacker',tile:'tiles'}[reason] || 'lineup';
    assert.ok(groups[1].changes.includes(expected),reason);
  }
  const a=stage(1,14), b=stage(15,49);
  a.team[2].locked=true;
  b.team[3].locked=true;
  assert.equal(E.groupExperienceRanges([a,b]).length,2,'locks identify a specific duplicate slot');
});

test('only interchangeable duplicate attackers coalesce and disconnected ranges stay separate', () => {
  const E=load([]), a=stage(1,14), b=stage(15,49), c=stage(50,99);
  a.attackerIndex=2;
  b.attackerIndex=3;
  assert.equal(E.groupExperienceRanges([a,b]).length,1,'either identical unlocked copy can attack');
  a.team[2].tile=b.team[2].tile='milestone';
  const differentCopy=E.groupExperienceRanges([a,b]);
  assert.equal(differentCopy.length,2,'the attacking copy has a different tile');
  assert.deepEqual(Array.from(differentCopy[1].changes),['attacker']);
  a.team[2].tile=b.team[2].tile='normal';
  a.team[3].id=b.team[3].id='a';
  a.attackerIndex=0;
  assert.equal(E.groupExperienceRanges([a,b]).length,2,'leveler kills differ from shared kills by another copy of the same hero');
  assert.equal(E.groupExperienceRanges([stage(1,14),c]).length,2,'a gap in searched levels ends a group');
  b.style='commander';
  assert.equal(E.groupExperienceRanges([stage(1,14),b,c]).length,3,'returning to a former setup starts a new group');
  assert.equal(E.groupExperienceRanges([]).length,0);
});
