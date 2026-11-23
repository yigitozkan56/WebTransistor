import type { CircuitDocument } from '../types/circuit';
import { parseAndValidateCircuitDocument } from '../store/circuitStore';

export type ProjectCategory =
  | 'Temel Mantık Kapıları'
  | 'Saat & Osilatörler'
  | 'Bellek & Sıralı Devreler'
  | 'Aritmetik & Çoklayıcı'
  | 'Ekran & Çıkış'
  | 'Mimari & İşlemci';

export type ProjectDifficulty = 'Başlangıç' | 'Orta' | 'İleri' | 'Uzman';

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
  'Mimari & İşlemci',
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
  {
    id: '11-cmos-xnor-comparator-1bit',
    order: 11,
    filename: '11-cmos-xnor-comparator-1bit.json',
    jsonPath: '/projects/11-cmos-xnor-comparator-1bit.json',
    title: '1-Bit Eşitlik Karşılaştırıcı — CMOS XNOR',
    subtitle: '12T Statik CMOS XOR + 2T İnverter (EQ & NEQ Çıkışı)',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Başlangıç',
    transistorCount: 14,
    componentCount: 20,
    wireCount: 36,
    defaultClockHz: 6,
    description:
      'İki tek bitlik girişin (A ve B) birbirine eşit olup olmadığını saf transistör düzeyinde ölçen 14T CMOS XNOR devresi. Eşitlikte yeşil EQ LED’i, farklılıkta amber NEQ LED’i yanar.',
    howItWorks:
      '12T tamamlayıcı CMOS XOR çekirdeği girişler farklıyken 1 üretir; çıkışına bağlanan 2T CMOS inverter ise A=B (00 veya 11) durumlarında EQ hattını HIGH seviyesine çeker.',
    controlsHint: '[A] ve [B] anahtarlarını eşitleyip ayırarak EQ (yeşil) ve NEQ (amber) göstergelerini gözlemleyin.',
    tags: ['CMOS', 'XNOR', 'Karşılaştırıcı', '14T', 'Eşitlik'],
  },
  {
    id: '12-majority-voter-3input',
    order: 12,
    filename: '12-majority-voter-3input.json',
    jsonPath: '/projects/12-majority-voter-3input.json',
    title: '3 Girişli Çoğunluk Oylayıcı — TMR Majority Voter',
    subtitle: 'Havacılık/Uzay Tipi Hata Toleranslı 18T CMOS Oylama Devresi',
    category: 'Temel Mantık Kapıları',
    difficulty: 'Başlangıç',
    transistorCount: 18,
    componentCount: 24,
    wireCount: 46,
    defaultClockHz: 6,
    description:
      'Üç yedekli kanaldan (A, B, C) en az ikisi 1 olduğunda çıkışı 1 yapan (Y = AB + BC + AC), üçlü modüler yedekleme (TMR) sistemlerinde kullanılan 18 transistörlü CMOS çoğunluk devresi.',
    howItWorks:
      'Üç adet 4T NAND2 kapısı ikili eşleşmeleri (AB, BC, AC) tersler; 6T NAND3 çıkış kapısı De Morgan yasası gereği herhangi bir ikili 1 olduğunda çıkışı HIGH yapar.',
    controlsHint: '[A], [B] ve [C] anahtarlarından herhangi ikisini (veya üçünü) açarak çoğunluk çıkışını test edin.',
    tags: ['Majority Voter', 'TMR', 'NAND3', '18T', 'Hata Toleransı'],
  },
  {
    id: '13-full-adder-1bit',
    order: 13,
    filename: '13-full-adder-1bit.json',
    jsonPath: '/projects/13-full-adder-1bit.json',
    title: '1-Bit Tam Toplayıcı — Full Adder',
    subtitle: '36 Transistörlü Elde Girişli (CIN) Çekirdek Aritmetik Hücresi',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'Orta',
    transistorCount: 36,
    componentCount: 43,
    wireCount: 90,
    defaultClockHz: 6,
    description:
      'A, B ve önceki basamaktan gelen elde (CIN) bitini toplayarak SUM ve COUT çıkışlarını üreten, çok bitli işlemci toplayıcılarının temel yapı taşı olan 36T statik CMOS Full Adder.',
    howItWorks:
      'İki kademeli 12T CMOS XOR zinciri SUM = A ⊕ B ⊕ CIN üretir; 3 adet 4T CMOS NAND2 kapısı ise COUT = AB + CIN·(A ⊕ B) elde mantığını kısa devresiz hesaplar.',
    controlsHint: '[A], [B] ve [C] (CIN) anahtarlarıyla 0..3 arası tüm 8 giriş kombinasyonunu test edin.',
    tags: ['Full Adder', 'ALU', 'Toplama', '36T', 'CMOS'],
  },
  {
    id: '14-demux-1to4-cmos',
    order: 14,
    filename: '14-demux-1to4-cmos.json',
    jsonPath: '/projects/14-demux-1to4-cmos.json',
    title: '1-to-4 Veri Dağıtıcı — CMOS DEMUX',
    subtitle: '36 Transistörlü Adres Kontrollü 4 Kanal Sinyal Yönlendirici',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'Orta',
    transistorCount: 36,
    componentCount: 45,
    wireCount: 94,
    defaultClockHz: 6,
    description:
      'Tek bir veri hattını (DATA), 2-bit adres seçiciye (S1, S0) göre dört ayrı çıkış kanalından (Y0–Y3) yalnızca seçili olana yönlendiren 36 transistörlü saf CMOS demultiplexer.',
    howItWorks:
      '2 adet 2T inverter !S0/!S1 sinyallerini üretir; 4 adet 8T CMOS AND3 kapısı yalnızca kendi adres kombinasyonu eşleştiğinde DATA sinyalini ilgili LED çıkışına geçirir.',
    controlsHint: '[D] ile veri bitini açıp kapatın; [A] (S0) ve [B] (S1) ile aktif hedef kanalı (Y0–Y3) seçin.',
    tags: ['DEMUX', 'Dağıtıcı', 'AND3', '36T', 'Yönlendirme'],
  },
  {
    id: '15-mux-4to1-cmos',
    order: 15,
    filename: '15-mux-4to1-cmos.json',
    jsonPath: '/projects/15-mux-4to1-cmos.json',
    title: '4-to-1 Çoklayıcı — CMOS MUX',
    subtitle: '40 Transistörlü İki Kademeli NAND Çoklama Ağacı',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'Orta',
    transistorCount: 40,
    componentCount: 49,
    wireCount: 101,
    defaultClockHz: 6,
    description:
      'Dört farklı veri kaynağından (D0–D3) birini 2-bit seçici hatları (S1, S0) ile seçip tek çıkış Y’ye aktaran 40T statik CMOS 4:1 multiplexer.',
    howItWorks:
      'İlk kademedeki iki 2:1 MUX (D0/D1 ve D2/D3) ortak S0 hattıyla seçilir; ikinci kademedeki son 2:1 MUX ise S1 hattıyla kazanan kanalı çıkış LED’ine taşır.',
    controlsHint: '[A/B/C/D] ile D0–D3 kanallarını ayarlayın; [S] (S0) ve [T] (S1) ile çıkışta görmek istediğiniz kanalı seçin.',
    tags: ['MUX', '4-to-1', 'Çoklayıcı', '40T', 'CMOS'],
  },
  {
    id: '16-ring-oscillator-7stage-cmos',
    order: 16,
    filename: '16-ring-oscillator-7stage-cmos.json',
    jsonPath: '/projects/16-ring-oscillator-7stage-cmos.json',
    title: '7 Kademeli Saf CMOS Halka Osilatör & Faz Monitörü',
    subtitle: '14 Transistörlü Sıfır Statik Akımlı CMOS Dalga Üreteci',
    category: 'Saat & Osilatörler',
    difficulty: 'Orta',
    transistorCount: 14,
    componentCount: 23,
    wireCount: 42,
    defaultClockHz: 10,
    description:
      'Direnç kullanmadan yalnızca 7 adet tamamlayıcı CMOS inverter (7 PMOS + 7 NMOS) halkasından oluşan, 14 tick periyotlu kendi kendine başlayan (self-kickstart) yüksek kararlılıklı saat osilatörü.',
    howItWorks:
      '7 tek sayılı CMOS tersleme aşaması kapalı halka oluşturur; her yayılım adımında sinyal bir sonraki kademeye terslenerek geçer ve P1–P7 faz LED’lerinde canlı dalga oluşturur.',
    controlsHint: 'Simülasyon çalışırken P1–P7 faz monitörü LED’lerinin 14 tick periyotlu CMOS dalgasını izleyin.',
    tags: ['CMOS', 'Ring Oscillator', '7-Stage', '14T', 'Saat', 'Faz'],
  },
  {
    id: '17-d-flipflop-edge-triggered',
    order: 17,
    filename: '17-d-flipflop-edge-triggered.json',
    jsonPath: '/projects/17-d-flipflop-edge-triggered.json',
    title: 'Kenar Tetiklemeli Master-Slave D Flip-Flop',
    subtitle: '38 Transistörlü Yükselen Saat Kenarı (Rising-Edge) Yazmaç Hücresi',
    category: 'Bellek & Sıralı Devreler',
    difficulty: 'İleri',
    transistorCount: 38,
    componentCount: 47,
    wireCount: 100,
    defaultClockHz: 8,
    description:
      'İki adet 18T CMOS D-Latch’in ters fazlı saatle (Master=CLK’, Slave=CLK) kaskad bağlanmasıyla yalnızca saat yükselen kenarında veri yakalayan gerçek 38T Master-Slave D Flip-Flop.',
    howItWorks:
      'CLK=0 iken Master (QM) veriyi örnekler ama Slave (Q) kilitlidir. CLK=1 yapıldığında Master kilitlenir ve o andaki QM değeri Slave çıkışına (Q/Q’) aktarılır; sonrasında D değişse bile Q etkilenmez.',
    controlsHint: '[D] ile veriyi hazırlayın, [C] (CLK) butonuna basıp bırakarak yükselen kenarda Q çıkışının güncellendiğini görün.',
    tags: ['Flip-Flop', 'Master-Slave', 'Rising Edge', '38T', 'Sıralı Devre'],
  },
  {
    id: '18-2bit-magnitude-comparator',
    order: 18,
    filename: '18-2bit-magnitude-comparator.json',
    jsonPath: '/projects/18-2bit-magnitude-comparator.json',
    title: '2-Bit Büyüklük Karşılaştırıcı (A>B, A=B, A<B)',
    subtitle: '62 Transistörlü İkili Sayı Sıralama ve Karşılaştırma Birimi',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'İleri',
    transistorCount: 62,
    componentCount: 71,
    wireCount: 156,
    defaultClockHz: 6,
    description:
      'İki adet 2-bit işaretsiz sayıyı (A[1:0] ve B[1:0], 0..3) karşılaştırıp A>B (cyan), A=B (yeşil) veya A<B (amber) çıkışlarından tam olarak birini yakan 62T statik CMOS karşılaştırıcı.',
    howItWorks:
      'Önce yüksek anlamlı bitler (A1, B1) karşılaştırılır; eşitlerse düşük anlamlı bitler (A0, B0) devreye girer. Tüm 16 giriş kombinasyonunda yalnızca doğru ilişki LED’i aktif olur.',
    controlsHint: '[A/B] ile A sayısını (A1,A0), [C/D] ile B sayısını (B1,B0) girerek GT/EQ/LT çıkışlarını test edin.',
    tags: ['Comparator', 'Karşılaştırıcı', '2-Bit', '62T', 'ALU'],
  },
  {
    id: '19-4bit-ripple-carry-adder',
    order: 19,
    filename: '19-4bit-ripple-carry-adder.json',
    jsonPath: '/projects/19-4bit-ripple-carry-adder.json',
    title: '4-Bit Ripple-Carry Toplayıcı — 4-Bit Adder',
    subtitle: '144 Transistörlü 4 Kademeli Tam Toplayıcı Zinciri (0..31)',
    category: 'Aritmetik & Çoklayıcı',
    difficulty: 'İleri',
    transistorCount: 144,
    componentCount: 160,
    wireCount: 357,
    defaultClockHz: 8,
    description:
      'Dört adet 36T CMOS Full Adder’ın elde zinciriyle (COUT→CIN) bağlanmasıyla 0..15 arası iki 4-bit sayıyı ve CIN elde girişini toplayıp 5-bit sonuç (S0–S3 + COUT) üreten 144T toplayıcı.',
    howItWorks:
      'Her bit katı kendi A[i], B[i] ve önceki kattan gelen eldeyi hesaplar. Maksimum 15 + 15 + 1 = 31 (COUT=1, S3..S0=1111) toplamı tamamen saf MOSFET anahtarlamasıyla elde edilir.',
    controlsHint: '[A,B,C,D] ile A[0..3], [Q,W,E,T] ile B[0..3] ve [S] ile CIN girip 5-bit ikili toplamı okuyun.',
    tags: ['4-Bit Adder', 'Ripple Carry', 'Full Adder', '144T', 'Aritmetik'],
  },
  {
    id: '20-4bit-parallel-register',
    order: 20,
    filename: '20-4bit-parallel-register.json',
    jsonPath: '/projects/20-4bit-parallel-register.json',
    title: '4-Bit Paralel Yazmaç — 4-Bit Register',
    subtitle: '72 Transistörlü Ortak LOAD/ENABLE Kontrollü Nibble Belleği',
    category: 'Bellek & Sıralı Devreler',
    difficulty: 'İleri',
    transistorCount: 72,
    componentCount: 87,
    wireCount: 188,
    defaultClockHz: 8,
    description:
      'Dört adet 18T CMOS D-Latch hücresinin tek bir LOAD (EN) yazma izni hattıyla senkronize edildiği, 4-bitlik (1 nibble) veriyi aynı anda yakalayıp saklayan 72T işlemci yazmacı.',
    howItWorks:
      'LOAD=1 iken D0–D3 veri anahtarları Q0–Q3 bellek hücrelerine yazılır. LOAD=0 yapıldığında 4 bitin tamamı kilitlenir ve giriş anahtarları değişse de saklanan sayı korunur.',
    controlsHint: '[A,B,C,D] ile 4-bit veriyi ayarlayın, [E] (LOAD) ile yazmaca kilitleyin ve veri değişse bile korunduğunu görün.',
    tags: ['Register', 'Yazmaç', '4-Bit', '72T', 'Bellek', 'CPU'],
  },
  {
    id: '21-3to8-line-decoder-cmos',
    order: 21,
    filename: '21-3to8-line-decoder-cmos.json',
    jsonPath: '/projects/21-3to8-line-decoder-cmos.json',
    title: '3-to-8 Adres Çözücü — 3-to-8 Line Decoder',
    subtitle: '70 Transistörlü 3-Bit İkili Adresten 8 Tek-Aktif (One-Hot) Çıkışa',
    category: 'Ekran & Çıkış',
    difficulty: 'İleri',
    transistorCount: 70,
    componentCount: 83,
    wireCount: 183,
    defaultClockHz: 6,
    description:
      '3-bit ikili adres kodunu (A2, A1, A0) 8 ayrı tek-aktif (one-hot) çıkış hattına (Y0–Y7) çözen; bellek bankası ve çevre birimi adreslemede kullanılan 70T CMOS dekoder.',
    howItWorks:
      '3 adet 2T inverter tüm adres bitlerinin tümleyenini oluşturur; 8 adet 8T CMOS AND3 kapısından her biri yalnızca kendi 0..7 arasındaki ikili kodu eşleştiğinde çıkış LED’ini yakar.',
    controlsHint: '[A] (A0), [B] (A1) ve [C] (A2) anahtarlarıyla 000–111 arası tüm 8 adresi tarayın.',
    tags: ['Dekoder', '3-to-8', 'One-Hot', '70T', 'Adresleme'],
  },
  {
    id: '22-4bit-alu-processor-core',
    order: 22,
    filename: '22-4bit-alu-processor-core.json',
    jsonPath: '/projects/22-4bit-alu-processor-core.json',
    title: '4-Bit İşlemci ALU Çekirdeği (ADD / SUB / AND / XOR + Bayraklar)',
    subtitle: '372 Transistörlü 4 İşlemli CPU Aritmetik-Mantık Birimi & Z/C/N Bayrakları',
    category: 'Mimari & İşlemci',
    difficulty: 'Uzman',
    transistorCount: 372,
    componentCount: 391,
    wireCount: 921,
    defaultClockHz: 12,
    description:
      'Gerçek bir 4-bit işlemci çekirdeğinin kalbi: 2-bit işlem kodu (OP1, OP0) ile Toplama (A+B), İkiye Tümleyen Çıkarma (A-B), Bitsel AND ve Bitsel XOR işlemlerini yapan, ayrıca ZERO (Z), CARRY (C) ve SIGN (N) işlemci bayraklarını üreten 372T saf MOSFET ALU.',
    howItWorks:
      'OP=00 (A+B) ve OP=01 (A-B) modlarında XOR kontrollü B tersleyici + CIN=1 ile 4 kademeli Full Adder aritmetik sonucu üretir. OP=10 (AND) ve OP=11 (XOR) mantık biriminden gelir; 2 kademeli MUX ağı sonucu R0–R3’e seçer, 8T NOR4 kapısı ZERO bayrağını hesaplar.',
    controlsHint: 'A=[A,B,C,D], B=[Q,W,E,T] | İşlem Kodu [X,S] (OP1,OP0): 00=ADD, 01=SUB, 10=AND, 11=XOR.',
    tags: ['Uzman', 'ALU', 'CPU', '4-Bit', '372T', 'Bayraklar', 'Mimari'],
  },
  {
    id: '23-4x4-sram-memory-bank',
    order: 23,
    filename: '23-4x4-sram-memory-bank.json',
    jsonPath: '/projects/23-4x4-sram-memory-bank.json',
    title: '16-Bit (4×4) Adreslenebilir Statik RAM (SRAM) Bellek Bankası',
    subtitle: '484 Transistörlü 4 Kelime × 4-Bit Okuma/Yazma Bellek Çipi',
    category: 'Mimari & İşlemci',
    difficulty: 'Uzman',
    transistorCount: 484,
    componentCount: 517,
    wireCount: 1234,
    defaultClockHz: 12,
    description:
      'Adres çözücü, yazma izni kapılaması, 16 adet CMOS D-Latch bellek hücresi (4 kelime × 4 bit) ve 4 adet 4:1 okuma çoklayıcısından oluşan tam işlevsel 484 transistörlü Statik RAM çipi.',
    howItWorks:
      'ADDR[1:0] dört kelimeden birini (W0–W3) seçer. WRITE (WE)=1 yapıldığında yalnızca seçili kelimenin 4 bellek hücresi DI[0..3] verisini kaydeder; WE=0 iken adresler arasında gezerek saklanan 4 farklı 4-bit sayıyı DO[0..3] çıkışından geri okuyabilirsiniz.',
    controlsHint: 'Veri=[A,B,C,D], Adres=[S,T] (ADDR0,ADDR1), Yazma=[E] (WE). Her adrese farklı sayı yazıp geri okuyun!',
    tags: ['Uzman', 'SRAM', 'RAM', '16-Bit', '484T', 'Bellek Bankası', 'Mimari'],
  },
  {
    id: '24-4bit-array-multiplier',
    order: 24,
    filename: '24-4bit-array-multiplier.json',
    jsonPath: '/projects/24-4bit-array-multiplier.json',
    title: '4×4 Bit Donanımsal Çarpıcı — Hardware Array Multiplier',
    subtitle: '456 Transistörlü 8-Bit (0..225) Kombinasyonel Çarpma Dizisi',
    category: 'Mimari & İşlemci',
    difficulty: 'Uzman',
    transistorCount: 456,
    componentCount: 474,
    wireCount: 1128,
    defaultClockHz: 12,
    description:
      'Saat sinyaline ihtiyaç duymadan 4-bit A (0..15) ve 4-bit B (0..15) sayılarını tek geçişte çarpıp 8-bitlik kesin ikili sonucu P[7:0] (0..225) üzerinde üreten 456T donanımsal Braun çarpıcı dizisi.',
    howItWorks:
      '16 adet 6T CMOS AND kapısı A[i]·B[j] kısmi çarpımlarını paralel üretir; ardından 3 katmanlı Half Adder ve Full Adder dizisi tüm sütunları toplayarak P0–P7 çıkışlarına taşır (örn. 15×15=225 → 11100001).',
    controlsHint: 'A=[A,B,C,D] (0..15) ve B=[Q,W,E,T] (0..15) sayılarını girip P0–P7 LED’lerinden 8-bit çarpımı okuyun.',
    tags: ['Uzman', 'Multiplier', 'Çarpıcı', '8-Bit', '456T', 'ALU', 'Mimari'],
  },
  {
    id: '25-8x8-gpu-pixel-rasterizer',
    order: 25,
    filename: '25-8x8-gpu-pixel-rasterizer.json',
    jsonPath: '/projects/25-8x8-gpu-pixel-rasterizer.json',
    title: '8×8 Ham Piksel GPU Rasterizer & Koordinat Çizici',
    subtitle: '1.292 Transistörlü Çift 3-to-8 Dekoder + 64 Piksel CMOS Tarama Motoru',
    category: 'Mimari & İşlemci',
    difficulty: 'Uzman',
    transistorCount: 1292,
    componentCount: 1302,
    wireCount: 3294,
    defaultClockHz: 20,
    description:
      'WebTransistor’ın en büyük referans çipi: X[2:0] ve Y[2:0] 3-bit koordinatlarını iki 3-to-8 dekoderle çözüp 64 ayrı piksel mantık hücresi üzerinden sürücüsüz 8×8 Piksel Matrisinin 64 fiziksel bacağını doğrudan süren 1.292 transistörlü GPU rasterizer!',
    howItWorks:
      'CROSSHAIR (M)=0 modunda her piksel hücresi Row[r] AND Col[c] hesaplayarak tek bir (X,Y) imleç pikselini yakar. M=1 modunda ise Row[r] OR Col[c] devreye girerek 8×8 ekranda tam nişangâh (yatay + dikey tarama çizgisi) çizer.',
    controlsHint: 'X=[A,B,C] (0..7), Y=[Q,W,E] (0..7), Mod=[M] (0: Tek Piksel İmleç, 1: Nişangâh / Crosshair).',
    tags: ['Uzman', 'GPU', '8x8', 'Pixel Matrix', '1292T', 'Rasterizer', 'Mimari'],
  },
  {
    id: '26-ws16-risc-computer-41k',
    order: 26,
    filename: '26-ws16-risc-computer-41k.json',
    jsonPath: '/projects/26-ws16-risc-computer-41k.json',
    title: '16-Bit RISC Computer (40,980 Transistors)',
    subtitle: '40.980 Ham MOSFET · 16-Bit ALU, 16×16 Register File, 64×16 SRAM, ROM & 8×8 MMIO LCD',
    category: 'Mimari & İşlemci',
    difficulty: 'Uzman',
    transistorCount: 40980,
    componentCount: 43334,
    wireCount: 102470,
    defaultClockHz: 15000,
    description:
      'Hazır mantık kapısı veya siyah kutu IC kullanmadan, yalnızca 20.490 NMOS + 20.490 PMOS (toplam 40.980 ham transistör) ile sentezlenmiş tam teşekküllü 16-bit RISC bilgisayar (WS-16): 16-bit ALU + Barrel Shifter, 16×16-bit çift portlu Register File (R0–R15), PC/IR/SP, Fetch-Decode-Execute FSM, 64×16-bit (1024-bit) CMOS SRAM, 32×16-bit makine kodu ROM ve 8×8 MMIO LCD sürücü!',
    howItWorks:
      'İki fazlı örtüşmesiz (non-overlapping) saat üreteciyle sürülen 3 aşamalı Fetch→Decode→Execute FSM, 32 komutluk gömülü ROM programını çalıştırır. R15 yazmacı fiziksel MODE/DIR anahtarlarını okur: Mod 0’da 8×8 LCD’de yönü değiştirilebilir kayan dalga tarayıcısı çizer; Mod 1’de 16-bit ALU ile gerçek zamanlı Fibonacci dizisini hesaplayıp 64×16 SRAM’e yazar, geri okur ve 8×8 ekranda ikili desen olarak gösterir.',
    controlsHint:
      'AUTO CLK=[A] (Otomatik Saat), STEP CLK=[C] (Tek Adım), RESET=[Z] (Sıfırla), MODE=[M] (0: Kayan Dalga / 1: Fibonacci), DIR=[D] (Sol/Sağ Yön).',
    tags: ['Uzman', '16-Bit', 'RISC', 'CPU', '40980T', 'SRAM', 'ALU', 'LCD', 'Mimari'],
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
