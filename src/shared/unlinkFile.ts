import fs from "fs";
import path from "path";

const unlinkFile = (file?: string | null) => {
  if (!file) return;
  const cleanFile = file.replace(/^[/\\]?uploads[/\\]?/, "");
  const filePath = path.join(process.cwd(), "uploads", cleanFile);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore error if file cannot be removed
    }
  }
};

export default unlinkFile;
