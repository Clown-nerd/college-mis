import { describe, expect, it } from "vitest";
import { buildIcalendar } from "./calendar";

describe("student calendar export", () => {
  it("produces a recurring iCalendar event that starts on the meeting weekday within the term", () => {
    const calendar = buildIcalendar([{ meetingId: 42, weekday: "monday", startsAt: "09:00", endsAt: "10:30", room: "A-204", section: "A", courseCode: "CSC101", courseTitle: "Foundations, Computing", termName: "Spring 2026", termStartsAt: new Date("2026-01-06T00:00:00"), termEndsAt: new Date("2026-05-15T00:00:00") }]);
    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("DTSTART:20260112T090000");
    expect(calendar).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260515T235959");
    expect(calendar).toContain("SUMMARY:CSC101 · Foundations\\, Computing · A");
  });
});
