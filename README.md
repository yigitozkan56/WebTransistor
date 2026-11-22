# WebTransistor

**WebTransistor**, sıfır soyutlama (zero abstraction) ilkesiyle çalışan saf transistör tabanlı çip ve devre simülatörüdür. Hazır mantık kapıları veya kapalı kutu entegreler (IC) yerine yalnızca fiziksel **NMOS**, **PMOS**, **Pull-Up**, **Pull-Down**, **VCC**, **GND**, anahtarlar, **LED** ve **4×4 / 8×8 Piksel Matrisi** bileşenleriyle dijital donanım tasarlamanızı ve gerçek zamanlı simüle etmenizi sağlar.

React 19, TypeScript, Tailwind CSS v4, WebGL2 Instanced + LOD rendering, WebGPU / SharedArrayBuffer Web Worker ve Tauri (`wgpu` GPU hızlandırma) ile geliştirilmiştir.

## 3 Sayfalı Web Platformu

Kalıcı üst gezinme çubuğu (`SiteHeader`) üzerinden üç ana görünüme kesintisiz geçiş yapılır ve simülatör sekmesindeki aktif devre durumu korunur:

1. **WebTransistor (`/`)** — Tam ekran sanal transistör ve çip simülatörü, bileşen paleti, canlı düğüm/transistör probu, 150k+ Tick/sn hız kontrolü, matris çoğaltma (`×10`, `×100`, `×1000`) ve silikon benchmark üreteci.
2. **Wiki (`/wiki`)** — 6-durumlu MOS lojik kafesi (`HIGH`, `LOW`, `WEAK_HIGH`, `WEAK_LOW`, `Z`, `ERR`), 10 fiziksel bileşen referansı, CMOS/NMOS devre tasarım rehberi, `CircuitDocument v1` JSON şeması, simülasyon motoru mimarisi ve kısayollar.
3. **Örnek JSON Projeleri (`/projeler`, `/projects`, `/examples`)** — İndirilebilir, SVG şema önizlemeli ve tek tıkla simülatörde açılabilen **25 adet saf transistör devresi** (4 adet aşırı üst düzey işlemci/bellek/GPU sistemi dahil) + özel `.json` yükleme aracı.

> Doğrudan proje açma bağlantısı: `/?project=<proje-id>` (ör. `/?project=22-4bit-alu-processor-core`)

## 25 Örnek JSON Projesi (`public/projects/`)

Tüm örnek projeler `public/projects/` altında statik JSON dosyaları olarak sunulur ve 20px ızgara hizalaması ile sıfır kısa devre garantisine sahiptir:

| # | Dosya | Devre | Seviye |
|---|---|---|---|
| 01 | `01-cmos-inverter-not.json` | CMOS NOT Kapısı (2T) | Başlangıç |
| 02 | `02-cmos-nand-and.json` | CMOS NAND & AND Kapısı (6T) | Başlangıç |
| 03 | `03-cmos-nor-or.json` | CMOS NOR & OR Kapısı (6T) | Başlangıç |
| 04 | `04-cmos-xor-gate.json` | Saf CMOS XOR Kapısı (12T) | Orta |
| 05 | `05-ring-oscillator-5stage.json` | 5 Kademeli NMOS Halka Osilatör & Dalga Çubuğu (5T) | Başlangıç |
| 06 | `06-sr-nor-latch.json` | 1-Bit SR Bellek Hücresi — CMOS NOR Latch (8T) | Orta |
| 07 | `07-mux-2to1-cmos.json` | 2-to-1 Çoklayıcı — Statik CMOS MUX (14T) | Orta |
| 08 | `08-half-adder-1bit.json` | 1-Bit Yarım Toplayıcı — Half Adder (18T) | Orta |
| 09 | `09-d-latch-gated-memory.json` | Saat/Enable Kontrollü D-Latch Bellek (18T) | İleri |
| 10 | `10-pixel-matrix-decoder-4x4.json` | 2-to-4 Satır Dekoder & 4×4 Ham Piksel Matrisi (28T) | İleri |
| 11 | `11-cmos-xnor-comparator-1bit.json` | 1-Bit Eşitlik Karşılaştırıcı — CMOS XNOR (14T) | Başlangıç |
| 12 | `12-majority-voter-3input.json` | 3 Girişli Çoğunluk Oylayıcı — TMR Majority Voter (18T) | Başlangıç |
| 13 | `13-full-adder-1bit.json` | 1-Bit Tam Toplayıcı — Full Adder (36T) | Orta |
| 14 | `14-demux-1to4-cmos.json` | 1-to-4 Veri Dağıtıcı — CMOS DEMUX (36T) | Orta |
| 15 | `15-mux-4to1-cmos.json` | 4-to-1 Çoklayıcı — CMOS MUX (40T) | Orta |
| 16 | `16-ring-oscillator-7stage-cmos.json` | 7 Kademeli Saf CMOS Halka Osilatör & Faz Monitörü (14T) | Orta |
| 17 | `17-d-flipflop-edge-triggered.json` | Kenar Tetiklemeli Master-Slave D Flip-Flop (38T) | İleri |
| 18 | `18-2bit-magnitude-comparator.json` | 2-Bit Büyüklük Karşılaştırıcı — A>B, A=B, A<B (62T) | İleri |
| 19 | `19-4bit-ripple-carry-adder.json` | 4-Bit Ripple-Carry Toplayıcı — 4-Bit Adder (144T) | İleri |
| 20 | `20-4bit-parallel-register.json` | 4-Bit Paralel Yazmaç — 4-Bit Register (72T) | İleri |
| 21 | `21-3to8-line-decoder-cmos.json` | 3-to-8 Adres Çözücü — 3-to-8 Line Decoder (70T) | İleri |
| 22 | `22-4bit-alu-processor-core.json` | 4-Bit İşlemci ALU Çekirdeği — ADD/SUB/AND/XOR + Bayraklar (372T) | **Uzman** |
| 23 | `23-4x4-sram-memory-bank.json` | 16-Bit (4×4) Adreslenebilir Statik RAM (SRAM) Bellek Bankası (484T) | **Uzman** |
| 24 | `24-4bit-array-multiplier.json` | 4×4 Bit Donanımsal Çarpıcı — Hardware Array Multiplier (456T) | **Uzman** |
| 25 | `25-8x8-gpu-pixel-rasterizer.json` | 8×8 Ham Piksel GPU Rasterizer & Koordinat Çizici (1.292T) | **Uzman** |

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
