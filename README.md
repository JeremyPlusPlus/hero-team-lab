# Hero Team Lab

Hero Team Lab is a browser-based team calculator for **Idle Hero TD**. Use it to ask questions like “Would a different Hunter ascension earn more gold from Mimics?” or “Who should kill bosses while I level Veteran?” It builds a ten-slot lineup using your heroes, tiles and account bonuses. You can add a second lineup to compare.

## Open the calculator

[Launch Hero Team Lab in your browser](https://jeremyplusplus.github.io/hero-team-lab/).

If you already use the downloaded calculator, choose **Export setup** in that copy, then **Import** on the website to bring over your teams and ascension ranks.

### Use the offline copy

1. [Download the Hero Team Lab ZIP](outputs/Hero-Team-Lab.zip?raw=true).
2. Extract the ZIP and open `hero-team-lab.html` in a desktop browser. The file includes the calculator and all 42 supported heroes.
3. Open `START HERE.txt` in the same folder for the sample account settings and level-by-level examples.

## Build your first team

1. **Choose a focus in the top bar.** Each focus starts with Team A and remembers its own lineups.
2. **Set up your account.** New setups start every hero’s ascension ranks at zero. Enter purchased ranks under **My ascensions → My ascensions · account baseline**. Each hero’s ranks apply to all its copies. Review Calculation settings, the synergy event, Snow Fort and skill values separately. Those start from one recorded account.
3. **Build Team A.** Choose **Suggest team A** in the lineup header to search your enabled roster, or enter your lineup by clicking a hero name and typing part of the name, such as `bal` for Ballista. Use the arrow keys and Enter to select a match. Portraits and class labels identify Ranged heroes in green, Melee in blue and Mages in red. Match the levels, tiles and attacker you use in game. In Experience, choose the **Hero to level** and **Boss attacker** separately.
4. **Refine Team A.** Lock the heroes and levels you want to keep. Use **Suggest tiles** to search placements for that lineup. Gold and Damage keep your chosen attacker unless you enable **Choose the best attacker too**.
5. **Add a comparison when you want one.** Once you’ve edited or suggested Team A, choose **Suggest team B** in Team A’s header. It starts from A’s build and opens a second editor with its own score. Each team then has its own suggestion button in its header.

**Example — Hunter Gold build.** In Gold, select Hunter as Team A’s attacker. Choose **Suggest team B** to open the comparison, then **Copy A → B** to start your trial with identical lineups. Under **My ascensions → Team B build**, select Hunter and choose **Use Gold 14 · zero both bonuses**. Compare Gold per Mimic on the identical lineup first. Then run **Suggest team B** to see if the new build favors different supports. Global ascension ranks and any other fields you left blank still come from your baseline.

On desktop, progression and account settings are on the left, **Global support rankings** are in the middle, and your team is on the right. **Bonus breakdown** spans the first two columns beneath progression and rankings. The rankings start with all candidates for your focus. Select Team A or B and enable the lineup filter to see only heroes deployed on that team. Selecting a ranked hero shows its contribution.

On a phone, use **Choose your focus** at the top, then tap **Teams**, **Rankings**, **Progression**, or **Bonuses**. Teams opens first with Team A. Once you’ve added a challenger, select **Team A** or **Team B** above the lineup to edit it. To try a new Hunter ascension, enter the trial under **Progression → My ascensions → Team B build**, then tap **Teams** to see the comparison.

## Pick a focus and read its score

Choose **Focus explanations** beneath the score to jump to the reports for your current focus. For Damage, use **Attacker skills**, **Support skills**, **Attacker tiles**, or **Chance reference**. Each focus remembers its last tab while the calculator is open.

| Focus | What to compare |
| --- | --- |
| Gold | Expected Gold per Mimic, including Super and Ultra chances. For an hourly comparison, enter successful Mimic kills per hour for each team, or use the encounter estimate and your enemies cleared per hour. |
| Experience | XP received by the selected leveling slot per boss. Set **Boss attacker** to **Best on team** to compare direct kills with Veteran-shared kills. Use **Plan levels 1–4,500** to search level ranges and load a recommended lineup into A, or into B when comparing teams. |
| Archer Experience Tag / Hunter Gold Tag | Compare Skill Power on the Archer casting the XP mark or the Hunter casting Gold Lust. Team suggestions include the named hero and search for supports and tiles that strengthen its tag. |
| Energy / Energy + Power Mages | Use Energy for wave income. Choose Energy + Power Mages to include the extra energy factors that apply to a Power Mage kill. |
| Damage / Damage · Buff swap | Compare attackers and supports on the same target. Use Buff swap for the replacement lineup that takes the field after a separate team supplies buffs. |
| Immortal Boss Damage | Mage and Ranged prioritize scoring hits/s. Tied teams compare the Ultra Crit chance of their weakest attacker. **Attacks and damage by hero** shows each hero’s attack rate, speed cap and effective Ultra chance. |

With Snow Fort active, **the XP tile belongs on the hero making the kill** to earn its +20% bonus. Veteran’s Exp Share passes that boosted kill reward to eligible heroes. A Skill Power tile on Archer, Ballista or Veteran strengthens its active ability. Its mastery uses account Mastery Power. For example, while leveling Ballista, you can compare a Skill Power Ballista receiving Viking’s XP-tile kills against an XP-tile Ballista doing the killing.

For either Tag team, enter the hero’s Skill Power with no team deployed if you know it. The default is zero. Both lineups use that starting value and show the effective Skill Power of their strongest copy of the named hero.

Check the account and skill assumptions beside each result. Gold and XP indexes compare rewards on a common scale. A per-boss advantage can disappear if the team clears fewer bosses per hour. Team suggestions search for a strong legal lineup within your roster, levels and locks. Other lineups may score higher.

## Save or share a setup

Team Lab saves your changes in the current browser when local storage is available. Use **Export setup** before moving the HTML file or switching browsers. To reproduce a comparison, send the exported JSON along with the calculator. The other player can choose **Import** to load your teams, account baseline and trial ranks.

Opening an older setup keeps a customized Team B visible and preserves your previous ascension assumptions. To use the new defaults, go to **My ascensions → Start unentered ascensions at zero**. Your recorded ranks and team-specific builds carry over.

## Contribute and learn more

For a correction, include your game version, focus, hero levels, tiles, relevant account settings, and the value you observed. An exported setup makes a discrepancy easier to reproduce. For local build and test instructions, read the [contributor guide](CONTRIBUTING.md).

The roster and initial synergy records were adapted from the community spreadsheet credited to Mana, Osto and devilkk. Player observations and game builds informed later corrections. [Community spreadsheet](https://docs.google.com/spreadsheets/d/1fhCvf0yoFYqoTic86KpcjGmAFDYv-RHGCAas8sG1B6U/edit?gid=63100333#gid=63100333) · [Calculation details and historical notes](docs/calculator-reference.md)

The hero portraits come from player-provided Idle Hero TD screenshots. Original game artwork by Swell Games LLC.
