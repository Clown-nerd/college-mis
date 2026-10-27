# College MIS: Onboarding and Invitation Enhancement Release

## Delivered capabilities

This release completes the requested onboarding and local-development workflows for the College MIS. The development-only local **student** identity now creates and retains one active student record automatically, so the student dashboard, academic record, progression report, private timetable, and finance view resolve against an academic profile without an administrator manually linking the account.

Administrators can now provision teaching, technical/non-teaching, finance, registry, and administration personnel with a least-privileged institutional role. Each staff profile receives a unique invitation reference. The workforce directory presents an explicit invitation state, moving from **not sent** to **drafted**, then to a deliberately simulated **sent** or **failed** result. Each preparation and delivery-state transition is recorded through the protected governance workflow and audit ledger.

The release adds tailored, interactive onboarding checklists for each application role. Completion is stored per role and browser in local storage. The checklists direct users to the relevant institutional workspaces without exposing workflows outside their role boundaries.

| Area | Delivered behavior | Control boundary |
| --- | --- | --- |
| Local student identity | Automatically provisions or reuses `LOCAL-STUDENT-001` for the development student role | Development-only; no production account is created by this path |
| Staff provisioning | Admin assigns category and least-privileged access role | Administrator-only server procedure and audit entry |
| Invitation draft | Composes a traceable `mailto:` draft and records `drafted` | No external provider is assumed or impersonated |
| Delivery tracking | Records simulated `sent` or `failed` states | Clearly labelled simulation with auditable transitions |
| Role onboarding | Shows role-specific steps and completion status | Local browser storage, scoped by role |

## Validation completed

The final automated quality gate passed with **17 test files and 30 tests**. This includes direct tests for local student record creation and duplicate prevention, persisted invitation update payloads for draft/sent/failed outcomes, and the administrator-only simulated-delivery router contract. Type checking and the production build also completed successfully.

An administrator workflow test provisioned `Development Teaching Invitee` (`DEV-TCH-001`), prepared the invitation draft, and recorded a simulated **sent** result in the live development interface. A local student workflow test confirmed the linked student dashboard and verified that an interactive checklist completion persisted after navigation. The current production bundle emits a non-blocking large-client-chunk advisory; the build completes successfully.

## Production handoff

The current invitation flow **does not send real email**. It prepares an administrator-controlled mail draft and records a simulated delivery result because no external email provider has been configured or authorized. To enable actual sending, select and authorize an approved mail provider, then replace the simulated delivery procedure with a provider-backed server integration while retaining the existing audit events and failure-state handling.

Before production use, disable development local authentication with `LOCAL_AUTH_ENABLED=false` and `VITE_LOCAL_AUTH_ENABLED=false`. The server also blocks this local-auth path when `NODE_ENV=production`, providing a second safeguard. Existing institutional OAuth remains available and unchanged.
