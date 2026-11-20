# Immortal boss damage

The hero classifications and native crit chances in `immortal-data.js` were read from all 42 hero prefabs in the Windows edition of Idle Hero TD, Steam app 2897580, build 26180061. The `heroClass`, `baseCritChance`, `skillTitle` and `baseSkillCooldownTime` fields are in `IdleHeroTD_Data/data.unity3d`. The four single-cast profiles use the same build’s combat routines. Base damage and attacks per second come from the project’s hero-stat screenshots.

## Damage per hit

The calculation in the supplied Immortal Boss Damage screen applies log₁₀ to each real hit individually. The game rolls normal crit, then super conditional on normal, then ultra conditional on super. Each successful tier multiplies raw damage. The highest tier determines the event multiplier, respectively ×1.10, ×1.25 or ×1.50. The game rounds the real hit before taking its logarithm. The battle report additionally rounds each contribution to an integer and caps its total at 2,147,483,647. The fractional damage index is suited to comparing teams before report rounding.

The native crit damage multipliers start at 2, 3 and 3. The event opponent uses the attacker’s Ultra Boss Damage factor. Ordinary attacks, multi-shot projectiles and individual Champion strikes each roll their own crit. For the single boss, Wizard’s triple-shot mastery can add two projectiles to an ordinary attack. Champion casts replace that entire attack action. These paths can be checked in `cl.blm`, `cl.blp` and `by.zn` in this build’s `Assembly-CSharp.dll`.

For run-level growth, an upgrade adds 10 to the common level damage, multiplies by the game’s single-precision 1.05, then rounds to even. At level 1, common damage 10 reproduces both Militia’s displayed 10 and Champion’s 26 when their native attack speed, damage ratio and rarity are applied. Permanent account damage, individual rank upgrades and ascension can further increase real hit size.

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
