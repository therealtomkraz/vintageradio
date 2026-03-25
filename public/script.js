// --- Configuration ---
const minFreq = 550;
const maxFreq = 2500;
const tuningRange = 80;
const staticMaxVolume = 0.5;

// --- DOM Elements ---
const tuningKnob = document.getElementById('tuning-knob');
const volumeKnob = document.getElementById('volume-knob');
const dialImage = document.getElementById('css-dial');
const volDialImage = document.getElementById('css-vol-dial');
const freqReadout = document.getElementById('freq-readout');
const tunedIndicator = document.getElementById('tuned-indicator');
const metadataRibbon = document.getElementById('metadata-ribbon');
const staticAudio = document.getElementById('static-noise');
const presetBtns = document.querySelectorAll('.preset-btn');
const tuneDownBtn = document.getElementById('tune-down');
const tuneUpBtn = document.getElementById('tune-up');
const powerSwitch = document.getElementById('power-switch');
const radioContainer = document.querySelector('.radio-container');
const clearPresetsBtn = document.getElementById('clear-presets');
const sleepKnob = document.getElementById('sleep-knob');
const sleepLabel = document.getElementById('sleep-label');

// Add Sleep Globals
const sleepOptions = [0, 15, 30, 60];
let sleepStateIdx = 0;
let sleepEndTime = 0;
let sleepInterval = null;
let sleepAttenuation = 1.0;

// Dynamically target the host IP so LAN devices like phones can connect
const API_BASE_URL = `http://${window.location.hostname}:3000`;

let isPoweredOn = false;
let runtimePresets = {};
let masterVolume = 0.33;
let stations = [];
let stationAudioElements = {};
let currentStationId = null;
let hasInteracted = false;

// --- 1. Initialization ---
async function initRadio() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.querySelector('.volume-section').style.display = 'none';
        masterVolume = 1.0; // Force raw unattenuated gain so hardware buttons apply clearly
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/stations`);
        stations = await response.json();
    } catch (err) {
        console.error("Could not load stations:", err);
    }

    tuningKnob.dispatchEvent(new Event('input'));
    volumeKnob.dispatchEvent(new Event('input'));
}

// A function to play a satisfying mechanical click using Web Audio API
let audioCtx = null;
function playClickSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Deep, pleasant mechanical click with Triangle wave mapping
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.1);
    
    // Smooth 10ms envelope attack removes the harsh digital pop
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
}

// --- Ambient Lighting Engine ---
let updateLightFrame;
function updateLightFlicker() {
    if (!isPoweredOn) {
        document.body.classList.remove('power-on');
        return;
    }
    document.body.classList.add('power-on');

    let maxSignal = 0;
    let shortest = tuningRange;
    const currentFreq = parseInt(tuningKnob.value);

    stations.forEach(station => {
        const distance = Math.abs(currentFreq - station.frequency);
        if (distance < shortest) shortest = distance;
    });

    if (shortest < tuningRange) {
        maxSignal = 1 - (shortest / tuningRange);
    }

    // Core baseline brightness scales with signal lock (0.6 minimum ambient glow)
    const baseLight = 0.5 + (maxSignal * 0.5);
    // Jitter scales wildly in the 'static zone'
    const jitterAmount = (1 - maxSignal) * 0.45;

    const randomJitter = (Math.random() * jitterAmount) - (jitterAmount / 2);
    const finalIntensity = Math.max(0.15, Math.min(1.0, baseLight + randomJitter));

    document.documentElement.style.setProperty('--light-intensity', finalIntensity.toFixed(3));

    updateLightFrame = requestAnimationFrame(updateLightFlicker);
}

powerSwitch.addEventListener('click', () => {
    playClickSound();
    isPoweredOn = !isPoweredOn;

    if (isPoweredOn) {
        radioContainer.classList.add('power-on');
        updateLightFrame = requestAnimationFrame(updateLightFlicker);
        if (!hasInteracted) {
            // Jump instantly to a completely random live station on the first power-on
            if (stations.length > 0) {
                const randomStation = stations[Math.floor(Math.random() * stations.length)];
                tuningKnob.value = randomStation.frequency;
                tuningKnob.dispatchEvent(new Event('input')); 
            }
            startAudioEngine();
        } else {
            updateAudio(parseInt(tuningKnob.value));
        }
    } else {
        radioContainer.classList.remove('power-on');
        cancelAnimationFrame(updateLightFrame);
        document.body.classList.remove('power-on');
        updateAudio(parseInt(tuningKnob.value));
    }
});

function startAudioEngine() {
    hasInteracted = true;
    staticAudio.play().catch(e => console.log("Static playback blocked:", e));

    stations.forEach(station => {
        if (station.files && station.files.length > 0) {
            const audioEl = new Audio();
            audioEl.volume = 0;
            audioEl.preload = 'auto';
            document.body.appendChild(audioEl);
            stationAudioElements[station.id] = audioEl;

            let lastShow = null;

            // Queue engine to evenly distribute playback across subfolders
            const queueNextTrack = () => {
                // Get all unique shows, excluding the last one to prevent identical repeats
                let availableShows = [...new Set(station.files.map(f => f.show))].filter(s => s !== lastShow);

                if (availableShows.length === 0) {
                    availableShows = [...new Set(station.files.map(f => f.show))];
                }

                if (availableShows.length > 0) {
                    // Pick a random show folder uniquely
                    const pickedShow = availableShows[Math.floor(Math.random() * availableShows.length)];
                    lastShow = pickedShow;

                    // Filter files for that exact show and pick a completely random track
                    const showFiles = station.files.filter(f => f.show === pickedShow);
                    const picked = showFiles[Math.floor(Math.random() * showFiles.length)];

                    const displayName = picked.show === 'root' ? station.name : picked.show;
                    audioEl.dataset.currentTrack = displayName.replace(/[-_]/g, ' ').toUpperCase();

                    const encodedPath = picked.file.split('/').map(p => encodeURIComponent(p)).join('/');
                    audioEl.src = `${API_BASE_URL}/audio/${encodeURIComponent(station.folderName)}/${encodedPath}`;
                    audioEl.play().catch(e => console.log(`Playback of ${station.name} blocked:`, e));
                }
            };

            audioEl.addEventListener('ended', queueNextTrack);
            audioEl.addEventListener('error', queueNextTrack);

            queueNextTrack();
        }
    });

    updateAudio(parseInt(tuningKnob.value));
}

// --- 2. Input Handling ---
const adjustTuning = (amount) => {
    let currentVal = parseInt(tuningKnob.value);
    let newVal = currentVal + amount;
    if (newVal < minFreq) newVal = minFreq;
    if (newVal > maxFreq) newVal = maxFreq;

    tuningKnob.value = newVal;
    tuningKnob.dispatchEvent(new Event('input'));
};

tuneDownBtn.addEventListener('click', () => adjustTuning(-1));
tuneUpBtn.addEventListener('click', () => adjustTuning(1));

// Scroll wheel support on the dial wrapper explicitly
document.querySelector('.dial-wrapper').addEventListener('wheel', (e) => {
    e.preventDefault();
    adjustTuning(e.deltaY > 0 ? -1 : 1);
});

volumeKnob.addEventListener('input', (e) => {
    masterVolume = parseFloat(e.target.value);
    const rotateDeg = (masterVolume * 270) - 135;
    volDialImage.style.transform = `rotate(${rotateDeg}deg)`;

    if (hasInteracted) {
        updateAudio(parseInt(tuningKnob.value));
    }
});

tuningKnob.addEventListener('input', (e) => {
    const freq = parseInt(e.target.value);

    freqReadout.textContent = freq;

    const percent = ((freq - minFreq) / (maxFreq - minFreq));
    const rotateDeg = (percent * 270) - 135;
    dialImage.style.transform = `rotate(${rotateDeg}deg)`;

    if (hasInteracted) {
        updateAudio(freq);
    }
});

// --- 3. The "Tuning" Engine ---
function updateAudio(currentFreq) {
    if (!isPoweredOn) {
        Object.values(stationAudioElements).forEach(audio => {
            audio.volume = 0;
        });
        staticAudio.volume = 0;
        tunedIndicator.classList.remove('active');
        metadataRibbon.textContent = "POWER OFF";
        metadataRibbon.classList.add('off');
        return;
    }

    metadataRibbon.classList.remove('off');

    let activeStation = null;
    let shortestDistance = tuningRange;

    stations.forEach(station => {
        const distance = Math.abs(currentFreq - station.frequency);
        if (distance < shortestDistance) {
            activeStation = station;
            shortestDistance = distance;
        }
    });

    Object.values(stationAudioElements).forEach(audio => {
        audio.volume = 0;
    });

    const smoothedVol = Math.pow(masterVolume, 2) * sleepAttenuation;

    if (activeStation && stationAudioElements[activeStation.id]) {
        const signalStrength = 1 - (shortestDistance / tuningRange);

        stationAudioElements[activeStation.id].volume = Math.pow(signalStrength, 2) * smoothedVol;
        staticAudio.volume = (1 - signalStrength) * staticMaxVolume * smoothedVol;

        if (signalStrength > 0.7) {
            tunedIndicator.classList.add('active');
            metadataRibbon.textContent = stationAudioElements[activeStation.id].dataset.currentTrack || "BROADCASTING";
        } else {
            tunedIndicator.classList.remove('active');
            metadataRibbon.textContent = "TUNING...";
        }

        if (currentStationId !== activeStation.id) {
            currentStationId = activeStation.id;
        }
    } else {
        staticAudio.volume = staticMaxVolume * smoothedVol;
        tunedIndicator.classList.remove('active');
        metadataRibbon.textContent = "STATIC";
        currentStationId = null;
    }
}

// --- 4. Presets Logic ---
presetBtns.forEach(btn => {
    const slot = btn.dataset.slot;

    let pressTimer;

    const savePreset = () => {
        const freqToSave = tuningKnob.value;
        runtimePresets[slot] = freqToSave;
        btn.classList.add('saved');

        freqReadout.style.color = '#fff';
        freqReadout.style.textShadow = '0 0 20px #fff';
        setTimeout(() => {
            freqReadout.style.color = '';
            freqReadout.style.textShadow = '';
        }, 300);
    };

    const handleDown = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        btn.classList.add('pressing');
        pressTimer = window.setTimeout(() => {
            savePreset();
            pressTimer = null;
        }, 800);
    };

    const handleUp = (e) => {
        if (e.type === 'touchend') e.preventDefault();
        btn.classList.remove('pressing');
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            const sf = runtimePresets[slot];
            if (sf) {
                tuningKnob.value = sf;
                tuningKnob.dispatchEvent(new Event('input'));
            }
        }
    };

    const handleLeave = () => {
        btn.classList.remove('pressing');
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };

    btn.addEventListener('mousedown', handleDown);
    btn.addEventListener('mouseup', handleUp);
    btn.addEventListener('mouseleave', handleLeave);
    btn.addEventListener('touchstart', handleDown);
    btn.addEventListener('touchend', handleUp);
});

if (clearPresetsBtn) {
    clearPresetsBtn.addEventListener('click', () => {
        runtimePresets = {};
        presetBtns.forEach(btn => btn.classList.remove('saved'));
    });
}
// --- Sleep Timer Engine ---
function handleSleepToggle() {
    playClickSound(); // Mechanical tick
    sleepStateIdx = (sleepStateIdx + 1) % sleepOptions.length;
    sleepKnob.className = `sleep-knob sleep-pos-${sleepStateIdx}`;
    const mins = sleepOptions[sleepStateIdx];
    if (mins === 0) {
        sleepLabel.textContent = "SLEEP: OFF";
        clearInterval(sleepInterval);
        sleepAttenuation = 1.0;
        updateAudio(parseInt(tuningKnob.value));
    } else {
        sleepLabel.textContent = `SLEEP: ${mins}M`;
        sleepEndTime = Date.now() + mins * 60 * 1000;
        clearInterval(sleepInterval);
        sleepInterval = setInterval(() => {
            if (!isPoweredOn) {
                clearInterval(sleepInterval);
                return;
            }
            const remainingMs = sleepEndTime - Date.now();
            if (remainingMs <= 0) {
                // Time up – shut down
                clearInterval(sleepInterval);
                sleepAttenuation = 1.0;
                if (isPoweredOn) powerSwitch.click();
                // Reset UI
                sleepStateIdx = 0;
                sleepKnob.className = `sleep-knob sleep-pos-0`;
                sleepLabel.textContent = "SLEEP: OFF";
            } else if (remainingMs < 60000) {
                // Final minute fade out
                sleepAttenuation = remainingMs / 60000;
                updateAudio(parseInt(tuningKnob.value));
            } else {
                sleepAttenuation = 1.0;
            }
        }, 1000);
    }
}

sleepKnob.addEventListener('click', handleSleepToggle);
sleepKnob.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleSleepToggle();
});

initRadio();
