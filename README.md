# WebTransistor

**WebTransistor**, saf transistör tabanlı çip ve devre simülatörüdür. React, TypeScript, Vite ve Tauri (Rust + wgpu GPU hızlandırma) ile geliştirilmiştir.

## Özellikler

- Saf transistör seviyesinde dijital devre ve çip simülasyonu
- GPU hızlandırmalı (wgpu) masaüstü çalıştırma desteği (Tauri)
- Hazır başlangıç sahneleri ve hızlı silikon matris çoğaltma
- JSON formatında devre dışa/içe aktarma
- Klavye kısayolları ve canlı donanım/performans monitörü

## Kurulum ve Geliştirme

### Gereksinimler
- Node.js (npm)
- Rust & Cargo (Tauri masaüstü derlemesi için)

### Web Geliştirme Sunucusu
```bash
npm install
npm run dev
```

### Masaüstü Uygulaması (.exe) Derleme
```bash
npm run tauri:build
```

## İndirme

Windows masaüstü uygulamasını (.exe) [Releases](https://github.com/yigitozkan56/WebTransistor/releases/tag/v1.0.0) sayfasından veya doğrudan aşağıdaki bağlantıdan indirebilirsiniz:

- [WebTransistor_1.0.0_x64-setup.exe](https://github.com/yigitozkan56/WebTransistor/releases/download/v1.0.0/WebTransistor_1.0.0_x64-setup.exe)
