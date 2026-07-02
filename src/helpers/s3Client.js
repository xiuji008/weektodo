/**
 * Lightweight S3-compatible storage client using AWS Signature V4.
 * Uses only native fetch + Web Crypto API — no external dependencies.
 * Compatible with AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, etc.
 */

const encoder = new TextEncoder();

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message) {
  const data = typeof message === "string" ? encoder.encode(message) : message;
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hash);
}

async function hmacSha256(key, message) {
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, messageData);
}

async function hmacSha256Hex(key, message) {
  const sig = await hmacSha256(key, message);
  return bufferToHex(sig);
}

async function deriveSigningKey(secretKey, dateStamp, region, service) {
  const kDate = await hmacSha256("AWS4" + secretKey, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

function uriEncodePath(str) {
  return str
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(/%2F/g, "/")
    )
    .join("");
}

function trimEndpoint(endpoint) {
  return endpoint.replace(/\/+$/, "");
}

/**
 * Build AWS SigV4 Authorization header and signed request.
 */
async function signRequest({
  method,
  endpoint,
  bucket,
  key,
  region,
  accessKeyId,
  secretAccessKey,
  body,
  contentType,
}) {
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const host = trimEndpoint(endpoint).replace(/^https?:\/\//, "");
  const objectPath = `/${bucket}/${uriEncodePath(key)}`;
  const url = `${trimEndpoint(endpoint)}${objectPath}`;

  const payloadHash = await sha256Hex(body || "");

  const headers = {
    host: host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (contentType) {
    headers["content-type"] = contentType;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");

  const canonicalRequest = [
    method,
    objectPath,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    service
  );
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders = { ...headers, Authorization: authorization };
  delete fetchHeaders.host;

  return { url, fetchHeaders };
}

export default {
  /**
   * Upload (PUT) an object to S3-compatible storage.
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async putObject(config, data) {
    return this.putObjectWithKey(config, data, config.objectKey);
  },

  /**
   * Upload (PUT) an object with a custom key.
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async putObjectWithKey(config, data, key) {
    const body = typeof data === "string" ? data : JSON.stringify(data);
    const { url, fetchHeaders } = await signRequest({
      method: "PUT",
      endpoint: config.endpoint,
      bucket: config.bucket,
      key: key,
      region: config.region || "us-east-1",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      body,
      contentType: "application/json",
    });

    const response = await fetch(url, {
      method: "PUT",
      headers: fetchHeaders,
      body,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: errText };
    }
    return { ok: true, status: response.status };
  },

  /**
   * Download (GET) an object from S3-compatible storage.
   * @returns {Promise<{ok: boolean, status: number, data?: any, error?: string}>}
   */
  async getObject(config) {
    return this.getObjectWithKey(config, config.objectKey);
  },

  /**
   * Download (GET) an object with a custom key.
   * @returns {Promise<{ok: boolean, status: number, data?: any, error?: string}>}
   */
  async getObjectWithKey(config, key) {
    const { url, fetchHeaders } = await signRequest({
      method: "GET",
      endpoint: config.endpoint,
      bucket: config.bucket,
      key: key,
      region: config.region || "us-east-1",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      body: "",
    });

    const response = await fetch(url, {
      method: "GET",
      headers: fetchHeaders,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: errText };
    }

    const text = await response.text();
    return { ok: true, status: response.status, data: text };
  },

  /**
   * Delete (DELETE) an object from S3-compatible storage.
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async deleteObject(config, key) {
    const { url, fetchHeaders } = await signRequest({
      method: "DELETE",
      endpoint: config.endpoint,
      bucket: config.bucket,
      key: key,
      region: config.region || "us-east-1",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      body: "",
    });

    const response = await fetch(url, {
      method: "DELETE",
      headers: fetchHeaders,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: errText };
    }
    return { ok: true, status: response.status };
  },

  /**
   * List objects (ListObjectsV2) under a prefix.
   * @returns {Promise<{ok: boolean, status: number, objects?: Array<{key: string, lastModified: string, size: number}>, error?: string}>}
   */
  async listObjects(config, prefix) {
    const query = `?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
    const objectPath = `/${config.bucket}/`;
    const url = `${trimEndpoint(config.endpoint)}${objectPath}${query}`;

    const service = "s3";
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = trimEndpoint(config.endpoint).replace(/^https?:\/\//, "");
    const payloadHash = await sha256Hex("");
    const region = config.region || "us-east-1";

    const headers = {
      host: host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[k]}\n`)
      .join("");

    const canonicalRequest = [
      "GET",
      `${objectPath}${query}`,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = await deriveSigningKey(
      config.secretAccessKey,
      dateStamp,
      region,
      "s3"
    );
    const signature = await hmacSha256Hex(signingKey, stringToSign);

    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const fetchHeaders = { ...headers, Authorization: authorization };
    delete fetchHeaders.host;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: fetchHeaders,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return { ok: false, status: response.status, error: errText };
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const contents = xmlDoc.getElementsByTagName("Contents");
      const objects = [];
      for (let i = 0; i < contents.length; i++) {
        const key = contents[i].getElementsByTagName("Key")[0]?.textContent || "";
        const lastModified = contents[i].getElementsByTagName("LastModified")[0]?.textContent || "";
        const size = parseInt(contents[i].getElementsByTagName("Size")[0]?.textContent || "0", 10);
        objects.push({ key, lastModified, size });
      }
      return { ok: true, status: response.status, objects };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  },

  /**
   * Test connectivity by attempting a HEAD request on the object.
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async testConnection(config) {
    const { url, fetchHeaders } = await signRequest({
      method: "HEAD",
      endpoint: config.endpoint,
      bucket: config.bucket,
      key: config.objectKey || "weektodo-test",
      region: config.region || "us-east-1",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      body: "",
    });

    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: fetchHeaders,
      });
      // 200 = object exists, 404 = bucket accessible but object not found
      // Both indicate the connection works
      if (response.ok || response.status === 404) {
        return { ok: true, status: response.status };
      }
      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: errText };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  },
};
