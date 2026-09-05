const INELIGIBLE_LABELS = new Set(["archaic", "obsolete"]);
const REPORTED_DT_TYPES = new Set(["snote", "ca", "uns"]);

export class MwStructureError extends Error {
  constructor(message, raw) {
    const serialized = safeStringify(raw);
    super(`${message}; raw structural shape: ${serialized}`);
    this.name = "MwStructureError";
    this.raw = raw;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function rejectStructure(message, raw, onUnknownStructure) {
  onUnknownStructure?.(raw);
  throw new MwStructureError(message, raw);
}

function labelsFrom(value, raw, onUnknownStructure) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((label) => typeof label !== "string")) {
    rejectStructure("Expected sls to be an array of strings", raw, onUnknownStructure);
  }

  return value;
}

function mergeLabels(...groups) {
  const labels = [];

  for (const group of groups) {
    for (const label of group) {
      if (!labels.includes(label)) {
        labels.push(label);
      }
    }
  }

  return labels;
}

function isEligible(sls) {
  return !sls.some((label) => INELIGIBLE_LABELS.has(label.trim().toLowerCase()));
}

function compactSenseNumber(sn) {
  return sn.trim().replace(/\s+/g, "");
}

function normalizeOrdinaryId(sn, context, raw, onUnknownStructure) {
  if (typeof sn !== "string" || sn.trim() === "") {
    if (context.unnumberedUsed) {
      rejectStructure("Multiple unnumbered selectable senses are ambiguous", raw, onUnknownStructure);
    }

    context.unnumberedUsed = true;
    context.major = "1";
    context.lastOrdinaryId = "1";
    return "1";
  }

  const compact = compactSenseNumber(sn);

  if (/^\d+[a-z]?(?:\(\d+\))?$/i.test(compact)) {
    const major = compact.match(/^\d+/)[0];
    context.major = major;
    context.lastOrdinaryId = compact;
    return compact;
  }

  if (/^[a-z]$/i.test(compact) && context.major) {
    const id = `${context.major}${compact}`;
    context.lastOrdinaryId = id;
    return id;
  }

  rejectStructure(`Cannot normalize sense number ${safeStringify(sn)}`, raw, onUnknownStructure);
}

function normalizeParenthesizedId(sn, baseId, position, raw, onUnknownStructure) {
  if (!baseId) {
    rejectStructure("Parenthesized sense has no binding parent", raw, onUnknownStructure);
  }

  if (sn === undefined || sn === null || sn === "") {
    return `${baseId}(${position})`;
  }

  if (typeof sn !== "string") {
    rejectStructure("Expected a parenthesized sense number to be a string", raw, onUnknownStructure);
  }

  const compact = compactSenseNumber(sn);
  const match = compact.match(/^\((\d+)\)$/);

  if (!match) {
    rejectStructure(`Expected a parenthesized sense number, received ${safeStringify(sn)}`, raw, onUnknownStructure);
  }

  return `${baseId}(${match[1]})`;
}

function readDt(dt, unitId, options) {
  if (dt === undefined) {
    return { dtText: null, vis: [] };
  }

  if (!Array.isArray(dt)) {
    rejectStructure("Expected dt to be an array", dt, options.onUnknownStructure);
  }

  let dtText = null;
  const vis = [];

  for (const element of dt) {
    if (!Array.isArray(element) || typeof element[0] !== "string" || element.length < 2) {
      rejectStructure("Unrecognized dt element shape", element, options.onUnknownStructure);
    }

    const [type, value] = element;

    if (type === "text") {
      if (typeof value !== "string") {
        rejectStructure("Expected defining text to be a string", element, options.onUnknownStructure);
      }
      if (dtText !== null) {
        rejectStructure("Multiple defining text elements are ambiguous", dt, options.onUnknownStructure);
      }
      dtText = value;
      continue;
    }

    if (type === "vis") {
      if (!Array.isArray(value)) {
        rejectStructure("Expected vis to be an array", element, options.onUnknownStructure);
      }
      vis.push(...value);
      continue;
    }

    options.onDtType?.({ type, value, unitId, known: REPORTED_DT_TYPES.has(type) });
  }

  return { dtText, vis };
}

function emitSense(sense, id, inheritedSls, units, options) {
  if (!sense || typeof sense !== "object" || Array.isArray(sense)) {
    rejectStructure("Expected sense payload to be an object", sense, options.onUnknownStructure);
  }

  const sls = mergeLabels(
    inheritedSls,
    labelsFrom(sense.sls, sense, options.onUnknownStructure),
  );
  const { dtText, vis } = readDt(sense.dt, id, options);

  units.push({ id, sls, eligible: isEligible(sls), dtText, vis });

  if (sense.sdsense !== undefined) {
    const divided = sense.sdsense;
    if (!divided || typeof divided !== "object" || Array.isArray(divided)) {
      rejectStructure("Expected sdsense to be an object", divided, options.onUnknownStructure);
    }

    const dividedId = `${id}:sd`;
    const dividedSls = mergeLabels(
      sls,
      labelsFrom(divided.sls, divided, options.onUnknownStructure),
    );
    const dividedDt = readDt(divided.dt, dividedId, options);

    units.push({
      id: dividedId,
      sls: dividedSls,
      eligible: isEligible(dividedSls),
      dtText: dividedDt.dtText,
      vis: dividedDt.vis,
    });
  }
}

function validateTuple(element, options) {
  if (!Array.isArray(element) || element.length !== 2 || typeof element[0] !== "string") {
    rejectStructure("Expected a two-item structural tuple", element, options.onUnknownStructure);
  }
}

function walkElements(elements, inheritedSls, context, units, options, inPseq = false) {
  let structuralSls = inheritedSls;
  let parenthesizedBase = inPseq ? context.lastOrdinaryId : null;
  let parenthesizedPosition = 0;

  for (const element of elements) {
    validateTuple(element, options);
    const [type, payload] = element;

    if (type === "sen") {
      if (inPseq || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        rejectStructure("Invalid sen structural header", element, options.onUnknownStructure);
      }

      if (payload.sn !== undefined) {
        normalizeOrdinaryId(payload.sn, context, element, options.onUnknownStructure);
      }
      structuralSls = mergeLabels(
        inheritedSls,
        labelsFrom(payload.sls, payload, options.onUnknownStructure),
      );
      continue;
    }

    if (type === "bs") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.sense) {
        rejectStructure("Binding substitute must wrap a sense", element, options.onUnknownStructure);
      }

      const bindingSense = payload.sense;
      if (!bindingSense || typeof bindingSense !== "object" || Array.isArray(bindingSense)) {
        rejectStructure("Binding substitute has an invalid sense", element, options.onUnknownStructure);
      }

      const bindingId = normalizeOrdinaryId(
        bindingSense.sn,
        context,
        element,
        options.onUnknownStructure,
      );
      const bindingSls = mergeLabels(
        structuralSls,
        labelsFrom(bindingSense.sls, bindingSense, options.onUnknownStructure),
      );

      if (bindingSense.dt !== undefined) {
        emitSense(bindingSense, bindingId, structuralSls, units, options);
      }

      structuralSls = bindingSls;
      if (inPseq) {
        parenthesizedBase = bindingId;
      }
      continue;
    }

    if (type === "pseq") {
      if (inPseq || !Array.isArray(payload)) {
        rejectStructure("Invalid or nested pseq", element, options.onUnknownStructure);
      }

      walkElements(payload, structuralSls, context, units, options, true);
      continue;
    }

    if (type === "sense") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        rejectStructure("Expected sense payload to be an object", element, options.onUnknownStructure);
      }

      let id;
      if (inPseq) {
        parenthesizedPosition += 1;
        id = normalizeParenthesizedId(
          payload.sn,
          parenthesizedBase,
          parenthesizedPosition,
          element,
          options.onUnknownStructure,
        );
      } else {
        id = normalizeOrdinaryId(payload.sn, context, element, options.onUnknownStructure);
      }

      emitSense(payload, id, structuralSls, units, options);
      continue;
    }

    rejectStructure(`Unknown sseq structural type ${safeStringify(type)}`, element, options.onUnknownStructure);
  }
}

export function walkMwSseq(sseq, options = {}) {
  if (!Array.isArray(sseq)) {
    rejectStructure("Expected sseq to be an array", sseq, options.onUnknownStructure);
  }

  const inheritedSls = labelsFrom(
    options.inheritedSls,
    options.inheritedSls,
    options.onUnknownStructure,
  );
  const context = { major: null, lastOrdinaryId: null, unnumberedUsed: false };
  const units = [];

  for (const group of sseq) {
    if (!Array.isArray(group)) {
      rejectStructure("Expected each sseq group to be an array", group, options.onUnknownStructure);
    }
    walkElements(group, inheritedSls, context, units, options);
  }

  return units;
}

export function walkMwDefinitions(definitions, options = {}) {
  if (!Array.isArray(definitions)) {
    rejectStructure("Expected def to be an array", definitions, options.onUnknownStructure);
  }

  const inheritedSls = labelsFrom(
    options.inheritedSls,
    options.inheritedSls,
    options.onUnknownStructure,
  );

  return definitions.flatMap((definition) => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      rejectStructure("Expected each def member to be an object", definition, options.onUnknownStructure);
    }
    if (!Object.hasOwn(definition, "sseq")) {
      rejectStructure("Definition member has no sseq", definition, options.onUnknownStructure);
    }

    return walkMwSseq(definition.sseq, {
      ...options,
      inheritedSls: mergeLabels(
        inheritedSls,
        labelsFrom(definition.sls, definition, options.onUnknownStructure),
      ),
    });
  });
}

export function walkMwEntry(entry, options = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    rejectStructure("Expected an entry object", entry, options.onUnknownStructure);
  }

  return walkMwDefinitions(entry.def ?? [], {
    ...options,
    inheritedSls: mergeLabels(
      labelsFrom(options.inheritedSls, options.inheritedSls, options.onUnknownStructure),
      labelsFrom(entry.sls, entry, options.onUnknownStructure),
    ),
  });
}
