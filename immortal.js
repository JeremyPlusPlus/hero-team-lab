(function (root) {
  'use strict';
  const E = root.HeroEngine, heroes = root.HERO_DATA.heroes;
  const byId = new Map(heroes.map(hero => [hero.id,hero]));
  const modes = ['skill','melee','mage','ranged'];
  const deployedBuffHeroes=Object.freeze(['warlock','wizard','titan','apprentice']);
  const [baseCritChance,baseSuperChance,baseUltraChance]=E.defaultChanceReferences().damage.totals;
  const defaults = {mode:'skill',buffTeam:'deploy',priority:'damage',baseDamageExponent:0,accountAttackSpeedBonus:0,heroSpeedRanks:{},heroCritRanks:{},
    baseCritChance,baseSuperChance,baseUltraChance,
    championStrikes:88.5,championDamagePercent:1710,championCooldown:1,championMasteryPercent:499,
    otherBasePower:0,otherMasteryLevel:10,fightSeconds:60};
  const numericLimits = {baseDamageExponent:[0,1000000],accountAttackSpeedBonus:[0,1e9],baseCritChance:[0,1e9],baseSuperChance:[0,1e9],
    baseUltraChance:[0,1e9],championStrikes:[1,1e9],championDamagePercent:[0,1e12],
    championCooldown:[0.25,1e6],championMasteryPercent:[0,1e12],otherBasePower:[0,1e9],otherMasteryLevel:[0,1e6],fightSeconds:[1,86400]};
  function normalize(input = {}) {
    const c = {...defaults,heroSpeedRanks:{},heroCritRanks:{}};
    if (modes.includes(input?.mode)) c.mode = input.mode;
    c.buffTeam=['deploy','swap','warlock'].includes(input?.buffTeam)?input.buffTeam:
      c.mode==='skill'?'deploy':c.mode==='melee'?'swap':'warlock';
    if (input?.priority!=='damage') {
      if (c.mode==='melee') c.priority='strikes';
      if (c.mode==='mage' || c.mode==='ranged') c.priority=input?.priority==='attacks'?'attacks':'hits';
    }
    const ranks=input?.heroSpeedRanks;
    if (ranks && typeof ranks==='object' && !Array.isArray(ranks)) {
      for (const [id,raw] of Object.entries(ranks)) {
        if (!byId.has(id) || (typeof raw!=='number' && typeof raw!=='string')) continue;
        const rank=Math.floor(Number(raw));
        if (Number.isFinite(rank) && rank>0) c.heroSpeedRanks[id]=Math.min(rank,10);
      }
    }
    if (input?.heroCritRanks && typeof input.heroCritRanks==='object' && !Array.isArray(input.heroCritRanks)) {
      for (const [id,profile] of Object.entries(input.heroCritRanks)) {
        if (!byId.has(id) || !profile || typeof profile!=='object' || Array.isArray(profile)) continue;
        for (const tier of ['normal','super','ultra']) {
          const raw=profile[tier];
          if (typeof raw!=='number' && typeof raw!=='string') continue;
          const rank=Math.floor(Number(raw));
          if (Number.isFinite(rank) && rank>0) (c.heroCritRanks[id]??={})[tier]=Math.min(rank,10);
        }
      }
    }
    for (const [key,[low,high]] of Object.entries(numericLimits)) {
      const raw=input?.[key];
      if (typeof raw!=='number' && !(typeof raw==='string' && raw.trim())) continue;
      const value = Number(raw);
      if (Number.isFinite(value)) c[key] = Math.min(high,Math.max(low,value));
    }
    return c;
  }
  const typeOf = id => root.IMMORTAL_HERO_TYPES?.[id] ?? null;
  // These self-buffs flag their ordinary attack packets as skill damage
  // during the active window. Off-type heroes can still supply buffs.
  const skillAttacks = new Set(['viking','peacekeeper','paladin','warlord','ranger','praetorian','dicemaster','warden','deadeye']);
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
  // Keep temporary skill chances in their own three additive columns.
  // The hero sheet includes the ordinary chance columns only.
  const skillCrit=stats.length,skillSuperCrit=skillCrit+1,skillUltraCrit=skillCrit+2;
  const neutral = [...multiplicative.map(mult=>mult?1:0),0,0,0];
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
  function tierWeights(normal,strong,ultra) {
    return [1-normal,normal*(1-strong),normal*strong*(1-ultra),normal*strong*ultra];
  }
  function critProfile(b,c,s,id,diceRolls) {
    const ranks=c.heroCritRanks[id];
    const passiveChances=[Math.round(c.baseCritChance)+(root.IMMORTAL_BASE_CRIT_CHANCE?.[id]??0)+b[crit]+(ranks?.normal??0),
      Math.round(c.baseSuperChance)+b[superCrit]+(ranks?.super??0),Math.round(c.baseUltraChance)+b[ultraCrit]+(ranks?.ultra??0)];
    const passiveUltraProbability=probability(passiveChances[0])*probability(passiveChances[1])*probability(passiveChances[2]);
    const chances=[passiveChances[0]+b[skillCrit],passiveChances[1]+b[skillSuperCrit],passiveChances[2]+b[skillUltraCrit]];
    let weights,excess;
    if (!diceRolls) {
      weights=tierWeights(...chances.map(probability));
      excess=chances.reduce((sum,value)=>sum+Math.max(0,value-100),0);
    } else {
      // Feeling Lucky uses three independent integer draws unless one common
      // mastery roll forces all three to the exclusive upper endpoints.
      const ordinary=[],forced=[];
      const mastery=probability(Math.round(diceRolls['Crit Chance'].maxRollProbability*100));
      excess=0;
      for (const [i,type] of ['Crit Chance','Super Crit Chance','Ultra Crit Chance'].entries()) {
        const roll=diceRolls[type],low=chances[i]+Math.round(roll.min),high=chances[i]+Math.round(roll.max);
        const count=high-low+1,first=Math.max(low,1),last=Math.min(high,99);
        const partialSum=Math.max(0,last-first+1)*(first+last)/2;
        const cappedCount=Math.max(0,high-Math.max(low,100)+1);
        ordinary.push((partialSum/100+cappedCount)/count);
        forced.push(probability(high+1));
        const firstExcess=Math.max(101,low),excessCount=Math.max(0,high-firstExcess+1);
        excess+=(1-mastery)*excessCount*(firstExcess+high-200)/(2*count)+mastery*Math.max(0,high+1-100);
      }
      const drawn=tierWeights(...ordinary),maximum=tierWeights(...forced);
      weights=drawn.map((p,i)=>(1-mastery)*p+mastery*maximum[i]);
    }
    const damageLogs=[0,safeLog(2*b[critDamage]),0,0];
    damageLogs[2]=damageLogs[1]+safeLog(3*b[superDamage]);
    damageLogs[3]=damageLogs[2]+safeLog(3*b[ultraDamage]);
    const eventFactors=[1,tierBonus.normal,tierBonus.super,tierBonus.ultra];
    const weighted=weights.map((p,i)=>p*eventFactors[i]);
    return {weights,weighted,damageLogs,passiveChances,passiveUltraProbability,overflow:1+(s.baseOverflow+s.overflowRate*excess)/100};
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
    if(type==='Splash Damage') return splash;
    const index=indexByStat.get(type);
    return index>=crit && index<=ultraCrit ? skillCrit+(index-crit) : index;
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
    const capturedDurations=new Map(E.damageSkillDefinitions.map(skill=>[skill.id,s[skill.durationKey]??skill.duration]));
    const skillTile = s.snowFort ? 1+s.damageSkillTileBoost/100 : 1;
    const accountSpeedFactor=1+c.accountAttackSpeedBonus/100;
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
    function scoreSlot(slot,b,index,detailed,teamEffects,diceRolls) {
      const uniqueTicks=teamEffects.ticks;
      const data=byId.get(slot.id), type=typeOf(slot.id),eligible=canDamage(slot.id,c);
      if (!detailed && !eligible) return 0;
      const profile=critProfile(b,c,s,slot.id,diceRolls);
      const cast=eligible?castSkills[slot.id]:null,champion=slot.id==='champion';
      const activeSeconds=Math.max(1,10+b[duration]);
      const cooldown=cooldownFor(slot.id,champion?24:(root.IMMORTAL_BASE_COOLDOWN?.[slot.id]??24),teamEffects.reducedCooldown);
      const window=activeWindow(c.fightSeconds,activeSeconds,cooldown);
      const tile=s.snowFort && slot.tile==='skill' ? skillTile : 1;
      // GM's +5% skill power compounds. The generic bonus table also
      // reports these style entries as +5 raw per copy; remove those there.
      const additional=b[power]-(s.grandMaster?5*size:0);
      const baseline=champion?(c.championDamagePercent-100)/10:c.otherBasePower;
      const effectiveSkillPower=E.effectiveSkillPower(baseline,additional,stylePower,tile);
      const frenzy=slot.id==='viking'?2+0.10*effectiveSkillPower:1;
      const speedCap=10+(s.heroAscensions?.[slot.id]?.maxAttackSpeedLevel??0);
      const rankSpeedFactor=1+0.03*(c.heroSpeedRanks[slot.id]??0);
      const uncappedAttackSpeed=(data.observedBaseStats?.attackSpeed??data.attackSpeed??1)*accountSpeedFactor*rankSpeedFactor*b[speed]*frenzy;
      const aps=Math.min(speedCap,uncappedAttackSpeed);
      const speedOverflowDamage=1+0.1*Math.max(0,uncappedAttackSpeed-speedCap);
      const rawHitLog = c.baseDamageExponent+runLevelLog(slot.level)+teamEffects.statusLog+safeLog(data.observedBaseStats?.damage??1)+safeLog(b[damage])
        +safeLog(b[taken])+safeLog(b[bossDamage])+safeLog(profile.overflow)+safeLog(speedOverflowDamage);
      // The user's maintained Warlock setup is calibrated at one Champion
      // cast per second per copy. Without that setup a cast also needs an
      // available attack action.
      const castRate=cast ? (champion && teamEffects.reducedCooldown ? 1/cooldown
        : Math.min(aps,slot.id==='forester'?window.casts/c.fightSeconds:1/cooldown)) : 0;
      const volleyCost=cast?.replacesVolley ? b[shots] : 1;
      const teleportRate=slot.id==='skymage' ? Math.min(aps,1/cooldown) : 0;
      // Count one attack cycle even when it fires three projectiles or
      // substitutes a damaging skill. Teleport uses a cycle without attacking.
      const attacksPerSecond=eligible ? aps-teleportRate : 0;
      teamEffects.attacksPerSecond+=attacksPerSecond;
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
        const strikePower=E.effectiveSkillPower(2*(c.championStrikes-8),additional,stylePower,tile);
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
      if(eligible && slot.id==='forester' && castRate>0) {
        const factor=1.5+0.15*effectiveSkillPower;
        const ticks=Math.floor(activeSeconds),lastTicks=Math.floor(window.last);
        const full=window.complete;
        // Every reapplication restarts this enemy's mastery counter. Only
        // one Forester bleed can be on the boss at a time.
        const tickLog=rawHitLog+safeLog(factor);
        const damage=(full?full*foresterStacks(ticks,tickLog,profile):0)+foresterStacks(lastTicks,tickLog,profile);
        const dps=damage/c.fightSeconds,rate=(full*ticks+lastTicks)/c.fightSeconds;
        if (!uniqueTicks.forester || dps>uniqueTicks.forester.dps) uniqueTicks.forester={index,dps,rate,ultraProbability:profile.weights[3]};
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
      teamEffects.totalHitRate+=totalHitRate;
      // Direct hits, Champion strikes and Samurai ticks each get a crit roll.
      // Shared bleed/wound effects are assigned after picking their owner.
      const ultraProbability=totalHitRate>0 ? profile.weights[3] : 0;
      const ultraHitsPerSecond=totalHitRate*ultraProbability;
      teamEffects.critEligibleHitsPerSecond+=totalHitRate;
      teamEffects.ultraHitsPerSecond+=ultraHitsPerSecond;
      if (totalHitRate>0) countCritAttacker(teamEffects,ultraProbability,profile.passiveUltraProbability);
      if (!detailed) return score;
      return {index,id:slot.id,type,eligible,score,attackDps,skillDps,hitRate,aps,speedCap,uncappedAttackSpeed,speedOverflowDamage,attacksPerSecond,totalHitRate,tickRate,tickDps,
        ultraProbability,ultraHitsPerSecond,critEligibleHitsPerSecond:totalHitRate,
        passiveCritChances:profile.passiveChances,passiveUltraProbability:profile.passiveUltraProbability,
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
    return {ticks:{},championHitsPerSecond:0,attacksPerSecond:0,totalHitRate:0,critEligibleHitsPerSecond:0,ultraHitsPerSecond:0,
      lowestUltraProbability:0,attackingHeroes:0,guaranteedUltraHeroes:0,lowestPassiveUltraProbability:0,guaranteedPassiveUltraHeroes:0,
      statusLog:0,reducedCooldown:c.buffTeam!=='deploy'||ids.has('warlock')};
  }
  function countCritAttacker(context,probability,passiveProbability) {
    context.lowestUltraProbability=context.attackingHeroes ? Math.min(context.lowestUltraProbability,probability) : probability;
    context.lowestPassiveUltraProbability=context.attackingHeroes ? Math.min(context.lowestPassiveUltraProbability,passiveProbability) : passiveProbability;
    context.attackingHeroes++;
    if (probability===1) context.guaranteedUltraHeroes++;
    if (passiveProbability===1) context.guaranteedPassiveUltraHeroes++;
  }
  function applySharedTicks(context,rows) {
    let damage=0;
    for (const tick of Object.values(context.ticks)) {
      const {index,dps,rate,ultraProbability}=tick;
      damage+=dps;
      context.totalHitRate+=rate;
      if (ultraProbability!==undefined) {
        context.critEligibleHitsPerSecond+=rate;
        context.ultraHitsPerSecond+=rate*ultraProbability;
      }
      if (!rows) continue;
      const row=rows[index];
      row.tickDps+=dps;row.skillDps+=dps;row.score+=dps;row.tickRate+=rate;row.totalHitRate+=rate;
      if (ultraProbability!==undefined) {
        row.critEligibleHitsPerSecond+=rate;
        row.ultraHitsPerSecond+=rate*ultraProbability;
      }
    }
    return damage;
  }
  function teamRates(context) {
    const {championHitsPerSecond,attacksPerSecond,totalHitRate,critEligibleHitsPerSecond,ultraHitsPerSecond,
      lowestUltraProbability,attackingHeroes,guaranteedUltraHeroes,lowestPassiveUltraProbability,guaranteedPassiveUltraHeroes}=context;
    return {championHitsPerSecond,attacksPerSecond,totalHitRate,critEligibleHitsPerSecond,ultraHitsPerSecond,
      lowestUltraProbability,attackingHeroes,guaranteedUltraHeroes,lowestPassiveUltraProbability,guaranteedPassiveUltraHeroes};
  }
  function evaluate(team,settings={},config={}) {
    return makeScorer(settings,config).evaluate(E.cleanTeam(team));
  }
  function mergeBucket(out,bucket) {
    for (let i=0;i<out.length;i++) {
      if (multiplicative[i]) out[i]*=bucket[i]; else out[i]+=bucket[i];
    }
  }
  function addEffect(bucket,index,value) {
    if (multiplicative[index]) bucket[index]*=1+value/100;
    else bucket[index]+=((index>=crit && index<=ultraCrit) || index>=skillCrit) ? Math.round(value) : value;
  }
  function makeScorer(settings={},config={}) {
    // A fresh single Immortal provides no prior kills or executions.
    // Those counters belong to the attacker and reset when its skill expires.
    const s=E.settingsFor({...settings,experienceLeveler:null,damageSupportMode:'all',damageAttackerKills:0,damageAssassinExecutions:0}),c=normalize(config);
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
      const skill=E.damageSkillFor(slot,s);
      const diceRolls=slot.id==='dicemaster' && skill.enabled ? skill.chanceRolls : null;
      if (!diceRolls) applySkill(local,skill);
      if(buffApplies(slot.id,c)) applySkill(support,E.damageSupportFor(slot,s));
      const values=record.synergies.map(effect=>Math.round(effect.value*E.tierScale(effect.tier,scales)));
      return byTile[slot.tile]={level:slot.level,global,local,support,values,diceRolls};
    }
    function measure(team,detailed=false) {
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
      const global=neutral.slice(),locals=[],rolls=[],seen=new Set();
      global[speed]=map.attackSpeed;
      for (let i=0;i<size;i++) {
        const slot=team[i],p=slotProfile(slot,i),local=p.local.slice();
        mergeBucket(global,p.global);
        if (!seen.has(slot.id)) {seen.add(slot.id);mergeBucket(global,p.support);}
        for(const link of links[i]) addEffect(link.global?global:local,link.stat,p.values[link.ordinal]);
        locals.push(local);
        rolls.push(p.diceRolls);
      }
      for(const buff of swap) if(!seen.has(buff.id)) mergeBucket(global,buff.bucket);
      let score=0;
      const context=teamContext(seen,c);
      for (const local of locals) mergeBucket(local,global);
      model.applyStatuses(team,locals,context);
      if (detailed) {
        const rows=team.map((slot,i)=>model(slot,locals[i],i,true,context,rolls[i]));
        applySharedTicks(context,rows);
        const sum=key=>rows.reduce((n,row)=>n+row[key],0);
        return {mode:c.mode,score:sum('score'),attackDps:sum('attackDps'),skillDps:sum('skillDps'),hitRate:sum('hitRate'),...teamRates(context),heroes:rows};
      }
      for(let i=0;i<size;i++) score+=model(team[i],locals[i],i,false,context,rolls[i]);
      score+=applySharedTicks(context);
      return {mode:c.mode,score,...teamRates(context)};
    }
    const score=team=>measure(team).score;
    score.details=measure;
    score.evaluate=team=>measure(team,true);
    return score;
  }
  E.immortal={defaults,normalize,typeOf,canDamage,bossHit,evaluate,makeScorer,deployedBuffHeroes};
})(typeof window!=='undefined'?window:globalThis);
