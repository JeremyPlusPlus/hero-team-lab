'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
function load(heroes) {
  const context = vm.createContext({window: {}});
  if (heroes) context.window.HERO_DATA = {meta: {statAliases: {}}, heroes: heroes.map(h => ({name: h.id, milestones: [], synergies: [], ...h}))};
  else vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(engineSource, context);
  return context.window.HeroEngine;
}
const slot = (id, tile = 'normal', level = 25, locked = false) => ({id, tile, level, locked});
const milestone = (type, value, global = true) => ({type, value, global, level: 25});
const plain = {milestoneScale: 1, synergyScale: 1, grandMaster: false, accountSynergyBoosts: false,
  snowFort: true, mapAttackSpeed: 0, mapMastery: 0, goldHero: 0, goldSkills: true};
const ids = ['attacker', 'rogue', 'hunter', 'sovereign', 'other'];
const E = load(ids.map(id => ({id})));
const members = ids.slice(0, 4).map(id => slot(id));
function near(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual), `${label}: nonfinite ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: expected ${expected}, received ${actual}`);
}
function activeGold({rogue = 1, hunter = 1, sovereign = 1, kill = 1, chance = 0, overflow = 0, rate = 5} = {}) {
  return kill * (1 + 8070 * rogue / 100) * (1 + 28720 * hunter / 100)
    * (1 + 1629 * sovereign / 100) * (1 + (overflow + rate * (chance + 325.8 * sovereign)) / 100);
}
const tests = [];
function test(name, run) { tests.push({name, run}); }

test('three captured active skills multiply Gold once, with Jackpot chance entering shared overflow once', () => {
  const result = E.evaluate(members, plain);
  near(result.metrics.gold, activeGold());
  near(E.makeScorer(plain, 'gold', members)(members), activeGold());
  const settings = {...plain, baseOverflow: 125, overflowRate: 3};
  near(E.evaluate(members, settings).metrics.gold, activeGold({overflow: 125, rate: 3}));
  near(E.makeScorer(settings, 'gold', members)(members), activeGold({overflow: 125, rate: 3}));
  const off = E.evaluate(members, {...plain, goldSkills: false});
  near(off.metrics.gold, 1);
  for (const focus of ['damage', 'experience', 'energy', 'powerMageEnergy']) near(result.metrics[focus], off.metrics[focus], focus);
});

test('skill tiles boost displayed skill bonuses rather than multiplying the final payout by 1.2', () => {
  for (const id of ['rogue', 'hunter', 'sovereign']) {
    const tiled = members.map(s => ({...s, tile: s.id === id ? 'skill' : 'normal'}));
    const expected = activeGold({[id]: 1.2});
    const result = E.evaluate(tiled, plain);
    near(result.metrics.gold, expected, id);
    near(E.makeScorer(plain, 'gold', tiled)(tiled), expected, `${id} compiled`);
    assert.notEqual(result.metrics.gold, activeGold() * 1.2);
  }
  const all = members.map(s => ({...s, tile: s.id === 'attacker' ? 'normal' : 'skill'}));
  near(E.evaluate(all, plain).metrics.gold, activeGold({rogue: 1.2, hunter: 1.2, sovereign: 1.2}));
  near(E.evaluate([slot('attacker', 'skill')], plain).metrics.gold, 1, 'unmodeled hero skill');
});

test('duplicates supply each named skill once using a boosted copy when available', () => {
  const duplicate = [...members, slot('rogue', 'skill'), slot('hunter', 'skill'), slot('sovereign', 'skill')];
  const expected = activeGold({rogue: 1.2, hunter: 1.2, sovereign: 1.2});
  near(E.evaluate(duplicate, plain).metrics.gold, expected);
  near(E.makeScorer(plain, 'gold', duplicate)(duplicate), expected);
  const twoBoostedRogues = [slot('attacker'), slot('rogue', 'skill'), slot('rogue', 'skill')];
  near(E.evaluate(twoBoostedRogues, plain).metrics.gold, 1 + 8070 * 1.2 / 100);
  const reversed = [duplicate[0], ...duplicate.slice(1).reverse()];
  near(E.evaluate(reversed, plain).metrics.gold, expected, 'copy order');
});

test('absent heroes do not grant active skills and disabling the map removes only tile gains', () => {
  for (const id of ['rogue', 'hunter', 'sovereign']) {
    const pair = [slot('attacker'), slot(id, 'skill')];
    const baseline = id === 'rogue' ? 81.7 : id === 'hunter' ? 288.2 : 17.29 * (1 + 325.8 * .05);
    near(E.evaluate(pair, {...plain, snowFort: false}).metrics.gold, baseline, id);
    near(E.makeScorer({...plain, snowFort: false}, 'gold', pair)(pair), baseline, `${id} compiled`);
  }
  near(E.evaluate([slot('attacker')], plain).metrics.gold, 1);
  near(E.evaluate([], plain).metrics.gold, 0);
});

test('captured skill baselines are not scaled again by raw Skill Power, GM, event or skill-strength sources', () => {
  const S = load(ids.map(id => ({id, milestones: [milestone('Skill Power', 5000), milestone('Mastery Power', 5000)]})));
  for (const grandMaster of [false, true]) for (const synergyEvent of [false, true]) {
    const config = {...plain, grandMaster, synergyEvent, milestoneScale: 9};
    const on = S.evaluate(members, config), off = S.evaluate(members, {...config, goldSkills: false});
    near(on.metrics.gold / off.metrics.gold, activeGold());
    near(S.makeScorer(config, 'gold', members)(members), on.metrics.gold);
  }
});

test('Kill Gold placement applies an independent 25.75 factor only to the attacking recipient', () => {
  const placed = members.map((s, i) => ({...s, tile: i === 0 ? 'killGold' : 'normal'}));
  const result = E.evaluate(placed, plain);
  near(result.metrics.gold, activeGold({kill: 25.75}));
  near(result.heroes[1].metrics.gold, activeGold(), 'support does not inherit killer tile');
  const moved = placed.map((s, i) => ({...s, tile: i === 1 ? 'killGold' : 'normal'}));
  near(E.evaluate(moved, plain).metrics.gold, activeGold(), 'non-attacker tile');
  const otherKiller = {...plain, goldHero: 1};
  near(E.evaluate(moved, otherKiller).metrics.gold, activeGold({kill: 25.75}));
  near(E.makeScorer(otherKiller, 'gold', moved)(moved), activeGold({kill: 25.75}));
  near(E.evaluate(placed, {...plain, snowFort: false}).metrics.gold, activeGold());
  near(E.evaluate(placed, {...plain, goldSkills: false}).metrics.gold, 25.75);
  near(E.evaluate(placed, {...plain, goldKillGoldTile: 100}).metrics.gold, activeGold({kill: 2}));
  assert.equal(E.cleanTeam(placed)[0].tile, 'killGold');
  assert.throws(() => E.cleanTeam([slot('attacker', 'killGold'), slot('other', 'killGold')]), /one|1|only/i);
});

test('Gold tile search gives the killer Kill Gold and each support a skill tile when no passive bonuses compete', () => {
  const input = members.map((s, i) => ({...s, tile: i === 0 ? 'milestone' : 'normal', locked: i === 2}));
  const result = E.optimizePlacements(input, plain, 'gold');
  assert.equal(result.team[0].tile, 'killGold');
  for (const id of ['rogue', 'hunter', 'sovereign']) assert.equal(result.team.find(s => s.id === id).tile, 'skill', id);
  near(result.score, activeGold({kill: 25.75, rogue: 1.2, hunter: 1.2, sovereign: 1.2}));
  near(result.score, E.evaluate(result.team, plain).metrics.gold);
  result.team.forEach((s, i) => {
    assert.equal(s.id, input[i].id);
    assert.equal(s.level, input[i].level);
    assert.equal(s.locked, input[i].locked);
  });
});

test('milestone placement can beat a configured Kill Gold tile and is not forcibly replaced', () => {
  const S = load([{id: 'attacker', milestones: [milestone('Kill Gold', 100, false), milestone('Super Gold Amount', 100, false)]}]);
  const config = {...plain, goldKillGoldTile: 10, goldSkills: false};
  const result = S.optimizePlacements([slot('attacker')], config, 'gold');
  assert.equal(result.team[0].tile, 'milestone');
  near(result.score, 2.2 * 2.2);
  assert.ok(result.score > S.evaluate([slot('attacker', 'killGold')], config).metrics.gold);
});

test('attacker tile comparison reports independently scored alternatives without editing the saved lineup', () => {
  const before = JSON.stringify(members);
  const comparison = E.compareGoldAttackerTiles(members, plain);
  assert.equal(comparison.attackerIndex, 0);
  assert.equal(comparison.preferred, 'killGold');
  assert.equal(comparison.milestone.team[0].tile, 'milestone');
  assert.equal(comparison.killGold.team[0].tile, 'killGold');
  near(comparison.milestone.score, E.evaluate(comparison.milestone.team, plain).metrics.gold);
  near(comparison.killGold.score, E.evaluate(comparison.killGold.team, plain).metrics.gold);
  assert.ok(comparison.killGold.score > comparison.milestone.score);
  assert.equal(JSON.stringify(members), before);
  assert.equal(E.compareGoldAttackerTiles(members, {...plain, snowFort: false}), null);
});

test('Gold skill explanation records the boosted owner once and honors editable captured values', () => {
  const input = [...members, slot('rogue', 'skill')];
  const config = {...plain, goldRogueBonus: 100, goldHunterBonus: 200, goldSovereignChance: 10, goldSovereignAmount: 50};
  const result = E.evaluate(input, config);
  assert.equal(result.goldSkills.enabled, true);
  assert.equal(result.goldSkills.skills.length, 3);
  const rogue = result.goldSkills.skills.find(s => s.id === 'rogue');
  assert.equal(rogue.ownerIndex, 4);
  near(rogue.tileBoost, 1.2);
  near(rogue.killGold, 120);
  near(result.goldSkills.killGoldMultiplier, 2.2 * 3);
  near(result.goldSkills.superGoldAmountMultiplier, 1.5);
  near(result.goldSkills.superGoldChance, 10);
  near(result.metrics.gold, 2.2 * 3 * 1.5 * 1.5);
  near(E.makeScorer(config, 'gold', input)(input), result.metrics.gold);
});

test('attacker comparisons respect full tile capacities and account for the displaced support skill', () => {
  const input = [slot('hunter', 'skill'), slot('rogue', 'skill'), slot('sovereign', 'skill'),
    slot('attacker', 'killGold'), slot('attacker', 'milestone'), slot('other', 'milestone'),
    slot('other', 'milestone'), slot('other', 'synergy'), slot('rogue', 'synergy'), slot('sovereign', 'synergy')];
  const before = JSON.stringify(input);
  const comparison = E.compareGoldAttackerTiles(input, plain);
  for (const tile of ['milestone', 'killGold']) {
    const option = comparison[tile];
    assert.equal(option.team[0].tile, tile);
    assert.equal(E.cleanTeam(option.team).length, 10, 'valid capacity after moving occupied tile');
    near(option.score, E.evaluate(option.team, plain).metrics.gold);
    for (let i = 0; i < input.length; i++) assert.equal(option.team[i].id, input[i].id);
  }
  near(comparison.killGold.score, activeGold({kill: 25.75, rogue: 1.2, hunter: 1, sovereign: 1.2}));
  assert.equal(comparison.killGold.swappedIndex, 3);
  assert.equal(JSON.stringify(input), before);
});

test('Gold placement search matches full independent enumeration when skill, synergy, milestone and killer tiles compete', () => {
  const S = load([
    {id: 'attacker', milestones: [milestone('Kill Gold', 300, false)], synergies: [{type: 'Ultra Gold Amount', value: 100, global: false, tier: 1, requires: ['rogue']}]},
    {id: 'rogue', milestones: [milestone('Boss Gold', 500)]},
    {id: 'hunter', milestones: [milestone('Ultra Gold Amount', 500)]},
    {id: 'sovereign', milestones: [milestone('Super Gold Chance', 200)]},
    {id: 'other', milestones: [milestone('Kill Gold', 500)], synergies: [{type: 'Super Gold Amount', value: 1000, global: true, tier: 1, requires: ['rogue']}]}
  ]);
  const input = ids.map(id => slot(id));
  for (const goldHero of [0, 'best']) {
    const config = {...plain, goldHero, goldKillGoldTile: 100};
    const types = ['normal', 'milestone', 'synergy', 'skill', 'killGold'];
    let optimum = 0;
    function enumerate(at, trial, counts) {
      if (at === input.length) { optimum = Math.max(optimum, S.evaluate(trial, config).metrics.gold); return; }
      for (const tile of types) {
        const limit = tile === 'normal' ? 10 : tile === 'killGold' ? 1 : 3;
        if ((counts[tile] || 0) >= limit) continue;
        enumerate(at + 1, [...trial, {...input[at], tile}], {...counts, [tile]: (counts[tile] || 0) + 1});
      }
    }
    enumerate(0, [], {});
    const optimized = S.optimizePlacements(input, config, 'gold');
    near(optimized.score, optimum, `${goldHero} independently enumerated optimum`);
    near(S.makeScorer(config, 'gold', optimized.team)(optimized.team), optimum);
  }
});

test('compiled Gold scores agree with evaluation on real teams, all attacker modes and new tile combinations', () => {
  const R = load();
  const input = ['hunter', 'rogue', 'sovereign', 'crusader', 'paladin', 'scout', 'rogue', 'hunter', 'captain', 'elementalist']
    .map((id, i) => slot(id, ['killGold', 'skill', 'skill', 'milestone', 'milestone', 'synergy', 'normal', 'skill', 'synergy', 'milestone'][i], 5000 + i * 500));
  for (const goldSkills of [true, false]) for (const snowFort of [true, false]) for (const grandMaster of [true, false]) {
    for (const goldHero of [0, 3, 6, 'best', null]) {
      const config = {goldSkills, snowFort, grandMaster, goldHero, synergyEvent: true, baseOverflow: 250};
      const result = R.evaluate(input, config);
      near(R.makeScorer(config, 'gold', input)(input), result.metrics.gold, JSON.stringify(config));
    }
  }
});

test('ascension grades scale the owner’s emitted bonuses and only the killer’s personal Kill Gold', () => {
  const synergy = (type, value, partner) => ({type, value, global:true, tier:1, requires:[partner]});
  const S = load([
    {id:'hunter', milestones:[milestone('Ultra Gold Amount',75), milestone('Super Gold Amount',150,false)],
      synergies:[synergy('Kill Gold',11,'rogue')]},
    {id:'rogue', milestones:[milestone('Kill Gold',100)], synergies:[synergy('Boss Gold',9,'hunter')]}
  ]);
  const team = ['hunter','hunter','rogue'].map(id => slot(id));
  const settings = {...plain, goldSkills:false, accountSynergyBoosts:true, milestoneScale:1, defaultMilestoneLevel:5, heroSynergyDefault:25,
    tier12Scale:1, synergyGlobalBonus1:0, synergyGlobalBonus2:0, synergyGlobalBonus3:0};
  function verify(config, hunterMilestone, hunterSynergy, personal) {
    // Each Hunter emits one global Ultra milestone and one Kill Gold synergy. Rogue's
    // own milestone and active partner synergy retain full strength in every setup.
    const global = (1 + .75*hunterMilestone)**2 * (1 + Math.round(11*hunterSynergy)/100)**2 * 2.5 * 1.11;
    const scores = [global*(1 + 1.5*hunterMilestone)*personal, global*(1 + 1.5*hunterMilestone)*personal, global];
    for (const goldHero of [0,1,2,'best']) {
      const options = {...settings,...config,goldHero};
      const expected = goldHero === 'best' ? Math.max(...scores) : scores[goldHero];
      near(S.evaluate(team,options).metrics.gold, expected, 'detailed payout');
      near(S.makeScorer(options,'gold',team)(team), expected, 'compiled payout');
    }
  }
  verify({}, 1.5, 1.25, 1);
  verify({heroAscensions:{hunter:{killGoldLevel:7}}}, 1.5, 1.25, 78125);
  verify({heroAscensions:{hunter:{milestoneLevel:2,synergyLevel:3,killGoldLevel:1}}}, 1.2, 1.15, 5);
  verify({heroAscensions:{hunter:{milestoneLevel:0,synergyLevel:0,killGoldLevel:0}}}, 1, 1, 1);
});

test('invalid imported grades keep inherited values and valid grades stay within the in-game caps', () => {
  const settings = E.settingsFor({heroAscensions:{
    hunter:{milestoneLevel:'',synergyLevel:12,killGoldLevel:'150'},
    rogue:{milestoneLevel:-1,synergyLevel:true,killGoldLevel:2.5},
    sovereign:{synergyLevel:'garbage'}, unknown:{killGoldLevel:3}
  }});
  assert.deepEqual(JSON.parse(JSON.stringify(settings.heroAscensions)),{
    hunter:{synergyLevel:5,killGoldLevel:99}, rogue:{milestoneLevel:0,killGoldLevel:2}
  });
  const team = [slot('hunter'),slot('rogue')];
  for (const goldHero of [0,1]) {
    const config = {...plain,goldSkills:false,goldHero,heroAscensions:settings.heroAscensions};
    const expected = goldHero === 0 ? 5**99 : 25;
    near(E.evaluate(team,config).metrics.gold,expected);
    near(E.makeScorer(config,'gold',team)(team),expected);
  }
});

test('automatic attacker, roster and tile searches pick the hero earning the personal ascension multiplier', () => {
  const S = load([{id:'hunter'}, {id:'rogue', milestones:[milestone('Kill Gold',100,false)]}, {id:'sovereign'}]);
  const team = [slot('rogue'), slot('hunter'), slot('sovereign')];
  const baseline = {...plain, goldSkills:false, goldHero:'best'};
  const config = {...baseline, heroAscensions:{hunter:{killGoldLevel:2}}};
  assert.equal(S.evaluate(team,baseline).goldIndex, 0);
  assert.equal(S.evaluate(team,config).goldIndex, 1);
  const optimized = S.optimizePlacements(team,config,'gold');
  assert.equal(optimized.team[1].tile,'killGold');
  near(optimized.score, 25*25.75);
  near(S.makeScorer(config,'gold',team)(optimized.team),optimized.score);
  const suggestion = S.optimizeTeam([slot('rogue')],config,'gold',['rogue','hunter']);
  assert.equal(suggestion.team[0].id,'hunter');
  near(suggestion.score,25*25.75);
});

test('Mimic kills roll nested gold tiers and apply each excess chance only to its own amount', () => {
  const S = load([{id:'hunter'}]), team = [slot('hunter')];
  const normal = 10*(1+912/100)*3*(1+340/100)*5;
  const cases = [
    {chance:[50,25], probabilities:[.5,.375,.125], amounts:[1,3,9]},
    {chance:[50,200], probabilities:[.5,0,.5], amounts:[1,3,54]},
    {chance:[150,50], probabilities:[0,.5,.5], amounts:[1,10.5,31.5]},
    {chance:[150,200], probabilities:[0,0,1], amounts:[1,10.5,189]},
    {chance:[0,100], probabilities:[1,0,0], amounts:[1,3,9]}
  ];
  for (const {chance,probabilities,amounts} of cases) {
    const config = {...plain,goldMimicFarming:true,goldSkills:false,goldMimicGoldBonus:340,goldWaveBossGoldBonus:912,
      heroAscensions:{hunter:{killGoldLevel:1}},baseOverflow:300,
      chanceReferences:{gold:{mode:'preTeam',totals:chance,contributions:[0,0],extraOverflow:500}}};
    const result = S.evaluate(team,config), detail = result.heroes[0].goldSkill.mimic;
    const expected = normal*amounts.reduce((sum,amount,i) => sum+probabilities[i]*amount,0);
    for (const [i,tier] of ['normal','super','ultra'].entries()) {
      near(detail[tier+'Probability'],probabilities[i],tier+' probability');
      near(detail[tier+'Payout'],normal*amounts[i],tier+' payout');
    }
    near(detail.expectedGold,expected);
    near(result.metrics.gold,expected);
    near(S.makeScorer(config,'gold',team)(team),expected,'compiled');
    const placed = S.optimizePlacements(team,config,'gold');
    near(placed.score,expected*25.75,'optimized Kill Gold tile');
  }
});

test('Mimic team and tile search choose the reachable gold tiers when an Ultra payout would be larger', () => {
  const S = load([
    {id:'hunter',milestones:[milestone('Ultra Gold Amount',1000,false)]},
    {id:'rogue',milestones:[milestone('Kill Gold',100,false)]}
  ]);
  const team = [slot('hunter'),slot('rogue')];
  const config = {...plain,goldMimicFarming:true,goldSkills:false,goldHero:'best',goldMimicGoldBonus:0,
    chanceReferences:{gold:{mode:'preTeam',totals:[50,0],contributions:[0,0]}}};
  assert.equal(S.evaluate(team,{...config,goldMimicFarming:false}).goldIndex,0);
  assert.equal(S.evaluate(team,config).goldIndex,1);
  const placed = S.optimizePlacements(team,config,'gold');
  assert.equal(placed.team[1].tile,'killGold');
  near(placed.score, 30*2*25.75*(.5+.5*3));
  const suggestion = S.optimizeTeam([slot('hunter')],config,'gold',['hunter','rogue']);
  assert.equal(suggestion.team[0].id,'rogue');
  near(suggestion.score,placed.score);
});

test('Golden Arrows pays separately on the target Mimic before boss and gold tier multipliers', () => {
  const S = load([{id:'hunter'},{id:'crusader'}]), team = [slot('hunter'),slot('crusader')];
  const config = {...plain,goldMimicFarming:true,goldMimicGoldBonus:0,goldWaveBossGoldBonus:0,
    goldHero:1,goldCrusaderBonus:200,goldCrusaderAttacks:2,goldCrusaderMastery:100,goldHunterBonus:100,
    heroAscensions:{crusader:{killGoldLevel:1}},chanceReferences:{gold:{mode:'preTeam',totals:[50,50],contributions:[0,0]}}};
  const skill = S.evaluate(team,config).heroes[1].goldSkill;
  const expectedKill = 5*2*10*3*(.5+.25*3+.25*9);
  const expectedAttacks = 5*2*.5*(1+2);
  near(skill.mimic.expectedGold,expectedKill);
  near(skill.attackGold,expectedAttacks);
  near(S.makeScorer(config,'gold',team)(team),expectedKill+expectedAttacks);
  near(skill.totalScore,expectedKill+expectedAttacks);
});

let failures = 0;
for (const {name, run} of tests) {
  try { run(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} Gold placement tests passed.\n`);
if (failures) process.exitCode = 1;
