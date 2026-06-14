// config.js
// Konfigurasi AI Provider — menggunakan IYH App API via Vercel Serverless Proxy

const CONFIG = {
  // Provider: 'iyh'
  AI_PROVIDER: 'iyh',

  // IYH App settings
  // API Key sekarang disimpan di Vercel Environment Variable (aman, tidak terekspos di browser)
  // URL mengarah ke serverless function /api/ai — tidak perlu CORS proxy lagi
  IYH_URL:     '/api/ai',
  IYH_MODEL:   'gemini-3-flash', // Model yang diaktifkan di akun IYH App

  // Bahasa respons
  LANGUAGE: 'Indonesian'
};
