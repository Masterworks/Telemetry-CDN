/* ----------------------- Trigger Condition Functions ---------------------- */

/* -------------------- Set Triggers for Ecommerce Events ------------------- */
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
				case "vwo":
					triggerVwoEcommerceEvent(ecommerce_data, platform.options, platform.event_type);
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
	if (options.matomo_conflict) {
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
