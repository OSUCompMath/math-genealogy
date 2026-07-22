const DATA_URLS = ["../data/osu_mgp_graph.json", "data/osu_mgp_graph.json"];
const DATA_VERSION = "20260722-usability-7";
const DEFAULT_VISIBLE_ANCESTORS = 60;
const ZOOM_REVEAL_MIN_ANCESTORS = 18;
const ZOOM_REVEAL_FULL_SCALE = 0.7;
const FULL_LINEAGE_LABEL_MIN = 18;
const FULL_LINEAGE_LABEL_MAX = 90;
const SHARED_TABLE_MAX_ROWS = 50;
const SHARED_BOTH_TABLE_MAX_ROWS = 24;
const GRAPH_SHARED_HIGHLIGHT_LIMIT = 18;
const PLACEMENT_YEAR_OFFSET = 5;
const PLACEMENT_YEAR_MIN = 650;
const PLACEMENT_YEAR_MAX = 2026;
const MIN_SCALE = 0.04;
const MAX_SCALE = 2.8;
const OVERVIEW_PADDING = 10;
const ADVISOR_PATH_INITIAL_COUNT = 10;
const SELECTION_CHIP_INITIAL_COUNT = 10;
const SELECTION_CHIP_INCREMENT = 25;
const DETAIL_FACULTY_INITIAL_COUNT = 10;
const DETAIL_FACULTY_INCREMENT = 25;
const VALID_VIEWS = new Set(["faculty", "graph", "details"]);
const VALID_FOCUS_MODES = new Set(["common", "faculty"]);
const GRAPH_ANCESTOR_PRESETS = [
  { label: "Ibn Sina", pid: "298616" },
  { label: "Gauss", pid: "18231" },
  { label: "Euler", pid: "38586" },
  { label: "Hilbert", pid: "7298" },
];

const state = {
  payload: null,
  people: [],
  faculty: [],
  unresolvedFaculty: [],
  groups: [],
  groupLabels: new Map(),
  edges: [],
  peopleMasks: [],
  estimatedYears: new Map(),
  selectedGroupId: "all-faculty",
  activeView: "graph",
  focusMode: "common",
  detailsOpen: false,
  areaMenuOpen: false,
  ancestorQuery: "",
  selectedAncestorIndex: null,
  selectedFaculty: new Set(),
  minShared: 2,
  visibleAncestorLimit: DEFAULT_VISIBLE_ANCESTORS,
  facultySearch: "",
  graphSearchQuery: "",
  graphSearchActiveIndex: 0,
  chainPathQuery: "",
  chainAnchorIndex: null,
  ancestorTableQuery: "",
  detailSectionOpen: {},
  detailSelectionSource: null,
  advisorPathLimit: ADVISOR_PATH_INITIAL_COUNT,
  advisorPathAnchorKey: "none",
  selectionChipLimit: SELECTION_CHIP_INITIAL_COUNT,
  selectionChipKey: "none",
  detailFacultyLimit: DETAIL_FACULTY_INITIAL_COUNT,
  detailFacultyKey: "none",
  graphNodes: [],
  nodePositions: new Map(),
  graphBounds: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 },
  yearRange: { min: 1100, max: 2026 },
  yearAxis: { top: 100, bottom: 1500 },
  currentGraphData: null,
  selectedNodeIndex: null,
  hoveredNodeIndex: null,
  pendingCenterNodeIndex: null,
  needsFit: "all",
  view: { scale: 1, x: 0, y: 0 },
  pointerDown: false,
  pointerMoved: false,
  pointerStart: { x: 0, y: 0 },
  viewStart: { x: 0, y: 0 },
  activePointers: new Map(),
  pinchStart: null,
  overviewTransform: null,
  isApplyingUrlState: false,
};

const els = {
  appShell: document.querySelector(".app-shell"),
  sourceRow: document.querySelector("#sourceRow"),
  viewTabs: Array.from(document.querySelectorAll(".view-tabs button")),
  areaMenu: document.querySelector("#areaMenu"),
  areaMenuButton: document.querySelector("#areaMenuButton"),
  areaMenuCurrent: document.querySelector("#areaMenuCurrent"),
  areaMenuCount: document.querySelector("#areaMenuCount"),
  areaMenuList: document.querySelector("#areaMenuList"),
  areaSummary: document.querySelector("#areaSummary"),
  facultyList: document.querySelector("#facultyList"),
  facultySearch: document.querySelector("#facultySearch"),
  selectAllFaculty: document.querySelector("#selectAllFaculty"),
  clearFaculty: document.querySelector("#clearFaculty"),
  metrics: document.querySelector("#metrics"),
  graphTitle: document.querySelector("#graphTitle"),
  graphSubtitle: document.querySelector("#graphSubtitle"),
  currentViewSummary: document.querySelector("#currentViewSummary"),
  graphBreadcrumbs: document.querySelector("#graphBreadcrumbs"),
  graphSearch: document.querySelector("#graphSearch"),
  graphSearchResults: document.querySelector("#graphSearchResults"),
  graphAncestorPresets: document.querySelector("#graphAncestorPresets"),
  graphSelectionCard: document.querySelector("#graphSelectionCard"),
  selectionChips: document.querySelector("#selectionChips"),
  loadingState: document.querySelector("#loadingState"),
  questionStrip: document.querySelector("#questionStrip"),
  graphDensityNote: document.querySelector("#graphDensityNote"),
  sharedLegendLabel: document.querySelector("#sharedLegendLabel"),
  floatingZoomButtons: Array.from(document.querySelectorAll("[data-zoom-action]")),
  sharedAncestorsPanel: document.querySelector("#sharedAncestorsPanel"),
  sharedAncestorsTitle: document.querySelector("#sharedAncestorsTitle"),
  sharedAncestorsSummary: document.querySelector("#sharedAncestorsSummary"),
  sharedAncestorsNote: document.querySelector("#sharedAncestorsNote"),
  ancestorTableSearch: document.querySelector("#ancestorTableSearch"),
  ancestorMatchedHeader: document.querySelector("#ancestorMatchedHeader"),
  dataFootnote: document.querySelector("#dataFootnote"),
  detailBackdrop: document.querySelector("#detailBackdrop"),
  backToGroupView: document.querySelector("#backToGroupView"),
  clearSelectedNode: document.querySelector("#clearSelectedNode"),
  closeDetailsSheet: document.querySelector("#closeDetailsSheet"),
  ancestorRows: document.querySelector("#ancestorRows"),
  summaryPanel: document.querySelector("#summaryPanel"),
  relationshipPanel: document.querySelector("#relationshipPanel"),
  nodeDetail: document.querySelector("#nodeDetail"),
  chainPanel: document.querySelector("#chainPanel"),
  canvas: document.querySelector("#graphCanvas"),
  overview: document.querySelector("#overviewCanvas"),
  tooltip: document.querySelector("#graphTooltip"),
};

const ctx = els.canvas.getContext("2d");
const overviewCtx = els.overview.getContext("2d");
const CANVAS_FONT = "BuckeyeSans, HelveticaNeue, Helvetica, Arial, sans-serif";
const OSU_COLORS = {
  scarlet: "#ba0c2f",
  scarletDark40: "#70071c",
  scarletDark60: "#4a0513",
  gray: "#a7b1b7",
  grayLight20: "#bfc6cb",
  grayLight40: "#cfd4d8",
  grayLight60: "#dfe3e5",
  grayLight80: "#eff1f2",
  grayLight90: "#f6f7f8",
  grayDark20: "#868e92",
  grayDark40: "#646a6e",
  grayDark60: "#3f4443",
  grayDark80: "#212325",
  shared: "#00707a",
  sharedDark: "#004f56",
  sharedLight: "#5f9ea5",
  white: "#ffffff",
};

function hexToBigInt(hex) {
  return BigInt(`0x${hex || "0"}`);
}

function bitCount(value) {
  let count = 0;
  let cursor = value;
  while (cursor > 0n) {
    cursor &= cursor - 1n;
    count += 1;
  }
  return count;
}

function yearNumber(person) {
  const match = String(person.year || "").match(/\d{3,4}/);
  return match ? Number(match[0]) : null;
}

function isInferredYear(person) {
  return person?.year_kind === "inferred";
}

function median(values) {
  if (!values.length) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function estimatedYearForIndex(personIndex) {
  const year = state.estimatedYears.get(personIndex);
  return Number.isFinite(year) ? year : null;
}

function placementYearForIndex(personIndex) {
  const directYear = yearNumber(state.people[personIndex]);
  if (Number.isFinite(directYear)) {
    return directYear;
  }
  return estimatedYearForIndex(personIndex);
}

function estimateMissingYears() {
  const directYears = new Map();
  const placementYears = new Map();
  state.people.forEach((person, personIndex) => {
    const year = yearNumber(person);
    if (Number.isFinite(year)) {
      directYears.set(personIndex, year);
      placementYears.set(personIndex, year);
    }
  });

  const estimatedYears = new Map();
  for (let pass = 0; pass < 16; pass += 1) {
    const proposals = new Map();
    const addProposal = (personIndex, year) => {
      if (
        directYears.has(personIndex) ||
        !Number.isFinite(year) ||
        year < PLACEMENT_YEAR_MIN ||
        year > PLACEMENT_YEAR_MAX
      ) {
        return;
      }
      if (!proposals.has(personIndex)) {
        proposals.set(personIndex, []);
      }
      proposals.get(personIndex).push(year);
    };

    state.edges.forEach(([advisorIndex, studentIndex]) => {
      const advisorYear = placementYears.get(advisorIndex);
      const studentYear = placementYears.get(studentIndex);
      if (!Number.isFinite(advisorYear) && Number.isFinite(studentYear)) {
        addProposal(advisorIndex, studentYear - PLACEMENT_YEAR_OFFSET);
      }
      if (Number.isFinite(advisorYear) && !Number.isFinite(studentYear)) {
        addProposal(studentIndex, advisorYear + PLACEMENT_YEAR_OFFSET);
      }
    });

    let changed = false;
    proposals.forEach((years, personIndex) => {
      const proposed = Math.round(clamp(median(years), PLACEMENT_YEAR_MIN, PLACEMENT_YEAR_MAX));
      const previous = placementYears.get(personIndex);
      if (!Number.isFinite(previous) || Math.abs(previous - proposed) > 1) {
        placementYears.set(personIndex, proposed);
        estimatedYears.set(personIndex, proposed);
        changed = true;
      }
    });
    if (!changed) {
      break;
    }
  }

  return estimatedYears;
}

function personDegreeYear(person) {
  if (!person) {
    return "";
  }
  return person.degree_year || (isInferredYear(person) ? "" : person.year || "");
}

function countryLabel(country) {
  const labels = {
    UnitedKingdom: "United Kingdom",
    UnitedStates: "United States",
  };
  return labels[country] || country || "";
}

function personDegreeCountry(person) {
  if (!person) {
    return "";
  }
  return countryLabel(person.degree_country || (isInferredYear(person) ? "" : person.country || ""));
}

function personDegreeLabel(person) {
  const parts = [personDegreeYear(person), personDegreeCountry(person)].filter(Boolean);
  return parts.join(", ");
}

function graphYearLabel(person, personIndex = null) {
  if (!person?.year) {
    const estimatedYear = Number.isInteger(personIndex) ? estimatedYearForIndex(personIndex) : null;
    return estimatedYear ? `placed near ${estimatedYear}` : "";
  }
  return isInferredYear(person) ? `placed near ${person.year}` : person.year;
}

function tableYearLabel(person, personIndex = null) {
  if (!person?.year) {
    const estimatedYear = Number.isInteger(personIndex) ? estimatedYearForIndex(personIndex) : null;
    return estimatedYear ? `~${estimatedYear}` : "";
  }
  return isInferredYear(person) ? `~${person.year}` : person.year;
}

function tableYearTitle(person, personIndex = null) {
  if (isInferredYear(person)) {
    return "Estimated graph placement year";
  }
  if (yearNumber(person)) {
    return "Degree year from the genealogy record";
  }
  return estimatedYearForIndex(personIndex)
    ? "Approximate placement from dated advisor and student records"
    : "No year in the genealogy record";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/gi, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTokens(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function textMatchesSearch(value, query) {
  const normalized = normalizeSearchText(value);
  const tokens = searchTokens(query);
  return !tokens.length || tokens.every((token) => normalized.includes(token));
}

function personMeta(person, personIndex = null) {
  const degree = personDegreeLabel(person);
  if (degree) {
    return degree;
  }
  return graphYearLabel(person, personIndex) || "";
}

function snapshotDateLabel() {
  const generatedAt = state.payload?.metadata?.generated_at;
  if (!generatedAt) {
    return "static snapshot";
  }
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) {
    return "static snapshot";
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function trimLabel(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function wrapWords(value, maxChars = 18, maxLines = 2) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    lines[lines.length - 1] = trimLabel(lines[lines.length - 1], Math.max(8, maxChars - 1));
  }
  return lines;
}

async function loadData() {
  let lastError = null;
  for (const url of DATA_URLS) {
    try {
      const separator = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${separator}v=${DATA_VERSION}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function allFacultyGroup(faculty) {
  return {
    id: "all-faculty",
    label: "All Faculty",
    faculty_indices: faculty.map((record) => Number(record.faculty_index)),
    faculty_mask: "",
  };
}

function initializeData(payload) {
  state.payload = payload;
  state.people = payload.people;
  state.faculty = payload.faculty;
  state.unresolvedFaculty = payload.unresolved_faculty || [];
  state.edges = payload.edges;
  state.peopleMasks = state.people.map((person) => hexToBigInt(person.faculty_mask));
  state.estimatedYears = estimateMissingYears();
  const dataGroups = Object.values(payload.faculty_groups || {}).sort(
    (a, b) => b.faculty_indices.length - a.faculty_indices.length || a.label.localeCompare(b.label),
  );
  state.groups = [allFacultyGroup(state.faculty), ...dataGroups];
  state.groupLabels = new Map(state.groups.map((group) => [group.id, group.label]));
  selectGroup("all-faculty", false);
  applyUrlState();
}

function activeGroup() {
  return state.groups.find((group) => group.id === state.selectedGroupId) || state.groups[0];
}

function groupFacultyIndices() {
  const group = activeGroup();
  return group ? group.faculty_indices.map(Number) : [];
}

function activeFacultyIndices() {
  return Array.from(state.selectedFaculty).sort((a, b) => a - b);
}

function maskForFaculty(indices) {
  return indices.reduce((mask, index) => mask | (1n << BigInt(index)), 0n);
}

function personIndexByMgpId(id) {
  const rawIndex = state.payload?.indexes?.id_to_index?.[String(id).trim()];
  const index = Number(rawIndex);
  return Number.isInteger(index) ? index : null;
}

function descendantFacultyIndices(personIndex, scopeIndices = groupFacultyIndices()) {
  const personMask = state.peopleMasks[personIndex] || 0n;
  return scopeIndices.filter((index) => (personMask & (1n << BigInt(index))) !== 0n);
}

function distanceMapForPerson(personIndex) {
  const rows = state.payload.indexes.distances_by_person[String(personIndex)] || [];
  return new Map(rows.map(([facultyIndex, distance]) => [Number(facultyIndex), Number(distance)]));
}

function sameFacultySet(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function isCustomSelection() {
  return !sameFacultySet(activeFacultyIndices(), groupFacultyIndices());
}

function isIntentionalFacultyComparison(active = activeFacultyIndices()) {
  return state.selectedAncestorIndex === null && active.length > 1 && isCustomSelection();
}

function isDefaultTwoFacultyComparison(active = activeFacultyIndices()) {
  return isIntentionalFacultyComparison(active) && active.length === 2 && state.selectedNodeIndex === null;
}

function isGroupLineageView() {
  return state.selectedAncestorIndex === null && !isCustomSelection();
}

function isFullLineageSelection(facultyIndices = activeFacultyIndices()) {
  return state.selectedAncestorIndex === null && facultyIndices.length > 0;
}

function selectionTitle() {
  if (state.selectedAncestorIndex !== null) {
    const person = state.people[state.selectedAncestorIndex];
    return person ? `Descendants of ${person.name}` : "Ancestor Descendants";
  }
  if (!activeFacultyIndices().length) {
    return "Custom Selection";
  }
  const active = activeFacultyIndices();
  if (active.length === 1 && state.selectedAncestorIndex === null) {
    return state.faculty[active[0]]?.osu_name || "Selected Faculty";
  }
  return isCustomSelection() ? "Custom Selection" : activeGroup()?.label || "Selection";
}

function markGraphChanged(fitMode = "width") {
  state.selectedNodeIndex = null;
  state.chainAnchorIndex = null;
  state.ancestorTableQuery = "";
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.needsFit = fitMode;
  hideTooltip();
}

function selectGroup(groupId, shouldRender = true) {
  state.selectedGroupId = groupId;
  state.areaMenuOpen = false;
  state.selectedFaculty = state.selectedAncestorIndex === null
    ? new Set(groupFacultyIndices())
    : new Set(descendantFacultyIndices(state.selectedAncestorIndex));
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  markGraphChanged("all");
  if (shouldRender) {
    render();
  }
}

function setActiveView(view, shouldRender = true) {
  if (!VALID_VIEWS.has(view)) {
    return;
  }
  state.activeView = view;
  if (view !== "graph") {
    state.detailsOpen = false;
  }
  syncNavigation();
  if (shouldRender) {
    render();
  }
}

function selectGraphNode(personIndex, options = {}) {
  if (personIndex === null || personIndex === undefined || !state.people[personIndex]) {
    state.selectedNodeIndex = null;
    state.chainAnchorIndex = null;
    state.detailSelectionSource = null;
    render();
    return;
  }
  state.selectedNodeIndex = personIndex;
  state.chainAnchorIndex = null;
  state.detailSelectionSource = options.source || "graph";
  state.pendingCenterNodeIndex = personIndex;
  if (options.focusMode) {
    state.focusMode = options.focusMode;
    state.needsFit = options.fitMode || "width";
  }
  hideTooltip();
  render();
}

function showAdvisorPathsForNode(personIndex) {
  if (personIndex === null || personIndex === undefined) {
    return;
  }
  state.chainAnchorIndex = personIndex;
  state.pendingCenterNodeIndex = personIndex;
  setDetailSectionOpen("chains", true);
  state.activeView = "graph";
  state.detailsOpen = false;
  hideTooltip();
  render();
}

function selectTableAncestor(personIndex) {
  if (personIndex === null || personIndex === undefined || !state.people[personIndex]) {
    return;
  }
  state.selectedNodeIndex = personIndex;
  state.chainAnchorIndex = null;
  state.detailSelectionSource = "table";
  state.ancestorTableQuery = "";
  setDetailSectionOpen("shared-table", false);
  setDetailSectionOpen("selection", true);
  setDetailSectionOpen("chains", false);
  state.pendingCenterNodeIndex = personIndex;
  state.detailsOpen = false;
  hideTooltip();
  render();
}

function clearSelectedNode(shouldRender = true) {
  state.selectedNodeIndex = null;
  state.chainAnchorIndex = null;
  state.detailSelectionSource = null;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.needsFit = "all";
  hideTooltip();
  if (shouldRender) {
    render();
  }
}

function backToGroupView(shouldRender = true) {
  state.selectedAncestorIndex = null;
  state.ancestorQuery = "";
  state.selectedNodeIndex = null;
  state.chainAnchorIndex = null;
  state.detailSelectionSource = null;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.selectedFaculty = new Set(groupFacultyIndices());
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  state.focusMode = "common";
  state.chainPathQuery = "";
  markGraphChanged("all");
  if (shouldRender) {
    render();
  }
}

function setDetailsOpen(isOpen, shouldRender = true) {
  state.detailsOpen = Boolean(isOpen);
  if (state.detailsOpen) {
    state.activeView = "graph";
  }
  syncNavigation();
  if (shouldRender) {
    render();
  }
}

function syncNavigation() {
  els.appShell.dataset.activeView = state.activeView;
  els.appShell.dataset.detailsOpen = String(Boolean(state.detailsOpen));
  if (els.detailBackdrop) {
    els.detailBackdrop.hidden = !state.detailsOpen;
  }
  els.viewTabs.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.activeView));
  });
  if (els.clearSelectedNode) {
    els.clearSelectedNode.disabled = state.selectedNodeIndex === null;
  }
  if (els.backToGroupView) {
    els.backToGroupView.disabled = state.selectedAncestorIndex === null && !isCustomSelection() && state.selectedNodeIndex === null && state.focusMode === "common";
  }
}

function closeDetailsView(shouldRender = true) {
  if (state.activeView === "details") {
    setActiveView("graph", shouldRender);
    return;
  }
  setDetailsOpen(false, shouldRender);
}

function facultyIndexByMgpId(id) {
  const needle = String(id || "").trim();
  if (!needle) {
    return null;
  }
  const row = state.faculty.find((faculty) => String(faculty.mgp_id) === needle);
  return row ? Number(row.faculty_index) : null;
}

function currentShareUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.delete("area");
  params.delete("ancestor");
  params.delete("faculty");
  params.delete("focus");
  params.delete("view");
  params.delete("min");
  params.delete("limit");
  params.delete("node");

  if (state.selectedGroupId !== "all-faculty") {
    params.set("area", state.selectedGroupId);
  }
  if (state.selectedAncestorIndex !== null) {
    params.set("ancestor", state.people[state.selectedAncestorIndex]?.id || "");
  } else if (isCustomSelection()) {
    const ids = activeFacultyIndices()
      .map((index) => state.faculty[index]?.mgp_id)
      .filter(Boolean);
    params.set("faculty", ids.length ? ids.join(",") : "none");
  }
  if (state.activeView !== "graph") {
    params.set("view", state.activeView);
  }
  return url.toString();
}

function writeUrlState() {
  if (state.isApplyingUrlState || !state.payload) {
    return;
  }
  window.history.replaceState(null, "", currentShareUrl());
}

function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.isApplyingUrlState = true;

  const view = params.get("view");
  if (view && VALID_VIEWS.has(view)) {
    state.activeView = view;
    state.detailsOpen = false;
  }

  const focus = params.get("focus");
  if (focus && VALID_FOCUS_MODES.has(focus)) {
    state.focusMode = focus;
  }

  const groupId = params.get("area");
  if (groupId && state.groups.some((group) => group.id === groupId)) {
    selectGroup(groupId, false);
  }

  const ancestorId = params.get("ancestor") || params.get("pid");
  const ancestorIndex = ancestorId ? personIndexByMgpId(ancestorId) : null;
  if (ancestorIndex !== null) {
    applyAncestorPerson(ancestorIndex, false);
  } else {
    const facultyParam = params.get("faculty");
    if (facultyParam) {
      state.selectedAncestorIndex = null;
      if (facultyParam === "none") {
        state.selectedFaculty = new Set();
      } else {
        const facultyIndices = facultyParam
          .split(",")
          .map((id) => facultyIndexByMgpId(id))
          .filter(Number.isInteger);
        state.selectedFaculty = new Set(facultyIndices);
      }
      markGraphChanged("all");
    }
  }

  state.isApplyingUrlState = false;
  syncNavigation();
}

function renderSources() {
  const metadata = state.payload.metadata;
  const rosterCount = metadata.roster_faculty_count || metadata.faculty_count + (metadata.unresolved_faculty_count || 0);
  els.sourceRow.innerHTML = `
    <span>${rosterCount} roster faculty</span>
    <span>${metadata.person_count} people in graph</span>
    <a href="${metadata.faculty_source}" target="_blank" rel="noreferrer">OSU source</a>
    <a href="${metadata.mgp_source}" target="_blank" rel="noreferrer">Genealogy source</a>
  `;
}

function renderDataFootnote() {
  const metadata = state.payload?.metadata || {};
  els.dataFootnote.innerHTML = `
    <div class="snapshot-line">
      Snapshot from ${escapeHtml(snapshotDateLabel())}:
      ${Number(metadata.faculty_count || state.faculty.length).toLocaleString()} faculty in graph,
      ${Number(metadata.roster_faculty_count || state.faculty.length).toLocaleString()} roster faculty,
      ${Number(metadata.person_count || state.people.length).toLocaleString()} people in the graph.
      Static data from the Ohio State Mathematics roster and Math Genealogy Project.
    </div>
  `;
}

function groupRosterCount(groupId) {
  if (groupId === "all-faculty") {
    return state.faculty.length + state.unresolvedFaculty.length;
  }
  const group = state.groups.find((row) => row.id === groupId);
  const graphCount = group ? group.faculty_indices.length : 0;
  const rosterOnlyCount = state.unresolvedFaculty.filter((faculty) => (faculty.groups || []).includes(groupId)).length;
  return graphCount + rosterOnlyCount;
}

function renderGroups() {
  const group = activeGroup();
  const selectedCount = activeFacultyIndices().length;
  const rosterCount = groupRosterCount(group.id);
  els.areaMenuCurrent.textContent = group.label;
  els.areaMenuCount.textContent = `${rosterCount} faculty`;
  els.areaMenuButton.setAttribute("aria-expanded", String(state.areaMenuOpen));
  els.areaMenuList.hidden = !state.areaMenuOpen;
  els.areaMenuList.innerHTML = state.groups
    .map((row) => {
      const selected = row.id === state.selectedGroupId;
      return `
        <button
          type="button"
          class="area-menu-option${selected ? " is-selected" : ""}"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-group-id="${escapeHtml(row.id)}"
        >
          <span class="area-menu-option-name">${escapeHtml(row.label)}</span>
          <span class="area-menu-option-count">${groupRosterCount(row.id)}</span>
        </button>
      `;
    })
    .join("");
  els.areaMenuList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectGroup(button.dataset.groupId));
  });
  const graphCount = group.faculty_indices.length;
  els.areaSummary.textContent = isCustomSelection()
    ? `${selectedCount} selected for graph from ${group.label}`
    : rosterCount === graphCount
      ? `${graphCount} faculty in ${group.label}`
      : `${rosterCount} listed in ${group.label}; ${graphCount} in graph`;
}

function applyAncestorPerson(personIndex, shouldRender = true) {
  const person = state.people[personIndex];
  if (!person) {
    return;
  }
  state.selectedAncestorIndex = personIndex;
  state.ancestorQuery = person.name;
  state.graphSearchQuery = "";
  state.graphSearchActiveIndex = 0;
  state.selectedFaculty = new Set(descendantFacultyIndices(personIndex));
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  state.focusMode = "common";
  markGraphChanged("width");
  state.selectedNodeIndex = personIndex;
  state.detailSelectionSource = "graph";
  state.pendingCenterNodeIndex = personIndex;
  if (shouldRender) {
    render();
  }
}

function clearAncestorFilter(shouldRender = true) {
  state.selectedAncestorIndex = null;
  state.ancestorQuery = "";
  state.selectedFaculty = new Set(groupFacultyIndices());
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  markGraphChanged("all");
  if (shouldRender) {
    render();
  }
}

function facultyAreaTags(faculty) {
  const labels = faculty.groups
    .map((groupId) => state.groupLabels.get(groupId))
    .filter(Boolean)
    .slice(0, 3);
  if (!labels.length) {
    return "";
  }
  const extra = faculty.groups.length > labels.length ? ` +${faculty.groups.length - labels.length}` : "";
  return `<span class="faculty-areas">${escapeHtml(labels.join("; "))}${extra}</span>`;
}

function facultyMatchesSearch(faculty, query) {
  if (!query) {
    return true;
  }
  return `${faculty.osu_name} ${faculty.title} ${(faculty.filed_in || []).join(" ")} ${(faculty.expertise || []).join(" ")}`
    .toLowerCase()
    .includes(query);
}

function facultyOsuProfileUrl(faculty) {
  return faculty.osu_profile_url || faculty.profile_url || "";
}

function facultyWebsiteUrl(faculty) {
  return faculty.website_url || faculty.professional_website_url || facultyOsuProfileUrl(faculty);
}

function facultyWebsiteLabel(faculty) {
  return faculty.professional_website_url ? "Personal website" : "OSU profile";
}

function facultyNameLink(faculty, className = "") {
  const url = facultyWebsiteUrl(faculty);
  const classAttr = className ? ` class="${className}"` : "";
  if (!url) {
    return `<span${classAttr}>${escapeHtml(faculty.osu_name)}</span>`;
  }
  return `
    <a${classAttr}
      href="${escapeHtml(url)}"
      target="_blank"
      rel="noreferrer"
      title="${escapeHtml(facultyWebsiteLabel(faculty))}"
    >${escapeHtml(faculty.osu_name)}</a>
  `;
}

function facultyGraphButton(faculty, className = "") {
  const personIndex = Number(faculty?.person_index);
  const classAttr = className ? ` class="${className}"` : "";
  if (!Number.isInteger(personIndex)) {
    return `<span${classAttr}>${escapeHtml(faculty?.osu_name || "Faculty")}</span>`;
  }
  return `
    <button
      type="button"
      ${classAttr}
      data-graph-person-index="${personIndex}"
      title="Center ${escapeHtml(faculty.osu_name)} in the graph"
    >${escapeHtml(faculty.osu_name)}</button>
  `;
}

function facultyAreaLabels(faculty, limit = 5) {
  const labels = (faculty.groups || [])
    .map((groupId) => state.groupLabels.get(groupId))
    .filter(Boolean);
  const visible = labels.slice(0, limit);
  const extra = labels.length > visible.length ? ` +${labels.length - visible.length}` : "";
  return visible.length ? `${visible.join("; ")}${extra}` : (faculty.filed_in || []).join("; ");
}

function facultyDegreeSummary(faculty, person) {
  const school = faculty.mgp_degree_school || "";
  const year = faculty.mgp_degree_year || personDegreeYear(person);
  if (school && year) {
    return `${school}, ${year}`;
  }
  return school || year;
}

function advisorNamesForPerson(person) {
  return (person?.advisor_indices || [])
    .map((index) => state.people[index]?.name)
    .filter(Boolean);
}

function summaryCardHtml(card) {
  const value = card.valueHtml || escapeHtml(card.value);
  const detail = card.detailHtml ?? (
    card.detail === undefined || card.detail === null || card.detail === ""
      ? ""
      : escapeHtml(card.detail)
  );
  return `
    <div class="summary-card${card.className ? ` ${escapeHtml(card.className)}` : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${value}</strong>
      ${detail ? `<em>${detail}</em>` : ""}
    </div>
  `;
}

function answerCalloutHtml(text, detail = "") {
  return `
    <div class="answer-callout">
      <strong>${escapeHtml(text)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </div>
  `;
}

function answerCalloutActionHtml(prefix, label, suffix, detail, action) {
  return `
    <div class="answer-callout">
      <strong>${escapeHtml(prefix)}<button type="button" class="summary-link-button" data-summary-action="${escapeHtml(action)}">${escapeHtml(label)}</button>${escapeHtml(suffix)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </div>
  `;
}

function detailSectionOpenAttr(key, defaultOpen = false) {
  const stored = state.detailSectionOpen[detailSectionStateKey(key)];
  const isOpen = stored === undefined ? defaultOpen : Boolean(stored);
  return isOpen ? " open" : "";
}

function detailContextKey() {
  if (state.selectedNodeIndex !== null) {
    return `node:${state.selectedNodeIndex}`;
  }
  if (state.selectedAncestorIndex !== null) {
    return `ancestor:${state.selectedAncestorIndex}`;
  }
  const active = activeFacultyIndices();
  if (active.length === 2) {
    return `pair:${active.join(",")}`;
  }
  if (isCustomSelection()) {
    return `custom:${active.join(",")}`;
  }
  return `group:${state.selectedGroupId}`;
}

function detailSectionStateKey(key) {
  return `${detailContextKey()}::${key}`;
}

function setDetailSectionOpen(key, isOpen) {
  state.detailSectionOpen[detailSectionStateKey(key)] = Boolean(isOpen);
}

function isDetailSectionOpen(key, defaultOpen = false) {
  const stored = state.detailSectionOpen[detailSectionStateKey(key)];
  return stored === undefined ? defaultOpen : Boolean(stored);
}

function bindDetailSectionToggles(container) {
  container.querySelectorAll("details[data-detail-section]").forEach((details) => {
    details.addEventListener("toggle", () => {
      setDetailSectionOpen(details.dataset.detailSection, details.open);
      if (!details.open) {
        return;
      }
      const panel = details.closest(".detail-panel");
      if (!panel) {
        return;
      }
      panel.querySelectorAll("details[data-detail-section]").forEach((other) => {
        if (other !== details && other.open) {
          other.open = false;
          setDetailSectionOpen(other.dataset.detailSection, false);
        }
      });
    });
  });
}

function facultyByPersonIndex(personIndex) {
  return state.faculty.find((faculty) => Number(faculty.person_index) === personIndex) || null;
}

function graphSearchRows() {
  const query = normalizeSearchText(state.graphSearchQuery.trim());
  if (!query) {
    return [];
  }
  const terms = query.split(/\s+/).filter(Boolean);
  const rows = [];
  const seen = new Set();

  state.faculty.forEach((faculty) => {
    const personIndex = Number(faculty.person_index);
    const haystack = normalizeSearchText(`${faculty.osu_name} ${faculty.mgp_name} ${faculty.title} ${(faculty.filed_in || []).join(" ")}`);
    if (!terms.every((term) => haystack.includes(term))) {
      return;
    }
    seen.add(personIndex);
    rows.push({
      personIndex,
      facultyIndex: Number(faculty.faculty_index),
      label: faculty.osu_name,
      meta: "Faculty",
      hint: facultyAreaLabels(faculty, 2) || faculty.title || "Center on graph",
      kind: "Faculty",
      rank: haystack.startsWith(query) ? 0 : 1,
    });
  });

  state.people.forEach((person, personIndex) => {
    if (seen.has(personIndex)) {
      return;
    }
    const estimatedYear = estimatedYearForIndex(personIndex);
    const haystack = normalizeSearchText(
      `${person.name} ${person.degree_year || ""} ${person.year} ${estimatedYear || ""} ${person.year_kind || ""} ${person.degree_country || ""} ${person.country} ${countryLabel(person.degree_country)} ${countryLabel(person.country)}`,
    );
    if (!terms.every((term) => haystack.includes(term))) {
      return;
    }
    const scopedDescendants = descendantFacultyIndices(personIndex).length;
    const fullDescendants = descendantFacultyIndices(
      personIndex,
      state.faculty.map((faculty) => Number(faculty.faculty_index)),
    ).length;
    const descendantHint = scopedDescendants === fullDescendants
      ? `${scopedDescendants} OSU faculty descendants`
      : `${scopedDescendants} in ${activeGroup()?.label || "current area"}; ${fullDescendants} OSU faculty descendants`;
    rows.push({
      personIndex,
      label: person.name,
      meta: "Show descendants",
      hint: `${descendantHint} | ${personMeta(person, personIndex) || "genealogy record"}`,
      kind: "Ancestor",
      rank: haystack.startsWith(query) ? 2 : 3,
    });
  });

  return rows
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, 9);
}

function hasWikipediaArticle(personIndex) {
  return Boolean(state.people[personIndex]?.wikipedia_url);
}

function activateGraphSearchRow(row) {
  if (!row) {
    return;
  }
  state.graphSearchQuery = "";
  state.graphSearchActiveIndex = 0;
  state.selectedAncestorIndex = null;
  state.ancestorQuery = "";
  state.focusMode = "common";

  if (row.kind === "Faculty" && Number.isInteger(row.facultyIndex)) {
    state.selectedFaculty = new Set([row.facultyIndex]);
    state.minShared = 1;
    markGraphChanged("width");
    state.selectedNodeIndex = row.personIndex;
    state.chainAnchorIndex = null;
    state.detailSelectionSource = "graph";
    state.pendingCenterNodeIndex = row.personIndex;
    setActiveView("graph", false);
    render();
    return;
  }

  if (row.kind === "Ancestor") {
    applyAncestorPerson(row.personIndex, false);
    state.focusMode = "common";
    state.needsFit = "width";
    setActiveView("graph", false);
    render();
    return;
  }

  markGraphChanged("width");
  state.selectedNodeIndex = row.personIndex;
  state.chainAnchorIndex = null;
  state.detailSelectionSource = "graph";
  state.pendingCenterNodeIndex = row.personIndex;
  setActiveView("graph", false);
  render();
}

function renderGraphSearch() {
  els.graphSearch.value = state.graphSearchQuery;
  const rows = graphSearchRows();
  if (!state.graphSearchQuery.trim()) {
    els.graphSearchResults.innerHTML = "";
    els.graphSearchResults.hidden = true;
    return;
  }
  if (!rows.length) {
    els.graphSearchResults.innerHTML = `<div class="graph-search-empty">No person in this graph matches.</div>`;
    els.graphSearchResults.hidden = false;
    return;
  }

  state.graphSearchActiveIndex = clamp(state.graphSearchActiveIndex, 0, rows.length - 1);
  els.graphSearchResults.innerHTML = rows
    .map((row, index) => `
      <button
        type="button"
        data-result-index="${index}"
        aria-selected="${index === state.graphSearchActiveIndex ? "true" : "false"}"
      >
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row.meta)}</span>
        <small>${escapeHtml(row.hint)}</small>
      </button>
    `)
    .join("");
  els.graphSearchResults.hidden = false;
  els.graphSearchResults.querySelectorAll("button").forEach((button) => {
    button.addEventListener("mouseenter", () => {
      const nextIndex = Number(button.dataset.resultIndex);
      if (nextIndex !== state.graphSearchActiveIndex) {
        state.graphSearchActiveIndex = nextIndex;
        renderGraphSearch();
      }
    });
    button.addEventListener("click", () => {
      activateGraphSearchRow(rows[Number(button.dataset.resultIndex)]);
    });
  });
}

function renderGraphAncestorPresets() {
  if (!els.graphAncestorPresets) {
    return;
  }
  const query = normalizeSearchText(state.graphSearchQuery.trim());
  const showAll = query.includes("descendant") || query.includes("ancestor");
  const presetRows = GRAPH_ANCESTOR_PRESETS
    .map((preset) => {
      const personIndex = personIndexByMgpId(preset.pid);
      const count = personIndex === null ? 0 : descendantFacultyIndices(personIndex).length;
      const haystack = normalizeSearchText(`${preset.label} ${personIndex === null ? "" : state.people[personIndex]?.name || ""}`);
      return { ...preset, personIndex, count, haystack };
    })
    .filter((preset) =>
      preset.count &&
      (showAll || (query.length >= 2 && preset.haystack.includes(query))),
    );

  if (state.selectedAncestorIndex !== null || !presetRows.length) {
    els.graphAncestorPresets.hidden = true;
    els.graphAncestorPresets.innerHTML = "";
    return;
  }
  els.graphAncestorPresets.hidden = false;
  els.graphAncestorPresets.innerHTML = presetRows
    .map((preset) => {
      const active = preset.personIndex !== null && preset.personIndex === state.selectedAncestorIndex;
      return `
        <button
          type="button"
          class="graph-preset${active ? " is-active" : ""}"
          data-person-index="${preset.personIndex === null ? "" : preset.personIndex}"
          title="Show faculty descended from ${escapeHtml(preset.label)}"
        >
          <span>${escapeHtml(preset.label)}</span>
          <small>${preset.count.toLocaleString()} descendants</small>
        </button>
      `;
    })
    .join("");
  els.graphAncestorPresets.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const personIndex = Number(button.dataset.personIndex);
      if (Number.isInteger(personIndex)) {
        applyAncestorPerson(personIndex, false);
        state.focusMode = "common";
        state.needsFit = "width";
        render();
      }
    });
  });
}

function renderQuestionStrip(_graphData) {
  if (!els.questionStrip) {
    return;
  }
  els.questionStrip.hidden = true;
  els.questionStrip.innerHTML = "";
}

function renderFaculty() {
  const groupSet = new Set(groupFacultyIndices());
  const query = state.facultySearch.trim().toLowerCase();
  const isSearching = Boolean(query);
  const graphRows = state.faculty
    .filter((faculty) => isSearching || groupSet.has(Number(faculty.faculty_index)))
    .filter((faculty) => facultyMatchesSearch(faculty, query))
    .map((faculty) => ({ faculty, graphLinked: true }));
  const rosterOnlyRows = state.unresolvedFaculty
    .filter((faculty) =>
      isSearching || state.selectedGroupId === "all-faculty" || (faculty.groups || []).includes(state.selectedGroupId),
    )
    .filter((faculty) => facultyMatchesSearch(faculty, query))
    .map((faculty) => ({ faculty, graphLinked: false }));
  const rows = [...graphRows, ...rosterOnlyRows]
    .sort((a, b) => a.faculty.osu_name.localeCompare(b.faculty.osu_name));

  els.facultyList.innerHTML = rows
    .map(({ faculty, graphLinked }) => {
      const index = graphLinked ? Number(faculty.faculty_index) : null;
      const checked = graphLinked && state.selectedFaculty.has(index) ? " checked" : "";
      const selector = graphLinked
        ? `<input type="checkbox" value="${index}" aria-label="Select ${escapeHtml(faculty.osu_name)}"${checked}>`
        : `<span class="faculty-select-spacer" aria-hidden="true"></span>`;
      return `
        <div class="faculty-item${graphLinked ? "" : " roster-only"}">
          ${selector}
          <span>
            <span class="faculty-name">${facultyNameLink(faculty, "faculty-name-link")}</span>
            <span class="faculty-title">${escapeHtml(faculty.title || faculty.filed_in.join("; "))}</span>
            ${facultyAreaTags(faculty)}
          </span>
        </div>
      `;
    })
    .join("");

  els.facultyList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const index = Number(input.value);
      if (input.checked) {
        state.selectedFaculty.add(index);
      } else {
        state.selectedFaculty.delete(index);
      }
      state.selectedAncestorIndex = null;
      markGraphChanged("all");
      render();
    });
  });
}

function commonAncestors() {
  const facultyIndices = activeFacultyIndices();
  if (!facultyIndices.length) {
    return [];
  }
  const minShared = facultyIndices.length <= 1 ? 1 : facultyIndices.length;
  return ancestorRowsForFaculty(facultyIndices, minShared);
}

function ancestorRowsForFaculty(facultyIndices, minShared) {
  if (!facultyIndices.length) {
    return [];
  }
  const facultyMask = maskForFaculty(facultyIndices);
  const rows = [];

  state.people.forEach((person, personIndex) => {
    const matchedMask = state.peopleMasks[personIndex] & facultyMask;
    const matchedCount = bitCount(matchedMask);
    if (matchedCount < minShared) {
      return;
    }

    const distanceMap = distanceMapForPerson(personIndex);
    const matchedFaculty = facultyIndices.filter((index) => matchedMask & (1n << BigInt(index)));
    const distances = matchedFaculty.map((index) => distanceMap.get(index)).filter(Number.isFinite);
    if (!distances.length) {
      return;
    }

    rows.push({
      personIndex,
      id: person.id,
      name: person.name,
      year: person.year,
      degree_year: person.degree_year || "",
      year_kind: person.year_kind || "",
      country: person.country,
      degree_country: person.degree_country || "",
      url: person.url,
      matchedCount,
      maxDistance: Math.max(...distances),
      totalDistance: distances.reduce((sum, distance) => sum + distance, 0),
      yearValue: placementYearForIndex(personIndex) || 0,
      matchedFaculty,
    });
  });

  return rows.sort(
    (a, b) =>
      b.matchedCount - a.matchedCount ||
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      b.yearValue - a.yearValue ||
      a.name.localeCompare(b.name),
  );
}

function recentSharedByMostAncestor(facultyIndices = activeFacultyIndices()) {
  if (facultyIndices.length < 2) {
    return null;
  }
  const rows = ancestorRowsForFaculty(facultyIndices, 1)
    .filter((row) => row.matchedCount < facultyIndices.length);
  if (!rows.length) {
    return null;
  }
  const maxMatched = Math.max(...rows.map((row) => row.matchedCount));
  return rows
    .filter((row) => row.matchedCount === maxMatched)
    .sort((a, b) =>
      b.yearValue - a.yearValue ||
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      a.name.localeCompare(b.name),
    )[0] || null;
}

function sharedByMostAncestors(facultyIndices = activeFacultyIndices()) {
  if (facultyIndices.length < 2) {
    return [];
  }
  return ancestorRowsForFaculty(facultyIndices, 2)
    .sort((a, b) =>
      b.matchedCount - a.matchedCount ||
      b.yearValue - a.yearValue ||
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      a.name.localeCompare(b.name),
    );
}

function sharedTableMinimumCount(facultyCount) {
  if (facultyCount <= 1) {
    return 1;
  }
  if (facultyCount === 2) {
    return 2;
  }
  if (facultyCount === 3) {
    return 2;
  }
  return Math.max(3, Math.ceil(facultyCount * 0.12));
}

function selectSharedTableRows(facultyIndices = activeFacultyIndices()) {
  if (!facultyIndices.length) {
    return [];
  }
  if (facultyIndices.length === 1) {
    return ancestorRowsForFaculty(facultyIndices, 1);
  }
  if (facultyIndices.length === 2) {
    return ancestorRowsForFaculty(facultyIndices, 2).slice(0, SHARED_BOTH_TABLE_MAX_ROWS);
  }

  const floor = sharedTableMinimumCount(facultyIndices.length);
  const rows = ancestorRowsForFaculty(facultyIndices, floor);
  const selected = new Map();
  const add = (row) => {
    if (row && selected.size < SHARED_TABLE_MAX_ROWS && !selected.has(row.personIndex)) {
      selected.set(row.personIndex, row);
    }
  };
  const qualitySort = (a, b) =>
    b.matchedCount - a.matchedCount ||
    b.yearValue - a.yearValue ||
    a.maxDistance - b.maxDistance ||
    a.totalDistance - b.totalDistance ||
    a.name.localeCompare(b.name);

  rows.slice(0, Math.min(12, rows.length)).forEach(add);
  const counts = Array.from(new Set(rows.map((row) => row.matchedCount))).sort((a, b) => b - a);
  counts.forEach((count) => {
    rows
      .filter((row) => row.matchedCount === count)
      .sort(qualitySort)
      .slice(0, 3)
      .forEach(add);
  });
  rows
    .filter((row) => hasWikipediaArticle(row.personIndex))
    .sort(qualitySort)
    .forEach(add);
  rows.sort(qualitySort).forEach(add);

  return Array.from(selected.values()).sort(qualitySort);
}

function nearestCommonAncestor(facultyIndices = activeFacultyIndices()) {
  if (facultyIndices.length < 2) {
    return null;
  }

  const facultyMask = maskForFaculty(facultyIndices);
  const candidates = [];
  state.people.forEach((person, personIndex) => {
    if ((state.peopleMasks[personIndex] & facultyMask) !== facultyMask) {
      return;
    }

    const distanceMap = distanceMapForPerson(personIndex);
    const distances = facultyIndices.map((index) => distanceMap.get(index));
    if (!distances.every(Number.isFinite)) {
      return;
    }

    candidates.push({
      personIndex,
      person,
      distances,
      maxDistance: Math.max(...distances),
      totalDistance: distances.reduce((sum, distance) => sum + distance, 0),
      yearValue: placementYearForIndex(personIndex) || 0,
    });
  });

  candidates.sort(
    (a, b) =>
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      b.yearValue - a.yearValue ||
      a.person.name.localeCompare(b.person.name),
  );
  return candidates[0] || null;
}

function lineagePersonIndices() {
  const activeMask = maskForFaculty(activeFacultyIndices());
  if (activeMask === 0n) {
    return [];
  }
  return state.people
    .map((_person, index) => index)
    .filter((index) => (state.peopleMasks[index] & activeMask) !== 0n);
}

function revealScaleForGraph() {
  if (state.needsFit === "width" || state.needsFit === "all") {
    return MIN_SCALE;
  }
  return state.view.scale;
}

function effectiveVisibleAncestorLimit(totalAvailable) {
  const requested = Math.min(state.visibleAncestorLimit, Math.max(0, totalAvailable));
  if (requested <= ZOOM_REVEAL_MIN_ANCESTORS) {
    return requested;
  }
  if (state.focusMode !== "common") {
    return requested;
  }

  const revealScale = revealScaleForGraph();
  const progress = clamp(
    (revealScale - MIN_SCALE) / Math.max(0.01, ZOOM_REVEAL_FULL_SCALE - MIN_SCALE),
    0,
    1,
  );
  const eased = progress * progress;
  const floor = Math.min(requested, ZOOM_REVEAL_MIN_ANCESTORS);
  return Math.max(1, Math.round(floor + (requested - floor) * eased));
}

function effectiveFullLineageLabelLimit(totalAvailable) {
  const requested = Math.min(FULL_LINEAGE_LABEL_MAX, Math.max(0, totalAvailable));
  if (!requested) {
    return 0;
  }
  const revealScale = revealScaleForGraph();
  const progress = clamp(
    (revealScale - MIN_SCALE) / Math.max(0.01, ZOOM_REVEAL_FULL_SCALE - MIN_SCALE),
    0,
    1,
  );
  const eased = progress * progress;
  const floor = Math.min(requested, FULL_LINEAGE_LABEL_MIN);
  return Math.max(1, Math.round(floor + (requested - floor) * eased));
}

function selectVisibleCommonAncestors(common, limit) {
  const requested = Math.max(0, Math.min(limit, common.length));
  if (requested >= common.length) {
    return common.slice();
  }
  const selected = new Map();

  function add(row) {
    if (row && selected.size < requested && !selected.has(row.personIndex)) {
      selected.set(row.personIndex, row);
    }
  }

  common.slice(0, Math.max(6, Math.ceil(requested * 0.42))).forEach(add);

  const datedYears = common
    .map((row) => placementYearForIndex(row.personIndex))
    .filter(Number.isFinite);
  const minYear = Math.min(...datedYears, 1200);
  const maxYear = Math.max(...datedYears, 2026);
  const bandCount = Math.min(8, Math.max(4, Math.ceil(requested / 4)));
  Array.from({ length: bandCount }).forEach((_value, band) => {
    const start = minYear + ((maxYear - minYear) * band) / bandCount;
    const end = band === bandCount - 1
      ? maxYear + 1
      : minYear + ((maxYear - minYear) * (band + 1)) / bandCount;
    const representative = common.find((row) => {
      const year = placementYearForIndex(row.personIndex);
      return year && year >= start && year < end && !selected.has(row.personIndex);
    });
    add(representative);
  });

  common
    .filter((row) => hasWikipediaArticle(row.personIndex))
    .forEach(add);

  common.forEach(add);
  return Array.from(selected.values());
}

function selectRepresentativeLineageLabels(candidates, limit, facultyIndices, activeFacultyPersonIndices, visibleCommonSet) {
  const requested = Math.max(0, Math.min(limit, candidates.length));
  if (!requested) {
    return [];
  }

  const activeMask = maskForFaculty(facultyIndices);
  const rows = candidates
    .filter((personIndex) =>
      !activeFacultyPersonIndices.has(personIndex) &&
      !visibleCommonSet.has(personIndex))
    .map((personIndex) => {
      const year = placementYearForIndex(personIndex) || 0;
      const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
      const hasWiki = hasWikipediaArticle(personIndex);
      return {
        personIndex,
        year,
        matchedCount,
        hasWiki,
        score: matchedCount * 8 + (hasWiki ? 18 : 0) + (year ? 2 : 0),
      };
    })
    .filter((row) => row.matchedCount > 0);
  if (!rows.length) {
    return [];
  }

  const selected = new Map();
  const add = (row) => {
    if (row && selected.size < requested && !selected.has(row.personIndex)) {
      selected.set(row.personIndex, row);
    }
  };
  const byProminence = (a, b) =>
    b.score - a.score ||
    b.matchedCount - a.matchedCount ||
    b.year - a.year ||
    state.people[a.personIndex].name.localeCompare(state.people[b.personIndex].name);

  const dated = rows.filter((row) => row.year);
  const minYear = Math.min(...dated.map((row) => row.year), 900);
  const maxYear = Math.max(...dated.map((row) => row.year), 2026);
  const bandCount = Math.min(18, Math.max(8, Math.ceil(requested / 4)));
  for (let band = 0; band < bandCount; band += 1) {
    const start = minYear + ((maxYear - minYear) * band) / bandCount;
    const end = band === bandCount - 1
      ? maxYear + 1
      : minYear + ((maxYear - minYear) * (band + 1)) / bandCount;
    add(dated
      .filter((row) => row.year >= start && row.year < end && !selected.has(row.personIndex))
      .sort(byProminence)[0]);
  }

  rows
    .filter((row) => row.hasWiki)
    .sort(byProminence)
    .forEach(add);
  rows
    .slice()
    .sort((a, b) =>
      b.matchedCount - a.matchedCount ||
      b.year - a.year ||
      Number(b.hasWiki) - Number(a.hasWiki) ||
      state.people[a.personIndex].name.localeCompare(state.people[b.personIndex].name))
    .forEach(add);
  dated
    .slice()
    .sort((a, b) => a.year - b.year || byProminence(a, b))
    .forEach(add);
  rows.forEach(add);

  return Array.from(selected.keys());
}

function edgeKey(advisorIndex, studentIndex) {
  return `${advisorIndex}:${studentIndex}`;
}

function advisorPathToAncestor(personIndex, ancestorIndex) {
  const queue = [{ personIndex, path: [personIndex] }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (current.personIndex === ancestorIndex) {
      return current.path.slice().reverse();
    }
    if (seen.has(current.personIndex)) {
      continue;
    }
    seen.add(current.personIndex);

    const person = state.people[current.personIndex];
    if (!person) {
      continue;
    }
    person.advisor_indices.forEach((advisorIndex) => {
      if (!seen.has(advisorIndex)) {
        queue.push({
          personIndex: advisorIndex,
          path: [...current.path, advisorIndex],
        });
      }
    });
  }

  return null;
}

function pathAnchorKey(anchorIndex, facultyIndices = activeFacultyIndices()) {
  return anchorIndex === null || anchorIndex === undefined
    ? "none"
    : `${anchorIndex}:${facultyIndices.join(",")}`;
}

function syncAdvisorPathLimit(anchorIndex, facultyIndices = activeFacultyIndices()) {
  const key = pathAnchorKey(anchorIndex, facultyIndices);
  if (state.advisorPathAnchorKey !== key) {
    state.advisorPathAnchorKey = key;
    state.advisorPathLimit = ADVISOR_PATH_INITIAL_COUNT;
    state.chainPathQuery = "";
    const explicitAnchor =
      state.chainAnchorIndex !== null ||
      state.selectedAncestorIndex !== null ||
      (state.selectedNodeIndex !== null && state.detailSelectionSource !== "table");
    if (anchorIndex !== null && anchorIndex !== undefined && explicitAnchor) {
      setDetailSectionOpen("chains", true);
    } else {
      setDetailSectionOpen("chains", false);
    }
  }
}

function selectionChipKey(facultyIndices = activeFacultyIndices()) {
  return `${state.selectedAncestorIndex ?? "custom"}:${facultyIndices.join(",")}`;
}

function syncSelectionChipLimit(facultyIndices = activeFacultyIndices()) {
  const key = selectionChipKey(facultyIndices);
  if (state.selectionChipKey !== key) {
    state.selectionChipKey = key;
    state.selectionChipLimit = SELECTION_CHIP_INITIAL_COUNT;
  }
}

function detailFacultyKey(personIndex, facultyIndices = activeFacultyIndices()) {
  return personIndex === null || personIndex === undefined
    ? "none"
    : `${personIndex}:${facultyIndices.join(",")}`;
}

function syncDetailFacultyLimit(personIndex, facultyIndices = activeFacultyIndices()) {
  const key = detailFacultyKey(personIndex, facultyIndices);
  if (state.detailFacultyKey !== key) {
    state.detailFacultyKey = key;
    state.detailFacultyLimit = DETAIL_FACULTY_INITIAL_COUNT;
  }
}

function pathBundleForAncestor(ancestorIndex, facultyIndices = activeFacultyIndices(), limit = 8) {
  if (ancestorIndex === null || ancestorIndex === undefined) {
    return { rows: [], totalRows: 0 };
  }

  const descendantSet = new Set(descendantFacultyIndices(ancestorIndex, facultyIndices));
  const allRows = facultyIndices
    .filter((facultyIndex) => descendantSet.has(facultyIndex))
    .map((facultyIndex) => {
      const faculty = state.faculty[facultyIndex];
      const path = advisorPathToAncestor(Number(faculty.person_index), ancestorIndex);
      return path
        ? {
          facultyIndex,
          faculty,
          path,
          steps: Math.max(0, path.length - 1),
        }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.steps - b.steps || a.faculty.osu_name.localeCompare(b.faculty.osu_name));
  const rows = allRows.slice(0, limit);

  return { rows, totalRows: allRows.length };
}

function connectorBundleForVisibleAncestors(visibleCommon, facultyIndices = activeFacultyIndices()) {
  const nodeSet = new Set();
  const edgeSet = new Set();
  if (!visibleCommon.length || !facultyIndices.length) {
    return { nodeSet, edgeSet };
  }

  function addPath(facultyIndex, ancestorIndex) {
    const faculty = state.faculty[facultyIndex];
    const facultyPersonIndex = Number(faculty?.person_index);
    if (!Number.isInteger(facultyPersonIndex)) {
      return;
    }

    const path = advisorPathToAncestor(facultyPersonIndex, ancestorIndex);
    if (!path) {
      return;
    }

    path.forEach((personIndex, index) => {
      nodeSet.add(personIndex);
      if (index > 0) {
        edgeSet.add(edgeKey(path[index - 1], personIndex));
      }
    });
  }

  const distanceMaps = new Map();
  function rowDistance(row, facultyIndex) {
    let distanceMap = distanceMaps.get(row.personIndex);
    if (!distanceMap) {
      distanceMap = distanceMapForPerson(row.personIndex);
      distanceMaps.set(row.personIndex, distanceMap);
    }
    return distanceMap.get(facultyIndex);
  }

  facultyIndices.forEach((facultyIndex) => {
    const nearest = visibleCommon
      .filter((row) => row.matchedFaculty.includes(facultyIndex))
      .map((row) => ({ row, distance: rowDistance(row, facultyIndex) }))
      .filter((entry) => Number.isFinite(entry.distance))
      .sort((a, b) => a.distance - b.distance || a.row.name.localeCompare(b.row.name))[0];
    if (nearest) {
      addPath(facultyIndex, nearest.row.personIndex);
    }
  });

  visibleCommon.forEach((row) => {
    const representative = row.matchedFaculty
      .map((facultyIndex) => ({ facultyIndex, distance: rowDistance(row, facultyIndex) }))
      .filter((entry) => Number.isFinite(entry.distance))
      .sort((a, b) => a.distance - b.distance || state.faculty[a.facultyIndex].osu_name.localeCompare(state.faculty[b.facultyIndex].osu_name))[0];
    if (representative) {
      addPath(representative.facultyIndex, row.personIndex);
    }
  });

  return { nodeSet, edgeSet };
}

function ordinal(value) {
  const special = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    11: "eleventh",
    12: "twelfth",
    13: "thirteenth",
    14: "fourteenth",
    15: "fifteenth",
    16: "sixteenth",
    17: "seventeenth",
    18: "eighteenth",
    19: "nineteenth",
    20: "twentieth",
  };
  if (special[value]) {
    return special[value];
  }
  const ones = value % 10;
  const tens = value - ones;
  const tensWords = {
    20: "twentieth",
    30: "thirtieth",
    40: "fortieth",
    50: "fiftieth",
  };
  if (!ones && tensWords[tens]) {
    return tensWords[tens];
  }
  const tensPrefix = {
    20: "twenty",
    30: "thirty",
    40: "forty",
    50: "fifty",
  }[tens];
  return tensPrefix ? `${tensPrefix}-${special[ones]}` : `${value}th`;
}

function removedPhrase(count) {
  if (!count) {
    return "";
  }
  if (count === 1) {
    return " once removed";
  }
  if (count === 2) {
    return " twice removed";
  }
  return ` ${count} times removed`;
}

function directAncestorPhrase(steps) {
  if (steps === 1) {
    return "academic advisor/student";
  }
  if (steps === 2) {
    return "academic grand-advisor/grand-student";
  }
  return `academic ${"great-".repeat(Math.max(0, steps - 2))}grand-advisor/grand-student`;
}

function relationshipName(distanceA, distanceB) {
  const minDistance = Math.min(distanceA, distanceB);
  const maxDistance = Math.max(distanceA, distanceB);

  if (minDistance === 0) {
    return directAncestorPhrase(maxDistance);
  }
  if (distanceA === 1 && distanceB === 1) {
    return "academic siblings";
  }
  if (minDistance === 1) {
    const greats = Math.max(0, maxDistance - 2);
    const prefix = "great-".repeat(greats);
    return `academic ${prefix}aunt/uncle and ${prefix}niece/nephew`;
  }

  const degree = minDistance - 1;
  const removals = Math.abs(distanceA - distanceB);
  return `${ordinal(degree)} cousins${removedPhrase(removals)}`;
}

function twoFacultyRelationship() {
  const facultyIndices = activeFacultyIndices();
  if (facultyIndices.length !== 2) {
    return null;
  }

  const [leftIndex, rightIndex] = facultyIndices;
  const leftFaculty = state.faculty[leftIndex];
  const rightFaculty = state.faculty[rightIndex];
  const leftPersonIndex = Number(leftFaculty.person_index);
  const rightPersonIndex = Number(rightFaculty.person_index);
  const facultyMask = maskForFaculty(facultyIndices);
  const candidates = [];

  state.people.forEach((person, personIndex) => {
    const matchedMask = state.peopleMasks[personIndex] & facultyMask;
    if (bitCount(matchedMask) !== 2) {
      return;
    }

    const distanceMap = distanceMapForPerson(personIndex);
    const leftDistance = distanceMap.get(leftIndex);
    const rightDistance = distanceMap.get(rightIndex);
    if (!Number.isFinite(leftDistance) || !Number.isFinite(rightDistance)) {
      return;
    }

    candidates.push({
      personIndex,
      person,
      leftDistance,
      rightDistance,
      maxDistance: Math.max(leftDistance, rightDistance),
      totalDistance: leftDistance + rightDistance,
      year: placementYearForIndex(personIndex) || 0,
    });
  });

  if (!candidates.length) {
    return {
      leftFaculty,
      rightFaculty,
      relation: "no connection shown",
      ancestor: null,
      leftPath: [],
      rightPath: [],
    };
  }

  candidates.sort(
    (a, b) =>
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      b.year - a.year ||
      a.person.name.localeCompare(b.person.name),
  );

  const best = candidates[0];
  return {
    leftFaculty,
    rightFaculty,
    relation: relationshipName(best.leftDistance, best.rightDistance),
    ancestor: best.person,
    ancestorIndex: best.personIndex,
    leftDistance: best.leftDistance,
    rightDistance: best.rightDistance,
    leftPath: advisorPathToAncestor(leftPersonIndex, best.personIndex) || [],
    rightPath: advisorPathToAncestor(rightPersonIndex, best.personIndex) || [],
  };
}

function advisorStepLabel(steps) {
  return steps === 1 ? "1 advisor link" : `${steps} advisor links`;
}

function visibleGraph() {
  const facultyIndices = activeFacultyIndices();
  const activeFacultyPersonIndices = new Set(
    facultyIndices.map((index) => state.faculty[index].person_index).filter(Number.isInteger),
  );
  const common = commonAncestors();
  const sharedByMostRows = facultyIndices.length > 1
    ? sharedByMostAncestors(facultyIndices)
    : [];
  const sharedTableRows = selectSharedTableRows(facultyIndices);
  const sharedTableKind = facultyIndices.length <= 1
    ? "lineage"
    : facultyIndices.length === 2
      ? "both"
      : "most";
  const fullLineage = isFullLineageSelection(facultyIndices);
  const lineageLabelCandidates = fullLineage
    ? lineagePersonIndices()
    : [];
  const lineageLabelLimit = fullLineage
    ? effectiveFullLineageLabelLimit(lineageLabelCandidates.length)
    : 0;
  const desiredVisibleAncestorLimit = fullLineage || facultyIndices.length <= 2
    ? common.length
    : Math.min(state.visibleAncestorLimit, common.length);
  const appliedVisibleAncestorLimit = fullLineage || facultyIndices.length <= 2
    ? desiredVisibleAncestorLimit
    : effectiveVisibleAncestorLimit(common.length);
  let visibleCommon = fullLineage
    ? common.slice()
    : selectVisibleCommonAncestors(common, appliedVisibleAncestorLimit);
  if (state.selectedAncestorIndex !== null) {
    const person = state.people[state.selectedAncestorIndex];
    const matchedFaculty = descendantFacultyIndices(state.selectedAncestorIndex, facultyIndices);
    visibleCommon = [common.find((row) => row.personIndex === state.selectedAncestorIndex) || {
      personIndex: state.selectedAncestorIndex,
      id: person?.id,
      name: person?.name || "Selected ancestor",
      matchedFaculty,
      matchedCount: matchedFaculty.length,
      maxDistance: 0,
      totalDistance: 0,
      yearValue: placementYearForIndex(state.selectedAncestorIndex) || 0,
    }];
  }
  const chosen = fullLineage
    ? new Set(lineagePersonIndices())
    : new Set(activeFacultyPersonIndices);
  const selectedNodeIsFaculty = state.selectedNodeIndex !== null && activeFacultyPersonIndices.has(state.selectedNodeIndex);
  const defaultComparisonAnchor = state.selectedNodeIndex === null && state.selectedAncestorIndex === null && facultyIndices.length > 1
    ? nearestCommonAncestor(facultyIndices)?.personIndex ?? recentSharedByMostAncestor(facultyIndices)?.personIndex ?? null
    : null;
  const chainAnchorIndex = state.chainAnchorIndex ??
    state.selectedAncestorIndex ??
    (state.selectedNodeIndex !== null && !selectedNodeIsFaculty ? state.selectedNodeIndex : null) ??
    null;
  syncAdvisorPathLimit(chainAnchorIndex, facultyIndices);

  if (state.focusMode === "faculty") {
    visibleCommon = [];
  }
  const connectorBundle = fullLineage
    ? { nodeSet: new Set(), edgeSet: new Set() }
    : connectorBundleForVisibleAncestors(visibleCommon, facultyIndices);
  const defaultAnchorBundle = !fullLineage && defaultComparisonAnchor !== null
    ? connectorBundleForVisibleAncestors([{
      personIndex: defaultComparisonAnchor,
      matchedFaculty: descendantFacultyIndices(defaultComparisonAnchor, facultyIndices),
    }], facultyIndices)
    : { nodeSet: new Set(), edgeSet: new Set() };

  if (fullLineage) {
    activeFacultyPersonIndices.forEach((personIndex) => chosen.add(personIndex));
  } else if (state.focusMode === "common") {
    for (const row of visibleCommon) {
      chosen.add(row.personIndex);
    }
  } else {
    visibleCommon.forEach((row) => chosen.add(row.personIndex));
  }
  if (defaultComparisonAnchor !== null) {
    chosen.add(defaultComparisonAnchor);
  }
  if (state.chainAnchorIndex !== null) {
    chosen.add(state.chainAnchorIndex);
  }
  connectorBundle.nodeSet.forEach((personIndex) => chosen.add(personIndex));
  defaultAnchorBundle.nodeSet.forEach((personIndex) => chosen.add(personIndex));
  if (state.selectedAncestorIndex !== null) {
    chosen.add(state.selectedAncestorIndex);
  }
  if (state.selectedNodeIndex !== null) {
    chosen.add(state.selectedNodeIndex);
  }
  if (!chosen.size) {
    activeFacultyPersonIndices.forEach((personIndex) => chosen.add(personIndex));
  }

  const nodeSet = new Set(chosen);
  const edgeRows = state.edges.filter(
    ([advisorIndex, studentIndex]) => nodeSet.has(advisorIndex) && nodeSet.has(studentIndex),
  );
  const visibleCommonSet = new Set(visibleCommon.map((row) => row.personIndex));
  const lineageLabelNodes = fullLineage
    ? selectRepresentativeLineageLabels(
      lineageLabelCandidates,
      lineageLabelLimit,
      facultyIndices,
      activeFacultyPersonIndices,
      visibleCommonSet,
    )
    : [];
  const lineageLabelNodeSet = new Set(lineageLabelNodes);
  return {
    nodes: Array.from(nodeSet),
    edges: edgeRows,
    common,
    sharedByMostRows,
    sharedTableRows,
    sharedTableKind,
    visibleCommon,
    desiredVisibleAncestorLimit,
    appliedVisibleAncestorLimit,
    hiddenByZoom: fullLineage
      ? Math.max(0, lineageLabelCandidates.length - lineageLabelLimit)
      : state.focusMode !== "common" ? 0 : Math.max(0, desiredVisibleAncestorLimit - visibleCommon.length),
    fullLineage,
    activeFacultyPersonIndices,
    chainAnchorIndex,
    defaultComparisonAnchorIndex: defaultComparisonAnchor,
    connectorNodeSet: connectorBundle.nodeSet,
    connectorEdgeSet: connectorBundle.edgeSet,
    defaultAnchorNodeSet: defaultAnchorBundle.nodeSet,
    defaultAnchorEdgeSet: defaultAnchorBundle.edgeSet,
    lineageLabelNodes,
    lineageLabelNodeSet,
  };
}

function renderMetrics(graphData) {
  const active = activeFacultyIndices();
  const lineage = lineagePersonIndices();
  const commonMetricLabel = active.length === 1 ? "Known Ancestry" : "Shared By All";
  const metricRows = [
    ["Selected Faculty", active.length],
    ["Total Ancestors", lineage.length],
    [commonMetricLabel, graphData.common.length],
    ["Visible People", graphData.nodes.length],
  ];
  els.metrics.innerHTML = metricRows
    .map((row) => `
      <div class="metric">
        <div class="label">${row[0]}</div>
        <div class="value">${row[1].toLocaleString()}</div>
      </div>
    `)
    .join("");
  els.graphTitle.textContent = selectionTitle();
  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  const graphPeopleLabel = graphData.nodes.length === 1 ? "person in graph" : "people in graph";
  if (selectedAncestor) {
    const descendantLabel = active.length === 1 ? "faculty descendant" : "faculty descendants";
    els.graphSubtitle.textContent =
      `${active.length.toLocaleString()} ${descendantLabel} | ` +
      `${graphData.nodes.length.toLocaleString()} ${graphPeopleLabel}`;
    return;
  }

  if (graphData.fullLineage) {
    const selectedFacultyLabel = active.length === 1 ? "faculty member" : "faculty";
    els.graphSubtitle.textContent =
      `${graphData.nodes.length.toLocaleString()} ${graphPeopleLabel} | ` +
      `${active.length.toLocaleString()} ${selectedFacultyLabel} | ` +
      "full lineage graph";
    return;
  }

  const sharedAncestorLabel = active.length === 1
    ? graphData.visibleCommon.length === 1 ? "total ancestor" : "total ancestors"
    : graphData.common.length === 0 && graphData.sharedByMostRows.length
      ? graphData.sharedByMostRows.length === 1 ? "shared-by-most ancestor" : "shared-by-most ancestors"
    : graphData.visibleCommon.length === 1 ? "shared-by-all ancestor" : "shared-by-all ancestors";
  const sharedAncestorCount = active.length === 1 || graphData.common.length
    ? graphData.visibleCommon.length
    : graphData.sharedByMostRows.length;
  const selectedFacultyLabel = active.length === 1 ? "faculty member" : "faculty";
  els.graphSubtitle.textContent =
    `${graphData.nodes.length.toLocaleString()} ${graphPeopleLabel} | ` +
    `${active.length.toLocaleString()} ${selectedFacultyLabel} | ` +
    `${sharedAncestorCount.toLocaleString()} ${sharedAncestorLabel}`;
}

function renderCurrentViewSummary(_graphData) {
  els.currentViewSummary.hidden = true;
  els.currentViewSummary.innerHTML = "";
}

function renderGraphBreadcrumbs() {
  const chips = [];
  const group = activeGroup();
  chips.push(`
    <button type="button" data-crumb-action="all-area" ${state.selectedGroupId === "all-faculty" ? "disabled" : ""}>
      <span>Area</span>${escapeHtml(group.label)}
    </button>
  `);

  if (state.selectedAncestorIndex !== null) {
    chips.push(`
      <button type="button" data-crumb-action="clear-ancestor">
        <span>Ancestor</span>${escapeHtml(state.people[state.selectedAncestorIndex]?.name || "Ancestor")}
      </button>
    `);
  } else if (isCustomSelection()) {
    chips.push(`
      <button type="button" data-crumb-action="reset-selection">
        <span>Selection</span>${activeFacultyIndices().length} faculty
      </button>
    `);
  }

  if (state.selectedNodeIndex !== null && state.selectedNodeIndex !== state.selectedAncestorIndex) {
    chips.push(`
      <button type="button" data-crumb-action="clear-node">
        <span>Node</span>${escapeHtml(state.people[state.selectedNodeIndex]?.name || "Selected")}
      </button>
    `);
  }

  els.graphBreadcrumbs.innerHTML = chips.join("");
  els.graphBreadcrumbs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      const action = button.dataset.crumbAction;
      if (action === "all-area") {
        selectGroup("all-faculty");
      } else if (action === "clear-ancestor") {
        clearAncestorFilter();
      } else if (action === "reset-selection") {
        backToGroupView();
      } else if (action === "clear-node") {
        clearSelectedNode();
      }
    });
  });
}

function renderSelectionChips() {
  const active = activeFacultyIndices();
  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  const shouldShow = Boolean(selectedAncestor) || isCustomSelection();
  if (!shouldShow) {
    els.selectionChips.hidden = true;
    els.selectionChips.innerHTML = "";
    return;
  }

  syncSelectionChipLimit(active);
  const visibleLimit = Math.min(active.length, Math.max(SELECTION_CHIP_INITIAL_COUNT, state.selectionChipLimit));
  const visible = active.slice(0, visibleLimit);
  const extra = active.length - visible.length;
  const nextExtra = Math.min(SELECTION_CHIP_INCREMENT, extra);
  const label = selectedAncestor ? "Faculty descendants" : `Faculty in this view (${active.length})`;
  els.selectionChips.hidden = false;
  els.selectionChips.innerHTML = `
    <span class="selection-chip-label">${escapeHtml(label)}</span>
    ${visible.map((index) => {
      const faculty = state.faculty[index];
      return `
        <button type="button" class="selection-chip" data-remove-faculty="${index}" title="Remove ${escapeHtml(faculty.osu_name)}">
          <span>${escapeHtml(faculty.osu_name)}</span>
          <strong aria-hidden="true">&times;</strong>
        </button>
      `;
    }).join("")}
    ${extra > 0 ? `<button type="button" class="selection-chip-extra" data-selection-action="more" title="Show ${nextExtra} more faculty">+${nextExtra}</button>` : ""}
    ${visible.length > SELECTION_CHIP_INITIAL_COUNT ? `<button type="button" class="selection-chip-action" data-selection-action="first">Show first ${SELECTION_CHIP_INITIAL_COUNT}</button>` : ""}
    <button type="button" class="selection-chip-action" data-selection-action="reset-area">Group view</button>
  `;

  els.selectionChips.querySelectorAll("[data-remove-faculty]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAncestorIndex = null;
      state.selectedFaculty.delete(Number(button.dataset.removeFaculty));
      markGraphChanged("all");
      render();
    });
  });
  els.selectionChips.querySelector("[data-selection-action='more']")?.addEventListener("click", () => {
    state.selectionChipLimit = Math.min(active.length, state.selectionChipLimit + SELECTION_CHIP_INCREMENT);
    renderSelectionChips();
  });
  els.selectionChips.querySelector("[data-selection-action='first']")?.addEventListener("click", () => {
    state.selectionChipLimit = SELECTION_CHIP_INITIAL_COUNT;
    renderSelectionChips();
  });
  els.selectionChips.querySelector("[data-selection-action='reset-area']")?.addEventListener("click", () => {
    backToGroupView();
  });
}

function renderGraphSelectionCard(graphData) {
  if (state.selectedNodeIndex === null || state.selectedNodeIndex === state.selectedAncestorIndex) {
    els.graphSelectionCard.hidden = true;
    els.graphSelectionCard.innerHTML = "";
    return;
  }

  const person = state.people[state.selectedNodeIndex];
  const facultyRecord = facultyByPersonIndex(state.selectedNodeIndex);
  const activeMask = maskForFaculty(activeFacultyIndices());
  const matchedFaculty = activeFacultyIndices().filter(
    (index) => (state.peopleMasks[state.selectedNodeIndex] & activeMask & (1n << BigInt(index))) !== 0n,
  );
  const descendantCount = descendantFacultyIndices(state.selectedNodeIndex).length;

  els.graphSelectionCard.innerHTML = `
    <div class="selection-card-heading">
      <strong>${escapeHtml(facultyRecord?.osu_name || person.name)}</strong>
      <button type="button" data-card-action="close" aria-label="Clear selected node">&times;</button>
    </div>
    <div class="selection-card-meta">
      <a href="${escapeHtml(person.url)}" target="_blank" rel="noreferrer">Genealogy record</a>
      <span>${escapeHtml(personMeta(person, state.selectedNodeIndex))}</span>
      ${facultyRecord ? `<a href="${escapeHtml(facultyWebsiteUrl(facultyRecord))}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(facultyRecord))}</a>` : ""}
    </div>
    <div class="selection-card-stats">
      <span>${matchedFaculty.length} shown faculty reached</span>
      <span>${descendantCount} graph descendants</span>
    </div>
    <div class="selection-card-actions">
      <button type="button" data-card-action="center">Center</button>
      <button type="button" data-card-action="descendants" ${descendantCount ? "" : "disabled"}>Show Descendants</button>
    </div>
  `;
  els.graphSelectionCard.hidden = false;
  els.graphSelectionCard.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.cardAction;
      if (action === "close") {
        clearSelectedNode();
      } else if (action === "center") {
        state.pendingCenterNodeIndex = state.selectedNodeIndex;
        render();
      } else if (action === "descendants") {
        applyAncestorPerson(state.selectedNodeIndex);
      }
    });
  });
}

function syncDetailPanelOrder() {
  const panel = els.summaryPanel?.parentElement;
  if (!panel) {
    return;
  }
  const selectedFromTable = state.selectedNodeIndex !== null && state.detailSelectionSource === "table";
  const order = selectedFromTable
    ? [els.sharedAncestorsPanel, els.nodeDetail, els.chainPanel, els.summaryPanel, els.relationshipPanel]
    : state.selectedAncestorIndex !== null || state.selectedNodeIndex !== null
    ? [els.nodeDetail, els.chainPanel, els.sharedAncestorsPanel, els.summaryPanel, els.relationshipPanel]
    : [els.summaryPanel, els.relationshipPanel, els.chainPanel, els.sharedAncestorsPanel, els.nodeDetail];
  order.forEach((element) => {
    if (element) {
      panel.append(element);
    }
  });
}

function bindGraphPersonButtons(container) {
  container.querySelectorAll("[data-graph-person-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const personIndex = Number(button.dataset.graphPersonIndex);
      if (Number.isInteger(personIndex)) {
        state.activeView = "graph";
        state.detailsOpen = false;
        selectGraphNode(personIndex);
      }
    });
  });
}

function renderGraphDensityNote(graphData) {
  if (!els.graphDensityNote) {
    return;
  }
  if (els.sharedLegendLabel) {
    els.sharedLegendLabel.textContent = graphData.common.length
      ? "Shared by all"
      : activeFacultyIndices().length > 1 && graphData.sharedTableRows?.length
        ? "Shared by most"
        : "Other ancestor";
  }
  if (state.selectedAncestorIndex !== null) {
    els.graphDensityNote.hidden = true;
    els.graphDensityNote.textContent = "";
    return;
  }
  const connectorCount = graphData.connectorNodeSet?.size || 0;
  const hidden = graphData.hiddenByZoom || 0;
  const parts = [];
  if (graphData.fullLineage) {
    parts.push("Full lineage graph");
    parts.push(`${graphData.nodes.length.toLocaleString()} people in graph`);
    const labelCount = graphData.lineageLabelNodeSet?.size || 0;
    if (labelCount) {
      parts.push(`${labelCount.toLocaleString()} advisor labels shown`);
    }
    if (graphData.common.length) {
      const label = activeFacultyIndices().length === 1 ? "known ancestors" : "shared by all";
      parts.push(`${graphData.common.length.toLocaleString()} ${label}`);
    } else if (graphData.sharedTableRows?.length) {
      parts.push(`${graphData.sharedTableRows.length.toLocaleString()} shared-by-most ancestors in Details`);
    }
  } else if (hidden) {
    parts.push(`Showing ${graphData.visibleCommon.length.toLocaleString()} of ${graphData.desiredVisibleAncestorLimit.toLocaleString()} shared-by-all ancestors`);
  } else if (graphData.visibleCommon.length === graphData.common.length) {
    parts.push(`${graphData.visibleCommon.length.toLocaleString()} shared-by-all ancestors shown`);
  } else {
    parts.push(`${graphData.visibleCommon.length.toLocaleString()} shared-by-all ancestors shown`);
  }
  if (connectorCount) {
    parts.push(`${connectorCount.toLocaleString()} connected lineage nodes`);
  }
  els.graphDensityNote.textContent = parts.join(" | ");
  els.graphDensityNote.hidden = !graphData.nodes.length;
}

function renderSummaryPanel(graphData) {
  const active = activeFacultyIndices();
  if (state.selectedNodeIndex !== null) {
    els.summaryPanel.innerHTML = "";
    return;
  }
  if (isDefaultTwoFacultyComparison(active)) {
    els.summaryPanel.innerHTML = "";
    return;
  }
  if (active.length === 1 && state.selectedAncestorIndex === null) {
    const faculty = state.faculty[active[0]];
    const person = state.people[Number(faculty.person_index)];
    const advisors = advisorNamesForPerson(person);
    const farthest = graphData.common
      .slice()
      .sort((a, b) => b.maxDistance - a.maxDistance || a.name.localeCompare(b.name))[0];
    const website = facultyWebsiteUrl(faculty);
    const osuProfile = facultyOsuProfileUrl(faculty);
    const linkParts = [
      person ? `<a href="${escapeHtml(person.url)}" target="_blank" rel="noreferrer">Genealogy record</a>` : "",
      website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(faculty))}</a>` : "",
      osuProfile && osuProfile !== website
        ? `<a href="${escapeHtml(osuProfile)}" target="_blank" rel="noreferrer">OSU profile</a>`
        : "",
    ].filter(Boolean);
    const cards = [
      {
        label: "PhD",
        value: facultyDegreeSummary(faculty, person),
        detail: advisors.length ? `${advisors.length === 1 ? "Advisor" : "Advisors"}: ${advisors.join("; ")}` : "",
      },
      {
        label: "Area",
        value: facultyAreaLabels(faculty, 3) || "not listed",
      },
      {
        label: "Known Ancestry",
        value: `${graphData.common.length.toLocaleString()} people`,
        detail: farthest ? `${farthest.maxDistance} advisor links shown` : "",
      },
      {
        label: "Links",
        valueHtml: linkParts.length ? `<span class="summary-link-list">${linkParts.join("")}</span>` : "None",
      },
    ];

    els.summaryPanel.innerHTML = `
      <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
        <summary>
          <span>
            <strong>${escapeHtml(faculty.osu_name)}</strong>
            <small>${escapeHtml(faculty.title || "Ohio State Mathematics")}</small>
          </span>
          <span class="summary-toggle">Overview</span>
        </summary>
        <div class="summary-grid">
          ${cards.map(summaryCardHtml).join("")}
        </div>
      </details>
    `;
    bindDetailSectionToggles(els.summaryPanel);
    return;
  }

  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  if (selectedAncestor) {
    els.summaryPanel.innerHTML = "";
    return;
  }

  if (!active.length) {
    const cards = [
      {
        label: "Selection",
        value: "0",
        detail: "faculty selected",
      },
      {
        label: "Graph",
        value: "Empty",
        detail: "choose an area or faculty to draw ancestry",
      },
      {
        label: "Shared By All",
        value: "0",
        detail: "requires at least one selected faculty member",
      },
      {
        label: "Next Step",
        valueHtml: `<button type="button" class="summary-inline-button" data-summary-action="select-area">Select all in area</button>`,
        detail: activeGroup()?.label || "current area",
      },
    ];

    els.summaryPanel.innerHTML = `
      ${answerCalloutHtml("No faculty are selected.", "Choose an area or faculty to draw an ancestry graph.")}
      <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
        <summary>
          <span>
            <strong>No Faculty Selected</strong>
            <small>Choose faculty or reset the current area</small>
          </span>
          <span class="summary-toggle">Overview</span>
        </summary>
        <div class="summary-grid">
          ${cards.map(summaryCardHtml).join("")}
        </div>
      </details>
    `;
    els.summaryPanel.querySelector("[data-summary-action='select-area']")?.addEventListener("click", () => {
      state.selectedAncestorIndex = null;
      state.selectedFaculty = new Set(groupFacultyIndices());
      markGraphChanged("width");
      render();
    });
    bindDetailSectionToggles(els.summaryPanel);
    return;
  }

  const intentionalComparison = isIntentionalFacultyComparison(active);
  const mrca = nearestCommonAncestor(active);
  const sharedByMost = active.length > 1 && !graphData.common.length
    ? recentSharedByMostAncestor(active)
    : null;
  const mrcaSummary = active.length > 1 && state.selectedAncestorIndex === null && mrca
    ? answerCalloutActionHtml(
      `The most recent common ancestor of these ${active.length.toLocaleString()} faculty is `,
      mrca.person.name,
      ".",
      "This is the shared-by-all ancestor that minimizes the longest advisor distance across the selection.",
      "show-mrca",
    )
    : "";
  const comparisonSummary = intentionalComparison
    ? mrca
      ? answerCalloutActionHtml(
        `The most recent common ancestor of these ${active.length.toLocaleString()} faculty is `,
        mrca.person.name,
        ".",
        "This is the shared-by-all ancestor that minimizes the longest advisor distance.",
        "show-mrca",
      )
      : sharedByMost
        ? answerCalloutActionHtml(
          "The most recent shared-by-most ancestor is ",
          sharedByMost.name,
          ".",
          `Advisor reaches ${sharedByMost.matchedCount.toLocaleString()} of ${active.length.toLocaleString()} selected faculty.`,
          "show-shared-by-most",
        )
        : answerCalloutHtml(
          "No common ancestor is shown for the selected faculty.",
          "Try a smaller faculty subset or a different area.",
        )
    : "";
  const selectionSummary = !intentionalComparison && sharedByMost
    ? answerCalloutActionHtml(
      "The most recent shared-by-most ancestor is ",
      sharedByMost.name,
      ".",
      `Advisor reaches ${sharedByMost.matchedCount.toLocaleString()} of ${active.length.toLocaleString()} selected faculty.`,
      "show-shared-by-most",
    )
    : "";
  els.summaryPanel.innerHTML = comparisonSummary || selectionSummary || mrcaSummary;
  els.summaryPanel.querySelector("[data-summary-action='show-mrca']")?.addEventListener("click", () => {
    showAdvisorPathsForNode(mrca.personIndex);
  });
  els.summaryPanel.querySelector("[data-summary-action='show-shared-by-most']")?.addEventListener("click", () => {
    showAdvisorPathsForNode(sharedByMost.personIndex);
  });
}

function renderChainPanel(graphData) {
  if (isDefaultTwoFacultyComparison()) {
    els.chainPanel.innerHTML = "";
    return;
  }

  const anchorIndex = graphData.chainAnchorIndex;
  if (
    anchorIndex === null ||
    (state.chainAnchorIndex === null && state.selectedAncestorIndex === null && state.selectedNodeIndex === null)
  ) {
    els.chainPanel.innerHTML = "";
    return;
  }
  const anchor = anchorIndex === null ? null : state.people[anchorIndex];
  const active = activeFacultyIndices();
  const allPathBundle = anchorIndex === null
    ? { rows: [], totalRows: 0 }
    : pathBundleForAncestor(anchorIndex, active, Math.min(active.length, state.advisorPathLimit));
  const rows = allPathBundle.rows;
  const totalRows = allPathBundle.totalRows;

  if (!anchor || !rows.length) {
    els.chainPanel.innerHTML = "";
    return;
  }

  els.chainPanel.innerHTML = `
    <details class="detail-section chain-section" data-detail-section="chains"${detailSectionOpenAttr("chains", true)}>
      <summary>
        <span>
          <strong>Lineage Chains</strong>
          <small>${totalRows.toLocaleString()} from ${escapeHtml(anchor.name)}</small>
        </span>
        <span class="summary-toggle">Chains</span>
      </summary>
      <label class="chain-filter" for="chainPathSearch">
        <span>Search chains</span>
        <input id="chainPathSearch" class="search-input" type="search" autocomplete="off" placeholder="Faculty name" value="${escapeHtml(state.chainPathQuery)}">
      </label>
      <p class="chain-status" id="chainFilterCount">
        Showing ${rows.length.toLocaleString()} full lineage chains${totalRows > rows.length ? ` of ${totalRows.toLocaleString()}` : ""}.
      </p>
      <div class="chain-list">
        ${rows.map((row) => `
          <article class="chain-card" data-chain-search="${escapeHtml(normalizeSearchText(`${row.faculty.osu_name} ${row.faculty.mgp_name || ""} ${row.path.map((personIndex) => state.people[personIndex]?.name || "").join(" ")}`))}">
            <div>
              <strong>${facultyGraphButton(row.faculty, "chain-faculty-link graph-person-button")}</strong>
              <span>${row.steps} advisor links</span>
            </div>
            <p class="chain-path">
              ${row.path.map((personIndex) => escapeHtml(state.people[personIndex]?.name || "")).join(" &rarr; ")}
            </p>
          </article>
        `).join("")}
      </div>
    </details>
  `;
  bindDetailSectionToggles(els.chainPanel);
  bindGraphPersonButtons(els.chainPanel);
  applyChainPathFilter();
  els.chainPanel.querySelector("#chainPathSearch")?.addEventListener("input", (event) => {
    state.chainPathQuery = event.target.value;
    applyChainPathFilter();
  });
}

function applyChainPathFilter() {
  const input = els.chainPanel.querySelector("#chainPathSearch");
  const status = els.chainPanel.querySelector("#chainFilterCount");
  const cards = Array.from(els.chainPanel.querySelectorAll(".chain-card"));
  if (!input || !status || !cards.length) {
    return;
  }
  const query = normalizeSearchText(input.value.trim());
  let shown = 0;
  cards.forEach((card) => {
    const matches = textMatchesSearch(card.dataset.chainSearch || "", query);
    card.hidden = !matches;
    if (matches) {
      shown += 1;
    }
  });
  els.chainPanel.querySelector(".chain-list")?.scrollTo({ top: 0 });
  status.textContent = query
    ? shown
      ? `${shown.toLocaleString()} matching ${shown === 1 ? "chain" : "chains"} of ${cards.length.toLocaleString()}`
      : `No matching lineage chains among ${cards.length.toLocaleString()} chains.`
    : `Showing ${cards.length.toLocaleString()} full lineage chains.`;
}

function renderRelationshipPanel() {
  if (state.selectedNodeIndex !== null) {
    els.relationshipPanel.innerHTML = "";
    return;
  }

  const relationship = twoFacultyRelationship();
  if (!relationship) {
    els.relationshipPanel.innerHTML = "";
    return;
  }

  if (!relationship.ancestor) {
    els.relationshipPanel.innerHTML = `
      <section class="relationship-card relationship-card-primary">
        <div class="relationship-main">
          <span class="relationship-kicker">Two-faculty connection</span>
          <strong>${facultyGraphButton(relationship.leftFaculty, "chain-faculty-link graph-person-button")} and ${facultyGraphButton(relationship.rightFaculty, "chain-faculty-link graph-person-button")}</strong>
        </div>
      <p>No shared academic ancestor appears in this graph for this pair.</p>
    </section>
    `;
    return;
  }

  const leftPath = relationship.leftPath.map((personIndex) => escapeHtml(state.people[personIndex]?.name || "")).join(" &rarr; ");
  const rightPath = relationship.rightPath.map((personIndex) => escapeHtml(state.people[personIndex]?.name || "")).join(" &rarr; ");
  els.relationshipPanel.innerHTML = `
    <section class="relationship-card relationship-card-primary">
      <div class="relationship-main">
        <span class="relationship-kicker">Two-faculty connection</span>
        <strong>
          ${facultyGraphButton(relationship.leftFaculty, "chain-faculty-link graph-person-button")}
          and
          ${facultyGraphButton(relationship.rightFaculty, "chain-faculty-link graph-person-button")}
          are ${escapeHtml(relationship.relation)}
        </strong>
      </div>
      <details class="relationship-more" data-relationship-why${detailSectionOpenAttr("relationship-why", false)}>
        <summary class="relationship-more-header">
          <span>
            <strong>Why?</strong>
            <small>
              via
              <button type="button" class="summary-link-button relationship-via-button" data-summary-action="show-relationship-ancestor">${escapeHtml(relationship.ancestor.name)}</button>
            </small>
          </span>
          <span class="summary-toggle">Details</span>
        </summary>
        <div class="relationship-stats">
          <span>${escapeHtml(relationship.leftFaculty.osu_name)}: ${escapeHtml(advisorStepLabel(relationship.leftDistance))}</span>
          <span>${escapeHtml(relationship.rightFaculty.osu_name)}: ${escapeHtml(advisorStepLabel(relationship.rightDistance))}</span>
        </div>
        <div class="relationship-paths">
          <span><strong>${escapeHtml(relationship.leftFaculty.osu_name)}</strong>${leftPath ? `: ${leftPath}` : ""}</span>
          <span><strong>${escapeHtml(relationship.rightFaculty.osu_name)}</strong>${rightPath ? `: ${rightPath}` : ""}</span>
        </div>
      </details>
    </section>
  `;
  bindDetailSectionToggles(els.relationshipPanel);
  bindGraphPersonButtons(els.relationshipPanel);
  els.relationshipPanel.querySelector("[data-relationship-why]")?.addEventListener("toggle", (event) => {
    setDetailSectionOpen("relationship-why", event.currentTarget.open);
  });
  els.relationshipPanel.querySelectorAll("[data-summary-action='show-relationship-ancestor']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showAdvisorPathsForNode(relationship.ancestorIndex);
    });
  });
}

function renderSharedAncestorPanel(rows, tableKind = "all") {
  const active = activeFacultyIndices();
  const activeCount = active.length;
  const top = rows[0];
  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  els.sharedAncestorsPanel.open = isDetailSectionOpen("shared-table", activeCount > 1 && state.selectedNodeIndex === null);
  els.sharedAncestorsPanel.dataset.tableKind = tableKind;
  const hasCountColumn = tableKind === "most";
  els.sharedAncestorsTitle.textContent = activeCount <= 1
    ? "Known Ancestry"
    : tableKind === "both"
      ? "Shared By Both"
      : "Shared By Most";
  els.ancestorMatchedHeader.hidden = !hasCountColumn;
  els.ancestorMatchedHeader.textContent = "Count";
  els.ancestorMatchedHeader.title = hasCountColumn ? "Selected faculty descendants reached by this ancestor" : "";
  els.sharedAncestorsNote.textContent = activeCount <= 1
    ? "Search or choose a known ancestor to see details."
    : tableKind === "both"
      ? "Search ancestors shared by both selected faculty."
      : "Ordered by count, then most recent year.";
  if (els.ancestorTableSearch) {
    els.ancestorTableSearch.value = state.ancestorTableQuery;
    els.ancestorTableSearch.placeholder = activeCount <= 1
      ? "Find a known ancestor..."
      : tableKind === "both"
        ? "Find a shared ancestor..."
        : "Find a shared-by-most ancestor...";
  }
  if (!top) {
    els.sharedAncestorsSummary.textContent = activeCount <= 1
      ? "No ancestors shown for this selection"
      : "";
  } else if (activeCount === 1) {
    els.sharedAncestorsSummary.textContent = "";
  } else {
    els.sharedAncestorsSummary.textContent = "";
  }
}

function renderAncestorTable(rows, tableKind = "all") {
  renderSharedAncestorPanel(rows, tableKind);
  const table = els.ancestorRows.closest("table");
  if (table) {
    table.dataset.tableKind = tableKind;
  }
  const hasCountColumn = tableKind === "most";
  const query = normalizeSearchText(state.ancestorTableQuery.trim());
  const filteredRows = query
    ? rows.filter((row) => textMatchesSearch(row.name, query))
    : rows;
  const maxRows = tableKind === "lineage"
    ? rows.length
    : tableKind === "both"
      ? SHARED_BOTH_TABLE_MAX_ROWS
      : SHARED_TABLE_MAX_ROWS;
  const topRows = query ? filteredRows : filteredRows.slice(0, maxRows);
  if (!topRows.length) {
    const emptyLabel = query
      ? "No matching ancestors."
      : tableKind === "lineage"
        ? "No known ancestors to show."
        : tableKind === "both"
          ? "No shared-by-both ancestors to show."
          : "No shared-by-most ancestors to show.";
    els.ancestorRows.innerHTML = `<tr><td colspan="${hasCountColumn ? 2 : 1}" class="empty">${emptyLabel}</td></tr>`;
    return;
  }

  els.ancestorRows.innerHTML = topRows
    .map((row) => {
      return `
      <tr>
        <td><button type="button" class="table-person-button" data-person-index="${row.personIndex}">${escapeHtml(row.name)}</button></td>
        ${hasCountColumn ? `<td class="numeric" title="${row.matchedCount.toLocaleString()} selected faculty descendants reached by this ancestor">${row.matchedCount.toLocaleString()}</td>` : ""}
      </tr>
    `;
    })
    .join("");

  els.ancestorRows.querySelectorAll(".table-person-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectTableAncestor(Number(button.dataset.personIndex));
    });
  });
}

function renderDetail() {
  const selectedFaculty = activeFacultyIndices();
  if (state.selectedNodeIndex === null) {
    els.nodeDetail.innerHTML = "";
    return;
  }

  const person = state.people[state.selectedNodeIndex];
  const activeMask = maskForFaculty(selectedFaculty);
  const matchedMask = state.peopleMasks[state.selectedNodeIndex] & activeMask;
  const matchedFaculty = selectedFaculty.filter((index) => matchedMask & (1n << BigInt(index)));
  const facultyRecord = state.faculty.find((faculty) => Number(faculty.person_index) === state.selectedNodeIndex);
  const advisorNames = advisorNamesForPerson(person).join("; ");
  const descendantCount = descendantFacultyIndices(state.selectedNodeIndex).length;
  const selectedAncestorNode = state.selectedNodeIndex === state.selectedAncestorIndex;
  const selectedReachLabel = selectedFaculty.length
    ? `${matchedFaculty.length.toLocaleString()} of ${selectedFaculty.length.toLocaleString()} selected faculty`
    : "No selected faculty";
  syncDetailFacultyLimit(state.selectedNodeIndex, selectedFaculty);
  const detailFacultyLimit = Math.min(
    matchedFaculty.length,
    Math.max(DETAIL_FACULTY_INITIAL_COUNT, state.detailFacultyLimit),
  );
  const visibleMatchedFaculty = matchedFaculty.slice(0, detailFacultyLimit);
  const hiddenMatchedFaculty = matchedFaculty.length - visibleMatchedFaculty.length;
  const nextMatchedFaculty = Math.min(DETAIL_FACULTY_INCREMENT, hiddenMatchedFaculty);
  const matchedFacultyTags = matchedFaculty.length && !selectedAncestorNode
    ? `<div class="tag-row detail-faculty-list" aria-label="Shown faculty reached by this person">
        ${visibleMatchedFaculty.map((index) => facultyGraphButton(state.faculty[index], "tag graph-person-button")).join("")}
        ${hiddenMatchedFaculty > 0 ? `<button type="button" class="tag tag-action" data-detail-faculty-action="more">+${nextMatchedFaculty}</button>` : ""}
        ${visibleMatchedFaculty.length > DETAIL_FACULTY_INITIAL_COUNT ? `<button type="button" class="tag tag-action" data-detail-faculty-action="first">Show first ${DETAIL_FACULTY_INITIAL_COUNT}</button>` : ""}
      </div>`
    : "";

  const degreeLine = personDegreeLabel(person);
  const graphPlacementLabel = graphYearLabel(person, state.selectedNodeIndex);
  const showGraphPlacement = Boolean(
    graphPlacementLabel && (isInferredYear(person) || estimatedYearForIndex(state.selectedNodeIndex)),
  );
  const nodeSummaryTitle = facultyRecord ? "Selected Faculty" : "Selected Ancestor";
  const nodeSummaryDetail = facultyRecord
    ? facultyRecord.osu_name
    : person.name;
  const nodeBody = facultyRecord
    ? `
        <div class="detail-name">${escapeHtml(facultyRecord.osu_name)}</div>
        <div><strong>PhD:</strong> ${escapeHtml(facultyDegreeSummary(facultyRecord, person))}</div>
        ${advisorNames ? `<div><strong>Advisor:</strong> ${escapeHtml(advisorNames)}</div>` : ""}
        <div><strong>Areas:</strong> ${escapeHtml(facultyAreaLabels(facultyRecord, 4) || "not listed")}</div>
      `
    : `
        <div class="detail-name">${escapeHtml(person.name)}</div>
        <div><strong>Genealogy ID:</strong> <a href="${person.url}" target="_blank" rel="noreferrer">${escapeHtml(person.id)}</a></div>
        ${degreeLine ? `<div><strong>Degree:</strong> ${escapeHtml(degreeLine)}</div>` : ""}
        ${showGraphPlacement ? `<div><strong>Graph placement:</strong> ${escapeHtml(graphPlacementLabel)}</div>` : ""}
        ${advisorNames ? `<div><strong>Advisor:</strong> ${escapeHtml(advisorNames)}</div>` : ""}
        ${selectedAncestorNode ? "" : `
          <div><strong>Selected faculty reached:</strong> ${escapeHtml(selectedReachLabel)}</div>
        `}
        ${selectedAncestorNode ? "" : `<div class="node-actions">
          <button type="button" data-node-action="descendants" ${descendantCount ? "" : "disabled"}>Show descendants</button>
        </div>`}
      `;

  els.nodeDetail.innerHTML = `
    <details class="detail-section node-section" data-detail-section="selection"${detailSectionOpenAttr("selection", true)}>
      <summary>
        <span>
          <strong>${escapeHtml(nodeSummaryTitle)}</strong>
          <small>${escapeHtml(nodeSummaryDetail)}</small>
        </span>
        <span class="summary-toggle">Details</span>
      </summary>
      <div class="node-detail-body">
        ${nodeBody}
        ${matchedFacultyTags}
      </div>
    </details>
  `;
  bindDetailSectionToggles(els.nodeDetail);
  bindGraphPersonButtons(els.nodeDetail);
  els.nodeDetail.querySelector("[data-detail-faculty-action='more']")?.addEventListener("click", () => {
    state.detailFacultyLimit = Math.min(matchedFaculty.length, state.detailFacultyLimit + DETAIL_FACULTY_INCREMENT);
    renderDetail();
  });
  els.nodeDetail.querySelector("[data-detail-faculty-action='first']")?.addEventListener("click", () => {
    state.detailFacultyLimit = DETAIL_FACULTY_INITIAL_COUNT;
    renderDetail();
  });
  els.nodeDetail.querySelector("[data-node-action='descendants']")?.addEventListener("click", () => {
    applyAncestorPerson(state.selectedNodeIndex);
  });
}

function yearToY(year) {
  const span = Math.max(1, state.yearRange.max - state.yearRange.min);
  return state.yearAxis.top + ((year - state.yearRange.min) / span) * Math.max(1, state.yearAxis.bottom - state.yearAxis.top);
}

function computeNodePositions(graphData, displayWidth = 1200, displayHeight = 620) {
  const positions = new Map();
  const facultySet = graphData.activeFacultyPersonIndices;
  const ancestorNodes = graphData.nodes.filter((index) => !facultySet.has(index));
  const activeFaculty = activeFacultyIndices();
  const activeMask = maskForFaculty(activeFaculty);
  const years = graphData.nodes.map((index) => placementYearForIndex(index)).filter(Number.isFinite);
  const minYear = Math.min(...years, 1100);
  const maxYear = Math.max(...years, 2026);
  const bandCount = Math.max(8, Math.min(20, Math.ceil((maxYear - minYear) / 55)));
  const buckets = Array.from({ length: bandCount }, () => []);
  const unknown = [];
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));

  ancestorNodes
    .slice()
    .sort((a, b) => {
      const yearA = placementYearForIndex(a) || 9999;
      const yearB = placementYearForIndex(b) || 9999;
      return yearA - yearB || (commonRank.get(a) || 0) - (commonRank.get(b) || 0);
    })
    .forEach((personIndex) => {
      const year = placementYearForIndex(personIndex);
      if (!year) {
        unknown.push(personIndex);
        return;
      }
      const band = clamp(
        Math.floor(((year - minYear) / Math.max(1, maxYear - minYear)) * bandCount),
        0,
        bandCount - 1,
      );
      buckets[band].push({ personIndex, baseX: 0 });
    });

  if (unknown.length) {
    const middleBand = Math.floor(bandCount / 2);
    buckets[middleBand].push(...unknown.map((personIndex) => ({ personIndex, baseX: 0 })));
  }

  const maxBucketSize = Math.max(1, ...buckets.map((bucket) => bucket.length));
  const visibleAncestorCount = graphData.visibleCommon?.length || 0;
  const visibleNodeCount = graphData.nodes.length || 0;
  const facultyRowTarget = clamp(Math.floor((displayWidth || 1200) / 58), 18, 36);
  const facultyRows = Math.max(1, Math.ceil(facultySet.size / facultyRowTarget));
  const facultyColumns = Math.max(1, Math.ceil(facultySet.size / facultyRows));
  const facultyBandHeight = 116 + (facultyRows - 1) * 120;
  const countBasedWidth = Math.max(
    360 + facultyColumns * 168,
    420 + maxBucketSize * 96,
    520 + visibleAncestorCount * 86,
  );
  const viewportBasedWidth = Math.round((displayWidth || 1200) * (visibleNodeCount > 180 ? 2.45 : 2.25));
  const worldWidth = Math.max(
    1750,
    Math.min(9000, Math.max(countBasedWidth, viewportBasedWidth)),
  );
  const viewportAspectHeight = Math.round(
    worldWidth * Math.max(0.45, (displayHeight - 72) / Math.max(1, displayWidth - 72)),
  );
  const fullLineageHeight = graphData.fullLineage
    ? viewportAspectHeight
    : 0;
  const worldHeight = Math.max(
    1850,
    Math.min(
      6200,
      Math.max(
        fullLineageHeight,
        1320 + Math.min(240, graphData.nodes.length) * 9 + facultyBandHeight,
      ),
    ),
  );
  state.yearRange = { min: minYear, max: maxYear };
  state.graphBounds = {
    left: 30,
    top: 30,
    right: worldWidth + 50,
    bottom: worldHeight + 60,
    width: worldWidth,
    height: worldHeight,
  };
  const facultyBandTop = worldHeight - 86 - (facultyRows - 1) * 120;
  state.yearAxis = {
    top: graphData.fullLineage ? 70 : 100,
    bottom: Math.max(260, facultyBandTop - (graphData.fullLineage ? 108 : 150)),
  };

  const left = 120;
  const right = worldWidth - 160;
  const usableWidth = Math.max(1, right - left);
  const facultyNodes = Array.from(facultySet).sort((a, b) => state.people[a].name.localeCompare(state.people[b].name));
  const facultyXByFacultyIndex = new Map();
  facultyNodes.forEach((personIndex, slot) => {
    const row = Math.floor(slot / facultyColumns);
    const column = slot % facultyColumns;
    const rowStart = row * facultyColumns;
    const columnsInRow = Math.max(1, Math.min(facultyColumns, facultyNodes.length - rowStart));
    const x = columnsInRow <= 1 ? worldWidth / 2 : left + (column / (columnsInRow - 1)) * usableWidth;
    const faculty = facultyByPersonIndex(personIndex);
    if (faculty) {
      facultyXByFacultyIndex.set(Number(faculty.faculty_index), x);
    }
    positions.set(personIndex, {
      x,
      y: facultyBandTop + row * 120,
    });
  });

  buckets.forEach((bucket, band) => {
    bucket.forEach((entry, slot) => {
      const matchedFaculty = activeFaculty
        .filter((facultyIndex) => state.peopleMasks[entry.personIndex] & activeMask & (1n << BigInt(facultyIndex)))
        .map((facultyIndex) => facultyXByFacultyIndex.get(facultyIndex))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const middle = Math.floor(matchedFaculty.length / 2);
      const medianX = matchedFaculty.length
        ? matchedFaculty.length % 2
          ? matchedFaculty[middle]
          : (matchedFaculty[middle - 1] + matchedFaculty[middle]) / 2
        : left + (((slot + 1) / (bucket.length + 1)) * usableWidth);
      entry.baseX = clamp(medianX + ((band % 3) - 1) * 14, left, right);
    });

    bucket.sort((a, b) => a.baseX - b.baseX || state.people[a.personIndex].name.localeCompare(state.people[b.personIndex].name));
    const selectedInBucket = bucket.filter((entry) => commonRank.has(entry.personIndex)).length;
    const targetGap = selectedInBucket >= 4 ? 88 : selectedInBucket >= 2 ? 76 : 58;
    const minGap = bucket.length <= 1
      ? 0
      : Math.min(targetGap, Math.max(26, usableWidth / Math.max(1, bucket.length - 1)));
    let previousX = left - minGap;
    bucket.forEach((entry) => {
      entry.x = Math.max(entry.baseX, previousX + minGap);
      previousX = entry.x;
    });
    const overflow = bucket.length ? Math.max(0, bucket[bucket.length - 1].x - right) : 0;
    if (overflow) {
      bucket.forEach((entry) => {
        entry.x -= overflow;
      });
    }
    bucket.forEach((entry) => {
      const year = placementYearForIndex(entry.personIndex);
      positions.set(entry.personIndex, {
        x: clamp(entry.x, left, right),
        y: year ? yearToY(year) : yearToY(Math.round((minYear + maxYear) / 2)),
      });
    });
  });

  state.nodePositions = positions;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = els.canvas.clientWidth || 1200;
  const displayHeight = els.canvas.clientHeight || 620;
  els.canvas.width = Math.round(displayWidth * ratio);
  els.canvas.height = Math.round(displayHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ratio, displayWidth, displayHeight };
}

function resizeOverviewCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = els.overview.clientWidth || 210;
  const displayHeight = els.overview.clientHeight || 140;
  els.overview.width = Math.round(displayWidth * ratio);
  els.overview.height = Math.round(displayHeight * ratio);
  overviewCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { displayWidth, displayHeight };
}

function fitGraphView(mode = "width") {
  const width = els.canvas.clientWidth || 1200;
  const height = els.canvas.clientHeight || 620;
  const bounds = state.graphBounds;
  if (mode === "faculty") {
    const graphData = state.currentGraphData;
    const facultyPoints = graphData
      ? Array.from(graphData.activeFacultyPersonIndices)
        .map((personIndex) => state.nodePositions.get(personIndex))
        .filter(Boolean)
      : [];
    if (facultyPoints.length) {
      const left = Math.min(...facultyPoints.map((point) => point.x));
      const right = Math.max(...facultyPoints.map((point) => point.x));
      const bottom = Math.max(...facultyPoints.map((point) => point.y));
      const scale = clamp((width - 96) / Math.max(900, right - left + 280), MIN_SCALE, Math.min(MAX_SCALE, 1.2));
      state.view.scale = scale;
      state.view.x = width / 2 - ((left + right) / 2) * scale;
      state.view.y = height - 150 - bottom * scale;
      return;
    }
  }
  const scaleX = (width - 72) / Math.max(1, bounds.width);
  const scaleY = (height - 72) / Math.max(1, bounds.height);
  const scale = clamp(mode === "all" ? Math.min(scaleX, scaleY, 1) : Math.min(scaleX, 0.9), MIN_SCALE, MAX_SCALE);
  state.view.scale = scale;
  state.view.x = width / 2 - (bounds.left + bounds.width / 2) * scale;
  state.view.y = mode === "all"
    ? height / 2 - (bounds.top + bounds.height / 2) * scale
    : 42 - bounds.top * scale;
}

function centerOnNode(personIndex) {
  const point = state.nodePositions.get(personIndex);
  if (!point) {
    return;
  }
  const width = els.canvas.clientWidth || 1200;
  const height = els.canvas.clientHeight || 620;
  state.view.scale = Math.max(state.view.scale, 0.72);
  state.view.x = width / 2 - point.x * state.view.scale;
  state.view.y = height / 2 - point.y * state.view.scale;
}

function worldToScreen(point) {
  return {
    x: point.x * state.view.scale + state.view.x,
    y: point.y * state.view.scale + state.view.y,
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.view.x) / state.view.scale,
    y: (point.y - state.view.y) / state.view.scale,
  };
}

function drawYearAxis() {
  const bounds = state.graphBounds;
  const step = 100;
  const start = Math.ceil(state.yearRange.min / step) * step;
  ctx.lineWidth = 1 / state.view.scale;
  ctx.strokeStyle = "rgba(100, 106, 110, 0.18)";
  ctx.fillStyle = OSU_COLORS.grayDark40;
  ctx.font = `${11 / state.view.scale}px ${CANVAS_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let year = start; year <= state.yearRange.max; year += step) {
    const y = yearToY(year);
    ctx.beginPath();
    ctx.moveTo(bounds.left + 72, y);
    ctx.lineTo(bounds.right - 38, y);
    ctx.stroke();
    ctx.fillText(String(year), bounds.left + 60, y);
  }
  ctx.textAlign = "left";
}

function measureScreenLabelBox(lines, options = {}) {
  const fontSize = options.fontSize || 11;
  const lineHeight = fontSize * 1.18;
  const paddingX = 6;
  const paddingY = 5;
  ctx.font = `${options.weight || 600} ${fontSize}px ${CANVAS_FONT}`;
  return {
    width: Math.max(...lines.map((line) => ctx.measureText(line).width), 1) + 2 * paddingX,
    height: lines.length * lineHeight + 2 * paddingY,
    fontSize,
    lineHeight,
    paddingX,
    paddingY,
  };
}

function drawScreenLabelBox(lines, left, top, measured, options = {}) {
  ctx.fillStyle = options.background || "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = options.border || "rgba(207, 212, 216, 0.98)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, top, measured.width, measured.height, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = `${options.weight || 600} ${measured.fontSize}px ${CANVAS_FONT}`;
  ctx.fillStyle = options.color || OSU_COLORS.grayDark80;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, left + measured.paddingX, top + measured.paddingY + index * measured.lineHeight);
  });
}

function drawOverview(graphData, displayWidth, displayHeight) {
  const { displayWidth: overviewWidth, displayHeight: overviewHeight } = resizeOverviewCanvas();
  overviewCtx.clearRect(0, 0, overviewWidth, overviewHeight);
  overviewCtx.fillStyle = "rgba(255, 255, 255, 0.92)";
  overviewCtx.fillRect(0, 0, overviewWidth, overviewHeight);

  const bounds = state.graphBounds;
  const scale = Math.min(
    (overviewWidth - 2 * OVERVIEW_PADDING) / Math.max(1, bounds.width),
    (overviewHeight - 2 * OVERVIEW_PADDING) / Math.max(1, bounds.height),
  );
  const offsetX = (overviewWidth - bounds.width * scale) / 2 - bounds.left * scale;
  const offsetY = (overviewHeight - bounds.height * scale) / 2 - bounds.top * scale;
  state.overviewTransform = { scale, offsetX, offsetY, width: overviewWidth, height: overviewHeight };

  function overviewPoint(point) {
    return {
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY,
    };
  }

  const activeMask = maskForFaculty(activeFacultyIndices());
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));
  const highOverlapRank = new Map(
    (graphData.sharedTableRows || [])
      .slice(0, GRAPH_SHARED_HIGHLIGHT_LIMIT)
      .map((row, rank) => [row.personIndex, rank]),
  );
  graphData.nodes.forEach((personIndex) => {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const overview = overviewPoint(point);
    const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const rank = commonRank.get(personIndex);
    const overlapRank = highOverlapRank.get(personIndex);
    if (!graphData.fullLineage && !isFaculty && (rank === undefined || rank >= 35) && overlapRank === undefined) {
      return;
    }
    const radius = isFaculty ? 1.8 : Math.max(1.1, Math.min(2, 1 + matchedCount / 34));
    overviewCtx.beginPath();
    overviewCtx.arc(overview.x, overview.y, radius, 0, Math.PI * 2);
    overviewCtx.fillStyle = isFaculty
      ? OSU_COLORS.scarlet
      : rank !== undefined || overlapRank !== undefined
        ? rank < 20 ? OSU_COLORS.sharedDark : OSU_COLORS.shared
        : OSU_COLORS.grayDark20;
    overviewCtx.fill();
  });

  const viewLeft = (0 - state.view.x) / state.view.scale;
  const viewTop = (0 - state.view.y) / state.view.scale;
  const viewRight = (displayWidth - state.view.x) / state.view.scale;
  const viewBottom = (displayHeight - state.view.y) / state.view.scale;
  const rectLeft = viewLeft * scale + offsetX;
  const rectTop = viewTop * scale + offsetY;
  const rectWidth = Math.max(5, (viewRight - viewLeft) * scale);
  const rectHeight = Math.max(5, (viewBottom - viewTop) * scale);
  overviewCtx.fillStyle = "rgba(186, 12, 47, 0.08)";
  overviewCtx.strokeStyle = "rgba(186, 12, 47, 0.74)";
  overviewCtx.lineWidth = 1.4;
  overviewCtx.beginPath();
  overviewCtx.rect(rectLeft, rectTop, rectWidth, rectHeight);
  overviewCtx.fill();
  overviewCtx.stroke();

  overviewCtx.strokeStyle = "rgba(207, 212, 216, 0.95)";
  overviewCtx.lineWidth = 1;
  overviewCtx.strokeRect(0.5, 0.5, overviewWidth - 1, overviewHeight - 1);
}

function rectIsOpen(rects, left, top, width, height) {
  const gap = 7;
  const right = left + width;
  const bottom = top + height;
  return rects.every((rect) =>
    right + gap < rect.left ||
    left - gap > rect.right ||
    bottom + gap < rect.top ||
    top - gap > rect.bottom,
  );
}

function drawGraphLabels(graphData, displayWidth, displayHeight) {
  const visibleNodes = new Set(graphData.nodes);
  const labels = new Map();
  const activeCount = activeFacultyIndices().length;
  const labelZoom = clamp((state.view.scale - 0.24) / 0.95, 0, 1);
  const overviewLabelBoost = state.view.scale <= 0.3 ? 0.18 : 0;
  const labelProgress = clamp(labelZoom + overviewLabelBoost, 0, 1);
  const closeLabelZoom = clamp((state.view.scale - 0.4) / 0.75, 0, 1);
  const closeLabelProgress = clamp(closeLabelZoom + overviewLabelBoost / 2, 0, 1);
  const quietDefault =
    activeCount > 24 &&
    state.focusMode === "common" &&
    state.selectedAncestorIndex === null &&
    state.selectedNodeIndex === null;

  function addLabel(personIndex, kind, priority) {
    if (!visibleNodes.has(personIndex)) {
      return;
    }
    const prominenceBoost = !graphData.activeFacultyPersonIndices.has(personIndex) && hasWikipediaArticle(personIndex) ? 7 : 0;
    const labelPriority = priority + prominenceBoost;
    const current = labels.get(personIndex);
    if (current && current.priority >= labelPriority) {
      return;
    }
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const anchor = worldToScreen(point);
    if (anchor.x < -180 || anchor.x > displayWidth + 180 || anchor.y < -120 || anchor.y > displayHeight + 120) {
      return;
    }
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const lines = wrapWords(
      state.people[personIndex].name,
      isFaculty ? 15 : kind === "path" ? 18 : 17,
      isFaculty ? 3 : 2,
    );
    const measured = measureScreenLabelBox(lines, {
      fontSize: labelPriority >= 90 || isFaculty ? 11 : 10.5,
      weight: labelPriority >= 90 || isFaculty ? 700 : 600,
    });
    labels.set(personIndex, { personIndex, anchor, lines, measured, kind, priority: labelPriority });
  }

  const facultyLabelLimit = quietDefault
    ? Math.round(labelProgress * Math.min(10, activeCount))
    : state.focusMode === "faculty"
      ? Math.round(24 + labelProgress * 18)
      : activeCount <= 12
        ? Math.min(activeCount, Math.round(4 + labelProgress * Math.min(6, activeCount)))
        : Math.round(7 + labelProgress * Math.min(20, Math.max(0, activeCount - 6)));
  Array.from(graphData.activeFacultyPersonIndices)
    .sort((a, b) => state.people[a].name.localeCompare(state.people[b].name))
    .slice(0, facultyLabelLimit)
    .forEach((personIndex) => addLabel(personIndex, "faculty", 55));

  const ancestorLabelLimit = quietDefault
    ? Math.round(3 + labelProgress * 12)
    : Math.round(4 + labelProgress * 16);
  graphData.visibleCommon.slice(0, ancestorLabelLimit).forEach((row, rank) => {
    if (!graphData.activeFacultyPersonIndices.has(row.personIndex)) {
      addLabel(row.personIndex, "ancestor", 68 - rank);
    }
  });

  const visibleCommonSet = new Set(graphData.visibleCommon.map((row) => row.personIndex));
  const connectorLabelLimit = graphData.fullLineage
    ? (graphData.lineageLabelNodes?.length || 0)
    : Math.round(closeLabelProgress * (quietDefault ? 12 : 24));
  const connectorLabelSource = graphData.fullLineage
    ? (graphData.lineageLabelNodes || Array.from(graphData.lineageLabelNodeSet || []))
    : Array.from(graphData.connectorNodeSet || []);
  const orderedConnectorLabels = connectorLabelSource
    .filter((personIndex) =>
      visibleNodes.has(personIndex) &&
      !graphData.activeFacultyPersonIndices.has(personIndex) &&
      !visibleCommonSet.has(personIndex));
  if (!graphData.fullLineage) {
    orderedConnectorLabels.sort((a, b) => {
      const wikiDelta = Number(hasWikipediaArticle(b)) - Number(hasWikipediaArticle(a));
      if (wikiDelta) {
        return wikiDelta;
      }
      const yearA = placementYearForIndex(a) || 0;
      const yearB = placementYearForIndex(b) || 0;
      return yearB - yearA || state.people[a].name.localeCompare(state.people[b].name);
    });
  }
  orderedConnectorLabels
    .slice(0, connectorLabelLimit)
    .forEach((personIndex, index) => addLabel(
      personIndex,
      "path",
      graphData.fullLineage ? 66 - index / 100 : 50 - index / 100,
    ));

  if (activeCount <= 2) {
    GRAPH_ANCESTOR_PRESETS.forEach((preset) => {
      const personIndex = personIndexByMgpId(preset.pid);
      if (personIndex !== null && visibleNodes.has(personIndex)) {
        addLabel(personIndex, "ancestor", 84);
      }
    });
  }

  if (graphData.chainAnchorIndex !== null) {
    addLabel(graphData.chainAnchorIndex, "path", 92);
  }

  if (graphData.defaultComparisonAnchorIndex !== null) {
    addLabel(graphData.defaultComparisonAnchorIndex, "ancestor", 96);
  }

  [state.selectedAncestorIndex, state.selectedNodeIndex, state.hoveredNodeIndex].forEach((personIndex) => {
    if (personIndex === null) {
      return;
    }
    addLabel(personIndex, graphData.activeFacultyPersonIndices.has(personIndex) ? "faculty" : "path", 100);
  });

  const orderedLabels = Array.from(labels.values())
    .sort((a, b) => b.priority - a.priority || a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x);

  const placedRects = [];
  const placements = [];

  function labelAttachPoint(label, left, top) {
    return {
      x: clamp(label.anchor.x, left, left + label.measured.width),
      y: clamp(label.anchor.y, top, top + label.measured.height),
    };
  }

  function labelPlacementCandidates(label, emphasized) {
    const width = label.measured.width;
    const height = label.measured.height;
    const gap = emphasized ? 11 : 9;
    const centeredTop = label.anchor.y - height / 2;
    const centeredLeft = label.anchor.x - width / 2;
    const candidates = [
      { left: label.anchor.x + gap, top: centeredTop },
      { left: label.anchor.x - width - gap, top: centeredTop },
      { left: centeredLeft, top: label.anchor.y - height - gap },
      { left: centeredLeft, top: label.anchor.y + gap },
    ];
    [-16, 16].forEach((offset) => {
      candidates.push({ left: label.anchor.x + gap, top: centeredTop + offset });
      candidates.push({ left: label.anchor.x - width - gap, top: centeredTop + offset });
    });
    return candidates.map((candidate) => ({
      left: clamp(candidate.left, 6, Math.max(6, displayWidth - width - 6)),
      top: clamp(candidate.top, 6, Math.max(6, displayHeight - height - 6)),
    }));
  }

  orderedLabels.forEach((label) => {
    const emphasized = label.priority >= 90 || state.hoveredNodeIndex === label.personIndex || state.selectedNodeIndex === label.personIndex;
    const maxPlacementDistance = emphasized ? 78 : label.kind === "faculty" ? 48 : label.kind === "ancestor" ? 44 : 42;
    const maxVerticalDistance = emphasized ? 42 : label.kind === "faculty" ? 24 : 28;
    let placed = null;

    for (const candidate of labelPlacementCandidates(label, emphasized)) {
      const target = labelAttachPoint(label, candidate.left, candidate.top);
      const dx = target.x - label.anchor.x;
      const dy = target.y - label.anchor.y;
      if (Math.abs(dy) > maxVerticalDistance || Math.hypot(dx, dy) > maxPlacementDistance) {
        continue;
      }
      if (rectIsOpen(placedRects, candidate.left, candidate.top, label.measured.width, label.measured.height)) {
        placedRects.push({
          left: candidate.left,
          top: candidate.top,
          right: candidate.left + label.measured.width,
          bottom: candidate.top + label.measured.height,
        });
        placed = { ...label, left: candidate.left, top: candidate.top, target };
        break;
      }
    }

    if (placed) {
      placements.push(placed);
    }
  });

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(186, 12, 47, 0.26)";
  placements.forEach((label) => {
    const targetX = label.target.x;
    const targetY = label.target.y;
    const dx = targetX - label.anchor.x;
    const dy = targetY - label.anchor.y;
    const distance = Math.hypot(dx, dy);
    const maxLeaderLength = label.kind === "faculty" ? 52 : 40;
    const endX = distance > maxLeaderLength
      ? label.anchor.x + (dx / distance) * maxLeaderLength
      : targetX;
    const endY = distance > maxLeaderLength
      ? label.anchor.y + (dy / distance) * maxLeaderLength
      : targetY;
    ctx.beginPath();
    ctx.moveTo(label.anchor.x, label.anchor.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  });

  placements.forEach((label) => {
    const selected = state.selectedNodeIndex === label.personIndex;
    const hovered = state.hoveredNodeIndex === label.personIndex;
    const faculty = label.kind === "faculty";
    const sharedAncestor = label.kind === "ancestor";
    const path = label.kind === "path";
    const emphasized = selected || hovered;
    drawScreenLabelBox(label.lines, label.left, label.top, label.measured, {
      color: emphasized
        ? OSU_COLORS.scarletDark40
        : faculty
          ? OSU_COLORS.scarletDark60
          : sharedAncestor
            ? OSU_COLORS.sharedDark
            : OSU_COLORS.grayDark80,
      border: emphasized
        ? "rgba(186, 12, 47, 0.72)"
        : sharedAncestor
          ? "rgba(0, 112, 122, 0.45)"
          : path
          ? "rgba(100, 106, 110, 0.5)"
          : faculty
            ? "rgba(186, 12, 47, 0.45)"
            : "rgba(167, 177, 183, 0.9)",
      background: emphasized ? "rgba(246, 247, 248, 0.98)" : "rgba(255, 255, 255, 0.94)",
      weight: emphasized ? 800 : faculty ? 700 : path ? 650 : 600,
    });
  });
  ctx.restore();
}

function drawGraph(graphData = visibleGraph()) {
  state.currentGraphData = graphData;
  state.graphNodes = graphData.nodes;
  const { displayWidth, displayHeight } = resizeCanvas();
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  computeNodePositions(graphData, displayWidth, displayHeight);

  if (state.needsFit) {
    fitGraphView(state.needsFit);
    state.needsFit = false;
  }
  if (state.pendingCenterNodeIndex !== null) {
    centerOnNode(state.pendingCenterNodeIndex);
    state.pendingCenterNodeIndex = null;
  }

  ctx.fillStyle = OSU_COLORS.grayLight90;
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  ctx.save();
  ctx.translate(state.view.x, state.view.y);
  ctx.scale(state.view.scale, state.view.scale);
  drawYearAxis();

  ctx.lineWidth = 1 / state.view.scale;
  graphData.edges.forEach(([advisorIndex, studentIndex]) => {
    const advisor = state.nodePositions.get(advisorIndex);
    const student = state.nodePositions.get(studentIndex);
    if (!advisor || !student) {
      return;
    }
    ctx.lineWidth = 1 / state.view.scale;
    ctx.strokeStyle = "rgba(100, 106, 110, 0.18)";
    ctx.beginPath();
    ctx.moveTo(advisor.x, advisor.y);
    const midY = (advisor.y + student.y) / 2;
    ctx.bezierCurveTo(advisor.x, midY, student.x, midY, student.x, student.y);
    ctx.stroke();
  });

  const activeMask = maskForFaculty(activeFacultyIndices());
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));
  const highOverlapRank = new Map(
    (graphData.sharedTableRows || [])
      .slice(0, GRAPH_SHARED_HIGHLIGHT_LIMIT)
      .map((row, rank) => [row.personIndex, rank]),
  );
  graphData.nodes.forEach((personIndex) => {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const rank = commonRank.get(personIndex);
    const overlapRank = highOverlapRank.get(personIndex);
    const selected = state.selectedNodeIndex === personIndex;
    const hovered = state.hoveredNodeIndex === personIndex;
    const radius = (selected || hovered ? 8 : isFaculty ? 6 : Math.max(3.5, Math.min(7, 2.5 + matchedCount / 10))) / state.view.scale;

    if (selected || hovered) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + (selected ? 13 : 5) / state.view.scale, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(186, 12, 47, 0.2)" : "rgba(186, 12, 47, 0.09)";
      ctx.fill();
      ctx.lineWidth = (selected ? 3.4 : 1.5) / state.view.scale;
      ctx.strokeStyle = selected ? "rgba(112, 7, 28, 0.9)" : "rgba(186, 12, 47, 0.36)";
      ctx.stroke();
      if (selected) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 5 / state.view.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 2.2 / state.view.scale;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = selected
      ? OSU_COLORS.scarletDark40
      : hovered
        ? OSU_COLORS.scarletDark60
        : isFaculty
          ? OSU_COLORS.scarlet
          : rank !== undefined || overlapRank !== undefined
            ? (rank ?? overlapRank) < 20 ? OSU_COLORS.sharedDark : OSU_COLORS.shared
            : OSU_COLORS.grayDark20;
    ctx.fill();
    ctx.lineWidth = (selected ? 4.2 : hovered ? 3 : 1.4) / state.view.scale;
    ctx.strokeStyle = selected ? OSU_COLORS.white : OSU_COLORS.white;
    ctx.stroke();
  });

  ctx.restore();
  drawGraphLabels(graphData, displayWidth, displayHeight);
  drawOverview(graphData, displayWidth, displayHeight);
}

function render() {
  if (!state.payload) {
    return;
  }
  els.loadingState.hidden = true;
  syncNavigation();
  renderSources();
  renderDataFootnote();
  renderGroups();
  renderFaculty();
  renderGraphSearch();
  renderGraphAncestorPresets();
  renderSelectionChips();
  const graphData = visibleGraph();
  state.currentGraphData = graphData;
  renderQuestionStrip(graphData);
  renderMetrics(graphData);
  renderCurrentViewSummary(graphData);
  renderGraphDensityNote(graphData);
  renderGraphBreadcrumbs();
  renderSummaryPanel(graphData);
  renderAncestorTable(graphData.sharedTableRows, graphData.sharedTableKind);
  renderRelationshipPanel();
  renderDetail();
  renderChainPanel(graphData);
  renderGraphSelectionCard(graphData);
  syncDetailPanelOrder();
  drawGraph(graphData);
  writeUrlState();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function activePointerPoints() {
  return Array.from(state.activePointers.values()).slice(0, 2);
}

function pointerDistance(points) {
  if (points.length < 2) {
    return 0;
  }
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function pointerMidpoint(points) {
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  };
}

function startPinchGesture() {
  const points = activePointerPoints();
  const distance = pointerDistance(points);
  if (points.length < 2 || distance < 1) {
    return;
  }
  const midpoint = pointerMidpoint(points);
  const view = { ...state.view };
  state.pinchStart = {
    distance,
    midpoint,
    view,
    worldPoint: {
      x: (midpoint.x - view.x) / view.scale,
      y: (midpoint.y - view.y) / view.scale,
    },
  };
  state.pointerDown = false;
  state.pointerMoved = true;
  els.canvas.classList.add("dragging");
  hideTooltip();
}

function applyPinchGesture() {
  if (!state.pinchStart) {
    return false;
  }
  const points = activePointerPoints();
  const distance = pointerDistance(points);
  if (points.length < 2 || distance < 1) {
    return false;
  }
  const midpoint = pointerMidpoint(points);
  const nextScale = clamp(
    state.pinchStart.view.scale * (distance / state.pinchStart.distance),
    MIN_SCALE,
    MAX_SCALE,
  );
  state.view.scale = nextScale;
  state.view.x = midpoint.x - state.pinchStart.worldPoint.x * nextScale;
  state.view.y = midpoint.y - state.pinchStart.worldPoint.y * nextScale;
  state.pointerMoved = true;
  refreshGraphViewport();
  return true;
}

function overviewPoint(event) {
  const rect = els.overview.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function centerViewOnWorldPoint(point) {
  const width = els.canvas.clientWidth || 1200;
  const height = els.canvas.clientHeight || 620;
  state.view.x = width / 2 - point.x * state.view.scale;
  state.view.y = height / 2 - point.y * state.view.scale;
}

function hitTestNode(screenPoint) {
  const worldPoint = screenToWorld(screenPoint);
  let best = null;
  let bestDistance = Infinity;
  for (const personIndex of state.graphNodes) {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      continue;
    }
    const distance = Math.hypot(point.x - worldPoint.x, point.y - worldPoint.y);
    if (distance < bestDistance) {
      best = personIndex;
      bestDistance = distance;
    }
  }
  return bestDistance <= 14 / state.view.scale ? best : null;
}

function showTooltip(personIndex, screenPoint) {
  if (personIndex === null) {
    hideTooltip();
    return;
  }
  const person = state.people[personIndex];
  els.tooltip.innerHTML = `
    <strong>${escapeHtml(person.name)}</strong>
    <span>${escapeHtml(personMeta(person, personIndex) || `Genealogy record ${person.id}`)}</span>
  `;
  els.tooltip.hidden = false;
  const left = clamp(screenPoint.x + 14, 8, Math.max(8, els.canvas.clientWidth - 270));
  const top = clamp(screenPoint.y + 14, 8, Math.max(8, els.canvas.clientHeight - 72));
  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function zoomAt(screenPoint, factor) {
  const worldPoint = screenToWorld(screenPoint);
  const nextScale = clamp(state.view.scale * factor, MIN_SCALE, MAX_SCALE);
  state.view.scale = nextScale;
  state.view.x = screenPoint.x - worldPoint.x * nextScale;
  state.view.y = screenPoint.y - worldPoint.y * nextScale;
  refreshGraphViewport();
}

function refreshGraphViewport() {
  const graphData = visibleGraph();
  renderMetrics(graphData);
  renderCurrentViewSummary(graphData);
  renderGraphDensityNote(graphData);
  renderGraphSelectionCard(graphData);
  drawGraph(graphData);
}

function graphCenterPoint() {
  return {
    x: els.canvas.clientWidth / 2,
    y: els.canvas.clientHeight / 2,
  };
}

function performZoomAction(action) {
  if (action === "in") {
    zoomAt(graphCenterPoint(), 1.18);
  } else if (action === "out") {
    zoomAt(graphCenterPoint(), 0.82);
  } else if (action === "width") {
    state.needsFit = "width";
    refreshGraphViewport();
  } else if (action === "all") {
    state.needsFit = "all";
    refreshGraphViewport();
  }
}

function handlePointerDown(event) {
  if (event.pointerType === "touch") {
    event.preventDefault();
  }
  const point = canvasPoint(event);
  state.activePointers.set(event.pointerId, point);
  els.canvas.setPointerCapture(event.pointerId);
  if (state.activePointers.size >= 2) {
    startPinchGesture();
    return;
  }
  state.pointerDown = true;
  state.pointerMoved = false;
  state.pointerStart = point;
  state.viewStart = { ...state.view };
  els.canvas.classList.add("dragging");
}

function handlePointerMove(event) {
  if (event.pointerType === "touch") {
    event.preventDefault();
  }
  const point = canvasPoint(event);
  if (state.activePointers.has(event.pointerId)) {
    state.activePointers.set(event.pointerId, point);
  }
  if (state.activePointers.size >= 2 && applyPinchGesture()) {
    return;
  }
  if (state.pointerDown) {
    const dx = point.x - state.pointerStart.x;
    const dy = point.y - state.pointerStart.y;
    if (Math.hypot(dx, dy) > 3) {
      state.pointerMoved = true;
      state.view.x = state.viewStart.x + dx;
      state.view.y = state.viewStart.y + dy;
      hideTooltip();
      drawGraph();
    }
    return;
  }

  const hovered = hitTestNode(point);
  if (hovered !== state.hoveredNodeIndex) {
    state.hoveredNodeIndex = hovered;
    drawGraph();
  }
  showTooltip(hovered, point);
}

function handlePointerUp(event) {
  if (event.pointerType === "touch") {
    event.preventDefault();
  }
  const point = canvasPoint(event);
  const wasPinching = state.pinchStart !== null || state.activePointers.size > 1;
  state.activePointers.delete(event.pointerId);
  state.pinchStart = null;
  if (state.activePointers.size === 1 && wasPinching) {
    const [remainingPoint] = activePointerPoints();
    state.pointerDown = true;
    state.pointerStart = remainingPoint;
    state.viewStart = { ...state.view };
    state.pointerMoved = true;
  } else {
    state.pointerDown = false;
  }
  els.canvas.classList.toggle("dragging", state.pointerDown || state.pinchStart !== null);
  try {
    els.canvas.releasePointerCapture(event.pointerId);
  } catch (_error) {
    // Pointer capture may already have been released by the browser.
  }
  if (!state.pointerMoved && !wasPinching) {
    const selected = hitTestNode(point);
    state.selectedNodeIndex = selected;
    if (selected !== null) {
      state.pendingCenterNodeIndex = selected;
    }
    render();
  }
}

function clearGraphPointerState() {
  state.pointerDown = false;
  state.pointerMoved = false;
  state.activePointers.clear();
  state.pinchStart = null;
  els.canvas.classList.remove("dragging");
}

function handleDoubleClick(event) {
  const selected = hitTestNode(canvasPoint(event));
  if (selected !== null) {
    showAdvisorPathsForNode(selected);
  }
}

function handleOverviewPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  const transform = state.overviewTransform;
  if (!transform) {
    return;
  }
  const point = overviewPoint(event);
  const worldPoint = {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
  centerViewOnWorldPoint(worldPoint);
  hideTooltip();
  drawGraph();
}

function setAreaMenuOpen(isOpen) {
  if (state.areaMenuOpen === isOpen) {
    return;
  }
  state.areaMenuOpen = isOpen;
  renderGroups();
}

els.viewTabs.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

els.areaMenuButton.addEventListener("click", () => {
  setAreaMenuOpen(!state.areaMenuOpen);
});

els.areaMenuButton.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setAreaMenuOpen(true);
    els.areaMenuList.querySelector("button")?.focus();
  }
});

els.areaMenuList.addEventListener("keydown", (event) => {
  const options = Array.from(els.areaMenuList.querySelectorAll("button"));
  const currentIndex = options.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    setAreaMenuOpen(false);
    els.areaMenuButton.focus();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  const direction = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + options.length) % options.length;
  options[nextIndex]?.focus();
});

document.addEventListener("click", (event) => {
  if (state.areaMenuOpen && !els.areaMenu.contains(event.target)) {
    setAreaMenuOpen(false);
  }
});

els.sharedAncestorsPanel.addEventListener("toggle", () => {
  setDetailSectionOpen("shared-table", els.sharedAncestorsPanel.open);
  if (!els.sharedAncestorsPanel.open) {
    return;
  }
  els.sharedAncestorsPanel.closest(".detail-panel")?.querySelectorAll("details[data-detail-section]").forEach((other) => {
    if (other !== els.sharedAncestorsPanel && other.open) {
      other.open = false;
      setDetailSectionOpen(other.dataset.detailSection, false);
    }
  });
});

els.backToGroupView?.addEventListener("click", () => {
  backToGroupView();
});

els.clearSelectedNode?.addEventListener("click", () => {
  clearSelectedNode();
});

els.closeDetailsSheet?.addEventListener("click", () => {
  closeDetailsView();
});

els.detailBackdrop.addEventListener("click", () => {
  setDetailsOpen(false);
});

els.graphSearch.addEventListener("input", () => {
  state.graphSearchQuery = els.graphSearch.value;
  state.graphSearchActiveIndex = 0;
  renderGraphSearch();
  renderGraphAncestorPresets();
});

els.graphSearch.addEventListener("keydown", (event) => {
  const rows = graphSearchRows();
  if (event.key === "Escape") {
    state.graphSearchQuery = "";
    state.graphSearchActiveIndex = 0;
    renderGraphSearch();
    return;
  }
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length) {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    state.graphSearchActiveIndex = (state.graphSearchActiveIndex + direction + rows.length) % rows.length;
    renderGraphSearch();
    return;
  }
  if (event.key !== "Enter") {
    return;
  }
  const selected = rows[state.graphSearchActiveIndex] || rows[0];
  if (!selected) {
    return;
  }
  event.preventDefault();
  activateGraphSearchRow(selected);
});

els.ancestorTableSearch?.addEventListener("input", () => {
  state.ancestorTableQuery = els.ancestorTableSearch.value;
  const graphData = state.currentGraphData || visibleGraph();
  renderAncestorTable(graphData.sharedTableRows, graphData.sharedTableKind);
});

els.facultySearch.addEventListener("input", () => {
  state.facultySearch = els.facultySearch.value;
  renderFaculty();
});

els.selectAllFaculty.addEventListener("click", () => {
  state.selectedAncestorIndex = null;
  state.selectedFaculty = new Set(groupFacultyIndices());
  markGraphChanged("all");
  render();
});

els.clearFaculty.addEventListener("click", () => {
  state.selectedAncestorIndex = null;
  state.selectedFaculty = new Set();
  markGraphChanged("all");
  render();
});

els.floatingZoomButtons.forEach((button) => {
  button.addEventListener("click", () => {
    performZoomAction(button.dataset.zoomAction);
  });
});

els.canvas.addEventListener("pointerdown", handlePointerDown);
els.canvas.addEventListener("pointermove", handlePointerMove);
els.canvas.addEventListener("pointerup", handlePointerUp);
els.canvas.addEventListener("pointercancel", handlePointerUp);
els.canvas.addEventListener("dblclick", handleDoubleClick);
els.canvas.addEventListener("mouseleave", () => {
  clearGraphPointerState();
  state.hoveredNodeIndex = null;
  hideTooltip();
  drawGraph();
});
els.canvas.addEventListener("wheel", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    event.preventDefault();
    zoomAt(canvasPoint(event), event.deltaY < 0 ? 1.12 : 0.88);
  }
}, { passive: false });
els.overview.addEventListener("pointerdown", handleOverviewPointerDown);

window.addEventListener("resize", () => {
  state.needsFit = state.selectedAncestorIndex === null && state.selectedNodeIndex === null ? "all" : "width";
  refreshGraphViewport();
});

loadData()
  .then((payload) => {
    initializeData(payload);
    render();
  })
  .catch((error) => {
    document.body.innerHTML = `
      <main class="load-error">
        <h1>Could not load static graph data</h1>
        <p>${escapeHtml(error.message)}</p>
      </main>
    `;
  });
