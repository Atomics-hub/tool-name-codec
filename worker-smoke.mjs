const worker = new Worker(
  new URL("./worker-smoke-worker.mjs", import.meta.url),
  { type: "module" },
);

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("worker smoke timed out")),
    5_000,
  );
  worker.onmessage = ({ data }) => {
    clearTimeout(timeout);
    resolve(data);
  };
  worker.onerror = (event) => reject(event.error ?? new Error(event.message));
  worker.postMessage("run");
});

worker.terminate();
const passed =
  result.unique &&
  result.valid &&
  result.reversible &&
  result.serializable &&
  result.statelessStable &&
  result.manifestDeepFrozen;
console.log(JSON.stringify({ passed, ...result }));
if (!passed) Deno.exit(1);
