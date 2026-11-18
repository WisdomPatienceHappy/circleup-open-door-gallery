import {writeFile} from 'node:fs/promises';

const origin = 'https://playground.circleup.org';
const endpoint = new URL('/api/discovery/events?limit=50', origin);
const localTime = 'America/Los_Angeles';
const events = new Map();
const cursors = new Set();
let cursor;
let checkedAt;

function safeUrl(value) {
  if (typeof value !== 'string' || !value) return;
  try {
    const url = new URL(value, origin);
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {
    return undefined;
  }
}

function timeZoneFor(value) {
  if (typeof value === 'string' && value) {
    try {
      return new Intl.DateTimeFormat('en', {timeZone: value}).resolvedOptions().timeZone;
    } catch {
      return localTime;
    }
  }
  return localTime;
}

function normalize(wrapper) {
  const external = wrapper?.kind === 'external_unclaimed';
  const record = external ? wrapper.event : wrapper?.kind === 'native' ? wrapper.gathering : null;
  if (!record?.id || typeof record.title !== 'string' || !record.title.trim() || !Number.isFinite(Date.parse(record.startsAt))) {
    throw new Error('Unexpected public event record.');
  }
  const end = Date.parse(record.endsAt || record.startsAt);
  if (Number.isFinite(end) && end < Date.now()) return;
  const id = String(record.id);
  const detail = new URL((external ? '/external-events/' : '/gatherings/') + encodeURIComponent(id), origin);
  const source = external ? safeUrl(record.sourceUrl) || detail : detail;
  const variant = record.media?.variants?.find(image => Number(image.width) >= 480) || record.media;
  const image = safeUrl(variant?.url || record.photoUrl || record.bannerUrl || record.coverUrl);
  const format = {in_person: 'In person', online: 'Online', hybrid: 'Hybrid'}[record.format] || '';
  return {
    id: 'circleup-' + id,
    name: record.title,
    topic: 'community',
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    timeZone: timeZoneFor(record.timeZone),
    format,
    place: record.areaLabel || record.venueName || record.venueLabel || undefined,
    description: record.summary || record.description || '',
    source: source.href,
    credit: record.media?.credit,
    image: image?.origin === origin ? image.href : undefined,
    width: Number(variant?.width) > 0 ? Number(variant.width) : 4,
    height: Number(variant?.height) > 0 ? Number(variant.height) : 5
  };
}

do {
  if (cursor) endpoint.searchParams.set('cursor', cursor);
  const response = await fetch(endpoint, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Public discovery request failed (' + response.status + ').');
  const {data} = await response.json();
  if (!Array.isArray(data?.events)) throw new Error('Public discovery response has no events array.');
  checkedAt ??= Number.isFinite(Date.parse(data.selection?.asOf)) ? data.selection.asOf : new Date().toISOString();
  for (const entry of data.events) {
    const event = normalize(entry);
    if (event) events.set(event.id, event);
  }
  cursor = data.nextCursor;
  if (cursor && (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 40)) {
    throw new Error('Public discovery pagination did not terminate.');
  }
  if (cursor) cursors.add(cursor);
} while (cursor);

const path = process.argv[2] || 'flyer-wall/live-gatherings.json';
await writeFile(path, JSON.stringify({checkedAt, events: [...events.values()]}, null, 2) + '\n');
console.log('Refreshed ' + events.size + ' public event entries.');
