'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const dayMs = 24 * 60 * 60 * 1000;
// Asia/Kolkata is UTC+05:30 year-round.
const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
const CurrentDay = createContext<string | null>(null);

export function plannerDayAt(timestamp: number) {
  const ist = timestamp + istOffsetMs;
  return { day: weekdays[new Date(ist).getUTCDay()], untilMidnight: dayMs - (ist % dayMs) };
}

export function PlannerCurrentDay({ children }: { children: ReactNode }) {
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      window.clearTimeout(timer);
      const current = plannerDayAt(Date.now());
      setDay(current.day);
      timer = window.setTimeout(refresh, current.untilMidnight);
    }
    let timer = window.setTimeout(refresh, 0);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return <CurrentDay.Provider value={day}>{children}</CurrentDay.Provider>;
}

export function PlannerDay({ as: DayElement, day, children }: { as: 'tr' | 'li'; day: string; children: ReactNode }) {
  const today = useContext(CurrentDay) === day;
  const row = today ? 'bg-amber-500/10' : undefined;
  const card = `rounded-xl border p-4 ${today ? 'border-amber-500/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`;
  return <DayElement aria-current={today ? 'date' : undefined} className={DayElement === 'tr' ? row : card}>{children}</DayElement>;
}

export function PlannerDayLabel({ day }: { day: string }) {
  const today = useContext(CurrentDay) === day;
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
    {day}
    {today && <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-300">Today</span>}
  </span>;
}
