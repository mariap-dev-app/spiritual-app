// All texts and content of the app live in this file, so they can change
// (or be translated later) without touching the screens in App.js.
// Source: Notion "Finalise content (texts and audio)", content table and decisions of 22 Nov 2026.
// Lines marked [Placeholder] are temporary and need Maria's content.
// Titles: where a title has two phrases, \n starts the second phrase on a new line
// (the second phrase is shown smaller, as in the graphic chart).

// Settings for outside services. Leave a value empty to switch the service off.
export const CONFIG = {
  // PostHog project API key (starts with "phc_"). Empty = no analytics sent.
  posthogKey: '',
  posthogHost: 'https://eu.i.posthog.com',
  // Link to the beta feedback form (for example a Tally or Google Form). Empty = button shows a message.
  feedbackUrl: '',
  // Test tools: "Test: remind me in 10 seconds" (S9a) and "Reset the app" (S12).
  // false for the beta build (decided 22 Nov 2026); set to true while testing.
  showTestTools: false,
};

// App name: still to confirm. Used in the welcome texts below.
export const APP_NAME = 'Mousse';

export const TEXTS = {
  welcomeTitle: `Welcome to ${APP_NAME}!`,
  welcomeBody: `You cannot always control your circumstances, but you can choose how you respond to them. ${APP_NAME} is a safe place where we guide you to become aware of your emotional state and keep up your daily practice throughout the day.`,
  methodTitle: 'How it works',
  methodSteps: [
    'A few times a day, a reminder invites you to check in and notice how you feel.',
    'You choose the bubble that matches your state.',
    'The app suggests the most relevant practice for the moment.',
    'You register your new emotional state and set a reminder for the future.',
  ],
  welcomeButton: 'Continue',

  permissionTitle: 'Reminders',
  permissionBody:
    'The app reminds you to check in a few times a day. To do this, it needs permission to send notifications. You can change this later in Settings.',
  permissionAllow: 'Allow notifications',
  permissionLater: 'Not now',

  frequencyTitle: 'How often should we remind you?',
  frequencyBody:
    'Each reminder comes at a random time within the period, from 09:00 and never after 22:00 by default. You can change this later in Settings.',
  frequencyOptions: [
    { hours: 3, label: 'Every 3 hours' },
    { hours: 2, label: 'Every 2 hours' },
    { hours: 1, label: 'Every hour' },
    { hours: 0, label: 'No reminders' },
  ],
  frequencyContinue: 'Continue',

  homeTap: 'Tap the bubble to check in',
  menuLink: 'Menu',
  menuTitle: 'Menu',
  menuTracker: 'Mood tracker',
  menuJournaling: 'Journaling',
  menuVisionBoard: 'Vision board',
  menuSettings: 'Settings',
  menuSoon: 'Coming after the beta',

  checkInQuestion: 'Take a deep breath in.\nHow are you feeling?',
  afterQuestion: 'Your practice is over.\nHow are you feeling now?',
  afterSkip: 'Skip',

  specifyQuestion: 'Do you want to specify?',
  specifySkip: 'Skip',

  answerNope: 'Nope, I am good for now',
  answerYes: 'Yes!',

  // S6: one intro line for all four groups, then the steps of one "under 1 min" practice
  quickIntro: "That's ok! You can practice later.\nHere is what you can do meanwhile.",
  quickContinue: 'Continue',

  reminderAsk: 'Do you want to set up a reminder for the next session?',
  thanksBody: "Thanks for recording!\nIt's consistency that matters!",
  anotherSessionAsk: 'Do you want to schedule another session?',
  yes: 'Yes!',
  no: 'No',

  timeQuestion: 'How much time do you have?',
  timeUnder5: 'Under 5 min',
  time15: 'Around 15 min',

  optionsTitle: 'Choose a practice',

  timerLabel: 'Timer',
  timerStart: 'Start',
  timerStop: 'Stop',

  reminderTitle: 'Set up a reminder',
  reminderSave: 'Save reminder',
  reminderTest: 'Test: remind me in 10 seconds',
  reminderCancel: 'Cancel',
  reminderPast: 'Choose a date and time in the future.',
  reminderNotificationTitle: 'Time to check in',
  reminderNotificationBody: 'Take a deep breath in! How are you feeling?',
  timerNotificationTitle: 'Your practice is over',
  timerNotificationBody: 'Tap to tell how you are feeling now.',
  notificationsBlocked:
    'Notifications are turned off for this app. You can turn them on in the iPhone Settings app, under Notifications.',

  // Settings (S12)
  settingsNotifications: 'Notifications',
  settingsOpenPhoneSettings: 'Open iPhone Settings',
  settingsFrequency: 'Reminder frequency',
  settingsFrequencyNote: 'At a random time within each period.',
  settingsStartingAt: 'Starting at',
  settingsOneOff: 'One-off reminder',
  settingsOneOffNone: 'None set.',
  settingsOneOffSet: 'Set a one-off reminder',
  settingsOneOffChange: 'Change one-off reminder',
  settingsOneOffRemove: 'Remove one-off reminder',
  settingsQuiet: 'Quiet hours',
  settingsStopAt: 'Reminders stop at',
  settingsSound: 'Sound',
  settingsVibration: 'Vibration at the end of the timer',
  settingsBeta: 'Beta',

  feedbackButton: 'Send feedback',
  feedbackNotSet: 'The feedback form is not set up yet.',

  trackerTitle: 'Mood tracker',
  consistentDay: 'Consistent day (3 or more check-ins)',
  inconsistentDay: '1 or 2 check-ins',
  noCheckin: 'No check-in on this day.',
};

// A consistent day = at least this many check-ins (decided 15 November 2026).
export const CONSISTENT_DAY_CHECKINS = 3;

// The four emotion groups, with 9 emotions each (one 3 x 3 grid).
// colors: bubble gradient (top-left to bottom-right) from the graphic chart of 25 Nov 2026.
// Questions and explanations: final (Notion, table 2, 26 Nov 2026).
export const GROUPS = [
  {
    id: 'strongPositive',
    label: 'Strong positive',
    colors: ['#74465A', '#55324A'],
    emotions: [
      'Joyful', 'Excited', 'Enthusiastic', 'Inspired', 'Passionate',
      'Proud', 'Confident', 'Energised', 'Eager',
    ],
    explanation:
      'Strong positive emotions carry a lot of energy. This is a good moment to let the feeling settle in your body and make it last.',
    question: "That's great!\nDo you want to build on it?",
  },
  {
    id: 'lowPositive',
    label: 'Low positive',
    colors: ['#76495C', '#56364A'],
    emotions: [
      'Calm', 'Peaceful', 'Content', 'Relaxed', 'Grateful',
      'Serene', 'At ease', 'Secure', 'Fulfilled',
    ],
    explanation:
      'You feel calm and steady. A short practice now helps you find this state again later.',
    question: "That's a good start!\nWant to make it even better?",
  },
  {
    id: 'lowNegative',
    label: 'Low negative',
    colors: ['#684458', '#4C2F41'],
    emotions: [
      'Sad', 'Tired', 'Bored', 'Lonely', 'Disappointed',
      'Discouraged', 'Empty', 'Numb', 'Drained',
    ],
    explanation:
      "Low emotions are part of life. You don't need to change them right away: acknowledging them is the first step.",
    question: "That's ok.\nWould you like to find a little more lightness?",
  },
  {
    id: 'strongNegative',
    label: 'Strong negative',
    colors: ['#864A66', '#5E3450'],
    emotions: [
      'Angry', 'Anxious', 'Stressed', 'Frustrated', 'Overwhelmed',
      'Afraid', 'Irritated', 'Restless', 'Jealous',
    ],
    explanation:
      'Strong emotions show up first. Accepting and softly feeling them in your body will bring you more ease.',
    question: 'That sounds hard.\nWould you like to work through it?',
  },
];

// Approved techniques: names, single author and steps from table 3 of the Notion content page
// (final, 22 Nov 2026). Steps marked "to check" in Notion: doNothing (Midal), relax (Singer),
// slowDown (source for Nestor not found; author kept as Thich Nhat Hanh).
// under1 = under 1 min (quick practice, S6)
// under5 = 2 to 5 min ("Under 5 min" on S7)
// under15 = 6 to 15 min ("Around 15 min" on S7)
const T = {
  anchor: {
    name: 'Notice where your happiness lives in the body',
    by: 'Rick Hanson',
    steps: [
      'Focus on a good moment happening now.',
      'Stay with the feeling and notice where it sits in your body.',
      'Let the feeling sink in, and intend that it becomes part of you.',
    ],
  },
  list5: {
    name: 'Notice 5 things you are grateful for right now',
    by: 'Martin Seligman',
    steps: [
      'Name one thing you are grateful for right now.',
      'Name why you are grateful for it.',
      'Repeat until you have five things.',
    ],
  },
  gratitudeList: {
    name: 'Write a gratitude list',
    by: 'Martin Seligman',
    steps: [
      'Write down three good things that you enjoyed today or yesterday.',
      'Next to each one, write how it made you feel.',
      'Read your list once you are finished.',
    ],
  },
  lovingKindness: {
    name: 'Send loving kindness to yourself and others',
    by: 'Sharon Salzberg',
    steps: [
      'Silently repeat for yourself: "May I be safe, be happy, be healthy, and live with ease."',
      'Call to mind someone who has helped you or someone you care about, and offer them the same phrases.',
      'Offer the same phrases to a neutral person.',
    ],
  },
  accept: {
    name: 'Accept your negative emotions as a part of life',
    by: 'Kristin Neff',
    steps: [
      'Acknowledge the difficulty: "This is a moment of suffering."',
      'Remind yourself it is part of life: "Struggle is a part of life."',
      'Place a hand over your heart and offer yourself kindness.',
    ],
  },
  doNothing: {
    name: 'Allow yourself to do nothing',
    by: 'Fabrice Midal',
    steps: [
      'Notice what has just happened.',
      'Give yourself a few moments to rest, without needing to do anything.',
      'Stay with this for one minute, without needing to feel differently.',
    ],
  },
  observe: {
    name: 'Observe the difficult feelings in your body',
    by: 'Pema Chödrön',
    steps: [
      'Pause, and find where the emotion sits in your body.',
      'Breathe in and out while you feel it, without trying to change it.',
      'Let the feeling run its course, without adding the story about it in your mind.',
    ],
  },
  reframe: {
    name: 'Reframe your negative thoughts',
    by: 'Byron Katie',
    steps: [
      'Write the stressful thought as a short statement.',
      "Ask the four questions: Is it true? Can you absolutely know that it's true? How do you react when you believe that thought? How would you feel if it weren't true?",
      'Turn the thought around to its opposite, and find a real example of how the opposite is also true.',
    ],
  },
  bodyScan: {
    name: 'Do your body scan',
    by: 'Jon Kabat-Zinn',
    steps: [
      'Sit or lie down, close your eyes if comfortable, and bring attention to your body.',
      'Move attention slowly through the body, one area at a time, from the feet upwards.',
      'Notice your whole body, then slowly open your eyes.',
    ],
  },
  cyclicSighing: {
    name: 'Practise cyclic sighing',
    by: 'Andrew Huberman',
    steps: [
      'Inhale through your nose.',
      'Take a second, deeper breath in, to fully fill your lungs.',
      'Slowly exhale all the air through your mouth. Repeat for about 5 minutes.',
    ],
  },
  relax: {
    name: 'Relax your shoulders and chest area',
    by: 'Michael Singer',
    steps: [
      'Drop your shoulders.',
      'Open your chest, and let your breath move through it.',
      'Let the tension pass through you and out.',
    ],
  },
  slowDown: {
    name: 'Slow down your breath and movements',
    by: 'Thich Nhat Hanh',
    steps: [
      'Stand or sit, and take a moment to breathe.',
      'Deliberately slow down your movements and bring awareness to what you do.',
    ],
  },
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
