export type ComparisonOperator = ':' | '=' | '>' | '>=' | '<' | '<=';

export type SearchToken = {
  raw: string;
  field?: string;
  operator?: ComparisonOperator;
  value: string;
  negated: boolean;
};

export type ParsedSearchQuery = {
  raw: string;
  tokens: SearchToken[];
};

const TOKEN_PATTERN = /"([^"\\]*(?:\\.[^"\\]*)*)"|(\S+)/g;
const FIELD_PATTERN = /^([a-zA-Z][\w.-]*)(:|=|>=|>|<=|<)(.*)$/;

const unquote = (value: string): string => value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

export const tokenizeSearchQuery = (input: string): string[] => {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = TOKEN_PATTERN.exec(input)) !== null) {
    tokens.push(match[1] !== undefined ? unquote(match[1]) : match[2] ?? '');
  }

  return tokens.filter(Boolean);
};

export const parseSearchQuery = (raw: string): ParsedSearchQuery => ({
  raw,
  tokens: tokenizeSearchQuery(raw).map((token): SearchToken => {
    const negated = token.startsWith('-');
    const rawWithoutNegation = negated ? token.slice(1) : token;
    const fieldMatch = rawWithoutNegation.match(FIELD_PATTERN);

    if (!fieldMatch) {
      return {
        raw: token,
        value: rawWithoutNegation,
        negated
      };
    }

    return {
      raw: token,
      field: fieldMatch[1]?.toLowerCase(),
      operator: fieldMatch[2] as ComparisonOperator,
      value: fieldMatch[3] ?? '',
      negated
    };
  })
});
