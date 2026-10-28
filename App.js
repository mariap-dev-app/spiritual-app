// Spiritual app: feasibility prototype, version 2 (flow of 26 October 2026).
// Screen numbers (S0, S1...) match the FigJam user flow and its Notion text version.
// Data stays on the phone (AsyncStorage). Content lives in src/content.js.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MINUTES,
  GROUPS,
  TECHNIQUES,
  TECHNIQUE_STEPS_PLACEHOLDER,
  TEXTS,
} from './src/content';

// ---------- Notifications setup ----------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const TRIGGER = Notifications.SchedulableTriggerInputTypes || {};
const DATE_TRIGGER = TRIGGER.DATE || 'date';
const INTERVAL_TRIGGER = TRIGGER.TIME_INTERVAL || 'timeInterval';

async function hasPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function askPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (current.canAskAgain === false) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ---------- Storage ----------

const KEYS = { settings: 'settings_v2', checkins: 'checkins_v2' };
const DEFAULT_SETTINGS = { onboarded: false, notificationsOn: true, reminder: null };

async function loadJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function saveJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Ignore for the prototype.
  }
}

// ---------- Helpers ----------

const groupById = (id) => GROUPS.find((g) => g.id === id);

function pickRandom(list, count) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

const pad = (n) => String(n).padStart(2, '0');
const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function formatReminder(iso) {
  const at = new Date(iso);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 24 * 3600 * 1000));
  const key = dayKey(at);
  const label = key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : at.toDateString();
  return `${label} at ${formatTime(at)}`;
}

function formatCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ---------- Small UI pieces ----------

function Button({ label, onPress, kind = 'primary', disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'link' && styles.buttonLink,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === 'secondary' && styles.buttonTextSecondary,
          kind === 'link' && styles.buttonTextLink,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Bubble({ label, color, size = 120, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <Text style={styles.bubbleText}>{label}</Text>
    </Pressable>
  );
}

// Breathing bubble: slowly expands and retracts (one breath = 8 seconds).
function BreathingBubble({ color = '#C9B8E8', size = 140 }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.8, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.85,
        transform: [{ scale }],
        alignSelf: 'center',
        marginVertical: 24,
      }}
    />
  );
}

function Screen({ children, onBack, scroll = true }) {
  const Body = scroll ? ScrollView : View;
  return (
    <View style={styles.screen}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
      ) : (
        <View style={styles.backSpacer} />
      )}
      <Body contentContainerStyle={scroll ? styles.content : undefined} style={!scroll ? styles.content : undefined}>
        {children}
      </Body>
    </View>
  );
}

// S2/S3 and S15/S15a: breathing question, then the 4 state bubbles appear.
function StateQuestion({ question, onPick }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 800, delay: 4000, useNativeDriver: true }).start();
  }, [fade]);
  return (
    <>
      <Text style={styles.title}>{question}</Text>
      <BreathingBubble />
      <Animated.View style={[styles.bubbleGrid, { opacity: fade }]}>
        {GROUPS.map((g) => (
          <Bubble key={g.id} label={g.label} color={g.color} onPress={() => onPick(g.id)} />
        ))}
      </Animated.View>
    </>
  );
}

// S4 and S16: optional emotion within the chosen group.
function SpecifyEmotion({ groupId, onPick }) {
  const group = groupById(groupId);
  return (
    <>
      <Text style={styles.title}>{TEXTS.specifyQuestion}</Text>
      <View style={styles.bubbleGrid}>
        {group.emotions.map((e) => (
          <Bubble key={e} label={e} color={group.color} size={92} onPress={() => onPick(e)} />
        ))}
      </View>
      <Button label={TEXTS.specifySkip} kind="secondary" onPress={() => onPick(null)} />
    </>
  );
}

function Stepper({ label, value, onMinus, onPlus }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>−</Text>
      </Pressable>
      <View style={{ alignItems: 'center', minWidth: 90 }}>
        <Text style={styles.stepValue}>{value}</Text>
        {label ? <Text style={styles.small}>{label}</Text> : null}
      </View>
      <Pressable onPress={onPlus} style={styles.stepButton}>
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

// S13: Mood tracker, a month calendar coloured by the state of each day's last check-in.
function MoodTracker({ checkins }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(dayKey(new Date()));

  const byDay = {};
  checkins.forEach((c) => {
    const k = dayKey(new Date(c.createdAt));
    (byDay[k] = byDay[k] || []).push(c);
  });

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday first
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const dayEntries = (byDay[selected] || []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <Text style={styles.title}>Mood tracker</Text>
      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <Text style={styles.monthNav}>‹</Text>
        </Pressable>
        <Text style={styles.subtitle}>
          {month.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <Text style={styles.monthNav}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calendar}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={`h${i}`} style={styles.calendarHead}>{d}</Text>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={styles.calendarCell} />;
          const k = dayKey(date);
          const entries = byDay[k] || [];
          const last = entries.length ? entries[entries.length - 1] : null;
          const color = last ? groupById(last.group)?.color : 'transparent';
          return (
            <Pressable key={k} onPress={() => setSelected(k)} style={styles.calendarCell}>
              <View
                style={[
                  styles.calendarDot,
                  { backgroundColor: color },
                  selected === k && styles.calendarSelected,
                ]}
              >
                <Text style={styles.calendarDay}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.subtitle, { marginTop: 16 }]}>{selected}</Text>
      {dayEntries.length === 0 ? (
        <Text style={styles.body}>No check-in on this day.</Text>
      ) : (
        dayEntries.map((c) => (
          <View key={c.id} style={styles.entry}>
            <Text style={styles.entryTitle}>
              {formatTime(new Date(c.createdAt))} · {groupById(c.group)?.label}
              {c.emotion ? ` (${c.emotion})` : ''}
            </Text>
            <Text style={styles.small}>Practice: {c.technique}</Text>
            {c.path === 'B' ? (
              <Text style={styles.small}>
                {c.completed === true
                  ? `Done, ${Math.round((c.timeSpentSec || 0) / 60)} min`
                  : c.completed === false
                  ? `Stopped after ${Math.round((c.timeSpentSec || 0) / 60)} min`
                  : 'Not started'}
                {c.afterGroup
                  ? ` · After: ${groupById(c.afterGroup)?.label}${c.afterEmotion ? ` (${c.afterEmotion})` : ''}`
                  : ''}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </>
  );
}

// ---------- App ----------

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [checkins, setCheckins] = useState([]);
  const [screen, setScreen] = useState('home');
  const [session, setSession] = useState({});
  const [reminderReturn, setReminderReturn] = useState('home');
  const [reminderDraft, setReminderDraft] = useState({ hour: 9, minute: 0 });
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  const checkinsRef = useRef([]);
  const handledResponses = useRef(new Set());

  // ----- Load saved data -----
  useEffect(() => {
    (async () => {
      const s = await loadJSON(KEYS.settings, DEFAULT_SETTINGS);
      if (s.reminder && new Date(s.reminder.at).getTime() < Date.now()) s.reminder = null;
      const c = await loadJSON(KEYS.checkins, []);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setCheckins(c);
      checkinsRef.current = c;
      setScreen(s.onboarded ? 'home' : 'welcome');
      setLoaded(true);
    })();
  }, []);

  const updateSettings = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(KEYS.settings, next);
      return next;
    });
  };

  // ----- Check-in records (background steps ⚙️) -----
  const createRecord = (record) => {
    const next = [...checkinsRef.current, record];
    checkinsRef.current = next;
    setCheckins(next);
    saveJSON(KEYS.checkins, next);
  };

  const updateRecord = (id, patch) => {
    const next = checkinsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c));
    checkinsRef.current = next;
    setCheckins(next);
    saveJSON(KEYS.checkins, next);
  };

  // ----- Notification taps (E3 and timer end) -----
  const handleResponse = (response) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handledResponses.current.has(id)) return;
    handledResponses.current.add(id);
    const data = response.notification.request.content.data || {};
    if (data.kind === 'checkin') {
      // E3 Tapping the notification → S2
      updateSettings({ reminder: null });
      setSession({});
      setScreen('checkin');
    } else if (data.kind === 'timerEnd' && data.recordId) {
      const record = checkinsRef.current.find((c) => c.id === data.recordId);
      if (record && record.completed == null) {
        finishTimer(record.id, record.timerMinutes || 0);
      }
    }
  };

  useEffect(() => {
    if (!loaded) return undefined;
    Notifications.getLastNotificationResponseAsync().then(handleResponse);
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ----- Timer -----
  const running = screen === 'technique' && session.timerEndAt;
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (running && now >= session.timerEndAt) {
      finishTimer(session.recordId, session.timerMinutes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, running]);

  const startTimer = async () => {
    const minutes = session.timerMinutes;
    const endAt = Date.now() + minutes * 60 * 1000;
    let notificationId = null;
    if (settings.notificationsOn && (await hasPermission())) {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: TEXTS.timerNotificationTitle,
          body: TEXTS.timerNotificationBody,
          data: { kind: 'timerEnd', recordId: session.recordId },
        },
        trigger: { type: INTERVAL_TRIGGER, seconds: Math.max(1, minutes * 60), repeats: false },
      });
    }
    updateRecord(session.recordId, { timerMinutes: minutes });
    setSession((s) => ({ ...s, timerEndAt: endAt, timerStartAt: Date.now(), timerNotificationId: notificationId }));
    setNow(Date.now());
  };

  // ⚙️ Timer ends → S15
  const finishTimer = (recordId, minutes) => {
    updateRecord(recordId, { completed: true, timeSpentSec: minutes * 60 });
    const record = checkinsRef.current.find((c) => c.id === recordId) || {};
    setSession((s) => ({
      ...s,
      recordId,
      group: s.group || record.group,
      emotion: s.emotion !== undefined ? s.emotion : record.emotion,
      timerEndAt: null,
    }));
    setScreen('after');
  };

  // Stop / leaves → S1
  const stopTimer = async () => {
    if (session.timerNotificationId) {
      await Notifications.cancelScheduledNotificationAsync(session.timerNotificationId);
    }
    const spent = session.timerStartAt ? (Date.now() - session.timerStartAt) / 1000 : 0;
    updateRecord(session.recordId, { completed: false, timeSpentSec: Math.round(spent) });
    setSession({});
    setScreen('home');
  };

  // ----- Reminder (S9a) -----
  const openReminder = (returnTo) => {
    const base = settings.reminder ? new Date(settings.reminder.at) : new Date(Date.now() + 60 * 60 * 1000);
    setReminderDraft({ hour: base.getHours(), minute: Math.floor(base.getMinutes() / 5) * 5 });
    setReminderReturn(returnTo);
    setMessage('');
    setScreen('reminder');
  };

  const draftDate = () => {
    const d = new Date();
    d.setHours(reminderDraft.hour, reminderDraft.minute, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  };

  // ⚙️ Save the reminder and schedule the notification
  const saveReminder = async (testInSeconds) => {
    const ok = await askPermission();
    if (!ok) {
      setMessage(TEXTS.notificationsBlocked);
      return;
    }
    if (settings.reminder?.id) {
      await Notifications.cancelScheduledNotificationAsync(settings.reminder.id);
    }
    const at = testInSeconds ? new Date(Date.now() + testInSeconds * 1000) : draftDate();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: TEXTS.reminderNotificationTitle,
        body: TEXTS.reminderNotificationBody,
        data: { kind: 'checkin' },
      },
      trigger: testInSeconds
        ? { type: INTERVAL_TRIGGER, seconds: testInSeconds, repeats: false }
        : { type: DATE_TRIGGER, date: at },
    });
    updateSettings({ reminder: { id, at: at.toISOString() }, notificationsOn: true });
    setScreen(reminderReturn);
  };

  // ----- Settings (S12) -----
  const toggleNotifications = async (value) => {
    setMessage('');
    if (value) {
      const ok = await askPermission();
      if (!ok) {
        setMessage(TEXTS.notificationsBlocked);
        return;
      }
      updateSettings({ notificationsOn: true });
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      updateSettings({ notificationsOn: false, reminder: null });
    }
  };

  const resetApp = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.multiRemove([KEYS.settings, KEYS.checkins]);
    checkinsRef.current = [];
    setCheckins([]);
    setSettings(DEFAULT_SETTINGS);
    setSession({});
    setScreen('welcome');
  };

  const goHome = () => {
    setSession({});
    setMessage('');
    setScreen('home');
  };

  if (!loaded) return <View style={styles.screen} />;

  const group = session.group ? groupById(session.group) : null;
  let body = null;

  switch (screen) {
    // S0 Welcome message and short explanation
    case 'welcome':
      body = (
        <Screen>
          <BreathingBubble />
          <Text style={styles.title}>{TEXTS.welcomeTitle}</Text>
          <Text style={styles.body}>{TEXTS.welcomeBody}</Text>
          <Button label={TEXTS.welcomeButton} onPress={() => setScreen('permission')} />
        </Screen>
      );
      break;

    // S0a Notification permission request → S2
    case 'permission':
      body = (
        <Screen>
          <Text style={styles.title}>{TEXTS.permissionTitle}</Text>
          <Text style={styles.body}>{TEXTS.permissionBody}</Text>
          <Button
            label={TEXTS.permissionAllow}
            onPress={async () => {
              const ok = await askPermission();
              updateSettings({ onboarded: true, notificationsOn: ok });
              setScreen('checkin');
            }}
          />
          <Button
            label={TEXTS.permissionLater}
            kind="secondary"
            onPress={() => {
              updateSettings({ onboarded: true, notificationsOn: false });
              setScreen('checkin');
            }}
          />
        </Screen>
      );
      break;

    // S1 Home screen with a floating bubble
    case 'home':
      body = (
        <Screen>
          <View style={styles.homeTop}>
            <Pressable onPress={() => setScreen('tracker')}>
              <Text style={styles.link}>Mood tracker</Text>
            </Pressable>
            <Pressable onPress={() => { setMessage(''); setScreen('settings'); }}>
              <Text style={styles.link}>Settings</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => { setSession({}); setScreen('checkin'); }}>
            <BreathingBubble size={180} />
          </Pressable>
          <Text style={[styles.body, { textAlign: 'center' }]}>{TEXTS.homeTap}</Text>
          {settings.reminder ? (
            <Text style={[styles.small, { textAlign: 'center', marginTop: 12 }]}>
              Next reminder: {formatReminder(settings.reminder.at)}
            </Text>
          ) : null}
        </Screen>
      );
      break;

    // S2 + S3: question, then 4 states
    case 'checkin':
      body = (
        <Screen onBack={goHome}>
          <StateQuestion
            question={TEXTS.checkInQuestion}
            onPick={(groupId) => {
              setSession({ group: groupId, startedAt: new Date().toISOString() });
              setScreen('specify');
            }}
          />
        </Screen>
      );
      break;

    // S4 Do you want to specify?
    case 'specify':
      body = (
        <Screen onBack={goHome}>
          <SpecifyEmotion
            groupId={session.group}
            onPick={(emotion) => {
              setSession((s) => ({ ...s, emotion }));
              setScreen('explain');
            }}
          />
        </Screen>
      );
      break;

    // S5 Explanation + question
    case 'explain':
      body = (
        <Screen onBack={goHome}>
          <View style={[styles.tag, { backgroundColor: group.color }]}>
            <Text style={styles.tagText}>
              {group.label}
              {session.emotion ? ` · ${session.emotion}` : ''}
            </Text>
          </View>
          <Text style={styles.body}>{group.explanation}</Text>
          <Text style={styles.title}>{group.question}</Text>
          <Button
            label={TEXTS.answerNope}
            kind="secondary"
            onPress={() => {
              // S6 + ⚙️ Save the check-in (date/time, emotion group, emotion)
              const quick = pickRandom(TECHNIQUES[session.group].under1, 1)[0];
              const id = `${Date.now()}`;
              createRecord({
                id,
                createdAt: new Date().toISOString(),
                path: 'A',
                group: session.group,
                emotion: session.emotion || null,
                technique: quick.name,
                timeChoice: 'under1',
              });
              setSession((s) => ({ ...s, recordId: id, technique: quick }));
              setScreen('quick');
            }}
          />
          <Button label={TEXTS.answerYes} onPress={() => setScreen('time')} />
        </Screen>
      );
      break;

    // S6 Suggest a technique from "under 1 min"
    case 'quick':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.subtitle}>{TEXTS.quickTitle}</Text>
          <Text style={styles.title}>{session.technique.name}</Text>
          <Text style={styles.small}>{session.technique.by}</Text>
          <Text style={styles.body}>{TECHNIQUE_STEPS_PLACEHOLDER}</Text>
          <Button label="Continue" onPress={() => setScreen('reminderAsk')} />
        </Screen>
      );
      break;

    // S9 Do you want to set up a reminder for the next session?
    case 'reminderAsk':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>{TEXTS.reminderAsk}</Text>
          <Button label={TEXTS.yes} onPress={() => openReminder('home')} />
          <Button label={TEXTS.no} kind="secondary" onPress={goHome} />
        </Screen>
      );
      break;

    // S7 How much time do you have?
    case 'time':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>{TEXTS.timeQuestion}</Text>
          {[
            { key: 'under5', label: TEXTS.timeUnder5 },
            { key: 'under15', label: TEXTS.time15 },
          ].map((choice) => (
            <Button
              key={choice.key}
              label={choice.label}
              onPress={() => {
                // ⚙️ Select two technique options (random) from the table
                const options = pickRandom(TECHNIQUES[session.group][choice.key], 2);
                setSession((s) => ({ ...s, timeChoice: choice.key, options }));
                setScreen('options');
              }}
            />
          ))}
        </Screen>
      );
      break;

    // S8a Technique options
    case 'options':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>{TEXTS.optionsTitle}</Text>
          {session.options.map((t) => (
            <Pressable
              key={t.name}
              style={styles.card}
              onPress={() => {
                // ⚙️ Save the check-in before the practice
                const id = `${Date.now()}`;
                const minutes = DEFAULT_MINUTES[session.timeChoice];
                createRecord({
                  id,
                  createdAt: new Date().toISOString(),
                  path: 'B',
                  group: session.group,
                  emotion: session.emotion || null,
                  technique: t.name,
                  timeChoice: session.timeChoice,
                  timerMinutes: minutes,
                  completed: null,
                });
                setSession((s) => ({ ...s, recordId: id, technique: t, timerMinutes: minutes, timerEndAt: null }));
                setScreen('technique');
              }}
            >
              <Text style={styles.cardTitle}>{t.name}</Text>
              <Text style={styles.small}>{t.by}</Text>
            </Pressable>
          ))}
        </Screen>
      );
      break;

    // S8 Technique description with timer setup → Start
    case 'technique': {
      const remaining = session.timerEndAt ? (session.timerEndAt - now) / 1000 : session.timerMinutes * 60;
      body = (
        <Screen onBack={session.timerEndAt ? undefined : goHome}>
          <Text style={styles.title}>{session.technique.name}</Text>
          <Text style={styles.small}>{session.technique.by}</Text>
          <Text style={styles.body}>{TECHNIQUE_STEPS_PLACEHOLDER}</Text>
          {session.timerEndAt ? (
            <>
              <Text style={styles.countdown}>{formatCountdown(remaining)}</Text>
              <Button label={TEXTS.timerStop} kind="secondary" onPress={stopTimer} />
            </>
          ) : (
            <>
              <Stepper
                value={`${session.timerMinutes} min`}
                label="Timer"
                onMinus={() => setSession((s) => ({ ...s, timerMinutes: Math.max(1, s.timerMinutes - 1) }))}
                onPlus={() => setSession((s) => ({ ...s, timerMinutes: Math.min(30, s.timerMinutes + 1) }))}
              />
              <Button label={TEXTS.timerStart} onPress={startTimer} />
            </>
          )}
        </Screen>
      );
      break;
    }

    // S15 + S15a: after the practice
    case 'after':
      body = (
        <Screen onBack={goHome}>
          <StateQuestion
            question={TEXTS.afterQuestion}
            onPick={(groupId) => {
              setSession((s) => ({ ...s, afterGroup: groupId }));
              setScreen('afterSpecify');
            }}
          />
        </Screen>
      );
      break;

    // S16 Do you want to specify? (after)
    case 'afterSpecify':
      body = (
        <Screen onBack={goHome}>
          <SpecifyEmotion
            groupId={session.afterGroup}
            onPick={(emotion) => {
              // ⚙️ Save the check-in after the practice
              updateRecord(session.recordId, { afterGroup: session.afterGroup, afterEmotion: emotion });
              setScreen('thanks');
            }}
          />
        </Screen>
      );
      break;

    // S17 Thanks for recording!
    case 'thanks':
      body = (
        <Screen>
          <Text style={styles.title}>{TEXTS.anotherSessionAsk}</Text>
          <Button label={TEXTS.yes} onPress={() => openReminder('home')} />
          <Button label={TEXTS.no} kind="secondary" onPress={goHome} />
        </Screen>
      );
      break;

    // S9a Set up a reminder (one-off, at a chosen time)
    case 'reminder':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>{TEXTS.reminderTitle}</Text>
          <Stepper
            label="Hour"
            value={pad(reminderDraft.hour)}
            onMinus={() => setReminderDraft((d) => ({ ...d, hour: (d.hour + 23) % 24 }))}
            onPlus={() => setReminderDraft((d) => ({ ...d, hour: (d.hour + 1) % 24 }))}
          />
          <Stepper
            label="Minutes"
            value={pad(reminderDraft.minute)}
            onMinus={() => setReminderDraft((d) => ({ ...d, minute: (d.minute + 55) % 60 }))}
            onPlus={() => setReminderDraft((d) => ({ ...d, minute: (d.minute + 5) % 60 }))}
          />
          <Text style={[styles.body, { textAlign: 'center' }]}>
            {formatReminder(draftDate().toISOString())}
          </Text>
          {message ? <Text style={styles.warning}>{message}</Text> : null}
          <Button label={TEXTS.reminderSave} onPress={() => saveReminder()} />
          <Button label={TEXTS.reminderTest} kind="link" onPress={() => saveReminder(10)} />
          <Button label={TEXTS.reminderCancel} kind="secondary" onPress={() => setScreen(reminderReturn)} />
        </Screen>
      );
      break;

    // S12 Settings
    case 'settings':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Reminder</Text>
          <Text style={styles.body}>
            {settings.reminder ? formatReminder(settings.reminder.at) : 'No reminder set.'}
          </Text>
          <Button label="Change reminder time" kind="secondary" onPress={() => openReminder('settings')} />
          <View style={styles.settingRow}>
            <Text style={styles.body}>Notifications</Text>
            <Switch value={settings.notificationsOn} onValueChange={toggleNotifications} />
          </View>
          {message ? <Text style={styles.warning}>{message}</Text> : null}
          <Text style={[styles.subtitle, { marginTop: 32 }]}>For testing</Text>
          <Button label="Reset the app (deletes all data)" kind="link" onPress={resetApp} />
        </Screen>
      );
      break;

    // S13 Mood tracker
    case 'tracker':
      body = (
        <Screen onBack={goHome}>
          <MoodTracker checkins={checkins} />
        </Screen>
      );
      break;

    default:
      body = (
        <Screen>
          <Button label="Home" onPress={goHome} />
        </Screen>
      );
  }

  return (
    <>
      <StatusBar style="dark" />
      {body}
    </>
  );
}

// ---------- Styles (placeholders until the brand work) ----------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F5F2', paddingTop: 56 },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  back: { paddingHorizontal: 24, paddingVertical: 8 },
  backText: { fontSize: 16, color: '#6B5FA5' },
  backSpacer: { height: 36 },
  title: { fontSize: 24, fontWeight: '600', color: '#2E2A3A', marginVertical: 16, textAlign: 'center' },
  subtitle: { fontSize: 17, fontWeight: '600', color: '#2E2A3A', marginVertical: 8 },
  body: { fontSize: 16, lineHeight: 23, color: '#3D3849', marginVertical: 8 },
  small: { fontSize: 13, color: '#7A7488' },
  warning: { fontSize: 14, color: '#A3483D', marginVertical: 8 },
  link: { fontSize: 16, color: '#6B5FA5' },
  homeTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  button: {
    backgroundColor: '#6B5FA5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    alignItems: 'center',
    marginVertical: 6,
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#6B5FA5' },
  buttonLink: { backgroundColor: 'transparent' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#6B5FA5' },
  buttonTextLink: { color: '#6B5FA5', fontWeight: '400', textDecorationLine: 'underline' },
  bubbleGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 12 },
  bubble: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  bubbleText: { color: '#2E2A3A', fontWeight: '600', textAlign: 'center' },
  tag: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginTop: 8 },
  tagText: { color: '#2E2A3A', fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginVertical: 8 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#2E2A3A', marginBottom: 4 },
  countdown: { fontSize: 56, fontWeight: '300', textAlign: 'center', color: '#2E2A3A', marginVertical: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 12, gap: 16 },
  stepButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#E6E1F2', alignItems: 'center', justifyContent: 'center',
  },
  stepButtonText: { fontSize: 26, color: '#6B5FA5' },
  stepValue: { fontSize: 28, fontWeight: '500', color: '#2E2A3A' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthNav: { fontSize: 28, color: '#6B5FA5', paddingHorizontal: 12 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarHead: { width: `${100 / 7}%`, textAlign: 'center', color: '#7A7488', marginBottom: 6 },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calendarSelected: { borderWidth: 2, borderColor: '#2E2A3A' },
  calendarDay: { color: '#2E2A3A' },
  entry: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginVertical: 4 },
  entryTitle: { fontSize: 15, fontWeight: '600', color: '#2E2A3A' },
});
