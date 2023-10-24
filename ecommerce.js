/* ----------------------- Trigger Condition Functions ---------------------- */

// To add a new trigger condition, add a new function to mw_ecommerce_trigger_types and add a callback for that trigger type to use (ex: element_exists function)
const mw_ecommerce_trigger_types = {
	element_exists: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector"]);
		element_exists(trigger.selector, callback);
	},
	element_contains_text: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector", "text"]);
		element_contains_text(trigger.selector, trigger.text, callback);
	},
	dataLayer_event: (trigger, callback) => {
		validateTriggerFields(trigger, ["event_name"]);
		detect_dataLayer_event(trigger.event_name, callback);
	},
	parameter_equals: (trigger, callback) => {
		validateTriggerFields(trigger, ["parameter_key", "parameter_value"]);
		parameter_equals(trigger.parameter_key, trigger.parameter_value, callback);
	},
	url_contains_all: (trigger, callback) => {
		validateTriggerFields(trigger, ["strings"]);
		url_contains_all(trigger.strings, callback);
	},
	url_exact_match: (trigger, callback) => {
		validateTriggerFields(trigger, ["url"]);
		url_exact_match(trigger.url, callback);
	},
	element_mousedown: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector"]);
		element_mousedown(trigger.selector, callback);
	},
	page_view: (trigger, callback) => {
		callback();
	},
};

function validateTriggerFields(trigger, fields) {
	fields.forEach((field) => {
		if (!trigger[field]) {
			throw new MasterworksTelemetryError("Missing ecommerce_configuration.trigger." + field + ": " + trigger[field]);
		}
	});
}

function set_mw_ecommerce_trigger(trigger, callback) {
	if (!trigger.type) {
		throw new MasterworksTelemetryError("Missing ecommerce_configuration.trigger.type: " + trigger.type);
	}

	if (!mw_ecommerce_trigger_types[trigger.type]) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.type: " + trigger.type);
	}

	if (trigger.timeout && typeof trigger.timeout !== "number") {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.timeout: " + trigger.timeout);
	}

	if (trigger.timeout) {
		setTimeout(() => {
			mw_ecommerce_trigger_types[trigger.type](trigger, callback);
		}, trigger.timeout);
	} else {
		mw_ecommerce_trigger_types[trigger.type](trigger, callback);
	}
}

function element_exists(selector, callback) {
	const elementExistsInterval = setInterval(function () {
		if (document.querySelector(selector)) {
			clearInterval(elementExistsInterval);
			callback();
		}
	}, 100);
}

function element_contains_text(selector, text, callback) {
	const elementContainsTextInterval = setInterval(function () {
		const elements = document.querySelectorAll(selector);
		for (let i = 0; i < elements.length; i++) {
			if (elements[i].textContent.includes(text)) {
				clearInterval(elementContainsTextInterval);
				callback();
				break;
			}
		}
	}, 100);
}

function detect_dataLayer_event(event_name, callback) {
	const originalPush = dataLayer.push.bind(dataLayer);
	dataLayer.push = function (obj) {
		originalPush(obj);
		window.dispatchEvent(new CustomEvent("mw_dataLayer_detection", { detail: obj }));
	};

	window.addEventListener("mw_dataLayer_detection", function (e) {
		if (e.detail.event === event_name) {
			callback();
		}
	});
}

function parameter_equals(parameter_key, parameter_value, callback) {
	urlsParams = new URLSearchParams(window.location.search);
	if (urlsParams.get(parameter_key) === parameter_value) {
		callback();
	}
}

function url_contains_all(strings, callback) {
	if (!Array.isArray(strings)) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.strings: " + strings);
	}

	if (!strings.every((string) => matches_current_url(string))) {
		return;
	}

	callback();
}

function url_exact_match(url, callback) {
	if (window.location.href === url) {
		callback();
	}
}

function element_mousedown(selector, callback) {
	document.addEventListener("mousedown", function (event) {
		if (event.target.matches(selector)) {
			callback();
		}
	});
}

/* -------------------- Set Triggers for Ecommerce Events ------------------- */
mw_telemetry_settings.ecommerce_configurations.forEach((configuration) => {
	if (configuration.urls) {
		if (!Array.isArray(configuration.urls)) {
			throw new MasterworksTelemetryError("Invalid ecommerce_configuration.urls: " + configuration.urls);
		}

		if (!configuration.urls.some((url) => matches_current_url(url))) {
			return;
		}
	}

	if (!Array.isArray(configuration.triggers)) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.triggers: " + configuration.triggers);
	}

	configuration.triggers.forEach((trigger) => {
		try {
			set_mw_ecommerce_trigger(trigger, () => {
				triggerEcommerceEvent(configuration);
			});
		} catch (error) {
			console.error(error);
		}
	});
});

function matches_current_url(url) {
	return window.location.href.includes(url);
}

/* ------------------------ Ecommerce Event Functions ----------------------- */

function triggerEcommerceEvent(configuration) {
	try {
		const ecommerce_data = getMWEcommerceData(configuration.configuration_name);
		if (ecommerce_data === null) {
			return;
		}
		if (typeof ecommerce_data === "undefined" || isNaN(ecommerce_data.total_transaction_amount) || !Array.isArray(ecommerce_data.items) || ecommerce_data.items.length < 1) {
			throw new MasterworksTelemetryError("Invalid ecommerce_data: " + ecommerce_data);
		}

		if (isTransactionEventADuplicate(ecommerce_data)) {
			return;
		}
		fireEcommerceEvents(configuration, ecommerce_data);
		writeTransactionEventCookie(ecommerce_data);
	} catch (error) {
		console.error(error);
	}
}

function isTransactionEventADuplicate(ecommerce_data) {
	const transactionCookie = getCookie("mw_transaction");
	const generatedTransactionCookieValue = generateTransactionCookieValue(ecommerce_data);
	if (transactionCookie.includes(generatedTransactionCookieValue)) {
		return true;
	}
	return false;
}

function fireEcommerceEvents(configuration, ecommerce_data) {
	if (!Array.isArray(configuration.platforms) || configuration.platforms.length < 1) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.platforms: " + configuration.platforms);
	}

	// generate transaction id if one is not provided
	if (!ecommerce_data.transaction_id) {
		ecommerce_data.transaction_id = generateTransactionID();
	}

	// write transaction data to dataLayer
	writeTransactionDataLayerEvent(ecommerce_data);

	configuration.platforms.forEach((platform) => {
		try {
			switch (platform.name) {
				case "rudderstack":
					triggerRudderstackEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "piwik":
					triggerPiwikEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "facebook":
					triggerFacebookEcommerceEvents(ecommerce_data, platform.options);
					break;
				case "adform":
					triggerAdformEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "zemanta":
					triggerZemantaEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "google_ads":
					triggerGoogleAdsEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "tiktok":
					triggerTikTokEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "mntn":
					triggerMNTNEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "taboola":
					triggerTaboolaEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "pinterest":
					triggerPinterestEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "illumin":
					triggerIlluminEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "stackadapt":
					triggerStackAdaptEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "bing":
					triggerBingEcommerceEvent(ecommerce_data, platform.options);
					break;
				case "tradedesk":
					triggerTradeDeskEcommerceEvent(ecommerce_data, platform.options);
					break;
				default:
					throw new MasterworksTelemetryError("Invalid ecommerce_configuration.platform: " + platform);
			}
		} catch (error) {
			console.error(error);
		}
	});
}

function generateTransactionID() {
	return (+new Date()).toString(36);
}

// ** Rudderstack ** //
function triggerRudderstackEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof rudderanalytics === "undefined") {
		throw new MasterworksTelemetryError("rudderanalytics is not defined");
	}

	rudderanalytics.track("Order Completed", {
		order_id: ecommerce_data.transaction_id,
		currency: "USD",
		revenue: ecommerce_data.total_transaction_amount,
		products: ecommerce_data.items,
	});
}

// ** Piwik ** //
function triggerPiwikEcommerceEvent(ecommerce_data, options = {}) {
	if (options.matomo_conflict) {
		if (typeof _ppas === "undefined") {
			throw new MasterworksTelemetryError("_ppas is undefined");
		}

		ecommerce_data.items.forEach((item) => {
			_ppas.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
		});

		_ppas.push(["trackEcommerceOrder", ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
		return;
	}

	if (typeof _paq === "undefined") {
		throw new MasterworksTelemetryError("_paq is undefined");
	}

	ecommerce_data.items.forEach((item) => {
		_paq.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
	});

	_paq.push(["trackEcommerceOrder", ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
	return;
}

// ** Facebook ** //
function triggerFacebookEcommerceEvents(ecommerce_data, options = {}) {
	if (typeof fbq === "undefined") {
		throw new MasterworksTelemetryError("fbq is undefined");
	}

	if (!options.sustainer_only) {
		if (options.facebook_pixel_ids && options.facebook_pixel_ids.length > 0) {
			for (let i = 0; i < options.facebook_pixel_ids.length; i++) {
				fbq("trackSingle", options.facebook_pixel_ids[i].toString(), "Purchase", { value: ecommerce_data.total_transaction_amount, currency: "USD" });
			}
		} else {
			fbq("track", "Purchase", { value: ecommerce_data.total_transaction_amount, currency: "USD" });
		}
	}

	ecommerce_data.items.forEach((item) => {
		if (item.category === "sustainer") {
			fbq("trackCustom", "SustainerDonation", { value: item.amount, currency: "USD", content_ids: item.sku, content_name: item.name });
		}
	});
}

// ** Adform ** //
function triggerAdformEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof mw_telemetry_settings.adform_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("_adftrack is undefined");
	}

	window._adftrack = Array.isArray(window._adftrack) ? window._adftrack : window._adftrack ? [window._adftrack] : [];
	window._adftrack.push({
		pm: mw_telemetry_settings.adform_pixel_id,
		divider: encodeURIComponent("|"),
		pagename: encodeURIComponent("MW-Donation"),
		order: {
			orderid: ecommerce_data.transaction_id,
			sales: ecommerce_data.total_transaction_amount,
			currency: "USD",
			itms: ecommerce_data.items.map((item) => {
				return {
					productname: item.name,
					categoryname: item.category,
					productsales: item.price,
					productcount: item.quantity,
				};
			}),
		},
	});

	var s = document.createElement("script");
	s.type = "text/javascript";
	s.async = true;
	s.src = "https://a2.adform.net/serving/scripts/trackpoint/async/";
	var x = document.getElementsByTagName("script")[0];
	x.parentNode.insertBefore(s, x);
}

// ** Zemanta ** //
function triggerZemantaEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof zemApi === "undefined") {
		throw new MasterworksTelemetryError("zemApi is undefined");
	}
	zemApi("track", "PURCHASE", { value: ecommerce_data.total_transaction_amount, currency: "USD" });
}

// ** Google Ads ** //
function triggerGoogleAdsEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof gtag === "undefined") {
		throw new MasterworksTelemetryError("gtag is undefined");
	}

	if (!options || !options.google_ads_send_to_ids || options.google_ads_send_to_ids.length < 1) {
		throw new MasterworksTelemetryError("Invalid options.google_ads_send_to_ids: " + options.google_ads_send_to_ids);
	}

	options.google_ads_send_to_ids.forEach((google_ads_send_to_id) => {
		gtag("event", "conversion", {
			send_to: google_ads_send_to_id,
			value: ecommerce_data.total_transaction_amount,
			currency: "USD",
			transaction_id: ecommerce_data.transaction_id,
		});
	});
}

// ** TikTok ** //
function triggerTikTokEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof ttq === "undefined") {
		throw new MasterworksTelemetryError("ttq is undefined");
	}

	ttq.track("CompletePayment", {
		content_name: "donation",
		value: ecommerce_data.total_transaction_amount,
		currency: "USD",
	});
}

// ** Taboola ** //
function triggerTaboolaEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof mw_telemetry_settings.taboola_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("taboola_pixel_id is undefined");
	}

	_tfa.push({
		notify: "event",
		name: "Purchase",
		id: mw_telemetry_settings.taboola_pixel_id,
		revenue: ecommerce_data.total_transaction_amount,
	});
}

// ** MNTN ** //
function triggerMNTNEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof mw_telemetry_settings.mntn_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mntn_pixel_id is undefined");
	}

	(function () {
		var x = null,
			p,
			q,
			m,
			o = mw_telemetry_settings.mntn_pixel_id.toString(),
			l = ecommerce_data.transaction_id,
			i = ecommerce_data.total_transaction_amount,
			c = "",
			k = "",
			g = "",
			j = "",
			u = "",
			shadditional = "";
		try {
			p = top.document.referer !== "" ? encodeURIComponent(top.document.referrer.substring(0, 512)) : "";
		} catch (n) {
			p = document.referrer !== null ? document.referrer.toString().substring(0, 512) : "";
		}
		try {
			q =
				window && window.top && document.location && window.top.location === document.location
					? document.location
					: window && window.top && window.top.location && "" !== window.top.location
					? window.top.location
					: document.location;
		} catch (b) {
			q = document.location;
		}
		try {
			m = parent.location.href !== "" ? encodeURIComponent(parent.location.href.toString().substring(0, 512)) : "";
		} catch (z) {
			try {
				m = q !== null ? encodeURIComponent(q.toString().substring(0, 512)) : "";
			} catch (h) {
				m = "";
			}
		}
		var A,
			y = document.createElement("script"),
			w = null,
			v = document.getElementsByTagName("script"),
			t = Number(v.length) - 1,
			r = document.getElementsByTagName("script")[t];
		if (typeof A === "undefined") {
			A = Math.floor(Math.random() * 100000000000000000);
		}
		w =
			"dx.mountain.com/spx?conv=1&shaid=" +
			o +
			"&tdr=" +
			p +
			"&plh=" +
			m +
			"&cb=" +
			A +
			"&shoid=" +
			l +
			"&shoamt=" +
			i +
			"&shocur=" +
			c +
			"&shopid=" +
			k +
			"&shoq=" +
			g +
			"&shoup=" +
			j +
			"&shpil=" +
			u +
			shadditional;
		y.type = "text/javascript";
		y.src = ("https:" === document.location.protocol ? "https://" : "http://") + w;
		r.parentNode.insertBefore(y, r);
	})();
}

//  ** Pinterest ** //
function triggerPinterestEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof pintrk === "undefined") {
		throw new MasterworksTelemetryError("pintrk is undefined");
	}

	pintrk("track", "checkout", {
		value: ecommerce_data.total_transaction_amount,
		currency: "USD",
		line_items: ecommerce_data.items.map((item) => ({
			value: item.price,
			product_name: item.name,
		})),
	});
}

// ** Illumin ** //
function triggerIlluminEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof aap === "undefined") {
		throw new MasterworksTelemetryError("aap is undefined");
	}

	if (typeof mw_telemetry_settings.illumin_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("illumin_pixel_id is undefined");
	}

	if (!options.illumin_pg || typeof options.illumin_pg !== "number") {
		throw new MasterworksTelemetryError("Invalid options.illumin_pg: " + options.illumin_pg);
	}

	aap({
		pixelKey: mw_telemetry_settings.illumin_pixel_id,
		pg: options.illumin_pg,
		prodid: "donation",
		ordid: ecommerce_data.transaction_id,
		crev: ecommerce_data.total_transaction_amount,
		delay: 500,
	});
}

// ** StackAdapt ** //
function triggerStackAdaptEcommerceEvent(ecommerce_data, options = {}) {
	if (typeof saq === "undefined") {
		throw new MasterworksTelemetryError("saq is undefined");
	}

	if (!options.conversion_id || typeof options.conversion_id !== "string") {
		throw new MasterworksTelemetryError("Invalid options.conversion_id: " + options.conversion_id);
	}

	saq("conv", options.conversion_id, {
		revenue: ecommerce_data.total_transaction_amount,
		"order id": ecommerce_data.transaction_id,
		"transaction type": ecommerce_data.items[0].category,
	});
}

// ** BING ** //
function triggerBingEcommerceEvent(ecommerce_data, options = {}) {
	window.uetq = window.uetq || [];
	window.uetq.push("event", "donation", {
		event_category: "donation submit",
		event_label: "donation : submit",
		event_value: ecommerce_data.total_transaction_amount,
		revenue_value: ecommerce_data.total_transaction_amount,
		currency: "USD",
	});
}

// ** TradeDesk ** //
function triggerTradeDeskEcommerceEvent(ecommerce_data, options = {}) {
	if (mw_telemetry_settings.tradedesk_upixel_id === undefined) {
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_upixel_id is undefined");
	}

	if (mw_telemetry_settings.tradedesk_advertiser_id === undefined) {
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_advertiser_id is undefined");
	}

	ttd_dom_ready(function () {
		if (typeof TTDUniversalPixelApi === "function") {
			var universalPixelApi = new TTDUniversalPixelApi();
			universalPixelApi.init(mw_telemetry_settings.tradedesk_advertiser_id, [mw_telemetry_settings.tradedesk_upixel_id], "https://insight.adsrvr.org/track/up", {
				orderid: ecommerce_data.transaction_id,
				v: ecommerce_data.total_transaction_amount,
				vf: "USD",
				td1: ecommerce_data.items[0].category,
			});
		}
	});
}

/* ------------------------ Transaction Cookie Functions ----------------------- */

function generateTransactionCookieValue(ecommerce_data) {
	return ecommerce_data.items
		.map((item) => {
			return item.price + item.sku;
		})
		.join("");
}

function writeTransactionEventCookie(ecommerce_data) {
	const generatedTransactionCookieValue = generateTransactionCookieValue(ecommerce_data);
	const cookieExpiryTimeInMinutes = 5;
	writeCookie("mw_transaction", generatedTransactionCookieValue, cookieExpiryTimeInMinutes);
}

function getCookie(cname) {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(";");
	for (var i = 0; i < ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == " ") {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}

function writeCookie(name, value, expiryTimeInMinutes) {
	const currentDate = new Date();
	const expiryDate = new Date();
	const expiryTimeInMilliseconds = expiryTimeInMinutes * 60 * 1000;
	expiryDate.setTime(currentDate.getTime() + expiryTimeInMilliseconds);
	document.cookie = name + "=" + value + ";" + "expires=" + expiryDate.toGMTString() + ";path=/";
}

function writeTransactionDataLayerEvent(ecommerce_data) {
	let dataLayer = window.dataLayer || [];
	dataLayer.push({
		event: "mw_ecommerce_transaction",
		data: ecommerce_data,
	});
}
