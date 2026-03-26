const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = 3001;
const STATIONS_DIR = path.join(__dirname, 'stations');
const ALIASES_FILE = path.join(__dirname, 'aliases.json');
const STATE_FILE = path.join(__dirname, 'station-state.json');

app.use(cors());

let STATION_ALIASES = {};
let stationStates = {};
const stations = [];

function loadAliases() {
    try {
        if (fs.existsSync(ALIASES_FILE)) {
            const data = fs.readFileSync(ALIASES_FILE, 'utf8');
            STATION_ALIASES = JSON.parse(data);
            console.log(`[ALIASES] Loaded ${Object.keys(STATION_ALIASES).length} station aliases.`);
        }
    } catch (e) {
        console.error(`[ALIASES] Error loading aliases: ${e.message}`);
    }
}

function loadStates() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            stationStates = JSON.parse(data);
            console.log(`[STATE] Loaded playback state for ${Object.keys(stationStates).length} stations.`);
        }
    } catch (e) {
        console.error(`[STATE] Error loading state: ${e.message}`);
    }
}

function saveStates() {
    try {
        const newState = {};
        stations.forEach(s => {
            newState[s.folder] = {
                played: s.played,
                unplayed: s.unplayed,
                currentTrack: s.currentTrack
            };
        });
        fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
    } catch (e) {
        console.error(`[STATE] Error saving state: ${e.message}`);
    }
}

// Watch for alias changes
fs.watch(ALIASES_FILE, (eventType) => {
    if (eventType === 'change') {
        console.log(`[ALIASES] aliases.json changed, reloading...`);
        loadAliases();
        stations.forEach(s => {
            s.name = STATION_ALIASES[s.folder] || s.folder.replace(/-/g, ' ');
        });
    }
});

class Station {
    constructor(id, name, folder) {
        this.id = id;
        this.name = name;
        this.folder = folder;
        this.broadcastStream = new PassThrough();
        this.broadcastStream.setMaxListeners(0);
        this.clients = new Set();
        this.currentTrack = null;
        this.currentFolder = folder;
        this.currentTimemark = '00:00:00';
        this.frequency = 0;

        const saved = stationStates[folder] || {};
        this.played = saved.played || [];
        this.unplayed = saved.unplayed || [];
        
        this.syncLibrary();

        // Fan-out mechanism with backpressure protection
        this.broadcastStream.on('data', (chunk) => {
            if (this.clients.size === 0) return;
            this.clients.forEach(client => {
                try {
                    if (!client.write(chunk)) {
                        client.destroy();
                        this.clients.delete(client);
                    }
                } catch (e) {
                    this.clients.delete(client);
                }
            });
        });
        this.broadcastStream.resume();
    }

    syncLibrary() {
        const diskFiles = this.getAllFilesRecursive(path.join(STATIONS_DIR, this.folder));
        
        // Cleanup state
        this.played = this.played.filter(f => diskFiles.includes(f));
        this.unplayed = this.unplayed.filter(f => diskFiles.includes(f));

        // Add new discoveries
        diskFiles.forEach(file => {
            if (!this.played.includes(file) && !this.unplayed.includes(file)) {
                this.unplayed.push(file);
            }
        });
    }

    getAllFilesRecursive(dir) {
        let results = [];
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            if (fs.lstatSync(fullPath).isDirectory()) {
                results = results.concat(this.getAllFilesRecursive(fullPath));
            } else if (file.endsWith('.mp3') || file.endsWith('.m4a')) {
                results.push(fullPath);
            }
        }
        return results;
    }

    start() {
        if (this.played.length === 0 && this.unplayed.length === 0) {
            console.error(`[STATION ${this.id}] No audio files in ${this.folder}`);
            return;
        }
        console.log(`[STATION ${this.id}] Starting broadcast: ${this.name}`);
        this.playNext();
    }

    playNext() {
        if (this.unplayed.length === 0) {
            console.log(`[STATION ${this.id}] Cycle complete. Reshuffling library...`);
            this.unplayed = [...this.played];
            this.played = [];
        }

        const randomIndex = Math.floor(Math.random() * this.unplayed.length);
        const file = this.unplayed.splice(randomIndex, 1)[0];
        this.played.push(file);
        
        saveStates();
        this.currentTrack = path.basename(file);
        this.currentFolder = path.basename(path.dirname(file));
        this.currentTimemark = '00:00:00';
        printStationStatus();

        ffmpeg(file)
            .native()
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioChannels(2)
            .audioFrequency(44100)
            .audioFilters('dynaudnorm=p=0.9:s=5')
            .on('progress', (p) => { this.currentTimemark = p.timemark; })
            .on('end', () => { this.playNext(); })
            .on('error', (err) => {
                console.error(`[STATION ${this.id}] Error: ${err.message}`);
                setTimeout(() => this.playNext(), 5000);
            })
            .pipe(this.broadcastStream, { end: false });
    }

    addClient(res) { this.clients.add(res); }
    removeClient(res) { this.clients.delete(res); }
}

function printStationStatus() {
    const memUsage = process.memoryUsage();
    const cpuLoad = os.loadavg()[0].toFixed(2);
    const uptime = (process.uptime() / 60).toFixed(1);

    console.log(`\n--- 📡 RADIO STATUS UPDATE ---`);
    console.log(`[STATS] CPU Load: ${cpuLoad} | Mem RSS: ${(memUsage.rss / 1048576).toFixed(2)}MB | Uptime: ${uptime}m`);
    stations.forEach(s => {
        const track = s.currentTrack || 'Buffering...';
        console.log(`[${s.frequency} kHz] Playing: ${track} (@ ${s.currentTimemark}) [${s.clients.size} listeners]`);
    });
}

function initializeStations() {
    loadAliases();
    loadStates();

    let folders = fs.readdirSync(STATIONS_DIR)
        .filter(f => fs.lstatSync(path.join(STATIONS_DIR, f)).isDirectory());

    folders = folders.sort(() => 0.5 - Math.random());
    if (folders.length > 13) folders = folders.slice(0, 13);

    folders.forEach((folder, index) => {
        const name = STATION_ALIASES[folder] || folder.replace(/-/g, ' ');
        const station = new Station(index, name, folder);
        
        let hash = 0;
        for (let i = 0; i < folder.length; i++) {
            hash = ((hash << 5) - hash) + folder.charCodeAt(i);
            hash |= 0;
        }
        const jitter = Math.abs(hash % 90); 
        station.frequency = 600 + (index * 150) + (jitter - 45);
        station.frequency = Math.round(station.frequency / 10) * 10;

        station.start();
        stations.push(station);
    });

    console.log(`=== 📻 RADIO AIRWAVES INITIALIZED (${stations.length} stations) ===`);
}

app.get('/api/stations', (req, res) => {
    res.json(stations.map(s => ({
        id: s.id, name: s.name, folderName: s.folder, currentFolder: s.currentFolder,
        frequency: s.frequency, currentTrack: s.currentTrack, listeners: s.clients.size
    })));
});

app.get('/stream/:id', (req, res) => {
    const station = stations.find(s => s.id === parseInt(req.params.id));
    if (!station) return res.status(404).send("Station not found");
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    station.addClient(res);
    req.on('close', () => { station.removeClient(res); });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Streaming Server listening on port ${PORT}`);
    initializeStations();
});
