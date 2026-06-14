// storyEngine.js
// Menyusun narasi SCR dashboard dari summary + anomali
// Depends on: config.js, aiInsight.js (callIyh sudah ada di sana)

// ── Generate judul naratif untuk header dashboard ─────────────
async function generateTitle(summary, anomalies, filterContext = '') {
  const severeCount = anomalies.profitOutliers.filter(a => a.severity === 'severe').length
    + anomalies.momSpikes.filter(a => a.severity === 'severe').length;

  const worstProfit = anomalies.profitOutliers[0] || null;
  const worstMoM    = anomalies.momSpikes[0] || null;

  let anomalyHint = '';
  if (worstProfit) {
    anomalyHint += `Anomali terparah: sub-kategori ${worstProfit.name} margin ${worstProfit.margin}% (Z=${worstProfit.zScore}). `;
  }
  if (worstMoM) {
    anomalyHint += `Revenue ${worstMoM.month} berubah ${worstMoM.changePct}% MoM.`;
  }

  const filterLine = filterContext
    ? `FILTER AKTIF: ${filterContext}\n`
    : '';

  const prompt =
    `${filterLine}` +
    `Data penjualan Superstore (setelah difilter):\n` +
    `- Total Sales: $${summary.totalSales}, Profit Margin: ${summary.overallMargin}%\n` +
    `- Jumlah anomali kritis: ${severeCount}\n` +
    `- ${anomalyHint}\n\n` +
    `Tulis SATU judul dashboard dalam Bahasa Indonesia.\n` +
    `Judul harus naratif dan SPESIFIK terhadap filter yang sedang aktif (sebutkan kategori/wilayah/segmen/periode jika ada filter).\n` +
    `Maksimal 12 kata. Format: fakta kunci + implikasi atau rekomendasi.\n` +
    `Contoh baik: "Tables Rugi 8% — Review Harga Diperlukan Segera"\n` +
    `Contoh baik (dengan filter): "Bikes di Europe: Margin 22% Tapi Profit Turun Q3"\n` +
    `Contoh buruk: "Dashboard Penjualan Superstore Q3 2024"\n` +
    `Tulis judulnya saja, tanpa tanda kutip dan tanpa penjelasan lain.`;

  return await callIyh(prompt);
}

// ── Generate full story dalam format SCR ─────────────────────
async function generateStory(summary, anomalies, filterContext = '') {
  const catLines = summary.categories
    .map(c => `  - ${c.category}: sales $${(c.sales/1000).toFixed(0)}K, margin ${c.margin}%`)
    .join('\n');

  const profitLines = anomalies.profitOutliers.length
    ? anomalies.profitOutliers
        .map(a => `  - ${a.name}: margin ${a.margin}% (Z=${a.zScore}, ${a.severity})`)
        .join('\n')
    : '  Tidak ada';

  const momLines = anomalies.momSpikes.length
    ? anomalies.momSpikes.slice(0, 3)
        .map(a => `  - ${a.month}: ${a.changePct}% MoM (${a.severity})`)
        .join('\n')
    : '  Tidak ada';

  const filterLine = filterContext
    ? `FILTER AKTIF: ${filterContext}\n\n`
    : '';

  const prompt =
    `Kamu adalah analis bisnis senior yang menulis ringkasan eksekutif.\n` +
    `${filterLine}` +
    `Berdasarkan data Superstore YANG SUDAH DIFILTER berikut, tulis narasi bisnis dengan format SCR.\n` +
    `PENTING: Narasi harus SPESIFIK terhadap filter yang aktif — sebutkan kategori/wilayah/segmen/periode yang sedang dianalisis.\n\n` +
    `DATA KESELURUHAN (setelah filter):\n` +
    `  Total Sales: $${summary.totalSales}\n` +
    `  Total Profit: $${summary.totalProfit}\n` +
    `  Profit Margin: ${summary.overallMargin}%\n` +
    `  Total Orders: ${summary.totalOrders}\n\n` +
    `PERFORMA PER KATEGORI:\n${catLines}\n\n` +
    `ANOMALI PROFIT MARGIN (Z-score):\n${profitLines}\n\n` +
    `ANOMALI PERUBAHAN BULANAN:\n${momLines}\n\n` +
    `Tulis narasi dalam Bahasa Indonesia dengan FORMAT PERSIS seperti ini:\n\n` +
    `SETUP\n` +
    `[1-2 kalimat konteks situasi bisnis saat ini, sesuai filter aktif]\n\n` +
    `CONFLICT\n` +
    `[1-2 kalimat masalah atau anomali paling kritis yang ditemukan pada data yang difilter]\n\n` +
    `RESOLUTION\n` +
    `[1-2 kalimat rekomendasi konkret yang bisa dilakukan]\n\n` +
    `Gunakan angka spesifik dari data. Maksimal 6 kalimat total. Langsung ke poin.`;

  return await callIyh(prompt);
}

// ── Parse respons LLM menjadi objek SCR ───────────────────────
function parseStoryResponse(text) {
  const result = { setup: '', conflict: '', resolution: '', raw: text };

  const setupMatch    = text.match(/SETUP[\s\S]*?\n([\s\S]*?)(?=CONFLICT|RESOLUTION|$)/i);
  const conflictMatch = text.match(/CONFLICT[\s\S]*?\n([\s\S]*?)(?=RESOLUTION|SETUP|$)/i);
  const resolveMatch  = text.match(/RESOLUTION[\s\S]*?\n([\s\S]*?)(?=SETUP|CONFLICT|$)/i);

  if (setupMatch)    result.setup      = setupMatch[1].trim();
  if (conflictMatch) result.conflict   = conflictMatch[1].trim();
  if (resolveMatch)  result.resolution = resolveMatch[1].trim();

  if (!result.setup && !result.conflict && !result.resolution) {
    result.setup = text.trim();
  }

  return result;
}
