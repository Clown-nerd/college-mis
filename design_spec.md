# College MIS Design Specification

## Objective

College MIS is an authenticated institutional workspace for the teams responsible for admissions, registry, teaching, student support, and finance. It will provide a dependable system of record for the student lifecycle while making daily academic operations easier to scan and act upon. The first implementation focuses on the P0 operational core, with P1 models established where they secure the student record and reduce migration risk.

The application is designed as a responsive web application using the initialized React, tRPC, Drizzle, MySQL/TiDB, and session-authentication stack. It is an institutional administration product, not a public marketing site.

## Interaction hierarchy

**Operational status → priority exceptions → direct role-appropriate action → supporting academic context → governance details.**

The design will use a calm, editorial institutional style: a deep navy navigation field, warm paper-toned workspace, precise serif display headings, compact sans-serif operational typography, restrained teal and amber status accents, and subtle surfaces. Motion will be limited to short opacity and transform transitions, with an explicit reduced-motion fallback. The user’s current task and primary call to action remain visually stable.

## Capability map

| Module ID | Responsibility | Depends on | Delivery scope |
|---|---|---|---|
| identity-governance | Authentication, role assignments, permission checks, auditable events | Platform authentication | P0 |
| student-registry | Student identity, contacts, programme association, status, and academic context | identity-governance, academic-catalogue | P0 |
| academic-catalogue | Departments, programmes, terms, courses, prerequisites, offerings | identity-governance | P0 |
| teaching-operations | Faculty assignments, timetable information, rosters, attendance, grades | student-registry, academic-catalogue | P0 |
| progression-reporting | GPA, transcript-ready results, at-risk indicators, operational dashboard | teaching-operations | P0 |
| finance-foundations | Invoices, financial status, scholarships, waivers, payment references | student-registry, identity-governance | P1 foundation |
| admissions-foundations | Applicants, admissions decisions, conversion reference | academic-catalogue, identity-governance | P1 foundation |
| service-governance | Student requests, document metadata, retention, exports, audit reporting | identity-governance, student-registry | P1–P2 foundation |

Build order: `identity-governance` → `academic-catalogue` and `student-registry` → `teaching-operations` → `progression-reporting` → `finance-foundations`, `admissions-foundations`, and `service-governance`.

## Role and permission design

The service enforces authorisation at the server-procedure boundary. Navigation and action visibility improve usability, but do not grant access. The following matrix is an initial operating model; institutional policy should refine it before a production launch.

| Action family | Administrator | Registrar | Faculty | Student | Finance staff |
|---|---:|---:|---:|---:|---:|
| View operational dashboard | Yes | Yes | Own teaching context | Own academic context | Finance context |
| Maintain users, roles, permissions | Yes | No | No | No | No |
| Manage departments, programmes, terms, courses, offerings | Yes | Yes | View assigned | View relevant | View eligibility context |
| Create and update student records | Yes | Yes | View roster members | View own record | View financial identity context |
| Register and withdraw enrolments | Yes | Yes | View roster | View own registrations | View charge context |
| Record attendance and grade results | Yes | No | Assigned offerings only | View published own results | No |
| View and publish results/transcripts | Yes | Yes | Enter assigned grades | View own published results | View standing only |
| Manage invoices, payments, scholarships, waivers | Yes | View financial standing | No | View own items | Yes |
| Review audit events and governance reports | Yes | Own actions only | Own actions only | Own actions only | Finance actions only |

## Initial data model

| Domain | Core tables | Key integrity rules |
|---|---|---|
| Identity and governance | `users`, `roleAssignments`, `auditEvents` | User identity is external-auth backed; role changes and privileged operations create audit events. |
| Academic catalogue | `departments`, `programmes`, `academicTerms`, `courses`, `coursePrerequisites`, `courseOfferings`, `facultyAssignments` | Codes are unique at their intended scope; an offering belongs to one course and one term. |
| Student registry | `students`, `studentProgrammeHistory`, `enrollments` | Student number is unique; programme history retains record changes; one enrollment relates one student to one offering. |
| Teaching and outcomes | `attendanceRecords`, `gradeRecords` | Attendance is unique per enrollment/date; grades capture score, letter, grade points, status, source, and publisher. |
| Finance/admissions/workflow foundations | `invoices`, `scholarships`, `applicants`, `studentRequests`, `documents` | Financial and workflow records retain status and timestamps; document bytes live in object storage, not the database. |

## Interface boundaries

The data layer uses Drizzle query helpers. tRPC procedures validate all input with Zod, verify the user’s permission before data access or mutation, and write an audit event for privileged or record-changing activity. The React client calls those typed procedures and handles loading, empty, success, and failure states without direct REST wrappers.

All timestamps are persisted in UTC. Uploaded files require object storage and metadata only; file bytes must not be placed in relational records. The implementation reserves interoperability-friendly identifiers across people, organizations, courses, offerings, enrollments, and results to support future Edu-API and OneRoster integrations.

## Success criteria

| Area | Testable release condition |
|---|---|
| Security | Role checks occur in every protected server procedure; unauthorized calls return `FORBIDDEN`; record-changing procedures issue audit events. |
| Registry | Authorized staff can create and browse students with identifier, contacts, academic programme, department, status, and academic-history links. |
| Academic operations | Authorized staff can maintain the catalogue and faculty can view their assigned offerings, roster, attendance, and grade entry contexts. |
| Academic record | The system calculates GPA from posted results and exposes only the student’s own published academic record to a student role. |
| Reporting | The dashboard displays real, permission-scoped operational counts or an explicit setup state when no institutional records exist. |
| Quality | The project passes TypeScript checking and Vitest; the UI is keyboard-operable, responsive, and honors reduced-motion settings. |

## Constraints and assumptions

The current build uses the platform’s OAuth session system and its managed database. Institutional historical data, payment-processor settlement, statutory reporting formats, SSO federation, document scanning, and production data migration are intentionally not fabricated. They require institution-specific policy, data mapping, finance-provider integration, security assessment, and acceptance testing before use with real student records.
