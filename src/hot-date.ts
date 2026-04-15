import { JsParserEngine } from "./lib/parser/js-parser-engine";
import type {
  Candidate,
  CompletionSuggestion,
  ParseContext,
  ParseResult,
  ParseStatus,
  ValueKind,
} from "./lib/parser/parser-types";

const TEMPLATE = document.createElement("template");
TEMPLATE.innerHTML = `
  <div class="root" part="root">
    <div class="field" part="field">
      <input part="input" type="text" autocomplete="off" />
    </div>
    <div class="ghost" part="ghost" aria-live="polite"></div>
    <div class="row" part="autocomplete-row"></div>
    <div class="row" part="ambiguity-list" hidden></div>
    <div class="preview" part="preview" aria-live="polite"></div>
  </div>
`;

type AcceptKeyMode = "arrow-right" | "tab" | "ctrl-enter";

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
      "autocomplete-ui",
      "max-suggestions",
      "desktop-tab-complete",
      "accept-suggestion-key",
      "placeholder",
      "name",
      "disabled",
      "required",
    ];
  }

  private readonly parser = new JsParserEngine();
  private readonly internals: ElementInternals | null;
  private readonly inputElement: HTMLInputElement;
  private readonly ghostElement: HTMLDivElement;
  private readonly suggestionsElement: HTMLDivElement;
  private readonly ambiguityElement: HTMLDivElement;
  private readonly previewElement: HTMLDivElement;

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
    this.ghostElement = root.querySelector(".ghost") ?? document.createElement("div");
    this.suggestionsElement = root.querySelector<HTMLDivElement>("[part='autocomplete-row']") ?? document.createElement("div");
    this.ambiguityElement = root.querySelector<HTMLDivElement>("[part='ambiguity-list']") ?? document.createElement("div");
    this.previewElement = root.querySelector(".preview") ?? document.createElement("div");

    this.internals = typeof this.attachInternals === "function" ? this.attachInternals() : null;

    this.bindEvents();
  }

  public connectedCallback(): void {
    this.syncInputPresentation();
    this.parseAndRender();
  }

  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) {
      return;
    }

    if (name === "placeholder") {
      this.inputElement.placeholder = newValue ?? "";
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
      this.emit("commit-blocked", { reason: this.parseState.status === "ambiguous" ? "ambiguous" : "invalid" });
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
    this.renderSuggestions();
    this.renderGhostHint();
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

      if (event.key === "ArrowRight" && this.getAcceptKeyMode() === "arrow-right" && this.isCaretAtInputEnd()) {
        if (this.acceptSuggestion()) {
          event.preventDefault();
        }
        return;
      }

      if (
        event.key === "Tab" &&
        this.hasAttribute("desktop-tab-complete") &&
        this.getAcceptKeyMode() === "tab" &&
        this.parseState.suggestions.length > 0
      ) {
        if (this.acceptSuggestion()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Enter" && event.ctrlKey && this.getAcceptKeyMode() === "ctrl-enter") {
        event.preventDefault();
        this.acceptSuggestion();
        this.confirm();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        this.confirm();
        return;
      }

      if (event.key === "Escape") {
        this.activeSuggestionIndexValue = 0;
        this.renderGhostHint();
      }
    });
  }

  private parseAndRender(): void {
    this.parseState = this.parser.parse(this.rawInputValue, this.buildContext());

    if (this.activeSuggestionIndexValue >= this.parseState.suggestions.length) {
      this.activeSuggestionIndexValue = this.parseState.suggestions.length ? 0 : -1;
    }

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
    this.renderGhostHint();
    this.renderSuggestions();
    this.renderAmbiguityChips();
    this.renderPreview();
  }

  private renderSuggestions(): void {
    this.suggestionsElement.replaceChildren();

    if (!this.parseState.suggestions.length || this.getAttribute("autocomplete-ui") === "off") {
      this.suggestionsElement.hidden = true;
      return;
    }

    this.suggestionsElement.hidden = false;

    this.parseState.suggestions.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("part", "autocomplete-button");
      button.className = "action";
      button.dataset.active = String(index === this.activeSuggestionIndexValue);
      button.textContent = suggestion.label;
      button.addEventListener("click", () => {
        this.activeSuggestionIndexValue = index;
        this.acceptSuggestion(index);
      });
      this.suggestionsElement.append(button);
    });
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
        button.setAttribute("part", "chip");
        button.className = "action";
        button.textContent = option.label;
        button.addEventListener("click", () => {
          this.resolveAmbiguity(group.id, option.id);
        });
        this.ambiguityElement.append(button);
      });
    });
  }

  private renderPreview(): void {
    if (this.parseState.status === "invalid" && this.rawInputValue) {
      this.previewElement.textContent = "Could not parse this phrase yet.";
      return;
    }

    this.previewElement.textContent = this.parseState.previewLabel ?? "";
  }

  private renderGhostHint(): void {
    const suggestion = this.parseState.suggestions[this.activeSuggestionIndexValue];
    const normalizedInput = this.rawInputValue.trim().toLowerCase();

    if (!suggestion || !normalizedInput || !suggestion.insertText.startsWith(normalizedInput)) {
      this.ghostElement.textContent = "";
      return;
    }

    const tail = suggestion.insertText.slice(normalizedInput.length).trimStart();

    if (!tail) {
      this.ghostElement.textContent = "";
      return;
    }

    const acceptHint = this.getAcceptKeyMode() === "arrow-right" ? "ArrowRight" : this.getAcceptKeyMode() === "tab" ? "Tab" : "Ctrl+Enter";
    this.ghostElement.textContent = `${tail}  (${acceptHint} to accept)`;
  }

  private syncInputPresentation(): void {
    if (this.inputElement.value !== this.rawInputValue) {
      this.inputElement.value = this.rawInputValue;
    }

    this.inputElement.placeholder = this.getAttribute("placeholder") ?? "Try: march 14 to march 28";
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
      timezone: this.getAttribute("timezone") ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
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

    return this.parseState.candidates.find((candidate) => candidate.id === this.parseState.selectedCandidateId) ?? null;
  }

  private getCanonicalValue(candidate: Candidate | null): string | null {
    if (!candidate) {
      return null;
    }

    if (candidate.kind === "point") {
      return candidate.utcIso ?? null;
    }

    if (!candidate.range) {
      return null;
    }

    return `${candidate.range.startUtcIso}/${candidate.range.endUtcIso}`;
  }

  private getAcceptKeyMode(): AcceptKeyMode {
    const mode = this.getAttribute("accept-suggestion-key");

    if (mode === "tab" || mode === "ctrl-enter") {
      return mode;
    }

    return "arrow-right";
  }

  private isCaretAtInputEnd(): boolean {
    const caret = this.inputElement.selectionStart;
    return caret === this.inputElement.value.length;
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
