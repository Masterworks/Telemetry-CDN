if (mw_telemetry_settings.custom_event_configurations && mw_telemetry_settings.custom_event_configurations.length > 0) {
	mw_telemetry_settings.custom_event_configurations.forEach((configuration) => {
		if (!configuration.event_name || typeof configuration.event_name !== "string") {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.event_name: " + configuration.event_name);
		}

		if (!configuration.triggers || !Array.isArray(configuration.triggers) || configuration.triggers.length === 0) {
			throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers: " + configuration.triggers);
		}

		configuration.triggers.forEach((trigger) => {
			if (!trigger.selector || typeof trigger.selector !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers.selector: " + trigger.selector);
			}

			if (!trigger.trigger_event || typeof trigger.trigger_event !== "string") {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers.trigger_event: " + trigger.trigger_event);
			}

			if (trigger.urls && (!Array.isArray(trigger.urls) || trigger.urls.length === 0)) {
				throw new MasterworksTelemetryError("Invalid custom_event_configurations.triggers.urls: " + trigger.urls);
			}
		});

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
		});

		configuration.triggers.forEach((trigger) => {
			let matchesCurrentURL = false;
			if (trigger.urls) {
				trigger.urls.forEach((url) => {
					if (window.location.href.includes(url)) {
						matchesCurrentURL = true;
					}
				});
			} else {
				matchesCurrentURL = true;
			}

			if (matchesCurrentURL) {
				document.querySelectorAll(trigger.selector).forEach((element) => {
					element.addEventListener(trigger.trigger_event, () => {
						configuration.platforms.forEach(
							handleErrors((platform) => {
								switch (platform.name) {
									case "rudderstack":
										fireRudderstackCustomEvent(platform.event_type, configuration.event_name, configuration.metadata);
										break;
									case "piwik":
										firePiwikCustomEvent(platform.event_type, configuration.event_name, configuration.options);
										break;
									case "facebook":
										fireFacebookCustomEvent(platform.event_type, configuration.event_name, configuration.metadata);
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
									default:
										throw new MasterworksTelemetryError("Invalid platform: " + platform.name);
								}
							})
						);
					});
				});
			}
		});
	});
}

function fireRudderstackCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof rudderanalytics === "undefined") {
		throw new MasterworksTelemetryError("rudderanalytics is undefined");
	}

	metadata.event_name = event_name;
	rudderanalytics.track(event_type, metadata);
}

function firePiwikCustomEvent(event_type, event_name, options = {}) {
	if (options && options.matomo_conflict) {
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

function fireFacebookCustomEvent(event_type, event_name, metadata = {}) {
	if (typeof fbq === "undefined") {
		throw new MasterworksTelemetryError("fbq is undefined");
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

fireZemantaCustomEvent = (event_type) => {
	if (typeof zemApi === "undefined") {
		throw new MasterworksTelemetryError("zemApi is undefined");
	}

	// Track Event
	zemApi("track", event_type);
};

fireTiktokCustomEvent = (event_type, event_name, metadata = {}) => {
	if (typeof ttq === "undefined") {
		throw new MasterworksTelemetryError("ttq is undefined");
	}

	ttq.track(event_type, {
		content_name: event_name,
		...metadata,
	});
};
