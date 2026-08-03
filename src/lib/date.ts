// This module provides time parsing and display formatting methods。

// Bundle ISO Or the database time string is parsed into Date。
function parseTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

// Bundle ISO UTC String parsed into timestamp，Compatible with none Z old format。
function parseUtcTime(value: string) {
  const text = value.trim()
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  const utcValue = hasTimezone ? text : `${text.replace(" ", "T")}Z`
  const time = new Date(utcValue).getTime()

  if (Number.isNaN(time)) {
    return null
  }

  return time
}

// Format photo shooting time as local date，for list display。
function formatPhotoTakenDate(takenTime: string | null | undefined, locale = "zh") {
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

// Format photo shooting time as local date and time，for detailed display。
function formatPhotoTakenDateTime(takenTime: string | null | undefined, locale = "zh") {
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

// Format recycling time as relative description。
function formatRecycleTime(recycleTime?: string | null, locale = "zh") {
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
    return locale === "zh" ? "1 within hours" : "Within 1 hour"
  }

  if (diff < day) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(diff / hour), "hour")
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(diff / day), "day")
}

// Read the current browser relative UTC offset minutes，East Eighth District is 480。
function getLocalTzOffsetMin() {
  return -new Date().getTimezoneOffset()
}

export { formatPhotoTakenDate, formatPhotoTakenDateTime, formatRecycleTime, getLocalTzOffsetMin, parseTime, parseUtcTime }
