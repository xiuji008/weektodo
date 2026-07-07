/**
 * Lightweight S3-compatible storage client using AWS Signature V4.
 * Uses native fetch + Web Crypto API with pure-JS fallback for non-secure contexts.
 * Compatible with AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, etc.
 */

const encoder = new TextEncoder();

// ─── Pure-JS SHA-256 fallback (RFC 6234) for non-secure HTTP contexts ─
// (crypto.subtle is only available under HTTPS/localhost)

const K256 = [
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
];

function sha256(message) {
  // Convert string to UTF-8 bytes
  const bytes = [];
  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
    else { bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f)); }
  }
  const ml = bytes.length * 8;

  // Pad: append 0x80, then 0x00 until length ≡ 56 (mod 64), then 64-bit length
  bytes.push(0x80);
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((ml >>> (i * 8)) & 0xff);

  // Initialize hash values
  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const W = new Uint32Array(64);

  // Process 64-byte blocks
  for (let offset = 0; offset < bytes.length; offset += 64) {
    // Prepare message schedule
    for (let t = 0; t < 16; t++) {
      W[t] = (bytes[offset + t * 4] << 24) | (bytes[offset + t * 4 + 1] << 16) |
             (bytes[offset + t * 4 + 2] << 8) | bytes[offset + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (W[t - 15] >>> 7 | W[t - 15] << 25) ^ (W[t - 15] >>> 18 | W[t - 15] << 14) ^ (W[t - 15] >>> 3);
      const s1 = (W[t - 2] >>> 17 | W[t - 2] << 15) ^ (W[t - 2] >>> 19 | W[t - 2] << 13) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    // Initialize working variables
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    // Compression
    for (let t = 0; t < 64; t++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K256[t] + W[t]) >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    // Compute intermediate hash values
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  // Produce final hash hex string
  return H.map(v => ('00000000' + v.toString(16)).slice(-8)).join('');
}

function hmacSha256Js(key, message) {
  const enc = new TextEncoder();
  let k = typeof key === 'string' ? new Uint8Array(enc.encode(key)) : new Uint8Array(key);
  // Hash key if longer than block size
  if (k.length > 64) {
    const hashHex = sha256(String.fromCharCode(...k));
    k = new Uint8Array(hashHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  }
  // Pad key to block size
  const padded = new Uint8Array(64);
  padded.set(k);
  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = padded[i] ^ 0x5c;
    iKeyPad[i] = padded[i] ^ 0x36;
  }
  const inner = String.fromCharCode(...iKeyPad) + message;
  const innerHash = sha256(inner);
  const outer = String.fromCharCode(...oKeyPad) + innerHash;
  return sha256(outer);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Web Crypto API with pure-JS fallback ─────────────────────────

let shaFallbackVerified = false;

const cryptoSubtle = typeof crypto !== "undefined" && crypto.subtle;

function verifySha256Fallback() {
  const emptyHash = sha256("");
  const testHash = sha256("test");
  const keyBytes = encoder.encode("key");
  const hmacTest = hmacSha256Js(keyBytes, "The quick brown fox jumps over the lazy dog");
  if (emptyHash !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") return false;
  if (testHash !== "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08") return false;
  if (hmacTest !== "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8") return false;
  return true;
}

async function sha256Hex(message) {
  const data = typeof message === "string" ? encoder.encode(message) : message;
  if (cryptoSubtle) {
    const hash = await cryptoSubtle.digest("SHA-256", data);
    return bufferToHex(hash);
  }
  // One-time verification of the pure-JS implementation
  if (!shaFallbackVerified) {
    shaFallbackVerified = verifySha256Fallback();
    if (!shaFallbackVerified) {
      throw new Error("SHA-256 JS fallback self-test failed!");
    }
    console.log("[s3Client] SHA-256/HMAC fallback self-test PASSED");
  }
  const str = typeof message === "string" ? message : String.fromCharCode(...new Uint8Array(data));
  return sha256(str);
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
  return hmacSha256Js(key, message);
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
    // Strategy: try HEAD on object, fallback to HEAD on bucket root
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
      // First try HEAD on the configured object key
      let response = await tryHead(config.objectKey || "weektodo-test");

      // 200/204 = object exists, 404 = bucket accessible, 403 = credentials valid but no list/read permission
      if (response.ok || response.status === 404 || response.status === 403) {
        return { ok: true, status: response.status };
      }

      // Fallback: try HEAD on the bucket root (MinIO often allows this)
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
