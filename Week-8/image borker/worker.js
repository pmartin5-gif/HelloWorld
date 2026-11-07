importScripts('engine.js');
self.onmessage = async ({ data }) => {
  const { id, operation, width, height, settings, pixels } = data;
  try {
    const progress = (value, message) => self.postMessage({ id, progress: value, message });
    const result = operation === 'generate'
      ? await InkEngine.generate(width, height, settings, progress)
      : await InkEngine.distort(new Uint8ClampedArray(pixels), width, height, settings, progress);
    self.postMessage({ id, result: result.buffer }, [result.buffer]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
