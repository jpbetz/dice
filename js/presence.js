/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// A fixed-person, explicitly enabled heartbeat. No registration, navigation,
// room publication or consent persistence occurs here. The owning account UI
// closes this instance before adopting another person's namespace.
export function createPresenceHeartbeat({ account, personId, onStatus = () => {},
  document = globalThis.document, setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout, intervalMs = 30000 } = {}) {
  if (!account || typeof account.setPresence !== 'function' || !personId
      || !Number.isFinite(intervalMs) || intervalMs < 30000) throw new Error('Invalid presence controller.');
  let desired = null, closed = false, epoch = 0, timer = null;
  const visible = () => !document || document.visibilityState === 'visible';
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const report = value => { try { onStatus(value); } catch { /* UI observation cannot change account authority */ } };
  async function send(input, generation) {
    let result;
    try { result = await account.setPresence(personId, input); }
    catch { result = { ok: false, code: 'account_unavailable', message: 'Presence is unavailable.' }; }
    if (closed || epoch !== generation) return result;
    report(result.ok ? { state: input.online ? 'sharing' : 'off', expiresAt: result.expiresAt || null }
      : { state: 'unknown', code: result.code, message: result.message });
    if (['identity_changed', 'login_required', 'request_superseded'].includes(result.code)) desired = null;
    if (desired && visible()) timer = setTimer(() => { timer = null; void send(desired, epoch); }, intervalMs);
    return result;
  }
  function visibilityChanged() {
    if (closed || !desired) return;
    clear();
    const generation = ++epoch;
    void send(visible() ? desired : { online: false }, generation);
  }
  document?.addEventListener('visibilitychange', visibilityChanged);
  return Object.freeze({
    setSharing(input) {
      if (closed) return Promise.resolve({ ok: false, code: 'presence_closed' });
      clear();
      const generation = ++epoch;
      desired = input?.online === true ? { ...input } : null;
      return send(desired && visible() ? desired : { online: false }, generation);
    },
    async close({ withdraw = true } = {}) {
      if (closed) return { ok: true };
      const wasSharing = !!desired;
      desired = null; closed = true; epoch++; clear();
      document?.removeEventListener('visibilitychange', visibilityChanged);
      // All transport calls share the account's cookie queue. This withdrawal
      // follows an in-flight enable, so its late response cannot re-enable a
      // closed instance. A revoked session is already invisible to readers.
      // Inside onIdentityChange use withdraw:false: that callback is already
      // inside the cookie queue. Successful sign-in atomically withdraws the
      // previous session marker; logout/rotation invalidate its session.
      return wasSharing && withdraw ? account.setPresence(personId, { online: false }) : { ok: true };
    },
  });
}
