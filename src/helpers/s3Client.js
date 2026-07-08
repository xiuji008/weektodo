/**
 * Lightweight S3-compatible storage client using AWS Signature V4.
 * Uses native fetch + Web Crypto API with js-sha256 fallback for non-secure contexts.
 * Compatible with AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, etc.
 */
import { sha256, hmac } from "js-sha256";

const encoder = new TextEncoder();

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Web Crypto API with js-sha256 fallback ─────────────────────

const cryptoSubtle = typeof crypto !== "undefined" && crypto.subtle;

async function sha256Hex(message) {
  const data = typeof message === "string" ? encoder.encode(message) : message;
  if (cryptoSubtle) {
    try {
      const hash = await cryptoSubtle.digest("SHA-256", data);
      return bufferToHex(hash);
    } catch {
      // Non-secure context (e.g. http://IP) — fall through to js-sha256
    }
  }
  return sha256(message);
}

async function hmacSha256(key, message) {
  if (cryptoSubtle) {
    try {
      const keyData = typeof key === "string" ? encoder.encode(key) : key;
      const messageData = encoder.encode(message);
      const cryptoKey = await cryptoSubtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      return await cryptoSubtle.sign("HMAC", cryptoKey, messageData);
    } catch {
      // Non-secure context — fall through to js-sha256
    }
  }
  // hmac supports Uint8Array for binary keys — avoid String.fromCharCode + UTF-8
  const keyBytes = typeof key === "string" ? key : new Uint8Array(key);
  return hmac(keyBytes, message);
}

async function hmacSha256Hex(key, message) {
  const sig = await hmacSha256(key, message);
  return typeof sig === "string" ? sig : bufferToHex(sig);
}

/** Convert a hex string to a Uint8Array of raw bytes. */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/** Ensure the key is in raw binary form (Uint8Array) regardless of
 *  whether it came from Web Crypto (ArrayBuffer) or js-sha256 (hex string). */
function keyToBytes(key) {
  if (typeof key === "string") {
    // js-sha256 fallback returns a hex string — decode to binary
    return hexToBytes(key);
  }
  // Web Crypto returns ArrayBuffer — wrap as Uint8Array
  return new Uint8Array(key);
}

async function deriveSigningKey(secretKey, dateStamp, region, service) {
  let kDate = await hmacSha256("AWS4" + secretKey, dateStamp);
  kDate = keyToBytes(kDate);
  let kRegion = await hmacSha256(kDate, region);
  kRegion = keyToBytes(kRegion);
  let kService = await hmacSha256(kRegion, service);
  kService = keyToBytes(kService);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return keyToBytes(kSigning);
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

// ─── MinIO/S3 error response parser ─────────────────────────────

function parseS3Error(xmlText) {
  if (!xmlText || !xmlText.includes("<Error>")) return xmlText;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const code = doc.getElementsByTagName("Code")[0]?.textContent || "";
    const msg = doc.getElementsByTagName("Message")[0]?.textContent || "";
    const resource = doc.getElementsByTagName("Resource")[0]?.textContent || "";
    return `[${code}] ${msg}${resource ? " (" + resource + ")" : ""}`;
  } catch {
    return xmlText.slice(0, 300);
  }
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
      return { ok: false, status: response.status, error: parseS3Error(errText) };
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
      return { ok: false, status: response.status, error: parseS3Error(errText) };
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
      return { ok: false, status: response.status, error: parseS3Error(errText) };
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
        return { ok: false, status: response.status, error: parseS3Error(errText) };
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
   * Test connectivity with a write+delete round-trip.
   *
   * A HEAD on a missing object returns 403 on MinIO (AccessDenied) but 404 on
   * AWS S3 — so a HEAD-based test is misleading and used to be reported as
   * "success" even when credentials were wrong. Instead we PUT a tiny marker
   * object and DELETE it again. A successful round-trip definitively proves the
   * endpoint, region, credentials and write permission are all correct.
   * Any non-2xx (incl. 403/401/404) is surfaced as a real failure with the
   * server's error code (e.g. SignatureDoesNotMatch, InvalidAccessKeyId,
   * AccessDenied, NoSuchBucket).
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async testConnection(config) {
    const testKey = "weektodo-connection-test.tmp";
    try {
      const put = await this.putObjectWithKey(
        config,
        '{"weektodo":"connection-test"}',
        testKey
      );
      if (put.ok) {
        // Clean up the marker; ignore cleanup failures (connection is proven).
        await this.deleteObject(config, testKey).catch(() => {});
        return { ok: true, status: put.status };
      }
      // Real failure — surface the server's actual error.
      return { ok: false, status: put.status, error: put.error };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  },
};
