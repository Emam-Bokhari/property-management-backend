import { Request, Response, NextFunction } from "express";
import { mapFilesToUrls, mapFileToUrl } from "./fileMapper";
import ApiError from "../../errors/ApiErrors";
import { IFolderName } from "./flieUploadHandler";

// types
interface FileFieldConfig {
  fieldName: IFolderName;
  mode?: "single" | "multiple" | "auto";
}

type FieldInput = IFolderName | FileFieldConfig;

type MulterFiles = {
  [key in IFolderName]?: Express.Multer.File[];
};

// normalizer
const normalizeField = (field: FieldInput) => {
  if (typeof field === "string") {
    return { fieldName: field, mode: "auto" as const };
  }

  return {
    fieldName: field.fieldName,
    mode: field.mode ?? "auto",
  };
};

// safe json parse (FIXED)
const safeJsonParse = (value: any) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(400, "Invalid JSON in body.data");
  }
};

// auto mode resolver
const resolveMode = (
  mode: "single" | "multiple" | "auto",
  fieldName: string,
  files?: Express.Multer.File[],
): "single" | "multiple" => {
  if (mode !== "auto") return mode;
  if (
    fieldName === "images" ||
    fieldName === "propertyPhotos" ||
    fieldName === "floorPlanPhotos" ||
    fieldName === "flatPhotos" ||
    fieldName === "otherDocuments" ||
    fieldName === "documents" ||
    fieldName === "inspectionPhotos" ||
    fieldName === "itemPhotos"
  ) {
    return "multiple";
  }
  return files && files.length <= 1 ? "single" : "multiple";
};

// main middleware
export const parseFileData = (...fields: FieldInput[]) => {
  const normalized = fields.map(normalizeField);

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files || {}) as MulterFiles;

      const fileData: Record<string, any> = {};

      let parsedBody: Record<string, unknown> = {};

      if (req.body?.data) {
        parsedBody = safeJsonParse(req.body.data);
      }

      // Parse JSON string fields in req.body or parsedBody if sent as form-data
      const jsonFieldsToParse = [
        "council",
        "parking",
        "compliance",
        "floorPlanPhotos",
        "flatPhotos",
        "houseRules",
        "otherDocuments",
        "documents",
        "titles",
        "key",
        "gas",
        "electricity",
        "water",
        "wifi",
        "safetyAlarms",
        "appliances",
        "roomChecklist",
      ];
      for (const f of jsonFieldsToParse) {
        if (typeof req.body?.[f] === "string") {
          try {
            req.body[f] = JSON.parse(req.body[f]);
          } catch {
            // Keep original string if not valid JSON
          }
        }
        if (typeof parsedBody[f] === "string") {
          try {
            parsedBody[f] = JSON.parse(parsedBody[f] as string);
          } catch {
            // Keep original string
          }
        }
      }

      // Alias image -> images if images is not explicitly set in parsedBody or req.body
      if (parsedBody.image !== undefined && parsedBody.images === undefined) {
        parsedBody.images = parsedBody.image;
      }
      if (req.body?.image !== undefined && req.body?.images === undefined) {
        req.body.images = req.body.image;
      }

      const effectiveNormalized =
        normalized.length > 0
          ? normalized
          : (Object.keys(files) as IFolderName[]).map((name) => ({
              fieldName: name,
              mode: "auto" as const,
            }));

      for (const { fieldName, mode } of effectiveNormalized) {
        let fieldFiles = files[fieldName];

        // Fallback for image / images field name mismatch
        if (
          (!fieldFiles || fieldFiles.length === 0) &&
          fieldName === "images"
        ) {
          fieldFiles = (files as any)["image"];
        }
        if ((!fieldFiles || fieldFiles.length === 0) && fieldName === "image") {
          fieldFiles = (files as any)["images"];
        }

        // Fallback for documentFront / nidFrontPic
        if (
          (!fieldFiles || fieldFiles.length === 0) &&
          fieldName === "documentFront"
        ) {
          fieldFiles = (files as any)["nidFrontPic"];
        }
        if (
          (!fieldFiles || fieldFiles.length === 0) &&
          fieldName === "documentBack"
        ) {
          fieldFiles = (files as any)["nidBackPic"];
        }

        if (!fieldFiles || fieldFiles.length === 0) continue;

        const resolvedMode = resolveMode(mode, fieldName, fieldFiles);

        const targetFolder: IFolderName = files[fieldName]
          ? fieldName
          : fieldName === "images"
            ? "image"
            : (fieldName as IFolderName);

        if (
          fieldName === "taxDocuments" ||
          fieldName === "insuranceHub" ||
          fieldName === "uploadedFiles"
        ) {
          // Special handling for taxDocuments, insuranceHub and uploadedFiles: create array of objects with fileUrl and fileName
          fileData[fieldName] = fieldFiles.map((file) => ({
            fileUrl: mapFileToUrl(file, targetFolder),
            fileName: file.originalname,
            uploadedAt: new Date(),
          }));
        } else if (resolvedMode === "single") {
          fileData[fieldName] = mapFileToUrl(fieldFiles[0]!, targetFolder);
        } else {
          const mapped = mapFilesToUrls(fieldFiles, targetFolder);
          fileData[fieldName] = Array.isArray(mapped) ? mapped : [mapped];
        }
      }

      // Certificate mapping fallback for compliance updates
      if (
        fileData.certificate ||
        fileData.certificateUrl ||
        fileData.complianceDocument ||
        fileData.file ||
        fileData.document ||
        fileData.otherDocuments ||
        fileData.documents
      ) {
        fileData.certificateUrl =
          fileData.certificateUrl ||
          fileData.certificate ||
          fileData.complianceDocument ||
          fileData.file ||
          fileData.document ||
          fileData.otherDocuments ||
          fileData.documents;
      }

      if (
        !req.body?.certificateUrl &&
        (req.body?.otherDocuments || req.body?.documents)
      ) {
        req.body.certificateUrl = req.body.otherDocuments || req.body.documents;
      }

      // If councilPhoto was uploaded and council object exists
      if (fileData.councilPhoto) {
        if (parsedBody.council && typeof parsedBody.council === "object") {
          (parsedBody.council as any).councilPhoto = fileData.councilPhoto;
        }
        if (req.body?.council && typeof req.body.council === "object") {
          req.body.council.councilPhoto = fileData.councilPhoto;
        }
      }

      // If parkingPhoto was uploaded and parking object exists
      if (fileData.parkingPhoto) {
        if (parsedBody.parking && typeof parsedBody.parking === "object") {
          (parsedBody.parking as any).parkingPhoto = fileData.parkingPhoto;
        }
        if (req.body?.parking && typeof req.body.parking === "object") {
          req.body.parking.parkingPhoto = fileData.parkingPhoto;
        }
      }

      // Merge taxDocuments data from parsedBody with file data
      if (fileData.taxDocuments && parsedBody.taxDocuments) {
        const taxDocsFromBody = Array.isArray(parsedBody.taxDocuments)
          ? parsedBody.taxDocuments
          : [];
        fileData.taxDocuments = fileData.taxDocuments.map(
          (doc: any, index: number) => ({
            ...doc,
            ...(taxDocsFromBody[index] || {}),
          }),
        );
        // Remove taxDocuments from parsedBody to avoid duplication
        delete parsedBody.taxDocuments;
      }

      // Merge insuranceHub data from parsedBody with file data
      if (fileData.insuranceHub && parsedBody.insuranceHub) {
        const insuranceHubFromBody = Array.isArray(parsedBody.insuranceHub)
          ? parsedBody.insuranceHub
          : [];
        fileData.insuranceHub = fileData.insuranceHub.map(
          (doc: any, index: number) => ({
            ...doc,
            ...(insuranceHubFromBody[index] || {}),
          }),
        );
        // Remove insuranceHub from parsedBody to avoid duplication
        delete parsedBody.insuranceHub;
      }

      // Merge uploadedFiles data from parsedBody with file data
      if (fileData.uploadedFiles && parsedBody.uploadedFiles) {
        const uploadedFilesFromBody = Array.isArray(parsedBody.uploadedFiles)
          ? parsedBody.uploadedFiles
          : [];
        fileData.uploadedFiles = fileData.uploadedFiles.map(
          (doc: any, index: number) => ({
            ...doc,
            ...(uploadedFilesFromBody[index] || {}),
          }),
        );
        // Remove uploadedFiles from parsedBody to avoid duplication
        delete parsedBody.uploadedFiles;
      }

      // Normalize single string images in parsedBody / req.body for multiple mode / images / propertyPhotos / floorPlanPhotos / flatPhotos
      for (const { fieldName, mode } of effectiveNormalized) {
        if (
          fieldName === "images" ||
          fieldName === "propertyPhotos" ||
          fieldName === "floorPlanPhotos" ||
          fieldName === "flatPhotos" ||
          fieldName === "otherDocuments" ||
          fieldName === "documents" ||
          fieldName === "inspectionPhotos" ||
          fieldName === "itemPhotos" ||
          mode === "multiple"
        ) {
          if (typeof parsedBody[fieldName] === "string") {
            parsedBody[fieldName] = [parsedBody[fieldName] as string];
          }
          if (typeof req.body?.[fieldName] === "string") {
            req.body[fieldName] = [req.body[fieldName] as string];
          }
        }
      }

      // Smart merge string array URLs (e.g. existing images from parsedBody/req.body + newly uploaded files)
      for (const key of Object.keys(fileData)) {
        let existing = parsedBody[key] ?? req.body?.[key];
        if (existing !== undefined && existing !== null) {
          const existingArray = Array.isArray(existing)
            ? existing
            : typeof existing === "string"
              ? [existing]
              : [];
          if (Array.isArray(fileData[key])) {
            const existingUrls = existingArray.filter(
              (url) => typeof url === "string" && url.trim().length > 0,
            );
            fileData[key] = [...existingUrls, ...fileData[key]];
          }
        }
      }

      req.body = {
        ...req.body,
        ...parsedBody,
        ...fileData,
      };

      // If council or parking was wrapped inside req.body.council/parking without top-level propertyName (sub-route update)
      if (
        req.body?.council &&
        typeof req.body.council === "object" &&
        !req.body.propertyName
      ) {
        req.body = { ...req.body.council, ...req.body };
      }
      if (
        req.body?.parking &&
        typeof req.body.parking === "object" &&
        !req.body.propertyName
      ) {
        req.body = { ...req.body.parking, ...req.body };
      }

      if (req.body.data) {
        delete req.body.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
