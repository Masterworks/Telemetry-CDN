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
