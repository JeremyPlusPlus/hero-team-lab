# Batch 03 milestone review

Recorded November 2, 2026. Thirteen screenshots add **221 observed milestones**, bringing coverage to **26 of 60 heroes and 442 milestones**. Every captured hero has all 17 levels through 10,000. The original screenshots are archived with SHA-256 hashes in `review.json`.

The batch covers Wizard, Ranger, Samurai, Elementalist, Arbalest, Paladin, Battlemage, Sniper, Gladiator, Spelldancer, Rogue, Berserker, and Skymage. Each agent's transcription was checked against a separate reading of all 221 effects: exact stat, signed displayed value, unit, and personal/global scope.

## Confirmed scope correction

Wizard's level-6,000 **+28 Skill Duration is personal**. The original spreadsheet marks that milestone global. No other effect-type or scope differences occur at the 208 overlapping levels in this batch. Values remain account observations, not reconstructed raw bases.

## Level-10,000 observations

| Hero | Displayed bonus | Scope |
| --- | --- | --- |
| Wizard | +422% Damage | Global |
| Ranger | +28 Skill Power (flat) | Global |
| Samurai | +14 Skill Duration (flat) | Global |
| Elementalist | +422% Kill Gold | Global |
| Arbalest | +14% Instant Power Plant | Global |
| Paladin | +422% Kill Gold | Global |
| Battlemage | +84 Skill Power (flat) | Personal |
| Sniper | +422% Super Crit Damage | Global |
| Gladiator | +844% Ultra Crit Damage | Personal |
| Spelldancer | +84 Skill Power (flat) | Personal |
| Rogue | +422% Ultra Gold Amount | Global |
| Berserker | +98% Attack Speed | Global |
| Skymage | +422% Ultra Crit Damage | Global |

Instant Power Plant is preserved as a distinct effect. Its behavior is not established by this screenshot, so it is not mapped to Skill Cooldown, Instant Skill Chance, Energy Income, or another existing scoring effect.

## Values needing review

Assuming unchanged sheet bases and nearest-integer rounding, all **160 comparable percentage entries** in this batch fit the same provisional multiplier interval `[2.8125, 2.814)`. Across all three batches this is 320 entries. This compatibility does not establish the game's bonus formula or explain the missing permanent multiplier.

Eighteen flat-stat entries do not reproduce their displayed amounts under the provisional multiplier:

| Hero | Level | Stat | Sheet base | Displayed amount |
| --- | ---: | --- | ---: | ---: |
| Wizard | 1,500 | Skill Power | 3 | 14 |
| Ranger | 150 | Skill Power | 1 | 6 |
| Samurai | 150 | Skill Power | 1 | 6 |
| Elementalist | 150 | Skill Power | 1 | 6 |
| Arbalest | 250 | Skill Power | 1 | 6 |
| Arbalest | 1,500 | Skill Power | 2 | 14 |
| Paladin | 250 | Skill Power | 1 | 6 |
| Battlemage | 750 | Rank Exp | 6 | 34 |
| Sniper | 150 | Skill Power | 1 | 6 |
| Sniper | 500 | Rank Exp | 5 | 23 |
| Sniper | 750 | Skill Power | 2 | 8 |
| Gladiator | 750 | Skill Power | 2 | 8 |
| Spelldancer | 250 | Rank Exp | 4 | 14 |
| Spelldancer | 500 | Skill Power | 2 | 8 |
| Rogue | 2,000 | Skill Power | 4 | 17 |
| Berserker | 2,500 | Skill Power | 5 | 23 |
| Skymage | 150 | Skill Power | 1 | 6 |
| Skymage | 1,500 | Skill Power | 3 | 14 |

These may be balance changes or stat-specific account effects; they are not automatically confirmed changes to raw bases. Cooldown percentages retain their negative displayed sign, and Rank Exp, Skill Power, Skill Duration, and Energy Income remain flat units.

The active calculator dataset is unchanged. Review data is embedded in the standalone HTML separately, preserving the distinction between spreadsheet base values and account screenshot values.
