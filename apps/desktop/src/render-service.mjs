// Reserve the existing runtime while HTTP export waits for document writes.
// The render queue/engines retain ownership of execution and cancellation.
export async function startManualRender({
  runtime,
  reserve,
  publish,
  activeWrites,
  editor,
  playground,
}) {
  const capability = runtime().capabilities.export;
  if (!capability.allowed) {
    const error = new Error("An edit or render is still running");
    error.details = { code: "render_unavailable", reason: capability.reason };
    throw error;
  }
  reserve(true);
  publish();
  try {
    while (activeWrites())
      await new Promise((resolve) => setTimeout(resolve, 10));
    return await playground.render(
      (await editor("/api/context")).project.revision,
    );
  } finally {
    reserve(false);
    publish();
  }
}
