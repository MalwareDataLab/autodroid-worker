// Configuration import
import { ensureDockerImage } from "../ensureDockerImage";

export const INTEGRATION_IDLE_IMAGE = "alpine:latest";

// eslint-disable-next-line import/no-default-export
export default async function setup() {
  await ensureDockerImage(INTEGRATION_IDLE_IMAGE);
}
