'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const storageKey = 'hero-team-lab-v1';
const focuses = ['energy', 'gold', 'experience', 'damage', 'powerMageEnergy', 'damageBuffSwap'];
const immortalModes = ['skill','melee','mage','ranged'];
const experienceRequired = ['archer','ballista','veteran'];
const requiredByFocus = {experience:experienceRequired,gold:['hunter','rogue','sovereign'],powerMageEnergy:['captain']};
const clone = value => JSON.parse(JSON.stringify(value));
const slot = (id, level = 15000, locked = false, tile = 'normal') => ({id, level, locked, tile});

// Exercise the production event handlers and serialization without a browser dependency.
// This deliberately models only the DOM surface the calculator uses; layout is not tested.
class Element {
  constructor(tag = 'div', dataset = {}) {
    this.tagName = tag.toUpperCase(); this.dataset = dataset; this.listeners = new Map();
    this.value = ''; this.checked = false; this.disabled = false; this.hidden = false;
    this.innerHTML = ''; this.textContent = ''; this.children = []; this.attributes = {};
    this.classList = {toggle() {}, add() {}, remove() {}};
  }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  closest(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON' ? this : null;
    const match = selector.match(/^\[data-([\w-]+)\]$/);
    const key = match?.[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return key && Object.hasOwn(this.dataset, key) ? this : null;
  }
  focus() {}
  click() { return this.dispatch('click'); }
  async dispatch(type, target = this) {
    for (const listener of this.listeners.get(type) || []) await listener({target});
  }
}

function load(candidate) {
  const template = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
  const elements = new Map([...template.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.get('all-level').value = '15000';
  const detailButtons = ['a', 'b'].map(detailTeam => new Element('button', {detailTeam}));
  const tabButtons = ['bonuses', 'synergies', 'milestones', 'styles', 'map'].map(tab => new Element('button', {tab}));
  const stored = new Map(candidate === undefined ? [] : [[storageKey, JSON.stringify(candidate)]]);
  const timers = [], downloads = [], evaluationCalls = [], optimizationCalls = [], immortalOptimizationCalls = [];
  let exportBlob, nextSuggestion;
  const document = {
    getElementById(id) { assert.ok(elements.has(id), `Unknown template element #${id}`); return elements.get(id); },
    querySelectorAll(selector) {
      if (selector === '[data-detail-team]') return detailButtons;
      if (selector === '[data-tab]') return tabButtons;
      return [];
    },
    createElement(tag) {
      const element = new Element(tag);
      if (tag === 'a') element.click = () => downloads.push({name: element.download, blob: exportBlob});
      return element;
    }
  };
  const window = {setTimeout(fn) { timers.push(fn); }};
  const context = vm.createContext({window, document, Blob,
    URL: {createObjectURL(blob) { exportBlob = blob; return 'blob:test'; }, revokeObjectURL() {}},
    localStorage: {getItem(key) { return stored.get(key) ?? null; }, setItem(key, value) { stored.set(key, value); }}
  });
  for (const file of ['data.js','engine.js','immortal-data.js','immortal.js','immortal-search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  const engine = window.HeroEngine;
  const realOptimizeTeam = engine.optimizeTeam;
  const realOptimizeImmortalTeam = engine.optimizeImmortalTeam;
  engine.optimizeImmortalTeam = (team,settings,config,allowed) => {
    immortalOptimizationCalls.push({team:clone(team),settings:clone(settings),config:clone(config),allowed:clone(allowed || [])});
    return realOptimizeImmortalTeam(team,settings,config,allowed);
  };
  const evaluate = engine.evaluate;
  engine.evaluate = (team, settings, ...rest) => {
    const result = evaluate(team, settings, ...rest);
    evaluationCalls.push({team: clone(team), settings: clone(settings || {}), result});
    return result;
  };
  // Search behavior is covered by engine.test.cjs; here verify UI passes the right team context.
  for (const method of ['optimizeTeam', 'optimizePlacements']) engine[method] = (team, settings, focus, allowed) => {
    optimizationCalls.push({method, team: clone(team), settings: clone(settings), focus, allowed: clone(allowed || [])});
    const suggested = nextSuggestion || team; nextSuggestion = null;
    return {team: clone(suggested), score: evaluate(suggested, settings).metrics[focus], evaluated: 1};
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  return {
    elements, engine, realOptimizeTeam, evaluationCalls, optimizationCalls, immortalOptimizationCalls, downloads,
    state() { return JSON.parse(stored.get(storageKey)); },
    suggest(team) { nextSuggestion = clone(team); },
    async step() { assert.ok(timers.length, 'expected a scheduled callback'); await timers.shift()(); },
    async flush() { while (timers.length) await timers.shift()(); },
    async click(id, dataset) { await document.getElementById(id).dispatch('click', dataset ? new Element('button', dataset) : undefined); },
    async change(id, dataset, value) { const target = dataset ? new Element('select', dataset) : document.getElementById(id); target.value = String(value); await document.getElementById(id).dispatch('change', target); },
    async check(id, checked, dataset) { const target = dataset ? new Element('input',dataset) : document.getElementById(id); target.checked = checked; await document.getElementById(id).dispatch('change',target); },
    async focus(focus) { await this.click('focus-controls', {focus}); },
    async import(candidate) {
      const text = JSON.stringify(candidate);
      const target = new Element('input'); target.files = [{size: Buffer.byteLength(text), async text() { return text; }}];
      await document.getElementById('import-file').dispatch('change', target);
    },
    async export() { await this.click('export'); return JSON.parse(await downloads.at(-1).blob.text()); }
  };
}

function fixture() {
  const saved = load().state();
  saved.settings = {...saved.settings, goldMimicFarming:false, milestoneScale: 1, synergyScale: 1, accountSynergyBoosts: false,
    grandMaster: false, snowFort: false, maxTier: 1, synergyEvent: false, experienceReference: null, chanceReferences: {gold:null,damage:null,damageBuffSwap:null},
    experienceSkills:true,experienceArcherBonus:0,experienceArcherMasteryPerWave:0,experienceArcherCoverage:0,
    experienceBallistaBonus:0,experienceBallistaMasteryPerStack:0,experienceBallistaStacks:0,
    experienceVeteranSuperChance:106.2,experienceVeteranShareChance:258,experienceVeteranSuperAmountPerStack:16.3};
  for (const focus of focuses) saved.focusTeams[focus] = {
    teams: {a: [slot('militia', 25), slot('scout', 25), slot('apprentice', 25)],
      b: [slot('apprentice', 25), slot('militia', 25)]},
    names: {a: `${focus} A`, b: `${focus} B`}, attackers: {a: 2, b: 0},
    chooseAttacker: false, levelingTargets: focus === 'experience' ? {a: 2, b: 0} : {a: null, b: null}
  };
  saved.focusTeams.experience.experienceOptions = {
    a: {style: 'auto', attacker: 'best', supportLevel: 25, optimizeSupportStyles:true},
    b: {style: 'auto', attacker: 'best', supportLevel: 25, optimizeSupportStyles:true}
  };
  saved.focusTeams.gold.enemiesPerHour = {a:null,b:null};
  saved.focusTeams.gold.mimicKillsPerHour = {a:null,b:null};
  return saved;
}

function migratedFocusTeams(candidate) {
  const teams = clone(candidate.focusTeams);
  if (candidate.version < 11) teams.damageBuffSwap = clone(teams.damage);
  return teams;
}


function bestIndex(engine, team, settings, metric) {
  const heroes = engine.evaluate(team, settings).heroes;
  return heroes.length ? heroes.reduce((best, hero) => hero.metrics[metric] > best.metrics[metric] ? hero : best).index : null;
}
function assertSingleAttacker(call, index) {
  for (const metric of ['damage', 'gold', 'experience']) {
    assert.equal(call.settings[metric === 'experience' ? 'experienceHero' : metric + 'Hero'], index);
    assert.equal(call.result.metrics[metric], index === null ? 0 : call.result.heroes[index].metrics[metric]);
  }
}

const tests = [];
const test = (name, run) => tests.push({name, run});

test('new setups keep independent teams for each standard focus and default to 10,000 base energy', async () => {
  const app = load(), state = app.state();
  assert.equal(state.version, 20);
  assert.equal(state.settings.baseEnergy, 10000);
  assert.equal(app.engine.defaults.baseEnergy, 10000);
  assert.deepEqual(Object.keys(state.focusTeams).sort(), [...focuses].sort());
  for (const focus of focuses) for (const key of ['a', 'b']) {
    assert.equal(state.focusTeams[focus].teams[key].length, 10);
    assert.ok(Number.isInteger(state.focusTeams[focus].attackers[key]));
    assert.equal(state.focusTeams[focus].chooseAttacker, false);
    assert.equal(state.focusTeams[focus].levelingTargets[key], focus === 'experience' ? state.focusTeams[focus].attackers[key] : null);
    for (const id of requiredByFocus[focus] || []) assert.ok(state.focusTeams[focus].teams[key].some(hero => hero.id === id), `${focus} starts with ${id}`);
  }
  await app.change('teams', {level: 'a:0'}, 1234);
  assert.equal(app.state().focusTeams.energy.teams.a[0].level, 1234);
  assert.equal(app.state().focusTeams.energy.teams.b[0].level, 15000);
  for (const focus of focuses.slice(1)) assert.deepEqual(app.state().focusTeams[focus], state.focusTeams[focus]);
  for (const key of ['a', 'b']) {
    const panel = state.focusTeams.experience;
    assert.equal(panel.teams[key][panel.levelingTargets[key]].level, 1);
    assert.deepEqual(panel.experienceOptions[key], {style: 'auto', attacker: 'best', supportLevel: 15000, optimizeSupportStyles:true});
  }
});

test('requirements stay focus-specific and notices never rewrite existing saved lineups', async () => {
  const initial = fixture(), app = load(initial);
  for (const focus of [...focuses,'immortal']) {
    await app.focus(focus);
    const expected = requiredByFocus[focus] || [];
    for (const call of app.evaluationCalls.slice(-2)) assert.deepEqual(call.settings.requiredHeroes, expected);
    const notice = app.elements.get('universal-required-roster');
    assert.equal(notice.hidden, focus !== 'experience');
    if (focus === 'experience') {
      assert.match(notice.textContent, /at least one Archer, Ballista and Veteran/);
      assert.match(notice.textContent, /Team B: missing/);
    }
    assert.deepEqual(app.state().focusTeams, initial.focusTeams);
    assert.deepEqual(app.state().immortal.teams, initial.immortal.teams);
    if (focus !== 'immortal') {
      await app.click('optimize'); await app.flush();
      assert.deepEqual(app.optimizationCalls.at(-1).settings.requiredHeroes, expected);
    }
  }
});

test('actual Experience suggestions include XP heroes outside the roster and keep duplicate locked levelers', async () => {
  const initial = fixture(); initial.focus = 'experience'; initial.allowed = [];
  const panel = initial.focusTeams.experience;
  panel.teams.b = [slot('archer',100,true),slot('archer',100,true),slot('scout',300),slot('scout',400)];
  panel.attackers.b = panel.levelingTargets.b = 0;
  panel.experienceOptions.b = {style:'none',attacker:0,supportLevel:15000, optimizeSupportStyles:true};
  const app = load(initial);
  app.engine.optimizeTeam = app.realOptimizeTeam;
  await app.click('optimize'); await app.flush();
  const team = app.state().focusTeams.experience.teams.b;
  assert.equal(app.elements.get('alert').hidden, true);
  assert.deepEqual(team.slice(0,2), panel.teams.b.slice(0,2));
  assert.equal(team.filter(hero => hero.id === 'archer').length, 2, 'at least one does not forbid duplicates');
  assert.ok(team.some(hero => hero.id === 'ballista'));
  assert.ok(team.some(hero => hero.id === 'veteran'));
  assert.equal(app.state().focusTeams.experience.attackers.b, 0);
  const veteran = team.findIndex(hero => hero.id === 'veteran');
  await app.change('teams', {hero:'b:' + veteran}, 'scout');
  for (let i=2;i<4;i++) await app.click('teams', {lock:'b:' + i});
  const before = app.state();
  await app.click('optimize'); await app.flush();
  assert.equal(app.elements.get('alert').hidden, false);
  assert.match(app.elements.get('alert').textContent, /Veteran|slots|locked/i);
  assert.deepEqual(app.state(), before);
});

test('actual Gold search uses only its Gold roster and does not insert the XP trio', async () => {
  const initial=fixture(); initial.focus='gold'; initial.allowed=['hunter','rogue','sovereign'];
  const panel=initial.focusTeams.gold;
  panel.teams.b=[slot('hunter',10000,true),slot('rogue',9000),slot('scout',8000)]; panel.attackers.b=0;
  const app=load(initial); app.engine.optimizeTeam=app.realOptimizeTeam;
  await app.click('optimize'); await app.flush();
  assert.equal(app.elements.get('alert').hidden,true);
  const result=app.state().focusTeams.gold;
  assert.deepEqual(result.teams.b.map(hero=>hero.id).sort(),['hunter','rogue','sovereign']);
  assert.deepEqual(result.teams.b.map(hero=>hero.level),[10000,9000,8000]);
  assert.equal(result.teams.b[0].locked,true);
  assert.equal(result.attackers.b,0);
  assert.ok(result.teams.b.every(hero=>!experienceRequired.includes(hero.id)));
  assert.equal(app.elements.get('universal-required-roster').hidden,true);
});

test('switching focuses and reloading preserve each lineup, name, level, tile and lock', async () => {
  const app = load(fixture()), expected = {};
  for (const [index, focus] of focuses.entries()) {
    await app.focus(focus);
    await app.change('teams', {name: 'a'}, `Saved ${focus}`);
    await app.change('teams', {hero: 'a:0'}, ['titan', 'ninja', 'ballista', 'samurai', 'captain', 'warden'][index]);
    await app.change('teams', {level: 'a:0'}, 1000 + index);
    await app.change('teams', {tile: 'a:0'}, ['normal', 'milestone', 'synergy', 'skill', 'normal', 'damage'][index]);
    await app.click('teams', {lock: 'a:0'});
    if (focus === 'damage' || focus === 'damageBuffSwap') await app.change('teams', {attacker: 'a'}, 1);
    expected[focus] = app.state().focusTeams[focus];
  }
  for (const focus of focuses) {
    await app.focus(focus);
    assert.deepEqual(app.state().focusTeams[focus], expected[focus]);
    assert.match(app.elements.get('teams').innerHTML, new RegExp(`Saved ${focus}`));
  }
  const reloaded = load(app.state());
  assert.deepEqual(reloaded.state().focusTeams, expected);
  assert.equal(reloaded.state().focus, 'damageBuffSwap');
});

function immortalFixture() {
  const saved = fixture();
  saved.focus = 'immortal';
  saved.immortal.buffTeams=Object.fromEntries(immortalModes.map(mode=>[mode,'warlock']));
  saved.immortal.config.buffTeam='warlock';
  saved.immortal.meleePriority='damage';
  saved.allowed = ['champion','wizard','archer','witch'];
  for (const panel of Object.values(saved.immortal.teams)) {
    panel.teams.a = [slot('champion'),slot('wizard'),slot('archer'),slot('witch')];
    panel.teams.b = clone(panel.teams.a);
  }
  return saved;
}

test('Immortal mode totals sum eligible damage and keep off-type global support buffs', async () => {
  const app = load(immortalFixture()), model = app.engine.immortal;
  for (const mode of immortalModes) {
    await app.click('immortal-modes',{immortalMode:mode});
    const state = app.state(), config = state.immortal.config;
    assert.equal(config.mode,mode);
    assert.equal(app.elements.get('immortal-panel').hidden,false);
    assert.equal(app.elements.get('metrics').hidden,true);
    assert.doesNotMatch(app.elements.get('teams').innerHTML,/data-attacker=/);
    const team = state.immortal.teams[mode].teams.b;
    const report = model.evaluate(team,state.settings,config);
    const rows = [...app.elements.get('immortal-breakdown').innerHTML.matchAll(/<tr><td>B · (\d+)<\/td>([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length,team.length);
    for (const [i,hero] of report.heroes.entries()) {
      const eligible = mode==='skill' ? hero.id==='champion' : model.typeOf(hero.id)===mode;
      assert.equal(rows[i][2].includes('<td>Support</td>'),!eligible,`${mode} / ${hero.id}`);
      if (!eligible) assert.equal(hero.score,0);
    }
    const shown = Number(app.elements.get('immortal-totals').innerHTML.match(/Team B[^<]*<\/span><strong>([^<]+) <small>/)[1].replace(/,/g,''));
    const primary=config.priority==='hits'?report.totalHitRate:config.priority==='attacks'?report.attacksPerSecond:report.score;
    assert.ok(Math.abs(shown-primary)<=0.0051,`${mode} total should match the sum of eligible slots`);
    if (mode==='skill') {
      const withoutWitch = model.evaluate(team.filter(s=>s.id!=='witch'),state.settings,config);
      assert.ok(report.score>withoutWitch.score,'a mage support can increase Champion’s skill payout');
    }
  }
  await app.focus('damage');
  assert.equal(app.elements.get('immortal-panel').hidden,true);
  assert.equal(app.elements.get('metrics').hidden,false);
});

test('the four Immortal modes retain independent A/B setups and share calibrated boss settings', async () => {
  const app = load(immortalFixture()), standard = app.state().focusTeams, expected = {};
  for (const [index,mode] of immortalModes.entries()) {
    await app.click('immortal-modes',{immortalMode:mode});
    await app.change('teams',{name:'a'},mode+' reference');
    await app.change('teams',{name:'b'},mode+' candidate');
    await app.change('teams',{level:'a:0'},201+index);
    await app.change('teams',{level:'b:0'},500+index);
    await app.click('teams',{lock:'b:1'});
    expected[mode] = app.state().immortal.teams[mode];
  }
  await app.change('immortal-fields',{immortalField:'baseDamageExponent'},60);
  await app.focus('gold'); await app.focus('immortal');
  for (const mode of immortalModes) {
    await app.click('immortal-modes',{immortalMode:mode});
    const saved = app.state();
    assert.equal(saved.immortal.config.baseDamageExponent,60);
    assert.deepEqual(saved.immortal.teams[mode],expected[mode]);
    assert.match(app.elements.get('teams').innerHTML,new RegExp(mode+' candidate'));
    assert.deepEqual(saved.focusTeams,standard);
  }
  const exported=await app.export(), imported=load();
  await imported.import(exported);
  for (const restored of [load(exported),imported]) assert.deepEqual(restored.state(),exported);
});

test('Immortal suggestions use the active boss and allowed heroes and improve tiles without replacing a locked support', async () => {
  const saved = immortalFixture(), panel = saved.immortal.teams.skill;
  saved.settings.snowFort = true;
  panel.teams.b = [slot('ranger',700),slot('witch',6000,true)];
  saved.allowed = ['champion','ranger'];
  const app = load(saved), model = app.engine.immortal;
  await app.click('optimize'); await app.flush();
  const after = app.state(), result = after.immortal.teams.skill;
  assert.equal(app.elements.get('alert').hidden,true);
  assert.deepEqual(result.teams.b.map(s=>s.id),['champion','witch']);
  assert.deepEqual(app.immortalOptimizationCalls.at(-1).settings.requiredHeroes,[]);
  assert.deepEqual(result.teams.b.map(s=>[s.level,s.locked]),[[700,false],[6000,true]]);
  assert.deepEqual(result.teams.a,panel.teams.a);
  for (const mode of immortalModes.slice(1)) assert.deepEqual(after.immortal.teams[mode],saved.immortal.teams[mode]);
  for (let i=0;i<2;i++) await app.change('teams',{tile:'b:'+i},'normal');
  const score = () => {
    const state=app.state();
    return model.evaluate(state.immortal.teams.skill.teams.b,state.settings,state.immortal.config).score;
  };
  const before = score();
  await app.click('teams',{suggestTiles:'b'}); await app.flush();
  assert.ok(score()>before);
  assert.equal(app.state().immortal.teams.skill.teams.b[0].id,'champion');
  assert.equal(app.state().immortal.teams.skill.teams.b[1].locked,true);
  assert.equal(app.elements.get('alert').hidden,true);
});

test('version 12 setups migrate to eight independent Immortal lineups on load and import', async () => {
  const old = fixture(); old.version = 12;
  delete old.immortal;
  const imported = load();
  await imported.import(old);
  for (const app of [load(old),imported]) {
    const saved = app.state();
    assert.equal(saved.version, 20);
    assert.deepEqual(saved.focusTeams,old.focusTeams);
    assert.deepEqual(saved.allowed,old.allowed);
    assert.deepEqual(Object.keys(saved.immortal.teams).sort(),[...immortalModes].sort());
    assert.equal(saved.immortal.config.mode,'skill');
    assert.deepEqual(saved.immortal.buffTeams,{skill:'deploy',melee:'swap',mage:'warlock',ranged:'warlock'});
    assert.equal(saved.immortal.meleePriority,'strikes');
    for (const mode of immortalModes) for (const key of ['a','b']) assert.equal(saved.immortal.teams[mode].teams[key].length,10);
  }
});

test('each boss mode remembers its buffs and search priority through export, reload and import', async () => {
  const app=load(); await app.focus('immortal');
  const config=()=>app.state().immortal.config;
  assert.equal(config().buffTeam,'deploy');
  await app.change('immortal-buff-preset',null,'warlock');
  await app.click('immortal-modes',{immortalMode:'melee'});
  assert.deepEqual([config().buffTeam,config().priority],['swap','strikes']);
  assert.equal(app.elements.get('immortal-priority-field').hidden,false);
  assert.match(app.elements.get('immortal-totals').innerHTML,/Champion strikes\/s/);
  assert.match(app.elements.get('immortal-preset-note').textContent,/Apprentice.*deployed/i);
  await app.change('immortal-priority',null,'damage');
  await app.change('immortal-buff-preset',null,'deploy');
  for (const mode of ['mage','ranged','skill']) {
    await app.click('immortal-modes',{immortalMode:mode});
    assert.equal(config().buffTeam,'warlock');
    assert.equal(app.elements.get('immortal-priority-field').hidden,mode==='skill');
    assert.equal(config().priority,mode==='skill'?'damage':'hits');
    if(mode==='mage') await app.change('immortal-priority',null,'attacks');
  }
  const exported=await app.export(),restored=load(exported);
  await restored.click('immortal-modes',{immortalMode:'melee'});
  assert.deepEqual([restored.state().immortal.config.buffTeam,restored.state().immortal.config.priority],['deploy','damage']);
  const imported=load();
  await imported.import(exported);
  for (const mode of ['mage','ranged']) {
    await restored.click('immortal-modes',{immortalMode:mode});
    await imported.click('immortal-modes',{immortalMode:mode});
    assert.equal(restored.state().immortal.config.priority,mode==='mage'?'attacks':'hits');
    assert.equal(imported.state().immortal.config.priority,restored.state().immortal.config.priority);
  }
});

test('legacy damage-only Mage saves gain hit priority, and speed calibration follows the hero across modes', async () => {
  const legacy=immortalFixture();
  delete legacy.immortal.priorities;
  legacy.immortal.config={...legacy.immortal.config,mode:'mage',priority:'damage'};
  const app=load(legacy), config=()=>app.state().immortal.config;
  assert.equal(config().priority,'hits');
  await app.change('immortal-speed-hero',null,'hunter');
  await app.change('immortal-speed-rank',null,9);
  await app.change('immortal-super-rank',null,4);
  await app.change('immortal-ultra-rank',null,7);
  await app.change('immortal-account-speed',null,25);
  await app.click('immortal-modes',{immortalMode:'ranged'});
  assert.equal(config().heroSpeedRanks.hunter,9);
  assert.equal(config().heroCritRanks.hunter.super,4);
  assert.equal(config().heroCritRanks.hunter.ultra,7);
  assert.equal(config().accountAttackSpeedBonus,25);
  const other=load();
  await other.import(await app.export());
  assert.equal(other.state().immortal.config.heroSpeedRanks.hunter,9);
  assert.deepEqual(other.state().immortal.config.heroCritRanks,config().heroCritRanks);
  assert.equal(other.state().immortal.config.accountAttackSpeedBonus,25);
});

test('Mage and Ranged keep custom crit inputs and import an undeployed Damage reference on request',async()=>{
  const saved=immortalFixture();
  saved.immortal.config={...saved.immortal.config,mode:'mage',baseCritChance:100,baseSuperChance:100,baseUltraChance:100};
  saved.settings.chanceReferences.damage={mode:'preTeam',totals:[135,109,48],contributions:[0,0,0],extraOverflow:0,label:'My chances'};
  const app=load(saved);
  assert.equal(app.state().immortal.config.baseUltraChance,100);
  assert.equal(app.elements.get('immortal-use-damage-chances').hidden,false);
  await app.click('immortal-use-damage-chances');
  const config=app.state().immortal.config;
  assert.deepEqual([config.baseCritChance,config.baseSuperChance,config.baseUltraChance],[135,109,48]);
  assert.match(app.elements.get('immortal-totals').innerHTML,/Ultra/i);
  const empty=immortalFixture();
  empty.immortal.config.mode='ranged';
  const noReference=load(empty);
  assert.equal(noReference.elements.get('immortal-use-damage-chances').hidden,true);
});

test('a locked Champion can be joined by only the required buff heroes with an empty optional roster', async () => {
  const saved=immortalFixture(), team=saved.immortal.teams.skill;
  saved.immortal.buffTeams.skill='deploy';
  saved.immortal.config.buffTeam='deploy';
  saved.allowed=[];
  team.teams.b=[slot('champion',900,true),...['ranger','witch','militia','ranger'].map(id=>slot(id))];
  const app=load(saved); await app.click('optimize'); await app.flush();
  assert.equal(app.elements.get('alert').hidden,true);
  assert.deepEqual(app.state().immortal.teams.skill.teams.b.map(slot=>slot.id).sort(),['apprentice','champion','titan','warlock','wizard']);
});

test('Suggest all four searches each mode with its own locked slots and levels and only updates the B teams', async () => {
  const saved = immortalFixture();
  saved.immortal.config.mode='mage';
  saved.immortal.buffTeams.skill='deploy'; saved.immortal.buffTeams.melee='swap';
  saved.immortal.meleePriority='strikes';
  const lockedSupports=['witch','skymage','scout','militia'];
  for (const [i,mode] of immortalModes.entries()) {
    saved.immortal.teams[mode].teams.b=[slot(lockedSupports[i],1000+i,true),slot('witch',600+i)];
  }
  saved.immortal.teams.skill.teams.b.push(...['wizard','champion','ranger','wizard'].map(id=>slot(id)));
  saved.immortal.teams.melee.teams.b.push(slot('champion'),slot('wizard'),slot('champion'));
  const app=load(saved), before=app.state(), expected=clone(before);
  for (const mode of immortalModes) {
    const panel=expected.immortal.teams[mode], config={...expected.immortal.config,mode,
      buffTeam:expected.immortal.buffTeams[mode],priority:mode==='melee'?'strikes':mode==='skill'?'damage':'hits'};
    const result=app.engine.optimizeImmortalTeam(panel.teams.b,{...expected.settings,requiredHeroes:[]},config,expected.allowed);
    assert.ok(result.score>0,mode);
    panel.teams.b=clone(result.team);
  }
  app.immortalOptimizationCalls.length=0;
  await app.click('immortal-all'); await app.flush();
  assert.equal(app.elements.get('alert').hidden,true);
  assert.equal(app.immortalOptimizationCalls.length,4);
  assert.ok(app.immortalOptimizationCalls.every(call=>call.settings.requiredHeroes.length===0));
  assert.deepEqual(app.state(),expected);
  for (const id of ['warlock','wizard','titan','apprentice']) {
    assert.ok(app.state().immortal.teams.skill.teams.b.some(s=>s.id===id),id);
  }
  assert.ok(app.state().immortal.teams.melee.teams.b.some(s=>s.id==='champion'));
  for (const mode of immortalModes) assert.ok(app.state().immortal.teams[mode].teams.b.every(s=>!['ballista','veteran'].includes(s.id)));
});

test('an impossible final Immortal mode leaves all four candidate lineups untouched', async () => {
  const saved=immortalFixture();
  saved.allowed=['champion','wizard'];
  for (const mode of immortalModes) saved.immortal.teams[mode].teams.b=[slot('witch',700,true),slot('wizard',600),slot('champion')];
  saved.immortal.buffTeams.ranged='deploy';
  saved.immortal.teams.ranged.teams.b=[slot('witch',700,true),slot('wizard',600,true)];
  const app=load(saved), before=app.state();
  await app.click('immortal-all'); await app.flush();
  assert.equal(app.elements.get('alert').hidden,false);
  assert.match(app.elements.get('alert').textContent,/ranged/i);
  assert.deepEqual(app.state(),before);
});

test('account settings remain shared while bulk levels affect only the active pair', async () => {
  const app = load(fixture());
  await app.focus('gold');
  await app.change('base-energy', null, 12000);
  app.elements.get('all-level').value = '7654';
  await app.click('apply-level');
  for (const key of ['a', 'b']) assert.ok(app.state().focusTeams.gold.teams[key].every(hero => hero.level === 7654));
  await app.focus('energy');
  assert.equal(app.state().settings.baseEnergy, 12000);
  assert.ok(app.state().focusTeams.energy.teams.a.every(hero => hero.level === 25));
});

test('version 1 and 2 setups migrate old teams into all focuses without shared references', async () => {
  for (const version of [1, 2]) {
    const old = {version, focus: 'gold', teams: {a: [slot('militia', 4321, true)], b: [slot('scout', 1234)]},
      names: {a: 'Old A', b: 'Old B'}, settings: {baseEnergy: 1, damageHero: 0, grandMasterStacking: 'add'}};
    const app = load(old), migrated = app.state();
    assert.equal(migrated.version, 20);
    assert.equal(migrated.focus, 'gold');
    assert.equal(migrated.settings.baseEnergy, 10000);
    assert.equal(migrated.settings.grandMasterStacking, version === 1 ? 'multiply' : 'add');
    for (const focus of focuses) {
      assert.deepEqual(migrated.focusTeams[focus].teams, old.teams);
      assert.deepEqual(migrated.focusTeams[focus].names, old.names);
      assert.deepEqual(migrated.focusTeams[focus].attackers, {a: 0, b: 0});
    }
    await app.change('teams', {level: 'a:0'}, 9999);
    await app.focus('damage');
    assert.equal(app.state().focusTeams.damage.teams.a[0].level, 4321);
  }
});

test('energy migration updates the old default while preserving custom and version 3 values', () => {
  for (const value of [undefined, 1, 8000, 12500]) {
    const old = {version: 2, teams: {a: [slot('militia')], b: []}, settings: {baseEnergy: value}};
    assert.equal(load(old).state().settings.baseEnergy, value == null || value === 1 ? 10000 : value);
  }
  for (const version of [3, 4, 5]) {
    const current = fixture(); current.version = version; current.settings.baseEnergy = 1;
    assert.equal(load(current).state().settings.baseEnergy, 1);
  }
});

test('damage scoring routes independent attacker slots into each team evaluation', async () => {
  const app = load(fixture());
  await app.focus('damage');
  await app.change('teams', {attacker: 'a'}, 1);
  await app.change('teams', {attacker: 'b'}, 0);
  const [a, b] = app.evaluationCalls.slice(-2);
  assert.equal(a.settings.damageHero, 1);
  assert.equal(b.settings.damageHero, 0);
  assert.equal(a.result.metrics.damage, a.result.heroes[1].metrics.damage);
  assert.equal(b.result.metrics.damage, b.result.heroes[0].metrics.damage);
  assert.deepEqual(app.state().focusTeams.damage.attackers, {a: 1, b: 0});
  await app.focus('energy');
  for (const [index, call] of app.evaluationCalls.slice(-2).entries()) assertSingleAttacker(call, app.state().focusTeams.energy.attackers[index ? 'b' : 'a']);
  await app.focus('damage');
  assert.deepEqual(app.state().focusTeams.damage.attackers, {a: 1, b: 0});
});

test('copy and swap carry attacker selections with their own teams', async () => {
  const app = load(fixture()); await app.focus('damage');
  const before = app.state().focusTeams.damage;
  await app.click('swap-teams');
  const swapped = app.state().focusTeams.damage;
  assert.deepEqual(swapped.teams.a, before.teams.b);
  assert.deepEqual(swapped.teams.b, before.teams.a);
  assert.equal(swapped.attackers.a, before.attackers.b);
  assert.equal(swapped.attackers.b, before.attackers.a);
  assert.equal(swapped.names.a, before.names.b);
  await app.click('copy-team');
  let copied = app.state().focusTeams.damage;
  assert.deepEqual(copied.teams.b, copied.teams.a);
  assert.equal(copied.attackers.b, copied.attackers.a);
  await app.change('teams', {level: 'b:0'}, 777);
  copied = app.state().focusTeams.damage;
  assert.notEqual(copied.teams.a[0].level, copied.teams.b[0].level);
  assert.deepEqual(app.state().focusTeams.energy, fixture().focusTeams.energy);
});

test('removing heroes tracks the attacker and handles empty teams and new heroes', async () => {
  const app = load(fixture()); await app.focus('damage');
  await app.click('teams', {remove: 'a:0'});
  let saved = app.state().focusTeams.damage;
  assert.equal(saved.attackers.a, 1);
  assert.equal(saved.teams.a[saved.attackers.a].id, 'apprentice');
  await app.click('teams', {remove: 'a:1'});
  saved = app.state().focusTeams.damage;
  assert.equal(saved.attackers.a, 0);
  assert.equal(saved.teams.a[0].id, 'scout');
  await app.click('teams', {remove: 'a:0'});
  saved = app.state().focusTeams.damage;
  assert.deepEqual(saved.teams.a, []);
  assert.equal(saved.attackers.a, null);
  assert.equal(saved.attackers.b, 0);
  await app.click('teams', {add: 'a'});
  assert.equal(app.state().focusTeams.damage.attackers.a, 0);
});

test('team and tile suggestions receive the selected attacker for the intended team', async () => {
  const app = load(fixture()); await app.focus('damage');
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.map(call => [call.method, call.focus, call.settings.damageHero]),
    [['optimizePlacements', 'damage', 2], ['optimizePlacements', 'damage', 0], ['optimizeTeam', 'damage', 0]]);
  assert.equal(app.elements.get('alert').hidden, true);
});

test('export and import round-trip all six focus pairs including inactive attackers', async () => {
  const original = fixture(); original.focus = 'experience'; original.focusTeams.damage.attackers = {a: 1, b: 1};
  const source = load(original), exported = await source.export();
  assert.equal(source.downloads[0].name, 'hero-team-lab-setup.json');
  assert.equal(exported.version, 20);
  const target = load(); await target.import(exported);
  assert.deepEqual(target.state(), exported);
  assert.equal(target.elements.get('alert').hidden, true);
  await target.focus('damage');
  assert.deepEqual(target.state().focusTeams.damage.attackers, {a: 1, b: 1});
});

test('import validates inactive focus teams before replacing a working setup', async () => {
  for (const corrupt of [
    state => { state.focusTeams.damage.teams.a[0].id = 'unknown-hero'; },
    state => { state.focusTeams.damage.teams.a = Array.from({length: 11}, () => slot('militia')); },
    state => { state.focusTeams.damage.teams.a = Array.from({length: 4}, () => slot('militia')); },
    state => { state.focusTeams.damage.teams.a = ['militia', 'scout', 'apprentice', 'titan'].map(id => slot(id, 25, false, 'milestone')); },
    state => { delete state.focusTeams.gold; },
    state => { delete state.focusTeams.powerMageEnergy; },
    state => { state.focusTeams.powerMageEnergy.teams.b[0].id = 'unknown-hero'; },
    state => { delete state.focusTeams.damageBuffSwap; },
    state => { state.focusTeams.damageBuffSwap.teams.a[0].id = 'unknown-hero'; },
    state => { delete state.immortal.teams.mage; },
    state => { state.immortal.teams.ranged.teams.a[0].id = 'unknown-hero'; },
    state => { state.immortal.teams.skill.teams.b = Array.from({length:4},()=>slot('champion')); },
    state => { state.version = 21; }
  ]) {
    const app = load(fixture()), before = app.state(), invalid = clone(before); corrupt(invalid);
    await app.import(invalid);
    assert.equal(app.elements.get('alert').hidden, false);
    assert.match(app.elements.get('alert').textContent, /Could not import setup/);
    assert.deepEqual(app.state(), before);
  }
});

test('missing or out-of-range attackers recover to the strongest remaining slot independently', () => {
  const initial = fixture(); initial.focus = 'damage';
  initial.focusTeams.damage.teams.a = [slot('scout', 25), slot('militia', 25)];
  initial.focusTeams.damage.teams.b = [];
  initial.focusTeams.damage.attackers = {a: 99, b: 7};
  const app = load(initial), saved = app.state().focusTeams.damage;
  assert.equal(saved.attackers.a, 1);
  assert.equal(saved.attackers.b, null);
});

test('existing version 3 setups safely default new targeting controls', () => {
  const old = fixture(); old.version = 3;
  for (const focus of focuses) {
    delete old.focusTeams[focus].chooseAttacker;
    delete old.focusTeams[focus].levelingTargets;
  }
  const app = load(old);
  for (const focus of focuses) {
    const panel = app.state().focusTeams[focus];
    assert.equal(panel.chooseAttacker, false);
    if (focus === 'experience') assert.deepEqual(panel.levelingTargets, panel.attackers);
    else assert.deepEqual(panel.levelingTargets, {a: null, b: null});
    const sourceFocus = focus === 'powerMageEnergy' ? 'energy' : focus === 'damageBuffSwap' ? 'damage' : focus;
    assert.deepEqual(panel.teams, old.focusTeams[sourceFocus].teams);
    if (!['gold', 'experience'].includes(focus)) assert.deepEqual(panel.attackers, old.focusTeams[sourceFocus].attackers);
  }
});

test('automatic attacker search changes only Team B suggestion objective and selects the resulting best attacker', async () => {
  const app = load(fixture()); await app.focus('damage');
  const original = app.state().focusTeams.damage;
  assert.equal(app.elements.get('attacker-search-option').hidden, false);
  await app.check('choose-attacker', true);
  assert.equal(app.state().focusTeams.damage.chooseAttacker, true);
  assert.deepEqual(app.state().focusTeams.damage.attackers, original.attackers, 'enabling search must not silently change the compared attacker');
  assert.equal(app.evaluationCalls.at(-1).settings.damageHero, original.attackers.b);
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, original.attackers.b, 'tile-only suggestions retain the selected attacker');
  app.suggest([slot('scout', 25), slot('militia', 25)]);
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, 'best');
  const suggested = app.state().focusTeams.damage;
  assert.equal(suggested.attackers.b, 1);
  assert.equal(suggested.teams.b[suggested.attackers.b].id, 'militia');
  assert.deepEqual(suggested.teams.a, original.teams.a);
  assert.equal(suggested.attackers.a, original.attackers.a);
  const evaluated = app.evaluationCalls.at(-1);
  assert.equal(evaluated.settings.damageHero, 1);
  assert.equal(evaluated.result.metrics.damage, evaluated.result.heroes[1].metrics.damage);
  await app.check('choose-attacker', false);
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, 1, 'fixed-attacker mode preserves the newly selected attacker');
  await app.focus('experience');
  assert.equal(app.elements.get('attacker-search-option').hidden, true);
});

test('without Veteran the leveler attacks and clearing selection recovers a valid leveler', async () => {
  const app = load(fixture()); await app.focus('experience');
  await app.change('teams', {levelingTarget: 'a'}, 2);
  await app.change('teams', {levelingTarget: 'b'}, 1);
  const [a, b] = app.evaluationCalls.slice(-2);
  assert.equal(a.settings.experienceHero, 2);
  assert.equal(b.settings.experienceHero, 1);
  assert.equal(a.result.metrics.experience, a.result.heroes[2].metrics.experience);
  assert.equal(b.result.metrics.experience, b.result.heroes[1].metrics.experience);
  assert.deepEqual(app.state().focusTeams.experience.levelingTargets, {a: 2, b: 1});
  assert.deepEqual(app.state().focusTeams.experience.attackers, {a: 2, b: 1});
  const expected = bestIndex(app.engine, app.state().focusTeams.experience.teams.b, app.state().settings, 'experience');
  await app.change('teams', {levelingTarget: 'b'}, '');
  assert.equal(app.state().focusTeams.experience.levelingTargets.b, expected);
  assert.equal(app.state().focusTeams.experience.attackers.b, expected);
  assertSingleAttacker(app.evaluationCalls.at(-1), expected);
  assert.doesNotMatch(app.elements.get('teams').innerHTML, /Whole team.*average XP/);
  await app.focus('energy');
  for (const [index, call] of app.evaluationCalls.slice(-2).entries()) assertSingleAttacker(call, app.state().focusTeams.energy.attackers[index ? 'b' : 'a']);
  await app.focus('experience');
  assert.deepEqual(app.state().focusTeams.experience.levelingTargets, {a: 2, b: expected});
});

test('choosing a new leveler starts at one and restores the former target’s support level', async () => {
  const app = load(fixture()); await app.focus('experience');
  const original = app.state().focusTeams.experience;
  app.elements.get('all-level').value = '4321';
  await app.change('teams', {levelingTarget: 'b'}, 'hero:titan');
  let panel = app.state().focusTeams.experience;
  assert.equal(panel.teams.b.length, original.teams.b.length + 1);
  assert.equal(panel.levelingTargets.b, 2);
  assert.deepEqual(panel.teams.b[2], slot('titan', 1));
  assert.deepEqual(panel.teams.a, original.teams.a);
  await app.change('teams', {levelingLevel: 'b'}, 750);
  panel = app.state().focusTeams.experience;
  assert.equal(panel.teams.b[2].level, 750);
  await app.change('teams', {levelingTarget: 'b'}, 'hero:titan');
  assert.deepEqual(app.state().focusTeams.experience, panel, 'choosing an existing hero must not add another copy or reset its level');
  await app.change('teams', {levelingTarget: 'b'}, 'hero:militia');
  panel = app.state().focusTeams.experience;
  assert.equal(panel.levelingTargets.b, 1);
  assert.equal(panel.teams.b.length, 3);
  assert.equal(panel.teams.b[1].level, 1);
  assert.equal(panel.teams.b[2].level, 4321);
});

test('leveling target keeps a specific recipient while all copies share level and style', async () => {
  const initial = fixture(); initial.focus = 'experience';
  initial.focusTeams.experience.teams.b = [slot('militia', 25), slot('militia', 1000)];
  const app = load(initial);
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [25, 25]);
  await app.change('teams', {levelingTarget: 'b'}, 1);
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [25, 25], 'changing recipient preserves progression');
  await app.change('teams', {levelingLevel: 'b'}, 1500);
  const panel = app.state().focusTeams.experience;
  assert.equal(panel.levelingTargets.b, 1);
  assert.deepEqual(panel.teams.b.map(hero => hero.level), [1500, 1500]);
  assert.equal(app.evaluationCalls.at(-1).settings.experienceHero, 1);
});

test('duplicate leveler edits, replacements, bulk support levels and persistence stay synchronized', async () => {
  const initial = fixture(), panel = initial.focusTeams.experience;
  initial.focus = 'energy';
  panel.teams.b = [slot('militia', 500), slot('militia', 15000, true), slot('scout', 7500)];
  panel.experienceOptions.b = {style:'expFactory', attacker:'self', supportLevel:15000, optimizeSupportStyles:true};
  const app = load(initial);
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [500, 500, 7500], 'inactive XP teams normalize on import too');
  await app.focus('experience');
  await app.change('teams', {level:'b:1'}, 2500);
  await app.change('teams', {xpStyle:'b'}, 'industrialist');
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [2500, 2500, 7500]);
  app.elements.get('all-level').value = '9000';
  await app.click('apply-level');
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [2500, 2500, 9000]);
  assert.equal(app.evaluationCalls.at(-1).settings.experienceSupportLevel, 9000);
  await app.change('teams', {hero:'b:2'}, 'militia');
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [2500, 2500, 2500]);
  await app.change('teams', {hero:'b:2'}, 'scout');
  assert.equal(app.state().focusTeams.experience.teams.b[2].level, 9000, 'a former duplicate returns to the support level');
  for (const restored of [load(app.state()), load(await app.export())]) {
    const restoredPanel = restored.state().focusTeams.experience;
    assert.deepEqual(restoredPanel.teams.b.map(hero => hero.level), [2500, 2500, 9000]);
    assert.equal(restoredPanel.experienceOptions.b.style, 'industrialist');
  }
  await app.change('teams', {levelingTarget:'b'}, 2);
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(hero => hero.level), [9000, 9000, 1], 'switching hero restores every former copy');
});

test('removing the selected duplicate preserves the remaining leveling hero and replacing it restores former copies', async () => {
  const initial = fixture(), panel = initial.focusTeams.experience;
  initial.focus = 'experience';
  panel.teams.b = [slot('militia', 1500), slot('militia', 15000), slot('scout', 8000)];
  panel.experienceOptions.b = {style:'tycoon', attacker:'self', supportLevel:15000, optimizeSupportStyles:true};
  const app = load(initial);
  await app.click('teams', {remove:'b:0'});
  let updated = app.state().focusTeams.experience;
  assert.equal(updated.levelingTargets.b, 0);
  assert.equal(updated.teams.b[0].id, 'militia');
  assert.equal(updated.teams.b[0].level, 1500);
  assert.equal(updated.experienceOptions.b.style, 'tycoon');
  await app.change('teams', {hero:'b:1'}, 'militia');
  await app.change('teams', {hero:'b:0'}, 'scout');
  updated = app.state().focusTeams.experience;
  assert.deepEqual(updated.teams.b.map(hero => [hero.id,hero.level]), [['scout',1],['militia',15000]]);
});

test('a new leveling hero replaces the last unlocked full-team slot and retains its tile', async () => {
  const initial = load().state(); initial.focus = 'experience';
  const team = initial.focusTeams.experience.teams.b;
  team.forEach((hero, index) => { hero.locked = ![2, 7].includes(index); });
  const before = clone(team), app = load(initial);
  app.elements.get('all-level').value = '600';
  await app.change('teams', {levelingTarget: 'b'}, 'hero:ninja');
  const panel = app.state().focusTeams.experience;
  assert.equal(panel.teams.b.length, 10);
  assert.equal(panel.levelingTargets.b, 7);
  assert.deepEqual(panel.teams.b[7], slot('ninja', 1, false, before[7].tile));
  const previous = initial.focusTeams.experience.levelingTargets.b;
  before[previous].level = initial.focusTeams.experience.experienceOptions.b.supportLevel;
  for (let index = 0; index < team.length; index++) if (index !== 7) assert.deepEqual(panel.teams.b[index], before[index]);
});

test('full locked teams and unknown heroes cannot be changed by a leveling target choice', async () => {
  const initial = load().state(); initial.focus = 'experience';
  initial.focusTeams.experience.teams.b.forEach(hero => { hero.locked = true; });
  const app = load(initial), before = app.state();
  for (const value of ['hero:ninja', 'hero:unknown-hero']) {
    await app.change('teams', {levelingTarget: 'b'}, value);
    assert.deepEqual(app.state(), before);
    assert.equal(app.elements.get('alert').hidden, false);
  }
  await app.change('teams', {levelingTarget: 'b'}, 0);
  assert.equal(app.state().focusTeams.experience.levelingTargets.b, 0, 'an already deployed locked hero can be the leveling target');
});

test('copy, swap and removal carry leveling targets without accidentally targeting a different hero', async () => {
  const initial = fixture(); initial.focus = 'experience';
  initial.focusTeams.experience.levelingTargets = {a: 2, b: 0};
  const app = load(initial), original = app.state().focusTeams.experience;
  await app.click('swap-teams');
  let panel = app.state().focusTeams.experience;
  assert.deepEqual(panel.levelingTargets, {a: 0, b: 2});
  assert.equal(panel.teams.b[panel.levelingTargets.b].id, original.teams.a[2].id);
  await app.click('copy-team');
  panel = app.state().focusTeams.experience;
  assert.deepEqual(panel.levelingTargets, {a: 0, b: 0});
  await app.change('teams', {levelingTarget: 'b'}, 1);
  await app.click('teams', {remove: 'b:0'});
  panel = app.state().focusTeams.experience;
  assert.equal(panel.levelingTargets.b, 0);
  assert.equal(panel.teams.b[0].id, 'militia');
  await app.click('teams', {remove: 'b:0'});
  assert.equal(app.state().focusTeams.experience.levelingTargets.b, null);
  await app.click('teams', {add: 'b'});
  assert.equal(app.state().focusTeams.experience.levelingTargets.b, 0, 'a nonempty team must have one attacker');
  assert.equal(app.state().focusTeams.experience.attackers.b, 0);
});

test('Experience roster and tile suggestions receive their attacker and other focuses use their own', async () => {
  const app = load(fixture()); await app.focus('experience');
  await app.change('teams', {levelingTarget: 'a'}, 2);
  await app.change('teams', {levelingTarget: 'b'}, 1);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.map(call => [call.method, call.focus, call.settings.experienceHero]),
    [['optimizePlacements', 'experience', 2], ['optimizePlacements', 'experience', 1], ['optimizeTeam', 'experience', 1]]);
  assert.deepEqual(app.state().focusTeams.experience.levelingTargets, {a: 2, b: 1});
  await app.focus('gold');
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.experienceHero, app.state().focusTeams.gold.attackers.b);
});

test('automatic attacker mode and leveling targets survive focus switches, reload, export and import', async () => {
  const app = load(fixture()); await app.focus('damage');
  await app.check('choose-attacker', true);
  await app.focus('experience');
  await app.change('teams', {levelingTarget: 'a'}, 1);
  await app.change('teams', {levelingTarget: 'b'}, 0);
  await app.change('teams', {levelingLevel: 'b'}, 875);
  await app.focus('energy');
  const exported = await app.export(), reloaded = load(exported), imported = load();
  await imported.import(exported);
  for (const saved of [reloaded, imported]) {
    assert.deepEqual(saved.state(), exported);
    await saved.focus('damage');
    assert.equal(saved.elements.get('choose-attacker').checked, true);
    assert.equal(saved.state().focusTeams.damage.chooseAttacker, true);
    await saved.focus('experience');
    assert.deepEqual(saved.state().focusTeams.experience.levelingTargets, {a: 1, b: 0});
    assert.equal(saved.state().focusTeams.experience.teams.b[0].level, 875);
  }
});

test('legacy missing leveling targets select a single XP attacker without changing teams', () => {
  for (const targets of [undefined, {a: 99, b: -1}, {a: '1', b: 0.5}, {a: null, b: null}]) {
    const initial = fixture(); initial.version = 4; initial.focus = 'experience';
    initial.focusTeams.experience.levelingTargets = targets;
    const app = load(initial);
    const expected = Object.fromEntries(['a','b'].map(key => [key, bestIndex(app.engine, initial.focusTeams.experience.teams[key], initial.settings, 'experience')]));
    assert.deepEqual(app.state().focusTeams.experience.levelingTargets, expected);
    assert.deepEqual(app.state().focusTeams.experience.attackers, expected);
    assert.deepEqual(app.state().focusTeams.experience.teams, initial.focusTeams.experience.teams);
  }
});

function levelingFixture() {
  const saved = fixture(), panel = saved.focusTeams.experience;
  saved.focus = 'experience';
  saved.allowed = ['militia', 'veteran'];
  for (const key of ['a','b']) panel.experienceOptions[key].optimizeSupportStyles = false;
  panel.teams.b = [slot('militia', 1), slot('veteran', 1000, true), slot('archer',0,true), slot('ballista',0,true)];
  return saved;
}

const xpProfileDefaults = {experienceSkills:true,experienceArcherBonus:13240,experienceArcherMasteryPerWave:0.65,
  experienceWave:75000,experienceArcherCoverage:100,experienceBallistaBonus:3865,experienceBallistaMasteryPerStack:6.5,
  experienceBallistaStacks:100,experienceVeteranSuperChance:149.2,experienceVeteranShareChance:365.5,
  experienceVeteranSuperAmountPerStack:16.26,experienceVeteranStacks:100};

function xpTileFixture(shared=false) {
  const saved=levelingFixture();
  saved.settings.snowFort=true;
  saved.settings.experienceSkills=shared;
  const panel=saved.focusTeams.experience;
  panel.teams.b=[slot('militia',1,true),slot('veteran',shared?1000:0,true),slot('archer',0,true),slot('ballista',0,true)];
  panel.teams.a=clone(panel.teams.b);
  panel.attackers={a:0,b:0}; panel.levelingTargets={a:0,b:0};
  panel.experienceOptions={a:{style:'none',attacker:shared?1:'self',supportLevel:15000, optimizeSupportStyles:true},b:{style:'none',attacker:shared?1:'self',supportLevel:15000, optimizeSupportStyles:true}};
  return saved;
}

test('every Experience slot offers the XP tile and one occupied tile boosts the killer once', async () => {
  const app=load(xpTileFixture()), result=()=>app.evaluationCalls.at(-1).result;
  const baseline=result().metrics.experience;
  await app.change('teams',{tile:'b:0'},'experience');
  assert.equal(app.state().focusTeams.experience.teams.b[0].tile,'experience');
  assert.ok(Math.abs(result().metrics.experience/baseline-1.2)<1e-12);
  assert.equal(result().experiencePlan.attackerTileFactor,1.2);
  assert.match(app.elements.get('teams').innerHTML,/XP \+20%/);
  const selectors=[...app.elements.get('teams').innerHTML.matchAll(/<select class="tile-select"[^>]*data-tile="([^"]+)"[^>]*>(.*?)<\/select>/g)];
  assert.equal(selectors.length,8);
  for (const [,key,html] of selectors) assert.ok(html.includes('value="experience"'),key);
  const before=app.state(); await app.change('teams',{tile:'b:1'},'experience');
  assert.deepEqual(app.state(),before); assert.match(app.elements.get('alert').textContent,/one XP tile/i);
  await app.focus('gold'); const goldBefore=app.state();
  await app.change('teams',{tile:'b:0'},'experience');
  assert.deepEqual(app.state(),goldBefore);
  assert.ok(!app.elements.get('teams').innerHTML.includes('value="experience"'));
  assert.equal(app.elements.get('experience-placement-comparison').hidden,true);
  await app.focus('experience'); await app.check('snow-fort',false);
  assert.equal(result().metrics.experience,baseline);
  assert.equal(app.state().focusTeams.experience.teams.b[0].tile,'experience');
  assert.match(app.elements.get('experience-placement-comparison').innerHTML,/Enable Snow Fort/);
});

test('Veteran shares the tiled killer’s XP and the placement comparison applies only to the chosen team', async () => {
  const shared=load(xpTileFixture(true)), baseline=shared.evaluationCalls.at(-1).result.metrics.experience;
  await shared.change('teams',{tile:'b:0'},'experience');
  assert.equal(shared.evaluationCalls.at(-1).result.metrics.experience,baseline);
  assert.equal(shared.evaluationCalls.at(-1).result.experiencePlan.attackerTileFactor,1);
  await shared.change('teams',{tile:'b:0'},'normal');
  await shared.change('teams',{tile:'b:1'},'experience');
  assert.ok(Math.abs(shared.evaluationCalls.at(-1).result.metrics.experience/baseline-1.2)<1e-12);
  assert.equal(shared.evaluationCalls.at(-1).result.experiencePlan.attackerTileFactor,1.2);
  assert.match(shared.elements.get('experience-placement-comparison').innerHTML,/Attacker slot 2/i);
  const alternate=xpTileFixture(true);
  alternate.settings.experienceVeteranSuperChance=0;
  alternate.settings.experienceVeteranSuperAmountPerStack=0;
  const app=load(alternate), before=app.state().focusTeams.experience;
  const table=app.elements.get('experience-placement-comparison');
  for (const key of ['a','b']) for (const tile of ['normal','experience','milestone','synergy','skill']) assert.ok(table.innerHTML.includes(`data-xp-placement="${key}:${tile}"`));
  assert.match(table.innerHTML,/data-xp-tile-swap="b"/);
  await app.click('experience-placement-comparison',{xpTileSwap:'b'});
  const after=app.state().focusTeams.experience;
  assert.equal(after.teams.b[1].tile,'experience');
  assert.equal(after.teams.b[0].tile,'normal');
  assert.deepEqual(after.teams.a,before.teams.a);
  assert.deepEqual(after.teams.b.map(({id,level,locked})=>({id,level,locked})),before.teams.b.map(({id,level,locked})=>({id,level,locked})));
  assert.deepEqual(after.experienceOptions,before.experienceOptions);
  assert.deepEqual(after.levelingTargets,before.levelingTargets);
});

test('the XP tile stays in its slot through save, copy, swap, leveler changes and hero replacement', async () => {
  const app=load(xpTileFixture());
  await app.change('teams',{tile:'a:0'},'experience'); await app.click('copy-team');
  await app.click('swap-teams');
  const exported=await app.export(), imported=load(); await imported.import(exported);
  assert.equal(exported.version,20);
  for (const restored of [load(exported),imported]) for (const key of ['a','b']) assert.equal(restored.state().focusTeams.experience.teams[key][0].tile,'experience');
  await app.change('teams',{levelingTarget:'b'},'1');
  assert.equal(app.state().focusTeams.experience.teams.b[0].tile,'experience');
  assert.equal(app.state().focusTeams.experience.teams.b[1].tile,'normal');
  await app.change('teams',{tile:'b:0'},'normal');
  await app.change('teams',{tile:'b:1'},'experience');
  await app.change('teams',{hero:'b:1'},'scout');
  assert.equal(app.state().focusTeams.experience.teams.b[1].tile,'experience');
  const duplicate=xpTileFixture(); duplicate.focusTeams.experience.teams.b.push(slot('militia',1));
  const copies=load(duplicate); await copies.change('teams',{tile:'b:0'},'experience');
  await copies.change('teams',{levelingTarget:'b'},'4');
  assert.equal(copies.state().focusTeams.experience.teams.b[0].tile,'experience');
  assert.equal(copies.state().focusTeams.experience.teams.b[4].tile,'normal');
});

test('XP tile imports preserve a support placement and reject duplicate and inactive-focus placements', async () => {
  const app=load(xpTileFixture()), before=app.state();
  before.focusTeams.experience.teams.b[1].tile='experience';
  await app.import(before);
  assert.deepEqual(app.state(),before);
  assert.equal(load(await app.export()).state().focusTeams.experience.teams.b[1].tile,'experience');
  const mutations=[
    state=>{state.focusTeams.experience.teams.b[0].tile='experience';state.focusTeams.experience.teams.b[1].tile='experience';},
    state=>{state.focusTeams.gold.teams.a[0].tile='experience';},
    state=>{state.immortal.teams.skill.teams.b[0].tile='experience';}
  ];
  for (const mutate of mutations) {
    const invalid=clone(before); mutate(invalid); await app.import(invalid);
    assert.deepEqual(app.state(),before); assert.equal(app.elements.get('alert').hidden,false);
    assert.match(app.elements.get('alert').textContent,/XP/);
  }
  const old=clone(before);old.version=16;delete old.settings.experienceTile;
  const migrated=load(old).state();
  assert.equal(migrated.version,20);assert.equal(migrated.settings.experienceTile,20);
  assert.deepEqual(migrated.focusTeams,old.focusTeams);assert.deepEqual(migrated.immortal.teams,old.immortal.teams);
});

test('version 18 adds support-style search without changing current saved lineups', async () => {
  const old=levelingFixture();old.version=17;
  for(const key of ['a','b']) delete old.focusTeams.experience.experienceOptions[key].optimizeSupportStyles;
  const app=load(old),state=app.state();
  assert.equal(state.version,20);
  assert.deepEqual(state.focusTeams.experience.teams,old.focusTeams.experience.teams);
  for(const key of ['a','b']) assert.equal(state.focusTeams.experience.experienceOptions[key].optimizeSupportStyles,true);
  assert.ok(state.focusTeams.experience.teams.b.every(slot=>!slot.combatStyle));
  assert.match(app.elements.get('teams').innerHTML,/data-xp-optimize-support-styles="b"/);
  assert.match(app.elements.get('teams').innerHTML,/Locks preserve hero and level/);
});

test('manual support styles synchronize duplicate heroes and enforce the lowest copy unlock level', async () => {
  const saved=xpTileFixture();saved.settings.grandMaster=true;
  saved.focusTeams.experience.teams.b=[slot('militia',1),slot('archer',15000,true),slot('archer',15000,true),slot('ballista',15000),slot('veteran',15000)];
  const app=load(saved),team=()=>app.state().focusTeams.experience.teams.b;
  assert.equal(app.evaluationCalls.at(-1).result.style.count,4);
  await app.change('teams',{xpSupportStyle:'b:1'},'magnate');
  assert.deepEqual(team().filter(slot=>slot.id==='archer').map(slot=>slot.combatStyle),['magnate','magnate']);
  assert.equal(app.evaluationCalls.at(-1).result.style.count,2);
  assert.match(app.elements.get('teams').innerHTML,/2 Magnate/);
  await app.change('teams',{level:'b:2'},3999);
  assert.ok(team().filter(slot=>slot.id==='archer').every(slot=>!slot.combatStyle));
  const before=app.state();await app.change('teams',{xpSupportStyle:'b:1'},'magnate');
  assert.deepEqual(app.state(),before);assert.match(app.elements.get('alert').textContent,/not unlocked on every copy/);
  await app.change('teams',{xpSupportStyle:'b:1'},'tycoon');
  assert.ok(team().filter(slot=>slot.id==='archer').every(slot=>slot.combatStyle==='tycoon'));
  await app.change('teams',{hero:'b:1'},'scout');
  assert.equal(team()[1].combatStyle,undefined);assert.equal(team()[2].combatStyle,'tycoon');
  await app.change('teams',{hero:'b:1'},'archer');
  assert.equal(team()[1].combatStyle,'tycoon');
  await app.change('teams',{xpSupportStyle:'b:1'},'');
  assert.ok(team().filter(slot=>slot.id==='archer').every(slot=>!slot.combatStyle));
});

test('support style choices and per-team search preference persist and reach each XP search', async () => {
  const saved=xpTileFixture();saved.focusTeams.experience.teams.b[1].level=15000;
  const app=load(saved);
  await app.change('teams',{xpSupportStyle:'b:1'},'magnate');
  await app.check('teams',false,{xpOptimizeSupportStyles:'b'});
  for(const action of ['team','tiles']) {
    if(action==='team') await app.click('optimize');else await app.click('teams',{suggestTiles:'b'});
    await app.flush(); const call=app.optimizationCalls.at(-1);
    assert.equal(call.settings.experienceOptimizeSupportStyles,false);assert.equal(call.team[1].combatStyle,'magnate');
  }
  const before=app.state();
  assert.equal(before.focusTeams.experience.experienceOptions.a.optimizeSupportStyles,true);
  assert.equal(before.focusTeams.experience.experienceOptions.b.optimizeSupportStyles,false);
  const exported=await app.export(),imported=load();await imported.import(exported);
  for(const restored of [load(exported),imported]) assert.deepEqual(restored.state(),exported);
  await app.change('teams',{levelingTarget:'b'},'1');
  assert.equal(app.state().focusTeams.experience.teams.b[1].combatStyle,'magnate','leveler keeps dormant support assignment');
  assert.equal(app.state().focusTeams.experience.experienceOptions.b.optimizeSupportStyles,false);
  await app.change('teams',{levelingTarget:'b'},'0');
  assert.equal(app.state().focusTeams.experience.teams.b[1].combatStyle,'magnate');
  await app.click('swap-teams');
  assert.equal(app.state().focusTeams.experience.teams.a[1].combatStyle,'magnate');
  assert.equal(app.state().focusTeams.experience.experienceOptions.a.optimizeSupportStyles,false);
  await app.click('copy-team');
  assert.deepEqual(app.state().focusTeams.experience.experienceOptions.a,app.state().focusTeams.experience.experienceOptions.b);
  await app.focus('gold');assert.ok(!app.elements.get('teams').innerHTML.includes('data-xp-support-style'));
});

test('support-style imports reject conflicting copies normalize unlocks and clear non-XP metadata', async () => {
  const app=load(xpTileFixture()),before=app.state(),conflict=clone(before);
  conflict.focusTeams.experience.teams.b[2]={...slot('archer',15000),combatStyle:'tycoon'};
  conflict.focusTeams.experience.teams.b.push({...slot('archer',15000),combatStyle:'magnate'});
  await app.import(conflict);assert.deepEqual(app.state(),before);assert.match(app.elements.get('alert').textContent,/share a support combat style/);
  const valid=clone(before);valid.focusTeams.experience.teams.b[2]={...slot('archer',3999),combatStyle:'magnate'};
  valid.focusTeams.experience.teams.b[1]={...slot('veteran',15000),combatStyle:'tycoon'};
  valid.focusTeams.experience.teams.b.push(slot('veteran',15000));
  valid.focusTeams.gold.teams.a[0].combatStyle='magnate';
  valid.immortal.teams.skill.teams.b[0].combatStyle='magnate';
  await app.import(valid);const result=app.state();
  assert.equal(result.focusTeams.experience.teams.b[2].combatStyle,undefined);
  assert.ok(result.focusTeams.experience.teams.b.filter(slot=>slot.id==='veteran').every(slot=>slot.combatStyle==='tycoon'));
  assert.equal(result.focusTeams.gold.teams.a[0].combatStyle,undefined);
  assert.equal(result.immortal.teams.skill.teams.b[0].combatStyle,undefined);
});

test('XP profiles default to the captured bonuses and migrate missing inputs without changing old lineups', () => {
  const app = load();
  for (const [key,value] of Object.entries(xpProfileDefaults)) assert.equal(app.state().settings[key], value, key);
  assert.match(app.elements.get('xp-skill-fields').innerHTML, /experienceWave/);
  assert.match(app.elements.get('xp-skill-fields').innerHTML, /value="75000"/);
  assert.equal(app.elements.get('xp-skills').checked, true);
  const old = fixture(); old.version = 15;
  for (const key of Object.keys(xpProfileDefaults)) delete old.settings[key];
  const upgraded = load(old).state();
  assert.equal(upgraded.version, 20);
  for (const [key,value] of Object.entries(xpProfileDefaults)) assert.equal(upgraded.settings[key], value, key);
  assert.deepEqual(upgraded.focusTeams, old.focusTeams);
  assert.deepEqual(upgraded.immortal.teams, old.immortal.teams);
});

test('XP profile edits persist globally and reach current-level team and tile suggestions', async () => {
  const app = load(levelingFixture());
  const edits = {experienceArcherBonus:12000,experienceArcherMasteryPerWave:0.5,experienceWave:12345,experienceArcherCoverage:75,
    experienceBallistaBonus:3000,experienceBallistaMasteryPerStack:4.5,experienceBallistaStacks:68,
    experienceVeteranSuperChance:125,experienceVeteranShareChance:50,experienceVeteranSuperAmountPerStack:15,experienceVeteranStacks:80};
  for (const [key,value] of Object.entries(edits)) await app.change('xp-skill-fields', {xpSkillField:key}, value);
  assert.equal(Number(app.elements.get('xp-veteran-stacks').value), 80);
  for (const control of ['tile','team']) {
    if (control === 'tile') await app.click('teams', {suggestTiles:'b'}); else await app.click('optimize');
    await app.flush();
    for (const [key,value] of Object.entries(edits)) assert.equal(app.optimizationCalls.at(-1).settings[key], value);
    assert.deepEqual(app.optimizationCalls.at(-1).settings.requiredHeroes, experienceRequired);
  }
  await app.focus('gold');
  assert.match(app.elements.get('xp-skill-fields').innerHTML, /value="12345"/);
  await app.focus('experience');
  await app.check('xp-skills', false);
  assert.equal(app.evaluationCalls.at(-1).result.experiencePlan.attackerIndex, 0, 'disabling XP skills also disables EXP Share');
  assert.deepEqual(app.evaluationCalls.at(-1).settings.requiredHeroes, experienceRequired);
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported),imported]) {
    assert.equal(restored.state().settings.experienceSkills, false);
    for (const [key,value] of Object.entries(edits)) assert.equal(restored.state().settings[key], value);
  }
});

test('XP contribution summary identifies one ability copy and leaves duplicates as supports', async () => {
  const initial = levelingFixture(); Object.assign(initial.settings,xpProfileDefaults,{snowFort:true});
  initial.focusTeams.experience.teams.b = [slot('militia',1),slot('archer'),slot('archer',15000,false,'skill'),
    slot('ballista'),slot('ballista',15000,false,'skill'),slot('veteran'),slot('veteran',15000,false,'skill')];
  const app = load(initial), text = app.elements.get('xp-skill-summary').textContent;
  for (const [name,index] of [['Archer',3],['Ballista',5],['Veteran',7]]) {
    assert.ok(text.includes(`${name} (ability: slot ${index})`));
    assert.equal((text.match(new RegExp(name + ' \\(ability:', 'g')) || []).length, 1);
  }
  assert.match(app.elements.get('universal-required-roster').textContent, /duplicate copies remain supports/);
  assert.equal(app.evaluationCalls.at(-1).result.experienceSkills.skills.length, 3);
  await app.check('xp-skills', false);
  assert.match(app.elements.get('xp-skill-summary').textContent, /XP skills are disabled/);
  assert.equal(app.evaluationCalls.at(-1).result.experienceSkills.skills.length, 0);
});

test('XP settings, pinned choices and both suggestion controls use the selected boss attacker', async () => {
  const app = load(levelingFixture());
  const result = () => app.evaluationCalls.at(-1).result;
  const plan = () => result().experiencePlan;
  assert.deepEqual([plan().styleId, plan().attackerIndex, plan().shared], ['none', 1, true]);
  assert.match(app.elements.get('teams').innerHTML, /Receives XP from Veteran/);

  await app.change('teams', {xpStyle: 'b'}, 'industrialist');
  assert.equal(app.state().focusTeams.experience.experienceOptions.b.style, 'auto', 'a locked style cannot be selected');
  await app.change('teams', {levelingLevel: 'b'}, 2500);
  await app.change('teams', {xpStyle: 'b'}, 'industrialist');
  await app.change('teams', {xpAttacker: 'b'}, 'self');
  const self = result().metrics.experience;
  assert.deepEqual([plan().styleId, plan().attackerIndex, plan().shared], ['industrialist', 0, false]);
  await app.change('teams', {xpAttacker: 'b'}, 1);
  assert.equal(plan().shared, true);
  assert.equal(result().metrics.experience, result().heroes[1].metrics.experience);
  assert.ok(result().metrics.experience < self, 'the support does not inherit Industrialist’s personal factors');
  await app.change('xp-veteran-stacks', null, 3);
  await app.change('xp-rank-base', null, '6.98T');
  for (const control of ['tiles', 'team']) {
    if (control === 'tiles') await app.click('teams', {suggestTiles: 'b'}); else await app.click('optimize');
    await app.flush();
    const call = app.optimizationCalls.at(-1);
    assert.equal(call.focus, 'experience');
    assert.equal(call.settings.experienceLeveler, 0);
    assert.equal(call.settings.experienceAttacker, 1);
    assert.equal(call.settings.experienceStyle, 'industrialist');
    assert.equal(call.settings.experienceBaseRankXp, 6.98e12);
    assert.equal(call.settings.experienceVeteranStacks, 3);
  }
  const exported = await app.export(), imported = load();
  await imported.import(exported);
  for (const restored of [load(exported), imported]) {
    assert.deepEqual(restored.state(), exported);
    const p = restored.evaluationCalls.at(-1).result.experiencePlan;
    assert.deepEqual([p.levelerIndex, p.attackerIndex, p.styleId, p.shared], [0, 1, 'industrialist', true]);
  }
  await app.change('teams', {levelingLevel: 'b'}, 249);
  assert.equal(plan().styleId, 'none');
  assert.equal(app.state().focusTeams.experience.experienceOptions.b.style, 'auto');
  app.elements.get('all-level').value = '7500';
  await app.click('apply-level');
  assert.deepEqual(app.state().focusTeams.experience.teams.b.map(s => s.level), [249, 7500, 7500, 7500]);
});

test('old Exp Factory picks reset at level 250 and the editor enforces Commander at 300 and Exp Factory at 500', async () => {
  const saved = levelingFixture(), panel = saved.focusTeams.experience;
  panel.teams.b[0].level = 250;
  panel.experienceOptions.b.style = 'expFactory';
  const app = load(saved);
  const style = () => app.state().focusTeams.experience.experienceOptions.b.style;
  assert.equal(style(), 'auto');
  assert.equal(app.evaluationCalls.at(-1).result.experiencePlan.styleId, 'none');
  await app.change('teams', {levelingLevel:'b'}, 299);
  await app.change('teams', {xpStyle:'b'}, 'commander');
  assert.equal(style(), 'auto');
  await app.change('teams', {levelingLevel:'b'}, 300);
  await app.change('teams', {xpStyle:'b'}, 'commander');
  assert.equal(style(), 'commander');
  await app.change('teams', {levelingLevel:'b'}, 499);
  await app.change('teams', {xpStyle:'b'}, 'expFactory');
  assert.equal(style(), 'commander');
  await app.change('teams', {levelingLevel:'b'}, 500);
  await app.change('teams', {xpStyle:'b'}, 'expFactory');
  assert.equal(style(), 'expFactory');
  await app.change('teams', {levelingLevel:'b'}, 499);
  assert.equal(style(), 'auto');
});

test('Magnate unlocks at 4000 and pinned styles persist in exported setups', async () => {
  const app=load(levelingFixture()), option=()=>app.elements.get('teams').innerHTML.match(/data-xp-style="b"[^>]*>(.*?)<\/select>/)[1].match(/<option value="magnate"([^>]*)>/)?.[1];
  await app.change('teams',{levelingLevel:'b'},3999);
  assert.ok(option()?.includes('disabled'));
  await app.change('teams',{xpStyle:'b'},'magnate');
  assert.equal(app.state().focusTeams.experience.experienceOptions.b.style,'auto');
  await app.change('teams',{levelingLevel:'b'},4000);
  assert.ok(option()!==undefined && !option().includes('disabled'));
  await app.change('teams',{xpStyle:'b'},'magnate');
  assert.equal(app.evaluationCalls.at(-1).result.experiencePlan.styleId,'magnate');
  for (const action of ['team','tile']) {
    if(action==='team') await app.click('optimize'); else await app.click('teams',{suggestTiles:'b'});
    await app.flush(); assert.equal(app.optimizationCalls.at(-1).settings.experienceStyle,'magnate');
  }
  const exported=await app.export(),imported=load();await imported.import(exported);
  assert.equal(exported.version,20);
  for(const restored of [load(exported),imported]) {
    assert.equal(restored.state().focusTeams.experience.experienceOptions.b.style,'magnate');
    assert.equal(restored.evaluationCalls.at(-1).result.experiencePlan.styleId,'magnate');
  }
  await app.change('teams',{levelingLevel:'a'},4000);await app.change('teams',{xpStyle:'a'},'magnate');
  await app.check('focus-only',false);
  assert.match(app.elements.get('detail-content').innerHTML,/<td>Energy Income Multiplier<\/td>/);
  await app.change('teams',{levelingLevel:'b'},3999);
  assert.equal(app.state().focusTeams.experience.experienceOptions.b.style,'auto');
  const underleveled=clone(exported);underleveled.focusTeams.experience.teams.b[0].level=3999;
  assert.equal(load(underleveled).state().focusTeams.experience.experienceOptions.b.style,'auto');
});

test('the leveling plan renders and applies a Magnate recommendation beginning at 4000', async () => {
  const saved=levelingFixture();saved.focusTeams.experience.teams.b[1].level=15000;
  const app=load(saved),initial=app.state(),panel=initial.focusTeams.experience;
  const settings={...initial.settings,experienceLeveler:0};
  assert.ok(app.engine.experienceRanges(panel.teams.b,settings).some(range=>range.from===4000 && range.to===4500));
  // Isolate plan rendering/application from optimizer quality, covered by engine tests.
  app.engine.suggestExperienceRange=(raw,config,allowed,level)=>{
    const range=app.engine.experienceRanges(raw,config).find(range=>range.from===level);
    const team=clone(raw);team[config.experienceLeveler].level=level;
    const style=level>=4000?'magnate':'none';
    if (level>=4000) team[1].combatStyle='magnate';
    const evaluated=app.engine.evaluate(team,{...config,experienceStyle:style,experienceAttacker:'self'});
    return {...range,team,style,attackerIndex:config.experienceLeveler,experiencePlan:evaluated.experiencePlan,score:evaluated.metrics.experience,evaluated:1};
  };
  await app.click('xp-plan-build');await app.flush();
  const table=app.elements.get('xp-plan-results').innerHTML;
  assert.match(table,/4,000–4,500/);assert.match(table,/Magnate/);
  assert.deepEqual(app.state(),initial);
  await app.click('xp-plan-results',{xpApply:'1'});
  const after=app.state().focusTeams.experience;
  assert.equal(after.teams.b[0].level,4000);
  assert.equal(after.experienceOptions.b.style,'magnate');
  assert.equal(after.teams.b[1].combatStyle,'magnate');
  assert.deepEqual(after.teams.a,panel.teams.a);
  assert.equal(app.evaluationCalls.at(-1).result.experiencePlan.styleId,'magnate');
});

test('v11 imports keep the selected leveler and current level and introduce automatic XP choices', async () => {
  const old = levelingFixture();
  old.version = 11;
  old.focusTeams.experience.teams.b[0].level = 1499;
  delete old.focusTeams.experience.experienceOptions;
  delete old.settings.experienceBaseRankXp;
  delete old.settings.experienceVeteranStacks;
  const imported = load();
  await imported.import(old);
  for (const restored of [load(old), imported]) {
    const state = restored.state(), panel = state.focusTeams.experience;
    assert.equal(state.version, 20);
    assert.deepEqual(panel.teams, old.focusTeams.experience.teams);
    assert.deepEqual(panel.levelingTargets, old.focusTeams.experience.levelingTargets);
    assert.deepEqual(panel.experienceOptions.b, {style: 'auto', attacker: 'best', supportLevel: 1499, optimizeSupportStyles:true});
    assert.equal(state.settings.experienceBaseRankXp, 100);
    assert.equal(state.settings.experienceVeteranStacks, 100);
  }
});

test('Experience defaults and old default saves use captured account totals while manual overrides remain explicit', async () => {
  const app = load(); await app.focus('experience');
  const reference = app.state().settings.experienceReference;
  assert.deepEqual([reference.rankBonus, reference.superChance, reference.ultraChance], [66000000, 260, 450]);
  assert.match(reference.label, /Wizard|Viking/);
  assert.equal(app.elements.get('xp-reference-mode').value, 'reference');
  assert.equal(app.elements.get('xp-rank-base').disabled, true);
  assert.match(app.elements.get('xp-reference-context').textContent, /510 excess chance points/);
  assert.match(app.elements.get('xp-reference-context').textContent, /×26.5/);
  assert.match(app.elements.get('xp-reference-warning').textContent, /Ultra: modeled team/);
  assert.match(app.elements.get('xp-reference-warning').textContent, /check support levels, event and skill settings/);
  for (const base of [undefined, 100, 66000000]) {
    const old = fixture(); old.version = 13;
    delete old.settings.experienceReference;
    if (base === undefined) delete old.settings.experienceBaseRankXp; else old.settings.experienceBaseRankXp = base;
    const migrated = load(old).state();
    assert.equal(migrated.version, 20);
    assert.equal(!!migrated.settings.experienceReference, base !== 66000000);
    assert.deepEqual(migrated.focusTeams, old.focusTeams);
  }
  const explicit = fixture(); explicit.version = 13; explicit.settings.experienceReference = null;
  assert.equal(load(explicit).state().settings.experienceReference, null);
  await app.change('xp-reference-mode', null, 'manual');
  await app.change('xp-rank-base', null, '6.98T');
  const exported = await app.export();
  assert.equal(load(exported).state().settings.experienceReference, null);
  assert.equal(load(exported).state().settings.experienceBaseRankXp, 6.98e12);
});

test('capturing displayed XP totals preserves the measured team and routes the account reference to every XP search', async () => {
  const app = load(levelingFixture());
  await app.change('xp-reference-mode', null, 'reference');
  await app.change('xp-reference-rank', null, '+66,000,000');
  await app.change('xp-reference-super', null, '350');
  await app.change('xp-reference-ultra', null, '325');
  await app.change('teams', {levelingLevel:'b'}, 1500);
  await app.change('teams', {xpStyle:'b'}, 'expFactory');
  await app.change('teams', {xpAttacker:'b'}, 'self');
  await app.check('xp-reference-all-gm', false);
  await app.click('xp-reference-b');
  const captured = app.state().settings.experienceReference;
  assert.match(captured.label, /Team B/);
  assert.equal(captured.styleId, 'expFactory');
  assert.equal(captured.attackerIndex, 0);
  assert.deepEqual([captured.rankBonus,captured.superChance,captured.ultraChance], [66000000,350,325]);
  assert.deepEqual(captured.team, app.state().focusTeams.experience.teams.b);
  assert.ok(Number.isFinite(captured.rankFlat) && Number.isFinite(captured.modeledSuperChance));
  await app.change('teams', {levelingLevel:'b'}, 2500);
  assert.deepEqual(app.state().settings.experienceReference, captured, 'changing the candidate does not move the recorded baseline');
  for (const control of ['tiles', 'team']) {
    if (control === 'tiles') await app.click('teams', {suggestTiles:'b'}); else await app.click('optimize');
    await app.flush();
    assert.deepEqual(app.optimizationCalls.at(-1).settings.experienceReference, captured);
  }
  const rangeSettings = [], suggestRange = app.engine.suggestExperienceRange;
  app.engine.suggestExperienceRange = (team, settings, ...rest) => {
    rangeSettings.push(clone(settings));
    return suggestRange(team, settings, ...rest);
  };
  await app.click('xp-plan-build'); await app.flush();
  assert.ok(rangeSettings.length > 1);
  for (const settings of rangeSettings) assert.deepEqual(settings.experienceReference, captured);
  await app.click('xp-plan-results', {xpCompare:'0'});
  assert.match(app.elements.get('xp-plan-results').innerHTML, /Total Super \/ Ultra EXP chance/);
  assert.match(app.elements.get('xp-plan-results').innerHTML, /Chance above the 100% caps/);
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(restored.state().settings.experienceReference, captured);
  await app.click('xp-reference-a');
  assert.match(app.state().settings.experienceReference.label, /Team A/);
  assert.deepEqual(app.state().settings.experienceReference.team, app.state().focusTeams.experience.teams.a);
});

test('XP reference edits reject invalid totals and malformed imported captures without replacing the working setup', async () => {
  const app = load(); await app.focus('experience');
  const reference = app.state().settings.experienceReference;
  for (const [id, value] of [['xp-reference-rank','nope'], ['xp-reference-super',-1], ['xp-reference-ultra','Infinity']]) {
    await app.change(id, null, value);
    assert.deepEqual(app.state().settings.experienceReference, reference);
    assert.equal(app.elements.get('alert').hidden, false);
  }
  const invalid = app.state(); invalid.settings.experienceReference = {rankBonus:66000000};
  const before = app.state(); await app.import(invalid);
  assert.deepEqual(app.state(), before);
  assert.match(app.elements.get('alert').textContent, /reference is invalid/);
});

test('reported pre-team Gold and Damage chance defaults migrate once and keep independent references', async () => {
  const app = load(), references = app.state().settings.chanceReferences;
  assert.deepEqual(references.gold.totals, [50,50]);
  assert.deepEqual(references.damage.totals, [135,109,48]);
  assert.deepEqual(references.damageBuffSwap.totals, [135,109,48]);
  for (const ref of Object.values(references)) {
    assert.equal(ref.mode, 'preTeam'); assert.equal(ref.extraOverflow, 0);
    assert.ok(ref.contributions.every(value => value === 0));
  }
  const old = fixture(); old.version = 14;
  assert.deepEqual(load(old).state().settings.chanceReferences, references);
  const custom = fixture(); custom.version = 14;
  custom.settings.chanceReferences.gold = {mode:'preTeam',totals:[222,333],contributions:[0,0],extraOverflow:25,label:'Custom'};
  assert.deepEqual(load(custom).state().settings.chanceReferences.gold, custom.settings.chanceReferences.gold);
  assert.equal(load(fixture()).state().settings.chanceReferences.gold, null, 'an explicit v15 assumed-mode choice persists');
  await app.focus('gold');
  assert.equal(app.elements.get('chance-reference').hidden, false);
  assert.equal(app.elements.get('chance-reference-mode').value, 'preTeam');
  assert.equal(app.elements.get('chance-reference-super').value, '50');
  assert.equal(app.elements.get('chance-reference-crit-field').hidden, true);
  await app.focus('damage');
  assert.equal(app.elements.get('chance-reference-crit').value, '135');
  assert.equal(app.elements.get('chance-reference-crit-field').hidden, false);
  await app.focus('experience'); assert.equal(app.elements.get('chance-reference').hidden, true);
});

test('chance inputs keep zero totals, separate caps and reference-specific extra spillover', async () => {
  const initial = fixture(); initial.focus = 'gold'; initial.settings.baseOverflow = 200;
  initial.settings.goldSkills = initial.settings.damageSkills = initial.settings.damageSupportSkills = false;
  for (const focus of ['gold','damage']) {
    initial.focusTeams[focus].teams = {a:[slot('archer',0)],b:[slot('archer',0)]};
    initial.focusTeams[focus].attackers = {a:0,b:0};
  }
  const app = load(initial);
  await app.change('chance-reference-mode', null, 'preTeam');
  assert.equal(app.state().settings.chanceReferences.gold, null, 'pending inputs do not invent a baseline');
  await app.change('chance-reference-super', null, 0);
  await app.change('chance-reference-ultra', null, 0);
  await app.change('chance-reference-extra', null, 25);
  await app.click('chance-reference-apply');
  let call = app.evaluationCalls.at(-1);
  assert.equal(call.result.heroes[0].overflow.gold, 1.25, 'the shared +200% does not add again');
  assert.match(app.elements.get('chance-reference-report').innerHTML, /data-chance-total-0="b" title="0"/);
  assert.match(app.elements.get('chance-reference-warning').textContent, /below 100%/);
  assert.deepEqual(app.state().settings.chanceReferences.gold.totals, [0,0]);
  await app.focus('damage');
  await app.change('chance-reference-mode', null, 'preTeam');
  for (const [id,value] of [['crit',135],['super',109],['ultra',48]]) await app.change('chance-reference-' + id, null, value);
  await app.click('chance-reference-apply');
  call = app.evaluationCalls.at(-1);
  assert.equal(call.result.heroes[0].overflow.damage, 3.2, '35 + 9 + 0 excess points at five percent');
  assert.match(app.elements.get('chance-reference-report').innerHTML, /data-chance-excess="b" title="44"/);
  assert.deepEqual(app.state().settings.chanceReferences.gold.totals, [0,0]);
  assert.equal(app.state().settings.chanceReferences.gold.extraOverflow, 25);
  await app.change('chance-reference-mode', null, 'legacy');
  assert.equal(app.state().settings.chanceReferences.damage, null);
  assert.match(app.elements.get('chance-reference-context').textContent, /assumes every tier is already at 100%/);
  assert.equal(app.evaluationCalls.at(-1).result.heroes[0].overflow.damage, 3);
});

test('recorded chance captures freeze contributions and persist separately for Gold, Damage and Buff swap', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams.b = ['hunter','rogue','sovereign','crusader'].map(id => slot(id));
  initial.focusTeams.gold.attackers.b = 3;
  const app = load(initial), captures = {};
  for (const [focus,totals] of [['gold',[600,700]],['damage',[140,160,190]],['damageBuffSwap',[240,260,290]]]) {
    await app.focus(focus);
    await app.change('chance-reference-mode', null, 'recorded');
    const ids = focus === 'gold' ? ['super','ultra'] : ['crit','super','ultra'];
    for (let i=0;i<ids.length;i++) await app.change('chance-reference-' + ids[i], null, totals[i]);
    await app.click('chance-reference-b');
    captures[focus] = app.state().settings.chanceReferences[focus];
    assert.equal(captures[focus].mode, 'recorded');
    assert.deepEqual(captures[focus].totals, totals);
    assert.deepEqual(captures[focus].team, app.state().focusTeams[focus].teams.b);
    assert.equal(captures[focus].attackerIndex, app.state().focusTeams[focus].attackers.b);
    if (focus !== 'gold') assert.equal(captures[focus].captureSettings.damageSupportMode, focus === 'damage' ? 'all' : 'debuffs');
    await app.change('teams', {level:'b:0'}, 1234);
    assert.deepEqual(app.state().settings.chanceReferences[focus], captures[focus]);
    await app.click('teams', {suggestTiles:'b'}); await app.flush();
    assert.deepEqual(app.optimizationCalls.at(-1).settings.chanceReferences[focus], captures[focus]);
  }
  await app.focus('gold'); await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.at(-1).settings.chanceReferences.gold, captures.gold);
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(restored.state().settings.chanceReferences, captures);
  await app.change('chance-reference-super', null, 650); await app.click('chance-reference-apply');
  const edited = app.state().settings.chanceReferences.gold;
  assert.deepEqual(edited.team, captures.gold.team);
  assert.deepEqual(edited.contributions, captures.gold.contributions);
  assert.deepEqual(edited.totals, [650,700]);
});

test('chance reference inputs and imports reject missing or malformed captures without changing applied values', async () => {
  const app = load(fixture()); await app.focus('gold');
  await app.change('chance-reference-mode', null, 'preTeam');
  await app.click('chance-reference-apply');
  assert.match(app.elements.get('alert').textContent, /Enter every chance/);
  assert.equal(app.state().settings.chanceReferences.gold, null);
  await app.change('chance-reference-super', null, -1);
  await app.change('chance-reference-ultra', null, 200);
  await app.click('chance-reference-apply');
  assert.equal(app.state().settings.chanceReferences.gold, null);
  const before = app.state(), invalid = clone(before);
  invalid.settings.chanceReferences.damageBuffSwap = {mode:'recorded',totals:[135,109,48]};
  await app.import(invalid);
  assert.deepEqual(app.state(), before);
  assert.match(app.elements.get('alert').textContent, /chance reference is invalid/);
});

test('drafting another chance mode keeps the active baseline and best attacker until apply or capture', async () => {
  const initial = fixture(); initial.focus = 'damage';
  initial.settings.chanceReferences.damage = {mode:'preTeam',totals:[135,109,48],contributions:[0,0,0],extraOverflow:0,label:'Before heroes'};
  initial.focusTeams.damage.teams.b = [slot('praetorian'),slot('deadeye')];
  initial.focusTeams.damage.attackers.b = null;
  const app = load(initial), before = app.state(), baseline = before.settings.chanceReferences.damage;
  const score = app.evaluationCalls.at(-1).result.metrics.damage;
  const best = bestIndex(app.engine,before.focusTeams.damage.teams.b,before.settings,'damage');
  assert.equal(before.focusTeams.damage.attackers.b, best);
  await app.change('chance-reference-mode', null, 'recorded');
  assert.deepEqual(app.state().settings.chanceReferences.damage, baseline);
  assert.equal(app.evaluationCalls.at(-1).result.metrics.damage, score);
  assert.match(app.elements.get('chance-reference-context').textContent, /Current pre-team reference remains active/);
  for (const [id,value] of [['crit',200],['super',250],['ultra',300]]) await app.change('chance-reference-' + id, null, value);
  await app.focus('gold'); await app.focus('damage');
  assert.equal(app.elements.get('chance-reference-crit').value, '200', 'draft survives focus changes');
  assert.deepEqual(app.state().settings.chanceReferences.damage, baseline);
  assert.equal(app.evaluationCalls.at(-1).result.metrics.damage, score);
  await app.click('chance-reference-b');
  const captured = app.state().settings.chanceReferences.damage;
  assert.equal(captured.mode, 'recorded'); assert.equal(captured.attackerIndex, best);
  assert.deepEqual(captured.totals, [200,250,300]);
  await app.change('chance-reference-mode', null, 'preTeam');
  assert.deepEqual(app.state().settings.chanceReferences.damage, captured);
  assert.match(app.elements.get('chance-reference-context').textContent, /Current recorded team reference remains active/);
  await app.click('chance-reference-apply');
  assert.equal(app.state().settings.chanceReferences.damage.mode, 'preTeam');
  assert.deepEqual(app.state().settings.chanceReferences.damage.contributions, [0,0,0]);
});

test('XP can capture all heroes on Grand Master without changing the leveling plan combat style', async () => {
  const app = load(levelingFixture());
  await app.change('xp-reference-mode', null, 'reference');
  await app.change('teams', {levelingLevel:'b'}, 1500);
  await app.change('teams', {xpStyle:'b'}, 'expFactory');
  await app.check('xp-reference-all-gm', true);
  const before = app.state().focusTeams.experience.experienceOptions.b;
  await app.click('xp-reference-b');
  const reference = app.state().settings.experienceReference;
  assert.equal(reference.styleId, 'grandMaster');
  assert.equal(reference.grandMasterCount, app.state().focusTeams.experience.teams.b.length);
  assert.deepEqual(app.state().focusTeams.experience.experienceOptions.b, before);
  assert.equal(app.evaluationCalls.at(-1).result.experiencePlan.styleId, 'expFactory');
  assert.equal(load(await app.export()).state().settings.experienceReference.styleId, 'grandMaster');
});

test('only the original default XP capture upgrades to the confirmed Archer 5000 ten-GM context', () => {
  const seed = load(), initial = fixture(); initial.version = 14;
  const team = [['viking','normal'],['archer','normal'],['wizard','synergy'],['veteran','skill'],
    ['ranger','milestone'],['ballista','milestone'],['ballista','milestone'],['veteran','synergy'],
    ['templar','normal'],['veteran','synergy']].map(([id,tile]) => slot(id,id === 'archer' ? 1500 : 15000,false,tile));
  const original = clone(seed.engine.captureExperienceReference(team,
    {experienceLeveler:1,experienceAttacker:'self',experienceStyle:'expFactory',synergyEvent:true,experienceVeteranSuperChance:106.2,experienceVeteranShareChance:258,experienceVeteranSuperAmountPerStack:16.3},
    {rankBonus:66000000,superChance:300,ultraChance:300},
    'Archer 1,500 + Wizard/Viking · supports 15,000 · Exp Factory · event on · Veteran 100 stacks'));
  original.modeledSuperChance = 220.01931970234375;
  initial.settings.experienceReference = original;
  const upgraded = load(initial).state().settings.experienceReference;
  assert.equal(upgraded.styleId, 'grandMaster');
  assert.deepEqual([upgraded.superChance,upgraded.ultraChance], [260,450]);
  initial.settings.experienceReference = {...original,rankBonus:66000001};
  assert.deepEqual(load(initial).state().settings.experienceReference, initial.settings.experienceReference);
});

test('Damage chance report averages Dicemaster excess after each roll crosses the cap', () => {
  const initial = fixture(); initial.focus = 'damage';
  Object.assign(initial.settings,{damageSkills:true,damageSupportSkills:false,damageDicemasterCritMin:0,damageDicemasterCritMax:200,
    damageDicemasterSuperCritMin:0,damageDicemasterSuperCritMax:0,damageDicemasterUltraCritMin:0,damageDicemasterUltraCritMax:0,damageDicemasterMaxRollChance:0});
  initial.settings.chanceReferences.damage = {mode:'preTeam',totals:[0,0,0],contributions:[0,0,0],extraOverflow:0,label:'Zero baseline'};
  initial.focusTeams.damage.teams = {a:[slot('dicemaster',0)],b:[slot('dicemaster',0)]};
  initial.focusTeams.damage.attackers = {a:0,b:0};
  const app = load(initial), hero = app.evaluationCalls.at(-1).result.heroes[0];
  assert.equal(hero.overflow.damage, 2.25);
  assert.match(app.elements.get('chance-reference-report').innerHTML, /data-chance-factor="b" title="2.25"/);
  assert.match(app.elements.get('chance-reference-report').innerHTML, /data-chance-excess="b" title="25"/);
  assert.match(app.elements.get('chance-reference-warning').textContent, /averaged after applying the caps to each roll/);
});

test('a fixed Veteran attacker and fixed leveler permit a suggestion with no optional supports', async () => {
  const initial = levelingFixture();
  initial.focusTeams.experience.teams.b[1].locked = false;
  const app = load(initial);
  await app.change('teams', {xpAttacker: 'b'}, 1);
  await app.click('roster-none');
  await app.click('optimize'); await app.flush();
  assert.equal(app.elements.get('alert').hidden, true);
  const call = app.optimizationCalls.at(-1);
  assert.equal(call.method, 'optimizeTeam');
  assert.deepEqual(call.allowed, []);
  assert.equal(call.settings.experienceLeveler, 0);
  assert.equal(call.settings.experienceAttacker, 1);
  assert.deepEqual(app.state().focusTeams.experience.teams.b, initial.focusTeams.experience.teams.b);
});

test('the route groups score-only changes and applies a recommendation outside the current levels at its start', async () => {
  const app = load(levelingFixture());
  await app.change('teams', {xpStyle: 'b'}, 'none');
  await app.change('teams', {xpAttacker: 'b'}, 'self');
  const initial = app.state(), panel = initial.focusTeams.experience, leveler = panel.levelingTargets.b;
  const config = {...initial.settings, experienceLeveler: leveler};
  const ranges = app.engine.experienceRanges(panel.teams.b, config);
  const expected = app.engine.suggestExperienceRange(panel.teams.b, config, initial.allowed, 2500);
  await app.click('xp-plan-build');
  await app.flush();
  const table = app.elements.get('xp-plan-results').innerHTML;
  assert.deepEqual(app.state(), initial, 'previewing the route leaves the teams as configured');
  assert.ok(ranges.length > 3, 'this fixture has internal unlocks without a new action');
  assert.equal((table.match(/data-xp-apply=/g) || []).length, 3);
  for (const span of ['1–499','500–2,499','2,500–4,500']) assert.ok(table.includes(span), span);
  assert.match(table,/259\.71–519\.42/,'a payout change appears within its recommendation');
  assert.match(app.elements.get('xp-plan-status').textContent, /3 recommendations/);
  assert.match(table, /Via Veteran’s Exp Share/);
  assert.match(table, /Industrialist/);
  // Previewing a later payout inside the final recommendation does not change
  // the level used when adopting it from an earlier part of the climb.
  await app.click('xp-plan-results', {xpCompare: '2'});
  await app.change('xp-plan-results', {xpPreview: '2'}, 4499);
  await app.click('xp-plan-results', {xpApply: '2'});
  const updated = app.state().focusTeams.experience;
  assert.deepEqual(updated.teams.b, clone(expected.team));
  assert.deepEqual(updated.teams.a, panel.teams.a);
  assert.equal(updated.teams.b[leveler].level, 2500);
  assert.equal(updated.experienceOptions.b.style, expected.style);
  assert.equal(updated.attackers.b, expected.attackerIndex);
  assert.equal(updated.levelingTargets.b, leveler);
  assert.equal(app.evaluationCalls.at(-1).result.metrics.experience, expected.score);
});

test('grouped comparisons use the current stage, allow payout previews, and apply at the actual level', async () => {
  const initial = levelingFixture();
  initial.focusTeams.experience.teams.b[0].level = 1200;
  const app = load(initial);
  const saved = app.state(), panel = saved.focusTeams.experience;
  const index = 1;
  await app.click('xp-plan-build');
  await app.flush();
  const results = app.elements.get('xp-plan-results');
  assert.ok(results.innerHTML.includes(`data-xp-compare="${index}"`));
  const detail = `data-xp-comparison="${index}"`;
  assert.ok(!results.innerHTML.includes(detail));
  await app.click('xp-plan-results', {xpCompare: String(index)});
  assert.ok(results.innerHTML.includes(detail));
  const expanded = () => results.innerHTML.split(detail)[1].split('</table>')[0];
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.match(text(expanded()), /Level 1,000 unlock \+100%/);
  assert.match(text(expanded()), /Boss kills at levels 1,000–1,249/);
  assert.match(text(expanded()), /519\.42/,'level 1,200 receives both Boss XP bonuses');
  assert.match(results.innerHTML, /data-xp-preview="1"/);
  await app.change('xp-plan-results', {xpPreview: String(index)}, 560);
  const comparison = expanded();
  assert.match(text(comparison), /Boss kills at levels 500–999/);
  const factors = Object.fromEntries(Array.from(comparison.matchAll(/<tr><th scope="row">([^<]+)<\/th>(.*?)<\/tr>/gs),
    ([, label, row]) => [label, Array.from(row.matchAll(/<td>(.*?)<\/td>/gs), cell => text(cell[1]))]));
  // Militia contributes +8 flat Rank XP. Both boss sources double the kill,
  // and Veteran supplies ×17.3 Super XP Amount to either attacker.
  assert.match(text(comparison), /Militia · Slot 1 Leveler attacks Veteran · Slot 2 Via Exp Share/);
  assert.deepEqual(factors['Personal Boss XP'], ['×2 Exp Factory +100%', '×2 Level 1,000 unlock +100%']);
  assert.deepEqual(factors['Personal EXP chance'], ['Super +10 pp · Ultra +3 pp', 'Super +0 pp · Ultra +0 pp']);
  assert.deepEqual(factors['Chance spillover'], ['×6.95', '×6.3']);
  assert.deepEqual(factors['XP received per boss'], ['259.71', '235.42'],
    'self and shared XP both receive one complete kill payout with Veteran’s 258% share chance capped at 100%');
  assert.deepEqual(app.state(), saved, 'inspecting payouts leaves levels and teams intact');
  await app.click('xp-plan-results', {xpApply: String(index)});
  const applied = app.state().focusTeams.experience;
  assert.equal(applied.teams.b[0].level, 1200, 'applying while previewing 560 preserves the leveler’s current progress');
  assert.equal(applied.teams.b[1].locked,true);
  assert.deepEqual(applied.teams.a, panel.teams.a);
  assert.equal(applied.experienceOptions.b.style,'expFactory');
  assert.equal(applied.attackers.b,0);
  const expected = app.engine.suggestExperienceRange(panel.teams.b,{...saved.settings,experienceLeveler:0},saved.allowed,1200);
  assert.equal(app.evaluationCalls.at(-1).result.metrics.experience,expected.score);
});

test('canceling a partial plan or editing its inputs prevents queued ranges from reappearing', async () => {
  const app = load(levelingFixture());
  for (const action of ['cancel', 'edit']) {
    await app.click('xp-plan-build');
    await app.step();
    assert.match(app.elements.get('xp-plan-results').innerHTML, /data-xp-apply="0"/);
    if (action === 'cancel') await app.click('xp-plan-build');
    else await app.change('teams', {level: 'b:1'}, 812);
    await app.flush();
    assert.equal(app.elements.get('xp-plan-results').innerHTML, '');
    assert.match(app.elements.get('xp-plan-build').textContent, /Plan levels/);
  }
  await app.click('xp-plan-build'); await app.flush();
  assert.match(app.elements.get('xp-plan-status').textContent, /3 recommendations/);
  await app.change('xp-veteran-stacks', null, 0);
  assert.equal(app.elements.get('xp-plan-results').innerHTML, '');
  const before = app.state();
  await app.click('xp-plan-results', {xpApply: '0'});
  assert.deepEqual(app.state(), before);
});

test('streaming extends an open recommendation and applies the matching underlying lineup and attacker', async () => {
  const saved = levelingFixture();
  const panel = saved.focusTeams.experience;
  panel.teams.b = [slot('militia',150),slot('veteran',1000),slot('scout',1000)];
  const app = load(saved), results = app.elements.get('xp-plan-results');
  // At level 100 the solver changes only the slot order. At 300 the support
  // changes to Ranger, which requires an action in the game.
  const stages = [
    {from:1,to:99,supports:['veteran','scout']},
    {from:100,to:299,supports:['scout','veteran']},
    {from:300,to:4500,supports:['ranger','veteran']}
  ];
  app.engine.experienceRanges = () => stages.map(({from,to})=>({from,to}));
  app.engine.suggestExperienceRange = (_previousTeam,settings,_allowed,level) => {
    const {from,to,supports} = stages.find(stage=>stage.from===level);
    const team = [slot('militia',level),...supports.map(id=>slot(id,1000))];
    const attackerIndex = team.findIndex(member=>member.id==='veteran');
    const evaluation = app.engine.evaluate(team,{...settings,experienceAttacker:attackerIndex,experienceStyle:'none'});
    return {from,to,team,attackerIndex,style:'none',score:evaluation.metrics.experience,
      experiencePlan:evaluation.experiencePlan,attackerComparison:app.engine.compareExperienceAttackers(evaluation)};
  };
  await app.click('xp-plan-build');
  await app.step();
  await app.click('xp-plan-results',{xpCompare:'0'});
  assert.ok(results.innerHTML.includes('data-xp-comparison="0"'));
  await app.step();
  assert.equal((results.innerHTML.match(/data-xp-apply=/g)||[]).length,1);
  assert.ok(results.innerHTML.includes('1–299'));
  assert.ok(results.innerHTML.includes('data-xp-comparison="0"'),'new stages keep the comparison open');
  await app.flush();
  assert.equal((results.innerHTML.match(/data-xp-apply=/g)||[]).length,2);
  assert.match(app.elements.get('xp-plan-status').textContent,/2 recommendations/);
  await app.click('xp-plan-results',{xpApply:'0'});
  const updated = app.state().focusTeams.experience;
  assert.deepEqual(updated.teams.b,[slot('militia',150),slot('scout',1000),slot('veteran',1000)]);
  assert.equal(updated.attackers.b,2,'the Veteran moves with the stage-specific slot order');
  assert.equal(updated.experienceOptions.b.attacker,2);
});


test('version 3 Gold migration chooses the strongest Hunter copy for A and best Gold attacker for B', () => {
  const old = fixture(); old.version = 3; old.focus = 'gold'; old.settings.baseEnergy = 1;
  old.focusTeams.gold.teams = {
    a: [slot('hunter', 5999), slot('paladin', 15000), slot('hunter', 6000)],
    b: [slot('hunter', 6000), slot('militia', 6000), slot('paladin', 6000)]
  };
  old.focusTeams.gold.attackers = {a: 1, b: 1}; old.focusTeams.gold.chooseAttacker = true;
  const app = load(old), saved = app.state(), gold = saved.focusTeams.gold;
  assert.equal(saved.version, 20);
  assert.equal(saved.settings.baseEnergy, 1, 'version 3 explicit base energy must survive Gold migration');
  assert.equal(gold.attackers.a, 2, 'Hunter is preferred and the copy with unlocked personal Gold milestone wins');
  assert.equal(gold.attackers.b, 0, 'B selects highest Gold index, not its previously unused damage-based slot');
  assert.equal(gold.chooseAttacker, false, 'an old unused Gold option must not silently enable replacement');
  assert.deepEqual(gold.teams, old.focusTeams.gold.teams);
  assert.deepEqual(gold.names, old.focusTeams.gold.names);
  for (const focus of ['energy', 'damage']) assert.deepEqual(saved.focusTeams[focus], old.focusTeams[focus]);
  assert.deepEqual(saved.focusTeams.experience.teams, old.focusTeams.experience.teams);
  assert.deepEqual(saved.focusTeams.experience.levelingTargets, saved.focusTeams.experience.attackers);
  assert.equal(app.elements.get('migration-notice').hidden, false);
});

test('Gold migration without Hunter uses the strongest Gold recipient and version 4 preserves explicit choices', () => {
  const old = fixture(); old.version = 3; old.focus = 'gold';
  old.focusTeams.gold.teams = {a: [slot('militia', 25), slot('paladin', 25)], b: []};
  old.focusTeams.gold.attackers = {a: 0, b: 1};
  const migrated = load(old).state();
  assert.deepEqual(migrated.focusTeams.gold.attackers, {a: 1, b: null});
  const current = fixture(); current.version = 4; current.focus = 'gold';
  current.focusTeams.gold.teams.a = [slot('hunter', 6000), slot('paladin', 6000)];
  current.focusTeams.gold.attackers.a = 1;
  current.focusTeams.gold.chooseAttacker = true;
  const app = load(current);
  assert.equal(app.state().focusTeams.gold.attackers.a, 1, 'a deliberate version 4 choice must not be reset to Hunter');
  assert.equal(app.state().focusTeams.gold.chooseAttacker, true);
});

test('Gold uses the same attacker for all kill stats and other focuses retain their own selection', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 6000), slot('scout', 6000)],
    b: [slot('paladin', 6000), slot('hunter', 6000)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 1};
  const app = load(initial);
  const [a, b] = app.evaluationCalls.slice(-2);
  assert.equal(a.settings.goldHero, 0); assert.equal(b.settings.goldHero, 1);
  for (const call of [a, b]) {
    assertSingleAttacker(call, call.settings.goldHero);
  }
  assert.notEqual(a.result.metrics.gold, a.result.heroes.reduce((sum, hero) => sum + hero.metrics.gold / 2, 0));
  assert.match(app.elements.get('teams').innerHTML, /data-attacker="a"/);
  assert.match(app.elements.get('teams').innerHTML, /data-attacker="b"/);
  await app.change('teams', {attacker: 'a'}, 1);
  assert.equal(app.state().focusTeams.gold.attackers.a, 1);
  assert.equal(app.evaluationCalls.at(-2).settings.goldHero, 1);
  for (const focus of ['energy', 'damage', 'experience']) {
    await app.focus(focus);
    for (const [index, call] of app.evaluationCalls.slice(-2).entries()) assertSingleAttacker(call, app.state().focusTeams[focus].attackers[index ? 'b' : 'a']);
  }
  await app.focus('gold');
  assert.deepEqual(app.state().focusTeams.gold.attackers, {a: 1, b: 1});
});

test('Gold fixed and automatic suggestions route the right objective and choose by Gold rather than Damage', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 6000), slot('scout', 6000)],
    b: [slot('militia', 6000), slot('hunter', 6000)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 1};
  const app = load(initial), before = app.state().focusTeams.gold;
  assert.equal(app.elements.get('attacker-search-option').hidden, false);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.map(call => [call.method, call.focus, call.settings.goldHero]),
    [['optimizePlacements', 'gold', 0], ['optimizeTeam', 'gold', 1]]);
  await app.check('choose-attacker', true);
  assert.deepEqual(app.state().focusTeams.gold.attackers, before.attackers);
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.goldHero, 1, 'auto mode affects lineup search, not tile-only search');
  app.suggest([slot('militia', 25), slot('paladin', 25)]);
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.goldHero, 'best');
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, before.attackers.b);
  const gold = app.state().focusTeams.gold;
  assert.equal(gold.attackers.b, 1);
  assert.equal(gold.teams.b[gold.attackers.b].id, 'paladin');
  assert.deepEqual(gold.teams.a, before.teams.a);
  assert.equal(gold.attackers.a, before.attackers.a);
  const scored = app.evaluationCalls.at(-1);
  assert.equal(scored.settings.goldHero, 1);
  assert.equal(scored.result.metrics.gold, scored.result.heroes[1].metrics.gold);
  assert.ok(scored.result.heroes[0].metrics.damage > scored.result.heroes[1].metrics.damage, 'fixture distinguishes Gold from Damage choice');
  await app.focus('damage');
  assert.equal(app.elements.get('choose-attacker').checked, false, 'Gold automatic choice is independent of Damage');
});

test('Gold attacker copy, swap, removal and fallback preserve the intended recipient', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams = {
    a: [slot('militia', 25), slot('hunter', 6000), slot('paladin', 25)],
    b: [slot('paladin', 25), slot('militia', 25)]
  };
  initial.focusTeams.gold.attackers = {a: 1, b: 0};
  const app = load(initial);
  await app.click('swap-teams');
  assert.deepEqual(app.state().focusTeams.gold.attackers, {a: 0, b: 1});
  await app.click('teams', {remove: 'b:0'});
  assert.equal(app.state().focusTeams.gold.attackers.b, 0);
  assert.equal(app.state().focusTeams.gold.teams.b[0].id, 'hunter');
  await app.click('teams', {remove: 'b:0'});
  assert.equal(app.state().focusTeams.gold.attackers.b, 0);
  assert.equal(app.state().focusTeams.gold.teams.b[0].id, 'paladin');
  await app.click('copy-team');
  assert.deepEqual(app.state().focusTeams.gold.attackers, {a: 0, b: 0});
  assert.deepEqual(app.state().focusTeams.gold.teams.a, app.state().focusTeams.gold.teams.b);
  await app.click('teams', {remove: 'b:0'});
  assert.equal(app.state().focusTeams.gold.teams.b[app.state().focusTeams.gold.attackers.b].id, 'militia');
  await app.click('teams', {remove: 'b:0'});
  assert.equal(app.state().focusTeams.gold.attackers.b, null);
});

test('Gold attacker removal and invalid saved slots recover by Gold score rather than Damage score', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 6000), slot('militia', 25), slot('paladin', 25)],
    b: [slot('militia', 25), slot('paladin', 25)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 99};
  const app = load(initial);
  assert.equal(app.state().focusTeams.gold.attackers.b, 1);
  await app.click('teams', {remove: 'a:0'});
  assert.equal(app.state().focusTeams.gold.attackers.a, 1);
  assert.equal(app.state().focusTeams.gold.teams.a[1].id, 'paladin');
});

test('Gold attacker selections and automatic search survive focus changes, reload and export/import', async () => {
  const initial = fixture(); initial.focus = 'gold';
  initial.focusTeams.gold.teams.a = [slot('hunter', 6000), slot('paladin', 25)];
  initial.focusTeams.gold.attackers = {a: 0, b: 0};
  const app = load(initial);
  await app.change('teams', {attacker: 'a'}, 1);
  await app.change('teams', {attacker: 'b'}, 1);
  await app.check('choose-attacker', true);
  await app.focus('experience');
  const exported = await app.export();
  assert.equal(exported.version, 20);
  const reloaded = load(exported), imported = load(); await imported.import(exported);
  for (const saved of [reloaded, imported]) {
    assert.deepEqual(saved.state(), exported);
    await saved.focus('gold');
    assert.deepEqual(saved.state().focusTeams.gold.attackers, {a: 1, b: 1});
    assert.equal(saved.elements.get('choose-attacker').checked, true);
    assert.equal(saved.evaluationCalls.at(-2).settings.goldHero, 1);
    assert.equal(saved.evaluationCalls.at(-1).settings.goldHero, 1);
  }
});

test('Gold comparison explains selected attacker factors and hides outside the Gold focus', async () => {
  const initial = fixture(); initial.focus = 'gold'; initial.settings.maxTier = 9;
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 10000), slot('rogue', 10000), slot('scout', 10000)],
    b: [slot('paladin', 10000), slot('hunter', 10000), slot('rogue', 10000)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 0};
  const app = load(initial), table = app.elements.get('gold-comparison');
  assert.equal(table.hidden, false);
  for (const label of ['Hunter', 'Paladin', 'Kill Gold', 'Boss Gold', 'Super Gold Amount', 'Ultra Gold Amount']) assert.ok(table.innerHTML.includes(label), `Gold breakdown should include ${label}`);
  assert.match(table.innerHTML, /spillover/i);
  for (const [index, call] of app.evaluationCalls.slice(-2).entries()) {
    const hero = call.result.heroes[call.settings.goldHero], key = index ? 'b' : 'a';
    const expected = (hero.bonuses['Kill Gold'] ?? 1) * (hero.bonuses['Boss Gold'] ?? 1) * (hero.bonuses['Super Gold Amount'] ?? 1)
      * (hero.bonuses['Ultra Gold Amount'] ?? 1) * hero.overflow.gold;
    assert.equal(call.result.metrics.gold, expected);
    assert.ok(hero.bonuses['Boss Gold'] > 1, 'fixture must activate a genuine global Boss Gold multiplier');
    const payouts = [(hero.bonuses['Kill Gold'] ?? 1) * (hero.bonuses['Boss Gold'] ?? 1)];
    payouts.push(payouts[0] * (hero.bonuses['Super Gold Amount'] ?? 1));
    payouts.push(payouts[1] * (hero.bonuses['Ultra Gold Amount'] ?? 1));
    for (const [tier, actual] of payouts.entries()) {
      const cell = table.innerHTML.match(new RegExp(`data-gold-payout="${key}:${tier}" title="([^"]+)"`));
      assert.ok(cell, `${key} tier ${tier} should expose its cumulative payout index`);
      const shown = Number(cell[1].replaceAll(',', ''));
      assert.ok(Math.abs(shown - actual) <= 1e-6 * Math.max(1, Math.abs(actual)), `${key} tier ${tier} includes preceding payout tiers but not chance spillover`);
    }
    assert.ok(Math.abs(payouts[2] * hero.overflow.gold - expected) <= 1e-12 * Math.max(1, expected));
    for (const type of ['Kill Gold', 'Boss Gold', 'Super Gold Amount', 'Ultra Gold Amount', 'spillover']) {
      const cell = table.innerHTML.match(new RegExp(`data-gold-factor="${key}:${type}" title="([^"]+)"`));
      assert.ok(cell, `${key} ${type} should expose its factor for inspection`);
      const shown = Number(cell[1].replaceAll(',', ''));
      const actual = type === 'spillover' ? hero.overflow.gold : hero.bonuses[type] ?? 1;
      assert.ok(Math.abs(shown - actual) <= 1e-6 * Math.max(1, Math.abs(actual)), `${key} ${type} displays the selected attacker's factor`);
    }
  }
  await app.focus('damage');
  assert.equal(table.hidden, true);
});


test('every focus uses exactly one attacker for Damage, Gold and XP while wave Energy is independent', async () => {
  const initial = fixture();
  for (const focus of focuses) {
    initial.focusTeams[focus].teams = {
      a: [slot('hunter', 10000), slot('paladin', 10000), slot('scout', 10000)],
      b: [slot('hunter', 10000), slot('paladin', 10000), slot('scout', 10000)]
    };
    initial.focusTeams[focus].attackers = {a: 0, b: 1};
    if (focus === 'experience') initial.focusTeams[focus].levelingTargets = {a: 0, b: 1};
  }
  const app = load(initial);
  for (const focus of focuses) {
    await app.focus(focus);
    const [a,b] = app.evaluationCalls.slice(-2);
    assertSingleAttacker(a, 0); assertSingleAttacker(b, 1);
    assert.equal(a.result.metrics.energy, b.result.metrics.energy);
  }
  await app.focus('energy');
  const previous = app.evaluationCalls.at(-2).result.metrics;
  assert.match(app.elements.get('teams').innerHTML, /data-attacker="a"/);
  await app.change('teams', {attacker: 'a'}, 2);
  const changed = app.evaluationCalls.at(-2);
  assertSingleAttacker(changed, 2);
  assert.equal(changed.result.metrics.energy, previous.energy, 'the attacker must not change passive wave energy');
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).focus, 'energy');
  assert.deepEqual(app.optimizationCalls.at(-1).settings.requiredHeroes, []);
});

test('version 4 Experience targets become attackers while explicit Gold choices and lineup data survive', () => {
  const initial = fixture(); initial.version = 4;
  initial.focusTeams.experience.attackers = {a: 0, b: 0};
  initial.focusTeams.experience.levelingTargets = {a: 2, b: 1};
  initial.focusTeams.gold.teams.a = [slot('hunter', 6000), slot('paladin', 6000)];
  initial.focusTeams.gold.attackers.a = 1;
  initial.focusTeams.gold.chooseAttacker = true;
  const app = load(initial), migrated = app.state();
  assert.equal(migrated.version, 20);
  assert.deepEqual(migrated.focusTeams.experience.attackers, {a: 2, b: 1});
  assert.deepEqual(migrated.focusTeams.experience.levelingTargets, {a: 2, b: 1});
  assert.equal(migrated.focusTeams.gold.attackers.a, 1, 'v4 Gold selections must not be reset by Hunter migration');
  assert.equal(migrated.focusTeams.gold.chooseAttacker, true);
  for (const focus of focuses) {
    const sourceFocus = focus === 'powerMageEnergy' ? 'energy' : focus === 'damageBuffSwap' ? 'damage' : focus;
    assert.deepEqual(migrated.focusTeams[focus].teams, initial.focusTeams[sourceFocus].teams);
    assert.deepEqual(migrated.focusTeams[focus].names, initial.focusTeams[sourceFocus].names);
  }
});

test('Experience removal chooses the strongest remaining XP attacker and keeps both target fields synchronized', async () => {
  const initial = fixture(); initial.focus = 'experience';
  initial.focusTeams.experience.teams.a = [slot('militia', 25), slot('ballista', 10000), slot('hunter', 10000)];
  initial.focusTeams.experience.attackers.a = 0;
  initial.focusTeams.experience.levelingTargets.a = 0;
  const app = load(initial);
  await app.click('teams', {remove: 'a:0'});
  const panel = app.state().focusTeams.experience;
  const expected = bestIndex(app.engine, panel.teams.a, app.state().settings, 'experience');
  assert.equal(panel.attackers.a, expected);
  assert.equal(panel.levelingTargets.a, expected);
  await app.click('copy-team');
  assert.deepEqual(app.state().focusTeams.experience.attackers, app.state().focusTeams.experience.levelingTargets);
  await app.click('swap-teams');
  assert.deepEqual(app.state().focusTeams.experience.attackers, app.state().focusTeams.experience.levelingTargets);
});

test('Gold suggestions require Hunter Rogue and Sovereign even when optional support roster is empty', async () => {
  const initial = fixture(); initial.focus = 'gold'; initial.allowed = [];
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 10000), slot('rogue', 10000), slot('sovereign', 10000)],
    b: [slot('hunter', 10000), slot('rogue', 10000), slot('scout', 10000)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 0};
  const app = load(initial), required = ['hunter', 'rogue', 'sovereign'];
  for (const call of app.evaluationCalls.slice(-2)) assert.deepEqual(call.settings.requiredHeroes, required);
  const notice = app.elements.get('gold-required-roster');
  assert.equal(notice.hidden, false);
  assert.match(notice.innerHTML + notice.textContent, /Sovereign/);
  app.suggest(initial.focusTeams.gold.teams.a);
  await app.click('optimize'); await app.flush();
  const call = app.optimizationCalls.at(-1);
  assert.ok(call, 'the app must let the engine fill mandatory heroes even with no optional candidates');
  assert.deepEqual(call.settings.requiredHeroes, required);
  assert.deepEqual(call.allowed, []);
  assert.equal(app.elements.get('alert').hidden, true);
  assert.ok(required.every(id => app.state().focusTeams.gold.teams.b.some(hero => hero.id === id)));
  await app.focus('damage');
  assert.equal(notice.hidden, true);
  for (const other of app.evaluationCalls.slice(-2)) assert.deepEqual(other.settings.requiredHeroes, []);
});

test('event defaults and Crusader upgrade migrate older setups without changing saved teams', async () => {
  const fresh = load();
  assert.equal(fresh.state().settings.synergyEvent, true);
  assert.equal(fresh.state().settings.heroSynergyCrusader, 25);
  assert.equal(fresh.elements.get('synergy-event').checked, true);
  const old = fixture(); delete old.settings.synergyEvent; old.settings.heroSynergyCrusader = 15;
  const migrated = load(old).state();
  assert.equal(migrated.settings.synergyEvent, true);
  assert.equal(migrated.settings.heroSynergyCrusader, 25);
  assert.deepEqual(migrated.focusTeams, migratedFocusTeams(old));
  const custom = clone(old); custom.settings.heroSynergyCrusader = 30;
  assert.equal(load(custom).state().settings.heroSynergyCrusader, 30);
  custom.settings.heroSynergyCrusader = 15; custom.settings.synergyEvent = false;
  assert.equal(load(custom).state().settings.heroSynergyCrusader, 15, 'explicit current overrides remain supported');
  custom.settings.synergyEvent = 'true';
  assert.equal(load(custom).state().settings.synergyEvent, false, 'only a boolean true enables imported event');
});

test('event checkbox recalculates both teams and support rankings and is shared across focuses', async () => {
  const app = load(fixture()), beforeTeams = clone(app.state().focusTeams);
  const baseline = app.evaluationCalls.slice(-2).map(call => call.result.metrics);
  const supportBefore = app.elements.get('support-context').textContent;
  await app.check('synergy-event', true);
  assert.equal(app.state().settings.synergyEvent, true);
  assert.match(app.elements.get('synergy-event-status').textContent, /Event active/);
  for (const call of app.evaluationCalls.slice(-2)) {
    assert.equal(call.settings.synergyEvent, true);
    assert.equal(call.result.style.eventMilestoneScale, 1.25);
    assert.equal(call.result.style.eventSynergyScale, 1.1);
    assertSingleAttacker(call, call.settings.damageHero);
  }
  assert.notDeepEqual(app.evaluationCalls.slice(-2).map(call => call.result.metrics), baseline);
  assert.notEqual(app.elements.get('support-context').textContent, supportBefore);
  for (const focus of focuses) {
    await app.focus(focus);
    assert.equal(app.elements.get('synergy-event').checked, true);
    for (const call of app.evaluationCalls.slice(-2)) assert.equal(call.settings.synergyEvent, true);
  }
  assert.deepEqual(app.state().focusTeams, beforeTeams);
  await app.focus('energy'); await app.check('synergy-event', false);
  assert.deepEqual(app.evaluationCalls.slice(-2).map(call => call.result.metrics), baseline);
  assert.equal(app.elements.get('support-context').textContent, supportBefore);
  assert.match(app.elements.get('synergy-event-status').textContent, /Event off/);
});

test('event choice survives export import reload and reaches team and tile suggestions', async () => {
  const app = load(fixture());
  for (const enabled of [true, false]) {
    await app.check('synergy-event', enabled);
    for (const focus of focuses) {
      await app.focus(focus);
      if (focus === 'gold' || focus === 'damage') await app.check('choose-attacker', true);
      await app.click('optimize'); await app.flush();
      assert.equal(app.optimizationCalls.at(-1).settings.synergyEvent, enabled);
      await app.click('teams', {suggestTiles: 'b'}); await app.flush();
      assert.equal(app.optimizationCalls.at(-1).settings.synergyEvent, enabled);
    }
    const exported = await app.export(), restored = load(exported), imported = load();
    await imported.import(exported);
    for (const saved of [restored, imported]) {
      assert.equal(saved.state().settings.synergyEvent, enabled);
      assert.equal(saved.elements.get('synergy-event').checked, enabled);
    }
  }
});

test('versions 3–5 independently copy Energy A/B into Power Mage focus without changing existing lineups', async () => {
  for (const version of [3, 4, 5]) {
    const old = fixture(); old.version = version; old.focus = 'energy';
    delete old.focusTeams.powerMageEnergy;
    old.focusTeams.energy.teams = {
      a: [slot('captain', 10000, true, 'milestone'), slot('arbalest', 4321, false, 'synergy')],
      b: [slot('militia', 75, false, 'skill')]
    };
    old.focusTeams.energy.names = {a: 'My wave A', b: 'My wave B'};
    old.focusTeams.energy.attackers = {a: 1, b: 0};
    const app = load(old), saved = app.state();
    assert.equal(saved.version, 20);
    assert.deepEqual(saved.focusTeams.powerMageEnergy, saved.focusTeams.energy);
    for (const focus of focuses.filter(key => !['powerMageEnergy', 'damageBuffSwap'].includes(key))) {
      assert.deepEqual(saved.focusTeams[focus].teams, old.focusTeams[focus].teams);
      assert.deepEqual(saved.focusTeams[focus].names, old.focusTeams[focus].names);
      if (version === 5) assert.deepEqual(saved.focusTeams[focus], old.focusTeams[focus]);
    }
    assert.equal(app.elements.get('migration-notice').hidden, false);
    assert.match(app.elements.get('migration-description').textContent, /independent copies/);
    await app.focus('powerMageEnergy');
    await app.change('teams', {level: 'a:0'}, 9876);
    await app.change('teams', {name: 'b'}, 'Power Mage B');
    await app.click('teams', {lock: 'a:0'});
    await app.focus('energy');
    assert.deepEqual(app.state().focusTeams.energy, saved.focusTeams.energy);
    await app.focus('powerMageEnergy');
    const exported = await app.export(), reloaded = load(exported), imported = load();
    await imported.import(exported);
    assert.deepEqual(reloaded.state(), exported);
    assert.deepEqual(imported.state(), exported);
    assert.equal(reloaded.elements.get('migration-notice').hidden, true);
  }
});

test('Power Mage focus shows global factors and routes team and tile suggestions without attacker search', async () => {
  const initial = fixture(); initial.focus = 'powerMageEnergy';
  initial.settings.maxTier = 9;
  initial.focusTeams.powerMageEnergy.teams = {
    a: [slot('captain', 10000, true), slot('arbalest', 10000)],
    b: [slot('captain', 10000), slot('militia', 10000)]
  };
  initial.focusTeams.powerMageEnergy.attackers = {a: 0, b: 0};
  const app = load(initial), beforeEnergy = clone(app.state().focusTeams.energy);
  assert.match(app.elements.get('focus-controls').innerHTML, /Energy \+ Power Mages/);
  assert.doesNotMatch(app.elements.get('teams').innerHTML, /data-attacker=|data-leveling-target=|attacker-row/);
  assert.equal(app.elements.get('attacker-search-option').hidden, true);
  const table = app.elements.get('power-mage-comparison');
  assert.equal(table.hidden, false);
  assert.match(table.innerHTML, /Wave energy index × Power Mage Energy factor/);
  assert.match(table.innerHTML, /relative index/);
  for (const [index, call] of app.evaluationCalls.slice(-2).entries()) {
    const key = index ? 'b' : 'a', factor = call.result.global.total['Power Mage Energy'];
    assert.ok(factor > 1, 'fixture should have a real global Power Mage Energy bonus');
    assert.equal(call.result.metrics.powerMageEnergy, call.result.metrics.energy * factor);
    for (const [row, value] of [call.result.metrics.energy, factor, call.result.metrics.powerMageEnergy].entries()) {
      const cell = table.innerHTML.match(new RegExp(`data-power-mage-factor="${key}:${row}" title="([^"]+)"`));
      assert.ok(cell);
      const shown = Number(cell[1].replaceAll(',', ''));
      assert.ok(Math.abs(shown - value) <= 1e-6 * Math.max(1, Math.abs(value)));
    }
  }
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  const suggestion = [slot('captain', 9000), slot('arbalest', 8000)];
  app.suggest(suggestion); await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.map(call => [call.method, call.focus]),
    [['optimizePlacements', 'powerMageEnergy'], ['optimizeTeam', 'powerMageEnergy']]);
  assert.ok(app.optimizationCalls.every(call => call.settings.damageHero !== 'best' && call.settings.goldHero !== 'best'));
  assert.ok(app.optimizationCalls.every(call => JSON.stringify(call.settings.requiredHeroes) === JSON.stringify(['captain'])));
  assert.deepEqual(app.state().focusTeams.powerMageEnergy.teams.b, suggestion);
  assert.deepEqual(app.state().focusTeams.energy, beforeEnergy);
  assert.equal(app.elements.get('alert').hidden, true);
  await app.focus('energy');
  assert.equal(table.hidden, true);
});

test('one top-level focus drives the support results and comparison without modifying any lineup', async () => {
  const app = load();
  await app.focus('experience'); // Let the XP planner choose its initial attacker.
  const original = app.state();
  for (const focus of [...focuses, 'immortal']) {
    await app.focus(focus);
    const saved = app.state(), buttons = app.elements.get('focus-controls').innerHTML;
    assert.equal(saved.focus, focus);
    const active = [...buttons.matchAll(/<button\b[^>]*aria-pressed="true"[^>]*>/g)].map(match => match[0]);
    assert.equal(active.length, 1);
    assert.ok(active[0].includes(`data-focus="${focus}"`));
    assert.doesNotMatch(app.elements.get('support-sort')?.innerHTML || '', /data-support-sort=/);
    assert.deepEqual(saved.focusTeams, original.focusTeams);
    assert.deepEqual(saved.immortal.teams, original.immortal.teams);
  }
});

function supportRankingRows(app) {
  const table = app.elements.get('support-table').innerHTML;
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].flatMap(([, row]) => {
    const hero = row.match(/data-support-hero="([^"]+)"/);
    if (!hero) return [];
    const rank = row.match(/class="numeric support-rank">([^<]+)/);
    const score = row.match(/class="numeric support-sorted-value"[^>]*title="([^"]+)"/);
    const numericRank = Number(rank?.[1].replaceAll(',', ''));
    const numericScore = Number(score?.[1].replaceAll(',', ''));
    return [{id: hero[1], rank: Number.isFinite(numericRank) ? numericRank : null,
      score: Number.isFinite(numericScore) ? numericScore : null}];
  });
}

function assertSupportRankingValues(app) {
  const state = app.state(), panel = state.focusTeams[state.focus];
  const key = app.elements.get('support-team').value;
  const heroAscensions = {...state.settings.heroAscensions};
  for (const [id, values] of Object.entries(panel.ascensionOverrides?.[key] || {}))
    heroAscensions[id] = {...heroAscensions[id], ...values};
  const damage = ['damage','damageBuffSwap'].includes(state.focus);
  const metric = damage ? 'damageWithSupport' : state.focus;
  const report = app.engine.rankMilestoneSupport({...state.settings, heroAscensions,
    damageSupportMode: state.focus === 'damageBuffSwap' ? 'debuffs' : 'all'}, state.supportRanking);
  const rows = supportRankingRows(app);
  assert.ok(rows.length > 0);
  const all = Array.from(report.heroes).sort((a,b) => b.multipliers[metric] - a.multipliers[metric] || a.name.localeCompare(b.name));
  assert.deepEqual(rows.map(row => row.id), all.filter(hero => rows.some(row => row.id === hero.id)).map(hero => hero.id));
  for (const row of rows) {
    const hero = all.find(item => item.id === row.id);
    assert.equal(row.rank, hero.ranks[metric]);
    assert.ok(Math.abs(row.score / hero.multipliers[metric] - 1) < 1e-6, `${row.id} should display ${metric} for Team ${key}`);
  }
  return report;
}

test('the focus filters all support candidates down to one score and exposes Power Mage milestone contributions', async () => {
  const app = load();
  await app.focus('experience');
  const teams = app.state().focusTeams;
  for (const focus of focuses) {
    await app.focus(focus);
    const rows = supportRankingRows(app);
    assert.equal(rows.length, 42);
    assert.equal(new Set(rows.map(row => row.id)).size, 42);
    const header = app.elements.get('support-table').innerHTML.match(/<thead>([\s\S]*?)<\/thead>/)[1];
    assert.equal((header.match(/<th\b/g) || []).length, 3, 'only rank, hero and the active score belong in the table');
    assertSupportRankingValues(app);
  }
  await app.focus('powerMageEnergy');
  await app.click('support-rankings', {supportHero: 'captain'});
  assert.match(app.elements.get('support-hero-details').innerHTML, /Power Mage Energy/);
  assert.deepEqual(app.state().focusTeams, teams);
});

test('the lineup filter includes each deployed hero once, keeps full-pool ranks and follows Team A or B', async () => {
  const saved = fixture(), panel = saved.focusTeams.energy;
  panel.teams = {a:[slot('hunter'),slot('hunter'),slot('druid')], b:[slot('hunter'),slot('wizard')]};
  panel.ascensionOverrides = {b:{hunter:{globalEnergyIncomeLevel:5}}};
  saved.supportRanking.sort = 'damage';
  const app = load(saved);
  const pool = supportRankingRows(app);
  const lookup = (rows,id) => rows.find(row => row.id===id);
  assert.equal(pool.length,42);
  assert.equal(app.elements.get('support-team').value,'a');
  await app.check('support-lineup-only',true);
  const a = supportRankingRows(app);
  assert.deepEqual(a.map(r=>r.id).sort(),['druid','hunter']);
  assert.deepEqual(lookup(a,'hunter'),lookup(pool,'hunter'));
  await app.change('support-team',null,'b');
  const b = supportRankingRows(app);
  assert.deepEqual(b.map(r=>r.id).sort(),['hunter','wizard']);
  assert.ok(lookup(b,'hunter').score>lookup(a,'hunter').score);
  assertSupportRankingValues(app);
  await app.check('support-global-ascensions', false);
  assert.equal(lookup(supportRankingRows(app), 'hunter').score, lookup(a, 'hunter').score);
  await app.check('support-global-ascensions', true);
  await app.click('support-rankings',{supportHero:'hunter'});
  app.elements.get('support-search').value='Wiz';
  await app.elements.get('support-search').dispatch('input');
  assert.deepEqual(supportRankingRows(app).map(r=>r.id),['wizard']);
  app.elements.get('support-search').value='absent';
  await app.elements.get('support-search').dispatch('input');
  assert.equal(supportRankingRows(app).length,0);
  assert.match(app.elements.get('support-table').innerHTML,/no|empty/i);
  assert.deepEqual(app.state().focusTeams.energy.teams,panel.teams);
  assert.deepEqual(app.state().focusTeams.energy.ascensionOverrides,panel.ascensionOverrides);
  app.elements.get('support-search').value='';
  await app.elements.get('support-search').dispatch('input');
  const exported=await app.export(), imported=load(); await imported.import(exported);
  for (const restored of [load(exported),imported]) {
    assert.equal(restored.elements.get('support-team').value,'b');
    assert.equal(restored.elements.get('support-lineup-only').checked,true);
    assert.deepEqual(supportRankingRows(restored),b);
  }
});

test('Experience alone shows its saved ranking calibration and the selected hero’s XP factors', async () => {
  const app = load(), reference = {rankXp: 6.98e12, superChance: 359, ultraChance: 536};
  const legacy = app.state();
  delete legacy.supportRanking.xpReference;
  assert.deepEqual(load(legacy).state().supportRanking.xpReference, reference);

  await app.focus('experience');
  await app.click('support-rankings', {supportHero: 'apprentice'});
  assert.equal(app.elements.get('support-xp-settings').hidden, false);
  assert.equal(app.elements.get('support-damage-settings').hidden, true);
  assert.equal(app.elements.get('support-rank-xp').value, '6.98T');
  assert.equal(Number(app.elements.get('support-super-xp-chance').value), 359);
  assert.equal(Number(app.elements.get('support-ultra-xp-chance').value), 536);

  const report = assertSupportRankingValues(app), rows = supportRankingRows(app);
  assert.ok(rows.find(r => r.id === 'apprentice').rank < rows.find(r => r.id === 'necromancer').rank);
  const factors = report.heroes.find(h => h.id === 'apprentice').xpFactors;
  const details = app.elements.get('support-hero-details').innerHTML;
  for (const [key, label] of Object.entries({rankXp: 'Rank XP', superAmount: 'Super XP Amount', ultraAmount: 'Ultra XP Amount', spillover: 'Chance spillover'})) {
    const shown = details.match(new RegExp(`<tr><td>${label}</td><td>[^<]*</td><td class="numeric">×([\\d,.]+)</td></tr>`));
    assert.ok(shown && Math.abs(Number(shown[1].replaceAll(',', '')) / factors[key] - 1) < 1e-6, label);
  }
  await app.focus('gold');
  assert.equal(app.elements.get('support-xp-settings').hidden, true);
});

test('editing the XP reference updates ranking scores and round-trips without altering team settings', async () => {
  const app = load();
  await app.focus('experience');
  const initial = app.state();
  const necro = () => supportRankingRows(app).find(r => r.id === 'necromancer').score;
  const before = necro();
  await app.change('support-rank-xp', null, '1.25e2');
  assert.ok(necro() > before);
  await app.change('support-rank-xp', null, '2.5T');
  await app.change('support-super-xp-chance', null, 100);
  await app.change('support-ultra-xp-chance', null, 200);
  assertSupportRankingValues(app);
  assert.deepEqual(app.state().supportRanking.xpReference, {rankXp: 2.5e12, superChance: 100, ultraChance: 200});
  assert.deepEqual(app.state().supportRanking.damageReference, initial.supportRanking.damageReference);
  assert.deepEqual(app.state().settings, initial.settings);
  assert.deepEqual(app.state().focusTeams, initial.focusTeams);

  const exported = await app.export(), imported = load();
  await imported.import(exported);
  for (const restored of [load(exported), imported]) {
    assert.equal(restored.elements.get('support-rank-xp').value, '2.5T');
    assert.deepEqual(supportRankingRows(restored), supportRankingRows(app));
  }
});

test('the two Damage focuses honor their support skill rules and reflect profile, tile and scenario edits', async () => {
  const app = load(fixture()), teams = app.state().focusTeams;
  await app.focus('damage');
  await app.click('support-rankings', {supportHero: 'druid'});
  const druid = () => supportRankingRows(app).find(r => r.id === 'druid').score;
  const baseline = druid();
  await app.focus('damageBuffSwap');
  const swapped = druid();
  assert.ok(swapped < baseline);
  await app.focus('damage');
  await app.check('damage-support-skills', false);
  assert.equal(druid(), swapped);
  await app.check('damage-support-skills', true);
  assert.equal(druid(), baseline);

  await app.change('damage-support-profile-hero', null, 'druid');
  await app.change('damage-support-profile-fields', {damageSupportField: 'damageSupportDruidDamage'}, 9000);
  await app.change('damage-support-profile-fields', {damageSupportField: 'damageSupportDruidDamagePerSecond'}, 100);
  await app.change('damage-support-seconds', null, 7.5);
  assertSupportRankingValues(app);
  const edited = druid();
  assert.ok(Math.abs(edited / swapped - 91 * 8.5) < 0.01);
  const detail = app.elements.get('support-hero-details').innerHTML;
  assert.ok(detail.includes('9,000') && detail.includes('750'));
  await app.change('support-tile', null, 'skill');
  assert.ok(druid() > edited);
  assert.equal(app.state().settings.snowFort, false);
  assertSupportRankingValues(app);

  await app.focus('damageBuffSwap');
  assert.equal(druid(), swapped);
  await app.focus('damage');
  const exported = await app.export(), imported = load();
  await imported.import(exported);
  for (const restored of [load(exported), imported]) {
    assert.equal(restored.elements.get('support-tile').value, 'skill');
    assert.deepEqual(supportRankingRows(restored), supportRankingRows(app));
  }
  assert.deepEqual(app.state().focusTeams, teams);
});

test('the Damage reference recalculates the selected damage ranking independently of team and XP inputs', async () => {
  const app = load(fixture());
  await app.focus('damage');
  const initial = app.state(), reference = {critChance: 241, superChance: 258, ultraChance: 120};
  const legacy = app.state();
  delete legacy.supportRanking.damageReference;
  assert.deepEqual(load(legacy).state().supportRanking.damageReference, reference);
  assert.equal(app.elements.get('support-damage-settings').hidden, false);
  await app.click('support-rankings', {supportHero: 'battlemage'});
  const score = () => supportRankingRows(app).find(r => r.id === 'battlemage').score;
  for (const [id, value] of [['support-crit-chance', 400], ['support-super-crit-chance', 500], ['support-ultra-crit-chance', 600]]) {
    const before = score();
    await app.change(id, null, value);
    assert.notEqual(score(), before);
    assertSupportRankingValues(app);
  }
  assert.match(app.elements.get('support-damage-context').textContent, /1,200 .*×61/);
  assert.match(app.elements.get('support-hero-details').innerHTML, /Ultra Crit Chance<\/td><td class="numeric">600%<\/td>/);
  assert.deepEqual(app.state().supportRanking.damageReference, {critChance: 400, superChance: 500, ultraChance: 600});
  assert.deepEqual(app.state().supportRanking.xpReference, initial.supportRanking.xpReference);
  assert.deepEqual(app.state().focusTeams, initial.focusTeams);
  assert.deepEqual(app.state().settings, initial.settings);
  const exported = await app.export(), imported = load();
  await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(supportRankingRows(restored), supportRankingRows(app));
  await app.focus('experience');
  assert.equal(app.elements.get('support-damage-settings').hidden, true);
});

test('Immortal rankings preview the chosen slot, respect the boss priority and leave both lineups intact', async () => {
  const saved = immortalFixture(), panel = saved.immortal.teams.ranged;
  panel.teams.a = [slot('archer'), slot('hunter'), slot('wizard')];
  panel.teams.b = [slot('hunter', 985), slot('deadeye', 100), slot('wizard', 8000)];
  panel.ascensionOverrides = {b: {deadeye: {maxAttackSpeedLevel: 5}}};
  const app = load(saved);
  await app.click('immortal-modes', {immortalMode: 'ranged'});
  await app.change('support-team', null, 'b');
  await app.change('support-slot', null, 1);
  const original = clone(app.state().immortal.teams);
  assert.equal(app.elements.get('support-slot-field').hidden, false);
  for (const [priority, metric] of [['hits', 'totalHitRate'], ['damage', 'score']]) {
    await app.change('immortal-priority', null, priority);
    const state = app.state();
    const options = {...state.settings, heroAscensions: {...state.settings.heroAscensions, deadeye: {maxAttackSpeedLevel: 5}}};
    const config = state.immortal.config, source = state.immortal.teams.ranged.teams.b;
    const rows = supportRankingRows(app);
    assert.equal(rows.length, 42);
    let previous;
    for (const row of rows) {
      const candidate = source.map((slot, index) => index === 1 ? {...slot, id: row.id} : slot);
      const report = app.engine.immortal.evaluate(candidate, options, config);
      assert.ok(Math.abs(row.score - report[metric]) <= 1e-6 * Math.max(1,report[metric]), row.id + ' ' + priority);
      if (previous) assert.ok(app.engine.immortal.compareResults(previous,report,priority) >= 0, 'tiebreak order');
      previous = report;
    }
  }
  await app.check('support-lineup-only', true);
  assert.deepEqual(supportRankingRows(app).map(row => row.id).sort(), ['deadeye','hunter','wizard']);
  assert.deepEqual(app.state().immortal.teams, original);
  await app.focus('energy');
  assert.equal(app.elements.get('support-slot-field').hidden, true);
});

test('Immortal previews keep a fourth copy unranked and handle an empty side', async () => {
  const saved = immortalFixture(), panel = saved.immortal.teams.ranged;
  panel.teams.a = [slot('archer'), slot('hunter'), slot('hunter'), slot('hunter')];
  panel.teams.b = [];
  const app = load(saved);
  await app.click('immortal-modes', {immortalMode: 'ranged'});
  const hunter = () => supportRankingRows(app).find(row => row.id === 'hunter');
  assert.equal(hunter().rank, null, 'Hunter would be the fourth copy in slot one');
  await app.click('support-rankings', {supportHero: 'hunter'});
  assert.match(app.elements.get('support-hero-details').innerHTML, /three copies/i);
  await app.change('support-slot', null, 1);
  assert.ok(hunter().rank > 0, 'replacing an existing Hunter is legal');
  await app.change('support-team', null, 'b');
  assert.equal(app.elements.get('support-slot').disabled, true);
  assert.equal(supportRankingRows(app).length, 0);
  await app.check('support-lineup-only', true);
  assert.equal(supportRankingRows(app).length, 0);
  assert.equal(app.elements.get('support-hero-details').innerHTML, '');
});

test('a deployed-buff Immortal preview ranks only replacements that leave all four supports on the field', async () => {
  const saved = immortalFixture();
  saved.immortal.buffTeams.mage = 'deploy';
  saved.immortal.teams.mage.teams.a = ['hunter','warlock','titan','apprentice'].map(id => slot(id));
  const app = load(saved);
  await app.click('immortal-modes', {immortalMode: 'mage'});
  const ranked = () => supportRankingRows(app).filter(row => row.rank !== null);
  assert.deepEqual(ranked().map(row => row.id), ['wizard']);
  await app.change('support-slot', null, 1);
  assert.equal(ranked().length, 0, 'this slot cannot supply both Warlock and Wizard');
  assert.equal(app.elements.get('support-warnings').hidden, false);
  await app.change('immortal-buff-preset', null, 'warlock');
  assert.equal(ranked().length, 42, 'switching to external buffs reopens the whole roster');
  assert.equal(app.elements.get('support-warnings').hidden, true);
});

test('Power Mage suggestions require Captain and flag saved teams without replacing their heroes', async () => {
  const initial = fixture(); initial.focus = 'powerMageEnergy'; initial.allowed = [];
  initial.focusTeams.powerMageEnergy.teams = {
    a: [slot('captain', 1200)],
    b: [slot('scout', 1000, true), slot('militia', 25)]
  };
  initial.focusTeams.powerMageEnergy.attackers = {a: 0, b: 0};
  const app = load(initial), notice = app.elements.get('power-mage-required-roster');
  assert.deepEqual(app.state().focusTeams.powerMageEnergy.teams, initial.focusTeams.powerMageEnergy.teams);
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /Team A: Captain present/);
  assert.match(notice.textContent, /Team B: missing Captain/);
  assert.match(notice.textContent, /stacking bonus is not included/);
  assert.equal(app.elements.get('gold-required-roster').hidden, true);
  for (const call of app.evaluationCalls.slice(-2)) assert.deepEqual(call.settings.requiredHeroes, ['captain']);
  const reloaded = load(await app.export());
  assert.match(reloaded.elements.get('power-mage-required-roster').textContent, /Team B: missing Captain/);
  const suggested = [slot('scout', 1000, true), slot('captain', 25)];
  app.suggest(suggested);
  await app.click('optimize'); await app.flush();
  const call = app.optimizationCalls.at(-1);
  assert.ok(call, 'mandatory Captain must remain eligible with an empty optional roster');
  assert.equal(call.focus, 'powerMageEnergy');
  assert.deepEqual(call.settings.requiredHeroes, ['captain']);
  assert.deepEqual(call.allowed, []);
  assert.deepEqual(app.state().focusTeams.powerMageEnergy.teams.b, suggested);
  assert.match(notice.textContent, /Team B: Captain present/);
  assert.match(app.elements.get('suggestion-note').textContent, /Captain included/);
  assert.equal(app.elements.get('alert').hidden, true);
  await app.focus('energy');
  assert.equal(notice.hidden, true);
  for (const call of app.evaluationCalls.slice(-2)) assert.deepEqual(call.settings.requiredHeroes, []);
  await app.focus('powerMageEnergy');
  await app.click('teams', {remove: 'a:0'});
  assert.match(notice.textContent, /Team A: missing Captain/);
});

const goldProfileFields = [
  ['gold-kill-tile', 'goldKillGoldTile', 2475],
  ['gold-rogue-bonus', 'goldRogueBonus', 8070],
  ['gold-hunter-bonus', 'goldHunterBonus', 28720],
  ['gold-sovereign-chance', 'goldSovereignChance', 325.8],
  ['gold-sovereign-amount', 'goldSovereignAmount', 1629],
  ['gold-crusader-bonus', 'goldCrusaderBonus', 6420],
  ['gold-crusader-mastery', 'goldCrusaderMastery', 20.6]
];

function goldFixture() {
  const initial = fixture(); initial.focus = 'gold'; initial.settings.snowFort = true;
  initial.focusTeams.gold.teams = {
    a: [slot('hunter', 0), slot('rogue', 0), slot('sovereign', 0)],
    b: [slot('hunter', 0), slot('rogue', 0), slot('sovereign', 0)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 0};
  return initial;
}

test('v18 saves inherit ascensions and both Hunter presets persist through search and export', async () => {
  const saved = goldFixture();
  saved.version = 18;
  delete saved.settings.heroAscensions;
  const app = load(saved);
  assert.equal(app.state().version,20);
  assert.deepEqual(app.state().settings.heroAscensions,{});
  assert.deepEqual(app.state().focusTeams.gold,saved.focusTeams.gold);
  const hunterScore = () => app.evaluationCalls.at(-1).result.metrics.gold;
  const legacy = hunterScore();
  await app.click('ascension-hunter-current');
  const current = {milestoneLevel:5,synergyLevel:5,killGoldLevel:7};
  assert.deepEqual(app.state().settings.heroAscensions,{hunter:current});
  assert.ok(Math.abs(hunterScore()/legacy - 78125)<1e-8);
  await app.click('ascension-hunter-gold');
  const gold = {milestoneLevel:0,synergyLevel:0,killGoldLevel:14};
  assert.deepEqual(app.state().settings.heroAscensions,{hunter:gold});
  assert.match(app.elements.get('ascension-impact').textContent,/Team A ×78,125.*Team B ×78,125/);
  await app.change('ascension-hero', null, 'rogue');
  await app.change('ascension-kill-gold', null, '2');
  const grades = app.state().settings.heroAscensions;
  assert.deepEqual(grades,{hunter:gold,rogue:{killGoldLevel:2}});
  await app.click('teams',{suggestTiles:'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) assert.deepEqual(call.settings.heroAscensions,grades);
  const exported = await app.export(), imported = load();
  await imported.import(exported);
  for (const restored of [imported,load(exported)]) assert.deepEqual(restored.state().settings.heroAscensions,grades);
  await app.click('ascension-inherit');
  assert.deepEqual(app.state().settings.heroAscensions,{hunter:gold});
});

test('Mimic farming uses the observed encounter interval once and measured kills take precedence, including zero', async () => {
  assert.equal(load().state().settings.goldMimicFarming,true);
  const initial = goldFixture();
  initial.version = 18;
  delete initial.settings.goldMimicFarming;
  initial.settings.goldSkills = false;
  initial.settings.maxTier = 0;
  const app = load(initial);
  assert.equal(app.elements.get('gold-mimic-report').hidden,false);
  await app.change('gold-mimic-encounter-size',null,20);
  await app.change('gold-mimic-doubles',null,25);
  await app.change('gold-mimic-enemies-a',null,1600);
  const report = () => app.elements.get('gold-mimic-results').innerHTML;
  function rateCell(team) { return report().match(new RegExp('data-mimic-rate="'+team+'"[^>]*>([\\s\\S]*?)</td>'))?.[1] ?? ''; }
  assert.match(rateCell('a'),/\b100\b/);
  await app.change('gold-mimic-rate-a',null,0);
  assert.match(rateCell('a'),/^\s*0\b/);
  await app.change('gold-mimic-rate-a',null,7);
  assert.match(rateCell('a'),/^\s*7\b/);
  const titleValue = field => Number(report().match(new RegExp('data-mimic-'+field+'="a" title="([^"]+)"'))[1].replaceAll(',',''));
  assert.ok(Math.abs(titleValue('hourly') / titleValue('total') - 7) < .00001);
  await app.change('gold-mimic-enemies-b',null,80);
  assert.match(rateCell('b'),/^\s*5\b/);
  const exported = await app.export(), restored = load();
  await restored.import(exported);
  assert.deepEqual(restored.state().focusTeams.gold.enemiesPerHour,{a:1600,b:80});
  assert.deepEqual(restored.state().focusTeams.gold.mimicKillsPerHour,{a:7,b:null});
  await app.click('swap-teams');
  assert.deepEqual(app.state().focusTeams.gold.enemiesPerHour,{a:80,b:1600});
  assert.deepEqual(app.state().focusTeams.gold.mimicKillsPerHour,{a:null,b:7});
  await app.change('teams',{tile:'b:0'},'killGold');
  assert.equal(app.state().focusTeams.gold.enemiesPerHour.b,null);
  assert.equal(app.state().focusTeams.gold.mimicKillsPerHour.b,null);
  await app.check('gold-mimic-farming',false);
  assert.equal(app.elements.get('gold-mimic-report').hidden,true);
});

test('Gold profile defaults reproduce captured no-tile skills and migrate missing values without changing teams', () => {
  const fresh = load();
  assert.equal(fresh.state().settings.goldSkills, true);
  assert.equal(fresh.elements.get('gold-skills').checked, true);
  for (const [id, key, expected] of goldProfileFields) {
    assert.equal(fresh.state().settings[key], expected);
    assert.equal(Number(fresh.elements.get(id).value), expected);
  }
  const old = goldFixture(); old.version = 6;
  delete old.settings.goldSkills;
  for (const [, key] of goldProfileFields) delete old.settings[key];
  const migrated = load(old).state();
  assert.deepEqual(migrated.focusTeams, migratedFocusTeams(old));
  assert.equal(migrated.settings.goldSkills, true);
  for (const [, key, expected] of goldProfileFields) assert.equal(migrated.settings[key], expected);
});

test('Gold profile edits persist across focuses, reload and export/import and reach both suggestion paths', async () => {
  const app = load(goldFixture());
  for (const [index, [id, key]] of goldProfileFields.entries()) {
    await app.change(id, null, 100 + index + 0.5);
    assert.equal(app.state().settings[key], 100 + index + 0.5);
  }
  await app.check('gold-skills', false);
  const expected = clone(app.state().settings);
  await app.focus('energy'); await app.focus('gold');
  assert.equal(app.elements.get('gold-skills').checked, false);
  for (const [id, key] of goldProfileFields) assert.equal(Number(app.elements.get(id).value), expected[key]);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.settings.goldSkills, false);
    for (const [, key] of goldProfileFields) assert.equal(call.settings[key], expected[key]);
  }
  const exported = await app.export(), reloaded = load(exported), imported = load();
  await imported.import(exported);
  for (const restored of [reloaded, imported]) {
    assert.deepEqual(restored.state(), exported);
    assert.equal(restored.elements.get('gold-skills').checked, false);
    for (const [id, key] of goldProfileFields) assert.equal(Number(restored.elements.get(id).value), expected[key]);
  }
});

test('Gold skill toggle recalculates Gold while leaving non-Gold metrics and saved rosters intact', async () => {
  const app = load(goldFixture()), beforeTeams = clone(app.state().focusTeams);
  const before = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  await app.check('gold-skills', false);
  const disabled = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  for (let index = 0; index < 2; index++) {
    assert.ok(before[index].gold > disabled[index].gold);
    for (const key of ['energy', 'powerMageEnergy', 'damage', 'experience']) assert.equal(disabled[index][key], before[index][key]);
  }
  await app.check('gold-skills', true);
  assert.deepEqual(app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics)), before);
  assert.deepEqual(app.state().focusTeams, beforeTeams);
});

test('manual Kill Gold tile benefits only its attacker and its single-tile limit is enforced', async () => {
  const app = load(goldFixture());
  const baseline = app.evaluationCalls.at(-2).result.metrics.gold;
  await app.change('teams', {tile: 'a:0'}, 'killGold');
  assert.equal(app.state().focusTeams.gold.teams.a[0].tile, 'killGold');
  const boosted = app.evaluationCalls.at(-2).result.metrics.gold;
  assert.ok(Math.abs(boosted / baseline - 25.75) < 1e-10);
  assert.match(app.elements.get('teams').innerHTML, /Kill Gold/);
  const before = clone(app.state());
  await app.change('teams', {tile: 'a:1'}, 'killGold');
  assert.deepEqual(app.state(), before, 'a second Kill Gold tile must not replace a valid saved setup');
  assert.equal(app.elements.get('alert').hidden, false);
  await app.change('teams', {tile: 'a:0'}, 'normal');
  await app.change('teams', {tile: 'a:1'}, 'killGold');
  assert.equal(app.evaluationCalls.at(-2).result.metrics.gold, baseline, 'a support personal Kill Gold tile must not increase the selected killer payout');
});

test('Kill Gold placement survives focus switches, reload, export/import, copy and swap', async () => {
  const app = load(goldFixture());
  await app.change('teams', {tile: 'a:0'}, 'killGold');
  await app.click('copy-team');
  assert.equal(app.state().focusTeams.gold.teams.b[0].tile, 'killGold');
  await app.change('teams', {tile: 'a:0'}, 'normal');
  await app.click('swap-teams');
  assert.equal(app.state().focusTeams.gold.teams.a[0].tile, 'killGold');
  assert.equal(app.state().focusTeams.gold.teams.b[0].tile, 'normal');
  await app.focus('energy');
  assert.ok(app.state().focusTeams.energy.teams.a.every(hero => hero.tile !== 'killGold'));
  const exported = await app.export(), reloaded = load(exported), imported = load();
  await imported.import(exported);
  for (const restored of [reloaded, imported]) {
    await restored.focus('gold');
    assert.equal(restored.state().focusTeams.gold.teams.a[0].tile, 'killGold');
    assert.equal(restored.state().focusTeams.gold.teams.b[0].tile, 'normal');
  }
});

test('import rejects duplicate Kill Gold tiles even in an inactive focus without replacing the setup', async () => {
  const app = load(goldFixture()); await app.focus('energy');
  const before = app.state(), invalid = clone(before);
  invalid.focusTeams.gold.teams.a[0].tile = 'killGold';
  invalid.focusTeams.gold.teams.a[1].tile = 'killGold';
  await app.import(invalid);
  assert.equal(app.elements.get('alert').hidden, false);
  assert.match(app.elements.get('alert').textContent, /Could not import setup/);
  assert.deepEqual(app.state(), before);
});

test('Gold suggestions retain the profile and accept killer and support skill placements', async () => {
  const app = load(goldFixture());
  const proposed = [slot('hunter', 0, false, 'killGold'), slot('rogue', 0, false, 'skill'), slot('sovereign', 0, false, 'skill')];
  const reference = clone(app.state().focusTeams.gold.teams.a);
  app.suggest(proposed);
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.state().focusTeams.gold.teams.b, proposed);
  assert.deepEqual(app.state().focusTeams.gold.teams.a, reference);
  const call = app.optimizationCalls.at(-1);
  assert.equal(call.focus, 'gold');
  assert.equal(call.settings.goldHero, 0);
  assert.equal(call.settings.goldSkills, true);
  for (const [, key, expected] of goldProfileFields) assert.equal(call.settings[key], expected);
  assert.doesNotMatch(app.elements.get('suggestion-note').textContent, /unscored|proxy/i);
  app.suggest(proposed);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  assert.deepEqual(app.state().focusTeams.gold.teams.a, proposed);
  assert.equal(app.optimizationCalls.at(-1).method, 'optimizePlacements');
  assert.doesNotMatch(app.elements.get('suggestion-note').textContent, /unscored|proxy/i);
});

test('Gold skill tiles display and score the confirmed 20 percent increase on each active named skill', async () => {
  const app = load(goldFixture()), baseline = app.evaluationCalls.at(-2).result.metrics.gold;
  await app.change('teams', {tile: 'a:1'}, 'skill');
  const withRogue = app.evaluationCalls.at(-2).result.metrics.gold;
  assert.ok(Math.abs(withRogue / baseline - (1 + 9684 / 100) / (1 + 8070 / 100)) < 1e-10);
  await app.change('teams', {tile: 'a:0'}, 'skill');
  const withHunter = app.evaluationCalls.at(-2).result.metrics.gold;
  assert.ok(Math.abs(withHunter / withRogue - (1 + 34464 / 100) / (1 + 28720 / 100)) < 1e-10);
  await app.change('teams', {tile: 'a:2'}, 'skill');
  const withSovereign = app.evaluationCalls.at(-2).result.metrics.gold;
  const expectedSovereign = ((1 + 1954.8 / 100) / (1 + 1629 / 100))
    * ((1 + 5 * 390.96 / 100) / (1 + 5 * 325.8 / 100));
  assert.ok(Math.abs(withSovereign / withHunter - expectedSovereign) < 1e-10);
  const panel = app.elements.get('gold-skill-breakdown');
  assert.equal(panel.hidden, false);
  for (const value of ['Rogue', 'Sovereign', 'Hunter', '9,684', '34,464', '390.96', '1,954.8']) assert.ok(panel.innerHTML.includes(value), `Skill breakdown should show ${value}`);
  assert.doesNotMatch(app.elements.get('gold-required-roster').textContent, /payout amounts are not yet modeled/);
  await app.focus('energy');
  assert.equal(panel.hidden, true);
  assert.equal(app.elements.get('gold-settings').hidden, true);
  assert.equal(app.elements.get('gold-placement-comparison').hidden, true);
});

test('Gold tile comparison recommends the larger payout and applies it only to the selected team', async () => {
  const app = load(goldFixture()), panel = app.elements.get('gold-placement-comparison');
  assert.equal(panel.hidden, false);
  for (const key of ['a', 'b']) for (const tile of ['milestone', 'killGold']) assert.match(panel.innerHTML, new RegExp(`data-gold-placement="${key}:${tile}"`));
  assert.match(panel.innerHTML, /Kill Gold/);
  assert.match(panel.innerHTML, /Milestone/);
  const before = clone(app.state().focusTeams.gold), oldScore = app.evaluationCalls.at(-2).result.metrics.gold;
  await app.click('gold-placement-comparison', {goldSwap: 'a'});
  const after = app.state().focusTeams.gold;
  assert.equal(after.teams.a[after.attackers.a].tile, 'killGold', 'at level zero the Kill Gold tile wins over a tile with no unlocked milestones');
  assert.deepEqual(after.teams.b, before.teams.b);
  assert.deepEqual(after.attackers, before.attackers);
  assert.deepEqual(after.names, before.names);
  assert.ok(app.evaluationCalls.at(-2).result.metrics.gold > oldScore);
  for (const [index, hero] of after.teams.a.entries()) {
    assert.equal(hero.id, before.teams.a[index].id);
    assert.equal(hero.level, before.teams.a[index].level);
    assert.equal(hero.locked, before.teams.a[index].locked);
  }
  assert.equal(load(await app.export()).state().focusTeams.gold.teams.a[0].tile, 'killGold');
});

function damageFixture(attacker = 'praetorian') {
  const initial = fixture(); initial.focus = 'damage'; initial.settings.snowFort = true;
  initial.focusTeams.damage.teams = {
    a: [slot(attacker, 0), slot('scout', 0), slot('deadeye', 0)],
    b: [slot(attacker, 0), slot('scout', 0), slot('deadeye', 0)]
  };
  initial.focusTeams.damage.attackers = {a: 0, b: 0};
  return initial;
}

test('version 7 migration adds Damage skill settings while preserving every saved focus team', () => {
  const initial = damageFixture(); initial.version = 7;
  for (const key of Object.keys(initial.settings)) if (/^damage/.test(key)) delete initial.settings[key];
  initial.focusTeams.damage.teams.a[0].locked = true;
  initial.focusTeams.damage.teams.a[0].level = 4321;
  const app = load(initial), migrated = app.state();
  assert.equal(migrated.version, 20);
  assert.deepEqual(migrated.focusTeams, migratedFocusTeams(initial));
  assert.equal(migrated.settings.damageSkills, true);
  assert.equal(migrated.settings.damageTile, 2475);
  assert.equal(migrated.settings.damageWardenDistance, 10.7);
  assert.equal(migrated.settings.damageWardenReferenceDistance, 10.7);
  assert.equal(migrated.settings.damageWardenReferenceBonus, 180249);
  assert.equal(migrated.settings.damageSkillTileBoost, 20);
  assert.equal(migrated.settings.damageMasteryTileBoost, 20);
  assert.equal(app.elements.get('damage-skills').checked, true);
  assert.equal(Number(app.elements.get('damage-tile').value), 2475);
  assert.equal(Number(app.elements.get('damage-warden-distance').value), 10.7);
  assert.equal(app.elements.get('migration-notice').hidden, false);
  assert.match(app.elements.get('migration-description').textContent, /Damage|damage/);
  assert.equal(load(migrated).elements.get('migration-notice').hidden, true);
});

test('Damage configuration persists and reaches both suggestion paths without changing other lineups', async () => {
  const app = load(damageFixture()), original = clone(app.state().focusTeams);
  await app.change('damage-tile', null, 3000);
  await app.change('damage-warden-distance', null, 12.5);
  await app.check('damage-skills', false);
  await app.focus('gold'); await app.focus('damage');
  assert.equal(app.elements.get('damage-skills').checked, false);
  assert.equal(Number(app.elements.get('damage-tile').value), 3000);
  assert.equal(Number(app.elements.get('damage-warden-distance').value), 12.5);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.focus, 'damage');
    assert.equal(call.settings.damageSkills, false);
    assert.equal(call.settings.damageTile, 3000);
    assert.equal(call.settings.damageWardenDistance, 12.5);
    assert.equal(call.settings.damageHero, 0);
  }
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(restored.state(), exported);
  for (const focus of focuses.filter(key => key !== 'damage')) assert.deepEqual(app.state().focusTeams[focus], original[focus]);
});

test('Damage profile editor updates captured bonuses and preserves them across profile switches and imports', async () => {
  const app = load(damageFixture()), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.change('damage-profile-hero', null, 'praetorian');
  assert.match(app.elements.get('damage-profile-fields').innerHTML, /damagePraetorianSuperCritDamage/);
  await app.change('damage-profile-fields', {damageField: 'damagePraetorianSuperCritDamage'}, 2000);
  assert.equal(app.state().settings.damagePraetorianSuperCritDamage, 2000);
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / baseline - 21 / 72.8) < 1e-10);
  await app.change('damage-profile-hero', null, 'dicemaster');
  assert.match(app.elements.get('damage-profile-fields').innerHTML, /damageDicemasterMaxRollChance/);
  await app.change('damage-profile-fields', {damageField: 'damageDicemasterMaxRollChance'}, 50);
  assert.equal(app.state().settings.damageDicemasterMaxRollChance, 50);
  await app.change('damage-profile-hero', null, 'praetorian');
  assert.match(app.elements.get('damage-profile-fields').innerHTML, /data-damage-field="damagePraetorianSuperCritDamage"[^>]*value="2000"|value="2000"[^>]*data-damage-field="damagePraetorianSuperCritDamage"/);
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) {
    assert.equal(restored.state().settings.damagePraetorianSuperCritDamage, 2000);
    assert.equal(restored.state().settings.damageDicemasterMaxRollChance, 50);
  }
  const before = clone(app.state().settings);
  await app.change('damage-profile-fields', {damageField: 'notARealField'}, 99999);
  assert.deepEqual(app.state().settings, before);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.settings.damagePraetorianSuperCritDamage, 2000);
    assert.equal(call.settings.damageDicemasterMaxRollChance, 50);
  }
});

test('Damage skill toggle changes only Damage and skill bonuses remain personal to their owners', async () => {
  const app = load(damageFixture()), originalTeams = clone(app.state().focusTeams);
  const enabled = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  await app.check('damage-skills', false);
  const disabled = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  for (let index = 0; index < 2; index++) {
    assert.ok(enabled[index].damage > disabled[index].damage);
    for (const key of ['energy', 'powerMageEnergy', 'gold', 'experience']) assert.equal(disabled[index][key], enabled[index][key]);
  }
  await app.check('damage-skills', true);
  assert.deepEqual(app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics)), enabled);
  assert.deepEqual(app.state().focusTeams, originalTeams);
  await app.change('teams', {attacker: 'a'}, 1); // Scout has no configured skill; Praetorian and Deadeye are supports.
  const supportSkillsOn = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.check('damage-skills', false);
  assert.equal(app.evaluationCalls.at(-2).result.metrics.damage, supportSkillsOn);
});

test('Damage tile applies only to its occupant and enforces a single Damage tile per team', async () => {
  const app = load(damageFixture()), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.change('teams', {tile: 'a:0'}, 'damage');
  assert.equal(app.state().focusTeams.damage.teams.a[0].tile, 'damage');
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / baseline - 25.75) < 1e-10);
  const before = clone(app.state());
  await app.change('teams', {tile: 'a:1'}, 'damage');
  assert.deepEqual(app.state(), before);
  assert.equal(app.elements.get('alert').hidden, false);
  await app.change('teams', {tile: 'a:0'}, 'normal');
  await app.change('teams', {tile: 'a:1'}, 'damage');
  assert.equal(app.evaluationCalls.at(-2).result.metrics.damage, baseline);
  await app.change('teams', {tile: 'a:0'}, 'killGold');
  assert.equal(app.state().focusTeams.damage.teams.a[0].tile, 'killGold', 'Damage and Kill Gold have independent capacities');
});

test('Damage placements survive copy swap focus switching and exports and reject invalid inactive imports', async () => {
  const app = load(damageFixture());
  await app.change('teams', {tile: 'a:0'}, 'damage');
  await app.click('copy-team');
  await app.change('teams', {tile: 'a:0'}, 'normal');
  await app.click('swap-teams');
  assert.equal(app.state().focusTeams.damage.teams.a[0].tile, 'damage');
  assert.equal(app.state().focusTeams.damage.teams.b[0].tile, 'normal');
  await app.focus('energy');
  const exported = await app.export(), reloaded = load(exported), imported = load(); await imported.import(exported);
  for (const restored of [reloaded, imported]) {
    assert.deepEqual(restored.state(), exported);
    await restored.focus('damage');
    assert.equal(restored.state().focusTeams.damage.teams.a[0].tile, 'damage');
  }
  const before = app.state(), invalid = clone(before);
  invalid.focusTeams.damage.teams.a[1].tile = 'damage';
  await app.import(invalid);
  assert.match(app.elements.get('alert').textContent, /Could not import setup/);
  assert.deepEqual(app.state(), before);
});

test('Damage skill tile scales both active and mastery bonuses and Warden distance is explicit', async () => {
  const app = load(damageFixture()), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.change('teams', {tile: 'a:0'}, 'skill');
  const actual = app.evaluationCalls.at(-2).result.metrics.damage / baseline;
  const expected = ((1 + 8616 / 100) / (1 + 7180 / 100))
    * ((1 + 7414.8 / 100) / (1 + 6179 / 100))
    * ((1 + 5 * (1723.2 + 148.8) / 100) / (1 + 5 * (1436 + 124) / 100));
  assert.ok(Math.abs(actual - expected) < 1e-10);
  const panel = app.elements.get('damage-skill-breakdown');
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Praetorian/);
  assert.match(panel.innerHTML, /Ion Blades/);
  const warden = load(damageFixture('warden')), atReferenceDistance = warden.evaluationCalls.at(-2).result.metrics.damage;
  await warden.change('damage-warden-distance', null, 5.35);
  assert.equal(warden.state().settings.damageWardenDistance, 5.35);
  assert.ok(Math.abs(warden.evaluationCalls.at(-2).result.metrics.damage / atReferenceDistance - (1 + 180249 / 2 / 100) / (1 + 180249 / 100)) < 1e-10);
  const original = clone(warden.state().focusTeams.damage);
  await warden.focus('gold'); await warden.focus('damage');
  assert.deepEqual(warden.state().focusTeams.damage, original);
  assert.equal(Number(warden.elements.get('damage-warden-distance').value), 5.35);
});

test('Damage comparison recommends a scored tile and applies it only to the selected team', async () => {
  const app = load(damageFixture('militia')), panel = app.elements.get('damage-placement-comparison');
  assert.equal(panel.hidden, false);
  for (const key of ['a', 'b']) for (const tile of ['normal', 'milestone', 'synergy', 'skill', 'damage'])
    assert.match(panel.innerHTML, new RegExp(`data-damage-placement="${key}:${tile}"`));
  const before = clone(app.state().focusTeams.damage), oldScore = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.click('damage-placement-comparison', {damageSwap: 'a'});
  const after = app.state().focusTeams.damage;
  assert.equal(after.teams.a[0].tile, 'damage', 'with no unlocked milestones or known skill, +2475% Damage wins');
  assert.deepEqual(after.teams.b, before.teams.b);
  assert.deepEqual(after.attackers, before.attackers);
  assert.deepEqual(after.names, before.names);
  assert.ok(app.evaluationCalls.at(-2).result.metrics.damage > oldScore);
  for (const [index, hero] of after.teams.a.entries()) for (const key of ['id', 'level', 'locked']) assert.equal(hero[key], before.teams.a[index][key]);
  await app.focus('energy');
  for (const id of ['damage-settings', 'damage-placement-comparison', 'damage-skill-breakdown']) assert.equal(app.elements.get(id).hidden, true);
  await app.focus('damage');
  for (const id of ['damage-settings', 'damage-placement-comparison', 'damage-skill-breakdown']) assert.equal(app.elements.get(id).hidden, false);
});

test('Damage suggestions retain skill settings and auto attacker selection uses the resulting skill score', async () => {
  const app = load(damageFixture('militia')), originalA = clone(app.state().focusTeams.damage.teams.a);
  await app.check('choose-attacker', true);
  const proposed = [slot('militia', 0, false, 'damage'), slot('deadeye', 0, false, 'skill')];
  app.suggest(proposed);
  await app.click('optimize'); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, 'best');
  assert.equal(app.optimizationCalls.at(-1).settings.damageSkills, true);
  assert.equal(app.optimizationCalls.at(-1).settings.damageTile, 2475);
  assert.deepEqual(app.state().focusTeams.damage.teams.b, proposed);
  assert.equal(app.state().focusTeams.damage.attackers.b, 1, 'captured Deadeye skill outranks an unbuffed zero-level Militia');
  assert.deepEqual(app.state().focusTeams.damage.teams.a, originalA);
  assert.doesNotMatch(app.elements.get('suggestion-note').textContent, /skill DPS is not modeled|personal skill-power.*proxy/i);
  app.suggest(proposed);
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  assert.equal(app.optimizationCalls.at(-1).settings.damageHero, 1, 'tile search keeps the selected attacker');
  assert.equal(app.optimizationCalls.at(-1).focus, 'damage');
  assert.deepEqual(app.state().focusTeams.damage.teams.b, proposed);
  assert.doesNotMatch(app.elements.get('suggestion-note').textContent, /skill DPS is not modeled|personal skill-power.*proxy/i);
});

function damageSupportFixture(supports = ['druid'], attacker = 'militia') {
  const initial = damageFixture(attacker);
  initial.settings.maxTier = 1;
  initial.focusTeams.damage.teams = Object.fromEntries(['a', 'b'].map(key => [key, [slot(attacker, 0), ...supports.map(id => slot(id, 0))]]));
  return initial;
}

function buffSwapFixture(supports = ['titan', 'witch', 'apprentice'], attacker = 'praetorian') {
  const initial = damageSupportFixture(supports, attacker);
  initial.focus = 'damageBuffSwap';
  initial.focusTeams.damageBuffSwap = clone(initial.focusTeams.damage);
  initial.focusTeams.damageBuffSwap.names = {a: 'Buff swap A', b: 'Buff swap B'};
  return initial;
}

test('version 10 adds independent buff-swap copies of Damage A/B and preserves explicit kill stacks', async () => {
  const initial = damageSupportFixture(['witch', 'apprentice', 'titan'], 'warden'); initial.version = 10;
  delete initial.focusTeams.damageBuffSwap;
  initial.settings.damageSupportStacks = 37;
  initial.focusTeams.damage.names = {a: 'My damage', b: 'My challenger'};
  initial.focusTeams.damage.chooseAttacker = true;
  initial.focusTeams.damage.teams.a[0] = slot('warden', 12000, true, 'damage');
  initial.focusTeams.damage.teams.b[0] = slot('praetorian', 14000, false, 'skill');
  const app = load(initial), migrated = app.state();
  assert.equal(migrated.version, 20);
  assert.equal(migrated.settings.damageSupportStacks, 37);
  assert.deepEqual(migrated.settings, {...initial.settings, chanceReferences:clone(app.engine.defaultChanceReferences())});
  assert.deepEqual(migrated.focusTeams, migratedFocusTeams(initial));
  assert.deepEqual(migrated.focusTeams.damageBuffSwap, migrated.focusTeams.damage);
  assert.equal(app.elements.get('migration-notice').hidden, false);
  assert.match(app.elements.get('migration-description').textContent, /Buff swap starts with its own copy/);
  const imported = load(); await imported.import(initial);
  assert.deepEqual(imported.state(), migrated);
  await app.focus('damageBuffSwap');
  await app.change('teams', {level: 'a:0'}, 9876);
  await app.change('teams', {name: 'a'}, 'Separate deployed team');
  await app.change('teams', {attacker: 'b'}, 1);
  await app.check('choose-attacker', false);
  assert.deepEqual(app.state().focusTeams.damage, migrated.focusTeams.damage);
  const exported = await app.export();
  assert.deepEqual(load(exported).state(), exported);
  assert.equal(load(exported).elements.get('migration-notice').hidden, true);
});

test('buff-swap comparisons score only the chosen attacker and deployed Witch/Apprentice debuffs', async () => {
  const app = load(buffSwapFixture()), settings = clone(app.state().settings);
  assert.match(app.elements.get('focus-controls').innerHTML, /data-focus="damageBuffSwap"/);
  assert.match(app.elements.get('teams').innerHTML, /data-attacker="a"/);
  assert.equal(app.elements.get('attacker-search-option').hidden, false);
  for (const call of app.evaluationCalls.slice(-2)) {
    assert.equal(call.settings.damageSupportMode, 'debuffs');
    assertSingleAttacker(call, 0);
    assert.deepEqual(Array.from(call.result.damageSupportSkills.skills, skill => skill.id), ['witch', 'apprentice']);
    assert.ok(call.result.heroes[0].damageSkill.activeEffects.length > 0);
  }
  const buffDamage = app.evaluationCalls.at(-2).result.metrics.damage;
  const breakdown = app.elements.get('damage-support-breakdown').innerHTML;
  assert.match(breakdown, /Witch/); assert.match(breakdown, /Apprentice/);
  assert.doesNotMatch(breakdown, /data-damage-support="[ab]:titan"/);
  assert.doesNotMatch(app.elements.get('metrics').innerHTML, /NaN|undefined/);
  await app.change('teams', {attacker: 'a'}, 1);
  assertSingleAttacker(app.evaluationCalls.at(-2), 1);
  assert.equal(app.evaluationCalls.at(-2).settings.damageSupportMode, 'debuffs');
  await app.focus('damage');
  for (const call of app.evaluationCalls.slice(-2)) {
    assert.equal(call.settings.damageSupportMode, 'all');
    assert.ok(call.result.damageSupportSkills.skills.some(skill => skill.id === 'titan'));
  }
  assert.ok(app.evaluationCalls.at(-2).result.metrics.damage > buffDamage);
  assert.deepEqual(app.state().settings, settings, 'Switching modes must not rewrite shared skill settings');
  await app.focus('gold');
  assert.equal(app.evaluationCalls.at(-2).settings.damageSupportMode, 'all');
});

test('buff-swap debuff skill tiles still use the first copy and leave other support skills unscored', async () => {
  const app = load(buffSwapFixture(['witch', 'witch', 'titan'], 'militia'));
  const score = () => app.evaluationCalls.at(-2).result.metrics.damage;
  const baseline = score();
  await app.change('teams', {tile: 'a:2'}, 'skill');
  assert.equal(score(), baseline);
  await app.change('teams', {tile: 'a:3'}, 'skill');
  assert.equal(score(), baseline, 'A deployed Titan skill tile has no support skill effect in buff-swap mode');
  await app.change('teams', {tile: 'a:1'}, 'skill');
  assert.ok(score() > baseline);
  const skills = app.evaluationCalls.at(-2).result.damageSupportSkills.skills;
  assert.equal(skills.length, 1);
  assert.equal(skills[0].id, 'witch');
  assert.equal(skills[0].ownerIndex, 1);
  assert.equal(skills[0].tileBoost, 1.2);
});

test('buff-swap fixed-attacker team and placement searches use the Damage objective with debuffs only', async () => {
  const app = load(buffSwapFixture()), normalDamage = clone(app.state().focusTeams.damage);
  await app.change('teams', {attacker: 'b'}, 1);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('teams', {suggestTiles: 'b'}); await app.flush();
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.map(call => [call.method, call.focus, call.settings.damageHero, call.settings.damageSupportMode]),
    [['optimizePlacements', 'damage', 0, 'debuffs'], ['optimizePlacements', 'damage', 1, 'debuffs'], ['optimizeTeam', 'damage', 1, 'debuffs']]);
  assert.deepEqual(app.state().focusTeams.damage, normalDamage);
  assert.equal(app.elements.get('alert').hidden, true);
  assert.doesNotMatch(app.elements.get('suggestion-note').textContent, /NaN|undefined|skill DPS is not modeled|personal skill-power.*proxy/i);
});

test('buff-swap best-attacker search and attacker recovery evaluate under the same debuff rules', async () => {
  const app = load(buffSwapFixture([], 'militia')), before = clone(app.state().focusTeams.damageBuffSwap);
  await app.check('choose-attacker', true);
  const proposed = [slot('militia', 0, false, 'damage'), slot('deadeye', 0, false, 'skill'), slot('titan', 0)];
  app.suggest(proposed);
  const startCalls = app.evaluationCalls.length;
  await app.click('optimize'); await app.flush();
  const search = app.optimizationCalls.at(-1);
  assert.equal(search.focus, 'damage');
  assert.equal(search.settings.damageHero, 'best');
  assert.equal(search.settings.damageSupportMode, 'debuffs');
  const result = app.state().focusTeams.damageBuffSwap;
  assert.equal(result.attackers.b, 1);
  assert.deepEqual(result.teams.a, before.teams.a);
  assert.ok(app.evaluationCalls.slice(startCalls).every(call => call.settings.damageSupportMode === 'debuffs'));
  assertSingleAttacker(app.evaluationCalls.at(-1), 1);
  assert.match(app.elements.get('suggestion-note').textContent, /Selected Deadeye/);
  await app.click('teams', {remove: 'b:1'});
  const recovery = app.evaluationCalls.slice(-3);
  assert.ok(recovery.every(call => call.settings.damageSupportMode === 'debuffs'));
  assertSingleAttacker(app.evaluationCalls.at(-1), app.state().focusTeams.damageBuffSwap.attackers.b);
});

test('buff-swap exposes attacker tools and only its eligible debuff profiles', async () => {
  const app = load(buffSwapFixture());
  const sections = ['damage-settings', 'damage-support-settings', 'damage-placement-comparison', 'damage-skill-breakdown', 'damage-support-breakdown'];
  for (const id of sections) assert.equal(app.elements.get(id).hidden, false, `${id} remains available for buff swap`);
  assert.equal(app.elements.get('damage-full-support-scenario').hidden, true);
  assert.equal(app.elements.get('damage-buff-swap-note').hidden, false);
  assert.equal(app.elements.get('damage-support-title').textContent, 'Witch & Apprentice debuffs');
  const options = () => [...app.elements.get('damage-support-profile-hero').innerHTML.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(options().sort(), ['apprentice', 'witch']);
  await app.change('damage-support-profile-hero', null, 'witch');
  await app.change('damage-support-profile-fields', {damageSupportField: 'damageSupportWitchDamageTaken'}, 9000);
  await app.focus('damage');
  assert.equal(app.elements.get('damage-full-support-scenario').hidden, false);
  assert.equal(app.elements.get('damage-buff-swap-note').hidden, true);
  assert.ok(options().includes('titan'));
  await app.change('damage-support-profile-hero', null, 'titan');
  await app.focus('damageBuffSwap');
  assert.equal(app.elements.get('damage-full-support-scenario').hidden, true);
  assert.deepEqual(options().sort(), ['apprentice', 'witch']);
  assert.doesNotMatch(app.elements.get('damage-support-profile-fields').innerHTML, /damageSupportTitan/);
  assert.equal(app.state().settings.damageSupportWitchDamageTaken, 9000);
  await app.focus('energy');
  for (const id of sections) assert.equal(app.elements.get(id).hidden, true);
});

test('buff-swap attacker tile comparison applies its recommendation only to that saved pair', async () => {
  const app = load(buffSwapFixture([], 'militia')), before = clone(app.state().focusTeams);
  const panel = app.elements.get('damage-placement-comparison');
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /data-damage-placement="a:damage"/);
  await app.click('damage-placement-comparison', {damageSwap: 'a'});
  assert.equal(app.state().focusTeams.damageBuffSwap.teams.a[0].tile, 'damage');
  assert.deepEqual(app.state().focusTeams.damageBuffSwap.teams.b, before.damageBuffSwap.teams.b);
  for (const focus of focuses.filter(key => key !== 'damageBuffSwap')) assert.deepEqual(app.state().focusTeams[focus], before[focus]);
});

test('version 8 migration adds Damage support profiles without changing teams or captured attacker settings', () => {
  const initial = damageSupportFixture(['druid', 'wizard']); initial.version = 8;
  for (const key of Object.keys(initial.settings)) if (/^damageSupport|^damageNecromancerRoll$/.test(key)) delete initial.settings[key];
  initial.settings.damageSkills = false;
  initial.settings.damageWardenDistance = 4.25;
  initial.settings.damageWardenReferenceDistance = 10.7;
  initial.settings.damageWardenReferenceBonus = 180249;
  initial.settings.damagePraetorianSuperCritDamage = 9000;
  initial.focusTeams.damage.teams.a[0] = slot('warden', 4321, true, 'damage');
  const app = load(initial), migrated = app.state();
  assert.equal(migrated.version, 20);
  assert.deepEqual(migrated.focusTeams, migratedFocusTeams(initial));
  for (const [key, value] of Object.entries(initial.settings)) assert.deepEqual(migrated.settings[key], key === 'chanceReferences' ? clone(app.engine.defaultChanceReferences()) : value, `Existing setting ${key} should survive migration`);
  for (const [key, value] of Object.entries({damageSupportSkills: true, damageSupportSeconds: 20, damageSupportStacks: 0,
    damageSupportTeleports: 3, damageNecromancerRoll: 'midpoint', damageSupportDruidDamage: 7180,
    damageSupportDruidDamagePerSecond: 82.4, damageSupportWizardTripleShotChance: 206, damageSupportNecromancerDamageMax: 8070}))
    assert.equal(migrated.settings[key], value);
  assert.equal(app.elements.get('damage-support-skills').checked, true);
  assert.equal(app.elements.get('damage-necromancer-roll').value, 'midpoint');
  assert.equal(app.elements.get('migration-notice').hidden, false);
  assert.equal(load(migrated).elements.get('migration-notice').hidden, true);
});

test('Damage support settings persist across focuses reload export import and both suggestion paths', async () => {
  const app = load(damageSupportFixture()), originalTeams = clone(app.state().focusTeams);
  await app.change('damage-support-seconds', null, 7.5);
  await app.change('damage-support-stacks', null, 150);
  await app.change('damage-support-teleports', null, 4);
  await app.change('damage-necromancer-roll', null, 'maximum');
  await app.check('damage-support-skills', false);
  await app.focus('gold'); await app.focus('damage');
  assert.equal(app.elements.get('damage-support-skills').checked, false);
  assert.equal(Number(app.elements.get('damage-support-seconds').value), 7.5);
  assert.equal(Number(app.elements.get('damage-support-stacks').value), 150);
  assert.equal(Number(app.elements.get('damage-support-teleports').value), 4);
  assert.equal(app.elements.get('damage-necromancer-roll').value, 'maximum');
  assert.deepEqual(app.state().focusTeams, originalTeams);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.focus, 'damage');
    assert.equal(call.settings.damageSupportSkills, false);
    assert.equal(call.settings.damageSupportSeconds, 7.5);
    assert.equal(call.settings.damageSupportStacks, 150);
    assert.equal(call.settings.damageSupportTeleports, 4);
    assert.equal(call.settings.damageNecromancerRoll, 'maximum');
    assert.equal(call.settings.damageWardenDistance, 10.7);
    assert.equal(call.settings.damageWardenReferenceBonus, 180249);
  }
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(restored.state(), exported);
});

test('pre-10 saves adopt zero kill stacks once while keeping time, teleports, profiles and every team', async () => {
  for (const previousStacks of [undefined, 0, 20, 100, 150]) {
    const initial = damageSupportFixture(['battlemage', 'spelldancer', 'druid']); initial.version = 9;
    if (previousStacks === undefined) delete initial.settings.damageSupportStacks;
    else initial.settings.damageSupportStacks = previousStacks;
    initial.settings.damageSupportSeconds = 13;
    initial.settings.damageSupportTeleports = 5;
    initial.settings.damageSupportSpelldancerCritDamagePerStack = 150;
    const app = load(initial), migrated = app.state();
    assert.equal(migrated.version, 20);
    assert.equal(migrated.settings.damageSupportStacks, 0);
    assert.deepEqual(migrated.focusTeams, migratedFocusTeams(initial));
    assert.deepEqual(migrated.supportRanking, initial.supportRanking);
    for (const [key, value] of Object.entries(initial.settings)) if (key !== 'damageSupportStacks')
      assert.deepEqual(migrated.settings[key], key === 'chanceReferences' ? clone(app.engine.defaultChanceReferences()) : value, `${key} survives the zero-kill migration`);
    assert.equal(Number(app.elements.get('damage-support-stacks').value), 0);
    assert.equal(app.elements.get('migration-notice').hidden, false);
    for (const call of app.evaluationCalls.slice(-2)) assert.equal(call.settings.damageSupportStacks, 0);
    const imported = load(); await imported.import(initial);
    assert.deepEqual(imported.state(), migrated, 'Import uses the same one-time migration as local saves');
    await app.change('damage-support-stacks', null, 25);
    const exported = await app.export();
    assert.equal(exported.version, 20);
    assert.equal(exported.settings.damageSupportStacks, 25);
    const reloaded = load(exported); await imported.import(exported);
    for (const restored of [reloaded, imported]) {
      assert.deepEqual(restored.state(), exported, 'Explicit changes in the current format survive reload and import');
      assert.equal(restored.elements.get('migration-notice').hidden, true);
    }
  }
});

test('zero-kill pushing default reaches comparisons, rankings and both Damage suggestion paths', async () => {
  const app = load(damageSupportFixture(['battlemage', 'spelldancer', 'druid']));
  assert.equal(app.state().settings.damageSupportStacks, 0);
  assert.equal(app.state().settings.damageSupportSeconds, 20);
  assert.equal(app.state().settings.damageSupportTeleports, 3);
  assert.equal(Number(app.elements.get('damage-support-stacks').value), 0);
  for (const call of app.evaluationCalls.slice(-2)) {
    const skills = call.result.damageSupportSkills.skills;
    for (const id of ['battlemage', 'spelldancer']) {
      const skill = skills.find(entry => entry.id === id);
      assert.equal(skill.masteryEffects.length, 0, `${id} has no kill-earned mastery`);
      assert.ok(skill.activeEffects.length > 0, `${id} still contributes its active buff`);
    }
    assert.ok(Math.abs(skills.find(entry => entry.id === 'druid').factor - 72.8 * 17.48) < 1e-8,
      'Twenty seconds of Druid buildup does not require kills');
  }
  await app.click('support-rankings', {supportHero: 'spelldancer'});
  const report = assertSupportRankingValues(app);
  assert.equal(report.damageSupportContext.stacks, 0);
  assert.equal(report.damageSupportContext.seconds, 20);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.focus, 'damage');
    assert.equal(call.settings.damageSupportStacks, 0);
    assert.equal(call.settings.damageSupportSeconds, 20);
  }
});

test('Damage support toggle changes only Damage and remains independent of attacker skills', async () => {
  const app = load(damageSupportFixture(['druid'], 'praetorian')), originalTeams = clone(app.state().focusTeams);
  const enabled = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  await app.check('damage-support-skills', false);
  const disabled = app.evaluationCalls.slice(-2).map(call => clone(call.result.metrics));
  for (let index = 0; index < 2; index++) {
    assert.ok(Math.abs(enabled[index].damage / disabled[index].damage - 72.8 * 17.48) < 1e-8);
    for (const key of ['energy', 'powerMageEnergy', 'gold', 'experience']) assert.equal(disabled[index][key], enabled[index][key]);
  }
  assert.equal(app.state().settings.damageSkills, true);
  await app.check('damage-skills', false);
  const bothOff = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.check('damage-support-skills', true);
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / bothOff - 72.8 * 17.48) < 1e-8);
  assert.equal(app.state().settings.damageSkills, false);
  assert.deepEqual(app.state().focusTeams, originalTeams);
});

test('Damage support skills use the first duplicate owner and only that copy receives skill tile boosts', async () => {
  const app = load(damageSupportFixture(['druid', 'druid'])), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  const support = () => app.evaluationCalls.at(-2).result.damageSupportSkills;
  assert.equal(support().skills.length, 1);
  assert.equal(support().skills[0].id, 'druid');
  assert.equal(support().skills[0].ownerIndex, 1);
  await app.change('teams', {tile: 'a:2'}, 'skill');
  assert.equal(app.evaluationCalls.at(-2).result.metrics.damage, baseline, 'A skill tile on a later duplicate must not strengthen the first caster');
  assert.equal(support().skills[0].tileBoost, 1);
  await app.change('teams', {tile: 'a:1'}, 'skill');
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / baseline - (87.16 * 20.776) / (72.8 * 17.48)) < 1e-10);
  assert.equal(support().skills[0].tileBoost, 1.2);
  assert.equal(support().skills[0].masteryTileBoost, 1.2);
  assert.equal(support().skills[0].ownerIndex, 1);
  const panel = app.elements.get('damage-support-breakdown');
  assert.equal(panel.hidden, false);
  for (const key of ['a', 'b']) {
    assert.equal((panel.innerHTML.match(new RegExp(`data-damage-support="${key}:druid"`, 'g')) || []).length, 1, 'Each team should show one Druid buff owner');
    assert.match(panel.innerHTML.match(new RegExp(`<tr data-damage-support="${key}:druid">([^]*?)</tr>`))[1], /Slot 2 · first copy/);
  }
  for (const value of ['Druid', '8,616', '1,977.6']) assert.ok(panel.innerHTML.includes(value), `Support breakdown should show ${value}`);
  await app.focus('energy'); assert.equal(panel.hidden, true); assert.equal(app.elements.get('damage-support-settings').hidden, true);
  await app.focus('damage'); assert.equal(panel.hidden, false); assert.equal(app.elements.get('damage-support-settings').hidden, false);
});

test('Damage support profile edits affect the score and survive editor switches reload import and suggestions', async () => {
  const app = load(damageSupportFixture()), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.change('damage-support-profile-hero', null, 'druid');
  assert.match(app.elements.get('damage-support-profile-fields').innerHTML, /damageSupportDruidDamagePerSecond/);
  await app.change('damage-support-profile-fields', {damageSupportField: 'damageSupportDruidDamage'}, 9000);
  await app.change('damage-support-profile-fields', {damageSupportField: 'damageSupportDruidDamagePerSecond'}, 100);
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / baseline - (91 * 21) / (72.8 * 17.48)) < 1e-10);
  await app.change('damage-support-profile-hero', null, 'necromancer');
  assert.match(app.elements.get('damage-support-profile-fields').innerHTML, /damageSupportNecromancerDamageMax/);
  await app.change('damage-support-profile-hero', null, 'druid');
  assert.match(app.elements.get('damage-support-profile-fields').innerHTML, /data-damage-support-field="damageSupportDruidDamage"[^>]*value="9000"|value="9000"[^>]*data-damage-support-field="damageSupportDruidDamage"/);
  const before = clone(app.state().settings);
  await app.change('damage-support-profile-fields', {damageSupportField: 'unknownSupportField'}, 99999);
  assert.deepEqual(app.state().settings, before);
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) {
    assert.equal(restored.state().settings.damageSupportDruidDamage, 9000);
    assert.equal(restored.state().settings.damageSupportDruidDamagePerSecond, 100);
  }
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.settings.damageSupportDruidDamage, 9000);
    assert.equal(call.settings.damageSupportDruidDamagePerSecond, 100);
  }
});

test('Necromancer defaults to midpoint bonuses and maximum roll is an explicit Damage scenario', async () => {
  const app = load(damageSupportFixture(['necromancer'])), midpoint = app.evaluationCalls.at(-2).result.metrics.damage;
  assert.equal(app.elements.get('damage-necromancer-roll').value, 'midpoint');
  await app.change('damage-necromancer-roll', null, 'maximum');
  const expected = (81.7 * 81.7 * 11.3 * 7.18 * 3.06) / (41.475 * 41.475 * 6.175 * 4.105 * 2.035);
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / midpoint - expected) < 1e-10);
  assert.equal(app.evaluationCalls.at(-2).result.damageSupportSkills.necromancerRoll, 'maximum');
  await app.change('damage-necromancer-roll', null, 'midpoint');
  assert.equal(app.evaluationCalls.at(-2).result.metrics.damage, midpoint);
});

test('Wizard triple-shot chance caps at a three-times factor when the support gets a skill tile', async () => {
  const app = load(damageSupportFixture(['wizard'])), baseline = app.evaluationCalls.at(-2).result.metrics.damage;
  await app.check('damage-support-skills', false);
  const withoutSupport = app.evaluationCalls.at(-2).result.metrics.damage;
  assert.ok(Math.abs(baseline / withoutSupport - 72.8 * 3) < 1e-10);
  await app.check('damage-support-skills', true);
  await app.change('teams', {tile: 'a:1'}, 'skill');
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.damage / baseline - 87.16 / 72.8) < 1e-10);
  assert.match(app.elements.get('damage-support-breakdown').innerHTML, /Wizard/);
});

function crusaderGoldFixture() {
  const initial = goldFixture();
  initial.focusTeams.gold.teams = {
    a: [slot('crusader', 0), slot('scout', 0), slot('crusader', 0)],
    b: [slot('crusader', 0), slot('scout', 0), slot('crusader', 0)]
  };
  initial.focusTeams.gold.attackers = {a: 0, b: 1};
  return initial;
}

test('current saves receive missing Crusader Gold defaults without changing any saved comparison', () => {
  const initial = crusaderGoldFixture();
  for (const key of ['goldCrusaderBonus', 'goldCrusaderMastery', 'goldCrusaderAttacks']) delete initial.settings[key];
  initial.focusTeams.gold.teams.a[0] = slot('crusader', 4321, true, 'skill');
  initial.settings.damageWardenDistance = 5.35;
  const app = load(initial), restored = app.state();
  assert.equal(restored.version, 20);
  assert.deepEqual(restored.focusTeams, initial.focusTeams);
  assert.equal(restored.settings.damageWardenDistance, 5.35);
  for (const [id, key, value] of [['gold-crusader-bonus', 'goldCrusaderBonus', 6420], ['gold-crusader-mastery', 'goldCrusaderMastery', 20.6], ['gold-crusader-attacks', 'goldCrusaderAttacks', 1]]) {
    assert.equal(restored.settings[key], value);
    assert.equal(Number(app.elements.get(id).value), value);
  }
  assert.equal(app.elements.get('migration-notice').hidden, true, 'New optional settings do not require a format migration');
});

test('Crusader attack count is normalized on input and import and skill controls follow the Gold toggle', async () => {
  const app = load(crusaderGoldFixture());
  for (const [input, expected] of [[-3, 0], [2.9, 2], [1000001, 1000000], ['not a number', 1]]) {
    await app.change('gold-crusader-attacks', null, input);
    assert.equal(app.state().settings.goldCrusaderAttacks, expected);
    assert.equal(Number(app.elements.get('gold-crusader-attacks').value), expected);
  }
  for (const [input, expected] of [[-4, 0], [8.7, 8], [2000000, 1000000]]) {
    const imported = crusaderGoldFixture(); imported.settings.goldCrusaderAttacks = input;
    await app.import(imported);
    assert.equal(app.state().settings.goldCrusaderAttacks, expected);
    assert.equal(load(imported).state().settings.goldCrusaderAttacks, expected);
  }
  await app.check('gold-skills', false);
  for (const id of ['gold-crusader-bonus', 'gold-crusader-mastery', 'gold-crusader-attacks']) assert.equal(app.elements.get(id).disabled, true);
  await app.check('gold-skills', true);
  for (const id of ['gold-crusader-bonus', 'gold-crusader-mastery', 'gold-crusader-attacks']) assert.equal(app.elements.get(id).disabled, false);
});

test('Crusader Gold settings persist across focuses reload export import and reach both suggestion paths', async () => {
  const app = load(crusaderGoldFixture()), original = clone(app.state().focusTeams);
  await app.change('gold-crusader-bonus', null, 7000);
  await app.change('gold-crusader-mastery', null, 25.5);
  await app.change('gold-crusader-attacks', null, 123);
  await app.focus('damage'); await app.focus('gold');
  assert.deepEqual(app.state().focusTeams, original);
  assert.equal(Number(app.elements.get('gold-crusader-bonus').value), 7000);
  assert.equal(Number(app.elements.get('gold-crusader-mastery').value), 25.5);
  assert.equal(Number(app.elements.get('gold-crusader-attacks').value), 123);
  await app.click('teams', {suggestTiles: 'a'}); await app.flush();
  await app.click('optimize'); await app.flush();
  for (const call of app.optimizationCalls.slice(-2)) {
    assert.equal(call.focus, 'gold');
    assert.equal(call.settings.goldCrusaderBonus, 7000);
    assert.equal(call.settings.goldCrusaderMastery, 25.5);
    assert.equal(call.settings.goldCrusaderAttacks, 123);
  }
  const exported = await app.export(), imported = load(); await imported.import(exported);
  for (const restored of [load(exported), imported]) assert.deepEqual(restored.state(), exported);
  for (const focus of focuses.filter(key => key !== 'gold')) assert.deepEqual(app.state().focusTeams[focus], original[focus]);
});

test('Golden Arrows payout belongs only to the selected Crusader copy and adds to the unchanged boss kill', async () => {
  const app = load(crusaderGoldFixture());
  const a = () => app.evaluationCalls.at(-2).result;
  const b = () => app.evaluationCalls.at(-1).result;
  const selected = () => a().heroes[app.state().focusTeams.gold.attackers.a].goldSkill;
  assert.ok(Math.abs(a().metrics.gold - 33.1) < 1e-10);
  assert.equal(selected().killScore, 1);
  assert.ok(Math.abs(selected().attackGold - 32.1) < 1e-10);
  assert.equal(b().metrics.gold, 1, 'Supporting Crusader copies do not pay out for the Scout attacker');
  await app.change('teams', {tile: 'a:2'}, 'skill');
  assert.ok(Math.abs(a().metrics.gold - 33.1) < 1e-10, 'A tile on an unselected Crusader does not boost the killer');
  await app.change('teams', {attacker: 'a'}, 2);
  assert.ok(Math.abs(a().metrics.gold - 39.52) < 1e-10);
  assert.equal(selected().tileBoost, 1.2);
  assert.equal(selected().killScore, 1);
  await app.change('gold-crusader-attacks', null, 2);
  assert.ok(Math.abs(a().metrics.gold - 87.562144) < 1e-10);
  assert.equal(selected().attacks, 2);
  assert.equal(selected().killScore, 1);
  assert.equal(b().metrics.gold, 1);
  const panel = app.elements.get('gold-attacker-skill-breakdown');
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Golden Arrows/);
  for (const key of ['attacks', 'factor', 'payout', 'base']) assert.match(panel.innerHTML, new RegExp(`data-gold-attacker-skill="a:${key}"`));
  const comparison = app.elements.get('gold-comparison');
  for (const [team, values] of Object.entries({a: {kill: 1, attacks: 86.562144, total: 87.562144}, b: {kill: 1, attacks: 0, total: 1}})) {
    for (const [key, expected] of Object.entries(values)) {
      const cell = comparison.innerHTML.match(new RegExp(`data-gold-total="${team}:${key}"[^>]*title="([^"]+)"`));
      assert.ok(cell, `Gold comparison should expose ${team}:${key}`);
      assert.ok(Math.abs(Number(cell[1].replaceAll(',', '')) - expected) < 0.00001, `Gold comparison ${team}:${key} should show the selected attacker's payout`);
    }
  }
  const before = clone(a().metrics);
  await app.check('gold-skills', false);
  assert.equal(a().metrics.gold, 1);
  for (const key of ['damage', 'energy', 'powerMageEnergy', 'experience']) assert.equal(a().metrics[key], before[key]);
  await app.check('gold-skills', true);
  assert.deepEqual(clone(a().metrics), before);
  await app.focus('energy'); assert.equal(panel.hidden, true);
  await app.focus('gold'); assert.equal(panel.hidden, false);
  assert.equal(app.state().focusTeams.gold.attackers.a, 2);
});

test('Crusader attack payout excludes Gold support kill buffs while the boss kill still responds to them', async () => {
  const initial = crusaderGoldFixture(); initial.focusTeams.gold.teams.a = [slot('crusader', 0), slot('hunter', 0), slot('rogue', 0), slot('sovereign', 0)];
  const app = load(initial), before = clone(app.evaluationCalls.at(-2).result.heroes[0].goldSkill);
  assert.ok(Math.abs(before.attackGold - 32.1) < 1e-10);
  await app.change('gold-rogue-bonus', null, 20000);
  await app.change('gold-hunter-bonus', null, 50000);
  await app.change('gold-sovereign-amount', null, 9000);
  const after = app.evaluationCalls.at(-2).result.heroes[0].goldSkill;
  assert.equal(after.attackGold, before.attackGold);
  assert.equal(after.baseKillGold, before.baseKillGold);
  assert.ok(after.killScore > before.killScore);
  assert.equal(after.totalScore, after.killScore + after.attackGold);
});

test('Crusader skill tile appears in the Gold comparison and its winning swap applies only to that team', async () => {
  const app = load(crusaderGoldFixture());
  await app.change('gold-kill-tile', null, 0);
  const panel = app.elements.get('gold-placement-comparison'), before = clone(app.state().focusTeams.gold);
  assert.match(panel.innerHTML, /data-gold-placement="a:skill"/);
  assert.match(panel.innerHTML, /Skill/);
  await app.click('gold-placement-comparison', {goldSwap: 'a'});
  const after = app.state().focusTeams.gold;
  assert.equal(after.teams.a[0].tile, 'skill', 'With no Kill Gold tile bonus or unlocked milestones, the scored Golden Arrows boost wins');
  assert.deepEqual(after.teams.b, before.teams.b);
  assert.deepEqual(after.attackers, before.attackers);
  assert.deepEqual(after.names, before.names);
  for (const [index, hero] of after.teams.a.entries()) for (const key of ['id', 'level', 'locked']) assert.equal(hero[key], before.teams.a[index][key]);
  assert.ok(Math.abs(app.evaluationCalls.at(-2).result.metrics.gold - 39.52) < 1e-10);
});

test('saved hero ranks apply across focuses and team trials inherit each field independently', async () => {
  const saved = goldFixture();
  saved.version = 19;
  saved.settings.heroAscensions = {hunter:{milestoneLevel:5,synergyLevel:5,killGoldLevel:7}};
  const app = load(saved);
  await app.change('ascension-global-kill-gold',null,1);
  const current = clone(app.state().settings.heroAscensions);
  assert.equal(current.hunter.globalKillGoldLevel,1);
  await app.change('ascension-scope',null,'b');
  await app.click('ascension-hunter-gold');
  await app.change('ascension-global-kill-gold',null,0);
  const trial = {milestoneLevel:0,synergyLevel:0,killGoldLevel:14,globalKillGoldLevel:0};
  const grades = () => app.evaluationCalls.slice(-2).map(call => call.settings.heroAscensions.hunter);
  assert.deepEqual(grades(),[current.hunter,trial]);
  assert.deepEqual(app.state().settings.heroAscensions,current);
  assert.deepEqual(app.state().focusTeams.gold.ascensionOverrides.b.hunter,trial);
  await app.change('ascension-scope',null,'account');
  await app.change('ascension-global-damage',null,2);
  assert.deepEqual(grades(),[{...current.hunter,globalDamageLevel:2},{...trial,globalDamageLevel:2}]);
  await app.click('optimize'); await app.flush();
  assert.deepEqual(app.optimizationCalls.at(-1).settings.heroAscensions.hunter,{...trial,globalDamageLevel:2});
  await app.focus('energy');
  assert.deepEqual(grades(),[{...current.hunter,globalDamageLevel:2},{...current.hunter,globalDamageLevel:2}]);
  const exported = await app.export();
  const imported = load();
  await imported.import(exported);
  await imported.focus('gold');
  assert.deepEqual(imported.evaluationCalls.slice(-2).map(call=>call.settings.heroAscensions.hunter),
    [{...current.hunter,globalDamageLevel:2},{...trial,globalDamageLevel:2}]);
  await imported.change('ascension-scope',null,'b');
  await imported.change('ascension-global-kill-gold',null,'');
  assert.equal(imported.evaluationCalls.at(-1).settings.heroAscensions.hunter.globalKillGoldLevel,1);
  await imported.click('ascension-inherit');
  assert.deepEqual(imported.evaluationCalls.at(-1).settings.heroAscensions,exported.settings.heroAscensions);
});

test('copy and swap move independent ascension trials without changing the account profile', async () => {
  const app = load(goldFixture());
  await app.change('ascension-global-rank-exp',null,8);
  await app.change('ascension-scope',null,'b');
  await app.change('ascension-damage',null,3);
  await app.click('swap-teams');
  assert.deepEqual(app.state().focusTeams.gold.ascensionOverrides,{a:{hunter:{damageLevel:3}}});
  await app.click('copy-team');
  assert.deepEqual(app.state().focusTeams.gold.ascensionOverrides,{a:{hunter:{damageLevel:3}},b:{hunter:{damageLevel:3}}});
  await app.change('ascension-scope',null,'b');
  await app.change('ascension-damage',null,1);
  assert.deepEqual(app.state().focusTeams.gold.ascensionOverrides.a,{hunter:{damageLevel:3}});
  await app.click('ascension-reset-team');
  assert.deepEqual(app.state().focusTeams.gold.ascensionOverrides,{a:{hunter:{damageLevel:3}}});
  assert.deepEqual(app.state().settings.heroAscensions,{hunter:{globalRankExpLevel:8}});
  const reloaded = load(await app.export());
  assert.deepEqual(reloaded.evaluationCalls.slice(-2).map(call=>call.settings.heroAscensions.hunter),
    [{globalRankExpLevel:8, damageLevel:3},{globalRankExpLevel:8}]);
});

(async () => {
  let failures = 0;
  for (const {name, run} of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
  }
  console.log(`\n${tests.length - failures}/${tests.length} app tests passed.`);
  process.exitCode = failures ? 1 : 0;
})();
