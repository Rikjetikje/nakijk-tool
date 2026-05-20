import { useState, useRef, useCallback, useEffect, useMemo } from "react";

const CATEGORY_COLORS = [
  { bg: "#DBEAFE", border: "#3B82F6", text: "#1E40AF" },
  { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
  { bg: "#FCE7F3", border: "#EC4899", text: "#9D174D" },
];

const TAAL_SUB_COLORS = {
  Formuleringsfouten: { bg: "#FEF3C7", border: "#D97706", text: "#92400E", icon: "F" },
  Spelfouten: { bg: "#FEE2E2", border: "#DC2626", text: "#991B1B", icon: "S" },
  Interpunctiefouten: { bg: "#E0E7FF", border: "#6366F1", text: "#3730A3", icon: "I" },
};

const DEFAULT_TAAL_GROUPS_CONFIG = [
  { name: "Formuleringsfouten", ranges: [
    { id: "f0", min: 1, max: 2, aftrek: 1 },
    { id: "f1", min: 3, max: 4, aftrek: 2 },
    { id: "f2", min: 5, max: null, aftrek: 3 },
  ]},
  { name: "Spelfouten", ranges: [
    { id: "s0", min: 1, max: 2, aftrek: 1 },
    { id: "s1", min: 3, max: 4, aftrek: 2 },
    { id: "s2", min: 5, max: null, aftrek: 3 },
  ]},
  { name: "Interpunctiefouten", ranges: [
    { id: "i0", min: 2, max: null, aftrek: 1 },
  ]},
];

function validateTaalRanges(ranges) {
  const errors = [];
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  const infiniteCount = ranges.filter(r => r.max === null).length;
  if (infiniteCount > 1) errors.push("Slechts één bereik mag 'en meer' zijn");
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.min < 1) errors.push(`Minimum moet ≥ 1 zijn`);
    if (r.max !== null && r.max < r.min) errors.push(`Max (${r.max}) is kleiner dan min (${r.min})`);
    if (r.aftrek < 0) errors.push(`Aftrek moet ≥ 0 zijn`);
    if (i < sorted.length - 1) {
      const nxt = sorted[i + 1];
      const maxVal = r.max === null ? Infinity : r.max;
      if (nxt.min <= maxVal) errors.push(`Overlappende bereiken: ${r.min}–${r.max === null ? "∞" : r.max} en ${nxt.min}–${nxt.max === null ? "∞" : nxt.max}`);
      else if (nxt.min > maxVal + 1) errors.push(`Gat in bereiken: ${r.max + 1}${nxt.min - 1 > r.max + 1 ? "–" + (nxt.min - 1) : ""} ontbreekt`);
    }
  }
  if (sorted.length > 0 && sorted[sorted.length - 1].max !== null) {
    errors.push(`Laatste bereik moet '∞ aan' zijn zodat alle aantallen gedekt zijn`);
  }
  return errors;
}

function parseTaalItems(taalGroupsConfig) {
  const config = taalGroupsConfig || DEFAULT_TAAL_GROUPS_CONFIG;
  const result = [];
  config.forEach((group, gi) => {
    (group.ranges || []).forEach((range, ri) => {
      result.push({
        id: `taal-${gi}-${ri}`,
        text: `${group.name}: ${range.min}${range.max !== null ? "–" + range.max : "+"} (−${range.aftrek}pt)`,
        points: range.aftrek,
        taalGroup: group.name,
        rangeMin: range.min,
        rangeMax: range.max,
      });
    });
  });
  return result;
}

function buildCategoriesFromEditor(inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax, taalGroupsConfig) {
  const makeItems = (text, prefix) => text.split("\n").map((l) => l.trim()).filter(Boolean).map((line, idx) => {
    const match = line.match(/^(.*?)\s*\[(\d+(?:\.\d+)?)\]\s*$/);
    const text = match ? match[1].trim() : line;
    const points = match ? parseFloat(match[2]) : 1;
    return { id: prefix + idx, text, points, taalGroup: null };
  });
  return [
    { id: "1", name: "Inhoud", maxScore: inhoudMax, items: makeItems(inhoudText, "inh-"), color: CATEGORY_COLORS[0], mode: "checkIsGood" },
    { id: "2", name: "Taalgebruik", maxScore: taalMax, items: parseTaalItems(taalGroupsConfig), color: CATEGORY_COLORS[1], mode: "taalAuto" },
    { id: "3", name: "Presentatie/conventies", maxScore: presentatieMax, items: makeItems(presentatieText, "pres-"), color: CATEGORY_COLORS[2], mode: "checkIsBad" },
  ];
}

function buildSegments(text, highlights) {
  if (!text || highlights.length === 0) return [{ start: 0, end: text.length, layers: [] }];
  const pts = new Set([0, text.length]);
  highlights.forEach((h) => { pts.add(h.start); pts.add(h.end); });
  const sorted = [...pts].sort((a, b) => a - b), segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], e = sorted[i + 1];
    const layers = highlights.filter((h) => h.start <= s && h.end >= e)
      .map((h) => ({ id: h.id, color: h.displayColor || h.color, categoryName: h.categoryName, itemLabel: h.itemLabel, itemId: h.itemId, taalGroup: h.taalGroup }));
    segs.push({ start: s, end: e, layers });
  }
  return segs;
}

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; } catch { return initial; }
  });
  const set = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [state, set];
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function timeAgo(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "zojuist";
    if (mins < 60) return mins + " min geleden";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " uur geleden";
    const days = Math.floor(hrs / 24);
    return days + " dag" + (days !== 1 ? "en" : "") + " geleden";
  } catch { return ""; }
}

function HighlightableText({ text, highlights, onHighlight, onSelectHighlight, hoveredItemId, selectedHighlightId, itemNumbers }) {
  const containerRef = useRef(null);
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0), container = containerRef.current;
    if (!container) return;
    const startInside = container.contains(range.startContainer);
    const endInside = container.contains(range.endContainer);
    if (!startInside && !endInside) return; // selection entirely outside container
    // Filter: skip text nodes inside <sup> (item numbers are not part of studentText)
    const noSup = { acceptNode: n => { let p = n.parentElement; while (p && p !== container) { if (p.tagName === 'SUP') return NodeFilter.FILTER_REJECT; p = p.parentElement; } return NodeFilter.FILTER_ACCEPT; } };
    const getOff = (node, offset) => {
      if (node.nodeType !== 3) {
        // Element node: count text nodes that come strictly before position (node, offset)
        // using compareDocumentPosition — avoids invalid Range issues entirely.
        const targetChild = node.childNodes[offset]; // child just after the caret; undefined if at end
        const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, noSup);
        let t = 0;
        while (w.nextNode()) {
          const curr = w.currentNode;
          if (targetChild) {
            // Stop as soon as curr is no longer strictly before targetChild
            if (!(targetChild.compareDocumentPosition(curr) & Node.DOCUMENT_POSITION_PRECEDING)) break;
          } else {
            // offset = childNodes.length: count everything inside node, stop after it
            if (!node.contains(curr) && (node.compareDocumentPosition(curr) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
          }
          t += curr.textContent.length;
        }
        return t;
      }
      // Text node: standard walk with noSup filter
      const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, noSup);
      let t = 0;
      while (w.nextNode()) {
        if (w.currentNode === node) return t + offset;
        t += w.currentNode.textContent.length;
      }
      return t + offset;
    };
    const s = startInside ? getOff(range.startContainer, range.startOffset) : 0;
    const e = endInside ? getOff(range.endContainer, range.endOffset) : text.length;
    if (s !== e) { const handled = onHighlight(Math.min(s, e), Math.max(s, e)); if (handled) sel.removeAllRanges(); }
  }, [onHighlight, text.length]);

  // Attach to document so mouseup outside the container (e.g. mouse drifted left/right
  // into the padding zone) is still caught.
  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const segments = useMemo(() => buildSegments(text, highlights), [text, highlights]);

  return (
    <div ref={containerRef}
      style={{ whiteSpace: "pre-wrap", lineHeight: "2.0", fontSize: "15px", fontFamily: "'Georgia', 'Times New Roman', serif", color: "#1a1a2e", minHeight: "200px", userSelect: "text" }}>
      {segments.map((seg, i) => {
        const str = text.slice(seg.start, seg.end);
        if (seg.layers.length === 0) return <span key={i}>{str}</span>;

        const bgLayers = seg.layers.filter((l) => !l.taalGroup);
        const spellLayers = seg.layers.filter((l) => l.taalGroup === "Spelfouten");
        const formLayers = seg.layers.filter((l) => l.taalGroup === "Formuleringsfouten");
        const interpLayers = seg.layers.filter((l) => l.taalGroup === "Interpunctiefouten");
        const hasInterp = interpLayers.length > 0;

        const isSelected = seg.layers.some((l) => l.id === selectedHighlightId);
        const isItemHovered = seg.layers.some((l) => (l.itemId && l.itemId === hoveredItemId) || (l.taalGroup && l.taalGroup === hoveredItemId));
        const active = isSelected || isItemHovered;
        const selectedLayer = seg.layers.find((l) => l.id === selectedHighlightId);

        const bgLayer = bgLayers[0];
        const bgColor = bgLayer ? bgLayer.color.bg + (active && selectedLayer && !selectedLayer.taalGroup ? "ee" : "cc") : "transparent";

        const bgImages = [], bgSizes = [], bgPositions = [];
        if (spellLayers.length > 0) {
          const c = TAAL_SUB_COLORS.Spelfouten.border;
          const svg = "data:image/svg+xml," + encodeURIComponent('<svg width="8" height="6" viewBox="0 0 8 6" xmlns="http://www.w3.org/2000/svg"><path d="M0 3 Q2 0.5 4 3 Q6 5.5 8 3" fill="none" stroke="' + c + '" stroke-width="1.2"/></svg>');
          bgImages.push('url("' + svg + '")'); bgSizes.push("8px 6px"); bgPositions.push("left bottom 0px");
        }
        if (formLayers.length > 0) {
          const c = TAAL_SUB_COLORS.Formuleringsfouten.border;
          const svg = "data:image/svg+xml," + encodeURIComponent('<svg width="6" height="2" viewBox="0 0 6 2" xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="0.9" fill="' + c + '"/></svg>');
          bgImages.push('url("' + svg + '")'); bgSizes.push("6px 2px"); bgPositions.push("left bottom 2px");
        }

        const containsSelected = seg.layers.some((l) => l.id === selectedHighlightId);
        const outlineColor = selectedLayer ? (selectedLayer.displayColor || selectedLayer.color).border : null;
        const selH = active && selectedLayer ? highlights.find((h) => h.id === selectedHighlightId) : null;
        const isLeftEdge = selH ? seg.start === selH.start : false;
        const isRightEdge = selH ? seg.end === selH.end : false;
        const showBorder = active && outlineColor && containsSelected;
        const shouldDim = selectedHighlightId && !containsSelected && seg.layers.length > 0;
        const allLayers = seg.layers;

        return (
          <span key={i}
            onClick={(e) => {
              e.stopPropagation();
              if (allLayers.length === 1) { onSelectHighlight(selectedHighlightId === allLayers[0].id ? null : allLayers[0].id); }
              else { const ci = allLayers.findIndex((l) => l.id === selectedHighlightId); onSelectHighlight(allLayers[(ci === -1 ? 0 : ci + 1) % allLayers.length].id); }
            }}
            style={{
              backgroundColor: bgColor,
              backgroundImage: bgImages.length > 0 ? bgImages.join(", ") : "none",
              backgroundSize: bgSizes.join(", ") || "auto",
              backgroundPosition: bgPositions.join(", ") || "auto",
              backgroundRepeat: "repeat-x",
              WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
              borderRadius: "2px", padding: "1px 0", cursor: "pointer",
              transition: "box-shadow 0.15s, opacity 0.15s",
              boxShadow: showBorder ? "inset 0 2px 0 " + outlineColor + ", inset 0 -2px 0 " + outlineColor + (isLeftEdge ? ", inset 2px 0 0 " + outlineColor : "") + (isRightEdge ? ", inset -2px 0 0 " + outlineColor : "") : "none",
              position: (spellLayers.length > 0 || formLayers.length > 0 || showBorder) ? "relative" : "static",
              zIndex: (spellLayers.length > 0 || formLayers.length > 0 || showBorder) ? 1 : "auto",
              opacity: shouldDim ? 0.35 : 1,
            }}>
            {(() => {
              // Show superscript number at the start of non-taal highlights
              const supNums = itemNumbers
                ? highlights.filter(h => h.start === seg.start && !h.taalGroup && h.itemId && itemNumbers[h.itemId])
                    .map(h => itemNumbers[h.itemId]).sort((a, b) => a - b)
                : [];
              const inner = hasInterp
                ? <span style={{ borderRadius: "50%", boxShadow: "0 0 0 2px " + TAAL_SUB_COLORS.Interpunctiefouten.border + (active && selectedLayer?.taalGroup === "Interpunctiefouten" ? "" : "88") }}>{str}</span>
                : str;
              return supNums.length > 0
                ? <>{supNums.map(n => <sup key={n} style={{ fontSize: "9px", fontWeight: "800", lineHeight: 1, marginRight: "1px", verticalAlign: "super", color: (bgLayers[0]?.color?.text || "#333") }}>{n}</sup>)}{inner}</>
                : inner;
            })()}
          </span>
        );
      })}
    </div>
  );
}

export default function NakijkTool() {
  // Persistent state
  const [savedModels, setSavedModels] = useLocalStorage("nakijk_models", []);
  const [savedClasses, setSavedClasses] = useLocalStorage("nakijk_classes", []);
  const [savedGrades, setSavedGrades] = useLocalStorage("nakijk_grades", []);

  // Navigation
  const [view, setView] = useState("home");

  // Session tracking
  const [currentGradeId, setCurrentGradeId] = useState(null);
  const [currentModelId, setCurrentModelId] = useState(null);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [currentModelName, setCurrentModelName] = useState("");

  // Model save dialog
  const [showSaveModelDialog, setShowSaveModelDialog] = useState(false);
  const [saveModelNameInput, setSaveModelNameInput] = useState("");
  const [modelDirty, setModelDirty] = useState(false);
  const [modelSavedFlash, setModelSavedFlash] = useState("");

  // Class/student management UI
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [newClassName, setNewClassName] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [confirmDeleteClassId, setConfirmDeleteClassId] = useState(null);
  const [confirmDeleteModelId, setConfirmDeleteModelId] = useState(null);
  const [confirmDeleteGradeId, setConfirmDeleteGradeId] = useState(null);
  const [bulkStudentInput, setBulkStudentInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [overviewModelId, setOverviewModelId] = useState("");

  // Pickers (student view)
  const [pickerClassId, setPickerClassId] = useState("");
  const [pickerStudentId, setPickerStudentId] = useState("");
  const [pickerModelId, setPickerModelId] = useState("");

  // Session state
  const [sessionClassIds, setSessionClassIds] = useState([]);
  const [gradingClassId, setGradingClassId] = useState("");
  const [inlineTextMode, setInlineTextMode] = useState(false);
  const [inlineTextInput, setInlineTextInput] = useState("");
  const [handwrittenMode, setHandwrittenMode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState(null);

  // Existing state
  const [categories, setCategories] = useState([]);
  const [catModes, setCatModes] = useState({});
  const [inhoudText, setInhoudText] = useState("stelt zichzelf voor\nvermeldt dat hij namens de klas de e-mail schrijft\nvertelt dat hij het artikel heeft gelezen\nvermeldt dat bij maatschappijleer het thema centraal staat\nvertelt dat zijn docent op zoek is naar een gastdocent\nvraagt of de tandarts een gastles wil verzorgen\ngeeft aan dat hij van plan is om vrijwilligerswerk te gaan doen\nlegt uit waarom hij geschikt is als vrijwilliger\nvertelt wat hem leuk lijkt aan vrijwilligerswerk\nvertelt wat hem moeilijk lijkt aan vrijwilligerswerk\nvraagt om snelle reactie");
  const [presentatieText, setPresentatieText] = useState("passend onderwerp in onderwerpregel\nvermelding slotformule en voor- en achternaam onder e-mail\nalinea-indeling\nsamenhang\nlogische volgorde\npassend taalgebruik");
  const [inhoudMax, setInhoudMax] = useState(6);
  const [presentatieMax, setPresentatieMax] = useState(2);
  const [taalMax, setTaalMax] = useState(5);
  const [minWords, setMinWords] = useState(100);
  const [taalGroupsConfig, setTaalGroupsConfig] = useState(DEFAULT_TAAL_GROUPS_CONFIG);
  const [studentText, setStudentText] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [highlights, setHighlights] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeCategoryItem, setActiveCategoryItem] = useState(null);
  const [activeTaalGroup, setActiveTaalGroup] = useState(null);
  const [pendingHighlight, setPendingHighlight] = useState(null);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");
  const [hoveredItemId, setHoveredItemId] = useState(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);
  const [frozenTabs, setFrozenTabs] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmCheckAll, setConfirmCheckAll] = useState(null);
  const [taalTooShort, setTaalTooShort] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [generalNote, setGeneralNote] = useState("");

  const nextId = useRef(1);
  const scoresInitialized = useRef(false);
  const resumeData = useRef(null);
  const autoSaveTimer = useRef(null);
  const removedFlashTimer = useRef(null);
  const justSelectedTextRef = useRef(false);
  const latestGradeDataRef = useRef({});

  // Memos
  const taalCounts = useMemo(() => {
    const c = {}; highlights.forEach((h) => { if (h.taalGroup) { const k = h.categoryId + "::" + h.taalGroup; c[k] = (c[k] || 0) + 1; } }); return c;
  }, [highlights]);

  const itemHighlightCounts = useMemo(() => {
    const c = {}; highlights.forEach((h) => { if (h.itemId) c[h.itemId] = (c[h.itemId] || 0) + 1; }); return c;
  }, [highlights]);

  // Numbered items for non-taal categories (per category, 1-based)
  const itemNumbers = useMemo(() => {
    const map = {};
    categories.forEach(cat => {
      if ((catModes[cat.id] || "checkIsBad") !== "taalAuto") {
        cat.items.forEach((item, idx) => { map[item.id] = idx + 1; });
      }
    });
    return map;
  }, [categories, catModes]);

  const wordCount = useMemo(() => studentText.trim().split(/\s+/).filter(Boolean).length, [studentText]);
  const isTaalTooShort = taalTooShort !== null ? taalTooShort : wordCount < minWords;

  // Score initialization (modified to support resume)
  useEffect(() => {
    if (categories.length > 0 && !scoresInitialized.current) {
      const modes = {};
      categories.forEach((cat) => { modes[cat.id] = cat.mode; });
      setCatModes(modes);

      if (resumeData.current) {
        const rd = resumeData.current;
        setScores(rd.scores || {});
        setNotes(rd.notes || {});
        setHighlights(rd.highlights || []);
        const maxHId = rd.highlights && rd.highlights.length > 0 ? Math.max(...rd.highlights.map(h => h.id || 0)) : 0;
        nextId.current = Math.max(rd.nextIdCounter || 1, maxHId + 1);
        setTaalTooShort(rd.taalTooShort ?? null);
        resumeData.current = null;
      } else {
        const init = {};
        categories.forEach((cat) => { init[cat.id] = {}; cat.items.forEach((item) => { init[cat.id][item.id] = false; }); });
        setScores(init);
      }
      scoresInitialized.current = true;
    }
  }, [categories]);

  // Taal auto-score
  useEffect(() => {
    if (categories.length === 0 || !scoresInitialized.current) return;
    if (handwrittenMode) return; // scores are set manually in handwritten mode
    setScores((prev) => {
      const next = {};
      categories.forEach((cat) => {
        next[cat.id] = { ...(prev[cat.id] || {}) };
        if (catModes[cat.id] !== "taalAuto") return;
        const gi = {};
        cat.items.forEach((item) => { if (item.taalGroup) { if (!gi[item.taalGroup]) gi[item.taalGroup] = []; gi[item.taalGroup].push(item); } });
        Object.entries(gi).forEach(([gl, items]) => {
          const count = taalCounts[cat.id + "::" + gl] || 0;
          items.forEach((item) => {
            if (item.rangeMin === undefined) return;
            const rangeMax = item.rangeMax === null || item.rangeMax === undefined ? Infinity : item.rangeMax;
            next[cat.id][item.id] = count >= item.rangeMin && count <= rangeMax;
          });
        });
      });
      return next;
    });
  }, [taalCounts, categories, catModes, handwrittenMode]);

  // Auto-select newest model when entering setup view
  useEffect(() => {
    if (view === "setup" && savedModels.length > 0 && !pickerModelId) {
      const newest = savedModels.reduce((a, b) => new Date(a.savedAt) > new Date(b.savedAt) ? a : b);
      setPickerModelId(newest.id);
    }
  }, [view]); // eslint-disable-line

  // Auto-save during grading
  useEffect(() => {
    if (view !== "grading" || !currentGradeId) return;
    clearTimeout(autoSaveTimer.current);
    const capturedHighlights = highlights;
    const capturedScores = scores;
    const capturedNotes = notes;
    const capturedGeneralNote = generalNote;
    const capturedTaalTooShort = taalTooShort;
    const capturedNextId = nextId.current;
    const capturedHandwrittenMode = handwrittenMode;
    const capturedTotal = categories.reduce((s, c) => {
      const mode = catModes[c.id] || "checkIsBad";
      if (mode === "taalAuto" && (capturedTaalTooShort !== null ? capturedTaalTooShort : wordCount < minWords)) return s;
      let aftrek = 0;
      if (mode === "checkIsGood") { c.items.forEach((item) => { if (!capturedScores[c.id]?.[item.id]) aftrek += item.points; }); }
      else { c.items.forEach((item) => { if (capturedScores[c.id]?.[item.id]) aftrek += item.points; }); }
      return s + Math.max(0, c.maxScore - aftrek);
    }, 0);
    const capturedMax = categories.reduce((s, c) => s + c.maxScore, 0);

    autoSaveTimer.current = setTimeout(() => {
      setSavedGrades((prev) => {
        const idx = prev.findIndex((g) => g.id === currentGradeId);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], handwrittenMode: capturedHandwrittenMode, highlights: capturedHighlights, scores: capturedScores, notes: capturedNotes, generalNote: capturedGeneralNote, taalTooShort: capturedTaalTooShort ?? null, nextIdCounter: capturedNextId, savedAt: new Date().toISOString(), totalScore: capturedTotal, maxScore: capturedMax };
        return updated;
      });
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [highlights, scores, notes, generalNote, taalTooShort, handwrittenMode, view, currentGradeId]); // eslint-disable-line

  // Keep latest grade data in a ref so we can flush immediately on student switch
  useEffect(() => {
    if (view === "grading" && currentGradeId) {
      latestGradeDataRef.current = { handwrittenMode, highlights, scores, notes, generalNote, taalTooShort, nextIdCounter: nextId.current };
    }
  });

  // Score helpers
  const getCategoryScore = (cat) => {
    const mode = catModes[cat.id] || "checkIsBad";
    if (mode === "taalAuto" && isTaalTooShort) return 0;
    let aftrek = 0;
    if (mode === "checkIsGood") { cat.items.forEach((item) => { if (!scores[cat.id]?.[item.id]) aftrek += item.points; }); }
    else { cat.items.forEach((item) => { if (scores[cat.id]?.[item.id]) aftrek += item.points; }); }
    return Math.max(0, cat.maxScore - aftrek);
  };
  const getTotalScore = () => categories.reduce((s, c) => s + getCategoryScore(c), 0);
  const getMaxTotal = () => categories.reduce((s, c) => s + c.maxScore, 0);

  const compactSummary = useMemo(() => {
    if (categories.length === 0) return "";
    const ABBREV = { "Formuleringsfouten": "F", "Spelfouten": "S", "Interpunctiefouten": "I" };
    const lines = [];
    categories.forEach(cat => {
      const mode = catModes[cat.id] || "checkIsBad";
      const score = getCategoryScore(cat);
      // Short label: use name, but strip "Presentatie/" prefix if present
      const label = mode === "taalAuto" ? "Taal" : cat.name.includes("/") ? cat.name.split("/").pop().trim().replace(/^./, c => c.toUpperCase()) : cat.name;
      lines.push(label + " " + score + (mode === "taalAuto" && isTaalTooShort ? " (te weinig woorden)" : ""));
      if (mode === "checkIsGood") {
        cat.items.forEach(item => { if (!scores[cat.id]?.[item.id]) lines.push("-" + item.text); });
      } else if (mode === "taalAuto") {
        taalGroupsConfig.forEach(group => {
          const abbr = ABBREV[group.name] || group.name[0];
          const count = handwrittenMode ? null : (taalCounts[cat.id + "::" + group.name] || 0);
          const checkedItem = cat.items.filter(i => i.taalGroup === group.name).find(i => scores[cat.id]?.[i.id]);
          const aftrek = checkedItem ? checkedItem.points : 0;
          lines.push(abbr + (count !== null ? " (" + count + ")" : "") + " " + (aftrek > 0 ? "-" + aftrek : "0"));
        });
      } else {
        cat.items.forEach(item => { if (scores[cat.id]?.[item.id]) lines.push("-" + item.text); });
      }
      lines.push("");
    });
    return lines.join("\n").trimEnd();
  }, [categories, catModes, scores, taalCounts, taalGroupsConfig, handwrittenMode, isTaalTooShort]);

  // ==================== PERSISTENCE ACTIONS ====================

  const saveCurrentModel = (name) => {
    const id = currentModelId || genId();
    const modelName = (name || currentModelName || "Naamloos model").trim();
    const model = { id, name: modelName, inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax, minWords, taalGroupsConfig, savedAt: new Date().toISOString() };
    setSavedModels((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx >= 0) { const next = [...prev]; next[idx] = model; return next; }
      return [...prev, model];
    });
    setCurrentModelId(id);
    setCurrentModelName(modelName);
    setModelDirty(false);
  };

  const navToDashboard = () => {
    if (modelDirty && view === "model") {
      if (!window.confirm("Je hebt niet-opgeslagen wijzigingen in het correctiemodel. Toch terug naar het dashboard?")) return;
    }
    setView("home");
  };

  const resetModelState = () => {
    setCurrentModelId(null);
    setCurrentModelName("");
    setInhoudText("");
    setPresentatieText("");
    setInhoudMax(6);
    setPresentatieMax(2);
    setTaalMax(5);
    setMinWords(100);
    setTaalGroupsConfig(DEFAULT_TAAL_GROUPS_CONFIG);
    setPickerModelId("");
    setModelDirty(false);
  };

  const loadModelIntoState = (model) => {
    setInhoudText(model.inhoudText);
    setPresentatieText(model.presentatieText);
    setInhoudMax(model.inhoudMax);
    setPresentatieMax(model.presentatieMax);
    setTaalMax(model.taalMax);
    setMinWords(model.minWords ?? 100);
    setTaalGroupsConfig(model.taalGroupsConfig || DEFAULT_TAAL_GROUPS_CONFIG);
    setCurrentModelName(model.name);
    setCurrentModelId(model.id);
    setModelDirty(false);
  };

  const deleteModel = (id) => {
    setSavedModels((prev) => prev.filter((m) => m.id !== id));
    if (currentModelId === id) { setCurrentModelId(null); setCurrentModelName(""); }
    setConfirmDeleteModelId(null);
  };

  const deleteGrade = (id) => {
    setSavedGrades((prev) => prev.filter((g) => g.id !== id));
    setConfirmDeleteGradeId(null);
  };

  const addClass = () => {
    if (!newClassName.trim()) return;
    const cls = { id: genId(), name: newClassName.trim(), students: [] };
    setSavedClasses((prev) => [...prev, cls]);
    setSelectedClassId(cls.id);
    setNewClassName("");
  };

  const deleteClass = (id) => {
    setSavedClasses((prev) => prev.filter((c) => c.id !== id));
    if (selectedClassId === id) setSelectedClassId(null);
    setConfirmDeleteClassId(null);
  };

  const addStudent = (classId) => {
    if (!newStudentName.trim()) return;
    const student = { id: genId(), name: newStudentName.trim() };
    setSavedClasses((prev) => prev.map((c) => c.id === classId ? { ...c, students: [...(c.students || []), student] } : c));
    setNewStudentName("");
  };

  const addStudentsBulk = (classId) => {
    const names = bulkStudentInput.split("\n").map(n => n.trim()).filter(Boolean);
    if (!names.length) return;
    const students = names.map(name => ({ id: genId(), name }));
    setSavedClasses(prev => prev.map(c => c.id === classId ? { ...c, students: [...(c.students || []), ...students] } : c));
    setBulkStudentInput(""); setShowBulkInput(false);
  };

  const deleteStudent = (classId, studentId) => {
    setSavedClasses((prev) => prev.map((c) => c.id === classId ? { ...c, students: (c.students || []).filter((s) => s.id !== studentId) } : c));
  };

  const handleStartGrading = (overrideStudentText) => {
    const text = overrideStudentText ?? studentText;
    setError("");
    if (!text.trim()) { setError("Vul eerst de leerlingtekst in."); return; }
    const cats = buildCategoriesFromEditor(inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax, taalGroupsConfig);
    const gradeId = genId();
    const newGrade = {
      id: gradeId, modelId: currentModelId, modelName: currentModelName,
      inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax,
      studentId: currentStudentId, studentName, studentClass, studentText: text,
      highlights: [], scores: {}, notes: {}, generalNote: "", taalTooShort: null,
      nextIdCounter: 1, savedAt: new Date().toISOString(), isComplete: false,
      totalScore: 0, maxScore: cats.reduce((s, c) => s + c.maxScore, 0),
    };
    setSavedGrades((prev) => [...prev, newGrade]);
    setCurrentGradeId(gradeId);
    setStudentText(text);
    nextId.current = 1;
    scoresInitialized.current = false;
    setHighlights([]); setUndoStack([]); setActiveCategory(null); setActiveCategoryItem(null);
    setActiveTaalGroup(null); setPendingHighlight(null); setShowResults(false);
    setSelectedHighlightId(null); setFrozenTabs(null); setTaalTooShort(null);
    setScores({}); setNotes({}); setGeneralNote("");
    setCategories(cats);
    setInlineTextMode(false); setInlineTextInput(""); setHandwrittenMode(false);
    const startClass = savedClasses.find(c => (c.students || []).some(s => s.id === currentStudentId));
    if (startClass && !sessionClassIds.includes(startClass.id)) setGradingClassId("");
    else setGradingClassId(startClass?.id || "");
    setView("grading");
  };

  const handleStartHandwritten = () => {
    const cats = buildCategoriesFromEditor(inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax, taalGroupsConfig);
    const gradeId = genId();
    const newGrade = {
      id: gradeId, modelId: currentModelId, modelName: currentModelName,
      inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax,
      studentId: currentStudentId, studentName, studentClass, studentText: "",
      handwrittenMode: true,
      highlights: [], scores: {}, notes: {}, generalNote: "", taalTooShort: null,
      nextIdCounter: 1, savedAt: new Date().toISOString(), isComplete: false,
      totalScore: 0, maxScore: cats.reduce((s, c) => s + c.maxScore, 0),
    };
    setSavedGrades((prev) => [...prev, newGrade]);
    setCurrentGradeId(gradeId);
    setStudentText("");
    setHandwrittenMode(true);
    nextId.current = 1;
    scoresInitialized.current = false;
    setHighlights([]); setUndoStack([]); setActiveCategory(null); setActiveCategoryItem(null);
    setActiveTaalGroup(null); setPendingHighlight(null); setShowResults(false);
    setSelectedHighlightId(null); setFrozenTabs(null); setTaalTooShort(null);
    setScores({}); setNotes({}); setGeneralNote("");
    setCategories(cats);
    setInlineTextMode(false); setInlineTextInput("");
    const startClass = savedClasses.find(c => (c.students || []).some(s => s.id === currentStudentId));
    if (startClass && !sessionClassIds.includes(startClass.id)) setGradingClassId("");
    else setGradingClassId(startClass?.id || "");
    setView("grading");
  };

  const handleImagePaste = useCallback(async (e) => {
    if (handwrittenMode) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(it => it.type.startsWith("image/"));
    if (!imageItem) return; // no image, let normal paste happen
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setOcrError(null);
    setOcrLoading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR mislukt");
      setInlineTextInput(prev => prev + (prev ? "\n" : "") + (data.text || ""));
    } catch (err) {
      setOcrError(err.message || "OCR mislukt. Probeer opnieuw.");
    } finally {
      setOcrLoading(false);
    }
  }, [handwrittenMode]);

  const handleStartSession = (modelId, classIds) => {
    const model = savedModels.find(m => m.id === modelId);
    if (!model) return;
    loadModelIntoState(model);
    setSessionClassIds(classIds);
    setGradingClassId(classIds.length === 1 ? classIds[0] : "");
    // Find first student across selected classes
    let firstStudent = null, firstClass = null;
    for (const cid of classIds) {
      const cls = savedClasses.find(c => c.id === cid);
      if (cls && (cls.students || []).length > 0) { firstStudent = cls.students[0]; firstClass = cls; break; }
    }
    const cats = buildCategoriesFromEditor(model.inhoudText, model.presentatieText, model.inhoudMax, model.presentatieMax, model.taalMax, model.taalGroupsConfig);
    setHighlights([]); setUndoStack([]); setScores({}); setNotes({});
    setActiveCategory(null); setActiveCategoryItem(null); setActiveTaalGroup(null);
    setPendingHighlight(null); setShowResults(false); setSelectedHighlightId(null);
    setFrozenTabs(null); setTaalTooShort(null); setConfirmReset(false);
    scoresInitialized.current = false;
    setCategories(cats);
    if (firstStudent) {
      setStudentName(firstStudent.name);
      setStudentClass(firstClass?.name || "");
      setCurrentStudentId(firstStudent.id);
      let freshGrades2;
      try { freshGrades2 = JSON.parse(localStorage.getItem("nakijk_grades") || "[]"); } catch { freshGrades2 = savedGrades; }
      const existingGrade = [...freshGrades2]
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
        .find(g => g.studentId === firstStudent.id && g.modelId === model.id && !g.isComplete);
      if (existingGrade) {
        handleResumeGrade(existingGrade);
        return;
      }
      setStudentText(""); setCurrentGradeId(null);
      setInlineTextMode(true); setInlineTextInput("");
    } else {
      setStudentName(""); setStudentClass(""); setCurrentStudentId(null);
      setStudentText(""); setCurrentGradeId(null);
      setInlineTextMode(false); setInlineTextInput("");
    }
    setView("grading");
  };

  const handleResumeGrade = (grade) => {
    const model = savedModels.find((m) => m.id === grade.modelId);
    const mInhoud = model?.inhoudText ?? grade.inhoudText ?? inhoudText;
    const mPres = model?.presentatieText ?? grade.presentatieText ?? presentatieText;
    const mIM = model?.inhoudMax ?? grade.inhoudMax ?? inhoudMax;
    const mPM = model?.presentatieMax ?? grade.presentatieMax ?? presentatieMax;
    const mTM = model?.taalMax ?? grade.taalMax ?? taalMax;
    const mMinWords = model?.minWords ?? grade.minWords ?? 100;
    const mTaalGroupsConfig = model?.taalGroupsConfig || DEFAULT_TAAL_GROUPS_CONFIG;

    setInhoudText(mInhoud); setPresentatieText(mPres);
    setInhoudMax(mIM); setPresentatieMax(mPM); setTaalMax(mTM); setMinWords(mMinWords);
    setTaalGroupsConfig(mTaalGroupsConfig);
    setCurrentModelName(model?.name || grade.modelName || "");
    setCurrentModelId(grade.modelId || null);
    setCurrentStudentId(grade.studentId || null);
    setStudentName(grade.studentName || "");
    setStudentClass(grade.studentClass || "");
    setStudentText(grade.studentText || "");
    setGeneralNote(grade.generalNote || "");
    setHandwrittenMode(grade.handwrittenMode ?? false);

    setActiveCategory(null); setActiveCategoryItem(null); setActiveTaalGroup(null);
    setPendingHighlight(null); setShowResults(false); setSelectedHighlightId(null);
    setFrozenTabs(null); setUndoStack([]); setConfirmReset(false);

    resumeData.current = {
      scores: grade.scores || {}, notes: grade.notes || {},
      highlights: grade.highlights || [], nextIdCounter: grade.nextIdCounter || 1,
      taalTooShort: grade.taalTooShort ?? null,
    };
    const cats = buildCategoriesFromEditor(mInhoud, mPres, mIM, mPM, mTM, mTaalGroupsConfig);
    scoresInitialized.current = false;
    setCurrentGradeId(grade.id);
    setCategories(cats);
    setInlineTextMode(false); setInlineTextInput("");
    const resumeClass = savedClasses.find(c => (c.students || []).some(s => s.id === grade.studentId));
    setGradingClassId(resumeClass?.id || "");
    // Restore session classes if not set
    if (sessionClassIds.length === 0 && resumeClass) setSessionClassIds([resumeClass.id]);
    setView("grading");
  };

  const flushSave = () => {
    if (!currentGradeId) return;
    clearTimeout(autoSaveTimer.current);
    const savedId = currentGradeId;
    const savedData = { handwrittenMode, highlights, scores, notes, generalNote, taalTooShort: taalTooShort ?? null, nextIdCounter: nextId.current };
    setSavedGrades((prev) => {
      const idx = prev.findIndex((g) => g.id === savedId);
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...savedData, savedAt: new Date().toISOString() };
      return updated;
    });
  };

  const switchStudent = (studentId) => {
    if (!studentId) return;
    flushSave();
    const cls = savedClasses.find(c => (c.students || []).some(s => s.id === studentId));
    const student = cls?.students.find(s => s.id === studentId);
    if (!student) return;
    // Read grades directly from localStorage to bypass any stale React state
    let freshGrades;
    try { freshGrades = JSON.parse(localStorage.getItem("nakijk_grades") || "[]"); } catch { freshGrades = savedGrades; }
    const existingGrade = [...freshGrades]
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .find(g => g.studentId === studentId && g.modelId === currentModelId && !g.isComplete);
    if (existingGrade) {
      handleResumeGrade(existingGrade);
    } else {
      clearTimeout(autoSaveTimer.current);
      setHighlights([]); setUndoStack([]); setActiveCategory(null); setActiveCategoryItem(null);
      setActiveTaalGroup(null); setPendingHighlight(null); setShowResults(false);
      setSelectedHighlightId(null); setFrozenTabs(null); setTaalTooShort(null);
      setScores({}); setNotes({}); setGeneralNote(""); setCurrentGradeId(null);
      setStudentName(student.name);
      setStudentClass(cls?.name || "");
      setCurrentStudentId(studentId);
      setStudentText("");
      setHandwrittenMode(false);
      setInlineTextMode(true); setInlineTextInput("");
    }
  };

  const switchModel = (modelId) => {
    if (!modelId || modelId === currentModelId) return;
    const model = savedModels.find(m => m.id === modelId);
    if (!model) return;
    loadModelIntoState(model);
    setView("model");
  };

  // ==================== GRADING ACTIONS ====================

  const addHighlightDirect = useCallback((start, end, itemId, itemLabel, taalGroup, cat) => {
    const id = nextId.current++;
    let displayColor = cat.color;
    if (taalGroup && TAAL_SUB_COLORS[taalGroup]) displayColor = TAAL_SUB_COLORS[taalGroup];
    setHighlights((prev) => [...prev, { id, start, end, categoryId: cat.id, categoryName: cat.name, color: cat.color, displayColor, itemId, itemLabel: itemLabel || cat.name, taalGroup }]);
    setUndoStack([]);
    if (itemId && !taalGroup) { setScores((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], [itemId]: true } })); }
  }, []);

  const handleTextSelection = useCallback((start, end) => {
    if (activeCategory && (activeCategoryItem || activeTaalGroup)) {
      const itemObj = activeCategoryItem ? (categories.find((c) => c.id === activeCategory.id) || { items: [] }).items.find((i) => i.id === activeCategoryItem) : null;
      addHighlightDirect(start, end, activeCategoryItem, activeTaalGroup || (itemObj ? itemObj.text : null), activeTaalGroup, activeCategory);
      return true;
    }
    setSelectedHighlightId(null); setFrozenTabs(null);
    justSelectedTextRef.current = true;
    setTimeout(() => { justSelectedTextRef.current = false; }, 0);
    setPendingHighlight({ start, end }); return false;
  }, [activeCategory, activeCategoryItem, activeTaalGroup, categories, addHighlightDirect]);

  const handleItemClick = (cat, itemId, itemLabel, taalGroup) => {
    if (pendingHighlight) { addHighlightDirect(pendingHighlight.start, pendingHighlight.end, itemId, taalGroup || itemLabel, taalGroup, cat); setPendingHighlight(null); return; }
    const isActive = activeCategory?.id === cat.id;
    if (taalGroup) { setActiveCategory(cat); setActiveTaalGroup(activeTaalGroup === taalGroup && isActive ? null : taalGroup); setActiveCategoryItem(null); }
    else { setActiveCategory(cat); setActiveCategoryItem(activeCategoryItem === itemId && isActive ? null : itemId); setActiveTaalGroup(null); }
  };

  const toggleItem = (catId, itemId) => {
    const cat = categories.find((c) => c.id === catId);
    const item = cat && cat.items.find((i) => i.id === itemId);
    if (item && item.taalGroup && catModes[catId] === "taalAuto") return;
    if (pendingHighlight) { addHighlightDirect(pendingHighlight.start, pendingHighlight.end, itemId, item?.text, null, cat); setPendingHighlight(null); return; }
    const wasChecked = scores[catId]?.[itemId];
    if (wasChecked && catModes[catId] === "checkIsGood") {
      const rm = highlights.filter((h) => h.itemId === itemId);
      if (rm.length) setUndoStack((us) => [...us, ...rm]);
      setHighlights((prev) => prev.filter((h) => h.itemId !== itemId));
      if (selectedHighlightId && highlights.find((h) => h.id === selectedHighlightId)?.itemId === itemId) selectHighlight(null);
    }
    setScores((prev) => ({ ...prev, [catId]: { ...prev[catId], [itemId]: !prev[catId]?.[itemId] } }));
  };

  const checkAll = (catId, value) => {
    const cat = categories.find((c) => c.id === catId); if (!cat) return;
    if (!value) {
      const itemIds = new Set(cat.items.filter((i) => !i.taalGroup).map((i) => i.id));
      const rm = highlights.filter((h) => h.itemId && itemIds.has(h.itemId));
      if (rm.length) setUndoStack((us) => [...us, ...rm]);
      setHighlights((prev) => prev.filter((h) => !(h.itemId && itemIds.has(h.itemId))));
      selectHighlight(null);
    }
    setScores((prev) => { const next = { ...prev, [catId]: { ...prev[catId] } }; cat.items.forEach((item) => { if (!item.taalGroup) next[catId][item.id] = value; }); return next; });
  };

  const handleRemoveHighlight = useCallback((highlightId) => {
    const r = highlights.find((h) => h.id === highlightId);
    if (r) {
      setUndoStack((us) => [...us, r]);
      // If this was the last highlight for a non-taal item, uncheck it
      if (r.itemId && !r.taalGroup) {
        const remaining = highlights.filter(h => h.id !== highlightId && h.itemId === r.itemId);
        if (remaining.length === 0) {
          setScores(prev => ({ ...prev, [r.categoryId]: { ...prev[r.categoryId], [r.itemId]: false } }));
        }
      }
    }
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
  }, [highlights]); // eslint-disable-line

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setHighlights((prev) => [...prev, undoStack[undoStack.length - 1]]);
  };

  const selectHighlight = useCallback((id) => {
    if (id === null) { setSelectedHighlightId(null); setFrozenTabs(null); return; }
    setSelectedHighlightId(id);
    setFrozenTabs((prev) => {
      if (prev) return prev;
      const h = highlights.find((x) => x.id === id); if (!h) return null;
      return highlights.filter((x) => x.start < h.end && x.end > h.start).map((x) => x.id);
    });
  }, [highlights]);

  const resetGrading = () => {
    clearTimeout(autoSaveTimer.current);
    setHighlights([]); setUndoStack([]); setActiveCategory(null); setActiveCategoryItem(null); setActiveTaalGroup(null); setPendingHighlight(null); setShowResults(false); setConfirmReset(false); setSelectedHighlightId(null); setFrozenTabs(null); setTaalTooShort(null);
    const init = {}; categories.forEach((cat) => { init[cat.id] = {}; cat.items.forEach((item) => { init[cat.id][item.id] = false; }); });
    setScores(init); setNotes({}); setGeneralNote("");
  };

  const openEditor = () => {
    const ih = categories.find((c) => catModes[c.id] === "checkIsGood");
    const pr = categories.find((c) => catModes[c.id] === "checkIsBad");
    if (ih) setInhoudText(ih.items.map((i) => i.text).join("\n"));
    if (pr) setPresentatieText(pr.items.map((i) => i.text).join("\n"));
    setShowEditor(true);
  };

  const applyEditor = () => {
    const cats = buildCategoriesFromEditor(inhoudText, presentatieText, inhoudMax, presentatieMax, taalMax, taalGroupsConfig);
    const newScores = {};
    cats.forEach((cat) => {
      newScores[cat.id] = {};
      const oldCat = categories.find((c) => c.name === cat.name);
      cat.items.forEach((item) => {
        if (oldCat) { const oldItem = oldCat.items.find((oi) => oi.text === item.text); newScores[cat.id][item.id] = oldItem ? (scores[oldCat.id]?.[oldItem.id] || false) : false; }
        else { newScores[cat.id][item.id] = false; }
      });
    });
    const allItemIds = new Set(cats.flatMap((c) => c.items.map((i) => i.id)));
    setHighlights((prev) => prev.filter((h) => !h.itemId || allItemIds.has(h.itemId) || h.taalGroup));
    setCategories(cats); setScores(newScores);
    const modes = {}; cats.forEach((c) => { modes[c.id] = c.mode; }); setCatModes(modes);
    setShowEditor(false);
  };

  const exportClassCSV = (cls, modelId) => {
    const rows = [["Naam", "Score", "Max", "Status"]];
    (cls.students || []).forEach(student => {
      const grade = [...savedGrades].sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt))
        .find(g => g.studentId === student.id && g.modelId === modelId);
      rows.push([
        student.name,
        grade ? grade.totalScore : "",
        grade ? grade.maxScore : "",
        grade ? (grade.isComplete ? "Klaar" : "Bezig") : "Niet gestart"
      ]);
    });
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = cls.name + "_scores.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllData = () => {
    const data = { models: savedModels, classes: savedClasses, grades: savedGrades, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "nakijktool_data_" + new Date().toISOString().slice(0,10) + ".json"; a.click();
    URL.revokeObjectURL(url);
  };

  const importAllData = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.models && !data.classes && !data.grades) throw new Error("Ongeldig bestand");
        if (data.models) setSavedModels(data.models);
        if (data.classes) setSavedClasses(data.classes);
        if (data.grades) setSavedGrades(data.grades);
        alert("✓ Data succesvol geïmporteerd!");
      } catch { alert("Kon het bestand niet lezen. Zorg dat het een geldig nakijktool exportbestand is."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const buildExportText = () => {
    let out = "NAKIJKRESULTAAT"; if (studentName) out += " \u2014 " + studentName; if (studentClass) out += " (" + studentClass + ")";
    out += "\n" + "=".repeat(40) + "\n\n";
    categories.forEach((cat) => {
      const score = getCategoryScore(cat); const mode = catModes[cat.id];
      out += cat.name + ": " + score + "/" + cat.maxScore + "\n";
      cat.items.forEach((item) => {
        const checked = scores[cat.id]?.[item.id]; const isGood = mode === "checkIsGood" ? checked : !checked;
        out += (isGood ? "  \u2713 " : "  \u2717 ") + item.text; if (!isGood) out += " (\u2212" + item.points + ")";
        const count = item.taalGroup ? (taalCounts[cat.id + "::" + item.taalGroup] || 0) : (itemHighlightCounts[item.id] || 0);
        if (count > 0) out += " [" + count + "\u00D7]"; out += "\n";
      });
      if (notes[cat.id]) out += "  Opmerking: " + notes[cat.id] + "\n"; out += "\n";
    });
    if (generalNote.trim()) out += "Overige opmerkingen: " + generalNote + "\n\n";
    out += "TOTAAL: " + getTotalScore() + "/" + getMaxTotal() + "\n";
    return out;
  };

  const [allDoneFlash, setAllDoneFlash] = useState(false);
  const [removedFlash, setRemovedFlash] = useState(null);

  const currentIsComplete = savedGrades.find(g => g.id === currentGradeId)?.isComplete ?? false;

  const handleToggleDone = () => {
    if (currentIsComplete) {
      if (currentGradeId) {
        setSavedGrades(prev => prev.map(g => g.id === currentGradeId ? { ...g, isComplete: false } : g));
      }
      return;
    }
    handleMarkDone();
  };

  const handleMarkDone = () => {
    if (currentGradeId) {
      setSavedGrades(prev => prev.map(g => g.id === currentGradeId ? { ...g, isComplete: true } : g));
    }
    const sessionClasses = sessionClassIds.length > 0
      ? savedClasses.filter(c => sessionClassIds.includes(c.id))
      : savedClasses;
    const allStudents = sessionClasses.flatMap(c => c.students || []);
    const currentIdx = allStudents.findIndex(s => s.id === currentStudentId);
    // Look for next unfinished student — treat current as done already
    const updatedGrades = savedGrades.map(g => g.id === currentGradeId ? { ...g, isComplete: true } : g);
    const nextStudent = allStudents.slice(currentIdx + 1).find(s => {
      const g = [...updatedGrades].sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt))
        .find(gr => gr.studentId === s.id && gr.modelId === currentModelId);
      return !g || !g.isComplete;
    });
    if (nextStudent) {
      switchStudent(nextStudent.id);
    } else {
      // Check if truly all done (including current)
      const allDone = allStudents.every(s => {
        const g = updatedGrades.find(gr => gr.studentId === s.id && gr.modelId === currentModelId && gr.isComplete);
        return !!g;
      });
      if (allDone) setAllDoneFlash(true);
    }
  };

  const handleCopy = async () => {
    const t = buildExportText();
    try { await navigator.clipboard.writeText(t); } catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    if (currentGradeId) { setSavedGrades((prev) => prev.map((g) => g.id === currentGradeId ? { ...g, isComplete: true } : g)); }
  };

  // ==================== STYLES ====================
  const sty = {
    label: { display: "block", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "#1a1a2e", marginBottom: "10px" },
    card: { background: "#fff", borderRadius: "12px", padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", marginBottom: "16px" },
    inputStyle: { width: "100%", border: "1px solid #ddd", borderRadius: "10px", padding: "12px 16px", fontSize: "15px", outline: "none", boxSizing: "border-box" },
    pageWrapper: { minHeight: "100vh", background: "linear-gradient(135deg, #f8f6f3 0%, #e8e4de 100%)", fontFamily: "'Segoe UI', -apple-system, sans-serif" },
    pageInner: { maxWidth: "900px", margin: "0 auto", padding: "64px 20px 32px" },
    header: { textAlign: "center", marginBottom: "28px" },
    badge: { display: "inline-flex", alignItems: "center", gap: "8px", background: "#1a1a2e", color: "#f8f6f3", padding: "7px 18px", borderRadius: "40px", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: "600", marginBottom: "16px" },
    bigBtn: { width: "100%", padding: "14px", fontSize: "15px", fontWeight: "600", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer" },
    backBtn: { position: "fixed", top: "16px", left: "16px", zIndex: 200, background: "#fff", border: "1px solid #ddd", borderRadius: "20px", cursor: "pointer", color: "#1a1a2e", fontSize: "13px", fontWeight: "600", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" },
    smallBtn: { padding: "6px 14px", fontSize: "12px", fontWeight: "600", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", background: "#fff", color: "#444" },
    dangerBtn: { padding: "6px 14px", fontSize: "12px", fontWeight: "600", border: "1px solid #FECACA", borderRadius: "8px", cursor: "pointer", background: "#FEF2F2", color: "#991B1B" },
  };

  const h1Style = { fontSize: "clamp(28px, 5vw, 42px)", fontWeight: "300", color: "#1a1a2e", lineHeight: "1.2", margin: "0 0 12px", fontFamily: "'Georgia', serif" };

  // ==================== VIEW: HOME ====================
  if (view === "home") {
    const sortedGrades = [...savedGrades].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    const inProgress = sortedGrades.filter(g => !g.isComplete).slice(0, 6);
    const completed = sortedGrades.filter(g => g.isComplete).slice(0, 5);
    const totalStudents = savedClasses.reduce((s, c) => s + (c.students || []).length, 0);

    return (
      <div style={sty.pageWrapper}>
        <div style={{ position: "fixed", top: "16px", right: "16px", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" }}>
          <div style={{ fontSize: "10px", color: "#aaa", textAlign: "right", maxWidth: "220px", lineHeight: "1.3" }}>Correctiemodellen, klassen &amp; nakijkresultaten</div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={exportAllData} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "20px", cursor: "pointer", color: "#1a1a2e", fontSize: "12px", fontWeight: "600", padding: "7px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}>{"\u2193"} Opslaan</button>
            <label style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "20px", cursor: "pointer", color: "#1a1a2e", fontSize: "12px", fontWeight: "600", padding: "7px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.10)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {"\u2191"} Openen
              <input type="file" accept=".json" onChange={importAllData} style={{ display: "none" }} />
            </label>
          </div>
        </div>
        <div style={sty.pageInner}>
          <div style={sty.header}>
            <h1 style={h1Style}>Dashboard</h1>
            <p style={{ color: "#666", fontSize: "16px", maxWidth: "520px", margin: "0 auto" }}>Nakijken, correctiemodellen en klassen beheren.</p>
          </div>

          {inProgress.length > 0 && (
            <div style={sty.card}>
              <label style={sty.label}>Verder gaan</label>
              {inProgress.map((grade) => (
                <div key={grade.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "10px", background: "#f8f6f3", marginBottom: "6px", cursor: "pointer" }}
                  onClick={() => handleResumeGrade(grade)}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>{"\u25B6"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {grade.studentName || "Onbekende leerling"}
                      {grade.studentClass && <span style={{ marginLeft: "8px", fontSize: "12px", color: "#888", fontWeight: "400" }}>{grade.studentClass}</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{grade.modelName || "Geen model"} &middot; {timeAgo(grade.savedAt)}</div>
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "#1a1a2e", flexShrink: 0 }}>{grade.totalScore}/{grade.maxScore}</div>
                  {confirmDeleteGradeId === grade.id ? (
                    <div style={{ display: "flex", gap: "4px" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => deleteGrade(grade.id)} style={{ ...sty.dangerBtn, padding: "4px 10px" }}>Ja</button>
                      <button onClick={() => setConfirmDeleteGradeId(null)} style={{ ...sty.smallBtn, padding: "4px 10px" }}>Nee</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteGradeId(grade.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}
                      onMouseEnter={e => e.target.style.color = "#EF4444"}
                      onMouseLeave={e => e.target.style.color = "#ccc"}>{"\u2715"}</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div style={{ ...sty.card, marginBottom: 0, padding: "24px" }}>
              <label style={sty.label}>Correctiemodellen</label>
              <div style={{ fontSize: "32px", fontWeight: "200", color: "#1a1a2e", marginBottom: "14px" }}>{savedModels.length}</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setView("manage_models")} style={{ ...sty.smallBtn, flex: 1 }}>Beheren</button>
                <button onClick={() => { resetModelState(); setView("model"); }}
                  style={{ ...sty.smallBtn, flex: 1, background: "#1a1a2e", color: "#fff", border: "none" }}>+ Nieuw</button>
              </div>
            </div>
            <div style={{ ...sty.card, marginBottom: 0, padding: "24px" }}>
              <label style={sty.label}>Klassen & Leerlingen</label>
              <div style={{ fontSize: "32px", fontWeight: "200", color: "#1a1a2e", marginBottom: "2px" }}>{savedClasses.length}</div>
              <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "14px" }}>{totalStudents} leerlingen</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setView("manage_classes")} style={{ ...sty.smallBtn, flex: 1 }}>Beheren</button>
                <button onClick={() => { setView("overview"); }}
                  style={{ ...sty.smallBtn, flex: 1, background: "#1a1a2e", color: "#fff", border: "none" }}>Overzicht</button>
              </div>
            </div>
          </div>

          {(() => {
            const hasModels = savedModels.length > 0;
            const hasClassesWithStudents = savedClasses.some(c => (c.students || []).length > 0);
            const canStartSession = hasModels && hasClassesWithStudents;
            return (
              <button onClick={() => canStartSession && setView("setup")}
                style={{ ...sty.bigBtn, opacity: canStartSession ? 1 : 0.5, cursor: canStartSession ? "pointer" : "default", background: "#1a1a2e" }}
                onMouseEnter={e => { if (canStartSession) e.currentTarget.style.background = "#2d2d4e"; }}
                onMouseLeave={e => { if (canStartSession) e.currentTarget.style.background = "#1a1a2e"; }}>
                {canStartSession ? "Start met nakijken \u2192" : (savedModels.length === 0 ? "Voeg eerst een correctiemodel toe" : "Voeg leerlingen toe aan een klas om te starten")}
              </button>
            );
          })()}

          {completed.length > 0 && (
            <div style={{ ...sty.card, marginTop: "24px" }}>
              <label style={sty.label}>Klaar met nakijken</label>
              {completed.map((grade) => (
                <div key={grade.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 8px", borderRadius: "8px", marginBottom: "2px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "13px", fontWeight: "500", color: "#333" }}>{grade.studentName || "Onbekend"}</span>
                    {grade.studentClass && <span style={{ marginLeft: "6px", fontSize: "12px", color: "#aaa" }}>{grade.studentClass}</span>}
                    <span style={{ marginLeft: "8px", fontSize: "11px", color: "#ccc" }}>{formatDate(grade.savedAt)}</span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#10B981", flexShrink: 0 }}>{grade.totalScore}/{grade.maxScore}</div>
                  <button onClick={() => handleResumeGrade(grade)} style={{ ...sty.smallBtn, padding: "4px 10px", fontSize: "11px" }}>Openen</button>
                  {confirmDeleteGradeId === grade.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "11px", color: "#666", whiteSpace: "nowrap" }}>Verwijderen?</span>
                      <button onClick={() => deleteGrade(grade.id)} style={{ ...sty.dangerBtn, padding: "3px 8px", fontSize: "11px" }}>Ja</button>
                      <button onClick={() => setConfirmDeleteGradeId(null)} style={{ ...sty.smallBtn, padding: "3px 8px", fontSize: "11px" }}>Nee</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteGradeId(grade.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: "14px" }}
                      onMouseEnter={e => e.target.style.color = "#EF4444"} onMouseLeave={e => e.target.style.color = "#ddd"}>{"\u2715"}</button>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    );
  }

  // ==================== VIEW: MANAGE MODELS ====================
  if (view === "manage_models") {
    return (
      <div style={sty.pageWrapper}>
        <div style={sty.pageInner}>
          <button style={sty.backBtn} onClick={navToDashboard}>{"\u2190"} Dashboard</button>
          <div style={sty.header}>
            <h1 style={{ ...h1Style, fontSize: "clamp(24px, 4vw, 36px)" }}>Correctiemodellen</h1>
          </div>

          <div style={sty.card}>
            {savedModels.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#bbb" }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>&#128203;</div>
                <p style={{ margin: 0 }}>Nog geen opgeslagen modellen.</p>
              </div>
            ) : savedModels.map((model) => {
              const inUse = savedGrades.some(g => g.modelId === model.id);
              const inUseCount = savedGrades.filter(g => g.modelId === model.id).length;
              return (
              <div key={model.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: "1px solid #eee", marginBottom: "6px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a2e" }}>{model.name}</div>
                    {inUse && <span style={{ fontSize: "10px", background: "#DBEAFE", color: "#1E40AF", padding: "1px 7px", borderRadius: "8px", fontWeight: "600" }}>{inUseCount} resultaat{inUseCount !== 1 ? "en" : ""}</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px" }}>
                    {model.inhoudText.split("\n").filter(l => l.trim()).length} inhoud-items &middot;&nbsp;
                    {model.presentatieText.split("\n").filter(l => l.trim()).length} presentatie-items &middot;&nbsp;
                    max {(model.inhoudMax || 0) + (model.presentatieMax || 0) + (model.taalMax || 0)} pt
                    {model.savedAt ? " \u00b7 " + formatDate(model.savedAt) : ""}
                  </div>
                </div>
                {confirmDeleteModelId === model.id ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#991B1B" }}>Verwijderen?</span>
                    <button onClick={() => deleteModel(model.id)} style={sty.dangerBtn}>Ja</button>
                    <button onClick={() => setConfirmDeleteModelId(null)} style={sty.smallBtn}>Nee</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button onClick={() => { loadModelIntoState(model); setView("model"); }} style={sty.smallBtn}>Bewerken</button>
                    {inUse ? (
                      <span title={"Dit model is gekoppeld aan " + inUseCount + " nakijkresultaat" + (inUseCount !== 1 ? "en" : "") + " en kan niet worden verwijderd."}
                        style={{ ...sty.dangerBtn, opacity: 0.35, cursor: "not-allowed" }}>{"\u2715"}</span>
                    ) : (
                      <button onClick={() => setConfirmDeleteModelId(model.id)} style={sty.dangerBtn}>{"\u2715"}</button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          <button onClick={() => { resetModelState(); setView("model"); }}
            style={sty.bigBtn}
            onMouseEnter={(e) => (e.target.style.background = "#2d2d4e")}
            onMouseLeave={(e) => (e.target.style.background = "#1a1a2e")}>
            + Nieuw correctiemodel aanmaken
          </button>
        </div>
      </div>
    );
  }

  // ==================== VIEW: MANAGE CLASSES ====================
  if (view === "manage_classes") {
    const selectedClass = savedClasses.find(c => c.id === selectedClassId);
    return (
      <div style={sty.pageWrapper}>
        <div style={sty.pageInner}>
          <button style={sty.backBtn} onClick={navToDashboard}>{"\u2190"} Dashboard</button>
          <div style={sty.header}>
            <h1 style={{ ...h1Style, fontSize: "clamp(24px, 4vw, 36px)" }}>Klassen & Leerlingen</h1>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "20px" }}>
            <div style={{ ...sty.card, padding: "20px" }}>
              <label style={sty.label}>Klassen</label>
              {savedClasses.length === 0 && (
                <div style={{ fontSize: "13px", color: "#bbb", textAlign: "center", padding: "16px 0" }}>Nog geen klassen</div>
              )}
              {savedClasses.map(cls => (
                <div key={cls.id}
                  onClick={() => setSelectedClassId(cls.id === selectedClassId ? null : cls.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: "8px", marginBottom: "3px", cursor: "pointer",
                    background: cls.id === selectedClassId ? "#1a1a2e" : "#f8f8f8",
                    color: cls.id === selectedClassId ? "#fff" : "#333" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600" }}>{cls.name}</div>
                    <div style={{ fontSize: "11px", opacity: 0.55 }}>{(cls.students || []).length} leerlingen</div>
                  </div>
                  {confirmDeleteClassId === cls.id ? (
                    <div style={{ display: "flex", gap: "4px" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => deleteClass(cls.id)} style={{ ...sty.dangerBtn, padding: "2px 8px", fontSize: "10px" }}>Ja</button>
                      <button onClick={() => setConfirmDeleteClassId(null)} style={{ ...sty.smallBtn, padding: "2px 8px", fontSize: "10px" }}>Nee</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteClassId(cls.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4, fontSize: "14px", color: "inherit", lineHeight: 1 }}
                      onMouseEnter={e => e.target.style.opacity = "1"} onMouseLeave={e => e.target.style.opacity = "0.4"}>{"\u2715"}</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addClass()}
                  placeholder="Bijv. 3H"
                  style={{ flex: 1, border: "1px solid #ddd", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", outline: "none" }} />
                <button onClick={addClass}
                  style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 14px", fontSize: "16px" }}>+</button>
              </div>
            </div>

            <div style={{ ...sty.card, padding: "20px" }}>
              {selectedClass ? (
                <>
                  <label style={sty.label}>Leerlingen &mdash; {selectedClass.name}</label>
                  {(selectedClass.students || []).length === 0 && (
                    <div style={{ fontSize: "13px", color: "#bbb", textAlign: "center", padding: "20px 0" }}>Nog geen leerlingen in deze klas</div>
                  )}
                  {(selectedClass.students || []).map(student => (
                    <div key={student.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: "8px", background: "#f8f8f8", marginBottom: "3px" }}>
                      <span style={{ fontSize: "14px", color: "#333" }}>{student.name}</span>
                      <button onClick={() => deleteStudent(selectedClass.id, student.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: "14px", lineHeight: 1 }}
                        onMouseEnter={e => e.target.style.color = "#EF4444"}
                        onMouseLeave={e => e.target.style.color = "#ccc"}>{"\u2715"}</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                    <input value={newStudentName} onChange={e => setNewStudentName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addStudent(selectedClass.id)}
                      placeholder="Naam leerling"
                      style={{ flex: 1, border: "1px solid #ddd", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", outline: "none" }} />
                    <button onClick={() => addStudent(selectedClass.id)}
                      style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 14px", fontSize: "16px" }}>+</button>
                  </div>
                  <div style={{ marginTop: "12px", borderTop: "1px solid #f0f0f0", paddingTop: "12px" }}>
                    {!showBulkInput ? (
                      <button onClick={() => setShowBulkInput(true)}
                        style={{ ...sty.smallBtn, width: "100%", fontSize: "12px", color: "#888" }}>
                        + Meerdere leerlingen tegelijk toevoegen
                      </button>
                    ) : (
                      <>
                        <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>Één naam per regel</div>
                        <textarea value={bulkStudentInput} onChange={e => setBulkStudentInput(e.target.value)}
                          placeholder={"Emma de Vries\nLucas Bakker\nSophie Janssen"}
                          style={{ width: "100%", minHeight: "100px", border: "1px solid #ddd", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                          <button onClick={() => addStudentsBulk(selectedClass.id)}
                            style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none", flex: 1 }}>
                            Toevoegen ({bulkStudentInput.split("\n").filter(n => n.trim()).length})
                          </button>
                          <button onClick={() => { setShowBulkInput(false); setBulkStudentInput(""); }} style={sty.smallBtn}>Annuleer</button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "160px", color: "#ccc", fontSize: "14px" }}>
                  Selecteer een klas om leerlingen te beheren
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== VIEW: SETUP ====================
  if (view === "setup") {
    const [setupModelId, setSetupModelId] = [pickerModelId, setPickerModelId];
    const selectedModel = savedModels.find(m => m.id === setupModelId);
    const [setupClassIds, setSetupClassIds] = [sessionClassIds, setSessionClassIds];
    const totalSelectedStudents = setupClassIds.reduce((s, cid) => {
      const cls = savedClasses.find(c => c.id === cid);
      return s + (cls?.students || []).length;
    }, 0);
    const canStart = !!setupModelId && setupClassIds.length > 0 && totalSelectedStudents > 0;
    return (
      <div style={sty.pageWrapper}>
        <div style={sty.pageInner}>
          <button style={sty.backBtn} onClick={navToDashboard}>{"\u2190"} Dashboard</button>
          <div style={sty.header}>
            <h1 style={h1Style}>Nakijksessie instellen</h1>
            <p style={{ color: "#666", fontSize: "16px", maxWidth: "520px", margin: "0 auto" }}>Kies een correctiemodel en de klassen die je wilt nakijken.</p>
          </div>

          <div style={sty.card}>
            <label style={sty.label}>Correctiemodel</label>
            {savedModels.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ color: "#aaa", marginBottom: "16px", fontSize: "14px" }}>Nog geen correctiemodellen opgeslagen.</p>
                <button onClick={() => { resetModelState(); setView("model"); }}
                  style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none" }}>+ Nieuw correctiemodel aanmaken</button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative", marginBottom: "12px" }}>
                  <select value={setupModelId} onChange={e => setSetupModelId(e.target.value)}
                    style={{ width: "100%", border: "1px solid #ccc", borderRadius: "10px", padding: "14px 44px 14px 16px", fontSize: "15px", fontWeight: setupModelId ? "600" : "400", color: setupModelId ? "#1a1a2e" : "#999", outline: "none", background: "#fff", appearance: "none", WebkitAppearance: "none", cursor: "pointer", boxSizing: "border-box" }}>
                    <option value="">— Kies een correctiemodel —</option>
                    {savedModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#888", fontSize: "11px" }}>▼</div>
                </div>
                {selectedModel && (
                  <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#f8f6f3", fontSize: "12px", color: "#666" }}>
                    {selectedModel.inhoudText.split("\n").filter(l => l.trim()).length} inhoud &middot;&nbsp;
                    {selectedModel.presentatieText.split("\n").filter(l => l.trim()).length} presentatie &middot;&nbsp;
                    max {(selectedModel.inhoudMax || 0) + (selectedModel.presentatieMax || 0) + (selectedModel.taalMax || 0)} punten
                  </div>
                )}
              </>
            )}
          </div>

          <div style={sty.card}>
            <label style={sty.label}>Klassen</label>
            {savedClasses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ color: "#aaa", marginBottom: "16px", fontSize: "14px" }}>Nog geen klassen aangemaakt.</p>
                <button onClick={() => setView("manage_classes")}
                  style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none" }}>Klassen beheren</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {savedClasses.map(cls => {
                  const checked = setupClassIds.includes(cls.id);
                  const hasStudents = (cls.students || []).length > 0;
                  return (
                    <div key={cls.id}>
                      <label style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", border: "1px solid " + (checked && hasStudents ? "#1a1a2e" : "#eee"), background: checked && hasStudents ? "#f0eeeb" : "#fafafa", cursor: hasStudents ? "pointer" : "not-allowed", opacity: hasStudents ? 1 : 0.45 }}
                        onClick={hasStudents ? () => setSetupClassIds(prev => checked ? prev.filter(id => id !== cls.id) : [...prev, cls.id]) : undefined}>
                        <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: "2px solid " + (checked && hasStudents ? "#1a1a2e" : "#ccc"), background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s" }}>
                          {checked && hasStudents && <span style={{ color: "#1a1a2e", fontSize: "11px", fontWeight: "800", lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "15px", fontWeight: "600", color: "#1a1a2e" }}>{cls.name}</div>
                          <div style={{ fontSize: "12px", color: hasStudents ? "#aaa" : "#EF4444" }}>{hasStudents ? (cls.students || []).length + " leerlingen" : "Geen leerlingen — voeg leerlingen toe om te starten"}</div>
                        </div>
                      </label>
                    </div>
                  );
                })}
                {setupClassIds.length > 0 && (
                  <div style={{ fontSize: "12px", color: "#888", paddingLeft: "4px", marginTop: "4px" }}>
                    {totalSelectedStudents} leerlingen geselecteerd
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={() => handleStartSession(setupModelId, setupClassIds)}
            disabled={!canStart}
            style={{ ...sty.bigBtn, opacity: canStart ? 1 : 0.4, cursor: canStart ? "pointer" : "default" }}
            onMouseEnter={(e) => { if (canStart) e.target.style.background = "#2d2d4e"; }}
            onMouseLeave={(e) => { if (canStart) e.target.style.background = "#1a1a2e"; }}>
            Start nakijksessie {"\u2192"}
          </button>
        </div>
      </div>
    );
  }

  // ==================== VIEW: MODEL ====================
  if (view === "model") {
    const inhoudCount = inhoudText.split("\n").filter((l) => l.trim()).length;
    const presentatieCount = presentatieText.split("\n").filter((l) => l.trim()).length;
    const activeGradesForModel = currentModelId
      ? savedGrades.filter(g => g.modelId === currentModelId && !g.isComplete)
      : [];
    return (
      <div style={sty.pageWrapper}>
        <div style={sty.pageInner}>
          <button style={sty.backBtn} onClick={navToDashboard}>{"\u2190"} Dashboard</button>
          <div style={sty.header}>
            <h1 style={h1Style}>Correctiemodel</h1>
            <p style={{ color: "#666", fontSize: "16px", maxWidth: "520px", margin: "0 auto" }}>Maak een nieuw correctiemodel of start met een bestaand model en pas dit aan.</p>
          </div>

          {activeGradesForModel.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "12px", padding: "14px 18px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>\u26a0\ufe0f</span>
              <div style={{ fontSize: "13px", color: "#92400E", lineHeight: "1.5" }}>
                <strong>Dit model is al in gebruik</strong> \u2014 er zijn {activeGradesForModel.length} lopende nakijksessie{activeGradesForModel.length !== 1 ? "s" : ""} aan gekoppeld.
                Wijzigingen in items of volgorde kunnen bestaande markeringen en scores door de war schoppen.
              </div>
            </div>
          )}

          {savedModels.length > 0 && (
            <div style={sty.card}>
              <label style={sty.label}>Start met een bestaand model</label>
              <div style={{ position: "relative" }}>
                <select value={pickerModelId}
                  onChange={(e) => {
                    const m = savedModels.find(m => m.id === e.target.value);
                    if (m) {
                      setInhoudText(m.inhoudText);
                      setPresentatieText(m.presentatieText);
                      setInhoudMax(m.inhoudMax);
                      setPresentatieMax(m.presentatieMax);
                      setTaalMax(m.taalMax);
                      setTaalGroupsConfig(m.taalGroupsConfig || DEFAULT_TAAL_GROUPS_CONFIG);
                      setPickerModelId(e.target.value);
                      setModelDirty(true);
                    } else {
                      setPickerModelId("");
                    }
                  }}
                  style={{ width: "100%", border: "1px solid #ccc", borderRadius: "10px", padding: "14px 44px 14px 16px", fontSize: "15px", fontWeight: pickerModelId ? "600" : "400", color: pickerModelId ? "#1a1a2e" : "#999", outline: "none", background: "#fff", appearance: "none", WebkitAppearance: "none", cursor: "pointer", boxSizing: "border-box" }}>
                  <option value="">— Kies een bestaand model —</option>
                  {savedModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#888", fontSize: "11px" }}>▼</div>
              </div>
            </div>
          )}

          {showSaveModelDialog && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
              <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "400px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                <h3 style={{ margin: "0 0 16px", fontFamily: "'Georgia', serif", fontWeight: "400", color: "#1a1a2e" }}>Model opslaan</h3>
                <input value={saveModelNameInput} onChange={e => setSaveModelNameInput(e.target.value)}
                  placeholder="Naam van het model..."
                  autoFocus
                  style={{ ...sty.inputStyle, marginBottom: "16px" }}
                  onKeyDown={e => { if (e.key === "Enter" && saveModelNameInput.trim()) { saveCurrentModel(saveModelNameInput); setShowSaveModelDialog(false); setModelSavedFlash(saveModelNameInput.trim()); setTimeout(() => { setModelSavedFlash(""); setView("home"); }, 1500); } }} />
                {activeGradesForModel.length > 0 && (
                  <div style={{ marginBottom: "14px", padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "12px", color: "#92400E", lineHeight: "1.5" }}>
                    ⚠️ <strong>Let op:</strong> dit model heeft {activeGradesForModel.length} lopende nakijksessie{activeGradesForModel.length !== 1 ? "s" : ""}. Wijzigingen kunnen bestaande scores beïnvloeden.
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => { if (saveModelNameInput.trim()) { saveCurrentModel(saveModelNameInput); setShowSaveModelDialog(false); setModelSavedFlash(saveModelNameInput.trim()); setTimeout(() => { setModelSavedFlash(""); setView("home"); }, 1500); } }}
                    disabled={!saveModelNameInput.trim()}
                    style={{ ...sty.bigBtn, flex: 1, opacity: saveModelNameInput.trim() ? 1 : 0.5 }}>Toch opslaan</button>
                  <button onClick={() => setShowSaveModelDialog(false)}
                    style={{ padding: "14px 20px", fontSize: "14px", background: "#f3f3f3", color: "#666", border: "1px solid #ddd", borderRadius: "10px", cursor: "pointer" }}>Annuleer</button>
                </div>
              </div>
            </div>
          )}

          <div style={sty.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: CATEGORY_COLORS[0].border }} />
              <label style={{ ...sty.label, marginBottom: 0 }}>Inhoud</label>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#999" }}>max</span>
                <input type="number" value={inhoudMax} onChange={(e) => { setInhoudMax(Math.max(0, parseInt(e.target.value) || 0)); setModelDirty(true); }} min="0"
                  style={{ width: "50px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                <span style={{ fontSize: "11px", color: "#999" }}>pt</span>
              </div>
            </div>
            <textarea value={inhoudText} onChange={(e) => { setInhoudText(e.target.value); setModelDirty(true); }} placeholder="Eén item per regel. Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]"
              style={{ width: "100%", minHeight: "200px", border: "1px solid #ddd", borderRadius: "10px", padding: "14px", fontSize: "14px", lineHeight: "1.8", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            <div style={{ fontSize: "11px", color: "#bbb", marginTop: "6px" }}>{inhoudCount} items &middot; Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]</div>
          </div>

          <div style={sty.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: CATEGORY_COLORS[1].border }} />
              <label style={{ ...sty.label, marginBottom: 0 }}>Taalgebruik</label>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#999" }}>min.</span>
                <input type="number" value={minWords} onChange={(e) => { setMinWords(Math.max(1, parseInt(e.target.value) || 1)); setModelDirty(true); }} min="1"
                  style={{ width: "56px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                <span style={{ fontSize: "11px", color: "#999" }}>woorden &nbsp;·&nbsp; max</span>
                <input type="number" value={taalMax} onChange={(e) => { setTaalMax(Math.max(0, parseInt(e.target.value) || 0)); setModelDirty(true); }} min="0"
                  style={{ width: "50px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                <span style={{ fontSize: "11px", color: "#999" }}>pt</span>
              </div>
            </div>
            {taalGroupsConfig.map((group, gi) => {
              const sc = TAAL_SUB_COLORS[group.name] || CATEGORY_COLORS[1];
              const errors = validateTaalRanges(group.ranges);
              const updateGroup = (newRanges) => {
                setTaalGroupsConfig(prev => prev.map((g, i) => i === gi ? { ...g, ranges: newRanges } : g));
                setModelDirty(true);
              };
              return (
                <div key={group.name} style={{ marginBottom: "16px", padding: "14px", borderRadius: "10px", background: "#fafafa", border: "1px solid " + (errors.length ? "#FCA5A5" : "#eee") }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: sc.border, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800" }}>{sc.icon}</div>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>{group.name}</span>
                  </div>
                  {group.ranges.map((range, ri) => (
                    <div key={range.id} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#888", minWidth: "20px" }}>van</span>
                      <input type="number" min="1" value={range.min}
                        onChange={e => updateGroup(group.ranges.map((r, i) => i === ri ? { ...r, min: Math.max(1, parseInt(e.target.value) || 1) } : r))}
                        style={{ width: "52px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 6px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                      <span style={{ fontSize: "12px", color: "#888" }}>t/m</span>
                      {range.max === null ? (
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#666", width: "52px", textAlign: "center" }}>∞</span>
                      ) : (
                        <input type="number" min={range.min} value={range.max}
                          onChange={e => updateGroup(group.ranges.map((r, i) => i === ri ? { ...r, max: Math.max(range.min, parseInt(e.target.value) || range.min) } : r))}
                          style={{ width: "52px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 6px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                      )}
                      <button onClick={() => updateGroup(group.ranges.map((r, i) => i === ri ? { ...r, max: r.max === null ? range.min : null } : r))}
                        title={range.max === null ? "Stel vaste bovengrens in" : "Stel in als 'en meer'"}
                        style={{ fontSize: "11px", padding: "3px 8px", border: "1px solid #ddd", borderRadius: "6px", background: range.max === null ? "#1a1a2e" : "#fff", color: range.max === null ? "#fff" : "#666", cursor: "pointer" }}>
                        {range.max === null ? "∞ aan" : "∞"}
                      </button>
                      <span style={{ fontSize: "12px", color: "#888" }}>fouten →</span>
                      <span style={{ fontSize: "12px", color: "#888" }}>−</span>
                      <input type="number" min="0" value={range.aftrek}
                        onChange={e => updateGroup(group.ranges.map((r, i) => i === ri ? { ...r, aftrek: Math.max(0, parseInt(e.target.value) || 0) } : r))}
                        style={{ width: "44px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 6px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                      <span style={{ fontSize: "12px", color: "#888" }}>pt</span>
                      <button onClick={() => updateGroup(group.ranges.filter((_, i) => i !== ri))}
                        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: "16px", lineHeight: 1, padding: "0 4px" }}
                        onMouseEnter={e => e.target.style.color = "#EF4444"}
                        onMouseLeave={e => e.target.style.color = "#ccc"}>×</button>
                    </div>
                  ))}
                  {errors.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "11px", color: "#DC2626", background: "#FEE2E2", borderRadius: "6px", padding: "6px 10px" }}>
                      {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                    </div>
                  )}
                  <button onClick={() => {
                    const lastRange = group.ranges[group.ranges.length - 1];
                    const newMin = lastRange ? (lastRange.max !== null ? lastRange.max + 1 : (lastRange.min + 1)) : 1;
                    updateGroup([...group.ranges, { id: group.name[0].toLowerCase() + Date.now(), min: newMin, max: null, aftrek: 1 }]);
                  }}
                    style={{ ...sty.smallBtn, fontSize: "11px", marginTop: "6px", width: "100%" }}>+ Bereik toevoegen</button>
                </div>
              );
            })}
          </div>

          <div style={sty.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: CATEGORY_COLORS[2].border }} />
              <label style={{ ...sty.label, marginBottom: 0 }}>Presentatie/conventies</label>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#999" }}>max</span>
                <input type="number" value={presentatieMax} onChange={(e) => { setPresentatieMax(Math.max(0, parseInt(e.target.value) || 0)); setModelDirty(true); }} min="0"
                  style={{ width: "50px", border: "1px solid #ddd", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", textAlign: "center", outline: "none" }} />
                <span style={{ fontSize: "11px", color: "#999" }}>pt</span>
              </div>
            </div>
            <textarea value={presentatieText} onChange={(e) => { setPresentatieText(e.target.value); setModelDirty(true); }} placeholder="Eén item per regel. Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]"
              style={{ width: "100%", minHeight: "120px", border: "1px solid #ddd", borderRadius: "10px", padding: "14px", fontSize: "14px", lineHeight: "1.8", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            <div style={{ fontSize: "11px", color: "#bbb", marginTop: "6px" }}>{presentatieCount} items &middot; Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]</div>
          </div>

          {/* Model name + save */}
          <div style={sty.card}>
            <label style={sty.label}>Modelnaam</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input value={currentModelName} onChange={(e) => { setCurrentModelName(e.target.value); setModelDirty(true); }}
                placeholder="Geef dit model een naam..."
                style={{ ...sty.inputStyle, flex: 1 }} />
              <button onClick={() => {
                if (currentModelName.trim()) {
                  saveCurrentModel(currentModelName);
                  setModelSavedFlash(currentModelName.trim());
                  setTimeout(() => { setModelSavedFlash(""); setView("home"); }, 1500);
                } else {
                  setSaveModelNameInput(""); setShowSaveModelDialog(true);
                }
              }}
                style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none", padding: "12px 20px", whiteSpace: "nowrap", borderRadius: "10px" }}>
                Opslaan
              </button>
            </div>
            {modelSavedFlash && <div style={{ marginTop: "8px", fontSize: "13px", color: "#10B981", fontWeight: "600" }}>{"\u2713"} &ldquo;{modelSavedFlash}&rdquo; opgeslagen</div>}
          </div>

        </div>
      </div>
    );
  }


  // ==================== VIEW: OVERVIEW ====================
  if (view === "overview") {
    // Build all grades index for fast lookup
    const latestGradeByStudentModel = {};
    [...savedGrades].sort((a,b) => new Date(a.savedAt) - new Date(b.savedAt)).forEach(g => {
      latestGradeByStudentModel[g.studentId + "::" + g.modelId] = g;
    });

    const exportAllCSV = () => {
      const rows = [["Klas", "Naam", "Correctiemodel", "Score", "Max", "Status"]];
      savedClasses.forEach(cls => {
        [...(cls.students || [])].sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
          savedModels.forEach(model => {
            const grade = latestGradeByStudentModel[student.id + "::" + model.id];
            if (grade) {
              rows.push([cls.name, student.name, model.name,
                grade.totalScore, grade.maxScore,
                grade.isComplete ? "Klaar" : "Bezig"]);
            }
          });
          const hasAnyGrade = savedModels.some(m => latestGradeByStudentModel[student.id + "::" + m.id]);
          if (!hasAnyGrade) rows.push([cls.name, student.name, "—", "", "", "Niet gestart"]);
        });
      });
      const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "overzicht.csv"; a.click();
      URL.revokeObjectURL(url);
    };

    const thStyle = { textAlign: "left", padding: "8px 12px", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "#999" };

    return (
      <div style={sty.pageWrapper}>
        <div style={sty.pageInner}>
          <button style={sty.backBtn} onClick={navToDashboard}>{"\u2190"} Dashboard</button>
          <div style={sty.header}>
            <h1 style={{ ...h1Style, fontSize: "clamp(24px, 4vw, 36px)" }}>Overzicht</h1>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
            <button onClick={exportAllCSV}
              style={{ ...sty.smallBtn, background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 16px" }}>
              {"\u2193"} CSV exporteren
            </button>
          </div>

          {savedClasses.length === 0 && (
            <div style={{ ...sty.card, textAlign: "center", color: "#bbb", padding: "40px" }}>Nog geen klassen aangemaakt.</div>
          )}

          {savedClasses.map(cls => {
            const students = [...(cls.students || [])].sort((a,b) => a.name.localeCompare(b.name));
            return (
              <div key={cls.id} style={sty.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <label style={{ ...sty.label, marginBottom: 0 }}>{cls.name}</label>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>{students.length} leerlingen</span>
                </div>
                {students.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#ccc", textAlign: "center", padding: "16px 0" }}>Geen leerlingen</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <th style={thStyle}>Naam</th>
                        <th style={thStyle}>Correctiemodel</th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Score</th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                        <th style={{ ...thStyle }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, i) => {
                        // Find all grades for this student
                        const studentGrades = savedModels.map(model => ({
                          model,
                          grade: latestGradeByStudentModel[student.id + "::" + model.id] || null
                        })).filter(({ grade }) => grade !== null);

                        if (studentGrades.length === 0) {
                          return (
                            <tr key={student.id} style={{ borderBottom: "1px solid #f8f8f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "9px 12px", fontWeight: "500", color: "#1a1a2e" }}>{student.name}</td>
                              <td style={{ padding: "9px 12px", color: "#ccc" }}>—</td>
                              <td style={{ padding: "9px 12px", textAlign: "center", color: "#ccc" }}>—</td>
                              <td style={{ padding: "9px 12px", textAlign: "center" }}>
                                <span style={{ background: "#F3F4F6", color: "#9CA3AF", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>Niet gestart</span>
                              </td>
                              <td></td>
                            </tr>
                          );
                        }

                        return studentGrades.map(({ model, grade }, gi) => {
                          const status = grade.isComplete ? "klaar" : "bezig";
                          return (
                            <tr key={student.id + "::" + model.id} style={{ borderBottom: "1px solid #f8f8f8", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "9px 12px", fontWeight: "500", color: "#1a1a2e" }}>{student.name}</td>
                              <td style={{ padding: "9px 12px", color: "#666", fontSize: "12px" }}>{model.name}</td>
                              <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: "600", color: grade.isComplete ? "#10B981" : "#F59E0B" }}>
                                {grade.totalScore}/{grade.maxScore}
                              </td>
                              <td style={{ padding: "9px 12px", textAlign: "center" }}>
                                {status === "klaar"
                                  ? <span style={{ background: "#D1FAE5", color: "#065F46", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>{"\u2713"} Klaar</span>
                                  : <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" }}>{"\u25CF"} Bezig</span>}
                              </td>
                              <td style={{ padding: "9px 12px", textAlign: "right" }}>
                                <button onClick={() => handleResumeGrade(grade)}
                                  style={{ ...sty.smallBtn, fontSize: "11px", padding: "3px 10px" }}>Openen</button>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==================== VIEW: GRADING ====================
  const pendingText = pendingHighlight ? studentText.slice(pendingHighlight.start, pendingHighlight.end) : "";
  const pendingPreview = pendingText.length > 50 ? pendingText.slice(0, 50) + "..." : pendingText;

  return (
    <div style={sty.pageWrapper} onClick={() => { if (!justSelectedTextRef.current) setPendingHighlight(null); }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", color: "#f8f6f3", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.15)", gap: "8px" }}>
        {/* Left: Dashboard button */}
        <button onClick={() => setView("home")} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "20px", padding: "6px 14px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{"\u2190"} Dashboard</button>

        {/* Center: class + student + model */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
          {(() => {
            const hSel = { background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: "16px", padding: "4px 10px", fontSize: "12px", cursor: "pointer", outline: "none" };
            const sessionClasses = sessionClassIds.length > 0
              ? savedClasses.filter(c => sessionClassIds.includes(c.id))
              : savedClasses;
            const gradingStudents = gradingClassId
              ? (sessionClasses.find(c => c.id === gradingClassId)?.students || [])
              : sessionClasses.flatMap(c => (c.students || []).map(s => ({ ...s, _classId: c.id })));
            const currentStudentIdx = gradingStudents.findIndex(s => s.id === currentStudentId);
            const prevStudentId = currentStudentIdx > 0 ? gradingStudents[currentStudentIdx - 1].id : null;
            const nextStudentId = currentStudentIdx >= 0 && currentStudentIdx < gradingStudents.length - 1 ? gradingStudents[currentStudentIdx + 1].id : null;
            const sessionAllStudents = sessionClasses.flatMap(c => c.students || []);
            const sessionDoneCount = sessionAllStudents.filter(s => savedGrades.some(g => g.studentId === s.id && g.modelId === currentModelId && g.isComplete)).length;
            const sessionTotalCount = sessionAllStudents.length;
            if (sessionClasses.length === 0 && !studentName) return null;
            return (<>
              {sessionClasses.length > 1 && (
                <select value={gradingClassId} onChange={e => { setGradingClassId(e.target.value); setCurrentStudentId(null); }} style={hSel}>
                  <option value="">Alle klassen</option>
                  {sessionClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {gradingStudents.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  <button onClick={() => prevStudentId && switchStudent(prevStudentId)} disabled={!prevStudentId}
                    style={{ background: "rgba(255,255,255,0.12)", color: prevStudentId ? "#fff" : "rgba(255,255,255,0.25)", border: "none", borderRadius: "12px", width: "26px", height: "26px", cursor: prevStudentId ? "pointer" : "default", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{"\u2039"}</button>
                  <select value={currentStudentId || ""} onChange={e => switchStudent(e.target.value)} style={{ ...hSel, fontWeight: "600", fontSize: "13px" }}>
                    <option value="" style={{ color: "#1a1a2e", background: "#fff" }}>— Leerling —</option>
                    {gradingStudents.map(s => {
                      const sGrade = [...savedGrades].sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt))
                        .find(g => g.studentId === s.id && g.modelId === currentModelId);
                      const statusPrefix = sGrade ? (sGrade.isComplete ? "✓ " : "● ") : "";
                      const cls = sessionClasses.find(c => (c.students || []).some(st => st.id === s.id));
                      return <option key={s.id} value={s.id} style={{ color: "#1a1a2e", background: "#fff" }}>{statusPrefix}{s.name}{sessionClasses.length > 1 && cls ? " (" + cls.name + ")" : ""}</option>;
                    })}
                  </select>
                  <button onClick={() => nextStudentId && switchStudent(nextStudentId)} disabled={!nextStudentId}
                    style={{ background: "rgba(255,255,255,0.12)", color: nextStudentId ? "#fff" : "rgba(255,255,255,0.25)", border: "none", borderRadius: "12px", width: "26px", height: "26px", cursor: nextStudentId ? "pointer" : "default", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{"\u203a"}</button>
                </div>
              )}
              {gradingStudents.length === 0 && studentName && (
                <span style={{ background: "rgba(255,255,255,0.12)", padding: "3px 12px", borderRadius: "20px", fontSize: "13px" }}>{studentName}{studentClass && " \u2014 " + studentClass}</span>
              )}
              {currentModelName && (
                <span style={{ background: "rgba(255,255,255,0.07)", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", opacity: 0.6 }}>{currentModelName}</span>
              )}
              {sessionTotalCount > 0 && (
                <span style={{ background: "rgba(255,255,255,0.07)", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", opacity: 0.7, whiteSpace: "nowrap" }}>
                  {sessionDoneCount}/{sessionTotalCount} klaar
                </span>
              )}
            </>);
          })()}
        </div>

        {/* Right: score + Resultaat + Klaar */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
          <div style={{ background: "rgba(255,255,255,0.12)", padding: "5px 14px", borderRadius: "20px", fontSize: "16px", fontWeight: "700" }}>{getTotalScore()} / {getMaxTotal()}</div>
          <button onClick={() => setShowResults(!showResults)} style={{ background: showResults ? "#10B981" : "rgba(255,255,255,0.12)", color: "#fff", border: showResults ? "none" : "1px solid rgba(255,255,255,0.2)", padding: "6px 14px", borderRadius: "20px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>{showResults ? "\u2713 Resultaat" : "Resultaat"}</button>
          {!inlineTextMode && <button onClick={handleToggleDone} title={currentIsComplete ? "Markeer als niet klaar" : "Markeer als klaar"}
            style={{ background: currentIsComplete ? "#10B981" : "rgba(255,255,255,0.12)", color: currentIsComplete ? "#fff" : "rgba(255,255,255,0.6)", border: currentIsComplete ? "1px solid #0d9668" : "1px solid rgba(255,255,255,0.25)", padding: "6px 14px", borderRadius: "20px", cursor: "pointer", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", transition: "background 0.15s, color 0.15s" }}>
            <span style={{ width: "14px", height: "14px", borderRadius: "3px", border: currentIsComplete ? "2px solid rgba(255,255,255,0.8)" : "2px solid rgba(255,255,255,0.4)", background: currentIsComplete ? "rgba(255,255,255,0.25)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "10px", lineHeight: 1 }}>{currentIsComplete ? "\u2713" : ""}</span>
            Klaar!
          </button>}
        </div>
      </div>

      {/* All done overlay */}
      {allDoneFlash && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "20px", padding: "40px 48px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxWidth: "420px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "'Georgia', serif", fontWeight: "400", fontSize: "22px", color: "#1a1a2e" }}>Alle leerlingen nagekeken!</h2>
            <p style={{ color: "#888", fontSize: "14px", margin: "0 0 24px" }}>Alle geselecteerde leerlingen hebben de status &ldquo;klaar&rdquo;.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={() => { setAllDoneFlash(false); setView("home"); }}
                style={{ padding: "12px 24px", fontSize: "14px", fontWeight: "600", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer" }}>
                Naar dashboard
              </button>
              <button onClick={() => setAllDoneFlash(false)}
                style={{ padding: "12px 24px", fontSize: "14px", background: "#f3f3f3", color: "#666", border: "1px solid #ddd", borderRadius: "10px", cursor: "pointer" }}>
                Blijf hier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor overlay */}
      {showEditor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setShowEditor(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px", padding: "32px", maxWidth: "700px", width: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "400", fontFamily: "'Georgia', serif", color: "#1a1a2e" }}>Correctiemodel bewerken</h2>
              <button onClick={() => setShowEditor(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999" }}>{"\u2715"}</button>
            </div>
            <p style={{ fontSize: "12px", color: "#999", marginTop: 0, marginBottom: "20px" }}>Elke regel wordt een afvink-item. Taalgebruik wordt automatisch bepaald.</p>
            {[{ label: "Inhoud", text: inhoudText, setText: setInhoudText, color: CATEGORY_COLORS[0] },
              { label: "Presentatie/conventies", text: presentatieText, setText: setPresentatieText, color: CATEGORY_COLORS[2] }].map((sec) => (
              <div key={sec.label} style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: sec.color.border }} />
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>{sec.label}</span>
                </div>
                <textarea value={sec.text} onChange={(e) => sec.setText(e.target.value)}
                  placeholder="Eén item per regel. Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]"
                  style={{ width: "100%", minHeight: "120px", border: "1px solid #ddd", borderRadius: "8px", padding: "12px", fontSize: "13px", lineHeight: "1.8", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  onFocus={(e) => (e.target.style.borderColor = sec.color.border)} onBlur={(e) => (e.target.style.borderColor = "#ddd")} />
                <div style={{ fontSize: "10px", color: "#bbb", marginTop: "4px" }}>{sec.text.split("\n").filter((l) => l.trim()).length} items &middot; Voeg [2] toe voor 2 punten, bijv: schrijft een inleiding [2]</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={applyEditor} style={{ flex: 1, padding: "12px", fontSize: "14px", fontWeight: "600", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>Opslaan</button>
              <button onClick={() => setShowEditor(false)} style={{ padding: "12px 24px", fontSize: "14px", background: "#f3f3f3", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Annuleer</button>
            </div>
          </div>
        </div>
      )}

      {showResults ? (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px 28px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)" }}>
            <div id="resultaat-content">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", color: "#1a1a2e", fontFamily: "'Georgia', serif", fontWeight: "400", fontSize: "22px" }}>Resultaat {studentName && ("\u2014 " + studentName)}{studentClass && (" (" + studentClass + ")")}</h2>
                  <div style={{ fontSize: "32px", fontWeight: "700", color: "#1a1a2e" }}>{getTotalScore()} / {getMaxTotal()}</div>
                </div>
                <div style={{ display: "flex", gap: "6px" }} className="no-print">
                  <button onClick={handleCopy}
                    style={{ background: copied ? "#10B981" : "#1a1a2e", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                    {copied ? "\u2713 Gekopieerd!" : "\u2398 Kopieer"}
                  </button>
                  <button onClick={() => {
                    const el = document.getElementById("resultaat-content");
                    if (!el) return;
                    const iframe = document.createElement("iframe");
                    iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:#fff;";
                    document.body.appendChild(iframe);
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    doc.open();
                    doc.write('<html><head><title>Resultaat' + (studentName ? ' - ' + studentName : '') + '</title><style>body{font-family:"Segoe UI",sans-serif;padding:24px;color:#1a1a2e;font-size:13px}h2{font-family:Georgia,serif;font-weight:400}.no-print{display:none!important}</style></head><body>' + el.innerHTML + '</body></html>');
                    doc.close();
                    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => { try { document.body.removeChild(iframe); } catch(e) {} }, 1000); }, 200);
                  }}
                    style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                    {"\uD83D\uDDA8"} PDF / Print
                  </button>
                </div>
              </div>

              {/* Compact summary for copy-paste */}
              <div className="no-print" style={{ marginBottom: "16px", padding: "14px 16px", background: "#f0f4ff", border: "1px solid #c7d4f5", borderRadius: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", color: "#4B5563" }}>Samenvatting om te kopiëren</span>
                  <button onClick={() => navigator.clipboard?.writeText(compactSummary)}
                    style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #a5b4fc", background: "#fff", color: "#4338CA", cursor: "pointer", fontWeight: "600" }}>
                    Kopieer
                  </button>
                </div>
                <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "12px", lineHeight: "1.7", color: "#1a1a2e", whiteSpace: "pre-wrap", userSelect: "all" }}>{compactSummary}</pre>
              </div>

              {categories.map((cat) => {
                const score = getCategoryScore(cat); const mode = catModes[cat.id];
                return (
                  <div key={cat.id} style={{ marginBottom: "16px", padding: "16px", background: "#f8f6f3", borderRadius: "12px", borderLeft: "4px solid " + cat.color.border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <strong style={{ fontSize: "14px" }}>{cat.name}</strong>
                      <span style={{ fontSize: "18px", fontWeight: "700", color: score === cat.maxScore ? "#10B981" : score === 0 ? "#EF4444" : "#F59E0B" }}>{score}/{cat.maxScore}</span>
                    </div>
                    {mode === "taalAuto" ? (() => {
                      const groups = {};
                      cat.items.forEach(item => { if (!groups[item.taalGroup]) groups[item.taalGroup] = []; groups[item.taalGroup].push(item); });
                      return Object.entries(groups).map(([gl, items]) => {
                        const count = taalCounts[cat.id + "::" + gl] || 0;
                        const checkedItem = items.find(item => scores[cat.id]?.[item.id]);
                        const aftrek = checkedItem ? checkedItem.points : 0;
                        const countLabel = handwrittenMode
                          ? (checkedItem ? (checkedItem.rangeMax === null ? checkedItem.rangeMin + "+ fouten" : checkedItem.rangeMin + (checkedItem.rangeMax !== checkedItem.rangeMin ? "\u2013" + checkedItem.rangeMax : "") + " fouten") : "geen fouten")
                          : (count === 0 ? "geen fouten" : count + (count === 1 ? " fout" : " fouten"));
                        const hasError = aftrek > 0;
                        return (
                          <div key={gl} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "13px", color: "#555" }}>
                            <span>{gl} <span style={{ color: hasError ? "#991B1B" : "#aaa", fontSize: "12px" }}>{"\u2014"} {countLabel}</span></span>
                            <span style={{ color: hasError ? "#EF4444" : "#10B981", fontWeight: "600", fontSize: "12px" }}>{hasError ? "\u2212" + aftrek : "\u2713"}</span>
                          </div>
                        );
                      });
                    })() : cat.items.map((item, itemIdx) => {
                      const checked = scores[cat.id]?.[item.id]; const isGood = mode === "checkIsGood" ? checked : !checked;
                      return (<div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "13px", color: "#555" }}>
                        <span style={{ opacity: isGood ? 1 : 0.5 }}><sup style={{ fontSize: "9px", fontWeight: "700", marginRight: "3px", color: cat.color.border }}>{itemIdx + 1}</sup>{item.text}</span>
                        <span style={{ color: isGood ? "#10B981" : "#EF4444", fontWeight: "600", fontSize: "12px" }}>{isGood ? "\u2713" : "\u2212" + item.points}</span>
                      </div>);
                    })}
                    {notes[cat.id] && <div style={{ marginTop: "6px", padding: "6px 10px", background: "#fff", borderRadius: "6px", fontSize: "12px", color: "#666", fontStyle: "italic" }}>{notes[cat.id]}</div>}
                  </div>
                );
              })}

              {!handwrittenMode && (
                <div style={{ marginTop: "20px", padding: "16px", background: "#f8f6f3", borderRadius: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "#999", marginBottom: "10px" }}>Leerlingtekst met markeringen</div>
                  <div style={{ background: "#fff", borderRadius: "8px", padding: "16px" }}>
                    <HighlightableText text={studentText} highlights={highlights} onHighlight={() => false} onSelectHighlight={() => {}} hoveredItemId={null} selectedHighlightId={null} itemNumbers={itemNumbers} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 50px)" }}>
          {/* Info bar - fixed below header, only in grading mode */}
          {!inlineTextMode && !handwrittenMode && (() => {
            const infoH = selectedHighlightId ? highlights.find((h) => h.id === selectedHighlightId) : null;
            const col = infoH ? (infoH.displayColor || infoH.color) : null;
            const passage = infoH ? studentText.slice(infoH.start, infoH.end) : "";
            const passagePreview = passage.length > 80 ? passage.slice(0, 80) + "..." : passage;
            const tabIds = frozenTabs || (infoH ? highlights.filter((h) => h.start < infoH.end && h.end > infoH.start).map((h) => h.id) : []);
            const tabHighlights = tabIds.map((id) => highlights.find((h) => h.id === id)).filter(Boolean);
            const activeCol = (!infoH && !pendingHighlight && activeCategory && (activeCategoryItem || activeTaalGroup))
              ? ((activeTaalGroup && TAAL_SUB_COLORS[activeTaalGroup]) ? TAAL_SUB_COLORS[activeTaalGroup] : activeCategory.color)
              : null;
            const bg = pendingHighlight ? "#FEF9C3" : infoH ? col.bg : activeCol ? activeCol.bg : "#f8f6f3";
            const borderColor = pendingHighlight ? "#EAB308" : infoH ? col.border : activeCol ? activeCol.border : "#e5e1db";
            const color = pendingHighlight ? "#854D0E" : infoH ? col.text : activeCol ? activeCol.text : "#bbb";
            return (
              <div onClick={(e) => e.stopPropagation()} style={{ background: bg, borderBottom: "1px solid " + borderColor, transition: "background 0.15s, border-color 0.15s", flexShrink: 0 }}>
                {tabHighlights.length > 1 && (
                  <div style={{ display: "flex", gap: "2px", paddingLeft: "20px", paddingTop: "6px" }}>
                    {tabHighlights.map((oh) => { const ohCol = oh.displayColor || oh.color; const isCurrent = oh.id === selectedHighlightId;
                      return (<button key={oh.id} onClick={() => setSelectedHighlightId(oh.id)} style={{ padding: "4px 10px", fontSize: "10px", fontWeight: "700", background: isCurrent ? ohCol.bg : ohCol.bg + "66", color: ohCol.text, border: "1px solid " + (isCurrent ? ohCol.border : ohCol.border + "44"), borderBottom: isCurrent ? "1px solid " + ohCol.bg : "1px solid " + ohCol.border + "44", borderRadius: "6px 6px 0 0", cursor: "pointer", position: "relative", bottom: "-1px", zIndex: isCurrent ? 2 : 1 }}>{oh.taalGroup || oh.categoryName}</button>);
                    })}
                  </div>
                )}
                <div style={{ padding: "10px 20px", fontSize: "12px", color, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "42px" }}>
                  {pendingHighlight ? (<>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#EAB308", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                    <span style={{ fontWeight: "500", fontSize: "13px", fontStyle: "italic" }}>&ldquo;{pendingPreview}&rdquo;</span>
                    <span style={{ opacity: 0.7 }}>{"\u2192"} Kies een correctie-item in het zijpaneel</span>
                  </>) : infoH ? (<>
                    {tabHighlights.length <= 1 && <span style={{ background: col.border + "22", padding: "2px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", color: col.text }}>{infoH.itemLabel || infoH.categoryName}</span>}
                    <span style={{ opacity: 0.5 }}>{"\u2192"}</span>
                    <span style={{ fontWeight: "500", fontSize: "13px", fontStyle: "italic" }}>&ldquo;{passagePreview}&rdquo;</span>
                    <button onClick={(e) => { e.stopPropagation(); const r = highlights.find(h => h.id === selectedHighlightId); handleRemoveHighlight(selectedHighlightId); selectHighlight(null); if (r) { clearTimeout(removedFlashTimer.current); setRemovedFlash(r); removedFlashTimer.current = setTimeout(() => setRemovedFlash(null), 6000); } }}
                      style={{ marginLeft: "auto", background: "#EF444422", border: "1px solid #EF4444", borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: "#991B1B", cursor: "pointer", fontWeight: "600" }}>Verwijder</button>
                  </>) : activeCol ? (<>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: activeCol.border, animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", fontWeight: "500" }}>Selecteer tekst {"\u2192"} <strong>{activeTaalGroup || (categories.find(c => c.id === activeCategory.id)?.items.find(i => i.id === activeCategoryItem)?.text)}</strong></span>
                    {activeTaalGroup && (() => { const c = taalCounts[activeCategory.id + "::" + activeTaalGroup] || 0; return c > 0 ? <span style={{ background: "rgba(0,0,0,0.1)", padding: "1px 7px", borderRadius: "10px", fontSize: "11px" }}>{c}{"\u00D7"}</span> : null; })()}
                    <button onClick={() => { setActiveCategory(null); setActiveCategoryItem(null); setActiveTaalGroup(null); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "inherit", opacity: 0.6 }}>{"\u2715"}</button>
                  </>) : removedFlash ? (<>
                    <span style={{ fontSize: "12px", color: "#10B981" }}>✓ Markering verwijderd</span>
                    <button onClick={() => { setHighlights(prev => [...prev, removedFlash]); setRemovedFlash(null); clearTimeout(removedFlashTimer.current); }} style={{ marginLeft: "8px", background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#666", textDecoration: "underline", padding: 0 }}>Ongedaan maken</button>
                  </>) : <span style={{ fontSize: "12px", fontStyle: "italic" }}>Klik op een markering om details te zien</span>}
                </div>
              </div>
            );
          })()}

          {/* Grid: text panel + correction panel */}
          <div style={{ display: "grid", gridTemplateColumns: (inlineTextMode || handwrittenMode) ? "1fr" : "1fr 350px", gap: "0", flex: 1, overflow: "hidden" }}>
          {/* Text panel */}
          <div style={{ padding: "24px 28px", overflowY: "auto", height: "100%", maxWidth: inlineTextMode ? "800px" : "none", margin: inlineTextMode ? "0 auto" : "0", width: "100%", display: (!inlineTextMode && handwrittenMode) ? "none" : undefined }}>
            {inlineTextMode && (
              <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", color: "#1a1a2e", marginBottom: "16px" }}>
                  Tekst van {studentName || "de leerling"}
                </div>
                <div style={{ position: "relative" }}>
                  <textarea value={inlineTextInput} onChange={e => { if (!handwrittenMode) setInlineTextInput(e.target.value); }}
                    onPaste={handwrittenMode ? undefined : handleImagePaste}
                    placeholder={"Plak hier de tekst van de leerling...\n\n💡 Tip: je kunt ook een screenshot plakken — de tekst wordt dan automatisch herkend."}
                    style={{ width: "100%", minHeight: "200px", border: "1px solid #ddd", borderRadius: "10px", padding: "14px", fontSize: "14px", fontFamily: "'Georgia', serif", lineHeight: "1.8", resize: "vertical", outline: "none", boxSizing: "border-box", color: "#1a1a2e", background: handwrittenMode ? "#f0f0f0" : "#fff", cursor: handwrittenMode ? "not-allowed" : "text", opacity: (handwrittenMode || ocrLoading) ? 0.6 : 1 }}
                    autoFocus />
                  {ocrLoading && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.85)", borderRadius: "10px", gap: "10px" }}>
                      <div style={{ width: "28px", height: "28px", border: "3px solid #e0e0e0", borderTopColor: "#4338CA", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      <span style={{ fontSize: "13px", color: "#4338CA", fontWeight: "600" }}>Tekst herkennen...</span>
                    </div>
                  )}
                </div>
                {ocrError && (
                  <div style={{ marginTop: "8px", padding: "10px 14px", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: "8px", fontSize: "12px", color: "#991B1B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⚠️ {ocrError}</span>
                    <button onClick={() => setOcrError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#991B1B", fontSize: "14px", padding: "0 4px", lineHeight: 1 }}>✕</button>
                  </div>
                )}
                {inlineTextInput.trim() && (
                  <div style={{ marginTop: "12px", padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "12px", color: "#92400E", lineHeight: "1.5" }}>
                    <strong>Let op:</strong> eenmaal ingevoerde tekst kan niet meer worden aangepast. Dubbelcheck of dit de volledige, ongewijzigde tekst van de leerling is.
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "14px", padding: "10px 12px", background: handwrittenMode ? "#F0FDF4" : "#f8f6f3", border: "1px solid " + (handwrittenMode ? "#86EFAC" : "#e5e1db"), borderRadius: "8px", cursor: inlineTextInput.trim() ? "not-allowed" : "pointer", fontSize: "12px", color: inlineTextInput.trim() ? "#bbb" : (handwrittenMode ? "#166534" : "#666"), lineHeight: "1.5", opacity: inlineTextInput.trim() ? 0.5 : 1 }}>
                  <div style={{ marginTop: "2px", width: "14px", height: "14px", borderRadius: "3px", border: "1.5px solid " + (handwrittenMode ? "#16a34a" : "#aaa"), background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: inlineTextInput.trim() ? "none" : "auto" }}
                    onClick={() => { if (!inlineTextInput.trim()) setHandwrittenMode(h => !h); }}>
                    {handwrittenMode && <span style={{ color: "#16a34a", fontSize: "10px", fontWeight: "800", lineHeight: 1 }}>✓</span>}
                  </div>
                  <span onClick={() => { if (!inlineTextInput.trim()) setHandwrittenMode(h => !h); }}>
                    <strong>Handmatig nakijken</strong> — de leerling heeft met de hand geschreven. Alleen het afvinklijstje wordt gebruikt. <em>Let op: je kunt later geen digitale tekst meer toevoegen.</em>
                  </span>
                </label>
                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button onClick={() => { if (handwrittenMode) { handleStartHandwritten(); } else { if (!inlineTextInput.trim()) return; setStudentText(inlineTextInput); handleStartGrading(inlineTextInput); } }}
                    disabled={!handwrittenMode && !inlineTextInput.trim()}
                    style={{ flex: 1, padding: "12px", fontSize: "14px", fontWeight: "600", background: (handwrittenMode || inlineTextInput.trim()) ? "#1a1a2e" : "#ccc", color: "#fff", border: "none", borderRadius: "10px", cursor: (handwrittenMode || inlineTextInput.trim()) ? "pointer" : "default" }}>
                    Start nakijken {"\u2192"}
                  </button>
                </div>
              </div>
            )}
            <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)", minHeight: "400px", display: inlineTextMode ? "none" : "block" }} onClick={() => selectHighlight(null)}>
              <HighlightableText text={studentText} highlights={highlights} onHighlight={handleTextSelection} onSelectHighlight={selectHighlight} hoveredItemId={hoveredItemId} selectedHighlightId={selectedHighlightId} itemNumbers={itemNumbers} />
            </div>
            {!inlineTextMode && <div style={{ marginTop: "10px", fontSize: "11px", color: "#aaa" }}>Selecteer tekst en klik op een item rechts, of klik eerst op een item en selecteer dan tekst.</div>}
            {!inlineTextMode && <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "11px", color: "#888" }}>
              {categories.filter((c) => catModes[c.id] !== "taalAuto").map((cat) => (<div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}><div style={{ width: "24px", height: "10px", borderRadius: "3px", background: cat.color.bg, border: "1px solid " + cat.color.border }} /><span>{cat.name}</span></div>))}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ backgroundImage: 'url("data:image/svg+xml,' + encodeURIComponent('<svg width="8" height="6" viewBox="0 0 8 6" xmlns="http://www.w3.org/2000/svg"><path d="M0 3 Q2 0.5 4 3 Q6 5.5 8 3" fill="none" stroke="' + TAAL_SUB_COLORS.Spelfouten.border + '" stroke-width="1.2"/></svg>') + '")', backgroundRepeat: "repeat-x", backgroundPosition: "bottom", backgroundSize: "8px 6px", paddingBottom: "4px", fontSize: "12px", color: "#666" }}>abc</span><span>Spelfout</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ backgroundImage: 'url("data:image/svg+xml,' + encodeURIComponent('<svg width="6" height="2" viewBox="0 0 6 2" xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="0.9" fill="' + TAAL_SUB_COLORS.Formuleringsfouten.border + '"/></svg>') + '")', backgroundRepeat: "repeat-x", backgroundPosition: "bottom", backgroundSize: "6px 2px", paddingBottom: "3px", fontSize: "12px", color: "#666" }}>abc</span><span>Formulering</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ borderRadius: "50%", boxShadow: "0 0 0 2px " + TAAL_SUB_COLORS.Interpunctiefouten.border, padding: "0 3px", fontSize: "12px", color: "#666" }}>.</span><span>Interpunctie</span></div>
            </div>}
          </div>

          {/* Correction panel */}
          {!inlineTextMode && <div style={{ background: "#fff", borderLeft: handwrittenMode ? "none" : "1px solid #e5e1db", overflowY: "auto", height: "100%", padding: handwrittenMode ? "32px" : "16px", maxWidth: handwrittenMode ? "560px" : "none", margin: handwrittenMode ? "0 auto" : "0", width: "100%" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", fontWeight: "700", marginBottom: "12px" }}>Correctieonderdelen</div>

            {categories.map((cat) => {
              const score = getCategoryScore(cat);
              const isActive = activeCategory?.id === cat.id;
              const mode = catModes[cat.id] || "checkIsBad";
              const isTaal = mode === "taalAuto";
              const tgm = {}, ni = [];
              cat.items.forEach((item) => { if (item.taalGroup && isTaal) { if (!tgm[item.taalGroup]) tgm[item.taalGroup] = []; tgm[item.taalGroup].push(item); } else if (!isTaal) ni.push(item); });

              return (
                <div key={cat.id} style={{ marginBottom: "14px", borderRadius: "12px", border: isActive ? "2px solid " + cat.color.border : "1px solid #eee", overflow: "hidden" }}>
                  <div onClick={() => { setActiveCategory(isActive ? null : cat); setActiveCategoryItem(null); setActiveTaalGroup(null); }}
                    style={{ padding: "10px 14px", background: isActive ? cat.color.bg : "#fafafa", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: cat.color.border }} />
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>{cat.name}</div>
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: score === cat.maxScore ? "#10B981" : score === 0 ? "#EF4444" : cat.color.text }}>{score}/{cat.maxScore}</div>
                  </div>

                  <div style={{ padding: "6px 8px 10px" }}>
                    {!isTaal && (() => {
                      const allChecked = ni.length > 0 && ni.every((item) => scores[cat.id]?.[item.id]);
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 6px", marginBottom: "4px", borderRadius: "6px", background: "#f8f8f8" }}>
                          {confirmCheckAll === cat.id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#991B1B" }}>
                              <span>Alles deselecteren?</span>
                              <button onClick={() => { checkAll(cat.id, false); setConfirmCheckAll(null); }} style={{ fontSize: "10px", background: "#EF4444", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", fontWeight: "600" }}>Ja</button>
                              <button onClick={() => setConfirmCheckAll(null)} style={{ fontSize: "10px", background: "#f3f3f3", color: "#666", border: "1px solid #ddd", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}>Nee</button>
                            </div>
                          ) : (<>
                            <input type="checkbox" checked={allChecked} onChange={() => { if (allChecked) setConfirmCheckAll(cat.id); else checkAll(cat.id, true); }}
                              style={{ accentColor: cat.color.border, cursor: "pointer", width: "14px", height: "14px" }} />
                            <span style={{ fontSize: "11px", color: "#999" }}>Alles selecteren</span>
                          </>)}
                        </div>
                      );
                    })()}

                    {isTaal && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 6px", marginBottom: "6px", borderRadius: "6px", background: isTaalTooShort ? "#FEE2E2" : "#f8f8f8" }}>
                        <input type="checkbox" checked={isTaalTooShort} onChange={() => setTaalTooShort(isTaalTooShort ? false : true)}
                          style={{ accentColor: "#EF4444", cursor: "pointer", width: "14px", height: "14px" }} />
                        <span style={{ fontSize: "11px", color: isTaalTooShort ? "#991B1B" : "#999" }}>Minder dan {minWords} woorden{isTaalTooShort ? " \u2192 score is 0" : ""}</span>
                        {!handwrittenMode && <span style={{ marginLeft: "auto", fontSize: "10px", color: "#bbb" }}>{wordCount} woorden</span>}
                      </div>
                    )}

                    {isTaal && Object.entries(tgm).map(([gl, items]) => {
                      const count = taalCounts[cat.id + "::" + gl] || 0;
                      const isGA = activeTaalGroup === gl && isActive;
                      const sc = TAAL_SUB_COLORS[gl] || cat.color;
                      const hasPending = !!pendingHighlight;
                      const selH = selectedHighlightId ? highlights.find((h) => h.id === selectedHighlightId) : null;
                      const isLinkedToSelected = selH && selH.taalGroup === gl && selH.categoryId === cat.id;
                      return (
                        <div key={gl} style={{ marginBottom: "10px" }} onMouseEnter={() => setHoveredItemId(gl)} onMouseLeave={() => setHoveredItemId(null)}>
                          <div onClick={() => handleItemClick(cat, null, gl, gl)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", cursor: "pointer",
                              background: isLinkedToSelected ? sc.bg : isGA ? sc.bg : hasPending ? "#FFFBEB" : "#f9f9f9",
                              border: isLinkedToSelected ? "2px solid " + sc.border : isGA ? "2px solid " + sc.border : hasPending ? "1px dashed #EAB308" : "1px solid #eee" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: sc.border, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800" }}>{sc.icon}</div>
                              <span style={{ fontSize: "13px", fontWeight: "600", color: "#333" }}>{gl}</span>
                            </div>
                            {!handwrittenMode && <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: count > 0 ? sc.bg : "#f3f3f3", border: "2px solid " + (count > 0 ? sc.border : "#ddd"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", color: count > 0 ? sc.text : "#ccc" }}>{count}</div>}
                          </div>
                          <div style={{ padding: handwrittenMode ? "4px 4px 0 4px" : "4px 4px 0 36px" }}>
                            {items.map((item) => { const checked = scores[cat.id]?.[item.id];
                              return (<div key={item.id}
                                onClick={handwrittenMode ? () => setScores(prev => {
                                  const cs = { ...prev[cat.id] };
                                  items.forEach(i => { cs[i.id] = false; });
                                  cs[item.id] = !checked;
                                  return { ...prev, [cat.id]: cs };
                                }) : undefined}
                                style={{ display: "flex", alignItems: "center", gap: "6px", padding: handwrittenMode ? "6px 8px" : "2px 0", fontSize: "11px", borderRadius: handwrittenMode ? "6px" : "0", cursor: handwrittenMode ? "pointer" : "default", background: handwrittenMode && checked ? sc.bg : "transparent", border: handwrittenMode ? "1px solid " + (checked ? sc.border : "transparent") : "none", marginBottom: handwrittenMode ? "3px" : "0" }}>
                                {handwrittenMode ? (
                                  <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "2px solid " + (checked ? sc.border : "#ccc"), background: checked ? sc.border : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {checked && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#fff" }} />}
                                  </div>
                                ) : (
                                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: checked ? sc.border : "#ddd", boxShadow: checked ? "0 0 6px " + sc.border + "66" : "none" }} />
                                )}
                                <span style={{ color: checked ? sc.text : (handwrittenMode ? "#666" : "#bbb"), fontWeight: checked ? "600" : "400" }}>{item.text}</span>
                                <span style={{ marginLeft: "auto", fontWeight: "700", fontSize: "11px", color: checked ? "#EF4444" : "transparent" }}>{"\u2212"}{item.points}</span>
                              </div>);
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {ni.map((item) => {
                      const checked = scores[cat.id]?.[item.id];
                      const isIA = activeCategoryItem === item.id && isActive;
                      const hCount = itemHighlightCounts[item.id] || 0;
                      const hasPending = !!pendingHighlight;
                      const selH = selectedHighlightId ? highlights.find((h) => h.id === selectedHighlightId) : null;
                      const isLinkedToSelected = selH && selH.itemId === item.id;
                      const isGood = mode === "checkIsGood" ? checked : !checked;
                      return (
                        <div key={item.id} onMouseEnter={() => setHoveredItemId(item.id)} onMouseLeave={() => setHoveredItemId(null)}
                          style={{ display: "flex", alignItems: "flex-start", gap: "6px", padding: "5px 6px", borderRadius: "6px",
                            background: isLinkedToSelected ? cat.color.bg : isIA ? cat.color.bg : hasPending ? "#FFFBEB" : "transparent",
                            border: isLinkedToSelected ? "2px solid " + cat.color.border : hasPending && !isIA ? "1px dashed #EAB308" : "1px solid transparent",
                            cursor: "pointer", marginBottom: "2px" }}>
                          <div onClick={() => toggleItem(cat.id, item.id)}
                            style={{ marginTop: "2px", width: "15px", height: "15px", borderRadius: "4px", border: "1.5px solid " + (checked ? cat.color.border : "#ccc"), background: checked ? cat.color.border : "#fff", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                            {checked && <span style={{ color: "#fff", fontSize: "10px", fontWeight: "800", lineHeight: 1 }}>✓</span>}
                          </div>
                          <div onClick={() => handleItemClick(cat, item.id, item.text, null)}
                            style={{ flex: 1, fontSize: "12px", color: isGood ? "#333" : "#aaa", textDecoration: (mode === "checkIsBad" && checked) ? "line-through" : "none", lineHeight: "1.4" }}>
                            {itemNumbers[item.id] && <sup style={{ fontSize: "9px", fontWeight: "800", marginRight: "3px", color: cat.color.border }}>{itemNumbers[item.id]}</sup>}{item.text}
                          </div>
                          {hCount > 0 && <span style={{ fontSize: "10px", background: cat.color.bg, color: cat.color.text, padding: "1px 6px", borderRadius: "8px", fontWeight: "600", flexShrink: 0 }}>{hCount}{"\u00D7"}</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ padding: "0 10px 10px" }}>
                    <input value={notes[cat.id] || ""} onChange={(e) => setNotes({ ...notes, [cat.id]: e.target.value })} placeholder="Opmerking..."
                      style={{ width: "100%", border: "1px solid #e8e8e8", borderRadius: "6px", padding: "5px 8px", fontSize: "11px", outline: "none", boxSizing: "border-box", color: "#444", background: "#fafafa" }}
                      onFocus={(e) => { e.target.style.borderColor = cat.color.border; e.target.style.background = "#fff"; }} onBlur={(e) => { e.target.style.borderColor = "#e8e8e8"; e.target.style.background = "#fafafa"; }} />
                  </div>
                </div>
              );
            })}

            {confirmReset ? (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <button onClick={() => { resetGrading(); setConfirmReset(false); }} style={{ flex: 1, padding: "8px", fontSize: "12px", background: "#EF4444", border: "none", borderRadius: "6px", color: "#fff", cursor: "pointer", fontWeight: "600" }}>Ja, reset alles</button>
                <button onClick={() => setConfirmReset(false)} style={{ flex: 1, padding: "8px", fontSize: "12px", background: "#f3f3f3", border: "1px solid #ddd", borderRadius: "6px", color: "#666", cursor: "pointer" }}>Annuleer</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} style={{ width: "100%", padding: "8px", fontSize: "12px", background: "transparent", border: "1px solid #ddd", borderRadius: "6px", color: "#aaa", cursor: "pointer", marginTop: "6px" }}
                onMouseEnter={(e) => { e.target.style.borderColor = "#EF4444"; e.target.style.color = "#EF4444"; }}
                onMouseLeave={(e) => { e.target.style.borderColor = "#ddd"; e.target.style.color = "#aaa"; }}>Reset alles</button>
            )}
            <div style={{ marginTop: "16px", borderTop: "1px solid #f0f0f0", paddingTop: "12px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", fontWeight: "700", marginBottom: "6px" }}>Overige opmerkingen</div>
              <textarea value={generalNote} onChange={e => setGeneralNote(e.target.value)} placeholder="Algemene opmerkingen bij deze beoordeling..."
                style={{ width: "100%", border: "1px solid #e8e8e8", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", outline: "none", boxSizing: "border-box", color: "#444", background: "#fafafa", resize: "vertical", minHeight: "60px", fontFamily: "inherit" }}
                onFocus={e => { e.target.style.borderColor = "#aaa"; e.target.style.background = "#fff"; }}
                onBlur={e => { e.target.style.borderColor = "#e8e8e8"; e.target.style.background = "#fafafa"; }} />
            </div>
          </div>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::selection { background: #3B82F6 !important; color: #fff !important; }
        ::-moz-selection { background: #3B82F6 !important; color: #fff !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
      `}</style>
    </div>
  );
}
