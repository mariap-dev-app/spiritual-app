// Spiritual app: prototype, version 3 (flow of 20 November 2026).
// Screen numbers (S0, S1...) match the FigJam user flow and its Notion text version.
// Data stays on the phone (AsyncStorage). Content lives in src/content.js.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  Vibration,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CONFIG,
  CONSISTENT_DAY_CHECKINS,
  DEFAULT_MINUTES,
  GROUPS,
  TECHNIQUES,
  TECHNIQUE_STEPS_PLACEHOLDER,
  TEXTS,
} from './src/content';

// ---------- Notifications setup ----------

// Follows the "Sound" setting (updated by the app when settings change).
let playSound = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: playSound,
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

// Notification kinds used by this version:
// 'random' (random reminders), 'checkin' (the one-off reminder, S9a), 'timerEnd'.
// Anything else (for example the daily reminders from prototype v1) is cancelled at launch.
async function cancelOldNotifications(keepReminderId) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => {
          const kind = n.content?.data?.kind;
          if (kind === 'timerEnd' || kind === 'random') return false;
          return n.identifier !== keepReminderId;
        })
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (e) {
    // Ignore for the prototype.
  }
}

// ---------- Random reminders (⚙️) ----------

// iOS keeps at most 64 scheduled notifications per app. Random reminders use up to
// 50, leaving room for the one-off reminder and a timer alert.
const MAX_RANDOM = 50;
const MAX_DAYS_AHEAD = 7;
const MIN_LEAD_MS = 10 * 60 * 1000; // never less than 10 minutes from now

// Returns the planned times: within each day, the active hours (quiet hours end → quiet
// hours start) are cut into periods of `frequencyHours`, with one random time per period.
function planRandomTimes({ frequencyHours, quietStart, quietEnd }, from = new Date()) {
  const times = [];
  const earliest = from.getTime() + MIN_LEAD_MS;
  for (let d = 0; d < MAX_DAYS_AHEAD && times.length < MAX_RANDOM; d += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
    let start = new Date(day);
    start.setHours(quietEnd, 0, 0, 0);
    const end = new Date(day);
    end.setHours(quietStart, 0, 0, 0);
    while (start < end && times.length < MAX_RANDOM) {
      const periodEnd = new Date(Math.min(start.getTime() + frequencyHours * 3600 * 1000, end.getTime()));
      const lo = Math.max(start.getTime(), earliest);
      const hi = periodEnd.getTime();
      if (hi - lo > 5 * 60 * 1000) {
        times.push(new Date(lo + Math.random() * (hi - lo)));
      }
      start = periodEnd;
    }
  }
  return times;
}

// Cancels the planned random reminders and plans them again from now.
// Returns the planned times (ISO strings) so Home can show the next one.
async function planRandomReminders(settings) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content?.data?.kind === 'random')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    if (!settings.notificationsOn || !(await hasPermission())) return [];
    const times = planRandomTimes(settings);
    for (const at of times) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: TEXTS.reminderNotificationTitle,
          body: TEXTS.reminderNotificationBody,
          sound: settings.sound,
          data: { kind: 'random' },
        },
        trigger: { type: DATE_TRIGGER, date: at },
      });
    }
    return times.map((t) => t.toISOString());
  } catch (e) {
    return [];
  }
}

// ---------- Analytics (⚙️, anonymous) ----------

// Sends anonymous usage events to PostHog through its public capture endpoint.
// Never sends the content of a check-in (no state, emotion or technique).
// Does nothing while CONFIG.posthogKey is empty.
async function track(distinctId, event, properties = {}) {
  if (!CONFIG.posthogKey || !distinctId) return;
  try {
    await fetch(`${CONFIG.posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: CONFIG.posthogKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, app_version: '0.3.0' },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // No network: the event is dropped (fine for the beta).
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function askPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (current.canAskAgain === false) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ---------- Storage ----------

const KEYS = { settings: 'settings_v2', checkins: 'checkins_v2' };
const DEFAULT_SETTINGS = {
  onboarded: false,
  notificationsOn: true,
  reminder: null, // one-off reminder (S9a): { id, at }
  frequencyHours: 3,
  quietStart: 22,
  quietEnd: 8,
  sound: true,
  vibration: true,
  randomPlan: [], // planned random reminder times (ISO), for "Next reminder" on Home
  analyticsId: null, // random anonymous ID, not linked to the person
};

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
  const label =
    key === today
      ? 'Today'
      : key === tomorrow
      ? 'Tomorrow'
      : at.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
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

// Organic bubble shape: slightly different corner radii, so it is not a perfect circle.
function organicShape(size) {
  return {
    width: size,
    height: size,
    borderTopLeftRadius: size * 0.48,
    borderTopRightRadius: size * 0.5,
    borderBottomRightRadius: size * 0.46,
    borderBottomLeftRadius: size * 0.52,
  };
}

const bubbleShadow = {
  shadowColor: '#1E3A5F',
  shadowOpacity: 0.18,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

// Single soft highlight near the top-left of the bubble.
function BubbleHighlight({ size }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: size * 0.18,
        left: size * 0.2,
        width: size * 0.34,
        height: size * 0.16,
        borderRadius: size * 0.1,
        backgroundColor: '#FFFFFF',
        opacity: 0.7,
        transform: [{ rotate: '-25deg' }],
      }}
    />
  );
}

function Bubble({ label, color, size = 120, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bubble,
        organicShape(size),
        bubbleShadow,
        { backgroundColor: color },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <BubbleHighlight size={size} />
      <Text style={styles.bubbleText}>{label}</Text>
    </Pressable>
  );
}

// Breathing bubble: slowly expands and retracts (one breath = 8 seconds).
function BreathingBubble({ color = '#C9EBFF', size = 140 }) {
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
        ...organicShape(size),
        ...bubbleShadow,
        backgroundColor: color,
        opacity: 0.85,
        transform: [{ scale }],
        alignSelf: 'center',
        marginVertical: 24,
      }}
    >
      <BubbleHighlight size={size} />
    </Animated.View>
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

// A row of options where one is selected (frequency, quiet hours).
function Choice({ options, value, onChange }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          style={[styles.choice, value === o.value && styles.choiceSelected]}
        >
          <Text style={[styles.choiceText, value === o.value && styles.choiceTextSelected]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// S9a: month calendar to pick the reminder day. Past days cannot be picked.
function DayCalendar({ value, onPick }) {
  const [month, setMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const thisMonth = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7; // Monday first
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const canGoBack = month > thisMonth;

  return (
    <>
      <View style={styles.monthRow}>
        <Pressable
          disabled={!canGoBack}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Text style={[styles.monthNav, !canGoBack && { opacity: 0.2 }]}>‹</Text>
        </Pressable>
        <Text style={styles.body}>
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
          const past = date < todayStart;
          const selected = dayKey(date) === dayKey(value);
          return (
            <Pressable
              key={dayKey(date)}
              disabled={past}
              onPress={() => onPick(date)}
              style={styles.calendarCell}
            >
              <View
                style={[
                  styles.calendarDot,
                  selected && { backgroundColor: '#C9EBFF' },
                ]}
              >
                <Text style={[styles.calendarDay, past && { opacity: 0.3 }, selected && { color: '#10243A' }]}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
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
          const consistent = entries.length >= CONSISTENT_DAY_CHECKINS;
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
              {consistent ? <Text style={styles.consistentMark}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.small}>✓ {TEXTS.consistentDay}</Text>
      <Text style={[styles.subtitle, { marginTop: 16 }]}>
        {selected} · {dayEntries.length} check-in{dayEntries.length === 1 ? '' : 's'}
        {dayEntries.length >= CONSISTENT_DAY_CHECKINS ? ' ✓' : ''}
      </Text>
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
  const [reminderDraft, setReminderDraft] = useState(new Date());
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  const checkinsRef = useRef([]);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const handledResponses = useRef(new Set());

  const t = (event, properties) => track(settingsRef.current.analyticsId, event, properties);

  // ----- Load saved data, clean up and top up the random reminders -----
  useEffect(() => {
    (async () => {
      const s = { ...DEFAULT_SETTINGS, ...(await loadJSON(KEYS.settings, DEFAULT_SETTINGS)) };
      if (s.reminder && new Date(s.reminder.at).getTime() < Date.now()) s.reminder = null;
      if (!s.analyticsId) s.analyticsId = newId();
      playSound = s.sound;
      await cancelOldNotifications(s.reminder?.id);
      if (s.onboarded) s.randomPlan = await planRandomReminders(s);
      settingsRef.current = s;
      setSettings(s);
      saveJSON(KEYS.settings, s);
      const c = await loadJSON(KEYS.checkins, []);
      setCheckins(c);
      checkinsRef.current = c;
      setScreen(s.onboarded ? 'home' : 'welcome');
      setLoaded(true);
      track(s.analyticsId, 'app_opened');
    })();
  }, []);

  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    playSound = next.sound;
    setSettings(next);
    saveJSON(KEYS.settings, next);
    return next;
  };

  // Save settings, then plan the random reminders again (frequency, quiet hours, on/off).
  const updateAndReplan = async (patch) => {
    const next = updateSettings(patch);
    const plan = await planRandomReminders(next);
    updateSettings({ randomPlan: plan });
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
    if (data.kind === 'checkin' || data.kind === 'random') {
      // E3 Tapping a reminder → S2
      if (data.kind === 'checkin') updateSettings({ reminder: null });
      const source = data.kind === 'random' ? 'random_reminder' : 'oneoff_reminder';
      t('reminder_opened', { type: data.kind === 'random' ? 'random' : 'oneoff' });
      setSession({ source });
      setScreen('checkin');
    } else if (data.kind === 'timerEnd' && data.recordId) {
      const record = checkinsRef.current.find((c) => c.id === data.recordId);
      if (record && record.completed == null) {
        finishTimer(record.id, record.timerMinutes || 0, false);
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
      finishTimer(session.recordId, session.timerMinutes, true);
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
          sound: settings.sound,
          data: { kind: 'timerEnd', recordId: session.recordId },
        },
        trigger: { type: INTERVAL_TRIGGER, seconds: Math.max(1, minutes * 60), repeats: false },
      });
    }
    updateRecord(session.recordId, { timerMinutes: minutes });
    setSession((s) => ({ ...s, timerEndAt: endAt, timerStartAt: Date.now(), timerNotificationId: notificationId }));
    setNow(Date.now());
  };

  // ⚙️ Timer ends: soft vibration if the app is open (and Vibration is on) → S15
  const finishTimer = (recordId, minutes, appOpen) => {
    if (appOpen && settingsRef.current.vibration) Vibration.vibrate(400);
    t('practice_done', { minutes, path: 'yes' });
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
    t('practice_stopped', { minutes_spent: Math.round(spent / 60) });
    updateRecord(session.recordId, { completed: false, timeSpentSec: Math.round(spent) });
    setSession({});
    setScreen('home');
  };

  // ----- Reminder (S9a) -----
  const openReminder = (returnTo) => {
    const base = settings.reminder ? new Date(settings.reminder.at) : new Date(Date.now() + 60 * 60 * 1000);
    base.setMinutes(Math.ceil(base.getMinutes() / 5) * 5, 0, 0);
    setReminderDraft(base);
    setReminderReturn(returnTo);
    setMessage('');
    setScreen('reminder');
  };

  // Change the day, keep the time
  const pickReminderDay = (day) => {
    const d = new Date(day);
    d.setHours(reminderDraft.getHours(), reminderDraft.getMinutes(), 0, 0);
    setReminderDraft(d);
    setMessage('');
  };

  // Change the time by a number of minutes, keep the day
  const shiftReminderTime = (minutes) => {
    const d = new Date(reminderDraft);
    const total = (d.getHours() * 60 + d.getMinutes() + minutes + 24 * 60) % (24 * 60);
    d.setHours(Math.floor(total / 60), total % 60, 0, 0);
    setReminderDraft(d);
    setMessage('');
  };

  // ⚙️ Save the reminder and schedule the notification
  const saveReminder = async (testInSeconds) => {
    if (!testInSeconds && reminderDraft.getTime() <= Date.now()) {
      setMessage(TEXTS.reminderPast);
      return;
    }
    const ok = await askPermission();
    if (!ok) {
      setMessage(TEXTS.notificationsBlocked);
      return;
    }
    if (settings.reminder?.id) {
      await Notifications.cancelScheduledNotificationAsync(settings.reminder.id);
    }
    const at = testInSeconds ? new Date(Date.now() + testInSeconds * 1000) : reminderDraft;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: TEXTS.reminderNotificationTitle,
        body: TEXTS.reminderNotificationBody,
        sound: settings.sound,
        data: { kind: 'checkin' },
      },
      trigger: testInSeconds
        ? { type: INTERVAL_TRIGGER, seconds: testInSeconds, repeats: false }
        : { type: DATE_TRIGGER, date: at },
    });
    t('oneoff_reminder_set', { test: Boolean(testInSeconds) });
    const wasOff = !settingsRef.current.notificationsOn;
    updateSettings({ reminder: { id, at: at.toISOString() }, notificationsOn: true });
    if (wasOff) await updateAndReplan({});
    setScreen(reminderReturn);
  };

  const removeReminder = async () => {
    if (settings.reminder?.id) await Notifications.cancelScheduledNotificationAsync(settings.reminder.id);
    updateSettings({ reminder: null });
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
      await updateAndReplan({ notificationsOn: true });
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      updateSettings({ notificationsOn: false, reminder: null, randomPlan: [] });
    }
  };

  const openFeedback = async () => {
    t('feedback_opened');
    if (!CONFIG.feedbackUrl) {
      setMessage(TEXTS.feedbackNotSet);
      return;
    }
    try {
      await Linking.openURL(CONFIG.feedbackUrl);
    } catch (e) {
      setMessage(TEXTS.feedbackNotSet);
    }
  };

  const resetApp = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.multiRemove([KEYS.settings, KEYS.checkins]);
    checkinsRef.current = [];
    setCheckins([]);
    settingsRef.current = { ...DEFAULT_SETTINGS, analyticsId: newId() };
    setSettings(settingsRef.current);
    setSession({});
    setMessage('');
    setScreen('welcome');
  };

  // Next reminder shown on Home: the earliest planned random or one-off reminder.
  const nextReminderAt = () => {
    const nowMs = Date.now();
    const times = [...(settings.randomPlan || [])];
    if (settings.reminder) times.push(settings.reminder.at);
    const future = times.filter((iso) => new Date(iso).getTime() > nowMs).sort();
    return future.length ? future[0] : null;
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
    // S0 Welcome and short presentation of the method
    case 'welcome':
      body = (
        <Screen>
          <BreathingBubble />
          <Text style={styles.title}>{TEXTS.welcomeTitle}</Text>
          <Text style={styles.body}>{TEXTS.welcomeBody}</Text>
          <Text style={styles.subtitle}>{TEXTS.methodTitle}</Text>
          {TEXTS.methodSteps.map((step, i) => (
            <Text key={i} style={styles.body}>{`${i + 1}. ${step}`}</Text>
          ))}
          <Button label={TEXTS.welcomeButton} onPress={() => setScreen('permission')} />
        </Screen>
      );
      break;

    // S0a Notification permission request → S0b
    case 'permission':
      body = (
        <Screen>
          <Text style={styles.title}>{TEXTS.permissionTitle}</Text>
          <Text style={styles.body}>{TEXTS.permissionBody}</Text>
          <Button
            label={TEXTS.permissionAllow}
            onPress={async () => {
              const ok = await askPermission();
              updateSettings({ notificationsOn: ok });
              setScreen('frequency');
            }}
          />
          <Button
            label={TEXTS.permissionLater}
            kind="secondary"
            onPress={() => {
              updateSettings({ notificationsOn: false });
              setScreen('frequency');
            }}
          />
        </Screen>
      );
      break;

    // S0b Reminder frequency → ⚙️ plan random reminders → S2
    case 'frequency':
      body = (
        <Screen>
          <Text style={styles.title}>{TEXTS.frequencyTitle}</Text>
          <Text style={styles.body}>{TEXTS.frequencyBody}</Text>
          <Choice
            options={TEXTS.frequencyOptions.map((o) => ({ value: o.hours, label: o.label }))}
            value={settings.frequencyHours}
            onChange={(hours) => updateSettings({ frequencyHours: hours })}
          />
          <Button
            label={TEXTS.frequencyContinue}
            onPress={async () => {
              await updateAndReplan({ onboarded: true });
              t('onboarding_done', {
                frequency_hours: settingsRef.current.frequencyHours,
                notifications: settingsRef.current.notificationsOn,
              });
              setSession({ source: 'onboarding' });
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
          <Pressable onPress={() => { setSession({ source: 'home' }); setScreen('checkin'); }}>
            <BreathingBubble size={180} />
          </Pressable>
          <Text style={[styles.body, { textAlign: 'center' }]}>{TEXTS.homeTap}</Text>
          {nextReminderAt() ? (
            <Text style={[styles.small, { textAlign: 'center', marginTop: 12 }]}>
              Next reminder: {formatReminder(nextReminderAt())}
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
              t('checkin_started', { source: session.source || 'home' });
              setSession((s) => ({ source: s.source || 'home', group: groupId, startedAt: new Date().toISOString() }));
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
              const id = newId();
              t('quick_practice_shown', { source: session.source });
              createRecord({
                id,
                createdAt: new Date().toISOString(),
                source: session.source,
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
                const id = newId();
                const minutes = DEFAULT_MINUTES[session.timeChoice];
                t('practice_chosen', { source: session.source, time_choice: session.timeChoice });
                createRecord({
                  id,
                  createdAt: new Date().toISOString(),
                  source: session.source,
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
          <Button
            label={TEXTS.afterSkip}
            kind="secondary"
            onPress={() => {
              // Skip: the practice stays saved as done, without the after state → S17
              updateRecord(session.recordId, { afterSkipped: true });
              t('after_check_skipped');
              setScreen('thanks');
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
              t('after_check_done');
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

    // S9a Set up a reminder (one-off, on a chosen date and time)
    case 'reminder':
      body = (
        <Screen onBack={goHome}>
          <Text style={styles.title}>{TEXTS.reminderTitle}</Text>
          <Text style={styles.subtitle}>Day</Text>
          <DayCalendar value={reminderDraft} onPick={pickReminderDay} />
          <Text style={[styles.subtitle, { marginTop: 16 }]}>Time</Text>
          <Stepper
            label="hour"
            value={pad(reminderDraft.getHours())}
            onMinus={() => shiftReminderTime(-60)}
            onPlus={() => shiftReminderTime(60)}
          />
          <Stepper
            label="minutes"
            value={pad(reminderDraft.getMinutes())}
            onMinus={() => shiftReminderTime(-5)}
            onPlus={() => shiftReminderTime(5)}
          />
          <Text style={[styles.body, { textAlign: 'center' }]}>
            {formatReminder(reminderDraft.toISOString())}
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

          <View style={styles.settingRow}>
            <Text style={styles.subtitle}>Notifications</Text>
            <Switch value={settings.notificationsOn} onValueChange={toggleNotifications} />
          </View>

          <Text style={styles.subtitle}>Reminder frequency</Text>
          <Choice
            options={TEXTS.frequencyOptions.map((o) => ({ value: o.hours, label: o.label }))}
            value={settings.frequencyHours}
            onChange={(hours) => updateAndReplan({ frequencyHours: hours })}
          />
          <Text style={styles.small}>At a random time within each period.</Text>

          <Text style={[styles.subtitle, { marginTop: 16 }]}>Quiet hours</Text>
          <Text style={styles.small}>No reminders between these times.</Text>
          <Stepper
            label="from"
            value={`${pad(settings.quietStart)}:00`}
            onMinus={() => updateAndReplan({ quietStart: Math.max(18, settings.quietStart - 1) })}
            onPlus={() => updateAndReplan({ quietStart: Math.min(23, settings.quietStart + 1) })}
          />
          <Stepper
            label="to"
            value={`${pad(settings.quietEnd)}:00`}
            onMinus={() => updateAndReplan({ quietEnd: Math.max(5, settings.quietEnd - 1) })}
            onPlus={() => updateAndReplan({ quietEnd: Math.min(11, settings.quietEnd + 1) })}
          />

          <View style={styles.settingRow}>
            <Text style={styles.body}>Sound</Text>
            <Switch value={settings.sound} onValueChange={(v) => updateAndReplan({ sound: v })} />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.body}>Vibration at the end of the timer</Text>
            <Switch value={settings.vibration} onValueChange={(v) => updateSettings({ vibration: v })} />
          </View>

          <Text style={[styles.subtitle, { marginTop: 16 }]}>One-off reminder</Text>
          <Text style={styles.body}>
            {settings.reminder ? formatReminder(settings.reminder.at) : 'None set.'}
          </Text>
          <Button
            label={settings.reminder ? 'Change one-off reminder' : 'Set a one-off reminder'}
            kind="secondary"
            onPress={() => openReminder('settings')}
          />
          {settings.reminder ? <Button label="Remove one-off reminder" kind="link" onPress={removeReminder} /> : null}

          <Text style={[styles.subtitle, { marginTop: 16 }]}>Beta</Text>
          <Button label={TEXTS.feedbackButton} onPress={openFeedback} />
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
  screen: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 56 },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  back: { paddingHorizontal: 24, paddingVertical: 8 },
  backText: { fontSize: 16, color: '#1E3A5F' },
  backSpacer: { height: 36 },
  title: { fontSize: 24, fontWeight: '600', color: '#1B2A3D', marginVertical: 16, textAlign: 'center' },
  subtitle: { fontSize: 17, fontWeight: '600', color: '#1B2A3D', marginVertical: 8 },
  body: { fontSize: 16, lineHeight: 23, color: '#1B2A3D', marginVertical: 8 },
  small: { fontSize: 13, color: '#4F6275' },
  warning: { fontSize: 14, color: '#A3483D', marginVertical: 8 },
  link: { fontSize: 16, color: '#1E3A5F' },
  homeTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  button: {
    backgroundColor: '#C9EBFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    alignItems: 'center',
    marginVertical: 6,
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#1E3A5F' },
  buttonLink: { backgroundColor: 'transparent' },
  buttonText: { color: '#10243A', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#1E3A5F' },
  buttonTextLink: { color: '#1E3A5F', fontWeight: '400', textDecorationLine: 'underline' },
  bubbleGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 12 },
  bubble: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  bubbleText: { color: '#1B2A3D', fontWeight: '600', textAlign: 'center' },
  tag: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginTop: 8 },
  tagText: { color: '#1B2A3D', fontWeight: '600' },
  card: { backgroundColor: '#F0F7FC', borderRadius: 16, padding: 18, marginVertical: 8 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#1B2A3D', marginBottom: 4 },
  countdown: { fontSize: 56, fontWeight: '300', textAlign: 'center', color: '#1B2A3D', marginVertical: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 12, gap: 16 },
  stepButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0F7FC', alignItems: 'center', justifyContent: 'center',
  },
  stepButtonText: { fontSize: 26, color: '#1E3A5F' },
  stepValue: { fontSize: 28, fontWeight: '500', color: '#1B2A3D' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthNav: { fontSize: 28, color: '#1E3A5F', paddingHorizontal: 12 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarHead: { width: `${100 / 7}%`, textAlign: 'center', color: '#4F6275', marginBottom: 6 },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calendarSelected: { borderWidth: 2, borderColor: '#1B2A3D' },
  calendarDay: { color: '#1B2A3D' },
  entry: { backgroundColor: '#F0F7FC', borderRadius: 12, padding: 12, marginVertical: 4 },
  entryTitle: { fontSize: 15, fontWeight: '600', color: '#1B2A3D' },
  consistentMark: { position: 'absolute', bottom: 0, fontSize: 11, color: '#1E3A5F', fontWeight: '700' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  choice: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#1E3A5F',
    backgroundColor: 'transparent',
  },
  choiceSelected: { backgroundColor: '#C9EBFF', borderColor: '#C9EBFF' },
  choiceText: { color: '#1E3A5F', fontSize: 15 },
  choiceTextSelected: { color: '#10243A', fontWeight: '600' },
});
