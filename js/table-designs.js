/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Portalless table scenery. These models never contribute collision bodies.
// The URL changes with baked content; a room carries only the design ID.
export const TABLE_DESIGNS = Object.freeze({
  copper: Object.freeze({id:'copper', label:'The Copper Lantern', register:'grounded',
    surfaceCloth:'oak', floorY:-1.12,
    title:'Worn oak, brass joinery and a quiet shared rolling surface',
    model:'models/tables/copper-lantern-table.glb?v=9bd081132494e6cd'}),
  navigation: Object.freeze({id:'navigation',label:'The Navigation Table',register:'grounded',
    surfaceCloth:'image',floorY:-1.17,title:'An illustrated chart in a shipwright’s frame',
    model:'models/tables/navigation-table.glb?v=ca57971442dd2bb2'}),
  stone: Object.freeze({id:'stone',label:'The Stone Circle',register:'grounded',
    surfaceCloth:'image',floorY:-1.42,title:'Radial carved slabs, quiet weathered stone and small cairns',
    model:'models/tables/stone-circle-table.glb?v=d4dc9728fddc9d19'}),
});

export function createTableDesign({scene, floor, width = 27.5, changed = () => {}}) {
  const cache = new Map();
  let scale = width / 27.5;
  let epoch = 0, wanted = null, active = null, activeId = null, status = 'idle', error = null;
  const snapshot = () => ({wanted,status,error,activeId,visible:!!active,cached:cache.size,scale:active?.scale.x??null});
  const notify = () => changed(snapshot());
  const originalY = floor.position.y;
  const remove = () => {
    if (active) scene.remove(active);
    active = null; activeId = null; floor.position.y = originalY;
  };
  function sizeModel() {
    if (!active) return;
    active.scale.setScalar(scale);
    floor.position.y = TABLE_DESIGNS[activeId].floorY * scale;
  }
  function resize(width) {
    const next = width / 27.5;
    if (!Number.isFinite(next) || next <= 0 || next === scale) return;
    scale = next; sizeModel();
    if (active) notify();
  }
  async function select(id) {
    const token = ++epoch; wanted = id; error = null;
    if (!TABLE_DESIGNS[id]) { remove(); status='idle'; notify(); return true; }
    status='loading'; notify();
    try {
      if (!cache.has(id)) {
        const pending = import('../vendor/GLTFLoader.js').then(async ({GLTFLoader}) => {
          const result = await new GLTFLoader().loadAsync(TABLE_DESIGNS[id].model);
          result.scene.traverse(ob => {
            if (!ob.isMesh) return;
            ob.castShadow = true; ob.receiveShadow = true;
            for (const mat of Array.isArray(ob.material) ? ob.material : [ob.material]) mat.envMapIntensity=.25;
          });
          return result.scene;
        });
        cache.set(id,pending);
        pending.catch(() => {if (cache.get(id)===pending) cache.delete(id);});
      }
      const model = await cache.get(id);
      if (token !== epoch) return false;
      remove(); active = model; activeId = id; scene.add(active);
      // The authored top meets the existing y=0 physics plane. The old broad
      // cloth becomes the room floor below the solid table, not a second top.
      sizeModel(); status='ready'; notify(); return true;
    } catch {
      if (token !== epoch) return false;
      remove(); status='failed'; error='Table artwork could not load. The rolling surface is still available.';
      notify(); return false;
    }
  }
  return {select, resize, get object(){return active;}, get state(){return snapshot();}};
}
