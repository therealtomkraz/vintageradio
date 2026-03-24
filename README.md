# 📻 Vintage Radio Simulator

A fully decoupled, Dockerized Old Time Radio (OTR) broadcasting engine and skeuomorphic web player.

Designed to recreate the tactile, immersive experience of turning a 1940s Cathedral radio dial and hunting for live broadcasts hidden amidst static noise.

## Features

- **Pure Skeuomorphic CSS UI**: No external image files. The entire radio chassis, lighting environment, and realistic polished desk reflection are generated purely using native CSS3 geometries and deep gradients.
- **Dynamic Microservices Architecture**: 
  - **Backend (Node.js/Express)**: Recursively parses an internal file system to categorize and dynamically stream raw MP3 folders over a headless Port `3000` API.
  - **Frontend (Nginx)**: Serves the lightweight web client on Port `8080`, seamlessly linking to the remote Node API. This decoupled split prepares the interface for future porting to a native Android APK shell.
- **Organic Tape Metadata**: Parses the physical folder hierarchies on the backend and uses Javascript to "print" the name of the current broadcasting show linearly onto a vintage Dymo-style digital label on the radio chassis when the user perfectly locks onto a frequency.
- **Continuous Simulation Engine**: Audio is streamed continuously in the background mimicking an "always-on" transmission tower. Changing the dial cross-fades streams mathematically simulating authentic RF static noise.

## 🚀 Installation & Deployment

This application heavily leverages Docker for immediate deployment.

1. **Clone the repository**:
```bash
git clone https://github.com/therealtomkraz/vintageradio.git
cd vintageradio
```

2. **Supply your Media Library**:
Create a folder inside the root repository named `stations/`. The backend will recursively read `.mp3` and `.m4a` files placed here and automatically arrange them onto dial frequencies (600kHz, 800kHz, etc). 
For the engine to logically queue tracks optimally natively grouping them by "Show":
```text
stations/
  └── My Mystery Station/
      ├── The Shadow/
      │   └── episode1.mp3
      └── Suspense!/
          └── episode2.mp3
```

3. **Spin up the Environment**:
```bash
docker-compose up --build -d
```

4. **Access the Radio**:
Navigate your browser to `http://localhost:8080`. (If you are on a smartphone on the same LAN, simply navigate to `http://YOUR-SERVER-IP:8080` and the API targets will safely adjust themselves).

## Usage
- **Power On**: Click the red physical `I/O` button toggle to spark the tubes.
- **Dialing**: Drag the heavy central black tuning knob left and right to scan the dial (550kHz - 2500kHz).
- **Fine-Tuning**: If a broadcast is noisy, use the `<` and `>` keys beside the frequency readout (or use your desktop's scroll wheel) to inch the tuner by precise 1kHz increments.
- **Memory Presets**: Manually tune the radio to a clean signal, then **Long-Press** a silver `1-5` memory preset button until the frequency flashes white to hard-save it.

## 🗺️ Roadmap
The long-term goal of this project is a structural port to an ambient offline-first Android application designed specifically as a "cozy" auditory sleep aid.
For full details regarding upcoming WebAudio API filtering and Sleep Timer pipelines, please see [ROADMAP.md](./ROADMAP.md).
