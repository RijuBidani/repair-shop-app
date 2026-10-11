# Repair Shop API

A Node.js, Express and MongoDB backend for managing repair-shop employees and their assigned notes/tickets. This repository contains the backend API and a small static landing page, not the React frontend. It began with Dave Gray's techNotes MERN tutorial; the independently implemented notes-query extension is described below.

## Prerequisites

- Node.js and npm. Use a maintained Node.js release that supports loading ESM dependencies through CommonJS `require()` (for example Node.js 22.12+); this CommonJS project requires `uuid` 14. Express 5 itself requires Node.js 18+, but that alone is not sufficient for this dependency combination. No Node version is pinned in this repository.
- Git to clone the repository.
- MongoDB: a running local instance or an Atlas cluster, plus database credentials and network access if required.
- Postman desktop app, or the web app with a Desktop Agent, to run the supplied regression suite. `mongosh` is only needed for the optional equal-timestamp fixture.

## 1. Installation

```bash
git clone https://github.com/RijuBidani/repair-shop-app.git
cd repair-shop-app
npm ci
```

`npm ci` installs the versions recorded in `package-lock.json`. Run all commands below from the repository root.

## 2. Environment variables

Copy `.env.example` to `.env`:

```bash
# Bash / WSL / macOS / Linux
cp .env.example .env
```

```powershell
# PowerShell
Copy-Item .env.example .env
```

Replace the database placeholder. A local example is:

```dotenv
NODE_ENV=development
DATABASE_URI=mongodb://127.0.0.1:27017/repair_shop
PORT=3500
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URI` | MongoDB connection URI, including the application database name | Required; no fallback |
| `PORT` | HTTP listening port | `3500` |
| `NODE_ENV` | Environment label, currently printed at startup | No fallback; example uses `development` |

For Atlas, use the connection string supplied by your cluster, inserting the database name **before** the query string:

```text
mongodb+srv://YOUR_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/repair_shop?retryWrites=true&w=majority
```

Preserve any other connection options your Atlas configuration needs. URL-encode special characters in credentials. `.env` is ignored by Git; keep actual credentials out of committed files and Postman exports. `PORT` is optional and is not currently included in `.env.example`.

## 3. Starting MongoDB and the server

For local MongoDB, start the MongoDB service using your operating systemâ€™s installation instructions and confirm it listens at the address in `DATABASE_URI`. The Node application does not start MongoDB. MongoDB creates the database and collections when data is first written; no manual schema migration is required.

For Atlas, ensure the cluster is available, its database user has read/write permission on the selected database, and Network Access permits your client IP. No local MongoDB service is needed.

Start the backend:

```bash
npm run dev
```

This uses nodemon for development. To run without automatic restarts:

```bash
npm start
```

Wait for `Connected to MongoDB` and `Server running on port 3500` (or your configured port). The HTTP server starts only after MongoDB connects. If connection fails, inspect the terminal and connection settings; the application logs the failure but does not start listening.

The default base URL is `http://localhost:3500`. A quick API check is:

```bash
curl 'http://localhost:3500/notes'
```

The browser CORS allowlist currently contains `http://localhost:5173` in `config/allowedOrigins.js`. Update that file if your frontend uses another origin. Postman and clients without an Origin header are allowed.

## 4. Features and API contract

- User and note CRUD, with duplicate username/title checks.
- Bcrypt password hashing; user listing excludes password hashes.
- User deletion is blocked while notes are assigned to that user.
- Notes have completion status, automatic timestamps and ticket numbers beginning at 500.
- Literal, case-insensitive title/text search, completion filtering, deterministic sorting and pagination.
- Request/error logging under `logs/`, which is ignored by Git.

All API routes are currently public. Stored roles and active status do not enforce access permissions.

### GET /notes

```text
GET /notes?search=screen&completed=false&page=1&limit=10
```

| Parameter | Default | Contract |
| --- | --- | --- |
| `search` | No search filter | Trim surrounding whitespace, then allow at most 100 JavaScript string code units. Match a literal substring in title **or** text, case-insensitively. Regex metacharacters are escaped. Missing, empty and whitespace-only values mean no search filter. |
| `completed` | Both statuses | Exactly `true` or `false`, lowercase and without surrounding whitespace. |
| `page` | `1` | Canonical positive decimal integer, within JavaScriptâ€™s safe integer range. |
| `limit` | `10` | Canonical positive decimal integer from `1` to `50`. |

Only these four keys are supported, and each may occur once. Repeated or unsupported keys return `400` with `{ "message": "..." }`. Bracket-form keys such as `page[]` are unsupported under Expressâ€™s default simple query parser.

Integers must match `^[1-9]\d*$`: values such as `0`, `01`, `1e2`, `1.5`, `+1`, empty values and whitespace-padded values are rejected. The computed offset `(page - 1) * limit` must also pass `Number.isSafeInteger`; an unsafe offset returns `400` before querying MongoDB. There is no additional application-defined maximum page number.

Search and completion filters combine with AND. Blank search removes only the search condition; completion and pagination still apply. Sort order is fixed: descending `updatedAt`, then descending `_id` for timestamp ties. Public `sortBy`/`order` parameters are not supported.

Successful responses use status `200` and this shape (illustrative record):

```json
{
  "notes": [
    {
      "_id": "650000000000000000000001",
      "user": "650000000000000000000010",
      "title": "Replace screen",
      "text": "Inspect the cracked screen",
      "completed": false,
      "ticket": 500,
      "createdAt": "2026-10-11T10:00:00.000Z",
      "updatedAt": "2026-10-11T10:00:00.000Z",
      "username": "employee1"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalNotes": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Notes retain their stored fields (so fields such as `__v` may also appear) and receive a `username` field; this is `null` if the assigned user cannot be found.

| Metadata field | Meaning |
| --- | --- |
| `page`, `limit` | Validated requested values or defaults |
| `totalNotes` | Count of all notes matching the filter, before pagination |
| `totalPages` | `Math.ceil(totalNotes / limit)` |
| `hasNextPage` | `page < totalPages` |
| `hasPreviousPage` | `totalPages > 0 && page > 1` |

No matches return `notes: []`, zero totals and both navigation flags false, even when the requested page exceeds 1. A valid page beyond the last page also returns `200` and `notes: []`; totals remain the matching totals, `hasNextPage` is false, and `hasPreviousPage` is true if there are matching notes. The API preserves the requested page rather than clamping it.

### Other endpoints

Send JSON bodies with `Content-Type: application/json`. PATCH handlers require the listed fields rather than accepting arbitrary partial updates. IDs are MongoDB document `_id` values, not ticket numbers.

| Method / route | Body / behavior | Success |
| --- | --- | --- |
| `GET /users` | Returns an array of users without passwords; an empty user collection returns `400` | `200` |
| `POST /users` | `username`, `password`, nonempty `roles` array | `201`, message object |
| `PATCH /users` | `id`, `username`, nonempty `roles`, Boolean `active`; optional password replacement | `200`, message object |
| `DELETE /users` | `id`; rejected if the user has assigned notes | `200`, JSON string |
| `POST /notes` | `user` (user ID), `title`, `text`; optional Boolean `completed`, default false | `201`, message object |
| `PATCH /notes` | `id`, `user`, `title`, `text`, Boolean `completed` (including false) | `200`, JSON string |
| `DELETE /notes` | `id` | `200`, JSON string |

Missing required fields and nonexistent valid IDs generally return `400`; duplicate usernames/titles return `409`. Unexpected errors pass through the error handler and generally return `500`. Malformed IDs and body types are not comprehensively normalized into validation errors.

## 5. Testing instructions

The canonical collection and saved assertions are in [tests/postman](tests/postman/README.md). It contains 127 main requests plus one optional equal-timestamp fixture request, organized into setup, query behavior, validation, CRUD regression and cleanup folders.

1. Stop the backend and select a **dedicated empty test database** in `.env`, such as `mongodb://127.0.0.1:27017/repair_shop_test`, or the equivalent Atlas URI. The database name belongs before `?`, not inside a query option. Verify the actual target yourself; an empty API response cannot identify the database.
2. Restart the backend and wait for its connection/listening messages.
3. Import `tests/postman/Repair-Shop-Canonical.postman_collection.json` and optionally `tests/postman/local-test.postman_environment.json` into Postman.
4. Set `baseUrl` to your server URL and `runTieFixture=false` in the selected environment (or collection variables when no environment is selected).
5. Run the **whole collection in saved order**, one iteration, with a 25 ms delay. Inspect all assertion results. Setup creates two users and twelve notes; subsequent requests depend on those fixture IDs; cleanup removes the fixture users and notes.
6. If a run is interrupted or cleanup fails, inspect only the test database for leftovers or select a fresh empty test database before rerunning. The suite checks global counts and must not run against ordinary application data.
7. Stop the backend, restore the normal database URI and restart when resuming development.

The suite covers title/text search, literal regex characters, completion/combined filters, blank search, validation, page boundaries and all metadata fields, ordering, username enrichment, CRUD persistence, duplicates, false Boolean values, password exclusion and the user-deletion guard.

For a deliberately seeded timestamp tie, follow the separate `mongosh` fixture procedure in [the test README](tests/postman/README.md). Run only its optional folder with `runTieFixture=true`, clean up the fixture, and reset the flag. Ordinary ordering assertions do not establish that this separate fixture was executed.

**Latest reported result:** on 11 October 2026, the maintainer reported that all tests passed in Postman after adding the skip safety check. The repository source inspected for this README is commit `6d21e35`. An exported live-run report, exact assertion count, Postman version and optional tie-fixture execution status have not been recorded here; this statement records the maintainer's report rather than an independently repeated run. `tests/postman/VALIDATION.txt` records earlier in-memory script validation, which is separate from that live Postman result. The test READMEâ€™s older â€œnot yet runâ€ wording describes the suite at generation time.

There is currently no `npm test` script or CI test workflow. The collection does not include a focused assertion for an unsafe **computed offset**; adding the guard and passing the existing suite does not establish that rejection branch was exercised.

## 6. Tutorial attribution and independent contribution

The application's starting point is [Dave Gray's MERN Stack / techNotes tutorial](https://github.com/gitdagray/mern_stack_course). The underlying Express/Mongoose CRUD structure, users/notes domain, password hashing and ticket-number model derive from that learning project. This repository does not claim an original application architecture.

Riju Bidani independently implemented the GET `/notes` query extension: literal title/text search, completion filtering, supported-key and repeated-key validation, canonical integer parsing, bounded page size, deterministic timestamp/ID sorting, filtered totals and pagination metadata. Subsequent work extracted parsing/filter/metadata helpers and added the safe-integer check for the computed skip offset. The repository also includes environment setup and a canonical Postman regression collection developed with AI assistance and run by the maintainer.

The implementation was developed with documentation and AI-assisted review/testing support; the independent contribution refers to extending the tutorial baseline, not to claiming every line or supporting artifact was produced without assistance.

## 7. Current limitations

- Authentication and authorization are not implemented. There is no login endpoint, route protection or role-based enforcement; password hashing alone does not provide access control.
- This repository is a backend learning project; a complete frontend and production deployment are not included.
- CRUD body validation is incomplete. Note writes do not verify that the supplied user exists, and malformed ObjectIds may produce server errors. Duplicate checks are application-level queries without unique indexes, so concurrent writes can race.
- Pagination uses skip/limit. Deep offsets and case-insensitive substring regex searches may be expensive; no performance or load-testing claim is made. Sorting is deterministic for a fixed dataset, but pages may shift as notes change.
- Note retrieval and counting are separate queries without snapshot consistency. Concurrent writes can make returned records and totals differ. Username enrichment performs one additional user lookup per returned note.
- The safe-integer offset guard prevents unsafe JavaScript arithmetic; it is not a practical database-performance cap or proof that every safe offset is accepted by every database configuration.
- No automated CI run or clean-clone startup result is recorded. Optional tie-fixture results, concurrency, comprehensive malformed-body validation and direct password-hash preservation checks are outside the reported main-suite evidence.
- Connection failures are logged without retry orchestration; the error handler can expose raw error messages. Further operational hardening is needed before public deployment.