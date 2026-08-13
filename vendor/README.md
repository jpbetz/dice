# Vendored third-party libraries

These libraries are vendored as single-file ES modules so the app runs with no
build step and no network access. They are covered by their own licenses, not
this repository's Apache 2.0 license.

| File | Project | Version | License | Upstream |
|------|---------|---------|---------|----------|
| `three.module.js` | three.js | r160 (0.160.1) | MIT | https://github.com/mrdoob/three |
| `cannon-es.js` | cannon-es | 0.20.0 | MIT | https://github.com/pmndrs/cannon-es |
| `GLTFLoader.js` | three.js `examples/jsm/loaders` | r160 | MIT | https://github.com/mrdoob/three |
| `BufferGeometryUtils.js` | three.js `examples/jsm/utils` | r160 | MIT | https://github.com/mrdoob/three |

## The two loader files (2026-08-13)

`GLTFLoader.js` is how the app reads a baked tower model (`tools/forge`
exports GLB; `js/towerglb.js` parses it). It pulls in `BufferGeometryUtils.js`
for one function, `toTrianglesDrawMode`.

**One edit from upstream, in `GLTFLoader.js` only:** the utils import is
rewritten to `./BufferGeometryUtils.js` (upstream says
`../utils/BufferGeometryUtils.js`) so the pair sits flat here instead of
dragging the examples directory tree in behind it. Everything else in both
files is byte-for-byte upstream, including the bare `three` specifier, which
resolves through index.html's importmap like every other import in the app.

**They are duplicated in `tools/forge/preview/`**, and deliberately: the
preview viewer is served by its own python server (`tools/forge/preview/serve.py`)
rooted in that directory and cannot reach `vendor/`. Same upstream revision,
same one edit. Update both or neither.

Note that `vendor/` is the one directory `server.js` serves as immutable
(`public, max-age=31536000, immutable` — see `isVendor`), so a file changed
here without a rename will not reach a browser that already cached it.
