# TR PvP TierList — Full-stack başlangıç projesi

Bu proje altı isteği kapsayan çalışır bir başlangıç uygulamasıdır: admin paneli, oyuncu yönetimi, tier atama, roller, Discord OAuth2 ve leaderboard.

## Gereksinimler
- Node.js 20+
- Discord Developer Portal'da OAuth2 uygulaması
- (İsteğe bağlı) Discord botu ve sunucuda bot rolü

## Kurulum
1. ZIP'i klasöre çıkar.
2. Terminalde klasöre gir ve `npm install` çalıştır.
3. `.env.example` dosyasını `.env` olarak kopyala.
4. `.env` içindeki `SESSION_SECRET`, Discord OAuth bilgileri ve `OWNER_DISCORD_ID` değerlerini doldur.
5. Discord Developer Portal > OAuth2 > Redirects alanına `http://localhost:3000/auth/discord/callback` ekle.
6. `npm start` çalıştır ve `http://localhost:3000` adresini aç.

## Discord ayarları
- OAuth2 scope: `identify`
- OAuth callback URL, `.env` içindeki `DISCORD_CALLBACK_URL` ile birebir aynı olmalı.
- `OWNER_DISCORD_ID`, ilk Owner olacak Discord kullanıcısının ID'sidir.
- Bot rol senkronizasyonu için botu sunucuya ekle; `Manage Roles` izni ver ve bot rolünü senkronize edilecek tier rollerinin üstüne taşı.
- `.env` içindeki `DISCORD_GUILD_ID` ve `ROLE_CRYSTAL_*` değerlerini doldur.
- Admin panelindeki Oyuncu listesinde Düzenle seçeneğiyle oyuncunun Minecraft adını ve Discord ID'sini bağla. Discord ID, Discord Geliştirici Modu açıkken kullanıcıya sağ tıklayıp Kimliği Kopyala ile alınabilir.
- `npm run bot` ile Crystal tier rol senkronizasyonunu başlat.

## Roller
- **Owner:** Kullanıcı rollerini yönetir; tüm yönetim işlemleri.
- **Admin:** Oyuncu ekler/siler/düzenler; kullanıcı ve istatistikleri görüntüler.
- **Tester:** Oyunculara tier atar ve test geçmişini görür.
- **User:** Leaderboard ve profilleri görüntüler.

## Önemli notlar
- İlk sürümde kullanıcı girişi Discord OAuth2 ile yapılır.
- Tier verileri ve test geçmişi yerel SQLite veritabanında saklanır (`tierlist.db`).
- Discord rol botu şimdilik Crystal modunun tier rollerini senkronize eder. Diğer modlar için `bot.js` içindeki mod ve rol eşlemesini genişlet.
- Demo/örnek oyuncu verisi otomatik eklenmez; Admin panelinden ekleyebilirsin.
- Üretime almadan önce HTTPS, güçlü session secret, kalıcı disk, yedekleme ve güvenlik incelemesi gerekir.
- Bu proje trtier.com'un kopyası değildir; benzer amaçlı özgün bir arayüz ve iş akışıdır.
