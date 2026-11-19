// PS1-style render pass, adapted from the /low-poly animation skill's shader patch.
// The scene is drawn into a small render target, snapped to a coarse screen grid,
// dithered to 15-bit colour, then upscaled with nearest-neighbour filtering.
// Every texture is also switched to nearest filtering, the way the skill paints
// its 16-64 px code textures.
import * as THREE from 'three';

export function installRetro(scene, renderer, camera, options = {}) {
  const scale = options.scale || 3;
  const snap = { value: new THREE.Vector2(240, 150) };
  const patched = new Set();

  function ps1(material) {
    if (!material || patched.has(material)) return material;
    patched.add(material);
    if (!(material.isMeshLambertMaterial || material.isMeshStandardMaterial ||
          material.isMeshPhongMaterial || material.isMeshBasicMaterial)) return material;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSnap = snap;
      shader.vertexShader = `uniform vec2 uSnap;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (gl_Position.w > 0.0) {
          gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
        }`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          const float BY[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
          float th = (BY[q.x + q.y * 4] + 0.5) / 16.0 - 0.5;
          gl_FragColor.rgb = clamp(floor(gl_FragColor.rgb * 31.0 + th + 0.5) / 31.0, 0.0, 1.0);
        }`
      );
    };
    material.customProgramCacheKey = () => 'vesper-ps1';
    material.userData.__ps1 = true;
    return material;
  }

  // Patch everything that exists at boot. Effects created later keep their own
  // shaders, which is fine: sparks and muzzle flashes stay crisp on purpose.
  scene.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || patched.has(material)) continue;
      ps1(material);
      for (const key of ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'bumpMap', 'normalMap']) {
        const texture = material[key];
        if (!texture || !texture.isTexture) continue;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
      }
    }
  });

  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // toneMapped stays true: tone mapping is skipped while drawing to a target,
  // so it has to happen on this final full-screen pass.
  const quadMaterial = new THREE.MeshBasicMaterial({
    map: target.texture, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  function resize(width, height) {
    const rw = Math.max(160, Math.floor(width / scale));
    const rh = Math.max(100, Math.floor(height / scale));
    target.setSize(rw, rh);
    snap.value.set(rw / 2, rh / 2);
  }

  function render() {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  resize(window.innerWidth, window.innerHeight);
  return { render, resize, target, ps1 };
}
