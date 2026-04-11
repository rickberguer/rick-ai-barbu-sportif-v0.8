/**
 * pcm-processor.js — AudioWorklet processor para captura de micrófono
 * ──────────────────────────────────────────────────────────────────────
 * Corre en el AudioWorkletGlobalScope (hilo dedicado de audio, separado del
 * main thread y del JS thread). Ventajas sobre ScriptProcessorNode:
 *   • Sin glitches por bloqueo del main thread
 *   • Latencia determinística (128 samples por bloque, siempre)
 *   • Sin deprecation warnings
 *
 * Protocolo con el main thread (via MessagePort):
 *   Recibe: { cmd: 'stop' }  → deja de procesar y devuelve false
 *   Envía:  { channelData: Float32Array }  (transferido, sin copia)
 *
 * Batching: acumula BATCH_SAMPLES antes de enviar para reducir overhead
 * de postMessage. A 16 kHz: 1024 samples = 64 ms por mensaje (buen balance
 * entre latencia y overhead).
 */

const BATCH_SAMPLES = 1024; // 64 ms @ 16 kHz

class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf    = new Float32Array(BATCH_SAMPLES);
    this._offset = 0;
    this._active = true;

    this.port.onmessage = (e) => {
      if (e.data?.cmd === "stop") this._active = false;
    };
  }

  /**
   * process() es llamado por el motor de audio cada 128 samples (~8 ms @ 16 kHz).
   * Acumula en el buffer interno; cuando llega al batch envia al main thread
   * mediante transferable (sin copia de memoria).
   */
  process(inputs) {
    if (!this._active) return false;

    const input = inputs[0]?.[0]; // primer canal del primer input
    if (!input || input.length === 0) return true;

    let i = 0;
    while (i < input.length) {
      const space  = BATCH_SAMPLES - this._offset;
      const take   = Math.min(space, input.length - i);

      this._buf.set(input.subarray(i, i + take), this._offset);
      this._offset += take;
      i            += take;

      if (this._offset >= BATCH_SAMPLES) {
        // Transferir el buffer al main thread (zero-copy)
        const transfer = this._buf.buffer;
        this.port.postMessage({ channelData: this._buf }, [transfer]);
        // Crear nuevo buffer para el siguiente batch
        this._buf    = new Float32Array(BATCH_SAMPLES);
        this._offset = 0;
      }
    }

    return true; // mantener el procesador vivo
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
