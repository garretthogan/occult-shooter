/**
 * Dev-only panel: lights.
 * Sits in the left corner; only rendered when import.meta.env.DEV is true.
 */

import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  serializeLightingConfig,
  applyLightingConfig,
  downloadLightingConfig,
  loadLightingConfigFromUrl,
} from './lightingConfig.js';

/**
 * Creates a lights control panel.
 * No-op in production (returns null).
 *
 * @param {{ fillLight: THREE.HemisphereLight, directionalLight: THREE.DirectionalLight }} lights
 * @param {HTMLElement} container
 * @param {{ pathfindingDebug?: { setVisible: (v: boolean) => void }, debugState?: { showPathfinding: boolean } }} [debug]
 * @returns {GUI | null}
 */
export function createSceneControlPanel(lights, container, debug) {
  if (!import.meta.env.DEV) {
    return null;
  }

  const gui = new GUI({ title: 'Scene', width: 240 });
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.left = '0';
  gui.domElement.style.zIndex = '150';
  container.appendChild(gui.domElement);

  const lightsFolder = gui.addFolder('Lights');
  const fillFolder = lightsFolder.addFolder('Hemisphere (fill)');
  fillFolder.addColor({ skyColor: lights.fillLight.color.getHex() }, 'skyColor')
    .onChange((hex) => { lights.fillLight.color.setHex(hex); });
  fillFolder.addColor({ groundColor: lights.fillLight.groundColor.getHex() }, 'groundColor')
    .onChange((hex) => { lights.fillLight.groundColor.setHex(hex); });
  fillFolder.add(lights.fillLight, 'intensity', 0, 5, 0.1);
  fillFolder.add(lights.fillLight.position, 'x', -20, 20, 0.5);
  fillFolder.add(lights.fillLight.position, 'y', -20, 20, 0.5);
  fillFolder.add(lights.fillLight.position, 'z', -20, 20, 0.5);

  const dirFolder = lightsFolder.addFolder('Directional');
  dirFolder.addColor({ color: lights.directionalLight.color.getHex() }, 'color')
    .onChange((hex) => { lights.directionalLight.color.setHex(hex); });
  dirFolder.add(lights.directionalLight, 'intensity', 0, 10, 0.1);
  dirFolder.add(lights.directionalLight.position, 'x', -50, 50, 1);
  dirFolder.add(lights.directionalLight.position, 'y', -50, 50, 1);
  dirFolder.add(lights.directionalLight.position, 'z', -50, 50, 1);
  dirFolder.add(lights.directionalLight, 'castShadow');
  dirFolder.add(lights.directionalLight.shadow, 'radius', 0, 10, 0.5);
  const mapSizeObj = { value: lights.directionalLight.shadow.mapSize.width };
  dirFolder.add(mapSizeObj, 'value', { '256': 256, '512': 512, '1024': 1024, '2048': 2048 })
    .name('shadow map size')
    .onChange((size) => {
      lights.directionalLight.shadow.mapSize.width = size;
      lights.directionalLight.shadow.mapSize.height = size;
    });

  const ioFolder = gui.addFolder('Save / Load');
  ioFolder.add(
    {
      'Save lighting': () => downloadLightingConfig(serializeLightingConfig(lights)),
    },
    'Save lighting'
  );
  ioFolder.add(
    { 'Load lighting': () => loadJsonFile((c) => applyLightingConfig(lights, c)) },
    'Load lighting'
  );
  ioFolder.add(
    { 'Reload lighting': async () => {
      const c = await loadLightingConfigFromUrl();
      if (c) applyLightingConfig(lights, c);
    } },
    'Reload lighting'
  );

  if (debug?.pathfindingDebug != null && debug?.debugState != null) {
    const debugFolder = gui.addFolder('Debug');
    debugFolder.add(debug.debugState, 'showPathfinding')
      .name('Pathfinding grid & path')
      .onChange((v) => debug.pathfindingDebug.setVisible(v));
  }

  return gui;
}

function loadJsonFile(onLoad) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      await onLoad(config);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  });
  input.click();
}
