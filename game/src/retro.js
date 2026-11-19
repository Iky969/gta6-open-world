// PS1-style render pass, adapted from the /low-poly animation skill's shader patch.
// The scene is drawn into a small half-float render target so HDR values survive
// until the final ACES pass, vertices are snapped to a coarse screen grid, and the
// full-screen upscale quantizes to 15-bit colour with an ordered dither AFTER tone
// mapping. Every texture is switched to nearest filtering. Materials created after
// boot (mission, police, escort and traffic vehicles) are picked up by a periodic
// sweep so nothing spawned later misses the PS1 look.
import * as THREE from 'three';

export function installRetro(scene, renderer, camera, options = {}) {
  const scale = options.scale || 3;
  const snap = { value: new THREE.Vector2(240, 150) };
  const patched = new WeakSet();

  // 15-bit ordered-dither quantize. Applied on the final quad pass so it lands
  // after tone mapping + colour-space conversion, not on raw HDR per material.
  const QUANTIZE = `
    {
      const float BY[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
      float th = (BY[q.x + q.y * 4] + 0.5) / 16.0 - 0.5;
      gl_FragColor.rgb = clamp(floor(gl_FragColor.rgb * 31.0 + th + 0.5) / 31.0, 0.0, 1.0);
    }`;

  function ps1(material) {
    if (!material || patched.has(material)) return material;
    patched.add(material);
    for (const key of ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'bumpMap', 'normalMap']) {
      const texture = material[key];
      if (!texture || !texture.isTexture) continue;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }
    if (!(material.isMeshLambertMaterial || material.isMeshStandardMaterial ||
          material.isMeshPhongMaterial || material.isMeshBasicMaterial)) return material;
    // Vertex snap only: colour quantization lives on the final quad pass so it
    // runs after tone mapping instead of clipping HDR inside every material.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSnap = snap;
      shader.vertexShader = `uniform vec2 uSnap;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (gl_Position.w > 0.0) {
          gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
        }`
      );
    };
    material.customProgramCacheKey = () => 'vesper-ps1';
    material.userData.__ps1 = true;
    // Force a recompile so materials already drawn before the sweep pick up the
    // patch (boot-time materials are not compiled yet, so this is a no-op there).
    material.needsUpdate = true;
    return material;
  }

  function sweep() {
    scene.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) ps1(material);
    });
  }

  // Patch everything that exists at boot.
  sweep();

  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // toneMapped stays true: tone mapping is skipped while drawing to a target,
  // so it has to happen on this final full-screen pass. The quantize/dither is
  // injected after tone mapping + colour-space conversion (dithering_fragment is
  // the last chunk), so HDR is tone-mapped first, then crushed to 15-bit.
  const quadMaterial = new THREE.MeshBasicMaterial({
    map: target.texture, depthTest: false, depthWrite: false,
  });
  quadMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n${QUANTIZE}`
    );
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  // mult scales the low-res target for adaptive resolution / quality: <1 sheds
  // pixels when frames are slow, 1 is the nominal coarse grid.
  function resize(width, height, mult = 1) {
    const rw = Math.max(160, Math.floor(width / scale * mult));
    const rh = Math.max(100, Math.floor(height / scale * mult));
    target.setSize(rw, rh);
    snap.value.set(rw / 2, rh / 2);
  }

  // Periodically patch materials spawned after boot without editing the spawn
  // modules. Frame-counted (not wall-clock) so ?shot= captures stay deterministic.
  let sweepCountdown = 30;
  function render() {
    if (--sweepCountdown <= 0) { sweepCountdown = 30; sweep(); }
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  resize(window.innerWidth, window.innerHeight);
  return { render, resize, target, ps1 };
}