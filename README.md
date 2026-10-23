# QQSPEED_S_LEAGUE

2026 QQ飛車手遊 S聯賽秋季賽競速選手圖鑑，收錄 8 支隊伍、20 位競速選手。

選擇隊伍即可瀏覽對應名單與選手卡牌。卡牌以扇形排列，滑鼠移入時會向前展開；點擊或輕點卡牌可開啟完整放大檢視，點選手名字則切換目前卡牌。放大檢視可用關閉按鈕、Esc 或點背景關閉，並回到原卡牌位置。也可使用 Tab、左右方向鍵、Home 與 End 瀏覽，以 Enter 或空白鍵開啟放大檢視，並支援系統的減少動畫設定。

放大視窗在電腦上採左卡牌、右簡介，手機改成上卡牌、下簡介。滑鼠移動會帶動卡牌的立體角度、紫金反光與陰影；觸控及減少動畫模式維持平面。簡介包含隊伍、競速定位、本名、生日月日與公開資料來源，目前填入13位本名（含使用者提供）及8位生日；未核對的欄位顯示待補充，未推算出生年或年齡。

## 參賽隊伍與競速選手

| 隊伍 | 競速選手 |
| --- | --- |
| 廣州狼隊 | 阿升、Shen |
| RSG | 晗晗、風仔、小鈺、海神 |
| RW | 北風、沃克 |
| KZ | YanG、獅子、Aya |
| XROCK | Ani、義 |
| QY | 閩閩、千尋 |
| Wz | 月上、阿諾 |
| AG | HeiRen、Zhong、冬瓜 |

## 專案檔案

這是一個使用 HTML、CSS 與原生 JavaScript 的靜態網站，不需要安裝套件或執行建置程序。

- `index.html`：頁面結構。
- `style.css`：紫金配色、卡牌動畫與響應式版面。
- `app.js`：隊伍切換、名單瀏覽與卡牌互動。
- `assets/asset-manifest.json`：隊伍、選手及圖像路徑。
- `assets/cards/`：20 張選手卡牌。
- `assets/logos/`：8 隊隊徽與 S聯賽標誌。

需要更新名單時，請同步調整 manifest 的 `teams[].players` 與 `players`，並將對應卡牌放入 `assets/cards/`。所有資源使用相對路徑，可部署於 GitHub Pages 的專案子目錄。

本機預覽請在專案根目錄啟動靜態 HTTP 伺服器，例如 `python -m http.server 8080`，再開啟 `http://localhost:8080/`。直接以檔案方式開啟可能無法讀取 JSON 名單。

## GitHub Pages 部署

網站檔案位於 `main` 分支根目錄，使用 GitHub Pages 的分支部署方式。根目錄的 `.nojekyll` 讓網站以原始靜態檔案發布。

1. 在儲存庫的 **Settings → Pages → Build and deployment** 將 **Source** 設為 **Deploy from a branch**。
2. 將 **Branch** 設為 `main`、資料夾設為 **/(root)**，再按 **Save**。
3. 推送至 `main` 後，GitHub Pages 會自動發布更新。部署完成後，網站網址為 <https://JinJia0618.github.io/QQSPEED_S_LEAGUE/>。

## 圖像與標誌權利

本站為非官方選手圖鑑。QQ飛車手遊、S聯賽、隊伍標誌、選手照片及相關圖像的權利屬各原權利人。收錄與展示不代表取得其著作權、商標權或其他授權；請勿將本儲存庫視為對這些圖像提供開源授權。
