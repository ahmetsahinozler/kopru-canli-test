# Canlı test: gerçek Windows + iPhone Simülatörü

`.github/workflows/canli-test.yml` bu klasördeki bir dosya değişince ya da elle
(workflow_dispatch) çalışır (GitHub Actions, deponun kendi hesabında).

| İş | Makine | Ne yapar |
|---|---|---|
| `windows` | GitHub'ın Windows Server sanal makinesi | `kopru.exe` önce kullanıcı oturumunda, sonra çift tıklamayla kurulan **Windows hizmeti** olarak sunucusuz kipte (gerçek Cloudflare tüneli, herkese açık ilan panosu) denenir; dokunuş kalibrasyonu %150 ölçekte, GPU ile küçültme, iPhone oturumunun Windows'taki izleri, 10 dakika dayanıklılık, güncelleme, kilit ekranı, kaldırma |
| `iphone-bekle` | Ubuntu | Windows iPhone'a hazır olana dek bekler (ucuz bekçi) |
| `iphone` | macOS + Xcode iPhone Simülatörü | Windows hazır olunca başlar. Gerçek **Mobile Safari**, Köprü istemcisine bir kullanıcı gibi kimlik/parola yazıp Windows makinesine internet üzerinden bağlanır; sonuçları görüntüden doğrular; ekran görüntüsü ve video kaydı alır |
| `sonuc` | Ubuntu | Sonuçları `canli-test-sonuc` dalına yazar (`OZET.md`, ekran görüntüleri, günlükler, kalibrasyon tabloları) |

Hedef "program" `hedef.html`'dir: renk blokları, dokununca yeşile dönen kutu,
çift tıkta renk değiştiren kutu, yazı alanı, tek parmakla kaydırılan şeritli
alan; kalibrasyon noktaları (`window.KAL`). Her basış, tekerlek ve çift tık
yeri, türü (touch / mouse), hedef öğe ve piksel oranıyla kaydedilir. Telefon
Köprü üzerinden F9 (Tablet), F8 (Doğrudan), F2 (bitti) tuşlarıyla kalibrasyon
bölümünü açar; bölüm sürerken son basışın yeri pembe bir noktayla gösterilir
(telefon bunu görüntüde arar). F4 ince yazılı tam ekran deseni açıp kapatır
(netleştirme ölçümü).

Hizmet parolası her çalıştırmada rastgele üretilir. Günlüğe ve artefaktlara
düz yazılmaz: iPhone işi başlayınca bir RSA anahtar çifti üretip yalnızca açık
anahtarı yükler, Windows (`sifrele` aşaması) parolayı onunla şifreler, iPhone
işi çözer. Test kancası `KOPRU_TEST_DOKUNUS_KAYMA` yalnızca kullanıcı
oturumundaki ajana verilir; hizmet hiçbir test değişkeniyle çalışmaz.

## Windows aşamaları (`windows.js <aşama>`)

| Aşama | Denetlenenler |
|---|---|
| `yerel` | Kullanıcı oturumunda ajan + yerel sunucu, masaüstü Edge: DXGI yakalama, renkler, fare/klavye/Türkçe, pano, dosya, akıcılık ve **kare aralığı** (yakalama zamanlaması), gecikme, gizlilik, çözünürlük ve yazı ölçeği, **netleştirme** (ince yazılı tam ekran değişiklikten sonra 📶 "Netleştirme" hedefe ulaşıyor mu), **ses** (sanal ses kartı varsa: Windows'ta ton çalar; WebRTC ses izinde saniyede ~100 paket = 10 ms Opus; günlükte "ses yakalama: olay güdümlü"; ses kartı yoksa "atlandı"), uyku engeli. iPhone benzetimi (Edge): **görüntü veri kanalından + WebCodecs, RTP boş**; **ses "aud" kanalından (sira16), AudioWorklet çalıcı**; dokunuş, uzun basma, kaydırma, yakınlaştırma; **iki parmakla kaydırma parmakların altına** (9 baytlık konumlu tekerlek, Windows'ta `#scroll` kayar); **çift dokunuş yakalama** (9 px aralı ikinci dokunuş aynı piksele, Doğrudan'da gerçek dblclick); **büyüteç**; **üç parmakla klavye**; iki istemci aynı anda |
| `kalibrasyon` | 1920×1080'de Windows ölçeği **%100 ve %150**: 9 bilinen noktaya iPhone benzetiminden **Tablet** (Windows dokunmatik enjeksiyonu) ve **Doğrudan** (fare) dokunuşları. Her nokta için hedef, Windows'un olayı koyduğu yer, olay türü, ajanın enjekte ettiği piksel, eşleme dikdörtgeni ve **imlecin dokunuştan sonraki yeri** (`tapdbg`/`tapcur`); ajanın DPI tanısı (`inputdiag`: girdi iş parçacığı ve süreç DPI farkındalığı, monitör, ölçek). **Hipotez A** kararı (DOĞRULANDI / REDDEDİLDİ / BELİRSİZ). Kayma varsa kapalı döngü fareye geçer; ham dokunmatik ölçümü için ayrıca her iki dokunuşta yeniden bağlanılır. "Telefona göre büyüt" önerisinin ilk bağlantıda çıkması. **Kapalı döngü**: ajan `KOPRU_TEST_DOKUNUS_KAYMA=0,-150` ile başlatılır (Windows'un dokunuşu 150 px yukarı koyması taklit edilir); en geç ikinci dokunuşta fareye geçilmeli, sonrakiler hedefte olmalı |
| `gpu` | Akış %50'ye küçültülürken GPU ile küçültme **varsayılan kapalı** (yakalama "dxgi", günlükte "açık" yok); `KOPRU_GPU=1` ile yazılım bağdaştırıcısında açılıp ilk kare denetimini geçiyor mu ya da temiz biçimde işlemciye dönüyor mu; görüntü akıyor, renk doğru, çökme yok |
| `kur` | Çift tıklamayla kurulum, hizmet, güvenlik duvarı, kısayol, ilk açılışta ayar sayfası, parola belirleme |
| `hizmet` | SYSTEM hizmeti: ilan panosundan bulma, yakalama, girdi, pano, dosya, yazı ölçeği, **hizmette %150 kalibrasyonu** (kullanıcının asıl kurulumu), dokunmatik, Cloudflare tüneli, tünel adresinin değişmesi, hizmetin yeniden başlaması, işçi çökmesi. Sonda iPhone için ekranı 1920×1080'e alır (yazı ölçeği seçenekleri olsun), ses kartı varsa ton çalar |
| `sifrele` | Parolayı iPhone işinin açık anahtarıyla şifreler |
| `bekle` | iPhone işinin bitmesini bekler; hedefe gelen olayları çözümler: gerçek Safari'den gelen **kalibrasyon dokunuşlarının Windows'taki yeri** (ölçekli Windows'ta, Tablet ve Doğrudan; hipotez A), iki parmakla kaydırmanın tekerleği `#scroll`'a mı gitti, çift tıklar; "telefona göre büyüt" bağlantı bitince geri alındı mı; hizmet günlüğünde GPU yolu kapalı mı, ses yakalama yolu; ekranı geri alır |
| `uzun` | 10 dakika kesintisiz kullanım (kopma yok, akıcılık, bellek) |
| `son` | Güncelleme, Ctrl+Alt+Del, kilit ekranında parola, bağlantı bitince kilitleme, kaba kuvvet kilidi, kaldırma |

Her aşamanın sonunda o aşamada Köprü'nün çöküp çökmediği (`panic`, `fatal
error`) denetlenir.

## iPhone (gerçek Mobile Safari, `iphone/canli-test.js`)

Sayfaya yalnızca testte eklenir. Sentetik dokunuş kullanır (Safari'nin gerçek
dokunuşu sayfadan otomatikleştirilemez; Köprü'nün dokunma motoru aynı
PointerEvent'leri işler). Simülatörde yapılması gerekenleri (ekran görüntüsü,
döndürme, gerçek dokunuş, Ayarlar'a geçip dönme) `iphone/sunucu.js`'e istek
olarak gönderir.

| Satır (`t`) | Denetlenen |
|---|---|
| `baglanti`, `goruntu-yolu` | Bağlantı; görüntü **veri kanalından + WebCodecs**, `<video>` gizli, RTP görüntüsü boş |
| `oneri-karti` | İlk bağlantıda "telefona göre büyüt" kartı; kabul edilince Windows ölçeği önerilen yüzdeye çıkar (sonraki testler ölçekli Windows'ta) |
| `akis`, `renk`, `klavye` | Kare akışı, çözme/çizim süreleri, ajan değerleri; renk; telefon klavyesiyle yazı |
| `dokunus`, `kaydirma` | Tek parmak dokunuş (Windows dokunmatiği), tek parmakla kaydırma |
| `iki-parmak-kaydirma` | Tekerlek iletisi 9 bayt ve parmakların orta noktasını taşıyor; parmakların altındaki alan kaydı |
| `cift-dokunus-tablet`, `cift-dokunus-direct` | 9 px aralı ikinci dokunuş ilkinin noktasına gönderildi; Windows'taki programda çift tık oldu mu |
| `buyutec` | Büyüteç 120 ms'de kapalı, 500 ms'de açık, ortası parmağın altındaki renk, kalkınca kapanıyor |
| `uc-parmak` | Windows'a tık gitmedi; klavyenin açılması yalnızca bilgi (iOS odak kuralı) |
| `kalibrasyon-tablet`, `kalibrasyon-direct`, `kalibrasyon-tani` | Ölçekli Windows'ta 9 noktaya dokunuş; düştüğü yer görüntüdeki pembe noktadan (Windows pikseli); ajanın enjekte ettiği piksel ve imleç; Windows DPI tanısı ve telefondaki tanı paneli |
| `netlestirme` | İnce yazılı tam ekran değişiklikten sonra 📶 "Netleştirme" hedef/boş ile bitiyor |
| `istatistik`, `istatistik-yol-denetimi` | 📶: "Doğrudan (görüntü veri kanalından)", sürüm telefon = bilgisayar, "WebCodecs (high)", "Çözme / çizim", "Netleştirme", "Ses"; "Yol denetimi" satırı |
| `ses`, `ses-cikis` | "aud" kanalı (sira16, sırasız, yeniden gönderimsiz), saniyede ~100 paket, Opus paketi 10 ms, Safari'nin AudioDecoder'ı 480 örnek; `ses-isleyici.js` bu Safari'de AudioWorklet olarak çalışıyor (OfflineAudioContext, ses donanımı gerekmez). Canlı çalma için gerçek dokunuş istenir; olmazsa yalnızca bilgi. Windows'tan ses gelmiyorsa "atlandı" |
| `dondurme` | Simülatör yan çevrilir: görüntü sığar, akış boyutu uyar, dokunuş yine yerinde. Döndürülemezse "atlandı" |
| `geri-donus` | Safari arka plana alınıp dönünce bağlantı toparlanıyor, veri kanalı yolu sürüyor, profil "çözülemiyor" diye işaretlenmiyor |

## Süreler

Windows işi ~70–85 dk (en çok 120), macOS işi ~12–18 dk (en çok 35; Windows
hazır olmadan başlamaz), bekçi ve özet işleri birkaç dakika.

## Yerelde deneme (Linux)

`yerel-dene.js` test kodunun kendisini Xvfb + Linux ajanı + Playwright
Chromium ile dener (gerçek Windows ve Safari'nin yerini tutmaz):

```bash
go build -o /tmp/kopru ./cmd/kopru
KOPRU_BIN=/tmp/kopru WORK=/tmp/canli-yerel node test/canli/yerel-dene.js iphone               # canli-test.js + bekle çözümlemesi + OZET.md
KOPRU_BIN=/tmp/kopru WORK=/tmp/canli-yerel node test/canli/yerel-dene.js windows kalibrasyon  # windows.js aşaması (yerel, kalibrasyon, gpu)
```

Kapılar 9800–9899 (`PORT_TABAN`), ekran `:108` (`XDISPLAY`). Windows'taki yazı
ölçeği, ajanın ölçek benzetimi ve hedefin `--force-device-scale-factor` ile
yeniden açılmasıyla taklit edilir. Masaüstü istemcinin WebRTC'de H.264 çözmesi
için `KOPRU_TARAYICI_KANAL=chrome` verilebilir. Linux'ta beklenen farklar:
dokunuşlar fare olarak gelir (X11), PowerShell gerektiren denetimler (pano,
gizlilik, uyku engeli, ekran çözünürlüğü) başarısız görünür.
