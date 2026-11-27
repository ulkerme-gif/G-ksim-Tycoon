# Havalimanı Tycoon

Tarayıcıda çalışan, 3B havalimanı kurma ve işletme oyunu. Boş bir arazide pist, taksi yolu, apron, terminal, park yeri, yolcu köprüsü, kule ve hangar kurarsınız. Havayollarıyla anlaşma yaparsınız. Uçaklar iner, park yerine taksi yapar, yer hizmetlerinden geçer, pushback ile ayrılır ve kalkar.

## Oynamak

Oyun `index.html` içindedir; uçuş kulübünün uçak modelleri ayrı olarak `models/` klasöründen yüklenir. Bu yüzden `index.html` ile `models/` klasörü aynı yerde durmalı ve oyun bir sunucudan (GitHub Pages ya da `python3 -m http.server`) açılmalıdır. Dosyaya çift tıklayarak açarsanız havalimanı çalışır ama uçuş kulübünün uçakları yüklenmez. GitHub Pages'te yayınlamak için:

1. Bu klasördeki dosyaları yeni bir depoya yükleyin (`index.html` ve `models/` deponun kök dizininde olmalı).
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

## Uçuş kulübü (GökSim)

Uçuş kulübü, GökSim uçuş simülatörünün kendisidir: aynı uçuş fiziği, aynı 10 uçak modeli (hareketli iniş takımı, flap, kanopi, kapaklar), aynı gösterge paneli, HUD, otopilot, ses, kamera ve kontroller. Tek fark, uçuşun sizin havalimanınızın pistinden başlaması ve trafiğinizin içinde uçmanızdır.

- **Geliştir → Uçuş kulübü** (seviye 2, ₺3 Mn) alınınca sağ altta sarı **Uç** düğmesi çıkar.
- **Hangar**: uçakları tek tek satın alırsınız; F-16 ₺15 Mn, Mitsubishi F-2 ₺20 Mn, F/A-18F ₺35 Mn, F-15C ₺50 Mn, Rafale ₺70 Mn, Boeing 777 ₺250 Mn, F-22 ₺400 Mn, Su-57 ₺450 Mn, A380 ₺900 Mn, SR-71 ₺1,5 Mlr. Büyük alımlar iki dokunuşla onaylanır.
- Pisti seçip **pistte** ya da **yaklaşmada** (3° süzülüş üzerinde) başlarsınız. Uçuş sırasında oyun 1× hızda akar; alttaki **Havalimanına dön** ile çıkarsınız.
- Pistte, kalkışta ve son yaklaşmada pist trafiğe kapanır. Sizin yüzünüzden pas geçen uçaklar havayolu memnuniyetini düşürmez.
- Piste iyi iniş ödül getirir; ödül son günlerin gelirine göre büyür (tüy gibi iniş: günlük gelirin %2'si).
- **Ayarlar**: gerçekçi mod (motor çalıştırma, yakıt, yapısal sınırlar), hassasiyet, ters yunuslama, otomatik dümen, ses, türbülans. Ayarlar GökSim'deki gibi saklanır.

| | iPad | Klavye |
|---|---|---|
| Yunuslama / yatış | Sol alttaki çubuk | ↑ ↓ ← → |
| Gaz | Sağdaki gaz kolu | + − ya da Page Up / Page Down |
| Fren, flap, teker, spoiler | Ekrandaki düğmeler | B ya da Boşluk, F / Shift+F, G, K |
| Dümen | Otomatik (Ayarlar) | Z X |
| Trim | — | Home / End, T / Shift+T |
| Otopilot | Alttaki Otopilot | A |
| Kamera | Kamera düğmesi; ekranı sürükleyip çevirin | C, 1–4 |
| Özel özellikler (kanopi, kapaklar, kanca) | Özel | O |
| Park freni, motor | — | Shift+B, E |
| Duraklat, yeniden başla, yardım | Alttaki düğmeler | P, R, F1 |
| Çıkış | Havalimanına dön | Esc |

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
- **Başarımlar**: 37 kalıcı hedef, çoğu para ödüllü.
- **Sıralama**: son 7 günün yolcusuyla 12 kurgusal rakip havalimanıyla yarışırsınız. Rakipler de her gün büyür. Her yeni en iyi sıra ödül getirir.
- **Yükseltmeler** (Geliştir sekmesi): uçuş kulübü, yer hizmetleri (kapıda daha kısa kalış), çarşı ve duty free, pazarlama (daha çok teklif, daha dolu uçaklar), otopark ve raylı bağlantı, yakıt çiftliği, CIP salonları, radar ve yaklaşma kontrolü (daha sık iniş), ILS (siste iniş).
- **Hava ve olaylar**: sabah sisi inişleri seyreltir (ILS ile azalır). Fırtınada iniş ve kalkış durur; hava kaynaklı gecikme havayolu memnuniyetini düşürmez. Bayram yoğunluğunda uçaklar daha dolu, satışlar yüksek.
- **Özel teklifler** (Havayolları sekmesi): charter uçuşları tek seferlik ek ödeme getirir; çok memnun havayolları sefer eklemek ister (genişleme talebi, imza ödemesiyle).
- Eski kayıtlar açıldığında seviye ve başarımlar ödül verilmeden işlenir.

## Geç oyun: parayı nereye harcayacaksınız?

Günde yüz milyonlar kazanmaya başladığınızda para anlamını yitirmesin diye, The Sims, Two Point Hospital, Stardew Valley, Cities: Skylines ve Airport CEO gibi oyunlardaki "oynamaya devam ettiren" düzenekler eklendi.

- **Anıt projeler** (Geliştir sekmesinin başı): büyük, kalıcı yapılar. Günlerce sürer, aynı anda tek inşaat yapılır, havalimanı çitinin güney dışında yükselir ve her birinin kalıcı etkisi vardır.

| Proje | Bedel | Süre | Seviye | Etkisi |
|---|---|---|---|---|
| Havalimanı oteli | ₺200 Mn | 2 gün | 5 | Gelen yolcu başına ₺60, terminal satışları ×1,15 |
| Kargo merkezi | ₺300 Mn | 2 gün | 6 | Her gece günlük uçuş gelirinin %12'si |
| Bakım merkezi (MRO) | ₺400 Mn | 3 gün | 6 | Hangar geliri ×2, kapıda %8 daha kısa kalış |
| Metro hattı | ₺500 Mn | 3 gün | 7 | Doluluk +%5, otopark ve ulaşım ×1,5 |
| Havacılık müzesi | ₺600 Mn | 3 gün | 8 (hangarda 3 uçak) | Uçuş kulübü uçaklarınız sergilenir; uçak başına günde ₺3 Mn |
| Kongre ve fuar merkezi | ₺800 Mn | 4 gün | 9 | Doluluk +%4, yoğun fuar günleri daha sık |
| Altın kule | ₺5 Mlr | 7 gün | 10 (tüm projeler) | Günlük bakım gideri sıfır, tüm uçuş gelirleri +%10 |

  Tamamlanan projelerin küçük bir bakım gideri vardır (bedelin binde biri).
- **Olay kartları**: her gün öğleye doğru bir olay gelebilir (grev, devlet konuğu, hava gösterisi, klima arızası, havayolu genel müdürü ziyareti, basında gecikme haberleri, festival, kuş çarpması, yakıt fiyatları, bağış kampanyası). İki seçenek arasında karar verirsiniz; bedeller son üç günün gelirine göre belirlenir, böylece zengin havalimanı için de anlamlı kalır.
- **Mükemmellik** (Hedefler sekmesinin başı): oyunu "bitirme" ölçüsü. 10. seviye, başarımlar, hangardaki uçaklar, anıt projeler, anlaşma yapılan havayolları, yükseltme kademeleri, haftalık sıralamada birincilik ve 5 yıldızdan oluşur. %100'e ulaşınca **Kusursuz havalimanı** başarımı (₺100 Mn) açılır.
- **Uçuş kulübü hangarı**: 10 uçağın toplamı ₺3,7 Mlr; müze ve mükemmellik için hepsini toplamak gerekir.

## Geliştirme

Kaynak kodu `src/` klasöründe, modeller `assets/` klasöründedir. Tek dosyalık `index.html` şöyle üretilir:

```
npm install
npm run build
```

Bu komut Three.js'i, kodu ve havalimanı modellerini tek bir `index.html` dosyasına paketler. Uçuş kulübü uçakları (Draco ile sıkıştırılmış `.glb`) ve Draco çözücüsü `models/` klasöründedir; ilk uçuşta indirilir.

| Dosya | İçerik |
|---|---|
| `src/config.js` | Fiyatlar, giderler, uçak tipleri, havayolları (denge ayarları burada) |
| `src/world.js` | Harita, zemin, pist, taksi yolu, apron, park yeri ve köprü çizimi |
| `src/sim.js` | Uçuşlar: yaklaşma, iniş, taksi, park, yer hizmetleri, pushback, kalkış |
| `src/economy.js` | Para, anlaşmalar, tarife, memnuniyet, puan |
| `src/progress.js` | Seviyeler, günlük görevler, başarımlar, sıralama, yükseltmeler, hava olayları, özel teklifler |
| `src/weather.js` | Yağmur ve şimşek görseli |
| `src/flight.js` | Uçuş kulübü: GökSim motorunu havalimanına bağlar (hangar, pist seçimi, kamera, HUD, puanlama) |
| `src/goksim/` | GökSim'in uçuş motoru: fizik, uçak tanımları, otopilot, göstergeler, ses, kontroller, `nodes.json` (hareketli parçalar), stil |
| `src/projects.js` | Anıt projeler, olay kartları, projelerin 3B görüntüsü, mükemmellik hesabı |
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
- **Uçuş kulübü uçakları** (`models/*.glb`) GökSim'den alınmıştır; kaynakları ve lisansları için GökSim'in README dosyasındaki "Kaynaklar ve lisanslar" bölümüne bakın.
