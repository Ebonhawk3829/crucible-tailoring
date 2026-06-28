// outcome.mjs — pure success-band → quality mapping
// ZERO Foundry dependencies. Thresholds are passed as arguments so this
// file is unit-checkable in isolation (see tests/outcome.test.mjs).

import { BANDS, QUALITY_TIERS } from "./config.mjs";

/**
 * Resolve a roll total against a DC into one of four success bands.
 * @param {number} total - The roll total
 * @param {number} dc - The difficulty class
 * @param {{strongSuccess: number}} thresholds - e.g. {strongSuccess: 8}
 * @returns {string} One of BANDS.STRONG_SUCCESS | SUCCESS | FAILURE | STRONG_FAILURE
 */
export function resolveQualityBand(total, dc, thresholds) {
  const delta = thresholds.strongSuccess;
  if (total >= dc + delta) return BANDS.STRONG_SUCCESS;
  if (total >= dc) return BANDS.SUCCESS;
  if (total <= dc - delta) return BANDS.STRONG_FAILURE;
  return BANDS.FAILURE;
}

/**
 * Map a success band to a quality tier delta.
 *
 * strongSuccess  → +1 (output one tier higher than materials)
 * success        →  0 (output matches material quality)
 * failure        → -1 (output one tier lower, floor shoddy)
 * strongFailure  → null (materials ruined, nothing produced)
 *
 * @param {string} band - One of BANDS.*
 * @returns {number|null} Quality tier delta, or null for "produce nothing"
 */
export function bandToQualityDelta(band) {
  switch (band) {
    case BANDS.STRONG_SUCCESS: return 1;
    case BANDS.SUCCESS: return 0;
    case BANDS.FAILURE: return -1;
    case BANDS.STRONG_FAILURE: return null;
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

/**
 * Full pipeline: roll total → quality tier.
 * Returns {band, quality} where quality is null on strong failure.
 * @param {number} total
 * @param {number} dc
 * @param {string} materialQuality - The quality tier of the materials used
 * @param {{strongSuccess: number}} thresholds
 * @returns {{band: string, quality: string|null}}
 */
export function resolveOutcome(total, dc, materialQuality, thresholds) {
  const band = resolveQualityBand(total, dc, thresholds);
  const delta = bandToQualityDelta(band);
  const quality = delta === null ? null : applyQualityDelta(materialQuality, delta);
  return { band, quality };
}