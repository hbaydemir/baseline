# Yapılacaklar

Sıra önemli: yukarıdan aşağı yapılır. [ ] bekliyor, [x] bitti.

## 1. Bölme: kesim düzlemi ve kilitler
- [x] Kesim konumu ve açısı: kaydırıcı, sayı ve hazır yönler; açık önizlemede iki yarı ayrılarak görünür
- [ ] Sahnede tutup sürüklenen yarı saydam kesim düzlemi
- [x] Hazır yönler: yatay, dikey X, dikey Y, çapraz 45°
- [x] Önizleme: iki yarı aralarında boşlukla ayrılır
- [ ] İki yarı önizlemede farklı renkte
- [x] Böl: parçalar kesik yüzü tablaya gelecek şekilde yatırılıp yan yana dizilir (desteksiz)
- [x] Kesim parametrik kalır; yer değişince parçalar ve kilitler yeniden hesaplanır
- [x] Kilit türleri: düz, dübel (iki yarıda delik + ayrı pim), geçmeli pim (yarıklı tırnak, tık diye oturur, çıkmaz)
- [ ] Kırlangıç kuyruğu kilidi
- [x] Pimler ayrı ve yatık basılır; boşluk belgedeki `tolerans` değerinden
- [x] Otomatik yerleşim: kenardan güvenli pay, alana göre 1–4 kilit, en kalın / birbirine en uzak noktalar, et kalınlığına göre pim çapı
- [x] Kesit çok inceyse kilit konmaz
- [ ] Kesit çok inceyse açıkça uyar, düz bölme + yapıştırma öner
- [x] Kesit 2B pencerede açılır: kilitleri sürükle, ekle, sil
- [ ] Sonra: “Tablaya sığdır” (seçilen yazıcıya göre otomatik çoklu kesim), eşleşme harfleri (A–A, B–B), çoklu kesim

## 2. Hata: yüzeye çizde yazı değiştirilemiyor
- [x] Yerleştirilen yazı varsayılan “Baseline” olarak kalıyor ve sonradan değiştirilemiyor
- [x] Yazı öğesi yazı olarak kalsın: seçince metni, boyu ve yazı tipini sağ panelden değiştir; istersen “Vektöre çevir”
- [x] Yazı aracı seçilince metin kutusu hemen görünür ve odaklanır olsun

## 3. Ölçme aracı
- [x] İki nokta arası uzaklık (toplam ve X/Y/Z ayrı)
- [x] Köşeye ve kenar ortasına yapışma
- [ ] Yüz merkezine ve delik merkezine yapışma
- [x] Yüzden yüze uzaklık (paralel yüzler), yüz açısı
- [ ] Delik / yay çapı ölçme
- [x] Ölçü ekranda etiket olarak kalabilsin; Esc ile temizlensin

## 4. Araç çubuğu düzeni
- [x] Çizim alanının altında ortada, Figma’daki gibi yüzen araç kutusu
- [x] İçinde ikon olarak: seç/taşı/döndür/ölçekle, şekiller, mekanik, içe aktar, yüzeye çiz, boya, ölç, şablonlar, baskı asistanı
- [x] Şekiller, mekanik ve şablonlar yukarı doğru açılan pencerede
- [x] “Böl” ve “Tablaya oturt” ikon olarak mıknatısın sağında; nesne seçilince etkin, değilse soluk
- [x] Sol panel yalnız nesne listesi olur (daha geniş)

## 5. Yeni şekiller 
- [x] Kapsül, oval prizma, kemer, ok, artı, damla, hilal, konuşma balonu, rozet (dişli kenarlı daire)
- [x] Yay (helezon), spiral, delikli/petek ızgara plaka
- [x] QR kod (metinden parametrik; promosyon için önemli)
- [x] Araçlar: dizi (doğrusal / dairesel çoğalt), aynala, içini boşalt (et kalınlıklı kabuk)

## 6. Yeni mekanik parçalar 
- [x] Mıknatıs yuvası, rulman yuvası (608 vb.), tırtıllı topuz
- [x] Geçmeli klips (snap-fit), kablo klipsi, esnek menteşe (living hinge)
- [x] Vidalı kavanoz ve kapak, kremayer (düz dişli), GT2 kasnak
- [ ] Konik dişli
- [x] Rotil (top mafsal), L köşebent, 2020 T-somun
- [ ] Diğer 2020 profil aksesuarları

## 7. Promosyon şablonları 
- [x] Marka seti: logo (SVG), firma adı ve renkleri bir kez gir, tüm promosyon şablonlarına uygula
- [x] Kartvizit (QR'lı), logolu anahtarlık, NFC anahtarlık, logolu bardak altlığı
- [ ] Kartvizite NFC yuvası seçeneği
- [x] Telefon standı, kalemlik, buzdolabı magneti, bavul / çanta etiketi
- [x] Masa isimliği, logo tabela (ayaklı), madalya, şişe açacağı (bozuk para yuvalı)
- [ ] Sonra: fotoğraftan litofan

## 8. Ek istekler
- [x] Bilgisayardaki fontlar: aile, kalınlık ve italik seçimi; yazı boyu mm
- [x] “Bağla” → “Grupla”, “Kaynaştır” → “Birleştir”
- [x] Boyama hızı: yalnız yeni darbe hesaplanır, fırçanın uzağındaki üçgenlere bakılmaz

## 9. 2D / 3D tek program (0.5)
### Üst çubuk ve geçiş
- [x] Solda logonun yanında 2D | 3D anahtarı; varsayılan 3D. 2D vektör çizim sayfasını açar (yüzeye çizden bağımsız)
- [x] Ortada yazılı, ikonlu 5'li grup: Yeni · Aç · Kaydet · İçe aktar · Dışa aktar (aktif moda göre çalışır)
- [x] Sağda yalnız ikonlar: yapay zekâ, güncelleme, koyu tema
- [x] 2D sayfası tam ekran pencere değil, uygulamanın kendi ekranı olur (üst çubuk görünür kalır)
- [x] Alttaki araç kutusundaki “Vektörel çizim” ikonu kalkar (anahtar yeterli)

### Dosya
- [x] Aynı .baseline biçimi; içinde yalnız 2D varsa 2D, yalnız 3D varsa 3D açılır
- [x] İkisi de varsa açılışta sor: “3D modeli mi, vektör çizimi mi açayım?”
- [x] 2D'de Kaydet yalnız vektör projesini de kaydedebilir (3D boş olsa da)
- [x] Dışa aktar menüsü moda göre: 3D'de 3MF/STL/OBJ, 2D'de PDF/SVG/DXF/PNG

### Yüzeye çiz ↔ vektör sayfası
- [x] Yüzeye çizde “Vektör sayfasına gönder”: yüzeyin şekli (kırmızı kıl çizgi, kilitli) ve tasarım yeni artboard olarak 2D sayfasına gider
- [x] 2D sayfasında seçili çizimi bir yüzeye geri gönderme (yüzey seç → oraya oturt)

### Hatalar
- [x] Yüzeye çizde ızgara çizgileri çok kalın (çizgi kalınlığı mm, ekran pikseli olmalı); küçük yüzeyde çizim görünmüyor
- [x] Yüzeyin turuncu sınırı neredeyse görünmüyor (0.4.0'da bozuldu)
- [x] Döndürme tutamaçlarındaki oklar anlaşılmıyor: Corel'deki gibi net kavisli çift ok
- [x] Kılavuz çizgisi silinemiyor: tıklayınca seçilsin, Delete ile silinsin; sağ tık “Sil / Tümünü temizle”
- [x] Geri alma: 2D geçmişi ekran kapanınca kayboluyor, 3D ile ayrı; kalıcı ve tek geçmiş olsun
- [x] Mıknatıs: düğüm noktalarına, yolun üstüne, ölçeklerken ve şekil çizerken de yapışsın
- [x] CMYK yaklaşık çevriliyor (renk profili yok): ekranda açıkça belirt
- [x] Büyük çizimlerde hız: binlerce noktalı izler ve uzun katalog sayfaları; katmanlar listesi sanal liste olsun

### Yazı
- [x] Yazının bir kısmını fareyle / Shift+ok / Ctrl+A ile seçebilme; seçili alan Corel'deki gibi arkadan vurgulansın
- [x] Seçili harflere ayrı renk, kalınlık, boy
- [x] Paragraf yazı: kutuya yazılır, satır kaydırır; sola / ortaya / sağa / iki yana yaslama

### Resim ve fotoğrafı vektöre çevirme
- [x] Resim yerleştirme: JPG, JPEG, PNG, TIFF, WEBP, BMP; İçe aktar ve sürükle-bırak ile
- [x] Resme şeffaflık, boyut, döndürme, PowerClip ile şekle kırpma
- [x] Sayfadaki resme sağ tık / düğme: “Vektöre çevir” (dosya seçmeden, Corel'deki gibi)
- [x] Vektöre çevirde canlı önizleme: ayar değiştikçe sonuç görünsün; büyük resimde hızlı
- [x] PDF, AI, SVG, DXF dosyaları da sürükle-bırak ile gelsin

### Kilit (Corel'deki gibi)
- [x] Kilitli nesne yerinden oynamaz, tıklayınca seçilmez, çerçeveyle seçime girmez
- [x] Sağ tık menüsü: Kilitle / Kilidi aç (ve kes, kopyala, sil, sıralama, grupla gibi sık işler)
- [x] Kullanım: resmi soluklaştır, kilitle, üstünden çiz

### Corel'den eksikler
- [x] Geçişli dolgu: doğrusal ve dairesel gradient
- [x] PNG / JPG dışa aktarma (DPI seçimiyle)
- [x] Zarf / bükme: yazıyı ve şekli kavise, dalgaya büktür
- [x] Desen dolgu
- [x] Gerçek katmanlar: katman oluştur, gizle, kilitle, “yazdırılmasın” (yüzey sınırı için)
- [x] Kendi renk paletini kaydetme (marka setiyle birleşir)

### Dosya biçimleri
- [x] AI açma: PDF uyumlu AI zaten açılıyor; sürükle-bırak ve sayfa seçimi eklenir
- [x] AI olarak dışa aktarma: PDF uyumlu AI (Illustrator ve Corel açar)
- [ ] CDR açma: araştırılacak (kapalı biçim; yalnız tersine mühendislikle okunabiliyor, yazılamıyor)
