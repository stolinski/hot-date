import "./styles.css";
import { CHALLENGE_PHRASES } from "./lib/parser/challenge-phrases";
import "./hot-date";
import type { HotDateElement } from "./hot-date";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <section class="shell">
    <header class="header">
      <h1>hot-date</h1>
      <p>Desktop-first challenge harness for parser speed, completion flow, and UTC output.</p>
    </header>

    <div class="picker-wrap">
      <hot-date id="hot-date"></hot-date>
    </div>

    <section class="challenges">
      <h2>Challenge phrases</h2>
      <div id="challenge-list" class="chips"></div>
    </section>

    <section class="output">
      <div>
        <h3>Status</h3>
        <pre id="status"></pre>
      </div>
      <div>
        <h3>Committed UTC value</h3>
        <pre id="value"></pre>
      </div>
      <div>
        <h3>Parse result</h3>
        <pre id="result"></pre>
      </div>
      <div>
        <h3>Event log</h3>
        <pre id="events"></pre>
      </div>
    </section>
  </section>
`;

const picker = app.querySelector<HotDateElement>("#hot-date");
const statusElement = app.querySelector<HTMLPreElement>("#status");
const valueElement = app.querySelector<HTMLPreElement>("#value");
const resultElement = app.querySelector<HTMLPreElement>("#result");
const eventsElement = app.querySelector<HTMLPreElement>("#events");
const challengeList = app.querySelector<HTMLDivElement>("#challenge-list");

if (
  !picker ||
  !statusElement ||
  !valueElement ||
  !resultElement ||
  !eventsElement ||
  !challengeList
) {
  throw new Error("Required UI elements are missing.");
}

const hotDate = picker;
const statusPre = statusElement;
const valuePre = valueElement;
const resultPre = resultElement;
const eventsPre = eventsElement;
const challengeListElement = challengeList;

function appendEventLog(message: string): void {
  const current = eventsPre.textContent ? eventsPre.textContent.split("\n") : [];
  const next = [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 12);
  eventsPre.textContent = next.join("\n");
}

function syncPanels(): void {
  statusPre.textContent = `${hotDate.status}`;
  valuePre.textContent = hotDate.value ?? "(none)";
  resultPre.textContent = JSON.stringify(hotDate.parseResult, null, 2);
}

CHALLENGE_PHRASES.forEach((phrase) => {
  const item = document.createElement("span");
  item.className = "chip";
  item.textContent = phrase;
  challengeListElement.append(item);
});

hotDate.addEventListener("parse-change", () => {
  syncPanels();
});

hotDate.addEventListener("value-commit", (event) => {
  const detail = (event as CustomEvent<{ value: string; valueKind: string }>).detail;
  appendEventLog(`value-commit: ${detail.valueKind} ${detail.value}`);
  syncPanels();
});

hotDate.addEventListener("commit-blocked", (event) => {
  const detail = (event as CustomEvent<{ reason: string }>).detail;
  appendEventLog(`commit-blocked: ${detail.reason}`);
  syncPanels();
});

hotDate.addEventListener("suggestion-accept", (event) => {
  const detail = (event as CustomEvent<{ suggestion: { insertText: string } }>).detail;
  appendEventLog(`suggestion-accept: ${detail.suggestion.insertText}`);
  syncPanels();
});

syncPanels();
