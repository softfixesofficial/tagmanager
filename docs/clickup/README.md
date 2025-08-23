# ClickUp Integration

## Setup

1. **ClickUp OAuth App Oluştur**
   - ClickUp workspace'inde OAuth app oluştur
   - Redirect URI: ``
   - Client ID ve Secret'ı al

2. **Environment Variables**
   ```bash
   CLICKUP_CLIENT_ID=your_client_id
   CLICKUP_CLIENT_SECRET=your_client_secret
   CLICKUP_REDIRECT_URI= ''
   ```

3. **Server Başlat**
   ```bash
   cd tagmanager/landing
   npm start
   ```

## Features

- ✅ Tag görüntüleme
- ✅ Tag düzenleme
- ✅ Tag silme
- ✅ Tag filtreleme (renk, arama)
- ✅ Grup oluşturma
- ✅ Sürükle-bırak
- ✅ Task entegrasyonu

## API Endpoints

- `GET /login/clickup` - OAuth URL
- `POST /api/clickup/token` - Token exchange
- `GET /api/clickup/user` - Kullanıcı bilgisi
- `GET /api/clickup/tags` - Tüm tag'lar
- `GET /api/clickup/tasks` - Tüm task'lar
- `PUT /api/clickup/tag/:id` - Tag güncelle
- `DELETE /api/clickup/tag/:id` - Tag sil

## Troubleshooting

**Tag'lar görünmüyor?**
- ClickUp workspace'inde tag'ların olduğundan emin ol
- OAuth izinlerini kontrol et

**API hataları?**
- Token'ın geçerli olduğunu kontrol et
- ClickUp API rate limit'ini kontrol et
