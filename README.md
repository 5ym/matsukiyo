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

公式サイトの店舗 JSON が `latitude` / `longitude` を持っているのでそれをそのまま使う。
万一持たない店舗があれば、住所を [国土地理院の住所検索 API](https://msearch.gsi.go.jp/address-search/AddressSearch)
でジオコーディングして補う（無料・キー不要）。結果は `geocode-cache.json` にキャッシュする。

## 包括加盟店の判定について

店舗 JSON に「包括加盟店かどうか」という直接のフラグは無い。`icon`（ブランドID）を見て、
マツモトキヨシ HD / ココカラファイン HD が直営するブランド（マツモトキヨシ・matsukiyoLAB・
petit madoca・ココカラファイン・セイジョー・ドラッグセガミ・ジップドラッグ・ライフォート・
ココカラファインイズミヤ）を除いた残りを包括加盟店とみなしている（`app.ts` の
`DIRECTLY_OPERATED_BRAND_IDS`）。これは店舗数の内訳から妥当と判断した推測なので、
ブランドの扱いに心当たりがあれば `DIRECTLY_OPERATED_BRAND_IDS` を調整すること。

## サイトのアクセス制限 (Akamai) について

公式サイトは Bot 対策 (Akamai) で守られており、ヘッダの少ないリクエストは 403 で弾かれる。
`app.ts` は実ブラウザに近いヘッダを付け、失敗時は間隔を空けて自動リトライする。

それでも 403 が続く場合、クラウド/データセンター系の IP をレピュテーションで弾いている
可能性が高い（GitHub-hosted runner を含む）。その場合は住宅回線などのプロキシを
`HTTPS_PROXY` に設定する。

| 変数 | 意味 |
| --- | --- |
| `HTTPS_PROXY` | 403 が続く場合に使うプロキシ（任意）。ローカルは `.env`、CI はリポジトリの Secrets |

プロキシも用意できない場合は、`cron.yml` の `runs-on` を自宅サーバ等のセルフホストランナーに
向けるのが確実。

## GitHub Pages への公開

1. リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする
2. `main` への push、または月1回の cron で
   [`.github/workflows/cron.yml`](.github/workflows/cron.yml) が収集・デプロイを行う
3. 公開先: `https://<ユーザー名>.github.io/matsukiyo/`

`data.json` / `map.json` はリポジトリにコミットしない（デプロイのたびに作り直す）。

## 注意

掲載内容は公式サイト（マツキヨココカラ 店舗検索）で必ず確認すること。
