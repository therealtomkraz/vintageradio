const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use('/audio', (req, res, next) => {
    const decodedPath = decodeURIComponent(req.path);
    console.log(`[BROADCASTING] Streaming Track: ${decodedPath.replace(/^\//, '')}`);
    next();
}, express.static('stations'));

function getAudioFiles(dir, baseDir = '') {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            // Ensure forward slashes for URLs regardless of OS
            const relPath = baseDir ? baseDir + '/' + file : file;
            if (fs.lstatSync(fullPath).isDirectory()) {
                results = results.concat(getAudioFiles(fullPath, relPath));
            } else if (file.endsWith('.mp3') || file.endsWith('.m4a')) {
                // If it's in a subdirectory, the top-level folder is the "show"
                const show = relPath.includes('/') ? relPath.split('/')[0] : 'root';
                results.push({ file: relPath, show: show });
            }
        }
    } catch(e) {}
    return results;
}

app.get('/api/stations', (req, res) => {
    const stationsDir = path.join(__dirname, 'stations');
    try {
        if (!fs.existsSync(stationsDir)) {
           fs.mkdirSync(stationsDir);
        }
        
        const allItems = fs.readdirSync(stationsDir);
        let validFolders = [];
        
        allItems.forEach(item => {
            const itemPath = path.join(stationsDir, item);
            if (fs.lstatSync(itemPath).isDirectory()) {
                const files = getAudioFiles(itemPath);
                if (files.length > 0) {
                    validFolders.push({ folderName: item, files: files });
                }
            }
        });

        // Always shuffle all valid folders to assign frequencies completely randomly
        validFolders = validFolders.sort(() => 0.5 - Math.random());
        
        // Limit to 10 stations
        if (validFolders.length > 10) {
            validFolders = validFolders.slice(0, 10);
        }

        const stations = validFolders.map((item, index) => {
            return {
                id: index,
                name: item.folderName.replace(/-/g, ' '),
                folderName: item.folderName,
                frequency: 600 + (index * 200), 
                files: item.files
            };
        });

        console.log(`\n=== 📻 RADIO AIRWAVES INITIALIZED ===`);
        console.log(`Found ${stations.length} stations randomly allocated to the dial:`);
        stations.forEach(s => {
            console.log(`[${s.frequency} kHz] - ${s.name} (${s.files.length} tracks)`);
        });
        console.log(`======================================\n`);
        
        res.json(stations);
    } catch (err) {
        console.error("Error reading stations directory:", err);
        res.status(500).send("Server Error");
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Radio initialized. Listening on port ${PORT}`);
});
