export type EncodedFileUpload = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export const SUPPORTED_UPLOAD_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.zip,.doc,.docx";

export async function encodeFileForUpload(file: File): Promise<EncodedFileUpload> {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("File exceeds the 12 MB institutional upload limit.");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const contentBase64 = window.btoa(binary);
  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    contentBase64,
  };
}
