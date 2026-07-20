const DATA_URLS = ["data/osu_mgp_graph.json", "../data/osu_mgp_graph.json"];
const DATA_VERSION = "20260720-mobile-polish-2";
const DEFAULT_VISIBLE_ANCESTORS = 60;
const MOBILE_VISIBLE_ANCESTORS = 32;
const MIN_SCALE = 0.15;
const MAX_SCALE = 2.8;
const OVERVIEW_PADDING = 10;
const EDGE_VIEWPORT_PADDING = 220;
const ADVISOR_PATH_INITIAL_COUNT = 1;
const SELECTION_CHIP_INITIAL_COUNT = 10;
const SELECTION_CHIP_INCREMENT = 25;
const DETAIL_FACULTY_INITIAL_COUNT = 14;
const DETAIL_FACULTY_INCREMENT = 25;
const VALID_VIEWS = new Set(["faculty", "graph"]);
const VALID_FOCUS_MODES = new Set(["common", "faculty", "descendants", "path"]);
const GRAPH_ANCESTOR_PRESETS = [
  { label: "Ibn Sina", pid: "298616" },
  { label: "Gauss", pid: "18231" },
  { label: "Euler", pid: "38586" },
];
const GRAPH_CONTROLS_STORAGE_KEY = "osu-math-geneology-graph-controls-open";

const state = {
  payload: null,
  people: [],
  faculty: [],
  unresolvedFaculty: [],
  groups: [],
  groupLabels: new Map(),
  edges: [],
  peopleMasks: [],
  selectedGroupId: "all-faculty",
  activeView: "graph",
  focusMode: "common",
  detailsOpen: false,
  graphControlsOpen: readStoredBoolean(GRAPH_CONTROLS_STORAGE_KEY, false),
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
  sharedAncestorQuery: "",
  detailSectionOpen: {},
  sharedAncestorsOpen: null,
  sharedAncestorsSelectionKind: null,
  advisorPathLimit: ADVISOR_PATH_INITIAL_COUNT,
  advisorPathAnchorKey: "none",
  selectionChipLimit: SELECTION_CHIP_INITIAL_COUNT,
  selectionChipKey: "none",
  detailFacultyLimit: DETAIL_FACULTY_INITIAL_COUNT,
  detailFacultyKey: "none",
  relationshipPairKey: "none",
  relationshipAutoOpened: false,
  graphNodes: [],
  nodePositions: new Map(),
  graphBounds: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 },
  yearRange: { min: 1100, max: 2026 },
  yearAxis: { top: 100, bottom: 1500 },
  currentGraphData: null,
  selectedNodeIndex: null,
  hoveredNodeIndex: null,
  pendingCenterNodeIndex: null,
  needsFit: "width",
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
  focusButtons: Array.from(document.querySelectorAll("[data-focus-mode]")),
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
  minShared: document.querySelector("#minShared"),
  minSharedLabel: document.querySelector("#minSharedLabel"),
  visibleLimit: document.querySelector("#visibleLimit"),
  visibleLimitLabel: document.querySelector("#visibleLimitLabel"),
  graphControlsPanel: document.querySelector("#graphControlsPanel"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  fitGraph: document.querySelector("#fitGraph"),
  fitAllGraph: document.querySelector("#fitAllGraph"),
  focusFaculty: document.querySelector("#focusFaculty"),
  focusSelectedPaths: document.querySelector("#focusSelectedPaths"),
  resetGraph: document.querySelector("#resetGraph"),
  sharedAncestorsPanel: document.querySelector("#sharedAncestorsPanel"),
  sharedAncestorsSummary: document.querySelector("#sharedAncestorsSummary"),
  ancestorTableSearch: document.querySelector("#ancestorTableSearch"),
  ancestorTableStatus: document.querySelector("#ancestorTableStatus"),
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
  white: "#ffffff",
};

function readStoredBoolean(key, fallback = false) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch (_error) {
    return fallback;
  }
}

function storeBoolean(key, value) {
  try {
    window.localStorage.setItem(key, String(Boolean(value)));
  } catch (_error) {
    // Preferences are nice-to-have only.
  }
}

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

function personDegreeYear(person) {
  if (!person) {
    return "";
  }
  return person.degree_year || (isInferredYear(person) ? "" : person.year || "");
}

function personDegreeCountry(person) {
  if (!person) {
    return "";
  }
  return formatCountryName(person.degree_country || (isInferredYear(person) ? "" : person.country || ""));
}

function personDegreeLabel(person) {
  const parts = [personDegreeYear(person), personDegreeCountry(person)].filter(Boolean);
  return parts.join(", ");
}

function formatCountryName(value) {
  return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function facultyPhdSourceDetail(faculty) {
  const profileText = String(faculty?.osu_phd_from_profile || "").trim();
  if (!profileText || /^not listed\b/i.test(profileText)) {
    return "from genealogy record";
  }
  return profileText;
}

function graphYearLabel(person) {
  if (!person?.year) {
    return "";
  }
  return isInferredYear(person) ? `placed near ${person.year}` : person.year;
}

function tableYearLabel(person) {
  if (!person?.year) {
    return "";
  }
  return isInferredYear(person) ? `~${person.year}` : person.year;
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

function personMeta(person) {
  const degree = personDegreeLabel(person);
  if (degree) {
    return degree;
  }
  return graphYearLabel(person) || "";
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

function selectionTitle() {
  if (state.selectedAncestorIndex !== null) {
    const person = state.people[state.selectedAncestorIndex];
    return person ? `Descendants of ${person.name}` : "Ancestor Descendants";
  }
  if (!activeFacultyIndices().length) {
    return "Custom Selection";
  }
  return isCustomSelection() ? "Custom Selection" : activeGroup()?.label || "Selection";
}

function markGraphChanged(fitMode = "width") {
  state.selectedNodeIndex = null;
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
  markGraphChanged("width");
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

function setFocusMode(mode, fitMode = "width", shouldRender = true) {
  if (!VALID_FOCUS_MODES.has(mode)) {
    return;
  }
  state.focusMode = mode;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.needsFit = fitMode;
  hideTooltip();
  syncNavigation();
  if (shouldRender) {
    render();
  }
}

function selectGraphNode(personIndex, options = {}) {
  if (personIndex === null || personIndex === undefined || !state.people[personIndex]) {
    state.selectedNodeIndex = null;
    render();
    return;
  }
  state.selectedNodeIndex = personIndex;
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
  selectGraphNode(personIndex, { focusMode: "path", fitMode: "width" });
}

function resetGraphView() {
  state.focusMode = "common";
  state.selectedNodeIndex = null;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.needsFit = "width";
  hideTooltip();
  render();
}

function clearSelectedNode(shouldRender = true) {
  state.selectedNodeIndex = null;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.needsFit = "all";
  if (state.focusMode === "path") {
    state.focusMode = "common";
  }
  hideTooltip();
  if (shouldRender) {
    render();
  }
}

function backToGroupView(shouldRender = true) {
  state.selectedAncestorIndex = null;
  state.ancestorQuery = "";
  state.selectedNodeIndex = null;
  state.hoveredNodeIndex = null;
  state.pendingCenterNodeIndex = null;
  state.selectedFaculty = new Set(groupFacultyIndices());
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  state.focusMode = "common";
  state.chainPathQuery = "";
  markGraphChanged("width");
  if (shouldRender) {
    render();
  }
}

function setDetailsOpen(isOpen, shouldRender = true) {
  state.detailsOpen = Boolean(isOpen);
  if (!state.detailsOpen) {
    state.relationshipAutoOpened = true;
  }
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
  if (els.graphControlsPanel && els.graphControlsPanel.open !== state.graphControlsOpen) {
    els.graphControlsPanel.open = state.graphControlsOpen;
  }
  els.viewTabs.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.activeView));
  });
  els.focusButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.focusMode === state.focusMode));
  });
  if (els.focusSelectedPaths) {
    const canShowSelectedPaths = state.selectedNodeIndex !== null;
    els.focusSelectedPaths.disabled = !canShowSelectedPaths;
    els.focusSelectedPaths.setAttribute("aria-pressed", String(canShowSelectedPaths && state.focusMode === "path"));
  }
  if (els.clearSelectedNode) {
    els.clearSelectedNode.disabled = state.selectedNodeIndex === null;
  }
  if (els.backToGroupView) {
    els.backToGroupView.disabled = state.selectedAncestorIndex === null && !isCustomSelection() && state.selectedNodeIndex === null && state.focusMode === "common";
  }
}

function isMobileDetailsLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function syncMobileRelationshipDetails() {
  const active = activeFacultyIndices();
  const pairKey = active.length === 2 ? active.slice().sort((a, b) => a - b).join("-") : "none";
  if (pairKey !== state.relationshipPairKey) {
    state.relationshipPairKey = pairKey;
    state.relationshipAutoOpened = false;
  }
  if (
    pairKey !== "none" &&
    state.activeView === "graph" &&
    isMobileDetailsLayout() &&
    !state.detailsOpen &&
    !state.relationshipAutoOpened
  ) {
    state.detailsOpen = true;
    state.relationshipAutoOpened = true;
  }
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
  if (state.focusMode !== "common") {
    params.set("focus", state.focusMode);
  }
  if (state.activeView !== "graph") {
    params.set("view", state.activeView);
  }
  if (state.minShared !== 2) {
    params.set("min", String(state.minShared));
  }
  const defaultLimit = isMobileDetailsLayout() ? MOBILE_VISIBLE_ANCESTORS : DEFAULT_VISIBLE_ANCESTORS;
  if (state.visibleAncestorLimit !== defaultLimit) {
    params.set("limit", String(state.visibleAncestorLimit));
  }
  if (state.selectedNodeIndex !== null) {
    params.set("node", state.people[state.selectedNodeIndex]?.id || "");
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
  if (view === "details") {
    state.activeView = "graph";
    state.detailsOpen = true;
  } else if (view && VALID_VIEWS.has(view)) {
    state.activeView = view;
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
      markGraphChanged("width");
    }
  }

  const min = Number(params.get("min"));
  if (Number.isFinite(min) && min >= 1) {
    state.minShared = min;
  }

  const limit = Number(params.get("limit"));
  if (Number.isFinite(limit) && limit >= 1) {
    state.visibleAncestorLimit = Math.floor(limit);
  } else if (isMobileDetailsLayout()) {
    state.visibleAncestorLimit = Math.min(state.visibleAncestorLimit, MOBILE_VISIBLE_ANCESTORS);
  }

  const nodeId = params.get("node");
  const nodeIndex = nodeId ? personIndexByMgpId(nodeId) : null;
  if (nodeIndex !== null) {
    state.selectedNodeIndex = nodeIndex;
    state.pendingCenterNodeIndex = nodeIndex;
  } else if (isMobileDetailsLayout()) {
    state.needsFit = "faculty";
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

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value));
    return true;
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = String(value);
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
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
  markGraphChanged("width");
  state.selectedNodeIndex = personIndex;
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
  markGraphChanged("width");
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
  const detail = card.detailHtml || escapeHtml(card.detail);
  return `
    <div class="summary-card${card.className ? ` ${escapeHtml(card.className)}` : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${value}</strong>
      <em>${detail}</em>
    </div>
  `;
}

function detailSectionOpenAttr(key, defaultOpen = false) {
  const stored = state.detailSectionOpen[key];
  const isOpen = stored === undefined ? defaultOpen : Boolean(stored);
  return isOpen ? " open" : "";
}

function bindDetailSectionToggles(container) {
  container.querySelectorAll("details[data-detail-section]").forEach((details) => {
    details.addEventListener("toggle", () => {
      state.detailSectionOpen[details.dataset.detailSection] = details.open;
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
    const haystack = normalizeSearchText(
      `${person.name} ${person.degree_year || ""} ${person.year} ${person.year_kind || ""} ${person.degree_country || ""} ${formatCountryName(person.degree_country)} ${person.country} ${formatCountryName(person.country)}`,
    );
    if (!terms.every((term) => haystack.includes(term))) {
      return;
    }
    rows.push({
      personIndex,
      label: person.name,
      meta: "Ancestor",
      hint: `${personMeta(person) || "genealogy record"} | ${descendantFacultyIndices(personIndex).length} faculty descendants`,
      kind: "Ancestor",
      rank: haystack.startsWith(query) ? 2 : 3,
    });
  });

  return rows
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, 9);
}

function activateGraphSearchRow(row) {
  if (!row) {
    return;
  }
  const hadAncestorFilter = state.selectedAncestorIndex !== null;
  state.graphSearchQuery = "";
  state.graphSearchActiveIndex = 0;
  state.selectedAncestorIndex = null;
  state.ancestorQuery = "";
  state.focusMode = "common";

  if (row.kind === "Faculty" && Number.isInteger(row.facultyIndex)) {
    state.selectedFaculty = new Set([row.facultyIndex]);
    state.minShared = 1;
  } else if (hadAncestorFilter || !activeFacultyIndices().length) {
    state.selectedFaculty = new Set(groupFacultyIndices());
    state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  }

  markGraphChanged("width");
  state.selectedNodeIndex = row.personIndex;
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
  els.graphAncestorPresets.innerHTML = GRAPH_ANCESTOR_PRESETS
    .map((preset) => {
      const personIndex = personIndexByMgpId(preset.pid);
      const count = personIndex === null ? 0 : descendantFacultyIndices(personIndex).length;
      const active = personIndex !== null && personIndex === state.selectedAncestorIndex;
      return `
        <button
          type="button"
          class="graph-preset${active ? " is-active" : ""}"
          data-person-index="${personIndex === null ? "" : personIndex}"
          ${count ? "" : "disabled"}
          title="Show faculty descended from ${escapeHtml(preset.label)}"
        >
          <span>${escapeHtml(preset.label)}</span>
          <small>${count.toLocaleString()}</small>
        </button>
      `;
    })
    .join("");
  els.graphAncestorPresets.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const personIndex = Number(button.dataset.personIndex);
      if (Number.isInteger(personIndex)) {
        applyAncestorPerson(personIndex);
      }
    });
  });
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
      markGraphChanged("width");
      render();
    });
  });
}

function commonAncestors() {
  const facultyIndices = activeFacultyIndices();
  if (!facultyIndices.length) {
    return [];
  }
  const facultyMask = maskForFaculty(facultyIndices);
  const minShared = Math.max(1, Math.min(state.minShared, facultyIndices.length));
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
      matchedFaculty,
    });
  });

  return rows.sort(
    (a, b) =>
      b.matchedCount - a.matchedCount ||
      a.maxDistance - b.maxDistance ||
      a.totalDistance - b.totalDistance ||
      a.name.localeCompare(b.name),
  );
}

function maxSharedWithAnyCommonAncestor(facultyIndices = activeFacultyIndices()) {
  if (!facultyIndices.length) {
    return 1;
  }

  const facultyMask = maskForFaculty(facultyIndices);
  let maxShared = 1;
  state.peopleMasks.forEach((personMask, personIndex) => {
    const matchedMask = personMask & facultyMask;
    const matchedCount = bitCount(matchedMask);
    if (matchedCount <= maxShared) {
      return;
    }

    const distanceMap = distanceMapForPerson(personIndex);
    const hasDistance = facultyIndices.some(
      (index) => (matchedMask & (1n << BigInt(index))) && Number.isFinite(distanceMap.get(index)),
    );
    if (hasDistance) {
      maxShared = matchedCount;
    }
  });

  return Math.max(1, Math.min(facultyIndices.length, maxShared));
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
    if (anchorIndex !== null && anchorIndex !== undefined) {
      state.detailSectionOpen.chains = true;
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
    return { rows: [], totalRows: 0, nodeSet: new Set(), edgeSet: new Set() };
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

  const nodeSet = new Set([ancestorIndex]);
  const edgeSet = new Set();
  rows.forEach((row) => {
    row.path.forEach((personIndex, index) => {
      nodeSet.add(personIndex);
      if (index > 0) {
        edgeSet.add(edgeKey(row.path[index - 1], personIndex));
      }
    });
  });

  return { rows, totalRows: allRows.length, nodeSet, edgeSet };
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
      year: yearNumber(person) || 0,
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

function relationshipExplanation(relationship) {
  if (!relationship.ancestor) {
    return "No shared academic ancestor appears in this graph for this pair.";
  }
  if (relationship.leftDistance === 0 || relationship.rightDistance === 0) {
    return "One selected faculty member lies directly in the academic ancestry of the other.";
  }
  if (relationship.leftDistance === 1 && relationship.rightDistance === 1) {
    return "They share the same academic advisor.";
  }
  return "The relationship is named from their nearest shared academic ancestor in this graph.";
}

function visibleGraph() {
  const facultyIndices = activeFacultyIndices();
  const activeFacultyPersonIndices = new Set(
    facultyIndices.map((index) => state.faculty[index].person_index).filter(Number.isInteger),
  );
  const common = commonAncestors();
  let visibleCommon = common.slice(0, state.visibleAncestorLimit);
  const chosen = state.focusMode === "path" ? new Set() : new Set(activeFacultyPersonIndices);
  const selectedNodeIsFaculty = state.selectedNodeIndex !== null && activeFacultyPersonIndices.has(state.selectedNodeIndex);
  const explicitChainAnchorIndex = state.focusMode === "path"
    ? state.selectedNodeIndex ?? state.selectedAncestorIndex ?? null
    : state.selectedAncestorIndex ??
      (selectedNodeIsFaculty ? null : state.selectedNodeIndex) ??
      null;
  const chainAnchorIndex = explicitChainAnchorIndex ?? (common[0]?.personIndex ?? null);
  let chainRows = [];
  let chainTotalRows = 0;
  let pathNodeSet = new Set();
  let pathEdgeSet = new Set();
  syncAdvisorPathLimit(chainAnchorIndex, facultyIndices);
  const advisorPathLimit = Math.max(ADVISOR_PATH_INITIAL_COUNT, state.advisorPathLimit);

  if (state.focusMode === "faculty") {
    visibleCommon = [];
  } else if (state.focusMode === "descendants" && state.selectedAncestorIndex !== null) {
    visibleCommon = common.filter((row) => row.personIndex === state.selectedAncestorIndex);
    const pathBundle = pathBundleForAncestor(
      state.selectedAncestorIndex,
      facultyIndices,
      Math.min(advisorPathLimit, facultyIndices.length),
    );
    chainRows = pathBundle.rows;
    chainTotalRows = pathBundle.totalRows;
    pathNodeSet = pathBundle.nodeSet;
    pathEdgeSet = pathBundle.edgeSet;
  } else if (state.focusMode === "path" && chainAnchorIndex !== null) {
    visibleCommon = common.filter((row) => row.personIndex === chainAnchorIndex);
    const pathBundle = pathBundleForAncestor(chainAnchorIndex, facultyIndices, Math.min(advisorPathLimit, facultyIndices.length));
    chainRows = pathBundle.rows;
    chainTotalRows = pathBundle.totalRows;
    pathNodeSet = pathBundle.nodeSet;
    pathEdgeSet = pathBundle.edgeSet;
  }

  if (state.focusMode === "common") {
    for (const row of visibleCommon) {
      chosen.add(row.personIndex);
    }
  } else {
    visibleCommon.forEach((row) => chosen.add(row.personIndex));
    pathNodeSet.forEach((personIndex) => chosen.add(personIndex));
  }
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
  return {
    nodes: Array.from(nodeSet),
    edges: edgeRows,
    common,
    visibleCommon,
    activeFacultyPersonIndices,
    chainAnchorIndex,
    chainRows,
    chainTotalRows,
    pathNodeSet,
    pathEdgeSet,
  };
}

function renderMetrics(graphData) {
  const active = activeFacultyIndices();
  const lineage = lineagePersonIndices();
  const commonMetricLabel = active.length === 1 ? "Known Ancestry" : "Shared Ancestors";
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
  const visiblePeopleLabel = graphData.nodes.length === 1 ? "visible person" : "visible people";
  const sharedAncestorLabel = active.length === 1
    ? graphData.visibleCommon.length === 1 ? "total ancestor" : "total ancestors"
    : graphData.visibleCommon.length === 1 ? "top shared ancestor" : "top shared ancestors";
  const selectedFacultyLabel = active.length === 1 ? "selected faculty member" : "selected faculty";
  els.graphSubtitle.textContent =
    `${graphData.nodes.length.toLocaleString()} ${visiblePeopleLabel}, ` +
    `${graphData.visibleCommon.length.toLocaleString()} ${sharedAncestorLabel}, ` +
    `${active.length.toLocaleString()} ${selectedFacultyLabel}, ` +
    `${focusViewDescription(active.length)} view`;
}

function focusModeLabel() {
  const labels = {
    common: "Shared",
    faculty: "Selected",
    descendants: "Show Descendants",
    path: "Advisor Paths",
  };
  return labels[state.focusMode] || state.focusMode;
}

function focusViewDescription(activeCount = activeFacultyIndices().length) {
  const labels = {
    common: activeCount === 1 ? "ancestry" : "shared ancestor",
    faculty: "selected faculty",
    descendants: "descendant",
    path: "advisor path",
  };
  return labels[state.focusMode] || "graph";
}

function renderCurrentViewSummary(graphData) {
  const active = activeFacultyIndices();
  const hasTwoFaculty = active.length === 2;
  const group = activeGroup();
  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  const selectedNode = state.selectedNodeIndex === null ? null : state.people[state.selectedNodeIndex];
  const pathAnchor = graphData.chainAnchorIndex === null ? null : state.people[graphData.chainAnchorIndex];
  const mode = selectedAncestor
    ? `Descendants of ${selectedAncestor.name}`
    : isCustomSelection()
      ? "Custom faculty selection"
      : group.label;
  const parts = [
    ["Area", group.label],
    ["Faculty in view", active.length.toLocaleString()],
    ["Graph", mode],
    ["View", focusModeLabel()],
    pathAnchor ? ["Advisor paths", pathAnchor.name] : null,
    selectedNode ? ["Selected node", selectedNode.name] : null,
  ].filter(Boolean);

  els.currentViewSummary.innerHTML = `
    <div class="current-view-items">
      ${parts.map(([label, value]) => `
        <span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>
      `).join("")}
    </div>
    <div class="current-view-actions">
      <button type="button" class="mobile-graph-action" data-inline-graph-action="zoom-out" aria-label="Zoom out">-</button>
      <button type="button" class="mobile-graph-action" data-inline-graph-action="zoom-in" aria-label="Zoom in">+</button>
      <button type="button" class="mobile-graph-action" data-inline-graph-action="fit-all">Full</button>
      <button type="button" class="mobile-graph-action" data-inline-graph-action="fit-faculty">Faculty</button>
      <button type="button" id="resetViewInline">Reset view</button>
      <button type="button" id="openDetailsSheet" class="mobile-details-trigger">${hasTwoFaculty ? "Connection" : "Details"}</button>
    </div>
  `;
  els.currentViewSummary.querySelector("[data-inline-graph-action='zoom-out']")?.addEventListener("click", () => {
    zoomAt({ x: els.canvas.clientWidth / 2, y: els.canvas.clientHeight / 2 }, 0.82);
  });
  els.currentViewSummary.querySelector("[data-inline-graph-action='zoom-in']")?.addEventListener("click", () => {
    zoomAt({ x: els.canvas.clientWidth / 2, y: els.canvas.clientHeight / 2 }, 1.18);
  });
  els.currentViewSummary.querySelector("[data-inline-graph-action='fit-all']")?.addEventListener("click", () => {
    state.needsFit = "all";
    drawGraph();
  });
  els.currentViewSummary.querySelector("[data-inline-graph-action='fit-faculty']")?.addEventListener("click", () => {
    state.needsFit = "faculty";
    drawGraph();
  });
  els.currentViewSummary.querySelector("#resetViewInline")?.addEventListener("click", () => {
    state.needsFit = "all";
    drawGraph();
  });
  els.currentViewSummary.querySelector("#openDetailsSheet")?.addEventListener("click", () => {
    setDetailsOpen(true);
  });
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

  chips.push(`
    <button type="button" data-crumb-action="common-focus" ${state.focusMode === "common" ? "disabled" : ""}>
      <span>View</span>${escapeHtml(focusModeLabel())}
    </button>
  `);

  if (state.selectedNodeIndex !== null) {
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
      } else if (action === "common-focus") {
        setFocusMode("common", "width");
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
  const label = `Faculty in this view (${active.length})`;
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
      markGraphChanged("width");
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
  if (state.selectedNodeIndex === null) {
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
      <span>${escapeHtml(personMeta(person))}</span>
      ${facultyRecord ? `<a href="${escapeHtml(facultyWebsiteUrl(facultyRecord))}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(facultyRecord))}</a>` : ""}
    </div>
    <div class="selection-card-stats">
      <span>${matchedFaculty.length} shown faculty reached</span>
      <span>${descendantCount} graph descendants</span>
    </div>
    <div class="selection-card-actions">
      <button type="button" data-card-action="center">Center</button>
      <button type="button" data-card-action="paths">Advisor Paths</button>
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
      } else if (action === "paths") {
        showAdvisorPathsForNode(state.selectedNodeIndex);
      } else if (action === "descendants") {
        applyAncestorPerson(state.selectedNodeIndex);
        setFocusMode("descendants", "width");
      }
    });
  });
}

function renderSummaryPanel(graphData) {
  const active = activeFacultyIndices();
  if (active.length === 1 && state.selectedAncestorIndex === null) {
    const faculty = state.faculty[active[0]];
    const person = state.people[Number(faculty.person_index)];
    const advisors = advisorNamesForPerson(person);
    const earliest = graphData.common
      .filter((row) => yearNumber(row))
      .sort((a, b) => yearNumber(a) - yearNumber(b))[0];
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
        label: "Faculty",
        valueHtml: facultyNameLink(faculty, "summary-link"),
        detail: faculty.title || "Ohio State Mathematics",
      },
      {
        label: "Areas",
        value: facultyAreaLabels(faculty, 6) || "not listed",
        detail: faculty.expertise?.slice(0, 3).join("; ") || "OSU faculty listing",
      },
      {
        label: "PhD",
        value: facultyDegreeSummary(faculty, person),
        detail: facultyPhdSourceDetail(faculty),
      },
      {
        label: advisors.length === 1 ? "Advisor" : "Advisors",
        value: advisors.length ? advisors.join("; ") : "Not listed",
        detail: person ? [personMeta(person), `genealogy record ${person.id}`].filter(Boolean).join(" | ") : "Not in graph",
      },
      {
        label: "Known Ancestry",
        value: `${graphData.common.length.toLocaleString()} people`,
        detail: farthest ? `Longest advisor chain: ${farthest.maxDistance} links` : "No ancestors shown",
      },
      {
        label: "Links",
        valueHtml: linkParts.length ? linkParts.join(" ") : "None",
        detail: earliest ? `Earliest shown: ${earliest.name}` : "No dated ancestor",
      },
    ];

    els.summaryPanel.innerHTML = `
      <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
        <summary>
          <span>
            <strong>Faculty Overview</strong>
            <small>${escapeHtml(faculty.osu_name)}</small>
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
    const ancestorMeta = personMeta(selectedAncestor);
    const pathBundle = pathBundleForAncestor(
      state.selectedAncestorIndex,
      active,
      active.length,
    );
    const cards = [
      {
        label: "Ancestor",
        valueHtml: `<a href="${escapeHtml(selectedAncestor.url)}" target="_blank" rel="noreferrer">${escapeHtml(selectedAncestor.name)}</a>`,
        detail: [`genealogy record ${selectedAncestor.id}`, ancestorMeta].filter(Boolean).join(" | "),
      },
      {
        label: "Faculty Shown",
        value: active.length.toLocaleString(),
        detail: `${activeGroup()?.label || "current area"} descendants in this graph`,
      },
      {
        label: "Advisor Paths",
        value: pathBundle.totalRows ? `${pathBundle.totalRows} available` : "0 available",
        detail: pathBundle.totalRows ? "The panel below starts with one path" : "No selected faculty descendants in this area",
      },
      {
        label: "Current View",
        value: focusModeLabel(),
        detail: `descendants within ${activeGroup()?.label || "current area"}`,
      },
    ];

    els.summaryPanel.innerHTML = `
      <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
        <summary>
          <span>
            <strong>Ancestor View</strong>
            <small>${escapeHtml(selectedAncestor.name)} descendants</small>
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

  const selectedNodePerson = state.selectedNodeIndex === null ? null : state.people[state.selectedNodeIndex];
  const selectedNodeFaculty = state.selectedNodeIndex === null ? null : facultyByPersonIndex(state.selectedNodeIndex);
  if (selectedNodePerson && !selectedNodeFaculty) {
    const ancestorMeta = personMeta(selectedNodePerson);
    const activeMask = maskForFaculty(active);
    const matchedFaculty = active.filter(
      (index) => (state.peopleMasks[state.selectedNodeIndex] & activeMask & (1n << BigInt(index))) !== 0n,
    );
    const pathBundle = pathBundleForAncestor(
      state.selectedNodeIndex,
      active,
      active.length,
    );
    const allDescendants = descendantFacultyIndices(state.selectedNodeIndex).length;
    const cards = [
      {
        label: "Ancestor",
        valueHtml: `<a href="${escapeHtml(selectedNodePerson.url)}" target="_blank" rel="noreferrer">${escapeHtml(selectedNodePerson.name)}</a>`,
        detail: [`genealogy record ${selectedNodePerson.id}`, ancestorMeta].filter(Boolean).join(" | "),
      },
      {
        label: "Faculty Reached",
        value: matchedFaculty.length.toLocaleString(),
        detail: `${active.length.toLocaleString()} faculty currently shown`,
      },
      {
        label: "Advisor Paths",
        value: pathBundle.totalRows ? `${pathBundle.totalRows} available` : "0 available",
        detail: pathBundle.totalRows ? "The panel below starts with one path" : "No shown faculty descendants",
      },
      {
        label: "All Faculty Descendants",
        value: allDescendants.toLocaleString(),
        detail: "across the full OSU faculty graph",
      },
    ];

    els.summaryPanel.innerHTML = `
      <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
        <summary>
          <span>
            <strong>Selected Ancestor</strong>
            <small>${escapeHtml(selectedNodePerson.name)}</small>
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
        detail: "choose an area or faculty to draw ancestry paths",
      },
      {
        label: "Shared Ancestors",
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

  const topCommon = graphData.common[0];
  const earliest = graphData.common
    .filter((row) => yearNumber(row))
    .sort((a, b) => yearNumber(a) - yearNumber(b))[0];
  const farthest = graphData.common
    .slice()
    .sort((a, b) => b.maxDistance - a.maxDistance || b.matchedCount - a.matchedCount)[0];
  const cards = [
    {
      label: "Selection",
      value: active.length.toLocaleString(),
      detail: active.length === 1 ? "faculty member" : "faculty members",
    },
    {
      label: "Most Shared Ancestor",
      value: topCommon ? topCommon.name : "None",
      detail: topCommon ? `${topCommon.matchedCount} faculty reached` : "No shared ancestry",
    },
    {
      label: "Earliest Common Ancestor",
      value: earliest ? earliest.name : "None",
      detail: earliest ? `${earliest.year || ""} ${formatCountryName(earliest.country)}`.trim() : "No dated ancestor",
    },
    {
      label: selectedAncestor ? "Selected Ancestor Reach" : "Deepest Shared Link",
      value: selectedAncestor ? selectedReach.toLocaleString() : farthest ? `${farthest.maxDistance} links` : "None",
      detail: selectedAncestor ? selectedAncestor.name : farthest ? farthest.name : "No common link",
    },
  ];

  els.summaryPanel.innerHTML = `
    <details class="detail-section summary-section" data-detail-section="summary"${detailSectionOpenAttr("summary", true)}>
      <summary>
        <span>
          <strong>Selection Overview</strong>
          <small>${active.length.toLocaleString()} selected faculty</small>
        </span>
        <span class="summary-toggle">Overview</span>
      </summary>
      <div class="summary-grid">
        ${cards.map(summaryCardHtml).join("")}
      </div>
    </details>
  `;
  bindDetailSectionToggles(els.summaryPanel);
}

function renderChainPanel(graphData) {
  const anchorIndex = graphData.chainAnchorIndex;
  const anchor = anchorIndex === null ? null : state.people[anchorIndex];
  const active = activeFacultyIndices();
  const allPathBundle = anchorIndex === null
    ? { rows: [], totalRows: 0 }
    : pathBundleForAncestor(anchorIndex, active, active.length);
  const rows = allPathBundle.rows;
  const totalRows = allPathBundle.totalRows;

  if (!anchor || !rows.length) {
    els.chainPanel.innerHTML = `
      <details class="detail-section chain-section" data-detail-section="chains"${detailSectionOpenAttr("chains", false)}>
        <summary>
          <span>
            <strong>Advisor Paths</strong>
          <small>Choose an ancestor, graph node, or shared ancestor row</small>
          </span>
          <span class="summary-toggle">Paths</span>
        </summary>
        <p class="chain-empty">Choose an ancestor or a shared ancestor row to see representative advisor chains.</p>
      </details>
    `;
    bindDetailSectionToggles(els.chainPanel);
    return;
  }

  els.chainPanel.innerHTML = `
    <details class="detail-section chain-section" data-detail-section="chains"${detailSectionOpenAttr("chains", true)}>
      <summary>
        <span>
          <strong>Advisor Paths</strong>
          <small>${totalRows.toLocaleString()} from ${escapeHtml(anchor.name)}</small>
        </span>
        <span class="summary-toggle">Paths</span>
      </summary>
      <label class="chain-filter" for="chainPathSearch">
        <span>Search advisor paths</span>
        <input id="chainPathSearch" class="search-input" type="search" autocomplete="off" placeholder="Faculty or ancestor name" value="${escapeHtml(state.chainPathQuery)}">
      </label>
      <p class="chain-status" id="chainFilterCount">${totalRows.toLocaleString()} advisor paths.</p>
      <div class="chain-list">
        ${rows.map((row) => `
          <article class="chain-card" data-chain-search="${escapeHtml(normalizeSearchText(`${row.faculty.osu_name} ${row.faculty.mgp_name || ""} ${row.path.map((personIndex) => state.people[personIndex]?.name || "").join(" ")}`))}">
            <div>
              <strong>${facultyNameLink(row.faculty, "chain-faculty-link")}</strong>
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
      ? `${shown.toLocaleString()} matching ${shown === 1 ? "path" : "paths"} of ${cards.length.toLocaleString()}`
      : `No matching advisor paths among ${cards.length.toLocaleString()} paths.`
    : `${cards.length.toLocaleString()} advisor paths.`;
}

function renderRelationshipPanel() {
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
          <strong>${facultyNameLink(relationship.leftFaculty, "chain-faculty-link")} and ${facultyNameLink(relationship.rightFaculty, "chain-faculty-link")}</strong>
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
          ${facultyNameLink(relationship.leftFaculty, "chain-faculty-link")}
          and
          ${facultyNameLink(relationship.rightFaculty, "chain-faculty-link")}
          are ${escapeHtml(relationship.relation)}
        </strong>
      </div>
      <details class="relationship-more">
        <summary>
          <span>
            <strong>Why?</strong>
            <small>via ${escapeHtml(relationship.ancestor.name)}</small>
          </span>
          <span class="summary-toggle">Details</span>
        </summary>
        <p>
          Closest shared academic ancestor:
          <a href="${escapeHtml(relationship.ancestor.url)}" target="_blank" rel="noreferrer">${escapeHtml(relationship.ancestor.name)}</a>.
        </p>
        <p>${escapeHtml(relationshipExplanation(relationship))}</p>
        <div class="relationship-stats">
          <span>${escapeHtml(relationship.leftFaculty.osu_name)}: ${escapeHtml(advisorStepLabel(relationship.leftDistance))}</span>
          <span>${escapeHtml(relationship.rightFaculty.osu_name)}: ${escapeHtml(advisorStepLabel(relationship.rightDistance))}</span>
        </div>
        <div class="relationship-paths">
          <span><strong>${escapeHtml(relationship.leftFaculty.osu_name)}</strong>${leftPath ? `: ${leftPath}` : ""}</span>
          <span><strong>${escapeHtml(relationship.rightFaculty.osu_name)}</strong>${rightPath ? `: ${rightPath}` : ""}</span>
        </div>
        <div class="relationship-actions">
          <button type="button" data-relationship-action="highlight">Highlight advisor paths</button>
        </div>
      </details>
    </section>
  `;
  els.relationshipPanel.querySelector("[data-relationship-action='highlight']")?.addEventListener("click", () => {
    showAdvisorPathsForNode(relationship.ancestorIndex);
  });
  bindDetailSectionToggles(els.relationshipPanel);
}

function renderRange() {
  const selectedCount = Math.max(1, activeFacultyIndices().length);
  const maxShared = maxSharedWithAnyCommonAncestor();
  els.minShared.max = String(maxShared);
  els.minShared.title = `Highest available value for this selection: ${maxShared}`;
  state.minShared = Math.max(1, Math.min(state.minShared, maxShared, selectedCount));
  els.minShared.value = String(state.minShared);
  els.minSharedLabel.textContent = String(state.minShared);

  const visibleAncestorMax = Math.max(1, commonAncestors().length);
  const visibleAncestorMin = Math.min(25, visibleAncestorMax);
  els.visibleLimit.min = String(visibleAncestorMin);
  els.visibleLimit.max = String(visibleAncestorMax);
  els.visibleLimit.title = `Highest available value for this selection: ${visibleAncestorMax}`;
  state.visibleAncestorLimit = clamp(state.visibleAncestorLimit, visibleAncestorMin, visibleAncestorMax);
  els.visibleLimit.value = String(state.visibleAncestorLimit);
  els.visibleLimitLabel.textContent = String(state.visibleAncestorLimit);
}

function renderSharedAncestorPanel(rows) {
  const active = activeFacultyIndices();
  const activeCount = active.length;
  const selectionKey = active.join(",") || "none";
  const top = rows[0];
  const selectedAncestor = state.selectedAncestorIndex === null ? null : state.people[state.selectedAncestorIndex];
  if (state.sharedAncestorsSelectionKind !== selectionKey) {
    state.sharedAncestorsSelectionKind = selectionKey;
    state.sharedAncestorsOpen = false;
  }
  els.sharedAncestorsPanel.open = Boolean(state.sharedAncestorsOpen);
  if (!top) {
    els.sharedAncestorsSummary.textContent = "No shared ancestors shown for this selection";
  } else if (activeCount === 1) {
    const faculty = state.faculty[active[0]];
    els.sharedAncestorsSummary.textContent =
      `${rows.length.toLocaleString()} total ancestors | ${faculty?.osu_name || "selected faculty"}`;
  } else if (selectedAncestor && top.id === selectedAncestor.id) {
    els.sharedAncestorsSummary.textContent =
      `${rows.length.toLocaleString()} shown | selected ancestor reaches ${top.matchedCount} faculty`;
  } else {
    els.sharedAncestorsSummary.textContent =
      `${rows.length.toLocaleString()} shown | top: ${top.name} reaches ${top.matchedCount} faculty`;
  }
}

function renderAncestorTable(rows) {
  renderSharedAncestorPanel(rows);
  if (els.ancestorTableSearch && els.ancestorTableSearch.value !== state.sharedAncestorQuery) {
    els.ancestorTableSearch.value = state.sharedAncestorQuery;
  }

  const query = state.sharedAncestorQuery.trim();
  const filteredRows = query
      ? rows.filter((row) => textMatchesSearch(
      `${row.name} ${row.degree_country || ""} ${formatCountryName(row.degree_country)} ${tableYearLabel(row)} ${row.matchedCount} ${row.maxDistance} ${row.totalDistance}`,
      query,
    ))
    : rows;

  if (els.ancestorTableStatus) {
    els.ancestorTableStatus.textContent = query
      ? `${filteredRows.length.toLocaleString()} matching ${filteredRows.length === 1 ? "ancestor" : "ancestors"} of ${rows.length.toLocaleString()}`
      : `${rows.length.toLocaleString()} ${rows.length === 1 ? "ancestor" : "ancestors"} in table`;
  }

  if (!rows.length) {
    els.ancestorRows.innerHTML = `<tr><td colspan="6" class="empty">No selected faculty.</td></tr>`;
    return;
  }
  if (!filteredRows.length) {
    els.ancestorRows.innerHTML = `<tr><td colspan="6" class="empty">No matching ancestors.</td></tr>`;
    return;
  }

  els.ancestorRows.innerHTML = filteredRows
    .map((row) => `
      <tr data-person-index="${row.personIndex}">
        <td><a href="${row.url}" target="_blank" rel="noreferrer">${escapeHtml(row.name)}</a></td>
        <td data-label="Year" title="${row.year_kind === "inferred" ? "Estimated graph placement year" : "Degree year from the genealogy record"}">${escapeHtml(tableYearLabel(row))}</td>
        <td data-label="Country">${escapeHtml(formatCountryName(row.degree_country))}</td>
        <td data-label="Faculty shown" class="numeric">${row.matchedCount}</td>
        <td data-label="Longest path" class="numeric">${row.maxDistance}</td>
        <td data-label="Total links" class="numeric">${row.totalDistance}</td>
      </tr>
    `)
    .join("");

  els.ancestorRows.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      showAdvisorPathsForNode(Number(row.dataset.personIndex));
    });
  });
}

function selectedAreaSummary(indices) {
  const counts = new Map();
  indices.forEach((facultyIndex) => {
    state.faculty[facultyIndex].groups.forEach((groupId) => {
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || state.groupLabels.get(a[0]).localeCompare(state.groupLabels.get(b[0])))
    .slice(0, 8);
}

function renderDetail() {
  const selectedFaculty = activeFacultyIndices();
  if (state.selectedNodeIndex === null) {
    const areaTags = selectedAreaSummary(selectedFaculty)
      .map(([groupId, count]) => `<span class="tag">${escapeHtml(state.groupLabels.get(groupId))}: ${count}</span>`)
      .join("");
    els.nodeDetail.innerHTML = `
      <details class="detail-section node-section" data-detail-section="selection"${detailSectionOpenAttr("selection", false)}>
        <summary>
          <span>
            <strong>Selection Details</strong>
          <small>${selectedFaculty.length.toLocaleString()} faculty and static data snapshot</small>
          </span>
          <span class="summary-toggle">Details</span>
        </summary>
        <div class="node-detail-body">
          <div class="detail-name">${escapeHtml(selectionTitle())}</div>
          <div>${selectedFaculty.length} selected faculty</div>
          <div class="tag-row">
            ${selectedFaculty.slice(0, 12).map((index) => facultyNameLink(state.faculty[index], "tag")).join("")}
          </div>
          <div class="tag-row">${areaTags}</div>
        </div>
      </details>
    `;
    bindDetailSectionToggles(els.nodeDetail);
    return;
  }

  const person = state.people[state.selectedNodeIndex];
  const activeMask = maskForFaculty(selectedFaculty);
  const matchedMask = state.peopleMasks[state.selectedNodeIndex] & activeMask;
  const matchedFaculty = selectedFaculty.filter((index) => matchedMask & (1n << BigInt(index)));
  const facultyRecord = state.faculty.find((faculty) => Number(faculty.person_index) === state.selectedNodeIndex);
  const facultyWebsite = facultyRecord ? facultyWebsiteUrl(facultyRecord) : "";
  const facultyOsuProfile = facultyRecord ? facultyOsuProfileUrl(facultyRecord) : "";
  const professionalWebsite = facultyRecord?.professional_website_url || "";
  const advisorNames = advisorNamesForPerson(person).join("; ");
  const descendantCount = descendantFacultyIndices(state.selectedNodeIndex).length;
  const selectedReachLabel = matchedFaculty.length === 1
    ? "1 shown faculty member"
    : `${matchedFaculty.length} shown faculty`;
  syncDetailFacultyLimit(state.selectedNodeIndex, selectedFaculty);
  const detailFacultyLimit = Math.min(
    matchedFaculty.length,
    Math.max(DETAIL_FACULTY_INITIAL_COUNT, state.detailFacultyLimit),
  );
  const visibleMatchedFaculty = matchedFaculty.slice(0, detailFacultyLimit);
  const hiddenMatchedFaculty = matchedFaculty.length - visibleMatchedFaculty.length;
  const nextMatchedFaculty = Math.min(DETAIL_FACULTY_INCREMENT, hiddenMatchedFaculty);
  const matchedFacultyTags = matchedFaculty.length
    ? `<div class="tag-row detail-faculty-list" aria-label="Shown faculty reached by this person">
        ${visibleMatchedFaculty.map((index) => facultyNameLink(state.faculty[index], "tag")).join("")}
        ${hiddenMatchedFaculty > 0 ? `<button type="button" class="tag tag-action" data-detail-faculty-action="more">+${nextMatchedFaculty}</button>` : ""}
        ${visibleMatchedFaculty.length > DETAIL_FACULTY_INITIAL_COUNT ? `<button type="button" class="tag tag-action" data-detail-faculty-action="first">Show first ${DETAIL_FACULTY_INITIAL_COUNT}</button>` : ""}
      </div>`
    : "";

  const degreeLine = personDegreeLabel(person);
  const nodeSummaryTitle = facultyRecord ? "Selected Faculty" : "Selected Ancestor";
  const nodeSummaryDetail = facultyRecord
    ? facultyRecord.osu_name
    : graphYearLabel(person) || `Genealogy record ${person.id}`;
  const nodeBody = facultyRecord
    ? `
        <div class="detail-name">${escapeHtml(facultyRecord.osu_name)}</div>
        <div><strong>OSU role:</strong> ${escapeHtml(facultyRecord.title || "Mathematics faculty")}</div>
        <div><strong>Areas:</strong> ${escapeHtml(facultyAreaLabels(facultyRecord, 8) || "not listed")}</div>
        <div><strong>PhD:</strong> ${escapeHtml(facultyDegreeSummary(facultyRecord, person))}</div>
        <div><strong>Genealogy ID:</strong> <a href="${person.url}" target="_blank" rel="noreferrer">${escapeHtml(person.id)}</a> <button type="button" class="copy-id-button" data-copy-id="${escapeHtml(person.id)}">Copy</button></div>
        ${advisorNames ? `<div><strong>Advisor:</strong> ${escapeHtml(advisorNames)}</div>` : ""}
        ${facultyWebsite ? `<div><strong>Website:</strong> <a href="${escapeHtml(facultyWebsite)}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(facultyRecord))}</a></div>` : ""}
        ${professionalWebsite && facultyOsuProfile ? `<div><strong>OSU profile:</strong> <a href="${escapeHtml(facultyOsuProfile)}" target="_blank" rel="noreferrer">${escapeHtml(facultyRecord.osu_name)}</a></div>` : ""}
      `
    : `
        <div class="detail-name">${escapeHtml(person.name)}</div>
        <div><strong>Genealogy ID:</strong> <a href="${person.url}" target="_blank" rel="noreferrer">${escapeHtml(person.id)}</a> <button type="button" class="copy-id-button" data-copy-id="${escapeHtml(person.id)}">Copy</button></div>
        ${degreeLine ? `<div><strong>Degree:</strong> ${escapeHtml(degreeLine)}</div>` : ""}
        ${isInferredYear(person) ? `<div><strong>Graph placement:</strong> ${escapeHtml(graphYearLabel(person))}</div>` : ""}
        ${advisorNames ? `<div><strong>Advisor:</strong> ${escapeHtml(advisorNames)}</div>` : ""}
        <div><strong>Shown faculty reached:</strong> ${escapeHtml(selectedReachLabel)}</div>
        <div><strong>Faculty descendants shown:</strong> ${descendantCount.toLocaleString()}</div>
        <div class="node-actions">
          <button type="button" data-node-action="paths">Show advisor paths</button>
          <button type="button" data-node-action="descendants" ${descendantCount ? "" : "disabled"}>Show descendants</button>
        </div>
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
  els.nodeDetail.querySelector("[data-detail-faculty-action='more']")?.addEventListener("click", () => {
    state.detailFacultyLimit = Math.min(matchedFaculty.length, state.detailFacultyLimit + DETAIL_FACULTY_INCREMENT);
    renderDetail();
  });
  els.nodeDetail.querySelector("[data-detail-faculty-action='first']")?.addEventListener("click", () => {
    state.detailFacultyLimit = DETAIL_FACULTY_INITIAL_COUNT;
    renderDetail();
  });
  els.nodeDetail.querySelector("[data-node-action='paths']")?.addEventListener("click", () => {
    showAdvisorPathsForNode(state.selectedNodeIndex);
  });
  els.nodeDetail.querySelector("[data-node-action='descendants']")?.addEventListener("click", () => {
    applyAncestorPerson(state.selectedNodeIndex, false);
    setFocusMode("descendants", "width");
  });
  els.nodeDetail.querySelectorAll("[data-copy-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const copied = await copyText(button.dataset.copyId);
      if (copied) {
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = original;
        }, 1200);
      }
    });
  });
}

function yearToY(year) {
  const span = Math.max(1, state.yearRange.max - state.yearRange.min);
  return state.yearAxis.top + ((year - state.yearRange.min) / span) * Math.max(1, state.yearAxis.bottom - state.yearAxis.top);
}

function computeNodePositions(graphData, displayWidth = 1200) {
  const positions = new Map();
  const mobile = isMobileDetailsLayout();
  const facultySet = graphData.activeFacultyPersonIndices;
  const ancestorNodes = graphData.nodes.filter((index) => !facultySet.has(index));
  const facultyNodes = Array.from(facultySet).sort((a, b) => state.people[a].name.localeCompare(state.people[b].name));
  const facultyPersonSlot = new Map(facultyNodes.map((personIndex, slot) => [personIndex, slot]));
  const activeFaculty = activeFacultyIndices();
  const activeMask = maskForFaculty(activeFaculty);
  const facultySlotByFacultyIndex = new Map();
  activeFaculty.forEach((facultyIndex) => {
    const personIndex = Number(state.faculty[facultyIndex]?.person_index);
    const slot = facultyPersonSlot.get(personIndex);
    if (Number.isInteger(slot)) {
      facultySlotByFacultyIndex.set(facultyIndex, slot);
    }
  });
  const centerCache = new Map();
  const years = graphData.nodes.map((index) => yearNumber(state.people[index])).filter(Number.isFinite);
  const minYear = Math.min(...years, 1100);
  const maxYear = Math.max(...years, 2026);
  const bandCount = Math.max(8, Math.min(20, Math.ceil((maxYear - minYear) / 55)));
  const buckets = Array.from({ length: bandCount }, () => []);
  const unknown = [];
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));

  function descendantCenterRatio(personIndex) {
    if (centerCache.has(personIndex)) {
      return centerCache.get(personIndex);
    }
    const mask = state.peopleMasks[personIndex] & activeMask;
    let total = 0;
    let count = 0;
    activeFaculty.forEach((facultyIndex) => {
      if ((mask & (1n << BigInt(facultyIndex))) === 0n) {
        return;
      }
      const slot = facultySlotByFacultyIndex.get(facultyIndex);
      if (Number.isInteger(slot)) {
        total += slot;
        count += 1;
      }
    });
    const ratio = count ? total / count / Math.max(1, facultyNodes.length - 1) : 0.5;
    centerCache.set(personIndex, ratio);
    return ratio;
  }

  ancestorNodes
    .slice()
    .sort((a, b) => {
      const yearA = yearNumber(state.people[a]) || 9999;
      const yearB = yearNumber(state.people[b]) || 9999;
      return yearA - yearB ||
        descendantCenterRatio(a) - descendantCenterRatio(b) ||
        (commonRank.get(a) ?? 9999) - (commonRank.get(b) ?? 9999);
    })
    .forEach((personIndex) => {
      const year = yearNumber(state.people[personIndex]);
      if (!year) {
        unknown.push(personIndex);
        return;
      }
      const band = clamp(
        Math.floor(((year - minYear) / Math.max(1, maxYear - minYear)) * bandCount),
        0,
        bandCount - 1,
      );
      buckets[band].push(personIndex);
    });

  if (unknown.length) {
    buckets[bandCount - 1].push(...unknown);
  }

  buckets.forEach((bucket) => {
    bucket.sort((a, b) =>
      descendantCenterRatio(a) - descendantCenterRatio(b) ||
      (commonRank.get(a) ?? 9999) - (commonRank.get(b) ?? 9999) ||
      state.people[a].name.localeCompare(state.people[b].name),
    );
  });

  const maxBucketSize = Math.max(1, ...buckets.map((bucket) => bucket.length));
  const facultyRowTarget = mobile
    ? clamp(Math.floor((displayWidth || 393) / 58), 5, 8)
    : clamp(Math.floor((displayWidth || 1200) / 58), 18, 36);
  const facultyRows = Math.max(1, Math.ceil(facultySet.size / facultyRowTarget));
  const facultyColumns = Math.max(1, Math.ceil(facultySet.size / facultyRows));
  const facultyBandHeight = 116 + (facultyRows - 1) * 120;
  const countBasedWidth = Math.max(360 + facultyColumns * (mobile ? 142 : 158), 320 + maxBucketSize * (mobile ? 54 : 74));
  const viewportBasedWidth = Math.round((displayWidth || 1200) * (mobile ? 1.82 : 2.15));
  const worldWidth = Math.max(
    mobile ? 1060 : 1550,
    Math.min(9000, Math.max(countBasedWidth, viewportBasedWidth)),
  );
  const worldHeight = Math.max(
    1850,
    Math.min(5400, 1320 + Math.min(240, graphData.nodes.length) * 9 + facultyBandHeight),
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
    top: 100,
    bottom: Math.max(260, facultyBandTop - 150),
  };

  const left = mobile ? 76 : 120;
  const right = worldWidth - (mobile ? 92 : 160);
  const usableWidth = Math.max(1, right - left);
  buckets.forEach((bucket, band) => {
    const spread = bucket.length <= 1 ? 0 : usableWidth / (bucket.length - 1);
    bucket.forEach((personIndex, slot) => {
      const person = state.people[personIndex];
      const year = yearNumber(person);
      const slotX = bucket.length <= 1
        ? left + descendantCenterRatio(personIndex) * usableWidth
        : left + slot * spread;
      const descendantX = left + descendantCenterRatio(personIndex) * usableWidth;
      const descendantWeight = mobile ? 0.68 : 0.58;
      const jitter = ((band % 3) - 1) * (mobile ? 8 : 12);
      const x = clamp(descendantX * descendantWeight + slotX * (1 - descendantWeight) + jitter, left, right);
      const y = year ? yearToY(year) : worldHeight - 280;
      positions.set(personIndex, { x, y });
    });
  });

  facultyNodes.forEach((personIndex, slot) => {
    const row = Math.floor(slot / facultyColumns);
    const column = slot % facultyColumns;
    const rowStart = row * facultyColumns;
    const columnsInRow = Math.max(1, Math.min(facultyColumns, facultyNodes.length - rowStart));
    const x = columnsInRow <= 1 ? worldWidth / 2 : left + (column / (columnsInRow - 1)) * usableWidth;
    positions.set(personIndex, {
      x,
      y: facultyBandTop + row * 120,
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
  const mobile = isMobileDetailsLayout();
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
      const scale = clamp((width - (mobile ? 36 : 96)) / Math.max(mobile ? 520 : 900, right - left + (mobile ? 120 : 280)), MIN_SCALE, Math.min(MAX_SCALE, mobile ? 1.55 : 1.2));
      state.view.scale = scale;
      state.view.x = width / 2 - ((left + right) / 2) * scale;
      state.view.y = height - (mobile ? 86 : 150) - bottom * scale;
      return;
    }
  }
  const scaleX = (width - 72) / Math.max(1, bounds.width);
  const scaleY = (height - 72) / Math.max(1, bounds.height);
  const mobileScaleBoost = mobile && mode !== "all" ? 1.42 : 1;
  const scale = clamp(mode === "all" ? Math.min(scaleX, scaleY, 1) : Math.min(scaleX * mobileScaleBoost, mobile ? 1.15 : 0.9), MIN_SCALE, MAX_SCALE);
  state.view.scale = scale;
  state.view.x = width / 2 - (bounds.left + bounds.width / 2) * scale;
  state.view.y = mode === "all"
    ? height / 2 - (bounds.top + bounds.height / 2) * scale
    : (mobile ? 26 : 42) - bounds.top * scale;
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

function currentWorldViewport(displayWidth, displayHeight, padding = EDGE_VIEWPORT_PADDING) {
  const topLeft = screenToWorld({ x: -padding, y: -padding });
  const bottomRight = screenToWorld({ x: displayWidth + padding, y: displayHeight + padding });
  return {
    left: Math.min(topLeft.x, bottomRight.x),
    right: Math.max(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    bottom: Math.max(topLeft.y, bottomRight.y),
  };
}

function segmentMightTouchViewport(start, end, rect) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return right >= rect.left && left <= rect.right && bottom >= rect.top && top <= rect.bottom;
}

function isImportantEdge(advisorIndex, studentIndex, graphData, commonRank) {
  if (graphData.pathEdgeSet?.has(edgeKey(advisorIndex, studentIndex))) {
    return true;
  }
  if (state.selectedNodeIndex === advisorIndex || state.selectedNodeIndex === studentIndex) {
    return true;
  }
  if (graphData.activeFacultyPersonIndices.has(studentIndex) || graphData.activeFacultyPersonIndices.has(advisorIndex)) {
    return true;
  }
  const advisorRank = commonRank.get(advisorIndex);
  const studentRank = commonRank.get(studentIndex);
  return (advisorRank !== undefined && advisorRank < 18) || (studentRank !== undefined && studentRank < 18);
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

  const highlightedEdges = graphData.edges.filter(([advisorIndex, studentIndex]) =>
    graphData.pathEdgeSet?.has(edgeKey(advisorIndex, studentIndex)),
  );
  highlightedEdges.forEach(([advisorIndex, studentIndex]) => {
    const advisor = state.nodePositions.get(advisorIndex);
    const student = state.nodePositions.get(studentIndex);
    if (!advisor || !student) {
      return;
    }
    const a = overviewPoint(advisor);
    const s = overviewPoint(student);
    overviewCtx.lineWidth = 1.25;
    overviewCtx.strokeStyle = "rgba(186, 12, 47, 0.42)";
    overviewCtx.beginPath();
    overviewCtx.moveTo(a.x, a.y);
    overviewCtx.lineTo(s.x, s.y);
    overviewCtx.stroke();
  });

  const activeMask = maskForFaculty(activeFacultyIndices());
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));
  graphData.nodes.forEach((personIndex) => {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const overview = overviewPoint(point);
    const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const rank = commonRank.get(personIndex);
    if (!isFaculty && (rank === undefined || rank >= 35) && !graphData.pathNodeSet?.has(personIndex)) {
      return;
    }
    const radius = isFaculty ? 1.8 : graphData.pathNodeSet?.has(personIndex) ? 2.1 : Math.max(1.1, Math.min(2, 1 + matchedCount / 34));
    overviewCtx.beginPath();
    overviewCtx.arc(overview.x, overview.y, radius, 0, Math.PI * 2);
    overviewCtx.fillStyle = isFaculty
      ? OSU_COLORS.scarlet
      : rank !== undefined && rank < 20
        ? OSU_COLORS.grayDark40
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
  const quietDefault =
    activeCount > 24 &&
    state.focusMode === "common" &&
    state.selectedAncestorIndex === null &&
    state.selectedNodeIndex === null;

  function addLabel(personIndex, kind, priority) {
    if (!visibleNodes.has(personIndex)) {
      return;
    }
    const current = labels.get(personIndex);
    if (current && current.priority >= priority) {
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
      fontSize: priority >= 90 || isFaculty ? 11 : 10.5,
      weight: priority >= 90 || isFaculty ? 700 : 600,
    });
    labels.set(personIndex, { personIndex, anchor, lines, measured, kind, priority });
  }

  const facultyLabelLimit = quietDefault
    ? 0
    : state.focusMode === "faculty"
      ? 42
      : state.focusMode === "path"
        ? 16
        : activeCount <= 12
          ? activeCount
          : 8;
  Array.from(graphData.activeFacultyPersonIndices)
    .sort((a, b) => state.people[a].name.localeCompare(state.people[b].name))
    .slice(0, facultyLabelLimit)
    .forEach((personIndex) => addLabel(personIndex, "faculty", 55));

  const ancestorLabelLimit = quietDefault ? 2 : state.focusMode === "path" ? 3 : 4;
  graphData.common.slice(0, ancestorLabelLimit).forEach((row, rank) => {
    if (!graphData.activeFacultyPersonIndices.has(row.personIndex)) {
      addLabel(row.personIndex, "ancestor", 68 - rank);
    }
  });

  graphData.pathNodeSet?.forEach((personIndex) => {
    addLabel(personIndex, graphData.activeFacultyPersonIndices.has(personIndex) ? "faculty" : "path", 76);
  });

  graphData.chainRows.forEach((row) => {
    addLabel(Number(row.faculty.person_index), "faculty", 82);
  });

  if (graphData.chainAnchorIndex !== null) {
    addLabel(graphData.chainAnchorIndex, "path", 92);
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
  const maxRows = 14;

  orderedLabels.forEach((label) => {
    const below = label.anchor.y < displayHeight - (label.kind === "faculty" ? 135 : 92);
    const rowStride = Math.max(42, label.measured.height + 8);
    let placed = null;

    for (let row = 0; row < maxRows; row += 1) {
      const top = below
        ? label.anchor.y + 13 + row * rowStride
        : label.anchor.y - 13 - label.measured.height - row * rowStride;
      if (top > displayHeight + 8 || top + label.measured.height < -8) {
        continue;
      }
      const left = clamp(label.anchor.x - label.measured.width / 2, 6, Math.max(6, displayWidth - label.measured.width - 6));
      if (rectIsOpen(placedRects, left, top, label.measured.width, label.measured.height)) {
        placedRects.push({
          left,
          top,
          right: left + label.measured.width,
          bottom: top + label.measured.height,
        });
        placed = { ...label, left, top, below };
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
    const targetX = label.left + label.measured.width / 2;
    const targetY = label.below ? label.top : label.top + label.measured.height;
    ctx.beginPath();
    ctx.moveTo(label.anchor.x, label.anchor.y);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
  });

  placements.forEach((label) => {
    const selected = state.selectedNodeIndex === label.personIndex;
    const hovered = state.hoveredNodeIndex === label.personIndex;
    const faculty = label.kind === "faculty";
    const path = label.kind === "path";
    const emphasized = selected || hovered;
    drawScreenLabelBox(label.lines, label.left, label.top, label.measured, {
      color: emphasized ? OSU_COLORS.scarletDark40 : faculty ? OSU_COLORS.scarletDark60 : OSU_COLORS.grayDark80,
      border: emphasized
        ? "rgba(186, 12, 47, 0.72)"
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
  computeNodePositions(graphData, displayWidth);

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

  const activeMask = maskForFaculty(activeFacultyIndices());
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));
  ctx.lineWidth = 1 / state.view.scale;
  const viewport = currentWorldViewport(displayWidth, displayHeight);
  const lowZoom = state.view.scale < 0.42;
  const denseGraph = graphData.edges.length > 320;
  graphData.edges.forEach(([advisorIndex, studentIndex]) => {
    const advisor = state.nodePositions.get(advisorIndex);
    const student = state.nodePositions.get(studentIndex);
    if (!advisor || !student) {
      return;
    }
    const highlighted = graphData.pathEdgeSet?.has(edgeKey(advisorIndex, studentIndex));
    const important = isImportantEdge(advisorIndex, studentIndex, graphData, commonRank);
    if (!highlighted && !important && !segmentMightTouchViewport(advisor, student, viewport)) {
      return;
    }
    if (!highlighted && !important && lowZoom && denseGraph) {
      return;
    }
    ctx.lineWidth = (highlighted ? 2.05 : important ? 1.15 : 0.8) / state.view.scale;
    ctx.strokeStyle = highlighted
      ? "rgba(186, 12, 47, 0.5)"
      : important
        ? "rgba(100, 106, 110, 0.24)"
        : "rgba(100, 106, 110, 0.13)";
    ctx.beginPath();
    ctx.moveTo(advisor.x, advisor.y);
    ctx.lineTo(student.x, student.y);
    ctx.stroke();
  });

  graphData.nodes.forEach((personIndex) => {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const onPath = graphData.pathNodeSet?.has(personIndex);
    const rank = commonRank.get(personIndex);
    const selected = state.selectedNodeIndex === personIndex;
    const hovered = state.hoveredNodeIndex === personIndex;
    const radius = (selected || hovered ? 8 : onPath ? 6.5 : isFaculty ? 6 : Math.max(3.5, Math.min(7, 2.5 + matchedCount / 10))) / state.view.scale;

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
          : onPath
            ? OSU_COLORS.scarletDark40
          : rank !== undefined && rank < 20
            ? OSU_COLORS.grayDark40
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
  syncMobileRelationshipDetails();
  els.loadingState.hidden = true;
  syncNavigation();
  renderSources();
  renderDataFootnote();
  renderGroups();
  renderFaculty();
  renderGraphSearch();
  renderGraphAncestorPresets();
  renderSelectionChips();
  renderRange();
  const graphData = visibleGraph();
  renderMetrics(graphData);
  renderCurrentViewSummary(graphData);
  renderGraphBreadcrumbs();
  renderSummaryPanel(graphData);
  renderAncestorTable(graphData.common);
  renderRelationshipPanel();
  renderDetail();
  renderChainPanel(graphData);
  renderGraphSelectionCard(graphData);
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
  const tapRadius = isCoarsePointer() ? 24 : 14;
  return bestDistance <= tapRadius / state.view.scale ? best : null;
}

function showTooltip(personIndex, screenPoint) {
  if (personIndex === null) {
    hideTooltip();
    return;
  }
  const person = state.people[personIndex];
  els.tooltip.innerHTML = `
    <strong>${escapeHtml(person.name)}</strong>
    <span>${escapeHtml(personMeta(person) || `Genealogy record ${person.id}`)}</span>
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
  drawGraph();
}

function pointerList() {
  return Array.from(state.activePointers.values());
}

function pointerDistance(points) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function pointerCenter(points) {
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  };
}

function startPinchGesture() {
  const points = pointerList();
  if (points.length < 2) {
    state.pinchStart = null;
    return;
  }
  const center = pointerCenter(points);
  state.pinchStart = {
    center,
    distance: Math.max(1, pointerDistance(points)),
    scale: state.view.scale,
    centerWorld: screenToWorld(center),
  };
}

function handlePointerDown(event) {
  event.preventDefault();
  const point = canvasPoint(event);
  state.activePointers.set(event.pointerId, point);
  state.pointerDown = true;
  state.pointerMoved = false;
  state.pointerStart = point;
  state.viewStart = { ...state.view };
  els.canvas.classList.add("dragging");
  try {
    els.canvas.setPointerCapture(event.pointerId);
  } catch (_error) {
    // Synthetic test events and some browser edge cases may not have capture.
  }
  if (state.activePointers.size >= 2) {
    state.pointerMoved = true;
    startPinchGesture();
  }
}

function handlePointerMove(event) {
  const point = canvasPoint(event);
  if (state.activePointers.has(event.pointerId)) {
    state.activePointers.set(event.pointerId, point);
  }
  if (state.activePointers.size >= 2 && state.pinchStart) {
    event.preventDefault();
    const points = pointerList();
    const center = pointerCenter(points);
    const factor = pointerDistance(points) / state.pinchStart.distance;
    const nextScale = clamp(state.pinchStart.scale * factor, MIN_SCALE, MAX_SCALE);
    state.pointerMoved = true;
    state.view.scale = nextScale;
    state.view.x = center.x - state.pinchStart.centerWorld.x * nextScale;
    state.view.y = center.y - state.pinchStart.centerWorld.y * nextScale;
    hideTooltip();
    drawGraph();
    return;
  }
  if (state.pointerDown) {
    event.preventDefault();
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
  event.preventDefault();
  const point = canvasPoint(event);
  const wasPinching = state.activePointers.size >= 2 || Boolean(state.pinchStart);
  state.activePointers.delete(event.pointerId);
  state.pointerDown = state.activePointers.size > 0;
  if (!state.pointerDown) {
    els.canvas.classList.remove("dragging");
  }
  try {
    els.canvas.releasePointerCapture(event.pointerId);
  } catch (_error) {
    // Pointer capture may already have been released by the browser.
  }
  if (state.activePointers.size === 1) {
    const remaining = pointerList()[0];
    state.pointerStart = remaining;
    state.viewStart = { ...state.view };
    state.pinchStart = null;
    state.pointerMoved = true;
    return;
  }
  state.pinchStart = null;
  if (!state.pointerMoved && !wasPinching) {
    const selected = hitTestNode(point);
    state.selectedNodeIndex = selected;
    if (selected !== null) {
      state.pendingCenterNodeIndex = selected;
    }
    render();
  }
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

els.focusButtons.forEach((button) => {
  button.addEventListener("click", () => setFocusMode(button.dataset.focusMode, "width"));
});

els.graphControlsPanel.addEventListener("toggle", () => {
  state.graphControlsOpen = els.graphControlsPanel.open;
  storeBoolean(GRAPH_CONTROLS_STORAGE_KEY, state.graphControlsOpen);
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
  state.sharedAncestorsOpen = els.sharedAncestorsPanel.open;
});

function updateSharedAncestorQueryFromInput() {
  state.sharedAncestorQuery = els.ancestorTableSearch.value;
  renderAncestorTable(state.currentGraphData?.common || commonAncestors());
}

els.ancestorTableSearch.addEventListener("input", updateSharedAncestorQueryFromInput);
els.ancestorTableSearch.addEventListener("search", updateSharedAncestorQueryFromInput);
els.ancestorTableSearch.addEventListener("change", updateSharedAncestorQueryFromInput);

els.backToGroupView.addEventListener("click", () => {
  backToGroupView();
});

els.clearSelectedNode.addEventListener("click", () => {
  clearSelectedNode();
});

els.closeDetailsSheet.addEventListener("click", () => {
  setDetailsOpen(false);
});

els.detailBackdrop.addEventListener("click", () => {
  setDetailsOpen(false);
});

els.graphSearch.addEventListener("input", () => {
  state.graphSearchQuery = els.graphSearch.value;
  state.graphSearchActiveIndex = 0;
  renderGraphSearch();
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

els.facultySearch.addEventListener("input", () => {
  state.facultySearch = els.facultySearch.value;
  renderFaculty();
});

els.selectAllFaculty.addEventListener("click", () => {
  state.selectedAncestorIndex = null;
  state.selectedFaculty = new Set(groupFacultyIndices());
  markGraphChanged("width");
  render();
});

els.clearFaculty.addEventListener("click", () => {
  state.selectedAncestorIndex = null;
  state.selectedFaculty = new Set();
  markGraphChanged("width");
  render();
});

els.minShared.addEventListener("input", () => {
  state.minShared = clamp(Number(els.minShared.value), 1, maxSharedWithAnyCommonAncestor());
  markGraphChanged("width");
  render();
});

els.visibleLimit.addEventListener("input", () => {
  state.visibleAncestorLimit = Number(els.visibleLimit.value);
  markGraphChanged("width");
  render();
});

els.zoomOut.addEventListener("click", () => {
  zoomAt({ x: els.canvas.clientWidth / 2, y: els.canvas.clientHeight / 2 }, 0.82);
});

els.zoomIn.addEventListener("click", () => {
  zoomAt({ x: els.canvas.clientWidth / 2, y: els.canvas.clientHeight / 2 }, 1.18);
});

els.fitGraph.addEventListener("click", () => {
  state.needsFit = "width";
  drawGraph();
});

els.fitAllGraph.addEventListener("click", () => {
  state.needsFit = "all";
  drawGraph();
});

els.focusFaculty.addEventListener("click", () => {
  state.needsFit = "faculty";
  drawGraph();
});

els.focusSelectedPaths.addEventListener("click", () => {
  if (state.selectedNodeIndex === null) {
    return;
  }
  if (state.focusMode === "path") {
    setFocusMode("common", "width");
  } else {
    showAdvisorPathsForNode(state.selectedNodeIndex);
  }
});

els.resetGraph.addEventListener("click", () => {
  resetGraphView();
});

els.canvas.addEventListener("pointerdown", handlePointerDown);
els.canvas.addEventListener("pointermove", handlePointerMove);
els.canvas.addEventListener("pointerup", handlePointerUp);
els.canvas.addEventListener("pointercancel", handlePointerUp);
els.canvas.addEventListener("dblclick", handleDoubleClick);
els.canvas.addEventListener("mouseleave", () => {
  state.pointerDown = false;
  state.activePointers.clear();
  state.pinchStart = null;
  state.hoveredNodeIndex = null;
  els.canvas.classList.remove("dragging");
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
  state.needsFit = "width";
  drawGraph();
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
