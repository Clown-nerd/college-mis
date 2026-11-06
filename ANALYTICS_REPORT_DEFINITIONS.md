# Cohort analytics and export policy (proposal)

## Purpose and scope

This document defines a first staff-facing institutional analytics release using the records already held by the College MIS. It complements the student-facing term progression report; it does not replace individual academic records or make decisions about students. Implementing this proposal in the application should follow institutional review of the open policy decisions below.

## Existing data and limits

- Students have an admission term, programme, and a current lifecycle status (`applicant`, `active`, `leave`, `graduated`, or `withdrawn`).
- Published course grades join to course offerings and academic terms. Course credits and grade points support term GPA and earned-credit summaries.
- Programme history records can mark a student programme as `completed`, `transferred`, or `withdrawn`.
- The existing `students.myProgression` procedure returns published results for the signed-in student's linked record. It does not provide staff cohort analytics.
- Governance currently exposes an administrator-only audit log (most recent 150 events). It does not provide report-export auditing, filters, or a dedicated analytics page.
- There is no persisted per-term student status snapshot. Current lifecycle status alone cannot establish whether a student was retained from one specific term to the next. A retention rate must not be presented until the institution defines the rule and the required historical data is available.

## Proposed first report: cohort progression and completion

### Cohort definition

The default cohort is students grouped by `admissionTermId` (the intake term). Include student records, not applicant-only records. Provide optional programme and department filters based on the student's current programme. Label the report's cohort basis and data-as-of date in both the page and every export.

Because programme changes may occur after admission, grouping by current programme can change historical cohort composition. Show the current-programme filter explicitly; do not describe it as the student's admission programme unless programme history confirms that value.

### Initial measures

| Measure | Proposed definition | Data available / limitation |
| --- | --- | --- |
| Cohort size | Count of student records in the selected admission-term cohort after filters. | Supported by student records and admission term. |
| Current status counts | Counts by current student status: active, leave, graduated, and withdrawn. | Supported as a current snapshot; does not show when a status change occurred. |
| Published GPA | Calculate each student's GPA as credit-weighted published grade points, then take the arithmetic mean of eligible students' GPAs. Exclude students with no published grades from the GPA denominator and show the GPA coverage count. | Supported by published grade records and course credits. Confirm the institution's GPA scale and treatment of repeats/exemptions before release. |
| Credits earned | Sum course credits with a published passing grade per student, summarized by cohort. | Supported, subject to confirmation of the institution's pass-grade and repeat-credit rules. |
| Programme completion count/rate | Count students with a completed programme-history record; rate is completed count divided by cohort size. | A programme-history `completed` value exists, but data consistency with the student `graduated` status needs review. Label as recorded completion until reconciled. |
| Term-to-term retention | Not included in the first release. | Requires an approved definition and historical enrollment/status snapshot logic; current status is insufficient. |

Aggregates must state their denominator, missing-data treatment, and definition on the report. Do not infer that a student is retained merely because their current status is active.

## Access and privacy rules

- **Initial access:** administrators and registrars may view the staff cohort report. Enforce this in server procedures and route guards; hiding a link in the interface is not sufficient.
- **Faculty:** no cross-cohort report access in the first release. A later faculty view may be limited to assigned offerings and approved aggregates.
- **Students, applicants, finance, and non-teaching staff:** no access to institutional cohort analytics or exports.
- **Individual-level data:** do not include student names, student numbers, email, contact details, or individual grades in cohort exports. This release is for aggregate reporting.
- **Small cohorts:** the current minimum cohort size is **1**, so reports will not suppress a result solely because the cohort is small. The college may revise this threshold later. Apply the configured threshold consistently in the interface and export if it changes.
- **Filters:** allow admission term, department, and programme only where the resulting cohort satisfies the suppression rule. Avoid filters that expose sensitive characteristics not needed for the defined purpose.
- **Use limitation:** reports describe recorded data and should not be used as the sole basis for individual academic, financial, or admissions decisions.

## Export and audit rules

- Offer CSV export of the same aggregate rows and filters currently shown on screen; do not provide a separate or broader data path.
- Include report name/version, selected filters, generated-at timestamp, data-as-of timestamp, measure definitions, denominator/coverage fields, and suppression markers in the export metadata or companion header rows.
- Record each successful export as an audit event with actor, role (when available), report identifier/version, filters, row count, output format, and timestamp. Do not store the exported contents or student-level data in the audit event.
- Failed or denied export attempts should not return report data. Record denied attempts if the existing audit policy supports security events; do not claim an event is logged until implemented and verified.
- Restrict audit-log review to administrators as it is today. Add export-event filters or a report-specific audit view as part of the analytics release so administrators can review who exported which report and when.

## Decisions needed from the institution before release

1. **Set:** use a minimum cohort size of 1 for display and export. The college can revise this later.
2. **For the college to decide later:** confirm the official GPA scale, passing grades, repeated-course treatment, and treatment of exemptions/withdrawals in cohort GPA and earned credits.
3. **For the college to decide later:** confirm whether a completed programme-history record, `students.status = graduated`, or a reconciled combination is the official completion source.
4. **For the college to decide later:** approve the purposes and authorized roles for each report, plus any retention period for exported files outside the MIS.
5. **For the college to decide later:** define term-to-term retention (for example, enrolled in the next eligible term) and approve how leaves, transfers, stop-outs, and programme changes are treated before adding that measure.

## Recommended delivery sequence

1. Review and reconcile existing programme-completion and grade data; approve the decisions above.
2. Implement server-side aggregate queries and role checks, with no student-level export path.
3. Add the staff report page, explicit measure definitions, filters, suppression behavior, and audited CSV export.
4. Verify aggregate calculations against hand-checked records, role denial at the server boundary, small-cohort suppression, and export audit entries.
5. Add retention only after its definition and historical data approach are approved.
