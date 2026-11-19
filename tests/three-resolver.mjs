// Resolve hook for the headless mission tests: the game imports the bare
// specifier 'three', which browsers map through an import map. Node gets the
// same vendored build through this resolver, so the tests need no packages.
const three = new URL('../game/vendor/three.module.min.js', import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: three, shortCircuit: true };
  return nextResolve(specifier, context);
}