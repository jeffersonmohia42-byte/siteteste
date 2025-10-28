// src/app.js
export function initApp({ generateLTC }) {
  const uploadArea   = document.getElementById('uploadArea');
  const musicFile    = document.getElementById('musicFile');
  const statusCanvas = document.getElementById('statusCanvas');
  const modeL        = document.getElementById('modeL');
  const fpsSel       = document.getElementById('fpsSel');
  const bpmRow       = document.getElementById('bpmRow');
  const fpsRow       = document.getElementById('fpsRow');
  const bpmInput     = document.getElementById('bpmInput');
  const levelL       = document.getElementById('levelL');
  const levelR       = document.getElementById('levelR');
  const btnProcess   = document.getElementById('btnProcess');
  const btnDownload  = document.getElementById('btnDownload');
  const preview      = document.getElementById('preview');
  const musicStatus  = document.getElementById('musicStatus');

  // SUA URL PÚBLICA DO BLOB (fixa aqui):
  const NOISE_URL = "https://ajkn3hlscwxlwhjd.public.blob.vercel-storage.com/TIMECODE%20AUDIO%20TESTE%20ruido.mp3";

  let audioCtx, musicBuf, mixBlob;

  modeL.onchange = toggleRows; toggleRows();

  // === Upload via label (abre nativamente) ===
  musicFile.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleMusicFile(file);
  };

  // === Drag & Drop opcional ===
  ['dragenter','dragover'].forEach(evt=>{
    uploadArea.addEventListener(evt, ev => { ev.preventDefault(); uploadArea.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(evt=>{
    uploadArea.addEventListener(evt, ev => { ev.preventDefault(); uploadArea.classList.remove('drag'); });
  });
  uploadArea.addEventListener('drop', async ev=>{
    const file = ev.dataTransfer?.files?.[0];
    if (file) await handleMusicFile(file);
  });

  async function handleMusicFile(file){
    try{
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const arr = await file.arrayBuffer();
      musicBuf = await audioCtx.decodeAudioData(arr);
      drawStatus(statusCanvas, `Música: ${file.name}`, musicBuf.duration, musicBuf.sampleRate);
      musicStatus.textContent = '✅ Música carregada';
      btnProcess.disabled = false;
      btnDownload.disabled = true;
    }catch(err){
      console.error('Falha ao carregar música:', err);
      musicStatus.textContent = '⚠️ Erro ao carregar música';
    }
  }

  document.getElementById('btnProcess').onclick = async () => {
    if (!musicBuf) return;

    const sr = musicBuf.sampleRate;
    const len = musicBuf.length;
    const off = new OfflineAudioContext(2, len, sr);

    // R = Música (mono)
    const musicSrc = new AudioBufferSourceNode(off, { buffer: musicBuf });
    const split = off.createChannelSplitter(Math.max(2, musicBuf.numberOfChannels));
    const gR = off.createGain(); gR.gain.value = parseInt(levelR.value) / 100;
    musicSrc.connect(split); split.connect(gR, 0); if (musicBuf.numberOfChannels > 1) split.connect(gR, 1);

    // L = Ruído Base (nuvem) OU LTC
    const merger = off.createChannelMerger(2);
    let leftNode;

    if (modeL.value === 'noisebase') {
      // Baixa RUÍDO do Blob
      const arr = await fetch(NOISE_URL).then(r => r.arrayBuffer());
      const tmpCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const base = await tmpCtx.decodeAudioData(arr);

      // Resample para SR do projeto, se necessário
      let baseBuf = base;
      if (base.sampleRate !== sr) {
        const rs = new OfflineAudioContext(1, Math.floor(base.duration * sr), sr);
        const s = new AudioBufferSourceNode(rs, { buffer: base });
        s.connect(rs.destination); s.start();
        baseBuf = await rs.startRendering();
      }

      // Tile + envelope por BPM
      const left = off.createBuffer(1, len, sr);
      const dst = left.getChannelData(0);
      const src = baseBuf.getChannelData(0); const slen = src.length;
      for (let i = 0; i < len; i++) dst[i] = src[i % slen];

      const bpm = Math.max(40, Math.min(220, parseInt(bpmInput.value) || 120));
      const beat = Math.floor(sr * 60 / bpm);
      const pulse = Math.floor(sr * 0.04); // 40 ms
      for (let start = 0; start < len; start += beat) {
        for (let i = 0; i < pulse && start + i < len; i++) {
          const env = Math.exp(-i / (sr * 0.02)); // 20 ms decay
          dst[start + i] *= (0.3 + 0.7 * env);
        }
      }

      const srcL = new AudioBufferSourceNode(off, { buffer: left });
      const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 1.1;
      const gL = off.createGain(); gL.gain.value = parseInt(levelL.value) / 100;
      srcL.connect(bp); bp.connect(gL); leftNode = gL; srcL.start();

    } else {
      // LTC
      const fps = parseFloat(fpsSel.value);
      const drop = fps === 29.97;
      const ltcBuf = generateLTC({ sr, length: len, fps: drop ? 30 : fps, dropFrame: drop });
      const srcL = new AudioBufferSourceNode(off, { buffer: ltcBuf });
      const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
      const gL = off.createGain(); gL.gain.value = parseInt(levelL.value) / 100;
      srcL.connect(hp); hp.connect(lp); lp.connect(gL); leftNode = gL; srcL.start();
    }

    // Mix
    leftNode.connect(merger, 0, 0);
    gR.connect(merger, 0, 1);
    merger.connect(off.destination);
    musicSrc.start();

    const rendered = await off.startRendering();
    mixBlob = bufferToWav(rendered);
    preview.src = URL.createObjectURL(mixBlob);
    btnDownload.disabled = false;
  };

  document.getElementById('btnDownload').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(mixBlob);
    a.download = 'mix_L_ruido_base_R_musica.wav';
    a.click();
  };

  function toggleRows() {
    const isLTC = modeL.value === 'ltc';
    fpsRow.style.display = isLTC ? '' : 'none';
    bpmRow.style.display = isLTC ? 'none' : '';
  }

  function drawStatus(canvas, name, dur, sr) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ffdddd'; ctx.font = 'bold 16px system-ui';
    ctx.fillText(name.length > 40 ? name.slice(0, 37) + '…' : name, 20, 36);
    ctx.fillStyle = '#ffaaaa'; ctx.font = '12px system-ui';
    ctx.fillText(`Duração: ${fmt(dur)} | SR: ${Math.round(sr)} Hz`, 20, 60);
  }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function bufferToWav(buf) {
    const numCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    const chans = []; for (let c = 0; c < numCh; c++) chans[c] = buf.getChannelData(c);
    const bytesPerSample = 2, blockAlign = numCh * bytesPerSample;
    const ab = new ArrayBuffer(44 + len * blockAlign); const view = new DataView(ab);
    write(view, 0, 'RIFF'); view.setUint32(4, 36 + len * blockAlign, true); write(view, 8, 'WAVE');
    write(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bytesPerSample * 8, true);
    write(view, 36, 'data'); view.setUint32(40, len * blockAlign, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i] || 0));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }
  const write = (view, off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
}
