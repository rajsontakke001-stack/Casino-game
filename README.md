# Lucky Orbit - Wheel of Fortune

A React wheel-of-fortune betting game. Pick a number from 0 to 9, set your wager, and spin.

## Requirements

- Node.js 18 or newer

## Run locally

```bash
npm install
npm run dev
```

Open the address shown in the terminal (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## Project structure

```
lucky-orbit/
├── index.html        # page shell, loads the Fredoka font
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx      # React entry point
    ├── App.jsx       # game logic and UI
    └── App.css       # styles
```

## Changing the game settings

The settings are constants at the top of `src/App.jsx`:

| Constant       | Default | Meaning                                              |
|----------------|---------|------------------------------------------------------|
| `START_CREDITS`| 250     | Credits a player starts with                         |
| `MIN_BET`      | 10      | Smallest allowed wager                               |
| `BET_STEP`     | 10      | Amount the wager changes by per click                |
| `PAYOUT`       | 9       | Profit multiplier on a correct pick (stake returned too) |
| `SPIN_MS`      | 4300    | Spin duration in ms (keep in sync with the CSS timing) |

## Notes

- Credits are virtual. The result is generated in the browser with `Math.random()`.
  If you ever use this with real money, the result must be generated and verified on a server.
- Controls: click a number, use the + and - buttons for the wager, then press START SPIN or the Space bar.

## Lucky 3rd bet

Every 3rd bet is a guaranteed win: the wheel lands on the number you picked. Other bets are random. A win plays a firecracker sound and shows a popup with sparks. The next lucky bet is shown under the START SPIN button. The counter resets on PLAY AGAIN.

## Win show

A win opens a full-screen fireworks show: rockets launch with a whistle, burst with booms and crackles, and keep going until you click. A click closes the show and the next bet starts.
