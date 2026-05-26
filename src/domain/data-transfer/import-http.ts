import { NextResponse } from "next/server";
import { MAX_ARCHIVE_BYTES } from "@/domain/data-transfer/limits";

export class ImportUserError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ImportUserError";
	}
}

function isUserFacingDataTransferError(message: string): boolean {
	return (
		message === "Invalid ZIP archive." ||
		message === "Missing skriuw-export.json manifest." ||
		message === "Malformed skriuw-export.json manifest." ||
		message === "Unsupported export manifest." ||
		message === "Unsupported archive format." ||
		message === "No Markdown notes found in archive." ||
		message === "Archive contains too many files." ||
		message === "Archive uncompressed size is too large." ||
		message.startsWith("Malformed v") ||
		message.startsWith("Malformed note version file:") ||
		message.startsWith("Malformed rich content sidecar:") ||
		message.startsWith("Folder cycle detected")
	);
}

export function rejectOversizedUpload(request: Request, file: File): NextResponse | null {
	const contentLength = request.headers.get("content-length");
	if (contentLength) {
		const size = Number(contentLength);
		if (Number.isFinite(size) && size > MAX_ARCHIVE_BYTES) {
			return NextResponse.json({ error: "Archive is too large." }, { status: 413 });
		}
	}

	if (file.size > MAX_ARCHIVE_BYTES) {
		return NextResponse.json({ error: "Archive is too large." }, { status: 413 });
	}

	return null;
}

export async function readArchiveFile(file: File): Promise<Uint8Array> {
	if (file.size === 0) {
		throw new ImportUserError("Archive file is empty.", 400);
	}

	const buffer = new Uint8Array(await file.arrayBuffer());
	if (buffer.byteLength === 0) {
		throw new ImportUserError("Archive file is empty.", 400);
	}
	if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
		throw new ImportUserError("Archive is too large.", 413);
	}

	return buffer;
}

export function mapImportRouteError(
	error: unknown,
	fallbackMessage: string,
): { message: string; status: number } {
	if (error instanceof ImportUserError) {
		return { message: error.message, status: error.status };
	}

	if (error instanceof Error && isUserFacingDataTransferError(error.message)) {
		return { message: error.message, status: 400 };
	}

	console.error(fallbackMessage, error);
	return { message: fallbackMessage, status: 500 };
}
