# 慈惠寺普渡 × 同樂70序曲｜MediaPipe互動版

以慈惠寺普渡文化為場域，結合同樂國小70週年序曲，使用 MediaPipe Face Landmarker 與 Hand Landmarker 製作即時數位祈福體驗。

## 功能

- 臉部定位與微笑辨識
- 雙手合掌手勢辨識
- 媽祖冠冕、光環與粒子效果
- 隨機祝福語
- 祝福紀念照下載
- 手機、平板、電腦響應式介面
- GitHub Pages 自動部署

## 本機執行

請先安裝 Node.js 20 以上版本。

```bash
npm install
npm run dev
```

開啟終端機顯示的網址，預設通常為：

```text
http://localhost:8000
```

## 上傳 GitHub

1. 在 GitHub 建立新的空白 Repository。
2. 將本專案所有檔案上傳到 Repository 根目錄。
3. Repository 預設分支請使用 `main`。
4. 進入 **Settings → Pages**。
5. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
6. 推送檔案後，開啟 **Actions** 查看部署進度。
7. 部署成功後，GitHub Pages 網址即可使用相機；瀏覽器會要求相機權限。

## 注意事項

- 首次載入需要網路下載 MediaPipe WASM 與模型。
- 相機必須在 `localhost` 或 HTTPS 網址下使用。
- GitHub Pages 提供 HTTPS，適合手機現場測試。
- 影像只在使用者瀏覽器端處理，不會自動上傳。
- 正式活動前，請以實際平板、手機與現場網路測試效能。

## 專案主題

本活動是「慈惠寺普渡 × 同樂70序曲」，並非慈惠寺70週年。
