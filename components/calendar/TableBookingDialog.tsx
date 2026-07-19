'use client';

import {useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {saveBooking, cancelBookingAction} from '@/lib/actions';
import {addDays, almatyDayStart, fromLocalInput, toLocalInput} from '@/lib/calendar';
import {dialogField, dialogLabel} from '@/lib/ui';
import type {MockBooking, MockClient, MockResource} from '@/lib/types';
import {BOOKING_STATUSES} from '@/lib/enums';
import ClientPicker from './ClientPicker';
import TagsField from '@/components/clients/TagsField';

// Диалог посадки: startAt = дата + время прихода; endAt = время ухода (пусто —
// до конца дня). После ухода/«Завершить посадку» стол свободен — на один стол
// можно сажать несколько компаний в день, пересечения отбивает антиовербукинг.

const PAYMENT_METHODS = ['KASPI', 'CASH', 'BANK', 'CASH_KASPI'] as const;

export default function TableBookingDialog({
  mode, booking, prefill, resources, clients, locale, onSaved, onClose,
}: {
  mode: 'create' | 'edit';
  booking?: MockBooking;
  prefill?: {resourceId: string; startAt: Date};
  resources: MockResource[];
  clients: MockClient[];
  locale: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const tb = useTranslations('booking');
  const tc = useTranslations('calendar');
  const ts = useTranslations('status');
  const tpm = useTranslations('payment');

  const init = booking ?? null;
  const initStart = init?.startAt ?? prefill?.startAt ?? new Date();

  const [clientId, setClientId] = useState(init?.clientId ?? '');
  // Теги клиента: предзаполняются текущими, при сохранении брони пишутся в карточку.
  const [tags, setTags] = useState(() =>
    (clients.find((c) => c.id === (init?.clientId ?? ''))?.tags ?? []).join(', '),
  );
  const [resourceId, setResourceId] = useState(init?.resourceId ?? prefill?.resourceId ?? resources[0]?.id ?? '');
  const [date, setDate] = useState(toLocalInput(initStart).slice(0, 10));
  const [time, setTime] = useState(init ? toLocalInput(init.startAt).slice(11, 16) : '19:00');
  // Пусто = «до конца дня» (endAt = следующие 00:00).
  const [endTime, setEndTime] = useState(() => {
    if (!init) return '';
    const t = toLocalInput(init.endAt).slice(11, 16);
    return t === '00:00' ? '' : t;
  });
  const [guests, setGuests] = useState(String(init?.guests ?? 2));
  const [status, setStatus] = useState(init?.status ?? 'CONFIRMED');
  const [total, setTotal] = useState(init && init.total > 0 ? String(init.total) : '');
  const [prepayment, setPrepayment] = useState(init && init.prepayment > 0 ? String(init.prepayment) : '');
  const [paymentMethod, setPaymentMethod] = useState(init?.paymentMethod ?? '');
  const [comment, setComment] = useState(init?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const floors = useMemo(() => {
    const m = new Map<number, MockResource[]>();
    for (const r of resources) {
      const arr = m.get(r.floor) ?? [];
      arr.push(r);
      m.set(r.floor, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [resources]);

  const initialClientName = useMemo(
    () => (init ? clients.find((c) => c.id === init.clientId)?.name : undefined),
    [init, clients],
  );

  async function save() {
    setError(null);
    if (!clientId) return setError(tb('clientRequired'));
    if (!date || !time) return setError(tb('invalidRange'));
    setSaving(true);
    try {
      const startAt = fromLocalInput(`${date}T${time}`);
      if (Number.isNaN(startAt.getTime())) return setError(tb('invalidRange'));
      let endAt = addDays(almatyDayStart(startAt), 1); // пустой «уход» — до конца дня
      if (endTime) {
        endAt = fromLocalInput(`${date}T${endTime}`);
        if (Number.isNaN(endAt.getTime())) return setError(tb('invalidRange'));
        if (endAt <= startAt) endAt = addDays(endAt, 1); // уход после полуночи
      }
      const res = await saveBooking({
        id: init?.id,
        resourceId,
        clientId,
        startAt,
        endAt,
        status,
        source: init?.source ?? 'ADMIN',
        tariff: 'CUSTOM',
        guests: Math.max(1, Number(guests) || 1),
        total: total === '' ? 0 : Math.max(0, Number(total) || 0),
        deposit: init?.deposit ?? 0,
        prepayment: prepayment === '' ? 0 : Math.max(0, Number(prepayment) || 0),
        paymentMethod: paymentMethod === '' ? null : (paymentMethod as (typeof PAYMENT_METHODS)[number]),
        discountType: init?.discountType ?? 'NONE',
        discountValue: init?.discountValue ?? 0,
        comment: comment.trim() || undefined,
        clientTags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      });
      if (!res.ok) {
        if (res.error === 'OVERLAP') return setError(tb('occupied'));
        if (res.error === 'INVALID_RANGE') return setError(tb('invalidRange'));
        return setError(('message' in res && res.message) ? String(res.message) : String(res.error));
      }
      onSaved();
    } catch {
      setError(tb('errGeneric'));
    } finally {
      setSaving(false);
    }
  }

  // «Гости ушли»: конец = сейчас, статус «Реализовано» — стол сразу свободен.
  async function finishSeating() {
    if (!init) return;
    setError(null);
    setSaving(true);
    try {
      const endAt = new Date(Math.max(Date.now(), init.startAt.getTime() + 60_000));
      const res = await saveBooking({
        id: init.id,
        resourceId: init.resourceId,
        clientId: init.clientId,
        startAt: init.startAt,
        endAt,
        status: 'COMPLETED',
        source: init.source,
        tariff: 'CUSTOM',
        guests: init.guests,
        total: total === '' ? init.total : Math.max(0, Number(total) || 0),
        deposit: init.deposit,
        prepayment: prepayment === '' ? init.prepayment : Math.max(0, Number(prepayment) || 0),
        paymentMethod: paymentMethod === '' ? null : (paymentMethod as (typeof PAYMENT_METHODS)[number]),
        discountType: init.discountType,
        discountValue: init.discountValue,
        comment: comment.trim() || undefined,
      });
      if (res.ok) onSaved();
      else setError(tb('errGeneric'));
    } catch {
      setError(tb('errGeneric'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking() {
    if (!init) return;
    setSaving(true);
    try {
      const res = await cancelBookingAction(init.id);
      if (res.ok) onSaved();
      else setError(tb('errGeneric'));
    } finally {
      setSaving(false);
    }
  }

  const rName = (r: MockResource) => (locale === 'kk' ? r.nameKk : r.nameRu);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            {mode === 'create' ? tb('createTitle') : tb('editTitle')}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          <ClientPicker clients={clients} value={clientId} initialName={initialClientName}
            onChange={(id) => {
              setClientId(id);
              // Смена клиента → поле перезаполняется его тегами.
              setTags((clients.find((c) => c.id === id)?.tags ?? []).join(', '));
            }} />
          <div className={dialogLabel}>
            {tb('clientTags')}
            <TagsField value={tags} onChange={setTags} />
          </div>

          <label className={dialogLabel}>
            {tb('resource')}
            <select className={dialogField} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              {floors.map(([floor, tables]) => (
                <optgroup key={floor} label={tc('floor', {n: floor})}>
                  {tables.map((r) => (
                    <option key={r.id} value={r.id}>
                      {rName(r)} · {r.capacity}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className={dialogLabel}>
              {tb('date')}
              <input type="date" className={dialogField} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className={dialogLabel}>
              {tb('arrival')}
              <input type="time" className={dialogField} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className={dialogLabel}>
              {tb('until')}
              <input type="time" className={dialogField} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={dialogLabel}>
              {tb('guests')}
              <input type="number" min={1} className={dialogField} value={guests} onChange={(e) => setGuests(e.target.value)} />
            </label>
            <label className={dialogLabel}>
              {tb('status')}
              <select className={dialogField} value={status} onChange={(e) => setStatus(e.target.value as MockBooking['status'])}>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>{ts(s)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={dialogLabel}>
              {tb('total')}
              <input type="number" min={0} className={dialogField} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" />
            </label>
            <label className={dialogLabel}>
              {tb('prepayment')}
              <input type="number" min={0} className={dialogField} value={prepayment} onChange={(e) => setPrepayment(e.target.value)} placeholder="0" />
            </label>
          </div>

          <label className={dialogLabel}>
            {tb('paymentMethod')}
            <select className={dialogField} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{tpm(m)}</option>
              ))}
            </select>
          </label>

          <label className={dialogLabel}>
            {tb('comment')}
            <textarea className={dialogField} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>

          {error && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {mode === 'edit' && init && init.status !== 'CANCELLED' ? (
            <div className="flex flex-wrap gap-2">
              {init.status !== 'COMPLETED' && (
                <button
                  onClick={finishSeating}
                  disabled={saving}
                  className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  {tb('finish')}
                </button>
              )}
              <button
                onClick={cancelBooking}
                disabled={saving}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/40"
              >
                {tb('cancelBooking')}
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-subtle">
              {tb('close')}
            </button>
            <button
              onClick={save}
              disabled={saving || !clientId}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mode === 'create' ? tb('create') : tb('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
