import "server-only";

import { StudentImportInputError } from "@/lib/student-import-operations";

export const STUDENT_IMPORT_MAX_MULTIPART_BYTES = 5 * 1024 * 1024;
export const STUDENT_IMPORT_MAX_MULTIPART_PARTS = 16;
export const STUDENT_IMPORT_MAX_MAPPING_PLAN_BYTES = 250 * 1024;
export const STUDENT_IMPORT_MAX_SETUP_BYTES = 100 * 1024;
export const STUDENT_IMPORT_MAX_EXCLUDED_ROWS_BYTES = 100 * 1024;

export async function readBoundedStudentImportFormData(request: Request) {
  const claimedLength = request.headers.get("content-length");
  if (claimedLength !== null) {
    const parsedLength = Number(claimedLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new StudentImportInputError("Student import request size is invalid.");
    }
    if (parsedLength > STUDENT_IMPORT_MAX_MULTIPART_BYTES) {
      throw new StudentImportInputError("Student import requests must be 5 MB or smaller.");
    }
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new StudentImportInputError("Student import form data is invalid.");
  }
  if (!request.body) {
    throw new StudentImportInputError("Student import form data is invalid.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > STUDENT_IMPORT_MAX_MULTIPART_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The bounded rejection is authoritative even if the source cannot be cancelled.
      }
      throw new StudentImportInputError("Student import requests must be 5 MB or smaller.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let form: FormData;
  try {
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
    form = await boundedRequest.formData();
  } catch {
    throw new StudentImportInputError("Student import form data is invalid.");
  }

  let partCount = 0;
  form.forEach(() => {
    partCount += 1;
    if (partCount > STUDENT_IMPORT_MAX_MULTIPART_PARTS) {
      throw new StudentImportInputError("Student import form data has too many parts.");
    }
  });
  return form;
}
