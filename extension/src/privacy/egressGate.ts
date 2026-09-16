/**
 * Nazar Egress Gate
 * 
 * CRITICAL SECURITY BOUNDARY:
 * There must be exactly one egress gate. No feature may directly call fetch() or XMLHttpRequest.
 * The only permitted network path is through this module, and it accepts only a validated sanitized payload.
 */

/**
 * Validates that the payload contains only sanitized context.
 * 
 * @param {Object} payload The data intended for the server.
 * @throws {Error} If the payload fails the sanitization check.
 */
function validateSanitizedPayload(payload) {
  // TODO: Implement strict validation schema (e.g., ensuring no raw images, PII strings, etc.)
  // For now, we enforce a basic structural check.
  if (!payload || !payload.sanitized) {
    throw new Error("SECURITY VIOLATION: Attempted to egress unsanitized payload.");
  }
}

/**
 * The single permitted network path for the extension.
 * 
 * @param {string} endpoint The destination URL.
 * @param {Object} payload The sanitized data payload.
 * @returns {Promise<Response>} The network response.
 */
export async function secureEgressFetch(endpoint, payload) {
  // 1. Enforce validation
  validateSanitizedPayload(payload);
  
  // 2. Execute network request
  console.log(`[Egress Gate] Sending validated payload to ${endpoint}`);
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}
