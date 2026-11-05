# 4K canlı test hazırlığı (GitHub Actions windows-latest, yönetici olarak çalışır).
#
# Kullanıcının asıl kurulumu 3840×2160 + %150; GitHub'ın sanal makinesinde ise
# yalnızca Hyper-V ekran kartı var (en çok 1920×1080). Bu betik açık kaynak ve
# imzalı (SignPath Foundation) IddCx tabanlı Virtual Display Driver'ı
# (github.com/VirtualDrivers/Virtual-Display-Driver, MIT) NefCon
# (github.com/nefarius/nefcon, BSD-3) ile kurar, sanal monitörü 3840×2160 birincil
# ekran yapar, Hyper-V monitörünü ayırır (ya da -IkiMonitor ile sola, negatif
# koordinatlara alır) ve Windows ölçeğini %150'ye getirir. -Hdr ile sanal
# monitörde HDR açılmaya çalışılır (Windows 11 23H2+ / Server 2025 ve sürücünün
# HDR desteği gerekir; açılamazsa uyarı yazılır, iş akışı sürer).
#
# İndirilen dosyalar sabit sürüm ve SHA-256 ile doğrulanır.
[CmdletBinding()]
param(
    [int]$Genislik = 3840,
    [int]$Yukseklik = 2160,
    [int]$Olcek = 150,
    [switch]$IkiMonitor,
    [switch]$Hdr,
    [string]$Cikti = "$env:GITHUB_WORKSPACE\out"
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Cikti | Out-Null

$VddUrl = 'https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/25.7.23/VirtualDisplayDriver-x86.Driver.Only.zip'
$VddSha = 'E24210692B442B39AF763536330CE78B423F19342B7A7792C26DE3944E418B3A'
$NefUrl = 'https://github.com/nefarius/nefcon/releases/download/v1.14.0/nefcon_v1.14.0.zip'
$NefSha = 'A15557DA24A9EFCA203158DE3B43B0EAF982DB231F0194031F1ED428BC13E669'

function Indir($url, $sha, $dosya) {
    Invoke-WebRequest -Uri $url -OutFile $dosya -UseBasicParsing
    $h = (Get-FileHash $dosya -Algorithm SHA256).Hash
    if ($h -ne $sha) { throw "SHA-256 uyuşmuyor: $url ($h)" }
}

Add-Type @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public class Kopru4K {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DD {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DM {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name;
    public short SpecVersion, DriverVersion, Size, DriverExtra; public int Fields;
    public int PosX, PosY, Orientation, FixedOutput;
    public short Color, Duplex, YResolution, TTOption, Collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string FormName;
    public short LogPixels; public int BitsPerPel, PelsWidth, PelsHeight, DisplayFlags, DisplayFrequency;
    public int ICMMethod, ICMIntent, MediaType, DitherType, Reserved1, Reserved2, PanningWidth, PanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SrcName {
    public int Type; public uint Size; public uint AdLo; public int AdHi; public uint Id;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name;
  }
  [StructLayout(LayoutKind.Sequential)] public struct ScaleGet { public int Type; public uint Size; public uint AdLo; public int AdHi; public uint Id; public int Min, Cur, Max; }
  [StructLayout(LayoutKind.Sequential)] public struct Val { public int Type; public uint Size; public uint AdLo; public int AdHi; public uint Id; public int V; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, int i, ref DD dd, int f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool EnumDisplaySettings(string d, int m, ref DM dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string d, ref DM dm, IntPtr h, int f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string d, IntPtr dm, IntPtr h, int f, IntPtr p);
  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);
  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint f, ref uint np, byte[] paths, ref uint nm, byte[] modes, IntPtr z);
  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref SrcName s);
  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref ScaleGet s);
  [DllImport("user32.dll")] static extern int DisplayConfigSetDeviceInfo(ref Val s);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);

  static Kopru4K() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {} }

  public static List<DD> Aygitlar() {
    var l = new List<DD>();
    for (int i = 0; ; i++) { var d = new DD(); d.cb = Marshal.SizeOf(typeof(DD)); if (!EnumDisplayDevices(null, i, ref d, 0)) break; l.Add(d); }
    return l;
  }
  public static string Sanal() {
    foreach (var d in Aygitlar()) if (d.DeviceString.IndexOf("Virtual Display", StringComparison.OrdinalIgnoreCase) >= 0) return d.DeviceName;
    return null;
  }
  static DM Kip(string name) { var dm = new DM(); dm.Size = (short)Marshal.SizeOf(typeof(DM)); if (!EnumDisplaySettings(name, -1, ref dm)) EnumDisplaySettings(name, -2, ref dm); return dm; }
  // Boyut monitörün fiziksel kipini verir (DPI sanallaştırmasından etkilenmez).
  public static string Boyut(string name) { var dm = new DM(); dm.Size = (short)Marshal.SizeOf(typeof(DM)); if (!EnumDisplaySettings(name, -1, ref dm)) return "?"; return dm.PelsWidth + "x" + dm.PelsHeight + "@" + dm.PosX + "," + dm.PosY + " " + dm.DisplayFrequency + "Hz"; }
  // Ayarla sanal monitörü w×h birincil ekran yapar; öteki monitörleri ayırır ya da (iki) sola alır.
  public static string Ayarla(int w, int h, bool iki) {
    string v = Sanal(); if (v == null) return "sanal monitör yok";
    var log = new List<string>();
    var dm = Kip(v); dm.PelsWidth = w; dm.PelsHeight = h; dm.PosX = 0; dm.PosY = 0; dm.Fields = 0x20 | 0x80000 | 0x100000;
    log.Add(v + " -> " + ChangeDisplaySettingsEx(v, ref dm, IntPtr.Zero, 0x10 | 0x1 | 0x10000000, IntPtr.Zero));
    foreach (var d in Aygitlar()) {
      if (d.DeviceName == v || (d.StateFlags & 1) == 0) continue;
      var o = Kip(d.DeviceName);
      if (iki) { int ow = o.PelsWidth > 0 ? o.PelsWidth : 1920; o.PosX = -ow; o.PosY = 0; o.Fields = 0x20; }
      else { o.PelsWidth = 0; o.PelsHeight = 0; o.PosX = 0; o.PosY = 0; o.Fields = 0x20 | 0x80000 | 0x100000; }
      log.Add(d.DeviceName + (iki ? " sola" : " ayrıldı") + " -> " + ChangeDisplaySettingsEx(d.DeviceName, ref o, IntPtr.Zero, 0x1 | 0x10000000, IntPtr.Zero));
    }
    log.Add("uygula -> " + ChangeDisplaySettingsEx(null, IntPtr.Zero, IntPtr.Zero, 0, IntPtr.Zero));
    return string.Join("; ", log);
  }
  // Yol: GDI adına karşılık gelen DisplayConfig kaynağı (ölçek) ve hedefi (HDR).
  static bool Yol(string gdi, out Val src, out Val tgt) {
    src = new Val(); tgt = new Val();
    uint np, nm; if (GetDisplayConfigBufferSizes(2, out np, out nm) != 0 || np == 0) return false;
    var paths = new byte[np * 72]; var modes = new byte[(nm + 1) * 64];
    if (QueryDisplayConfig(2, ref np, paths, ref nm, modes, IntPtr.Zero) != 0) return false;
    for (int i = 0; i < np; i++) {
      int o = i * 72;
      var s = new SrcName(); s.Type = 1; s.Size = (uint)Marshal.SizeOf(typeof(SrcName));
      s.AdLo = BitConverter.ToUInt32(paths, o); s.AdHi = BitConverter.ToInt32(paths, o + 4); s.Id = BitConverter.ToUInt32(paths, o + 8);
      if (DisplayConfigGetDeviceInfo(ref s) != 0 || !string.Equals(s.Name, gdi, StringComparison.OrdinalIgnoreCase)) continue;
      src.AdLo = s.AdLo; src.AdHi = s.AdHi; src.Id = s.Id;
      tgt.AdLo = BitConverter.ToUInt32(paths, o + 20); tgt.AdHi = BitConverter.ToInt32(paths, o + 24); tgt.Id = BitConverter.ToUInt32(paths, o + 28);
      return true;
    }
    return false;
  }
  static readonly int[] Adim = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };
  // OlcekOku şu anki ölçeği yüzde olarak verir (-1: okunamadı).
  public static int OlcekOku(string gdi) {
    Val src, tgt; if (!Yol(gdi, out src, out tgt)) return -1;
    var g = new ScaleGet(); g.Type = -3; g.Size = (uint)Marshal.SizeOf(typeof(ScaleGet)); g.AdLo = src.AdLo; g.AdHi = src.AdHi; g.Id = src.Id;
    if (DisplayConfigGetDeviceInfo(ref g) != 0) return -1;
    int i = -g.Min + g.Cur; return i >= 0 && i < Adim.Length ? Adim[i] : -1;
  }
  // OlcekYaz ölçeği yüzde olarak ayarlar (Windows "önerilene göre basamak" ister).
  public static string OlcekYaz(string gdi, int pct) {
    Val src, tgt; if (!Yol(gdi, out src, out tgt)) return "yol bulunamadı";
    var g = new ScaleGet(); g.Type = -3; g.Size = (uint)Marshal.SizeOf(typeof(ScaleGet)); g.AdLo = src.AdLo; g.AdHi = src.AdHi; g.Id = src.Id;
    if (DisplayConfigGetDeviceInfo(ref g) != 0) return "ölçek okunamadı";
    int want = Array.IndexOf(Adim, pct); if (want < 0) return "geçersiz ölçek";
    int raw = want - (-g.Min);
    if (raw < g.Min || raw > g.Max) return "bu çözünürlükte izin yok (aralık " + Adim[0] + ".." + Adim[Math.Min(Adim.Length - 1, -g.Min + g.Max)] + ")";
    var s = new Val(); s.Type = -4; s.Size = (uint)Marshal.SizeOf(typeof(Val)); s.AdLo = src.AdLo; s.AdHi = src.AdHi; s.Id = src.Id; s.V = raw;
    return "DisplayConfigSetDeviceInfo -> " + DisplayConfigSetDeviceInfo(ref s);
  }
  // HdrAc sanal monitörde gelişmiş rengi (HDR) açar.
  public static string HdrAc(string gdi) {
    Val src, tgt; if (!Yol(gdi, out src, out tgt)) return "yol bulunamadı";
    tgt.Type = 10; tgt.Size = (uint)Marshal.SizeOf(typeof(Val)); tgt.V = 1; // DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE
    return "SET_ADVANCED_COLOR_STATE -> " + DisplayConfigSetDeviceInfo(ref tgt);
  }
}
"@

$tmp = Join-Path $env:RUNNER_TEMP 'vdd'
New-Item -ItemType Directory -Force $tmp | Out-Null
"İndiriliyor: Virtual Display Driver 25.7.23, NefCon 1.14.0"
Indir $VddUrl $VddSha "$tmp\vdd.zip"
Indir $NefUrl $NefSha "$tmp\nefcon.zip"
Expand-Archive -Force "$tmp\vdd.zip" $tmp
Expand-Archive -Force "$tmp\nefcon.zip" $tmp

# Sürücü ayarı (monitör sayısı, çözünürlükler) kurulumdan önce yerinde olmalı.
New-Item -ItemType Directory -Force 'C:\VirtualDisplayDriver' | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'vdd_settings.xml') 'C:\VirtualDisplayDriver\vdd_settings.xml' -Force

# Kataloğun imzalayan sertifikaları "Güvenilen Yayımcılar"a: kurulum sessiz geçsin.
$certs = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$certs.Import([IO.File]::ReadAllBytes("$tmp\VirtualDisplayDriver\mttvdd.cat"))
foreach ($c in $certs) {
    $f = Join-Path $tmp "$($c.Thumbprint).cer"
    [IO.File]::WriteAllBytes($f, $c.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    Import-Certificate -FilePath $f -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null
    "sertifika: $($c.Subject)"
}

"Ekranlar (önce): " + (([Kopru4K]::Aygitlar() | Where-Object { $_.StateFlags -band 1 } | ForEach-Object { "$($_.DeviceName)=$($_.DeviceString)" }) -join '; ')
& "$tmp\x64\nefconc.exe" install "$tmp\VirtualDisplayDriver\MttVDD.inf" 'Root\MttVDD'
"nefconc çıkış kodu: $LASTEXITCODE"

$v = $null
for ($i = 0; $i -lt 60 -and -not $v; $i++) { Start-Sleep 1; $v = [Kopru4K]::Sanal() }
if (-not $v) {
    Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | Format-Table -AutoSize | Out-String -Width 200
    throw 'Sanal monitör 60 sn içinde görünmedi'
}
"Sanal monitör: $v"
Start-Sleep 3

$r = [Kopru4K]::Ayarla($Genislik, $Yukseklik, [bool]$IkiMonitor)
"Ekran düzeni: $r"
Start-Sleep 4
if ($Hdr) {
    "HDR: " + [Kopru4K]::HdrAc($v)
    Start-Sleep 4
}
for ($i = 0; $i -lt 5; $i++) {
    $s = [Kopru4K]::OlcekYaz($v, $Olcek)
    Start-Sleep 2
    $cur = [Kopru4K]::OlcekOku($v)
    "Ölçek %$Olcek denemesi: $s · şu an %$cur"
    if ($cur -eq $Olcek) { break }
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$ekranlar = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.DeviceName) $($_.Bounds.Width)x$($_.Bounds.Height)@$($_.Bounds.X),$($_.Bounds.Y) birincil=$($_.Primary)" }
"Ekranlar (sonra): " + ($ekranlar -join '; ')
$kip = [Kopru4K]::Boyut($v)
"Sanal monitörün kipi: $kip"
$ozet = [ordered]@{
    sanal = $v; kip = $kip; duzen = $r; ekranlar = $ekranlar; olcek = [Kopru4K]::OlcekOku($v)
    hdr = [bool]$Hdr; ikiMonitor = [bool]$IkiMonitor
    ekranKartlari = (Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name) $($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)" })
}
$ozet | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 "$Cikti\ekran-4k.json"
try {
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
    [Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save("$Cikti\masaustu-4k-baslangic.png")
} catch { "ekran görüntüsü alınamadı: $_" }

if (-not $kip.StartsWith("${Genislik}x${Yukseklik}@0,0")) {
    throw "Sanal monitör $kip; beklenen ${Genislik}x${Yukseklik}, birincil (0,0)"
}
if ($ozet.olcek -ne $Olcek) { Write-Warning "Ölçek %$($ozet.olcek) kaldı (beklenen %$Olcek); testler yine de koşuyor" }
"Hazır: ${Genislik}x${Yukseklik}, ölçek %$($ozet.olcek)"
