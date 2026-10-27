export type CalendarScheduleEvent = {
  meetingId: number;
  weekday: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  section: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  termStartsAt: Date;
  termEndsAt: Date;
};

const weekdayIndex: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const escapeIcs = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
const formatIcsDate = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
function firstMeetingDate(termStartsAt: Date, weekday: string, time: string) { const date = new Date(termStartsAt); date.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0); date.setDate(date.getDate() + ((weekdayIndex[weekday] - date.getDay() + 7) % 7)); return date; }

export function buildIcalendar(events: CalendarScheduleEvent[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//College MIS//Student Schedule//EN", "CALSCALE:GREGORIAN", ...events.flatMap(event => { const start = firstMeetingDate(new Date(event.termStartsAt), event.weekday, event.startsAt); const end = firstMeetingDate(new Date(event.termStartsAt), event.weekday, event.endsAt); const until = new Date(event.termEndsAt); until.setHours(23, 59, 59, 0); return ["BEGIN:VEVENT", `UID:college-mis-${event.meetingId}@schedule`, `DTSTAMP:${formatIcsDate(new Date())}`, `DTSTART:${formatIcsDate(start)}`, `DTEND:${formatIcsDate(end)}`, `RRULE:FREQ=WEEKLY;UNTIL=${formatIcsDate(until)}`, `SUMMARY:${escapeIcs(`${event.courseCode} · ${event.courseTitle} · ${event.section}`)}`, `LOCATION:${escapeIcs(event.room || "Room pending")}`, `DESCRIPTION:${escapeIcs(`${event.termName} · Weekly class meeting exported from College MIS.`)}`, "END:VEVENT"]; }), "END:VCALENDAR"].join("\r\n");
}
