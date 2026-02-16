/**
 * Game configuration constants.
 * Centralizes magic numbers for physics, rendering, and gameplay.
 */

export const GRAVITY = 30;

export const PLAYER = {
  /** Max player health points. */
  MAX_HEALTH: 100,
  /** Capsule height from feet to head (meters). */
  HEIGHT: 1.5,
  /** Capsule radius (meters). */
  RADIUS: 0.25,
  /** Jump impulse (m/s). */
  JUMP_VELOCITY: 7,
  /** Ground movement acceleration (m/s²). */
  GROUND_ACCEL: 25,
  /** Air movement acceleration (m/s²). */
  AIR_ACCEL: 8,
  /** Velocity damping exponent factor. */
  DAMPING_FACTOR: 4,
  /** Air resistance multiplier when not on floor. */
  AIR_RESISTANCE: 0.1,
};

export const HITSCAN = {
  /** Max ray distance (world units). */
  RANGE: 1000,
  /** Radius of hit marker sphere (world units). */
  MARKER_RADIUS: 0.05,
  /** Marker sphere color (hex). */
  MARKER_COLOR: 0xff69b4,
  /** Marker sphere opacity (0–1). */
  MARKER_OPACITY: 0.75,
  /** Time before marker disappears (seconds). */
  MARKER_LIFETIME: 5,
};

export const PHYSICS = {
  /** Fixed timestep subdivisions per frame (reduces tunnel-through). */
  STEPS_PER_FRAME: 5,
  /** Max delta per step (seconds). */
  MAX_DELTA_PER_STEP: 0.05,
};

export const WORLD = {
  /** Out-of-bounds Y threshold; player respawns above this. */
  OOB_Y_THRESHOLD: -25,
};

export const NPC = {
  /** Min distance to player (meters). */
  MIN_DISTANCE: 1,
  /** Movement speed (m/s). */
  SPEED: 2,
  /** Health points / hits required to kill. */
  MAX_HEALTH: 3,
  /** Detection range used for room-like aggro behavior (meters). */
  ALERT_RANGE: 12,
  /** Max range for NPC hitscan attacks (meters). */
  SHOOT_RANGE: 20,
  /** Time between shots lower bound (seconds). */
  SHOOT_INTERVAL_MIN: 0.45,
  /** Time between shots upper bound (seconds). */
  SHOOT_INTERVAL_MAX: 0.95,
  /** Shot success chance after line-of-sight check (0..1). */
  SHOT_ACCURACY: 0.7,
  /** Damage dealt to player on each successful shot. */
  SHOT_DAMAGE: 10,
  /** Capsule height (meters). */
  HEIGHT: 1.5,
  /** Capsule radius (meters). */
  RADIUS: 0.25,
  /** Normal path recompute interval (seconds). */
  PATH_UPDATE_INTERVAL: 0.4,
  /** Hard refresh interval for path recompute (seconds). */
  PATH_FORCE_REFRESH_INTERVAL: 1.0,
};

export const PATHFINDING = {
  /** Grid cell size (meters). Balance route quality vs CPU cost. */
  CELL_SIZE: 0.35,
  /** Required vertical clearance for NPC navigation (meters). */
  AGENT_HEIGHT: 1.5,
  /** Min surface normal Y for walkable (ramps, floors). */
  MIN_WALKABLE_NORMAL_Y: 0.3,
  /** Raycast origin height above ground for sampling (meters). */
  SAMPLE_HEIGHT: 2,
  /** Max step up height (meters) - e.g. one or two stairs. */
  MAX_STEP_UP: 0.6,
  /** Max step down height (meters) to avoid drop-off paths. */
  MAX_STEP_DOWN: 0.75,
};
