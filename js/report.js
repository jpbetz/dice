/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// CLIENT CRASH REPORTING (Joe 2026-08-09: "no telemetry here has me worried
// about maintaining this").
//
// A CLASSIC SCRIPT, loaded before the module graph, on purpose. The handlers
// have to be installed before anything they might catch — and the most
// valuable failure to catch is `js/main.js` failing to PARSE or one of its
// imports 404ing, at which point nothing inside main.js runs and a listener
// registered there would never exist. A `<script>` in the head with no `type`
// is the only thing that is running at that moment.
//
// WHAT IT SENDS, and what it deliberately does not. Errors carry a message, a
// trimmed stack, a source position, the user agent and a viewport — enough to
// find a bug. They carry NO user text: no player names, no pool names, no
// notation, no roll values, and NOT the room key, which is an unguessable
// door and the table's only access control (GOALS §7, goal 10). The `sid` is
// a per-tab random, so two reports can be told to be the same session and
// nothing else.
//
// It is also, itself, the code most obliged not to throw: every path is
// wrapped, a failed send is swallowed, and nothing here can block a boot.
(function () {
  'use strict';

  // TWO BOUNDS, AND NOT A THIRD. Dedupe handles the same error repeating —
  // which is the flood that actually happens, a handler throwing every frame
  // — and the session cap handles everything else. A minimum GAP between
  // sends was tried and removed: it dropped the second of two DIFFERENT
  // errors arriving together, and a cascade is exactly the shape you want to
  // see whole. Twelve distinct failures in one session is information; the
  // thirteenth is not.
  var MAX_PER_SESSION = 12;
  var STACK_CHARS = 900;

  var sent = 0;
  var seen = Object.create(null); // dedupe key -> count
  var sid = 'x';
  try {
    sid = Math.random().toString(36).slice(2, 10);
  } catch (e) { /* nothing can throw here and still be worth it */ }

  function apiUrl(path) {
    // Same origin, same shape js/net.js uses. Deliberately not importing it:
    // this file runs before modules and must have no dependencies at all.
    return path;
  }

  function post(body) {
    try {
      var json = JSON.stringify(body);
      // sendBeacon survives a page that is being torn down by the very error
      // being reported, which is the case that matters most. It is also
      // CORS-safelisted as text/plain, so it never needs a preflight a dying
      // page could not complete — the same reasoning js/net.js's leave beacon
      // records. fetch is the fallback for browsers that refuse the beacon.
      if (navigator.sendBeacon && navigator.sendBeacon(apiUrl('/api/clienterror'), json)) return;
      fetch(apiUrl('/api/clienterror'), {
        method: 'POST', body: json, keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
      }).catch(function () {});
    } catch (e) { /* reporting must never be the thing that breaks */ }
  }

  function report(kind, detail) {
    try {
      var now = Date.now();
      if (sent >= MAX_PER_SESSION) return;
      var key = kind + '|' + (detail.message || '') + '|' + (detail.line || 0);
      seen[key] = (seen[key] || 0) + 1;
      // A repeat is counted, not re-sent: the same error 400 times is one
      // fact about the build and 400 requests about nothing.
      if (seen[key] > 1) return;
      sent += 1;
      post({
        kind: kind,
        sid: sid,
        message: String(detail.message || '').slice(0, 300),
        stack: String(detail.stack || '').slice(0, STACK_CHARS),
        source: String(detail.source || '').slice(0, 200),
        line: detail.line || 0,
        col: detail.col || 0,
        ua: String(navigator.userAgent || '').slice(0, 200),
        view: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
        up: Math.round((now - START) / 1000), // seconds since this tab booted
      });
    } catch (e) { /* see above */ }
  }

  var START = Date.now();

  window.addEventListener('error', function (e) {
    try {
      // Two different events share this name. A RESOURCE failure (a 404 on a
      // module, a missing texture) has no `error` object and a target that is
      // an element — and it is the one that explains a blank page, so it is
      // worth more than the exception case, not less.
      if (e && e.target && e.target !== window && (e.target.src || e.target.href)) {
        report('resource', {
          message: 'failed to load ' + (e.target.tagName || '?'),
          source: e.target.src || e.target.href || '',
        });
        return;
      }
      report('error', {
        message: (e && e.message) || 'unknown error',
        stack: (e && e.error && e.error.stack) || '',
        source: (e && e.filename) || '',
        line: (e && e.lineno) || 0,
        col: (e && e.colno) || 0,
      });
    } catch (err) { /* … */ }
  }, true); // capture: resource errors do not bubble

  window.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e && e.reason;
      report('rejection', {
        message: (r && (r.message || String(r))) || 'unhandled rejection',
        stack: (r && r.stack) || '',
      });
    } catch (err) { /* … */ }
  });

  // The one door the app itself uses, for a failure it CAUGHT but that still
  // means something is wrong (a refused save, a boot guard tripping). Kept on
  // window rather than exported, because the module graph may not exist.
  window.__diceReport = function (message, detail) {
    report('app', {
      message: message,
      stack: (detail && detail.stack) || '',
      source: (detail && detail.source) || '',
    });
  };

  // Test observability, and a way to see it worked without a server round
  // trip. Never carries anything the report itself would not carry.
  window.__diceReportState = function () {
    return { sid: sid, sent: sent, kinds: Object.keys(seen).length };
  };
})();
