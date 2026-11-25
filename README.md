# Baseline

3B yazıcı için basit, parametrik modelleyici (0.2.0).

## Neler var

- **Şekiller**: kutu, silindir, küre, yarım küre, koni, piramit, çatı, yuvarlak çatı, halka, yüzük halka, tüp, kama, dilim, poligon, yirmiyüzlü, yıldız, boyutlu yıldız, kalp, zar, elmas, paraboloit, yazı. Hepsi parametrik.
- **Mekanik**: dişli, eş dişli çifti, yerinde basılan menteşe, ray/sürgü, kapaklı kutu, vida, somun, vida ve somun yuvası, ısıtmalı insert yuvası, tolerans testi.
- **Efektler** (sırayla, açılıp kapatılabilir): balon, üst/alt kenar pahı, burgu, daralt, bük, dalga, düzlemle kes, sadeleştir.
- **Köşeler**: tüm köşelere pah/yuvarlatma ya da vektör düzenleyicide tek köşe / iki kenarın arası.
- **Vektör düzenleyici**: kalem, serbest çizim, nokta düzenleme, şekiller, yazı, SVG ekleme, birleştir/çıkar/kesiştir.
- **Yüzeye çiz**: bir yüze tıkla, 2B çiz; düz ya da eğri yüzeye kabartma/oyma olarak oturur.
- **Boya**: yüzün tamamı ya da fırça; çok renkli 3MF ve OBJ'ye aktarılır.
- **İçe aktar**: STL, OBJ, 3MF (renkler ve Bambu boyası dahil), SVG; otomatik onarım (köşe birleştirme, yön, delik kapatma).
- **Baskı asistanı**: model analizi (destek, tabla, ağırlık, süre), sorun çözücü, ayar el kitabı, destek rehberi.
- **Şablonlar**: hazır şablonlar, kendi şablonların ve tasarım havuzu (`library/` uygulamayla gelir, `~/.baseline/library` senin).

- `src/core`: geometri çekirdeği. Arayüzden bağımsız; belge bir **tariftir** (JSON), üçgen yığını değil.
- `src/app`: React + Three.js arayüzü, `src-tauri`: masaüstü kabuğu.
- `tools`: Claude/Codex için MCP sunucusu ve komut satırı. Arayüzle **aynı komutları** kullanır (`src/core/doc.ts`).

```
npm install
npm run tauri dev      # geliştirme
npm test               # testler
npm run tauri build    # kurulum dosyası
npx tsx tools/thumbs.ts   # şablon küçük resimleri ve örnek kaideler
```

## Yapay zekâ ve betik

```
claude mcp add --scope user baseline -- node "<yol>/dist-tools/mcp.mjs"
codex mcp add baseline -- node "<yol>/dist-tools/mcp.mjs"
npm run cli -- schema
npm run cli -- apply model.baseline examples/demo.json
npm run cli -- run model.baseline betik.mjs
npm run cli -- import model.baseline parca.3mf
```

Uygulamada açık ve kaydedilmiş belge dışarıdan değişirse ekranda canlı güncellenir; Ctrl+Z ile geri alınır.
`run` verilen JavaScript'i tam yetkiyle çalıştırır; yalnız güvendiğin betikleri kullan.

## 3MF notları

Bambu Studio 2.9 ile doğrulanan: A1, A1 mini, P1S (çok renk + tam profil). Eksik ayarlı proje Bambu Studio'yu
çökerttiği için profil ya tam gömülür ya hiç gömülmez (`src/core/bambu.ts`). X2D'de çok renkli dilimleme henüz çözülmedi.
