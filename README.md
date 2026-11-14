# PaceLab — fast-bowling biomechanics on your Android phone

PaceLab is a web app: you open it in Chrome on Android, then add it to your home screen. After that it opens like a normal app and works offline. Every player, video and measurement stays on the phone.

## 1. Put it online (one-off, free, about 5 minutes)

The camera only works when the page is served over HTTPS, so the folder needs a free host.

**Easiest: Netlify Drop**
1. On a PC, unzip `pacelab.zip`.
2. Go to https://app.netlify.com/drop and sign up for a free account. Without an account, the site is deleted after an hour.
3. Drag the unzipped `pacelab` folder onto the page.
4. Netlify gives you a link like `https://something.netlify.app`. You can rename it under *Site configuration → Change site name*.

**Alternative: GitHub Pages.** Push the folder to a repository and turn on *Settings → Pages* (branch `main`, folder `/`). Use git or GitHub Desktop rather than the web uploader, because `pose_landmark_heavy.tflite` is over the web uploader's 25 MB limit.

## 2. Install on the phone
1. Open your link in **Chrome** on the Android phone.
2. Go to *Settings → Install PaceLab*, or use Chrome's ⋮ menu → *Add to home screen / Install app*.
3. Open it once while you have signal so the pose model gets cached (about 20 MB). After that it works offline at the nets.

## 3. Using it
- **Players** → *+ Add player*: name, bowling arm, height (needed for stride length in cm and approach speed). You can edit or delete a player from their page.
- **Analyse a new delivery**: choose a slow-motion video (best), record in the app, or open the camera app. Trim the clip from just before the jump to just after release. Then set the frame rate and say whether it was filmed in slow motion. Ball speed is optional.
- **Key moments**: before analysing, choose *Auto-detect* or *I'll mark them*. On the review screen, step frame by frame and use the *Mark TO / BFC / FFC / BR here* buttons. The app prompts you for the next one. *Auto-detect* and *Clear* are always available.
- **Scorecard**: each delivery gets traffic-light ratings (● Good, ▲ Work on, ■ Focus). Targets are coaching guides for senior bowlers; edit them under *Settings → Traffic-light targets*. Measures without a target are rated against the bowler's own average.
- **Library**: animated 3D model bowlers for side-on, front-on, semi-open and mixed actions, viewable from the side, front and behind, with what to look for at each key moment. These are simplified models, not recordings of real players. Tick *⭐ Use as a reference example* on any analysed clip to add your own footage to the Library.
- **Progress**: chart any measurement over the season, with the average for each session.
- **What drives pace?**: once 4 or more deliveries have speed-gun readings, it shows which measurements move with ball speed for that bowler.
- **Settings**: km/h or mph, tracking accuracy, whether to keep videos, CSV export for Excel, and backup/restore.

## Filming tips
Film side-on and square to the crease, with the phone fixed (no panning), from about 10–15 m away. Keep the whole body in frame. Use slow motion at 120–240 fps, film in good light, and set the camera up the same way every session.

## Measurements
- **Timing**: bound flight, back foot contact → front foot contact, front foot contact → release, back foot contact → release.
- **Run-up**: approach speed, stride length.
- **Legs**: back knee at BFC, front knee at FFC and at release, front-knee collapse.
- **Trunk**: forward lean and flexion; shoulder and hip alignment; hip–shoulder separation; shoulder counter-rotation, flagged above 30° as a back-injury risk.
- **Arm**: peak arm speed, release height, elbow extension (indicative only; this is **not** a legality test).
- **Kinematic sequence**: the order in which the pelvis, trunk and arm reach their peak speeds.

All of these are single-camera estimates. They are most useful for tracking change in the same bowler filmed the same way. Hip and shoulder rotation numbers are the least certain.

## Technical
Plain HTML/JS with no build step. Pose tracking is MediaPipe Pose (Apache 2.0), bundled in `mediapipe/` so it runs on-device. Data is stored in IndexedDB. `sw.js` provides offline caching; bump `VERSION` in it after changing any file.
