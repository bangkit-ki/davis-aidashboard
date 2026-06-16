// aiInsight.js
// Modul untuk komunikasi dengan LLM (IYH App)
// Pastikan config.js sudah di-load sebelum file ini

// ── Build prompt dari ringkasan data ─────────────────────────
// Fungsi ini mengubah objek summaryStats menjadi teks yang
// bisa dipahami LLM sebagai konteks bisnis
function buildPrompt(stats, focusQuestion = '', filterContext = '') {
  const catLines = stats.categories
    .map(c => `  - ${c.category}: Sales $${(c.sales/1000).toFixed(1)}K, Profit $${(c.profit/1000).toFixed(1)}K, Margin ${c.margin}%`)
    .join('\n');

  const regionLines = stats.regions
    .map(r => `  - ${r.region}: Sales $${(r.sales/1000).toFixed(1)}K`)
    .join('\n');

  const filterLine = filterContext
    ? `\nFILTER AKTIF: ${filterContext}\n(Data di bawah ini sudah difilter sesuai filter di atas)\n`
    : '';

  const context = `
Berikut adalah ringkasan data penjualan Superstore:${filterLine}

KESELURUHAN:
  - Total Sales  : $${(stats.totalSales/1)}
  - Total Profit : $${(stats.totalProfit/1)}
  - Profit Margin: ${stats.overallMargin}%
  - Total Orders : ${stats.totalOrders}

PERFORMA PER KATEGORI (diurutkan dari margin tertinggi):
${catLines}

REVENUE PER REGION (diurutkan dari tertinggi):
${regionLines}

Kategori terbaik (margin): ${stats.bestCategory.category} (${stats.bestCategory.margin}%)
Kategori terburuk (margin): ${stats.worstCategory.category} (${stats.worstCategory.margin}%)
`;

  const question = focusQuestion ||
    'Berikan insight bisnis yang paling penting dari data ini dalam 3 poin singkat. ' +
    'Sertakan rekomendasi konkret untuk tiap poin. Gunakan Bahasa Indonesia.';

  return `${context}
---
ATURAN KETAT:
1. Jawablah pertanyaan di bawah ini dengan singkat, praktis, dan langsung ke poin menggunakan Bahasa Indonesia.
2. Kamu HANYA boleh menjawab jika pertanyaan berkaitan dengan data penjualan Superstore, dashboard analitik ini, sales, profit, kategori, wilayah, anomali, atau performa bisnis dari konteks di atas.
3. JIKA pertanyaan di luar topik data Superstore/dashboard ini (misalnya pemrograman umum, resep makanan, pengetahuan umum non-data Superstore, percakapan santai, dll), kamu HARUS menjawab dengan persis kalimat ini: "Maaf, saya hanya AI untuk membantu anda menemukan insight pada dashboard ini, jika anda menanyakan hal dilkuar itu, saya tidak bisa menjawabnya. Anda bisa mulai mencari insight tentang dashboard ini dengan menuliskan "Berapa revenue terbesar yang diperoleh?" dan tuliskan di kolom pertanyaan dibawah." dan jangan berikan penjelasan tambahan apapun.
4. Jawaban harus SPESIFIK terhadap filter yang sedang aktif. Jika ada filter aktif, sebutkan konteks filter tersebut dalam jawabanmu.

Pertanyaan: ${question}`;
}

// ── Panggil LLM dan dapatkan insight ─────────────────────────
async function getInsight(stats, focusQuestion = '', filterContext = '') {
  const prompt = buildPrompt(stats, focusQuestion, filterContext);
  const response = await callIyh(prompt);
  
  // Jika respons mengindikasikan di luar konteks, pastikan kita mengembalikan kalimat yang tepat sesuai permintaan user
  const offTopicPattern = /(tidak diprogram|hanya AI untuk membantu|tidak bisa menjawabnya|Maaf, saya hanya AI|dilkuar itu)/i;
  if (offTopicPattern.test(response)) {
    return `Maaf, saya hanya AI untuk membantu anda menemukan insight pada dashboard ini, jika anda menanyakan hal dilkuar itu, saya tidak bisa menjawabnya. Anda bisa mulai mencari insight tentang dashboard ini dengan menuliskan "Berapa revenue terbesar yang diperoleh?" dan tuliskan di kolom pertanyaan dibawah.`;
  }
  
  return response;
}

// ── Implementasi IYH App ─────────────────────────────────────────
async function callIyh(prompt) {
  const res = await fetch(CONFIG.IYH_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      model: CONFIG.IYH_MODEL,
      messages: [
        {
          role:    'system',
          content: 'Kamu adalah analis bisnis yang memberi insight singkat, ' +
                   'praktis, dan langsung ke poin. Gunakan Bahasa Indonesia.\n' +
                   'PENTING: Kamu HANYA boleh menjawab pertanyaan seputar data Superstore, dashboard analitik ini, sales, profit, kategori, wilayah, atau performa bisnis terkait.\n' +
                   'Jika pertanyaan di luar topik data Superstore/dashboard ini, kamu WAJIB menjawab hanya dengan kalimat: "Maaf, saya hanya AI untuk membantu anda menemukan insight pada dashboard ini, jika anda menanyakan hal dilkuar itu, saya tidak bisa menjawabnya. Anda bisa mulai mencari insight tentang dashboard ini dengan menuliskan \\"Berapa revenue terbesar yang diperoleh?\\" dan tuliskan di kolom pertanyaan dibawah." tanpa penjelasan lainnya.'
        },
        {
          role:    'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
  });

  if (!res.ok) {
    let errMsg = res.status;
    try {
      const err = await res.json();
      errMsg = err.error?.message || JSON.stringify(err) || res.status;
    } catch (e) {
      errMsg = await res.text() || res.status;
    }
    throw new Error(`IYH App error: ${errMsg}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── Fungsi baru: narrateAlert() ───────────────────────────────
async function narrateAlert(anomaly) {
  const prompt = buildAlertPrompt(anomaly);
  return await callIyh(prompt);
}

// ── Build prompt untuk satu anomali ──────────────────────────
function buildAlertPrompt(anomaly) {
  let context = '';

  if (anomaly.type === 'profit_outlier') {
    context = `
Sub-kategori produk "${anomaly.name}" memiliki profit margin ${anomaly.margin}%
yang sangat ${anomaly.direction === 'low' ? 'rendah' : 'tinggi'} dibanding rata-rata
(Z-score: ${anomaly.zScore}, severity: ${anomaly.severity}).
Total profit untuk sub-kategori ini: $${anomaly.profit}.`;
  }

  else if (anomaly.type === 'mom_spike') {
    context = `
Revenue bulan ${anomaly.month} mengalami ${anomaly.direction === 'drop' ? 'penurunan' : 'kenaikan'}
sebesar ${Math.abs(anomaly.changePct)}% dibanding bulan sebelumnya (${anomaly.prevMonth}).
Revenue bulan ini: $${Number(anomaly.current).toLocaleString()},
bulan lalu: $${Number(anomaly.previous).toLocaleString()}.
Severity: ${anomaly.severity}.`;
  }

  else if (anomaly.type === 'iqr_outlier') {
    context = `
Sub-kategori "${anomaly.subcat}" memiliki ${anomaly.count} transaksi yang bernilai
sangat ${anomaly.direction === 'high' ? 'tinggi' : 'rendah'} secara statistik (outlier IQR).
Rata-rata nilai transaksi outlier: $${anomaly.avgSales.toLocaleString()}.`;
  }

  return `Kamu adalah analis data bisnis. Berikan ALERT singkat (maksimal 2 kalimat) 
dalam Bahasa Indonesia tentang anomali berikut di data penjualan Superstore:
${context}

Format alert: mulai dengan angka kunci yang mengejutkan, jelaskan implikasinya,
dan sertakan satu rekomendasi tindakan konkret.
Jangan gunakan kata "Alert:" di awal. Langsung ke poin.`;
}

// ── Narasi batch: generate alert untuk semua anomali sekaligus ─
async function narrateAllAlerts(anomalies) {
  const allItems = [
    ...anomalies.profitOutliers,
    ...anomalies.momSpikes.slice(0, 3)
  ];

  if (allItems.length === 0) return 'Tidak ada anomali signifikan terdeteksi.';

  const itemLines = allItems.map((a, i) => {
    if (a.type === 'profit_outlier')
      return `${i+1}. [${a.severity.toUpperCase()}] Sub-kategori ${a.name}: margin ${a.margin}% (Z=${a.zScore})`;
    if (a.type === 'mom_spike')
      return `${i+1}. [${a.severity.toUpperCase()}] Revenue ${a.month}: ${a.changePct}% MoM`;
    return `${i+1}. [INFO] IQR outlier di ${a.subcat} (${a.count} transaksi)`;
  }).join('\n');

  const prompt = `Kamu adalah analis data bisnis yang memberi penjelasan anomali secara terpadu.
Berikut adalah daftar anomali yang terdeteksi di data penjualan Superstore:

${itemLines}

Tuliskan sebuah narasi analisis dalam bentuk satu atau dua paragraf utuh dalam Bahasa Indonesia yang merangkum anomali-anomali di atas secara kohesif.
Fokus pada poin paling kritis, hubungkan informasi tersebut secara logis, dan sertakan rekomendasi tindakan konkret.
PENTING: Jangan gunakan format daftar, poin-poin (bullet-points seperti •), nomor, atau simbol list lainnya. Tulis dalam bentuk paragraf teks biasa yang mengalir indah. Jangan berikan kalimat pembuka (preamble) atau penutup, langsung mulai dengan narasinya.`;

  return await callIyh(prompt);
}
