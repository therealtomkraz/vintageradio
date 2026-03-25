# Synchronized Streaming Architecture: Deep Dive

This document explains the technical implementation of the community-synchronized streaming engine (Phase 3) for the Vintage Radio Simulator.

## 1. The Core Synchronicity Logic
The goal of "Community Synchronization" is to ensure that every user tuning into a station hears the exact same audio at the same moment. 

### The "Fan-Out" Mechanism
Instead of each client starting their own audio playback, the server maintains a **single master stream** per station.
- **`broadcastStream`**: A Node.js `PassThrough` stream acts as a central hub.
- **Client Sets**: Every time a browser hits `/stream/:id`, it is added to a `Set` of active clients.
- **Data Distribution**: Whenever the master stream receives a chunk of audio data, it immediately writes that same chunk to every connected client in the set.

## 2. Audio Processing with FFmpeg
To keep the stream running indefinitely, we use `fluent-ffmpeg` to process audio files.
- **Continuous Loop**: The `playNext` function recursively calls itself when a track ends, picking the next file in the playlist.
- **Transcoding**: FFmpeg ensures that all source files (MP3, M4A, etc.) are transcoded into a consistent **128k MP3 stream** at **44.1kHz Stereo**. This prevents the stream from breaking when switching between files.
- **Piping**: The output of FFmpeg is piped directly into the `broadcastStream`, which then fans it out to all listeners.

## 3. Docker Interoperability
- **FFmpeg Integration**: The base image includes `ffmpeg` via `apt-get` on `node:18-slim`.
- **Infrastructure**: The `streaming_backend` runs on port `3001` and mounts the `./stations` volume for shared library access.

## 4. HTTP Streaming Protocol
The server uses standard HTTP streaming headers:
- `Content-Type: audio/mpeg`: Identifies the stream as MP3.
- `Transfer-Encoding: chunked`: Handles real-time data without a fixed content-length.
- `Connection: keep-alive`: Maintains the broadcast socket.

## 5. Granular Feature Breakdown

### 13-Station Parallel Broadcast
- **Selection Strategy**: On server startup, the script selects **13 random stations** from the library. 
- **Deterministic Dial Allocation**: Station frequencies are calculated using a **Noisy Grid** algorithm based on the folder name, ensuring layout consistency across restarts.
- **Round-Robin Interleaving**: Within each station, the engine rotates between all subfolders (Show Names) track-by-track for show variety.

### Synchronicity Mechanics
- **Total Streams**: Every station runs a separate background FFmpeg worker.
- **Universal Broadcast**: All connected clients for a specific station ID tune into the same shared stream.
- **Dymo Metadata Sync**: The server exposes the `currentFolder` (Show Name) in its metadata API, which the frontend polls every 15 seconds.

## 6. Performance & Stability
- **Lazy-Loading (Tuning Engine)**: The frontend only connects to stations within tuning range (+/- 120kHz) to respect browser connection limits.
- **Stream Consistency**: Enforced Stereo/44.1kHz format prevents decoder stalls.
- **Control Room Monitoring**: Real-time logging of CPU/Memory usage and track timing (@ HH:MM:SS).
