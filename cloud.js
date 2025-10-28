// src/cloud.js
export async function getNoiseBaseURL() {
    const r = await fetch('/api/noise');
    if (!r.ok) throw new Error('Noise API error');
    const { url } = await r.json();
    return url; // signed/public URL
  }
  
  export async function fetchAudioBuffer(url, audioCtx) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    // para OfflineAudioContext também funciona: decodeAudioData existe
    return await (audioCtx || new AudioContext()).decodeAudioData(arr);
  }
  