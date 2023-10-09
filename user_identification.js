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

		if (!configuration.selectors || !Array.isArray(configuration.selectors) || configuration.selectors.length < 1) {
			throw new MasterworksTelemetryError("IdentificationConfiguration initialized with invalid or missing selectors", {
				configuration: configuration,
			});
		}

		configuration.selectors.forEach((selector) => {
			if (typeof selector !== "string") {
				throw new MasterworksTelemetryError("IdentificationConfiguration initialized with invalid selectors", {
					configuration: configuration,
				});
			}
		});

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
				for (let i = 0; i < this.configuration.selectors.length; i++) {
					if (!event.target.matches(this.configuration.selectors[i])) {
						continue; // Ignore if not matching selector
					}

					let fieldValue = event.target.value;
					this.fireIdentificationEvent(fieldValue, { email: fieldValue });
					return;
				}
			},
			true
		);
	}

	fireIdentificationEvent(fieldValue) {
		if (fieldValue) {
			fieldValue = fieldValue.replace(/[^a-zA-Z0-9@.\-_]/g, "");
			rudderanalytics.identify(fieldValue);
		}
	}
}

const indentificationConfiguration = new IdentificationConfiguration(mw_telemetry_settings.identification_configuration);
if (indentificationConfiguration.configuration.timeout) {
	setTimeout(indentificationConfiguration.setIdentificationEvents(), indentificationConfiguration.configuration.timeout);
} else {
	indentificationConfiguration.setIdentificationEvents();
}
