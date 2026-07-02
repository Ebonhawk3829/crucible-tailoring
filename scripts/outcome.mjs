// outcome.mjs — pure success-band → quality mapping
// ZERO Foundry dependencies. Band resolution is handled by Crucible's native
// Roll.isCriticalSuccess / Roll.isCriticalFailure (default ±6 from DC), so
// the old resolveQualityBand/resolveOutcome functions are no longer needed.
// The remaining helpers are used by queries.mjs and the test suite.

import { BANDS, QUALITY_TIERS } from "./config.mjs";

/**
 * Map a success band to a quality tier delta.
 *
 * criticalSuccess  → +1 (output one tier higher than materials)
 * success          →  0 (output matches material quality)
 * failure          → -1 (output one tier lower, floor shoddy)
 * criticalFailure  → null (materials ruined, nothing produced)
 *
 * @param {string} band - One of BANDS.*
 * @returns {number|null} Quality tier delta, or null for "produce nothing"
 */
export function bandToQualityDelta(band) {
  switch (band) {
    case BANDS.CRITICAL_SUCCESS: return 1;
    case BANDS.SUCCESS: return 0;
    case BANDS.FAILURE: return -1;
    case BANDS.CRITICAL_FAILURE: return null;
    default: return null;
  }
}

/**
 * Apply a quality delta to a base quality tier, clamping to valid range.
 * @param {string} baseQuality - e.g. "standard"
 * @param {number} delta - e.g. +1, 0, -1
 * @returns {string} The resulting quality tier
 */
export function applyQualityDelta(baseQuality, delta) {
  const idx = QUALITY_TIERS.indexOf(baseQuality);
  if (idx === -1) return baseQuality;
  const newIdx = Math.max(0, Math.min(QUALITY_TIERS.length - 1, idx + delta));
  return QUALITY_TIERS[newIdx];
}