# Cell Tower Defense

A tower-defense game that teaches how the immune system fights viruses. Written for high school / AP Biology.

Students place immune cells beside a blood vessel to stop viruses reaching the vital organs. Innate cells work from the start; stealth viruses can only be beaten by building the adaptive chain (dendritic cell → helper T-cell → B cells and killer T-cells) with each cell in range of the next; HIV attacks the helper T-cells that hold the chain together.

## Run it

Double-click `index.html`. It needs no install, no build and no internet connection.

To share it with a class, upload the whole folder to any static host (GitHub Pages, a school web server, an LMS file area) and give students the link to `index.html`.

- **Class Mode**: 15 scripted waves, about 20 minutes. Briefing cards introduce each new idea.
- **Freeplay**: endless generated waves with every cell unlocked.

Controls: click a cell in the shop, then click the tissue to place it (hold Shift to place several). Click a placed cell to upgrade or sell it. Space starts a wave or pauses; Esc cancels; 1–7 pick a cell. Touch screens work.

## Change the wording or the balance

| To change | Edit |
|---|---|
| Any text students read: descriptions, briefing cards, encyclopedia, report card | `js/data/text.js` |
| Cell prices, stats, upgrades, starting ATP, clinic prices, unlock waves | `js/data/towers.js` |
| Virus health, speed, detection chance, rewards | `js/data/enemies.js` |
| What arrives in each wave | `js/data/waves.js` |
| The shape of the blood vessel | `js/sim/path.js` (`CTD.MAP.points`) |

After changing numbers, run the balance check (needs Node.js):

```
node tools/sim.js        # add -v for a wave-by-wave log
```

It plays whole games with scripted builds and confirms the teaching rules still hold: innate cells alone lose to stealth viruses, a correctly placed adaptive chain wins, a chain placed out of range never activates, infected cells burst unless killed by NK or killer T-cells, HIV destroys exposed helper T-cells, and a vaccine gives a head start.

## Biology notes

The game simplifies on purpose. Every encyclopedia entry ends with a "Game vs. real life" box that says what was simplified, so the encyclopedia doubles as a discussion prompt.

## Credits

All artwork is drawn in code. Text is set in Comic Sans where installed; elsewhere the bundled [Comic Neue](https://github.com/crozynski/comicneue) is used (SIL Open Font License, see `assets/fonts/COMIC-NEUE-LICENSE.txt`).
