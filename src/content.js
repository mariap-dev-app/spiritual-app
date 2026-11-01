// All texts and content of the app live in this file, so they can change
// (or be translated later) without touching the screens in App.js.
// Lines marked [Placeholder] are temporary and need Maria's content.

export const TEXTS = {
  welcomeTitle: 'Welcome',
  welcomeBody:
    '[Placeholder] This app helps you check in with how you feel, a few times a day, and suggests a short practice for the moment.',
  welcomeButton: 'Continue',

  permissionTitle: 'Reminders',
  permissionBody:
    'The app can remind you to check in at a time you choose. To do this, it needs permission to send notifications. You can change this later in Settings.',
  permissionAllow: 'Allow notifications',
  permissionLater: 'Not now',

  homeTap: 'Tap the bubble to check in',

  checkInQuestion: 'Breathe in. How are you feeling?',
  afterQuestion: 'Breathe in. How are you feeling now?',

  specifyQuestion: 'Do you want to specify?',
  specifySkip: 'Skip',

  answerNope: 'Nope, I am good for now',
  answerYes: 'Yes!',

  quickTitle: 'A short practice for now',

  reminderAsk: 'Do you want to set up a reminder for the next session?',
  anotherSessionAsk:
    "Thanks for recording! It's consistency that matters! Do you want to schedule another session?",
  yes: 'Yes!',
  no: 'No',

  timeQuestion: 'How much time do you have?',
  timeUnder5: 'Under 5 min',
  time15: 'I have 15 min',

  optionsTitle: 'Choose a practice',

  timerStart: 'Start',
  timerStop: 'Stop',

  reminderTitle: 'Set up a reminder',
  reminderSave: 'Save reminder',
  reminderTest: 'Test: remind me in 10 seconds',
  reminderCancel: 'Cancel',
  reminderPast: 'Choose a date and time in the future.',
  reminderNotificationTitle: 'Time to check in',
  reminderNotificationBody: 'Breathe in. How are you feeling?',
  timerNotificationTitle: 'Your practice is over',
  timerNotificationBody: 'Tap to tell how you are feeling now.',
  notificationsBlocked:
    'Notifications are turned off for this app. You can turn them on in the iPhone Settings app, under Notifications.',
};

// The four emotion groups, with their 10 emotions (from the
// "Emotion x Spiritual/ Mindful Practice Map" in Notion).
// Colours are placeholders until the brand work (phase 5).
export const GROUPS = [
  {
    id: 'strongPositive',
    label: 'Strong positive',
    color: '#F2B544',
    emotions: [
      'Joyful', 'Excited', 'Enthusiastic', 'Inspired', 'Passionate',
      'Proud', 'Confident', 'Energised', 'Eager', 'Elated',
    ],
    explanation:
      '[Placeholder] Strong positive emotions carry a lot of energy. This is a good moment to let the feeling settle in your body and make it last.',
    question: "That's great! Do you want to reinforce it?",
  },
  {
    id: 'lowPositive',
    label: 'Low positive',
    color: '#8CC59A',
    emotions: [
      'Calm', 'Peaceful', 'Content', 'Relaxed', 'Grateful',
      'Serene', 'At ease', 'Secure', 'Fulfilled', 'Loving',
    ],
    explanation:
      '[Placeholder] You feel calm and steady. A short practice now helps you find this state again later.',
    question: "That's a good start! Want to make it even better?",
  },
  {
    id: 'lowNegative',
    label: 'Low negative',
    color: '#7FA7D9',
    emotions: [
      'Sad', 'Tired', 'Bored', 'Lonely', 'Disappointed',
      'Discouraged', 'Empty', 'Numb', 'Drained', 'Powerless',
    ],
    explanation:
      "[Placeholder] Low emotions are part of life. You don't need to change them right away: noticing them is already a step.",
    question: "That's ok! Do you want to improve it?",
  },
  {
    id: 'strongNegative',
    label: 'Strong negative',
    color: '#D9776B',
    emotions: [
      'Angry', 'Anxious', 'Stressed', 'Frustrated', 'Overwhelmed',
      'Afraid', 'Irritated', 'Restless', 'Jealous', 'Panicked',
    ],
    explanation:
      '[Placeholder] Strong emotions show up in the body first. Calming the breath can help before anything else.',
    question: 'That sounds hard. Would you like to work through it?',
  },
];

// Approved techniques by emotion group and duration
// (Notion, "Build the practice library", approved 26 October 2026).
// under1 = under 1 min (quick practice, S6)
// under5 = 2 to 5 min ("Under 5 min" on S7)
// under15 = 6 to 15 min ("I have 15 min" on S7)
const T = {
  anchor: { name: 'Anchor happiness in the body', by: 'Rick Hanson; Eugene Gendlin' },
  list5: { name: 'List 5 things you are grateful for right now', by: 'Martin Seligman' },
  gratitudeList: { name: 'Write a gratitude list', by: 'Martin Seligman; Laura King; Joe Dispenza' },
  lovingKindness: { name: 'Send loving kindness to yourself and others', by: 'Sharon Salzberg' },
  accept: { name: 'Accept negative emotions as a part of life', by: 'Kristin Neff' },
  doNothing: { name: 'Allow yourself to do nothing', by: 'Fabrice Midal' },
  observe: { name: 'Observe the difficult feelings in your body', by: 'Pema Chödrön' },
  reframe: { name: 'Reframe your negative thoughts', by: 'Byron Katie' },
  bodyScan: { name: 'Do your body scan', by: 'Jon Kabat-Zinn' },
  cyclicSighing: { name: 'Practice cyclic sighing', by: 'Andrew Huberman' },
  relax: { name: 'Relax your shoulders and chest area', by: 'Michael Singer' },
  slowDown: { name: 'Slow down your breath and movements', by: 'James Nestor; Thich Nhat Hanh' },
};

export const TECHNIQUES = {
  strongPositive: {
    under1: [T.anchor, T.list5],
    under5: [T.anchor, T.gratitudeList, T.lovingKindness],
    under15: [T.gratitudeList, T.lovingKindness],
  },
  lowPositive: {
    under1: [T.anchor, T.list5],
    under5: [T.anchor, T.gratitudeList, T.lovingKindness],
    under15: [T.gratitudeList, T.lovingKindness],
  },
  lowNegative: {
    under1: [T.accept, T.doNothing, T.list5],
    under5: [T.observe, T.reframe, T.accept, T.lovingKindness],
    under15: [T.observe, T.reframe, T.bodyScan, T.lovingKindness],
  },
  strongNegative: {
    under1: [T.cyclicSighing, T.relax, T.slowDown],
    under5: [T.cyclicSighing, T.slowDown, T.observe],
    under15: [T.observe, T.bodyScan],
  },
};

// Default timer length (minutes) for each choice on S7.
// The user can adjust it on S8.
export const DEFAULT_MINUTES = { under5: 5, under15: 15 };

// [Placeholder] Steps for each technique, to be written in phase 5/6.
export const TECHNIQUE_STEPS_PLACEHOLDER =
  '[Placeholder] The steps of this practice will appear here. For this test, follow the practice in your own way until the timer ends.';
