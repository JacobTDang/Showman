/**
 * A small, dependency-free, deterministic syntax tokenizer for the common teaching languages
 * (JavaScript / TypeScript, Python). It is intentionally lightweight — enough to color code
 * beautifully, not a full parser. Returns lines of typed runs (no newlines within a run).
 */

export type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "operator" | "punctuation" | "plain";

export interface Token {
  type: TokenType;
  text: string;
}
export type CodeLine = Token[];

export type Language = "js" | "ts" | "python" | "plain";

const JS_KW = [
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "default",
  "class",
  "extends",
  "super",
  "new",
  "this",
  "import",
  "export",
  "from",
  "as",
  "async",
  "await",
  "yield",
  "typeof",
  "instanceof",
  "in",
  "of",
  "try",
  "catch",
  "finally",
  "throw",
  "null",
  "undefined",
  "true",
  "false",
  "void",
  "delete",
  "interface",
  "type",
  "enum",
  "implements",
  "public",
  "private",
  "protected",
  "readonly",
  "static",
  "get",
  "set",
  "namespace",
];
const PY_KW = [
  "def",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "class",
  "import",
  "from",
  "as",
  "with",
  "try",
  "except",
  "finally",
  "raise",
  "lambda",
  "yield",
  "global",
  "nonlocal",
  "pass",
  "break",
  "continue",
  "and",
  "or",
  "not",
  "in",
  "is",
  "None",
  "True",
  "False",
  "async",
  "await",
  "del",
  "assert",
  "print",
];

const KEYWORDS: Record<Language, Set<string>> = {
  js: new Set(JS_KW),
  ts: new Set(JS_KW),
  python: new Set(PY_KW),
  plain: new Set(),
};

const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c);
const isIdent = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string): boolean => c >= "0" && c <= "9";
const isOp = (c: string): boolean => "+-*/%=<>!&|^~?:".includes(c);
const isPunct = (c: string): boolean => "{}()[];,.".includes(c);

export function tokenize(code: string, lang: Language = "js"): CodeLine[] {
  const kw = KEYWORDS[lang] ?? KEYWORDS.js;
  const lineComment = lang === "python" ? "#" : "//";
  const tmpl = lang === "python" ? "" : "`";
  const flat: Token[] = [];
  const push = (type: TokenType, text: string): void => {
    if (text.length > 0) flat.push({ type, text });
  };
  const n = code.length;
  let i = 0;
  while (i < n) {
    const ch = code[i]!;
    if (code.startsWith(lineComment, i)) {
      let j = code.indexOf("\n", i);
      if (j < 0) j = n;
      push("comment", code.slice(i, j));
      i = j;
    } else if (lang !== "python" && code.startsWith("/*", i)) {
      let j = code.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      push("comment", code.slice(i, j));
      i = j;
    } else if (ch === '"' || ch === "'" || (tmpl !== "" && ch === tmpl)) {
      const q = ch;
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === q) {
          j++;
          break;
        }
        if (code[j] === "\n" && q !== "`") break; // ordinary strings don't span lines
        j++;
      }
      push("string", code.slice(i, j));
      i = j;
    } else if (isDigit(ch) || (ch === "." && isDigit(code[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXbBoO._]/.test(code[j]!)) j++;
      push("number", code.slice(i, j));
      i = j;
    } else if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdent(code[j]!)) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && (code[k] === " " || code[k] === "\t")) k++;
      const type: TokenType = kw.has(word) ? "keyword" : code[k] === "(" ? "function" : "plain";
      push(type, word);
      i = j;
    } else if (isPunct(ch)) {
      push("punctuation", ch);
      i++;
    } else if (isOp(ch)) {
      let j = i;
      while (j < n && isOp(code[j]!)) j++;
      push("operator", code.slice(i, j));
      i = j;
    } else {
      push("plain", ch); // whitespace, newline, anything else
      i++;
    }
  }

  // Split runs on newlines into lines; merge adjacent same-type runs to keep node counts low.
  const lines: CodeLine[] = [[]];
  const add = (type: TokenType, text: string): void => {
    const cur = lines[lines.length - 1]!;
    const last = cur[cur.length - 1];
    if (last && last.type === type) last.text += text;
    else if (text.length > 0) cur.push({ type, text });
  };
  for (const t of flat) {
    const parts = t.text.split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) lines.push([]);
      add(t.type, p);
    });
  }
  return lines;
}
