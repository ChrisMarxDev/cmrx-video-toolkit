export default ({ onTool, onEvent }) => ({
  async start() {},
  async account() {
    return { connected: true };
  },
  async login() {
    return {};
  },
  async models() {
    return [{ id: "test", name: "Test", isDefault: true }];
  },
  close() {},
  async prompt(text) {
    try {
      const plan = JSON.parse(text);
      const context = await onTool("editor_context", {});
      const result = await onTool("workspace_projects", {
        action: "create",
        revision: context.project.revision,
        requestId: plan.requestId,
        projects: plan.projects,
      });
      await onTool("workspace_projects", {
        action: "open",
        name: plan.projects[0].name,
      });
      onEvent({
        type: "delta",
        text: JSON.stringify(result),
        itemId: "result",
      });
      onEvent({ type: "complete" });
    } catch (e) {
      onEvent({ type: "error", message: e.message });
    }
  },
});
