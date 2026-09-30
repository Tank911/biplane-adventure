export function upgradeBiplaneVisuals(biplane, textures) {
    // Helper: replace Phong with Standard for better PBR look
    biplane.traverse((n) => {
        if (n.isMesh) {
            const old = n.material;
            const color = old?.color ? old.color.clone() : null;
            const map = old?.map || null;
            const metalParts = ['hub', 'cockpit', 'leftWheel', 'rightWheel'];
            const isMetal = n.userData && metalParts.includes(n.userData.part);
            const mat = new THREE.MeshStandardMaterial({
                color: color || 0xffffff,
                map,
                metalness: isMetal ? 0.8 : 0.15,
                roughness: isMetal ? 0.25 : 0.5
            });
            mat.envMapIntensity = 1.0;
            n.material = mat;
        }
    });

    // Engine cowl ring
    {
        const ringGeo = new THREE.TorusGeometry(0.55, 0.07, 16, 40);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x777777, metalness: 0.85, roughness: 0.22, map: textures.metal || null
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0.05, 1.45);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = true;
        ring.userData = { part: 'engineCowl' };
        biplane.add(ring);
    }

    // Radial engine cylinders
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const cylGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10);
        const cylMat = new THREE.MeshStandardMaterial({
            color: 0x666666, metalness: 0.9, roughness: 0.28, map: textures.metal || null
        });
        const cyl = new THREE.Mesh(cylGeo, cylMat);
        cyl.rotation.z = Math.PI / 2;
        cyl.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.25, 1.2);
        cyl.castShadow = true;
        biplane.add(cyl);
    }

    // Prop spinner (nose cap)
    {
        const spinnerGeo = new THREE.ConeGeometry(0.22, 0.35, 20);
        const spinnerMat = new THREE.MeshStandardMaterial({
            color: 0xBBBBBB, metalness: 0.85, roughness: 0.2, map: textures.metal || null
        });
        const spinner = new THREE.Mesh(spinnerGeo, spinnerMat);
        spinner.position.set(0, 0.05, 1.7);
        spinner.rotation.x = Math.PI / 2;
        spinner.castShadow = true;
        biplane.add(spinner);
    }

    // Wing support wires
    const addWire = (p1, p2) => {
        const v1 = new THREE.Vector3(...p1), v2 = new THREE.Vector3(...p2);
        const dir = new THREE.Vector3().subVectors(v2, v1);
        const len = dir.length();
        const geo = new THREE.CylinderGeometry(0.01, 0.01, len, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(v1).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        biplane.add(mesh);
    };
    // X-wires between wings and fuselage
    addWire([-2.0, 0.9, -0.3], [0.0, 0.3, 0.0]);
    addWire([ 2.0, 0.9,  0.3], [0.0, 0.3, 0.0]);
    addWire([-2.0,-0.3,  0.3], [0.0, 0.3, 0.0]);
    addWire([ 2.0,-0.3, -0.3], [0.0, 0.3, 0.0]);

    // Landing gear struts
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2a, metalness: 0.2, roughness: 0.6, map: textures.wood || null });
    const addStrut = (from, to) => {
        const v1 = new THREE.Vector3(...from), v2 = new THREE.Vector3(...to);
        const dir = new THREE.Vector3().subVectors(v2, v1);
        const len = dir.length();
        const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 8);
        const mesh = new THREE.Mesh(geo, strutMat);
        mesh.position.copy(v1).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        mesh.castShadow = true;
        biplane.add(mesh);
    };
    addStrut([-0.6, -0.6, 0.2], [-1.0, -1.0, 0.0]);
    addStrut([ 0.6, -0.6, 0.2], [ 1.0, -1.0, 0.0]);

    // Tail wheel
    {
        const wheelGeo = new THREE.TorusGeometry(0.12, 0.04, 8, 14);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4, roughness: 0.5 });
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(0, -0.8, -1.5);
        wheel.rotation.x = Math.PI / 2;
        wheel.castShadow = true;
        biplane.add(wheel);
    }

    // Subtle panel lines on fuselage (visual breakup)
    {
        const ringGeo = new THREE.TorusGeometry(0.48, 0.01, 8, 48);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x990000, metalness: 0.2, roughness: 0.55, map: textures.fabric || null });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0.05, 0.2);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = false;
        biplane.add(ring);
    }
}
// Three dependency for this module (browser import map provides THREE)
import * as THREE from 'three';