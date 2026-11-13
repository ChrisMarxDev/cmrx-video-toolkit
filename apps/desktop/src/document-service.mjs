// One transport adapter; document acceptance remains in the editor Workspace.
export function createDocumentService(connection) {
  return async function editor(route, body) {
    const response = await fetch(connection.url + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + connection.token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error || "Editor request failed");
      error.status = response.status;
      error.details = value;
      throw error;
    }
    return value;
  };
}
