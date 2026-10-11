# Repair Shop canonical Postman regression suite

This replaces the need to assemble the earlier CRUD, pagination/sorting, response-metadata checkpoints and individual search/completed requests. One collection has ordered folders for setup, GET behavior, validation, CRUD regression and cleanup. Your existing CRUD collection remains useful, but its older GET /notes array assertions must be updated to `{ notes, pagination }` before use with the refactor.

Target inspected: RijuBidani/repair-shop-app, commit 867023a7a53f2749b6a08c2a2bda301b5fadc944. There are 127 ordinary requests plus one optional equal-timestamp request. This covers the specified contract and regression matrix, not every possible input or application property. It is not a recorded live Postman/MongoDB passing run.

## Files and repository placement

- `Repair-Shop-Canonical.postman_collection.json`: importable Postman v2.1 collection, assertions included.
- `local-test.postman_environment.json`: optional base URL and tie-test flag only; no database credentials.
- `tie-fixture.mongosh.js`: optional fixed timestamp database fixture for the tie-break test.
- This README: setup, run order, scope and limits.

Commit these under `tests/postman/` in your repository. Keep MongoDB connection strings and `.env` out of Git. The original collections can be archived outside the canonical path; they do not need to be merged manually.

## Create a separate MongoDB Atlas test database

You can reuse your existing Atlas cluster; you do not need another cluster. A database name selects a separate namespace within it.

1. In Atlas, open the cluster's Data Explorer / Browse Collections. Choose Create Database. Use database name `repair_shop_test` and initial collection name `users`. Leave it empty. If that database already contains earlier fixtures, choose a NEW name, such as `repair_shop_test_20261009`, rather than deleting anything blindly.
2. Check Database Access: the database user in your connection string needs read/write permission on this test database. A user restricted to your original database will need the additional test-database role. Check Network Access permits your current IP. These are database users, separate from Atlas login accounts.
3. Stop your backend. In its local `.env`, change the `DATABASE_URI` variable used by `config/dbConn.js` to point to the test database. Preserve your existing host, encoded credentials and query options. Example ONLY:

   ```dotenv
   DATABASE_URI=mongodb+srv://YOUR_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/repair_shop_test?retryWrites=true&w=majority&authSource=admin
   PORT=3500
   ```

   The database name goes after `.net/` and before `?`. `authSource=admin` retains Atlas authentication against admin while selecting the test database for application data. Do not paste the example's placeholders literally. Do not print or commit the actual URI.
4. Start the backend from its repository directory with `npm run dev` (or `npm start`). Wait for `Connected to MongoDB` and the server port message.
5. Verify the active database name in Atlas after the first collection requests. MongoDB will create the `notes` collection and the ticket-counter collection on writes. You need not create these manually. The suite's first request requires GET /notes to return zero notes; this checks emptiness, but it CANNOT prove which database the server uses. Verify the URI yourself before running.
6. Once testing is finished, stop the backend, restore the original URI and restart it when you resume normal development. Never switch the URI while leaving the old server process running.

For a local MongoDB installation, use `DATABASE_URI=mongodb://127.0.0.1:27017/repair_shop_test`. The database appears after the first write. No Atlas steps are needed.

## Run the main suite in Postman

1. Import the canonical collection JSON and, optionally, the environment JSON. Select the imported environment. Use the desktop app, or a local Desktop Agent when using the web app.
2. Set `baseUrl=http://localhost:3500` and leave `runTieFixture=false`. Do not define environment/data variables named `marker`, `username`, `userId`, `title1`, `id1`, etc.; these could override the collection's generated fixture values.
3. Run the WHOLE collection, in its saved order, with one iteration and a 25 ms request delay. Do not shuffle, parallelize, or select only the middle GET/CRUD folders: they depend on setup IDs. Leave the optional final folder in place; its request skips itself by default using `pm.execution.skipRequest()`.
4. Inspect assertion results, not just HTTP statuses. The setup creates two uniquely named users and twelve notes, stores their IDs, then the tests check exact subsets, ordered IDs and metadata. The cleanup deletes only those records. The optional fixed-timestamp fixtures are not part of this main run.
5. If setup fails, fix the FIRST failure before treating later failures as separate defects. A normal assertion failure does not itself stop the subsequent requests. If you stop the run or a script error prevents cleanup, use Atlas to inspect only your test database and remove the leftover fixture records, or use a new empty test database for the next run. Do not reuse a nonempty database: this suite intentionally checks global counts too.
6. A successful run leaves no fixture users or notes. MongoDB collections, indexes and the ticket counter can remain; the suite does not reset ticket numbering or drop databases.

## Optional equal-timestamp test

The API does not let you assign `updatedAt`, so ordinary HTTP fixtures cannot guarantee a timestamp tie. The main suite checks descending timestamp/ID ordering on returned records and verifies an update moves a note to the front; that is not proof of behavior on a deliberately seeded tie.

AFTER the main run finishes and cleans up:

1. Open mongosh against the SAME test database (Atlas Connect -> Shell, or Compass embedded shell). Select it with `use repair_shop_test` if needed.
2. Execute `tie-fixture.mongosh.js` with `load('/absolute/path/to/tie-fixture.mongosh.js')`, or paste its contents. It refuses databases whose names do not begin `repair_shop_test` and refuses nonempty users/notes collections. It inserts one user and two notes with equal `updatedAt` and different fixed IDs.
3. Set `runTieFixture=true` in your selected Postman environment (or collection variables if not using an environment). Run ONLY folder `07 Optional equal-timestamp fixture`. Do NOT run the main collection with these fixtures present.
4. In mongosh, remove ONLY these optional fixtures:

   ```javascript
   db.notes.deleteMany({ _id: { $in: [ObjectId('650000000000000000000001'), ObjectId('650000000000000000000002')] }, title: /^canonical-tie-fixture / });
   db.users.deleteOne({ _id: ObjectId('650000000000000000000010'), username: 'canonical_tie_fixture_user' });
   ```

5. Restore `runTieFixture=false` before your next whole-collection run.

## Covered assertions

- Search in title and text, case insensitivity, trimming, missing/empty/whitespace search as no filter; blank search retains `completed` filtering.
- Literal regex metacharacters including plus, brackets, backslash, parentheses and anchors; a contrasting decoy record.
- Both completion values, search AND completion, username enrichment, create default completion false.
- Defaults, limit 1/50, exact page multiples, first/middle/final/beyond-final pages, exact note IDs and all six metadata fields, zero matches including an out-of-range page.
- Repeated supported keys, unsupported and bracket-form keys, noncanonical/negative/fractional/unsafe integers, empty values, limit 51, invalid boolean spellings and search length boundaries.
- User/note create, retrieval, update, delete; duplicate names/titles; password exclusion; `active:false` and `completed:false`; ownership deletion guard; missing fields and nonexistent valid IDs; persistence and cleanup.

## Limits and additional issues to track

- This artifact has not been run against your live server and MongoDB. Generation/static checking is not a passing integration result.
- HTTP query parameters are strings or repeated arrays under the app's simple query parser. Arbitrary JavaScript object/non-string helper arguments need separate unit tests; bracket-form parameters are tested as unsupported names here.
- No login endpoint exists here, so excluding password hashes from GET responses does not prove that an omitted PATCH password preserved its hash. The request exercises that code path; direct database hash comparison would be required to prove preservation.
- Concurrency races, malicious body inputs, malformed ObjectIds, authorization, performance, simultaneous find/count consistency, orphan-user enrichment and unsafe computed skip offsets are not covered by this contract suite. They are separate tests/design decisions, not implied passing claims.
- Equal-timestamp ordering is proven only after you run the optional database fixture test.

## Recording results honestly

After an actual run, add its date, backend commit SHA, Postman version, exact executed request/assertion counts and failures to your root README. Export the run result if your Postman version supports it; check it for sensitive data before committing. Keep a failed run's failures visible rather than writing "all tests passed".

Suggested wording BEFORE a live run:

> Includes a canonical Postman collection covering GET /notes search, filtering, validation, pagination and sorting, plus user/note CRUD regression. Run against an empty dedicated MongoDB test database. A live integration result has not yet been recorded.

Suggested wording AFTER a successful run (replace placeholders):

> At commit [SHA], the canonical Postman suite passed [N] assertions across [R] executed requests on [DATE] against a dedicated MongoDB test database. The optional equal-timestamp sort check [was also run and passed / was not run].

References: https://www.mongodb.com/docs/atlas/connect-to-database-deployment/ ; https://www.mongodb.com/docs/manual/core/databases-and-collections/ ; https://learning.postman.com/docs/tests-and-scripts/running-collections/intro-to-collection-runs
