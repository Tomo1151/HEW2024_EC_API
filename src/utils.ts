import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";

import * as crypto from "crypto";

import {
  BlobDownloadResponseParsed,
  BlobServiceClient,
  BlockBlobClient,
  BlockBlobUploadResponse,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

import { BlobContainerName } from "../@types";

// MARK: 定数
if (
  !process.env.ACCOUNT_NAME ||
  !process.env.ACCOUNT_KEY ||
  !process.env.USER_ICON_CONTAINER_NAME ||
  !process.env.POST_IMAGE_CONTAINER_NAME ||
  !process.env.PRODUCT_DATA_CONTAINER_NAME
) {
  console.error("環境変数が設定されていません");
  process.exit(1);
}

const ACCOUNT_NAME: string = process.env.ACCOUNT_NAME;
const ACCOUNT_KEY: string = process.env.ACCOUNT_KEY;
const USER_ICON_CONTAINER_NAME: string = process.env.USER_ICON_CONTAINER_NAME;
const POST_IMAGE_CONTAINER_NAME: string = process.env.POST_IMAGE_CONTAINER_NAME;
const PRODUCT_DATA_CONTAINER_NAME: string =
  process.env.PRODUCT_DATA_CONTAINER_NAME;

const CONTAINER_NAME: { icon: string; post: string; product: string } = {
  icon: USER_ICON_CONTAINER_NAME,
  post: POST_IMAGE_CONTAINER_NAME,
  product: PRODUCT_DATA_CONTAINER_NAME,
};

export async function getUserIdFromCookie(c: Context): Promise<string> {
  if (!(process.env.ACCESS_TOKEN_NAME && process.env.REFRESH_TOKEN_NAME)) {
    throw new Error("JWT cookie name isn't defined");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET_KEY is not set");
  }

  const token = getCookie(c, process.env.ACCESS_TOKEN_NAME);

  if (!token) return "";
  try {
    const decoded = await verify(token, process.env.JWT_SECRET, "HS256");

    if (!decoded.sub) return "";

    if (!decoded) return "";
    return decoded.sub as string;
  } catch (error) {
    return "";
  }
}

export async function deleteBlobByName({
  targetContainer,
  blobName,
}: {
  targetContainer: BlobContainerName;
  blobName: string | null;
}): Promise<boolean> {
  if (!blobName) return true;

  try {
    // StorageSharedKeyCredentialを作成
    const sharedKeyCredential: StorageSharedKeyCredential =
      new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);

    //   BlobServiceClientを作成
    const blobServiceClient: BlobServiceClient = new BlobServiceClient(
      `https://${ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential
    );

    // コンテナクライアントを取得
    const containerClient: ContainerClient =
      blobServiceClient.getContainerClient(CONTAINER_NAME[targetContainer]);

    // Blob名を指定
    const blockBlobClient: BlockBlobClient =
      containerClient.getBlockBlobClient(blobName);

    //blobを削除
    const deleteBlockBlobResponse = await blockBlobClient.delete({
      deleteSnapshots: "include",
    });

    console.log(
      `Delete block blob ${blobName} successfully`,
      deleteBlockBlobResponse.requestId
    );

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function uploadBlobData({
  targetContainer,
  file,
}: {
  targetContainer: BlobContainerName;
  file: File;
}): Promise<string> {
  const fileData: ArrayBuffer = await file.arrayBuffer();

  // StorageSharedKeyCredentialを作成
  const sharedKeyCredential: StorageSharedKeyCredential =
    new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);

  //   BlobServiceClientを作成
  const blobServiceClient: BlobServiceClient = new BlobServiceClient(
    `https://${ACCOUNT_NAME}.blob.core.windows.net`,
    sharedKeyCredential
  );

  // コンテナクライアントを取得
  const containerClient: ContainerClient = blobServiceClient.getContainerClient(
    CONTAINER_NAME[targetContainer]
  );

  // Blob名を指定
  const blobName: string = `${crypto.randomUUID()}-${file.name}`;
  const blockBlobClient: BlockBlobClient =
    containerClient.getBlockBlobClient(blobName);

  // Blobコンテナにデータをアップロード
  const uploadBlobResponse: BlockBlobUploadResponse =
    await blockBlobClient.upload(fileData, Buffer.byteLength(fileData));

  console.log(
    `Upload block blob ${blobName} successfully`,
    uploadBlobResponse.requestId
  );

  return blobName;
}

export async function downloadBlobByName({
  targetContainer,
  blobName,
}: {
  targetContainer: BlobContainerName;
  blobName: string;
}): Promise<Buffer> {
  // StorageSharedKeyCredentialを作成
  const sharedKeyCredential: StorageSharedKeyCredential =
    new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);

  // BlobServiceClientを作成
  const blobServiceClient: BlobServiceClient = new BlobServiceClient(
    `https://${ACCOUNT_NAME}.blob.core.windows.net`,
    sharedKeyCredential
  );

  // コンテナクライアントを取得
  const containerClient: ContainerClient = blobServiceClient.getContainerClient(
    CONTAINER_NAME[targetContainer]
  );

  // Blob名を指定
  const blockBlobClient: BlockBlobClient =
    containerClient.getBlockBlobClient(blobName);

  //blobからデータをダウンロード
  const downloadBlockBlobResponse: BlobDownloadResponseParsed =
    await blockBlobClient.download(0);

  if (!downloadBlockBlobResponse.readableStreamBody) {
    throw new Error("blob download failed");
  }

  return await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);

  function streamToBuffer(
    readableStream: NodeJS.ReadableStream
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      readableStream.on("data", (data) => {
        const content: Buffer =
          data instanceof Buffer ? data : Buffer.from(data);
        chunks.push(content);
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on("error", reject);
    });
  }
}
