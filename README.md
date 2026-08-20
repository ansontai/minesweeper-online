# 拆雷小隊 Minesweeper Online

一個以 React、TypeScript 與 Firebase Realtime Database 製作的多人合作踩地雷。玩家共用棋盤、255 條生命與即時聊天室，免註冊即可用暱稱加入。

## 功能

- 六碼房號與可分享的邀請網址
- 初級、中級、高級三種標準棋盤
- 首次翻格安全、空白連鎖展開、右鍵／長按插旗
- 多人即時同步、共享生命、隊長離線轉移
- 最近 100 則即時聊天訊息
- 房間 24 小時後失效
- 響應式桌面側欄與手機聊天室抽屜
- Firebase 匿名登入與 Realtime Database Security Rules

未設定 Firebase 時，首頁仍提供「本機示範」供單人測試完整棋盤操作。

## 本機啟動

需求：Node.js 22 以上。

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

開啟 Firebase Console，建立名為 `minesweeper-online` 的專案：

1. 新增 Web App。
2. Authentication → Sign-in method 啟用 Anonymous。
3. Realtime Database 建立於 `asia-southeast1`。
4. 把 Web App 設定填入 `.env` 的 `VITE_FIREBASE_*` 欄位。
5. 安裝／登入 Firebase CLI 後部署規則：

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only database
```

請勿使用 Realtime Database 的 Test mode 規則上線；此儲存庫的 `database.rules.json` 才是正式規則來源。

## 測試

```powershell
npm.cmd test
npm.cmd run test:rules
npm.cmd run lint
npm.cmd run build
```

`test:rules` 會啟動本機 Authentication 與 Realtime Database Emulator，需可用的 Java 執行環境。

## GitHub Pages

推送到 `main` 後，`.github/workflows/deploy.yml` 會建置並部署 GitHub Pages。請先在儲存庫設定：

1. Settings → Pages → Source 選擇 **GitHub Actions**。
2. Settings → Secrets and variables → Actions → Variables 建立下列 Repository variables：
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Firebase Authentication → Settings → Authorized domains 加入 `<GitHub帳號>.github.io`。

Firebase Web App 設定不是伺服器密鑰；實際存取權由 Authentication 與 Database Security Rules 控制。

## 資料結構

```text
rooms/{roomId}
├─ meta       # 隊長、難度、狀態、建立與過期時間
├─ members    # 玩家暱稱、加入時間與在線狀態
├─ game       # 版本、棋盤、生命、計時與勝負
└─ messages   # 最近的聊天室訊息
```

棋盤動作透過 Realtime Database transaction 更新並遞增 `revision`，用來序列化多人同時操作。這是休閒型無伺服器遊戲；安全規則會限制身分、格式與權限，但不宣稱能完全防止修改客戶端作弊。
