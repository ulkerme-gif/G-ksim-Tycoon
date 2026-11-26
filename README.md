# Havalimanı Tycoon

Tarayıcıda çalışan, 3B havalimanı kurma ve işletme oyunu. Boş bir arazide pist, taksi yolu, apron, terminal, park yeri, yolcu köprüsü, kule ve hangar kurarsınız. Havayollarıyla anlaşma yaparsınız. Uçaklar iner, park yerine taksi yapar, yer hizmetlerinden geçer, pushback ile ayrılır ve kalkar.

## Oynamak

`index.html` tek başına çalışır, sunucu ya da kurulum gerekmez. GitHub Pages'te yayınlamak için:

1. Bu klasördeki dosyaları yeni bir depoya yükleyin (`index.html` deponun kök dizininde olmalı).
2. **Settings → Pages** bölümünde kaynak olarak ana dalı ve kök dizini (`/`) seçin. "GitHub Actions" kullanıyorsanız **Static HTML** iş akışı da olur.
3. Birkaç dakika sonra oyun `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde açılır.

## Kontroller

| İşlem | Fare / klavye | iPad |
|---|---|---|
| Kaydırma | Sol tık sürükle, WASD, oklar | Tek parmak |
| Yakınlaştırma | Tekerlek, trackpad'de kıstır, + / − | İki parmak kıstır, çift dokun, sağ alttaki + / − |
| Döndürme | Sağ tık sürükle, Q / E | İki parmakla belirgin çevir |
| Eğme | Sağ tık yukarı/aşağı, PageUp / PageDown | İki parmağı birlikte yukarı/aşağı kaydır |
| Kuzeye dön | Sağ alttaki pusula | Sağ alttaki pusula |
| İnşaat araçları | Soldaki düğmeler, 1–9 | Soldaki düğmeler |
| Döndür | R | Alttaki "Döndür" |
| Taksi yolu, apron, yıkım | Sürükle | Tek parmakla sürükle |
| Duraklat | Boşluk | Üstteki ‖ düğmesi |
| Dosyaya kaydet / dosyadan aç | Ctrl/⌘+S, Ctrl/⌘+O | Menü (☰) |

Yakınlaştırırken parmakların ya da imlecin altındaki nokta yerinde kalır. Çok yakındayken kamera kendiliğinden yatıklaşır, uçaklar yandan görünür.

## Kayıt

- Oyun her oyun saatinde ve sekme kapanırken tarayıcıya (localStorage) kendiliğinden kaydedilir.
- **Menü → Dosyaya kaydet** ilerlemeyi küçük bir `.json` dosyası olarak indirir (iPad'de Dosyalar uygulamasında İndirilenler klasörüne gider). **Menü → Dosyadan yükle** ile bu dosyayı başka bir cihazda ya da tarayıcı verisi silindikten sonra açabilirsiniz.
- Kayıt anında havada ya da yerde olan uçaklar kayda girmez; tarife kaldığı yerden devam eder.

## Oynanış

- **Kule ve terminal** olmadan uçuş gelmez.
- **Park yeri** kurarken ok, uçağın burnunun bakacağı yönü gösterir. Park yerinin arkasındaki kare taksi yoluna ya da aprona bağlı olmalı.
- **Pist çıkışları**: pistin kenarına değen her taksi yolu karesi bir çıkıştır. İnen uçak, durabileceği ilk uygun çıkışı kullanır. Pistin iki ucuna yakın bağlantılar kalkışları hızlandırır; yoksa uçaklar pistte geri taksi yapar, pist uzun süre dolu kalır ve iniş yapacak uçaklar pas geçebilir.
- **Yolcu köprüsü**: ön kenarı terminale bitişik (en fazla bir kare boşluk) park yerlerine kurulur. Köprüsüz park yerlerinde yolcular otobüs ve merdivenle iner, havayolları daha az memnun olur.
- **Havayolları** her gün yeni teklif verir. Gecikmeler, pas geçmeler ve başka havalimanına yönlendirmeler memnuniyeti düşürür. Memnuniyet %15'in altına inerse havayolu anlaşmayı bitirir.
- **Puan** (yıldız) memnuniyet, deneyim ve tesislerle artar. Yüksek puan daha büyük havayollarının kilidini açar. Geniş gövdeli uçak işleten havayolları uzun pist, geniş park yeri ve hangar ister.
- **Gece yarısı** bakım ve personel giderleri ödenir. Finans panelinde günlük gelir ve giderleri görebilirsiniz.

## Uçuş kulübü (pilot modu)

**Yükseltmeler → Uçuş kulübü** (seviye 2, ₺3 Mn) alınınca sağ altta sarı **Uç** düğmesi çıkar. Uçak tipini ve kalkış pistini seçip kendi uçağınızla kalkar, havalimanınızın üstünde dolaşır ve geri inersiniz. 2. kademe dar gövde, 3. kademe geniş gövde jeti açar.

| | iPad | Klavye |
|---|---|---|
| Çubuk | Sol alttaki daireyi sürükleyin (aşağı = burun yukarı; ayarlardan ters çevrilebilir) | Oklar / WASD (↑ burun aşağı, ↓ burun yukarı) |
| Gaz | Sağdaki gaz çubuğu | PageUp/PageDown, + / −, Shift / Ctrl |
| İniş takımı, flap, fren | Ekrandaki düğmeler | G, F, B (Boşluk basılıyken fren) |
| Kamera | Kamera düğmesi; ekranı sürükleyip çevirin, kıstırıp yakınlaştırın, çift dokunup sıfırlayın | C (takip / kokpit / kule) |
| Çıkış | Çık | Esc |

- Uçuş modeli bağışlayıcıdır: çubuk bırakılınca kanatlar düzelir ve uçak tırmanış ya da alçalma açısını korur; hız gazla ayarlanır.
- Pistin başında, kalkış sırasında ve son yaklaşmada pist trafiğe kapanır. Sizin yüzünüzden pas geçen uçaklar havayolu memnuniyetini düşürmez.
- İniş rehberi pisti, mesafeyi, süzülüşü (3°) ve hizayı gösterir; pist kenarındaki PAPI ışıkları doğru süzülüşte 2 beyaz 2 kırmızı yanar.
- İniş takımı kapalı, dakikada ~1.500 fitten sert ya da kanat yere değerek inilirse kaza olur (ücret yok, yeniden kalkabilirsiniz).
- Piste iyi inişler ödül getirir (kusursuz < 60 ft/dk). Uçuş sırasında oyun 1× hızda akar.

## Grafik ve pil

**Menü → Grafik ve pil** üç ayar sunar. iPad'de varsayılan **Dengeli**dir.

- **Pil tasarrufu**: düşük çözünürlük, en çok 30 kare/sn, gölge ve bulut yok.
- **Dengeli**: orta çözünürlük, en çok 30 kare/sn, gölgeler saniyede 12 kez güncellenir.
- **Yüksek**: tam çözünürlük, 60 kare/sn, yumuşak gölgeler.

Oyun duraklatıldığında ve ekrana dokunulmadığında çizim saniyede birkaç kareye iner; boşta pil harcanmaz.

Grafikler: bulutlu ve yıldızlı gökyüzü, gece pist/taksi yolu/yaklaşma ışıkları, PAPI, apron projektörleri, bina pencere ışıkları, uçakların seyir ışıkları, çakarları ve iniş farları, kalkıştan sonra toplanan iniş takımı, havalimanı çevresinde tarlalar, kasabalar, göl, yollar ve uzak tepeler.

## Hedefler ve ilerleme

5 yıldıza ulaştıktan sonra da oyun devam eder. Üst çubuktaki seviye rozetine ya da **Hedefler** sekmesine dokunun.

- **Seviye**: toplam yolcu sayısıyla yükselir (2.000, 10.000, 30.000 … 1,6 milyon). Her seviye para ödülü verir; yeni havayolları (Marmara Jet, Akdeniz Kanatları, Avrasya Airlines, İpek Yolu Hava, Kuzey Yıldızı, Anka Airways), yükseltme kademeleri, fırtınalı günler ve charter teklifleri seviyeyle açılır. 10. seviyeden sonra sınırsız **Efsane** seviyeleri gelir; her biri ödül ve kalıcı +%2 gelir verir (en çok +%60).
- **Günlük görevler**: her gün üç görev (kalkış, yolcu, dakiklik, köprü kullanımı, geniş gövde, hiç yönlendirme ya da pas geçme olmaması, gün sonu kârı). Üçü de biterse ödüllerin yarısı kadar bonus ve **seri**; seri her gün görev ödüllerini %10 artırır (en çok %100). Bir gün kaçarsa seri sıfırlanır.
- **Başarımlar**: 32 kalıcı hedef, çoğu para ödüllü.
- **Sıralama**: son 7 günün yolcusuyla 12 kurgusal rakip havalimanıyla yarışırsınız. Rakipler de her gün büyür. Her yeni en iyi sıra ödül getirir.
- **Yükseltmeler** (Yükseltme sekmesi): uçuş kulübü (pilot modu), yer hizmetleri (kapıda daha kısa kalış), çarşı ve duty free, pazarlama (daha çok teklif, daha dolu uçaklar), otopark ve raylı bağlantı, yakıt çiftliği, CIP salonları, radar ve yaklaşma kontrolü (daha sık iniş), ILS (siste iniş).
- **Hava ve olaylar**: sabah sisi inişleri seyreltir (ILS ile azalır). Fırtınada iniş ve kalkış durur; hava kaynaklı gecikme havayolu memnuniyetini düşürmez. Bayram yoğunluğunda uçaklar daha dolu, satışlar yüksek.
- **Özel teklifler** (Havayolları sekmesi): charter uçuşları tek seferlik ek ödeme getirir; çok memnun havayolları sefer eklemek ister (genişleme talebi, imza ödemesiyle).
- Eski kayıtlar açıldığında seviye ve başarımlar ödül verilmeden işlenir.

## Geliştirme

Kaynak kodu `src/` klasöründe, modeller `assets/` klasöründedir. Tek dosyalık `index.html` şöyle üretilir:

```
npm install
npm run build
```

Bu komut Three.js'i, kodu ve modelleri tek bir `index.html` dosyasına paketler.

| Dosya | İçerik |
|---|---|
| `src/config.js` | Fiyatlar, giderler, uçak tipleri, havayolları (denge ayarları burada) |
| `src/world.js` | Harita, zemin, pist, taksi yolu, apron, park yeri ve köprü çizimi |
| `src/sim.js` | Uçuşlar: yaklaşma, iniş, taksi, park, yer hizmetleri, pushback, kalkış |
| `src/economy.js` | Para, anlaşmalar, tarife, memnuniyet, puan |
| `src/progress.js` | Seviyeler, günlük görevler, başarımlar, sıralama, yükseltmeler, hava olayları, özel teklifler |
| `src/weather.js` | Yağmur ve şimşek görseli |
| `src/pilot.js` | Uçuş kulübü: uçuş modeli, çubuk/gaz kontrolleri, kameralar, iniş rehberi |
| `src/lights.js` | Gece ışıkları, PAPI, uçak ışıkları |
| `src/sky.js` | Gökyüzü (bulut, güneş, yıldız) |
| `src/scenery.js` | Tarlalar, kasabalar, göl, tepeler |
| `src/gfx.js` | Grafik kalitesi ve pil ayarları |
| `src/build.js` | İnşaat araçları |
| `src/ui.js` | Arayüz |
| `src/assets.js` | Model yükleme ve kodla çizilen uçaklar, araçlar, hangar |

## Modeller

Terminal, kontrol kulesi, yolcu köprüsü, Embraer E170 bölgesel jet ve merdiven aracı modelleri ile hangar dokuları oyunun sahibi tarafından sağlanmıştır; kaynakları ve lisansları doğrulanmamıştır. Yayınlamadan önce her modelin lisansını kontrol edin.

- **Bölgesel jet (E170):** Beyaz modelin kuyruğu havayolunun renginde boyanır, gövdeye havayolu adı ve şeridi çıkartma olarak işlenir.
- **Merdiven aracı:** Köprüsüz park yerlerinde uçağın ön kapısına yanaşır; boyu uçağın kapı yüksekliğine göre ayarlanır.
- **Yolcu köprüsü:** Uçağın kapı yüksekliğine göre eğilir.
- Dar ve geniş gövdeli uçaklar, hangar ve diğer yer araçları şimdilik kodla çizilen basit modellerdir.
