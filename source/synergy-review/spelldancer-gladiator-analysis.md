# Independent Spelldancer and Gladiator synergy audit

Six screenshots were independently read and compared against the frozen spreadsheet reference and the active dataset before these batches' changes. The independent transcription agrees exactly with all **86** observations in `batch-03.json` and `batch-04.json`, including signs, units, types, and scopes. Each batch covers 16 groups and 43 effects. All partner groups match the reference, and rank requirements remain unchanged.

This audit writes only this report. The source images and observations are maintained by the separate extraction workflow. Current-data comparisons below refer to snapshot SHA-256 `39d5755423533588e6f44182506215816ce997224829e412a887b1faa210279a`; subsequent activation can legitimately change those comparisons.

## Calibration assumptions and coverage

The continuation model uses nine independently compounded Grand Masters, three independent global +5% bonuses, ordinary owner +25% strength, Warden +0%, and the previously confirmed early-tier/Snow Fort factors. Those settings are inferred continuation of earlier captures; these screenshots do not independently show deployment count or tile positions.

`S = 1.05^3 × 1.25 × 1.1^9 = 3.412023994742347`

Tier factors are 6.25 for I–II, 2.5 for III–IV, 2.15 for V–VI, 1.77 for VII, and 1 for VIII–IX. Warden uses an additional relative factor of 1/1.25. The model assumes no additional tile factor in displayed values and nearest-integer display rounding.

| Capture | Frozen reference magnitudes matching | Pre-batch active magnitudes matching | Shared-scale interval from matching frozen rows |
| --- | ---: | ---: | --- |
| Spelldancer | 33/43 | 34/43 | [3.412000000000, 3.412097042207) |
| Gladiator | 39/43 | 40/43 | [3.412015503876, 3.412038303694) |

The extra active-data matches are the already calibrated Peacekeeper tier IV and Warlock tier VI corrections from the Ninja capture. All 16 Gladiator-owned magnitudes match. Spelldancer has five owner-effect magnitude changes; its other eleven owner effects match. Magnitude counts do not by themselves validate effect type or scope.

## Directly observed corrections

The **15 new correction records** contain **4 type changes, 7 scope changes, 2 sign corrections, and 11 magnitude changes**. A record can change more than one field.

| Owner / tier / index | Frozen and pre-batch active field | Screenshot field |
| --- | --- | --- |
| Spelldancer / II / 3 | Personal Crit Damage | **Global** Crit Damage |
| Spelldancer / II / 4 | Positive stored cooldown magnitude | **Negative** global Skill Cooldown, −149% |
| Spelldancer / III / 5 | Personal Damage | **Global** Damage |
| Apprentice / III / 6 | Personal Crit Chance | **Global** Crit Chance |
| Spelldancer / IV / 7 | Personal Super Crit Damage | **Global** Super Crit Damage |
| Spelldancer / V / 9 | Personal Kill Gold | **Global Skill Power**, flat |
| Sniper / V / 9 | Global Energy Income | **Personal Damage**, percent |
| Gladiator / II / 3 | Positive stored cooldown magnitude | **Negative** global Skill Cooldown, −107% |
| Elementalist / III / 6 | Personal Crit Damage | **Global** Crit Damage |
| Apprentice / IV / 8 | Bare Super Energy | **Super Energy Amount**, global |
| Skymage / V / 10 | Bare Super Energy | **Super Energy Amount**, global |

The Spelldancer–Sniper tier V arrows were checked carefully: Spelldancer receives +22 **global Skill Power**; Sniper receives +2934% **personal Damage**. These are two effect replacements, not a transcription swap. Retaining the old magnitudes under the new labels would produce invalid contributions.

Existing canonical aliases already handle Praetorian's `Ultra Crit Chnce`, Sorcerer's `Ultra Crit Dmage`, and Warden's `Ultra Ctir Damage`. Their screenshots show the correctly spelled types; these are not additional semantic corrections.

## Conditional base magnitudes

These eleven values are the unique integer bases reproducing their screenshot values under the stated context and rounding assumptions. They should retain **inferred-calibrated** status and be paired with any directly observed type/scope change. They are not directly observed unmodified game values.

| Owner / index | Old base / effect | Observed | Inferred base / effect |
| --- | --- | ---: | --- |
| Spelldancer / 3 | 100 personal Crit Damage | +853% global | 40 global Crit Damage |
| Warden / 4 | 5 personal Skill Power | +102 flat | 6 personal Skill Power |
| Spelldancer / 5 | 200 personal Damage | +682% global | 80 global Damage |
| Spelldancer / 6 | 10 personal Skill Power | +102 flat | 12 personal Skill Power |
| Apprentice / 6 | 50 personal Crit Chance | +171% global | 20 global Crit Chance |
| Spelldancer / 7 | 850 personal Super Crit Damage | +3839% global | 450 global Super Crit Damage |
| Spelldancer / 9 | 400 personal Kill Gold | +22 flat global Skill Power | 3 global Skill Power |
| Sniper / 9 | 3 global Energy Income | +2934% personal Damage | 400 personal Damage |
| Paladin / 1 | 1 personal Skill Power | +43 flat | 2 personal Skill Power |
| Battlemage / 2 | 24 personal Attack Speed | +533% | 25 personal Attack Speed |
| Elementalist / 6 | 250 personal Crit Damage | +853% global | 100 global Crit Damage |

An unreported effect-specific multiplier could mimic a changed base. The integer domain, unchanged ordinary-owner strength, continuation context, and missing additional tile factor are assumptions, retained with these candidates. This report does not change active data or correction manifests.

## Warden, Alien Tech, and the existing exception

Warden's tier II personal Skill Power requires both its stated **0% owner bonus** and the inferred base 6: `6 × S × 6.25 / 1.25 = 102.360719842270 → 102`. Old base 5 predicts 85. Warden's tier IX Ultra Crit Damage retains base 3250: `3250 × S / 1.25 = 8871.262386330101 → 8871`. Both captures show Warden rank 4523.

Peacekeeper tier IX explicitly displays **+10 Alien Tech, global, flat**—there is no percent sign. The old base 3 already fits the ordinary model: `3 × S = 10.236071984227 → 10`. No special multiplier or numeric change is required by this evidence. The flat unit should be preserved explicitly; the game's broader Alien Tech mechanic is not inferred here.

Arbalest tier VII again displays **+72% global Power Mage Energy**, exactly as in the Militia capture. Old base 15 with all ordinary modifiers predicts 91; base 12 predicts 72. Keeping base 15 while excluding the owner factor ×1.25 also predicts 72: `15 × S × 1.77 / 1.25 = 72.471389648327`. Repeating the same observation under the same apparent conditions does not distinguish those explanations. This existing exception remains unresolved and separate from the eleven new conditional bases.

## Overlap checks

All **15 overlapping effects** match the earlier Militia or Ninja screenshots exactly in signed value, type, scope, and unit:

- Spelldancer–Ninja–Peacekeeper tier IV: all three effects agree, including Peacekeeper's corrected +60% global Super Exp Amount.
- Spelldancer–Militia–Arbalest tier VII: all three agree, including the unresolved Power Mage Energy observation.
- Gladiator–Militia tier III: both effects agree.
- Gladiator–Ninja–Warlock tier VI: all three agree, including Warlock's corrected +2017% global Kill Gold.
- Gladiator–Militia–Sorcerer–Captain tier VIII: all four agree.

There are no contradictory duplicate observations. Both new captures therefore support the already applied Peacekeeper and Warlock field/base calibrations without adding duplicate corrections.

## Complete 86-effect comparison

“Old / active” values compare the frozen reference with the active snapshot before these batches; a single number means they agree. Predictions use magnitudes, so cooldown rows retain a separate sign-correction flag. Differences are relative to that active snapshot. The earlier canonical spelling aliases are treated as equivalent.


### Spelldancer

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Observed signed value | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Spelldancer | 1 / 1 | Kill Gold, global, percent | 10 | 213 | 213 | matches | Data!C24:F24 |
| Battlemage | 1 / 1 | Rank Exp, global, flat | 1 | 21 | 21 | matches | Data!C21:F21 |
| Spelldancer | 1 / 2 | Attack Speed, personal, percent | 25 | 533 | 533 | matches | Data!G24:K24 |
| Paladin | 1 / 2 | Kill Gold, personal, percent | 50 | 1066 | 1066 | matches | Data!G20:K20 |
| Sniper | 1 / 2 | Crit Damage, global, percent | 20 | 427 | 427 | matches | Data!G22:K22 |
| Spelldancer | 2 / 3 | Crit Damage, global, percent | 100 | 2133 | 853 | magnitude, scope | Data!L24:O24 |
| Viking | 2 / 3 | Crit Damage, personal, percent | 100 | 2133 | 2133 | matches | Data!L5:O5 |
| Spelldancer | 2 / 4 | Skill Cooldown, global, percent | 7 | 149 | -149 | sign | Data!P24:T24 |
| Archer | 2 / 4 | Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P13:T13 |
| Warden | 2 / 4 | Skill Power, personal, flat | 5 | 85 | 102 | magnitude | Data!P37:T37 |
| Spelldancer | 3 / 5 | Damage, global, percent | 200 | 1706 | 682 | magnitude, scope | Data!U24:X24 |
| Champion | 3 / 5 | Crit Chance, personal, percent | 35 | 299 | 299 | matches | Data!U32:X32 |
| Spelldancer | 3 / 6 | Skill Power, personal, flat | 10 | 85 | 102 | magnitude | Data!Y24:AC24 |
| Assassin | 3 / 6 | Kill Gold, personal, percent | 250 | 2133 | 2133 | matches | Data!Y11:AC11 |
| Apprentice | 3 / 6 | Crit Chance, global, percent | 50 | 427 | 171 | magnitude, scope | Data!Y3:AC3 |
| Spelldancer | 4 / 7 | Super Crit Damage, global, percent | 850 | 7251 | 3839 | magnitude, scope | Data!AD24:AG24 |
| Warlock | 4 / 7 | Skill Power, global, flat | 1 | 9 | 9 | matches | Data!AD30:AG30 |
| Spelldancer | 4 / 8 | Super Exp Chance, global, percent | 4 | 34 | 34 | matches | Data!AH24:AL24 |
| Ninja | 4 / 8 | Super Exp Chance, global, percent | 4 | 34 | 34 | matches | Data!AH8:AL8 |
| Peacekeeper | 4 / 8 | Super Exp Amount, global, percent | 500 / 7 | 4265 / 60 | 60 | matches | Data!AH14:AL14 |
| Spelldancer | 5 / 9 | Skill Power, global, flat | 400 | 2934 | 22 | magnitude, type, scope | Data!AM24:AP24 |
| Sniper | 5 / 9 | Damage, personal, percent | 3 | 22 | 2934 | magnitude, type, scope | Data!AM22:AP22 |
| Spelldancer | 5 / 10 | Super Energy Chance, global, percent | 4 | 29 | 29 | matches | Data!AQ24:AU24 |
| Scout | 5 / 10 | Super Crit Chance, personal, percent | 25 | 183 | 183 | matches | Data!AQ4:AU4 |
| Ballista | 5 / 10 | Skill Power, global, flat | 4 | 29 | 29 | matches | Data!AQ28:AU28 |
| Spelldancer | 6 / 11 | Skill Power, global, flat | 5 | 37 | 37 | matches | Data!AV24:AY24 |
| Veteran | 6 / 11 | Kill Gold, personal, percent | 500 | 3668 | 3668 | matches | Data!AV43:AY43 |
| Spelldancer | 6 / 12 | Damage, global, percent | 275 | 2017 | 2017 | matches | Data!AZ24:BD24 |
| Chieftain | 6 / 12 | Damage, global, percent | 275 | 2017 | 2017 | matches | Data!AZ29:BD29 |
| Witch | 6 / 12 | Ultra Gold Amount, global, percent | 2250 | 16506 | 16506 | matches | Data!AZ12:BD12 |
| Spelldancer | 7 / 13 | Super Crit Damage, global, percent | 850 | 5133 | 5133 | matches | Data!BE24:BH24 |
| Druid | 7 / 13 | Damage, global, percent | 300 | 1812 | 1812 | matches | Data!BE6:BH6 |
| Spelldancer | 7 / 14 | Super Energy Chance, global, percent | 6 | 36 | 36 | matches | Data!BI24:BM24 |
| Militia | 7 / 14 | Energy Income, global, flat | 8 | 48 | 48 | matches | Data!BI2:BM2 |
| Arbalest | 7 / 14 | Power Mage Energy, global, percent | 15 | 91 | 72 | magnitude | Data!BI19:BM19 |
| Spelldancer | 8 / 15 | Skill Duration, personal, flat | 20 | 68 | 68 | matches | Data!BN24:BS24 |
| Witch | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN12:BS12 |
| Battlemage | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN21:BS21 |
| Templar | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN33:BS33 |
| Spelldancer | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 11089 | 11089 | matches | Data!BT24:BY24 |
| Assassin | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT11:BY11 |
| Praetorian | 9 / 16 | Ultra Crit Chance, personal, percent | 20 | 68 | 68 | matches | Data!BT38:BY38 |
| Wizard | 9 / 16 | Skill Power, global, flat | 15 | 51 | 51 | matches | Data!BT15:BY15 |

### Gladiator

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Observed signed value | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Gladiator | 1 / 1 | Crit Damage, personal, percent | 25 | 533 | 533 | matches | Data!C23:F23 |
| Paladin | 1 / 1 | Skill Power, personal, flat | 1 | 21 | 43 | magnitude | Data!C20:F20 |
| Gladiator | 1 / 2 | Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G23:K23 |
| Battlemage | 1 / 2 | Attack Speed, personal, percent | 24 | 512 | 533 | magnitude | Data!G21:K21 |
| Rogue | 1 / 2 | Damage, global, percent | 20 | 427 | 427 | matches | Data!G25:K25 |
| Gladiator | 2 / 3 | Skill Cooldown, global, percent | 5 | 107 | -107 | sign | Data!L23:O23 |
| Assassin | 2 / 3 | Attack Speed, global, percent | 10 | 213 | 213 | matches | Data!L11:O11 |
| Gladiator | 2 / 4 | Attack Speed, personal, percent | 60 | 1280 | 1280 | matches | Data!P23:T23 |
| Forester | 2 / 4 | Skill Duration, personal, flat | 6 | 128 | 128 | matches | Data!P10:T10 |
| Ranger | 2 / 4 | Rank Exp, global, flat | 10 | 213 | 213 | matches | Data!P16:T16 |
| Gladiator | 3 / 5 | Kill Gold, personal, percent | 200 | 1706 | 1706 | matches | Data!U23:X23 |
| Militia | 3 / 5 | Crit Chance, global, percent | 16 | 136 | 136 | matches | Data!U2:X2 |
| Gladiator | 3 / 6 | Crit Chance, global, percent | 20 | 171 | 171 | matches | Data!Y23:AC23 |
| Champion | 3 / 6 | Crit Damage, global, percent | 100 | 853 | 853 | matches | Data!Y32:AC32 |
| Elementalist | 3 / 6 | Crit Damage, global, percent | 250 | 2133 | 853 | magnitude, scope | Data!Y18:AC18 |
| Gladiator | 4 / 7 | Kill Gold, global, percent | 125 | 1066 | 1066 | matches | Data!AD23:AG23 |
| Viking | 4 / 7 | Super Crit Damage, personal, percent | 850 | 7251 | 7251 | matches | Data!AD5:AG5 |
| Gladiator | 4 / 8 | Damage, global, percent | 150 | 1280 | 1280 | matches | Data!AH23:AL23 |
| Apprentice | 4 / 8 | Super Energy Amount, global, percent | 4 | 34 | 34 | type | Data!AH3:AL3 |
| Archer | 4 / 8 | Kill Gold, personal, percent | 350 | 2986 | 2986 | matches | Data!AH13:AL13 |
| Gladiator | 5 / 9 | Energy Income, global, flat | 3 | 22 | 22 | matches | Data!AM23:AP23 |
| Templar | 5 / 9 | Energy Income, global, flat | 3 | 22 | 22 | matches | Data!AM33:AP33 |
| Gladiator | 5 / 10 | Super Gold Amount, global, percent | 625 | 4585 | 4585 | matches | Data!AQ23:AU23 |
| Skymage | 5 / 10 | Super Energy Amount, global, percent | 8 | 59 | 59 | type | Data!AQ27:AU27 |
| Deadeye | 5 / 10 | Super Crit Chance, global, percent | 10 | 73 | 73 | matches | Data!AQ40:AU40 |
| Gladiator | 6 / 11 | Ultra Exp Amount, global, percent | 45 | 330 | 330 | matches | Data!AV23:AY23 |
| Ballista | 6 / 11 | Ultra Energy Amount, global, percent | 25 | 183 | 183 | matches | Data!AV28:AY28 |
| Gladiator | 6 / 12 | Ultra Crit Damage, personal, percent | 4250 | 31177 | 31177 | matches | Data!AZ23:BD23 |
| Ninja | 6 / 12 | Kill Gold, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ8:BD8 |
| Warlock | 6 / 12 | Kill Gold, global, percent | 600 / 275 | 4402 / 2017 | 2017 | matches | Data!AZ30:BD30 |
| Gladiator | 7 / 13 | Super Energy Amount, global, percent | 15 | 91 | 91 | matches | Data!BE23:BH23 |
| Samurai | 7 / 13 | Super Energy Chance, global, percent | 5 | 30 | 30 | matches | Data!BE17:BH17 |
| Gladiator | 7 / 14 | Energy Income, global, flat | 8 | 48 | 48 | matches | Data!BI23:BM23 |
| Peacekeeper | 7 / 14 | Super Energy Amount, global, percent | 20 | 121 | 121 | matches | Data!BI14:BM14 |
| Warlord | 7 / 14 | Ultra Boss Damage, global, percent | 1600 | 9663 | 9663 | matches | Data!BI35:BM35 |
| Gladiator | 8 / 15 | Ultra Energy Chance, global, percent | 7 | 24 | 24 | matches | Data!BN23:BS23 |
| Militia | 8 / 15 | Energy Income, global, flat | 10 | 34 | 34 | matches | Data!BN2:BS2 |
| Sorcerer | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN9:BS9 |
| Captain | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN34:BS34 |
| Gladiator | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT23:BY23 |
| Peacekeeper | 9 / 16 | Alien Tech, global, flat | 3 | 10 | 10 | matches | Data!BT14:BY14 |
| Berserker | 9 / 16 | Ultra Crit Chance, global, percent | 8 | 27 | 27 | matches | Data!BT26:BY26 |
| Warden | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 8871 | 8871 | matches | Data!BT37:BY37 |

