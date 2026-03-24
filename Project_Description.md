# Project Specification: Vintage OTR Radio Receiver

## 1. Project Overview
A fully-decoupled, skeuomorphic web application designed to simulate the tactile experience of a 1940s-era Cathedral tabletop radio. It features a continuous, randomly generated audio broadcast engine that scans through local directories of MP3 files, seamlessly blending them with interactive radio static and dynamic lighting based on signal strength.

## 2. Technical Stack
- **Containerization**: Docker & Docker Compose (Microservices Architecture)
- **Backend (API)**: Node.js 18 (Slim) / Express.js (Port `3000`)
- **Frontend (Web)**: Nginx:alpine (Port `8080`)
- **Core Languages**: Vanilla JavaScript (ES6+), CSS3 Geometries (No image assets), Web Audio/HTML5 Audio API.

## 3. Project Structure
**Root Directory:** `old-radio-app/`

- **`docker-compose.yml`**: Orchestrates the dual-container architecture (Node API + Nginx Web).
- **`Dockerfile` & `package.json`**: Defines the Node.js backend environment securely leveraging `cors`.
- **`server.js`**: The backend API. Recursively scans the `/stations` directory into root folders and "shows" and exposes them identically over `http://localhost:3000/api/stations`.
- **`stations/`**: An external directory containing structural subfolders (e.g., `stations/Station Name/Show Name/episode.mp3`).
- **`public/`**: Contains the frontend interface directly served via Nginx:
  - `index.html`: The UI structural layouts and hardware nodes.
  - `style.css`: The native 100% CSS "Mahogany & Brass" visual styling, skeuomorphic lighting, and dynamic Dymo label tape definitions.
  - `script.js`: The central tracking engine. Manages `API_BASE_URL` routing, tuning proximity algorithms, and continuous async audio streams.
  - `static.mp3`: The local radio hiss audio file.

## 4. Backend Logic (`server.js`)
The server executes a deep recursive scan of the `/stations` directory:
- **Discovery**: Categorizes files by their top-level root (Station) and their immediate subfolder (Show).
- **Frequency Assignment**: The valid structural station array is heavily randomized and mapped across the dial frequencies (starting at 550kHz, incrementing by 200kHz up to 2500kHz).
- **API Output**: Returns a localized JSON array mapping structural frequencies and deeply nested show tracks.

## 5. Frontend Mechanics (`script.js`)
The tuning engine mathematically manages the browser audio objects via a highly tuned proximity mixer:
- **Tuning Range**: Station signals effectively overlap their physical dial bounds by `80kHz`.
- **Logarithmic Smoothing (Audio Taper)**: The generic `input` slider utilizes a squared math translation (`Math.pow(masterVolume, 2)`) alongside the distance multiplier to calculate highly realistic audio fade profiles simulating organic human hearing.
- **Continuous Simulation Queue**: Audio elements are bound to `ended` listeners. Tracks are uniquely queued evenly by `Show` (preventing consecutive episodes from pulling from the identical parent folder), producing an endless 24/7 localized broadcast stream.
- **Hardware Power & Interaction**: The web-page strictly halts file loads and audio parsing until the global red `I/O` physical power switch is triggered by the user.

## 6. Visual Design (`style.css`)
- **Chassis**: A gorgeous "Cathedral" style rounded body composed purely of CSS repeating linear gradients simulating mahogany woodgrain.
- **Tuning Wheel**: A massive interactive analog dial composed of conical gradients drawing heavy shadows mapping 270 degrees of rotation.
- **Dymo Tape Ribbon**: A digital index card uniquely mapping jagged `clip-path` masks and internal text geometries that natively parses the backend directory hierarchies to print the title of currently broadcasting shows.
- **Cinematic Environment**: A polished tabletop horizon bounds the chassis natively utilizing `-webkit-box-reflect` to draw physical radio shadowing, complemented by a massive `requestAnimationFrame` interactive wall spotlight constantly flickering dynamically in parallel with the mathematical audio static.

## 7. Operational Instructions
- **Launch**: Run `docker-compose up --build -d` in the project root.
- **Audio**: Place radio shows perfectly nested in subfolders inside the `/stations` directory (`stations/Name/Show/file.mp3`).
- **Access**: Open a browser to `http://localhost:8080` (or target the raw API backend on `http://localhost:3000`).
