const DATA_URLS = ["../data/osu_mgp_graph.json", "data/osu_mgp_graph.json"];
const DATA_VERSION = "20260716-websites-bux";
const DEFAULT_VISIBLE_ANCESTORS = 60;
const MIN_SCALE = 0.15;
const MAX_SCALE = 2.8;
const OVERVIEW_PADDING = 10;
const MAX_ANCESTOR_SUGGESTIONS = 6;
const ANCESTOR_PRESETS = [
  { label: "Gauss", pid: "18231" },
  { label: "Fourier", pid: "17981" },
  { label: "Laplace", pid: "108295" },
];

const state = {
  payload: null,
  people: [],
  faculty: [],
  groups: [],
  groupLabels: new Map(),
  edges: [],
  peopleMasks: [],
  selectedGroupId: "all-faculty",
  areaMenuOpen: false,
  ancestorQuery: "",
  selectedAncestorIndex: null,
  selectedFaculty: new Set(),
  minShared: 2,
  visibleAncestorLimit: DEFAULT_VISIBLE_ANCESTORS,
  facultySearch: "",
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
  overviewTransform: null,
};

const els = {
  sourceRow: document.querySelector("#sourceRow"),
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
  ancestorSearch: document.querySelector("#ancestorSearch"),
  ancestorPresets: document.querySelector("#ancestorPresets"),
  ancestorSuggestions: document.querySelector("#ancestorSuggestions"),
  ancestorResult: document.querySelector("#ancestorResult"),
  clearAncestor: document.querySelector("#clearAncestor"),
  metrics: document.querySelector("#metrics"),
  graphTitle: document.querySelector("#graphTitle"),
  graphSubtitle: document.querySelector("#graphSubtitle"),
  minShared: document.querySelector("#minShared"),
  minSharedLabel: document.querySelector("#minSharedLabel"),
  visibleLimit: document.querySelector("#visibleLimit"),
  visibleLimitLabel: document.querySelector("#visibleLimitLabel"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  fitGraph: document.querySelector("#fitGraph"),
  fitAllGraph: document.querySelector("#fitAllGraph"),
  focusFaculty: document.querySelector("#focusFaculty"),
  ancestorRows: document.querySelector("#ancestorRows"),
  nodeDetail: document.querySelector("#nodeDetail"),
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
    .toLowerCase();
}

function personMeta(person) {
  return [person.year, person.country].filter(Boolean).join(", ") || "degree not listed";
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
  state.edges = payload.edges;
  state.peopleMasks = state.people.map((person) => hexToBigInt(person.faculty_mask));
  const dataGroups = Object.values(payload.faculty_groups || {}).sort(
    (a, b) => b.faculty_indices.length - a.faculty_indices.length || a.label.localeCompare(b.label),
  );
  state.groups = [allFacultyGroup(state.faculty), ...dataGroups];
  state.groupLabels = new Map(state.groups.map((group) => [group.id, group.label]));
  selectGroup("all-faculty", false);
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

function renderSources() {
  const metadata = state.payload.metadata;
  els.sourceRow.innerHTML = `
    <span>${metadata.faculty_count} faculty</span>
    <span>${metadata.person_count} people</span>
    <a href="${metadata.faculty_source}" target="_blank" rel="noreferrer">OSU source</a>
    <a href="${metadata.mgp_source}" target="_blank" rel="noreferrer">MGP source</a>
  `;
}

function renderGroups() {
  const group = activeGroup();
  const selectedCount = activeFacultyIndices().length;
  els.areaMenuCurrent.textContent = group.label;
  els.areaMenuCount.textContent = `${group.faculty_indices.length} faculty`;
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
          <span class="area-menu-option-count">${row.faculty_indices.length}</span>
        </button>
      `;
    })
    .join("");
  els.areaMenuList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectGroup(button.dataset.groupId));
  });
  els.areaSummary.textContent = isCustomSelection()
    ? `${selectedCount} selected from ${group.label}`
    : `${group.faculty_indices.length} faculty in ${group.label}`;
}

function ancestorSuggestionRows() {
  const query = state.ancestorQuery.trim();
  if (!query) {
    return [];
  }
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const numericQuery = query.replace(/\D/g, "");
  const rows = [];

  state.people.forEach((person, personIndex) => {
    const nameText = normalizeSearchText(person.name);
    const idText = String(person.id);
    let score = null;

    if (numericQuery && idText === numericQuery) {
      score = -100;
    } else if (numericQuery && idText.startsWith(numericQuery)) {
      score = -50 + idText.length - numericQuery.length;
    } else if (terms.length && terms.every((term) => nameText.includes(term) || idText.includes(term))) {
      score = terms.reduce((sum, term) => sum + Math.max(0, nameText.indexOf(term)), 0);
    }

    if (score === null) {
      return;
    }

    rows.push({
      personIndex,
      person,
      score,
      descendantCount: descendantFacultyIndices(personIndex).length,
    });
  });

  return rows
    .sort((a, b) =>
      a.score - b.score ||
      b.descendantCount - a.descendantCount ||
      a.person.name.localeCompare(b.person.name),
    )
    .slice(0, MAX_ANCESTOR_SUGGESTIONS);
}

function applyAncestorPerson(personIndex, shouldRender = true) {
  const person = state.people[personIndex];
  if (!person) {
    return;
  }
  state.selectedAncestorIndex = personIndex;
  state.ancestorQuery = `${person.name} ${person.id}`;
  els.ancestorSearch.value = state.ancestorQuery;
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
  els.ancestorSearch.value = "";
  state.selectedFaculty = new Set(groupFacultyIndices());
  state.minShared = Math.min(2, Math.max(1, state.selectedFaculty.size));
  markGraphChanged("width");
  if (shouldRender) {
    render();
  }
}

function renderAncestorPresets() {
  els.ancestorPresets.innerHTML = ANCESTOR_PRESETS
    .map((preset) => {
      const personIndex = personIndexByMgpId(preset.pid);
      const person = personIndex === null ? null : state.people[personIndex];
      const count = personIndex === null ? 0 : descendantFacultyIndices(personIndex).length;
      const active = personIndex !== null && personIndex === state.selectedAncestorIndex;
      return `
        <button
          type="button"
          class="ancestor-preset${active ? " is-active" : ""}"
          data-person-index="${personIndex === null ? "" : personIndex}"
          data-preset-label="${escapeHtml(preset.label)}"
        >
          <span class="ancestor-preset-name">${escapeHtml(preset.label)}</span>
          <span class="ancestor-preset-meta">MGP ${escapeHtml(preset.pid)} · ${count} faculty</span>
        </button>
      `;
    })
    .join("");

  els.ancestorPresets.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.personIndex) {
        const personIndex = Number(button.dataset.personIndex);
        applyAncestorPerson(personIndex);
        return;
      }
      state.ancestorQuery = button.dataset.presetLabel || "";
      els.ancestorSearch.value = state.ancestorQuery;
      renderAncestorTool();
    });
  });
}

function renderAncestorSuggestions() {
  const rows = ancestorSuggestionRows();
  if (!rows.length) {
    els.ancestorSuggestions.innerHTML = state.ancestorQuery.trim()
      ? `<div class="empty">No loaded MGP person matches ${escapeHtml(state.ancestorQuery.trim())}.</div>`
      : "";
    return;
  }

  els.ancestorSuggestions.innerHTML = rows
    .map(({ personIndex, person, descendantCount }) => {
      const active = personIndex === state.selectedAncestorIndex;
      return `
        <button
          type="button"
          class="ancestor-suggestion${active ? " is-active" : ""}"
          data-person-index="${personIndex}"
        >
          <span>
            <span class="ancestor-suggestion-name">${escapeHtml(person.name)}</span>
            <span class="ancestor-suggestion-meta">MGP ${escapeHtml(person.id)} · ${escapeHtml(personMeta(person))}</span>
          </span>
          <span class="ancestor-suggestion-count">${descendantCount}</span>
        </button>
      `;
    })
    .join("");

  els.ancestorSuggestions.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => applyAncestorPerson(Number(button.dataset.personIndex)));
  });
}

function renderAncestorResult() {
  if (state.selectedAncestorIndex === null) {
    els.ancestorResult.innerHTML = "";
    return;
  }

  const person = state.people[state.selectedAncestorIndex];
  const descendants = descendantFacultyIndices(state.selectedAncestorIndex);
  const group = activeGroup();
  const chips = descendants
    .slice(0, 10)
    .map((index) => `<span class="ancestor-result-chip">${escapeHtml(state.faculty[index].osu_name)}</span>`)
    .join("");
  const extra = descendants.length > 10 ? `<span class="ancestor-result-chip">+${descendants.length - 10} more</span>` : "";

  els.ancestorResult.innerHTML = `
    <div>
      <strong>${escapeHtml(person.name)}</strong> reaches
      <strong>${descendants.length}</strong> of ${group.faculty_indices.length} faculty in ${escapeHtml(group.label)}.
    </div>
    <div>
      <a href="${person.url}" target="_blank" rel="noreferrer">MGP ${escapeHtml(person.id)}</a>
      · ${escapeHtml(personMeta(person))}
    </div>
    <div class="ancestor-result-list">${chips}${extra}</div>
  `;
}

function renderAncestorTool() {
  els.ancestorSearch.value = state.ancestorQuery;
  renderAncestorPresets();
  renderAncestorSuggestions();
  renderAncestorResult();
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

function facultyOsuProfileUrl(faculty) {
  return faculty.osu_profile_url || faculty.profile_url || "";
}

function facultyWebsiteUrl(faculty) {
  return faculty.website_url || faculty.professional_website_url || facultyOsuProfileUrl(faculty);
}

function facultyWebsiteLabel(faculty) {
  return faculty.professional_website_url ? "Personal website" : "OSU profile";
}

function renderFaculty() {
  const groupSet = new Set(groupFacultyIndices());
  const query = state.facultySearch.trim().toLowerCase();
  const rows = state.faculty
    .filter((faculty) => groupSet.has(Number(faculty.faculty_index)))
    .filter((faculty) => {
      if (!query) {
        return true;
      }
      return `${faculty.osu_name} ${faculty.title} ${faculty.filed_in.join(" ")} ${faculty.expertise.join(" ")}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => a.osu_name.localeCompare(b.osu_name));

  els.facultyList.innerHTML = rows
    .map((faculty) => {
      const index = Number(faculty.faculty_index);
      const checked = state.selectedFaculty.has(index) ? " checked" : "";
      const websiteUrl = facultyWebsiteUrl(faculty);
      const websiteLink = websiteUrl
        ? `<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(faculty))}</a>`
        : "";
      return `
        <div class="faculty-item">
          <input type="checkbox" value="${index}" aria-label="Select ${escapeHtml(faculty.osu_name)}"${checked}>
          <span>
            <span class="faculty-name">${escapeHtml(faculty.osu_name)}</span>
            <span class="faculty-title">${escapeHtml(faculty.title || faculty.filed_in.join("; "))}</span>
            ${websiteLink ? `<span class="faculty-links">${websiteLink}</span>` : ""}
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
      country: person.country,
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

function lineagePersonIndices() {
  const activeMask = maskForFaculty(activeFacultyIndices());
  if (activeMask === 0n) {
    return [];
  }
  return state.people
    .map((_person, index) => index)
    .filter((index) => (state.peopleMasks[index] & activeMask) !== 0n);
}

function visibleGraph() {
  const facultyIndices = activeFacultyIndices();
  const activeFacultyPersonIndices = new Set(
    facultyIndices.map((index) => state.faculty[index].person_index).filter(Number.isInteger),
  );
  const common = commonAncestors();
  const visibleCommon = common.slice(0, state.visibleAncestorLimit);
  const chosen = new Set(activeFacultyPersonIndices);

  for (const row of visibleCommon) {
    chosen.add(row.personIndex);
  }
  if (state.selectedAncestorIndex !== null) {
    chosen.add(state.selectedAncestorIndex);
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
  };
}

function renderMetrics(graphData) {
  const active = activeFacultyIndices();
  const lineage = lineagePersonIndices();
  const metricRows = [
    ["Selected Faculty", active.length],
    ["Lineage People", lineage.length],
    ["Common Ancestors", graphData.common.length],
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
  els.graphSubtitle.textContent =
    `${graphData.nodes.length.toLocaleString()} visible people, ` +
    `${graphData.visibleCommon.length.toLocaleString()} visible ancestors, ` +
    `${active.length.toLocaleString()} selected faculty`;
}

function renderRange() {
  const selectedCount = Math.max(1, activeFacultyIndices().length);
  els.minShared.max = String(selectedCount);
  state.minShared = Math.max(1, Math.min(state.minShared, selectedCount));
  els.minShared.value = String(state.minShared);
  els.minSharedLabel.textContent = String(state.minShared);

  els.visibleLimit.value = String(state.visibleAncestorLimit);
  els.visibleLimitLabel.textContent = String(state.visibleAncestorLimit);
}

function renderAncestorTable(rows) {
  const topRows = rows.slice(0, 40);
  if (!topRows.length) {
    els.ancestorRows.innerHTML = `<tr><td colspan="6" class="empty">No selected faculty.</td></tr>`;
    return;
  }

  els.ancestorRows.innerHTML = topRows
    .map((row) => `
      <tr data-person-index="${row.personIndex}">
        <td><a href="${row.url}" target="_blank" rel="noreferrer">${escapeHtml(row.name)}</a></td>
        <td>${escapeHtml(row.year || "")}</td>
        <td>${escapeHtml(row.country || "")}</td>
        <td class="numeric">${row.matchedCount}</td>
        <td class="numeric">${row.maxDistance}</td>
        <td class="numeric">${row.totalDistance}</td>
      </tr>
    `)
    .join("");

  els.ancestorRows.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedNodeIndex = Number(row.dataset.personIndex);
      state.pendingCenterNodeIndex = state.selectedNodeIndex;
      renderDetail();
      drawGraph();
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
      <div class="detail-name">${escapeHtml(selectionTitle())}</div>
      <div>${selectedFaculty.length} selected faculty</div>
      <div class="tag-row">
        ${selectedFaculty.slice(0, 12).map((index) => `<span class="tag">${escapeHtml(state.faculty[index].osu_name)}</span>`).join("")}
      </div>
      <div class="tag-row">${areaTags}</div>
    `;
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
  const advisorNames = person.advisor_indices
    .map((index) => state.people[index]?.name)
    .filter(Boolean)
    .join("; ");

  els.nodeDetail.innerHTML = `
    <div class="detail-name">${escapeHtml(person.name)}</div>
    <div><strong>MGP ID:</strong> <a href="${person.url}" target="_blank" rel="noreferrer">${escapeHtml(person.id)}</a></div>
    <div><strong>Degree:</strong> ${escapeHtml([person.year, person.country].filter(Boolean).join(", ") || "not listed")}</div>
    ${advisorNames ? `<div><strong>Advisor:</strong> ${escapeHtml(advisorNames)}</div>` : ""}
    <div><strong>Faculty sharing this ancestor:</strong> ${matchedFaculty.length}</div>
    ${facultyRecord && facultyWebsite ? `<div><strong>Website:</strong> <a href="${escapeHtml(facultyWebsite)}" target="_blank" rel="noreferrer">${escapeHtml(facultyWebsiteLabel(facultyRecord))}</a></div>` : ""}
    ${facultyRecord && professionalWebsite && facultyOsuProfile ? `<div><strong>OSU profile:</strong> <a href="${escapeHtml(facultyOsuProfile)}" target="_blank" rel="noreferrer">${escapeHtml(facultyRecord.osu_name)}</a></div>` : ""}
    <div class="tag-row">
      ${matchedFaculty.slice(0, 14).map((index) => `<span class="tag">${escapeHtml(state.faculty[index].osu_name)}</span>`).join("")}
    </div>
  `;
}

function yearToY(year) {
  const span = Math.max(1, state.yearRange.max - state.yearRange.min);
  return state.yearAxis.top + ((year - state.yearRange.min) / span) * Math.max(1, state.yearAxis.bottom - state.yearAxis.top);
}

function computeNodePositions(graphData) {
  const positions = new Map();
  const facultySet = graphData.activeFacultyPersonIndices;
  const ancestorNodes = graphData.nodes.filter((index) => !facultySet.has(index));
  const years = graphData.nodes.map((index) => yearNumber(state.people[index])).filter(Number.isFinite);
  const minYear = Math.min(...years, 1100);
  const maxYear = Math.max(...years, 2026);
  const bandCount = Math.max(8, Math.min(20, Math.ceil((maxYear - minYear) / 55)));
  const buckets = Array.from({ length: bandCount }, () => []);
  const unknown = [];
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));

  ancestorNodes
    .slice()
    .sort((a, b) => {
      const yearA = yearNumber(state.people[a]) || 9999;
      const yearB = yearNumber(state.people[b]) || 9999;
      return yearA - yearB || (commonRank.get(a) || 0) - (commonRank.get(b) || 0);
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

  const maxBucketSize = Math.max(1, ...buckets.map((bucket) => bucket.length));
  const facultyRowTarget = 22;
  const facultyRows = Math.max(1, Math.ceil(facultySet.size / facultyRowTarget));
  const facultyColumns = Math.max(1, Math.ceil(facultySet.size / facultyRows));
  const facultyBandHeight = 116 + (facultyRows - 1) * 120;
  const worldWidth = Math.max(
    1550,
    Math.min(7200, Math.max(360 + facultyColumns * 158, 320 + maxBucketSize * 74)),
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

  const left = 120;
  const right = worldWidth - 160;
  const usableWidth = Math.max(1, right - left);
  buckets.forEach((bucket, band) => {
    const spread = bucket.length <= 1 ? 0 : usableWidth / (bucket.length - 1);
    bucket.forEach((personIndex, slot) => {
      const person = state.people[personIndex];
      const year = yearNumber(person);
      const x = bucket.length <= 1
        ? left + ((band * 137) % Math.max(180, usableWidth))
        : left + slot * spread + ((band % 3) - 1) * 10;
      const y = year ? yearToY(year) : worldHeight - 280;
      positions.set(personIndex, { x, y });
    });
  });

  const facultyNodes = Array.from(facultySet).sort((a, b) => state.people[a].name.localeCompare(state.people[b].name));
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

  overviewCtx.lineWidth = 0.8;
  overviewCtx.strokeStyle = "rgba(100, 106, 110, 0.18)";
  graphData.edges.forEach(([advisorIndex, studentIndex]) => {
    const advisor = state.nodePositions.get(advisorIndex);
    const student = state.nodePositions.get(studentIndex);
    if (!advisor || !student) {
      return;
    }
    const a = overviewPoint(advisor);
    const s = overviewPoint(student);
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
    const radius = isFaculty ? 2.2 : Math.max(1.2, Math.min(2.2, 1 + matchedCount / 30));
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
  const labels = Array.from(graphData.activeFacultyPersonIndices)
    .map((personIndex) => {
      const point = state.nodePositions.get(personIndex);
      if (!point) {
        return null;
      }
      const anchor = worldToScreen(point);
      if (anchor.x < -180 || anchor.x > displayWidth + 180 || anchor.y < -120 || anchor.y > displayHeight + 120) {
        return null;
      }
      const lines = wrapWords(state.people[personIndex].name, 15, 3);
      const measured = measureScreenLabelBox(lines, { fontSize: 11, weight: 700 });
      return { personIndex, anchor, lines, measured, kind: "faculty" };
    })
    .filter(Boolean);

  graphData.common.slice(0, 6).forEach((row) => {
    if (!visibleNodes.has(row.personIndex) || graphData.activeFacultyPersonIndices.has(row.personIndex)) {
      return;
    }
    const point = state.nodePositions.get(row.personIndex);
    if (!point) {
      return;
    }
    const anchor = worldToScreen(point);
    if (anchor.x < -180 || anchor.x > displayWidth + 180 || anchor.y < -120 || anchor.y > displayHeight + 120) {
      return;
    }
    const lines = wrapWords(state.people[row.personIndex].name, 17, 2);
    const measured = measureScreenLabelBox(lines, { fontSize: 10.5, weight: 600 });
    labels.push({ personIndex: row.personIndex, anchor, lines, measured, kind: "ancestor" });
  });

  [state.selectedNodeIndex, state.hoveredNodeIndex].forEach((personIndex) => {
    if (
      personIndex === null ||
      !visibleNodes.has(personIndex) ||
      graphData.activeFacultyPersonIndices.has(personIndex) ||
      labels.some((label) => label.personIndex === personIndex)
    ) {
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
    const lines = wrapWords(state.people[personIndex].name, 18, 3);
    const measured = measureScreenLabelBox(lines, { fontSize: 11, weight: 700 });
    labels.push({ personIndex, anchor, lines, measured, kind: "ancestor" });
  });

  const orderedLabels = labels
    .sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x);

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
    drawScreenLabelBox(label.lines, label.left, label.top, label.measured, {
      color: selected || hovered ? OSU_COLORS.scarletDark40 : faculty ? OSU_COLORS.scarletDark60 : OSU_COLORS.grayDark80,
      border: selected || hovered ? "rgba(186, 12, 47, 0.72)" : faculty ? "rgba(186, 12, 47, 0.45)" : "rgba(167, 177, 183, 0.9)",
      background: selected || hovered ? "rgba(246, 247, 248, 0.98)" : "rgba(255, 255, 255, 0.94)",
      weight: selected || hovered ? 800 : faculty ? 700 : 600,
    });
  });
  ctx.restore();
}

function drawGraph(graphData = visibleGraph()) {
  state.currentGraphData = graphData;
  state.graphNodes = graphData.nodes;
  const { displayWidth, displayHeight } = resizeCanvas();
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  computeNodePositions(graphData);

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
  ctx.strokeStyle = "rgba(100, 106, 110, 0.18)";
  graphData.edges.forEach(([advisorIndex, studentIndex]) => {
    const advisor = state.nodePositions.get(advisorIndex);
    const student = state.nodePositions.get(studentIndex);
    if (!advisor || !student) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(advisor.x, advisor.y);
    const midY = (advisor.y + student.y) / 2;
    ctx.bezierCurveTo(advisor.x, midY, student.x, midY, student.x, student.y);
    ctx.stroke();
  });

  const activeMask = maskForFaculty(activeFacultyIndices());
  const commonRank = new Map(graphData.common.map((row, rank) => [row.personIndex, rank]));
  graphData.nodes.forEach((personIndex) => {
    const point = state.nodePositions.get(personIndex);
    if (!point) {
      return;
    }
    const matchedCount = bitCount(state.peopleMasks[personIndex] & activeMask);
    const isFaculty = graphData.activeFacultyPersonIndices.has(personIndex);
    const rank = commonRank.get(personIndex);
    const selected = state.selectedNodeIndex === personIndex;
    const hovered = state.hoveredNodeIndex === personIndex;
    const radius = (selected || hovered ? 8 : isFaculty ? 6 : Math.max(3.5, Math.min(7, 2.5 + matchedCount / 10))) / state.view.scale;

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = selected
      ? OSU_COLORS.scarletDark40
      : hovered
        ? OSU_COLORS.scarletDark60
        : isFaculty
          ? OSU_COLORS.scarlet
          : rank !== undefined && rank < 20
            ? OSU_COLORS.grayDark40
            : OSU_COLORS.grayDark20;
    ctx.fill();
    ctx.lineWidth = (selected || hovered ? 3 : 1.4) / state.view.scale;
    ctx.strokeStyle = OSU_COLORS.white;
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
  renderSources();
  renderGroups();
  renderAncestorTool();
  renderFaculty();
  renderRange();
  const graphData = visibleGraph();
  renderMetrics(graphData);
  renderAncestorTable(graphData.common);
  renderDetail();
  drawGraph(graphData);
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
    <span>${escapeHtml([person.year, person.country].filter(Boolean).join(", ") || `MGP ${person.id}`)}</span>
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

function handlePointerDown(event) {
  const point = canvasPoint(event);
  state.pointerDown = true;
  state.pointerMoved = false;
  state.pointerStart = point;
  state.viewStart = { ...state.view };
  els.canvas.classList.add("dragging");
  els.canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  const point = canvasPoint(event);
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
  const point = canvasPoint(event);
  state.pointerDown = false;
  els.canvas.classList.remove("dragging");
  try {
    els.canvas.releasePointerCapture(event.pointerId);
  } catch (_error) {
    // Pointer capture may already have been released by the browser.
  }
  if (!state.pointerMoved) {
    state.selectedNodeIndex = hitTestNode(point);
    renderDetail();
    drawGraph();
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

els.ancestorSearch.addEventListener("input", () => {
  state.ancestorQuery = els.ancestorSearch.value;
  state.selectedAncestorIndex = null;
  renderAncestorTool();
});

els.ancestorSearch.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  const first = ancestorSuggestionRows()[0];
  if (!first) {
    return;
  }
  event.preventDefault();
  applyAncestorPerson(first.personIndex);
});

els.clearAncestor.addEventListener("click", () => {
  clearAncestorFilter();
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
  state.minShared = Number(els.minShared.value);
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

els.canvas.addEventListener("pointerdown", handlePointerDown);
els.canvas.addEventListener("pointermove", handlePointerMove);
els.canvas.addEventListener("pointerup", handlePointerUp);
els.canvas.addEventListener("pointercancel", handlePointerUp);
els.canvas.addEventListener("mouseleave", () => {
  state.pointerDown = false;
  state.hoveredNodeIndex = null;
  els.canvas.classList.remove("dragging");
  hideTooltip();
  drawGraph();
});
els.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    zoomAt(canvasPoint(event), event.deltaY < 0 ? 1.12 : 0.88);
    return;
  }
  state.view.x -= event.deltaX;
  state.view.y -= event.deltaY;
  hideTooltip();
  drawGraph();
}, { passive: false });
els.overview.addEventListener("pointerdown", handleOverviewPointerDown);

window.addEventListener("resize", () => {
  state.needsFit = "all";
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
