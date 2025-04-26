// webhook-receiver/src/index.js - Public-facing endpoint, forwards requests to target workers.

// Itty-router is not strictly needed anymore with this simple logic, but we can leave it for now.
import { Router } from "itty-router";
const _router = Router();

// Standard endpoint for target workers
const TARGET_ENDPOINT = "/process";

export default {
	async fetch(request, env) {
		return await handleRequest(request, env);
	},
};

// Define SecretBinding structure for clarity (not enforced in JS)
/**
 * @typedef {object} SecretBinding
 * @property {() => Promise<string | null>} get
 */

/**
 * @typedef {object} Env
 * @property {string} [TRADE_WORKER_URL]
 * @property {string} [TELEGRAM_WORKER_URL]
 * @property {string} [HA_WORKER_URL] // Added Home Assistant Worker URL
 * @property {SecretBinding} [WEBHOOK_API_KEY_BINDING] // For external validation
 * @property {SecretBinding} [INTERNAL_KEY_BINDING] // For internal inter-worker auth
 */

/**
 * Handles the incoming request, validates, determines target, and forwards.
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleRequest(request, env) {
	if (request.method !== "POST") {
		return new Response(
			JSON.stringify({
				success: false,
				worker: "webhook-receiver",
				error: "Method not allowed. Use POST.",
			}),
			{ status: 405, headers: { "Content-Type": "application/json" } }
		);
	}

	try {
		const data = await request.json();

		// --- External Authentication --- 
		const { apiKey, target, ...payload } = data; // Extract apiKey and target, rest is payload

		if (!apiKey) {
			return new Response(
				JSON.stringify({ success: false, worker: "webhook-receiver", error: "Missing apiKey" }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}
		const isValidApiKey = await validateApiKey(apiKey, env);
		if (!isValidApiKey) {
			return new Response(
				JSON.stringify({ success: false, worker: "webhook-receiver", error: "Authentication failed" }),
				{ status: 403, headers: { "Content-Type": "application/json" } }
			);
		}

		// --- Target Worker Identification --- 
		if (!target) {
			return new Response(
				JSON.stringify({ success: false, worker: "webhook-receiver", error: "Missing target worker specification" }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}

		const workerUrls = {
			trade: env.TRADE_WORKER_URL,
			telegram: env.TELEGRAM_WORKER_URL,
			"home-assistant": env.HA_WORKER_URL, // Use kebab-case for consistency or choose another convention
		};

		const targetUrl = workerUrls[target.toLowerCase()];

		if (!targetUrl) {
			return new Response(
				JSON.stringify({ success: false, worker: "webhook-receiver", error: `Invalid target worker specified: ${target}` }),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			);
		}

		// --- Internal Authentication & Payload Preparation ---
		const internalKey = await env.INTERNAL_KEY_BINDING?.get();
		if (!internalKey) {
			console.error("INTERNAL_KEY_BINDING not configured or accessible for forwarding.");
			return new Response(
				JSON.stringify({ success: false, worker: "webhook-receiver", error: "Internal configuration error" }),
				{ status: 500, headers: { "Content-Type": "application/json" } }
			);
		}

		const requestId = crypto.randomUUID();
		const standardizedPayload = {
			requestId: requestId,
			internalAuthKey: internalKey,
			payload: payload, // The rest of the original payload (excluding apiKey and target)
		};

		// --- Forward Request ---
		const workerResponse = await forwardToWorker(targetUrl, standardizedPayload);

		// --- Return Response --- 
		// Echo the response from the target worker, adding receiver context
		return new Response(
			JSON.stringify({
				gatewaySuccess: workerResponse.success, // Indicate if forwarding was successful
				requestId: requestId,
				worker: "webhook-receiver",
				targetWorker: target,
				targetResponse: workerResponse.data, // The actual data/result/error from the target
			}),
			{
				status: workerResponse.status, // Pass through the status from the target worker
				headers: { "Content-Type": "application/json" },
			}
		);

	} catch (error) {
		console.error("Error processing webhook:", error);
		let errorMessage = "Internal server error";
		let statusCode = 500;

		if (error instanceof SyntaxError) { // Handle JSON parsing errors
			errorMessage = "Invalid JSON payload";
			statusCode = 400;
		}

		return new Response(
			JSON.stringify({
				success: false,
				worker: "webhook-receiver",
				error: errorMessage,
			}),
			{
				status: statusCode,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}

/**
 * Validates the provided API key against the configured secret.
 * @param {string | undefined} apiKey The API key from the request payload.
 * @param {Env} env Environment object containing secrets.
 * @returns {Promise<boolean>}
 */
async function validateApiKey(apiKey, env) {
	if (!apiKey) {
		return false;
	}
	try {
		const storedKey = await env.WEBHOOK_API_KEY_BINDING?.get();
		if (!storedKey) {
			console.error("WEBHOOK_API_KEY_BINDING not configured or accessible.");
			return false; // Fail safely
		}
		// Simple string comparison - consider more secure methods (e.g., timing-safe compare) if needed
		return apiKey === storedKey;
	} catch (error) {
		console.error("Error validating API key:", error);
		return false;
	}
}

/**
 * Forwards the standardized payload to the target worker.
 * @param {string} targetUrl The base URL of the target worker.
 * @param {object} standardizedPayload The payload including internal auth and worker-specific data.
 * @returns {Promise<{success: boolean, status: number, data: any}>} The status and parsed JSON response from the target worker.
 */
async function forwardToWorker(targetUrl, standardizedPayload) {
	const fullUrl = `${targetUrl.replace(/\/$/, "")}${TARGET_ENDPOINT}`;
	try {
		console.log(`Forwarding request ID ${standardizedPayload.requestId} to: ${fullUrl}`);
		const response = await fetch(fullUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				// Consider adding a specific header for the internal key instead of putting it in the body
				// e.g., "X-Internal-Auth-Key": standardizedPayload.internalAuthKey
			},
			body: JSON.stringify(standardizedPayload),
		});

		const responseData = await response.json(); // Assume target always returns JSON
		console.log(`Response from ${fullUrl} (Status ${response.status}):`, responseData);

		return {
			success: response.ok, // Use HTTP status to indicate success of the call itself
			status: response.status,
			data: responseData, // Return the full parsed response from the target
		};

	} catch (error) {
		console.error(`Error forwarding request to ${fullUrl}:`, error);
		// Return a standardized error structure if the fetch itself fails
		return {
			success: false,
			status: 503, // Service Unavailable (or other appropriate error)
			data: {
				success: false, // Mirroring the expected target response structure
				error: `Failed to connect to target worker: ${error.message}`,
				result: null,
			},
		};
	}
}

// Removed processTrade function
// Removed processNotification function
// Removed createDefaultMessage function
