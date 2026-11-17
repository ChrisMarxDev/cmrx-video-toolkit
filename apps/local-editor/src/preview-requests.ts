// Leave connections available for media ranges, event streams and user actions.
// A timeline can otherwise queue one slow thumbnail request per cut at once.
type Entry = {
  refs: number;
  started: boolean;
  complete: boolean;
  controller: AbortController;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};
const entries = new Map<string, Entry>();
const queue: { key: string; url: string; entry: Entry }[] = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    if (!job.entry.refs) continue;
    running++;
    job.entry.started = true;
    void fetch(job.url, { signal: job.entry.controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Preview unavailable");
        const data = await response.json();
        job.entry.complete = true;
        job.entry.resolve(data);
      })
      .catch((error) => {
        if (entries.get(job.key) === job.entry) entries.delete(job.key);
        job.entry.reject(error);
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}
export function acquirePreview<T>(key: string, url: string) {
  let entry = entries.get(key);
  if (!entry) {
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const promise = new Promise<unknown>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    entry = {
      refs: 0,
      started: false,
      complete: false,
      controller: new AbortController(),
      promise,
      resolve,
      reject,
    };
    entries.set(key, entry);
    queue.push({ key, url, entry });
  }
  const current = entry;
  current.refs++;
  pump();
  let released = false;
  return {
    promise: current.promise as Promise<T>,
    release() {
      if (released) return;
      released = true;
      current.refs--;
      if (!current.refs && !current.complete) {
        if (entries.get(key) === current) entries.delete(key);
        current.controller.abort();
        const index = queue.findIndex((job) => job.entry === current);
        if (index >= 0) queue.splice(index, 1);
        current.reject(
          new DOMException("Preview no longer visible", "AbortError"),
        );
      }
      if (entries.size > 256)
        for (const [key, entry] of entries) {
          if (entries.size <= 256) break;
          if (!entry.refs && entry.complete) entries.delete(key);
        }
    },
  };
}
