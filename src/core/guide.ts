// Baskı asistanı: ayar el kitabı, sorun çözücü ve model analizi. Adlar Bambu Studio / Orca / Cura / PrusaSlicer karşılıklarıyla.
import { partColors, triColor, world, type Built } from './kernel';

export interface Setting { id: string; group: string; name: string; aka: string; what: string; up: string; down: string; typical: string; tip?: string }
export const SETTINGS: Setting[] = [
  { id: 'layer', group: 'Kalite', name: 'Katman yüksekliği', aka: 'Layer height', what: 'Her katmanın kalınlığı. Modelin yüzey pürüzsüzlüğünü ve baskı süresini en çok bu belirler.', up: 'Daha hızlı ve güçlü (katmanlar arası bağ iyi), basamaklar belirgin.', down: 'Eğik ve yuvarlak yüzeyler pürüzsüz, süre uzar.', typical: '0.4 meme: 0.12 (ince) · 0.20 (standart) · 0.28 (hızlı). Meme çapının %25–75’i.', tip: 'Yazı ve ince detay varsa 0.12–0.16 seç.' },
  { id: 'first', group: 'Kalite', name: 'İlk katman yüksekliği', aka: 'Initial layer height', what: 'Tablaya yapışan ilk katman.', up: 'Tabladaki küçük eğrilikleri tolere eder, yapışma artar.', down: 'Alt yüzey daha keskin ama tabla ayarı kusursuz olmalı.', typical: '0.20–0.28' },
  { id: 'walls', group: 'Dayanım', name: 'Duvar sayısı', aka: 'Wall loops / Perimeters', what: 'Dış kabuğun kaç çizgi kalınlığında olacağı. Dayanıma dolgudan daha çok katkı sağlar.', up: 'Çok daha sağlam, vida deliği tutar, su geçirmez.', down: 'Hızlı ve hafif.', typical: '2 (dekor) · 3–4 (fonksiyonel) · 5+ (vida/yük)', tip: 'Dayanım için önce duvarı artır, sonra dolguyu.' },
  { id: 'topbot', group: 'Dayanım', name: 'Üst / alt katman sayısı', aka: 'Top/Bottom shell layers', what: 'Dolgunun üstünü ve altını kapatan dolu katmanlar.', up: 'Üst yüzeyde delik ve dolgu izi kalmaz.', down: 'Malzeme tasarrufu ama üstte “yastıklanma” görülebilir.', typical: 'Üst 4–5, alt 3–4 (0.2 katmanda ≈ 0.8–1 mm)' },
  { id: 'infill', group: 'Dayanım', name: 'Dolgu yoğunluğu', aka: 'Sparse infill density', what: 'İç boşluğun yüzde kaçının dolu olacağı.', up: 'Ağır ve sağlam, süre ve malzeme artar.', down: 'Hafif ve hızlı.', typical: '%10–15 dekor · %20–30 fonksiyonel · %40+ yük', tip: '%50’nin üstü çoğu zaman gereksiz: duvar sayısını artırmak daha verimli.' },
  { id: 'pattern', group: 'Dayanım', name: 'Dolgu deseni', aka: 'Infill pattern', what: 'İç doku biçimi.', up: '—', down: '—', typical: 'Gyroid: her yöne eşit, sessiz. Grid / Cubic: hızlı ve sağlam. Lightning: yalnız üst yüzeyi taşır, en hızlı.', tip: 'Esnek (TPU) baskıda gyroid ya da concentric seç.' },
  { id: 'nozzle', group: 'Sıcaklık', name: 'Meme sıcaklığı', aka: 'Nozzle temperature', what: 'Filamentin eridiği sıcaklık.', up: 'Katmanlar daha iyi kaynar, parlak yüzey; ip çekme ve sarkma artar.', down: 'İp çekme azalır, detay keskinleşir; katman ayrılması ve tıkanma riski.', typical: 'PLA 200–220 · PETG 230–250 · ABS/ASA 250–270 · TPU 220–235', tip: 'Yeni filamentte sıcaklık kulesi basıp en iyisini seç.' },
  { id: 'bed', group: 'Sıcaklık', name: 'Tabla sıcaklığı', aka: 'Bed temperature', what: 'İlk katmanın yapışmasını ve çarpılmayı belirler.', up: 'Yapışma artar; PLA’da alt köşelerde “fil ayağı” olabilir.', down: 'Parça kolay çıkar; çarpılma ve kalkma riski.', typical: 'PLA 55–65 · PETG 70–80 · ABS/ASA 90–110 · TPU 35–50' },
  { id: 'fan', group: 'Sıcaklık', name: 'Parça soğutma fanı', aka: 'Part cooling fan', what: 'Basılan çizgiyi hemen soğutur.', up: 'Çıkıntı, köprü ve detay düzgün; katman bağı zayıflar, ABS çatlar.', down: 'Katmanlar daha güçlü kaynar; çıkıntılar sarkar.', typical: 'PLA %100 · PETG %30–60 · ABS/ASA %0–20 (kapalı kasa)' },
  { id: 'speed', group: 'Hız', name: 'Baskı hızı', aka: 'Print speed', what: 'Memenin ilerleme hızı. Asıl sınır memenin saniyede eritebildiği hacimdir.', up: 'Süre kısalır; yüzey kalitesi ve katman bağı düşebilir, titreşim izleri artar.', down: 'Daha temiz yüzey ve keskin köşe.', typical: 'Dış duvar 150–200 · iç duvar 250–300 · dolgu 250+ (Bambu, PLA). Eski yazıcılarda 40–80.', tip: 'Dış duvar hızını düşürmek, kaliteyi süreye en az etkiyle artırır.' },
  { id: 'flow', group: 'Hız', name: 'Akış oranı', aka: 'Flow ratio / Extrusion multiplier', what: 'Yazıcının ittiği filamentin hesaplanana oranı.', up: 'Boşluk kalmaz; fazlası yüzeyde fazlalık ve ölçü büyümesi.', down: 'Ölçüler hassas; azı üst yüzeyde boşluk ve zayıf parça.', typical: '0.95–1.0 (filamente göre kalibre et)' },
  { id: 'retract', group: 'Hız', name: 'Geri çekme', aka: 'Retraction length / speed', what: 'Boşluktan geçerken filamenti biraz geri çeker, sızmayı keser.', up: 'İp çekme azalır; fazlası tıkanma ve boşluk yapar.', down: 'Tıkanma riski azalır; ip çekme artar.', typical: 'Direct drive 0.5–1 mm · Bowden 4–6 mm · hız 30–45 mm/s' },
  { id: 'support', group: 'Destek', name: 'Destek', aka: 'Support', what: 'Havada kalan kısımları (çıkıntı, köprü) baskı sırasında taşır.', up: '—', down: '—', typical: 'Ağaç (tree): az iz, kolay sökülür, organik şekiller. Normal: düz ve geniş tavanlar.', tip: 'Önce parçayı döndürerek desteğe gerek kalmayan bir yön ara.' },
  { id: 'angle', group: 'Destek', name: 'Destek eşik açısı', aka: 'Threshold angle / Overhang angle', what: 'Yatayla arasındaki açı bu değerden küçük yüzeylere destek konur.', up: 'Daha çok destek, daha temiz alt yüzey.', down: 'Daha az destek; yatık yüzeyler sarkabilir.', typical: '30–45°. Çoğu yazıcı 45° çıkıntıyı desteksiz basar.' },
  { id: 'zgap', group: 'Destek', name: 'Destek üst Z mesafesi', aka: 'Top Z distance', what: 'Destek ile parça arasındaki dikey boşluk.', up: 'Destek kolay ayrılır; alt yüzey pürüzlü.', down: 'Alt yüzey temiz; destek zor sökülür.', typical: 'PLA 0.2 (katman kadar) · PETG 0.25–0.3', tip: 'Arayüz malzemesi olarak farklı filament (ör. PETG üstüne PLA) çok temiz sonuç verir.' },
  { id: 'iface', group: 'Destek', name: 'Destek arayüz katmanı', aka: 'Support interface', what: 'Desteğin parçaya değen yoğun üst katmanları.', up: 'Desteklenen yüzey düzgün.', down: 'Sökmesi kolay.', typical: '2–3 katman, aralık 0.2–0.5 mm' },
  { id: 'brim', group: 'Yapışma', name: 'Kenar (brim)', aka: 'Brim', what: 'İlk katmanın çevresine eklenen ince etek. Tabla tutuşunu artırır.', up: 'Çarpılma ve devrilme azalır; sökmesi uğraştırır.', down: 'Temiz alt kenar.', typical: 'Uzun ince parça, küçük temas alanı, ABS/ASA: 5–8 mm', tip: 'Brim-ear: yalnız köşelere küçük diskler.' },
  { id: 'seam', group: 'Kalite', name: 'Dikiş yeri', aka: 'Seam position', what: 'Her katmanın başladığı ve bittiği nokta; küçük bir iz bırakır.', up: '—', down: '—', typical: 'Arka (back) ya da hizalı (aligned): iz tek çizgide toplanır. Rastgele: dağılır ama yüzey pürüzlenir.' },
  { id: 'ironing', group: 'Kalite', name: 'Ütüleme', aka: 'Ironing', what: 'Üst yüzeyin üzerinden sıcak memeyle az akışla tekrar geçer.', up: 'Cam gibi düz üst yüzey; süre uzar.', down: '—', typical: 'Yalnız düz üst yüzeyler, akış %10–15' },
  { id: 'prime', group: 'Çok renk', name: 'Temizleme kulesi', aka: 'Prime / Wipe tower', what: 'Renk değişiminde memedeki eski rengin döküldüğü kule.', up: 'Renkler karışmaz.', down: 'Malzeme tasarrufu ama renk lekeleri.', typical: 'Açık. Hacmi filament değişim ayarından gelir.', tip: 'Renk değişimini azaltmak için renkli kısmı az katmana topla (ör. yalnız üst 1 mm renkli).' },
  { id: 'flush', group: 'Çok renk', name: 'Yıkama hacmi', aka: 'Flushing volumes', what: 'Bir renkten diğerine geçerken atılan malzeme.', up: 'Temiz renk; atık artar.', down: 'Az atık; koyu → açık geçişte leke.', typical: 'Koyudan açığa yüksek (≈500–800 mm³), açıktan koyuya düşük.', tip: '“Nesneye yıka” (flush into infill) açıksa atık dolguya gider.' },
  { id: 'xy', group: 'Ölçü', name: 'XY delik / kontur telafisi', aka: 'X-Y hole/contour compensation', what: 'Deliklerin içe, dış konturların dışa doğru büyüme eğilimini düzeltir.', up: 'Delikler büyür (pozitif değer).', down: 'Delikler küçülür.', typical: '0 ile 0.1 mm. Önce Baseline’daki tolerans testiyle ölç.', tip: 'Geçme parçalarda tasarımda 0.2 mm boşluk bırakmak çoğu yazıcıda yeterli.' },
  { id: 'elephant', group: 'Ölçü', name: 'Fil ayağı telafisi', aka: 'Elephant foot compensation', what: 'İlk katmanın ezilip dışa taşmasını içe alır.', up: 'Alt kenar düzgün.', down: '—', typical: '0.1–0.2 mm' },
];

export interface Problem { id: string; name: string; looks: string; fixes: string[]; settings: string[] }
export const PROBLEMS: Problem[] = [
  { id: 'adhesion', name: 'İlk katman tutmuyor / parça kalkıyor', looks: 'Çizgiler tablaya yapışmaz, köşeler kalkar ya da baskı ortada kopar.', fixes: ['Tablayı izopropil alkolle sil; parmak yağı en sık neden.', 'Tabla sıcaklığını 5 °C artır.', 'İlk katman hızını düşür (30–50 mm/s).', 'Brim ekle (5–8 mm).', 'Z-ofset / otomatik seviyelemeyi tekrar yap.'], settings: ['bed', 'first', 'brim'] },
  { id: 'warp', name: 'Köşeler yukarı kıvrılıyor (çarpılma)', looks: 'Alt köşeler tabladan ayrılır, uzun parçalar muz gibi bükülür.', fixes: ['Brim ya da köşe diskleri ekle.', 'ABS/ASA ise fanı kapat, kapalı kasa kullan, ortam cereyanını kes.', 'Tabla sıcaklığını artır.', 'Keskin köşeleri tasarımda yuvarlat (Baseline’da köşe yarıçapı).'], settings: ['brim', 'bed', 'fan'] },
  { id: 'stringing', name: 'İp çekme (örümcek ağı)', looks: 'Ayrı parçalar arasında ince plastik teller.', fixes: ['Meme sıcaklığını 5–10 °C düşür.', 'Filamenti kurut (PETG ve TPU nemi çok çeker).', 'Geri çekmeyi biraz artır.', 'Boşlukta gezinme hızını artır.'], settings: ['nozzle', 'retract'] },
  { id: 'overhang', name: 'Çıkıntılar sarkıyor / alt yüzey bozuk', looks: 'Eğik ya da havadaki kısımların altı dalgalı, sarkık.', fixes: ['Fanı artır.', 'Destek aç ya da eşik açısını yükselt.', 'Parçayı döndür: çıkıntı yukarı baksın ya da tabla üstüne gelsin.', 'Tasarımda 45° pah kullan: desteksiz basılır.', 'Baseline’da “Destek gereken yerler” ile kontrol et.'], settings: ['fan', 'support', 'angle'] },
  { id: 'layers', name: 'Katmanlar ayrılıyor / parça kolay kırılıyor', looks: 'Katman hattından çatlar ya da elle kırılır.', fixes: ['Meme sıcaklığını artır.', 'Fanı azalt (özellikle PETG, ABS).', 'Duvar sayısını artır.', 'Parçayı yük katmanlara paralel olacak şekilde döndür.'], settings: ['nozzle', 'fan', 'walls'] },
  { id: 'under', name: 'Eksik akış / boşluklu yüzey', looks: 'Çizgiler arasında boşluk, ince ve zayıf duvarlar.', fixes: ['Meme kısmen tıkalı olabilir: temizle ya da soğuk çekme yap.', 'Hızı düşür (eritme sınırı aşılıyor olabilir).', 'Akış oranını kalibre et.', 'Filament çapını ve makarayı kontrol et (sıkışma).'], settings: ['flow', 'speed', 'nozzle'] },
  { id: 'over', name: 'Fazla akış / ölçüler büyük', looks: 'Yüzeyde fazlalık, üst yüzey pürüzlü, parçalar birbirine geçmiyor.', fixes: ['Akış oranını düşür.', 'XY kontur telafisini negatif yap.', 'Geçme parçalarda tasarım boşluğunu artır (Baseline belge parametresi “tolerans”).'], settings: ['flow', 'xy'] },
  { id: 'elephant', name: 'Alt kenar dışa taşmış (fil ayağı)', looks: 'İlk birkaç katman parçadan geniş.', fixes: ['Fil ayağı telafisini aç (0.15 mm).', 'Tabla sıcaklığını düşür.', 'Z-ofseti biraz yükselt.', 'Tasarımda alt kenara 0.4–0.6 mm pah ver (Baseline: Üst / alt kenar pahı efekti).'], settings: ['elephant', 'bed'] },
  { id: 'zits', name: 'Yüzeyde dikiş izi ve sivilceler', looks: 'Dikey çizgi halinde ya da rastgele küçük kabarcıklar.', fixes: ['Dikiş yerini “arka” ya da “hizalı” yap.', 'Sıcaklığı biraz düşür.', 'Filamenti kurut.'], settings: ['seam', 'nozzle'] },
  { id: 'ghost', name: 'Köşelerden sonra dalga izi (ghosting)', looks: 'Keskin köşenin hemen yanında tekrar eden ince çizgiler.', fixes: ['Dış duvar hızını ve ivmeyi düşür.', 'Rezonans / titreşim kalibrasyonunu çalıştır.', 'Yazıcının sağlam bir zeminde durduğundan emin ol.'], settings: ['speed'] },
  { id: 'pillow', name: 'Üst yüzeyde delik ve kabarıklık', looks: 'Üst katmanlarda dolgu deseni görünür ya da kabarır.', fixes: ['Üst katman sayısını artır.', 'Dolguyu biraz artır.', 'Fanı artır.', 'Ütüleme aç.'], settings: ['topbot', 'infill', 'ironing'] },
  { id: 'bridge', name: 'Köprü sarkıyor', looks: 'İki ayak arasındaki yatay kısım aşağı sarkar.', fixes: ['Köprü fanını %100 yap, köprü hızını düşür.', 'Köprüyü kısalt ya da tasarımda kemer yap.', 'Gerekirse destek aç.'], settings: ['fan', 'support'] },
  { id: 'fit', name: 'Geçme parçalar olmuyor / menteşe dönmüyor', looks: 'Parçalar birbirine girmez ya da kaynamış gibi yapışık çıkar.', fixes: ['Mekanik bölümünden “Tolerans testi”ni bas: hangi boşluktaki pim dönüyorsa onu kullan.', 'Belgenin “tolerans” değişkenini o değere ayarla; dişli ve geçmeler kendiliğinden güncellenir.', 'Fil ayağı telafisini aç; menteşe boğumlarının dibi kaynamasın.'], settings: ['xy', 'elephant', 'flow'] },
  { id: 'color', name: 'Renkler birbirine karışıyor', looks: 'Açık renkli yerlerde koyu lekeler.', fixes: ['Yıkama hacmini koyudan açığa geçişte artır.', 'Renkleri dolguya yıka.', 'Açık rengi önce basacak şekilde sıra ver.'], settings: ['flush', 'prime'] },
];

export const SUPPORT_GUIDE = [
  ['45° kuralı', 'Yazıcılar dikeyden 45°’ye kadar yatık duvarı desteksiz basar. Daha yatık alt yüzeyler ve havadaki kısımlar destek ister. Baseline’da “Destek gereken yerler” bu yüzeyleri kırmızı gösterir.'],
  ['Önce yön', 'Desteği azaltmanın en etkili yolu parçayı döndürmek: en geniş düz yüzü tablaya koy, kemerler ve delikler yukarı baksın.'],
  ['Tasarımla çöz', 'Yatay delikleri damla biçiminde yap, havadaki çıkıntıların altına 45° pah ver, uzun köprüleri böl. Böylece hiç destek gerekmez.'],
  ['Ağaç mı normal mi', 'Ağaç (tree) destek dallanarak yalnız gereken noktaya uzanır: figür, organik şekil, eğri yüzey için. Normal destek düz ve geniş tavanlarda daha düzgün yüzey verir.'],
  ['Yalnız tabladan', '“Yalnız tabladan destek” (on build plate only) açıkken destek parçanın üstüne basılmaz; iz bırakmaz ama içerdeki çıkıntılar desteksiz kalır.'],
  ['Kolay sökme', 'Üst Z mesafesini bir katman kalınlığı yap, arayüz katmanı ekle. Çok renkli yazıcıda arayüzü farklı malzemeyle basmak sökmeyi çok kolaylaştırır.'],
  ['Destek boyama', 'Dilimleyicide desteği elle boyayıp yalnız gerekli yere koyabilir ya da istemediğin yerde engelleyebilirsin.'],
] as const;

export interface Finding { level: 'ok' | 'warn' | 'bad'; text: string }
export interface Analysis { size: number[]; volume: number; grams: number; minutes: number; overhang: number; footprint: number; floating: number; colors: number; bodies: number; findings: Finding[]; tips: string[] }
/** Belgeyi baskı açısından değerlendirir (PLA, 0.2 mm, %15 dolgu varsayımıyla). */
export function analyze(built: Built[], bed: [number, number] = [256, 256]): Analysis | null {
  const ok = built.filter(b => !b.error), parts = ok.flatMap(b => world(b)).filter(p => !p.hole);
  if (!parts.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], p.positions[i]); hi[k] = Math.max(hi[k], p.positions[i]); }
  let over = 0, foot = 0, total = 0, volume = 0, shell = 0;
  const colors = new Set<string>(), zr = new Map<string, [number, number]>();
  for (const p of parts) {
    partColors(p).forEach(c => colors.add(c));
    const P = p.positions, I = p.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, A = Math.hypot(nx, ny, nz) / 2; if (!A) continue;
      total += A; volume += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
      const z = Math.min(P[a + 2], P[b + 2], P[c + 2]), cz = nz / (2 * A);
      const col = triColor(p, t / 3), r = zr.get(col), zt = Math.max(P[a + 2], P[b + 2], P[c + 2]); if (r) { r[0] = Math.min(r[0], z); r[1] = Math.max(r[1], zt); } else zr.set(col, [z, zt]);
      if (cz < -0.99 && z < lo[2] + 0.05) foot += A; else if (cz < -0.7072) over += A;
    }
  }
  shell = total * 0.8; // 2 duvar ≈ 0.8 mm
  const grams = Math.max(0, Math.min(volume, shell) + Math.max(0, volume - shell) * 0.15) * 1.24 / 1000;
  // renk değişimi: yalnız birden çok rengin bulunduğu katmanlarda (≈ 50 sn)
  let swaps = 0; for (let z = lo[2] + 0.1; z < hi[2]; z += 0.2) { let n = 0; for (const [q0, q1] of zr.values()) if (z >= q0 && z <= q1) n++; swaps += Math.max(0, n - 1); }
  const minutes = grams * 1.6 + (hi[2] - lo[2]) / 0.2 * 0.05 + swaps * 0.8;
  const floating = ok.filter(b => { const w = world(b).filter(p => !p.hole); let m = Infinity; for (const p of w) for (let i = 2; i < p.positions.length; i += 3) m = Math.min(m, p.positions[i]); return m > lo[2] + 0.05 && m < Infinity; }).length;
  const size = [0, 1, 2].map(k => hi[k] - lo[k]), F: Finding[] = [], tips: string[] = [];
  if (size[0] > bed[0] || size[1] > bed[1]) F.push({ level: 'bad', text: `Tablaya sığmıyor: ${size[0].toFixed(0)} × ${size[1].toFixed(0)} mm (tabla ${bed[0]} × ${bed[1]}). Parçayı böl ya da döndür.` });
  if (lo[2] < -0.05) F.push({ level: 'bad', text: 'Bir kısım tablanın altında kalıyor: “Tablaya oturt”a bas.' });
  if (floating) F.push({ level: 'warn', text: `${floating} nesne havada duruyor; tablaya değmiyor. Bilerek değilse “Tablaya oturt”.` });
  const oa = over / total;
  if (oa > 0.08) F.push({ level: 'warn', text: `Yüzeyin %${Math.round(oa * 100)}’i 45°’den yatık (${Math.round(over)} mm²): destek gerekir. Kırmızı gösterimi aç, parçayı döndürmeyi dene.` });
  else if (oa > 0.005) F.push({ level: 'ok', text: `Küçük çıkıntılar var (%${Math.round(oa * 100)}). Ağaç destek ya da fan yeterli olabilir.` });
  else F.push({ level: 'ok', text: 'Desteğe gerek görünmüyor.' });
  const ratio = (size[2]) / Math.max(1, Math.sqrt(foot));
  if (foot < 40) F.push({ level: 'warn', text: `Tablaya değen alan küçük (${Math.round(foot)} mm²). Brim ekle.` });
  if (ratio > 4 && size[2] > 40) F.push({ level: 'warn', text: 'Uzun ve ince: sallanıp devrilebilir. Brim ekle, hızı düşür ya da yatır.' });
  if (colors.size > 1) F.push({ level: 'ok', text: `${colors.size} renk: temizleme kulesi ve yıkama hacmi süreye eklenir.` });
  tips.push(size[2] < 15 && oa < 0.01 ? 'Katman: 0.16–0.20 mm. Alçak ve düz parça; ince katman süreyi az uzatır.' : 'Katman: 0.20 mm standart; yuvarlak yüzey çoksa 0.12–0.16.');
  tips.push(oa > 0.08 ? 'Destek: ağaç (tree), eşik 40°, üst Z mesafesi 0.2 mm.' : 'Destek: kapalı.');
  if (foot < 200 || ratio > 3) tips.push('Yapışma: 5 mm brim.');
  tips.push('Dayanım: dekor için 2 duvar %10–15 gyroid; fonksiyonel parçada 3–4 duvar %20–25.');
  if (colors.size > 1) tips.push('Çok renk: renkli kısmı az katmanda toplarsan baskı çok kısalır.');
  return { size, volume, grams, minutes, overhang: over, footprint: foot, floating, colors: colors.size, bodies: ok.length, findings: F, tips };
}
