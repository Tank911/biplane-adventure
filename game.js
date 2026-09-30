import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { upgradeBiplaneVisuals } from './biplane.js';

// Game variables
let scene, camera, renderer, plane;
let biplane, mountains = [], trees = [], lakes = [], clouds = [], water;
let enemies = [], projectiles = [];
let enemyProjectiles = [];
let score = 0;
let isGameOver = false;
let clock = new THREE.Clock();
let joystick;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let composer;
let enemySpawnTimer = 0;
let shootCooldown = 0;
let playerHealth = 100;
let maxHealth = 100;
let damageEffects = [];
let explosionParticles = [];
let smokeParticles = [];
let detachedParts = [];
let soundEnabled = true;
let sounds = {};
let textureLoader;
let textures = {};
let _circleTex = null; // cache for particle circle texture
let currentLevel = 1;
let maxLevel = 8;
let missionData = {};
let levelComplete = false;
let gameMode = 'airplane';
let person = null;
let parachute = null;
let personSpeed = 0.2; // Increased from 0.15
let showControls = false;
let canJumpOut = true;
/* add model holder */
let pineTreeModel = null;
// grass model holders
let grassModel = null;
let grassGroup = null;

// add smoother flight dynamics
let throttle = 0, airspeed = 0, maxAirSpeed = 1.2, accel = 0.02, drag = 0.008, yawVel = 0;
let contrailTimer = 0;
let isCameraFrozen = false;

// Movement variables
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let rotation = new THREE.Euler(0, 0, 0, 'YXZ');
let speed = 0.25; // Increased from 0.2
let rotationSpeed = 0.04; // Increased from 0.03

// Level definitions
const levels = {
    1: {
        name: "FIRST FLIGHT",
        type: "destroy",
        target: 3,
        enemyCount: 2,
        enemySpawnRate: 800,
        description: "Destroy 3 enemy aircraft",
        specialRules: "enemies_slow"
    },
    2: {
        name: "NAVAL BATTLE",
        type: "destroy",
        target: 5,
        enemyCount: 3,
        enemySpawnRate: 600,
        description: "Destroy 5 enemy battle boats",
        specialRules: "water_battle"
    },
    3: {
        name: "ESCORT MISSION",
        type: "escort",
        target: { x: 60, z: 60 },
        enemyCount: 5,
        enemySpawnRate: 400,
        description: "Escort friendly aircraft to safety",
        specialRules: "protect_friendly"
    },
    4: {
        name: "ACE DUEL",
        type: "destroy",
        target: 1,
        enemyCount: 1,
        enemySpawnRate: 0,
        description: "Defeat the enemy ace pilot",
        specialRules: "boss_enemy"
    },
    5: {
        name: "CITY ASSAULT",
        type: "destroy",
        target: 8,
        enemyCount: 6,
        enemySpawnRate: 350,
        description: "Clear the city of enemy aircraft",
        specialRules: "city_battle"
    },
    6: {
        name: "STORM PATROL",
        type: "survive",
        target: 90,
        enemyCount: 4,
        enemySpawnRate: 500,
        description: "Survive 90 seconds in the storm",
        specialRules: "weather_effects"
    },
    7: {
        name: "NIGHT RAID",
        type: "checkpoint",
        target: { x: 120, z: 120 },
        enemyCount: 10,
        enemySpawnRate: 250,
        description: "Navigate to the target in darkness",
        specialRules: "night_mission"
    },
    8: {
        name: "FINAL ASSAULT",
        type: "destroy",
        target: 12,
        enemyCount: 8,
        enemySpawnRate: 200,
        description: "Destroy all enemy forces in the final battle",
        specialRules: "heavy_resistance"
    }
};

// Init function
async function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // Add fog for atmospheric effect
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    // Load textures
    loadTextures();
    
    // Load sounds
    loadSounds();
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Set up post-processing
    setupPostProcessing();
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);
    
    // Add secondary light for better illumination
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x7CFC00, 0.6);
    scene.add(hemisphereLight);
    
    // Create environment
    await loadPineTreeModel();
    await loadGrassModel();
    createEnvironment();
    
    // Create biplane
    createBiplane();
    
    // Set up controls
    setupControls();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize, false);
    
    // Add damage effects to biplane
    updateBiplaneVisuals();
    
    // Play engine sound
    playSound('engine', true);
    
    // Initialize mission
    initializeMission();
    
    // Start animation loop
    animate();
}

function loadTextures() {
    textureLoader = new THREE.TextureLoader();
    
    // Only load ground texture, remove other texture loads
    textures.ground = textureLoader.load('texture_ground.png');
    // add richer biplane textures
    textures.fabric = textureLoader.load('texture_biplane_red.png');
    textures.metal = textureLoader.load('texture_biplane_metal.png');
    textures.wood = textureLoader.load('texture_wood.png');
    textures.mountain = textureLoader.load('RockMountain0129_1_350.jpg');
    /* water normals for realistic water */
    textures.waterNormals = textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/waternormals.jpg', t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(4, 4);
    });
    
    // Configure texture repeat
    textures.ground.wrapS = textures.ground.wrapT = THREE.RepeatWrapping;
    textures.ground.repeat.set(100, 100);
    
    // improve sampling
    const aniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    [textures.fabric, textures.metal, textures.wood, textures.mountain].forEach(t => { if (t) t.anisotropy = aniso; });
}

function loadSounds() {
    const audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Create all sound objects
    sounds.engine = new THREE.Audio(audioListener);
    sounds.shoot = new THREE.Audio(audioListener);
    sounds.hit = new THREE.Audio(audioListener);
    sounds.explosion = new THREE.Audio(audioListener);
    sounds.partBreak = new THREE.Audio(audioListener);
    sounds.enemyShoot = new THREE.Audio(audioListener);
    sounds.enemyExplosion = new THREE.Audio(audioListener);
    
    // Load audio files
    const audioLoader = new THREE.AudioLoader();
    
    audioLoader.load('sound_engine.mp3', (buffer) => {
        sounds.engine.setBuffer(buffer);
        sounds.engine.setLoop(true);
        sounds.engine.setVolume(0.5);
    });
    
    audioLoader.load('sound_shoot.mp3', (buffer) => {
        sounds.shoot.setBuffer(buffer);
        sounds.shoot.setVolume(0.7);
    });
    
    audioLoader.load('sound_hit.mp3', (buffer) => {
        sounds.hit.setBuffer(buffer);
        sounds.hit.setVolume(0.8);
    });
    
    audioLoader.load('sound_explosion.mp3', (buffer) => {
        sounds.explosion.setBuffer(buffer);
        sounds.explosion.setVolume(1.0);
    });
    
    audioLoader.load('sound_part_break.mp3', (buffer) => {
        sounds.partBreak.setBuffer(buffer);
        sounds.partBreak.setVolume(0.9);
    });
    
    audioLoader.load('sound_enemy_shoot.mp3', (buffer) => {
        sounds.enemyShoot.setBuffer(buffer);
        sounds.enemyShoot.setVolume(0.6);
    });
    
    audioLoader.load('sound_enemy_explosion.mp3', (buffer) => {
        sounds.enemyExplosion.setBuffer(buffer);
        sounds.enemyExplosion.setVolume(0.8);
    });
}

function playSound(soundName, loop = false) {
    if (!soundEnabled || !sounds[soundName]) return;
    
    const sound = sounds[soundName];
    if (sound.isPlaying) {
        if (!loop) {
            sound.stop();
            sound.play();
        }
    } else {
        sound.play();
    }
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({
        color: 0x7CFC00,
        side: THREE.DoubleSide
    });
    plane = new THREE.Mesh(groundGeometry, groundMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
    
    // Create water
    createWater();
}

function createWater() {
    if (!textures.waterNormals) return;
    const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
    
    // Create water material with blue color and reflective properties
    const waterMaterial = new THREE.MeshPhongMaterial({
        color: 0x1E90FF,
        transparent: true,
        opacity: 0.7,
        shininess: 100,
        specular: 0xFFFFFF
    });
    
    water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.2; // Slightly above ground
    water.receiveShadow = true;
    scene.add(water);
    
    // Create water vertices for animation
    const vertices = water.geometry.attributes.position.array;
    water.userData = {
        originalVertices: [...vertices],
        time: 0
    };
}

function updateWater() {
    if (!water) return;
    if (water.material && water.material.uniforms && water.material.uniforms['time']) {
        water.material.uniforms['time'].value += 0.03;
    }
    
    // Add water splash effects when objects hit water
    for (const part of detachedParts) {
        if (part.position.y < 0.5 && part.position.y > 0 && !part.userData.splashed) {
            createWaterSplash(part.position);
            part.userData.splashed = true;
        }
    }
}

function createWaterSplash(position) {
    for (let i = 0; i < 18; i++) {
        const vel = new THREE.Vector3(
            (Math.random()-0.5)*0.15, 0.15+Math.random()*0.25, (Math.random()-0.5)*0.15
        );
        const p = makeSpriteParticle(
            new THREE.Vector3(
                position.x + (Math.random()-0.5)*0.6,
                Math.max(0.25, position.y + Math.random()*0.4),
                position.z + (Math.random()-0.5)*0.6
            ),
            { color: 0x99ddff, opacity: 0.95, size: 0.6+Math.random()*0.4, life: 50+Math.random()*30, velocity: vel }
        );
        smokeParticles.push(p); scene.add(p);
    }
    if (Math.random() > 0.5) playSound('hit');
}

function createBiplane() {
    // Create biplane group
    biplane = new THREE.Group();
    
    // Create fuselage (body) - more detailed without texture
    const fuselageGeometry = new THREE.CylinderGeometry(0.5, 0.3, 3, 16);
    const fuseMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xCC0000,
        shininess: 30,
        specular: 0x222222,
        map: textures.fabric
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuseMaterial);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    fuselage.userData = { part: 'fuselage', detachable: false };
    biplane.add(fuselage);
    
    // Create wings (3 tiers for tri-plane) - improved geometry without texture
    const wingGeometry = new THREE.BoxGeometry(6, 0.15, 1.2, 8, 1, 4);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xDD0000,
        shininess: 10,
        transparent: true,
        opacity: 0.95,
        map: textures.fabric
    });
    
    // Bottom wing
    const bottomWing = new THREE.Mesh(wingGeometry, wingMaterial);
    bottomWing.position.y = -0.3;
    bottomWing.castShadow = true;
    bottomWing.userData = { part: 'bottomWing', detachable: true, detachThreshold: 0.6 };
    biplane.add(bottomWing);
    
    // Middle wing
    const middleWing = new THREE.Mesh(wingGeometry, wingMaterial);
    middleWing.position.y = 0.3;
    middleWing.castShadow = true;
    middleWing.userData = { part: 'middleWing', detachable: true, detachThreshold: 0.8 };
    biplane.add(middleWing);
    
    // Top wing
    const topWing = new THREE.Mesh(wingGeometry, wingMaterial);
    topWing.position.y = 0.9;
    topWing.castShadow = true;
    topWing.userData = { part: 'topWing', detachable: true, detachThreshold: 0.4 };
    biplane.add(topWing);
    
    // Wing struts with wood color
    const strutGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8);
    const strutMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xAA8866 
    });
    
    for (let i = 0; i < 4; i++) {
        const strut = new THREE.Mesh(strutGeometry, strutMaterial);
        strut.position.x = (i % 2 === 0) ? -2 : 2;
        strut.position.y = 0.3;
        strut.position.z = (i < 2) ? -0.3 : 0.3;
        strut.castShadow = true;
        strut.userData = { part: 'strut' + i, detachable: true, detachThreshold: 0.5 + Math.random() * 0.3 };
        biplane.add(strut);
    }
    
    // Create cockpit - improved without texture
    const cockpitGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const cockpitMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x444444,
        shininess: 50,
        specular: 0x444444,
        map: textures.metal
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.z = -0.5;
    cockpit.position.y = 0.3;
    cockpit.castShadow = true;
    cockpit.userData = { part: 'cockpit', detachable: true, detachThreshold: 0.9 };
    biplane.add(cockpit);
    
    // Create propeller - improved without wood texture
    const propellerGeometry = new THREE.BoxGeometry(0.1, 2.5, 0.05, 4, 8, 2);
    const propellerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x8B4513,
        shininess: 80,
        map: textures.wood
    });
    const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
    propeller.position.z = 1.6;
    propeller.castShadow = true;
    propeller.userData = { part: 'propeller', detachable: true, detachThreshold: 0.3 };
    biplane.add(propeller);
    
    // Propeller hub with metal color
    const hubGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16);
    const hubMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x888888,
        shininess: 100,
        map: textures.metal
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.position.z = 1.6;
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = true;
    hub.userData = { part: 'hub', detachable: true, detachThreshold: 0.35 };
    biplane.add(hub);
    
    // Create wheels - improved without texture
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x222222,
        shininess: 5
    });
    
    const leftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    leftWheel.position.set(-1, -1, 0);
    leftWheel.rotation.x = Math.PI / 2;
    leftWheel.castShadow = true;
    leftWheel.userData = { part: 'leftWheel', detachable: true, detachThreshold: 0.2 };
    biplane.add(leftWheel);
    
    const rightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rightWheel.position.set(1, -1, 0);
    rightWheel.rotation.x = Math.PI / 2;
    rightWheel.castShadow = true;
    rightWheel.userData = { part: 'rightWheel', detachable: true, detachThreshold: 0.2 };
    biplane.add(rightWheel);
    
    // Add tail without texture
    const tailGeometry = new THREE.BoxGeometry(1.2, 0.1, 0.8, 4, 1, 2);
    const tailMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xDD0000,
        shininess: 10
    });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.z = -1.4;
    tail.position.y = 0.3;
    tail.castShadow = true;
    tail.userData = { part: 'tail', detachable: true, detachThreshold: 0.5 };
    biplane.add(tail);
    
    // Add vertical stabilizer without texture
    const finGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.6, 1, 3, 2);
    const finMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xDD0000,
        shininess: 10
    });
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    fin.position.z = -1.4;
    fin.position.y = 0.7;
    fin.castShadow = true;
    fin.userData = { part: 'fin', detachable: true, detachThreshold: 0.45 };
    biplane.add(fin);
    
    // Apply enhanced visuals and extra details
    upgradeBiplaneVisuals(biplane, textures);
    
    // Add biplane to scene
    biplane.position.set(0, 2, 0);
    scene.add(biplane);
    
    // Attach camera to biplane
    camera.position.set(0, 3, -8);
    biplane.add(camera);
    camera.lookAt(biplane.position);
}

function createEnvironment() {
    createEnvironmentForLevel(currentLevel);
}

function clearEnvironment() {
    // Clear mountains
    for (const mountain of mountains) {
        scene.remove(mountain);
    }
    mountains = [];
    
    // Clear trees
    for (const tree of trees) {
        scene.remove(tree);
    }
    trees = [];
    
    // Clear lakes
    for (const lake of lakes) {
        scene.remove(lake);
    }
    lakes = [];
    
    // Clear clouds
    for (const cloud of clouds) {
        scene.remove(cloud);
    }
    clouds = [];
    
    // Remove and recreate ground for new level
    if (plane) {
        scene.remove(plane);
    }
    if (water) {
        scene.remove(water);
    }
    if (grassGroup) { scene.remove(grassGroup); grassGroup = null; }
}

function createEnvironmentForLevel(level) {
    const levelData = levels[level];
    
    // Create level-specific ground and atmosphere
    createLevelGround(level);
    
    switch(level) {
        case 1: // Countryside/Training grounds
            createCountrysideEnvironment();
            break;
        case 2: // Naval battle - ocean with islands
            createOceanEnvironment();
            break;
        case 3: // Mountain escort mission
            createMountainEnvironment();
            break;
        case 4: // Desert canyon for ace duel
            createDesertEnvironment();
            break;
        case 5: // City assault
            createIndustrialEnvironment();
            break;
        case 6: // Storm patrol
            createStormEnvironment();
            break;
        case 7: // Night raid
            createNightEnvironment();
            break;
        case 8: // Final assault - mix of all environments
            createFinalEnvironment();
            break;
        default:
            createCountrysideEnvironment();
    }
    
    // Apply level-specific atmosphere
    setLevelAtmosphere(level);
}

function createLevelGround(level) {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    let groundMaterial;
    
    switch(level) {
        case 1: // Green countryside
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0x7CFC00,
                side: THREE.DoubleSide
            });
            break;
        case 2: // Ocean floor (mostly covered by water)
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0x4682B4,
                side: THREE.DoubleSide
            });
            break;
        case 3: // Rocky mountains
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0x8B7355,
                side: THREE.DoubleSide
            });
            break;
        case 4: // Desert sand
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0xF4A460,
                side: THREE.DoubleSide
            });
            break;
        case 5: // Industrial concrete
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0x696969,
                side: THREE.DoubleSide
            });
            break;
        default:
            groundMaterial = new THREE.MeshLambertMaterial({
                color: 0x7CFC00,
                side: THREE.DoubleSide
            });
    }
    
    plane = new THREE.Mesh(groundGeometry, groundMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
    
    // scatter grass on non-ocean levels
    if (level !== 2) addGrassToGround(level);
    
    // Create level-specific water if needed
    if (level === 2) {
        createWater();
    }
}

function createCountrysideEnvironment() {
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    
    // Create moderate mountains
    for (let i = 0; i < 8; i++) {
        const mountain = createMountain();
        mountain.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        mountains.push(mountain);
        scene.add(mountain);
    }
    
    // Create many trees
    for (let i = 0; i < 25; i++) {
        const tree = createTree();
        tree.position.set(
            Math.random() * 250 - 125,
            0,
            Math.random() * 250 - 125
        );
        trees.push(tree);
        scene.add(tree);
    }
    
    // Create small lakes
    for (let i = 0; i < 5; i++) {
        const lake = createLake();
        lake.position.set(
            Math.random() * 200 - 100,
            0.01,
            Math.random() * 200 - 100
        );
        lakes.push(lake);
        scene.add(lake);
    }
    
    // Create fluffy white clouds
    for (let i = 0; i < 15; i++) {
        const cloud = createCloud();
        cloud.position.set(
            Math.random() * 400 - 200,
            Math.random() * 15 + 20,
            Math.random() * 400 - 200
        );
        clouds.push(cloud);
        scene.add(cloud);
    }
}

function createOceanEnvironment() {
    scene.background = new THREE.Color(0x4682B4);
    scene.fog = new THREE.Fog(0x4682B4, 60, 250);
    
    // Create small islands instead of mountains
    for (let i = 0; i < 6; i++) {
        const island = createIsland();
        island.position.set(
            Math.random() * 400 - 200,
            0,
            Math.random() * 400 - 200
        );
        mountains.push(island); // Reuse mountains array for cleanup
        scene.add(island);
    }
    
    // Create palm trees on islands
    for (let i = 0; i < 10; i++) {
        const palm = createPalmTree();
        palm.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        trees.push(palm);
        scene.add(palm);
    }
    
    // Create seagulls
    for (let i = 0; i < 12; i++) {
        const gull = createSeagull();
        gull.position.set(
            Math.random() * 400 - 200,
            5 + Math.random() * 15,
            Math.random() * 400 - 200
        );
        clouds.push(gull); // Reuse clouds array
        scene.add(gull);
    }
}

function createMountainEnvironment() {
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 40, 180);
    
    // Create many tall mountains
    for (let i = 0; i < 20; i++) {
        const mountain = createMountain();
        mountain.position.set(
            Math.random() * 500 - 250,
            0,
            Math.random() * 500 - 250
        );
        mountains.push(mountain);
        scene.add(mountain);
    }
    
    // Create pine trees
    for (let i = 0; i < 15; i++) {
        const pine = createPineTree();
        pine.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        trees.push(pine);
        scene.add(pine);
    }
    
    // Create mountain lakes
    for (let i = 0; i < 8; i++) {
        const lake = createMountainLake();
        lake.position.set(
            Math.random() * 250 - 125,
            0.01,
            Math.random() * 250 - 125
        );
        lakes.push(lake);
        scene.add(lake);
    }
    
    // Create storm clouds
    for (let i = 0; i < 20; i++) {
        const cloud = createStormCloud();
        cloud.position.set(
            Math.random() * 400 - 200,
            Math.random() * 25 + 15,
            Math.random() * 400 - 200
        );
        clouds.push(cloud);
        scene.add(cloud);
    }
}

function createDesertEnvironment() {
    scene.background = new THREE.Color(0xF4A460);
    scene.fog = new THREE.Fog(0xF4A460, 30, 150);
    
    // Create desert rock formations
    for (let i = 0; i < 12; i++) {
        const rockForm = createRockFormation();
        rockForm.position.set(
            Math.random() * 400 - 200,
            0,
            Math.random() * 400 - 200
        );
        mountains.push(rockForm);
        scene.add(rockForm);
    }
    
    // Create cacti
    for (let i = 0; i < 20; i++) {
        const cactus = createCactus();
        cactus.position.set(
            Math.random() * 350 - 175,
            0,
            Math.random() * 350 - 175
        );
        trees.push(cactus);
        scene.add(cactus);
    }
    
    // Create dust clouds
    for (let i = 0; i < 10; i++) {
        const dust = createDustCloud();
        dust.position.set(
            Math.random() * 300 - 150,
            Math.random() * 10 + 5,
            Math.random() * 300 - 150
        );
        clouds.push(dust);
        scene.add(dust);
    }
}

function createIndustrialEnvironment() {
    scene.background = new THREE.Color(0x696969);
    scene.fog = new THREE.Fog(0x696969, 35, 160);
    
    // Create industrial buildings
    for (let i = 0; i < 15; i++) {
        const building = createBuilding();
        building.position.set(
            Math.random() * 400 - 200,
            0,
            Math.random() * 400 - 200
        );
        mountains.push(building); // Reuse mountains array
        scene.add(building);
    }
    
    // Create smokestacks
    for (let i = 0; i < 8; i++) {
        const stack = createSmokestack();
        stack.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        trees.push(stack); // Reuse trees array
        scene.add(stack);
    }
    
    // Create industrial smoke
    for (let i = 0; i < 25; i++) {
        const smoke = createIndustrialSmoke();
        smoke.position.set(
            Math.random() * 400 - 200,
            Math.random() * 20 + 10,
            Math.random() * 400 - 200
        );
        clouds.push(smoke);
        scene.add(smoke);
    }
}

function createStormEnvironment() {
    // Create additional dark clouds for storm
    for (let i = 0; i < 10; i++) {
        const stormCloud = createCloud();
        stormCloud.children.forEach(part => {
            part.material.color.setHex(0x666666);
            part.material.opacity = 0.9;
        });
        stormCloud.position.set(
            Math.random() * 300 - 150,
            Math.random() * 15 + 15,
            Math.random() * 300 - 150
        );
        clouds.push(stormCloud);
        scene.add(stormCloud);
    }

    // Darken the scene
    scene.background = new THREE.Color(0x445566);
    scene.fog = new THREE.Fog(0x445566, 30, 120);
}

function createNightEnvironment() {
    scene.background = new THREE.Color(0x000022);
    scene.fog = new THREE.Fog(0x000022, 40, 150);
    
    // Create dark mountains
    for (let i = 0; i < 12; i++) {
        const mountain = createMountain();
        mountain.children.forEach(child => {
            child.material.color.multiplyScalar(0.3); // Make darker
        });
        mountain.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        mountains.push(mountain);
        scene.add(mountain);
    }
    
    // Add moon light
    const moonLight = new THREE.DirectionalLight(0x4444AA, 0.5);
    moonLight.position.set(50, 100, 50);
    scene.add(moonLight);
    clouds.push(moonLight); // Store for cleanup
    
    // Create some city lights in distance
    for (let i = 0; i < 20; i++) {
        const lightGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const lightMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(Math.random(), Math.random(), 0.2 + Math.random() * 0.8),
            emissive: new THREE.Color(Math.random(), Math.random(), 0.5),
            emissiveIntensity: 1.0
        });
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.set(
            Math.random() * 400 - 200,
            Math.random() * 3 + 1,
            Math.random() * 400 - 200
        );
        trees.push(light);
        scene.add(light);
    }
}

function createFinalEnvironment() {
    scene.background = new THREE.Color(0x443322);
    scene.fog = new THREE.Fog(0x443322, 30, 120);
    
    // Mix of all previous environments
    // Some mountains
    for (let i = 0; i < 8; i++) {
        const mountain = createMountain();
        mountain.position.set(
            Math.random() * 500 - 250,
            0,
            Math.random() * 500 - 250
        );
        mountains.push(mountain);
        scene.add(mountain);
    }
    
    // Some buildings
    for (let i = 0; i < 10; i++) {
        const building = createBuilding();
        building.position.set(
            Math.random() * 300 - 150,
            0,
            Math.random() * 300 - 150
        );
        mountains.push(building);
        scene.add(building);
    }
    
    // Some trees
    for (let i = 0; i < 15; i++) {
        const tree = createTree();
        tree.position.set(
            Math.random() * 250 - 125,
            0,
            Math.random() * 250 - 125
        );
        trees.push(tree);
        scene.add(tree);
    }
    
    // Dark storm clouds
    for (let i = 0; i < 20; i++) {
        const cloud = createStormCloud();
        cloud.position.set(
            Math.random() * 400 - 200,
            Math.random() * 20 + 15,
            Math.random() * 400 - 200
        );
        clouds.push(cloud);
        scene.add(cloud);
    }
}

// Helper functions for level-specific objects
function createIsland() {
    const group = new THREE.Group();
    const islandGeometry = new THREE.CylinderGeometry(8, 12, 3, 16);
    const islandMaterial = new THREE.MeshLambertMaterial({ color: 0xF4A460 });
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.position.y = 1.5;
    island.castShadow = true;
    group.add(island);
    return group;
}

function createPalmTree() {
    const group = new THREE.Group();
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2;
    group.add(trunk);
    
    const leavesGeometry = new THREE.SphereGeometry(2, 12, 12);
    const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 4.5;
    group.add(leaves);
    
    return group;
}

function createSeagull() {
    const group = new THREE.Group();
    const bodyGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    const wingGeometry = new THREE.BoxGeometry(0.8, 0.02, 0.3);
    const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xEEEEEE });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.y = 0.05;
    group.add(wings);
    
    group.userData = {
        speed: 0.02 + Math.random() * 0.01,
        direction: new THREE.Vector3(
            Math.random() - 0.5,
            (Math.random() - 0.5) * 0.1,
            Math.random() - 0.5
        ).normalize(),
        flapTime: Math.random() * Math.PI * 2
    };
    
    return group;
}

function createTallMountain() {
    return createRealisticMountain(32, 14, 56); // taller, wider, more segments
}

function createPineTree() {
    return createTree();
}

function createTree() {
    const tree = pineTreeModel ? pineTreeModel.clone(true) : new THREE.Group();
    if (pineTreeModel) {
        const randScale = 0.8 + Math.random() * 0.6; // 0.8x–1.4x variation
        tree.scale.multiplyScalar(randScale);
    }
    tree.position.y = 0.5; // raise slightly so wooden trunk is visible
    return tree;
}

function createMountainLake() {
    const lakeGeometry = new THREE.CircleGeometry(4, 32);
    const lakeMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x0066CC, 
        transparent: true,
        opacity: 0.9,
        shininess: 100
    });
    const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
    lake.rotation.x = -Math.PI / 2;
    return lake;
}

function createStormCloud() {
    const group = new THREE.Group();
    const cloudMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x555555,
        transparent: true,
        opacity: 0.9
    });
    
    for (let i = 0; i < 6; i++) {
        const radius = Math.random() * 2 + 1.5;
        const cloudPartGeometry = new THREE.SphereGeometry(radius, 12, 12);
        const cloudPart = new THREE.Mesh(cloudPartGeometry, cloudMaterial);
        cloudPart.position.set(
            Math.random() * 4 - 2,
            Math.random() * 1.5 - 0.75,
            Math.random() * 4 - 2
        );
        group.add(cloudPart);
    }
    
    return group;
}

function createRockFormation() {
    const group = new THREE.Group();
    const rockGeometry = new THREE.ConeGeometry(6, 15, 8, 4);
    const rockMaterial = new THREE.MeshLambertMaterial({ color: 0xA0522D });
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.y = 7.5;
    rock.castShadow = true;
    group.add(rock);
    return group;
}

function createCactus() {
    const group = new THREE.Group();
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 3, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    group.add(body);
    
    // Add arms
    const armGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.6, 2, 0);
    leftArm.rotation.z = Math.PI / 4;
    group.add(leftArm);
    
    return group;
}

function createDustCloud() {
    const group = new THREE.Group();
    const dustMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xD2B48C,
        transparent: true,
        opacity: 0.4
    });
    
    for (let i = 0; i < 4; i++) {
        const dustGeometry = new THREE.SphereGeometry(1 + Math.random(), 8, 8);
        const dust = new THREE.Mesh(dustGeometry, dustMaterial);
        dust.position.set(
            Math.random() * 3 - 1.5,
            Math.random() * 2,
            Math.random() * 3 - 1.5
        );
        group.add(dust);
    }
    
    return group;
}

function createBuilding() {
    const group = new THREE.Group();
    const buildingGeometry = new THREE.BoxGeometry(8, 15 + Math.random() * 10, 8);
    const buildingMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building.position.y = (15 + Math.random() * 10) / 2;
    building.castShadow = true;
    group.add(building);
    return group;
}

function createSmokestack() {
    const group = new THREE.Group();
    const stackGeometry = new THREE.CylinderGeometry(1, 1, 8, 12);
    const stackMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const stack = new THREE.Mesh(stackGeometry, stackMaterial);
    stack.position.y = 4;
    group.add(stack);
    return group;
}

function createIndustrialSmoke() {
    const group = new THREE.Group();
    const smokeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x222222,
        transparent: true,
        opacity: 0.6
    });
    
    for (let i = 0; i < 3; i++) {
        const smokeGeometry = new THREE.SphereGeometry(1 + Math.random() * 0.5, 8, 8);
        const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
        smoke.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
        );
        group.add(smoke);
    }
    
    return group;
}

function setLevelAtmosphere(level) {
    // Apply special atmosphere effects for certain levels
    if (level === 6) { // Storm level
        // Add flickering light effect
        const lightning = scene.getObjectByName('lightning');
        if (lightning) {
            setInterval(() => {
                lightning.intensity = Math.random() * 3 + 1;
            }, 200 + Math.random() * 800);
        }
    } else if (level === 7) { // Night level
        // Reduce ambient light
        scene.children.forEach(child => {
            if (child.type === 'AmbientLight') {
                child.intensity = 0.1;
            }
        });
    }
}

function createMountain() {
    return createRealisticMountain(24, 11, 48); // realistic mid mountain
}

function createRealisticMountain(height=24, radius=11, segments=48){
    const geo=new THREE.ConeGeometry(radius,height,segments,12); const pos=geo.attributes.position; const v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i); const r=Math.sqrt(v.x*v.x+v.z*v.z)/radius; const yNorm=(v.y+height/2)/height; const jag= (Math.sin(v.x*0.6)+Math.cos(v.z*0.7))*0.15*(1-yNorm); v.x*=1+(jag* (1-r)); v.z*=1+(jag* (1-r)); v.y+= (Math.sin((v.x+v.z)*0.25)+Math.cos(v.z*0.33))*0.6*(1-r); pos.setXYZ(i,v.x,v.y,v.z); }
    geo.computeVertexNormals();
    if(textures.mountain){ textures.mountain.wrapS=textures.mountain.wrapT=THREE.RepeatWrapping; textures.mountain.repeat.set(1.5,1.5); }
    const rockMat=new THREE.MeshStandardMaterial({map:textures.mountain, roughness:0.9, metalness:0.0});
    const mountain=new THREE.Mesh(geo,rockMat); mountain.position.y=height/2; mountain.castShadow=true; mountain.receiveShadow=true;
    const group=new THREE.Group(); group.add(mountain); return group;
}

function createLake() {
    const lakeGeometry = new THREE.CircleGeometry(6, 64);
    const lakeMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x1E90FF, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        shininess: 100,
        reflectivity: 0.5
    });
    const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = 0.3; // Slightly above ground and water
    lake.receiveShadow = true;
    return lake;
}

function createCloud() {
    const group = new THREE.Group();
    
    // Create multiple spheres to form a cloud without texture
    const cloudMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8
    });
    
    for (let i = 0; i < 8; i++) {
        const radius = Math.random() * 1.5 + 1;
        const cloudPartGeometry = new THREE.SphereGeometry(radius, 16, 16);
        const cloudPart = new THREE.Mesh(cloudPartGeometry, cloudMaterial);
        
        cloudPart.position.set(
            Math.random() * 6 - 3,
            Math.random() * 2 - 1,
            Math.random() * 6 - 3
        );
        
        group.add(cloudPart);
    }
    
    return group;
}

function setupPostProcessing() {
    composer = new EffectComposer(renderer);
    
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3, // strength
        0.4, // radius
        0.85 // threshold
    );
    composer.addPass(bloomPass);
    
    const outputPass = new OutputPass();
    composer.addPass(outputPass);
}

function setupControls() {
    if (isMobile) {
        // Create joystick container
        const joystickContainer = document.createElement('div');
        joystickContainer.id = 'joystick';
        document.getElementById('game-container').appendChild(joystickContainer);

        // Ensure shoot button is always in the DOM and on top for mobile fullscreen
        const shootButton = document.getElementById('shoot-button');
        shootButton.style.zIndex = 110;
        shootButton.style.position = 'absolute';
        shootButton.style.pointerEvents = 'auto';

        // When entering fullscreen, make sure shoot button and joystick are visible and fixed:
        function updateButtonFullscreenState() {
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
            if (isFullscreen) {
                shootButton.style.position = 'fixed';
                shootButton.style.display = 'flex';
                joystickContainer.style.position = 'fixed';
                // Let CSS :fullscreen rules handle sizing/position
            } else {
                shootButton.style.position = 'absolute';
                shootButton.style.display = 'flex';
                joystickContainer.style.position = 'absolute';
            }
        }

        // Listen for fullscreen change events to reapply positioning:
        document.addEventListener('fullscreenchange', updateButtonFullscreenState);
        document.addEventListener('webkitfullscreenchange', updateButtonFullscreenState);
        document.addEventListener('MSFullscreenChange', updateButtonFullscreenState);

        // Also update right away in case we're already in fullscreen
        setTimeout(updateButtonFullscreenState, 0);

        // Initialize joystick using the global nipplejs object
        joystick = nipplejs.create({
            zone: joystickContainer,
            mode: 'static',
            position: { left: '60px', bottom: '60px' },
            color: 'white',
            size: 120,
            threshold: 0.1,
            fadeTime: 150
        });

        // Set up joystick events
        joystick.on('move', (evt, data) => {
            const forward = data.vector.y;
            const turn = data.vector.x;

            // Reset all movement flags
            moveForward = moveBackward = moveLeft = moveRight = false;

            // Set movement based on joystick direction with improved sensitivity
            if (forward > 0.2) moveForward = true; // Reduced threshold from 0.3
            else if (forward < -0.2) moveBackward = true;

            if (turn > 0.2) moveRight = true; // Reduced threshold from 0.3
            else if (turn < -0.2) moveLeft = true;
        });

        joystick.on('end', () => {
            // Stop all movement when joystick is released
            moveForward = moveBackward = moveLeft = moveRight = false;
        });

        // Add touch controls for elevation
        renderer.domElement.addEventListener('touchstart', (event) => {
            const touch = event.touches[0];
            const halfHeight = window.innerHeight / 2;

            if (touch.clientY < halfHeight) {
                moveUp = true;
                moveDown = false;
            } else {
                moveUp = false;
                moveDown = true;
            }
        });

        renderer.domElement.addEventListener('touchend', () => {
            moveUp = moveDown = false;
        });

        // Add shoot button for mobile
        shootButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (gameMode === 'airplane') {
                shootProjectile();
            } else if (gameMode === 'person') {
                shootPersonWeapon();
            }
        });

        document.getElementById('jump-out-button').addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (canJumpOut && gameMode === 'airplane') {
                jumpOutOfPlane();
            }
        });
    } else {
        // Keyboard controls for desktop
        document.addEventListener('keydown', (event) => {
            if (gameMode === 'airplane') {
                switch (event.code) {
                    case 'KeyW': moveForward = true; break;
                    case 'KeyS': moveBackward = true; break;
                    case 'KeyA': moveLeft = true; break;
                    case 'KeyD': moveRight = true; break;
                    case 'Space': 
                        event.preventDefault();
                        if (!moveUp) {
                            shootProjectile();
                        }
                        moveUp = true; 
                        break;
                    case 'ShiftLeft': moveDown = true; break;
                    case 'KeyE':
                        if (canJumpOut) {
                            jumpOutOfPlane();
                        }
                        break;
                    case 'KeyH':
                        showControls = !showControls;
                        updateControlsDisplay();
                        break;
                }
            } else if (gameMode === 'person') {
                switch (event.code) {
                    case 'KeyW': moveForward = true; break;
                    case 'KeyS': moveBackward = true; break;
                    case 'KeyA': moveLeft = true; break;
                    case 'KeyD': moveRight = true; break;
                    case 'Space': 
                        event.preventDefault();
                        shootPersonWeapon();
                        break;
                    case 'KeyE':
                        tryEnterAirplane();
                        break;
                    case 'KeyH':
                        showControls = !showControls;
                        updateControlsDisplay();
                        break;
                }
            }
        });

        document.addEventListener('keyup', (event) => {
            if (gameMode === 'airplane') {
                switch (event.code) {
                    case 'KeyW': moveForward = false; break;
                    case 'KeyS': moveBackward = false; break;
                    case 'KeyA': moveLeft = false; break;
                    case 'KeyD': moveRight = false; break;
                    case 'Space': moveUp = false; break;
                    case 'ShiftLeft': moveDown = false; break;
                }
            } else if (gameMode === 'person') {
                switch (event.code) {
                    case 'KeyW': moveForward = false; break;
                    case 'KeyS': moveBackward = false; break;
                    case 'KeyA': moveLeft = false; break;
                    case 'KeyD': moveRight = false; break;
                }
            }
        });
    }

    // Add restart button functionality
    document.getElementById('restart-button').addEventListener('click', restartGame);

    // Add sound toggle button
    document.getElementById('sound-toggle').addEventListener('click', toggleSound);

    // Add next level button functionality
    document.getElementById('next-level-button').addEventListener('click', nextLevel);

    // Add jump out button functionality
    document.getElementById('jump-out-button').addEventListener('click', () => {
        if (canJumpOut && gameMode === 'airplane') {
            jumpOutOfPlane();
        }
    });

    // Add controls toggle button
    document.getElementById('controls-toggle').addEventListener('click', () => {
        showControls = !showControls;
        updateControlsDisplay();
    });

    // Add fullscreen button functionality
    document.getElementById('fullscreen-button').addEventListener('click', toggleFullscreen);
}

function toggleSound() {
    soundEnabled = !soundEnabled;

    // Update button text
    document.getElementById('sound-toggle').textContent = soundEnabled ? '' : '';

    // Toggle engine sound
    if (soundEnabled) {
        if (!sounds.engine.isPlaying) {
            sounds.engine.play();
        }
    } else {
        if (sounds.engine.isPlaying) {
            sounds.engine.pause();
        }
    }
}

function shootProjectile() {
    if (shootCooldown > 0) return;

    const shootPosition = biplane.position.clone();
    shootPosition.y += 0.5;
    shootPosition.z += 2; // Shoot from front of plane

    const shootDirection = new THREE.Vector3(0, 0, 1);
    shootDirection.applyEuler(biplane.rotation);

    createProjectile(shootPosition, shootDirection);
    shootCooldown = 10; // 10 frame cooldown

    // Play shoot sound
    playSound('shoot');
}

function updateBiplanePosition() {
    if (gameMode !== 'airplane') return;
    const delta = clock.getDelta();

    // Decrease shoot cooldown
    if (shootCooldown > 0) shootCooldown--;

    // Reset velocity
    velocity.x = 0;
    velocity.y = 0;
    velocity.z = 0;

    // Calculate velocity based on input
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.y = Number(moveUp) - Number(moveDown);
    direction.normalize();

    // throttle and airspeed (inertia)
    if (moveForward) throttle = Math.min(1, throttle + accel);
    if (moveBackward) throttle = Math.max(0, throttle - accel * 1.2);
    throttle = Math.max(0, throttle - drag); // passive drag
    airspeed = THREE.MathUtils.lerp(airspeed, throttle * maxAirSpeed, 0.05);
    
    // yaw damping and banking
    const yawInput = (Number(moveRight) - Number(moveLeft)) * rotationSpeed * 1.5;
    yawVel = yawVel * 0.9 + yawInput * 0.1;
    biplane.rotation.y -= yawVel;
    const targetBank = THREE.MathUtils.clamp(-yawVel * 6, -0.5, 0.5);
    biplane.rotation.z = THREE.MathUtils.lerp(biplane.rotation.z, targetBank, 0.08);
    
    // smooth pitch control
    const targetPitch = (Number(moveUp) - Number(moveDown)) * 0.35;
    biplane.rotation.x = THREE.MathUtils.lerp(biplane.rotation.x, targetPitch, 0.06);
    
    // forward motion with pitch-based lift
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(biplane.rotation);
    biplane.position.addScaledVector(forward, airspeed);
    biplane.position.y += Math.sin(-biplane.rotation.x) * airspeed * 0.3;
    // contrails when fast and high
    contrailTimer++;
    if (airspeed > 0.8 && biplane.position.y > 8 && (contrailTimer % 2 === 0)) {
        const tailLocal = new THREE.Vector3(0, 0.3, -1.8);
        const tailWorld = biplane.localToWorld(tailLocal.clone());
        const vel = forward.clone().multiplyScalar(-0.05).add(new THREE.Vector3((Math.random()-0.5)*0.02, 0.01, (Math.random()-0.5)*0.02));
        const p = makeSpriteParticle(tailWorld, { color: 0xffffff, opacity: 0.55, size: 0.6+Math.random()*0.3, life: 120+Math.random()*40, velocity: vel });
        smokeParticles.push(p); scene.add(p);
    }
    
    // Prevent flying too low
    if (biplane.position.y < 1) {
        biplane.position.y = 1;
    }

    // Prevent flying too high
    if (biplane.position.y > 50) {
        biplane.position.y = 50;
    }

    // Rotate propeller
    if (biplane.children[5]) {
        biplane.children[5].rotation.x += 0.5; // Fast rotation for propeller
    }

    // Check for collisions with mountains and trees
    checkCollisions();

    // Update jump out button state
    const jumpButton = document.getElementById('jump-out-button');
    if (canJumpOut && gameMode === 'airplane') {
        jumpButton.style.display = 'flex';
        jumpButton.disabled = false;
    } else {
        jumpButton.style.display = 'none';
        jumpButton.disabled = true;
    }
}

function checkCollisions() {
    if (isGameOver) return;

    const biplanePosition = biplane.position.clone();
    const collisionRadius = 3; // Collision radius for biplane

    // Check collisions with mountains
    for (const mountain of mountains) {
        const distance = biplanePosition.distanceTo(mountain.position);
        if (distance < 12) { // Mountain collision radius
            takeDamage(50);
            return;
        }
    }

    // Check collisions with trees
    for (const tree of trees) {
        const distance = biplanePosition.distanceTo(tree.position);
        if (distance < collisionRadius + 2) { // Tree collision radius
            takeDamage(30);
            return;
        }
    }

    // Check collisions with enemies
    for (const enemy of enemies) {
        const distance = biplanePosition.distanceTo(enemy.position);
        if (distance < 4) { // Enemy collision radius
            takeDamage(40);
            return;
        }
    }

    // Check collision with ground
    if (biplane.position.y < 1) {
        takeDamage(25);
        return;
    }

    // Check collisions with enemy projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const projectile = enemyProjectiles[i];
        const distance = biplanePosition.distanceTo(projectile.position);
        if (distance < 2) {
            takeDamage(15);
            scene.remove(projectile);
            enemyProjectiles.splice(i, 1);
            return;
        }
    }

    // Update score based on movement
    score += 0.1;
    document.getElementById('score').textContent = `SCORE: ${Math.floor(score)}`;
}

function takeDamage(amount) {
    playerHealth -= amount;
    if (playerHealth < 0) playerHealth = 0;

    updateHealthBar();
    updateBiplaneVisuals();

    createDamageSmoke();

    // Play hit sound
    playSound('hit');

    if (playerHealth <= 0) {
        explodeBiplane();
        setTimeout(gameOver, 1000); // Delay game over to show explosion
    }
}

function createDamageSmoke() {
    for (let i = 0; i < 8; i++) {
        const pos = new THREE.Vector3(
            biplane.position.x + (Math.random()-0.5)*2.5,
            biplane.position.y + 0.5 + Math.random()*1.2,
            biplane.position.z + (Math.random()-0.5)*2.5
        );
        const vel = new THREE.Vector3((Math.random()-0.5)*0.06, 0.05+Math.random()*0.06, (Math.random()-0.5)*0.06);
        const spr = makeSpriteParticle(pos, { color: 0x555555, opacity: 0.8, size: 0.7+Math.random()*0.5, life: 140+Math.random()*80, velocity: vel });
        smokeParticles.push(spr); scene.add(spr);
    }
}

function updateHealthBar() {
    const healthPercentage = (playerHealth / maxHealth) * 100;
    document.getElementById('health-fill').style.width = healthPercentage + '%';
}

function updateBiplaneVisuals() {
    // Remove existing damage effects
    damageEffects.forEach(effect => {
        biplane.remove(effect);
    });
    damageEffects = [];

    const damageLevel = 1 - (playerHealth / maxHealth);

    // Check for parts that should be detached based on damage level
    if (biplane.visible) {
        for (let i = biplane.children.length - 1; i >= 0; i--) {
            const part = biplane.children[i];
            if (part.userData && part.userData.detachable && 
                damageLevel > part.userData.detachThreshold && 
                !part.userData.detached) {

                // Create a copy of the part for detachment
                const detachedPart = part.clone();
                detachedPart.position.copy(biplane.localToWorld(part.position.clone()));
                detachedPart.quaternion.copy(biplane.quaternion.clone());
                detachedPart.quaternion.multiply(part.quaternion);

                // Add physics properties to the detached part
                detachedPart.userData = {
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.3,
                        (Math.random() - 0.5) * 0.3 + 0.1,
                        (Math.random() - 0.5) * 0.3
                    ),
                    rotationSpeed: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05,
                        (Math.random() - 0.5) * 0.05
                    ),
                    life: 300 + Math.random() * 200,
                    partName: part.userData ? part.userData.part : 'unknown'
                };

                scene.add(detachedPart);
                detachedParts.push(detachedPart);

                // Hide the original part if it's not the camera
                if (part !== camera) {
                    part.visible = false;
                    part.userData.detached = true;
                }

                // Create break-off smoke effect
                createBreakOffEffect(part.position.clone());
            }
        }
    }

    // Add smoke effects based on damage
    if (damageLevel > 0.3) {
        for (let i = 0; i < Math.floor(damageLevel * 5); i++) {
            const smokeGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const smokeMaterial = new THREE.MeshBasicMaterial({
                color: 0x444444,
                transparent: true,
                opacity: 0.6
            });
            const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
            smoke.position.set(
                (Math.random() - 0.5) * 4,
                Math.random() * 2,
                Math.random() * 3 - 1
            );
            damageEffects.push(smoke);
            biplane.add(smoke);
        }
    }

    // Change biplane color based on damage
    if (biplane.children[0]) { // Fuselage
        const fuselage = biplane.children[0];
        if (damageLevel > 0.7) {
            fuselage.material.color.setHex(0x880000); // Dark red
        } else if (damageLevel > 0.4) {
            fuselage.material.color.setHex(0xAA0000); // Medium red
        } else {
            fuselage.material.color.setHex(0xCC0000); // Original red
        }
    }

    // Add sparks for severe damage
    if (damageLevel > 0.6) {
        for (let i = 0; i < 3; i++) {
            const sparkGeometry = new THREE.SphereGeometry(0.05, 6, 6);
            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFF00,
                emissive: 0xFFFF00,
                emissiveIntensity: 0.8
            });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            spark.position.set(
                (Math.random() - 0.5) * 3,
                Math.random() * 1.5,
                Math.random() * 2
            );
            damageEffects.push(spark);
            biplane.add(spark);
        }
    }
}

function createBreakOffEffect(position) {
    for (let i = 0; i < 8; i++) {
        const debrisGeometry = new THREE.TetrahedronGeometry(0.1 + Math.random() * 0.1);
        const debrisMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(
                0.6 + Math.random() * 0.2,
                0.3 + Math.random() * 0.2,
                0.2 + Math.random() * 0.1
            )
        });
        const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
        debris.position.copy(position);
        debris.position.x += (Math.random() - 0.5) * 1;
        debris.position.y += (Math.random() - 0.5) * 1;
        debris.position.z += (Math.random() - 0.5) * 1;

        debris.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.4,
                (Math.random() - 0.3) * 0.4, // Slight upward bias
                (Math.random() - 0.5) * 0.4
            ),
            rotationSpeed: new THREE.Vector3(
                Math.random() * 0.2,
                Math.random() * 0.2,
                Math.random() * 0.2
            ),
            life: 120 + Math.random() * 60
        };

        detachedParts.push(debris);
        scene.add(debris);
    }

    for (let i = 0; i < 10; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.08, 0.04+Math.random()*0.04, (Math.random()-0.5)*0.08);
        const s = makeSpriteParticle(position.clone(), { color: 0x666666, opacity: 0.7, size: 0.5+Math.random()*0.3, life: 90+Math.random()*40, velocity: vel });
        smokeParticles.push(s); scene.add(s);
    }

    // Play part break sound
    playSound('partBreak');
}

function explodeBiplane() {
    // Detach all remaining parts dramatically
    for (let i = biplane.children.length - 1; i >= 0; i--) {
        const part = biplane.children[i];

        // Skip the camera and already detached parts
        if (part === camera || (part.userData && part.userData.detached)) {
            continue;
        }

        // Create a copy of the part for detachment
        const detachedPart = part.clone();
        detachedPart.position.copy(biplane.localToWorld(part.position.clone()));
        detachedPart.quaternion.copy(biplane.quaternion.clone());
        if (part.quaternion) {
            detachedPart.quaternion.multiply(part.quaternion);
        }

        // Add physics properties with more violent explosion force
        detachedPart.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.3) * 0.7, // Upward bias
                (Math.random() - 0.5) * 0.8
            ),
            rotationSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2
            ),
            life: 300 + Math.random() * 200,
            partName: part.userData ? part.userData.part : 'unknown',
            splashed: false
        };

        scene.add(detachedPart);
        detachedParts.push(detachedPart);

        // Hide the original part
        part.visible = false;
    }

    // Create enhanced explosion effect
    for (let i = 0; i < 40; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.45, Math.random()*0.35, (Math.random()-0.5)*0.45);
        const color = new THREE.Color(1, 0.5 + Math.random()*0.5, Math.random()*0.2);
        const s = makeSpriteParticle(
            new THREE.Vector3(
                biplane.position.x + (Math.random()-0.5)*5,
                biplane.position.y + (Math.random()-0.5)*3.5,
                biplane.position.z + (Math.random()-0.5)*5
            ),
            { color, opacity: 1.0, size: 1.0+Math.random()*1.4, life: 110+Math.random()*60, velocity: vel }
        );
        explosionParticles.push(s); scene.add(s);
    }

    for (let i = 0; i < 18; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.12, 0.06+Math.random()*0.12, (Math.random()-0.5)*0.12);
        const s = makeSpriteParticle(
            new THREE.Vector3(
                biplane.position.x + (Math.random()-0.5)*2.5,
                biplane.position.y + (Math.random()-0.5)*1.8,
                biplane.position.z + (Math.random()-0.5)*2.5
            ),
            { color: 0xff5500, opacity: 0.95, size: 0.9+Math.random()*0.8, life: 130+Math.random()*70, velocity: vel }
        );
        explosionParticles.push(s); scene.add(s);
    }

    // Create fire particles
    for (let i = 0; i < 15; i++) {
        const fireGeometry = new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 8, 8);
        const fireMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(1, 0.2 + Math.random() * 0.3, 0),
            emissive: new THREE.Color(1, 0.4, 0),
            emissiveIntensity: 2.0
        });
        const fire = new THREE.Mesh(fireGeometry, fireMaterial);
        fire.position.set(
            biplane.position.x + (Math.random() - 0.5) * 3,
            biplane.position.y + (Math.random() - 0.5) * 2,
            biplane.position.z + (Math.random() - 0.5) * 3
        );
        fire.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                0.05 + Math.random() * 0.1,
                (Math.random() - 0.5) * 0.1
            ),
            life: 100 + Math.random() * 50,
            maxLife: 150,
            initialScale: 0.8 + Math.random() * 0.7
        };
        explosionParticles.push(fire);
        scene.add(fire);
    }

    // Create additional metal fragments
    for (let i = 0; i < 25; i++) {
        const fragGeometry = new THREE.TetrahedronGeometry(0.15 + Math.random() * 0.2);
        const fragMaterial = new THREE.MeshPhongMaterial({
            map: textures.metal,
            shininess: 100,
            emissive: new THREE.Color(0.5, 0.2, 0.1),
            emissiveIntensity: 0.2
        });
        const fragment = new THREE.Mesh(fragGeometry, fragMaterial);
        fragment.position.copy(biplane.position);

        fragment.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 1.0,
                (Math.random() - 0.2) * 0.8, // Upward bias
                (Math.random() - 0.5) * 1.0
            ),
            rotationSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3
            ),
            life: 240 + Math.random() * 120
        };

        detachedParts.push(fragment);
        scene.add(fragment);
    }

    // Hide biplane
    biplane.visible = false;

    // Play explosion sound
    playSound('explosion');
}

function gameOver() {
    isGameOver = true;
    document.getElementById('game-over').style.display = 'block';
    // freeze camera at current world transform
    const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
    camera.getWorldPosition(wp); camera.getWorldQuaternion(wq);
    if (camera.parent) camera.parent.remove(camera);
    camera.position.copy(wp); camera.quaternion.copy(wq); scene.add(camera);
    isCameraFrozen = true;
    if (sounds.engine?.isPlaying) sounds.engine.stop();
}

function restartGame() {
    // Reset game state
    isGameOver = false;
    isCameraFrozen = false;
    score = 0;
    shootCooldown = 0;
    enemySpawnTimer = 0;
    playerHealth = maxHealth;
    document.getElementById('score').textContent = 'SCORE: 0';
    document.getElementById('game-over').style.display = 'none';

    // Reset health bar
    updateHealthBar();

    // Remove all enemies and projectiles
    for (const enemy of enemies) {
        scene.remove(enemy);
    }
    enemies = [];

    for (const projectile of projectiles) {
        scene.remove(projectile);
    }
    projectiles = [];

    for (const projectile of enemyProjectiles) {
        scene.remove(projectile);
    }
    enemyProjectiles = [];

    // Clear all particle effects
    for (const particle of explosionParticles) {
        scene.remove(particle);
    }
    explosionParticles = [];

    for (const particle of smokeParticles) {
        scene.remove(particle);
    }
    smokeParticles = [];

    // Remove all detached parts
    for (const part of detachedParts) {
        scene.remove(part);
    }
    detachedParts = [];

    // Recreate the biplane
    scene.remove(biplane);
    createBiplane();

    // Reset biplane visuals
    updateBiplaneVisuals();

    // Reset current level
    currentLevel = 1;
    levelComplete = false;

    // Initialize mission
    initializeMission();

    // Respawn enemies
    spawnEnemies();

    // Restart engine sound
    if (soundEnabled) {
        playSound('engine', true);
    }

    // Clear and recreate environment for level 1
    clearEnvironment();
    createEnvironmentForLevel(1);

    gameMode = 'airplane';
    if (person) {
        scene.remove(person);
        person = null;
    }
    if (parachute) {
        parachute = null;
    }
    canJumpOut = true;
    showControls = false;
    updateControlsDisplay();

    // Reset jump out button
    document.getElementById('jump-out-button').style.display = 'flex';
    document.getElementById('jump-out-button').disabled = false;
}

function initializeMission() {
    const level = levels[currentLevel];
    missionData = {
        type: level.type,
        target: level.target,
        progress: 0,
        startTime: Date.now(),
        completed: false,
        friendlyPlane: null
    };

    // Update UI
    document.getElementById('level-info').textContent = `LEVEL ${currentLevel} - ${level.name}`;
    updateMissionProgress();

    // Handle special level mechanics
    if (level.type === 'checkpoint') {
        createCheckpoint(level.target);
    } else if (level.type === 'escort') {
        createFriendlyPlane();
        createCheckpoint(level.target);
    } else if (level.type === 'survive') {
        // No special setup needed for survive missions
    }

    // Apply water battle effects
    if (level.specialRules === 'water_battle') {
        createWaterBattleEffects();
    }

    // Apply weather effects for storm level
    if (level.specialRules === 'weather_effects') {
        createStormEffects();
    }
    
    // Apply city battle effects
    if (level.specialRules === 'city_battle') {
        createCityBattleEffects();
    }
}

function updateMissionProgress() {
    const level = levels[currentLevel];
    const progressElement = document.getElementById('mission-progress');

    switch (level.type) {
        case 'destroy':
            progressElement.textContent = `ENEMIES: ${missionData.progress}/${level.target}`;
            break;
        case 'survive':
            const elapsed = Math.floor((Date.now() - missionData.startTime) / 1000);
            const remaining = Math.max(0, level.target - elapsed);
            progressElement.textContent = `TIME: ${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}`;
            break;
        case 'checkpoint':
            const distance = Math.floor(biplane.position.distanceTo(new THREE.Vector3(level.target.x, 0, level.target.z)));
            progressElement.textContent = `DISTANCE: ${distance}m`;
            break;
        case 'escort':
            if (missionData.friendlyPlane) {
                const friendlyDistance = Math.floor(missionData.friendlyPlane.position.distanceTo(new THREE.Vector3(level.target.x, missionData.friendlyPlane.position.y, level.target.z)));
                progressElement.textContent = `ESCORT DISTANCE: ${friendlyDistance}m`;
            } else {
                progressElement.textContent = `FRIENDLY LOST!`;
            }
            break;
    }
}

function checkMissionComplete() {
    if (missionData.completed || levelComplete) return;

    const level = levels[currentLevel];
    let isComplete = false;

    switch (level.type) {
        case 'destroy':
            isComplete = missionData.progress >= level.target;
            break;
        case 'survive':
            const elapsed = (Date.now() - missionData.startTime) / 1000;
            isComplete = elapsed >= level.target;
            break;
        case 'checkpoint':
            const distance = biplane.position.distanceTo(new THREE.Vector3(level.target.x, biplane.position.y, level.target.z));
            isComplete = distance < 10;
            break;
        case 'escort':
            if (missionData.friendlyPlane) {
                const friendlyDistance = missionData.friendlyPlane.position.distanceTo(new THREE.Vector3(level.target.x, missionData.friendlyPlane.position.y, level.target.z));
                isComplete = friendlyDistance < 10;
            }
            break;
    }

    if (isComplete) {
        completeMission();
    }
}

function completeMission() {
    missionData.completed = true;
    levelComplete = true;

    const level = levels[currentLevel];
    document.getElementById('level-complete-text').textContent = level.description + " - Well Done!";
    document.getElementById('level-complete').style.display = 'block';

    // Add bonus score
    score += 100 * currentLevel;
    document.getElementById('score').textContent = `SCORE: ${Math.floor(score)}`;
}

function nextLevel() {
    currentLevel++;
    levelComplete = false;

    if (currentLevel > maxLevel) {
        // Game completed
        document.getElementById('level-complete-text').textContent = "ALL MISSIONS COMPLETE! YOU ARE AN ACE PILOT!";
        document.getElementById('next-level-button').textContent = "Play Again";
        document.getElementById('next-level-button').onclick = () => {
            currentLevel = 1;
            restartGame();
        };
        return;
    }

    document.getElementById('level-complete').style.display = 'none';

    // Clear current level
    clearLevel();

    // Clear and recreate environment for new level
    clearEnvironment();
    createEnvironmentForLevel(currentLevel);

    // Initialize new level
    initializeMission();

    // Spawn enemies for new level
    const level = levels[currentLevel];
    for (let i = 0; i < level.enemyCount; i++) {
        createEnemy();
    }

    // Reset player health for new level
    playerHealth = Math.min(maxHealth, playerHealth + 25);
    updateHealthBar();
    updateBiplaneVisuals();
}

function clearLevel() {
    // Remove all enemies
    for (const enemy of enemies) {
        scene.remove(enemy);
    }
    enemies = [];

    // Remove all projectiles
    for (const projectile of projectiles) {
        scene.remove(projectile);
    }
    projectiles = [];

    for (const projectile of enemyProjectiles) {
        scene.remove(projectile);
    }
    enemyProjectiles = [];

    // Remove checkpoint if exists
    if (window.checkpointMarker) {
        scene.remove(window.checkpointMarker);
        window.checkpointMarker = null;
    }

    // Remove friendly plane if exists
    if (missionData.friendlyPlane) {
        scene.remove(missionData.friendlyPlane);
        missionData.friendlyPlane = null;
    }

    // Reset scene if storm effects were applied
    if (levels[currentLevel].specialRules === 'weather_effects') {
        scene.background = new THREE.Color(0x87CEEB);
        scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    }
}

function createCheckpoint(target) {
    // Create checkpoint marker
    const markerGeometry = new THREE.CylinderGeometry(2, 2, 20, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FF00,
        emissive: 0x004400,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    window.checkpointMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    window.checkpointMarker.position.set(target.x, 10, target.z);
    scene.add(window.checkpointMarker);

    // Add pulsing animation
    window.checkpointMarker.userData = { pulseTime: 0 };
}

function updateFriendlyPlane() {
    if (!missionData.friendlyPlane) return;

    const friendly = missionData.friendlyPlane;
    const userData = friendly.userData;

    // Follow player towards checkpoint
    let targetPos;
    if (userData.followPlayer) {
        // Stay near player but move towards checkpoint
        const playerOffset = new THREE.Vector3(-8, -1, -3);
        targetPos = biplane.position.clone().add(playerOffset);

        // If close to checkpoint, head directly there
        const checkpointDist = friendly.position.distanceTo(userData.targetPosition);
        if (checkpointDist < 30) { // within 30 units, switch to direct approach
            targetPos = userData.targetPosition.clone();
            targetPos.y = friendly.position.y;
            userData.followPlayer = false;
        }
    } else {
        targetPos = userData.targetPosition.clone();
        targetPos.y = friendly.position.y;
    }

    // Move towards target
    const direction = new THREE.Vector3()
        .subVectors(targetPos, friendly.position)
        .normalize();

    friendly.position.add(direction.multiplyScalar(userData.speed));
    friendly.lookAt(friendly.position.clone().add(direction));
}

function createWaterBattleEffects() {
    // Make water more visible and choppy for naval battle
    if (water) {
        water.material.opacity = 0.9;
        water.position.y = 0.3;
    }

    // Change sky to more oceanic blue
    scene.background = new THREE.Color(0x4682B4);
    scene.fog = new THREE.Fog(0x4682B4, 60, 250);

    // Add some seagulls or ocean atmosphere
    for (let i = 0; i < 8; i++) {
        const gull = new THREE.Group();

        // Simple seagull shape
        const bodyGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        gull.add(body);

        const wingGeometry = new THREE.BoxGeometry(0.8, 0.02, 0.3);
        const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xEEEEEE });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.y = 0.05;
        gull.add(wings);

        gull.position.set(
            Math.random() * 300 - 150,
            5 + Math.random() * 10,
            Math.random() * 300 - 150
        );

        gull.userData = {
            speed: 0.02 + Math.random() * 0.01,
            direction: new THREE.Vector3(
                Math.random() - 0.5,
                (Math.random() - 0.5) * 0.1,
                Math.random() - 0.5
            ).normalize(),
            flapTime: Math.random() * Math.PI * 2
        };

        scene.add(gull);
        clouds.push(gull); // Reuse clouds array for cleanup
    }
}

function createStormEffects() {
    // Create additional dark clouds for storm
    for (let i = 0; i < 10; i++) {
        const stormCloud = createCloud();
        stormCloud.children.forEach(part => {
            part.material.color.setHex(0x666666);
            part.material.opacity = 0.9;
        });
        stormCloud.position.set(
            Math.random() * 300 - 150,
            Math.random() * 15 + 15,
            Math.random() * 300 - 150
        );
        clouds.push(stormCloud);
        scene.add(stormCloud);
    }

    // Darken the scene
    scene.background = new THREE.Color(0x445566);
    scene.fog = new THREE.Fog(0x445566, 30, 120);
}

function createCityBattleEffects() {
    // Add some air raid sirens effect (visual representation)
    for (let i = 0; i < 5; i++) {
        const sirenLight = new THREE.PointLight(0xFF0000, 1, 20);
        sirenLight.position.set(
            Math.random() * 200 - 100,
            5 + Math.random() * 5,
            Math.random() * 200 - 100
        );
        scene.add(sirenLight);
        clouds.push(sirenLight); // Store for cleanup
        
        // Make sirens flash
        let flashTime = 0;
        const flashInterval = setInterval(() => {
            flashTime += 0.1;
            sirenLight.intensity = Math.sin(flashTime * 10) > 0 ? 1.5 : 0.2;
        }, 100);
        
        // Store interval for cleanup
        sirenLight.userData = { flashInterval };
    }
    
    // Add more smoke for city battle
    for (let i = 0; i < 15; i++) {
        const smoke = createIndustrialSmoke();
        smoke.position.set(
            Math.random() * 300 - 150,
            Math.random() * 15 + 5,
            Math.random() * 300 - 150
        );
        clouds.push(smoke);
        scene.add(smoke);
    }
}

function spawnEnemies() {
    const level = levels[currentLevel];
    for (let i = 0; i < level.enemyCount; i++) {
        createEnemy();
    }
}

function createEnemy() {
    const level = levels[currentLevel];

    // Create boats for water battle level
    if (level.specialRules === 'water_battle') {
        return createBattleBoat();
    }

    const enemy = new THREE.Group();

    // Check for special level rules
    const isBoss = level.specialRules === 'boss_enemy';
    const isSlowEnemy = level.specialRules === 'enemies_slow';

    // Create enemy fuselage (larger for boss)
    const scale = isBoss ? 1.5 : 1;
    const fuselageGeometry = new THREE.CylinderGeometry(0.4 * scale, 0.25 * scale, 2.5 * scale, 12);
    const fuseMaterial = new THREE.MeshPhongMaterial({ 
        color: isBoss ? 0x440000 : 0x777777,
        shininess: 30,
        specular: 0x222222
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuseMaterial);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    enemy.add(fuselage);

    // Create enemy wings
    const wingGeometry = new THREE.BoxGeometry(4 * scale, 0.1 * scale, 0.8 * scale, 6, 1, 3);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: isBoss ? 0x550000 : 0x888888,
        shininess: 10
    });

    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.y = 0;
    wing.castShadow = true;
    enemy.add(wing);

    // Create enemy propeller
    const propellerGeometry = new THREE.BoxGeometry(0.08 * scale, 2 * scale, 0.04 * scale, 3, 6, 2);
    const propellerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x8B4513,
        shininess: 80
    });
    const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
    propeller.position.z = 1.3 * scale;
    propeller.castShadow = true;
    enemy.add(propeller);

    // Position enemy randomly around the world
    enemy.position.set(
        Math.random() * 200 - 100,
        Math.random() * 15 + 10,
        Math.random() * 200 - 100
    );

    // Add random rotation
    enemy.rotation.y = Math.random() * Math.PI * 2;

    // Add movement properties based on level type
    let baseSpeed = isSlowEnemy ? 0.07 : 0.14; // slightly faster, more aggressive
    let baseHealth = isBoss ? 3 : 1;
    let shootCooldown = isBoss ? 28 : (100 + Math.random() * 50); // shoots a bit more often

    enemy.userData = {
        speed: baseSpeed + Math.random() * 0.05,
        direction: new THREE.Vector3(
            Math.random() - 0.5,
            (Math.random() - 0.5) * 0.2,
            Math.random() - 0.5
        ).normalize(),
        turnSpeed: 0.01 + Math.random() * 0.01,
        health: baseHealth,
        maxHealth: baseHealth,
        shootTimer: 0,
        shootCooldown: shootCooldown,
        isBoss: isBoss,
        scale: scale
    };

    enemies.push(enemy);
    scene.add(enemy);
}

function createBattleBoat() {
    const boat = new THREE.Group();

    // Create boat hull
    const hullGeometry = new THREE.BoxGeometry(8, 1.5, 3, 8, 2, 4);
    const hullMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x333333,
        shininess: 30,
        specular: 0x222222
    });
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.position.y = 0.75;
    hull.castShadow = true;
    boat.add(hull);

    // Create boat superstructure
    const superGeometry = new THREE.BoxGeometry(3, 2, 2, 4, 2, 3);
    const superMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x555555,
        shininess: 20
    });
    const superstructure = new THREE.Mesh(superGeometry, superMaterial);
    superstructure.position.set(0, 2.25, 0);
    superstructure.castShadow = true;
    boat.add(superstructure);

    // Create gun turrets
    const turretGeometry = new THREE.CylinderGeometry(0.8, 1, 1, 12);
    const turretMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x444444,
        shininess: 50
    });

    // Front turret
    const frontTurret = new THREE.Mesh(turretGeometry, turretMaterial);
    frontTurret.position.set(0, 3, 2);
    frontTurret.castShadow = true;
    boat.add(frontTurret);

    // Rear turret
    const rearTurret = new THREE.Mesh(turretGeometry, turretMaterial);
    rearTurret.position.set(0, 3, -2);
    rearTurret.castShadow = true;
    boat.add(rearTurret);

    // Create gun barrels
    const barrelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
    const barrelMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x222222,
        shininess: 80
    });

    const frontBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    frontBarrel.position.set(0, 0.5, 1);
    frontBarrel.rotation.x = Math.PI / 2;
    frontTurret.add(frontBarrel);

    const rearBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    rearBarrel.position.set(0, 0.5, 1);
    rearBarrel.rotation.x = Math.PI / 2;
    rearTurret.add(rearBarrel);

    // Create smokestacks
    const stackGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
    const stackMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x666666,
        shininess: 20
    });

    const stack1 = new THREE.Mesh(stackGeometry, stackMaterial);
    stack1.position.set(-1, 3.5, -0.5);
    stack1.castShadow = true;
    boat.add(stack1);

    const stack2 = new THREE.Mesh(stackGeometry, stackMaterial);
    stack2.position.set(1, 3.5, -0.5);
    stack2.castShadow = true;
    boat.add(stack2);

    // Position boat on water surface
    boat.position.set(
        Math.random() * 200 - 100,
        0.5, // On water surface
        Math.random() * 200 - 100
    );

    // Add random rotation
    boat.rotation.y = Math.random() * Math.PI * 2;

    // Add movement properties for boats
    boat.userData = {
        speed: 0.03 + Math.random() * 0.02, // Slower than aircraft
        direction: new THREE.Vector3(
            Math.random() - 0.5,
            0, // Boats don't move vertically
            Math.random() - 0.5
        ).normalize(),
        turnSpeed: 0.005 + Math.random() * 0.005,
        health: 2, // Boats are tougher
        maxHealth: 2,
        shootTimer: 0,
        shootCooldown: 80 + Math.random() * 40, // Slower shooting
        isBoat: true,
        scale: 1
    };

    enemies.push(boat);
    scene.add(boat);
}

function createProjectile(position, direction) {
    // Create missile group instead of simple sphere
    const missile = new THREE.Group();

    // Create missile body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.8, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x888888,
        shininess: 100,
        specular: 0x444444
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    missile.add(body);

    // Create missile nose cone
    const noseGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
    const noseMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFF4444,
        emissive: 0x440000,
        emissiveIntensity: 0.3
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.z = 0.5;
    nose.rotation.x = Math.PI / 2;
    missile.add(nose);

    // Create fins
    const finGeometry = new THREE.BoxGeometry(0.02, 0.2, 0.15);
    const finMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x666666,
        shininess: 50
    });

    for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(finGeometry, finMaterial);
        const angle = (i / 4) * Math.PI * 2;
        fin.position.x = Math.cos(angle) * 0.08;
        fin.position.y = Math.sin(angle) * 0.08;
        fin.position.z = -0.3;
        missile.add(fin);
    }

    // Create exhaust trail effect
    const trailGeometry = new THREE.ConeGeometry(0.02, 0.3, 6);
    const trailMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFAA00,
        emissive: 0xFF6600,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.7
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.z = -0.6;
    trail.rotation.x = Math.PI / 2;
    missile.add(trail);

    missile.position.copy(position);
    missile.lookAt(missile.position.clone().add(direction));
    missile.userData = {
        velocity: direction.clone().multiplyScalar(1.0),
        life: 150,
        homingStrength: 0.03,
        maxSpeed: 1.8,
        trailParticles: [],
        homingRange: 25 // Only home when within 25 units of an enemy
    };

    projectiles.push(missile);
    scene.add(missile);
}

function createEnemyProjectile(position, direction) {
    const projectileGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const projectileMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFF4444,
        emissive: 0xFF2222,
        emissiveIntensity: 0.7
    });
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);

    projectile.position.copy(position);
    projectile.userData = {
        velocity: direction.clone().multiplyScalar(1.2),
        life: 150 // frames to live
    };

    enemyProjectiles.push(projectile);
    scene.add(projectile);
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const userData = enemy.userData;

        // Special movement for boats
        if (userData.isBoat) {
            // Keep boats on water surface
            enemy.position.y = 0.5;

            // Move boat forward in its facing direction
            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyEuler(enemy.rotation);
            enemy.position.add(forward.multiplyScalar(userData.speed));

            // Turn occasionally
            if (Math.random() < 0.01) {
                enemy.rotation.y += (Math.random() - 0.5) * 0.3;
            }

            // Keep boats within bounds and avoid shore
            if (Math.abs(enemy.position.x) > 120 || Math.abs(enemy.position.z) > 120) {
                // Turn around when hitting boundaries
                enemy.rotation.y += Math.PI + (Math.random() - 0.5) * 0.5;
            }

            // Create wake effect behind boat
            if (Math.random() < 0.3) {
                createBoatWake(enemy.position.clone());
            }
        } else {
            // Normal aircraft movement
            // Steer toward player for pursuit
            const toPlayer = new THREE.Vector3().subVectors(biplane.position, enemy.position).normalize();
            userData.direction.lerp(toPlayer, 0.035 + Math.random() * 0.015);
            enemy.position.add(userData.direction.clone().multiplyScalar(userData.speed * 1.15));
            enemy.lookAt(enemy.position.clone().add(userData.direction));
        }

        // Enemy shooting logic with predictive aiming
        userData.shootTimer++;
        if (userData.shootTimer >= userData.shootCooldown) {
            // Calculate predictive targeting
            const distanceToPlayer = enemy.position.distanceTo(biplane.position);
            const timeToTarget = distanceToPlayer / 1.2; // projectile speed

            // Predict player position
            const predictedPlayerPos = biplane.position.clone();
            if (moveForward || moveBackward || moveLeft || moveRight) {
                const playerVelocity = new THREE.Vector3();
                if (moveForward) {
                    playerVelocity.x += Math.sin(biplane.rotation.y) * speed;
                    playerVelocity.z += Math.cos(biplane.rotation.y) * speed;
                }
                if (moveBackward) {
                    playerVelocity.x -= Math.sin(biplane.rotation.y) * speed;
                    playerVelocity.z -= Math.cos(biplane.rotation.y) * speed;
                }
                if (moveLeft) {
                    playerVelocity.x -= Math.cos(biplane.rotation.y) * speed;
                    playerVelocity.z += Math.sin(biplane.rotation.y) * speed;
                }
                if (moveRight) {
                    playerVelocity.x += Math.cos(biplane.rotation.y) * speed;
                    playerVelocity.z -= Math.sin(biplane.rotation.y) * speed;
                }
                if (moveUp) playerVelocity.y += speed;
                if (moveDown) playerVelocity.y -= speed;

                predictedPlayerPos.add(playerVelocity.multiplyScalar(timeToTarget * 60));
            }

            // Calculate direction to predicted position
            const directionToPlayer = new THREE.Vector3()
                .subVectors(predictedPlayerPos, enemy.position)
                .normalize();

            // Add some inaccuracy but much less than before
            const shootDirection = directionToPlayer.clone();
            shootDirection.x += (Math.random() - 0.5) * 0.1;
            shootDirection.y += (Math.random() - 0.5) * 0.08;
            shootDirection.z += (Math.random() - 0.5) * 0.1;
            shootDirection.normalize();

            const shootPosition = enemy.position.clone();
            shootPosition.y -= 0.2;

            createEnemyProjectile(shootPosition, shootDirection);

            // Play enemy shoot sound
            playSound('enemyShoot');

            userData.shootTimer = 0;
            userData.shootCooldown = 40 + Math.random() * 80; // Faster shooting
        }
    }

    // Spawn new enemies occasionally based on current level
    const level = levels[currentLevel];
    enemySpawnTimer++;
    if (enemySpawnTimer > level.enemySpawnRate && enemies.length < level.enemyCount) {
        createEnemy();
        enemySpawnTimer = 0;
    }
}

function createBoatWake(position) {
    for (let i = 0; i < 4; i++) {
        const pos = new THREE.Vector3(position.x + (Math.random()-0.5)*1.2, 0.28, position.z - 1.2 - Math.random()*1.6);
        const vel = new THREE.Vector3((Math.random()-0.5)*0.02, 0, -0.01);
        const s = makeSpriteParticle(pos, { color: 0xffffff, opacity: 0.5, size: 0.6+Math.random()*0.5, life: 70+Math.random()*30, velocity: vel });
        smokeParticles.push(s); scene.add(s);
    }
}

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        const userData = projectile.userData;

        // Find closest enemy within homing range
        let targetEnemy = null;
        let closestDistance = Infinity;

        for (const enemy of enemies) {
            const distance = projectile.position.distanceTo(enemy.position);
            if (distance < closestDistance && distance < userData.homingRange) {
                closestDistance = distance;
                targetEnemy = enemy;
            }
        }

        // Only home if enemy is within range
        if (targetEnemy && closestDistance < userData.homingRange) {
            const targetDirection = new THREE.Vector3()
                .subVectors(targetEnemy.position, projectile.position)
                .normalize();

            // Gradually steer towards target
            userData.velocity.lerp(
                targetDirection.multiplyScalar(userData.maxSpeed), 
                userData.homingStrength
            );

            // Limit speed
            if (userData.velocity.length() > userData.maxSpeed) {
                userData.velocity.normalize().multiplyScalar(userData.maxSpeed);
            }

            // Orient missile to face movement direction
            if (userData.velocity.length() > 0.1) {
                const lookDirection = userData.velocity.clone().normalize();
                projectile.lookAt(projectile.position.clone().add(lookDirection));
            }
        }

        // Move projectile
        projectile.position.add(userData.velocity);
        userData.life--;

        // Create trail particles
        if (Math.random() < 0.3) {
            const trailParticle = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: 0xFF6600,
                    emissive: 0xFF3300,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.8
                })
            );
            trailParticle.position.copy(projectile.position);
            trailParticle.position.z -= 0.5; // Behind the missile
            trailParticle.userData = {
                life: 20,
                maxLife: 20
            };
            userData.trailParticles.push(trailParticle);
            scene.add(trailParticle);
        }

        // Update trail particles
        for (let j = userData.trailParticles.length - 1; j >= 0; j--) {
            const particle = userData.trailParticles[j];
            particle.userData.life--;
            const lifeRatio = particle.userData.life / particle.userData.maxLife;
            particle.material.opacity = lifeRatio * 0.8;
            particle.scale.setScalar(lifeRatio);

            if (particle.userData.life <= 0) {
                scene.remove(particle);
                userData.trailParticles.splice(j, 1);
            }
        }

        // Remove projectile if life expired or out of bounds
        if (userData.life <= 0 || Math.abs(projectile.position.x) > 200 || Math.abs(projectile.position.z) > 200) {
            // Clean up trail particles
            for (const particle of userData.trailParticles) {
                scene.remove(particle);
            }
            scene.remove(projectile);
            projectiles.splice(i, 1);
            continue;
        }

        // Check collision with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const distance = projectile.position.distanceTo(enemy.position);

            if (distance < 2) {
                // Hit enemy - create enhanced explosion
                createMissileExplosion(enemy.position.clone());

                scene.remove(enemy);
                enemies.splice(j, 1);

                // Clean up trail particles
                for (const particle of userData.trailParticles) {
                    scene.remove(particle);
                }
                scene.remove(projectile);
                projectiles.splice(i, 1);

                // Play enemy explosion sound
                playSound('enemyExplosion');

                // Create enemy explosion effect
                createEnemyExplosionEffect(enemy.position.clone());

                // Update mission progress
                if (levels[currentLevel].type === 'destroy') {
                    missionData.progress++;
                    updateMissionProgress();
                }

                // Increase score
                score += 15; // More points for missile kills
                document.getElementById('score').textContent = `SCORE: ${Math.floor(score)}`;
                break;
            }
        }
    }
}

function updateEnemyProjectiles() {
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const projectile = enemyProjectiles[i];
        const userData = projectile.userData;

        // Move projectile
        projectile.position.add(userData.velocity);
        userData.life--;

        // Remove projectile if life expired or out of bounds
        if (userData.life <= 0 || Math.abs(projectile.position.x) > 200 || Math.abs(projectile.position.z) > 200) {
            scene.remove(projectile);
            enemyProjectiles.splice(i, 1);
            continue;
        }

        // Check collision with ground
        if (projectile.position.y < 0.5) {
            scene.remove(projectile);
            enemyProjectiles.splice(i, 1);
        }
    }
}

function createEnemyExplosionEffect(position) {
    for (let i = 0; i < 24; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.4, Math.random()*0.35, (Math.random()-0.5)*0.4);
        const color = new THREE.Color(1, 0.4 + Math.random()*0.6, Math.random()*0.2);
        const s = makeSpriteParticle(
            new THREE.Vector3(position.x + (Math.random()-0.5)*2.5, position.y + (Math.random()-0.5)*2.0, position.z + (Math.random()-0.5)*2.5),
            { color, opacity: 1.0, size: 0.8+Math.random()*1.1, life: 90+Math.random()*50, velocity: vel }
        );
        explosionParticles.push(s); scene.add(s);
    }
    for (let i = 0; i < 25; i++) {
        const fragGeometry = new THREE.TetrahedronGeometry(0.15 + Math.random() * 0.2);
        const fragMaterial = new THREE.MeshPhongMaterial({
            map: textures.metal,
            shininess: 100,
            emissive: new THREE.Color(0.5, 0.2, 0.1),
            emissiveIntensity: 0.2
        });
        const fragment = new THREE.Mesh(fragGeometry, fragMaterial);
        fragment.position.copy(position);

        fragment.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.2) * 0.6, // Upward bias
                (Math.random() - 0.5) * 0.8
            ),
            rotationSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3
            ),
            life: 180 + Math.random() * 120
        };

        detachedParts.push(fragment);
        scene.add(fragment);
    }
}

function createMissileExplosion(position) {
    for (let i = 0; i < 28; i++) {
        const vel = new THREE.Vector3((Math.random()-0.5)*0.5, Math.random()*0.4, (Math.random()-0.5)*0.5);
        const color = new THREE.Color(1, 0.6 + Math.random()*0.4, Math.random()*0.1);
        const s = makeSpriteParticle(
            new THREE.Vector3(position.x + (Math.random()-0.5)*3, position.y + (Math.random()-0.5)*2.5, position.z + (Math.random()-0.5)*3),
            { color, opacity: 1.0, size: 0.9+Math.random()*1.2, life: 100+Math.random()*50, velocity: vel }
        );
        explosionParticles.push(s); scene.add(s);
    }
}

function updateDamageEffects() {
    // Update explosion particles
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i], u = p.userData;
        p.position.add(u.velocity); u.life--;
        const lifeRatio = u.life / u.maxLife;
        if (p.material && 'opacity' in p.material) p.material.opacity = lifeRatio;
        if (p.scale && p.scale.setScalar) p.scale.setScalar((p.scale.x || 1) * 0.98);
        u.velocity.y -= 0.002;
        if (u.life <= 0) { scene.remove(p); explosionParticles.splice(i, 1); }
    }
    // Update smoke particles
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const p = smokeParticles[i], u = p.userData;
        p.position.add(u.velocity); u.life--;
        const lifeRatio = u.life / u.maxLife;
        if (p.scale && p.scale.setScalar) p.scale.setScalar((p.scale.x || 0.6) * 1.015);
        if (p.material && 'opacity' in p.material) p.material.opacity = Math.min(0.65, lifeRatio);
        u.velocity.multiplyScalar(0.985); u.velocity.y += 0.002;
        if (u.life <= 0) { scene.remove(p); smokeParticles.splice(i, 1); }
    }
    // Update detached parts
    for (let i = detachedParts.length - 1; i >= 0; i--) {
        const part = detachedParts[i];
        const userData = part.userData;

        if (!userData) continue;

        // Apply physics
        part.position.add(userData.velocity);

        // Apply rotation
        if (userData.rotationSpeed) {
            part.rotation.x += userData.rotationSpeed.x;
            part.rotation.y += userData.rotationSpeed.y;
            part.rotation.z += userData.rotationSpeed.z;
        }

        // Apply gravity
        userData.velocity.y -= 0.003;

        // Apply drag
        userData.velocity.multiplyScalar(0.99);

        // Decrease lifetime
        if (userData.life !== undefined) {
            userData.life--;

            // Fade out at end of life
            if (userData.life < 60 && part.material) {
                if (Array.isArray(part.material)) {
                    part.material.forEach(mat => {
                        if (mat.transparent) {
                            mat.opacity = userData.life / 60;
                        } else {
                            mat.transparent = true;
                            mat.opacity = userData.life / 60;
                            mat.needsUpdate = true;
                        }
                    });
                } else if (part.material) {
                    if (part.material.transparent) {
                        part.material.opacity = userData.life / 60;
                    } else {
                        part.material.transparent = true;
                        part.material.opacity = userData.life / 60;
                        part.material.needsUpdate = true;
                    }
                }
            }

            // Remove at end of life
            if (userData.life <= 0) {
                scene.remove(part);
                detachedParts.splice(i, 1);
            }
        }
    }

    // Animate existing damage effects on biplane
    damageEffects.forEach((effect, index) => {
        if (effect.userData && effect.userData.life !== undefined) {
            effect.position.add(effect.userData.velocity);
            effect.userData.life--;
            effect.material.opacity = effect.userData.life / 60;

            if (effect.userData.life <= 0) {
                scene.remove(effect);
                damageEffects.splice(index, 1);
            }
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    if (!isGameOver && !levelComplete) {
        if (gameMode === 'airplane') {
            updateBiplanePosition();
        } else if (gameMode === 'person') {
            updatePersonPosition();
        }
        updateEnemies();
        updateProjectiles();
        updateEnemyProjectiles();
        updateDamageEffects();
        updateWater();
        updateMissionProgress();
        checkMissionComplete();

        // Update friendly plane for escort missions
        if (levels[currentLevel].type === 'escort') {
            updateFriendlyPlane();
        }

        // Animate checkpoint marker if it exists
        if (window.checkpointMarker) {
            window.checkpointMarker.userData.pulseTime += 0.05;
            const scale = 1 + Math.sin(window.checkpointMarker.userData.pulseTime) * 0.2;
            window.checkpointMarker.scale.setScalar(scale);
            window.checkpointMarker.rotation.y += 0.02;
        }
    }

    // Use composer for post-processing instead of direct rendering
    composer.render();
}

function createFriendlyPlane() {
    const friendly = new THREE.Group();

    // Create friendly fuselage (green color)
    const fuselageGeometry = new THREE.CylinderGeometry(0.4, 0.25, 2.5, 12);
    const fuseMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x00AA00,
        shininess: 30
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuseMaterial);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    friendly.add(fuselage);

    // Create wings
    const wingGeometry = new THREE.BoxGeometry(4, 0.1, 0.8, 6, 1, 3);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x00CC00,
        shininess: 10
    });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.castShadow = true;
    friendly.add(wing);

    // Position friendly plane near player
    friendly.position.set(
        biplane.position.x + 10,
        biplane.position.y - 2,
        biplane.position.z - 5
    );

    friendly.userData = {
        speed: 0.08,
        health: 2,
        maxHealth: 2,
        targetPosition: new THREE.Vector3().copy(levels[currentLevel].target),
        followPlayer: true
    };

    missionData.friendlyPlane = friendly;
    scene.add(friendly);
}

function updatePersonPosition() {
    if (!person || gameMode !== 'person') return;

    const userData = person.userData;

    // Handle parachuting
    if (userData.isParachuting) {
        userData.fallSpeed += 0.001; // Gravity
        userData.fallSpeed = Math.min(userData.fallSpeed, 0.1); // Terminal velocity
        person.position.y -= userData.fallSpeed;

        // Gentle horizontal drift
        person.position.x += (Math.random() - 0.5) * 0.02;
        person.position.z += (Math.random() - 0.5) * 0.02;

        // Check if landed
        if (person.position.y <= 1.5) {
            person.position.y = 1.5;
            userData.isParachuting = false;
            userData.fallSpeed = 0;

            // Remove parachute
            person.remove(parachute);
            parachute = null;

            // Allow jumping back into planes
            canJumpOut = true;
        }
        return;
    }

    // Ground movement
    const direction = new THREE.Vector3();
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (direction.length() > 0) {
        // Apply rotation based on movement direction
        const targetRotation = Math.atan2(direction.x, direction.z);
        person.rotation.y = targetRotation;

        // Move person
        person.position.x += direction.x * personSpeed;
        person.position.z += direction.z * personSpeed;

        // Walking animation
        userData.walkAnimation += 0.2;
        const leftLeg = person.children[2];
        const rightLeg = person.children[3];
        if (leftLeg && rightLeg) {
            leftLeg.rotation.x = Math.sin(userData.walkAnimation) * 0.3;
            rightLeg.rotation.x = Math.sin(userData.walkAnimation + Math.PI) * 0.3;
        }
    }

    // Keep person on ground
    person.position.y = 1.5;

    // Check for water
    if (water && person.position.y < 1) {
        person.position.y = 1;
        // Create splash effect
        if (Math.random() > 0.8) {
            createWaterSplash(person.position.clone());
        }
    }
}

function jumpOutOfPlane() {
    if (!canJumpOut || gameMode !== 'airplane') return;

    canJumpOut = false;
    gameMode = 'person';

    // Create person character
    createPerson();

    // Create parachute
    createParachute();

    // Remove camera from biplane
    biplane.remove(camera);

    // Position person at biplane location
    person.position.copy(biplane.position);
    person.position.y += 1;

    // Position camera for person view
    camera.position.set(0, 2, -5);
    person.add(camera);

    // Hide biplane temporarily (it crashes)
    biplane.visible = false;

    // Update controls display
    updateControlsDisplay();

    // Create some falling debris from the abandoned plane
    createAbandonedPlaneDebris();

    // Update jump out button
    document.getElementById('jump-out-button').style.display = 'none';
}

function createPerson() {
    person = new THREE.Group();

    // Create body
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.25, 1.5, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x8B4513,
        shininess: 10
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    person.add(body);

    // Create head
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFFDBAE,
        shininess: 5
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.7;
    head.castShadow = true;
    person.add(head);

    // Create legs
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8);
    const legMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x000080,
        shininess: 5
    });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, -0.4, 0);
    leftLeg.rotation.x = Math.PI / 2;
    leftLeg.castShadow = true;
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, -0.4, 0);
    rightLeg.rotation.x = Math.PI / 2;
    rightLeg.castShadow = true;
    person.add(rightLeg);

    // Create arms
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6);
    const armMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFFDBAE,
        shininess: 5
    });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 1.2, 0);
    leftArm.rotation.z = 0.3;
    leftArm.castShadow = true;
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 1.2, 0);
    rightArm.rotation.z = -0.3;
    rightArm.castShadow = true;
    person.add(rightArm);

    // Add weapon in hand
    const weaponGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
    const weaponMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x444444,
        shininess: 50
    });
    const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
    weapon.position.set(0.15, 0.2, 0.2);
    weapon.rotation.x = -Math.PI / 6;
    rightArm.add(weapon);

    person.userData = {
        isParachuting: true,
        fallSpeed: 0,
        walkAnimation: 0,
        weapon: weapon
    };

    scene.add(person);
}

function createParachute() {
    parachute = new THREE.Group();

    // Create parachute canopy
    const canopyGeometry = new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xFF0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 5;
    parachute.add(canopy);

    // Create parachute lines
    for (let i = 0; i < 8; i++) {
        const lineGeometry = new THREE.CylinderGeometry(0.01, 0.01, 5, 4);
        const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);

        const angle = (i / 8) * Math.PI * 2;
        line.position.set(
            Math.cos(angle) * 2,
            2.5,
            Math.sin(angle) * 2
        );
        line.rotation.z = Math.atan2(Math.sin(angle) * 2, 5);
        parachute.add(line);
    }

    person.add(parachute);
}

function createAbandonedPlaneDebris() {
    // Create some smoke and debris from the abandoned plane
    for (let i = 0; i < 10; i++) {
        const smokeGeometry = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 8, 8);
        const smokeMaterial = new THREE.MeshBasicMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.7
        });
        const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
        smoke.position.set(
            biplane.position.x + (Math.random() - 0.5) * 6,
            biplane.position.y + Math.random() * 3,
            biplane.position.z + (Math.random() - 0.5) * 6
        );
        smoke.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.2
            ),
            life: 200 + Math.random() * 100,
            maxLife: 300
        };
        smokeParticles.push(smoke);
        scene.add(smoke);
    }
}

function shootPersonWeapon() {
    if (!person || gameMode !== 'person') return;

    const weapon = person.userData.weapon;
    if (!weapon) return;

    // Create bullet from person's weapon
    const bulletGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFFF00,
        emissive: 0xFFAA00,
        emissiveIntensity: 0.8
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Position bullet at weapon tip
    const weaponWorldPos = new THREE.Vector3();
    weapon.getWorldPosition(weaponWorldPos);
    bullet.position.copy(weaponWorldPos);

    // Calculate direction (forward from person)
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyEuler(person.rotation);
    direction.y += 0.1; // Slight upward angle

    bullet.userData = {
        velocity: direction.multiplyScalar(0.8),
        life: 100
    };

    projectiles.push(bullet);
    scene.add(bullet);

    // Play shoot sound
    playSound('shoot');

    // Weapon recoil animation
    weapon.rotation.x = -Math.PI / 4;
    setTimeout(() => {
        if (weapon.parent) {
            weapon.rotation.x = -Math.PI / 6;
        }
    }, 100);
}

function tryEnterAirplane() {
    if (!person || gameMode !== 'person') return;

    // Check if near the crashed biplane or spawn a new one
    const distanceToBiplane = person.position.distanceTo(biplane.position);

    if (distanceToBiplane < 5) {
        // Enter existing biplane
        enterAirplane();
    } else {
        // Spawn new biplane near person
        spawnNewBiplane();
    }
}

function enterAirplane() {
    gameMode = 'airplane';

    // Remove camera from person
    person.remove(camera);

    // Add camera back to biplane
    camera.position.set(0, 3, -8);
    biplane.add(camera);

    // Position biplane at person location
    biplane.position.copy(person.position);
    biplane.position.y = 2;
    biplane.visible = true;

    // Remove person from scene
    scene.remove(person);
    person = null;

    // Reset health for entering plane
    playerHealth = Math.min(maxHealth, playerHealth + 10);
    updateHealthBar();

    // Update controls display
    updateControlsDisplay();
}

function spawnNewBiplane() {
    // Create spawn effect
    for (let i = 0; i < 15; i++) {
        const sparkGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const sparkMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            emissive: 0x0088FF,
            emissiveIntensity: 1.0
        });
        const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
        spark.position.set(
            person.position.x + (Math.random() - 0.5) * 3,
            person.position.y + Math.random() * 3,
            person.position.z + (Math.random() - 0.5) * 3
        );
        spark.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.2
            ),
            life: 60
        };
        explosionParticles.push(spark);
        scene.add(spark);
    }

    // Enter the airplane
    enterAirplane();

    // Play special sound
    playSound('engine');
}

function updateControlsDisplay() {
    const controlsDisplay = document.getElementById('controls-display');
    const airplaneControls = document.getElementById('airplane-controls');
    const personControls = document.getElementById('person-controls');

    if (showControls) {
        controlsDisplay.style.display = 'block';
        if (gameMode === 'airplane') {
            airplaneControls.style.display = 'block';
            personControls.style.display = 'none';
        } else {
            airplaneControls.style.display = 'none';
            personControls.style.display = 'block';
        }
    } else {
        controlsDisplay.style.display = 'none';
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
        document.getElementById('fullscreen-button').textContent = '';
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        document.getElementById('fullscreen-button').textContent = '';
    }
}

// Load GLB pine tree once and normalize height ~8 units
async function loadPineTreeModel() {
    if (pineTreeModel) return;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('pine_tree_low.glb');
    const model = gltf.scene;
    model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.material.side = THREE.FrontSide; } });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const targetHeight = 8;
    const s = targetHeight / Math.max(size.y || 1, 0.001);
    model.scale.setScalar(s);
    // Re-center at ground
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.y -= (center.y - box.min.y);
    pineTreeModel = model;
}

// load low poly grass once
async function loadGrassModel() {
    if (grassModel) return;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('low_poly_cartoon_grass.glb');
    const model = gltf.scene;
    model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    // Ground-align the model
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.y -= box.min.y; // place base at y=0
    grassModel = model;
}

function addGrassToGround(level = 1) {
    if (!grassModel) return;
    if (grassGroup) { scene.remove(grassGroup); grassGroup = null; }
    grassGroup = new THREE.Group();
    const count = level === 2 ? 0 : 250;
    for (let i = 0; i < count; i++) {
        const g = grassModel.clone(true);
        const randScale = 0.8 + Math.random() * 0.6; // 0.8x–1.4x variation
        g.scale.multiplyScalar(randScale);
        g.rotation.y = Math.random() * Math.PI * 2;
        g.position.set((Math.random() - 0.5) * 800, 0.01, (Math.random() - 0.5) * 800);
        grassGroup.add(g);
    }
    scene.add(grassGroup);
}

function getCircleTexture() {
    if (_circleTex) return _circleTex;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(0,0,size,size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    _circleTex = tex; return tex;
}

function makeSpriteParticle(position, options = {}) {
    const tex = getCircleTexture();
    const mat = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color(options.color || 0xffffff),
        opacity: options.opacity ?? 0.9,
        depthWrite: false,
        transparent: true
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    const size = options.size ?? 0.8;
    sprite.scale.setScalar(size);
    sprite.userData = {
        velocity: options.velocity || new THREE.Vector3(),
        life: options.life ?? 80,
        maxLife: options.maxLife ?? 80,
        fade: options.fade ?? true
    };
    return sprite;
}

// Start the game
init();