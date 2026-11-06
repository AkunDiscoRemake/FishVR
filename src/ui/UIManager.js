// Routes the pointer (controller laser, gaze reticle or mouse) to world-space panels.
import * as THREE from 'three';
import { audio } from '../audio/AudioEngine.js';

export class UIManager {
  constructor(scene, input, camera) {
    this.scene = scene;
    this.input = input;
    this.camera = camera;
    this.panels = [];
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.pointingAtUI = false;

    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.85, depthTest: false }));
    this.laser.frustumCulled = false;
    this.laser.renderOrder = 200;
    this.laser.visible = false;
    scene.add(this.laser);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.014, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.reticle.renderOrder = 201;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  add(panel) { this.panels.push(panel); return panel; }
  remove(panel) { this.panels = this.panels.filter((p) => p !== panel); }

  update(dt, showLaserAlways) {
    const input = this.input;
    this.raycaster.ray.copy(input.ray);
    const meshes = [];
    for (const p of this.panels) {
      if (!p.interactive || !p.mesh.visible) continue;
      let vis = true;
      p.mesh.traverseAncestors((a) => { if (!a.visible) vis = false; });
      if (vis) meshes.push(p.mesh);
    }
    const hits = meshes.length ? this.raycaster.intersectObjects(meshes, false) : [];
    const hit = hits[0];
    let widget = null;
    for (const p of this.panels) {
      if (hit && hit.object === p.mesh) widget = p.setPointer(hit.uv);
      else p.setPointer(null);
    }
    this.pointingAtUI = !!hit;
    if (widget && (!this.hovered || this.hovered.id !== widget.id)) audio.hover();
    this.hovered = widget;
    if (hit && input.trigger.pressed) {
      input.consumeTrigger();
      if (widget) {
        audio.ui();
        input.pulse(0.3, 20);
        try { widget.onClick(); } catch (e) { console.error(e); }
      }
    } else if (hit && (input.trigger.down || input.trigger.released)) {
      input.consumeTrigger();
    }
    for (const p of this.panels) p.update(dt);

    // laser / reticle visuals
    const gaze = input.rayIsGaze;
    const len = hit ? hit.distance : 3;
    const showLaser = !gaze && input.source !== 'mouse' && (hit || showLaserAlways);
    this.laser.visible = !!showLaser;
    if (showLaser) {
      this.laser.position.copy(input.ray.origin);
      this.laser.lookAt(input.ray.origin.clone().add(input.ray.direction));
      this.laser.scale.set(1, 1, len);
      this.laser.material.color.set(hit ? 0xffffff : 0x7fe0ff);
    }
    const showRet = gaze && (hit || showLaserAlways);
    this.reticle.visible = !!showRet || (!!hit && !gaze && input.source !== 'mouse');
    if (this.reticle.visible) {
      const p = input.ray.origin.clone().addScaledVector(input.ray.direction, Math.max(0.3, len - 0.01));
      this.reticle.position.copy(p);
      this.reticle.lookAt(input.ray.origin);
      const s = Math.max(0.6, len * 0.8);
      this.reticle.scale.setScalar(s);
    }
  }
}
