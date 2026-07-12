export function createHeadlessHttpHandler(api, { maxBodyBytes = 1_048_576 } = {}) {
  if (!api || typeof api.handle !== "function") throw new TypeError("api.handle must be implemented.");
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1_024 || maxBodyBytes > 10_485_760) {
    throw new TypeError("maxBodyBytes must be between 1024 and 10485760.");
  }
  return async function headlessHttpHandler(request, response) {
    try {
      const body = await readBody(request, maxBodyBytes);
      const result = await api.handle({
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: request.headers,
        body,
      });
      response.writeHead(result.status, result.headers);
      response.end(`${JSON.stringify(result.body)}\n`);
    } catch (error) {
      const status = error instanceof HttpInputError ? error.status : 500;
      const code = error instanceof HttpInputError ? error.code : "internal_error";
      const message = error instanceof HttpInputError ? error.message : "Request failed.";
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(`${JSON.stringify({ error: { code, message } })}\n`);
    }
  };
}

async function readBody(request, maxBodyBytes) {
  if (["GET", "HEAD"].includes(request.method ?? "GET")) return null;
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpInputError(415, "unsupported_media_type", "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new HttpInputError(413, "body_too_large", "Request body exceeds configured limit.");
    chunks.push(chunk);
  }
  if (bytes === 0) throw new HttpInputError(400, "missing_body", "JSON request body is required.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpInputError(400, "invalid_json", "Request body must contain valid JSON.");
  }
}

class HttpInputError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
