(function () {
  'use strict';
  const DATA = window.HERO_DATA;
  const REVIEW = window.MILESTONE_REVIEW;
  const activeMilestoneHeroes = DATA.meta.milestoneReview?.activeHeroes ?? REVIEW?.capturedHeroes ?? 0;
  const ENGINE = window.HeroEngine;
  const byId = new Map(DATA.heroes.map(hero => [hero.id, hero]));
  const byName = new Map(DATA.heroes.map(hero => [hero.name.toLowerCase(), hero]));
  const tagFocuses = ENGINE.tagFocuses;
  const tagFor = focus => Object.hasOwn(tagFocuses, focus) ? tagFocuses[focus] : null;
  const standardFocusNames = { energy: 'Energy', gold: 'Gold', experience: 'Experience', damage: 'Damage', powerMageEnergy: 'Energy + Power Mages', damageBuffSwap: 'Damage · Buff swap',
    ...Object.fromEntries(Object.entries(tagFocuses).map(([focus, tag]) => [focus, tag.name])) };
  const focusNames = {...standardFocusNames, immortal: 'Immortal Boss Damage'};
  const immortalModes = {skill:'Skill damage', melee:'Melee', mage:'Mage', ranged:'Ranged'};
  const usesAttackPriority = mode => mode === 'mage' || mode === 'ranged';
  const immortalObjectives = {
    damage: {key:'score', label:'boss damage/s', option:'Highest total boss damage per second'},
    attacks: {key:'attacksPerSecond', label:'boss attacks/s', option:'Most team attacks per second'},
    hits: {key:'totalHitRate', label:'scoring hits/s', option:'Most scoring hits per second'},
    strikes: {key:'championHitsPerSecond', label:'Champion strikes/s', option:'Most Champion strikes per second'}
  };
  const buffPresets = {skill:'deploy', melee:'swap', mage:'warlock', ranged:'warlock'};
  const immortalEngine = ENGINE.immortal;
  let immortalAttributeHero = 'hunter';
  const immortalAttributeFields = [['immortal-speed-rank','speed'],['immortal-crit-rank','normal'],['immortal-super-rank','super'],['immortal-ultra-rank','ultra']];
  const buffTeamIds = immortalEngine.deployedBuffHeroes;
  const immortalFields = [
    ['baseDamageExponent', 'Account damage multiplier (log₁₀)', 0, 1000000],
    ['baseCritChance', 'Account Crit Chance bonus (points)', 0, 1e9],
    ['baseSuperChance', 'Pre-team Super Crit Chance (%)', 0, 1e9],
    ['baseUltraChance', 'Pre-team Ultra Crit Chance (%)', 0, 1e9],
    ['championStrikes', 'Lightning strikes before rounding', 1, 1e9],
    ['championDamagePercent', 'Damage per lightning strike (%)', 0, 1e12],
    ['championMasteryPercent', 'Mastery per repeat strike (%)', 0, 1e12],
    ['championCooldown', 'Seconds between casts per Champion', 0.25, 1e6],
    ['otherBasePower', 'Other heroes’ pre-team Skill Power', 0, 1e9],
    ['otherMasteryLevel', 'Other heroes’ mastery level', 0, 1e6],
    ['fightSeconds', 'Seconds attacking the boss', 1, 86400]
  ];
  const metricKeys = ['energy', 'gold', 'experience', 'damage', 'powerMageEnergy'];
  const objectiveFor = focus => focus === 'damageBuffSwap' ? 'damage' : focus;
  const chanceFocuses = ['gold', 'damage', 'damageBuffSwap'];
  const damageSupportModeFor = focus => focus === 'damageBuffSwap' ? 'debuffs' : 'all';
  const supportDefaults = {
    level: 15000, grandMasterCount: 10, tile: 'normal', team: 'a', lineupOnly: false, slot: 0, selectedHero: null,
    xpReference: ENGINE.xpRankingReference(), damageReference: ENGINE.damageRankingReference()
  };
  const symbols = { energy: 'ϟ', gold: '◉', experience: '✧', damage: '⟐', powerMageEnergy: 'ϟ✦', damageBuffSwap: '⟐↔', archerExperienceTag: '✧', hunterGoldTag: '◉', immortal: '✴' };
  const storageKey = 'hero-team-lab-v1';
  const experienceRequiredHeroes = ['archer', 'ballista', 'veteran'];
  const focusRequiredHeroes = { gold: ['hunter', 'rogue', 'sovereign'], powerMageEnergy: ['captain'] };
  const requiredHeroesByFocus = Object.fromEntries(Object.keys(focusNames).map(focus =>
    [focus, tagFor(focus) ? [tagFor(focus).heroId] : focus === 'experience' ? [...experienceRequiredHeroes] : [...(focusRequiredHeroes[focus] || [])]]));
  const xpOptions = (supportLevel = 15000) => ({style: 'auto', attacker: 'best', supportLevel, optimizeSupportStyles: true});
  const supportStyleLevels = {grandMaster:0,tycoon:1250,magnate:4000};
  const supportStyleNames = {grandMaster:'Grand Master',tycoon:'Tycoon',magnate:'Magnate'};
  const experienceSkillFields = [
    ['experienceArcherBonus', 'Archer', 'Marked-enemy XP bonus without a tile (%)',13240,0,1e9],
    ['experienceArcherMasteryPerWave', 'Archer', 'Wave mastery bonus per wave (%)',0.65,0,1e6],
    ['experienceWave', 'Archer', 'Current wave',75000,0,1e9],
    ['experienceArcherCoverage', 'Archer', 'Rewarded XP from marked enemies (%)',100,0,100],
    ['experienceBallistaBonus', 'Ballista', 'Active XP aura bonus (%)',3865,0,1e9],
    ['experienceBallistaMasteryPerStack', 'Ballista', 'Mastery XP bonus per stack (%)',6.5,0,1e9],
    ['experienceBallistaStacks', 'Ballista', 'Mastery kill stacks',100,0,100],
    ['experienceVeteranSuperChance', 'Veteran', 'Super EXP chance bonus (pp)',149.2,0,1e9],
    ['experienceVeteranShareChance', 'Veteran', 'EXP Share chance (%)',365.5,0,1e9],
    ['experienceVeteranSuperAmountPerStack', 'Veteran', 'Super EXP amount per stack (%)',16.26,0,1e9],
    ['experienceVeteranStacks', 'Veteran', 'Mastery kill stacks',100,0,100]
  ];
  const styleName = id => ENGINE.experienceStyles.find(style => style.id === id)?.name || 'No style';
  const scoredStats = new Set(['Damage', 'Attack Speed', 'Crit Damage', 'Super Crit Damage', 'Ultra Crit Damage', 'Crit Chance', 'Super Crit Chance', 'Ultra Crit Chance', 'Kill Gold', 'Boss Gold', 'Super Gold Amount', 'Ultra Gold Amount', 'Super Gold Chance', 'Ultra Gold Chance', 'Rank Exp', 'Super Exp Amount', 'Ultra Exp Amount', 'Super Exp Chance', 'Ultra Exp Chance', 'Exp Reward Multiplier', 'Own Kill Exp Multiplier', 'Energy Income', 'Energy Income Multiplier', 'Power Mage Energy', 'Super Energy Amount', 'Ultra Energy Amount', 'Super Energy Chance', 'Ultra Energy Chance']);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: Math.abs(value) >= 1000000 ? 'compact' : 'standard' }).format(value) : '—';
  const precise = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumSignificantDigits: 7 }).format(value) : '—';
  const statName = type => type.replace(/\bExp\b/g, 'XP');
  const scoreFormat = value => value >= 1e12 ? value.toExponential(2) : number(value);
  const defaults = { maxTier: 9, milestoneScale: ENGINE.defaults.milestoneScale, defaultMilestoneLevel: ENGINE.defaults.defaultMilestoneLevel, synergyScale: 1, synergyEvent: true, accountSynergyBoosts: true, synergyGlobalBonus1: 5, synergyGlobalBonus2: 5, synergyGlobalBonus3: 5, tier12Scale: 6.25, tier34Scale: 2.5, heroSynergyDefault: ENGINE.defaults.heroSynergyDefault, heroSynergyCrusader: ENGINE.defaults.heroSynergyCrusader, heroSynergyWarden: ENGINE.defaults.heroSynergyWarden, overflowRate: 5, baseOverflow: 0, baseEnergy: 10000, requirementReduction: ENGINE.defaults.requirementReduction, ultraExpMode: 'exclude', grandMaster: true, grandMasterStacking: 'multiply', synergyGrandMasterStacking: 'multiply', snowFort: true, mapT56: 115, mapT7: 77, mapMastery: 33, mapAttackSpeed: -20 };
  const inheritedAscensionKeys = ['defaultMilestoneLevel', 'heroSynergyDefault', 'heroSynergyCrusader', 'heroSynergyWarden', 'requirementReduction'];
  const accountSynergyFields = [['account-global-1', 'synergyGlobalBonus1', 10000], ['account-global-2', 'synergyGlobalBonus2', 10000], ['account-global-3', 'synergyGlobalBonus3', 10000], ['account-tier12', 'tier12Scale', 100], ['account-tier34', 'tier34Scale', 100], ['account-hero-default', 'heroSynergyDefault', 10000], ['account-hero-crusader', 'heroSynergyCrusader', 10000], ['account-hero-warden', 'heroSynergyWarden', 10000]];
  Object.assign(defaults, { goldSkills: true, goldKillGoldTile: 2475, goldRogueBonus: 8070, goldHunterBonus: 28720, goldSovereignChance: 325.8, goldSovereignAmount: 1629, goldCrusaderBonus: 6420, goldCrusaderMastery: 20.6, goldCrusaderAttacks: 1 });
  const goldFields = [['gold-kill-tile', 'goldKillGoldTile'], ['gold-rogue-bonus', 'goldRogueBonus'], ['gold-hunter-bonus', 'goldHunterBonus'], ['gold-sovereign-chance', 'goldSovereignChance'], ['gold-sovereign-amount', 'goldSovereignAmount'], ['gold-crusader-bonus', 'goldCrusaderBonus'], ['gold-crusader-mastery', 'goldCrusaderMastery'], ['gold-crusader-attacks', 'goldCrusaderAttacks']];
  const damageDefinitions = ENGINE.damageSkillDefinitions || [];
  const damageProfileFields = damageDefinitions.flatMap(def => def.fields);
  const damageSupportDefinitions = ENGINE.damageSupportDefinitions || [];
  const damageSupportFields = damageSupportDefinitions.flatMap(def => def.fields);
  Object.assign(defaults, { damageSupportSkills: true, damageSupportSeconds: 20, damageSupportStacks: 0, damageSupportTeleports: 3, damageNecromancerRoll: 'midpoint' }, Object.fromEntries(damageSupportFields.map(field => [field.key, field.value])));
  for (const type of ['Damage Taken', 'Splash Damage', 'Triple Shot Damage']) scoredStats.add(type);
  let damageSupportProfileHero = 'apprentice';
  Object.assign(defaults, { damageSkills: true, damageTile: 2475, damageWardenDistance: 10.7, damageSkillTileBoost: 20, damageMasteryTileBoost: 20 }, Object.fromEntries(damageProfileFields.map(field => [field.key, field.value])));
  let damageProfileHero = 'praetorian';
  const tileNames = { normal: 'Normal', milestone: 'Milestone', synergy: 'Synergy', skill: 'Skill power', killGold: 'Kill Gold', damage: 'Damage', experience: 'XP +20%' };
  const tileLimit = tile => ['killGold', 'damage', 'experience'].includes(tile) ? 1 : 3;
  const defaultTile = index => index < 3 ? 'milestone' : index < 6 ? 'synergy' : index < 9 ? 'skill' : 'normal';
  const seedNames = ['Samurai', 'Militia', 'Apprentice', 'Forester', 'Scout', 'Viking', 'Druid', 'Battlemage', 'Captain', 'Warlock'];
  const seed = seedNames.map(name => byName.get(name.toLowerCase())).filter(Boolean).map(hero => ({ id: hero.id, level: 15000, locked: false }));
  for (const hero of DATA.heroes) { if (seed.length >= 10) break; if (!seed.some(slot => slot.id === hero.id)) seed.push({ id: hero.id, level: 15000, locked: false }); }
  seed.forEach((slot, index) => { slot.tile = defaultTile(index); });
  function bestAttacker(team, settings, focus = 'damage', preferredId = null) {
    const metric = focus === 'gold' ? 'gold' : focus === 'experience' ? 'experience' : 'damage';
    const heroes = ENGINE.evaluate(team, { ...settings, damageSupportMode: damageSupportModeFor(focus), damageHero: null, goldHero: null }).heroes;
    const preferred = preferredId ? heroes.filter(hero => hero.id === preferredId) : [];
    const candidates = preferred.length ? preferred : heroes;
    return candidates.length ? candidates.reduce((best, hero) => hero.metrics[metric] > best.metrics[metric] ? hero : best).index : null;
  }
  function defaultTeamName(focus, key) {
    const tag = tagFor(focus);
    return tag ? tag.name + ' ' + key.toUpperCase() : key === 'a' ? 'Baseline' : 'Challenger';
  }
  function newComparison(focus) {
    const ids = [...new Set([...requiredHeroesByFocus[focus], ...seed.map(slot => slot.id)])].slice(0, 10);
    const base = ids.map((id, index) => ({id,level:15000,locked:false,tile:defaultTile(index)}));
    const tag = tagFor(focus);
    const skillSlot = tag && base.find(slot => slot.tile === 'skill');
    if (skillSlot) [base[0].tile, skillSlot.tile] = [skillSlot.tile, base[0].tile];
    const teams = { a: base.map(slot => ({ ...slot })), b: base.map(slot => ({ ...slot })) };
    const attackers = tag ? {a: 0, b: 0} : { a: bestAttacker(teams.a, defaults, focus), b: bestAttacker(teams.b, defaults, focus) };
    const names = {a: defaultTeamName(focus, 'a'), b: defaultTeamName(focus, 'b')};
    const panel = { teams, names, attackers, teamAReady: false, showTeamB: false, chooseAttacker: false, levelingTargets: focus === 'experience' ? { ...attackers } : { a: null, b: null } };
    if (focus === 'experience') {
      panel.experienceOptions = {a: xpOptions(), b: xpOptions()};
      for (const key of ['a', 'b']) teams[key][attackers[key]].level = 1;
    }
    return panel;
  }
  function newImmortalComparison(mode) {
    const first = mode === 'skill' ? ['champion',...buffTeamIds] : mode === 'melee' ? ['champion'] : [];
    const eligible = mode === 'skill' ? seed.map(slot => slot.id) : DATA.heroes.filter(hero => window.IMMORTAL_HERO_TYPES[hero.id] === mode).map(hero => hero.id);
    const ids = [...new Set([...first, ...eligible])].slice(0, 10);
    const team = ids.map((id, i) => ({id, level: 15000, locked: false, tile: defaultTile(i)}));
    return {teams: {a:team, b:team.map(slot => ({...slot}))}, names:{a:'Baseline',b:'Challenger'},
      attackers:{a:null,b:null}, levelingTargets:{a:null,b:null}, teamAReady:false, showTeamB:false, chooseAttacker:false};
  }
  function newImmortalSetup() {
    return {config:immortalEngine.normalize({mode:'skill',buffTeam:'deploy'}), buffTeams:{...buffPresets}, meleePriority:'strikes', priorities:{mage:'hits',ranged:'hits'},
      teams:Object.fromEntries(Object.keys(immortalModes).map(mode => [mode,newImmortalComparison(mode)]))};
  }
  function immortalConfig(setup, mode) {
    const priority = mode === 'melee' ? setup.meleePriority : setup.priorities[mode];
    return immortalEngine.normalize({...setup.config,mode,buffTeam:setup.buffTeams[mode],priority});
  }
  function immortalTotal(result, priority) {
    const objective = immortalObjectives[priority];
    return `${number(result[objective.key])} ${objective.label}`;
  }
  function immortalUltraSummary(result) {
    if (!result.attackingHeroes) return 'No attackers with crit-eligible hits';
    const coverage = `${result.guaranteedPassiveUltraHeroes}/${result.attackingHeroes} attackers at 100% Ultra without temporary buffs`;
    return result.lowestPassiveUltraProbability === 1 ? coverage
      : `${coverage} · lowest ${ultraPercent(result.lowestPassiveUltraProbability)}`;
  }
  function ultraPercent(probability) {
    const percent = probability * 100, rounded = number(percent);
    if (percent > 99.99 && rounded === '100' && probability < 1) return percent + '%';
    return rounded + '%';
  }
  function renderImmortalAttributes(config) {
    for (const [id,stat] of immortalAttributeFields) {
      const rank = stat === 'speed' ? config.heroSpeedRanks[immortalAttributeHero] : config.heroCritRanks?.[immortalAttributeHero]?.[stat];
      $(id).value = rank ?? 0;
    }
  }
  function damagePreTeamChances() {
    const ref = state.settings.chanceReferences?.damage;
    return ref?.mode === 'preTeam' && Array.isArray(ref.totals) && ref.totals.length === 3 && ref.totals.every(Number.isFinite) ? ref.totals : null;
  }
  defaults.experienceVeteranStacks = 100;
  defaults.experienceTile = ENGINE.defaults.experienceTile ?? 20;
  defaults.experienceSkills = true;
  for (const [key,, ,value] of experienceSkillFields) defaults[key] = ENGINE.defaults[key] ?? value;
  defaults.experienceBaseRankXp = 100;
  defaults.experienceReference = ENGINE.defaultExperienceReference();
  defaults.chanceReferences = ENGINE.defaultChanceReferences();
  defaults.heroAscensions = {};
  for (const {baseSetting} of Object.values(tagFocuses)) defaults[baseSetting] = ENGINE.defaults[baseSetting];
  Object.assign(defaults, {goldMimicFarming: true, goldMimicGoldBonus: 340, goldWaveBossGoldBonus: 0,
    goldEnemiesPerMimicEncounter: 20, goldDoubleMimicPercent: 0});
  const mimicFields = [
    ['gold-mimic-bonus', 'goldMimicGoldBonus', 0, 1e9],
    ['gold-wave-boss-bonus', 'goldWaveBossGoldBonus', 0, 1e9],
    ['gold-mimic-encounter-size', 'goldEnemiesPerMimicEncounter', 1, 1e9],
    ['gold-mimic-doubles', 'goldDoubleMimicPercent', 0, 100]
  ];
  const rateFields = [['gold-mimic-enemies', 'enemiesPerHour'], ['gold-mimic-rate', 'mimicKillsPerHour']];
  let goldRateTeamSignatures = {};
  function measuredRate(value) {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
    const rate = Number(value);
    return Number.isFinite(rate) && rate >= 0 ? rate : null;
  }
  const setupVersion = 21;
  let ascensionHero = 'hunter';
  let ascensionScope = 'account';
  const ascensionFields = [
    ['ascension-milestone', 'milestoneLevel'],
    ['ascension-synergy', 'synergyLevel'],
    ['ascension-kill-gold', 'killGoldLevel'],
    ['ascension-damage', 'damageLevel'],
    ['ascension-max-attack-speed', 'maxAttackSpeedLevel'],
    ['ascension-min-skill-cooldown', 'minSkillCooldownLevel'],
    ['ascension-free-hero-level', 'freeHeroLevelChanceLevel'],
    ['ascension-synergy-reduction', 'synergyReductionLevel'],
    ['ascension-global-damage', 'globalDamageLevel'],
    ['ascension-global-kill-gold', 'globalKillGoldLevel'],
    ['ascension-global-rank-exp', 'globalRankExpLevel'],
    ['ascension-global-energy-income', 'globalEnergyIncomeLevel']
  ];
  let state = { version: setupVersion, immortal: newImmortalSetup(), focus: 'energy', settings: { ...defaults }, supportRanking: { ...supportDefaults }, focusTeams: Object.fromEntries(Object.keys(standardFocusNames).map(focus => [focus, newComparison(focus)])), allowed: DATA.heroes.map(hero => hero.id) };
  // Older saves include two sample lineups even if the player never built Team B.
  // An Experience attacker's computed slot can change just by opening that focus.
  function lineupSignature(panel, key) {
    return JSON.stringify([panel.teams[key], panel.names[key], panel.experienceOptions ? null : panel.attackers[key],
      panel.levelingTargets[key], panel.experienceOptions?.[key], panel.ascensionOverrides?.[key],
      ...rateFields.map(([, field]) => panel[field]?.[key] ?? null)]);
  }
  const sampleLineups = Object.fromEntries(Object.entries({...state.focusTeams, ...state.immortal.teams})
    .map(([focus, panel]) => [focus, {a:lineupSignature(panel, 'a'), b:lineupSignature(panel, 'b')}]));
  const isImmortal = () => state.focus === 'immortal';
  const comparison = () => isImmortal() ? state.immortal.teams[state.immortal.config.mode] : state.focusTeams[state.focus];
  const comparingTeams = () => comparison().showTeamB === true;
  const visibleTeamKeys = () => comparingTeams() ? ['a', 'b'] : ['a'];
  const rankingTeam = () => comparingTeams() ? state.supportRanking.team : 'a';
  const isDamageFocus = () => objectiveFor(state.focus) === 'damage';
  const hasAttacker = () => isDamageFocus() || state.focus === 'gold';
  function settingsForLineup(settings, panel, key) {
    const overrides = panel.ascensionOverrides?.[key];
    if (!overrides) return settings;
    const heroAscensions = {...settings.heroAscensions};
    for (const [id, profile] of Object.entries(overrides)) heroAscensions[id] = {...heroAscensions[id], ...profile};
    return {...settings, heroAscensions};
  }
  function setLineupAscensions(panel, key, overrides) {
    const profiles = ENGINE.normalizeHeroAscensions(overrides);
    if (Object.keys(profiles).length) {
      panel.ascensionOverrides ??= {};
      panel.ascensionOverrides[key] = profiles;
    } else if (panel.ascensionOverrides) {
      delete panel.ascensionOverrides[key];
      if (!Object.keys(panel.ascensionOverrides).length) delete panel.ascensionOverrides;
    }
  }
  function teamSettings(key) {
    const panel = comparison(), attacker = panel.attackers[key];
    const settings = {...settingsForLineup(state.settings, panel, key), damageSupportMode: damageSupportModeFor(state.focus), damageHero: attacker, goldHero: attacker, experienceHero: attacker, requiredHeroes: [...(requiredHeroesByFocus[state.focus] || [])]};
    if (state.focus === 'experience') {
      const options = panel.experienceOptions[key];
      Object.assign(settings, {experienceLeveler: panel.levelingTargets[key], experienceStyle: options.style, experienceAttacker: options.attacker, experienceSupportLevel: options.supportLevel, experienceOptimizeSupportStyles: options.optimizeSupportStyles});
    }
    return settings;
  }
  let detailTeam = 'a', detailTab = 'bonuses', detailScope = 'global', results = {}, busy = false;
  let supportResult = null, supportCacheKey = '';
  let roadmap = null, roadmapWorker = null;
  let lastExperienceReference = defaults.experienceReference;
  let experienceCaptureGrandMaster = defaults.experienceReference.styleId === 'grandMaster';
  let chanceReferenceDrafts = {};
  function savedMilestoneSettings(s, legacyAscensions) {
    // Until v21 the stored strength included the rank-five bonus, even when a hero overrode that rank.
    const fallback = legacyAscensions ? 2.8125 : defaults.milestoneScale;
    return {
      milestoneScale: clamp(s.milestoneScale ?? fallback, 0, 100, fallback) / (legacyAscensions ? 1.5 : 1),
      defaultMilestoneLevel: legacyAscensions ? 5 : Math.round(clamp(s.defaultMilestoneLevel ?? 0, 0, 5, 0))
    };
  }

  function validate(candidate) {
    if (!candidate || typeof candidate !== 'object') throw new Error('This file is not a Hero Team Lab setup.');
    if (candidate.version !== undefined && (!Number.isInteger(candidate.version) || candidate.version < 1 || candidate.version > setupVersion)) throw new Error(`This setup version is not supported. Choose a version 1–${setupVersion} setup.`);
    const legacy = candidate.version === undefined || candidate.version === 1;
    const previousVersion = candidate.version === undefined || candidate.version < 3;
    const legacyAscensions = (candidate.version ?? 1) < 21;
    const clean = { version: setupVersion, immortal: newImmortalSetup(), focus: Object.hasOwn(focusNames, candidate.focus) ? candidate.focus : 'energy', settings: { ...defaults }, supportRanking: { ...supportDefaults }, focusTeams: {}, allowed: [] };
    const s = candidate.settings || {};
    for (const tag of Object.values(tagFocuses)) clean.settings[tag.baseSetting] = clamp(s[tag.baseSetting] ?? 0, 0, 1e9, 0);
    clean.settings.heroAscensions = ENGINE.normalizeHeroAscensions(s.heroAscensions);
    clean.settings.goldMimicFarming = s.goldMimicFarming !== false;
    for (const [, key, min, max] of mimicFields) clean.settings[key] = clamp(s[key] ?? defaults[key], min, max, defaults[key]);
    clean.settings.experienceVeteranStacks = Math.round(clamp(s.experienceVeteranStacks ?? 100, 0, 100, 100));
    clean.settings.experienceSkills = s.experienceSkills !== false;
    clean.settings.experienceTile = clamp(s.experienceTile ?? defaults.experienceTile, 0, 1000000000, defaults.experienceTile);
    for (const [key,,,fallback,min,max] of experienceSkillFields) clean.settings[key] = clamp(s[key] ?? fallback,min,max,fallback);
    for (const key of ['experienceWave','experienceBallistaStacks','experienceVeteranStacks']) clean.settings[key] = Math.floor(clean.settings[key]);
    clean.settings.experienceBaseRankXp = clamp(s.experienceBaseRankXp ?? 100, 1, 1e100, 100);
    clean.settings.experienceReference = Object.hasOwn(s, 'experienceReference')
      ? ENGINE.normalizeExperienceReference(ENGINE.upgradeExperienceReference(s.experienceReference))
      : clean.settings.experienceBaseRankXp === 100 ? ENGINE.defaultExperienceReference() : null;
    if (s.experienceReference != null && !clean.settings.experienceReference) throw new Error('The saved Experience reference is invalid.');
    clean.settings.chanceReferences = Object.fromEntries(chanceFocuses.map(focus => {
      const saved = s.chanceReferences?.[focus];
      const useDefault = saved === undefined || saved === null && (candidate.version === undefined || candidate.version < 15);
      const reference = ENGINE.normalizeChanceReference(useDefault ? defaults.chanceReferences[focus] : saved, focus);
      if (saved != null && !reference) throw new Error(`The saved ${focusNames[focus]} chance reference is invalid.`);
      if (legacyAscensions && reference?.captureSettings) Object.assign(reference.captureSettings, savedMilestoneSettings(reference.captureSettings, true));
      return [focus, reference];
    }));
    clean.settings.maxTier = Math.round(clamp(s.maxTier ?? 9, 1, 9, 9));
    Object.assign(clean.settings, savedMilestoneSettings(s, legacyAscensions));
    clean.settings.synergyScale = clamp(s.synergyScale ?? 1, 0, 100, 1);
    clean.settings.synergyEvent = s.synergyEvent === undefined ? defaults.synergyEvent : s.synergyEvent === true;
    clean.settings.damageSkills = s.damageSkills !== false;
    clean.settings.damageSupportSkills = s.damageSupportSkills !== false;
    for (const key of ['damageSupportSeconds', 'damageSupportStacks', 'damageSupportTeleports', ...damageSupportFields.map(field => field.key)]) clean.settings[key] = s[key] ?? defaults[key];
    // Switch existing setups to the requested pushing scenario once. Later edits persist.
    if (candidate.version === undefined || candidate.version < 10) clean.settings.damageSupportStacks = 0;
    clean.settings.damageNecromancerRoll = s.damageNecromancerRoll === 'maximum' ? 'maximum' : 'midpoint';
    for (const key of ['damageTile', 'damageSkillTileBoost', 'damageMasteryTileBoost', ...damageProfileFields.map(field => field.key)]) clean.settings[key] = clamp(s[key] ?? defaults[key], 0, 1000000000, defaults[key]);
    clean.settings.damageWardenDistance = clamp(s.damageWardenDistance ?? 10.7, 0, 1000000, 10.7);
    const damageSettings = ENGINE.settingsFor(clean.settings);
    for (const key of Object.keys(clean.settings).filter(key => key.startsWith('damage'))) clean.settings[key] = damageSettings[key];
    clean.settings.goldSkills = s.goldSkills !== false;
    for (const [, key] of goldFields) clean.settings[key] = clamp(s[key] ?? defaults[key], 0, 1000000000, defaults[key]);
    clean.settings.goldCrusaderAttacks = Math.floor(clamp(s.goldCrusaderAttacks ?? defaults.goldCrusaderAttacks, 0, 1000000, defaults.goldCrusaderAttacks));
    clean.settings.accountSynergyBoosts = s.accountSynergyBoosts !== false;
    for (const [, key, max] of accountSynergyFields) {
      const fallback = legacyAscensions && (key === 'heroSynergyDefault' || key === 'heroSynergyCrusader') ? 25 : defaults[key];
      clean.settings[key] = clamp(s[key] ?? fallback, 0, max, fallback);
    }
    // Older setups predate the user's confirmed Crusader upgrade to +25%.
    // The new event flag also marks setups that can intentionally retain +15%.
    if (legacyAscensions && s.synergyEvent === undefined && Number(s.heroSynergyCrusader) === 15) clean.settings.heroSynergyCrusader = 25;
    clean.settings.overflowRate = clamp(s.overflowRate ?? 5, 0, 100, 5);
    clean.settings.baseOverflow = clamp(s.baseOverflow ?? 0, 0, 1000000, 0);
    clean.settings.baseEnergy = previousVersion && (s.baseEnergy == null || Number(s.baseEnergy) === 1) ? defaults.baseEnergy : clamp(s.baseEnergy ?? defaults.baseEnergy, 0.001, 1000000, defaults.baseEnergy);
    clean.settings.requirementReduction = (s.requirementReduction ?? legacyAscensions) ? 1 : 0;
    clean.settings.ultraExpMode = ['exclude', 'amount', 'chance'].includes(s.ultraExpMode) ? s.ultraExpMode : 'exclude';
    clean.settings.grandMaster = s.grandMaster !== false;
    clean.settings.grandMasterStacking = legacy ? 'multiply' : s.grandMasterStacking === 'add' ? 'add' : 'multiply';
    clean.settings.synergyGrandMasterStacking = s.synergyGrandMasterStacking === 'add' ? 'add' : 'multiply';
    clean.settings.snowFort = s.snowFort !== false;
    for (const key of ['mapT56', 'mapT7', 'mapMastery']) clean.settings[key] = clamp(s[key] ?? defaults[key], 0, 10000, defaults[key]);
    clean.settings.mapAttackSpeed = clamp(s.mapAttackSpeed ?? -20, -99.9, 10000, -20);
    if (candidate.immortal) {
      const saved = candidate.immortal;
      clean.immortal.config = immortalEngine.normalize(saved.config || {});
      for (const mode of Object.keys(immortalModes)) {
        const preset = saved.buffTeams?.[mode] ?? (saved.config?.mode === mode ? saved.config?.buffTeam : undefined);
        if (['deploy','swap','warlock'].includes(preset)) clean.immortal.buffTeams[mode] = preset;
        if (usesAttackPriority(mode) && ['hits','attacks','damage'].includes(saved.priorities?.[mode])) clean.immortal.priorities[mode] = saved.priorities[mode];
      }
      clean.immortal.meleePriority = saved.meleePriority === 'damage' ? 'damage' : 'strikes';
      clean.immortal.config = immortalConfig(clean.immortal, clean.immortal.config.mode);
    }
    for (const focus of [...Object.keys(standardFocusNames), ...Object.keys(immortalModes)]) {
      if (tagFor(focus) && !Object.hasOwn(candidate.focusTeams || {}, focus)) {
        clean.focusTeams[focus] = newComparison(focus);
        continue;
      }
      const boss = Object.hasOwn(immortalModes, focus);
      if (boss && !candidate.immortal?.teams && (candidate.version === undefined || candidate.version < 13)) continue;
      const sourceFocus = focus === 'damageBuffSwap' && candidate.version < 11 ? 'damage' : focus === 'powerMageEnergy' && candidate.version < 6 ? 'energy' : focus;
      const source = boss ? candidate.immortal?.teams?.[focus] : previousVersion && !tagFor(focus) ? candidate : candidate.focusTeams?.[sourceFocus];
      if (!source?.teams) throw new Error(`The setup is missing its ${focusNames[focus] || immortalModes[focus] + ' Immortal'} teams.`);
      const panel = { teams: {}, names: {}, attackers: {}, chooseAttacker: source.chooseAttacker === true, levelingTargets: {} };
      if (focus === 'gold') for (const [, field] of rateFields) {
        if (source[field]) panel[field] = {a: measuredRate(source[field].a), b: measuredRate(source[field].b)};
      }
      const legacyGold = candidate.version === undefined || candidate.version < 4;
      if (focus === 'gold' && legacyGold) panel.chooseAttacker = false;
      for (const key of ['a', 'b']) {
        if (candidate.version >= 20) setLineupAscensions(panel, key, source.ascensionOverrides?.[key]);
        if (!Array.isArray(source.teams[key]) || source.teams[key].length > 10) throw new Error('Each team must contain at most 10 hero slots.');
        const team = source.teams[key].map((slot, index) => { if (!slot || !byId.has(slot.id)) throw new Error('The setup contains an unknown hero.'); if (slot.tile !== undefined && !Object.hasOwn(tileNames, slot.tile)) throw new Error('The setup contains an unknown placement tile.'); return { id: slot.id, level: Math.round(clamp(slot.level, 0, 1000000, 15000)), locked: slot.locked === true, tile: slot.tile ?? defaultTile(index), ...(focus === 'experience' && Object.hasOwn(supportStyleLevels, slot.combatStyle) ? {combatStyle:slot.combatStyle} : {}) }; });
        if (focus === 'experience') for (const id of new Set(team.map(slot => slot.id))) {
          const styles = new Set(team.filter(slot => slot.id === id && slot.combatStyle).map(slot => slot.combatStyle));
          if (styles.size > 1) throw new Error('Copies of the same Experience hero must share a support combat style.');
        }
        for (const hero of DATA.heroes) if (team.filter(slot => slot.id === hero.id).length > 3) throw new Error(`Team ${key.toUpperCase()} has more than three copies of ${hero.name}.`);
        for (const tile of ['milestone', 'synergy', 'skill', 'killGold', 'damage', 'experience']) if (team.filter(slot => slot.tile === tile).length > tileLimit(tile)) throw new Error(`Team ${key.toUpperCase()} uses more than ${tileLimit(tile)} ${tileNames[tile]} tiles.`);
        if (focus !== 'experience' && team.some(slot => slot.tile === 'experience')) throw new Error('The XP +20% tile is available in the Experience focus.');
        panel.teams[key] = team;
        panel.names[key] = typeof source.names?.[key] === 'string' ? source.names[key].slice(0, 40) : defaultTeamName(focus, key);
        if (boss) { panel.attackers[key] = null; panel.levelingTargets[key] = null; continue; }
        const attacker = previousVersion ? s.damageHero : source.attackers?.[key];
        const lineupSettings = settingsForLineup(clean.settings, panel, key);
        panel.attackers[key] = focus === 'gold' && legacyGold ? bestAttacker(team, lineupSettings, 'gold', key === 'a' ? 'hunter' : null) : Number.isInteger(attacker) && attacker >= 0 && attacker < team.length ? attacker : bestAttacker(team, lineupSettings, focus);
        const target = source.levelingTargets?.[key];
        panel.levelingTargets[key] = Number.isInteger(target) && target >= 0 && target < team.length ? target : null;
        if (focus === 'experience') {
          panel.levelingTargets[key] ??= candidate.version >= 5 ? panel.attackers[key] : bestAttacker(team, lineupSettings, 'experience');
          const slot = team[panel.levelingTargets[key]];
          if (slot) slot.level = Math.max(1, slot.level);
          panel.experienceOptions ??= {};
          const saved = source.experienceOptions?.[key], options = xpOptions(Math.round(clamp(saved?.supportLevel ?? slot?.level ?? 15000, 0, 1000000, 15000)));
          if (ENGINE.experienceStyles.some(style => style.id === saved?.style && style.level <= slot?.level)) options.style = saved.style;
          if (saved?.attacker === 'self' || Number.isInteger(saved?.attacker) && team[saved.attacker]) options.attacker = saved.attacker;
          if (Number.isInteger(options.attacker) && options.attacker === panel.levelingTargets[key]) options.attacker = 'self';
          options.optimizeSupportStyles = saved?.optimizeSupportStyles !== false;
          panel.experienceOptions[key] = options;
          syncLevelingCopies(panel, key);
          if (candidate.version < 12) panel.attackers[key] = panel.levelingTargets[key];
        }
      }
      panel.showTeamB = typeof source.showTeamB === 'boolean' ? source.showTeamB
        : panel.chooseAttacker || lineupSignature(panel, 'b') !== sampleLineups[focus].b;
      panel.teamAReady = panel.teams.a.length > 0 && (panel.showTeamB || (typeof source.teamAReady === 'boolean'
        ? source.teamAReady : lineupSignature(panel, 'a') !== sampleLineups[focus].a));
      if (boss) clean.immortal.teams[focus] = panel;
      else clean.focusTeams[focus] = panel;
    }
    clean.allowed = Array.isArray(candidate.allowed) ? [...new Set(candidate.allowed.filter(id => byId.has(id)))] : DATA.heroes.map(hero => hero.id);
    const ranking = candidate.supportRanking || {};
    clean.supportRanking.level = Math.round(clamp(ranking.level ?? supportDefaults.level, 0, 1000000, supportDefaults.level));
    clean.supportRanking.grandMasterCount = Math.round(clamp(ranking.grandMasterCount ?? supportDefaults.grandMasterCount, 0, 10, supportDefaults.grandMasterCount));
    clean.supportRanking.tile = ['milestone', 'skill'].includes(ranking.tile) ? ranking.tile : 'normal';
    if (ranking.includeGlobalAscensions === false) clean.supportRanking.includeGlobalAscensions = false;
    clean.supportRanking.xpReference = ENGINE.xpRankingReference(ranking.xpReference);
    clean.supportRanking.damageReference = ENGINE.damageRankingReference(ranking.damageReference);
    clean.supportRanking.team = ranking.team === 'b' ? 'b' : 'a';
    clean.supportRanking.lineupOnly = ranking.lineupOnly === true;
    clean.supportRanking.slot = Math.floor(clamp(ranking.slot, 0, 9, 0));
    clean.supportRanking.selectedHero = byId.has(ranking.selectedHero) ? ranking.selectedHero : null;
    return clean;
  }
  function applySetup(candidate) {
    state = validate(candidate);
    ascensionScope = 'account';
    goldRateTeamSignatures = {};
    lastExperienceReference = state.settings.experienceReference || defaults.experienceReference;
    experienceCaptureGrandMaster = lastExperienceReference.styleId === 'grandMaster';
    chanceReferenceDrafts = {};
    const previousVersion = candidate.version !== setupVersion;
    $('migration-notice').hidden = !previousVersion;
    if (candidate.version === 20) {
      $('migration-title').textContent = 'Your ascension defaults were carried forward';
      $('migration-description').textContent = 'My ascensions keeps your previous bonuses for heroes with empty fields. Choose “Start unentered ascensions at zero” there to use the new defaults and keep your recorded ranks and team builds.';
    } else if (candidate.version === 19) {
      $('migration-title').textContent = 'Your ascension baseline is ready';
      $('migration-description').textContent = 'Your saved hero levels now appear under My ascensions. Fill in personal and global upgrades there, then choose a Team A or Team B build to try a different allocation for one lineup.';
    } else if (candidate.version === 18) {
      $('migration-title').textContent = 'Hero ascensions and Mimic farming are available';
      $('migration-description').textContent = 'Open Hero ascensions to enter a hero’s Milestone Bonus, Synergy Bonus and personal Kill Gold levels. Each hero starts with your existing account assumptions. Gold now compares expected Mimic payouts. Switch off Mimic farming in Gold settings to use the legacy boss index.';
    } else if (candidate.version === 17) {
      $('migration-title').textContent = 'Compare XP support combat styles';
      $('migration-description').textContent = 'Your saved teams retain their current styles. Experience suggestions can now compare Grand Master, Tycoon and Magnate on support heroes. Each team can keep manual support styles by disabling the new style-search checkbox.';
    } else if (candidate.version === 16) {
      $('migration-title').textContent = 'Compare the boss attacker’s XP tile';
      $('migration-description').textContent = 'The XP +20% tile boosts the boss attacker’s kill reward. Veteran’s Exp Share passes that reward to the team. Compare attacker placements or rerun suggestions and the leveling plan.';
    } else if (candidate.version === 15) {
      $('migration-title').textContent = 'Required XP heroes and skill profiles are ready';
      $('migration-description').textContent = 'Experience suggestions include at least one Archer, Ballista and Veteran. Gold requires Hunter, Rogue and Sovereign; the XP trio is optional in other modes. Existing lineups are retained. The editable XP profile uses your no-tile captures and wave 75,000. Skill Power tiles strengthen the heroes’ active abilities. The wave and stack bonuses use account Mastery Power.';
    } else if (candidate.version === 14) {
      $('migration-title').textContent = 'Gold and Damage chance references are ready';
      $('migration-description').textContent = 'Gold now uses your pre-team chances of 50% Super / 50% Ultra; Damage uses 135% Crit / 109% Super / 48% Ultra. Gold, Damage and Damage · Buff swap save independent references. The original default XP capture is updated to Archer level 5,000 with ten Grand Masters and 260% Super / 450% Ultra EXP chance; custom captures are retained.';
    } else if (candidate.version === 13) {
      $('migration-title').textContent = 'Experience account totals are ready';
      $('migration-description').textContent = state.settings.experienceReference
        ? 'Experience compares changes from the recorded team. The default is your Wizard/Viking team with Archer level 5,000, ten Grand Masters, +66M Rank EXP and 260% Super / 450% Ultra EXP chance. Check or recapture the reference in the leveling plan.'
        : 'Your manual pre-team Rank XP baseline was retained. Experience can now use recorded team totals; choose that mode in the leveling plan to capture a reference team.';
    } else if (candidate.version === 12) {
      $('migration-title').textContent = 'Immortal Boss Damage is ready';
      $('migration-description').textContent = 'Choose Immortal Boss Damage to compare four boss rules, each with its own Team A and Team B.';
    } else if (candidate.version === 11) {
      $('migration-title').textContent = 'Experience leveling plans are ready';
      $('migration-description').textContent = 'Your saved leveling heroes and levels were kept. Open Experience to compare direct kills with Veteran’s Exp Share and plan the climb to level 4,500.';
    } else if (previousVersion) {
      const legacyPair = candidate.version === undefined || candidate.version < 3;
      const upgradedEnergy = legacyPair && (candidate.settings?.baseEnergy == null || Number(candidate.settings.baseEnergy) === 1);
      $('migration-title').textContent = 'Experience leveling plans are ready';
      $('migration-description').textContent = `Your saved leveling targets and levels were kept. Experience now compares direct kills with Veteran’s Exp Share and checks the target’s style and synergy unlocks.${candidate.version < 11 ? ' Damage · Buff swap starts with its own copy of your Damage teams.' : ''}${candidate.version === undefined || candidate.version < 10 ? ' Damage kill stacks are now 0 for pushing high levels. Battlemage and Spelldancer keep their active buffs; time-based mastery is independent of kills.' : ''} Timed mastery uses ${number(state.settings.damageSupportSeconds)} seconds and standard Damage uses ${number(state.settings.damageSupportTeleports)} Skymage teleports.${legacyPair ? ' Your existing A/B teams were copied into each focus.' : ''}${candidate.version === undefined || candidate.version < 6 ? ' Energy + Power Mages starts with independent copies of your Energy A/B teams.' : ''}${candidate.version === undefined || candidate.version < 5 ? ' Damage, Gold and XP use one attacker per team. Gold includes Boss Gold and suggestions require Hunter, Rogue and Sovereign.' : ''}${upgradedEnergy ? ' Base energy income is now 10,000.' : ''}${candidate.version === undefined || candidate.version === 1 ? ' Grand Master milestones now use the screenshot-supported compounded stacking (1.1ⁿ).' : ''}`;
    }
  }
  function alert(message) { $('alert').textContent = message; $('alert').hidden = !message; }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); $('save-status').textContent = 'Saved on this device'; }
    catch { $('save-status').textContent = 'Export to keep your setup'; }
  }
  try { const stored = localStorage.getItem(storageKey); if (stored) applySetup(JSON.parse(stored)); } catch (error) { alert(`The saved setup could not be loaded: ${error.message} The example lineups are shown.`); }
  function related(type) {
    if (isImmortal()) return /Skill Power|Mastery Power|Damage|Attack Speed|Crit|Milestone Bonus|Synergy/.test(type);
    if (/Milestone Bonus|Synergy/.test(type)) return true;
    if (tagFor(state.focus)) return type === 'Skill Power' || type === 'Skill Power (tile)';
    if (state.focus === 'energy') return /Energy/.test(type) && type !== 'Power Mage Energy';
    if (state.focus === 'powerMageEnergy') return /Energy/.test(type);
    if (state.focus === 'gold') return /Gold/.test(type);
    if (state.focus === 'experience') return /Exp|Experience/.test(type);
    return /Damage|Crit|Attack Speed/.test(type);
  }
  const immortalStats = new Set(['Damage','Damage Taken','Ultra Boss Damage','Attack Speed','Triple Shot Damage','Splash Damage','Crit Damage','Super Crit Damage','Ultra Crit Damage','Crit Chance','Super Crit Chance','Ultra Crit Chance','Skill Power','Mastery Power','Mastery Skill Power','Skill Power (tile)','Skill Duration']);
  const isScoredStat = type => isImmortal() ? immortalStats.has(type) : scoredStats.has(type) || tagFor(state.focus) && ['Skill Power', 'Skill Power (tile)'].includes(type) || state.focus === 'experience' && ['Boss Exp', 'Rank Exp Multiplier'].includes(type);
  function bonusFormat(type, value) { if (ENGINE.statMode(type) === 'multiply') return '×' + number(value ?? 1); const total = value ?? 0; return (total >= 0 ? '+' : '') + number(total) + (/Chance/.test(type) ? ' pp' : !isScoredStat(type) ? ' raw' : ''); }
  function effectFormat(effect) { const unit = effect.unit ? effect.unit === 'percent' ? /Chance/.test(effect.type) ? ' pp' : '%' : '' : /Chance/.test(effect.type) ? ' pp' : ['style', 'map', 'placement'].includes(effect.kind) || ENGINE.statMode(effect.type) === 'multiply' ? '%' : ['Energy Income', 'Rank Exp'].includes(effect.type) ? '' : ' raw'; return (effect.value >= 0 ? '+' : '') + number(effect.value) + unit; }
  function supportMultiplier(value) { return Number.isFinite(value) ? `×${scoreFormat(value)}` : '—'; }
  function parseRankXp(text) {
    const match = String(text).trim().match(/^(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+)|([kmbt]))?$/i);
    if (!match) return NaN;
    if (match[2]) return Number(match[1] + 'e' + match[2]);
    const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    return Number(match[1]) * (scale[match[3]?.toUpperCase()] ?? 1);
  }
  function formatRankXp(value) {
    if (value >= 1e15) return value.toExponential();
    for (const [suffix, scale] of [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]]) {
      if (value >= scale && value / scale * scale === value) return String(value / scale) + suffix;
    }
    return String(value);
  }
  function renderXpFactors(hero, reference) {
    const factors = hero.xpFactors;
    const addedChance = (hero.bonuses['Super Exp Chance'] || 0) + (hero.bonuses['Ultra Exp Chance'] || 0);
    const rows = [
      ['Rank XP', '+' + number(hero.bonuses['Rank Exp'] || 0) + ' on ' + formatRankXp(reference.rankXp), factors.rankXp],
      ...(factors.rankMultiplier > 1 ? [['Global Rank EXP', 'Saved ascension upgrade', factors.rankMultiplier]] : []),
      ['Super XP Amount', 'Multiplier on current payout', factors.superAmount],
      ['Ultra XP Amount', 'Multiplier on current payout', factors.ultraAmount],
      ['Chance spillover', '+' + number(addedChance) + ' pp on ' + number(reference.excessPoints) + ' excess pp', factors.spillover]
    ];
    return `<p class="support-detail-label">Experience gain · ${supportMultiplier(hero.multipliers.experience)}</p><div class="support-effect-scroll"><table><thead><tr><th>Factor</th><th>Applied to</th><th class="numeric">XP gain</th></tr></thead><tbody>${rows.map(([label, basis, factor]) => `<tr><td>${label}</td><td>${basis}</td><td class="numeric">×${precise(factor)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderCritFactors(hero, reference) {
    const bonuses = hero.damageWithSupportBonuses;
    const gain = hero.damageWithSupportSpilloverGain;
    const rows = [['Crit Chance', reference.critChance], ['Super Crit Chance', reference.superChance], ['Ultra Crit Chance', reference.ultraChance]];
    return `<p class="support-detail-label">Critical chance contribution · ×${precise(gain)} Damage</p><div class="support-effect-scroll"><table><thead><tr><th>Tier</th><th class="numeric">Current chance</th><th class="numeric">Hero adds</th></tr></thead><tbody>${rows.map(([type, total]) => `<tr><td>${type}</td><td class="numeric">${number(total)}%</td><td class="numeric">+${number(bonuses[type] || 0)} pp</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderSupportTable(rows, label, formatValue) {
    const options = state.supportRanking;
    const key = rankingTeam();
    const deployed = new Set(comparison().teams[key].map(slot => slot.id));
    const pool = options.lineupOnly ? rows.filter(row => deployed.has(row.id)) : rows;
    const query = $('support-search').value.trim().toLowerCase();
    const visible = pool.filter(row => row.name.toLowerCase().includes(query));
    const selected = visible.find(row => row.id === options.selectedHero) || visible[0];
    const scope = options.lineupOnly ? `Team ${key.toUpperCase()} lineup` : 'Full roster';
    const immortal = isImmortal();
    $('support-roster-count').textContent = `${number(visible.length)} of ${number(pool.length)} heroes · ${scope} · ${label}`;
    const body = visible.map(row => `<tr class="${row === selected ? 'support-selected-row' : ''}">
      <td class="numeric support-rank">${row.rank ?? '—'}</td><th scope="row"><button class="support-hero-button" data-support-hero="${esc(row.id)}" data-hero-class="${immortalEngine.typeOf(row.id)}" aria-pressed="${row === selected}" title="${esc(immortalModes[immortalEngine.typeOf(row.id)])}">${heroPortrait(row.id)}<span>${esc(row.name)}</span></button></th>
      ${immortal ? `<td class="numeric">${row.result?.attackingHeroes ? ultraPercent(row.result.lowestPassiveUltraProbability) : '—'}</td>` : ''}
      <td class="numeric support-sorted-value" title="${esc(row.reason || precise(row.value))}">${row.reason ? '—' : formatValue(row.value)}</td></tr>`).join('');
    const empty = query ? 'No heroes match this search.' : 'No heroes to rank in this lineup.';
    const heading = immortal ? `<th class="numeric" aria-sort="descending">Lowest passive Ultra</th><th class="numeric">${esc(label)}</th>` : `<th class="numeric" aria-sort="descending">${esc(label)}</th>`;
    $('support-table').innerHTML = `<table><caption class="sr-only">${esc(label)} rankings</caption><thead><tr><th class="numeric">Rank</th><th>Hero</th>${heading}</tr></thead><tbody>${body || `<tr><td colspan="${immortal ? 4 : 3}" class="table-empty">${empty}</td></tr>`}</tbody></table>`;
    if (!selected) $('support-hero-details').innerHTML = '';
    return selected;
  }

  function renderImmortalRankings(team, key, slotIndex) {
    const config = state.immortal.config, objective = immortalObjectives[config.priority];
    const settings = teamSettings(key), slot = team[slotIndex];
    const cacheKey = JSON.stringify(['immortal', team, settings, config, slotIndex]);
    if (cacheKey !== supportCacheKey) {
      const scorer = immortalEngine.makeScorer(settings, config);
      const counts = new Map();
      team.forEach((member, i) => {
        if (i !== slotIndex) counts.set(member.id, (counts.get(member.id) || 0) + 1);
      });
      const candidates = DATA.heroes.map(({id, name}) => {
        if (!slot) return {id, name, reason: 'Add a hero to choose a slot.'};
        if ((counts.get(id) || 0) >= 3) return {id, name, reason: 'Three copies already occupy other slots.'};
        if (config.buffTeam === 'deploy') {
          const missing = buffTeamIds.filter(required => required !== id && !counts.has(required));
          if (missing.length) return {id, name, reason: 'The deployed buff preset needs ' + missing.map(required => byId.get(required).name).join(', ') + '.'};
        }
        const trial = team.map((member, i) => i === slotIndex ? {...member, id} : member);
        const result = scorer.details(trial);
        return {id, name, value: result[objective.key], result};
      });
      candidates.sort((a, b) => {
        if (a.result && b.result) return immortalEngine.compareResults(b.result, a.result, config.priority) || a.name.localeCompare(b.name);
        return Number(!!b.result) - Number(!!a.result) || a.name.localeCompare(b.name);
      });
      let leader = null;
      candidates.forEach((row, i) => {
        if (!row.result) return;
        if (!leader || immortalEngine.compareResults(leader.result, row.result, config.priority)) {
          leader = row;
          leader.rank = i + 1;
        }
        row.rank = leader.rank;
      });
      supportResult = candidates;
      supportCacheKey = cacheKey;
    }
    const boss = immortalModes[config.mode], side = 'Team ' + key.toUpperCase();
    $('support-context').textContent = slot
      ? `${side} · ${boss} Immortal. Preview each hero in slot ${slotIndex + 1} at level ${number(slot.level)} on its ${tileNames[slot.tile].toLowerCase()} tile. Scores include the whole team’s attacks and buffs under the selected preset.`
      : `Add a hero to ${side} to preview candidates against the ${boss} Immortal.`;
    const noValidSlot = !!slot && !supportResult.some(row => row.result);
    $('support-warnings').hidden = !noValidSlot;
    $('support-warnings').textContent = noValidSlot
      ? 'One slot change cannot supply every required support. Add the missing heroes or choose another buff preset to rank candidates.' : '';
    const row = renderSupportTable(slot ? supportResult : [], objective.label, number);
    if (!row) return;
    const title = `<div class="support-detail-heading"><h3>${esc(row.name)}</h3></div>`;
    if (row.reason) { $('support-hero-details').innerHTML = `${title}<p>${esc(row.reason)}</p>`; return; }
    const baseline = results[key].immortal, projected = row.result;
    const measures = [{key:'lowestPassiveUltraProbability',label:'Lowest Ultra chance without temporary buffs'}, objective];
    if (usesAttackPriority(config.mode) && config.priority !== 'damage') {
      measures.push({key:'lowestUltraProbability', label:'Lowest effective Ultra chance'}, {key:'ultraHitsPerSecond', label:'Expected Ultra hits/s'});
    }
    if (config.priority !== 'damage') measures.push(immortalObjectives.damage);
    const valueFor = (result, m) => ['lowestUltraProbability','lowestPassiveUltraProbability'].includes(m.key)
      ? result.attackingHeroes ? ultraPercent(result[m.key]) : '—' : number(result[m.key]);
    const lines = measures.map(m => `<tr><th scope="row">${esc(m.label)}</th><td class="numeric">${valueFor(baseline,m)}</td><td class="numeric">${valueFor(projected,m)}</td></tr>`).join('');
    $('support-hero-details').innerHTML = `${title}<p class="support-detail-label">${esc(byId.get(slot.id).name)} → ${esc(row.name)} · Slot ${slotIndex + 1}</p>
      <div class="support-effect-scroll"><table><thead><tr><th>Team result</th><th class="numeric">Current</th><th class="numeric">Preview</th></tr></thead><tbody>${lines}</tbody></table></div>`;
  }

  function renderSupportRankings() {
    const options = state.supportRanking, key = rankingTeam();
    const team = comparison().teams[key], immortal = isImmortal();
    const tag = tagFor(state.focus);
    const scoreKey = tag ? 'skillPower' : isDamageFocus() ? 'damageWithSupport' : state.focus;
    const slotIndex = Math.min(options.slot, team.length - 1);
    $('support-team').value = key;
    $('support-lineup-only').checked = options.lineupOnly;
    $('support-slot-field').hidden = !immortal;
    $('support-reference-controls').hidden = immortal;
    $('support-damage-settings').hidden = !isDamageFocus();
    $('support-xp-settings').hidden = state.focus !== 'experience';
    if (immortal) {
      $('support-slot').innerHTML = team.map((member, i) => `<option value="${i}">Slot ${i + 1} · ${esc(byId.get(member.id).name)}</option>`).join('');
      $('support-slot').disabled = !team.length;
      $('support-slot').value = String(slotIndex);
      renderImmortalRankings(team, key, slotIndex);
      return;
    }
    $('support-level').value = options.level;
    $('support-gm-count').value = options.grandMasterCount;
    $('support-tile').value = options.tile;
    $('support-global-ascensions').checked = options.includeGlobalAscensions !== false;
    const settings = {...settingsForLineup(state.settings, comparison(), key), damageSupportMode: damageSupportModeFor(state.focus)};
    const cacheKey = JSON.stringify(['global',settings,options.level,options.grandMasterCount,options.tile,
      options.xpReference,options.damageReference,options.includeGlobalAscensions !== false]);
    if (cacheKey !== supportCacheKey) { supportResult = ENGINE.rankMilestoneSupport(settings, options); supportCacheKey = cacheKey; }
    const report = supportResult;
    const heroes = report.heroes.map(hero => ({
      id:hero.id,name:hero.name,hero,rank:hero.ranks[scoreKey],value:tag ? (hero.bonuses['Skill Power'] ?? 0) : hero.multipliers[scoreKey]
    })).sort((a,b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.name.localeCompare(b.name));
    const damage = report.damageReference, xp = report.xpReference;
    $('support-crit-chance').value = damage.critChance;
    $('support-super-crit-chance').value = damage.superChance;
    $('support-ultra-crit-chance').value = damage.ultraChance;
    $('support-damage-context').textContent = `${number(damage.excessPoints)} excess chance points give ×${precise(damage.spilloverFactor)} critical spillover before adding a hero.`;
    $('support-rank-xp').value = formatRankXp(xp.rankXp);
    $('support-super-xp-chance').value = xp.superChance;
    $('support-ultra-xp-chance').value = xp.ultraChance;
    $('support-xp-context').textContent = `${number(xp.excessPoints)} excess chance points give ×${precise(xp.spilloverFactor)} XP spillover before adding a hero.`;
    const skillContext = report.damageSupportContext;
    let scenario = '';
    if (isDamageFocus()) scenario = !skillContext.enabled ? ' Support skills are off.'
      : state.focus === 'damageBuffSwap' ? ' Includes Witch and Apprentice debuffs.' : ' Includes active global support skills.';
    const multiplierLabel = tag ? 'Global Skill Power' : state.focus === 'damageBuffSwap' ? 'Buff-swap Damage multiplier'
      : `Global ${state.focus === 'experience' ? 'XP' : focusNames[state.focus]} multiplier`;
    $('support-context').textContent = `One copy at level ${number(report.level)} · ${number(report.grandMasterCount)} Grand Masters · ${tileNames[report.tile]} tile · reference milestone strength ×${precise(report.milestoneScale)}. Uses Team ${key.toUpperCase()} ascension ranks. Compares global bonuses before lineup synergies.${scenario}`;
    const undefinedBaseline = heroes.length > 0 && heroes[0].value === null;
    $('support-warnings').textContent = undefinedBaseline ? `The ${focusNames[state.focus]} reference is zero. A support multiplier cannot be calculated.` : '';
    $('support-warnings').hidden = !undefinedBaseline;
    const format = tag ? value => '+' + number(value) : supportMultiplier;
    const row = renderSupportTable(heroes, multiplierLabel, format);
    const selected = row?.hero;
    if (!selected) return;
    const effectKey = objectiveFor(state.focus);
    const effects = selected.effects.filter(effect => effect.focuses?.includes(effectKey));
    const milestones = effects.filter(effect => effect.kind !== 'ascension');
    const ascensions = effects.filter(effect => effect.kind === 'ascension');
    let detail = '';
    if (state.focus === 'experience') detail = renderXpFactors(selected, xp);
    if (isDamageFocus()) {
      detail = renderCritFactors(selected, damage);
      const skill = selected.damageSupportSkill;
      if (skill) {
        const skillRows = [...skill.activeEffects,...skill.masteryEffects].map(effect => `<tr><td>${effect.stage === 'active' ? 'Active' : 'Mastery'}</td><td>${esc(statName(effect.type))}</td><td class="numeric">${effectFormat(effect)}</td></tr>`).join('');
        detail += `<p class="support-detail-label">${esc(skill.skillName)} · Global support skill</p><div class="support-effect-scroll"><table><thead><tr><th>Source</th><th>Effect</th><th class="numeric">Bonus</th></tr></thead><tbody>${skillRows}</tbody></table></div>`;
      }
    }
    const rows = milestones.map(effect => `<tr><td>${number(effect.level)}</td><td>${esc(statName(effect.type))}</td><td class="numeric">${effectFormat(effect)}</td></tr>`).join('');
    const ascensionRows = ascensions.map(effect => `<tr><td>${esc(effect.source)}</td><td class="numeric">${effect.level}</td><td class="numeric">×${precise(effect.multiplier)}</td></tr>`).join('');
    $('support-hero-details').innerHTML = `<div class="support-detail-heading"><h3>${esc(selected.name)}</h3><p>${esc(focusNames[state.focus])} support · ${format(row.value)}${tag ? ' Skill Power' : ''}</p></div>${detail}
      ${ascensionRows ? `<p class="support-detail-label">Global ascensions</p><div class="support-effect-scroll"><table><thead><tr><th>Upgrade</th><th class="numeric">Rank</th><th class="numeric">Multiplier</th></tr></thead><tbody>${ascensionRows}</tbody></table></div>` : ''}
      <p class="support-detail-label">Global milestones for ${esc(focusNames[state.focus])}</p>${rows ? `<div class="support-effect-scroll"><table><thead><tr><th>Level</th><th>Bonus</th><th class="numeric">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="support-empty">No contributing global milestones at this level.</p>'}`;
  }
  function synergyAuditSummary() {
    const review = DATA.meta.synergyReview;
    const sourceEffects = DATA.heroes.reduce((total, hero) => total + hero.synergies.length, 0);
    const complete = review?.uniqueEffects === sourceEffects;
    const limitations = complete
      ? 'Values match recorded capture profiles; unboosted bases and other modifier combinations are not independently verified.'
      : 'Inferred bases use recorded capture profiles; uncaptured records remain unverified.';
    if (!review) return { coverage: 'Synergy screenshot coverage is not available in this data snapshot.', corrections: '', limitations };
    const names = Array.isArray(review.reviewedHeroNames) ? [...new Set(review.reviewedHeroNames.filter(name => typeof name === 'string' && name.trim()))] : [];
    const title = names.length ? `${new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(names)} screenshots` : 'Screenshot audit';
    const unique = Number.isFinite(review.uniqueEffects) && Number.isFinite(review.uniqueGroups);
    const coverage = complete
      ? `Screenshot audit covers all ${number(sourceEffects)} effects in ${number(review.uniqueGroups)} groups across ${number(DATA.heroes.length)} heroes.`
      : `${title}: ${number(unique ? review.uniqueEffects : review.observedEffects)} ${unique ? 'unique' : 'observed'} effects in ${number(unique ? review.uniqueGroups : review.observedGroups)} groups.`;
    const corrections = `Corrections: ${number(review.typeCorrectedRecords ?? 0)} type, ${number(review.scopeCorrectedRecords ?? 0)} scope, ${number(review.signCorrectedRecords ?? 0)} sign; ${number(review.inferredBaseRecords ?? 0)} inferred bases.`;
    return { coverage, corrections, limitations };
  }
  function editingAscensions() {
    return ascensionScope === 'account' ? state.settings.heroAscensions : comparison().ascensionOverrides?.[ascensionScope] || {};
  }
  function renderAscensionControls() {
    if (!comparingTeams() && ascensionScope === 'b') ascensionScope = 'a';
    const account = ascensionScope === 'account', profiles = editingAscensions(), profile = profiles[ascensionHero] || {};
    const baseline = state.settings.heroAscensions[ascensionHero] || {};
    const inherited = account ? {} : baseline;
    const mode = isImmortal() ? immortalModes[state.immortal.config.mode] + ' Immortal' : focusNames[state.focus];
    const hasInheritedUpgrades = inheritedAscensionKeys.some(key => state.settings[key] > 0);
    $('ascension-scope').value = ascensionScope;
    $('ascension-scope-note').textContent = account
      ? `All focuses, Immortal modes and support rankings use these saved levels. ${hasInheritedUpgrades ? 'Empty fields use your inherited ascension bonuses.' : 'Empty fields start at level 0.'}`
      : `Editing ${mode} · Team ${ascensionScope.toUpperCase()}. Empty fields follow My ascensions, including future baseline edits. An explicit 0 tests an unpurchased upgrade.`;
    const heroSelect = $('ascension-hero');
    heroSelect.innerHTML = DATA.heroes.map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}${profiles[hero.id] ? ' · entered' : ''}</option>`).join('');
    heroSelect.value = ascensionHero;
    const defaultSynergy = ascensionHero === 'warden' ? state.settings.heroSynergyWarden
      : ascensionHero === 'crusader' ? state.settings.heroSynergyCrusader : state.settings.heroSynergyDefault;
    const inheritedSynergy = inherited.synergyLevel == null ? defaultSynergy : inherited.synergyLevel * 5;
    for (const [id, step, percent] of [['ascension-milestone', 10, 10 * (inherited.milestoneLevel ?? state.settings.defaultMilestoneLevel)], ['ascension-synergy', 5, inheritedSynergy]]) {
      $(id).innerHTML = `<option value="">Inherit · +${number(percent)}%</option>`
        + Array.from({length: 6}, (_, level) => `<option value="${level}">Level ${level} · +${level * step}%</option>`).join('');
    }
    for (const [id, field] of ascensionFields) {
      $(id).value = profile[field] ?? '';
      if (field !== 'synergyLevel' && field !== 'milestoneLevel') {
        const defaultLevel = field === 'synergyReductionLevel' ? Number(state.settings.requirementReduction) : 0;
        $(id).placeholder = `Inherit · level ${inherited[field] ?? defaultLevel}`;
      }
    }
    $('ascension-synergy').disabled = !state.settings.accountSynergyBoosts;
    $('ascension-zero-defaults').hidden = !account || !hasInheritedUpgrades;
    $('ascension-inherit').disabled = !Object.keys(profile).length;
    $('ascension-inherit').textContent = account ? 'Use calculator defaults for this hero' : 'Use my baseline for this hero';
    $('ascension-reset-team').hidden = account || !Object.keys(profiles).length;
    $('ascension-hunter-presets').hidden = ascensionHero !== 'hunter';
    const effective = account ? state.settings : settingsForLineup(state.settings, comparison(), ascensionScope);
    const factors = ENGINE.ascensionFactors(ascensionHero, effective);
    const ranks = effective.heroAscensions[ascensionHero] || {};
    const reduction = ranks.synergyReductionLevel ?? Number(state.settings.requirementReduction);
    $('ascension-utility').textContent = `Immortal attack speed cap ${10 + (ranks.maxAttackSpeedLevel ?? 0)}/s · minimum skill cooldown ${number(1 - 0.25 * (ranks.minSkillCooldownLevel ?? 0))}s. Free level chance +${number((ranks.freeHeroLevelChanceLevel ?? 0) / 10)}% applies during leveling. ${reduction ? 'This hero needs one fewer partner for three- and four-hero synergies.' : 'This hero needs every listed synergy partner.'}`;
    const display = n => Number.isSafeInteger(n) ? n.toLocaleString('en-US') : n.toExponential(3);
    $('ascension-summary').textContent = `Personal Kill Gold ×${display(factors.killGold)} · Damage ×${display(factors.damage)}. Each deployed copy supplies global Kill Gold ×${display(factors.globalKillGold)}, Damage ×${display(factors.globalDamage)}, Rank EXP +${number((factors.globalRankExp - 1) * 100)}% and Energy Income +${number((factors.globalEnergyIncome - 1) * 100)}%. ${state.settings.accountSynergyBoosts ? '' : 'Enable Account synergy bonuses to apply Synergy Bonus.'}`;
    const entered = DATA.heroes.filter(hero => profiles[hero.id]);
    $('ascension-roster-count').textContent = `${account ? 'Heroes recorded' : 'Heroes with build changes'} · ${entered.length} / ${DATA.heroes.length}`;
    $('ascension-roster').innerHTML = entered.length
      ? entered.map(hero => `<button type="button" class="text-button" data-ascension-hero="${esc(hero.id)}">${esc(hero.name)} · ${Object.keys(profiles[hero.id]).length} of 12 upgrades</button>`).join('')
      : `<p class="hint">${account ? 'Select a hero above to enter upgrade levels.' : 'This team uses My ascensions for all heroes.'}</p>`;
    $('ascension-impact').textContent = '';
  }
  function setAscensionProfile(profile) {
    const teams = visibleTeamKeys();
    const previousGold = state.focus === 'gold' ? teams.map(key => results[key].metrics.gold) : [];
    const profiles = {...editingAscensions(), [ascensionHero]: profile};
    if (ascensionScope === 'account') state.settings.heroAscensions = ENGINE.normalizeHeroAscensions(profiles);
    else setLineupAscensions(comparison(), ascensionScope, profiles);
    edited();
    if (previousGold.length) {
      const ratios = teams.flatMap((key, i) => previousGold[i] > 0
        ? [`Team ${key.toUpperCase()} ×${precise(results[key].metrics.gold / previousGold[i])}`] : []);
      if (ratios.length) $('ascension-impact').textContent = `Gold index compared with the previous allocation · ${ratios.join(' · ')}.`;
    }
  }
  function renderControls() {
    const tag = tagFor(state.focus);
    const compare = comparingTeams();
    for (const id of ['copy-team', 'swap-teams', 'mobile-team-switch', 'detail-team-switch', 'support-team-field', 'ascension-scope-b', 'ascension-trial-hint', 'xp-reference-b', 'gold-enemies-b-field', 'gold-rate-b-field', 'comparison-description']) $(id).hidden = !compare;
    $('ascension-scope-b').disabled = !compare;
    $('lab-workspace').classList.toggle('single-team', !compare);
    if (!compare) $('mobile-editor-a').checked = true;
    $('comparison-heading').textContent = compare ? 'Team A/B comparison' : 'Team A';
    $('all-level-label').textContent = compare ? 'Apply hero level to both teams' : 'Apply hero level to Team A';
    const focusBar = $('focus-controls');
    if (!focusBar.children.length) {
      focusBar.innerHTML = Object.entries(focusNames).map(([key, name]) =>
        `<button type="button" class="focus-button${key === state.focus ? ' active' : ''}" data-focus="${key}" aria-pressed="${key === state.focus}"><span aria-hidden="true">${symbols[key]}</span>${name}</button>`).join('');
      $('phone-focus').innerHTML = Object.entries(focusNames).map(([key, name]) =>
        `<option value="${key}">${name}</option>`).join('');
    }
    $('phone-focus').value = state.focus;
    for (const button of focusBar.children) {
      const selected = button.dataset.focus === state.focus;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    $('tier').innerHTML = [null, 15, 50, 100, 150, 250, 500, 1000, 1500].map((rank, index) => `<option value="${index + 1}" ${state.settings.maxTier === index + 1 ? 'selected' : ''}>Tier ${index + 1} · ${rank === null ? 'rank not listed' : `rank ≥ ${number(rank)}`}</option>`).join('');
    for (const [id, key] of [['milestone-scale', 'milestoneScale'], ['synergy-scale', 'synergyScale'], ['overflow-rate', 'overflowRate'], ['base-overflow', 'baseOverflow'], ['base-energy', 'baseEnergy']]) $(id).value = state.settings[key];
    $('account-synergy-boosts').checked = state.settings.accountSynergyBoosts;
    $('synergy-event').checked = state.settings.synergyEvent;
    renderAscensionControls();
    renderDamageControls();
    renderExperienceSkillControls();
    $('tag-settings').hidden = !tag;
    if (tag) {
      $('tag-base-label').textContent = byId.get(tag.heroId).name + ' pre-team Skill Power';
      $('tag-base-power').value = state.settings[tag.baseSetting];
    }
    $('gold-settings').hidden = state.focus !== 'gold';
    $('gold-mimic-farming').checked = state.settings.goldMimicFarming;
    $('gold-mimic-settings').hidden = !state.settings.goldMimicFarming;
    for (const [id, key] of mimicFields) $(id).value = state.settings[key];
    $('gold-skills').checked = state.settings.goldSkills;
    for (const [id, key] of goldFields) { $(id).value = state.settings[key]; $(id).disabled = key === 'goldKillGoldTile' ? !state.settings.snowFort : !state.settings.goldSkills; }
    $('placement-note').textContent = isImmortal() ? suggestionHelp() : state.focus === 'gold'
      ? 'Gold suggestions compare the attacker’s Kill Gold tile, milestone and synergy boosts, and +20% skill tiles on Rogue, Sovereign and Hunter. Each named skill counts once. Locks preserve heroes and levels; tiles may move.'
      : state.focus === 'damageBuffSwap' ? 'Buff-swap suggestions compare Damage, milestone, synergy and skill-power tiles using only the attacker’s damage. Personal attacker skills and Witch / Apprentice debuffs count; other deployed support skills are excluded. All team globals still apply. Locks preserve heroes and levels; tiles may move.'
      : state.focus === 'damage' ? 'Damage suggestions compare the attacker’s Damage, milestone, synergy and skill-power tiles, using its captured active and mastery bonuses plus global support buffs. Skill tiles on each support’s first copy are compared jointly; later copies cannot repeat its buff. Locks preserve heroes and levels; tiles may move.'
      : 'Remaining skill tiles favor XP abilities, then Skill Power and Damage; one copy per hero. Skill DPS is not modeled. Locks preserve heroes and levels; tiles may move.';
    $('synergy-event-status').textContent = state.settings.synergyEvent
      ? 'Event active: milestone effects ×1.25 and synergy effects ×1.10. Applies to both teams, all focuses and suggestions.'
      : 'Event off: milestones and synergies use your normal account, Grand Master and map bonuses.';
    for (const [id, key] of accountSynergyFields) { $(id).value = state.settings[key]; $(id).disabled = !state.settings.accountSynergyBoosts; }
    const globalSynergyScale = ['synergyGlobalBonus1', 'synergyGlobalBonus2', 'synergyGlobalBonus3'].reduce((factor, key) => factor * (1 + state.settings[key] / 100), 1);
    $('account-synergy-status').textContent = state.settings.accountSynergyBoosts ? `Account bonuses are active. The three global modifiers combine to ×${precise(globalSynergyScale)}; owner and tier bonuses apply separately.` : 'Account global, tier and owner bonuses are off. Grand Master settings still apply independently.';
    const audit = synergyAuditSummary();
    $('synergy-audit-hint').textContent = `${audit.coverage} ${audit.limitations}`;
    $('synergy-method-summary').textContent = `${audit.coverage} ${audit.corrections} ${audit.limitations}`;
    $('default-milestone-level').value = state.settings.defaultMilestoneLevel;
    $('requirement-reduction').checked = Boolean(state.settings.requirementReduction);
    $('grand-master').checked = state.settings.grandMaster;
    $('grand-master-stacking').value = state.settings.grandMasterStacking;
    $('grand-master-stacking').disabled = !state.settings.grandMaster;
    $('synergy-grand-master-stacking').value = state.settings.synergyGrandMasterStacking;
    $('synergy-grand-master-stacking').disabled = !state.settings.grandMaster;
    $('snow-fort').checked = state.settings.snowFort;
    for (const [id, key] of [['map-t56', 'mapT56'], ['map-t7', 'mapT7'], ['map-mastery', 'mapMastery'], ['map-attack-speed', 'mapAttackSpeed']]) { $(id).value = state.settings[key]; $(id).disabled = !state.settings.snowFort; }
    if (state.focus === 'experience') $('placement-note').textContent = 'Experience suggestions compare XP +20% on the boss attacker with milestone, synergy and skill placements. Veteran shares the attacker’s boosted kill reward. All copies of the leveling hero share its level and combat style. Support styles are shown per hero; suggestions can compare Grand Master, Tycoon and Magnate when enabled.';
    $('suggestion-help').textContent = suggestionHelp();
    $('immortal-all').textContent = compare ? 'Suggest all four B teams' : 'Suggest all four A teams';
    $('attacker-search-option').hidden = !hasAttacker();
    $('choose-attacker').checked = comparison().chooseAttacker;
    const lineupTitle = compare ? 'lineups' : 'lineup';
    $('lineups-title').textContent = `${focusNames[state.focus]} ${lineupTitle}`;
    $('lineups-context').textContent = isImmortal() ? 'Every eligible hero contributes to boss damage. Other heroes can supply team buffs and synergies.' : compare ? 'Team A and B save separately for each focus, including names, levels, tiles and locks.' : 'Heroes, levels, tiles and locks are saved for this focus.';
    if (tag) {
      const name = byId.get(tag.heroId).name;
      $('placement-note').textContent = `A Snow Fort Skill Power tile gives its occupant ×1.20 power. Suggestions also compare milestone and synergy tiles on heroes who supply power to ${name}.`;
      $('lineups-context').textContent = `Deploy ${name} to score this tag. With multiple copies, the team uses the one with the highest Skill Power.`;
    }
    if (isImmortal()) {
      $('lineups-title').textContent = immortalModes[state.immortal.config.mode] + ' Immortal ' + lineupTitle;
      $('placement-note').textContent = 'Suggestions compare milestone, synergy, skill-power and damage tiles for the whole team.';
    }
    $('gold-required-roster').hidden = state.focus !== 'gold';
    $('power-mage-required-roster').hidden = state.focus !== 'powerMageEnergy';
    $('damage-buff-swap-note').hidden = state.focus !== 'damageBuffSwap';
    $('universal-required-roster').hidden = state.focus !== 'experience';
    const experienceStatus = visibleTeamKeys().map(key => {
      const missing = experienceRequiredHeroes.filter(id => !comparison().teams[key].some(slot => slot.id === id));
      return `Team ${key.toUpperCase()}: ${missing.length ? 'missing ' + missing.map(id => byId.get(id).name).join(', ') : 'all three present'}`;
    }).join(' · ');
    $('universal-required-roster').textContent = `Required for Experience only: at least one Archer, Ballista and Veteran for their XP abilities. ${experienceStatus}. Required heroes remain eligible outside the optional roster; additional copies are allowed. Saved lineups stay unchanged until a suggestion is applied; locked heroes and the selected attacker are preserved. One copy of each hero supplies its XP ability when enabled; duplicate copies remain supports.`;
    const required = focusRequiredHeroes[state.focus];
    if (required) {
      const status = visibleTeamKeys().map(key => {
        const missing = required.filter(id => !comparison().teams[key].some(slot => slot.id === id));
        return `Team ${key.toUpperCase()}: ${missing.length ? 'missing ' + missing.map(id => byId.get(id).name).join(', ') : state.focus === 'gold' ? 'all three present' : 'Captain present'}`;
      }).join(' · ');
      if (state.focus === 'gold') $('gold-required-roster').textContent = `Required for Gold: at least one Hunter, Rogue and Sovereign for their skills. ${status}. Suggestions include these heroes even when excluded from the optional roster. Locks and the selected attacker remain protected. ${state.settings.goldSkills ? 'All three skills are scored as active on the kill, once per named skill.' : 'Active skill payouts are switched off in Gold settings.'}`;
      else $('power-mage-required-roster').textContent = `Required for Energy + Power Mages: at least one Captain for his Power Mage mastery skill. ${status}. Suggestions include Captain even when excluded from the optional roster. Locks and levels are preserved. The mastery skill's stacking bonus is not included in the payout index.`;
    }
  }
  function renderRoster() {
    const query = $('roster-search').value.trim().toLowerCase();
    $('roster-count').textContent = `${state.allowed.length}/${DATA.heroes.length}`;
    $('roster').innerHTML = DATA.heroes.filter(hero => hero.name.toLowerCase().includes(query)).map(hero => `<label class="roster-item"><input type="checkbox" data-roster="${hero.id}" ${state.allowed.includes(hero.id) ? 'checked' : ''}>${esc(hero.name)}</label>`).join('');
  }
  function renderMilestoneReview() {
    const section = $('milestone-review');
    if (!REVIEW || !Array.isArray(REVIEW.heroes) || !REVIEW.heroes.length) { section.hidden = true; return; }
    section.hidden = false;
    const active = REVIEW.status === 'active-calibrated';
    section.classList.toggle('review-active', active);
    $('review-progress').textContent = `${REVIEW.capturedHeroes} of ${REVIEW.expectedHeroes} heroes · ${REVIEW.capturedMilestones} milestones captured`;
    const pendingCaptured = Math.max(0, REVIEW.capturedHeroes - activeMilestoneHeroes), pendingCapture = Math.max(0, REVIEW.expectedHeroes - REVIEW.capturedHeroes);
    $('review-summary').textContent = active ? `Milestones are active for ${activeMilestoneHeroes} heroes through level 10,000. ${pendingCaptured ? `${pendingCaptured} captured ${pendingCaptured === 1 ? 'hero awaits' : 'heroes await'} synergy records.` : pendingCapture ? `${pendingCapture} ${pendingCapture === 1 ? 'hero remains' : 'heroes remain'} to capture.` : 'All planned heroes are captured.'}` : 'Account screenshots captured; base-value scaling unresolved. Scores still use the sheet through 7,500.';
    $('review-status-message').textContent = active ? `Milestones for ${activeMilestoneHeroes} heroes now use screenshot-derived base values. The confirmed account multiplier is ×2.8125; spreadsheet synergies have not yet been fully verified against screenshots.${pendingCaptured ? ` Captured heroes still awaiting synergy records: ${pendingCaptured}. These heroes remain outside the calculator.` : ''}` : 'Account screenshots captured; original base-value scaling unresolved. Calculations still use spreadsheet data through 7,500.';
    $('review-context').textContent = active ? 'Captured with zero heroes deployed. Talent ×1.5, global ×1.25 and Ascension ×1.5 explain the account multiplier.' : 'Captured with zero heroes deployed. Account bonuses are included; inferred base values are not active.';
    const normalizationNotes = Array.isArray(REVIEW.normalizationNotes) ? REVIEW.normalizationNotes.join(' ') : typeof REVIEW.normalizationNotes === 'string' ? REVIEW.normalizationNotes : '';
    $('review-caption').textContent = active ? `Screenshot signs, units and scopes are preserved. Active integer bases are inferred from the rounded screenshot displays using the confirmed ×2.8125 scale. ${normalizationNotes}`.trim() : 'Screenshot signs, units and scopes are preserved. The sheet stores base magnitudes, including positive cooldown-reduction magnitudes. “Fits provisional scale” means numeric consistency with a candidate multiplier, not confirmation of a base bonus.';
    const selected = $('review-hero').value || REVIEW.heroes[0].id;
    $('review-hero').innerHTML = REVIEW.heroes.map(hero => `<option value="${esc(hero.id)}" ${hero.id === selected ? 'selected' : ''}>${esc(hero.name)}</option>`).join('');
    const hero = REVIEW.heroes.find(item => item.id === selected) || REVIEW.heroes[0];
    const scope = global => global ? 'Global' : 'Personal';
    const statusNames = { 'new-level': active ? 'Added milestone' : 'New milestone', 'type-change': active ? 'Effect type corrected' : 'Effect type changed', 'scope-change': active ? 'Scope corrected' : 'Scope changed', 'value-review': active ? 'Value updated' : 'Value needs review', consistent: active ? 'Matches expected scaling' : 'Fits provisional scale' };
    const changedFields = row => Array.isArray(row.changedFields) ? row.changedFields : ({ 'type-change': ['type'], 'scope-change': ['scope'], 'value-review': ['value'] }[row.comparison] || []);
    const changes = [];
    for (const item of REVIEW.heroes) for (const row of item.milestones) {
      const fields = changedFields(row);
      if (!row.sheet) continue;
      if (fields.includes('type')) changes.push(`${item.name} ${number(row.level)}: ${row.sheet.type} → ${row.type} (${fields.includes('scope') ? `${scope(row.sheet.global).toLowerCase()} → ` : ''}${scope(row.global).toLowerCase()}).`);
      else if (fields.includes('scope')) changes.push(`${item.name} ${number(row.level)}: ${row.type} changes from ${scope(row.sheet.global).toLowerCase()} to ${scope(row.global).toLowerCase()}.`);
    }
    $('review-changes').textContent = changes.join(' ');
    const rows = hero.milestones.map(row => {
      const signed = Number.isFinite(row.signedValue) ? row.signedValue : row.displayedValue;
      const observed = `${signed >= 0 ? '+' : ''}${number(signed)}${row.unit === 'percent' ? '%' : ''}`;
      const fields = changedFields(row);
      const current = active ? byId.get(hero.id)?.milestones.find(milestone => milestone.level === row.level) : null;
      const status = active && !current ? 'Captured · not active' : current?.reviewNote ? 'Needs review' : fields.includes('type') && fields.includes('scope') ? 'Effect type and scope changed' : statusNames[row.comparison] || 'Awaiting review';
      const currentCell = active ? `<td>${current ? `<strong>${current.value >= 0 ? '+' : ''}${number(current.value)}${current.unit === 'percent' ? '%' : ''}</strong> ${esc(current.type)}<span class="subline">${scope(current.global)} · inferred integer base</span>` : '<span class="muted">Not active</span>'}</td>` : '';
      return `<tr><td class="numeric">${number(row.level)}</td><td><strong>${esc(observed)}</strong> ${esc(row.type)}<span class="subline">${scope(row.global)} · ${esc(row.unit === 'percent' ? 'percent' : row.unit || 'flat')}</span></td><td>${row.sheet ? `${number(row.sheet.value)} ${esc(row.sheet.type)}<span class="subline">${scope(row.sheet.global)} · ${row.sheet.unitCorrection ? `percentage points (Excel stores ${number(row.sheet.storedValue)})` : 'stored base magnitude'}</span>` : '<span class="muted">Not in spreadsheet</span>'}</td>${currentCell}<td class="review-status ${row.comparison === 'consistent' && !current?.reviewNote ? '' : 'review-change'}">${esc(status)}${current?.reviewNote ? `<span class="subline">${esc(current.reviewNote)}</span>` : ''}</td></tr>`;
    }).join('');
    $('review-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th class="numeric">Level</th><th>Screenshot display</th><th>Original spreadsheet base</th>${active ? '<th>Active base</th>' : ''}<th>${active ? 'Compared with old sheet' : 'Review status'}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function renderLevelingControl(key) {
    const team = comparison().teams[key], target = comparison().levelingTargets[key], slot = team[target];
    const canPlace = team.length < 10 || team.some(member => !member.locked);
    const deployed = team.map((member, index) => `<option value="${index}" ${target === index ? 'selected' : ''}>Slot ${index + 1} · ${esc(byId.get(member.id).name)}</option>`).join('');
    const otherHeroes = DATA.heroes.filter(hero => !team.some(member => member.id === hero.id)).map(hero => `<option value="hero:${hero.id}" ${canPlace ? '' : 'disabled'}>${esc(hero.name)}</option>`).join('');
    const choices = comparison().experienceOptions[key], plan = results[key]?.experiencePlan;
    const targetField = `<label class="field">Hero to level<select data-leveling-target="${key}" aria-label="Team ${key.toUpperCase()} hero to level up">${team.length ? '' : '<option value="">Choose a hero</option>'}${deployed ? `<optgroup label="On this team">${deployed}</optgroup>` : ''}<optgroup label="Add a different hero">${otherHeroes}</optgroup></select></label>`;
    if (!slot) return `<div class="leveling-control">${targetField}</div>`;
    const styles = ENGINE.experienceStyles.map(style => `<option value="${style.id}" ${choices.style === style.id ? 'selected' : ''} ${style.level > slot.level ? 'disabled' : ''}>${esc(style.name)}${style.level > 1 ? ' · Lv ' + number(style.level) : ''}</option>`).join('');
    const attackers = team.map((member, i) => i === target ? '' : `<option value="${i}" ${choices.attacker === i ? 'selected' : ''}>Slot ${i + 1} · ${esc(byId.get(member.id).name)}</option>`).join('');
    const attackSlot = plan && team[plan.attackerIndex];
    const role = plan && (plan.attackerIndex === target ? 'Leveler attacks' : plan.veteranIndex == null ? 'Needs Veteran to receive shared XP' : `Receives XP from ${esc(byId.get(attackSlot.id).name)} (slot ${plan.attackerIndex + 1}) via Veteran`);
    const tileIndex = team.findIndex(member => member.tile === 'experience');
    const tileStatus = plan && state.settings.snowFort && tileIndex >= 0 && tileIndex !== plan.attackerIndex
      ? `<br>XP tile in slot ${tileIndex + 1} is idle while ${esc(byId.get(attackSlot.id).name)} makes the kills.` : '';
    const others = results[key].heroes.filter(hero => hero.index !== target);
    const bestOther = others.reduce((best, hero) => !best || hero.metrics.experience > best.metrics.experience ? hero : best, null);
    const payouts = plan && bestOther ? `Own kills <b>${scoreFormat(results[key].heroes[target].metrics.experience)}</b> · ${plan.veteranIndex === null ? 'Shared kills need Veteran' : `Best shared kills <b>${scoreFormat(bestOther.metrics.experience * plan.shareChance)}</b> (${esc(bestOther.name)}, slot ${bestOther.index + 1})`}` : '';
    return `<div class="leveling-control"><div class="leveling-fields">${targetField}<label class="field target-level-field">Current level<input data-leveling-level="${key}" type="number" min="1" max="1000000" step="1" value="${slot.level}"></label></div>
      <div class="leveling-fields"><label class="field">Leveler combat style<select data-xp-style="${key}"><option value="auto" ${choices.style === 'auto' ? 'selected' : ''}>Best available</option>${styles}</select></label>
      <label class="field">Boss attacker<select data-xp-attacker="${key}"><option value="best" ${choices.attacker === 'best' ? 'selected' : ''}>Best on team</option><option value="self" ${choices.attacker === 'self' ? 'selected' : ''}>Leveler attacks</option>${attackers}</select></label></div>
      <label class="check-label xp-support-search"><input type="checkbox" data-xp-optimize-support-styles="${key}" ${choices.optimizeSupportStyles ? 'checked' : ''}>Compare support styles in suggestions</label><p class="hint">Search Grand Master, Tycoon and Magnate for support heroes. Turn this off to retain manual styles. Locks preserve hero and level; suggestions may change styles and tiles.</p><p class="hint">Current supports: ${esc(supportStyleSummary(team, target))}.</p>
      ${plan ? `<p class="xp-decision"><strong>${esc(styleName(plan.styleId))}</strong> · Synergies through tier ${plan.tier}<br>${role}${tileStatus}</p><p class="xp-payouts">${payouts}</p>` : ''}<p class="hint">All copies of ${esc(byId.get(slot.id).name)} share this level and combat style. Best available includes Tycoon at 1,250 and Magnate at 4,000; their global XP and synergy bonuses can help a separate attacker.</p></div>`;
  }
  function syncLevelingCopies(panel, key) {
    const team = panel.teams[key], target = team[panel.levelingTargets[key]];
    if (target) for (const slot of team) if (slot.id === target.id) slot.level = target.level;
    for (const id of new Set(team.map(slot => slot.id))) {
      const copies = team.filter(slot => slot.id === id), requested = copies.find(slot => slot.combatStyle)?.combatStyle;
      const valid = Object.hasOwn(supportStyleLevels, requested) && (id === target?.id || Math.min(...copies.map(slot => slot.level)) >= supportStyleLevels[requested]);
      for (const slot of copies) { if (valid) slot.combatStyle = requested; else delete slot.combatStyle; }
    }
  }
  function restoreLevelingCopies(panel, key) {
    const team = panel.teams[key], target = team[panel.levelingTargets[key]];
    if (target) for (const slot of team) if (slot.id === target.id) slot.level = panel.experienceOptions[key].supportLevel;
  }
  function selectLevelingTarget(key, value) {
    const panel = comparison(), team = panel.teams[key], previous = panel.levelingTargets[key];
    let next, newId;
    if (value.startsWith('hero:')) {
      newId = value.slice(5);
      if (!byId.has(newId)) { alert('Choose a known hero to level up.'); return false; }
      next = team.findIndex(slot => slot.id === newId);
      if (next === -1) {
        next = team.length < 10 ? team.length : team.findLastIndex(slot => !slot.locked);
        if (next === -1) { alert('Unlock a hero slot before adding a different leveling target.'); return false; }
      }
    } else {
      next = value === '' ? bestAttacker(team, settingsForLineup(state.settings, panel, key), 'experience') : Number(value);
      if (!Number.isInteger(next) || !team[next]) { alert('Choose a hero on this team to level up.'); return false; }
    }
    if (next === previous && (!newId || team[next]?.id === newId)) return true;
    if (team[previous] && team[next]?.id === team[previous].id && (!newId || newId === team[previous].id)) {
      const options = panel.experienceOptions[key];
      if (options.attacker === next) options.attacker = 'self';
      panel.levelingTargets[key] = next;
      syncLevelingCopies(panel, key);
      return true;
    }
    restoreLevelingCopies(panel, key);
    if (newId && team[next]?.id !== newId) {
      const supportLevel = Math.round(clamp($('all-level').value, 1, 1000000, 15000));
      team[next] = {...(team[next] || {locked: false, tile: 'normal'}), id: newId, level: supportLevel};
      delete team[next].combatStyle;
    }
    panel.experienceOptions[key] = {...xpOptions(team[next].level), optimizeSupportStyles:panel.experienceOptions[key].optimizeSupportStyles};
    team[next].level = 1;
    panel.levelingTargets[key] = panel.attackers[key] = next;
    syncLevelingCopies(panel, key);
    return true;
  }
  function setLevelerLevel(key, value) {
    const panel = comparison(), slot = panel.teams[key][panel.levelingTargets[key]], options = panel.experienceOptions[key];
    if (key === 'b' && roadmap) roadmap.previewLevel = null;
    slot.level = Math.round(clamp(value, 1, 1000000, 1));
    syncLevelingCopies(panel, key);
    if (ENGINE.experienceStyles.some(style => style.id === options.style && style.level > slot.level)) options.style = 'auto';
  }
  function clearRoadmap() {
    roadmapWorker?.terminate();
    roadmapWorker = null;
    roadmap = null;
  }
  function stageAtLevel(group, level) {
    return group.stages.find(stage => level >= stage.from && level <= stage.to) || group.stages[0];
  }
  function renderBossComparison(range, index, group, level) {
    const comparison = range.attackerComparison;
    const rows = comparison.rows, self = rows[comparison.levelerIndex];
    const strongest = candidates => candidates.reduce((best, row) => !best || row.score > best.score ? row : best, null);
    const veterans = rows.filter(row => row.shared && row.id === 'veteran');
    const veteran = strongest(veterans);
    let shared = strongest(rows.filter(row => row.shared && row.eligible));
    // On tied payouts, show the recommended attacker or the Veteran supplying Exp Share.
    const recommended = rows[comparison.selectedIndex];
    if (recommended.shared) shared = recommended;
    else if (shared && veteran && Math.abs(veteran.score - shared.score) <= shared.score * 1e-12) shared = veteran;
    const candidates = [self, shared];
    if (veteran && veteran.index !== shared?.index) candidates.push(veteran);
    const shown = candidates.filter(Boolean);
    const td = (label, format) => `<tr><th scope="row">${label}</th>${shown.map(row => `<td>${format(row)}</td>`).join('')}</tr>`;
    const factor = value => '×' + precise(value);
    const bossSource = source => {
      let label = source.styleName || 'Boss XP';
      if (source.kind === 'skill' && source.level === 1000) label = 'Level 1,000 unlock';
      else if (source.kind === 'synergy') label = 'Tier ' + source.tier + ' synergy';
      else if (source.kind === 'milestone') label = 'Level ' + number(source.level) + ' milestone';
      return `${esc(label)} ${source.value >= 0 ? '+' : ''}${number(source.value)}%`;
    };
    let summary = 'The leveler earns XP from its own boss kills. A separate attacker requires Veteran’s Exp Share.';
    if (shared) {
      const delta = Math.abs(self.score - shared.score) / Math.min(self.score, shared.score) * 100;
      const other = esc(shared.name) + ' (slot ' + (shared.index + 1) + ')';
      if (delta < 1e-9) summary = `The leveler’s own boss kills and shared kills from ${other} give equal XP.`;
      else {
        const margin = delta < 0.01 ? 'less than 0.01%' : number(delta) + '%';
        summary = self.score > shared.score
          ? `The leveler earns ${margin} more XP per boss by attacking than by sharing kills from ${other}.`
          : `Sharing kills from ${other} gives the leveler ${margin} more XP per boss than attacking directly.`;
      }
    }
    const headers = shown.map(row => `<th scope="col">${esc(row.name)} · Slot ${row.index + 1}<span class="subline">${row.shared ? 'Via Exp Share' : 'Leveler attacks'}</span></th>`).join('');
    return `<tr data-xp-comparison="${index}"><td colspan="6" class="xp-compare-panel"><div id="xp-payout-${index}">
      <div class="xp-compare-heading"><h3>Boss kills at levels ${number(range.from)}–${number(range.to)}</h3>
      ${group.stages.length > 1 ? `<label>Compare at level <input data-xp-preview="${index}" type="number" min="${group.from}" max="${group.to}" value="${level}" step="1"></label>` : ''}</div><p>${summary}</p>
      <div class="xp-payout-table" role="region" tabindex="0" aria-label="Payout factors by attacker"><table aria-label="XP received per boss on this lineup"><thead><tr><th scope="col">Payout factor</th>${headers}</tr></thead><tbody>
      ${td('Personal Boss XP', row => `<strong>${factor(row.personalBossFactor)}</strong><span class="subline">${row.bossSources.map(bossSource).join(' · ')}</span>`)}
      ${td('Total Boss XP', row => factor(row.bossFactor))}
      ${td('Rank XP factor', row => factor(row.rankFactor))}
      ${td('XP skill reward multiplier', row => factor(row.rewardFactor ?? 1))}
      ${td('Attacker’s XP tile', row => factor(row.attackerTileFactor ?? 1))}
      ${td('Super / Ultra XP amount', row => `${factor(row.superAmountFactor)} / ${factor(row.ultraAmountFactor)}`)}
      ${td('Personal EXP chance', row => `Super +${number(row.personalSuperChance)} pp · Ultra +${number(row.personalUltraChance)} pp`)}
      ${comparison.reference ? td('Total Super / Ultra EXP chance', row => `${number(row.totalSuperChance)}% / ${number(row.totalUltraChance)}%`) + td('Chance above the 100% caps', row => `${number(row.excessPoints)} pp`) : ''}
      ${td('Chance spillover', row => factor(row.overflowFactor))}
      ${td('XP received per boss', row => `<strong title="${precise(row.score)}">${scoreFormat(row.score)}</strong>`)}
      </tbody></table></div><p class="hint">All attackers use the lineup and tiles shown for this range. Team bonuses provide ${factor(comparison.globalBossFactor)} Boss XP. ${comparison.reference ? `Rank XP and chance use changes from ${esc(comparison.reference.label || 'the recorded team')}. Only chance above each 100% cap adds to spillover; the recorded pool is ${factor(comparison.baselineOverflowFactor)}.${shown.some(row => row.belowCap) ? ' A chance total falls below 100%; payout tiers are still assumed guaranteed, so this comparison does not model proc probability.' : ''}` : `Each additional Super or Ultra EXP chance point adds ${number(comparison.overflowRate)}% to the spillover pool.`}</p>
      </div></td></tr>`;
  }
  function renderExperienceReference() {
    const reference = state.settings.experienceReference;
    const recorded = !!reference;
    $('xp-reference-mode').value = recorded ? 'reference' : 'manual';
    $('xp-reference-fields').hidden = !recorded;
    $('xp-rank-base-field').hidden = recorded;
    $('xp-rank-base').disabled = recorded;
    if (!recorded) return;
    $('xp-reference-rank').value = formatRankXp(reference.rankBonus);
    $('xp-reference-super').value = reference.superChance;
    $('xp-reference-ultra').value = reference.ultraChance;
    $('xp-reference-all-gm').checked = experienceCaptureGrandMaster;
    const excess = Math.max(0, reference.superChance - 100) + Math.max(0, reference.ultraChance - 100);
    const overflow = 1 + (state.settings.baseOverflow + excess * state.settings.overflowRate) / 100;
    $('xp-reference-context').textContent = `${reference.label || 'Recorded team'} · ${reference.styleId === 'grandMaster' ? 'All heroes used Grand Master in this capture' : 'Capture style: ' + styleName(reference.styleId)} · Displayed Rank EXP +${precise(reference.rankBonus)} · Super ${number(reference.superChance)}% / Ultra ${number(reference.ultraChance)}%. ${number(excess)} excess chance points · Recorded spillover ×${precise(overflow)}, including any configured extra overflow. Team changes adjust these totals without adding the reference team again.`;
    const mismatches = [['Super', reference.modeledSuperChance, reference.superChance], ['Ultra', reference.modeledUltraChance, reference.ultraChance]]
      .filter(([, modeled, observed]) => modeled > observed + 1e-9)
      .map(([name, modeled, observed]) => `${name}: modeled team +${number(modeled)} pp exceeds the recorded ${number(observed)}% total`);
    $('xp-reference-warning').hidden = !mismatches.length;
    $('xp-reference-warning').textContent = mismatches.length ? `${mismatches.join('; ')}. Estimates use changes from this reference; check support levels, event and skill settings against your capture.` : '';
    for (const key of ['a', 'b']) $('xp-reference-' + key).disabled = !comparison().teams[key].length || busy;
  }
  function renderRoadmap() {
    const visible = state.focus === 'experience';
    $('experience-roadmap').hidden = $('xp-plan-link').hidden = !visible;
    if (!visible) return;
    const panel = comparison(), key = panel.showTeamB ? 'b' : 'a';
    const leveler = panel.levelingTargets[key], slot = panel.teams[key][leveler];
    $('xp-plan-title').textContent = slot ? byId.get(slot.id).name + ' leveling plan' : 'Leveling plan';
    $('xp-plan-intro').textContent = `Each row shows when to change combat style, attacker, lineup, or tiles. The plan compares boss kills and Veteran’s Exp Share using Team ${key.toUpperCase()}’s roster and locks.`;
    $('xp-veteran-stacks').value = state.settings.experienceVeteranStacks;
    $('xp-plan-assumptions').textContent = state.settings.experienceSkills
      ? `XP auras and EXP Share are active and all heroes are in range. Veteran’s base share chance is ${number(state.settings.experienceVeteranShareChance)}% before tiles. A successful share awards the attacker’s XP once.`
      : 'XP skills and EXP Share are disabled. The leveler must make the kill to earn its own payout.';
    $('xp-rank-base').value = formatRankXp(state.settings.experienceBaseRankXp);
    renderExperienceReference();
    $('xp-plan-build').disabled = !slot;
    $('xp-plan-build').textContent = roadmap?.running ? 'Cancel search' : roadmap?.rows.length ? 'Rebuild plan' : 'Plan levels 1–4,500';
    const groups = roadmap?.groups || [];
    $('xp-plan-status').textContent = roadmap?.error || (roadmap?.running ? `Checking unlock ${Math.min(roadmap.rows.length + 1, roadmap.total)} of ${roadmap.total}…`
      : groups.length ? `${groups.length} recommendation${groups.length === 1 ? '' : 's'} · Relative XP received per boss at the same kill rate.`
      : slot ? '' : `Choose a hero to level in Team ${key.toUpperCase()}.`);
    if (!roadmap?.rows.length || !slot) { $('xp-plan-results').innerHTML = ''; return; }
    const container = $('xp-plan-results');
    const openLineups = new Set(Array.from(container.querySelectorAll?.('details[open]') || [], details => Number(details.dataset.range)));
    const scrollLeft = container.firstElementChild?.scrollLeft || 0;
    const changeNames = {style: 'Style', attacker: 'Attacker', lineup: 'Lineup', tiles: 'Tiles'};
    const rows = groups.map((group, index) => {
      const current = slot.level >= group.from && slot.level <= group.to;
      const expanded = roadmap.compareIndex === index;
      const level = expanded && roadmap.previewLevel != null ? roadmap.previewLevel : current ? slot.level : group.from;
      const row = stageAtLevel(group, level);
      const scores = group.stages.map(stage => stage.score);
      const low = scoreFormat(Math.min(...scores)), high = scoreFormat(Math.max(...scores));
      const payout = low === high ? low : `${low}–${high}`;
      const changes = group.changes.map(key => changeNames[key]).join(' · ');
      const name = i => esc(byId.get(row.team[i].id).name);
      const lineup = row.team.map((member, i) => `<li><strong>${name(i)}</strong>${member.id === row.team[leveler].id ? ' · leveler' : ''}${i === row.attackerIndex ? ' · attacker' : ''}<span>${tileNames[member.tile]} tile${member.id === row.team[leveler].id ? '' : ' · ' + esc((member.combatStyle || 'grandMaster') === 'grandMaster' && !state.settings.grandMaster ? 'No style' : supportStyleNames[member.combatStyle || 'grandMaster'])}</span></li>`).join('');
      return `<tr role="row"${current ? ' class="xp-current" aria-current="step"' : ''}><th role="rowheader" scope="row"><span class="xp-range-label" aria-hidden="true">Levels </span>${number(group.from)}–${number(group.to)}${changes ? `<span class="subline">Changed · ${changes}</span>` : ''}</th>
        <td><span class="xp-range-label" aria-hidden="true">Leveler style</span>${esc(styleName(row.style))}</td><td><span class="xp-range-label" aria-hidden="true">Boss attacker</span>${name(row.attackerIndex)}<span class="subline">${row.attackerIndex === leveler ? 'Leveler attacks' : 'Via Veteran’s Exp Share'}</span></td>
        <td class="numeric"><span class="xp-range-label" aria-hidden="true">XP / boss</span>${payout}<button class="text-button xp-compare-button" data-xp-compare="${index}" aria-expanded="${expanded}"${expanded ? ` aria-controls="xp-payout-${index}"` : ''}>Compare payouts</button></td><td><details data-range="${group.from}" ${openLineups.has(group.from) ? 'open' : ''}><summary>View lineup</summary><ol>${lineup}</ol></details></td>
        <td><button class="button ghost small" data-xp-apply="${index}" aria-label="Use levels ${group.from} to ${group.to} lineup for Team ${key.toUpperCase()}">Use in ${key.toUpperCase()}</button></td></tr>${expanded ? renderBossComparison(row, index, group, level) : ''}`;
    }).join('');
    container.innerHTML = `<div class="table-scroll"><table class="xp-ranges" role="table" aria-label="Leveling recommendations"><thead role="rowgroup"><tr><th>Level range</th><th>Leveler style</th><th>Boss attacker</th><th class="numeric">XP / boss</th><th>Team &amp; tiles</th><th>Apply</th></tr></thead><tbody role="rowgroup">${rows}</tbody></table></div>`;
    if (scrollLeft) container.firstElementChild.scrollLeft = scrollLeft;
  }
  // The offline bundle carries the engine source for its background worker.
  // The source template and environments without workers yield between ranges.
  function startRoadmap() {
    if (roadmap?.running) { clearRoadmap(); renderRoadmap(); return; }
    const panel = comparison(), key = panel.showTeamB ? 'b' : 'a';
    const team = panel.teams[key].map(slot => ({...slot})), settings = teamSettings(key);
    const allowed = [...state.allowed], ranges = ENGINE.experienceRanges(team, settings);
    const active = {rows: [], groups: [], total: ranges.length, running: true};
    roadmap = active;
    renderRoadmap();
    function receive(message) {
      if (roadmap !== active) return;
      if (message.row) {
        active.rows.push(message.row);
        active.groups = ENGINE.groupExperienceRanges(active.rows);
      }
      if (message.error || active.rows.length === active.total) {
        active.error = message.error || '';
        active.running = false;
        roadmapWorker?.terminate();
        roadmapWorker = null;
      }
      renderRoadmap();
    }
    const engineSource = typeof Worker === 'function' && document.querySelector('script[data-source="engine.js"]')?.textContent;
    if (engineSource) {
      const run = function ({data}) {
        try {
          let seed = data.team;
          for (const range of data.ranges) {
            const row = self.HeroEngine.suggestExperienceRange(seed, data.settings, data.allowed, range.from);
            self.postMessage({row});
            seed = row.team;
          }
        } catch (error) { self.postMessage({error: error.message}); }
      };
      const url = URL.createObjectURL(new Blob(['self.HERO_DATA=', JSON.stringify(DATA), ';\n', engineSource, '\nself.onmessage=', run.toString()], {type: 'text/javascript'}));
      try {
        roadmapWorker = new Worker(url);
        roadmapWorker.onmessage = event => receive(event.data);
        roadmapWorker.onerror = event => receive({error: event.message || 'The leveling plan search could not run.'});
        roadmapWorker.postMessage({team, settings, allowed, ranges});
        return;
      } catch { roadmapWorker?.terminate(); roadmapWorker = null; }
      finally { URL.revokeObjectURL(url); }
    }
    let seed = team;
    function next() {
      if (roadmap !== active || !active.running) return;
      try {
        const row = ENGINE.suggestExperienceRange(seed, settings, allowed, ranges[active.rows.length].from);
        seed = row.team;
        receive({row});
        if (active.running) window.setTimeout(next, 0);
      } catch (error) { receive({error: error.message}); }
    }
    window.setTimeout(next, 0);
  }
  function supportStyleSummary(team, levelerIndex) {
    const counts = {};
    for (const slot of team) {
      if (slot.id === team[levelerIndex]?.id) continue;
      const style = slot.combatStyle || 'grandMaster';
      const name = style === 'grandMaster' && !state.settings.grandMaster ? 'No style' : supportStyleNames[style];
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts).map(([name,count]) => `${count} ${name}`).join(' · ') || 'none';
  }
  function renderSupportStyle(key, index) {
    if (state.focus !== 'experience') return '';
    const panel = comparison(), team = panel.teams[key], slot = team[index];
    if (slot.id === team[panel.levelingTargets[key]]?.id) return '';
    const minimum = Math.min(...team.filter(other => other.id === slot.id).map(other => other.level));
    return `<select class="xp-support-style" data-xp-support-style="${key}:${index}" aria-label="Team ${key.toUpperCase()}, slot ${index + 1} support combat style"><option value="" ${!slot.combatStyle ? 'selected' : ''}>Account setting · ${state.settings.grandMaster ? 'Grand Master' : 'no style'}</option>${Object.entries(supportStyleLevels).map(([style,level]) => `<option value="${style}" ${slot.combatStyle === style ? 'selected' : ''} ${minimum < level ? 'disabled' : ''}>${supportStyleNames[style]}${level ? ' · Lv ' + number(level) : state.settings.grandMaster ? '' : ' · off'}</option>`).join('')}</select>`;
  }
  function heroPortrait(id) {
    const source = window.HERO_PORTRAITS?.[id];
    return source ? `<img class="hero-portrait" src="${esc(source)}" alt="" draggable="false">` : '';
  }
  function renderHeroPicker(key, index, hero) {
    const type = immortalEngine.typeOf(hero.id), fieldId = `hero-picker-${key}-${index}`;
    return `<label class="hero-picker" data-hero-class="${type}"><span class="hero-picker-field">${heroPortrait(hero.id)}
      <input class="hero-combobox" id="${fieldId}" data-hero-search="${key}:${index}" type="text" role="combobox"
        aria-label="Team ${key.toUpperCase()}, slot ${index + 1} hero" aria-describedby="${fieldId}-class" aria-controls="hero-picker-list"
        aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off" autocapitalize="none" autocorrect="off" enterkeyhint="done" spellcheck="false" placeholder="Search heroes…" value="${esc(hero.name)}">
      <span class="hero-picker-chevron" aria-hidden="true"></span></span><span class="hero-picker-class" id="${fieldId}-class">${immortalModes[type]}</span></label>`;
  }
  let openHeroPicker = null;
  function closeHeroPicker() {
    if (!openHeroPicker) return;
    const {input} = openHeroPicker;
    openHeroPicker = null;
    input.value = input.defaultValue;
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-describedby', input.id + '-class');
    input.removeAttribute('aria-activedescendant');
    $('hero-picker-popup').hidden = true;
  }
  function positionHeroPicker() {
    if (!openHeroPicker) return;
    const input = openHeroPicker.input, popup = $('hero-picker-popup');
    const rect = input.closest('.hero-picker-field').getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? document.documentElement.clientHeight;
    const below = top + height - rect.bottom - 12, above = rect.top - top - 12;
    const upwards = below < 175 && above > below;
    const popupWidth = Math.min(Math.max(235, rect.width), width - 16);
    popup.style.width = popupWidth + 'px';
    popup.style.maxHeight = Math.max(0, Math.min(320, upwards ? above : below)) + 'px';
    popup.style.left = Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8)) + 'px';
    popup.style.top = (upwards ? rect.top - 4 - popup.offsetHeight : rect.bottom + 4) + 'px';
  }
  function highlightHero(id) {
    const list = $('hero-picker-list');
    list.querySelector('.is-active')?.classList.remove('is-active');
    openHeroPicker.active = id;
    if (!id) { openHeroPicker.input.removeAttribute('aria-activedescendant'); return; }
    const optionId = 'hero-option-' + id;
    openHeroPicker.input.setAttribute('aria-activedescendant', optionId);
    const option = list.querySelector('#' + optionId);
    option.classList.add('is-active');
    option.scrollIntoView({block:'nearest'});
  }
  function showHeroMatches(input, text) {
    if (busy) { input.value = input.defaultValue; return; }
    if (openHeroPicker?.input !== input) closeHeroPicker();
    input.value = text;
    input.removeAttribute('aria-describedby');
    const [key, index] = input.dataset.heroSearch.split(':');
    const team = comparison().teams[key], selected = team[Number(index)].id;
    const query = text.trim().toLowerCase();
    const matches = DATA.heroes.filter(hero => hero.name.toLowerCase().includes(query));
    if (query) matches.sort((a,b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)));
    const counts = new Map();
    for (const slot of team) counts.set(slot.id, (counts.get(slot.id) || 0) + 1);
    const enabled = matches.filter(hero => hero.id === selected || (counts.get(hero.id) || 0) < 3).map(hero => hero.id);
    $('hero-picker-list').innerHTML = matches.map(hero => {
      const type = immortalEngine.typeOf(hero.id), disabled = hero.id !== selected && counts.get(hero.id) >= 3;
      return `<div id="hero-option-${hero.id}" class="hero-picker-option" role="option" data-hero-id="${hero.id}" data-hero-class="${type}"
        aria-selected="${hero.id === selected}" aria-disabled="${disabled}">${heroPortrait(hero.id)}<span class="hero-picker-name">${esc(hero.name)}</span>
        <span class="hero-picker-option-class">${immortalModes[type]}${disabled ? ' · 3 in team' : ''}</span></div>`;
    }).join('');
    $('hero-picker-status').textContent = matches.length ? '' : 'No heroes match your search.';
    openHeroPicker = {input, enabled, active:null};
    $('hero-picker-popup').hidden = false;
    input.setAttribute('aria-expanded', 'true');
    positionHeroPicker();
    highlightHero(query ? enabled[0] : selected);
  }
  function chooseHero(id, keepTypingFocus = true) {
    if (!openHeroPicker || busy || !openHeroPicker.enabled.includes(id)) return;
    const {input} = openHeroPicker, [key, rawIndex] = input.dataset.heroSearch.split(':'), index = Number(rawIndex);
    const panel = comparison(), team = panel.teams[key], slot = team[index];
    closeHeroPicker();
    if (id === slot.id) {
      if (keepTypingFocus) input.select();
      else input.blur();
      return;
    }
    if (state.focus === 'experience') {
      const target = team[panel.levelingTargets[key]];
      if (index === panel.levelingTargets[key]) {
        const supportLevel = team.find(other => other.id === id)?.level ?? panel.experienceOptions[key].supportLevel;
        restoreLevelingCopies(panel, key);
        slot.level = 1;
        panel.experienceOptions[key] = {...xpOptions(supportLevel), optimizeSupportStyles:panel.experienceOptions[key].optimizeSupportStyles};
      } else if (slot.id === target?.id) slot.level = panel.experienceOptions[key].supportLevel;
    }
    delete slot.combatStyle;
    slot.id = id;
    edited();
    if (keepTypingFocus) $(input.id).focus({preventScroll:true});
  }
  function suggestButton(key, firstChallenger = false) {
    const label = 'Team ' + key.toUpperCase();
    const title = firstChallenger ? 'Start a comparison using Team A’s settings, levels and locks.' : `Search using ${label}’s settings.`;
    const hidden = firstChallenger && !(comparison().teamAReady && comparison().teams.a.length);
    return `<button type="button" id="${key === 'a' ? 'optimize-a' : 'optimize'}" data-suggest-team="${key}" class="button small${firstChallenger ? '' : ' primary'}" title="${title}"${hidden ? ' hidden' : ''}>Suggest team ${key.toUpperCase()}</button>`;
  }
  function renderTeams() {
    closeHeroPicker();
    const tag = tagFor(state.focus);
    $('teams').innerHTML = visibleTeamKeys().map(key => {
      const team = comparison().teams[key], result = results[key];
      $('mobile-team-name-' + key).textContent = comparison().names[key];
      const attacker = isImmortal() ? null : result?.experiencePlan?.attackerIndex ?? comparison().attackers[key];
      const attackerControl = !tag && !isImmortal() && state.focus !== 'experience' && state.focus !== 'powerMageEnergy' ? `<div class="attacker-control"><label class="field">Team ${key.toUpperCase()} attacker<select data-attacker="${key}" aria-label="Team ${key.toUpperCase()} attacker" ${team.length ? '' : 'disabled'}>${team.length ? team.map((slot, index) => `<option value="${index}" ${attacker === index ? 'selected' : ''}>Slot ${index + 1} · ${esc(byId.get(slot.id).name)}</option>`).join('') : '<option value="">Add a hero to choose an attacker</option>'}</select></label><p class="hint">${state.focus === 'energy' ? 'Energy uses wave income. This attacker controls only the Damage, Gold and XP cards; Energy suggestions may replace it.' : 'Damage, Gold and XP use only this attacker’s personal bonuses plus team globals. ' + (comparison().chooseAttacker ? 'Suggestions can choose a new attacker. Locked heroes stay.' : 'Suggestions keep this attacker and its level; tiles may change.')}</p></div>` : '';
      const levelingTarget = comparison().levelingTargets[key];
      const levelingControl = state.focus === 'experience' ? renderLevelingControl(key) : '';
      const rows = team.map((slot, index) => {
        const address = `${key}:${index}`, label = `Team ${key.toUpperCase()}, slot ${index + 1}`;
        const isAttacker = !tag && state.focus !== 'powerMageEnergy' && attacker === index;
        const isCaster = tag && result.tagCasters[state.focus]?.index === index;
        const isLeveler = state.focus === 'experience' && slot.id === team[levelingTarget]?.id;
        const tiles = Object.entries(tileNames).filter(([id]) => id !== 'experience' || state.focus === 'experience').map(([id, name]) => {
          const full = id !== 'normal' && id !== slot.tile && team.filter(other => other.tile === id).length >= tileLimit(id);
          return `<option value="${id}" ${id === slot.tile ? 'selected' : ''} ${full ? 'disabled' : ''}>${name}</option>`;
        }).join('');
        return `<div data-hero-class="${immortalEngine.typeOf(slot.id)}" class="hero-row ${isLeveler ? 'leveling-row' : isAttacker || isCaster ? 'attacker-row' : ''}">
          <div class="slot-heading">
            <span class="hero-number" title="Slot ${index + 1}${isCaster ? ' · Tag caster' : isAttacker ? ' · Attacker' : ''}">${String(index + 1).padStart(2, '0')}</span>
            <div class="hero-identity">${renderHeroPicker(key,index,byId.get(slot.id))}${renderSupportStyle(key,index)}</div>
          </div>
          <label class="slot-field slot-level-field"><span>Level</span><input class="hero-level" data-level="${address}" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${slot.level}" aria-label="${label} hero level"></label>
          <label class="slot-field slot-tile-field"><span>Tile</span><select class="tile-select" data-tile="${address}" aria-label="${label} placement tile" title="Milestone +20%, synergy +10%, skill power +20% (3 each); Kill Gold, Damage and XP +20% (1 each); the XP tile boosts kills made by its occupant">${tiles}</select></label>
          <button data-lock="${address}" class="icon-button lock-button ${slot.locked ? 'active' : ''}" aria-label="${slot.locked ? 'Unlock' : 'Lock'} team ${key.toUpperCase()} slot ${index + 1}" aria-pressed="${slot.locked}" title="Keep this hero during suggestions; its tile may change"><span class="slot-action-icon">${slot.locked ? '▣' : '□'}</span><span class="slot-action-text">${slot.locked ? 'Locked' : 'Lock'}</span></button>
          <button data-remove="${address}" class="icon-button remove-button" aria-label="Remove team ${key.toUpperCase()} slot ${index + 1}" title="Remove hero"><span class="slot-action-icon">×</span><span class="slot-action-text">Remove</span></button>
        </div>`;
      }).join('');
      const tileCounts = ['milestone', 'synergy', 'skill', 'killGold', 'damage', ...(state.focus === 'experience' ? ['experience'] : [])].map(tile => `<span>${tileNames[tile]} <strong>${team.filter(slot => slot.tile === tile).length}/${tileLimit(tile)}</strong></span>`).join('');
      return `<article id="lineup-editor-${key}" class="team-card team-${key}">
        <header class="team-heading">
          <div class="team-title-group"><span class="team-letter">${key.toUpperCase()}</span><div class="team-identity">
            <input class="team-name" data-name="${key}" value="${esc(comparison().names[key])}" maxlength="40" aria-label="Team ${key.toUpperCase()} name">
            <small>${Object.keys(comparison().ascensionOverrides?.[key] || {}).length ? 'TEAM ASCENSION BUILD' : 'MY ASCENSIONS'} <span class="team-count">· ${team.length} / 10 heroes</span></small>
          </div></div>
          <div class="team-suggest-actions">${suggestButton(key)}${key === 'a' && !comparingTeams() ? suggestButton('b', true) : ''}</div>
        </header>${attackerControl}${levelingControl}<div class="team-labels"><span></span><span>Hero</span><span>Level</span><span class="tile-heading">Tile</span><span>Lock</span><span></span></div><div class="hero-rows">${rows || '<p class="empty-team">Add a hero to begin this lineup.</p>'}</div><div class="tile-counts">${tileCounts}</div><div class="team-footer"><button class="text-button" data-add="${key}" ${team.length >= 10 ? 'disabled' : ''}>＋ Add hero</button><button class="text-button" data-suggest-tiles="${key}" title="${tag ? 'Compare placements for ' + byId.get(tag.heroId).name + '’s Skill Power.' : isImmortal() ? 'Compare placements for total Immortal damage.' : state.focus === 'gold' ? 'Compare Kill Gold, milestone, synergy and active skill placements for this attacker.' : isDamageFocus() ? 'Compare Damage, milestone, synergy and skill placements for this attacker.' : state.focus === 'experience' ? 'Compare the boss attacker’s XP tile with milestone, synergy and skill placements.' : 'Optimize milestone and synergy placements; remaining skill tiles favor XP abilities, then Skill Power and Damage.'}">Suggest tiles ↗</button><span>${result?.counts?.synergies ?? 0} synergies</span></div>${comparingTeams() ? `<button type="button" class="mobile-team-jump text-button" data-open-editor="${key === 'a' ? 'b' : 'a'}">Edit Team ${key === 'a' ? 'B' : 'A'} ↑</button>` : ''}</article>`;
    }).join('');
  }
  function renderStandardMetrics() {
    const tag = tagFor(state.focus);
    const teams = visibleTeamKeys();
    const keys = tag ? [state.focus, ...metricKeys] : metricKeys;
    const score = (result, key) => {
      if (tag && ['damage', 'gold', 'experience'].includes(key)) {
        const caster = result.tagCasters[state.focus];
        return caster ? result.heroes[caster.index].metrics[key] : 0;
      }
      return result.metrics[key];
    };
    $('metrics').innerHTML = keys.map(key => {
      const labelKey = key === 'damage' && state.focus === 'damageBuffSwap' ? 'damageBuffSwap' : key;
      const label = tag && key === state.focus ? byId.get(tag.heroId).name + ' Skill Power'
        : key === 'experience' && state.focus === 'experience' ? 'Leveler XP / boss'
        : key === 'gold' && state.settings.goldMimicFarming ? 'Gold / Mimic' : focusNames[labelKey];
      const values = teams.map(team => score(results[team], key));
      const cells = values.map((value, i) => `<div class="metric-value"><span>TEAM ${teams[i].toUpperCase()}</span><strong title="${precise(value)}">${scoreFormat(value)}</strong></div>`).join('');
      let change = '';
      if (comparingTeams()) {
        const [a, b] = values;
        const delta = a > 0 ? (b / a - 1) * 100 : b > 0 ? Infinity : 0;
        const deltaText = !Number.isFinite(delta) ? 'Team B adds output' : Math.abs(delta) < 0.005 ? 'Even with team A' : delta < -99.99 && b > 0 ? 'Over 99.99% lower than team A' : `${delta > 0 ? '+' : ''}${number(delta)}% vs team A`;
        change = `<div class="metric-delta ${delta > .005 ? 'positive' : delta < -.005 ? 'negative' : ''}">${deltaText}</div>`;
      }
      return `<article class="metric-card ${objectiveFor(state.focus) === key ? 'focused' : ''}"><div class="metric-top"><span class="metric-name">${label}</span><span class="metric-symbol" aria-hidden="true">${symbols[labelKey]}</span></div><div class="metric-values">${cells}</div>${change}</article>`;
    }).join('');
    const [a, b] = teams.map(team => results[team].metrics[objectiveFor(state.focus)]);
    if (tag) {
      const name = byId.get(tag.heroId).name;
      $('damage-context').textContent = visibleTeamKeys().map(key => {
        const caster = results[key].tagCasters[state.focus];
        return caster ? `Team ${key.toUpperCase()} tags with ${name} in slot ${caster.index + 1}.` : `Team ${key.toUpperCase()} needs ${name} to tag.`;
      }).join(' ');
      $('comparison-description').textContent = !comparingTeams() ? '' : a === b ? `Both teams give ${name} the same Skill Power.` : `Team ${b > a ? 'B' : 'A'} gives ${name} ${number(Math.abs(a - b))} more Skill Power.`;
      return;
    }
    $('damage-context').textContent = (state.focus === 'powerMageEnergy' ? 'Energy + Power Mages uses team globals and is independent of the attacker. Side-card attackers — ' : '') + visibleTeamKeys().map(key => {
      const attacker = comparison().attackers[key], slot = comparison().teams[key][attacker];
      return `Team ${key.toUpperCase()}: ${slot ? `${byId.get(slot.id).name} in slot ${attacker + 1}` : 'no attacker'}`;
    }).join(' · ') + '. Damage, Gold and XP use only this attacker; supports contribute global bonuses. Energy remains wave income.' + (state.focus === 'damageBuffSwap' ? ' Buff-swap Damage includes only Witch / Apprentice support debuffs; external buff-team skills are omitted.' : '');
    if (state.focus === 'gold' && state.settings.goldMimicFarming) $('damage-context').textContent += ' The Gold index is the expected payout per Mimic.';
    if (state.focus === 'experience') $('damage-context').textContent = visibleTeamKeys().map(key => {
      const plan = results[key].experiencePlan, team = comparison().teams[key];
      if (!plan) return `Team ${key.toUpperCase()} has no leveler`;
      const leveler = byId.get(team[plan.levelerIndex].id).name, attacker = byId.get(team[plan.attackerIndex].id).name;
      return `Team ${key.toUpperCase()} · ${leveler} ${plan.attackerIndex === plan.levelerIndex ? 'earns XP directly' : plan.veteranIndex == null ? 'needs Veteran for shared XP' : 'receives XP from ' + attacker + ' through Veteran'}`;
    }).join('  /  ');
    $('comparison-description').textContent = !comparingTeams() ? '' : Math.abs(a - b) < 1e-10 ? `Both teams have the same ${focusNames[state.focus].toLowerCase()} index. Change a hero or explore a suggested lineup.` : `Team ${b > a ? 'B' : 'A'} leads for ${focusNames[state.focus].toLowerCase()}. Inspect the bonuses below to see why.`;
  }
  function renderImmortal() {
    const config = state.immortal.config, mode = config.mode;
    const classSpeed = usesAttackPriority(mode), objective = immortalObjectives[config.priority];
    $('immortal-modes').innerHTML = Object.entries(immortalModes).map(([id, name]) =>
      `<button class="support-sort-button ${mode === id ? 'active' : ''}" data-immortal-mode="${id}" aria-pressed="${id === mode}">${name}</button>`).join('');
    const rule = mode === 'skill' ? 'Only hits classified as skill damage count. All hero types can contribute.' : `Only ${immortalModes[mode]} heroes deal damage to this Immortal. All types can supply buffs and synergies.`;
    $('immortal-rule').textContent = rule + (classSpeed
      ? ' Boss attacks/s counts each eligible attack cycle directed at the boss once. Extra projectiles and skill hits appear in hits/s. Skymage spends some cycles teleporting. Set each hero’s Max Attack Speed in My ascensions. Each rank raises the cap by 1/s, from 10 to 15/s.'
      : ' Each Champion casts its own Lightning Storm.');
    $('immortal-buff-preset').value = config.buffTeam;
    $('immortal-priority-field').hidden = mode === 'skill';
    const priorities = classSpeed ? ['hits','attacks','damage'] : mode === 'melee' ? ['strikes','damage'] : ['damage'];
    $('immortal-priority').innerHTML = priorities.map(id => `<option value="${id}">${immortalObjectives[id].option}</option>`).join('');
    $('immortal-priority').value = config.priority;
    const damageChances = damagePreTeamChances();
    $('immortal-use-damage-chances').hidden = !damageChances;
    const current = [config.baseCritChance,config.baseSuperChance,config.baseUltraChance];
    const matchesTemplate = defaults.chanceReferences.damage.totals.every((value,i) => value === current[i]);
    const context = current.every(value => value >= 100) ? ' These inputs already guarantee all three rolls before hero bonuses.'
      : matchesTemplate ? ' These inputs match the recorded pre-team Damage defaults.' : '';
    $('immortal-ultra-note').textContent = `Suggestions maximize the weakest attacker’s Ultra chance using the Crit, Super and Ultra rolls shown in Hero Stats. At equal coverage, teams compete on ${objective.label}. Boss settings start this comparison at +${number(config.baseCritChance)} Crit Chance points, ${number(config.baseSuperChance)}% Super and ${number(config.baseUltraChance)}% Ultra before hero bonuses.${context}`;
    if (damageChances) $('immortal-use-damage-chances').title = `Apply the saved Damage reference of ${number(damageChances[0])}% Crit, ${number(damageChances[1])}% Super and ${number(damageChances[2])}% Ultra to all Immortals.`;
    $('immortal-preset-note').textContent = config.buffTeam === 'deploy'
      ? 'Team suggestions include all four supports, even when they are outside the optional roster. Warlock supplies the shortened cast interval.'
      : config.buffTeam === 'swap' ? 'The swap assumes attackers received Warlock, Wizard and Titan buffs. Apprentice’s debuff requires a deployed Apprentice who can target the boss.'
      : 'Warlock supplies the shortened cast interval from the swap team. Other support bonuses come from the deployed lineup.';
    const breakdown = [];
    $('immortal-totals').innerHTML = visibleTeamKeys().map(key => {
      const result = results[key].immortal;
      const missing = config.buffTeam === 'deploy' ? buffTeamIds.filter(id => !result.heroes.some(hero => hero.id === id)) : [];
      const eligible = classSpeed ? result.heroes.filter(hero => hero.eligible) : [];
      for (const hero of result.heroes) {
        const skillName = hero.skill || (hero.skillTaggedAttacks ? 'Skill-enhanced attacks' : hero.tickRate ? 'Damage over time' : '');
        const skill = skillName ? esc(skillName) + (hero.castRate > 0 && hero.skillHits > 0
          ? `<span class="subline">${number(hero.skillHits)} hits/cast · ${number(hero.castRate)} casts/s</span>` : '') : '—';
        const power = hero.id === 'champion' && hero.skillHits > 0
          ? `<span class="subline">${number(hero.effectiveSkillPower)} Skill Power · ${number(hero.skillPercent)}% per strike · +${number(hero.masteryPercent)}% per repeat</span>` : '';
        const speedCells = classSpeed ? `<td>${number(hero.attacksPerSecond)}</td><td>${number(hero.aps)} / ${number(hero.speedCap)}<span class="subline">${number(hero.uncappedAttackSpeed)} before cap</span></td>` : '';
        const ultraCell = hero.critEligibleHitsPerSecond > 0
          ? `<td>${hero.passiveCritChances.map(value => number(value) + '%').join(' / ')}<span class="subline">${ultraPercent(hero.passiveUltraProbability)} effective Ultra</span></td><td>${ultraPercent(hero.ultraProbability)}<span class="subline">${number(hero.ultraHitsPerSecond)} expected Ultra hits/s</span></td>`
          : '<td>—</td><td>—</td>';
        breakdown.push(`<tr><td>${key.toUpperCase()} · ${hero.index + 1}</td><th scope="row">${esc(byId.get(hero.id).name)}<span class="subline">${esc(immortalModes[hero.type] || hero.type)}</span></th>
          ${speedCells}<td>${hero.eligible ? number(hero.totalHitRate) : 'Support'}</td>${ultraCell}<td>${skill}${power}</td><td class="numeric">${number(hero.attackDps)}</td><td class="numeric">${number(hero.skillDps)}</td><td class="numeric">${number(hero.score)}</td></tr>`);
      }
      return `<article><span class="immortal-team-id">Team ${key.toUpperCase()} · ${esc(comparison().names[key])}</span><strong>${number(result[objective.key])} <small>${objective.label}</small></strong>
        ${config.priority !== 'damage' ? `<p>${number(result.score)} boss damage/s</p>` : ''}
        ${classSpeed && config.priority !== 'attacks' ? `<p>${number(result.attacksPerSecond)} boss attacks/s</p>` : ''}
        <p>${immortalUltraSummary(result)}</p>
        ${classSpeed && eligible.length ? `<p>${eligible.filter(hero => hero.attacksPerSecond >= 15).length} of ${eligible.length} eligible heroes reach 15 boss attacks/s</p>` : ''}
        <p>${config.priority === 'hits' ? '' : number(result.totalHitRate) + ' scoring hits/s · '}${number(result.attackDps)} attack DPS · ${number(result.skillDps)} skill DPS</p>
        ${(mode === 'skill' || mode === 'melee') && config.priority !== 'strikes' ? `<p class="immortal-strikes">${number(result.championHitsPerSecond)} Champion strikes/s</p>` : ''}
        ${missing.length ? `<p class="immortal-missing">Missing preset supports · ${missing.map(id=>esc(byId.get(id).name)).join(', ')}</p>` : ''}</article>`;
    }).join('');
    $('immortal-breakdown').innerHTML = `<div class="table-scroll" role="region" tabindex="0" aria-label="Attacks and damage by hero"><table><thead><tr><th>Team / slot</th><th>Hero</th>${classSpeed ? '<th>Boss attacks/s</th><th>Attack speed / cap (per s)</th>' : ''}<th>Scoring hits/s</th><th>Hero Stats<br>Crit / Super / Ultra</th><th>Effective Ultra with buffs</th><th>Damage skill</th><th>Attack DPS</th><th>Skill DPS</th><th>Total DPS</th></tr></thead><tbody>${breakdown.join('')}</tbody></table></div>`;
    $('immortal-fields').innerHTML = immortalFields.map(([key,label,min,max]) =>
      `<label class="field">${label}<input type="number" step="any" min="${min}" max="${max}" value="${config[key]}" data-immortal-field="${key}"></label>`).join('');
    $('immortal-account-speed').value = config.accountAttackSpeedBonus;
    $('immortal-speed-hero').innerHTML = DATA.heroes.map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}</option>`).join('');
    $('immortal-speed-hero').value = immortalAttributeHero;
    renderImmortalAttributes(config);
    $('immortal-calibration').textContent = 'Champion’s defaults use the no-heroes screenshot on the Snow Fort profile. Other heroes share the pre-team Skill Power and mastery estimates above. Account damage scales the level-based hit by a power of ten (0 gives ×1, 60 gives ×10⁶⁰).';
    if (!comparingTeams()) { $('comparison-description').textContent = ''; return; }
    const a = results.a.immortal, b = results.b.immortal;
    const lead = immortalEngine.compareResults(a,b,config.priority);
    const criterion = immortalEngine.comparisonCriterion(a,b,config.priority);
    const winner = lead > 0 ? 'Team A' : 'Team B';
    let description = `Both teams average ${immortalTotal(a,config.priority)}.`;
    if (criterion === 'lowestPassiveUltraProbability') description = `${winner} leads on the weakest attacker’s Ultra chance without temporary buffs (A ${ultraPercent(a.lowestPassiveUltraProbability)}, B ${ultraPercent(b.lowestPassiveUltraProbability)}).`;
    else if (criterion === 'attackingHeroes') description = `${winner} has an attacker with crit-eligible hits against the ${immortalModes[mode]} Immortal.`;
    else if (criterion === objective.key) description = `${winner} leads for ${objective.label} against the ${immortalModes[mode]} Immortal.`;
    else if (criterion === 'lowestUltraProbability') description += ` ${winner} wins with a higher effective Ultra chance on its lowest-chance attacker.`;
    else if (criterion === 'ultraHitsPerSecond') description += ` The lowest Ultra chances tie. ${winner} delivers more expected Ultra hits/s.`;
    else if (criterion === 'score') description += ` ${winner} wins the boss DPS tiebreaker.`;
    else if (config.priority !== 'damage') description += classSpeed ? 'Ultra tiebreakers and boss DPS are also tied.' : 'Boss DPS is also tied.';
    $('comparison-description').textContent = description;
  }
  function renderTagPower() {
    const section = $('tag-power-report'), tag = tagFor(state.focus);
    section.hidden = !tag;
    if (!tag) return;
    const name = byId.get(tag.heroId).name;
    const casters = visibleTeamKeys().map(key => results[key].tagCasters[state.focus]);
    const rows = [
      ['Pre-team Skill Power', 'basePower', number],
      [name + '’s personal milestones', 'personalMilestones', number],
      ['Team-wide milestones', 'globalMilestones', number],
      [name + '’s personal synergies', 'personalSynergies', number],
      ['Team-wide synergies', 'globalSynergies', number],
      ['Grand Master multiplier', 'grandMasterFactor', supportMultiplier],
      ['Caster’s tile multiplier', 'tileFactor', supportMultiplier],
      ['Effective Skill Power', 'score', number]
    ];
    const headings = casters.map((caster, i) => `<th class="numeric">Team ${i ? 'B' : 'A'} · ${caster ? 'slot ' + (caster.index + 1) : 'missing ' + name}</th>`).join('');
    section.innerHTML = `<h3>${name}’s tag Skill Power</h3><p>Add the pre-team, global and personal power. Multiply by the Grand Master and tile bonuses, then round to the nearest whole point.</p><div class="table-scroll"><table><thead><tr><th>Source</th>${headings}</tr></thead><tbody>${rows.map(([label, field, format]) => `<tr><th scope="row">${label}</th>${casters.map(caster => `<td class="numeric">${caster ? format(caster[field]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  // Renderers set each report's eligibility. Tabs control which eligible report is on screen.
  const selectedReportIds = new Map();
  const reportTabs = Array.from(document.querySelectorAll('#focus-analysis > [data-report-tab]'), panel => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = 'tab-' + panel.id;
    tab.textContent = panel.dataset.reportTab;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => selectFocusReport(panel));
    $('focus-report-tabs').appendChild(tab);
    return {tab, panel};
  });
  function selectFocusReport(panel) {
    selectedReportIds.set(state.focus, panel.id);
    renderFocusReports();
  }
  function renderFocusReports() {
    const available = reportTabs.filter(({panel}) => !panel.hidden);
    const selected = available.find(({panel}) => panel.id === selectedReportIds.get(state.focus)) || available[0];
    $('focus-analysis').hidden = !selected;
    $('focus-report-tabs').hidden = available.length < 2;
    $('focus-explanations-heading').textContent = focusNames[state.focus] + ' explanations';
    for (const entry of reportTabs) {
      const {tab, panel} = entry;
      const active = entry === selected;
      tab.hidden = panel.hidden;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected', String(active));
      if (active) panel.removeAttribute('data-inactive');
      else panel.setAttribute('data-inactive', '');
    }
  }
  $('focus-report-tabs').addEventListener('keydown', event => {
    const available = reportTabs.filter(({panel}) => !panel.hidden);
    const current = available.findIndex(({tab}) => tab === event.target);
    if (current < 0) return;
    let next;
    switch (event.key) {
      case 'ArrowRight': next = (current + 1) % available.length; break;
      case 'ArrowLeft': next = (current + available.length - 1) % available.length; break;
      case 'Home': next = 0; break;
      case 'End': next = available.length - 1; break;
      default: return;
    }
    event.preventDefault();
    selectFocusReport(available[next].panel);
    available[next].tab.focus();
  });
  function renderMetrics() {
    const immortal = isImmortal();
    $('immortal-panel').hidden = !immortal;
    $('immortal-hero-report').hidden = $('immortal-settings-report').hidden = !immortal;
    for (const id of ['metrics','damage-context','standard-model-note']) $(id).hidden = immortal;
    if (immortal) renderImmortal(); else renderStandardMetrics();
    renderTagPower();
    renderExperienceSkillSummary();
    renderChanceReference();
    renderMimicFarming();
    renderGoldComparison();
    renderDamagePlacements();
    renderExperiencePlacements();
    renderDamageSkills();
    renderDamageSupportSkills();
    renderGoldPlacements();
    renderGoldSkills();
    renderGoldAttackerSkill();
    renderWaveEnergy();
    renderPowerMageComparison();
  }
  function renderExperienceSkillControls() {
    $('xp-skills').checked = state.settings.experienceSkills;
    $('xp-skill-fields').innerHTML = ['Archer','Ballista','Veteran'].map(hero => `<h4>${hero}</h4><div class="xp-plan-settings">${experienceSkillFields.filter(field => field[1] === hero).map(([key,,label,,min,max]) => `<label>${label}<input data-xp-skill-field="${key}" type="number" min="${min}" max="${max}" step="${['experienceWave','experienceBallistaStacks','experienceVeteranStacks'].includes(key) ? '1' : 'any'}" value="${state.settings[key]}" ${state.settings.experienceSkills ? '' : 'disabled'}></label>`).join('')}</div>`).join('');
  }
  function renderExperienceSkillSummary() {
    if (!state.settings.experienceSkills) { $('xp-skill-summary').textContent = 'XP skills are disabled. Archer, Ballista and Veteran remain required for Experience suggestions only.'; return; }
    $('xp-skill-summary').textContent = visibleTeamKeys().map(key => {
      const profile = results[key].experienceSkills || ENGINE.experienceSkillsFor?.(comparison().teams[key], teamSettings(key));
      const skills = (profile?.skills || []).map(skill => `${byId.get(skill.id)?.name || skill.id} (ability: slot ${skill.ownerIndex + 1}): ${skill.effects.map(effect => effect.type === 'Exp Reward Multiplier' ? 'XP reward ×' + precise(1 + effect.value / 100) : `${statName(effect.type)} +${number(effect.value)}${/Chance/.test(effect.type) ? ' pp' : '%'}`).join(', ')}`);
      return `Team ${key.toUpperCase()} · ${skills.length ? skills.join(' · ') : 'No configured XP skill owners deployed'}`;
    }).join(' | ');
  }
  function chanceDraft(focus) {
    const reference = state.settings.chanceReferences[focus];
    return chanceReferenceDrafts[focus] ??= {
      mode: reference?.mode || 'legacy', reference,
      values: reference ? reference.totals.map(String) : Array(focus === 'gold' ? 2 : 3).fill(''),
      extraOverflow: String(reference?.extraOverflow ?? 0)
    };
  }
  function chanceInputIds(focus) {
    return (focus === 'gold' ? ['super', 'ultra'] : ['crit', 'super', 'ultra']).map(tier => 'chance-reference-' + tier);
  }
  function renderChanceReference() {
    const section = $('chance-reference'), focus = state.focus;
    section.hidden = !chanceFocuses.includes(focus);
    if (section.hidden) return;
    const draft = chanceDraft(focus), reference = state.settings.chanceReferences[focus], gold = focus === 'gold';
    $('chance-reference-title').textContent = `${focusNames[focus]} chance reference`;
    $('chance-reference-intro').textContent = `Spillover uses only the chance above each 100% cap. ${gold ? 'Super and Ultra Gold' : 'Crit, Super Crit and Ultra Crit'} chance share one pool. This reference is independent of the other focuses and the standalone support rankings.`;
    if (gold && state.settings.goldMimicFarming) $('chance-reference-intro').textContent = 'Super Gold rolls first. A Super drop can roll Ultra. Chance above 100% increases that tier’s amount. See the Mimic income tab for the payout and probability of each outcome.';
    $('chance-reference-mode').value = draft.mode;
    $('chance-reference-fields').hidden = draft.mode === 'legacy';
    $('chance-reference-crit-field').hidden = gold;
    $('chance-reference-super-label').textContent = gold ? 'Super Gold chance (%)' : 'Super Crit chance (%)';
    $('chance-reference-ultra-label').textContent = gold ? 'Ultra Gold chance (%)' : 'Ultra Crit chance (%)';
    chanceInputIds(focus).forEach((id, index) => { $(id).value = draft.values[index]; });
    $('chance-reference-extra').value = draft.extraOverflow;
    $('chance-reference-input-help').textContent = draft.mode === 'preTeam'
      ? 'Enter totals with no team contributions included. Zero is valid. Apply these totals to add each candidate’s bonuses before checking each cap. Input changes take effect only when applied.'
      : 'Enter displayed totals with the reference team deployed, using the same attacker, skills, levels and tiles. Capture the matching team so only candidate changes are added. Apply totals updates an existing capture without changing its recorded team.';
    $('chance-reference-apply').textContent = draft.mode === 'preTeam' ? 'Apply pre-team totals' : 'Apply totals to recorded team';
    $('chance-reference-apply').disabled = busy || draft.mode === 'recorded' && draft.reference?.mode !== 'recorded';
    for (const key of ['a', 'b']) {
      $('chance-reference-' + key).hidden = draft.mode !== 'recorded' || key === 'b' && !comparingTeams();
      $('chance-reference-' + key).disabled = busy || !comparison().teams[key].length;
    }
    let context = reference
      ? `${reference.label || 'Chance reference'} · ${reference.mode === 'preTeam' ? 'Pre-team totals' : 'Recorded team totals'} · Additional spillover ${number(reference.extraOverflow ?? 0)}%. ${gold && state.settings.goldMimicFarming ? 'Mimic payouts use separate Super and Ultra overflow factors. Additional pooled spillover applies only to the legacy Gold index.' : 'The shared extra-overflow setting is replaced by this reference’s additional spillover.'}`
      : 'No account chance totals are recorded for this focus. The existing calculation assumes every tier is already at 100%; all modeled added chance points count as excess. The shared extra-overflow setting still applies.';
    if (gold && state.settings.goldMimicFarming && !reference) context = 'The already-capped assumption starts both Gold tiers at 100%. Additional tier-specific chance increases the corresponding tier payout.';
    if (draft.mode !== 'legacy' && !reference) context += ' Reference pending: enter totals and apply them or capture the team to replace that assumption.';
    if (reference && draft.mode !== reference.mode) context += ` Current ${reference.mode === 'preTeam' ? 'pre-team' : 'recorded team'} reference remains active until you apply or capture the new reference.`;
    if (reference && (draft.values.some((value, i) => value.trim() === '' || Number(value) !== reference.totals[i]) || Number(draft.extraOverflow) !== (reference.extraOverflow ?? 0))) context += ' Input changes are not applied yet.';
    $('chance-reference-context').textContent = context;
    const columns = visibleTeamKeys().map(key => {
      const result = results[key], index = gold ? result.goldIndex : result.attackerIndex, hero = result.heroes[index];
      return {key, hero, details: hero ? ENGINE.chanceDetailsFor(hero.bonuses, teamSettings(key), focus, gold ? null : hero.damageSkill?.chanceRolls) : null};
    });
    const warnings = [];
    if (reference?.mode === 'recorded') reference.contributions.forEach((value, i) => {
      if (value > reference.totals[i] + 1e-9) warnings.push(`Recorded team contribution ${number(value)} pp exceeds the entered ${number(reference.totals[i])}% for ${gold ? ['Super Gold', 'Ultra Gold'][i] : ['Crit', 'Super Crit', 'Ultra Crit'][i]}. Check the captured skill window and setup; candidate changes use this fixed reference.`);
    });
    if (!(gold && state.settings.goldMimicFarming) && columns.some(column => column.details?.belowCap)) warnings.push('At least one chance total is below 100%. Spillover correctly excludes those points; payout tiers remain assumed guaranteed, so proc probabilities are not included in these scores.');
    if (columns.some(column => column.details?.expectedRolls)) warnings.push('Random skill rolls show expected chances. Excess points and spillover are averaged after applying the caps to each roll.');
    $('chance-reference-warning').hidden = !warnings.length;
    $('chance-reference-warning').textContent = warnings.join(' ');
    const labels = gold ? ['Super Gold', 'Ultra Gold'] : ['Crit', 'Super Crit', 'Ultra Crit'];
    const row = (label, field, value) => `<tr><th scope="row">${label}</th>${columns.map(column => column.details ? `<td class="numeric" data-chance-${field}="${column.key}" title="${precise(value(column.details))}">${field === 'factor' ? '×' : ''}${number(value(column.details))}${field === 'factor' ? '' : field.startsWith('total') ? '%' : ' pp'}</td>` : '<td class="numeric">—</td>').join('')}</tr>`;
    const totals = labels.map((label, i) => row(`${reference ? 'Total' : 'Assumed total'} ${label} chance`, 'total-' + i, details => details.totals[i])).join('');
    const projectedOverflow = gold && state.settings.goldMimicFarming ? '' : row('Points above the 100% caps', 'excess', details => details.excessPoints)
      + row('Shared chance spillover multiplier', 'factor', details => details.factor);
    $('chance-reference-report').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Chance calculation</th>${columns.map(column => `<th class="numeric">Team ${column.key.toUpperCase()} · ${esc(column.hero?.name || 'No attacker')}</th>`).join('')}</tr></thead><tbody>${totals}${projectedOverflow}</tbody></table></div>`;
  }
  function renderDamageControls() {
    renderDamageSupportControls();
    $('damage-settings').hidden = !isDamageFocus() && !isImmortal();
    $('damage-skills').checked = state.settings.damageSkills;
    $('damage-tile').value = state.settings.damageTile;
    $('damage-tile').disabled = !state.settings.snowFort;
    $('damage-warden-distance').value = state.settings.damageWardenDistance;
    $('damage-warden-distance').disabled = !state.settings.damageSkills;
    $('damage-profile-hero').innerHTML = damageDefinitions.map(def => `<option value="${def.id}" ${def.id === damageProfileHero ? 'selected' : ''}>${esc(def.name)} · ${esc(def.skillName)}</option>`).join('');
    const def = damageDefinitions.find(def => def.id === damageProfileHero);
    $('damage-profile-fields').innerHTML = def ? `<p class="hint">${esc(def.skillName)} · ${number(def.duration)}s duration / ${number(def.cooldown)}s cooldown. Score while active.</p>${['active', 'mastery'].map(stage => `<h4>${stage === 'active' ? 'Active skill' : 'Mastery'}</h4>${def.fields.filter(field => field.stage === stage).map(field => `<label class="field">${esc(field.label)}<input data-damage-field="${field.key}" type="number" min="0" max="1000000000" step="0.01" value="${state.settings[field.key]}" ${!state.settings.damageSkills ? 'disabled' : ''}></label>`).join('')}`).join('')}` : '';
  }
  function renderDamageSupportControls() {
    const buffSwap = state.focus === 'damageBuffSwap';
    $('damage-support-settings').hidden = !isDamageFocus() && !isImmortal();
    $('damage-support-title').textContent = buffSwap ? 'Witch & Apprentice debuffs' : 'Damage support skills';
    $('damage-support-toggle-label').textContent = buffSwap ? 'Include Witch and Apprentice debuffs' : 'Include global support skills and mastery';
    $('damage-support-mode-help').textContent = buffSwap ? 'Only deployed Witch and Apprentice debuffs count, using each hero’s first copy and its tile. Both use elapsed time independently of kills. Captured profiles and this toggle are shared with standard Damage.' : 'Each hero contributes once, using its first deployed copy and that copy’s tile. All buffs are assumed active and in range of the attacker.';
    $('damage-full-support-scenario').hidden = buffSwap;
    $('damage-support-skills').checked = state.settings.damageSupportSkills;
    for (const [id, key] of [['damage-support-seconds', 'damageSupportSeconds'], ['damage-support-stacks', 'damageSupportStacks'], ['damage-support-teleports', 'damageSupportTeleports'], ['damage-necromancer-roll', 'damageNecromancerRoll']]) {
      $(id).value = state.settings[key];
      $(id).disabled = !state.settings.damageSupportSkills;
    }
    const profiles = buffSwap ? damageSupportDefinitions.filter(def => ['witch', 'apprentice'].includes(def.id)) : damageSupportDefinitions;
    if (!profiles.some(def => def.id === damageSupportProfileHero)) damageSupportProfileHero = 'apprentice';
    $('damage-support-profile-hero').innerHTML = profiles.map(def => `<option value="${def.id}" ${def.id === damageSupportProfileHero ? 'selected' : ''}>${esc(def.name)} · ${esc(def.skillName)}</option>`).join('');
    const def = profiles.find(def => def.id === damageSupportProfileHero);
    $('damage-support-profile-fields').innerHTML = def ? ['active', 'mastery'].map(stage => `<h4>${stage === 'active' ? 'Active skill' : 'Mastery'}</h4>${def.fields.filter(field => field.stage === stage).map(field => `<label class="field">${esc(field.label)} (%)<input data-damage-support-field="${field.key}" type="number" min="0" max="1000000000" step="0.01" value="${state.settings[field.key]}" ${!state.settings.damageSupportSkills ? 'disabled' : ''}></label>`).join('') || '<p class="hint">No damage bonus in this stage.</p>'}`).join('') : '';
  }
  function renderDamageSupportSkills() {
    const section = $('damage-support-breakdown');
    section.hidden = !isDamageFocus();
    if (section.hidden) return;
    const effects = list => list?.length ? list.map(effect => `<span class="subline">${effect.type === 'Triple Shot Damage' ? `×${number(1 + effect.value / 100)} attacks` : `+${number(effect.value)}${/Chance/.test(effect.type) ? ' pp' : '%'} ${esc(effect.type)}`}</span>`).join('') : '—';
    const rows = visibleTeamKeys().map(key => {
      const skills = results[key].damageSupportSkills?.skills || [];
      return skills.length ? skills.map(skill => `<tr data-damage-support="${key}:${skill.id}"><th scope="row">Team ${key.toUpperCase()} · ${esc(skill.name)}<span class="subline">${esc(skill.skillName)} · Slot ${skill.ownerIndex + 1} · first copy</span></th><td>${effects(skill.activeEffects)}</td><td>${effects(skill.masteryEffects)}</td><td>×${number(skill.tileBoost)} active / ×${number(skill.masteryTileBoost)} mastery<span class="subline">${(skill.notes || []).map(esc).join(' ')}</span></td></tr>`).join('') : `<tr><th>Team ${key.toUpperCase()}</th><td colspan="3">${state.settings.damageSupportSkills ? 'No captured support skills in this lineup.' : 'Support skills off.'}</td></tr>`;
    }).join('');
    const buffSwap = state.focus === 'damageBuffSwap';
    const scenario = buffSwap ? `Only Witch and Apprentice are counted while deployed and in range, with ${number(state.settings.damageSupportSeconds)} seconds of accumulated mastery. Other support skills come from your separate buff team and are omitted from this index.` : `All buffs are assumed active and in range: ${number(state.settings.damageSupportSeconds)} seconds, ${number(state.settings.damageSupportStacks)} kill stacks, and ${number(state.settings.damageSupportTeleports)} Skymage teleports.`;
    const details = buffSwap ? 'Each debuff applies once to the attacker. Witch’s active curse and accumulated mastery are separate multipliers; Apprentice’s mastery builds with elapsed time. Zero kills does not remove these timed effects.' : `Each buff applies once to the attacker. Active and accumulated mastery multipliers are separate; chance bonuses join the shared damage spillover pool. Wizard caps at ×3 attacks, without excess-chance spillover. Necromancer uses ${state.settings.damageNecromancerRoll === 'maximum' ? 'maximum rolls' : 'the midpoint of each range (a scenario, not exact expected damage)'}. Splash is an additional single-target multiplier, without multiplying by enemy count.`;
    section.innerHTML = `<h3>${buffSwap ? 'Damage from Witch & Apprentice debuffs' : 'Damage from support skills'}</h3><p>${scenario} Only the first copy of each hero supplies its buff; later copies cannot add or replace it.</p><div class="table-scroll"><table><thead><tr><th>Buff owner</th><th>Active bonuses used</th><th>Mastery bonuses used</th><th>Tile / assumptions</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">${details} Skill tiles boost both active and mastery bonuses by 20%; captured values do not receive account or raw Skill Power boosts again.</p>`;
  }
  function renderExperiencePlacements() {
    const section = $('experience-placement-comparison');
    section.hidden = state.focus !== 'experience';
    if (section.hidden) return;
    if (!state.settings.snowFort) { section.innerHTML = '<h3>Boss attacker tile comparison</h3><p>Enable Snow Fort to compare placement bonuses.</p>'; return; }
    const tiles = ['normal', 'experience', 'milestone', 'synergy', 'skill'];
    const rows = visibleTeamKeys().map(key => {
      const report = ENGINE.compareExperienceAttackerTiles?.(comparison().teams[key], teamSettings(key));
      if (!report) return `<tr><th>Team ${key.toUpperCase()}</th><td colspan="6">Choose a hero to level to compare boss attacker tiles.</td></tr>`;
      const slot = comparison().teams[key][report.attackerIndex], winner = report.preferred;
      const best = report.options[winner];
      const changed = best && best.team.some((candidate, index) => candidate.tile !== comparison().teams[key][index].tile);
      const recommendation = !best || report.gain === 0 ? `Tied: ${(report.ties || [winner]).map(tile => tileNames[tile]).join(' / ')}` : `${tileNames[winner]}${Number.isFinite(report.gain) ? ` · +${number(report.gain * 100)}% vs next best` : ''}`;
      return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(byId.get(slot.id).name)}<span class="subline">Attacker slot ${report.attackerIndex + 1} · currently ${tileNames[slot.tile]}</span></th>${tiles.map(tile => `<td class="numeric" data-xp-placement="${key}:${tile}" title="${precise(report.options[tile].score)}">${scoreFormat(report.options[tile].score)}</td>`).join('')}<td class="gold-recommendation"><strong>${recommendation}</strong>${changed ? `<button class="text-button" data-xp-tile-swap="${key}">Use ${tileNames[winner]} for Team ${key.toUpperCase()} ↗</button>` : ''}</td></tr>`;
    }).join('');
    section.innerHTML = `<h3>Which tile is best for the boss attacker?</h3><p>A hero on the XP tile earns ×${number(1 + state.settings.experienceTile / 100)} XP when it makes the kill. Veteran’s Exp Share gives each hero in range the boosted reward on a successful share. The table shows the XP your leveler receives for each placement on the current attacker.</p><div class="table-scroll"><table><thead><tr><th>Boss attacker</th>${tiles.map(tile => `<th class="numeric">${tileNames[tile]}</th>`).join('')}<th>Higher received XP</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">Each option replaces the attacker’s current tile. When the tile type is full, the table uses the best available swap. With Best on team selected, each option can choose a different killer. Suggest tiles searches placements across the whole lineup.</p>`;
  }
  function renderDamagePlacements() {
    const section = $('damage-placement-comparison');
    section.hidden = !isDamageFocus();
    if (section.hidden) return;
    if (!state.settings.snowFort) { section.innerHTML = '<h3>Attacker tile comparison</h3><p>Enable Snow Fort to compare placement bonuses. Your tile assignments are retained while map bonuses are off.</p>'; return; }
    const tiles = ['normal', 'milestone', 'synergy', 'skill', 'damage'];
    const rows = visibleTeamKeys().map(key => {
      const report = ENGINE.compareDamageAttackerTiles(comparison().teams[key], teamSettings(key));
      if (!report) return `<tr><th>Team ${key.toUpperCase()}</th><td colspan="6">Choose an attacker to compare its tiles.</td></tr>`;
      const slot = comparison().teams[key][report.attackerIndex], winner = report.preferred;
      const best = report.options[winner];
      const changed = best && best.team.some((candidate, index) => candidate.tile !== comparison().teams[key][index].tile);
      const recommendation = !best || report.gain === 0 ? `Tied: ${(report.ties || [winner]).map(tile => tileNames[tile]).join(' / ')}` : `${tileNames[winner]}${Number.isFinite(report.gain) ? ` · +${number(report.gain * 100)}% vs next best` : ''}`;
      return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(byId.get(slot.id).name)}<span class="subline">Slot ${report.attackerIndex + 1} · currently ${tileNames[slot.tile]}</span></th>${tiles.map(tile => `<td class="numeric" data-damage-placement="${key}:${tile}" title="${precise(report.options[tile].score)}">${scoreFormat(report.options[tile].score)}</td>`).join('')}<td class="gold-recommendation"><strong>${recommendation}</strong>${changed ? `<button class="text-button" data-damage-swap="${key}">Use ${tileNames[winner]} for Team ${key.toUpperCase()} ↗</button>` : ''}</td></tr>`;
    }).join('');
    section.innerHTML = `<h3>Which tile is best for the Damage attacker?</h3><p>The +${number(state.settings.damageTile)}% Damage tile gives its occupant ×${number(1 + state.settings.damageTile / 100)} Damage. Each option includes the attacker’s enabled skill and mastery bonuses, ${state.focus === 'damageBuffSwap' ? 'only deployed Witch / Apprentice debuffs' : 'all enabled support buffs'}, and the effect of losing its previous tile.</p><div class="table-scroll"><table><thead><tr><th>Attacker</th>${tiles.map(tile => `<th class="numeric">${tileNames[tile]} index</th>`).join('')}<th>Higher damage</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">This compares the current roster with one attacker tile change. When a tile type is full, the best legal exchange is used. “Suggest tiles” searches the team’s placements together, so its result can differ. Each hero occupies one tile.</p>`;
  }
  function renderDamageSkills() {
    const section = $('damage-skill-breakdown');
    section.hidden = !isDamageFocus();
    if (section.hidden) return;
    const effects = list => list?.length ? list.map(effect => `<span class="subline">+${number(effect.value)}${/Chance/.test(effect.type) ? ' pp' : '%'} ${esc(effect.type)}</span>`).join('') : '—';
    const rows = visibleTeamKeys().map(key => {
      const hero = results[key].heroes[comparison().attackers[key]], skill = hero?.damageSkill;
      if (!hero) return `<tr><th>Team ${key.toUpperCase()}</th><td colspan="4">Choose an attacker.</td></tr>`;
      const known = skill?.known;
      const mastery = skill?.maxRollChance != null ? `${number(skill.maxRollChance)}% maximum-roll chance` : effects(skill?.masteryEffects);
      return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(hero.name)}<span class="subline">${known ? esc(skill.name) : 'No personal attack skill captured'}</span></th><td data-damage-skill="${key}:active">${skill?.enabled ? effects(skill.activeEffects) : known ? 'Personal skills off' : state.focus === 'damageBuffSwap' ? 'Only deployed Witch / Apprentice debuffs apply' : 'Global support buffs still apply'}</td><td data-damage-skill="${key}:mastery">${skill?.enabled ? mastery : '—'}</td><td class="numeric" data-damage-skill="${key}:factor">${skill?.enabled ? `×${number(skill.tileBoost)} active / ×${number(skill.masteryTileBoost)} mastery` : '—'}<span class="subline">${(skill?.notes || []).map(esc).join(' ')}</span></td><td class="numeric" data-damage-skill="${key}:score"><strong>${scoreFormat(hero.metrics.damage)}</strong><span class="subline">Without personal skills: ${scoreFormat(skill?.passiveScore ?? hero.metrics.damage)}</span></td></tr>`;
    }).join('');
    section.innerHTML = `<h3>Attacker skills · while active</h3><p>Only the selected attacker’s personal skill and mastery bonuses contribute. Skill tiles multiply both captured bonuses by 1.20. Praetorian, Deadeye, Dicemaster, Warden and Warlord are supported.</p><div class="table-scroll"><table><thead><tr><th>Attacker</th><th>Active bonuses used</th><th>Mastery bonuses used</th><th>Tile / assumptions</th><th>Damage index</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">Single-target bonus index, with uncapped attack-speed factors; base attack speed and the 10 attacks/sec cap are not modeled. Splash adds an extra damage multiplier. Deadeye’s extra targets and Warden’s range are excluded. Warden uses ${number(state.settings.damageWardenDistance)}m, scaled proportionally from the observed +${number(state.settings.damageWardenReferenceBonus)}% at ${number(state.settings.damageWardenReferenceDistance)}m. This calibration uses the shown current bonus instead of reconstructing it from rounded per-step labels. Dicemaster uses the expected roll: mastery maximum-roll chance, otherwise a uniform roll within the displayed ranges. Captured no-tile values stay fixed when the lineup changes; edit them when your in-game bonuses change. GM, event, map mastery and other Skill Power are not applied again. Cooldown averaging is off.</p>`;
  }
  function renderGoldPlacements() {
    const section = $('gold-placement-comparison');
    section.hidden = state.focus !== 'gold';
    if (section.hidden) return;
    if (!state.settings.snowFort) { section.innerHTML = '<h3>Attacker tile comparison</h3><p>Enable Snow Fort to compare placement bonuses. Your tile assignments are retained while map bonuses are off.</p>'; return; }
    const rows = visibleTeamKeys().map(key => {
      const report = ENGINE.compareGoldAttackerTiles?.(comparison().teams[key], teamSettings(key));
      if (!report) return `<tr><th>Team ${key.toUpperCase()}</th><td colspan="4">Choose an attacker to compare its tiles.</td></tr>`;
      const slot = comparison().teams[key][report.attackerIndex];
      const winner = report.preferred;
      const recommendation = winner === 'tie' ? 'Same payout' : `${tileNames[winner]} · +${number(report.gain * 100)}% vs ${tileNames[report.runnerUp] || (winner === 'killGold' ? 'Milestone' : 'Kill Gold')}`;
      const changed = winner !== 'tie' && report[winner].team.some((candidate, index) => candidate.tile !== comparison().teams[key][index].tile);
      return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(byId.get(slot.id).name)}<span class="subline">Slot ${report.attackerIndex + 1} · currently ${tileNames[slot.tile]}</span></th>${['milestone','killGold','skill'].map(tile => `<td class="numeric" data-gold-placement="${key}:${tile}" title="${precise(report[tile]?.score)}">${report[tile] ? scoreFormat(report[tile].score) : '—'}</td>`).join('')}<td class="gold-recommendation"><strong>${recommendation}</strong>${changed ? `<button class="text-button" data-gold-swap="${key}">Use ${tileNames[winner]} for Team ${key.toUpperCase()} ↗</button>` : ''}</td></tr>`;
    }).join('');
    section.innerHTML = `<h3>Which tile is best for the Gold attacker?</h3><p>Kill Gold adds +${number(state.settings.goldKillGoldTile)}% to the placed hero (×${number(1 + state.settings.goldKillGoldTile / 100)}). Compare ${state.settings.goldMimicFarming ? 'expected Gold per Mimic' : 'the combined boss-kill and generated-gold index'}, including lost milestone boosts and enabled support skills. Crusader also compares a skill tile for Golden Arrows.</p><div class="table-scroll"><table><thead><tr><th>Attacker</th><th class="numeric">Milestone tile index</th><th class="numeric">Kill Gold tile index</th><th class="numeric">Crusader skill tile index</th><th>Higher payout</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">This compares one attacker’s tile swap with the current roster and other placements. If that tile type is full, the best legal exchange with an existing holder is used. “Suggest tiles” searches all placements together, including up to three skill tiles; its final result can differ from this swap comparison.</p>`;
  }
  function renderGoldAttackerSkill() {
    const section = $('gold-attacker-skill-breakdown');
    section.hidden = state.focus !== 'gold';
    if (section.hidden) return;
    const rows = visibleTeamKeys().map(key => {
      const hero = results[key].heroes[results[key].goldIndex];
      const skill = hero?.goldSkill;
      if (!hero || hero.id !== 'crusader') return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(hero?.name || 'No attacker')}</th><td colspan="4">Golden Arrows only applies when Crusader is the attacker.</td></tr>`;
      return `<tr><th scope="row">Team ${key.toUpperCase()} · ${esc(hero.name)}<span class="subline">Slot ${hero.index + 1} · ${skill?.enabled ? `skill bonus ×${number(skill.tileBoost)}` : 'Gold skills off'}</span></th><td class="numeric" data-gold-attacker-skill="${key}:attacks">${number(skill?.attacks ?? state.settings.goldCrusaderAttacks)}</td><td class="numeric" data-gold-attacker-skill="${key}:base">×${scoreFormat(skill?.baseKillGold ?? 1)}</td><td class="numeric" data-gold-attacker-skill="${key}:factor">×${number(skill?.attackMultiplier ?? 0)}</td><td class="numeric" data-gold-attacker-skill="${key}:payout" title="${precise(skill?.attackGold ?? 0)}"><strong>${scoreFormat(skill?.attackGold ?? 0)}</strong></td></tr>`;
    }).join('');
    section.innerHTML = `<h3>Crusader · Golden Arrows</h3><p>Instant gold from the selected Crusader’s attacks is added once to ${state.settings.goldMimicFarming ? 'the expected Mimic drop' : 'the final boss-kill payout'}. One attack on a wave boss is the default: ${number(state.settings.goldCrusaderBonus)}% of Kill Gold × 50% efficiency = ×${number(state.settings.goldCrusaderBonus / 200)} before a skill tile.</p><div class="table-scroll"><table><thead><tr><th>Attacker</th><th class="numeric">Attacks</th><th class="numeric">Passive Kill Gold</th><th class="numeric">Total attack factor</th><th class="numeric">Generated gold index</th></tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">The first hit has zero previous-hit stacks. Each later hit adds +${number(state.settings.goldCrusaderMastery)}% to its payout, up to 500 stacks. A skill tile boosts both captured bonuses by 1.20. All hits are assumed to occur on the same wave boss while Golden Arrows is active. The instant payout includes global and personal Kill Gold bonuses and the attacker’s Kill Gold tile, but excludes Boss Gold. Super/Ultra rewards and on-kill support buffs are unconfirmed for generated gold and are excluded from this component. The final kill still receives its full configured bonuses. Support copies of Crusader do not add attacks.</p>`;
  }
  function renderGoldSkills() {
    const section = $('gold-skill-breakdown');
    section.hidden = state.focus !== 'gold';
    if (section.hidden) return;
    const definitions = [
      {id:'rogue', name:'Rogue · Gold Aura', key:'goldRogueBonus', stat:'killGold', unit:'% gold'},
      {id:'hunter', name:'Hunter · Gold Lust', key:'goldHunterBonus', stat:'killGold', unit:'% gold'},
      {id:'sovereign', name:'Sovereign · Jackpot chance', key:'goldSovereignChance', stat:'superGoldChance', unit:' pp Super Gold chance'},
      {id:'sovereign', name:'Sovereign · Jackpot amount', key:'goldSovereignAmount', stat:'superGoldAmount', unit:'% Super Gold amount'}
    ];
    const rows = definitions.map(def => `<tr><th scope="row">${def.name}</th><td class="numeric">+${number(state.settings[def.key])}${def.unit}</td><td class="numeric">+${number(state.settings[def.key] * 1.2)}${def.unit}</td>${visibleTeamKeys().map(key => {
      const skill = results[key].goldSkills?.skills.find(skill => skill.id === def.id);
      return `<td class="numeric" data-gold-skill="${key}:${def.id}:${def.stat}">${skill ? `<strong>+${number(skill[def.stat])}${def.unit}</strong><span class="subline">Slot ${skill.ownerIndex + 1} · ${skill.tileBoost > 1 ? 'skill tile ×1.20' : 'no skill tile boost'}</span>` : state.settings.goldSkills ? 'Hero absent' : 'Skills off'}</td>`;
    }).join('')}</tr>`).join('');
    section.innerHTML = `<h3>Gold from active support skills</h3><p>${state.settings.goldSkills ? 'Gold Aura, Jackpot and Gold Lust count once each when their hero is present. All three are assumed active on the kill and in range.' : 'Active skills are switched off. Enable them in Gold skills &amp; killer tile settings.'}</p><div class="table-scroll"><table><thead><tr><th>Skill bonus</th><th class="numeric">Without skill tile</th><th class="numeric">With +20% tile</th>${visibleTeamKeys().map(key => `<th class="numeric">Team ${key.toUpperCase()} uses</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="gold-formula-note">Rogue and Hunter each add a separate Kill Gold factor of 1 + bonus / 100. Sovereign increases Super Gold amount and adds her Super Gold chance once. Duplicate heroes do not multiply a named skill; the skill-tiled copy is used if present. These are captured no-tile skill values, held fixed as the lineup changes. Edit the baselines if your in-game skill values change; additional milestone or synergy Skill Power is not applied again.</p>`;
  }
  function energyFactorTable(rows, dataAttribute) {
    const teams = visibleTeamKeys();
    const headings = teams.map(key => `<th class="numeric">Team ${key.toUpperCase()}</th>`).join('');
    const body = rows.map(([label, getValue, multiplier], row) => {
      const cells = teams.map(key => {
        const value = getValue(key);
        return `<td class="numeric" ${dataAttribute}="${key}:${row}" title="${precise(value)}"><strong>${multiplier ? '×' : ''}${scoreFormat(value)}</strong></td>`;
      }).join('');
      return `<tr><th scope="row">${label}</th>${cells}</tr>`;
    }).join('');
    return `<div class="table-scroll"><table><thead><tr><th>Component</th>${headings}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function renderWaveEnergy() {
    const section = $('wave-energy-report');
    section.hidden = state.focus !== 'energy' && state.focus !== 'powerMageEnergy';
    if (section.hidden) return;
    const rows = [
      ['Base energy per wave', () => state.settings.baseEnergy],
      ['Team Energy Income', key => results[key].global.total['Energy Income'] ?? 0],
      ['Energy Income multiplier', key => results[key].global.total['Energy Income Multiplier'] ?? 1, true],
      ['Super Energy Amount', key => results[key].global.total['Super Energy Amount'] ?? 1, true],
      ['Ultra Energy Amount', key => results[key].global.total['Ultra Energy Amount'] ?? 1, true],
      ['Energy chance spillover', key => results[key].overflow.energy, true],
      ['Wave energy index', key => results[key].metrics.energy]
    ];
    const emptyNote = visibleTeamKeys().some(key => !results[key].heroes.length) ? ' An empty lineup scores zero.' : '';
    section.innerHTML = `<h3>Wave energy income</h3><p>Add base energy and team Energy Income, then multiply by the income, Super Energy, Ultra Energy and chance spillover factors.${emptyNote}</p>${energyFactorTable(rows, 'data-wave-energy-factor')}`;
  }
  function renderPowerMageComparison() {
    const section = $('power-mage-comparison');
    section.hidden = state.focus !== 'powerMageEnergy';
    if (section.hidden) return;
    const rows = [
      ['Wave energy index', key => results[key].metrics.energy, false],
      ['Power Mage Energy factor', key => results[key].global.total['Power Mage Energy'] ?? 1, true],
      ['Energy per Power Mage kill index', key => results[key].metrics.powerMageEnergy, false]
    ];
    section.innerHTML = `<h3>Energy per Power Mage kill</h3><p>Wave energy index × Power Mage Energy factor. The wave index already includes Super and Ultra Energy amounts and the shared energy chance spillover.</p>${energyFactorTable(rows, 'data-power-mage-factor')}<p class="power-mage-formula-note">Global Power Mage Energy percentages multiply after the wave-energy calculation. This is a relative index for each Power Mage kill, not an absolute payout or energy per second. Power Mage spawn frequency and kill rate are not included. Ordinary Energy continues to compare wave income.</p>`;
  }
  function renderMimicFarming() {
    const section = $('gold-mimic-report');
    section.hidden = state.focus !== 'gold' || !state.settings.goldMimicFarming;
    if (section.hidden) return;
    const panel = state.focusTeams.gold;
    const {goldDoubleMimicPercent, goldEnemiesPerMimicEncounter} = state.settings;
    const columns = visibleTeamKeys().map(key => {
      for (const [id, field] of rateFields) $(id + '-' + key).value = panel[field]?.[key] ?? '';
      const enemies = panel.enemiesPerHour?.[key], observed = panel.mimicKillsPerHour?.[key];
      const rate = observed ?? (enemies == null ? null : enemies * (1 + goldDoubleMimicPercent / 100) / goldEnemiesPerMimicEncounter);
      const result = results[key], hero = result.heroes[result.goldIndex], skill = hero?.goldSkill;
      return {key, hero, skill, mimic: skill?.mimic, rate, observed, hourly: rate == null || !skill ? null : rate * skill.totalScore};
    });
    const row = (field, label, value, format = scoreFormat) => `<tr><th scope="row">${label}</th>${columns.map(col => {
      const n = value(col);
      return `<td class="numeric" data-mimic-${field}="${col.key}"${n == null ? '' : ` title="${precise(n)}"`}>${n == null ? '—' : format(n, col)}</td>`;
    }).join('')}</tr>`;
    const percent = n => number(n * 100) + '%', factor = n => '×' + number(n);
    const rows = [
      row('normal-chance','Normal Gold', c => c.mimic?.normalProbability, percent),
      row('super-chance','Super Gold only', c => c.mimic?.superProbability, percent),
      row('ultra-chance','Ultra Gold', c => c.mimic?.ultraProbability, percent),
      row('wave-boss','Wave Boss factor before team bonuses', c => c.mimic?.waveBossGoldFactor, factor),
      row('mimic-gold','Mimic Gold factor', c => c.mimic?.mimicGoldFactor, factor),
      row('normal-payout','Normal payout index', c => c.mimic?.normalPayout),
      row('super-payout','Super payout index', c => c.mimic?.superPayout),
      row('ultra-payout','Ultra payout index', c => c.mimic?.ultraPayout),
      row('super-overflow','Super Gold excess-chance factor', c => c.mimic?.superOverflowFactor, factor),
      row('ultra-overflow','Ultra Gold excess-chance factor', c => c.mimic?.ultraOverflowFactor, factor),
      row('expected','Expected drop per Mimic', c => c.mimic?.expectedGold),
      row('attacks','Gold from attacks on this Mimic', c => c.skill?.attackGold),
      row('total','Expected Gold index per Mimic · used for suggestions', c => c.skill?.totalScore),
      row('rate','Successful Mimic kills per hour', c => c.rate, (n,c) => number(n) + (c.observed == null ? ' · estimated' : ' · measured')),
      row('hourly','Expected Mimic Gold index per hour', c => c.hourly)
    ];
    $('gold-mimic-results').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Mimic farming</th>${columns.map(c => `<th class="numeric">Team ${c.key.toUpperCase()} · ${esc(c.hero?.name || 'No attacker')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    $('gold-mimic-rate-context').textContent = `Using one encounter per ${number(goldEnemiesPerMimicEncounter)} enemies and ${number(goldDoubleMimicPercent)}% double encounters. An entered Mimic rate already includes doubles and takes precedence. The displayed +67% Mimic chance and +55% extra boss chance are already reflected in observed rates. Remeasure when clear speed changes. Gold indexes use the configured skill window and a common base reward.`;
  }
  function renderGoldComparison() {
    const section = $('gold-comparison');
    section.hidden = state.focus !== 'gold' || state.settings.goldMimicFarming;
    if (section.hidden) return;
    const keys = visibleTeamKeys();
    const attackers = Object.fromEntries(keys.map(key => [key, results[key].heroes[comparison().attackers[key]]]));
    const personal = Object.fromEntries(keys.map(key => [key, Object.values(attackers[key]?.local || {}).reduce(mergeBuckets, {})]));
    const cell = (key, type) => {
      const hero = attackers[key];
      if (!hero) return '<td class="numeric">—</td>';
      const overflow = type === 'spillover';
      const value = overflow ? hero.overflow.gold : hero.bonuses[type] ?? 1;
      const chance = bucket => (bucket['Super Gold Chance'] || 0) + (bucket['Ultra Gold Chance'] || 0);
      const detail = overflow ? `Global +${number(chance(results[key].global.total))} pp · personal +${number(chance(personal[key]))} pp` : `Global ×${number(results[key].global.total[type] ?? 1)} · personal ×${number(personal[key][type] ?? 1)}`;
      return `<td class="numeric" data-gold-factor="${key}:${esc(type)}" title="${precise(value)}"><strong>×${scoreFormat(value)}</strong><span class="subline">${detail}</span></td>`;
    };
    const rows = [['Kill Gold', 'Kill Gold'], ['Boss Gold', 'Boss Gold'], ['Super Gold Amount', 'Super Gold Amount'], ['Ultra Gold Amount', 'Ultra Gold Amount'], ['spillover', 'Shared gold chance spillover']].map(([type, label]) => `<tr><th scope="row">${label}</th>${keys.map(key => cell(key, type)).join('')}</tr>`).join('');
    const payoutRows = ['Boss Gold amount', 'Super Gold amount', 'Ultra Gold amount'].map((label, tier) => `<tr class="gold-payout-row"><th scope="row">${label} index</th>${keys.map(key => {
      const hero = attackers[key];
      if (!hero) return '<td class="numeric">—</td>';
      const b = hero.bonuses;
      const value = (b['Kill Gold'] ?? 1) * (b['Boss Gold'] ?? 1) * (tier >= 1 ? b['Super Gold Amount'] ?? 1 : 1) * (tier >= 2 ? b['Ultra Gold Amount'] ?? 1 : 1);
      return `<td class="numeric" data-gold-payout="${key}:${tier}" title="${precise(value)}">${scoreFormat(value)}</td>`;
    }).join('')}</tr>`).join('');
    const totalRows = [
      ['kill', 'Attacker boss gold index · with spillover', key => attackers[key]?.goldSkill?.killScore ?? results[key].metrics.gold],
      ['attacks', 'Crusader generated gold index · without Boss Gold', key => attackers[key]?.goldSkill?.attackGold ?? 0],
      ['total', 'Combined Gold index · used for suggestions', key => results[key].metrics.gold]
    ].map(([id, label, valueFor]) => `<tr><th scope="row">${label}</th>${keys.map(key => { const value = valueFor(key); return `<td class="numeric" data-gold-total="${key}:${id}" title="${precise(value)}"><strong>${scoreFormat(value)}</strong></td>`; }).join('')}</tr>`).join('');
    section.innerHTML = `<h3>Gold payout factors</h3><p>Every killed enemy is assumed to be a boss and receives the full Boss Gold multiplier. Final boss-kill index = Kill Gold × Boss Gold × Super Gold Amount × Ultra Gold Amount × shared chance spillover. Golden Arrows adds a separate generated-gold payout when Crusader is the attacker. Each column uses its attacker’s personal bonuses and all team globals. A support’s personal gold bonuses only help when it is the attacker.</p><div class="table-scroll"><table><thead><tr><th>Factor</th>${keys.map(key => `<th class="numeric">Team ${key.toUpperCase()} · ${esc(attackers[key]?.name || 'No attacker')}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="gold-payout-heading"><th colspan="${keys.length + 1}">Payout progression before chance spillover · relative indexes</th></tr>${payoutRows}${totalRows}</tbody></table></div><p class="gold-formula-note">Each kill-payout tier includes the previous tier: Ultra includes Boss Gold and Super Gold. Spillover uses one pool: 1 + (${number(state.settings.chanceReferences.gold?.extraOverflow ?? state.settings.baseOverflow)} + ${number(state.settings.overflowRate)} × ${state.settings.chanceReferences.gold ? 'the sum of Super and Ultra Gold chance above their separate 100% caps' : 'total added gold chance points, assuming both tiers were already capped'}) / 100. See Chance reference for each attacker’s totals and excess points. These are relative bonus indexes on a shared base-gold scale, not the screenshot’s currency amounts. Absolute base payouts, hero-specific support multipliers beyond the configured account bonuses, and kill rate are not modeled. Configured active Gold skill bonuses are included once; their no-tile baselines can be updated in Gold settings. Generated gold and the final kill are shown separately so unconfirmed interactions remain visible.</p>`;
  }
  function localBucket(effects, kind, index) {
    const bucket = {};
    effects.filter(effect => effect.kind === kind && !effect.global && effect.ownerIndex === index).forEach(effect => { const multi = ENGINE.statMode(effect.type) === 'multiply'; bucket[effect.type] = multi ? (bucket[effect.type] ?? 1) * (1 + effect.value / 100) : (bucket[effect.type] ?? 0) + effect.value; });
    return bucket;
  }
  function mergeBuckets(a = {}, b = {}) { const output = { ...a }; for (const [type, value] of Object.entries(b)) output[type] = ENGINE.statMode(type) === 'multiply' ? (output[type] ?? 1) * value : (output[type] ?? 0) + value; return output; }
  function renderDetails() {
    if (!comparingTeams()) detailTeam = 'a';
    const result = results[detailTeam], team = comparison().teams[detailTeam];
    if (detailScope !== 'global' && Number(detailScope) >= team.length) detailScope = 'global';
    $('detail-scope').innerHTML = '<option value="global">Global team bonuses</option>' + team.map((slot, index) => `<option value="${index}" ${detailScope === String(index) ? 'selected' : ''}>Slot ${index + 1} · ${esc(byId.get(slot.id).name)} (personal)</option>`).join('');
    $('detail-scope').value = detailScope;
    $('scope-field').hidden = detailTab !== 'bonuses';
    document.querySelectorAll('[data-detail-team]').forEach(button => button.classList.toggle('active', button.dataset.detailTeam === detailTeam));
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', button.dataset.tab === detailTab));
    $('detail-content').setAttribute('aria-labelledby', `tab-${detailTab}`);
    $('synergy-count').textContent = result.counts.synergies;
    $('milestone-count').textContent = result.counts.milestones;
    $('style-count').textContent = result.counts.styles ?? result.effects.filter(effect => effect.kind === 'style').length;
    $('map-count').textContent = result.effects.filter(effect => effect.kind === 'map' || effect.kind === 'placement').length;
    const style = result.style;
    $('style-summary').innerHTML = style && state.settings.grandMaster ? `<div><strong>Grand Master on ${number(style.count ?? team.length)} heroes</strong><span>Milestones ${state.settings.grandMasterStacking === 'add' ? 'add +10% per hero' : 'multiply ×1.1 per hero'} · synergies ${state.settings.synergyGrandMasterStacking === 'add' ? 'add +10% per hero' : 'multiply ×1.1 per hero'} · each hero has ×0.1 personal attack speed${state.settings.synergyEvent ? ' · event included: milestones ×1.25 / synergies ×1.10' : ''}</span></div><div class="style-factors"><span>Milestones before ascension and tile <strong>×${precise(style.effectiveMilestoneScale ?? state.settings.milestoneScale * (style.bonusScale ?? 1))}</strong></span><span>Synergies before account / tile <strong>×${precise(style.effectiveSynergyScale ?? 1)}</strong></span></div>` : `<div><strong>No combat style applied</strong><span>Reference milestone strength is ×${precise(style?.effectiveMilestoneScale ?? state.settings.milestoneScale)} before ascension and tiles.${state.settings.synergyEvent ? ' Includes event milestones ×1.25; synergies also receive ×1.10.' : ''} Enable Grand Master in Calculation settings to apply it to every deployed hero.</span></div>`;
    const map = result.map;
    $('map-summary').innerHTML = `<div><strong>${state.settings.snowFort ? 'Snow Fort' : 'No map modifiers'}</strong><span>${state.settings.snowFort ? `Tier 5–6 synergy +${number(state.settings.mapT56)}% · tier 7 +${number(state.settings.mapT7)}% · attack speed ${number(state.settings.mapAttackSpeed)}%` : 'Placement assignments are retained; their bonuses are inactive.'}</span></div><div class="style-factors">${state.settings.snowFort ? '<span>Milestone tiles <strong>+20%</strong></span><span>Synergy tiles <strong>+10%</strong></span><span>Skill tiles <strong>+20%</strong></span>' : '<span>Tile bonuses <strong>Off</strong></span>'}</div>`;
    if (isImmortal()) {
      const grandMasters = result.style.count;
      $('style-summary').innerHTML = `<div><strong>${number(grandMasters)} Grand Masters</strong><span>Immortal Skill Power and mastery power ×${precise(1.05 ** grandMasters)} before tile and map modifiers.</span></div>`;
    }
    if (result.experiencePlan) {
      const plan = result.experiencePlan;
      const copies = team.filter(slot => slot.id === team[plan.levelerIndex].id).length;
      $('style-summary').innerHTML = `<div><strong>${esc(byId.get(team[plan.levelerIndex].id).name)} · ${esc(styleName(plan.styleId))}</strong><span>${number(copies)} leveling ${copies === 1 ? 'copy' : 'copies sharing level and style'} · ${number(style.count)} Grand Masters on other heroes · supports: ${esc(supportStyleSummary(team, plan.levelerIndex))}</span></div><div class="style-factors"><span>Milestones before ascension and tile <strong>×${precise(style.effectiveMilestoneScale)}</strong></span><span>Synergies before account / tile <strong>×${precise(style.effectiveSynergyScale)}</strong></span></div>`;
    }
    const query = $('detail-search').value.trim().toLowerCase(), focusOnly = $('focus-only').checked;
    if (detailTab === 'bonuses') {
      const index = Number(detailScope), global = detailScope === 'global';
      const milestone = global ? result.global.milestone : result.heroes[index]?.local?.milestone || localBucket(result.effects, 'milestone', index);
      const synergy = global ? result.global.synergy : result.heroes[index]?.local?.synergy || localBucket(result.effects, 'synergy', index);
      const combatStyle = {...(global ? result.global.style : result.heroes[index]?.local?.style)};
      // Grand Master's Skill Power percentages appear in the tag multiplier, separately from flat points.
      if (global && tagFor(state.focus)) delete combatStyle['Skill Power'];
      const mapTiles = mergeBuckets(global ? result.global.map : result.heroes[index]?.local?.map, global ? result.global.placement : result.heroes[index]?.local?.placement);
      const skills = (global ? result.global.skill : result.heroes[index]?.local?.skill) || {};
      const ascension = (global ? result.global.ascension : result.heroes[index]?.local?.ascension) || {};
      const hasAscension = Object.keys(ascension).length > 0;
      const types = [...new Set([...Object.keys(ascension), ...Object.keys(milestone), ...Object.keys(synergy), ...Object.keys(combatStyle), ...Object.keys(mapTiles), ...Object.keys(skills)])].filter(type => (!query || `${type} ${statName(type)}`.toLowerCase().includes(query)) && (!focusOnly || related(type))).sort((a, b) => Number(related(b)) - Number(related(a)) || a.localeCompare(b));
      const rows = types.map(type => { const multi = ENGINE.statMode(type) === 'multiply', m = milestone[type] ?? (multi ? 1 : 0), s = synergy[type] ?? (multi ? 1 : 0), c = combatStyle[type] ?? (multi ? 1 : 0), p = mapTiles[type] ?? (multi ? 1 : 0), a = skills[type] ?? (multi ? 1 : 0), asc = ascension[type] ?? (multi ? 1 : 0), total = multi ? m * s * c * p * a * asc : m + s + c + p + a + asc; const boost = /Milestone Bonus|Synergy Bonus|Synergy.*Tier|Tier.*Synergy/.test(type), tileBoost = !global && (type === 'Milestone Bonus' || type === 'Synergy Bonus') && p !== 1; return `<tr><td>${esc(statName(type))}${tileBoost ? `<span class="subline">Adds +${number((p - 1) * 100)} percentage points to Grand Master strength</span>` : boost ? '<span class="subline">Already applied to the effect values</span>' : type === 'Skill Power (tile)' ? '<span class="subline">Applies to the occupant’s modeled skills</span>' : !isScoredStat(type) ? '<span class="subline">Not included in focus scores</span>' : ''}</td><td class="numeric">${bonusFormat(type, m)}</td><td class="numeric">${bonusFormat(type, s)}</td><td class="numeric">${bonusFormat(type, c)}</td><td class="numeric">${bonusFormat(type, p)}</td><td class="numeric">${bonusFormat(type, a)}</td>${hasAscension ? `<td class="numeric">${bonusFormat(type, asc)}</td>` : ''}<td class="numeric">${bonusFormat(type, total)}</td><td class="muted">${tileBoost ? 'Add to GM' : multi ? 'Multiply' : isScoredStat(type) ? 'Add' : 'Raw sum'}</td></tr>`; }).join('');
      const overflow = global ? result.overflow : result.heroes[index]?.overflow;
      const overflowHtml = overflow ? `<div class="overflow-strip"><span>Shared spillover pools</span>${['energy', 'gold', 'experience', 'damage'].filter(key => key !== 'gold' || !state.settings.goldMimicFarming).map(key => `<span>${focusNames[key]}<strong>×${number(overflow[key] ?? 1)}</strong></span>`).join('')}</div>` : '';
      const scales = global ? null : result.heroes[index]?.effectiveScales;
      const scalesHtml = scales ? `<p class="detail-caption">This owner’s effect strength: milestones ×${precise(scales.milestone)} · synergies before tier ×${precise(scales.synergy)} · tier 1–2 ×${precise(scales.tier12 ?? scales.synergy)} · tier 3–4 ×${precise(scales.tier34 ?? scales.synergy)} · tier 5–6 ×${number(scales.tier56)} · tier 7 ×${number(scales.tier7)}.</p>` : '';
      $('detail-content').innerHTML = overflowHtml + scalesHtml + `<p class="detail-caption">${global ? 'Global bonuses from milestones, synergies, combat styles, the map and configured active Gold skills. Personal effects are available in the scope selector.' : 'Personal bonuses only. This hero also receives every global team bonus.'} Milestone values already include the permanent multiplier once. Both milestone and synergy values include the owner’s style, map and tile boosts. Chance totals are percentage points; Energy Income and Rank XP are flat, while their separately named multipliers scale those amounts. Unscored additive stats show raw sums, not modeled in-game effects.</p><div class="table-scroll"><table><thead><tr><th>Bonus</th><th class="numeric">Milestones</th><th class="numeric">Synergies</th><th class="numeric">Combat style</th><th class="numeric">Map / tiles</th><th class="numeric">Active / mastery skills</th>${hasAscension ? `<th class="numeric">${global ? 'Global' : 'Personal'} ascension</th>` : ''}<th class="numeric">Combined</th><th>Stacking</th></tr></thead><tbody>${rows || `<tr><td colspan="${hasAscension ? 9 : 8}" class="table-empty">No matching bonuses in this scope.</td></tr>`}</tbody></table></div>`;
    } else {
      const kind = detailTab === 'synergies' ? 'synergy' : detailTab === 'styles' ? 'style' : detailTab === 'map' ? 'map' : 'milestone';
      const audit = synergyAuditSummary();
      const effects = result.effects.filter(effect => (effect.kind === kind || kind === 'map' && effect.kind === 'placement') && (!focusOnly || related(effect.type)) && (!query || `${effect.ownerName} ${effect.type} ${statName(effect.type)} ${(effect.requires || []).map(id => byId.get(id)?.name || id).join(' ')}`.toLowerCase().includes(query)));
      const rows = effects.map(effect => `<tr><td>${esc(effect.ownerName || (effect.kind === 'map' ? 'Snow Fort' : 'Tile'))}<span class="subline">${effect.kind === 'map' ? 'Applies once to the team' : `Slot ${Number(effect.ownerIndex ?? 0) + 1}${kind === 'style' ? ' · ' + esc(effect.styleName || 'Grand Master') : effect.kind === 'placement' ? ' · placement' : ''}`}</span></td><td class="muted">${kind === 'synergy' ? 'T' + effect.tier : kind === 'style' || kind === 'map' ? '—' : number(effect.level)}</td>${kind === 'synergy' ? `<td class="muted">${(effect.requires || []).map(id => esc(byId.get(id)?.name || id)).join(' / ')}<span class="subline">${effect.partnersNeeded} of ${(effect.requires || []).length} listed partner copies needed</span></td>` : ''}<td>${esc(statName(effect.type))}${!isScoredStat(effect.type) && effect.type !== 'Skill Power (tile)' && !/Milestone Bonus|Synergy Bonus|Synergy.*Tier|Tier.*Synergy/.test(effect.type) ? '<span class="subline">Not included in focus scores</span>' : ''}</td><td class="numeric">${effectFormat(effect)}</td><td><span class="scope-tag ${effect.global ? 'global' : ''}">${effect.global ? 'Global' : 'Personal'}</span></td></tr>`).join('');
      $('detail-content').innerHTML = `<p class="detail-caption">${kind === 'synergy' ? `Only active links are shown. Amounts include the event boost when enabled. Listed partners come from the source records. The needed count uses each owner’s Synergy Heroes Required level. An owner cannot fill its own partner requirement. ${esc(audit.coverage)} ${esc(audit.corrections)} ${esc(audit.limitations)}` : kind === 'style' && result.experiencePlan ? 'Every copy of the leveling hero shares its level and selected style. Support heroes use their assigned Grand Master, Tycoon or Magnate style. Each copy contributes its style bonuses before milestones and synergies.' : kind === 'style' ? 'Grand Master effects from your screenshot. Damage and Kill Gold multiply per copy. Milestone and synergy stacking use separate controls, both defaulting to compound (1.1ⁿ). All 17 Militia milestones match the nine-Grand-Master screenshot at ×2.8125 × 1.1⁹. Each owner receives its attack-speed penalty once.' : kind === 'map' ? 'Snow Fort bonuses apply once. The selected tile rule adds 0.2 to the milestone Grand Master factor or 0.1 to the separate synergy factor; off-tile screenshots do not verify this interaction. Milestones use the permanent multiplier and the placed owner’s Milestone Bonus level. The event adds ×1.25 to milestone strength and ×1.10 to synergy strength when enabled. This amplifies effects emitted by the placed owner, including that owner’s global effects; they do not reapply to recipients. Skill tiles multiply the configured Gold Aura, Jackpot and Gold Lust bonuses and captured Damage active/mastery bonuses by 1.20. In Experience, Skill Power strengthens the occupant’s active mark, aura or Veteran chances. Wave and stack mastery scale with account Mastery Power. Kill Gold and Damage tiles multiply only their occupant’s corresponding stat. The XP tile increases its occupant’s kill reward before Veteran shares it. All heroes are assumed in range.' : 'All unlocked screenshot-derived milestones are shown, including every deployed copy of a hero. Amounts include the permanent multiplier, Grand Master, active milestone tile and event boost when enabled. Flat units and signed cooldown changes are preserved; named instant skills remain unscored.'}</p><div class="table-scroll"><table><thead><tr><th>Owner</th><th>${kind === 'synergy' ? 'Tier' : 'Level'}</th>${kind === 'synergy' ? '<th>Source partners</th>' : ''}<th>Bonus</th><th class="numeric">Amount</th><th>Scope</th></tr></thead><tbody>${rows || `<tr><td colspan="${kind === 'synergy' ? 6 : 5}" class="table-empty">No matching ${detailTab}.</td></tr>`}</tbody></table></div>`;
    }
  }
  function update(renderAll = true) {
    const active = comparison();
    const focus = isImmortal() ? state.immortal.config.mode : state.focus;
    const teams = visibleTeamKeys();
    if (!active.teams.a.length) active.teamAReady = false;
    else if (!active.teamAReady && lineupSignature(active, 'a') !== sampleLineups[focus].a) active.teamAReady = true;
    if (state.focus === 'gold') for (const key of teams) {
      const panel = comparison();
      const signature = JSON.stringify([panel.attackers[key], panel.teams[key].map(s => [s.id,s.level,s.tile])]);
      if (goldRateTeamSignatures[key] && goldRateTeamSignatures[key] !== signature) {
        for (const [,field] of rateFields) if (panel[field]) panel[field][key] = null;
      }
      goldRateTeamSignatures[key] = signature;
    }
    for (const key of teams) {
      const team = comparison().teams[key], attacker = comparison().attackers[key];
      if (isImmortal()) continue;
      if (!Number.isInteger(attacker) || attacker < 0 || attacker >= team.length) comparison().attackers[key] = bestAttacker(team, settingsForLineup(state.settings, comparison(), key), state.focus);
      const target = comparison().levelingTargets[key];
      if (!Number.isInteger(target) || target < 0 || target >= team.length) comparison().levelingTargets[key] = null;
      if (state.focus === 'experience' && comparison().levelingTargets[key] === null && team.length) {
        comparison().levelingTargets[key] = comparison().attackers[key];
        const slot = team[comparison().levelingTargets[key]];
        comparison().experienceOptions[key] = {...xpOptions(slot.level), optimizeSupportStyles:comparison().experienceOptions[key]?.optimizeSupportStyles ?? true};
        slot.level = 1;
      }
      if (state.focus === 'experience') syncLevelingCopies(comparison(), key);
    }
    results = {};
    for (const key of teams) {
      const settings = teamSettings(key);
      const result = ENGINE.evaluate(active.teams[key], settings);
      if (isImmortal()) {
        result.immortal = immortalEngine.evaluate(active.teams[key], settings, state.immortal.config);
        result.metrics.immortal = result.immortal[immortalObjectives[state.immortal.config.priority].key];
      }
      if (state.focus === 'experience') active.attackers[key] = result.experiencePlan?.attackerIndex ?? null;
      results[key] = result;
    }
    if (renderAll) { renderControls(); renderTeams(); }
    renderMetrics(); renderDetails(); renderRoadmap(); renderFocusReports(); renderSupportRankings(); save();
  }
  function suggestionHelp() {
    if (isImmortal()) return `Find a lineup where every attacker who can roll a crit reaches 100% Ultra before temporary buffs. At equal lowest Ultra chance, maximize ${immortalObjectives[state.immortal.config.priority].label}.`;
    const tag = tagFor(state.focus);
    if (tag) {
      const name = byId.get(tag.heroId).name;
      return `Find supports and tiles for ${name}’s highest Skill Power. Suggestions include ${name} even when excluded from the optional roster. Locked heroes keep their slots and levels.`;
    }
    if (state.focus === 'damageBuffSwap') return `Search ${comparison().chooseAttacker ? 'the attacker and supports together' : 'supports for the selected attacker'} for the team deployed after buffing. Score only the attacker’s damage, personal skill, milestones and synergies plus team globals and deployed Witch / Apprentice debuffs. Other support skills are excluded. Compare Damage, milestone, synergy and skill tiles; locks preserve heroes and levels.`;
    if (state.focus === 'damage') return `Search ${comparison().chooseAttacker ? 'the attacker and supports together' : 'supports for the selected attacker'}, using personal milestones, synergies and enabled active/mastery skill bonuses. Compare Damage, milestone, synergy and skill-power tiles. Locks preserve heroes and levels; tiles may move.`;
    if (state.focus === 'gold') return `Search ${comparison().chooseAttacker ? 'the attacker and supports together' : 'supports for the selected attacker'}, comparing ${state.settings.goldMimicFarming ? 'expected Gold per Mimic at equal kill rates' : 'the legacy boss Gold index'} with Kill Gold, milestone, synergy and enabled Gold skills. Hunter, Rogue and Sovereign are required. Locks preserve heroes and levels; tiles may move.`;
    if (state.focus === 'experience') return 'Search for the highest XP per boss using the chosen team’s leveling hero, attacker and combat style settings. Locked heroes keep their slots and levels.';
    if (state.focus === 'powerMageEnergy') return 'Search global energy and Power Mage Energy bonuses for energy per Power Mage kill, with at least one Captain for his mastery skill. Locks preserve heroes and levels; tiles may move.';
    return 'Search heroes and placements for the selected team. Locked heroes keep their slots and levels.';
  }
  function edited(keepRoadmap = false) { if (!keepRoadmap) clearRoadmap(); $('immortal-search-status').textContent = ''; $('suggestion-note').textContent = ''; alert(''); update(); }
  $('xp-plan-build').addEventListener('click', () => {
    if (state.focus !== 'experience' || !comparison().teams[comparison().showTeamB ? 'b' : 'a'].length) return;
    startRoadmap();
  });
  $('xp-plan-results').addEventListener('change', event => {
    const index = event.target.dataset.xpPreview;
    const group = index === undefined ? null : roadmap?.groups[Number(index)];
    if (!group || roadmap.compareIndex !== Number(index)) return;
    roadmap.previewLevel = Math.round(clamp(event.target.value, group.from, group.to, group.from));
    renderRoadmap();
    $('xp-plan-results').querySelector?.(`[data-xp-preview="${Number(index)}"]`)?.focus({preventScroll:true});
  });
  $('xp-plan-results').addEventListener('click', event => {
    const compare = event.target.closest('[data-xp-compare]');
    if (compare && roadmap) {
      const index = Number(compare.dataset.xpCompare);
      if (!roadmap.groups[index]) return;
      roadmap.compareIndex = roadmap.compareIndex === index ? null : index;
      roadmap.previewLevel = null;
      renderRoadmap();
      $('xp-plan-results').querySelector?.(`[data-xp-compare="${index}"]`)?.focus({preventScroll:true});
      return;
    }
    const button = event.target.closest('[data-xp-apply]');
    if (!button || !roadmap || busy) return;
    const group = roadmap.groups[Number(button.dataset.xpApply)];
    if (!group) return;
    const panel = comparison(), key = panel.showTeamB ? 'b' : 'a';
    const leveler = panel.levelingTargets[key], level = panel.teams[key][leveler].level;
    const applyLevel = level >= group.from && level <= group.to ? level : group.from;
    const row = stageAtLevel(group, applyLevel);
    panel.teams[key] = row.team.map(slot => ({...slot}));
    $('mobile-editor-' + key).checked = true;
    panel.teams[key][leveler].level = applyLevel;
    panel.experienceOptions[key].style = row.style;
    panel.experienceOptions[key].attacker = row.attackerIndex === leveler ? 'self' : row.attackerIndex;
    if (key === 'a') panel.teamAReady = true;
    roadmap.previewLevel = null;
    edited(true);
    $('suggestion-note').textContent = `Applied the level ${number(group.from)}–${number(group.to)} lineup to Team ${key.toUpperCase()}.`;
  });
  $('xp-veteran-stacks').addEventListener('change', event => {
    state.settings.experienceVeteranStacks = Math.round(clamp(event.target.value, 0, 100, 100));
    edited();
  });
  $('xp-skills').addEventListener('change', event => { state.settings.experienceSkills = event.target.checked; edited(); });
  $('xp-skill-fields').addEventListener('change', event => {
    const key = event.target.dataset.xpSkillField;
    if (!state.settings.experienceSkills || !experienceSkillFields.some(field => field[0] === key)) return;
    state.settings[key] = ENGINE.settingsFor({...state.settings,[key]:event.target.value})[key];
    edited();
  });
  $('xp-rank-base').addEventListener('change', event => {
    if (state.settings.experienceReference) return;
    const value = parseRankXp(event.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 1e100) {
      alert('Enter base Rank XP between 1 and 1e100. K, M, B and T suffixes are supported.');
      event.target.value = formatRankXp(state.settings.experienceBaseRankXp);
      return;
    }
    state.settings.experienceBaseRankXp = value;
    edited();
  });
  $('xp-reference-mode').addEventListener('change', event => {
    if (event.target.value === 'manual') {
      lastExperienceReference = state.settings.experienceReference || lastExperienceReference;
      state.settings.experienceReference = null;
    } else if (event.target.value === 'reference') {
      state.settings.experienceReference = lastExperienceReference || ENGINE.defaultExperienceReference();
    } else return;
    edited();
  });
  $('xp-reference-all-gm').addEventListener('change', event => { experienceCaptureGrandMaster = event.target.checked; });
  function readExperienceObserved() {
    const rankBonus = parseRankXp($('xp-reference-rank').value.replace(/[,+]/g, ''));
    const superChance = Number($('xp-reference-super').value), ultraChance = Number($('xp-reference-ultra').value);
    if (!Number.isFinite(rankBonus) || rankBonus < 0 || rankBonus > 1e100) throw new Error('Enter a displayed Rank EXP bonus from 0 to 1e100. K, M, B and T suffixes are supported.');
    if (![superChance, ultraChance].every(value => Number.isFinite(value) && value >= 0 && value <= 1e9)) throw new Error('Enter Super and Ultra EXP chance totals from 0% to 1,000,000,000%.');
    return {rankBonus, superChance, ultraChance};
  }
  for (const id of ['xp-reference-rank', 'xp-reference-super', 'xp-reference-ultra']) $(id).addEventListener('change', () => {
    if (!state.settings.experienceReference) return;
    try {
      state.settings.experienceReference = {...state.settings.experienceReference, ...readExperienceObserved()};
      lastExperienceReference = state.settings.experienceReference;
      edited();
    } catch (error) { alert(error.message); renderExperienceReference(); }
  });
  for (const key of ['a', 'b']) $('xp-reference-' + key).addEventListener('click', () => {
    if (state.focus !== 'experience' || busy) return;
    try {
      const panel = comparison(), observed = readExperienceObserved();
      state.settings.experienceReference = ENGINE.captureExperienceReference(panel.teams[key], {...teamSettings(key), experienceCaptureGrandMaster}, observed, `Team ${key.toUpperCase()} · ${panel.names[key]}`);
      lastExperienceReference = state.settings.experienceReference;
      experienceCaptureGrandMaster = state.settings.experienceReference.styleId === 'grandMaster';
      edited();
    } catch (error) { alert(`Could not capture the Experience reference: ${error.message}`); }
  });
  $('chance-reference-mode').addEventListener('change', event => {
    const focus = state.focus, mode = event.target.value;
    if (!chanceFocuses.includes(focus) || !['legacy', 'preTeam', 'recorded'].includes(mode) || busy) return;
    const draft = chanceDraft(focus);
    if (state.settings.chanceReferences[focus]) draft.reference = state.settings.chanceReferences[focus];
    draft.mode = mode;
    if (mode === 'legacy') state.settings.chanceReferences = {...state.settings.chanceReferences, [focus]:null};
    edited();
  });
  for (const id of ['chance-reference-crit', 'chance-reference-super', 'chance-reference-ultra', 'chance-reference-extra']) $(id).addEventListener('change', event => {
    const focus = state.focus;
    if (!chanceFocuses.includes(focus)) return;
    const draft = chanceDraft(focus), index = chanceInputIds(focus).indexOf(id);
    if (id === 'chance-reference-extra') draft.extraOverflow = event.target.value;
    else if (index >= 0) draft.values[index] = event.target.value;
    renderChanceReference();
  });
  function readChanceObserved(focus) {
    const draft = chanceDraft(focus), raw = [...draft.values, draft.extraOverflow];
    if (raw.some(value => String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9)) throw new Error('Enter every chance total and additional spillover between 0 and 1,000,000,000. Zero is valid.');
    return {totals:draft.values.map(Number), extraOverflow:Number(draft.extraOverflow)};
  }
  function applyChanceReference(focus, reference) {
    const normalized = ENGINE.normalizeChanceReference(reference, focus);
    if (!normalized) throw new Error('The chance reference is invalid.');
    state.settings.chanceReferences = {...state.settings.chanceReferences, [focus]:normalized};
    delete chanceReferenceDrafts[focus];
    edited();
  }
  $('chance-reference-apply').addEventListener('click', () => {
    const focus = state.focus;
    if (!chanceFocuses.includes(focus) || busy) return;
    const draft = chanceDraft(focus);
    try {
      const observed = readChanceObserved(focus);
      if (draft.mode === 'preTeam') applyChanceReference(focus, {mode:'preTeam',...observed,contributions:observed.totals.map(() => 0),label:'Before any heroes · entered account chances'});
      else if (draft.mode === 'recorded' && draft.reference?.mode === 'recorded') applyChanceReference(focus, {...draft.reference,...observed});
    } catch (error) { alert(error.message); }
  });
  for (const key of ['a', 'b']) $('chance-reference-' + key).addEventListener('click', () => {
    const focus = state.focus;
    if (!chanceFocuses.includes(focus) || busy || chanceDraft(focus).mode !== 'recorded') return;
    try {
      const panel = comparison(), observed = readChanceObserved(focus);
      const reference = ENGINE.captureChanceReference(panel.teams[key], teamSettings(key), focus, observed, `${focusNames[focus]} · Team ${key.toUpperCase()} · ${panel.names[key]}`);
      applyChanceReference(focus, reference);
    } catch (error) { alert(`Could not capture the chance reference: ${error.message}`); }
  });
  $('immortal-all').addEventListener('click', () => {
    if (!isImmortal() || busy) return;
    const key = comparison().showTeamB ? 'b' : 'a';
    busy = true; $('immortal-all').disabled = true; alert('');
    $('immortal-search-status').textContent = 'Searching all four lineups…';
    window.setTimeout(() => {
      const pending = {};
      const totals = [];
      let searching;
      try {
        for (const mode of Object.keys(immortalModes)) {
          searching = mode;
          const panel = state.immortal.teams[mode];
          const source = key === 'b' && !panel.showTeamB ? 'a' : key;
          const config = immortalConfig(state.immortal,mode);
          const result = ENGINE.optimizeImmortalTeam(panel.teams[source], {...settingsForLineup(state.settings, panel, source),requiredHeroes:[]}, config, state.allowed);
          pending[mode] = result.team;
          totals.push(`${immortalModes[mode]} · ${immortalTotal(result,config.priority)} · ${immortalUltraSummary(result)}`);
        }
        for (const [mode, team] of Object.entries(pending)) {
          const panel = state.immortal.teams[mode];
          if (key === 'b' && !panel.showTeamB) {
            copyASettingsToB(panel);
            panel.showTeamB = true;
          }
          panel.teams[key] = team;
          if (key === 'a') panel.teamAReady = true;
        }
        $('mobile-editor-' + key).checked = true;
        update();
        $('immortal-search-status').textContent = `Updated all four Team ${key.toUpperCase()} lineups. ` + totals.join(' / ');
        $('suggestion-note').textContent = '';
      } catch (error) {
        $('immortal-search-status').textContent = '';
        alert(`Could not suggest all four teams. ${immortalModes[searching]} Immortal: ${error.message}`);
      } finally { busy = false; $('immortal-all').disabled = false; }
    }, 35);
  });
  $('immortal-modes').addEventListener('click', event => {
    const mode = event.target.closest('[data-immortal-mode]')?.dataset.immortalMode;
    if (!isImmortal() || busy || !Object.hasOwn(immortalModes,mode)) return;
    state.immortal.config = immortalConfig(state.immortal,mode);
    detailScope = 'global'; edited();
  });
  $('immortal-buff-preset').addEventListener('change', event => {
    if (!isImmortal() || busy || !['deploy','swap','warlock'].includes(event.target.value)) return;
    const setup = state.immortal, mode = setup.config.mode;
    setup.buffTeams[mode] = event.target.value;
    setup.config = immortalConfig(setup,mode);
    edited();
  });
  $('immortal-priority').addEventListener('change', event => {
    if (!isImmortal() || busy) return;
    const setup = state.immortal, mode = setup.config.mode, priority = event.target.value;
    if (mode === 'melee' && ['strikes','damage'].includes(priority)) setup.meleePriority = priority;
    else if (usesAttackPriority(mode) && ['attacks','hits','damage'].includes(priority)) setup.priorities[mode] = priority;
    else return;
    setup.config = immortalConfig(setup,mode);
    edited();
  });
  $('immortal-use-damage-chances').addEventListener('click', () => {
    if (!isImmortal() || busy) return;
    const chances = damagePreTeamChances();
    if (!chances) return;
    const [baseCritChance,baseSuperChance,baseUltraChance] = chances;
    state.immortal.config = immortalEngine.normalize({...state.immortal.config,baseCritChance,baseSuperChance,baseUltraChance});
    edited();
  });
  $('immortal-account-speed').addEventListener('change', event => {
    if (!isImmortal() || busy) return;
    const config = state.immortal.config, raw = event.target.value, value = Number(raw);
    if (!String(raw).trim() || !Number.isFinite(value) || value < 0 || value > 1e9) {
      alert('Enter an account Attack Speed bonus between 0 and 1 billion percent.');
      event.target.value = config.accountAttackSpeedBonus;
      return;
    }
    state.immortal.config = immortalEngine.normalize({...config,accountAttackSpeedBonus:value});
    edited();
  });
  $('immortal-speed-hero').addEventListener('change', event => {
    if (!isImmortal() || busy || !byId.has(event.target.value)) return;
    immortalAttributeHero = event.target.value;
    renderImmortalAttributes(state.immortal.config);
  });
  for (const [id,stat] of immortalAttributeFields) $(id).addEventListener('change', event => {
    if (!isImmortal() || busy) return;
    const config = state.immortal.config, raw = event.target.value, rank = Number(raw);
    if (!String(raw).trim() || !Number.isInteger(rank) || rank < 0 || rank > 10) {
      alert('Enter a whole attribute rank from 0 to 10.');
      renderImmortalAttributes(config);
      return;
    }
    const ranks = stat === 'speed' ? {heroSpeedRanks:{...config.heroSpeedRanks,[immortalAttributeHero]:rank}}
      : {heroCritRanks:{...config.heroCritRanks,[immortalAttributeHero]:{...config.heroCritRanks?.[immortalAttributeHero],[stat]:rank}}};
    state.immortal.config = immortalEngine.normalize({...config,...ranks});
    edited();
  });
  $('immortal-fields').addEventListener('change', event => {
    if (!isImmortal() || busy) return;
    const key = event.target.dataset.immortalField;
    const field = immortalFields.find(([name]) => name === key);
    if (!field) return;
    const value = Number(event.target.value);
    if (!String(event.target.value).trim() || !Number.isFinite(value) || value < field[2] || value > field[3]) {
      alert(`Enter ${field[1]} between ${number(field[2])} and ${number(field[3])}.`);
      event.target.value = state.immortal.config[key];
      return;
    }
    state.immortal.config = immortalEngine.normalize({...state.immortal.config,[key]:value});
    edited();
  });
  function chooseFocus(focus) {
    if (busy || !Object.hasOwn(focusNames, focus)) { $('phone-focus').value = state.focus; return; }
    state.focus = focus;
    detailScope = 'global';
    edited();
  }
  $('focus-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-focus]');
    if (button) chooseFocus(button.dataset.focus);
  });
  $('phone-focus').addEventListener('change', event => chooseFocus(event.target.value));
  $('teams').addEventListener('focusin', event => { if (event.target.dataset.heroSearch) event.target.select(); });
  $('teams').addEventListener('focusout', event => {
    if (openHeroPicker?.input === event.target) closeHeroPicker();
  });
  $('teams').addEventListener('input', event => {
    if (event.target.dataset.heroSearch) showHeroMatches(event.target, event.target.value);
  });
  $('teams').addEventListener('keydown', event => {
    const input = event.target;
    if (!input.dataset.heroSearch || event.isComposing || busy) return;
    if (event.key === 'Escape' && openHeroPicker) {
      event.preventDefault(); closeHeroPicker(); input.select(); return;
    }
    if (!['ArrowDown','ArrowUp','Enter'].includes(event.key)) return;
    event.preventDefault();
    if (openHeroPicker?.input !== input) { showHeroMatches(input, ''); return; }
    if (event.key === 'Enter') { chooseHero(openHeroPicker.active); return; }
    const {enabled, active} = openHeroPicker;
    if (!enabled.length) return;
    const next = enabled.indexOf(active) + (event.key === 'ArrowDown' ? 1 : -1);
    highlightHero(enabled[Math.max(0, Math.min(next, enabled.length - 1))]);
  });
  $('hero-picker-popup').addEventListener('mousedown', event => {
    if (event.target.closest('[data-hero-id]')) event.preventDefault();
  });
  $('hero-picker-popup').addEventListener('click', event => {
    const option = event.target.closest('[data-hero-id]');
    if (option) chooseHero(option.dataset.heroId, event.pointerType !== 'touch');
  });
  window.addEventListener('scroll', positionHeroPicker, true);
  window.addEventListener('resize', positionHeroPicker);
  window.visualViewport?.addEventListener('resize', positionHeroPicker);
  window.visualViewport?.addEventListener('scroll', positionHeroPicker);
  $('teams').addEventListener('change', event => {
    if (busy) return;
    if (event.target.dataset.levelingTarget) {
      const key = event.target.dataset.levelingTarget;
      if (['a', 'b'].includes(key) && selectLevelingTarget(key, event.target.value)) edited(); else renderTeams();
      return;
    }
    if (event.target.dataset.xpOptimizeSupportStyles) {
      const key = event.target.dataset.xpOptimizeSupportStyles;
      if (state.focus === 'experience' && ['a','b'].includes(key)) { comparison().experienceOptions[key].optimizeSupportStyles = event.target.checked; edited(); }
      return;
    }
    if (event.target.dataset.xpSupportStyle) {
      if (state.focus !== 'experience') return;
      const [key, rawIndex] = event.target.dataset.xpSupportStyle.split(':'), index = Number(rawIndex);
      const panel = comparison(), team = panel.teams[key], slot = team?.[index], target = team?.[panel.levelingTargets[key]], value = event.target.value;
      if (!slot || slot.id === target?.id) return;
      const copies = team.filter(other => other.id === slot.id);
      if (value && (!Object.hasOwn(supportStyleLevels,value) || Math.min(...copies.map(other => other.level)) < supportStyleLevels[value])) { alert('That support combat style is not unlocked on every copy of this hero.'); renderTeams(); return; }
      for (const copy of copies) { if (value) copy.combatStyle = value; else delete copy.combatStyle; }
      edited(); return;
    }
    if (event.target.dataset.xpStyle || event.target.dataset.xpAttacker) {
      const key = event.target.dataset.xpStyle || event.target.dataset.xpAttacker;
      const panel = comparison(), target = panel.teams[key][panel.levelingTargets[key]], value = event.target.value;
      if (event.target.dataset.xpStyle && (value === 'auto' || ENGINE.experienceStyles.some(style => style.id === value && style.level <= target.level))) panel.experienceOptions[key].style = value;
      if (event.target.dataset.xpAttacker && (['best', 'self'].includes(value) || panel.teams[key][Number(value)])) panel.experienceOptions[key].attacker = ['best', 'self'].includes(value) ? value : Number(value);
      edited(true);
      return;
    }
    if (event.target.dataset.levelingLevel) {
      const key = event.target.dataset.levelingLevel, slot = comparison().teams[key]?.[comparison().levelingTargets[key]];
      if (slot) { setLevelerLevel(key, event.target.value); edited(true); }
      return;
    }
    if (event.target.dataset.attacker) {
      const key = event.target.dataset.attacker, index = Number(event.target.value);
      if (['a', 'b'].includes(key) && Number.isInteger(index) && comparison().teams[key][index]) { comparison().attackers[key] = index; edited(); }
      return;
    }
    if (event.target.dataset.name) {
      const key = event.target.dataset.name;
      comparison().names[key] = event.target.value.slice(0, 40);
      $('mobile-team-name-' + key).textContent = comparison().names[key];
      if (key === 'a' && !comparison().teamAReady) { update(); return; }
      save(); return;
    }
    const target = event.target.dataset.level || event.target.dataset.tile;
    if (!target) return;
    const [key, index] = target.split(':'), slot = comparison().teams[key][Number(index)];
    if (event.target.dataset.tile) {
      const tile = event.target.value;
      if (tile === 'experience' && state.focus !== 'experience') { alert('The XP +20% tile is available in the Experience focus.'); renderTeams(); return; }
      if (!Object.hasOwn(tileNames, tile) || tile !== 'normal' && comparison().teams[key].filter((other, i) => i !== Number(index) && other.tile === tile).length >= tileLimit(tile)) { alert('A team can use one Kill Gold tile, one Damage tile, one XP tile and at most three of each other special tile. Move a hero to Normal first to free a tile.'); renderTeams(); return; }
      slot.tile = tile;
    } else if (state.focus === 'experience' && slot.id === comparison().teams[key][comparison().levelingTargets[key]]?.id) setLevelerLevel(key, event.target.value);
    else slot.level = Math.round(clamp(event.target.value, 0, 1000000, 15000));
    edited();
  });
  $('teams').addEventListener('click', event => {
    if (busy) return;
    const input = event.target;
    if (input.dataset.heroSearch) {
      if (openHeroPicker?.input !== input) showHeroMatches(input, '');
      return;
    }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.suggestTeam) {
      suggestTeam(button);
      return;
    }
    if (button.dataset.openEditor) {
      const editor = $('mobile-editor-' + button.dataset.openEditor);
      editor.checked = true;
      editor.focus({preventScroll:true});
      $('mobile-team-switch').scrollIntoView({block:'start'});
      return;
    }
    if (button.dataset.suggestTiles) {
      const key = button.dataset.suggestTiles;
      if (!comparison().teams[key].length) { alert('Add at least one hero before suggesting tiles.'); return; }
      const tag = tagFor(state.focus);
      if (tag && !results[key].tagCasters[state.focus]) {
        alert(`Add ${byId.get(tag.heroId).name} to team ${key.toUpperCase()} before suggesting tag tiles.`); return;
      }
      busy = true; button.disabled = true; button.textContent = 'Finding tiles…'; alert('');
      window.setTimeout(() => {
        try {
          const suggestion = isImmortal()
            ? ENGINE.optimizeImmortalPlacements(comparison().teams[key], teamSettings(key), state.immortal.config)
            : ENGINE.optimizePlacements(comparison().teams[key], teamSettings(key), objectiveFor(state.focus));
          clearRoadmap();
          comparison().teams[key] = suggestion.team;
          if (key === 'a') comparison().teamAReady = true;
          update();
          const outcome = tag ? `${byId.get(tag.heroId).name} has ${number(results[key].metrics[state.focus])} Skill Power.`
            : isImmortal() ? `${immortalTotal(results[key].immortal,state.immortal.config.priority)} · ${immortalUltraSummary(results[key].immortal)}.`
            : state.focus === 'gold' ? 'Kill Gold, milestone, synergy and any enabled Gold skills were compared.' : isDamageFocus() ? 'Damage, milestone, synergy and skill tiles were compared using enabled attacker skills and this focus’s support rules.' : state.focus === 'experience' ? 'The search compared the attacker’s XP +20% tile, skill tiles on Archer, Ballista and Veteran, and milestone and synergy placements.' : 'Remaining skill tiles favor XP abilities, then Skill Power and Damage; one copy per hero. Skill DPS is not modeled.';
          $('suggestion-note').textContent = `Team ${key.toUpperCase()} tiles updated · ${number(suggestion.evaluated || 0)} placements evaluated. ${outcome}`;
        }
        catch (error) { alert(`Could not suggest tiles: ${error.message}`); renderTeams(); }
        finally { busy = false; }
      }, 35);
      return;
    }
    if (button.dataset.add) { const team = comparison().teams[button.dataset.add]; const hero = DATA.heroes.find(candidate => team.filter(slot => slot.id === candidate.id).length < 3); if (team.length < 10 && hero) team.push({ id: hero.id, level: Math.round(clamp($('all-level').value, 0, 1000000, 15000)), locked: false, tile: 'normal' }); }
    else if (button.dataset.lock || button.dataset.remove) {
      const [key, index] = (button.dataset.lock || button.dataset.remove).split(':'), removed = Number(index);
      if (button.dataset.lock) comparison().teams[key][removed].locked = !comparison().teams[key][removed].locked;
      else {
        const removedHero = comparison().teams[key][removed].id;
        comparison().teams[key].splice(removed, 1);
        const attacker = comparison().attackers[key];
        if (attacker === removed) comparison().attackers[key] = bestAttacker(comparison().teams[key], settingsForLineup(state.settings, comparison(), key), state.focus);
        else if (attacker > removed) comparison().attackers[key]--;
        const target = comparison().levelingTargets[key];
        if (target === removed) {
          const duplicate = state.focus === 'experience' ? comparison().teams[key].findIndex(slot => slot.id === removedHero) : -1;
          comparison().levelingTargets[key] = duplicate >= 0 ? duplicate : null;
        }
        else if (target > removed) comparison().levelingTargets[key]--;
        if (state.focus === 'experience') {
          const options = comparison().experienceOptions[key];
          if (options.attacker === removed) options.attacker = 'best';
          else if (Number.isInteger(options.attacker) && options.attacker > removed) options.attacker--;
        }
      }
    }
    else return;
    edited();
  });
  $('experience-placement-comparison').addEventListener('click', event => {
    if (busy || state.focus !== 'experience') return;
    const key = event.target.closest('[data-xp-tile-swap]')?.dataset.xpTileSwap;
    if (!['a', 'b'].includes(key)) return;
    const report = ENGINE.compareExperienceAttackerTiles(comparison().teams[key], teamSettings(key));
    const option = report?.options[report.preferred];
    if (option) { comparison().teams[key] = option.team; edited(); }
  });
  $('damage-placement-comparison').addEventListener('click', event => {
    if (busy) return;
    const button = event.target.closest('[data-damage-swap]');
    const key = button?.dataset.damageSwap;
    if (!['a', 'b'].includes(key) || !isDamageFocus()) return;
    const report = ENGINE.compareDamageAttackerTiles(comparison().teams[key], teamSettings(key));
    const option = report?.options[report.preferred];
    if (option) { comparison().teams[key] = option.team; edited(); }
  });
  $('damage-skills').addEventListener('change', event => { state.settings.damageSkills = event.target.checked; edited(); });
  $('damage-support-skills').addEventListener('change', event => { state.settings.damageSupportSkills = event.target.checked; edited(); });
  for (const [id, key] of [['damage-support-seconds', 'damageSupportSeconds'], ['damage-support-stacks', 'damageSupportStacks'], ['damage-support-teleports', 'damageSupportTeleports'], ['damage-necromancer-roll', 'damageNecromancerRoll']]) $(id).addEventListener('change', event => { state.settings[key] = ENGINE.settingsFor({ ...state.settings, [key]: event.target.value })[key]; edited(); });
  $('damage-support-profile-hero').addEventListener('change', event => { if (damageSupportDefinitions.some(def => def.id === event.target.value)) { damageSupportProfileHero = event.target.value; renderDamageSupportControls(); } });
  $('damage-support-profile-fields').addEventListener('change', event => {
    const key = event.target.dataset.damageSupportField;
    if (!damageSupportFields.some(field => field.key === key)) return;
    const next = ENGINE.settingsFor({ ...state.settings, [key]: event.target.value });
    state.settings[key] = next[key];
    edited();
  });
  $('damage-tile').addEventListener('change', event => { state.settings.damageTile = clamp(event.target.value, 0, 1000000000, defaults.damageTile); edited(); });
  $('damage-warden-distance').addEventListener('change', event => { state.settings.damageWardenDistance = clamp(event.target.value, 0, 1000000, 10.7); edited(); });
  $('damage-profile-hero').addEventListener('change', event => { if (damageDefinitions.some(def => def.id === event.target.value)) { damageProfileHero = event.target.value; renderDamageControls(); } });
  $('damage-profile-fields').addEventListener('change', event => {
    const key = event.target.dataset.damageField;
    if (!damageProfileFields.some(field => field.key === key)) return;
    const next = ENGINE.settingsFor({ ...state.settings, [key]: event.target.value });
    state.settings[key] = next[key];
    edited();
  });
  $('gold-placement-comparison').addEventListener('click', event => {
    if (busy || state.focus !== 'gold') return;
    const key = event.target.closest('button')?.dataset.goldSwap;
    if (!['a', 'b'].includes(key)) return;
    const report = ENGINE.compareGoldAttackerTiles(comparison().teams[key], teamSettings(key));
    if (!report || report.preferred === 'tie') return;
    comparison().teams[key] = report[report.preferred].team;
    edited();
  });
  $('tier').addEventListener('change', event => { state.settings.maxTier = Number(event.target.value); edited(); });
  $('choose-attacker').addEventListener('change', event => { if (busy) return; comparison().chooseAttacker = event.target.checked; edited(); });
  $('apply-level').addEventListener('click', () => { const level = Math.round(clamp($('all-level').value, 0, 1000000, 15000)); $('all-level').value = level; for (const key of visibleTeamKeys()) comparison().teams[key].forEach((slot, i) => {
    if (state.focus === 'experience' && slot.id === comparison().teams[key][comparison().levelingTargets[key]]?.id) comparison().experienceOptions[key].supportLevel = level;
    else slot.level = level;
  }); edited(); });
  for (const [id, key, min, max] of [['milestone-scale', 'milestoneScale', 0, 100], ['synergy-scale', 'synergyScale', 0, 100], ['overflow-rate', 'overflowRate', 0, 100], ['base-overflow', 'baseOverflow', 0, 1000000], ['base-energy', 'baseEnergy', .001, 1000000]]) $(id).addEventListener('change', event => { state.settings[key] = clamp(event.target.value, min, max, defaults[key]); edited(); });
  $('account-synergy-boosts').addEventListener('change', event => { state.settings.accountSynergyBoosts = event.target.checked; edited(); });
  $('ascension-scope').addEventListener('change', event => {
    if (!['account','a','b'].includes(event.target.value)) return;
    ascensionScope = event.target.value;
    renderAscensionControls();
  });
  $('ascension-roster').addEventListener('click', event => {
    const id = event.target.closest('button')?.dataset.ascensionHero;
    if (!byId.has(id)) return;
    ascensionHero = id;
    renderAscensionControls();
    $('ascension-hero').focus();
  });
  $('ascension-hero').addEventListener('change', event => {
    if (!byId.has(event.target.value)) return;
    ascensionHero = event.target.value;
    renderAscensionControls();
  });
  for (const [id, field] of ascensionFields) $(id).addEventListener('change', event => {
    const profile = {...editingAscensions()[ascensionHero]};
    if (event.target.value === '') delete profile[field];
    else profile[field] = Number(event.target.value);
    setAscensionProfile(profile);
  });
  $('ascension-zero-defaults').addEventListener('click', () => {
    for (const key of inheritedAscensionKeys) state.settings[key] = 0;
    edited();
  });
  $('default-milestone-level').addEventListener('change', event => {
    state.settings.defaultMilestoneLevel = Math.round(clamp(event.target.value, 0, 5, 0));
    edited();
  });
  $('ascension-inherit').addEventListener('click', () => setAscensionProfile({}));
  $('ascension-reset-team').addEventListener('click', () => {
    if (ascensionScope === 'account') return;
    setLineupAscensions(comparison(), ascensionScope, {});
    edited();
  });
  $('ascension-hunter-current').addEventListener('click', () => {
    if (ascensionHero === 'hunter') setAscensionProfile({...editingAscensions().hunter, milestoneLevel: 5, synergyLevel: 5, killGoldLevel: 7});
  });
  $('ascension-hunter-gold').addEventListener('click', () => {
    if (ascensionHero === 'hunter') setAscensionProfile({...editingAscensions().hunter, milestoneLevel: 0, synergyLevel: 0, killGoldLevel: 14});
  });
  $('ascension-hunter-screenshot').addEventListener('click', () => {
    if (ascensionHero === 'hunter') setAscensionProfile({milestoneLevel:5, synergyLevel:5, killGoldLevel:7, damageLevel:0,
      maxAttackSpeedLevel:0, minSkillCooldownLevel:3, freeHeroLevelChanceLevel:0, synergyReductionLevel:1,
      globalKillGoldLevel:1, globalDamageLevel:0, globalRankExpLevel:0, globalEnergyIncomeLevel:0});
  });
  $('synergy-event').addEventListener('change', event => { state.settings.synergyEvent = event.target.checked; edited(); });
  $('tag-base-power').addEventListener('change', event => {
    const tag = tagFor(state.focus);
    if (tag) { state.settings[tag.baseSetting] = clamp(event.target.value, 0, 1e9, 0); edited(); }
  });
  $('gold-skills').addEventListener('change', event => { state.settings.goldSkills = event.target.checked; edited(); });
  $('gold-mimic-farming').addEventListener('change', event => { state.settings.goldMimicFarming = event.target.checked; edited(); });
  for (const [id, key, min, max] of mimicFields) $(id).addEventListener('change', event => {
    state.settings[key] = event.target.value === '' ? defaults[key] : clamp(event.target.value, min, max, defaults[key]);
    edited();
  });
  for (const [id, field] of rateFields) for (const key of ['a','b']) $(id + '-' + key).addEventListener('change', event => {
    const panel = state.focusTeams.gold;
    panel[field] ??= {a: null, b: null};
    panel[field][key] = measuredRate(event.target.value);
    renderMimicFarming();
    save();
  });
  for (const [id, key] of goldFields) $(id).addEventListener('change', event => { state.settings[key] = key === 'goldCrusaderAttacks' ? Math.floor(clamp(event.target.value, 0, 1000000, defaults[key])) : clamp(event.target.value, 0, 1000000000, defaults[key]); edited(); });
  for (const [id, key, max] of accountSynergyFields) $(id).addEventListener('change', event => { state.settings[key] = clamp(event.target.value, 0, max, defaults[key]); edited(); });
  $('requirement-reduction').addEventListener('change', event => { state.settings.requirementReduction = event.target.checked ? 1 : 0; edited(); });
  $('grand-master').addEventListener('change', event => { state.settings.grandMaster = event.target.checked; edited(); });
  $('grand-master-stacking').addEventListener('change', event => { state.settings.grandMasterStacking = event.target.value; edited(); });
  $('synergy-grand-master-stacking').addEventListener('change', event => { state.settings.synergyGrandMasterStacking = event.target.value; edited(); });
  $('snow-fort').addEventListener('change', event => { state.settings.snowFort = event.target.checked; edited(); });
  for (const [id, key, min] of [['map-t56', 'mapT56', 0], ['map-t7', 'mapT7', 0], ['map-mastery', 'mapMastery', 0], ['map-attack-speed', 'mapAttackSpeed', -99.9]]) $(id).addEventListener('change', event => { state.settings[key] = clamp(event.target.value, min, 10000, defaults[key]); edited(); });
  $('roster').addEventListener('change', event => { const id = event.target.dataset.roster; if (!id) return; state.allowed = event.target.checked ? [...new Set([...state.allowed, id])] : state.allowed.filter(item => item !== id); clearRoadmap(); renderRoadmap(); renderRoster(); save(); });
  $('roster-search').addEventListener('input', renderRoster);
  $('review-hero').addEventListener('change', renderMilestoneReview);
  $('roster-all').addEventListener('click', () => { state.allowed = DATA.heroes.map(hero => hero.id); clearRoadmap(); renderRoadmap(); renderRoster(); save(); });
  $('roster-none').addEventListener('click', () => { state.allowed = []; clearRoadmap(); renderRoadmap(); renderRoster(); save(); });
  function copyASettingsToB(panel) {
    panel.attackers.b = panel.attackers.a;
    panel.levelingTargets.b = panel.levelingTargets.a;
    setLineupAscensions(panel, 'b', panel.ascensionOverrides?.a);
    if (panel.experienceOptions) panel.experienceOptions.b = {...panel.experienceOptions.a};
    for (const [,field] of rateFields) if (panel[field]) {
      panel[field].b = panel[field].a;
      goldRateTeamSignatures.b = goldRateTeamSignatures.a;
    }
  }
  $('copy-team').addEventListener('click', () => {
    const panel = comparison();
    if (busy || !panel.showTeamB) return;
    panel.teams.b = panel.teams.a.map(slot => ({ ...slot }));
    copyASettingsToB(panel);
    $('mobile-editor-b').checked = true;
    edited();
  });
  $('swap-teams').addEventListener('click', () => { [comparison().teams.a, comparison().teams.b] = [comparison().teams.b, comparison().teams.a]; [comparison().names.a, comparison().names.b] = [comparison().names.b, comparison().names.a]; [comparison().attackers.a, comparison().attackers.b] = [comparison().attackers.b, comparison().attackers.a]; [comparison().levelingTargets.a, comparison().levelingTargets.b] = [comparison().levelingTargets.b, comparison().levelingTargets.a];
    const builds = comparison().ascensionOverrides;
    if (builds) comparison().ascensionOverrides = {...(builds.a && {b:builds.a}), ...(builds.b && {a:builds.b})};
    if (state.focus === 'gold') {
      for (const [,field] of rateFields) if (comparison()[field]) {
        const rates = comparison()[field];
        [rates.a, rates.b] = [rates.b, rates.a];
      }
      goldRateTeamSignatures = {};
    }
    if (state.focus === 'experience') [comparison().experienceOptions.a, comparison().experienceOptions.b] = [comparison().experienceOptions.b, comparison().experienceOptions.a]; edited(); });
  function suggestTeam(button) {
    const key = button.dataset.suggestTeam;
    const panel = comparison();
    const firstChallenger = key === 'b' && !panel.showTeamB;
    if (busy || (firstChallenger && !(panel.teamAReady && panel.teams.a.length))) return;
    const source = firstChallenger ? 'a' : key;
    const label = 'Team ' + key.toUpperCase();
    if (!panel.teams[source].length) { alert(`Add at least one hero to ${label} before searching. The search preserves the number of slots.`); return; }
    const chooseAttacker = hasAttacker() && panel.chooseAttacker;
    const fixedTarget = hasAttacker() && !chooseAttacker ? panel.attackers[source] : state.focus === 'experience' ? panel.levelingTargets[source] : null;
    const fixedKiller = state.focus === 'experience' ? panel.experienceOptions[source].attacker : null;
    if (!isImmortal() && !requiredHeroesByFocus[state.focus]?.length && !state.allowed.length && panel.teams[source].some((slot, index) => !slot.locked && index !== fixedTarget && index !== fixedKiller)) { alert('Select at least one hero in the suggestion roster.'); return; }
    const restoreFocus = document.activeElement === button;
    busy = true;
    $('optimize-a').disabled = $('optimize').disabled = true;
    button.textContent = 'Searching lineups…';
    alert('');
    window.setTimeout(() => {
      try {
        if (panel !== comparison()) return;
        const before = results[source].metrics[objectiveFor(state.focus)];
        const settings = teamSettings(source);
        if (chooseAttacker) settings[state.focus === 'gold' ? 'goldHero' : 'damageHero'] = 'best';
        const suggestion = isImmortal()
          ? ENGINE.optimizeImmortalTeam(panel.teams[source], settings, state.immortal.config, state.allowed)
          : ENGINE.optimizeTeam(panel.teams[source], settings, objectiveFor(state.focus), state.allowed);
        const attacker = chooseAttacker ? bestAttacker(suggestion.team, settings, state.focus) : panel.attackers[source];
        clearRoadmap();
        if (firstChallenger) {
          copyASettingsToB(panel);
          panel.showTeamB = true;
        }
        panel.teams[key] = suggestion.team;
        panel.attackers[key] = attacker;
        if (key === 'a') panel.teamAReady = true;
        $('mobile-editor-' + key).checked = true;
        update();
        const after = results[key].metrics[objectiveFor(state.focus)], delta = before > 0 ? (after / before - 1) * 100 : 0;
        const baseline = firstChallenger ? 'Team A' : 'previous ' + key.toUpperCase();
        const tag = tagFor(state.focus);
        if (tag) {
          const change = after - before;
          $('suggestion-note').textContent = `${label} · ${byId.get(tag.heroId).name} has ${number(after)} Skill Power (${change >= 0 ? '+' : ''}${number(change)} vs ${baseline}). ${number(suggestion.evaluated)} lineups compared.`;
          return;
        }
        if (isImmortal()) {
          const config = state.immortal.config, objective = immortalObjectives[config.priority];
          const gain = before > 0 ? ` (${delta >= 0 ? '+' : ''}${number(delta)}%)` : '';
          const damage = config.priority === 'damage' ? '' : ` · ${number(results[key].immortal.score)} boss damage/s`;
          const coverage = immortalUltraSummary(results[key].immortal);
          $('suggestion-note').textContent = `${immortalModes[config.mode]} Immortal · ${label} reached ${number(after)} ${objective.label}${gain}${damage} · ${coverage}. ${number(suggestion.evaluated)} candidates compared.`;
          return;
        }
        const selected = hasAttacker() ? panel.attackers[key] : state.focus === 'experience' ? panel.levelingTargets[key] : null;
        const hero = panel.teams[key][selected];
        const outcome = chooseAttacker ? `Selected ${byId.get(hero.id).name} in slot ${selected + 1} as attacker.` : hasAttacker() ? 'Kept the selected attacker.' : state.focus === 'experience' && hero ? `Kept ${byId.get(hero.id).name} as the leveling target.` : '';
        const gain = delta > .005 ? '+' + number(delta) + '% ' + focusNames[state.focus].toLowerCase() + ' vs ' + baseline : 'No stronger lineup found in this search';
        $('suggestion-note').textContent = `${label} · ${number(suggestion.evaluated || 0)} lineups evaluated. ${gain}. ${outcome}${state.focus === 'gold' ? ' Hunter, Rogue and Sovereign included.' : state.focus === 'powerMageEnergy' ? ' Captain included.' : ''}`;
      } catch (error) { alert(`The suggestion could not be completed: ${error.message}`); }
      finally {
        busy = false;
        $('optimize-a').disabled = $('optimize').disabled = false;
        const currentButton = $(button.id);
        currentButton.textContent = 'Suggest team ' + key.toUpperCase();
        if (restoreFocus && panel === comparison() && (document.activeElement === document.body || document.activeElement === button)) {
          currentButton.focus({preventScroll: !firstChallenger});
        }
      }
    }, 35);
  }
  document.querySelectorAll('[data-detail-team]').forEach(button => button.addEventListener('click', () => { detailTeam = button.dataset.detailTeam; renderDetails(); }));
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { detailTab = button.dataset.tab; renderDetails(); }));
  $('detail-scope').addEventListener('change', event => { detailScope = event.target.value; renderDetails(); });
  $('detail-search').addEventListener('input', renderDetails);
  $('focus-only').addEventListener('change', renderDetails);
  $('support-rankings').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const hero = button.dataset.supportHero;
    if (!byId.has(hero)) return;
    state.supportRanking.selectedHero = hero;
    renderSupportRankings(); save();
    const details = $('support-hero-details');
    details.focus({preventScroll:true});
    details.scrollIntoView?.({block:'nearest'});
  });
  $('support-team').addEventListener('change', event => {
    state.supportRanking.team = event.target.value === 'b' ? 'b' : 'a';
    renderSupportRankings(); save();
  });
  $('support-lineup-only').addEventListener('change', event => {
    state.supportRanking.lineupOnly = event.target.checked;
    renderSupportRankings(); save();
  });
  $('support-slot').addEventListener('change', event => {
    state.supportRanking.slot = Math.floor(clamp(event.target.value, 0, 9, 0));
    renderSupportRankings(); save();
  });
  $('support-global-ascensions').addEventListener('change', event => {
    if (event.target.checked) delete state.supportRanking.includeGlobalAscensions;
    else state.supportRanking.includeGlobalAscensions = false;
    renderSupportRankings();
    save();
  });
  for (const [id, key, max] of [['support-level', 'level', 1000000], ['support-gm-count', 'grandMasterCount', 10]]) $(id).addEventListener('change', event => {
    state.supportRanking[key] = Math.round(clamp(event.target.value, 0, max, supportDefaults[key])); renderSupportRankings(); save();
  });
  $('support-tile').addEventListener('change', event => { state.supportRanking.tile = ['milestone', 'skill'].includes(event.target.value) ? event.target.value : 'normal'; renderSupportRankings(); save(); });
  for (const [id, key, reference, feedback] of [
    ['support-rank-xp', 'rankXp', 'xpReference', 'support-xp-feedback'],
    ['support-super-xp-chance', 'superChance', 'xpReference', 'support-xp-feedback'],
    ['support-ultra-xp-chance', 'ultraChance', 'xpReference', 'support-xp-feedback'],
    ['support-crit-chance', 'critChance', 'damageReference', 'support-damage-feedback'],
    ['support-super-crit-chance', 'superChance', 'damageReference', 'support-damage-feedback'],
    ['support-ultra-crit-chance', 'ultraChance', 'damageReference', 'support-damage-feedback']
  ]) {
    $(id).addEventListener('change', event => {
      const value = key === 'rankXp' ? parseRankXp(event.target.value) : Number(event.target.value);
      const valid = Number.isFinite(value) && (key === 'rankXp' ? value >= 1 && value <= 1e100 : value >= 100 && value <= 1e9);
      const message = $(feedback);
      message.hidden = valid;
      if (!valid) {
        message.textContent = key === 'rankXp'
          ? 'Enter Rank XP from 1 to 1e100. Use a number, K/M/B/T, or scientific notation.'
          : 'Enter a capped total chance between 100% and 1,000,000,000%.';
        const previous = state.supportRanking[reference][key];
        event.target.value = key === 'rankXp' ? formatRankXp(previous) : previous;
        return;
      }
      state.supportRanking[reference] = { ...state.supportRanking[reference], [key]: value };
      renderSupportRankings();
      save();
    });
  }
  $('support-search').addEventListener('input', renderSupportRankings);
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'hero-team-lab-setup.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('dismiss-migration').addEventListener('click', () => { $('migration-notice').hidden = true; });
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 1000000) throw new Error('This setup is too large. Choose a JSON setup under 1 MB.'); applySetup(JSON.parse(await file.text())); clearRoadmap(); alert(''); detailScope = 'global'; $('suggestion-note').textContent = ''; renderRoster(); update(); }
    catch (error) { alert(`Could not import setup: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  $('source-description').textContent = `${DATA.heroes.length} heroes use synergy records from the community spreadsheet by Mana, Osto and devilkk (${DATA.meta.gameVersion}, updated ${DATA.meta.sourceUpdated}; imported ${DATA.meta.importedAt}). These synergy records have not yet been fully verified against current screenshots.${REVIEW?.status === 'active-calibrated' ? ` Milestones for ${activeMilestoneHeroes} of the ${REVIEW.expectedHeroes} planned heroes are active through level 10,000 from your screenshots; ${REVIEW.capturedHeroes} heroes have been captured in total. Base values are inferred from rounded account displays using the confirmed ×2.8125 multiplier; the original sheet remains available for comparison.${activeMilestoneHeroes < REVIEW.expectedHeroes ? ` The remaining ${REVIEW.expectedHeroes - activeMilestoneHeroes} heroes require complete milestone and synergy records before they can enter the comparison.` : ''}` : REVIEW?.heroes?.length ? ` Screenshot review: ${REVIEW.capturedHeroes} of ${REVIEW.expectedHeroes} heroes captured with zero heroes deployed. Base-value scaling remains unresolved; scores use spreadsheet milestones through level 7,500.` : ''}`;
  $('source-link').href = DATA.meta.sourceURL;
  $('data-badge').textContent = REVIEW?.status === 'active-calibrated' ? `${activeMilestoneHeroes}/${REVIEW.expectedHeroes} heroes · milestones active` : `${DATA.heroes.length} heroes · ${DATA.meta.gameVersion}`;
  renderMilestoneReview(); renderRoster(); update();

  // Resolve section links before their destination is scrolled into view on a phone.
  const phoneLayout = window.matchMedia?.('(max-width: 710px), (max-width: 1000px) and (max-height: 540px) and (pointer: coarse)');
  if (phoneLayout) {
    const workspace = $('lab-workspace');
    const links = Array.from(document.querySelectorAll('[data-workspace-link]'));
    function showLinkedSection(hash, scroll = false) {
      const target = hash ? document.getElementById(hash.slice(1)) : null;
      const report = target?.closest('#focus-analysis > [data-report-tab]');
      const openReport = report && !report.hidden && report.hasAttribute('data-inactive');
      if (openReport) selectFocusReport(report);
      const section = target?.closest('.workspace-columns > [id]')?.id ?? 'comparison';
      const changed = workspace.dataset.phoneSection !== section;
      workspace.dataset.phoneSection = section;
      for (const link of links) {
        if (phoneLayout.matches && link.hash === '#' + section) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
      if (scroll && (openReport || (changed && phoneLayout.matches))) target?.scrollIntoView({block:'start'});
    }
    const syncLocation = () => showLinkedSection(window.location.hash, true);
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('click', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href^="#"]');
      if (link) showLinkedSection(link.hash);
    });
    phoneLayout.addEventListener('change', () => showLinkedSection(window.location.hash));
    syncLocation();
  }
})();

