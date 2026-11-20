import type { CircuitDocument } from '../types/circuit';
import { parseAndValidateCircuitDocument } from '../store/circuitStore';

export type ProjectCategory =
  | 'Temel Mantık Kapıları'
  | 'Saat & Osilatörler'
  | 'Bellek & Sıralı Devreler'
  | 'Aritmetik & Çoklayıcı'
  | 'Ekran & Çıkış';

export type ProjectDifficulty = 'Başlangıç' | 'Orta' | 'İleri';

export interface ExampleProjectMeta {
  id: string;
  order: number;
  filename: string;
  jsonPath: string;
  title: string;
  subtitle: string;
  category: ProjectCategory;
  difficulty: ProjectDifficulty;
  transistorCount: number;
  componentCount: number;
  wireCount: number;
  defaultClockHz: number;
  description: string;
  howItWorks: string;
  controlsHint: string;
  tags: string[];
}

export const EXAMPLE_PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  'Temel Mantık Kapıları',
  'Saat & Osilatörler',
  'Bellek & Sıralı Devreler',
  'Aritmetik & Çoklayıcı',
  'Ekran & Çıkış',
] as const;

export const EXAMPLE_PROJECTS: readonly ExampleProjectMeta[] = [
  {
    id: '01-cmos-inverter-not',
    order: 1,
    filename: '01-cmos-inverter-not.json',
    jsonPath: '/projects/01-cmos-inverter-not.json',
    title: 'CMOS NOT Kapısı (İnverter)',
    subtitle: '2 Transistörlü Tamamlayıcı Çift (1 PMOS + 1 NMOS)',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Başlangıç',
    transistorCount: 2,
    componentCount: 7,
    wireCount: 7,
    defaultClockHz: 6,
    description:
      'Dijital elektroniğin en temel yapı taşı: üstte VCC’ye bağlı bir PMOS ve altta GND’ye bağlı bir NMOS transistörün ortak kapı (Gate) ve ortak çıkış (Drain) düğümünde birleşmesiyle oluşan sıfır-statik-akımlı NOT kapısı.',
    howItWorks:
      'Giriş A=0 olduğunda üstteki PMOS iletime geçerek çıkışı VDD (HIGH) seviyesine çekerken alttaki NMOS kesimdedir. A=1 olduğunda PMOS kapanır ve NMOS açılarak çıkışı VSS (LOW) seviyesine indirir.',
    controlsHint: 'A anahtarına tıklayın veya klavyeden [A] tuşuna basarak giriş/çıkış terslemesini gözlemleyin.',
    tags: ['CMOS', 'NOT', 'Inverter', '2T', 'Başlangıç'],
  },
  {
    id: '02-cmos-nand-and',
    order: 2,
    filename: '02-cmos-nand-and.json',
    jsonPath: '/projects/02-cmos-nand-and.json',
    title: 'CMOS NAND & AND Kapısı',
    subtitle: '4T Evrensel NAND Çekirdeği + 2T CMOS İnverter',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Başlangıç',
    transistorCount: 6,
    componentCount: 14,
    wireCount: 17,
    defaultClockHz: 6,
    description:
      'Paralel bağlı 2 PMOS çekme ağı ve seri bağlı 2 NMOS indirme ağından oluşan 4T CMOS NAND kapısı ile çıkışına eklenen 2T inverter sayesinde hem NAND (amber) hem AND (cyan) çıkışını aynı anda üreten 6 transistörlü devre.',
    howItWorks:
      'Yalnızca A=1 ve B=1 olduğunda seri N1–N2 yolu toprağa iletim sağlar ve NAND=0, AND=1 olur. Diğer üç durumda paralel PMOS dallarından en az biri çıkışı VCC’ye taşır (NAND=1, AND=0).',
    controlsHint: '[A] ve [B] anahtarları ile 4 doğruluk tablosu durumunu (00, 01, 10, 11) deneyin.',
    tags: ['CMOS', 'NAND', 'AND', '6T', 'Evrensel Kapı'],
  },
  {
    id: '03-cmos-nor-or',
    order: 3,
    filename: '03-cmos-nor-or.json',
    jsonPath: '/projects/03-cmos-nor-or.json',
    title: 'CMOS NOR & OR Kapısı',
    subtitle: '2 Seri PMOS + 2 Paralel NMOS (4T NOR) + 2T İnverter',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Başlangıç',
    transistorCount: 6,
    componentCount: 14,
    wireCount: 17,
    defaultClockHz: 6,
    description:
      'NAND topolojisinin tam ikizi olan CMOS NOR kapısı: üstte 2 seri PMOS, altta 2 paralel NMOS kullanır. Çıkıştaki 2T CMOS inverter ile hem NOR (amber) hem OR (yeşil) lojik seviyelerini üretir.',
    howItWorks:
      'Yalnızca A=0 ve B=0 iken seri P1–P2 transistörlerinin ikisi birden iletir (NOR=1, OR=0). Girişlerden herhangi biri 1 olduğunda ilgili paralel NMOS düğümü toprağa çeker (NOR=0, OR=1).',
    controlsHint: '[A] ve [B] anahtarlarını değiştirerek NOR/OR ikili davranışını test edin.',
    tags: ['CMOS', 'NOR', 'OR', '6T', 'İkiz Topoloji'],
  },
  {
    id: '04-cmos-xor-gate',
    order: 4,
    filename: '04-cmos-xor-gate.json',
    jsonPath: '/projects/04-cmos-xor-gate.json',
    title: 'Saf CMOS XOR Kapısı',
    subtitle: '12 Transistörlü Statik Tamamlayıcı Pull-Up / Pull-Down Ağı',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Orta',
    transistorCount: 12,
    componentCount: 21,
    wireCount: 30,
    defaultClockHz: 6,
    description:
      'Hazır kapı soyutlaması olmadan, A ve B için 2 adet 2T inverter ile üretilen !A/!B sinyallerini kullanan 4 PMOS çekme ağı ve 4 NMOS indirme ağından kurulu tam statik 12T CMOS XOR kapısı.',
    howItWorks:
      'Üst ağdaki (A, !B) ve (!A, B) seri PMOS kolları yalnızca girişler farklıyken (0,1 veya 1,0) çıkışı HIGH yapar. Alt ağdaki (A, B) ve (!A, !B) seri NMOS kolları ise girişler eşitken (1,1 veya 0,0) çıkışı LOW’a çeker.',
    controlsHint: '[A] ve [B] anahtarlarını farklı ve eşit konumlara getirip XOR LED’ini gözlemleyin.',
    tags: ['CMOS', 'XOR', '12T', 'Tamamlayıcı Ağ', 'Aritmetik Temeli'],
  },
  {
    id: '05-ring-oscillator-5stage',
    order: 5,
    filename: '05-ring-oscillator-5stage.json',
    jsonPath: '/projects/05-ring-oscillator-5stage.json',
    title: '5 Kademeli NMOS Halka Osilatör & Dalga Çubuğu',
    subtitle: '5T Geri Beslemeli İnverter Zinciri — Harici Saat Kaynağı Yok',
    category: 'Saat & Osilatörler',
    difficulty: 'Başlangıç',
    transistorCount: 5,
    componentCount: 20,
    wireCount: 20,
    defaultClockHz: 8,
    description:
      'Her biri 1 NMOS transistör ve 1 Pull-Up direncinden oluşan 5 tek sayılı inverter kademesinin halka biçiminde bağlanmasıyla oluşan, kendi saat sinyalini fiziksel yayılım gecikmesinden üreten dalga osilatörü.',
    howItWorks:
      'Tek sayıda (5) tersleme aşaması kapalı döngüde kararlı durum bırakmaz; her tick’te bir kademe anahtarlanarak S1’den S5’e doğru 10 tick periyotlu bir kare dalga yürütür.',
    controlsHint: 'Simülasyon çalışırken S1–S5 renkli LED dalga çubuğunun faz kaymalı salınımını izleyin (önerilen hız: 8 Tick/sn).',
    tags: ['Osilatör', 'Ring Oscillator', 'NMOS', 'Pull-Up', '5T', 'Saat'],
  },
  {
    id: '06-sr-nor-latch',
    order: 6,
    filename: '06-sr-nor-latch.json',
    jsonPath: '/projects/06-sr-nor-latch.json',
    title: '1-Bit SR Bellek Hücresi — CMOS NOR Latch',
    subtitle: 'Çapraz Bağlı 2×4T CMOS NOR Kapısı & Başlatma Pull-Down Direnci',
    category: 'Bellek & Sıralı Devreler',
    difficulty: 'Orta',
    transistorCount: 8,
    componentCount: 17,
    wireCount: 23,
    defaultClockHz: 8,
    description:
      'İki adet 4T CMOS NOR kapısının çıkışlarının birbirinin girişine çapraz bağlanmasıyla 1 bit bilgiyi elektriksel geri besleme döngüsünde tutan kalıcı SR bellek hücresi.',
    howItWorks:
      'SET [S] butonuna basıldığında Q’=0 ve Q=1 olur; buton bırakıldığında Q çıkışı kendi geri beslemesiyle Q’=0 durumunu kilitler. Başlangıçtaki zayıf Pull-Down (Q=0, Q’=1) güçlü CMOS sürüşüyle çatışmasız aşılır.',
    controlsHint: '[S] tuşu (SET) ile biti 1’e yazın, bırakıp tutuşunu görün; [X] tuşu (RESET) ile 0’a sıfırlayın.',
    tags: ['SR Latch', 'Bellek', 'NOR', '8T', 'Push Button', 'Geri Besleme'],
  },
  {
    id: '07-mux-2to1-cmos',
    order: 7,
    filename: '07-mux-2to1-cmos.json',
    jsonPath: '/projects/07-mux-2to1-cmos.json',
    title: '2-to-1 Çoklayıcı — Statik CMOS MUX',
    subtitle: '14 Transistörlü 2T İnverter + 3×4T NAND Yönlendirme Ağı',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'Orta',
    transistorCount: 14,
    componentCount: 26,
    wireCount: 36,
    defaultClockHz: 6,
    description:
      'Seçici sinyal SEL=0 iken D0 hattını, SEL=1 iken D1 hattını çıkış Y’ye yönlendiren; 1 adet 2T inverter ve 3 adet 4T CMOS NAND kapısından kurulu saf transistör çoklayıcı.',
    howItWorks:
      'm0 = NAND(D0, !SEL) ve m1 = NAND(D1, SEL) ara düğümleri seçilmeyen kanalı 1’e maskeler; çıkış katındaki Y = NAND(m0, m1) kapısı ise aktif kanalın değerini doğrudan çıkışa aktarır.',
    controlsHint: '[S] (SEL) ile kanal seçin, [A] (D0) ve [B] (D1) anahtarlarını değiştirerek yalnızca seçili kanalın Y LED’ini sürdüğünü görün.',
    tags: ['MUX', 'Çoklayıcı', 'CMOS', 'NAND', '14T', 'Veri Yönlendirme'],
  },
  {
    id: '08-half-adder-1bit',
    order: 8,
    filename: '08-half-adder-1bit.json',
    jsonPath: '/projects/08-half-adder-1bit.json',
    title: '1-Bit Yarım Toplayıcı — Half Adder',
    subtitle: '12T Statik CMOS XOR (SUM) + 6T CMOS AND (CARRY)',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'Orta',
    transistorCount: 18,
    componentCount: 32,
    wireCount: 46,
    defaultClockHz: 6,
    description:
      'İki tek bitlik sayıyı (A ve B) toplayarak 12 transistörlü statik CMOS XOR devresi üzerinden Toplam (SUM) bitini ve 6 transistörlü CMOS AND devresi üzerinden Elde (CARRY) bitini üreten 18T aritmetik devre.',
    howItWorks:
      'A ve B ortak anahtarları paralel olarak hem 12T XOR çekirdeğini hem de 6T NAND+NOT Carry katını besler. 1+1 durumunda SUM=0 (cyan söner), CARRY=1 (amber yanar) üretilir.',
    controlsHint: '[A] ve [B] anahtarlarıyla ikili toplama (0+0, 0+1, 1+0, 1+1) sonuçlarını SUM ve CARRY LED’lerinden okuyun.',
    tags: ['Half Adder', 'ALU', 'XOR', 'AND', '18T', 'Aritmetik'],
  },
  {
    id: '09-d-latch-gated-memory',
    order: 9,
    filename: '09-d-latch-gated-memory.json',
    jsonPath: '/projects/09-d-latch-gated-memory.json',
    title: 'Saat/Enable Kontrollü D-Latch Bellek',
    subtitle: '18 Transistörlü Şeffaf Veri Yakalama ve Kilitleme Hücresi',
    category: 'Bellek & Sıralı Devreler',
    difficulty: 'İleri',
    transistorCount: 18,
    componentCount: 33,
    wireCount: 48,
    defaultClockHz: 8,
    description:
      'Yalnızca ENABLE (E) hattı 1 iken DATA (D) girişini çıkışa geçiren, ENABLE 0’a düştüğünde ise son veriyi çapraz bağlı 8T NAND latch içinde kilitleyen 18 transistörlü modern D-Latch bellek.',
    howItWorks:
      'ENABLE=1 iken s_bar=NAND(D, EN) ve r_bar=NAND(!D, EN) kapıları veriyi çapraz bağlı Q/Q’ NAND hücresine yazar. ENABLE=0 olduğunda her iki sürme hattı 1’e kilitlenir ve D değişse bile bellek korunur.',
    controlsHint: '[E] (ENABLE) açıkken [D] (DATA) ile yazın; [E]’yi kapatıp [D] değişse bile Q belleğinin korunduğunu gözlemleyin.',
    tags: ['D-Latch', 'Bellek', 'Register', 'NAND', '18T', 'Enable'],
  },
  {
    id: '10-pixel-matrix-decoder-4x4',
    order: 10,
    filename: '10-pixel-matrix-decoder-4x4.json',
    jsonPath: '/projects/10-pixel-matrix-decoder-4x4.json',
    title: '2-to-4 Satır Dekoder & 4×4 Ham Piksel Matrisi',
    subtitle: '28 Transistörlü Adres Çözücü ve Doğrudan Sürmeli 16-Pin Ekran',
    category: 'Ekran & Çıkış',
    difficulty: 'İleri',
    transistorCount: 28,
    componentCount: 55,
    wireCount: 90,
    defaultClockHz: 6,
    description:
      'İki bitlik adres girişini (A1, A0) 2 adet 2T inverter ve 4 adet 6T CMOS AND kapısıyla 4 ayrı satır seçme hattına (Y0–Y3) çözen ve sürücüsüz 4×4 Ham Piksel Matrisinin her bir piksel bacağını (P_y_x) doğrudan süren 28T ekran sistemi.',
    howItWorks:
      '(A1, A0) ikili koduna göre yalnızca Yk = 1 olur (00→Satır 0, 01→Satır 1, 10→Satır 2, 11→Satır 3). Aktif Yk hattı hem durum LED’i Rk’yi hem de matrisin ilgili satırındaki 4 piksel bacağını aynı anda yakar.',
    controlsHint: '[A] (A0) ve [B] (A1) anahtarlarıyla 00, 01, 10, 11 adreslerini tarayarak 4×4 piksel matrisindeki tüm satırları tek tek aydınlatın.',
    tags: ['Dekoder', '2-to-4', 'Pixel Matrix', '4x4', '28T', 'Ekran'],
  },
] as const;

const jsonCache = new Map<string, string>();

export function getExampleProjectById(id: string): ExampleProjectMeta | undefined {
  return EXAMPLE_PROJECTS.find((project) => project.id === id);
}

/**
 * Fetches raw CircuitDocument JSON from `/projects/<filename>` with an in-memory Map cache.
 */
export async function fetchExampleProjectJson(project: ExampleProjectMeta): Promise<string> {
  const cached = jsonCache.get(project.jsonPath);
  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(project.jsonPath);
  if (!response.ok) {
    throw new Error(
      `Proje JSON dosyası yüklenemedi (${project.filename}: HTTP ${response.status}).`,
    );
  }

  const rawJson = await response.text();
  jsonCache.set(project.jsonPath, rawJson);
  return rawJson;
}

/**
 * Fetches and validates an example project's CircuitDocument against PureSilicon schema rules.
 */
export async function fetchExampleProjectDocument(
  project: ExampleProjectMeta,
): Promise<{ ok: true; document: CircuitDocument; rawJson: string } | { ok: false; error: string }> {
  try {
    const rawJson = await fetchExampleProjectJson(project);
    const parsed = parseAndValidateCircuitDocument(rawJson);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    return { ok: true, document: parsed.document, rawJson };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Proje JSON dosyası okunurken beklenmeyen bir hata oluştu.',
    };
  }
}
