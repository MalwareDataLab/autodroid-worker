import crypto from "node:crypto";
import fs from "node:fs";

const calculateFileMD5 = (filePath: string) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("data", chunk => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      const md5 = hash.digest("hex");
      resolve(md5);
    });

    stream.on("error", error => {
      reject(error);
    });
  });
};

export { calculateFileMD5 };
