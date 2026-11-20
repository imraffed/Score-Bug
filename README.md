# Score Bug

Live scores on the iPhone Lock Screen and Dynamic Island, drawn as TV score graphics
from different eras. This repo is the working prototype.

```
server/   Node service: polls scores, normalizes them, pushes Live Activity updates
ios/      SwiftUI app + widget extension (Live Activity, Dynamic Island, widgets)
```

## How it fits together

1. `server` polls ESPN's public scoreboard endpoints for 13 leagues (MLB, NBA, WNBA,
   NCAA men's and women's basketball, NFL, college football, NHL, PWHL, Premier League,
   MLS, NWSL, Champions League).
2. Each game is converted to one shape shared by every sport. Its `state` object is
   exactly the Live Activity `ContentState` the phone decodes.
3. When something a viewer would notice changes, the server sends an Apple push to every
   phone showing that game. Each phone's push is held by its TV Sync delay.
4. The phone draws the state using the bug design stored on the device. Designs are
   recipes (material, type, colors, filter), so any design works with any sport.

## Run the server

Needs Node 20 or newer. No dependencies to install.

```sh
cd server
npm start          # http://localhost:8787
npm test
```

Open http://localhost:8787 for a live view of the normalized feed.

With no Apple key configured the server runs in dry-run mode and logs the pushes it
would send. To send real pushes, create an APNs key in your Apple Developer account and set:

| Variable | Meaning |
|---|---|
| `APNS_KEY_PATH` | Path to the `.p8` key file (never commit it) |
| `APNS_KEY_ID`, `APNS_TEAM_ID` | From the Apple Developer portal |
| `APNS_BUNDLE_ID` | The app's bundle ID |
| `API_KEY` | Optional. If set, the app must send it as a bearer token |
| `PORT`, `POLL_LIVE_MS`, `CLOCK_PUSH_MIN_SECONDS`, `START_LEAD_SECONDS`, `LINGER_SECONDS` | Tuning |
| `CLOCK_MODE` | `step` (default) or `infer`, see below |

## Run the app

Needs a Mac with Xcode 15.2 or newer.

```sh
brew install xcodegen
cd ios && xcodegen && open ScoreBug.xcodeproj
```

Run the `ScoreBug` scheme in an iPhone Pro simulator with the server running on the same
Mac. Pick a league, open a game, tap **Put on Lock Screen**, then lock the simulator
(Cmd+L). While the app is open it updates the Live Activity itself, so this works with no
Apple push key.

For a real device, enter the server's address in the app's Settings tab. Updates with the app closed, and bugs
that appear by themselves before a favorite team's game, need the paid Apple Developer
Program and the APNs variables above.

## What has and has not been verified

- Server: 18 automated tests pass, and it has been run against live ESPN data (college
  basketball) with pushes logged in dry-run mode.
- Real APNs delivery has not been exercised. It needs an Apple key.
- The iOS code was written without access to Xcode and has **not been compiled**. Expect
  to fix some build errors on first open.
- Football and baseball situation fields (down and distance, count, runners) are covered
  by synthetic tests only; no such game was live during development.

## Known limits of the free feed

- **Clock.** ESPN's clock only moves when a play is logged, so the default `step` mode
  sends the clock value as it changes (at most every 10 s) and the phone shows it in
  steps. `infer` mode makes the phone count down by itself and suits feeds that update
  the clock continuously or report whether it is running.
- **Situations.** No power-play or bonus data in this feed.
- **Terms.** These endpoints are unofficial and not licensed for commercial use. Replace
  `server/src/espn.js` and `server/src/normalize.js` with a licensed provider before a
  public launch. Nothing else needs to change.

## Before beta

- One broadcast push channel per game (iOS 18) instead of one push per phone.
- App Attest on device registration, and Postgres instead of the JSON device file.
- Bundled era typefaces (the prototype uses system font variants).
