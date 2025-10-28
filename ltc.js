// src/ltc.js
export function generateLTC({ sr, length, fps = 30, dropFrame = false }) {
    const BITRATE = fps * 80;
    const SAMPLES_PER_BIT = sr / BITRATE;
    const totalBits = Math.floor(length / SAMPLES_PER_BIT);
  
    const buf = new AudioBuffer({ length, sampleRate: sr, numberOfChannels: 1 });
    const ch = buf.getChannelData(0);
  
    let phase = 1;
    for (let i = 0; i < totalBits; i++) {
      const start = Math.floor(i * SAMPLES_PER_BIT);
      const mid = Math.floor((i + 0.5) * SAMPLES_PER_BIT);
      const end = Math.floor((i + 1) * SAMPLES_PER_BIT);
      phase *= -1; // boundary transition
  
      // “1” teria transição extra no meio; aqui simplificado com padrão alternado
      for (let j = start; j < end && j < length; j++) {
        const v = (i % 2) ? (j < mid ? -phase : phase) : phase;
        ch[j] = v;
      }
    }
    return buf;
  }
  