/* --------------------------------- Errors --------------------------------- */

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
				throw new Error("Settings are undefined");
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

/* -------------------------------- Triggers -------------------------------- */

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
	urlsParams = new URLSearchParams(window.location.search);
	if (urlsParams.get(parameter_key) === parameter_value) {
		callback();
	}
}

function mw_trigger_url_contains_all(strings, callback) {
	if (!Array.isArray(strings)) {
		throw new MasterworksTelemetryError("Invalid ecommerce_configuration.trigger.strings: " + strings);
	}

	if (!strings.every((string) => matches_current_url(string))) {
		return;
	}

	callback();
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
