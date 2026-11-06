// Water surface: Gerstner-style sine waves in the vertex shader, scrolling detail
// normals, Fresnel sky reflection, sun glints, depth-based colour/transparency and
// shore foam. Optional planar reflection (flat-screen, high quality only).
import * as THREE from 'three';
import { waterNormalTexture } from './textures.js';

const MAX_WAVES = 4;

const vert = /* glsl */`
uniform float uTime;
uniform float uAmp;
uniform vec4 uWaves[${MAX_WAVES}];
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vFogDepth;
#ifdef REFLECTION
uniform mat4 uTexMatrix;
varying vec4 vReflCoord;
#endif
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 p = wp.xyz;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  float fade = 1.0 - smoothstep(60.0, 220.0, length(p.xz - cameraPosition.xz));
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec2 d = normalize(uWaves[i].xy);
    float k = 6.28318 / uWaves[i].w;
    float c = sqrt(9.8 / k);
    float f = k * (dot(d, p.xz) - c * uTime);
    h += uWaves[i].z * sin(f);
    grad += uWaves[i].z * k * cos(f) * d;
  }
  h *= uAmp * fade;
  grad *= uAmp * fade;
  p.y += h;
  vNormalW = normalize(vec3(-grad.x, 1.0, -grad.y));
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
#ifdef REFLECTION
  vReflCoord = uTexMatrix * vec4(p, 1.0);
#endif
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */`
precision highp float;
uniform float uTime;
uniform sampler2D uNormalMap;
uniform sampler2D uDepthMap;
uniform vec4 uDepthBounds;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uNormalStrength;
uniform float uFoam;
uniform float uFlow;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vFogDepth;
#ifdef REFLECTION
uniform sampler2D uReflection;
varying vec4 vReflCoord;
#endif
void main() {
  vec2 flow = vec2(uFlow, 0.0) * uTime;
  vec2 uv1 = vWorld.xz * 0.055 + vec2(uTime * 0.012, uTime * 0.008) + flow * 0.06;
  vec2 uv2 = vWorld.xz * 0.16 - vec2(uTime * 0.018, -uTime * 0.011) + flow * 0.16;
  vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
  vec2 det = (n1.xy + n2.xy) * uNormalStrength;
  vec3 N = normalize(vNormalW + vec3(det.x, 0.0, det.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = mix(uSkyHorizon, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
#ifdef REFLECTION
  vec4 rc = vReflCoord;
  rc.xy += N.xz * 0.6 * rc.w * 0.05;
  vec3 planar = texture2DProj(uReflection, rc).rgb;
  refl = mix(refl, planar, 0.8);
#endif
  float sunR = max(dot(R, uSunDir), 0.0);
  vec3 spec = uSunColor * (pow(sunR, 380.0) * 6.0 + pow(sunR, 48.0) * 0.25);

  vec2 duv = (vWorld.xz - uDepthBounds.xy) / uDepthBounds.zw;
  float depth = 12.0;
  if (duv.x > 0.0 && duv.y > 0.0 && duv.x < 1.0 && duv.y < 1.0) depth = texture2D(uDepthMap, duv).r * 12.0;
  float dk = smoothstep(0.0, 7.0, depth);
  vec3 body = mix(uShallow, uDeep, dk);
  // light scattering in wave crests
  body += uShallow * max(vWorld.y, 0.0) * 0.35;
  vec3 col = mix(body, refl, fres) + spec;
  float foamN = texture2D(uNormalMap, vWorld.xz * 0.35 + uTime * 0.03).r;
  float foam = (1.0 - smoothstep(0.0, 0.7, depth)) * smoothstep(0.45, 0.65, foamN + 0.25 * sin(uTime * 1.3 + depth * 9.0)) * uFoam;
  col = mix(col, vec3(0.92, 0.95, 0.97), foam);
  float alpha = mix(mix(0.25, 0.9, smoothstep(0.0, 4.0, depth)), 1.0, fres);
  alpha = max(alpha, foam);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  constructor(quality, flatReflections) {
    this.quality = quality;
    this.waves = [];
    for (let i = 0; i < MAX_WAVES; i++) this.waves.push(new THREE.Vector4(1, 0, 0, 10));
    this.uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uWaves: { value: this.waves },
      uNormalMap: { value: waterNormalTexture(quality.textureSize >= 512 ? 256 : 128) },
      uDepthMap: { value: null },
      uDepthBounds: { value: new THREE.Vector4(-200, -200, 400, 400) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uSkyTop: { value: new THREE.Color(0x3a78c8) },
      uSkyHorizon: { value: new THREE.Color(0xb8d4e8) },
      uDeep: { value: new THREE.Color(0x0a2a3a) },
      uShallow: { value: new THREE.Color(0x2a6a6a) },
      uFogColor: { value: new THREE.Color(0xb8d4e8) },
      uFogDensity: { value: 0.006 },
      uNormalStrength: { value: 0.35 },
      uFoam: { value: 1 },
      uFlow: { value: 0 },
      uReflection: { value: null },
      uTexMatrix: { value: new THREE.Matrix4() },
    };
    this.reflectionEnabled = !!(quality.reflections && flatReflections);
    const defines = {};
    if (this.reflectionEnabled) defines.REFLECTION = 1;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: true, fog: false, defines,
    });
    const seg = quality.waterSegments;
    const geo = new THREE.PlaneGeometry(320, 320, seg, seg);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.gridStep = 320 / seg;
    this.level = 0;
    if (this.reflectionEnabled) this._initReflection();
  }

  _initReflection() {
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.UnsignedByteType });
    this.uniforms.uReflection.value = this.rt.texture;
    this.mirrorCam = new THREE.PerspectiveCamera();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  apply(preset, depthTexture, bounds) {
    const w = preset.waves;
    for (let i = 0; i < MAX_WAVES; i++) {
      const s = w[i] || [1, 0, 0, 10];
      this.waves[i].set(s[0], s[1], s[2], s[3]);
    }
    this.uniforms.uDeep.value.set(preset.deep);
    this.uniforms.uShallow.value.set(preset.shallow);
    this.uniforms.uNormalStrength.value = preset.normalStrength;
    this.uniforms.uFoam.value = preset.foam;
    this.uniforms.uFlow.value = preset.flow || 0;
    if (depthTexture) {
      this.uniforms.uDepthMap.value = depthTexture;
      this.uniforms.uDepthBounds.value.set(bounds.x, bounds.z, bounds.w, bounds.h);
    }
    this.flow = preset.flow || 0;
  }

  setSky(top, horizon, fogColor, fogDensity, sunDir, sunColor) {
    this.uniforms.uSkyTop.value.copy(top);
    this.uniforms.uSkyHorizon.value.copy(horizon);
    this.uniforms.uFogColor.value.copy(fogColor);
    this.uniforms.uFogDensity.value = fogDensity;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
  }

  /** CPU mirror of the vertex shader: surface height at (x,z). */
  heightAt(x, z) {
    const t = this.uniforms.uTime.value;
    let h = 0;
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = this.waves[i];
      const len = Math.hypot(w.x, w.y) || 1;
      const k = 6.28318 / w.w;
      const c = Math.sqrt(9.8 / k);
      h += w.z * Math.sin(k * ((w.x / len) * x + (w.y / len) * z - c * t));
    }
    return this.level + h * this.uniforms.uAmp.value;
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    const p = new THREE.Vector3();
    camera.getWorldPosition(p);
    const s = this.gridStep;
    this.mesh.position.set(Math.round(p.x / s) * s, this.level, Math.round(p.z / s) * s);
  }

  /** Planar reflection pass (flat screen only). */
  renderReflection(renderer, scene, camera) {
    if (!this.reflectionEnabled || renderer.xr.isPresenting) return;
    const cam = this.mirrorCam;
    camera.updateMatrixWorld();
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const target = new THREE.Vector3(0, 0, -1).applyMatrix4(camera.matrixWorld);
    camPos.y = 2 * this.level - camPos.y;
    target.y = 2 * this.level - target.y;
    cam.position.copy(camPos);
    cam.up.set(0, -1, 0);
    cam.lookAt(target);
    cam.up.set(0, 1, 0);
    cam.fov = camera.fov; cam.aspect = camera.aspect; cam.near = camera.near; cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // oblique clip plane would be ideal; a small clip offset is enough for a water plane
    const m = this.uniforms.uTexMatrix.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.mesh.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.level + 0.05)];
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT);
    renderer.clippingPlanes = prevClip;
    this.mesh.visible = true;
  }
}
