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
    const hash = await cryptoSubtle.digest("SHA-256", data);
    return bufferToHex(hash);
  }
  return sha256(message);
}

async function hmacSha256(key, message) {
  if (cryptoSubtle) {
    const keyData = typeof key === "string" ? encoder.encode(key) : key;
    const messageData = encoder.encode(message);
    const cryptoKey = await cryptoSubtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return cryptoSubtle.sign("HMAC", cryptoKey, messageData);
  }
  const keyStr =
    typeof key === "string" ? key : String.fromCharCode(...new Uint8Array(key));
  return hmac(keyStr, message);
}

async function hmacSha256Hex(key, message) {
  const sig = await hmacSha256(key, message);
  return typeof sig === "string" ? sig : bufferToHex(sig);
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
   * Test connectivity by attempting a HEAD request on the object.
   * MinIO returns 403 when the object/bucket doesn't exist (AccessDenied),
   * which still indicates the connection is valid.
   * @returns {Promise<{ok: boolean, status: number, error?: string}>}
   */
  async testConnection(config) {
    const tryHead = async (key) => {
      const { url, fetchHeaders } = await signRequest({
        method: "HEAD",
        endpoint: config.endpoint,
        bucket: config.bucket,
        key,
        region: config.region || "us-east-1",
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        body: "",
      });
      const response = await fetch(url, { method: "HEAD", headers: fetchHeaders });
      return response;
    };

    try {
      let response = await tryHead(config.objectKey || "weektodo-test");
      if (response.ok || response.status === 404 || response.status === 403) {
        return { ok: true, status: response.status };
      }

      response = await tryHead("");
      if (response.ok || response.status === 404 || response.status === 403) {
        return { ok: true, status: response.status };
      }

      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: parseS3Error(errText) };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  },
};
