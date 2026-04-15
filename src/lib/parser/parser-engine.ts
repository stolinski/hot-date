import type { ParseContext, ParseResult } from "./parser-types";

export interface ParserEngine {
  parse(rawInput: string, context: ParseContext): ParseResult;
}
