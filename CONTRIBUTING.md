# Contributing to Hero Team Lab

You can help by reporting a mismatch from the game, improving a calculation, or making a comparison easier to use. For the player workflow, see the [how-to guide](README.md).

## Report a game observation

Open a GitHub issue with the focus you were using, what Team Lab predicted, and what you observed in the game. A small comparison where just one thing changes is especially helpful.

For example, to report an XP tile interaction, identify the killer, the hero being leveled, all deployed copies of those heroes, their tiles, and whether Veteran's share was active and in range. Give the XP per kill with and without the tile. If a skill is involved, include its tooltip, mastery stacks, and wave. An exported setup from **Export setup** lets another player reproduce Team A and Team B. Review the team names and account settings before attaching it.

For a milestone or synergy correction, record the exact hero, level or tier, displayed value and unit, and whether the effect is personal or global. Include the tile, event, ascensions, and combat styles in effect when you took the reading. The displayed number can include those bonuses. A cropped screenshot or a transcription plus a second observation can help establish the underlying value.

## Build and test

Fork the repository, clone your fork, and create a branch for your change. The browser app builds with Node.js and its standard library. The following commands work with Node.js 24. Run them from the repository root.

```sh
node build.cjs
node --test "tests/*.test.cjs"
```

Open the generated `hero-team-lab.html` in a desktop browser. During development you can run just the tests for an XP skill or tile change.

```sh
node --test tests/experience-skills.test.cjs tests/experience-tile.test.cjs tests/experience-planner.test.cjs
```

| To change | Start here |
| --- | --- |
| Team scores, tile effects, or suggestions | `engine.js` |
| Immortal boss calculations and search | `immortal.js`, `immortal-search.js`, `immortal-data.js` |
| Controls, local saves, import or export | `app.js` |
| Page structure and styling | `index.template.html`, `styles.css` |
| The hero records the app reads | `data.js` |

For a scoring change, check the detailed Team A/B result and the relevant suggestion or planner result on the same lineup. A small regression test should exercise the interaction that changed. For a save-format change, try importing an older export as well as reloading a newly saved setup.

## Change hero data

`data.js` is generated. The extractor combines the original hero values in `source/hero-records.json` with corrections recorded under `source/milestone-review/` and `source/synergy-review/`. For a correction based on gameplay, update the relevant review records so the next rebuild preserves the evidence and the change.

Use Python 3 to rebuild the data, check the capture calibration and source rebuild, then regenerate the app.

```sh
python -X utf8 source/extract_data.py
python -m unittest discover -s tests -p "test_*.py"
node build.cjs
```

The repository contains the inputs for this workflow. `source/inspect_workbook.py` is for refreshing the normalized input when a new source workbook is available locally.

## Submit a pull request

Push your branch to your fork and open a pull request. Describe the change from a player's perspective and list the checks you ran. For a formula change, show the before and after result for one setup and link the observation or issue behind it. For a UI change, a screenshot of the affected control or result helps reviewers try it themselves.

After editing the runtime sources, hero data or player quick start, run `python package_release.py` from the repository root. It rebuilds the standalone HTML and the downloadable ZIP. Include both updated artifacts in your pull request, then extract the ZIP and repeat the player steps from your example.
