/**
 * Lighting config: serialize to/from JSON, load from URL, download as file.
 */

import { withBasePath } from '../shared/basePath.js';

const LIGHTING_CONFIG_URL = withBasePath('/lighting.json');

/**
 * @typedef {Object} LightingConfig
 * @property {Object} fillLight
 * @property {number} fillLight.skyColor - Hex color
 * @property {number} fillLight.groundColor - Hex color
 * @property {number} fillLight.intensity
 * @property {{ x: number, y: number, z: number }} fillLight.position
 * @property {Object} directionalLight
 * @property {number} directionalLight.color - Hex color
 * @property {number} directionalLight.intensity
 * @property {{ x: number, y: number, z: number }} directionalLight.position
 * @property {boolean} directionalLight.castShadow
 * @property {Object} directionalLight.shadow
 * @property {number} directionalLight.shadow.radius
 * @property {number} directionalLight.shadow.mapSize
 */

/**
 * Serializes current light state to a plain object for JSON.
 *
 * @param {{ fillLight: THREE.HemisphereLight, directionalLight: THREE.DirectionalLight }} lights
 * @returns {LightingConfig}
 */
export function serializeLightingConfig(lights) {
  return {
    fillLight: {
      skyColor: lights.fillLight.color.getHex(),
      groundColor: lights.fillLight.groundColor.getHex(),
      intensity: lights.fillLight.intensity,
      position: {
        x: lights.fillLight.position.x,
        y: lights.fillLight.position.y,
        z: lights.fillLight.position.z,
      },
    },
    directionalLight: {
      color: lights.directionalLight.color.getHex(),
      intensity: lights.directionalLight.intensity,
      position: {
        x: lights.directionalLight.position.x,
        y: lights.directionalLight.position.y,
        z: lights.directionalLight.position.z,
      },
      castShadow: lights.directionalLight.castShadow,
      shadow: {
        radius: lights.directionalLight.shadow.radius,
        mapSize: lights.directionalLight.shadow.mapSize.width,
      },
    },
  };
}

/**
 * Applies a loaded config to the lights. Validates shape; ignores unknown fields.
 *
 * @param {{ fillLight: THREE.HemisphereLight, directionalLight: THREE.DirectionalLight }} lights
 * @param {LightingConfig} config
 */
export function applyLightingConfig(lights, config) {
  const fill = config.fillLight;
  if (fill != null) {
    if (typeof fill.skyColor === 'number') lights.fillLight.color.setHex(fill.skyColor);
    if (typeof fill.groundColor === 'number') lights.fillLight.groundColor.setHex(fill.groundColor);
    if (typeof fill.intensity === 'number') lights.fillLight.intensity = fill.intensity;
    if (fill.position != null) {
      if (typeof fill.position.x === 'number') lights.fillLight.position.x = fill.position.x;
      if (typeof fill.position.y === 'number') lights.fillLight.position.y = fill.position.y;
      if (typeof fill.position.z === 'number') lights.fillLight.position.z = fill.position.z;
    }
  }

  const dir = config.directionalLight;
  if (dir != null) {
    if (typeof dir.color === 'number') lights.directionalLight.color.setHex(dir.color);
    if (typeof dir.intensity === 'number') lights.directionalLight.intensity = dir.intensity;
    if (dir.position != null) {
      if (typeof dir.position.x === 'number') lights.directionalLight.position.x = dir.position.x;
      if (typeof dir.position.y === 'number') lights.directionalLight.position.y = dir.position.y;
      if (typeof dir.position.z === 'number') lights.directionalLight.position.z = dir.position.z;
    }
    if (typeof dir.castShadow === 'boolean') lights.directionalLight.castShadow = dir.castShadow;
    if (dir.shadow != null) {
      if (typeof dir.shadow.radius === 'number') lights.directionalLight.shadow.radius = dir.shadow.radius;
      if (typeof dir.shadow.mapSize === 'number') {
        lights.directionalLight.shadow.mapSize.width = dir.shadow.mapSize;
        lights.directionalLight.shadow.mapSize.height = dir.shadow.mapSize;
      }
    }
  }
}

/**
 * Loads lighting config from URL. Returns null on failure.
 *
 * @param {string} [url] - Defaults to /lighting.json
 * @returns {Promise<LightingConfig | null>}
 */
export async function loadLightingConfigFromUrl(url = LIGHTING_CONFIG_URL) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  if (data == null || typeof data !== 'object') return null;
  return data;
}

/**
 * Triggers a download of the current lighting config as lighting.json.
 *
 * @param {LightingConfig} config
 * @param {string} [filename] - Defaults to lighting.json
 */
export function downloadLightingConfig(config, filename = 'lighting.json') {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
