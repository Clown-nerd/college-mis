# College MIS Research Evidence

## Research purpose

This evidence translates the requested institutional administration system into a secure, interoperable, and practical first-release scope. It is a product-design reference rather than legal advice; institutional counsel must validate the final privacy, retention, and finance controls for the college’s jurisdiction.

## Evidence-led capability model

| Capability area | Evidence and implication for this MIS | Priority |
|---|---|---|
| Student lifecycle | A higher-education SIS commonly centralizes admissions, enrollment, scheduling, grades, academic records, performance tracking, and financial management. The core application should therefore use one student identifier and a lifecycle that connects applicants, enrolments, results, and financial standing. [1] | P0 |
| Academic model | OneRoster defines interoperable representations of users, courses, enrolments, organizations, grades, and rosters. The domain model should keep these entities distinct and link them through identifiers. [2] | P0 |
| Higher-ed interoperability | Edu-API identifies the SIS as the system of record for biographic data, course catalogues, enrolments, and final outcomes, while other campus systems retain specialized teaching-and-learning data. The design should expose typed boundaries rather than duplicate records. [3] | P0 foundation |
| Student privacy | FERPA defines education records broadly and requires controls around personally identifiable information. The UI must avoid indiscriminate record exposure, and the data model must accommodate access/disclosure history and consent-related governance. [4] [5] | P0 |
| Authorisation | NIST defines RBAC as roles associated with permitted actions and least privilege as restricting privileges to the minimum needed for assigned tasks. The system should use server-enforced roles and granular permissions, not client-side visibility alone. [6] [7] | P0 |
| Auditability | Audit-trail guidance emphasizes identity, time, action, result, and affected information so actions can be reconstructed. All privileged changes and academic/finance changes should produce immutable audit events. [8] | P0 |
| Institutional records | Federal student-aid guidance identifies programme, enrolled courses, admission/enrolment status, fiscal transactions, and supporting records as auditable institutional information. A production rollout needs retention, document metadata, and finance traceability. [9] | P1 |
| Registry operations | AACRAO identifies enrollment, admissions, academic records, student services, data integrity, compliance, user support, and pre-production testing as core systems-management competencies. The roadmap must retain workflows, reporting, support states, and test gates. [10] | P0–P2 |

## Initial capability order

| Release order | Module | Outcome | Dependency |
|---:|---|---|---|
| 1 | Identity, roles, audit | Role-aware institutional access and protected activity history | Authenticated user foundation |
| 2 | Student registry | Authoritative student profiles, status, contacts, and academic history | Identity and audit |
| 3 | Academic catalogue and registration | Departments, programmes, terms, courses, offerings, prerequisites, and enrolment | Registry |
| 4 | Teaching operations | Faculty assignment, timetable, class roster, attendance, and assessment entry | Academic catalogue and registration |
| 5 | Student achievement and risk | Results, GPA, transcript-ready history, at-risk indicators, reporting dashboard | Teaching operations |
| 6 | Finance and admissions foundations | Invoices, payments, scholarships, applicants, decisions, and conversion controls | Registry and audit |
| 7 | Requests, documents, analytics, exports, governance reports | Operational workflow and institutional intelligence | Audit and all operational modules |

## References

[1]: https://www.ellucian.com/blog/what-student-information-system-higher-ed "Ellucian — What is a Student Information System (SIS)?"
[2]: https://www.1edtech.org/standards/oneroster "1EdTech — OneRoster"
[3]: https://www.1edtech.org/standards/edu-api "1EdTech — Edu-API"
[4]: https://studentprivacy.ed.gov/ferpa "U.S. Department of Education — FERPA"
[5]: https://studentprivacy.ed.gov/frequently-asked-questions "U.S. Department of Education — FERPA Frequently Asked Questions"
[6]: https://csrc.nist.gov/glossary/term/role_based_access_control "NIST — Role-Based Access Control"
[7]: https://csrc.nist.gov/glossary/term/least_privilege "NIST — Least Privilege"
[8]: https://csrc.nist.rip/publications/nistpubs/800-12/800-12-html/chapter18.html "NIST SP 800-12 — Audit Trails"
[9]: https://fsapartners.ed.gov/knowledge-center/fsa-handbook/2025-2026/vol2/ch7-record-keeping-privacy-electronic-processes "Federal Student Aid Handbook — Record Keeping, Privacy, & Electronic Processes"
[10]: https://www.aacrao.org/resources-publications/competency-set/systems-management/ "AACRAO — Systems Management"
