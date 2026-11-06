// Detects the device and what VR paths it supports, then picks a quality tier.
export async function detectCapabilities() {
  const ua = navigator.userAgent || '';
  const caps = {
    ua,
    isOculusBrowser: /OculusBrowser/i.test(ua),
    isOculusGo: /Pacific/i.test(ua) || (/OculusBrowser/i.test(ua) && /\bGo\b/i.test(ua)),
    isQuest: /Quest/i.test(ua),
    isQuest1: /Quest(?!\s*[23])/i.test(ua) && !/Quest\s*Pro/i.test(ua),
    isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    webxrVR: false,
    webvr: false,
    webvrDisplay: null,
    deviceOrientation: typeof window.DeviceOrientationEvent !== 'undefined',
    webgl2: false,
    gpu: '',
    tier: 'medium',
    touch: 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0,
  };
  // An Oculus/Quest headset also reports Android/Mobile in its UA
  if (caps.isOculusBrowser || caps.isQuest || caps.isOculusGo) caps.isMobile = false;

  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    caps.webgl2 = !!gl2;
    const gl = gl2 || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      caps.gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    }
  } catch (e) { /* ignore */ }

  if (navigator.xr && navigator.xr.isSessionSupported) {
    try { caps.webxrVR = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { caps.webxrVR = false; }
  }
  if (navigator.getVRDisplays) {
    try {
      const displays = await navigator.getVRDisplays();
      if (displays && displays.length) { caps.webvr = true; caps.webvrDisplay = displays[0]; }
    } catch (e) { caps.webvr = false; }
  }

  if (caps.isOculusGo) caps.tier = 'low';
  else if (caps.isQuest1) caps.tier = 'medium';
  else if (caps.isQuest) caps.tier = 'high';
  else if (caps.isMobile) caps.tier = /Adreno \(TM\) [6-7]\d\d|Mali-G7\d|Apple/i.test(caps.gpu) ? 'medium' : 'low';
  else caps.tier = 'high';
  if (!caps.webgl2 && caps.tier === 'high') caps.tier = 'medium';

  caps.dof = caps.isOculusGo ? 3 : (caps.isQuest ? 6 : 0);
  return caps;
}

export const QUALITY = {
  low: {
    pixelRatio: 1, xrScale: 0.85, antialias: false, waterSegments: 48, fishDetail: 0,
    trees: 70, grass: 250, ambientFish: 6, particles: 300, shadows: false, clouds: false,
    standardMaterials: false, reflections: false, lineSegments: 14, foveation: 1, textureSize: 256,
  },
  medium: {
    pixelRatio: 1.25, xrScale: 1.0, antialias: true, waterSegments: 80, fishDetail: 1,
    trees: 160, grass: 700, ambientFish: 12, particles: 600, shadows: false, clouds: true,
    standardMaterials: true, reflections: false, lineSegments: 20, foveation: 0.6, textureSize: 512,
  },
  high: {
    pixelRatio: 2, xrScale: 1.2, antialias: true, waterSegments: 140, fishDetail: 2,
    trees: 320, grass: 1800, ambientFish: 20, particles: 1200, shadows: true, clouds: true,
    standardMaterials: true, reflections: true, lineSegments: 28, foveation: 0.3, textureSize: 512,
  },
};
