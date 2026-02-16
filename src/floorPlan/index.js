/**
 * Floor plan route UI: generates one-storey plans and renders SVG preview.
 */

import { generateFloorPlan, renderFloorPlanSvg } from './generator.js';
import { decodeSvgMetadata, encodeSvgMetadata } from '../shared/svgMetadata.js';
import { withBasePath } from '../shared/basePath.js';

const MAX_SEED = 4294967295;
const LATEST_PLAN_STORAGE_KEY = 'occultShooter.latestFloorPlanSvg';
const FLOOR_PLAN_SETTINGS_STORAGE_KEY = 'occultShooter.floorPlanSettings';
const LATEST_PLAYER_START_STORAGE_KEY = 'occultShooter.latestFloorPlanPlayerStart';
const MIN_GENERATE_SPINNER_MS = 320;
const PANEL_COLLAPSE_STORAGE_KEY = 'occultShooter.floorPlanPanelCollapseState';
const LIGHT_INTENSITY_MIN = 0;
const LIGHT_INTENSITY_MAX = 24;
const LIGHT_RADIUS_MIN = 1;
const LIGHT_RADIUS_MAX = 120;

function createNumberField(labelText, inputId, defaultValue, min, max) {
  const wrapper = document.createElement('label');
  wrapper.className = 'plan-control';
  wrapper.setAttribute('for', inputId);
  wrapper.textContent = labelText;

  const input = document.createElement('input');
  input.id = inputId;
  input.type = 'number';
  input.value = String(defaultValue);
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.inputMode = 'numeric';

  wrapper.appendChild(input);
  return { wrapper, input };
}

function createDecimalRangeField(labelText, inputId, defaultValue, min, max, step = 0.1) {
  const wrapper = document.createElement('label');
  wrapper.className = 'plan-control';
  wrapper.setAttribute('for', inputId);
  const labelRow = document.createElement('span');
  labelRow.textContent = labelText;
  const valueReadout = document.createElement('strong');
  valueReadout.textContent = Number(defaultValue).toFixed(1);
  labelRow.append(' ', valueReadout);

  const input = document.createElement('input');
  input.id = inputId;
  input.type = 'range';
  input.value = String(defaultValue);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const syncReadout = () => {
    valueReadout.textContent = (Number(input.value) || Number(defaultValue)).toFixed(1);
  };
  input.addEventListener('input', syncReadout);
  syncReadout();

  wrapper.append(labelRow, input);
  return { wrapper, input, syncReadout };
}

function createRangeField(labelText, inputId, defaultValue, min, max) {
  const wrapper = document.createElement('label');
  wrapper.className = 'plan-control';
  wrapper.setAttribute('for', inputId);

  const labelRow = document.createElement('span');
  labelRow.textContent = labelText;
  const valueReadout = document.createElement('strong');
  valueReadout.textContent = String(defaultValue);
  labelRow.append(' ', valueReadout);

  const input = document.createElement('input');
  input.id = inputId;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(defaultValue);
  input.addEventListener('input', () => {
    valueReadout.textContent = input.value;
  });

  wrapper.append(labelRow, input);
  return { wrapper, input };
}

function readPositiveInt(input, fallback) {
  const numeric = Number(input.value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  return rounded > 0 ? rounded : fallback;
}

function readBoundedInt(input, fallback, min, max) {
  const numeric = Number(input.value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  return Math.max(min, Math.min(max, rounded));
}

async function waitForUiPaint() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function readPanelCollapseState() {
  const raw = window.localStorage.getItem(PANEL_COLLAPSE_STORAGE_KEY);
  if (raw == null) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed != null ? parsed : {};
  } catch {
    return {};
  }
}

function writePanelCollapseState(nextState) {
  window.localStorage.setItem(PANEL_COLLAPSE_STORAGE_KEY, JSON.stringify(nextState));
}

function attachPanelTab(panel, options) {
  const edge = options.edge === 'right' ? 'right' : 'left';
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = `panel-tab-toggle is-${edge}`;
  tab.setAttribute('aria-label', options.label);
  tab.title = options.label;
  panel.classList.add('is-collapsible', `is-edge-${edge}`);
  panel.appendChild(tab);

  const applyState = (collapsed) => {
    panel.classList.toggle('is-collapsed', collapsed);
    tab.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    tab.textContent = collapsed ? (edge === 'left' ? '>' : '<') : (edge === 'left' ? '<' : '>');
  };

  applyState(Boolean(options.collapsed));
  tab.addEventListener('click', () => {
    const nextCollapsed = !panel.classList.contains('is-collapsed');
    applyState(nextCollapsed);
    options.onChange?.(nextCollapsed);
  });
}

function createRandomHashedSeed() {
  const words = new Uint32Array(2);
  if (window.crypto?.getRandomValues != null) {
    window.crypto.getRandomValues(words);
  } else {
    words[0] = Math.floor(Math.random() * 0xffffffff);
    words[1] = Math.floor(Math.random() * 0xffffffff);
  }
  const timeBits = Date.now() >>> 0;
  const mixed = (words[0] ^ words[1] ^ timeBits) >>> 0;
  const hashed = ((mixed * 2654435761) ^ (mixed >>> 16)) >>> 0;
  return Math.max(1, Math.min(MAX_SEED, hashed));
}

function loadSavedSettings() {
  const raw = window.localStorage.getItem(FLOOR_PLAN_SETTINGS_STORAGE_KEY);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      seed: Number(parsed.seed),
      width: Number(parsed.width),
      height: Number(parsed.height),
      hallwayCount: Number(parsed.hallwayCount),
      doorCount: Number(parsed.doorCount),
      roomShapeStyle: Number(parsed.roomShapeStyle),
      maxWindowCount: Number(parsed.maxWindowCount),
      maxLightCount: Number(parsed.maxLightCount),
      statsText: typeof parsed.statsText === 'string' ? parsed.statsText : '',
    };
  } catch {
    return null;
  }
}

function overlapsAabb(a, b) {
  const axMin = a.x - a.width / 2;
  const axMax = a.x + a.width / 2;
  const ayMin = a.y - a.depth / 2;
  const ayMax = a.y + a.depth / 2;
  const bxMin = b.x - b.width / 2;
  const bxMax = b.x + b.width / 2;
  const byMin = b.y - b.depth / 2;
  const byMax = b.y + b.depth / 2;
  return axMin < bxMax && axMax > bxMin && ayMin < byMax && ayMax > byMin;
}

function updateFurnitureElementGeometry(element, item, padding) {
  const cx = item.x + padding;
  const cy = item.y + padding;
  element.setAttribute('data-plan-x', String(item.x));
  element.setAttribute('data-plan-y', String(item.y));
  if (item.shape === 'circle') {
    element.setAttribute('cx', String(cx));
    element.setAttribute('cy', String(cy));
    element.setAttribute('r', String(item.width / 2));
  } else {
    element.setAttribute('x', String(cx - item.width / 2));
    element.setAttribute('y', String(cy - item.depth / 2));
    element.setAttribute('width', String(item.width));
    element.setAttribute('height', String(item.depth));
  }
}

function updatePlayerStartElementGeometry(element, playerStart, padding) {
  const cx = playerStart.x + padding;
  const cy = playerStart.y + padding;
  element.setAttribute('data-plan-x', String(playerStart.x));
  element.setAttribute('data-plan-y', String(playerStart.y));
  const dot = element.querySelector('.player-start-dot');
  if (dot != null) {
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
  }
  const horizontal = element.querySelectorAll('.player-start-cross')[0];
  const vertical = element.querySelectorAll('.player-start-cross')[1];
  if (horizontal != null) {
    horizontal.setAttribute('x1', String(cx - 0.28));
    horizontal.setAttribute('y1', String(cy));
    horizontal.setAttribute('x2', String(cx + 0.28));
    horizontal.setAttribute('y2', String(cy));
  }
  if (vertical != null) {
    vertical.setAttribute('x1', String(cx));
    vertical.setAttribute('y1', String(cy - 0.28));
    vertical.setAttribute('x2', String(cx));
    vertical.setAttribute('y2', String(cy + 0.28));
  }
}

function updateNpcStartElementGeometry(element, npcSpawn, padding) {
  const cx = npcSpawn.x + padding;
  const cy = npcSpawn.y + padding;
  element.setAttribute('data-plan-x', String(npcSpawn.x));
  element.setAttribute('data-plan-y', String(npcSpawn.y));
  const body = element.querySelector('.npc-start-body');
  if (body != null) {
    body.setAttribute('x', String(cx - 0.22));
    body.setAttribute('y', String(cy - 0.5));
    body.setAttribute('width', '0.44');
    body.setAttribute('height', '1.0');
  }
  const head = element.querySelector('.npc-start-head');
  if (head != null) {
    head.setAttribute('cx', String(cx));
    head.setAttribute('cy', String(cy - 0.52));
    head.setAttribute('r', '0.18');
  }
}

function updateLightStartElementGeometry(element, lightSpawn, padding) {
  const cx = lightSpawn.x + padding;
  const cy = lightSpawn.y + padding;
  element.setAttribute('data-plan-x', String(lightSpawn.x));
  element.setAttribute('data-plan-y', String(lightSpawn.y));
  const core = element.querySelector('.light-start-core');
  const ring = element.querySelector('.light-start-ring');
  if (core != null) {
    core.setAttribute('cx', String(cx));
    core.setAttribute('cy', String(cy));
    core.setAttribute('r', '0.2');
  }
  if (ring != null) {
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', '0.38');
  }
}

function parseViewBox(svgElement) {
  const viewBoxRaw = svgElement.getAttribute('viewBox');
  if (viewBoxRaw == null) return null;
  const values = viewBoxRaw.trim().split(/\s+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
}

function parseViewBoxFromRaw(viewBoxRaw) {
  if (typeof viewBoxRaw !== 'string' || viewBoxRaw.trim().length === 0) return null;
  const values = viewBoxRaw.trim().split(/\s+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
}

function readBaseViewBox(svgElement) {
  const raw = svgElement.getAttribute('data-base-viewbox');
  return parseViewBoxFromRaw(raw) ?? parseViewBox(svgElement);
}

function setViewBox(svgElement, viewBox) {
  svgElement.setAttribute(
    'viewBox',
    `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
  );
}

function readPlayerStartFromStorage() {
  const raw = window.localStorage.getItem(LATEST_PLAYER_START_STORAGE_KEY);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  } catch {
    return null;
  }
}

function resolvePlayerStartWithinPlan(playerStart, planWidth, planHeight) {
  const fallback = { x: planWidth / 2, y: planHeight / 2 };
  if (playerStart == null) return fallback;
  const x = Number(playerStart.x);
  const y = Number(playerStart.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return {
    x: Math.max(0, Math.min(planWidth, x)),
    y: Math.max(0, Math.min(planHeight, y)),
  };
}

function persistPlayerStartWorld(playerStart, metadata, svgElement) {
  const viewBoxRaw = svgElement.getAttribute('viewBox');
  if (viewBoxRaw == null) return;
  const viewBox = viewBoxRaw.trim().split(/\s+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) return;
  const [, , planWidth, planHeight] = viewBox;
  const padding = Number(metadata.padding) || 0;
  const x = playerStart.x + padding - planWidth / 2;
  const z = playerStart.y + padding - planHeight / 2;
  window.localStorage.setItem(
    LATEST_PLAYER_START_STORAGE_KEY,
    JSON.stringify({ x, z })
  );
}

export function mountFloorPlanRoute(containerElement) {
  containerElement.className = 'planner-root';
  containerElement.replaceChildren();

  const page = document.createElement('main');
  page.className = 'plan-page';

  const header = document.createElement('header');
  header.className = 'plan-header';
  header.innerHTML = `
    <h1>Stage Generator</h1>
    <p>Generate hallways with random L/U/S/T shapes and random doors.</p>
    <p><a href="${withBasePath('/')}">Main menu</a> · <a href="${withBasePath('/stage-preview')}">Open stage preview</a></p>
  `;

  const controls = document.createElement('section');
  controls.className = 'plan-controls';
  controls.setAttribute('aria-label', 'Floor plan generation controls');
  const controlsBody = document.createElement('div');
  controlsBody.className = 'plan-controls-body';
  controls.appendChild(controlsBody);
  const savedSettings = loadSavedSettings();

  const seedField = createNumberField('Seed', 'plan-seed', savedSettings?.seed ?? Date.now(), 1, 4294967295);
  const randomSeedButton = document.createElement('button');
  randomSeedButton.type = 'button';
  randomSeedButton.className = 'plan-seed-randomize';
  randomSeedButton.textContent = '↻';
  randomSeedButton.setAttribute('aria-label', 'Generate a random seed');
  randomSeedButton.title = 'Generate random seed';
  const seedInlineRow = document.createElement('div');
  seedInlineRow.className = 'plan-inline-controls';
  seedField.input.remove();
  seedInlineRow.append(seedField.input, randomSeedButton);
  seedField.wrapper.append(seedInlineRow);
  const widthField = createNumberField('Width (m)', 'plan-width', savedSettings?.width ?? 36, 12, 80);
  const heightField = createNumberField('Height (m)', 'plan-height', savedSettings?.height ?? 24, 12, 80);
  const hallwayCountField = createNumberField(
    'Hallway count',
    'hallway-count',
    Number.isFinite(savedSettings?.hallwayCount) ? savedSettings.hallwayCount : 1,
    1,
    12
  );
  const doorCountField = createNumberField(
    'Room count',
    'hallway-door-count',
    Number.isFinite(savedSettings?.doorCount) ? savedSettings.doorCount : 6,
    0,
    40
  );
  const maxWindowCountField = createNumberField(
    'Max windows',
    'hallway-window-count',
    Number.isFinite(savedSettings?.maxWindowCount) ? savedSettings.maxWindowCount : 8,
    0,
    40
  );
  const maxLightCountField = createNumberField(
    'Max lights',
    'hallway-light-count',
    Number.isFinite(savedSettings?.maxLightCount) ? savedSettings.maxLightCount : 10,
    0,
    80
  );
  const roomShapeStyleField = createRangeField(
    'Room shape style',
    'room-shape-style',
    Number.isFinite(savedSettings?.roomShapeStyle) ? savedSettings.roomShapeStyle : 45,
    0,
    100
  );

  const regenerateButton = document.createElement('button');
  regenerateButton.type = 'button';
  regenerateButton.textContent = 'Generate';
  regenerateButton.className = 'plan-generate';

  const openStageButton = document.createElement('button');
  openStageButton.type = 'button';
  openStageButton.textContent = 'Preview';
  openStageButton.className = 'plan-generate';

  const addNpcButton = document.createElement('button');
  addNpcButton.type = 'button';
  addNpcButton.textContent = 'Add NPC placeholder';
  addNpcButton.className = 'plan-download plan-delete-npc';

  controlsBody.append(
    seedField.wrapper,
    widthField.wrapper,
    heightField.wrapper,
    hallwayCountField.wrapper,
    doorCountField.wrapper,
    maxWindowCountField.wrapper,
    maxLightCountField.wrapper,
    roomShapeStyleField.wrapper,
    regenerateButton,
    openStageButton
  );

  const status = document.createElement('p');
  status.className = 'plan-status';
  status.setAttribute('aria-live', 'polite');

  const previewPanel = document.createElement('section');
  previewPanel.className = 'plan-preview';
  previewPanel.setAttribute('aria-label', 'Generated floor plan SVG preview');

  const previewContent = document.createElement('div');
  previewContent.className = 'plan-preview-content';
  previewPanel.appendChild(previewContent);
  const previewLoadingOverlay = document.createElement('div');
  previewLoadingOverlay.className = 'plan-preview-loading';
  previewLoadingOverlay.setAttribute('role', 'status');
  previewLoadingOverlay.setAttribute('aria-live', 'polite');
  previewLoadingOverlay.setAttribute('aria-label', 'Generating stage');
  previewLoadingOverlay.hidden = true;
  previewLoadingOverlay.innerHTML = `
    <span class="plan-preview-spinner" aria-hidden="true"></span>
    <span>Generating stage...</span>
  `;
  previewPanel.appendChild(previewLoadingOverlay);

  const saveSvgButton = document.createElement('button');
  saveSvgButton.type = 'button';
  saveSvgButton.className = 'plan-download plan-save-button';
  saveSvgButton.setAttribute('aria-label', 'Save SVG');
  saveSvgButton.title = 'Save SVG';
  const saveIconImage = document.createElement('img');
  saveIconImage.src = withBasePath('/icons8-save-50.png');
  saveIconImage.alt = '';
  saveIconImage.setAttribute('aria-hidden', 'true');
  saveSvgButton.appendChild(saveIconImage);

  const stats = document.createElement('p');
  stats.className = 'plan-stats';
  const npcPanel = document.createElement('section');
  npcPanel.className = 'plan-npc-panel';
  npcPanel.setAttribute('aria-label', 'NPC and light list with plan info');
  const npcPanelTitle = document.createElement('h2');
  npcPanelTitle.className = 'plan-npc-title';
  npcPanelTitle.textContent = 'NPC spawns';
  const npcList = document.createElement('ul');
  npcList.className = 'plan-npc-list';
  const deleteNpcButton = document.createElement('button');
  deleteNpcButton.type = 'button';
  deleteNpcButton.className = 'plan-download plan-delete-npc';
  deleteNpcButton.textContent = 'Delete selected NPC';
  const deleteAllNpcButton = document.createElement('button');
  deleteAllNpcButton.type = 'button';
  deleteAllNpcButton.className = 'plan-download plan-delete-npc';
  deleteAllNpcButton.textContent = 'Delete all NPCs';
  const lightPanelTitle = document.createElement('h2');
  lightPanelTitle.className = 'plan-npc-title';
  lightPanelTitle.textContent = 'Lights';
  const lightList = document.createElement('ul');
  lightList.className = 'plan-npc-list';
  const addLightButton = document.createElement('button');
  addLightButton.type = 'button';
  addLightButton.className = 'plan-download plan-delete-npc';
  addLightButton.textContent = 'Add light';
  const deleteLightButton = document.createElement('button');
  deleteLightButton.type = 'button';
  deleteLightButton.className = 'plan-download plan-delete-npc';
  deleteLightButton.textContent = 'Delete selected light';
  const deleteAllLightsButton = document.createElement('button');
  deleteAllLightsButton.type = 'button';
  deleteAllLightsButton.className = 'plan-download plan-delete-npc';
  deleteAllLightsButton.textContent = 'Delete all lights';
  const lightIntensityField = createDecimalRangeField(
    'Light intensity',
    'selected-light-intensity',
    1.2,
    LIGHT_INTENSITY_MIN,
    LIGHT_INTENSITY_MAX,
    0.1
  );
  const lightRadiusField = createDecimalRangeField(
    'Light radius',
    'selected-light-radius',
    7.5,
    LIGHT_RADIUS_MIN,
    LIGHT_RADIUS_MAX,
    0.1
  );
  lightIntensityField.input.disabled = true;
  lightRadiusField.input.disabled = true;
  const panelInfo = document.createElement('div');
  panelInfo.className = 'plan-panel-info';
  panelInfo.append(status, stats);
  npcPanel.append(
    saveSvgButton,
    npcPanelTitle,
    npcList,
    addNpcButton,
    deleteNpcButton,
    deleteAllNpcButton,
    lightPanelTitle,
    lightList,
    addLightButton,
    deleteLightButton,
    deleteAllLightsButton,
    lightIntensityField.wrapper,
    lightRadiusField.wrapper,
    panelInfo
  );
  const collapseState = readPanelCollapseState();
  attachPanelTab(controls, {
    edge: 'left',
    label: 'Toggle generator controls panel',
    collapsed: collapseState.controlsCollapsed === true,
    onChange: (collapsed) => {
      writePanelCollapseState({
        ...readPanelCollapseState(),
        controlsCollapsed: collapsed,
      });
    },
  });
  attachPanelTab(npcPanel, {
    edge: 'right',
    label: 'Toggle NPC panel',
    collapsed: collapseState.npcCollapsed === true,
    onChange: (collapsed) => {
      writePanelCollapseState({
        ...readPanelCollapseState(),
        npcCollapsed: collapsed,
      });
    },
  });

  let latestSvg = '';
  let currentPlayerStart = null;
  let selectedNpcId = null;
  let selectedLightId = null;
  let cleanupNpcDeleteListener = null;
  let selectNpcById = null;
  let deleteSelectedNpc = null;
  let selectLightById = null;
  let deleteSelectedLight = null;

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function renderNpcListFromMetadata(metadata) {
    npcList.replaceChildren();
    const spawns = Array.isArray(metadata?.npcSpawns) ? metadata.npcSpawns : [];
    if (spawns.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'plan-npc-empty';
      empty.textContent = 'No NPC placeholders.';
      npcList.appendChild(empty);
      return;
    }
    spawns.forEach((spawn, index) => {
      const item = document.createElement('li');
      item.className = 'plan-npc-item';
      if (spawn.id === selectedNpcId) {
        item.classList.add('is-selected');
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plan-npc-select';
      button.textContent = `${spawn.id ?? `npc-${index + 1}`} (${Number(spawn.x).toFixed(1)}, ${Number(spawn.y).toFixed(1)})`;
      button.addEventListener('click', () => {
        if (selectNpcById != null) {
          selectNpcById(spawn.id ?? `npc-${index + 1}`);
        }
      });
      item.appendChild(button);
      npcList.appendChild(item);
    });
  }

  function renderLightListFromMetadata(metadata) {
    lightList.replaceChildren();
    const spawns = Array.isArray(metadata?.lightSpawns) ? metadata.lightSpawns : [];
    if (spawns.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'plan-npc-empty';
      empty.textContent = 'No stage lights.';
      lightList.appendChild(empty);
      return;
    }
    spawns.forEach((spawn, index) => {
      const item = document.createElement('li');
      item.className = 'plan-npc-item';
      const id = spawn.id ?? `light-${index + 1}`;
      if (id === selectedLightId) {
        item.classList.add('is-selected');
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plan-npc-select';
      button.textContent = `${id} (${Number(spawn.x).toFixed(1)}, ${Number(spawn.y).toFixed(1)})`;
      button.addEventListener('click', () => {
        if (selectLightById != null) {
          selectLightById(id);
        }
      });
      item.appendChild(button);
      lightList.appendChild(item);
    });
  }

  function renderNpcListFromCurrentSvg() {
    const svg = previewContent.querySelector('svg');
    if (svg == null) {
      renderNpcListFromMetadata({ npcSpawns: [] });
      renderLightListFromMetadata({ lightSpawns: [] });
      return;
    }
    const metadata = decodeSvgMetadata(svg);
    renderNpcListFromMetadata(metadata ?? { npcSpawns: [] });
    renderLightListFromMetadata(metadata ?? { lightSpawns: [] });
  }

  function bindFurnitureDragging() {
    const svg = previewContent.querySelector('svg');
    if (svg == null) return;
    const metadata = decodeSvgMetadata(svg);
    if (metadata == null || !Array.isArray(metadata.furniture) || !Array.isArray(metadata.rooms)) {
      return;
    }
    const padding = Number(metadata.padding) || 0;
    const viewBoxRaw = svg.getAttribute('viewBox');
    const viewBoxParts = viewBoxRaw == null ? [] : viewBoxRaw.trim().split(/\s+/).map(Number);
    const planWidth = viewBoxParts.length === 4 ? Math.max(0, viewBoxParts[2] - padding * 2) : 0;
    const planHeight = viewBoxParts.length === 4 ? Math.max(0, viewBoxParts[3] - padding * 2) : 0;
    const initialViewBox = readBaseViewBox(svg);
    const minViewBoxWidth = initialViewBox == null ? 6 : Math.max(6, initialViewBox.width * 0.18);
    const minViewBoxHeight = initialViewBox == null ? 6 : Math.max(6, initialViewBox.height * 0.18);
    const maxViewBoxWidth = initialViewBox == null ? 500 : Math.max(initialViewBox.width, initialViewBox.width * 3.2);
    const maxViewBoxHeight = initialViewBox == null ? 500 : Math.max(initialViewBox.height, initialViewBox.height * 3.2);
    metadata.playerStart = resolvePlayerStartWithinPlan(
      metadata.playerStart ?? currentPlayerStart,
      planWidth,
      planHeight
    );
    currentPlayerStart = { x: metadata.playerStart.x, y: metadata.playerStart.y };
    if (!Array.isArray(metadata.npcSpawns)) {
      metadata.npcSpawns = [];
    }
    if (!Array.isArray(metadata.lightSpawns)) {
      metadata.lightSpawns = [];
    }
    const clampPlanX = (x) => Math.max(0, Math.min(planWidth, x));
    const clampPlanY = (y) => Math.max(0, Math.min(planHeight, y));
    const furnitureById = new Map(
      metadata.furniture.map((item) => [item.id, item])
    );
    const npcById = new Map(
      metadata.npcSpawns.map((item, index) => [
        item.id ?? `npc-${index + 1}`,
        {
          id: item.id ?? `npc-${index + 1}`,
          x: Number(item.x),
          y: Number(item.y),
        },
      ])
    );
    metadata.npcSpawns = [...npcById.values()];
    const lightById = new Map();
    metadata.lightSpawns.forEach((item, index) => {
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const id = item.id ?? `light-${index + 1}`;
      lightById.set(id, {
        id,
        x,
        y,
        height: Number(item.height) || 2.35,
        intensity: Number(item.intensity) || 1.2,
        range: Number(item.range) || 7.5,
        color: typeof item.color === 'string' ? item.color : '#ffe8b8',
      });
    });
    metadata.lightSpawns = [...lightById.values()];
    const svgPoint = svg.createSVGPoint();
    let dragState = null;

    let playerStartElement = svg.querySelector('.player-start-marker');
    if (playerStartElement == null) {
      const namespace = 'http://www.w3.org/2000/svg';
      const markerGroup = document.createElementNS(namespace, 'g');
      markerGroup.setAttribute('class', 'player-start-marker');
      const dot = document.createElementNS(namespace, 'circle');
      dot.setAttribute('class', 'player-start-dot');
      dot.setAttribute('r', '0.35');
      dot.setAttribute('fill', '#ff69b4');
      dot.setAttribute('stroke', '#af2c75');
      dot.setAttribute('stroke-width', '0.08');
      const crossA = document.createElementNS(namespace, 'line');
      crossA.setAttribute('class', 'player-start-cross');
      crossA.setAttribute('stroke', '#ffffff');
      crossA.setAttribute('stroke-width', '0.08');
      crossA.setAttribute('stroke-linecap', 'round');
      const crossB = document.createElementNS(namespace, 'line');
      crossB.setAttribute('class', 'player-start-cross');
      crossB.setAttribute('stroke', '#ffffff');
      crossB.setAttribute('stroke-width', '0.08');
      crossB.setAttribute('stroke-linecap', 'round');
      markerGroup.append(dot, crossA, crossB);
      svg.appendChild(markerGroup);
      playerStartElement = markerGroup;
    }
    updatePlayerStartElementGeometry(playerStartElement, metadata.playerStart, padding);

    // Rebuild NPC marker elements from metadata so stale deleted markers never linger.
    svg.querySelectorAll('.npc-start-marker').forEach((element) => {
      element.remove();
    });
    for (const npcSpawn of metadata.npcSpawns) {
      const namespace = 'http://www.w3.org/2000/svg';
      const npcElement = document.createElementNS(namespace, 'g');
      npcElement.setAttribute('class', 'npc-start-marker');
      npcElement.setAttribute('data-id', npcSpawn.id);
      const body = document.createElementNS(namespace, 'rect');
      body.setAttribute('class', 'npc-start-body');
      body.setAttribute('rx', '0.22');
      body.setAttribute('ry', '0.22');
      const head = document.createElementNS(namespace, 'circle');
      head.setAttribute('class', 'npc-start-head');
      npcElement.append(body, head);
      svg.appendChild(npcElement);
      updateNpcStartElementGeometry(npcElement, npcSpawn, padding);
    }
    svg.querySelectorAll('.light-start-marker').forEach((element) => {
      element.remove();
    });
    for (const lightSpawn of metadata.lightSpawns) {
      const namespace = 'http://www.w3.org/2000/svg';
      const lightElement = document.createElementNS(namespace, 'g');
      lightElement.setAttribute('class', 'light-start-marker');
      lightElement.setAttribute('data-id', lightSpawn.id);
      const core = document.createElementNS(namespace, 'circle');
      core.setAttribute('class', 'light-start-core');
      const ring = document.createElementNS(namespace, 'circle');
      ring.setAttribute('class', 'light-start-ring');
      lightElement.append(core, ring);
      svg.appendChild(lightElement);
      updateLightStartElementGeometry(lightElement, lightSpawn, padding);
    }

    const setSelectedNpcMarker = (nextId) => {
      selectedNpcId = nextId;
      svg.querySelectorAll('.npc-start-marker').forEach((element) => {
        const id = element.getAttribute('data-id');
        if (id != null && id === nextId) {
          element.classList.add('is-selected');
        } else {
          element.classList.remove('is-selected');
        }
      });
      if (nextId != null) {
        setStatus('NPC selected. Press Delete or Backspace to remove.', 'info');
      }
      renderNpcListFromMetadata(metadata);
    };
    const setSelectedLightMarker = (nextId) => {
      selectedLightId = nextId;
      svg.querySelectorAll('.light-start-marker').forEach((element) => {
        const id = element.getAttribute('data-id');
        if (id != null && id === nextId) {
          element.classList.add('is-selected');
        } else {
          element.classList.remove('is-selected');
        }
      });
      if (nextId != null) {
        setStatus('Light selected. Press Delete or Backspace to remove.', 'info');
      }
      renderLightListFromMetadata(metadata);
      const selected = nextId == null ? null : lightById.get(nextId) ?? null;
      lightIntensityField.input.disabled = selected == null;
      lightRadiusField.input.disabled = selected == null;
      lightIntensityField.input.value = selected == null ? '1.2' : String((Number(selected.intensity) || 1.2).toFixed(1));
      lightRadiusField.input.value = selected == null ? '7.5' : String((Number(selected.range) || 7.5).toFixed(1));
      lightIntensityField.syncReadout();
      lightRadiusField.syncReadout();
    };
    if (selectedNpcId != null && npcById.has(selectedNpcId)) {
      setSelectedNpcMarker(selectedNpcId);
    } else {
      setSelectedNpcMarker(null);
    }
    if (selectedLightId != null && lightById.has(selectedLightId)) {
      setSelectedLightMarker(selectedLightId);
    } else {
      setSelectedLightMarker(null);
    }
    selectNpcById = (id) => {
      if (!npcById.has(id)) return;
      setSelectedNpcMarker(id);
    };
    selectLightById = (id) => {
      if (!lightById.has(id)) return;
      setSelectedLightMarker(id);
    };

    const updateSelectedLightSettings = () => {
      if (selectedLightId == null) return;
      const selected = lightById.get(selectedLightId);
      if (selected == null) return;
      const intensity = Math.max(
        LIGHT_INTENSITY_MIN,
        Math.min(LIGHT_INTENSITY_MAX, Number(lightIntensityField.input.value) || 1.2)
      );
      const range = Math.max(
        LIGHT_RADIUS_MIN,
        Math.min(LIGHT_RADIUS_MAX, Number(lightRadiusField.input.value) || 7.5)
      );
      selected.intensity = intensity;
      selected.range = range;
      const metadataIndex = metadata.lightSpawns.findIndex((item) => item.id === selectedLightId);
      if (metadataIndex >= 0) {
        metadata.lightSpawns[metadataIndex].intensity = intensity;
        metadata.lightSpawns[metadataIndex].range = range;
      }
      lightIntensityField.input.value = intensity.toFixed(1);
      lightRadiusField.input.value = range.toFixed(1);
      lightIntensityField.syncReadout();
      lightRadiusField.syncReadout();
      persistSvgAndMetadata();
      setStatus('Light settings updated.', 'success');
    };
    lightIntensityField.input.addEventListener('input', updateSelectedLightSettings);
    lightRadiusField.input.addEventListener('input', updateSelectedLightSettings);

    const toSvgCoordinates = (event) => {
      const ctm = svg.getScreenCTM();
      if (ctm == null) return null;
      svgPoint.x = event.clientX;
      svgPoint.y = event.clientY;
      return svgPoint.matrixTransform(ctm.inverse());
    };

    const toViewBoxDelta = (deltaPixelsX, deltaPixelsY) => {
      const rect = svg.getBoundingClientRect();
      const viewBox = parseViewBox(svg);
      if (viewBox == null || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: (deltaPixelsX / rect.width) * viewBox.width,
        y: (deltaPixelsY / rect.height) * viewBox.height,
      };
    };

    const zoomAtPointer = (event) => {
      const point = toSvgCoordinates(event);
      const viewBox = parseViewBox(svg);
      if (point == null || viewBox == null) return;
      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        delta *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        delta *= 240;
      }
      const clampedDelta = Math.max(-120, Math.min(120, delta));
      const zoomFactor = Math.pow(1.0018, clampedDelta);
      const nextWidth = Math.max(minViewBoxWidth, Math.min(maxViewBoxWidth, viewBox.width * zoomFactor));
      const nextHeight = Math.max(minViewBoxHeight, Math.min(maxViewBoxHeight, viewBox.height * zoomFactor));
      if (Math.abs(nextWidth - viewBox.width) < 0.001 && Math.abs(nextHeight - viewBox.height) < 0.001) {
        return;
      }
      const anchorX = (point.x - viewBox.minX) / viewBox.width;
      const anchorY = (point.y - viewBox.minY) / viewBox.height;
      setViewBox(svg, {
        minX: point.x - anchorX * nextWidth,
        minY: point.y - anchorY * nextHeight,
        width: nextWidth,
        height: nextHeight,
      });
    };

    const persistSvgAndMetadata = () => {
      const metadataNode = svg.querySelector('#occult-floorplan-meta');
      if (metadataNode != null) {
        metadataNode.textContent = encodeSvgMetadata(metadata);
      }
      latestSvg = svg.outerHTML;
      window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
      setStatus('Furniture updated.', 'success');
    };

    svg.addEventListener('pointerdown', (event) => {
      const marker = event.target.closest('.player-start-marker');
      const npcMarker = event.target.closest('.npc-start-marker');
      const lightMarker = event.target.closest('.light-start-marker');
      if (marker != null) {
        setSelectedNpcMarker(null);
        setSelectedLightMarker(null);
        return;
      }
      if (npcMarker != null) {
        return;
      }
      if (lightMarker != null) {
        return;
      }
      setSelectedNpcMarker(null);
      setSelectedLightMarker(null);
      const element = event.target.closest('.furniture');
      if (element != null) {
        const id = element.getAttribute('data-id');
        if (id == null) return;
        const item = furnitureById.get(id);
        if (item == null) return;
        const point = toSvgCoordinates(event);
        if (point == null) return;
        dragState = {
          kind: 'furniture',
          id,
          element,
          pointerOffsetX: point.x - (item.x + padding),
          pointerOffsetY: point.y - (item.y + padding),
        };
        element.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      const currentViewBox = parseViewBox(svg);
      if (currentViewBox == null) return;
      dragState = {
        kind: 'pan',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewBox: currentViewBox,
      };
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    svg.addEventListener('pointermove', (event) => {
      if (dragState == null) return;
      const point = toSvgCoordinates(event);
      if (point == null) return;
      if (dragState.kind === 'furniture') {
        const item = furnitureById.get(dragState.id);
        if (item == null) return;
        const halfWidth = item.width / 2;
        const halfDepth = item.depth / 2;
        const candidate = {
          ...item,
          x: Math.max(halfWidth, Math.min(planWidth - halfWidth, point.x - dragState.pointerOffsetX - padding)),
          y: Math.max(halfDepth, Math.min(planHeight - halfDepth, point.y - dragState.pointerOffsetY - padding)),
        }
        const collides = metadata.furniture.some((other) => {
          if (other.id === candidate.id) return false;
          return overlapsAabb(candidate, other);
        });
        if (collides) return;

        item.x = candidate.x;
        item.y = candidate.y;
        updateFurnitureElementGeometry(dragState.element, item, padding);
        return;
      }

      if (dragState.kind === 'playerStart') {
        const candidate = {
          x: clampPlanX(point.x - dragState.pointerOffsetX - padding),
          y: clampPlanY(point.y - dragState.pointerOffsetY - padding),
        };
        metadata.playerStart.x = candidate.x;
        metadata.playerStart.y = candidate.y;
        currentPlayerStart = { x: candidate.x, y: candidate.y };
        persistPlayerStartWorld(currentPlayerStart, metadata, svg);
        updatePlayerStartElementGeometry(dragState.element, metadata.playerStart, padding);
        return;
      }

      if (dragState.kind === 'npcStart') {
        const spawn = npcById.get(dragState.id);
        if (spawn == null) return;
        spawn.x = clampPlanX(point.x - dragState.pointerOffsetX - padding);
        spawn.y = clampPlanY(point.y - dragState.pointerOffsetY - padding);
        const metadataIndex = metadata.npcSpawns.findIndex((item) => item.id === dragState.id);
        if (metadataIndex >= 0) {
          metadata.npcSpawns[metadataIndex].x = spawn.x;
          metadata.npcSpawns[metadataIndex].y = spawn.y;
        }
        updateNpcStartElementGeometry(dragState.element, spawn, padding);
        return;
      }
      if (dragState.kind === 'lightStart') {
        const light = lightById.get(dragState.id);
        if (light == null) return;
        light.x = clampPlanX(point.x - dragState.pointerOffsetX - padding);
        light.y = clampPlanY(point.y - dragState.pointerOffsetY - padding);
        const metadataIndex = metadata.lightSpawns.findIndex((item) => item.id === dragState.id);
        if (metadataIndex >= 0) {
          metadata.lightSpawns[metadataIndex].x = light.x;
          metadata.lightSpawns[metadataIndex].y = light.y;
        }
        updateLightStartElementGeometry(dragState.element, light, padding);
        return;
      }

      if (dragState.kind === 'pan') {
        const delta = toViewBoxDelta(
          event.clientX - dragState.startClientX,
          event.clientY - dragState.startClientY
        );
        if (delta == null) return;
        setViewBox(svg, {
          minX: dragState.startViewBox.minX - delta.x,
          minY: dragState.startViewBox.minY - delta.y,
          width: dragState.startViewBox.width,
          height: dragState.startViewBox.height,
        });
      }
    });

    svg.addEventListener(
      'wheel',
      (event) => {
        if (dragState != null) return;
        event.preventDefault();
        zoomAtPointer(event);
      },
      { passive: false }
    );

    const endDrag = (event) => {
      if (dragState == null) return;
      if (dragState.kind === 'pan') {
        svg.releasePointerCapture(event.pointerId);
      } else {
        dragState.element.releasePointerCapture(event.pointerId);
      }
      dragState = null;
      persistSvgAndMetadata();
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    if (playerStartElement != null) {
      playerStartElement.addEventListener('pointerdown', (event) => {
        const point = toSvgCoordinates(event);
        if (point == null) return;
        dragState = {
          kind: 'playerStart',
          element: playerStartElement,
          pointerOffsetX: point.x - (metadata.playerStart.x + padding),
          pointerOffsetY: point.y - (metadata.playerStart.y + padding),
        };
        playerStartElement.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
    }

    svg.querySelectorAll('.npc-start-marker').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        const point = toSvgCoordinates(event);
        if (point == null) return;
        const id = element.getAttribute('data-id');
        if (id == null) return;
        const spawn = npcById.get(id);
        if (spawn == null) return;
        setSelectedNpcMarker(id);
        dragState = {
          kind: 'npcStart',
          id,
          element,
          pointerOffsetX: point.x - (spawn.x + padding),
          pointerOffsetY: point.y - (spawn.y + padding),
        };
        element.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
    });
    svg.querySelectorAll('.light-start-marker').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        const point = toSvgCoordinates(event);
        if (point == null) return;
        const id = element.getAttribute('data-id');
        if (id == null) return;
        const spawn = lightById.get(id);
        if (spawn == null) return;
        setSelectedLightMarker(id);
        dragState = {
          kind: 'lightStart',
          id,
          element,
          pointerOffsetX: point.x - (spawn.x + padding),
          pointerOffsetY: point.y - (spawn.y + padding),
        };
        element.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
    });

    if (cleanupNpcDeleteListener != null) {
      cleanupNpcDeleteListener();
      cleanupNpcDeleteListener = null;
    }
    deleteSelectedNpc = () => {
      if (selectedNpcId == null) return;
      const nextSpawns = metadata.npcSpawns.filter((item) => item.id !== selectedNpcId);
      if (nextSpawns.length === metadata.npcSpawns.length) return;
      metadata.npcSpawns = nextSpawns;
      selectedNpcId = null;
      persistSvgAndMetadata();
      previewContent.innerHTML = latestSvg;
      bindFurnitureDragging();
      setStatus('NPC placeholder deleted.', 'success');
    };
    deleteSelectedLight = () => {
      if (selectedLightId == null) return;
      const nextSpawns = metadata.lightSpawns.filter((item) => item.id !== selectedLightId);
      if (nextSpawns.length === metadata.lightSpawns.length) return;
      metadata.lightSpawns = nextSpawns;
      selectedLightId = null;
      persistSvgAndMetadata();
      previewContent.innerHTML = latestSvg;
      bindFurnitureDragging();
      setStatus('Light deleted.', 'success');
    };
    const handleNpcDelete = (event) => {
      const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace';
      if (!isDeleteKey) return;
      if (isTypingTarget(event.target)) return;
      const hadNpcSelection = selectedNpcId != null;
      const hadLightSelection = selectedLightId != null;
      if (hadNpcSelection) {
        deleteSelectedNpc();
      } else if (hadLightSelection) {
        deleteSelectedLight();
      }
      if (hadNpcSelection || hadLightSelection) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleNpcDelete);
    cleanupNpcDeleteListener = () => {
      window.removeEventListener('keydown', handleNpcDelete);
    };
  }

  function setStatus(nextText, type = 'info') {
    status.textContent = nextText;
    status.dataset.state = type;
  }

  function preserveViewerViewBoxIfCompatible(nextSvgRoot) {
    const currentSvg = previewContent.querySelector('svg');
    if (currentSvg == null) return;
    const currentViewBox = parseViewBox(currentSvg);
    const currentBaseViewBox = readBaseViewBox(currentSvg);
    const nextBaseViewBox = parseViewBox(nextSvgRoot);
    if (currentViewBox == null || currentBaseViewBox == null || nextBaseViewBox == null) return;
    const sameBaseSize =
      Math.abs(currentBaseViewBox.width - nextBaseViewBox.width) < 0.001 &&
      Math.abs(currentBaseViewBox.height - nextBaseViewBox.height) < 0.001;
    if (!sameBaseSize) return;
    setViewBox(nextSvgRoot, currentViewBox);
  }

  function setGeneratingState(isGenerating) {
    previewPanel.classList.toggle('is-generating', isGenerating);
    previewPanel.setAttribute('aria-busy', isGenerating ? 'true' : 'false');
    previewLoadingOverlay.hidden = !isGenerating;
    regenerateButton.disabled = isGenerating;
    openStageButton.disabled = isGenerating;
  }

  async function generateAndRender(advanceSeed = false) {
    const generationStartTime = performance.now();
    setStatus('Generating hallway...', 'loading');
    setGeneratingState(true);
    await waitForUiPaint();
    const rawSeed = readPositiveInt(seedField.input, Date.now());
    const seed = advanceSeed ? createRandomHashedSeed() : rawSeed;
    seedField.input.value = String(seed);
    const width = readPositiveInt(widthField.input, 36);
    const height = readPositiveInt(heightField.input, 24);
    const hallwayCount = readPositiveInt(hallwayCountField.input, 1);
    const requestedRoomCount = readPositiveInt(doorCountField.input, 6);
    const requestedWindowCount = readPositiveInt(maxWindowCountField.input, 8);
    const requestedLightCount = readBoundedInt(maxLightCountField.input, 10, 0, 80);
    const roomShapeStyle = readBoundedInt(roomShapeStyleField.input, 45, 0, 100);

    try {
      const plan = generateFloorPlan({
        seed,
        width,
        height,
        hallwayCount,
        doorCount: requestedRoomCount,
        maxWindowCount: requestedWindowCount,
        maxLightCount: requestedLightCount,
        roomShapeStyle,
        strictDoorCount: false,
        requireExteriorExits: false,
      });
      const usedRoomCount = plan.meta.placedDoorCount;

      const savedSvg = window.localStorage.getItem(LATEST_PLAN_STORAGE_KEY);
      let npcSpawns = [];
      if (savedSvg != null && savedSvg.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = savedSvg;
        const savedRoot = wrapper.querySelector('svg');
        const savedMetadata = savedRoot == null ? null : decodeSvgMetadata(savedRoot);
        if (Array.isArray(savedMetadata?.npcSpawns)) {
          npcSpawns = savedMetadata.npcSpawns
            .map((item, index) => ({
              id: item.id ?? `npc-${index + 1}`,
              x: Number(item.x),
              y: Number(item.y),
            }))
            .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
        }
      }

      const playerStart = resolvePlayerStartWithinPlan(currentPlayerStart, width, height);
      currentPlayerStart = playerStart;
      const svgMarkup = renderFloorPlanSvg(plan, {
        playerStart,
        npcSpawns,
        lightSpawns: plan.lightSpawns ?? [],
      });
      const svgWrapper = document.createElement('div');
      svgWrapper.innerHTML = svgMarkup;
      const svgRoot = svgWrapper.querySelector('svg');
      if (svgRoot == null) {
        throw new Error('Generated SVG is invalid.');
      }
      const nextBaseViewBoxRaw = svgRoot.getAttribute('viewBox');
      if (nextBaseViewBoxRaw != null) {
        svgRoot.setAttribute('data-base-viewbox', nextBaseViewBoxRaw);
      }
      preserveViewerViewBoxIfCompatible(svgRoot);
      latestSvg = svgRoot.outerHTML;
      window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
      previewContent.innerHTML = latestSvg;
      const statsText =
        `Hallways: ${plan.meta.hallwayCount} · Walls: ${plan.walls.length} · ` +
        `Rooms: ${plan.meta.placedDoorCount}/${requestedRoomCount} · ` +
        `Windows: ${plan.meta.windowCount}/${requestedWindowCount} · ` +
        `Lights: ${plan.meta.lightCount}/${requestedLightCount}`;
      stats.textContent = statsText;
      window.localStorage.setItem(
        FLOOR_PLAN_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          seed,
          width,
          height,
          hallwayCount,
          doorCount: requestedRoomCount,
          maxWindowCount: requestedWindowCount,
          maxLightCount: requestedLightCount,
          roomShapeStyle,
          statsText,
        })
      );
      bindFurnitureDragging();
      if (!plan.meta.hasExteriorExit) {
        setStatus(
          `Hallway generated with ${usedRoomCount} rooms, but fewer than 2 exterior exits were available.`,
          'info'
        );
      } else if (usedRoomCount !== requestedRoomCount) {
        setStatus(
          `Hallway generated. Room count adjusted to ${usedRoomCount} for this map size.`,
          'success'
        );
      } else {
        setStatus('Hallway generated.', 'success');
      }
    } catch (error) {
      setStatus(
        `Could not generate a hallway: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      const elapsedMs = performance.now() - generationStartTime;
      const remainingMs = Math.max(0, MIN_GENERATE_SPINNER_MS - elapsedMs);
      if (remainingMs > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, remainingMs);
        });
      }
      setGeneratingState(false);
    }
  }

  regenerateButton.addEventListener('click', () => {
    generateAndRender(false);
  });
  randomSeedButton.addEventListener('click', () => {
    seedField.input.value = String(createRandomHashedSeed());
    generateAndRender(false);
  });
  deleteNpcButton.addEventListener('click', () => {
    if (deleteSelectedNpc == null) {
      setStatus('Generate a hallway first.', 'error');
      return;
    }
    if (selectedNpcId == null) {
      setStatus('Select an NPC from the list first.', 'error');
      return;
    }
    deleteSelectedNpc();
  });
  deleteLightButton.addEventListener('click', () => {
    if (deleteSelectedLight == null) {
      setStatus('Generate a hallway first.', 'error');
      return;
    }
    if (selectedLightId == null) {
      setStatus('Select a light from the list first.', 'error');
      return;
    }
    deleteSelectedLight();
  });
  deleteAllNpcButton.addEventListener('click', () => {
    const svg = previewContent.querySelector('svg');
    if (svg == null) {
      setStatus('Generate a hallway first.', 'error');
      return;
    }
    const metadata = decodeSvgMetadata(svg);
    if (metadata == null || !Array.isArray(metadata.npcSpawns)) {
      setStatus('No NPC placeholders to delete.', 'info');
      return;
    }
    if (metadata.npcSpawns.length === 0) {
      setStatus('No NPC placeholders to delete.', 'info');
      return;
    }
    metadata.npcSpawns = [];
    const metadataNode = svg.querySelector('#occult-floorplan-meta');
    if (metadataNode != null) {
      metadataNode.textContent = encodeSvgMetadata(metadata);
    }
    selectedNpcId = null;
    latestSvg = svg.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
    previewContent.innerHTML = latestSvg;
    bindFurnitureDragging();
    setStatus('All NPC placeholders deleted.', 'success');
  });
  deleteAllLightsButton.addEventListener('click', () => {
    const svg = previewContent.querySelector('svg');
    if (svg == null) {
      setStatus('Generate a hallway first.', 'error');
      return;
    }
    const metadata = decodeSvgMetadata(svg);
    if (metadata == null || !Array.isArray(metadata.lightSpawns)) {
      setStatus('No lights to delete.', 'info');
      return;
    }
    if (metadata.lightSpawns.length === 0) {
      setStatus('No lights to delete.', 'info');
      return;
    }
    metadata.lightSpawns = [];
    const metadataNode = svg.querySelector('#occult-floorplan-meta');
    if (metadataNode != null) {
      metadataNode.textContent = encodeSvgMetadata(metadata);
    }
    selectedLightId = null;
    latestSvg = svg.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
    previewContent.innerHTML = latestSvg;
    bindFurnitureDragging();
    setStatus('All lights deleted.', 'success');
  });
  addNpcButton.addEventListener('click', () => {
    const svg = previewContent.querySelector('svg');
    if (svg == null) {
      setStatus('Generate a hallway before adding NPC placeholders.', 'error');
      return;
    }
    const metadata = decodeSvgMetadata(svg);
    if (metadata == null) {
      setStatus('Could not read floor plan metadata.', 'error');
      return;
    }
    if (!Array.isArray(metadata.npcSpawns)) {
      metadata.npcSpawns = [];
    }
    const viewBox = parseViewBox(svg);
    const padding = Number(metadata.padding) || 0;
    const planWidth = viewBox == null ? 0 : Math.max(0, viewBox.width - padding * 2);
    const planHeight = viewBox == null ? 0 : Math.max(0, viewBox.height - padding * 2);
    const id = `npc-${metadata.npcSpawns.length + 1}`;
    const seedOffset = metadata.npcSpawns.length * 0.6;
    const spawn = {
      id,
      x: Math.max(0, Math.min(planWidth, planWidth * 0.5 + seedOffset)),
      y: Math.max(0, Math.min(planHeight, planHeight * 0.5 + seedOffset)),
    };
    metadata.npcSpawns.push(spawn);
    const metadataNode = svg.querySelector('#occult-floorplan-meta');
    if (metadataNode != null) {
      metadataNode.textContent = encodeSvgMetadata(metadata);
    }
    latestSvg = svg.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
    previewContent.innerHTML = latestSvg;
    bindFurnitureDragging();
    setStatus('NPC placeholder added.', 'success');
  });
  addLightButton.addEventListener('click', () => {
    const svg = previewContent.querySelector('svg');
    if (svg == null) {
      setStatus('Generate a hallway before adding lights.', 'error');
      return;
    }
    const metadata = decodeSvgMetadata(svg);
    if (metadata == null) {
      setStatus('Could not read floor plan metadata.', 'error');
      return;
    }
    if (!Array.isArray(metadata.lightSpawns)) {
      metadata.lightSpawns = [];
    }
    const viewBox = parseViewBox(svg);
    const padding = Number(metadata.padding) || 0;
    const planWidth = viewBox == null ? 0 : Math.max(0, viewBox.width - padding * 2);
    const planHeight = viewBox == null ? 0 : Math.max(0, viewBox.height - padding * 2);
    const id = `light-${metadata.lightSpawns.length + 1}`;
    const seedOffset = metadata.lightSpawns.length * 0.5;
    const spawn = {
      id,
      x: Math.max(0, Math.min(planWidth, planWidth * 0.5 + seedOffset)),
      y: Math.max(0, Math.min(planHeight, planHeight * 0.5 + seedOffset)),
      height: 2.35,
      intensity: 1.2,
      range: 7.5,
      color: '#ffe8b8',
    };
    metadata.lightSpawns.push(spawn);
    const metadataNode = svg.querySelector('#occult-floorplan-meta');
    if (metadataNode != null) {
      metadataNode.textContent = encodeSvgMetadata(metadata);
    }
    latestSvg = svg.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
    previewContent.innerHTML = latestSvg;
    bindFurnitureDragging();
    setStatus('Light added.', 'success');
  });
  saveSvgButton.addEventListener('click', () => {
    if (latestSvg.length === 0) {
      setStatus('Generate a plan before saving.', 'error');
      return;
    }

    const seed = readPositiveInt(seedField.input, Date.now());
    const blob = new Blob([latestSvg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `hallway-plan-seed-${seed}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus('SVG downloaded. You can import it on the stage route.', 'success');
  });
  openStageButton.addEventListener('click', () => {
    if (latestSvg.length === 0) {
      setStatus('Generate a plan before opening stage preview.', 'error');
      return;
    }
    window.location.href = withBasePath('/stage-preview?source=latest');
  });

  page.append(header, controls, npcPanel, previewPanel);
  containerElement.append(page);

  const savedSvg = window.localStorage.getItem(LATEST_PLAN_STORAGE_KEY);
  if (savedSvg != null && savedSvg.length > 0) {
    latestSvg = savedSvg;
    previewContent.innerHTML = savedSvg;
    const savedSvgRoot = previewContent.querySelector('svg');
    if (savedSvgRoot != null && savedSvgRoot.getAttribute('data-base-viewbox') == null) {
      const baseRaw = savedSvgRoot.getAttribute('viewBox');
      if (baseRaw != null) {
        savedSvgRoot.setAttribute('data-base-viewbox', baseRaw);
        latestSvg = savedSvgRoot.outerHTML;
        window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestSvg);
      }
    }
    const savedSvgMetadata = savedSvgRoot == null ? null : decodeSvgMetadata(savedSvgRoot);
    if (
      savedSvgMetadata?.playerStart != null &&
      Number.isFinite(Number(savedSvgMetadata.playerStart.x)) &&
      Number.isFinite(Number(savedSvgMetadata.playerStart.y))
    ) {
      currentPlayerStart = {
        x: Number(savedSvgMetadata.playerStart.x),
        y: Number(savedSvgMetadata.playerStart.y),
      };
      persistPlayerStartWorld(currentPlayerStart, savedSvgMetadata, savedSvgRoot);
    }
    stats.textContent = savedSettings?.statsText ?? '';
    bindFurnitureDragging();
    renderNpcListFromCurrentSvg();
    setStatus('Loaded previous plan.', 'success');
  } else {
    generateAndRender();
    renderNpcListFromCurrentSvg();
  }
}
