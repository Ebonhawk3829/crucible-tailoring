// tests/outcome.test.mjs — console.assert-based unit tests for outcome.mjs
// Zero Foundry dependencies. Runnable via:
//   node tests/outcome.test.mjs
// or paste into browser console after loading outcome.mjs.
//
// NOTE: resolveQualityBand and resolveOutcome were removed in favor of
// Crucible's native Roll.isCriticalSuccess / Roll.isCriticalFailure.
// The remaining pure functions (bandToQualityDelta, applyQualityDelta) are
// tested here.

// ---------------------------------------------------------------------------
// Minimal inline duplicates of config constants so this file has no imports.
// ---------------------------------------------------------------------------
const BANDS = {
  CRITICAL_SUCCESS: "criticalSuccess",
  SUCCESS: "success",
  FAILURE: "failure",
  CRITICAL_FAILURE: "criticalFailure"
};

const QUALITY_TIERS = ["shoddy", "standard", "fine", "superior", "masterwork"];

// ---------------------------------------------------------------------------
// Inline copies of outcome.mjs functions (keep in sync with the real file).
// ---------------------------------------------------------------------------
function bandToQualityDelta(band) {
  switch (band) {
    case BANDS.CRITICAL_SUCCESS: return 1;
    case BANDS.SUCCESS: return 0;
    case BANDS.FAILURE: return -1;
    case BANDS.CRITICAL_FAILURE: return null;
    default: return null;
  }
}

function applyQualityDelta(baseQuality, delta) {
  const idx = QUALITY_TIERS.indexOf(baseQuality);
  if (idx === -1) return baseQuality;
  const newIdx = Math.max(0, Math.min(QUALITY_TIERS.length - 1, idx + delta));
  return QUALITY_TIERS[newIdx];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
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

// --- bandToQualityDelta ---
assertEqual(bandToQualityDelta(BANDS.CRITICAL_SUCCESS), 1, "criticalSuccess → +1");
assertEqual(bandToQualityDelta(BANDS.SUCCESS), 0, "success → 0");
assertEqual(bandToQualityDelta(BANDS.FAILURE), -1, "failure → -1");
assertEqual(bandToQualityDelta(BANDS.CRITICAL_FAILURE), null, "criticalFailure → null");
assertEqual(bandToQualityDelta("bogus"), null, "unknown band → null");

// --- applyQualityDelta ---
assertEqual(applyQualityDelta("standard", 1), "fine", "standard+1 → fine");
assertEqual(applyQualityDelta("standard", 0), "standard", "standard+0 → standard");
assertEqual(applyQualityDelta("standard", -1), "shoddy", "standard-1 → shoddy");
assertEqual(applyQualityDelta("shoddy", -1), "shoddy", "shoddy-1 → shoddy (floor)");
assertEqual(applyQualityDelta("masterwork", 1), "masterwork", "masterwork+1 → masterwork (ceiling)");
assertEqual(applyQualityDelta("fine", 2), "masterwork", "fine+2 → masterwork");
assertEqual(applyQualityDelta("bogus", 0), "bogus", "unknown quality → unchanged");

// --- Summary ---
console.log(`outcome.test.mjs: ${passed} passed, ${failed} failed`);
if (typeof process !== "undefined" && process.exit) {
  process.exit(failed > 0 ? 1 : 0);
}