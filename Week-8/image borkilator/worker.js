/*
 * BORKILATOR | THE BACKGROUND MESSENGER
 *
 * INTRODUCTION
 * A Web Worker runs JavaScript outside the page’s main UI thread. It has no document
 * or visible Canvas here. This file is deliberately small: it translates messages into
 * an engine call and sends the answer back. app.js owns job promises, user-visible
 * progress, history, and fallback. A file:// launch skips the worker and uses the same
 * engine locally.
 *
 * READING THIS FILE
 * Search for "CHAPTER " followed by an ID to land on its heading, rather than its
 * table-of-contents entry. IDs stay useful when added comments change line numbers.
 * These are explanatory comments: the executable code still runs.
 *
 * ANNOTATED TABLE OF CONTENTS
 * BORK-WRK-01 — Load the shared engine. Give the worker the same pixel functions as
 * the controller
 * BORK-WRK-02 — Receive a job. Read dimensions, settings, and transferred pixel bytes
 * BORK-WRK-03 — Report the outcome. Return progress, transferred results, or a
 * serializable error
 */
/*
 * CHAPTER BORK-WRK-01 | Load the shared engine
 *
 * importScripts loads the buildless engine into this worker’s global scope. The
 * engine wrapper detects self and exposes InkEngine here, just as it exposes
 * window.InkEngine in the page. Loading the code does not render an image.
 */
importScripts('engine.js');
/*
 * CHAPTER BORK-WRK-02 | Receive a job
 *
 * self refers to this worker’s global context. Each incoming event contains a data
 * object. Destructuring reads the request ID, native working dimensions, normalized
 * settings, and the ArrayBuffer transferred by app.js. The ID lets the controller
 * match replies to the correct waiting job.
 */
self.onmessage = async ({data}) => {
  const {id, width, height, settings, pixels} = data;
  try {
    /*
     * Only the distort operation is accepted. Constructing a Uint8ClampedArray over
     * the received buffer gives the engine its RGBA byte view. The engine validates
     * its length against width × height × 4. await waits for that engine call to
     * finish.
     */
    if (data.operation !== 'distort')
      throw new Error('Unsupported rendering operation.');
    /*
     * CHAPTER BORK-WRK-03 | Report the outcome
     *
     * A callback sends intermediate progress with the same job ID. The engine returns a
     * new typed array, whose backing buffer is transferred back rather than copied. That
     * result buffer becomes detached in the worker after sending; the worker has no
     * further use for it.
     */
    const progress = (value, message) => self.postMessage({
      id,
      progress: value,
      message
    });
    const result = await InkEngine.distortRGBA(new Uint8ClampedArray(pixels), width, height, settings, progress);
    self.postMessage({
      id,
      result: result.buffer
    }, [result.buffer]);
    /*
     * Errors cross the worker boundary as a message string with the job ID. The
     * controller rejects the waiting promise and unlocks the UI. This reported
     * processing error is distinct from the worker infrastructure error that triggers
     * the main-thread fallback.
     */
  } catch (error) {
    self.postMessage({
      id,
      error: error.message
    });
  }
};
