# matsukiyo

マツキヨの包括加盟店を自動取得して、**地図**に表示する静的サイト。
GitHub Actions で月1回収集し、GitHub Pages に配信する。

## 構成

```text
app.ts            収集 (公式サイトの JSON) と map.json の生成
serve.ts          ローカル確認用の静的サーバ
index.html        地図ページ
assets/main.js    MapLibre GL の地図・絞り込み・一覧
assets/styles.css 見た目
data.json         取得結果をそのまま保存したもの（生成物・コミットしない）
map.json          地図が読む軽量データ（生成物・コミットしない）
geocode-cache.json 住所→座標のキャッシュ（生成物・コミットしない）
```

## 使い方

```bash
bun install

bun run start   # 取得 (data.json) + 地図用データ生成 (map.json)
bun run fetch   # 取得だけ
bun run json    # data.json から map.json を作り直すだけ
bun run dev     # http://localhost:5173/ で地図を確認
```

## 地図

描画は **MapLibre GL JS**（WebGL）。背景は国土地理院の淡色地図。
マーカーは近い店舗をクラスタにまとめ、ズームすると開く。

- 店舗名・住所の検索、都道府県 / サービスでの絞り込み
- 「地図に写っている店舗だけ一覧に出す」表示
- 絞り込み条件は URL のハッシュに入るので、そのまま共有できる
- 座標を持たない店舗は地図に出せないため、件数だけヘッダに表示している

## 座標について

公式サイトの店舗 JSON がそのまま座標を持っていればそれを使う。
持っていない場合は、住所を [国土地理院の住所検索 API](https://msearch.gsi.go.jp/address-search/AddressSearch)
でジオコーディングして補う（無料・キー不要）。結果は `geocode-cache.json` にキャッシュする。

## GitHub Pages への公開

1. リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする
2. `main` への push、または月1回の cron で
   [`.github/workflows/cron.yml`](.github/workflows/cron.yml) が収集・デプロイを行う
3. 公開先: `https://<ユーザー名>.github.io/matsukiyo/`

`data.json` / `map.json` はリポジトリにコミットしない（デプロイのたびに作り直す）。

## 注意

掲載内容は公式サイト（マツキヨココカラ 店舗検索）で必ず確認すること。
