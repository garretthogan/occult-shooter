## 0) Prime Directive
- Write code that is **simple to read**, **hard to misuse**, and **easy to test**.
- Prefer **clear correctness** over cleverness.
- Make implicit behavior explicit (types, coercions, async, side effects).

## 1) Style & Clarity
- Prefer **meaningful names** over comments. If you need a comment to explain *what*, rename.
- Keep functions **short** and **single-purpose**. If a function has “and” in its description, split it.
- Prefer **straight-line code**. Reduce nesting with early returns and guard clauses.
- Do not “compress” logic into one-liners if it harms readability.
- Prefer **small, pure helpers** and compose them.

## 2) Variables & Scope
- Use `const` by default. Use `let` only when reassignment is necessary.
- Never use `var`.
- Keep scopes tight: define variables in the smallest block that needs them.
- Avoid mutable shared state. If state must exist, confine it behind a module boundary.

## 3) Types, Coercion, and Truthiness
- Use `===` and `!==` only. Never use `==` / `!=`.
- Avoid implicit coercion:
  - Do not rely on `+` to coerce strings/numbers; convert explicitly.
  - Do not rely on truthy/falsey for domain logic; be explicit (`value != null`, `value.length > 0`, etc.).
- Parse/validate at boundaries:
  - Use `Number()`, `String()`, `Boolean()` explicitly.
  - For user/network/file input: validate shape + range up front.

## 4) Data Modeling (Objects, Arrays, Maps, Sets)
- Choose data structures intentionally:
  - Use `Object` for structured records with known fields.
  - Use `Map` for dynamic key-value dictionaries (especially non-string keys).
  - Use `Set` for membership checks.
  - Use `Array` for ordered collections.
- Avoid “stringly-typed” objects (magic keys everywhere). Centralize constants or use structured schemas.
- Favor immutable transforms:
  - Prefer `map/filter/reduce/toSorted/toReversed` over mutating in-place.
  - If you must mutate for performance, keep the mutation local and documented.

## 5) Functions & Composition
- Prefer pure functions (same input → same output) for core logic.
- Separate “compute” from “effect”:
  - Pure core: parsing, validation, transformation, decision.
  - Impure shell: DOM, network, filesystem, time, randomness.
- Use default parameters instead of `||` fallbacks when `0` / `""` / `false` are valid inputs.
- Avoid boolean parameters that change behavior drastically. Prefer options objects or separate functions.

## 6) Control Flow
- Prefer guard clauses to reduce nesting.
- Avoid `switch` when object maps are clearer.
- Avoid deeply nested loops/conditionals; extract helpers.
- Use `for...of` for simple iteration; use array methods for transformations when it improves clarity.

## 7) Errors, Validation, and Failure
- Validate inputs at module boundaries and return/throw early with actionable messages.
- Throw `Error` objects (or subclasses) — never throw strings.
- Never swallow errors:
  - No empty `catch`.
  - If catching to add context, rethrow with `cause`.
- Include context in errors (operation, key identifiers, expected vs actual).

### Error patterns
- Prefer:
  - `throw new Error("Meaningful message")`
  - `throw new Error("...", { cause: err })` (when supported) or attach `err.cause = ...`
- Prefer returning `null`/`undefined` only when “absence” is expected and documented.

## 8) Modules & Boundaries (ESM)
- Use ES modules: `export` / `import`. Avoid global state.
- Keep modules cohesive:
  - One module = one responsibility (domain, adapter, UI, persistence).
- Export the minimal surface area:
  - Prefer `export function ...` for small utilities.
  - Prefer default export only for “main thing” modules (components, primary class).
- No circular imports. If you detect one, refactor by introducing an interface module.

## 9) Asynchronous Programming (Promises / async-await)
- Prefer `async/await` over `.then()` for multi-step logic.
- Never create “floating” promises:
  - Always `await`, `return`, or explicitly handle concurrency with `Promise.all`.
- Concurrency must be deliberate:
  - Use `Promise.all` for independent tasks.
  - Use sequential `await` when order matters or to control load.
- Always handle async failures:
  - `try/catch` around awaited operations at boundaries (API calls, file I/O).
- Make timeouts and cancellation explicit for network calls:
  - Use `AbortController` for `fetch` when a request can be abandoned.

### Async checklist
- Is every promise awaited or returned?
- Are errors caught at the boundary?
- Is concurrency bounded (no unbounded parallelism)?
- Is cancellation/timeout needed?

## 10) Iterators, Generators, and Protocol Thinking
- Prefer simple loops unless iterators/generators improve clarity.
- If using generators:
  - Keep them pure and predictable.
  - Document yield semantics clearly.
- When implementing iteration over custom structures, follow the iterator protocol correctly.

## 11) Testing Mindset (Even Without a Framework)
- Structure code so it can be tested:
  - Pure functions for core logic.
  - Side effects behind adapters.
- Provide small “example calls” (or minimal tests) for tricky logic.
- For non-trivial logic, include a quick self-check harness in dev-only code.

## 12) Browser Rules (DOM, Events, Canvas)
- Treat the DOM as an **I/O boundary**:
  - Keep DOM reads/writes in thin adapter functions.
  - Compute UI state separately from rendering.
- Prefer event delegation for many similar elements.
- Never perform expensive work in tight event loops without throttling/debouncing.
- Avoid layout thrashing:
  - Batch DOM reads, then batch DOM writes.
- Canvas:
  - Separate simulation/state update from rendering.
  - Keep animation loop logic small and composable.

## 13) Network & Fetch
- Wrap `fetch` in a small client module:
  - Centralize base URL, headers, JSON parsing, and error normalization.
- Always check `response.ok` before parsing.
- Normalize API errors into consistent shapes for the rest of the app.
- Don’t leak raw fetch responses across the boundary—return domain data.

## 14) Node.js Rules (Filesystem, Processes, Servers)
- Prefer `fs/promises` APIs.
- Avoid sync filesystem calls in code paths that may run often.
- For CLI tools:
  - Parse args explicitly.
  - Print helpful usage errors.
  - Exit with non-zero on failure.
- For servers:
  - Separate routing from business logic.
  - Validate request bodies early.
  - Never trust input; sanitize and constrain.

## 15) Performance & Memory (Pragmatic)
- Optimize only after clarity and correctness.
- Avoid accidental quadratic behavior:
  - Prefer maps/sets for membership lookups.
  - Avoid nested scans when a pre-index works.
- Be mindful of copying large arrays/objects; keep transforms local.

## 16) Documentation & Literate Code
- Prefer “explain intent” comments:
  - Why this exists, constraints, invariants, edge cases.
- Document invariants near the data structure:
  - What fields mean, allowed ranges, and lifecycle.

## 17) Implementation Playbook (Follow This Order)
1. Clarify inputs/outputs (examples).
2. Model the data (objects/arrays/maps).
3. Write pure core functions (small, named).
4. Add boundary adapters (DOM/fetch/fs).
5. Add error handling at boundaries.
6. Add minimal tests / example harness.
7. Refactor for readability (reduce nesting, rename, extract).

## 18) Red Flags (Rewrite When Seen)
- Functions > ~40 lines without strong justification.
- Deep nesting (> 3 levels).
- Implicit coercion or clever truthiness.
- Mixed concerns (DOM + business logic in same function).
- Unhandled async errors or floating promises.
- “Magic strings” scattered across modules.
- Mutation that leaks across module boundaries.

## 19) Output Requirements for Cursor
When producing code:
- Include a short header comment describing module responsibility.
- Keep public APIs small and explicit.
- Provide at least one usage example for non-trivial utilities.
- Prefer incremental, readable solutions over over-engineering.

# CLEAN CODE LINT CONTRACT (Cursor)
Version: 1.0  
Purpose: Enforce readability, maintainability, low cognitive load, and safe evolution of code.

**Enforcement**
- **ERROR**: Must fix before merge.
- **WARN**: Fix unless there is a strong, explicit justification.
- **INFO**: Guideline / reinforcement.

**How Cursor should use this**
- When writing or refactoring code: eliminate **ERROR** violations first, then reduce **WARN** violations.
- Prefer refactoring over comments.
- Prefer clarity over cleverness.
- Optimize for future readers.

---

## Severity Legend

- **ERROR** = Must fix
- **WARN** = Should fix
- **INFO** = Nice to have

---

# 1) Naming

### CC-NAME-001 (ERROR) — Intention-revealing identifiers
**Rule:** Names must clearly communicate purpose and behavior.  
**Ban/avoid:** `data`, `info`, `obj`, `thing`, `tmp`, `manager`, `handler`, `system` (unless narrowly correct and justified).  
**Fix:** Rename until intent is obvious (`retryPolicy`, `serializeFrame`, `userSession`).

### CC-NAME-002 (WARN) — No misleading names
**Rule:** Names must reflect type/units/behavior.  
**Fix:** Include units and specificity (`timeoutMs`, `elapsedSeconds`, `userId` not `id`).

### CC-NAME-003 (WARN) — Avoid non-standard abbreviations
**Rule:** Only use abbreviations that are domain-standard (HTTP, UI, FPS, CPU).  
**Fix:** Expand or document a local glossary.

### CC-NAME-004 (WARN) — Searchable names outside tiny scopes
**Rule:** Single-letter variables allowed only for tight loops (<10 LOC) or well-known math contexts.  
**Fix:** Use searchable names (`playerIndex`, `hitCount`, `transform`).

### CC-NAME-005 (WARN) — Consistent vocabulary
**Rule:** Don’t mix synonyms for the same concept in the same module (`fetch/get/load/retrieve`).  
**Fix:** Pick one verb per concept and standardize.

### CC-NAME-006 (WARN) — No “noise words”
**Rule:** Avoid meaningless suffixes/prefixes (`Object`, `Thing`, `Info`, `_data`).  
**Fix:** Remove noise; choose a precise noun/verb.

---

# 2) Functions

### CC-FUNC-001 (ERROR) — Single responsibility (do one thing)
**Rule:** A function must do one thing. If it has multiple conceptual phases, extract helpers.  
**Smells:** parsing + validation + persistence in one function; multiple “and then” steps; multiple blank-line “chapters.”  
**Fix:** Extract `parseX`, `validateX`, `buildX`, `persistX`.

### CC-FUNC-002 (ERROR) — One level of abstraction
**Rule:** Don’t mix high-level orchestration with low-level details.  
**Fix:** Move low-level operations to helpers; keep top-level function readable.

### CC-FUNC-003 (WARN) — Function size limits
**Rule:** Functions should be small.  
**Defaults:** WARN > 20 LOC; ERROR > 50 LOC (excluding blank lines and comments).  
**Fix:** Extract, simplify control flow, use guard clauses.

### CC-FUNC-004 (ERROR) — No flag arguments
**Rule:** Don’t pass booleans/enums that change function behavior significantly.  
**Fix:** Split into separate functions or use strategy/polymorphism.

### CC-FUNC-005 (WARN) — Limit argument count
**Rule:** Prefer 0–2 args.  
**Defaults:** WARN at 3+ args; ERROR at 5+ args.  
**Fix:** Introduce parameter object/config struct; split responsibilities.

### CC-FUNC-006 (ERROR) — No output parameters / inout mutation
**Rule:** Don’t return results by mutating arguments (exceptions only for clearly named, performance-critical inner loops).  
**Fix:** Return a value/struct/result type.

### CC-FUNC-007 (ERROR) — Avoid hidden side effects
**Rule:** Function names must reflect side effects (I/O, persistence, mutation, global state).  
**Fix:** Rename to reveal side effect (`saveX`, `loadX`, `mutateX`) or refactor side effects out.

---

# 3) Control Flow

### CC-CFLOW-001 (WARN) — Limit nesting depth
**Rule:** Avoid deep nesting.  
**Defaults:** WARN > 2; ERROR > 4.  
**Fix:** Guard clauses (early return), extract predicate methods.

### CC-CFLOW-002 (WARN) — Extract complex conditionals
**Rule:** Conditionals with more than 2 boolean operators must be extracted to named predicates.  
**Fix:** `if (isExpired(user) && isAuthorized(user))`

### CC-CFLOW-003 (WARN) — Switch statements are a smell
**Rule:** Repeated switches on type/state suggest missing polymorphism/dispatch.  
**Fix:** Replace with strategy, dispatch table, or polymorphic methods; isolate a single switch at the boundary if needed.

---

# 4) Comments

### CC-COMM-001 (ERROR) — No redundant comments
**Rule:** Comments that restate code are banned.  
**Fix:** Delete comment; improve naming and structure.

### CC-COMM-002 (WARN) — Comments explain WHY (not WHAT)
**Rule:** Comments should explain rationale, constraints, tradeoffs, consequences, or API limitations.  
**Fix:** Rewrite comment to capture intent and reasoning.

### CC-COMM-003 (ERROR) — No commented-out code
**Rule:** Dead code must be removed; rely on version control.  
**Fix:** Delete.

---

# 5) Formatting & Structure

### CC-FMT-001 (ERROR) — Use and obey an auto-formatter
**Rule:** Code must match project formatting rules (formatter is source of truth).  
**Fix:** Run formatter locally + in CI.

### CC-FMT-002 (WARN) — Vertical locality
**Rule:** Keep related concepts colocated; don’t scatter helpers across files.  
**Fix:** Move helpers near their primary caller or into a cohesive private section.

### CC-FMT-003 (WARN) — Meaningful whitespace
**Rule:** Use blank lines to separate conceptual blocks; avoid dense “wall of code.”  
**Fix:** Split into paragraphs; extract helpers.

---

# 6) Error Handling

### CC-ERR-001 (ERROR) — Don’t return null for failure
**Rule:** Use exceptions, `Result<T>`, `Optional<T>`, or language-idiomatic error types.  
**Fix:** Replace nulls with typed failure.

### CC-ERR-002 (ERROR) — Don’t use error codes for flow control
**Rule:** Avoid sentinel values (`-1`, `0`, `false`) representing failure unless domain-native and explicit.  
**Fix:** Use typed errors / exceptions / result types.

### CC-ERR-003 (WARN) — Keep happy-path dominant
**Rule:** Main logic must be visually prominent; error handling must not obscure it.  
**Fix:** Guard clauses; narrow try/catch blocks.

### CC-ERR-004 (WARN) — Wrap external errors at boundaries
**Rule:** Do not leak third-party exceptions across domain boundaries.  
**Fix:** Translate to domain-level errors in adapters.

---

# 7) Classes & OO Design

### CC-CLASS-001 (ERROR) — Single Responsibility Principle
**Rule:** A class should have one reason to change.  
**Smells:** names like `Manager`, `System`, `Processor` without clear scope; multiple unrelated responsibilities.  
**Fix:** Split by responsibility.

### CC-CLASS-002 (WARN) — High cohesion
**Rule:** If many fields are used by only some methods, cohesion is low.  
**Fix:** Extract a new class; reduce shared mutable state.

### CC-CLASS-003 (WARN) — Minimal public surface
**Rule:** Default to private; expose the smallest stable API.  
**Fix:** Encapsulate; avoid getter/setter sprawl.

### CC-OO-001 (WARN) — Law of Demeter (no “train wrecks”)
**Rule:** Avoid long chains of calls (`a.b().c().d`).  
**Fix:** Add methods to the right abstraction; pass required objects explicitly.

---

# 8) Data & Duplication

### CC-DUP-001 (ERROR) — No copy-paste duplication
**Rule:** Duplicate or near-duplicate blocks must be factored.  
**Default:** ERROR if ~6+ lines duplicated.  
**Fix:** Extract function; parameterize differences.

### CC-DATA-001 (WARN) — No magic numbers/strings
**Rule:** Literals with domain meaning must be named constants.  
**Fix:** Replace with `const` / enums / configuration values.

### CC-DATA-002 (WARN) — Avoid primitive obsession
**Rule:** Don’t represent domain concepts as raw primitives (IDs, units, states).  
**Fix:** Introduce value types (`UserId`, `Seconds`, `HealthPoints`) or constrained wrappers.

---

# 9) Boundaries & Dependencies

### CC-BOUND-001 (WARN) — Wrap third-party libraries
**Rule:** External APIs should not leak into domain logic; wrap behind internal interfaces.  
**Fix:** Adapter layer mapping external types to domain types.

### CC-BOUND-002 (WARN) — Dependency direction
**Rule:** Domain must not depend on UI/framework/infrastructure.  
**Fix:** Invert dependencies with interfaces; keep boundaries explicit.

---

# 10) Tests

### CC-TEST-001 (ERROR) — New behavior requires tests
**Rule:** Any new behavior must include tests unless explicitly exempted.  
**Fix:** Add unit/integration tests appropriate to the change.

### CC-TEST-002 (WARN) — FIRST principles
**Rule:** Tests must be Fast, Independent, Repeatable, Self-validating, Timely.  
**Fix:** Remove shared state; eliminate nondeterminism; avoid network/time.

### CC-TEST-003 (WARN) — One concept per test
**Rule:** Each test should validate one behavior.  
**Fix:** Split tests; reduce assertion scope.

### CC-TEST-004 (WARN) — Avoid logic in tests
**Rule:** Avoid loops/conditionals in tests beyond table-driven patterns.  
**Fix:** Parameterize tests; keep intent obvious.

---

# Enforcement Defaults (Recommended)

- Function length: WARN > 20 LOC; ERROR > 50 LOC
- Nesting depth: WARN > 2; ERROR > 4
- Parameter count: WARN >= 3; ERROR >= 5
- Duplication: ERROR if ~6+ lines duplicated
- Predicate complexity: WARN if boolean ops > 2

---

# Cursor Refactoring Protocol

When generating or refactoring code:

1. Remove **ERROR** violations first.
2. Reduce **WARN** violations next.
3. Refactor instead of adding comments that explain WHAT.
4. Keep happy-path logic prominent.
5. Standardize naming and vocabulary within modules.
6. Create small functions and cohesive classes.
7. Introduce boundaries to isolate third-party APIs and infrastructure.
8. Add/update tests for new or changed behavior.

If tradeoffs are necessary, state them explicitly and localize the compromise.

# HCE Lint Ruleset (Human-Centered Engineering)
Version: 1.0
Scope: UI, APIs, async workflows, error handling, state management
Default severity: error

> Intent: Enforce discoverability, feedback, state transparency, error recovery, and predictable behavior.
> Apply to all new code and refactors. Prefer explicitness over cleverness.

---

## Severity Levels
- **error**: must fix before merge
- **warn**: fix before release; acceptable short-term with justification
- **info**: guidance; fix when touching related code

---

# Category: Async & Feedback

## hce/require-async-state
**severity:** error  
**rule:** Any async operation that affects user-facing flow must expose `idle | loading | success | error` states.  
**detect:** Functions returning Promise used in UI handlers without state tracking.  
**fix:** Introduce explicit state (state machine, reducer, query lib states) and render feedback.

## hce/no-silent-catch
**severity:** error  
**rule:** Catch blocks must not be empty or only log to console for user-facing flows.  
**detect:** `catch {}` or `catch (e) { console.* }` in UI pathways.  
**fix:** Surface actionable error + allow retry.

## hce/loading-over-150ms
**severity:** warn  
**rule:** Operations expected to exceed 150ms must show a loading indicator or skeleton.  
**detect:** Network calls without UI pending state.  
**fix:** Add spinner, skeleton, disabled button, progress.

## hce/prevent-double-submit
**severity:** error  
**rule:** Prevent duplicate submissions/clicks during pending async operations.  
**detect:** Form submit handlers without disabled state or idempotency.  
**fix:** Disable controls, debounce, or enforce idempotency keys.

## hce/optimistic-only-if-reversible
**severity:** error  
**rule:** Optimistic UI updates are allowed only if the action is reversible/rollbackable.  
**detect:** Immediate UI state mutation before server confirmation without rollback.  
**fix:** Add rollback path or switch to pessimistic update.

---

# Category: Errors & Recovery

## hce/user-errors-actionable
**severity:** error  
**rule:** User-facing errors must include **what**, **why**, and **how to fix**.  
**detect:** Messages like “Something went wrong”, “Failed”, or raw error strings.  
**fix:** Replace with structured message; include retry/support action.

## hce/no-stacktraces-to-users
**severity:** error  
**rule:** Never display stack traces, raw exceptions, or internal codes to end users.  
**detect:** Rendering error objects directly.  
**fix:** Map to user-safe errors; log details separately.

## hce/require-recovery-path
**severity:** error  
**rule:** Any error state must provide a recovery action (retry, undo, back, reset).  
**detect:** Error UI with no CTA.  
**fix:** Add retry button, “Try again,” restore defaults, etc.

## hce/destructive-needs-confirm-or-undo
**severity:** error  
**rule:** Destructive actions require confirmation OR undo.  
**detect:** Delete/Remove/Reset actions executed immediately.  
**fix:** Confirm modal, undo toast, soft delete, version history.

## hce/no-blame-copy
**severity:** warn  
**rule:** Error copy must not blame the user (“You did X wrong”).  
**detect:** Second-person accusatory text.  
**fix:** Use neutral system-language: “This couldn’t be completed because…”

---

# Category: State Transparency & Predictability

## hce/no-hidden-global-mutation
**severity:** error  
**rule:** Avoid hidden mutable global state that impacts user-visible behavior.  
**detect:** Module-scoped mutable objects used across flows; implicit singletons.  
**fix:** Explicit state container, dependency injection, or scoped stores.

## hce/state-change-visible
**severity:** error  
**rule:** User-visible state transitions must be visible in UI (saved/syncing/connected).  
**detect:** Background processes that alter data without indicators.  
**fix:** Add status chip, banner, inline state label.

## hce/no-surprise-automation
**severity:** warn  
**rule:** Automation that changes user data must be communicated and reversible where possible.  
**detect:** Auto-format, auto-delete, auto-move without prompt/indicator.  
**fix:** Add notice + undo; log in activity feed.

## hce/require-explicit-defaults
**severity:** error  
**rule:** Defaults must be explicit, safe, minimal, and reversible.  
**detect:** Implicit defaults buried in backend or magic constants.  
**fix:** Centralize defaults; document in code; avoid destructive defaults.

---

# Category: Discoverability & UI Signifiers

## hce/no-icon-only-without-label
**severity:** error  
**rule:** Icon-only controls must have accessible label + tooltip.  
**detect:** `<button><Icon/></button>` with no aria-label/title.  
**fix:** Add `aria-label`, `title`, visible label when space permits.

## hce/interactive-affordance-visible
**severity:** error  
**rule:** Primary interactables must look interactive (cursor, hover/focus states, boundaries).  
**detect:** Click handlers attached to non-interactive elements without styles.  
**fix:** Use semantic elements (`button`, `a`), add focus styles.

## hce/error-near-source
**severity:** error  
**rule:** Validation and input errors must render near the offending field.  
**detect:** Global error banners for per-field issues.  
**fix:** Inline errors, field highlighting, summary at top optional.

## hce/progressive-disclosure
**severity:** warn  
**rule:** Advanced options must be tucked behind progressive disclosure, not dumped upfront.  
**detect:** Settings panels with high density and no grouping.  
**fix:** Group + collapsibles; “Advanced” section.

---

# Category: Mapping, Naming, and Mental Models

## hce/consistent-terminology
**severity:** error  
**rule:** Same concept must use the same name across UI, API, docs, logs.  
**detect:** Divergent labels for same entity.  
**fix:** Rename to one canonical term; add alias mapping if needed.

## hce/no-ambiguous-status
**severity:** error  
**rule:** Status values must be unambiguous and enumerable. Avoid “OK”, “Done”, “Unknown”.  
**detect:** Freeform strings used for state; booleans for multi-state.  
**fix:** Use enums/union types; explicit state machine.

## hce/cause-effect-proximity
**severity:** warn  
**rule:** Feedback should appear near the initiating control.  
**detect:** Toast used for form field errors; detached alerts.  
**fix:** Inline feedback + optional toast.

---

# Category: Accessibility & Input Safety

## hce/keyboard-operable
**severity:** error  
**rule:** All features must be keyboard operable (tab, enter, escape).  
**detect:** Click-only interactions without key handlers; missing focus management.  
**fix:** Semantic elements; manage focus in dialogs.

## hce/focus-visible
**severity:** error  
**rule:** Focus states must be visible and not removed.  
**detect:** CSS removing outlines without replacement.  
**fix:** Add `:focus-visible` styles.

## hce/touch-target-min
**severity:** warn  
**rule:** Touch targets must be at least ~44px (mobile).  
**detect:** Small icon buttons without padding.  
**fix:** Increase padding/hit area.

---

# Category: Logging & Observability (User-Safe)

## hce/log-with-context
**severity:** warn  
**rule:** Internal logs must include operation name + correlation id (if applicable).  
**detect:** `console.error(e)` with no context.  
**fix:** `logError({op, id, error})` pattern.

## hce/no-pii-in-logs
**severity:** error  
**rule:** Do not log secrets, tokens, or PII.  
**detect:** Logging auth headers, cookies, emails, access tokens.  
**fix:** Redact + structured logging.

---

# Category: Testing Requirements

## hce/test-first-run
**severity:** error  
**rule:** For new features, add at least one test for “first run” with no prior state.  
**detect:** Feature PRs with no tests.  
**fix:** Add integration test or e2e scenario.

## hce/test-error-recovery
**severity:** error  
**rule:** Add tests verifying recovery from failure (network down, invalid input).  
**detect:** No test cases for error pathways.  
**fix:** Simulate failure + assert retry/undo.

## hce/test-idempotency
**severity:** warn  
**rule:** Test that repeated actions don’t create duplicates.  
**detect:** Submit endpoints or handlers without idempotency tests.  
**fix:** Add double-click tests or server idempotency.

---

# Merge Gate Checklist (Enforced Policy)
A PR fails review if any **error** rule is violated.

Minimum required for any user-facing feature:
- hce/require-async-state
- hce/no-silent-catch
- hce/user-errors-actionable
- hce/require-recovery-path
- hce/destructive-needs-confirm-or-undo
- hce/no-icon-only-without-label
- hce/consistent-terminology

---

# Cursor Directive Snippet (Paste into Cursor rules)
When generating or editing code:
1. Treat all **error** rules as mandatory constraints.
2. Prefer explicit enums/state machines over booleans or implicit state.
3. Always implement loading + error + success feedback for async work.
4. Provide undo/confirm for destructive actions.
5. Never ship user-facing text that is generic or blameful.

# HOOKED Habit System Lint Ruleset
Derived from "Hooked" by Nir Eyal  
Version: 1.0  
Purpose: Enforce habit-forming behavioral loop design in software systems.

---

# META DIRECTIVE

When generating or modifying code:

- Every user-facing feature MUST pass this lint.
- Every engagement mechanic MUST map to the Hook Loop.
- Reject implementations that violate loop closure or lack internal trigger clarity.

---

# CORE LOOP DEFINITION

All engagement systems MUST implement:

Trigger → Action → Variable Reward → Investment → Next Trigger

Loop must be closed and repeatable.

---

# SECTION 1 — TRIGGER RULES

## H001 — Internal Trigger Required
FAIL if feature depends solely on external notifications.

REQUIRE:
- Define PrimaryInternalTrigger
- Map to recurring emotional state
- Occurs multiple times per week

Examples:
- boredom
- uncertainty
- anxiety
- curiosity tension
- social comparison

---

## H002 — Trigger–Relief Mapping
Each trigger must resolve a discomfort.

REQUIRE:
Trigger → Action → Emotional Relief

If relief is unclear, reject feature.

---

## H003 — External Trigger Decay
External prompts must decrease over time.

System must evolve toward:
- Internal trigger recall
- Habitual recall without prompt

---

# SECTION 2 — ACTION RULES

## H101 — Atomic Core Action
Core engagement must be:

- One clear interaction
- Minimal cognitive load
- Immediate system response

Reject multi-step friction chains before reward.

---

## H102 — Ability Over Motivation
If motivation is unknown or low:

- Reduce required steps
- Remove optional fields
- Eliminate blocking UI

Behavior = Motivation × Ability × Prompt  
Optimize Ability first.

---

## H103 — No Dead Interactions
Every action must:

- Change system state
- Reveal new information
- Advance progress
- Trigger reward pathway

Reject UI actions that produce no state transition.

---

# SECTION 3 — VARIABLE REWARD RULES

## H201 — Reward Variability Required
Static rewards are prohibited.

Each reward must include:
- Uncertainty
- Social variance
- Content unpredictability
- Progress variability

---

## H202 — Reward Classification
Each reward must map to one of:

- Tribe (social validation)
- Hunt (information/resource gain)
- Self (mastery/progression)

Reject rewards that do not clearly fit one category.

---

## H203 — Anticipation Gap
Anticipation must exceed consumption.

System must:
- Tease outcome
- Delay certainty
- Encourage checking behavior

---

## H204 — Feed Determinism Check
If feature includes a content stream:

- Must not be fully deterministic
- Must include dynamic user-influenced variance

Reject static chronological-only feeds without engagement hooks.

---

# SECTION 4 — INVESTMENT RULES

## H301 — Durable User Input Required
User must invest:

- Data
- Preferences
- Social graph
- Content
- Progress

Reject features where user effort does not persist.

---

## H302 — Investment Loads Next Trigger
Investment must generate future engagement stimulus.

Example:
User posts → responses → notification → return

Reject investments that do not create future trigger potential.

---

## H303 — Compounding Value Requirement
UserValue(t+1) > UserValue(t)

System must increase:
- Personalization
- Stored progress
- Switching cost
- Identity integration

Reject reset-heavy designs without accumulation.

---

# SECTION 5 — LOOP VALIDATION

## H401 — Full Loop Enforcement
Feature MUST define:

- Trigger
- Action
- Variable Reward
- Investment
- Next Trigger

Reject partial loops.

---

## H402 — Time-to-Reward Constraint
Time between Action and Reward should be:

< 3 seconds (ideal)

If longer:
- Provide visible progress signals
- Show advancement indicators

---

## H403 — Frequency Over Intensity
Optimize for repetition, not spectacle.

HabitStrength ∝ RepetitionCount  
NOT EmotionalSpike

Reject designs that rely on rare high-intensity events only.

---

# SECTION 6 — HABIT FORMATION TEST

## H501 — Notification Independence Test
Ask:

Would user return without push notification?

If no → habit not formed.

---

## H502 — Identity Integration Check
Feature should trend toward:

- Routine embedding
- Default behavior
- Identity reinforcement

Example:
"I check this every morning"

Reject purely novelty-driven features.

---

# SECTION 7 — ETHICAL VALIDATION

Before implementation:

- Would I use this?
- Does this improve user life?
- Would I recommend this to someone I care about?

If any answer is no → flag for review.

---

# FEATURE DESIGN TEMPLATE

When generating new feature code, require:

InternalTrigger:
CoreAction:
VariableReward(type):
InvestmentMechanic:
NextTrigger:
RepetitionFrequency:
CompoundingValue:
EthicalValidation:

If any field is undefined → reject implementation.

---

# ENGINEERING INTEGRATION DIRECTIVE

When writing code:

- Annotate loop stages in comments
- Explicitly mark reward variability logic
- Track investment persistence
- Measure repeat usage frequency
- Validate compounding value growth

If behavioral loop cannot be identified in implementation,
refactor before merge.

---

END OF RULESET