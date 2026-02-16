/**
 * SVG-to-stage route: imports floor-plan SVG and builds a 3D stage.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { parseFloorPlanSvg, buildStageGroup } from './stageModel.js';
import { decodeSvgMetadata, encodeSvgMetadata } from '../shared/svgMetadata.js';

const LATEST_PLAN_STORAGE_KEY = 'occultShooter.latestFloorPlanSvg';
const LATEST_PLAYER_START_STORAGE_KEY = 'occultShooter.latestFloorPlanPlayerStart';
const START_MARKER_HEIGHT = 1.5;
const START_MARKER_RADIUS = 0.25;
const START_MARKER_MARGIN = 0.4;
const FURNITURE_CLEARANCE = 0.25;
const PLAYER_START_COLOR = 0xff69b4;
const NPC_PREVIEW_COLOR = 0x7dc5ff;
const NPC_PREVIEW_SELECTED_COLOR = 0xffd76e;
const PREVIEW_FAST_MODE_COMPLEXITY_THRESHOLD = 700;
const PANEL_COLLAPSE_STORAGE_KEY = 'occultShooter.stagePreviewPanelCollapseState';

function mountRenderer(containerElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
  renderer.shadowMap.enabled = false;
  containerElement.appendChild(renderer.domElement);
  return renderer;
}

function computePreviewComplexity(stageData) {
  const wallCount = Array.isArray(stageData?.walls) ? stageData.walls.length : 0;
  const doorCount = Array.isArray(stageData?.doors) ? stageData.doors.length : 0;
  const windowCount = Array.isArray(stageData?.windows) ? stageData.windows.length : 0;
  const furnitureCount = Array.isArray(stageData?.furniture) ? stageData.furniture.length : 0;
  const roofCellCount = Array.isArray(stageData?.roofCells) ? stageData.roofCells.length : 0;
  return wallCount + doorCount + windowCount * 2 + furnitureCount + roofCellCount * 0.2;
}

function computeFogRangeForStage(stageData) {
  const maxDimension = Math.max(stageData.width, stageData.height);
  const near = Math.max(40, maxDimension * 1.15);
  const far = Math.max(180, maxDimension * 3.4);
  return { near, far };
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

function overlapsFurniture(a, b) {
  const axMin = a.x - a.width / 2 - FURNITURE_CLEARANCE;
  const axMax = a.x + a.width / 2 + FURNITURE_CLEARANCE;
  const azMin = a.z - a.depth / 2 - FURNITURE_CLEARANCE;
  const azMax = a.z + a.depth / 2 + FURNITURE_CLEARANCE;
  const bxMin = b.x - b.width / 2 - FURNITURE_CLEARANCE;
  const bxMax = b.x + b.width / 2 + FURNITURE_CLEARANCE;
  const bzMin = b.z - b.depth / 2 - FURNITURE_CLEARANCE;
  const bzMax = b.z + b.depth / 2 + FURNITURE_CLEARANCE;
  return axMin < bxMax && axMax > bxMin && azMin < bzMax && azMax > bzMin;
}

export function mountStageFromSvgRoute(containerElement) {
  containerElement.className = 'planner-root';
  containerElement.replaceChildren();

  const page = document.createElement('main');
  page.className = 'stage-page';

  const controls = document.createElement('section');
  controls.className = 'plan-controls';
  controls.setAttribute('aria-label', 'SVG stage preview controls');
  controls.innerHTML = `
    <h1>Stage Preview</h1>
    <p>Import a floor-plan SVG to preview matching 3D walls, doors, and windows.</p>
    <p><a href="/floor-plan">Back to floor planner</a> · <a href="/">Main menu</a></p>
  `;

  const fileLabel = document.createElement('label');
  fileLabel.className = 'plan-control';
  fileLabel.textContent = 'Floor plan SVG file';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,image/svg+xml';
  fileLabel.appendChild(fileInput);

  const testFpsButton = document.createElement('button');
  testFpsButton.type = 'button';
  testFpsButton.className = 'plan-randomize stage-play-button';
  testFpsButton.textContent = '';
  testFpsButton.setAttribute('aria-label', 'Play test with FPS controller');
  testFpsButton.title = 'Play test with FPS controller';

  const exportGlbButton = document.createElement('button');
  exportGlbButton.type = 'button';
  exportGlbButton.className = 'plan-download';
  exportGlbButton.textContent = 'Save GLB';

  const backToPlannerButton = document.createElement('button');
  backToPlannerButton.type = 'button';
  backToPlannerButton.className = 'plan-download';
  backToPlannerButton.textContent = 'Back to floor plan generator';

  const npcPanel = document.createElement('section');
  npcPanel.className = 'stage-npc-panel';
  npcPanel.setAttribute('aria-label', 'NPC spawn panel');

  const npcPanelTitle = document.createElement('h2');
  npcPanelTitle.className = 'stage-npc-title';
  npcPanelTitle.textContent = 'NPC spawns';

  const npcList = document.createElement('ul');
  npcList.className = 'stage-npc-list';

  const deleteNpcButton = document.createElement('button');
  deleteNpcButton.type = 'button';
  deleteNpcButton.className = 'plan-download stage-delete-npc';
  deleteNpcButton.textContent = 'Delete selected NPC';
  const addNpcButton = document.createElement('button');
  addNpcButton.type = 'button';
  addNpcButton.className = 'plan-download stage-delete-npc';
  addNpcButton.textContent = 'Add NPC placeholder';
  const deleteAllNpcButton = document.createElement('button');
  deleteAllNpcButton.type = 'button';
  deleteAllNpcButton.className = 'plan-download stage-delete-npc';
  deleteAllNpcButton.textContent = 'Delete all NPCs';

  const panelInfo = document.createElement('div');
  panelInfo.className = 'stage-panel-info';

  const startReadout = document.createElement('p');
  startReadout.className = 'stage-start-readout';
  startReadout.textContent = 'Player start: x 0.00, z 0.00 (drag the pink capsule)';

  controls.append(fileLabel, testFpsButton, backToPlannerButton, startReadout);

  const status = document.createElement('p');
  status.className = 'plan-status';
  status.setAttribute('aria-live', 'polite');

  const stats = document.createElement('p');
  stats.className = 'plan-stats';

  panelInfo.append(status, stats);
  npcPanel.append(
    exportGlbButton,
    npcPanelTitle,
    npcList,
    addNpcButton,
    deleteNpcButton,
    deleteAllNpcButton,
    panelInfo
  );
  const collapseState = readPanelCollapseState();
  attachPanelTab(controls, {
    edge: 'left',
    label: 'Toggle stage preview controls panel',
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
    label: 'Toggle stage preview NPC panel',
    collapsed: collapseState.npcCollapsed === true,
    onChange: (collapsed) => {
      writePanelCollapseState({
        ...readPanelCollapseState(),
        npcCollapsed: collapsed,
      });
    },
  });

  const viewport = document.createElement('section');
  viewport.className = 'stage-viewport';
  viewport.setAttribute('aria-label', '3D stage preview');

  page.append(controls, npcPanel, viewport);
  containerElement.append(page);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d141e);
  scene.fog = new THREE.Fog(0x0d141e, 40, 120);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
  camera.position.set(0, 42, 38);

  const renderer = mountRenderer(viewport);
  const controls3d = new OrbitControls(camera, renderer.domElement);
  controls3d.enableDamping = true;
  controls3d.target.set(0, 0, 0);
  controls3d.update();
  renderer.domElement.style.cursor = 'grab';

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(24, 36, 18);
  directional.castShadow = false;
  scene.add(directional);
  scene.add(new THREE.GridHelper(200, 40, 0x32475f, 0x233345));

  let stageGroup = new THREE.Group();
  let npcPreviewGroup = new THREE.Group();
  npcPreviewGroup.name = 'npc-preview-group';
  let latestLoadedSvg = '';
  let latestStageData = null;
  let isDraggingStart = false;
  let draggingFurnitureId = null;
  let draggingFurnitureMetaIndex = null;
  let draggingNpcSpawnId = null;
  let draggingNpcSpawnIndex = null;
  let draggingNpcMarker = null;
  let selectedNpcSpawnId = null;
  let selectedNpcSpawnIndex = null;
  const startPosition = new THREE.Vector3(0, START_MARKER_HEIGHT / 2, 0);
  scene.add(stageGroup);
  scene.add(npcPreviewGroup);

  const playerStartMarker = new THREE.Group();
  playerStartMarker.name = 'player-start-marker';
  const startBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(START_MARKER_RADIUS, START_MARKER_HEIGHT - START_MARKER_RADIUS * 2, 6, 12),
    new THREE.MeshStandardMaterial({ color: PLAYER_START_COLOR, roughness: 0.35, metalness: 0.05 })
  );
  startBody.castShadow = true;
  playerStartMarker.add(startBody);
  const startRing = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: PLAYER_START_COLOR, side: THREE.DoubleSide })
  );
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.y = 0.02;
  playerStartMarker.add(startRing);
  playerStartMarker.position.copy(startPosition);
  scene.add(playerStartMarker);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPoint = new THREE.Vector3();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function readSavedPlayerStart() {
    const raw = window.localStorage.getItem(LATEST_PLAYER_START_STORAGE_KEY);
    if (raw == null) return null;
    try {
      const parsed = JSON.parse(raw);
      const x = Number(parsed?.x);
      const z = Number(parsed?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return null;
      }
      return { x, z };
    } catch {
      return null;
    }
  }

  function clampToStageBounds(position, stageData) {
    const halfWidth = stageData.width / 2;
    const halfHeight = stageData.height / 2;
    return {
      x: Math.max(-halfWidth + START_MARKER_MARGIN, Math.min(halfWidth - START_MARKER_MARGIN, position.x)),
      z: Math.max(-halfHeight + START_MARKER_MARGIN, Math.min(halfHeight - START_MARKER_MARGIN, position.z)),
    };
  }

  function clampFurnitureToStageBounds(position, dimensions, stageData) {
    const halfWidth = stageData.width / 2;
    const halfHeight = stageData.height / 2;
    const halfItemW = dimensions.width / 2;
    const halfItemD = dimensions.depth / 2;
    return {
      x: Math.max(-halfWidth + halfItemW, Math.min(halfWidth - halfItemW, position.x)),
      z: Math.max(-halfHeight + halfItemD, Math.min(halfHeight - halfItemD, position.z)),
    };
  }

  function updateStartReadout() {
    startReadout.textContent = `Player start: x ${startPosition.x.toFixed(2)}, z ${startPosition.z.toFixed(2)} (drag the pink capsule)`;
  }

  function persistStartPosition() {
    const payload = JSON.stringify({ x: startPosition.x, z: startPosition.z });
    window.localStorage.setItem(LATEST_PLAYER_START_STORAGE_KEY, payload);
  }

  function persistPlayerStartToSvg() {
    if (latestStageData == null) return;
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(latestLoadedSvg, 'image/svg+xml');
    const svgElement = documentNode.querySelector('svg');
    if (svgElement == null) return;
    const metadata = decodeSvgMetadata(svgElement);
    if (metadata == null) return;
    const padding = Number(metadata.padding) || 0;
    metadata.playerStart = {
      x: startPosition.x + latestStageData.width / 2 - padding,
      y: startPosition.z + latestStageData.height / 2 - padding,
    };
    const metadataNode = svgElement.querySelector('#occult-floorplan-meta');
    if (metadataNode == null) return;
    metadataNode.textContent = encodeSvgMetadata(metadata);
    latestLoadedSvg = svgElement.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestLoadedSvg);
  }

  function setStartPosition(position, shouldPersist = true) {
    if (latestStageData != null) {
      const clamped = clampToStageBounds(position, latestStageData);
      startPosition.set(clamped.x, START_MARKER_HEIGHT / 2, clamped.z);
    } else {
      startPosition.set(position.x, START_MARKER_HEIGHT / 2, position.z);
    }
    playerStartMarker.position.copy(startPosition);
    updateStartReadout();
    if (shouldPersist) {
      persistStartPosition();
      persistPlayerStartToSvg();
    }
  }

  function persistFurnitureToSvg(furnitureId, furnitureMetaIndex, position) {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(latestLoadedSvg, 'image/svg+xml');
    const svgElement = documentNode.querySelector('svg');
    if (svgElement == null) return;
    const metadata = decodeSvgMetadata(svgElement);
    if (metadata == null || !Array.isArray(metadata.furniture)) return;
    const target =
      metadata.furniture.find((item) => item.id === furnitureId) ??
      (Number.isInteger(furnitureMetaIndex) ? metadata.furniture[furnitureMetaIndex] : null);
    if (target == null || latestStageData == null) return;

    const padding = Number(metadata.padding) || 0;
    target.x = position.x + latestStageData.width / 2 - padding;
    target.y = position.z + latestStageData.height / 2 - padding;
    const metadataNode = svgElement.querySelector('#occult-floorplan-meta');
    if (metadataNode == null) return;
    metadataNode.textContent = encodeSvgMetadata(metadata);
    latestLoadedSvg = svgElement.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestLoadedSvg);
  }

  function persistNpcSpawnToSvg(npcId, npcIndex, position) {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(latestLoadedSvg, 'image/svg+xml');
    const svgElement = documentNode.querySelector('svg');
    if (svgElement == null) return;
    const metadata = decodeSvgMetadata(svgElement);
    if (metadata == null || !Array.isArray(metadata.npcSpawns) || latestStageData == null) return;
    const target =
      metadata.npcSpawns.find((item) => item.id === npcId) ??
      (Number.isInteger(npcIndex) ? metadata.npcSpawns[npcIndex] : null);
    if (target == null) return;

    const padding = Number(metadata.padding) || 0;
    target.x = position.x + latestStageData.width / 2 - padding;
    target.y = position.z + latestStageData.height / 2 - padding;
    const metadataNode = svgElement.querySelector('#occult-floorplan-meta');
    if (metadataNode == null) return;
    metadataNode.textContent = encodeSvgMetadata(metadata);
    latestLoadedSvg = svgElement.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestLoadedSvg);
  }

  function persistNpcSpawnsToSvg() {
    if (latestStageData == null) return;
    normalizeNpcSpawns(latestStageData);
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(latestLoadedSvg, 'image/svg+xml');
    const svgElement = documentNode.querySelector('svg');
    if (svgElement == null) return;
    const metadata = decodeSvgMetadata(svgElement);
    if (metadata == null) return;
    const padding = Number(metadata.padding) || 0;
    const npcSpawns = Array.isArray(latestStageData.npcSpawns) ? latestStageData.npcSpawns : [];
    metadata.npcSpawns = npcSpawns.map((item, index) => ({
      id: item.id ?? `npc-${index + 1}`,
      x: item.x + latestStageData.width / 2 - padding,
      y: item.z + latestStageData.height / 2 - padding,
    }));
    const metadataNode = svgElement.querySelector('#occult-floorplan-meta');
    if (metadataNode == null) return;
    metadataNode.textContent = encodeSvgMetadata(metadata);
    latestLoadedSvg = svgElement.outerHTML;
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestLoadedSvg);
  }

  function pointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function setStatus(message, state = 'info') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function disposeMeshResources(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }

  function exportStageToGlb(stageData) {
    const runtimeGroup = buildStageGroup(stageData, { mode: 'runtime' });
    const playerStartNode = new THREE.Object3D();
    playerStartNode.name = 'player-start';
    playerStartNode.position.set(startPosition.x, 0, startPosition.z);
    runtimeGroup.add(playerStartNode);
    const npcSpawns = Array.isArray(stageData.npcSpawns) ? stageData.npcSpawns : [];
    npcSpawns.forEach((spawn, index) => {
      const npcNode = new THREE.Object3D();
      npcNode.name = `npc-spawn-${index + 1}`;
      npcNode.position.set(Number(spawn.x) || 0, 0, Number(spawn.z) || 0);
      runtimeGroup.add(npcNode);
    });
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
      exporter.parse(
        runtimeGroup,
        (result) => {
          disposeMeshResources(runtimeGroup);
          if (result instanceof ArrayBuffer) {
            resolve(result);
            return;
          }
          reject(new Error('GLB export did not return binary data.'));
        },
        (error) => {
          disposeMeshResources(runtimeGroup);
          reject(error instanceof Error ? error : new Error('GLB export failed.'));
        },
        { binary: true, onlyVisible: true }
      );
    });
  }

  function updateStats(stageData) {
    const npcCount = Array.isArray(stageData.npcSpawns) ? stageData.npcSpawns.length : 0;
    const seedText = Number.isFinite(Number(stageData.seed)) ? `Seed: ${Number(stageData.seed)} · ` : '';
    stats.textContent =
      `${seedText}Walls: ${stageData.walls.length} · Doors: ${stageData.doors.length} · ` +
      `Windows: ${stageData.windows.length} · NPC spawns: ${npcCount}`;
  }

  function renderNpcList() {
    npcList.replaceChildren();
    const spawns = Array.isArray(latestStageData?.npcSpawns) ? latestStageData.npcSpawns : [];
    if (spawns.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'stage-npc-empty';
      empty.textContent = 'No NPC spawns in this stage.';
      npcList.appendChild(empty);
      return;
    }

    spawns.forEach((spawn, index) => {
      const item = document.createElement('li');
      item.className = 'stage-npc-item';
      const spawnId = spawn.id ?? `npc-${index + 1}`;
      const selected =
        (selectedNpcSpawnId != null && selectedNpcSpawnId === spawnId) ||
        (selectedNpcSpawnIndex != null && selectedNpcSpawnIndex === index);
      if (selected) {
        item.classList.add('is-selected');
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-npc-select';
      button.textContent = `${spawnId} (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)})`;
      button.addEventListener('click', () => {
        setSelectedNpcMarker(spawnId, index);
      });
      item.appendChild(button);
      npcList.appendChild(item);
    });
  }

  function normalizeNpcSpawns(stageData) {
    const source = Array.isArray(stageData?.npcSpawns) ? stageData.npcSpawns : [];
    const idCounts = new Map();
    const normalized = [];
    for (let index = 0; index < source.length; index++) {
      const item = source[index];
      const x = Number(item?.x);
      const z = Number(item?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const rawId = String(item?.id ?? `npc-${index + 1}`);
      const nextCount = (idCounts.get(rawId) ?? 0) + 1;
      idCounts.set(rawId, nextCount);
      const uniqueId = nextCount === 1 ? rawId : `${rawId}-${nextCount}`;
      normalized.push({ id: uniqueId, x, z });
    }
    stageData.npcSpawns = normalized;
  }

  function setSelectedNpcMarker(id, index) {
    selectedNpcSpawnId = id;
    selectedNpcSpawnIndex = index;
    npcPreviewGroup.children.forEach((marker) => {
      if (marker.userData?.kind !== 'npcSpawn') return;
      const matchesId = id != null && marker.userData.id === id;
      const matchesIndex = index != null && marker.userData.index === index;
      const selected = matchesId || matchesIndex;
      marker.scale.setScalar(selected ? 1.22 : 1);
      const body = marker.getObjectByName('npc-body');
      const ring = marker.getObjectByName('npc-ring');
      if (body?.material?.color != null) {
        body.material.color.setHex(selected ? NPC_PREVIEW_SELECTED_COLOR : NPC_PREVIEW_COLOR);
      }
      if (ring?.material?.color != null) {
        ring.material.color.setHex(selected ? NPC_PREVIEW_SELECTED_COLOR : NPC_PREVIEW_COLOR);
      }
    });
    if (id != null || index != null) {
      setStatus('NPC selected. Press Delete or Backspace to remove.', 'info');
    }
    renderNpcList();
  }

  function readNpcSpawnUserDataFromObject(object3d) {
    let current = object3d;
    while (current != null) {
      if (current.userData?.kind === 'npcSpawn' && current.isGroup === true) {
        return {
          marker: current,
          id: current.userData.id ?? null,
          index: Number.isFinite(Number(current.userData.index))
            ? Number(current.userData.index)
            : null,
        };
      }
      current = current.parent ?? null;
    }
    return null;
  }

  function buildNpcPreviewGroup(stageData) {
    const group = new THREE.Group();
    group.name = 'npc-preview-group';
    const npcSpawns = Array.isArray(stageData.npcSpawns) ? stageData.npcSpawns : [];
    if (npcSpawns.length === 0) {
      return group;
    }

    npcSpawns.forEach((spawn, spawnIndex) => {
      const marker = new THREE.Group();
      const markerId = spawn.id ?? `npc-${spawnIndex + 1}`;
      marker.name = `npc-preview-${markerId}`;
      marker.userData = {
        kind: 'npcSpawn',
        id: markerId,
        index: spawnIndex,
      };

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.25, 1.0, 6, 12),
        new THREE.MeshStandardMaterial({
          color: NPC_PREVIEW_COLOR,
          roughness: 0.35,
          metalness: 0.05,
        })
      );
      body.name = 'npc-body';
      body.position.y = 0.75;
      body.castShadow = true;
      marker.add(body);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.5, 24),
        new THREE.MeshBasicMaterial({
          color: NPC_PREVIEW_COLOR,
          side: THREE.DoubleSide,
        })
      );
      ring.name = 'npc-ring';
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      marker.add(ring);

      marker.position.set(spawn.x, 0, spawn.z);
      group.add(marker);
    });

    return group;
  }

  function fitCamera() {
    const bounds = new THREE.Box3().setFromObject(stageGroup);
    const sphere = new THREE.Sphere();
    bounds.getBoundingSphere(sphere);
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (viewportWidth > 0 && viewportHeight > 0) {
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    }
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(1e-3, camera.aspect || 1);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    const distanceByWidth = sphere.radius / Math.sin(hFovRad / 2);
    const distanceByHeight = sphere.radius / Math.sin(vFovRad / 2);
    const distance = Math.max(90, distanceByWidth, distanceByHeight) * 1.45;

    const viewDirection = new THREE.Vector3(0.42, 0.7, 0.62).normalize();
    const targetX = sphere.center.x;
    const targetY = sphere.center.y;
    const targetZ = sphere.center.z;
    camera.position.set(
      targetX + viewDirection.x * distance,
      targetY + viewDirection.y * distance,
      targetZ + viewDirection.z * distance
    );
    controls3d.target.set(targetX, targetY, targetZ);
    controls3d.minDistance = Math.max(40, distance * 0.45);
    controls3d.maxDistance = Math.max(280, distance * 3.4);
    const maxDimension = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    const fogRange = {
      near: Math.max(42, maxDimension * 1.12),
      far: Math.max(210, maxDimension * 3.5),
    };
    if (scene.fog != null) {
      scene.fog.near = fogRange.near;
      scene.fog.far = fogRange.far;
    }
    controls3d.update();
  }

  function loadStageFromSvg(svgText) {
    setStatus('Parsing SVG and generating stage...', 'loading');
    try {
      const stageData = parseFloorPlanSvg(svgText);
      const previewComplexity = computePreviewComplexity(stageData);
      const useFastPreview = previewComplexity >= PREVIEW_FAST_MODE_COMPLEXITY_THRESHOLD;
      normalizeNpcSpawns(stageData);
      latestStageData = stageData;
      latestLoadedSvg = svgText;
      window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, svgText);
      scene.remove(stageGroup);
      disposeMeshResources(stageGroup);

      stageGroup = buildStageGroup(stageData, {
        mode: 'preview',
        includeLandscape: false,
        includeTrees: false,
        includeWindowGlass: !useFastPreview,
      });
      scene.add(stageGroup);
      scene.remove(npcPreviewGroup);
      disposeMeshResources(npcPreviewGroup);
      npcPreviewGroup = buildNpcPreviewGroup(stageData);
      scene.add(npcPreviewGroup);
      setSelectedNpcMarker(null, null);
      fitCamera();
      updateStats(stageData);
      renderNpcList();
      const savedStart = readSavedPlayerStart();
      if (stageData.playerStart != null) {
        setStartPosition(stageData.playerStart, true);
      } else if (savedStart != null) {
        setStartPosition(savedStart, true);
      } else {
        setStartPosition({ x: 0, z: 0 }, true);
      }
      if (useFastPreview) {
        setStatus('Stage preview loaded in fast mode for large level size.', 'success');
      } else {
        setStatus('Stage preview loaded from SVG.', 'success');
      }
    } catch (error) {
      stats.textContent = '';
      setStatus(
        `Could not generate stage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file == null) {
      return;
    }
    setStatus('Loading file...', 'loading');
    try {
      const svgText = await file.text();
      loadStageFromSvg(svgText);
    } catch (error) {
      setStatus(
        `Could not read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  });

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (latestStageData == null) return;
    pointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const stageHits = raycaster.intersectObject(stageGroup, true);
    const furnitureHit = stageHits.find((hit) => hit.object?.userData?.kind === 'furniture');
    if (furnitureHit != null) {
      draggingFurnitureId = furnitureHit.object.userData.id ?? null;
      draggingFurnitureMetaIndex = furnitureHit.object.userData.metaIndex ?? null;
      controls3d.enabled = false;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const npcHits = raycaster.intersectObject(npcPreviewGroup, true);
    const npcHit = npcHits.find((hit) => readNpcSpawnUserDataFromObject(hit.object) != null);
    if (npcHit != null) {
      const selected = readNpcSpawnUserDataFromObject(npcHit.object);
      if (selected == null) return;
      draggingNpcMarker = selected.marker ?? null;
      draggingNpcSpawnId = selected.id;
      draggingNpcSpawnIndex = selected.index;
      setSelectedNpcMarker(draggingNpcSpawnId, draggingNpcSpawnIndex);
      controls3d.enabled = false;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    setSelectedNpcMarker(null, null);
    const markerHits = raycaster.intersectObject(playerStartMarker, true);
    if (markerHits.length === 0) return;
    isDraggingStart = true;
    controls3d.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (latestStageData == null) return;
    pointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, dragPoint) == null) return;
    if (isDraggingStart) {
      setStartPosition({ x: dragPoint.x, z: dragPoint.z }, false);
      return;
    }
    if (draggingFurnitureId != null) {
      const mesh = stageGroup.children.find((child) => {
        if (child.userData?.kind !== 'furniture') return false;
        if (draggingFurnitureId != null && child.userData?.id === draggingFurnitureId) return true;
        return (
          draggingFurnitureMetaIndex != null &&
          child.userData?.metaIndex === draggingFurnitureMetaIndex
        );
      });
      if (mesh == null) return;
      const candidate = clampFurnitureToStageBounds(
        { x: dragPoint.x, z: dragPoint.z },
        { width: mesh.userData.width, depth: mesh.userData.depth },
        latestStageData
      );
      const collides = stageGroup.children.some((child) => {
        if (child === mesh) return false;
        if (child.userData?.kind !== 'furniture') return false;
        return overlapsFurniture(
          { x: candidate.x, z: candidate.z, width: mesh.userData.width, depth: mesh.userData.depth },
          { x: child.position.x, z: child.position.z, width: child.userData.width, depth: child.userData.depth }
        );
      });
      if (collides) return;
      mesh.position.x = candidate.x;
      mesh.position.z = candidate.z;
      const dataItem = latestStageData.furniture?.find((item) => item.id === draggingFurnitureId);
      if (dataItem != null) {
        dataItem.x = candidate.x;
        dataItem.z = candidate.z;
      } else if (
        draggingFurnitureMetaIndex != null &&
        latestStageData.furniture?.[draggingFurnitureMetaIndex] != null
      ) {
        latestStageData.furniture[draggingFurnitureMetaIndex].x = candidate.x;
        latestStageData.furniture[draggingFurnitureMetaIndex].z = candidate.z;
      }
      return;
    }

    if (draggingNpcSpawnId != null || draggingNpcSpawnIndex != null) {
      const candidate = clampToStageBounds({ x: dragPoint.x, z: dragPoint.z }, latestStageData);
      const marker = draggingNpcMarker;
      if (marker == null) return;
      marker.position.x = candidate.x;
      marker.position.z = candidate.z;
      const stageDataTarget =
        latestStageData.npcSpawns?.find((item) => item.id === draggingNpcSpawnId) ??
        (draggingNpcSpawnIndex != null ? latestStageData.npcSpawns?.[draggingNpcSpawnIndex] : null);
      if (stageDataTarget != null) {
        stageDataTarget.x = candidate.x;
        stageDataTarget.z = candidate.z;
      }
    }
  });

  const stopDragging = (event) => {
    if (!isDraggingStart && draggingFurnitureId == null && draggingNpcSpawnId == null && draggingNpcSpawnIndex == null) return;
    if (isDraggingStart) {
      persistStartPosition();
      persistPlayerStartToSvg();
      setStatus('Player start updated.', 'success');
    }
    if (draggingFurnitureId != null) {
      const dataItem =
        latestStageData?.furniture?.find((item) => item.id === draggingFurnitureId) ??
        (draggingFurnitureMetaIndex != null ? latestStageData?.furniture?.[draggingFurnitureMetaIndex] : null);
      if (dataItem != null) {
        persistFurnitureToSvg(
          draggingFurnitureId,
          draggingFurnitureMetaIndex,
          { x: dataItem.x, z: dataItem.z }
        );
        setStatus('Furniture updated.', 'success');
      }
    }
    if (draggingNpcSpawnId != null || draggingNpcSpawnIndex != null) {
      const stageDataTarget =
        latestStageData?.npcSpawns?.find((item) => item.id === draggingNpcSpawnId) ??
        (draggingNpcSpawnIndex != null ? latestStageData?.npcSpawns?.[draggingNpcSpawnIndex] : null);
      if (stageDataTarget != null) {
        persistNpcSpawnToSvg(
          draggingNpcSpawnId,
          draggingNpcSpawnIndex,
          { x: stageDataTarget.x, z: stageDataTarget.z }
        );
        setStatus('NPC spawn updated.', 'success');
      }
    }
    draggingFurnitureId = null;
    draggingFurnitureMetaIndex = null;
    draggingNpcMarker = null;
    draggingNpcSpawnId = null;
    draggingNpcSpawnIndex = null;
    isDraggingStart = false;
    controls3d.enabled = true;
    renderer.domElement.style.cursor = 'grab';
    if (event?.pointerId != null && renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };
  renderer.domElement.addEventListener('pointerup', stopDragging);
  renderer.domElement.addEventListener('pointercancel', stopDragging);

  window.addEventListener('keydown', (event) => {
    const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace';
    if (!isDeleteKey) return;
    if (isTypingTarget(event.target)) return;
    if (latestStageData == null) return;
    if (selectedNpcSpawnId == null && selectedNpcSpawnIndex == null) return;

    const currentSpawns = Array.isArray(latestStageData.npcSpawns) ? latestStageData.npcSpawns : [];
    const nextSpawns = currentSpawns.filter((item, index) => {
      if (selectedNpcSpawnId != null && item.id === selectedNpcSpawnId) return false;
      if (selectedNpcSpawnIndex != null && index === selectedNpcSpawnIndex) return false;
      return true;
    });
    if (nextSpawns.length === currentSpawns.length) return;

    latestStageData.npcSpawns = nextSpawns;
    normalizeNpcSpawns(latestStageData);
    scene.remove(npcPreviewGroup);
    npcPreviewGroup.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
    npcPreviewGroup = buildNpcPreviewGroup(latestStageData);
    scene.add(npcPreviewGroup);
    setSelectedNpcMarker(null, null);
    persistNpcSpawnsToSvg();
    updateStats(latestStageData);
    renderNpcList();
    setStatus('NPC spawn deleted.', 'success');
    event.preventDefault();
  });

  deleteNpcButton.addEventListener('click', () => {
    if (latestStageData == null) return;
    if (selectedNpcSpawnId == null && selectedNpcSpawnIndex == null) {
      setStatus('Select an NPC from the list first.', 'error');
      return;
    }
    const currentSpawns = Array.isArray(latestStageData.npcSpawns) ? latestStageData.npcSpawns : [];
    const nextSpawns = currentSpawns.filter((item, index) => {
      if (selectedNpcSpawnId != null && item.id === selectedNpcSpawnId) return false;
      if (selectedNpcSpawnIndex != null && index === selectedNpcSpawnIndex) return false;
      return true;
    });
    if (nextSpawns.length === currentSpawns.length) return;
    latestStageData.npcSpawns = nextSpawns;
    normalizeNpcSpawns(latestStageData);
    scene.remove(npcPreviewGroup);
    disposeMeshResources(npcPreviewGroup);
    npcPreviewGroup = buildNpcPreviewGroup(latestStageData);
    scene.add(npcPreviewGroup);
    setSelectedNpcMarker(null, null);
    persistNpcSpawnsToSvg();
    updateStats(latestStageData);
    renderNpcList();
    setStatus('NPC spawn deleted.', 'success');
  });

  addNpcButton.addEventListener('click', () => {
    if (latestStageData == null) {
      setStatus('Load a stage first.', 'error');
      return;
    }
    const currentSpawns = Array.isArray(latestStageData.npcSpawns) ? latestStageData.npcSpawns : [];
    const id = `npc-${currentSpawns.length + 1}`;
    const seedOffset = currentSpawns.length * 0.6;
    const nextSpawn = {
      id,
      x: Math.max(-latestStageData.width / 2, Math.min(latestStageData.width / 2, seedOffset)),
      z: Math.max(-latestStageData.height / 2, Math.min(latestStageData.height / 2, seedOffset)),
    };
    latestStageData.npcSpawns = [...currentSpawns, nextSpawn];
    normalizeNpcSpawns(latestStageData);
    scene.remove(npcPreviewGroup);
    disposeMeshResources(npcPreviewGroup);
    npcPreviewGroup = buildNpcPreviewGroup(latestStageData);
    scene.add(npcPreviewGroup);
    setSelectedNpcMarker(nextSpawn.id, latestStageData.npcSpawns.length - 1);
    persistNpcSpawnsToSvg();
    updateStats(latestStageData);
    renderNpcList();
    setStatus('NPC spawn added.', 'success');
  });

  deleteAllNpcButton.addEventListener('click', () => {
    if (latestStageData == null) {
      setStatus('Load a stage first.', 'error');
      return;
    }
    const currentSpawns = Array.isArray(latestStageData.npcSpawns) ? latestStageData.npcSpawns : [];
    if (currentSpawns.length === 0) {
      setStatus('No NPC spawns to delete.', 'info');
      return;
    }
    latestStageData.npcSpawns = [];
    scene.remove(npcPreviewGroup);
    disposeMeshResources(npcPreviewGroup);
    npcPreviewGroup = buildNpcPreviewGroup(latestStageData);
    scene.add(npcPreviewGroup);
    setSelectedNpcMarker(null, null);
    persistNpcSpawnsToSvg();
    updateStats(latestStageData);
    renderNpcList();
    setStatus('All NPC spawns deleted.', 'success');
  });

  testFpsButton.addEventListener('click', () => {
    if (latestLoadedSvg.length === 0) {
      setStatus('Load an SVG before testing with FPS controller.', 'error');
      return;
    }
    window.localStorage.setItem(LATEST_PLAN_STORAGE_KEY, latestLoadedSvg);
    persistStartPosition();
    window.location.href = '/play?level=__latest_svg__';
  });

  exportGlbButton.addEventListener('click', async () => {
    if (latestStageData == null) {
      setStatus('Load an SVG before exporting GLB.', 'error');
      return;
    }
    setStatus('Exporting GLB...', 'loading');
    try {
      const glbData = await exportStageToGlb(latestStageData);
      const blob = new Blob([glbData], { type: 'model/gltf-binary' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `stage-${Date.now()}.glb`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus('GLB exported. You can add it to /public/levels.', 'success');
    } catch (error) {
      setStatus(
        `Could not export GLB: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  });

  backToPlannerButton.addEventListener('click', () => {
    window.location.href = '/floor-plan';
  });

  const searchParams = new URLSearchParams(window.location.search);
  const shouldAutoLoadLatest = searchParams.get('source') === 'latest';
  if (shouldAutoLoadLatest) {
    const svgText = window.localStorage.getItem(LATEST_PLAN_STORAGE_KEY);
    if (svgText == null || svgText.length === 0) {
      setStatus('No saved SVG found. Generate a floor plan first.', 'error');
    } else {
      loadStageFromSvg(svgText);
    }
  }

  const resize = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', resize);
  resize();

  function animate() {
    controls3d.update();
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(animate);

  if (!shouldAutoLoadLatest) {
    setStatus('Upload an SVG to preview the 3D stage.', 'info');
  }
  renderNpcList();
  updateStartReadout();
}
