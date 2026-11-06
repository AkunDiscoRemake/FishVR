// Procedural sky dome: gradient atmosphere, sun disc + halo, fbm clouds, stars.
import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99995, p.w); // always at far plane
}`;

const frag = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uTime;
uniform float uCloudCover;
uniform float uNight;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.2, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 18.0 + pow(s, 14.0) * 0.28 + pow(s, 3.0) * 0.12);
#ifdef CLOUDS
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.6);
    c = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.35, c);
    float lit = 0.75 + 0.25 * pow(s, 4.0);
    vec3 cc = uCloudColor * lit + uSunColor * pow(s, 8.0) * 0.3;
    col = mix(col, cc, c * smoothstep(0.0, 0.12, h) * 0.9);
  }
#endif
  if (uNight > 0.0 && h > 0.0) {
    vec2 g = floor(d.xz / (h + 0.3) * 160.0);
    float st = step(0.996, hash(g)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(g + 3.0) * 30.0));
    col += vec3(st) * uNight * smoothstep(0.0, 0.2, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(quality) {
    this.uniforms = {
      uTop: { value: new THREE.Color(0x3a78c8) },
      uHorizon: { value: new THREE.Color(0xb8d4e8) },
      uGround: { value: new THREE.Color(0x4a5a5a) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.92, 0.8) },
      uCloudColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
      uCloudCover: { value: 0.45 },
      uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
      defines: quality.clouds ? { CLOUDS: 1 } : {},
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }
  apply(preset) {
    this.uniforms.uTop.value.set(preset.top);
    this.uniforms.uHorizon.value.set(preset.horizon);
    this.uniforms.uGround.value.set(preset.ground);
    this.uniforms.uCloudColor.value.set(preset.cloud);
    this.uniforms.uCloudCover.value = preset.cloudCover;
    this.uniforms.uNight.value = preset.night ? 1 : 0;
  }
  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    camera.getWorldPosition(this.mesh.position);
  }
}
