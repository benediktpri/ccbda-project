# Frontend Mockups

Features that exist in the UI but are not backed by real logic or a backend endpoint.

---

## 1. Generate Tailored CV

**Location:** `frontend/src/app/jobs/page.tsx` — `JobDetail` → `handleGenerate('cv')`

**What it does now:** Clicking the button sets state to `generating`, waits 2 seconds via `setTimeout`, then sets state to `ready`. No content is produced; the "Download" button in the ready state does nothing.

**What is needed:** A backend endpoint (e.g. `POST /users/{userId}/jobs/{jobId}/generate-cv`) that uses the profile and job data to generate a tailored CV, plus a download mechanism for the result.

---

## 2. Generate Cover Letter

**Location:** `frontend/src/app/jobs/page.tsx` — `JobDetail` → `handleGenerate('cl')`

**What it does now:** Same fake `setTimeout` flow as above. No letter is generated or returned.

**What is needed:** A backend endpoint (e.g. `POST /users/{userId}/jobs/{jobId}/generate-cover-letter`) that produces a cover letter, plus a download or display mechanism.

---

## 3. AI Profile Chat Modal

**Location:** `frontend/src/app/profile/page.tsx` — `ChatModal`

**What it does now:** Opens a chat-style modal that walks through 5 hardcoded questions (`AI_QUESTIONS`). Answers are kept only in local React state and discarded when the modal closes. The header explicitly reads *"Simulated · answers stay local"*.

**What is needed:** Either a backend endpoint to persist the answers as profile notes/additional context, or removal of the feature if it will never be backed by real logic.

---

## 4. Password field on login

**Location:** `frontend/src/app/login/page.tsx`, `frontend/src/lib/useAuth.ts`

**What it does now:** The password field is rendered and validated for non-empty input, but the value is passed to `login(email, _password)` where it is intentionally ignored (`_password`). Every login creates a brand-new backend user regardless of credentials. The UI hint reads *"New here? Just enter any email and password to get started."*

**What is needed:** Real authentication — either Cognito (planned stretch goal) or another auth mechanism — so that the same user can log in across sessions without data loss.

---

## 5. `/analysis` page

**Location:** `frontend/src/app/analysis/` (empty directory)

**What it does now:** The folder exists but contains no files. The route is unreachable.

**What is needed:** A page showing a summary of all analysis results across jobs (overall match trends, skill gap heatmap, etc.), using the existing `GET /users/{userId}/results` backend endpoint.
