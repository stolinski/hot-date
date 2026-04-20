# @stolinski/hot-date

## Install

```bash
npm install @stolinski/hot-date
```

## Usage

```js
import "@stolinski/hot-date";
```

```html
<hot-date name="due"></hot-date>
```

The element emits a canonical date string as its `value`:

- Single date: `YYYY-MM-DD` (e.g. `2026-11-10`)
- Range: `YYYY-MM-DD/YYYY-MM-DD` (e.g. `2026-11-10/2026-11-24`)

`value` is form-associated — the element participates in `<form>` submission and validation via `ElementInternals`.

## Attributes

| Attribute | Description |
| --- | --- |
| `value` | Committed canonical value. Reflected. |
| `placeholder` | Input placeholder. |
| `timezone` | IANA timezone. Defaults to the runtime system timezone. |
| `locale` | BCP-47 locale. Defaults to `navigator.language`. |
| `week-start` | `sunday` (default) or `monday`. |
| `allow-past` | Boolean attribute permitting past dates. |
| `disabled` | Boolean attribute. |
| `required` | Boolean attribute. Participates in form validation. |
| `name` | Form field name. |

## Properties

| Property | Type | Notes |
| --- | --- | --- |
| `value` | `string \| null` | Canonical committed value. |
| `rawInput` | `string` | Current raw input string. |
| `status` | `"idle" \| "valid" \| "ambiguous" \| "invalid"` | Current parse status. |
| `valueKind` | `"point" \| "range" \| null` | |
| `parseResult` | `ParseResult` | Full parse state object. |
| `candidates` | `Candidate[]` | |
| `suggestions` | `CompletionSuggestion[]` | |
| `activeSuggestionIndex` | `number` | |

## Methods

| Method | Description |
| --- | --- |
| `focus()` | Focus the input. |
| `clear()` | Clear input and value. |
| `confirm(): boolean` | Explicitly commit. Returns `true` on success. |
| `acceptSuggestion(index?)` | Accept the active (or indexed) suggestion. |
| `cycleSuggestion(direction: 1 \| -1)` | Cycle the active suggestion. |
| `resolveAmbiguity(groupId, optionId)` | Resolve an ambiguity group. |
| `setContext(partial)` | Update `timezone` / `locale` / `weekStart` / `allowPast`. |

## Events

All events are `CustomEvent`s and bubble through the host.

| Event | Detail |
| --- | --- |
| `value-change` | `{ value, valueKind, rawInput, candidate }` — fires whenever `value` updates. |
| `value-commit` | `{ value, valueKind, rawInput, candidate, timezone }` — fires on explicit commit (Enter). |
| `commit-blocked` | `{ reason: "ambiguous" \| "invalid" }` |
| `parse-change` | `{ status, parseResult }` |
| `suggestions-change` | `{ suggestions, activeSuggestionIndex }` |
| `ambiguity-change` | `{ groups, unresolvedCount }` |
| `raw-input-change` | `{ rawInput }` |
| `suggestion-accept` | `{ suggestion, rawInput }` |
| `clear` | `{}` |

## Styling

The shadow DOM exposes these CSS shadow parts:

| Part | Element |
| --- | --- |
| `field` | Wrapper. |
| `input` | The `<input>`. |
| `ghost` | Suggestion overlay. |
| `hint` | `Tab` hint chip. |

```css
hot-date::part(input) {
  /* … */
}
```

Ambiguity buttons render in **light DOM** inside a `<div slot="ambiguity">` child of the host, so outer `button { … }` rules cascade naturally without `::part()`.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Accept the active completion. |
| `Enter` | Commit. |
| `ArrowDown` / `ArrowUp` | Cycle suggestions. |
| `Escape` | Reset active suggestion. |

## License

MIT
