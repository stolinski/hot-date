import { normalizeFuzzyInput } from "../utils/string-utils";
import { createCandidateFactory, getCanonicalValue, type CandidateWithSuggestion } from "./candidates";
import { buildSuggestions } from "./complete";
import {
  parseAmbiguousNextWeekday,
  parseAnchorPlusDurationPoint,
  parseAnchorRange,
  parseBoundaryOfPeriod,
  parseExplicitRange,
  parseFutureDurationPoint,
  parseInDurationPoint,
  parseLookbackWindow,
  parsePastDurationPoint,
  parsePointValue,
  parseThisNextLastPeriod,
  type RuleContext,
} from "./grammar";
import type { ParserEngine } from "./parser-engine";
import type {
  AmbiguityGroup,
  Candidate,
  CompletionSuggestion,
  ParseContext,
  ParseResult,
  ValueKind,
} from "./parser-types";

export class JsParserEngine implements ParserEngine {
  public parse(rawInput: string, context: ParseContext): ParseResult {
    const normalizedInput = normalizeFuzzyInput(rawInput);

    if (!normalizedInput) {
      return buildResult({
        rawInput,
        status: "idle",
        astType: null,
        valueKind: null,
        candidates: [],
        ambiguityGroups: [],
        selectedCandidateId: null,
        previewLabel: null,
        canonicalValue: null,
        errors: [],
        suggestions: buildSuggestions(rawInput),
      });
    }

    const now = resolveNow(context);
    const timeZone = resolveTimeZone(context);
    const factory = createCandidateFactory(timeZone);
    const ruleCtx: RuleContext = {
      normalizedInput,
      now,
      timeZone,
      parseContext: context,
      factory,
    };

    const pointRules = [
      { rule: parseExplicitRange, kind: "range" as const },
      { rule: parseAnchorPlusDurationPoint, kind: "point" as const },
      { rule: parseInDurationPoint, kind: "point" as const },
      { rule: parseBoundaryOfPeriod, kind: "point" as const },
      { rule: parseThisNextLastPeriod, kind: "range" as const },
      { rule: parseLookbackWindow, kind: "range" as const },
      { rule: parseAnchorRange, kind: "range" as const },
      { rule: parsePastDurationPoint, kind: "point" as const },
      { rule: parseFutureDurationPoint, kind: "point" as const },
    ];

    for (const { rule, kind } of pointRules) {
      const candidate = rule(ruleCtx);
      if (candidate) {
        return buildValidResult(rawInput, kind, candidate);
      }
    }

    const ambiguousWeekday = parseAmbiguousNextWeekday(ruleCtx);
    if (ambiguousWeekday) {
      return buildResult({
        rawInput,
        status: "ambiguous",
        astType: "relative_weekday_datetime",
        valueKind: "point",
        candidates: ambiguousWeekday.candidates,
        ambiguityGroups: [ambiguousWeekday.group],
        selectedCandidateId: null,
        previewLabel: ambiguousWeekday.candidates[0]?.label ?? null,
        canonicalValue: null,
        errors: [],
        suggestions: buildSuggestions(rawInput),
      });
    }

    const directPoint = parsePointValue(ruleCtx);
    if (directPoint) {
      return buildValidResult(rawInput, "point", directPoint);
    }

    return buildResult({
      rawInput,
      status: "invalid",
      astType: null,
      valueKind: null,
      candidates: [],
      ambiguityGroups: [],
      selectedCandidateId: null,
      previewLabel: null,
      canonicalValue: null,
      errors: ["Unable to parse input."],
      suggestions: buildSuggestions(rawInput),
    });
  }
}

function buildValidResult(rawInput: string, valueKind: ValueKind, candidate: CandidateWithSuggestion): ParseResult {
  return buildResult({
    rawInput,
    status: "valid",
    astType: valueKind === "range" ? "range" : "datetime",
    valueKind,
    candidates: [candidate],
    ambiguityGroups: [],
    selectedCandidateId: candidate.id,
    previewLabel: candidate.label,
    canonicalValue: getCanonicalValue(candidate),
    errors: [],
    suggestions: buildSuggestions(rawInput),
  });
}

function buildResult(input: {
  rawInput: string;
  status: ParseResult["status"];
  astType: string | null;
  valueKind: ValueKind;
  candidates: Candidate[];
  suggestions: CompletionSuggestion[];
  ambiguityGroups: AmbiguityGroup[];
  selectedCandidateId: string | null;
  previewLabel: string | null;
  canonicalValue: string | null;
  errors: string[];
}): ParseResult {
  return {
    status: input.status,
    rawInput: input.rawInput,
    astType: input.astType,
    valueKind: input.valueKind,
    candidates: input.candidates,
    suggestions: input.suggestions,
    ambiguityGroups: input.ambiguityGroups,
    selectedCandidateId: input.selectedCandidateId,
    previewLabel: input.previewLabel,
    canonicalValue: input.canonicalValue,
    errors: input.errors,
  };
}

function resolveNow(context: ParseContext): Date {
  const parsed = new Date(context.nowIso);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function resolveTimeZone(context: ParseContext): string {
  return context.timezone || "UTC";
}
