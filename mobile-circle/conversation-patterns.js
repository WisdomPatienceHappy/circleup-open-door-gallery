/** Lazy simulated turns. Presentation only: no camera, timers, DOM or media. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CircleUpConversationPatterns = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  function freshSeed() {
    try {
      if (typeof root.crypto?.getRandomValues === 'function') {
        return root.crypto.getRandomValues(new Uint32Array(1))[0];
      }
    } catch (_) { /* Restricted contexts still get a fresh illustrative run. */ }
    return (Math.floor(Math.random() * 4294967296) ^ Date.now() ^
      Math.floor((root.performance?.now?.() ?? 0) * 1000)) >>> 0;
  }

  function randomFrom(seed) {
    let state = seed;
    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(options) {
    if (!options || !Array.isArray(options.ids) || options.ids.length === 0 ||
        Array.from(options.ids).some(id => !Number.isSafeInteger(id) || id < 0) ||
        new Set(options.ids).size !== options.ids.length) {
      throw new TypeError('Conversation ids must be a non-empty list of distinct non-negative integers.');
    }
    const kind = options.kind ?? 'mixed';
    if (!['mixed', 'backforth', 'sustained'].includes(kind)) {
      throw new TypeError('Unknown conversation pattern.');
    }
    const seed = options.seed === undefined ? freshSeed() : options.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
      throw new TypeError('Conversation seed must be an unsigned 32-bit integer.');
    }
    const ids = options.ids.slice();
    const random = randomFrom(seed);
    const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
    let last, beforeLast, first = true, cluster = [], clusterRemaining = 0;
    let lead, repliesRemaining = 0;

    function choose(pool, preferReply = false) {
      const available = pool.filter(id => id !== last);
      const candidates = available.length ? available : ids.filter(id => id !== last);
      if (!candidates.length) return ids[0];
      if (preferReply && candidates.includes(beforeLast) && random() < .52) return beforeLast;
      return candidates[integer(0, candidates.length - 1)];
    }

    function newCluster() {
      const shuffled = ids.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = integer(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      cluster = shuffled.slice(0, integer(Math.min(2, ids.length), Math.min(4, ids.length)));
      clusterRemaining = integer(8, 18);
    }

    function next() {
      let speaker, durationMs;
      if (kind === 'mixed') {
        speaker = choose(ids, !first);
        // Initial room to settle; subsequent turns mix replies, turns and leads.
        const category = first ? -1 : random();
        durationMs = first ? integer(8000, 18000) : category < .44 ? integer(450, 2800)
          : category < .84 ? integer(3000, 10000) : integer(12000, 32000);
      } else if (kind === 'backforth') {
        if (clusterRemaining === 0) newCluster();
        speaker = choose(cluster, true);
        durationMs = integer(400, 2800);
        clusterRemaining--;
      } else if (repliesRemaining === 0) {
        const newLeads = ids.filter(id => id !== lead && id !== last);
        speaker = choose(newLeads.length ? newLeads : ids);
        lead = speaker;
        durationMs = integer(30000, 60000);
        repliesRemaining = integer(2, 5);
      } else {
        speaker = choose(ids.filter(id => id !== lead), true);
        durationMs = integer(500, 3200);
        repliesRemaining--;
      }
      beforeLast = last;
      last = speaker;
      first = false;
      return { speaker, durationMs };
    }

    return Object.freeze({ seed, next });
  }

  return Object.freeze({ create });
});
