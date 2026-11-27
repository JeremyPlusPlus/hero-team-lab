'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname,'..');

function load(data) {
  const window = {}, context = vm.createContext({window});
  const script = file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  if (data) window.HERO_DATA={meta:{statAliases:{}},heroes:data.map(hero=>({
    name:hero.id,milestones:[],synergies:[],observedBaseStats:{damage:100,attackSpeed:1},...hero
  }))};
  else script('data.js');
  for (const file of ['engine.js','immortal-data.js','immortal.js']) script(file);
  return window.HeroEngine.immortal;
}
const neutral={maxTier:9,snowFort:false,grandMaster:false,milestoneScale:1,synergyScale:1,accountSynergyBoosts:false,
  overflowRate:0,damageSkills:false,damageSupportSkills:false};
const noCrit={baseCritChance:0,baseSuperChance:0,baseUltraChance:0};
const slot=(id,level=1,tile='normal')=>({id,level,tile});
const bonus=(type,value,global=false)=>({type,value,global,level:1});
function near(actual,expected,label) {
  assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),label+': '+actual+' vs '+expected);
}

test('Immortal applies the tooltip logarithm to each hit and awards only its highest event crit tier',()=>{
  const I=load([]);
  for (const [hit,expected] of [[1000,3],[1e7,7],[1e9,9],[1e15,15],[1e40,40],[1e150,150]])
    near(I.bossHit(hit),expected,'tooltip real damage');
  near(I.bossHit(8.25e60,'ultra'),Math.log10(8.25e60)*1.5,'ultra example');
  near(I.bossHit(1.55e9,'normal'),Math.log10(1.55e9)*1.1,'normal example');
  near(I.bossHit(1e40,'super'),50,'super example');
  assert.equal(I.bossHit(0),0);
});

test('Champion starts from the off-team capture, rounds strike count, and adds each strike with capped mastery',()=>{
  const I=load([{id:'champion'},{id:'wizard',milestones:[bonus('Skill Power',345,true)]}]);
  const team=[slot('champion')],cfg={...noCrit,mode:'skill',buffTeam:'warlock'};
  const bare=I.evaluate(team,neutral,cfg);
  assert.equal(bare.attackDps,0);
  assert.equal(bare.heroes[0].skillHits,89);
  assert.equal(bare.heroes[0].skillPercent,1710);
  assert.equal(bare.heroes[0].skillCooldown,1);
  const upgraded=I.evaluate([...team,slot('wizard')],neutral,cfg);
  assert.equal(upgraded.heroes[0].skillHits,261);
  assert.equal(upgraded.heroes[0].skillPercent,5160);
  const tiled=[slot('champion',1,'skill'),slot('wizard')];
  const withTile=I.evaluate(tiled,{...neutral,snowFort:true},cfg);
  assert.equal(withTile.heroes[0].skillHits,312);
  near(withTile.heroes[0].skillPercent,6170,'skill tile rounds 506 power to 607 before adding 100%');
  const captured={...cfg,championMasteryPercent:813};
  const allies=[slot('champion'),slot('champion'),slot('wizard')];
  let expected=0;
  const fort={...neutral,snowFort:true};
  for(let hit=0;hit<261;hit++) {
    const raw=100*51.6*(1+8.13*Math.min(100,hit));
    expected+=0.97*Math.log10(Math.round(raw))+0.03*Math.log10(Math.round(raw*2))*1.1;
  }
  const both=I.evaluate(allies,fort,captured);
  near(both.score,2*expected,'two independent casts per second');
  near(both.heroes[0].damagePerCast,expected,'capped subsequent-strike bonus before log');
  near(I.makeScorer(fort,captured,allies)(allies),both.score,'search and detailed casts');
  near(I.evaluate(allies,fort,{...captured,championCooldown:24}).score,both.score/24,'listed vs effective cooldown');
});

test('off-type heroes buff the attacking class; attack frequency multiplies after the per-hit logarithm',()=>{
  const I=load([{id:'titan'},{id:'veteran',milestones:[bonus('Damage',900,true),bonus('Attack Speed',100,true)]}]);
  const cfg={...noCrit,mode:'melee'},team=[slot('titan'),slot('veteran')];
  const result=I.evaluate(team,neutral,cfg);
  assert.equal(result.heroes[1].score,0);
  assert.equal(result.heroes[0].hitRate,2);
  const perHit=0.95*Math.log10(1000)+0.05*Math.log10(2000)*1.1;
  near(result.attackDps,perHit*2,'melee damage with ranged support');
  for (const mode of ['mage','skill']) assert.equal(I.evaluate(team,neutral,{...cfg,mode}).score,0);
  near(I.makeScorer(neutral,cfg,team)(team),result.score,'search');
  near(I.evaluate(team,neutral,{...cfg,baseDamageExponent:500}).score,(perHit+500*(.95+.05*1.1))*2,'account damage over 1e308');
});

test('fresh Immortals provide no Killjoy or Execute stacks from the ordinary farming profile',()=>{
  const I=load([{id:'gladiator'},{id:'assassin'}]),team=[slot('gladiator'),slot('assassin')];
  const s={...neutral,damageSkills:true};
  const farming={...s,damageAttackerKills:20,damageAssassinExecutions:20,damageSupportStacks:50};
  for(const mode of ['melee','skill']) {
    const c={...noCrit,mode,buffTeam:'warlock'};
    const base=I.evaluate(team,{...s,damageAttackerKills:0,damageAssassinExecutions:0},c);
    const boss=I.evaluate(team,farming,c);
    near(boss.score,base.score,'no kills during either fresh-boss window');
    near(I.makeScorer(farming,c).details(team).score,base.score,'search uses the same skill counters');
    if(mode==='melee') {
      for(const hero of boss.heroes) {
        assert.equal(hero.aps,1);
        assert.equal(hero.rawHitLog,2);
        assert.ok(hero.attackDps>0);
      }
    } else assert.equal(boss.totalHitRate,0);
  }
});

test('nine-GM Champion and Militia cast tooltips use the same 456 effective Skill Power once',()=>{
  const ids=['champion','militia','archer','wizard','rogue','veteran','scout','templar','skymage'];
  const I=load(ids.map(id=>({id}))),team=ids.map(id=>slot(id));
  // Both skills imply a combined pre-GM power of 294 in this capture.
  // The individual account and lineup contributions were not recorded.
  // The event's pre-team mastery input is expressed on its historical +33% Snow Fort reference.
  const championMasteryPercent=250*3.097*1.33/1.05**9;
  const c={...noCrit,mode:'skill',buffTeam:'warlock',otherBasePower:294,championStrikes:8+294/2,championDamagePercent:100+294*10,championMasteryPercent};
  const s={...neutral,grandMaster:true,synergyEvent:false,snowFort:false,damageSkills:true};
  const report=I.evaluate(team,s,c),[champion,militia]=report.heroes;
  assert.equal(champion.effectiveSkillPower,456);
  assert.equal(militia.effectiveSkillPower,456);
  assert.equal(champion.skillHits,236);
  assert.equal(champion.skillPercent,4660);
  assert.equal(Math.round(champion.masteryPercent),774);
  near(militia.skillPercent,13980,'Spin Attack applies its multiplier to one cast packet');
  assert.ok(militia.tickRate>0);
  assert.ok(Math.abs(8*champion.masteryPercent-6194)<1.5,'reported integer mastery effects use rounded capture values');
  near(I.makeScorer(s,c).details(team).score,report.score,'Immortal per-hit and cast probabilities replay');
});

test('Skill Immortal uses the selected Deadeye and Warden profile durations',()=>{
  const I=load([{id:'deadeye'},{id:'warden'}]);
  const cfg={...noCrit,mode:'skill',buffTeam:'deploy',fightSeconds:30};
  for (const [id,key] of [['deadeye','damageDeadeyeDuration'],['warden','damageWardenDuration']]) {
    const team=[slot(id)];
    const measured={...neutral,[key]:20};
    near(I.evaluate(team,neutral,cfg).heroes[0].totalHitRate,25/30,'historical duration');
    near(I.evaluate(team,measured,cfg).heroes[0].totalHitRate,20/30,'measured duration');
    near(I.makeScorer(measured,cfg)(team),I.evaluate(team,measured,cfg).score,'search parity');
  }
});

test('Warlord uses the 74-second Avatar window and its captured buffs once',()=>{
  const I=load([{id:'warlord',observedBaseStats:{damage:100,attackSpeed:.2}}]),team=[slot('warlord')];
  const c={...noCrit,mode:'skill',buffTeam:'deploy',fightSeconds:60};
  const s={...neutral,damageSkills:true};
  const active=I.evaluate(team,s,c).heroes[0];
  near(active.aps,.2*(1+2330/100),'attack speed in Avatar');
  near(active.rawHitLog,Math.log10(100*(1+4660/100)),'raw hit before splash');
  near(active.totalHitRate,active.aps,'Avatar covers the full 60-second fight');
  const long=I.evaluate(team,s,{...c,fightSeconds:98}).heroes[0];
  near(long.totalHitRate,active.aps*74/98,'only hits in Avatar are eligible on Skill without a cooldown buff');
  const off=I.evaluate(team,neutral,c).heroes[0];
  near(off.rawHitLog,2,'disabling captured personal buffs removes Avatar damage');
  near(off.aps,.2,'disabling captured personal buffs removes Avatar speed');
});

test('compiled Immortal score matches detailed team bonuses across levels, modes and changing placements',()=>{
  const I=load(),team=['champion','wizard','ranger','champion','templar','druid','warlord','witch','titan','deadeye']
    .map((id,i)=>slot(id,15000,i===0?'skill':i===4?'synergy':i===5?'milestone':'normal'));
  for(const mode of ['skill','mage','melee','ranged']) {
    const cfg={mode,baseDamageExponent:150,baseCritChance:60,baseSuperChance:35,baseUltraChance:5};
    const scorer=I.makeScorer({},cfg,team);
    for(let n=0;n<4;n++) {
      const variant=team.map((member,i)=>({...member,level:i===3?n*1000:member.level}));
      if(n===1) [variant[0].tile,variant[5].tile]=[variant[5].tile,variant[0].tile];
      if(n===2) variant[2].id='battlemage';
      if(n===3) variant[8].id='necromancer';
      const report=I.evaluate(variant,{},cfg);
      near(scorer(variant),report.score,'DPS parity '+mode+' '+n);
      near(scorer.details(variant).attacksPerSecond,report.attacksPerSecond,'attack rate parity '+mode+' '+n);
      near(scorer.details(variant).totalHitRate,report.totalHitRate,'hit rate parity '+mode+' '+n);
      near(scorer.details(variant).ultraHitsPerSecond,report.heroes.reduce((sum,h)=>sum+h.ultraHitsPerSecond,0),'Ultra hits parity '+mode+' '+n);
    }
  }
});

test('effective Ultra uses three independent integer thresholds with per-hero ranks and excludes support slots',()=>{
  const I=load([{id:'hunter'},{id:'archer'},{id:'wizard'}]);
  const team=['hunter','archer','wizard'].map(id=>slot(id));
  const c={mode:'ranged',buffTeam:'warlock',baseCritChance:90,baseSuperChance:92,baseUltraChance:93,
    heroCritRanks:{hunter:{normal:10,super:8,ultra:7}}};
  const result=I.evaluate(team,neutral,c);
  assert.equal(result.heroes[0].ultraProbability,1);
  near(result.heroes[1].ultraProbability,.91*.92*.93,'Archer native 1% and three checks');
  assert.equal(result.heroes[2].ultraHitsPerSecond,0);
  assert.equal(result.guaranteedUltraHeroes,1);
  assert.equal(result.attackingHeroes,2);
  near(result.lowestUltraProbability,result.heroes[1].ultraProbability,'off-class Wizard excluded');
  near(result.ultraHitsPerSecond,1+.91*.92*.93,'expected Ultra packets');
  const empty=I.evaluate([slot('wizard')],neutral,c);
  assert.deepEqual([empty.guaranteedUltraHeroes,empty.attackingHeroes,empty.lowestUltraProbability,empty.ultraHitsPerSecond],[0,0,0,0]);
  const nearCap=I.evaluate([slot('hunter')],neutral,{...c,baseCritChance:96,baseSuperChance:100,baseUltraChance:100,heroCritRanks:{}});
  near(nearCap.lowestUltraProbability,.99,'99 normal cannot guarantee Ultra');
  const below=I.evaluate([slot('hunter')],neutral,{...c,baseSuperChance:0,heroCritRanks:{}});
  assert.equal(below.ultraHitsPerSecond,0,'zero Super chance prevents Ultra');
});

test('Dicemaster’s varying rolls can leave its effective Ultra below 100% even when its average bonus exceeds 100',()=>{
  const I=load([{id:'dicemaster'}]),s={...neutral,damageSkills:true},c={...noCrit,mode:'mage',buffTeam:'warlock'};
  const team=[slot('dicemaster')];
  const result=I.evaluate(team,s,c);
  assert.ok(result.lowestUltraProbability>0 && result.lowestUltraProbability<1);
  assert.equal(result.guaranteedUltraHeroes,0);
  near(result.ultraHitsPerSecond,result.totalHitRate*result.lowestUltraProbability,'expected hits');
  const forced=I.evaluate(team,{...s,damageDicemasterMaxRollChance:100},c);
  assert.equal(forced.guaranteedUltraHeroes,1);
  assert.equal(forced.guaranteedPassiveUltraHeroes,0);
  assert.deepEqual(Array.from(forced.heroes[0].passiveCritChances),[5,0,0]);
});

test('Sniper sheet chances stay at 343/572/48 while a deployed or swapped Titan buffs combat Ultra',()=>{
  const I=load([{id:'sniper',milestones:[bonus('Crit Chance',205),bonus('Super Crit Chance',463)]},{id:'titan'}]);
  const s={...neutral,damageSupportSkills:true};
  const cfg={mode:'ranged',baseCritChance:135,baseSuperChance:109,baseUltraChance:48};
  for(const [team,buffTeam] of [[[slot('sniper',14493),slot('titan')],'deploy'],[[slot('sniper',14493)],'swap']]) {
    const c={...cfg,buffTeam},result=I.evaluate(team,s,c),sniper=result.heroes[0];
    assert.deepEqual(Array.from(sniper.passiveCritChances),[343,572,48]);
    near(sniper.passiveUltraProbability,.48,'tier chances are individually capped before their product');
    assert.equal(sniper.ultraProbability,1,'Titan’s active buff is sufficient for combat Ultra');
    for (const summary of [result,I.makeScorer(s,c).details(team)]) {
      assert.equal(summary.mode,'ranged');
      assert.equal(summary.attackingHeroes,1,'the off-class support gets no vote');
      assert.equal(summary.lowestPassiveUltraProbability,.48);
      assert.equal(summary.guaranteedPassiveUltraHeroes,0);
      assert.equal(summary.guaranteedUltraHeroes,1);
    }
  }
});

test('permanent synergy and milestone chances count for every linked copy while self skill chances stay temporary',()=>{
  const I=load([{id:'deadeye',synergies:[{tier:1,requires:['scout'],type:'Ultra Crit Chance',value:32,global:false}]},
    {id:'scout',milestones:[bonus('Ultra Crit Chance',10,true)]}]);
  const team=['deadeye','deadeye','scout'].map(id=>slot(id));
  const c={mode:'ranged',baseCritChance:95,baseSuperChance:90,baseUltraChance:48,
    heroCritRanks:{deadeye:{super:10,ultra:10}}};
  const s={...neutral,damageSkills:true};
  const withSupport=I.evaluate(team,s,c);
  assert.equal(withSupport.guaranteedPassiveUltraHeroes,2);
  for(const hero of withSupport.heroes.slice(0,2)) {
    assert.deepEqual(Array.from(hero.passiveCritChances),[100,100,100]);
    assert.equal(hero.passiveUltraProbability,1);
  }
  const solo=I.evaluate([slot('deadeye')],s,c).heroes[0];
  assert.equal(solo.passiveCritChances[2],58);
  assert.equal(solo.ultraProbability,1,'Deadeye skill only guarantees combat Ultra');
  near(withSupport.lowestPassiveUltraProbability,.98*.9*.58,'weakest attacking hero must pass all three checks');
  const empty=I.evaluate([slot('scout')],s,{...c,mode:'mage'});
  assert.equal(empty.lowestPassiveUltraProbability,0);
  assert.equal(empty.guaranteedPassiveUltraHeroes,0);
});

test('sheet coverage counts each Skill, Melee and Mage attacker that can roll and skips support-only actions',()=>{
  const I=load([{id:'samurai'},{id:'forester'},{id:'militia'},{id:'titan'},
    {id:'wizard'},{id:'skymage'},{id:'warlock'}]);
  const c={baseCritChance:100,baseSuperChance:100,baseUltraChance:95,
    heroCritRanks:{militia:{ultra:5},forester:{ultra:5},warlock:{ultra:5}}};
  const s={...neutral,damageSupportSkills:true};
  const cases=[
    ['skill','deploy',['samurai','forester','militia','titan'],3,2],
    ['melee','swap',['militia','samurai','wizard'],2,1],
    ['mage','warlock',['warlock','skymage','forester'],1,1]
  ];
  for(const [mode,buffTeam,ids,attackers,guaranteed] of cases) {
    const team=ids.map(id=>slot(id)),cfg={...c,mode,buffTeam},result=I.evaluate(team,s,cfg);
    for(const summary of [result,I.makeScorer(s,cfg).details(team)]) {
      assert.equal(summary.attackingHeroes,attackers,mode);
      assert.equal(summary.guaranteedPassiveUltraHeroes,guaranteed,mode);
      assert.equal(summary.lowestPassiveUltraProbability,guaranteed===attackers?1:.95,mode);
    }
    if (mode==='skill') {
      const [samurai,forester,militia,titan]=result.heroes;
      assert.equal(samurai.hitRate,0);
      assert.ok(samurai.tickRate>0 && samurai.critEligibleHitsPerSecond===samurai.tickRate);
      assert.ok(forester.tickRate>0 && forester.critEligibleHitsPerSecond===forester.totalHitRate);
      assert.ok(militia.tickRate>0 && militia.critEligibleHitsPerSecond<militia.totalHitRate);
      assert.equal(titan.critEligibleHitsPerSecond,0);
    }
  }
});

test('Ranged and Mage sum boss-directed attacks, with separate personal speed ranks and ascension caps',()=>{
  const I=load([
    {id:'hunter',observedBaseStats:{damage:100,attackSpeed:10}},
    {id:'archer',observedBaseStats:{damage:100,attackSpeed:12}},
    {id:'wizard',observedBaseStats:{damage:100,attackSpeed:3}},
    {id:'skymage',observedBaseStats:{damage:100,attackSpeed:2}}
  ]);
  const team=['hunter','hunter','archer','wizard','skymage'].map(id=>slot(id));
  const s={...neutral,heroAscensions:{hunter:{maxAttackSpeedLevel:5},archer:{maxAttackSpeedLevel:5}}};
  const c={mode:'ranged',buffTeam:'warlock',heroSpeedRanks:{hunter:10},accountAttackSpeedBonus:10};
  const ranged=I.evaluate(team,s,c);
  near(ranged.heroes[0].uncappedAttackSpeed,14.3,'base 10 × rank 1.30 × account 1.10');
  near(ranged.heroes[0].attacksPerSecond,14.3,'raising cap alone does not grant 15/s');
  assert.equal(ranged.heroes[0].speedCap,15);
  near(ranged.heroes[2].attacksPerSecond,13.2,'Archer has a separate rank');
  assert.equal(ranged.heroes[3].attacksPerSecond,0,'off-class support');
  near(ranged.attacksPerSecond,41.8,'two Hunters and one Archer');
  const lowerCap=I.evaluate(team,neutral,c);
  near(lowerCap.attacksPerSecond,30,'all three individually capped at ten');
  near(I.evaluate(team,s,{...c,accountAttackSpeedBonus:20}).attacksPerSecond,44.4,'both Hunters reach fifteen');
  const imported=I.normalize({mode:'ranged',heroSpeedRanks:{hunter:20,archer:-1,apprentice:'invalid',unknown:8}});
  assert.deepEqual({...imported.heroSpeedRanks},{hunter:10});
  const mage=I.evaluate(team,s,{...c,mode:'mage'});
  near(mage.heroes[4].attacksPerSecond,1.2,'Skymage consumes one action per second on teleport');
  near(mage.attacksPerSecond,4.5,'only the two Mages can attack');
  for(const mode of ['ranged','mage']) {
    assert.equal(I.normalize({mode}).priority,'hits');
    assert.equal(I.normalize({mode,priority:'damage'}).priority,'damage');
    near(I.makeScorer(s,{...c,mode}).details(team).attacksPerSecond,mode==='ranged'?41.8:4.5,'compiled');
  }
});

test('speed above the owner’s cap adds real-hit damage before the Immortal logarithm',()=>{
  const I=load([{id:'hunter',observedBaseStats:{attackSpeed:20,damage:100}}]),team=[slot('hunter')];
  const c={mode:'ranged',...noCrit};
  const basic=I.evaluate(team,neutral,c).heroes[0];
  const raised=I.evaluate(team,{...neutral,heroAscensions:{hunter:{maxAttackSpeedLevel:5}}},c).heroes[0];
  assert.deepEqual([basic.aps,raised.aps],[10,15]);
  near(basic.rawHitLog,Math.log10(200),'ten attacks over the cap double real damage');
  near(raised.rawHitLog,Math.log10(150),'five attacks over the cap add 50% real damage');
});

test('the 10-Grand-Master team scales both forms of power once; the placement only boosts skill power',()=>{
  const ids=['champion','wizard','witch','titan','druid','archer','scout','veteran','warden','forester'];
  const I=load(ids.map(id=>({id}))),team=ids.map(id=>slot(id));
  const s={...neutral,snowFort:true,grandMaster:true},c={...noCrit,mode:'skill'};
  const ordinary=I.evaluate(team,s,c).heroes[0];
  near(ordinary.masteryPercent,499*1.05**10,'ten-GM mastery capture');
  assert.equal(Math.round(ordinary.masteryPercent),813);
  assert.equal(ordinary.effectiveSkillPower,Math.round(161*1.05**10));
  team[0].tile='skill';
  const tiled=I.evaluate(team,s,c).heroes[0];
  assert.equal(tiled.masteryPercent,ordinary.masteryPercent);
  assert.equal(tiled.effectiveSkillPower,Math.round(161*1.05**10*1.2));
});

test('regular Boss Damage is bypassed; the Immortal uses Ultra Boss Damage and hierarchical real crit factors',()=>{
  const I=load([{id:'titan',milestones:[bonus('Boss Damage',900),bonus('Ultra Boss Damage',100)]}]);
  const cfg={mode:'melee',baseCritChance:45,baseSuperChance:50,baseUltraChance:40};
  // Native Titan crit = 5, so 50 of the 100 integer rolls pass.
  const row=I.evaluate([slot('titan')],neutral,cfg).heroes[0];
  const chances=[.5,.25,.15,.1];
  chances.forEach((p,i)=>near(row.critProbabilities[i],p,'exclusive tier '+i));
  const expected=chances[0]*Math.log10(200)+chances[1]*Math.log10(400)*1.1
    +chances[2]*Math.log10(1200)*1.25+chances[3]*Math.log10(3600)*1.5;
  near(row.perHit,expected,'four outcomes');
});

test('mode presets keep external buff sources off the roster and reuse a deployed skill only once',()=>{
  const I=load([{id:'champion'},{id:'wizard'},{id:'warlock'}]);
  assert.deepEqual(['skill','melee','mage','ranged'].map(mode=>I.normalize({mode}).buffTeam),['deploy','swap','warlock','warlock']);
  const team=[slot('champion'),slot('wizard')];
  const s={...neutral,damageSupportSkills:true};
  const config={...noCrit,mode:'melee',buffTeam:'swap'};
  const swapped=I.evaluate(team,s,config);
  assert.equal(swapped.heroes.length,2);
  assert.equal(swapped.heroes[0].skillCooldown,1);
  assert.equal(swapped.championHitsPerSecond,89);
  const external=I.evaluate([team[0]],s,config);
  near(swapped.score,external.score,'Wizard already supplies triple shot through the swap');
  const deployed=I.evaluate(team,s,{...config,buffTeam:'deploy'});
  assert.equal(deployed.heroes[0].skillCooldown,24);
  const withWarlock=[...team,slot('warlock')],onTeam={...config,buffTeam:'deploy'};
  assert.equal(I.evaluate(withWarlock,s,onTeam).heroes[0].skillCooldown,1);
  const fast=I.makeScorer(s,config,team);
  near(fast.details(team).score,swapped.score,'fast swapped DPS');
  near(fast.details(team).championHitsPerSecond,swapped.championHitsPerSecond,'fast strike priority');
});

test('run-level damage uses the same recurrence at low levels and stays finite up to level one million',()=>{
  const I=load([{id:'titan'}]);
  const cfg={...noCrit,mode:'melee'};
  const at=level=>I.evaluate([slot('titan',level)],neutral,cfg).heroes[0];
  near(at(1).rawHitLog,2,'level one');
  near(at(2).rawHitLog,Math.log10(210),'level two');
  assert.ok(at(1000000).rawHitLog>20000 && Number.isFinite(at(1000000).score));
  const team=[slot('titan',1000000)];
  near(I.makeScorer(neutral,cfg,team)(team),at(1000000).score,'million-level search');
});

test('enemy-side debuffs need an eligible deployed mage; off-type passive milestones still apply',()=>{
  const I=load([{id:'peacekeeper'},{id:'apprentice',milestones:[bonus('Damage',100,true)]},{id:'witch'},{id:'skymage'},{id:'wizard'}]);
  const team=[slot('peacekeeper'),slot('apprentice'),slot('witch'),slot('skymage')];
  const cfg={mode:'melee',buffTeam:'warlock'},s={...neutral,damageSupportSkills:true};
  const blocked=I.evaluate(team,s,cfg);
  near(blocked.score,I.evaluate(team,neutral,cfg).score,'enemy debuffs cannot land on a fresh melee Immortal');
  near(blocked.heroes[0].rawHitLog,Math.log10(200),'off-type milestone doubles damage');
  const legal=[slot('wizard'),...team.slice(1)],mage={mode:'mage',buffTeam:'warlock'};
  assert.ok(I.evaluate(legal,s,mage).heroes[0].rawHitLog>I.evaluate(legal,neutral,mage).heroes[0].rawHitLog);
  near(I.makeScorer(s,cfg,team)(team),blocked.score,'search rejects the same debuffs');
});

test('Champion replaces an entire triple shot, Scout replaces only its first projectile, and one wound can tick',()=>{
  const I=load([{id:'champion'},{id:'militia'},{id:'scout'},{id:'wizard'}]);
  const s={...neutral,damageSupportSkills:true},c={...noCrit,buffTeam:'swap'};
  const melee=I.evaluate([slot('champion'),slot('militia'),slot('militia')],s,{...c,mode:'melee'});
  assert.equal(melee.heroes[0].hitRate,27);
  assert.equal(melee.heroes[0].totalHitRate,27+89);
  assert.equal(melee.heroes[1].tickRate+melee.heroes[2].tickRate,1,'both Militias share one wound');
  const guaranteed=I.evaluate([slot('militia')],s,{mode:'melee',buffTeam:'warlock',baseCritChance:100,baseSuperChance:100,baseUltraChance:100});
  near(guaranteed.totalHitRate-guaranteed.ultraHitsPerSecond,guaranteed.heroes[0].tickRate,'wound adds scoring hits and cannot roll a fresh Ultra');
  const ranged=I.evaluate([slot('scout')],s,{...c,mode:'ranged'});
  assert.equal(ranged.heroes[0].hitRate,29);
  assert.equal(ranged.totalHitRate,30);
  assert.equal(ranged.attacksPerSecond,10,'a Scout action can send three scoring projectiles');
});

test('Immortal hit logarithms include personal Damage and each deployed global ascension',()=>{
  const I=load([{id:'champion'},{id:'scout'}]);
  const party=[slot('champion'),slot('scout'),slot('scout')];
  const cfg={...noCrit,mode:'skill',buffTeam:'warlock'};
  const base=I.evaluate(party,neutral,cfg);
  const settings={...neutral,heroAscensions:{champion:{damageLevel:2},scout:{globalDamageLevel:2}}};
  const result=I.evaluate(party,settings,cfg);
  near(result.heroes[0].rawHitLog-base.heroes[0].rawHitLog,Math.log10(25*4*4),'Champion hit');
  near(I.makeScorer(settings,cfg,party)(party),result.score,'compiled boss damage');
});

test('fresh-boss stun and confusion have separate capped uptimes shared by duplicate casters',()=>{
  const I=load([{id:'champion'},{id:'sorcerer'},{id:'elementalist'}]);
  const cfg={...noCrit,mode:'skill',buffTeam:'warlock',fightSeconds:60};
  const party=[slot('champion'),slot('sorcerer'),slot('elementalist')];
  const s={...neutral,snowFort:true},mastery=1.996*10;
  const expected=.15*(Math.log10(1+.2*mastery)+Math.log10(1+.15*mastery));
  const baseline=I.evaluate(party.slice(0,1),s,cfg).heroes[0].rawHitLog;
  for(const team of [party,[...party,slot('sorcerer')]]) {
    const result=I.evaluate(team,s,cfg);
    near(result.heroes[0].rawHitLog-baseline,expected,'nine seconds of each debuff');
    near(I.makeScorer(s,cfg,team)(team),result.score,'search status uptime');
  }
});
