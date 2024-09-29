import si from "systeminformation";

export const getSystemStaticInfo = async () => {
  const data = await si.getDynamicData();
  return data;
};
