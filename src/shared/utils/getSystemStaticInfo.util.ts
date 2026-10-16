import si from "systeminformation";

let staticData: ReturnType<typeof si.getStaticData> | null = null;

export const getSystemStaticInfo = async () => {
  if (!staticData) staticData = si.getStaticData();
  const data = await staticData;
  return data;
};
