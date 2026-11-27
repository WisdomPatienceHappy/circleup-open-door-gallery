/**
 * Fit one already-measured, centered text rectangle between projected photo
 * disks. No camera/world inference, wrapping, translation or font-floor change.
 *
 * Contact with a disk inflated by gapPx counts as an intersection. Because
 * this makes the feasible boundary open, a fitted result is the witnessed
 * safe lower bound of at most 48 bisections, not an asserted exact supremum.
 */
export function fitPromptInterior({
  anchor, naturalSize, preferredScale, minScale, portraits, gapPx = 8,
} = {}) {
  const finite = (value, name) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${name} must be finite`);
    }
    return value;
  };
  const positive = (value, name) => {
    finite(value, name);
    if (value <= 0) throw new RangeError(`${name} must be positive`);
    return value;
  };
  const x = finite(anchor?.x, 'anchor.x');
  const y = finite(anchor?.y, 'anchor.y');
  const naturalWidth = positive(naturalSize?.width, 'naturalSize.width');
  const naturalHeight = positive(naturalSize?.height, 'naturalSize.height');
  positive(preferredScale, 'preferredScale');
  positive(minScale, 'minScale');
  if (minScale > preferredScale) throw new RangeError('minScale exceeds preferredScale');
  finite(gapPx, 'gapPx');
  if (gapPx < 0) throw new RangeError('gapPx must be nonnegative');
  if (!Array.isArray(portraits)) throw new TypeError('portraits must be an array');
  const disks = portraits.flatMap((portrait, index) => {
    if (portrait === null || typeof portrait !== 'object') {
      throw new TypeError(`portraits[${index}] must be an object`);
    }
    if (portrait.visible !== undefined && typeof portrait.visible !== 'boolean') {
      throw new TypeError(`portraits[${index}].visible must be boolean`);
    }
    // Behind-near-plane placeholders need no finite projected geometry.
    if (portrait.visible === false) return [];
    const px = finite(portrait.x, `portraits[${index}].x`);
    const py = finite(portrait.y, `portraits[${index}].y`);
    const diameter = positive(portrait.diameter, `portraits[${index}].diameter`);
    const radius = diameter / 2 + gapPx;
    if (!Number.isFinite(radius)) throw new RangeError('inflated portrait radius overflows');
    return [{ x: px, y: py, radius, index }];
  });

  function rectangle(scale) {
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    const left = x - width / 2;
    const right = x + width / 2;
    const top = y - height / 2;
    const bottom = y + height / 2;
    if (![width, height, left, right, top, bottom].every(Number.isFinite)
      || width <= 0 || height <= 0) {
      throw new RangeError('scaled text rectangle is not finite and positive');
    }
    return { x, y, width, height, left, right, top, bottom };
  }
  // Validate both extremes before deciding any outcome.
  rectangle(minScale);
  rectangle(preferredScale);

  function blockers(scale) {
    const halfWidth = naturalWidth * scale / 2;
    const halfHeight = naturalHeight * scale / 2;
    return disks.filter(disk => {
      const dx = Math.max(Math.abs(disk.x - x) - halfWidth, 0);
      const dy = Math.max(Math.abs(disk.y - y) - halfHeight, 0);
      return Math.hypot(dx, dy) <= disk.radius;
    }).map(disk => disk.index);
  }
  function result(scale, fits, reason, iterations, blockingPortraitIndices) {
    return {
      ...rectangle(scale), scale, cssScale: scale, fits, infeasible: !fits,
      reason, iterations, blockingPortraitIndices,
    };
  }
  if (blockers(preferredScale).length === 0) {
    return result(preferredScale, true, 'preferred-fits', 0, []);
  }
  const floorBlockers = blockers(minScale);
  if (floorBlockers.length) {
    return result(minScale, false, 'minimum-infeasible', 0, floorBlockers);
  }
  let low = minScale;
  let high = preferredScale;
  let iterations = 0;
  for (; iterations < 48; iterations++) {
    const mid = low + (high - low) / 2;
    if (mid === low || mid === high) break;
    if (blockers(mid).length) high = mid;
    else low = mid;
  }
  return result(low, true, 'fitted-interior', iterations, []);
}
