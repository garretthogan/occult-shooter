/**
 * Game module. Entry point for bootstrapping the FPS game.
 *
 * Architecture (extensible for NPCs, physics, animations, destruction):
 * - config.js     - Constants; tune here for balance
 * - input.js      - Keyboard/mouse state; add new bindings here
 * - scene.js      - Lighting, fog; add post-processing here
 * - renderer.js   - WebGL setup; swap for WebGPU later if needed
 * - world.js      - Level geometry + Octree
 * - player.js     - Player collider + controls; add animation hooks here
 * - projectiles.js - Throwable pool; extend for weapons/NPC projectiles
 * - game.js       - Orchestrator; wire new systems in step() and animate()
 */

export { createGame } from './game.js';
