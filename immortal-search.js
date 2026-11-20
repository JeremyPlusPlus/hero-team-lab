(function (root) {
  'use strict';
  const engine = root.HeroEngine;
  const heroes = root.HERO_DATA.heroes;
  const heroById = new Map(heroes.map(hero => [hero.id, hero]));
  const tileLimits = {normal:10, milestone:3, synergy:3, skill:3, damage:1};
  const tiles = Object.keys(tileLimits);
  const copy = team => team.map(slot => ({...slot}));
  function compareRates(a,b) {
    const difference=a-b;
    return Math.abs(difference)>Math.max(Math.abs(a),Math.abs(b))*1e-12 ? difference : 0;
  }
  const priorityFields={
    attacks:['attacksPerSecond','lowestUltraProbability','ultraHitsPerSecond','score'],
    hits:['totalHitRate','lowestUltraProbability','ultraHitsPerSecond','score'],
    strikes:['championHitsPerSecond','score'],damage:['score']
  };
  function comparisonCriterion(a,b,priority) {
    for (const field of priorityFields[priority]??priorityFields.damage) {
      if (field==='lowestUltraProbability' && (a[field]===1)!==(b[field]===1)) return field;
      if (field==='championHitsPerSecond' ? a[field]!==b[field] : compareRates(a[field],b[field])) return field;
    }
    return null;
  }
  function compareResults(a,b,priority) {
    const field=comparisonCriterion(a,b,priority);
    return field ? a[field]-b[field] : 0;
  }

  function objective(team, settings, config) {
    const score = engine.immortal.makeScorer(settings, config, team);
    const priority=config.priority || 'damage';
    let evaluated = 0;
    return {
      compare:(a,b)=>compareResults(a,b,priority),
      score(candidate) {
        evaluated++;
        return score.details(candidate);
      },
      result(candidate, exact) {
        const result=score.details(candidate);
        evaluated++;
        return {team:copy(candidate),...result,priority,evaluated,exact};
      }
    };
  }

  function searchAllTiles(team, objective, visit) {
    const trial = copy(team), counts = {normal:0, milestone:0, synergy:0, skill:0, damage:0};
    function place(index) {
      if (index === trial.length) { visit(trial, objective.score(trial)); return; }
      for (const tile of tiles) {
        if (counts[tile] >= tileLimits[tile]) continue;
        trial[index].tile = tile;
        counts[tile]++;
        place(index + 1);
        counts[tile]--;
      }
    }
    place(0);
  }

  // Changing one placement can require exchanging two full tile types.
  function improveTiles(team, objective) {
    const trial = copy(team), counts = Object.create(null);
    for (const slot of trial) counts[slot.tile] = (counts[slot.tile] || 0) + 1;
    let best = objective.score(trial);
    for (let pass = 0; pass < 3 * trial.length; pass++) {
      let nextScore = best, move = null;
      for (let i = 0; i < trial.length; i++) {
        const old = trial[i].tile;
        for (const tile of tiles) {
          if (tile === old || counts[tile] >= tileLimits[tile]) continue;
          trial[i].tile = tile;
          const value = objective.score(trial);
          if (objective.compare(value,nextScore)>0) { nextScore = value; move = {i,tile}; }
        }
        trial[i].tile = old;
        for (let j = i + 1; j < trial.length; j++) {
          const tile = trial[j].tile;
          if (tile === old) continue;
          trial[i].tile = tile; trial[j].tile = old;
          const value = objective.score(trial);
          if (objective.compare(value,nextScore)>0) { nextScore = value; move = {i,j,tile}; }
          trial[i].tile = old; trial[j].tile = tile;
        }
      }
      if (!move) break;
      const old = trial[move.i].tile;
      trial[move.i].tile = move.tile;
      if (move.j !== undefined) trial[move.j].tile = old;
      else { counts[old]--; counts[move.tile] = (counts[move.tile] || 0) + 1; }
      best = nextScore;
    }
    return trial;
  }

  function bestPlacements(team, settings, objective) {
    let best = copy(team), high = objective.score(best);
    if (!settings.snowFort) return objective.result(best,true);
    function accept(candidate, value) {
      if (objective.compare(value,high)>0) { best = copy(candidate); high = value; }
    }
    if (team.length <= 5) {
      searchAllTiles(team,objective,accept);
      return objective.result(best,true);
    }
    // On large teams, start from the player's tiles and from an empty map to
    // reach placements that require freeing a scarce tile on another hero.
    for (const start of [team,team.map(slot=>({...slot,tile:'normal'}))]) {
      const candidate = improveTiles(start,objective);
      accept(candidate,objective.score(candidate));
    }
    return objective.result(best,false);
  }

  function optimizeImmortalPlacements(rawTeam, input={}, inputConfig={}) {
    const team = engine.cleanTeam(rawTeam), settings = engine.settingsFor(input);
    const config = engine.immortal.normalize(inputConfig);
    if (!team.length) throw new Error('Add a hero before suggesting Immortal placements.');
    return bestPlacements(team, settings, objective(team,settings,config));
  }

  function countsFor(team) {
    const counts = Object.create(null);
    for (const slot of team) counts[slot.id] = (counts[slot.id] || 0) + 1;
    return counts;
  }

  function optimizeImmortalTeam(rawTeam, input={}, inputConfig={}, allowedIds=heroes.map(hero=>hero.id)) {
    const team = engine.cleanTeam(rawTeam), settings = engine.settingsFor(input);
    const config = engine.immortal.normalize(inputConfig);
    if (!team.length) throw new Error('Add a hero before suggesting an Immortal team.');
    // The boss restricts which heroes deal damage. Heroes of every type can
    // still be deployed for their global milestones, synergies and skills.
    const requestedHeroes = Array.isArray(settings.requiredHeroes) ? settings.requiredHeroes : [];
    const requiredHeroes = [...new Set([
      ...requestedHeroes,...(config.buffTeam==='deploy' ? engine.immortal.deployedBuffHeroes : [])
    ])];
    for (const id of requiredHeroes) if (!heroById.has(id)) throw new Error('Unknown required hero: '+String(id)+'.');
    const allowed = [...new Set([...allowedIds,...requiredHeroes])].filter(id => heroById.has(id));
    const open = [], fixed = [];
    team.forEach((slot,i) => {
      if (!slot.locked) open.push(i);
      else fixed.push(slot);
    });
    const fixedCounts = countsFor(fixed);
    const missing = requiredHeroes.filter(id=>!fixedCounts[id]);
    if (missing.length>open.length) {
      const names = missing.map(id=>heroById.get(id).name).join(', ');
      const source = requestedHeroes.length ? 'Required heroes '+names+' need ' : 'The deployed buff team needs '+names+' in ';
      throw new Error(source+missing.length+' slots, but only '+open.length+' slots can change. Add slots or unlock heroes.'
        +(config.buffTeam==='deploy'?' Selecting external buffs can also free the buff-team slots.':''));
    }
    if (allowed.reduce((sum,id)=>sum+3-(fixedCounts[id]||0),0) < open.length) {
      throw new Error('The allowed roster cannot fill all open slots with at most 3 copies per hero. Include more heroes or reduce the team size.');
    }
    const search = objective(team,settings,config);
    if (!open.length) return bestPlacements(team,settings,search);
    const guaranteedDealer = [...Object.keys(fixedCounts),...requiredHeroes].some(id=>engine.immortal.canDamage(id,config));
    if (!guaranteedDealer && (open.length===missing.length || !allowed.some(id=>engine.immortal.canDamage(id,config)))) {
      if (config.mode==='skill') {
        throw new Error('The permitted slots have no modeled direct skill damage. Include a modeled skill attacker, add a slot or change the locks or buff team.');
      }
      throw new Error('No '+config.mode+' attacker can join this team. Include a matching damage dealer or change a lock. Other hero types can still support.');
    }
    // Give each seed its requested copies before filling remaining unlocked
    // slots. Locked heroes outside the optional roster can satisfy a synergy.
    function seedTeam(required,fillOrder=allowed) {
      const candidate = copy(team), counts = {...fixedCounts};
      const free = [...open].sort((a,b)=>candidate[b].level-candidate[a].level || a-b);
      const needed = countsFor(required.map(id=>({id})));
      for (const id of requiredHeroes) needed[id] = Math.max(1,needed[id]||0);
      for (const [id,amount] of Object.entries(needed)) {
        let missing = amount - (counts[id] || 0);
        if (missing > 0 && (!allowed.includes(id) || amount > 3 || missing > free.length)) return null;
        while (missing-- > 0) {
          const match = free.findIndex(i=>candidate[i].id===id);
          const i = free.splice(match<0?0:match,1)[0];
          candidate[i].id = id;
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      for (const i of free) {
        const old = candidate[i].id;
        const keepSlot=fillOrder===allowed && allowed.includes(old) && (counts[old] || 0)<3;
        const id = keepSlot ? old : fillOrder.find(id=>(counts[id] || 0)<3);
        candidate[i].id = id;
        counts[id] = (counts[id] || 0) + 1;
      }
      return candidate;
    }
    const start = seedTeam([]);
    let best = copy(start), high = search.score(start);
    function accept(candidate, value) {
      if (search.compare(value,high)>0) { best = copy(candidate); high = value; }
    }
    // Small rosters can be solved jointly instead of alternating tile and
    // hero moves. The upper bound includes every placement on every lineup.
    const searchSize = allowed.length ** open.length * (settings.snowFort ? tiles.length ** team.length : 1);
    if (searchSize <= 12000) {
      const trial = copy(start), counts = {...fixedCounts};
      function fill(position) {
        if (position === open.length) {
          if (requiredHeroes.some(id=>!counts[id])) return;
          if (settings.snowFort) searchAllTiles(trial,search,accept);
          else accept(trial,search.score(trial));
          return;
        }
        const i = open[position];
        for (const id of allowed) {
          if (counts[id] >= 3) continue;
          trial[i].id = id;
          counts[id] = (counts[id] || 0) + 1;
          fill(position+1);
          counts[id]--;
        }
      }
      fill(0);
      return search.result(best,true);
    }
    const seeds = [], seen = new Set();
    function addSeed(required) {
      const candidate = seedTeam(required);
      if (!candidate) return;
      const key = candidate.map(slot=>slot.id).join('|');
      if (seen.has(key)) return;
      seen.add(key);
      seeds.push({team:candidate,score:search.score(candidate)});
    }
    addSeed([]);
    for (const id of allowed) {
      addSeed([id]);
      if (id==='champion') addSeed([id,id]);
      addSeed([id,id,id]);
    }
    // Retain opportunities with several cooperating heroes even when the
    // individual substitutions would not yet activate the bonus.
    for (const id of new Set([...allowed,...fixed.map(slot=>slot.id)])) {
      for (const effect of heroById.get(id).synergies) {
        if (effect.tier > settings.maxTier) continue;
        if (engine.synergyPartnersNeeded(id,effect,settings) < effect.requires.length) {
          effect.requires.forEach((_,skip)=>addSeed([id,...effect.requires.filter((_,i)=>i!==skip)]));
        } else addSeed([id,...effect.requires]);
      }
    }
    const bestSeedFirst=(a,b)=>search.compare(b.score,a.score);
    seeds.sort(bestSeedFirst);
    // Start some searches far from the current roster. A group of global
    // supports can be stronger together even before a known synergy activates.
    const diverse = [];
    let randomState = 81293;
    for (let n=0; n<12; n++) {
      const candidate = copy(start), counts = countsFor(candidate);
      for (const i of open) {
        const old = candidate[i].id;
        if (counts[old]===1 && requiredHeroes.includes(old)) continue;
        counts[old]--;
        const available = allowed.filter(id=>(counts[id]||0)<3);
        randomState = (Math.imul(randomState,1664525)+1013904223) >>> 0;
        const id = available[Math.floor(randomState / 4294967296 * available.length)];
        candidate[i].id = id;
        counts[id] = (counts[id] || 0) + 1;
      }
      diverse.push({team:candidate,score:search.score(candidate)});
    }
    diverse.sort(bestSeedFirst);
    function climb(seed) {
      let trial = copy(seed);
      for (let pass=0; pass<6; pass++) {
        const before = search.score(trial);
        let current = before;
        const counts = countsFor(trial);
        for (const i of open) {
          const old = trial[i].id;
          if (counts[old]===1 && requiredHeroes.includes(old)) continue;
          counts[old]--;
          let winner = old;
          for (const id of allowed) {
            if (id===old || counts[id]>=3) continue;
            trial[i].id = id;
            const value = search.score(trial);
            if (search.compare(value,current)>0) { winner = id; current = value; }
          }
          trial[i].id = winner;
          counts[winner] = (counts[winner] || 0) + 1;
        }
        // Swapping IDs accesses different slot levels and placements even if
        // both heroes are already at the copy limit.
        for (let x=0; x<open.length; x++) for (let y=x+1; y<open.length; y++) {
          const a = trial[open[x]], b = trial[open[y]];
          if (a.id===b.id) continue;
          [a.id,b.id] = [b.id,a.id];
          const value = search.score(trial);
          if (search.compare(value,current)>0) current=value;
          else [a.id,b.id] = [b.id,a.id];
        }
        if (settings.snowFort) trial=improveTiles(trial,search);
        current = search.score(trial);
        accept(trial,current);
        if (search.compare(current,before)<=0) break;
      }
    }
    const finalists=[...seeds.slice(0,4),...diverse.slice(0,3)].map(seed=>seed.team);
    if (config.priority==='attacks' || config.priority==='hits') {
      // A full group of high-cap dealers can need a speed support before
      // any single substitution in the starting lineup looks worthwhile.
      const capRanks=settings.heroAscensions;
      const baseSpeed=id=>(heroById.get(id).observedBaseStats?.attackSpeed??1)*(1+0.03*(config.heroSpeedRanks?.[id]??0));
      const dealers=allowed.filter(id=>engine.immortal.canDamage(id,config)).sort((a,b)=>
        (capRanks[b]?.maxAttackSpeedLevel??0)-(capRanks[a]?.maxAttackSpeedLevel??0) || baseSpeed(b)-baseSpeed(a));
      const fillOrder=[...dealers,...allowed.filter(id=>!dealers.includes(id))];
      finalists.push(seedTeam([],fillOrder));
      for (const id of ['wizard','necromancer']) if (allowed.includes(id)) {
        const candidate=seedTeam([id],fillOrder);
        if (candidate) finalists.push(candidate);
      }
    }
    if (allowed.includes('champion') && (config.mode==='skill' || config.mode==='melee')) {
      const copies=Math.min(3,(fixedCounts.champion||0)+open.length-missing.length);
      if (copies>0) finalists.push(seedTeam(Array(copies).fill('champion')));
    }
    const tried=new Set();
    for (const candidate of finalists) {
      const key=candidate.map(slot=>slot.id).join('|');
      if (tried.has(key)) continue;
      tried.add(key);
      climb(candidate);
    }
    const placement = bestPlacements(best,settings,search);
    return {...placement,exact:false};
  }

  engine.immortal.compareResults=compareResults;
  engine.immortal.comparisonCriterion=comparisonCriterion;
  Object.assign(engine,{optimizeImmortalTeam,optimizeImmortalPlacements});
})(typeof window !== 'undefined' ? window : globalThis);
