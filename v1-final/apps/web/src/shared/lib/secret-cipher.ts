import crypto from "node:crypto";

/**
 * Generic AES-256-GCM string cipher, keyed off an arbitrary env var. Used to
 * encrypt user-supplied secrets (AI provider keys, storage credentials)
 * before they're persisted.
 */
export function encryptSecret(value: string, envVarName: string): string {
	const key = getEncryptionKey(envVarName);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(encrypted: string, envVarName: string): string {
	const [ivRaw, tagRaw, ciphertextRaw] = encrypted.split(".");
	if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Invalid encrypted secret payload");

	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		getEncryptionKey(envVarName),
		Buffer.from(ivRaw, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(ciphertextRaw, "base64url")),
		decipher.final(),
	]);
	return plaintext.toString("utf8");
}

function getEncryptionKey(envVarName: string): Buffer {
	const secret = process.env[envVarName];
	if (!secret) {
		throw new Error(`${envVarName} is required to store encrypted secrets`);
	}
	return crypto.createHash("sha256").update(secret).digest();
}
