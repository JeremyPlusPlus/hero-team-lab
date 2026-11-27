(function (root) {
  'use strict';
  const DATA = root.HERO_DATA;
  const heroMap = new Map(DATA.heroes.map(h => [h.id, h]));
  const aliases = {...DATA.meta.statAliases, 'Super Energy': 'Super Energy Chance'};
  const mult = new Set(['Damage', 'Attack Speed', 'Crit Damage', 'Super Crit Damage', 'Ultra Crit Damage',
    'Kill Gold', 'Boss Gold', 'Super Gold Amount', 'Ultra Gold Amount', 'Super Energy Amount', 'Ultra Energy Amount', 'Power Mage Energy',
    'Super Exp Amount', 'Ultra Exp Amount', 'Boss Damage', 'Boss Exp', 'Ultra Boss Damage', 'Goblin Gold', 'Range', 'Milestone Bonus', 'Synergy Bonus',
    'Tier 5 + 6 Synergy', 'Tier 7 Synergy', 'Mastery Skill Power', 'Skill Power (tile)',
    'Damage Taken', 'Triple Shot Damage', 'Rank Exp Multiplier', 'Exp Reward Multiplier', 'Own Kill Exp Multiplier', 'Energy Income Multiplier', 'Skill Duration Multiplier']);
  const chances = {
    damage: ['Crit Chance', 'Super Crit Chance', 'Ultra Crit Chance'],
    gold: ['Super Gold Chance', 'Ultra Gold Chance'],
    energy: ['Super Energy Chance', 'Ultra Energy Chance'],
    experience: ['Super Exp Chance', 'Ultra Exp Chance']
  };
  const damageFactors = ['Damage','Attack Speed','Crit Damage','Super Crit Damage','Ultra Crit Damage','Damage Taken','Triple Shot Damage'];
  const speedStat=damageFactors.indexOf('Attack Speed'),volleyStat=damageFactors.indexOf('Triple Shot Damage');
  const splashStat=damageFactors.length,damageChanceStart=splashStat+1;
  const tagFocuses = Object.freeze({
    archerExperienceTag: {heroId:'archer', name:'Archer Experience Tag', baseSetting:'archerTagBasePower'},
    hunterGoldTag: {heroId:'hunter', name:'Hunter Gold Tag', baseSetting:'hunterTagBasePower'}
  });
  const focusStats = {
    damage: [...damageFactors,'Splash Damage',...chances.damage],
    gold: ['Kill Gold','Super Gold Amount','Ultra Gold Amount','Boss Gold',...chances.gold],
    experience: ['Rank Exp','Super Exp Amount','Ultra Exp Amount',...chances.experience],
    energy: ['Energy Income','Super Energy Amount','Ultra Energy Amount',...chances.energy],
    powerMageEnergy: ['Energy Income','Super Energy Amount','Ultra Energy Amount','Power Mage Energy',...chances.energy],
    archerExperienceTag: ['Skill Power'],
    hunterGoldTag: ['Skill Power']
  };
  // Active-window captures already include the account context. The nine-GM
  // measurements also establish a no-Snow baseline for their personal masteries.
  const damageSkillDefinitions = [
    {id:'praetorian',name:'Ion Blades',duration:20,cooldown:28,fields:[
      ['SuperCritChance','Super Crit Chance',1436,'active',466],['SuperCritDamage','Super Crit Damage',7180,'active',2330],
      ['UltraCritChance','Ultra Crit Chance',124,'mastery',93],['UltraCritDamage','Ultra Crit Damage',6179,'mastery',4646]]},
    {id:'deadeye',name:'Divine Aim',duration:25,cooldown:28,fields:[
      ['Damage','Damage',24210,'active',6990],['AttackSpeed','Attack Speed',16115,'active',4635],['UltraCritChance','Ultra Crit Chance',484.2,'active',139.8],
      ['SuperCritDamage','Super Crit Damage',2060,'mastery',1549],['AdditionalTargets','Additional targets',41,'mastery',31],
      ['Duration','Active duration (s)',25,'timing',20]]},
    {id:'dicemaster',name:'Feeling Lucky',duration:20,cooldown:32,fields:[
      ['CritMin','Crit Chance minimum',5,'active'],['CritMax','Crit Chance maximum',2867,'active',927],
      ['SuperCritMin','Super Crit Chance minimum',3,'active'],['SuperCritMax','Super Crit Chance maximum',1436,'active',466],
      ['UltraCritMin','Ultra Crit Chance minimum',1,'active'],['UltraCritMax','Ultra Crit Chance maximum',718,'active',233],
      ['MaxRollChance','Maximum-roll chance',41.2,'mastery',31]]},
    // At mastery 10 and estimated M=3.097, the game uses +300M% per (1 - 0.225M) m.
    // Keep the unrounded slope behind the nine-GM tooltip's +929% per 0.30 m.
    {id:'warden',name:'Gatling Gun',duration:25,cooldown:24,fields:[
      ['AttackSpeed','Attack Speed',16140,'active',4660],['Damage','Damage',8070,'active',2330],['Range','Range (%)',3233,'active',937],
      ['ReferenceBonus','Damage at reference distance (%)',180249,'mastery',929.1],['ReferenceDistance','Reference distance (m)',10.7,'mastery',0.303175],
      ['Duration','Active duration (s)',25,'timing',20]]},
    {id:'warlord',name:'Avatar',duration:74,cooldown:24,fields:[
      ['Damage','Damage',4660,'active'],['AttackSpeed','Attack Speed',2330,'active'],['SplashDamage','Splash Damage',466,'active'],
      ['SuperCritChance','Super Crit Chance',155,'mastery'],['SuperCritDamage','Super Crit Damage',3097,'mastery']]},
    {id:'champion',name:'Lightning Storm',duration:0,cooldown:24,fields:[
      ['Strikes','Strikes per cast',236,'active'],['StrikeDamage','Damage per strike',4660,'active'],
      ['RepeatDamage','Damage per prior strike',774,'mastery']]},
    {id:'militia',name:'Spin Attack',duration:0,cooldown:24,fields:[
      ['SpinDamage','Spin damage',13980,'active'],['WoundDamage','Wound damage per tick (% of spin)',6194,'mastery']]},
    {id:'gladiator',name:'Killjoy',duration:20,cooldown:24,fields:[
      ['DamagePerKill','Damage per personal kill',1864,'active'],['SuperCritDamagePerKill','Super Crit Damage per personal kill',1084,'mastery']]},
    {id:'assassin',name:'Execute',duration:20,cooldown:32,fields:[
      ['Threshold','Execution HP threshold',60,'active'],['ExtraThreshold','Additional execution threshold (pp)',10,'mastery'],
      ['DamagePerExecution','Damage per execution',1549,'mastery'],['AttackSpeedPerExecution','Attack Speed per execution',50,'mastery']]}
  ].map(def=>{
    const prefix='damage'+def.id[0].toUpperCase()+def.id.slice(1);
    const fields=def.fields.map(([suffix,label,value,stage,nineGmValue=value])=>({key:prefix+suffix,label,value,nineGmValue,stage,type:label.replace(/ (minimum|maximum)$/,'')}));
    return {...def,name:heroMap.get(def.id)?.name||def.id[0].toUpperCase()+def.id.slice(1),skillName:def.name,
      fields,durationKey:fields.find(field=>field.stage==='timing')?.key};
  });
  const damageDefinitionMap=new Map(damageSkillDefinitions.map(def=>[def.id,def]));
  // Mastery level 10. Projection from the common power preserves the precision
  // hidden by the nine integer-rounded tooltips. Historical and edited profiles
  // have no verified map baseline and use their entered values directly.
  const nineGmMasteryPower=3.097;
  const nineGmMasteryPerPower={
    damageChampionRepeatDamage:250, damageMilitiaWoundDamage:2000,
    damageGladiatorSuperCritDamagePerKill:350, damageAssassinDamagePerExecution:500,
    damageWarlordSuperCritChance:50, damageWarlordSuperCritDamage:1000,
    damageDeadeyeSuperCritDamage:500, damageDeadeyeAdditionalTargets:10,
    damageDicemasterMaxRollChance:10, damagePraetorianUltraCritChance:30,
    damagePraetorianUltraCritDamage:1500, damageWardenReferenceBonus:300
  };
  const damageSupportDefinitions = [
    {id:'apprentice',fields:[['DamageTakenPerSecond','Damage Taken per second',41.2,'mastery']]},
    {id:'druid',fields:[['Damage','Damage',7180,'active'],['DamagePerSecond','Damage per second',82.4,'mastery']]},
    {id:'witch',fields:[['DamageTaken','Damage Taken',7180,'active'],['DamageTakenPerSecond','Damage Taken per second',82.4,'mastery']]},
    {id:'wizard',fields:[['AttackSpeed','Attack Speed',7180,'active'],['TripleShotChance','Triple-shot chance',206,'mastery']]},
    {id:'battlemage',fields:[['CritChance','Crit Chance',1619,'active'],['UltraCritChancePerStack','Ultra Crit Chance per stack',8.2,'mastery']]},
    {id:'spelldancer',fields:[['CritDamage','Crit Damage',8070,'active'],['CritDamagePerStack','Crit Damage per stack',123.6,'mastery']]},
    {id:'skymage',fields:[['DamageTakenPerTeleport','Damage Taken per teleport',1236,'mastery']]},
    {id:'templar',fields:[['SplashDamage','Splash Damage',1436,'active'],['SplashDamagePerSecond','Splash Damage per second',41.2,'mastery']]},
    {id:'necromancer',fields:[
      ['DamageMin','Damage minimum',25,'active'],['DamageMax','Damage maximum',8070,'active'],
      ['AttackSpeedMin','Attack Speed minimum',25,'active'],['AttackSpeedMax','Attack Speed maximum',8070,'active'],
      ['CritDamageMin','Crit Damage minimum',5,'mastery'],['CritDamageMax','Crit Damage maximum',1030,'mastery'],
      ['SuperCritDamageMin','Super Crit Damage minimum',3,'mastery'],['SuperCritDamageMax','Super Crit Damage maximum',618,'mastery'],
      ['UltraCritDamageMin','Ultra Crit Damage minimum',1,'mastery'],['UltraCritDamageMax','Ultra Crit Damage maximum',206,'mastery']]},
    {id:'titan',fields:[['SuperCritChance','Super Crit Chance',290.2,'active'],['SuperCritDamage','Super Crit Damage',1451,'active'],
      ['UltraCritChance','Ultra Crit Chance',82,'mastery'],['UltraCritDamage','Ultra Crit Damage',2060,'mastery']]}
  ].map(def=>({...def,name:heroMap.get(def.id)?.name||def.id[0].toUpperCase()+def.id.slice(1),
    skillName:{apprentice:'Slow',druid:'Damage Boost',witch:'Curse',wizard:'Speed Boost',battlemage:'Critical Boost',spelldancer:'Power Boost',skymage:'Teleport',templar:'Splash Boost',necromancer:'Chaos',titan:'Super Aura'}[def.id],
    fields:def.fields.map(([suffix,label,value,stage])=>({key:'damageSupport'+def.id[0].toUpperCase()+def.id.slice(1)+suffix,label,value,stage,type:label}))}));
  const damageSupportDefinitionMap=new Map(damageSupportDefinitions.map(def=>[def.id,def]));
  const defaults = {maxTier: 9, synergyScale: 1, milestoneScale: 1.875, defaultMilestoneLevel: 0, overflowRate: 5, baseOverflow: 0, baseEnergy: 10000,
    requirementReduction: 0, damageHero: null, goldHero: null, experienceHero: null, experienceVeteranStacks: 100, experienceBaseRankXp: 100, experienceSupportLevel: 15000, experienceReference: null, chanceReferences: null, requiredHeroes: [], ultraExpMode: 'exclude', grandMaster: true, grandMasterStacking: 'multiply', synergyGrandMasterStacking: 'multiply',
    experienceOptimizeSupportStyles:false, experienceTile:20, experienceSkills:true, experienceArcherBonus:13240, experienceArcherMasteryPerWave:0.65, experienceWave:75000, experienceArcherCoverage:100,
    experienceBallistaBonus:3865, experienceBallistaMasteryPerStack:6.5, experienceBallistaStacks:100,
    experienceVeteranSuperChance:149.2, experienceVeteranShareChance:365.5, experienceVeteranSuperAmountPerStack:16.26,
    accountSynergyBoosts: true, synergyEvent: false, tier12Scale: 6.25, tier34Scale: 2.5,
    archerTagBasePower:0, hunterTagBasePower:0,
    heroSynergyDefault: 0, heroSynergyCrusader: 0, heroSynergyWarden: 0, heroAscensions: {},
    synergyGlobalBonus1: 5, synergyGlobalBonus2: 5, synergyGlobalBonus3: 5,
    snowFort: true, mapT56:115, mapT7:77, mapMastery:33, mapAttackSpeed:-20,
    goldSkills:true, goldKillGoldTile:2475, goldRogueBonus:8070, goldHunterBonus:28720,
    goldSovereignChance:325.8, goldSovereignAmount:1629, goldCrusaderBonus:6420, goldCrusaderMastery:20.6, goldCrusaderAttacks:1,
    goldMimicFarming:false, goldMimicGoldBonus:340, goldWaveBossGoldBonus:0,
    damageSkills:true, damageTile:2475, damageSkillTileBoost:20, damageMasteryTileBoost:20, damageWardenDistance:10.7,damageAttackerKills:20,damageAssassinExecutions:0,
    damageSupportSkills:true, damageSupportMode:'all', damageSupportSeconds:20, damageSupportStacks:0, damageSupportTeleports:3, damageNecromancerRoll:'midpoint'};
  for(const def of [...damageSkillDefinitions,...damageSupportDefinitions]) for(const field of def.fields) defaults[field.key]=field.value;
  const tileTypes = ['normal','milestone','synergy','skill','killGold','damage','experience'];
  const grandMasterEffects = [
    {type:'Damage',value:150,global:true}, {type:'Kill Gold',value:150,global:true},
    {type:'Skill Power',value:5,global:true}, {type:'Mastery Power',value:5,global:true},
    {type:'Milestone Bonus',value:10,global:true}, {type:'Synergy Bonus',value:10,global:true},
    {type:'Attack Speed',value:-90,global:false}
  ];
  // Tier I shows no rank requirement. Every leveling hero starts at level 1.
  const experienceTierLevels = [1,15,50,100,150,250,500,1000,1500];
  const experienceStyles = [
    {id:'none',name:'No combat style',level:1,effects:[]},
    {id:'commander',name:'Commander',level:300,effects:[
      ['Damage',25,true],['Kill Gold',25,true],['Synergy Bonus',4,true],['Skill Power',2,true],['Attack Speed',-50]]},
    {id:'expFactory',name:'Exp Factory',level:500,effects:[
      ['Attack Speed',15,true],['Boss Exp',100],['Super Exp Chance',10],['Ultra Exp Chance',3],['Skill Duration Multiplier',-50]]},
    {id:'tycoon',name:'Tycoon',level:1250,effects:[
      ['Kill Gold',35,true],['Rank Exp Multiplier',5,true],['Synergy Bonus',5,true],['Energy Income',5,true],['Range',3,true],['Damage',-95]]},
    {id:'industrialist',name:'Industrialist',level:2500,effects:[
      ['Rank Exp Multiplier',40],['Boss Exp',100],['Super Exp Chance',15],['Super Exp Amount',75],['Ultra Exp Chance',5],['Kill Gold',-99]]},
    {id:'magnate',name:'Magnate',level:4000,effects:[
      ['Kill Gold',75,true],['Rank Exp Multiplier',12,true],['Energy Income Multiplier',5,true],
      ['Instant Spell',2,true],['Synergy Bonus',8,true],['Damage',-99]]}
  ].map(style => ({...style,effects:style.effects.map(([type,value,global=false]) => ({
    type,value,global,unit:type==='Energy Income'||type==='Skill Power'?'flat':'percent'
  }))}));
  function allowedExperienceStyles(level, requested = 'auto') {
    const unlocked = experienceStyles.filter(style => style.level <= level || style.id === 'none');
    return requested === 'auto' ? unlocked : [unlocked.find(style => style.id === requested) || unlocked[0]];
  }
  function levelerTier(level, maxTier) {
    return Math.min(maxTier,experienceTierLevels.filter(start => start <= level).length);
  }
  const supportStyleIds=['grandMaster','tycoon','magnate'];
  function supportStyleOptions(team,id) {
    const level=Math.min(...team.filter(slot=>slot.id===id).map(slot=>slot.level));
    return ['grandMaster',...(level>=1250?['tycoon']:[]),...(level>=4000?['magnate']:[])];
  }
  function assignSupportStyle(team,id,styleId) {
    for(const slot of team) if(slot.id===id) slot.combatStyle=styleId;
    return team;
  }
  function supportCombatContext(team,s,leveler) {
    const levelerId=team[leveler]?.id,counts={grandMaster:0,tycoon:0,magnate:0},stylesById={};
    for(const slot of team) {
      if(slot.id===levelerId) continue;
      if(!Object.hasOwn(stylesById,slot.id)) {
        const requested=team.find(other=>other.id===slot.id && supportStyleIds.includes(other.combatStyle))?.combatStyle;
        stylesById[slot.id]=supportStyleOptions(team,slot.id).includes(requested)?requested:'grandMaster';
      }
      counts[stylesById[slot.id]]++;
    }
    return {counts,stylesById,gmCount:s.grandMaster?counts.grandMaster:0};
  }
  function normalizeSupportCombatStyles(team,leveler) {
    const context=supportCombatContext(team,{grandMaster:true},leveler);
    for(const [id,styleId] of Object.entries(context.stylesById)) {
      const requested=team.find(slot=>slot.id===id && supportStyleIds.includes(slot.combatStyle))?.combatStyle;
      if(!requested) continue;
      if(!supportStyleOptions(team,id).includes(requested)) {
        for(const slot of team) if(slot.id===id) delete slot.combatStyle;
      } else assignSupportStyle(team,id,styleId);
    }
    return team;
  }
  function styleFor(s, count, levelerStyle = null, levelerCount = 1, supportCounts = {}) {
    const n = s.grandMaster ? count : 0;
    const bonusScale = s.grandMasterStacking === 'multiply' ? Math.pow(1.1,n) : 1 + n * 0.1;
    const synergyBonus = (levelerStyle?.effects.find(effect => effect.type === 'Synergy Bonus')?.value || 0) / 100;
    const tycoons=supportCounts.tycoon||0,magnates=supportCounts.magnate||0;
    const synergyBonusScale = s.synergyGrandMasterStacking === 'multiply'
      ? Math.pow(1.1,n)*Math.pow(1+synergyBonus,levelerCount)*Math.pow(1.05,tycoons)*Math.pow(1.08,magnates)
      : 1+n*0.1+synergyBonus*levelerCount+0.05*tycoons+0.08*magnates;
    const eventMilestoneScale = s.synergyEvent ? 1.25 : 1;
    const eventSynergyScale = s.synergyEvent ? 1.1 : 1;
    return {name:s.grandMaster?'Grand Master':'None',count:n,bonusScale,synergyBonusScale,milestoneScale:s.milestoneScale,
      synergyEvent:s.synergyEvent,eventMilestoneScale,eventSynergyScale,
      effectiveMilestoneScale:s.milestoneScale*bonusScale*eventMilestoneScale,
      effectiveSynergyScale:s.synergyScale*synergyBonusScale*eventSynergyScale};
  }
  function mapFor(s) {
    return {name:s.snowFort?'Snow Fort':'None',enabled:s.snowFort,
      tier56:s.snowFort?1+s.mapT56/100:1,tier7:s.snowFort?1+s.mapT7/100:1,
      mastery:s.snowFort?1+s.mapMastery/100:1,attackSpeed:s.snowFort?1+s.mapAttackSpeed/100:1};
  }
  function scalesFor(slot, style, map, settings) {
    // Account and event boosts multiply the shared Grand Master + owner tile pool.
    const ascension = settings.heroAscensions?.[slot.id];
    const milestoneLevel = ascension?.milestoneLevel ?? settings.defaultMilestoneLevel;
    const milestoneRatio = 1 + milestoneLevel / 10;
    const milestone=style.milestoneScale*style.eventMilestoneScale
      *(style.bonusScale+(map.enabled && slot.tile==='milestone'?0.2:0))*milestoneRatio;
    const inheritedBonus=slot.id==='crusader'?settings.heroSynergyCrusader
      :slot.id==='warden'?settings.heroSynergyWarden:settings.heroSynergyDefault;
    const ownerBonus=ascension?.synergyLevel === undefined ? inheritedBonus : 5*ascension.synergyLevel;
    const ownerSynergy=settings.accountSynergyBoosts?1+ownerBonus/100:1;
    const accountTier12=settings.accountSynergyBoosts?settings.tier12Scale:1;
    const accountTier34=settings.accountSynergyBoosts?settings.tier34Scale:1;
    const accountGlobalSynergy=settings.accountSynergyBoosts
      ?(1+settings.synergyGlobalBonus1/100)*(1+settings.synergyGlobalBonus2/100)*(1+settings.synergyGlobalBonus3/100):1;
    // Owner bonuses multiply only this owner's emitted effects, regardless of team size.
    const synergy=(style.effectiveSynergyScale/style.synergyBonusScale)
      *(style.synergyBonusScale+(map.enabled && slot.tile==='synergy'?0.1:0))*ownerSynergy*accountGlobalSynergy;
    return {milestone,synergy,ownerSynergy,accountGlobalSynergy,accountTier12,accountTier34,
      tier12:synergy*accountTier12,tier34:synergy*accountTier34,
      tier56:synergy*map.tier56,tier7:synergy*map.tier7};
  }
  const tierScale = (tier, scales) => tier===1 || tier===2 ? scales.tier12
    :tier===3 || tier===4 ? scales.tier34
    :tier===5 || tier===6 ? scales.tier56 : tier===7 ? scales.tier7 : scales.synergy;
  function canonicalType(type, settings = {}) {
    if (type === 'Ultra Exp') return settings.ultraExpMode === 'amount' ? 'Ultra Exp Amount'
      : settings.ultraExpMode === 'chance' ? 'Ultra Exp Chance' : type;
    return aliases[type] || type;
  }
  function statMode(type) { return mult.has(canonicalType(type)) ? 'multiply' : 'add'; }
  const ascensionLevelCaps = Object.freeze({
    milestoneLevel:5, synergyLevel:5, killGoldLevel:99, damageLevel:99,
    globalDamageLevel:99, globalKillGoldLevel:99, globalRankExpLevel:25, globalEnergyIncomeLevel:5,
    synergyReductionLevel:1, maxAttackSpeedLevel:5, minSkillCooldownLevel:3, freeHeroLevelChanceLevel:5
  });
  const ascensionBonuses = [
    ['damage','Damage',false,'Damage (Multiplicative)'],['killGold','Kill Gold',false,'Kill Gold (Multiplicative)'],
    ['globalDamage','Damage',true,'Damage (Progressive)'],['globalKillGold','Kill Gold',true,'Kill Gold (Progressive)'],
    ['globalRankExp','Rank Exp Multiplier',true,'Rank EXP (%)'],['globalEnergyIncome','Energy Income Multiplier',true,'Energy Income (%)']
  ];
  function normalizeHeroAscensions(input) {
    const result = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
    for (const [id, ranks] of Object.entries(input)) {
      if (!heroMap.has(id) || !ranks || typeof ranks !== 'object' || Array.isArray(ranks)) continue;
      const profile = {};
      for (const [key, cap] of Object.entries(ascensionLevelCaps)) {
        if (!Object.hasOwn(ranks,key)) continue;
        const raw = ranks[key];
        if (typeof raw !== 'number' && !(typeof raw === 'string' && raw.trim())) continue;
        const value = Number(raw);
        if (Number.isFinite(value)) profile[key] = Math.max(0,Math.min(cap,Math.floor(value)));
      }
      if (Object.keys(profile).length) result[id] = profile;
    }
    return result;
  }
  function ascensionFactors(id,settings) {
    const ranks=settings.heroAscensions?.[id]||{};
    const progressive=rank=>1+rank*(rank+1)/2;
    return {
      damage:5**(ranks.damageLevel??0), killGold:5**(ranks.killGoldLevel??0),
      globalDamage:progressive(ranks.globalDamageLevel??0), globalKillGold:progressive(ranks.globalKillGoldLevel??0),
      globalRankExp:1+(ranks.globalRankExpLevel??0)/100, globalEnergyIncome:1+(ranks.globalEnergyIncomeLevel??0)/100
    };
  }
  function ascensionEffectsFor(id,s,globalsOnly=false) {
    const ranks=s.heroAscensions[id];
    if (!ranks) return [];
    const factors=ascensionFactors(id,s),effects=[];
    for (const [key,type,global,label] of ascensionBonuses) {
      const multiplier=factors[key], level=ranks[key+'Level'];
      if (multiplier===1 || (globalsOnly && !global)) continue;
      const value=key==='globalRankExp'||key==='globalEnergyIncome'?level:(multiplier-1)*100;
      effects.push({type,global,multiplier,value,level,source:label+' ascension upgrade'});
    }
    return effects;
  }
  function settingsFor(input = {}) {
    const s = {...defaults, ...input};
    s.heroAscensions = normalizeHeroAscensions(s.heroAscensions);
    for (const [key, lo, hi] of [['maxTier',0,9], ['synergyScale',0,100], ['milestoneScale',0,100], ['defaultMilestoneLevel',0,5], ['overflowRate',0,100],
      ['tier12Scale',0,100], ['tier34Scale',0,100], ['heroSynergyDefault',0,10000], ['heroSynergyCrusader',0,10000], ['heroSynergyWarden',0,10000],
      ['synergyGlobalBonus1',0,10000], ['synergyGlobalBonus2',0,10000], ['synergyGlobalBonus3',0,10000],
      ['baseOverflow',0,1e9], ['baseEnergy',0,1e9], ['mapT56',0,10000], ['mapT7',0,10000], ['mapMastery',0,10000], ['mapAttackSpeed',-99,10000],
      ['archerTagBasePower',0,1e9], ['hunterTagBasePower',0,1e9],
      ['damageTile',0,1e9],['damageSkillTileBoost',0,10000],['damageMasteryTileBoost',0,10000],['damageWardenDistance',0,1e6],['damageAttackerKills',0,1e6],['damageAssassinExecutions',0,1e6],
      ['damageSupportSeconds',0,1e6],['damageSupportStacks',0,200],['damageSupportTeleports',0,1e6],['experienceVeteranStacks',0,100],['experienceBaseRankXp',1,1e100],['experienceSupportLevel',0,1e6],
      ...['experienceArcherBonus','experienceArcherMasteryPerWave','experienceWave','experienceBallistaBonus','experienceBallistaMasteryPerStack',
        'experienceVeteranSuperChance','experienceVeteranShareChance','experienceVeteranSuperAmountPerStack'].map(key=>[key,0,1e9]),
      ['experienceArcherCoverage',0,100],['experienceBallistaStacks',0,100],['experienceTile',0,1e9],
      ...damageSkillDefinitions.flatMap(def=>def.fields.map(field=>[field.key,field.key==='damageWardenReferenceDistance'?0.001:0,field.key==='damageDicemasterMaxRollChance'?100:1e9])),
      ...damageSupportDefinitions.flatMap(def=>def.fields.map(field=>[field.key,0,1e9])),
      ['goldKillGoldTile',0,1e9], ['goldRogueBonus',0,1e9], ['goldHunterBonus',0,1e9], ['goldSovereignChance',0,1e9], ['goldSovereignAmount',0,1e9],
      ['goldMimicGoldBonus',0,1e9], ['goldWaveBossGoldBonus',0,1e9],
      ['goldCrusaderBonus',0,1e9], ['goldCrusaderMastery',0,1e9], ['goldCrusaderAttacks',0,1e6]]) {
      s[key] = Number.isFinite(Number(s[key])) ? Math.max(lo, Math.min(hi, Number(s[key]))) : defaults[key];
    }
    s.maxTier = Math.floor(s.maxTier);
    s.defaultMilestoneLevel = Math.round(s.defaultMilestoneLevel);
    s.requirementReduction = s.requirementReduction ? 1 : 0;
    s.grandMaster = s.grandMaster !== false;
    s.snowFort = s.snowFort !== false;
    s.accountSynergyBoosts = s.accountSynergyBoosts !== false;
    s.synergyEvent = s.synergyEvent === true;
    s.goldSkills = s.goldSkills !== false;
    s.goldMimicFarming = s.goldMimicFarming === true;
    s.goldCrusaderAttacks = Math.floor(s.goldCrusaderAttacks);
    s.damageSkills = s.damageSkills !== false;
    s.damageAttackerKills = Math.floor(s.damageAttackerKills);
    s.damageAssassinExecutions = Math.floor(s.damageAssassinExecutions);
    s.damageSupportSkills = s.damageSupportSkills !== false;
    s.damageSupportMode = s.damageSupportMode === 'debuffs' ? 'debuffs' : 'all';
    s.damageSupportStacks = Math.floor(s.damageSupportStacks);
    s.damageSupportTeleports = Math.floor(s.damageSupportTeleports);
    s.experienceVeteranStacks = Math.floor(s.experienceVeteranStacks);
    s.experienceSkills = s.experienceSkills !== false;
    s.experienceOptimizeSupportStyles = s.experienceOptimizeSupportStyles === true;
    s.experienceBallistaStacks = Math.floor(s.experienceBallistaStacks);
    s.experienceWave = Math.floor(s.experienceWave);
    s.experienceSupportLevel = Math.floor(s.experienceSupportLevel);
    s.experienceReference = normalizeExperienceReference(s.experienceReference);
    s.chanceReferences = Object.fromEntries(['gold','damage','damageBuffSwap'].map(focus =>
      [focus,normalizeChanceReference(s.chanceReferences?.[focus],focus)]));
    s.damageNecromancerRoll = s.damageNecromancerRoll === 'maximum' ? 'maximum' : 'midpoint';
    s.grandMasterStacking = s.grandMasterStacking === 'add' ? 'add' : 'multiply';
    s.synergyGrandMasterStacking = s.synergyGrandMasterStacking === 'add' ? 'add' : 'multiply';
    return s;
  }
  function cleanTeam(team) {
    if (Array.isArray(team) && team.length>10) throw new Error('A team can contain at most 10 heroes.');
    const cleaned = (Array.isArray(team) ? team : []).filter(x => x && heroMap.has(x.id)).map(x => ({
      id: x.id, level: Math.max(0, Math.min(1000000, Math.floor(Number(x.level) || 0))), locked: !!x.locked,
      tile:tileTypes.includes(x.tile)?x.tile:'normal',
      ...(supportStyleIds.includes(x.combatStyle)?{combatStyle:x.combatStyle}:{})
    }));
    const copies=countsFor(cleaned), tiles={};
    for(const [id,count] of Object.entries(copies)) if(count>3) throw new Error(`At most 3 copies of ${heroMap.get(id).name} can be deployed.`);
    for(const slot of cleaned) if(slot.tile!=='normal') {
      tiles[slot.tile]=(tiles[slot.tile]||0)+1;
      const limit=['killGold','damage','experience'].includes(slot.tile)?1:3;
      if(tiles[slot.tile]>limit) throw new Error(`Only ${limit} ${slot.tile} bonus ${limit===1?'tile is':'tiles are'} available.`);
    }
    return cleaned;
  }
  function countsFor(team) {
    const c = Object.create(null);
    for (const slot of team) c[slot.id] = (c[slot.id] || 0) + 1;
    return c;
  }
  // Reserve the owner first. Each remaining copy can satisfy one listed partner only.
  function synergyPartnersNeeded(ownerId, synergy, settings = defaults.requirementReduction) {
    const reduction = typeof settings === 'object'
      ? settings.heroAscensions?.[ownerId]?.synergyReductionLevel ?? settings.requirementReduction
      : settings;
    return synergy.requires.length - (synergy.requires.length >= 2 && reduction ? 1 : 0);
  }
  function synergyActive(ownerId, synergy, counts, settings = defaults.requirementReduction) {
    if (!counts[ownerId]) return false;
    const used = Object.create(null);
    used[ownerId] = 1;
    let matched = 0;
    for (const id of synergy.requires) {
      if ((counts[id] || 0) > (used[id] || 0)) { used[id] = (used[id] || 0) + 1; matched++; }
    }
    return matched >= synergyPartnersNeeded(ownerId, synergy, settings);
  }
  function apply(bucket, type, value, factor) {
    if (statMode(type) === 'multiply') bucket[type] = (bucket[type] ?? 1) * (factor ?? (1 + value / 100));
    else bucket[type] = (bucket[type] || 0) + value;
  }
  function merge(a, b) {
    const out = {...a};
    for (const [type, value] of Object.entries(b)) {
      out[type] = statMode(type) === 'multiply' ? (out[type] ?? 1) * value : (out[type] || 0) + value;
    }
    return out;
  }
  function overflowFor(bucket, s, leveling = false, damageRolls = null) {
    const result = Object.fromEntries(Object.entries(chances).map(([key, types]) => [key,
      1 + (s.baseOverflow + s.overflowRate * types.reduce((sum, type) => sum + (bucket[type] || 0), 0)) / 100]));
    if (leveling && s.experienceReference) result.experience = experienceChanceFor(
      bucket['Super Exp Chance'] || 0,bucket['Ultra Exp Chance'] || 0,s).factor;
    for (const focus of ['gold','damage']) if (chanceReferenceFor(s,focus)) result[focus] =
      chanceFactorFor(chances[focus].map(type=>bucket[type]||0),s,focus,focus==='damage'?damageRolls:null);
    return result;
  }
  function chanceKey(focus,s = {}) {
    return focus === 'damage' && s.damageSupportMode === 'debuffs' ? 'damageBuffSwap' : focus;
  }
  function chanceReferenceFor(s,focus) { return s.chanceReferences?.[chanceKey(focus,s)] || null; }
  function normalizeChanceReference(input,focus) {
    const types = chances[focus==='damageBuffSwap'?'damage':focus];
    if (!['gold','damage','damageBuffSwap'].includes(focus) || !input || typeof input !== 'object' || Array.isArray(input)) return null;
    const mode = input.mode ?? 'recorded';
    if (!['preTeam','recorded'].includes(mode)) return null;
    const numbers = values => Array.isArray(values) && values.length === types.length
      && values.every(value=>(typeof value==='number'||typeof value==='string'&&value.trim())&&Number.isFinite(Number(value)))
      ? values.map(value=>Math.max(0,Math.min(1e9,Number(value)))) : null;
    const totals = numbers(input.totals), contributions = mode==='preTeam'?types.map(()=>0):numbers(input.contributions);
    const extra = input.extraOverflow ?? 0;
    if (!totals || !contributions || typeof extra==='boolean' || extra==='' || !Number.isFinite(Number(extra))) return null;
    const out = {mode,totals,contributions,extraOverflow:Math.max(0,Math.min(1e9,Number(extra))),label:String(input.label||'Chance reference').slice(0,200)};
    if (Array.isArray(input.team)) {
      try { out.team = cleanTeam(input.team); } catch { return null; }
      out.attackerIndex = selectedIndex(out.team,input.attackerIndex);
    }
    if (input.captureSettings && typeof input.captureSettings==='object') {
      out.captureSettings = Object.fromEntries(
        Object.keys(defaults).filter(key=>!['chanceReferences','experienceReference','heroAscensions'].includes(key)&&Object.hasOwn(input.captureSettings,key))
          .map(key=>[key,input.captureSettings[key]]).filter(([,value])=>['number','string','boolean'].includes(typeof value)));
      if (Object.hasOwn(input.captureSettings,'heroAscensions')) out.captureSettings.heroAscensions =
        normalizeHeroAscensions(input.captureSettings.heroAscensions);
    }
    return out;
  }
  function defaultChanceReferences() {
    return Object.fromEntries([['gold',[50,50]],['damage',[135,109,48]],['damageBuffSwap',[135,109,48]]]
      .map(([focus,totals])=>[focus,normalizeChanceReference({mode:'preTeam',totals,extraOverflow:0,label:'Account chances with no heroes deployed'},focus)]));
  }
  function captureChanceReference(rawTeam,settings,focus,observed,label) {
    if (!['gold','damage','damageBuffSwap'].includes(focus)) throw new Error('Choose Gold or a Damage focus.');
    const metric = focus==='gold'?'gold':'damage';
    const s = settingsFor({...settings,experienceLeveler:null,
      ...(metric==='damage'?{damageSupportMode:focus==='damageBuffSwap'?'debuffs':'all'}:{})});
    const result = evaluate(rawTeam,s), attackerIndex = metric==='gold'?result.goldIndex:result.attackerIndex;
    if (attackerIndex===null) throw new Error('Choose an attacker before recording chance totals.');
    const reference = normalizeChanceReference({mode:'recorded',totals:Array.isArray(observed)?observed:observed?.totals,
      extraOverflow:Array.isArray(observed)?0:observed?.extraOverflow??0,
      contributions:chances[metric].map(type=>result.heroes[attackerIndex].bonuses[type]||0),
      label:label||`${heroMap.get(result.heroes[attackerIndex].id).name} · deployed chances`,
      team:cleanTeam(rawTeam),attackerIndex,captureSettings:s},focus);
    if (!reference) throw new Error('Enter a finite displayed chance for every tier.');
    return reference;
  }
  function expectedChanceExcess(background,roll) {
    const cut = 100-background, {min,max,maxRollProbability:p} = roll;
    const uniform = cut<=min ? (min+max)/2-cut : cut>=max ? 0 : (max-cut)**2/(2*(max-min));
    return p*Math.max(0,max-cut)+(1-p)*uniform;
  }
  function excessForChance(total,roll) {
    if (!roll) return Math.max(0,total-100);
    const mean = roll.maxRollProbability*roll.max+(1-roll.maxRollProbability)*(roll.min+roll.max)/2;
    return expectedChanceExcess(total-mean,roll);
  }
  // Search scores need only the factor. Avoid building explanatory arrays for
  // every attacker in hundreds of thousands of candidate placements.
  function chanceFactorFor(values,s,focus,rolls = null) {
    const reference = chanceReferenceFor(s,focus), types = chances[focus==='damageBuffSwap'?'damage':focus];
    let excess = 0;
    for (let i=0;i<values.length;i++) excess += reference
      ? excessForChance(reference.totals[i]+(values[i]-reference.contributions[i]),rolls?.[types[i]]) : values[i];
    return 1+((reference?reference.extraOverflow:s.baseOverflow)+s.overflowRate*excess)/100;
  }
  function chanceForValues(values,s,focus,rolls = null) {
    const metric = focus==='damageBuffSwap'?'damage':focus, types = chances[metric];
    const reference = chanceReferenceFor(s,focus), mode = reference?.mode || 'legacy';
    const raw = values.map((value,i)=>reference ? reference.totals[i]+(value-reference.contributions[i]) : 100+value);
    const totals = raw.map(value=>Math.max(0,value));
    const excess = raw.map((value,i)=>excessForChance(value,reference && rolls?.[types[i]]));
    const excessPoints = reference ? excess.reduce((sum,value)=>sum+value,0) : values.reduce((sum,value)=>sum+value,0);
    const baseOverflow = reference ? reference.extraOverflow : s.baseOverflow;
    const baselineExcess = reference ? reference.totals.reduce((sum,value)=>sum+Math.max(0,value-100),0) : 0;
    return {types:types.slice(),totals,added:values.slice(),excess,excessPoints,baseOverflow,mode,reference,
      factor:1+(baseOverflow+s.overflowRate*excessPoints)/100,
      baselineOverflowFactor:1+(baseOverflow+s.overflowRate*baselineExcess)/100,
      belowCap:totals.some(value=>value<100-1e-9),expectedRolls:!!rolls&&Object.keys(rolls).length>0};
  }
  function chanceDetailsFor(bonuses,settings,focus,rolls = null) {
    const s = settingsFor(settings), metric = focus==='damageBuffSwap'?'damage':focus;
    return chanceForValues(chances[metric].map(type=>bonuses[type]||0),s,focus,rolls);
  }
  function experienceRankFactor(b,baseRankXp,reference = null) {
    if (reference) {
      const observed = 100 + reference.rankBonus;
      return Math.max(0,observed/reference.rankMultiplier + ((b['Rank Exp']||0) - reference.rankFlat))
        * (b['Rank Exp Multiplier']??1) / observed;
    }
    return (1+(b['Rank Exp']||0)/baseRankXp)*(b['Rank Exp Multiplier']??1);
  }
  // The boss takes the stronger of the primary hit and the pooled splash hit.
  function singleTargetSplash(percent=0) { return Math.max(1,percent/100); }
  function metricsFor(b, s, overflow, baseRankXp = 100, experienceReference = null) {
    const factor = type => b[type] ?? 1;
    const energy = (s.baseEnergy + (b['Energy Income'] || 0)) * factor('Energy Income Multiplier') * factor('Super Energy Amount') * factor('Ultra Energy Amount') * overflow.energy;
    return {
      damage: damageFactors.reduce((value,type)=>value*factor(type),1) * singleTargetSplash(b['Splash Damage']) * overflow.damage,
      gold: factor('Kill Gold') * factor('Boss Gold') * factor('Super Gold Amount') * factor('Ultra Gold Amount') * overflow.gold,
      experience: experienceRankFactor(b,baseRankXp,experienceReference) * factor('Exp Reward Multiplier') * factor('Super Exp Amount') * factor('Ultra Exp Amount') * overflow.experience,
      energy,
      powerMageEnergy: energy * factor('Power Mage Energy')
    };
  }
  function selectedIndex(team, value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < team.length ? index : null;
  }
  function scoredIndex(heroes, value, focus) {
    return value === 'best' && heroes.length
      ? heroes.reduce((best, hero, index) => hero.metrics[focus] > heroes[best].metrics[focus] ? index : best, 0)
      : selectedIndex(heroes, value);
  }
  const focusTarget = (settings, focus) => focus === 'damage' ? settings.damageHero
    : focus === 'gold' ? settings.goldHero : focus === 'experience' ? settings.experienceHero : null;
  function effectiveSkillPower(basePower,flatPower,grandMasterFactor,tileFactor) {
    return Math.max(0,Math.round((basePower+flatPower)*(grandMasterFactor*tileFactor)));
  }
  function strongestTagCaster(heroes,tag,s,global,style) {
    const id=tag.heroId,basePower=s[tag.baseSetting],grandMasterFactor=1.05**style.count;
    // Grand Masters' raw +5 entries in the bonus table represent percentages.
    // Account for them only through their compounded multiplier.
    const globalMilestones=global.milestone['Skill Power']??0;
    const globalSynergies=global.synergy['Skill Power']??0;
    const globalPower=globalSynergies+globalMilestones+((global.style['Skill Power']??0)-5*style.count);
    let strongest=null;
    for(const hero of heroes) {
      if(hero.id!==id) continue;
      const personalMilestones=hero.local.milestone['Skill Power']??0;
      const personalSynergies=hero.local.synergy['Skill Power']??0;
      const personalPower=personalMilestones+personalSynergies;
      const tileFactor=hero.local.placement['Skill Power (tile)']??1;
      const score=effectiveSkillPower(basePower,globalPower+personalPower,grandMasterFactor,tileFactor);
      if(!strongest || score>strongest.score) {
        strongest={index:hero.index,id,basePower,globalPower,personalPower,globalMilestones,globalSynergies,
          personalMilestones,personalSynergies,grandMasterFactor,tileFactor,score};
      }
    }
    return strongest;
  }
  // These are the user's captured active bonuses without a skill-power tile.
  // Their unknown account/lineup context is already included: do not multiply
  // them again by Grand Masters, milestones, synergies or the event.
  function goldSkillsFor(team, s) {
    const result={enabled:s.goldSkills,skills:[],killGoldMultiplier:1,superGoldAmountMultiplier:1,superGoldChance:0};
    if(!s.goldSkills) return result;
    for(const id of ['rogue','sovereign','hunter']) {
      let ownerIndex=team.findIndex(slot=>slot.id===id);
      if(ownerIndex<0) continue;
      const boosted=s.snowFort?team.findIndex(slot=>slot.id===id&&slot.tile==='skill'):-1;
      if(boosted>=0) ownerIndex=boosted;
      const tileBoost=boosted>=0?1.2:1;
      const skill={id,name:heroMap.get(id).name,ownerIndex,tileBoost,
        killGold:id==='rogue'?s.goldRogueBonus*tileBoost:id==='hunter'?s.goldHunterBonus*tileBoost:0,
        superGoldChance:id==='sovereign'?s.goldSovereignChance*tileBoost:0,
        superGoldAmount:id==='sovereign'?s.goldSovereignAmount*tileBoost:0};
      result.skills.push(skill);
      result.killGoldMultiplier*=1+skill.killGold/100;
      result.superGoldAmountMultiplier*=1+skill.superGoldAmount/100;
      result.superGoldChance+=skill.superGoldChance;
    }
    return result;
  }
  function crusaderAttackMultiplier(slot,s) {
    if(slot.id!=='crusader'||!s.goldSkills) return 0;
    const tileBoost=s.snowFort&&slot.tile==='skill'?1.2:1;
    const attacks=s.goldCrusaderAttacks,initial=Math.min(attacks,501);
    // Hit one has no prior stacks; each later hit sees at most 500 stacks.
    const stackSum=initial*(initial-1)/2+Math.max(0,attacks-501)*500;
    return s.goldCrusaderBonus*tileBoost/100*0.5*(attacks+s.goldCrusaderMastery*tileBoost/100*stackSum);
  }
  function goldChanceTotal(reference,index,added) {
    return Math.max(0,reference ? reference.totals[index]+(added-reference.contributions[index]) : 100+added);
  }
  function mimicKillPayout(s,killGold,bossGold,superAmount,ultraAmount,superChance,ultraChance,details=false) {
    const reference=chanceReferenceFor(s,'gold');
    const totalSuperChance=goldChanceTotal(reference,0,superChance), totalUltraChance=goldChanceTotal(reference,1,ultraChance);
    const superProc=Math.min(1,totalSuperChance/100), ultraProc=Math.min(1,totalUltraChance/100);
    const normalProbability=1-superProc, superProbability=superProc*(1-ultraProc), ultraProbability=superProc*ultraProc;
    // The Wave Boss account input excludes deployed global Boss Gold, which is in bossGold.
    const waveBossGoldFactor=10*(1+s.goldWaveBossGoldBonus/100), mimicGoldFactor=3*(1+s.goldMimicGoldBonus/100);
    const normalPayout=killGold*bossGold*waveBossGoldFactor*mimicGoldFactor;
    // A successful Ultra roll retains the Super award, including its own excess-chance bonus.
    const superOverflowFactor=1+s.overflowRate*Math.max(0,totalSuperChance-100)/100;
    const ultraOverflowFactor=1+s.overflowRate*Math.max(0,totalUltraChance-100)/100;
    const superPayout=normalPayout*3*superAmount*superOverflowFactor, ultraPayout=superPayout*3*ultraAmount*ultraOverflowFactor;
    const expectedGold=normalProbability*normalPayout+superProbability*superPayout+ultraProbability*ultraPayout;
    return details ? {normalProbability,superProbability,ultraProbability,normalPayout,superPayout,ultraPayout,
      totalSuperChance,totalUltraChance,superOverflowFactor,ultraOverflowFactor,expectedGold,mimicGoldFactor,waveBossGoldFactor} : expectedGold;
  }
  function goldSkillFor(slot,s,baseKillGold,killScore,mimic) {
    const enabled=slot.id==='crusader'&&s.goldSkills;
    const tileBoost=s.snowFort&&slot.tile==='skill'?1.2:1;
    const attackMultiplier=crusaderAttackMultiplier(slot,s),attackGold=baseKillGold*attackMultiplier;
    killScore=mimic?.expectedGold??killScore;
    return {id:slot.id,name:slot.id==='crusader'?'Golden Arrows':null,enabled,tileBoost,
      attacks:enabled?s.goldCrusaderAttacks:0,masteryPerStack:enabled?s.goldCrusaderMastery*tileBoost:0,
      maxStacks:500,waveBossEfficiency:0.5,baseKillGold,attackMultiplier,attackGold,mimic,
      killScore,totalScore:killScore+attackGold};
  }
  function damageSkillFor(slot,s) {
    const definition=damageDefinitionMap.get(slot.id);
    const tileBoost=s.snowFort&&slot.tile==='skill'?1+s.damageSkillTileBoost/100:1;
    const masteryTileBoost=s.snowFort&&slot.tile==='skill'?1+s.damageMasteryTileBoost/100:1;
    const result={id:slot.id,name:definition?.skillName||null,known:!!definition,enabled:!!definition&&s.damageSkills,
      tileBoost,masteryTileBoost,mapMasteryFactor:1,duration:s[definition?.durationKey]??definition?.duration??0,cooldown:definition?.cooldown||0,
      activeEffects:[],masteryEffects:[],notes:[],factor:1,nonSplashFactor:1,splashPercent:0,chance:0,chanceByType:{},chanceRolls:{}};
    if(!definition) {result.notes.push('No captured attacker skill is configured for this hero.');return result;}
    if(!s.damageSkills) return result;
    const projectMastery=s.snowFort && s.mapMastery>0 && definition.fields.every(field=>s[field.key]===field.nineGmValue);
    if(projectMastery) {
      result.mapMasteryFactor=1+s.mapMastery/100;
      result.notes.push('Snow Fort applies +'+s.mapMastery+'% Mastery Power to the nine-GM off-map capture.');
    }
    const masteryPower=nineGmMasteryPower*result.mapMasteryFactor;
    const setting=key=>projectMastery && Object.hasOwn(nineGmMasteryPerPower,key)?nineGmMasteryPerPower[key]*masteryPower:s[key];
    const prefix='damage'+slot.id[0].toUpperCase()+slot.id.slice(1),value=suffix=>setting(prefix+suffix);
    function add(type,amount,stage='active') {
      if(!amount) return;
      const effect={type,value:amount,global:false,stage,unit:'percent'};
      result[stage==='active'?'activeEffects':'masteryEffects'].push(effect);
      if(chances.damage.includes(type)) {result.chance+=amount;result.chanceByType[type]=(result.chanceByType[type]||0)+amount;}
      else if(type==='Splash Damage') result.splashPercent+=amount;
      else if(damageFactors.includes(type)) result.nonSplashFactor*=1+amount/100;
    }
    if(slot.id==='champion') {
      result.strikes=Math.max(0,Math.round(skillPowerTileBonus(value('Strikes'),8,0.5,tileBoost)));
      result.strikeDamage=skillPowerTileBonus(value('StrikeDamage'),100,10,tileBoost);
      result.repeatDamage=value('RepeatDamage')*masteryTileBoost;
      const ramp=Math.min(result.strikes,100);
      const priorStacks=ramp*(ramp-1)/2+Math.max(0,result.strikes-ramp)*100;
      result.castFactor=result.strikeDamage/100*(result.strikes+priorStacks*result.repeatDamage/100);
      result.notes.push(result.strikes+' strikes on one target at '+result.strikeDamage+'% damage each. Each prior strike adds '+result.repeatDamage+'% damage up to 100 stacks per cast.');
    } else if(slot.id==='militia') {
      result.spinDamage=skillPowerTileBonus(value('SpinDamage'),300,30,tileBoost);
      result.castFactor=result.spinDamage/100;
      result.woundFactor=value('WoundDamage')*masteryTileBoost/100;
      result.notes.push('Spin deals '+result.spinDamage+'% damage. Each of up to three one-second wound ticks deals '+Number((result.woundFactor*100).toFixed(2))+'% of the spin.');
    } else if(slot.id==='gladiator') {
      result.attackerKills=s.damageAttackerKills;
      add('Damage',skillPowerTileBonus(value('DamagePerKill'),40,4,tileBoost)*result.attackerKills);
      add('Super Crit Damage',value('SuperCritDamagePerKill')*masteryTileBoost*result.attackerKills,'mastery');
      result.notes.push(result.attackerKills+' personal kills during Killjoy. Stacks add within each stat.');
    } else if(slot.id==='assassin') {
      result.attackerKills=s.damageAssassinExecutions;
      result.executeThreshold=Math.min(100,Math.min(60,skillPowerTileBonus(value('Threshold'),10,1,tileBoost))+value('ExtraThreshold'));
      result.bossExecuteThreshold=result.executeThreshold/2;
      add('Damage',value('DamagePerExecution')*masteryTileBoost*result.attackerKills,'mastery');
      add('Attack Speed',value('AttackSpeedPerExecution')*result.attackerKills,'mastery');
      result.notes.push(result.attackerKills+' successful executions in the active window. Execute triggers below '+result.executeThreshold+'% HP ('+result.bossExecuteThreshold+'% on bosses). The damage index counts the buffs earned from executions.');
    } else if(slot.id==='warlord') {
      add('Damage',skillPowerTileBonus(value('Damage'),100,10,tileBoost));
      add('Attack Speed',skillPowerTileBonus(value('AttackSpeed'),50,5,tileBoost));
      add('Splash Damage',skillPowerTileBonus(value('SplashDamage'),10,1,tileBoost));
      add('Super Crit Chance',value('SuperCritChance')*masteryTileBoost,'mastery');
      add('Super Crit Damage',value('SuperCritDamage')*masteryTileBoost,'mastery');
    } else if(slot.id==='deadeye') {
      add('Damage',skillPowerTileBonus(value('Damage'),150,15,tileBoost));
      add('Attack Speed',skillPowerTileBonus(value('AttackSpeed'),75,10,tileBoost));
      add('Ultra Crit Chance',skillPowerTileBonus(value('UltraCritChance'),3,0.3,tileBoost));
      add('Super Crit Damage',value('SuperCritDamage')*masteryTileBoost,'mastery');
      result.notes.push('Multishot can hit '+Math.round(value('AdditionalTargets'))+' additional targets at the captured mastery. This comparison uses one boss.');
    } else if(slot.id==='dicemaster') {
      const p=Math.min(100,value('MaxRollChance')*masteryTileBoost)/100;
      result.maxRollChance=p*100;
      for(const [suffix,type] of [['Crit','Crit Chance'],['SuperCrit','Super Crit Chance'],['UltraCrit','Ultra Crit Chance']]) {
        const min=Math.min(value(suffix+'Min'),value(suffix+'Max'))*tileBoost;
        const max=Math.max(value(suffix+'Min'),value(suffix+'Max'))*tileBoost;
        result.chanceRolls[type]={min,max,maxRollProbability:p};
        add(type,p*max+(1-p)*(min+max)/2);
      }
      result.notes.push('Expected roll: maximum-roll mastery chance, otherwise a uniform roll between the captured limits.');
    } else if(slot.id==='warden') {
      add('Attack Speed',value('AttackSpeed')*tileBoost);
      add('Damage',value('Damage')*tileBoost);
      result.distance=s.damageWardenDistance;
      result.referenceDistance=projectMastery?1-0.225*masteryPower:value('ReferenceDistance');
      result.referenceBonus=value('ReferenceBonus');
      if(result.referenceDistance>0) {
        add('Damage',result.referenceBonus*result.distance/result.referenceDistance*masteryTileBoost,'mastery');
      } else {
        result.referenceDistance=null;
        result.distanceMasteryUnavailable=true;
        result.notes.push('This map bonus makes the modeled mastery distance interval nonpositive. The score includes only Warden’s other damage bonuses.');
      }
      result.notes.push('Distance mastery scales continuously with the distance to the enemy. Gatling Gun also gives +'+value('Range')+'% range at the captured Skill Power.');
    } else {
      for(const field of definition.fields) {
        const stage=field.stage,boost=stage==='mastery'?masteryTileBoost:tileBoost;
        add(field.label,setting(field.key)*boost,stage);
      }
    }
    result.factor=result.nonSplashFactor*singleTargetSplash(result.splashPercent);
    if(slot.id==='warlord') result.notes.push('Avatar adds its splash percentage to Templar’s buffs on ordinary attacks.');
    if(result.castFactor!==undefined) {
      const hero=heroMap.get(slot.id);
      result.baseAttackSpeed=hero?.observedBaseStats?.attackSpeed??hero?.attackSpeed??1;
      result.speedCap=10+(s.heroAscensions[slot.id]?.maxAttackSpeedLevel??0);
    }
    return result;
  }
  // The normalized Damage index already includes attack speed and multi-shot.
  // A cast spends one whole normal volley. Only its share of attack actions
  // gets replaced, and a refreshed wound can tick at most once per second.
  function damageCastMultiplier(skill,speed,normalVolleyFactor,warlock,explain=false) {
    const aps=Math.min(skill.speedCap,skill.baseAttackSpeed*speed);
    if(aps<=0 || normalVolleyFactor<=0) return 1;
    const interval=Math.max(warlock?1:skill.cooldown,1/aps);
    const woundTicks=skill.woundFactor ? Math.min(3,Math.floor(interval)) : 0;
    const hits=skill.castFactor*(1+woundTicks*(skill.woundFactor||0));
    if(explain) {
      skill.attacksPerSecond=aps; skill.castInterval=interval; skill.woundTicks=woundTicks;
      skill.notes.push('One cast replaces a normal volley every '+Number(interval.toFixed(3))+' s at '+Number(aps.toFixed(3))+' attacks/s.'
        +(skill.woundFactor?' The wound delivers '+woundTicks+' ticks before expiry or refresh.':''));
    }
    const castShare=Math.min(1,1/(interval*aps));
    return (1-castShare)+castShare*hits/normalVolleyFactor;
  }
  function damageWarlockActive(s,team) {
    return s.damageSupportSkills && s.damageSupportMode==='all' && team.some(slot=>slot.id==='warlock');
  }
  function damageSupportEnabled(id,s) {
    return s.damageSupportSkills && damageSupportDefinitionMap.has(id)
      && (s.damageSupportMode !== 'debuffs' || id === 'witch' || id === 'apprentice');
  }
  function damageSupportFor(slot,s) {
    const definition=damageSupportDefinitionMap.get(slot.id);
    if(!damageSupportEnabled(slot.id,s)) return null;
    const tileBoost=s.snowFort&&slot.tile==='skill'?1+s.damageSkillTileBoost/100:1;
    const masteryTileBoost=s.snowFort&&slot.tile==='skill'?1+s.damageMasteryTileBoost/100:1;
    const result={id:slot.id,name:definition.name,skillName:definition.skillName,tileBoost,masteryTileBoost,
      activeEffects:[],masteryEffects:[],notes:[],factor:1,nonSplashFactor:1,speedFactor:1,volleyFactor:1,splashPercent:0,chance:0,chanceByType:{}};
    const prefix='damageSupport'+slot.id[0].toUpperCase()+slot.id.slice(1),value=suffix=>s[prefix+suffix];
    function add(type,amount,stage='active') {
      if(!amount) return;
      result[stage==='mastery'?'masteryEffects':'activeEffects'].push({type,value:amount,global:true,stage,unit:'percent'});
      if(chances.damage.includes(type)) {result.chance+=amount;result.chanceByType[type]=(result.chanceByType[type]||0)+amount;}
      else if(type==='Splash Damage') result.splashPercent+=amount;
      else if(damageFactors.includes(type)) {
        const multiplier=1+amount/100;
        result.nonSplashFactor*=multiplier;
        if(type==='Attack Speed') result.speedFactor*=multiplier;
        if(type==='Triple Shot Damage') result.volleyFactor*=multiplier;
      }
    }
    if(slot.id==='necromancer') {
      for(const [suffix,type,stage] of [['Damage','Damage','active'],['AttackSpeed','Attack Speed','active'],
        ['CritDamage','Crit Damage','mastery'],['SuperCritDamage','Super Crit Damage','mastery'],['UltraCritDamage','Ultra Crit Damage','mastery']]) {
        const lo=Math.min(value(suffix+'Min'),value(suffix+'Max')),hi=Math.max(value(suffix+'Min'),value(suffix+'Max'));
        add(type,(s.damageNecromancerRoll==='maximum'?hi:(lo+hi)/2)*(stage==='mastery'?masteryTileBoost:tileBoost),stage);
      }
      result.roll=s.damageNecromancerRoll;
      result.notes.push(s.damageNecromancerRoll==='maximum'?'Maximum roll in every captured range.':'Midpoint scenario for each captured range; not an exact expected damage calculation.');
    } else for(const field of definition.fields) {
      const stage=field.stage,boost=stage==='mastery'?masteryTileBoost:tileBoost;
      let amount=s[field.key]*boost,type=field.label;
      if(field.key.endsWith('PerSecond')) {amount*=s.damageSupportSeconds;type=type.replace(' per second','');}
      if(field.key.endsWith('PerStack')) {amount*=s.damageSupportStacks;type=type.replace(' per stack','');}
      if(field.key.endsWith('PerTeleport')) {amount*=s.damageSupportTeleports;type=type.replace(' per teleport','');}
      if(field.key.endsWith('TripleShotChance')) {
        result.tripleShotChance=Math.min(100,amount);
        add('Triple Shot Damage',2*result.tripleShotChance,stage);
        result.notes.push('Triple-shot chance is capped at 100%: at most ×3 attacks, with no excess-chance spillover.');
      } else add(type,amount,stage);
    }
    if(['apprentice','druid','witch'].includes(slot.id)) result.notes.push('Mastery uses '+s.damageSupportSeconds+' seconds; accumulated stacks form one additional multiplier.');
    if(['battlemage','spelldancer'].includes(slot.id)) result.notes.push(s.damageSupportStacks===0?'No kill-based mastery bonus at 0 kills; the active buff still applies.':'Mastery uses '+s.damageSupportStacks+' additive kill stacks, capped at 200.');
    if(slot.id==='skymage') result.notes.push('Mastery uses '+s.damageSupportTeleports+' teleports.');
    result.factor=result.nonSplashFactor*singleTargetSplash(result.splashPercent);
    if(slot.id==='templar') result.notes.push('Active and mastery splash add to '+Number(result.splashPercent.toFixed(2))+'% after '+s.damageSupportSeconds+' seconds. Ordinary attacks use the full splash pool when it exceeds 100%.');
    return result;
  }
  function applyDamageSupportProfile(globals,support) {
    // Speed and extra projectiles enter the cast-vs-normal-volley comparison
    // separately. Other support damage factors can share the product.
    globals[0]*=support.nonSplashFactor/(support.speedFactor*support.volleyFactor);
    globals[speedStat]*=support.speedFactor;
    globals[volleyStat]*=support.volleyFactor;
    globals[splashStat]+=support.splashPercent;
    chances.damage.forEach((type,k)=>{globals[damageChanceStart+k]+=support.chanceByType[type]||0;});
  }
  function damageSupportsFor(team,s) {
    const result={enabled:s.damageSupportSkills,mode:s.damageSupportMode,seconds:s.damageSupportSeconds,stacks:s.damageSupportStacks,
      teleports:s.damageSupportTeleports,necromancerRoll:s.damageNecromancerRoll,skills:[],factor:1,chance:0};
    if(!s.damageSupportSkills) return result;
    const seen=new Set();
    team.forEach((slot,ownerIndex)=>{
      if(seen.has(slot.id)) return;
      seen.add(slot.id);
      const skill=damageSupportFor(slot,s);
      if(!skill) return;
      result.skills.push({...skill,ownerIndex});
      result.factor*=skill.factor;result.chance+=skill.chance;
    });
    return result;
  }
  function rankingReferenceNumber(raw, fallback, min = 100, max = 1e9) {
    const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }
  function xpRankingReference(input = {}) {
    return {
      rankXp: rankingReferenceNumber(input?.rankXp, 6.98e12, 1, 1e100),
      superChance: rankingReferenceNumber(input?.superChance, 359),
      ultraChance: rankingReferenceNumber(input?.ultraChance, 536)
    };
  }
  function damageRankingReference(input = {}) {
    return {
      critChance: rankingReferenceNumber(input?.critChance, 241),
      superChance: rankingReferenceNumber(input?.superChance, 258),
      ultraChance: rankingReferenceNumber(input?.ultraChance, 120)
    };
  }
  function withRankingSpillover(reference, chanceKeys, rate) {
    const excessPoints = chanceKeys.reduce((sum, key) => sum + Math.max(0, reference[key] - 100), 0);
    return {...reference, excessPoints, spilloverFactor: 1 + rate * excessPoints / 100};
  }
  function rankingOverflow(focus, reference, bonuses, rate) {
    const addedPoints = chances[focus].reduce((sum, type) => sum + (bonuses[type] || 0), 0);
    return reference.spilloverFactor + rate * addedPoints / 100;
  }
  // Compare one copy's support in a fixed context, without deploying a team.
  // Grand Masters and a milestone tile amplify only milestones. The optional
  // global ascension bonuses come from one deployed copy at its account ranks.
  // A separate Damage column also includes the captured global support skill.
  function rankMilestoneSupport(inputSettings = {}, options = {}) {
    options = options || {};
    const s = settingsFor({...inputSettings,chanceReferences:null});
    const bounded = (value, fallback, max) => Number.isFinite(Number(value ?? fallback))
      ? Math.max(0, Math.min(max, Math.floor(Number(value ?? fallback)))) : fallback;
    const level = bounded(options.level, 15000, 1000000);
    const grandMasterCount = bounded(options.grandMasterCount, 10, 10);
    const includeGlobalAscensions = options.includeGlobalAscensions !== false;
    // These explicit controls are independent of the team comparison's toggles.
    const tile = ['milestone','skill'].includes(options.tile) ? options.tile : 'normal';
    const style = styleFor({...s, grandMaster: true}, grandMasterCount), map = mapFor({...s, snowFort: true});
    const milestoneScale = scalesFor({tile}, style, map, s).milestone;
    const baseline = metricsFor({}, s, overflowFor({}, s));
    const focuses = Object.keys(baseline), warnings = [];
    const allFocuses = Object.keys(focusStats);
    const rankingFocuses = [...focuses,'damageWithSupport'];
    const xpReference = withRankingSpillover(xpRankingReference(options.xpReference), ['superChance', 'ultraChance'], s.overflowRate);
    const damageReference = withRankingSpillover(damageRankingReference(options.damageReference), ['critChance', 'superChance', 'ultraChance'], s.overflowRate);
    baseline.damage = damageReference.spilloverFactor;
    baseline.damageWithSupport = damageReference.spilloverFactor;
    // XP indices use one unit of starting Rank XP. The reference and candidate
    // share the starting Super/Ultra amounts, so those cancel in the ratio.
    baseline.experience = xpReference.spilloverFactor;
    const supportSettings = {...s,snowFort:true};
    const damageSupportContext = {enabled:s.damageSupportSkills,mode:s.damageSupportMode,seconds:s.damageSupportSeconds,
      stacks:s.damageSupportStacks,teleports:s.damageSupportTeleports,necromancerRoll:s.damageNecromancerRoll,
      tileBoost:tile==='skill'?1+s.damageSkillTileBoost/100:1,
      masteryTileBoost:tile==='skill'?1+s.damageMasteryTileBoost/100:1};
    for (const focus of focuses) if (baseline[focus] === 0) warnings.push(
      `${focus === 'energy' ? 'Energy' : focus === 'powerMageEnergy' ? 'Energy + Power Mages' : focus} has a zero baseline. Its support multiplier and rank are undefined; raw outcomes remain available.`);
    const heroes = DATA.heroes.map(hero => {
      const bonuses = {}, effects = [];
      const ownerMilestoneScale = scalesFor({id:hero.id,tile},style,map,s).milestone;
      for (const m of hero.milestones) if (m.global && m.level <= level) {
        const type = canonicalType(m.type, s), value = m.value * ownerMilestoneScale;
        const related = allFocuses.filter(focus => focusStats[focus].includes(type));
        apply(bonuses, type, value);
        effects.push({...m, ownerId: hero.id, ownerIndex: 0, ownerName: hero.name,
          kind: 'milestone', type, rawType: m.type, baseValue: m.value, value,
          scored: related.length > 0, focuses: related});
      }
      if (includeGlobalAscensions) for (const effect of ascensionEffectsFor(hero.id,s,true)) {
        const {type,value,multiplier}=effect;
        const related=type==='Rank Exp Multiplier'?['experience']:type==='Energy Income Multiplier'?['energy','powerMageEnergy']
          :allFocuses.filter(focus=>focusStats[focus].includes(type));
        apply(bonuses,type,value,multiplier);
        effects.push({...effect,ownerId:hero.id,ownerIndex:0,ownerName:hero.name,
          kind:'ascension',rawType:type,unit:'percent',scored:true,focuses:related});
      }
      const overflow = overflowFor(bonuses, s);
      overflow.experience = rankingOverflow('experience', xpReference, bonuses, s.overflowRate);
      overflow.damage = rankingOverflow('damage', damageReference, bonuses, s.overflowRate);
      const metrics = metricsFor(bonuses, s, overflow);
      const xpFactors = {
        rankXp: 1 + (bonuses['Rank Exp'] || 0) / xpReference.rankXp,
        rankMultiplier: bonuses['Rank Exp Multiplier'] ?? 1,
        superAmount: bonuses['Super Exp Amount'] ?? 1,
        ultraAmount: bonuses['Ultra Exp Amount'] ?? 1,
        spillover: overflow.experience / xpReference.spilloverFactor
      };
      metrics.experience = xpFactors.rankXp * xpFactors.rankMultiplier * xpFactors.superAmount * xpFactors.ultraAmount * overflow.experience;
      const damageSupportSkill = damageSupportFor({id:hero.id,tile},supportSettings);
      // Support chance shares the milestone overflow pool. Multiplying a
      // separately scored skill would count that pool and its baseline twice.
      const damageWithSupportBonuses = {...bonuses};
      if(damageSupportSkill) for(const effect of [...damageSupportSkill.activeEffects,...damageSupportSkill.masteryEffects]) {
        if(effect.global) apply(damageWithSupportBonuses,effect.type,effect.value);
      }
      const damageWithSupportOverflow = {...overflow,
        damage: rankingOverflow('damage', damageReference, damageWithSupportBonuses, s.overflowRate)};
      const damageSpilloverGain = overflow.damage / damageReference.spilloverFactor;
      const damageWithSupportSpilloverGain = damageWithSupportOverflow.damage / damageReference.spilloverFactor;
      metrics.damageWithSupport = metricsFor(damageWithSupportBonuses,s,damageWithSupportOverflow).damage;
      const multipliers = Object.fromEntries(rankingFocuses.map(focus => [focus,
        baseline[focus] === 0 ? null : metrics[focus] / baseline[focus]]));
      return {id: hero.id, name: hero.name, milestoneScale:ownerMilestoneScale, bonuses, effects, overflow, metrics, multipliers, ranks: {},xpFactors,
        damageSupportSkill,damageWithSupportBonuses,damageWithSupportOverflow,damageSpilloverGain,damageWithSupportSpilloverGain};
    });
    for (const focus of [...rankingFocuses, 'skillPower']) {
      const score = hero => focus === 'skillPower' ? (hero.bonuses['Skill Power'] ?? 0) : hero.multipliers[focus];
      const sorted = heroes.filter(hero => score(hero) !== null)
        .sort((a,b) => score(b) - score(a));
      let anchor = null, rank = 0;
      sorted.forEach((hero, index) => {
        const value = score(hero);
        // Compare with the start of a tie group to avoid chained near-equalities.
        if (anchor === null || Math.abs(value - anchor) > 1e-10 * Math.max(1, Math.abs(value), Math.abs(anchor))) {
          anchor = value; rank = index + 1;
        }
        hero.ranks[focus] = rank;
      });
      for (const hero of heroes) if (hero.multipliers[focus] === null) hero.ranks[focus] = null;
    }
    return {level, grandMasterCount, tile, milestoneScale, includeGlobalAscensions, baseline, warnings, heroes,damageSupportContext,xpReference,damageReference};
  }
  function veteranShareFor(team,s) {
    const index = experienceSkillOwner(team,'veteran',s);
    if (index < 0) return {index:null,chance:0,superChance:0,superAmount:0};
    const skillTile = s.snowFort && team[index].tile === 'skill';
    const active = skillTile ? 1+s.damageSkillTileBoost/100 : 1;
    const shareChance=Math.round(skillPowerTileBonus(s.experienceVeteranShareChance,5,0.5,active));
    return {index,chance:Math.min(1,shareChance/100),
      superChance:Math.round(skillPowerTileBonus(s.experienceVeteranSuperChance,5,0.2,active)),
      superAmount:s.experienceVeteranSuperAmountPerStack*s.experienceVeteranStacks};
  }
  function experienceSkillOwner(team,id,s) {
    if (!s.experienceSkills) return -1;
    const tiled = s.snowFort ? team.findIndex(slot=>slot.id===id && slot.tile==='skill') : -1;
    return tiled>=0 ? tiled : team.findIndex(slot=>slot.id===id);
  }
  // These skill tooltips have a fixed base plus a value per Skill Power.
  // The tile adds rounded Skill Power levels. Preserve the captured value
  // itself, including a manually entered zero or fractional bonus.
  function skillPowerTileBonus(captured,base,perPower,skillPowerFactor) {
    if (skillPowerFactor===1 || captured<=base) return captured;
    const power=(captured-base)/perPower;
    const tileLevels=Math.round(power*skillPowerFactor)-Math.round(power);
    return captured+perPower*tileLevels;
  }
  // Wave mastery scales the whole Archer mark and uses account Mastery Power.
  function archerMarkedRewardBonus(s,skillPowerFactor) {
    if (!s.experienceArcherBonus || !s.experienceArcherCoverage) return 0;
    const activeFactor=1+skillPowerTileBonus(s.experienceArcherBonus,200,20,skillPowerFactor)/100;
    const waveFactor=1+s.experienceWave*s.experienceArcherMasteryPerWave/100;
    return (activeFactor*waveFactor-1)*s.experienceArcherCoverage;
  }
  function experienceSkillsFor(rawTeam,settings={}) {
    return experienceSkillsForSettings(rawTeam,settingsFor(settings));
  }
  function experienceSkillsForSettings(team,s,details=true) {
    const veteran=veteranShareFor(team,s), skills=[];
    let rewardFactor=1;
    for(const id of ['archer','ballista']) {
      const ownerIndex=experienceSkillOwner(team,id,s);
      if(ownerIndex<0) continue;
      const tiled=s.snowFort && team[ownerIndex].tile==='skill';
      const active=tiled?1+s.damageSkillTileBoost/100:1;
      const values=id==='archer'
        ? [archerMarkedRewardBonus(s,active)]
        : [skillPowerTileBonus(s.experienceBallistaBonus,50,5,active),s.experienceBallistaMasteryPerStack*s.experienceBallistaStacks];
      for(const value of values) rewardFactor*=1+value/100;
      if(details) skills.push({id,ownerIndex,skillName:id==='archer'?'Exp Bonus':'Exp Aura',
        effects:values.map((value,index)=>({type:'Exp Reward Multiplier',value,stage:index?'mastery':'active'}))});
    }
    if(details && veteran.index!==null) skills.push({id:'veteran',ownerIndex:veteran.index,skillName:'Exp Share',effects:[
      {type:'Super Exp Chance',value:veteran.superChance,stage:'active'},
      {type:'Super Exp Amount',value:veteran.superAmount,stage:'mastery'}]});
    return {veteran,rewardFactor,skills};
  }
  function preferredExperienceAttacker(team,leveler,requested) {
    if (requested === 'self') return leveler;
    return selectedIndex(team,requested);
  }
  function experienceTileFactor(slot,s) {
    return s.snowFort && slot?.tile==='experience' ? 1+s.experienceTile/100 : 1;
  }
  function normalizeExperienceReference(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const out = {};
    for (const [key,max] of [['rankBonus',1e100],['superChance',1e9],['ultraChance',1e9],
      ['rankFlat',1e100],['rankMultiplier',1e100],['modeledSuperChance',1e9],['modeledUltraChance',1e9]]) {
      const raw = input[key];
      if (typeof raw !== 'number' && !(typeof raw === 'string' && raw.trim())) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || key === 'rankMultiplier' && value <= 0) return null;
      out[key] = Math.min(max,Math.max(0,value));
    }
    out.label = String(input.label || 'Recorded team').slice(0,200);
    if (Array.isArray(input.team)) {
      try { out.team = cleanTeam(input.team); } catch { return null; }
      out.levelerIndex = selectedIndex(out.team,input.levelerIndex);
      out.attackerIndex = selectedIndex(out.team,input.attackerIndex);
    }
    if (input.styleId==='grandMaster' || experienceStyles.some(style => style.id === input.styleId)) out.styleId = input.styleId;
    if (Number.isInteger(input.grandMasterCount)) out.grandMasterCount = Math.max(0,Math.min(10,input.grandMasterCount));
    return out;
  }
  // These are displayed totals with a deployed reference team. Keep that team's
  // contribution frozen and apply candidate deltas, rather than adding it twice
  // or pretending a negative inferred account baseline is an observed value.
  function captureExperienceReference(rawTeam,settings = {},observed = {},label) {
    let result;
    if (settings.experienceCaptureGrandMaster === true) {
      const s = settingsFor({...settings,experienceReference:null,grandMaster:true}), team = cleanTeam(rawTeam);
      const leveler = selectedIndex(team,s.experienceLeveler);
      if (leveler===null) throw new Error('Choose a hero to level before recording an XP reference.');
      syncLevelingCopies(team,leveler);
      result = evaluateStyle(team,s,false,leveler,{id:'grandMaster',name:'Grand Master',effects:grandMasterEffects});
    } else {
      const displayed = evaluate(rawTeam,settings).experiencePlan;
      if (!displayed) throw new Error('Choose a hero to level before recording an XP reference.');
      const s = settingsFor({...settings,experienceReference:null,
        experienceStyle:displayed.styleId,experienceAttacker:displayed.attackerIndex});
      result = evaluate(rawTeam,s);
    }
    const plan = result.experiencePlan;
    const hero = result.heroes[plan.attackerIndex], b = hero.bonuses;
    const capturedTeam=syncLevelingCopies(cleanTeam(rawTeam),plan.levelerIndex);
    if(settings.experienceCaptureGrandMaster===true) capturedTeam.forEach(slot=>{delete slot.combatStyle;});
    else normalizeSupportCombatStyles(capturedTeam,plan.levelerIndex);
    const reference = normalizeExperienceReference({...observed,
      rankFlat:b['Rank Exp'] || 0,rankMultiplier:b['Rank Exp Multiplier'] ?? 1,
      modeledSuperChance:b['Super Exp Chance'] || 0,modeledUltraChance:b['Ultra Exp Chance'] || 0,
      label:label || `${hero.name} at level ${hero.level}`,team:capturedTeam,
      levelerIndex:plan.levelerIndex,attackerIndex:plan.attackerIndex,styleId:plan.styleId,grandMasterCount:result.style.count});
    if (!reference) throw new Error('Enter finite Rank EXP and Super/Ultra EXP chance totals.');
    return reference;
  }
  function defaultExperienceReference() {
    const team = [['viking','normal'],['archer','normal'],['wizard','synergy'],['veteran','skill'],
      ['ranger','milestone'],['ballista','milestone'],['ballista','milestone'],['veteran','synergy'],
      ['templar','normal'],['veteran','synergy']].map(([id,tile]) => ({id,tile,level:id==='archer'?5000:15000}));
    // Freeze the account ranks used for this in-game measurement independently of new setup defaults.
    return captureExperienceReference(team,{experienceLeveler:1,experienceAttacker:'self',experienceCaptureGrandMaster:true,synergyEvent:true,
      milestoneScale:1.875,defaultMilestoneLevel:5,heroSynergyDefault:25,heroSynergyCrusader:25,heroSynergyWarden:0,requirementReduction:1},
      {rankBonus:66000000,superChance:260,ultraChance:450},
      'Archer 5,000 + Wizard/Viking · 10 Grand Masters · supports 15,000, event on, Veteran 100 stacks assumed');
  }
  function upgradeExperienceReference(input) {
    const reference = normalizeExperienceReference(input);
    if (!reference) return null;
    const oldLabel = 'Archer 1,500 + Wizard/Viking · supports 15,000 · Exp Factory · event on · Veteran 100 stacks';
    const oldNumbers = {rankBonus:66000000,superChance:300,ultraChance:300,rankFlat:153.4326273210939,
      rankMultiplier:1,modeledSuperChance:220.01931970234375,modeledUltraChance:448.81474860039094};
    const expected = defaultExperienceReference();
    const priorNumbers = {rankBonus:66000000,superChance:260,ultraChance:450,rankFlat:168.35401505320328,
      rankMultiplier:1,modeledSuperChance:218.67725167257814,modeledUltraChance:487.46028596043004};
    const previousSkillNumbers = {...priorNumbers,modeledSuperChance:270.27725167257813};
    const matches = numbers => Object.entries(numbers).every(([key,value])=>Math.abs(reference[key]-value)<1e-9);
    const original = reference.label===oldLabel && reference.styleId==='expFactory' && matches(oldNumbers);
    const prior = reference.label===expected.label && reference.styleId==='grandMaster' && reference.grandMasterCount===10
      && (matches(priorNumbers) || matches(previousSkillNumbers));
    if ((!original && !prior) || reference.levelerIndex!==1 || reference.attackerIndex!==1) return reference;
    const sameTeam = reference.team?.length===expected.team.length && reference.team.every((slot,i)=>{
      const other=expected.team[i];
      return slot.id===other.id && slot.tile===other.tile && slot.level===(i===1?(original?1500:5000):15000) && !slot.locked && !slot.combatStyle;
    });
    return sameTeam ? expected : reference;
  }
  function experienceChanceFor(superAdded,ultraAdded,s) {
    const ref = s.experienceReference;
    const totalSuperChance = ref ? Math.max(0,ref.superChance + (superAdded - ref.modeledSuperChance)) : 100 + superAdded;
    const totalUltraChance = ref ? Math.max(0,ref.ultraChance + (ultraAdded - ref.modeledUltraChance)) : 100 + ultraAdded;
    const excessPoints = Math.max(0,totalSuperChance-100) + Math.max(0,totalUltraChance-100);
    const baselineExcess = ref ? Math.max(0,ref.superChance-100) + Math.max(0,ref.ultraChance-100) : 0;
    return {totalSuperChance,totalUltraChance,excessPoints,belowCap:totalSuperChance<100-1e-9 || totalUltraChance<100-1e-9,
      factor:1+(s.baseOverflow+s.overflowRate*excessPoints)/100,
      baselineOverflowFactor:1+(s.baseOverflow+s.overflowRate*baselineExcess)/100};
  }
  // Hero progression and combat style belong to the hero identity, while the
  // selected recipient, placements and locks still belong to individual slots.
  function syncLevelingCopies(team,leveler) {
    if (leveler === null || !team[leveler]) return team;
    const target = team[leveler];
    for (const slot of team) if (slot.id === target.id) slot.level = target.level;
    return team;
  }
  function evaluate(rawTeam, input = {}, compact = false) {
    const team = cleanTeam(rawTeam), s = settingsFor(input);
    const leveler = selectedIndex(team,s.experienceLeveler);
    if (leveler === null) return evaluateStyle(team,s,compact,null,null);
    syncLevelingCopies(team,leveler);
    normalizeSupportCombatStyles(team,leveler);
    const styles = allowedExperienceStyles(team[leveler].level,s.experienceStyle);
    let best;
    for (const style of styles) {
      const result = evaluateStyle(team,s,compact,leveler,style);
      if (!best || result.metrics.experience > best.metrics.experience) best = result;
    }
    return best;
  }
  function evaluateStyle(team,s,compact,leveler,levelerStyle) {
    const rosterCounts = countsFor(team);
    const levelerId = leveler === null ? null : team[leveler].id;
    const levelerCount = rosterCounts[levelerId] || 0;
    const allGrandMasters = levelerStyle?.id==='grandMaster';
    const supportContext=leveler===null?null:supportCombatContext(team,s,leveler);
    const style = styleFor(s, allGrandMasters||leveler===null?team.length:supportContext.gmCount,
      allGrandMasters?null:levelerStyle,allGrandMasters?0:levelerCount,allGrandMasters?{}:supportContext?.counts), map=mapFor(s);
    const tier = leveler === null ? s.maxTier : levelerTier(team[leveler].level,s.maxTier);
    const upperTierCounts = {...rosterCounts};
    if (leveler !== null) upperTierCounts[levelerId] = 0;
    const global = {synergy: {}, milestone: {}, style: {}, map:{}, placement:{}, skill:{}, ascension:{}, total: {}};
    const locals = team.map(() => ({synergy: {}, milestone: {}, style: {}, map:{}, placement:{}, skill:{}, ascension:{}}));
    const effects = [], counts = {synergies: 0, milestones: 0, styles: 0, maps:0, placements:0, skills:0, ascensions:0};
    function add(slot, index, hero, effect, kind) {
      const type = canonicalType(effect.type, s);
      const scales=scalesFor(slot,style,map,s);
      const value = kind === 'synergy' ? Math.round(effect.value * tierScale(effect.tier,scales))
        : kind === 'milestone' ? effect.value * scales.milestone : effect.value;
      apply(effect.global ? global[kind] : locals[index][kind], type, value, effect.multiplier);
      counts[{synergy:'synergies',milestone:'milestones',style:'styles',map:'maps',placement:'placements',skill:'skills',ascension:'ascensions'}[kind]]++;
      if (!compact) effects.push({...effect, ownerId: slot.id, ownerIndex: index, ownerName: hero.name,
        kind, type, rawType: effect.type, baseValue: effect.value, value,
        partnersNeeded: kind === 'synergy' ? synergyPartnersNeeded(slot.id,effect,s) : undefined});
    }
    if(s.snowFort) for(const effect of [
      {type:'Tier 5 + 6 Synergy',value:s.mapT56}, {type:'Tier 7 Synergy',value:s.mapT7},
      {type:'Mastery Skill Power',value:s.mapMastery}, {type:'Attack Speed',value:s.mapAttackSpeed}
    ]) add({id:null},null,{name:'Snow Fort'},{...effect,global:true,source:'User-provided Snow Fort screenshot'},'map');
    team.forEach((slot, index) => {
      const hero = heroMap.get(slot.id);
      for(const effect of ascensionEffectsFor(slot.id,s)) add(slot,index,hero,effect,'ascension');
      if(s.snowFort && slot.tile!=='normal') add(slot,index,hero,{
        type:{milestone:'Milestone Bonus',synergy:'Synergy Bonus',skill:'Skill Power (tile)',killGold:'Kill Gold',damage:'Damage',experience:'Own Kill Exp Multiplier'}[slot.tile],
        value:slot.tile==='killGold'?s.goldKillGoldTile:slot.tile==='damage'?s.damageTile:slot.tile==='experience'?s.experienceTile:slot.tile==='synergy'?10:20,
        global:false,source:slot.tile==='experience'?'User-tested XP tile on the killer. Veteran shares the boosted kill reward.':'User-provided Snow Fort placements'
      },'placement');
      const supportStyleId=allGrandMasters?'grandMaster':supportContext?.stylesById[slot.id]||'grandMaster';
      const combatStyle = slot.id === levelerId ? levelerStyle : supportStyleId==='grandMaster'
        ? s.grandMaster ? {name:'Grand Master',effects:grandMasterEffects} : null
        : experienceStyles.find(style=>style.id===supportStyleId);
      if (combatStyle) for (const effect of combatStyle.effects) add(slot,index,hero,
        {...effect,styleName:combatStyle.name,source:'User-provided combat style screenshot'},'style');
      if (leveler !== null && slot.level >= 1000) add(slot,index,hero,
        {type:'Boss Exp',value:100,global:false,level:1000,source:'Personal level 1,000 boss-kill bonus'},'skill');
      for (const m of hero.milestones) if (m.level <= slot.level) add(slot, index, hero, m, 'milestone');
      for (const synergy of hero.synergies) {
        if (synergy.tier > s.maxTier || (slot.id === levelerId && synergy.tier > tier)) continue;
        const eligible = synergy.tier > tier ? upperTierCounts : rosterCounts;
        if (synergyActive(slot.id,synergy,eligible,s)) add(slot,index,hero,synergy,'synergy');
      }
    });
    if (style.count || levelerStyle) {
      // Milestone and synergy strength have independent Grand Master stacking rules.
      global.style['Milestone Bonus'] = style.bonusScale;
      global.style['Synergy Bonus'] = style.synergyBonusScale;
    }
    const experienceSkills=experienceSkillsForSettings(team,s), veteran=experienceSkills.veteran;
    for(const skill of experienceSkills.skills) for(const effect of skill.effects) {
      if(effect.value) add(team[skill.ownerIndex],skill.ownerIndex,heroMap.get(skill.id),{
        ...effect,global:true,source:'Captured XP skill without a tile; one provider per named skill; placement boost applied once',
        skillId:skill.id,skillName:skill.skillName
      },'skill');
    }
    const goldSkills=goldSkillsFor(team,s);
    for(const skill of goldSkills.skills) for(const [key,type] of [['killGold','Kill Gold'],['superGoldChance','Super Gold Chance'],['superGoldAmount','Super Gold Amount']]) {
      if(!skill[key]) continue;
      add(team[skill.ownerIndex],skill.ownerIndex,heroMap.get(skill.id),{
        type,value:skill[key],global:true,source:'User-provided active skill bonus without a tile; +20% skill tile applied once',
        skillId:skill.id,tileBoost:skill.tileBoost
      },'skill');
    }
    const damageSupportSkills=damageSupportsFor(team,s);
    for(const skill of damageSupportSkills.skills) for(const effect of [...skill.activeEffects,...skill.masteryEffects]) add(team[skill.ownerIndex],skill.ownerIndex,heroMap.get(skill.id),{
      ...effect,source:'Captured global Damage support; first deployed copy only; placement boost applied once',
      skillId:skill.id,skillName:skill.skillName,tileBoost:effect.stage==='mastery'?skill.masteryTileBoost:skill.tileBoost
    },'skill');
    const damageSkills=team.map(slot=>damageSkillFor(slot,s));
    const warlock=damageWarlockActive(s,team);
    damageSkills.forEach((skill,index)=>{
      for(const effect of [...skill.activeEffects,...skill.masteryEffects]) add(team[index],index,heroMap.get(team[index].id),{
        ...effect,source:'User-captured attacker skill during its active window; placement boost applied once',
        skillId:skill.id,skillName:skill.name,tileBoost:effect.stage==='mastery'?skill.masteryTileBoost:skill.tileBoost
      },'skill');
    });
    const passiveGlobal = [global.synergy,global.milestone,global.style,global.map,global.placement,global.ascension].reduce(merge,{});
    global.total = merge(passiveGlobal,global.skill);
    const passiveGlobalKillGold=passiveGlobal['Kill Gold']??1;
    const heroes = team.map((slot, index) => {
      const passiveLocal=Object.entries(locals[index]).filter(([kind])=>kind!=='skill').map(([,bucket])=>bucket).reduce(merge,{});
      const passiveBonuses=merge(global.total,passiveLocal);
      const passiveScore=metricsFor(passiveBonuses,s,overflowFor(passiveBonuses,s)).damage;
      const local = Object.values(locals[index]).reduce(merge,{});
      const bonuses = merge(global.total, local);
      // Tile strength adds to the Grand Master pool; these are explanatory metadata.
      if(s.snowFort && slot.tile==='milestone') bonuses['Milestone Bonus']=style.bonusScale+0.2;
      if(s.snowFort && slot.tile==='synergy') bonuses['Synergy Bonus']=style.synergyBonusScale+0.1;
      const overflow = overflowFor(bonuses, s, leveler !== null, damageSkills[index].chanceRolls);
      const metrics=metricsFor(bonuses,s,overflow,leveler === null ? 100 : s.experienceBaseRankXp,
        leveler === null ? null : s.experienceReference);
      if(damageSkills[index].castFactor!==undefined) metrics.damage*=damageCastMultiplier(damageSkills[index],
        bonuses['Attack Speed']??1,(bonuses['Triple Shot Damage']??1)*singleTargetSplash(bonuses['Splash Damage']),warlock,true);
      if (leveler !== null) metrics.experience *= bonuses['Boss Exp'] ?? 1;
      const tileFactor=experienceTileFactor(slot,s);
      metrics.experience*=tileFactor;
      const experienceKillScore=metrics.experience;
      const mimic=s.goldMimicFarming ? mimicKillPayout(s,bonuses['Kill Gold']??1,bonuses['Boss Gold']??1,
        bonuses['Super Gold Amount']??1,bonuses['Ultra Gold Amount']??1,
        bonuses['Super Gold Chance']??0,bonuses['Ultra Gold Chance']??0,true) : null;
      const goldSkill=goldSkillFor(slot,s,passiveGlobalKillGold*(passiveLocal['Kill Gold']??1),metrics.gold,mimic);
      metrics.gold=goldSkill.totalScore;
      const damageSkill={...damageSkills[index],passiveScore,activeScore:metrics.damage,score:metrics.damage};
      return {id: slot.id, index, name: heroMap.get(slot.id).name, level: slot.level, tile:slot.tile, bonuses,
        effectiveScales:scalesFor(slot,style,map,s),
        local: locals[index], overflow, metrics, damageSkill, goldSkill, experienceKillScore, experienceTileFactor:tileFactor};
    });
    const metrics = {energy: 0, powerMageEnergy: 0, gold: 0, experience: 0, damage: 0};
    for (const h of heroes) for (const key of Object.keys(metrics)) metrics[key] += h.metrics[key] / heroes.length;
    let experiencePlan = null;
    if (leveler !== null) {
      const fixed = preferredExperienceAttacker(team,leveler,s.experienceAttacker);
      let attacker = fixed ?? leveler;
      const payout = index => heroes[index].experienceKillScore*(index===leveler?1:veteran.chance);
      if (fixed === null && veteran.chance > 0) {
        for (const h of heroes) if (payout(h.index)>payout(attacker)) attacker=h.index;
      }
      const shared = attacker !== leveler, killScore = heroes[attacker].experienceKillScore;
      experiencePlan = {levelerIndex:leveler,levelerCount,attackerIndex:attacker,styleId:levelerStyle.id,shared,tier,
        baseRankXp:s.experienceBaseRankXp,baseOverflow:s.baseOverflow,overflowRate:s.overflowRate,
        reference:s.experienceReference,baselineOverflowFactor:experienceChanceFor(0,0,s).baselineOverflowFactor,
        veteranIndex:veteran.index,shareChance:veteran.chance,killScore,attackerTileFactor:heroes[attacker].experienceTileFactor,score:payout(attacker),
        supportStyles:allGrandMasters?Object.fromEntries(Object.keys(supportContext.stylesById).map(id=>[id,'grandMaster'])):supportContext.stylesById};
    }
    const attackerIndex = experiencePlan?.attackerIndex ?? scoredIndex(heroes, s.damageHero, 'damage');
    const goldIndex = experiencePlan?.attackerIndex ?? scoredIndex(heroes, s.goldHero, 'gold');
    const experienceIndex = experiencePlan?.attackerIndex ?? selectedIndex(heroes, s.experienceHero);
    if (attackerIndex !== null) metrics.damage = heroes[attackerIndex].metrics.damage;
    if (goldIndex !== null) metrics.gold = heroes[goldIndex].metrics.gold;
    if (experienceIndex !== null) metrics.experience = experiencePlan?.score ?? heroes[experienceIndex].metrics.experience;
    const tagCasters={};
    for(const [focus,tag] of Object.entries(tagFocuses)) {
      tagCasters[focus]=strongestTagCaster(heroes,tag,s,global,style);
      metrics[focus]=tagCasters[focus]?.score??0;
    }
    return {metrics, global, heroes, effects, counts, style, map, tagCasters, goldSkills, experienceSkills, damageSupportSkills, damageSkills:heroes.map(hero=>hero.damageSkill), attackerIndex, goldIndex, experienceIndex, experiencePlan, overflow: overflowFor(global.total, s, leveler !== null)};
  }

  // Compare kills on the same boss with the evaluated lineup, placements and
  // leveler style. Reuse the attacker's actual payout before applying Exp Share.
  function compareExperienceAttackers(evaluation) {
    const {experiencePlan:plan,global,heroes,effects} = evaluation;
    if (!plan) return null;
    const isChance = type => chances.experience.includes(type);
    const personal = heroes.map(() => ({bossSources:[],chanceSources:[]}));
    for (const effect of effects) {
      if (effect.global || (effect.type !== 'Boss Exp' && !isChance(effect.type))) continue;
      const {kind,type,value,styleName,level,tier,source} = effect;
      const sources = type === 'Boss Exp' ? personal[effect.ownerIndex].bossSources : personal[effect.ownerIndex].chanceSources;
      sources.push({kind,type,value,styleName,level,tier,source});
    }
    const globalBossFactor = global.total['Boss Exp'] ?? 1;
    const globalSuperChance = global.total['Super Exp Chance'] || 0, globalUltraChance = global.total['Ultra Exp Chance'] || 0;
    const rows = heroes.map(hero => {
      const {index,id,name,level,bonuses} = hero, shared = index !== plan.levelerIndex;
      const rankFactor = experienceRankFactor(bonuses,plan.baseRankXp,plan.reference);
      const bossFactor = bonuses['Boss Exp'] ?? 1, superAmountFactor = bonuses['Super Exp Amount'] ?? 1;
      const ultraAmountFactor = bonuses['Ultra Exp Amount'] ?? 1;
      const rewardFactor = bonuses['Exp Reward Multiplier'] ?? 1;
      const superChance = bonuses['Super Exp Chance'] || 0, ultraChance = bonuses['Ultra Exp Chance'] || 0;
      const chance = experienceChanceFor(superChance,ultraChance,{...plan,experienceReference:plan.reference});
      const killScore = hero.experienceKillScore;
      const attackerTileFactor=hero.experienceTileFactor;
      return {index,id,name,level,shared,eligible:!shared || plan.shareChance>0,killScore,
        score:killScore*(shared?plan.shareChance:1),attackerTileFactor,rankFactor,bossFactor,superAmountFactor,ultraAmountFactor,rewardFactor,
        beforeSpillover:rankFactor*bossFactor*superAmountFactor*ultraAmountFactor*rewardFactor*attackerTileFactor,
        overflowFactor:hero.overflow.experience,personalBossFactor:bossFactor/globalBossFactor,superChance,ultraChance,
        totalSuperChance:chance.totalSuperChance,totalUltraChance:chance.totalUltraChance,excessPoints:chance.excessPoints,belowCap:chance.belowCap,
        personalSuperChance:superChance-globalSuperChance,personalUltraChance:ultraChance-globalUltraChance,...personal[index]};
    });
    return {levelerIndex:plan.levelerIndex,selectedIndex:plan.attackerIndex,styleId:plan.styleId,shareChance:plan.shareChance,
      baseOverflow:plan.baseOverflow,overflowRate:plan.overflowRate,reference:plan.reference,baselineOverflowFactor:plan.baselineOverflowFactor,
      globalBossFactor,globalSuperChance,globalUltraChance,rows};
  }

  // Keep the two chance totals separate: only each tier's excess above 100%
  // enters spillover. Amount and percentage rank/boss bonuses share a product.
  function xpChannel(type) {
    if (type === 'Rank Exp') return 0;
    if (type === 'Super Exp Chance') return 2;
    if (type === 'Ultra Exp Chance') return 3;
    if (['Super Exp Amount','Ultra Exp Amount','Boss Exp','Rank Exp Multiplier','Exp Reward Multiplier'].includes(type)) return 1;
    return -1;
  }
  function accumulateXp(bucket,channel,value) {
    if (channel === 1) bucket[1] *= 1+value/100;
    else bucket[channel] += value;
  }
  function makeLevelingScorer(s,leveler) {
    const map = mapFor(s);
    const reference = s.experienceReference, observedRank = reference ? 100+reference.rankBonus : 0;
    const records = new Map(DATA.heroes.map(hero => {
      const prepare = records => records.map(effect => ({...effect,channel:xpChannel(canonicalType(effect.type,s))}))
        .filter(effect => effect.channel >= 0);
      return [hero.id,{milestones:prepare(hero.milestones),synergies:prepare(hero.synergies.filter(effect => effect.tier <= s.maxTier)),
        rankExpFactor:ascensionFactors(hero.id,s).globalRankExp}];
    }));
    let previousLevel = -1, previousSize = -1, previousLevelerId, tier, profilesByCount, previousIds, activeLinks;

    function compileStyle(style,size,levelerId,level,levelerCount,supportContext) {
      const strength = styleFor(s,supportContext.gmCount,style,levelerCount,supportContext.counts);
      const supportRankFactor=Math.pow(1.05,supportContext.counts.tycoon)*Math.pow(1.12,supportContext.counts.magnate);
      const profilesBySlot = Array.from({length:size},() => new Map());
      function slotProfile(slot,index) {
        const isLeveling = slot.id === levelerId, effectiveLevel = isLeveling ? level : slot.level;
        const cache = profilesBySlot[index];
        let byTile = cache.get(slot.id);
        if (!byTile) { byTile = Object.create(null); cache.set(slot.id,byTile); }
        const cached = byTile[slot.tile];
        if (cached && cached.level === effectiveLevel) return cached;
        const globals = [0,1,0,0], personal = [0,effectiveLevel>=1000?2:1,0,0];
        const scales = scalesFor(slot,strength,map,s), hero = records.get(slot.id);
        globals[1]=hero.rankExpFactor;
        for (const m of hero.milestones) if (m.level <= effectiveLevel) accumulateXp(m.global?globals:personal,m.channel,m.value*scales.milestone);
        if (isLeveling) for (const effect of style.effects) {
          const channel = xpChannel(effect.type);
          if (channel !== -1) accumulateXp(effect.global?globals:personal,channel,effect.value);
        }
        const values = hero.synergies.map(effect => Math.round(effect.value*tierScale(effect.tier,scales)));
        const profile = {globals,personal,values,level:effectiveLevel};
        byTile[slot.tile] = profile;
        return profile;
      }
      const locals = Array.from({length:size},() => [0,1,0,0]);
      return function scoreStyle(team,links,skills,fixed,placement) {
        const veteran=skills.veteran;
        const globals = [0,(1+veteran.superAmount/100)*skills.rewardFactor*supportRankFactor,veteran.superChance,0];
        for (let i=0; i<team.length; i++) {
          const p = slotProfile(team[i],i), local = locals[i];
          globals[0] += p.globals[0]; globals[1] *= p.globals[1]; globals[2] += p.globals[2]; globals[3] += p.globals[3];
          local[0] = p.personal[0]; local[1] = p.personal[1]; local[2] = p.personal[2]; local[3] = p.personal[3];
          for (const link of links[i]) accumulateXp(link.global?globals:local,link.channel,p.values[link.ordinal]);
        }
        let best = 0;
        for (let i=0; i<team.length; i++) {
          if ((fixed !== null && i !== fixed) || (i !== leveler && !veteran.chance)) continue;
          const local = locals[i];
          const superAdded = globals[2]+local[2], ultraAdded = globals[3]+local[3];
          const excess = reference ? Math.max(0,reference.superChance+(superAdded-reference.modeledSuperChance)-100)
            + Math.max(0,reference.ultraChance+(ultraAdded-reference.modeledUltraChance)-100) : superAdded+ultraAdded;
          const spillover = 1+(s.baseOverflow+s.overflowRate*excess)/100;
          const rank = reference ? Math.max(0,observedRank/reference.rankMultiplier+(globals[0]+local[0]-reference.rankFlat))/observedRank
            : 1+(globals[0]+local[0])/s.experienceBaseRankXp;
          // During a placement search the single XP tile can go to any free
          // slot. Only the killer's tile enters its payout, so these choices
          // share one pass over the roster, even with automatic attackers.
          const canPlace = placement && team[i].tile==='normal' && s.experienceTile>0;
          const tileFactor = canPlace ? 1+s.experienceTile/100 : experienceTileFactor(team[i],s);
          const score = rank*globals[1]*local[1]*spillover*tileFactor*(i===leveler?1:veteran.chance);
          best = Math.max(best,score);
          if (placement && score>placement.score) {placement.score=score;placement.index=canPlace?i:null;}
        }
        return best;
      };
    }
    return function score(team,placement) {
      if (!team[leveler]) return 0;
      const levelerId = team[leveler].id;
      const levelerCount = team.reduce((count,slot) => count + (slot.id === levelerId ? 1 : 0),0);
      const supportContext=supportCombatContext(team,s,leveler);
      const profileKey=[levelerCount,supportContext.gmCount,supportContext.counts.tycoon,supportContext.counts.magnate].join(':');
      if (previousLevel !== team[leveler].level || previousSize !== team.length || previousLevelerId !== levelerId) {
        previousLevel = team[leveler].level; previousSize = team.length;
        previousLevelerId = levelerId;
        tier = levelerTier(previousLevel,s.maxTier);
        profilesByCount = new Map();
        previousIds = null;
      }
      if (!profilesByCount.has(profileKey)) profilesByCount.set(profileKey,
        allowedExperienceStyles(previousLevel,s.experienceStyle).map(style => compileStyle(style,team.length,levelerId,previousLevel,levelerCount,supportContext)));
      const profiles = profilesByCount.get(profileKey);
      // Placement permutations preserve all partner requirements.
      if (!previousIds || team.some((slot,i) => slot.id !== previousIds[i])) {
        previousIds = team.map(slot => slot.id);
        const counts = countsFor(team), upperCounts = {...counts};
        upperCounts[levelerId] = 0;
        activeLinks = team.map((slot,i) => {
          const links = [];
          records.get(slot.id).synergies.forEach((effect,ordinal) => {
            if (slot.id === levelerId && effect.tier > tier) return;
            if (synergyActive(slot.id,effect,effect.tier>tier?upperCounts:counts,s))
              links.push({ordinal,channel:effect.channel,global:effect.global});
          });
          return links;
        });
      }
      const skills = experienceSkillsForSettings(team,s,false), fixed = preferredExperienceAttacker(team,leveler,s.experienceAttacker);
      let best = 0;
      for (const scoreStyle of profiles) best = Math.max(best,scoreStyle(team,activeLinks,skills,fixed,placement));
      return best;
    };
  }
  // A compiled objective uses only the focused stats; the formulas match evaluate.
  function makeScorer(settings, focus, template) {
    const s = settingsFor(settings);
    const leveler = selectedIndex(template,s.experienceLeveler);
    if (leveler !== null) return focus === 'experience' ? makeLevelingScorer(s,leveler) : team => evaluate(team,s,true).metrics[focus];
    const style = styleFor(s, template.length), map=mapFor(s);
    const names = focusStats[focus];
    const tag=tagFocuses[focus],tagId=tag?.heroId,basePower=tag?s[tag.baseSetting]:0;
    const grandMasterPower=tagId?1.05**style.count:1;
    const modes = names.map(n => statMode(n) === 'multiply');
    const base = modes.map(m => m ? 1 : 0);
    const globalFactorKey={damage:'globalDamage',gold:'globalKillGold',experience:'globalRankExp',energy:'globalEnergyIncome',powerMageEnergy:'globalEnergyIncome'}[focus];
    const prepared = DATA.heroes.map(hero => {
      const ascension=ascensionFactors(hero.id,s);
      return {id:hero.id, globalFactor:ascension[globalFactorKey]??1, personalFactor:focus==='gold'?ascension.killGold:focus==='damage'?ascension.damage:1,
        milestones:hero.milestones.map(m => ({...m,stat:names.indexOf(canonicalType(m.type,s))})).filter(m => m.stat>=0),
        synergies:hero.synergies.filter(e => e.tier<=s.maxTier).map(e => ({...e,stat:names.indexOf(canonicalType(e.type,s))})).filter(e => e.stat>=0)
      };
    });
    const preparedMap = new Map(prepared.map(h => [h.id, h]));
    const damageProfiles=new Map(DATA.heroes.map(hero=>[hero.id,{
      normal:damageSkillFor({id:hero.id,tile:'normal'},s),skill:damageSkillFor({id:hero.id,tile:'skill'},s)
    }]));
    const supportProfiles=new Map(damageSupportDefinitions.map(def=>[def.id,{
      normal:damageSupportFor({id:def.id,tile:'normal'},s),skill:damageSupportFor({id:def.id,tile:'skill'},s)
    }]));
    const crusaderMultipliers={normal:crusaderAttackMultiplier({id:'crusader',tile:'normal'},s),skill:crusaderAttackMultiplier({id:'crusader',tile:'skill'},s)};
    return function score(team,placement) {
      const count = countsFor(team), globals = base.slice(), locals = team.map(() => base.slice());
      let goldSupportMultiplier=1, globalAscensionFactor=1;
      const xpSkills=focus==='experience'?experienceSkillsForSettings(team,s,false):null;
      if(xpSkills) {
        globals[1]*=1+xpSkills.veteran.superAmount/100;
        globals[3]+=xpSkills.veteran.superChance;
      }
      if (s.grandMaster) {
        if (focus === 'damage' || focus === 'gold') globals[0] = Math.pow(2.5,team.length);
        if (focus === 'damage') for (const local of locals) local[1] = 0.1;
      }
      if(focus==='damage') {
        globals[1]*=map.attackSpeed;
        const seen=new Set();
        for(const slot of team) {
          if(seen.has(slot.id)) continue;
          seen.add(slot.id);
          const profile=supportProfiles.get(slot.id)?.[slot.tile==='skill'?'skill':'normal'];
          if(profile) applyDamageSupportProfile(globals,profile);
        }
      }
      if(focus==='gold') {
        const skills=goldSkillsFor(team,s);
        goldSupportMultiplier=skills.killGoldMultiplier;
        globals[0]*=skills.killGoldMultiplier;
        globals[1]*=skills.superGoldAmountMultiplier;
        globals[4]+=skills.superGoldChance;
      }
      const applyFast = (effect, i, value=effect.value) => {
        const b = effect.global ? globals : locals[i], k = effect.stat;
        if (modes[k]) b[k] *= 1 + value / 100; else b[k] += value;
      };
      for (let i = 0; i < team.length; i++) {
        const hero = preparedMap.get(team[i].id);
        globalAscensionFactor*=hero.globalFactor;
        if(focus==='gold'||focus==='damage') locals[i][0]*=hero.personalFactor;
        if(focus==='gold'&&map.enabled&&team[i].tile==='killGold') locals[i][0]*=1+s.goldKillGoldTile/100;
        if(focus==='damage'&&map.enabled&&team[i].tile==='damage') locals[i][0]*=1+s.damageTile/100;
        const scales=scalesFor(team[i],style,map,s);
        for (const m of hero.milestones) if (m.level <= team[i].level) applyFast(m, i, m.value*scales.milestone);
        for (const e of hero.synergies) if (synergyActive(hero.id, e, count, s)) applyFast(e, i,Math.round(e.value*tierScale(e.tier,scales)));
      }
      if(tagId) {
        let strongest=0;
        for(const [i,slot] of team.entries()) if(slot.id===tagId) {
          const tileFactor=map.enabled&&slot.tile==='skill'?1.2:1;
          strongest=Math.max(strongest,effectiveSkillPower(basePower,globals[0]+locals[i][0],grandMasterPower,tileFactor));
        }
        return strongest;
      }
      let sum = 0, best = -Infinity, tileGain = 0;
      const chooseAttacker = (focus === 'damage' || focus === 'gold') && focusTarget(s, focus) === 'best';
      const carry = selectedIndex(team, focusTarget(s, focus));
      for (let i = 0; i < team.length; i++) {
        if (carry !== null && i !== carry) continue;
        const b = globals.map((v,k) => modes[k] ? v * locals[i][k] : v + locals[i][k]);
        const damageProfile=focus==='damage'?damageProfiles.get(team[i].id)[team[i].tile==='skill'?'skill':'normal']:null;
        if(damageProfile) {
          const splash=singleTargetSplash(b[splashStat]+damageProfile.splashPercent);
          b[0]*=damageProfile.nonSplashFactor*splash;
          if(damageProfile.castFactor!==undefined) b[0]*=damageCastMultiplier(damageProfile,b[speedStat],b[volleyStat]*splash,damageWarlockActive(s,team));
          chances.damage.forEach((type,k)=>{b[damageChanceStart+k]+=damageProfile.chanceByType[type]||0;});
        }
        const chanceStart = focus === 'damage' ? damageChanceStart : focus === 'gold' || focus === 'powerMageEnergy' ? 4 : 3;
        const overflow = focus==='gold'||focus==='damage' ? chanceFactorFor(b.slice(chanceStart),s,focus,damageProfile?.chanceRolls)
          : 1 + (s.baseOverflow + s.overflowRate * b.slice(chanceStart).reduce((a,v) => a+v, 0)) / 100;
        let value = focus === 'damage' ? b.slice(0,damageFactors.length).reduce((product,value)=>product*value,1)
          : focus === 'gold' ? b[0]*b[1]*b[2]*b[3]
          : focus === 'experience' ? (1+b[0]/100)*b[1]*b[2]*xpSkills.rewardFactor*experienceTileFactor(team[i],s) : (s.baseEnergy+b[0])*b[1]*b[2];
        if (focus === 'powerMageEnergy') value *= b[3];
        const attackGold=focus==='gold'&&team[i].id==='crusader'?b[0]/goldSupportMultiplier*crusaderMultipliers[team[i].tile==='skill'?'skill':'normal']:0;
        const total=(focus==='gold'&&s.goldMimicFarming
          ? mimicKillPayout(s,b[0],b[3],b[1],b[2],b[4],b[5]) : value*overflow)+attackGold;
        sum += total;
        // The team-average XP objective can give the one tile to the free
        // slot with the largest individual gain. A fixed killer is the sole
        // eligible slot when the caller has selected one.
        if (placement && team[i].tile==='normal' && total*s.experienceTile/100>tileGain) {
          tileGain=total*s.experienceTile/100;placement.index=i;
        }
        if (chooseAttacker) best = Math.max(best, total);
      }
      if (chooseAttacker) return team.length ? best*globalAscensionFactor : 0;
      return (sum+tileGain) / (carry === null ? team.length || 1 : 1) * globalAscensionFactor;
    };
  }
  const copyTeam = team => team.map(slot=>({...slot}));
  function combinations(items, count) {
    const result=[];
    function visit(start,picked) {
      if(picked.length===count) {result.push(picked.slice());return;}
      for(let i=start;i<=items.length-(count-picked.length);i++) {picked.push(items[i]);visit(i+1,picked);picked.pop();}
    }
    visit(0,[]); return result;
  }
  function assignSkillTiles(team,settings) {
    const out=copyTeam(team);
    const eligible=out.map((s,i)=>s.tile==='normal'||s.tile==='skill'?i:-1).filter(i=>i>=0);
    eligible.forEach(index=>{out[index].tile='normal';});
    const result=evaluate(out,settings),score=makeScorer(settings,'experience',out);
    let best=out,bestValues=[score(out),0,0,0];
    // Named abilities do not stack. Preserve primary placements and use actual
    // XP gains before the Skill Power / damage proxy for other active skills.
    for(let count=1;count<=Math.min(3,eligible.length);count++) for(const indices of combinations(eligible,count)) {
      if(new Set(indices.map(index=>out[index].id)).size!==count) continue;
      const candidate=copyTeam(out);
      indices.forEach(index=>{candidate[index].tile='skill';});
      const values=[score(candidate),indices.reduce((sum,index)=>sum+(result.heroes[index].bonuses['Skill Power']||0),0),
        indices.reduce((sum,index)=>sum+result.heroes[index].metrics.damage,0),count];
      for(let i=0;i<values.length;i++) {
        const tolerance=1e-12*Math.max(1,Math.abs(values[i]),Math.abs(bestValues[i]));
        if(values[i]>bestValues[i]+tolerance) {best=candidate;bestValues=values;break;}
        if(values[i]<bestValues[i]-tolerance) break;
      }
    }
    return best;
  }
  function suggestionResult(team, settings, focus, evaluated, skillMethod) {
    const leveler=selectedIndex(team,settings.experienceLeveler);
    team = syncLevelingCopies(copyTeam(team),leveler);
    if(leveler!==null) normalizeSupportCombatStyles(team,leveler);
    const result = evaluate(team, settings);
    return {team, score: result.metrics[focus], evaluated, skillMethod,
      attackerIndex: result.attackerIndex, goldIndex: result.goldIndex, experienceIndex: result.experienceIndex,
      ...(result.experiencePlan ? {experiencePlan:result.experiencePlan,attackerComparison:compareExperienceAttackers(result)} : {})};
  }
  function goldSkillMethod(s) {
    return s.goldMimicFarming
      ? 'Gold tiles maximize expected gold per Mimic encounter, including the kill drop and any configured Crusader attack gold.'
      : 'Gold tiles compare attacker Kill Gold, milestone and synergy benefits, enabled support skills, and Crusader’s separate instant attack payout. Each deployed named support skill is counted once; a skill tile multiplies captured active and mastery bonuses by 1.20.';
  }
  function tagSkillMethod(focus) {
    const name=heroMap.get(tagFocuses[focus].heroId).name;
    return `The score is the highest Skill Power on a deployed ${name}. Placements compare the caster’s Skill Power tile with milestone and synergy boosts across the team.`;
  }
  // Fixed-roster placement searches reuse per-owner contributions. Rechecking
  // every synergy for every assignment would make the exact Gold search slow.
  function makeGoldPlacementScorer(team,s) {
    const names=focusStats.gold,modes=names.map(type=>statMode(type)==='multiply');
    const base=()=>modes.map(mode=>mode?1:0);
    const globalBase=base(), normal=team.map(slot=>({...slot,tile:'normal'}));
    const context=evaluate(normal,s),parts=team.map(()=>Object.fromEntries(['normal','milestone','synergy'].map(tile=>[tile,{global:base(),local:base()}])));
    const crusaderMultipliers={normal:crusaderAttackMultiplier({id:'crusader',tile:'normal'},s),skill:crusaderAttackMultiplier({id:'crusader',tile:'skill'},s)};
    function put(bucket,index,value,multiplier) {if(modes[index]) bucket[index]*=multiplier??(1+value/100);else bucket[index]+=value;}
    for(const effect of context.effects) {
      const stat=names.indexOf(effect.type);
      if(stat<0||effect.kind==='skill'||effect.kind==='placement') continue;
      if(effect.ownerIndex===null) {put(globalBase,stat,effect.value);continue;}
      const index=effect.ownerIndex;
      for(const tile of ['normal','milestone','synergy']) {
        const scales=scalesFor({...team[index],tile},context.style,context.map,s);
        const value=effect.kind==='milestone'?effect.baseValue*scales.milestone
          :effect.kind==='synergy'?Math.round(effect.baseValue*tierScale(effect.tier,scales)):effect.value;
        put(parts[index][tile][effect.global?'global':'local'],stat,value,effect.multiplier);
      }
    }
    return trial=>{
      const globals=globalBase.slice(),locals=[];
      for(let i=0;i<trial.length;i++) {
        const part=parts[i][trial[i].tile]||parts[i].normal;
        for(let k=0;k<names.length;k++) if(modes[k]) globals[k]*=part.global[k];else globals[k]+=part.global[k];
        locals.push(part.local);
      }
      const passiveGlobalKillGold=globals[0];
      const skills=goldSkillsFor(trial,s);
      globals[0]*=skills.killGoldMultiplier;globals[1]*=skills.superGoldAmountMultiplier;globals[4]+=skills.superGoldChance;
      const selected=selectedIndex(trial,s.goldHero),bestMode=s.goldHero==='best';
      let sum=0,best=0;
      for(let i=0;i<trial.length;i++) {
        if(selected!==null&&selected!==i) continue;
        const local=locals[i];
        const tile=trial[i].tile==='killGold'?1+s.goldKillGoldTile/100:1;
        const overflow=chanceFactorFor([globals[4]+local[4],globals[5]+local[5]],s,'gold');
        const attackGold=trial[i].id==='crusader'?passiveGlobalKillGold*local[0]*tile*crusaderMultipliers[trial[i].tile==='skill'?'skill':'normal']:0;
        const value=(s.goldMimicFarming ? mimicKillPayout(s,globals[0]*local[0]*tile,globals[3]*local[3],
          globals[1]*local[1],globals[2]*local[2],globals[4]+local[4],globals[5]+local[5])
          : globals[0]*local[0]*globals[1]*local[1]*globals[2]*local[2]*globals[3]*local[3]*tile*overflow)+attackGold;
        sum+=value;best=Math.max(best,value);
      }
      return bestMode?best:sum/(selected===null?trial.length:1);
    };
  }
  function optimizeGoldPlacements(team,s) {
    const indexes=team.map((_,i)=>i),selected=selectedIndex(team,s.goldHero);
    const killers=selected===null?indexes:[selected];
    const score=makeGoldPlacementScorer(team,s);
    let best=copyTeam(team),high=score(team),evaluated=1;
    // One tile per named support skill is sufficient. Crusader's personal
    // payout competes for the same three skill tiles, on the actual attacker.
    // The legacy average mode can score multiple attacking Crusader copies.
    for(const killer of [null,...killers]) {
      const crusaders=s.goldSkills?killers.filter(i=>i!==killer&&team[i].id==='crusader'):[];
      const maxCrusaders=selected===null&&s.goldHero!=='best'?3:1;
      const skillChoices=['rogue','sovereign','hunter'].map(id=>[
        null,...(s.goldSkills?indexes.filter(i=>i!==killer&&team[i].id===id):[])
      ]);
      for(const rogue of skillChoices[0]) for(const sovereign of skillChoices[1]) for(const hunter of skillChoices[2]) {
        const supportSkills=[rogue,sovereign,hunter].filter(i=>i!==null);
        for(let c=0;c<=Math.min(maxCrusaders,crusaders.length,3-supportSkills.length);c++) {
          for(const personalSkills of combinations(crusaders,c)) {
            const skills=[...supportSkills,...personalSkills];
            const remaining=indexes.filter(i=>i!==killer&&!skills.includes(i));
            const boosted=Math.min(6,remaining.length);
            for(let m=Math.max(0,boosted-3);m<=Math.min(3,boosted);m++) {
              for(const ms of combinations(remaining,m)) {
                const free=remaining.filter(i=>!ms.includes(i));
                for(const ys of combinations(free,boosted-m)) {
                  const trial=team.map((slot,i)=>({...slot,tile:i===killer?'killGold':skills.includes(i)?'skill':ms.includes(i)?'milestone':ys.includes(i)?'synergy':'normal'}));
                  const value=score(trial);evaluated++;
                  if(value>high*(1+1e-12)) {high=value;best=trial;}
                }
              }
            }
          }
        }
      }
    }
    return suggestionResult(best,s,'gold',evaluated,goldSkillMethod(s));
  }
  function compareGoldAttackerTiles(rawTeam,settings={}) {
    const team=cleanTeam(rawTeam),s=settingsFor(settings);
    if(!team.length||!s.snowFort) return null;
    const attackerIndex=evaluate(team,s,true).goldIndex;
    if(attackerIndex===null) return null;
    const fixed={...s,goldHero:attackerIndex},score=makeScorer(fixed,'gold',team);
    function option(tile) {
      const old=team[attackerIndex].tile,limit=tile==='killGold'?1:3;
      const holders=team.map((slot,i)=>slot.tile===tile&&i!==attackerIndex?i:-1).filter(i=>i>=0);
      const swaps=old===tile||holders.length<limit?[null]:holders;
      let best=null;
      for(const other of swaps) {
        const trial=copyTeam(team);trial[attackerIndex].tile=tile;
        if(other!==null) trial[other].tile=old;
        const value=score(trial);
        if(!best||value>best.score) best={team:trial,score:value,swappedIndex:other};
      }
      return best;
    }
    const milestone=option('milestone'),killGold=option('killGold');
    const skill=team[attackerIndex].id==='crusader'&&s.goldSkills?option('skill'):null;
    const options={milestone,killGold,...(skill?{skill}:{})},availableOptions=Object.keys(options);
    const ranked=availableOptions.slice().sort((a,b)=>options[b].score-options[a].score);
    const high=options[ranked[0]].score,low=options[ranked[1]].score;
    const tie=Math.abs(high-low)<=Math.max(1,high,low)*1e-12;
    return {milestone,killGold,skill,availableOptions,runnerUp:ranked[1],preferred:tie?'tie':ranked[0],
      gain:tie?0:low?high/low-1:null,attackerIndex};
  }
  const damageSkillMethod='Damage tiles compare the selected attacker’s personal active skill and mastery, unique first-copy support skills, Damage, milestone, synergy and up to three skill-power placements. Ordinary attacks pool splash percentages from the attacker and its supports.';
  function makeDamagePlacementScorer(team,s) {
    const names=focusStats.damage,modes=names.map(type=>statMode(type)==='multiply');
    const base=()=>modes.map(mode=>mode?1:0),globalBase=base();
    const context=evaluate(team.map(slot=>({...slot,tile:'normal'})),s);
    const parts=team.map(()=>Object.fromEntries(['normal','milestone','synergy'].map(tile=>[tile,{global:base(),local:base()}])));
    const profiles=team.map(slot=>({normal:damageSkillFor({...slot,tile:'normal'},s),skill:damageSkillFor({...slot,tile:'skill'},s)}));
    const supportProfiles=team.map((slot,index)=>team.findIndex(other=>other.id===slot.id)===index?{
      normal:damageSupportFor({...slot,tile:'normal'},s),skill:damageSupportFor({...slot,tile:'skill'},s)
    }:null);
    function put(bucket,index,value,multiplier) {if(modes[index]) bucket[index]*=multiplier??(1+value/100);else bucket[index]+=value;}
    for(const effect of context.effects) {
      const stat=names.indexOf(effect.type);
      if(stat<0||effect.kind==='skill'||effect.kind==='placement') continue;
      if(effect.ownerIndex===null) {put(globalBase,stat,effect.value);continue;}
      const index=effect.ownerIndex;
      for(const tile of ['normal','milestone','synergy']) {
        const scales=scalesFor({...team[index],tile},context.style,context.map,s);
        const value=effect.kind==='milestone'?effect.baseValue*scales.milestone
          :effect.kind==='synergy'?Math.round(effect.baseValue*tierScale(effect.tier,scales)):effect.value;
        put(parts[index][tile][effect.global?'global':'local'],stat,value,effect.multiplier);
      }
    }
    const selected=selectedIndex(team,s.damageHero),bestMode=s.damageHero==='best';
    const warlock=damageWarlockActive(s,team);
    return trial=>{
      const globals=globalBase.slice(),locals=[];
      for(let i=0;i<trial.length;i++) {
        const part=parts[i][trial[i].tile]||parts[i].normal;
        for(let k=0;k<names.length;k++) if(modes[k]) globals[k]*=part.global[k];else globals[k]+=part.global[k];
        const support=supportProfiles[i]?.[trial[i].tile==='skill'?'skill':'normal'];
        if(support) applyDamageSupportProfile(globals,support);
        locals.push(part.local);
      }
      let sum=0,best=0;
      for(let i=0;i<trial.length;i++) {
        if(selected!==null&&selected!==i) continue;
        const local=locals[i],profile=profiles[i][trial[i].tile==='skill'?'skill':'normal'];
        const splash=singleTargetSplash(globals[splashStat]+local[splashStat]+profile.splashPercent);
        let factor=profile.nonSplashFactor*splash*(trial[i].tile==='damage'?1+s.damageTile/100:1);
        if(profile.castFactor!==undefined) factor*=damageCastMultiplier(profile,globals[speedStat]*local[speedStat],
          globals[volleyStat]*local[volleyStat]*splash,warlock);
        for(let k=0;k<damageFactors.length;k++) factor*=globals[k]*local[k];
        const values=chances.damage.map((type,k)=>globals[damageChanceStart+k]+local[damageChanceStart+k]+(profile.chanceByType[type]||0));
        const value=factor*chanceFactorFor(values,s,'damage',profile.chanceRolls);
        sum+=value;best=Math.max(best,value);
      }
      return bestMode?best:sum/(selected===null?trial.length:1);
    };
  }
  function optimizeDamagePlacements(team,s) {
    const indexes=team.map((_,i)=>i),selected=selectedIndex(team,s.damageHero);
    const score=makeDamagePlacementScorer(team,s);
    let best=copyTeam(team),high=score(team),evaluated=1;
    function place(specials) {
      const assigned=new Map(specials),remaining=indexes.filter(i=>!assigned.has(i)),boosted=Math.min(6,remaining.length);
      for(let m=Math.max(0,boosted-3);m<=Math.min(3,boosted);m++) for(const ms of combinations(remaining,m)) {
        const free=remaining.filter(i=>!ms.includes(i));
        for(const ys of combinations(free,boosted-m)) {
          const trial=team.map((slot,i)=>({...slot,tile:assigned.get(i)||(ms.includes(i)?'milestone':ys.includes(i)?'synergy':'normal')}));
          const value=score(trial);evaluated++;
          if(value>high*(1+1e-12)) {high=value;best=trial;}
        }
      }
    }
    const skillCandidates=indexes.filter(i=>
      damageSupportEnabled(team[i].id,s)&&team.findIndex(slot=>slot.id===team[i].id)===i
      ||s.damageSkills&&damageDefinitionMap.has(team[i].id)&&(selected===null||selected===i));
    const damageCandidates=selected===null?indexes:[selected];
    for(let n=0;n<=Math.min(3,skillCandidates.length);n++) for(const skills of combinations(skillCandidates,n)) {
      const assigned=skills.map(i=>[i,'skill']);
      place(assigned);
      for(const killer of damageCandidates.filter(i=>!skills.includes(i))) place([...assigned,[killer,'damage']]);
    }
    return suggestionResult(best,s,'damage',evaluated,damageSkillMethod);
  }
  function compareDamageAttackerTiles(rawTeam,settings={}) {
    const team=cleanTeam(rawTeam),s=settingsFor(settings);
    if(!team.length||!s.snowFort) return null;
    const attackerIndex=evaluate(team,s,true).attackerIndex;
    if(attackerIndex===null) return null;
    const fixed={...s,damageHero:attackerIndex},score=makeScorer(fixed,'damage',team);
    const options={};
    for(const tile of ['normal','milestone','synergy','skill','damage']) {
      const old=team[attackerIndex].tile,limit=tile==='normal'?Infinity:tile==='damage'?1:3;
      const holders=team.map((slot,i)=>slot.tile===tile&&i!==attackerIndex?i:-1).filter(i=>i>=0);
      const swaps=old===tile||holders.length<limit?[null]:holders;
      let best=null;
      for(const other of swaps) {
        const trial=copyTeam(team);trial[attackerIndex].tile=tile;
        if(other!==null) trial[other].tile=old;
        const value=score(trial);
        if(!best||value>best.score) best={team:trial,score:value,swappedIndex:other};
      }
      options[tile]=best;
    }
    const ranked=Object.keys(options).sort((a,b)=>options[b].score-options[a].score);
    const high=options[ranked[0]].score,second=options[ranked[1]].score;
    const ties=ranked.filter(tile=>Math.abs(options[tile].score-high)<=Math.max(1,high)*1e-12);
    const preferred=ties.includes(team[attackerIndex].tile)?team[attackerIndex].tile:ranked[0];
    return {attackerIndex,options,preferred,ties,gain:ties.length>1?0:second?high/second-1:null};
  }
  function compareExperienceAttackerTiles(rawTeam,settings={}) {
    const team=cleanTeam(rawTeam),s=settingsFor(settings);
    const levelerIndex=selectedIndex(team,s.experienceLeveler);
    if(levelerIndex===null || !s.snowFort) return null;
    syncLevelingCopies(team,levelerIndex);
    const attackerIndex=preferredExperienceAttacker(team,levelerIndex,s.experienceAttacker)
      ?? evaluate(team,s,true).experiencePlan.attackerIndex;
    const score=makeScorer(s,'experience',team),options={};
    for(const tile of ['normal','experience','milestone','synergy','skill']) {
      const old=team[attackerIndex].tile,limit=tile==='normal'?Infinity:tile==='experience'?1:3;
      const holders=team.map((slot,i)=>slot.tile===tile&&i!==attackerIndex?i:-1).filter(i=>i>=0);
      const swaps=old===tile||holders.length<limit?[null]:holders;
      let best=null;
      for(const other of swaps) {
        const trial=copyTeam(team);trial[attackerIndex].tile=tile;
        if(other!==null) trial[other].tile=old;
        const value=score(trial);
        if(!best || value>best.score) best={team:trial,score:value,swappedIndex:other};
      }
      options[tile]=best;
    }
    const ranked=Object.keys(options).sort((a,b)=>options[b].score-options[a].score);
    const high=options[ranked[0]].score,second=options[ranked[1]].score;
    const ties=ranked.filter(tile=>Math.abs(options[tile].score-high)<=Math.max(1,high)*1e-12);
    const preferred=ties.includes(team[attackerIndex].tile)?team[attackerIndex].tile:ranked[0];
    return {attackerIndex,levelerIndex,options,preferred,ties,gain:ties.length>1?0:second?high/second-1:null};
  }
  function optimizeExperienceSupportStyles(rawTeam,settings={}) {
    const team=cleanTeam(rawTeam),s=settingsFor(settings),leveler=selectedIndex(team,s.experienceLeveler);
    if(!team.length) throw new Error('Add at least one hero before suggesting support styles.');
    syncLevelingCopies(team,leveler);
    normalizeSupportCombatStyles(team,leveler);
    const score=makeScorer(s,'experience',team);
    let best=team,bestScore=score(team),evaluated=1;
    if(leveler===null) return {team:best,score:bestScore,evaluated};
    const levelerId=team[leveler].id,ids=[...new Set(team.filter(slot=>slot.id!==levelerId).map(slot=>slot.id))];
    // Support styles affect XP through global counts. A hero-ID group moves
    // together, so duplicate copies cannot acquire different combat styles.
    let states=new Map([['0,0,0',{counts:[0,0,0],choices:[],changes:0}]]);
    for(const id of ids) {
      const copies=team.filter(slot=>slot.id===id),current=copies[0].combatStyle||(s.grandMaster?'grandMaster':'none');
      const options=supportStyleOptions(team,id),next=new Map();
      for(const state of states.values()) for(const styleId of options) {
        const counts=state.counts.slice(),index=['grandMaster','tycoon','magnate'].indexOf(styleId);
        if(index<0) continue;
        counts[index]+=copies.length;
        const key=counts.join(','),changes=state.changes+(styleId===current?0:copies.length);
        if(!next.has(key)||changes<next.get(key).changes) next.set(key,{counts,choices:[...state.choices,styleId],changes});
      }
      states=next;
    }
    for(const state of states.values()) {
      const trial=copyTeam(team);
      ids.forEach((id,index)=>assignSupportStyle(trial,id,state.choices[index]));
      const value=score(trial);evaluated++;
      if(value>bestScore*(1+1e-12)) {best=trial;bestScore=value;}
    }
    return {team:best,score:bestScore,evaluated};
  }
  function optimizePlacements(rawTeam,settings={},focus='energy') {
    if(focus!=='experience'||settings.experienceOptimizeSupportStyles!==true) return optimizePlacementsFixedStyles(rawTeam,settings,focus);
    const s=settingsFor(settings),fixed={...s,experienceOptimizeSupportStyles:false};
    let team=cleanTeam(rawTeam),evaluated=0,result;
    if(selectedIndex(team,s.experienceLeveler)===null) return optimizePlacementsFixedStyles(team,fixed,focus);
    // Alternate two inexpensive count searches with exact tile assignment;
    // never multiply the full placement search by all support-style states.
    for(let pass=0;pass<2;pass++) {
      const styles=optimizeExperienceSupportStyles(team,fixed);evaluated+=styles.evaluated;
      const placements=optimizePlacementsFixedStyles(styles.team,fixed,focus);evaluated+=placements.evaluated;
      const finalStyles=optimizeExperienceSupportStyles(placements.team,fixed);evaluated+=finalStyles.evaluated;
      result=placements;team=finalStyles.team;
    }
    return suggestionResult(team,s,focus,evaluated,`${result.skillMethod} Support styles compare eligible shared Grand Master, Tycoon and Magnate choices.`);
  }
  function optimizePlacementsFixedStyles(rawTeam, settings={}, focus='energy') {
    if(!Object.hasOwn(focusStats,focus)) throw new Error('Choose a valid focus.');
    const team=cleanTeam(rawTeam), s=settingsFor(settings);
    if(!team.length) throw new Error('Add at least one hero before suggesting tiles.');
    const experience = focus==='experience';
    const tagId=tagFocuses[focus]?.heroId;
    if(tagId && !team.some(slot=>slot.id===tagId)) throw new Error(`Add ${heroMap.get(tagId).name} to this team before suggesting Tag tiles.`);
    if(!s.snowFort) return suggestionResult(team,s,focus,1,'Map disabled');
    if(focus==='gold') return optimizeGoldPlacements(team,s);
    if(focus==='damage') return optimizeDamagePlacements(team,s);
    const score=makeScorer(s,focus,team), indexes=team.map((_,i)=>i);
    let best=copyTeam(team), high=score(team), evaluated=1;
    // The three named XP skills each supply once; enumerate which copy, if any,
    // receives a skill tile jointly with all milestone/synergy assignments.
    let skillChoices=[[]];
    // Only the strongest copy casts the tag, so at most one Skill Power tile
    // is needed. Any copy can be the best after all placements are applied.
    if(tagId) skillChoices.push(...indexes.filter(i=>team[i].id===tagId).map(i=>[i]));
    if(experience && s.experienceSkills) for(const id of ['archer','ballista','veteran']) {
      const owners=indexes.filter(i=>team[i].id===id);
      skillChoices=skillChoices.flatMap(chosen=>[chosen,...owners.map(i=>[...chosen,i])]);
    }
    for(const skills of skillChoices) {
      const eligible = indexes.filter(i=>!skills.includes(i)), maxBoosted=Math.min(6,eligible.length);
      // When every remaining slot would take a milestone or synergy tile,
      // compare leaving one free for XP. An XP tile on any other available
      // slot is already considered during the same scorer pass.
      const minBoosted=experience ? Math.min(6,Math.max(0,eligible.length-1)) : maxBoosted;
      for(let totalBoosted=minBoosted;totalBoosted<=maxBoosted;totalBoosted++) {
        for(let m=Math.max(0,totalBoosted-3);m<=Math.min(3,totalBoosted);m++) {
          const y=totalBoosted-m;
          for(const ms of combinations(eligible,m)) {
            const remaining=eligible.filter(i=>!ms.includes(i));
            for(const ys of combinations(remaining,y)) {
              const trial=team.map((slot,i)=>({...slot,tile:skills.includes(i)?'skill':ms.includes(i)?'milestone':ys.includes(i)?'synergy':'normal'}));
              const placement=experience?{score:-Infinity,index:null}:null;
              const value=score(trial,placement); evaluated++;
              if(value>high*(1+1e-12) || Math.abs(value-high)<=Math.max(1,high)*1e-12 && best.filter(x=>x.tile==='milestone'||x.tile==='synergy').length<totalBoosted) {
                if(placement?.index!=null) trial[placement.index].tile='experience';
                best=trial;high=value;
              }
            }
          }
        }
      }
    }
    if(experience) return suggestionResult(best,s,focus,evaluated,'The killer’s XP tile was compared with milestone, synergy and skill tiles. Veteran shares the boosted kill reward with the team. Each named ability counts once.');
    if(tagId) return suggestionResult(best,s,focus,evaluated,tagSkillMethod(focus));
    best=assignSkillTiles(best,s);
    return suggestionResult(best,s,focus,evaluated,
      'Remaining skill tiles favor XP abilities, then Skill Power and damage; one copy per hero. Skill DPS is not simulated.');
  }
  function optimizeTeam(rawTeam, settings = {}, focus = 'energy', allowedIds = DATA.heroes.map(h => h.id)) {
    if (!Object.hasOwn(focusStats, focus)) throw new Error('Choose a valid focus.');
    const original = cleanTeam(rawTeam), s=settingsFor(settings);
    if (!original.length) throw new Error('Add at least one hero to Team B first.');
    const leveler = focus==='experience' ? selectedIndex(original,s.experienceLeveler) : null;
    const optimizeSupportStyles=leveler!==null && s.experienceOptimizeSupportStyles;
    const normalizeCandidateStyles=leveler!==null && (optimizeSupportStyles||original.some(slot=>slot.combatStyle));
    const manualSupportStyles={};
    if(normalizeCandidateStyles&&!optimizeSupportStyles) {
      const initial=normalizeSupportCombatStyles(copyTeam(original),leveler);
      for(const slot of initial) if(slot.id!==initial[leveler].id&&slot.combatStyle) manualSupportStyles[slot.id]=slot.combatStyle;
    }
    function prepareCandidateStyles(team) {
      // With style search disabled, choices follow hero identity through roster
      // replacements. A new hero must not inherit the displaced slot's style.
      if(!optimizeSupportStyles) for(const slot of team) if(slot.id!==team[leveler].id) {
        if(Object.hasOwn(manualSupportStyles,slot.id)) slot.combatStyle=manualSupportStyles[slot.id];
        else delete slot.combatStyle;
      }
      return normalizeSupportCombatStyles(team,leveler);
    }
    // Keep the support baseline while candidate identities change. A leveling
    // copy is scored at the target level and normalized on output, but replacing
    // it with a support must not leave that support at the target's low level.
    if (leveler !== null) for (const [index,slot] of original.entries()) {
      if (index !== leveler && slot.id === original[leveler].id) slot.level = s.experienceSupportLevel;
    }
    const target = leveler ?? selectedIndex(original, focusTarget(s, focus));
    const fixedKiller = leveler===null ? null : selectedIndex(original,s.experienceAttacker);
    const isFixed = (slot, index) => slot.locked || index === target || index === fixedKiller;
    const requiredHeroes = [...new Set(Array.isArray(s.requiredHeroes) ? s.requiredHeroes : [])];
    const tagId=tagFocuses[focus]?.heroId;
    if(tagId && !requiredHeroes.includes(tagId)) requiredHeroes.push(tagId);
    // Explicitly required heroes remain eligible even if the optional roster excludes them.
    const allowed = [...new Set([...allowedIds, ...requiredHeroes])].filter(id => heroMap.has(id));
    if(fixedKiller!==null && fixedKiller!==leveler && !requiredHeroes.includes('veteran')) {
      if(!original.some((slot,i)=>slot.id==='veteran'&&isFixed(slot,i)) && !allowedIds.includes('veteran')) {
        throw new Error('A separate attacker needs Veteran for Exp Share. Include Veteran in the roster or choose the leveler as attacker.');
      }
      requiredHeroes.push('veteran');
    }
    for (const id of requiredHeroes) if (!heroMap.has(id)) throw new Error(`Unknown required hero: ${String(id)}.`);
    const minimum = Object.fromEntries(requiredHeroes.map(id => [id, 1]));
    // A selected attacker or leveling target keeps its hero and level without
    // changing lock flags. Automatic attacker selection leaves unlocked slots free.
    const open = original.map((slot,i) => isFixed(slot,i) ? -1 : i).filter(i => i >= 0);
    const fixedCounts=countsFor(original.filter(isFixed));
    const missingRequired = requiredHeroes.filter(id => !fixedCounts[id]);
    if (missingRequired.length > open.length) {
      const names = missingRequired.map(id => heroMap.get(id).name).join(', ');
      throw new Error(`Required heroes ${names} need ${missingRequired.length} available slots, but only ${open.length} can change. Add slots or unlock support heroes; the selected attacker or leveling target stays fixed.`);
    }
    if (!open.length) return optimizePlacements(original,s,focus);
    if (!allowed.length) throw new Error('Include at least one candidate hero.');
    if(allowed.reduce((sum,id)=>sum+3-(fixedCounts[id]||0),0)<open.length) throw new Error('The allowed roster cannot fill this team with at most 3 copies per hero. Include more heroes.');
    const score = makeScorer(s, focus, original);
    let evaluated = 0;
    const run = team => {
      evaluated++;
      if(!normalizeCandidateStyles) return score(team);
      const candidate=copyTeam(team);
      prepareCandidateStyles(candidate);
      return score(candidate);
    };
    function ensureRequired(team) {
      const counts = countsFor(team);
      for (const id of requiredHeroes) if (!counts[id]) {
        let winner = null, high = -Infinity;
        for (const i of open) {
          const old = team[i].id;
          if ((counts[old] || 0) <= (minimum[old] || 0)) continue;
          team[i].id = id;
          const value = run(team);
          team[i].id = old;
          if (winner === null || value > high) { winner = i; high = value; }
        }
        if (winner === null) throw new Error('Required heroes cannot fit without changing locked heroes or the selected attacker. Add slots or unlock support heroes.');
        counts[team[winner].id]--;
        team[winner].id = id;
        counts[id] = 1;
      }
      return team;
    }
    const start = copyTeam(original);
    const currentCounts=countsFor(start);
    for (const i of open) if (!allowed.includes(start[i].id)) {
      currentCounts[start[i].id]--;
      const id=allowed.find(id=>(currentCounts[id]||0)<3);
      start[i].id=id;currentCounts[id]=(currentCounts[id]||0)+1;
    }
    ensureRequired(start);
    if(normalizeCandidateStyles) prepareCandidateStyles(start);
    if(s.snowFort) {
      const placement=optimizePlacementsFixedStyles(start,s,focus); evaluated+=placement.evaluated;
      placement.team.forEach((slot,i)=>start[i].tile=slot.tile);
    }
    let best = copyTeam(start), bestScore = run(best);
    let seed = 432194;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
    function seedTeam(order,randomize=false) {
      const t=copyTeam(start), counts={...fixedCounts};
      for(const i of open) {
        const available=order.filter(id=>(counts[id]||0)<3);
        const id=available[randomize?Math.floor(random()*available.length):0];
        t[i].id=id;counts[id]=(counts[id]||0)+1;
      }
      return ensureRequired(t);
    }
    const seeds=[start];
    const rankedSeeds=allowed.map((id,index)=>{
      const order=[id,...allowed.slice(index+1),...allowed.slice(0,index)];
      const team=seedTeam(order);return {team,score:run(team)};
    }).sort((a,b)=>b.score-a.score);
    seeds.push(...rankedSeeds.slice(0,3).map(x=>x.team));
    if (tagId || focus === 'powerMageEnergy' || focus === 'damage' && s.damageHero === 'best' || focus === 'gold' && (s.goldHero === 'best' || target !== null) || focus === 'experience' && target !== null) {
      // A strong synergy may need several simultaneous roster changes.
      // Seed its required copies before climbing so a weaker solo attacker or an
      // XP target or Power Mage energy link is not screened out by standalone scores.
      const linkedSeeds = [], seen = new Set();
      const availableOwners = [...new Set([...allowed, ...Object.keys(fixedCounts)])];
      const links=[];
      const linkStats=new Set(focusStats[focus]);
      if(leveler!==null) linkStats.add('Boss Exp');
      for (const id of availableOwners) for (const effect of heroMap.get(id).synergies) {
        if (effect.tier > s.maxTier || !linkStats.has(canonicalType(effect.type,s))) continue;
        if (tagId && !effect.global && id!==tagId) continue;
        const needed = synergyPartnersNeeded(id,effect,s);
        for (const partners of combinations(effect.requires, needed)) links.push([id,...partners]);
      }
      // Seed Veteran with potential attackers: neither half of a shared-kill
      // setup has to improve self kills on its own to reach the search.
      if(leveler!==null && availableOwners.includes('veteran')) {
        for(const id of availableOwners) links.push(id==='veteran'?['veteran']:['veteran',id]);
      }
      for(const link of links) {
        const required = countsFor(link.map(id=>({id})));
        for (const requiredId of requiredHeroes) required[requiredId] = Math.max(1,required[requiredId]||0);
        const t = copyTeam(start), counts = {...fixedCounts}, free = open.slice().sort((a,b)=>t[b].level-t[a].level||a-b);
        let valid = true;
        for (const [requiredId, count] of Object.entries(required)) {
          let missing = Math.max(0,count-(fixedCounts[requiredId]||0));
          if (missing && !allowed.includes(requiredId) || count > 3) { valid=false; break; }
          while (missing--) {
            const matching = free.findIndex(i=>t[i].id===requiredId);
            const i = free.splice(matching >= 0 ? matching : 0,1)[0];
            if (i === undefined || (counts[requiredId]||0) >= 3) { valid=false; break; }
            t[i].id=requiredId; counts[requiredId]=(counts[requiredId]||0)+1;
          }
          if (!valid) break;
        }
        if (!valid) continue;
        for (const i of free) {
          const fill = allowed.includes(t[i].id) && (counts[t[i].id]||0)<3 ? t[i].id : allowed.find(id=>(counts[id]||0)<3);
          if (!fill) {valid=false;break;}
          t[i].id=fill;counts[fill]=(counts[fill]||0)+1;
        }
        if (!valid) continue;
        const key=t.map(slot=>slot.id).join('|');
        if (!seen.has(key)) {seen.add(key);linkedSeeds.push({team:t,score:run(t)});}
      }
      linkedSeeds.sort((a,b)=>b.score-a.score);
      seeds.push(...linkedSeeds.slice(0,6).map(x=>x.team));
    }
    for(let n=0;n<4;n++) seeds.push(seedTeam(allowed,true));
    if(optimizeSupportStyles) for(const styleId of ['grandMaster','tycoon','magnate']) {
      const t=copyTeam(start),ids=[...new Set(t.filter(slot=>slot.id!==t[leveler].id).map(slot=>slot.id))];
      for(const id of ids) if(supportStyleOptions(t,id).includes(styleId)) assignSupportStyle(t,id,styleId);
      normalizeSupportCombatStyles(t,leveler);
      seeds.push(t);
    }
    function climb(input) {
      const t=copyTeam(input);
      if(normalizeCandidateStyles) prepareCandidateStyles(t);
      let current=run(t);
      for(let pass=0;pass<10;pass++) {
        const before=current;
        for(const i of open) {
          const counts=countsFor(t);counts[t[i].id]--;
          if ((counts[t[i].id] || 0) < (minimum[t[i].id] || 0)) continue;
          let winner=t[i].id,high=current;
          for(const id of allowed) {
            if(id===winner||(counts[id]||0)>=3) continue;
            t[i].id=id;const value=run(t);
            if(value>high*(1+1e-12)) {high=value;winner=id;}
          }
          t[i].id=winner;current=high;
          if(normalizeCandidateStyles) prepareCandidateStyles(t);
        }
        // Move required copies between slot levels without temporarily breaking
        // the roster minimum. Locks and a selected recipient remain untouched.
        if (requiredHeroes.length) for (let x=0;x<open.length;x++) for (let y=x+1;y<open.length;y++) {
          const i=open[x],j=open[y];
          if (t[i].id===t[j].id || t[i].level===t[j].level) continue;
          [t[i].id,t[j].id]=[t[j].id,t[i].id];const value=run(t);
          if(value>current*(1+1e-12)) current=value;
          else [t[i].id,t[j].id]=[t[j].id,t[i].id];
        }
        if(normalizeCandidateStyles) prepareCandidateStyles(t);
        if(optimizeSupportStyles) {
          const ids=[...new Set(t.filter(slot=>slot.id!==t[leveler].id).map(slot=>slot.id))];
          for(const id of ids) {
            const members=t.filter(slot=>slot.id===id),previous=members.map(slot=>slot.combatStyle);
            let winner=null,high=current;
            for(const styleId of supportStyleOptions(t,id)) {
              assignSupportStyle(t,id,styleId);
              const value=run(t);
              if(value>high*(1+1e-12)) {high=value;winner=styleId;}
            }
            members.forEach((slot,index)=>{if(previous[index]===undefined) delete slot.combatStyle;else slot.combatStyle=previous[index];});
            if(winner!==null) assignSupportStyle(t,id,winner);
            current=high;
          }
        }
        if(s.snowFort) for(let i=0;i<t.length;i++) for(let j=i+1;j<t.length;j++) {
          if(t[i].tile===t[j].tile) continue;
          [t[i].tile,t[j].tile]=[t[j].tile,t[i].tile];const value=run(t);
          if(value>current*(1+1e-12)) current=value;
          else [t[i].tile,t[j].tile]=[t[j].tile,t[i].tile];
        }
        if(current>bestScore*(1+1e-12)) {bestScore=current;best=copyTeam(t);}
        if(current<=before*(1+1e-12)) break;
      }
    }
    for(const t of seeds) climb(t);
    // Finish with exhaustive M/S assignment for each final candidate lineup.
    if(s.snowFort||optimizeSupportStyles) for(let n=0;n<2;n++) {
      const p=optimizePlacements(best,s,focus);evaluated+=p.evaluated;
      best=p.team;bestScore=p.score;
      if (leveler !== null) best.forEach((slot,i) => { slot.level = original[i].level; });
      if(n===0) climb(best);
    }
    return suggestionResult(best,s,focus,evaluated,tagId?tagSkillMethod(focus):focus==='gold'?goldSkillMethod(s):focus==='damage'?damageSkillMethod:leveler!==null?
      'Boss XP received by the leveler, including Veteran’s Exp Share when active.':
      'Remaining skill tiles favor XP abilities, then Skill Power and damage; one copy per hero. Skill DPS is not simulated.');
  }
  function experienceRanges(rawTeam, settings={}) {
    const team=cleanTeam(rawTeam), s=settingsFor(settings);
    const leveler=selectedIndex(team,s.experienceLeveler);
    if(leveler===null) throw new Error('Choose a hero to level before planning the climb.');
    const levels=new Set([1,1000,...experienceStyles.map(style=>style.level),...experienceTierLevels.slice(0,s.maxTier)]);
    const xpStats=new Set([...focusStats.experience,'Boss Exp']);
    for(const milestone of heroMap.get(team[leveler].id).milestones) {
      if(xpStats.has(canonicalType(milestone.type,s))) levels.add(milestone.level);
    }
    const starts=[...levels].filter(level=>level>=1 && level<=4500).sort((a,b)=>a-b);
    return starts.map((from,i)=>({from,to:i+1<starts.length?starts[i+1]-1:4500}));
  }
  function suggestExperienceRange(rawTeam,settings={},allowedIds=DATA.heroes.map(h=>h.id),level=1) {
    const team=cleanTeam(rawTeam), stages=experienceRanges(team,settings);
    const stage=stages.find(range=>level>=range.from && level<=range.to);
    if(!stage) throw new Error('Choose a level between 1 and 4,500.');
    const leveler=selectedIndex(team,settings.experienceLeveler);
    team[leveler].level=stage.from;
    const result=optimizeTeam(team,{...settings,experienceStyle:'auto',experienceAttacker:'best'},'experience',allowedIds);
    const plan=result.experiencePlan;
    return {...result,...stage,style:plan.styleId,attackerIndex:plan.attackerIndex};
  }
  function groupExperienceRanges(stages) {
    const groups = [];
    let previous;
    for (const stage of stages) {
      const roster = [], placements = [];
      let attacker, attackerTile;
      stage.team.forEach((slot, index) => {
        const leveler = index === stage.experiencePlan.levelerIndex;
        const levelingCopy = slot.id === stage.team[stage.experiencePlan.levelerIndex].id;
        // Preserve fixed slots. Unlocked supports with the same build can
        // trade places, including interchangeable copies of the attacker.
        const fixedSlot = leveler || slot.locked ? index : null;
        const copy = JSON.stringify([fixedSlot, !!slot.locked, leveler, slot.id, levelingCopy ? null : slot.level,
          levelingCopy?null:(slot.combatStyle||'grandMaster')]);
        roster.push(copy);
        placements.push(JSON.stringify([copy,slot.tile]));
        if (index === stage.attackerIndex) { attacker = copy; attackerTile = slot.tile; }
      });
      const setup = {style:stage.style, attacker, attackerTile,
        roster:JSON.stringify(roster.sort()), placements:JSON.stringify(placements.sort())};
      const changes = [];
      if (previous) {
        if (previous.style !== setup.style) changes.push('style');
        if (previous.attacker !== attacker || previous.placements === setup.placements && previous.attackerTile !== attackerTile) {
          changes.push('attacker');
        }
        if (previous.roster !== setup.roster) changes.push('lineup');
        else if (previous.placements !== setup.placements) changes.push('tiles');
      }
      const last = groups.at(-1);
      if (last && last.to + 1 === stage.from && !changes.length) {
        last.to = stage.to;
        last.stages.push(stage);
      } else {
        groups.push({from:stage.from, to:stage.to, stages:[stage], changes});
      }
      previous = setup;
    }
    return groups;
  }
  root.HeroEngine = {evaluate,rankMilestoneSupport,xpRankingReference,damageRankingReference,optimizeTeam,optimizePlacements,optimizeExperienceSupportStyles,experienceRanges,suggestExperienceRange,groupExperienceRanges,experienceStyles,experienceTierLevels,experienceSkillsFor,compareExperienceAttackers,compareExperienceAttackerTiles,compareExperienceLevelerTiles:compareExperienceAttackerTiles,normalizeExperienceReference,captureExperienceReference,defaultExperienceReference,upgradeExperienceReference,normalizeChanceReference,defaultChanceReferences,captureChanceReference,chanceDetailsFor,compareGoldAttackerTiles,compareDamageAttackerTiles,damageSkillDefinitions,damageSupportDefinitions,statMode,canonicalType,synergyActive,synergyPartnersNeeded,cleanTeam,settingsFor,normalizeHeroAscensions,ascensionLevelCaps,ascensionFactors,makeScorer,defaults,merge,styleFor,mapFor,scalesFor,tierScale,damageSkillFor,damageSupportFor,tagFocuses,effectiveSkillPower};
})(typeof window !== 'undefined' ? window : globalThis);
