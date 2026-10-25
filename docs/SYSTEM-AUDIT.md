# HapIsabela system audit — 25 October 2026

Scope: repository HTML/CSS/JS, API, migrations 001–006, shared templates, role builders, tests, service worker, deployment config, and read-only public Supabase endpoints. Production auth settings, private schema/catalog, RLS execution with real accounts, storage contents, operator identity, and provider credentials cannot be verified with the available public key. No production records were modified.

| Requirement | Baseline classification | Evidence / gap |
|---|---|---|
| Three roles, public seeker/company signup, trusted admin creation | Implemented in source; production unverified | Auth trigger 004, API verifies session and active DB admin; API requires server credentials |
| Email/password, restoration, logout, recovery | Implemented in source | Supabase SDK; browser fixtures exercised; email delivery unverified |
| Every-signin Terms + separate Privacy acknowledgment | Missing | Login had neither checkbox nor session-linked receipt |
| Signup agreements/employer authorization/optional alerts | Partial | Combined privacy/terms checkbox; no immutable versions or persisted receipts |
| Four public versioned policy pages | Partial / missing | Minimal terms/privacy; application/employer policies absent; operator/contact/retention unknown |
| Applicant personal/education/family/background | Partial | Atomic RPC 005; no structured preferences, CV library, work history; collection/sharing too broad by default |
| Search title/company/category/type/location/saved/pagination | Implemented | Existing filter module; advanced salary/experience/education/deadline/work arrangement missing |
| Public vacancy eligibility | Broken | Approved jobs could remain visible after employer suspension; no server deadline check |
| Job form and moderation | Partial | No drafts, numeric salary, closing dates, skills, openings; decisions have no reason/history |
| Application submission | Broken | Row inserted before uploads; failed uploads leave incomplete submissions; no busy guard/idempotency |
| Duplicates | Partial | Unique(job_id,seeker_id) exists; no withdrawal/history workflow |
| Per-application agreement + snapshot + reference | Missing | No atomic agreement or preserved profile record |
| Employer application isolation/document permissions | Implemented in source; live unverified | RLS + protected RPC 006; browser fixtures are not live RLS proof |
| Applicant snapshot/minimization | Broken | RPC 006 reads mutable current profile including family fields; documents eagerly signed in admin list |
| Employer verification | Partial | Pending/active status only; missing company particulars, reasons, request-information queue and decision audit |
| Hiring pipeline/status history/interviews/offers/messages | Partial / missing | Five statuses; browser writes status directly; no immutable history or scheduling |
| Persistent notification center | Missing | Popups only; no DB inbox/unread count |
| Saved jobs | Implemented | Owner-only table; alert subscriptions/recommendations missing |
| Fairs/training/advice CMS | Partial | Working shared career_resources table; lacks organizer/end/schedule/provider/limits/archive fields |
| Admin metrics | Partial | Exact counts and paginated tables exist; no recruitment trends/complaints/decision audit |
| Reports/CSV/print | Missing | No authorized report pipeline |
| Complaints/privacy requests/export/deactivation | Missing | No request model or handler |
| Security/invariants | Partial | RLS and fixed search_path exist; old RPC grants default PUBLIC, direct writes bypass future agreement rules, no per-session policy gate |
| Static architecture / source separation | Implemented | Independent role layouts/partials/builders; sync-pages can overwrite redesigned public home |
| Responsive UI / keyboard dialogs | Implemented with gaps | Existing browser coverage; new workflows need tests |
| Production deployment and database migration application | Cannot verify without credentials | Public HTML reads only; no authenticated deployment or SQL owner access available |
| Legal approval/lawful bases/operator/retention | Cannot verify | Must be confirmed and reviewed; no compliance claim appropriate |

## Priority and dependency order
1. Preserve source and data; use additive migrations and re-entrant builders.
2. Versioned draft policies and immutable receipts; server identity/session verification; signup trigger validation; no invented active policy.
3. Server job eligibility and drafts/moderation decisions; status/audit tables.
4. Atomic application RPC, private staged uploads, frozen minimised snapshot and per-submission agreement; retire unsafe insert/attachment route.
5. Interviews, offers, messages, notifications and withdrawal; ownership checks and append-only history.
6. Company verification, complaints/privacy requests, alerts/matching/export, reporting/CMS.
7. Integrated forms, current policy versions, review steps, safe errors, low bandwidth and mobile QA.
8. Execute migration/RLS integration tests on local PostgreSQL; separately document unexecuted production/provider tests and legal blockers.

## External confirmations
Operator legal name/address, support and privacy contacts, DPO designation if applicable, actual lawful processing bases, approved retention/deletion schedule, employer verification rules and overseas source verification, production credentials/settings, legal approval of policy drafts. Drafts must not be activated with placeholders.

Legal sources reviewed: https://privacy.gov.ph/data-privacy-act/ ; https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/ ; https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf . These inform implementation; they are not a legal certification.
