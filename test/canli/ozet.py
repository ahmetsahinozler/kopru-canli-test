"""Canlı test sonuçlarını Markdown özetine çevirir: python3 ozet.py <sonuç klasörü>

Klasör düzeni (GitHub Actions artefaktları):
  windows-sonuc/sonuc-<aşama>.json   Windows denetimleri (phase, name, pass|note, info)
  windows-sonuc/kalibrasyon-*.json   dokunuş kalibrasyonu ölçümleri (nokta nokta)
  iphone-sonuc/iphone-sonuc.jsonl    Safari'deki testin satırları (t, ok, ...)
"""
import glob, json, os, sys

d = sys.argv[1]
SIRA = ["yerel", "kalibrasyon", "gpu", "kur", "hizmet", "sifrele", "bekle", "uzun", "son"]


def oku(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def isaret(r):
    return "ℹ️" if r.get("note") else ("✅" if r.get("pass") else "❌")


win = []
dosyalar = glob.glob(os.path.join(d, "windows-sonuc", "sonuc-*.json"))
dosyalar.sort(key=lambda f: (SIRA.index(os.path.basename(f)[6:-5]) if os.path.basename(f)[6:-5] in SIRA else 99, f))
for f in dosyalar:
    win += oku(f) or []

ip = []
p = os.path.join(d, "iphone-sonuc", "iphone-sonuc.jsonl")
if os.path.exists(p):
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            ip.append(json.loads(line))
        except ValueError:
            ip.append({"t": "okunamadı", "ham": line[:400]})


def ipisaret(r):
    if r.get("ok") is True:
        return "✅"
    if r.get("ok") is False or r.get("t") == "hata":
        return "❌"
    return "ℹ️"


print(f"# Canlı test — çalıştırma {os.environ.get('GITHUB_RUN_ID', '?')}")
print(f"\nKaynak: {os.environ.get('GITHUB_SHA', '?')}\n")
wd = [r for r in win if not r.get("note")]
idn = [r for r in ip if r.get("ok") in (True, False) or r.get("t") == "hata"]
print(f"**Windows:** {sum(1 for r in wd if r.get('pass'))}/{len(wd)} geçti · "
      f"**iPhone (Safari):** {sum(1 for r in idn if r.get('ok') is True)}/{len(idn)} geçti\n")
kotu = [r for r in wd if not r.get("pass")] + [r for r in idn if r.get("ok") is not True]
if kotu:
    print("Başarısızlar:\n")
    for r in kotu:
        if "phase" in r:
            print(f"- ❌ [{r.get('phase')}] {r.get('name')}")
        else:
            print(f"- ❌ iPhone {r.get('t')}")
    print()

# ---- dokunuş kalibrasyonu: hipotez A (Windows %150'de enjekte edilen dokunuşu kaydırıyor mu) ----
kal = sorted(glob.glob(os.path.join(d, "windows-sonuc", "kalibrasyon-*.json")))
if kal:
    print("## Dokunuş kalibrasyonu (hedef ↔ Windows'un olayı koyduğu yer, fiziksel piksel)\n")
    for f in kal:
        k = oku(f) or {}
        print(f"### {os.path.basename(f)} — {k.get('ortam', '')}\n")
        h = k.get("hipotez")
        if h:
            print(f"**Hipotez A → {h.get('karar')}**: {h.get('neden')}\n")
        if k.get("hata"):
            print(f"Hata: {k.get('hata')}\n")
        if k.get("tani"):
            print(f"Windows'un girdi koordinat uzayı (ajan tanısı): `{json.dumps(k.get('tani'), ensure_ascii=False)[:600]}`\n")
        for ad, t in (k.get("turlar") or {}).items():
            oz = t.get("ozet") or {}
            print(f"**{ad}** — isabet {oz.get('isabet')}/{oz.get('gelen')} (±{oz.get('tol')} px), en büyük {oz.get('enBuyuk')}, "
                  f"ortalama fark {oz.get('ortFark')}, uyum x {oz.get('x')} y {oz.get('y')}, türler {oz.get('turler')}, "
                  f"imleç {oz.get('imlec')}, fareye geçiş {oz.get('fareyeGecis')}{' · ' + t['hata'] if t.get('hata') else ''}\n")
            print("| # | hedef | gelen | fark | tür | ajan pikseli | imleç | not |")
            print("|---|---|---|---|---|---|---|---|")
            for r in t.get("rows") or []:
                print(f"| {r.get('i')} | {r.get('hedef')} | {r.get('gelen')} | {r.get('fark')} | {r.get('tur') or ''} | "
                      f"{r.get('ajan') or ''} | {r.get('imlec') or ''} | {'fareye geçti' if r.get('bildirim') else ''} |")
            print()

print("## Windows (gerçek sanal makine)\n")
for r in win:
    print(f"- {isaret(r)} [{r.get('phase')}] {r.get('name')} — {str(r.get('info', ''))[:400]}")

print("\n## iPhone Simülatörü (gerçek Mobile Safari)\n")
if not ip:
    print("- sonuç yok")
for r in ip:
    t = r.get("t", "")
    if t.startswith("kalibrasyon-") and isinstance(r.get("satirlar"), list):
        print(f"- {ipisaret(r)} {t}: ekran {r.get('ekran')}, akış {r.get('akis')}, Windows ölçeği %{r.get('olcek')}, "
              f"bulunan {r.get('bulunan')}, isabet {r.get('isabet')}, en büyük {r.get('enBuyuk')} px, fareye geçiş {r.get('fareyeGecis')}")
        for s in r["satirlar"]:
            print(f"    - #{s.get('i')} oran {s.get('oran')} → fark {s.get('fark')} px · ajan {s.get('ajan')} (eşleme farkı {s.get('ajanFark')}) "
                  f"· imleç {s.get('imlec')}{' · ' + s['bildirim'] if s.get('bildirim') else ''}")
        continue
    print(f"- {ipisaret(r)} {t}: {json.dumps(r, ensure_ascii=False)[:700]}")
