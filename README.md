# Baseline

3B yazıcı için basit, parametrik modelleyici. Prototip (0.1.0).

- `src/core`: geometri çekirdeği. Arayüzden bağımsız; belge bir **tariftir** (JSON), üçgen yığını değil.
- `src/app`: React + Three.js arayüzü, `src-tauri`: masaüstü kabuğu.
- `tools`: Claude/Codex için MCP sunucusu ve komut satırı. Arayüzle **aynı komutları** kullanır (`src/core/doc.ts`).

```
npm install
npm run tauri dev      # geliştirme
npm test               # testler
npm run tauri build    # kurulum dosyası
```

## Yapay zekâ ve betik

```
claude mcp add --scope user baseline -- node "<yol>/dist-tools/mcp.mjs"
codex mcp add baseline -- node "<yol>/dist-tools/mcp.mjs"
npm run cli -- schema
npm run cli -- apply model.baseline examples/demo.json
npm run cli -- run model.baseline betik.mjs
```

Uygulamada açık ve kaydedilmiş belge dışarıdan değişirse ekranda canlı güncellenir; Ctrl+Z ile geri alınır.
`run` verilen JavaScript'i tam yetkiyle çalıştırır; yalnız güvendiğin betikleri kullan.

## 3MF notları

Bambu Studio 2.9 ile doğrulanan: A1, A1 mini, P1S (çok renk + tam profil). Eksik ayarlı proje Bambu Studio'yu
çökerttiği için profil ya tam gömülür ya hiç gömülmez (`src/core/bambu.ts`). X2D'de çok renkli dilimleme henüz çözülmedi.
