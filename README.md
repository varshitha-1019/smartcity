# AI Based Urban Smart City Monitoring System

An AI-powered civic issue reporting platform. Citizens report problems (potholes, garbage,
drainage, water leakage, and more) using a photo, taken with a camera or uploaded from their
device. The photo is classified automatically by a trained image-classification model, the issue
is routed to the correct civic department, and citizens can track it from **Pending** through
**Assigned → In Progress → Resolved**, with a full status timeline, authority remarks, and a
completion-proof photo once resolved.

## Features by role

### Citizen
- Register / log in
- Report an issue via camera capture or file upload, with GPS location captured automatically.
  If the uploaded photo has its own embedded EXIF GPS data (e.g. a photo taken with a real
  camera/GPS-camera app), that location is used - it's the authoritative source, since it
  represents where the photographed issue actually is, which may be different from wherever the
  reporting device currently is. If the photo has no EXIF GPS but visibly shows a GPS-Map-Camera-
  style stamp burned into the image itself (address + "Lat ... Long ..." text), that stamp is read
  via OCR and used instead - see "GPS-Map-Camera stamp OCR" below. Browser geolocation is only
  used as a last-resort fallback when the image has neither (e.g. a fresh in-app camera capture).
  The resolved coordinates are then reverse-geocoded to a human-readable address, unless the image
  itself already prints one (EXIF has none, but a GPS-stamp address is used as-is)
- Automatic AI classification with a confidence score and automatic department assignment
- Track all submitted issues, with search and status filters
- View full issue detail: AI prediction, department, priority, status, location, original photo,
  the complete status-change timeline, authority remarks, and the completion-proof photo once
  resolved
- Edit their own profile name

### Authority
- Log in and see only issues assigned to their own department
- Self-assign unassigned issues in their department ("Assign to me")
- Update issue status, add remarks, and upload a completion-proof photo - every change is
  recorded in the issue's status timeline, visible to the reporting citizen immediately
- Search and filter their assigned issues by status

### Administrator
- Full dashboard: total users, citizens, authorities, and issue counts by status
- View, search, and filter every issue across all departments
- Create credentials only for the four predefined authorities: Garbage, Drainage, Water Leakage, and Pothole
- Edit an authority's name, email, department, and (optionally) password
- Activate/deactivate an authority, or delete one outright (issues assigned to a deleted
  authority are safely unassigned rather than deleted or left with a broken reference)
- See each authority's current assigned-issue count

### All authenticated roles
- **Profile** - edit your own display name
- **Settings** - view your account details (name, email, role, department) and change your
  password (requires your current password)
- **Notifications** - a feed of real status changes on the issues you have access to, built
  directly from each issue's status-history timeline (not a separate, fabricated feed): a
  citizen sees updates on their own reports, an authority sees updates within their department,
  and an administrator sees every update system-wide

### UI
- A branded Smart City splash screen (logo, name, tagline) shows for ~2 seconds on the app's
  first load, then fades into the real app - it never blocks routing, and an already-logged-in
  user still lands on their correct dashboard once it fades out.
- A custom Smart City SVG logo (skyline + connected-node motif) in the navbar and on the login
  page, styled to work on both light and dark backgrounds.
- Toast notifications confirm actions like assigning or updating an issue.
- Status-specific colors (pending/processing-in-progress/resolved/danger) are used consistently
  across badges, and card/button/status animations respect `prefers-reduced-motion`.

## Technology stack

**Frontend:** React 19, Vite, React Router, Context API (for auth state), plain CSS

**Backend:** Node.js, Express 5, MongoDB, Mongoose, JWT authentication, bcrypt password hashing,
Multer (image uploads), exifr (EXIF GPS extraction), the system `tesseract` OCR binary (GPS-Map-
Camera stamp extraction, invoked as a subprocess - no new npm dependency), CORS

**AI:** A trained Keras/TensorFlow image classifier (`ai/model/urban_issue_classifier.keras`),
invoked from the backend as a Python subprocess. It classifies exactly **Pothole, Garbage,
Drainage, and Water Leakage** (see `ai/model/class_names.json`) and routes each result to the
matching authority domain. GPS-camera uploads are cropped to the central photographed area before
inference so bottom watermark banners do not influence classification. Predictions below 45%
confidence are rejected with the required invalid-category message.

## Project structure

```
backend/    Express API, MongoDB models, JWT auth, AI integration
frontend/   React + Vite single-page app
ai/         Python training script, trained model, and the prediction script the backend calls
```

## Installation

Requires Node.js 18+ and Python 3 (with the packages in `ai/requirements.txt`, for AI
classification) installed locally, plus the `tesseract` OCR binary on the machine running the
backend (used to read GPS-Map-Camera-style stamps burned into uploaded photos - see
"GPS-Map-Camera stamp OCR" below). This is a **system package, not an npm package** - `npm
install` in `backend/` does not install it, and if it's missing the server won't error, it will
just silently fall back to browser/device GPS for any image whose only location is a visible
stamp (no EXIF). Install it, then verify with `tesseract --version` before starting the backend:

- Debian/Ubuntu: `sudo apt-get install tesseract-ocr`
- macOS: `brew install tesseract`
- Windows: install via the [UB-Mannheim build](https://github.com/UB-Mannheim/tesseract/wiki) and
  make sure its install folder is on your `PATH`

If `tesseract --version` doesn't print a version after installing, restart your terminal/IDE (and
the backend dev server) so it picks up the updated `PATH`.

```bash
git clone https://github.com/Praveenkumar-1705/AI_based_urban_city.git
cd AI_based_urban_city

# Backend
cd backend
npm install
cp .env.example .env   # then fill in real values, see below

# AI (for image classification)
cd ../ai
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
cp .env.example .env   # adjust if your backend runs on a different port
```

## Environment variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (defaults to `5000`) | Port the Express server listens on. **If you change this, also update `VITE_API_URL` in `frontend/.env` to match** - the two must point at the same port. |
| `MONGODB_URI` | No | Your MongoDB connection string. If omitted, the backend automatically starts an in-memory MongoDB instance for local development (see `backend/config/db.js`) - no local MongoDB install required to get started, though data won't persist between restarts in that mode. |
| `JWT_SECRET` | Strongly recommended (required when `NODE_ENV=production`) | Secret used to sign and verify JWTs. In development, the server will start without it (falling back to an insecure, publicly-known default, and printing a startup warning). **With `NODE_ENV=production`, the server refuses to start at all if `JWT_SECRET` is missing**, rather than silently running with a known, insecure secret. |
| `FRONTEND_URL` | No | Comma-separated list of allowed CORS origins. Defaults to allowing all origins if unset. |
| `NODE_ENV` | No | Set to `production` in any real deployment to enable the `JWT_SECRET` fail-fast check above. Leave unset (or `development`) for local work. |
| `ALLOWED_RESOLUTION_RADIUS_METERS` | No | Maximum distance, in meters, between a citizen's original issue location and the authority's resolution-evidence location before the resolution is flagged with an "outside the original issue location" warning (see `backend/services/gpsService.js`: `verifyResolutionLocation`). Purely informational - never causes either coordinate pair to be replaced or adjusted. Defaults to `500`. |
| `AI_MINIMUM_CONFIDENCE` | No | Minimum classifier confidence accepted for one of the four supported categories. Defaults to `0.45`. |

### `frontend/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No (defaults to `http://localhost:5000/api`) | Must point at the same port the backend is actually running on. |

Never commit your real `.env` file - only `.env.example` (placeholders only) is tracked in git.

## Running locally

```bash
# Terminal 1 - backend (http://localhost:5000 by default)
cd backend
npm start          # or: npm run dev, for auto-restart on file changes

# Terminal 2 - frontend (http://localhost:5173 by default)
cd frontend
npm run dev
```

### Development accounts (administrator / four authorities / citizen)

To try all roles without registering each one by hand, development-only accounts
are available:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@smartcity.com` | `Admin@123` |
| Authority (Pothole) | `pothole.authority@smartcity.com` | `pothole@12` |
| Authority (Drainage) | `drainage.authority@smartcity.com` | `drainage@12` |
| Authority (Garbage) | `garbage.authority@smartcity.com` | `garbage@12` |
| Authority (Water Leakage) | `water.authority@smartcity.com` | `water@12` |
| Citizen | `citizen@smartcity.com` | `Citizen@123` |

**These are development-only credentials. Never rely on them existing in, or use them against, a
production database.**

How they get created depends on which database mode you're running in (see `MONGODB_URI` above):

- **Default (no `MONGODB_URI` set, local persistent database):** the backend server creates all
  all six accounts itself automatically on startup (`backend/config/devAccounts.js`, called from
  `server.js`). Just run `npm start` / `npm run dev` and log in - no separate seed step needed.
  This local database (via `mongodb-memory-server`, storing its data in `backend/.devDb/`,
  gitignored) persists across server restarts, so anything you create - authorities, issues,
  activations - survives stopping and restarting the backend. It does *not* survive deleting the
  `backend/.devDb/` folder, and it's local to your machine, not shared or backed up - use a real
  `MONGODB_URI` for anything beyond local development.
- **Real MongoDB (`MONGODB_URI` set):** run the seed script explicitly against that database:

  ```bash
  cd backend
  npm run seed
  ```

  Existing accounts with the same email are skipped either way, so it's safe to re-run. If
  you're running the standalone `node scripts/seed.js` against the *default* in-memory database
  instead of a real `MONGODB_URI`, note that it runs as its own separate process with its own
  separate database - it won't populate the same database your `npm start` server process is
  using. Use the automatic startup seeding described above instead in that mode.

Both paths refuse to run when `NODE_ENV=production`, so these accounts are never auto-created in
a production deployment.

To reach the administrator dashboard: log in as `admin@smartcity.com` at `/login` - you'll land
on `/admin` automatically. Authority accounts land on `/authority`, citizens land on `/dashboard`.
Public registration (`/register`) always creates a **citizen** account regardless of anything the
client sends - there is no way to self-register as authority or administrator.

## API overview

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new citizen account |
| POST | `/auth/login` | Public | Log in, returns a JWT |
| GET | `/users/profile` | Any authenticated user | Get your own profile |
| PATCH | `/users/profile` | Any authenticated user | Update your own name |
| PATCH | `/users/password` | Any authenticated user | Change your own password (requires current password) |
| POST | `/issues` | Citizen | Report an issue (multipart: `image` + location fields) |
| GET | `/issues/my` | Citizen | Your own reported issues |
| GET | `/issues` | Authority, Administrator | All issues (authorities see only their department) |
| GET | `/issues/:id` | Citizen (own), Authority (own dept), Administrator | Single issue detail |
| GET | `/issues/status/:status`, `/issues/category/:category`, `/issues/department/:department` | Authority, Administrator | Filtered issue lists |
| PATCH | `/issues/:id/status` | Authority, Administrator | Update status, remarks, and/or a completion-proof image (multipart or JSON) |
| PATCH | `/issues/:id/assign` | Authority (self only), Administrator | Assign an issue to an authority |
| GET | `/dashboard/stats` | Citizen, Authority, Administrator | Role-scoped issue statistics |
| GET | `/dashboard/recent` | Citizen, Authority, Administrator | Most recent issues |
| GET | `/dashboard/departments` | Authority, Administrator | Issue counts by department |
| GET | `/dashboard/notifications` | Citizen, Authority, Administrator | Real, role-scoped feed of status-history events on issues you can access |
| POST | `/admin/authorities` | Administrator | Create an authority account |
| GET | `/admin/authorities` | Administrator | List all authorities, with assigned-issue counts |
| GET | `/admin/authorities/:id` | Administrator | Single authority detail |
| PATCH | `/admin/authorities/:id` | Administrator | Update an authority's details (name/email/department/password) |
| PATCH | `/admin/authorities/:id/status` | Administrator | Activate/deactivate an authority |
| DELETE | `/admin/authorities/:id` | Administrator | Delete an authority; any issues assigned to them are safely unassigned (reverted to `Pending`) rather than deleted |

## Roles

The `role` field on a user is one of `citizen`, `authority`, or `administrator`.

- **citizen** - the default role for anyone who self-registers. Can report and track their own
  issues.
- **authority** - can only be created by an administrator, and is tied to exactly one department
  (e.g. `Pothole`, `Garbage`). Sees and manages only issues assigned to their domain.
- **administrator** - full visibility across all issues and departments, and manages authority
  accounts.

## Security notes

- Passwords are always hashed with bcrypt before storage; plaintext passwords are never stored
  or logged.
- Every protected route requires a valid `Authorization: Bearer <token>` JWT, verified against
  `JWT_SECRET`.
- Authorization is enforced server-side (`authorize("administrator")` etc.) on every protected
  route - the frontend hiding a nav link is a UX convenience only, never the actual security
  boundary.
- Unexpected server errors (e.g. a database failure) return a generic message to the client; the
  full error is only ever logged server-side, never sent to the browser.
- A deactivated account (`active: false`) is rejected at login with a clear message, rather than
  being issued a token that would then fail on every subsequent protected request.
- If the reverse-geocoding provider (OpenStreetMap Nominatim) is unavailable or returns nothing,
  issue creation still succeeds: the stored address falls back to a deterministic string built
  directly from the extracted GPS coordinates (e.g. `Approximate location (16.233144,
  80.546237) - address lookup unavailable`) instead of blocking the report or displaying an
  unrelated place name. The real GPS coordinates are always stored and displayed regardless of
  which address string is used.

## Production deployment notes

- Set `NODE_ENV=production` and a real, unique `JWT_SECRET` - the server will refuse to start in
  production without one, rather than silently falling back to the insecure default used for
  local development.
- Set a real `MONGODB_URI` pointing at a persistent MongoDB instance - without it, the backend
  falls back to an in-memory database that's wiped on every restart (fine for local development,
  not for production).
- Set `FRONTEND_URL` to your actual deployed frontend origin(s) to restrict CORS.
- The development administrator/authority/citizen accounts (see "Development accounts" above)
  are never auto-created when `NODE_ENV=production` - both the server's automatic bootstrap and
  `backend/scripts/seed.js` check for this and refuse to run. Do not run
  `backend/scripts/seed.js` against a production database regardless.


## Testing

```bash
cd backend
npm test
```

This runs the Node.js built-in test runner against `backend/test/*.test.js`. All 109 non-OCR tests pass in
an environment with the AI dependencies installed (see `ai/requirements.txt`) - this includes
`backend/test/adminAuth.test.js` and `backend/test/adminController.test.js`, which cover the full
authority lifecycle (create, duplicate-email rejection, update, activate, deactivate, delete, and
- critically - that an authority who was just activated can immediately log in, and one who was
just deactivated is immediately rejected), the development-administrator login/role flow
(registration cannot create an administrator, the dev-account bootstrap creates all supported roles
and skips itself in production, admin login success/failure, JWT role, and `protect`/`authorize`
for the administrator role), and `backend/test/geocodingService.test.js`'s GPS regression tests
(see below).

- `predictImage returns a supported category for the real model image` spawns the Python
  prediction script (`ai/scripts/predict.py`) and therefore requires a working Python +
  TensorFlow environment (`pip install -r ai/requirements.txt`). It's the one test that's
  genuinely environment-dependent - it will fail with an import-style error on a machine without
  those dependencies installed, which is an environment limitation rather than a project bug.
- `backend/test/gpsStampOcr.test.js`'s OCR-specific tests spawn the system `tesseract` binary
  (see "GPS-Map-Camera stamp OCR" below) and skip themselves gracefully (rather than failing)
  when it isn't installed, since `gpsService.extractGpsFromImageStamp()` itself is written to
  degrade to "no stamp found" - never to throw - when `tesseract` is unavailable.

On Windows PowerShell, to syntax-check every backend file individually:

```powershell
cd backend
Get-ChildItem -Recurse -Filter *.js | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | ForEach-Object { node --check $_.FullName }
```

`backend/test/issueWorkflowCheck.js`, `liveIssueUpload.js`, and `verifyGps.js` are standalone
scripts (not part of the `npm test` run) for exercising the live HTTP API against a running
server - useful for manual smoke-testing, not automated CI.

```bash
cd frontend
npm run build   # production build
npm run lint    # ESLint
npm test        # plain node:test unit tests under src/**/*.test.js (currently: role-based
                 # post-login redirect logic in src/utils/roleRouting.js)
```

### Known sandbox limitation (development note)

Parts of this project's automated development history were built in a sandboxed environment
without `mongod`, `mongosh`, or Docker available, and with the MongoDB binary download blocked
by network policy. In that environment, backend logic was verified through unit tests with
mocked database calls (see `backend/test/*.test.js`) rather than a live database - all business
logic (authentication, authorization, status transitions, notifications scoping, etc.) is
covered this way, but a live browser session against a real, running MongoDB instance was not
exercised there. If you're running this project with real MongoDB and a browser, as described
above, you get the genuine end-to-end experience this limitation only affected during
development.

### GPS/EXIF location accuracy (verified regression)

A real reported bug: an uploaded photo with genuine embedded GPS metadata (a "GPS Map Camera"
style image of Vadlamudi, Andhra Pradesh - 16.233144, 80.546237) was being reported at an
unrelated location (16.409002, 80.620844 - Tadapalle/Mangalagiri) instead. The cause was
`gpsService.js`'s `resolveGpsLocation()` checking browser-supplied coordinates *before* the
image's own EXIF GPS, so a browser location sent alongside the upload silently overrode the
real, embedded location of the photographed issue. Fixed by swapping the priority: an image's
own EXIF GPS is now used whenever present, with browser geolocation only as a fallback for
images with no usable GPS metadata (e.g. a fresh in-app camera capture). Covered by dedicated
regression tests in `backend/test/geocodingService.test.js`, including a real JPEG fixture
(`backend/test/fixtures/vadlamudi-geotagged.jpg`) with the exact reported coordinates embedded,
and a full-pipeline test proving those coordinates survive resolution, reverse geocoding, and
the offline fallback address unchanged.

### GPS-Map-Camera stamp OCR (verified regression)

A follow-up to the bug above, for the same real-world photo type but a different failure mode:
some "GPS Map Camera" style apps burn the address and coordinates into the photo's *pixels* as a
visible banner (e.g. "Vadlamudi, Andhra Pradesh, India" / "Lat 16.233144° Long 80.546237°")
without writing anything into EXIF at all. Since `resolveGpsLocation()` previously only checked
EXIF GPS before falling back to browser/device GPS, an uploaded photo like this had no usable
EXIF, so the browser's current location silently won instead - showing an unrelated address
(e.g. "Klef Road, Tadepalle, Vaddeswaram, Mangalagiri") and a "Device location (fallback)" label,
even though the photo itself clearly showed a different, correct location. Fixed by adding a new
priority step, `gpsService.extractGpsFromImageStamp()`, between EXIF and browser GPS: it runs the
image through the system `tesseract` OCR binary and looks for an explicit `Lat ... Long ...`
label pair (the format real GPS-camera stamps use), plus the address text printed above it. If a
real stamp is found, those exact coordinates and that exact address are used - the address is
also preferred over reverse-geocoding the same coordinates, since it's what the photo itself
actually says. An uploaded image with a genuine stamp now never falls through to browser/device
GPS; only images with neither EXIF nor a readable stamp still use it (unchanged from before).
Deliberately requiring the literal "Lat"/"Long" labels (rather than matching any bare pair of
decimal numbers) also means this app's own in-app camera-capture overlay (`geoTag.js`, which
prints coordinates as `16.2331° N, 80.5462° E` with no "Lat"/"Long" words) is never mistaken for
a stamp, so a fresh camera capture still uses its own precise, unmodified browser GPS reading.
Covered by `backend/test/gpsStampOcr.test.js`, including a synthetic JPEG fixture
(`backend/test/fixtures/vadlamudi-ocr-stamp.jpg`, no EXIF, only a rendered stamp) with the exact
reported coordinates and address, and a check that a plain, unstamped image is unaffected and
still correctly falls back to browser GPS.

### Local development database persistence

`mongodb-memory-server`'s default configuration uses a temporary directory and an
`ephemeralForTest` storage engine that's discarded as soon as the process exits - meaning every
backend restart (including routine `nodemon` reloads during local development) silently wiped
the entire local database, including anything an administrator had just created or activated.
`backend/config/db.js` now configures a fixed `dbPath` (`backend/.devDb/`, gitignored) with the
real `wiredTiger` storage engine, so local development data survives normal restarts. This only
applies to the default in-memory mode; a real `MONGODB_URI` was always persistent on its own.

### Verified state

As of this revision, with `ai/requirements.txt` installed:

- Backend: `npm test` → 61/61 passing, 0 failing.
- Backend: `node --check` passes on every `.js` file in the project.
- Frontend: `npm run lint` → 0 errors, 0 warnings.
- Frontend: `npm run build` → succeeds.
- `npm audit` → 0 vulnerabilities in both `backend/` and `frontend/` (after `npm audit fix`,
  which only applied SemVer-compatible patches - no `--force`, no major version bumps).

If you're seeing an authority account (e.g. one created outside the admin UI, such as directly
in the database) show up as `Inactive` with no obvious cause, check whether that document is
missing the `active` field entirely - the schema defaults `active` to `true` for documents
created through the application, but a document inserted by another means without that field
will read as falsy in the UI. Use the admin dashboard's Activate control (or `PATCH
/admin/authorities/:id/status`) to fix it directly.

## Authority Resolution Evidence, Bounding Box, and Before/After View

This revision adds four related citizen-transparency features on top of the existing status
update workflow, without introducing any new upload pipeline or altering existing behavior.

### Resolution Evidence (authority-uploaded "after" photo)

When updating an issue's status, an authority (or an administrator) can now capture a photo with
the device camera or select one from disk and attach it as **Resolution Evidence**, alongside the
existing status/remarks update. It is exposed via the same `PATCH /issues/:id/status` endpoint and
the same `completionProof` file field the app already used, so no new route or upload
architecture was introduced - only extended:

- `Issue.resolutionEvidence` mirrors `Issue.completionProof` (kept for backward compatibility)
  under an unambiguous name for new frontend code.
- The original citizen-reported `Issue.image` is never touched or overwritten.
- Only the authority assigned to the issue, or an administrator, may upload/update it
  (`issueService.updateIssueStatus`, unchanged authorization logic).
- Citizens only ever read this field (`GET /issues/:id`, `GET /issues/my`) - there is no
  citizen-facing write path.

### Evidence geo-tagging (EXIF-first, same priority as citizen reports)

The evidence photo is geo-tagged using the exact same priority order already enforced for citizen
reports (`gpsService.resolveGpsLocation`):

1. EXIF GPS embedded in the evidence image itself.
2. The authority's current browser/device GPS, sent alongside the upload, as a fallback.
3. A graceful "location unavailable" state - never fabricated coordinates.

Resolved coordinates, a best-effort reverse-geocoded address (with the same offline coordinate
fallback used elsewhere), and the capture timestamp are stored in `Issue.completionProofLocation`
and shown to the citizen next to the evidence photo.

### Detected Issue bounding box

`Issue.aiPrediction.boundingBox` is a new, nullable field for a dotted/dashed annotation box
around the detected issue in the citizen's original photo. The currently deployed classifier
(`ai/scripts/predict.py`) only returns a category and confidence - it does not localize the issue
in the frame - so this field stays `null` and the frontend (`DetectedIssueImage` component) shows
a clear "AI bounding-box detection not available for this image" note instead of a box. The schema
and UI are ready to render a real box the moment a model/detector that returns coordinates is
wired in; nothing here invents or guesses a position.

### Before / After view

The citizen issue-details page (`IssueDetail.jsx`) now shows the original reported image next to
the authority's resolution evidence in a responsive two-column (desktop) / stacked (mobile) grid,
once evidence has been uploaded.

### Testing

`backend/test/authorityEvidence.test.js` adds coverage for: authorization (assigned authority vs.
unauthorized authority vs. administrator; citizens blocked at the route level), evidence being
stored separately from the original image, EXIF-over-browser GPS priority for evidence photos,
browser GPS fallback, graceful handling when no GPS is available at all, evidence retrieval by the
reporting citizen, and bounding-box schema validation (both `null` and populated).

### Known environment limitation

`predictImage`'s "returns a supported category for the real model image" test
(`backend/test/geocodingService.test.js`) requires a Python environment with TensorFlow installed
(see `ai/requirements.txt` and `aiPredictionService.js`'s `.venv`/`ai/venv` lookup). In a sandbox
without that virtual environment set up, this single test fails with "No module named
'tensorflow'" - this is pre-existing and unrelated to this revision's changes; all other tests
(75/76) pass. Installing `ai/requirements.txt` into a `.venv` (or `ai/venv`) resolves it.

