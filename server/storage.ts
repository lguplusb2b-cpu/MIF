import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const required = ["S3_REGION", "S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

export function isStorageConfigured() {
  return required.every((key) => Boolean(process.env[key]));
}

function client() {
  if (!isStorageConfigured()) throw new Error("MIF S3 저장소 환경 변수가 설정되지 않았습니다.");
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
}

export async function putPrivateDocument(file: Express.Multer.File, folder: "business-registration" | "product-images") {
  const extension = file.originalname.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const key = `mif/${folder}/${randomUUID()}.${extension}`;
  await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }));
  return { key, originalName: file.originalname, mimeType: file.mimetype, size: file.size };
}
