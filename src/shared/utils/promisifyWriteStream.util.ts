import { WriteStream } from "node:fs";

const promisifyWriteStream = (stream: WriteStream): Promise<void> => {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};

export { promisifyWriteStream };
