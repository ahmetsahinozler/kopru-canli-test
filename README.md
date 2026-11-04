# Köprü canlı test

Bu depo yalnızca **Köprü**'nün canlı testini GitHub'ın ücretsiz Windows ve macOS
makinelerinde çalıştırmak içindir. Kaynak kod burada değildir.

- `kopru.exe`, `yeni/kopru.exe`: test edilen sürüm (ikincisi güncelleme senaryosu için).
- `web/static`: iPhone'da açılan istemci (kopru.exe'nin içindekinin aynısı).
- `test/canli`: Windows ve iPhone Simülatörü (Mobile Safari) test betikleri.
- `.github/workflows/canli-test.yml`: Windows + iPhone işleri; sonuçlar `canli-test-sonuc` dalına yazılır.

Test her `kopru.exe` değişikliğinde ya da Actions sekmesinden elle başlatılır.
