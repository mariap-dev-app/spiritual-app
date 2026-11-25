# Mousse (working name): prototype

Prototype, version 4: the user flow of 20 November 2026, the final content of 22 November 2026 (Notion "Finalise content (texts and audio)") and the berry graphic chart of 25 November 2026 (artifact "Mousse app flow").
Screen numbers (S0–S17, E1–E3) match the FigJam board and the text version on the Notion "User Flow" page.

## Files

- `App.js`: screens and logic.
- `src/content.js`: all texts, emotion groups, emotions, approved techniques, `APP_NAME` and `CONFIG` (PostHog key, feedback form link, test tools). Edit content here, not in `App.js`.
- `package.json`, `app.json`: project settings. If versions are out of date, run `npx expo install --fix`.

Data stays on the phone (AsyncStorage). No server, no account. Each check-in has an ID and timestamps, for a later sync.

## Test on the iPhone (Expo Go, SDK 58)

The App Store version of Expo Go supports only SDK 58. Expo Snack stops at SDK 56, so the app now runs from the computer with Expo CLI.

First time:
1. Install Node.js 22.13 or newer (the LTS version from nodejs.org).
2. Download this repository (GitHub: Code → Download ZIP, then unzip) or clone it.
3. In a terminal, go to the project folder and run:
   ```
   npm install
   npx expo install --fix
   npx expo start
   ```
   `npx expo install --fix` sets every package to the exact version that matches SDK 58.
4. Scan the QR code in the terminal with the iPhone camera; it opens in Expo Go. The phone and the computer must be on the same Wi-Fi. If they cannot be, use `npx expo start --tunnel`.

Next times: `npx expo start` in the project folder. Saving a file reloads the app on the phone.

## Behaviour built in

### Reminders
- Random reminders: every 3 hours by default (or every 2 or 1 hour). Each day's active hours (end of quiet hours → start of quiet hours) are cut into periods of that length, with one reminder at a random time in each period, at least 10 minutes from now.
- Quiet hours: 22:00 to 08:00 by default; adjustable in Settings (start 18:00–23:00, end 05:00–11:00).
- The app plans up to 50 random reminders, at most 7 days ahead (about 4 days at "every hour"), and plans them again each time it opens and each time a reminder setting changes. iOS allows at most 64 scheduled notifications per app.
- One-off reminder (S9a): set with one scrolling picker row (day, hour, minute in 5-minute steps, 24-hour time; next 60 days), optional, on top of the random ones; one at a time (a new one replaces the previous).
- On launch, the app cancels every scheduled notification except random reminders, the one-off reminder and a timer-end alert (this removes the daily reminders from prototype v1).
- Tapping any reminder opens the check-in (S2).

### Check-in and practice
- S2 and S3 share one screen: "Take a deep breath in. / How are you feeling?", then the 4 state bubbles appear after one breath in (4 seconds).
- S4 and S16 show the 9 emotions of the chosen group (3 x 3 grid), plus Skip.
- The intention follows from the state (negative → improve it, positive → make the most of it); no separate question.
- S8a: two techniques picked at random from the approved table for the group and duration.
- S8a and S8 show the practice name without its source.
- S8: timer adjustable from 1 to 30 minutes; default 5 ("Under 5 min") or 15 ("Around 15 min"). While it runs (S8b), the screen shows only a large timer and Stop. Locking the phone does not stop it; the end arrives as a notification. Stop returns to Home.
- Timer end with the app open: a soft vibration (if "Vibration" is on). No sound in the app yet; the end notification uses the "Sound" setting.
- After-check (S15) can be skipped: the practice stays saved as done, without the after state.

### Home and Menu
- Home (S1): "Menu" link on the left, the breathing bubble at the same height as the check-in bubble, and "Tap the bubble to check in" as the only text.
- Menu (S19): Mood tracker, Journaling, Vision board, Settings. Journaling and Vision board are shown as "Coming after the beta" and cannot be opened.

### Mood tracker (S13)
- Opened from the Menu. Month calendar; each day takes the pastel colour of its last check-in. Days with 3 or more check-ins get a ✓ (consistent day).

### Onboarding
- S0 welcome and method steps → S0a notification permission → S0b reminder frequency → first check-in.

### Beta feedback and analytics
- "Send feedback" (Settings) opens `CONFIG.feedbackUrl`. Empty = the app shows "The feedback form is not set up yet."
- Anonymous usage events are sent to PostHog only when `CONFIG.posthogKey` is set: app_opened, onboarding_done, reminder_opened (random / oneoff), checkin_started (source), quick_practice_shown, practice_chosen, practice_done, practice_stopped, after_check_done, after_check_skipped, oneoff_reminder_set, feedback_opened. The ID is random and not linked to the person. No state, emotion or technique is sent.

## Content (Notion, 22 Nov 2026)

- Welcome, permission, frequency, check-in, question, quick practice, time, thanks and notification texts as in the Notion content table. App name in `APP_NAME` ("Mousse", still to confirm).
- 12 techniques with one author and their final steps (shown on S6 and S8). Steps for Midal, Singer and the "slow down" practice are marked "to check" in Notion.
- S6 quick practice: one "under 1 min" practice of the group, at random, never the same as the last one shown, after the line "That's ok! You can practice later. Here is what you can do meanwhile."
- Test tools ("Test: remind me in 10 seconds" and "Reset the app") are hidden in the beta build. Set `CONFIG.showTestTools` to `true` in `src/content.js` to show them while testing.

## Placeholders

The four S5 explanations (left for later, 22 Nov 2026).

## Design (graphic chart of 25 Nov 2026)

- Background: vertical gradient #3A2B52 → #42323C → #3A2A20, with four soft berry blobs that float up and down (18 s). Still when "Reduce motion" is on.
- Text #FBEFF2; accent #EFA7BA (links, secondary text); lines #7A4357.
- Main bubble: 220 px, gradient #B86A88 → #963F62 → #72294A, soft shadow, no ring. It grows by 10 % on the breath in (4 s) and returns on the breath out (6 s).
- Mood bubbles: 130 px (states, 2 x 2) and 96 px (emotions, 3 x 3), gradient per group: strong positive #74465A → #55324A, low positive #76495C → #56364A, low negative #684458 → #4C2F41, strong negative #864A66 → #5E3450.
- Buttons: 56 px pills. Primary: gradient #B0587A → #8F3A5E, text #FFF5F6. Secondary: 1 px outline #7A4357.
- Type: titles in a serif, Regular 24/32 (Newsreader in the chart; the app uses Georgia, built into iOS). The second phrase of a title, body and labels: system sans serif 16/24 (Inter in the chart). Card and section titles Semi Bold 16; small text 14 in the accent colour.
- Cards rgba(239,167,186,0.12), radius 16. Menu as rows with a divider line. Reminder picker with a pink band on the selected row.
- Timer running: 96 px numbers and Stop.
- Titles are centred; where a title has two phrases, the second starts on a new line (`\n` in `src/content.js`).
- Screens 08 to 12 and 15: the text block sits in the middle of the screen, slightly above the exact centre.
- Dates and times: 24-hour clock, "Fri 20 Nov, 08:30".
