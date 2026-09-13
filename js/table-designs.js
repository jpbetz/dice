/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Portalless table scenery. These models never contribute collision bodies.
// The URL changes with baked content; a room carries only the design ID.
export const TABLE_DESIGNS = Object.freeze({
  copper: Object.freeze({id:'copper', label:'The Copper Lantern', register:'grounded',
    surfaceCloth:'oak',
    title:'Worn oak, brass joinery and a quiet shared rolling surface',
    model:'models/tables/copper-lantern-table.glb?v=9bd081132494e6cd'}),
});

export function createTableDesign({scene, floor, changed = () => {}}) {
  const cache = new Map();
  let epoch = 0, wanted = null, active = null, activeId = null, status = 'idle', error = null;
  const notify = () => changed({wanted,status,error,activeId,visible:!!active,cached:cache.size});
  const originalY = floor.position.y;
  const remove = () => {
    if (active) scene.remove(active);
    active = null; activeId = null; floor.position.y = originalY;
  };
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
      floor.position.y=-1.12; status='ready'; notify(); return true;
    } catch {
      if (token !== epoch) return false;
      remove(); status='failed'; error='Table artwork could not load. The rolling surface is still available.';
      notify(); return false;
    }
  }
  return {select, get state(){return {wanted,status,error,activeId,visible:!!active,cached:cache.size};}};
}
