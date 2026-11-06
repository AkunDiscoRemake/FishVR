// Simple arm model for 3DoF controllers (Oculus Go under legacy WebVR):
// derives a plausible hand position from head pose + controller orientation.
import * as THREE from 'three';

export class ArmModel {
  constructor() {
    this.position = new THREE.Vector3();
    this._yaw = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._e = new THREE.Euler();
  }
  update(headPos, headQuat, ctrlQuat, handSign) {
    this._e.setFromQuaternion(headQuat, 'YXZ');
    this._yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._e.y);
    // shoulder
    this.position.set(0.19 * handSign, -0.42, 0.02).applyQuaternion(this._yaw).add(headPos);
    // elbow hangs slightly forward, forearm follows controller orientation
    this._v.set(0, -0.05, -0.12).applyQuaternion(this._yaw);
    this.position.add(this._v);
    this._v.set(0, 0, -0.3).applyQuaternion(ctrlQuat);
    this.position.add(this._v);
    return this.position;
  }
}
