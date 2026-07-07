/**
 * Lightweight S3-compatible storage client using AWS Signature V4.
 * Uses native fetch + Web Crypto API with pure-JS fallback for non-secure contexts.
 * Compatible with AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, etc.
 */

const encoder = new TextEncoder();

// ─── Pure-JS SHA-256 fallback for non-secure HTTP contexts ───────────
// (crypto.subtle is only available under HTTPS/localhost)

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

const sha256K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Pad(data) {
  const msgLen = data.length * 8;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  for (let i = 7; i >= 0; i--) data.push((msgLen >>> (i * 8)) & 0xff);
  return data;
}

function sha256Blocks(message) {
  const bytes = [];
  for (let i = 0; i < message.length; i++) {
    bytes.push(message.charCodeAt(i) & 0xff);
  }
  const data = sha256Pad(bytes);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = (data[offset + t * 4] << 24) | (data[offset + t * 4 + 1] << 16) |
             (data[offset + t * 4 + 2] << 8) | data[offset + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + sha256K[t] + w[t]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(32);
  const view = new DataView(result.buffer);
  view.setUint32(0, h0, false);
  view.setUint32(4, h1, false);
  view.setUint32(8, h2, false);
  view.setUint32(12, h3, false);
  view.setUint32(16, h4, false);
  view.setUint32(20, h5, false);
  view.setUint32(24, h6, false);
  view.setUint32(28, h7, false);
  return result;
}

function hmacSha256Js(keyBytes, message) {
  const blockSize = 64;
  if (keyBytes.length > blockSize) {
    keyBytes = sha256Blocks(String.fromCharCode(...keyBytes));
    keyBytes = new Uint8Array(keyBytes);
  }
  if (keyBytes.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(keyBytes);
    keyBytes = padded;
  }

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = keyBytes[i] ^ 0x5c;
    iKeyPad[i] = keyBytes[i] ^ 0x36;
  }

  const innerMsg = String.fromCharCode(...iKeyPad) + message;
  const innerHash = sha256Blocks(innerMsg);
  const outerMsg = String.fromCharCode(...oKeyPad) + String.fromCharCode(...innerHash);
  return sha256Blocks(outerMsg);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Web Crypto API with pure-JS fallback ─────────────────────────

const cryptoSubtle = typeof crypto !== "undefined" && crypto.subtle;

async function sha256Hex(message) {
  const data = typeof message === "string" ? encoder.encode(message) : message;
  if (cryptoSubtle) {
    const hash = await cryptoSubtle.digest("SHA-256", data);
    return bufferToHex(hash);
  }
  // Fallback: pure-JS SHA-256
  const str = typeof message === "string" ? message : String.fromCharCode(...new Uint8Array(data));
  return bufferToHex(sha256Blocks(str));
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
  const keyBytes = typeof key === "string" ? encoder.encode(key) : new Uint8Array(key);
  return hmacSha256Js(keyBytes, message);
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
