// Procedural golden-hour sky: a single inward-facing sphere with a gradient and
// a soft sun glow. No HDR file and no network request.
import * as THREE from 'three';

export function createSky(sunDirection) {
  const geometry = new THREE.SphereGeometry(1400, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x143a5c) },
      midColor: { value: new THREE.Color(0x77b3c4) },
      horizonColor: { value: new THREE.Color(0xffc08a) },
      lowColor: { value: new THREE.Color(0xd88963) },
      sunColor: { value: new THREE.Color(0xffe6ae) },
      sunDir: { value: sunDirection.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor, midColor, horizonColor, lowColor, sunColor, sunDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.30, h));
        col = mix(col, topColor, smoothstep(0.22, 0.85, h));
        col = mix(lowColor, col, smoothstep(-0.18, 0.02, h));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * pow(d, 22.0) * 0.65;
        col += sunColor * pow(d, 650.0) * 1.6;
        float band = sin(h * 42.0) * 0.006 * smoothstep(0.25, 0.0, abs(h));
        gl_FragColor = vec4(col + band, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  // Expose the gradient uniforms so the day/night cycle can retint the sky
  // from golden hour to midnight without rebuilding the shader.
  sky.userData.uniforms = material.uniforms;
  sky.userData.baseSunDir = sunDirection.clone().normalize();
  return sky;
}
