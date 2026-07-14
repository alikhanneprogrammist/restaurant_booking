import {fromAlmaty, toAlmaty} from './time';
import type {MockResource, MockAddon, MockClient, MockUser, MockBooking} from './types';

// Демо-данные ресторана «Асату» для prisma/seed.ts: 3 этажа × 8 столов.
// Бронь стола — ячейка «стол × дата»: интервал от времени прихода до конца дня
// [приход, следующие 00:00), поэтому один стол нельзя забронировать дважды в день
// (exclusion constraint booking_no_overlap), а календарь-шахматка группирует по этажам.

const TODAY_WALL = toAlmaty(new Date());

/** Стеночное время Almaty (offset дней от сегодня) → инстант. */
const day = (offset: number, h: number, min = 0) => {
  const wall = new Date(TODAY_WALL);
  wall.setDate(wall.getDate() + offset);
  wall.setHours(h, min, 0, 0);
  return fromAlmaty(wall);
};

// ───────────────────────── Столы по этажам ─────────────────────────────

const TABLES_PER_FLOOR = 8;
const FLOOR_COLORS = ['#0ea5e9', '#10b981', '#f59e0b']; // 1 / 2 / 3 этаж

export const MOCK_RESOURCES: MockResource[] = Array.from(
  {length: 3 * TABLES_PER_FLOOR},
  (_, i): MockResource => {
    const floor = Math.floor(i / TABLES_PER_FLOOR) + 1;
    const n = i + 1;
    return {
      id: `r-t${n}`,
      kind: 'COMPLEX',
      nameRu: `Стол ${n}`,
      nameKk: `${n}-үстел`,
      capacity: 4 + (i % 3) * 4, // 4 / 8 / 12 мест
      color: FLOOR_COLORS[floor - 1],
      photos: [],
      isActive: true,
      sortOrder: n,
      floor,
      floors: [],
      hasKaraoke: false,
      hasFinnishSauna: false,
      hasHammam: false,
      hasPool: false,
      hasBanquet: false,
      restRooms: 0,
      hasKitchen: false,
      hourlyPrice: 0, // посадка без почасовой цены — сумма вводится вручную
      minHours: 0,
      halfDayPrice: null,
      fullDayPrice: null,
      weekendPrice: null,
      weekdayMinDeposit: null,
    };
  },
);

// ───────────────────────── Доп.услуги ──────────────────────────────────

export const MOCK_ADDONS: MockAddon[] = [
  {id: 'a-cake', nameRu: 'Торт', nameKk: 'Торт', price: 15000, unit: 'PER_ITEM'},
  {id: 'a-decor', nameRu: 'Декор стола', nameKk: 'Үстел декоры', price: 30000, unit: 'PER_EVENT'},
  {id: 'a-hookah', nameRu: 'Кальян', nameKk: 'Кальян', price: 15000, unit: 'PER_ITEM'},
  {id: 'a-music', nameRu: 'Живая музыка', nameKk: 'Тірі музыка', price: 50000, unit: 'PER_EVENT'},
];

// ───────────────────────── Сотрудники ──────────────────────────────────

export const MOCK_USERS: MockUser[] = [
  {id: 'u-admin', name: 'Администратор', phone: '+77010000001', email: 'admin@asatu.kz', role: 'ADMIN', isActive: true},
  {id: 'u-m1', name: 'Айдана (смена 1)', phone: '+77010000002', role: 'MANAGER', isActive: true},
  {id: 'u-m2', name: 'Бекзат (смена 2)', phone: '+77010000003', role: 'MANAGER', isActive: true},
];

// ───────────────────────── Клиенты ─────────────────────────────────────

export const MOCK_CLIENTS: MockClient[] = [
  {id: 'c-1', name: 'Алихан Серіков', phone: '+77011234567', tags: ['постоянный'], dateOfBirth: new Date(Date.UTC(1990, 2, 15))},
  {id: 'c-2', name: 'Дмитрий Ким', phone: '+77019876543', dateOfBirth: new Date(Date.UTC(1988, 6, 3))},
  {id: 'c-3', name: 'Айгерім Нур', phone: '+77017778899', dateOfBirth: new Date(Date.UTC(1995, 10, 22))},
  {id: 'c-4', name: 'Санжар Ахметов', phone: '+77021112233', note: 'Просит второй этаж'},
  {id: 'c-5', name: 'Мария Ли', phone: '+77055556677', tags: ['блогер']},
  {id: 'c-6', name: 'Ерлан Досжанов', phone: '+77770001122', note: 'ТОО «QazTrade» — корпоративы', tags: ['B2B']},
];

// ───────────────────────── Демо-брони (ячейки стол × дата) ─────────────
// startAt = дата + время прихода, endAt = следующие 00:00 (конец дня).

const cellEnd = (offset: number) => day(offset + 1, 0);

export const MOCK_BOOKINGS: MockBooking[] = [
  {
    id: 'b-1', resourceId: 'r-t1', clientId: 'c-1',
    startAt: day(0, 19), endAt: cellEnd(0),
    status: 'CONFIRMED', source: 'PHONE', tariff: 'CUSTOM', guests: 6,
    total: 0, deposit: 0, prepayment: 10000, paymentMethod: 'KASPI',
    discountType: 'NONE', discountValue: 0, comment: 'Постоянный гость',
    addons: [],
  },
  {
    id: 'b-2', resourceId: 'r-t2', clientId: 'c-3',
    startAt: day(0, 13), endAt: cellEnd(0),
    status: 'ARRIVED', source: 'WHATSAPP', tariff: 'CUSTOM', guests: 4,
    total: 0, deposit: 0, prepayment: 0,
    discountType: 'NONE', discountValue: 0,
    addons: [],
  },
  {
    id: 'b-3', resourceId: 'r-t9', clientId: 'c-6',
    startAt: day(1, 18), endAt: cellEnd(1),
    status: 'PREPAID', source: 'B2B', tariff: 'CUSTOM', guests: 12,
    total: 150000, deposit: 0, prepayment: 50000, paymentMethod: 'BANK',
    discountType: 'NONE', discountValue: 0, comment: 'Корпоратив QazTrade, 2 этаж',
    addons: [{addonId: 'a-decor', qty: 1, priceAtBooking: 30000}],
  },
  {
    id: 'b-4', resourceId: 'r-t17', clientId: 'c-5',
    startAt: day(-2, 20), endAt: cellEnd(-2),
    status: 'COMPLETED', source: 'INSTAGRAM', tariff: 'CUSTOM', guests: 8,
    total: 80000, deposit: 0, prepayment: 0, paymentMethod: 'CASH',
    discountType: 'NONE', discountValue: 0,
    addons: [{addonId: 'a-cake', qty: 1, priceAtBooking: 15000}],
  },
  {
    id: 'b-5', resourceId: 'r-t3', clientId: 'c-2',
    startAt: day(1, 19, 30), endAt: cellEnd(1),
    status: 'NEW', source: 'WIDGET', tariff: 'CUSTOM', guests: 2,
    total: 0, deposit: 0, prepayment: 0,
    discountType: 'NONE', discountValue: 0, comment: 'Онлайн-заявка',
    addons: [],
  },
  {
    id: 'b-6', resourceId: 'r-t10', clientId: 'c-4',
    startAt: day(-1, 18), endAt: cellEnd(-1),
    status: 'CANCELLED', source: 'PHONE', tariff: 'CUSTOM', guests: 10,
    total: 0, deposit: 0, prepayment: 0,
    discountType: 'NONE', discountValue: 0, comment: 'Отмена за день',
    addons: [],
  },
];
