// A loaded fishing world: sky, lighting, terrain, water, vegetation, structures and ambient particles.
import * as THREE from 'three';
import { WORLD_PRESETS } from './WorldPresets.js';
import { buildTerrain, bakeDepthTexture } from './Terrain.js';
import { buildVegetation } from './Vegetation.js';
import { buildStructure, SPAWNS } from './Structures.js';
import { AmbientParticles } from '../rendering/Particles.js';
import { WORLDS_BY_ID } from '@game/worlds.js';

const DEG = Math.PI / 180;

export class World {
  constructor(id, quality, sky, water, scene) {
    this.id = id;
    this.def = WORLDS_BY_ID[id];
    this.preset = WORLD_PRESETS[id];
    this.quality = quality;
    this.sky = sky;
    this.water = water;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'world:' + id;
    this.time = 0;
    this.spawn = SPAWNS[id];
    this.event = null;
    this._build();
  }

  _build() {
    const p = this.preset, q = this.quality;
    const terrain = buildTerrain(this.id, p, q);
    this.heightFn = terrain.heightAt;
    if (this.id !== 'deep') this.group.add(terrain.mesh);
    const st = buildStructure(p.structure, q);
    this.walkable = st.walkable;
    this.group.add(st.group);
    this.structure = st.group;
    const avoid = (x, z) => this._inWalkable(x, z, 2.5) || Math.hypot(x - this.spawn.x, z - this.spawn.z) < 6;
    this.vegetation = buildVegetation(this.id, p, q, this.heightFn, avoid);
    this.group.add(this.vegetation);

    // lights
    this.hemi = new THREE.HemisphereLight(p.hemi.sky, p.hemi.ground, p.hemi.intensity);
    this.sun = new THREE.DirectionalLight(p.sun.color, p.sun.intensity);
    this.sun.position.set(0, 50, 0);
    if (q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -20; c.right = 20; c.top = 20; c.bottom = -20; c.near = 1; c.far = 150;
      this.sun.shadow.bias = -0.0005;
    }
    this.group.add(this.hemi, this.sun, this.sun.target);

    // water depth bake
    this.bounds = { x: this.spawn.x - 160, z: this.spawn.z - 160, w: 320, h: 320 };
    this.depthTex = bakeDepthTexture(this.heightFn, this.bounds, q.textureSize >= 512 ? 160 : 96);

    // ambient particles
    const counts = { fireflies: 60, plankton: 220, dust: 50 };
    const colors = { fireflies: 0xfff07a, plankton: 0x40d8ff, dust: 0xffffff };
    if (p.particles && counts[p.particles]) {
      const n = Math.round(counts[p.particles] * (q.particles / 600));
      this.ambient = new AmbientParticles(n, colors[p.particles], p.particles);
      this.group.add(this.ambient.points);
    }
    this.rain = new AmbientParticles(Math.round(q.particles * 0.6), 0xaabbcc, 'rain');
    this.rain.points.visible = false;
    this.group.add(this.rain.points);
  }

  attach() {
    const p = this.preset;
    this.scene.add(this.group);
    this.sky.apply(p.sky);
    this.water.apply(p.water, this.depthTex, this.bounds);
    this.water.mesh.visible = true;
    this.scene.fog = new THREE.FogExp2(p.fog.color, p.fog.density);
    this.scene.background = new THREE.Color(p.fog.color);
    this._applyLighting(0);
  }

  detach() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    if (this.depthTex) this.depthTex.dispose();
  }

  setEvent(ev) { this.event = ev; }

  _applyLighting() {
    const p = this.preset;
    // slow day cycle around the preset sun position (+-10 degrees over ~12 minutes)
    const elev = (p.sun.elevation + Math.sin(this.time / 115) * 10) * DEG;
    const az = (p.sun.azimuth + Math.sin(this.time / 230) * 15) * DEG;
    const dir = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), -Math.cos(elev) * Math.cos(az)).normalize();
    const storm = this.event && this.event.id === 'storm';
    const dim = storm ? 0.45 : 1;
    this.sun.intensity = p.sun.intensity * dim * (0.75 + 0.25 * Math.sin(elev));
    this.hemi.intensity = p.hemi.intensity * (storm ? 0.7 : 1);
    this.sky.uniforms.uSunDir.value.copy(dir);
    this.sky.uniforms.uCloudCover.value = storm ? 0.85 : p.sky.cloudCover;
    const top = new THREE.Color(p.sky.top), hor = new THREE.Color(p.sky.horizon);
    if (storm) { top.lerp(new THREE.Color(0x3a4450), 0.7); hor.lerp(new THREE.Color(0x6a7480), 0.7); }
    this.sky.uniforms.uTop.value.copy(top);
    this.sky.uniforms.uHorizon.value.copy(hor);
    const fogC = new THREE.Color(p.fog.color);
    if (storm) fogC.lerp(new THREE.Color(0x5a6470), 0.6);
    if (this.scene.fog) { this.scene.fog.color.copy(fogC); this.scene.fog.density = p.fog.density * (storm ? 1.6 : 1); }
    this.scene.background = fogC;
    this.water.setSky(top, hor, fogC, this.scene.fog ? this.scene.fog.density : 0.006, dir, new THREE.Color(p.sun.color).multiplyScalar(storm ? 0.3 : 1));
    this.water.uniforms.uAmp.value = storm ? 1.8 : 1;
    this.sunDir = dir;
  }

  update(dt, playerPos) {
    this.time += dt;
    this._applyLighting();
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(playerPos);
    if (this.ambient) this.ambient.update(dt, playerPos);
    const storm = this.event && this.event.id === 'storm';
    this.rain.points.visible = storm;
    if (storm) this.rain.update(dt, playerPos);
  }

  setPixelHeight(h) {
    if (this.ambient) this.ambient.setPixelHeight(h);
    this.rain.setPixelHeight(h);
  }

  _inWalkable(x, z, margin = 0) {
    for (const r of this.walkable) {
      if (x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin) return r;
    }
    return null;
  }

  terrainHeight(x, z) { return this.heightFn(x, z); }

  /** Height of walkable ground at (x,z) or null when not walkable (water / out of bounds). */
  groundHeight(x, z) {
    const r = this._inWalkable(x, z, 0);
    if (r) return r.y;
    if (this.id === 'deep') return null;
    if (Math.hypot(x - this.spawn.x, z - this.spawn.z) > 120) return null;
    const h = this.heightFn(x, z);
    if (h < 0.15) return null;
    if (h > 12) return null;
    return h;
  }

  /** Water depth (m) at a point, 0 when on land or under a structure. */
  waterDepth(x, z) {
    if (this._inWalkable(x, z, 0.3)) return 0;
    return Math.max(0, -this.heightFn(x, z));
  }

  isWater(x, z) { return this.waterDepth(x, z) > 0.4; }
}
