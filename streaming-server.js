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

app.use(cors());

const ALIASES_FILE = path.join(__dirname, 'aliases.json');
let STATION_ALIASES = {};

// Load aliases from JSON file
function loadAliases() {
    try {
        if (fs.existsSync(ALIASES_FILE)) {
            const data = fs.readFileSync(ALIASES_FILE, 'utf8');
            STATION_ALIASES = JSON.parse(data);
            console.log(`[ALIASES] Loaded ${Object.keys(STATION_ALIASES).length} station aliases.`);
            
            // Update existing stations with new names if they already exist
            stations.forEach(s => {
                const newName = STATION_ALIASES[s.folder] || s.folder.replace(/-/g, ' ');
                if (s.name !== newName) {
                    console.log(`[ALIASES] Renaming station ${s.id}: "${s.name}" -> "${newName}"`);
                    s.name = newName;
                }
            });
        }
    } catch (e) {
        console.error(`[ALIASES] Error loading aliases: ${e.message}`);
    }
}

// Watch for alias changes
fs.watch(ALIASES_FILE, (eventType) => {
    if (eventType === 'change') {
        console.log(`[ALIASES] aliases.json changed, reloading...`);
        loadAliases();
    }
});

// Initial load
loadAliases();

// Global state for stations
const stations = [];

class Station {
    constructor(id, name, folder) {
        this.id = id;
        this.name = name;
        this.folder = folder;
        this.files = this.getAudioFiles(path.join(STATIONS_DIR, folder));
        this.broadcastStream = new PassThrough();
        this.broadcastStream.setMaxListeners(0); // Prevent warnings from repeated piping
        this.clients = new Set();
        this.currentTrack = null;
        this.currentFolder = folder; // Default to station folder
        this.currentTimemark = '00:00:00';
        this.frequency = 0; // Set after construction

        // Fan-out mechanism
        this.broadcastStream.on('data', (chunk) => {
            this.clients.forEach(client => {
                try {
                    client.write(chunk);
                } catch (e) {
                    this.clients.delete(client);
                }
            });
        });
    }

    getAudioFiles(stationDir) {
        const groups = {}; // Map of subfolder names to arrays of files
        try {
            const items = fs.readdirSync(stationDir);
            for (const item of items) {
                const fullPath = path.join(stationDir, item);
                const stats = fs.lstatSync(fullPath);
                
                if (stats.isDirectory()) {
                    // Collect all files in this subfolder (e.g. "The Shadow")
                    const subFiles = this.getAllFilesRecursive(fullPath);
                    if (subFiles.length > 0) groups[item] = subFiles;
                } else if (item.endsWith('.mp3') || item.endsWith('.m4a')) {
                    // Files directly in the station folder
                    if (!groups['root']) groups['root'] = [];
                    groups['root'].push(fullPath);
                }
            }
        } catch(e) {
            console.error(`[STATION ${this.id}] Error reading dir: ${e.message}`);
        }

        return this.interleaveGroups(groups);
    }

    getAllFilesRecursive(dir) {
        let results = [];
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

    interleaveGroups(groups) {
        const interleaved = [];
        const keys = Object.keys(groups);
        if (keys.length === 0) return [];

        // Continue until all files from all groups are used
        let addedInRound = true;
        let filePointers = {}; // Track index for each group
        keys.forEach(k => filePointers[k] = 0);

        while (addedInRound) {
            addedInRound = false;
            for (const key of keys) {
                const groupFiles = groups[key];
                const ptr = filePointers[key];
                if (ptr < groupFiles.length) {
                    interleaved.push(groupFiles[ptr]);
                    filePointers[key]++;
                    addedInRound = true;
                }
            }
        }
        return interleaved;
    }

    start() {
        if (this.files.length === 0) {
            console.error(`[STATION ${this.id}] No audio files in ${this.folder}`);
            return;
        }

        console.log(`[STATION ${this.id}] Starting broadcast: ${this.name}`);
        this.playNext(0);
    }

    playNext(index) {
        const file = this.files[index % this.files.length];
        this.currentTrack = path.basename(file);
        
        // Get the parent folder name (e.g. "The Shadow" inside "Comedy")
        const parentPath = path.dirname(file);
        this.currentFolder = path.basename(parentPath);
        
        this.currentTimemark = '00:00:00'; // Reset clock for new track
        // Trigger a global status update for the logs
        printStationStatus();

        ffmpeg(file)
            .native() // Enforce real-time playback speed (-re)
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioChannels(2)
            .audioFrequency(44100)
            .on('progress', (progress) => {
                this.currentTimemark = progress.timemark;
            })
            .on('end', () => {
                this.playNext(index + 1);
            })
            .on('error', (err) => {
                console.error(`[STATION ${this.id}] Error: ${err.message}`);
                setTimeout(() => this.playNext(index + 1), 1000);
            })
            .pipe(this.broadcastStream, { end: false });
    }

    addClient(res) {
        this.clients.add(res);
        console.log(`[STATION ${this.id}] New client connected. Total: ${this.clients.size}`);
    }

    removeClient(res) {
        this.clients.delete(res);
        console.log(`[STATION ${this.id}] Client disconnected. Total: ${this.clients.size}`);
    }
}

// Global status reporter for Docker logs
function printStationStatus() {
    const memUsage = process.memoryUsage();
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);
    const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const cpuLoad = os.loadavg()[0].toFixed(2);
    const uptime = (process.uptime() / 60).toFixed(1);

    console.log(`\n--- 📡 RADIO STATUS UPDATE (${new Date().toLocaleTimeString()}) ---`);
    console.log(`[STATS] CPU Load: ${cpuLoad} | Mem RSS: ${rssMB}MB (Heap: ${heapMB}MB) | Uptime: ${uptime}m`);
    console.log(`----------------------------------------------------------`);
    stations.forEach(s => {
        const trackStr = s.currentTrack ? s.currentTrack : 'Buffering...';
        console.log(`[${s.frequency} kHz] Playing: ${trackStr} (@ ${s.currentTimemark}) [${s.clients.size} listeners]`);
    });
    console.log(`----------------------------------------------------------\n`);
}

// Initialize all stations from directory
function initializeStations() {
    let folders = fs.readdirSync(STATIONS_DIR)
        .filter(f => fs.lstatSync(path.join(STATIONS_DIR, f)).isDirectory());

    // Shuffle and limit to 13 stations
    folders = folders.sort(() => 0.5 - Math.random());
    if (folders.length > 13) {
        folders = folders.slice(0, 13);
    }

    folders.forEach((folder, index) => {
        const name = STATION_ALIASES[folder] || folder.replace(/-/g, ' ');
        const station = new Station(index, name, folder);
        
        // Deterministic but random-looking frequency allocation
        // 600 + (index * 140) + (pseudo-random jitter based on folder name)
        let hash = 0;
        for (let i = 0; i < folder.length; i++) {
            hash = ((hash << 5) - hash) + folder.charCodeAt(i);
            hash |= 0;
        }
        const jitter = Math.abs(hash % 90); 
        station.frequency = 600 + (index * 150) + (jitter - 45);
        // Round to nearest 10kHz for authentic AM spacing
        station.frequency = Math.round(station.frequency / 10) * 10;

        station.start();
        stations.push(station);
    });

    console.log(`\n=== 📻 RADIO AIRWAVES INITIALIZED ===`);
    console.log(`Found ${stations.length} stations allocated to the dial:`);
    stations.forEach(s => {
        console.log(`[${s.frequency} kHz] - ${s.name} (${s.files.length} tracks)`);
    });
    console.log(`======================================\n`);

    // Initial status print
    printStationStatus();

    // Watch for new folders dynamically added at runtime
    console.log(`[WATCHER] Monitoring ${STATIONS_DIR} for new stations...`);
    fs.watch(STATIONS_DIR, (eventType, filename) => {
        if (eventType === 'rename' && filename) {
            const fullPath = path.join(STATIONS_DIR, filename);
            try {
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                    // Check if we already have this station
                    const exists = stations.find(s => s.folder === filename);
                    if (!exists) {
                        console.log(`[WATCHER] New station folder detected: ${filename}`);
                        // Assign next available ID
                        const nextId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 0;
                        const alias = STATION_ALIASES[filename] || filename.replace(/-/g, ' ');
                        const newStation = new Station(nextId, alias, filename);
                        
                        // Apply the same deterministic frequency logic
                        let hash = 0;
                        for (let i = 0; i < filename.length; i++) {
                            hash = ((hash << 5) - hash) + filename.charCodeAt(i);
                            hash |= 0;
                        }
                        const jitter = Math.abs(hash % 90); 
                        newStation.frequency = 600 + (nextId * 150) + (jitter - 45);
                        newStation.frequency = Math.round(newStation.frequency / 10) * 10;

                        newStation.start();
                        stations.push(newStation);
                        
                        console.log(`[WATCHER] Station "${alias}" added to airwaves at ${newStation.frequency} kHz.`);
                        printStationStatus();
                    }
                }
            } catch (e) {
                // Ignore folder deletions for now to keep it simple
            }
        }
    });

    // Periodic Heartbeat Log as a backup (every 5 minutes instead of 1 minute)
    setInterval(printStationStatus, 300000);
}

// API Endpoints
app.get('/api/stations', (req, res) => {
    const metadata = stations.map(s => ({
        id: s.id,
        name: s.name,
        folderName: s.folder,
        currentFolder: s.currentFolder,
        frequency: s.frequency, 
        currentTrack: s.currentTrack,
        listeners: s.clients.size
    }));
    res.json(metadata);
});

app.get('/stream/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const station = stations.find(s => s.id === id);

    if (!station) {
        return res.status(404).send("Station not found");
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');

    station.addClient(res);

    req.on('close', () => {
        station.removeClient(res);
    });
});

app.get('/api/status', (req, res) => {
    const totalListeners = stations.reduce((sum, s) => sum + s.clients.size, 0);
    res.json({
        totalStations: stations.length,
        totalListeners: totalListeners,
        status: 'online'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Multi-Channel Streaming Server listening on port ${PORT}`);
    initializeStations();
});
