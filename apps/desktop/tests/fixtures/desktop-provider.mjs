export default ({ onEvent, onTool }) => {
  let generation = 0;
  return {
    async start() {},
    async account() {
      return { connected: true };
    },
    async models() {
      return [{ id: "test", name: "Test model", isDefault: true, efforts: [] }];
    },
    async login() {
      return {};
    },
    async logout() {},
    close() {
      generation++;
    },
    async stop() {
      generation++;
      onEvent({ type: "complete" });
    },
    async prompt(text) {
      const turn = ++generation;
      onEvent({ type: "activity", text: "Working in this project" });
      await new Promise((r) => setTimeout(r, 2000));
      if (turn !== generation) return;
      await onTool("workspace_write", {
        path: "script.md",
        content: "Project script: " + text,
      });
      onEvent({
        type: "delta",
        text: "Saved this project script.",
        itemId: "result",
      });
      onEvent({ type: "complete" });
    },
  };
};
