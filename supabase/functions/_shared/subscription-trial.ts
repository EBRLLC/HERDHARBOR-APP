export const HERDHARBOR_TIME_ZONE = "America/New_York";
export const HARD_LAUNCH_AT = "2026-10-01T04:00:00.000Z";

function partsInZone(date, timeZone = HERDHARBOR_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function zonedTimeToUtc(parts, timeZone = HERDHARBOR_TIME_ZONE) {
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsInZone(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = targetAsUtc - actualAsUtc;
    guess += correction;
    if (Math.abs(correction) < 1000) break;
  }
  return new Date(guess);
}

export function addCalendarMonthInZone(value, timeZone = HERDHARBOR_TIME_ZONE) {
  const source = new Date(String(value || ""));
  if (Number.isNaN(source.getTime())) return null;
  const parts = partsInZone(source, timeZone);
  const nextMonthIndex = parts.month;
  const targetYear = parts.year + Math.floor(nextMonthIndex / 12);
  const targetMonth = (nextMonthIndex % 12) + 1;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return zonedTimeToUtc({
    ...parts,
    year: targetYear,
    month: targetMonth,
    day: Math.min(parts.day, daysInTargetMonth)
  }, timeZone);
}

export function initialTrialEndsAt(createdAt) {
  const launch = new Date(HARD_LAUNCH_AT);
  const rolling = addCalendarMonthInZone(createdAt);
  if (!rolling || rolling.getTime() < launch.getTime()) return launch;
  return rolling;
}

export function trialSnapshot(user, now = new Date()) {
  const trialEnd = initialTrialEndsAt(user?.created_at);
  return {
    startsAt: user?.created_at || null,
    endsAt: trialEnd.toISOString(),
    active: now.getTime() < trialEnd.getTime()
  };
}
