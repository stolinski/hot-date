import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HotDateElement } from "../src/hot-date";

process.env.TZ = "UTC";

// JSDOM 25 exposes ElementInternals with ARIA reflection only.
// Stub the form-association methods so form-associated custom elements can run.
const ElementInternalsProto = globalThis.ElementInternals?.prototype as
  | (ElementInternals & { setFormValue?: unknown; setValidity?: unknown })
  | undefined;
if (ElementInternalsProto && typeof ElementInternalsProto.setFormValue !== "function") {
  ElementInternalsProto.setFormValue = function () {
    /* no-op polyfill for JSDOM */
  };
}
if (ElementInternalsProto && typeof ElementInternalsProto.setValidity !== "function") {
  ElementInternalsProto.setValidity = function () {
    /* no-op polyfill for JSDOM */
  };
}

await import("../src/hot-date");

function createElement(): HotDateElement {
  const element = document.createElement("hot-date") as HotDateElement;
  element.setAttribute("timezone", "UTC");
  document.body.append(element);
  return element;
}

function typeInput(element: HotDateElement, value: string): void {
  const input = element.shadowRoot?.querySelector("input");
  if (!input) {
    throw new Error("Input element not found in shadow root.");
  }
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

function fireKey(element: HotDateElement, init: KeyboardEventInit & { key: string }): void {
  const input = element.shadowRoot?.querySelector("input");
  if (!input) {
    throw new Error("Input element not found in shadow root.");
  }
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, ...init }));
}

function getGhostTail(element: HotDateElement): string {
  const tail = element.shadowRoot?.querySelector<HTMLSpanElement>(".ghost-tail");
  return tail?.textContent ?? "";
}

function getGhostTyped(element: HotDateElement): string {
  const typed = element.shadowRoot?.querySelector<HTMLSpanElement>(".ghost-typed");
  return typed?.textContent ?? "";
}

function getGhostResolution(element: HotDateElement): string {
  const resolution = element.shadowRoot?.querySelector<HTMLSpanElement>(".ghost-resolution");
  return resolution?.textContent ?? "";
}

function isHintVisible(element: HotDateElement): boolean {
  const hint = element.shadowRoot?.querySelector<HTMLElement>(".ghost-hint");
  return hint ? !hint.hidden : false;
}

describe("<hot-date> element", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("registers and renders a shadow DOM input", () => {
    const element = createElement();
    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.querySelector("input")).toBeInstanceOf(HTMLInputElement);
  });

  it("renders resolved date as right-aligned ghost on valid input", () => {
    const element = createElement();
    typeInput(element, "march 14 to march 28");

    expect(element.status).toBe("valid");
    expect(element.valueKind).toBe("range");
    expect(element.parseResult.canonicalValue).toBe("2026-03-14/2026-03-28");

    expect(getGhostTyped(element)).toBe("march 14 to march 28");
    expect(getGhostTail(element)).toBe("");
    expect(getGhostResolution(element)).toMatch(/Mar 14, 2026/);
  });

  it("shows completion tail inline while typing a prefix of a suggestion", () => {
    const element = createElement();
    typeInput(element, "tom");

    expect(getGhostTail(element)).toBe("orrow");
    expect(getGhostResolution(element)).toBe("");
    expect(isHintVisible(element)).toBe(true);
  });

  it("hides the Tab hint when there is no completion tail", () => {
    const element = createElement();
    typeInput(element, "today");
    expect(getGhostTail(element)).toBe("");
    expect(isHintVisible(element)).toBe(false);
  });

  it("clears both ghost spans on invalid input (no explainer text)", () => {
    const element = createElement();
    typeInput(element, "banana spaceship");

    expect(element.status).toBe("invalid");
    expect(getGhostTail(element)).toBe("");
    expect(getGhostResolution(element)).toBe("");
  });

  it("recovers ghost after typing → clearing → typing again", () => {
    const element = createElement();
    typeInput(element, "zzz");
    expect(getGhostTail(element)).toBe("");

    typeInput(element, "");
    typeInput(element, "tom");

    expect(getGhostTail(element)).toBe("orrow");
  });

  it("emits parse-change and raw-input-change while typing", () => {
    const element = createElement();
    const parseEvents: string[] = [];
    const rawEvents: string[] = [];

    element.addEventListener("parse-change", (event) => {
      parseEvents.push((event as CustomEvent<{ status: string }>).detail.status);
    });
    element.addEventListener("raw-input-change", (event) => {
      rawEvents.push((event as CustomEvent<{ rawInput: string }>).detail.rawInput);
    });

    typeInput(element, "today");

    expect(rawEvents).toContain("today");
    expect(parseEvents).toContain("valid");
  });

  it("commits valid input on Enter and fires value-commit", () => {
    const element = createElement();
    typeInput(element, "christmas");

    let committed: { value: string; valueKind: string } | null = null;
    element.addEventListener("value-commit", (event) => {
      committed = (event as CustomEvent<{ value: string; valueKind: string }>).detail;
    });

    fireKey(element, { key: "Enter" });

    expect(committed).not.toBeNull();
    expect(committed!.value).toBe("2026-12-25");
    expect(committed!.valueKind).toBe("point");
    expect(element.value).toBe("2026-12-25");
    expect(element.getAttribute("value")).toBe("2026-12-25");
  });

  it("blocks commit on invalid input and fires commit-blocked", () => {
    const element = createElement();
    typeInput(element, "not a date");
    expect(element.status).toBe("invalid");

    let blockReason: string | null = null;
    element.addEventListener("commit-blocked", (event) => {
      blockReason = (event as CustomEvent<{ reason: string }>).detail.reason;
    });

    fireKey(element, { key: "Enter" });

    expect(blockReason).toBe("invalid");
    expect(element.value).toBeNull();
  });

  it("cycles suggestions with ArrowDown and ArrowUp", () => {
    const element = createElement();
    typeInput(element, "to");
    expect(element.suggestions.length).toBeGreaterThan(1);
    const initial = element.activeSuggestionIndex;

    const events: number[] = [];
    element.addEventListener("suggestions-change", (event) => {
      events.push((event as CustomEvent<{ activeSuggestionIndex: number }>).detail.activeSuggestionIndex);
    });

    fireKey(element, { key: "ArrowDown" });
    expect(element.activeSuggestionIndex).not.toBe(initial);
    expect(events.at(-1)).toBe(element.activeSuggestionIndex);

    fireKey(element, { key: "ArrowUp" });
    expect(element.activeSuggestionIndex).toBe(initial);
  });

  it("accepts active completion with Tab when ghost tail is visible", () => {
    const element = createElement();
    typeInput(element, "tom");
    expect(getGhostTail(element)).toBe("orrow");

    const input = element.shadowRoot?.querySelector<HTMLInputElement>("input");
    input!.setSelectionRange(input!.value.length, input!.value.length);

    let accepted: string | null = null;
    element.addEventListener("suggestion-accept", (event) => {
      accepted = (event as CustomEvent<{ suggestion: { insertText: string } }>).detail.suggestion.insertText;
    });

    fireKey(element, { key: "Tab" });

    expect(accepted).toBe("tomorrow");
    expect(element.rawInput).toBe("tomorrow");
  });

  it("Tab is a no-op when no completion tail is available", () => {
    const element = createElement();
    typeInput(element, "today");
    expect(getGhostResolution(element)).toMatch(/Apr 15, 2026/);
    expect(getGhostTail(element)).toBe("");

    const input = element.shadowRoot?.querySelector<HTMLInputElement>("input");
    input!.setSelectionRange(input!.value.length, input!.value.length);

    let accepted = false;
    element.addEventListener("suggestion-accept", () => {
      accepted = true;
    });
    fireKey(element, { key: "Tab" });

    expect(accepted).toBe(false);
    expect(element.rawInput).toBe("today");
  });

  it("clear() resets raw input and committed value", () => {
    const element = createElement();
    typeInput(element, "christmas");
    fireKey(element, { key: "Enter" });
    expect(element.value).not.toBeNull();

    element.clear();

    expect(element.rawInput).toBe("");
    expect(element.value).toBeNull();
    expect(element.status).toBe("idle");
  });

  it("calls setFormValue with canonical value on commit", () => {
    const spy = vi.spyOn(globalThis.ElementInternals.prototype, "setFormValue");
    const element = createElement();
    element.setAttribute("name", "meeting");

    typeInput(element, "christmas");
    fireKey(element, { key: "Enter" });

    expect(spy).toHaveBeenCalledWith("2026-12-25");
    spy.mockRestore();
  });
});
