/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

class MasterworksTelemetryError extends Error {
	constructor(message, data, originalStack = undefined) {
		super(message);
		this.data = data;

		if (typeof originalStack !== "undefined") {
			this.stack = originalStack;
		}

		const lineNumber = this.stack.split("\n")[1].split("/")[this.stack.split("\n")[1].split("/").length - 1].split(":")[1];

		if (typeof lineNumber !== "undefined") {
			this.line_number = parseInt(lineNumber);

			if (isNaN(this.line_number)) {
				this.line_number = undefined;
			}
		}

		const fileName = this.stack.split("\n")[1].split("/")[this.stack.split("\n")[1].split("/").length - 1].split(":")[0];

		if (typeof fileName !== "undefined") {
			this.file_name = fileName;
		}
	}

	logToConsole() {
		try {
			if (typeof mw_telemetry_settings === "undefined") {
				throw new Error("mw_telemetry_settings is undefined");
			}

			const client_name = mw_telemetry_settings.client_name;
			if (typeof client_name === "undefined") {
				throw new Error("client_name is undefined");
			}

			const client_abbreviation = mw_telemetry_settings.client_abbreviation;
			if (typeof client_abbreviation === "undefined") {
				throw new Error("client_abbreviation is undefined");
			}

			if (typeof this.message !== "string") {
				throw new Error("invalid error message. Must be string.");
			}

			console.log({
				client_name: client_name,
				client_abbreviation: client_abbreviation,
				message: this.message,
				data: this.data,
				line_number: this.line_number,
				file_name: this.file_name,
			});
		} catch (err) {
			console.error(err);
		}
	}
}

function handleErrors(callback) {
	return function (...args) {
		try {
			callback.apply(this, args);
		} catch (error) {
			handleError(error);
		}
	}.bind(this);
}

function handleError(error) {
	if (error instanceof MasterworksTelemetryError) {
		error.logToConsole();
	} else {
		new MasterworksTelemetryError(
			error.message,
			{
				is_javaScript_error: true,
			},
			error.stack
		).logToConsole();
	}
}

/* -------------------------------------------------------------------------- */
/*                                  Triggers                                  */
/* -------------------------------------------------------------------------- */

// To add a new trigger condition, add a new function to mw_trigger_types and add a callback for that trigger type to use (ex: element_exists function)
const mw_trigger_types = {
	element_exists: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector"]);
		mw_trigger_element_exists(trigger.selector, callback);
	},
	element_contains_text: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector", "text"]);
		mw_trigger_element_contains_text(trigger.selector, trigger.text, callback);
	},
	dataLayer_event: (trigger, callback) => {
		validateTriggerFields(trigger, ["event_name"]);
		mw_trigger_detect_dataLayer_event(trigger.event_name, callback);
	},
	parameter_equals: (trigger, callback) => {
		validateTriggerFields(trigger, ["parameter_key", "parameter_value"]);
		mw_trigger_parameter_equals(trigger.parameter_key, trigger.parameter_value, callback);
	},
	url_contains_all: (trigger, callback) => {
		validateTriggerFields(trigger, ["strings"]);
		mw_trigger_url_contains_all(trigger.strings, callback);
	},
	url_exact_match: (trigger, callback) => {
		validateTriggerFields(trigger, ["url"]);
		mw_trigger_url_exact_match(trigger.url, callback);
	},
	element_mousedown: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector"]);
		mw_trigger_element_mousedown(trigger.selector, callback);
	},
	element_trigger_event: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector", "trigger_event"]);
		mw_trigger_element_trigger_event(trigger.selector, trigger.trigger_event, callback);
	},
	page_view: (trigger, callback) => {
		callback();
	},
};

function validateTriggerFields(trigger, fields) {
	fields.forEach((field) => {
		if (!trigger[field]) {
			throw new MasterworksTelemetryError("Missing trigger field '" + field + "' : " + trigger[field]);
		}
	});
}

function set_mw_trigger(trigger, callback) {
	if (!trigger.type) {
		throw new MasterworksTelemetryError("Missing trigger.type: " + trigger.type);
	}

	if (!mw_trigger_types[trigger.type]) {
		throw new MasterworksTelemetryError("Invalid trigger.type: " + trigger.type);
	}

	if (trigger.timeout && typeof trigger.timeout !== "number") {
		throw new MasterworksTelemetryError("Invalid trigger.timeout: " + trigger.timeout);
	}

	if (trigger.urls) {
		if (!Array.isArray(trigger.urls)) {
			throw new MasterworksTelemetryError("Invalid trigger.urls: " + trigger.urls);
		}

		if (!trigger.urls.every((url) => typeof url === "string")) {
			throw new MasterworksTelemetryError("Invalid trigger.urls: " + trigger.urls);
		}

		if (!trigger.urls.some((url) => matches_current_url(url))) {
			return;
		}
	}

	if (trigger.timeout) {
		setTimeout(() => {
			mw_trigger_types[trigger.type](trigger, callback);
		}, trigger.timeout);
	} else {
		mw_trigger_types[trigger.type](trigger, callback);
	}
}

/* ----------------------- All trigger type functions ----------------------- */
function mw_trigger_element_exists(selector, callback) {
	const elementExistsInterval = setInterval(function () {
		if (document.querySelector(selector)) {
			clearInterval(elementExistsInterval);
			callback();
		}
	}, 100);
}

function mw_trigger_element_contains_text(selector, text, callback) {
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

function mw_trigger_detect_dataLayer_event(event_name, callback) {
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

function mw_trigger_parameter_equals(parameter_key, parameter_value, callback) {
	const urlParameterEqualsInterval = setInterval(() => {
		const urlsParams = new URLSearchParams(window.location.search);
		if (urlsParams.get(parameter_key) === parameter_value) {
			clearInterval(urlParameterEqualsInterval);
			callback();
		}
	}, 500);
}

function mw_trigger_url_contains_all(strings, callback) {
	if (!Array.isArray(strings)) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.strings: " + strings);
	}

	const urlContainsAllInterval = setInterval(() => {
		if (strings.every((string) => matches_current_url(string))) {
			clearInterval(urlContainsAllInterval);
			callback();
		}
	}, 500);
}

function mw_trigger_url_exact_match(url, callback) {
	if (window.location.href === url) {
		callback();
	}
}

function mw_trigger_element_mousedown(selector, callback) {
	document.addEventListener("mousedown", function (event) {
		if (event.target.matches(selector)) {
			callback();
		}
	});
}

function mw_trigger_element_trigger_event(selector, trigger_event, callback) {
	document.querySelectorAll(selector).forEach((element) => {
		element.addEventListener(trigger_event, callback);
	});
}

/* ---------------------------- Helper Functions ---------------------------- */
function matches_current_url(url) {
	return window.location.href.includes(url);
}

/* -------------------------------------------------------------------------- */
/*                              Custom Dimensions                             */
/* -------------------------------------------------------------------------- */
const MW_CUSTOM_DIMENSIONS_INTERVAL_DURATION = 50;
const MW_CUSTOM_DIMENSIONS_INTERVAL_LIMIT = 10000;

function SetMWCustomDimensions() {
	var mwsc = getUrlParameter("mwsc");
	var mwm_id = getUrlParameter("mwm_id");
	var csc = getUrlParameter("refcd");
	var seid = getUrlParameter("seid");
	var rudd_id = "";
	if (typeof rudderanalytics != "undefined") {
		rudd_id = rudderanalytics.getAnonymousId();
	}

	if (mw_telemetry_settings.matomo_conflict) {
		window._ppas = window._ppas || [];
	} else {
		window._paq = window._paq || [];
	}

	if (mwsc) {
		if (mw_telemetry_settings.matomo_conflict) {
			_ppas.push(["setCustomDimension", 1, mwsc]);
		} else {
			_paq.push(["setCustomDimension", 1, mwsc]);
		}
	}
	if (mwm_id) {
		if (mw_telemetry_settings.matomo_conflict) {
			_ppas.push(["setCustomDimension", 2, mwm_id]);
		} else {
			_paq.push(["setCustomDimension", 2, mwm_id]);
		}
	}
	if (rudd_id) {
		if (mw_telemetry_settings.matomo_conflict) {
			_ppas.push(["setCustomDimension", 3, rudd_id]);
		} else {
			_paq.push(["setCustomDimension", 3, rudd_id]);
		}
	}
	if (csc) {
		if (mw_telemetry_settings.matomo_conflict) {
			_ppas.push(["setCustomDimension", 5, csc]);
		} else {
			_paq.push(["setCustomDimension", 5, csc]);
		}
	}
	if (seid) {
		if (mw_telemetry_settings.matomo_conflict) {
			_ppas.push(["setCustomDimension", 6, seid]);
		} else {
			_paq.push(["setCustomDimension", 6, seid]);
		}
	}

	if (mw_telemetry_settings.matomo_conflict) {
		_ppas.push(["ping"]);
	} else {
		_paq.push(["ping"]);
	}
}

function InitiateMWCustomDimensions() {
	let mwCustomDimensionsIntervalCleared = false;
	let mwCustomDimensionsInterval = setInterval(function () {
		if (typeof rudderanalytics !== "undefined") {
			const rudderstackAnonymousID = rudderanalytics.getAnonymousId();
			if (typeof rudderstackAnonymousID !== "undefined") {
				if (!mwCustomDimensionsIntervalCleared) {
					SetMWCustomDimensions();
					clearInterval(mwCustomDimensionsInterval);
					mwCustomDimensionsIntervalCleared = true;
				}
			}
		}
	}, MW_CUSTOM_DIMENSIONS_INTERVAL_DURATION);

	// If the interval is not cleared after the limit, clear it and set the custom dimensions
	setTimeout(function () {
		if (!mwCustomDimensionsIntervalCleared) {
			SetMWCustomDimensions();
			clearInterval(mwCustomDimensionsInterval);
			mwCustomDimensionsIntervalCleared = true;
		}
	}, MW_CUSTOM_DIMENSIONS_INTERVAL_LIMIT);
}

// Call the function
InitiateMWCustomDimensions();

/* ---------------------------- Helper Functions ---------------------------- */
function getUrlParameter(name, url = window.location.href) {
	name = name.replace(/[\[\]]/g, "\\$&");
	var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)", "i"),
		results = regex.exec(url);
	if (!results) return null;
	if (!results[2]) return "";
	return decodeURIComponent(results[2].replace(/\+/g, " "));
}

/* -------------------------------------------------------------------------- */
/*                           Piwik ID to Rudderstack                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                           Piwik ID to Rudderstack                          */
/* -------------------------------------------------------------------------- */
const PIWIK_ID_CHECK_INTERVAL_DURATION = 100;
const PIWIK_ID_CHECK_INTERVAL_LIMIT = 10000;

function initiatePiwikIdToRudderstack() {
	let piwikIdCheckIntervalCleared = false;
	let piwikIdCheckInterval = setInterval(() => {
		var piwikCookieId = getPiwikCookieId();
		if (typeof rudderanalytics !== "undefined" && piwikCookieId) {
			rudderanalytics.identify("", { piwik_id: piwikCookieId });
			clearInterval(piwikIdCheckInterval);
			piwikIdCheckIntervalCleared = true;
		}
	}, PIWIK_ID_CHECK_INTERVAL_DURATION);

	// If the interval is not cleared after the limit, clear it
	setTimeout(() => {
		if (!piwikIdCheckIntervalCleared) {
			clearInterval(piwikIdCheckInterval);
			piwikIdCheckIntervalCleared = true;
		}
	}, PIWIK_ID_CHECK_INTERVAL_LIMIT);
}

function getPiwikCookieId() {
	const piwikCookieRegex = /_pk_id\.[a-z0-9-]+\.[a-z0-9]+=([^;]+);?/;
	const match = document.cookie.match(piwikCookieRegex);

	if (match) {
		const cookieValue = match[1];
		const firstPortion = cookieValue.split(".")[0];
		return firstPortion;
	} else {
		return null; // or handle the case when the cookie is not found
	}
}

// Call the function
initiatePiwikIdToRudderstack();

/* -------------------------------------------------------------------------- */
/*                                  Ecommerce                                 */
/* -------------------------------------------------------------------------- */

/* -------------------- Set Triggers for Ecommerce Events ------------------- */
if (mw_telemetry_settings.ecommerce_configurations && mw_telemetry_settings.ecommerce_configurations.length > 0) {
	mw_telemetry_settings.ecommerce_configurations.forEach((configuration) => {
		if (!Array.isArray(configuration.triggers)) {
			throw new MasterworksTelemetryError("Invalid ecommerce_configuration.triggers: " + configuration.triggers);
		}

		configuration.triggers.forEach((trigger) => {
			try {
				const initializeInterval = setInterval(() => {
					if (typeof set_mw_trigger !== "undefined") {
						set_mw_trigger(trigger, () => {
							triggerMWEcommerceEvent(configuration);
						});
						clearInterval(initializeInterval);
					}
				}, 100);
			} catch (error) {
				console.error(error);
			}
		});
	});
}

/* ------------------------ Ecommerce Event Functions ----------------------- */

function triggerMWEcommerceEvent(configuration) {
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
					triggerRudderstackEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "piwik":
					triggerPiwikEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "facebook":
					triggerFacebookEcommerceEvents(ecommerce_data, platform.options, platform.event_type);
					break;
				case "adform":
					triggerAdformEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "zemanta":
					triggerZemantaEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "google_ads":
					triggerGoogleAdsEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "tiktok":
					triggerTikTokEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "mntn":
					triggerMNTNEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "taboola":
					triggerTaboolaEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "pinterest":
					triggerPinterestEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "illumin":
					triggerIlluminEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "stackadapt":
					triggerStackAdaptEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "bing":
					triggerBingEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "tradedesk":
					triggerTradeDeskEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "linkedin":
					triggerLinkedInEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
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
function triggerRudderstackEcommerceEvent(ecommerce_data, options = {}, event_type = "Order Completed") {
	if (typeof rudderanalytics === "undefined") {
		throw new MasterworksTelemetryError("rudderanalytics is not defined");
	}

	rudderanalytics.track(event_type, {
		order_id: ecommerce_data.transaction_id,
		currency: "USD",
		revenue: ecommerce_data.total_transaction_amount,
		products: ecommerce_data.items,
	});
}

// ** Piwik ** //
function triggerPiwikEcommerceEvent(ecommerce_data, options = {}, event_type = "trackEcommerceOrder") {
	if (options.matomo_conflict || mw_telemetry_settings.matomo_conflict) {
		if (typeof _ppas === "undefined") {
			throw new MasterworksTelemetryError("_ppas is undefined");
		}

		ecommerce_data.items.forEach((item) => {
			_ppas.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
		});

		_ppas.push([event_type, ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
		return;
	}

	if (typeof _paq === "undefined") {
		throw new MasterworksTelemetryError("_paq is undefined");
	}

	ecommerce_data.items.forEach((item) => {
		_paq.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
	});

	_paq.push([event_type, ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
	return;
}

// ** Facebook ** //
function triggerFacebookEcommerceEvents(ecommerce_data, options = {}, event_type = "Purchase") {
	if (typeof fbq === "undefined") {
		throw new MasterworksTelemetryError("fbq is undefined");
	}

	if (!options.sustainer_only) {
		if (options.facebook_pixel_ids && options.facebook_pixel_ids.length > 0) {
			for (let i = 0; i < options.facebook_pixel_ids.length; i++) {
				fbq("trackSingle", options.facebook_pixel_ids[i].toString(), event_type, { value: ecommerce_data.total_transaction_amount, currency: "USD" });
			}
		} else {
			fbq("track", event_type, { value: ecommerce_data.total_transaction_amount, currency: "USD" });
		}
	}

	ecommerce_data.items.forEach((item) => {
		if (item.category === "sustainer") {
			fbq("trackCustom", "SustainerDonation", { value: item.amount, currency: "USD", content_ids: item.sku, content_name: item.name });
		}
	});
}

// ** Adform ** //
function triggerAdformEcommerceEvent(ecommerce_data, options = {}, event_type = "Donation") {
	if (typeof mw_telemetry_settings.adform_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("_adftrack is undefined");
	}

	window._adftrack = Array.isArray(window._adftrack) ? window._adftrack : window._adftrack ? [window._adftrack] : [];
	window._adftrack.push({
		pm: mw_telemetry_settings.adform_pixel_id,
		divider: encodeURIComponent("|"),
		pagename: encodeURIComponent("MW-" + event_type),
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
function triggerZemantaEcommerceEvent(ecommerce_data, options = {}, event_type = "PURCHASE") {
	if (typeof zemApi === "undefined") {
		throw new MasterworksTelemetryError("zemApi is undefined");
	}
	zemApi("track", event_type, { value: ecommerce_data.total_transaction_amount, currency: "USD" });
}

// ** Google Ads ** //
function triggerGoogleAdsEcommerceEvent(ecommerce_data, options = {}, event_type = "conversion") {
	if (typeof gtag === "undefined") {
		throw new MasterworksTelemetryError("gtag is undefined");
	}

	if (!options || !options.google_ads_send_to_ids || options.google_ads_send_to_ids.length < 1) {
		throw new MasterworksTelemetryError("Invalid options.google_ads_send_to_ids: " + options.google_ads_send_to_ids);
	}

	options.google_ads_send_to_ids.forEach((google_ads_send_to_id) => {
		gtag("event", event_type, {
			send_to: google_ads_send_to_id,
			value: ecommerce_data.total_transaction_amount,
			currency: "USD",
			transaction_id: ecommerce_data.transaction_id,
		});
	});
}

// ** TikTok ** //
function triggerTikTokEcommerceEvent(ecommerce_data, options = {}, event_type = "CompletePayment") {
	if (typeof ttq === "undefined") {
		throw new MasterworksTelemetryError("ttq is undefined");
	}

	ttq.track(event_type, {
		content_name: "donation",
		value: ecommerce_data.total_transaction_amount,
		currency: "USD",
	});
}

// ** Taboola ** //
function triggerTaboolaEcommerceEvent(ecommerce_data, options = {}, event_type = "Purchase") {
	if (typeof mw_telemetry_settings.taboola_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("taboola_pixel_id is undefined");
	}

	_tfa.push({
		notify: "event",
		name: event_type,
		id: mw_telemetry_settings.taboola_pixel_id,
		revenue: ecommerce_data.total_transaction_amount,
	});
}

// ** MNTN ** //
function triggerMNTNEcommerceEvent(ecommerce_data, options = {}, event_type = "Purchase") {
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
function triggerPinterestEcommerceEvent(ecommerce_data, options = {}, event_type = "checkout") {
	if (typeof pintrk === "undefined") {
		throw new MasterworksTelemetryError("pintrk is undefined");
	}

	pintrk("track", event_type, {
		value: ecommerce_data.total_transaction_amount,
		currency: "USD",
		line_items: ecommerce_data.items.map((item) => ({
			value: item.price,
			product_name: item.name,
		})),
	});
}

// ** Illumin ** //
function triggerIlluminEcommerceEvent(ecommerce_data, options = {}, event_type = "donation") {
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
		prodid: event_type,
		ordid: ecommerce_data.transaction_id,
		crev: ecommerce_data.total_transaction_amount,
		delay: 500,
	});
}

// ** StackAdapt ** //
function triggerStackAdaptEcommerceEvent(ecommerce_data, options = {}, event_type = "conv") {
	if (typeof saq === "undefined") {
		throw new MasterworksTelemetryError("saq is undefined");
	}

	if (!options.conversion_id || typeof options.conversion_id !== "string") {
		throw new MasterworksTelemetryError("Invalid options.conversion_id: " + options.conversion_id);
	}

	saq(event_type, options.conversion_id, {
		revenue: ecommerce_data.total_transaction_amount,
		"order id": ecommerce_data.transaction_id,
		"transaction type": ecommerce_data.items[0].category,
	});
}

// ** BING ** //
function triggerBingEcommerceEvent(ecommerce_data, options = {}, event_type = "donation") {
	window.uetq = window.uetq || [];
	window.uetq.push("event", event_type, {
		event_category: "donation submit",
		event_label: "donation : submit",
		event_value: ecommerce_data.total_transaction_amount,
		revenue_value: ecommerce_data.total_transaction_amount,
		currency: "USD",
	});
}

// ** TradeDesk ** //
function triggerTradeDeskEcommerceEvent(ecommerce_data, options = {}, event_type = "donation") {
	if (mw_telemetry_settings.tradedesk_advertiser_id === undefined) {
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_advertiser_id is undefined");
	}

	if (options.tradedesk_tracking_tag_ids === undefined || !Array.isArray(options.tradedesk_tracking_tag_ids) || options.tradedesk_tracking_tag_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.tradedesk_tracking_tag_ids: " + options.tradedesk_tracking_tag_ids);
	}

	for (let i = 0; i < options.tradedesk_tracking_tag_ids.length; i++) {
		var img = document.createElement("img");
		img.setAttribute("height", "1");
		img.setAttribute("width", "1");
		img.setAttribute("style", "border-style:none;");
		img.setAttribute("alt", "");
		img.setAttribute(
			"src",
			`https://insight.adsrvr.org/track/pxl/?adv=${mw_telemetry_settings.tradedesk_advertiser_id}&ct=${options.tradedesk_tracking_tag_ids[i]}&fmt=3&orderid=` +
				ecommerce_data.transaction_id +
				"&td1=" +
				event_type +
				"&v=" +
				ecommerce_data.total_transaction_amount +
				"&vf=" +
				"USD"
		);
		document.body.appendChild(img);
	}

	if (options.tradedesk_sustainer_tracking_tag_ids !== undefined && Array.isArray(options.tradedesk_sustainer_tracking_tag_ids) && options.tradedesk_sustainer_tracking_tag_ids.length > 0) {
		for (let i = 0; i < ecommerce_data.items.length; i++) {
			if (ecommerce_data.items[i].category === "sustainer") {
				for (let j = 0; j < options.tradedesk_sustainer_tracking_tag_ids.length; j++) {
					var img = document.createElement("img");
					img.setAttribute("height", "1");
					img.setAttribute("width", "1");
					img.setAttribute("style", "border-style:none;");
					img.setAttribute("alt", "");
					img.setAttribute(
						"src",
						`https://insight.adsrvr.org/track/pxl/?adv=${mw_telemetry_settings.tradedesk_advertiser_id}&ct=${options.tradedesk_sustainer_tracking_tag_ids[j]}&fmt=3&orderid=` +
							ecommerce_data.transaction_id +
							"&td1=sustainer" +
							"&v=" +
							ecommerce_data.items[i].price +
							"&vf=" +
							"USD"
					);
					document.body.appendChild(img);
				}
			}
		}
	}
}

// ** LinkedIn ** //
function triggerLinkedInEcommerceEvent(ecommerce_data, options = {}, event_type = "conversion") {
	if (typeof window.lintrk === "undefined") {
		throw new MasterworksTelemetryError("window.lintrk is undefined");
	}

	if (typeof options.linkedin_conversion_id === "undefined") {
		throw new MasterworksTelemetryError("options.linkedin_conversion_id is undefined");
	}

	window.lintrk("track", { conversion_id: options.linkedin_conversion_id });
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

/* -------------------------------------------------------------------------- */
/*                                Custom Events                               */
/* -------------------------------------------------------------------------- */

if (mw_telemetry_settings.custom_event_configurations && mw_telemetry_settings.custom_event_configurations.length > 0) {
	mw_telemetry_settings.custom_event_configurations.forEach((configuration) => {
		if (!configuration.event_name || typeof configuration.event_name !== "string") {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.event_name: " + configuration.event_name);
		}

		if (!configuration.triggers || !Array.isArray(configuration.triggers) || configuration.triggers.length === 0) {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers: " + configuration.triggers);
		}

		configuration.triggers.forEach((trigger) => {});

		if (!configuration.platforms || !Array.isArray(configuration.platforms) || configuration.platforms.length === 0) {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms: " + configuration.platforms);
		}

		configuration.platforms.forEach((platform) => {
			if (!platform.name || typeof platform.name !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.name: " + platform.name);
			}

			if (!platform.event_type || typeof platform.event_type !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.event_type: " + platform.event_type);
			}

			if (platform.name === "illumin" && !platform.illumin_pg && typeof platform.illumin_pg !== number) {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.illumin_pg: " + platform.illumin_pg);
			}
		});

		configuration.triggers.forEach((trigger) => {
			try {
				const initializeInterval = setInterval(() => {
					if (typeof set_mw_trigger !== "undefined") {
						set_mw_trigger(trigger, () => {
							triggerMWCustomEvent(configuration);
						});
						clearInterval(initializeInterval);
					}
				}, 100);
			} catch (error) {
				console.error(error);
			}
		});
	});
}

function triggerMWCustomEvent(configuration) {
	configuration.platforms.forEach((platform) => {
		handlePlatformEvent(platform, configuration);
	});
}

function handlePlatformEvent(platform, configuration) {
	switch (platform.name) {
		case "rudderstack":
			fireRudderstackCustomEvent(platform.event_type, configuration.event_name, configuration.metadata);
			break;
		case "piwik":
			firePiwikCustomEvent(platform.event_type, configuration.event_name, platform.options);
			break;
		case "facebook":
			fireFacebookCustomEvent(platform.event_type, configuration.event_name, platform.options, configuration.metadata);
			break;
		case "adform":
			fireAdformCustomEvent(platform.event_type, configuration.event_name);
			break;
		case "zemanta":
			fireZemantaCustomEvent(platform.event_type);
			break;
		case "tiktok":
			fireTiktokCustomEvent(platform.event_type, configuration.event_name, configuration.metadata);
			break;
		case "illumin":
			fireIlluminCustomEvent(platform.illumin_pg);
			break;
		case "google_ads":
			fireGoogleAdsCustomEvent(platform.event_type, configuration.event_name, platform.options);
			break;
		case "taboola":
			fireTaboolaCustomEvent(platform.event_type, configuration.event_name);
			break;
		case "twitter":
			fireTwitterCustomEvent(platform.event_type);
			break;
		case "reddit":
			fireRedditCustomEvent(platform.event_type);
			break;
		case "pinterest":
			firePinterestCustomEvent(platform.event_type);
			break;
		case "tradedesk":
			fireTradedeskCustomEvent(platform.event_type, configuration.event_name, platform.options);
			break;
		case "linkedin":
			fireLinkedInCustomEvent(platform.options);
			break;
		default:
			throw new MasterworksTelemetryError("Invalid platform: " + platform.name);
	}
}

function fireRudderstackCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof rudderanalytics === "undefined") {
		throw new MasterworksTelemetryError("rudderanalytics is undefined");
	}

	metadata.event_name = event_name;
	rudderanalytics.track(event_type, metadata);
}

function firePiwikCustomEvent(event_type, event_name, options = {}) {
	if ((options && options.matomo_conflict) || mw_telemetry_settings.matomo_conflict) {
		if (typeof _ppas === "undefined") {
			throw new MasterworksTelemetryError("_ppas is undefined");
		}

		_ppas.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	} else {
		if (typeof _paq === "undefined") {
			throw new MasterworksTelemetryError("_paq is undefined");
		}

		_paq.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	}
}

function fireFacebookCustomEvent(event_type, event_name, options = {}, metadata = {}) {
	if (typeof fbq === "undefined") {
		throw new MasterworksTelemetryError("fbq is undefined");
	}

	if (options.facebook_track_custom) {
		fbq("trackCustom", event_type, { content_name: event_name, ...metadata });
		return;
	}

	fbq("track", event_type, { content_name: event_name, ...metadata });
}

function fireAdformCustomEvent(event_type, event_name) {
	if (typeof mw_telemetry_settings.adform_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.adform_pixel_id is undefined");
	}

	window._adftrack = Array.isArray(window._adftrack) ? window._adftrack : window._adftrack ? [window._adftrack] : [];
	window._adftrack.push({
		pm: mw_telemetry_settings.adform_pixel_id,
		divider: encodeURIComponent("|"),
		pagename: encodeURIComponent(`MW-${event_type}`),
		order: {
			sv1: event_name,
			sv8: event_name,
			sv97: event_name,
		},
	});
	(function () {
		var s = document.createElement("script");
		s.type = "text/javascript";
		s.async = true;
		s.src = "https://a2.adform.net/serving/scripts/trackpoint/async/";
		var x = document.getElementsByTagName("script")[0];
		x.parentNode.insertBefore(s, x);
	})();
}

function fireZemantaCustomEvent(event_type) {
	if (typeof zemApi === "undefined") {
		throw new MasterworksTelemetryError("zemApi is undefined");
	}

	// Track Event
	zemApi("track", event_type);
}

function fireTiktokCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof ttq === "undefined") {
		throw new MasterworksTelemetryError("ttq is undefined");
	}

	ttq.track(event_type, {
		content_name: event_name,
		...metadata,
	});
}

function fireIlluminCustomEvent(illumin_pg) {
	if (typeof aap === "undefined") {
		throw new MasterworksTelemetryError("aap is undefined");
	}

	if (typeof illumin_pg === "undefined") {
		throw new MasterworksTelemetryError("illumin_pg is undefined");
	}

	if (typeof mw_telemetry_settings.illumin_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.illumin_pixel_id is undefined");
	}

	aap({
		pixelKey: mw_telemetry_settings.illumin_pixel_id,
		pg: illumin_pg,
	});
}

function fireGoogleAdsCustomEvent(event_type, event_name, options = {}) {
	if (typeof gtag === "undefined") {
		throw new MasterworksTelemetryError("gtag is undefined");
	}

	if (!options.google_ads_send_to_ids || !Array.isArray(options.google_ads_send_to_ids) || options.google_ads_send_to_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.google_ads_send_to_ids: " + options.google_ads_send_to_ids);
	}

	for (let i = 0; i < options.google_ads_send_to_ids.length; i++) {
		gtag("event", event_type, {
			send_to: options.google_ads_send_to_ids[i],
		});
	}
}

function fireTaboolaCustomEvent(event_type, event_name) {
	if (typeof _tfa === "undefined") {
		throw new MasterworksTelemetryError("_tfa is undefined");
	}

	if (typeof mw_telemetry_settings.taboola_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.taboola_pixel_id is undefined");
	}

	_tfa.push({ notify: "event", name: event_type, id: mw_telemetry_settings.taboola_pixel_id });
}

function fireTwitterCustomEvent(event_type) {
	if (typeof twq === "undefined") {
		throw new MasterworksTelemetryError("twq is undefined");
	}

	twq("track", event_type);
}

function fireRedditCustomEvent(event_type) {
	if (typeof rdt === "undefined") {
		throw new MasterworksTelemetryError("rdt is undefined");
	}

	rdt("track", event_type);
}

function fireTradedeskCustomEvent(event_type, event_name, options = {}) {
	if (mw_telemetry_settings.tradedesk_advertiser_id === undefined) {
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_advertiser_id is undefined");
	}

	if (options.tradedesk_tracking_tag_ids === undefined || !Array.isArray(options.tradedesk_tracking_tag_ids) || options.tradedesk_tracking_tag_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.tradedesk_tracking_tag_ids: " + options.tradedesk_tracking_tag_ids);
	}

	for (let i = 0; i < options.tradedesk_tracking_tag_ids.length; i++) {
		var img = document.createElement("img");
		img.setAttribute("height", "1");
		img.setAttribute("width", "1");
		img.setAttribute("style", "border-style:none;");
		img.setAttribute("alt", "");
		img.setAttribute(
			"src",
			`https://insight.adsrvr.org/track/pxl/?adv=${mw_telemetry_settings.tradedesk_advertiser_id}&ct=${options.tradedesk_tracking_tag_ids[i]}&fmt=3` + "&td1=" + event_type + "&td2=" + event_name
		);
		document.body.appendChild(img);
	}
}

function firePinterestCustomEvent(event_type) {
	if (typeof pintrk === "undefined") {
		throw new MasterworksTelemetryError("pintrk is undefined");
	}

	pintrk("track", event_type);
}

function fireLinkedInCustomEvent(options = {}) {
	if (typeof window.lintrk === "undefined") {
		throw new MasterworksTelemetryError("window.lintrk is undefined");
	}

	if (typeof options.linkedin_conversion_id === "undefined") {
		throw new MasterworksTelemetryError("options.linkedin_conversion_id is undefined");
	}

	window.lintrk("track", { conversion_id: options.linkedin_conversion_id });
}

function writeEventToDataLayer(event_name, metadata = {}) {
	let dataLayer = window.dataLayer || [];
	dataLayer.push({
		event: "mw_custom_event_telemetry",
		event_name: event_name,
		metadata: metadata,
	});
}

/* -------------------------------------------------------------------------- */
/*                             User Identification                            */
/* -------------------------------------------------------------------------- */

class IdentificationConfiguration {
	constructor(configuration) {
		this.validate(configuration);
		this.configuration = configuration;
	}

	validate(configuration) {
		if (!configuration || typeof configuration !== "object") {
			throw new MasterworksTelemetryError("IdentificationConfiguration initialized with invalid or missing configuration", {
				configuration: configuration,
			});
		}

		if (configuration.timeout && typeof configuration.timeout !== "number") {
			throw new MasterworksTelemetryError("IdentificationConfiguration initialized with invalid timeout", {
				configuration: configuration,
			});
		}
	}

	setIdentificationEvents() {
		document.body.addEventListener(
			"blur",
			(event) => {
				// TODO outdated, need to remove once all telemetry settings are updated
				if (this.configuration.selectors) {
					for (let i = 0; i < this.configuration.selectors.length; i++) {
						if (!event.target.matches(this.configuration.selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { email: fieldValue });
						return;
					}
				}

				if (this.configuration.email_selectors && this.configuration.email_selectors.length > 0) {
					for (let i = 0; i < this.configuration.email_selectors.length; i++) {
						if (!event.target.matches(this.configuration.email_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { email: fieldValue });
						return;
					}
				}

				if (this.configuration.phone_selectors && this.configuration.phone_selectors.length > 0) {
					for (let i = 0; i < this.configuration.phone_selectors.length; i++) {
						if (!event.target.matches(this.configuration.phone_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { phone: fieldValue });
						return;
					}
				}

				if (this.configuration.city_selectors && this.configuration.city_selectors.length > 0) {
					for (let i = 0; i < this.configuration.city_selectors.length; i++) {
						if (!event.target.matches(this.configuration.city_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { city: fieldValue });
						return;
					}
				}

				if (this.configuration.state_selectors && this.configuration.state_selectors.length > 0) {
					for (let i = 0; i < this.configuration.state_selectors.length; i++) {
						if (!event.target.matches(this.configuration.state_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { state: fieldValue });
						return;
					}
				}

				if (this.configuration.zip_selectors && this.configuration.zip_selectors.length > 0) {
					for (let i = 0; i < this.configuration.zip_selectors.length; i++) {
						if (!event.target.matches(this.configuration.zip_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, { zip: fieldValue });
						return;
					}
				}
			},
			true
		);
	}

	fireIdentificationEvent(fieldValue) {
		if (fieldValue) {
			fieldValue = fieldValue.replace(/[^a-zA-Z0-9@.\-_]/g, "");
			rudderanalytics.identify(fieldValue);

			if (mw_telemetry_settings.matomo_conflict) {
				if (typeof _ppas != "undefined") {
					_ppas.push(["trackEvent", "mw", "mw : emcap", "mw : emcap : " + fieldValue, 0, { dimension4: fieldValue }]);
				}
			} else {
				if (typeof _paq != "undefined") {
					_paq.push(["trackEvent", "mw", "mw : emcap", "mw : emcap : " + fieldValue, 0, { dimension4: fieldValue }]);
				}
			}
		}
	}
}

if (mw_telemetry_settings.identification_configuration) {
	const indentificationConfiguration = new IdentificationConfiguration(mw_telemetry_settings.identification_configuration);
	if (indentificationConfiguration.configuration.timeout) {
		setTimeout(indentificationConfiguration.setIdentificationEvents(), indentificationConfiguration.configuration.timeout);
	} else {
		indentificationConfiguration.setIdentificationEvents();
	}
}

/* -------------------------------------------------------------------------- */
/*                               Product Search                               */
/* -------------------------------------------------------------------------- */

class ProductSearchConfiguration {
	constructor(configuration) {
		this.validate(configuration);
		this.configuration = configuration;
	}

	validate(configuration) {
		if (!configuration || typeof configuration !== "object") {
			throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid or missing configuration", {
				configuration: configuration,
			});
		}

		if (!configuration.url_parameter || typeof configuration.url_parameter !== "string") {
			throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid or missing url_parameter", {
				configuration: configuration,
			});
		}

		if (configuration.urls && (!Array.isArray(configuration.urls) || configuration.urls.length < 1)) {
			throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid urls", {
				configuration: configuration,
			});
		}

		if (configuration.urls) {
			for (let i = 0; i < configuration.urls.length; i++) {
				if (typeof configuration.urls[i] !== "string") {
					throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid urls", {
						configuration: configuration,
					});
				}
			}
		}
	}

	matchesCurrentURL() {
		if (!this.configuration.urls) {
			return true;
		}

		for (let i = 0; i < this.configuration.urls.length; i++) {
			if (window.location.href.includes(this.configuration.urls[i])) {
				return true;
			}
		}

		return false;
	}

	getProductSearch() {
		const urlParams = new URLSearchParams(window.location.search);
		const productSearch = urlParams.get(this.configuration.url_parameter);
		return productSearch;
	}

	fireProductSearchEvent() {
		const productSearch = this.getProductSearch();
		if (productSearch) {
			rudderanalytics.track("Products Searched", {
				query: productSearch,
			});
		}
	}
}

if (Array.isArray(mw_telemetry_settings.product_search_configurations)) {
	mw_telemetry_settings.product_search_configurations.forEach((configuration) => {
		const productSearchConfiguration = new ProductSearchConfiguration(configuration);

		if (!productSearchConfiguration.matchesCurrentURL()) {
			return;
		}

		productSearchConfiguration.fireProductSearchEvent();
	});
}
