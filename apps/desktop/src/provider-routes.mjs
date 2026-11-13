// Provider HTTP orchestration; ProviderManager owns provider state.
export const providerPaths = new Set([
  "/chat/model",
  "/chat/refresh-provider",
  "/chat/login",
  "/chat/logout",
  "/chat/cancel-login",
]);
export async function providerAction(
  { manager, state, publish, openExternal },
  pathname,
  body,
) {
  let result = { ok: true };
  if (pathname === "/chat/model") {
    if (state.busy || state.switching || state.queue.length)
      throw Error("Finish or remove queued messages before changing models");
    state.switching = true;
    publish();
    try {
      await manager.select(body);
      state.error = null;
    } finally {
      state.switching = false;
      publish();
    }
    result = manager.snapshot();
  } else if (pathname === "/chat/refresh-provider") {
    const id = body.provider;
    if (!manager.entries.has(id)) throw Error("Unknown provider");
    if (state.busy) throw Error("Wait for the current turn to finish");
    if (!manager.enabled.has(id)) throw Error("Choose Connect first");
    await manager.refresh(id);
    result = manager.snapshot();
  } else if (pathname === "/chat/login") {
    const id = body.provider || manager.id;
    if (state.busy) throw Error("Wait for the current turn to finish");
    const login = await manager.login(id, { method: body.method });
    state.error = null;
    publish();
    if (login.authUrl) openExternal(login.authUrl);
    result = { ...manager.snapshot(), url: login.authUrl };
  } else if (pathname === "/chat/logout") {
    if (state.busy) throw Error("Wait for the current turn to finish");
    await manager.logout(body.provider || manager.id);
    result = manager.snapshot();
  } else if (pathname === "/chat/cancel-login") {
    const id = body.provider;
    if (!manager.entries.has(id)) throw Error("Unknown provider");
    await manager.cancelLogin(id);
    publish();
  }
  return result;
}
