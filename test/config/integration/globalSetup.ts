import { ensureDockerImage } from "../ensureDockerImage";

// `processing.service.test.ts` creates an idle container from this image.
export const INTEGRATION_IDLE_IMAGE = "alpine:latest";

// eslint-disable-next-line import/no-default-export
export default async function setup() {
  await ensureDockerImage(INTEGRATION_IDLE_IMAGE);
}
