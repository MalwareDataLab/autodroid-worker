import si from "systeminformation";

// Static data does not change for the lifetime of the process, and collecting
// it is slow (seconds on some hosts). The worker signature is derived from it,
// so reusing one collection also keeps the signature stable across the
// registration, refresh-token and access-token calls of a single run.
let staticData: ReturnType<typeof si.getStaticData> | null = null;

export const getSystemStaticInfo = async () => {
  if (!staticData) staticData = si.getStaticData();
  const data = await staticData;
  return data;
};
