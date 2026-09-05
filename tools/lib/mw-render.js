const COLON = "\uE000";

export const MW_MARKUP_REMAINS = /\{[^{}]+\}/;

const CONTENT_WRAPPERS = new Set([
  "it",
  "wi",
  "qword",
  "sc",
  "inf",
  "sup",
  "parahw",
  "phrase",
  "ma",
]);

const LINK_TOKENS = new Set([
  "a_link",
  "d_link",
  "et_link",
  "mat",
]);

function normalizeTokenName(name) {
  return name.replaceAll("\\_", "_");
}

function displayLinkText(text = "") {
  return text.replace(/:\d+[a-z]?(?:\([^)]*\))?$/i, "");
}

function renderCrossReference(name, fields) {
  const text = displayLinkText(fields[0]);
  const extra = fields[2];

  if ((name === "sx" || name === "dxt") && extra && extra !== "table") {
    return `${text} ${extra}`;
  }

  return text;
}

function renderDateSense(fields) {
  if (fields.every((field) => field === "")) {
    return "";
  }

  const [divider, number, letter, parenthesized] = fields;
  const dividerLabel = divider === "t"
    ? "transitive sense"
    : divider === "i"
      ? "intransitive sense"
      : "sense";
  const sense = `${number}${letter}${parenthesized ? `(${parenthesized})` : ""}`;

  return ` in the meaning defined at ${dividerLabel}${sense ? ` ${sense}` : ""} `;
}

function renderToken(rawToken, renderedSoFar, onUnknown) {
  let body = rawToken.slice(1, -1);
  let closing = false;

  if (body.startsWith("\\/")) {
    closing = true;
    body = body.slice(2);
  } else if (body.startsWith("/")) {
    closing = true;
    body = body.slice(1);
  }

  const [rawName, ...fields] = body.split("|");
  const name = normalizeTokenName(rawName);

  if (CONTENT_WRAPPERS.has(name)) {
    return "";
  }

  if (name === "gloss") {
    return closing ? "]" : "[";
  }

  if (name === "dx") {
    return closing ? "" : " — ";
  }

  if (name === "dx_def") {
    return closing ? ")" : "(";
  }

  if (!closing && name === "bc") {
    return renderedSoFar.trim() === "" ? "" : COLON;
  }

  if (!closing && name === "ldquo") {
    return "“";
  }

  if (!closing && name === "rdquo") {
    return "”";
  }

  if (!closing && LINK_TOKENS.has(name)) {
    return displayLinkText(fields[0]);
  }

  if (!closing && (name === "sx" || name === "dxt")) {
    return renderCrossReference(name, fields);
  }

  if (!closing && name === "ds") {
    return renderDateSense(fields);
  }

  onUnknown?.(rawToken);
  return rawToken;
}

export function renderMwMarkup(input, { onUnknown } = {}) {
  if (typeof input !== "string") {
    throw new TypeError("Merriam-Webster markup input must be a string");
  }

  let rendered = "";
  let cursor = 0;

  for (const match of input.matchAll(/\{[^{}]+\}/g)) {
    rendered += input.slice(cursor, match.index);
    rendered += renderToken(match[0], rendered, onUnknown);
    cursor = match.index + match[0].length;
  }

  rendered += input.slice(cursor);

  return rendered
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\s*${COLON}\\s*`, "g"), " : ")
    .trim();
}
