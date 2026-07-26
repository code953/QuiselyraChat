import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { nanoid } from "nanoid";
import path from "path";
import {
  saveUpload,
  validateUploadFile,
  validateUploadContent,
  getFileCategory,
} from "@/lib/storage";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

/** 展示用文件名：去掉路径分量与控制字符，限制长度。 */
function sanitizeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || "upload";
  const cleaned = Array.from(base)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned.slice(0, 120) || "upload";
}

// POST /api/upload —— 上传文件（multipart/form-data）
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return apiBadRequest("缺少文件字段 file");
    }

    const originalName = sanitizeDisplayName(file instanceof File ? file.name : "upload");
    const size = file.size;

    // 先按名称与大小校验，避免为非法文件读取整个 body
    const validation = validateUploadFile(originalName, size);
    if (!validation.ok) {
      return apiBadRequest(validation.error!);
    }

    const category = getFileCategory(originalName)!;
    const ext = path.extname(originalName).toLowerCase();

    const buffer = Buffer.from(await file.arrayBuffer());

    // Blob.size 由客户端提供，落盘前用真实字节数复核一次
    const sizeRecheck = validateUploadFile(originalName, buffer.byteLength);
    if (!sizeRecheck.ok) {
      return apiBadRequest(sizeRecheck.error!);
    }

    // 图片需内容与扩展名一致，拒绝伪装文件
    const contentCheck = validateUploadContent(originalName, buffer);
    if (!contentCheck.ok) {
      return apiBadRequest(contentCheck.error!);
    }

    const uniqueName = `${nanoid()}${ext}`;
    await saveUpload(uniqueName, buffer);

    return NextResponse.json(
      {
        url: `/api/uploads/${uniqueName}`,
        name: originalName,
        size: buffer.byteLength,
        type: category,
      },
      { status: 201 }
    );
  } catch {
    return apiServerError("上传失败");
  }
});
