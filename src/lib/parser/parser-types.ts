export type ParseStatus = "idle" | "valid" | "ambiguous" | "invalid";

export type ValueKind = "point" | "range" | null;

export interface ParseContext {
  nowIso: string;
  timezone: string;
  locale: string;
  weekStart: "sunday" | "monday";
  productRules: {
    allowPast: boolean;
    defaultTime?: { hour: number; minute: number };
    timeOnlyPolicy: "today_if_future_else_tomorrow" | "always_require_date";
  };
}

export interface Candidate {
  id: string;
  kind: "point" | "range";
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
  source: "rule" | "fallback";
}

export interface CompletionSuggestion {
  id: string;
  label: string;
  insertText: string;
  kind: "completion" | "candidate" | "shortcut";
  confidence: number;
  candidateId?: string;
}

export interface AmbiguityGroup {
  id: string;
  type:
    | "relative_weekday_scope"
    | "week_start_convention"
    | "time_only_anchor"
    | "weekend_interpretation";
  message: string;
  required: boolean;
  options: { id: string; label: string; candidateId: string }[];
}

export interface ParseResult {
  status: ParseStatus;
  rawInput: string;
  astType: string | null;
  valueKind: ValueKind;
  candidates: Candidate[];
  suggestions: CompletionSuggestion[];
  ambiguityGroups: AmbiguityGroup[];
  selectedCandidateId: string | null;
  previewLabel: string | null;
  canonicalValue: string | null;
  errors: string[];
}
