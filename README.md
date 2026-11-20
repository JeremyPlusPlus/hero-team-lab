# Hero Team Lab

Hero Team Lab is a browser-based team calculator for **Idle Hero TD**. Use it to ask questions like “Would a different Hunter ascension earn more gold from Mimics?” or “Who should kill bosses while I level Veteran?” It compares two ten-slot lineups using your heroes, tile placements and account bonuses.

## Open the calculator

[Launch Hero Team Lab in your browser](https://jeremyplusplus.github.io/hero-team-lab/).

If you already use the downloaded calculator, choose **Export setup** in that copy, then **Import** on the website to bring over your teams and ascension ranks.

### Use the offline copy

1. [Download the Hero Team Lab ZIP](outputs/Hero-Team-Lab.zip?raw=true).
2. Extract the ZIP and open `hero-team-lab.html` in a desktop browser. The file includes the calculator and all 42 supported heroes.
3. Open `START HERE.txt` in the same folder for the sample account settings and level-by-level examples.

## Compare your first build

1. **Choose a focus.** Pick the reward you want to improve. Each focus remembers its own Team A and Team B.
2. **Set up your account.** Check **Calculation settings**, the synergy event, Snow Fort and the skill values for your focus. The starting values come from one recorded account. Under **My ascensions → My ascensions · account baseline**, enter the ranks where your heroes differ from the defaults. Enter each hero once, even if you deploy several copies.
3. **Put your current lineup in Team A.** Match the heroes, levels, tiles and attacker you use in game. In Experience, choose the **Hero to level** and the **Boss attacker** separately. Use **Copy A → B** to start with equal teams.
4. **Change one thing in Team B.** Try a tile, a hero or an ascension. For an ascension trial, select **Team B build** in **My ascensions**. Blank fields inherit your account ranks. An explicit zero tests an unpurchased upgrade.
5. **Search the alternatives.** Use **Suggest tiles** for the current roster or **Suggest team B** to search across the enabled heroes in **Suggestion roster**. Lock heroes whose slots and levels you want to keep. Tiles can still move. Gold and Damage keep your chosen attacker by default. Turn on **Choose the best attacker too** to let the search replace it.

**Example — Hunter Gold build.** In Gold, select Hunter as Team A’s attacker and copy A to B. Under **My ascensions → Team B build**, select Hunter and choose **Use Gold 14 · zero both bonuses**. Compare Gold per Mimic on the identical lineup first. Then run **Suggest team B** to see if the new build favors different supports. Global ascension ranks and any other fields you left blank still come from your baseline.

## Pick a focus and read its score

| Focus | What to compare |
| --- | --- |
| Gold | Expected Gold per Mimic, including Super and Ultra chances. For an hourly comparison, enter successful Mimic kills per hour for each team, or use the encounter estimate and your enemies cleared per hour. |
| Experience | XP received by the selected leveling slot per boss. Set **Boss attacker** to **Best on team** to compare direct kills with Veteran-shared kills. Use **Plan levels 1–4,500** to search level ranges and **Use in B** to load a recommended lineup. |
| Energy / Energy + Power Mages | Use Energy for wave income. Choose Energy + Power Mages to include the extra energy factors that apply to a Power Mage kill. |
| Damage / Damage · Buff swap | Compare attackers and supports on the same target. Use Buff swap for the replacement lineup that takes the field after a separate team supplies buffs. |
| Immortal Boss Damage | Select Skill damage, Melee, Mage or Ranged and choose a buff preset. **Damage by hero** shows which heroes and attacks contribute to that boss. |

With Snow Fort active, **the XP tile belongs on the hero making the kill** to earn its +20% bonus. Veteran’s Exp Share passes that boosted kill reward to eligible heroes. A Skill Power tile on Archer, Ballista or Veteran strengthens its active ability. Its mastery uses account Mastery Power. For example, while leveling Ballista, you can compare a Skill Power Ballista receiving Viking’s XP-tile kills against an XP-tile Ballista doing the killing.

Check the account and skill assumptions beside each result. Gold and XP indexes compare rewards on a common scale. A per-boss advantage can disappear if the team clears fewer bosses per hour. **Suggest team B** searches for a strong legal lineup within your roster, levels and locks. Other lineups may score higher.

## Save or share a setup

Team Lab saves your changes in the current browser when local storage is available. Use **Export setup** before moving the HTML file or switching browsers. To reproduce a comparison, send the exported JSON along with the calculator. The other player can choose **Import** to load your teams, account baseline and trial ranks.

## Contribute and learn more

For a correction, include your game version, focus, hero levels, tiles, relevant account settings, and the value you observed. An exported setup makes a discrepancy easier to reproduce. For local build and test instructions, read the [contributor guide](CONTRIBUTING.md).

The roster and initial synergy records were adapted from the community spreadsheet credited to Mana, Osto and devilkk. Player observations and game builds informed later corrections. [Community spreadsheet](https://docs.google.com/spreadsheets/d/1fhCvf0yoFYqoTic86KpcjGmAFDYv-RHGCAas8sG1B6U/edit?gid=63100333#gid=63100333) · [Calculation details and historical notes](docs/calculator-reference.md)
