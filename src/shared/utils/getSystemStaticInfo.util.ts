import si from "systeminformation";

export const getSystemStaticInfo = async () => {
  const data = await si.getStaticData();
  return data;
};
