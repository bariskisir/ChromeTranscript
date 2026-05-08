/** Web Audio capture stream utilities. */

export interface PcmStreamOptions {
  stream: MediaStream;
  workletUrl: string;
  /** Receives each encoded PCM audio chunk from the worklet. */
  onAudioChunk(chunk: ArrayBuffer): void;
  passthroughAudio?: boolean;
  onTrackEnded?: () => void;
}

/** Owns the capture stream, audio graph, and PCM worklet lifecycle. */
export class PcmStream {
  private stopped = false;

  /** Stores the active Web Audio nodes and source stream for later cleanup. */
  private constructor(
    private readonly stream: MediaStream,
    private readonly audioContext: AudioContext,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly processor: AudioWorkletNode,
    private readonly sink: GainNode
  ) {}

  /** Creates an audio graph that converts a MediaStream into 16 kHz PCM chunks. */
  static async start(options: PcmStreamOptions): Promise<PcmStream> {
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: AudioWorkletNode | null = null;
    let sink: GainNode | null = null;

    try {
      audioContext = new AudioContext({ sampleRate: 16000 });
      await audioContext.resume();
      await audioContext.audioWorklet.addModule(options.workletUrl);

      source = audioContext.createMediaStreamSource(options.stream);
      processor = new AudioWorkletNode(audioContext, 'pcm-worklet-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1
      });
      sink = audioContext.createGain();
      sink.gain.value = 0;
      processor.port.onmessage = (event) => options.onAudioChunk(event.data as ArrayBuffer);

      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);
      if (options.passthroughAudio) {
        source.connect(audioContext.destination);
      }
      if (options.onTrackEnded) {
        options.stream.getAudioTracks().forEach((track) => {
          track.onended = options.onTrackEnded || null;
        });
      }

      return new PcmStream(options.stream, audioContext, source, processor, sink);
    } catch (error) {
      processor?.disconnect();
      sink?.disconnect();
      source?.disconnect();
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
      options.stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  /** Tears down the worklet, audio graph, audio context, and source tracks. */
  stop(): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.processor.port.onmessage = null;
    this.processor.disconnect();
    this.sink.disconnect();
    this.source.disconnect();
    void this.audioContext.close().catch(() => undefined);
    this.stream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }
}
