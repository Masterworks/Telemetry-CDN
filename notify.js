async function sendMWMessage(message, data = {}) {
	const baseUrl = "https://telmon.masterworks.digital"; // Base URL from the error reporting endpoint
	const endpoint = "/message";
	const url = `${baseUrl}${endpoint}`;

	const payload = {
		message,
		data,
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		return result;
	} catch (error) {
		console.error("Error sending message:", error);
		throw error;
	}
}
