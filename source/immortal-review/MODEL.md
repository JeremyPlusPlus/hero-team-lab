# Immortal boss damage

The hero classifications and native crit chances in `immortal-data.js` were read from all 42 hero prefabs in the Windows edition of Idle Hero TD, Steam app 2897580, build 26180061. The `heroClass`, `baseCritChance`, `skillTitle` and `baseSkillCooldownTime` fields are in `IdleHeroTD_Data/data.unity3d`. The four single-cast profiles use the same build’s combat routines. Base damage and attacks per second come from the project’s hero-stat screenshots.

## Damage per hit

The calculation in the supplied Immortal Boss Damage screen applies log₁₀ to each real hit individually. The game rolls normal crit, then super conditional on normal, then ultra conditional on super. Each successful tier multiplies raw damage. The highest tier determines the event multiplier, respectively ×1.10, ×1.25 or ×1.50. The game rounds the real hit before taking its logarithm. The battle report additionally rounds each contribution to an integer and caps its total at 2,147,483,647. The fractional damage index is suited to comparing teams before report rounding.

The native crit damage multipliers start at 2, 3 and 3. The event opponent uses the attacker’s Ultra Boss Damage factor. Ordinary attacks, multi-shot projectiles and individual Champion strikes each roll their own crit. For the single boss, Wizard’s triple-shot mastery can add two projectiles to an ordinary attack. Champion casts replace that entire attack action. These paths can be checked in `cl.blm`, `cl.blp` and `by.zn` in this build’s `Assembly-CSharp.dll`.

For run-level growth, an upgrade adds 10 to the common level damage, multiplies by the game’s single-precision 1.05, then rounds to even. At level 1, common damage 10 reproduces both Militia’s displayed 10 and Champion’s 26 when their native attack speed, damage ratio and rarity are applied. Permanent account damage, individual rank upgrades and ascension can further increase real hit size.

## Attack rate and Ultra Crit on class bosses

The Windows game installed on November 20, 2026 (Steam build 26703178) applies the personal Attack Speed attribute as a factor of `1 + 0.03 × rank` in `cl.bki`. Ten attribute ranks give ×1.30. The same routine caps the final attack rate at `10 + Max Attack Speed ascension rank`, from 10/s to 15/s. The global speed calculation in `cl.bkj` includes account sources such as research, tech and runes. Enter their combined additional percentage in Team Lab. Map, style, milestones, synergies and the configured skill values already enter separately. In `cl.bkg` each 1/s above the personal cap adds 10% real damage before the Immortal logarithm. At 20/s before the cap, a cap of 15 gives ×1.5 real damage per hit.

`cl.bkc` schedules attacks from the reciprocal of the capped rate. `cl.blt` enforces class eligibility and `by.zp` counts each scored damage packet. A Wizard-boosted triple shot can land three independently scored hits on the same boss. Team Lab therefore tracks both boss-directed attack cycles and scoring hits. The rate assumes the hero targets an in-range boss during the modeled window. Movement, missed buff refreshes, support-only targeting and the game update loop can affect observed rates. Extra same-target projectiles from the Attack Speed spell or map double-shot perk are outside the model.

The three checks in `by.zp` each draw an integer from 0 through 99 and compare it strictly to the corresponding chance. Super requires a successful normal crit and Ultra requires a Super. Effective Ultra probability for a fixed set of stats is the product of the three capped probabilities. Each hero’s active Crit, Super and Ultra attribute ranks add one percentage point per rank, through rank ten. The latter two unlock at hero ranks 100 and 250. Wizard triple shots, Champion strikes, Forester bleed and Samurai ticks can roll Ultra. Militia’s wound inherits its source damage and contributes hits without rolling a fresh crit. Coverage counts the slots whose hits can roll. The guarantee is conditional on the modeled buffs, including whether the recipients have Wizard or Titan buffs after a swap.

Mage and Ranged recommendations compare scoring hits/s, then the lowest effective Ultra probability among attackers, then expected Ultra hits/s, then modeled boss DPS. The attack-cycle priority uses the same tie order. The [recorded pre-team account chances](../chance-review/observations.json) provide the starting 135% normal, 109% Super and 48% Ultra values for new setups.

## Lightning Storm

The Champion screenshots supply two calibration points. With no heroes deployed, Lightning Storm shows 88.5 strikes rounded to 89, 1,710% damage per strike and +499% damage per prior strike on the same enemy. With the captured team deployed, the corresponding values are 261 strikes, 5,160% and +813%.

- In `cl.blo`, **strikes = round half up(8 + 0.5 × effective skill power)**. Each strike deals **(100 + 10 × effective skill power)%** of the underlying hit. The two captures imply effective power 161 and 506.
- The first strike starts with zero mastery stacks. Each subsequent strike on the boss gains one stack, capped at 100. Each cast has its own counter. When there is one target, all the strikes select it.
- Flat skill power from milestones and synergies combines with the pre-team power. Grand Masters each multiply skill power by 1.05. A skill tile multiplies the placed hero’s power before rounding to an integer and calculating strike count and damage. The source routines are `cl.bkp` and `cq.bml`.
- Champion mastery uses a separate global multiplier. At mastery level 10 the no-team screenshot gives the calibrated +499% per stack. Ten Grand Masters multiply it by 1.05¹⁰, reproducing about +813%. The owner’s skill tile affects active skill power. The global map mastery bonus enters through `ci.bbu`.

The player reports one cast per second from each of three Champions with Warlock’s buff. Wizard, Warlock and Titan write timed buffs onto recipients within range when they cast. External-buff comparisons assume those recipients have the buffs during the scored window. Apprentice instead applies an enemy aura that normally needs an active, in-range caster able to target that boss. Its mastery builds once per second up to 100 stacks. These conditions matter when switching teams.

## Other heroes

An empowered basic shot and a separate damage tick contribute different numbers of hits. During their active windows, Viking, Peacekeeper, Paladin, Warlord, Ranger, Praetorian, Dicemaster, Warden and Deadeye can tag their basic hits as skill damage. Dicemaster is the only mage among these nine. For single-cast attacks, Militia and Chieftain consume a full volley. Scout and Sniper transform its first projectile. Each Samurai can apply a separate Immolation tick each second during its active window. The boss stores one Forester bleed and one Militia mastery wound, selecting the strongest source of each. A secondary projectile aimed at another enemy contributes zero hits against the single boss.

Hero-specific permanent attributes, effective durations, target range and the timing of refreshed buffs determine actual battle totals. Interrupted casts and movement can reduce hits in a timed fight. The model uses the configured combat window, skill captures and account inputs.
