/** The editor toolbar's text changes, as pure functions of the text and its selection. */
export type EditState = { text: string; start: number; end: number };

const LINE_PREFIX = /^(#{2,3} |- )/;

/** Heading, Subheading and Bullet: prefix each touched line (replacing another prefix), or toggle it off. */
export function prefixLines(state: EditState, prefix: "## " | "### " | "- "): EditState {
  const { text } = state;
  const from = state.start === 0 ? 0 : text.lastIndexOf("\n", state.start - 1) + 1;
  // A selection that ends just after a newline does not touch the next line.
  const endAt = state.end > state.start && text[state.end - 1] === "\n" ? state.end - 1 : state.end;
  const newline = text.indexOf("\n", endAt);
  const to = newline === -1 ? text.length : newline;
  const lines = text.slice(from, to).split("\n");
  const content = lines.filter((line) => line.trim() !== "");
  if (content.length === 0) {
    const caret = from + prefix.length;
    return { text: text.slice(0, from) + prefix + text.slice(to), start: caret, end: caret };
  }
  const allHave = content.every((line) => line.startsWith(prefix));
  const next = lines
    .map((line) => (line.trim() === "" ? line : (allHave ? "" : prefix) + line.replace(LINE_PREFIX, "")))
    .join("\n");
  return { text: text.slice(0, from) + next + text.slice(to), start: from, end: from + next.length };
}

/** Bold: wrap the selection in `**`, unwrap it if already wrapped, or insert an empty pair. */
export function wrapBold(state: EditState): EditState {
  const before = state.text.slice(0, state.start);
  const selected = state.text.slice(state.start, state.end);
  const after = state.text.slice(state.end);
  if (!selected) return { text: `${before}****${after}`, start: state.start + 2, end: state.start + 2 };
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { text: before + inner + after, start: state.start, end: state.start + inner.length };
  }
  return { text: `${before}**${selected}**${after}`, start: state.start, end: state.end + 4 };
}

/** Insert field: replace the selection with the marker, caret after it. */
export function insertText(state: EditState, insert: string): EditState {
  const caret = state.start + insert.length;
  return { text: state.text.slice(0, state.start) + insert + state.text.slice(state.end), start: caret, end: caret };
}
