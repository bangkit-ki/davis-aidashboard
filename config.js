// config.js
// Konfigurasi AI Provider — menggunakan IYH App API

const CONFIG = {
  // Provider: 'iyh'
  AI_PROVIDER: 'iyh',

  // IYH App settings
  IYH_API_KEY: 'iyh_5PZ_J2iy9lFz8t9Y3F1xKxEb5UflEY6f',
  // Menggunakan proxy untuk menghindari error CORS (Failed to fetch) di browser
  IYH_URL:     'https://corsproxy.io/?https://v1.iyhapi.app/chat/completions',
  IYH_MODEL:   'gemini-3-flash', // Model yang diaktifkan di akun IYH App

  // Bahasa respons
  LANGUAGE: 'Indonesian'
};
