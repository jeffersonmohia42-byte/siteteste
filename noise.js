// api/noise.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // opção 1: arquivo fixo
    const filePath = 'base.wav';

    // gera URL pública (se o bucket for public)…
    const { data: pub } = supabase.storage.from('noise-base').getPublicUrl(filePath);
    if (pub?.publicUrl) {
      return res.status(200).json({ url: pub.publicUrl });
    }

    // …ou URL assinada (se bucket privado)
    const { data, error } = await supabase
      .storage.from('noise-base')
      .createSignedUrl(filePath, 60 * 60); // 1h
    if (error) throw error;

    return res.status(200).json({ url: data.signedUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Noise fetch error' });
  }
}
