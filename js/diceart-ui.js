/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {dieArtURL, cachedDieArt, dieArtKey, dieArtInfo, releaseDieArtRenderer} from './diceart.js';
import {DIE_DEFS, DIE_TYPES} from './dice.js';
import {SETS} from './themes.js';
import {portraitSignature} from './diceart-recipe.js';
import {PORTRAIT_RECIPES} from './diceart-manifest.js';

// Artwork never gates a control. Its image box and text are present before
// rendering, and only previews inside the visible scroller request a mesh.
const records = new WeakMap();
const watched = new Set();
const visible = new Set();
let observer = null, cleanup = null, scheduled = false;
const assets = new Map(), loadedAssets = new Set(), failedAssets = new Set();

function bakedURL(type, variant) {
  const v = variant === 'shroud' || SETS[variant] ? variant : 'std';
  if (!DIE_TYPES.includes(type) || PORTRAIT_RECIPES[v] !== portraitSignature(SETS[v] || v)) return null;
  return new URL(`../models/dice-art/${v}.${type}.webp`, import.meta.url).href;
}

// The debug surface can still ask for an edited/custom portrait explicitly.
// Runtime controls use the visibility queue below, never this eager fallback.
export function dicePortraitURL(type, variant) {
  const url = bakedURL(type, variant);
  return url && !failedAssets.has(url) ? url : dieArtURL(type, variant);
}

function loadAsset(url) {
  if (!assets.has(url)) assets.set(url, new Promise(resolve => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { loadedAssets.add(url); resolve(url); };
    img.onerror = () => { failedAssets.add(url); resolve(null); };
    img.src = url;
  }));
  return assets.get(url);
}

function requestAsset(key, url) {
  const targets = [...watched].filter(img => records.get(img)?.key === key);
  for (const img of targets) { unwatch(img); img.dataset.artState = 'loading'; }
  loadAsset(url).then(source => {
    for (const img of targets) {
      // Changing sets, editing a recipe, or rebuilding history retires this
      // request's ownership of the image, even when its network reply is late.
      if (!img.isConnected || records.get(img)?.key !== key) continue;
      if (source) show(img, source);
      else { img.dataset.artState = 'pending'; watch(img); }
    }
  });
}

function unwatch(img) {
  observer?.unobserve(img);
  watched.delete(img); visible.delete(img);
}
function show(img, url) {
  unwatch(img);
  if (url) img.src = url;
  else img.removeAttribute('src');
  img.dataset.artState = url ? 'ready' : 'unavailable';
}
function schedule() {
  if (scheduled || !visible.size || document.hidden) return;
  scheduled = true;
  requestAnimationFrame(() => setTimeout(() => {
    scheduled = false;
    while (visible.size && !document.hidden) {
      const img = visible.values().next().value;
      visible.delete(img);
      const rec = records.get(img);
      if (rec && img.isConnected && img.getClientRects().length) {
        const asset = bakedURL(rec.type, rec.variant);
        if (asset && !failedAssets.has(asset)) { requestAsset(rec.key, asset); continue; }
        const needsRender = cachedDieArt(rec.type, rec.variant) === undefined;
        const url = dieArtURL(rec.type, rec.variant);
        for (const target of watched) {
          if (records.get(target)?.key === rec.key) show(target, url);
        }
        if (needsRender) break; // only one custom portrait per frame
      }
    }
    if (!visible.size || document.hidden) releaseDieArtRenderer();
    else schedule();
  }, 0));
}
function watch(img) {
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const {target, isIntersecting, intersectionRatio} of entries) {
        if (!target.isConnected) unwatch(target);
        else if (isIntersecting && intersectionRatio > 0) visible.add(target);
        else visible.delete(target);
      }
      schedule();
    });
    // Hidden pools and history are rebuilt too. IntersectionObserver alone
    // need not report a hidden node's removal, so release those references.
    cleanup = new MutationObserver(mutations => {
      if (!watched.size) return;
      for (const {removedNodes} of mutations) for (const node of removedNodes) {
        if (node.isConnected || node.nodeType !== 1) continue;
        if (watched.has(node)) unwatch(node);
        for (const img of node.querySelectorAll('img[data-art-key]')) unwatch(img);
      }
    });
    cleanup.observe(document.body, {childList:true, subtree:true});
    document.addEventListener('visibilitychange', schedule);
  }
  watched.add(img); observer.observe(img);
}

export function bindDieArt(img, type, variant) {
  const key = dieArtKey(type, variant);
  if (records.get(img)?.key === key) return;
  unwatch(img);
  records.set(img, {type, variant, key});
  img.dataset.artKey = key;
  img.style.setProperty('--art-color', DIE_DEFS[type]?.color || '#888');
  const asset = bakedURL(type, variant);
  if (asset && loadedAssets.has(asset)) { show(img, asset); return; }
  const cached = cachedDieArt(type, variant);
  if (cached !== undefined) { show(img, cached); return; }
  // Remove the old skin immediately on a set change; a pending portrait must
  // not claim the next roll still wears the previous set.
  img.removeAttribute('src'); img.dataset.artState = 'pending';
  watch(img);
}

export function dieArtImage(type, variant) {
  const img = document.createElement('img');
  img.className = 'die-art'; img.alt = ''; img.draggable = false;
  img.decoding = 'async'; img.dataset.artType = type;
  bindDieArt(img, type, variant);
  return img;
}

export function diceArtworkInfo() {
  return {...dieArtInfo(), assets:loadedAssets.size, assetRequests:assets.size,
    watched:watched.size, queued:visible.size, scheduled};
}
