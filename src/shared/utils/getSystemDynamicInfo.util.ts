import si from "systeminformation";

export const getSystemDynamicInfo = async () => {
  const data = await si.getDynamicData();
  return data;
};
