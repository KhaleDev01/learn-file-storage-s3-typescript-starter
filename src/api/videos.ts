import { respondWithJSON } from "./json";

import { randomBytes } from "crypto";
import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { unlink } from "fs/promises";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  console.log("uploading video:", videoId, "by user:", userID);

  const metadata = getVideo(cfg.db, videoId);
  if (!metadata) {
    throw new BadRequestError("video not found");
  }
  if (metadata.userID !== userID) {
    throw new UserForbiddenError(
      "you dont have the permission to upload this video",
    );
  }
  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("video file is missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("file is too large");
  }
  if (file.type !== "video/mp4") {
    throw new BadRequestError("only MP4 videos are supported");
  }
  const tmpPath = `${cfg.assetsRoot}/tmp_${randomBytes(32).toString("hex")}.mp4`;
  try {
    await Bun.write(tmpPath, await file.arrayBuffer());
    const extension = "mp4";
    const randomName = randomBytes(32).toString("hex");
    const s3Key = `${randomName}.${extension}`;
    const s3File = cfg.s3Client.file(s3Key);
    await s3File.write(Bun.file(tmpPath), {
      type: file.type,
    });
    const s3URL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${s3Key}`;
    metadata.videoURL = s3URL;
    updateVideo(cfg.db, metadata);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
  return respondWithJSON(200, metadata);
}
