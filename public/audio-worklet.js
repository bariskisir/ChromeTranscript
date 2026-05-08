/** AudioWorklet processor that converts mono float input into transferable PCM frames. */
/** Encodes browser audio render quanta into 16-bit PCM buffers. */
class PcmWorkletProcessor extends AudioWorkletProcessor {
  /**
   * Converts each render quantum into 16-bit little-endian PCM and keeps the worklet alive.
   *
   * @param {Float32Array[][]} inputs
   * @returns {boolean}
   */
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) {
      return true;
    }

    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] || 0));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    this.port.postMessage(buffer, [buffer]);
    return true;
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor);
