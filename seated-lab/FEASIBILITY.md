# Optional shared orientation

This demo simulates chosen viewing direction locally. It does not measure eye gaze or provide literal eye contact. Sharing a direction could orient each participant's whole video surface while leaving its source video unchanged.

RealtimeKit supports data broadcasts, with a published maximum of5calls per second per participant. However, broadcast payloads are forwarded without verified sender identity. A participant ID supplied inside a payload cannot establish attribution.

A live implementation needs authenticated sender binding or a separately reviewed attributed ephemeral relay. It must retain room/session/assignment fences, explicit per-call opt-in, bounded schemas, rate coalescing, ordering, smoothing, stale/offline states and cleanup. Orientation must never block media or room commands, and no attention history should be recorded.

Official references: [Message broadcast](https://developers.cloudflare.com/realtime/realtimekit/collaboration/message-broadcast/), [SDK limits](https://developers.cloudflare.com/realtime/realtimekit/platform/limits/), [Broadcast attribution caveat](https://developers.cloudflare.com/realtime/realtimekit/agents/events/#broadcast-events).
