export function validateDefinitions(project) {
  const ids = new Set();
  for (const d of project.components ?? []) {
    if (
      !d ||
      typeof d.id !== "string" ||
      !/^[\w-]{1,120}$/.test(d.id) ||
      ids.has(d.id) ||
      d.schemaVersion !== 1 ||
      typeof d.source !== "string" ||
      !/^lib\/[\w/.-]+\.dart$/.test(d.source) ||
      d.source.split("/").some((p) => p === ".." || p.startsWith("."))
    )
      throw Error("Invalid dynamic component definition");
    ids.add(d.id);
    if (
      !d.properties ||
      typeof d.properties !== "object" ||
      Array.isArray(d.properties)
    )
      throw Error("Component properties must be a schema map");
    for (const [name, s] of Object.entries(d.properties)) {
      if (
        ["__proto__", "constructor", "prototype", "source"].includes(name) ||
        !/^[\w-]{1,80}$/.test(name) ||
        !s ||
        !["string", "number", "boolean", "color", "enum"].includes(s.type)
      )
        throw Error("Unsupported component property schema");
      if (
        s.type === "enum" &&
        (!Array.isArray(s.options) ||
          !s.options.length ||
          s.options.some((x) => typeof x !== "string"))
      )
        throw Error("Enum options required");
      if (
        (s.min !== undefined && !Number.isFinite(s.min)) ||
        (s.max !== undefined && !Number.isFinite(s.max)) ||
        (s.min !== undefined && s.max !== undefined && s.min > s.max)
      )
        throw Error("Invalid component bounds");
    }
    validateProperties(d, d.defaults ?? {});
  }
  for (const c of project.clips ?? []) {
    if (!c.componentId) continue;
    const d = (project.components ?? []).find((d) => d.id === c.componentId);
    if (!d) throw Error("Component definition not found");
    validateProperties(d, c.props ?? {});
  }
  return project;
}
export function validateProperties(definition, props) {
  for (const [name, value] of Object.entries(props)) {
    if (name === "source") {
      if (value !== definition.source)
        throw Error("Instance source conflicts with component definition");
      continue;
    }
    const s =
      Object.hasOwn(definition.properties, name) && definition.properties[name];
    if (!s) throw Error(`Unknown component property: ${name}`);
    if (
      s.type === "number" &&
      (!Number.isFinite(value) ||
        (s.min !== undefined && value < s.min) ||
        (s.max !== undefined && value > s.max))
    )
      throw Error(`Invalid number: ${name}`);
    if (s.type === "boolean" && typeof value !== "boolean")
      throw Error(`Invalid boolean: ${name}`);
    if (
      s.type === "string" &&
      (typeof value !== "string" || value.length > (s.maxLength ?? 10000))
    )
      throw Error(`Invalid text: ${name}`);
    if (
      s.type === "color" &&
      (typeof value !== "string" || !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(value))
    )
      throw Error(`Invalid color: ${name}`);
    if (s.type === "enum" && !s.options.includes(value))
      throw Error(`Invalid choice: ${name}`);
  }
  return props;
}
