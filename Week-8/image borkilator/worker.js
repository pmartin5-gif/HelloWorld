importScripts('engine.js');
self.onmessage = async ({ data }) => {
  const { id, width, height, settings, pixels } = data;
  try {
    if (data.operation !== 'distort') throw new Error('Unsupported rendering operation.');
    const progress = (value, message) => self.postMessage({ id, progress: value, message });
    const result = await InkEngine.distortRGBA(new Uint8ClampedArray(pixels), width, height, settings, progress);
    self.postMessage({ id, result: result.buffer }, [result.buffer]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
