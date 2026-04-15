import { Bench } from "tinybench";
import { JsParserEngine } from "../src/lib/parser/js-parser-engine";
import { CHALLENGE_PHRASES } from "../src/lib/parser/challenge-phrases";
import type { ParseContext } from "../src/lib/parser/parser-types";

process.env.TZ = "UTC";

const parser = new JsParserEngine();

const context: ParseContext = {
  nowIso: "2026-04-15T12:00:00.000Z",
  timezone: "UTC",
  locale: "en-US",
  weekStart: "sunday",
  productRules: {
    allowPast: true,
    defaultTime: { hour: 9, minute: 0 },
    timeOnlyPolicy: "today_if_future_else_tomorrow",
  },
};

const bench = new Bench({
  time: 150,
  warmupTime: 150,
});

for (const phrase of CHALLENGE_PHRASES) {
  bench.add(phrase, () => {
    parser.parse(phrase, context);
  });
}

await bench.run();

console.table(
  bench.tasks.map((task) => ({
    name: task.name,
    hz: Math.round(task.result?.hz ?? 0),
    meanMs: (task.result?.mean ?? 0).toFixed(4),
    p99Ms: (task.result?.p99 ?? 0).toFixed(4),
    rme: task.result?.rme?.toFixed(2) ?? "0.00",
  })),
);
