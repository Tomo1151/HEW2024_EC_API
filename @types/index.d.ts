export type jsonResponse = {
  success: boolean;
  data: object;
};

export type BlobContainerName = "icon" | "post" | "product";
export type IMAGE_MIME_TYPE =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml";
