export const EVENT_LOG_PAGE_SIZES = [50, 100, 250, 500, 1000] as const;

export type EventLogPageSize = (typeof EVENT_LOG_PAGE_SIZES)[number];

export const DEFAULT_EVENT_LOG_PAGE_SIZE: EventLogPageSize = 100;

export type EventLogPageWindow<T> = {
  page: number;
  totalPages: number;
  slice: T[];
  from: number;
  to: number;
  total: number;
};

export function isEventLogPageSize(value: number): value is EventLogPageSize {
  return (EVENT_LOG_PAGE_SIZES as readonly number[]).includes(value);
}

export function clampEventLogPage(page: number, total: number, pageSize: number): number {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  if (!Number.isFinite(page) || page < 0) {
    return 0;
  }
  return Math.min(Math.floor(page), totalPages - 1);
}

/**
 * `items` is oldest-first (append order). Pages are newest-first so page 0 is
 * the live tail and matches the table sort (newest at the top).
 */
export function eventLogPageWindow<T>(
  items: T[],
  page: number,
  pageSize: number,
): EventLogPageWindow<T> {
  const total = items.length;
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = clampEventLogPage(page, total, size);
  const end = total - safePage * size;
  const start = Math.max(0, end - size);
  const slice = items.slice(start, end).reverse();
  return {
    page: safePage,
    totalPages,
    slice,
    from: total === 0 ? 0 : safePage * size + 1,
    to: total === 0 ? 0 : safePage * size + slice.length,
    total,
  };
}
