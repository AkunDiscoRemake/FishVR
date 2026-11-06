// Visual guide for the PERFECT! system: a target ring at the ideal rod direction
// (inner ring = PERFECT zone, outer ring = Good zone), a reticle where the rod points,
// and an arrow showing the fish's pull.
import * as THREE from 'three';

export const GUIDE_DIST = 4.0;

export class FightGuide {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.renderOrder = 150;
    const mk = (inner, outer, color, opacity) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.renderOrder = 150;
      return m;
    };
    this.target = new THREE.Group();
    this.perfectRing = mk(0.94, 1.0, 0xffd23f, 1);
    this.goodRing = mk(0.97, 1.0, 0xffffff, 0.45);
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fill.renderOrder = 149;
    this.timer = mk(0.86, 0.92, 0x5cf2ff, 0.9);
    this.target.add(this.goodRing, this.perfectRing, this.fill, this.timer);
    this.group.add(this.target);
    this.reticle = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, toneMapped: false }));
    dot.renderOrder = 155;
    const cross = mk(0.05, 0.065, 0xffffff, 0.9);
    cross.renderOrder = 155;
    this.reticle.add(dot, cross);
    this.group.add(this.reticle);
    // pull arrow
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.12); shape.lineTo(0.12, -0.04); shape.lineTo(0.04, -0.04); shape.lineTo(0.04, -0.14);
    shape.lineTo(-0.04, -0.14); shape.lineTo(-0.04, -0.04); shape.lineTo(-0.12, -0.04); shape.lineTo(0, 0.12);
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide, toneMapped: false }));
    this.arrow.renderOrder = 151;
    this.group.add(this.arrow);
    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * @param origin hand position
   * @param idealDir unit vector
   * @param rodDir unit vector
   * @param perfectDeg / goodDeg tolerances in degrees
   * @param phase 'telegraph' | 'window' | 'idle'
   * @param progress 0..1 within phase
   */
  update(origin, idealDir, rodDir, perfectDeg, goodDeg, phase, progress, camPos, pullSide, enabled) {
    this.group.visible = enabled;
    if (!enabled) return;
    const D = GUIDE_DIST;
    this.target.position.copy(origin).addScaledVector(idealDir, D);
    this.target.lookAt(camPos);
    const rP = Math.tan(perfectDeg * Math.PI / 180) * D;
    const rG = Math.tan(goodDeg * Math.PI / 180) * D;
    this.perfectRing.scale.setScalar(rP);
    this.fill.scale.setScalar(rP);
    this.goodRing.scale.setScalar(rG);
    const tele = phase === 'telegraph';
    this.target.visible = phase !== 'idle';
    this.perfectRing.material.opacity = tele ? 0.25 + progress * 0.5 : 1;
    this.fill.material.opacity = tele ? 0.05 : 0.18 + 0.1 * Math.sin(progress * 40);
    this.goodRing.material.opacity = tele ? 0.2 : 0.5;
    // countdown ring shrinks during the window
    this.timer.visible = phase === 'window';
    this.timer.scale.setScalar(rG * (1 - progress) + rP);
    this.reticle.position.copy(origin).addScaledVector(rodDir, D);
    this.reticle.lookAt(camPos);
    const err = rodDir.angleTo(idealDir) * 180 / Math.PI;
    const col = err <= perfectDeg ? 0xffd23f : err <= goodDeg ? 0x7dff6a : 0xff6a4a;
    this.reticle.children[0].material.color.setHex(col);
    this.reticle.children[1].material.color.setHex(col);
    // arrow near target pointing toward the side the fish pulls
    this.arrow.visible = phase !== 'idle' && Math.abs(pullSide) > 0.05;
    if (this.arrow.visible) {
      this.arrow.position.copy(this.target.position);
      this.arrow.quaternion.copy(this.target.quaternion);
      this.arrow.translateX(Math.sign(pullSide) * (rG + 0.25));
      this.arrow.rotateZ(-Math.sign(pullSide) * Math.PI / 2);
    }
  }
}
