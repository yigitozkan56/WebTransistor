import {
  LogicValue,
  type CircuitDocument,
  type ComponentType,
  type ComputeBackendType,
} from '../types/circuit';

export type WikiSectionId =
  | 'felsefe'
  | 'lojik-kafes'
  | 'bilesenler'
  | 'devre-tasarimi'
  | 'json-semasi'
  | 'motor-gpu'
  | 'kisayollar-sss';

export interface WikiSectionMeta {
  id: WikiSectionId;
  number: string;
  title: string;
  shortTitle: string;
  summary: string;
  keywords: string[];
}

export const WIKI_SECTIONS: readonly WikiSectionMeta[] = [
  {
    id: 'felsefe',
    number: '01',
    title: 'WebTransistor Nedir? & Sıfır Soyutlama Felsefesi',
    shortTitle: 'Felsefe & Ekosistem',
    summary:
      'Hazır mantık kapısı, yapay saat veya kara kutu IC olmadan yalnızca fiziksel NMOS/PMOS transistörlerle çip tasarlama yaklaşımı ve Web + Tauri masaüstü ekosistemi.',
    keywords: [
      'zero abstraction',
      'sıfır soyutlama',
      'nmos',
      'pmos',
      'kara kutu',
      'tauri',
      'wgpu',
      'web',
      'masaüstü',
    ],
  },
  {
    id: 'lojik-kafes',
    number: '02',
    title: '6-Durumlu MOS Lojik Kafesi (LogicValue)',
    shortTitle: '6-Durumlu Lojik Kafesi',
    summary:
      'HIGH, LOW, WEAK_HIGH, WEAK_LOW, Z ve ERR durumlarının sayısal kodları, GPU tampon karşılıkları, renk kodları ve düğüm çakışma çözümleme kuralları.',
    keywords: [
      'logicvalue',
      'high',
      'low',
      'weak_high',
      'weak_low',
      'z',
      'err',
      'kısa devre',
      'drive_lut',
      'empedans',
    ],
  },
  {
    id: 'bilesenler',
    number: '03',
    title: '10 Fiziksel Bileşen Referansı',
    shortTitle: '10 Fiziksel Bileşen',
    summary:
      'NMOS, PMOS, PULL_UP, PULL_DOWN, VCC, GND, TOGGLE_SWITCH, PUSH_BUTTON, LED ve PIXEL_MATRIX bileşenlerinin kısayolları, pin koordinatları, boyutları ve elektriksel davranışları.',
    keywords: [
      'nmos',
      'pmos',
      'pull_up',
      'pull_down',
      'vcc',
      'gnd',
      'toggle_switch',
      'push_button',
      'led',
      'pixel_matrix',
      'p_y_x',
      'pin',
    ],
  },
  {
    id: 'devre-tasarimi',
    number: '04',
    title: 'CMOS & NMOS Devre Tasarım Rehberi',
    shortTitle: 'Devre Tasarım Rehberi',
    summary:
      'Inverter, NAND/NOR ikiliği, statik CMOS XOR, Halka Osilatör, SR/D Latch, 2:1 MUX, Yarım Toplayıcı ve 4×4 Ham Piksel Matrisi topolojilerini inceleyip tek tıkla simülatörde açın.',
    keywords: [
      'cmos',
      'inverter',
      'not',
      'nand',
      'nor',
      'xor',
      'ring oscillator',
      'halka osilatör',
      'sr latch',
      'd latch',
      'mux',
      'half adder',
      'dekoder',
      'pixel matrix',
    ],
  },
  {
    id: 'json-semasi',
    number: '05',
    title: 'JSON Devre Şeması (CircuitDocument v1)',
    shortTitle: 'JSON Şeması (v1)',
    summary:
      'CircuitDocument v1 alan referansı, 20px ızgara hizalama kuralı, güvenli keyBinding kuralları ve doğrudan içe aktarılabilen eksiksiz örnek JSON devre şeması.',
    keywords: [
      'json',
      'circuitdocument',
      'version 1',
      '20px',
      'grid',
      'waypoints',
      'keybinding',
      'şema',
      'import',
      'export',
    ],
  },
  {
    id: 'motor-gpu',
    number: '06',
    title: 'Simülasyon Motoru & Donanım Hızlandırma',
    shortTitle: 'SoA Motor & WebGPU',
    summary:
      'Data-Oriented SoA tamponları, Switch-Island CSR derleyicisi, Two-Pass WGSL compute shader, 4 katmanlı compute backend seçimi ve WebGL2 Instanced + LOD çizim hattı.',
    keywords: [
      'soa',
      'int32array',
      'uint8array',
      'csr',
      'switch-island',
      'union-find',
      'wgsl',
      'webgpu',
      'vulkan',
      'sharedarraybuffer',
      'webgl2',
      'lod',
      '1000000',
    ],
  },
  {
    id: 'kisayollar-sss',
    number: '07',
    title: 'Klavye Kısayolları, Araçlar & SSS',
    shortTitle: 'Kısayollar & SSS',
    summary:
      'Tüm editör kısayolları, sürükle-bırak JSON, ×10/×100/×1000 matris çoğaltma, 1M+ transistör Benchmark üreteci ve ERR/Z hata giderme rehberi.',
    keywords: [
      'kısayol',
      'shortcut',
      'drag and drop',
      'sürükle bırak',
      'benchmark',
      'matris çoğaltma',
      'sss',
      'err',
      'floating',
      'sorun giderme',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Section 1: Felsefe & Ekosistem
// ---------------------------------------------------------------------------

export interface PhilosophyPillar {
  title: string;
  badge: string;
  description: string;
}

export const PHILOSOPHY_PILLARS: readonly PhilosophyPillar[] = [
  {
    title: 'Sıfır Hazır Kapı & Sıfır Kara Kutu',
    badge: 'Zero Abstraction',
    description:
      'WebTransistor içinde hazır AND, OR, NOT, XOR kapıları veya kapalı kutu Flip-Flop/MUX entegreleri bulunmaz. Her mantık fonksiyonu, fiziksel NMOS ve PMOS transistörlerin Gate, Drain ve Source bacaklarının birbirine bağlanmasıyla sıfırdan inşa edilir.',
  },
  {
    title: 'Yapay Saat Sinyali Yok',
    badge: 'Otonom Osilasyon',
    description:
      'Hazır bir Clock bileşeni yoktur. Zamanlama ve saat darbesi üretmek için tek sayıda (ör. 3 veya 5) transistörlü eviriciyi kapalı geri besleme halkasına bağlayarak fiziksel birim-kapı gecikmeli Ring Oscillator kurarsınız.',
  },
  {
    title: 'Sürücüsüz Ham Piksel Matrisi',
    badge: 'Doğrudan Pin',
    description:
      'PIXEL_MATRIX bileşeninin içinde gizli tarama mantığı veya sürücü çipi yer almaz. 4×4 (16 bacak) ve 8×8 (64 bacak) modlarında her piksel doğrudan kendi fiziksel P_y_x girişine sahiptir.',
  },
  {
    title: '1.000.000+ Transistör Ölçeklenebilirliği',
    badge: 'SoA + GPU',
    description:
      'Nesne yönelimli ağır transistör sınıfları yerine düz Int32Array/Uint8Array bellek düzeni (SoA) kullanılır. Switch-Island CSR derleyicisi ve Two-Pass WGSL çözücüsü milyon ölçeğinde devreyi akıcı simüle eder.',
  },
] as const;

export interface EcosystemCard {
  platform: string;
  stack: string;
  capabilities: string[];
}

export const ECOSYSTEM_CARDS: readonly EcosystemCard[] = [
  {
    platform: 'Web Platformu (Tarayıcı)',
    stack: 'React 19 · TypeScript · WebGL2 Instanced · WebGPU WGSL · SharedArrayBuffer Worker',
    capabilities: [
      'Kurulum gerektirmeden doğrudan tarayıcıda tam fiziksel devre tasarımı ve anlık simülasyon',
      'WebGPU destekli tarayıcılarda Two-Pass WGSL compute shader ile paralel GPU çözümü',
      'COOP/COEP başlıkları altında SharedArrayBuffer ile sıfır-kopya Web Worker senkronizasyonu',
      'Tek gl.drawArraysInstanced çağrısı ve Silikon Yoğunluk Haritası (LOD) ile 60 FPS görüntüleme',
    ],
  },
  {
    platform: 'Masaüstü Uygulaması (Tauri v2)',
    stack: 'Rust · Tauri 2 · wgpu 24 (Vulkan / DirectX 12) · Rayon',
    capabilities: [
      'window.__TAURI_INTERNALS__ algılandığında otomatik olarak yerel GPU köprüsüne geçiş',
      'Rust tarafında wgpu üzerinden Vulkan veya DirectX 12 ile doğrudan WGSL compute çalıştırma',
      'Rayon çok çekirdekli CPU paralel yedekleme ve büyük VLSI yongalar için düşük gecikme',
      'Windows kurulum paketi: WebTransistor_1.0.0_x64-setup.exe',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Section 2: 6-Durumlu MOS Lojik Kafesi
// ---------------------------------------------------------------------------

export interface LogicLatticeStateDoc {
  value: LogicValue;
  key: 'HIGH' | 'WEAK_HIGH' | 'LOW' | 'WEAK_LOW' | 'Z' | 'ERR';
  name: string;
  numericCode: number;
  gpuCode: string;
  hex: string;
  strength: 'Güçlü (Strong)' | 'Zayıf (Weak)' | 'Yüzen (Hi-Z)' | 'Hata (Contention)';
  gateEffect: string;
  description: string;
}

export const LOGIC_LATTICE_STATES: readonly LogicLatticeStateDoc[] = [
  {
    value: LogicValue.HIGH,
    key: 'HIGH',
    name: 'HIGH (1)',
    numericCode: LogicValue.HIGH,
    gpuCode: '1u',
    hex: '#00E5FF',
    strength: 'Güçlü (Strong)',
    gateEffect: 'NMOS İletir · PMOS Kesimde',
    description:
      'VCC rayından, açık konumda (state=true) bir anahtardan veya iletimdeki bir PMOS yolundan gelen güçlü Logic 1 gerilimi.',
  },
  {
    value: LogicValue.WEAK_HIGH,
    key: 'WEAK_HIGH',
    name: 'WEAK HIGH (1)',
    numericCode: LogicValue.WEAK_HIGH,
    gpuCode: '4u',
    hex: '#38BDF8',
    strength: 'Zayıf (Weak)',
    gateEffect: 'NMOS İletir · PMOS Kesimde',
    description:
      'PULL_UP direnci tarafından sağlanan zayıf Logic 1 seviyesi. Güçlü bir LOW (GND/NMOS) bağlandığında kısa devre olmadan ezilir.',
  },
  {
    value: LogicValue.LOW,
    key: 'LOW',
    name: 'LOW (0)',
    numericCode: LogicValue.LOW,
    gpuCode: '0u',
    hex: '#262C36',
    strength: 'Güçlü (Strong)',
    gateEffect: 'PMOS İletir · NMOS Kesimde',
    description:
      'GND toprak referansından, kapalı konumda (state=false) bir anahtardan veya iletimdeki bir NMOS yolundan gelen güçlü Logic 0 gerilimi.',
  },
  {
    value: LogicValue.WEAK_LOW,
    key: 'WEAK_LOW',
    name: 'WEAK LOW (0)',
    numericCode: LogicValue.WEAK_LOW,
    gpuCode: '3u',
    hex: '#30363D',
    strength: 'Zayıf (Weak)',
    gateEffect: 'PMOS İletir · NMOS Kesimde',
    description:
      'PULL_DOWN direnci tarafından sağlanan zayıf Logic 0 seviyesi. Boşta kalan Gate pinlerini ve SR/D Latch başlangıçlarını kararlı tutar.',
  },
  {
    value: LogicValue.Z,
    key: 'Z',
    name: 'Z (High-Impedance)',
    numericCode: LogicValue.Z,
    gpuCode: '2u',
    hex: '#484F58',
    strength: 'Yüzen (Hi-Z)',
    gateEffect: 'Hiçbir MOSFET İletmez',
    description:
      'Hiçbir aktif kaynağa veya pull direncine iletken bir yol bulunmayan yüzen (yüksek empedanslı) düğüm. Tuvalde kesik çizgi olarak gösterilir.',
  },
  {
    value: LogicValue.ERR,
    key: 'ERR',
    name: 'ERR (Short)',
    numericCode: LogicValue.ERR,
    gpuCode: '5u',
    hex: '#EF4444',
    strength: 'Hata (Contention)',
    gateEffect: 'Hiçbir MOSFET İletmez',
    description:
      'Aynı iletken düğüm veya ada üzerinde güçlü HIGH (VCC) ile güçlü LOW (GND) doğrudan çarpıştığında oluşan kısa devre çatışma durumu.',
  },
] as const;

export interface LogicResolutionRule {
  title: string;
  formula: string;
  resultLabel: string;
  resultHex: string;
  explanation: string;
}

export const LOGIC_RESOLUTION_RULES: readonly LogicResolutionRule[] = [
  {
    title: 'Güçlü Sürücü Zayıf Direnci Ezer',
    formula: 'HIGH + WEAK_LOW → HIGH  |  LOW + WEAK_HIGH → LOW',
    resultLabel: 'Çatışmasız Çözüm',
    resultHex: '#00E5FF',
    explanation:
      'DRIVE_LUT tablosu güçlü bitleri (bit 0/1) zayıf bitlerden (bit 2/3) öncelikli tutar. Bu sayede NMOS + PULL_UP eviriciler ve başlangıç PULL_DOWN dirençli bellekler kısa devre (ERR) üretmeden çalışır.',
  },
  {
    title: 'Güçlü + Güçlü Çarpışması Kısa Devre Verir',
    formula: 'STRONG_HIGH + STRONG_LOW → ERR (5)',
    resultLabel: 'ERR (Short)',
    resultHex: '#EF4444',
    explanation:
      'VCC ile GND aynı anda iletimdeki MOSFET zinciri veya ortak tel üzerinden birbirine bağlanırsa düğüm ERR (5) durumuna geçer ve TopBar üzerinde "Kısa Devre (ERR)!" uyarısı yanar.',
  },
  {
    title: 'Zayıf + Zayıf Çekişmesi',
    formula: 'WEAK_HIGH + WEAK_LOW → Z (0)',
    resultLabel: 'Yüksek Empedans',
    resultHex: '#484F58',
    explanation:
      'Aynı düğüme hem PULL_UP hem PULL_DOWN bağlandığında ve güçlü bir kaynak bulunmadığında CPU çözücüsü (DRIVE_LUT[12]) gerilimi belirsiz kabul ederek Z (0) üretir.',
  },
  {
    title: 'MOSFET Kapı İletim Eşikleri',
    formula: 'NMOS: G ∈ {HIGH, WEAK_HIGH}  |  PMOS: G ∈ {LOW, WEAK_LOW}',
    resultLabel: 'Tek Yönlü Kontrol',
    resultHex: '#38BDF8',
    explanation:
      'Gate yalnızca gerilimi algılar, Source/Drain akımını taşımaz. Gate değeri Z (0) veya ERR (5) olduğunda transistör kesimde (state = 0) kalır.',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 3: 10 Fiziksel Bileşen Referansı
// ---------------------------------------------------------------------------

export interface ComponentPinDoc {
  id: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: string;
  role: string;
}

export interface ComponentReferenceDoc {
  type: ComponentType;
  name: string;
  shortName: string;
  shortcut: string;
  category: 'Silikon & Transistör' | 'Direnç & Güç' | 'Fiziksel Girdi / Çıktı';
  dimensions: string;
  pins: readonly ComponentPinDoc[];
  propsSummary: readonly string[];
  behavior: string;
  designTip: string;
}

export const COMPONENT_REFERENCE_LIST: readonly ComponentReferenceDoc[] = [
  {
    type: 'NMOS',
    name: 'NMOS Transistör',
    shortName: 'NMOS',
    shortcut: '1',
    category: 'Silikon & Transistör',
    dimensions: '40×40 px',
    pins: [
      { id: 'G', side: 'left', offset: '(-20, 0)', role: 'input (Gate)' },
      { id: 'D', side: 'top', offset: '(0, -20)', role: 'bidirectional (Drain)' },
      { id: 'S', side: 'bottom', offset: '(0, +20)', role: 'bidirectional (Source)' },
    ],
    propsSummary: ['label?: string'],
    behavior:
      'N-Tipi MOSFET. Gate bacağına HIGH (2) veya WEAK_HIGH (4) geldiğinde Drain (D) ile Source (S) arasını çift yönlü iletime açar.',
    designTip:
      'CMOS pull-down ağlarında kullanılır (GND tarafı). Güçlü 0 (LOW) geçirmede mükemmeldir.',
  },
  {
    type: 'PMOS',
    name: 'PMOS Transistör',
    shortName: 'PMOS',
    shortcut: '2',
    category: 'Silikon & Transistör',
    dimensions: '40×40 px',
    pins: [
      { id: 'G', side: 'left', offset: '(-20, 0)', role: 'input (Gate)' },
      { id: 'S', side: 'top', offset: '(0, -20)', role: 'bidirectional (Source)' },
      { id: 'D', side: 'bottom', offset: '(0, +20)', role: 'bidirectional (Drain)' },
    ],
    propsSummary: ['label?: string'],
    behavior:
      'P-Tipi MOSFET. Gate bacağına LOW (1) veya WEAK_LOW (3) geldiğinde Source (S) ile Drain (D) arasını çift yönlü iletime açar.',
    designTip:
      'Dikkat: PMOS üzerinde S üstte (0, -20), D altta (0, +20) konumlanır. CMOS pull-up ağlarında VCC tarafına bağlanır.',
  },
  {
    type: 'PULL_UP',
    name: 'Pull-Up Direnci',
    shortName: 'PU',
    shortcut: '3',
    category: 'Direnç & Güç',
    dimensions: '40×40 px',
    pins: [{ id: 'OUT', side: 'bottom', offset: '(0, +20)', role: 'power' }],
    propsSummary: ['label?: string'],
    behavior:
      'Bağlı olduğu düğüme sürekli olarak zayıf Logic 1 (WEAK_HIGH = 4) sağlar. Güçlü LOW geldiğinde kısa devre yapmadan 0 değerine düşer.',
    designTip:
      'NMOS mantık devrelerinde ve 3/5 kademeli NMOS Halka Osilatörlerde yük direnci olarak kullanılır.',
  },
  {
    type: 'PULL_DOWN',
    name: 'Pull-Down Direnci',
    shortName: 'PD',
    shortcut: '4',
    category: 'Direnç & Güç',
    dimensions: '40×40 px',
    pins: [{ id: 'OUT', side: 'top', offset: '(0, -20)', role: 'power' }],
    propsSummary: ['label?: string'],
    behavior:
      'Bağlı olduğu düğüme sürekli olarak zayıf Logic 0 (WEAK_LOW = 3) sağlar. Güçlü HIGH geldiğinde kısa devre olmadan 1 değerine yükselir.',
    designTip:
      'SR NOR Latch veya D-Latch devrelerinde açılış belirsizliğini önlemek için Q düğümüne bağlanarak deterministik başlangıç sağlar.',
  },
  {
    type: 'VCC',
    name: 'VCC (Güç +1)',
    shortName: 'VCC',
    shortcut: '5',
    category: 'Direnç & Güç',
    dimensions: '40×40 px',
    pins: [{ id: 'OUT', side: 'bottom', offset: '(0, +20)', role: 'power' }],
    propsSummary: ['label?: string'],
    behavior:
      'Sabit, güçlü Logic 1 (HIGH = 2) besleme rayı (VDD). Doğrudan GND ile iletken yolla birleşirse kısa devre (ERR) üretir.',
    designTip:
      'CMOS pull-up PMOS ağlarının Source (S) bacaklarını beslemek için kullanılır.',
  },
  {
    type: 'GND',
    name: 'GND (Toprak 0)',
    shortName: 'GND',
    shortcut: '6',
    category: 'Direnç & Güç',
    dimensions: '40×40 px',
    pins: [{ id: 'OUT', side: 'top', offset: '(0, -20)', role: 'power' }],
    propsSummary: ['label?: string'],
    behavior:
      'Sabit, güçlü Logic 0 (LOW = 1) toprak referansı (VSS).',
    designTip:
      'NMOS pull-down ağlarının Source (S) bacaklarını toprağa bağlamak için kullanılır.',
  },
  {
    type: 'TOGGLE_SWITCH',
    name: 'Mekanik Anahtar (Switch)',
    shortName: 'SW',
    shortcut: '7',
    category: 'Fiziksel Girdi / Çıktı',
    dimensions: '80×40 px',
    pins: [{ id: 'OUT', side: 'right', offset: '(+40, 0)', role: 'output' }],
    propsSummary: ['label?: string', 'state?: boolean', 'keyBinding?: string'],
    behavior:
      'Tıklandığında veya atanan klavye tuşuna basıldığında kalıcı olarak güçlü HIGH (1) veya güçlü LOW (0) sürer.',
    designTip:
      'İki konumlu veri/adres girişleri (A, B, D0, D1, SEL, ENABLE) için idealdir.',
  },
  {
    type: 'PUSH_BUTTON',
    name: 'Mekanik Buton (Push Button)',
    shortName: 'BTN',
    shortcut: '8',
    category: 'Fiziksel Girdi / Çıktı',
    dimensions: '80×40 px',
    pins: [{ id: 'OUT', side: 'right', offset: '(+40, 0)', role: 'output' }],
    propsSummary: ['label?: string', 'state?: boolean', 'keyBinding?: string'],
    behavior:
      'Basılı tutulduğu (veya bağlı klavye tuşu basılıyken) sürece güçlü HIGH (1), bırakıldığında güçlü LOW (0) veren yaylı buton.',
    designTip:
      'SR Latch SET/RESET darbeleri veya manuel saat (Clock) tetiklemesi için kullanılır.',
  },
  {
    type: 'LED',
    name: 'Tekil LED Noktası',
    shortName: 'LED',
    shortcut: '9',
    category: 'Fiziksel Girdi / Çıktı',
    dimensions: '40×40 px',
    pins: [{ id: 'IN', side: 'left', offset: '(-20, 0)', role: 'input' }],
    propsSummary: ['label?: string', "color?: 'cyan' | 'green' | 'amber' | 'red'"],
    behavior:
      'IN bacağına HIGH (2) veya WEAK_HIGH (4) gerilimi geldiğinde seçilen renkte parlayan fiziksel ışık diyotu.',
    designTip:
      'Çıkış durumlarını izlemenin yanı sıra ara düğümlerde hata ayıklama göstergesi olarak da kullanılabilir.',
  },
  {
    type: 'PIXEL_MATRIX',
    name: 'Ham Piksel Matrisi',
    shortName: 'MAT',
    shortcut: '0',
    category: 'Fiziksel Girdi / Çıktı',
    dimensions: '4×4: 160×160 px · 8×8: 360×360 px',
    pins: [
      {
        id: 'P_y_x',
        side: 'left',
        offset: '4×4: ±80 px · 8×8: ±180 px (20 px adım)',
        role: 'input (16 veya 64 pin)',
      },
    ],
    propsSummary: [
      'label?: string',
      'matrixSize?: 4 | 8',
      "color?: 'cyan' | 'green' | 'amber' | 'red'",
    ],
    behavior:
      'Sürücüsüz ham LED matrisi. P_y_x (y=satır, x=sütun) pinleri indeks sırasıyla 4 kenara (left → bottom → right → top) eşit dağıtılır; her piksel kendi bacağından HIGH/WEAK_HIGH ile yanar.',
    designTip:
      '4×4 matriste kenar başına 4 pin (-40, -20, 0, +20), 8×8 matriste kenar başına 16 pin (-160..+140) bulunur.',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 4: CMOS & NMOS Devre Tasarım Rehberi (10 runnable project links)
// ---------------------------------------------------------------------------

export interface CircuitDesignGuide {
  projectId: string;
  order: string;
  title: string;
  transistorSummary: string;
  category: string;
  topology: string;
  howItWorks: string;
  keyTakeaway: string;
}

export const CMOS_DUALITY_RULES: readonly {
  gate: string;
  pullUp: string;
  pullDown: string;
  note: string;
}[] = [
  {
    gate: 'NOT (Inverter)',
    pullUp: '1× PMOS (G = A)',
    pullDown: '1× NMOS (G = A)',
    note: 'Giriş 0 iken üstteki PMOS VCC’ye çeker; giriş 1 iken alttaki NMOS GND’ye indirir.',
  },
  {
    gate: 'NAND (2-Giriş)',
    pullUp: '2× Paralel PMOS',
    pullDown: '2× Seri NMOS',
    note: 'Her iki giriş 1 olduğunda seri NMOS yolu açılır ve çıkış 0 olur; en az biri 0 ise paralel PMOS çıkışı 1 yapar.',
  },
  {
    gate: 'NOR (2-Giriş)',
    pullUp: '2× Seri PMOS',
    pullDown: '2× Paralel NMOS',
    note: 'De Morgan ikiliği: PMOS ağı seri, NMOS ağı paraleldir. İki giriş de 0 iken çıkış 1 olur.',
  },
] as const;

export const CIRCUIT_DESIGN_GUIDES: readonly CircuitDesignGuide[] = [
  {
    projectId: '01-cmos-inverter-not',
    order: '#01',
    title: 'CMOS Inverter (NOT Kapısı)',
    transistorSummary: '2 Transistör (1 PMOS + 1 NMOS)',
    category: 'Temel Mantık Kapısı',
    topology: 'PMOS Source→VCC, NMOS Source→GND, ortak Gate (A) ve ortak Drain (OUT)',
    howItWorks:
      'A=0 iken PMOS iletir (OUT=1), NMOS kesimdedir. A=1 iken NMOS iletir (OUT=0), PMOS kesimdedir. Kararlı durumda VCC-GND yolu kapalı olduğu için sıfır statik kısa devre oluşur.',
    keyTakeaway:
      'Tüm statik CMOS dijital mantığın en küçük yapı taşıdır; güçlü 0 ve güçlü 1 çıkış üretir.',
  },
  {
    projectId: '02-cmos-nand-and',
    order: '#02',
    title: 'CMOS NAND & AND Kapısı',
    transistorSummary: '6 Transistör (4T NAND + 2T NOT)',
    category: 'Temel Mantık Kapısı',
    topology: 'Paralel 2 PMOS (pull-up) + Seri 2 NMOS (pull-down) + Çıkışta 2T Inverter',
    howItWorks:
      '4 transistörlü evrensel NAND çekirdeği A=1 ve B=1 olduğunda çıkışı 0’a çeker. Peşine eklenen 2T CMOS Inverter sinyali tersleyerek AND çıkışını üretir.',
    keyTakeaway:
      'Silikon tasarımda AND kapısı doğrudan değil, bir NAND ve bir Inverter birleşiminden (6T) elde edilir.',
  },
  {
    projectId: '03-cmos-nor-or',
    order: '#03',
    title: 'CMOS NOR & OR Kapısı',
    transistorSummary: '6 Transistör (4T NOR + 2T NOT)',
    category: 'Temel Mantık Kapısı',
    topology: 'Seri 2 PMOS (pull-up) + Paralel 2 NMOS (pull-down) + Çıkışta 2T Inverter',
    howItWorks:
      'NAND topolojisinin tam ikilidir (dual). A veya B’den herhangi biri 1 olduğunda paralel NMOS yolu çıkışı GND’ye indirir (NOR=0); 2T Inverter çıkışı OR=1 yapar.',
    keyTakeaway:
      'Pull-up ve pull-down ağlarındaki seri/paralel simetriyi kavrayarak keyfi Boole ifadeleri doğrudan CMOS’a çevirebilirsiniz.',
  },
  {
    projectId: '04-cmos-xor-gate',
    order: '#04',
    title: 'Saf Statik CMOS XOR Kapısı',
    transistorSummary: '12 Transistör (2×2T NOT + 4 PMOS + 4 NMOS)',
    category: 'Tamamlayıcı Kombinasyonel',
    topology:
      'İki inverter (!A, !B) + Pull-Up (A·!B ve !A·B paralel kolları) + Pull-Down (A·B ve !A·!B paralel kolları)',
    howItWorks:
      'Girişler farklıyken (0,1 veya 1,0) pull-up PMOS dallarından biri iletir ve çıkışı VCC’ye taşır. Girişler eşitken (0,0 veya 1,1) pull-down NMOS dallarından biri çıkışı GND’ye indirir.',
    keyTakeaway:
      'Pass-transistor hileleri yerine tam tamamlayıcı pull-up/pull-down kullanarak her durumda raydan raya güçlü çıkış garantiler.',
  },
  {
    projectId: '05-ring-oscillator-5stage',
    order: '#05',
    title: '5 Kademeli NMOS Halka Osilatör',
    transistorSummary: '5 Transistör (5× NMOS + PULL_UP + GND)',
    category: 'Saat & Osilatör',
    topology: 'D1→G2→D2→G3→D3→G4→D4→G5→D5→G1 kapalı tek-sayılı evirici halkası',
    howItWorks:
      'Her kademe bir NMOS ve PULL_UP direnciyle evirici oluşturur. Tek sayıda (5) evirici kapalı halkada kararlı bir duruma oturamadığı için her tick’te dalga halka boyunca döner.',
    keyTakeaway:
      'Yapay saat olmadan fiziksel yayılım gecikmesiyle saat sinyali üretmenin temel yöntemidir (önerilen hız: 8 Tick/sn).',
  },
  {
    projectId: '06-sr-nor-latch',
    order: '#06',
    title: '1-Bit SR Bellek Hücresi (CMOS NOR Latch)',
    transistorSummary: '8 Transistör (2×4T Çapraz Bağlı NOR + PULL_DOWN)',
    category: 'Bellek & Sıralı Devre',
    topology: 'Q = NOR(RESET, Q_bar), Q_bar = NOR(SET, Q), başlangıç için Q düğümünde PULL_DOWN',
    howItWorks:
      'SET (S) butonuna basıldığında Q=1 ve Q_bar=0 kilitlenir; buton bırakıldığında geri besleme veriyi tutar. RESET (X) ile Q=0 durumuna dönülür. Q üzerindeki zayıf PULL_DOWN yalnızca ilk açılışta Q=0 belirler.',
    keyTakeaway:
      'Güçlü CMOS çıkışı zayıf PULL_DOWN direncini kısa devre olmadan ezer; böylece bellek hücresi başlangıçta belirsiz salınıma düşmez.',
  },
  {
    projectId: '07-mux-2to1-cmos',
    order: '#07',
    title: '2-to-1 Çoklayıcı (Statik CMOS MUX)',
    transistorSummary: '14 Transistör (1×2T NOT + 3×4T CMOS NAND)',
    category: 'Aritmetik & Veri Yolu',
    topology: '!SEL = NOT(SEL), m0 = NAND(D0, !SEL), m1 = NAND(D1, SEL), Y = NAND(m0, m1)',
    howItWorks:
      'SEL=0 olduğunda yalnızca m0 aktifleşir ve Y=D0 iletilir; SEL=1 olduğunda yalnızca m1 aktifleşir ve Y=D1 çıkışa aktarılır. İki seviyeli NAND-NAND yapısı De Morgan gereği AND-OR ile özdeştir.',
    keyTakeaway:
      'ALU veri yolları ve yazmaç seçicileri kurarken 3 adet 4T NAND ile maliyeti 14 transistörde tutabilirsiniz.',
  },
  {
    projectId: '08-half-adder-1bit',
    order: '#08',
    title: '1-Bit Yarım Toplayıcı (Half Adder)',
    transistorSummary: '18 Transistör (12T CMOS XOR + 6T CMOS AND)',
    category: 'Aritmetik & Veri Yolu',
    topology: 'Ortak A/B anahtarları → SUM (12T XOR) ve CARRY (6T AND)',
    howItWorks:
      'A+B ikili toplamasının toplam bitini (SUM = A ⊕ B) ve elde bitini (CARRY = A · B) paralel olarak üretir. 1+1 girişinde SUM=0, CARRY=1 olur.',
    keyTakeaway:
      'İki yarım toplayıcı ve bir OR kapısı birleştirilerek çok bitli CPU toplayıcılarının temeli olan Full Adder elde edilir.',
  },
  {
    projectId: '09-d-latch-gated-memory',
    order: '#09',
    title: 'Saat/Enable Kontrollü D-Latch Bellek',
    transistorSummary: '18 Transistör (2T NOT + 2×4T NAND + 8T NAND SR Latch + PD)',
    category: 'Bellek & Sıralı Devre',
    topology: 'S_bar = NAND(D, EN), R_bar = NAND(!D, EN) → çapraz bağlı NAND SR kilidi',
    howItWorks:
      'ENABLE (E) = 1 iken devre şeffaftır ve DATA (D) doğrudan Q çıkışına geçer. ENABLE = 0 yapıldığında S_bar=1 ve R_bar=1 olur; bellek son veriyi kilitler.',
    keyTakeaway:
      'İki D-Latch arka arkaya (biri !EN, biri EN ile) bağlanarak yükselen kenar tetiklemeli D Flip-Flop elde edilir.',
  },
  {
    projectId: '10-pixel-matrix-decoder-4x4',
    order: '#10',
    title: '2-to-4 Satır Dekoder & 4×4 Ham Piksel Matrisi',
    transistorSummary: '28 Transistör (2×2T NOT + 4×6T CMOS AND)',
    category: 'Ekran & Çıkış',
    topology: 'A0, A1 adreslerinden Y0..Y3 satır seçicileri → doğrudan P_y_0..P_y_3 pinleri',
    howItWorks:
      'İki bitlik adres (A1, A0), 4 adet 6T CMOS AND kapısı üzerinden Y0..Y3 satırlarından tam olarak birini aktif eder. Her satır çıkışı sürücüsüz PIXEL_MATRIX’in ilgili 4 piksel bacağına (P_y_0..P_y_3) ve durum LED’ine bağlıdır.',
    keyTakeaway:
      'Sürücü çipi olmayan ham bir LED matrisinin saf transistörlü adres dekoderi ile satır satır nasıl tarandığını gösterir.',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 5: JSON Devre Şeması (CircuitDocument v1)
// ---------------------------------------------------------------------------

export interface JsonFieldDoc {
  scope: string;
  field: string;
  type: string;
  required: boolean;
  description: string;
}

export const JSON_SCHEMA_FIELDS: readonly JsonFieldDoc[] = [
  {
    scope: 'Kök Nesne',
    field: 'version',
    type: '1',
    required: true,
    description: 'Şema sürümü. parseAndValidateCircuitDocument yalnızca 1 değerini kabul eder.',
  },
  {
    scope: 'Kök Nesne',
    field: 'name',
    type: 'string',
    required: true,
    description: 'TopBar ve sekme başlığında görünen devre adı.',
  },
  {
    scope: 'Kök Nesne',
    field: 'components',
    type: 'CircuitComponent[]',
    required: true,
    description: 'Devredeki tüm fiziksel bileşenlerin listesi (yalnızca izinli 10 tip).',
  },
  {
    scope: 'Kök Nesne',
    field: 'wires',
    type: 'Wire[]',
    required: true,
    description: 'Bileşen pinlerini birbirine bağlayan iletken yollar.',
  },
  {
    scope: 'CircuitComponent',
    field: 'id',
    type: 'string',
    required: true,
    description: 'Boş olmayan benzersiz bileşen kimliği (ör. "pmos_1", "sw_a").',
  },
  {
    scope: 'CircuitComponent',
    field: 'type',
    type: 'ComponentType',
    required: true,
    description:
      '"NMOS" | "PMOS" | "PULL_UP" | "PULL_DOWN" | "VCC" | "GND" | "TOGGLE_SWITCH" | "PUSH_BUTTON" | "LED" | "PIXEL_MATRIX"',
  },
  {
    scope: 'CircuitComponent',
    field: 'x, y',
    type: 'number',
    required: true,
    description: 'Dünya koordinatları (px). Temiz pin hizalaması için 20’nin tam katı olmalıdır.',
  },
  {
    scope: 'CircuitComponent',
    field: 'rotation',
    type: '0 | 90 | 180 | 270',
    required: true,
    description: 'Saat yönünde derece cinsinden dönüş açısı.',
  },
  {
    scope: 'CircuitComponent',
    field: 'props',
    type: 'ComponentProps',
    required: true,
    description:
      'Bileşene özel özellikler: label, state (Switch/Button), keyBinding, color ("cyan"|"green"|"amber"|"red"), matrixSize (4|8).',
  },
  {
    scope: 'Wire',
    field: 'id, from, to',
    type: 'string, WireEndpoint',
    required: true,
    description: 'from ve to uçları { componentId, pinId } biçiminde geçerli bileşen pinlerini işaret eder.',
  },
  {
    scope: 'Wire',
    field: 'waypoints?, color?',
    type: 'Point[], string',
    required: false,
    description: '90° ortogonal büküm noktaları ({ x, y } — 20px katları) ve opsiyonel tel rengi.',
  },
] as const;

export const JSON_SCHEMA_RULES: readonly { title: string; detail: string; badge: string }[] = [
  {
    title: '20px Izgara Hizalama Kuralı (GRID_SIZE = 20)',
    badge: 'x % 20 === 0',
    detail:
      'Tüm bileşen (x, y) koordinatları ve kablo waypoints noktaları 20’nin tam katı olmalıdır. Bileşen boyutları 40px katı, pin ofsetleri ise 20px katı olduğundan pinler daima ızgara kesişimlerine oturur.',
  },
  {
    title: 'Güvenli keyBinding Kuralı',
    badge: '0-9 / F / R Yasak',
    detail:
      '0–9 tuşları bileşen paleti yerleşimi, F tuşu Fit-to-View ve R tuşu 90° döndürme için ayrılmıştır. Switch ve Butonlarda çakışmasız harfler (A, B, C, D, E, S, W, X, Z) veya Space kullanın.',
  },
  {
    title: 'Sıfır Soyutlama Şema Doğrulaması',
    badge: 'Strict Validator',
    detail:
      'parseAndValidateCircuitDocument yalnızca 10 fiziksel ComponentType değerine izin verir. JSON içine hazır AND/OR/IC tipi yazılırsa içe aktarma reddedilir.',
  },
] as const;

export const JSON_EXAMPLE_DOCUMENT: CircuitDocument = {
  version: 1,
  name: '2T CMOS Inverter (Örnek Şema)',
  components: [
    {
      id: 'sw_in',
      type: 'TOGGLE_SWITCH',
      x: 120,
      y: 180,
      rotation: 0,
      props: { label: 'IN', state: false, keyBinding: 'A' },
    },
    {
      id: 'vcc_1',
      type: 'VCC',
      x: 280,
      y: 60,
      rotation: 0,
      props: { label: 'VDD' },
    },
    {
      id: 'pmos_1',
      type: 'PMOS',
      x: 280,
      y: 140,
      rotation: 0,
      props: { label: 'P1' },
    },
    {
      id: 'nmos_1',
      type: 'NMOS',
      x: 280,
      y: 240,
      rotation: 0,
      props: { label: 'N1' },
    },
    {
      id: 'gnd_1',
      type: 'GND',
      x: 280,
      y: 320,
      rotation: 0,
      props: { label: 'VSS' },
    },
    {
      id: 'led_out',
      type: 'LED',
      x: 380,
      y: 180,
      rotation: 0,
      props: { label: 'OUT', color: 'cyan' },
    },
  ],
  wires: [
    {
      id: 'w_vdd_s',
      from: { componentId: 'vcc_1', pinId: 'OUT' },
      to: { componentId: 'pmos_1', pinId: 'S' },
    },
    {
      id: 'w_p_n_drain',
      from: { componentId: 'pmos_1', pinId: 'D' },
      to: { componentId: 'nmos_1', pinId: 'D' },
    },
    {
      id: 'w_s_gnd',
      from: { componentId: 'nmos_1', pinId: 'S' },
      to: { componentId: 'gnd_1', pinId: 'OUT' },
    },
    {
      id: 'w_in_pg',
      from: { componentId: 'sw_in', pinId: 'OUT' },
      to: { componentId: 'pmos_1', pinId: 'G' },
      waypoints: [
        { x: 200, y: 180 },
        { x: 200, y: 140 },
      ],
    },
    {
      id: 'w_in_ng',
      from: { componentId: 'sw_in', pinId: 'OUT' },
      to: { componentId: 'nmos_1', pinId: 'G' },
      waypoints: [
        { x: 200, y: 180 },
        { x: 200, y: 240 },
      ],
    },
    {
      id: 'w_out_led',
      from: { componentId: 'pmos_1', pinId: 'D' },
      to: { componentId: 'led_out', pinId: 'IN' },
      waypoints: [{ x: 280, y: 180 }],
    },
  ],
};

export const JSON_EXAMPLE_STRING: string = JSON.stringify(JSON_EXAMPLE_DOCUMENT, null, 2);

// ---------------------------------------------------------------------------
// Section 6: Simülasyon Motoru & Donanım Hızlandırma
// ---------------------------------------------------------------------------

export interface EngineArchitectureBlock {
  title: string;
  subtitle: string;
  bullets: readonly string[];
  codeSignature: string;
}

export const ENGINE_PIPELINE_BLOCKS: readonly EngineArchitectureBlock[] = [
  {
    title: '1. Data-Oriented SoA Bellek Düzeni',
    subtitle: 'Sıfır OOP nesne yükü · 1.000.000+ Transistör',
    bullets: [
      'Her transistör için ayrı JavaScript nesnesi yerine paralel Int32Array ve Uint8Array dizileri (TransistorSoA) ayrılır.',
      'gateNode, drainNode, sourceNode düğüm indekslerini Int32Array içinde ardışık saklar; CPU önbellek isabetini maksimize eder.',
      'type (0=NMOS, 1=PMOS), state (0=OFF, 1=ON) ve netValues (LogicValue) tek baytlık Uint8Array tamponlarında tutulur.',
    ],
    codeSignature:
      'TransistorSoA { count, gateNode: Int32Array, drainNode: Int32Array, sourceNode: Int32Array, type: Uint8Array, state: Uint8Array }',
  },
  {
    title: '2. Switch-Island CSR Derleyicisi & O(dirty) Adımlama',
    subtitle: 'compileCircuit() · Union-Find · Unit-Gate-Delay',
    bullets: [
      'Kablolarla birleşen pinler Union-Find ile netCount adet elektriksel düğüme indirgenir.',
      'Ray olmayan düğümler ve bunları bağlayan transistörler izole Anahtarlama Adalarına (islandCount) bölünür ve CSR (Compressed Sparse Row) ofset tablolarına paketlenir.',
      'stepHalfCycle() yalnızca değişen kapı düğümlerinin (dirtyTxQueue) tetiklediği adaları sıfır bellek ayırmalı Union-Find ile çözer; Ring Oscillator halkaları MAX_SETTLE_FLIPS = 4 sınırıyla deterministik salınır.',
    ],
    codeSignature:
      'CSR Tabloları: islandNetOffsets · islandTxOffsets · gateNetTxOffsets · gateNetIslandOffsets · railNetIslandOffsets',
  },
  {
    title: '3. Two-Pass WGSL Paralel Compute Shader',
    subtitle: 'WGSL_TWO_PASS_SOLVER_SHADER · @workgroup_size(256)',
    bullets: [
      'Düz GPU tamponları: transistors (vec4<u32>: [gate, drain, source, type]), node_voltages, node_static_mask, node_accum (atomic<u32>) ve tx_state.',
      'Pass 1 (pass1_transistor_eval): Her iş parçacığı bir MOSFET’in iletim durumunu hesaplar, tx_state dizisine yazar ve iletim varsa kaynak/drain maskelerini atomicOr ile node_accum’a işler.',
      'Pass 2 (pass2_voltage_resolve): Her düğüm için atomicExchange(&node_accum[id], 0u) ile biriken maskeyi sıfırlar, statik ray/pull maskesiyle birleştirip 0u..5u GPU voltajını kesinleştirir.',
    ],
    codeSignature:
      'Pass 1: pass1_transistor_eval(@workgroup_size(256)) → Pass 2: pass2_voltage_resolve(@workgroup_size(256))',
  },
  {
    title: '4. WebGL2 Instanced + Silikon Kalıp LOD Çizimi',
    subtitle: 'Tek Draw Call · Dinamik Ayrıntı Düzeyi (LOD)',
    bullets: [
      'WebGLInstancedRenderer, tüm bileşenleri INSTANCE_FLOAT_STRIDE = 7 (28 bayt/örnek) özniteliğiyle tek gl.drawArraysInstanced çağrısında çizer.',
      'Bağlantı kabloları WIRE_VERTEX_FLOAT_STRIDE = 3 özniteliğiyle toplu gl.LINES tamponunda GPU üzerinde dönüştürülür.',
      'Ayrıntılı 2B şematik katman yalnızca zoom >= 0.35 (LOD_ZOOM_THRESHOLD) ve bileşen sayısı <= 5000 (HYBRID_2D_MAX_COMPONENTS) iken aktiftir; uzaklaştıkça veya 1M+ transistörde akım yoğunluğu termal LOD haritasına geçilir.',
    ],
    codeSignature:
      'LOD_ZOOM_THRESHOLD = 0.35 · HYBRID_2D_MAX_COMPONENTS = 5000 · INSTANCE_FLOAT_STRIDE = 7',
  },
] as const;

export interface ComputeBackendTierDoc {
  tier: number;
  backend: ComputeBackendType;
  trigger: string;
  mechanism: string;
}

export const COMPUTE_BACKENDS: readonly ComputeBackendTierDoc[] = [
  {
    tier: 1,
    backend: 'Native Vulkan/DX12/CUDA (Tauri)',
    trigger: 'window.__TAURI_INTERNALS__ mevcutsa',
    mechanism:
      'Rust wgpu 24 üzerinden donanımsal Vulkan veya DirectX 12 compute pipeline ile WGSL shader çalıştırır; Rayon çok çekirdekli desteği içerir.',
  },
  {
    tier: 2,
    backend: 'WebGPU (WGSL Compute)',
    trigger: 'navigator.gpu destekleniyorsa',
    mechanism:
      'Tarayıcı içinde GPUBuffer’lar üzerinde Two-Pass WGSL Compute Shader (256 thread/workgroup) ile milyon transistör paralel değerlendirmesi yapar.',
  },
  {
    tier: 3,
    backend: 'SharedArrayBuffer Worker',
    trigger: 'COOP/COEP aktif ve SharedArrayBuffer varsa',
    mechanism:
      'Ana iş parçacığı ile simWorker.ts arasında netValues ve txState tamponlarını kilit-ücretsiz (zero-copy) SharedArrayBuffer üzerinden paylaşır.',
  },
  {
    tier: 4,
    backend: 'CPU Fallback (SoA Worker)',
    trigger: 'Evrensel tarayıcı yedeği',
    mechanism:
      'Çift tamponlu transferable ArrayBuffer kullanan Web Worker ve yerel Switch-Island SoA motoru ile tüm cihazlarda çalışır.',
  },
] as const;

// ---------------------------------------------------------------------------
// Section 7: Klavye Kısayolları, Araçlar & SSS
// ---------------------------------------------------------------------------

export interface ShortcutDoc {
  keys: readonly string[];
  description: string;
  category: 'Bileşen' | 'Düzenleme' | 'Görünüm & Yardım';
}

export const SHORTCUT_REFERENCE: readonly ShortcutDoc[] = [
  {
    keys: ['1', '–', '0'],
    description:
      'Hızlı bileşen seçimi: 1:NMOS, 2:PMOS, 3:PU, 4:PD, 5:VCC, 6:GND, 7:SW, 8:BTN, 9:LED, 0:MAT',
    category: 'Bileşen',
  },
  {
    keys: ['R'],
    description: 'Seçili bileşeni veya bloğu 90° saat yönünde döndür',
    category: 'Düzenleme',
  },
  {
    keys: ['Ctrl', 'C'],
    description: 'Seçili açık transistör bloğunu ve iç kablolarını kopyala',
    category: 'Düzenleme',
  },
  {
    keys: ['Ctrl', 'V'],
    description: 'Panodaki devreyi +40px ofsetle yapıştır',
    category: 'Düzenleme',
  },
  {
    keys: ['Ctrl', 'D'],
    description: 'Seçili devreyi doğrudan çoğalt (+40px)',
    category: 'Düzenleme',
  },
  {
    keys: ['Ctrl', 'Z'],
    description: 'Son işlemi geri al (100 adımlık geçmiş)',
    category: 'Düzenleme',
  },
  {
    keys: ['Ctrl', 'Y'],
    description: 'İleri al (veya Ctrl+Shift+Z)',
    category: 'Düzenleme',
  },
  {
    keys: ['Del', '/', 'Backspace'],
    description: 'Seçili bileşenleri ve bağlı kablolarını sil',
    category: 'Düzenleme',
  },
  {
    keys: ['F'],
    description: 'Tüm devreyi ekrana sığdır (Fit-to-View)',
    category: 'Görünüm & Yardım',
  },
  {
    keys: ['Esc'],
    description: 'Aktif bileşen yerleştirmeyi, kablo çizimini veya seçimi iptal et',
    category: 'Görünüm & Yardım',
  },
  {
    keys: ['?'],
    description: 'Simülatör içi hızlı Mimari Kılavuz & Kısayol penceresini aç',
    category: 'Görünüm & Yardım',
  },
] as const;

export interface PowerToolDoc {
  title: string;
  badge: string;
  description: string;
}

export const POWER_TOOLS: readonly PowerToolDoc[] = [
  {
    title: 'Sürükle-Bırak JSON İçe Aktarım',
    badge: 'Drag & Drop',
    description:
      'Herhangi bir CircuitDocument v1 (.json) dosyasını doğrudan simülatör tuvalinin üzerine sürükleyip bırakarak anında yükleyebilirsiniz. Şema hatası varsa toast uyarısı gösterilir.',
  },
  {
    title: '×10 / ×100 / ×1000 Matris Çoğaltma',
    badge: '2D Silikon Dizisi',
    description:
      'Sağ Denetim Paneli veya üstteki Sahne & Matris menüsü üzerinden seçili açık transistör bloğunu çakışmayan 2D silikon kalıp ızgarası halinde ×10, ×100 veya ×1000 kez kopyalayın.',
  },
  {
    title: 'Benchmark / Chip Generator',
    badge: '10K → 1M+ TX',
    description:
      'Tek tıkla 10.000, 100.000, 250.000 veya 1.000.000+ saf CMOS NAND ve Ring Oscillator içeren VLSI stres test yongaları üretin ve 150k TPS hedefine kadar gerçek zamanlı ölçün.',
  },
  {
    title: 'Canlı Prob & Çift Kablo Stili',
    badge: '90° / Bezier',
    description:
      'Fareyle herhangi bir tel veya pin üzerine geldiğinizde ProbeTooltip üzerinden anlık LogicValue (0..5) ve Net ID bilgisini okuyun; kabloları 90° Ortogonal veya Bezier olarak görüntüleyin.',
  },
] as const;

export interface FaqItemDoc {
  question: string;
  tag: string;
  answer: string;
}

export const FAQ_ITEMS: readonly FaqItemDoc[] = [
  {
    question: 'Kırmızı "Kısa Devre (ERR)!" uyarısı neden çıkar ve nasıl giderilir?',
    tag: 'ERR (5)',
    answer:
      'Aynı elektriksel düğüme hem güçlü HIGH (VCC veya 1 olan anahtar) hem de güçlü LOW (GND veya 0 olan anahtar) aynı anda bağlandığında ERR oluşur. Sık yapılan hata, bir NMOS transistörü PULL_UP yerine doğrudan VCC ile GND arasına bağlamaktır. Tamamlayıcı CMOS (üstte PMOS, altta NMOS) veya yük olarak PULL_UP direnci kullanın.',
  },
  {
    question: 'Gri kesik çizgili Z düğümü MOSFET kapısını neden tetiklemiyor?',
    tag: 'Floating Z',
    answer:
      'LogicValue.Z (0) yüksek empedanslı yüzen düğümdür ve hiçbir NMOS/PMOS kapısını iletime sokmaz. Çıkışı açık devre kalan bir NMOS devresine PULL_UP ekleyin ya da boşta kalabilen kapı girişlerini PULL_DOWN ile referanslayın.',
  },
  {
    question: 'Ring Oscillator devrem neden kendi kendine salınmıyor?',
    tag: 'Osilatör',
    answer:
      'Kapalı geri besleme halkasında çift sayıda (2 veya 4) evirici varsa devre iki kararlı durumdan birine (Latch) kilitlenir. Salınım için mutlaka tek sayıda (3 veya 5) evirici kullanın ve üst araç çubuğunda simülasyonun "Başlat" (aktif) konumda olduğundan emin olun.',
  },
  {
    question: 'SharedArrayBuffer Worker neden her ortamda aktif olmuyor?',
    tag: 'COOP / COEP',
    answer:
      'Tarayıcılar güvenlik politikası gereği SharedArrayBuffer için sunucudan Cross-Origin-Opener-Policy: same-origin ve Cross-Origin-Embedder-Policy: credentialless başlıklarını ister. Bu başlıklar yoksa motor otomatik olarak WebGPU veya CPU Fallback (SoA Worker) moduna geçer; simülasyon doğruluğu etkilenmez.',
  },
  {
    question: 'Neden Switch ve Butonlarda 0–9, F veya R tuşlarını kullanmamalıyım?',
    tag: 'keyBinding',
    answer:
      '0–9 rakamları bileşen paletindeki araçları seçer, F tuşu devreyi ekrana sığdırır, R tuşu ise seçili bileşenleri 90° döndürür. Çakışma yaşamamak için keyBinding olarak A, B, C, D, E, S, W, X, Z veya Space tuşlarını tercih edin.',
  },
] as const;
