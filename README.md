# Spiritual app: prototype

Feasibility prototype (step 7.2b), version 2: the user flow of 26 October 2026.
Screen numbers (S0–S17, E1–E3) match the FigJam board and the text version on the Notion "User Flow" page.

## Files

- `App.js`: screens and logic.
- `src/content.js`: all texts, emotion groups, emotions and approved techniques. Edit content here, not in `App.js`.
- `package.json`, `app.json`: project settings. If versions are out of date, run `npx expo install --fix`.

Data stays on the phone (AsyncStorage). No server, no account.

## Test in Expo Go with Expo Snack

1. Open snack.expo.dev and sign in.
2. Replace `App.js` with the one from this repository.
3. Add a file `src/content.js` and paste the content.
4. Accept the missing dependencies Snack suggests (`expo-notifications`, `@react-native-async-storage/async-storage`, `@react-native-community/datetimepicker`).
5. Choose My Device and open it in Expo Go on the iPhone.

## Test locally (later)

```
npm install
npx expo install --fix
npx expo start
```

Scan the QR code with the iPhone camera to open it in Expo Go.

## Decisions built in (28 October 2026)

- S9a: one-off reminder on a chosen date and time, picked in a calendar; one active reminder at a time (a new one replaces the previous).
- On launch, the app cancels scheduled notifications it did not create (for example the daily reminders from prototype v1).
- S8a: two techniques picked at random from the approved table for the group and duration.
- S8: timer adjustable from 1 to 30 minutes; default 5 ("Under 5 min") or 15 ("I have 15 min").
- Timer: one screen (description stays visible). Locking the phone does not stop it; the end arrives as a notification. Stop, or closing the app completely, returns to Home.
- S2 and S3 share one screen: the 4 state bubbles appear after one breath in (4 seconds).
- S4 and S16 show the 10 emotions of the chosen group, plus Skip.

## Placeholders

Welcome text, S5 explanations, technique steps, colours and the bubble design.
