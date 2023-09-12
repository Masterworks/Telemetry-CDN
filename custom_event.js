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
				document.querySelector(trigger.selector).addEventListener(trigger.trigger_event, () => {
					configuration.platforms.forEach((platform) => {
						switch (platform.name) {
							case "rudderstack":
								fireRudderstackCustomEvent(platform.event_type, configuration.event_name, configuration.metadata, configuration.options);
								break;
							case "piwik":
								firePiwikCustomEvent(platform.event_type, configuration.event_name, configuration.metadata, configuration.options);
								break;
							default:
								throw new MasterworksTelemetryError("Invalid platform: " + platform.name);
						}
					});
				});
			}
		});
	});
}

function fireRudderstackCustomEvent(event_type, event_name, metadata = {}, options = {}) {
	metadata.event_name = event_name;
	rudderanalytics.track(event_type, metadata);
}

function firePiwikCustomEvent(event_type, event_name, metadata = {}, options = {}) {
	if (options && options.matomo_conflict) {
		_ppas.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	} else {
		_paq.push(["trackEvent", "mw_cv", `mw_cv : ${event_type}`, `mw_cv : ${event_type} : ${event_name}`, 0]);
	}
}
