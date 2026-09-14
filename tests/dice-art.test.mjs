/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseYaml} from '../js/yaml.js';
import {createTune} from '../js/tune.js';
import {installCatalogue, SETS} from '../js/themes.js';
import {portraitSignature} from '../js/diceart-recipe.js';
import {PORTRAIT_RECIPES, PORTRAIT_RENDERER, PORTRAIT_SOURCES} from '../js/diceart-manifest.js';

const read = path => readFileSync(new URL('../'+path,import.meta.url));
const source=read('dice.yaml').toString(), {tree}=parseYaml(source);
const tune=createTune({declared:tree,source});installCatalogue(tune.rowsOf('houses'));
assert.deepEqual(Object.keys(PORTRAIT_RECIPES),['std','shroud',...Object.keys(SETS)]);
for(const [id,signature] of Object.entries(PORTRAIT_RECIPES)) {
  assert.equal(signature,portraitSignature(SETS[id]||id),`${id}: regenerate portraits after recipe changes`);
  for(const type of ['d4','d6','d8','d10','d10x','d12','d20']) {
    const bytes=read(`models/dice-art/${id}.${type}.webp`);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');
    assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.ok(bytes.length>100 && bytes.length<30000,'a real, bounded thumbnail');
  }
}
const digest=createHash('sha256');for(const path of PORTRAIT_SOURCES)digest.update(read(path));
assert.equal(digest.digest('hex'),PORTRAIT_RENDERER,'regenerate portraits when the renderer changes');
assert.equal(portraitSignature({b:2,a:{d:4,c:3}}),portraitSignature({a:{c:3,d:4},b:2}));
assert.notEqual(portraitSignature({body:'#000'}),portraitSignature({body:'#fff'}));
console.log('dice-art: catalogue, renderer, 175 WebP assets and recipe invalidation pass');
