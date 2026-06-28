// tests/outcome.test.mjs — console.assert-based unit tests for outcome.mjs
// Zero Foundry dependencies. Runnable via:
//   node tests/outcome.test.mjs
// or paste into browser console after loading outcome.mjs.

// ---------------------------------------------------------------------------
// Minimal inline duplicates of config constants so this file has no imports.
// ---------------------------------------------------------------------------
const BANDS = {
  STRONG_SUCCESS: "strongSuccess",
  SUCCESS: "success",
  FAILURE: "failure",
  STRONG_FAILURE: "strongFailure"
};

const QUALITY_TIERS = ["shoddy", "standard", "fine", "superior", "masterwork"];

// ---------------------------------------------------------------------------
// Inline copies of outcome.mjs functions (keep in sync with the real file).
// ---------------------------------------------------------------------------
function resolveQualityBand(total, dc, thresholds) {
  const delta = thresholds.strongSuccess;
  if (total >= dc + delta) return BANDS.STRONG_SUCCESS;
  if (total >= dc) return BANDS.SUCCESS;
  if (total <= dc - delta) return BANDS.STRONG_FAILURE;
  return BANDS.FAILURE;
}

function bandToQualityDelta(band) {
  switch (band) {
    case BANDS.STRONG_SUCCESS: return 1;
    case BANDS.SUCCESS: return 0;
    case BANDS.FAILURE: return -1;
    case BANDS.STRONG_FAILURE: return null;
    default: return null;
  }
}

function applyQualityDelta(baseQuality, delta) {
  const idx = QUALITY_TIERS.indexOf(baseQuality);
  if (idx === -1) return baseQuality;
  const newIdx = Math.max(0, Math.min(QUALITY_TIERS.length - 1, idx + delta));
  return QUALITY_TIERS[newIdx];
}

function resolveOutcome(total, dc, materialQuality, thresholds) {
  const band = resolveQualityBand(total, dc, thresholds);
  const delta = bandToQualityDelta(band);
  const quality = delta === null ? null : applyQualityDelta(materialQuality, delta);
  return { band, quality };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const THRESHOLDS = { strongSuccess: 8 };
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- resolveQualityBand ---
assertEqual(resolveQualityBand(20, 12, THRESHOLDS), BANDS.STRONG_SUCCESS, "total=20 dc=12 → strongSuccess");
assertEqual(resolveQualityBand(19, 12, THRESHOLDS), BANDS.SUCCESS, "total=19 dc=12 → success (dc+8 boundary, not >=)");
assertEqual(resolveQualityBand(12, 12, THRESHOLDS), BANDS.SUCCESS, "total=12 dc=12 → success (exact)");
assertEqual(resolveQualityBand(11, 12, THRESHOLDS), BANDS.FAILURE, "total=11 dc=12 → failure");
assertEqual(resolveQualityBand(5, 12, THRESHOLDS), BANDS.FAILURE, "total=5 dc=12 → failure (above strong fail)");
assertEqual(resolveQualityBand(4, 12, THRESHOLDS), BANDS.STRONG_FAILURE, "total=4 dc=12 → strongFailure (exact boundary)");
assertEqual(resolveQualityBand(3, 12, THRESHOLDS), BANDS.STRONG_FAILURE, "total=3 dc=12 → strongFailure");

// --- bandToQualityDelta ---
assertEqual(bandToQualityDelta(BANDS.STRONG_SUCCESS), 1, "strongSuccess → +1");
assertEqual(bandToQualityDelta(BANDS.SUCCESS), 0, "success → 0");
assertEqual(bandToQualityDelta(BANDS.FAILURE), -1, "failure → -1");
assertEqual(bandToQualityDelta(BANDS.STRONG_FAILURE), null, "strongFailure → null");
assertEqual(bandToQualityDelta("bogus"), null, "unknown band → null");

// --- applyQualityDelta ---
assertEqual(applyQualityDelta("standard", 1), "fine", "standard+1 → fine");
assertEqual(applyQualityDelta("standard", 0), "standard", "standard+0 → standard");
assertEqual(applyQualityDelta("standard", -1), "shoddy", "standard-1 → shoddy");
assertEqual(applyQualityDelta("shoddy", -1), "shoddy", "shoddy-1 → shoddy (floor)");
assertEqual(applyQualityDelta("masterwork", 1), "masterwork", "masterwork+1 → masterwork (ceiling)");
assertEqual(applyQualityDelta("fine", 2), "masterwork", "fine+2 → masterwork");
assertEqual(applyQualityDelta("bogus", 0), "bogus", "unknown quality → unchanged");

// --- resolveOutcome (integration) ---
assertEqual(resolveOutcome(20, 12, "standard", THRESHOLDS).band, BANDS.STRONG_SUCCESS, "resolveOutcome strongSuccess band");
assertEqual(resolveOutcome(20, 12, "standard", THRESHOLDS).quality, "fine", "resolveOutcome strongSuccess quality");
assertEqual(resolveOutcome(15, 12, "standard", THRESHOLDS).quality, "standard", "resolveOutcome success quality");
assertEqual(resolveOutcome(10, 12, "standard", THRESHOLDS).quality, "shoddy", "resolveOutcome failure quality");
assertEqual(resolveOutcome(3, 12, "standard", THRESHOLDS).quality, null, "resolveOutcome strongFailure quality");

// --- Summary ---
console.log(`outcome.test.mjs: ${passed} passed, ${failed} failed`);
if (typeof process !== "undefined" && process.exit) {
  process.exit(failed > 0 ? 1 : 0);
}