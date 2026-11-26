// Mousse (working name): prototype, version 4 (final content of 22 Nov and berry graphic chart of 25 Nov 2026).
// Screen numbers (S0, S1...) match the FigJam user flow and its Notion text version.
// Data stays on the phone (AsyncStorage). Content lives in src/content.js.

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_NAME,
  CONFIG,
  CONSISTENT_DAY_CHECKINS,
  DEFAULT_MINUTES,
  GROUPS,
  TECHNIQUES,
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
  if (!frequencyHours) return times; // "No reminders"
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
        properties: { ...properties, app_version: '0.5.0' },
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
  quietEnd: 9, // "Starting at" in Settings: first possible reminder of the day
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

// Date and time format (decided 20 November 2026): "Fri 20 Nov, 08:30", 24-hour clock.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatReminder(iso) {
  const at = new Date(iso);
  return `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}, ${formatTime(at)}`;
}

function formatCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ---------- Small UI pieces ----------

// Buttons (graphic chart 25 Nov 2026): primary = berry gradient pill, secondary = outlined
// pill, link = accent text.
function Button({ label, onPress, kind = 'primary', disabled }) {
  if (kind === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.buttonWrap, (pressed || disabled) && { opacity: 0.7 }]}
      >
        <LinearGradient colors={G.cta} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.button}>
          <Text style={styles.buttonText}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        kind === 'secondary' ? styles.buttonSecondary : styles.buttonLink,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={kind === 'secondary' ? styles.buttonTextSecondary : styles.buttonTextLink}>{label}</Text>
    </Pressable>
  );
}

// Title: serif, centred. A second phrase (after \n) starts on a new line in the same
// font and size (feedback of 26 Nov). small: 20 px for long one-sentence titles.
function Title({ children, small, style }) {
  return <Text style={[styles.title, small && styles.titleSmallSize, style]}>{children}</Text>;
}

// ---------- Organic shapes (graphic chart 25 Nov 2026) ----------
// Each shape is written like a CSS border-radius "a b c d / e f g h" (percentages):
// horizontal then vertical radius of the top-left, top-right, bottom-right and
// bottom-left corners. Unequal radii give the soft, slightly uneven bubble outline.
const SHAPES = {
  main: [52, 48, 55, 45, 50, 55, 45, 50],
  strongPositive: [50, 50, 46, 54, 56, 44, 56, 44],
  lowPositive: [48, 52, 45, 55, 55, 45, 55, 45],
  lowNegative: [52, 48, 50, 50, 45, 55, 45, 55],
  strongNegative: [50, 50, 56, 44, 48, 52, 48, 52],
  blobA: [55, 45, 50, 50, 45, 55, 45, 55],
  blobB: [48, 52, 45, 55, 55, 45, 55, 45],
  blobC: [52, 48, 55, 45, 50, 55, 45, 50],
  blobD: [50, 50, 46, 54, 56, 44, 56, 44],
};

// SVG path for a shape of width w and height h.
function shapePath(w, h, r) {
  const [tlx, trx, brx, blx, tly, try_, bry, bly] = r.map((v) => v / 100);
  const n = (v) => v.toFixed(1);
  return [
    `M ${n(tlx * w)} 0`,
    `L ${n(w - trx * w)} 0`,
    `A ${n(trx * w)} ${n(try_ * h)} 0 0 1 ${n(w)} ${n(try_ * h)}`,
    `L ${n(w)} ${n(h - bry * h)}`,
    `A ${n(brx * w)} ${n(bry * h)} 0 0 1 ${n(w - brx * w)} ${n(h)}`,
    `L ${n(blx * w)} ${n(h)}`,
    `A ${n(blx * w)} ${n(bly * h)} 0 0 1 0 ${n(h - bly * h)}`,
    `L 0 ${n(tly * h)}`,
    `A ${n(tlx * w)} ${n(tly * h)} 0 0 1 ${n(tlx * w)} 0`,
    'Z',
  ].join(' ');
}

let shapeIds = 0;
// An organic shape filled with a radial gradient centred at 40 % / 35 %, as in the chart.
// stops: [[offset 0-1, colour, opacity], ...]
function OrganicShape({ width, height, shape, stops }) {
  const id = useRef(`g${(shapeIds += 1)}`).current;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx="40%" cy="35%" rx="65%" ry="65%" fx="40%" fy="35%">
          {stops.map(([offset, color, opacity = 1]) => (
            <Stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
          ))}
        </RadialGradient>
      </Defs>
      <Path d={shapePath(width, height, shape)} fill={`url(#${id})`} />
    </Svg>
  );
}

// Mood bubbles: organic shape and berry gradient of the emotion group, soft shadow, light label.
function Bubble({ label, groupId, colors, size = 130, fontSize = 16, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bubbleShadow,
        { width: size, height: size },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <OrganicShape
        width={size}
        height={size}
        shape={SHAPES[groupId] || SHAPES.main}
        stops={[[0, colors[0]], [1, colors[1]]]}
      />
      <View style={[styles.bubble, size <= 100 && { padding: 4 }]}>
        <Text style={[styles.bubbleText, { fontSize, lineHeight: Math.round(fontSize * 1.3) }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

// Main bubble: 220 px organic berry shape, no ring. It breathes: grows by 10 % on the
// breath in (4 s) and returns on the breath out (6 s). Still when "Reduce motion" is on.
function BreathingBubble({ size = 220 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const still = useReduceMotion();
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, still]);
  return (
    <Animated.View
      style={[
        styles.bubbleShadow,
        { width: size, height: size, alignSelf: 'center', marginVertical: 24 },
        { transform: [{ scale }] },
      ]}
    >
      <OrganicShape
        width={size}
        height={size}
        shape={SHAPES.main}
        stops={[[0, G.mainBubble[0]], [0.55, G.mainBubble[1]], [1, G.mainBubble[2]]]}
      />
    </Animated.View>
  );
}

// Background (graphic chart 25 Nov 2026): purple-to-chocolate vertical gradient, with four
// soft organic berry blobs that drift up and down and sway slightly (9 s per cycle).
// Still when "Reduce motion" is on.
const BG_BLOBS = [
  { left: -70, top: 90, width: 230, height: 200, shape: 'blobA', color: '#C94A6E', from: 0.24, to: 0.04, delay: 0 },
  { right: -60, top: 330, width: 200, height: 190, shape: 'blobB', color: '#C94A6E', from: 0.2, to: 0.03, delay: 6000 },
  { left: -30, top: 520, width: 170, height: 150, shape: 'blobC', color: '#C94A6E', from: 0.18, to: 0.03, delay: 10000 },
  { right: -20, top: 70, width: 120, height: 110, shape: 'blobD', color: '#EFA7BA', from: 0.14, to: 0.02, delay: 3000 },
];

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => active && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

function Blob({ left, right, top, width, height, shape, color, from, to, delay, still }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const timer = setTimeout(() => loop.start(), delay % 4500);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [still, t, delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const translateX = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10, 0] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        right,
        top,
        width,
        height,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    >
      <OrganicShape
        width={width}
        height={height}
        shape={SHAPES[shape]}
        stops={[[0, color, from], [0.72, color, to], [1, color, to]]}
      />
    </Animated.View>
  );
}

function Background() {
  const still = useReduceMotion();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={G.background} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {BG_BLOBS.map((b, i) => (
        <Blob key={i} {...b} still={still} />
      ))}
    </View>
  );
}

// Every screen: gradient background with blobs, then a top bar with "‹ Home" on the left
// (or another link, such as "Menu" on Home) and an optional action on the right.
// centered: the text block sits in the middle, slightly above the exact centre
// (screens 08 to 12 and 15 in Figma).
function Screen({ children, onBack, left, right, centered = false, footer, scroll = true }) {
  const Body = scroll ? ScrollView : View;
  const bodyStyle = [styles.content, centered && (footer ? styles.centeredWithFooter : styles.centered)];
  return (
    <View style={styles.screen}>
      <Background />
      <View style={styles.topBar}>
        {left ||
          (onBack ? (
            <Pressable onPress={onBack} hitSlop={8}>
              <Text style={styles.backText}>‹ Home</Text>
            </Pressable>
          ) : (
            <View />
          ))}
        {right || null}
      </View>
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? bodyStyle : undefined}
      >
        {scroll ? children : <View style={bodyStyle}>{children}</View>}
      </Body>
      {/* footer: buttons at the bottom of the screen (S5, S6, S7, S8; feedback of 26 Nov) */}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

// Fades its content in (used for the buttons that appear after the steps).
function FadeIn({ visible, children }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 500, useNativeDriver: true }).start();
  }, [visible, opacity]);
  return (
    <Animated.View style={{ opacity }} pointerEvents={visible ? 'auto' : 'none'}>
      {children}
    </Animated.View>
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
      <Title>{question}</Title>
      <BreathingBubble />
      <Animated.View style={[styles.bubbleGrid, styles.bubbleGrid2, { opacity: fade }]}>
        {GROUPS.map((g) => (
          <Bubble key={g.id} label={g.label} groupId={g.id} colors={g.colors} onPress={() => onPick(g.id)} />
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
      <Title>{TEXTS.specifyQuestion}</Title>
      <View style={styles.bubbleGrid}>
        {group.emotions.map((e) => (
          <Bubble key={e} label={e} groupId={group.id} colors={group.colors} size={100} fontSize={12} onPress={() => onPick(e)} />
        ))}
      </View>
      <Button label={TEXTS.specifySkip} kind="secondary" onPress={() => onPick(null)} />
    </>
  );
}

// Numbered practice steps (S6, S8), in pink. They appear one by one: the first after
// 0.5 s, then one every 1.5 s, each fading in and rising slightly. onDone runs after the
// last one. With "Reduce motion" on, all steps show at once.
const STEP_FIRST_MS = 500;
const STEP_EVERY_MS = 1500;

function StepLine({ text, delay, still }) {
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      v.setValue(1);
      return undefined;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 700, delay, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, delay, still]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Animated.Text style={[styles.body, styles.stepText, { opacity: v, transform: [{ translateY }] }]}>
      {text}
    </Animated.Text>
  );
}

function Steps({ steps = [], onDone }) {
  const still = useReduceMotion();
  useEffect(() => {
    if (!onDone) return undefined;
    if (still) {
      onDone();
      return undefined;
    }
    const timer = setTimeout(onDone, STEP_FIRST_MS + (steps.length - 1) * STEP_EVERY_MS + 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, steps]);
  return (
    <View style={{ alignSelf: 'stretch' }}>
      {steps.map((step, i) => (
        <StepLine key={`${i}-${step}`} text={`${i + 1}. ${step}`} delay={STEP_FIRST_MS + i * STEP_EVERY_MS} still={still} />
      ))}
    </View>
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

// One-line setting with a small − / + stepper (Settings: "Starting at", "Reminders stop at").
function InlineStepper({ label, value, onMinus, onPlus }) {
  return (
    <View style={styles.inlineStepper}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Pressable onPress={onMinus} style={styles.stepButtonSmall} hitSlop={6}>
        <Text style={styles.stepButtonText}>−</Text>
      </Pressable>
      <Text style={[styles.stepValue, { minWidth: 64, textAlign: 'center' }]}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepButtonSmall} hitSlop={6}>
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

// A row of options where one is selected (frequency).
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

// S9a: one scrolling picker row with day, hour and minute columns (24-hour time).
// The selected value sits in the highlighted band in the middle.
const WHEEL_ROW = 40;
const WHEEL_VISIBLE = 5; // odd number: the middle row is the selected one
const REMINDER_DAYS = 60; // days offered from today

function WheelColumn({ items, index, onChange, flex = 1 }) {
  const ref = useRef(null);
  const settle = (y) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / WHEEL_ROW)));
    if (i !== index) onChange(i);
  };
  return (
    <ScrollView
      ref={ref}
      style={{ flex, height: WHEEL_ROW * WHEEL_VISIBLE }}
      contentContainerStyle={{ paddingVertical: WHEEL_ROW * ((WHEEL_VISIBLE - 1) / 2) }}
      contentOffset={{ x: 0, y: index * WHEEL_ROW }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ROW}
      decelerationRate="fast"
      nestedScrollEnabled
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => {
        if (Math.abs(e.nativeEvent.velocity?.y || 0) < 0.05) settle(e.nativeEvent.contentOffset.y);
      }}
    >
      {items.map((label, i) => (
        <Pressable
          key={`${label}-${i}`}
          style={styles.wheelRow}
          onPress={() => {
            ref.current?.scrollTo({ y: i * WHEEL_ROW, animated: true });
            onChange(i);
          }}
        >
          <Text
            style={[
              styles.wheelText,
              i === index && styles.wheelTextSelected,
              { opacity: i === index ? 1 : Math.abs(i - index) === 1 ? 0.6 : 0.35 },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ReminderPicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: REMINDER_DAYS }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const valueDay = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const dayIndex = Math.max(0, Math.min(REMINDER_DAYS - 1, Math.round((valueDay - today) / (24 * 3600 * 1000))));
  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));

  const set = (patch) => {
    const day = days[patch.day ?? dayIndex];
    const d = new Date(day);
    d.setHours(patch.hour ?? value.getHours(), patch.minute ?? value.getMinutes(), 0, 0);
    onChange(d);
  };

  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.wheelBand} />
      <WheelColumn
        flex={1.6}
        items={days.map((d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`)}
        index={dayIndex}
        onChange={(i) => set({ day: i })}
      />
      <WheelColumn items={hours} index={value.getHours()} onChange={(i) => set({ hour: i })} />
      <WheelColumn
        items={minutes}
        index={Math.round(value.getMinutes() / 5) % 12}
        onChange={(i) => set({ minute: i * 5 })}
      />
    </View>
  );
}

// S13: Mood tracker (feedback of 26 Nov). Calendar coloured by consistency: light pink for
// consistent days (3 or more check-ins), dark berry for 1 or 2, empty otherwise. Below, one
// row per day with check-ins (most recent first) that opens to show that day's check-ins.
const formatDay = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

function MoodTracker({ checkins }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [open, setOpen] = useState(() => ({ [dayKey(new Date())]: true }));
  const [emptyDay, setEmptyDay] = useState(null);

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

  const daysWithCheckins = cells
    .filter((d) => d && byDay[dayKey(d)])
    .sort((a, b) => b - a);

  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <>
      <Title>{TEXTS.trackerTitle}</Title>
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
          const count = (byDay[k] || []).length;
          const consistent = count >= CONSISTENT_DAY_CHECKINS;
          return (
            <Pressable
              key={k}
              onPress={() => {
                if (count) {
                  setEmptyDay(null);
                  setOpen((o) => ({ ...o, [k]: true }));
                } else {
                  setEmptyDay(k);
                }
              }}
              style={styles.calendarCell}
            >
              <View
                style={[
                  styles.calendarDot,
                  { backgroundColor: consistent ? C.consistent : count ? C.inconsistent : C.surfaceSoft },
                  (open[k] && count) || emptyDay === k ? styles.calendarSelected : null,
                ]}
              >
                <Text style={[styles.calendarDay, consistent && { color: C.onConsistent }]}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendSwatch, { backgroundColor: C.consistent }]} />
        <Text style={styles.small}>{TEXTS.consistentDay}</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendSwatch, { backgroundColor: C.inconsistent }]} />
        <Text style={styles.small}>{TEXTS.inconsistentDay}</Text>
      </View>
      {emptyDay ? <Text style={[styles.body, { marginTop: 12 }]}>{TEXTS.noCheckin}</Text> : null}
      <View style={{ marginTop: 12 }}>
        {daysWithCheckins.map((date) => {
          const k = dayKey(date);
          const entries = byDay[k].slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return (
            <View key={k}>
              <Pressable onPress={() => toggle(k)} style={styles.menuRow}>
                <Text style={[styles.menuText, { flex: 1 }]}>
                  {formatDay(date)} · {entries.length} check-in{entries.length === 1 ? '' : 's'}
                  {entries.length >= CONSISTENT_DAY_CHECKINS ? ' ✓' : ''}
                </Text>
                <Text style={styles.chevron}>{open[k] ? '⌄' : '›'}</Text>
              </Pressable>
              {open[k]
                ? entries.map((c) => (
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
                : null}
            </View>
          );
        })}
      </View>
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
  const [notifMessage, setNotifMessage] = useState('');
  // Which practice's steps have finished appearing (S6, S8), so the buttons can show
  const [stepsDoneFor, setStepsDoneFor] = useState(null);
  const [splashTimeUp, setSplashTimeUp] = useState(false);
  const splashFade = useRef(new Animated.Value(0)).current;

  const checkinsRef = useRef([]);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const handledResponses = useRef(new Set());

  const t = (event, properties) => track(settingsRef.current.analyticsId, event, properties);

  // ----- E1 Loading screen: about 2 seconds at each opening -----
  useEffect(() => {
    Animated.timing(splashFade, { toValue: 1, duration: 900, useNativeDriver: true }).start();
    const timer = setTimeout(() => setSplashTimeUp(true), 2000);
    return () => clearTimeout(timer);
  }, [splashFade]);

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
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
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
    setNotifMessage('');
    if (value) {
      const ok = await askPermission();
      if (!ok) {
        // iOS refuses: notifications are off for this app in the iPhone settings
        setNotifMessage(TEXTS.notificationsBlocked);
        return;
      }
      await updateAndReplan({ notificationsOn: true });
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
      updateSettings({ notificationsOn: false, reminder: null, randomPlan: [] });
    }
  };

  const openPhoneSettings = () => {
    Linking.openSettings().catch(() => {});
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

  const goHome = () => {
    setSession({});
    setMessage('');
    setScreen('home');
  };

  if (!loaded || !splashTimeUp) {
    return (
      <>
        <StatusBar style="light" />
        <View style={styles.screen}>
          <Background />
          <View style={styles.splash}>
            <Animated.Text style={[styles.splashTitle, { opacity: splashFade }]}>{APP_NAME}</Animated.Text>
          </View>
        </View>
      </>
    );
  }

  const group = session.group ? groupById(session.group) : null;
  let body = null;

  switch (screen) {
    // S0 Welcome and short presentation of the method
    case 'welcome':
      body = (
        <Screen centered>
          <Title>{TEXTS.welcomeTitle}</Title>
          <Text style={[styles.body, styles.center]}>{TEXTS.welcomeBody}</Text>
          <Text style={[styles.subtitle, { marginTop: 16 }]}>{TEXTS.methodTitle}</Text>
          {TEXTS.methodSteps.map((step, i) => (
            <Text key={i} style={styles.body}>{`${i + 1}. ${step}`}</Text>
          ))}
          <View style={{ height: 16 }} />
          <Button label={TEXTS.welcomeButton} onPress={() => setScreen('permission')} />
        </Screen>
      );
      break;

    // S0a Notification permission request → S0b
    case 'permission':
      body = (
        <Screen centered>
          <Title>{TEXTS.permissionTitle}</Title>
          <Text style={[styles.body, styles.center, { marginBottom: 16 }]}>{TEXTS.permissionBody}</Text>
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
        <Screen centered>
          <Title small>{TEXTS.frequencyTitle}</Title>
          <Text style={[styles.body, styles.center]}>{TEXTS.frequencyBody}</Text>
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

    // S1 Home (Round 3): "Menu" link on the left, the bubble at the same height as the
    // check-in bubble, and the prompt as the only text.
    case 'home':
      body = (
        <Screen
          left={
            <Pressable onPress={() => setScreen('menu')} hitSlop={8}>
              <Text style={styles.backText}>{TEXTS.menuLink}</Text>
            </Pressable>
          }
        >
          <View style={styles.titleSpace} />
          <Pressable onPress={() => { setSession({ source: 'home' }); setScreen('checkin'); }}>
            <BreathingBubble />
          </Pressable>
          <Text style={[styles.body, styles.center]}>{TEXTS.homeTap}</Text>
        </Screen>
      );
      break;

    // S19 Menu: Mood tracker, Journaling, Vision board, Settings
    case 'menu':
      body = (
        <Screen onBack={goHome}>
          <Title>{TEXTS.menuTitle}</Title>
          <View style={{ marginTop: 8 }}>
            {[
              { label: TEXTS.menuTracker, onPress: () => setScreen('tracker') },
              { label: TEXTS.menuJournaling, soon: true },
              { label: TEXTS.menuVisionBoard, soon: true },
              { label: TEXTS.menuSettings, onPress: () => { setMessage(''); setNotifMessage(''); setScreen('settings'); } },
            ].map((item) => (
              <Pressable
                key={item.label}
                disabled={item.soon}
                onPress={item.onPress}
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, item.soon && { opacity: 0.5 }]}>{item.label}</Text>
                  {item.soon ? <Text style={styles.small}>{TEXTS.menuSoon}</Text> : null}
                </View>
                {item.soon ? null : <Text style={styles.chevron}>›</Text>}
              </Pressable>
            ))}
          </View>
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

    // S5 Question, then explanation (title above the text, 20 November 2026)
    case 'explain': {
      const chooseQuick = () => {
        // S6 + ⚙️ Save the check-in (date/time, emotion group, emotion)
        // One "under 1 min" practice, at random, never the same as the last one shown
        const list = TECHNIQUES[session.group].under1;
        const fresh = list.filter((x) => x.name !== settingsRef.current.lastQuick);
        const quick = pickRandom(fresh.length ? fresh : list, 1)[0];
        updateSettings({ lastQuick: quick.name });
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
      };
      body = (
        <Screen
          onBack={goHome}
          centered
          footer={
            <>
              <Button label={TEXTS.answerNope} kind="secondary" onPress={chooseQuick} />
              <Button label={TEXTS.answerYes} onPress={() => setScreen('time')} />
            </>
          }
        >
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {group.label}
              {session.emotion ? ` · ${session.emotion}` : ''}
            </Text>
          </View>
          <Title>{group.question}</Title>
          <Text style={[styles.body, styles.center]}>{group.explanation}</Text>
        </Screen>
      );
      break;
    }

    // S6 Suggest a technique from "under 1 min"
    case 'quick':
      body = (
        <Screen
          onBack={goHome}
          centered
          footer={
            <FadeIn visible={stepsDoneFor === `${screen}-${session.recordId}`}>
              <Button label={TEXTS.quickContinue} onPress={() => setScreen('reminderAsk')} />
            </FadeIn>
          }
        >
          <Text style={[styles.body, styles.center]}>{TEXTS.quickIntro}</Text>
          <Title>{session.technique.name}</Title>
          <Steps steps={session.technique.steps} onDone={() => setStepsDoneFor(`${screen}-${session.recordId}`)} />
        </Screen>
      );
      break;

    // S9 Do you want to set up a reminder for the next session?
    case 'reminderAsk':
      body = (
        <Screen onBack={goHome} centered>
          <Title small>{TEXTS.reminderAsk}</Title>
          <Button label={TEXTS.yes} onPress={() => openReminder('home')} />
          <Button label={TEXTS.no} kind="secondary" onPress={goHome} />
        </Screen>
      );
      break;

    // S7 How much time do you have?
    case 'time':
      body = (
        <Screen
          onBack={goHome}
          centered
          footer={[
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
        >
          <Title>{TEXTS.timeQuestion}</Title>
        </Screen>
      );
      break;

    // S8a Technique options
    case 'options':
      body = (
        <Screen onBack={goHome} centered>
          <Title>{TEXTS.optionsTitle}</Title>
          {session.options.map((tech) => (
            <Pressable
              key={tech.name}
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
                  technique: tech.name,
                  timeChoice: session.timeChoice,
                  timerMinutes: minutes,
                  completed: null,
                });
                setSession((s) => ({ ...s, recordId: id, technique: tech, timerMinutes: minutes, timerEndAt: null }));
                setScreen('technique');
              }}
            >
              <Text style={[styles.cardTitle, { marginBottom: 0, color: C.accent }]}>{tech.name}</Text>
            </Pressable>
          ))}
        </Screen>
      );
      break;

    // S8 Technique description with timer setup → Start
    case 'technique': {
      const remaining = session.timerEndAt ? (session.timerEndAt - now) / 1000 : session.timerMinutes * 60;
      body = session.timerEndAt ? (
        // S8b Timer running (Round 3): only the large timer and Stop
        <Screen centered>
          <Text style={styles.countdown}>{formatCountdown(remaining)}</Text>
          <Button label={TEXTS.timerStop} kind="secondary" onPress={stopTimer} />
        </Screen>
      ) : (
        <Screen
          onBack={goHome}
          centered
          footer={
            <FadeIn visible={stepsDoneFor === `${screen}-${session.recordId}`}>
              <Stepper
                value={`${session.timerMinutes} min`}
                label={TEXTS.timerLabel}
                onMinus={() => setSession((s) => ({ ...s, timerMinutes: Math.max(1, s.timerMinutes - 1) }))}
                onPlus={() => setSession((s) => ({ ...s, timerMinutes: Math.min(30, s.timerMinutes + 1) }))}
              />
              <Button label={TEXTS.timerStart} onPress={startTimer} />
            </FadeIn>
          }
        >
          <Title>{session.technique.name}</Title>
          <Steps steps={session.technique.steps} onDone={() => setStepsDoneFor(`${screen}-${session.recordId}`)} />
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
            kind="link"
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
        <Screen centered>
          <Text style={[styles.body, styles.center]}>{TEXTS.thanksBody}</Text>
          <Title small>{TEXTS.anotherSessionAsk}</Title>
          <Button label={TEXTS.yes} onPress={() => openReminder('home')} />
          <Button label={TEXTS.no} kind="secondary" onPress={goHome} />
        </Screen>
      );
      break;

    // S9a Set up a reminder (one-off, on a chosen date and time)
    case 'reminder':
      body = (
        <Screen onBack={goHome}>
          <Title>{TEXTS.reminderTitle}</Title>
          <ReminderPicker
            value={reminderDraft}
            onChange={(d) => {
              setReminderDraft(d);
              setMessage('');
            }}
          />
          {message ? <Text style={styles.warning}>{message}</Text> : null}
          <Button label={TEXTS.reminderSave} onPress={() => saveReminder()} />
          {CONFIG.showTestTools ? (
            <Button label={TEXTS.reminderTest} kind="link" onPress={() => saveReminder(10)} />
          ) : null}
          <Button label={TEXTS.reminderCancel} kind="secondary" onPress={() => setScreen(reminderReturn)} />
        </Screen>
      );
      break;

    // S12 Settings
    case 'settings':
      body = (
        <Screen onBack={goHome}>
          <Title>{TEXTS.menuSettings}</Title>

          <View style={styles.settingRow}>
            <Text style={styles.subtitle}>{TEXTS.settingsNotifications}</Text>
            <Switch trackColor={{ true: G.cta[0], false: C.line }} value={settings.notificationsOn} onValueChange={toggleNotifications} />
          </View>
          {notifMessage ? (
            <>
              <Text style={styles.warning}>{notifMessage}</Text>
              <Button label={TEXTS.settingsOpenPhoneSettings} kind="secondary" onPress={openPhoneSettings} />
            </>
          ) : null}

          <Text style={[styles.subtitle, { marginTop: 16 }]}>{TEXTS.settingsFrequency}</Text>
          <Text style={styles.small}>{TEXTS.settingsFrequencyNote}</Text>
          <Choice
            options={TEXTS.frequencyOptions.map((o) => ({ value: o.hours, label: o.label }))}
            value={settings.frequencyHours}
            onChange={(hours) => updateAndReplan({ frequencyHours: hours })}
          />
          {settings.frequencyHours ? (
            <InlineStepper
              label={TEXTS.settingsStartingAt}
              value={`${pad(settings.quietEnd)}:00`}
              onMinus={() => updateAndReplan({ quietEnd: Math.max(5, settings.quietEnd - 1) })}
              onPlus={() => updateAndReplan({ quietEnd: Math.min(12, settings.quietEnd + 1) })}
            />
          ) : null}

          <Text style={[styles.subtitle, { marginTop: 16 }]}>{TEXTS.settingsOneOff}</Text>
          <Text style={styles.body}>
            {settings.reminder ? formatReminder(settings.reminder.at) : TEXTS.settingsOneOffNone}
          </Text>
          <Button
            label={settings.reminder ? TEXTS.settingsOneOffChange : TEXTS.settingsOneOffSet}
            kind="secondary"
            onPress={() => openReminder('settings')}
          />
          {settings.reminder ? <Button label={TEXTS.settingsOneOffRemove} kind="link" onPress={removeReminder} /> : null}

          {settings.frequencyHours ? (
            <>
              <Text style={[styles.subtitle, { marginTop: 16 }]}>{TEXTS.settingsQuiet}</Text>
              <InlineStepper
                label={TEXTS.settingsStopAt}
                value={`${pad(settings.quietStart)}:00`}
                onMinus={() => updateAndReplan({ quietStart: Math.max(18, settings.quietStart - 1) })}
                onPlus={() => updateAndReplan({ quietStart: Math.min(23, settings.quietStart + 1) })}
              />
            </>
          ) : null}

          <View style={[styles.settingRow, { marginTop: 16 }]}>
            <Text style={styles.body}>{TEXTS.settingsSound}</Text>
            <Switch trackColor={{ true: G.cta[0], false: C.line }} value={settings.sound} onValueChange={(v) => updateAndReplan({ sound: v })} />
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.body}>{TEXTS.settingsVibration}</Text>
            <Switch trackColor={{ true: G.cta[0], false: C.line }} value={settings.vibration} onValueChange={(v) => updateSettings({ vibration: v })} />
          </View>

          <Text style={[styles.subtitle, { marginTop: 16 }]}>{TEXTS.settingsBeta}</Text>
          <Button label={TEXTS.feedbackButton} onPress={openFeedback} />
          {message ? <Text style={styles.warning}>{message}</Text> : null}

          {CONFIG.showTestTools ? (
            <>
              <Text style={[styles.subtitle, { marginTop: 32 }]}>For testing</Text>
              <Button label="Reset the app (deletes all data)" kind="link" onPress={resetApp} />
            </>
          ) : null}
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
      <StatusBar style="light" />
      {body}
    </>
  );
}

// ---------- Styles: berry graphic chart ("Mousse app flow", 25 November 2026) ----------

const C = {
  text: '#FBEFF2', // ink: titles and body
  accent: '#EFA7BA', // links, secondary text, highlights
  line: '#7A4357', // outlines and dividers
  onCta: '#FFF5F6', // text on the gradient buttons
  surface: 'rgba(239,167,186,0.12)', // cards
  surfaceStrong: 'rgba(239,167,186,0.14)', // tags, stepper buttons
  surfaceSoft: 'rgba(239,167,186,0.10)', // empty calendar days
  band: 'rgba(239,167,186,0.25)', // picker band, selected option
  picker: 'rgba(42,30,61,0.55)',
  warning: '#F4B6A6',
  consistent: '#EFA7BA', // mood tracker: consistent day (3 or more check-ins)
  onConsistent: '#3A2B52', // day number on a consistent day
  inconsistent: '#72294A', // mood tracker: 1 or 2 check-ins
};

// Gradients
const G = {
  background: ['#3A2B52', '#42323C', '#3A2A20'], // purple to chocolate, top to bottom
  mainBubble: ['#B86A88', '#963F62', '#72294A'],
  cta: ['#B0587A', '#8F3A5E'],
};

// Fonts: titles use a serif (the chart uses Newsreader; Georgia is built into iOS and is
// the chart's fallback), everything else the system sans serif (the chart uses Inter).
const SERIF = 'Georgia';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: G.background[1], paddingTop: 56 },
  content: { paddingHorizontal: 28, paddingBottom: 48 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, minHeight: 36,
  },
  backText: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: C.accent },
  // Type scale: titles serif Regular 24/32; second phrase of a title, body: Regular 16/24;
  // card and section titles Semi Bold 16; small text Regular 14.
  title: {
    fontFamily: SERIF, fontSize: 24, lineHeight: 32, fontWeight: '400', color: C.text,
    marginTop: 24, marginBottom: 8, textAlign: 'center',
  },
  titleSmallSize: { fontSize: 20, lineHeight: 28 },
  subtitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: C.text, marginTop: 8, marginBottom: 4 },
  titleSpace: { height: 88 }, // height of a two-line title, so the Home bubble sits where the check-in bubble is
  body: { fontSize: 16, lineHeight: 24, color: C.text, marginVertical: 6 },
  center: { textAlign: 'center' },
  small: { fontSize: 14, lineHeight: 20, color: C.accent },
  warning: { fontSize: 14, lineHeight: 20, color: C.warning, marginVertical: 8 },
  link: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: C.accent },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  menuText: { fontSize: 16, lineHeight: 24, color: C.text },
  chevron: { fontSize: 22, color: C.text, marginLeft: 12 },
  buttonWrap: { marginVertical: 6, borderRadius: 999 },
  button: { height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { color: C.onCta, fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    height: 56, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginVertical: 6,
  },
  buttonTextSecondary: { color: C.text, fontSize: 16 },
  buttonLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  buttonTextLink: { color: C.accent, fontSize: 16 },
  bubbleGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 16 },
  bubbleGrid2: { rowGap: 18, columnGap: 20 },
  bubbleShadow: {
    shadowColor: '#0A0514', shadowOpacity: 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  bubble: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 },
  bubbleText: { color: C.text, fontWeight: '600', textAlign: 'center' },
  tag: {
    alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 8,
    backgroundColor: C.surfaceStrong,
  },
  tagText: { color: C.accent, fontSize: 14 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, marginVertical: 6 },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: C.text, marginBottom: 4 },
  countdown: {
    fontSize: 96, lineHeight: 112, fontWeight: '400', textAlign: 'center', color: C.text, letterSpacing: -2,
    marginBottom: 24, fontVariant: ['tabular-nums'],
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 12, gap: 14 },
  stepButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center',
  },
  stepButtonText: { fontSize: 20, color: C.text },
  stepValue: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: C.text },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthNav: { fontSize: 28, color: C.accent, paddingHorizontal: 12 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarHead: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 13, fontWeight: '600', color: C.accent, marginBottom: 6 },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDot: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wheel: {
    flexDirection: 'row', backgroundColor: C.picker, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: C.line, marginVertical: 8, paddingHorizontal: 8,
  },
  wheelBand: {
    position: 'absolute', left: 8, right: 8, top: WHEEL_ROW * ((WHEEL_VISIBLE - 1) / 2), height: WHEEL_ROW,
    backgroundColor: C.band, borderRadius: 10,
  },
  wheelRow: { height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 16, color: C.text, fontVariant: ['tabular-nums'] },
  wheelTextSelected: { fontWeight: '600' },
  centered: { flexGrow: 1, justifyContent: 'center', paddingBottom: 120 },
  centeredWithFooter: { flexGrow: 1, justifyContent: 'center', paddingBottom: 24 },
  footer: { paddingHorizontal: 28, paddingBottom: 48, paddingTop: 8 },
  stepText: { color: C.accent },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashTitle: { fontFamily: SERIF, fontSize: 44, lineHeight: 52, color: C.text },
  inlineStepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  stepButtonSmall: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  calendarSelected: { borderWidth: 2, borderColor: C.accent },
  calendarDay: { color: C.text, fontSize: 14, fontWeight: '600' },
  entry: { backgroundColor: C.surface, borderRadius: 16, padding: 20, marginVertical: 6 },
  entryTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: C.text },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8, justifyContent: 'center' },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  choiceSelected: { backgroundColor: C.band, borderColor: C.accent },
  choiceText: { color: C.text, fontSize: 15 },
  choiceTextSelected: { fontWeight: '600' },
});
