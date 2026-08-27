/* マツキヨの包括加盟店を地図に載せる。データは map.json (app.ts が生成) */

import {
	AttributionControl,
	LngLatBounds,
	Map as MapLibreMap,
	NavigationControl,
	Popup,
	ScaleControl,
} from "https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.mjs";

const GSI_ATTR =
	'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const ACCENT = "#34d399";
const LIST_LIMIT = 120;

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

const formatDate = (iso) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? ""
		: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------- 地図 ---------- */

const EMPTY = { type: "FeatureCollection", features: [] };

function buildStyle() {
	return {
		version: 8,
		sources: {
			base: {
				type: "raster",
				tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
				tileSize: 256,
				maxzoom: 18,
				attribution: `地図: ${GSI_ATTR}`,
			},
			// クラスタリングは MapLibre 側 (supercluster) に任せる
			stores: {
				type: "geojson",
				data: EMPTY,
				cluster: true,
				clusterMaxZoom: 15,
				clusterRadius: 55,
			},
		},
		layers: [
			{ id: "base", type: "raster", source: "base" },
			{
				id: "clusters",
				type: "circle",
				source: "stores",
				filter: ["has", "point_count"],
				paint: {
					"circle-color": "rgba(17, 23, 28, 0.85)",
					"circle-radius": ["step", ["get", "point_count"], 17, 25, 20, 100, 24],
					"circle-stroke-width": 2,
					"circle-stroke-color": ACCENT,
				},
			},
			{
				id: "cluster-count",
				type: "symbol",
				source: "stores",
				filter: ["has", "point_count"],
				layout: {
					"text-field": ["get", "point_count_abbreviated"],
					"text-size": 12,
					"text-allow-overlap": true,
				},
				paint: { "text-color": "#eef2f5" },
			},
			{
				id: "points",
				type: "circle",
				source: "stores",
				filter: ["!", ["has", "point_count"]],
				paint: {
					"circle-color": ACCENT,
					"circle-radius": [
						"interpolate",
						["linear"],
						["zoom"],
						5,
						4,
						12,
						6,
						16,
						8,
					],
					"circle-stroke-width": 2,
					"circle-stroke-color": "rgba(255, 255, 255, 0.92)",
				},
			},
		],
	};
}

const map = new MapLibreMap({
	container: "map",
	style: buildStyle(),
	center: [138.5, 37.2],
	zoom: 4.5,
	attributionControl: false,
	// 傾き・回転は店舗を見るのに要らないので切る
	pitchWithRotate: false,
	dragRotate: false,
	touchPitch: false,
});
map.touchZoomRotate?.disableRotation();

map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
map.addControl(
	new AttributionControl({
		compact: true,
		customAttribution:
			'<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
	}),
	"bottom-right",
);
map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

// WebGL2 が無い環境では地図が出せないので、白紙にせず理由を出す
map.on("error", (event) => {
	if (/WebGL/i.test(event.error?.message ?? "")) {
		toast("この環境では地図を表示できません (WebGL2 が必要です)");
	}
});

/* ---------- 状態 ---------- */

let data = { stores: [], total: 0, unmapped: 0 };
let state = {
	q: "",
	pref: "",
	services: new Set(),
	inView: false,
};
const byId = new Map();
let popup = null;
let shownId = null;

/** skip に渡した条件だけ無視して判定する (チップの件数表示に使う) */
function matches(store, skip) {
	if (skip !== "pref" && state.pref && store.prefecture !== state.pref) return false;
	if (skip !== "service" && state.services.size) {
		if (!store.services.some((s) => state.services.has(s))) return false;
	}
	if (state.q) {
		const haystack = `${store.name} ${store.address}`.toLowerCase();
		if (!haystack.includes(state.q)) return false;
	}
	return true;
}

function filtered() {
	return data.stores.filter((s) => matches(s));
}

/* ---------- 描画 ---------- */

function popupHtml(store) {
	const services = store.services
		.map((s) => `<span class="pop__tag">${escapeHtml(s)}</span>`)
		.join("");
	const rows = [
		["住所", store.address],
		["定休日", store.closedDay],
	]
		.filter(([, value]) => value)
		.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`)
		.join("");

	return `
		<div class="pop">
			<div class="pop__inner">
				<h3 class="pop__name">${escapeHtml(store.name)}</h3>
				<div class="pop__tags">${services}</div>
				<dl class="pop__rows">${rows}</dl>
				<div class="pop__links">
					<a class="pop__link pop__link--primary" href="${escapeHtml(store.url)}" target="_blank" rel="noopener">店舗詳細</a>
					<a class="pop__link" href="https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}" target="_blank" rel="noopener">経路</a>
				</div>
			</div>
		</div>`;
}

function openPopup(store) {
	popup?.remove();
	shownId = store.id;
	popup = new Popup({
		maxWidth: "280px",
		offset: 14,
		className: "pop-wrap",
	})
		.setLngLat([store.lng, store.lat])
		.setHTML(popupHtml(store))
		.addTo(map);
	popup.on("close", () => {
		shownId = null;
	});
}

function toFeature(store) {
	return {
		type: "Feature",
		id: store.id,
		geometry: { type: "Point", coordinates: [store.lng, store.lat] },
		properties: { id: store.id },
	};
}

function renderList(entries) {
	const list = $("list");
	const bounds = state.inView ? map.getBounds() : null;
	const visible = bounds
		? entries.filter((s) => bounds.contains([s.lng, s.lat]))
		: entries;

	$("count").textContent = `${visible.length.toLocaleString()} 件`;

	if (visible.length === 0) {
		list.innerHTML = `<li class="list__empty">条件に合う店舗がありません</li>`;
		return;
	}

	list.innerHTML =
		visible
			.slice(0, LIST_LIMIT)
			.map(
				(store) => `
			<li class="list__item" data-id="${store.id}">
				<span class="list__body">
					<span class="list__name">${escapeHtml(store.name)}</span>
					<span class="list__meta">
						<span>${escapeHtml(store.prefecture)}</span>
						<span>${escapeHtml(store.address)}</span>
					</span>
				</span>
			</li>`,
			)
			.join("") +
		(visible.length > LIST_LIMIT
			? `<li class="list__more">ほか ${(visible.length - LIST_LIMIT).toLocaleString()} 件（絞り込むと表示されます）</li>`
			: "");
}

function renderChipCounts() {
	for (const [box, skip] of [["services", "service"]]) {
		const counts = new Map();
		for (const store of data.stores) {
			if (!matches(store, skip)) continue;
			for (const value of store.services)
				counts.set(value, (counts.get(value) ?? 0) + 1);
		}
		for (const chip of $(box).querySelectorAll(".chip")) {
			const countEl = chip.querySelector(".chip__count");
			if (countEl)
				countEl.textContent = (counts.get(chip.dataset.value) ?? 0).toLocaleString();
		}
	}
}

function render() {
	const entries = filtered();
	map.getSource("stores")?.setData({
		type: "FeatureCollection",
		features: entries.map(toFeature),
	});
	// 絞り込みで消えた店舗のポップアップは閉じる
	if (shownId !== null && !entries.some((s) => s.id === shownId)) {
		popup?.remove();
	}
	renderList(entries);
	renderChipCounts();
}

/** パネルに隠れる分を余白として扱い、実際に見えている範囲に収める */
function viewPadding() {
	const margin = 20;
	if (document.body.classList.contains("panel-hidden")) {
		return { top: margin, bottom: margin, left: margin, right: margin };
	}
	const rect = $("panel").getBoundingClientRect();
	return isNarrow()
		? { top: margin, bottom: rect.height + margin, left: margin, right: margin }
		: { top: margin, bottom: margin, left: rect.width + margin * 2, right: margin };
}

function fitToSelection() {
	const entries = filtered();
	if (entries.length === 0) return;
	const bounds = new LngLatBounds();
	for (const s of entries) bounds.extend([s.lng, s.lat]);
	map.fitBounds(bounds, { padding: viewPadding(), maxZoom: 14, duration: 600 });
}

const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;

function setPanel(hidden) {
	document.body.classList.toggle("panel-hidden", hidden);
	map.resize();
}

function focusStore(id) {
	const store = byId.get(id);
	if (!store) return;
	// 画面が狭いときはパネルがポップアップを覆ってしまうので閉じる
	if (isNarrow()) setPanel(true);
	const pad = viewPadding();
	const visibleHeight = map.getCanvas().clientHeight - pad.top - pad.bottom;
	map.easeTo({
		center: [store.lng, store.lat],
		zoom: Math.max(map.getZoom(), 16),
		offset: [
			(pad.left - pad.right) / 2,
			(pad.top - pad.bottom) / 2 + visibleHeight * 0.2,
		],
		duration: 700,
	});
	openPopup(store);
}

/* ---------- 地図の操作 ---------- */

map.on("click", "points", (event) => {
	const store = byId.get(event.features[0].properties.id);
	if (store) openPopup(store);
});

map.on("click", "clusters", async (event) => {
	const cluster = event.features[0];
	const zoom = await map
		.getSource("stores")
		.getClusterExpansionZoom(cluster.properties.cluster_id);
	map.easeTo({ center: cluster.geometry.coordinates, zoom, duration: 500 });
});

for (const layer of ["points", "clusters"]) {
	map.on("mouseenter", layer, () => {
		map.getCanvas().style.cursor = "pointer";
	});
	map.on("mouseleave", layer, () => {
		map.getCanvas().style.cursor = "";
	});
}

/* ---------- URL への状態保存 ---------- */

function readState() {
	const p = new URLSearchParams(location.hash.slice(1));
	const set = (key) => new Set((p.get(key) ?? "").split(",").filter(Boolean));
	return {
		q: (p.get("q") ?? "").toLowerCase(),
		pref: p.get("pf") ?? "",
		services: set("sv"),
		inView: p.get("view") === "1",
	};
}

function writeState() {
	const p = new URLSearchParams();
	if (state.q) p.set("q", state.q);
	if (state.pref) p.set("pf", state.pref);
	if (state.services.size) p.set("sv", [...state.services].join(","));
	if (state.inView) p.set("view", "1");
	const hash = p.toString();
	history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
}

function update() {
	writeState();
	render();
}

/* ---------- UI 構築 ---------- */

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

function chipHtml(value, count, pressed) {
	return `<button type="button" class="chip" data-value="${escapeHtml(value)}" aria-pressed="${pressed}">${escapeHtml(value)}<span class="chip__count">${count}</span></button>`;
}

function buildControls() {
	const stores = data.stores;

	const prefs = uniqueSorted(stores.map((s) => s.prefecture));
	$("pref").innerHTML =
		`<option value="">すべて</option>` +
		prefs.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
	$("pref").value = state.pref;

	const services = uniqueSorted(stores.flatMap((s) => s.services));
	$("services").innerHTML = services
		.map((s) => chipHtml(s, "", state.services.has(s)))
		.join("");

	$("in-view").checked = state.inView;
	$("search").value = state.q;

	const unmapped = data.unmapped ? `・座標なし ${data.unmapped} 件は非表示` : "";
	$("meta").innerHTML =
		`${data.stores.length.toLocaleString()} 件を表示${unmapped}<br>更新 ${formatDate(data.generatedAt)}`;
}

function wireChipGroup(boxId, key, resetId) {
	$(boxId).addEventListener("click", (event) => {
		const chip = event.target.closest("button[data-value]");
		if (!chip) return;
		const value = chip.dataset.value;
		if (state[key].has(value)) state[key].delete(value);
		else state[key].add(value);
		chip.setAttribute("aria-pressed", String(state[key].has(value)));
		update();
	});

	$(resetId).addEventListener("click", () => {
		state[key].clear();
		for (const chip of $(boxId).querySelectorAll(".chip")) {
			chip.setAttribute("aria-pressed", "false");
		}
		update();
	});
}

function wireEvents() {
	wireChipGroup("services", "services", "service-reset");

	$("pref").addEventListener("change", (event) => {
		state.pref = event.target.value;
		update();
		fitToSelection();
	});

	$("in-view").addEventListener("change", (event) => {
		state.inView = event.target.checked;
		update();
	});

	let searchTimer;
	$("search").addEventListener("input", (event) => {
		const value = event.target.value.toLowerCase();
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			state.q = value;
			update();
		}, 200);
	});

	$("list").addEventListener("click", (event) => {
		const item = event.target.closest(".list__item");
		if (item) focusStore(item.dataset.id);
	});

	// 表示範囲で絞る設定のときだけ、地図の移動に合わせて一覧を作り直す
	map.on("moveend", () => {
		if (state.inView) renderList(filtered());
	});

	$("panel-close").addEventListener("click", () => setPanel(true));
	$("panel-toggle").addEventListener("click", () => setPanel(false));
}

function toast(message) {
	const el = $("toast");
	el.textContent = message;
	el.hidden = false;
}

async function boot() {
	const [loaded] = await Promise.all([
		fetch("./map.json", { cache: "no-cache" })
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.catch((error) => {
				toast(`店舗データを読み込めませんでした (${error.message})`);
				return null;
			}),
		map.loaded() ? Promise.resolve() : new Promise((r) => map.once("load", r)),
	]);
	if (!loaded) return;

	data = { ...loaded, stores: loaded.stores.map((s) => ({ ...s, id: String(s.id) })) };
	for (const store of data.stores) byId.set(store.id, store);

	state = readState();
	buildControls();
	wireEvents();
	render();
	fitToSelection();
}

void boot();
