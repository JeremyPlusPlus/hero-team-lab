'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load(heroes) {
  const context = vm.createContext({window: {}});
  if (heroes) context.window.HERO_DATA = {meta: {statAliases: {}}, heroes: heroes.map(h => ({name: h.id, milestones: [], synergies: [], ...h}))};
  else vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine.js'), 'utf8'), context);
  return context.window.HeroEngine;
}
const slot = (id, tile = 'normal', level = 25, locked = false) => ({id, tile, level, locked});
const milestone = (type, value, global = true) => ({type, value, global, level: 25});
const plain = {milestoneScale: 1, synergyScale: 1, grandMaster: false, accountSynergyBoosts: false,
  snowFort: true, mapAttackSpeed: 0, mapMastery: 0, damageHero: 0, goldSkills: false, damageSkills: true, damageSupportSkills: false};
const ids = ['praetorian', 'deadeye', 'dicemaster', 'warden', 'warlord', 'other'];
const E = load(ids.map(id => ({id})));
const tests = [];
function test(name, run) { tests.push({name, run}); }
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
const factor = value => 1 + value / 100;
function expected(id, boost = 1, distance = 10.7, rate = 5, baseOverflow = 0) {
  const overflow = chance => 1 + (baseOverflow + rate * chance) / 100;
  if (id === 'praetorian') return factor(7180 * boost) * factor(6179 * boost) * overflow((1436 + 124) * boost);
  if (id === 'deadeye') {
    const power = Math.round(1604 * boost);
    return factor(150 + 15 * power) * factor(75 + 10 * power) * factor(2060 * boost) * overflow(3 + 0.3 * power);
  }
  if (id === 'warlord') {
    const power=Math.round(456*boost);
    return factor(100+10*power)*factor(50+5*power)*Math.max(1,(10+power)/100)*factor(3097*boost)*overflow(155*boost);
  }
  if (id === 'warden') return factor(8070 * boost) * factor(16140 * boost) * factor(180249 * distance / 10.7 * boost) * overflow(0);
  if (id === 'dicemaster') {
    const probability = Math.min(1, .412 * boost);
    const mean = [[5, 2867], [3, 1436], [1, 718]].reduce((sum, [min, max]) => sum + (probability * max + (1 - probability) * (min + max) / 2) * boost, 0);
    return overflow(mean);
  }
  return overflow(0);
}

test('five captured active and mastery profiles independently reproduce their single-target damage factors', () => {
  for (const id of ids.slice(0, 5)) {
    const members = [slot(id)];
    const result = E.evaluate(members, plain);
    near(result.metrics.damage, expected(id), id);
    near(E.makeScorer(plain, 'damage', members)(members), expected(id), `${id} compiled`);
    assert.ok(result.heroes[0].damageSkill, `${id} explanation`);
    near(E.evaluate(members, {...plain, damageSkills: false}).metrics.damage, 1, `${id} disabled`);
  }
});

test('skill tiles boost captured active and mastery effects once, with Warlord’s fixed bases preserved', () => {
  for (const id of ids.slice(0, 5)) {
    const members = [slot(id, 'skill')];
    const config = {...plain, damageWardenDistance: 3};
    const result = E.evaluate(members, config);
    near(result.metrics.damage, expected(id, 1.2, 3), id);
    near(E.makeScorer(config, 'damage', members)(members), result.metrics.damage);
    assert.notEqual(result.metrics.damage, expected(id, 1, 3) * 1.2);
    near(E.evaluate(members, {...config, snowFort: false}).metrics.damage, expected(id, 1, 3), `${id} map off`);
  }
});

test('personal attacker skills never leak to teammates, including duplicate support copies', () => {
  const members = [slot('other'), slot('deadeye', 'skill'), slot('deadeye', 'skill'), slot('praetorian', 'skill')];
  const result = E.evaluate(members, plain);
  near(result.metrics.damage, 1, 'unmodeled selected attacker');
  near(result.heroes[1].metrics.damage, expected('deadeye', 1.2));
  near(result.heroes[2].metrics.damage, expected('deadeye', 1.2));
  assert.equal(result.global.skill.Damage, undefined);
  near(E.evaluate(members, {...plain, damageHero: 1}).metrics.damage, expected('deadeye', 1.2));
  near(E.makeScorer({...plain, damageHero: 1}, 'damage', members)(members), expected('deadeye', 1.2));
  for (const focus of ['gold', 'experience', 'energy', 'powerMageEnergy']) {
    near(result.metrics[focus], E.evaluate(members, {...plain, damageSkills: false}).metrics[focus], focus);
  }
});

test('Damage placement adds its own 25.75 personal factor and has a separate one-tile capacity', () => {
  const members = [slot('deadeye', 'damage'), slot('other', 'killGold')];
  const result = E.evaluate(members, plain);
  near(result.metrics.damage, expected('deadeye') * 25.75);
  near(result.heroes[1].metrics.damage, 1, 'support does not inherit Damage tile');
  near(result.heroes[0].metrics.gold, 1, 'Damage tile does not grant gold');
  near(E.makeScorer(plain, 'damage', members)(members), result.metrics.damage);
  near(E.evaluate(members, {...plain, damageSkills: false}).metrics.damage, 25.75);
  near(E.evaluate(members, {...plain, snowFort: false}).metrics.damage, expected('deadeye'));
  near(E.evaluate(members, {...plain, damageTile: 100}).metrics.damage, expected('deadeye') * 2);
  const moved = [slot('deadeye'), slot('other', 'damage')];
  near(E.evaluate(moved, plain).metrics.damage, expected('deadeye'));
  assert.equal(E.cleanTeam(members)[0].tile, 'damage');
  assert.throws(() => E.cleanTeam([slot('other', 'damage'), slot('deadeye', 'damage')]), /one|1|only/i);
});

test('Warden mastery uses the observed 180249 percent at 10.7m with proportional distance and no range damage factor', () => {
  for (const distance of [0, 5.35, 10.7, 21.4]) for (const tile of ['normal', 'skill']) {
    const config = {...plain, damageWardenDistance: distance};
    const members = [slot('warden', tile)];
    near(E.evaluate(members, config).metrics.damage, expected('warden', tile === 'skill' ? 1.2 : 1, distance));
    near(E.makeScorer(config, 'damage', members)(members), expected('warden', tile === 'skill' ? 1.2 : 1, distance));
  }
  near(E.evaluate([slot('warden')], {...plain, damageWardenDistance: -2}).metrics.damage, expected('warden', 1, 0));
  const calibrated = {...plain, damageWardenDistance: 5, damageWardenReferenceDistance: 10, damageWardenReferenceBonus: 1000};
  near(E.evaluate([slot('warden')], calibrated).metrics.damage, factor(8070) * factor(16140) * factor(500));
  near(E.evaluate([slot('warden', 'skill')], calibrated).metrics.damage, factor(8070 * 1.2) * factor(16140 * 1.2) * factor(600));
});

test('nine-GM off-event and off-map tooltips reproduce the observed attacker bonuses', () => {
  const nineGm = Object.fromEntries(E.damageSkillDefinitions.flatMap(d => d.fields.map(f => [f.key,f.nineGmValue])));
  const config = {...plain,...nineGm,grandMaster:true,synergyEvent:false,snowFort:false,damageWardenDistance:.5};
  const profile = id => E.evaluate([slot(id,'skill')],config).heroes[0].damageSkill;
  const bonuses = skill => [...skill.activeEffects,...skill.masteryEffects].map(e=>e.value).join(',');
  const deadeye = profile('deadeye');
  assert.equal(bonuses(deadeye), '6990,4635,139.8,1549');
  assert.equal(deadeye.duration, 20);
  assert.match(deadeye.notes.join(' '), /31 additional targets/);
  assert.equal(bonuses(profile('praetorian')), '466,2330,93,4646');
  const dice = profile('dicemaster');
  assert.equal(dice.maxRollChance, 31);
  for (const [tier,min,max] of [['Crit Chance',5,927],['Super Crit Chance',3,466],['Ultra Crit Chance',1,233]]) {
    assert.equal(dice.chanceRolls[tier].min, min);
    assert.equal(dice.chanceRolls[tier].max, max);
    near(dice.chanceByType[tier], .31*max + .69*(min+max)/2);
  }
  const warden = profile('warden');
  assert.equal(warden.duration, 20);
  assert.equal(warden.activeEffects.map(e=>e.value).join(','), '4660,2330');
  near(warden.masteryEffects[0].value, .5*(300*3.097)/(1-.225*3.097), 'continuous distance');
  assert.match(warden.notes.join(' '), /937% range/);
});

test('Dicemaster averages the non-max rolls and mastery max-roll branch before linear chance spillover', () => {
  for (const tile of ['normal', 'skill']) for (const rate of [0, 3, 5]) {
    const boost = tile === 'skill' ? 1.2 : 1;
    const config = {...plain, overflowRate: rate, baseOverflow: 125};
    const members = [slot('dicemaster', tile)];
    near(E.evaluate(members, config).metrics.damage, expected('dicemaster', boost, 0, rate, 125));
    near(E.makeScorer(config, 'damage', members)(members), expected('dicemaster', boost, 0, rate, 125));
  }
});

test('editable profiles update skill and mastery factors, with Dicemaster max-roll probability capped at 100 percent', () => {
  const praetorian = {...plain, damagePraetorianSuperCritChance: 10, damagePraetorianSuperCritDamage: 50,
    damagePraetorianUltraCritChance: 20, damagePraetorianUltraCritDamage: 100};
  near(E.evaluate([slot('praetorian')], praetorian).metrics.damage, 1.5 * 2 * 2.5);
  near(E.evaluate([slot('praetorian', 'skill')], praetorian).metrics.damage, 1.6 * 2.2 * 2.8);
  const dice = {...plain, damageDicemasterCritMin: 10, damageDicemasterCritMax: 100,
    damageDicemasterSuperCritMin: 20, damageDicemasterSuperCritMax: 200,
    damageDicemasterUltraCritMin: 30, damageDicemasterUltraCritMax: 300, damageDicemasterMaxRollChance: 0};
  near(E.evaluate([slot('dicemaster')], dice).metrics.damage, 1 + (55 + 110 + 165) * .05);
  const guaranteed = {...dice, damageDicemasterMaxRollChance: 90};
  const result = E.evaluate([slot('dicemaster', 'skill')], guaranteed);
  near(result.metrics.damage, 1 + (100 + 200 + 300) * 1.2 * .05);
  near(E.makeScorer(guaranteed, 'damage', [slot('dicemaster', 'skill')])([slot('dicemaster', 'skill')]), result.metrics.damage);
});

test('historical profiles keep their captured strength under GM, the event and Snow Fort', () => {
  const S = load(ids.map(id => ({id, milestones: [milestone('Skill Power', 9000), milestone('Mastery Power', 9000)]})));
  const members = ['praetorian', 'deadeye', 'dicemaster', 'warden'].map(id => slot(id));
  for (const grandMaster of [false, true]) for (const synergyEvent of [false, true]) {
    const config = {...plain, grandMaster, synergyEvent, milestoneScale: 9, mapMastery: 9999};
    const on = S.evaluate(members, config), off = S.evaluate(members, {...config, damageSkills: false});
    for (let i = 0; i < members.length; i++) near(on.heroes[i].metrics.damage / off.heroes[i].metrics.damage, expected(members[i].id));
  }
});

test('Damage tile search uses the stronger personal tile while preserving hero identity, level and locks', () => {
  const members = [slot('deadeye', 'milestone', 10000, true), slot('other', 'synergy', 250)];
  const before = JSON.stringify(members);
  const result = E.optimizePlacements(members, plain, 'damage');
  assert.equal(result.team[0].tile, 'damage');
  near(result.score, expected('deadeye') * 25.75);
  result.team.forEach((s, i) => { assert.equal(s.id, members[i].id); assert.equal(s.level, members[i].level); assert.equal(s.locked, members[i].locked); });
  assert.equal(JSON.stringify(members), before);
  const skill = E.optimizePlacements([slot('deadeye')], {...plain, damageTile: 0}, 'damage');
  assert.equal(skill.team[0].tile, 'skill');
  near(skill.score, expected('deadeye', 1.2));
});

test('strong passive milestones can beat a Damage tile, including the attacker own milestone bonus', () => {
  const S = load([{id: 'other', milestones: [milestone('Damage', 100, false), milestone('Attack Speed', 100, false)]}]);
  const result = S.optimizePlacements([slot('other')], {...plain, damageTile: 10}, 'damage');
  assert.equal(result.team[0].tile, 'milestone');
  near(result.score, 2.2 * 2.2);
});

test('Damage placement recommendations score every legal alternative without modifying the current team', () => {
  const members = [slot('praetorian', 'skill'), slot('other', 'damage'), slot('other', 'milestone'), slot('other', 'milestone'),
    slot('deadeye', 'milestone'), slot('warden', 'synergy'), slot('warden', 'synergy'), slot('warden', 'synergy'), slot('warlord', 'skill'), slot('dicemaster', 'skill')];
  const before = JSON.stringify(members), report = E.compareDamageAttackerTiles(members, plain);
  assert.equal(report.attackerIndex, 0);
  for (const tile of ['normal', 'milestone', 'synergy', 'skill', 'damage']) {
    const option = report.options[tile];
    assert.equal(option.team[0].tile, tile);
    assert.equal(E.cleanTeam(option.team).length, 10);
    near(option.score, E.evaluate(option.team, plain).metrics.damage, tile);
  }
  near(report.options[report.preferred].score, Math.max(...Object.values(report.options).map(o => o.score)));
  assert.equal(JSON.stringify(members), before);
  assert.equal(E.compareDamageAttackerTiles(members, {...plain, snowFort: false}), null);
});

test('fixed and automatic Damage placement search match an exhaustive independent small-roster oracle', () => {
  const S = load([
    {id: 'praetorian', milestones: [milestone('Damage', 150, false)], synergies: [{type: 'Ultra Crit Damage', value: 100, global: false, tier: 1, requires: ['buffer']}]},
    {id: 'deadeye', milestones: [milestone('Attack Speed', 100, false)]},
    {id: 'buffer', milestones: [milestone('Damage', 500)], synergies: [{type: 'Crit Damage', value: 500, global: true, tier: 1, requires: ['other']}]},
    {id: 'other', milestones: [milestone('Super Crit Chance', 200)]}
  ]);
  const members = ['praetorian', 'deadeye', 'buffer', 'other'].map(id => slot(id));
  for (const damageHero of [0, 'best']) for (const damageTile of [0, 2475]) {
    const config = {...plain, damageHero, damageTile};
    const types = ['normal', 'milestone', 'synergy', 'skill', 'damage'];
    let optimum = 0;
    function enumerate(at, trial, counts) {
      if (at === members.length) { optimum = Math.max(optimum, S.evaluate(trial, config).metrics.damage); return; }
      for (const tile of types) {
        const limit = tile === 'normal' ? 10 : tile === 'damage' ? 1 : 3;
        if ((counts[tile] || 0) >= limit) continue;
        enumerate(at + 1, [...trial, {...members[at], tile}], {...counts, [tile]: (counts[tile] || 0) + 1});
      }
    }
    enumerate(0, [], {});
    const result = S.optimizePlacements(members, config, 'damage');
    near(result.score, optimum, `${damageHero}, tile ${damageTile}`);
    near(S.makeScorer(config, 'damage', result.team)(result.team), optimum);
  }
});

test('real-roster compiled scores match detailed results across all targets and modeled skill/tile contexts', () => {
  const R = load();
  const members = ['praetorian', 'deadeye', 'dicemaster', 'warden', 'warlord', 'rogue', 'hunter', 'sovereign', 'captain', 'militia']
    .map((id, i) => slot(id, ['damage', 'skill', 'skill', 'skill', 'milestone', 'milestone', 'milestone', 'synergy', 'synergy', 'synergy'][i], 5000 + i * 500));
  for (const damageSkills of [true, false]) for (const snowFort of [true, false]) for (const grandMaster of [true, false]) {
    for (const damageHero of [0, 1, 2, 3, 4, 'best', null]) {
      const config = {damageSkills, snowFort, grandMaster, damageHero, synergyEvent: true, baseOverflow: 250, damageWardenDistance: 9};
      const result = R.evaluate(members, config);
      near(R.makeScorer(config, 'damage', members)(members), result.metrics.damage, JSON.stringify(config));
    }
  }
});

test('automatic attacker selection and team suggestion use captured skills instead of only passive bonuses', () => {
  const members = [slot('praetorian'), slot('other')];
  const config = {...plain, damageHero: 'best', snowFort: false};
  const result = E.optimizeTeam(members, config, 'damage', ['deadeye', 'praetorian', 'other']);
  assert.equal(result.team[result.attackerIndex].id, 'deadeye');
  near(result.score, expected('deadeye'));
  const fixed = E.optimizeTeam(members, {...config, damageHero: 0}, 'damage', ['deadeye', 'other']);
  assert.equal(fixed.team[0].id, 'praetorian');
  near(fixed.score, expected('praetorian'));
});

test('placement suggestions preserve or improve an already configured Damage lineup', () => {
  const R = load();
  const members = ['deadeye', 'praetorian', 'warlord', 'warden', 'dicemaster', 'captain', 'rogue', 'hunter', 'sovereign', 'militia']
    .map((id, i) => slot(id, ['skill', 'damage', 'skill', 'skill', 'milestone', 'milestone', 'milestone', 'synergy', 'synergy', 'synergy'][i], 10000));
  for (const damageHero of [0, 'best']) {
    const config = {...plain, grandMaster: true, damageHero, damageWardenDistance: 10, synergyEvent: true};
    const before = R.evaluate(members, config).metrics.damage;
    const result = R.optimizePlacements(members, config, 'damage');
    assert.ok(result.score >= before * (1 - 1e-10));
    near(result.score, R.evaluate(result.team, config).metrics.damage);
  }
});

test('Killjoy uses personal kills and Execute uses independent successful executions with a fixed boss HP threshold',()=>{
  const R=load([{id:'gladiator'},{id:'assassin'}]);
  const team=[slot('gladiator'),slot('assassin')];
  const baseline=R.evaluate(team,plain);
  near(baseline.heroes[0].metrics.damage,factor(20*1864)*factor(20*1084));
  near(baseline.heroes[1].metrics.damage,1);
  for(const mode of ['all','debuffs']) for(const tile of ['normal','skill']) {
    const members=team.map(member=>({...member,tile}));
    const settings={...plain,damageSupportMode:mode,damageAttackerKills:3.8,damageAssassinExecutions:2.9,
      damageSupportStacks:99,damageSkillTileBoost:20,damageMasteryTileBoost:10};
    const result=R.evaluate(members,settings),boost=tile==='skill'?1.1:1;
    const gl=result.heroes[0],as=result.heroes[1];
    near(gl.metrics.damage,factor(3*(tile==='skill'?2228:1864))*factor(3*1084*boost));
    near(as.metrics.damage,factor(2*1549*boost)*factor(2*50));
    near(as.damageSkill.executeThreshold,70);
    near(as.damageSkill.bossExecuteThreshold,35);
    for(const i of [0,1]) near(R.makeScorer({...settings,damageHero:i},'damage',members)(members),result.heroes[i].metrics.damage);
  }
  const none=R.evaluate(team,{...plain,damageAttackerKills:0,damageAssassinExecutions:0});
  near(none.heroes[0].metrics.damage,1);
  near(none.heroes[1].metrics.damage,1);
});

test('Champion and Militia replace normal volleys at their cast cadence and count only their own same-target packets',()=>{
  const ids=['champion','militia','wizard','warlock','templar'];
  const R=load(ids.map(id=>({id,observedBaseStats:{attackSpeed:4,damage:10}})));
  const basic=[slot('champion'),slot('militia')];
  const championPacket=(strikes,damage,repeat)=>Array.from({length:strikes},(_,i)=>damage/100*(1+Math.min(i,100)*repeat/100)).reduce((a,b)=>a+b);
  for(const tile of ['normal','skill']) {
    const members=basic.map(s=>({...s,tile})),boost=tile==='skill'?1.2:1;
    const result=R.evaluate(members,plain);
    const c=result.heroes[0].damageSkill,m=result.heroes[1].damageSkill;
    const packet=championPacket(tile==='skill'?282:236,tile==='skill'?5570:4660,774*boost);
    near(c.castFactor,packet);
    near(c.activeScore,(95+packet)/96);
    near(m.woundTicks,3);
    const spin=tile==='skill'?167.1:139.8;
    near(m.castFactor,spin);
    near(m.activeScore,(95+spin*(1+3*61.94*boost))/96);
    for(const i of [0,1]) {
      near(R.makeScorer({...plain,damageHero:i},'damage',members)(members),result.heroes[i].metrics.damage);
      near(R.evaluate(members,{...plain,damageHero:i,damageSkills:false}).metrics.damage,1);
    }
  }
  const buffed=[...basic,slot('wizard'),slot('warlock'),slot('templar')];
  const settings={...plain,damageSupportSkills:true,damageSupportWizardAttackSpeed:200,damageSupportWizardTripleShotChance:100,
    damageSupportTemplarSplashDamage:150,damageSupportTemplarSplashDamagePerSecond:2.5};
  const result=R.evaluate(buffed,settings);
  for(const i of [0,1]) {
    const hero=result.heroes[i],skill=hero.damageSkill;
    near(skill.attacksPerSecond,10,'physical action cap');
    near(skill.castInterval,1,'deployed Warlock');
    const packet=skill.castFactor*(i?1+61.94:1);
    near(skill.activeScore,3*(9*6+packet)/10,'normal volleys retain triple shot and splash; casts replace both');
    near(R.makeScorer({...settings,damageHero:i},'damage',buffed)(buffed),hero.metrics.damage);
    const placement=R.optimizePlacements(buffed,{...settings,damageHero:i},'damage');
    near(R.evaluate(placement.team,{...settings,damageHero:i}).metrics.damage,placement.score);
    const swapped=R.evaluate(buffed,{...settings,damageSupportMode:'debuffs'}).heroes[i].damageSkill;
    near(swapped.attacksPerSecond,4);
    near(swapped.castInterval,24);
    if(i) {near(skill.woundTicks,1);near(swapped.woundTicks,3);}
  }
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} Damage skill tests passed.\n`);
if (failures) process.exitCode = 1;
