import * as exp from "node:constants";

export type jsonResponse = {
  success: boolean;
  data: object;
};

export type BlobContainerName = "icon" | "post" | "product";
export type IMAGE_MIME_TYPE =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export type PRODUCT_DATA_TYPE =
  | "application/zip"
  | "application/x-zip-compressed"
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export type Notification = {
  type: number;
  relPostId?: string;
  senderId: string;
  recepientId: string;
  content?: string;
};
