/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// An on-demand appearance viewport using the same baked table as live play.
// It has no room, dice, solver, or settings mutation path. Draw only on change.
import * as THREE from 'three';
import {createTableDesign} from './table-designs.js';

export function createTablePreview(host, report) {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.setClearColor(0x141110,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-label','Preview of the selected table design');
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0','#2a2018',1.1));
  const key=new THREE.DirectionalLight('#ffeecc',2.9); key.position.set(-10,24,15);scene.add(key);
  const rim=new THREE.DirectionalLight('#8fb4ff',.7);rim.position.set(14,10,-12);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x141110}));
  floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,150);
  camera.position.set(12,36,30);camera.lookAt(0,0,0);
  let visible=false,frames=0;
  function render() {
    const box=host.getBoundingClientRect();
    if(!visible||!box.width||!box.height||document.hidden) return;
    const aspect=box.width/box.height, height=Math.max(30,36/aspect);
    camera.left=-height*aspect/2;camera.right=height*aspect/2;
    camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
    renderer.setSize(box.width,box.height,false);renderer.render(scene,camera);frames++;
  }
  const design=createTableDesign({scene,floor,changed:state=>{report(state);render();}});
  const observer=new ResizeObserver(render);observer.observe(host);
  document.addEventListener('visibilitychange',render);
  return {
    show(id) {
      visible=true;host.hidden=false;
      if(design.state.wanted===id&&design.state.status==='ready') render();
      else if(design.state.wanted!==id||design.state.status!=='loading') design.select(id);
    },
    capture(){render();return renderer.domElement.toDataURL('image/png');},
    pause() {visible=false;host.hidden=true;},
    get state(){return {...design.state,visible,frames};},
  };
}
