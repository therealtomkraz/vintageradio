# Vintage Radio App: Future Roadmap

This document outlines the architectural and feature milestones planned to evolve this application from a web-based Old Time Radio (OTR) emulator into a full-featured, immersive sleep and ambient listening tool.

## Phase 1: Core UX & Quality of Life
- [ ] **Mechanical Sleep Timer**: Introduce a rotating countdown dial (e.g., 15, 30, 60 minutes) that smoothly attenuates the `masterVolume` to 0% and triggers the `I/O` shutdown sequence to assist users falling asleep without jolting them awake.
- [ ] **Authentic Tube Audio EQ**: Integrate the native Web Audio API's `BiquadFilterNode` to digitally muffle high-treble frequencies and boost warm mid-bass, mathematically simulating the organic sound profile of audio pushed through a 1940s paper speaker cone and vacuum tubes.
- [x] **Metadata Tape Ribbon**: Add a subtle, skeuomorphic "Dymo label tape" or index card to the UI that natively parses and displays the name of the current file/episode broadcasted by the backend, allowing users to know the name of the story playing.

## Phase 2: Immersive Sleep Environments
- [ ] **Ambient Room Mixtures**: Introduce an environmental toggle switch mapped to dual-channel white noise generators (e.g., "Raining Outside", "Crackle of Fireplace"). These ambient room loops will mix dynamically beneath the radio broadcast and RF static.
- [ ] **Alarm Clock Integration**: Build a scheduling hook to automatically slowly spin up the radio interface and fade in a random morning chat show or vintage music broadcast at a precise wake-up time.

## Phase 3: Advanced Broadcast Logic
- [ ] **Serialized Show Continuity**: Upgrade the backend API from stateless pseudo-random arrays to a stateful database layer. If a user listens to Part 1 of an episode, the engine will queue Part 2 sequentially the next night, picking up right where the story dropped off.
- [ ] **Community Synchronization (True Live Broadcast)**: Migrate the backend to generate a universal Icecast or WebRTC stream. This forces every connected client (phones, desktops) to tune into the exact same synchronous audio point in real-time, recreating the communal experience of a live community transmission tower.

## Phase 4: Android Porting
- [ ] **Service Worker Audio Caching**: Configure standard Progressive Web App (PWA) service workers to silently buffer MP3 directories into local storage while on Wi-Fi, allowing the sleep radio to function on airplanes or in completely offline environments.
- [ ] **Capacitor / Ionic Shell**: Package the final stable HTML/CSS/JS frontend interface into a native Android `.apk`, strictly mapping the native `API_BASE_URL` back to the live, decoupled backend broadcasting server.
