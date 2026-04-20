import { JsParserEngine } from "./lib/parser/js-parser-engine";
import { normalizeInput } from "./lib/utils/string-utils";
import type {
  Candidate,
  CompletionSuggestion,
  ParseContext,
  ParseResult,
  ParseStatus,
  ValueKind,
} from "./lib/parser/parser-types";

const DEFAULT_PLACEHOLDER = "type anything...";

const TEMPLATE = document.createElement("template");
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: inline-block;
      font: inherit;
      color: inherit;
			box-shadow: 0 2px 4px rgb(0 0 0 / .05), 0 4px 8px rgb(0 0 0 / .1);
			border-radius: 20px;
			padding: 5px;
			background: #eeeeee7d;
	}

		.field {
			position: relative;
			display: block;
			font-size: 1rem;
			background: #ffffff;
			border: 1px solid #e4e4e7;
			border-radius: 0.9rem;
			padding: 1rem;
		}
    .input {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 0;
      outline: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      min-width: 20ch;
			box-sizing: border-box;
    }
    .ghost {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
			padding: 1rem;
      justify-content: space-between;
      gap: 1rem;
      pointer-events: none;
      font: inherit;
      white-space: pre;
      overflow: hidden;
    }
    .ghost-completion {
      min-width: 0;
      overflow: hidden;
      white-space: pre;
    }
    .ghost-typed {
      color: transparent;
    }
    .ghost-tail {
      opacity: 0.5;
    }
    .ghost-hint {
      margin-left: 0.5em;
      padding: 0.05em 0.35em;
      border: 1px solid currentColor;
      border-radius: 3px;
      font-size: 0.7em;
      font-family: inherit;
      opacity: 0.4;
      vertical-align: middle;
    }
    .ghost-hint[hidden] {
      display: none;
    }
    .ghost-resolution {
      flex: 0 0 auto;
      opacity: 0.5;
    }
    ::slotted([slot="ambiguity"]) {
      margin-top: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    ::slotted([slot="ambiguity"][hidden]) {
      display: none;
    }
		p {
		line-height: 1.7;
		padding: 0 10px 5px;
		margin-bottom: 0;
		font-size: 14px;
		font-style: italic;
	}
  </style>
  <div class="field" part="field">
    <input class="input" part="input" type="text" autocomplete="off" spellcheck="false" />
    <div class="ghost" part="ghost" aria-live="polite"><span class="ghost-completion"><span class="ghost-typed" aria-hidden="true"></span><span class="ghost-tail"></span><kbd class="ghost-hint" part="hint" hidden>Tab</kbd></span><span class="ghost-resolution"></span></div>
  </div>
	<p>Examples: march 14 to 28 · tomorrow · 3/1/86 · 9 days after christmas until new years<br />Hit <kbd class="ghost-hint">Tab</kbd> to autocomplete.</p>
  <slot name="ambiguity"></slot>
`;

export class HotDateElement extends HTMLElement {
  public static formAssociated = true;

  public static get observedAttributes(): string[] {
    return [
      "value",
      "timezone",
      "locale",
      "week-start",
      "mode",
      "allow-past",
      "placeholder",
      "name",
      "disabled",
      "required",
    ];
  }

  private readonly parser = new JsParserEngine();
  private readonly internals: ElementInternals | null;
  private readonly inputElement: HTMLInputElement;
  private readonly ghostTypedElement: HTMLSpanElement;
  private readonly ghostTailElement: HTMLSpanElement;
  private readonly ghostHintElement: HTMLElement;
  private readonly ghostResolutionElement: HTMLSpanElement;
  private readonly ambiguityElement: HTMLDivElement;

  private rawInputValue = "";
  private committedValue: string | null = null;
  private parseState: ParseResult = this.createEmptyParseState();
  private activeSuggestionIndexValue = 0;

  public constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot?.append(TEMPLATE.content.cloneNode(true));

    const root = this.shadowRoot;

    if (!root) {
      throw new Error("Unable to create shadow root.");
    }

    this.inputElement = root.querySelector("input") ?? document.createElement("input");
    this.ghostTypedElement =
      root.querySelector<HTMLSpanElement>(".ghost-typed") ?? document.createElement("span");
    this.ghostTailElement =
      root.querySelector<HTMLSpanElement>(".ghost-tail") ?? document.createElement("span");
    this.ghostHintElement =
      root.querySelector<HTMLElement>(".ghost-hint") ?? document.createElement("kbd");
    this.ghostResolutionElement =
      root.querySelector<HTMLSpanElement>(".ghost-resolution") ?? document.createElement("span");
    this.ambiguityElement = document.createElement("div");
    this.ambiguityElement.setAttribute("slot", "ambiguity");
    this.ambiguityElement.hidden = true;

    this.internals = typeof this.attachInternals === "function" ? this.attachInternals() : null;

    this.bindEvents();
  }

  public connectedCallback(): void {
    if (this.ambiguityElement.parentNode !== this) {
      this.append(this.ambiguityElement);
    }
    this.syncInputPresentation();
    this.parseAndRender();
  }

  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) {
      return;
    }

    if (name === "placeholder") {
      this.inputElement.placeholder = newValue ?? DEFAULT_PLACEHOLDER;
      return;
    }

    if (name === "value") {
      this.committedValue = newValue;
      this.internals?.setFormValue(newValue ?? "");
      return;
    }

    if (name === "disabled") {
      this.inputElement.disabled = this.hasAttribute("disabled");
      return;
    }

    this.parseAndRender();
  }

  public get rawInput(): string {
    return this.rawInputValue;
  }

  public set rawInput(nextValue: string) {
    this.rawInputValue = nextValue;
    this.syncInputPresentation();
    this.parseAndRender();
    this.emit("raw-input-change", { rawInput: this.rawInputValue });
  }

  public get value(): string | null {
    return this.committedValue;
  }

  public set value(nextValue: string | null) {
    this.committedValue = nextValue;

    if (nextValue === null) {
      this.removeAttribute("value");
      this.internals?.setFormValue("");
      return;
    }

    this.setAttribute("value", nextValue);
    this.internals?.setFormValue(nextValue);
  }

  public get valueKind(): ValueKind {
    return this.parseState.valueKind;
  }

  public get status(): ParseStatus {
    return this.parseState.status;
  }

  public get parseResult(): ParseResult {
    return this.parseState;
  }

  public get candidates(): Candidate[] {
    return this.parseState.candidates;
  }

  public get suggestions(): CompletionSuggestion[] {
    return this.parseState.suggestions;
  }

  public get activeSuggestionIndex(): number {
    return this.activeSuggestionIndexValue;
  }

  public focus(): void {
    this.inputElement.focus();
  }

  public clear(): void {
    this.rawInputValue = "";
    this.committedValue = null;
    this.removeAttribute("value");
    this.internals?.setFormValue("");
    this.activeSuggestionIndexValue = 0;
    this.syncInputPresentation();
    this.parseAndRender();
    this.emit("clear", {});
  }

  public confirm(): boolean {
    if (this.parseState.status !== "valid") {
      this.emit("commit-blocked", {
        reason: this.parseState.status === "ambiguous" ? "ambiguous" : "invalid",
      });
      return false;
    }

    const candidate = this.getSelectedCandidate();
    const canonicalValue = this.getCanonicalValue(candidate);

    if (!canonicalValue || !candidate) {
      this.emit("commit-blocked", { reason: "invalid" });
      return false;
    }

    this.committedValue = canonicalValue;
    this.setAttribute("value", canonicalValue);
    this.internals?.setFormValue(canonicalValue);
    this.internals?.setValidity({});

    this.emit("value-commit", {
      value: canonicalValue,
      valueKind: candidate.kind,
      rawInput: this.rawInputValue,
      candidate,
      timezone: this.buildContext().timezone,
    });

    return true;
  }

  public acceptSuggestion(index = this.activeSuggestionIndexValue): boolean {
    const suggestion = this.parseState.suggestions[index];

    if (!suggestion) {
      return false;
    }

    if (suggestion.insertText === normalizeInput(this.rawInputValue)) {
      return false;
    }

    this.rawInputValue = suggestion.insertText;
    this.activeSuggestionIndexValue = index;
    this.syncInputPresentation();
    this.emit("suggestion-accept", {
      suggestion,
      rawInput: this.rawInputValue,
    });
    this.emit("raw-input-change", { rawInput: this.rawInputValue });
    this.parseAndRender();

    return true;
  }

  public cycleSuggestion(direction: 1 | -1): void {
    if (!this.parseState.suggestions.length) {
      return;
    }

    const total = this.parseState.suggestions.length;
    this.activeSuggestionIndexValue = (this.activeSuggestionIndexValue + direction + total) % total;
    this.renderGhost();
    this.emit("suggestions-change", {
      suggestions: this.parseState.suggestions,
      activeSuggestionIndex: this.activeSuggestionIndexValue,
    });
  }

  public resolveAmbiguity(groupId: string, optionId: string): void {
    const group = this.parseState.ambiguityGroups.find((item) => item.id === groupId);
    const option = group?.options.find((item) => item.id === optionId);

    if (!group || !option) {
      return;
    }

    const candidate = this.parseState.candidates.find((item) => item.id === option.candidateId);

    if (!candidate) {
      return;
    }

    this.parseState = {
      ...this.parseState,
      status: "valid",
      selectedCandidateId: candidate.id,
      ambiguityGroups: [],
      previewLabel: candidate.label,
      canonicalValue: this.getCanonicalValue(candidate),
    };

    this.syncLiveValue();
    this.renderAll();

    this.emit("ambiguity-change", {
      groups: this.parseState.ambiguityGroups,
      unresolvedCount: this.parseState.ambiguityGroups.length,
    });
    this.emit("parse-change", {
      status: this.parseState.status,
      parseResult: this.parseState,
    });
  }

  public setContext(context: Partial<ParseContext>): void {
    if (context.timezone) {
      this.setAttribute("timezone", context.timezone);
    }

    if (context.locale) {
      this.setAttribute("locale", context.locale);
    }

    if (context.weekStart) {
      this.setAttribute("week-start", context.weekStart);
    }

    if (typeof context.productRules?.allowPast === "boolean") {
      this.toggleAttribute("allow-past", context.productRules.allowPast);
    }

    this.parseAndRender();
  }

  private bindEvents(): void {
    this.inputElement.addEventListener("input", () => {
      this.rawInputValue = this.inputElement.value;
      this.emit("raw-input-change", { rawInput: this.rawInputValue });
      this.parseAndRender();
    });

    this.inputElement.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.cycleSuggestion(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.cycleSuggestion(-1);
        return;
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        this.isCaretAtInputEnd() &&
        this.hasCompletionTail()
      ) {
        if (this.acceptSuggestion()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        this.confirm();
        return;
      }

      if (event.key === "Escape") {
        this.activeSuggestionIndexValue = 0;
        this.renderGhost();
      }
    });
  }

  private parseAndRender(): void {
    this.parseState = this.parser.parse(this.rawInputValue, this.buildContext());
    this.activeSuggestionIndexValue = 0;

    this.syncLiveValue();
    this.renderAll();

    this.emit("parse-change", {
      status: this.parseState.status,
      parseResult: this.parseState,
    });

    this.emit("suggestions-change", {
      suggestions: this.parseState.suggestions,
      activeSuggestionIndex: this.activeSuggestionIndexValue,
    });

    this.emit("ambiguity-change", {
      groups: this.parseState.ambiguityGroups,
      unresolvedCount: this.parseState.ambiguityGroups.length,
    });

    this.syncValidity();
  }

  private renderAll(): void {
    this.renderGhost();
    this.renderAmbiguityChips();
  }

  private renderGhost(): void {
    this.ghostTypedElement.textContent = this.rawInputValue;
    const tail = this.computeCompletionTail();
    this.ghostTailElement.textContent = tail;
    this.ghostHintElement.hidden = tail.length === 0;
    this.ghostResolutionElement.textContent =
      this.parseState.status === "valid" ? (this.parseState.previewLabel ?? "") : "";
  }

  private computeCompletionTail(): string {
    const normalized = normalizeInput(this.rawInputValue);
    const suggestion = this.parseState.suggestions[this.activeSuggestionIndexValue];

    if (!suggestion || !normalized) {
      return "";
    }

    if (!suggestion.insertText.startsWith(normalized) || suggestion.insertText === normalized) {
      return "";
    }

    return suggestion.insertText.slice(normalized.length);
  }

  private hasCompletionTail(): boolean {
    return this.computeCompletionTail().length > 0;
  }

  private renderAmbiguityChips(): void {
    this.ambiguityElement.replaceChildren();

    if (!this.parseState.ambiguityGroups.length) {
      this.ambiguityElement.hidden = true;
      return;
    }

    this.ambiguityElement.hidden = false;

    this.parseState.ambiguityGroups.forEach((group) => {
      group.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label;
        button.addEventListener("click", () => {
          this.resolveAmbiguity(group.id, option.id);
        });
        this.ambiguityElement.append(button);
      });
    });
  }

  private syncInputPresentation(): void {
    if (this.inputElement.value !== this.rawInputValue) {
      this.inputElement.value = this.rawInputValue;
    }

    this.inputElement.placeholder = this.getAttribute("placeholder") ?? DEFAULT_PLACEHOLDER;
    this.inputElement.disabled = this.hasAttribute("disabled");
  }

  private createEmptyParseState(): ParseResult {
    return {
      status: "idle",
      rawInput: "",
      astType: null,
      valueKind: null,
      candidates: [],
      suggestions: [],
      ambiguityGroups: [],
      selectedCandidateId: null,
      previewLabel: null,
      canonicalValue: null,
      errors: [],
    };
  }

  private buildContext(): ParseContext {
    return {
      nowIso: new Date().toISOString(),
      timezone:
        this.getAttribute("timezone") ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      locale: this.getAttribute("locale") ?? navigator.language ?? "en-US",
      weekStart: this.getAttribute("week-start") === "monday" ? "monday" : "sunday",
      productRules: {
        allowPast: this.hasAttribute("allow-past"),
        defaultTime: { hour: 9, minute: 0 },
        timeOnlyPolicy: "today_if_future_else_tomorrow",
      },
    };
  }

  private getSelectedCandidate(): Candidate | null {
    if (!this.parseState.candidates.length) {
      return null;
    }

    if (!this.parseState.selectedCandidateId) {
      return this.parseState.candidates[0] ?? null;
    }

    return (
      this.parseState.candidates.find(
        (candidate) => candidate.id === this.parseState.selectedCandidateId,
      ) ?? null
    );
  }

  private getCanonicalValue(candidate: Candidate | null): string | null {
    if (!candidate) {
      return null;
    }

    if (candidate.kind === "point") {
      return candidate.isoDate ?? null;
    }

    if (!candidate.range) {
      return null;
    }

    return `${candidate.range.startDate}/${candidate.range.endDate}`;
  }

  private isCaretAtInputEnd(): boolean {
    const caret = this.inputElement.selectionStart;
    return caret === this.inputElement.value.length;
  }

  private syncLiveValue(): void {
    const candidate = this.getSelectedCandidate();
    const canonicalValue =
      this.parseState.status === "valid" ? this.getCanonicalValue(candidate) : null;

    if (canonicalValue === this.committedValue) {
      return;
    }

    this.committedValue = canonicalValue;

    if (canonicalValue === null) {
      this.removeAttribute("value");
      this.internals?.setFormValue("");
    } else {
      this.setAttribute("value", canonicalValue);
      this.internals?.setFormValue(canonicalValue);
    }

    this.emit("value-change", {
      value: canonicalValue,
      valueKind: candidate?.kind ?? null,
      rawInput: this.rawInputValue,
      candidate,
    });
  }

  private syncValidity(): void {
    if (!this.internals) {
      return;
    }

    if (this.hasAttribute("required") && this.parseState.status !== "valid") {
      this.internals.setValidity(
        {
          customError: true,
        },
        "Please enter a valid date phrase.",
        this.inputElement,
      );
      return;
    }

    this.internals.setValidity({});
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }
}

if (!customElements.get("hot-date")) {
  customElements.define("hot-date", HotDateElement);
}
