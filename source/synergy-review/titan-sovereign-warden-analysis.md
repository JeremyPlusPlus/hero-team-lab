# Independent Titan, Sovereign, and Warden synergy audit

Nine screenshots contain **129 displayed effects** across 48 groups. They were independently read against the frozen spreadsheet and the active dataset before these batches' changes. Repeated hero portraits are retained as separate observed occurrences: Titan tier IX shows two Warlocks, and Sovereign tier VIII shows three Crusaders. There are **118 unique owner/index records** in these three captures.

The pre-activation data snapshot SHA-256 was `7e6537501cb9528b8b33c37861c486fffb6acce89b9c60c063b67e63cbda9baa`. This audit owns this report and the relevant tests in `tests/engine.test.cjs`; it does not modify the engine, observations, manifests, or active hero data.

## Scaling and corrections

The continuing model uses `S = 1.05^3 × 1.25 × 1.1^9 = 3.412023994742347` for an ordinary owner, multiplied by tier factors 6.25, 2.5, 2.15, 1.77, or 1 as appropriate. Warden uses relative owner factor 1/1.25; Crusader uses 1.15/1.25. Account/deployment/map continuation and the absence of an additional displayed tile factor remain assumptions; the images do not newly establish tile positions.

| Capture | Frozen magnitude matches | Pre-activation active magnitude matches |
| --- | ---: | ---: |
| Titan | 36/43 | 38/43 |
| Sovereign | 39/43 | 39/43 |
| Warden | 41/43 | 42/43 |

Eight unique correction records account for all remaining differences. They comprise **4 type changes, 1 scope change, 8 inferred-base changes, and no new sign changes**. After these changes, all **129 displayed values forward-round exactly** under the continuing profile.

| Owner / index | Before | Screenshot | Recommended inferred base / effect | Source |
| --- | --- | --- | --- | --- |
| Titan / 3 | 40 Attack Speed, personal | +213% Attack Speed, global | 10 Attack Speed, global | Data!L41:O41 |
| Sovereign / 6 | 25 Rank Exp, global | +9 flat Skill Power, global | 1 Skill Power, global | Data!Y39:AC39 |
| Necromancer / 8 | 175 Damage, global | +1280% Damage, global | 150 Damage, global | Data!AH36:AL36 |
| Titan / 9 | 20 Super Gold Chance, personal | +88 flat Skill Power, personal | 12 Skill Power, personal | Data!AM41:AP41 |
| Warlord / 9 | 3 Super Energy Chance, global | +59% Super Crit Chance, global | 8 Super Crit Chance, global | Data!AM35:AP35 |
| Sovereign / 3 | 50 Crit Damage, global | +853% Crit Damage, global | 40 Crit Damage, global | Data!L39:O39 |
| Sovereign / 5 | 7 Skill Power, personal | +68 flat Skill Power, personal | 8 Skill Power, personal | Data!U39:X39 |
| Crusader / 7 | 10 Super Crit Chance, personal | +94 flat Skill Power, personal | 12 Skill Power, personal | Data!AD31:AG31 |

These eight bases are the unique whole-number candidates under the stated scale and rounding model, not directly observed unmodified game values. Preserve **inferred-calibrated** status and pair each new label/scope with its inferred magnitude. An unreported effect-specific modifier could still imitate a changed base in one capture.

The existing cooldown signs in Titan, Sovereign, and Warden screenshots corroborate earlier corrections. All partner multisets and rank requirements match the original records.

## Warden digit recheck and overlaps

Warden tier II index 4 reads **+102 personal Skill Power**. A first full-image reading was mistaken for 192; enlarged inspection establishes that the middle digit is zero. The screenshot therefore agrees with the earlier Spelldancer capture and the active inferred base 6:

`6 × S × 6.25 / 1.25 = 102.360719842270 → 102`.

This was a transcription issue, not evidence of a changed game value. No pending conflict or new normalization is warranted.

All **36 appearances overlapping previous captures** agree in signed value, type, scope, and unit. All **11 repeated appearances within these captures** also agree: eight are cross-capture repetitions and three are extra portraits within a group. No contradictory observations remain.

Warden's old base 5 personal Ultra Gold Chance still predicts `5 × S × 2.15 / 1.25 = 29.343406354784 → 29`; no base change is required. Crusader's owner-specific scaling predicts its new personal Skill Power from base 12: `12 × S × 2.5 × 1.15/1.25 = 94.171862254889 → 94`.

## Duplicate requirements and engine behavior

The source records already preserve the multisets:

- Titan tier IX: Titan + Warlord + Warlock + Warlock.
- Sovereign tier VIII: Sovereign + Crusader + Crusader + Crusader.

`synergyActive` reserves one owner copy, then consumes each listed partner copy at most once. With the user-selected requirement reduction, three/four-hero groups need one fewer partner. The owner remains mandatory for that owner's effect. This handles repeated-owner reciprocal records correctly: Warlock reserves itself before searching for another Warlock, and Crusader reserves itself before searching for two more Crusaders.

`evaluate` and `makeScorer` emit each active synergy **once per deployed owner copy**, not once per possible matching combination. Thus two Warlocks emit two Energy Income bonuses; three Crusaders emit three Ultra Gold Chance bonuses. The owner has one data definition even when its portrait repeats in a screenshot.

No engine defect was found. Integration tests cover full/reduced requirements, missing owners, each repeated copy's distinct owner index, extra matching combinations, additive and multiplicative totals, and scorer parity for all four focuses.

### Independent hand calculations with external boosts disabled

| Team / reduction | Expected effect emissions | Expected result |
| --- | ---: | --- |
| Titan + Warlord + Warlock×2, full requirements | 4 | Energy = (1 + 15 + 15) × 1.75 = **54.25**; damage = **33.5** |
| Titan + Warlord + Warlock×3, full requirements | 5 | Energy = (1 + 45) × 1.75 = **80.5**; Titan/Warlord effects remain single |
| Titan + Warlord + Warlock, reduction enabled | 3 | Energy = (1 + 15) × 1.75 = **28** |
| Sovereign + Crusader×3, full requirements | 4 | Gold = 31 × (1 + 21×0.05) = **63.55** |
| Sovereign + Crusader×2, reduction enabled | 3 | Gold = 31 × (1 + 14×0.05) = **52.7** |
| Sovereign×2 + Crusader×3, full requirements | 5 | Gold = 31² × (1 + 21×0.05) = **1970.05** |

The screenshot integration test fills each group to nine deployed slots while retaining its required duplicate copies. It maps repeated portrait observations to distinct emitted owner indices and checks all 129 values. The all-ten-batch overlap test verifies 33 repeated groups and 96 repeated effect appearances; three additional duplicate portrait appearances are retained within groups.

The ingestion helper `validate_group_effects` was exercised independently, read-only: both valid repeated-portrait groups passed; removing an effect, adding an effect, changing one repeated value, or changing one repeated scope was rejected for each group (**10/10 guard cases**). This protects the distinction between one data definition per owner and one observed/emitted effect per deployed copy.

After the separate activation workflow applied the eight corrections and fixed the Warden transcription, the full engine suite passed **62/62 tests**. A fresh comparison against active data found **43/43 matching effects in each new capture**, with no remaining type, scope, sign, magnitude, or overlap discrepancies. The original source still matches 116/129 new magnitudes; the complete ten-capture review remains 430 displayed occurrences and 331 unique effects.

## Complete 129-effect comparison

The tables retain the pre-activation snapshot. A single number in “Old / active” means the frozen and active magnitudes agreed. Predictions are magnitudes; signed observations preserve reduction direction. Existing canonical aliases are treated as equivalent.


### Titan

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Signed observation | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Titan | 1 / 1 | Skill Duration, personal, flat | 1 / 2 | 21 / 43 | 43 | matches | Data!C41:F41 |
| Veteran | 1 / 1 | Skill Duration, personal, flat | 1 / 2 | 21 / 43 | 43 | matches | Data!C43:F43 |
| Titan | 1 / 2 | Skill Cooldown, global, percent | 4 / -4 | 85 | -85 | matches | Data!G41:K41 |
| Praetorian | 1 / 2 | Kill Gold, global, percent | 20 | 427 | 427 | matches | Data!G38:K38 |
| Deadeye | 1 / 2 | Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G40:K40 |
| Titan | 2 / 3 | Attack Speed, global, percent | 40 | 853 | 213 | magnitude, scope | Data!L41:O41 |
| Warden | 2 / 3 | Damage, global, percent | 40 | 682 | 682 | matches | Data!L37:O37 |
| Titan | 2 / 4 | Kill Gold, personal, percent | 150 | 3199 | 3199 | matches | Data!P41:T41 |
| Wizard | 2 / 4 | Attack Speed, global, percent | 15 | 320 | 320 | matches | Data!P15:T15 |
| Dicemaster | 2 / 4 | Damage, personal, percent | 150 | 3199 | 3199 | matches | Data!P42:T42 |
| Titan | 3 / 5 | Crit Damage, personal, percent | 200 | 1706 | 1706 | matches | Data!U41:X41 |
| Crusader | 3 / 5 | Skill Duration, personal, flat | 8 | 63 | 63 | matches | Data!U31:X31 |
| Titan | 3 / 6 | Damage, global, percent | 100 | 853 | 853 | matches | Data!Y41:AC41 |
| Sovereign | 3 / 6 | Skill Power, global, flat | 25 | 213 | 9 | magnitude, type | Data!Y39:AC39 |
| Deadeye | 3 / 6 | Attack Speed, global, percent | 30 | 256 | 256 | matches | Data!Y40:AC40 |
| Titan | 4 / 7 | Super Crit Damage, personal, percent | 850 | 7251 | 7251 | matches | Data!AD41:AG41 |
| Apprentice | 4 / 7 | Super Exp Chance, global, percent | 2 | 17 | 17 | matches | Data!AD3:AG3 |
| Titan | 4 / 8 | Kill Gold, global, percent | 150 | 1280 | 1280 | matches | Data!AH41:AL41 |
| Viking | 4 / 8 | Kill Gold, global, percent | 150 | 1280 | 1280 | matches | Data!AH5:AL5 |
| Necromancer | 4 / 8 | Damage, global, percent | 175 | 1493 | 1280 | magnitude | Data!AH36:AL36 |
| Titan | 5 / 9 | Skill Power, personal, flat | 20 | 147 | 88 | magnitude, type | Data!AM41:AP41 |
| Warlord | 5 / 9 | Super Crit Chance, global, percent | 3 | 22 | 59 | magnitude, type | Data!AM35:AP35 |
| Titan | 5 / 10 | Energy Income, global, flat | 4 | 29 | 29 | matches | Data!AQ41:AU41 |
| Berserker | 5 / 10 | Kill Gold, personal, percent | 450 | 3301 | 3301 | matches | Data!AQ26:AU26 |
| Wizard | 5 / 10 | Damage, personal, percent | 450 | 3301 | 3301 | matches | Data!AQ15:AU15 |
| Titan | 6 / 11 | Damage, personal, percent | 500 | 3668 | 3668 | matches | Data!AV41:AY41 |
| Arbalest | 6 / 11 | Ultra Exp Chance, global, percent | 2 | 15 | 15 | matches | Data!AV19:AY19 |
| Titan | 6 / 12 | Kill Gold, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ41:BD41 |
| Militia | 6 / 12 | Damage, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ2:BD2 |
| Archer | 6 / 12 | Ultra Crit Damage, global, percent | 2250 | 16506 | 16506 | matches | Data!AZ13:BD13 |
| Titan | 7 / 13 | Damage, global, percent | 300 | 1812 | 1812 | matches | Data!BE41:BH41 |
| Witch | 7 / 13 | Damage, global, percent | 300 | 1812 | 1812 | matches | Data!BE12:BH12 |
| Titan | 7 / 14 | Skill Power, global, flat | 8 | 48 | 48 | matches | Data!BI41:BM41 |
| Warlock | 7 / 14 | Super Exp Amount, global, percent | 25 | 151 | 151 | matches | Data!BI30:BM30 |
| Archer | 7 / 14 | Super Exp Chance, global, percent | 10 | 60 | 60 | matches | Data!BI13:BM13 |
| Titan | 8 / 15 | Skill Power, personal, flat | 30 | 102 | 102 | matches | Data!BN41:BS41 |
| Praetorian | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN38:BS38 |
| Dicemaster | 8 / 15 | Attack Speed, global, percent | 60 | 205 | 205 | matches | Data!BN42:BS42 |
| Deadeye | 8 / 15 | Ultra Crit Chance, global, percent | 7 | 24 | 24 | matches | Data!BN40:BS40 |
| Titan | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 11089 | 11089 | matches | Data!BT41:BY41 |
| Warlord | 9 / 16 | Ultra Energy Amount, global, percent | 75 | 256 | 256 | matches | Data!BT35:BY35 |
| Warlock | 9 / 16 | Energy Income, global, flat | 15 | 51 | 51 | matches | Data!BT30:BY30 |
| Warlock | 9 / 16 | Energy Income, global, flat | 15 | 51 | 51 | matches | Data!BT30:BY30 |

### Sovereign

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Signed observation | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Sovereign | 1 / 1 | Skill Cooldown, personal, percent | 5 / -5 | 107 | -107 | matches | Data!C39:F39 |
| Praetorian | 1 / 1 | Crit Chance, global, percent | 2 | 43 | 43 | matches | Data!C38:F38 |
| Sovereign | 1 / 2 | Damage, global, percent | 20 | 427 | 427 | matches | Data!G39:K39 |
| Dicemaster | 1 / 2 | Skill Cooldown, global, percent | 4 / -4 | 85 | -85 | matches | Data!G42:K42 |
| Veteran | 1 / 2 | Kill Gold, personal, percent | 50 | 1066 | 1066 | matches | Data!G43:K43 |
| Sovereign | 2 / 3 | Crit Damage, global, percent | 50 | 1066 | 853 | magnitude | Data!L39:O39 |
| Ballista | 2 / 3 | Crit Damage, personal, percent | 100 | 2133 | 2133 | matches | Data!L28:O28 |
| Sovereign | 2 / 4 | Kill Gold, personal, percent | 150 | 3199 | 3199 | matches | Data!P39:T39 |
| Chieftain | 2 / 4 | Crit Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P29:T29 |
| Captain | 2 / 4 | Kill Gold, personal, percent | 150 | 3199 | 3199 | matches | Data!P34:T34 |
| Sovereign | 3 / 5 | Skill Power, personal, flat | 7 | 60 | 68 | magnitude | Data!U39:X39 |
| Warlock | 3 / 5 | Skill Duration, personal, flat | 8 | 68 | 68 | matches | Data!U30:X30 |
| Sovereign | 3 / 6 | Skill Power, global, flat | 25 | 213 | 9 | magnitude, type | Data!Y39:AC39 |
| Titan | 3 / 6 | Damage, global, percent | 100 | 853 | 853 | matches | Data!Y41:AC41 |
| Deadeye | 3 / 6 | Attack Speed, global, percent | 30 | 256 | 256 | matches | Data!Y40:AC40 |
| Sovereign | 4 / 7 | Kill Gold, global, percent | 125 | 1066 | 1066 | matches | Data!AD39:AG39 |
| Crusader | 4 / 7 | Skill Power, personal, flat | 10 | 78 | 94 | magnitude, type | Data!AD31:AG31 |
| Sovereign | 4 / 8 | Super Gold Chance, global, percent | 6 | 51 | 51 | matches | Data!AH39:AL39 |
| Templar | 4 / 8 | Super Crit Chance, personal, percent | 15 | 128 | 128 | matches | Data!AH33:AL33 |
| Forester | 4 / 8 | Skill Power, global, flat | 2 | 17 | 17 | matches | Data!AH10:AL10 |
| Sovereign | 5 / 9 | Super Crit Chance, global, percent | 8 | 59 | 59 | matches | Data!AM39:AP39 |
| Arbalest | 5 / 9 | Damage, personal, percent | 400 | 2934 | 2934 | matches | Data!AM19:AP19 |
| Sovereign | 5 / 10 | Energy Income, global, flat | 4 | 29 | 29 | matches | Data!AQ39:AU39 |
| Witch | 5 / 10 | Kill Gold, personal, percent | 450 | 3301 | 3301 | matches | Data!AQ12:AU12 |
| Battlemage | 5 / 10 | Super Crit Damage, global, percent | 625 | 4585 | 4585 | matches | Data!AQ21:AU21 |
| Sovereign | 6 / 11 | Ultra Exp Amount, global, percent | 45 | 330 | 330 | matches | Data!AV39:AY39 |
| Berserker | 6 / 11 | Ultra Gold Chance, personal, percent | 5 | 37 | 37 | matches | Data!AV26:AY26 |
| Sovereign | 6 / 12 | Damage, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ39:BD39 |
| Peacekeeper | 6 / 12 | Ultra Energy Chance, global, percent | 3 | 22 | 22 | matches | Data!AZ14:BD14 |
| Warden | 6 / 12 | Ultra Energy Chance, global, percent | 3 | 18 | 18 | matches | Data!AZ37:BD37 |
| Sovereign | 7 / 13 | Skill Power, global, flat | 7 | 42 | 42 | matches | Data!BE39:BH39 |
| Warlock | 7 / 13 | Super Gold Amount, global, percent | 850 | 5133 | 5133 | matches | Data!BE30:BH30 |
| Sovereign | 7 / 14 | Super Gold Amount, global, percent | 925 | 5586 | 5586 | matches | Data!BI39:BM39 |
| Chieftain | 7 / 14 | Kill Gold, global, percent | 350 | 2114 | 2114 | matches | Data!BI29:BM29 |
| Elementalist | 7 / 14 | Skill Power, personal, flat | 20 | 121 | 121 | matches | Data!BI18:BM18 |
| Sovereign | 8 / 15 | Ultra Gold Amount, global, percent | 3000 | 10236 | 10236 | matches | Data!BN39:BS39 |
| Crusader | 8 / 15 | Ultra Gold Chance, global, percent | 7 | 22 | 22 | matches | Data!BN31:BS31 |
| Crusader | 8 / 15 | Ultra Gold Chance, global, percent | 7 | 22 | 22 | matches | Data!BN31:BS31 |
| Crusader | 8 / 15 | Ultra Gold Chance, global, percent | 7 | 22 | 22 | matches | Data!BN31:BS31 |
| Sovereign | 9 / 16 | Skill Power, personal, flat | 40 | 136 | 136 | matches | Data!BT39:BY39 |
| Hunter | 9 / 16 | Ultra Gold Amount, global, percent | 3250 | 11089 | 11089 | matches | Data!BT7:BY7 |
| Rogue | 9 / 16 | Ultra Gold Amount, global, percent | 3250 | 11089 | 11089 | matches | Data!BT25:BY25 |
| Crusader | 9 / 16 | Attack Speed, personal, percent | 200 | 628 | 628 | matches | Data!BT31:BY31 |

### Warden

| Owner | Tier / index | Observed effect / scope / unit | Old / active base | Old / active prediction | Signed observation | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Warden | 1 / 1 | Crit Chance, global, percent | 2 | 34 | 34 | matches | Data!C37:F37 |
| Necromancer | 1 / 1 | Damage, personal, percent | 25 | 533 | 533 | matches | Data!C36:F36 |
| Warden | 1 / 2 | Rank Exp, global, flat | 3 | 51 | 51 | matches | Data!G37:K37 |
| Champion | 1 / 2 | Attack Speed, global, percent | 6 | 128 | 128 | matches | Data!G32:K32 |
| Templar | 1 / 2 | Crit Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G33:K33 |
| Warden | 2 / 3 | Damage, global, percent | 40 | 682 | 682 | matches | Data!L37:O37 |
| Titan | 2 / 3 | Attack Speed, global, percent | 40 | 853 | 213 | magnitude, scope | Data!L41:O41 |
| Warden | 2 / 4 | Skill Power, personal, flat | 5 / 6 | 85 / 102 | 102 | matches | Data!P37:T37 |
| Spelldancer | 2 / 4 | Skill Cooldown, global, percent | 7 / -7 | 149 | -149 | matches | Data!P24:T24 |
| Archer | 2 / 4 | Damage, global, percent | 60 | 1280 | 1280 | matches | Data!P13:T13 |
| Warden | 3 / 5 | Kill Gold, personal, percent | 200 | 1365 | 1365 | matches | Data!U37:X37 |
| Archer | 3 / 5 | Attack Speed, global, percent | 22 | 188 | 188 | matches | Data!U13:X13 |
| Warden | 3 / 6 | Skill Cooldown, global, percent | 10 / -10 | 68 | -68 | matches | Data!Y37:AC37 |
| Battlemage | 3 / 6 | Skill Cooldown, personal, percent | 30 / -30 | 256 | -256 | matches | Data!Y21:AC21 |
| Ballista | 3 / 6 | Attack Speed, personal, percent | 100 | 853 | 853 | matches | Data!Y28:AC28 |
| Warden | 4 / 7 | Super Crit Damage, personal, percent | 850 | 5800 | 5800 | matches | Data!AD37:AG37 |
| Sniper | 4 / 7 | Kill Gold, global, percent | 125 | 1066 | 1066 | matches | Data!AD22:AG22 |
| Warden | 4 / 8 | Skill Power, global, flat | 2 | 14 | 14 | matches | Data!AH37:AL37 |
| Samurai | 4 / 8 | Super Crit Damage, personal, percent | 950 | 8104 | 8104 | matches | Data!AH17:AL17 |
| Scout | 4 / 8 | Damage, global, percent | 150 | 1280 | 1280 | matches | Data!AH4:AL4 |
| Warden | 5 / 9 | Kill Gold, personal, percent | 400 | 2347 | 2347 | matches | Data!AM37:AP37 |
| Elementalist | 5 / 9 | Super Exp Amount, global, percent | 10 | 73 | 73 | matches | Data!AM18:AP18 |
| Warden | 5 / 10 | Damage, personal, percent | 450 | 2641 | 2641 | matches | Data!AQ37:AU37 |
| Forester | 5 / 10 | Damage, personal, percent | 450 | 3301 | 3301 | matches | Data!AQ10:AU10 |
| Ranger | 5 / 10 | Super Crit Damage, global, percent | 625 | 4585 | 4585 | matches | Data!AQ16:AU16 |
| Warden | 6 / 11 | Ultra Gold Chance, personal, percent | 5 | 29 | 29 | matches | Data!AV37:AY37 |
| Militia | 6 / 11 | Kill Gold, personal, percent | 500 | 3668 | 3668 | matches | Data!AV2:AY2 |
| Warden | 6 / 12 | Ultra Energy Chance, global, percent | 3 | 18 | 18 | matches | Data!AZ37:BD37 |
| Peacekeeper | 6 / 12 | Ultra Energy Chance, global, percent | 3 | 22 | 22 | matches | Data!AZ14:BD14 |
| Sovereign | 6 / 12 | Damage, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ39:BD39 |
| Warden | 7 / 13 | Super Crit Damage, global, percent | 850 | 4107 | 4107 | matches | Data!BE37:BH37 |
| Skymage | 7 / 13 | Super Crit Chance, global, percent | 12 | 72 | 72 | matches | Data!BE27:BH27 |
| Warden | 7 / 14 | Attack Speed, personal, percent | 150 | 725 | 725 | matches | Data!BI37:BM37 |
| Witch | 7 / 14 | Skill Duration, personal, flat | 15 | 91 | 91 | matches | Data!BI12:BM12 |
| Necromancer | 7 / 14 | Skill Power, personal, flat | 20 | 121 | 121 | matches | Data!BI36:BM36 |
| Warden | 8 / 15 | Skill Power, global, flat | 12 | 33 | 33 | matches | Data!BN37:BS37 |
| Ninja | 8 / 15 | Boss Gold, personal, percent | 2250 | 7677 | 7677 | matches | Data!BN8:BS8 |
| Assassin | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN11:BS11 |
| Elementalist | 8 / 15 | Ultra Gold Amount, global, percent | 3000 | 10236 | 10236 | matches | Data!BN18:BS18 |
| Warden | 9 / 16 | Ultra Crit Damage, global, percent | 3250 | 8871 | 8871 | matches | Data!BT37:BY37 |
| Peacekeeper | 9 / 16 | Alien Tech, global, flat | 3 | 10 | 10 | matches | Data!BT14:BY14 |
| Gladiator | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT23:BY23 |
| Berserker | 9 / 16 | Ultra Crit Chance, global, percent | 8 | 27 | 27 | matches | Data!BT26:BY26 |

