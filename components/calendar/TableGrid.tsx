'use client';

import {Fragment, useMemo} from 'react';
import {useTranslations} from 'next-intl';
import {TIMEZONE, toAlmaty} from '@/lib/time';
import {addDays, fmtTime} from '@/lib/calendar';
import type {MockBooking, MockClient, MockResource} from '@/lib/types';
import {STATUS_BG} from './StatusBadge';

// Шахматка ресторана: строки — столы (секциями по этажам), колонки — дни.
// Ячейка = «стол × дата»: пустая (клик — новая бронь) или занятая (клик — правка).

const dayKey = (instant: Date) => {
  const w = toAlmaty(instant);
  return `${w.getFullYear()}-${w.getMonth()}-${w.getDate()}`;
};

export default function TableGrid({
  startDay, days, resources, bookings, clients, locale, now, onCellClick, onBookingClick,
}: {
  startDay: Date; // полночь Алматы первого дня
  days: number; // 1 (день) или 7 (неделя)
  resources: MockResource[];
  bookings: MockBooking[];
  clients: MockClient[];
  locale: string;
  now: Date;
  onCellClick: (resourceId: string, dayStart: Date) => void;
  onBookingClick: (b: MockBooking) => void;
}) {
  const t = useTranslations('calendar');
  const dayList = useMemo(
    () => Array.from({length: days}, (_, i) => addDays(startDay, i)),
    [startDay, days],
  );
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // В ячейке может быть несколько посадок за день (стол освобождается после ухода
  // гостей) — храним список, отсортированный по времени прихода.
  const cellMap = useMemo(() => {
    const m = new Map<string, MockBooking[]>();
    for (const b of bookings) {
      const k = `${b.resourceId}|${dayKey(b.startAt)}`;
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    m.forEach((arr) => arr.sort((a, b) => a.startAt.getTime() - b.startAt.getTime()));
    return m;
  }, [bookings]);

  const floors = useMemo(() => {
    const m = new Map<number, MockResource[]>();
    for (const r of resources) {
      const arr = m.get(r.floor) ?? [];
      arr.push(r);
      m.set(r.floor, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [resources]);

  const todayKey = dayKey(now);
  const name = (r: MockResource) => (locale === 'kk' ? r.nameKk : r.nameRu);

  // Шапка колонки: «пн · 13 июля» — день недели, число и месяц (Алматы).
  const fmtDayMonth = (d: Date) =>
    new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
      timeZone: TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(d);

  // «19:00–23:00»; конец 00:00 = «до конца дня» — показываем только приход.
  const timeLabel = (b: MockBooking) => {
    const start = fmtTime(b.startAt, locale);
    const end = fmtTime(b.endAt, locale);
    return end === '00:00' ? start : `${start}–${end}`;
  };

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20 bg-card">
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-border bg-card px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
              {t('table')}
            </th>
            {dayList.map((d) => (
              <th
                key={d.getTime()}
                className={`min-w-28 border-b border-border px-2 py-2 text-center text-xs font-medium capitalize ${
                  dayKey(d) === todayKey ? 'text-foreground' : 'text-muted'
                }`}
              >
                {fmtDayMonth(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {floors.map(([floor, tables]) => (
            <Fragment key={floor}>
              <tr>
                <td
                  colSpan={dayList.length + 1}
                  className="border-b border-border bg-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {t('floor', {n: floor})}
                </td>
              </tr>
              {tables.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-card px-3 py-1 font-medium">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{backgroundColor: r.color}}
                    />
                    {name(r)}
                    <span className="ml-1 text-[10px] text-muted">· {r.capacity}</span>
                  </td>
                  {dayList.map((d) => {
                    const list = cellMap.get(`${r.id}|${dayKey(d)}`) ?? [];
                    const isToday = dayKey(d) === todayKey;
                    return (
                      <td key={d.getTime()} className={`border-b border-border p-0.5 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                        <div className="flex min-h-12 w-full flex-col gap-0.5">
                          {list.map((b) => {
                            const cancelled = b.status === 'CANCELLED' || b.status === 'NO_SHOW';
                            const clientName = clientById.get(b.clientId)?.name ?? '—';
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => onBookingClick(b)}
                                title={`${clientName} · ${timeLabel(b)} · ${b.guests}${b.comment ? ` · ${b.comment}` : ''}`}
                                className={`flex w-full flex-col overflow-hidden rounded px-1.5 py-0.5 text-left ${STATUS_BG[b.status]} ${cancelled ? 'opacity-50' : ''}`}
                              >
                                <span className="truncate text-xs font-medium">{clientName}</span>
                                <span className="truncate text-[10px] opacity-70">
                                  {timeLabel(b)} · {b.guests}
                                </span>
                              </button>
                            );
                          })}
                          {/* Добавить (ещё одну) посадку в этот день */}
                          <button
                            type="button"
                            onClick={() => onCellClick(r.id, d)}
                            className={`group flex w-full flex-1 items-center justify-center rounded hover:bg-subtle ${list.length ? 'min-h-5' : 'min-h-11'}`}
                          >
                            <span className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">+</span>
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
