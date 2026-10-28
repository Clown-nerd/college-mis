# Development & Production Setup (MIS + LMS Platform)

## Requirements

- Node.js 20 or newer
- npm 10+
- MySQL 8 (recommended for production persistence; an automatic in-memory fallback is used when `DATABASE_URL` is omitted or unreachable in local development)

## Run locally

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env` and optionally set `DATABASE_URL` for a MySQL 8 database.
3. If using MySQL, apply the MIS and LMS migrations (`drizzle/0000_gray_blindfold.sql` through `drizzle/0009_lms_platform.sql`) with `npm run db:push`.
4. Start the app with `npm run dev` (binds to `http://0.0.0.0:3000`).

## Persistent Object Storage & Safe File Handling

- **Production S3 / R2 / MinIO**: Set `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`, and optional `STORAGE_ENDPOINT` / `STORAGE_FORCE_PATH_STYLE`.
- **Persistent Local Object Storage**: When S3 is not configured, uploaded student documents, LMS module resources, assignment attachments, learner submissions, and annotated feedback files are stored persistently on disk under `STORAGE_LOCAL_DIR` (defaults to `.data/storage`) rather than ephemeral in-memory `data:` URLs.
- **Signed Access & Security Headers**: Files are served through HMAC-signed URLs (`GET /api/storage/files?key=...&expires=...&sig=...`) with `X-Content-Type-Options: nosniff` and sandboxed `Content-Security-Policy` headers. Uploads are validated on the server (`validateSafeUpload`) against an explicit MIME-type allowlist and a 12 MB size ceiling.

## Database Migrations, Backup & Rollback

- Forward migration for the LMS schema is located in `drizzle/0009_lms_platform.sql` and adds 19 relational tables (`lmsCourseSpaces`, `lmsModules`, `lmsModuleItems`, `lmsItemCompletions`, `lmsGradeCategories`, `lmsAssignmentConfigs`, `lmsAssignmentExtensions`, `lmsSubmissionVersions`, `lmsQuestionBank`, `lmsQuizzes`, `lmsQuizQuestions`, `lmsQuizAttempts`, `lmsGradebookEntries`, `lmsAnnouncements`, `lmsDiscussionTopics`, `lmsDiscussionReplies`, `lmsCourseMessages`, `lmsNotifications`, `lmsNotificationPreferences`).
- **Rollback**: A complete, dependency-ordered `DROP TABLE IF EXISTS` rollback block is included at the bottom of `drizzle/0009_lms_platform.sql`.
- **Backup & Recovery**: Back up both the MySQL database (`mysqldump --single-transaction`) and the object storage bucket or `.data/storage` volume prior to schema upgrades.

## Online Assessment Integrity & Proctoring Scope

- Quiz start times, availability windows, attempt limits, and countdown timers are enforced authoritatively on the server (`evaluateQuizAttemptWindow`, `isQuizAttemptWithinTimeLimit`).
- Answers can be autosaved during an active attempt and automatically recovered if a learner's connection drops.
- Standard web-browser quizzes do **not** provide OS-level lockdown or hardware webcam proctoring; this scope is explicitly disclosed in the learner quiz runner interface.

## Production build & deployment

1. Verify types and tests: `npm run check && npm test`
2. Build client and server bundles: `npm run build`
3. Start production server: `npm start`
4. Health and readiness probe is available at `GET /api/health`.
