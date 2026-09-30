# Biplane Adventure

A browser based 3D biplane game built with Three.js. Fly through a low poly landscape, fight through eight missions, and jump out of the plane to explore on foot.

## Play

Open `index.html` from a static web server or the project's live preview. The game loads Three.js and nipplejs from CDNs, so an internet connection is needed.

### Controls

| Action | Plane | On foot |
| --- | --- | --- |
| Move | WASD | WASD |
| Shoot | Space | Space |
| Climb / descend | Space / Shift | — |
| Jump out / enter plane | E | E |
| Toggle controls | H | H |

On touch devices, use the on-screen joystick and buttons. The interface also includes sound and fullscreen controls.

## Project files

- `index.html` — game interface and browser module imports
- `game.js` — Three.js scene, gameplay, missions, controls, and audio
- `biplane.js` — biplane visual enhancements
- `styles.css` — game HUD and layout
- `*.glb`, `*.png`, `*.jpg` — models and textures
- `sound_*.mp3` — game sound effects and engine audio

There is no build step; the files are served directly.
