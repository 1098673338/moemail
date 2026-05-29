const UTC_PLUS_8_OFFSET_MS = 8 * 60 * 60 * 1000

function padDatePart(value: number) {
  return value.toString().padStart(2, "0")
}

export function isPermanentDate(value: Date | string | number) {
  const date = new Date(value)

  if (isNaN(date.getTime())) {
    return false
  }

  return date.getUTCFullYear() === 9999
}

export function formatUtcPlus8DateTime(value: Date | string | number) {
  const date = new Date(value)

  if (isNaN(date.getTime())) {
    return ""
  }

  const shiftedDate = new Date(date.getTime() + UTC_PLUS_8_OFFSET_MS)

  return [
    shiftedDate.getUTCFullYear(),
    padDatePart(shiftedDate.getUTCMonth() + 1),
    padDatePart(shiftedDate.getUTCDate()),
  ].join("-") + " " + [
    padDatePart(shiftedDate.getUTCHours()),
    padDatePart(shiftedDate.getUTCMinutes()),
    padDatePart(shiftedDate.getUTCSeconds()),
  ].join(":")
}

export function formatUtcPlus8DateTimeToMinute(value: Date | string | number) {
  const date = new Date(value)

  if (isNaN(date.getTime())) {
    return ""
  }

  const shiftedDate = new Date(date.getTime() + UTC_PLUS_8_OFFSET_MS)

  return [
    shiftedDate.getUTCFullYear(),
    padDatePart(shiftedDate.getUTCMonth() + 1),
    padDatePart(shiftedDate.getUTCDate()),
  ].join("-") + " " + [
    padDatePart(shiftedDate.getUTCHours()),
    padDatePart(shiftedDate.getUTCMinutes()),
  ].join(":")
}
