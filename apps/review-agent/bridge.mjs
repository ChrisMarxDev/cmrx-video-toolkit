/** Shared completion contract. The editor supplies its own flush and controls. */
export function createReviewBridge({ request, flush, getIdentity, notify = async () => {} }) {
  let completing;
  return {
    status: () => request('session'),
    done() {
      if (completing) return completing;
      completing = (async () => {
        // Flush must reject on a conflict or failed save. Never finish from a timer
        // or from a stale server snapshot while the UI still has unsaved edits.
        await flush();
        const identity = getIdentity();
        const result = await request('finish', identity);
        if (result.status !== 'completed') throw Error('The review was not completed.');
        try {
          await notify(result);
          return { ...result, continuation: 'requested' };
        } catch (error) {
          // A failed host notification must not pretend the durable save failed.
          return { ...result, continuation: 'unavailable', continuationError: error.message };
        }
      })().finally(() => { completing = undefined; });
      return completing;
    },
    cancel: () => request('abandon', { sessionId: getIdentity().sessionId }),
  };
}

export function browserRequest({ origin = '', token, fetchImpl = globalThis.fetch }) {
  return async (operation, body) => {
    const response = await fetchImpl(`${origin}/api/${operation}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Review-Token': token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || `Review request failed (${response.status})`);
    return result;
  };
}

/** Supply the host SDK's callServerTool and sendMessage methods. */
export function embeddedRequest({ sessionId, callServerTool }) {
  return async (operation, body) => {
    const result = await callServerTool({ name: 'review_session_request', arguments: { sessionId, operation, body } });
    if (result.isError) throw Error(result.content?.find(item => item.type === 'text')?.text || 'Review request failed');
    return result.structuredContent;
  };
}

export function continuationMessage(result) {
  return `Video review ${result.sessionId} is complete. Call get_review with this sessionId, read the saved review, and continue the agreed workflow. Do not assume rendering was requested.`;
}
