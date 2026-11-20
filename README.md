# Spiritual app: prototype

Prototype, version 3: the user flow of 20 November 2026 (Review 4).
Screen numbers (S0–S17, E1–E3) match the FigJam board and the text version on the Notion "User Flow" page.

## Files

- `App.js`: screens and logic.
- `src/content.js`: all texts, emotion groups, emotions, approved techniques, and `CONFIG` (PostHog key, feedback form link). Edit content here, not in `App.js`.
- `package.json`, `app.json`: project settings. If versions are out of date, run `npx expo install --fix`.

Data stays on the phone (AsyncStorage). No server, no account. Each check-in has an ID and timestamps, for a later sync.

## Test in Expo Go with Expo Snack

1. Open snack.expo.dev and sign in.
2. Replace `App.js` and `src/content.js` with the ones from this repository.
3. Accept the missing dependencies Snack suggests (`expo-notifications`, `@react-native-async-storage/async-storage`).
4. Choose My Device and open it in Expo Go on the iPhone.

## Test locally (later)

```
npm install
npx expo install --fix
npx expo start
```

## Behaviour built in

### Reminders
- Random reminders: every 3 hours by default (or every 2 or 1 hour). Each day's active hours (end of quiet hours → start of quiet hours) are cut into periods of that length, with one reminder at a random time in each period, at least 10 minutes from now.
- Quiet hours: 22:00 to 08:00 by default; adjustable in Settings (start 18:00–23:00, end 05:00–11:00).
- The app plans up to 50 random reminders, at most 7 days ahead (about 4 days at "every hour"), and plans them again each time it opens and each time a reminder setting changes. iOS allows at most 64 scheduled notifications per app.
- One-off reminder (S9a): optional, on top of the random ones; one at a time (a new one replaces the previous).
- On launch, the app cancels every scheduled notification except random reminders, the one-off reminder and a timer-end alert (this removes the daily reminders from prototype v1).
- Tapping any reminder opens the check-in (S2).

### Check-in and practice
- S2 and S3 share one screen: "Take a breath in. / How are you feeling?", then the 4 state bubbles appear after one breath in (4 seconds).
- S4 and S16 show the 10 emotions of the chosen group, plus Skip.
- The intention follows from the state (negative → improve it, positive → make the most of it); no separate question.
- S8a: two techniques picked at random from the approved table for the group and duration.
- S8: timer adjustable from 1 to 30 minutes; default 5 ("Under 5 min") or 15 ("I have 15 min"). One screen: the description stays visible. Locking the phone does not stop it; the end arrives as a notification. Stop returns to Home.
- Timer end with the app open: a soft vibration (if "Vibration" is on). No sound in the app yet; the end notification uses the "Sound" setting.
- After-check (S15) can be skipped: the practice stays saved as done, without the after state.

### Home and Menu
- Home (S1): "Menu" link at the top right, the breathing bubble at the same height as on Welcome, "Tap the bubble to check in" under it, then the next reminder and the last check-in (date · emotion, or the state if no emotion was picked).
- Menu (S19): Mood tracker, Journaling, Vision board, Settings. Journaling and Vision board are shown as "Coming after the beta" and cannot be opened.

### Mood tracker (S13)
- Opened from the Menu. Month calendar; each day takes the pastel colour of its last check-in. Days with 3 or more check-ins get a ✓ (consistent day).

### Onboarding
- S0 welcome and method steps → S0a notification permission → S0b reminder frequency → first check-in.

### Beta feedback and analytics
- "Send feedback" (Settings) opens `CONFIG.feedbackUrl`. Empty = the app shows "The feedback form is not set up yet."
- Anonymous usage events are sent to PostHog only when `CONFIG.posthogKey` is set: app_opened, onboarding_done, reminder_opened (random / oneoff), checkin_started (source), quick_practice_shown, practice_chosen, practice_done, practice_stopped, after_check_done, after_check_skipped, oneoff_reminder_set, feedback_opened. The ID is random and not linked to the person. No state, emotion or technique is sent.

## Placeholders

Welcome and method texts, S5 explanations, technique steps.

Design: the "Palette Screens Preview" plus the design decisions of 20 November 2026, as in the Figma file "Spiritual App Design":
- Accent #3D5A78 for links and active states; no large accent fills. Main buttons sky blue #C9EBFF.
- Mood bubbles in the pastel of their group (strong positive #E8F6EC, low positive #FFFBEB, low negative #F0F7FC, strong negative #FBEEEB), labels #1B2A3D, no ring. The ring stays only around the breathing bubble.
- Background: thin outlined circles (#D6E4EF) of different sizes rise from the bottom to the top on every screen, 10 to 18 seconds per rise; they stay still when "Reduce motion" is on.
- Titles are centred; where a title has two phrases, the second starts on a new line (`\n` in `src/content.js`).
- Screens 08 to 12 and 15 (reminder question, time, choose practice, timer, thanks): the text block sits in the middle of the screen, slightly above the exact centre.
- Explanation screen (06): the question title sits above the explanation text.
- Dates and times: 24-hour clock, "Fri 20 Nov, 08:30" (Home, set-up reminder screen, Settings).
- Headings in bold system sans serif (#1B2A3D), as in Figma. "‹ Home" on the left edge.
- Dark theme: not decided yet.
