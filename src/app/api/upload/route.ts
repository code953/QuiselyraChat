import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { nanoid } from "nanoid";
import path from "path";
import { saveUpload, validateUploadFile, getFileCategory } from "@/lib/storage";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

// POST /api/upload —— 上传文件（multipart/form-data）
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return apiBadRequest("缺少文件字段 file");
    }

    const originalName = file instanceof File ? file.name : "upload";
    const size = file.size;

    // 验证文件类型和大小
    const validation = validateUploadFile(originalName, size);
    if (!validation.ok) {
      return apiBadRequest(validation.error!);
    }

    const category = getFileCategory(originalName)!;
    const ext = path.extname(originalName).toLowerCase();
    const uniqueName = `${nanoid()}${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await saveUpload(uniqueName, buffer);

    return NextResponse.json(
      {
        url: `/api/uploads/${uniqueName}`,
        name: originalName,
        size,
        type: category,
      },
      { status: 201 }
    );
  } catch {
    return apiServerError("上传失败");
  }
});
