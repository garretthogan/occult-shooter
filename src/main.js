/**
 * Entry point. Routes between main menu, game, and content tools.
 */

import './style.css';
import './tui.css';
import { createGame } from './game/index.js';
import { mountFloorPlanRoute } from './floorPlan/index.js';
import { mountStageFromSvgRoute } from './stageFromSvg/index.js';
import { parseFloorPlanSvg } from './stageFromSvg/stageModel.js';

const container = document.getElementById('app');
if (container === null) {
  throw new Error('Game container #app not found');
}
document.body.classList.add('tui');

const FALLBACK_LEVEL_URL = '/levels/level-1.glb';
const LATEST_PLAN_STORAGE_KEY = 'occultShooter.latestFloorPlanSvg';
const LATEST_PLAYER_START_STORAGE_KEY = 'occultShooter.latestFloorPlanPlayerStart';
const LATEST_SVG_LEVEL_TOKEN = '__latest_svg__';
const LEVEL_FILE_PATTERN = /(^|\/)level-[^/]+\.glb$/i;

function normalizeLevelList(levelEntries) {
  return levelEntries
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => (entry.startsWith('/') ? entry : `/levels/${entry}`))
    .toSorted((a, b) => a.localeCompare(b));
}

async function resolveFirstLevelUrl() {
  const levels = await resolvePlayableLevelUrls();
  return levels[0] ?? FALLBACK_LEVEL_URL;
}

async function resolvePlayableLevelUrls() {
  const [manifestLevels, directoryLevels] = await Promise.all([
    readLevelsFromManifest(),
    readLevelsFromDirectoryListing(),
  ]);
  const merged = normalizeLevelList([...manifestLevels, ...directoryLevels])
    .filter((entry) => LEVEL_FILE_PATTERN.test(entry));
  if (merged.length > 0) {
    return [...new Set(merged)];
  }
  return [FALLBACK_LEVEL_URL];
}

async function readLevelsFromManifest() {
  try {
    const response = await fetch('/levels/manifest.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`manifest request failed: ${response.status}`);
    }
    const data = await response.json();
    const rawLevels = Array.isArray(data) ? data : data?.levels;
    if (!Array.isArray(rawLevels)) {
      throw new Error('manifest must be an array or { levels: string[] }');
    }
    return normalizeLevelList(rawLevels);
  } catch {
    return [];
  }
}

async function readLevelsFromDirectoryListing() {
  try {
    const response = await fetch('/levels/', { cache: 'no-cache' });
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    if (!html.includes('href=')) {
      return [];
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const hrefs = [...doc.querySelectorAll('a[href]')]
      .map((anchor) => anchor.getAttribute('href') ?? '')
      .map((href) => href.trim())
      .filter((href) => LEVEL_FILE_PATTERN.test(href))
      .map((href) => (href.startsWith('/') ? href : `/levels/${href.replace(/^\.?\//, '')}`));
    return hrefs;
  } catch {
    return [];
  }
}

function readPlayerStartFromStorage() {
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

async function mountGameRoute(worldUrl, svgFloorPlanText, playerStart, npcStarts = [], isStageTestWorld = false) {
  container.className = 'game-root';
  container.replaceChildren();

  const loadingEl = document.createElement('div');
  loadingEl.id = 'loading';
  loadingEl.textContent = 'Loading world…';
  loadingEl.setAttribute('aria-live', 'polite');
  container.appendChild(loadingEl);

  // Only use authored NPC spawn points from the level data.
  // Do not auto-spawn fallback NPCs for play route levels.
  const spawnNpc = false;
  if (isStageTestWorld) {
    let hasEnteredPointerLock = false;
    let didNavigateBack = false;
    const navigateBackToStageGenerator = () => {
      if (didNavigateBack) return;
      didNavigateBack = true;
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = '/stage-preview';
    };

    const handleEscapeToStageOverview = (event) => {
      if (event.code === 'Escape') {
        navigateBackToStageGenerator();
      }
    };
    const handlePointerLockChange = () => {
      if (document.pointerLockElement != null) {
        hasEnteredPointerLock = true;
        return;
      }
      if (hasEnteredPointerLock) {
        navigateBackToStageGenerator();
      }
    };

    document.addEventListener('keydown', handleEscapeToStageOverview);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
  }
  createGame(container, {
    worldUrl,
    svgFloorPlanText,
    spawnNpc,
    playerStart,
    npcStarts,
    showSceneGui: false,
    escapePausesGame: !isStageTestWorld,
  })
    .then(() => {
      loadingEl.remove();
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to load game.';
      loadingEl.textContent = `${message} Check the console for details.`;
      loadingEl.setAttribute('role', 'alert');
      console.error('Game bootstrap failed:', err);
    });
}

function mountMainMenuRoute() {
  container.className = 'menu-root';
  container.replaceChildren();

  const menu = document.createElement('main');
  menu.className = 'main-menu';
  menu.innerHTML = `
    <p class="menu-subtitle">Choose where to start.</p>
  `;

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'menu-primary';
  startButton.textContent = 'Start game';

  const levelPickerLabel = document.createElement('label');
  levelPickerLabel.className = 'menu-level-picker';
  levelPickerLabel.textContent = 'Level';

  const levelPicker = document.createElement('select');
  levelPicker.className = 'menu-level-select';
  levelPicker.setAttribute('aria-label', 'Select a level');
  levelPicker.disabled = true;
  levelPickerLabel.appendChild(levelPicker);

  const nav = document.createElement('nav');
  nav.className = 'menu-links';
  nav.setAttribute('aria-label', 'Main menu routes');
  nav.innerHTML = `
    <a href="/floor-plan">stage generator</a>
  `;

  const status = document.createElement('p');
  status.className = 'menu-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Resolving first level...';

  let selectedLevelUrl = FALLBACK_LEVEL_URL;
  resolvePlayableLevelUrls().then((levels) => {
    levelPicker.replaceChildren();
    levels.forEach((levelUrl) => {
      const option = document.createElement('option');
      option.value = levelUrl;
      option.textContent = levelUrl.replace('/levels/', '');
      levelPicker.appendChild(option);
    });
    selectedLevelUrl = levels[0] ?? FALLBACK_LEVEL_URL;
    levelPicker.value = selectedLevelUrl;
    levelPicker.disabled = false;
    status.textContent = `Selected level: ${selectedLevelUrl}`;
  });

  levelPicker.addEventListener('change', () => {
    selectedLevelUrl = levelPicker.value || FALLBACK_LEVEL_URL;
    status.textContent = `Selected level: ${selectedLevelUrl}`;
  });

  startButton.addEventListener('click', () => {
    const encoded = encodeURIComponent(selectedLevelUrl);
    window.location.href = `/play?level=${encoded}`;
  });

  menu.append(levelPickerLabel, startButton, status, nav);
  container.append(menu);
}

const pathname = window.location.pathname;
if (pathname.startsWith('/play')) {
  const params = new URLSearchParams(window.location.search);
  const levelParam = params.get('level');
  if (levelParam === LATEST_SVG_LEVEL_TOKEN) {
    const svgFloorPlanText = window.localStorage.getItem(LATEST_PLAN_STORAGE_KEY) ?? '';
    let playerStart = readPlayerStartFromStorage();
    let npcStarts = [];
    if (svgFloorPlanText.length > 0) {
      try {
        const parsed = parseFloorPlanSvg(svgFloorPlanText);
        if (parsed.playerStart != null) {
          playerStart = parsed.playerStart;
        }
        npcStarts = Array.isArray(parsed.npcSpawns) ? parsed.npcSpawns : [];
      } catch {
        npcStarts = [];
      }
    }
    await mountGameRoute(FALLBACK_LEVEL_URL, svgFloorPlanText, playerStart, npcStarts, true);
  } else {
    const worldUrl = levelParam ?? await resolveFirstLevelUrl();
    await mountGameRoute(worldUrl, '', null, [], false);
  }
} else if (pathname.startsWith('/floor-plan')) {
  mountFloorPlanRoute(container);
} else if (
  pathname.startsWith('/stage-preview') ||
  pathname.startsWith('/stage-generator') ||
  pathname.startsWith('/stage-from-svg')
) {
  mountStageFromSvgRoute(container);
} else {
  mountMainMenuRoute();
}
