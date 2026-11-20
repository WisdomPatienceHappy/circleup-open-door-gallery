# CircleUp · Adaptive video circle

Open [index.html](index.html). The video stage uses the screen below the header and above a compact bottom call bar. Zoom and reset sit in a separate side rail. The scene is clipped to its own area, so portraits cannot cover either control strip. The seating pivots at the center of this remaining area.

The seven original and eleven additional synthetic portraits stand in for video. Request a turn and demo speaker handoff simulate call interactions; mic, camera and leave labels remain illustrative.

Drag to turn and tilt through full rotations. Pinch or use the side buttons to zoom. Drag holds magnification, shape and pivot, preserves natural depth and never adds collision avoidance or fades. Release glides and springs back to the speaker. Arrow keys orbit, plus/minus zoom, and zero resets the view. Reduced motion removes the animated return.

Choose 3–18 people at the top. At 18, the Adjust layout drawer offers one ring or two rings (6 inside, 12 outside). Portraits always stay round and face the viewer; natural overlaps and edge cropping remain possible.

**Adjust layout** scrolls internally on short screens and contains:

- **Face size**, 80–150%, starting at 110%.
- **Circle spacing**, 75–125%, changing distances between seat centers.
- **Oval direction**: Adaptive fits the screen (taller on phone, wider on desktop), or choose Always taller, Always wider, or Round.
- **Ovality**, 0–100%, tunes the shape's strength. Adaptive strength responds to screen aspect ratio, group size and zoom, easing toward rounder at close range. It stays constant while dragging. Only positions and the rim change; portraits are never stretched.
- **Rest angle behavior**: Adaptive follows zoom, lowering at close range and becoming more overhead when zooming out. The Base rest angle slider adjusts that result at every zoom, including maximum zoom. The final tuned angle is fitted to the available vertical space, and the drawer shows the resulting resting angle. Fixed preserves the exact chosen angle and widens the resting camera only as needed to clear the portraits. Angles run −45° to 135°; if a Fixed configuration cannot fit even at minimum zoom, the drawer explains how to adjust it. Manual orbit remains free.
- **Preview width**, 320/375/390/430px, or Window width.
- **Compare previous version** opens the preserved Classic demo on the hosted site.
- **Reset layout** restores adaptive modes and layout defaults. **Reset view** restores full-table zoom and speaker focus.

The fixed ring and camera-facing projection adapt Uni's glyph-sphere.tsx. Drawn UI assets come from the Open Door Cut Paper Topics gallery. [Extra portrait prompt](portraits/imagegen-prompt.txt).

Chrome 1440×900, 390×844 and 844×390 plus WebKit 320×780 verified separate stage/bar/rail bounds, all four call cells in one row, adaptive and exact angle changes at maximum zoom, tall/wide/round choices, stable orbit zoom/shape/pivot, round opaque portraits, speaker return, pinch without premature recentering, internal drawer scrolling and all phone preview widths. These are browser-emulated checks, not physical-device or live-call tests.

[Phone capture](adaptive-390.png) · [Desktop capture](adaptive-1440.png)


## Gesture teaching and open conversation comparison

Drawn drag/pinch cues appear in the reserved header; each steps back after its gesture is used, with no change to the camera bounds. The side ? button opens instructions including keyboard controls.

Play/Pause in the header starts a fresh randomized example in the existing simulated conversation controller. Adjust layout → Open conversation offers Whole-circle conversation, Small-group exchange (2–4), or Long turn then replies, plus slower/natural/quick pace. Speaker order and speaking times vary on every Start/restart. Pause/resume and camera-style changes preserve the current run and its remaining turn. Preview defaults off; its default response is Calm cinematic camera. The speaking mark changes immediately. Stop, group/ring-layout change, reset layout or leaving the page cleans up the controller. This preview does not claim live active-speaker detection.

Calm starts wide, remembers recent speakers and keeps the current framing when brief replies fit. Camera style is separate from conversation pace: Gentle preserves the previous slow settings (tightening target from8 to40seconds); Balanced is the closer-sooner default (3 to20seconds); Lively moves in faster with more motion (1.5 to12seconds). These are target timing ranges, with actual framing constrained by the chosen layout. Switching styles preserves the current pose, conversation turn, pause and held gesture. Camera yaw, total pitch and zoom share one controller with stateful eased acceleration/deceleration. It retains momentum across changing targets and styles, rather than restarting an animation each turn. Necessary fit and zoom boundaries still constrain the actual frame; reduced motion skips animation. It uses observed speaker IDs and elapsed time only; the simulator’s future durations and random seed stay outside the policy. Natural depth and overlap remain allowed.

Dragging/pinching, keyboard turns and user zoom take priority; release resumes calm framing. Fixed selects the exact resting angle; a manually tilted view eases back to it on release. Adaptive keeps the rest-angle tuning offset. The old Follow every change spring and Brief pause before moving remain comparison options. Extreme geometry can prevent a whole-group fit; the model reports this instead of moving seats, fading people or silently changing layout controls.


## Optional example video

Open Adjust layout/view → Example videos → Play example videos. Video mode defaults off and loads independent NASA interview clips from the public HTTP video lab;18 participants include18 distinct video URLs, including the seated self-preview. Select180p15,360p15 or360p30. Participant names remain illustrative, footage and credits are explicit, and no camera/microphone or meeting connection is used. Stop restores photos and unloads all clips. For raw performance measurements use the separate Video Load Test; playing counts alone are not sustained phone-performance evidence.


The visible header Play/Pause action uses the same simulated conversation controller as Adjust layout. Pause freezes the current turn and camera movement; Play resumes its remaining turn time. Drawer Stop/restart and all current layout settings remain available. Default remains off.


## Calm-camera review

The policy API and numerical trace limits are documented in the canonical conversation-camera proposal. The latest reviewed source hashes and trajectory receipts are recorded in the November19 integration handoff. Automatic framing also checks a vertical portrait envelope so an unknown next speaker does not inherit a cropped foreground position; horizontal side peeks and natural overlap remain. Parent compared the actual pre-change projector against the new pure candidate projector across470016 scalar values in Chrome/WebKit at phone, desktop and landscape sizes; all matched exactly. Browser interaction and real-time/media receipts are maintained separately in the workspace work folder. These checks do not establish physical-phone or eighteen-participant provider-call capacity.



## Random example patterns

Whole-circle conversation visits every selected participant once per shuffled round, without repeating across round boundaries. Its first turn varies from8–18seconds, then it mixes short replies, medium turns and occasional longer leads. A voices-heard count makes coverage visible. Small-group exchange (2–4) chooses a small changing group with400–2800ms turns. Long turn then replies uses varied30–60second leads and2–5brief replies. Conversation pace scales these times. Each new run uses fresh entropy; explicit seeds are available to test/replay the same observed input without supplying future information to the camera. The generator owns no timers, DOM or media.


## Deliberate stick handoff

The visible **Pass stick** action passes to the next seated person; Adjust layout → **Pass the stick** also offers a named recipient. A small drawn stick travels for1.1seconds before the actual holder changes. It pauses a running conversation during travel and stops that simulation at arrival, then uses the room's existing speaker-return camera. Stop, group changes and leaving the page cancel a pending pass; reduced motion commits immediately. The decoration stays within the video stage, clear of the header and bottom controls. This remains an illustrative handoff, not real meeting authority.
