# Independent Veteran, Praetorian, and Battlemage synergy audit

All nine screenshots were read independently. The independently transcribed values, types, signs, scopes, and units agree exactly with **129** observations in `batch-05.json`, `batch-06.json`, and `batch-07.json`. Each capture contains 16 groups and 43 owner-specific effects. Every partner group matches the frozen spreadsheet reference. Tier II–IX rank minima remain 15, 50, 100, 150, 250, 500, 1000, and 1500.

This report compares the frozen reference and the active dataset before these batches' updates. The active snapshot SHA-256 was `14c55d714f285e18ed83810e59cb3f25fd68848cba540549c6559626df8e59d6`. Only this report is written by the independent audit; shared manifests, observations, data, and code are not modified.

## Calibration and numerical fit

The continuation model is:

`display magnitude = round(abs(base) × 1.05^3 × owner factor × 1.1^9 × tier factor)`

The ordinary owner factor is 1.25, Warden's is 1.0, and Crusader's is 1.15. Tier factors are 6.25 for I–II, 2.5 for III–IV, 2.15 for V–VI, 1.77 for VII, and 1 for VIII–IX. Ordinary-owner scale before the tier factor is `S = 3.412023994742347`.

Nine Grand Masters and unchanged account/map context are inferred continuation of the preceding captures, not newly proved by these images. No additional tile factor is included; placement state and tile stacking remain unverified.

| Capture | Frozen magnitudes matching | Pre-batch active magnitudes matching | Shared-scale interval from matching frozen rows |
| --- | ---: | ---: | --- |
| Veteran | 38/43 | 38/43 | [3.412015503876, 3.412050739958) |
| Praetorian | 40/43 | 40/43 | [3.412005649718, 3.412038303694) |
| Battlemage | 39/43 | 40/43 | [3.412000000000, 3.412091623680) |

Battlemage's additional active-data match is its tier I Attack Speed base 25, already calibrated in the Gladiator capture. These counts compare magnitudes separately from type, scope, and direction.

After the recommendations below, **all 129 observations forward-round exactly** under the stated model. There is no new unresolved numerical mismatch in these three captures.

## Recommended changes

There are **19 unique correction records**, comprising **5 type changes, 2 scope changes, 9 cooldown sign corrections, and 9 inferred-base changes**. Counts overlap when a record changes multiple fields. Duplicate appearances of the same effect do not create additional correction records.

### Nine inferred bases

These are the sole integer bases compatible with the corresponding observed values and the stated scale. Preserve **inferred-calibrated** status and the assumptions of unchanged context, ordinary-owner strength, whole-number bases, nearest-integer rounding, and no additional displayed tile modifier. They are not directly observed unmodified game values.

| Owner / index | Old base and effect | Observed effect | Recommended inferred base |
| --- | --- | --- | ---: |
| Veteran / 1 | 1 personal Skill Duration | +43 flat personal Skill Duration | 2 |
| Titan / 1 | 1 personal Skill Duration | +43 flat personal Skill Duration | 2 |
| Veteran / 3 | 40 personal Attack Speed | +107 flat personal Skill Power | 5 |
| Berserker / 3 | 40 global Kill Gold | +21% global Super Exp Chance | 1 |
| Veteran / 8 | 6 global Super Gold Chance | +60% global Super Exp Amount | 7 |
| Praetorian / 5 | 7 personal Skill Power | +68 flat personal Skill Power | 8 |
| Wizard / 8 | 950 personal Super Gold Amount | +341% global Attack Speed | 40 |
| Battlemage / 8 | 350 personal Damage | +1280% global Damage | 150 |
| Battlemage / 3 | 3 personal Skill Power | +107 flat personal Skill Power | 5 |

The old magnitudes of replaced effects must not be carried into their new stat labels. In particular, Wizard's old 950 personal Super Gold Amount must be replaced together with its new global Attack Speed label and inferred base 40. Battlemage's new global Damage scope must be paired with inferred base 150.

### Directly observed types and scopes

- Veteran index 3 changes personal Attack Speed to **personal Skill Power**, flat.
- Berserker index 3 changes global Kill Gold to **global Super Exp Chance**.
- Veteran index 8 changes global Super Gold Chance to **global Super Exp Amount**.
- Wizard index 8 changes personal Super Gold Amount to **global Attack Speed**.
- Battlemage index 8 remains Damage but changes from personal to **global**.
- Sniper index 12 changes personal Ultra Gold Amount to **personal Ultra Crit Damage**; base 4250 already reproduces +31177%, so no magnitude change is needed.

Wizard and Battlemage index 8 are repeated consistently in the Praetorian and Battlemage captures. Veteran index 4's +3199% Crit Damage is explicitly **personal** (orange label), as in the reference. An initial preliminary scope reading was corrected after reinspection at original resolution; no change is recommended for that record.

### Nine cooldown signs

The spreadsheet stores positive reduction magnitudes. These screenshot labels explicitly show negative cooldown percentages, so preserve their direction in active data.

| Owner / index | Recommended signed base | Observed signed display | Scope |
| --- | ---: | ---: | --- |
| Dicemaster / 2 | −4 | −85% | Global |
| Veteran / 6 | −10 | −85% | Global |
| Praetorian / 6 | −30 | −256% | Personal |
| Sovereign / 1 | −5 | −107% | Personal |
| Titan / 2 | −4 | −85% | Global |
| Warlock / 3 | −5 | −107% | Global |
| Champion / 4 | −20 | −427% | Personal |
| Battlemage / 6 | −30 | −256% | Personal |
| Warden / 6 | −10 | −68% | Global |

Veteran and Praetorian index 6 appear in both of their captures and agree exactly.

## Owner exceptions, units, and overlap checks

Crusader's +15% owner bonus reproduces both observations without base changes:

- Index 10: base 450 Kill Gold × S × 2.15 × 1.15/1.25 = 3037.042557720163 → **3037%**, personal.
- Index 14: base 2000 Super Gold Amount × S × 1.77 × 1.15/1.25 = 11112.279746076874 → **11112%**, personal.

Warden's 0% owner bonus reproduces its index 6 cooldown magnitude: `10 × S × 2.5 / 1.25 = 68.240479894847 → 68`. The displayed direction is negative.

Paladin index 16 explicitly shows **+7 Shadow Runes, personal, flat**. Old base 2 predicts `2 × S = 6.824047989485 → 7`; no special multiplier or base change is required. Preserve the missing percent sign as an explicit flat unit. Boss Exp in the Veteran and Champion screenshots does have a percent sign. Skill Duration, Skill Power, Rank Exp, Energy Income, and Shadow Runes are flat in these captures.

The three captures contain **121 unique owner/index records**: eight appearances repeat records within this new set. All agree, including the Veteran–Praetorian–Paladin tier III group, Veteran–Battlemage tier III pair, and Praetorian–Wizard–Battlemage tier IV group.

All **25 appearances overlapping earlier batches** agree exactly in signed value, type, scope, and unit. No overlap conflicts were found. Previously calibrated Battlemage tier I Attack Speed remains corroborated at base 25. Existing unresolved issues outside these screenshots are not silently resolved by this audit.

## Exact 19-record recommendation list

| Owner | Index / tier | Signed base after correction | Type | Scope | Unit | Changed fields | Source |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| Veteran | 1 / 1 | 2 | Skill Duration | personal | flat | magnitude | Data!C43:F43 |
| Titan | 1 / 1 | 2 | Skill Duration | personal | flat | magnitude | Data!C41:F41 |
| Dicemaster | 2 / 1 | -4 | Skill Cooldown | global | percent | sign | Data!G42:K42 |
| Veteran | 3 / 2 | 5 | Skill Power | personal | flat | magnitude, type | Data!L43:O43 |
| Berserker | 3 / 2 | 1 | Super Exp Chance | global | percent | magnitude, type | Data!L26:O26 |
| Veteran | 6 / 3 | -10 | Skill Cooldown | global | percent | sign | Data!Y43:AC43 |
| Praetorian | 6 / 3 | -30 | Skill Cooldown | personal | percent | sign | Data!Y38:AC38 |
| Veteran | 8 / 4 | 7 | Super Exp Amount | global | percent | magnitude, type | Data!AH43:AL43 |
| Sovereign | 1 / 1 | -5 | Skill Cooldown | personal | percent | sign | Data!C39:F39 |
| Titan | 2 / 1 | -4 | Skill Cooldown | global | percent | sign | Data!G41:K41 |
| Warlock | 3 / 2 | -5 | Skill Cooldown | global | percent | sign | Data!L30:O30 |
| Champion | 4 / 2 | -20 | Skill Cooldown | personal | percent | sign | Data!P32:T32 |
| Praetorian | 5 / 3 | 8 | Skill Power | personal | flat | magnitude | Data!U38:X38 |
| Wizard | 8 / 4 | 40 | Attack Speed | global | percent | magnitude, type, scope | Data!AH15:AL15 |
| Battlemage | 8 / 4 | 150 | Damage | global | percent | magnitude, scope | Data!AH21:AL21 |
| Sniper | 12 / 6 | 4250 | Ultra Crit Damage | personal | percent | type | Data!AZ22:BD22 |
| Battlemage | 3 / 2 | 5 | Skill Power | personal | flat | magnitude | Data!L21:O21 |
| Battlemage | 6 / 3 | -30 | Skill Cooldown | personal | percent | sign | Data!Y21:AC21 |
| Warden | 6 / 3 | -10 | Skill Cooldown | global | percent | sign | Data!Y37:AC37 |

## Complete 129-effect comparison

“Old / active” compares frozen and pre-batch active magnitudes; a single number means they agree. Predictions are positive magnitudes, with cooldown direction separately flagged. Types are canonicalized using the existing aliases. Differences refer to the recorded pre-batch active snapshot.

### Veteran

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Observed signed value | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Veteran | 1 / 1 | Skill Duration, personal, flat | 1 | 21 | 43 | magnitude | Data!C43:F43 |
| Titan | 1 / 1 | Skill Duration, personal, flat | 1 | 21 | 43 | magnitude | Data!C41:F41 |
| Veteran | 1 / 2 | Kill Gold, personal, percent | 50 | 1066 | 1066 | matches | Data!G43:K43 |
| Sovereign | 1 / 2 | Damage, global, percent | 20 | 427 | 427 | matches | Data!G39:K39 |
| Dicemaster | 1 / 2 | Skill Cooldown, global, percent | 4 | 85 | -85 | sign | Data!G42:K42 |
| Veteran | 2 / 3 | Skill Power, personal, flat | 40 | 853 | 107 | magnitude, type | Data!L43:O43 |
| Berserker | 2 / 3 | Super Exp Chance, global, percent | 40 | 853 | 21 | magnitude, type | Data!L26:O26 |
| Veteran | 2 / 4 | Crit Damage, personal, percent | 150 | 3199 | 3199 | matches | Data!P43:T43 |
| Warlock | 2 / 4 | Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P30:T30 |
| Deadeye | 2 / 4 | Crit Chance, personal, percent | 25 | 533 | 533 | matches | Data!P40:T40 |
| Veteran | 3 / 5 | Damage, global, percent | 80 | 682 | 682 | matches | Data!U43:X43 |
| Battlemage | 3 / 5 | Damage, global, percent | 80 | 682 | 682 | matches | Data!U21:X21 |
| Veteran | 3 / 6 | Skill Cooldown, global, percent | 10 | 85 | -85 | sign | Data!Y43:AC43 |
| Paladin | 3 / 6 | Crit Damage, personal, percent | 250 | 2133 | 2133 | matches | Data!Y20:AC20 |
| Praetorian | 3 / 6 | Skill Cooldown, personal, percent | 30 | 256 | -256 | sign | Data!Y38:AC38 |
| Veteran | 4 / 7 | Damage, personal, percent | 300 | 2559 | 2559 | matches | Data!AD43:AG43 |
| Necromancer | 4 / 7 | Super Energy Chance, global, percent | 1 | 9 | 9 | matches | Data!AD36:AG36 |
| Veteran | 4 / 8 | Super Exp Amount, global, percent | 6 | 51 | 60 | magnitude, type | Data!AH43:AL43 |
| Warlord | 4 / 8 | Skill Power, global, flat | 2 | 17 | 17 | matches | Data!AH35:AL35 |
| Skymage | 4 / 8 | Skill Power, global, flat | 2 | 17 | 17 | matches | Data!AH27:AL27 |
| Veteran | 5 / 9 | Super Crit Damage, personal, percent | 1100 | 8069 | 8069 | matches | Data!AM43:AP43 |
| Rogue | 5 / 9 | Super Energy Chance, global, percent | 3 | 22 | 22 | matches | Data!AM25:AP25 |
| Veteran | 5 / 10 | Super Exp Chance, global, percent | 7 | 51 | 51 | matches | Data!AQ43:AU43 |
| Ninja | 5 / 10 | Super Energy Chance, global, percent | 4 | 29 | 29 | matches | Data!AQ8:AU8 |
| Chieftain | 5 / 10 | Super Exp Chance, global, percent | 7 | 51 | 51 | matches | Data!AQ29:AU29 |
| Veteran | 6 / 11 | Kill Gold, personal, percent | 500 | 3668 | 3668 | matches | Data!AV43:AY43 |
| Spelldancer | 6 / 11 | Skill Power, global, flat | 5 | 37 | 37 | matches | Data!AV24:AY24 |
| Veteran | 6 / 12 | Energy Income, global, flat | 6 | 44 | 44 | matches | Data!AZ43:BD43 |
| Arbalest | 6 / 12 | Skill Power, global, flat | 6 | 44 | 44 | matches | Data!AZ19:BD19 |
| Captain | 6 / 12 | Damage, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ34:BD34 |
| Veteran | 7 / 13 | Boss Exp, global, percent | 20 | 121 | 121 | matches | Data!BE43:BH43 |
| Templar | 7 / 13 | Super Exp Amount, global, percent | 20 | 121 | 121 | matches | Data!BE33:BH33 |
| Veteran | 7 / 14 | Super Exp Amount, global, percent | 25 | 151 | 151 | matches | Data!BI43:BM43 |
| Viking | 7 / 14 | Skill Power, global, flat | 8 | 48 | 48 | matches | Data!BI5:BM5 |
| Forester | 7 / 14 | Damage, global, percent | 350 | 2114 | 2114 | matches | Data!BI10:BM10 |
| Veteran | 8 / 15 | Skill Power, global, flat | 12 | 41 | 41 | matches | Data!BN43:BS43 |
| Champion | 8 / 15 | Boss Exp, global, percent | 40 | 136 | 136 | matches | Data!BN32:BS32 |
| Skymage | 8 / 15 | Ultra Exp Amount, global, percent | 105 | 358 | 358 | matches | Data!BN27:BS27 |
| Sniper | 8 / 15 | Attack Speed, personal, percent | 175 | 597 | 597 | matches | Data!BN22:BS22 |
| Veteran | 9 / 16 | Ultra Exp Amount, global, percent | 125 | 427 | 427 | matches | Data!BT43:BY43 |
| Viking | 9 / 16 | Skill Power, global, flat | 15 | 51 | 51 | matches | Data!BT5:BY5 |
| Archer | 9 / 16 | Skill Power, personal, flat | 40 | 136 | 136 | matches | Data!BT13:BY13 |
| Ballista | 9 / 16 | Ultra Exp Chance, global, percent | 10 | 34 | 34 | matches | Data!BT28:BY28 |

### Praetorian

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Observed signed value | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Praetorian | 1 / 1 | Crit Chance, global, percent | 2 | 43 | 43 | matches | Data!C38:F38 |
| Sovereign | 1 / 1 | Skill Cooldown, personal, percent | 5 | 107 | -107 | sign | Data!C39:F39 |
| Praetorian | 1 / 2 | Kill Gold, global, percent | 20 | 427 | 427 | matches | Data!G38:K38 |
| Titan | 1 / 2 | Skill Cooldown, global, percent | 4 | 85 | -85 | sign | Data!G41:K41 |
| Deadeye | 1 / 2 | Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G40:K40 |
| Praetorian | 2 / 3 | Damage, personal, percent | 100 | 2133 | 2133 | matches | Data!L38:O38 |
| Warlock | 2 / 3 | Skill Cooldown, global, percent | 5 | 107 | -107 | sign | Data!L30:O30 |
| Praetorian | 2 / 4 | Attack Speed, global, percent | 15 | 320 | 320 | matches | Data!P38:T38 |
| Champion | 2 / 4 | Skill Cooldown, personal, percent | 20 | 427 | -427 | sign | Data!P32:T32 |
| Rogue | 2 / 4 | Kill Gold, global, percent | 60 | 1280 | 1280 | matches | Data!P25:T25 |
| Praetorian | 3 / 5 | Skill Power, personal, flat | 7 | 60 | 68 | magnitude | Data!U38:X38 |
| Dicemaster | 3 / 5 | Crit Chance, global, percent | 16 | 136 | 136 | matches | Data!U42:X42 |
| Praetorian | 3 / 6 | Skill Cooldown, personal, percent | 30 | 256 | -256 | sign | Data!Y38:AC38 |
| Paladin | 3 / 6 | Crit Damage, personal, percent | 250 | 2133 | 2133 | matches | Data!Y20:AC20 |
| Veteran | 3 / 6 | Skill Cooldown, global, percent | 10 | 85 | -85 | sign | Data!Y43:AC43 |
| Praetorian | 4 / 7 | Energy Income, global, flat | 1 | 9 | 9 | matches | Data!AD38:AG38 |
| Ninja | 4 / 7 | Damage, global, percent | 125 | 1066 | 1066 | matches | Data!AD8:AG8 |
| Praetorian | 4 / 8 | Super Crit Chance, personal, percent | 15 | 128 | 128 | matches | Data!AH38:AL38 |
| Wizard | 4 / 8 | Attack Speed, global, percent | 950 | 8104 | 341 | magnitude, type, scope | Data!AH15:AL15 |
| Battlemage | 4 / 8 | Damage, global, percent | 350 | 2986 | 1280 | magnitude, scope | Data!AH21:AL21 |
| Praetorian | 5 / 9 | Super Crit Damage, global, percent | 550 | 4035 | 4035 | matches | Data!AM38:AP38 |
| Militia | 5 / 9 | Super Exp Amount, global, percent | 10 | 73 | 73 | matches | Data!AM2:AP2 |
| Praetorian | 5 / 10 | Damage, global, percent | 200 | 1467 | 1467 | matches | Data!AQ38:AU38 |
| Sorcerer | 5 / 10 | Super Gold Chance, personal, percent | 25 | 183 | 183 | matches | Data!AQ9:AU9 |
| Crusader | 5 / 10 | Kill Gold, personal, percent | 450 | 3037 | 3037 | matches | Data!AQ31:AU31 |
| Praetorian | 6 / 11 | Ultra Gold Amount, global, percent | 2000 | 14672 | 14672 | matches | Data!AV38:AY38 |
| Samurai | 6 / 11 | Energy Income, global, flat | 5 | 37 | 37 | matches | Data!AV17:AY17 |
| Praetorian | 6 / 12 | Ultra Crit Damage, global, percent | 2250 | 16506 | 16506 | matches | Data!AZ38:BD38 |
| Apprentice | 6 / 12 | Kill Gold, global, percent | 275 | 2017 | 2017 | matches | Data!AZ3:BD3 |
| Sniper | 6 / 12 | Ultra Crit Damage, personal, percent | 4250 | 31177 | 31177 | type | Data!AZ22:BD22 |
| Praetorian | 7 / 13 | Attack Speed, personal, percent | 125 | 755 | 755 | matches | Data!BE38:BH38 |
| Necromancer | 7 / 13 | Ultra Boss Damage, global, percent | 1400 | 8455 | 8455 | matches | Data!BE36:BH36 |
| Praetorian | 7 / 14 | Skill Power, global, flat | 8 | 48 | 48 | matches | Data!BI38:BM38 |
| Scout | 7 / 14 | Super Gold Chance, global, percent | 14 | 85 | 85 | matches | Data!BI4:BM4 |
| Hunter | 7 / 14 | Super Gold Amount, personal, percent | 2000 | 12079 | 12079 | matches | Data!BI7:BM7 |
| Praetorian | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN38:BS38 |
| Titan | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN41:BS41 |
| Dicemaster | 8 / 15 | Attack Speed, global, percent | 60 | 205 | 205 | matches | Data!BN42:BS42 |
| Deadeye | 8 / 15 | Ultra Crit Chance, global, percent | 7 | 24 | 24 | matches | Data!BN40:BS40 |
| Praetorian | 9 / 16 | Ultra Crit Chance, personal, percent | 20 | 68 | 68 | matches | Data!BT38:BY38 |
| Assassin | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT11:BY11 |
| Wizard | 9 / 16 | Skill Power, global, flat | 15 | 51 | 51 | matches | Data!BT15:BY15 |
| Spelldancer | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 11089 | 11089 | matches | Data!BT24:BY24 |

### Battlemage

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Observed signed value | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Battlemage | 1 / 1 | Rank Exp, global, flat | 1 | 21 | 21 | matches | Data!C21:F21 |
| Spelldancer | 1 / 1 | Kill Gold, global, percent | 10 | 213 | 213 | matches | Data!C24:F24 |
| Battlemage | 1 / 2 | Attack Speed, personal, percent | 24 / 25 | 512 / 533 | 533 | matches | Data!G21:K21 |
| Gladiator | 1 / 2 | Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G23:K23 |
| Rogue | 1 / 2 | Damage, global, percent | 20 | 427 | 427 | matches | Data!G25:K25 |
| Battlemage | 2 / 3 | Skill Power, personal, flat | 3 | 64 | 107 | magnitude | Data!L21:O21 |
| Wizard | 2 / 3 | Crit Chance, global, percent | 8 | 171 | 171 | matches | Data!L15:O15 |
| Battlemage | 2 / 4 | Crit Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P21:T21 |
| Militia | 2 / 4 | Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P2:T2 |
| Druid | 2 / 4 | Crit Chance, global, percent | 12 | 256 | 256 | matches | Data!P6:T6 |
| Battlemage | 3 / 5 | Damage, global, percent | 80 | 682 | 682 | matches | Data!U21:X21 |
| Veteran | 3 / 5 | Damage, global, percent | 80 | 682 | 682 | matches | Data!U43:X43 |
| Battlemage | 3 / 6 | Skill Cooldown, personal, percent | 30 | 256 | -256 | sign | Data!Y21:AC21 |
| Ballista | 3 / 6 | Attack Speed, personal, percent | 100 | 853 | 853 | matches | Data!Y28:AC28 |
| Warden | 3 / 6 | Skill Cooldown, global, percent | 10 | 68 | -68 | sign | Data!Y37:AC37 |
| Battlemage | 4 / 7 | Super Gold Amount, global, percent | 450 | 3839 | 3839 | matches | Data!AD21:AG21 |
| Ranger | 4 / 7 | Energy Income, global, flat | 1 | 9 | 9 | matches | Data!AD16:AG16 |
| Battlemage | 4 / 8 | Damage, global, percent | 350 | 2986 | 1280 | magnitude, scope | Data!AH21:AL21 |
| Praetorian | 4 / 8 | Super Crit Chance, personal, percent | 15 | 128 | 128 | matches | Data!AH38:AL38 |
| Wizard | 4 / 8 | Attack Speed, global, percent | 950 | 8104 | 341 | magnitude, type, scope | Data!AH15:AL15 |
| Battlemage | 5 / 9 | Super Gold Chance, personal, percent | 20 | 147 | 147 | matches | Data!AM21:AP21 |
| Chieftain | 5 / 9 | Kill Gold, global, percent | 175 | 1284 | 1284 | matches | Data!AM29:AP29 |
| Battlemage | 5 / 10 | Super Crit Damage, global, percent | 625 | 4585 | 4585 | matches | Data!AQ21:AU21 |
| Witch | 5 / 10 | Kill Gold, personal, percent | 450 | 3301 | 3301 | matches | Data!AQ12:AU12 |
| Sovereign | 5 / 10 | Energy Income, global, flat | 4 | 29 | 29 | matches | Data!AQ39:AU39 |
| Battlemage | 6 / 11 | Kill Gold, global, percent | 250 | 1834 | 1834 | matches | Data!AV21:AY21 |
| Paladin | 6 / 11 | Damage, personal, percent | 500 | 3668 | 3668 | matches | Data!AV20:AY20 |
| Battlemage | 6 / 12 | Energy Income, global, flat | 6 | 44 | 44 | matches | Data!AZ21:BD21 |
| Forester | 6 / 12 | Kill Gold, global, percent | 275 | 2017 | 2017 | matches | Data!AZ10:BD10 |
| Deadeye | 6 / 12 | Kill Gold, global, percent | 275 | 2017 | 2017 | matches | Data!AZ40:BD40 |
| Battlemage | 7 / 13 | Attack Speed, global, percent | 40 | 242 | 242 | matches | Data!BE21:BH21 |
| Berserker | 7 / 13 | Damage, global, percent | 300 | 1812 | 1812 | matches | Data!BE26:BH26 |
| Battlemage | 7 / 14 | Damage, global, percent | 350 | 2114 | 2114 | matches | Data!BI21:BM21 |
| Sniper | 7 / 14 | Ultra Boss Damage, global, percent | 1600 | 9663 | 9663 | matches | Data!BI22:BM22 |
| Crusader | 7 / 14 | Super Gold Amount, personal, percent | 2000 | 11112 | 11112 | matches | Data!BI31:BM31 |
| Battlemage | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN21:BS21 |
| Witch | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN12:BS12 |
| Spelldancer | 8 / 15 | Skill Duration, personal, flat | 20 | 68 | 68 | matches | Data!BN24:BS24 |
| Templar | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN33:BS33 |
| Battlemage | 9 / 16 | Skill Power, global, flat | 15 | 51 | 51 | matches | Data!BT21:BY21 |
| Samurai | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 11089 | 11089 | matches | Data!BT17:BY17 |
| Paladin | 9 / 16 | Shadow Runes, personal, flat | 2 | 7 | 7 | matches | Data!BT20:BY20 |
| Champion | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT32:BY32 |

