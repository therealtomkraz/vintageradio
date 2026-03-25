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
const metadataRibbon = document.getElementById('metadata-ribbon');
const staticAudio = document.getElementById('static-noise');
const magicEyeShadow = document.getElementById('magic-eye-shadow');
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
const STREAM_API_URL = `http://${window.location.hostname}:3001`;

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
        const response = await fetch(`${STREAM_API_URL}/api/stations`);
        stations = await response.json();
    } catch (err) {
        console.error("Could not load stations:", err);
    }

    tuningKnob.dispatchEvent(new Event('input'));
    volumeKnob.dispatchEvent(new Event('input'));

    // Refresh metadata periodically to sync track names
    setInterval(async () => {
        try {
            const response = await fetch(`${STREAM_API_URL}/api/stations`);
            stations = await response.json();
            if (isPoweredOn) updateAudio(parseInt(tuningKnob.value));
        } catch (err) {
            console.warn("Metadata sync failed:", err);
        }
    }, 15000);

    // Register Service Worker for PWA support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.log('SW Failed', err));
    }
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

    // Start responding visually slightly before the audio kicks in
    if (shortest < (tuningRange * 1.5)) {
        maxSignal = 1 - (shortest / (tuningRange * 1.5));
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

let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock Active');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
        console.log('Wake Lock Released');
    }
}

powerSwitch.addEventListener('click', () => {
    playClickSound();
    isPoweredOn = !isPoweredOn;

    if (isPoweredOn) {
        radioContainer.classList.add('power-on');
        updateLightFrame = requestAnimationFrame(updateLightFlicker);
        requestWakeLock();
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
        releaseWakeLock();
        updateAudio(parseInt(tuningKnob.value));
    }
});

function startAudioEngine() {
    hasInteracted = true;
    staticAudio.play().catch(e => console.log("Static playback blocked:", e));

    stations.forEach(station => {
        const audioEl = new Audio();
        audioEl.volume = 0;
        audioEl.preload = 'none';
        document.body.appendChild(audioEl);
        stationAudioElements[station.id] = audioEl;

        // We no longer set .src or .play() here for all stations.
        // The updateAudio engine will manage these dynamically.
        audioEl.dataset.currentTrack = station.name.toUpperCase();
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

// Synchronizes mobile operating system lock screens natively with the hardware state
function updateMediaSession(title, artist) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: 'Vintage OTR Simulator',
            artwork: [
                { src: 'radio-dial.png', sizes: '512x512', type: 'image/png' }
            ]
        });
        navigator.mediaSession.setActionHandler('play', () => { if (!isPoweredOn) powerSwitch.click(); });
        navigator.mediaSession.setActionHandler('pause', () => { if (isPoweredOn) powerSwitch.click(); });
    }
}

// --- 3. The "Tuning" Engine ---
function updateAudio(currentFreq) {
    if (!isPoweredOn) {
        Object.values(stationAudioElements).forEach(audio => {
            audio.volume = 0;
        });
        staticAudio.volume = 0;
        metadataRibbon.textContent = "POWER OFF";
        metadataRibbon.classList.add('off');
        updateMediaSession("Power Off", "Skeuomorphic Radio");
        return;
    }

    metadataRibbon.classList.remove('off');
    
    let activeStation = null;
    let shortestDistance = tuningRange * 2; // Increase buffer to match lazy-loading range

    stations.forEach(station => {
        const audioEl = stationAudioElements[station.id];
        if (!audioEl) return;

        const distance = Math.abs(currentFreq - station.frequency);
        const isActiveInRange = distance < (tuningRange * 2);

        if (isActiveInRange) {
            // Hot-swap src if it's missing or disconnected
            if (!audioEl.src || audioEl.src === "" || audioEl.dataset.isStreaming !== "true") {
                console.log(`[TUNER] Connecting to ${station.name}...`);
                audioEl.crossOrigin = "anonymous";
                audioEl.src = `${STREAM_API_URL}/stream/${station.id}`;
                audioEl.play().catch(e => console.warn(`[TUNER] Start blocked for ${station.name}:`, e));
                audioEl.dataset.isStreaming = "true";
                
                if (!audioEl.dataset.hasErrorListener) {
                    audioEl.addEventListener('error', () => {
                        console.error(`[TUNER] Stream error on ${station.name}`);
                        audioEl.dataset.isStreaming = "false";
                    });
                    audioEl.dataset.hasErrorListener = "true";
                }
            }
            
            if (distance < shortestDistance) {
                activeStation = station;
                shortestDistance = distance;
            }
        } else {
            // Unload distant streams
            if (audioEl.dataset.isStreaming === "true") {
                console.log(`[TUNER] Unloading ${station.name}`);
                audioEl.pause();
                audioEl.src = "";
                audioEl.removeAttribute("src");
                audioEl.load();
                audioEl.dataset.isStreaming = "false";
            }
            audioEl.volume = 0;
        }
    });

    const smoothedVol = Math.max(0, Math.pow(masterVolume, 2) * sleepAttenuation);

    if (activeStation && stationAudioElements[activeStation.id]) {
        const signalStrength = Math.max(0, 1 - (shortestDistance / tuningRange));
        const audioEl = stationAudioElements[activeStation.id];

        // Apply volume safely
        try {
            const vol = Math.pow(signalStrength, 2) * smoothedVol;
            if (!isNaN(vol)) {
                audioEl.volume = Math.min(1.0, vol);
            }
        } catch (e) {
            console.error("[TUNER] Volume Error:", e);
        }
        
        staticAudio.volume = (1 - signalStrength) * staticMaxVolume * smoothedVol;

        if (signalStrength > 0.7) {
            // Use the live folder name (the Show) for the ribbon, falling back to station name
            const currentFolder = activeStation.currentFolder || activeStation.folderName || activeStation.name;
            const track = currentFolder.replace(/-/g, ' ').toUpperCase();
            metadataRibbon.textContent = track;
            updateMediaSession(track, activeStation.name);
        } else {
            metadataRibbon.textContent = "TUNING...";
            updateMediaSession("Tuning Dial...", "Searching Frequencies...");
        }

        if (currentStationId !== activeStation.id) {
            currentStationId = activeStation.id;
        }

        // --- Magic Eye Tube Physics ---
        // A squared organic decay curve so the wedge remains wide open until pinpoint locked, 
        // aggressively snapping shut only in the final +/- 10kHz boundary.
        const targetAngle = Math.max(2, 130 - (Math.pow(signalStrength, 3) * 128));
        if (magicEyeShadow) magicEyeShadow.style.setProperty('--shadow-angle', `${targetAngle}deg`);

    } else {
        staticAudio.volume = staticMaxVolume * smoothedVol * sleepAttenuation;
        metadataRibbon.textContent = "STATIC";
        updateMediaSession("Static Hiss", "Dead Air");
        
        // Ensure eye aperture lies wide open through dead air
        if (magicEyeShadow) magicEyeShadow.style.setProperty('--shadow-angle', `100deg`);
        currentStationId = null;
    }
}

// --- 4. Smooth Dial Dragging Physics ---
const dialWrapper = document.querySelector('.dial-wrapper');
let isDraggingDial = false;
let previousX = 0;
let currentDialFloat = parseFloat(tuningKnob.value); // Float layer for high-resolution micro-tuning precision

function handleDialStart(clientX) {
    if (!isPoweredOn) return;
    isDraggingDial = true;
    previousX = clientX;
}

function handleDialMove(clientX) {
    if (!isDraggingDial) return;
    
    const deltaX = clientX - previousX;
    previousX = clientX;
    
    // GEAR REDUCTION RATIO: 1 pixel of hardware finger drag now physically equals just 2.0 kHz.
    // The previous native HTML range scaled linearly at ~11.5 kHz per pixel!
    // This dramatically slows down tuning, making classic fine-tuning beautifully responsive and accurate.
    currentDialFloat += deltaX * 2.0; 
    
    // Restrict to absolute station boundaries natively
    currentDialFloat = Math.max(550, Math.min(2500, currentDialFloat));
    
    const rounded = Math.round(currentDialFloat);
    if (tuningKnob.value != rounded) {
        tuningKnob.value = rounded;
        tuningKnob.dispatchEvent(new Event('input'));
    }
}

function handleDialEnd() {
    isDraggingDial = false;
}

dialWrapper.addEventListener('mousedown', (e) => handleDialStart(e.clientX));
window.addEventListener('mousemove', (e) => handleDialMove(e.clientX));
window.addEventListener('mouseup', handleDialEnd);

dialWrapper.addEventListener('touchstart', (e) => {
    handleDialStart(e.touches[0].clientX);
}, {passive: true});

window.addEventListener('touchmove', (e) => {
    if (isDraggingDial) {
        e.preventDefault(); // Stop mobile phone screen sliding during physical dial tuning
        handleDialMove(e.touches[0].clientX);
    }
}, {passive: false});

window.addEventListener('touchend', handleDialEnd);


// --- 5. Presets Logic ---
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
