# Canlı test — çalıştırma 44183381222

Kaynak: bc40cc2e363fc405c1361977f049ee254e6d684d

**Windows:** 126/126 geçti · **iPhone (Safari):** 16/20 geçti

Başarısızlar:

- ❌ iPhone goruntu-yolu
- ❌ iPhone netlestirme
- ❌ iPhone istatistik
- ❌ iPhone geri-donus

## Dokunuş kalibrasyonu (hedef ↔ Windows'un olayı koyduğu yer, fiziksel piksel)

### kalibrasyon-hizmet.json — Windows hizmeti (SYSTEM işçisi, sunucusuz)

**Hipotez A → REDDEDİLDİ**: %150'de dokunmatik (9 nokta) ve fare (9 nokta) ±12 px içinde

Windows'un girdi koordinat uzayı (ajan tanısı): `{"%150": {"calisma": [0, 0, 1920, 1008], "girdi": "monitör başına v2", "monitor": [0, 0, 1920, 1080], "olcek": 150, "sanal": [0, 0, 1920, 1080], "surec": "monitör başına v2"}}`

**%150 Tablet** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'touch': 9}, imleç {'olculen': 9, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | touch | [230, 119] | [960, 540] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | touch | [835, 119] | [960, 540] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | touch | [1862, 119] | [960, 540] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | touch | [835, 486] | [960, 540] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | touch | [1363, 637] | [960, 540] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | touch | [1862, 594] | [960, 540] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | touch | [230, 1026] | [960, 540] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | touch | [835, 918] | [960, 540] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | touch | [1862, 1026] | [960, 540] |  |

**%150 Doğrudan** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'mouse': 9}, imleç {'olculen': 0, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | mouse | [230, 119] | [230, 119] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | mouse | [835, 119] | [835, 119] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | mouse | [1862, 119] | [1862, 119] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | mouse | [835, 486] | [835, 486] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | mouse | [1363, 637] | [1363, 637] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | mouse | [1862, 594] | [1862, 594] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | mouse | [230, 1026] | [230, 1026] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | mouse | [835, 918] | [835, 918] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | mouse | [1862, 1026] | [1862, 1026] |  |

### kalibrasyon-iphone.json — gerçek iPhone Safari (Simülatör) → Windows hizmeti, internet üzerinden

**Hipotez A → REDDEDİLDİ**: %150'de dokunmatik (10 nokta) ve fare (9 nokta) ±12 px içinde

**Tablet (Windows %175)** — isabet 10/10 (±12 px), en büyük 3, ortalama fark [-1.7, -1.1], uyum x {'egim': 0.999, 'kesisim': 0} y {'egim': 0.998, 'kesisim': 0}, türler {'touch': 10}, imleç {'olculen': 0, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [231, 119] | [230, 119] | [-1, 0] | touch |  |  |  |
| 1 | [836, 119] | [835, 119] | [-1, 0] | touch |  |  |  |
| 2 | [1864, 119] | [1861, 119] | [-3, 0] | touch |  |  |  |
| 3 | [836, 487] | [835, 486] | [-1, -1] | touch |  |  |  |
| 4 | [1364, 638] | [1362, 637] | [-2, -1] | touch |  |  |  |
| 5 | [1864, 595] | [1861, 593] | [-3, -2] | touch |  |  |  |
| 6 | [231, 1027] | [230, 1025] | [-1, -2] | touch |  |  |  |
| 7 | [836, 919] | [835, 917] | [-1, -2] | touch |  |  |  |
| 8 | [1864, 1027] | [1861, 1025] | [-3, -2] | touch |  |  |  |
| 3 | [836, 487] | [835, 486] | [-1, -1] | touch |  |  |  |

**Doğrudan (Windows %175)** — isabet 9/9 (±12 px), en büyük 3, ortalama fark [-1.8, -1.1], uyum x {'egim': 0.999, 'kesisim': 0} y {'egim': 0.998, 'kesisim': 0}, türler {'mouse': 9}, imleç {'olculen': 0, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [231, 119] | [230, 119] | [-1, 0] | mouse |  |  |  |
| 1 | [836, 119] | [835, 119] | [-1, 0] | mouse |  |  |  |
| 2 | [1864, 119] | [1861, 119] | [-3, 0] | mouse |  |  |  |
| 3 | [836, 487] | [835, 486] | [-1, -1] | mouse |  |  |  |
| 4 | [1364, 638] | [1362, 637] | [-2, -1] | mouse |  |  |  |
| 5 | [1864, 595] | [1861, 593] | [-3, -2] | mouse |  |  |  |
| 6 | [231, 1027] | [230, 1025] | [-1, -2] | mouse |  |  |  |
| 7 | [836, 919] | [835, 917] | [-1, -2] | mouse |  |  |  |
| 8 | [1864, 1027] | [1861, 1025] | [-3, -2] | mouse |  |  |  |

### kalibrasyon-kapali-dongu.json — kullanıcı oturumu, KOPRU_TEST_DOKUNUS_KAYMA=0,-150

**%150 Tablet (kaydıran Windows)** — isabet 0/6 (±12 px), en büyük 150, ortalama fark [0, -150], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': -150}, türler {'touch': 6}, imleç {'olculen': 6, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 3 | [835, 486] | [835, 336] | [0, -150] | touch | [835, 486] | [960, 540] |  |
| 4 | [1363, 637] | [1363, 487] | [0, -150] | touch | [1363, 637] | [960, 540] |  |
| 5 | [1862, 594] | [1862, 444] | [0, -150] | touch | [1862, 594] | [960, 540] |  |
| 6 | [230, 1026] | [230, 876] | [0, -150] | touch | [230, 1026] | [960, 540] |  |
| 7 | [835, 918] | [835, 768] | [0, -150] | touch | [835, 918] | [960, 540] |  |
| 8 | [1862, 1026] | [1862, 876] | [0, -150] | touch | [1862, 1026] | [960, 540] |  |

### kalibrasyon-yerel.json — kullanıcı oturumu (kopru agent)

**Hipotez A → REDDEDİLDİ**: %150'de dokunmatik (9 nokta) ve fare (9 nokta) ±12 px içinde

Windows'un girdi koordinat uzayı (ajan tanısı): `{"%100": {"calisma": [0, 0, 1920, 1032], "girdi": "monitör başına v2", "monitor": [0, 0, 1920, 1080], "olcek": 100, "sanal": [0, 0, 1920, 1080], "surec": "monitör başına v2"}, "%150": {"calisma": [0, 0, 1920, 1008], "girdi": "monitör başına v2", "monitor": [0, 0, 1920, 1080], "olcek": 150, "sanal": [0, 0, 1920, 1080], "surec": "monitör başına v2"}}`

**%100 Tablet** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'touch': 9}, imleç {'olculen': 9, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | touch | [230, 119] | [960, 540] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | touch | [835, 119] | [960, 540] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | touch | [1862, 119] | [960, 540] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | touch | [835, 486] | [960, 540] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | touch | [1363, 637] | [960, 540] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | touch | [1862, 594] | [960, 540] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | touch | [230, 1026] | [960, 540] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | touch | [835, 918] | [960, 540] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | touch | [1862, 1026] | [960, 540] |  |

**%100 Doğrudan** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'mouse': 9}, imleç {'olculen': 0, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | mouse | [230, 119] | [230, 119] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | mouse | [835, 119] | [835, 119] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | mouse | [1862, 119] | [1862, 119] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | mouse | [835, 486] | [835, 486] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | mouse | [1363, 637] | [1363, 637] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | mouse | [1862, 594] | [1862, 594] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | mouse | [230, 1026] | [230, 1026] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | mouse | [835, 918] | [835, 918] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | mouse | [1862, 1026] | [1862, 1026] |  |

**%150 Tablet** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'touch': 9}, imleç {'olculen': 9, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | touch | [230, 119] | [960, 540] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | touch | [835, 119] | [960, 540] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | touch | [1862, 119] | [960, 540] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | touch | [835, 486] | [960, 540] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | touch | [1363, 637] | [960, 540] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | touch | [1862, 594] | [960, 540] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | touch | [230, 1026] | [960, 540] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | touch | [835, 918] | [960, 540] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | touch | [1862, 1026] | [960, 540] |  |

**%150 Doğrudan** — isabet 9/9 (±12 px), en büyük 0, ortalama fark [0, 0], uyum x {'egim': 1, 'kesisim': 0} y {'egim': 1, 'kesisim': 0}, türler {'mouse': 9}, imleç {'olculen': 0, 'tasindi': 0}, fareye geçiş -1

| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |
|---|---|---|---|---|---|---|---|
| 0 | [230, 119] | [230, 119] | [0, 0] | mouse | [230, 119] | [230, 119] |  |
| 1 | [835, 119] | [835, 119] | [0, 0] | mouse | [835, 119] | [835, 119] |  |
| 2 | [1862, 119] | [1862, 119] | [0, 0] | mouse | [1862, 119] | [1862, 119] |  |
| 3 | [835, 486] | [835, 486] | [0, 0] | mouse | [835, 486] | [835, 486] |  |
| 4 | [1363, 637] | [1363, 637] | [0, 0] | mouse | [1363, 637] | [1363, 637] |  |
| 5 | [1862, 594] | [1862, 594] | [0, 0] | mouse | [1862, 594] | [1862, 594] |  |
| 6 | [230, 1026] | [230, 1026] | [0, 0] | mouse | [230, 1026] | [230, 1026] |  |
| 7 | [835, 918] | [835, 918] | [0, 0] | mouse | [835, 918] | [835, 918] |  |
| 8 | [1862, 1026] | [1862, 1026] | [0, 0] | mouse | [1862, 1026] | [1862, 1026] |  |

## Windows (gerçek sanal makine)

- ℹ️ [yerel] Windows — Microsoft Windows Server 2025 Datacenter 10.0.26100.0
- ℹ️ [yerel] oturumlar — HATA:  SESSIONNAME               USERNAME                 ID  STATE   TYPE        DEVICE 
 services                                            0  Disc                        
>console                   runneradmin               2  Active                      
 31c5ce94259d4006a9e4                            65536  Listen                      
 rdp-tcp                                         65
- ℹ️ [yerel] ekran kartı — Microsoft Hyper-V Video 1024x768
- ℹ️ [yerel] ses aygıtları — aygıtlar=[VB-Audio Virtual Cable] Audiosrv=Running
- ℹ️ [yerel] ekran — 1024x768
- ✅ [yerel] ajan gerçek Windows'ta başladı ve kaydoldu — kimlik 653575300
- ✅ [yerel] yanlış parola reddedildi — Parola hatalı. Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.
- ✅ [yerel] Edge ile bağlantı (doğrudan WebRTC), görüntü geldi — 612 ms 
- ✅ [yerel] ekran yakalama ve kodlayıcı — {"cap":"dxgi","enc":"x264 superfast high444","boyut":{"w":1024,"h":768},"aktarim":"webrtc"}
- ✅ [yerel] renkler doğru — {"#red":{"got":[228,57,55],"ref":[229,57,53]},"#green":{"got":[67,160,76],"ref":[67,160,71]},"#blue":{"got":[30,135,222],"ref":[30,136,229]},"#white":{"got":[255,255,255],"ref":[255,255,255]}}
- ✅ [yerel] ekran değişince görüntü akıyor — 61 kare / 2,5 sn
- ✅ [yerel] fare sol tık doğru noktada — {"beklenen":{"x":215,"y":300},"gelen":{"t":"mousedown","x":215,"y":300,"b":0,"id":"tap","ts":1794952093542,"dpr":1}}
- ✅ [yerel] fare sağ tık (bağlam menüsü) — 
- ✅ [yerel] fare tekerleği uzak sayfayı kaydırdı — scrollTop 600
- ✅ [yerel] klavye (tarama kodları) — Merhaba Kopru 123!
- ✅ [yerel] kısayol Ctrl+A, Sil — 
- ✅ [yerel] Türkçe karakterler (telefon klavyesi yolu) — "Çağrı ŞÖÜ İı ğ €"
- ✅ [yerel] tuş tuş yazdırma (giriş ekranı yolu) — "Kopru-Ş1 Çğ@ü"
- ✅ [yerel] pano metin: Windows → istemci — uzak-ÇĞŞ-123
- ✅ [yerel] pano metin: istemci → Windows — yerel-ÖÜİ-456
- ✅ [yerel] pano görsel: Windows → istemci — 
- ✅ [yerel] pano dosya: Gezgin'de kopyalanan dosya istemcide görünüyor — ["pano-dosya.txt"]
- ✅ [yerel] 24 MB dosya indirme (bütünlük) — 13.5 MB/sn
- ✅ [yerel] klasörü ZIP olarak indirme — klasor/,klasor/a.txt,klasor/alt/,klasor/alt/b.txt
- ✅ [yerel] 12 MB dosya yükleme (bütünlük) — 9.2 MB/sn
- ✅ [yerel] sürekli hareketli ekranda akıcılık (≥25 fps) — {"fps":26.3,"kbps":175.8,"kodlamaMs":82.3,"kademe":0}
- ℹ️ [yerel] kare aralığı (yakalama zamanlaması, sürekli kaydırmada tarayıcıya varış) — {"kare":81,"ortMs":37.7,"sapmaMs":8.7,"p50":34.8,"p95":50.4,"enCok":65.1}
- ℹ️ [yerel] kontrol kanalı gidiş-dönüş — 1 ms
- ✅ [yerel] netleştirme: ince yazılı tam ekran değişiklikten sonra kalite hedefine ulaştı (📶 "Netleştirme") — {"once":"hedef · 311 kare · RF 21.0 (hedef 21.5)","seri":[{"ms":401,"netl":"sürüyor · 5 kare · RF 28.1 (hedef 21.5)","fps":7,"kbps":3336},{"ms":1206,"netl":"hedef · 18 kare · RF 21.0 (hedef 21.5)","fps":14,"kbps":6535}],"kare":30}
- ℹ️ [yerel] yetenekler — {"audio":true,"audseq":true,"clipboard":true,"files":true,"input":true,"modes":true,"privacy":true,"sas":false,"scales":true,"touch":true,"typekeys":true}
- ℹ️ [yerel] gecikme ölçümü öncesi ajan durumu — {"bwe":40000,"cap":"dxgi","enc":"x264 superfast high444","encMs":0,"floor":3000,"fps":0,"h":768,"kbps":0,"netl":"hedef · 4 kare · RF 21.0 (hedef 21.5)","perf":0,"queueMs":0,"t":"stats","target":34000,"w":1024}
- ℹ️ [yerel] girdi → görüntü gecikmesi (aynı makine, doğrudan WebRTC) — {"olcumler":[44,47,63,64,64,64,64,64,64,65,67,71,79,80,81],"ortanca":64,"p90":80,"basarili":"15/15"}
- ✅ [yerel] girdi → görüntü gecikmesi ölçüldü ve 150 ms altında (ortanca) — {"olcumler":[44,47,63,64,64,64,64,64,64,65,67,71,79,80,81],"ortanca":64,"p90":80,"basarili":"15/15"}
- ℹ️ [yerel] gizlilik: ajanın bildirdiği durum — {"durum":"pencere=0x90168 var=true görünür=true yakalamaDışı=0x11 alan=0,0-1024,768","on":true,"t":"privacy"}
- ✅ [yerel] gizlilik: yerel ekranı kaplayan siyah pencere açıldı ve ekran yakalamadan dışlandı — var görünür=True yakalamaDışı=0x11
- ✅ [yerel] gizlilik: uzaktan görüntü kararmadı — [228,57,55]
- ✅ [yerel] gizlilik: Köprü'nün tıklaması alttaki programa geçiyor — 
- ✅ [yerel] gizlilik: Köprü'nün klavyesi alttaki programa geçiyor — gizli
- ✅ [yerel] gizlilik kapatılınca siyah pencere kalktı — 
- ℹ️ [yerel] desteklenen çözünürlükler — ["1920x1080","1680x1050","1600x1200","1600x900","1440x900","1366x768","1280x1024","1280x800","1280x720","1152x864","1024x768","800x600"]
- ✅ [yerel] çözünürlük değiştirme ve geri alma (gerçek monitör) — {"once":{"w":1024,"h":768},"hedef":{"w":1920,"h":1080,"hz":64},"sonra":{"w":1024,"h":768}}
- ℹ️ [yerel] yerel: ölçek seçenekleri — {"changed":false,"cur":100,"display":0,"list":[100,125,150,175],"orig":100,"t":"scales"}
- ✅ [yerel] yerel: Windows yazı ölçeği %100 → %175 (programlar büyüdü, çözünürlük aynı) — {"once":1,"sonra":1.75,"cozunurluk":{"w":1920,"h":1080}}
- ✅ [yerel] yerel: çözünürlük 1280×720 olunca yazı boyutu aralığa sığdırıldı (%100) — {"liste":[100],"cur":100,"dpr":1}
- ✅ [yerel] yerel: 1920×1080'e dönünce seçilen %175 geri geldi — {"dpr":1.75}
- ✅ [yerel] yerel: yazı ölçeği eski haline döndü — {"geri":1}
- ✅ [yerel] yerel: telefona uydur (iPhone 15 Pro) → %175, programlar büyüdü — {"liste":[100,125,150,175],"cur":175,"dpr":1.75}
- ✅ [yerel] ses: Windows sesi (WASAPI geri döngü) masaüstü tarayıcısına akıyor — {"paketSn":100,"once":{"p":6961,"e":0,"gizlenen":31560,"t":1794952158359.828},"sonra":{"p":7261,"e":0,"gizlenen":31560,"t":1794952161362.96},"aygit":"aygıtlar=[VB-Audio Virtual Cable] Audiosrv=Running"}
- ✅ [yerel] ses: 10 ms Opus (saniyede ~100 paket) — {"paketSn":100}
- ℹ️ [yerel] ses: sinyal (ton çalıyor; enerji artışı) — 0
- ✅ [yerel] ses: WASAPI olay güdümlü yakalama kuruldu (günlük) — ["2026/11/17 21:49:16 ses yakalama: olay güdümlü (WASAPI loopback, 48000 Hz, 2 kanal)","2026/11/17 21:49:16 [683c92] ses aktarımı başladı"]
- ✅ [yerel] prize takılıyken uyku engeli (powercfg /requests) — DISPLAY: [PROCESS] \Device\HarddiskVolume4\a\kopru-canli-test\kopru-canli-test\kopru.exe [PROCESS] \Device\HarddiskVolume3\Program Files (x86)\Microsoft\Edge\Application\msedge.exe Video Wake Lock SYSTEM: [DRIVER] VB-Audio Virtual Cable (ROOT\MEDIA\0000) An audio stream is currently in use. [PROCESS
- ✅ [yerel] iPhone (emülasyon) bağlandı — 5889 ms 
- ✅ [yerel] iPhone (emülasyon): görüntü veri kanalından + WebCodecs, RTP görüntüsü boş — {"veriKanali":true,"video":false,"cozulen":3,"profil":"high","rtp":null}
- ✅ [yerel] iPhone (emülasyon): ses "aud" veri kanalından (sira16, sırasız, yeniden gönderimsiz), 10 ms paket — {"kanal":{"protokol":"sira16","durum":"open","sirali":false,"yeniden":0},"paketSn":100,"acik":true,"hata":"","calici":true,"baglam":"running","durumu":{"buf":10,"target":17,"c":17,"jitter":2,"pkts":1319,"under":0,"lost":0,"late":0,"acc":28,"exp":15,"conceal":0,"resync":0,"skip":0,"dropped":0,"out":66},"not":"veri kanalı · tampon 10 ms (hedef 17, sarsıntı 2) · kesinti 0 · kayıp/geç 0 · gizlenen 0 m
- ✅ [yerel] iPhone (emülasyon): AudioWorklet çalıcısı (ses-isleyici.js) çalışıyor, tampon ölçülüyor — {"kanal":{"protokol":"sira16","durum":"open","sirali":false,"yeniden":0},"paketSn":100,"acik":true,"hata":"","calici":true,"baglam":"running","durumu":{"buf":10,"target":17,"c":17,"jitter":2,"pkts":1319,"under":0,"lost":0,"late":0,"acc":28,"exp":15,"conceal":0,"resync":0,"skip":0,"dropped":0,"out":66},"not":"veri kanalı · tampon 10 ms (hedef 17, sarsıntı 2) · kesinti 0 · kayıp/geç 0 · gizlenen 0 m
- ✅ [yerel] tek parmak dokunuş Windows'a ulaştı — {"t":"pointerdown","x":215,"y":300,"pt":"touch","b":0,"id":"tap","ts":1794952176361,"dpr":1}
- ✅ [yerel] dokunuş gerçek Windows dokunmatiği olarak geldi — touch
- ✅ [yerel] dokunuş doğru noktada — {"beklenen":{"x":215,"y":300},"gelen":{"t":"pointerdown","x":215,"y":300,"pt":"touch","b":0,"id":"tap","ts":1794952176361,"dpr":1}}
- ✅ [yerel] uzun basma = sağ tık — ["pointerdown:touch","pointerup:touch","contextmenu:touch"]
- ✅ [yerel] tek parmakla kaydırma uzak sayfayı kaydırdı — scrollTop 640
- ✅ [yerel] iki parmakla sıkıştırma telefonda yakınlaştırdı, Windows'a dokunuş gitmedi — {"zoom":3.4782608695652173,"uzakDokunus":0}
- ✅ [yerel] iki parmakla kaydırma: tekerlek iletisi konumlu (9 bayt), Windows'ta parmakların altındaki alan kaydı — {"ileti":78,"boylar":[9],"tekerlek":70,"hedefler":["scroll"],"scrollTop":1744,"ilkTekerlek":{"t":"wheel","x":727,"y":542,"b":0,"id":"scroll","ts":1794952182053,"dpr":1}}
- ✅ [yerel] çift dokunuş (tablet): 9 px aralı ikinci dokunuş ilkinin noktasına oturdu — {"basis":[[850,84,"touch"],[850,84,"touch"]],"cift":["dbl"],"renk":"rgb(0, 229, 255)"}
- ℹ️ [yerel] çift dokunuş (Tablet): Windows dokunmatik çift dokunuşu programa çift tık olarak verdi mi — evet (dblclick)
- ✅ [yerel] çift dokunuş (direct): 9 px aralı ikinci dokunuş ilkinin noktasına oturdu — {"basis":[[850,84,"mouse"],[850,84,"mouse"]],"cift":["dbl"],"renk":"rgb(0, 229, 255)"}
- ✅ [yerel] çift dokunuş (Doğrudan): Windows'taki programda gerçek çift tık (dblclick) — {"basis":[[850,84,"mouse"],[850,84,"mouse"]],"cift":["dbl"],"renk":"rgb(0, 229, 255)"}
- ✅ [yerel] büyüteç: parmak durunca açıldı (120 ms'de değil, 470 ms'de), ortası parmağın altındaki rengi gösteriyor, kalkınca kapandı — {"erken":false,"acik":true,"gorunur":true,"merkez":[229,59,56],"kutu":[237,8,132],"kapandi":true}
- ✅ [yerel] üç parmakla dokunma klavyeyi açtı ve kapattı, Windows'a tık gitmedi — {"acildi":true,"kapandi":true,"uzakOlay":0}
- ✅ [yerel] iki cihaz aynı anda bağlı, ikisine de görüntü akıyor — {"telefon3sn":63,"bilgisayar3sn":80,"telefonAjan":{"bwe":6000,"cap":"gdi","enc":"x264 superfast high tek dilim","encMs":73.304,"floor":3000,"flowCuts":0,"flowHolds":0,"flowKbps":26,"flowQ":0,"fps":22,"h":768,"kbps":14,"laneSw":0,"lanes":true,"netl":"hedef · 29 kare · RF 21.0 (hedef 21.5)","perf":0,"queueMs":0,"t":"stats","target":40000,"w":1024},"bilgisayarAjan":{"bwe":1093,"cap":"dxgi","enc":"x26
- ✅ [yerel] H.264 çözemeyen tarayıcıda takılma yok (bağlandı ya da açıkça uyardı) — {"webrtcH264":false,"aktarim":"","mesaj":"Bu tarayıcı H.264 görüntüyü çözemiyor. Chrome, Edge veya Safari kullanın. | Anahtar türetiliyor…"}
- ✅ [yerel] bağlantı geçmişi kaydediliyor — ["127.0.0.1 105sn direct","127.0.0.1 30sn direct"]
- ✅ [yerel] yerel: Köprü bu aşamada hiç çökmedi — 
- ✅ [kalibrasyon] kalibrasyon: ajan başladı — 653575300
- ✅ [kalibrasyon] kalibrasyon: denetim bağlantısı — 638 ms 
- ℹ️ [kalibrasyon] kalibrasyon (kullanıcı oturumu): Windows'un girdi koordinat uzayı (ajanın tanısı) — {"%100":{"calisma":[0,0,1920,1032],"girdi":"monitör başına v2","monitor":[0,0,1920,1080],"olcek":100,"sanal":[0,0,1920,1080],"surec":"monitör başına v2"},"%150":{"calisma":[0,0,1920,1008],"girdi":"monitör başına v2","monitor":[0,0,1920,1080],"olcek":150,"sanal":[0,0,1920,1080],"surec":"monitör başına v2"}}
- ✅ [kalibrasyon] kalibrasyon (kullanıcı oturumu): %100 Tablet dokunuşları hedefte (±12 px, 9 nokta) — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"touch":9},"imlec":{"olculen":9,"tasindi":0},"fareyeGecis":-1}
- ✅ [kalibrasyon] kalibrasyon (kullanıcı oturumu): %100 Doğrudan (fare) dokunuşları hedefte — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"mouse":9},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1}
- ✅ [kalibrasyon] kalibrasyon (kullanıcı oturumu): %150 Doğrudan (fare) dokunuşları hedefte — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"mouse":9},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1}
- ✅ [kalibrasyon] kalibrasyon (kullanıcı oturumu): %150 Tablet dokunuşları hedefte (kayma varsa kapalı döngüyle fareye geçtikten sonra) — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"touch":9},"imlec":{"olculen":9,"tasindi":0},"fareyeGecis":-1}
- ℹ️ [kalibrasyon] kalibrasyon (kullanıcı oturumu): Windows dokunuşta imleci taşıyor mu (kapalı döngünün ölçebilmesi için) — {"olculen":9,"tasindi":0,"sonuc":"hayır (kapalı döngü ölçemez)"}
- ℹ️ [kalibrasyon] kalibrasyon (kullanıcı oturumu): HİPOTEZ A (Windows %150'de enjekte edilen dokunuşu kaydırıyor) → REDDEDİLDİ — {"karar":"REDDEDİLDİ","neden":"%150'de dokunmatik (9 nokta) ve fare (9 nokta) ±12 px içinde","dokunmatik":{"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"touch":9},"imlec":{"olculen":9,"tasindi":0},"fareyeGecis":-1},"fare":{"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim
- ✅ [kalibrasyon] "telefona göre büyüt" önerisi ilk bağlantıda çıktı (1920×1080, %100) — Ekran 1920×1080, yazı boyutu %100. Bağlantı süresince Windows'un yazı boyutu bu telefona göre %175 yapılabilir; bağlantı bitince eski haline döner.
- ✅ [kalibrasyon] öneri: "Olduğu gibi kalsın" bu bilgisayar için kaydedildi, Windows değişmedi — {"kayit":false,"dpr0":1,"dpr1":1}
- ℹ️ [kalibrasyon] kapalı döngü: Windows dokunuşta imleci taşımadığı için ölçüm yapılamadı (yanlış fareye geçiş yok) — {"ilk":["#3 hedef(835,486) → gelen(835,336) fark(0,-150) touch imleç(960,540)","#4 hedef(1363,637) → gelen(1363,487) fark(0,-150) touch imleç(960,540)","#5 hedef(1862,594) → gelen(1862,444) fark(0,-150) touch imleç(960,540)"],"hata":null}
- ℹ️ [kalibrasyon] kalibrasyon sonrası ekran — {"ekran":"1024x768","dpr":1}
- ✅ [kalibrasyon] kalibrasyon: Köprü bu aşamada hiç çökmedi — 
- ℹ️ [gpu] GPU ile küçültme (KOPRU_GPU yok) — {"kare":99,"caps":["dxgi"],"boyut":{"w":960,"h":540},"renk":[228,57,55],"gunluk":[],"cokme":[]}
- ✅ [gpu] GPU ile küçültme varsayılan olarak kapalı (küçültülmüş akışta yakalama "dxgi", günlükte "açık" yok) — {"kare":99,"caps":["dxgi"],"boyut":{"w":960,"h":540},"renk":[228,57,55],"gunluk":[],"cokme":[]}
- ℹ️ [gpu] KOPRU_GPU=1 (yazılım bağdaştırıcısı): açıldı ve ilk kare denetimini geçti — {"kare":99,"caps":["dxgi +GPU ölçek"],"boyut":{"w":960,"h":540},"renk":[228,57,55],"gunluk":["2026/11/17 21:53:02 ekran kartında küçültme açık: 1024x768 → 512x384 (işlemciyle en büyük fark 1)"],"cokme":[]}
- ✅ [gpu] KOPRU_GPU=1: görüntü akıyor, renk doğru, çökme yok (GPU açılsa da kapansa da) — {"kare":99,"caps":["dxgi +GPU ölçek"],"boyut":{"w":960,"h":540},"renk":[228,57,55],"gunluk":["2026/11/17 21:53:02 ekran kartında küçültme açık: 1024x768 → 512x384 (işlemciyle en büyük fark 1)"],"cokme":[]}
- ✅ [gpu] gpu: Köprü bu aşamada hiç çökmedi — 
- ℹ️ [kur] kurulumdan önce hizmet — yok
- ✅ [kur] çift tıklayınca kendini Windows hizmeti olarak kurdu ve başlattı — Running
- ✅ [kur] program dosyaları kuruldu (kopru.exe, x264, opus) — ["kopru.exe","libx264-164.dll","opus.dll","vcruntime140.dll"]
- ✅ [kur] güvenlik duvarı kuralı eklendi — 
- ✅ [kur] Başlat menüsü kısayolu oluşturuldu — 
- ✅ [kur] hizmet kimlik aldı — 876914957
- ℹ️ [kur] Köprü süreçleri — 1948 oturum=0 NT AUTHORITY\SYSTEM
6924 oturum=2 NT AUTHORITY\SYSTEM
- ✅ [kur] ilk açılışta ayar sayfası (kimlik, parola, iPhone QR) tarayıcıda açıldı — 
- ✅ [kur] ayar sayfası kimlik ve otomatik parolayı gösteriyor — {"id":"876 914 957","parolaVar":true}
- ✅ [kur] kendi parolasını belirledi (artık sayfada gösterilmiyor) — 
- ✅ [kur] kur: Köprü bu aşamada hiç çökmedi — 
- ✅ [hizmet] sunucusuz: Cloudflare tüneli açıldı — https://mitsubishi-stories-ipaq-employee.trycloudflare.com
- ✅ [hizmet] hizmet: ilan panosundan bulup bağlandı — 2616 ms webrtc
- ℹ️ [hizmet] hizmet: ICE tanısı (istemci) — {"ok":true,"ice":"connected","toplama":"complete","yerel":{"host/?":2},"uzak":{"prflx/?":2,"host/v4":2,"srflx/v4":1},"ciftler":{"waiting":4,"succeeded":1},"istekGiden":3,"istekGelen":6,"yanitGelen":3,"gelen":9,"basarili":true,"secili":"host/? > host/v4","rtt":2,"sonuc":"doğrudan","ms":0}
- ✅ [hizmet] hizmet (SYSTEM) kullanıcı masaüstünü yakalıyor — {"cap":"dxgi","enc":"x264 superfast high444"}
- ✅ [hizmet] hizmet: fare tıklaması (SYSTEM işçisinden) — 
- ✅ [hizmet] hizmet: klavye ve Türkçe metin — hizmet 42 ÇŞ
- ✅ [hizmet] hizmet: pano (kullanıcı oturumunun panosu) — hizmet-pano-ĞÜ
- ✅ [hizmet] hizmet: dosya gezgini kullanıcının klasörlerini görüyor — ["Masaüstü=C:\\Users\\runneradmin\\Desktop","İndirilenler=C:\\Users\\runneradmin\\Downloads","Belgeler=C:\\Users\\runneradmin\\Documents","Kullanıcı klasörü=C:\\Users\\runneradmin","Sürücü C:=C:\\","Sürücü D:=D:\\"]
- ℹ️ [hizmet] hizmet: ölçek seçenekleri — {"changed":false,"cur":100,"display":0,"list":[100,125,150,175],"orig":100,"t":"scales"}
- ✅ [hizmet] hizmet: Windows yazı ölçeği %100 → %175 (programlar büyüdü, çözünürlük aynı) — {"once":1,"sonra":1.75,"cozunurluk":{"w":1920,"h":1080}}
- ✅ [hizmet] hizmet: çözünürlük 1280×720 olunca yazı boyutu aralığa sığdırıldı (%100) — {"liste":[100],"cur":100,"dpr":1}
- ✅ [hizmet] hizmet: 1920×1080'e dönünce seçilen %175 geri geldi — {"dpr":1.75}
- ✅ [hizmet] hizmet: yazı ölçeği eski haline döndü — {"geri":1}
- ✅ [hizmet] hizmet: telefona uydur (iPhone 15 Pro) → %175, programlar büyüdü — {"liste":[100,125,150,175],"cur":175,"dpr":1.75}
- ℹ️ [hizmet] kalibrasyon (hizmet): Windows'un girdi koordinat uzayı (ajanın tanısı) — {"%150":{"calisma":[0,0,1920,1008],"girdi":"monitör başına v2","monitor":[0,0,1920,1080],"olcek":150,"sanal":[0,0,1920,1080],"surec":"monitör başına v2"}}
- ✅ [hizmet] kalibrasyon (hizmet): %150 Doğrudan (fare) dokunuşları hedefte — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"mouse":9},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1}
- ✅ [hizmet] kalibrasyon (hizmet): %150 Tablet dokunuşları hedefte (kayma varsa kapalı döngüyle fareye geçtikten sonra) — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"touch":9},"imlec":{"olculen":9,"tasindi":0},"fareyeGecis":-1}
- ℹ️ [hizmet] kalibrasyon (hizmet): Windows dokunuşta imleci taşıyor mu (kapalı döngünün ölçebilmesi için) — {"olculen":9,"tasindi":0,"sonuc":"hayır (kapalı döngü ölçemez)"}
- ℹ️ [hizmet] kalibrasyon (hizmet): HİPOTEZ A (Windows %150'de enjekte edilen dokunuşu kaydırıyor) → REDDEDİLDİ — {"karar":"REDDEDİLDİ","neden":"%150'de dokunmatik (9 nokta) ve fare (9 nokta) ±12 px içinde","dokunmatik":{"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim":0},"y":{"egim":1,"kesisim":0},"turler":{"touch":9},"imlec":{"olculen":9,"tasindi":0},"fareyeGecis":-1},"fare":{"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":0,"ortFark":[0,0],"x":{"egim":1,"kesisim
- ✅ [hizmet] hizmet: tek parmak dokunuş Windows'a ulaştı — {"t":"pointerdown","x":215,"y":300,"pt":"touch","b":0,"id":"tap","ts":1794952146952,"dpr":1}
- ℹ️ [hizmet] hizmet: dokunuş türü — gerçek dokunmatik
- ✅ [hizmet] hizmet: Cloudflare tüneli üzerinden şifreli aktarım — 1604 ms 
- ✅ [hizmet] tünelde ekran değişince görüntü akıyor — 55 kare / 2,5 sn, RTT 53 ms
- ✅ [hizmet] tünelde fare tıklaması — 
- ℹ️ [hizmet] girdi → görüntü gecikmesi (Cloudflare tüneli üzerinden, internet) — {"olcumler":[115,115,115,116,116,116,116,117,122,132,133,133],"ortanca":116,"p90":133,"basarili":"12/12"}
- ✅ [hizmet] tünel üzerinden girdi → görüntü gecikmesi ölçüldü — {"olcumler":[115,115,115,116,116,116,116,117,122,132,133,133],"ortanca":116,"p90":133,"basarili":"12/12"}
- ℹ️ [hizmet] yeni tünel adresi — https://heads-threaded-causing-auto.trycloudflare.com
- ✅ [hizmet] tünel koptu, adres değişti → istemci kendiliğinden yeniden bağlandı — {"eski":"https://mitsubishi-stories-ipaq-employee.trycloudflare.com","yeni":"https://heads-threaded-causing-auto.trycloudflare.com","durum":"connected | Bağlantı koptu, yeniden bağlanılıyor…"}
- ✅ [hizmet] hizmet yeniden başlayınca ayar sayfası kendiliğinden açılmadı (ekranı kapatmıyor) — 0 tarayıcı penceresi
- ✅ [hizmet] hizmet yeniden başlayınca istemci parola sormadan geri bağlandı — connected | Bağlantı kuruluyor… | 
- ✅ [hizmet] işçi süreç çökünce hizmet onu yeniden başlattı, bilgisayar yine çevrimiçi — {"eski":"6224","yeni":"568"}
- ✅ [hizmet] iPhone için hedef program ekranı tam kaplıyor (telefon testleri ekranın oranına dokunur) — {"ok":true,"pencere":[1920,1080],"ekran":[1920,1080],"dpr":1}
- ℹ️ [hizmet] iPhone aşaması için Windows — {"id":"876914957","name":"runnervmm7ud1","url":"https://bigger-time-tire-earnings.trycloudflare.com","ekran":"1920x1080","ekranAyar":"0","hedef":{"ok":true,"pencere":[1920,1080],"ekran":[1920,1080],"dpr":1},"ses":true,"dpr":1}
- ✅ [hizmet] hizmet: Köprü bu aşamada hiç çökmedi — 
- ✅ [sifrele] hizmet parolası iPhone işinin açık anahtarıyla şifrelendi — 
- ℹ️ [bekle] iPhone işi — bitti
- ℹ️ [bekle] iPhone oturumunda Windows'taki programa gelen olaylar (özet) — {"durum":{"scroll":2327.428466796875,"ta":"Kopru-Ş1","tap":"rgb(0, 200, 0)","dbl":"rgb(96, 96, 96)","w":1098,"h":618,"sx":0,"sy":0,"dpr":1.75},"sayilar":{"keydown":23,"pointerdown:touch":16,"pointerup:touch":15,"mousedown":25,"wheel":58,"dblclick":2,"pointerdown:mouse":11,"pointerup:mouse":11,"contextmenu:touch":1},"son":[{"t":"keydown","k":"F2","id":"","ts":1794952810696,"dpr":1.75,"kal":"dogruda
- ✅ [bekle] gerçek iPhone Safari → Windows: Tablet (Windows %175) dokunuşları hedefte (±12 px, fareye geçildiyse sonrası) — {"nokta":10,"gelen":10,"isabet":10,"tol":12,"enBuyuk":3,"ortFark":[-1.7,-1.1],"x":{"egim":0.999,"kesisim":0},"y":{"egim":0.998,"kesisim":0},"turler":{"touch":10},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1}
- ✅ [bekle] gerçek iPhone Safari → Windows: Doğrudan (Windows %175) dokunuşları hedefte (±12 px) — {"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":3,"ortFark":[-1.8,-1.1],"x":{"egim":0.999,"kesisim":0},"y":{"egim":0.998,"kesisim":0},"turler":{"mouse":9},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1}
- ℹ️ [bekle] gerçek iPhone Safari: HİPOTEZ A → REDDEDİLDİ — {"karar":"REDDEDİLDİ","neden":"%150'de dokunmatik (10 nokta) ve fare (9 nokta) ±12 px içinde","dokunmatik":{"nokta":10,"gelen":10,"isabet":10,"tol":12,"enBuyuk":3,"ortFark":[-1.7,-1.1],"x":{"egim":0.999,"kesisim":0},"y":{"egim":0.998,"kesisim":0},"turler":{"touch":10},"imlec":{"olculen":0,"tasindi":0},"fareyeGecis":-1},"fare":{"nokta":9,"gelen":9,"isabet":9,"tol":12,"enBuyuk":3,"ortFark":[-1.8,-1.
- ✅ [bekle] gerçek iPhone Safari: iki parmakla kaydırmanın tekerleği parmakların altındaki alana gitti (#scroll) — {"tekerlek":58,"hedefler":["scroll"]}
- ℹ️ [bekle] gerçek iPhone Safari: çift dokunuş → Windows'ta çift tık (#dbl) — ["dbl","dbl"]
- ✅ [bekle] iPhone bağlantısı bitince Windows ölçeği eski haline döndü ("telefona göre büyüt" geri alındı) — {"iphoneSirasinda":1.75,"simdi":1}
- ℹ️ [bekle] ajan bağlantı geçmişi — ["13.105.117.235 235sn relay-ws iPhone","40.67.183.129 4sn direct ","40.67.183.129 23sn relay-ws ","40.67.183.129 2sn direct iPhone","40.67.183.129 58sn direct ","40.67.183.129 12sn direct iPhone","40.67.183.129 15sn direct iPhone"]
- ℹ️ [bekle] ICE tanısı: doğrudan yol / tünele geçiş nedenleri (hizmet günlüğü) — ["2026/11/17 21:48:05 [6194bc] doğrudan yol (direct): yerel host/v4×2 host/v6×2 srflx/v4×2; uzak host/mdns×1 prflx/v4×1 srflx/v4×1; çiftler in-progress×1 succeeded×3 waiting×8; istek giden 7 gelen 3, yanıt gelen 6; seçili host/v4>prflx/v4 rtt 0 ms","2026/11/17 21:48:30 [65bce1] doğrudan yol (direct): yerel host/v4×2 host/v6×2 srflx/v4×2; uzak host/mdns×1 srflx/v4×1; çiftler in-progress×5 succeeded
- ✅ [bekle] hizmet: GPU ile küçültme varsayılan olarak kapalı (günlükte "ekran kartında küçültme açık" yok) — []
- ✅ [bekle] hizmet: iPhone oturumunda WASAPI olay güdümlü yakalama kuruldu (günlük) — ["2026/11/17 21:49:08 ses yakalama: olay güdümlü (WASAPI loopback, 48000 Hz, 2 kanal)","2026/11/17 21:49:08 [ecafec] ses aktarımı başladı","2026/11/17 21:49:32 ses yakalama: olay güdümlü (WASAPI loopback, 48000 Hz, 2 kanal)","2026/11/17 21:49:32 [a6ed60] ses aktarımı başladı","2026/11/17 21:49:44 ses yakalama: olay güdümlü (WASAPI loopback, 48000 Hz, 2 kanal)","2026/11/17 21:49:44 [ae2621] ses akt
- ℹ️ [bekle] ekran geri alındı — {"sonuc":"0","simdi":"1024x768"}
- ℹ️ [bekle] hedef program yeniden ekrana yayıldı — {"ok":true,"pencere":[1024,768],"ekran":[1024,768],"dpr":1}
- ✅ [uzun] dayanıklılık: bağlantı — 1112 ms webrtc
- ✅ [uzun] dayanıklılık: 10 dakika boyunca bağlantı hiç kopmadı — {"durumDegisimleri":[]}
- ✅ [uzun] dayanıklılık: akıcılık düşmedi (ortalama ≥ 25 fps, en düşük ≥ 15 fps) — {"ortalama":28.6,"enDusuk":27.9,"rttOrt":1}
- ✅ [uzun] dayanıklılık: bellek şişmedi (artış < 80 MB) — {"basta":"98 MB","sonda":"106 MB"}
- ℹ️ [uzun] dayanıklılık örnekleri (15 sn arayla) — [{"fps":28.533333333333335,"rtt":1,"durum":"connected","ajanFps":28,"kbps":175},{"fps":28.466666666666665,"rtt":1,"durum":"connected","ajanFps":28,"kbps":175},{"fps":28,"rtt":1,"durum":"connected","ajanFps":30,"kbps":158},{"fps":28.4,"rtt":1,"durum":"connected","ajanFps":27,"kbps":134},{"fps":28.4,"rtt":1,"durum":"connected","ajanFps":29,"kbps":132},{"fps":28.466666666666665,"rtt":1,"durum":"conne
- ✅ [uzun] uzun: Köprü bu aşamada hiç çökmedi — 
- ✅ [son] yeni sürümü çift tıklayınca güncellendi; kimlik ve parola korundu — {"dosyaDegisti":true,"kimlikAyni":true,"baglandi":true,"hata":""}
- ✅ [son] son aşama bağlantısı — 
- ✅ [son] uzaktan Ctrl+Alt+Del güvenlik ekranını açtı — 
- ℹ️ [son] Ctrl+Alt+Del menüsü Esc ile kapandı — true
- ✅ [son] uzaktan kilitleme — 
- ✅ [son] kilit ekranında parolayı uzaktan yazıp Windows'u açtı — 
- ✅ [son] bağlantı bitince Windows kendiliğinden kilitlendi — 
- ✅ [son] art arda yanlış parolalardan sonra denemeler geçici olarak kilitlendi — ["Parola hatalı. Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.","Parola hatalı. Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.","Parola hatalı. Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.","Parola hatalı. Uzak bilgisayardaki Köprü penceresinde görünen parolayı girin.","Parola hatalı. 30 sn sonra tekrar deneyin.","Çok fazla hatalı deneme. 29 sn be
- ✅ [son] kaldırma: hizmet silindi — 
- ✅ [son] kaldırma: güvenlik duvarı kuralı silindi — 
- ✅ [son] son: Köprü bu aşamada hiç çökmedi — 

## iPhone Simülatörü (gerçek Mobile Safari)

- ℹ️ basla: {"t": "basla", "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1", "ekran": [440, 796, 3], "webcodecs": "function", "audioDecoder": "function", "audioWorklet": "function", "offline": "function", "rtc": "function", "mode": "p2p", "surum": "Köprü 1.2.11", "ts": 27582}
- ✅ baglanti: {"t": "baglanti", "ok": true, "ms": 7035, "yol": {"veriKanali": false, "tunel": true, "video": false, "cozulen": 4, "profil": "high", "baglanti": "tunnel", "rtp": null}, "boyut": {"w": 1280, "h": 720}, "tani": {"ice": "checking", "toplama": "complete", "yerel": {"srflx/v4": 2, "host/?/tcp": 2, "host/?": 2}, "uzak": {"srflx/v4": 2, "host/?": 2}, "ciftler": {"in-progress": 4}, "istekGiden": 46, "istekGelen": 0, "yanitGelen": 0, "gelen": 0, "basarili": false, "secili": null, "rtt": null, "sonuc": "tünel", "neden": "karşı taraftan ICE yanıtı yok", "ms": 2859}, "mesaj": "", "ts": 80602}
- ❌ goruntu-yolu: {"t": "goruntu-yolu", "ok": false, "veriKanali": false, "tunel": true, "video": false, "cozulen": 19, "profil": "high", "baglanti": "tunnel", "rtp": null, "ts": 87602}
- ✅ oneri-karti: {"t": "oneri-karti", "ok": true, "kart": "Ekran 1920×1080, yazı boyutu %100. Bağlantı süresince Windows'un yazı boyutu bu telefona göre %175 yapılabilir; bağlantı bitince eski haline döner.", "beklenen": 175, "olcek": {"changed": true, "cur": 175, "display": 0, "list": [100, 125, 150, 175], "orig": 100, "t": "scales"}, "kayit": true, "goruntu": {"boyut": {"w": 1280, "h": 720}, "cozulen": 4}, "ts": 95604}
- ✅ akis: {"t": "akis", "ok": true, "kareSn": 29.1, "yol": {"veriKanali": false, "tunel": true, "video": false, "cozulen": 269, "profil": "high", "baglanti": "tunnel", "rtp": null}, "boyut": {"w": 1280, "h": 720}, "ekran": {"i": 0, "name": "\\\\.\\DISPLAY1", "x": 0, "y": 0, "w": 1920, "h": 1080, "primary": true}, "ornekler": [{"cozulen": 40, "rtt": 45, "ajan": {"fps": 27, "kbps": 17, "cap": "dxgi", "enc": "x264 superfast high tek dilim", "netl": "sürüyor · 40 kare · RF 21.0 (hedef 24.5)", "yolKuyruk": -43, "yolKbps": 15}, "cizim": {"cozmeMs": 6.6, "beklemeMs": 8.1, "cizimMs": 0, "gecilen": 5, "atilan": 0, "yenidenKurma": 0, "kuyruk": 4}}, {"cozulen": 40, "rtt": 52, "ajan": {"fps": 28, "kbps": 19, "cap
- ✅ renk: {"t": "renk", "ok": true, "kirmizi": [227, 57, 52], "ts": 105148}
- ✅ klavye: {"t": "klavye", "ok": true, "renk": [253, 214, 0], "ts": 106008}
- ℹ️ girdi-durumu: {"t": "girdi-durumu", "mod": "tablet", "aktif": true, "inKanal": "open", "yetenek": {"audio": true, "audseq": true, "clipboard": true, "files": true, "input": true, "modes": true, "privacy": true, "sas": true, "scales": true, "touch": true, "typekeys": true}, "ts": 106011}
- ✅ dokunus: {"t": "dokunus", "ok": true, "once": [128, 128, 128], "sonra": [0, 201, 0], "gonderilen": 2, "bayt": 16, "ts": 106457}
- ✅ kaydirma: {"t": "kaydirma", "ok": true, "once": [211, 171, 17], "sonra": [18, 33, 213], "gonderilen": 19, "ts": 108264}
- ✅ iki-parmak-kaydirma: {"t": "iki-parmak-kaydirma", "ok": true, "tekerlekIleti": 69, "boylar": [9], "konum": [0.71, 0.75], "once": [18, 33, 213], "sonra": [249, 255, 247], "ts": 111099}
- ✅ cift-dokunus-tablet: {"t": "cift-dokunus-tablet", "ok": true, "ayniNokta": true, "basislar": [[54394, 7209], [54394, 7209]], "windowsCiftTik": true, "renk": [[121, 103, 107], [44, 232, 255]], "ts": 112680}
- ✅ cift-dokunus-direct: {"t": "cift-dokunus-direct", "ok": true, "ayniNokta": true, "basislar": [[54394, 7209], [54394, 7209]], "windowsCiftTik": true, "renk": [[44, 232, 255], [122, 100, 107]], "ts": 113865}
- ✅ buyutec: {"t": "buyutec", "ok": true, "erken": false, "acik": true, "merkez": [228, 60, 54], "kutu": [8, 143, 132], "parmak": [53, 301], "kapandi": true, "ts": 126299}
- ✅ uc-parmak: {"t": "uc-parmak", "ok": true, "windowsaTikGitmedi": true, "klavyeAcildi": true, "klavyeKapandi": true, "not": "iOS odak kuralı: klavye yalnızca gerçek dokunuşta açılır; sentetik dokunuşta sonuç yalnızca bilgi", "ts": 127572}
- ✅ kalibrasyon-tablet: ekran [1920, 1080], akış {'w': 1280, 'h': 720}, Windows ölçeği %175, bulunan 9/9, isabet 9, en büyük 2 px, fareye geçiş -1
    - #0 oran [0.12, 0.11] → fark [0, 1] px · ajan [230, 119] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #1 oran [0.435, 0.11] → fark [-1, 0] px · ajan [835, 119] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #2 oran [0.97, 0.11] → fark [-2, 0] px · ajan [1861, 119] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #3 oran [0.435, 0.45] → fark [0, 0] px · ajan [835, 486] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #4 oran [0.71, 0.59] → fark [-1, 0] px · ajan [1362, 637] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #5 oran [0.97, 0.55] → fark [-2, -1] px · ajan [1861, 593] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #6 oran [0.12, 0.95] → fark [0, -1] px · ajan [230, 1025] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #7 oran [0.435, 0.85] → fark [-1, -1] px · ajan [835, 917] (eşleme farkı [0, 0]) · imleç [1593, 119]
    - #8 oran [0.97, 0.95] → fark [-2, -1] px · ajan [1861, 1025] (eşleme farkı [0, 0]) · imleç [1593, 119]
- ✅ kalibrasyon-direct: ekran [1920, 1080], akış {'w': 1280, 'h': 720}, Windows ölçeği %175, bulunan 9/9, isabet 9, en büyük 2 px, fareye geçiş -1
    - #0 oran [0.12, 0.11] → fark [0, 1] px · ajan [230, 119] (eşleme farkı [0, 0]) · imleç [230, 119]
    - #1 oran [0.435, 0.11] → fark [-1, 1] px · ajan [835, 119] (eşleme farkı [0, 0]) · imleç [835, 119]
    - #2 oran [0.97, 0.11] → fark [-2, 0] px · ajan [1861, 119] (eşleme farkı [0, 0]) · imleç [1861, 119]
    - #3 oran [0.435, 0.45] → fark [0, 0] px · ajan [835, 486] (eşleme farkı [0, 0]) · imleç [835, 486]
    - #4 oran [0.71, 0.59] → fark [-1, 0] px · ajan [1362, 637] (eşleme farkı [0, 0]) · imleç [1362, 637]
    - #5 oran [0.97, 0.55] → fark [-2, -1] px · ajan [1861, 593] (eşleme farkı [0, 0]) · imleç [1861, 593]
    - #6 oran [0.12, 0.95] → fark [0, -1] px · ajan [230, 1025] (eşleme farkı [0, 0]) · imleç [230, 1025]
    - #7 oran [0.435, 0.85] → fark [-1, -1] px · ajan [835, 917] (eşleme farkı [0, 0]) · imleç [835, 917]
    - #8 oran [0.97, 0.95] → fark [-2, -1] px · ajan [1861, 1025] (eşleme farkı [0, 0]) · imleç [1861, 1025]
- ℹ️ kalibrasyon-tani: {"t": "kalibrasyon-tani", "bilgi": true, "windows": {"calisma": [0, 0, 1920, 996], "girdi": "monitör başına v2", "monitor": [0, 0, 1920, 1080], "olcek": 175, "sanal": [0, 0, 1920, 1080], "surec": "monitör başına v2"}, "os": "windows", "panel": "Dokunuş tanısı — kırmızı: telefon, yeşil: gönderilen, sarı: Windows imleciTelefon oranı 0.9700, 0.9500Bilgisayar fare: 1861, 1025 px · ekran 1920×1080@0,0 · kare 1920×1080Windows imleci 1861, 1025 · fark 0, 0 pxSayfa 440×796 · görünen 440×796 +0,+0 sayfa 0 ×1 · kaydırma 0,0 · klavye kapanışı 1Ekran 440×956 · dpr 3 · ana ekran uyg. hayır · güvenli alan ü0 s0 a0 sl0Sahne 0,0,440,796 · görüntü 0,274,440,248 · yakınlaştırma 1Olay client 427,509 · page 427
- ❌ netlestirme: {"t": "netlestirme", "ok": false, "once": "hedef · 3 kare · RF 21.0 (hedef 24.5)", "seri": [{"ms": 304, "netl": "hedef · 3 kare · RF 21.0 (hedef 24.5)"}, {"ms": 907, "netl": "sürüyor · 13 kare · RF 45.3 (hedef 24.5)"}, {"ms": 2109, "netl": "iyileşme yok · 14 kare · RF 45.1 (hedef 24.5)"}], "cozulenKare": 15, "ts": 157852}
- ❌ istatistik: {"t": "istatistik", "ok": false, "denetim": {"baglanti": false, "surum": true, "cozucu": true, "cozmeCizim": true, "netlestirme": true, "ses": true}, "surum": "1.2.11", "satirlar": {"Bağlantı": "Güvenli tünel (uçtan uca şifreli)", "Gecikme": "43 ms", "Görüntü": "1280×720 (ekran 1920×1080) · 0 fps", "Bit hızı": "0.0 Mbps (hedef 5.8)", "Kodlayıcı": "x264 superfast high tek dilim", "Netleştirme": "hedef · 5 kare · RF 21.0 (hedef 21.5)", "Performans": "Tam", "Çözücü": "WebCodecs (high)", "Çözme / çizim": "40.0 / 11.0 / 0.1 ms · geçilen 84 · atılan 0 · yeniden kurma 0 · anahtar istek 0 · kuyruk 0", "Yol denetimi": "kuyruk 0 ms · teslim 0.6 Mbps · düşüş 4 / bekleme 8", "Ses": "tünel (bekleniyor)",
- ✅ istatistik-yol-denetimi: {"t": "istatistik-yol-denetimi", "ok": true, "satir": "kuyruk 0 ms · teslim 0.6 Mbps · düşüş 4 / bekleme 8", "ajanDegerleri": {"flowQ": 0, "flowKbps": 638, "flowCuts": 4, "flowHolds": 8}, "not": "1.2.8 sonrası: satır veri kanalı yolunda da çiziliyor (main.js flowNote)", "ts": 163063}
- ℹ️ ses: {"t": "ses", "bilgi": true, "atlandi": "Windows'tan ses gelmiyor (ses aygıtı yok ya da ses kapalı)", "yetenek": true, "audseq": true, "acik": true, "hata": "", "kanal": null, "paketSn": 0, "sureler": [], "cozum": null, "calici": {"yuklendi": true, "rms": 0, "istatistik": 3, "son": {"buf": 0, "target": 30, "c": null, "jitter": 0, "pkts": 0, "under": 0, "lost": 0, "late": 0, "acc": 0, "exp": 0, "conceal": 0, "resync": 0, "skip": 0}}, "ts": 166552}
- ℹ️ ses-cikis: {"t": "ses-cikis", "bilgi": true, "baglam": "suspended", "calici": true, "gercekDokunus": null, "oynatici": null, "not": "tünel (bekleniyor)", "cikisGecikmesiMs": 3, "ts": 166557}
- ✅ dondurme: {"t": "dondurme", "ok": true, "once": {"ekran": [440, 796], "akis": {"w": 1280, "h": 720}}, "yatay": {"ekran": [956, 376], "tuval": [633, 356], "sahne": [832, 356], "sigdi": true, "akis": {"w": 1920, "h": 1080}}, "dokunusFark": [0, 0], "geriDondu": true, "istek": {"ok": true, "cikti": "menu item Rotate Left of menu Device of menu bar item Device of menu bar 1 of application process Simulator", "hata": "", "yol": "menü"}, "geriIstek": {"ok": true, "cikti": "menu item Rotate Right of menu Device of menu bar item Device of menu bar 1 of application process Simulator", "hata": "", "yol": "menü"}, "ts": 184665}
- ℹ️ arka-plan-hazir: {"t": "arka-plan-hazir", "ts": 184677}
- ❌ geri-donus: {"t": "geri-donus", "ok": false, "arkaPlanSn": 14, "toparlanmaMs": 615, "sonraAkiyor": true, "durum": "connected", "yol": {"veriKanali": false, "tunel": true, "video": false, "cozulen": 533, "profil": "high", "baglanti": "tunnel", "rtp": null}, "cozulemeyen": [], "cizim": "53.1 / 35.2 / 1.3 ms · geçilen 94 · atılan 0 · yeniden kurma 1 (geri dönüş) · anahtar istek 1 · kuyruk 4", "ts": 225033}
- ℹ️ bitti: {"t": "bitti", "sureSn": 156, "ts": 230037}
