import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PlannerCurrentDay, PlannerDay, PlannerDayLabel } from './PlannerDay';

export const metadata: Metadata = { title: 'Planner | ReelSpark' };

const platforms = [
  { name: 'YouTube Shorts', source: 'https://support.google.com/youtube/answer/141805', label: 'YouTube Help',
    guidance: 'Use audience activity to test early reach. YouTube says publish time has no known effect on long-term viewership. Compare engaged views and how often viewers stay to watch.',
    metrics: 'https://support.google.com/youtube/answer/12220281' },
  { name: 'Instagram Reels', source: 'https://developers.facebook.com/docs/insights/overview', label: 'Meta Insights',
    guidance: 'Start with the slots in the plan and compare your own Reel reach and interactions. Use follower activity in Instagram Insights when your account shows it.' },
  { name: 'Facebook Reels', source: 'https://about.fb.com/news/2023/11/helping-creators-test-content-and-earn-rewards/', label: 'Meta for Creators',
    guidance: 'Review Reel insights in the professional dashboard. Compare video views and interactions for similar reels at the same age after publishing.' },
  { name: 'Threads', source: 'https://about.fb.com/news/2025/03/new-threads-features-more-personalized-experience-you-control/', label: 'Threads Insights',
    guidance: 'Compare views, replies and quotes in Threads Insights. Use the weekly recap to see whether a slot is starting conversations.' },
] as const;

type PlanDay = { day: string; topic: string; times: readonly [string, string, string, string] };
const schedule: readonly PlanDay[] = [
  { day: 'Monday', topic: 'Self-Respect', times: ['20:00', '19:00', '12:30', '12:00'] },
  { day: 'Tuesday', topic: 'Life Lessons', times: ['20:00', '19:00', '18:00', '10:00'] },
  { day: 'Wednesday', topic: 'Self-Awareness', times: ['19:00', '18:00', '13:00', '12:00'] },
  { day: 'Thursday', topic: 'Philosophy', times: ['19:00', '09:00', '20:00', '09:00'] },
  { day: 'Friday', topic: 'Bold Truth', times: ['16:00', '21:00', '12:30', '10:00'] },
  { day: 'Saturday', topic: 'Personal Growth', times: ['19:00', '21:00', '18:00', '10:00'] },
  { day: 'Sunday', topic: 'Deep Life Lessons', times: ['19:00', '21:00', '19:00', '11:00'] },
];

function PostingTime({ value }: { value: string }) {
  const [hours, minutes] = value.split(':');
  const hour = Number(hours);
  return <time dateTime={value} className="whitespace-nowrap tabular-nums">{hour % 12 || 12}:{minutes} {hour >= 12 ? 'PM' : 'AM'}</time>;
}

function WeeklyPlan() {
  return <div className="mx-auto max-w-6xl space-y-8">
    <section aria-labelledby="weekly-plan-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="weekly-plan-title" className="flex items-center gap-2 text-2xl font-semibold text-zinc-100">
          <CalendarDays aria-hidden="true" className="size-5 text-amber-400" />
          Weekly publishing plan
        </h1>
        <p className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
          <Clock3 aria-hidden="true" className="size-4 text-amber-400" />
          IST · Asia/Kolkata
        </p>
      </div>
      <PlannerCurrentDay>
        <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 lg:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Weekly publishing schedule in Indian Standard Time</caption>
            <thead className="border-b border-zinc-800 bg-zinc-950 text-xs text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3">Day</th>
                {platforms.map(platform => <th key={platform.name} scope="col" className="px-4 py-3">{platform.name}</th>)}
                <th scope="col" className="px-4 py-3">Content topic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {schedule.map(({ day, topic, times }) => (
                <PlannerDay key={day} as="tr" day={day}>
                  <th scope="row" className="px-4 py-4 font-medium text-zinc-100"><PlannerDayLabel day={day} /></th>
                  {times.map((time, index) => <td key={platforms[index].name} className="px-4 py-4 text-zinc-300"><PostingTime value={time} /></td>)}
                  <td className="px-4 py-4 font-medium text-amber-300">{topic}</td>
                </PlannerDay>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {schedule.map(({ day, topic, times }) => (
            <PlannerDay key={day} as="li" day={day}>
              <h2 className="font-semibold text-zinc-100"><PlannerDayLabel day={day} /></h2>
              <p className="mb-3 text-sm text-amber-300">{topic}</p>
              <dl className="space-y-2 border-t border-zinc-800 pt-3 text-sm">
                {times.map((time, index) => (
                  <div className="flex justify-between gap-2" key={platforms[index].name}>
                    <dt className="text-zinc-400">{platforms[index].name}</dt>
                    <dd className="text-zinc-100"><PostingTime value={time} /></dd>
                  </div>
                ))}
              </dl>
            </PlannerDay>
          ))}
        </ul>
      </PlannerCurrentDay>
    </section>
    <section aria-labelledby="review-plan-title" className="space-y-4">
      <div>
        <h2 id="review-plan-title" className="text-lg font-semibold text-zinc-100">How to test your posting times</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Use this schedule as your starting point. Compare similar posts at the same age, such as 24 hours after posting.
          Test one alternate slot per platform over several weeks and compare the median result before changing your schedule.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {platforms.map(platform => (
          <li key={platform.name} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="font-medium text-zinc-100">{platform.name}</h3>
            <p className="text-sm text-zinc-300">{platform.guidance}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a href={platform.source} className="text-amber-300 underline underline-offset-4">{platform.label}</a>
              {'metrics' in platform && <a href={platform.metrics} className="text-amber-300 underline underline-offset-4">Shorts analytics</a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  </div>;
}

export default function PlannerPage() {
  return (
    <Suspense fallback={<WeeklyPlan />}>
      <DashboardLayout title="Planner" breadcrumbs={[{ label: 'Planner' }]}>
        <WeeklyPlan />
      </DashboardLayout>
    </Suspense>
  );
}
