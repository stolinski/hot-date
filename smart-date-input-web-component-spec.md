# Hot Date Web Component RFC (v0.5)

- Status: Draft RFC for workshop
- Component name: `hot-date`
- Custom element tag: `<hot-date>`
- Deliverable: Framework-agnostic web component for natural-language date/time entry with interactive ambiguity resolution and high-performance desktop-first autocomplete.

## 1) Normative Language

The key words `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are to be interpreted as normative requirements.

## 2) Product Positioning

`hot-date` MUST behave like a parser + resolver + state machine, not a calendar-first input.

The component MUST:

- accept human phrases (for example `next fri 2pm`, `end of month`)
- preserve ambiguity instead of silently forcing one interpretation
- provide visible autocomplete actions during typing
- support fast keyboard completion with desktop-first acceptance (`ArrowRight` default, `Tab` opt-in)

The component SHOULD remain highly usable on mobile, but MVP performance and interaction tuning SHOULD prioritize desktop users.

## 3) Scope

### 3.1 In Scope (MVP)

- rule-based tokenizer + grammar parser + resolver
- visible autocomplete button row while typing/focus
- ghost suggestion + desktop suggestion acceptance flow
- exact date range parsing (`<date> to <date>`, `<date> - <date>`)
- relative arithmetic (`+/- duration`, `in/past/from now`)
- holiday anchors and explicit long-form dates needed by challenge phrases
- ambiguity chips and explicit ambiguity state
- canonical value commit only when resolvable
- form-associated custom element behavior

### 3.2 Out of Scope (MVP)

- full NLP/LLM language understanding
- multilingual parsing
- recurrence (`every friday`) and advanced recurrence scheduling
- opening a full calendar on each keystroke

## 4) Public API Contract

### 4.1 Attributes

The element MUST expose the following attributes:

- `value` (string): committed canonical UTC string value
- `timezone` (string): IANA timezone; default browser timezone
- `locale` (string): default browser locale
- `week-start` (`sunday|monday`): locale/app default
- `mode` (`auto|datetime|date|range`): default `auto`
- `allow-past` (`true|false`): default `false`
- `autocomplete-ui` (`typing|always|off`): default `typing`
- `max-suggestions` (number): default `5`
- `desktop-tab-complete` (`true|false`): default `false`
- `accept-suggestion-key` (`arrow-right|tab|ctrl-enter`): default `arrow-right`
- `placeholder` (string)
- `name` (string)
- `disabled`, `required`

### 4.2 Properties

The element MUST expose:

- `rawInput: string` (read/write)
- `value: string | null` (read/write committed value)
- `valueKind: 'point' | 'range' | null` (readonly)
- `status: 'idle' | 'valid' | 'ambiguous' | 'invalid'` (readonly)
- `parseResult: ParseResult | null` (readonly)
- `candidates: Candidate[]` (readonly)
- `suggestions: CompletionSuggestion[]` (readonly)
- `activeSuggestionIndex: number` (readonly)

### 4.3 Methods

The element MUST implement:

- `focus(): void`
- `clear(): void`
- `confirm(): boolean`
- `acceptSuggestion(index?: number): boolean`
- `cycleSuggestion(direction: 1 | -1): void`
- `resolveAmbiguity(groupId: string, optionId: string): void`
- `setContext(context: Partial<ParseContext>): void`

### 4.4 Events

All custom events MUST bubble and be composed.

- `raw-input-change` -> `{ rawInput }`
- `parse-change` -> `{ status, parseResult }`
- `suggestions-change` -> `{ suggestions, activeSuggestionIndex }`
- `suggestion-accept` -> `{ suggestion, rawInput }`
- `ambiguity-change` -> `{ groups, unresolvedCount }`
- `value-commit` -> `{ value, valueKind, rawInput, candidate, timezone }` where `value` is UTC output (`ISO 8601` instant for points, `ISO 8601 interval` for ranges)
- `commit-blocked` -> `{ reason: 'ambiguous' | 'invalid' }`
- `clear` -> `{}`

## 5) Data Contracts

```ts
type ParseStatus = 'idle' | 'valid' | 'ambiguous' | 'invalid';

interface ParseContext {
  nowIso: string;
  timezone: string;
  locale: string;
  weekStart: 'sunday' | 'monday';
  productRules: {
    allowPast: boolean;
    defaultTime?: { hour: number; minute: number };
    timeOnlyPolicy: 'today_if_future_else_tomorrow' | 'always_require_date';
  };
}

interface Candidate {
  id: string;
  kind: 'point' | 'range';
  utcIso?: string;
  isoDate?: string;
  range?: {
    startUtcIso: string;
    endUtcIso: string;
    startDate: string;
    endDate: string;
  };
  label: string;
  confidence: number;
  source: 'rule' | 'fallback';
}

interface CompletionSuggestion {
  id: string;
  label: string;
  insertText: string;
  kind: 'completion' | 'candidate' | 'shortcut';
  confidence: number;
  candidateId?: string;
}

interface AmbiguityGroup {
  id: string;
  type: 'relative_weekday_scope' | 'week_start_convention' | 'time_only_anchor' | 'weekend_interpretation';
  message: string;
  required: boolean;
  options: { id: string; label: string; candidateId: string }[];
}

interface ParseResult {
  status: ParseStatus;
  rawInput: string;
  astType: string | null;
  valueKind: 'point' | 'range' | null;
  candidates: Candidate[];
  suggestions: CompletionSuggestion[];
  ambiguityGroups: AmbiguityGroup[];
  selectedCandidateId: string | null;
  previewLabel: string | null;
  canonicalValue: string | null; // UTC output; point=ISO 8601 instant, range=ISO 8601 interval (startUtcIso/endUtcIso)
  errors: string[];
}
```

## 6) Parsing + Resolution Pipeline

The implementation MUST process input in this order:

```ts
processInput(rawInput, context) => {
  const edit = detectEdit(prevRawInput, rawInput);
  const tokens = tokenizeIncremental(rawInput, edit);
  const ast = runFastPath(tokens, context) ?? buildAst(tokens);
  const resolution = resolveAst(ast, context);
  const suggestions = buildSuggestions(rawInput, tokens, resolution, context);
  return buildDisplayModel(rawInput, tokens, ast, resolution, suggestions);
}
```

Implementation modules SHOULD be separated as:

- `tokenize.ts`
- `grammar.ts`
- `parse.ts`
- `resolve.ts`
- `complete.ts`
- `rank.ts`
- `format.ts`
- `disambiguate.ts`

## 7) Grammar Coverage (MVP)

The parser MUST support at minimum:

- `today`, `tomorrow` (+ optional time)
- `next <weekday>` (+ optional time)
- `in <N> days|weeks|months`
- `<N> years|months|weeks|days|hours in the past`
- `end of week|month`
- numeric single-date formats (`M/D/YY`, `MM/DD/YY`, `M/DD/YYYY`, `MM/D/YYYY`)
- `<month> <day>` (+ optional time)
- `<month name> <day> <year>` with full or short month text (`march 1st 1986`, `mar 1 86`)
- single-letter month shorthand (`m 1 86`) using the month alias table below
- `<weekday> <time>`
- `3rd week of <month>`
- `<date> to <date>` and `<date> - <date>`
- `<anchor> + <duration>` and `<anchor> plus <duration>`
- `<holiday anchor> +/- <duration>` (for example `friday before christmas`, `labor day weekend + a week`)
- reverse windows (`last two weeks`)
- long exact single dates with year (`march 1st 1986`, `feb 18, 1988`)

The parser SHOULD implement pattern matching similar to:

```ts
const grammarPatterns = [
  { type: 'relative_day', match: ['relative:today|tomorrow', 'time?'] },
  { type: 'relative_weekday_datetime', match: ['modifier:next|this?', 'weekday', 'time?'] },
  { type: 'relative_duration_from_now', match: ['number', 'unit:day|week|month', 'keyword:from_now|in'] },
  { type: 'month_day_time', match: ['month', 'day_of_month', 'time?'] },
  { type: 'boundary_of_unit', match: ['boundary:start|end', 'keyword:of', 'unit:week|month'] },
  { type: 'ordinal_week_of_month', match: ['ordinal', 'unit:week', 'keyword:of', 'month'] },
  { type: 'weekday_time', match: ['weekday', 'time'] },
];
```

The implementation SHOULD also include challenge-focused fast-path patterns before generic grammar matching:

- `range_exact_date` (`<date> to|through|- <date>`)
- `numeric_exact_date` (`M/D/YY`, `MM/DD/YY`, `M/DD/YYYY`, `MM/D/YYYY`)
- `month_text_exact_date` (`march 1st 1986`, `mar 1 86`)
- `month_initial_exact_date` (`m 1 86`)
- `anchor_plus_duration_point` (`<anchor> + <duration>`) for point-date arithmetic
- `holiday_offset` (`<holiday phrase> +/- <duration>`)
- `lookback_window` (`last <N> <unit>`)
- `past_duration` (`<N> <unit> in the past`)

Date normalization rules (MUST):

- numeric slash format in MVP MUST be parsed as month/day/year (`M/D/Y`), not day/month/year
- numeric separators `/`, `-`, and `.` SHOULD be accepted for numeric dates
- ordinal day suffixes (`st`, `nd`, `rd`, `th`) MUST be accepted and ignored for normalization
- two-digit year parsing MUST use pivot `50` (`00-49 -> 2000-2049`, `50-99 -> 1950-1999`)
- month text aliases MUST include full and short names (`march`, `mar`)
- single-letter month aliases MUST map as: `j=jan`, `f=feb`, `m=mar`, `a=apr`, `s=sep`, `o=oct`, `n=nov`, `d=dec`

### 7.1 Range Intent Specification (MVP)

Range detection MUST execute before point-date grammar matching.

Range trigger patterns (priority order):

1. explicit delimiter range: `<date> to|through|until|- <date>`
2. lookback/lookahead window: `last|past <duration>`, `next <duration>`

When a range trigger is matched, parser output MUST set `valueKind` to `range` in `mode="auto"`.

Range operator semantics (MUST):

- `last <duration>` MUST produce `[now - duration, now]`
- `past <duration>` MUST produce `[now - duration, now]`
- explicit `<date> - <date>` MUST preserve user endpoint order and then normalize to ascending time order for canonical output

Range endpoint inference rules (MUST):

- if right endpoint omits year, infer from left endpoint year
- if right endpoint omits month, infer from left endpoint month
- if inferred end precedes start, resolver MUST roll end forward to the next valid calendar occurrence

Range output and display rules (MUST):

- preview MUST render both endpoints plus duration summary when derivable (for example `Mar 14 - Mar 28 (14 days)`)
- canonical range value MUST serialize as an ISO 8601 interval string: `startUtcIso/endUtcIso`
- top autocomplete suggestion for deterministic range phrases MUST be a full valid range accept action

Range interaction goal (SHOULD):

- deterministic range phrases SHOULD complete with one explicit accept interaction after typing

### 7.2 Date Arithmetic Specification (MVP)

Date arithmetic expressions MUST resolve to a point date, not a range.

Arithmetic trigger patterns:

- `<anchor> + <duration>`
- `<anchor> plus <duration>`

Date arithmetic semantics (MUST):

- `anchor + duration` MUST resolve to a point candidate at `anchor shifted by duration`
- if anchor resolves to a range, arithmetic MUST use the range end as the anchor point
- arithmetic output MUST set `valueKind` to `point` in `mode="auto"`

## 8) Autocomplete + Tab Completion Contract

Autocomplete UI behavior:

- suggestion actions MUST be visible while typing if `autocomplete-ui` is `typing` or `always`
- suggestion actions MUST include 1..`max-suggestions` entries
- active suggestion SHOULD render as ghost text on desktop
- for deterministic phrases, top suggestion MUST represent a full completion that can be accepted in one action

Suggestion ranking precedence MUST be:

1. parser-backed candidate completions
2. high-confidence grammar completions
3. static shortcut completions

Desktop keyboard behavior:

- `ArrowRight` MUST accept active suggestion when the caret is at the end of the input and `accept-suggestion-key` supports `arrow-right`
- `Tab` MUST follow native focus navigation by default
- `Tab` MAY accept active suggestion only when `desktop-tab-complete` is true and `accept-suggestion-key` supports `tab`
- `ArrowDown` / `ArrowUp` SHOULD cycle suggestions
- `Ctrl+Enter` SHOULD accept active suggestion and commit when resolvable if `accept-suggestion-key` supports `ctrl-enter`
- `Enter` MUST commit canonical value only when resolvable
- `Escape` MUST clear transient suggestion/parse UI and MUST NOT clear `rawInput`

If no suggestion is active, `Tab` MUST always follow normal focus navigation.

## 9) Ambiguity Model

The system MUST explicitly support ambiguity for:

- `next friday` (upcoming vs following)
- `this weekend` (point vs range interpretation)
- `3rd week of june` (week-start convention)
- `2pm` (time-only anchor)

The system MUST:

- surface ambiguity via chips/options
- keep required ambiguities unresolved until user selects
- block canonical commit while required ambiguity remains unresolved

## 10) Confidence + Commit Policy

- confidence `>= 0.85` with no unresolved required ambiguity -> `valid`
- confidence `0.60-0.84` or unresolved required ambiguity -> `ambiguous`
- confidence `< 0.60` -> `invalid`

Commit rules:

- `Enter` MUST commit top candidate only in `valid`
- `Tab` MUST preserve focus behavior by default; when tab completion is opt-in enabled and used, suggestion acceptance MUST happen before commit logic
- `blur` MUST NOT silently commit ambiguous/invalid parses
- unresolved/invalid commit attempt MUST emit `commit-blocked`

## 11) State Machine

States:

- `idle`
- `typing`
- `suggesting`
- `ambiguous_unresolved`
- `valid_unconfirmed`
- `confirmed`
- `invalid`

Required transitions:

- `INPUT_CHANGED` -> parse/resolve/suggest
- suggestions present -> `suggesting`
- unresolved ambiguity -> `ambiguous_unresolved`
- `SUGGESTION_ACCEPTED` -> re-parse and return to `typing` or `suggesting`
- `CHIP_SELECTED` resolving required groups -> `valid_unconfirmed`
- `ENTER` in `valid_unconfirmed` -> `confirmed` + `value-commit`

## 12) Rendering and Styling Contract

The component MUST use Shadow DOM.

The component MUST expose these parts:

- `part="input"`
- `part="ghost"`
- `part="autocomplete-row"`
- `part="autocomplete-button"`
- `part="preview"`
- `part="ambiguity-list"`
- `part="chip"`
- `part="chip-selected"`
- `part="status"`

The component SHOULD keep default styling minimal and neutral.

## 13) Form-Associated Behavior

`hot-date` MUST be a form-associated custom element.

- if `name` is set and state is committed, form value MUST be canonical value
- if `required` and unresolved/invalid, component MUST set custom validity
- for point outputs (`mode="auto"|"date"|"datetime"` with `valueKind="point"`), value MUST be an ISO 8601 UTC string with `Z` suffix
- in `mode="date"`, point value MUST represent local start-of-day in locked timezone converted to UTC string
- in `mode="datetime"`, point value MUST represent the resolved local datetime converted to UTC string
- in `mode="range"` or when `valueKind` is `range`, value MUST be an ISO 8601 interval string serialized as `startUtcIso/endUtcIso`

Timezone and persistence policy:

- if `timezone` is not set, the component MUST use the user's current local browser timezone
- timezone context MUST be treated as locked for the active component session
- in `mode="datetime"`, resolver and formatting SHOULD honor DST transitions for that locked timezone
- canonical committed output MUST always be UTC string form regardless of locked timezone
- the component MUST NOT persist raw input, phrase history, timezone, or suggestion selections to local storage, IndexedDB, cookies, or remote services by default

## 14) Accessibility Requirements

The component MUST:

- support standard label association for the text input
- expose preview updates via `aria-live="polite"`
- render autocomplete actions as keyboard-accessible buttons
- render ambiguity chips as keyboard-accessible toggle buttons (`aria-pressed`)
- support full keyboard-only flow for type -> complete -> resolve -> commit

The component SHOULD maintain mobile-friendly touch targets.

## 15) Performance Requirements (Release-Critical)

Performance is release-blocking.

Desktop hard budgets:

- parse + resolve + rank: p50 <= 1.5ms, p95 <= 4ms
- keystroke to painted autocomplete update: p50 <= 8ms, p95 <= 16ms
- suggestion accept (`ArrowRight`/`Tab`/`Ctrl+Enter`) to updated preview: p50 <= 6ms
- long tasks > 50ms during normal typing: MUST be 0 in benchmark scenarios

Challenge phrase budgets (for input lengths up to 64 characters):

- complex relative phrases (`next monday in march plus 2 weeks`) parse + resolve p95 <= 6ms
- holiday anchor phrases (`friday before christmas`) parse + resolve p95 <= 6ms
- exact range phrases (`feb 18, 1988 - feb 29, 2024`) parse + resolve p95 <= 7ms
- exact short date phrases (`3/1/86`, `03/01/86`, `3/01/1986`) parse + resolve p95 <= 3ms

Engineering constraints (MUST):

- incremental tokenization by edit span
- fast-path parser before full grammar pass
- precompiled dictionary/trie lookup in hot path
- cached `Intl.DateTimeFormat` formatters
- LRU parse cache keyed by normalized input + context bucket
- minimal allocations in hot loop
- targeted DOM updates for changed regions only
- CI benchmark regression gates

### 15.1 WASM Acceleration Policy

WASM MAY be used for parser hot paths (tokenization, grammar matching, range resolution) if and only if it improves benchmark metrics versus the JavaScript baseline.

Adoption guardrails (MUST):

- WASM integration MUST remain behind a stable parser engine interface (`ParserEngine`)
- WASM implementation MUST beat JS baseline by at least one release metric (latency or allocation) without regressing others
- boundary crossing between JS and WASM MUST be minimized (single input buffer in, compact result out)
- DOM, event dispatch, and form behavior MUST remain in JavaScript
- fallback JS parser MUST ship and remain test-equivalent

Practical guidance (SHOULD):

- use JS as the semantic reference implementation, then maintain a Zig/WASM hot-path implementation in parallel for benchmark comparison
- avoid moving tiny per-keystroke UI logic into WASM
- treat toolchain complexity (build/debug/sourcemaps) as a measurable maintenance cost

### 15.2 Dual-Engine Development + Benchmark Workflow

The project SHOULD run a dual-engine strategy during performance development:

- Engine A: JavaScript reference parser
- Engine B: Zig/WASM accelerated parser

Shared constraints (MUST):

- both engines MUST implement the same `ParserEngine` contract and output-identical parse/result structures
- both engines MUST pass the same fixture suite (including challenge phrases and ambiguity cases)
- JS engine MUST remain production-safe fallback at all times

Benchmark workflow (MUST):

- after each grammar milestone, run A/B benchmarks for JS and WASM on the same machine profile
- compare warm typing latency, suggestion accept latency, memory allocations, and startup/init overhead
- record benchmark snapshots in CI artifacts for regression tracking

WASM promotion criteria in `auto` mode (MUST):

- WASM p95 parse+resolve latency improves by at least 15% over JS baseline
- WASM does not regress keystroke-to-paint p95 budget
- WASM init overhead stays within the first-interaction budget (no blocking keystroke path)
- fixture parity remains 100%

If any promotion criterion fails, runtime engine selection SHOULD default to JS.

## 16) Interaction Efficiency Requirements (Release-Critical)

Interaction count is a release gate.

`hot-date` MUST require fewer explicit user interactions than a default desktop calendar picker for every supported MVP intent.

Measurement rules:

- count each click, key accept, and disambiguation selection as one interaction
- typing characters is excluded from the interaction count baseline
- compare task-by-task against a reference native calendar flow in the same environment

Required task suite (MVP):

- `march 14 to march 28`
- `next monday in march plus 2 weeks`
- `today + 9 days`
- `friday before christmas`
- `labor day weekend + a week`
- `feb 18, 1988 - feb 29, 2024`
- `march 1st 1986`
- `3/1/86`
- `03/01/86`
- `3/01/1986`
- `mar 1 86`
- `m 1 86`
- `the last two weeks`
- `5 years in the past`
- `1 hour from now`

Pass criteria:

- each task MUST beat the reference calendar interaction count
- ambiguous tasks MAY use one extra disambiguation interaction, but total MUST still be lower than calendar baseline
- deterministic tasks SHOULD resolve with one accept action after typing

## 17) Testing + Benchmark Requirements

Unit tests MUST cover:

- tokenizer (including incremental edits)
- grammar matching and AST creation
- resolver date math
- suggestion ranking
- ambiguity grouping and resolution mapping
- holiday anchor resolution
- long exact date parsing with year
- numeric short date variations (`3/1/86`, `03/01/86`, `3/01/1986`)
- month text and shorthand date variations (`march 1st 1986`, `mar 1 86`, `m 1 86`)
- UTC output normalization for point/date/datetime modes
- range candidate serialization as ISO 8601 interval (`startUtcIso/endUtcIso`)

Component tests MUST cover:

- visible autocomplete while typing
- Tab suggestion acceptance when opt-in mode is enabled
- suggestion cycling via keyboard
- ambiguity blocking behavior
- commit events and form submission

Benchmark tests MUST include:

- parser microbench throughput
- keystroke-to-paint integration benchmark
- allocation profile across long typing sessions
- desktop browser matrix; mobile sanity matrix
- interaction-count benchmark versus reference calendar for required task suite
- challenge phrase latency benchmark using the exact task suite in section 16

## 18) Acceptance Gates (MVP)

Release is blocked unless all gates pass:

- element ships as `<hot-date>` with stable API and events
- autocomplete buttons appear and update in real time while typing
- desktop suggestion acceptance behaves like code-assistant completion (`ArrowRight` default, `Tab` opt-in)
- ambiguous phrases never silently commit
- canonical value only emits on resolvable commit path
- section 15 performance budgets pass in CI
- section 16 interaction-efficiency gates pass in CI
- full section 16 challenge task suite passes parse accuracy and latency gates

## 19) Known Risks and Mitigations

- Risk: `Tab` completion can conflict with expected focus movement.
  - Mitigation: preserve native `Tab` by default and allow `Tab` completion only in explicit opt-in mode.
- Risk: strict performance budgets can regress as grammar expands.
  - Mitigation: benchmark gates and feature-flagged grammar additions.
- Risk: ambiguity-heavy phrases can feel noisy.
  - Mitigation: rank and collapse options; show most likely option first without auto-committing.
- Risk: timezone and DST bugs can degrade trust quickly.
  - Mitigation: fixture-driven date math tests across DST and month boundaries.
- Risk: deterministic single-letter month aliases (for example `m=mar`) can misread user intent.
  - Mitigation: keep aliases narrow, surface quick correction suggestions, and allow full-text month override without friction.
- Risk: JS and Zig/WASM parser behavior can drift over time.
  - Mitigation: shared contract, parity fixtures in CI, and automatic fallback to JS when parity or promotion checks fail.

## 20) Open Workshop Decisions

- default ranking for `next friday` (upcoming vs following)
- default time-only policy (`today_if_future_else_tomorrow` vs strict date required)
- whether `this weekend` resolves as point or range in MVP
- default `max-suggestions` value (3, 4, or 5)
- final desktop suggestion accept key default (`arrow-right` only vs `arrow-right` + opt-in `tab`)
- fixed holiday lexicon for MVP (`christmas`, `new years`, `labor day`) and explicit rule definitions
