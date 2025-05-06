"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
interface NewHabitInput {
  name: string;
  unit: string;
  goal: number;
  healthyIfLess: boolean;
}

interface DayEntry {
  id: string;
  day: string;
  value: number;
}
interface Habit {
  id: string;
  name: string;
  unit: string;
  goal: number;
  current: number;
  streak: number;
  maxStreak: number;
  history: DayEntry[];
  chartType: "line" | "bar" | "pie";
  logs: DailyLog[];
  healthyIfLess?: boolean;
}
interface DailyLog {
  id: string;
  habitId: string;
  date: string;
  day: string;
  value: number;
  notes: string;
  timestamp: number;
}

interface SummaryModalProps {
  dark: boolean;           
  habits: Habit[];
  pastWeeks: Record<string, DayEntry[][]>;
  onClose: () => void;
}

interface DailyLogModalProps {
  dark: boolean;
  habit: Habit;
  log: DailyLog;
  onClose: () => void;
  onSave: (log: DailyLog) => void;
}

interface LogDetailsProps {
  dark: boolean;
  habit: Habit;
  onClose: () => void;
  onEditLog: (log: DailyLog) => void;
}

interface EditGoalModalProps {
  dark: boolean;
  editingGoal: { habitId: string; goal: number };
  setEditingGoal: (v: null) => void;
  onUpdateGoal: (habitId: string, newGoal: number) => void;
}
interface NavProps {
  dark: boolean;
  setDark: (dark: boolean) => void;
  view: "landing" | "dashboard";
  setView: (view: "landing" | "dashboard") => void;
  setAddOpen: (open: boolean) => void;
  setSummaryOpen: (open: boolean) => void;
  emailReminderEnabled: boolean;
  setEmailReminderEnabled: (
    enabled: boolean | ((prev: boolean) => boolean)
  ) => void;
}
interface DashboardProps {
  dark: boolean;
  habits: Habit[];
  updateSlider: (hid: string, v: number) => void;
  changeChart: (hid: string, t: "line" | "bar" | "pie") => void;
  openDayModal: (day: { hid: string; day: string; val: number }) => void;
  getNextEditableDay: (habit: Habit) => string | null;
  currentDayIndex: number;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  toast: (msg: string) => void;
  setPastWeeks: React.Dispatch<
    React.SetStateAction<Record<string, DayEntry[][]>>
  >;
  setDayOpen: React.Dispatch<
    React.SetStateAction<null | {
      hid: string;
      day: string;
      val: number;
    }>
  >;
  setLogDetailsOpen: React.Dispatch<React.SetStateAction<null | string>>;
  editingGoal: null | {
    habitId: string;
    goal: number;
  };
  setEditingGoal: (v: { habitId: string; goal: number } | null) => void;

  setEditingLog: React.Dispatch<React.SetStateAction<DailyLog | null>>;
}
interface LandingProps {
  onStart: () => void;
}
interface AddHabitModalProps {
  dark: boolean;
  newHabit: NewHabitInput;
  setNewHabit: React.Dispatch<React.SetStateAction<NewHabitInput>>;
  onClose: () => void;
  onCreate: () => void;
}
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const getDayIndex = (day: string) => WEEK.findIndex((d) => d === day);

const COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#8b5cf6",
];

const today = () =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
const generateId = () => Math.random().toString(36).substring(2, 11); // 9-character random ID
const emptyWeek = () =>
  WEEK.map((d) => ({ id: generateId(), day: d, value: 0 }));
const sortByWeek = (a: DayEntry, b: DayEntry): number => {
  const dayA = a.day as (typeof WEEK)[number];
  const dayB = b.day as (typeof WEEK)[number];
  return WEEK.indexOf(dayA) - WEEK.indexOf(dayB);
};
// ────────────────────────────────────────────────────────────────────
// ─────────── STREAK HELPERS ───────────

// 1️⃣  Does today’s value count toward the streak?
 const meetsGoal = (
  value: number,
  goal: number,
  healthyIfLess: boolean
): boolean => {
  if (healthyIfLess) {
    // “0” means “no data yet,” not a successful ≤-goal day
    if (value === 0) return false;
    return value <= goal;
  } else {
    // for “healthy if more” habits, zero always fails
    if (value === 0 && goal > 0) return false;
    return value >= goal;
  }
};

// 2️⃣  Fast lookup table so we don’t .find() every loop
const dayValueMap = (history: DayEntry[]) => {
  console.log(history.map((h) => console.log(h.day, h.value)));
  return new Map(history.map((h) => [h.day, h.value]));
};

/**
 * 3️⃣  Count consecutive *good* days, walking backwards from today.
 *      • Healthy-If-Less  (e.g. “screen time ≤ 4 h”) → good when value ≤ goal
 *      • Healthy-If-More  (e.g. “water ≥ 2 000 ml”) → good when value ≥ goal
 *      Any miss (value === 0 or fails rule) resets the streak.
 */
 function calculateMaxStreak(
  history: DayEntry[],
  goal: number,
  healthyIfLess: boolean
): number {
  const values = dayValueMap(history);
  let maxRun = 0;
  let currentRun = 0;

  // Walk forwards through the week
  for (let i = 0; i < WEEK.length; i++) {
    const dayName = WEEK[i];
    const val = values.get(dayName) ?? 0;

    if (meetsGoal(val, goal, healthyIfLess)) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  return maxRun;
}

function calculateStreak(
  history: DayEntry[],
  goal: number,
  healthyIfLess: boolean,
  entryIndex: number
): number {
  const values = dayValueMap(history);
  let streak = 0;

  // 🔄 1)  BACKWARDS loop chalayen (today → Monday)
  for (let i = entryIndex; i >= 0; i--) {
    const dayName = WEEK[i];
    const value = values.get(dayName) ?? 0;

    // 🔄 2)  Fail  milte hi **break** kar dein, reset mat kijiye
    if (!meetsGoal(value, goal, healthyIfLess)) break;

    streak++; // good day ⇒ streak badhāo
  }

  return streak;
}

// ────────────────────────────────────────────────────────────────────
// Water Intake logs (habitId = "h1")
const WATER_LOGS: DailyLog[] = [
  {
    id: "h1-log-1",
    habitId: "h1",
    date: "2025-05-05T20:00:00.000Z",
    day: "Mon",
    value: 1800,
    notes: "Had 500 ml before & after workout",
    timestamp: 1714968000000,
  },
  {
    id: "h1-log-2",
    habitId: "h1",
    date: "2025-05-06T20:00:00.000Z",
    day: "Tue",
    value: 2000,
    notes: "Felt great—hit my target",
    timestamp: 1715054400000,
  },
  {
    id: "h1-log-3",
    habitId: "h1",
    date: "2025-05-07T20:00:00.000Z",
    day: "Wed",
    value: 1900,
    notes: "Missed one glass at lunch",
    timestamp: 1715140800000,
  },
  {
    id: "h1-log-4",
    habitId: "h1",
    date: "2025-05-08T20:00:00.000Z",
    day: "Thu",
    value: 2100,
    notes: "Drank extra on a hot day",
    timestamp: 1715227200000,
  },
  {
    id: "h1-log-5",
    habitId: "h1",
    date: "2025-05-09T20:00:00.000Z",
    day: "Fri",
    value: 2000,
    notes: "On point",
    timestamp: 1715313600000,
  },
  {
    id: "h1-log-6",
    habitId: "h1",
    date: "2025-05-10T20:00:00.000Z",
    day: "Sat",
    value: 1600,
    notes: "Busy day, forgot a couple glasses",
    timestamp: 1715400000000,
  },
  {
    id: "h1-log-7",
    habitId: "h1",
    date: "2025-05-11T20:00:00.000Z",
    day: "Sun",
    value: 750,
    notes: "Lazy Sunday—need to drink more!",
    timestamp: 1715486400000,
  },
];

// Screen Time logs (habitId = "h2")
const SCREEN_LOGS: DailyLog[] = [
  {
    id: "h2-log-1",
    habitId: "h2",
    date: "2025-05-05T22:00:00.000Z",
    day: "Mon",
    value: 3,
    notes: "Watched Netflix",
    timestamp: 1714975200000,
  },
  {
    id: "h2-log-2",
    habitId: "h2",
    date: "2025-05-06T22:30:00.000Z",
    day: "Tue",
    value: 4,
    notes: "Work + gaming",
    timestamp: 1715062200000,
  },
  {
    id: "h2-log-3",
    habitId: "h2",
    date: "2025-05-07T21:00:00.000Z",
    day: "Wed",
    value: 2,
    notes: "Only did evening scroll",
    timestamp: 1715149200000,
  },
  {
    id: "h2-log-4",
    habitId: "h2",
    date: "2025-05-08T23:00:00.000Z",
    day: "Thu",
    value: 5,
    notes: "Binge-watched a new series",
    timestamp: 1715235600000,
  },
  {
    id: "h2-log-5",
    habitId: "h2",
    date: "2025-05-09T21:30:00.000Z",
    day: "Fri",
    value: 4,
    notes: "Mixed work & fun",
    timestamp: 1715321400000,
  },
  {
    id: "h2-log-6",
    habitId: "h2",
    date: "2025-05-10T20:30:00.000Z",
    day: "Sat",
    value: 1,
    notes: "Only 1 hr scrolling",
    timestamp: 1715409000000,
  },
  {
    id: "h2-log-7",
    habitId: "h2",
    date: "2025-05-11T21:00:00.000Z",
    day: "Sun",
    value: 3,
    notes: "Video call + social media",
    timestamp: 1715494800000,
  },
];

const MOCK_HABITS: Habit[] = [
  {
    id: "h1",
    name: "Water Intake",
    unit: "ml",
    goal: 2000,
    current: 1800,
    healthyIfLess: false,
    streak: 5,
    maxStreak: 5,
    history: [
      { id: "h1-1", day: "Mon", value: 1800 },
      { id: "h1-2", day: "Tue", value: 2000 },
      { id: "h1-3", day: "Wed", value: 1900 },
      { id: "h1-4", day: "Thu", value: 2100 },
      { id: "h1-5", day: "Fri", value: 2000 },
      { id: "h1-6", day: "Sat", value: 1600 },
      { id: "h1-7", day: "Sun", value: 750 },
    ],
    chartType: "bar",
    logs: WATER_LOGS,
  },
  {
    id: "h2",
    name: "Screen Time",
    unit: "hours",
    goal: 4,
    current: 3,
    streak: 2,
    maxStreak: 5,
    healthyIfLess: true,
    history: [
      { id: "h2-1", day: "Mon", value: 3 },
      { id: "h2-2", day: "Tue", value: 4 },
      { id: "h2-3", day: "Wed", value: 2 },
      { id: "h2-4", day: "Thu", value: 5 },
      { id: "h2-5", day: "Fri", value: 4 },
      { id: "h2-6", day: "Sat", value: 1 },
      { id: "h2-7", day: "Sun", value: 3 },
    ],
    chartType: "line",
    logs: SCREEN_LOGS,
  },
];

export default function HabitFlow() {
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [habits, setHabits] = useState<Habit[]>(() =>
    MOCK_HABITS.map(h => {
      // 1) find the last day they logged >0
      const filled = h.history.filter(d => d.value > 0);
      const lastDay = filled.length > 0 ? filled[filled.length-1].day : today();
      const entryIndex = getDayIndex(lastDay);
  
      return {
        ...h,
        // 2) calculate both streaks using that index
        streak: calculateStreak(h.history, h.goal, !!h.healthyIfLess, entryIndex),
        maxStreak: calculateMaxStreak(h.history, h.goal, !!h.healthyIfLess),
      };
    })
  );
  

  const [toasts, setToasts] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [logDetailsOpen, setLogDetailsOpen] = useState<null | string>(null);
  const [editingLog, setEditingLog] = useState<null | DailyLog>(null);
  const [editingGoal, setEditingGoal] = useState<null | {
    habitId: string;
    goal: number;
  }>(null);
  const [emailReminderEnabled, setEmailReminderEnabled] =
    useState<boolean>(false);

  const handleViewLogs = (habitId: string) => {
    setLogDetailsOpen(habitId);
  };

  const handleEditLog = (log: DailyLog) => {
    setEditingLog(log);
  };

  const [newHabit, setNewHabit] = useState<NewHabitInput>({
    name: "",
    unit: "hours",
    goal: 8,
    healthyIfLess: false, // ← default
  });
  const [dayOpen, setDayOpen] = useState<null | {
    hid: string;
    day: string;
    val: number;
  }>(null);
  const [logModalOpen, setLogModalOpen] = useState<null | {
    habitId: string;
    day: string;
    value: number;
    notes: string;
  }>(null);
  const handleAddLog = (habitId: string, day: string) => {
    setLogModalOpen({
      habitId,
      day,
      value: 0,
      notes: "",
    });
  };

  const handleSaveLog = (log: {
    day: string;
    value: number;
    notes: string;
  }) => {
    if (!logModalOpen) return;
    const { habitId, day, value, notes } = { ...logModalOpen, ...log };

    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;

        const newHistory = h.history.map((d) =>
          d.day === day ? { ...d, value } : d
        );
        const entryIndex = getDayIndex(day);
        const newMax = calculateMaxStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess
        );
        const newStreak = calculateStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess,
          entryIndex
        );
        console.log(
          h.name,
          newHistory.map((d) => `${d.day}:${d.value}`),
          "streak→",
          newStreak
        );

        return {
          ...h,
          history: newHistory,
          streak: newStreak,
          maxStreak: newMax,
          logs: [
            ...h.logs,
            {
              id: generateId(),
              habitId,
              date: new Date().toISOString(),
              day,
              value,
              notes,
              timestamp: Date.now(),
            },
          ],
        };
      })
    );

    toast("📝 Log saved successfully");
    setLogModalOpen(null);
  };

  const handleUpdateGoal = (habitId: string, newGoal: number) => {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
  
        // recalc streak & maxStreak with the new goal
        const newStreak = calculateStreak(
          h.history,
          newGoal,
          !!h.healthyIfLess,
          currentDayIndex
        );
        const newMax = calculateMaxStreak(
          h.history,
          newGoal,
          !!h.healthyIfLess
        );
  
        return {
          ...h,
          goal: newGoal,
          streak: newStreak,
          maxStreak: newMax,
        };
      })
    );
    toast("🎯 Goal updated successfully");
  };
  

  const handleUpdateLog = (updates: {
    day: string;
    value: number;
    notes: string;
  }) => {
    if (!editingLog) return;

    const updatedLog: DailyLog = {
      ...editingLog,
      day: updates.day,
      value: updates.value,
      notes: updates.notes,
      timestamp: Date.now(),
    };

    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== updatedLog.habitId) return h;

        const newHistory = h.history.map((d) =>
          d.day === updatedLog.day ? { ...d, value: updatedLog.value } : d
        );
        const entryIndex = getDayIndex(updatedLog.day);
        const newMax = calculateMaxStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess
        );
        const newStreak = calculateStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess,
          entryIndex
        );

        return {
          ...h,
          history: newHistory,
          streak: newStreak,
          maxStreak: newMax,
          logs: h.logs.map((l) => (l.id === updatedLog.id ? updatedLog : l)),
        };
      })
    );

    toast("📝 Log updated successfully");
    setEditingLog(null);
  };

  const [pastWeeks, setPastWeeks] = useState<Record<string, DayEntry[][]>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  useEffect(() => {
    const todayName = today();
    const dayIndex = WEEK.findIndex((day) => day === todayName);
    setCurrentDayIndex(dayIndex >= 0 ? dayIndex : 0);
  }, []);
 /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // only recalc once the user has interacted
    if (habits.some(h => h.logs.length > 0)) {
      setHabits(prev =>
        prev.map(h => ({
          ...h,
          streak: calculateStreak(
            h.history,
            h.goal,
            !!h.healthyIfLess,
            currentDayIndex
          ),
          maxStreak: calculateMaxStreak(
            h.history,
            h.goal,
            !!h.healthyIfLess
          ),
        }))
      );
    }
  }, [currentDayIndex]);
  

  const toast = useCallback((msg: string) => {
    setToasts((p) => [msg, ...p.slice(0, 2)]);
    setTimeout(() => setToasts((p) => p.slice(0, -1)), 3000);
  }, []);

  const createHabit = () => {
    if (!newHabit.name.trim()) return;

    // 1. initialize empty week
    const initialHistory = emptyWeek();

    // 2. compute its very first streak
    const initialStreak = calculateStreak(
      initialHistory,
      newHabit.goal,
      newHabit.healthyIfLess,
      currentDayIndex
    );

    // 3. add the new habit
    setHabits((prev) => [
      ...prev,
      {
        id: generateId(),
        name: newHabit.name.trim(),
        unit: newHabit.unit,
        goal: newHabit.goal,
        current: 0,
        streak: initialStreak,
        maxStreak: initialStreak,
        history: initialHistory,
        chartType: "line",
        logs: [],
        healthyIfLess: newHabit.healthyIfLess,
      },
    ]);

    toast(`✅ "${newHabit.name.trim()}" added`);
    setAddOpen(false);
    setNewHabit({ name: "", unit: "hours", goal: 8, healthyIfLess: false });
  };

  const saveDay = (hid: string, day: string, val: number) => {
    const todayName = today();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== hid) return h;

        // 1) updated history
        const newHistory = [
          ...h.history.filter((d) => d.day !== day),
          { id: generateId(), day, value: val },
        ].sort(sortByWeek);

        // 2) recalc streak
        const entryIndex = getDayIndex(day);
        const newMax = calculateMaxStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess
        );
        const newStreak = calculateStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess,
          entryIndex
        );

        // 3) return updated habit
        return {
          ...h,
          history: newHistory,
          streak: newStreak,
          maxStreak: newMax,
          current: day === todayName ? val : h.current,
          logs: [
            ...h.logs,
            {
              id: generateId(),
              habitId: hid,
              date: new Date().toISOString(),
              day,
              value: val,
              notes: "",
              timestamp: Date.now(),
            },
          ],
        };
      })
    );

    toast(`📝 ${day} saved`);
    setDayOpen(null);
  };

  const updateSlider = (hid: string, v: number) => {
    const todayName = today();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== hid) return h;
  
        // 1) overwrite today's entry
        const newHistory = h.history.map((d) =>
          d.day === todayName ? { ...d, value: v } : d
        );
  
        // 2) recalc both streak & maxStreak
        const newStreak = calculateStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess,
          currentDayIndex
        );
        const newMax = calculateMaxStreak(
          newHistory,
          h.goal,
          !!h.healthyIfLess
        );
  
        return {
          ...h,
          history: newHistory,
          streak: newStreak,
          maxStreak: newMax,
          current: v,
        };
      })
    );
  
    toast("📝 Today's value updated");
  };
  

  const changeChart = (hid: string, t: "line" | "bar" | "pie") =>
    setHabits((p) => p.map((h) => (h.id === hid ? { ...h, chartType: t } : h)));

  const getNextEditableDay = (habit: Habit) => {
    // Find the first day with zero value in the week order
    for (const day of WEEK) {
      const entry = habit.history.find((d) => d.day === day);
      if (!entry || entry.value === 0) {
        return day;
      }
    }
    return null; // all days completed
  };

  return (
    <div className={dark ? "dark" : ""}>
      <div
        className={`min-h-screen bg-gradient-to-br ${
          dark
            ? "from-slate-900 via-gray-900 to-black text-gray-100"
            : "from-slate-50 via-gray-50 to-white text-gray-900"
        }`}
      >
        {view === "dashboard" && (
          <Nav
            dark={dark}
            setDark={setDark}
            view={view}
            setView={setView}
            setAddOpen={setAddOpen}
            setSummaryOpen={setSummaryOpen}
            emailReminderEnabled={emailReminderEnabled}
            setEmailReminderEnabled={setEmailReminderEnabled}
          />
        )}
        {view === "landing" ? (
          <Landing onStart={() => setView("dashboard")} />
        ) : (
          <Dashboard
            dark={dark}
            habits={habits}
            updateSlider={updateSlider}
            changeChart={changeChart}
            openDayModal={setDayOpen}
            getNextEditableDay={getNextEditableDay}
            currentDayIndex={currentDayIndex}
            setHabits={setHabits}
            toast={toast}
            setPastWeeks={setPastWeeks}
            setDayOpen={setDayOpen}
            setLogDetailsOpen={setLogDetailsOpen}
            editingGoal={editingGoal}
            setEditingGoal={setEditingGoal}
            setEditingLog={setEditingLog}
          />
        )}

        {addOpen && (
          <AddHabitModal
            dark={dark}
            newHabit={newHabit}
            setNewHabit={setNewHabit}
            onClose={() => setAddOpen(false)}
            onCreate={createHabit}
          />
        )}

        {dayOpen && (
          <DayModal
            dark={dark}
            entry={dayOpen}
            setEntry={setDayOpen}
            onSave={saveDay}
          />
        )}
        {summaryOpen && (
          <SummaryModal
            dark={dark}                
            habits={habits}
            pastWeeks={pastWeeks}
            onClose={() => setSummaryOpen(false)}
          />
        )}

        {logModalOpen && (
          <DailyLogModal
            dark={dark}
            habit={habits.find((h) => h.id === logModalOpen.habitId)!}
            log={logModalOpen}
            onClose={() => setLogModalOpen(null)}
            onSave={handleSaveLog}
          />
        )}
        {editingGoal && (
          <EditGoalModal
            dark={dark}
            editingGoal={editingGoal}
            setEditingGoal={setEditingGoal}
            onUpdateGoal={handleUpdateGoal}
          />
        )}

        {logDetailsOpen && (
          <LogDetails
            dark={dark}
            habit={habits.find((h) => h.id === logDetailsOpen)!}
            onClose={() => setLogDetailsOpen(null)}
            onEditLog={handleEditLog}
          />
        )}

        {editingLog && (
          <DailyLogModal
            dark={dark}
            habit={habits.find((h) => h.id === editingLog.habitId)!}
            log={editingLog}
            onClose={() => setEditingLog(null)}
            onSave={handleUpdateLog}
          />
        )}
        <AnimatePresence>
          {toasts.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50, x: "-50%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={`fixed z-50 left-1/2 bottom-4 px-4 py-2 rounded-lg shadow-lg ${
                dark ? "bg-gray-800 text-white" : "bg-white text-gray-900"
              }`}
            >
              {msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ───────── SUB COMPONENTS ───────── */
function Nav({
  dark,
  setDark,
  view,
  setView,
  setAddOpen,
  setSummaryOpen,
  emailReminderEnabled,
  setEmailReminderEnabled,
}: NavProps) {
  return (
    <motion.nav
      initial={{ y: -50 }}
      animate={{ y: 0 }}
      className={`p-4 border-b backdrop-blur-lg ${
        dark ? "bg-gray-900/80 border-gray-800" : "bg-white/80 border-gray-200"
      }`}
    >
      <div className="container mx-auto flex justify-between items-center">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setView("landing")}
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center"
          >
            <span className="text-white font-bold">HF</span>
          </motion.div>
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-600 bg-clip-text text-transparent">
            HabitFlow
          </span>
        </motion.div>

        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            {dark ? "🌞" : "🌙"}
          </motion.button>

          {view === "dashboard" && (
            <>
              <div className="relative group">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAddOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full"
                >
                  + Add Habit
                </motion.button>
                <div className="absolute top-full left-1/2 translate-x-[-50%] mt-2 w-max px-2 py-1 text-xs rounded bg-black text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Create a new habit to track
                </div>
              </div>

              <div className="relative group">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    const newValue = !emailReminderEnabled;
                    setEmailReminderEnabled(newValue);
                  }}
                  className={`p-2 rounded-lg ${
                    emailReminderEnabled
                      ? "bg-yellow-500 hover:bg-yellow-600"
                      : "bg-gray-300 hover:bg-gray-400"
                  }`}
                >
                  {emailReminderEnabled ? "🔔 Reminder On" : "🔕 Reminder Off"}
                </motion.button>
                {/* ✅ Tooltip BELOW the button */}
                <div className="absolute top-full left-1/2 translate-x-[-50%] mt-2 w-max px-2 py-1 text-xs rounded bg-black text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Send reminder if no log entered today (backend needed)
                </div>
              </div>

              <div className="relative group">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSummaryOpen(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-full"
                >
                  📊 Week Summary
                </motion.button>
                <div className="absolute top-full left-1/2 translate-x-[-50%] mt-2 w-max px-2 py-1 text-xs rounded bg-black text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  View your weekly stats and charts
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
}

function Landing({ onStart }: LandingProps) {
  const [dark, setDark] = useState(true);
  const [particles] = useState(() =>
    Array.from({ length: 40 }, () => ({
      size: Math.random() * 8 + 4,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      color: dark
        ? ["bg-indigo-400/80", "bg-pink-400/80", "bg-purple-400/80"][
            Math.floor(Math.random() * 3)
          ]
        : ["bg-indigo-500/70", "bg-pink-500/70", "bg-purple-500/70"][
            Math.floor(Math.random() * 3)
          ],
    }))
  );

  return (
    <section
      className={`relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden
        ${
          dark
            ? "bg-gradient-to-br from-slate-50 via-blue-50 to-pink-50 dark:from-slate-900 dark:via-gray-900 dark:to-black"
            : "bg-gradient-to-br from-white via-blue-50 to-pink-50"
        }
      `}
    >
      {/* Theme toggle button */}
      <nav className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setDark(!dark)}
          className={`p-2 rounded-full shadow-md focus:outline-none
            ${dark ? "bg-gray-800 text-white" : "bg-white text-gray-800"}
          `}
        >
          {dark ? "🌞 Light Mode" : "🌙 Dark Mode"}
        </button>
      </nav>

      {/* Animated sun/moon burst */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1 }}
        className={`absolute w-[600px] h-[600px] opacity-10
          ${dark ? "dark:opacity-5 text-white" : "opacity-20 text-indigo-200"}
        `}
        style={{
          background: `radial-gradient(circle, currentColor 0%, transparent 70%)`,
        }}
      />

      {/* Floating cards */}
      <motion.div
        className={`absolute w-48 h-64 backdrop-blur-lg rounded-2xl shadow-xl -left-20 top-1/4
          ${dark ? "bg-white/90" : "bg-white/95 border border-indigo-100"}
        `}
        initial={{ y: -20, rotate: -5 }}
        animate={{ y: [0, -40, 0], rotate: [-5, 5, -5] }}
        transition={{ duration: 8, repeat: Infinity }}
      >
        <div className="p-4">
          <div className="h-32 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg mb-3" />
          <div className="h-2 bg-blue-200 rounded-full mb-2 w-3/4 mx-auto" />
          <div className="h-2 bg-purple-200 rounded-full w-1/2 mx-auto" />
        </div>
      </motion.div>

      {/* Dynamic particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full ${p.color} shadow-md`}
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: p.left,
            top: p.top,
          }}
          animate={{
            y: [0, -100, 0],
            x: [0, 50, 0],
            scale: [1, 1.4, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 6 + i,
            delay: Math.random() * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 max-w-3xl"
      >
        <h1
          className={`text-5xl md:text-6xl font-extrabold mb-6 bg-clip-text text-transparent
            ${
              dark
                ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600"
                : "bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700"
            }
          `}
        >
          Build Better Habits
          <motion.span
            className="absolute -top-8 -left-12 text-4xl"
            animate={{ y: [0, -20, 0], rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity }}
          >
            🌟
          </motion.span>
          <motion.span
            className="absolute -bottom-8 -right-12 text-4xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            📈
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-lg md:text-2xl mb-12 font-medium space-y-2
            ${dark ? "text-slate-600" : "text-slate-700"}
          `}
        >
          <span className="inline-block bg-clip-text text-transparent font-semibold bg-gradient-to-r from-blue-600 to-purple-600">
            Track progress
          </span>
          <span className="mx-2">•</span>
          <span className="inline-block bg-clip-text text-transparent font-semibold bg-gradient-to-r from-purple-600 to-pink-600">
            Analyze patterns
          </span>
          <span className="mx-2">•</span>
          <span className="inline-block bg-clip-text text-transparent font-semibold bg-gradient-to-r from-pink-600 to-red-600">
            Achieve goals
          </span>
        </motion.p>

        <motion.button
          onClick={onStart}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative px-8 py-4 rounded-[2rem] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-2xl text-lg font-semibold text-white overflow-hidden group"
        >
          <span className="relative z-10 flex items-center gap-2">
            Get Started
          </span>
        </motion.button>
      </motion.div>

      {/* Animated grid lines */}
      <div className="absolute inset-0 opacity-20 dark:opacity-[0.03] pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <pattern
            id="grid-pattern"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-slate-200 dark:text-gray-700"
            />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>
      </div>

      {/* Floating metrics */}
      <motion.div
        className="absolute right-8 top-24 bg-white/90 backdrop-blur-lg p-4 rounded-xl shadow-lg"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            📈
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">Daily Progress</p>
            <p className="text-xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              87%
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.9, rotateX: -15 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 15,
      mass: 0.5,
    },
  },
  hover: {
    y: -12,
    scale: 1.03,
    rotateX: 2,
    boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.25)",
    transition: { type: "spring", stiffness: 300 },
  },
  tap: { scale: 0.98 },
};

const floatingVariants = {
  float: {
    y: [-10, 10, -10],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Define weekdays for creating default day entries
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Define colors for pie chart
//const COLORS = ["#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#F97316"];

function Dashboard({
  dark,
  habits,
  updateSlider,
  changeChart,
  openDayModal,
  getNextEditableDay,
  currentDayIndex,
  setHabits,
  toast,
  setPastWeeks,
  setDayOpen,
  setLogDetailsOpen,
  editingGoal,
  setEditingGoal,
  setEditingLog,
}: DashboardProps) {
  const [floatingShapes] = useState(() =>
    Array.from({ length: 15 }, () => ({
      size: Math.random() * 40 + 20,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 5,
      duration: Math.random() * 10 + 10,
      type: ["circle", "triangle", "square"][Math.floor(Math.random() * 3)],
      color: dark
        ? `rgba(99, 102, 241, ${Math.random() * 0.15 + 0.1})`
        : `rgba(79, 70, 229, ${Math.random() * 0.2 + 0.1})`,
    }))
  );
  const chartTypes: ("line" | "bar" | "pie")[] = ["line", "bar", "pie"];
  const handleViewLogs = (habitId: string) => {
    setLogDetailsOpen(habitId);
  };

  const handleEditLog = (log: DailyLog) => {
    setEditingLog(log);
  };
  return (
    <section className="container mx-auto py-10 px-4 relative overflow-hidden min-h-screen">
      {/* Animated Background */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {floatingShapes.map((shape, i) => (
          <motion.div
            key={i}
            className={`absolute ${
              shape.type === "circle"
                ? "rounded-full"
                : shape.type === "triangle"
                ? "clip-path-[polygon(50%_0%,_0%_100%,_100%_100%)]"
                : "rounded-lg"
            }`}
            style={{
              width: `${shape.size}px`,
              height: `${shape.size}px`,
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              backgroundColor: dark
                ? shape.color
                : `rgba(0, 0, 0, ${Math.random() * 0.2 + 0.1})`,
            }}
            animate={{
              y: [0, -100, 0],
              x: [0, 50, 0],
              rotate: [0, 360],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: shape.duration,
              delay: shape.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px]"
          animate={{
            backgroundColor: dark
              ? ["#3730a340", "#4f46e540", "#6366f140"]
              : ["#818cf840", "#a5b4fc40", "#c7d2fe40"],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />

        <motion.div
          className="absolute inset-0 bg-[length:60px_60px]"
          style={{
            backgroundImage: `linear-gradient(to right, ${
              dark ? "#37415120" : "#e5e7eb30"
            } 1px, transparent 1px),
                            linear-gradient(to bottom, ${
                              dark ? "#37415120" : "#e5e7eb30"
                            } 1px, transparent 1px)`,
          }}
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{
            duration: 120,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              backgroundColor: dark
                ? "rgba(165, 180, 252, 0.3)"
                : "rgba(99, 102, 241, 0.3)",
            }}
            initial={{
              left: `${Math.random() * 100}%`,
              top: "-10%",
            }}
            animate={{
              top: "110%",
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              delay: Math.random() * 5,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </motion.div>

      {/* Main Content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-8 justify-items-center relative z-10 min-h-[60vh]"
      >
        {habits.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              className={`text-xl ${
                dark ? "text-gray-300" : "text-gray-600"
              } text-center px-4`}
            >
              ✨ Add your first habit to begin tracking! ✨
            </p>
          </div>
        )}

        {habits.map((h) => {
          const history =
            h.history && h.history.length
              ? h.history
              : WEEKDAYS.map((day) => ({ day, value: 0 }));

          // new: only count days that actually meet the goal
          const doneDays = history.filter((d) =>
            meetsGoal(d.value, h.goal, h.healthyIfLess ?? false)
          ).length;

          const pct = (doneDays / 7) * 100;
          const nextEditableDay = getNextEditableDay(h);
          const isWeekComplete = history.every((d) => d.value > 0);
          const isCurrentDayEditable = !isWeekComplete && !!nextEditableDay;
          const todayIdx = currentDayIndex;
          const missedDays = history.filter((d) => d.value === 0);
          const belowTargetDays = h.healthyIfLess
            ? // for “healthy if less” habits: only values ABOVE goal are bad
              history.filter((d) => d.value > h.goal)
            : // for “healthy if more” habits: only positive-but-under-goal are bad
              history.filter((d) => d.value > 0 && d.value < h.goal);
          const successfulDays = history.filter((d) =>
            meetsGoal(d.value, h.goal, h.healthyIfLess ?? false)
          ).length;
          const successRate = Math.round((successfulDays / 7) * 100);

          return (
            <motion.div
              key={h.id}
              variants={itemVariants}
              whileHover="hover"
              whileTap="tap"
              className={`w-full max-w-[95%] p-8 rounded-3xl transition-all duration-300 backdrop-blur-xl ${
                dark
                  ? "bg-gradient-to-br from-gray-900/60 to-gray-900/30 border border-gray-700/50 hover:border-indigo-500/50 shadow-2xl shadow-gray-900/30"
                  : "bg-gradient-to-br from-white/80 to-white/30 border border-gray-200/80 hover:border-indigo-300 shadow-2xl shadow-indigo-100/30"
              }`}
            >
              {/* Animated header section */}
              <motion.div
                className="flex justify-between items-start mb-6"
                variants={floatingVariants}
                animate="float"
              >
                <div>
                  <h3
                    className={`text-2xl font-bold bg-gradient-to-r ${
                      dark
                        ? "from-indigo-400 to-purple-400"
                        : "from-indigo-600 to-purple-600"
                    } bg-clip-text text-transparent mb-2`}
                  >
                    {h.name}
                  </h3>
                  <p className="text-sm flex items-center gap-2">
                     🔥 Streak: :{" "}
                    <span className="font-semibold">{h.streak}</span>{" "}
                    <span className="text-xs opacity-75">days</span>{" "}
                  </p>
                  
                  <p className="text-sm flex items-center gap-2 mt-1">
                     🏆 Max Streak: {" "}
                    <span className="font-semibold">{h.maxStreak}</span>{" "}
                    <span className="text-xs opacity-75">days</span>{" "}
                  </p>
                  <p
                    className={`text-sm ${
                      dark ? "text-gray-400" : "text-gray-600"
                    } flex items-center gap-2`}
                  >
                    Target: {h.goal} {h.unit}
                    <div className="relative group inline-block">
                      <button
                        onClick={() =>
                          setEditingGoal({ habitId: h.id, goal: h.goal })
                        }
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        ✏️ Edit
                      </button>

                      {/* Tooltip on hover */}
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.3 }}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-3 py-1.5 rounded-md text-xs shadow-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-white border dark:border-gray-700 border-gray-200 whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none"
                      >
                        Edit Goal
                      </motion.div>
                    </div>
                  </p>
                </div>

                <div className="flex gap-2">
                  <div className="relative group">
                    <motion.button
                      whileHover={{ scale: 1.15, rotate: 15 }}
                      whileTap={{ scale: 0.9 }}
                      className={`text-2xl p-2 rounded-full backdrop-blur-sm ${
                        isWeekComplete
                          ? `${
                              dark ? "bg-green-500/10" : "bg-green-100"
                            } text-green-500`
                          : isCurrentDayEditable
                          ? `${
                              dark ? "bg-indigo-500/10" : "bg-indigo-100"
                            } text-indigo-500`
                          : "bg-gray-500/10 text-gray-500"
                      }`}
                      onClick={() => {
                        if (isWeekComplete) {
                          setHabits(
                            habits.map((hh) => {
                              if (hh.id === h.id) {
                                setPastWeeks((weeks: any) => ({
                                  ...weeks,
                                  [hh.id]: [
                                    ...(weeks[hh.id] || []),
                                    hh.history.map((entry, idx) => ({
                                      ...entry,
                                      id: `${hh.id}-${idx}-${Date.now()}`,
                                    })),
                                  ],
                                }));
                                return {
                                  ...hh,
                                  history: WEEKDAYS.map((day, idx) => ({
                                    id: `${hh.id}-${idx}-${Date.now()}`,
                                    day,
                                    value: 0,
                                  })),
                                  current: 0,
                                };
                              }
                              return hh;
                            })
                          );
                          toast("🔄 New week started");
                          setTimeout(() => {
                            setDayOpen({ hid: h.id, day: "Mon", val: 0 });
                          }, 300);
                        } else if (nextEditableDay) {
                          openDayModal({
                            hid: h.id,
                            day: nextEditableDay,
                            val: h.current,
                          });
                        }
                      }}
                    >
                      {isWeekComplete
                        ? "🔄"
                        : isCurrentDayEditable
                        ? "✏️"
                        : "⏳"}
                    </motion.button>

                    {/* Tooltip using Tailwind only */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded-xl text-sm shadow-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-white border dark:border-gray-700 border-gray-200 whitespace-nowrap z-50 opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                      {isWeekComplete
                        ? "Start new week or click it and then click week summary  to get the week summary"
                        : isCurrentDayEditable
                        ? "Edit today's entry"
                        : "Next entry not available yet"}
                    </div>
                  </div>

                  <div className="relative group">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      className={`text-xl p-2 rounded-full backdrop-blur-sm ${
                        dark ? "bg-blue-500/10" : "bg-blue-100"
                      } text-blue-500`}
                      onClick={() => handleViewLogs(h.id)}
                    >
                      📋
                    </motion.button>

                    {/* Tooltip using Tailwind only */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded-xl text-sm shadow-lg bg-white text-gray-800 dark:bg-gray-900 dark:text-white border dark:border-gray-700 border-gray-200 whitespace-nowrap z-50 opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                      View detailed log history
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Progress section */}
              <motion.div
                className="mb-8 relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="flex justify-between items-center mb-4">
                  <span
                    className={`text-sm font-medium ${
                      dark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    Weekly Progress
                  </span>
                  <span
                    className={`text-sm ${
                      dark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {doneDays}
                    <span className="text-xs opacity-75">/7 days</span>
                  </span>
                </div>
                <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-gray-800/10 to-gray-800/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1.2, type: "spring" }}
                    className="absolute h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full shadow-lg"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent w-1/3 animate-shimmer" />
                  </motion.div>
                </div>
              </motion.div>

              {/* Interactive controls */}
              <motion.div
                className="mb-8 space-y-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div
                  className={`text-sm ${
                    dark ? "text-gray-400" : "text-gray-600"
                  } italic`}
                >
                  {isCurrentDayEditable
                    ? `Next entry: ${nextEditableDay}`
                    : `Awaiting ${nextEditableDay || "next day"}`}
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  {missedDays.length > 0 && (
                    <div className="text-red-500">
                      ⏰ Missed {missedDays.length} day
                      {missedDays.length > 1 ? "s" : ""} this week
                    </div>
                  )}
                  {belowTargetDays.length > 0 && (
                    <div className="text-red-500">
                      ⚠️ {belowTargetDays.length} day
                      {belowTargetDays.length > 1 ? "s" : ""} below goal
                    </div>
                  )}
                  <div className={dark ? "text-green-300" : "text-green-700"}>
                    ✅ Weekly Success Rate: {successRate}%
                  </div>
                </div>
              </motion.div>

              {/* Chart controls */}
              <motion.div
                className="flex gap-3 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {chartTypes.map((t) => (
                  <motion.button
                    key={t}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => changeChart(h.id, t)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                      h.chartType === t
                        ? dark
                          ? "bg-indigo-600/80 text-white shadow-indigo-500/30"
                          : "bg-indigo-500/90 text-white shadow-indigo-400/30"
                        : dark
                        ? "bg-gray-800/30 text-gray-300 hover:bg-gray-700/50"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </motion.button>
                ))}
              </motion.div>

              {/* Chart visualization */}
              <motion.div
                className="h-52 relative"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/5 dark:to-black/5 rounded-2xl" />
                {h.chartType === "line" && (
                  <ResponsiveContainer>
                    <LineChart data={history}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={dark ? "#374151" : "#e5e7eb"}
                      />
                      <XAxis
                        dataKey="day"
                        stroke={dark ? "#9ca3af" : "#4b5563"}
                        tick={{ fill: dark ? "#9ca3af" : "#4b5563" }}
                      />
                      <YAxis
                        stroke={dark ? "#9ca3af" : "#4b5563"}
                        tick={{ fill: dark ? "#9ca3af" : "#4b5563" }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#1f2937" : "#ffffff",
                          border: dark
                            ? "1px solid #374151"
                            : "1px solid #e5e7eb",
                          borderRadius: "12px",
                          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="url(#lineGradient)"
                        strokeWidth={3}
                        dot={{ fill: "#6366f1", r: 5 }}
                        activeDot={{ r: 8 }}
                      />
                      <defs>
                        <linearGradient
                          id="lineGradient"
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {h.chartType === "bar" && (
                  <ResponsiveContainer>
                    <BarChart data={history}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={dark ? "#374151" : "#e5e7eb"}
                      />
                      <XAxis
                        dataKey="day"
                        stroke={dark ? "#9ca3af" : "#4b5563"}
                        tick={{ fill: dark ? "#9ca3af" : "#4b5563" }}
                      />
                      <YAxis
                        stroke={dark ? "#9ca3af" : "#4b5563"}
                        tick={{ fill: dark ? "#9ca3af" : "#4b5563" }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#1f2937" : "#ffffff",
                          border: dark
                            ? "1px solid #374151"
                            : "1px solid #e5e7eb",
                          borderRadius: "12px",
                          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        fill="url(#barGradient)"
                        radius={[6, 6, 0, 0]}
                      />
                      <defs>
                        <linearGradient
                          id="barGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {h.chartType === "pie" && (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={history}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        innerRadius={55}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {history.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#1f2937" : "#ffffff",
                          border: dark
                            ? "1px solid #374151"
                            : "1px solid #e5e7eb",
                          borderRadius: "12px",
                          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </motion.div>

              {/* Days grid */}
              <motion.div
                className="mt-8 grid grid-cols-7 gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {history.map((dayEntry, idx) => {
                  const dayChar = dayEntry.day.slice(0, 3);
                  const val = dayEntry.value;
                  const hasLog = h.logs.some((l) => l.day === dayEntry.day);

                  // Pull in the new flag (default false)
                  const healthyIfLess = h.healthyIfLess ?? false;

                  // Determine “good” vs “warning” based on that flag
                  const isGood = healthyIfLess
                    ? val > 0 && val <= h.goal // for invert habits: any positive ≤ goal is good
                    : val >= h.goal; // for normal habits: ≥ goal is good

                  const isWarning = healthyIfLess
                    ? val > h.goal // invert: > goal is bad
                    : val > 0 && val < h.goal; // normal: between 0 and goal is warning

                  // Build your Tailwind classes
                  const bgClass = isWarning
                    ? dark
                      ? "bg-red-900/30 text-red-400 shadow-red-500/20"
                      : "bg-red-100 text-red-800 shadow-red-500/10"
                    : isGood
                    ? dark
                      ? "bg-green-900/30 text-green-400 shadow-green-500/20"
                      : "bg-green-100 text-green-800 shadow-green-500/10"
                    : idx <= currentDayIndex
                    ? dark
                      ? "bg-gray-800/30 text-gray-400 shadow-gray-500/20"
                      : "bg-gray-100 text-gray-600 shadow-gray-500/10"
                    : dark
                    ? "bg-gray-900/20 text-gray-500 shadow-transparent"
                    : "bg-gray-50 text-gray-400 shadow-transparent";

                  return (
                    <motion.div
                      key={idx}
                      whileHover={{ scale: 1.1 }}
                      className={`text-center p-2 rounded-lg text-sm font-medium transition-all relative ${bgClass}`}
                      onClick={() =>
                        idx <= currentDayIndex &&
                        openDayModal({ hid: h.id, day: dayEntry.day, val })
                      }
                    >
                      <div className="text-xs opacity-75">{dayChar}</div>
                      <div className="text-base font-bold mt-1">{val}</div>
                      {hasLog && (
                        <div className="absolute top-1 right-1 text-xs">📝</div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      <footer className="mt-16 py-6 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>
          Built with 💙 by{" "}
          <span className="font-medium text-indigo-500">You</span> •{" "}
          {new Date().getFullYear()} &copy; All rights reserved.
        </p>
      </footer>
    </section>
  );
}

function AddHabitModal({
  dark,
  newHabit,
  setNewHabit,
  onClose,
  onCreate,
}: AddHabitModalProps) {
  return (
    <AnimatePresence>
      {/* Enhanced backdrop animation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      >
        {/* Enhanced modal animation with spring physics */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
              type: "spring",
              damping: 25,
              stiffness: 300,
            },
          }}
          exit={{
            opacity: 0,
            scale: 0.9,
            y: 10,
            transition: {
              duration: 0.2,
            },
          }}
          className={`p-8 rounded-2xl w-96 ${
            dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          } border backdrop-blur-lg shadow-xl`}
        >
          {/* Title animation */}
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.1, duration: 0.3 },
            }}
            className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent"
          >
            Add New Habit
          </motion.h2>

          <div className="space-y-4">
            {/* Habit Name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.2, duration: 0.3 },
              }}
            >
              <input
                type="text"
                value={newHabit.name}
                onChange={(e) =>
                  setNewHabit({ ...newHabit, name: e.target.value })
                }
                placeholder="Habit Name"
                className={`w-full p-3 rounded-lg ${
                  dark
                    ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                    : "bg-gray-100 focus:bg-gray-200 text-gray-900"
                } transition-all duration-200`}
              />
            </motion.div>

            {/* Unit Select */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.3, duration: 0.3 },
              }}
            >
              <select
                value={newHabit.unit}
                onChange={(e) =>
                  setNewHabit({ ...newHabit, unit: e.target.value })
                }
                className={`w-full p-3 rounded-lg transition-all ${
                  dark
                    ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                    : "bg-gray-100 focus:bg-gray-200 text-gray-900"
                }`}
              >
                <option value="hours">Hours</option>
                <option value="ml">Milliliters</option>
                <option value="minutes">Minutes</option>
                <option value="times">Times</option>
              </select>
            </motion.div>

            {/* Goal Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.4, duration: 0.3 },
              }}
            >
              <input
                type="number"
                min="1"
                value={newHabit.goal}
                onChange={(e) =>
                  setNewHabit({ ...newHabit, goal: Number(e.target.value) })
                }
                className={`w-full p-3 rounded-lg ${
                  dark
                    ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                    : "bg-gray-100 focus:bg-gray-200 text-gray-900"
                } transition-all duration-200`}
              />
            </motion.div>

            {/* ✅ New toggle for “Healthy if Less” */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.5, duration: 0.3 },
              }}
              className="flex items-center gap-2"
            >
              <input
                id="healthyIfLess"
                type="checkbox"
                checked={newHabit.healthyIfLess}
                onChange={(e) =>
                  setNewHabit({
                    ...newHabit,
                    healthyIfLess: e.target.checked,
                  })
                }
                className="h-5 w-5 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500"
              />
              <label
                htmlFor="healthyIfLess"
                className={`${
                  dark ? "text-gray-200" : "text-gray-800"
                } text-sm`}
              >
                Healthy if Less
              </label>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              className="flex gap-3 mt-6"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { delay: 0.6, duration: 0.3 },
              }}
            >
              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: "#4338ca" }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={onCreate}
                disabled={!newHabit.name.trim()}
                className="flex-1 bg-indigo-600 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 text-white transition-colors duration-200"
              >
                <motion.span
                  initial={{ x: -5, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  ➕ Add Habit
                </motion.span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: "#4b5563" }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={onClose}
                className="flex-1 bg-gray-600 py-2 rounded-lg flex items-center justify-center gap-2 text-white transition-colors duration-200"
              >
                <motion.span
                  initial={{ x: -5, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  ✕ Cancel
                </motion.span>
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
/**
 * Count backwards from today (or last filled day) as long as each day meets the goal.
 */

function DayModal({ dark, entry, setEntry, onSave }: any) {
  const [value, setValue] = useState<number>(entry.val);

  const close = () => setEntry(null);
  const save = () => {
    onSave(entry.hid, entry.day, value);
    close();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
        onClick={close}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.8, y: 20, opacity: 0 }}
          animate={{
            scale: 1,
            y: 0,
            opacity: 1,
            transition: {
              type: "spring",
              damping: 25,
              stiffness: 300,
            },
          }}
          exit={{
            scale: 0.9,
            y: 10,
            opacity: 0,
            transition: {
              duration: 0.2,
            },
          }}
          className={`w-80 p-6 rounded-2xl ${
            dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          } border backdrop-blur-lg shadow-lg`}
        >
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.1, duration: 0.3 },
            }}
            className="text-xl font-semibold mb-4"
          >
            Enter value for {entry.day}
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.2, duration: 0.3 },
            }}
            className="mb-6"
          >
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(+e.target.value)}
              className={`w-full p-3 rounded-lg ${
                dark
                  ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                  : "bg-gray-100 focus:bg-gray-200 text-gray-900"
              } transition-all duration-200`}
            />
          </motion.div>

          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { delay: 0.3, duration: 0.3 },
            }}
          >
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: "#4338ca" }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={save}
              className="flex-1 bg-indigo-600 py-2 rounded-lg text-white transition-colors duration-200"
            >
              <motion.span
                initial={{ x: -5, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                ✅ Save
              </motion.span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: "#4b5563" }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={close}
              className="flex-1 bg-gray-600 py-2 rounded-lg text-white transition-colors duration-200"
            >
              <motion.span
                initial={{ x: -5, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                ✕ Cancel
              </motion.span>
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
function SummaryModal({
  dark,
  habits,
  pastWeeks,
  onClose,
}: {
  dark: boolean;           
  habits: Habit[];
  pastWeeks: Record<string, DayEntry[][]>;
  onClose: () => void;
}) {
  const serializeWeek = (week: DayEntry[]) =>
    week.map((d) => `${d.day}:${d.value}`).join(",");

  return (
    <AnimatePresence>
    <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
    className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center ${
      dark ? "bg-black/60" : "bg-white/60"
    }`}
  >
  
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-[90vw] max-w-6xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 backdrop-blur-lg text-gray-900 dark:text-white"
        >
          <h2 className="text-2xl font-bold mb-4">📈 Weekly Habit Summary</h2>

          {habits.map((habit) => {
            const seenWeeks = new Set<string>();
            const uniqueWeeks = (pastWeeks[habit.id] || []).filter((week) => {
              const key = serializeWeek(week);
              if (seenWeeks.has(key)) return false;
              seenWeeks.add(key);
              return true;
            });

            return (
              <div key={habit.id} className="mb-10">
                <h3 className="text-lg font-semibold mb-3">{habit.name}</h3>

                {uniqueWeeks.length === 0 && (
                  <p className="text-gray-500 text-sm">No past data yet</p>
                )}

                {uniqueWeeks.map((weekData, idx) => (
                  <div
                    key={idx}
                    className="mb-10 border-b border-gray-700 pb-8"
                  >
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Week {idx + 1}
                    </p>

                    {/* Row 1: Bar + Pie */}
                    <div className="flex flex-wrap gap-6 justify-center mb-6">
                      {/* Bar Chart */}
                      <div className="w-full sm:w-[45%] h-64 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weekData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#374151"
                            />
                            <XAxis dataKey="day" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <Tooltip
                              contentStyle={{
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar
                              dataKey="value"
                              fill="#8b5cf6"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Pie Chart */}
                      <div className="w-full sm:w-[45%] h-64 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={weekData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8b5cf6"
                              dataKey="value"
                              label={({ day, value }) => `${day}: ${value}`}
                            >
                              {weekData.map((entry, i) => (
                                <Cell
                                  key={`cell-${i}`}
                                  fill={COLORS[i % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Row 2: Line + Area */}
                    <div className="flex flex-wrap gap-6 justify-center mb-6">
                      {/* Line Chart */}
                      <div className="w-full sm:w-[45%] h-64 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={weekData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#374151"
                            />
                            <XAxis dataKey="day" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <Tooltip
                              contentStyle={{
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Area Chart */}
                      <div className="w-full sm:w-[45%] h-64 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={weekData}>
                            <defs>
                              <linearGradient
                                id="colorArea"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#6366f1"
                                  stopOpacity={0.8}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#6366f1"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="day" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#374151"
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke="#6366f1"
                              fillOpacity={1}
                              fill="url(#colorArea)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Row 3: Radar Chart */}
                    <div className="flex justify-center">
                      <div className="w-full sm:w-[45%] h-64 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            data={weekData}
                          >
                            <PolarGrid />
                            <PolarAngleAxis dataKey="day" stroke="#9ca3af" />
                            <PolarRadiusAxis stroke="#9ca3af" />
                            <Radar
                              name="Value"
                              dataKey="value"
                              stroke="#f59e0b"
                              fill="#f59e0b"
                              fillOpacity={0.6}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="flex justify-end mt-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="bg-indigo-600 px-4 py-2 rounded-lg"
            >
              ✕ Close
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
function DailyLogModal({
  dark,
  habit,
  log,
  onClose,
  onSave,
}: {
  dark: boolean;
  habit: Habit;
  log: {
    habitId: string;
    day: string;
    value: number;
    notes: string;
  } | null;
  onClose: () => void;
  onSave: (log: { day: string; value: number; notes: string }) => void;
}) {
  const [value, setValue] = useState(log?.value || 0);
  const [notes, setNotes] = useState(log?.notes || "");

  const handleSave = () => {
    onSave({ day: log?.day || "", value, notes });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.8, y: 20, opacity: 0 }}
          animate={{
            scale: 1,
            y: 0,
            opacity: 1,
            transition: {
              type: "spring",
              damping: 25,
              stiffness: 300,
            },
          }}
          exit={{
            scale: 0.9,
            y: 10,
            opacity: 0,
            transition: { duration: 0.2 },
          }}
          className={`w-96 p-6 rounded-2xl ${
            dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          } border backdrop-blur-lg shadow-lg`}
        >
          <h2 className="text-xl font-semibold mb-4">
            {log ? "Edit Log" : "Add Log"} for {habit.name} - {log?.day}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className={`w-full p-2 rounded-lg ${
                  dark
                    ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                    : "bg-gray-100 focus:bg-gray-200 text-gray-900"
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`w-full p-2 rounded-lg ${
                  dark
                    ? "bg-gray-700/50 focus:bg-gray-700 text-white"
                    : "bg-gray-100 focus:bg-gray-200 text-gray-900"
                }`}
                rows={3}
                placeholder="Add any notes about this day..."
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSave}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg"
              >
                Save
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
function LogDetails({
  dark,
  habit,
  onClose,
  onEditLog,
}: {
  dark: boolean;
  habit: Habit;
  onClose: () => void;
  onEditLog: (log: DailyLog) => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`w-[90vw] max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${
            dark ? "bg-gray-900" : "bg-white"
          } border ${dark ? "border-gray-700" : "border-gray-300"}`}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📝 Daily Logs - {habit.name}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-700/50"
            >
              ✕
            </button>
          </div>

          {habit.logs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No logs yet for this habit
            </p>
          ) : (
            <div className="space-y-4">
              {habit.logs
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg ${
                      dark ? "bg-gray-800" : "bg-gray-100"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">
                          {log.day} -{" "}
                          {new Date(log.timestamp).toLocaleDateString()}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Value: {log.value} {habit.unit}
                        </p>
                      </div>
                    </div>
                    {log.notes && (
                      <div className="mt-2 text-sm">
                        <p className="font-medium">Notes:</p>
                        <p className="whitespace-pre-line">{log.notes}</p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
function EditGoalModal({
  dark,
  editingGoal,
  setEditingGoal,
  onUpdateGoal,
}: {
  dark: boolean;
  editingGoal: { habitId: string; goal: number };
  setEditingGoal: (v: null) => void;
  onUpdateGoal: (habitId: string, newGoal: number) => void;
}) {
  const [goal, setGoal] = useState(editingGoal.goal);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={() => setEditingGoal(null)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className={`p-6 rounded-xl w-96 ${
            dark ? "bg-gray-800" : "bg-white"
          } border ${dark ? "border-gray-700" : "border-gray-300"}`}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <h2 className="text-xl font-semibold mb-4">Update Goal</h2>
          <input
            type="number"
            className={`w-full p-3 rounded-lg ${
              dark ? "bg-gray-700 text-white" : "bg-gray-100 text-black"
            }`}
            value={goal}
            min={1}
            onChange={(e) => setGoal(Number(e.target.value))}
          />
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                onUpdateGoal(editingGoal.habitId, goal);
                setEditingGoal(null);
              }}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg"
            >
              ✅ Save
            </button>
            <button
              onClick={() => setEditingGoal(null)}
              className="flex-1 bg-gray-600 text-white py-2 rounded-lg"
            >
              ✕ Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
