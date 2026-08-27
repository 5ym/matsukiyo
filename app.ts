/** マツキヨの包括加盟店を取得して、地図用の map.json を作る */

const MAP_URL = "https://www.matsukiyococokara-online.com/map";
const JSON_URL = `${MAP_URL}/s3/json/`;

// サイト側の Bot 対策に弾かれないよう、実ブラウザに近いヘッダを付ける
const BROWSER_HEADERS = {
	accept: "application/json, text/plain, */*",
	"accept-language": "ja,en-US;q=0.9,en;q=0.8",
	referer: `${MAP_URL}/`,
	"user-agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

type RawStore = {
	id: number | string;
	name: string;
	address: string;
	closed_day?: string;
	services: string;
	[key: string]: unknown;
};

type RawAttr = {
	services: unknown[];
};

type RawData = {
	stores: RawStore[];
	attr: RawAttr;
};

// -----------------------------
// 1. API から取得して data.json に保存
// -----------------------------

/** 包括加盟店だけを対象にする（元の cu.ts から踏襲したフィルタ） */
function isFranchise(item: RawStore): boolean {
	return /\d{8}0\d{2}/.test(item.services);
}

async function fetchAll(): Promise<RawData> {
	const [storesRes, attrRes] = await Promise.all([
		fetch(`${JSON_URL}stores.json`, { headers: BROWSER_HEADERS }),
		fetch(`${JSON_URL}storeAttributes.json`, { headers: BROWSER_HEADERS }),
	]);

	if (!storesRes.ok) throw new Error(`stores.json 取得失敗: HTTP ${storesRes.status}`);
	if (!attrRes.ok) throw new Error(`storeAttributes.json 取得失敗: HTTP ${attrRes.status}`);

	const allStores = (await storesRes.json()) as RawStore[];
	const attr = (await attrRes.json()) as RawAttr;
	const stores = allStores.filter(isFranchise);

	const data: RawData = { stores, attr };
	await Bun.write("data.json", JSON.stringify(data, null, "\t"));
	console.log(
		`data.json 保存完了 (包括加盟店 ${stores.length} 件 / 全 ${allStores.length} 件)`,
	);
	return data;
}

// -----------------------------
// 2. data.json を読み込んで地図用 JSON を生成
// -----------------------------

type MapStore = {
	id: number | string;
	name: string;
	address: string;
	prefecture: string;
	closedDay: string;
	services: string[];
	lat: number;
	lng: number;
	url: string;
};

const PREFECTURES = [
	"北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
	"茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
	"新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
	"静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
	"奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
	"徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
	"熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function extractPrefecture(address: string): string {
	return PREFECTURES.find((pref) => address.startsWith(pref)) ?? "";
}

function toCoord(value: unknown): number {
	if (value === null || value === undefined || value === "") return Number.NaN;
	const n = Number(value);
	return Number.isFinite(n) && n !== 0 ? n : Number.NaN;
}

/** stores.json 自体が座標を持っていればそれを使う（フィールド名がまだ未確認のため候補を総当たり） */
function directCoord(item: RawStore): { lat: number; lng: number } | null {
	const lat = toCoord(item.lat ?? item.latitude ?? item.y);
	const lng = toCoord(item.lng ?? item.lon ?? item.longitude ?? item.x);
	if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
	return null;
}

/** services はビット列。立っている桁に対応する storeAttributes.json のラベルを拾う */
function serviceLabels(services: string, attr: RawAttr): string[] {
	const labels: string[] = [];
	for (let i = 0; i < services.length; i++) {
		if (services[i] !== "1") continue;
		const entry = attr.services?.[i];
		if (!entry) continue;
		const label = Array.isArray(entry)
			? entry.find(
					(v): v is string =>
						typeof v === "string" &&
						!/\.(svg|png|jpe?g|gif)$/i.test(v) &&
						!/^https?:\/\//.test(v),
				)
			: typeof entry === "string"
				? entry
				: ((entry as { label?: string; name?: string })?.label ??
					(entry as { label?: string; name?: string })?.name);
		if (label) labels.push(label);
	}
	return labels;
}

/** 国土地理院の住所検索 API（無料・キー不要）。座標を持たない店舗だけをこれで補う */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
	const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const hits = (await res.json()) as Array<{
			geometry: { coordinates: [number, number] };
		}>;
		const [lng, lat] = hits[0]?.geometry.coordinates ?? [];
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		return { lat: lat as number, lng: lng as number };
	} catch {
		return null;
	}
}

async function loadGeocodeCache(): Promise<Map<string, { lat: number; lng: number } | null>> {
	const file = Bun.file("geocode-cache.json");
	if (!(await file.exists())) return new Map();
	const raw = JSON.parse(await file.text()) as Record<string, { lat: number; lng: number } | null>;
	return new Map(Object.entries(raw));
}

async function saveGeocodeCache(cache: Map<string, { lat: number; lng: number } | null>) {
	await Bun.write("geocode-cache.json", JSON.stringify(Object.fromEntries(cache), null, "\t"));
}

async function generateJson() {
	const file = Bun.file("data.json");
	const { stores, attr } = JSON.parse(await file.text()) as RawData;

	const cache = await loadGeocodeCache();
	let geocoded = 0;
	let unmapped = 0;

	const properties: MapStore[] = [];

	for (const item of stores) {
		let coord = directCoord(item);

		if (!coord) {
			if (cache.has(item.address)) {
				coord = cache.get(item.address) ?? null;
			} else {
				coord = await geocode(item.address);
				cache.set(item.address, coord);
				geocoded++;
				// 無料 API への配慮でリクエスト間隔を空ける
				await new Promise((r) => setTimeout(r, 300));
			}
		}

		if (!coord) {
			unmapped++;
			continue;
		}

		properties.push({
			id: item.id,
			name: item.name,
			address: item.address,
			prefecture: extractPrefecture(item.address),
			closedDay: item.closed_day ?? "",
			services: serviceLabels(item.services, attr),
			lat: coord.lat,
			lng: coord.lng,
			url: `${MAP_URL}?kid=${item.id}`,
		});
	}

	await saveGeocodeCache(cache);

	properties.sort((a, b) => a.name.localeCompare(b.name, "ja"));

	await Bun.write(
		"map.json",
		JSON.stringify({
			generatedAt: new Date().toISOString(),
			total: stores.length,
			unmapped,
			stores: properties,
		}),
	);

	console.log(
		`map.json 出力完了 (${properties.length} 件 / 新規ジオコーディング ${geocoded} 件 / 座標なし ${unmapped} 件)`,
	);
}

// -----------------------------
// 3. bun run app.ts <command>
// -----------------------------
const command = process.argv[2];

if (!command) {
	await fetchAll();
	await generateJson();
} else if (command === "fetch") {
	await fetchAll();
} else if (command === "json") {
	await generateJson();
} else {
	console.log("使い方:");
	console.log("  bun run app.ts        # 取得 + 地図用 JSON 生成");
	console.log("  bun run app.ts fetch  # API から取得して data.json を作る");
	console.log("  bun run app.ts json   # data.json から地図用 map.json を作る");
}
