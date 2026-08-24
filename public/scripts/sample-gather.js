// Sample autonomy for the default practice arena: plow straight down the
// lane, gently centering on the nearest visible object, pushing it into the
// red goal. Demonstrates onTick(sense, api) + sensor-driven control.
//
// Scoring note: objectInTrigger rules score UNHELD objects, so a pure push
// is enough to score — no gripper needed for this routine.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function onTick(sense, api) {
  const nearest = sense.scan[0];
  const turn = nearest ? clamp(nearest.bearingRad * 1.4, -0.35, 0.35) : 0;
  api.setAxes(0.85, 0, turn);
}
