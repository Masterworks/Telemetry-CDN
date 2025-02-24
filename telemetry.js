/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

class MasterworksTelemetryError extends Error {
	constructor(message, data, originalStack = undefined) {
		super(message);
		this.data = data;
		console.log(data);

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
	}

	reportError() {
		return new Promise((resolve, reject) => {
			try {
				if (typeof mw_telemetry_settings === "undefined") {
					throw new Error("mw_telemetry_settings is undefined");
				}

				if (typeof mw_telemetry_settings.client_name === "undefined") {
					throw new Error("client_name is undefined");
				}

				if (typeof mw_telemetry_settings.client_abbreviation === "undefined") {
					throw new Error("client_abbreviation is undefined");
				}

				if (mw_telemetry_settings.disable_error_reporting) {
					return;
				}

				if (typeof this.message !== "string") {
					throw new Error("invalid error message. Must be string.");
				}

				const body = {
					client_name: mw_telemetry_settings.client_name,
					client_abbreviation: mw_telemetry_settings.client_abbreviation,
					message: this.message,
					line_number: this.line_number,
					location: window.location.href,
				};

				const piwikCookieId = getPiwikCookieId();
				if (piwikCookieId) {
					body.piwik_id = piwikCookieId;
				}

				if (this.data) {
					body.data = this.data;
				}

				if (this.stack) {
					body.stack = this.stack;
				}

				fetch("https://telmon.masterworks.digital/log/error", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
				})
					.then((response) => {
						if (response.ok) {
							resolve();
						} else {
							reject(new Error("Failed to report error"));
						}
					})
					.catch((error) => {
						reject(error);
					});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		});
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
	dataLayer_event_interval: (trigger, callback) => {
		validateTriggerFields(trigger, ["event_name"]);
		mw_trigger_detect_dataLayer_event_interval(trigger.event_name, callback);
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
	element_trigger_event_v2: (trigger, callback) => {
		validateTriggerFields(trigger, ["selector", "trigger_event"]);
		mw_trigger_element_trigger_event_v2(trigger.selector, trigger.trigger_event, callback);
	},
	pathname_exact_match: (trigger, callback) => {
		validateTriggerFields(trigger, ["pathname"]);
		mw_trigger_pathname_exact_match(trigger.pathname, callback);
	},
	javascript_message_contains_text: (trigger, callback) => {
		validateTriggerFields(trigger, ["text"]);
		mw_trigger_javascript_message_contains_text(trigger.text, callback);
	},
	page_view: (trigger, callback) => {
		callback();
	},
};

function validateTriggerFields(trigger, fields) {
	fields.forEach((field) => {
		if (!trigger[field]) {
			throw new MasterworksTelemetryError("Missing trigger field: " + field, { trigger: trigger }).reportError();
		}
	});
}

function set_mw_trigger(trigger, callback) {
	if (!trigger.type) {
		throw new MasterworksTelemetryError("Missing trigger.type", { trigger: trigger }).reportError();
	}

	if (!mw_trigger_types[trigger.type]) {
		throw new MasterworksTelemetryError("Invalid trigger.type: " + trigger.type, { trigger: trigger }).reportError();
	}

	if (trigger.timeout && typeof trigger.timeout !== "number") {
		throw new MasterworksTelemetryError("Invalid trigger.timeout", { trigger: trigger }).reportError();
	}

	if (trigger.urls) {
		if (!Array.isArray(trigger.urls)) {
			throw new MasterworksTelemetryError("Invalid trigger.urls", { trigger: trigger }).reportError();
		}

		if (!trigger.urls.every((url) => typeof url === "string")) {
			throw new MasterworksTelemetryError("Invalid trigger.urls", { trigger: trigger }).reportError();
		}

		if (!trigger.urls.some((url) => matches_current_url(url))) {
			return;
		}
	}

	if (trigger.exclude_urls) {
		if (!Array.isArray(trigger.exclude_urls)) {
			throw new MasterworksTelemetryError("Invalid trigger.exclude_urls", { trigger: trigger }).reportError();
		}

		if (!trigger.exclude_urls.every((url) => typeof url === "string")) {
			throw new MasterworksTelemetryError("Invalid trigger.exclude_urls", { trigger: trigger }).reportError();
		}

		if (trigger.exclude_urls.some((url) => matches_current_url(url))) {
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

function mw_trigger_detect_dataLayer_event_interval(event_name, callback) {
	setInterval(function () {
		for (let i = 0; i < dataLayer.length; i++) {
			if (dataLayer[i].masterworks_processed) {
				continue;
			}

			dataLayer[i].masterworks_processed = true;

			if (dataLayer[i].event === event_name) {
				callback();
			}
		}
	}, 250);
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
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.strings", {
			strings: strings,
		}).reportError();
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

function mw_trigger_element_trigger_event_v2(selector, trigger_event, callback) {
	document.addEventListener(trigger_event, function (event) {
		const targetElement = event.target.closest(selector);
		if (targetElement) {
			callback.call(targetElement, event);
		}
	});
}

function mw_trigger_pathname_exact_match(pathname, callback) {
	if (window.location.pathname === pathname) {
		callback();
	}
}

function mw_trigger_javascript_message_contains_text(text, callback) {
	window.addEventListener("message", function (event) {
		if (event.data.includes(text)) {
			callback();
		}
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
		if (typeof rudderanalytics !== "undefined" && typeof rudderanalytics.getAnonymousId !== "undefined") {
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
	const piwikCookieRegex = /_pk_id\.[a-z0-9]+(?:-[a-z0-9]+)+\.[a-z0-9]+=([^;]+);?/;
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
if (mw_telemetry_settings.ecommerce_configurations && mw_telemetry_settings.ecommerce_configurations.length > 0 && !mw_telemetry_settings.events_disabled) {
	mw_telemetry_settings.ecommerce_configurations.forEach((configuration) => {
		if (!Array.isArray(configuration.triggers)) {
			throw new MasterworksTelemetryError("Invalid ecommerce_configuration.triggers", {
				configuration: configuration,
			}).reportError();
		}

		configuration.triggers.forEach((trigger) => {
			const initializeInterval = setInterval(() => {
				if (typeof set_mw_trigger !== "undefined") {
					try {
						set_mw_trigger(trigger, () => {
							triggerMWEcommerceEvent(configuration);
						});
					} catch (error) {
						console.error(error);
					} finally {
						clearInterval(initializeInterval);
					}
				}
			}, 100);
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
			throw new MasterworksTelemetryError("Invalid ecommerce_data", {
				ecommerce_data: ecommerce_data,
			}).reportError();
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
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.platforms", { configuration: configuration }).reportError();
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
				case "twitter":
					triggerTwitterEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "vwo":
					triggerVwoEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "reddit":
					triggerRedditEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				case "optimonk":
					triggerOptimonkEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
					break;
				default:
					throw new MasterworksTelemetryError("Invalid ecommerce_configuration.platform: " + platform.name).reportError();
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
		throw new MasterworksTelemetryError("rudderanalytics is not defined", {
			ecommerce_data: ecommerce_data,
			event_type: event_type,
		}).reportError();
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
			throw new MasterworksTelemetryError("_ppas is undefined", {
				ecommerce_data: ecommerce_data,
				event_type: event_type,
				options: options,
			}).reportError();
		}

		ecommerce_data.items.forEach((item) => {
			_ppas.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
		});

		_ppas.push([event_type, ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
		return;
	}

	if (typeof _paq === "undefined") {
		throw new MasterworksTelemetryError("_paq is undefined", {
			ecommerce_data: ecommerce_data,
			event_type: event_type,
			options: options,
		}).reportError();
	}

	ecommerce_data.items.forEach((item) => {
		_paq.push(["addEcommerceItem", item.sku, item.name, item.category, item.price, item.quantity]);
	});

	_paq.push([event_type, ecommerce_data.transaction_id, ecommerce_data.total_transaction_amount]);
	return;
}

// ** Facebook ** //
function triggerFacebookEcommerceEvents(ecommerce_data, options = {}, event_type = "Purchase") {
	const interval = setInterval(() => {
		if (typeof fbq !== "undefined") {
			clearInterval(interval);

			if (!options.sustainer_only) {
				if (options.facebook_pixel_ids && options.facebook_pixel_ids.length > 0) {
					for (let i = 0; i < options.facebook_pixel_ids.length; i++) {
						fbq("trackSingle", options.facebook_pixel_ids[i].toString(), event_type, {
							value: ecommerce_data.total_transaction_amount,
							currency: "USD",
							content_ids: ecommerce_data.items.map((item) => item.sku),
							content_name: ecommerce_data.items.map((item) => item.name).join(","),
						});
					}
				} else {
					fbq("track", event_type, {
						value: ecommerce_data.total_transaction_amount,
						currency: "USD",
						content_ids: ecommerce_data.items.map((item) => item.sku),
						content_name: ecommerce_data.items.map((item) => item.name).join(","),
					});
				}
			}

			ecommerce_data.items.forEach((item) => {
				if (item.category === "sustainer") {
					fbq("trackCustom", "SustainerDonation", { value: item.price, currency: "USD", content_ids: item.sku, content_name: item.name });
				}
			});
		}
	}, 250);

	setTimeout(() => {
		if (typeof fbq === "undefined") {
			clearInterval(interval);
			throw new MasterworksTelemetryError("fbq is still undefined after 30 seconds", {
				ecommerce_data: ecommerce_data,
				event_type: event_type,
				options: options,
			}).reportError();
		}
	}, 30000);
}

// ** Adform ** //
function triggerAdformEcommerceEvent(ecommerce_data, options = {}, event_type = "Donation") {
    if (typeof mw_telemetry_settings.adform_pixel_id === "undefined") {
        throw new MasterworksTelemetryError("_adftrack is undefined", {
            ecommerce_data: ecommerce_data,
            event_type: event_type,
        }).reportError();
    }

    // Function to create and push tracking event
    const pushAdformTrackingEvent = (type) => {
        window._adftrack = Array.isArray(window._adftrack) ? window._adftrack : window._adftrack ? [window._adftrack] : [];
        window._adftrack.push({
            pm: mw_telemetry_settings.adform_pixel_id,
            divider: encodeURIComponent("|"),
            pagename: encodeURIComponent("MW-" + type),
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
    };

    // Push original event
    pushAdformTrackingEvent(event_type);

    // Check if any item has 'sustainer' category and push additional sustainer event
    const hasSustainer = ecommerce_data.items.some(item => 
        item.category && item.category.toLowerCase() === 'sustainer'
    );
    
    if (hasSustainer) {
        pushAdformTrackingEvent("Sustainer");
    }

    // Load tracking script
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
		throw new MasterworksTelemetryError("zemApi is undefined", {
			ecommerce_data: ecommerce_data,
			event_type: event_type,
		}).reportError();
	}
	zemApi("track", event_type, { value: ecommerce_data.total_transaction_amount, currency: "USD" });
}

// ** Google Ads ** //
function triggerGoogleAdsEcommerceEvent(ecommerce_data, options = {}, event_type = "conversion") {
	if (typeof gtag === "undefined") {
		throw new MasterworksTelemetryError("gtag is undefined", {
			ecommerce_data: ecommerce_data,
			event_type: event_type,
			options: options,
		}).reportError();
	}

	if (!options || !options.google_ads_send_to_ids || options.google_ads_send_to_ids.length < 1) {
		throw new MasterworksTelemetryError("Invalid options.google_ads_send_to_ids: " + options.google_ads_send_to_ids).reportError();
	}

	options.google_ads_send_to_ids.forEach((google_ads_send_to_id) => {
		if (options.use_google_ads_enhanced_user_data) {
			getGAEnhancedUserData().then((data) => {
				gtag("event", event_type, {
					send_to: google_ads_send_to_id,
					value: ecommerce_data.total_transaction_amount,
					currency: "USD",
					transaction_id: ecommerce_data.transaction_id,
					user_data: data,
				});
			});
			return;
		}

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
		throw new MasterworksTelemetryError("ttq is undefined", {
			ecommerce_data: ecommerce_data,
			event_type: event_type,
		}).reportError();
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
		throw new MasterworksTelemetryError("taboola_pixel_id is undefined", { ecommerce_data: ecommerce_data, event_type: event_type }).reportError();
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
		throw new MasterworksTelemetryError("mntn_pixel_id is undefined", { ecommerce_data: ecommerce_data, event_type: event_type }).reportError();
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
		throw new MasterworksTelemetryError("pintrk is undefined", { ecommerce_data: ecommerce_data, event_type: event_type }).reportError();
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
		throw new MasterworksTelemetryError("aap is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (typeof mw_telemetry_settings.illumin_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("illumin_pixel_id is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (!options.illumin_pg || typeof options.illumin_pg !== "number") {
		throw new MasterworksTelemetryError("Invalid options.illumin_pg", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
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
		throw new MasterworksTelemetryError("saq is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (!options.conversion_id || typeof options.conversion_id !== "string") {
		throw new MasterworksTelemetryError("Invalid options.conversion_id", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
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
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_advertiser_id is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (options.tradedesk_tracking_tag_ids === undefined || !Array.isArray(options.tradedesk_tracking_tag_ids) || options.tradedesk_tracking_tag_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.tradedesk_tracking_tag_ids", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	for (let i = 0; i < options.tradedesk_tracking_tag_ids.length; i++) {
		var img = document.createElement("img");
		img.setAttribute("height", "1");
		img.setAttribute("width", "1");
		img.setAttribute("style", "border-style:none;");
		img.setAttribute("style", "display:none;");
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
					img.setAttribute("style", "display:none;");
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
	if (typeof options.linkedin_conversion_id === "undefined") {
		throw new MasterworksTelemetryError("options.linkedin_conversion_id is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	const interval = setInterval(() => {
		if (typeof window.lintrk !== "undefined") {
			clearInterval(interval);
			window.lintrk("track", { conversion_id: options.linkedin_conversion_id });
		}
	}, 250);

	setTimeout(() => {
		if (typeof window.lintrk === "undefined") {
			clearInterval(interval);
			throw new MasterworksTelemetryError("window.lintrk is still undefined after 30 seconds", {
				ecommerce_data: ecommerce_data,
				event_type: event_type,
				options: options,
			}).reportError();
		}
	}, 30000);
}

// ** Twitter ** //
function triggerTwitterEcommerceEvent(ecommerce_data, options = {}, event_type = "purchase") {
	if (typeof twq === "undefined") {
		throw new MasterworksTelemetryError("twq is undefined", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (!options.twitter_event_ids || !Array.isArray(options.twitter_event_ids) || options.twitter_event_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.twitter_event_ids", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	const userData = rudderanalytics.getUserTraits();

	for (let i = 0; i < options.twitter_event_ids.length; i++) {
		twq("event", options.twitter_event_ids[i], {
			value: ecommerce_data.total_transaction_amount,
			currency: "USD",
			conversion_id: ecommerce_data.transaction_id,
			email_address: userData.email,
			phone_number: userData.phone,
		});
	}

	if (options.twitter_sustainer_event_ids && options.twitter_sustainer_event_ids.length > 0) {
		ecommerce_data.items.forEach((item) => {
			if (item.category === "sustainer") {
				for (let i = 0; i < options.twitter_sustainer_event_ids.length; i++) {
					twq("event", options.twitter_sustainer_event_ids[i], {
						value: item.price,
						currency: "USD",
						conversion_id: ecommerce_data.transaction_id + "-" + item.sku,
						email_address: userData.email,
						phone_number: userData.phone,
					});
				}
			}
		});
	}
}

// ** Vwo ** //
function triggerVwoEcommerceEvent(ecommerce_data, options = {}, event_type = "purchase") {
	window.VWO = window.VWO || [];
	VWO.event =
		VWO.event ||
		function () {
			VWO.push(["event"].concat([].slice.call(arguments)));
		};

	VWO.event(event_type, {
		revenue: ecommerce_data.total_transaction_amount,
		checkout: true,
	});
}

// ** Reddit ** //
function triggerRedditEcommerceEvent(ecommerce_data, options = {}, event_type = "Purchase") {
	if (typeof rdt === "undefined") {
		throw new MasterworksTelemetryError("rdt is undefined").reportError();
	}

	rdt("track", event_type, {
		itemCount: ecommerce_data.items.length,
		value: ecommerce_data.total_transaction_amount,
		currency: "USD",
		conversionId: ecommerce_data.transaction_id,
	});
}

// ** Optimonk ** //
function triggerOptimonkEcommerceEvent(ecommerce_data, options = {}, event_type = "Donation") {
	if (typeof omEvents === "undefined") {
		return;
	}

	omEvents.push([event_type]);
}

/* ------------------------ Transaction Cookie Functions ----------------------- */

function generateTransactionCookieValue(ecommerce_data) {
	return ecommerce_data.items
		.map((item) => {
			return item.name + item.price + item.sku + item.category + item.quantity;
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
	var decodedCookie;
	try {
		decodedCookie = decodeURIComponent(document.cookie);
	} catch (e) {
		console.error("Error decoding URI component in cookies", e);
		return ""; // Return empty string if URI malformed
	}
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

if (mw_telemetry_settings.custom_event_configurations && mw_telemetry_settings.custom_event_configurations.length > 0 && !mw_telemetry_settings.events_disabled) {
	mw_telemetry_settings.custom_event_configurations.forEach((configuration) => {
		if (!configuration.event_name || typeof configuration.event_name !== "string") {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.event_name", { configuration: configuration }).reportError();
		}

		if (!configuration.triggers || !Array.isArray(configuration.triggers) || configuration.triggers.length === 0) {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers", { configuration: configuration }).reportError();
		}

		if (!configuration.platforms || !Array.isArray(configuration.platforms) || configuration.platforms.length === 0) {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms", { configuration: configuration }).reportError();
		}

		configuration.platforms.forEach((platform) => {
			if (!platform.name || typeof platform.name !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.name", { configuration: configuration, platform_with_error: platform }).reportError();
			}

			if (!platform.event_type || typeof platform.event_type !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.event_type", { configuration: configuration, platform_with_error: platform }).reportError();
			}

			if (platform.name === "illumin" && !platform.illumin_pg && typeof platform.illumin_pg !== number) {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.platforms.illumin_pg", { configuration: configuration, platform_with_error: platform }).reportError();
			}
		});

		configuration.triggers.forEach((trigger) => {
			const initializeInterval = setInterval(() => {
				if (typeof set_mw_trigger !== "undefined") {
					try {
						set_mw_trigger(trigger, () => {
							triggerMWCustomEvent(configuration);
						});
					} catch (error) {
						console.error(error);
					} finally {
						clearInterval(initializeInterval);
					}
				}
			}, 100);
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
			fireTwitterCustomEvent(platform.event_type, platform.options);
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
			throw new MasterworksTelemetryError("Invalid platform: " + platform.name).reportError().reportError();
	}
}

function fireRudderstackCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof rudderanalytics === "undefined") {
		throw new MasterworksTelemetryError("rudderanalytics is undefined").reportError();
	}

	metadata.event_name = event_name;
	rudderanalytics.track(event_type, metadata);
}

function firePiwikCustomEvent(event_type, event_name, options = {}) {
	if ((options && options.matomo_conflict) || mw_telemetry_settings.matomo_conflict) {
		if (typeof _ppas === "undefined") {
			throw new MasterworksTelemetryError("_ppas is undefined").reportError();
		}

		_ppas.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	} else {
		if (typeof _paq === "undefined") {
			throw new MasterworksTelemetryError("_paq is undefined", { event_type, event_name }).reportError();
		}

		_paq.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	}
}

function fireFacebookCustomEvent(event_type, event_name, options = {}, metadata = {}) {
	const interval = setInterval(() => {
		if (typeof fbq !== "undefined") {
			clearInterval(interval);

			if (options.facebook_track_custom) {
				fbq("trackCustom", event_type, { content_name: event_name, ...metadata });
			} else {
				fbq("track", event_type, { content_name: event_name, ...metadata });
			}
		}
	}, 250);

	setTimeout(() => {
		if (typeof fbq === "undefined") {
			clearInterval(interval);
			throw new MasterworksTelemetryError("fbq is still undefined after 30 seconds", {
				event_type: event_type,
				event_name: event_name,
				options: options,
				metadata: metadata,
			}).reportError();
		}
	}, 30000);
}

function fireAdformCustomEvent(event_type, event_name) {
	if (typeof mw_telemetry_settings.adform_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.adform_pixel_id is undefined").reportError();
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
		throw new MasterworksTelemetryError("zemApi is undefined").reportError();
	}

	// Track Event
	zemApi("track", event_type);
}

function fireTiktokCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof ttq === "undefined") {
		throw new MasterworksTelemetryError("ttq is undefined").reportError();
	}

	ttq.track(event_type, {
		content_name: event_name,
		...metadata,
	});
}

function fireIlluminCustomEvent(illumin_pg) {
	if (typeof aap === "undefined") {
		throw new MasterworksTelemetryError("aap is undefined").reportError();
	}

	if (typeof illumin_pg === "undefined") {
		throw new MasterworksTelemetryError("illumin_pg is undefined").reportError();
	}

	if (typeof mw_telemetry_settings.illumin_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.illumin_pixel_id is undefined").reportError();
	}

	aap({
		pixelKey: mw_telemetry_settings.illumin_pixel_id,
		pg: illumin_pg,
	});
}

function fireGoogleAdsCustomEvent(event_type, event_name, options = {}) {
	const interval = setInterval(() => {
		if (typeof gtag !== "undefined") {
			clearInterval(interval);

			if (!options.google_ads_send_to_ids || !Array.isArray(options.google_ads_send_to_ids) || options.google_ads_send_to_ids.length === 0) {
				throw new MasterworksTelemetryError("Invalid options.google_ads_send_to_ids: " + options.google_ads_send_to_ids).reportError();
			}

			for (let i = 0; i < options.google_ads_send_to_ids.length; i++) {
				if (options.use_google_ads_enhanced_user_data) {
					getGAEnhancedUserData().then((data) => {
						gtag("event", event_type, {
							send_to: options.google_ads_send_to_ids[i],
							user_data: data,
						});
					});
					continue;
				} else {
					gtag("event", event_type, {
						send_to: options.google_ads_send_to_ids[i],
					});
				}
			}
		}
	}, 250);

	setTimeout(() => {
		if (typeof gtag === "undefined") {
			clearInterval(interval);
			throw new MasterworksTelemetryError("gtag is still undefined after 30 seconds", {
				event_type: event_type,
				event_name: event_name,
				options: options,
			}).reportError();
		}
	}, 30000);
}

function fireTaboolaCustomEvent(event_type, event_name) {
	if (typeof _tfa === "undefined") {
		throw new MasterworksTelemetryError("_tfa is undefined").reportError();
	}

	if (typeof mw_telemetry_settings.taboola_pixel_id === "undefined") {
		throw new MasterworksTelemetryError("mw_telemetry_settings.taboola_pixel_id is undefined").reportError();
	}

	_tfa.push({ notify: "event", name: event_type, id: mw_telemetry_settings.taboola_pixel_id });
}

function fireTwitterCustomEvent(event_type, options = {}) {
	if (typeof twq === "undefined") {
		throw new MasterworksTelemetryError("twq is undefined").reportError();
	}

	if (!options.twitter_event_ids || !Array.isArray(options.twitter_event_ids) || options.twitter_event_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.twitter_event_ids: " + options.twitter_event_ids).reportError();
	}

	const userData = rudderanalytics.getUserTraits();

	for (let i = 0; i < options.twitter_event_ids.length; i++) {
		twq("event", options.twitter_event_ids[i], {
			email_address: userData.email,
			phone_number: userData.phone,
		});
	}
}

function fireRedditCustomEvent(event_type) {
	if (typeof rdt === "undefined") {
		throw new MasterworksTelemetryError("rdt is undefined").reportError();
	}

	rdt("track", event_type);
}

function fireTradedeskCustomEvent(event_type, event_name, options = {}) {
	if (mw_telemetry_settings.tradedesk_advertiser_id === undefined) {
		throw new MasterworksTelemetryError("mw_telemetry_settings.tradedesk_advertiser_id is undefined").reportError();
	}

	if (options.tradedesk_tracking_tag_ids === undefined || !Array.isArray(options.tradedesk_tracking_tag_ids) || options.tradedesk_tracking_tag_ids.length === 0) {
		throw new MasterworksTelemetryError("Invalid options.tradedesk_tracking_tag_ids: " + options.tradedesk_tracking_tag_ids).reportError();
	}

	for (let i = 0; i < options.tradedesk_tracking_tag_ids.length; i++) {
		var img = document.createElement("img");
		img.setAttribute("height", "1");
		img.setAttribute("width", "1");
		img.setAttribute("style", "border-style:none;");
		img.setAttribute("style", "display:none;");
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
		throw new MasterworksTelemetryError("pintrk is undefined").reportError();
	}

	pintrk("track", event_type);
}

function fireLinkedInCustomEvent(options = {}) {
	if (typeof window.lintrk === "undefined") {
		throw new MasterworksTelemetryError("window.lintrk is undefined").reportError();
	}

	if (typeof options.linkedin_conversion_id === "undefined") {
		throw new MasterworksTelemetryError("options.linkedin_conversion_id is undefined").reportError();
	}

	const interval = setInterval(() => {
		if (typeof window.lintrk !== "undefined") {
			clearInterval(interval);
			window.lintrk("track", { conversion_id: options.linkedin_conversion_id });
		}
	}, 250);

	setTimeout(() => {
		if (typeof window.lintrk === "undefined") {
			clearInterval(interval);
			throw new MasterworksTelemetryError("window.lintrk is still undefined after 30 seconds", {
				options: options,
			}).reportError();
		}
	}, 30000);
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
			}).reportError();
		}

		if (configuration.timeout && typeof configuration.timeout !== "number") {
			throw new MasterworksTelemetryError("IdentificationConfiguration initialized with invalid timeout", {
				configuration: configuration,
			}).reportError();
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
						this.fireIdentificationEvent(fieldValue, "email");
						return;
					}
				}

				if (this.configuration.email_selectors && this.configuration.email_selectors.length > 0) {
					for (let i = 0; i < this.configuration.email_selectors.length; i++) {
						if (!event.target.matches(this.configuration.email_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;
						this.fireIdentificationEvent(fieldValue, "email");
						return;
					}
				}

				if (this.configuration.phone_selectors && this.configuration.phone_selectors.length > 0) {
					for (let i = 0; i < this.configuration.phone_selectors.length; i++) {
						if (!event.target.matches(this.configuration.phone_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;

						// Clean up phone number to only include numeric characters
						fieldValue = fieldValue.replace(/[^0-9]/g, "");

						this.fireIdentificationEvent(fieldValue, "phone");
						return;
					}
				}

				if (this.configuration.city_selectors && this.configuration.city_selectors.length > 0) {
					for (let i = 0; i < this.configuration.city_selectors.length; i++) {
						if (!event.target.matches(this.configuration.city_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;

						// Clean up city name to only include alphanumeric characters and spaces
						fieldValue = fieldValue.replace(/[^a-zA-Z0-9\s]/g, "");

						// To lower case
						fieldValue = fieldValue.toLowerCase();

						this.fireIdentificationEvent(fieldValue, "city");
						return;
					}
				}

				if (this.configuration.state_selectors && this.configuration.state_selectors.length > 0) {
					for (let i = 0; i < this.configuration.state_selectors.length; i++) {
						if (!event.target.matches(this.configuration.state_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;

						// Clean up state to only include alphanumeric characters and spaces
						fieldValue = fieldValue.replace(/[^a-zA-Z0-9\s]/g, "");

						// To lower case
						fieldValue = fieldValue.toLowerCase();

						this.fireIdentificationEvent(fieldValue, "state");
						return;
					}
				}

				if (this.configuration.zip_selectors && this.configuration.zip_selectors.length > 0) {
					for (let i = 0; i < this.configuration.zip_selectors.length; i++) {
						if (!event.target.matches(this.configuration.zip_selectors[i])) {
							continue; // Ignore if not matching selector
						}

						let fieldValue = event.target.value;

						// clean up zip code to only include digits and dashes
						fieldValue = fieldValue.replace(/[^0-9\-]/g, "");

						this.fireIdentificationEvent(fieldValue, "zip");
						return;
					}
				}
			},
			true
		);

		if (this.configuration.custom_configurations && this.configuration.custom_configurations.length > 0) {
			this.configuration.custom_configurations.forEach((custom_configuration) => {
				if (!custom_configuration.configuration_name || typeof custom_configuration.configuration_name !== "string") {
					throw new MasterworksTelemetryError("Invalid identification_configuration.custom_configuration.configuration_name: " + custom_configuration.configuration_name).reportError();
				}

				if (!Array.isArray(custom_configuration.triggers) || custom_configuration.triggers.length < 1) {
					throw new MasterworksTelemetryError("Invalid identification_configuration.custom_configuration.triggers: " + custom_configuration.triggers).reportError();
				}

				custom_configuration.triggers.forEach((trigger) => {
					const initializeInterval = setInterval(() => {
						if (typeof set_mw_trigger !== "undefined") {
							try {
								set_mw_trigger(trigger, () => {
									this.fireCustomIdentificationEvent(custom_configuration);
								});
							} catch (error) {
								console.error(error);
							} finally {
								clearInterval(initializeInterval);
							}
						}
					}, 100);
				});
			});
		}
	}

	fireIdentificationEvent(fieldValue, fieldType = "email") {
		/* ------------------------------- Rudderstack ------------------------------ */

		if (!fieldValue) {
			return;
		}

		fieldValue = fieldValue.replace(/[^a-zA-Z0-9@.\-_]/g, "");

		const currentTraits = rudderanalytics.getUserTraits() || {};
		let userID = rudderanalytics.getUserId();

		if (fieldType === "email") {
			currentTraits.email = fieldValue;
			userID = fieldValue;

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

		if (!userID) {
			userID = "";
		}

		if (fieldType === "zip" || fieldType === "city" || fieldType === "state") {
			if (!currentTraits.address) {
				currentTraits.address = {};
			}

			if (fieldType === "zip") {
				currentTraits.address.postalCode = fieldValue;
			} else {
				currentTraits.address[fieldType] = fieldValue;
			}
		} else {
			currentTraits[fieldType] = fieldValue;
		}

		rudderanalytics.identify(userID, currentTraits);
	}

	fireCustomIdentificationEvent(configuration) {
		try {
			const traits = rudderanalytics.getUserTraits() || {};
			const identifyData = getMWIdentificationData(configuration.configuration_name);
			if (identifyData) {
				let email = "";
				for (const key in identifyData) {
					if (key === "email") {
						email = identifyData[key];
						traits.email = email;

						if (mw_telemetry_settings.matomo_conflict) {
							if (typeof _ppas != "undefined") {
								_ppas.push(["trackEvent", "mw", "mw : emcap", "mw : emcap : " + email, 0, { dimension4: email }]);
							}
						} else {
							if (typeof _paq != "undefined") {
								_paq.push(["trackEvent", "mw", "mw : emcap", "mw : emcap : " + email, 0, { dimension4: email }]);
							}
						}
					} else {
						traits[key] = identifyData[key];
					}
				}

				rudderanalytics.identify(email, traits);
			}
		} catch (error) {
			console.error(error);
		}
	}

	matchesExclusionUrls() {
		if (!this.configuration.exclude_urls || this.configuration.exclude_urls.length < 1) {
			return false;
		}

		for (let i = 0; i < this.configuration.exclude_urls.length; i++) {
			if (window.location.href.includes(this.configuration.exclude_urls[i])) {
				return true;
			}
		}

		return false;
	}
}

if (mw_telemetry_settings.identification_configuration) {
	const indentificationConfiguration = new IdentificationConfiguration(mw_telemetry_settings.identification_configuration);

	if (!indentificationConfiguration.matchesExclusionUrls()) {
		if (indentificationConfiguration.configuration.timeout) {
			setTimeout(indentificationConfiguration.setIdentificationEvents(), indentificationConfiguration.configuration.timeout);
		} else {
			indentificationConfiguration.setIdentificationEvents();
		}
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
			}).reportError();
		}

		if (!configuration.url_parameter || typeof configuration.url_parameter !== "string") {
			throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid or missing url_parameter", {
				configuration: configuration,
			}).reportError();
		}

		if (configuration.urls && (!Array.isArray(configuration.urls) || configuration.urls.length < 1)) {
			throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid urls", {
				configuration: configuration,
			}).reportError();
		}

		if (configuration.urls) {
			for (let i = 0; i < configuration.urls.length; i++) {
				if (typeof configuration.urls[i] !== "string") {
					throw new MasterworksTelemetryError("ProductSearchConfiguration initialized with invalid urls", {
						configuration: configuration,
					}).reportError();
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

/* --------------------------- GA Helper Function --------------------------- */
async function getGAEnhancedUserData() {
	const maxWaitTime = 10000; // Maximum wait time in milliseconds (10 seconds)
	const intervalTime = 500; // Polling interval in milliseconds (0.5 seconds)

	const waitForTraits = () => {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();

			const interval = setInterval(() => {
				const currentTraits = rudderanalytics.getUserTraits();
				if (currentTraits) {
					clearInterval(interval);
					resolve(currentTraits);
				} else if (Date.now() - startTime >= maxWaitTime) {
					clearInterval(interval);
					reject(new Error("Timeout waiting for user traits."));
				}
			}, intervalTime);
		});
	};

	try {
		const currentTraits = await waitForTraits();
		const use_google_ads_enhanced_user_data = {};

		if (currentTraits.email) {
			use_google_ads_enhanced_user_data.email = currentTraits.email.trim();
		}

		if (currentTraits.phone) {
			let e164PhoneNumber = "+1" + currentTraits.phone;
			use_google_ads_enhanced_user_data.phone_number = e164PhoneNumber;
		}

		if (currentTraits.zip) {
			use_google_ads_enhanced_user_data.zip = currentTraits.zip;
		}

		if (currentTraits.address && currentTraits.address.city) {
			if (!use_google_ads_enhanced_user_data.address) {
				use_google_ads_enhanced_user_data.address = {};
			}
			use_google_ads_enhanced_user_data.address.city = currentTraits.address.city;
		}

		if (currentTraits.address && currentTraits.address.state) {
			if (!use_google_ads_enhanced_user_data.address) {
				use_google_ads_enhanced_user_data.address = {};
			}
			use_google_ads_enhanced_user_data.address.region = currentTraits.address.state;
		}

		if (currentTraits.address && currentTraits.address.postalCode) {
			if (!use_google_ads_enhanced_user_data.address) {
				use_google_ads_enhanced_user_data.address = {};
			}
			use_google_ads_enhanced_user_data.address.postal_code = currentTraits.address.postalCode;
		}

		return use_google_ads_enhanced_user_data;
	} catch (error) {
		console.error(error.message);
		return null; // Return null or handle error as needed
	}
}
