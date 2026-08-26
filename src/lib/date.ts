// This module provides time parsing and display formatting methods.

// Bundle ISO Or the database time string is parsed into Date cleanly without day-shift bugs.
function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  // Handle pure local date format "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS" without timezone offset
  const localMatch = text.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localMatch && !text.includes('Z') && !/[+-]\d{2}:\d{2}$/.test(text)) {
    const [_, y, m, d, h, min, s] = localMatch;
    const local = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(min || 0), Number(s || 0));
    if (!Number.isNaN(local.getTime())) {
      return local;
    }
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

// Parse ISO or database date string into timestamp accurately.
function parseUtcTime(value: string | Date | number) {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === "number") {
    return value
  }
  if (!value) {
    return null
  }

  const text = String(value).trim()
  const date = new Date(text)
  if (!Number.isNaN(date.getTime())) {
    return date.getTime()
  }

  // Fallback for space-separated date strings (e.g. "2026-08-16 14:25:00")
  const formatted = text.replace(" ", "T")
  const fallbackDate = new Date(formatted)
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.getTime()
  }

  return null
}

// Format photo shooting time as local date, for list display.
function formatPhotoTakenDate(takenTime: string | null | undefined, locale = "en") {
  if (!takenTime) {
    return null
  }

  const date = parseTime(takenTime)
  if (!date) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date)
}

// Format photo shooting time as local date and time, for detailed display.
function formatPhotoTakenDateTime(takenTime: string | null | undefined, locale = "en") {
  if (!takenTime) {
    return null
  }

  const date = parseTime(takenTime)
  if (!date) {
    return takenTime
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

// Format recycling time as relative description.
function formatRecycleTime(recycleTime?: string | null, locale = "en") {
  if (!recycleTime) {
    return ""
  }

  const time = parseUtcTime(recycleTime)
  if (time === null) {
    return ""
  }

  const diff = Math.max(0, Date.now() - time)
  const hour = 60 * 60 * 1000
  const day = 24 * hour

  if (diff < hour) {
    return "Within 1 hour"
  }

  if (diff < day) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(diff / hour), "hour")
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(diff / day), "day")
}

// Format comment or post time as human-friendly relative description (e.g. "Just now", "5m ago", "2h ago", "3d ago").
function formatRelativeTime(dateStr?: string | null, locale = "en"): string {
  if (!dateStr) {
    return ""
  }

  const time = parseUtcTime(dateStr)
  if (time === null) {
    return dateStr
  }

  const diffMs = Math.max(0, Date.now() - time)
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) {
    return "Just now"
  }

  if (diffMin < 60) {
    return `${diffMin}m ago`
  }

  if (diffHour < 24) {
    return `${diffHour}h ago`
  }

  if (diffDay < 30) {
    return `${diffDay}d ago`
  }

  const date = new Date(time)
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

// Format "X years ago" description in English.
function formatYearsAgo(yearsAgo: number, _locale?: string): string {
  return yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`;
}

// Read the current browser relative UTC offset minutes, East Eighth District is 480.
function getLocalTzOffsetMin() {
  return -new Date().getTimezoneOffset()
}

export {
  formatPhotoTakenDate,
  formatPhotoTakenDateTime,
  formatRecycleTime,
  formatRelativeTime,
  formatYearsAgo,
  getLocalTzOffsetMin,
  parseTime,
  parseUtcTime,
}

