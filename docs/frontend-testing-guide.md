# Frontend Testing Setup — A Reference Architecture

A framework-agnostic description of a well-structured React frontend test suite,
generalized from a real-world setup. It describes both **how the pieces fit
together** and **why each choice is the "proper" one**, so it can be lifted into
any React + Vite + TanStack Query project.

The stack it assumes: **Vitest + jsdom + @testing-library/react + MSW**, with a
**code-generated API client** (e.g. `openapi-ts`) and a third-party **auth
provider** (e.g. Clerk/Auth0). Where a tool is interchangeable, the principle is
called out, not the brand.

---

## Core principles (the "why")

1. **Test against the network boundary, not mocked modules.** Intercept HTTP at
   the wire with MSW. Components, hooks, and the real data-fetching library all
   run unmodified; only the server is fake. This exercises the actual query keys,
   serialization, retry, and error-mapping code — the things that break in
   production — instead of a hand-stubbed `useQuery`.
2. **One source of truth for types.** Mock fixtures are typed from the *same
   generated client types* as production code. A backend contract change breaks
   the mocks at compile time, so the test suite can never drift into asserting a
   shape the server no longer returns.
3. **Total isolation between tests.** Every test gets a fresh query cache, a
   reset in-memory server state, cleared storage, and re-installed auth. No test
   can leak state into the next. This is the single biggest lever against flake.
4. **Fail loudly on the unexpected.** Any HTTP call without a registered handler
   is an error, not a silent pass-through. Unimplemented browser APIs are
   polyfilled centrally, not patched ad-hoc per file.
5. **Tests live next to code and test behavior, not implementation.** Colocated
   `*.test.ts(x)`, queried by accessible role/text, awaited with `findBy`/
   `waitFor`. No central `__tests__/` dump, no snapshot-everything.

---

## Directory layout

```
src/
├── setupTests.ts            # global setup: server lifecycle, polyfills, auth, interceptors
├── test-utils/              # how to RENDER things under test
│   ├── render.tsx           #   render helpers (query client + router wrappers)
│   ├── queryClient.ts       #   per-test QueryClient factory
│   ├── authMocks.ts         #   hoisted auth-hook mocks
│   └── authenticatedTest.ts #   opt-in "force signed-in" helper
├── mocks/                   # the fake BACKEND
│   ├── node.ts              #   MSW server instance + state reset
│   ├── handlers/            #   HTTP handlers, split by domain
│   │   ├── index.ts         #     composes all handlers + resetMockStore()
│   │   ├── constants.ts     #     shared API_BASE
│   │   ├── <domain>.ts      #     one module per resource area
│   │   └── <domain>.test.ts #     contract tests (schema-validate responses)
│   ├── data/                #   in-memory stores + seed fixtures
│   │   ├── index.ts         #     resetMockData() — resets every store
│   │   └── <domain>.ts      #     mutable store + resetXStore() + seed fixtures
│   └── auth.ts              #   auth-provider mock + global install
└── feature/Thing.test.tsx   # tests colocated with the code they cover
```

The split is deliberate: **`test-utils/` is about rendering the thing under
test; `mocks/` is the fake backend.** They never bleed into each other.

---

## 1. Global setup (`setupTests.ts` + `vitest.config.ts`)

### Vitest config

```ts
test: {
  globals: true,
  environment: "jsdom",
  env: {                       // pin env vars so the mock API_BASE and the app's
    VITE_API_BASE_URL: "...",  // env module agree byte-for-byte (esp. in CI:
    /* auth + other keys */    // 127.0.0.1 vs localhost mismatches break MSW)
  },
  setupFiles: "./src/setupTests.ts",
  testTimeout: 10_000,
  hookTimeout: 10_000,
  maxWorkers: process.env.CI ? 2 : undefined,  // bound CI parallelism
  mockReset: true,             // reset mock fns between tests automatically
  restoreMocks: true,          // restore spies to originals between tests
  typecheck: { tsconfig: "./tsconfig.test.json" },  // type-check the test code too
  coverage: {
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["src/mocks/**", "src/test-utils/**", "src/**/*.test.*",
              "src/client/**" /* generated */, "src/main.tsx"],
  },
}
```

Key decisions worth copying:
- **Pin the test env vars in config**, not in a `.env.test` that may not load.
  The mock server URL and the app's runtime URL must match exactly.
- **`mockReset` + `restoreMocks`** so mock-fn state never carries over.
- **A dedicated test tsconfig under `typecheck`** — the type-checker covers test
  files, catching contract drift in fixtures, not just runtime failures.
- **Generated client and mocks are excluded from coverage** — coverage measures
  *your* code, not codegen or test scaffolding.

### `setupTests.ts` — runs once, wires everything

Responsibilities, in order:

1. **Extend the assertion library** (`@testing-library/jest-dom`).
2. **Mock the auth provider at the module boundary** (hoisted mock — see §4) so
   no real SDK/network is touched and every component tree has a deterministic
   auth state.
3. **Polyfill jsdom gaps centrally**: `scrollIntoView`, `scrollTo`,
   `HTMLDialogElement.showModal/close`, `matchMedia`, and an in-memory
   `localStorage` (newer Node ships an experimental `localStorage` global that
   shadows jsdom — force a known implementation). Polyfilling *once* here beats
   per-file patching and silences noisy stderr.
4. **Configure the generated client base URL** and register any **runtime
   interceptors** the app relies on (e.g. an error-status interceptor that maps
   HTTP codes to typed errors) — so tests exercise the *real* request pipeline.
5. **Server lifecycle hooks:**

```ts
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });  // unhandled call = failure
  installAuthGlobal();
});

afterEach(() => {
  server.resetHandlers();    // drop per-test server.use(...) overrides
  resetMockServerState();    // reset every in-memory store to its seed
  localStorage.clear();
  installAuthGlobal();       // re-install auth global for the next test
  cleanup();                 // unmount React trees
});

afterAll(() => server.close());
```

`onUnhandledRequest: "error"` is the load-bearing line — it converts "I forgot a
handler" from a silent empty response into a test failure with the offending URL.

---

## 2. The network layer: MSW with stateful in-memory stores

This is the heart of the setup. The fake backend is **stateful** — it behaves
like a real server across a test's interactions (create then list, toggle then
read) — yet **resets to a known seed between tests**.

### Handlers split by domain

Each resource area gets its own `handlers/<domain>.ts` exporting an array of MSW
handlers. A single `handlers/index.ts` composes them and exposes one
`resetMockStore()`:

```ts
export const handlers = [
  ...inventoryHandlers, ...workflowHandlers, ...documentsHandlers, /* ... */
];

export function resetMockStore() {
  resetMockData();   // every data store
  resetJobs();       // any async-job registries
}
```

A shared `constants.ts` holds the single `API_BASE` so handler URLs aren't
copy-pasted (and match the pinned env var).

### In-memory stores with explicit reset

State lives in `data/<domain>.ts` as module-level mutable structures, each with a
`resetXStore()` that rebuilds the seed. `data/index.ts` aggregates them:

```ts
// data/inventory.ts
let assets: MockAsset[] = seedAssets();
export const assetStore = { get: () => assets, add: (a) => assets.push(a), /* ... */ };
export function resetInventoryStore() { assets = seedAssets(); }

// data/index.ts
export function resetMockData() {
  resetInventoryStore();
  resetWorkflowStore();
  /* ...every store... */
}
```

This is what lets a test do `POST /assets` then `GET /assets` and see its own
write — while the next test starts clean. **Every new store must register its
reset in `resetMockData()`**; a forgotten reset is a classic cross-test-leak bug.
Guard it with a `mockReset.test.ts` that mutates one entry per store and asserts
the reset clears it.

### Per-test overrides, never shared-handler mutation

Edge cases (a 500, a 409, an empty list) are injected per test and auto-rolled
back by the `afterEach` `resetHandlers()`:

```ts
it("surfaces a server error", async () => {
  server.use(
    http.get(`${API_BASE}/documents`, () =>
      HttpResponse.json({ detail: "boom" }, { status: 500 }),
    ),
  );
  // ...assert the error UI
});
```

Rule: **don't mutate the shared handler for one test's edge case** — use
`server.use(...)`. Shared handlers stay representing the happy path.

### Deterministic async / job control

For long-running or polled operations (uploads, background jobs, streams), the
handler module exposes setters so a test can pin the outcome and the suite never
depends on timing:

```ts
setMswJobOutcome("succeeded");  // or "failed", "pending"
// poll handler reads this registry; resetJobs() clears it in afterEach
```

This replaces real `setTimeout`/sleep loops with controllable state — fast,
deterministic, no fake timers needed for the common case.

---

## 3. The type contract: fixtures typed from the generated client

Mocks import the **same generated types** as production. No parallel
hand-written entity interfaces.

| Pattern | Example | When |
| --- | --- | --- |
| Type alias for readability | `type MockDocument = DocumentResponse` | re-exporting a codegen type under a friendlier name |
| Direct codegen type | `HydratedTaskResponse` | preferred for new domains |
| Writable store type | `type MockAsset = AssetResponseWritable` | in-memory store that adds computed fields at response time |
| Runtime contract check | `zListAssetsResponse.parse(resp)` in `<domain>.test.ts` | per-domain schema validation |

Two consequences:
- **Compile-time drift protection** — the typecheck step fails if a fixture no
  longer matches the contract.
- **Runtime contract tests** — `handlers/<domain>.test.ts` files assert that the
  mock's responses pass the generated Zod schemas, so the *mock itself* is
  verified against the contract, not just the components consuming it.

Wire-format gotchas are honored in the fixtures (e.g. money as strings
`"15000.00"`, IDs as valid RFC-4122 UUIDs because the generated SDK validates
them). Centralize shared IDs in `data/` and import them — never inline magic
UUIDs in tests.

---

## 4. Render utilities (`test-utils/`)

### A fresh QueryClient per test

```ts
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },   // no retries, no cross-test cache
      mutations: { retry: false },
    },
  });
}
```

`retry: false` makes error paths resolve immediately (no multi-second backoff);
`gcTime: 0` ensures no cached data survives into the next test. **This pairing is
the main defense against query-cache leakage and slow error tests.**

### Layered render helpers

A small ladder, each adding one concern, so a test pulls in only what it needs:

```ts
renderWithQueryClient(ui)             // QueryClient only
renderWithRouter(ui, { initialEntries })  // + MemoryRouter
renderPage(ui, { path })              // + sensible default route for scoped pages
renderPlain(ui)                       // no providers (component uses no queries)
```

Each returns `{ user: userEvent.setup({ delay: null }), ...renderResult }` so
tests get a ready interaction handle and don't re-instantiate `userEvent`.

**Rule:** components that use the data-fetching library must be rendered through
the query-aware helper — importing raw `render` loses the per-test client and
leaks cache. This is the single most common cause of mystery cross-test failures.

### Auth mocking

The auth-provider hooks are mocked **once, hoisted**, in setup:

```ts
const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => getAuthContext()),   // default: signed-in-but-overridable
  useUser: vi.fn(() => getUserContext()),
  /* ... */
}));
vi.mock("<auth-sdk>", () => ({ /* provider becomes pass-through */ useAuth: authMocks.useAuth, ... }));
```

`vi.hoisted` is required because `vi.mock` is hoisted above imports — the mock fns
must exist before the factory runs. A default signed-in context covers most
tests; an opt-in `setupAuthenticatedTest()` (called in `beforeEach`) forces an
explicit signed-in slate when a test overrides auth. The `afterEach` reinstalls
the auth global so overrides never leak.

---

## 5. Conventions

- **Colocated tests.** `Thing.test.tsx` next to `Thing.tsx`. No `__tests__/`
  directory. A test is found where its subject lives.
- **Lint test files specially.** Apply `eslint-plugin-testing-library` (and
  jest-dom rules) scoped to `*.{spec,test}.{ts,tsx}` so the linter enforces
  `findBy` over `waitFor(getBy)`, no direct-node access, etc.
- **Query by accessibility.** Prefer `findByRole`/`findByText` (role/name) over
  test-ids and DOM traversal. Use `findBy*`/`waitFor` for anything async; reserve
  `getBy*` for synchronously-present elements (avoids `act` warnings).
- **Prime the cache for pure hook tests.** When a hook test isn't exercising the
  fetch path, `queryClient.setQueryData(queryKey, fixture)` before `renderHook`
  is cheaper and clearer than spinning up a handler. Use MSW only when the test
  must assert request/response behavior.
- **Scripts:** `test` (watch), `test:run` / `test:ci` (single pass),
  `coverage`, plus a `typecheck` that includes test files. CI runs the
  single-pass + typecheck + lint + build.

---

## 6. What to test where (applied test pyramid)

A pare-down policy keeps the suite lean and meaningful:

| Situation | Where it belongs |
| --- | --- |
| API contract / serialization | `handlers/<domain>.test.ts` — Zod-validate the mock response against the generated schema |
| Pure logic (money math, mappers, form diffs, filters) | plain unit test, no render |
| Hook behavior (caching, derived state, mutations) | `renderHook` + per-test QueryClient (+ MSW if asserting requests) |
| Component behavior / one integration smoke per page | `renderWithQueryClient`/`renderPage` + MSW happy path |
| Brittle visual / breakpoint / layout | **not** in jsdom — defer to manual QA or a browser-level tool (Playwright) |
| Mega 400-line integration tests | split into hook tests + one smoke test |

Defer rather than delete known gaps: `it.todo("...")` with a one-line intent
beats `describe.skip`, because todos surface in the runner output.

---

## 7. How isolation is actually guaranteed

Every `afterEach` (and the config) collaborates so each test starts from zero:

| Concern | Reset by |
| --- | --- |
| Query cache | new `QueryClient` per render + `gcTime: 0` |
| Server route overrides | `server.resetHandlers()` |
| In-memory backend data | `resetMockServerState()` → `resetMockData()` + `resetJobs()` |
| Browser storage | `localStorage.clear()` |
| Auth state | re-`installAuthGlobal()` + `mockReset` |
| Mounted React trees | `cleanup()` |
| Mock fns / spies | `mockReset: true`, `restoreMocks: true` |

If any one of these is missing for a newly added stateful surface, you get
order-dependent flake. The discipline is: **whenever you add stateful test
infrastructure, add its reset to the matching teardown.**

---

## 8. Anti-patterns / failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `fetch` not intercepted / unhandled request error | handler URL mismatch or missing handler | add/fix handler in `handlers/<domain>.ts` |
| Stale data bleeding across tests | used raw `render` instead of the query-aware helper | render through `renderWithQueryClient` |
| `act(...)` warnings | asserted before an async update settled | use `findBy*` / `await waitFor(...)` |
| Slow error-path tests | retries enabled | `retry: false` in the test QueryClient |
| `Not implemented: scrollTo` (etc.) | jsdom gap | add the polyfill to `setupTests.ts`, not per file |
| Mock compiles but server rejects the shape | hand-written fixture type | type fixtures from the generated client; add a handler contract test |
| Order-dependent failures | a store/global without a reset | register its reset in the `afterEach` chain |

---

## Checklist: is a frontend test setup "proper"?

- [ ] Network is intercepted at the wire (MSW), not by mocking the fetch hook.
- [ ] Unhandled requests **fail** the test (`onUnhandledRequest: "error"`).
- [ ] Mock fixtures are typed from the **generated API client**; contract tests
      schema-validate mock responses.
- [ ] In-memory mock state is **stateful within a test, reset between tests**,
      with one aggregate `resetMockStore()`.
- [ ] Each test gets a **fresh QueryClient** with `retry: false`, `gcTime: 0`.
- [ ] Auth provider mocked once (hoisted) with a deterministic default + opt-in
      override; re-installed each `afterEach`.
- [ ] jsdom gaps polyfilled centrally in setup; env vars pinned in config.
- [ ] Tests colocated; queried by role/text; async awaited; lint rules scoped to
      test files.
- [ ] Coverage excludes generated + scaffolding code.
- [ ] A documented policy for **what to test where** (contract vs unit vs hook vs
      smoke) and how to defer gaps (`it.todo`).
```
