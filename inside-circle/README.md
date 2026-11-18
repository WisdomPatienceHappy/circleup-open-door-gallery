# CircleUp · From your seat

This separate photo prototype looks **from within the circle**, rather than down onto it. Open [index.html](index.html), or append `?people=3` through `?people=18`.

The viewer occupies one fixed seat at `(0, 0, 1.04)` next to a unit ring. The other seats have equal fixed spacing. Dragging turns the viewer's gaze horizontally or vertically; it never moves the viewer or rotates/reseats the group. The horizon stays level. Zoom changes lens magnification, not the camera's position. All portrait circles remain camera-facing.

Release glides and springs back to the current speaking participant at eye level. Reduced motion returns immediately. Pinch or use +/− to zoom, use the arrow keys when the scene has focus, and press 0 to restore 100% magnification and face the speaker. **Face speaker** changes gaze only and keeps magnification.

The initial speaker is across the circle. **Adjust view** offers face diameter and field-of-view controls and a simulated speaker handoff. A stable self-preview identifies your own seat. The overview comparison carries the group size into the Adaptive demo route. Mic/camera/turn/leave controls have working illustrative states; no live call or media acquisition is performed.

A physical tradeoff of the seat-level view is that people share an eye-level band. On a narrow phone, fewer faces are visible and more vertical space is open. Near neighbors naturally appear larger than far-side people, including the speaker. Participants can overlap and crop or move behind the viewer's field of view as gaze changes. There is no collision avoidance, automatic pullback or forced speaker enlargement. This is intentionally a comparison option rather than a replacement for the overhead view.

## Validation

`work/check-inside-circle.cjs` accepts an optional hosted base URL. Chrome390×844,1440×900,844×390 and WebKit320×780 passed:

- Groups of3/7/12/18, with group count including self.
- Fixed camera position and ring geometry through gaze drag, pinch and lens zoom.
- Level circular billboard faces, speaker focus and release.
- Actual Chrome two-finger pinch without changing gaze or seat anchor while held.
- Separate scene bounds above the bottom call bar and left of the zoom rail.
- Working dialog, turn-request, mic/camera prototype states and leave/stay flow.

These are emulated-browser checks with synthetic portraits, not physical-device or live-media evidence. Existing drawn assets are copied from the Adaptive prototype.

[Phone](inside-390.png) · [Desktop](inside-1440.png)

Integration hook: `window.CircleUpInsidePreview.setSpeaker(index)` selects another seat (`1..count-1`); `snapshot()` exposes geometry for inspection. Index0 is the viewer. The static roster order is local to this exploration; a future live integration should supply the same authoritative participant/seat identities as the existing room.
