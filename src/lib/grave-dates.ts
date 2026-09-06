/** Accept actual calendar dates and timezone-qualified ISO timestamps. */
export function isValidGraveDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)))?$/.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number.isFinite(Date.parse(value))
}

export function hasOrderedGraveDates(bornAt: unknown, diedAt: unknown): boolean {
  return bornAt == null || diedAt == null || (
    isValidGraveDate(bornAt) && isValidGraveDate(diedAt) && Date.parse(bornAt) <= Date.parse(diedAt)
  )
}
