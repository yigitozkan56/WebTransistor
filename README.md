# WebTransistor

**WebTransistor**, sıfır soyutlama (zero abstraction) ilkesiyle çalışan saf transistör tabanlı çip ve devre simülatörüdür. Hazır mantık kapıları veya kapalı kutu entegreler (IC) yerine yalnızca fiziksel **NMOS**, **PMOS**, **Pull-Up**, **Pull-Down**, **VCC**, **GND**, anahtarlar, **LED** ve **4×4 / 8×8 Piksel Matrisi** bileşenleriyle dijital donanım tasarlamanızı ve gerçek zamanlı simüle etmenizi sağlar.

React 19, TypeScript, Tailwind CSS v4, WebGL2 Instanced + LOD rendering, WebGPU / SharedArrayBuffer Web Worker ve Tauri (`wgpu` GPU hızlandırma) ile geliştirilmiştir.

## 3 Sayfalı Web Platformu

Kalıcı üst gezinme çubuğu (`SiteHeader`) üzerinden üç ana görünüme kesintisiz geçiş yapılır ve simülatör sekmesindeki aktif devre durumu korunur:

1. **WebTransistor (`/`)** — Tam ekran sanal transistör ve çip simülatörü, bileşen paleti, canlı düğüm/transistör probu, 150k+ Tick/sn hız kontrolü, matris çoğaltma (`×10`, `×100`, `×1000`) ve silikon benchmark üreteci.
2. **Wiki (`/wiki`)** — 6-durumlu MOS lojik kafesi (`HIGH`, `LOW`, `WEAK_HIGH`, `WEAK_LOW`, `Z`, `ERR`), 10 fiziksel bileşen referansı, CMOS/NMOS devre tasarım rehberi, `CircuitDocument v1` JSON şeması, simülasyon motoru mimarisi ve kısayollar.
3. **Örnek JSON Projeleri (`/projeler`, `/projects`, `/examples`)** — İndirilebilir, SVG şema önizlemeli ve tek tıkla simülatörde açılabilen **10 adet saf transistör devresi** + özel `.json` yükleme aracı.

> Doğrudan proje açma bağlantısı: `/?project=<proje-id>` (ör. `/?project=04-cmos-xor-gate`)

## 10 Örnek JSON Projesi (`public/projects/`)

Tüm örnek projeler `public/projects/` altında statik JSON dosyaları olarak sunulur ve 20px ızgara hizalaması ile sıfır kısa devre garantisine sahiptir:

| # | Dosya | Devre |
|---|-------|-------|
| 01 | `01-cmos-inverter-not.json` | CMOS NOT Kapısı (2T) |
| 02 | `02-cmos-nand-and.json` | CMOS NAND & AND Kapısı (6T) |
| 03 | `03-cmos-nor-or.json` | CMOS NOR & OR Kapısı (6T) |
| 04 | `04-cmos-xor-gate.json` | Saf CMOS XOR Kapısı (12T) |
| 05 | `05-ring-oscillator-5stage.json` | 5 Kademeli NMOS Halka Osilatör & Dalga Çubuğu (5T) |
| 06 | `06-sr-nor-latch.json` | 1-Bit SR Bellek Hücresi — CMOS NOR Latch (8T) |
| 07 | `07-mux-2to1-cmos.json` | 2-to-1 Çoklayıcı — Statik CMOS MUX (14T) |
| 08 | `08-half-adder-1bit.json` | 1-Bit Yarım Toplayıcı — Half Adder (18T) |
| 09 | `09-d-latch-gated-memory.json` | Saat/Enable Kontrollü D-Latch Bellek (18T) |
| 10 | `10-pixel-matrix-decoder-4x4.json` | 2-to-4 Satır Dekoder & 4×4 Ham Piksel Matrisi (28T) |

## Kurulum ve Geliştirme

### Gereksinimler
- Node.js 22+ (`npm`)
- Rust & Cargo (yalnızca Tauri masaüstü derlemesi için)

### Web Geliştirme, Test ve Derleme
```bash
npm install
npm run dev
npm test
npm run build
```

### Masaüstü Uygulaması (.exe) Derleme
```bash
npm run tauri:build
```

## Netlify Üzerinde Yayınlama

Depo kökünde hazır [`netlify.toml`](./netlify.toml) yapılandırması bulunur:
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node sürümü:** `NODE_VERSION = "22"`
- **COOP / COEP başlıkları:** `Cross-Origin-Opener-Policy: same-origin` ve `Cross-Origin-Embedder-Policy: credentialless` (tarayıcıda `SharedArrayBuffer` Worker desteği için)
- **Statik JSON sunumu:** `/projects/*.json` için `application/json; charset=utf-8` ve önbellek başlıkları
- **SPA yönlendirmesi:** `/wiki`, `/projeler` vb. tüm rotalar `/index.html` (`200`) üzerine yönlendirilir

Netlify CLI veya Git entegrasyonu ile doğrudan dağıtabilirsiniz:
```bash
npm run build
npx netlify deploy --prod --dir=dist
```

## İndirme

Windows masaüstü uygulamasını (.exe) [Releases](https://github.com/yigitozkan56/WebTransistor/releases/tag/v1.0.0) sayfasından veya doğrudan aşağıdaki bağlantıdan indirebilirsiniz:

- [WebTransistor_1.0.0_x64-setup.exe](https://github.com/yigitozkan56/WebTransistor/releases/download/v1.0.0/WebTransistor_1.0.0_x64-setup.exe)
