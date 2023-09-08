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
