(function (root) {
  'use strict';
  const E = root.HeroEngine, heroes = root.HERO_DATA.heroes;
  const byId = new Map(heroes.map(hero => [hero.id,hero]));
  const modes = ['skill','melee','mage','ranged'];
  const deployedBuffHeroes=Object.freeze(['warlock','wizard','titan','apprentice']);
  const defaults = {mode:'skill',buffTeam:'deploy',priority:'damage',baseDamageExponent:0,
    baseCritChance:100,baseSuperChance:100,baseUltraChance:100,
    championStrikes:88.5,championDamagePercent:1710,championCooldown:1,championMasteryPercent:499,
    otherBasePower:0,otherMasteryLevel:10,fightSeconds:60};
  const numericLimits = {baseDamageExponent:[0,1000000],baseCritChance:[0,1e9],baseSuperChance:[0,1e9],
    baseUltraChance:[0,1e9],championStrikes:[1,1e9],championDamagePercent:[0,1e12],
    championCooldown:[0.25,1e6],championMasteryPercent:[0,1e12],otherBasePower:[0,1e9],otherMasteryLevel:[0,1e6],fightSeconds:[1,86400]};
  function normalize(input = {}) {
    const c = {...defaults};
    if (modes.includes(input?.mode)) c.mode = input.mode;
    c.buffTeam=['deploy','swap','warlock'].includes(input?.buffTeam)?input.buffTeam:
      c.mode==='skill'?'deploy':c.mode==='melee'?'swap':'warlock';
    c.priority=c.mode==='melee' && input?.priority!=='damage'?'strikes':'damage';
    for (const [key,[low,high]] of Object.entries(numericLimits)) {
      if (input?.[key] == null || input[key] === '') continue;
      const value = Number(input[key]);
      if (Number.isFinite(value)) c[key] = Math.min(high,Math.max(low,value));
    }
    return c;
  }
  const typeOf = id => root.IMMORTAL_HERO_TYPES?.[id] ?? null;
  // These self-buffs flag their ordinary attack packets as skill damage
  // during the active window. Off-type heroes can still supply buffs.
  const skillAttacks = new Set(['viking','peacekeeper','paladin','warlord','ranger','praetorian','dicemaster','warden','deadeye']);
  const capturedDurations=new Map(E.damageSkillDefinitions.map(skill=>[skill.id,skill.duration]));
  const castSkills = {...root.IMMORTAL_CAST_SKILLS,champion:{name:'Lightning Storm',replacesVolley:true},
    forester:{name:'Bleed',base:1,perPower:0,replacesVolley:false}};
  function canDamage(id,config=defaults) {
    return config.mode==='skill' ? !!castSkills[id] || skillAttacks.has(id) || ['samurai','ninja','forester'].includes(id) : typeOf(id)===config.mode;
  }
  const tierBonus = {none:1,normal:1.10,super:1.25,ultra:1.50};
  function bossHit(realDamage,tier='none') {
    return realDamage > 1 ? Math.log10(realDamage)*(tierBonus[tier]??1) : 0;
  }
  const stats = ['Damage','Damage Taken','Ultra Boss Damage','Attack Speed','Triple Shot Damage','Crit Damage','Super Crit Damage',
    'Ultra Crit Damage','Crit Chance','Super Crit Chance','Ultra Crit Chance','Skill Power','Skill Duration','Immortal Splash'];
  const [damage,taken,bossDamage,speed,shots,critDamage,superDamage,ultraDamage,crit,superCrit,ultraCrit,power,duration,splash] = stats.map((_,i)=>i);
  const indexByStat = new Map(stats.map((stat,i)=>[stat,i]));
  const multiplicative = stats.map(stat=>E.statMode(stat)==='multiply');
  const neutral = multiplicative.map(mult=>mult?1:0);
  const probability = percent => Math.max(0,Math.min(1,percent/100));
  const safeLog = value => value>0 ? Math.log10(value) : -Infinity;
  // The client rounds each upgrade to even using its float32 growth
  // constant. Above level 700 the +10 and rounding have no appreciable
  // influence on the exponent; extrapolating there avoids numeric overflow.
  const growth=Math.fround(1.05),logGrowth=Math.log10(growth),levelLogs=[0,0];
  let base=10;
  for(let level=2;level<=700;level++) {
    const next=(base+10)*growth,lower=Math.floor(next);
    base=next-lower===0.5 && lower%2===0 ? lower : Math.round(next);
    levelLogs.push(Math.log10(base/10));
  }
  const runLevelLog = level => level<=700 ? levelLogs[Math.max(0,Math.floor(level||0))] : levelLogs[700]+(Math.floor(level)-700)*logGrowth;
  function roundedHitLog(log) {
    return log>=15 ? log : Math.log10(Math.max(1,Math.round(10**log)));
  }

  // Each attack rolls through the normal, super and ultra crit tiers. Only
  // its final tier supplies the Immortal multiplier. The underlying crit
  // damage factors apply to the real hit before the logarithm.
  function critProfile(b,c,s,id) {
    const chances=[c.baseCritChance+(root.IMMORTAL_BASE_CRIT_CHANCE?.[id]??0)+b[crit],c.baseSuperChance+b[superCrit],c.baseUltraChance+b[ultraCrit]];
    const normal=probability(Math.floor(chances[0])+1);
    const strong=probability(Math.ceil(chances[1])),ultra=probability(Math.ceil(chances[2]));
    const weights=[1-normal,normal*(1-strong),normal*strong*(1-ultra),normal*strong*ultra];
    const damageLogs=[0,safeLog(2*b[critDamage]),0,0];
    damageLogs[2]=damageLogs[1]+safeLog(3*b[superDamage]);
    damageLogs[3]=damageLogs[2]+safeLog(3*b[ultraDamage]);
    const eventFactors=[1,tierBonus.normal,tierBonus.super,tierBonus.ultra];
    const weighted=weights.map((p,i)=>p*eventFactors[i]);
    const excess=chances.reduce((sum,value)=>sum+Math.max(0,value-100),0);
    return {weights,weighted,damageLogs,overflow:1+(s.baseOverflow+s.overflowRate*excess)/100};
  }
  function expectedHit(baseLog,profile) {
    let sum=0;
    for (let i=0;i<4;i++) if (profile.weighted[i]) {
      sum+=profile.weighted[i]*roundedHitLog(baseLog+profile.damageLogs[i]);
    }
    return sum;
  }
  // For one boss the first strike has zero stacks. Strike 101 and every
  // later strike has 100. Sum their individual logs, never the log of a cast.
  function castDamage(firstLog,hits,mastery,profile,prefix) {
    if (!hits || firstLog===-Infinity) return 0;
    const ramp = Math.min(hits,100), tail = hits-ramp;
    let total=0;
    for (let i=0;i<4;i++) {
      if (!profile.weighted[i]) continue;
      const start=firstLog+profile.damageLogs[i];
      let sum;
      if (start>=15) sum = hits*start+prefix[ramp]+tail*prefix.cap;
      else {
        sum=tail*roundedHitLog(start+prefix.cap);
        for(let j=0;j<ramp;j++) sum+=roundedHitLog(start+Math.log10(1+j*mastery));
      }
      total+=profile.weighted[i]*sum;
    }
    return total;
  }
  function masteryPrefix(percent) {
    const sums=[0], mastery=percent/100;
    for(let n=0;n<100;n++) sums.push(sums[n]+Math.log10(1+n*mastery));
    sums.cap=Math.log10(1+100*mastery);
    return sums;
  }
  // E[log10(U)] for a continuous uniform multiplier, avoiding the bias from
  // applying the log to its average. Used for Ranger's two random rolls.
  function uniformLog(low,high) {
    if(high<=low) return Math.log10(low);
    return ((high*Math.log(high)-low*Math.log(low))/(high-low)-1)/Math.LN10;
  }
  const targetDebuffs=new Set(['apprentice','witch','skymage']);
  function buffApplies(id,c) {
    return !targetDebuffs.has(id) || c.mode==='skill' || c.mode===typeOf(id);
  }
  function skillStat(type) {
    return type==='Splash Damage' ? splash : indexByStat.get(type);
  }
  function activeWindow(seconds,active,cooldown) {
    const cycle=active+cooldown,complete=Math.floor(seconds/cycle),last=Math.min(active,seconds%cycle);
    return {complete,last,casts:complete+(seconds%cycle>0?1:0),activeTime:complete*active+last};
  }
  function stackMultipliers(start,increment,cap) {
    const prefix=[0];
    const factor=n=>Math.max(1,start+Math.min(n,cap)*increment);
    return function sumHits(count,rawLog,profile) {
      if (!count) return 0;
      const whole=Math.floor(count),ramp=Math.min(whole,cap),tail=whole-ramp;
      // Expected per-tier damage is linear in the log above the precision
      // where rounding real damage could affect it. Reuse one prefix over
      // the stacks and handle fractional attack counts at the fight boundary.
      if(rawLog>=15) {
        while(prefix.length<=ramp) prefix.push(prefix.at(-1)+safeLog(factor(prefix.length-1)));
        const extra=prefix[ramp]+tail*safeLog(factor(cap))+(count-whole)*safeLog(factor(whole));
        return count*expectedHit(rawLog+extra/count,profile);
      }
      let total=0;
      for(let n=0;n<ramp;n++) total+=expectedHit(rawLog+safeLog(factor(n)),profile);
      return total+tail*expectedHit(rawLog+safeLog(factor(cap)),profile)
        +(count-whole)*expectedHit(rawLog+safeLog(factor(whole)),profile);
    };
  }
  function makeDamageModel(s,c,size) {
    const skillTile = s.snowFort ? 1+s.damageSkillTileBoost/100 : 1;
    const stylePower = s.grandMaster ? 1.05**size : 1;
    const masteryPercent=c.championMasteryPercent*stylePower*(s.snowFort?(1+s.mapMastery/100):1)/1.33;
    const otherMastery=masteryPercent/250*c.otherMasteryLevel;
    const prefix=masteryPrefix(masteryPercent);
    const vikingStacks=stackMultipliers(1,0.01*otherMastery,500);
    const foresterStacks=stackMultipliers(1,0.25*otherMastery,Math.ceil(c.fightSeconds));
    const paladinStacks=new Map();
    function cooldownFor(id, listed, reduced) {
      if(!reduced) return listed;
      const floor=1-0.25*(s.heroAscensions?.[id]?.minSkillCooldownLevel??0);
      return Math.max(c.championCooldown,floor);
    }
    function scoreSlot(slot,b,index,detailed,teamEffects) {
      const uniqueTicks=teamEffects.ticks;
      const data=byId.get(slot.id), type=typeOf(slot.id),eligible=canDamage(slot.id,c);
      if (!detailed && !eligible) return 0;
      const profile=critProfile(b,c,s,slot.id);
      const rawHitLog = c.baseDamageExponent+runLevelLog(slot.level)+teamEffects.statusLog+safeLog(data.observedBaseStats?.damage??1)+safeLog(b[damage])
        +safeLog(b[taken])+safeLog(b[bossDamage])+safeLog(profile.overflow);
      const cast=eligible?castSkills[slot.id]:null,champion=slot.id==='champion';
      const activeSeconds=Math.max(1,10+b[duration]);
      const cooldown=cooldownFor(slot.id,champion?24:(root.IMMORTAL_BASE_COOLDOWN?.[slot.id]??24),teamEffects.reducedCooldown);
      const window=activeWindow(c.fightSeconds,activeSeconds,cooldown);
      const tile=s.snowFort && slot.tile==='skill' ? skillTile : 1;
      const powerFactor=stylePower*tile;
      // GM's +5% skill power compounds. The generic bonus table also
      // reports these style entries as +5 raw per copy; remove those there.
      const additional=b[power]-(s.grandMaster?5*size:0);
      const baseline=champion?(c.championDamagePercent-100)/10:c.otherBasePower;
      const effectiveSkillPower=Math.max(0,Math.round((baseline+additional)*powerFactor));
      const frenzy=slot.id==='viking'?2+0.10*effectiveSkillPower:1;
      const speedCap=10+(s.heroAscensions?.[slot.id]?.maxAttackSpeedLevel??0);
      const aps=Math.min(speedCap,(data.observedBaseStats?.attackSpeed??data.attackSpeed??1)*b[speed]*frenzy);
      // The user's maintained Warlock setup is calibrated at one Champion
      // cast per second per copy. Without that setup a cast also needs an
      // available attack action.
      const castRate=cast ? (champion && teamEffects.reducedCooldown ? 1/cooldown
        : Math.min(aps,slot.id==='forester'?window.casts/c.fightSeconds:1/cooldown)) : 0;
      const volleyCost=cast?.replacesVolley ? b[shots] : 1;
      const teleportRate=slot.id==='skymage' ? Math.min(aps,1/cooldown) : 0;
      const normalRate=Math.max(0,(aps-teleportRate)*b[shots]-castRate*volleyCost);
      // Splash replaces the real hit if its summed fraction exceeds 100%;
      // it never adds a second primary-target packet.
      const splashFactor=Math.max(1,b[splash]/100);
      let attackLog=rawHitLog+safeLog(splashFactor);
      if(slot.id==='ranger') {
        attackLog+=uniformLog(1,2.5+0.25*effectiveSkillPower);
        if(otherMastery>0) profile.damageLogs[3]+=uniformLog(2,1+5*otherMastery);
      }
      let perHit=expectedHit(attackLog,profile);
      // Viking and Paladin build their mastery once per attack action on
      // the same target. Wizard's additional projectiles do not add stacks.
      const actions=aps*c.fightSeconds;
      if (eligible && actions>0 && slot.id==='viking') perHit=vikingStacks(actions,attackLog,profile)/actions;
      if (eligible && actions>0 && slot.id==='paladin') {
        const start=b[splash]/100+0.5+0.03*effectiveSkillPower;
        if(!paladinStacks.has(start)) {
          if(paladinStacks.size>=128) paladinStacks.delete(paladinStacks.keys().next().value);
          paladinStacks.set(start,stackMultipliers(start,0.01*otherMastery,500));
        }
        perHit=paladinStacks.get(start)(actions,rawHitLog,profile)/actions;
      }
      const tagged=skillAttacks.has(slot.id);
      const taggedUptime=tagged && !teamEffects.reducedCooldown
        ? activeWindow(c.fightSeconds,capturedDurations.get(slot.id)??activeSeconds,cooldown).activeTime/c.fightSeconds : 1;
      let skillAttackRate=tagged ? normalRate*taggedUptime : 0;
      let skillAttackDps=skillAttackRate*perHit;
      if (slot.id==='ninja') {
        const hits=1+Math.round(otherMastery);
        skillAttackRate=(window.complete*Math.min(hits,activeSeconds*normalRate)+Math.min(hits,window.last*normalRate))/c.fightSeconds;
        const sneak=(5+0.5*effectiveSkillPower)*(1+0.25*otherMastery);
        skillAttackDps=skillAttackRate*expectedHit(rawHitLog+safeLog(sneak),profile);
      }
      const hitRate=eligible ? c.mode==='skill'?skillAttackRate:normalRate : 0;
      const attackDps=c.mode==='skill'?0:perHit*Math.max(0,hitRate-skillAttackRate);
      if (!eligible) {skillAttackRate=0;skillAttackDps=0;}
      let skillHits=0,skillPercent=0,damagePerCast=0;
      if (cast && champion) {
        const strikePower=Math.max(0,Math.round((2*(c.championStrikes-8)+additional)*powerFactor));
        skillHits=Math.round(8+strikePower*0.5);
        teamEffects.championHitsPerSecond+=skillHits*castRate;
        skillPercent=100+effectiveSkillPower*10;
        damagePerCast=castDamage(rawHitLog+safeLog(skillPercent/100),skillHits,masteryPercent/100,profile,prefix);
      } else if (cast) {
        skillHits=1;
        const mastery=cast.masteryFactor?Math.max(1,cast.masteryFactor*otherMastery):1;
        skillPercent=(cast.base+cast.perPower*effectiveSkillPower)*mastery*100;
        damagePerCast=expectedHit(rawHitLog+safeLog(skillPercent/100)+(cast.replacesVolley?0:safeLog(splashFactor)),profile);
      }
      let tickRate=0,tickDps=0;
      if(eligible && slot.id==='samurai') {
        tickRate=(window.complete*Math.floor(activeSeconds)+Math.floor(window.last))/c.fightSeconds;
        const factor=(0.35+0.03*effectiveSkillPower)*(1+0.2*otherMastery);
        tickDps=tickRate*expectedHit(rawHitLog+safeLog(factor),profile);
      }
      if(eligible && slot.id==='forester') {
        const factor=1.5+0.15*effectiveSkillPower;
        const ticks=Math.floor(activeSeconds),lastTicks=Math.floor(window.last);
        const full=window.complete;
        // Every reapplication restarts this enemy's mastery counter. Only
        // one Forester bleed can be on the boss at a time.
        const tickLog=rawHitLog+safeLog(factor);
        const damage=(full?full*foresterStacks(ticks,tickLog,profile):0)+foresterStacks(lastTicks,tickLog,profile);
        const dps=damage/c.fightSeconds,rate=(full*ticks+lastTicks)/c.fightSeconds;
        if (!uniqueTicks.forester || dps>uniqueTicks.forester.dps) uniqueTicks.forester={index,dps,rate};
      }
      if(eligible && slot.id==='militia' && otherMastery>0) {
        // The strongest Spin Attack wounds the boss for three ticks. The
        // tick inherits that real hit's crit damage but cannot roll a new crit.
        const rate=Math.min(1,3*castRate);
        const tickLog=rawHitLog+safeLog(skillPercent/100)+safeLog(2*otherMastery);
        const dps=rate*profile.weights.reduce((sum,p,i)=>sum+p*roundedHitLog(tickLog+profile.damageLogs[i]),0);
        if (!uniqueTicks.militia || dps>uniqueTicks.militia.dps) uniqueTicks.militia={index,dps,rate};
      }
      const skillDps=damagePerCast*castRate+skillAttackDps+tickDps,score=attackDps+skillDps;
      const totalHitRate=hitRate+skillHits*castRate+tickRate;
      if (!detailed) return score;
      return {index,id:slot.id,type,eligible,score,attackDps,skillDps,hitRate,aps,totalHitRate,tickRate,tickDps,
        rawHitLog:Number.isFinite(rawHitLog)?rawHitLog:null,perHit,skill:cast?.name??null,skillTaggedAttacks:skillAttackRate>0,
        skillPower:additional,effectiveSkillPower,masteryPercent,skillHits,skillPercent,castRate,
        skillCooldown:cast?cooldown:0,damagePerCast,critProbabilities:profile.weights};
    }
    // These two damage-taken debuffs have independent three-application
    // immunity counters on a fresh boss. Duplicate owners share a counter.
    // Average their contribution to the logarithm over the fight window.
    scoreSlot.applyStatuses=function(team,buckets,context) {
      if (!otherMastery || (c.mode!=='skill' && c.mode!=='mage')) return;
      for(const [id,coefficient] of [['sorcerer',0.2],['elementalist',0.15]]) {
        let seconds=0;
        for(let i=0;i<team.length;i++) if(team[i].id===id) seconds=Math.max(seconds,3+0.3*buckets[i][duration]);
        if(!seconds) continue;
        const cooldown=cooldownFor(id,32,context.reducedCooldown);
        const active=activeWindow(c.fightSeconds,seconds,cooldown).activeTime;
        const fraction=Math.min(3*seconds,active)/c.fightSeconds;
        context.statusLog+=safeLog(1+coefficient*otherMastery)*fraction;
      }
    };
    return scoreSlot;
  }
  function swappedBuffs(s,c) {
    if(c.buffTeam!=='swap') return [];
    // Wizard and Titan leave timed buffs on recipients. An off-team
    // Apprentice's debuff is cleared from the boss when its owner leaves.
    return ['wizard','titan'].map(id=>{
      const bucket=neutral.slice(),skill=E.damageSupportFor({id,tile:'normal'},s);
      if(skill) for(const effect of [...skill.activeEffects,...skill.masteryEffects]) {
        const stat=skillStat(effect.type);
        if(stat!==undefined) addEffect(bucket,stat,effect.value);
      }
      return {id,bucket};
    });
  }
  function teamContext(ids,c) {
    return {ticks:{},championHitsPerSecond:0,statusLog:0,reducedCooldown:c.buffTeam!=='deploy'||ids.has('warlock')};
  }
  function scoreEvaluation(evaluation,s,c) {
    const model=makeDamageModel(s,c,evaluation.heroes.length);
    const ids=new Set(evaluation.heroes.map(hero=>hero.id)),context=teamContext(ids,c);
    const external=swappedBuffs(s,c).filter(buff=>!ids.has(buff.id));
    const supportAdjustment=neutral.slice();
    for(const skill of evaluation.damageSupportSkills.skills) for(const effect of [...skill.activeEffects,...skill.masteryEffects]) {
      if(effect.type==='Splash Damage') supportAdjustment[splash]+=effect.value;
      if(!buffApplies(skill.id,c) && effect.type==='Damage Taken') supportAdjustment[taken]/=1+effect.value/100;
    }
    const buckets=evaluation.heroes.map(hero=>{
      const bucket=stats.map((stat,i)=>hero.bonuses[stat]??neutral[i]);
      mergeBucket(bucket,supportAdjustment);
      for(const effect of [...hero.damageSkill.activeEffects,...hero.damageSkill.masteryEffects]) if(effect.type==='Splash Damage') bucket[splash]+=effect.value;
      for (const buff of external) mergeBucket(bucket,buff.bucket);
      return bucket;
    });
    model.applyStatuses(evaluation.heroes,buckets,context);
    const rows=evaluation.heroes.map(hero=>model(hero,buckets[hero.index],hero.index,true,context));
    for (const {index,dps,rate} of Object.values(context.ticks)) {
      const row=rows[index];
      row.tickDps+=dps;row.skillDps+=dps;row.score+=dps;row.tickRate+=rate;row.totalHitRate+=rate;
    }
    const sum=key=>rows.reduce((n,row)=>n+row[key],0);
    return {mode:c.mode,score:sum('score'),attackDps:sum('attackDps'),skillDps:sum('skillDps'),hitRate:sum('hitRate'),totalHitRate:sum('totalHitRate'),
      championHitsPerSecond:context.championHitsPerSecond,heroes:rows};
  }
  function evaluate(team,settings={},config={}) {
    // Immortal lineups use their own GM and support context, independent of
    // any Experience leveling target and attacker settings on a saved team.
    const s=E.settingsFor({...settings,experienceLeveler:null,damageSupportMode:'all'});
    return scoreEvaluation(E.evaluate(team,s,true),s,normalize(config));
  }
  function mergeBucket(out,bucket) {
    for (let i=0;i<stats.length;i++) {
      if (multiplicative[i]) out[i]*=bucket[i]; else out[i]+=bucket[i];
    }
  }
  function addEffect(bucket,index,value) {
    if (multiplicative[index]) bucket[index]*=1+value/100;
    else bucket[index]+=value;
  }
  function makeScorer(settings={},config={}) {
    const s=E.settingsFor({...settings,damageSupportMode:'all'}),c=normalize(config);
    const map=E.mapFor(s),swap=swappedBuffs(s,c);
    const records=new Map(heroes.map(hero=>{
      const prepare=effects=>effects.map(effect=>({...effect,stat:indexByStat.get(E.canonicalType(effect.type,s))}))
        .filter(effect=>effect.stat!==undefined);
      return [hero.id,{milestones:prepare(hero.milestones),synergies:prepare(hero.synergies.filter(e=>e.tier<=s.maxTier)),
        ascension:E.ascensionFactors(hero.id,s)}];
    }));
    let size=-1,style,model,previousIds,links,cache;
    function slotProfile(slot,i) {
      let byTile=cache[i].get(slot.id);
      if (!byTile) { byTile=Object.create(null); cache[i].set(slot.id,byTile); }
      if (byTile[slot.tile]?.level===slot.level) return byTile[slot.tile];
      const global=neutral.slice(),local=neutral.slice(),support=neutral.slice();
      const record=records.get(slot.id),scales=E.scalesFor(slot,style,map,s);
      if (s.grandMaster) {global[damage]=2.5;global[power]=5;local[speed]=0.1;}
      global[damage]*=record.ascension.globalDamage;
      local[damage]*=record.ascension.damage;
      if (map.enabled && slot.tile==='damage') local[damage]*=1+s.damageTile/100;
      for(const effect of record.milestones) if (effect.level<=slot.level) addEffect(effect.global?global:local,effect.stat,effect.value*scales.milestone);
      function applySkill(bucket,skill) {
        if (!skill) return;
        for (const effect of [...skill.activeEffects,...skill.masteryEffects]) {
          const stat=skillStat(effect.type);
          if (stat!==undefined) addEffect(bucket,stat,effect.value);
        }
      }
      applySkill(local,E.damageSkillFor(slot,s));
      if(buffApplies(slot.id,c)) applySkill(support,E.damageSupportFor(slot,s));
      const values=record.synergies.map(effect=>Math.round(effect.value*E.tierScale(effect.tier,scales)));
      return byTile[slot.tile]={level:slot.level,global,local,support,values};
    }
    function measure(team) {
      if (size!==team.length) {
        size=team.length;style=E.styleFor(s,size);model=makeDamageModel(s,c,size);previousIds=null;
        cache=Array.from({length:size},()=>new Map());
      }
      if (!previousIds || team.some((slot,i)=>slot.id!==previousIds[i])) {
        previousIds=team.map(slot=>slot.id);
        const counts=Object.create(null);
        for (const slot of team) counts[slot.id]=(counts[slot.id]||0)+1;
        links=team.map(slot=>{
          const active=[];
          records.get(slot.id).synergies.forEach((effect,ordinal)=>{
            if (E.synergyActive(slot.id,effect,counts,s)) active.push({global:effect.global,stat:effect.stat,ordinal});
          });
          return active;
        });
      }
      const global=neutral.slice(),locals=[],seen=new Set();
      global[speed]=map.attackSpeed;
      for (let i=0;i<size;i++) {
        const slot=team[i],p=slotProfile(slot,i),local=p.local.slice();
        mergeBucket(global,p.global);
        if (!seen.has(slot.id)) {seen.add(slot.id);mergeBucket(global,p.support);}
        for(const link of links[i]) addEffect(link.global?global:local,link.stat,p.values[link.ordinal]);
        locals.push(local);
      }
      for(const buff of swap) if(!seen.has(buff.id)) mergeBucket(global,buff.bucket);
      let score=0;
      const context=teamContext(seen,c);
      for (const local of locals) mergeBucket(local,global);
      model.applyStatuses(team,locals,context);
      for(let i=0;i<size;i++) score+=model(team[i],locals[i],i,false,context);
      for(const tick of Object.values(context.ticks)) score+=tick.dps;
      return {score,championHitsPerSecond:context.championHitsPerSecond};
    }
    const score=team=>measure(team).score;
    score.details=measure;
    return score;
  }
  E.immortal={defaults,normalize,typeOf,canDamage,bossHit,evaluate,makeScorer,deployedBuffHeroes};
})(typeof window!=='undefined'?window:globalThis);
