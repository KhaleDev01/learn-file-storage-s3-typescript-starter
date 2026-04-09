import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { File } from "buffer";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

// const videoThumbnails: Map<string, Thumbnail> = new Map();

// export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
//   const { videoId } = req.params as { videoId?: string };
//   if (!videoId) {
//     throw new BadRequestError("Invalid video ID");
//   }

//   const video = getVideo(cfg.db, videoId);
//   if (!video) {
//     throw new NotFoundError("Couldn't find video");
//   }

//   const thumbnail = videoThumbnails.get(videoId);
//   if (!thumbnail) {
//     throw new NotFoundError("Thumbnail not found");
//   }

//   return new Response(thumbnail.data, {
//     headers: {
//       "Content-Type": thumbnail.mediaType,
//       "Cache-Control": "no-store",
//     },
//   });
// }

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  // TODO: implement the upload here
  const formData = await req.formData();
  const file = formData.get("thumbnail");
  const MAX_UPLOAD_SIZE = 10 << 20;
  if (!(file instanceof File)) {
    throw new BadRequestError("thumbnail file missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("file is too large");
  }
  const mediaType = file.type;
  const imageData = await file.arrayBuffer();
  const metadata = getVideo(cfg.db, videoId);
  if (!metadata) {
    throw new BadRequestError("video not found");
  }
  if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
    throw new BadRequestError("only upload jpeg or png");
  }
  const buffer = Buffer.from(imageData);
  const extension = mediaType.split("/")[1];
  const filePath = `${cfg.assetsRoot}/${videoId}.${extension}`;
  await Bun.write(filePath, buffer);

  if (metadata?.userID !== userID) {
    throw new UserForbiddenError("O you dont have the right");
  }

  metadata.thumbnailURL = `http://localhost:${cfg.port}/assets/${videoId}.${extension}`;
  updateVideo(cfg.db, metadata);

  return respondWithJSON(200, metadata);
}
