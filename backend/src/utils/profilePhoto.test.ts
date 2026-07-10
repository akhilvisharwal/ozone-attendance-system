import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { processProfilePhoto, PROFILE_PHOTO_MAX_BYTES } from "./profilePhoto";

async function makePng(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe("processProfilePhoto", () => {
  it("compresses PNG to WebP under 512px", async () => {
    const input = await makePng();
    const result = await processProfilePhoto({
      buffer: input,
      mimetype: "image/png",
      originalName: "avatar.png",
    });

    assert.equal(result.filename, "avatar.webp");
    assert.ok(result.buffer.length > 0);

    const meta = await sharp(result.buffer).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  });

  it("rejects unsupported mime types", async () => {
    const input = await makePng();
    await assert.rejects(
      () =>
        processProfilePhoto({
          buffer: input,
          mimetype: "image/gif",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /JPG, PNG, or WebP/i);
        return true;
      }
    );
  });

  it("rejects files larger than 2 MB", async () => {
    const huge = Buffer.alloc(PROFILE_PHOTO_MAX_BYTES + 1, 1);
    await assert.rejects(
      () =>
        processProfilePhoto({
          buffer: huge,
          mimetype: "image/jpeg",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /2 MB/i);
        return true;
      }
    );
  });
});
